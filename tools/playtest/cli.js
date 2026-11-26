#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { startIsolatedServer } = require('./server_manager');
const { createWsDriver } = require('./engine_driver');
const { driveBirthToPlay, chooseBirthKey } = require('./bot/birth_driver');
const { YendorBot, driveWizardEndgame } = require('./bot/yendor_bot');
const { PLAYBOOKS, LOCAL_WORKER_REALMS, resolveTargets } = require('./bot/playbooks');
const { ProtocolOracle } = require('./oracles/protocol_oracle');
const { verifySaveReloadAndOwnerGuard } = require('./oracles/save_oracle');
const { openBrowserSession } = require('./cdp/browser_driver');
const { GraphicsOracle } = require('./oracles/graphics_oracle');
const { UiOracle } = require('./oracles/ui_oracle');
const { AudioChronicleOracle } = require('./oracles/audio_chronicle_oracle');
const { TapeRecorder, replayTape } = require('./replay/tape_recorder');
const { minimizeFailureTape } = require('./replay/minimizer');
const { TriageReporter } = require('./report/triage_reporter');

function parseArgs(argv) {
    const opts = {
        lane: 'all',
        realm: 'all',
        session: 'both',
        engine: 'both',
        renderer: 'both',
        viewport: 'desktop',
        seed: 133701,
        turns: null,
        concurrency: 4,
        replay: null,
        minimize: false,
        allowSoftwareGl: false,
        liveAi: false,
        out: null
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        const next = () => (i + 1 < argv.length ? argv[++i] : '');
        if (a === '--lane') opts.lane = next();
        else if (a === '--realm') opts.realm = next();
        else if (a === '--session') opts.session = next();
        else if (a === '--engine') opts.engine = next();
        else if (a === '--renderer') opts.renderer = next();
        else if (a === '--viewport') opts.viewport = next();
        else if (a === '--seed') opts.seed = parseInt(next(), 10) || 133701;
        else if (a === '--turns') opts.turns = parseInt(next(), 10) || null;
        else if (a === '--concurrency') opts.concurrency = Math.max(1, parseInt(next(), 10) || 1);
        else if (a === '--replay') opts.replay = next();
        else if (a === '--minimize') opts.minimize = true;
        else if (a === '--allow-software-gl') opts.allowSoftwareGl = true;
        else if (a === '--live-ai') opts.liveAi = true;
        else if (a === '--out') opts.out = next();
    }
    return opts;
}

async function runPool(items, concurrency, fn) {
    const results = new Array(items.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (idx < items.length) {
            const myIdx = idx++;
            results[myIdx] = await fn(items[myIdx], myIdx);
        }
    });
    await Promise.all(workers);
    return results;
}

function isPlayerDead(frame, realm) {
    if (!frame || !frame.player) return false;
    if (frame.player.dead) return true;
    const isCEngine = ['angband', 'silq', 'frogcomposband', 'hengband'].includes(realm);
    return frame.player.hp_max > 0 && (isCEngine ? frame.player.hp < 0 : frame.player.hp <= 0);
}

async function runHeadlessTargetSession({ pb, sessionKind, server, runDir, seed, turnsOverride, minimize }) {
    const realm = pb.realm;
    const lang = pb.lang;
    const targetId = pb.targetId;
    const maxTurns = turnsOverride || (sessionKind === 'a' ? pb.sessionATurns : pb.sessionBTurns);
    const user = `PT_${targetId.replace(/[^a-z0-9]/gi, '')}_${sessionKind}_${seed}`;
    const tapePath = path.join(runDir, 'tapes', `${targetId}_session${sessionKind.toUpperCase()}_seed${seed}.jsonl`);
    const tape = new TapeRecorder(tapePath, { realm, lang, targetId, session: sessionKind, seed, transport: 'ws' });

    const oracle = new ProtocolOracle(realm, lang);
    const issues = [];
    const milestones = new Set();
    let driver = null;
    let maxDepth = 0;
    let turnsExecuted = 0;
    let status = 'PASS';

    try {
        driver = await createWsDriver({
            wsUrl: server.wsUrl,
            realm,
            lang,
            user,
            isNew: true,
            seed,
            timeoutMs: 15000
        });

        issues.push(...oracle.validateFrame(driver.frame, driver.rawFrame));

        // Birth to play
        try {
            const birthRes = await driveBirthToPlay(driver, { realm, lang, maxSteps: 45 });
            for (const bk of birthRes.steps) {
                tape.recordStep({ phase: 'birth', key: bk, depth: 0, overlay: 1 });
            }
            milestones.add('birth');
            if (driver.frame && driver.frame.seq > oracle.prevSeq) {
                issues.push(...oracle.validateFrame(driver.frame, driver.rawFrame));
            }
        } catch (err) {
            issues.push({
                severity: err.code === 'P0_BIRTH_SOFTLOCK' ? 'P0' : 'P0',
                realm: targetId,
                subsystem: 'birth',
                code: err.code || 'P0_BIRTH_FAIL',
                message: err.message
            });
            status = 'FAIL';
            return { targetId, realm, lane: 'headless', session: sessionKind.toUpperCase(), engine: 'ws', renderer: '-', status, turns: 0, maxDepth, milestones: Array.from(milestones), issues, bugCount: issues.length, tapePath };
        }

        // Verify Protocol v1.3 dirty-row delta parity for Tier-1 C engines
        if (sessionKind === 'a') {
            const deltaRes = await oracle.verifyDeltaParity(driver);
            issues.push(...deltaRes.issues);
            if (!deltaRes.skipped && deltaRes.issues.length === 0) {
                milestones.add('delta_v1_3');
            }
        }

        // Session B on Tier-1 C: probe wizard mode and deep biome
        if (sessionKind === 'b' && pb.tier === 1) {
            const wizRes = await driveWizardEndgame(driver, realm, lang);
            issues.push(...wizRes.issues);
            if (wizRes.supported) milestones.add('wizard_on');
            if (wizRes.jumpedDepth) milestones.add(`wizard_d${wizRes.depthReached}`);
            else if (wizRes.reason) milestones.add(wizRes.reason);
        }

        const botMode = sessionKind === 'b' && pb.tier === 2 ? 'dive' : 'crawl';
        const bot = new YendorBot({
            realm,
            lang,
            seed,
            mode: botMode,
            allowDieYes: sessionKind === 'b' && pb.tier === 1
        });

        const saveAtTurn = sessionKind === 'a' ? Math.min(35, Math.floor(maxTurns * 0.35)) : -1;
        const deathAtTurn = sessionKind === 'a' ? Math.floor(maxTurns * 0.65) : -1;
        let savedOnce = false;

        for (let t = 0; t < maxTurns; t++) {
            const frame = driver.frame;
            if (!frame) break;

            if (frame.player && typeof frame.player.depth === 'number' && frame.player.depth > maxDepth) {
                maxDepth = frame.player.depth;
            }
            if (maxDepth >= 1) milestones.add('descend');
            if (frame.victory || frame.player?.winner) {
                milestones.add('LEGIT_VICTORY');
                break;
            }
            if (isPlayerDead(frame, realm)) {
                milestones.add('dead');
                break;
            }

            // Realm-specific mechanic checks
            if (realm === 'brogue' && frame.player && frame.player.level === 0) {
                milestones.add('brogue_zero_xp');
            }
            if (realm === 'rogue' && frame.player && typeof frame.player.arm === 'number') {
                milestones.add('rogue_arm_ac');
            }

            // Save -> quit -> reload oracle checkpoint mid-Session A
            if (sessionKind === 'a' && !savedOnce && t === saveAtTurn && frame.phase === 'play' && frame.ui?.awaiting_command && (frame.ui?.overlay || 0) === 0) {
                savedOnce = true;
                const preFrame = JSON.parse(JSON.stringify(frame));
                const ownerToken = driver.ownerToken;
                const saveKey = realm === 'nethack' || realm === 'dcss' || realm === 'brogue' || realm === 'rogue' || realm === 'ryod' ? 'S' : 'C-s';
                tape.recordStep({ step: t, key: saveKey, reason: 'save_checkpoint', depth: frame.player?.depth, x: frame.player?.x, y: frame.player?.y });
                await driver.sendKey(saveKey, 8000).catch(() => {});
                if (driver.screenContains('[y/n]') || driver.screenContains('(y/n)') || driver.screenContains('really save')) {
                    await driver.sendKey('y', 6000).catch(() => {});
                }
                const quitClose = driver.close;
                await quitClose();
                driver = null;
                await new Promise((r) => setTimeout(r, 450));

                const saveRes = await verifySaveReloadAndOwnerGuard({
                    wsUrl: server.wsUrl,
                    saveDir: server.saveDir,
                    realm,
                    lang,
                    user,
                    ownerToken,
                    preFrame,
                    isTier1C: pb.tier === 1
                });
                issues.push(...saveRes.issues);
                if (saveRes.ok) milestones.add('save_reload_4403');

                // Reopen to continue Session A toward natural death
                oracle.resetSeq();
                driver = await createWsDriver({ wsUrl: server.wsUrl, realm, lang, user, save: user, isNew: false, ownerToken, timeoutMs: 15000 });
                for (let k = 0; k < 6 && driver.frame && (driver.frame.ui?.more || driver.frame.phase !== 'play'); k++) {
                    await driver.sendKey('enter', 6000).catch(() => {});
                }
                continue;
            }

            if (sessionKind === 'a' && t === deathAtTurn) {
                bot.mode = 'death';
            }

            const act = bot.chooseAction(frame);
            if (act.stuck) {
                issues.push({
                    severity: act.stuck.code.startsWith('P0') ? 'P0' : 'P1',
                    realm: targetId,
                    subsystem: 'bot_oracle',
                    code: act.stuck.code,
                    message: act.stuck.message
                });
                break;
            }

            tape.recordStep({
                step: t,
                seq: frame.seq,
                key: act.key,
                isKeys: Boolean(act.isKeys),
                reason: act.reason,
                depth: frame.player?.depth,
                x: frame.player?.x,
                y: frame.player?.y,
                hp: frame.player?.hp,
                overlay: frame.ui?.overlay || 0
            });

            const nextFrame = act.isKeys
                ? await driver.sendKeys(act.key, 8000)
                : await driver.sendKey(act.key, 8000);
            turnsExecuted++;

            if (act.reason && !['explore_frontier', 'random_walkable_step', 'melee_adjacent', 'dismiss_more'].includes(act.reason)) {
                if (act.reason.includes('store')) milestones.add('store');
                if (act.reason.includes('inven') || act.reason.includes('equip') || act.reason.includes('char_sheet')) milestones.add('menus');
                if (act.reason.includes('silq_') || act.reason.includes('nethack_') || act.reason.includes('dcss_') || act.reason.includes('rogue_') || act.reason.includes('variant_') || act.reason.includes('ryod_')) {
                    milestones.add(act.reason);
                }
            }

            issues.push(...oracle.validateFrame(nextFrame, driver.rawFrame));
        }

        if (driver && driver.errors.length > 0) {
            for (const e of driver.errors) {
                issues.push({ severity: 'P0', realm: targetId, subsystem: 'engine_driver', code: 'P0_DRIVER_ERROR', message: e.message || JSON.stringify(e) });
            }
        }
    } catch (err) {
        issues.push({
            severity: 'P0',
            realm: targetId,
            subsystem: 'headless_runner',
            code: err.code || 'P0_HEADLESS_CRASH',
            message: err.message
        });
    } finally {
        if (driver) {
            try { await driver.close(); } catch (_) {}
        }
    }

    // Tag realm-attributed issues cleanly
    for (const iss of issues) {
        if (!iss.realm || iss.realm === realm) iss.realm = targetId;
    }

    const hasP0P1 = issues.some((i) => i.severity === 'P0' || i.severity === 'P1');
    status = hasP0P1 ? 'FAIL' : 'PASS';

    const reproMap = {};
    if (minimize && issues.length > 0) {
        const firstCritical = issues.find((i) => i.severity === 'P0' || i.severity === 'P1') || issues[0];
        if (firstCritical) {
            const outRepro = path.join(runDir, 'repros', `${targetId}_s${sessionKind}_${firstCritical.code}.jsonl`);
            const minRes = await minimizeFailureTape(tapePath, firstCritical.code, outRepro, { wsUrl: server.wsUrl });
            reproMap[firstCritical.code] = minRes;
        }
    }

    return {
        targetId,
        realm,
        lane: 'headless',
        session: sessionKind.toUpperCase(),
        engine: 'ws',
        renderer: '-',
        status,
        turns: turnsExecuted,
        maxDepth,
        milestones: Array.from(milestones),
        issues,
        bugCount: issues.length,
        tapePath,
        reproMap
    };
}

async function runBrowserTarget({ pb, engineMode, rendererMode, viewportMode, server, runDir, seed, turnsOverride, allowSoftwareGl, liveAi }) {
    const realm = pb.realm;
    const lang = pb.lang;
    const targetId = pb.targetId;
    const expectV2 = rendererMode !== 'v1';
    const maxTurns = turnsOverride || pb.cdpTurns;
    const user = `PTB_${targetId.replace(/[^a-z0-9]/gi, '')}_${engineMode[0]}_${rendererMode}_${seed}`;
    const flagStr = expectV2 ? '' : '&flag_RENDERER_THREE_V2=0';
    const url = `${server.baseUrl}/?play=1&new=1&realm=${encodeURIComponent(realm)}&lang=${encodeURIComponent(lang)}&char=${encodeURIComponent(user)}&seed=${seed}&engine=${engineMode}${flagStr}`;

    const isMobile = viewportMode === 'mobile';
    const gfxOracle = new GraphicsOracle({ realm: targetId, expectV2, allowSoftwareGl });
    const uiOracle = new UiOracle({ realm: targetId, lang });
    const acOracle = new AudioChronicleOracle({
        realm: targetId,
        lang,
        forbiddenChronicleTerms: pb.forbiddenChronicleTerms,
        baseUrl: server.baseUrl
    });

    const issues = [];
    const milestones = new Set();
    let browser = null;
    let maxDepth = 0;
    let turns = 0;
    let lastScreenshot = null;

    try {
        browser = await openBrowserSession(url, {
            width: isMobile ? 390 : 1280,
            height: isMobile ? 844 : 800,
            mobile: isMobile
        });

        // Wait up to 35s for inPlay; let client stepQuickBirth drive automatically, nudging only if stalled > 1.2s
        let snap = null;
        let lastSetupSig = '';
        let setupStallTicks = 0;
        const browserBirthState = { silqStatAllocated: false, silqNameSent: false, fcbRandomized: false };
        for (let attempt = 0; attempt < 85; attempt++) {
            await new Promise((r) => setTimeout(r, 400));
            snap = await browser.snapshot();
            if (!snap) continue;
            if (snap.isBirthReview) {
                const embarkRes = await browser.clickSelector('#btn-review-embark').catch(() => ({ ok: false }));
                if (!embarkRes || !embarkRes.ok) {
                    await browser.pressKey('enter');
                }
                setupStallTicks = 0;
                continue;
            }
            if (snap.inPlay && snap.frame && snap.frame.phase === 'play') {
                milestones.add('browser_play');
                break;
            }
            const rawFrame = await browser.evaluate(`window.__app?.lastFrame || null`);
            if (rawFrame && rawFrame.phase !== 'play') {
                const sig = `${rawFrame.seq || 0}:${rawFrame.phase}`;
                if (sig === lastSetupSig) setupStallTicks++;
                else { lastSetupSig = sig; setupStallTicks = 0; }
                if (setupStallTicks >= 2) {
                    setupStallTicks = 0;
                    const nextKey = chooseBirthKey(rawFrame, browserBirthState, { realm, lang });
                    if (Array.isArray(nextKey)) {
                        for (const k of nextKey) await browser.pressKey(k);
                    } else {
                        await browser.pressKey(nextKey);
                    }
                }
            }
        }

        if (!snap || !snap.inPlay) {
            issues.push({
                severity: 'P0',
                realm: targetId,
                subsystem: 'browser_boot',
                code: 'P0_BROWSER_BOOT_TIMEOUT',
                message: `Browser (${engineMode}/${rendererMode}) did not enter play phase within 20s`
            });
            lastScreenshot = await browser.capturePng(path.join(runDir, 'screenshots', `${targetId}_${engineMode}_${rendererMode}_boot_fail.png`));
            return { targetId, realm, lane: 'cdp', session: viewportMode, engine: engineMode, renderer: rendererMode, status: 'FAIL', turns: 0, maxDepth, milestones: Array.from(milestones), issues, bugCount: issues.length, screenshotPath: lastScreenshot };
        }

        // Verify local engine mode did NOT silently fall back to cloud!
        if (engineMode === 'local') {
            if (snap.engineMode !== 'local' || (snap.probe?.wasmFallbackEvents || []).length > 0) {
                issues.push({
                    severity: 'P0',
                    realm: targetId,
                    subsystem: 'local_worker',
                    code: 'P0_SILENT_CLOUD_FALLBACK',
                    message: `Requested engine=local but active mode="${snap.engineMode}", fallbacks=${JSON.stringify(snap.probe?.wasmFallbackEvents || [])}`
                });
            } else {
                milestones.add('local_0ms_verified');
            }
        }

        // Wait for #loading-overlay curtain to finish hiding before taking Turn-0 screenshot and running visual oracles
        for (let lw = 0; lw < 38; lw++) {
            snap = await browser.snapshot();
            if (snap && !snap.dom?.loadingVisible && snap.dom?.canvasRect?.vis) break;
            await new Promise((r) => setTimeout(r, 400));
        }

        // Capture Turn-0 screenshot + PNG pixel baseline
        const turn0Path = path.join(runDir, 'screenshots', `${targetId}_${engineMode}_${rendererMode}_turn0.png`);
        const turn0Sample = await browser.sampleViewportPng(turn0Path);
        lastScreenshot = turn0Path;

        issues.push(...gfxOracle.auditSnapshot(snap, { pngSample: turn0Sample }));
        issues.push(...uiOracle.auditSnapshot(snap));
        issues.push(...acOracle.auditSnapshot(snap));

        // 7-channel input matrix on desktop Cloud primary pass
        if (!isMobile && engineMode === 'cloud' && expectV2) {
            const matRes = await uiOracle.run7ChannelMatrix(browser);
            issues.push(...matRes.issues);
            milestones.add(`channels:${matRes.channelsTested.length}/7`);
        }

        // Drive real CDP keyboard turns & camera rotations
        const moveKeys = ['right', 'down', 'left', 'up', 'e', 'q'];
        for (let t = 0; t < maxTurns; t++) {
            await browser.resetTurnCounters();
            const cur = await browser.snapshot();
            if (!cur || !cur.frame) break;
            if (cur.frame.player && cur.frame.player.depth > maxDepth) maxDepth = cur.frame.player.depth;
            if (cur.frame.player && cur.frame.player.dead) {
                milestones.add('death_modal_check');
                if (!cur.dom?.deathModalVisible) {
                    issues.push({ severity: 'P1', realm: targetId, subsystem: 'ui', code: 'P1_DEATH_MODAL_HIDDEN', message: 'Player died in browser but #death-modal did not open' });
                }
                break;
            }

            const prevSeq = cur.frame.seq || 0;
            let keyToSend = moveKeys[t % moveKeys.length];
            if (cur.frame.ui?.more) keyToSend = 'enter';
            else if ((cur.frame.ui?.overlay || 0) > 0 || !cur.frame.ui?.awaiting_command) keyToSend = 'escape';

            const isCameraYaw = (keyToSend === 'e' || keyToSend === 'q');
            await browser.pressKey(keyToSend);
            if (!isCameraYaw) {
                await browser.waitFrameAdvance(prevSeq, 3500);
            } else {
                await new Promise((r) => setTimeout(r, 120));
            }
            turns++;

            const after = await browser.snapshot();
            const pngSample = (t % 8 === 7 || t === maxTurns - 1) ? await browser.sampleViewportPng() : null;
            issues.push(...gfxOracle.auditSnapshot(after, { movedIn3d: true, pngSample }));
            issues.push(...uiOracle.auditSnapshot(after, { idleTurn: !isCameraYaw && (after?.frame?.ui?.overlay || 0) === 0 }));
            issues.push(...acOracle.auditSnapshot(after));
        }

        // Chronicle & TTS verification
        const acExtra = await acOracle.verifyChronicleAndTtsEndpoint(browser, liveAi);
        issues.push(...acExtra);
        if (acOracle.chronicleChecked) milestones.add('chronicle');

        // Local IndexedDB Page.reload() persistence test
        if (engineMode === 'local') {
            await browser.pressKey(realm === 'angband' ? 'C-s' : 'S');
            await new Promise((r) => setTimeout(r, 500));
            await browser.reloadPage();
            await new Promise((r) => setTimeout(r, 2000));
            const reloaded = await browser.snapshot();
            if (reloaded && reloaded.engineMode === 'local') {
                milestones.add('idb_reload_ok');
            }
        }

        // Hengband JP live EN<->JP toggle test
        if (targetId === 'hengband_jp' && expectV2) {
            const langRes = await browser.evaluate(`(() => {
                if (!window.__app || !window.__app.toggleLanguageMode) return null;
                const before = window.__app.getLanguageMode();
                window.__app.toggleLanguageMode();
                const after = window.__app.getLanguageMode();
                window.__app.toggleLanguageMode();
                return { before, after };
            })()`);
            if (langRes && langRes.before !== langRes.after) {
                milestones.add('lang_toggle');
            } else {
                issues.push({ severity: 'P1', realm: targetId, subsystem: 'i18n', code: 'P1_HENG_LANG_TOGGLE_FAIL', message: 'toggleLanguageMode did not switch EN/JP' });
            }
        }

        lastScreenshot = await browser.capturePng(path.join(runDir, 'screenshots', `${targetId}_${engineMode}_${rendererMode}_end.png`));
    } catch (err) {
        issues.push({
            severity: 'P0',
            realm: targetId,
            subsystem: 'cdp_runner',
            code: 'P0_CDP_RUNNER_CRASH',
            message: err.message
        });
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
    }

    const hasP0P1 = issues.some((i) => i.severity === 'P0' || i.severity === 'P1');
    return {
        targetId,
        realm,
        lane: 'cdp',
        session: viewportMode,
        engine: engineMode,
        renderer: rendererMode,
        status: hasP0P1 ? 'FAIL' : 'PASS',
        turns,
        maxDepth,
        milestones: Array.from(milestones),
        issues,
        bugCount: issues.length,
        screenshotPath: lastScreenshot
    };
}

async function main() {
    const opts = parseArgs(process.argv);

    if (opts.replay) {
        const res = await replayTape(opts.replay, { seed: opts.seed });
        console.log(JSON.stringify(res, null, 2));
        process.exit(res.issues.length ? 1 : 0);
    }

    const targets = resolveTargets(opts.realm);
    if (targets.length === 0) {
        console.error(`No valid realms matched: ${opts.realm}`);
        process.exit(1);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = opts.out || path.resolve(__dirname, 'runs', stamp);
    const reporter = new TriageReporter(runDir);
    const server = await startIsolatedServer();

    console.log(`[Playtest] Isolated server ready at ${server.baseUrl} (SAVE_DIR=${server.saveDir})`);
    console.log(`[Playtest] Targets (${targets.length}): ${targets.join(', ')} | Lane=${opts.lane} | Seed=${opts.seed}`);

    try {
        // Lane 1: Headless Engine Soak
        if (opts.lane === 'all' || opts.lane === 'headless') {
            const jobs = [];
            for (const tid of targets) {
                const pb = PLAYBOOKS[tid];
                if (opts.session === 'both' || opts.session === 'a') jobs.push({ pb, sessionKind: 'a' });
                if (opts.session === 'both' || opts.session === 'b') jobs.push({ pb, sessionKind: 'b' });
            }
            console.log(`\n[Lane 1: Headless] Running ${jobs.length} sessions (concurrency=${opts.concurrency})...`);
            const results = await runPool(jobs, opts.concurrency, async (job) => {
                const r = await runHeadlessTargetSession({
                    pb: job.pb,
                    sessionKind: job.sessionKind,
                    server,
                    runDir,
                    seed: opts.seed,
                    turnsOverride: opts.turns,
                    minimize: opts.minimize
                });
                console.log(`  [L1] ${r.targetId.padEnd(14)} S:${r.session} ${r.status.padEnd(4)} turns=${String(r.turns).padStart(4)} maxD=${String(r.maxDepth).padStart(2)} bugs=${r.bugCount} [${r.milestones.join(',')}]`);
                return r;
            });

            for (const r of results) {
                reporter.recordRun(r);
                reporter.addIssues(r.issues, { lane: 'headless', realm: r.targetId, session: r.session, tapePath: r.tapePath });
                for (const [code, minRes] of Object.entries(r.reproMap || {})) {
                    reporter.attachRepro(code, r.targetId, minRes);
                }
            }
            await server.assertZeroSessions(10000);
        }

        // Lane 2: Full-Stack Browser CDP Playthrough
        if (opts.lane === 'all' || opts.lane === 'cdp') {
            const cdpJobs = [];
            const viewports = opts.viewport === 'both' ? ['desktop', 'mobile'] : [opts.viewport];

            for (const tid of targets) {
                const pb = PLAYBOOKS[tid];
                if (opts.engine === 'cloud' || opts.engine === 'both') {
                    for (const vp of viewports) {
                        cdpJobs.push({ pb, engineMode: 'cloud', rendererMode: 'v2', viewportMode: vp });
                    }
                }
                if ((opts.engine === 'local' || opts.engine === 'both') && LOCAL_WORKER_REALMS.includes(pb.realm) && pb.lang === 'en') {
                    cdpJobs.push({ pb, engineMode: 'local', rendererMode: 'v2', viewportMode: 'desktop' });
                }
            }
            if (opts.renderer === 'v1' || opts.renderer === 'both') {
                for (const v1Realm of ['angband', 'nethack']) {
                    if (targets.includes(v1Realm)) {
                        cdpJobs.push({ pb: PLAYBOOKS[v1Realm], engineMode: 'cloud', rendererMode: 'v1', viewportMode: 'desktop' });
                    }
                }
            }

            console.log(`\n[Lane 2: Browser CDP] Running ${cdpJobs.length} browser verification sessions...`);
            for (const job of cdpJobs) {
                const r = await runBrowserTarget({
                    ...job,
                    server,
                    runDir,
                    seed: opts.seed,
                    turnsOverride: opts.turns,
                    allowSoftwareGl: opts.allowSoftwareGl,
                    liveAi: opts.liveAi
                });
                console.log(`  [L2] ${r.targetId.padEnd(14)} ${r.engine.padEnd(5)} ${r.renderer} ${r.session.padEnd(7)} ${r.status.padEnd(4)} turns=${String(r.turns).padStart(3)} bugs=${r.bugCount} [${r.milestones.join(',')}]`);
                reporter.recordRun(r);
                reporter.addIssues(r.issues, { lane: 'cdp', realm: r.targetId, engine: r.engine, renderer: r.renderer, screenshotPath: r.screenshotPath });
            }
            await server.assertZeroSessions(10000);
        }
    } finally {
        await server.stop();
    }

    const { summary, reportPath } = reporter.finalize();
    console.log(`\n=== PLAYTEST SWEEP COMPLETE ===`);
    console.log(`Runs: ${summary.runs.length} | Unique Bugs: ${summary.totalUniqueBugs} (P0=${summary.counts.P0}, P1=${summary.counts.P1}, P2=${summary.counts.P2}, P3=${summary.counts.P3})`);
    console.log(`Bug Report: ${reportPath}`);
    process.exit(summary.counts.P0 > 0 || summary.counts.P1 > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal playtest CLI error:', err);
    process.exit(1);
});

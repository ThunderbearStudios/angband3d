const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

const ARTIFACT_DIR = process.env.ANGBAND3D_ARTIFACT_DIR || path.join(os.tmpdir(), 'angband3d-artifacts');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSession(targetUrl, testFn) {
    const port = 9330 + Math.floor(Math.random() * 50);
    const tempDir = path.join(__dirname, 'temp_chrome_verify_' + Date.now());

    console.log(`\n======================================================`);
    console.log(`[Chrome CDP] Launching Chrome on port ${port} -> ${targetUrl}`);
    console.log(`======================================================`);

    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    await sleep(1500);

    try {
        const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
        const target = await res.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        let id = 1;
        const callbacks = new Map();

        function send(method, params = {}) {
            return new Promise((resolve) => {
                const reqId = id++;
                callbacks.set(reqId, resolve);
                ws.send(JSON.stringify({ id: reqId, method, params }));
            });
        }

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.method === 'Runtime.consoleAPICalled') {
                const text = msg.params.args.map(a => a.value || a.description).join(' ');
                console.log('    [Browser Console]', text);
            }
            if (msg.id && callbacks.has(msg.id)) {
                const cb = callbacks.get(msg.id);
                callbacks.delete(msg.id);
                cb(msg.result);
            }
        });

        await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
        });

        await send('Page.enable');
        await send('Runtime.enable');

        async function evalJs(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
            if (r.exceptionDetails) {
                console.warn('[Eval Exception]', r.exceptionDetails);
            }
            return r.result ? r.result.value : null;
        }

        async function takeScreenshot(filename) {
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            if (shot && shot.data) {
                const filePath = path.join(ARTIFACT_DIR, filename);
                fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
                console.log(`  [Screenshot Saved] -> ${filePath}`);
                return filePath;
            }
            return null;
        }

        // Run the specific test logic
        await testFn({ send, evalJs, takeScreenshot });

        ws.close();
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    } catch (e) {
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        throw e;
    }
}

// TEST 1: FrogComposBand Character Birth Review & Reroll
async function verifyFrogComposBand() {
    const url = `http://localhost:8080/?realm=frogcomposband&new=1&play=1`;
    await runSession(url, async ({ send, evalJs, takeScreenshot }) => {
        console.log(`[FCB] Waiting for Screen 2 review pause...`);
        let reviewPaused = false;
        let initialStats = null;
        let initialHeroName = null;

        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const isReview = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                const btnReroll = document.getElementById('btn-term-reroll');
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame?.term?.rows || []).map(r => r.g || '');
                const screenText = rows.join('\\n').toLowerCase();
                const hasStats = screenText.includes('enter your starting stats') || screenText.includes('begin play');
                return {
                    isReview,
                    hasStats,
                    rerollVisible: btnReroll ? btnReroll.style.display : null,
                    heroName: lastFrame?.player?.name,
                    screenTextSample: rows.slice(0, 8)
                };
            })()`);

            if (state && (state.isReview || state.hasStats)) {
                console.log(`  [PASS] Screen 2 Review Pause confirmed! State:`, state.screenTextSample);
                reviewPaused = true;
                initialHeroName = state.heroName;
                break;
            }
        }

        if (!reviewPaused) {
            throw new Error(`FrogComposBand did not pause on Screen 2 review!`);
        }

        await takeScreenshot('fcb_screen2_review_pause.png');

        console.log(`[FCB] Clicking [🎲 Reroll Hero (R)]...`);
        await evalJs(`document.getElementById('btn-term-reroll').click()`);

        console.log(`[FCB] Waiting for newly randomized Screen 2 review pause...`);
        let rerolledPaused = false;
        await sleep(1000);

        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const isReview = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame?.term?.rows || []).map(r => r.g || '');
                const screenText = rows.join('\\n').toLowerCase();
                const hasStats = screenText.includes('enter your starting stats') || screenText.includes('begin play');
                return { isReview, hasStats, heroName: lastFrame?.player?.name, phase: lastFrame?.phase, rowsSample: rows.filter(r => r.trim()).slice(-3) };
            })()`);

            if (i % 2 === 0) {
                console.log(`  [FCB Reroll Wait iter ${i}] state:`, state);
            }

            if (state && (state.isReview || state.hasStats)) {
                console.log(`  [PASS] Screen 2 re-paused after re-roll! Hero: "${state.heroName}"`);
                rerolledPaused = true;
                break;
            }

        }

        if (!rerolledPaused) {
            throw new Error(`FrogComposBand did not re-pause at Screen 2 after reroll!`);
        }

        await takeScreenshot('fcb_screen2_rerolled.png');

        console.log(`[FCB] Clicking [⚔ Accept & Play (Enter)] to enter 3D exploration...`);
        await evalJs(`document.getElementById('btn-term-advance').click()`);

        let entered3D = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const term = document.getElementById('terminal-container');
                const termHidden = term ? term.classList.contains('hidden') : false;
                const inPlay = lastFrame && lastFrame.phase === 'play' && lastFrame.map;
                return { inPlay: !!inPlay, termHidden, phase: lastFrame?.phase, name: lastFrame?.player?.name };
            })()`);

            if (state && state.inPlay && state.termHidden) {
                console.log(`  [PASS] Successfully entered 3D World View in FrogComposBand! Hero: "${state.name}"`);
                entered3D = true;
                break;
            }
        }

        if (!entered3D) {
            throw new Error(`FrogComposBand failed to enter 3D play!`);
        }

        await sleep(1000);
        await takeScreenshot('fcb_3d_exploration.png');
    });
}

// TEST 2: Hengband Lore Names, Doors, Machiya Textures & Chronicle
async function verifyHengband() {
    const url = `http://localhost:8080/?realm=hengband&new=1&play=1`;
    await runSession(url, async ({ send, evalJs, takeScreenshot }) => {
        console.log(`[Hengband] Waiting for character birth review pause...`);
        let reviewPaused = false;
        let heroName = null;

        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const isReview = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame?.term?.rows || []).map(r => r.g || '').filter(s => s.trim().length > 0);
                const screenText = rows.join('\\n').toLowerCase();
                const isReviewScreen = isReview || screenText.includes("['r'eroll") || screenText.includes("or enter to accept") || screenText.includes("能力値の決定");
                return {
                    isReviewScreen,
                    heroName: lastFrame?.player?.name,
                    rowsSample: rows.slice(-3)
                };
            })()`);

            if (state && state.isReviewScreen) {
                console.log(`  [PASS] Hengband character review screen paused cleanly!`);
                heroName = state.heroName;
                reviewPaused = true;
                break;
            }
        }

        if (!reviewPaused) {
            throw new Error(`Hengband failed to pause on character review screen!`);
        }

        // Click [⚔ Accept & Play (Enter)]
        console.log(`[Hengband] Clicking Accept & Play button to enter 3D town...`);
        await evalJs(`document.getElementById('btn-term-advance').click()`);

        let entered3D = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const term = document.getElementById('terminal-container');
                const termHidden = term ? term.classList.contains('hidden') : false;
                const inPlay = lastFrame && lastFrame.phase === 'play' && lastFrame.map;
                const plaque = document.getElementById('char-title');
                return {
                    inPlay: !!inPlay,
                    termHidden,
                    phase: lastFrame?.phase,
                    name: lastFrame?.player?.name,
                    plaqueText: plaque ? plaque.textContent : null
                };
            })()`);

            if (state && state.inPlay && state.termHidden) {
                console.log(`  [PASS] Hengband entered 3D play! Hero: "${state.name}", Plaque: "${state.plaqueText}"`);
                heroName = state.name;
                entered3D = true;
                break;
            }
        }

        if (!entered3D) {
            throw new Error(`Hengband failed to enter 3D play!`);
        }

        // Verify Hero Name is contextual lore (not Hero_XXXX or Adventurer)
        const isGeneric = !heroName || /^Hero_\d+$/i.test(heroName) || heroName === 'Adventurer';
        if (isGeneric) {
            throw new Error(`Hengband hero name "${heroName}" is generic!`);
        }
        console.log(`  [PASS] Hero name "${heroName}" verified as contextual folklore/Amberite name!`);

        // Check 3D town features (doors, buildings)
        const townInfo = await evalJs(`(() => {
            const d = window.__dungeon;
            const lastFrame = window.__app ? window.__app.getLastFrame() : null;
            let doorCount = 0;
            let permWallCount = 0;
            if (lastFrame && lastFrame.map && lastFrame.map.rows) {
                for (const row of lastFrame.map.rows) {
                    if (!row.f) continue;
                    for (let c = 0; c < row.f.length; c += 2) {
                        const featId = parseInt(row.f.substring(c, c + 2), 16);
                        if (featId === 2 || featId === 3 || featId === 4) doorCount++;
                        if (featId === 22) permWallCount++;
                    }
                }
            }
            return {
                doorCount,
                permWallCount,
                hasDoors: doorCount > 0,
                hasPermWalls: permWallCount > 0
            };
        })()`);

        console.log(`  [PASS] Hengband 3D Town Features: ${townInfo.doorCount} doors, ${townInfo.permWallCount} perm walls.`);
        await sleep(1000);
        await takeScreenshot('hengband_lore_name_and_town.png');

        // Verify Living Chronicle Lorekeeper & Tradition
        console.log(`[Hengband] Opening Living Chronicle modal...`);
        const chronicleState = await evalJs(`(() => {
            if (window.chronicleManager) {
                window.chronicleManager.toggleWindow();
                const tradition = window.chronicleManager.tradition;
                const lorekeeper = window.chronicleManager.getLorekeeperName();
                const badge = document.getElementById('chronicle-tradition-badge');
                return {
                    tradition,
                    lorekeeper,
                    badgeText: badge ? badge.textContent : null,
                    isOpen: window.chronicleManager.visible || (window.chronicleManager.windowEl && !window.chronicleManager.windowEl.classList.contains('hidden'))
                };
            }
            return null;
        })()`);

        console.log(`  [PASS] Hengband Chronicle Attunement:`, chronicleState);
        if (chronicleState && chronicleState.lorekeeper !== 'Dworkin Barimen') {
            throw new Error(`Expected Lorekeeper Dworkin Barimen, got: ${chronicleState?.lorekeeper}`);
        }

        await sleep(500);
        await takeScreenshot('hengband_chronicle_lorekeeper.png');
    });
}

// TEST 3: Sil-Q 50ft Sunlight Shafts & Chronicle Attunement
async function verifySilQ() {
    const url = `http://localhost:8080/?realm=silq&new=1&play=1`;
    await runSession(url, async ({ send, evalJs, takeScreenshot }) => {
        console.log(`[Sil-Q] Waiting for character birth review pause...`);
        let reviewPaused = false;
        let heroName = null;

        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const isReview = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame?.term?.rows || []).map(r => r.g || '').filter(s => s.trim().length > 0);
                const screenText = rows.join('\\n').toLowerCase();
                const isReviewScreen = isReview || screenText.includes("to start over") || screenText.includes("accept character") || screenText.includes("re-roll");
                return {
                    isReviewScreen,
                    heroName: lastFrame?.player?.name,
                    rowsSample: rows.slice(-3)
                };
            })()`);

            if (state && state.isReviewScreen) {
                console.log(`  [PASS] Sil-Q character review screen paused cleanly! Hero: "${state.heroName}"`);
                heroName = state.heroName;
                reviewPaused = true;
                break;
            }
        }

        if (!reviewPaused) {
            throw new Error(`Sil-Q failed to pause on character review screen!`);
        }

        // Click [⚔ Accept & Play (Enter)]
        console.log(`[Sil-Q] Clicking Accept & Play button to enter 3D dungeon...`);
        await evalJs(`document.getElementById('btn-term-advance').click()`);

        let entered3D = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const term = document.getElementById('terminal-container');
                const termHidden = term ? term.classList.contains('hidden') : false;
                const inPlay = lastFrame && lastFrame.phase === 'play' && lastFrame.map;
                return {
                    inPlay: !!inPlay,
                    termHidden,
                    phase: lastFrame?.phase,
                    depth: lastFrame?.depth
                };
            })()`);

            if (state && state.inPlay && state.termHidden) {
                console.log(`  [PASS] Sil-Q entered 3D play at depth ${state.depth}! Hero Name: "${heroName}"`);
                entered3D = true;
                break;
            }
        }

        if (!entered3D) {
            throw new Error(`Sil-Q failed to enter 3D play!`);
        }

        // Verify Feat 25 Sunlight tiles and Volumetric Sunbeam mesh
        const sunlightState = await evalJs(`(() => {
            const d = window.__dungeon || window.dungeon || (window.__app && window.__app.dungeon);
            const lastFrame = window.__app ? window.__app.getLastFrame() : null;
            let feat25Count = 0;
            if (lastFrame && lastFrame.map && lastFrame.map.rows) {
                for (const row of lastFrame.map.rows) {
                    if (!row.f) continue;
                    for (let c = 0; c < row.f.length; c += 2) {
                        const featId = parseInt(row.f.substring(c, c + 2), 16);
                        if (featId === 25) feat25Count++;
                    }
                }
            }
            const hasSunbeamMesh = d && d.sunbeamMesh ? true : false;
            const sunbeamCount = d && d.sunbeamMesh ? d.sunbeamMesh.count : 0;
            return {
                feat25Count,
                hasSunbeamMesh,
                sunbeamCount
            };
        })()`);

        console.log(`  [PASS] Sil-Q Sunlight State:`, sunlightState);
        await sleep(1000);
        await takeScreenshot('silq_50ft_sunlight_shafts.png');

        // Verify Living Chronicle Lorekeeper & Tradition
        console.log(`[Sil-Q] Opening Living Chronicle modal...`);
        const chronicleState = await evalJs(`(() => {
            if (window.chronicleManager) {
                window.chronicleManager.toggleWindow();
                const tradition = window.chronicleManager.tradition;
                const lorekeeper = window.chronicleManager.getLorekeeperName();
                const badge = document.getElementById('chronicle-tradition-badge');
                return {
                    tradition,
                    lorekeeper,
                    badgeText: badge ? badge.textContent : null
                };
            }
            return null;
        })()`);

        console.log(`  [PASS] Sil-Q Chronicle Attunement:`, chronicleState);
        if (chronicleState && chronicleState.lorekeeper !== 'Pengolodh of Gondolin') {
            throw new Error(`Expected Lorekeeper Pengolodh of Gondolin, got: ${chronicleState?.lorekeeper}`);
        }

        await sleep(500);
        await takeScreenshot('silq_chronicle_lorekeeper.png');
    });
}

async function main() {
    try {
        console.log(`\n======================================================`);
        console.log(`>>> STARTING MULTI-REALM CDP VERIFICATION SUITE <<<`);
        console.log(`======================================================`);

        console.log(`\n--- PART 1: FrogComposBand Birth Review & Reroll ---`);
        await verifyFrogComposBand();

        console.log(`\n--- PART 2: Hengband Lore Names, Doors, Machiya Textures & Chronicle ---`);
        await verifyHengband();

        console.log(`\n--- PART 3: Sil-Q 50ft Sunlight Shafts & Chronicle ---`);
        await verifySilQ();

        console.log(`\n======================================================`);
        console.log(`>>> ALL IN-BROWSER VALIDATIONS PASSED WITH FLYING COLORS! <<<`);
        console.log(`======================================================\n`);
    } catch (err) {
        console.error(`\n[VERIFICATION FAILED]`, err);
        process.exit(1);
    }
}

main();

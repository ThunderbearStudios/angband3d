#!/usr/bin/env node
/**
 * tools/verify_visual_and_perf_gate.js
 *
 * Phase 5 Comprehensive 5-Viewport Visual, Geometry, Contrast & Performance Oracle.
 * Spawns local server (unless BASE_URL is given), uses os.tmpdir() Chrome profiles cleaned
 * in finally (L15), verifies disk/cold-load/in-game perf ceilings against baseline, and
 * validates 0 overlaps, 0 live backdrop blurs, >=44px mobile touch targets, and >=4.5:1
 * WCAG contrast across 360x640, 390x844, 844x390, 768x1024, and 1440x900.
 */
'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

const ROOT = path.resolve(__dirname, '..');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            srv.close((err) => (err ? reject(err) : resolve(addr.port)));
        });
    });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(baseUrl, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await new Promise((resolve) => {
            http.get(`${baseUrl}/version.json`, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            }).on('error', () => resolve(false));
        });
        if (ok) return;
        await sleep(250);
    }
    throw new Error(`Server timeout waiting for ${baseUrl}`);
}

async function openCdpBrowser(width, height) {
    const cdpPort = 9500 + Math.floor(Math.random() * 150);
    const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-p5-chrome-'));
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${cdpPort}`,
        '--disable-gpu-shader-disk-cache',
        `--window-size=${width},${height}`,
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${chromeProfile}`
    ], { stdio: 'ignore' });

    await sleep(1400);
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
    if (!tabRes.ok) {
        chrome.kill();
        fs.rmSync(chromeProfile, { recursive: true, force: true });
        throw new Error('Failed to open CDP target');
    }
    const target = await tabRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    let nextId = 1;
    const pending = new Map();
    const listeners = new Set();
    ws.on('message', (buf) => {
        const msg = JSON.parse(buf.toString());
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
        }
        for (const fn of listeners) fn(msg);
    });

    const send = (method, params = {}) => new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result && r.result.exceptionDetails) {
            throw new Error('CDP Eval Error: ' + JSON.stringify(r.result.exceptionDetails));
        }
        return r.result && r.result.result ? r.result.result.value : null;
    };
    const takeScreenshot = async (outPath) => {
        const cap = await send('Page.captureScreenshot', { format: 'png' });
        if (cap.result && cap.result.data) {
            fs.writeFileSync(outPath, Buffer.from(cap.result.data, 'base64'));
            console.log(`[VisualGate] Screenshot saved: ${outPath}`);
        }
    };
    const cleanup = async () => {
        try { if (ws.readyState === 1) ws.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        await sleep(500);
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(chromeProfile, { recursive: true, force: true }); break; } catch (_) { await sleep(300); }
        }
    };

    return { send, evaluate, takeScreenshot, onEvent: (fn) => listeners.add(fn), cleanup };
}

async function main() {
    const args = process.argv.slice(2);
    const ssIdx = args.indexOf('--screenshots-dir');
    const screenshotsDir = ssIdx !== -1 ? args[ssIdx + 1] : null;
    if (screenshotsDir) fs.mkdirSync(screenshotsDir, { recursive: true });

    // Check 1: Disk asset budget
    const assetFiles = walk(path.join(ROOT, 'server', 'public', 'assets'));
    const assetMB = assetFiles.reduce((s, f) => s + fs.statSync(f).size, 0) / 1048576;
    console.log(`[VisualGate] Assets on disk: ${assetFiles.length} files, ${assetMB.toFixed(2)} MB (ceiling < 250 MB, baseline 488.05 MB)`);
    assert(assetMB < 250, `Expected disk assets < 250 MB, got ${assetMB.toFixed(2)} MB`);

    let srv = null;
    let saveDir = null;
    let baseUrl = process.env.BASE_URL || '';
    if (!baseUrl) {
        const port = await getFreePort();
        saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-p5-save-'));
        srv = spawn(process.execPath, ['server/src/server.js'], {
            cwd: ROOT,
            env: { ...process.env, PORT: String(port), SAVE_DIR: saveDir, NODE_ENV: 'production' },
            stdio: 'ignore'
        });
        baseUrl = `http://127.0.0.1:${port}`;
    }

    try {
        await waitForServer(baseUrl);

        // Phase A: Cold-load 1440x900 check
        const coldCdp = await openCdpBrowser(1440, 900);
        try {
            const reqs = [];
            const badHttp = [];
            const jsErrors = [];
            const consoleErrors = [];
            coldCdp.onEvent((m) => {
                if (m.method === 'Network.requestWillBeSent') reqs.push({ url: m.params.request.url, type: m.params.type });
                else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) badHttp.push(`${m.params.response.status} ${m.params.response.url}`);
                else if (m.method === 'Network.loadingFailed' && !m.params.canceled) badHttp.push(`FAILED ${m.params.errorText}`);
                else if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params?.exceptionDetails?.text || 'exception');
                else if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
                    consoleErrors.push((m.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' '));
                }
            });
            await coldCdp.send('Network.enable');
            await coldCdp.send('Runtime.enable');
            await coldCdp.send('Page.enable');
            await coldCdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
            await coldCdp.send('Page.navigate', { url: `${baseUrl}/` });
            await sleep(2400);

            const domCounts = await coldCdp.evaluate(`(() => ({
                scripts: document.querySelectorAll('script[src]:not([src*="engine3d.min.js"])').length,
                cssLinks: document.querySelectorAll('link[rel="stylesheet"]').length,
                lazyGuide: Boolean(window.AdventurerGuide),
                lazyRyod: Boolean(window.RyodForge),
                lazyChronicle: Boolean(window.chronicleManager)
            }))()`);
            const jsCssReqs = reqs.filter((r) => r.type === 'Script' || r.type === 'Stylesheet').length;
            console.log(`[VisualGate] Cold Load 1440x900: totalReqs=${reqs.length} (baseline 248), jsCssReqs=${jsCssReqs} (baseline 74), scripts=${domCounts.scripts}, css=${domCounts.cssLinks}, badHttp=${badHttp.length}, jsErrors=${jsErrors.length}, consoleErrors=${consoleErrors.length}`);
            assert(domCounts.scripts <= 2, `Expected scripts <= 2, got ${domCounts.scripts}`);
            assert(domCounts.cssLinks <= 2, `Expected cssLinks <= 2, got ${domCounts.cssLinks}`);
            assert(jsCssReqs <= 6, `Expected jsCssReqs <= 6, got ${jsCssReqs}`);
            assert(reqs.length <= 35, `Expected cold totalReqs <= 35, got ${reqs.length}`);
            assert(!domCounts.lazyGuide && !domCounts.lazyRyod && !domCounts.lazyChronicle, 'Lazy bundles loaded prematurely');
            assert.strictEqual(badHttp.length, 0, 'Cold-load HTTP errors: ' + badHttp.join('; '));
            assert.strictEqual(jsErrors.length, 0, 'Cold-load JS errors: ' + jsErrors.join('; '));
            assert.strictEqual(consoleErrors.length, 0, 'Cold-load console errors: ' + consoleErrors.join('; '));
        } finally {
            await coldCdp.cleanup();
        }

        // Phase B: In-Game Dungeon L1 Perf + 5-Viewport Geometry, Blur, Touch & Contrast Oracle
        const playCdp = await openCdpBrowser(1440, 900);
        try {
            const badHttp = [];
            const jsErrors = [];
            const consoleErrors = [];
            const reqMap = new Map();
            let coreTransferBytes = 0;
            let monsterGlbBytes = 0;
            let musicBytes = 0;
            playCdp.onEvent((m) => {
                if (m.method === 'Network.requestWillBeSent') reqMap.set(m.params.requestId, m.params.request.url);
                else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) badHttp.push(`${m.params.response.status} ${m.params.response.url}`);
                else if (m.method === 'Network.loadingFailed' && !m.params.canceled) badHttp.push(`FAILED ${m.params.errorText} (${reqMap.get(m.params.requestId) || m.params.requestId})`);
                else if (m.method === 'Network.loadingFinished') {
                    const u = reqMap.get(m.params.requestId) || '';
                    const bytes = m.params.encodedDataLength || 0;
                    if (!u.includes('/assets/audio/sfx/') && /\.(?:mp3|ogg)(?:\?|$)/i.test(u)) musicBytes += bytes;
                    else if (/\/assets\/models\/.*\.glb(?:\?|$)/i.test(u)) monsterGlbBytes += bytes;
                    else coreTransferBytes += bytes;
                }
                else if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params?.exceptionDetails?.text || 'exception');
                else if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
                    consoleErrors.push((m.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' '));
                }
            });

            await playCdp.send('Network.enable');
            await playCdp.send('Runtime.enable');
            await playCdp.send('Page.enable');
            await playCdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
            await playCdp.send('Page.navigate', { url: `${baseUrl}/?play=1&new=1&realm=angband&lang=en` });

            let inPlay = false;
            for (let i = 0; i < 60; i++) {
                await sleep(500);
                inPlay = await playCdp.evaluate(`(() => {
                    const app = window.__app;
                    if (!app) return false;
                    if (app.isBirthReviewActive?.()) {
                        const btn = document.getElementById('btn-review-embark');
                        if (btn) btn.click();
                        else app.network?.sendKey?.('enter');
                    }
                    const f = app.lastFrame || window.__lastFrame;
                    return Boolean(app.inPlay && f && f.phase === 'play' && f.map);
                })()`);
                if (inPlay) break;
            }
            assert(inPlay, 'Failed to enter active 3D play within 30s');
            await sleep(1800);

            const townMem = await playCdp.evaluate(`(() => {
                const d3d = window.__app?.dungeon;
                const mem = d3d?.renderer?.info?.memory || {};
                const seenTex = new Set();
                let texBytes = 0;
                let maxTexDim = 0;
                const slots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap'];
                d3d?.scene?.traverse?.((obj) => {
                    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
                    for (const m of mats) {
                        if (!m) continue;
                        for (const s of slots) {
                            const tx = m[s];
                            if (!tx || !tx.uuid || seenTex.has(tx.uuid)) continue;
                            seenTex.add(tx.uuid);
                            const img = tx.image;
                            const w = Number(img && (img.videoWidth || img.naturalWidth || img.width)) || 0;
                            const h = Number(img && (img.videoHeight || img.naturalHeight || img.height)) || 0;
                            if (w > 0 && h > 0) {
                                texBytes += w * h * 4;
                                maxTexDim = Math.max(maxTexDim, w, h);
                            }
                        }
                    }
                });
                return {
                    textures: mem.textures || 0,
                    geometries: mem.geometries || 0,
                    gpuTexVramMB: Number((texBytes / 1048576).toFixed(2)),
                    maxTexDim,
                    itemAtlasLoadedEager: Boolean(window.__itemAtlasLoaded)
                };
            })()`);
            console.log(`[VisualGate] Town VRAM: textures=${townMem.textures} (ceiling < 83, baseline 83), geometries=${townMem.geometries} (ceiling <= 80, full NPC+storefront baseline 60), gpuTexVramMB=${townMem.gpuTexVramMB} (ceiling < 125), maxTexDim=${townMem.maxTexDim}, itemAtlasLoadedEager=${townMem.itemAtlasLoadedEager}`);
            assert(townMem.textures < 83, `Expected Town textures < 83, got ${townMem.textures}`);
            assert(townMem.geometries <= 80, `Expected Town geometries <= 80, got ${townMem.geometries}`);
            assert.strictEqual(townMem.itemAtlasLoadedEager, false, 'item_atlas should not load eagerly');
            assert(townMem.maxTexDim <= 2048, `Expected maxTexDim <= 2048, got ${townMem.maxTexDim}`);
            assert(townMem.gpuTexVramMB < 125, `Expected gpuTexVramMB < 125, got ${townMem.gpuTexVramMB}`);

            // Walk toward Town plaza (via startMinimapAutoNav / startAutoExplore) until a live Town NPC renders in 3D
            await playCdp.evaluate(`(() => { window.__app?.network?.sendKey?.(','); })()`);
            await sleep(600);
            for (let step = 0; step < 24; step++) {
                const state = await playCdp.evaluate(`(() => {
                    const mons = window.__app?.dungeon?.monsters;
                    let visibleD3dMonsters = 0;
                    if (mons) {
                        for (const e of mons.values()) {
                            if (e && e.visible && !e.pending3DConfig && e.monsterData) visibleD3dMonsters++;
                        }
                    }
                    return {
                        frameMonsters: (window.__app?.lastFrame?.monsters || []).length,
                        visibleD3dMonsters,
                        autoNav: Boolean(window.__app?.input?.isAutoNavigating?.())
                    };
                })()`);
                if (state.frameMonsters > 0 && state.visibleD3dMonsters > 0) break;
                if (state.frameMonsters > 0) {
                    await playCdp.evaluate(`(() => { window.__app?.input?.stopMinimapAutoNav?.('npc-found'); })()`);
                    await sleep(400);
                    continue;
                }
                if (!state.autoNav) {
                    await playCdp.evaluate(`(() => {
                        const app = window.__app, f = app?.lastFrame;
                        const pts = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.35], [0.5, 0.65]];
                        if (f?.map?.w && f?.map?.h && ${step} % 4 === 0) {
                            const pt = pts[Math.floor(${step} / 4) % pts.length];
                            const cx = Math.floor(f.map.w * pt[0]), cy = Math.floor(f.map.h * pt[1]);
                            if (app.input?.startMinimapAutoNav?.(cx, cy, f)) return;
                        }
                        if (!app.input?.startAutoExplore?.(f)) {
                            app.network?.sendKey?.(',');
                        }
                    })()`);
                }
                await sleep(500);
            }
            await playCdp.evaluate(`(() => { window.__app?.input?.stopMinimapAutoNav?.('gate'); })()`);
            await sleep(450);
            const integrity = await playCdp.evaluate(`(async () => {
                const app = window.__app, d3d = app?.dungeon, f = app?.lastFrame;
                // Check live rendered visible Town monsters / NPCs
                const liveSprites = [];
                if (d3d?.monsters) {
                    for (const [k, obj] of d3d.monsters.entries()) {
                        if (!obj || !obj.visible || !obj.monsterData) continue;
                        const b = new THREE.Box3().setFromObject(obj);
                        const sz = new THREE.Vector3(); b.getSize(sz);
                        liveSprites.push({
                            name: obj.monsterName || obj.userData?.name || k,
                            visible: obj.visible,
                            heightM: Number(sz.y.toFixed(2)),
                            wx: Number(obj.position.x.toFixed(2)),
                            wz: Number(obj.position.z.toFixed(2))
                        });
                    }
                }
                // Aim camera toward nearest live Town NPC so screenshot confirms 3D character visibility
                const p = f?.player;
                const cs = d3d?.cellSize || 2.0;
                const camX = (d3d?.currentCamPos?.x !== undefined) ? d3d.currentCamPos.x : ((p?.x || 0) * cs);
                const camZ = (d3d?.currentCamPos?.z !== undefined) ? d3d.currentCamPos.z : ((p?.y || 0) * cs);
                if (p && liveSprites.length > 0 && d3d) {
                    liveSprites.sort((a, b) => Math.hypot(a.wx - camX, a.wz - camZ) - Math.hypot(b.wx - camX, b.wz - camZ));
                    const nearest = liveSprites[0];
                    if (nearest && Number.isFinite(nearest.wx) && Number.isFinite(nearest.wz)) {
                        const dx = nearest.wx - camX, dz = nearest.wz - camZ;
                        const yawTarget = Math.atan2(-dx, -dz);
                        d3d.yaw = yawTarget;
                        d3d.targetYaw = yawTarget;
                    }
                }
                // Dismiss FTUE & open Desktop D-Pad via footer pill to validate clean layout & zero header overflow
                document.querySelector('.ftue-coachmark-dismiss')?.click();
                const footerBtn = document.getElementById('btn-footer-dpad');
                footerBtn?.click();
                await new Promise((r) => setTimeout(r, 320));
                let hoverProbe = null;
                if (liveSprites.length > 0 && d3d?.camera && typeof THREE !== 'undefined') {
                    const nearest = liveSprites[0];
                    const proj = new THREE.Vector3(nearest.wx, 0.9, nearest.wz).project(d3d.camera);
                    const vw = window.innerWidth || 1440, vh = window.innerHeight || 900;
                    const sx = Math.round((proj.x * 0.5 + 0.5) * vw);
                    const sy = Math.round((-proj.y * 0.5 + 0.5) * vh);
                    d3d._updateHoverAffordance?.(sx, sy, app.input, f, null);
                    const pill = document.getElementById('cursor-action-pill');
                    hoverProbe = {
                        sx, sy,
                        visible: Boolean(pill && !pill.classList.contains('hidden') && getComputedStyle(pill).display !== 'none'),
                        name: document.getElementById('cursor-pill-name')?.textContent || '',
                        lmb: document.getElementById('cursor-pill-lmb')?.textContent || '',
                        rmb: document.getElementById('cursor-pill-rmb')?.textContent || '',
                        cursor: d3d.canvas?.style?.cursor || ''
                    };
                }
                const rtcEl = document.getElementById('reticle-target-card');
                const tc = document.getElementById('touch-controls');
                const tcRect = tc ? tc.getBoundingClientRect() : null;
                const closeRect = document.getElementById('btn-dpad-close')?.getBoundingClientRect() || null;
                const wingRects = Array.from(document.querySelectorAll('#touch-controls .dpad-turn-wings .dpad-btn')).map((b) => ({
                    id: b.id, h: Math.round(b.getBoundingClientRect().height), top: Math.round(b.getBoundingClientRect().top), bottom: Math.round(b.getBoundingClientRect().bottom)
                }));
                const headerOverflowPx = (tcRect && closeRect) ? Math.round(closeRect.right - tcRect.right) : 999;
                return {
                    tacticalCursorReady: Boolean(d3d?._tacticalCursor),
                    reticleCardDisplay: rtcEl ? getComputedStyle(rtcEl).display : 'missing',
                    liveMonsterCount: liveSprites.length,
                    liveMonstersSample: liveSprites.slice(0, 6),
                    hoverProbe,
                    dpadDisplay: tc ? getComputedStyle(tc).display : 'missing',
                    headerOverflowPx,
                    wingRects
                };
            })()`);
            console.log('[VisualGate] 3D Model, Hover & D-Pad Integrity:', JSON.stringify(integrity));
            assert.strictEqual(integrity.tacticalCursorReady, true, 'd3d._tacticalCursor failed to initialize');
            assert.strictEqual(integrity.reticleCardDisplay, 'none', 'Legacy #reticle-target-card must remain hidden');
            assert(integrity.liveMonsterCount > 0, 'Expected visible Town NPCs/monsters rendered in Angband Town');
            assert(integrity.liveMonstersSample.every((m) => m.visible && m.heightM >= 0.4 && m.heightM <= 4.0), `Town NPC bounds out of range: ${JSON.stringify(integrity.liveMonstersSample)}`);
            assert(integrity.hoverProbe && integrity.hoverProbe.visible, `Expected #cursor-action-pill visible on Town NPC hover: ${JSON.stringify(integrity.hoverProbe)}`);
            assert(integrity.hoverProbe.lmb.includes('LMB') && integrity.hoverProbe.rmb.includes('RMB'), `Invalid hover pill hints: ${JSON.stringify(integrity.hoverProbe)}`);
            assert(integrity.hoverProbe.cursor === 'pointer' || integrity.hoverProbe.cursor === 'crosshair', `Expected pointer/crosshair cursor, got '${integrity.hoverProbe.cursor}'`);
            assert.strictEqual(integrity.dpadDisplay, 'flex', 'Desktop #btn-footer-dpad failed to open D-Pad');
            assert(integrity.headerOverflowPx <= 0, `D-Pad header close button overflows container by ${integrity.headerOverflowPx}px`);
            if (screenshotsDir) {
                await sleep(250);
                await playCdp.takeScreenshot(path.join(screenshotsDir, 'town_npcs_dpad_1440x900.png'));
            }
            const popCheck = await playCdp.evaluate(`(async () => {
                const app = window.__app, d3d = app?.dungeon;
                const firstEnt = d3d?.monsters ? Array.from(d3d.monsters.values()).find(e => e.visible && e.monsterData) : null;
                if (!firstEnt) return { opened: false, btnCount: 0 };
                if (typeof window.ensureChronicleReady === 'function') await window.ensureChronicleReady();
                await window.chronicleManager?.interactWithCreature?.(firstEnt.monsterData, { mode: 'popover', clientX: ${integrity.hoverProbe.sx}, clientY: ${integrity.hoverProbe.sy} });
                await new Promise((r) => setTimeout(r, 150));
                const pop = document.getElementById('entity-inspect-popover');
                const pill = document.getElementById('cursor-action-pill');
                const btns = Array.from(document.querySelectorAll('#entity-context-actions button')).map(b => b.textContent.trim());
                return {
                    opened: Boolean(pop && !pop.classList.contains('hidden') && getComputedStyle(pop).display !== 'none'),
                    pillHidden: Boolean(!pill || pill.classList.contains('hidden')),
                    btnCount: btns.length,
                    btns
                };
            })()`);
            console.log('[VisualGate] RMB Entity Popover Check:', JSON.stringify(popCheck));
            assert(popCheck.opened && popCheck.pillHidden && popCheck.btnCount >= 4, `RMB entity inspect popover missing EntityMenu buttons: ${JSON.stringify(popCheck)}`);
            if (screenshotsDir) {
                await sleep(200);
                await playCdp.takeScreenshot(path.join(screenshotsDir, 'town_hover_popover_1440x900.png'));
            }
            // Dismiss popover, clear hover, and toggle D-Pad back off cleanly before Descending
            await playCdp.evaluate(`(() => {
                window.chronicleManager?.dismissEntityPopover?.();
                const d3d = window.__app?.dungeon;
                d3d?._updateHoverAffordance?.(-1, -1, window.__app?.input, window.__app?.lastFrame, null);
                document.getElementById('btn-footer-dpad')?.click();
            })()`);
            await sleep(200);

            // Descend to Dungeon Level 1 (`>`)
            await playCdp.evaluate(`(() => {
                const app = window.__app, f = app?.lastFrame;
                app?.input?.stopMinimapAutoNav?.('gate');
                if (!f?.map?.rows) return;
                for (let y = 0; y < f.map.rows.length; y++) {
                    const ix = (f.map.rows[y]?.g || '').indexOf('>');
                    if (ix !== -1) {
                        window.__gateStair = { x: ix, y };
                        if (!(f.player && f.player.x === ix && f.player.y === y)) {
                            app.input?.startMinimapAutoNav?.(ix, y, f);
                        }
                        break;
                    }
                }
            })()`);
            for (let s = 0; s < 75; s++) {
                await sleep(300);
                const stState = await playCdp.evaluate(`(() => {
                    const app = window.__app, f = app?.lastFrame, st = window.__gateStair;
                    if (f?.ui?.more) app.network?.sendKey?.('space');
                    const onStair = Boolean(f && st && f.player && f.player.x === st.x && f.player.y === st.y);
                    if (!onStair && st && f && !app?.input?.isAutoNavigating?.()) {
                        app?.input?.startMinimapAutoNav?.(st.x, st.y, f);
                    }
                    return onStair;
                })()`);
                if (stState) break;
            }
            await playCdp.evaluate(`(() => { window.__app?.network?.sendKey?.('>'); })()`);
            for (let s = 0; s < 20; s++) {
                await sleep(300);
                const d1 = await playCdp.evaluate(`(() => {
                    const app = window.__app, f = app?.lastFrame;
                    if (f?.ui?.more) app.network?.sendKey?.('space');
                    if ((f?.player?.depth || 0) >= 1) return true;
                    if (${s} % 4 === 3) app?.network?.sendKey?.('>');
                    return false;
                })()`);
                if (d1) break;
            }
            // Close any stray prompt/FTUE so 3D viewport & all HUD widgets are cleanly active at DL 1
            await playCdp.evaluate(`(() => {
                document.querySelector('.ftue-coachmark-dismiss')?.click();
                const tc = document.getElementById('terminal-container');
                if (tc && !tc.classList.contains('hidden')) window.__app?.network?.sendKey?.('escape');
            })()`);
            await sleep(800);

            const perf = await playCdp.evaluate(`(() => {
                const f = window.__app?.lastFrame;
                const d3d = window.__app?.dungeon;
                const mem = d3d?.renderer?.info?.memory || {};
                const res = performance.getEntriesByType('resource');
                const decodedKB = Math.round(res.reduce((s, r) => s + (r.decodedBodySize || 0), 0) / 1024);
                const termOpen = Boolean(!document.getElementById('terminal-container')?.classList.contains('hidden'));
                return { depth: f?.player?.depth ?? -1, textures: mem.textures || 0, geometries: mem.geometries || 0, decodedKB, termOpen };
            })()`);
            const coreKB = Math.round(coreTransferBytes / 1024);
            const glbKB = Math.round(monsterGlbBytes / 1024);
            const transferKB = coreKB + glbKB;
            const musicKB = Math.round(musicBytes / 1024);
            console.log(`[VisualGate] Dungeon L${perf.depth} (termOpen=${perf.termOpen}): coreKB=${coreKB} (<8000), glbKB=${glbKB}, transferKB=${transferKB} (<16500, baseline 12230), musicKB=${musicKB}, decodedKB=${perf.decodedKB} (<35000, baseline 51547), textures=${perf.textures}, geometries=${perf.geometries}`);
            assert(perf.depth >= 1, `Expected Dungeon depth >= 1, got ${perf.depth}`);
            assert(!perf.termOpen, 'Expected pure 3D Dungeon view (terminal should be hidden)');
            assert(coreKB < 8000, `Expected coreKB < 8000, got ${coreKB}`);
            assert(transferKB < 16500, `Expected transferKB < 16500, got ${transferKB}`);
            assert(perf.decodedKB < 35000, `Expected decodedKB < 35000, got ${perf.decodedKB}`);
            assert.strictEqual(badHttp.length, 0, 'In-game HTTP errors: ' + badHttp.join('; '));
            assert.strictEqual(jsErrors.length, 0, 'In-game JS errors: ' + jsErrors.join('; '));
            assert.strictEqual(consoleErrors.length, 0, 'In-game console errors: ' + consoleErrors.join('; '));

            const modelChecks = await playCdp.evaluate(`(async () => {
                const d3d = window.__app?.dungeon;
                const loader = d3d?._getGltfLoader?.();
                const modelUrls = [
                    '/assets/models/characters/steward.glb',
                    '/assets/models/characters/npc_woman.glb',
                    '/assets/models/characters/guard.glb',
                    '/assets/models/monsters/bestiary/wolf.glb',
                    '/assets/models/monsters/bestiary/Dragon.glb',
                    '/assets/models/monsters/Puglin.glb'
                ];
                const out = [];
                for (const u of modelUrls) {
                    const gltf = await new Promise((res, rej) => loader.load(u, res, undefined, rej));
                    let nonFloat = 0, normalizedPos = 0, meshCount = 0;
                    gltf.scene.traverse((c) => {
                        if (c.isMesh) {
                            meshCount++;
                            const pos = c.geometry?.attributes?.position;
                            if (pos && !(pos.array instanceof Float32Array)) nonFloat++;
                            if (pos && pos.normalized) normalizedPos++;
                        }
                    });
                    const bbox = d3d._computeTrueSkinnedBoundingBox(gltf.scene);
                    const sz = new THREE.Vector3(); bbox.getSize(sz);
                    out.push({ url: u, meshCount, nonFloat, normalizedPos, ySize: Number(sz.y.toFixed(4)) });
                }
                return out;
            })()`);
            console.log('[VisualGate] GLB Float32 Integrity:', JSON.stringify(modelChecks));
            for (const mc of modelChecks) {
                assert(mc.meshCount > 0 && mc.nonFloat === 0 && mc.normalizedPos === 0 && mc.ySize > 0.01, `Bad GLB geometry: ${JSON.stringify(mc)}`);
            }
            assert.strictEqual(consoleErrors.length, 0, 'Post-GLB-probe console errors: ' + consoleErrors.join('; '));

            // Animation Clip Selection & Root-Motion Grounding Probe (Guard/Veteran, Construct, Zombie)
            const animProbe = await playCdp.evaluate(`(async () => {
                const d3d = window.__app?.dungeon;
                const loader = d3d?._getGltfLoader?.();
                const targets = [
                    '/assets/models/characters/guard.glb',
                    '/assets/models/monsters/bestiary/frost_construct.glb',
                    '/assets/models/monsters/bestiary/zombie_model.glb'
                ];
                const statsForRootPos = (clip) => {
                    if (!clip || !Array.isArray(clip.tracks)) return null;
                    const tr = clip.tracks.find(t => t && /(Hips|Pelvis|Root)\.position$/i.test(t.name));
                    if (!tr || !tr.values) return null;
                    const n = Math.floor(tr.values.length / 3);
                    let sx = 0, sy = 0, sz = 0;
                    for (let i = 0; i < n; i++) { sx += tr.values[i*3]; sy += tr.values[i*3+1]; sz += tr.values[i*3+2]; }
                    const mx = sx / n, my = sy / n, mz = sz / n;
                    let maxDx = 0, maxDy = 0, maxDz = 0;
                    for (let i = 0; i < n; i++) {
                        maxDx = Math.max(maxDx, Math.abs(tr.values[i*3] - mx));
                        maxDy = Math.max(maxDy, Math.abs(tr.values[i*3+1] - my));
                        maxDz = Math.max(maxDz, Math.abs(tr.values[i*3+2] - mz));
                    }
                    return { name: tr.name, mx: Number(mx.toFixed(3)), my: Number(my.toFixed(3)), mz: Number(mz.toFixed(3)), maxDx: Number(maxDx.toFixed(3)), maxDy: Number(maxDy.toFixed(3)), maxDz: Number(maxDz.toFixed(3)) };
                };
                const res = {};
                for (const u of targets) {
                    const gltf = await new Promise((r, j) => loader.load(u, r, undefined, j));
                    const sel = d3d._selectCreatureClips(gltf.animations || []);
                    res[u.split('/').pop()] = {
                        idleName: sel.idleClip?.name || null,
                        walkName: sel.walkClip?.name || null,
                        idleRoot: statsForRootPos(sel.idleClip),
                        walkRoot: statsForRootPos(sel.walkClip)
                    };
                }
                return res;
            })()`);
            console.log('[VisualGate] Animation Clip & Root-Motion Grounding:', JSON.stringify(animProbe));
            assert.strictEqual(animProbe['guard.glb'].walkName, 'Walk', `Expected guard.glb Walk clip, got ${animProbe['guard.glb'].walkName}`);
            assert(Math.abs(animProbe['guard.glb'].walkRoot.mz - animProbe['guard.glb'].idleRoot.mz) < 0.05, 'guard.glb Walk Hips Z still offsets above Idle');
            assert(animProbe['guard.glb'].walkRoot.maxDz <= 2.5, `guard.glb Walk Hips Z excursion too high: ${animProbe['guard.glb'].walkRoot.maxDz}`);
            assert.strictEqual(animProbe['frost_construct.glb'].walkName, 'walk', `Expected frost_construct walk clip, got ${animProbe['frost_construct.glb'].walkName}`);
            assert(/InPlace/i.test(animProbe['zombie_model.glb'].walkName || ''), `Expected zombie InPlace walk, got ${animProbe['zombie_model.glb'].walkName}`);

            // Tome Menu Layout, Scaling, Move & Resize Interactive Probe
            await playCdp.evaluate(`(async () => {
                document.querySelector('.ftue-coachmark-dismiss')?.click();
                if (typeof window.ensureChronicleReady === 'function') await window.ensureChronicleReady();
                const cw = document.getElementById('chronicle-window');
                if (cw && !cw.classList.contains('active')) document.getElementById('btn-toggle-chronicle')?.click();
                window.__app?.hud?.applyHudScale?.(1.0);
            })()`);
            await sleep(400);
            const tomeLayout1440 = await playCdp.evaluate(`(() => {
                const checkOverlaps = (ids) => {
                    const rects = {};
                    for (const id of ids) {
                        const el = document.getElementById(id);
                        if (!el) continue;
                        const cs = getComputedStyle(el);
                        const r = el.getBoundingClientRect();
                        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
                        rects[id] = { x1: Math.round(r.left), y1: Math.round(r.top), x2: Math.round(r.right), y2: Math.round(r.bottom) };
                    }
                    const overlaps = [];
                    const keys = Object.keys(rects);
                    for (let i = 0; i < keys.length; i++) {
                        for (let j = i + 1; j < keys.length; j++) {
                            const a = rects[keys[i]], b = rects[keys[j]];
                            if (a.x1 < b.x2 - 2 && a.x2 > b.x1 + 2 && a.y1 < b.y2 - 2 && a.y2 > b.y1 + 2) overlaps.push(keys[i] + ' vs ' + keys[j]);
                        }
                    }
                    return { rects, overlaps };
                };
                const menuBar = document.querySelector('.chronicle-menu-bar')?.getBoundingClientRect();
                const deck = document.querySelector('.chronicle-transport-deck')?.getBoundingClientRect();
                const depthEl = document.getElementById('val-depth')?.getBoundingClientRect();
                const mmClose = document.getElementById('btn-minimap-close')?.getBoundingClientRect();
                return {
                    ...checkOverlaps(['top-right-bar', 'char-panel', 'minimap-container', 'hud-center-column', 'message-feed-window', 'chronicle-window']),
                    menuBarH: menuBar ? Math.round(menuBar.height) : 0,
                    deckH: deck ? Math.round(deck.height) : 0,
                    depthClearOfClose: Boolean(depthEl && mmClose && depthEl.right <= mmClose.left + 1)
                };
            })()`);
            console.log('[VisualGate] Tome & HUD Layout 1440x900 @100%:', JSON.stringify({ overlaps: tomeLayout1440.overlaps, menuBarH: tomeLayout1440.menuBarH, deckH: tomeLayout1440.deckH, depthClearOfClose: tomeLayout1440.depthClearOfClose }));
            assert.strictEqual(tomeLayout1440.overlaps.length, 0, 'Tome/HUD 1440x900 @100% overlaps: ' + tomeLayout1440.overlaps.join(', '));
            assert(tomeLayout1440.menuBarH > 0 && tomeLayout1440.menuBarH <= 40, `Expected single-row Tome menu bar <= 40px, got ${tomeLayout1440.menuBarH}`);
            assert(tomeLayout1440.deckH > 0 && tomeLayout1440.deckH <= 40, `Expected single-row Tome transport deck <= 40px, got ${tomeLayout1440.deckH}`);
            assert.strictEqual(tomeLayout1440.depthClearOfClose, true, 'Minimap depth label clipped by close button');
            if (screenshotsDir) {
                await playCdp.takeScreenshot(path.join(screenshotsDir, 'tome_and_layout_1440x900.png'));
            }

            // Scaled 1280x720 @115% Tome + HUD zero-overlap check
            await playCdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
            await playCdp.evaluate(`(() => { window.__app?.hud?.applyHudScale?.(1.15); window.__syncMsgDockBottom?.(); window.__clampFloatingWindows?.(); })()`);
            await sleep(400);
            const scaled1280 = await playCdp.evaluate(`(() => {
                const ids = ['top-right-bar', 'char-panel', 'minimap-container', 'hud-center-column', 'message-feed-window', 'chronicle-window'];
                const rects = {};
                for (const id of ids) {
                    const el = document.getElementById(id);
                    if (!el) continue;
                    const cs = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
                    rects[id] = { x1: Math.round(r.left), y1: Math.round(r.top), x2: Math.round(r.right), y2: Math.round(r.bottom) };
                }
                const overlaps = [];
                const keys = Object.keys(rects);
                for (let i = 0; i < keys.length; i++) {
                    for (let j = i + 1; j < keys.length; j++) {
                        const a = rects[keys[i]], b = rects[keys[j]];
                        if (a.x1 < b.x2 - 2 && a.x2 > b.x1 + 2 && a.y1 < b.y2 - 2 && a.y2 > b.y1 + 2) overlaps.push(keys[i] + ' vs ' + keys[j]);
                    }
                }
                return { overlaps, rects };
            })()`);
            console.log('[VisualGate] Tome & HUD Layout 1280x720 @115%:', JSON.stringify(scaled1280.overlaps), JSON.stringify(scaled1280.rects));
            assert.strictEqual(scaled1280.overlaps.length, 0, 'Tome/HUD 1280x720 @115% overlaps: ' + scaled1280.overlaps.join(', '));
            if (screenshotsDir) {
                await playCdp.takeScreenshot(path.join(screenshotsDir, 'layout_1280x720_scaled.png'));
            }

            // Interactive Drag & Resize Probe at 1440x900 @115% Scale
            await playCdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
            await sleep(300);
            const dragResizeProbe = await playCdp.evaluate(`(async () => {
                const wait = (ms) => new Promise(r => setTimeout(r, ms));
                const synthDrag = async (handleEl, dx, dy) => {
                    const r = handleEl.getBoundingClientRect();
                    const sx = Math.round(r.left + Math.min(r.width * 0.5, 40));
                    const sy = Math.round(r.top + r.height * 0.5);
                    handleEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx, clientY: sy }));
                    await wait(16);
                    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx + Math.round(dx * 0.5), clientY: sy + Math.round(dy * 0.5) }));
                    handleEl.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx + Math.round(dx * 0.5), clientY: sy + Math.round(dy * 0.5) }));
                    await wait(16);
                    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx + dx, clientY: sy + dy }));
                    handleEl.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx + dx, clientY: sy + dy }));
                    await wait(16);
                    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx + dx, clientY: sy + dy }));
                    handleEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: sx + dx, clientY: sy + dy }));
                    await wait(30);
                };
                const probeWindow = async (winId, hdrId, resId, dDrag, dResize) => {
                    const win = document.getElementById(winId);
                    const hdr = document.getElementById(hdrId);
                    const res = document.getElementById(resId);
                    const b0 = win.getBoundingClientRect();
                    await synthDrag(hdr, dDrag[0], dDrag[1]);
                    const b1 = win.getBoundingClientRect();
                    await synthDrag(res, dResize[0], dResize[1]);
                    const b2 = win.getBoundingClientRect();
                    return {
                        dragMovedX: Math.round(b1.left - b0.left),
                        dragMovedY: Math.round(b1.top - b0.top),
                        dragJumpW: Math.round(Math.abs(b1.width - b0.width)),
                        resizeTopPinDeltaX: Math.round(Math.abs(b2.left - b1.left)),
                        resizeTopPinDeltaY: Math.round(Math.abs(b2.top - b1.top)),
                        resizeGrowW: Math.round(b2.width - b1.width),
                        resizeGrowH: Math.round(b2.height - b1.height)
                    };
                };
                const msg = await probeWindow('message-feed-window', 'message-feed-header', 'msg-resize-handle', [60, -40], [80, 50]);
                const map = await probeWindow('minimap-container', 'minimap-header', 'map-resize-handle', [55, 40], [55, 55]);
                const tome = await probeWindow('chronicle-window', 'chronicle-header', 'chronicle-resize-handle', [-70, 45], [50, 40]);
                window.__app?.hud?.resetHudLayout?.();
                window.__app?.hud?.applyHudScale?.(1.0);
                document.getElementById('btn-chronicle-close')?.click();
                return { msg, map, tome };
            })()`);
            console.log('[VisualGate] Scaled (@115%) Drag & Resize Probe:', JSON.stringify(dragResizeProbe));
            for (const [k, p] of Object.entries(dragResizeProbe)) {
                assert(Math.abs(p.dragMovedX) >= 35 && Math.abs(p.dragMovedY) >= 25, `${k} header drag failed: ${JSON.stringify(p)}`);
                assert(p.dragJumpW <= 3, `${k} unexpected width jump on drag: ${JSON.stringify(p)}`);
                assert(p.resizeGrowW >= 30 && p.resizeGrowH >= 20, `${k} resize handle failed: ${JSON.stringify(p)}`);
                assert(p.resizeTopPinDeltaX <= 4 && p.resizeTopPinDeltaY <= 4, `${k} top-left drifted on resize: ${JSON.stringify(p)}`);
            }
            await sleep(250);

            // WCAG Contrast Verification on primary HUD labels, Daily Trophy, Reticle Upgrade Chip & Settings Gold CTA
            const contrastRes = await playCdp.evaluate(`(() => {
                const parseRgb = (str) => {
                    const m = String(str || '').match(/rgba?\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\s*\\)/i);
                    if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
                    const hx = String(str || '').match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
                    if (hx) {
                        let h = hx[1]; if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
                        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
                    }
                    return null;
                };
                const blend = (fg, bg) => {
                    const a = fg.a;
                    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
                };
                const lum = (c) => {
                    const ch = [c.r, c.g, c.b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
                    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
                };
                const ratio = (c1, c2) => {
                    const l1 = lum(c1), l2 = lum(c2);
                    return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
                };
                const bgBase = { r: 12, g: 15, b: 22, a: 1 };
                const measure = (el) => {
                    if (!el) return null;
                    const cs = getComputedStyle(el);
                    const fg = parseRgb(cs.color) || { r: 255, g: 255, b: 255, a: 1 };
                    let bg = parseRgb(cs.backgroundColor);
                    if (!bg || bg.a < 0.05) {
                        const gradStop = (cs.backgroundImage || '').match(/rgba?\\([^)]+\\)|#[0-9a-f]{3,6}/i);
                        bg = gradStop ? parseRgb(gradStop[0]) : bgBase;
                    }
                    const effBg = bg.a < 1 ? blend(bg, bgBase) : bg;
                    return ratio(fg, effBg);
                };

                const trophy = document.getElementById('daily-seed-trophy');
                const wasHiddenT = trophy?.classList.contains('hidden');
                trophy?.classList.remove('hidden');

                const pill = document.getElementById('cursor-action-pill');
                const pillName = document.getElementById('cursor-pill-name');
                const pillLmb = document.getElementById('cursor-pill-lmb');
                const prevPillHidden = pill?.classList.contains('hidden');
                if (pillName && !pillName.textContent) pillName.textContent = 'Orc';
                if (pillLmb && !pillLmb.textContent) pillLmb.textContent = 'LMB Attack';
                pill?.classList.remove('hidden');

                window.YasdSettingsModal?.open?.();
                const setGoldBtn = document.querySelector('#yasd-settings-dialog .btn-gold');

                const results = {
                    charTitle: measure(document.getElementById('char-title')),
                    hpText: measure(document.getElementById('hp-text')),
                    dailyTrophy: measure(trophy),
                    cursorPillName: measure(pillName),
                    cursorPillLmb: measure(pillLmb),
                    settingsGoldCta: measure(setGoldBtn)
                };

                window.YasdSettingsModal?.close?.();
                if (prevPillHidden) pill?.classList.add('hidden');
                if (wasHiddenT) trophy?.classList.add('hidden');
                return results;
            })()`);
            console.log('[VisualGate] WCAG Contrast Ratios (min 4.5:1):', JSON.stringify(contrastRes));
            for (const [k, val] of Object.entries(contrastRes)) {
                assert(val >= 4.5, `WCAG contrast failure for ${k}: ${val}:1 (< 4.5:1)`);
            }

            // 7-Viewport Geometry, Blur & Mobile Touch-Target Matrix
            const viewports = [
                { name: '360x640', width: 360, height: 640, mobile: true },
                { name: '390x844', width: 390, height: 844, mobile: true },
                { name: '844x390', width: 844, height: 390, mobile: true },
                { name: '768x1024', width: 768, height: 1024, mobile: true },
                { name: '1024x768', width: 1024, height: 768, mobile: false },
                { name: '1280x720', width: 1280, height: 720, mobile: false },
                { name: '1440x900', width: 1440, height: 900, mobile: false }
            ];
            for (const vp of viewports) {
                await playCdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
                await sleep(350);

                if (vp.name === '1440x900' && screenshotsDir) {
                    await playCdp.takeScreenshot(path.join(screenshotsDir, 'desktop_1440x900.png'));
                }

                const geom = await playCdp.evaluate(`(() => {
                    const blurs = [];
                    for (const el of document.querySelectorAll('*')) {
                        const bf = getComputedStyle(el).backdropFilter || '';
                        if (bf.includes('blur(')) blurs.push((el.id || el.className || el.tagName) + ':' + bf);
                    }
                    const rc = document.getElementById('reticle-target-card');
                    const reticleDisplay = rc ? getComputedStyle(rc).display : 'missing';
                    const ids = ['top-right-bar', 'char-panel', 'minimap-container', 'touch-controls', 'action-bar', 'message-feed-window', 'ftue-coachmark-pill'];
                    const rects = {};
                    for (const id of ids) {
                        const el = document.getElementById(id);
                        if (!el) continue;
                        const cs = getComputedStyle(el);
                        const r = el.getBoundingClientRect();
                        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
                        rects[id] = { x1: Math.round(r.left), y1: Math.round(r.top), x2: Math.round(r.right), y2: Math.round(r.bottom) };
                    }
                    const overlaps = [];
                    const keys = Object.keys(rects);
                    for (let i = 0; i < keys.length; i++) {
                        for (let j = i + 1; j < keys.length; j++) {
                            const a = rects[keys[i]], b = rects[keys[j]];
                            if (a.x1 < b.x2 - 2 && a.x2 > b.x1 + 2 && a.y1 < b.y2 - 2 && a.y2 > b.y1 + 2) {
                                overlaps.push(keys[i] + ' vs ' + keys[j]);
                            }
                        }
                    }
                    const smallTouchBtns = ${vp.mobile} ? Array.from(document.querySelectorAll('#action-bar .action-btn, #touch-controls .dpad-btn')).filter((b) => {
                        const cs = getComputedStyle(b);
                        const r = b.getBoundingClientRect();
                        return cs.display !== 'none' && r.width > 0 && r.height > 0 && (r.width < 43 || r.height < 43);
                    }).map((b) => b.id + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)) : [];
                    return { blurs, overlaps, smallTouchBtns, reticleDisplay };
                })()`);
                console.log(`[VisualGate] Viewport ${vp.name}: blurs=${geom.blurs.length}, reticleDisplay=${geom.reticleDisplay}, overlaps=${JSON.stringify(geom.overlaps)}, smallTouchBtns=${JSON.stringify(geom.smallTouchBtns)}`);
                assert.strictEqual(geom.reticleDisplay, 'none', `Legacy #reticle-target-card visible at ${vp.name}`);
                assert.strictEqual(geom.blurs.length, 0, `Live blur at ${vp.name}: ${geom.blurs.join(', ')}`);
                assert.strictEqual(geom.overlaps.length, 0, `HUD overlap at ${vp.name}: ${geom.overlaps.join(', ')}`);
                assert.strictEqual(geom.smallTouchBtns.length, 0, `Sub-44px buttons at ${vp.name}: ${geom.smallTouchBtns.join(', ')}`);

                if (vp.name === '390x844' && screenshotsDir) {
                    await playCdp.takeScreenshot(path.join(screenshotsDir, 'mobile_390x844.png'));
                }
            }
        } finally {
            await playCdp.cleanup();
        }

        console.log('\nverify_visual_and_perf_gate.js: ALL 5-VIEWPORT VISUAL, CONTRAST & PERF CHECKS PASSED\n');
    } finally {
        if (srv) { try { srv.kill(); } catch (_) {} }
        if (saveDir) { await sleep(300); try { fs.rmSync(saveDir, { recursive: true, force: true }); } catch (_) {} }
    }
}

main().catch((err) => {
    console.error('VISUAL/PERF GATE FAILED:', err);
    process.exit(1);
});

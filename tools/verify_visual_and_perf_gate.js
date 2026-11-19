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
                scripts: document.querySelectorAll('script[src]').length,
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
            let transferBytes = 0;
            playCdp.onEvent((m) => {
                if (m.method === 'Network.requestWillBeSent') reqMap.set(m.params.requestId, m.params.request.url);
                else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) badHttp.push(`${m.params.response.status} ${m.params.response.url}`);
                else if (m.method === 'Network.loadingFailed' && !m.params.canceled) badHttp.push(`FAILED ${m.params.errorText} (${reqMap.get(m.params.requestId) || m.params.requestId})`);
                else if (m.method === 'Network.loadingFinished') transferBytes += m.params.encodedDataLength || 0;
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
            console.log(`[VisualGate] Town VRAM: textures=${townMem.textures} (ceiling < 83, baseline 83), geometries=${townMem.geometries} (ceiling <= 80, full NPC+storefront baseline 60), gpuTexVramMB=${townMem.gpuTexVramMB} (ceiling < 95), maxTexDim=${townMem.maxTexDim}, itemAtlasLoadedEager=${townMem.itemAtlasLoadedEager}`);
            assert(townMem.textures < 83, `Expected Town textures < 83, got ${townMem.textures}`);
            assert(townMem.geometries <= 80, `Expected Town geometries <= 80, got ${townMem.geometries}`);
            assert.strictEqual(townMem.itemAtlasLoadedEager, false, 'item_atlas should not load eagerly');
            assert(townMem.maxTexDim <= 2048, `Expected maxTexDim <= 2048, got ${townMem.maxTexDim}`);
            assert(townMem.gpuTexVramMB < 95, `Expected gpuTexVramMB < 95, got ${townMem.gpuTexVramMB}`);

            // Walk toward Town plaza (via startMinimapAutoNav / startAutoExplore) until a live Town NPC renders in 3D
            await playCdp.evaluate(`(() => { window.__app?.network?.sendKey?.(','); })()`);
            await sleep(600);
            for (let step = 0; step < 24; step++) {
                const state = await playCdp.evaluate(`(() => ({
                    frameMonsters: (window.__app?.lastFrame?.monsters || []).length,
                    d3dMonsters: (window.__app?.dungeon?.monsters?.size || 0),
                    autoNav: Boolean(window.__app?.input?.isAutoNavigating?.())
                }))()`);
                if (state.frameMonsters > 0 && state.d3dMonsters > 0) break;
                if (state.frameMonsters > 0) {
                    await playCdp.evaluate(`(() => { window.__app?.input?.stopMinimapAutoNav?.('npc-found'); })()`);
                    await sleep(500);
                    continue;
                }
                if (!state.autoNav) {
                    await playCdp.evaluate(`(() => {
                        const app = window.__app, f = app?.lastFrame;
                        if (${step} === 0 && f?.map?.w && f?.map?.h) {
                            const cx = Math.floor(f.map.w / 2), cy = Math.floor(f.map.h / 2);
                            const started = app.input?.startMinimapAutoNav?.(cx, cy, f);
                            if (!started) app.input?.startAutoExplore?.(f);
                        } else if (!app.input?.startAutoExplore?.(f)) {
                            app.network?.sendKey?.(',');
                        }
                    })()`);
                }
                await sleep(500);
            }
            await playCdp.evaluate(`(() => { window.__app?.input?.stopMinimapAutoNav?.('gate'); })()`);
            await sleep(1200);
            const integrity = await playCdp.evaluate(`(async () => {
                const app = window.__app, d3d = app?.dungeon, f = app?.lastFrame;
                // Check live rendered Town monsters / NPCs
                const liveSprites = [];
                if (d3d?.monsters) {
                    for (const [k, obj] of d3d.monsters.entries()) {
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
                await new Promise((r) => setTimeout(r, 250));
                const tc = document.getElementById('touch-controls');
                const tcRect = tc ? tc.getBoundingClientRect() : null;
                const closeRect = document.getElementById('btn-dpad-close')?.getBoundingClientRect() || null;
                const wingRects = Array.from(document.querySelectorAll('#touch-controls .dpad-turn-wings .dpad-btn')).map((b) => ({
                    id: b.id, h: Math.round(b.getBoundingClientRect().height), top: Math.round(b.getBoundingClientRect().top), bottom: Math.round(b.getBoundingClientRect().bottom)
                }));
                const headerOverflowPx = (tcRect && closeRect) ? Math.round(closeRect.right - tcRect.right) : 999;
                return {
                    tacticalCursorReady: Boolean(d3d?._tacticalCursor),
                    liveMonsterCount: liveSprites.length,
                    liveMonstersSample: liveSprites.slice(0, 6),
                    dpadDisplay: tc ? getComputedStyle(tc).display : 'missing',
                    headerOverflowPx,
                    wingRects
                };
            })()`);
            console.log('[VisualGate] 3D Model & D-Pad Integrity:', JSON.stringify(integrity));
            assert.strictEqual(integrity.tacticalCursorReady, true, 'd3d._tacticalCursor failed to initialize');
            assert(integrity.liveMonsterCount > 0, 'Expected visible Town NPCs/monsters rendered in Angband Town');
            assert(integrity.liveMonstersSample.every((m) => m.visible && m.heightM >= 0.4 && m.heightM <= 4.0), `Town NPC bounds out of range: ${JSON.stringify(integrity.liveMonstersSample)}`);
            assert.strictEqual(integrity.dpadDisplay, 'flex', 'Desktop #btn-footer-dpad failed to open D-Pad');
            assert(integrity.headerOverflowPx <= 0, `D-Pad header close button overflows container by ${integrity.headerOverflowPx}px`);
            if (screenshotsDir) {
                await sleep(300);
                await playCdp.takeScreenshot(path.join(screenshotsDir, 'town_npcs_dpad_1440x900.png'));
            }
            // Toggle D-Pad back off cleanly via #btn-footer-dpad before Descending & running desktop layout checks
            await playCdp.evaluate(`(() => { document.getElementById('btn-footer-dpad')?.click(); })()`);
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
            for (let s = 0; s < 36; s++) {
                await sleep(300);
                const onStair = await playCdp.evaluate(`(() => {
                    const f = window.__app?.lastFrame, st = window.__gateStair;
                    return Boolean(f && st && f.player && f.player.x === st.x && f.player.y === st.y);
                })()`);
                if (onStair) break;
            }
            await playCdp.evaluate(`(() => { window.__app?.network?.sendKey?.('>'); })()`);
            for (let s = 0; s < 16; s++) {
                await sleep(300);
                const d1 = await playCdp.evaluate(`(window.__app?.lastFrame?.player?.depth || 0) >= 1`);
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
            const transferKB = Math.round(transferBytes / 1024);
            console.log(`[VisualGate] Dungeon L${perf.depth} (termOpen=${perf.termOpen}): transferKB=${transferKB} (ceiling < 10000, baseline 12230), decodedKB=${perf.decodedKB} (ceiling < 35000, baseline 51547), textures=${perf.textures}, geometries=${perf.geometries}`);
            assert(perf.depth >= 1, `Expected Dungeon depth >= 1, got ${perf.depth}`);
            assert(!perf.termOpen, 'Expected pure 3D Dungeon view (terminal should be hidden)');
            assert(transferKB < 10000, `Expected transferKB < 10000, got ${transferKB}`);
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

                const tier = document.getElementById('target-card-tier');
                const rc = document.getElementById('reticle-target-card');
                const prevTierCls = tier?.className;
                rc?.classList.remove('hidden'); if (rc) rc.style.display = 'block';
                if (tier) tier.className = 'target-card-tier reticle-upgrade-chip';

                window.YasdSettingsModal?.open?.();
                const setGoldBtn = document.querySelector('#yasd-settings-dialog .btn-gold');

                const results = {
                    charTitle: measure(document.getElementById('char-title')),
                    hpText: measure(document.getElementById('hp-text')),
                    dailyTrophy: measure(trophy),
                    upgradeChip: measure(tier),
                    settingsGoldCta: measure(setGoldBtn)
                };

                window.YasdSettingsModal?.close?.();
                if (tier && prevTierCls !== undefined) tier.className = prevTierCls;
                if (rc) { rc.classList.add('hidden'); rc.style.display = 'none'; }
                if (wasHiddenT) trophy?.classList.add('hidden');
                return results;
            })()`);
            console.log('[VisualGate] WCAG Contrast Ratios (min 4.5:1):', JSON.stringify(contrastRes));
            for (const [k, val] of Object.entries(contrastRes)) {
                assert(val >= 4.5, `WCAG contrast failure for ${k}: ${val}:1 (< 4.5:1)`);
            }

            // 5-Viewport Geometry, Blur & Mobile Touch-Target Matrix
            const viewports = [
                { name: '360x640', width: 360, height: 640, mobile: true },
                { name: '390x844', width: 390, height: 844, mobile: true },
                { name: '844x390', width: 844, height: 390, mobile: true },
                { name: '768x1024', width: 768, height: 1024, mobile: true },
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
                    if (rc) { rc.classList.remove('hidden'); rc.style.display = 'block'; }
                    const ids = ['top-right-bar', 'reticle-target-card', 'char-panel', 'minimap-container', 'touch-controls', 'action-bar', 'message-feed-window', 'ftue-coachmark-pill'];
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
                    if (rc) { rc.classList.add('hidden'); rc.style.display = 'none'; }
                    return { blurs, overlaps, smallTouchBtns };
                })()`);
                console.log(`[VisualGate] Viewport ${vp.name}: blurs=${geom.blurs.length}, overlaps=${JSON.stringify(geom.overlaps)}, smallTouchBtns=${JSON.stringify(geom.smallTouchBtns)}`);
                assert.strictEqual(geom.blurs.length, 0, `Live blur at ${vp.name}: ${geom.blurs.join(', ')}`);
                assert.strictEqual(geom.overlaps.length, 0, `HUD overlap at ${vp.name}: ${geom.overlaps.join(', ')}`);
                assert.strictEqual(geom.smallTouchBtns.length, 0, `Sub-44px buttons at ${vp.name}: ${geom.smallTouchBtns.join(', ')}`);

                if (vp.name === '390x844' && screenshotsDir) {
                    await playCdp.evaluate(`(() => { const rc = document.getElementById('reticle-target-card'); if (rc) { rc.classList.remove('hidden'); rc.style.display = 'block'; } })()`);
                    await playCdp.takeScreenshot(path.join(screenshotsDir, 'mobile_390x844.png'));
                    await playCdp.evaluate(`(() => { const rc = document.getElementById('reticle-target-card'); if (rc) { rc.classList.add('hidden'); rc.style.display = 'none'; } })()`);
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

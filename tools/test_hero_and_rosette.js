const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function run() {
    const SERVER_PORT = 8096;
    const CDP_PORT = 9238;
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const profileDir = path.join(__dirname, 'temp_chrome_hero_' + Date.now());

    console.log(`[Test] 1. Launching local Angband3D server on port ${SERVER_PORT}...`);
    const serverProcess = spawn('node', ['server/src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, PORT: String(SERVER_PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stderr.on('data', d => {
        // console.error('[Server stderr]', d.toString().trim());
    });

    // Wait for server health
    let serverReady = false;
    for (let i = 0; i < 40; i++) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, res => {
                    if (res.statusCode === 200) resolve();
                    else reject(new Error('Status ' + res.statusCode));
                });
                req.on('error', reject);
            });
            serverReady = true;
            break;
        } catch (_) {
            await sleep(150);
        }
    }

    if (!serverReady) {
        serverProcess.kill();
        throw new Error('Local server failed to start on port ' + SERVER_PORT);
    }
    console.log(`[Test] Local server healthy on http://localhost:${SERVER_PORT}`);

    console.log(`[Test] 2. Launching headless Chrome with CDP on port ${CDP_PORT}...`);
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1920,1080',
        '--no-first-run',
        '--no-default-browser-check',
        '--user-data-dir=' + profileDir
    ], { stdio: 'ignore' });

    await sleep(2000);

    let ws = null;
    try {
        const versionData = await new Promise((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            });
            req.on('error', reject);
        });

        const pageTarget = versionData.find(t => t.type === 'page') || versionData[0];
        if (!pageTarget) throw new Error('No CDP page target found');

        ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
        });

        let msgId = 1;
        function sendCDP(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                const handler = (raw) => {
                    const res = JSON.parse(raw);
                    if (res.id === id) {
                        ws.removeListener('message', handler);
                        if (res.error) reject(res.error);
                        else resolve(res.result);
                    }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        await sendCDP('Page.enable');
        await sendCDP('Runtime.enable');
        await sendCDP('DOM.enable');

        const testUrl = `http://localhost:${SERVER_PORT}/?char=HeroTest_${Date.now()}`;
        console.log(`[Test] 3. Navigating to ${testUrl}...`);
        await sendCDP('Page.navigate', { url: testUrl });
        await sleep(3500);

        // Verify Hero Action Button in DOM
        const heroCheck = await sendCDP('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('btn-hero-action');
                if (!btn) return { exists: false };
                const icon = document.getElementById('hero-action-icon')?.textContent;
                const text = document.getElementById('hero-action-text')?.textContent;
                const key = document.getElementById('hero-action-key')?.textContent;
                return {
                    exists: true,
                    icon,
                    text,
                    key,
                    display: window.getComputedStyle(btn).display,
                    classList: Array.from(btn.classList)
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Hero Action Button check:', heroCheck.result.value);
        if (!heroCheck.result.value.exists) {
            throw new Error('Hero Action Button #btn-hero-action not found in DOM');
        }

        // Verify Diegetic Reticle in DOM
        const reticleCheck = await sendCDP('Runtime.evaluate', {
            expression: `(() => {
                const ret = document.getElementById('diegetic-reticle');
                const card = document.getElementById('reticle-target-card');
                const cross = ret?.querySelector('.reticle-crosshair');
                const dot = ret?.querySelector('.reticle-dot');
                return {
                    reticleExists: !!ret,
                    cardExists: !!card,
                    crosshairExists: !!cross,
                    dotExists: !!dot,
                    cardHidden: card?.classList.contains('hidden')
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Diegetic Reticle check:', reticleCheck.result.value);
        if (!reticleCheck.result.value.reticleExists || !reticleCheck.result.value.cardExists) {
            throw new Error('Diegetic Reticle or Target Card not found in DOM');
        }

        // Verify 8-Way Directional Aim Rosette in DOM
        const rosetteCheck = await sendCDP('Runtime.evaluate', {
            expression: `(() => {
                const ros = document.getElementById('directional-aim-rosette');
                const sectors = ros?.querySelectorAll('.rosette-sector');
                const center = document.getElementById('btn-rosette-center');
                const backdrop = ros?.querySelector('.rosette-backdrop');
                return {
                    rosetteExists: !!ros,
                    sectorCount: sectors ? sectors.length : 0,
                    centerExists: !!center,
                    backdropExists: !!backdrop,
                    hidden: ros?.classList.contains('hidden')
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Directional Aim Rosette check:', rosetteCheck.result.value);
        if (!rosetteCheck.result.value.rosetteExists || rosetteCheck.result.value.sectorCount !== 9) {
            throw new Error(`Rosette sectors expected 9, got ${rosetteCheck.result.value.sectorCount}`);
        }

        // Test Simulated Frame update with adjacent monster & check reticle & hero button
        console.log('[Test] 4. Simulating game frame update with adjacent monster...');
        const simUpdate = await sendCDP('Runtime.evaluate', {
            expression: `(() => {
                if (!window.__app || !window.__app.input) return { error: 'app or input not ready' };
                const input = window.__app.input;
                const fakeFrame = {
                    phase: 'play',
                    player: { x: 10, y: 10, hp: 80, hp_max: 100, depth: 1 },
                    map: {
                        w: 20,
                        h: 20,
                        rows: Array.from({ length: 20 }, () => ({ f: '01'.repeat(20) }))
                    },
                    monsters: [
                        { x: 10, y: 9, name: 'Cave Spider', glyph: 'S', hp: 12, hp_max: 12, unique: false }
                    ]
                };
                // Set dungeon facing north (0)
                if (window.__app.dungeon) window.__app.dungeon.facing = 0;
                input.updateContextualControls(fakeFrame);

                const btn = document.getElementById('btn-hero-action');
                const card = document.getElementById('reticle-target-card');
                const ret = document.getElementById('diegetic-reticle');
                const cardName = document.getElementById('target-card-name')?.textContent;
                const cardTier = document.getElementById('target-card-tier')?.textContent;
                const smartAction = input.smartAction;

                return {
                    smartAction,
                    heroText: document.getElementById('hero-action-text')?.textContent,
                    heroKey: document.getElementById('hero-action-key')?.textContent,
                    cardHidden: card?.classList.contains('hidden'),
                    reticleTargeted: ret?.classList.contains('reticle-targeted'),
                    cardName,
                    cardTier
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Simulated Melee Attack Frame Result:', simUpdate.result.value);
        if (simUpdate.result.value.smartAction !== 'attack') {
            throw new Error('Expected smartAction to be "attack", got ' + simUpdate.result.value.smartAction);
        }
        if (!simUpdate.result.value.reticleTargeted) {
            throw new Error('Expected reticle to have reticle-targeted class');
        }

        // Test Simulated Frame with Stairs
        console.log('[Test] 5. Simulating game frame update on stairs...');
        const stairsUpdate = await sendCDP('Runtime.evaluate', {
            expression: `(() => {
                const input = window.__app.input;
                const fakeFrame = {
                    phase: 'play',
                    player: { x: 5, y: 5, hp: 80, hp_max: 100, depth: 1 },
                    map: {
                        w: 20,
                        h: 20,
                        rows: Array.from({ length: 20 }, (_, r) => {
                            if (r === 5) {
                                // Put feat 06 (stairs down) at x=5
                                return { f: '01'.repeat(5) + '06' + '01'.repeat(14) };
                            }
                            return { f: '01'.repeat(20) };
                        })
                    },
                    monsters: []
                };
                input.updateContextualControls(fakeFrame);

                return {
                    smartAction: input.smartAction,
                    heroText: document.getElementById('hero-action-text')?.textContent,
                    heroKey: document.getElementById('hero-action-key')?.textContent,
                    cardName: document.getElementById('target-card-name')?.textContent
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Simulated Stairs Frame Result:', stairsUpdate.result.value);
        if (stairsUpdate.result.value.smartAction !== 'descend') {
            throw new Error('Expected smartAction to be "descend", got ' + stairsUpdate.result.value.smartAction);
        }

        // Test Rosette popup on targeting prompt
        console.log('[Test] 6. Simulating direction prompt (isTargeting)...');
        const targetPromptUpdate = await sendCDP('Runtime.evaluate', {
            expression: `(() => {
                const input = window.__app.input;
                const fakeFrame = {
                    phase: 'play',
                    player: { x: 5, y: 5, hp: 80, hp_max: 100, depth: 1 },
                    map: {
                        w: 20,
                        h: 20,
                        rows: Array.from({ length: 20 }, () => ({ f: '01'.repeat(20) }))
                    },
                    term: {
                        rows: [{ g: 'Which direction?' }]
                    },
                    monsters: []
                };
                input.updateContextualControls(fakeFrame);
                const rosette = document.getElementById('directional-aim-rosette');
                return {
                    rosetteHidden: rosette?.classList.contains('hidden'),
                    activeYawSector: rosette?.querySelector('.rosette-sector.active-yaw')?.dataset.dir
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Simulated Direction Prompt Result:', targetPromptUpdate.result.value);
        if (targetPromptUpdate.result.value.rosetteHidden !== false) {
            throw new Error('Expected rosette to be visible (not hidden) on direction prompt');
        }

        console.log('\n=== ALL HERO ACTION, DIEGETIC RETICLE & AIM ROSETTE TESTS PASSED ===\n');

    } finally {
        if (ws) ws.close();
        chrome.kill();
        serverProcess.kill();
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

run().catch(err => {
    console.error('[Test Failed]', err);
    process.exit(1);
});

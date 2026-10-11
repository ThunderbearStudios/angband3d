const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8097;
const CDP_PORT = 9239;

const WebSocket = require('../server/node_modules/ws');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendCDP(wsUrl, method, params = {}) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const id = Math.floor(Math.random() * 100000);

        ws.on('open', () => {
            ws.send(JSON.stringify({ id, method, params }));
        });

        ws.on('message', (data) => {
            const res = JSON.parse(data.toString());
            if (res.id === id) {
                ws.close();
                if (res.error) reject(res.error);
                else resolve(res.result);
            }
        });

        ws.on('error', reject);
    });
}

async function main() {
    console.log('[Test] 1. Starting local Angband3D server on port ' + PORT + '...');
    const serverProc = spawn('node', ['server/src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'inherit'
    });

    await sleep(2500);

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    console.log('[Test] 2. Launching Chrome headless with CDP on port ' + CDP_PORT + '...');
    const chromeProc = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,800',
        'about:blank'
    ]);

    await sleep(2500);

    try {
        const versionRes = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(JSON.parse(body)));
            }).on('error', reject);
        });

        const listRes = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(JSON.parse(body)));
            }).on('error', reject);
        });

        const page = listRes.find(p => p.type === 'page') || listRes[0];
        const wsUrl = page.webSocketDebuggerUrl;

        await sendCDP(wsUrl, 'Page.enable');
        await sendCDP(wsUrl, 'Runtime.enable');

        console.log('[Test] 3. Navigating to http://localhost:' + PORT + '/?char=TestNonIntrusive...');
        await sendCDP(wsUrl, 'Page.navigate', { url: `http://localhost:${PORT}/?char=TestNonIntrusive` });
        await sleep(3000);

        // Test Scenario 1: Targeting Monster (Squint-eyed rogue)
        console.log('[Test] 4. Simulating Squint-eyed rogue facing player...');
        const monsterEval = await sendCDP(wsUrl, 'Runtime.evaluate', {
            expression: `(() => {
                document.getElementById('splash-screen')?.classList.add('hidden');
                if (document.getElementById('splash-screen')) document.getElementById('splash-screen').style.display = 'none';
                document.getElementById('terminal-container')?.classList.add('hidden');
                if (document.getElementById('terminal-container')) document.getElementById('terminal-container').style.display = 'none';

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
                        { x: 10, y: 9, name: 'Squint-eyed rogue', glyph: 'p', hp: 24, hp_max: 24, unique: false, asleep: true }
                    ]
                };
                if (window.__app.dungeon) {
                    window.__app.dungeon.facing = 0;
                    window.__app.dungeon.updateDungeon(fakeFrame);
                }
                input.updateContextualControls(fakeFrame);

                const card = document.getElementById('reticle-target-card');
                const cue = document.getElementById('context-action-cue');
                const ret = document.getElementById('diegetic-reticle');

                const cardRect = card ? card.getBoundingClientRect() : null;
                const cueRect = cue ? cue.getBoundingClientRect() : null;
                const retRect = ret ? ret.getBoundingClientRect() : null;

                return {
                    cardHidden: card?.classList.contains('hidden'),
                    cueHidden: cue?.classList.contains('hidden'),
                    reticleTargeted: ret?.classList.contains('reticle-targeted'),
                    reticleInteractive: ret?.classList.contains('reticle-interactive'),
                    cardTop: cardRect ? cardRect.top : null,
                    cueBottom: cueRect ? window.innerHeight - cueRect.bottom : null,
                    cueText: document.getElementById('action-cue-text')?.textContent,
                    cueKey: document.getElementById('action-cue-key')?.textContent,
                    windowHeight: window.innerHeight
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Monster result:', monsterEval.result.value);
        const mRes = monsterEval.result.value;
        if (mRes.cardHidden) throw new Error('Monster target card should be visible for monster');
        if (mRes.cueHidden) throw new Error('Context action cue should be visible for monster');
        if (mRes.cardTop > 100) throw new Error('Target card should be at top of screen (top < 100), got: ' + mRes.cardTop);
        if (mRes.cueBottom > 160 || mRes.cueBottom < 40) throw new Error('Cue should be near bottom of viewport, got: ' + mRes.cueBottom);

        // Capture screenshot of monster targeting layout
        const screenshotData = await sendCDP(wsUrl, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.resolve(__dirname, 'non_intrusive_monster_cue.png'), Buffer.from(screenshotData.data, 'base64'));
        console.log('[Test] Saved screenshot to tools/non_intrusive_monster_cue.png');

        // Test Scenario 2: Facing Granite Wall (NO monster card, clean bottom cue)
        console.log('[Test] 5. Simulating facing Granite Wall...');
        const wallEval = await sendCDP(wsUrl, 'Runtime.evaluate', {
            expression: `(() => {
                const input = window.__app.input;
                const fakeFrame = {
                    phase: 'play',
                    player: { x: 10, y: 10, hp: 80, hp_max: 100, depth: 1 },
                    map: {
                        w: 20,
                        h: 20,
                        // y=9 has feat 21 (granite wall, 21 in hex is '15')
                        rows: Array.from({ length: 20 }, (_, r) => ({
                            f: r === 9 ? '01'.repeat(10) + '15' + '01'.repeat(9) : '01'.repeat(20)
                        }))
                    },
                    monsters: []
                };
                input.updateContextualControls(fakeFrame);

                const card = document.getElementById('reticle-target-card');
                const cue = document.getElementById('context-action-cue');
                const ret = document.getElementById('diegetic-reticle');

                return {
                    cardHidden: card?.classList.contains('hidden'),
                    cueHidden: cue?.classList.contains('hidden'),
                    reticleTargeted: ret?.classList.contains('reticle-targeted'),
                    reticleInteractive: ret?.classList.contains('reticle-interactive'),
                    cueText: document.getElementById('action-cue-text')?.textContent,
                    cueKey: document.getElementById('action-cue-key')?.textContent
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Wall result:', wallEval.result.value);
        const wRes = wallEval.result.value;
        if (!wRes.cardHidden) throw new Error('Target card MUST be hidden when facing granite wall! (No popup over environment)');
        if (wRes.cueHidden) throw new Error('Context action cue should be visible to show tunnel action');
        if (!wRes.cueText.includes('Tunnel Granite Wall')) throw new Error('Expected Tunnel Granite Wall, got: ' + wRes.cueText);
        if (!wRes.reticleInteractive) throw new Error('Reticle should be interactive for tunnelable wall');

        // Test Scenario 3: Facing Closed Door
        console.log('[Test] 6. Simulating facing Closed Door...');
        const doorEval = await sendCDP(wsUrl, 'Runtime.evaluate', {
            expression: `(() => {
                const input = window.__app.input;
                const fakeFrame = {
                    phase: 'play',
                    player: { x: 10, y: 10, hp: 80, hp_max: 100, depth: 1 },
                    map: {
                        w: 20,
                        h: 20,
                        // y=9 has feat 02 (closed door)
                        rows: Array.from({ length: 20 }, (_, r) => ({
                            f: r === 9 ? '01'.repeat(10) + '02' + '01'.repeat(9) : '01'.repeat(20)
                        }))
                    },
                    monsters: []
                };
                input.updateContextualControls(fakeFrame);

                const card = document.getElementById('reticle-target-card');
                const cue = document.getElementById('context-action-cue');

                return {
                    cardHidden: card?.classList.contains('hidden'),
                    cueHidden: cue?.classList.contains('hidden'),
                    cueText: document.getElementById('action-cue-text')?.textContent,
                    cueKey: document.getElementById('action-cue-key')?.textContent
                };
            })()`,
            returnByValue: true
        });

        console.log('[Test] Door result:', doorEval.result.value);
        const dRes = doorEval.result.value;
        if (!dRes.cardHidden) throw new Error('Target card MUST be hidden when facing closed door!');
        if (dRes.cueHidden) throw new Error('Context action cue should be visible to show open door action');
        if (dRes.cueKey !== 'o') throw new Error('Expected key "o", got: ' + dRes.cueKey);

        console.log('\n=== ALL NON-INTRUSIVE UI TESTS PASSED SUCCESSFULLY! ===\n');
    } finally {
        chromeProc.kill('SIGKILL');
        serverProc.kill('SIGKILL');
    }
}

main().catch(err => {
    console.error('[Test Failed]', err);
    process.exit(1);
});

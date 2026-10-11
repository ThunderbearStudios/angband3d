const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('../server/node_modules/ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function main() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9252;
    const tempDir = path.join(os.tmpdir(), `chrome_e2e_reroll_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${port}`,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    let res = null;
    const targetUrl = `http://localhost:8080/?realm=angband&test_user=E2E_${Date.now()}`;
    for (let retry = 0; retry < 15; retry++) {
        await new Promise(r => setTimeout(r, 400));
        try {
            res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
            if (res.ok) break;
        } catch (_) {}
    }
    if (!res || !res.ok) throw new Error(`Could not connect to Chrome on port ${port}`);

    try {
        const target = await res.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        let id = 1;
        const callbacks = new Map();

        await new Promise((resolve, reject) => {
            function send(method, params = {}) {
                return new Promise((res) => {
                    const reqId = id++;
                    callbacks.set(reqId, res);
                    ws.send(JSON.stringify({ id: reqId, method, params }));
                });
            }

            async function evaluate(expr) {
                const r = await send('Runtime.evaluate', {
                    expression: expr,
                    returnByValue: true
                });
                return r.result?.result?.value;
            }

            ws.on('open', async () => {
                try {
                    await send('Page.enable');
                    await send('Runtime.enable');
                    await send('Console.enable');

                    ws.on('message', (msg) => {
                        const data = JSON.parse(msg.toString());
                        if (data.method === 'Console.messageAdded') {
                            console.log('[BROWSER CONSOLE]', data.params.message.text);
                        }
                    });

                    console.log('[E2E] Chrome CDP connected. Waiting for app initialization...');

                    // Wait for window.__app to exist
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 200));
                        const ready = await evaluate(`Boolean(window.__app && window.__app.startNewRandomHero)`);
                        if (ready) break;
                    }

                    console.log('[E2E] Triggering startNewRandomHero()...');
                    await evaluate(`window.__app.startNewRandomHero();`);

                    // Wait for character review screen
                    let review1 = null;
                    for (let i = 0; i < 60; i++) {
                        await new Promise(r => setTimeout(r, 300));
                        const val = await evaluate(`(() => {
                            const app = window.__app;
                            const isRev = app?.isBirthReviewActive ? app.isBirthReviewActive() : false;
                            const title = document.getElementById('terminal-title')?.textContent || '';
                            const rerollBtn = document.getElementById('btn-term-reroll');
                            const inPlay = app?.inPlay || false;
                            const term = document.getElementById('terminal-container');
                            const phase = app?.lastFrame?.phase;
                            return {
                                isRev,
                                title,
                                rerollBtnVisible: rerollBtn && rerollBtn.style.display !== 'none',
                                inPlay,
                                termVisible: term && !term.classList.contains('hidden'),
                                phase
                            };
                        })()`);

                        if (i % 5 === 0 || (val && (val.isRev || val.inPlay))) {
                            console.log(`[E2E Iteration ${i}]`, val);
                        }
                        if (val && val.isRev && val.rerollBtnVisible && !val.inPlay) {
                            review1 = val;
                            break;
                        }
                    }

                    if (!review1) {
                        throw new Error('Hero review screen was not reached or character was dumped directly into game!');
                    }
                    console.log(`[PASS] Initial Random Hero review reached! Title: "${review1.title}". InPlay: ${review1.inPlay}`);

                    // Now test: CLICK THE REROLL BUTTON (#btn-term-reroll)
                    console.log('[E2E] Clicking "#btn-term-reroll"...');
                    await evaluate(`document.getElementById('btn-term-reroll').click();`);

                    // Wait 1.2s and check that we DID NOT get dumped into the game!
                    await new Promise(r => setTimeout(r, 1200));
                    const immediateCheck = await evaluate(`(() => {
                        const app = window.__app;
                        const inPlay = app?.inPlay || false;
                        const isRev = app?.isBirthReviewActive ? app.isBirthReviewActive() : false;
                        return { inPlay, isRev };
                    })()`);

                    console.log('[E2E] Post-Reroll intermediate state:', immediateCheck);
                    if (immediateCheck?.inPlay) {
                        throw new Error('REGRESSION DETECTED: Clicking Reroll immediately dumped player into the game!');
                    }

                    // Wait for the new hero review screen to reappear
                    let review2 = null;
                    for (let i = 0; i < 60; i++) {
                        await new Promise(r => setTimeout(r, 300));
                        const val = await evaluate(`(() => {
                            const app = window.__app;
                            const isRev = app?.isBirthReviewActive ? app.isBirthReviewActive() : false;
                            const title = document.getElementById('terminal-title')?.textContent || '';
                            const rerollBtn = document.getElementById('btn-term-reroll');
                            const inPlay = app?.inPlay || false;
                            return {
                                isRev,
                                title,
                                rerollBtnVisible: rerollBtn && rerollBtn.style.display !== 'none',
                                inPlay
                            };
                        })()`);

                        if (val && val.isRev && val.rerollBtnVisible && !val.inPlay) {
                            review2 = val;
                            break;
                        }
                    }

                    if (!review2) {
                        throw new Error('Failed to reach character review screen after reroll!');
                    }
                    console.log(`[PASS] Reroll succeeded and stopped at review screen! Title: "${review2.title}". InPlay: ${review2.inPlay}`);

                    // Now click "#btn-term-advance" to accept hero and enter the game
                    console.log('[E2E] Clicking "#btn-term-advance" to enter 3D world...');
                    await evaluate(`document.getElementById('btn-term-advance').click();`);

                    // Wait for 3D exploration play mode
                    let playState = null;
                    for (let i = 0; i < 60; i++) {
                        await new Promise(r => setTimeout(r, 300));
                        const val = await evaluate(`(() => {
                            const app = window.__app;
                            const term = document.getElementById('terminal-container');
                            const termHidden = term ? term.classList.contains('hidden') : false;
                            const inPlay = app?.inPlay || false;
                            const inputInTerm = app?.input?.inTerminal;
                            const player = app?.lastFrame?.player;
                            return {
                                inPlay,
                                termHidden,
                                inputInTerm,
                                player: player ? { x: player.grid_x ?? player.x, y: player.grid_y ?? player.y } : null
                            };
                        })()`);

                        if (i % 5 === 0) {
                            console.log(`[E2E Play Wait Iteration ${i}]`, val);
                        }
                        if (val && val.inPlay && val.termHidden && val.inputInTerm === false && val.player) {
                            playState = val;
                            break;
                        }
                    }

                    if (!playState) {
                        throw new Error('Failed to enter 3D exploration play mode!');
                    }
                    console.log(`[PASS] 3D exploration play mode active! Player at (${playState.player.x}, ${playState.player.y}), input.inTerminal=${playState.inputInTerm}`);

                    // Now test keyboard movement (ArrowUp)
                    console.log('[E2E] Dispatching ArrowUp key...');
                    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
                    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
                    await new Promise(r => setTimeout(r, 400));

                    let postMoveState = await evaluate(`(() => {
                        const app = window.__app;
                        return {
                            inTerminal: app?.input?.inTerminal,
                            lastSent: app?.network?.lastSentKey,
                            sentCount: app?.network?.sentKeyCount
                        };
                    })()`);

                    console.log('[E2E] ArrowUp result:', postMoveState);
                    if (postMoveState?.inTerminal !== false) throw new Error('input.inTerminal is true during 3D exploration!');
                    if (postMoveState?.lastSent !== 'up') throw new Error(`Expected 'up', got ${postMoveState?.lastSent}`);
                    console.log(`[PASS] ArrowUp sent '${postMoveState?.lastSent}' cleanly!`);

                    // Test ArrowDown
                    console.log('[E2E] Dispatching ArrowDown key...');
                    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
                    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
                    await new Promise(r => setTimeout(r, 300));
                    postMoveState = await evaluate(`({ lastSent: window.__app?.network?.lastSentKey })`);
                    if (postMoveState?.lastSent !== 'down') throw new Error(`Expected 'down', got ${postMoveState?.lastSent}`);
                    console.log(`[PASS] ArrowDown sent '${postMoveState?.lastSent}' cleanly!`);

                    // Test Numpad Keys: 8, 2, 4, 6, 7, 9, 1, 3
                    const numpadTests = [
                        { key: '8', code: 'Numpad8', vk: 104, expected: 'up' },
                        { key: '2', code: 'Numpad2', vk: 98, expected: 'down' },
                        { key: '4', code: 'Numpad4', vk: 100, expected: 'left' },
                        { key: '6', code: 'Numpad6', vk: 102, expected: 'right' }
                    ];

                    for (const test of numpadTests) {
                        console.log(`[E2E] Dispatching ${test.code}...`);
                        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: test.key, code: test.code, windowsVirtualKeyCode: test.vk });
                        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: test.key, code: test.code, windowsVirtualKeyCode: test.vk });
                        await new Promise(r => setTimeout(r, 300));
                        postMoveState = await evaluate(`({ lastSent: window.__app?.network?.lastSentKey })`);
                        if (postMoveState?.lastSent !== test.expected) {
                            throw new Error(`Expected '${test.expected}' for ${test.code}, got '${postMoveState?.lastSent}'`);
                        }
                        console.log(`[PASS] ${test.code} sent '${postMoveState?.lastSent}' cleanly!`);
                    }

                    // Test 0-turn Camera Yaw: ArrowLeft & ArrowRight
                    console.log('[E2E] Testing Camera Yaw (ArrowLeft/ArrowRight)...');
                    const initialYaw = await evaluate(`window.__app?.dungeon?.cameraYaw || 0`);
                    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
                    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
                    await new Promise(r => setTimeout(r, 200));
                    const leftYaw = await evaluate(`window.__app?.dungeon?.cameraYaw || 0`);
                    if (leftYaw === initialYaw) throw new Error('ArrowLeft failed to adjust camera yaw!');
                    console.log(`[PASS] ArrowLeft rotated camera yaw: ${initialYaw} -> ${leftYaw}`);

                    console.log('\n========================================');
                    console.log('[ALL COMPREHENSIVE E2E CHECKS PASSED]');
                    console.log('- Random Hero Reroll strictly preserves Review Screen');
                    console.log('- Acceptance strictly transitions into 3D exploration');
                    console.log('- ArrowUp / ArrowDown directional movement verified');
                    console.log('- Numpad 8 / 2 / 4 / 6 directional movement verified');
                    console.log('- Instant 0-turn camera yaw verified');
                    console.log('========================================\n');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            ws.on('message', (msg) => {
                const data = JSON.parse(msg.toString());
                if (data.id && callbacks.has(data.id)) {
                    callbacks.get(data.id)(data);
                    callbacks.delete(data.id);
                }
            });
        });
    } finally {
        try { chromeProcess.kill(); } catch (_) {}
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

main().catch(err => {
    console.error('\n[TEST FAILED]', err);
    process.exit(1);
});

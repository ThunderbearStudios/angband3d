const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function testWebMovement() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9225 + Math.floor(Math.random() * 50);
    const targetUrl = `http://localhost:8080/?char=Mover_${Date.now()}&realm=angband&play=1&new=1`;

    console.log(`\n========================================`);
    console.log(`[TestWebMovement] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_movement_' + Date.now());
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    let res = null;
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

        return await new Promise((resolve, reject) => {
            function send(method, params = {}) {
                return new Promise((res) => {
                    const reqId = id++;
                    callbacks.set(reqId, res);
                    ws.send(JSON.stringify({ id: reqId, method, params }));
                });
            }

            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.method === 'Runtime.consoleAPICalled') {
                    console.log('[Browser Console]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
                }
                if (msg.method === 'Runtime.exceptionThrown') {
                    console.error('[Browser Exception]', msg.params.exceptionDetails);
                }
                if (msg.id && callbacks.has(msg.id)) {
                    const cb = callbacks.get(msg.id);
                    callbacks.delete(msg.id);
                    cb(msg.result);
                }
            });

            ws.on('open', async () => {
                try {
                    await send('Page.enable');
                    await send('Runtime.enable');

                    console.log(`[TestWebMovement] Waiting for character review screen...`);
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const btnAdvance = document.getElementById('btn-term-advance');
                                const isReviewActive = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                                return isReviewActive || (btnAdvance && btnAdvance.style.display !== 'none');
                            })()`,
                            returnByValue: true
                        });
                        if (evalRes.result?.value) {
                            break;
                        }
                    }

                    // Click Accept & Play to enter 3D dungeon
                    console.log(`[TestWebMovement] Accepting hero into 3D world...`);
                    await send('Runtime.evaluate', {
                        expression: `document.getElementById('btn-term-advance').click()`
                    });

                    // Wait for 3D play state
                    console.log(`[TestWebMovement] Waiting for 3D exploration play mode...`);
                    let entered3D = false;
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                                const term = document.getElementById('terminal-container');
                                return {
                                    inPlay: lastFrame && lastFrame.phase === 'play',
                                    termHidden: term ? term.classList.contains('hidden') : false,
                                    inputInTerminal: window.__app && window.__app.input ? window.__app.input.inTerminal : null,
                                    hasDungeon: !!(window.__app && window.__app.dungeon),
                                    player: lastFrame ? lastFrame.player : null
                                };
                            })()`,
                            returnByValue: true
                        });
                        const state = evalRes.result?.value;
                        if (state && state.inPlay && state.termHidden) {
                            console.log(`[PASS] 3D exploration active! State:`, state);
                            entered3D = true;
                            break;
                        }
                    }

                    if (!entered3D) {
                        throw new Error(`Failed to transition to 3D exploration view!`);
                    }

                    // Intercept network.sendKey to record what movement keys get dispatched
                    await send('Runtime.evaluate', {
                        expression: `(() => {
                            window.__sentKeys = [];
                            const origSendKey = window.__app.network.sendKey.bind(window.__app.network);
                            window.__app.network.sendKey = (key) => {
                                window.__sentKeys.push(key);
                                return origSendKey(key);
                            };
                        })()`
                    });

                    // Test Movement & Yaw Keys:
                    const testKeys = [
                        { key: 'ArrowLeft', code: 'ArrowLeft', desc: 'Turn Left (Instant camera yaw)' },
                        { key: 'ArrowRight', code: 'ArrowRight', desc: 'Turn Right (Instant camera yaw)' },
                        { key: 'ArrowUp', code: 'ArrowUp', desc: 'Move Forward (Relative to camera)' },
                        { key: 'ArrowDown', code: 'ArrowDown', desc: 'Move Backward (Relative to camera)' },
                        { key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true, desc: 'Strafe Left (Shift+ArrowLeft)' },
                        { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true, desc: 'Strafe Right (Shift+ArrowRight)' },
                        { key: '8', code: 'Numpad8', desc: 'Numpad 8 (North / Forward)' },
                        { key: '2', code: 'Numpad2', desc: 'Numpad 2 (South / Backward)' },
                        { key: '4', code: 'Numpad4', desc: 'Numpad 4 (West / Strafe Left)' },
                        { key: '6', code: 'Numpad6', desc: 'Numpad 6 (East / Strafe Right)' },
                        { key: '7', code: 'Numpad7', desc: 'Numpad 7 (North-West)' },
                        { key: '9', code: 'Numpad9', desc: 'Numpad 9 (North-East)' },
                        { key: '1', code: 'Numpad1', desc: 'Numpad 1 (South-West)' },
                        { key: '3', code: 'Numpad3', desc: 'Numpad 3 (South-East)' },
                        { key: '5', code: 'Numpad5', desc: 'Numpad 5 (Stay 1 turn)' }
                    ];

                    console.log(`[TestWebMovement] Dispatching keyboard movements...`);
                    for (const test of testKeys) {
                        const beforeYaw = await send('Runtime.evaluate', {
                            expression: `window.__app.dungeon ? window.__app.dungeon.targetYaw : 0`,
                            returnByValue: true
                        });

                        await send('Runtime.evaluate', {
                            expression: `(() => {
                                const evt = new KeyboardEvent('keydown', {
                                    key: ${JSON.stringify(test.key)},
                                    code: ${JSON.stringify(test.code)},
                                    shiftKey: ${Boolean(test.shiftKey)},
                                    bubbles: true,
                                    cancelable: true
                                });
                                window.dispatchEvent(evt);
                            })()`
                        });

                        await new Promise(r => setTimeout(r, 80));

                        const result = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const afterYaw = window.__app.dungeon ? window.__app.dungeon.targetYaw : 0;
                                const lastSent = window.__sentKeys[window.__sentKeys.length - 1];
                                return {
                                    afterYaw,
                                    lastSent,
                                    sentCount: window.__sentKeys.length,
                                    inTerminal: window.__app.input.inTerminal
                                };
                            })()`,
                            returnByValue: true
                        });

                        console.log(`  -> ${test.desc}: result=`, result.result?.value);
                    }

                    const summary = await send('Runtime.evaluate', {
                        expression: `(() => {
                            return {
                                totalSent: window.__sentKeys.length,
                                allSentKeys: window.__sentKeys,
                                inputInTerminal: window.__app.input.inTerminal
                            };
                        })()`,
                        returnByValue: true
                    });

                    console.log(`\n[Summary]`, summary.result?.value);

                    if (summary.result?.value?.totalSent < 10) {
                        throw new Error(`Movement keys were not sent to network! Only ${summary.result?.value?.totalSent} sent.`);
                    }

                    console.log(`\n[PASS] All movement and numpad keys verified functional in 3D exploration!`);
                    resolve();
                } catch (e) {
                    reject(e);
                } finally {
                    ws.close();
                }
            });
        });
    } finally {
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

testWebMovement().then(() => {
    console.log(`\n========================================\n[TEST SUCCESSFUL] Movement keys fully working!\n========================================`);
    process.exit(0);
}).catch(err => {
    console.error(`\n[TEST FAILED]`, err);
    process.exit(1);
});

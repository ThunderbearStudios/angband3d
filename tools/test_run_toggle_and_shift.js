const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function testRunToggleAndShift() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9235 + Math.floor(Math.random() * 50);
    const targetUrl = `http://localhost:8080/?char=Runner_${Date.now()}&realm=angband&play=1&new=1`;

    console.log(`\n========================================`);
    console.log(`[TestRunToggle] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_run_' + Date.now());
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
                    cb(msg);
                }
            });

            ws.on('open', async () => {
                try {
                    await send('Runtime.enable');
                    await send('Page.enable');

                    console.log('[TestRunToggle] Waiting for character review screen...');
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
                        if (evalRes.result?.result?.value || evalRes.result?.value) {
                            break;
                        }
                    }

                    // Click Accept & Play to enter 3D dungeon
                    console.log('[TestRunToggle] Accepting hero into 3D world...');
                    await send('Runtime.evaluate', {
                        expression: `
                            if (window.__app && typeof window.__app.confirmHeroBirth === 'function') {
                                window.__app.confirmHeroBirth();
                            }
                            const btn = document.getElementById('btn-term-advance');
                            if (btn) btn.click();
                        `
                    });

                    // Wait for 3D play state
                    console.log('[TestRunToggle] Waiting for 3D exploration play mode...');
                    let entered3D = false;
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                                const term = document.getElementById('terminal-container');
                                const d = window.__app ? window.__app.dungeon : null;
                                return {
                                    inPlay: Boolean(lastFrame && lastFrame.phase === 'play'),
                                    termHidden: term ? term.classList.contains('hidden') : false,
                                    hasDungeon: !!(d && d.wallMesh && d.wallMesh.count > 0),
                                    phase: lastFrame ? lastFrame.phase : null
                                };
                            })()`,
                            returnByValue: true
                        });
                        const state = evalRes.result?.result?.value || evalRes.result?.value;
                        if (i % 6 === 0) {
                            console.log(`  Waiting for 3D... state:`, state);
                        }
                        if (state && state.inPlay && state.termHidden) {
                            console.log(`[PASS] 3D exploration active! State:`, state);
                            entered3D = true;
                            break;
                        }
                        // Advance intro / welcome message prompt if still pending
                        await send('Runtime.evaluate', {
                            expression: `(() => {
                                const btnAdv = document.getElementById('btn-term-advance');
                                if (btnAdv && btnAdv.offsetParent !== null) {
                                    btnAdv.click();
                                } else if (window.__app && window.__app.network) {
                                    window.__app.network.sendKey('enter');
                                }
                                const btnStart = document.getElementById('btn-review-start');
                                if (btnStart && window.getComputedStyle(btnStart).display !== 'none') {
                                    btnStart.click();
                                }
                            })()`
                        });
                    }

                    if (!entered3D) {
                        throw new Error('Failed to transition to 3D exploration view!');
                    }

                    // Intercept network commands in test to track exact sent protocol strings
                    await send('Runtime.evaluate', {
                        expression: `
                            window.__sentHistory = [];
                            const origSend = window.__app.network.sendCommand.bind(window.__app.network);
                            window.__app.network.sendCommand = function(cmd) {
                                window.__sentHistory.push(cmd);
                                return origSend(cmd);
                            };
                            const origSendKey = window.__app.network.sendKey.bind(window.__app.network);
                            window.__app.network.sendKey = function(key) {
                                window.__sentHistory.push('key ' + key);
                                return origSendKey(key);
                            };
                        `
                    });

                    // Test 1: Verify initial Walk mode state
                    const test1 = await send('Runtime.evaluate', {
                        expression: `
                            ({
                                runMode: Boolean(window.__app.input.dpadRunMode),
                                btnRunText: document.getElementById('action-run-text') ? document.getElementById('action-run-text').textContent : null,
                                dpadRunText: document.getElementById('dpad-run-text') ? document.getElementById('dpad-run-text').textContent : null,
                                termRunText: document.querySelector('#term-run-toggle .term-run-text') ? document.querySelector('#term-run-toggle .term-run-text').textContent : null
                            })
                        `,
                        returnByValue: true
                    });
                    console.log('Test 1 (Initial Walk State):', test1.result.result.value);

                    // Test 2: Trigger Alt+R to toggle Run mode
                    await send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true }));
                        `
                    });
                    await new Promise(r => setTimeout(r, 100));

                    const test2 = await send('Runtime.evaluate', {
                        expression: `
                            ({
                                runMode: Boolean(window.__app.input.dpadRunMode),
                                btnRunText: document.getElementById('action-run-text') ? document.getElementById('action-run-text').textContent : null,
                                btnHasClass: document.getElementById('btn-run-toggle') ? document.getElementById('btn-run-toggle').classList.contains('run-active') : false,
                                dpadHasClass: document.getElementById('dpad-run-toggle') ? document.getElementById('dpad-run-toggle').classList.contains('dpad-run-active') : false,
                                termHasClass: document.getElementById('term-run-toggle') ? document.getElementById('term-run-toggle').classList.contains('active') : false
                            })
                        `,
                        returnByValue: true
                    });
                    console.log('Test 2 (After Alt+R -> Run Mode ON):', test2.result.result.value);
                    if (!test2.result.result.value.runMode) throw new Error('Alt+R failed to toggle runMode to true');
                    if (!test2.result.result.value.btnHasClass) throw new Error('btn-run-toggle missing run-active class');

                    // Test 3: In Run mode, pressing ArrowUp must dispatch atomic "keys .8" (sprint)
                    await send('Runtime.evaluate', {
                        expression: `
                            window.__sentHistory = [];
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
                        `
                    });
                    await new Promise(r => setTimeout(r, 100));

                    const test3 = await send('Runtime.evaluate', {
                        expression: `window.__sentHistory`,
                        returnByValue: true
                    });
                    console.log('Test 3 (ArrowUp in Run Mode):', test3.result.result.value);
                    const lastCmd = test3.result.result.value[test3.result.result.value.length - 1];
                    if (!lastCmd || !lastCmd.startsWith('keys .')) {
                        throw new Error(`Expected atomic 'keys .<digit>', got: ${lastCmd}`);
                    }
                    console.log(`  -> Verified atomic run command: '${lastCmd}'`);

                    // Test 4: Toggle Run Mode OFF via #btn-run-toggle click
                    await send('Runtime.evaluate', {
                        expression: `
                            document.getElementById('btn-run-toggle').click();
                        `
                    });
                    await new Promise(r => setTimeout(r, 100));

                    const test4 = await send('Runtime.evaluate', {
                        expression: `
                            ({
                                runMode: Boolean(window.__app.input.dpadRunMode),
                                btnHasClass: document.getElementById('btn-run-toggle') ? document.getElementById('btn-run-toggle').classList.contains('run-active') : false
                            })
                        `,
                        returnByValue: true
                    });
                    console.log('Test 4 (After clicking #btn-run-toggle -> Walk Mode):', test4.result.result.value);
                    if (test4.result.result.value.runMode) throw new Error('Clicking btn-run-toggle failed to toggle runMode to false');

                    // Test 5: In Walk mode, normal ArrowUp sends 'key up' (single precision step)
                    await send('Runtime.evaluate', {
                        expression: `
                            window.__sentHistory = [];
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
                        `
                    });
                    await new Promise(r => setTimeout(r, 100));

                    const test5 = await send('Runtime.evaluate', {
                        expression: `window.__sentHistory`,
                        returnByValue: true
                    });
                    console.log('Test 5 (ArrowUp in Walk Mode):', test5.result.result.value);
                    if (test5.result.result.value[0] !== 'key up') {
                        throw new Error(`Expected 'key up', got: ${test5.result.result.value[0]}`);
                    }

                    // Test 6: In Walk mode, holding Shift + ArrowUp sends atomic "keys .8" (sprint)
                    await send('Runtime.evaluate', {
                        expression: `
                            window.__sentHistory = [];
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
                        `
                    });
                    await new Promise(r => setTimeout(r, 100));

                    const test6 = await send('Runtime.evaluate', {
                        expression: `window.__sentHistory`,
                        returnByValue: true
                    });
                    console.log('Test 6 (Shift + ArrowUp in Walk Mode):', test6.result.result.value);
                    const shiftCmd = test6.result.result.value[test6.result.result.value.length - 1];
                    if (!shiftCmd || !shiftCmd.startsWith('keys .')) {
                        throw new Error(`Expected atomic 'keys .<digit>' on Shift+ArrowUp, got: ${shiftCmd}`);
                    }
                    console.log(`  -> Verified Shift+ArrowUp atomic run command: '${shiftCmd}'`);

                    // Test 7: Toggle Run mode ON via terminal touch button #term-run-toggle
                    await send('Runtime.evaluate', {
                        expression: `
                            document.getElementById('term-run-toggle').click();
                        `
                    });
                    await new Promise(r => setTimeout(r, 100));

                    const test7 = await send('Runtime.evaluate', {
                        expression: `Boolean(window.__app.input.dpadRunMode)`,
                        returnByValue: true
                    });
                    console.log('Test 7 (After clicking #term-run-toggle): runMode =', test7.result.result.value);
                    if (!test7.result.result.value) throw new Error('#term-run-toggle failed to toggle runMode');

                    console.log('\n========================================');
                    console.log('[ALL RUN TESTS PASSED SUCCESSFULLY!]');
                    console.log('========================================\n');
                    resolve(true);
                } catch (e) {
                    reject(e);
                }
            });
        });
    } finally {
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

testRunToggleAndShift()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[TEST FAILED]', err);
        process.exit(1);
    });

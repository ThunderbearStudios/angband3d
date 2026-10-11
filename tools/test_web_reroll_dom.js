const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function testWebReroll(realm) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9225 + Math.floor(Math.random() * 50);
    const targetUrl = `http://localhost:8080/?char=WebHero_${realm}_${Date.now()}&realm=${realm}&play=1&new=1`;

    console.log(`\n========================================`);
    console.log(`[TestWebReroll ${realm}] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_reroll_' + Date.now());
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 1500));

    try {
        const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
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

                    console.log(`[TestWebReroll ${realm}] Waiting for character review screen to pause auto-birth...`);
                    let reviewActive = false;
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const btnReroll = document.getElementById('btn-term-reroll');
                                const btnAdvance = document.getElementById('btn-term-advance');
                                const title = document.getElementById('terminal-title');
                                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                                const isReviewActive = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                                return {
                                    isReviewActive,
                                    rerollDisplay: btnReroll ? btnReroll.style.display : null,
                                    advanceText: btnAdvance ? btnAdvance.textContent : null,
                                    titleText: title ? title.textContent : null,
                                    phase: lastFrame ? lastFrame.phase : null
                                };
                            })()`,
                            returnByValue: true
                        });
                        const state = evalRes.result?.value;
                        if (state && (state.isReviewActive || state.rerollDisplay === 'inline-flex')) {
                            console.log(`[PASS] Character Review Screen paused cleanly! State:`, state);
                            reviewActive = true;
                            break;
                        }
                    }

                    if (!reviewActive) {
                        throw new Error(`Review screen did not pause auto-birth within 20s!`);
                    }

                    // 2. Click Reroll Button
                    console.log(`[TestWebReroll ${realm}] Clicking Reroll button [🎲 Reroll Hero (R)]...`);
                    await send('Runtime.evaluate', {
                        expression: `document.getElementById('btn-term-reroll').click()`
                    });

                    // 3. Wait for second review screen pause
                    console.log(`[TestWebReroll ${realm}] Waiting for newly rolled character review screen...`);
                    let secondReviewActive = false;
                    await new Promise(r => setTimeout(r, 1000));
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const btnReroll = document.getElementById('btn-term-reroll');
                                const isReviewActive = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                                return isReviewActive || (btnReroll && btnReroll.style.display === 'inline-flex');
                            })()`,
                            returnByValue: true
                        });
                        if (evalRes.result?.value) {
                            console.log(`[PASS] Second review screen reached after re-roll!`);
                            secondReviewActive = true;
                            break;
                        }
                    }

                    if (!secondReviewActive) {
                        throw new Error(`Second review screen did not appear after clicking Reroll!`);
                    }

                    // 4. Click Accept & Play Button
                    console.log(`[TestWebReroll ${realm}] Clicking Accept & Play button [⚔ Accept & Play (Enter)]...`);
                    await send('Runtime.evaluate', {
                        expression: `document.getElementById('btn-term-advance').click()`
                    });

                    // 5. Verify transition to 3D World View
                    console.log(`[TestWebReroll ${realm}] Waiting for 3D world view transition...`);
                    let entered3D = false;
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                                const term = document.getElementById('terminal-container');
                                const inPlay = lastFrame && lastFrame.phase === 'play' && lastFrame.map;
                                const termHidden = term ? term.classList.contains('hidden') : false;
                                const fullRows = (lastFrame?.term?.rows || []).map(r => r.g || '').filter(s => s.trim().length > 0);
                                return { inPlay: !!inPlay, termHidden, playerName: lastFrame?.player?.name, phase: lastFrame?.phase, fullRows: fullRows.slice(-5) };
                            })()`,
                            returnByValue: true
                        });
                        const state = evalRes.result?.value;
                        if (i % 2 === 0 || (state && state.inPlay)) {
                            console.log(`[TestWebReroll ${realm}] Check state (iter ${i}):`, state);
                        }
                        if (state && state.inPlay && state.termHidden) {
                            console.log(`[PASS] Successfully entered 3D World View! Player: "${state.playerName}"`);
                            entered3D = true;
                            break;
                        }
                    }

                    if (!entered3D) {
                        throw new Error(`Did not transition into 3D world view after clicking Accept!`);
                    }

                    ws.close();
                    chrome.kill();
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
                    resolve();
                } catch (err) {
                    ws.close();
                    chrome.kill();
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
                    reject(err);
                }
            });
        });
    } catch (e) {
        chrome.kill();
        throw e;
    }
}

async function run() {
    await testWebReroll('silq');
    await testWebReroll('angband');
    console.log(`\n========================================`);
    console.log(`[ALL WEB TESTS PASSED] Re-roll flow and 3D world view transition verified in Chrome DOM!`);
    console.log(`========================================\n`);
}

run().catch(err => {
    console.error('\n[FATAL WEB TEST ERROR]', err);
    process.exit(1);
});

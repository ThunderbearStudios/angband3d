const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function testVanilla3DRun() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9250 + Math.floor(Math.random() * 40);
    const charName = `RunTester_${Date.now()}`;
    const targetUrl = `http://localhost:8080/?char=${charName}&realm=angband&play=1&new=1`;

    console.log(`[TestVanilla3DRun] Chrome port ${port}, URL: ${targetUrl}`);
    const tempDir = path.join(__dirname, 'temp_chrome_run3d_' + Date.now());
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
                return new Promise((r) => {
                    const reqId = id++;
                    callbacks.set(reqId, r);
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

                    console.log('Waiting for birth review or 3D...');
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

                    // Advance into 3D
                    await send('Runtime.evaluate', {
                        expression: `
                            if (window.__app && typeof window.__app.confirmHeroBirth === 'function') {
                                window.__app.confirmHeroBirth();
                            }
                            const btn = document.getElementById('btn-term-advance');
                            if (btn) btn.click();
                        `
                    });

                    let entered3D = false;
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                                const term = document.getElementById('terminal-container');
                                return {
                                    inPlay: Boolean(lastFrame && lastFrame.phase === 'play'),
                                    termHidden: term ? term.classList.contains('hidden') : false,
                                    player: lastFrame ? lastFrame.player : null
                                };
                            })()`,
                            returnByValue: true
                        });
                        const state = evalRes.result?.result?.value || evalRes.result?.value;
                        if (state && state.inPlay && state.termHidden) {
                            console.log('Entered 3D exploration! Player:', state.player?.x, state.player?.y);
                            entered3D = true;
                            break;
                        }
                        await send('Runtime.evaluate', {
                            expression: `(() => {
                                const btnAdv = document.getElementById('btn-term-advance');
                                if (btnAdv && btnAdv.offsetParent !== null) btnAdv.click();
                                else if (window.__app && window.__app.network) window.__app.network.sendKey('enter');
                            })()`
                        });
                    }

                    if (!entered3D) throw new Error('Could not enter 3D');

                    // Check player position before run
                    const beforePos = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const p = window.__app.getLastFrame().player;
                            const d = window.__app.dungeon;
                            return { x: p.x, y: p.y, facing: d ? d.facing : null };
                        })()`,
                        returnByValue: true
                    });
                    const diag = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const f = window.__app.getLastFrame();
                            const p = f.player;
                            const d = window.__app.dungeon;
                            const map = f.map ? f.map.rows.map(r => r.g) : [];
                            return {
                                x: p.x,
                                y: p.y,
                                facing: d ? d.facing : null,
                                tileCurrent: map[p.y] ? map[p.y][p.x] : '?',
                                tileNorth: map[p.y - 1] ? map[p.y - 1][p.x] : '?',
                                tileSouth: map[p.y + 1] ? map[p.y + 1][p.x] : '?',
                                tileWest: map[p.y] ? map[p.y][p.x - 1] : '?',
                                tileEast: map[p.y] ? map[p.y][p.x + 1] : '?',
                                awaiting: f.awaiting_command,
                                ui: f.ui
                            };
                        })()`,
                        returnByValue: true
                    });
                    console.log('Diag before run:', JSON.stringify(diag.result.result.value));

                    // Now press Shift+ArrowDown to run South into open space
                    console.log('Dispatching keydown: Shift+ArrowDown');
                    await send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', shiftKey: true, bubbles: true }));
                        `
                    });

                    await new Promise(r => setTimeout(r, 1000));

                    const diagAfter = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const f = window.__app.getLastFrame();
                            const p = f.player;
                            return {
                                x: p.x,
                                y: p.y,
                                messages: f.messages || [],
                                lastSentKey: window.__app.network.lastSentKey,
                                sentCount: window.__app.network.sentKeyCount
                            };
                        })()`,
                        returnByValue: true
                    });
                    console.log('Diag after Shift+ArrowDown:', JSON.stringify(diagAfter.result.result.value));

                    // Now toggle Run mode via Alt+R
                    console.log('Toggling Run Mode with Alt+R...');
                    await send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true }));
                        `
                    });
                    await new Promise(r => setTimeout(r, 200));

                    const runState = await send('Runtime.evaluate', {
                        expression: `Boolean(window.__app.input.dpadRunMode)`,
                        returnByValue: true
                    });
                    console.log('Run Mode is:', runState.result.result.value);

                    // Press ArrowDown in Run Mode
                    console.log('Dispatching keydown: ArrowDown in Run Mode');
                    await send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
                        `
                    });
                    await new Promise(r => setTimeout(r, 1000));

                    const afterRunTogglePos = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const p = window.__app.getLastFrame().player;
                            return { x: p.x, y: p.y };
                        })()`,
                        returnByValue: true
                    });
                    console.log('After ArrowDown in Run Mode pos:', afterRunTogglePos.result.result.value);

                    resolve(true);
                } catch(e) {
                    reject(e);
                }
            });
        });
    } finally {
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

testVanilla3DRun()
    .then(() => { console.log('Done testVanilla3DRun'); process.exit(0); })
    .catch(e => { console.error('Failed testVanilla3DRun:', e); process.exit(1); });

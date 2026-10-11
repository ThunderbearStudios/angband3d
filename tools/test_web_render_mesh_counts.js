const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function testRealm(realm, screenshotName) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9223 + Math.floor(Math.random() * 50);
    const targetUrl = `http://localhost:8080/?char=TestWeb_${realm}_${Date.now()}&realm=${realm}&play=1&new=1`;

    console.log(`\n[TestWeb ${realm}] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_profile_' + Date.now());
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
                if (msg.id && callbacks.has(msg.id)) {
                    const cb = callbacks.get(msg.id);
                    callbacks.delete(msg.id);
                    cb(msg.result);
                }
            });

            ws.on('open', async () => {
                await send('Page.enable');
                await send('Runtime.enable');

                // Wait for WebSocket connection
                await send('Runtime.evaluate', {
                    expression: 'new Promise(resolve => { const check = () => { if (window.__app && window.__app.network && window.__app.network.connected) resolve(); else setTimeout(check, 100); }; check(); })',
                    awaitPromise: true
                });
                await new Promise(r => setTimeout(r, 800));

                if (realm === 'silq') {
                    await send('Runtime.evaluate', {
                        expression: 'if (window.__app && window.__app.selectRealm) window.__app.selectRealm("silq", false);'
                    });
                    await new Promise(r => setTimeout(r, 400));
                }

                // Click quick birth button
                await send('Runtime.evaluate', {
                    expression: 'const b = document.getElementById("btn-quick-birth"); if (b) b.click();'
                });

                // Wait up to 30s for dungeon to enter play
                let entered = false;
                for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    const check = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const app = window.__app;
                            if (!app || !app.lastFrame) return null;
                            const f = app.lastFrame;
                            const d = app.dungeon;
                            return {
                                phase: f.phase,
                                depth: f.player ? f.player.depth : null,
                                wallCount: d && d.wallMesh ? d.wallMesh.count : 0,
                                permWallCount: d && d.permWallMesh ? d.permWallMesh.count : 0,
                                townTreeCount: d && d.townTreeMesh ? d.townTreeMesh.count : 0,
                                sunlightCount: d && d.sunlightBeamMesh ? d.sunlightBeamMesh.count : 0,
                                floorCount: d && d.floorMesh ? d.floorMesh.count : 0,
                                ceilingCount: d && d.ceilingMesh ? d.ceilingMesh.count : 0,
                                starGroupVisible: d && d.starGroup ? d.starGroup.visible : false
                            };
                        })()`,
                        returnByValue: true
                    });

                    const val = check && check.result ? check.result.value : null;
                    if (i % 10 === 0) {
                        console.log(`[TestWeb ${realm}] step ${i}: phase=${val ? val.phase : 'null'}`);
                    }
                    if (val && val.phase === 'setup') {
                        await send('Runtime.evaluate', {
                            expression: `(() => {
                                const app = window.__app;
                                if (app && app.network && app.network.sendKey) {
                                    app.network.sendKey('enter');
                                }
                            })()`
                        });
                    }
                    if (val && val.phase === 'play') {
                        console.log(`[TestWeb ${realm}] ENTERED PLAY! State:`, val);
                        entered = true;

                        // Ensure 3D view is visible and turn camera south towards plaza
                        await send('Runtime.evaluate', {
                            expression: `(async () => {
                                const app = window.__app;
                                if (app && app.network && app.network.sendKey) {
                                    app.network.sendKey('escape');
                                    await new Promise(r => setTimeout(r, 300));
                                    app.network.sendKey('escape');
                                    await new Promise(r => setTimeout(r, 300));
                                }
                                if (app && app.setForceTerminal) {
                                    app.setForceTerminal(false);
                                }
                                const term = document.getElementById("terminal-container");
                                if (term) term.classList.add("hidden");
                                document.body.classList.remove("terminal-mode-active");
                                if (app && app.dungeon && app.dungeon.camera) {
                                    app.dungeon.cameraYaw = Math.PI;
                                    app.dungeon.camera.rotation.y = Math.PI;
                                }
                            })()`,
                            awaitPromise: true
                        });
                        await new Promise(r => setTimeout(r, 1000));

                        // Take screenshot
                        const shot = await send('Page.captureScreenshot', { format: 'png' });
                        if (shot && shot.data) {
                            const buf = Buffer.from(shot.data, 'base64');
                            const outPath = path.join(__dirname, screenshotName);
                            fs.writeFileSync(outPath, buf);
                            console.log(`[TestWeb ${realm}] Screenshot saved: ${outPath} (${buf.length} bytes)`);
                        }
                        break;
                    }
                }

                ws.close();
                chrome.kill();
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
                resolve(entered);
            });

            setTimeout(() => {
                ws.close();
                chrome.kill();
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
                resolve(false);
            }, 35000);
        });
    } catch(err) {
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
        console.error(`[TestWeb ${realm}] Error:`, err);
        return false;
    }
}

async function run() {
    const vanillaOk = await testRealm('angband', 'vanilla_town_web.png');
    const silqOk = await testRealm('silq', 'silq_50ft_web.png');

    console.log(`\n================================`);
    console.log(`Vanilla Play Test: ${vanillaOk ? 'PASS' : 'FAIL'}`);
    console.log(`Sil-Q Play Test:   ${silqOk ? 'PASS' : 'FAIL'}`);
    console.log(`================================`);
    process.exit(vanillaOk && silqOk ? 0 : 1);
}

run();

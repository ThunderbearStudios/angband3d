const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function verify() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9240 + Math.floor(Math.random() * 40);
    const targetUrl = `http://localhost:8080/?char=VerifyTown_${Date.now()}&realm=angband&play=1&new=1`;

    console.log(`[Verify] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_verify_' + Date.now());
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 1800));

    try {
        const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
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

            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
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

                    // Wait for WebSocket connection
                    await send('Runtime.evaluate', {
                        expression: 'new Promise(resolve => { const check = () => { if (window.__app && window.__app.network && window.__app.network.connected) resolve(); else setTimeout(check, 100); }; check(); })',
                        awaitPromise: true
                    });
                    await new Promise(r => setTimeout(r, 600));

                    // Click quick birth button if present
                    await send('Runtime.evaluate', {
                        expression: 'const b = document.getElementById("btn-quick-birth"); if (b) b.click();'
                    });

                    // Loop through birth screens or until play
                    for (let step = 0; step < 40; step++) {
                        await new Promise(r => setTimeout(r, 400));
                        const stateCheck = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const app = window.__app;
                                if (!app || !app.lastFrame) return null;
                                return { phase: app.lastFrame.phase };
                            })()`,
                            returnByValue: true
                        });
                        const phase = stateCheck?.result?.value?.phase;
                        if (phase === 'play') {
                            console.log(`[Verify] Entered play at step ${step}!`);
                            break;
                        }
                        if (phase === 'setup' || phase === 'birth') {
                            await send('Runtime.evaluate', {
                                expression: `if (window.__app && window.__app.network) window.__app.network.sendKey('enter');`
                            });
                        }
                    }

                    // Settle 3D rendering
                    await new Promise(r => setTimeout(r, 1500));

                    // Evaluate 3D scene & audio configuration
                    const evalRes = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const d = window.__dungeon3d;
                            const hasSunbeamProperty = d ? Boolean(d.sunbeamMesh) : false;
                            let cylinderCount = 0;
                            if (d && d.scene) {
                                d.scene.traverse(node => {
                                    if (node.geometry && node.geometry.type === 'CylinderGeometry') {
                                        cylinderCount++;
                                    }
                                });
                            }
                            const narratorVoice = window.chronicleManager?.audio?.narratorVoice || null;
                            const ttsEngine = window.chronicleManager?.audio?.ttsEngine || null;
                            const realm = window.__app?.getActiveRealm ? window.__app.getActiveRealm() : 'unknown';
                            return {
                                realm,
                                hasSunbeamProperty,
                                cylinderCount,
                                narratorVoice,
                                ttsEngine,
                                floorCount: d ? d.floorMesh?.count : 0
                            };
                        })()`,
                        returnByValue: true
                    });

                    console.log('[Verify Result]:', evalRes.result?.value);
                    const val = evalRes.result?.value || {};

                    if (val.hasSunbeamProperty) {
                        throw new Error('dungeon3d still has sunbeamMesh property!');
                    }
                    if (val.cylinderCount > 0) {
                        throw new Error(`Found ${val.cylinderCount} CylinderGeometry objects in the scene! Light columns must be 0!`);
                    }
                    if (val.narratorVoice !== 'Enceladus') {
                        throw new Error(`Expected narrator voice Enceladus, got: ${val.narratorVoice}`);
                    }
                    if (val.ttsEngine !== 'gemini') {
                        throw new Error(`Expected ttsEngine gemini, got: ${val.ttsEngine}`);
                    }

                    console.log('✓ Zero light columns / cylinders verified in Vanilla Angband town!');
                    console.log('✓ Narrator strictly configured to Enceladus / gemini!');

                    // Capture screenshot
                    const shot = await send('Page.captureScreenshot', { format: 'png' });
                    const artifactDir = '<USER_HOME>\\.gemini\\antigravity-ide\\brain\\0f2347f6-5301-4e25-bf9f-1ec2dc5f436e';
                    const outPath = path.join(artifactDir, 'vanilla_town_no_light_columns.png');
                    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
                    console.log('✓ Saved screenshot to:', outPath);

                    ws.close();
                    resolve();
                } catch (err) {
                    ws.close();
                    reject(err);
                }
            });

            ws.on('error', reject);
        });
    } finally {
        chrome.kill('SIGTERM');
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

verify().then(() => {
    console.log('[All Verifications Passed Successfully]');
    process.exit(0);
}).catch(err => {
    console.error('[Verification Failed]:', err);
    process.exit(1);
});

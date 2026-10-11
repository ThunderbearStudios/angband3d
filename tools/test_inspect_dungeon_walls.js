const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function captureDungeonCorridor() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9288;
    const targetUrl = `http://localhost:8080/?char=DungeonWallTest_${Date.now()}&realm=angband&play=1&new=1`;

    console.log(`[CaptureDL1] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_dl1_' + Date.now());
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
                try {
                    await send('Page.enable');
                    await send('Runtime.enable');

                    // 1. Wait for Review Screen
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `document.getElementById('btn-term-advance') ? true : false`,
                            returnByValue: true
                        });
                        if (evalRes.result?.value) break;
                    }

                    // 2. Accept & Play
                    await send('Runtime.evaluate', {
                        expression: `document.getElementById('btn-term-advance').click()`
                    });

                    // 3. Wait for 3D play state
                    for (let i = 0; i < 40; i++) {
                        await new Promise(r => setTimeout(r, 500));
                        const evalRes = await send('Runtime.evaluate', {
                            expression: `(() => {
                                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                                const term = document.getElementById('terminal-container');
                                return lastFrame && lastFrame.phase === 'play' && term && term.classList.contains('hidden');
                            })()`,
                            returnByValue: true
                        });
                        if (evalRes.result?.value) break;
                    }

                    console.log(`[CaptureDL1] In Town! Now descending to DL 1 via wizard mode or stairs...`);
                    // Descend directly via network.sendKey
                    // In Angband wizard mode: Ctrl+A then 'd' or walking to stairs
                    // Or let's trigger wizard descent or find staircase
                    await send('Runtime.evaluate', {
                        expression: `(() => {
                            // Find down staircase in map (FEAT_MORE = 6)
                            const f = window.__app.getLastFrame();
                            const map = f ? f.map : null;
                            if (!map) return null;
                            let stair = null;
                            for (let y = 0; y < map.h; y++) {
                                for (let x = 0; x < map.w; x++) {
                                    const featHi = parseInt(map.rows[y].f[x*2], 16);
                                    const featLo = parseInt(map.rows[y].f[x*2+1], 16);
                                    if (((featHi << 4) | featLo) === 6) {
                                        stair = { x, y };
                                        break;
                                    }
                                }
                                if (stair) break;
                            }
                            return stair;
                        })()`,
                        returnByValue: true
                    });

                    // Send '>' to descend
                    console.log(`[CaptureDL1] Sending key '>' to descend...`);
                    await send('Runtime.evaluate', {
                        expression: `window.__app.network.sendKey('>')`
                    });

                    // Wait 2 seconds to check if we descended
                    await new Promise(r => setTimeout(r, 2000));

                    // Let's check depth
                    const depthCheck = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const f = window.__app.getLastFrame();
                            return {
                                depth: f && f.player ? f.player.depth : null,
                                wallMatMap: window.__app.dungeon ? (window.__app.dungeon.wallMaterial.map ? window.__app.dungeon.wallMaterial.map.image ? window.__app.dungeon.wallMaterial.map.image.src || 'canvas' : 'no-image' : 'no-map') : 'no-dungeon',
                                hasRoughness: window.__app.dungeon ? !!window.__app.dungeon.wallMaterial.roughnessMap : false,
                                biomeName: window.__app.dungeon && window.__app.dungeon.currentBiome ? window.__app.dungeon.currentBiome.name : null
                            };
                        })()`,
                        returnByValue: true
                    });
                    console.log(`[CaptureDL1] State after descend key:`, depthCheck.result?.value);

                    // Wait for rendering to stabilize
                    await new Promise(r => setTimeout(r, 1000));

                    const shot = await send('Page.captureScreenshot', { format: 'png' });
                    const outPath = path.join(__dirname, 'current_dungeon_walls.png');
                    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
                    console.log(`[CaptureDL1] Saved current_dungeon_walls.png!`);

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

captureDungeonCorridor().then(() => {
    console.log(`Done.`);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});

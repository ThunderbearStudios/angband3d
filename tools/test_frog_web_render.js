const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function run() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9225 + Math.floor(Math.random() * 50);
    const targetUrl = `http://localhost:8080/?char=Hero_FrogLive&realm=frogcomposband&play=1`;

    console.log(`[TestFrogWeb] Launching Chrome headless on port ${port}...`);
    const tempDir = path.join(__dirname, 'temp_chrome_frog_' + Date.now());
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

        const success = await new Promise((resolve) => {
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

                console.log('[TestFrogWeb] Connected to app! Driving birth flow...');

                // Drive birth inputs via window.__app.network.sendKey
                let inPlay = false;
                for (let step = 0; step < 30; step++) {
                    await new Promise(r => setTimeout(r, 600));
                    const status = await send('Runtime.evaluate', {
                        expression: `(() => {
                            const app = window.__app;
                            if (!app || !app.lastFrame) return { phase: 'unknown' };
                            const f = app.lastFrame;
                            const text = (f.term && f.term.rows ? f.term.rows.map(r => r.g || '').join('\\n') : '').toLowerCase();
                            return {
                                phase: f.phase,
                                overlay: f.ui ? f.ui.overlay : 0,
                                more: f.ui ? f.ui.more : false,
                                text: text
                            };
                        })()`,
                        returnByValue: true
                    });

                    const info = status && status.result ? status.result.value : null;
                    if (!info) continue;
                    console.log(`[Step ${step}] Phase=${info.phase}, more=${info.more}`);

                    if (info.phase === 'play') {
                        if (info.more || info.text.includes('-more-')) {
                            console.log('-> Passing in-game -more- prompt');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("space");' });
                            continue;
                        }
                        inPlay = true;
                        break;
                    }

                    if (info.phase === 'setup') {
                        if (info.text.includes('press any other key to play') || info.text.includes('press ? for credits')) {
                            console.log('-> Passing splash (space)');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("space");' });
                        } else if (info.text.includes('choose the type of game to play')) {
                            console.log('-> Selecting Beginner mode (b)');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("b");' });
                        } else if (info.text.includes('next screen') || info.text.includes('ret) next screen')) {
                            console.log('-> Accepting race/class (enter)');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("enter");' });
                        } else if (info.text.includes('begin play') || info.text.includes('ret) begin play') || info.text.includes('enter your starting stats')) {
                            console.log('-> Accepting stats & beginning play (enter)');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("enter");' });
                        } else if (info.text.includes('-more-') || info.more) {
                            console.log('-> Passing more prompt (space)');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("space");' });
                        } else {
                            console.log('-> Default enter');
                            await send('Runtime.evaluate', { expression: 'window.__app.network.sendKey("enter");' });
                        }
                    }
                }

                if (!inPlay) {
                    console.error('[TestFrogWeb] Failed to enter play within timeout!');
                    ws.close();
                    chrome.kill();
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
                    resolve(false);
                    return;
                }

                console.log('[TestFrogWeb] Entered play! Inspecting 3D dungeon meshes...');
                await new Promise(r => setTimeout(r, 1200));

                // Switch to 3D view and evaluate mesh instance counts
                const meshInfo = await send('Runtime.evaluate', {
                    expression: `(() => {
                        const app = window.__app;
                        const d = app.dungeon;
                        if (app.setForceTerminal) app.setForceTerminal(false);
                        const term = document.getElementById("terminal-container");
                        if (term) term.classList.add("hidden");
                        document.body.classList.remove("terminal-mode-active");

                        return {
                            treeTrunkCount: d.treeTrunkMesh ? d.treeTrunkMesh.count : 0,
                            treeLeavesCount: d.treeLeavesMesh ? d.treeLeavesMesh.count : 0,
                            grassCount: d.grassMesh ? d.grassMesh.count : 0,
                            dirtCount: d.dirtMesh ? d.dirtMesh.count : 0,
                            waterCount: d.waterMesh ? d.waterMesh.count : 0,
                            deepWaterCount: d.deepWaterMesh ? d.deepWaterMesh.count : 0,
                            mountainCount: d.mountainMesh ? d.mountainMesh.count : 0,
                            swampCount: d.swampMesh ? d.swampMesh.count : 0,
                            ceilingCount: d.ceilingMesh ? d.ceilingMesh.count : 0,
                            floorCount: d.floorMesh ? d.floorMesh.count : 0,
                            wallCount: d.wallMesh ? d.wallMesh.count : 0,
                            permWallCount: d.permWallMesh ? d.permWallMesh.count : 0,
                            goldVeinCount: d.goldVeinMesh ? d.goldVeinMesh.count : 0,
                            gemVeinCount: d.gemVeinMesh ? d.gemVeinMesh.count : 0,
                            starGroupVisible: d.starGroup ? d.starGroup.visible : false,
                            playerDepth: app.lastFrame && app.lastFrame.player ? app.lastFrame.player.depth : null
                        };
                    })()`,
                    returnByValue: true
                });

                const m = meshInfo && meshInfo.result ? meshInfo.result.value : null;
                console.log('\n========================================');
                console.log('[PASS] FrogComposBand 3D Mesh Inspection:');
                console.log('   Tree Trunks:    ', m.treeTrunkCount);
                console.log('   Tree Leaves:    ', m.treeLeavesCount);
                console.log('   Meadow Grass:   ', m.grassCount);
                console.log('   Dirt Road:      ', m.dirtCount);
                console.log('   Shallow Water:  ', m.waterCount);
                console.log('   Deep Water:     ', m.deepWaterCount);
                console.log('   Mountain Peaks: ', m.mountainCount);
                console.log('   Swamp / Bog:    ', m.swampCount);
                console.log('   Ceiling Count:  ', m.ceilingCount, '(Must be 0 over forest!)');
                console.log('   Star Canopy:    ', m.starGroupVisible);
                console.log('========================================\n');

                // Position camera right inside the forest grove facing the trees and river
                await send('Runtime.evaluate', {
                    expression: `(() => {
                        const app = window.__app;
                        if (app && app.dungeon) {
                            const x = 68, y = 25.5;
                            app.dungeon.currentCamPos.set(x * 2.0, 1.4, y * 2.0);
                            app.dungeon.targetCamPos.set(x * 2.0, 1.4, y * 2.0);
                            app.dungeon.camera.position.set(x * 2.0, 1.4, y * 2.0);
                            app.dungeon.cameraYaw = 0.2;
                            app.dungeon.userPitchOffset = 0.05;
                        }
                    })()`
                });
                await new Promise(r => setTimeout(r, 1000));

                // Take screenshot
                const shot = await send('Page.captureScreenshot', { format: 'png' });
                if (shot && shot.data) {
                    const buf = Buffer.from(shot.data, 'base64');
                    const outPath = path.join(__dirname, 'frog_forest_web.png');
                    fs.writeFileSync(outPath, buf);
                    console.log(`[TestFrogWeb] Screenshot saved: ${outPath} (${buf.length} bytes)`);
                }

                const isValid = m && m.treeTrunkCount > 0 && m.grassCount > 0 && m.ceilingCount === 0;
                ws.close();
                chrome.kill();
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
                resolve(isValid);
            });

            setTimeout(() => {
                ws.close();
                chrome.kill();
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e) {}
                resolve(false);
            }, 35000);
        });

        console.log(`Test Result: ${success ? 'ALL CHECKS PASSED' : 'FAILED'}`);
        process.exit(success ? 0 : 1);
    } catch (err) {
        console.error('[TestFrogWeb] Fatal error:', err);
        process.exit(1);
    }
}

run();

/**
 * capture_menu_fixtures.js
 * Captures JSON frame dumps of the inventory and equipment screens for each realm.
 * This is used to build resilient offline tests for the menu screen-context classifiers.
 */
let WebSocket;
try { WebSocket = require('ws'); } catch (_) { WebSocket = require('../server/node_modules/ws'); }
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'ws://127.0.0.1:8080/ws';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSession(realm, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
        const url = `${SERVER_URL}?realm=${realm}&new=1&user=FixtureProbe_${Date.now().toString(36)}`;
        console.log(`\n============================================================`);
        console.log(`Starting Fixture Capture for Realm: [${realm.toUpperCase()}]`);
        console.log(`============================================================`);

        const ws = new WebSocket(url);
        let finished = false;
        let lastFrame = null;
        const fixtures = {};

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                ws.close();
                resolve(fixtures);
            }
        }, timeoutMs);

        function cleanup() {
            clearTimeout(timer);
            finished = true;
            try { ws.close(); } catch (_) {}
        }

        ws.on('error', (err) => {
            if (!finished) {
                cleanup();
                reject(err);
            }
        });

        const frameWaiters = [];
        function waitForNextFrame(condition = null, timeout = 5000) {
            return new Promise((res, rej) => {
                const waiter = {
                    condition,
                    resolve: res,
                    reject: rej,
                    timer: setTimeout(() => {
                        const idx = frameWaiters.indexOf(waiter);
                        if (idx !== -1) frameWaiters.splice(idx, 1);
                        rej(new Error(`Timed out waiting for frame condition in ${realm}`));
                    }, timeout)
                };
                frameWaiters.push(waiter);
            });
        }

        function sendKey(k) {
            if (ws.readyState === WebSocket.OPEN) {
                if (k === '\r' || k === '\n') {
                    ws.send('key enter');
                } else if (k === '\x1b') {
                    ws.send('key escape');
                } else {
                    ws.send(`key ${k}`);
                }
            }
        }

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString('utf8'));
                if (msg.t === 'frame') {
                    lastFrame = msg;
                    if (msg.phase !== 'play') {
                        const rows = msg.term && msg.term.rows ? msg.term.rows.map(r => r.g || '') : [];
                        const rawScreen = rows.join('\n');
                        const screenText = rawScreen.toLowerCase();
                        
                        if (realm === 'hengband') {
                            if (screenText.includes('smart_learn') || screenText.includes('初期オプション')) {
                                sendKey('escape');
                                sendKey('\r');
                            } else if (screenText.includes('性別を選んで') || screenText.includes('種族を選んで') ||
                                       screenText.includes('職業を選んで') || screenText.includes('性格を選んで') ||
                                       screenText.includes('*でランダム') || screenText.includes('* for random')) {
                                sendKey('*');
                            } else if (screenText.includes('魔法領域') || screenText.includes('領域を選んで')) {
                                sendKey('a');
                            } else if (screenText.includes('よろしいですか') || screenText.includes('is this correct')) {
                                sendKey('y');
                            } else if (screenText.includes('何かキーを押してください')) {
                                sendKey('a');
                            }
                        } else if (realm === 'frogcomposband') {
                            if (screenText.includes('name:')) {
                                'FrogProbe\r'.split('').forEach(sendKey);
                            } else if (screenText.includes('options') && screenText.includes('esc')) {
                                sendKey('escape');
                            } else if (screenText.includes('yes,') && screenText.includes('no,')) {
                                sendKey('y');
                            } else if (screenText.includes('welcome') || screenText.includes('press any other key')) {
                                sendKey('\r');
                                sendKey('space');
                                sendKey('escape');
                            } else if (screenText.includes('-more-')) {
                                sendKey('space');
                            } else {
                                sendKey('space');
                            }
                        } else if (realm === 'silq') {
                            if (screenText.includes('-more-')) sendKey('space');
                            else if (screenText.includes('choose one')) sendKey('a');
                            else if (screenText.includes('points left') || screenText.includes('accept current')) sendKey('\r');
                            else if (screenText.includes('game options')) sendKey('\r');
                            else if (screenText.includes('reroll')) sendKey('\r');
                            else if (screenText.includes('name:') || screenText.includes('random name')) {
                                if (!ws.silqNameSent) {
                                    ws.silqNameSent = true;
                                    'SilQProbe\r'.split('').forEach(sendKey);
                                } else {
                                    sendKey('\r');
                                }
                            }
                            else sendKey('a');
                        } else if (realm === 'angband') {
                            if (screenText.includes('-more-')) sendKey('space');
                            else if (screenText.includes('choose one') || screenText.includes('selection')) sendKey('a');
                            else if (screenText.includes('name') || screenText.includes('select you')) {
                                'AngbandProbe\r'.split('').forEach(sendKey);
                            }
                            else sendKey('escape');
                        }
                    }

                    for (let i = frameWaiters.length - 1; i >= 0; i--) {
                        const waiter = frameWaiters[i];
                        if (!waiter.condition || waiter.condition(msg)) {
                            clearTimeout(waiter.timer);
                            frameWaiters.splice(i, 1);
                            waiter.resolve(msg);
                        }
                    }
                }
            } catch (e) { }
        });

        ws.on('open', async () => {
            try {
                console.log(`[${realm}] Awaiting 'play' phase...`);
                await waitForNextFrame(f => f.phase === 'play', 20000);
                
                await waitForNextFrame(f => f.ui && f.ui.awaiting_command && f.ui.overlay === 0, 5000).catch(()=>{});
                await delay(1000);
                console.log(`[${realm}] Reached top-level play mode.`);
                
                const captureMenu = async (key, name) => {
                    let escapeCount = 0;
                    while (!lastFrame || !lastFrame.ui || !lastFrame.ui.awaiting_command || lastFrame.ui.overlay > 0 || lastFrame.ui.more) {
                        if (escapeCount++ > 15) break;
                        sendKey('escape');
                        await delay(200);
                        sendKey('space');
                        await delay(200);
                    }
                    console.log(`[${realm}] Sending '${key}' to open ${name}...`);
                    sendKey(key);
                    await delay(500); // Wait for the menu to render
                    
                    fixtures[name] = lastFrame;
                    console.log(`[${realm}] Captured ${name} frame.`);
                    
                    sendKey('escape');
                    await delay(200);
                    sendKey('escape');
                    await delay(200);
                };

                await captureMenu('i', 'inventory');
                await captureMenu('e', 'equipment');
                
                cleanup();
                resolve(fixtures);
            } catch (e) {
                cleanup();
                reject(e);
            }
        });
    });
}

async function main() {
    const realms = ['angband', 'silq', 'frogcomposband', 'hengband'];
    const outDir = path.join(__dirname, 'fixtures', 'menus');
    
    for (const r of realms) {
        try {
            const result = await runSession(r);
            const realmDir = path.join(outDir, r);
            if (!fs.existsSync(realmDir)) fs.mkdirSync(realmDir, { recursive: true });
            
            for (const [name, frame] of Object.entries(result)) {
                if (frame) {
                    const outFile = path.join(realmDir, `${name}.json`);
                    fs.writeFileSync(outFile, JSON.stringify(frame, null, 2));
                    console.log(`Wrote ${outFile}`);
                }
            }
        } catch (e) {
            console.error(`Failed ${r}:`, e);
        }
    }
    process.exit(0);
}

main();

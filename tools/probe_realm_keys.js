/**
 * tools/probe_realm_keys.js
 * WS6.1: Probe top-level command keys across all 4 realms.
 *
 * For each realm:
 * 1. Connect via WebSocket and finish birth using the standard automaton.
 * 2. At awaiting_command frame (top-level world command), send each candidate key.
 * 3. Capture row 0 (the prompt or message).
 * 4. Send escape (twice if needed) to return to awaiting_command.
 * 5. Write tools/fixtures/realm_keys/<realm>.json as { key: promptRow0 }.
 */

let WebSocket;
try { WebSocket = require('ws'); } catch (_) { WebSocket = require('../server/node_modules/ws'); }
const fs = require('fs');
const path = require('path');
const SC = require('../server/public/js/screen-context.js');

let SJIS_TD = null;
try { SJIS_TD = new TextDecoder('shift_jis'); } catch (_) {}
const decode = (s) => SC.decodeSjis(s, SJIS_TD);

const SERVER_URL = 'ws://127.0.0.1:8080/ws';
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'realm_keys');

const CANDIDATE_KEYS = [
    'm', 's', 'v', 't', 'f', 'q', 'r', 'R', '%', 'o', 'g', 'i', 'e', 'U',
    'b', 'G', 'N', 'O', 'Q', ',', '.', '5', 'Z', 'z', 'a', 'u', 'E', 'A', 'tab'
];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function runSession(realm, sessionName, timeoutMs = 35000) {
    return new Promise((resolve, reject) => {
        const url = `${SERVER_URL}?realm=${realm}&new=1&user=${sessionName}_${Date.now().toString(36)}`;
        console.log(`\n============================================================`);
        console.log(`Starting Key Probe for Realm: [${realm.toUpperCase()}]`);
        console.log(`URL: ${url}`);
        console.log(`============================================================`);

        const ws = new WebSocket(url);
        let finished = false;
        let lastFrame = null;
        let silqStatAllocated = false;
        let silqNameSent = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                try { ws.close(); } catch (_) {}
                reject(new Error(`Timeout (${timeoutMs}ms) exceeded for realm ${realm}`));
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

        function waitForNextFrame(condition = null, timeout = 15000) {
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
                ws.send(`key ${k}`);
            }
        }

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString('utf8'));
                if (msg.t === 'frame') {
                    lastFrame = msg;

                    // Birth automation
                    if (msg.phase !== 'play') {
                        const rawScreen = (msg.term && msg.term.rows ? msg.term.rows.map(r => r.g || '').join('\n') : '');
                        const screenText = rawScreen.toLowerCase();

                        if (realm === 'hengband') {
                            if (screenText.includes('smart_learn') || (screenText.includes('初期オプション') && screenText.includes('esc:終了'))) {
                                sendKey('escape');
                            } else if (screenText.includes('性別を選んで') || screenText.includes('種族を選んで') ||
                                       screenText.includes('職業を選んで') || screenText.includes('性格を選んで') ||
                                       screenText.includes('*でランダム') || screenText.includes('* for random')) {
                                sendKey('*');
                            } else if (screenText.includes('魔法領域') || screenText.includes('領域を選んで')) {
                                sendKey('a');
                            } else if (screenText.includes('能力値を抽選') || screenText.includes('能力値決定') || screenText.includes('この数値に決定')) {
                                sendKey('enter');
                            } else if (screenText.includes('よろしいですか') || screenText.includes('[y/n]') || screenText.includes('(y/n)')) {
                                sendKey('y');
                            } else if (screenText.includes('名前を入力') || screenText.includes('キャラクターの名前') || screenText.includes('生い立ち') || screenText.includes('冒険に出ますか') || screenText.includes('ゲーム開始')) {
                                sendKey('enter');
                            } else {
                                sendKey('enter');
                            }
                        } else if (realm === 'frogcomposband') {
                            if (screenText.includes('choose the type of game to play')) {
                                sendKey('b');
                            } else if (screenText.includes('[y/n]')) {
                                sendKey('y');
                            } else {
                                sendKey('enter');
                            }
                        } else if (realm === 'angband') {
                            if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('quick-start') || screenText.includes('based on previous')) {
                                sendKey('y');
                            } else if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
                                sendKey('@');
                            } else if (screenText.includes('press any key') || screenText.includes('-more-')) {
                                sendKey('enter');
                            } else {
                                sendKey('@');
                            }
                        } else if (realm === 'silq') {
                            if (screenText.includes('allocate points to skills') || screenText.includes('accept skills')) {
                                sendKey('enter');
                            } else if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                                if (!silqStatAllocated) {
                                    silqStatAllocated = true;
                                    ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'].forEach(k => sendKey(k));
                                }
                            } else if (screenText.includes('choose house') || screenText.includes('choose your race')) {
                                sendKey('*');
                            } else if (screenText.includes('tab random name') || screenText.includes('enter accept name')) {
                                if (!silqNameSent) {
                                    silqNameSent = true;
                                    sendKey('tab');
                                    sendKey('enter');
                                }
                            } else {
                                sendKey('enter');
                            }
                        }
                    }

                    // Check waiters
                    for (let i = frameWaiters.length - 1; i >= 0; i--) {
                        const fw = frameWaiters[i];
                        if (!fw.condition || fw.condition(msg)) {
                            clearTimeout(fw.timer);
                            frameWaiters.splice(i, 1);
                            fw.resolve(msg);
                        }
                    }
                }
            } catch (_) {}
        });

        ws.on('open', async () => {
            try {
                console.log(`[${realm}] Awaiting 'play' phase...`);
                await waitForNextFrame(f => f.phase === 'play', 15000);
                console.log(`[${realm}] Reached 'play' phase!`);
                resolve({
                    realm,
                    ws,
                    lastFrame: () => lastFrame,
                    sendKey,
                    waitForNextFrame,
                    cleanup
                });
            } catch (err) {
                cleanup();
                reject(err);
            }
        });
    });
}

async function resetToAwaitingCommand(session) {
    const { sendKey, lastFrame } = session;
    for (let i = 0; i < 6; i++) {
        const f = lastFrame();
        if (!f) {
            await delay(100);
            continue;
        }
        const ui = f.ui || {};
        const raw = SC.rawScreenText(f);
        if (ui.more || raw.includes('-more-')) {
            sendKey('space');
            await delay(150);
            continue;
        }
        if (ui.overlay > 0 || !ui.awaiting_command) {
            sendKey('escape');
            await delay(150);
            continue;
        }
        if (f.term && f.term.rows && f.term.rows[0] && f.term.rows[0].g && f.term.rows[0].g.trim()) {
            sendKey('space');
            await delay(150);
            continue;
        }
        if (ui.awaiting_command && (ui.overlay || 0) === 0) {
            return true;
        }
    }
    return false;
}

async function probeRealm(realm) {
    const session = await runSession(realm, 'KeyProbe');
    const { sendKey, lastFrame, cleanup } = session;

    try {
        await delay(300);
        await resetToAwaitingCommand(session);

        console.log(`[${realm}] Ready in play phase. Probing ${CANDIDATE_KEYS.length} keys...`);
        const results = {};

        for (const key of CANDIDATE_KEYS) {
            await resetToAwaitingCommand(session);

            // Send candidate key
            sendKey(key);
            await delay(250);
            const responseFrame = lastFrame();

            let row0 = '';
            if (responseFrame && responseFrame.term && responseFrame.term.rows && responseFrame.term.rows[0]) {
                row0 = responseFrame.term.rows[0].g || '';
                if (realm === 'hengband') {
                    row0 = decode(row0);
                }
                row0 = row0.trim();
            }

            // If row 0 is empty but another row has a prompt/title line, inspect it
            if (!row0 && responseFrame && responseFrame.term && responseFrame.term.rows) {
                for (let r = 1; r < responseFrame.term.rows.length; r++) {
                    const line = (responseFrame.term.rows[r].g || '').trim();
                    if (line && (line.endsWith(':') || line.endsWith('?') || line.includes('(y/n)') || line.includes('[y/n]') || line.includes('Skills'))) {
                        row0 = realm === 'hengband' ? decode(line) : line;
                        break;
                    }
                }
            }

            results[key] = row0;
            console.log(`  [${realm}] '${key}': "${row0}"`);

            // Reset back to top-level world command
            await resetToAwaitingCommand(session);
        }

        // Save results
        fs.mkdirSync(FIXTURES_DIR, { recursive: true });
        const fixturePath = path.join(FIXTURES_DIR, `${realm}.json`);
        fs.writeFileSync(fixturePath, JSON.stringify(results, null, 2) + '\n', 'utf8');
        console.log(`[${realm}] Saved fixture: ${fixturePath}`);
        return results;
    } finally {
        cleanup();
    }
}

async function main() {
    const realms = ['angband', 'silq', 'frogcomposband', 'hengband'];
    for (const r of realms) {
        await probeRealm(r);
        await delay(500);
    }
    console.log("\nAll realm keys probed successfully!");
    process.exit(0);
}

if (require.main === module) {
    main().catch(err => {
        console.error("Probing failed:", err);
        process.exit(1);
    });
}

module.exports = { probeRealm, CANDIDATE_KEYS };

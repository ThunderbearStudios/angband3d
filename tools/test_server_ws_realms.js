const WebSocket = require('../server/node_modules/ws');

const tdSjis = new TextDecoder('shift-jis');

function decodeHengbandText(str) {
    if (!str) return '';
    if (/[\u3000-\u9faf]/.test(str)) return str;
    let hasSjis = false;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0x81 && code <= 0x9f) || (code >= 0xe0 && code <= 0xfc)) {
            hasSjis = true;
            break;
        }
    }
    if (!hasSjis) return str;

    let result = '';
    for (let i = 0; i < str.length; i++) {
        const b1 = str.charCodeAt(i) & 0xff;
        if (((b1 >= 0x81 && b1 <= 0x9f) || (b1 >= 0xe0 && b1 <= 0xfc)) && i + 1 < str.length) {
            const b2 = str.charCodeAt(i + 1) & 0xff;
            try {
                result += tdSjis.decode(new Uint8Array([b1, b2]));
            } catch (_) {
                result += String.fromCharCode(b1, b2);
            }
            i++;
        } else if (b1 >= 0xa1 && b1 <= 0xdf) {
            try {
                result += tdSjis.decode(new Uint8Array([b1]));
            } catch (_) {
                result += String.fromCharCode(b1);
            }
        } else {
            result += String.fromCharCode(b1);
        }
    }
    return result;
}

function testRealm(realmName) {
    return new Promise((resolve, reject) => {
        console.log(`\n========================================`);
        console.log(`TESTING REALM: ${realmName}`);
        console.log(`========================================`);

        const ws = new WebSocket(`ws://localhost:8080/ws?user=TestHero_${realmName}&realm=${realmName}&new=1`);
        let step = 0;
        let enteredPlay = false;
        let silqStatAllocated = false;
        let silqNameSent = false;
        let fcbRandomized = false;

        const timer = setTimeout(() => {
            if (!enteredPlay) {
                ws.close();
                reject(new Error(`Timeout waiting for play in ${realmName}`));
            }
        }, 15000);

        ws.on('open', () => {
            console.log(`[${realmName}] WebSocket opened.`);
        });

        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.t === 'hello') {
                console.log(`[${realmName}] Hello received: version ${msg.version}, realm: ${msg.realm || realmName}`);
                return;
            }
            if (msg.t !== 'frame') {
                console.log(`[${realmName}] Non-frame msg received:`, msg.t, msg);
            }
            if (msg.t === 'frame') {
                const frame = msg;
                const rawText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
                const decodedText = decodeHengbandText(rawText);
                const screenText = (rawText + '\n' + decodedText).toLowerCase();

                step++;
                console.log(`[${realmName} step ${step}] phase: ${frame.phase}, awaiting: ${frame.awaiting_command}, more: ${frame.more}`);
                if (step <= 5) {
                    const preview = rawText.split('\n').filter(l => l.trim().length > 0).slice(0, 5).join(' | ');
                    console.log(`  Preview: ${preview}`);
                }

                if (frame.phase === 'play' && frame.map && frame.player) {
                    console.log(`[${realmName}] SUCCESS: Entered play!`);
                    console.log(`  Hero: ${frame.player.name}, Race: ${frame.player.race}, Class: ${frame.player.class}`);
                    console.log(`  Map: ${frame.map.width}x${frame.map.height}`);
                    enteredPlay = true;
                    clearTimeout(timer);
                    ws.close();
                    resolve(frame.player);
                    return;
                }

                if (realmName === 'hengband' && step <= 15) {
                    console.log(`\n[hengband step ${step}]`);
                    frame.term.rows.forEach((r, i) => {
                        const d = decodeHengbandText(r.g).trim();
                        if (d) console.log(`  [${i}]: ${d}`);
                    });
                }
                if (realmName === 'hengband') {
                    if (screenText.includes('smart_learn') || (screenText.includes('esc:終了') && screenText.includes('初期オプション'))) {
                        ws.send('key escape');
                    } else if (screenText.includes('性別を選んで') || screenText.includes('種族を選んで') ||
                               screenText.includes('職業を選んで') || screenText.includes('性格を選んで')) {
                        ws.send('key *');
                    } else if (screenText.includes('魔法領域') || screenText.includes('領域を選んで')) {
                        ws.send('key a');
                    } else if (screenText.includes('能力値を抽選') || screenText.includes('この数値に決定')) {
                        ws.send('key enter');
                    } else if (screenText.includes('よろしいですか') || screenText.includes('[y/n]')) {
                        ws.send('key y');
                    } else if (screenText.includes('名前を入力') || screenText.includes('生い立ち') || screenText.includes('ゲーム開始')) {
                        ws.send('key enter');
                    } else {
                        ws.send('key enter');
                    }
                } else if (realmName === 'frogcomposband') {
                    if (screenText.includes('choose the type of game to play')) {
                        ws.send('key n');
                    } else if (screenText.includes('change race') && screenText.includes('change class')) {
                        if (!fcbRandomized) {
                            fcbRandomized = true;
                            ['r', '*', '*', 'c', '*', '*', 'p', '*', '*', 'enter'].forEach(k => {
                                ws.send(`key ${k}`);
                            });
                        } else {
                            ws.send('key enter');
                        }
                    } else if (screenText.includes('begin play') || screenText.includes('next screen')) {
                        ws.send('key enter');
                    } else if (screenText.includes('[y/n]')) {
                        ws.send('key y');
                    } else {
                        ws.send('key enter');
                    }
                } else if (realmName === 'angband') {
                    if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('quick-start') || screenText.includes('based on previous')) {
                        ws.send('key y');
                    } else if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
                        ws.send('key @');
                    } else if (screenText.includes('press any key') || screenText.includes('-more-')) {
                        ws.send('key enter');
                    } else {
                        ws.send('key @');
                    }
                } else if (realmName === 'silq') {
                    if (screenText.includes('allocate points to skills') || screenText.includes('accept skills')) {
                        ws.send('key enter');
                    } else if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                        if (!silqStatAllocated) {
                            silqStatAllocated = true;
                            ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'].forEach(k => {
                                ws.send(`key ${k}`);
                            });
                        }
                    } else if (screenText.includes('choose house') || screenText.includes('choose your race')) {
                        ws.send('key *');
                    } else if (screenText.includes('tab random name') || screenText.includes('enter accept name')) {
                        if (!silqNameSent) {
                            silqNameSent = true;
                            ws.send('key tab');
                            ws.send('key enter');
                        }
                    } else {
                        ws.send('key enter');
                    }
                }
            }
        });

        ws.on('error', err => {
            console.error(`[${realmName}] WebSocket error:`, err.message);
            reject(err);
        });
    });
}

async function runAll() {
    const realms = ['angband', 'silq', 'frogcomposband', 'hengband'];
    const results = {};
    for (const realm of realms) {
        try {
            const player = await testRealm(realm);
            results[realm] = { success: true, hero: `${player.name} (${player.race} ${player.class})` };
        } catch (e) {
            console.error(`Realm ${realm} failed:`, e);
            results[realm] = { success: false, error: e.message };
        }
    }

    console.log('\n========================================');
    console.log('FINAL 4-REALM TEST MATRIX RESULTS');
    console.log('========================================');
    let allPassed = true;
    for (const [r, res] of Object.entries(results)) {
        if (res.success) {
            console.log(`  ✓ ${r.padEnd(16)}: PASSED - ${res.hero}`);
        } else {
            console.log(`  ✗ ${r.padEnd(16)}: FAILED - ${res.error}`);
            allPassed = false;
        }
    }
    console.log('========================================\n');
    process.exit(allPassed ? 0 : 1);
}

runAll();

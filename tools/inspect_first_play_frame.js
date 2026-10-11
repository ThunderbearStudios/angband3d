const WebSocket = require('../server/node_modules/ws');

const tdSjis = new TextDecoder('shift-jis');

function decodeHengbandText(str) {
    if (!str) return '';
    if (/[\u3000-\u9faf]/.test(str)) return str;
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const b1 = str.charCodeAt(i) & 0xff;
        if (((b1 >= 0x81 && b1 <= 0x9f) || (b1 >= 0xe0 && b1 <= 0xfc)) && i + 1 < str.length) {
            const b2 = str.charCodeAt(i + 1) & 0xff;
            try { result += tdSjis.decode(new Uint8Array([b1, b2])); } catch (_) { result += String.fromCharCode(b1, b2); }
            i++;
        } else if (b1 >= 0xa1 && b1 <= 0xdf) {
            try { result += tdSjis.decode(new Uint8Array([b1])); } catch (_) { result += String.fromCharCode(b1); }
        } else {
            result += String.fromCharCode(b1);
        }
    }
    return result;
}

function inspectFirstPlayFrame(realm) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:8080/ws?user=Inspect_${realm}&realm=${realm}&new=1`);
        let fcbRandomized = false;
        let silqStatAllocated = false;
        let silqNameSent = false;

        const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 12000);

        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.t !== 'frame') return;
            const frame = msg;
            const rawText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
            const decodedText = decodeHengbandText(rawText);
            const screenText = (rawText + '\n' + decodedText).toLowerCase();

            if (frame.phase === 'play') {
                console.log(`\n========================================`);
                console.log(`[${realm}] FIRST PLAY FRAME INSPECTION:`);
                console.log('  phase:', frame.phase);
                console.log('  hasMap:', !!frame.map);
                console.log('  hasPlayer:', !!frame.player);
                console.log('  ui:', JSON.stringify(frame.ui));
                console.log('  messages:', frame.messages ? frame.messages.length : 0);
                if (frame.messages) console.log('    recent:', frame.messages.slice(-3));
                const calcNeedsTerm = (f) => {
                    if (!f.player) return true;
                    if (f.phase !== 'play') return true;
                    const ui = f.ui;
                    if (!ui) return false;
                    if ((ui.overlay || 0) > 0) return true;
                    return !ui.awaiting_command && !ui.more;
                };
                console.log('  Calculated NeedsTerminal(frame):', calcNeedsTerm(frame));
                clearTimeout(timer);
                ws.close();
                resolve();
                return;
            }

            // advance birth
            if (realm === 'angband') {
                if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('quick-start') || screenText.includes('based on previous')) {
                    ws.send('key y');
                } else if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
                    ws.send('key @');
                } else if (screenText.includes('press any key') || screenText.includes('-more-')) {
                    ws.send('key enter');
                } else {
                    ws.send('key @');
                }
            } else if (realm === 'silq') {
                if (screenText.includes('allocate points to skills') || screenText.includes('accept skills')) {
                    ws.send('key enter');
                } else if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                    if (!silqStatAllocated) {
                        silqStatAllocated = true;
                        ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'].forEach(k => ws.send(`key ${k}`));
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
            } else if (realm === 'frogcomposband') {
                if (screenText.includes('choose the type of game to play')) {
                    ws.send('key n');
                } else if (screenText.includes('change race') && screenText.includes('change class')) {
                    if (!fcbRandomized) {
                        fcbRandomized = true;
                        ['r', '*', '*', 'c', '*', '*', 'p', '*', '*', 'enter'].forEach(k => ws.send(`key ${k}`));
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
            } else if (realm === 'hengband') {
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
            }
        });
    });
}

async function main() {
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        try {
            await inspectFirstPlayFrame(r);
        } catch (e) {
            console.error(r, 'failed:', e.message);
        }
    }
}
main();

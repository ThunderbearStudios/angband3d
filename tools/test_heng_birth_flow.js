const { spawn } = require('child_process');
const path = require('path');

const exe = path.resolve('variants/hengband/bin/hengband.exe');
const p = spawn(exe, ['-mbridge', '-n'], {
    cwd: path.resolve('variants/hengband'),
    env: { ...process.env, ANGBAND_PATH: path.resolve('variants/hengband/lib'), HENG_PATH: path.resolve('variants/hengband/lib') }
});

const tdSjis = new TextDecoder('shift-jis');

function isSjisLead(b) {
    return (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc);
}

function decodeTerminalRow(gStr) {
    if (!gStr) return '';
    let result = '';
    const len = gStr.length;
    for (let c = 0; c < len; c++) {
        const b1 = gStr.charCodeAt(c) & 0xff;
        if (isSjisLead(b1) && c + 1 < len) {
            const b2 = gStr.charCodeAt(c + 1) & 0xff;
            result += tdSjis.decode(new Uint8Array([b1, b2]));
            c++;
        } else if (b1 >= 0xa1 && b1 <= 0xdf) {
            result += tdSjis.decode(new Uint8Array([b1]));
        } else {
            result += String.fromCharCode(b1);
        }
    }
    return result;
}

let lineBuf = '';
let step = 0;

p.stdout.on('data', d => {
    lineBuf += d.toString('utf8');
    let idx;
    while ((idx = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.substring(0, idx).trim();
        lineBuf = lineBuf.substring(idx + 1);
        if (line.startsWith('{"t":"frame"')) {
            const frame = JSON.parse(line);
            console.log(`\n=== FRAME ${step} (phase: ${frame.phase}, awaiting: ${frame.awaiting_command}, more: ${frame.more}) ===`);
            frame.term.rows.forEach((r, i) => {
                const dec = decodeTerminalRow(r.g).trim();
                if (dec) console.log(`  [${i}]: ${dec}`);
            });

            step++;
            if (frame.phase === 'play') {
                console.log('SUCCESS: Entered play in Hengband!');
                p.kill();
                process.exit(0);
            }

            const fullText = frame.term.rows.map(r => decodeTerminalRow(r.g)).join(' ');
            if (fullText.includes('smart_learn') || (fullText.includes('ESC:終了') && fullText.includes('初期オプション'))) {
                console.log('Action: Exiting initial options screen (escape)...');
                p.stdin.write('key escape\n');
            } else if (fullText.includes('性別を選んで')) {
                console.log('Action: Choosing Female (a)...');
                p.stdin.write('key a\n');
            } else if (fullText.includes('種族を選んで')) {
                console.log('Action: Choosing Race (a)...');
                p.stdin.write('key a\n');
            } else if (fullText.includes('職業を選んで')) {
                console.log('Action: Choosing Class (a)...');
                p.stdin.write('key a\n');
            } else if (fullText.includes('性格を選んで')) {
                console.log('Action: Choosing Personality (a)...');
                p.stdin.write('key a\n');
            } else if (fullText.includes('魔法領域') || fullText.includes('領域を選んで')) {
                console.log('Action: Choosing Realm (a)...');
                p.stdin.write('key a\n');
            } else if (fullText.includes('オートローラー') || fullText.includes('能力値') || fullText.includes('ポイント')) {
                console.log('Action: Confirming stats (return)...');
                p.stdin.write('key return\n');
            } else if (fullText.includes('よろしいですか') || fullText.includes('y/n')) {
                console.log('Action: Yes (y)...');
                p.stdin.write('key y\n');
            } else if (fullText.includes('Enter') || fullText.includes('スペース') || fullText.includes('続ける') || fullText.includes('リターン')) {
                console.log('Action: Continue (return)...');
                p.stdin.write('key return\n');
            } else {
                console.log('Unrecognized screen, trying return...');
                p.stdin.write('key return\n');
            }

            if (step > 40) {
                console.log('Reached step 40 without entering play.');
                p.kill();
                process.exit(1);
            }
        }
    }
});

p.stderr.on('data', d => console.error('stderr:', d.toString()));
setTimeout(() => { console.log('Timeout'); p.kill(); process.exit(1); }, 12000);

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
    let result = '';
    const len = gStr.length;
    for (let c = 0; c < len; c++) {
        const b1 = gStr.charCodeAt(c) & 0xff;
        if (isSjisLead(b1) && c + 1 < len) {
            const b2 = gStr.charCodeAt(c + 1) & 0xff;
            const kanji = tdSjis.decode(new Uint8Array([b1, b2]));
            result += kanji;
            c++; // skip trail byte
        } else if (b1 >= 0xa1 && b1 <= 0xdf) {
            // Half-width katakana
            const kana = tdSjis.decode(new Uint8Array([b1]));
            result += kana;
        } else {
            result += String.fromCharCode(b1);
        }
    }
    return result;
}

let rawBuf = '';
p.stdout.on('data', d => {
    rawBuf += d.toString('utf8');
    let idx;
    while ((idx = rawBuf.indexOf('\n')) !== -1) {
        const line = rawBuf.substring(0, idx).trim();
        rawBuf = rawBuf.substring(idx + 1);
        if (line.startsWith('{"t":"frame"')) {
            const frame = JSON.parse(line);
            console.log('--- Decoded with decodeTerminalRow ---');
            frame.term.rows.slice(0, 15).forEach((r, i) => {
                const decoded = decodeTerminalRow(r.g);
                if (decoded.trim()) {
                    console.log(`Row ${i} (len ${r.g.length}): [${decoded}]`);
                }
            });
            p.kill();
            process.exit(0);
        }
    }
});

setTimeout(() => { p.kill(); process.exit(0); }, 4000);

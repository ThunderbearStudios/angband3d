const { spawn } = require('child_process');
const path = require('path');
const tdSjis = new TextDecoder('shift-jis');
function decode(str) {
  let res = '';
  for (let c = 0; c < str.length; c++) {
    const b1 = str.charCodeAt(c) & 0xff;
    if (((b1 >= 0x81 && b1 <= 0x9f) || (b1 >= 0xe0 && b1 <= 0xfc)) && c + 1 < str.length) {
      res += tdSjis.decode(new Uint8Array([b1, str.charCodeAt(c + 1) & 0xff]));
      c++;
    } else res += String.fromCharCode(b1);
  }
  return res;
}
const p = spawn(path.resolve('variants/hengband/bin/hengband.exe'), ['-mbridge', '-n'], {
  cwd: path.resolve('variants/hengband'),
  env: { ...process.env, ANGBAND_PATH: path.resolve('variants/hengband/lib'), HENG_PATH: path.resolve('variants/hengband/lib') }
});
let buf = '', fCount = 0;
p.stdout.on('data', d => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const l = buf.substring(0, idx).trim(); buf = buf.substring(idx + 1);
    if (l.startsWith('{"t":"frame"')) {
      const f = JSON.parse(l);
      if (fCount <= 7) {
        console.log('=== FRAME', fCount, '===');
        f.term.rows.slice(10).forEach((r, i) => { const dec = decode(r.g).trim(); if (dec) console.log(`  [${i+10}]:`, dec); });
      }
      fCount++;
      if (fCount === 1) p.stdin.write('key escape\n');
      else if (fCount <= 6) p.stdin.write('key a\n');
      else { p.kill(); process.exit(0); }
    }
  }
});
setTimeout(() => { p.kill(); process.exit(0); }, 5000);

const { spawn } = require('child_process');
const path = require('path');
const exe = path.resolve('variants/frogcomposband/bin/frogcomposband.exe');
const p = spawn(exe, ['-mbridge', '-n'], {
  cwd: path.resolve('variants/frogcomposband'),
  env: { ...process.env, ANGBAND_PATH: path.resolve('variants/frogcomposband/lib') }
});
let lineBuf = '';
let step = 0;
p.stdout.on('data', d => {
  lineBuf += d.toString('utf8');
  let idx;
  while ((idx = lineBuf.indexOf('\n')) !== -1) {
    const line = lineBuf.substring(0, idx).trim();
    lineBuf = lineBuf.substring(idx + 1);
    if (line.startsWith('{"t":"frame"')) {
      const f = JSON.parse(line);
      const text = f.term.rows.map(r => r.g || '').join('\n');
      console.log('--- FRAME STEP', step, '---');
      f.term.rows.slice(0, 10).forEach((r, i) => { if (r.g && r.g.trim()) console.log(i, r.g.trim()); });
      step++;
      if (text.toLowerCase().includes('choose the type of game')) {
        p.stdin.write('key n\n');
      } else if (text.toLowerCase().includes('choose a sex')) {
        p.stdin.write('key m\n');
      } else if (text.toLowerCase().includes('choose a race')) {
        p.stdin.write('key a\n');
      } else if (text.toLowerCase().includes('choose a class')) {
        p.stdin.write('key a\n');
      } else if (text.toLowerCase().includes('choose a personality')) {
        p.stdin.write('key a\n');
      } else if (text.toLowerCase().includes('stats') || text.toLowerCase().includes('enter your starting')) {
        console.log('=== FOUND STAT SCREEN ===');
        f.term.rows.forEach((r, i) => console.log(i, r.g));
        p.kill();
        process.exit(0);
      } else {
        p.stdin.write('key return\n');
      }
      if (step > 25) { p.kill(); process.exit(0); }
    }
  }
});
setTimeout(() => { p.kill(); process.exit(0); }, 5000);

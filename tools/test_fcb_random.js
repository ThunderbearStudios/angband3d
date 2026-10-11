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
            const frame = JSON.parse(line);
            console.log(`\n=== STEP ${step} (phase: ${frame.phase}) ===`);
            frame.term.rows.slice(0, 16).forEach((r, i) => { if (r.g && r.g.trim()) console.log(`  [${i}]: ${r.g.trim()}`); });

            step++;
            if (step === 1) {
                p.stdin.write('key return\n');
            } else if (step === 2) {
                p.stdin.write('key n\n'); // Choose Normal mode
            } else if (step === 3) {
                console.log('Sending r to Change Race...');
                p.stdin.write('key r\n');
            } else if (step === 4) {
                console.log('Sending * to Random Race...');
                p.stdin.write('key *\n');
            } else if (step === 5) {
                console.log('Sending c to Change Class...');
                p.stdin.write('key c\n');
            } else if (step === 6) {
                console.log('Sending * to Random Class...');
                p.stdin.write('key *\n');
            } else if (step === 7) {
                console.log('Sending * to Random Name...');
                p.stdin.write('key *\n');
            } else if (step === 8) {
                console.log('Sending return to proceed...');
                p.stdin.write('key return\n');
            } else if (step === 9) {
                console.log('Sending return to Begin Play...');
                p.stdin.write('key return\n');
            } else if (frame.phase === 'play') {
                console.log('SUCCESS: Entered play with randomized hero:', frame.player.race, frame.player.class, frame.player.name);
                p.kill();
                process.exit(0);
            }
        }
    }
});
setTimeout(() => { p.kill(); process.exit(0); }, 5000);

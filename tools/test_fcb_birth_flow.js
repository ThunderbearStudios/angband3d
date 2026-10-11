const { spawn } = require('child_process');
const path = require('path');

const exe = path.resolve('variants/frogcomposband/bin/frogcomposband.exe');
const p = spawn(exe, ['-mbridge', '-n'], {
    cwd: path.resolve('variants/frogcomposband'),
    env: { ...process.env, ANGBAND_PATH: path.resolve('variants/frogcomposband/lib') }
});

let lineBuf = '';
let step = 0;
let characterInfo = {};

p.stdout.on('data', d => {
    lineBuf += d.toString('utf8');
    let idx;
    while ((idx = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.substring(0, idx).trim();
        lineBuf = lineBuf.substring(idx + 1);
        if (line.startsWith('{"t":"frame"')) {
            const frame = JSON.parse(line);
            console.log(`[FCB Step ${step}] phase: ${frame.phase}`);
            if (step <= 3) {
                frame.term.rows.slice(0, 15).forEach((r, i) => { if (r.g && r.g.trim()) console.log(`  [${i}]: ${r.g.trim()}`); });
            }
            
            const screenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

            if (frame.phase === 'play' && frame.map && frame.player) {
                console.log('SUCCESS: Entered play in FrogComposBand!');
                console.log('Player:', JSON.stringify(frame.player));
                console.log('Map dimensions:', frame.map.width, 'x', frame.map.height);
                p.kill();
                process.exit(0);
            }

            step++;
            if (screenText.includes('choose the type of game to play')) {
                console.log('Action: Choosing Normal mode (n)...');
                p.stdin.write('key n\n');
            } else if (screenText.includes('choose a sex') || screenText.includes('choose a race') ||
                       screenText.includes('choose a class') || screenText.includes('choose a personality') ||
                       screenText.includes('choose your realm') || screenText.includes('choose a realm')) {
                console.log('Action: Random choice (*)...');
                p.stdin.write('key *\n');
            } else if (screenText.includes('[y/n]') || screenText.includes('(y/n)')) {
                console.log('Action: Confirming (y)...');
                p.stdin.write('key y\n');
            } else if (screenText.includes('enter your starting stats') || screenText.includes('accept stats') ||
                       screenText.includes('accept history') || screenText.includes('enter name') ||
                       screenText.includes('accept character') || screenText.includes('press enter') ||
                       screenText.includes('next screen')) {
                console.log('Action: Enter...');
                p.stdin.write('key return\n');
            } else if (screenText.includes('-more-') || (frame.ui && frame.ui.more)) {
                console.log('Action: Space (-more-)...');
                p.stdin.write('key space\n');
            } else {
                console.log('Action: Fallback Enter/Space...');
                p.stdin.write('key return\n');
            }

            if (step > 45) {
                console.log('Exceeded 45 steps in FrogComposBand test.');
                p.kill();
                process.exit(1);
            }
        }
    }
});

p.stderr.on('data', d => console.error('stderr:', d.toString()));
setTimeout(() => { console.log('Timeout'); p.kill(); process.exit(1); }, 15000);

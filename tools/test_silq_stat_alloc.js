const { spawn } = require('child_process');
const path = require('path');

const exe = path.resolve(__dirname, '../variants/silq/bin/silq.exe');
const cwd = path.resolve(__dirname, '../variants/silq');

console.log('Spawning Sil-Q with Smart Stat Allocation:', exe);
const child = spawn(exe, ['-mbridge', '-uTestHero', '-n'], {
    cwd: cwd,
    stdio: ['pipe', 'pipe', 'pipe']
});

let lineBuf = '';
let step = 0;
let statAllocated = false;

child.stdout.on('data', chunk => {
    lineBuf += chunk.toString('utf8');
    let idx;
    while ((idx = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.substring(0, idx).trim();
        lineBuf = lineBuf.substring(idx + 1);
        if (line.startsWith('{"t":"frame"')) {
            step++;
            const frame = JSON.parse(line);
            console.log(`\n=================== FRAME ${step} (phase: ${frame.phase}) ===================`);
            const screen = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
            const lines = screen.split('\n');
            lines.forEach((l, i) => {
                if (l.trim().length > 0) console.log(`[${String(i).padStart(2, '0')}] ${l.trimEnd()}`);
            });
            
            if (frame.phase === 'play') {
                console.log('\n>>> ENTERED PLAY PHASE! <<<');
                console.log('Final Player Stats:', frame.player);
                child.kill();
                process.exit(0);
            }

            const screenText = screen.toLowerCase();
            if (screenText.includes('random menu item') || screenText.includes('* random')) {
                console.log('>>> Sending: *');
                child.stdin.write('key *\n');
            } else if (screenText.includes('allocate points to skills') || screenText.includes('skill increases') || screenText.includes('accept skills')) {
                console.log('>>> Keeping 5000 EXP pool for player abilities/skills; sending enter...');
                child.stdin.write('key enter\n');
            } else if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                if (!statAllocated) {
                    statAllocated = true;
                    console.log('>>> Allocating 13 stat points: Str+2, Dex+2, Con+3, Gra+1...');
                    // Sequence: 6, 6 (Str+2), 2 (down), 6, 6 (Dex+2), 2 (down), 6, 6 (Con+2), 2 (down), 6 (Gra+1), 8 (up), 6 (Con+3), enter
                    const keys = ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'];
                    keys.forEach(k => {
                        child.stdin.write(`key ${k}\n`);
                    });
                }
            } else if (screenText.includes('accept history')) {
                console.log('>>> Sending: enter');
                child.stdin.write('key enter\n');
            } else if (screenText.includes('accept age/height/weight')) {
                console.log('>>> Sending: enter');
                child.stdin.write('key enter\n');
            } else if (screenText.includes('enter accept name') || screenText.includes('tab random name')) {
                console.log('>>> Sending: enter');
                child.stdin.write('key enter\n');
            } else {
                console.log('>>> Default Sending: enter');
                child.stdin.write('key enter\n');
            }
        }
    }
});

child.stderr.on('data', chunk => {
    console.error('[STDERR]', chunk.toString('utf8'));
});

child.on('close', code => {
    console.log('[EXIT] Code:', code);
    process.exit(code || 0);
});

setTimeout(() => {
    console.error('[TIMEOUT] Killing after 10s');
    child.kill();
    process.exit(1);
}, 10000);

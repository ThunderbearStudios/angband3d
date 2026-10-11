const { spawn } = require('child_process');
const path = require('path');

const exe = path.resolve(__dirname, '../variants/silq/bin/silq.exe');
const cwd = path.resolve(__dirname, '../variants/silq');

console.log('Spawning Sil-Q:', exe);
const child = spawn(exe, ['-mbridge', '-uTestHero', '-n'], {
    cwd: cwd,
    stdio: ['pipe', 'pipe', 'pipe']
});

let lineBuf = '';
let step = 0;

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
                child.kill();
                process.exit(0);
            }

            // Let's test standard quick birth inputs
            const screenText = screen.toLowerCase();
            if (screenText.includes('random menu item') || screenText.includes('* random')) {
                console.log('>>> Sending: *');
                child.stdin.write('key *\n');
            } else if (screenText.includes('allocate points to stats') || screenText.includes('points left:')) {
                console.log('>>> Sending: enter');
                child.stdin.write('key enter\n');
            } else if (screenText.includes('allocate points to skills') || screenText.includes('skill increases')) {
                console.log('>>> Sending: enter');
                child.stdin.write('key enter\n');
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

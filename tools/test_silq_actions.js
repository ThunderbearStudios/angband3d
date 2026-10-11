const { spawn } = require('child_process');
const path = require('path');

const exe = path.resolve(__dirname, '../variants/silq/bin/silq.exe');
const cwd = path.resolve(__dirname, '../variants/silq');

const child = spawn(exe, ['-mbridge', '-uTestHero', '-n'], {
    cwd: cwd,
    stdio: ['pipe', 'pipe', 'pipe']
});

let lineBuf = '';
let step = 0;
let playPhaseReached = false;
let testSubStep = 0;

child.stdout.on('data', chunk => {
    lineBuf += chunk.toString('utf8');
    let idx;
    while ((idx = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.substring(0, idx).trim();
        lineBuf = lineBuf.substring(idx + 1);
        if (line.startsWith('{"t":"frame"')) {
            step++;
            const frame = JSON.parse(line);
            const screen = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
            
            if (frame.phase === 'play') {
                if (!playPhaseReached) {
                    playPhaseReached = true;
                    console.log('=== In Play Phase ===');
                    console.log('Sending: key i');
                    child.stdin.write('key i\n');
                    return;
                }

                testSubStep++;
                console.log(`\n--- Play SubStep ${testSubStep} ---`);
                console.log('awaiting_command:', frame.ui ? frame.ui.awaiting_command : undefined);
                console.log('more:', frame.ui ? frame.ui.more : undefined);
                console.log('overlay:', frame.ui ? frame.ui.overlay : undefined);
                const screenLines = screen.split('\n').filter(l => l.trim().length > 0);
                console.log('Screen snippet:');
                screenLines.slice(0, 8).forEach(l => console.log('  ' + l));
                if (screenLines.length > 8) {
                    console.log('  ...');
                    screenLines.slice(-3).forEach(l => console.log('  ' + l));
                }

                if (testSubStep === 1) {
                    console.log('Sending: key x');
                    child.stdin.write('key x\n');
                } else if (testSubStep === 2) {
                    console.log('Sending: key a');
                    child.stdin.write('key a\n');
                } else if (testSubStep === 3) {
                    child.kill();
                    process.exit(0);
                }
                return;
            }

            // In birth
            const screenText = screen.toLowerCase();
            if (screenText.includes('random menu item') || screenText.includes('* random')) {
                child.stdin.write('key *\n');
            } else {
                child.stdin.write('key enter\n');
            }
        }
    }
});

setTimeout(() => {
    console.log('Timeout reached');
    child.kill();
    process.exit(1);
}, 8000);

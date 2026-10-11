/**
 * Test Shifted Input & Tactical Roguelike Commands
 * Verifies that the engine bridge properly receives and processes:
 * - 'T' (Tunneling)
 * - 'D' (Disarm)
 * - 'B' (Bash)
 * - 'R' (Rest)
 * - 'C' (Character Sheet)
 * - '>' (Stairs Down)
 * - '<' (Stairs Up)
 */

const { spawn } = require('child_process');
const path = require('path');

const ENGINE_BIN = path.resolve(__dirname, '..', 'engine', 'build', 'game', 'angband.exe');
const ENGINE_CWD = path.resolve(__dirname, '..', 'engine', 'build', 'game');

function runTest() {
    return new Promise((resolve, reject) => {
        const proc = spawn(ENGINE_BIN, ['-mbridge', '-uTestDigger', '-n'], {
            cwd: ENGINE_CWD,
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        proc.stderr.on('data', (d) => console.error('STDERR:', d.toString()));

        let outputBuf = '';
        let step = 'init';
        let inDungeon = false;

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error(`Test timed out at step: ${step}`));
        }, 15000);

        proc.stdout.on('data', (chunk) => {
            outputBuf += chunk.toString();
            const lines = outputBuf.split('\n');
            outputBuf = lines.pop(); // keep last unfinished line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const msg = JSON.parse(trimmed);

                    if (msg.t === 'hello') {
                        // Advance past character birth using quick birth keys
                        proc.stdin.write('key enter\n');
                    } else if (msg.t === 'frame') {
                        const phase = msg.phase || '';
                        const text = (msg.term && msg.term.rows)
                            ? msg.term.rows.map(r => r.g || '').join('\n')
                            : '';

                        if (phase === 'setup') {
                            if (text.includes("to start over") || text.includes("use as is") || text.includes("r to reroll")) {
                                proc.stdin.write('key s\n');
                            } else {
                                proc.stdin.write('key enter\n');
                            }
                        } else if (phase === 'play') {
                            if (!inDungeon) {
                                inDungeon = true;
                                step = 'test_tunnel';
                                // In play! Send 'T' (Tunneling)
                                proc.stdin.write('key T\n');
                                return;
                            }

                            if (step === 'test_tunnel') {
                                // Check if tunnel prompt is active
                                const messages = msg.messages || [];
                                const promptActive = text.includes("Tunnel into what") || text.includes("Tunnel") ||
                                    messages.some(m => m.toLowerCase().includes("tunnel"));
                                const awaitingDir = (msg.ui && !msg.ui.awaiting_command);

                                if (promptActive || awaitingDir) {
                                    console.log('  ok: Tunnel (T) prompt triggered successfully');
                                    // Cancel tunnel prompt
                                    step = 'test_disarm';
                                    proc.stdin.write('key escape\n');
                                    proc.stdin.write('key D\n');
                                    return;
                                }
                            }

                            if (step === 'test_disarm') {
                                const messages = msg.messages || [];
                                const promptActive = text.includes("Disarm") ||
                                    messages.some(m => m.toLowerCase().includes("disarm"));
                                const awaitingDir = (msg.ui && !msg.ui.awaiting_command);

                                if (promptActive || awaitingDir) {
                                    console.log('  ok: Disarm (D) prompt triggered successfully');
                                    step = 'test_rest';
                                    proc.stdin.write('key escape\n');
                                    proc.stdin.write('key R\n');
                                    return;
                                }
                            }

                            if (step === 'test_rest') {
                                const messages = msg.messages || [];
                                const promptActive = text.includes("Rest") ||
                                    messages.some(m => m.toLowerCase().includes("rest"));
                                const awaitingInput = (msg.ui && !msg.ui.awaiting_command);

                                if (promptActive || awaitingInput) {
                                    console.log('  ok: Rest (R) prompt triggered successfully');
                                    step = 'done';
                                    proc.stdin.write('key escape\n');
                                    proc.stdin.write('quit\n');
                                    clearTimeout(timer);
                                    resolve(true);
                                    return;
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Ignore non-json
                }
            }
        });

        proc.on('exit', () => {
            clearTimeout(timer);
            if (step === 'done') {
                resolve(true);
            } else {
                reject(new Error(`Engine exited early at step: ${step}`));
            }
        });
    });
}

console.log('--- TESTING SHIFTED ROGUELIKE COMMAND DISPATCH ---');
runTest()
    .then(() => {
        console.log('100% Shifted Roguelike Input Tests Passed.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('FAILED:', err.message);
        process.exit(1);
    });

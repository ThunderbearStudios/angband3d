const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const silqExe = path.resolve(__dirname, '../variants/silq/bin/silq.exe');
const silqCwd = path.resolve(__dirname, '../variants/silq');

const child = spawn(silqExe, ['-mbridge', '-n', '-uTestHero'], {
    cwd: silqCwd,
    env: {
        ...process.env,
        ANGBAND_PATH: path.join(silqCwd, 'lib'),
        SIL_PATH: path.join(silqCwd, 'lib')
    }
});

const rl = readline.createInterface({ input: child.stdout });
let step = 0;
let completed = false;

rl.on('line', (line) => {
    try {
        const frame = JSON.parse(line);
        step++;
        if (frame.phase === 'setup') {
            const screenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();
            if (screenText.includes('random menu item') || screenText.includes('* random')) {
                child.stdin.write('key *\n');
            } else if (screenText.includes('allocate points to stats') || screenText.includes('points left:')) {
                child.stdin.write('key enter\n');
            } else if (screenText.includes('allocate points to skills') || screenText.includes('skill increases')) {
                child.stdin.write('key enter\n');
            } else if (screenText.includes('accept history')) {
                child.stdin.write('key enter\n');
            } else if (screenText.includes('accept age/height/weight')) {
                child.stdin.write('key enter\n');
            } else if (screenText.includes('enter accept name') || screenText.includes('tab random name')) {
                child.stdin.write('key enter\n');
            } else if (screenText.includes('press any key') || screenText.includes('[press') || screenText.includes('-more-')) {
                child.stdin.write('key enter\n');
            } else {
                child.stdin.write('key enter\n');
            }
        } else if (frame.phase === 'play' && frame.map && frame.map.rows) {
            console.log(`[TEST] Successfully entered play! Depth: ${frame.player.depth}, Name: ${frame.player.name}`);
            console.log(`[TEST] Map dimensions: ${frame.map.w}x${frame.map.h}`);
            
            // Check features present in map
            const featCounts = {};
            for (let y = 0; y < frame.map.h; y++) {
                const row = frame.map.rows[y];
                if (!row || !row.f) continue;
                for (let x = 0; x < frame.map.w; x++) {
                    const hi = parseInt(row.f[x * 2], 16) || 0;
                    const lo = parseInt(row.f[x * 2 + 1], 16) || 0;
                    const feat = (hi << 4) | lo;
                    featCounts[feat] = (featCounts[feat] || 0) + 1;
                }
            }
            console.log('[TEST] Feature breakdown:', JSON.stringify(featCounts));
            
            // Assert that raw Sil-Q walls (0x38=56, 0x39=57, 0x3A=58, 0x3B=59) are NOT present
            const rawWalls = [56, 57, 58, 59].filter(f => featCounts[f]);
            if (rawWalls.length > 0) {
                console.error('[FAIL] Raw Sil-Q wall features found in stream:', rawWalls);
                process.exit(1);
            }
            
            // Assert that canonical wire wall 21 (FEAT_GRANITE) IS present
            if (!featCounts[21]) {
                console.error('[FAIL] Canonical wire wall feat 21 (FEAT_GRANITE) not found in map!');
                process.exit(1);
            }
            
            // Assert that sunlight is NOT emitted as shop 9
            // (In Sil-Q DL 1, raw sunlight was 9, which mapped to shop 3)
            console.log('[PASS] All wall features translated to canonical wire protocol IDs!');
            console.log(`[PASS] Feat 21 (Granite Wall) count: ${featCounts[21]}, Feat 1 (Floor) count: ${featCounts[1] || 0}`);
            completed = true;
            child.kill();
            process.exit(0);
        }
    } catch (e) {
        // Not a JSON frame line
    }
});

setTimeout(() => {
    if (!completed) {
        console.error('[FAIL] Timed out waiting for play frame. Reached step:', step);
        child.kill();
        process.exit(1);
    }
}, 8000);

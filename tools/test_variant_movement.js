const WebSocket = require('../server/node_modules/ws');

async function testRealm(realm) {
    return new Promise((resolve, reject) => {
        console.log(`\n================ Testing ${realm} ================`);
        const user = `TestNav_${realm}_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=${realm}&new=1`);
        let step = 0;
        let startPos = null;
        let moveStep = 0;
        let lastPos = null;
        let successfulMoves = 0;

        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`Timeout on ${realm} at moveStep=${moveStep}`));
        }, 20000);

        ws.on('message', (data) => {
            const frame = JSON.parse(data.toString());
            if (frame.t !== 'frame') return;
            step++;
            const termRows = frame.term?.rows || frame.term?.lines || [];
            const screenText = termRows.map(r => r.g || '').join('\n').toLowerCase();
            const isMore = !!(frame.more || frame.ui?.more || screenText.includes('-more-'));
            const isAwaiting = !!(frame.awaiting_command || frame.ui?.awaiting_command);

            if (frame.phase === 'setup') {
                if (isMore) {
                    ws.send('key space');
                } else if (screenText.includes('press any other key to play') || screenText.includes('press ? for credits') || screenText.includes('press space') || screenText.includes('press any key')) {
                    ws.send('key space');
                } else if (screenText.includes('choose the type of game to play') || screenText.includes('choose mode')) {
                    ws.send('key b');
                } else if (screenText.includes('birth options') || screenText.includes('esc:accept') || screenText.includes('smart_learn') || screenText.includes('esc: i—¹')) {
                    ws.send('key escape');
                } else if (screenText.includes('are you sure? [y/n]') || screenText.includes('[y/n]') || screenText.includes('よろしいですか')) {
                    ws.send('key y');
                } else if (screenText.includes('choose a sex') || screenText.includes('select sex')) {
                    ws.send('key b');
                } else if (screenText.includes('choose a race') || screenText.includes('select race')) {
                    ws.send('key a');
                } else if (screenText.includes('choose a class') || screenText.includes('select class')) {
                    ws.send('key a');
                } else if (screenText.includes('choose a realm') || screenText.includes('magic realm')) {
                    ws.send('key a');
                } else if (screenText.includes('choose personality') || screenText.includes('personality')) {
                    ws.send('key a');
                } else if (screenText.includes('beginner') || screenText.includes('standard')) {
                    ws.send('key enter');
                } else if (screenText.includes('next screen') || screenText.includes('ret) next screen')) {
                    ws.send('key enter');
                } else if (screenText.includes('begin play') || screenText.includes('ret) begin play') || screenText.includes('starting stats')) {
                    ws.send('key enter');
                } else {
                    ws.send('key enter');
                }
                return;
            }

            if (frame.phase === 'play') {
                if (isMore) {
                    ws.send('key space');
                    return;
                }

                if (!isAwaiting) {
                    return;
                }

                const currentPos = { x: frame.player.x, y: frame.player.y };
                if (!startPos) {
                    startPos = currentPos;
                    lastPos = currentPos;
                    console.log(`Entered play at (${startPos.x}, ${startPos.y})`);
                }

                // Check messages for illegal / unknown command errors
                const msgTexts = (frame.messages || []).map(m => m.text).join(' ');
                const row0 = (frame.term?.rows?.[0]?.g || '').trim();
                if (row0.includes("Type '?' for help") || msgTexts.includes("Type '?' for help") || row0.includes("Unknown command")) {
                    clearTimeout(timeout);
                    ws.close();
                    reject(new Error(`Illegal command error detected in ${realm}: "${row0}" / "${msgTexts}"`));
                    return;
                }

                const testCommands = [
                    { cmd: 'key up', desc: 'Cardinal UP' },
                    { cmd: 'key down', desc: 'Cardinal DOWN' },
                    { cmd: 'key left', desc: 'Cardinal LEFT' },
                    { cmd: 'key right', desc: 'Cardinal RIGHT' },
                    { cmd: 'key home', desc: 'Diagonal UP-LEFT (home)' },
                    { cmd: 'key pagedown', desc: 'Diagonal DOWN-RIGHT (pagedown)' },
                    { cmd: 'key pageup', desc: 'Diagonal UP-RIGHT (pageup)' },
                    { cmd: 'key end', desc: 'Diagonal DOWN-LEFT (end)' },
                    { cmd: 'key 5', desc: 'Stay 1 turn (key 5)' }
                ];

                if (moveStep < testCommands.length) {
                    const stepInfo = testCommands[moveStep];
                    console.log(`[Step ${moveStep + 1}/${testCommands.length}] Pos (${currentPos.x}, ${currentPos.y}) -> Sending '${stepInfo.cmd}' (${stepInfo.desc})...`);
                    moveStep++;
                    ws.send(stepInfo.cmd);
                } else {
                    console.log(`[PASS] All ${testCommands.length} movement/stay commands executed cleanly in ${realm}! Final pos: (${currentPos.x}, ${currentPos.y})`);
                    clearTimeout(timeout);
                    ws.send(JSON.stringify({ t: 'quit' }));
                    setTimeout(() => ws.close(), 100);
                    resolve({ realm, startPos, endPos: currentPos });
                }
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function run() {
    const realms = ['angband', 'frogcomposband', 'hengband', 'silq'];
    const results = {};
    let allPassed = true;

    for (const r of realms) {
        try {
            results[r] = await testRealm(r);
        } catch (e) {
            results[r] = { error: e.message };
            allPassed = false;
            console.error(`FAILED ${r}:`, e.message);
        }
    }

    console.log('\n================ SUMMARY ================');
    for (const [r, res] of Object.entries(results)) {
        if (res.error) {
            console.log(`❌ ${r}: ${res.error}`);
        } else {
            console.log(`✅ ${r}: Start (${res.startPos.x}, ${res.startPos.y}) -> End (${res.endPos.x}, ${res.endPos.y})`);
        }
    }

    process.exit(allPassed ? 0 : 1);
}

run();

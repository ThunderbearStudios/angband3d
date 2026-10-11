const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_TestQuick&realm=silq&new=1');

let step = 0;
let inPlay = false;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        console.log('[WS MSG]', msg.t);
        if (msg.t === 'frame') {
            step++;
            const frame = msg;
            if (frame.phase === 'setup') {
                const screenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();
                
                // Emulate stepQuickBirth logic
                if (screenText.includes('random menu item') || screenText.includes('* random')) {
                    ws.send('key *');
                } else if (screenText.includes('allocate points to stats') || screenText.includes('points left:')) {
                    ws.send('key enter');
                } else if (screenText.includes('allocate points to skills') || screenText.includes('skill increases')) {
                    ws.send('key enter');
                } else if (screenText.includes('accept history')) {
                    ws.send('key enter');
                } else if (screenText.includes('accept age/height/weight')) {
                    ws.send('key enter');
                } else if (screenText.includes('enter accept name') || screenText.includes('tab random name')) {
                    ws.send('key enter');
                } else if (screenText.includes('press any key') || screenText.includes('[press') || screenText.includes('-more-')) {
                    ws.send('key enter');
                } else {
                    ws.send('key enter');
                }
            } else if (frame.phase === 'play' && frame.map && frame.player) {
                console.log(`[PASS] QuickStart entered play in ${step} steps!`);
                console.log(`[PASS] Player: ${frame.player.name} (${frame.player.race} ${frame.player.class}), Depth: ${frame.player.depth}`);
                console.log(`[PASS] Map rows: ${frame.map.h}, cols: ${frame.map.w}`);
                inPlay = true;
                ws.close();
                process.exit(0);
            }
        }
    } catch (e) {
        console.error('[WS] Parse error:', e);
    }
});

setTimeout(() => {
    if (!inPlay) {
        console.error('[FAIL] QuickStart WS timed out after 8 seconds. Steps:', step);
        ws.close();
        process.exit(1);
    }
}, 8000);

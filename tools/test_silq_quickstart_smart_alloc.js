const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_Quick&realm=silq&new=1');

let step = 0;
let inPlay = false;
let silqStatAllocated = false;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'frame') {
            step++;
            const frame = msg;
            if (frame.phase === 'setup') {
                const screenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

                if (screenText.includes('random menu item') || screenText.includes('* random')) {
                    ws.send('key *');
                } else if (screenText.includes('allocate points to skills') || screenText.includes('skill increases') || screenText.includes('accept skills')) {
                    ws.send('key enter');
                } else if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                    if (!silqStatAllocated) {
                        silqStatAllocated = true;
                        console.log('[WS] Allocating 13 stat points...');
                        const seq = ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'];
                        seq.forEach(k => ws.send(`key ${k}`));
                    }
                } else if (screenText.includes('accept history') || screenText.includes('reroll history')) {
                    ws.send('key enter');
                } else if (screenText.includes('accept age/height/weight')) {
                    ws.send('key enter');
                } else if (screenText.includes('enter accept name') || screenText.includes('accept name') || screenText.includes('tab random name')) {
                    ws.send('key enter');
                } else if (screenText.includes('into the vast and echoing gloom')) {
                    ws.send('key enter');
                } else if (screenText.includes('press any key') || screenText.includes('[press') || screenText.includes('-more-')) {
                    ws.send('key enter');
                } else {
                    ws.send('key enter');
                }
            } else if (frame.phase === 'play' && frame.map && frame.player) {
                console.log(`\n[PASS] QuickStart entered play in ${step} steps!`);
                console.log(`[PASS] Player Name: "${frame.player.name}"`);
                console.log(`[PASS] Race: ${frame.player.race}, House: ${frame.player.house || frame.player.class}`);
                console.log(`[PASS] Stats: Str ${frame.player.stats.str.use}, Dex ${frame.player.stats.dex.use}, Con ${frame.player.stats.con.use}, Gra ${frame.player.stats.gra.use}`);
                console.log(`[PASS] Exp: ${frame.player.exp}, Health: ${frame.player.hp}/${frame.player.hp_max}`);
                
                if (frame.player.name.includes('6') || frame.player.name.includes('2')) {
                    console.error('[FAIL] Player name contains leaked keystrokes!', frame.player.name);
                    process.exit(1);
                }
                if (frame.player.name !== 'Hero_Quick') {
                    console.error('[FAIL] Player name does not match requested name!', frame.player.name);
                    process.exit(1);
                }
                
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
        console.error('[FAIL] QuickStart WS timed out after 10 seconds. Steps:', step);
        ws.close();
        process.exit(1);
    }
}, 10000);

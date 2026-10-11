const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_FrogLive&realm=frogcomposband&new=1');

let step = 0;
let inPlay = false;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server for FrogComposBand');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'frame') {
            step++;
            const frame = msg;
            const screenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

            console.log(`[Frame ${step}] Phase=${frame.phase} Overlay=${frame.ui?.overlay} Awaiting=${frame.ui?.awaiting_command} More=${frame.ui?.more}`);
            
            if (frame.phase === 'setup') {
                if (screenText.includes('press any other key to play') || screenText.includes('press ? for credits')) {
                    console.log('-> Passing splash');
                    ws.send('key space');
                } else if (screenText.includes('choose the type of game to play')) {
                    console.log('-> Selecting Beginner mode (b)');
                    ws.send('key b');
                } else if (screenText.includes('next screen') || screenText.includes('ret) next screen')) {
                    console.log('-> Accepting race/class (enter)');
                    ws.send('key enter');
                } else if (screenText.includes('begin play') || screenText.includes('ret) begin play') || screenText.includes('enter your starting stats')) {
                    console.log('-> Accepting stats & beginning play (enter)');
                    ws.send('key enter');
                } else if (screenText.includes('-more-') || frame.ui?.more) {
                    console.log('-> Passing more prompt');
                    ws.send('key space');
                } else {
                    console.log('-> Default enter');
                    ws.send('key enter');
                }
            } else if (frame.phase === 'play') {
                if (frame.ui?.more || screenText.includes('-more-')) {
                    console.log('-> Passing in-game -more- prompt');
                    ws.send('key space');
                    return;
                }
                if (frame.map && frame.player) {
                    console.log(`\n========================================`);
                    console.log(`[PASS] FrogComposBand live session entered play!`);
                    console.log(`[PASS] Player: ${frame.player.name} (${frame.player.race} ${frame.player.class})`);
                    console.log(`[PASS] Map: ${frame.map.w}x${frame.map.h}, Depth: ${frame.player.depth}`);
                    console.log(`[PASS] Equipment: ${frame.player.equipment?.length || 0} items`);
                    console.log(`[PASS] Weapon: ${frame.player.weapon_item || 'none'}`);
                    console.log(`[PASS] Inventory: ${frame.player.inventory?.length || 0} items`);
                    console.log(`[PASS] Awaiting command: ${frame.ui?.awaiting_command}`);
                    console.log(`========================================\n`);
                    inPlay = true;
                    setTimeout(() => {
                        ws.close();
                        process.exit(0);
                    }, 500);
                }
            }
        }
    } catch (e) {
        console.error('[WS] Parse error:', e);
    }
});

ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
});

setTimeout(() => {
    if (!inPlay) {
        console.error('[FAIL] FrogComposBand WS live test timed out after 12s. Steps:', step);
        ws.close();
        process.exit(1);
    }
}, 12000);

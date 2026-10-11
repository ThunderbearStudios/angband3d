const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_HengLive&realm=hengband');

let inPlay = false;
let step = 0;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server for Hengband save resumption');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'frame') {
            step++;
            const frame = msg;
            console.log(`[Frame ${step}] Phase=${frame.phase} Overlay=${frame.ui?.overlay} Awaiting=${frame.awaiting_command || frame.ui?.awaiting_command}`);

            if (frame.phase === 'play') {
                if (frame.more || frame.ui?.more) {
                    console.log('-> Passing resume -more- prompt');
                    ws.send('key space\n');
                    return;
                }
                if (frame.map && frame.player) {
                    console.log(`\n========================================`);
                    console.log(`[PASS] Resumed existing Hengband save cleanly!`);
                    console.log(`[PASS] Player: ${frame.player.name} (${frame.player.race} ${frame.player.class})`);
                    console.log(`[PASS] Position: (${frame.player.x}, ${frame.player.y})`);
                    console.log(`[PASS] Map: ${frame.map.w}x${frame.map.h}, Depth: ${frame.dungeon?.depth}`);
                    console.log(`[PASS] HP: ${frame.player.hp}/${frame.player.max_hp}`);
                    console.log(`========================================\n`);
                    inPlay = true;
                    setTimeout(() => {
                        ws.close();
                        process.exit(0);
                    }, 500);
                }
            } else if (frame.phase === 'setup') {
                // Any prompt on reload (like press space to continue)
                console.log('-> Advancing setup frame (space)');
                ws.send('key space\n');
            }
        }
    } catch (e) {
        console.error('[WS] Error:', e);
    }
});

ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
});

setTimeout(() => {
    if (!inPlay) {
        console.error('[FAIL] Hengband resume test timed out after 10s');
        ws.close();
        process.exit(1);
    }
}, 10000);

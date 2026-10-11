const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_FrogKeyTest&realm=frogcomposband&new=1');

let step = 0;
let inPlay = false;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server for FrogComposBand');
});

ws.on('message', (data) => {
    try {
        const frame = JSON.parse(data.toString());
        if (frame.t !== 'frame') return;
        step++;
        const screenText = (frame.term?.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

        if (frame.phase === 'setup') {
            if (screenText.includes('press any other key to play') || screenText.includes('press ? for credits')) {
                ws.send('key space');
            } else if (screenText.includes('choose the type of game to play')) {
                ws.send('key b');
            } else if (screenText.includes('next screen') || screenText.includes('ret) next screen')) {
                ws.send('key enter');
            } else if (screenText.includes('begin play') || screenText.includes('ret) begin play') || screenText.includes('enter your starting stats')) {
                ws.send('key enter');
            } else if (screenText.includes('-more-') || frame.ui?.more) {
                ws.send('key space');
            } else {
                ws.send('key enter');
            }
        } else if (frame.phase === 'play') {
            if (frame.ui?.more || screenText.includes('-more-')) {
                ws.send('key space');
                return;
            }
            if (frame.map && frame.player) {
                if (!inPlay) {
                    inPlay = true;
                    console.log(`[PLAY] Pos: (${frame.player.x}, ${frame.player.y})`);
                    console.log(`Msg: ${frame.messages ? JSON.stringify(frame.messages) : ''}`);
                    console.log(`Line 0: ${frame.term?.rows?.[0]?.g || ''}`);
                    console.log(`Line 1: ${frame.term?.rows?.[1]?.g || ''}`);
                    
                    console.log('Sending: key k');
                    ws.send('key k');
                    return;
                }

                console.log(`After action: pos=(${frame.player.x}, ${frame.player.y})`);
                console.log(`Msg: ${frame.messages ? JSON.stringify(frame.messages) : ''}`);
                console.log(`Line 0: '${frame.term?.rows?.[0]?.g || ''}'`);

                setTimeout(() => {
                    ws.close();
                    process.exit(0);
                }, 1000);
            }
        }
    } catch (e) {
        console.error('Error:', e);
    }
});

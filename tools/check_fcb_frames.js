const path = require('path');
const WebSocket = require(path.join(__dirname, '../server/node_modules/ws'));

const ws = new WebSocket(`ws://localhost:8080/ws?session=test_fcb_${Date.now()}`);

ws.on('open', () => {
    console.log('Connected');
    ws.send(JSON.stringify({
        type: 'connect',
        charName: 'Tester_FCB',
        isNew: true,
        autoBirth: true,
        realm: 'frogcomposband'
    }));
});

let inPlayCount = 0;

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'frame') {
        const f = msg.frame;
        if (f.phase === 'play' && f.map) {
            inPlayCount++;
            console.log(`Frame #${inPlayCount}: awaiting_command=${f.ui.awaiting_command}, more=${f.ui.more}, overlay=${f.ui.overlay}`);
            if (inPlayCount === 1) {
                // Send ' ' or space
                console.log('Sending space key...');
                ws.send(JSON.stringify({ type: 'key', key: ' ' }));
            } else if (inPlayCount >= 3) {
                ws.close();
                process.exit(0);
            }
        } else {
            // Auto birth steps
            if (f.term && f.term.rows) {
                const text = f.term.rows.map(r => r.g || '').join('\n').toLowerCase();
                if (text.includes('choose the type of game to play')) ws.send(JSON.stringify({ type: 'key', key: 'n' }));
                else if (text.includes('change race')) ws.send(JSON.stringify({ type: 'key', key: 'enter' }));
                else if (text.includes('next screen')) ws.send(JSON.stringify({ type: 'key', key: 'enter' }));
                else if (text.includes('begin play')) ws.send(JSON.stringify({ type: 'key', key: 'enter' }));
                else if (text.includes('choose a') || text.includes('selection')) ws.send(JSON.stringify({ type: 'key', key: '*' }));
                else ws.send(JSON.stringify({ type: 'key', key: 'enter' }));
            }
        }
    }
});

setTimeout(() => {
    console.log('Timeout');
    ws.close();
    process.exit(1);
}, 10000);

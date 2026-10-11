const http = require('http');
const path = require('path');
const WebSocket = require(path.join(__dirname, '../server/node_modules/ws'));

async function inspectRealmFrames(realm) {
    const ws = new WebSocket(`ws://localhost:8080/ws?session=test_${realm}_${Date.now()}`);
    let frameCount = 0;

    ws.on('open', () => {
        console.log(`Connected for ${realm}`);
        ws.send(JSON.stringify({
            type: 'connect',
            charName: `Tester_${realm}`,
            isNew: true,
            autoBirth: true,
            realm: realm
        }));
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'frame') {
            const f = msg.frame;
            frameCount++;
            if (f.phase === 'play' && f.map) {
                console.log(`[${realm}] PLAY FRAME: phase=${f.phase}, map=${!!f.map}, player=${!!f.player}, awaiting_command=${f.ui ? f.ui.awaiting_command : null}, more=${f.ui ? f.ui.more : null}, overlay=${f.ui ? f.ui.overlay : null}`);
                if (f.term && f.term.rows && f.term.rows[0]) {
                    console.log(`[${realm}] Row 0: "${f.term.rows[0].g}"`);
                }
                setTimeout(() => {
                    ws.close();
                    process.exit(0);
                }, 1000);
            } else if (frameCount % 10 === 0) {
                console.log(`[${realm}] Frame ${frameCount}: phase=${f.phase}`);
            }
        }
    });

    setTimeout(() => {
        console.log('Timeout waiting for play frame');
        ws.close();
        process.exit(1);
    }, 15000);
}

inspectRealmFrames(process.argv[2] || 'frogcomposband');

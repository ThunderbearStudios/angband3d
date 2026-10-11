const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?realm=silq&new=1');
let step = 0;

ws.on('open', () => console.log('[Test] Connected to Sil-Q session'));

ws.on('message', data => {
    const str = data.toString();
    if (!str.startsWith('{')) return;
    const msg = JSON.parse(str);
    if (msg.t === 'frame') {
        if (msg.phase === 'setup') {
            step++;
            if (step === 1 || step === 2) {
                ws.send('key space\n');
            } else if (step === 3) {
                ws.send('key a\n');
            } else if (step === 4) {
                ws.send('key a\n');
            } else if (step >= 5 && step <= 8) {
                ws.send('key enter\n');
            } else if (step === 9) {
                console.log('[Setup Step 9]: Pressing Tab for random name...');
                ws.send('key tab\n');
            } else if (step === 10) {
                console.log('[Setup Step 10]: Pressing Enter to accept name...');
                ws.send('key enter\n');
            } else {
                console.log(`[Setup Step ${step}]: Pressing Enter...`);
                ws.send('key enter\n');
            }
        } else if (msg.phase === 'play') {
            console.log('\n>>> SUCCESS: ENTERED PLAY PHASE! <<<');
            console.log(`Player at (${msg.player?.x}, ${msg.player?.y}), Depth: ${msg.player?.depth}`);
            console.log(`Total monsters detected in frame: ${msg.monsters ? msg.monsters.length : 0}`);
            if (msg.monsters && msg.monsters.length > 0) {
                console.log('Sample monsters:', JSON.stringify(msg.monsters, null, 2));
            }
            ws.close();
            process.exit(0);
        }
    }
});

setTimeout(() => {
    console.log('[Timeout] Step reached:', step);
    process.exit(0);
}, 8000);

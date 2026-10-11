const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?realm=silq&new=1');
let frameCount = 0;

ws.on('open', () => {
    console.log('[Test] WebSocket connected to Sil-Q session');
});

ws.on('message', data => {
    const str = data.toString();
    if (!str.startsWith('{')) return;
    const msg = JSON.parse(str);
    if (msg.t === 'frame') {
        frameCount++;
        console.log(`\n=== FRAME ${frameCount} (phase: ${msg.phase}) ===`);
        if (msg.term && msg.term.rows) {
            for (let i = 0; i < Math.min(24, msg.term.rows.length); i++) {
                const text = msg.term.rows[i].g.trimEnd();
                if (text.trim().length > 0) {
                    console.log(`  [Row ${String(i).padStart(2, '0')}]: ${text}`);
                }
            }
        }
        if (frameCount === 1) {
            console.log('\n[Action] Sending space to dismiss splash page 1...');
            ws.send('key space\n');
        } else if (frameCount === 2) {
            console.log('\n[Action] Sending space to dismiss splash page 2...');
            ws.send('key space\n');
        } else if (frameCount >= 3) {
            console.log('\n[SUCCESS] Authentic Sil-Q live frame received!');
            ws.close();
            process.exit(0);
        }
    }
});

ws.on('error', err => {
    console.error('[Error]', err);
    process.exit(1);
});

setTimeout(() => {
    console.error('[Timeout] Test did not finish in 8 seconds');
    process.exit(1);
}, 8000);

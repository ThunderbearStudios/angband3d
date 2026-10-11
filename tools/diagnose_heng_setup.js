const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket(`ws://localhost:8080/ws?user=TestHeng_${Date.now()}&realm=hengband&new=1`);
let step = 0;

ws.on('open', () => console.log('Connected to Hengband'));
ws.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    if (frame.t !== 'frame') return;
    step++;
    const screen = frame.term?.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '';
    console.log(`[Step ${step}] phase=${frame.phase} more=${frame.ui?.more} awaiting=${frame.ui?.awaiting_command}`);
    console.log('--- Top 4 lines ---');
    console.log(frame.term?.rows?.slice(0, 4).map(r => r.g).join('\n'));
    console.log('--- Bottom 4 lines ---');
    console.log(frame.term?.rows?.slice(-4).map(r => r.g).join('\n'));

    if (frame.phase === 'play') {
        console.log(`In PLAY! Player at (${frame.player?.x}, ${frame.player?.y})`);
        ws.close();
        process.exit(0);
    }

    if (step > 30) {
        console.log('Too many steps, exiting');
        ws.close();
        process.exit(1);
    }

    // Handle setup
    const lower = screen.toLowerCase();
    if (lower.includes('press any key') || lower.includes('press space') || frame.ui?.more || lower.includes('-more-')) {
        ws.send('key space');
    } else if (lower.includes('yes/no') || lower.includes('[y/n]')) {
        ws.send('key y');
    } else {
        ws.send('key enter');
    }
});

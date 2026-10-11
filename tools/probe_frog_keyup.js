const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket(`ws://localhost:8080/ws?user=FrogProbe_${Date.now()}&realm=frogcomposband&new=1`);

ws.on('open', () => console.log('Connected to FrogComposBand'));

let inPlay = false;

ws.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    if (frame.t !== 'frame') return;

    const screen = (frame.term?.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

    if (frame.phase === 'setup') {
        if (screen.includes('press any other key to play') || screen.includes('press ? for credits') || screen.includes('press space')) {
            ws.send('key space');
        } else if (screen.includes('choose the type of game to play')) {
            ws.send('key b');
        } else if (screen.includes('beginner') || screen.includes('standard')) {
            ws.send('key enter');
        } else if (screen.includes('next screen') || screen.includes('ret) next screen')) {
            ws.send('key enter');
        } else if (screen.includes('begin play') || screen.includes('ret) begin play') || screen.includes('starting stats')) {
            ws.send('key enter');
        } else if (frame.ui?.more || screen.includes('-more-')) {
            ws.send('key space');
        } else {
            ws.send('key enter');
        }
        return;
    }

    if (frame.phase === 'play') {
        if (frame.ui?.more || screen.includes('-more-')) {
            ws.send('key space');
            return;
        }

        if (!frame.ui?.awaiting_command) return;

        if (!inPlay) {
            inPlay = true;
            console.log(`[PLAY START] Player at (${frame.player.x}, ${frame.player.y})`);
            console.log(`Row 0: '${frame.term.rows[0].g}'`);
            console.log('Sending: key up');
            ws.send('key up');
            return;
        }

        console.log(`[AFTER KEY UP] Player at (${frame.player.x}, ${frame.player.y})`);
        console.log(`Row 0: '${frame.term.rows[0].g}'`);
        console.log(`Row 1: '${frame.term.rows[1].g}'`);
        console.log(`Messages: ${JSON.stringify(frame.messages)}`);
        
        ws.send(JSON.stringify({ t: 'quit' }));
        setTimeout(() => {
            ws.close();
            process.exit(0);
        }, 200);
    }
});

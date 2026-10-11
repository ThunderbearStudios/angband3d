const WebSocket = require('../server/node_modules/ws');

async function testFrog() {
    const ws = new WebSocket(`ws://localhost:8080/ws?user=TestFrogKey_${Date.now()}&realm=frogcomposband&new=1`);
    let inPlay = 0;

    ws.on('open', () => console.log('Connected to FrogComposBand'));

    ws.on('message', async (data) => {
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

            if (inPlay === 0) {
                inPlay = 1;
                console.log(`[Frog Play] Pos: (${frame.player.x}, ${frame.player.y})`);
                console.log(`Term row 0: "${frame.term.rows[0].g}"`);
                
                // Test 1: Send 'key up'
                console.log('--- Test 1: ws.send("key up") ---');
                ws.send('key up');
                return;
            }

            if (inPlay === 1) {
                inPlay = 2;
                console.log(`After 'key up': pos=(${frame.player.x}, ${frame.player.y}) msg="${frame.term.rows[0].g.trim()}"`);
                // Test 2: Send 'keys ;8'
                console.log('--- Test 2: ws.send("keys ;8") ---');
                ws.send('keys ;8');
                return;
            }

            if (inPlay === 2) {
                inPlay = 3;
                console.log(`After 'keys ;8': pos=(${frame.player.x}, ${frame.player.y}) msg="${frame.term.rows[0].g.trim()}"`);
                ws.close();
                process.exit(0);
            }
        }
    });
}

testFrog();

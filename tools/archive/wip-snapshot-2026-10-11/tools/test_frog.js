const WebSocket = require('../server/node_modules/ws');
const SERVER_URL = 'ws://127.0.0.1:8080/ws';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
    const ws = new WebSocket(`${SERVER_URL}?realm=frogcomposband&new=1&user=TestFrog`);
    
    ws.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'frame') {
            const rows = msg.term && msg.term.rows ? msg.term.rows.map(r => r.g || '') : [];
            const rawScreen = rows.join('\n');
            const screenText = rawScreen.toLowerCase();
            const topRow = rows[0] || '';
            const bottomRow = rows[rows.length - 1] || '';
            console.log(`[Phase: ${msg.phase}] TOP: ${topRow.trim()}`);
            if (bottomRow.trim()) console.log(`[Phase: ${msg.phase}] BOT: ${bottomRow.trim()}`);
            
            if (msg.phase !== 'play') {
                if (screenText.includes('name:')) {
                    ws.send('key enter');
                } else if (screenText.includes('options') && screenText.includes('esc')) {
                    ws.send('key escape');
                } else if (screenText.includes('yes,') && screenText.includes('no,')) {
                    ws.send('key y');
                }
            } else {
                console.log(`PLAY PHASE REACHED`);
            }
        }
    });

    await delay(3000);
    console.log('Sending space');
    ws.send('key space');
    await delay(20000); // Wait 20 seconds for level generation
    console.log('Done');
    ws.close();
}
test();

const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=HengDiag&realm=hengband&new=1');
let count = 0;

ws.on('open', () => console.log('Connected to Hengband WS'));
ws.on('message', (d) => {
    let frame;
    try {
        frame = JSON.parse(d.toString());
    } catch (_) { return; }
    if (frame.t === 'hello') {
        console.log('[HELLO]', frame.realm, frame.version);
    }
    if (frame.t === 'frame') {
        count++;
        const text = (frame.term?.rows || []).map(r => r.g || '').filter(Boolean).join('\n');
        console.log(`\n--- FRAME ${count} (Phase: ${frame.phase}) ---`);
        if (count >= 16) {
            console.log(text);
        } else {
            console.log(text.slice(0, 300));
        }
        
        // Auto-reply
        if (text.includes('Sex:')) ws.send('key b');
        else if (text.includes('Race:')) ws.send('key a');
        else if (text.includes('Class:')) ws.send('key a');
        else if (text.includes('Realm 1:') || text.includes('realm 1:')) ws.send('key a');
        else if (text.includes('Personality:')) ws.send('key a');
        else if (text.includes('esc:') || text.includes('ESC:') || text.includes('birth options') || text.includes('esc:accept')) ws.send('key escape');
        else if (text.includes('Enter your player\'s name') || text.includes('Enter name:')) ws.send('key enter');
        else if (text.includes('Hit any key') || text.includes('press space') || text.includes('press any key')) ws.send('key space');
        else if (text.includes('Are you sure?') || text.includes('[y/n]')) ws.send('key y');
        else if (text.includes('ret) next screen') || text.includes('next screen')) ws.send('key enter');
        else ws.send('key enter');
        
        if (frame.phase === 'play' || count > 30) {
            console.log('Finished or reached limit! Phase:', frame.phase);
            ws.close();
            process.exit(0);
        }
    }
});

setTimeout(() => {
    console.log('Timeout after 15s');
    process.exit(1);
}, 15000);

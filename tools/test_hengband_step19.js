const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_HengDebug&realm=hengband&new=1');

let step = 0;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server for Hengband Step 19 debug');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'event') {
            console.log(`[EVENT] ${msg.type}: ${msg.detail}`);
            return;
        }
        if (msg.t === 'frame') {
            step++;
            const frame = msg;
            const termLines = frame.term ? (frame.term.lines || frame.term.rows || []) : [];
            const screenText = termLines.map(r => r.g || '').join('\n').toLowerCase();
            const isMore = !!(frame.more || frame.ui?.more || screenText.includes('-more-'));
            const isAwaiting = !!(frame.awaiting_command || frame.ui?.awaiting_command);

            console.log(`\n[Frame ${step}] Phase=${frame.phase} Overlay=${frame.ui?.overlay} Awaiting=${isAwaiting} More=${isMore}`);

            const preview = termLines.map(r => (r.g || '').trimEnd()).filter(l => l.trim().length > 0).slice(0, 3).join(' || ');
            const bottomPreview = termLines.slice(-2).map(r => (r.g || '').trimEnd()).filter(l => l.trim().length > 0).join(' || ');
            if (preview) console.log(`   Top: ${preview}`);
            if (bottomPreview) console.log(`   Bottom: ${bottomPreview}`);

            if (frame.phase === 'play') {
                console.log(`\n*** SUCCESS! REACHED PLAY PHASE! ***`);
                console.log(`Player: (${frame.player?.x}, ${frame.player?.y})`);
                ws.close();
                process.exit(0);
            }

            if (step === 19) {
                console.log('-> At Step 19 review screen! Sending key enter...');
                ws.send('key enter\n');

                // After 1.5s, probe the engine state
                setTimeout(() => {
                    console.log('-> Probe 1: sending ping');
                    ws.send('ping\n');
                }, 1500);

                setTimeout(() => {
                    console.log('-> Probe 2: sending frame');
                    ws.send('frame\n');
                }, 2500);

                setTimeout(() => {
                    console.log('-> Probe 3: sending key space');
                    ws.send('key space\n');
                }, 3500);

                setTimeout(() => {
                    console.log('-> Probe 4: sending key enter');
                    ws.send('key enter\n');
                }, 4500);

                return;
            }

            // Progression before step 19
            if (isMore) {
                ws.send('key space\n');
            } else if (screenText.includes('esc:') || screenText.includes('esc:accept')) {
                ws.send('key escape\n');
            } else if (screenText.includes('[y/n]')) {
                ws.send('key y\n');
            } else {
                ws.send('key enter\n');
            }
        }
    } catch (e) {
        console.error('[WS] Parse error:', e);
    }
});

setTimeout(() => {
    console.log('Timeout after 12s, closing.');
    ws.close();
    process.exit(1);
}, 12000);

const WebSocket = require('../server/node_modules/ws');

const ws = new WebSocket('ws://localhost:8080/ws?user=Hero_HengLive&realm=hengband&new=1');

let step = 0;
let inPlay = false;

ws.on('open', () => {
    console.log('[WS] Connected to Angband3D server for Hengband');
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'frame') {
            step++;
            const frame = msg;
            const termLines = frame.term ? (frame.term.lines || frame.term.rows || []) : [];
            const screenText = termLines.map(r => r.g || '').join('\n').toLowerCase();
            const isMore = !!(frame.more || frame.ui?.more || screenText.includes('-more-'));
            const isAwaiting = !!(frame.awaiting_command || frame.ui?.awaiting_command);

            console.log(`\n[Frame ${step}] Phase=${frame.phase} Overlay=${frame.ui?.overlay} Awaiting=${isAwaiting} More=${isMore}`);

            const preview = termLines
                .map(r => (r.g || '').trimEnd())
                .filter(l => l.trim().length > 0)
                .slice(0, 5)
                .join(' || ');
            const bottomPreview = termLines
                .slice(-3)
                .map(r => (r.g || '').trimEnd())
                .filter(l => l.trim().length > 0)
                .join(' || ');
            if (preview) console.log(`   Top Preview: ${preview}`);
            if (bottomPreview) console.log(`   Bottom Preview: ${bottomPreview}`);

            if (frame.phase === 'setup') {
                if (isMore) {
                    console.log('-> Passing more prompt (space)');
                    ws.send('key space\n');
                } else if (screenText.includes('press any other key to play') || screenText.includes('press ? for credits') || screenText.includes('press any key')) {
                    console.log('-> Passing splash (space)');
                    ws.send('key space\n');
                } else if (screenText.includes('choose the type of game to play') || screenText.includes('choose mode')) {
                    console.log('-> Selecting standard/beginner mode (b)');
                    ws.send('key b\n');
                } else if (screenText.includes('choose a sex') || screenText.includes('select sex')) {
                    console.log('-> Selecting Male sex (b)');
                    ws.send('key b\n');
                } else if (screenText.includes('choose a race') || screenText.includes('select race')) {
                    console.log('-> Selecting Human race (a)');
                    ws.send('key a\n');
                } else if (screenText.includes('choose a class') || screenText.includes('select class')) {
                    console.log('-> Selecting Warrior class (a)');
                    ws.send('key a\n');
                } else if (screenText.includes('choose a realm') || screenText.includes('magic realm')) {
                    console.log('-> Selecting Life realm (a)');
                    ws.send('key a\n');
                } else if (screenText.includes('choose personality') || screenText.includes('personality')) {
                    console.log('-> Selecting Ordinary personality (a)');
                    ws.send('key a\n');
                } else if (screenText.includes('esc:') || screenText.includes('birth options') || screenText.includes('esc:accept')) {
                    console.log('-> Accepting birth options (escape)');
                    ws.send('key escape\n');
                } else if (screenText.includes('are you sure? [y/n]') || screenText.includes('[y/n]')) {
                    console.log('-> Confirming [Y] (y)');
                    ws.send('key y\n');
                } else if (screenText.includes('next screen') || screenText.includes('ret) next screen')) {
                    console.log('-> Accepting selection (enter)');
                    ws.send('key enter\n');
                } else if (screenText.includes('begin play') || screenText.includes('ret) begin play') || screenText.includes('enter your starting stats')) {
                    console.log('-> Beginning play (enter)');
                    ws.send('key enter\n');
                } else if (screenText.includes('enter character name') || screenText.includes('character name:')) {
                    console.log('-> Submitting name (enter)');
                    ws.send('key enter\n');
                } else if (screenText.includes('hit space') || screenText.includes('press space')) {
                    console.log('-> Passing space prompt');
                    ws.send('key space\n');
                } else {
                    console.log('-> Default progression (enter)');
                    ws.send('key enter\n');
                }
            } else if (frame.phase === 'play') {
                if (isMore) {
                    console.log('-> Passing in-game -more- prompt (space)');
                    ws.send('key space\n');
                    return;
                }
                if (frame.map && frame.player) {
                    if (!inPlay) {
                        inPlay = true;
                        console.log(`\n========================================`);
                        console.log(`[PASS] Hengband live session entered play!`);
                        console.log(`[PASS] Player: ${frame.player.name} (${frame.player.race} ${frame.player.class})`);
                        console.log(`[PASS] Position: (${frame.player.x}, ${frame.player.y})`);
                        console.log(`[PASS] Map: ${frame.map.w}x${frame.map.h}, Depth: ${frame.dungeon?.depth ?? frame.player.depth}`);
                        console.log(`[PASS] HP: ${frame.player.hp}/${frame.player.max_hp}`);
                        console.log(`[PASS] Awaiting command: ${isAwaiting}`);
                        console.log(`========================================\n`);

                        console.log('-> Testing in-game movement (key right)...');
                        ws.send('key right\n');
                        return;
                    }

                    console.log(`[PASS] Movement verified! New Position: (${frame.player.x}, ${frame.player.y})`);
                    console.log('-> Testing game save & exit...');
                    ws.send('save\n');
                    setTimeout(() => {
                        ws.close();
                        console.log('[PASS] Hengband end-to-end live test succeeded!');
                        process.exit(0);
                    }, 800);
                }
            }
        }
    } catch (e) {
        console.error('[WS] Parse error:', e);
    }
});

ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
});

setTimeout(() => {
    if (!inPlay) {
        console.error('[FAIL] Hengband WS live test timed out after 25s. Steps:', step);
        ws.close();
        process.exit(1);
    }
}, 25000);

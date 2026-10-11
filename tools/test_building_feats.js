const WebSocket = require('../server/node_modules/ws');
const assert = require('assert');

// Feature IDs:
// 07..0E = Stores 1..8
// 20 = 32 Guild / Castle
// 21 = 33 Inn / Tavern
// 22 = 34 Healer
// 23 = 35 Museum
// 24 = 36 Casino
// 25 = 37 Forge
// 26 = 38 Pagoda
// 27 = 39 Bookstore
// 28 = 40 Stable
// 29 = 41 Chasm

async function auditBuildingFeats(realm) {
    return new Promise((resolve, reject) => {
        console.log(`\n========================================`);
        console.log(`[TEST: BUILDING FEATS] Auditing Realm: ${realm}`);
        console.log(`========================================`);

        const user = `FeatAudit_${realm}_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=${realm}&new=1`);
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error(`Timeout waiting for play frame in ${realm}`));
            }
        }, 35000);

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
            }
        });

        let silqStatDone = false;
        ws.on('message', (data) => {
            let frame;
            try {
                frame = JSON.parse(data.toString());
            } catch (_) { return; }

            if (frame.t !== 'frame') return;

            // Handle birth auto-advance
            const termRows = frame.term?.rows || [];
            const text = termRows.map(r => r.g || '').join('\n').toLowerCase();

            if (frame.phase === 'setup' || !frame.map) {
                if (text.includes('to start over') || text.includes("'s' to start") || text.includes('accept character') ||
                    text.includes('re-roll') || text.includes("['r'eroll") || text.includes("or enter to accept") ||
                    text.includes("reroll, 'h'istory") || text.includes("'y': use as is") || text.includes("use as is") ||
                    (text.includes('enter your starting stats') && text.includes('begin play')) ||
                    (text.includes('step back') && text.includes('continue'))) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes('[y/n]') || text.includes('(y/n)') || text.includes('are you sure')) {
                    ws.send('key y');
                    return;
                }
                if (text.includes('esc:accept') || text.includes('birth options') || text.includes('esc to return')) {
                    ws.send('key escape');
                    return;
                }
                if (text.includes('set minimum stats') || text.includes('enter for goto next')) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes('choose a realm') || text.includes('choose realm') || text.includes('realm 1:')) {
                    ws.send('key a');
                    return;
                }
                if (text.includes('choose the type of game to play')) {
                    ws.send('key b');
                    return;
                }
                if (text.includes('ret) next screen') || text.includes('next screen')) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes('finish the character with random') || text.includes("'@' to finish") || text.includes("'@' finish")) {
                    ws.send('key @');
                    return;
                }
                if (text.includes('choose a sex') || text.includes('choose a race') ||
                    text.includes('choose a class') || text.includes('choose a personality') ||
                    text.includes('random menu item') || text.includes('* random') ||
                    text.includes('choose your race') || text.includes('choose your class') ||
                    text.includes('choose house') || text.includes('choose a house')) {
                    ws.send('key *');
                    return;
                }
                if (text.includes('allocate points to skills') || text.includes('skill increases') || text.includes('accept skills') ||
                    text.includes('accept history') || text.includes('accept age/height/weight')) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes('allocate points to stats') || text.includes('accept stats')) {
                    if (!silqStatDone) {
                        silqStatDone = true;
                        ['6','6','2','6','6','2','6','6','2','6','8','6','enter'].forEach(k => ws.send(`key ${k}`));
                    }
                    return;
                }
                if (text.includes('enter accept name') || text.includes('accept name') || text.includes('tab random name')) {
                    ws.send('key tab');
                    ws.send('key enter');
                    return;
                }
                if (text.includes("enter a name for your character") || text.includes("enter your player's name") || text.includes("enter name:")) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes('character background') || text.includes('cursor key for move, enter for end')) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes("start over, or enter to continue") || text.includes("['q'uit, 's'tart over, or enter to continue]")) {
                    ws.send('key enter');
                    return;
                }
                if (frame.more || frame.ui?.more || text.includes('-more-') || text.includes('press space') || text.includes('press any key') || text.includes('press any other key to play') || text.includes('press ? for credits')) {
                    ws.send('key space');
                    return;
                }
                if (text.includes('into the vast and echoing gloom') || text.includes('depths they went alone') ||
                    text.includes('menace dark enshrined') || text.includes('when the world is old') ||
                    text.includes('rephial.org') || text.includes('last battle be gathered')) {
                    ws.send('key enter');
                    return;
                }
                if (text.includes('select your character') || text.includes('choose a') || text.includes('selection')) {
                    ws.send('key @');
                    return;
                }
                ws.send('key enter');
                return;
            }

            if (frame.phase === 'play' && frame.map && frame.map.rows) {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);

                // Collect all feature IDs present in map
                const featCounts = new Map();
                for (const row of frame.map.rows) {
                    if (!row.f) continue;
                    for (let c = 0; c < row.f.length; c += 2) {
                        const featId = parseInt(row.f.substring(c, c + 2), 16);
                        featCounts.set(featId, (featCounts.get(featId) || 0) + 1);
                    }
                }

                console.log(`[${realm.toUpperCase()}] Map Dimensions: ${frame.map.w}x${frame.map.h}, Unique Features: ${featCounts.size}`);
                const sortedFeats = Array.from(featCounts.entries()).sort((a, b) => a[0] - b[0]);
                for (const [id, count] of sortedFeats) {
                    const hex = id.toString(16).padStart(2, '0').toUpperCase();
                    console.log(`  Feat 0x${hex} (${id.toString().padStart(2, ' ')}): ${count.toString().padStart(5, ' ')} tiles`);
                }

                ws.send('key q');
                ws.send('key y');
                ws.close();
                resolve({ realm, featCounts });
            }
        });
    });
}

async function run() {
    try {
        const silq = await auditBuildingFeats('silq');
        const fcb = await auditBuildingFeats('frogcomposband');
        const heng = await auditBuildingFeats('hengband');
        console.log('\n========================================');
        console.log('>>> ALL REALM MAP FEATS AUDITED SUCCESSFULLY! <<<');
        console.log('========================================');
    } catch (e) {
        console.error('Audit failed:', e);
        process.exit(1);
    }
}

run();

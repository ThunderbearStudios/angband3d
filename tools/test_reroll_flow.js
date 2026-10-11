const WebSocket = require('../server/node_modules/ws');

function runTest(name, url, flowHandler) {
    return new Promise((resolve, reject) => {
        console.log(`\n========================================`);
        console.log(`[TEST] Starting test: ${name}`);
        console.log(`[TEST] URL: ${url}`);
        const ws = new WebSocket(url);
        let step = 0;
        let finished = false;

        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                ws.close();
                reject(new Error(`Test "${name}" timed out after 15s. Steps: ${step}`));
            }
        }, 15000);

        ws.on('open', () => {
            console.log(`[WS] Connected`);
        });

        ws.on('message', (data) => {
            if (finished) return;
            try {
                const msg = JSON.parse(data.toString());
                if (msg.t === 'frame') {
                    step++;
                    flowHandler(msg, ws, step, () => {
                        finished = true;
                        clearTimeout(timeout);
                        ws.close();
                        console.log(`[PASS] Test "${name}" passed!`);
                        resolve();
                    }, (err) => {
                        finished = true;
                        clearTimeout(timeout);
                        ws.close();
                        reject(err);
                    });
                }
            } catch (err) {
                console.error('[WS Parse Error]', err);
            }
        });

        ws.on('error', (err) => {
            if (!finished) {
                finished = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}

async function main() {
    // ----------------------------------------------------
    // TEST 1: Sil-Q Random Birth, Tolkien Name, Review Pause & Re-Roll
    // ----------------------------------------------------
    let silqStatAllocated = false;
    let silqNameSent = false;
    let silqReviewCount = 0;
    let firstHeroName = null;
    let secondHeroName = null;

    await runTest('Sil-Q Character Population, Review Pause & Re-Roll Flow', 'ws://localhost:8080/ws?realm=silq&new=1', (frame, ws, step, pass, fail) => {
        if (frame.phase === 'setup') {
            const screen = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

            // 1. Review Screen Detection
            const isReview = screen.includes('accept character') || screen.includes('re-roll') || screen.includes("'r' or 's'");
            if (isReview) {
                silqReviewCount++;
                console.log(`\n[Sil-Q] Review screen reached (count: ${silqReviewCount})!`);

                // Check player name on screen
                let detectedName = '';
                if (frame.term && frame.term.rows && frame.term.rows[2]) {
                    const rowText = frame.term.rows[2].g || '';
                    console.log(`[Sil-Q Review Row 2] "${rowText}"`);
                    const match = rowText.match(/Name\s*:?\s+([A-Za-z0-9_\-']+)/i);
                    if (match) detectedName = match[1].trim();
                }

                if (silqReviewCount === 1) {
                    firstHeroName = detectedName;
                    console.log(`[Sil-Q] First hero rolled: "${firstHeroName}"`);
                    if (!firstHeroName || firstHeroName === 'Adventurer' || firstHeroName === 'PLAYER') {
                        return fail(new Error(`First hero has generic/empty name: "${firstHeroName}"`));
                    }
                    console.log(`[Sil-Q] Testing Re-roll (sending 'key r')...`);
                    silqStatAllocated = false;
                    silqNameSent = false;
                    ws.send('key r');
                    return;
                } else if (silqReviewCount === 2) {
                    secondHeroName = detectedName;
                    console.log(`[Sil-Q] Second hero rolled after re-roll: "${secondHeroName}"`);
                    console.log(`[Sil-Q] Testing Accept (sending 'key enter')...`);
                    ws.send('key enter');
                    return;
                }
            }

            // Normal Setup Steps
            if (screen.includes('random menu item') || screen.includes('* random')) {
                ws.send('key *');
            } else if (screen.includes('allocate points to skills') || screen.includes('skill increases') || screen.includes('accept skills')) {
                ws.send('key enter');
            } else if (screen.includes('allocate points to stats') || screen.includes('accept stats')) {
                if (!silqStatAllocated) {
                    silqStatAllocated = true;
                    console.log('[Sil-Q] Allocating 13 stat points...');
                    const seq = ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'];
                    seq.forEach(k => ws.send(`key ${k}`));
                }
            } else if (screen.includes('accept history') || screen.includes('reroll history')) {
                ws.send('key enter');
            } else if (screen.includes('accept age/height/weight')) {
                ws.send('key enter');
            } else if (screen.includes('enter accept name') || screen.includes('accept name') || screen.includes('tab random name')) {
                if (!silqNameSent) {
                    silqNameSent = true;
                    console.log('[Sil-Q] At name screen. Sending Tab for Tolkien name, then Enter...');
                    ws.send('key tab');
                    ws.send('key enter');
                }
            } else if (screen.includes('into the vast and echoing gloom')) {
                ws.send('key enter');
            } else if (screen.includes('press any key') || screen.includes('[press') || screen.includes('-more-')) {
                ws.send('key enter');
            }
        } else if (frame.phase === 'play' && frame.map && frame.player) {
            console.log(`[Sil-Q Play] Successfully entered Angband!`);
            console.log(`[Sil-Q Play] Final Player Name: "${frame.player.name}"`);
            console.log(`[Sil-Q Play] Race: ${frame.player.race}, House: ${frame.player.house || frame.player.class}`);
            console.log(`[Sil-Q Play] Stats: Str ${frame.player.stats.str.use}, Dex ${frame.player.stats.dex.use}, Con ${frame.player.stats.con.use}, Gra ${frame.player.stats.gra.use}`);
            console.log(`[Sil-Q Play] Exp: ${frame.player.exp}`);

            if (!frame.player.name || frame.player.name === 'Adventurer' || frame.player.name === 'PLAYER') {
                return fail(new Error(`Player entered dungeon with generic name "${frame.player.name}"!`));
            }
            if (silqReviewCount < 2) {
                return fail(new Error(`Failed to test re-roll: silqReviewCount was ${silqReviewCount}`));
            }
            pass();
        }
    });

    // ----------------------------------------------------
    // TEST 2: Vanilla Angband Random Birth, Review Pause & Re-Roll
    // ----------------------------------------------------
    let vanillaReviewCount = 0;
    await runTest('Vanilla Angband Review Pause & Re-Roll Flow', 'ws://localhost:8080/ws?realm=angband&new=1', (frame, ws, step, pass, fail) => {
        if (frame.phase === 'setup') {
            const screen = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();

            const isReview = screen.includes('to start over') ||
                             screen.includes("'s' to start over") ||
                             screen.includes('use as is') ||
                             screen.includes("'y': use") ||
                             (screen.includes('step back') && screen.includes('continue'));

            if (isReview) {
                vanillaReviewCount++;
                console.log(`\n[Vanilla] Review screen reached (count: ${vanillaReviewCount})!`);
                const isUseAsIs = screen.includes('use as is') || screen.includes("'y': use");
                if (vanillaReviewCount === 1) {
                    console.log(`[Vanilla] Testing Re-roll (sending '${isUseAsIs ? 'key n' : 'key s'}')...`);
                    ws.send(isUseAsIs ? 'key n' : 'key s');
                    return;
                } else if (vanillaReviewCount === 2) {
                    console.log(`[Vanilla] Testing Accept (sending '${isUseAsIs ? 'key y' : 'key enter'}')...`);
                    ws.send(isUseAsIs ? 'key y' : 'key enter');
                    return;
                }
            }

            if (screen.includes('finish the character with random') || screen.includes("'@' to finish") || screen.includes("'@' finish")) {
                ws.send('key @');
            } else if (screen.includes('select your character') || screen.includes('choose a') || screen.includes('selection')) {
                ws.send('key @');
            } else if (screen.includes('[y/n]') || screen.includes('are you sure')) {
                ws.send('key y');
            } else if (screen.includes('press any key') || screen.includes('[press') || screen.includes('press space') || screen.includes('-more-')) {
                ws.send('key enter');
            } else {
                ws.send('key enter');
            }
        } else if (frame.phase === 'play' && frame.map && frame.player) {
            console.log(`[Vanilla Play] Successfully entered play! Player: "${frame.player.name}", Race: ${frame.player.race}, Class: ${frame.player.class}`);
            if (vanillaReviewCount < 2) {
                return fail(new Error(`Vanilla failed to test re-roll: reviewCount was ${vanillaReviewCount}`));
            }
            pass();
        }
    });

    console.log(`\n========================================`);
    console.log(`[ALL TESTS PASSED] Re-roll flow and Sil-Q Tolkien name generation verified!`);
    console.log(`========================================\n`);
}

main().catch(err => {
    console.error('\n[FATAL TEST FAILURE]', err);
    process.exit(1);
});

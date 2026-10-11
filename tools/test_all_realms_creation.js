const WebSocket = require('../server/node_modules/ws');

const REALMS = ['angband', 'silq', 'hengband', 'frogcomposband'];

async function testQuickStartBirth(realm) {
    return new Promise((resolve, reject) => {
        console.log(`\n==================================================`);
        console.log(`[TEST: QUICKSTART BIRTH] Realm: ${realm}`);
        console.log(`==================================================`);
        const user = `Quick_${realm}_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=${realm}&new=1`);
        let frames = 0;
        let enteredPlay = false;
        let silqStatAllocated = false;

        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`[TIMEOUT] Realm ${realm} did not reach active play phase within 25 seconds.`));
        }, 25000);

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        ws.on('message', (data) => {
            let frame;
            try {
                frame = JSON.parse(data.toString());
            } catch (_) {
                return;
            }
            if (frame.t !== 'frame') return;
            frames++;

            const termRows = frame.term?.rows || frame.term?.lines || [];
            const screenText = termRows.map(r => r.g || '').join('\n').toLowerCase();
            const hasMore = !!(frame.more || frame.ui?.more || screenText.includes('-more-'));
            const isAwaiting = !!(frame.awaiting_command || frame.ui?.awaiting_command);

            if (frame.phase === 'play' && frame.map && frame.player) {
                if (!enteredPlay) {
                    enteredPlay = true;
                    clearTimeout(timeout);
                    console.log(`\n>>> SUCCESS: ${realm.toUpperCase()} ENTERED ACTIVE PLAY! <<<`);
                    console.log(`Player Name: ${frame.player.name}`);
                    console.log(`Race: ${frame.player.race} | Class: ${frame.player.class || frame.player.house || 'N/A'}`);
                    console.log(`Level: ${frame.player.level || frame.player.lev} | HP: ${frame.player.hp}/${frame.player.hp_max || frame.player.max_hp}`);
                    console.log(`Dungeon Depth: ${frame.player.depth ?? frame.dungeon?.depth} | Map: ${frame.map.w}x${frame.map.h}`);
                    if (frame.player.stats) {
                        const s = frame.player.stats;
                        const sStr = Object.keys(s).map(k => `${k.toUpperCase()}:${s[k].use || s[k]}`).join(' ');
                        console.log(`Stats: ${sStr}`);
                    }
                    setTimeout(() => {
                        try { ws.send('key q'); ws.send('key y'); ws.close(); } catch (_) {}
                        resolve(true);
                    }, 500);
                }
                return;
            }

            if (frame.phase === 'setup' || !frame.map) {
                // Emulate client stepQuickBirth logic
                const isReview = screenText.includes('to start over') ||
                                 screenText.includes("'s' to start") ||
                                 screenText.includes('accept character') ||
                                 screenText.includes('re-roll') ||
                                 screenText.includes("['r'eroll") ||
                                 screenText.includes("or enter to accept") ||
                                 screenText.includes("reroll, 'h'istory") ||
                                 screenText.includes("'y': use as is") ||
                                 screenText.includes("use as is") ||
                                 (screenText.includes('enter your starting stats') && screenText.includes('begin play')) ||
                                 (screenText.includes('step back') && screenText.includes('continue'));

                if (isReview) {
                    console.log(`[Frame ${frames}] Reached Review Screen! Accepting character with Enter...`);
                    ws.send('key enter');
                    return;
                }

                if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('are you sure') || screenText.includes('よろしいですか')) {
                    ws.send('key y');
                    return;
                }

                if (screenText.includes('esc:accept') || screenText.includes('birth options') || screenText.includes('esc to return') || screenText.includes('smart_learn') || screenText.includes('esc: i—¹')) {
                    ws.send('key escape');
                    return;
                }

                if (screenText.includes('set minimum stats') || screenText.includes('enter for goto next')) {
                    ws.send('key enter');
                    return;
                }

                if (screenText.includes('choose a realm') || screenText.includes('choose realm') || screenText.includes('realm 1:')) {
                    ws.send('key a');
                    return;
                }

                if (screenText.includes('choose the type of game to play')) {
                    ws.send('key b');
                    return;
                }
                if (screenText.includes('ret) next screen') || screenText.includes('next screen')) {
                    ws.send('key enter');
                    return;
                }
                if (screenText.includes('enter your starting stats') && screenText.includes('begin play')) {
                    ws.send('key enter');
                    return;
                }

                if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
                    ws.send('key @');
                    return;
                }

                if (screenText.includes('choose a sex') || screenText.includes('choose a race') ||
                    screenText.includes('choose a class') || screenText.includes('choose a personality') ||
                    screenText.includes('random menu item') || screenText.includes('* random') ||
                    screenText.includes('choose your race') || screenText.includes('choose your class') ||
                    screenText.includes('choose house') || screenText.includes('choose a house')) {
                    ws.send('key *');
                    return;
                }

                if (screenText.includes('allocate points to skills') || screenText.includes('skill increases') || screenText.includes('accept skills')) {
                    ws.send('key enter');
                    return;
                }
                if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                    if (!silqStatAllocated) {
                        silqStatAllocated = true;
                        ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'].forEach(k => ws.send(`key ${k}`));
                    }
                    return;
                }

                if (screenText.includes('enter accept name') || screenText.includes('accept name') || screenText.includes('tab random name')) {
                    ws.send('key tab');
                    ws.send('key enter');
                    return;
                }
                if (screenText.includes("enter a name for your character") || screenText.includes("enter your player's name") || screenText.includes("enter name:")) {
                    ws.send('key enter');
                    return;
                }
                if (screenText.includes('character background') || screenText.includes('cursor key for move, enter for end')) {
                    ws.send('key enter');
                    return;
                }
                if (screenText.includes("start over, or enter to continue") || screenText.includes("['q'uit, 's'tart over, or enter to continue]")) {
                    ws.send('key enter');
                    return;
                }

                if (hasMore || screenText.includes('press any key') || screenText.includes('press space') ||
                    screenText.includes('press any other key to play') || screenText.includes('press ? for credits')) {
                    ws.send('key space');
                    return;
                }

                if (screenText.includes('into the vast and echoing gloom') || screenText.includes('depths they went alone') ||
                    screenText.includes('menace dark enshrined') || screenText.includes('when the world is old') ||
                    screenText.includes('rephial.org') || screenText.includes('last battle be gathered')) {
                    ws.send('key enter');
                    return;
                }

                if (screenText.includes('select your character') || screenText.includes('choose a') || screenText.includes('selection')) {
                    ws.send('key @');
                    return;
                }

                ws.send('key enter');
            }
        });
    });
}

async function testManualBirth(realm) {
    return new Promise((resolve, reject) => {
        console.log(`\n==================================================`);
        console.log(`[TEST: MANUAL BIRTH / CUSTOM HERO] Realm: ${realm}`);
        console.log(`==================================================`);
        const user = `Manual_${realm}_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=${realm}&new=1`);
        let frames = 0;
        let enteredPlay = false;
        let silqAllocated = false;

        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`[TIMEOUT] Manual creation on ${realm} timed out after 25s.`));
        }, 25000);

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        ws.on('message', (data) => {
            let frame;
            try {
                frame = JSON.parse(data.toString());
            } catch (_) {
                return;
            }
            if (frame.t !== 'frame') return;
            frames++;

            const termRows = frame.term?.rows || frame.term?.lines || [];
            const screenText = termRows.map(r => r.g || '').join('\n').toLowerCase();
            const hasMore = !!(frame.more || frame.ui?.more || screenText.includes('-more-'));

            if (frame.phase === 'play' && frame.map && frame.player) {
                if (!enteredPlay) {
                    enteredPlay = true;
                    clearTimeout(timeout);
                    console.log(`\n>>> SUCCESS: ${realm.toUpperCase()} MANUAL HERO ENTERED PLAY! <<<`);
                    console.log(`Player Name: ${frame.player.name}`);
                    console.log(`Race: ${frame.player.race} | Class: ${frame.player.class || frame.player.house || 'N/A'}`);
                    console.log(`Level: ${frame.player.level || frame.player.lev} | HP: ${frame.player.hp}/${frame.player.hp_max || frame.player.max_hp}`);
                    console.log(`Depth: ${frame.player.depth ?? frame.dungeon?.depth}`);
                    setTimeout(() => {
                        try { ws.send('key q'); ws.send('key y'); ws.close(); } catch (_) {}
                        resolve(true);
                    }, 500);
                }
                return;
            }

            if (screenText.includes('are you sure? [y/n]') || screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('よろしいですか')) {
                console.log(`[Manual][Frame ${frames}] Answering Yes to confirmation prompt`);
                ws.send('key y');
                return;
            }

            if (screenText.includes('choose the type of game to play')) {
                console.log(`[Manual][Frame ${frames}] Choosing Beginner Mode (b)`);
                ws.send('key b');
                return;
            }
            if (screenText.includes('ret) next screen') || screenText.includes('next screen')) {
                ws.send('key enter');
                return;
            }

            if (screenText.includes('esc:accept') || screenText.includes('birth options') || screenText.includes('smart_learn') || screenText.includes('esc: i—¹')) {
                console.log(`[Manual][Frame ${frames}] Accepting birth options with Esc`);
                ws.send('key escape');
                return;
            }

            if (screenText.includes('set minimum stats') || screenText.includes('enter for goto next')) {
                console.log(`[Manual][Frame ${frames}] Accepting minimum stats with Enter`);
                ws.send('key enter');
                return;
            }

            // Specific manual choices: 'a' for first race/class/house
            if (screenText.includes('choose a sex') || screenText.includes('choose sex')) {
                console.log(`[Manual][Frame ${frames}] Choosing Sex option (b)`);
                ws.send('key b');
                return;
            }
            if (screenText.includes('choose a race') || screenText.includes('choose your race')) {
                console.log(`[Manual][Frame ${frames}] Choosing Race option (a)`);
                ws.send('key a');
                return;
            }
            if (screenText.includes('choose a class') || screenText.includes('choose your class')) {
                console.log(`[Manual][Frame ${frames}] Choosing Class option (a)`);
                ws.send('key a');
                return;
            }
            if (screenText.includes('choose a realm') || screenText.includes('realm 1:')) {
                console.log(`[Manual][Frame ${frames}] Choosing Realm option (a)`);
                ws.send('key a');
                return;
            }
            if (screenText.includes('choose a personality') || screenText.includes('personality')) {
                console.log(`[Manual][Frame ${frames}] Choosing Personality option (a)`);
                ws.send('key a');
                return;
            }
            if (screenText.includes('choose house') || screenText.includes('choose a house')) {
                console.log(`[Manual][Frame ${frames}] Choosing House option (a)`);
                ws.send('key a');
                return;
            }

            if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                if (!silqAllocated) {
                    silqAllocated = true;
                    console.log(`[Manual][Frame ${frames}] Allocating Sil-Q stats manually`);
                    ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'].forEach(k => ws.send(`key ${k}`));
                }
                return;
            }

            if (screenText.includes('allocate points to skills') || screenText.includes('skill increases') || screenText.includes('accept skills')) {
                ws.send('key enter');
                return;
            }

            if (screenText.includes("enter a name for your character") || screenText.includes("enter your player's name") || screenText.includes("enter name:")) {
                console.log(`[Manual][Frame ${frames}] Submitting custom hero name`);
                ws.send('key enter');
                return;
            }

            if (screenText.includes('character background') || screenText.includes('cursor key for move, enter for end')) {
                console.log(`[Manual][Frame ${frames}] Ending background edit mode with Enter`);
                ws.send('key enter');
                return;
            }

            if (screenText.includes("start over, or enter to continue") || screenText.includes("['q'uit, 's'tart over, or enter to continue]")) {
                console.log(`[Manual][Frame ${frames}] Confirming ready to embark with Enter`);
                ws.send('key enter');
                return;
            }

            const isReview = screenText.includes('to start over') ||
                             screenText.includes("'s' to start") ||
                             screenText.includes('accept character') ||
                             screenText.includes('re-roll') ||
                             screenText.includes("['r'eroll") ||
                             screenText.includes("or enter to accept") ||
                             screenText.includes("reroll, 'h'istory") ||
                             screenText.includes("'y': use as is") ||
                             screenText.includes("use as is") ||
                             (screenText.includes('enter your starting stats') && screenText.includes('begin play')) ||
                             (screenText.includes('step back') && screenText.includes('continue'));

            if (isReview) {
                console.log(`[Manual][Frame ${frames}] Reached Review Screen! Accepting character with Enter`);
                ws.send('key enter');
                return;
            }

            if (hasMore || screenText.includes('press any key') || screenText.includes('press space')) {
                ws.send('key space');
                return;
            }

            if (screenText.includes('into the vast and echoing gloom') || screenText.includes('depths they went alone') ||
                screenText.includes('menace dark enshrined') || screenText.includes('when the world is old') ||
                screenText.includes('rephial.org') || screenText.includes('last battle be gathered')) {
                ws.send('key enter');
                return;
            }

            if (screenText.includes('point-based') || screenText.includes('standard roller') || screenText.includes('roller')) {
                ws.send('key enter');
                return;
            }

            ws.send('key enter');
        });
    });
}

async function runAll() {
    console.log('===============================================================');
    console.log('       MULTI-REALM CHARACTER CREATION VERIFICATION SUITE       ');
    console.log('===============================================================');
    let quickPassed = 0;
    let manualPassed = 0;

    console.log('\n--- PART 1: QUICKSTART BIRTH (AUTOMATED RANDOM HERO) ---');
    for (const realm of REALMS) {
        try {
            await testQuickStartBirth(realm);
            quickPassed++;
        } catch (err) {
            console.error(`FAILED QuickStart on ${realm}:`, err.message);
        }
    }

    console.log('\n--- PART 2: MANUAL CREATION (CUSTOM HERO NAVIGATION) ---');
    for (const realm of REALMS) {
        try {
            await testManualBirth(realm);
            manualPassed++;
        } catch (err) {
            console.error(`FAILED Manual creation on ${realm}:`, err.message);
        }
    }

    console.log(`\n===============================================================`);
    console.log(`FINAL RESULTS:`);
    console.log(`  QuickStart: ${quickPassed}/${REALMS.length} passed`);
    console.log(`  Manual:     ${manualPassed}/${REALMS.length} passed`);
    console.log(`===============================================================`);
    if (quickPassed < REALMS.length || manualPassed < REALMS.length) {
        process.exit(1);
    }
}

runAll();


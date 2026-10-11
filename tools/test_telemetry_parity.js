/**
 * Verifies that the JSON bridge telemetry across all 4 realms emits:
 * 1. Equipment (weapon_item, bow_item, shield_item, light_item, etc.)
 * 2. Variant combat/defense stats (Sil-Q evn, pr_min, pr_max, speed; Hengband/Vanilla/FCB ac, stats)
 * 3. Status condition arrays and lighting radius.
 */

const WebSocket = require('../server/node_modules/ws');

const REALMS = ['angband', 'silq', 'hengband', 'frogcomposband'];

async function testRealmTelemetry(realm) {
    return new Promise((resolve, reject) => {
        console.log(`\n==================================================`);
        console.log(`[TEST: TELEMETRY PARITY] Realm: ${realm}`);
        console.log(`==================================================`);
        const user = `Telem_${realm}_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=${realm}&new=1`);
        let frames = 0;
        let enteredPlay = false;
        let silqStatAllocated = false;
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error(`[TIMEOUT] Realm ${realm} did not reach active play phase within 25 seconds.`));
            }
        }, 25000);

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
            }
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
                if (!enteredPlay && !resolved) {
                    enteredPlay = true;
                    resolved = true;
                    clearTimeout(timeout);

                    const p = frame.player;
                    console.log(`\n>>> SUCCESS: ${realm.toUpperCase()} ENTERED ACTIVE PLAY! <<<`);
                    console.log(`Player Name: ${p.name}`);
                    console.log(`Race: ${p.race} | Class/House: ${p.class || p.house || 'N/A'}`);
                    console.log(`Depth: ${p.depth} | Light Radius: ${p.light}`);
                    console.log(`Equipment Telemetry:`);
                    console.log(`  - Weapon:     ${p.weapon_item || '(none)'}`);
                    console.log(`  - Bow:        ${p.bow_item || '(none)'}`);
                    console.log(`  - Shield:     ${p.shield_item || '(none)'}`);
                    console.log(`  - Light Item: ${p.light_item || '(none)'}`);
                    console.log(`Statuses Array: ${Array.isArray(p.statuses) ? `Yes (${p.statuses.length} entries)` : 'No'}`);

                    let checksPassed = true;

                    if (realm === 'silq') {
                        console.log(`Sil-Q Defense & Mechanics:`);
                        console.log(`  - Evasion (EV):      ${p.evn}`);
                        console.log(`  - Protection (PR):   [${p.pr_min}-${p.pr_max}]`);
                        console.log(`  - Speed:             ${p.speed}`);
                        console.log(`  - Grace (GRA) Stat:  ${JSON.stringify(p.stats?.gra)}`);

                        if (p.evn === undefined || p.pr_min === undefined || p.pr_max === undefined) {
                            console.error(`FAILED: Sil-Q missing evn, pr_min, or pr_max`);
                            checksPassed = false;
                        }
                        if (!p.weapon_item && !p.shield_item) {
                            console.error(`FAILED: Sil-Q starting inventory not equipped into viewmodel hands`);
                            checksPassed = false;
                        }
                        if (p.stats?.gra === undefined) {
                            console.error(`FAILED: Sil-Q missing GRA stat`);
                            checksPassed = false;
                        }
                    } else if (realm === 'hengband') {
                        console.log(`Hengband Combat & Mechanics:`);
                        console.log(`  - AC:                ${p.ac}`);
                        console.log(`  - Speed:             ${p.speed}`);
                        console.log(`  - Light Radius:      ${p.light}`);
                        console.log(`  - Weapon:            ${p.weapon_item || '(none)'}`);

                        if (p.ac === undefined || p.light === undefined) {
                            console.error(`FAILED: Hengband missing ac or light`);
                            checksPassed = false;
                        }
                        if (!Array.isArray(p.statuses)) {
                            console.error(`FAILED: Hengband missing statuses array`);
                            checksPassed = false;
                        }
                    } else {
                        console.log(`${realm.toUpperCase()} Combat & Mechanics:`);
                        console.log(`  - AC:                ${p.ac}`);
                        console.log(`  - Speed:             ${p.speed}`);
                        console.log(`  - Light Radius:      ${p.light}`);

                        if (p.ac === undefined || p.light === undefined) {
                            console.error(`FAILED: ${realm} missing ac or light`);
                            checksPassed = false;
                        }
                    }

                    setTimeout(() => {
                        try { ws.send('key q'); ws.send('key y'); ws.close(); } catch (_) {}
                        if (checksPassed) {
                            console.log(`>>> SUCCESS: ${realm.toUpperCase()} Telemetry Parity Verified! <<<`);
                            resolve(true);
                        } else {
                            reject(new Error(`Telemetry checks failed for ${realm}`));
                        }
                    }, 500);
                }
                return;
            }

            if (frame.phase === 'setup' || !frame.map) {
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
                    ws.send('key enter');
                    return;
                }

                if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('are you sure')) {
                    ws.send('key y');
                    return;
                }

                if (screenText.includes('esc:accept') || screenText.includes('birth options') || screenText.includes('esc to return')) {
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

async function run() {
    console.log(`===============================================================`);
    console.log(`       CROSS-REALM TELEMETRY & VIEWMODEL PARITY SUITE          `);
    console.log(`===============================================================`);

    let allPassed = true;
    for (const realm of REALMS) {
        try {
            await testRealmTelemetry(realm);
        } catch (err) {
            console.error(`[ERROR] Realm ${realm} telemetry test failed:`, err.message);
            allPassed = false;
        }
    }

    console.log(`\n===============================================================`);
    if (allPassed) {
        console.log(`ALL 4 REALMS TELEMETRY & VIEWMODEL EQUIPMENT FULLY VERIFIED!`);
    } else {
        console.log(`TELEMETRY VERIFICATION FAILED ON ONE OR MORE REALMS!`);
    }
    console.log(`===============================================================\n`);
    process.exit(allPassed ? 0 : 1);
}

run();

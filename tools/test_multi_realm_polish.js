const WebSocket = require('../server/node_modules/ws');
const assert = require('assert');

// Test 1: Names and Realm Traditions Unit Assertions
console.log('========================================');
console.log('[TEST 1: Lorekeepers, Traditions & Names]');
console.log('========================================');

const ChronicleGrounder = require('../server/public/js/chronicle/chronicle-grounder.js');

// Verify Traditions
assert.strictEqual(ChronicleGrounder.getTraditionForRealm('silq'), 'beleriand', 'Sil-Q tradition must be beleriand');
assert.strictEqual(ChronicleGrounder.getTraditionForRealm('hengband'), 'easternmythos', 'Hengband tradition must be easternmythos');
assert.strictEqual(ChronicleGrounder.getTraditionForRealm('frogcomposband'), 'mythicbard', 'FrogComposBand tradition must be mythicbard');
assert.strictEqual(ChronicleGrounder.getTraditionForRealm('angband', 'Human'), 'westmarch', 'Angband human tradition must be westmarch');
assert.strictEqual(ChronicleGrounder.getTraditionForRealm('angband', 'Elf'), 'noldor', 'Angband elf tradition must be noldor');
assert.strictEqual(ChronicleGrounder.getTraditionForRealm('angband', 'Dwarf'), 'khazad', 'Angband dwarf tradition must be khazad');

// Verify Lorekeepers
assert.strictEqual(ChronicleGrounder.getLorekeeperName('silq'), 'Pengolodh of Gondolin');
assert.strictEqual(ChronicleGrounder.getLorekeeperName('hengband'), 'Dworkin Barimen');
assert.strictEqual(ChronicleGrounder.getLorekeeperName('frogcomposband'), 'Grand Archivist');
assert.strictEqual(ChronicleGrounder.getLorekeeperName('angband'), 'Elder Lorekeeper');

console.log('? Realm traditions and Lorekeeper mentors verified successfully!');

function handleBirthAdvance(ws, frame, state = {}) {
    const termRows = frame.term?.rows || [];
    const text = termRows.map(r => r.g || '').join('\n').toLowerCase();

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
        if (!state.silqStatDone) {
            state.silqStatDone = true;
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
}

// Test 2: FrogComposBand Quick Birth Review Pause
async function testFrogBirthReview() {
    return new Promise((resolve, reject) => {
        console.log('\n========================================');
        console.log('[TEST 2: FrogComposBand Birth Review Pause]');
        console.log('========================================');

        const user = `FCB_Review_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=frogcomposband&new=1`);
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error('Timeout waiting for FCB birth screen'));
            }
        }, 30000);

        let randomized = false;

        ws.on('message', (data) => {
            let frame;
            try {
                frame = JSON.parse(data.toString());
            } catch (_) { return; }

            if (frame.t !== 'frame' || !frame.term || !frame.term.rows) return;
            const text = frame.term.rows.map(r => r.g || '').join('\n').toLowerCase();

            if (frame.more || frame.ui?.more || text.includes('-more-') || text.includes('press space') || text.includes('press any key') || text.includes('press any other key to play') || text.includes('press ? for credits')) {
                ws.send('key space');
                return;
            }
            if (text.includes('ret) next screen') || text.includes('next screen')) {
                ws.send('key enter');
                return;
            }

            // Screen 1: Options
            if (text.includes('choose the type of game to play')) {
                ws.send('key b');
                return;
            }
            if (text.includes('finish the character with random') || text.includes("'@' to finish")) {
                if (!randomized) {
                    randomized = true;
                    console.log('  -> Triggering random character generation (@)...');
                    ws.send('key @');
                    return;
                }
            }

            // Screen 2: Review Screen
            if (text.includes('enter your starting stats') && text.includes('begin play')) {
                console.log('  ? Character generation correctly PAUSED on Screen 2 (Enter Your Starting Stats)!');
                console.log('  ? Bottom prompt visible: RET) Begin Play, ESC) Prev Screen');
                resolved = true;
                clearTimeout(timeout);
                ws.send('key enter'); // Proceed to play
                ws.close();
                resolve();
            }
        });

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}

// Test 3: Hengband Doors and Town Feats Audit
async function testHengbandTownFeats() {
    return new Promise((resolve, reject) => {
        console.log('\n========================================');
        console.log('[TEST 3: Hengband Town Doors & Buildings]');
        console.log('========================================');

        const user = `Heng_Feats_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=hengband&new=1`);
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error('Timeout waiting for Hengband town play frame'));
            }
        }, 35000);

        const birthState = {};
        ws.on('message', (data) => {
            let frame;
            try {
                frame = JSON.parse(data.toString());
            } catch (_) { return; }

            if (frame.t !== 'frame') return;

            if (frame.phase === 'setup' || !frame.map) {
                handleBirthAdvance(ws, frame, birthState);
                return;
            }

            if (frame.phase === 'play' && frame.map && frame.map.rows) {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);

                const featCounts = new Map();
                for (const row of frame.map.rows) {
                    if (!row.f) continue;
                    for (let c = 0; c < row.f.length; c += 2) {
                        const featId = parseInt(row.f.substring(c, c + 2), 16);
                        featCounts.set(featId, (featCounts.get(featId) || 0) + 1);
                    }
                }

                console.log(`  Map Dimensions: ${frame.map.w}x${frame.map.h}`);
                const doorFeats = (featCounts.get(2) || 0) + (featCounts.get(3) || 0) + (featCounts.get(4) || 0);
                console.log(`  Door tiles (feats 2, 3, 4): ${doorFeats}`);
                assert.ok(doorFeats > 0, 'Hengband town must have visible doors (not solid permanent stone walls)');

                console.log(`  Permanent stone wall tiles (feat 22): ${featCounts.get(22) || 0}`);
                console.log('  ? Hengband town doors and buildings verified successfully!');

                ws.send('key q');
                ws.send('key y');
                ws.close();
                resolve();
            }
        });

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}

// Test 4: Sil-Q Sunlight Patches (50ft Depth)
async function testSilqSunlight() {
    return new Promise((resolve, reject) => {
        console.log('\n========================================');
        console.log('[TEST 4: Sil-Q Sunlight Patches]');
        console.log('========================================');

        const user = `Silq_Sun_${Date.now()}`;
        const ws = new WebSocket(`ws://localhost:8080/ws?user=${user}&realm=silq&new=1`);
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error('Timeout waiting for Sil-Q play frame'));
            }
        }, 35000);

        const birthState = {};
        ws.on('message', (data) => {
            let frame;
            try {
                frame = JSON.parse(data.toString());
            } catch (_) { return; }

            if (frame.t !== 'frame') return;

            if (frame.phase === 'setup' || !frame.map) {
                handleBirthAdvance(ws, frame, birthState);
                return;
            }

            if (frame.phase === 'play' && frame.map && frame.map.rows) {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);

                let sunlightCount = 0;
                for (const row of frame.map.rows) {
                    if (!row.f) continue;
                    for (let c = 0; c < row.f.length; c += 2) {
                        const featId = parseInt(row.f.substring(c, c + 2), 16);
                        if (featId === 25) sunlightCount++;
                    }
                }

                console.log(`  Sil-Q Map Dimensions: ${frame.map.w}x${frame.map.h}`);
                console.log(`  Sunlight beam tiles (Feat 25 / 0x19): ${sunlightCount}`);
                assert.ok(sunlightCount > 0, 'Sil-Q 50ft level must contain sunlight tiles (feat 25)');
                console.log('  ? Sil-Q sunlight features verified successfully!');

                ws.send('key q');
                ws.send('key y');
                ws.close();
                resolve();
            }
        });

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}

async function run() {
    try {
        await testFrogBirthReview();
        await testHengbandTownFeats();
        await testSilqSunlight();
        console.log('\n========================================');
        console.log('>>> ALL MULTI-REALM TESTS PASSED PERFECTLY! <<<');
        console.log('========================================');
        process.exit(0);
    } catch (e) {
        console.error('Test failed:', e);
        process.exit(1);
    }
}

run();

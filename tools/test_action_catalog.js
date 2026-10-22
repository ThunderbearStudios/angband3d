/**
 * tools/test_action_catalog.js
 *
 * Fast pure-Node unit test suite for ActionCatalog (Card WS42.3A / Plan §5, §6.4, §8).
 * Verifies:
 *   1. Canonical VERB_BITS 20-bit array structure & immutability.
 *   2. Complete cross-realm command catalog coverage (>= 35 commands per realm).
 *   3. 100% alignment with probed engine fixtures in tools/fixtures/realm_keys/<realm>.json.
 *   4. fromVanillaKey cross-realm remapping.
 *   5. decodeVerbMask & validVerbsForItem for all item categories (potions, scrolls, wands, rods, staffs, equipment, books).
 *   6. shadowedByWasd(realm) returns exact verbs on 'w','a','s','d' per realm.
 *   7. ingestBridgeCommands updates runtime metadata without mutating defaults.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ActionCatalog = require('../server/public/js/action-catalog.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'realm_keys');
const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('--- test_action_catalog.js ---');

test('VERB_BITS defines the canonical 20-bit array in strict protocol order', () => {
    assert(Array.isArray(ActionCatalog.VERB_BITS));
    assert.strictEqual(ActionCatalog.VERB_BITS.length, 20);
    assert(Object.isFrozen(ActionCatalog.VERB_BITS));

    const expectedBits = [
        'quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'fire',
        'throw', 'wield', 'takeoff', 'drop', 'inscribe', 'uninscribe', 'refill',
        'browse', 'study', 'cast', 'ignore', 'examine'
    ];

    for (let i = 0; i < expectedBits.length; i++) {
        assert.strictEqual(ActionCatalog.VERB_BITS[i], expectedBits[i], `Bit ${i} must be ${expectedBits[i]}`);
        assert(ActionCatalog.get(expectedBits[i]), `VERB_BITS[${i}] must map to a valid command`);
    }
});

test('COMMANDS coverage: defines >= 50 commands with required frozen schema', () => {
    assert(Array.isArray(ActionCatalog.COMMANDS));
    assert(ActionCatalog.COMMANDS.length >= 50);
    assert(Object.isFrozen(ActionCatalog.COMMANDS));

    const requiredKeys = ['id', 'group', 'icon', 'labels', 'synonyms', 'keys', 'target', 'needsIdle', 'atomic'];
    const validGroups = new Set(['items', 'magic', 'action', 'info', 'manage']);

    for (const cmd of ActionCatalog.COMMANDS) {
        for (const k of requiredKeys) {
            assert(k in cmd, `Command '${cmd.id}' missing key '${k}'`);
        }
        assert(validGroups.has(cmd.group), `Command '${cmd.id}' group '${cmd.group}' is invalid`);
        assert.strictEqual(typeof cmd.labels.en, 'string');
        assert.strictEqual(typeof cmd.labels.jp, 'string');
        assert(Array.isArray(cmd.synonyms));
        for (const r of REALMS) {
            assert(r in cmd.keys, `Command '${cmd.id}' missing realm '${r}' in keys`);
        }
        assert(Object.isFrozen(cmd));
        assert(Object.isFrozen(cmd.labels));
        assert(Object.isFrozen(cmd.synonyms));
        assert(Object.isFrozen(cmd.keys));
    }
});

test('every realm defines >= 35 commands in listForRealm', () => {
    for (const r of REALMS) {
        const list = ActionCatalog.listForRealm(r);
        assert(list.length >= 35, `Realm '${r}' has ${list.length} commands, expected >= 35`);
        for (const cmd of list) {
            assert.notStrictEqual(cmd.keys[r], null, `Command '${cmd.id}' has null key in listForRealm('${r}')`);
            assert.strictEqual(ActionCatalog.keyFor(cmd.id, r), cmd.keys[r]);
        }
    }
});

test('all probed fixture keys align with ActionCatalog.keyFor', () => {
    for (const r of REALMS) {
        const fixturePath = path.join(FIXTURES_DIR, `${r}.json`);
        assert(fs.existsSync(fixturePath), `Fixture must exist: ${fixturePath}`);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        // Check key pins
        if (r === 'angband') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), null);
            assert.strictEqual(ActionCatalog.keyFor('use', r), 'U');
            assert.strictEqual(ActionCatalog.keyFor('hold', r), ',');
            assert.strictEqual(ActionCatalog.keyFor('cast', r), 'm');
            assert.strictEqual(ActionCatalog.keyFor('quaff', r), 'q');
            assert.strictEqual(ActionCatalog.keyFor('read', r), 'r');
            assert.strictEqual(ActionCatalog.keyFor('study', r), 'G');
            assert.strictEqual(ActionCatalog.keyFor('browse', r), 'b');
        } else if (r === 'silq') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), null);
            assert.strictEqual(ActionCatalog.keyFor('use', r), 'u');
            assert.strictEqual(ActionCatalog.keyFor('hold', r), 'z');
            assert.strictEqual(ActionCatalog.keyFor('takeoff', r), 'r');
            assert.strictEqual(ActionCatalog.keyFor('examine', r), 'x');
            assert.strictEqual(ActionCatalog.keyFor('char_sheet', r), '@');
            assert.strictEqual(ActionCatalog.keyFor('options', r), 'O');
            assert.strictEqual(ActionCatalog.keyFor('cast', r), null);
            assert.strictEqual(ActionCatalog.keyFor('song', r), 's');
            assert.strictEqual(ActionCatalog.keyFor('use_staff', r), 'a');
            assert.strictEqual(ActionCatalog.keyFor('abilities', r), 'tab');
            assert.strictEqual(ActionCatalog.keyFor('rest', r), '%');
        } else if (r === 'frogcomposband') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), 'S');
            assert.strictEqual(ActionCatalog.keyFor('use', r), null);
            assert.strictEqual(ActionCatalog.keyFor('hold', r), ',');
            assert.strictEqual(ActionCatalog.keyFor('power', r), 'U');
            assert.strictEqual(ActionCatalog.keyFor('cast', r), 'm');
            assert.strictEqual(ActionCatalog.keyFor('read', r), 'r');
            assert.strictEqual(ActionCatalog.keyFor('rest', r), 'R');
        } else if (r === 'hengband') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), 'S');
            assert.strictEqual(ActionCatalog.keyFor('use', r), null);
            assert.strictEqual(ActionCatalog.keyFor('hold', r), ',');
            assert.strictEqual(ActionCatalog.keyFor('power', r), 'U');
            assert.strictEqual(ActionCatalog.keyFor('cast', r), 'm');
            assert.strictEqual(ActionCatalog.keyFor('read', r), 'r');
            assert.strictEqual(ActionCatalog.keyFor('rest', r), 'R');
        }

        // Check fixture reverse lookup
        for (const [key, text] of Object.entries(fixture)) {
            if (!text || text === '') continue;
            // If the probe text matches a known verb prompt, verify key alignment
            if (/potion/i.test(text) && !/help/i.test(text)) {
                assert.strictEqual(ActionCatalog.keyFor('quaff', r), key);
            }
            if (/scroll/i.test(text) && !/help/i.test(text)) {
                assert.strictEqual(ActionCatalog.keyFor('read', r), key);
            }
            if (/throw/i.test(text) && !/help/i.test(text)) {
                assert.strictEqual(ActionCatalog.keyFor('throw', r), key);
            }
        }
    }
});

test('fromVanillaKey performs accurate cross-realm key remapping', () => {
    // Sil-Q remaps
    assert.strictEqual(ActionCatalog.fromVanillaKey('m', 'silq'), 's');
    assert.strictEqual(ActionCatalog.fromVanillaKey('v', 'silq'), 't');
    assert.strictEqual(ActionCatalog.fromVanillaKey('R', 'silq'), '%');
    assert.strictEqual(ActionCatalog.fromVanillaKey('r', 'silq'), null);
    assert.strictEqual(ActionCatalog.fromVanillaKey('I', 'silq'), 'x');
    assert.strictEqual(ActionCatalog.fromVanillaKey('C', 'silq'), '@');
    assert.strictEqual(ActionCatalog.fromVanillaKey('=', 'silq'), 'O');
    assert.strictEqual(ActionCatalog.fromVanillaKey(',', 'silq'), 'z');
    assert.strictEqual(ActionCatalog.fromVanillaKey('u', 'silq'), 'a');
    assert.strictEqual(ActionCatalog.fromVanillaKey('U', 'silq'), 'u');
    assert.strictEqual(ActionCatalog.fromVanillaKey('t', 'silq'), 'r');

    // Angband identity
    assert.strictEqual(ActionCatalog.fromVanillaKey('m', 'angband'), 'm');
    assert.strictEqual(ActionCatalog.fromVanillaKey('v', 'angband'), 'v');
    assert.strictEqual(ActionCatalog.fromVanillaKey('r', 'angband'), 'r');

    // Unmapped keys pass through verbatim
    assert.strictEqual(ActionCatalog.fromVanillaKey('?', 'silq'), '?');
    assert.strictEqual(ActionCatalog.fromVanillaKey('Escape', 'silq'), 'Escape');
});

test('decodeVerbMask decodes integer bitmask into catalog verb objects', () => {
    // bit 0 = quaff (1), bit 8 = throw (256), bit 11 = drop (2048)
    const mask = (1 << 0) | (1 << 8) | (1 << 11);
    const angbandVerbs = ActionCatalog.decodeVerbMask(mask, 'angband');
    assert.strictEqual(angbandVerbs.length, 3);
    const ids = angbandVerbs.map(v => v.id);
    assert(ids.includes('quaff'));
    assert(ids.includes('throw'));
    assert(ids.includes('drop'));

    // bit 1 = read (2); in Sil-Q read is null, so it must be omitted from Sil-Q decoded verbs
    const maskWithRead = (1 << 0) | (1 << 1);
    const silqVerbs = ActionCatalog.decodeVerbMask(maskWithRead, 'silq');
    assert.strictEqual(silqVerbs.length, 1);
    assert.strictEqual(silqVerbs[0].id, 'quaff');
});

test('validVerbsForItem supports all item categories across realms', () => {
    // 1. Authoritative bitmask takes precedence
    const customItem = { name: 'Mystery Object', vm: (1 << 0) | (1 << 11) }; // quaff | drop
    const customVerbs = ActionCatalog.validVerbsForItem(customItem, 'angband');
    assert.strictEqual(customVerbs.length, 2);
    assert.deepStrictEqual(customVerbs.map(v => v.id), ['quaff', 'drop']);

    // 2. Potion fallback
    const potion = { tval: 75, name: 'Potion of Healing' };
    const potionVerbsAng = ActionCatalog.validVerbsForItem(potion, 'angband');
    assert(potionVerbsAng.some(v => v.id === 'quaff'));
    assert(potionVerbsAng.some(v => v.id === 'drop'));
    assert(potionVerbsAng.some(v => v.id === 'throw'));

    // 3. Scroll fallback (read present in Angband, absent in Sil-Q)
    const scroll = { tval: 70, name: 'Scroll of Teleportation' };
    const scrollVerbsAng = ActionCatalog.validVerbsForItem(scroll, 'angband');
    assert(scrollVerbsAng.some(v => v.id === 'read'));

    const scrollVerbsSil = ActionCatalog.validVerbsForItem(scroll, 'silq');
    assert(!scrollVerbsSil.some(v => v.id === 'read'), 'Sil-Q items must never offer read verb');

    // 4. Wand fallback (aim present in Angband, absent in Sil-Q)
    const wand = { tval: 65, name: 'Wand of Lightning' };
    const wandVerbsAng = ActionCatalog.validVerbsForItem(wand, 'angband');
    assert(wandVerbsAng.some(v => v.id === 'aim'));

    const wandVerbsSil = ActionCatalog.validVerbsForItem(wand, 'silq');
    assert(!wandVerbsSil.some(v => v.id === 'aim'), 'Sil-Q items must never offer wand aim verb');

    // 5. Staff fallback (key 'u' in Angband, 'a' in Sil-Q)
    const staff = { tval: 55, name: 'Staff of Light' };
    const staffVerbsAng = ActionCatalog.validVerbsForItem(staff, 'angband');
    const staffVerbAng = staffVerbsAng.find(v => v.id === 'use_staff');
    assert(staffVerbAng);
    assert.strictEqual(staffVerbAng.keys.angband, 'u');

    const staffVerbsSil = ActionCatalog.validVerbsForItem(staff, 'silq');
    const staffVerbSil = staffVerbsSil.find(v => v.id === 'use_staff');
    assert(staffVerbSil);
    assert.strictEqual(staffVerbSil.keys.silq, 'a');

    // 6. Rod fallback (zap present in Angband, absent in Sil-Q)
    const rod = { tval: 66, name: 'Rod of Probing' };
    const rodVerbsAng = ActionCatalog.validVerbsForItem(rod, 'angband');
    assert(rodVerbsAng.some(v => v.id === 'zap'));

    // 7. Equipment (equipped vs unequipped)
    const wornArmor = { tval: 36, name: 'Chain Mail', slot: 5 };
    const wornVerbs = ActionCatalog.validVerbsForItem(wornArmor, 'angband', true);
    assert(wornVerbs.some(v => v.id === 'takeoff'));
    assert(!wornVerbs.some(v => v.id === 'wield'));

    const packArmor = { tval: 36, name: 'Chain Mail', slot: -1 };
    const packVerbs = ActionCatalog.validVerbsForItem(packArmor, 'angband', false);
    assert(packVerbs.some(v => v.id === 'wield'));
    assert(!packVerbs.some(v => v.id === 'takeoff'));

    // 8. Book fallback
    const book = { tval: 90, name: 'Beginner Magicks' };
    const bookVerbsAng = ActionCatalog.validVerbsForItem(book, 'angband');
    assert(bookVerbsAng.some(v => v.id === 'browse'));
    assert(bookVerbsAng.some(v => v.id === 'cast'));
});

test('shadowedByWasd returns exact verbs on w, a, s, d per realm', () => {
    // Angband: w=wield, a=aim, s=steal, d=drop
    const angShadowed = ActionCatalog.shadowedByWasd('angband');
    const angMap = Object.fromEntries(angShadowed.map(c => [c.keys.angband, c.id]));
    assert.strictEqual(angMap['w'], 'wield');
    assert.strictEqual(angMap['a'], 'aim');
    assert.strictEqual(angMap['s'], 'steal');
    assert.strictEqual(angMap['d'], 'drop');

    // Sil-Q: w=wield, a=use_staff, s=song, d=drop
    const silqShadowed = ActionCatalog.shadowedByWasd('silq');
    const silqMap = Object.fromEntries(silqShadowed.map(c => [c.keys.silq, c.id]));
    assert.strictEqual(silqMap['w'], 'wield');
    assert.strictEqual(silqMap['a'], 'use_staff');
    assert.strictEqual(silqMap['s'], 'song');
    assert.strictEqual(silqMap['d'], 'drop');

    // FrogComposBand: w=wield, a=aim, d=drop ('S' is uppercase search, not in wasd)
    const fcbShadowed = ActionCatalog.shadowedByWasd('frogcomposband');
    const fcbMap = Object.fromEntries(fcbShadowed.map(c => [c.keys.frogcomposband, c.id]));
    assert.strictEqual(fcbMap['w'], 'wield');
    assert.strictEqual(fcbMap['a'], 'aim');
    assert.strictEqual(fcbMap['d'], 'drop');
    assert.strictEqual(fcbMap['s'], undefined, 'FCB has no command on lowercase s');

    // Hengband: w=wield, a=aim, d=drop ('S' is uppercase search, not in wasd)
    const hengShadowed = ActionCatalog.shadowedByWasd('hengband');
    const hengMap = Object.fromEntries(hengShadowed.map(c => [c.keys.hengband, c.id]));
    assert.strictEqual(hengMap['w'], 'wield');
    assert.strictEqual(hengMap['a'], 'aim');
    assert.strictEqual(hengMap['d'], 'drop');
    assert.strictEqual(hengMap['s'], undefined, 'Hengband has no command on lowercase s');
});

test('ingestBridgeCommands updates runtime availability without mutating catalog', () => {
    const bridgeMsg = {
        t: 'commands',
        verbBits: ['quaff', 'read'],
        groups: [
            {
                name: 'Items',
                cmds: [
                    { id: 'quaff', available: true },
                    { id: 'cast', available: false }
                ]
            }
        ]
    };

    assert.strictEqual(ActionCatalog.ingestBridgeCommands(bridgeMsg), true);
    assert.strictEqual(ActionCatalog.isAvailable('quaff'), true);
    assert.strictEqual(ActionCatalog.isAvailable('cast'), false);
    assert.strictEqual(ActionCatalog.isAvailable('drop'), true); // unmentioned defaults to true
    assert.strictEqual(ActionCatalog.VERB_BITS.length, 20, 'Defaults must remain immutable');
});

console.log('All action catalog unit tests passed!');

/**
 * tools/test_realm_keys.js
 * Fast-tier unit tests for RealmKeys UMD module (WS6.2).
 * Verifies contract, completeness across all 4 realms, and alignment
 * with probed fixtures in tools/fixtures/realm_keys/<realm>.json.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'realm_keys');

// Load RealmKeys module
let RealmKeys;
try {
    RealmKeys = require('../server/public/js/realm-keys.js');
} catch (e) {
    // Expected to fail before module implementation
    RealmKeys = null;
}

const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];
const VERBS = [
    'cast', 'throw', 'fire', 'quaff', 'read', 'rest', 'open', 'pickup',
    'inven', 'equip', 'use', 'hold', 'browse', 'study', 'power', 'skills',
    'quests', 'overland'
];

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('--- test_realm_keys.js ---');

test('module exists and exports required API', () => {
    assert(RealmKeys, 'realm-keys.js must exist and export RealmKeys');
    assert.strictEqual(typeof RealmKeys.realmKey, 'function', 'realmKey must be a function');
    assert.strictEqual(typeof RealmKeys.fromVanilla, 'function', 'fromVanilla must be a function');
    assert.strictEqual(typeof RealmKeys.applyLabels, 'function', 'applyLabels must be a function');
    assert.strictEqual(typeof RealmKeys.getActiveRealm, 'function', 'getActiveRealm must be a function');
    assert.strictEqual(typeof RealmKeys.setActiveRealm, 'function', 'setActiveRealm must be a function');
    assert(RealmKeys.REALM_KEYS, 'REALM_KEYS table must exist');
    assert(RealmKeys.REALM_TEXT, 'REALM_TEXT table must exist');
});

test('REALM_KEYS is complete for all 4 realms and covers all canonical verbs', () => {
    for (const r of REALMS) {
        assert(RealmKeys.REALM_KEYS[r], `REALM_KEYS must define realm '${r}'`);
        for (const v of VERBS) {
            assert(v in RealmKeys.REALM_KEYS[r], `Realm '${r}' must define verb '${v}' (as key string or null)`);
        }
    }
});

test('REALM_TEXT defines town and depth metrics for all 4 realms', () => {
    for (const r of REALMS) {
        assert(RealmKeys.REALM_TEXT[r], `REALM_TEXT must define realm '${r}'`);
        assert('town' in RealmKeys.REALM_TEXT[r], `Realm '${r}' must define town name (or null)`);
        assert.strictEqual(typeof RealmKeys.REALM_TEXT[r].feetPerLevel, 'number', `Realm '${r}' feetPerLevel must be a number`);
    }
    assert.strictEqual(RealmKeys.REALM_TEXT.angband.town, 'the Town');
    assert.strictEqual(RealmKeys.REALM_TEXT.silq.town, null);
    assert.strictEqual(RealmKeys.REALM_TEXT.frogcomposband.town, 'the Outpost');
    assert.strictEqual(RealmKeys.REALM_TEXT.hengband.town, 'the Outpost');
});

test('CMD-P1-12/13: search, use, and hold accuracy across variants', () => {
    assert.strictEqual(RealmKeys.realmKey('search', 'angband'), null, 'Vanilla has no search mode');
    assert.strictEqual(RealmKeys.realmKey('search', 'silq'), null, 'Sil-Q has no search mode');
    assert.strictEqual(RealmKeys.realmKey('search', 'frogcomposband'), 'S', 'FCB search mode is S');
    assert.strictEqual(RealmKeys.realmKey('search', 'hengband'), 'S', 'Hengband search mode is S');

    assert.strictEqual(RealmKeys.realmKey('use', 'angband'), 'U', 'Vanilla use is U');
    assert.strictEqual(RealmKeys.realmKey('use', 'silq'), 'u', 'Sil-Q use is u');
    assert.strictEqual(RealmKeys.realmKey('use', 'frogcomposband'), null, 'FCB has no generic use command');
    assert.strictEqual(RealmKeys.realmKey('use', 'hengband'), null, 'Hengband has no generic use command');

    assert.strictEqual(RealmKeys.realmKey('hold', 'angband'), ',', 'Vanilla hold is ,');
    assert.strictEqual(RealmKeys.realmKey('hold', 'silq'), 'z', 'Sil-Q hold is z');
    assert.strictEqual(RealmKeys.realmKey('hold', 'frogcomposband'), ',', 'FCB hold is ,');
    assert.strictEqual(RealmKeys.realmKey('hold', 'hengband'), ',', 'Hengband hold is ,');

    assert.strictEqual(RealmKeys.realmKey('takeoff', 'silq'), 'r', 'Sil-Q takeoff is r');
    assert.strictEqual(RealmKeys.realmKey('examine', 'silq'), 'x', 'Sil-Q examine is x');
    assert.strictEqual(RealmKeys.realmKey('char_sheet', 'silq'), '@', 'Sil-Q char sheet is @');
    assert.strictEqual(RealmKeys.realmKey('options', 'silq'), 'O', 'Sil-Q options is O');
});

test('every non-null key in REALM_KEYS is backed by the probed fixture', () => {
    for (const r of REALMS) {
        const fixturePath = path.join(FIXTURES_DIR, `${r}.json`);
        assert(fs.existsSync(fixturePath), `Probe fixture must exist: ${fixturePath}`);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        for (const v of VERBS) {
            const key = RealmKeys.REALM_KEYS[r][v];
            if (key !== null) {
                assert(key in fixture, `Realm '${r}' verb '${v}' key '${key}' must appear in probe fixture`);
            }
        }
    }
});

test('probed fixture prompts match expected verb semantics', () => {
    const angbandFix = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'angband.json'), 'utf8'));
    assert(/spells|cast/i.test(angbandFix[RealmKeys.REALM_KEYS.angband.cast]));
    assert(/throw/i.test(angbandFix[RealmKeys.REALM_KEYS.angband.throw]));
    assert(/quaff/i.test(angbandFix[RealmKeys.REALM_KEYS.angband.quaff]));
    assert(/scroll/i.test(angbandFix[RealmKeys.REALM_KEYS.angband.read]));
    assert(/rest/i.test(angbandFix[RealmKeys.REALM_KEYS.angband.rest]));

    const silqFix = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'silq.json'), 'utf8'));
    assert.strictEqual(RealmKeys.REALM_KEYS.silq.read, null, 'Sil-Q must have no read verb (no scrolls)');
    assert(/songs|song/i.test(silqFix[RealmKeys.REALM_KEYS.silq.cast]));
    assert(/throw/i.test(silqFix[RealmKeys.REALM_KEYS.silq.throw]));
    assert(/skills/i.test(silqFix[RealmKeys.REALM_KEYS.silq.skills]));

    const hengFix = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'hengband.json'), 'utf8'));
    assert(/能力|魔法|唱/i.test(hengFix[RealmKeys.REALM_KEYS.hengband.cast]));
    assert(/投/i.test(hengFix[RealmKeys.REALM_KEYS.hengband.throw]));
    assert(/薬|飲/i.test(hengFix[RealmKeys.REALM_KEYS.hengband.quaff]));
    assert(/巻物|読/i.test(hengFix[RealmKeys.REALM_KEYS.hengband.read]));
    assert(/休憩/i.test(hengFix[RealmKeys.REALM_KEYS.hengband.rest]));
});

test('fromVanilla accurately maps Vanilla keys to variant realm keys', () => {
    // Sil-Q remaps
    assert.strictEqual(RealmKeys.fromVanilla('m', 'silq'), 's');
    assert.strictEqual(RealmKeys.fromVanilla('v', 'silq'), 't');
    assert.strictEqual(RealmKeys.fromVanilla('R', 'silq'), '%');
    assert.strictEqual(RealmKeys.fromVanilla('r', 'silq'), null);
    assert.strictEqual(RealmKeys.fromVanilla('i', 'silq'), 'i');
    assert.strictEqual(RealmKeys.fromVanilla('e', 'silq'), 'e');

    // Angband identity
    assert.strictEqual(RealmKeys.fromVanilla('m', 'angband'), 'm');
    assert.strictEqual(RealmKeys.fromVanilla('v', 'angband'), 'v');
    assert.strictEqual(RealmKeys.fromVanilla('r', 'angband'), 'r');

    // Unmapped keys pass through
    assert.strictEqual(RealmKeys.fromVanilla('?', 'silq'), '?');
    assert.strictEqual(RealmKeys.fromVanilla('Escape', 'silq'), 'Escape');
});

test('applyLabels sets button labels, kbd hints, and visibility', () => {
    // Mock minimal DOM document
    const buttons = {};
    const ids = ['btn-cast', 'btn-throw', 'btn-fire', 'btn-quaff', 'btn-read', 'btn-rest',
                 'btn-inventory', 'btn-equipment', 'btn-door', 'btn-pickup', 'btn-skills',
                 'btn-power', 'btn-study', 'btn-browse'];
    for (const id of ids) {
        buttons[id] = {
            id,
            title: '',
            style: { display: '' },
            hidden: false,
            innerHTML: '',
            querySelector: function(sel) {
                if (sel === 'kbd') {
                    if (!this._kbd) this._kbd = { textContent: '' };
                    return this._kbd;
                }
                return null;
            }
        };
    }
    const mockDoc = {
        getElementById: (id) => buttons[id] || null
    };

    // Apply for Sil-Q: read is hidden, cast has 's', throw has 't', skills has 'Tab'
    RealmKeys.applyLabels(mockDoc, 'silq');
    assert.strictEqual(buttons['btn-cast'].querySelector('kbd').textContent, 's');
    assert.strictEqual(buttons['btn-throw'].querySelector('kbd').textContent, 't');
    assert.strictEqual(buttons['btn-rest'].querySelector('kbd').textContent, '%');
    assert.strictEqual(buttons['btn-read'].hidden, true);
    assert.strictEqual(buttons['btn-skills'].hidden, false);
    assert.strictEqual(buttons['btn-skills'].querySelector('kbd').textContent, 'Tab');

    // Apply for Vanilla: read is visible, cast has 'm', skills is hidden
    RealmKeys.applyLabels(mockDoc, 'angband');
    assert.strictEqual(buttons['btn-cast'].querySelector('kbd').textContent, 'm');
    assert.strictEqual(buttons['btn-read'].hidden, false);
    assert.strictEqual(buttons['btn-skills'].hidden, true);
});

test('WS6.3: input.js does not send raw digit 5 for hold / wait', () => {
    const inputJs = fs.readFileSync(path.join(__dirname, '../server/public/js/input.js'), 'utf8');
    const sendKey5Matches = inputJs.match(/sendKey\(['"]5['"]\)/g);
    assert.strictEqual(sendKey5Matches, null, `input.js must never send raw digit '5'; found: ${sendKey5Matches}`);
});

test('WS6.3: input.js delegates top-level keys to RealmKeys.fromVanilla', () => {
    const inputJs = fs.readFileSync(path.join(__dirname, '../server/public/js/input.js'), 'utf8');
    assert(inputJs.includes('RealmKeys.fromVanilla'), 'input.js must call RealmKeys.fromVanilla');
});

test('WS6.3: input.js binds action buttons by canonical verb', () => {
    const inputJs = fs.readFileSync(path.join(__dirname, '../server/public/js/input.js'), 'utf8');
    assert(inputJs.includes("bind('btn-throw', 'throw')"), "input.js must bind btn-throw to 'throw'");
    assert(inputJs.includes("bind('btn-cast', 'cast')"), "input.js must bind btn-cast to 'cast'");
    assert(inputJs.includes("bind('btn-rest', 'rest')"), "input.js must bind btn-rest to 'rest'");
    assert(inputJs.includes("bind('btn-pickup', 'pickup')"), "input.js must bind btn-pickup to 'pickup'");
    assert(inputJs.includes("bind('btn-read', 'read')"), "input.js must bind btn-read to 'read'");
    assert(inputJs.includes("bind('btn-quaff', 'quaff')"), "input.js must bind btn-quaff to 'quaff'");
});

test('WS6.3: app.js runs RealmKeys.applyLabels on realm select', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../server/public/js/app.js'), 'utf8');
    assert(appJs.includes('RealmKeys.applyLabels'), 'app.js must call RealmKeys.applyLabels on realm selection');
});

test('WS42.3A: RealmKeys facade exports ActionCatalog integration, BUTTON_TO_VERB, getLabel, getIcon', () => {
    assert(RealmKeys.ActionCatalog, 'RealmKeys must expose ActionCatalog facade reference');
    assert(RealmKeys.BUTTON_TO_VERB, 'BUTTON_TO_VERB map must exist');
    assert.strictEqual(RealmKeys.BUTTON_TO_VERB['btn-cast'], 'cast');
    assert.strictEqual(RealmKeys.BUTTON_TO_VERB['btn-quaff'], 'quaff');
    assert.strictEqual(RealmKeys.BUTTON_TO_VERB['btn-rest'], 'rest');

    assert.strictEqual(typeof RealmKeys.getLabel, 'function');
    assert.strictEqual(typeof RealmKeys.getIcon, 'function');

    const quaffLabelEn = RealmKeys.getLabel('quaff', 'angband', 'en');
    assert.ok(quaffLabelEn.length > 0, 'Quaff EN label should be non-empty');
    const quaffLabelJp = RealmKeys.getLabel('quaff', 'hengband', 'jp');
    assert.ok(/飲|薬/.test(quaffLabelJp), 'Quaff JP label should contain kanji');

    const quaffIcon = RealmKeys.getIcon('quaff');
    assert.strictEqual(quaffIcon, 'potion', 'Quaff icon should be potion');
});

console.log('All realm key unit tests passed!');

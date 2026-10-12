#!/usr/bin/env node
/**
 * test_screen_context.js — fast-tier unit/contract/fixture tests for
 * server/public/js/screen-context.js (WS2 Phase 2c).
 *
 * Three layers:
 *   1. CONTRACT  every exported classifier returns exactly its KEYS set, for null
 *                and real inputs (guards the R0 "missing property" failure class).
 *   2. RULES     synthetic frames pin the view-routing invariants of AGENTS.md §3.3
 *                and representative predicate strings per realm.
 *   3. FIXTURES  real engine frames captured by verify_cross_realm_menus.js
 *                (FIXTURE_DIR=tools/fixtures/menus). Each fixture's `expect` facts
 *                (asserted live by the e2e test) must hold, and the FULL classification
 *                must equal tools/fixtures/menus/snapshot.json. Any heuristic change
 *                shows up as an explicit snapshot diff; review it, then refresh with
 *                `node tools/test_screen_context.js --update`.
 *
 * Exit code 0 = pass, 1 = failure. No server or browser required.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SC = require('../server/public/js/screen-context.js');

const UPDATE = process.argv.includes('--update');
const FIX_DIR = path.join(__dirname, 'fixtures', 'menus');
const SNAP_FILE = path.join(FIX_DIR, 'snapshot.json');
let SJIS_TD = null;
try { SJIS_TD = new TextDecoder('shift_jis'); } catch (_) { /* small-ICU Node */ }
const decode = (s) => SC.decodeSjis(s, SJIS_TD);

let passed = 0;
const failures = [];
function test(name, fn) {
    try { fn(); passed++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Build a minimal wire frame whose terminal shows `lines`. */
function mkFrame(lines, over) {
    const rows = (Array.isArray(lines) ? lines : [lines]).map(g => ({ g }));
    return Object.assign({
        phase: 'play',
        player: { x: 1, y: 0, hp: 10, hp_max: 10 },
        map: { rows: [{ f: '0000' }] },
        ui: { awaiting_command: true, more: false, overlay: 0 },
        term: { rows }
    }, over || {});
}
const sortedKeys = (o) => Object.keys(o).sort();

/** Full classification of a frame: everything a caller can read. */
function classify(frame, realm) {
    const isHeng = realm === 'hengband';
    const text = SC.screenTextOf(frame, decode);
    return {
        needsTerminal: SC.needsTerminal(frame, { forceTerminal: false, decode }),
        ...SC.toolbarFlags(frame, text, isHeng),
        ...SC.birthFlags(text, isHeng),
        ...SC.promptFlags(text),
        ...SC.storeFlags(frame, text, isHeng),
        ...SC.itemFlags(text, realm)
    };
}

// ---------------------------------------------------------------------------
// 1. CONTRACT
// ---------------------------------------------------------------------------
test('exports', () => {
    for (const fn of ['rawScreenText', 'screenTextOf', 'playerFeatOf', 'needsTerminal', 'toolbarFlags',
        'birthFlags', 'promptFlags', 'storeFlags', 'itemFlags', 'inputEscapeReview', 'inputTerminalKeyFlags',
        'inputTargetingPrompt', 'terminalDetectMode', 'extractItems', 'classify', 'classifyScreen', 'decodeSjis']) {
        assert.strictEqual(typeof SC[fn], 'function', `missing export ${fn}`);
    }
});

const sample = mkFrame(['(Inventory) Command:', 'a) a Torch']);
const contractCalls = {
    toolbarFlags: [(f, t) => SC.toolbarFlags(f, t, false)],
    birthFlags: [(f, t) => SC.birthFlags(t, false)],
    promptFlags: [(f, t) => SC.promptFlags(t)],
    storeFlags: [(f, t) => SC.storeFlags(f, t, false)],
    itemFlags: [(f, t) => SC.itemFlags(t, 'silq')],
    inputTerminalKeyFlags: [(f, t) => SC.inputTerminalKeyFlags(t, false, false)],
    classify: [(f) => SC.classify(f, 'angband', { decode })]
};
for (const [name, [call]] of Object.entries(contractCalls)) {
    test(`contract ${name} (null input)`, () => {
        assert.deepStrictEqual(sortedKeys(call(null, '')), [...SC.KEYS[name]].sort());
    });
    test(`contract ${name} (real input)`, () => {
        const r = call(sample, SC.screenTextOf(sample, decode));
        assert.deepStrictEqual(sortedKeys(r), [...SC.KEYS[name]].sort());
        for (const [k, v] of Object.entries(r)) {
            if (k === 'playerFeat') assert.strictEqual(typeof v, 'number', k);
            else if (k === 'mode' || k === 'screenText') assert.strictEqual(typeof v, 'string', k);
            else if (k === 'listKind' || k === 'promptKind' || k === 'verbPrompt') {
                assert(v === null || typeof v === 'string', `${name}.${k} must be string or null, got ${typeof v}`);
            } else if (k === 'items') {
                assert(Array.isArray(v), `${name}.${k} must be array`);
            } else {
                assert.strictEqual(typeof v, 'boolean', `${name}.${k} must be boolean, got ${typeof v}`);
            }
        }
    });
}

// ---------------------------------------------------------------------------
// 2. RULES — view routing (AGENTS.md §3.3) and representative predicates
// ---------------------------------------------------------------------------
const NT = (f, o) => SC.needsTerminal(f, Object.assign({ decode }, o || {}));
test('needsTerminal: null / no player / non-play phase -> terminal', () => {
    assert.strictEqual(NT(null), true);
    assert.strictEqual(NT(mkFrame('', { player: null })), true);
    assert.strictEqual(NT(mkFrame('', { phase: 'birth' })), true);
});
test('needsTerminal: dead player -> 3D (death modal)', () => {
    assert.strictEqual(NT(mkFrame('', { player: { x: 0, y: 0, hp: 0, hp_max: 10 } })), false);
    assert.strictEqual(NT(mkFrame('', { player: { x: 0, y: 0, dead: true } }), { forceTerminal: true }), false);
});
test('needsTerminal: forceTerminal wins over idle world', () => {
    assert.strictEqual(NT(mkFrame(''), { forceTerminal: true }), true);
});
test('needsTerminal: idle world awaiting command -> 3D', () => {
    assert.strictEqual(NT(mkFrame('')), false);
});
test('needsTerminal: overlay -> terminal, even with -more-', () => {
    assert.strictEqual(NT(mkFrame('You have no more Flasks -more-', { ui: { overlay: 1, more: true } })), true);
});
test('needsTerminal: overlay low-hitpoint warning stays 3D', () => {
    assert.strictEqual(NT(mkFrame('*** LOW HITPOINT WARNING! ***', { ui: { overlay: 1 } })), false);
});
test('needsTerminal: ui.context menu/birth/setup -> terminal', () => {
    for (const context of ['menu', 'birth', 'setup']) assert.strictEqual(NT(mkFrame('', { ui: { context } })), true, context);
});
test('needsTerminal: dungeon -more- stays 3D', () => {
    assert.strictEqual(NT(mkFrame('The kobold hits you. -more-', { ui: { more: true, awaiting_command: false } })), false);
});
test('needsTerminal: not awaiting + direction prompt stays 3D (EN + JP)', () => {
    assert.strictEqual(NT(mkFrame('Aim which direction?', { ui: { awaiting_command: false } })), false);
    assert.strictEqual(NT(mkFrame('どの方向に?', { ui: { awaiting_command: false } })), false);
    // KNOWN GAP (STATE.md K6): vanilla prompts engine/src/ui-input.c:1527 "Direction or <click> (Escape to cancel)? "
    // and :1640/:1642 "Direction ('*' or <click> to target, ...)? " match none of the targeting markers, so they
    // route to the terminal. Pinned here so the WS2 Phase 3 fix is an explicit, reviewed change.
    assert.strictEqual(NT(mkFrame('Direction or <click> (Escape to cancel)? ', { ui: { awaiting_command: false } })), true);
});
test('needsTerminal: not awaiting, not targeting -> terminal (menus)', () => {
    assert.strictEqual(NT(mkFrame('Quaff which potion?', { ui: { awaiting_command: false } })), true);
});
test('needsTerminal: missing ui -> 3D', () => {
    assert.strictEqual(NT(mkFrame('', { ui: undefined })), false);
});

const T = (lines, realm, over) => {
    const f = mkFrame(lines, over);
    return SC.toolbarFlags(f, SC.screenTextOf(f, decode), realm === 'hengband');
};
test('toolbar: Sil-Q inventory command is an item prompt, not a store', () => {
    const r = T('(Inventory) Command:', 'silq');
    assert.strictEqual(r.isItemPrompt, true); assert.strictEqual(r.isStore, false);
});
test('toolbar: store text without item prompt is a store', () => {
    const r = T(['Store Inventory', 'Gold Remaining: 600'], 'angband', { ui: { overlay: 1 } });
    assert.strictEqual(r.isStore, true); assert.strictEqual(r.isItemPrompt, false);
});
test('toolbar: store feat under player + overlay -> store', () => {
    const r = T('', 'angband', { map: { rows: [{ f: '0007' }] }, ui: { overlay: 1 } });
    assert.strictEqual(r.playerFeat, 7); assert.strictEqual(r.isStoreFeat, true); assert.strictEqual(r.isStore, true);
});
test('toolbar: Hengband feat 4 is a store only for Hengband', () => {
    assert.strictEqual(T('', 'hengband', { map: { rows: [{ f: '0004' }] } }).isStoreFeat, true);
    assert.strictEqual(T('', 'angband', { map: { rows: [{ f: '0004' }] } }).isStoreFeat, false);
});
test('toolbar: targeting suppresses item prompt', () => {
    const r = T('Direction? (Escape to cancel) Inven:', 'angband');
    assert.strictEqual(r.isTargeting, true); assert.strictEqual(r.isItemPrompt, false);
});
test('toolbar: Hengband JP inventory header is an item prompt only in Hengband', () => {
    assert.strictEqual(T('持ち物： 5 種類', 'hengband').isItemPrompt, true);
    assert.strictEqual(T('持ち物： 5 種類', 'angband').isItemPrompt, false);
});
test('toolbar: not in play -> no item prompt / targeting', () => {
    const r = T('Inven:', 'angband', { phase: 'birth' });
    assert.strictEqual(r.inPlay, false); assert.strictEqual(r.isItemPrompt, false);
});

const B = (text, heng) => SC.birthFlags(text.toLowerCase(), Boolean(heng));
test('birth: choice menu / name prompt / review screen are exclusive', () => {
    assert.strictEqual(B('Please choose a race. Race affects stats').isChoiceMenu, true);
    assert.strictEqual(B('Please choose a race. Race affects stats').isReviewScreen, false);
    assert.strictEqual(B('Enter a name for your character').isNamePrompt, true);
    const rev = B("['ESC' to step back, 'S' to start over, or any other key to continue]");
    // Vanilla 4.2 review prompt: quoted 'esc' does NOT match the choice marker 'esc to step back'.
    assert.strictEqual(rev.isChoiceMenu, false); assert.strictEqual(rev.isReviewScreen, true);
    assert.strictEqual(B("['r'eroll, 'h'istory, or Enter to accept]").isReviewScreen, true);
});
test('birth: Hengband JP screens only flag for Hengband', () => {
    assert.strictEqual(B('性別を選んで下さい', true).isHengSex, true);
    assert.strictEqual(B('性別を選んで下さい', false).isHengSex, false);
    assert.strictEqual(B('初期オプション smart_learn', true).isHengInitialOpt, true);
});
test('birth: title screen', () => {
    assert.strictEqual(B('Press any key to continue').isTitleScreen, true);
});
test('prompt/store/item flags', () => {
    assert.strictEqual(SC.promptFlags('really destroy a torch? [y/n]').isYesNoPrompt, true);
    assert.strictEqual(SC.promptFlags('how many? ').isQuantityPrompt, true);
    assert.strictEqual(SC.storeFlags(null, 'sell which item? ', false).isStoreSell, true);
    assert.strictEqual(SC.storeFlags(mkFrame('', { ui: { more: true } }), '', false).hasMore, true);
    assert.strictEqual(SC.storeFlags(null, 'どれを売りますか', true).isStoreSell, true);
    assert.strictEqual(SC.storeFlags(null, 'どれを売りますか', false).isStoreSell, false);
    const it = SC.itemFlags('(equipment) command:', 'silq');
    assert.strictEqual(it.isSilqEquipCmd, true); assert.strictEqual(it.isEquipView, true);
    assert.strictEqual(SC.itemFlags('(equipment) command:', 'angband').isSilqEquipCmd, false);
});
test('decodeSjis: passthrough for Unicode, decodes SJIS bytes when available', () => {
    assert.strictEqual(SC.decodeSjis('持ち物', SJIS_TD), '持ち物');
    assert.strictEqual(SC.decodeSjis('', SJIS_TD), '');
    if (SJIS_TD) assert.strictEqual(SC.decodeSjis('\x82\xa0', SJIS_TD), 'あ');
});
test('inputEscapeReview: flags escape review correctly', () => {
    assert.strictEqual(SC.inputEscapeReview('', false, true), true);
    assert.strictEqual(SC.inputEscapeReview('', true, true), true);
    assert.strictEqual(SC.inputEscapeReview('use as is', false, false), true);
    assert.strictEqual(SC.inputEscapeReview('r to reroll', false, false), true);
    assert.strictEqual(SC.inputEscapeReview('能力値の決定', false, false), true);
    assert.strictEqual(SC.inputEscapeReview('use as is', true, false), false);
    assert.strictEqual(SC.inputEscapeReview('random dungeon text', false, false), false);
});
test('inputTerminalKeyFlags: choiceMenu vs namePrompt vs reviewScreen', () => {
    const cm = SC.inputTerminalKeyFlags('性別', false, false);
    assert.strictEqual(cm.isChoiceMenu, true);
    assert.strictEqual(cm.isNamePrompt, false);
    assert.strictEqual(cm.isReviewScreen, false);

    const np = SC.inputTerminalKeyFlags("character's name", false, false);
    assert.strictEqual(np.isChoiceMenu, false);
    assert.strictEqual(np.isNamePrompt, true);
    assert.strictEqual(np.isReviewScreen, false);

    const rv = SC.inputTerminalKeyFlags("use as is", false, false);
    assert.strictEqual(rv.isChoiceMenu, false);
    assert.strictEqual(rv.isNamePrompt, false);
    assert.strictEqual(rv.isReviewScreen, true);

    const ip = SC.inputTerminalKeyFlags("choose a race", true, false);
    assert.strictEqual(ip.isChoiceMenu, false);
    assert.strictEqual(ip.isNamePrompt, false);
    assert.strictEqual(ip.isReviewScreen, false);
});
test('inputTargetingPrompt: direction / target queries', () => {
    assert.strictEqual(SC.inputTargetingPrompt('direction? (escape to cancel)', true), true);
    assert.strictEqual(SC.inputTargetingPrompt('target [', true), true);
    assert.strictEqual(SC.inputTargetingPrompt('direction?', false), false);
    assert.strictEqual(SC.inputTargetingPrompt('normal play', true), false);
});
test('terminalDetectMode: classifies terminal screens for font sizing', () => {
    assert.strictEqual(SC.terminalDetectMode({ rows: [{ g: 'Character Creation' }] }), 'birth');
    assert.strictEqual(SC.terminalDetectMode({ rows: [{ g: 'Store Inventory' }] }), 'store');
    assert.strictEqual(SC.terminalDetectMode({ rows: [{ g: 'Select Target' }] }), 'targeting');
    assert.strictEqual(SC.terminalDetectMode({ rows: [{ g: 'Which potion?' }] }), 'item_prompt');
    assert.strictEqual(SC.terminalDetectMode({ rows: [{ g: 'Normal game play' }] }), 'classic_play');
    assert.strictEqual(SC.terminalDetectMode(null), 'classic_play');
});

test('classify: promptKind command vs select across realms', () => {
    // Sil-Q command prompt: inventory & equipment
    const silqInven = SC.classify(mkFrame('(inventory) command:'), 'silq');
    assert.strictEqual(silqInven.mode, 'item-list');
    assert.strictEqual(silqInven.listKind, 'inven');
    assert.strictEqual(silqInven.promptKind, 'command');

    const silqEquip = SC.classify(mkFrame('(equipment) command:'), 'silq');
    assert.strictEqual(silqEquip.mode, 'item-list');
    assert.strictEqual(silqEquip.listKind, 'equip');
    assert.strictEqual(silqEquip.promptKind, 'command');

    // Hengband command prompt: inventory & equipment with コマンド:
    const hengInven = SC.classify(mkFrame(['持ち物： 5 種類', 'コマンド: ']), 'hengband', { decode });
    assert.strictEqual(hengInven.mode, 'item-list');
    assert.strictEqual(hengInven.listKind, 'inven');
    assert.strictEqual(hengInven.promptKind, 'command');

    const hengEquip = SC.classify(mkFrame(['装備： 5 種類', 'コマンド: ']), 'hengband', { decode });
    assert.strictEqual(hengEquip.mode, 'item-list');
    assert.strictEqual(hengEquip.listKind, 'equip');
    assert.strictEqual(hengEquip.promptKind, 'command');

    // FrogComposBand gear UI: inventory | equipment
    const fcbGear = SC.classify(mkFrame('inventory | equipment'), 'frogcomposband');
    assert.strictEqual(fcbGear.mode, 'item-list');
    assert.strictEqual(fcbGear.promptKind, 'command');

    // Vanilla Angband item selection prompts: select promptKind + verbPrompt
    const vWear = SC.classify(mkFrame('Wear/wield which item?'), 'angband');
    assert.strictEqual(vWear.mode, 'item-list');
    assert.strictEqual(vWear.promptKind, 'select');
    assert.strictEqual(vWear.verbPrompt, 'wear');

    const vDrop = SC.classify(mkFrame('Drop which item?'), 'angband');
    assert.strictEqual(vDrop.mode, 'item-list');
    assert.strictEqual(vDrop.promptKind, 'select');
    assert.strictEqual(vDrop.verbPrompt, 'drop');
});

test('classify: mode press-any-key (EN and JP)', () => {
    const en1 = SC.classify(mkFrame('[Press any key to continue]'), 'angband');
    assert.strictEqual(en1.mode, 'press-any-key');
    assert.strictEqual(en1.isPressAnyKey, true);

    const en2 = SC.classify(mkFrame('press any key to continue'), 'silq');
    assert.strictEqual(en2.mode, 'press-any-key');
    assert.strictEqual(en2.isPressAnyKey, true);

    const jp1 = SC.classify(mkFrame('何かキーを押してください'), 'hengband', { decode });
    assert.strictEqual(jp1.mode, 'press-any-key');
    assert.strictEqual(jp1.isPressAnyKey, true);
});

test('classify: mode item-actions (Vanilla and Hengband)', () => {
    const vAct = SC.classify(mkFrame(['Command for Phial of Galadriel:', '(Enter to select, Esc to exit, ? for help)']), 'angband');
    assert.strictEqual(vAct.mode, 'item-actions');
    assert.strictEqual(vAct.isItemActions, true);

    const hAct = SC.classify(mkFrame(['つるはし に対するコマンド:']), 'hengband', { decode });
    assert.strictEqual(hAct.mode, 'item-actions');
    assert.strictEqual(hAct.isItemActions, true);
});

test('extractItems: parses keys, labels, glyphs, and strips noise', () => {
    const rows = [
        { g: '  a) ) a Long Sword (2d5) (+3,+4)                2.5 lb' },
        { g: '  b) 3 Rations of Food                              1.5 lb' },
        { g: '  c) (nothing)' },
        { g: '  * Random' }
    ];
    const items = SC.extractItems(rows, false);
    assert.strictEqual(items.length, 3);
    assert.deepStrictEqual(items[0], { key: 'a', label: 'a Long Sword (2d5) (+3,+4)', glyph: ')', display: '[a]' });
    assert.deepStrictEqual(items[1], { key: 'b', label: '3 Rations of Food', glyph: null, display: '[b]' });
    assert.deepStrictEqual(items[2], { key: '*', label: 'Random', glyph: null, display: '[*]' });
});

// ---------------------------------------------------------------------------
// 3. FIXTURES — real engine frames + snapshot
// ---------------------------------------------------------------------------
const fixtures = [];
if (fs.existsSync(FIX_DIR)) {
    for (const realm of fs.readdirSync(FIX_DIR)) {
        const dir = path.join(FIX_DIR, realm);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
            fixtures.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
        }
    }
}
test('fixtures present (capture: FIXTURE_DIR=tools/fixtures/menus node tools/verify_cross_realm_menus.js)', () => {
    assert(fixtures.length >= 10, `expected >= 10 fixtures, found ${fixtures.length}`);
    const realms = new Set(fixtures.map(f => f.realm));
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband']) assert(realms.has(r), `no fixtures for ${r}`);
});

const snapshot = fs.existsSync(SNAP_FILE) ? JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8')) : {};
const nextSnapshot = {};
for (const fx of fixtures) {
    const id = `${fx.realm}/${fx.name}`;
    const got = classify(fx.frame, fx.realm);
    nextSnapshot[id] = got;
    test(`fixture ${id} expect`, () => {
        for (const [k, v] of Object.entries(fx.expect || {})) {
            assert(k in got, `unknown expect key ${k}`);
            assert.strictEqual(got[k], v, `${k}: expected ${v}, got ${got[k]}`);
        }
    });
    if (!UPDATE) {
        test(`fixture ${id} snapshot`, () => {
            assert(snapshot[id], 'missing from snapshot.json (run with --update after review)');
            const diffs = Object.keys({ ...snapshot[id], ...got }).filter(k => snapshot[id][k] !== got[k])
                .map(k => `${k}: ${snapshot[id][k]} -> ${got[k]}`);
            assert.strictEqual(diffs.length, 0, diffs.join(', '));
        });
    }
}
if (UPDATE) {
    fs.mkdirSync(FIX_DIR, { recursive: true });
    fs.writeFileSync(SNAP_FILE, JSON.stringify(nextSnapshot, null, 1) + '\n', 'utf8');
    console.log(`[test_screen_context] snapshot updated: ${Object.keys(nextSnapshot).length} fixtures`);
}

// ---------------------------------------------------------------------------
console.log(`[test_screen_context] ${passed} passed, ${failures.length} failed (${fixtures.length} fixtures)`);
if (failures.length) {
    for (const f of failures) console.error('  FAIL ' + f);
    process.exit(1);
}
process.exit(0);

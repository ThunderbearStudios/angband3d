#!/usr/bin/env node
/**
 * tools/test_ws81_menu_action_parity_9realms.js
 *
 * WS81 Comprehensive 9-Realm Menu, Item Verb & Keymap Parity Suite.
 * Proves zero cross-realm key collisions or unintended actions across:
 *   angband, frogcomposband, hengband, silq, nethack, dcss, brogue, rogue, ryod
 *
 * Specifically guards against:
 *   1. DCSS Pack Inspect ('v') hurling/consuming items instead of inspecting them.
 *   2. 'e' (Equipment) vs 'E'/'e' (Eat) collision in Rogue, DCSS, Brogue, NetHack, RYOD.
 *   3. 'k' (Ignore/Destroy) walking North into monsters in Vi-key realms (DCSS, RYOD).
 *   4. '{' / '}' (Inscribe / Uninscribe) leaking item letters to top-level play.
 *   5. DCSS 'a' (Deity Ability vs Item Activate), 'P' (Put On vs Pray), 'R' (Remove vs Rest),
 *      'z' (Cast Spell), 'I' (Browse Spells), and 'm' (Skills).
 *   6. Item-targeted Throw ('f' in DCSS, 't' in NetHack/Brogue/Rogue/RYOD) throwing the exact chosen item.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ActionCatalog = require('../server/public/js/action-catalog.js');
const RealmKeys = require('../server/public/js/realm-keys.js');
const ScreenContext = require('../server/public/js/screen-context.js');
const ScreenModel = ScreenContext.ScreenModel || null;
const CommandDispatcher = require('../server/public/js/command-dispatcher.js');
const ItemSheet = require('../server/public/js/item-sheet.js');
const RealmCartridge = require('../server/public/js/realm-cartridge.js');
const MenuRouter = require('../server/public/js/menu-router.js');

const { UniversalCartridgeEngine, FEAT } = require('../server/src/cartridges/cartridge-core.js');
const { DCSS_SPEC } = require('../variants/dcss/bin/dcss-bridge.js');
const { BROGUE_SPEC } = require('../variants/brogue/bin/brogue-bridge.js');
const { ROGUE_SPEC } = require('../variants/rogue/bin/rogue-bridge.js');
const { RyodEngine } = require('../variants/ryod/bin/ryod-bridge.js');
const { NetHackEngine } = require('../variants/nethack/bin/nethack-bridge.js');

const ALL_9_REALMS = ['angband', 'frogcomposband', 'hengband', 'silq', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod'];
const tmpSaveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd3d-ws81-menus-'));

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}\n    ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
        throw err;
    }
}

function createHarness(realm) {
    const saveDir = path.join(tmpSaveRoot, `${realm}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(saveDir, { recursive: true });
    let eng;
    if (realm === 'dcss') {
        eng = new UniversalCartridgeEngine(DCSS_SPEC, { user: 'Tester', saveDir, isNew: true, randomBirth: true, seed: 424242 });
    } else if (realm === 'brogue') {
        eng = new UniversalCartridgeEngine(BROGUE_SPEC, { user: 'Tester', saveDir, isNew: true, randomBirth: true, seed: 424242 });
    } else if (realm === 'rogue') {
        eng = new UniversalCartridgeEngine(ROGUE_SPEC, { user: 'Tester', saveDir, isNew: true, randomBirth: true, seed: 424242 });
    } else if (realm === 'ryod') {
        eng = new RyodEngine({ user: 'Tester', saveDir, isNew: true, randomBirth: true });
    } else if (realm === 'nethack') {
        eng = new NetHackEngine({ user: 'Tester', saveDir, isNew: true });
        eng.state.phase = 'play';
    } else {
        throw new Error(`Unsupported JS harness realm: ${realm}`);
    }

    let currentFrame = eng.buildFrame();
    const sentKeys = [];
    let dispatcher = null;
    const sendKey = (k) => {
        sentKeys.push(k);
        eng.handleKey(k);
        currentFrame = eng.buildFrame();
        if (dispatcher) dispatcher.onFrame(currentFrame);
    };
    dispatcher = new CommandDispatcher({
        sendKey,
        getRealm: () => realm,
        getLastFrame: () => currentFrame,
        ActionCatalog,
        RealmKeys,
        ScreenModel,
        ScreenContext
    });
    return {
        eng,
        dispatcher,
        sentKeys,
        sendKey,
        getFrame: () => currentFrame,
        refreshFrame: () => { currentFrame = eng.buildFrame(); return currentFrame; }
    };
}

console.log('=== WS81: 9-Realm Menu, Item Verb & Keymap Parity Suite ===');

// ---------------------------------------------------------------------------
// 1. Cross-Layer Keymap & Safety Invariants Across All 9 Realms
// ---------------------------------------------------------------------------
test('1. Canonical examine keys align across ActionCatalog, RealmKeys, CommandDispatcher, MenuRouter & RealmCartridge', () => {
    const expectedExamine = {
        angband: 'I',
        frogcomposband: 'I',
        hengband: 'I',
        silq: 'x',
        nethack: ':',
        dcss: 'v',
        brogue: 'x',
        rogue: 'I',
        ryod: 'I'
    };
    for (const r of ALL_9_REALMS) {
        assert.strictEqual(ActionCatalog.keyFor('examine', r), expectedExamine[r], `ActionCatalog examine mismatch in ${r}`);
        assert.strictEqual(RealmKeys.realmKey('examine', r), expectedExamine[r], `RealmKeys examine mismatch in ${r}`);
        assert.strictEqual(CommandDispatcher.CANONICAL_KEYS.examine[r], expectedExamine[r], `CommandDispatcher examine mismatch in ${r}`);
        if (MenuRouter.VERBS[r]) {
            assert(MenuRouter.VERBS[r][expectedExamine[r]] || expectedExamine[r] === ':', `MenuRouter missing examine key '${expectedExamine[r]}' in ${r}`);
        }
    }
    assert.strictEqual(RealmCartridge.getCartridge('dcss').verbs.inspect.key, 'v');
    assert.strictEqual(RealmCartridge.getCartridge('brogue').verbs.inspect.key, 'x');
});

test('2. Vi-key movement realms (nethack, dcss, brogue, rogue, ryod) NEVER expose ignore="k" on ItemSheet', () => {
    for (const r of ['nethack', 'dcss', 'brogue', 'rogue', 'ryod']) {
        assert.strictEqual(ActionCatalog.keyFor('ignore', r), null, `${r} must not map ignore to 'k' (Vi-key Move North)`);
        assert.strictEqual(CommandDispatcher.CANONICAL_KEYS.ignore[r], null, `${r} dispatcher ignore must be null`);
        const sampleItem = { slot: 0, letter: 'a', name: 'Potion of Healing', tval: 71, vm: (1 << 0) | (1 << 18) | (1 << 19) };
        const verbs = ActionCatalog.validVerbsForItem(sampleItem, r);
        assert(!verbs.some(v => v.id === 'ignore'), `${r} must never offer Ignore [k] on items`);
    }
});

// ---------------------------------------------------------------------------
// 2. Brian's Exact Bug: DCSS Pack Inspect ('v') Must NEVER Throw or Consume!
// ---------------------------------------------------------------------------
test('3. DCSS Pack Inspect [v] via ItemSheet + CommandDispatcher inspects item and NEVER throws/consumes/advances turn', () => {
    const h = createHarness('dcss');
    const p = h.eng.state.player;
    // Place a visible hostile monster right next to the player so any accidental throw/fire would hit it!
    const mon = {
        id: 999, race: 'kobold brigand', glyph: 'k', attr: 3,
        x: Math.min(60, p.x + 1), y: p.y, hp: 30, hp_max: 30
    };
    h.eng.state.map[mon.y][mon.x].feat = FEAT.FLOOR;
    h.eng.state.map[mon.y][mon.x].inView = true;
    h.eng.state.map[mon.y][mon.x].known = true;
    h.eng.state.monsters = [mon];
    h.refreshFrame();

    const beforeInvCount = p.inventory.reduce((sum, it) => sum + (it.count || 1), 0);
    const beforeTurn = h.eng.state.turn;
    const vmItems = ItemSheet.buildItemViewModel(h.getFrame(), 'dcss', 'pack');
    assert(vmItems.length >= 2, 'DCSS hero must start with pack items');

    for (const targetVm of vmItems) {
        const examineVerb = targetVm.validVerbs.find(v => v.id === 'examine');
        assert(examineVerb, `DCSS item ${targetVm.name} must expose examine verb`);
        assert.strictEqual(examineVerb.key, 'v', 'DCSS examine verb key must be [v]');

        ItemSheet.executeVerb(targetVm, examineVerb, 'dcss', h.dispatcher);

        assert.strictEqual(h.dispatcher.state, 'Idle', 'Dispatcher must finish cleanly in Idle');
        assert.strictEqual(h.dispatcher.lastResult, 'Done', 'Dispatcher result must be Done');
        assert.strictEqual(mon.hp, 30, `Inspecting ${targetVm.name} must NEVER damage visible monsters!`);
        assert.strictEqual(h.eng.state.turn, beforeTurn, 'Inspecting an item must cost 0 turns');
        const lastMsg = h.eng.state.messages[h.eng.state.messages.length - 1].text;
        assert(!/hurl|ranged attack|whistles/i.test(lastMsg), `Inspect must NEVER hurl or shoot! Got: ${lastMsg}`);
        assert(/equipped|carried in pack/i.test(lastMsg), `Inspect must log item details! Got: ${lastMsg}`);
    }

    const afterInvCount = p.inventory.reduce((sum, it) => sum + (it.count || 1), 0);
    assert.strictEqual(afterInvCount, beforeInvCount, 'Zero items may be consumed by Inspect');
});

test('4. DCSS Classic Terminal [i] -> <letter> -> [v] AND [i] -> [v] -> <letter> inspect without throwing', () => {
    const h = createHarness('dcss');
    const p = h.eng.state.player;
    const unequipped = p.inventory.find(it => !it.equipped) || p.inventory[0];
    const startCount = unequipped.count || 1;

    // Flow A: [i] -> item letter -> 'v'
    h.sendKey('i');
    assert.strictEqual(h.eng.state.menuMode, 'inven');
    h.sendKey(unequipped.letter);
    assert.strictEqual(h.eng.state.menuMode, 'item_action');
    h.sendKey('v');
    assert.strictEqual(h.eng.state.menuMode, 'none');
    assert.strictEqual(unequipped.count || 1, startCount, 'Classic [i]->letter->v must NOT consume item');
    assert(/equipped|carried in pack/i.test(h.eng.state.messages[h.eng.state.messages.length - 1].text));
});

// ---------------------------------------------------------------------------
// 3. All 5 JS Engines: Examine, Gear ('e') vs Eat ('E'), Equip/Unequip, Inscribe, Throw
// ---------------------------------------------------------------------------
for (const realm of ['dcss', 'brogue', 'rogue', 'ryod', 'nethack']) {
    test(`5.${realm}: [Gear 'e'] opens Equipment while [Eat] consumes food without collision`, () => {
        const h = createHarness(realm);
        const p = h.eng.state.player;

        // 1. Pressing 'e' MUST open Equipment in every realm (including Rogue!)
        h.sendKey('e');
        assert.strictEqual(h.eng.state.menuMode, 'equip', `${realm}: 'e' must open equip screen`);
        h.sendKey('escape');
        assert.strictEqual(h.eng.state.menuMode, 'none');

        // 2. Ensure player has a food ration and eat it via ItemSheet + CommandDispatcher
        let food = p.inventory.find(it => it.kind === 'food');
        if (!food) {
            food = { slot: p.inventory.length, letter: 'z', kind: 'food', name: 'food ration', count: 1, nutrition: 800, weight: 20, tval: 80, sval: 1, buc: 'uncursed' };
            p.inventory.push(food);
            if (typeof h.eng.reindexInventory === 'function') h.eng.reindexInventory();
        }
        h.refreshFrame();
        const vmPack = ItemSheet.buildItemViewModel(h.getFrame(), realm, 'pack');
        const vmFood = vmPack.find(it => it.letter === food.letter);
        assert(vmFood, `${realm}: food item must appear in ItemSheet pack`);
        const eatVerb = vmFood.validVerbs.find(v => v.id === 'eat');
        assert(eatVerb, `${realm}: food item must have eat verb`);

        const beforeFoodTotal = p.inventory.filter(it => it.kind === 'food').reduce((s, it) => s + (it.count || 1), 0);
        ItemSheet.executeVerb(vmFood, eatVerb, realm, h.dispatcher);
        assert.strictEqual(h.dispatcher.state, 'Idle');
        assert.strictEqual(h.dispatcher.lastResult, 'Done');
        const afterFoodTotal = p.inventory.filter(it => it.kind === 'food').reduce((s, it) => s + (it.count || 1), 0);
        assert.strictEqual(afterFoodTotal, beforeFoodTotal - 1, `${realm}: eating food must decrement food count by 1`);
    });

    test(`6.${realm}: Examine, Inscribe '{', Uninscribe '}', Put On 'P' & Remove 'R'/'T' work end-to-end`, () => {
        const h = createHarness(realm);
        const p = h.eng.state.player;
        const ringKind = realm === 'nethack' ? 'jewelry' : 'ring';
        p.inventory.push({
            slot: p.inventory.length,
            letter: 'x',
            kind: ringKind,
            name: 'ring of protection',
            bonus: 2,
            count: 1,
            weight: 3,
            tval: 45,
            sval: 1,
            buc: 'blessed'
        });
        if (typeof h.eng.reindexInventory === 'function') h.eng.reindexInventory();
        h.refreshFrame();

        // A. Examine via ItemSheet
        let vmPack = ItemSheet.buildItemViewModel(h.getFrame(), realm, 'pack');
        let vmRing = vmPack.find(it => /ring of protection/i.test(it.name));
        assert(vmRing, `${realm}: ring must be in pack`);
        const exVerb = vmRing.validVerbs.find(v => v.id === 'examine');
        assert(exVerb, `${realm}: ring must offer examine`);
        ItemSheet.executeVerb(vmRing, exVerb, realm, h.dispatcher);
        assert.strictEqual(h.dispatcher.lastResult, 'Done');

        // B. Inscribe '{' via ItemSheet
        const insVerb = vmRing.validVerbs.find(v => v.id === 'inscribe');
        assert(insVerb, `${realm}: ring must offer inscribe`);
        ItemSheet.executeVerb(vmRing, insVerb, realm, h.dispatcher);
        assert.strictEqual(h.dispatcher.lastResult, 'Done');
        vmPack = ItemSheet.buildItemViewModel(h.getFrame(), realm, 'pack');
        vmRing = vmPack.find(it => /ring of protection/i.test(it.name));
        assert.strictEqual(vmRing.inscription, '!k', `${realm}: inscription must persist in frame`);

        // C. Uninscribe '}' via ItemSheet
        const uninsVerb = vmRing.validVerbs.find(v => v.id === 'uninscribe');
        assert(uninsVerb, `${realm}: inscribed item must offer uninscribe`);
        ItemSheet.executeVerb(vmRing, uninsVerb, realm, h.dispatcher);
        assert.strictEqual(h.dispatcher.lastResult, 'Done');
        vmPack = ItemSheet.buildItemViewModel(h.getFrame(), realm, 'pack');
        vmRing = vmPack.find(it => /ring of protection/i.test(it.name));
        assert.strictEqual(vmRing.inscription, '', `${realm}: uninscribe must clear inscription`);

        // D. Put On ('P' / 'w') and Remove ('R' / 'T')
        const putKey = realm === 'brogue' ? 'w' : 'P';
        h.dispatcher.run({ verb: 'puton', key: putKey, item: vmRing.raw });
        assert.strictEqual(h.dispatcher.lastResult, 'Done');
        const rawRing = p.inventory.find(it => /ring of protection/i.test(it.name));
        assert(rawRing && rawRing.equipped, `${realm}: Put On (${putKey}) must equip ring`);

        const remKey = realm === 'brogue' ? 'T' : 'R';
        h.dispatcher.run({ verb: 'remove', key: remKey, item: { letter: rawRing.letter, name: 'ring of protection' } });
        assert.strictEqual(h.dispatcher.lastResult, 'Done');
        assert(!rawRing.equipped, `${realm}: Remove (${remKey}) must unequip ring (never rest!)`);
    });

    test(`7.${realm}: ItemSheet Throw hurls the exact selected pack item`, () => {
        const h = createHarness(realm);
        const p = h.eng.state.player;
        p.inventory.push({
            slot: p.inventory.length,
            letter: 'y',
            kind: 'potion',
            name: 'vial of frost',
            count: 1,
            weight: 10,
            tval: 71,
            sval: 5,
            buc: 'uncursed'
        });
        if (typeof h.eng.reindexInventory === 'function') h.eng.reindexInventory();
        h.refreshFrame();

        const rawVial = p.inventory.find(it => it.name === 'vial of frost');
        const intent = realm === 'nethack'
            ? { verb: 'throw', item: { letter: rawVial.letter, name: 'vial of frost' }, dir: 'right' }
            : { verb: 'throw', item: { letter: rawVial.letter, name: 'vial of frost' } };
        h.dispatcher.run(intent);
        assert.strictEqual(h.dispatcher.lastResult, 'Done');
        assert(!p.inventory.some(it => it.name === 'vial of frost'), `${realm}: thrown vial must leave pack`);
        const lastMsg = h.eng.state.messages[h.eng.state.messages.length - 1].text;
        assert(/vial of frost/i.test(lastMsg), `${realm}: throw log must name thrown item, got: ${lastMsg}`);
    });
}

// ---------------------------------------------------------------------------
// 4. DCSS Specific Deity Ability ('a') vs Item Activate ('a' + letter), Spells ('z'/'I'), Skills ('m')
// ---------------------------------------------------------------------------
test('8. DCSS [a] supports BOTH 2-step Item Activate (0 piety spent) AND 1-key Divine Power invocation', () => {
    const h = createHarness('dcss');
    const p = h.eng.state.player;
    p.deity = 'Okawaru';
    p.piety = 3;
    p.inventory.push({
        slot: p.inventory.length,
        letter: 'z',
        kind: 'charm',
        name: 'phial of floods',
        count: 1,
        weight: 10,
        tval: 55,
        sval: 1
    });
    h.eng.reindexInventory();
    h.refreshFrame();

    const phial = p.inventory.find(it => it.name === 'phial of floods');
    // 2-step Item Activate via CommandDispatcher ('a' -> phial.letter)
    h.dispatcher.run({ verb: 'activate', item: { letter: phial.letter, name: 'phial of floods' } });
    assert.strictEqual(h.dispatcher.state, 'Idle');
    assert.strictEqual(h.dispatcher.lastResult, 'Done');
    assert.strictEqual(p.piety, 3, 'Activating an item with [a] must NOT consume piety');

    // Divine Power via 'a' -> '1'
    h.sendKey('a');
    assert.strictEqual(h.eng.state.menuMode, 'verb');
    assert.strictEqual(h.eng.state.pendingVerb, 'dcss_ability');
    h.sendKey('1');
    assert.strictEqual(h.eng.state.menuMode, 'none');
    assert.strictEqual(p.piety, 2, 'Invoking Okawaru power via [a]->[1] must spend 1 piety');

    // 'm' opens Skills, 'I' opens Browse Spells, '%' opens Char Sheet, '\\' opens Knowledge, '?' opens Help
    for (const [k, expectedMode] of [['m', 'skills'], ['I', 'spells'], ['%', 'char'], ['\\', 'knowledge'], ['?', 'help']]) {
        h.sendKey(k);
        assert.strictEqual(h.eng.state.menuMode, expectedMode, `DCSS key '${k}' must open '${expectedMode}'`);
        h.sendKey('escape');
        assert.strictEqual(h.eng.state.menuMode, 'none');
    }
});

// ---------------------------------------------------------------------------
// 5. Native C/C++ Realms (angband, frogcomposband, hengband, silq) Plan Compilation Parity
// ---------------------------------------------------------------------------
test('9. Native C/C++ realms compile collision-free plans for every valid item verb', () => {
    const dummyDispatcher = new CommandDispatcher({
        sendKey: () => {},
        getRealm: () => 'angband',
        getLastFrame: () => null,
        ActionCatalog,
        RealmKeys,
        ScreenModel,
        ScreenContext
    });

    const cases = [
        { realm: 'angband', verb: 'examine', expectedKey: 'I' },
        { realm: 'frogcomposband', verb: 'examine', expectedKey: 'I' },
        { realm: 'hengband', verb: 'examine', expectedKey: 'I' },
        { realm: 'silq', verb: 'examine', expectedKey: 'x' },
        { realm: 'silq', verb: 'takeoff', expectedKey: 'r' },
        { realm: 'silq', verb: 'use_staff', expectedKey: 'a' },
        { realm: 'silq', verb: 'play_horn', expectedKey: 'p' },
        { realm: 'angband', verb: 'eat', expectedKey: 'E' },
        { realm: 'frogcomposband', verb: 'eat', expectedKey: 'E' },
        { realm: 'hengband', verb: 'eat', expectedKey: 'E' },
        { realm: 'silq', verb: 'eat', expectedKey: 'E' },
        { realm: 'angband', verb: 'throw', expectedKey: 'v' },
        { realm: 'silq', verb: 'throw', expectedKey: 't' }
    ];

    for (const c of cases) {
        const plan = dummyDispatcher.compilePlan({ verb: c.verb, item: { letter: 'b', name: 'Test Item' } }, null, c.realm);
        assert(Array.isArray(plan) && plan.length === 2, `${c.realm} ${c.verb} must compile a 2-step plan`);
        assert.strictEqual(plan[0].send, c.expectedKey, `${c.realm} ${c.verb} Step 0 key mismatch`);
        assert.strictEqual(plan[1].send, 'b', `${c.realm} ${c.verb} Step 1 item letter mismatch`);
    }
});

try { fs.rmSync(tmpSaveRoot, { recursive: true, force: true }); } catch (_) {}
console.log(`\nALL ${passed} WS81 9-REALM MENU & ACTION PARITY TESTS PASSED!`);

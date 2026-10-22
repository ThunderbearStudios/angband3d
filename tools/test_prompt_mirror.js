#!/usr/bin/env node
/**
 * tools/test_prompt_mirror.js
 *
 * Fast pure-Node unit test suite for:
 *   - PromptMirror.buildSpec (Card WS42.5B, §6.7)
 *   - ItemSheet.buildItemViewModel (Card WS42.5B, §6.8 #3)
 *   - EntityMenu.buildActionsForEntity (Card WS42.5C, §6.8 #5)
 * Across all 4 realms (angband, silq, frogcomposband, hengband).
 */

'use strict';

const assert = require('assert');
const PromptMirror = require('../server/public/js/prompt-mirror.js');
const ItemSheet = require('../server/public/js/item-sheet.js');
const EntityMenu = require('../server/public/js/entity-menu.js');
const ActionCatalog = require('../server/public/js/action-catalog.js');

const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}\n    ${err.message}`);
        throw err;
    }
}

console.log('--- test_prompt_mirror.js ---');

// =========================================================================
// 1. PromptMirror.buildSpec
// =========================================================================

test('PromptMirror.buildSpec returns null when model.mirror is null or absent', () => {
    assert.strictEqual(PromptMirror.buildSpec(null, null, 'angband'), null);
    assert.strictEqual(PromptMirror.buildSpec({}, null, 'angband'), null);
    assert.strictEqual(PromptMirror.buildSpec({ mirror: null }, null, 'angband'), null);
});

REALMS.forEach((realm) => {
    test(`[${realm}] PromptMirror 'more' mirror specification`, () => {
        const model = {
            mirror: 'more',
            prompt: { kind: 'more', text: '-more-' }
        };
        const spec = PromptMirror.buildSpec(model, { realm, seq: 10 }, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'more');
        assert.strictEqual(spec.title, '-more-');
        assert.strictEqual(spec.actions.length, 1);
        assert.strictEqual(spec.actions[0].key, 'space');
        assert.strictEqual(spec.actions[0].primary, true);
        assert.deepStrictEqual(spec.items, []);
        assert.deepStrictEqual(spec.switchChips, []);
        assert.strictEqual(spec.targetChip, null);
    });

    test(`[${realm}] PromptMirror 'yesno' mirror specification`, () => {
        const model = {
            mirror: 'yesno',
            prompt: { kind: 'yesno', text: 'Really leave this level? [y/n]' }
        };
        const spec = PromptMirror.buildSpec(model, { realm, seq: 11 }, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'yesno');
        assert.strictEqual(spec.title, 'Really leave this level? [y/n]');
        assert.strictEqual(spec.actions.length, 3);
        const [yesAct, noAct, escAct] = spec.actions;
        assert.strictEqual(yesAct.key, 'y');
        assert.strictEqual(yesAct.primary, true);
        assert.strictEqual(noAct.key, 'n');
        assert.strictEqual(noAct.danger, true);
        assert.strictEqual(escAct.key, 'escape');
    });

    test(`[${realm}] PromptMirror 'quantity' / 'count' mirror specification`, () => {
        const model = {
            mirror: 'quantity',
            prompt: { kind: 'quantity', text: 'How many items? (1-10)' }
        };
        const spec = PromptMirror.buildSpec(model, { realm, seq: 12 }, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'quantity');
        const keys = spec.actions.map((a) => a.key);
        assert(keys.includes('-'));
        assert(keys.includes('+'));
        assert(keys.includes('*'));
        assert(keys.includes('&'));
        assert(keys.includes('enter'));
        assert(keys.includes('escape'));
    });

    test(`[${realm}] PromptMirror 'item' mirror specification with switch chips`, () => {
        const model = {
            mirror: 'item',
            prompt: { kind: 'item', text: 'Wear/Wield which item?' },
            items: [
                { letter: 'a', name: 'Broad Sword (2d5)', slot: 0, source: 'pack' },
                { letter: 'b', name: 'Chain Mail (-2)', slot: 1, source: 'pack' }
            ]
        };
        const spec = PromptMirror.buildSpec(model, { realm, seq: 13 }, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'item');
        assert.strictEqual(spec.items.length, 2);
        assert.strictEqual(spec.items[0].letter, 'a');
        assert.strictEqual(spec.items[0].name, 'Broad Sword (2d5)');
        assert.strictEqual(spec.switchChips.length, 3);
        const switchKeys = spec.switchChips.map((c) => c.key);
        assert.deepStrictEqual(switchKeys, ['/', '|', '-']);
        assert.strictEqual(spec.actions[0].key, 'escape');
    });

    test(`[${realm}] PromptMirror 'item-menu' mirror specification`, () => {
        const model = {
            mirror: 'item-menu',
            prompt: { kind: 'menu', text: 'Command for Broad Sword' },
            regions: [
                { letter: 'w', name: 'Wield item', slot: 0 },
                { letter: 'd', name: 'Drop item', slot: 0 },
                { letter: 'x', name: 'Examine item', slot: 0 }
            ]
        };
        const spec = PromptMirror.buildSpec(model, { realm, seq: 14 }, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'item-menu');
        assert.strictEqual(spec.items.length, 3);
        assert.strictEqual(spec.items[0].letter, 'w');
        assert.strictEqual(spec.actions[0].key, 'escape');
    });

    test(`[${realm}] PromptMirror 'direction' mirror specification with realm target key`, () => {
        const model = {
            mirror: 'direction',
            prompt: { kind: 'direction', text: 'Direction to aim?' }
        };
        const spec = PromptMirror.buildSpec(model, { realm, seq: 15 }, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'direction');
        assert(spec.targetChip);
        if (realm === 'silq') {
            assert.strictEqual(spec.targetChip.key, 'f');
        } else {
            assert.strictEqual(spec.targetChip.key, 't');
        }
        const actionKeys = spec.actions.map((a) => a.key);
        ['1', '2', '3', '4', '6', '7', '8', '9', '*', 'escape'].forEach((k) => {
            assert(actionKeys.includes(k), `Direction mirror missing key '${k}'`);
        });
        assert(actionKeys.includes(spec.targetChip.key));
    });

    test(`[${realm}] PromptMirror 'spell' mirror specification`, () => {
        const frame = {
            realm,
            seq: 16,
            spells: [
                { letter: 'a', name: 'Magic Missile', mana: 1, fail: 5, level: 1 },
                { letter: 'b', name: 'Detect Monsters', mana: 2, fail: 10, level: 2 }
            ]
        };
        const model = {
            mirror: 'spell',
            prompt: { kind: 'spell', text: 'Cast which spell?' }
        };
        const spec = PromptMirror.buildSpec(model, frame, realm);
        assert(spec);
        assert.strictEqual(spec.mirror, 'spell');
        assert.strictEqual(spec.items.length, 2);
        assert.strictEqual(spec.items[0].letter, 'a');
        assert.strictEqual(spec.items[0].name, 'Magic Missile');
        assert.strictEqual(spec.items[0].cost, 1);
        assert.strictEqual(spec.actions[0].key, 'escape');
    });
});

// =========================================================================
// 2. ItemSheet.buildItemViewModel
// =========================================================================

REALMS.forEach((realm) => {
    test(`[${realm}] ItemSheet buildItemViewModel for Pack tab`, () => {
        const frame = {
            realm,
            seq: 20,
            player: {
                inventory: [
                    { slot: 0, letter: 'a', name: 'Potion of Cure Serious Wounds', tval: 75, count: 3, inscription: '@q1' },
                    { slot: 1, letter: 'b', name: 'Scroll of Phase Door', tval: 70, count: 5 },
                    { slot: 2, letter: 'c', name: 'Long Sword (2d5)', tval: 23, count: 1 }
                ]
            }
        };

        const items = ItemSheet.buildItemViewModel(frame, realm, 'pack');
        assert.strictEqual(items.length, 3);

        // Potion: primary verb should be 'quaff'
        const pot = items[0];
        assert.strictEqual(pot.letter, 'a');
        assert.strictEqual(pot.count, 3);
        assert.strictEqual(pot.inscription, '@q1');
        assert(pot.validVerbs.length >= 3);
        const quaffVerb = pot.validVerbs.find((v) => v.id === 'quaff');
        assert(quaffVerb, 'Potion must have quaff verb');
        assert.strictEqual(quaffVerb.primary, true);

        // Scroll: primary verb should be 'read' (in realms that have read; Sil-Q has no scrolls)
        if (realm !== 'silq') {
            const scr = items[1];
            const readVerb = scr.validVerbs.find((v) => v.id === 'read');
            assert(readVerb, 'Scroll must have read verb');
            assert.strictEqual(readVerb.primary, true);
        }

        // Weapon: primary verb should be 'wield'
        const sw = items[2];
        const wieldVerb = sw.validVerbs.find((v) => v.id === 'wield');
        assert(wieldVerb, 'Weapon must have wield verb');
        assert.strictEqual(wieldVerb.primary, true);
    });

    test(`[${realm}] ItemSheet buildItemViewModel for Gear tab (equipped items)`, () => {
        const frame = {
            realm,
            seq: 21,
            player: {
                equipment: [
                    { slot: 0, letter: 'a', name: 'Ring of Protection (+3)', tval: 45, count: 1 }
                ]
            }
        };

        const items = ItemSheet.buildItemViewModel(frame, realm, 'gear');
        assert.strictEqual(items.length, 1);
        const ring = items[0];
        assert.strictEqual(ring.letter, 'a');

        // Equipped item: primary verb must be 'takeoff'
        const takeoff = ring.validVerbs.find((v) => v.id === 'takeoff');
        assert(takeoff, 'Equipped item must have takeoff verb');
        assert.strictEqual(takeoff.primary, true);
    });

    test(`[${realm}] ItemSheet buildItemViewModel for Quiver tab`, () => {
        const frame = {
            realm,
            seq: 22,
            player: {
                quiver: [
                    { slot: 0, letter: '0', name: 'Arrows (1d4)', tval: 16, count: 20 }
                ]
            }
        };

        const items = ItemSheet.buildItemViewModel(frame, realm, 'quiver');
        assert.strictEqual(items.length, 1);
        const arrows = items[0];
        const fire = arrows.validVerbs.find((v) => v.id === 'fire');
        assert(fire, 'Quiver item must have fire verb');
        assert.strictEqual(fire.primary, true);
    });

    test(`[${realm}] ItemSheet vm bitmask decoding and im invalid bitmask`, () => {
        // Bit 0 = quaff, Bit 8 = throw, Bit 11 = drop
        const vmMask = (1 << 0) | (1 << 8) | (1 << 11);
        // im invalid mask: bit 0 (quaff disabled)
        const imMask = (1 << 0);

        const frame = {
            realm,
            seq: 23,
            player: {
                inventory: [
                    { slot: 0, letter: 'a', name: 'Custom Flask', vm: vmMask, im: imMask }
                ]
            }
        };

        const items = ItemSheet.buildItemViewModel(frame, realm, 'pack');
        assert.strictEqual(items.length, 1);
        const flask = items[0];
        assert.strictEqual(flask.validVerbs.length, 3);
        const quaff = flask.validVerbs.find((v) => v.id === 'quaff');
        assert(quaff);
        assert.strictEqual(quaff.disabled, true);
        assert(quaff.reason.length > 0);

        const drop = flask.validVerbs.find((v) => v.id === 'drop');
        assert(drop);
        assert.strictEqual(drop.disabled, false);
    });
});

test('ItemSheet Quick Slot binding functions correctly', () => {
    const dummyItem = { name: 'Potion of Healing', letter: 'a' };
    const dummyVerb = { id: 'quaff', label: 'Quaff' };

    assert.strictEqual(ItemSheet.bindQuickSlot(1, dummyItem, dummyVerb), true);
    assert.strictEqual(ItemSheet.bindQuickSlot(5, dummyItem, dummyVerb), false); // Out of bounds

    const slots = ItemSheet.getQuickSlots();
    assert.strictEqual(slots.length, 4);
    assert.strictEqual(slots[0].item.name, 'Potion of Healing');
    assert.strictEqual(slots[0].verb.id, 'quaff');
    assert.strictEqual(slots[1], null);
});

// =========================================================================
// 3. EntityMenu.buildActionsForEntity
// =========================================================================

REALMS.forEach((realm) => {
    test(`[${realm}] EntityMenu monster actions`, () => {
        const monster = { type: 'monster', name: 'Snaga Orc', hp: 8, maxHp: 8 };
        const actions = EntityMenu.buildActionsForEntity(monster, realm);
        const ids = actions.map((a) => a.id);

        assert(ids.includes('look'));
        assert(ids.includes('target'));
        assert(ids.includes('fire'));
        assert(ids.includes('throw'));
        assert(ids.includes('recall'));

        if (realm === 'silq') {
            assert(ids.includes('song'));
            assert(!ids.includes('cast'));
        } else if (realm === 'frogcomposband' || realm === 'hengband') {
            assert(ids.includes('cast'));
            assert(ids.includes('power'));
        } else {
            assert(ids.includes('cast'));
        }

        // Verify key mappings
        const lookAct = actions.find((a) => a.id === 'look');
        assert.strictEqual(lookAct.key, 'l');

        const targetAct = actions.find((a) => a.id === 'target');
        if (realm === 'silq') {
            assert.strictEqual(targetAct.key, 'f');
        } else {
            assert.strictEqual(targetAct.key, '*');
        }

        const fireAct = actions.find((a) => a.id === 'fire');
        if (realm === 'silq') {
            assert.strictEqual(fireAct.key, 't');
        } else {
            assert.strictEqual(fireAct.key, 'f');
        }
    });

    test(`[${realm}] EntityMenu floor item actions`, () => {
        const item = { type: 'item', name: 'Iron Helm [5,+0]' };
        const actions = EntityMenu.buildActionsForEntity(item, realm);
        const ids = actions.map((a) => a.id);

        assert.deepStrictEqual(ids, ['walk_to', 'pickup', 'examine']);
        const pickupAct = actions.find((a) => a.id === 'pickup');
        assert.strictEqual(pickupAct.key, 'g');

        const examineAct = actions.find((a) => a.id === 'examine');
        if (realm === 'silq') {
            assert.strictEqual(examineAct.key, 'x');
        } else {
            assert.strictEqual(examineAct.key, 'I');
        }
    });

    test(`[${realm}] EntityMenu door actions`, () => {
        const door = { type: 'door', closed: true };
        const actions = EntityMenu.buildActionsForEntity(door, realm);
        const ids = actions.map((a) => a.id);

        assert.deepStrictEqual(ids, ['open', 'close', 'bash', 'disarm']);
        const bashAct = actions.find((a) => a.id === 'bash');
        if (realm === 'silq') {
            assert.strictEqual(bashAct.key, 'b');
        } else {
            assert.strictEqual(bashAct.key, 'B');
        }
    });

    test(`[${realm}] EntityMenu trap actions`, () => {
        const trap = { type: 'trap' };
        const actions = EntityMenu.buildActionsForEntity(trap, realm);
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].id, 'disarm');
        assert.strictEqual(actions[0].key, 'D');
    });

    test(`[${realm}] EntityMenu rubble actions`, () => {
        const rubble = { type: 'rubble' };
        const actions = EntityMenu.buildActionsForEntity(rubble, realm);
        const ids = actions.map((a) => a.id);
        assert.deepStrictEqual(ids, ['tunnel', 'alter']);
        const alterAct = actions.find((a) => a.id === 'alter');
        if (realm === 'silq') {
            assert.strictEqual(alterAct.key, '/');
        } else {
            assert.strictEqual(alterAct.key, '+');
        }
    });

    test(`[${realm}] EntityMenu stair actions`, () => {
        const stair = { type: 'stair' };
        const actions = EntityMenu.buildActionsForEntity(stair, realm);
        const ids = actions.map((a) => a.id);
        assert.deepStrictEqual(ids, ['stairs_up', 'stairs_down']);
        assert.strictEqual(actions[0].key, '<');
        assert.strictEqual(actions[1].key, '>');
    });
});

console.log(`\nALL ${passedTests}/${totalTests} TESTS PASSED!`);

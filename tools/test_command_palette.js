#!/usr/bin/env node
/**
 * tools/test_command_palette.js
 *
 * Fast pure-Node unit test suite for CommandPalette (Card WS42.5C, §6.8 #4, §8, §16.4).
 * Verifies:
 *   1. 100% coverage of ActionCatalog.listForRealm(realm) across all 4 realms.
 *   2. Search & synonym filtering (ID, label EN/JP, synonym, physical key, keyDisplay).
 *   3. Recency ranking (recently used commands appear first).
 *   4. <kbd> key metadata formatting (keyDisplay, non-null physical keys).
 *   5. Command availability and category classification.
 */

'use strict';

const assert = require('assert');
const ActionCatalog = require('../server/public/js/action-catalog.js');
const CommandPalette = require('../server/public/js/command-palette.js');

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

console.log('--- test_command_palette.js ---');

// =========================================================================
// 1. 100% ActionCatalog Coverage per Realm
// =========================================================================

REALMS.forEach((realm) => {
    test(`[${realm}] 100% ActionCatalog coverage in CommandPalette.getCommandsForRealm`, () => {
        const catalogList = ActionCatalog.listForRealm(realm);
        const paletteList = CommandPalette.getCommandsForRealm(realm);

        assert(Array.isArray(catalogList));
        assert(Array.isArray(paletteList));
        assert.strictEqual(
            paletteList.length,
            catalogList.length,
            `CommandPalette length (${paletteList.length}) must match ActionCatalog (${catalogList.length}) for ${realm}`
        );
        assert(paletteList.length >= 35, `Realm ${realm} must have >= 35 commands`);

        const catalogIds = catalogList.map((c) => c.id);
        const paletteIds = paletteList.map((c) => c.id);

        assert.deepStrictEqual(paletteIds, catalogIds, `IDs must match ActionCatalog order exactly for ${realm}`);

        for (let i = 0; i < paletteList.length; i++) {
            const p = paletteList[i];
            const c = catalogList[i];
            assert.strictEqual(p.id, c.id);
            assert.strictEqual(p.key, c.keys[realm], `Physical key mismatch for command ${p.id} in ${realm}`);
            assert(p.keyDisplay && typeof p.keyDisplay === 'string', `Missing keyDisplay for ${p.id}`);
            assert(p.name && typeof p.name === 'string', `Missing name for ${p.id}`);
            assert(Array.isArray(p.synonyms), `Synonyms must be array for ${p.id}`);
            assert(typeof p.available === 'boolean', `Available must be boolean for ${p.id}`);
        }
    });
});

// =========================================================================
// 2. Search & Synonym Filtering
// =========================================================================

test('filterCommands matches by exact ID', () => {
    const list = CommandPalette.getCommandsForRealm('angband');
    const res = CommandPalette.filterCommands(list, 'all', 'wield');
    assert(res.length >= 1);
    assert.strictEqual(res[0].id, 'wield');
});

test('filterCommands matches by EN label', () => {
    const list = CommandPalette.getCommandsForRealm('angband');
    const res = CommandPalette.filterCommands(list, 'all', 'Take Off');
    assert(res.length >= 1);
    assert.strictEqual(res[0].id, 'takeoff');
});

test('filterCommands matches by JP label in Hengband', () => {
    const list = CommandPalette.getCommandsForRealm('hengband', 'jp');
    const res = CommandPalette.filterCommands(list, 'all', '装備する');
    assert(res.length >= 1);
    assert.strictEqual(res[0].id, 'wield');
});

test('filterCommands matches by synonym', () => {
    const list = CommandPalette.getCommandsForRealm('angband');

    // 'wear' is a synonym for 'wield'
    const resWear = CommandPalette.filterCommands(list, 'all', 'wear');
    assert(resWear.some((c) => c.id === 'wield'), `Synonym 'wear' should match 'wield'`);

    // 'pray' is a synonym for 'cast'
    const resPray = CommandPalette.filterCommands(list, 'all', 'pray');
    assert(resPray.some((c) => c.id === 'cast'), `Synonym 'pray' should match 'cast'`);

    // 'discard' is a synonym for 'drop'
    const resDiscard = CommandPalette.filterCommands(list, 'all', 'discard');
    assert(resDiscard.some((c) => c.id === 'drop'), `Synonym 'discard' should match 'drop'`);
});

test('filterCommands matches by physical key and keyDisplay', () => {
    const list = CommandPalette.getCommandsForRealm('angband');

    // Key 'w' should match wield
    const resW = CommandPalette.filterCommands(list, 'all', 'w');
    assert(resW.some((c) => c.id === 'wield'));

    // Key 'enter' should match command_menu
    const resEnter = CommandPalette.filterCommands(list, 'all', 'enter');
    assert(resEnter.length >= 1);
    assert(resEnter.some((c) => c.id === 'command_menu'));

    // In Sil-Q, 'Tab' matches abilities
    const silqList = CommandPalette.getCommandsForRealm('silq');
    const resTab = CommandPalette.filterCommands(silqList, 'all', 'Tab');
    assert(resTab.length >= 1);
    assert(resTab.some((c) => c.keyDisplay === 'Tab'));
});

test('filterCommands category tabs restrict commands when query is empty', () => {
    const list = CommandPalette.getCommandsForRealm('angband');

    const itemCmds = CommandPalette.filterCommands(list, 'items', '');
    assert(itemCmds.length > 0);
    assert(itemCmds.every((c) => c.cat === 'items' || c.group === 'items'));

    const magicCmds = CommandPalette.filterCommands(list, 'magic', '');
    assert(magicCmds.length > 0);
    assert(magicCmds.every((c) => c.cat === 'magic' || c.group === 'magic'));
});

// =========================================================================
// 3. Recency Ranking
// =========================================================================

test('recency ranking promotes recently executed commands to the top', () => {
    const list = CommandPalette.getCommandsForRealm('angband');

    // Initially 'drop' is not at index 0 (wield is first in items)
    CommandPalette.recordRecent('drop');
    const recents1 = CommandPalette.getRecentCommands();
    assert.strictEqual(recents1[0], 'drop');

    const ranked1 = CommandPalette.filterCommands(list, 'all', '', recents1);
    assert.strictEqual(ranked1[0].id, 'drop', `'drop' should be ranked first after being recorded`);

    // Now record 'cast'
    CommandPalette.recordRecent('cast');
    const recents2 = CommandPalette.getRecentCommands();
    assert.strictEqual(recents2[0], 'cast');
    assert.strictEqual(recents2[1], 'drop');

    const ranked2 = CommandPalette.filterCommands(list, 'all', '', recents2);
    assert.strictEqual(ranked2[0].id, 'cast', `'cast' should now be first`);
    assert.strictEqual(ranked2[1].id, 'drop', `'drop' should be second`);
});

// =========================================================================
// 4. <kbd> Key Metadata
// =========================================================================

test('keyDisplay formatting converts special keys to readable badges', () => {
    REALMS.forEach((realm) => {
        const list = CommandPalette.getCommandsForRealm(realm);
        for (const cmd of list) {
            assert(cmd.keyDisplay, `keyDisplay must not be empty for ${cmd.id} in ${realm}`);
            if (cmd.key === ' ' || cmd.key === 'space') {
                assert.strictEqual(cmd.keyDisplay, 'Space');
            } else if (cmd.key === 'tab') {
                assert.strictEqual(cmd.keyDisplay, 'Tab');
            }
        }
    });
});

// =========================================================================
// 5. Availability Integration
// =========================================================================

test('command availability reflects runtime ActionCatalog state', () => {
    const list = CommandPalette.getCommandsForRealm('angband');
    const wieldCmd = list.find((c) => c.id === 'wield');
    assert(wieldCmd);
    assert.strictEqual(wieldCmd.available, true);
});

console.log(`\nALL ${passedTests}/${totalTests} TESTS PASSED!`);

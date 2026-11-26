#!/usr/bin/env node
/**
 * tools/test_v13_3_4_menu_prompts.js
 *
 * Fast (<0.2s) deterministic unit regression suite for v13.3.4 9-Realm Menu & Prompt Mirror fixes:
 *  1. Spell study/cast/power prompts route to mirror='spell' with extractSpellItems (never mirror='item' inventory)
 *  2. Equipment lists never collide with inventory slot letters (e.g. Angband Equip a) Rapier vs Inven a) Spellbook)
 *  3. Sil-Q compact prompts (Inven: b-b) respect range filters and never mix equipment + inventory
 *  4. NetHack 'E' (Engrave) routes to mirror='string' (never empty mirror='item')
 *  5. Command-for-item right-column extraction includes {) Inscribe, k) Ignore, and left-column item lore
 *  6. Zero-empty-overlay safety falls back to CRT (mirror=null) if an overlay prompt resolves 0 items
 *  7. input.js forwards keys directly during 3D prompt overlays; boot.js + settings-modal.js expose live Prompt Style toggle
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SC = require('../server/public/js/screen-context.js');
const PM = require('../server/public/js/prompt-mirror.js');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function mkFrame(rows, extra = {}) {
    return Object.assign({
        phase: 'play',
        seq: 100,
        map: { w: 20, h: 10, rows: [] },
        player: { name: 'Tester', hp: 20, hp_max: 20, depth: 1, x: 5, y: 5 },
        term: { rows: rows.map((g) => ({ g })) },
        ui: { overlay: 2, awaiting_command: false, more: false, context: 'menu' }
    }, extra);
}

// 1. Angband Study which spell? routes to mirror='spell' with actual spells, NOT inventory items
{
    const f = mkFrame([
        "Study which spell? ('?' to toggle description)",
        'Human          Name                             Lv Mana Fail Info',
        'Novice         a) Magic Missile                  1    1  16% unknown',
        'Mage           b) Light Room                     1    2  20% unknown',
        'LEVEL      1   c) Find Traps, Doors & Stairs     1    1  14% unknown'
    ], {
        realm: 'angband',
        player: {
            name: 'Tester', hp: 10, hp_max: 10, study: 1,
            inventory: [
                { letter: 'a', name: 'Book of Magic Spells [First Spells]' },
                { letter: 'b', name: 'Ration of Food' },
                { letter: 'c', name: 'Scroll of Word of Recall' }
            ]
        },
        ui: { overlay: 2, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'spell', text: 'study', verb: 'study', src: 'hook' } }
    });
    const m = SC.ScreenModel.of(f, 'angband', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(m.mirror, 'spell', 'Study spell prompt must use mirror=spell');
    assert.strictEqual(m.needsTerminal, false);
    assert.strictEqual(m.items.length, 3);
    assert.strictEqual(m.items[0].name, 'Magic Missile');
    assert.strictEqual(m.items[1].name, 'Light Room');
    const spec = PM.buildSpec(m, f, 'angband');
    assert.strictEqual(spec.mirror, 'spell');
    assert.strictEqual(spec.items[0].name, 'Magic Missile');
    assert.ok(spec.actions.some(a => a.key === '?'), 'Spell spec must surface [?] Descriptions button when header allows it');
}

// 2. Hengband JP spell list & '*' toggle button
{
    const f = mkFrame([
        "(呪文:a-h, '*'で一覧, ESCで中断) どの呪文を学びますか?",
        '人間           名前                    熟練度 Lv   MP 失率 効果',
        '練習生     ##  a) 軽傷の治癒                [初]  1    2  24% 未知',
        'レベル  1  ##  b) 祝福                      [初]  3    4  35% 未知'
    ], {
        realm: 'hengband',
        player: {
            name: 'Tester', hp: 12, hp_max: 12,
            inventory: [{ letter: 'a', name: 'Lv1 生命の魔法書' }]
        },
        ui: { overlay: 1, awaiting_command: false, more: false, context: 'menu' }
    });
    const m = SC.ScreenModel.of(f, 'hengband', { mirror3d: true, lang: 'jp', forceRefresh: true });
    assert.strictEqual(m.mirror, 'spell');
    assert.strictEqual(m.items.length, 2);
    assert.strictEqual(m.items[0].name, '軽傷の治癒');
    const spec = PM.buildSpec(m, f, 'hengband');
    assert.ok(spec.actions.some(a => a.key === '*'), 'Hengband spell prompt must expose [*] Toggle List action');
}

// 3. Equipment slot letter 'a' never collides with inventory slot letter 'a'
{
    const f = mkFrame([
        'Select Item: (Equip: a-p, / for Inven, ESC)',
        'Human        a) Wielding      a Rapier (1d6) (+0,+0)           4.0 lb',
        'Novice       f) Light source  a Wooden Torch (5000 turns)      2.2 lb'
    ], {
        realm: 'angband',
        player: {
            name: 'Tester', hp: 10, hp_max: 10,
            inventory: [{ letter: 'a', name: 'Book of Magic Spells [First Spells]' }],
            equipment: [{ letter: 'a', name: 'Rapier (1d6) (+0,+0)' }, { letter: 'f', name: 'Wooden Torch (5000 turns)' }]
        },
        ui: { overlay: 3, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'item', text: 'Select Item:', verb: '', src: 'hook' } }
    });
    const m = SC.ScreenModel.of(f, 'angband', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(m.mirror, 'item');
    assert.strictEqual(m.items.length, 2);
    assert.strictEqual(m.items[0].name, 'Rapier (1d6) (+0,+0)');
    assert.strictEqual(m.items[1].name, 'Wooden Torch (5000 turns)');
}

// 4. Sil-Q compact Drop/Examine prompts with empty term list never duplicate equip+inven and honor Inven range
{
    const f = mkFrame([
        '(Inven: b-b, * to see, / for Equip, ESC) Drop which item?'
    ], {
        realm: 'silq',
        player: {
            name: 'SilTester', hp: 18, hp_max: 18,
            inventory: [{ letter: 'a', name: 'Fragments of Lembas' }, { letter: 'b', name: 'Wooden Torches' }],
            equipment: [{ letter: 'a', name: 'Curved Sword' }]
        },
        ui: { overlay: 0, awaiting_command: false, more: false, context: 'dungeon' }
    });
    const m = SC.ScreenModel.of(f, 'silq', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(m.mirror, 'item');
    assert.strictEqual(m.items.length, 1);
    assert.strictEqual(m.items[0].letter, 'b');
    assert.strictEqual(m.items[0].name, 'Wooden Torches');
}

// 5. NetHack Engrave prompt routes to mirror='string', and Command-for-item captures {), k), and lore
{
    const fEng = mkFrame([
        'What do you want to engrave on the floor? ([Enter] for "Elbereth", [-] dust)'
    ], {
        realm: 'nethack',
        player: { name: 'NH', hp: 16, hp_max: 16, inventory: [{ letter: 'a', name: 'long sword' }] },
        ui: { overlay: 1, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'string', text: 'What do you want to engrave?', verb: null, src: 'hook' } }
    });
    const mEng = SC.ScreenModel.of(fEng, 'nethack', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(mEng.mirror, 'string', 'Engrave prompt must use mirror=string');

    const fCmd = mkFrame([
        '(Enter to select, ESC) Command for a Book of Magic Spells:',
        'An inheritance from your family                                   I) Inspect',
        'Can be destroyed by fire.                                         b) Browse',
        '                                                                  {) Inscribe',
        '|    ~              #.......###....###..###....###...#........### k) Ignore'
    ], {
        realm: 'angband',
        player: { name: 'Mage', hp: 10, hp_max: 10, inventory: [{ letter: 'a', name: 'Book of Magic Spells' }] },
        ui: { overlay: 2, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'menu', text: '(Enter to select, ESC) Command for a Book of Magic Spells:', verb: '', src: 'row0' } }
    });
    const mCmd = SC.ScreenModel.of(fCmd, 'angband', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(mCmd.mirror, 'item-menu');
    const keys = mCmd.regions.map(r => r.key);
    assert.ok(keys.includes('{') && keys.includes('k'), `Expected { and k actions, got ${JSON.stringify(keys)}`);
    const cmdSpec = PM.buildSpec(mCmd, fCmd, 'angband');
    assert.ok(cmdSpec.desc && cmdSpec.desc.includes('An inheritance from your family'), 'item-menu must preserve item lore');
}

// 6. NetHack spell prompt routes to mirror='spell' and zero-empty-overlay safety opens CRT when items are empty
{
    const fNhSpell = mkFrame([
        'Cast which spell? [a] force bolt [b] healing',
        ' a) force bolt       (Level 1, 2 Pw — Arcane bolt of kinetic force)',
        ' b) healing          (Level 1, 2 Pw — Restores vitality & sight)'
    ], {
        realm: 'nethack',
        player: { name: 'NH', hp: 16, hp_max: 16, inventory: [{ letter: 'a', name: 'long sword' }] },
        ui: { overlay: 3, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'spell', text: 'Cast which spell?', verb: 'cast', src: 'hook' } }
    });
    const mNh = SC.ScreenModel.of(fNhSpell, 'nethack', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(mNh.mirror, 'spell');
    assert.strictEqual(mNh.items.length, 2);
    assert.strictEqual(mNh.items[0].name, 'force bolt');
    assert.strictEqual(mNh.items[1].cost, 2);

    const fEmptyOv = mkFrame(['Use which item?'], {
        realm: 'frogcomposband',
        player: { name: 'FCB', hp: 16, hp_max: 16, inventory: [{ letter: 'a', name: 'Rations' }] },
        ui: { overlay: 1, awaiting_command: false, more: false, context: 'menu' }
    });
    const mEmpty = SC.ScreenModel.of(fEmptyOv, 'frogcomposband', { mirror3d: true, forceRefresh: true });
    assert.strictEqual(mEmpty.mirror, null, 'Empty overlay item prompt must fall back to CRT rather than showing empty box');
    assert.strictEqual(mEmpty.needsTerminal, true);
}

// 7. input.js prompt key forwarding + boot.js & settings-modal.js Prompt Style toggle wiring
{
    const inp = read('server/public/js/input.js');
    assert.ok(inp.includes('if (ui && (!isTopLevelCommandPrompt || isPromptActive) && !e.altKey && !e.metaKey)'), 'input.js must forward keys during 3D prompt overlays before numpad/WASD/camera handlers');
    const boot = read('server/public/js/boot.js');
    assert.ok(boot.includes('window.__setYasdFlag'), 'boot.js must expose __setYasdFlag for live Settings persistence');
    const sm = read('server/public/js/settings-modal.js');
    assert.ok(sm.includes('yasd-set-prompt-style'), 'settings-modal.js must include Prompt & Menu Style selector');
}

console.log('test_v13_3_4_menu_prompts.js: PASS');

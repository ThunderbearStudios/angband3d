#!/usr/bin/env node
/**
 * tools/test_9realm_menu_prompts_e2e.js
 *
 * Live multi-engine end-to-end verification across all 9 realms (+ Hengband JP):
 *   - Spawns isolated stdio engines in temporary save dirs
 *   - Exercises study, spell-cast, browse, equipment, inventory, drop, item-action, engrave, and char-sheet flows
 *   - Verifies Angband Mage Study completes G -> book a -> spell a -> learned Magic Missile (study 1 -> 0) cleanly via 3D PromptMirror
 *   - Asserts zero inventory-for-spell contamination, zero equip-vs-inven collision, zero empty live overlay mirrors
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const SC = require('../server/public/js/screen-context.js');
const PM = require('../server/public/js/prompt-mirror.js');
const { createStdioDriver } = require('./playtest/engine_driver.js');
const { driveBirthToPlay } = require('./playtest/bot/birth_driver.js');

const td = new TextDecoder('shift_jis');

function modelAndSpec(drv, realm, lang) {
    const f = drv.frame;
    const spellsArr = drv.spells && (drv.spells.list || drv.spells.spells || drv.spells);
    global.window = { __app: { lastSpells: Array.isArray(spellsArr) ? spellsArr : null } };
    const decode = lang === 'jp' ? (s) => SC.decodeSjis(s, td) : null;
    const model = SC.ScreenModel.of(f, realm, {
        mirror3d: true, lang, decode,
        hasBridgeSpells: Boolean(Array.isArray(spellsArr) && spellsArr.length),
        forceRefresh: true
    });
    const spec = PM.buildSpec(model, f, realm);
    return { f, model, spec, decode };
}

async function unwindToIdle(drv) {
    for (let u = 0; u < 6; u++) {
        if (drv.frame && drv.frame.ui && drv.frame.ui.awaiting_command && !drv.frame.ui.overlay && !drv.frame.ui.more) break;
        await drv.sendKey(drv.frame && drv.frame.ui && drv.frame.ui.more ? 'space' : 'escape', 5000);
    }
}

async function verifyAngbandMageStudyEndToEnd(tmpBase) {
    const saveDir = path.join(tmpBase, 'angband_mage');
    fs.mkdirSync(saveDir, { recursive: true });
    const drv = await createStdioDriver({ realm: 'angband', lang: 'en', saveDir, user: 'MageE2E' });
    try {
        for (let i = 0; i < 30 && drv.frame && drv.frame.phase !== 'play'; i++) {
            const txt = SC.rawScreenText(drv.frame).toLowerCase();
            if (txt.includes('race affects stats') || txt.includes('choose a race')) await drv.sendKey('a', 5000);
            else if (txt.includes('class affects stats') || txt.includes('choose a class')) await drv.sendKey('b', 5000); // Mage
            else if (txt.includes('press any key') || txt.includes('rephial')) await drv.sendKey('space', 5000);
            else await drv.sendKey('enter', 5000);
        }
        assert.strictEqual(drv.frame.phase, 'play');
        assert.strictEqual(drv.frame.player.class, 'Mage');
        assert.strictEqual(drv.frame.player.study, 1);

        // Step 1: 'G' -> Book choice in 3D PromptMirror
        await drv.sendKey('G', 5000);
        let r1 = modelAndSpec(drv, 'angband', 'en');
        assert.strictEqual(r1.model.mirror, 'item');
        assert.strictEqual(r1.spec.items[0].letter, 'a');
        assert.ok(/Magic Spells/i.test(r1.spec.items[0].name), `Expected book, got ${r1.spec.items[0].name}`);

        // Step 2: 'a' -> Spell choice in 3D PromptMirror ('spell', NOT inventory items!)
        await drv.sendKey('a', 5000);
        let r2 = modelAndSpec(drv, 'angband', 'en');
        assert.strictEqual(r2.model.mirror, 'spell', 'Step 2 must render 3D spell prompt');
        assert.strictEqual(r2.model.needsTerminal, false);
        assert.ok(r2.spec.items.length >= 3, 'Must show full spell list from book');
        assert.strictEqual(r2.spec.items[0].name, 'Magic Missile');
        assert.strictEqual(r2.spec.items[1].name, 'Light Room');
        assert.ok(!r2.spec.items.some(i => /Ration|Torch/i.test(i.name)), 'Inventory items must NEVER leak into spell list');

        // Step 3: '?' toggles descriptions cleanly without leaving PromptMirror
        await drv.sendKey('?', 5000);
        let r2q = modelAndSpec(drv, 'angband', 'en');
        assert.strictEqual(r2q.model.mirror, 'spell');

        // Step 4: 'a' studies Magic Missile -> study count drops 1 -> 0!
        await drv.sendKey('a', 5000);
        assert.strictEqual(drv.frame.ui.awaiting_command, true);
        assert.strictEqual(drv.frame.player.study, 0, 'Magic Missile should be learned immediately');
        assert.ok(/Magic Missile/i.test(SC.rawScreenText(drv.frame)), 'Message should confirm Magic Missile learned');

        // Step 5: 'e' shows actual equipment (Rapier + Torch), NOT inventory Spellbook
        await drv.sendKey('e', 5000);
        let rEq = modelAndSpec(drv, 'angband', 'en');
        assert.strictEqual(rEq.model.mirror, 'item');
        assert.strictEqual(rEq.spec.items[0].letter, 'a');
        assert.ok(/Rapier/i.test(rEq.spec.items[0].name), `Expected Rapier on slot a, got ${rEq.spec.items[0].name}`);

        // Step 6: Esc -> i -> a shows complete Command Menu with Inscribe { and Ignore k and lore
        await unwindToIdle(drv);
        await drv.sendKey('i', 5000);
        await drv.sendKey('a', 5000);
        let rCmd = modelAndSpec(drv, 'angband', 'en');
        assert.strictEqual(rCmd.model.mirror, 'item-menu');
        const cmdKeys = rCmd.spec.items.map(x => x.letter);
        assert.ok(cmdKeys.includes('I') && cmdKeys.includes('b') && cmdKeys.includes('{') && cmdKeys.includes('k'),
            `Expected Inspect/Browse/Inscribe/Ignore in book command menu, got ${JSON.stringify(cmdKeys)}`);
        await unwindToIdle(drv);
        console.log('  [PASS] Angband Mage full Study + Equip + Book Command Menu');
    } finally {
        await drv.close();
    }
}

async function verifyHengbandJpMageStudy(tmpBase) {
    const saveDir = path.join(tmpBase, 'heng_jp_mage');
    fs.mkdirSync(saveDir, { recursive: true });
    const drv = await createStdioDriver({ realm: 'hengband', lang: 'jp', saveDir, user: 'HMageJP' });
    try {
        for (let i = 0; i < 60 && drv.frame && drv.frame.phase !== 'play'; i++) {
            const raw = SC.rawScreenText(drv.frame);
            const txt = (raw + '\n' + SC.decodeSjis(raw, td)).toLowerCase();
            if (txt.includes('smart_learn') || (txt.includes('初期オプション') && txt.includes('esc')) || txt.includes('最低限')) await drv.sendKey('escape', 5000);
            else if (txt.includes('よろしいですか') || txt.includes('[y/n]') || txt.includes('(y/n)')) await drv.sendKey('y', 5000);
            else if (txt.includes('性別を選んで')) await drv.sendKey('a', 5000);
            else if (txt.includes('種族を選んで')) await drv.sendKey('a', 5000);
            else if (txt.includes('職業を選んで')) await drv.sendKey('b', 5000); // Mage
            else if (txt.includes('性格を選んで')) await drv.sendKey('a', 5000);
            else if (txt.includes('魔法領域') || txt.includes('領域を選んで')) await drv.sendKey('a', 5000);
            else await drv.sendKey('enter', 5000);
        }
        assert.strictEqual(drv.frame.phase, 'play');
        await drv.sendKey('G', 5000);
        if (drv.frame.ui.more) await drv.sendKey('space', 5000);
        let rBook = modelAndSpec(drv, 'hengband', 'jp');
        assert.strictEqual(rBook.model.needsTerminal, true, 'Hengband book list without mirrorable rows or command loop stays clean');
        await drv.sendKey('a', 5000);
        let rSpells = modelAndSpec(drv, 'hengband', 'jp');
        assert.strictEqual(rSpells.model.mirror, 'spell', 'Hengband JP spell study list must render mirror=spell');
        assert.ok(rSpells.spec.items.length >= 2 && !/食料|松明/.test(rSpells.spec.items[0].name), 'No JP inventory items in spell list');
        await drv.sendKey('a', 5000);
        assert.strictEqual(drv.frame.ui.awaiting_command, true, 'Hengband JP spell learned cleanly');
        console.log('  [PASS] Hengband JP Mage full Study flow');
    } finally {
        await drv.close();
    }
}

async function verifyAllRealmsSweep(tmpBase) {
    const specs = [
        { realm: 'silq', lang: 'en', keys: [['i'], ['e'], ['w'], ['d'], ['x'], ['@']] },
        { realm: 'frogcomposband', lang: 'en', keys: [['i'], ['e'], ['w'], ['d'], ['C']] },
        { realm: 'hengband', lang: 'en', keys: [['i'], ['e'], ['w'], ['d'], ['C']] },
        { realm: 'nethack', lang: 'en', keys: [['i'], ['['], ['Z'], ['r'], ['w'], ['d'], ['E'], ['C'], ['#']] },
        { realm: 'dcss', lang: 'en', keys: [['i'], ['E'], ['z'], ['M'], ['m'], ['^'], ['w'], ['d'], ['%']] },
        { realm: 'brogue', lang: 'en', keys: [['i'], ['['], ['w'], ['d'], ['a'], ['C']] },
        { realm: 'rogue', lang: 'en', keys: [['i'], ['E'], ['w'], ['d'], ['q'], ['C']] },
        { realm: 'ryod', lang: 'en', keys: [['i'], ['e'], ['m'], ['M'], ['w'], ['d'], ['C']] }
    ];
    for (const sp of specs) {
        const saveDir = path.join(tmpBase, sp.realm + '_' + sp.lang);
        fs.mkdirSync(saveDir, { recursive: true });
        const drv = await createStdioDriver({ realm: sp.realm, lang: sp.lang, saveDir, user: 'M_' + sp.realm });
        try {
            await driveBirthToPlay(drv, { realm: sp.realm, lang: sp.lang });
            for (const seq of sp.keys) {
                for (const k of seq) await drv.sendKey(k, 5000);
                const { f, model, spec, decode } = modelAndSpec(drv, sp.realm, sp.lang);
                const rawRow0 = (f.term?.rows?.[0]?.g || '').trim();
                const row0 = decode ? decode(rawRow0) : rawRow0;
                if (model.mirror && ['item', 'spell', 'item-menu'].includes(model.mirror)) {
                    assert.ok(spec && Array.isArray(spec.items) && spec.items.length > 0,
                        `${sp.realm} [${seq.join('>')}] empty mirror=${model.mirror} row0="${row0}"`);
                }
                if (model.mirror === 'item') {
                    assert.notStrictEqual(model.prompt.kind, 'spell', `${sp.realm} spell prompt leaked to mirror=item`);
                    const letters = spec.items.map(i => i.letter);
                    assert.strictEqual(new Set(letters).size, letters.length,
                        `${sp.realm} [${seq.join('>')}] duplicate item letters ${JSON.stringify(letters)}`);
                }
                if (sp.realm === 'nethack' && seq[0] === 'Z') {
                    assert.strictEqual(model.mirror, 'spell');
                    assert.strictEqual(spec.items[0].name, 'force bolt');
                }
                if (sp.realm === 'nethack' && seq[0] === 'E') {
                    assert.strictEqual(model.mirror, 'string');
                }
                await unwindToIdle(drv);
            }
            console.log(`  [PASS] ${sp.realm} (${sp.lang}) menu invariants`);
        } finally {
            await drv.close();
        }
    }
}

(async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-9r-menus-'));
    try {
        console.log('--- Running 9-Realm Live Menu & Prompt E2E Suite ---');
        await verifyAngbandMageStudyEndToEnd(tmpBase);
        await verifyHengbandJpMageStudy(tmpBase);
        await verifyAllRealmsSweep(tmpBase);
        console.log('test_9realm_menu_prompts_e2e.js: ALL PASS');
    } finally {
        fs.rmSync(tmpBase, { recursive: true, force: true });
    }
})().catch((err) => {
    console.error('FAIL:', err);
    process.exit(1);
});

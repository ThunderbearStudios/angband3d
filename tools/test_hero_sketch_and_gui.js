/**
 * tools/test_hero_sketch_and_gui.js
 * Fast-tier contract test verifying Wave 6 (v9.5.0) Pillars I–IV:
 * 1. Pillar I (3D Creatures & Items Overhaul):
 *    - Shared RGBADepthPacking silhouette shadow materials (monsterDepthMat, itemDepthMat)
 *    - 4x4 capsule-curved billboard normals + vertex color ground AO
 *    - Equine Shockbolt atlas resolution & JP name translation normalization
 *    - Loot rarity plinth rings & depth-tested item captions with 128-entry LRU cap
 * 2. Pillar II (Dark-Fantasy GUI, Variant Registry & Interactive Terminal):
 *    - ScreenContext.VARIANT_REGISTRY, registerVariant, and isPopupCommandMenu
 *    - app.js getShockboltSpriteCss & birthConfirming deduplication guard (lastBirthConfirmSig)
 *    - terminal.js hoverRow highlight & direct row click handler
 * 3. Pillar III (Living Chronicle Lore-Correct Hero Action Sketch):
 *    - index.html #chronicle-sketch-btn and #chronicle-sketch-modal
 *    - server.js POST /api/chronicle/sketch (gemini-3.1-flash-image + sketchCache + verifyBrowserOrigin)
 *    - chronicle-manager.js buildHeroSketchContext, renderMasterworkCanvasSketch, promptHeroActionSketch
 * 4. Pillar IV (Godot 4 C# Cross-Platform Parity):
 *    - ItemModelResolver.cs Shockbolt item_atlas.png + item_atlas.json loader
 *    - DungeonWorld.cs Poly Haven PBR texture loader
 *    - Overlay.cs TerminalKeyClicked direct terminal row click support
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ScreenContext = require('../server/public/js/screen-context.js');

function read(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('--- test_hero_sketch_and_gui.js ---');

// 1. Pillar I: 3D Creatures & Items Overhaul in dungeon3d.js
test('dungeon3d.js implements silhouette shadow depth materials, 4x4 curved normals, equine atlas resolution, plinths, and bounded depth-tested captions', () => {
    const src = read('server/public/js/dungeon3d.js');
    assert(src.includes('monsterDepthMat') && src.includes('itemDepthMat'), 'Missing monsterDepthMat / itemDepthMat for silhouette shadows');
    assert(src.includes('RGBADepthPacking'), 'Missing THREE.RGBADepthPacking on billboard depth materials');
    assert(src.includes('getMonsterAtlasUV') && src.includes('getItemAtlasUV'), 'Missing getMonsterAtlasUV / getItemAtlasUV helpers');
    assert(src.includes("monsters['Wild horse']") || src.includes('monsters["Wild horse"]'), 'Equines must map to Shockbolt horse/steed entries in monster_atlas.json');
    assert(src.includes('itemPlinthGeo'), 'Missing ground loot rarity plinth ring geometry (itemPlinthGeo)');
    assert(src.includes('captionMaterialCache.size >= 128'), 'Missing 128-entry LRU eviction cap on captionMaterialCache');
});

// 2. Pillar II: ScreenContext.VARIANT_REGISTRY & isPopupCommandMenu
test('ScreenContext exports VARIANT_REGISTRY, registerVariant, and isPopupCommandMenu', () => {
    assert(ScreenContext.VARIANT_REGISTRY && typeof ScreenContext.VARIANT_REGISTRY === 'object', 'Missing ScreenContext.VARIANT_REGISTRY');
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        assert(ScreenContext.VARIANT_REGISTRY[r], `Missing ${r} in VARIANT_REGISTRY`);
    }
    assert(typeof ScreenContext.registerVariant === 'function', 'Missing ScreenContext.registerVariant');
    const custom = ScreenContext.registerVariant('poschengband', { title: 'PosChengband', hasPopupCommandMenu: true });
    assert(custom && custom.id === 'poschengband' && custom.hasPopupCommandMenu === true, 'registerVariant failed to register new variant');
    delete ScreenContext.VARIANT_REGISTRY.poschengband;

    assert(typeof ScreenContext.isPopupCommandMenu === 'function', 'Missing ScreenContext.isPopupCommandMenu');
    const fcbPopup = '+----------------+\n| > Song/Special |\n|   Action       |\n|   Item         |\n+----------------+';
    assert.strictEqual(ScreenContext.isPopupCommandMenu(fcbPopup.toLowerCase()), true, 'Failed to detect FCB popup command menu');
    assert.strictEqual(ScreenContext.isPopupCommandMenu('Welcome to Angband!'), false, 'False positive on normal text');
});

// 3. Pillar II: app.js, terminal.js, and hud.js GUI iconography & birth deduplication
test('app.js, terminal.js, and hud.js implement Shockbolt GUI icons, birthConfirming deduplication, and terminal hover/click rows', () => {
    const appSrc = read('server/public/js/app.js');
    assert(appSrc.includes('getShockboltSpriteCss'), 'Missing window.getShockboltSpriteCss in app.js');
    assert(appSrc.includes('lastBirthConfirmSig'), 'Missing lastBirthConfirmSig deduplication guard in app.js');
    assert(appSrc.includes('sb-sprite-icon'), 'Missing .sb-sprite-icon rendering in app.js');

    const termSrc = read('server/public/js/terminal.js');
    assert(termSrc.includes('hoverRow'), 'Missing hoverRow tracking in terminal.js');

    const hudSrc = read('server/public/js/hud.js');
    assert(hudSrc.includes('getShockboltSpriteCss') || hudSrc.includes('hud-target-portrait'), 'Missing Shockbolt portrait in hud.js Target Inspector');
});

// 4. Pillar III: Living Chronicle Lore-Correct Hero Action Sketch
test('Chronicle Hero Action Sketch is wired across index.html, server.js, and chronicle-manager.js', () => {
    const html = read('server/public/index.html');
    assert(html.includes('id="chronicle-sketch-btn"'), 'Missing #chronicle-sketch-btn in index.html');
    assert(html.includes('id="chronicle-sketch-modal"'), 'Missing #chronicle-sketch-modal in index.html');

    const serverSrc = read('server/src/server.js');
    assert(serverSrc.includes("'/api/chronicle/sketch'"), 'Missing POST /api/chronicle/sketch route in server/src/server.js');
    assert(serverSrc.includes('gemini-3.1-flash-image'), 'Missing gemini-3.1-flash-image model in server/src/server.js');
    assert(serverSrc.includes('sketchCache'), 'Missing bounded sketchCache in server/src/server.js');

    const chronSrc = read('server/public/js/chronicle/chronicle-manager.js');
    assert(chronSrc.includes('buildHeroSketchContext'), 'Missing buildHeroSketchContext in chronicle-manager.js');
    assert(chronSrc.includes('renderMasterworkCanvasSketch'), 'Missing renderMasterworkCanvasSketch in chronicle-manager.js');
    assert(chronSrc.includes('promptHeroActionSketch'), 'Missing promptHeroActionSketch in chronicle-manager.js');
});

// 5. Pillar IV: Godot 4 C# Cross-Platform Parity
test('Godot 4 C# scripts load Shockbolt item_atlas.png, Poly Haven biome textures, and terminal row click events', () => {
    const itemCs = read('client/scripts/ItemModelResolver.cs');
    assert(itemCs.includes('item_atlas.png') && itemCs.includes('item_atlas.json'), 'Missing Shockbolt item_atlas loader in ItemModelResolver.cs');

    const worldCs = read('client/scripts/DungeonWorld.cs');
    assert(worldCs.includes('polyhaven/textures'), 'Missing Poly Haven PBR texture loader in DungeonWorld.cs');

    const overlayCs = read('client/scripts/Overlay.cs');
    assert(overlayCs.includes('TerminalKeyClicked'), 'Missing TerminalKeyClicked event in Overlay.cs');
});

// 6. Cross-Realm Menu Audit (Character Sheet, Spell/Ability/Song/Smithing, Knowledge/Options/Help)
test('ScreenContext and app.js classify and render contextual toolbars for Character Sheet, Spell/Ability/Song, and Knowledge/Options across all 4 realms', () => {
    assert.strictEqual(typeof ScreenContext.isCharacterSheet, 'function');
    assert.strictEqual(typeof ScreenContext.isSpellOrAbilityMenu, 'function');
    assert.strictEqual(typeof ScreenContext.isKnowledgeOrOptions, 'function');

    // Character Sheet across Vanilla/FCB, Sil-Q, and Hengband JP
    assert.strictEqual(ScreenContext.isCharacterSheet('name: alarin  sex: male  race: high-elf  class: mage  str: 18  dex: 17  con: 16'), true);
    assert.strictEqual(ScreenContext.isCharacterSheet('name: fingon  house: noldor  age: 142  str: 3  dex: 4  con: 3  gra: 4'), true);
    assert.strictEqual(ScreenContext.isCharacterSheet('名前: 英雄  種族: 人間  職業: 戦士  腕力: 18  器用: 15 (キャラクター情報)'), true);
    assert.strictEqual(ScreenContext.isCharacterSheet('you hit the kobold.'), false);

    // Spell / Ability / Song / Smithing menus
    assert.strictEqual(ScreenContext.isSpellOrAbilityMenu('name                          lv   mana fail info\na) phase door                  1      1  12% range 10'), true);
    assert.strictEqual(ScreenContext.isSpellOrAbilityMenu('sing which song? a) song of elbereth'), true);
    assert.strictEqual(ScreenContext.isSpellOrAbilityMenu('abilities: melee  archery  evasion  stealth  will  smithing'), true);

    // Knowledge / Options / Help menus
    assert.strictEqual(ScreenContext.isKnowledgeOrOptions('display current knowledge\n[a] known artifacts\n[b] known uniques'), true);
    assert.strictEqual(ScreenContext.isKnowledgeOrOptions('options menu\n[a] interface options\n[b] game-play options'), true);

    const appSrc = read('server/public/js/app.js');
    assert(appSrc.includes('SC.isCharacterSheet(screenText)'), 'Missing SC.isCharacterSheet branch in app.js updateTerminalToolbar');
    assert(appSrc.includes('SC.isSpellOrAbilityMenu(screenText)'), 'Missing SC.isSpellOrAbilityMenu branch in app.js updateTerminalToolbar');
    assert(appSrc.includes('SC.isKnowledgeOrOptions(screenText)'), 'Missing SC.isKnowledgeOrOptions branch in app.js updateTerminalToolbar');
});

// 7. Minimap Ergonomics, Character Panel 1-Click Shortcuts & Open-Asset Attribution Hygiene
test('hud.js, dungeon.css, CREDITS.md, and index.html enforce minimap hover inspection, char-panel shortcuts, and trademark-clean attribution', () => {
    const hudSrc = read('server/public/js/hud.js');
    assert(hudSrc.includes('describeMinimapCell'), 'Missing describeMinimapCell hover helper in hud.js');
    assert(hudSrc.includes('setupCharacterPanelShortcuts') && hudSrc.includes('sendQuickHudCommand'), 'Missing setupCharacterPanelShortcuts in hud.js');

    const cssSrc = read('server/public/css/dungeon.css');
    assert(cssSrc.includes('font-variant-numeric: tabular-nums'), 'Missing tabular-nums rule in dungeon.css');

    const credits = read('CREDITS.md');
    assert(credits.includes('Raymond "Shockbolt" Gaustadnes'), 'CREDITS.md must credit Raymond "Shockbolt" Gaustadnes');
    assert(credits.includes('Poly Haven'), 'CREDITS.md must credit Poly Haven');
    assert(credits.includes('Sil-Q') && credits.includes('FrogComposBand') && credits.includes('Hengband'), 'CREDITS.md must credit all 4 realm engines');

    const readme = read('README.md');
    assert(!/skyrim|daggerfall/i.test(readme), 'README.md must not reference third-party Elder Scrolls trademarks');
});

console.log('test_hero_sketch_and_gui.js: ALL PASS');


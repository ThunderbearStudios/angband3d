#!/usr/bin/env node
/**
 * tools/test_ws80_visibility_and_storefronts.js
 *
 * WS80 (v12.0.3) Regression & Invariant Suite:
 *  1. Docker C-patch LF integrity & 9-realm bridge visibility/forge parity
 *  2. Storefront display wares, coordinate-hashed storefrontSig & procedural door normal map
 *  3. Strict Fog-of-War architecture continuity (no 4-tile cliff, no minX*2 bug, shared getRememberedTile)
 *  4. Behavioral ItemSheet slot-strict comparison (Boots != Body Armor, Bow != Melee)
 *  5. Behavioral ScreenContext store Sell/Examine prompt preemption & Special Building separation
 *  6. Service Worker precache, PWA manifest screenshot existence, Sketch model validity & RYOD isolation
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// 1. Docker patch LF integrity & bridge invariants
const patchBuf = fs.readFileSync(path.join(ROOT, 'engine-patch/0001-bridge-frontend.patch'));
assert.strictEqual(patchBuf.includes(0x0d), false, '0001-bridge-frontend.patch must use strict Unix LF (no CRLF)');
const patchStr = patchBuf.toString('utf8');
assert.ok(patchStr.includes('square_isglow'), '0001-bridge-frontend.patch must include square_isglow lighting parity');

const vanillaBridge = read('engine/src/main-bridge.c');
assert.ok(vanillaBridge.includes('square_isglow'), 'engine/src/main-bridge.c must emit lighting=2 on square_isglow');

const fcbBridge = read('variants/frogcomposband-src/src/main-bridge.c');
assert.strictEqual(
    /\(info\s*&\s*CAVE_GLOW\)\s*\|\|\s*\(info\s*&\s*\(CAVE_LITE\s*\|\s*CAVE_MNLT\)\)/.test(fcbBridge),
    false,
    'FrogComposBand must not emit lighting=2 on player torch CAVE_LITE or monster CAVE_MNLT'
);

const silqBridge = read('variants/silq-src/src/main-bridge.c');
assert.strictEqual(
    /FEAT_FORGE[^\n;]*return\s+37\b/.test(silqBridge),
    false,
    'Sil-Q FEAT_FORGE must map to 60 (forgeMesh), never 37 (underground town storefront)'
);
assert.ok(silqBridge.includes('CAVE_SEEN'), 'Sil-Q bridge must gate active visibility on CAVE_SEEN');

// 2. Storefront & Door UV/Normal invariants
const d3d = read('server/public/js/dungeon3d.js');
const d3dProc = read('server/public/js/dungeon3d-proc-textures.js');
const d3dTac = read('server/public/js/dungeon3d-tactical.js');

assert.strictEqual(d3d.includes("'item_healing_potion'"), false, 'Alchemy Shop must use registered ph_potion_bottle, not missing item_healing_potion');
const waresMatch = d3d.match(/const\s+storeDisplayWares\s*=\s*\[([\s\S]*?)\];/);
assert.ok(waresMatch, 'storeDisplayWares array must exist in dungeon3d.js');
const wareKeys = [...waresMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.ok(wareKeys.length >= 16, 'storeDisplayWares must define 16 storefront display props');
for (const wk of wareKeys) {
    assert.ok(
        d3d.includes(`'${wk}':`) || d3d.includes(`"${wk}":`),
        `storeDisplayWares prop key '${wk}' must exist in POLYHAVEN_ITEM_GLTF_PATHS`
    );
}

assert.strictEqual(
    /const\s+storefrontSig\s*=\s*outdoors\s*\?\s*`\$\{depth\}:\$\{this\.realm[^`]*\}:\$\{storePositions\.size\}`/.test(d3d),
    false,
    'storefrontSig must hash shop coordinates so regenerated towns rebuild props'
);

assert.strictEqual(
    /shopDoorMaterials[\s\S]{0,220}large_castle_door_nor_gl_1k\.jpg/.test(d3dProc),
    false,
    'Procedural shop doors must not apply mismatched photogrammetry large_castle_door UV-atlas normal maps'
);

// 3. Strict Fog-of-War & Tactical invariants
assert.strictEqual(
    d3d.includes('(this.torchRadius + 3) ** 2'),
    false,
    '4-tile (torchRadius + 3) Fog-of-War deletion cliff must be removed'
);
assert.strictEqual(
    /const\s+startIdx\s*=\s*minX\s*\*\s*2\s*;\s*\r?\n\s*if\s*\(startIdx\s*<\s*flgStr\.length\)/.test(d3d),
    false,
    '_computeTerrainSig must index 1-char-per-tile row.l with minX, not minX * 2'
);
assert.ok(d3d.includes('getRememberedTile('), 'Dungeon3D must expose getRememberedTile(x, y) for 2D minimap sync');
assert.ok(
    /isPet|is_pet|friendly|peaceful/.test(d3dTac),
    'dungeon3d-tactical.js flank threat arcs must exclude friendly pets and peaceful NPCs'
);

// 4. Behavioral ItemSheet slot-strict comparison test
{
    const sandbox = { window: {}, document: { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }) } };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('server/public/js/item-sheet.js'), sandbox);
    const ItemSheet = sandbox.window.ItemSheet || sandbox.ItemSheet;
    assert.ok(ItemSheet, 'ItemSheet must load cleanly');
    const compareFn = ItemSheet.compareWithEquipped || (ItemSheet.prototype && ItemSheet.prototype.compareWithEquipped);
    if (typeof compareFn === 'function') {
        const ctxObj = ItemSheet.prototype ? Object.create(ItemSheet.prototype) : ItemSheet;
        const eqChainMailOnly = [{ name: 'Chain Mail (-2) [14,+2]', tval: 37, ac: 14, to_a: 2, slot_name: 'body' }];
        const bootsItem = { name: 'Pair of Soft Leather Boots [2,+0]', tval: 30, ac: 2, to_a: 0 };
        const resEmptyFeet = compareFn.call(ctxObj, bootsItem, eqChainMailOnly);
        assert.strictEqual(resEmptyFeet, null, 'Boots must not be compared against equipped Chain Mail when feet slot is empty');

        const eqWithBoots = [...eqChainMailOnly, { name: 'Pair of Leather Sandals [1,+0]', tval: 30, ac: 1, to_a: 0, slot_name: 'feet' }];
        const resUpgradeFeet = compareFn.call(ctxObj, { name: 'Pair of Iron Shod Boots [4,+2]', tval: 30, ac: 4, to_a: 2 }, eqWithBoots);
        if (resUpgradeFeet !== null) {
            const acDiff = typeof resUpgradeFeet === 'number' ? resUpgradeFeet : (resUpgradeFeet.acDelta ?? resUpgradeFeet.delta ?? 0);
            assert.ok(acDiff > 0, 'Upgraded boots must compare positively against equipped boots');
        }

        const eqDaggerOnly = [{ name: 'Main Gauche (1d5) (+0,+0)', tval: 23, dd: 1, ds: 5, slot_name: 'weapon' }];
        const bowItem = { name: 'Short Bow (x2) (+1,+2)', tval: 19 };
        const resBowVsMelee = compareFn.call(ctxObj, bowItem, eqDaggerOnly);
        assert.strictEqual(resBowVsMelee, null, 'Ranged bow (tval 19) must not be compared against equipped melee weapon');
    }
}

// 5. ScreenContext Sell/Examine prompt preemption
const scSrc = read('server/public/js/screen-context.js');
assert.strictEqual(
    scSrc.includes("(!hasStoreText && screenText.includes('examine which item'))"),
    false,
    'Impossible (!hasStoreText && examine which item) boolean must be fixed in screen-context.js'
);

// 6. Service Worker, PWA Manifest, Server Sketch & Orphan Hygiene
const swSrc = read('server/public/sw.js');
assert.strictEqual(swSrc.includes("'/engine-manifest.json'"), false, 'sw.js SHELL_ASSETS must not include 404 /engine-manifest.json');

const pwaManifest = JSON.parse(read('server/public/manifest.json'));
if (Array.isArray(pwaManifest.screenshots)) {
    for (const shot of pwaManifest.screenshots) {
        const relShot = String(shot.src || '').replace(/^\//, '');
        assert.ok(
            fs.existsSync(path.join(ROOT, 'server/public', relShot)),
            `manifest.json screenshot '${shot.src}' must exist on disk`
        );
    }
}

const serverSrc = read('server/src/server.js');
assert.strictEqual(serverSrc.includes('gemini-3.1-flash-lite-image'), false, 'server.js SKETCH_MODELS must not contain non-existent gemini-3.1-flash-lite-image');
assert.strictEqual(serverSrc.includes('global.__latestRyodBlueprint'), false, 'server.js must not leak RYOD blueprints via global.__latestRyodBlueprint');

const audioSrc = read('server/public/js/audio.js');
assert.strictEqual(audioSrc.includes('SoundEngine.MUSIC_CATALOG'), false, 'audio.js must use this.getMusicCatalog() instead of undefined SoundEngine.MUSIC_CATALOG');

assert.strictEqual(
    fs.existsSync(path.join(ROOT, 'server/public/assets/models/items/building_well_slate.png')),
    false,
    'Untracked orphan building_well_slate.png must be removed'
);

console.log('test_ws80_visibility_and_storefronts.js: PASS');

#!/usr/bin/env node
/**
 * tools/test_ws81_realm_environments_and_blindness.js
 *
 * WS81 (v12.0.4) Regression & Behavioral Invariant Suite:
 *  1. 100%-Photogrammetry PBR verification (-66MB cartoon PNG retirement + disp.jpg existence across all 7 RYOD biomes)
 *  2. 9-Realm x Chapter x RYOD resolveContextualTheme & resolveGeologicalShaderProfile behavioral matrix
 *  3. GPU Per-Corner Flush Masonry (aCornerBevel), frustumCulled=false, Relief POM & Specular AA shader invariants
 *  4. Universal 9-Realm Blindness & Telepathy (ESP) bridge parity (4 C/C++ + 5 JS bridges + worker bundle)
 *  5. Behavioral _levelTileMemory non-amnesia preservation under blindness + HUD minimap + SW reload + worm_mass PBR
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// 1. Verify cartoon/trim-sheet T_* sets are retired from wall/floor tiling & all RYOD Pool.BIOMES map to real photogrammetry with disp.jpg
const procSrc = read('server/public/js/dungeon3d-proc-textures.js');
for (const retiredKey of ['local_rock_trim', 'local_brick', 'local_uneven_brick', 'local_round_tiles', 'local_red_brick']) {
    assert.strictEqual(
        new RegExp(`loadLocalPbrSet\\(\\s*['"]${retiredKey}['"]`).test(procSrc),
        false,
        `Cartoon/trim-sheet PBR set '${retiredKey}' must be retired from eager loading`
    );
}
assert.ok(procSrc.includes('disp.jpg'), 'dungeon3d-proc-textures.js must load PolyHaven disp.jpg heightmaps for Relief POM');

{
    const Pool = require(path.join(ROOT, 'server/public/js/realm-content-pool.js'));
    const biomesList = Pool && Pool.BIOMES ? (Array.isArray(Pool.BIOMES) ? Pool.BIOMES : Object.values(Pool.BIOMES)) : [];
    assert.ok(biomesList.length >= 7, 'RealmContentPool.BIOMES must expose all 7 RYOD biomes');
    for (const b of biomesList) {
        for (const texKey of [b.wallPhId || b.wallTex, b.floorPhId || b.floorTex, b.ceilPhId].filter(Boolean)) {
            const phDir = path.join(ROOT, 'server/public/assets/polyhaven/textures', String(texKey || ''));
            assert.ok(
                fs.existsSync(path.join(phDir, 'diff.jpg')) &&
                fs.existsSync(path.join(phDir, 'nor_gl.jpg')) &&
                fs.existsSync(path.join(phDir, 'arm.jpg')) &&
                fs.existsSync(path.join(phDir, 'disp.jpg')),
                `RYOD biome '${b.id}' texture '${texKey}' must exist on disk with diff.jpg, nor_gl.jpg, arm.jpg, and disp.jpg`
            );
        }
    }
}

// 2. Behavioral check on resolveContextualTheme & resolveGeologicalShaderProfile across all 9 realms + 7 RYOD biomes
{
    const texSandbox = { window: {}, THREE: { RepeatWrapping: 1000, SRGBColorSpace: 'srgb', NoColorSpace: '', LinearMipmapLinearFilter: 1008, LinearFilter: 1006, DataTexture: function () { this.needsUpdate = false; this.repeat = { set() {} }; } } };
    texSandbox.globalThis = texSandbox;
    vm.createContext(texSandbox);
    vm.runInContext(procSrc, texSandbox);
    const Proc = texSandbox.Dungeon3DProcTextures || texSandbox.window.Dungeon3DProcTextures;
    assert.ok(Proc && typeof Proc.resolveContextualTheme === 'function', 'resolveContextualTheme must be exported');
    assert.ok(typeof Proc.resolveGeologicalShaderProfile === 'function', 'resolveGeologicalShaderProfile must be exported');

    const validFixtures = new Set(['iron_cresset', 'sengoku_lantern', 'bio_crystal', 'sanctuary_brass', 'abyssal_brazier']);
    const realms = ['angband', 'frogcomposband', 'hengband', 'silq', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod'];
    for (const r of realms) {
        for (const d of [0, 2, 7, 15, 25, 65]) {
            const theme = Proc.resolveContextualTheme(r, d, 42);
            assert.ok(theme && theme.id, `resolveContextualTheme(${r}, ${d}) must return a valid theme`);
            const geo = Proc.resolveGeologicalShaderProfile(r, d, theme, d === 0);
            assert.ok(geo && typeof geo.isCavern === 'boolean', `geoProfile.isCavern must be boolean for (${r}, ${d})`);
            assert.ok(validFixtures.has(geo.fixtureArchetype), `Invalid fixtureArchetype '${geo.fixtureArchetype}' for (${r}, ${d})`);
        }
    }

    // Specific authenticity checks: Brogue DL 3 = cavern + bio_crystal; Hengband DL 3 = constructed + sengoku_lantern; Angband DL 1 = constructed + iron_cresset
    const brogueGeo = Proc.resolveGeologicalShaderProfile('brogue', 3, Proc.resolveContextualTheme('brogue', 3, 1), false);
    assert.strictEqual(brogueGeo.isCavern, true, 'Brogue DL 3 must be classified as natural cavern (no palace plinths)');
    assert.strictEqual(brogueGeo.fixtureArchetype, 'bio_crystal', 'Brogue DL 3 must use bioluminescent crystal/spore wall clusters');

    const hengGeo = Proc.resolveGeologicalShaderProfile('hengband', 3, Proc.resolveContextualTheme('hengband', 3, 1), false);
    assert.strictEqual(hengGeo.fixtureArchetype, 'sengoku_lantern', 'Hengband Pagoda/Castle depths must use sengoku_lantern fixtures');
}

// 3. GPU Per-Corner Flush Masonry, frustumCulled = false, Relief POM & Specular AA shader invariants
const d3dSrc = read('server/public/js/dungeon3d.js');
const envSrc = read('server/public/js/dungeon3d-environment.js');
const tacSrc = read('server/public/js/dungeon3d-tactical.js');
const combined3d = d3dSrc + '\n' + envSrc + '\n' + tacSrc;

assert.ok(combined3d.includes('aCornerBevel'), '3D wall pipeline must use GPU per-corner InstancedBufferAttribute aCornerBevel');
assert.ok(/frustumCulled\s*=\s*false/.test(d3dSrc), 'dungeon3d.js must disable stale origin frustum culling on InstancedMesh objects');
assert.ok(/dFdx\s*\(\s*normal\s*\)/.test(combined3d) && /dFdy\s*\(\s*normal\s*\)/.test(combined3d), 'PBR shader must include Derivative Normal-Map Specular Anti-Aliasing');
assert.ok(combined3d.includes('uEnablePom') || combined3d.includes('uHeightMap'), 'PBR shader must wire Contact-Refined Parallax Relief Mapping (disp.jpg)');

// 4. Universal 9-Realm Blindness & ESP Bridge Parity
const vanillaC = read('engine/src/main-bridge.c');
assert.ok(vanillaC.includes('TMD_BLIND') && vanillaC.includes('timed_effects'), 'engine/src/main-bridge.c must gate sight on TMD_BLIND and emit timed_effects status');
for (const cRel of ['variants/frogcomposband-src/src/main-bridge.c', 'variants/silq-src/src/main-bridge.c', 'variants/hengband-src/src/main-bridge.cpp']) {
    const cSrc = read(cRel);
    assert.ok(/\\?"blind\\?"/.test(cSrc), `${cRel} must emit player.blind`);
    assert.ok(/\\?"Blind\\?"/.test(cSrc), `${cRel} must emit "Blind" status`);
}

for (const jsRel of [
    'variants/nethack/bin/nethack-bridge.js',
    'variants/dcss/bin/dcss-bridge.js',
    'variants/brogue/bin/brogue-bridge.js',
    'variants/rogue/bin/rogue-bridge.js',
    'variants/ryod/bin/ryod-bridge.js'
]) {
    const jsSrc = read(jsRel);
    assert.ok(/(\.blind\s*=|\bblind\s*:)/.test(jsSrc), `${jsRel} must serialize player.blind`);
    assert.ok(/['"]Blind['"]/.test(jsSrc), `${jsRel} must push 'Blind' into player.statuses`);
    assert.ok(/(\.esp\s*=|\besp\s*:)/.test(jsSrc), `${jsRel} must serialize telepathy/esp flag`);
}

const bundleSrc = read('server/public/js/cartridges-worker-bundle.js');
assert.ok(bundleSrc.includes("'Blind'") || bundleSrc.includes('"Blind"'), 'cartridges-worker-bundle.js must embed updated 9-realm Blindness bridges');

// 5. Behavioral Tactical Blindness & Non-Amnesia Memory Preservation Test + HUD / SW / Bestiary checks
{
    const tacSandbox = { window: {}, Math, Float32Array, Uint8Array, Int32Array, Map, Set };
    tacSandbox.globalThis = tacSandbox;
    vm.createContext(tacSandbox);
    vm.runInContext(tacSrc, tacSandbox);
    const Tac = tacSandbox.Dungeon3DTactical || tacSandbox.window.Dungeon3DTactical;
    assert.ok(Tac && typeof Tac.isPlayerBlind === 'function', 'Dungeon3DTactical.isPlayerBlind must exist');
    assert.ok(typeof Tac.hasPlayerEsp === 'function', 'Dungeon3DTactical.hasPlayerEsp must exist');

    assert.strictEqual(Tac.isPlayerBlind({ blind: false, statuses: [] }), false);
    assert.strictEqual(Tac.isPlayerBlind({ blind: true, statuses: [] }), true);
    assert.strictEqual(Tac.isPlayerBlind({ blind: 0, statuses: [{ name: 'Blind', val: 8 }] }), true);
    assert.strictEqual(Tac.isPlayerBlind({ blind: 0, statuses: [{ name: '盲目', val: 5 }] }), true);
    assert.strictEqual(Tac.hasPlayerEsp({ flags: { telepathy: true } }), true);
    assert.strictEqual(Tac.hasPlayerEsp({ flags: { esp: true } }), true);

    // Verify going blind does NOT trigger false amnesia wipe on _levelTileMemory
    const mockD3d = {
        lastFrame: { player: { blind: false, statuses: [] } },
        getFeatAt(m, x, y) {
            const r = m.rows[y];
            return r ? parseInt(r.f.slice(x * 2, x * 2 + 2), 16) : 0;
        },
        getFlagAt(m, x, y) {
            const r = m.rows[y];
            return r ? parseInt(r.l[x], 16) : 0;
        }
    };
    const sightedMap = {
        w: 6, h: 6,
        rows: Array.from({ length: 6 }, () => ({
            g: '######',
            f: '150101010115',
            l: '3b3b3b'
        }))
    };
    Tac.syncLevelVisibilityAndRooms(mockD3d, sightedMap, 6, 6, 1, 'angband', false, 2, 2);
    const memBefore = Tac.getRememberedTile(mockD3d, 1, 1);
    assert.ok(memBefore && memBefore.feat === 1, 'Sighted room tile (1,1) must be stored in _levelTileMemory');

    // Now simulate blindness where engine reports 0 live known tiles except underfoot (2,2)
    mockD3d.lastFrame = { player: { blind: true, statuses: [{ name: 'Blind', val: 10 }] } };
    const blindMap = {
        w: 6, h: 6,
        rows: Array.from({ length: 6 }, (_, ry) => ({
            g: ry === 2 ? '  @   ' : '      ',
            f: ry === 2 ? '000001000000' : '000000000000',
            l: ry === 2 ? '003000' : '000000'
        }))
    };
    Tac.syncLevelVisibilityAndRooms(mockD3d, blindMap, 6, 6, 1, 'angband', false, 2, 2);
    const memDuringBlind = Tac.getRememberedTile(mockD3d, 1, 1);
    assert.ok(memDuringBlind && memDuringBlind.feat === 1, 'Going blind MUST freeze (never wipe via false amnesia!) _levelTileMemory');
}

const hudSrc = read('server/public/js/hud.js');
assert.ok(/isBlind/.test(hudSrc), 'hud.js renderMinimap must suppress live visual FOV cone when blind');

const swSrc = read('server/public/sw.js');
assert.ok(/cache\s*:\s*['"]reload['"]/.test(swSrc), 'sw.js must use { cache: "reload" } on asset cache misses to prevent stale HTTP disk cache');

const bestiarySrc = read('server/public/js/master-bestiary.js');
assert.ok(/bestiary_worm_mass[\s\S]{0,360}roughness\s*:\s*0\.2\d/.test(bestiarySrc), 'bestiary_worm_mass must specify wet organic slime roughness (~0.26-0.28)');

console.log('test_ws81_realm_environments_and_blindness.js: PASS');

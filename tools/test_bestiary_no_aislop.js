#!/usr/bin/env node
/**
 * tools/test_bestiary_no_aislop.js
 *
 * v13.1.0 Regression Gate:
 *  - Verifies zero procedural generators across bestiary GLBs and zero libmeshy/Tripo in upgraded assets
 *  - Verifies <= 512x512 embedded PNG textures across all 29 v13.1.0 upgraded bestiary GLBs
 *  - Verifies Skull.glb (< 1.5 MB), items/staff.glb (< 600 KB), and archive mirror parity
 *  - Verifies MegaKit dungeon props (zero missing texture URIs)
 *  - Verifies grid-free seamless floors, cursor-only range grid, "Curved Sword" -> ph_saber, and zero hover breadcrumbs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const BESTIARY_DIR = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
const ARCHIVE_DIR = path.join(ROOT, 'archive/godot-client-v1/assets/models/monsters/bestiary');
const ITEMS_DIR = path.join(ROOT, 'server/public/assets/models/items');
const PROPS_DIR = path.join(ROOT, 'server/public/assets/models/props');

function parseGlb(buf) {
    assert(buf.length >= 28 && buf.readUInt32LE(0) === 0x46546C67, 'Invalid GLB magic header');
    const jsonLen = buf.readUInt32LE(12);
    assert.strictEqual(buf.readUInt32LE(16), 0x4E4F534A, 'Missing GLB JSON chunk');
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const binOff = 20 + jsonLen + 8;
    return { json, binOff };
}

const UPGRADED_29 = new Set([
    'wolf.glb', 'husky.glb', 'hellhound.glb', 'shiba.glb', 'werewolf.glb',
    'bear.glb', 'bear_armored.glb', 'MountainLion.glb', 'Dragon.glb', 'hydra.glb',
    'cockatrice.glb', 'naga.glb', 'lizard.glb', 'Owl.glb', 'Parrot.glb',
    'Flamingo.glb', 'Stork.glb', 'floating_eye.glb', 'zombie_model.glb',
    'centipede.glb', 'beetle.glb', 'worm_mass.glb', 'jelly_ooze.glb',
    'vortex_elemental.glb', 'treeman.glb', 'aquatic.glb', 'kraken.glb',
    'mushroom_cluster.glb', 'Skull.glb'
]);
const LEGACY_GEN_EXEMPT = new Set(['wasp.glb', 'GhostArmature.glb']);

const glbFiles = fs.readdirSync(BESTIARY_DIR).filter((f) => f.endsWith('.glb'));
assert(glbFiles.length >= 45, `Expected bestiary GLB corpus, found ${glbFiles.length}`);
const hasArchive = fs.existsSync(ARCHIVE_DIR);

for (const file of glbFiles) {
    const p = path.join(BESTIARY_DIR, file);
    const buf = fs.readFileSync(p);
    const { json, binOff } = parseGlb(buf);
    const gen = String((json.asset && json.asset.generator) || '');

    assert(
        !/Bestiary Generator|Dark Bestiary Sculptor|WS79-Builder/i.test(gen),
        `${file} must not use procedural generator "${gen}"`
    );
    if (!LEGACY_GEN_EXEMPT.has(file)) {
        assert(
            !/libmeshy|Tripo/i.test(gen),
            `${file} must not contain AI-slop generator "${gen}"`
        );
    }

    if (hasArchive && (UPGRADED_29.has(file) || file === 'Fox.glb' || file === 'frog.glb')) {
        const archPath = path.join(ARCHIVE_DIR, file);
        assert(fs.existsSync(archPath), `Missing archive mirror for ${file}`);
        assert(buf.equals(fs.readFileSync(archPath)), `Archive mirror byte mismatch for ${file}`);
    }

    if (UPGRADED_29.has(file)) {
        for (const img of (json.images || [])) {
            if (img.bufferView !== undefined && img.mimeType === 'image/png') {
                const bv = json.bufferViews[img.bufferView];
                const s = binOff + (bv.byteOffset || 0);
                if (s + 24 <= buf.length && buf[s] === 0x89 && buf[s + 1] === 0x50) {
                    const w = buf.readUInt32BE(s + 16);
                    const h = buf.readUInt32BE(s + 20);
                    assert(w <= 512 && h <= 512, `${file} embedded PNG exceeds 512x512 (${w}x${h})`);
                }
            }
        }
    }
}

const skullSize = fs.statSync(path.join(BESTIARY_DIR, 'Skull.glb')).size;
assert(skullSize < 1.5 * 1024 * 1024, `Skull.glb must be < 1.5 MB (got ${(skullSize / 1048576).toFixed(2)} MB)`);
const staffSize = fs.statSync(path.join(ITEMS_DIR, 'staff.glb')).size;
assert(staffSize < 600 * 1024, `items/staff.glb must be < 600 KB (got ${(staffSize / 1024).toFixed(0)} KB)`);

for (const propName of ['Barrel.gltf', 'Crate_Wooden.gltf', 'Cage_Small.gltf', 'CandleStick_Triple.gltf']) {
    const propPath = path.join(PROPS_DIR, propName);
    assert(fs.existsSync(propPath), `Missing MegaKit dungeon prop: ${propName}`);
    const pj = JSON.parse(fs.readFileSync(propPath, 'utf8'));
    for (const im of (pj.images || [])) {
        if (im.uri) {
            assert(fs.existsSync(path.join(PROPS_DIR, im.uri)), `${propName} missing referenced texture ${im.uri}`);
        }
    }
}

const d3dSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
assert(d3dSrc.includes('new THREE.PlaneGeometry(this.cellSize, this.cellSize, 2, 2)'), 'floorGeo must use exact this.cellSize abutment (no skirt overlap)');
const floorAoMatch = d3dSrc.match(/function applyFloorVertexAO[\s\S]*?colors\.fill\(1\.0\)/);
assert(Boolean(floorAoMatch), 'applyFloorVertexAO must fill 1.0 (no 2x2 grid border darkening)');
assert(d3dSrc.includes('this.navBreadcrumbsMesh.count = 0') && !d3dSrc.includes('_hoveredTile && path\n'), 'Passive hover must keep navBreadcrumbsMesh.count = 0');

const tacSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-tactical.js'), 'utf8');
assert(/const showRangeGrid = isCursorActive;/.test(tacSrc), 'showRangeGrid must trigger only on active targeting cursor (never || isAlt)');

const MIR = require(path.join(ROOT, 'server/public/js/master-item-registry.js'));
assert.strictEqual(MIR.getItemObjKey({ name: 'Curved Sword', char: ')' }), 'ph_saber', 'Curved Sword must resolve to ph_saber');

console.log(`test_bestiary_no_aislop.js: PASS (${glbFiles.length} GLBs checked, 29 upgraded <=512px PNG, 4 MegaKit props valid)`);

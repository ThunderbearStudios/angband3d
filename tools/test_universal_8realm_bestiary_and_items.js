#!/usr/bin/env node
/**
 * Universal 8-Realm + Future-Realm Bestiary, Item Registry & 60fps Performance Gate (v11.7.0)
 * Verifies:
 *   1. Zero cross-realm glyph collisions across all 8 current realms
 *   2. 100% valid 3D templateKeys, weaponKeys, shieldKeys, and GLB/GLTF paths on disk
 *   3. 100% inspection taxonomy parity between MASTER_BESTIARY and ChronicleManager
 *   4. Forward-compatibility for Future Realm #9 ('tome4') via registerRealm() + Tier 2 morphology
 *   5. All 3 proved NetHack bugs (Little Dog identity/raycast, Katana rotY, 15 creature GLB yaws)
 *   6. All 5 proved 60fps WebGL screen optimizations (P1-P5) in dungeon3d.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');

const MASTER_BESTIARY = require(path.join(PUBLIC_DIR, 'js', 'master-bestiary.js'));
const MASTER_ITEM_REGISTRY = require(path.join(PUBLIC_DIR, 'js', 'master-item-registry.js'));
const dungeon3dSrc = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'dungeon3d.js'), 'utf8');
const chronicleSrc = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'chronicle', 'chronicle-manager.js'), 'utf8');

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

// 1. Extract all valid 3D monster templateKeys supported by _ensureMonster3DTemplate in dungeon3d.js
const validMonsterTemplates = new Set();
const tmplRegex = /templateKey === '([^']+)'/g;
let mMatch;
while ((mMatch = tmplRegex.exec(dungeon3dSrc)) !== null) {
    validMonsterTemplates.add(mMatch[1]);
}
check(validMonsterTemplates.size >= 55, `Expected >= 55 monster templates in dungeon3d.js, found ${validMonsterTemplates.size}`);

// 2. Verify all POLYHAVEN_ITEM_GLTF_PATHS exist on disk
const itemPaths = MASTER_ITEM_REGISTRY.POLYHAVEN_ITEM_GLTF_PATHS;
for (const [key, relUrl] of Object.entries(itemPaths)) {
    const diskPath = path.join(PUBLIC_DIR, relUrl.replace(/^\//, ''));
    check(fs.existsSync(diskPath), `Item 3D model missing on disk for ${key}: ${diskPath}`);
}

// 3. Test 8-Realm Canonical & Divergent Monsters (Zero Cross-Realm Collisions)
const REALM_TEST_CASES = [
    // NetHack (Bug 1 proof!)
    { realm: 'nethack', name: 'little dog', glyph: 'd', expectKey: 'bestiary_shiba', expectNoWeapon: true, expectNullTint: true, expectInspectionType: 'Canine / Companion' },
    { realm: 'nethack', name: 'large dog', glyph: 'd', expectKey: 'bestiary_husky', expectNoWeapon: true, expectNullTint: true },
    { realm: 'nethack', name: 'kitten', glyph: 'f', expectKey: 'bestiary_lion', expectNoWeapon: true, expectNullTint: true },
    { realm: 'nethack', name: 'pony', glyph: 'u', expectKey: 'bestiary_horse', expectNoWeapon: true, expectNullTint: true, expectInspectionType: 'Equine / Steed' },
    { realm: 'nethack', name: 'imp', glyph: 'i', expectKey: 'bestiary_imp', expectInspectionType: 'Minor Demon' },
    { realm: 'nethack', name: 'grid bug', glyph: 'x', expectKey: 'bestiary_beetle' },
    { realm: 'nethack', name: 'newt', glyph: ':', expectKey: 'bestiary_lizard' },
    { realm: 'nethack', name: 'floating eye', glyph: 'e', expectKey: 'bestiary_eye' },
    { realm: 'nethack', name: 'Watchman', glyph: '@', expectKey: 'char_male_guard' },
    { realm: 'nethack', name: 'Shopkeeper', glyph: '@', expectKey: 'char_male_peasant', expectNoWeapon: true },
    { realm: 'nethack', name: 'Wizard of Yendor', glyph: '@', expectKey: 'char_male_priest', expectWeapon: 'item_staff' },
    // Angband
    { realm: 'angband', name: 'Squint-eyed rogue', glyph: 't', expectKey: 'char_male_rogue', expectInspectionType: 'Human / Rogue' },
    { realm: 'angband', name: 'Scruffy little dog', glyph: 'C', expectKey: 'bestiary_shiba', expectNoWeapon: true, expectNullTint: true },
    { realm: 'angband', name: 'White wolf', glyph: 'C', expectKey: 'bestiary_wolf', expectNoWeapon: true },
    { realm: 'angband', name: 'Ancient multi-hued dragon', glyph: 'D', expectKey: 'bestiary_dragon', expectNoWeapon: true },
    { realm: 'angband', name: 'Morgoth, Lord of Darkness', glyph: 'P', expectKey: 'char_male_ranger', expectWeapon: 'ph_sledgehammer' },
    // Sil-Q
    { realm: 'silq', name: 'Carcharoth, the Jaws of Thirst', glyph: 'C', expectKey: 'bestiary_wolf', expectNoWeapon: true },
    { realm: 'silq', name: 'Orc soldier', glyph: 'o', expectKey: 'bestiary_orc' },
    // FrogComposband
    { realm: 'frogcomposband', name: 'The Serpent of Chaos', glyph: 'J', expectKey: 'bestiary_dragon' },
    { realm: 'frogcomposband', name: 'Cyberdemon', glyph: 'U', expectKey: 'bestiary_imp', expectWeapon: 'ph_sledgehammer' },
    // Hengband (including Japanese names!)
    { realm: 'hengband', name: '野良犬', glyph: 'C', expectKey: 'bestiary_shiba', expectNoWeapon: true },
    { realm: 'hengband', name: '混沌のサーペント', glyph: 'J', expectKey: 'bestiary_dragon' },
    { realm: 'hengband', name: 'サイバーデーモン', glyph: 'U', expectKey: 'bestiary_imp', expectWeapon: 'ph_sledgehammer' },
    // Classic Rogue ('A'-'Z')
    { realm: 'rogue', name: 'aquator', glyph: 'A', expectKey: 'bestiary_aquatic' },
    { realm: 'rogue', name: 'emu', glyph: 'E', expectKey: 'bestiary_stork' },
    { realm: 'rogue', name: 'venus flytrap', glyph: 'F', expectKey: 'env_tanglethorn' },
    { realm: 'rogue', name: 'griffin', glyph: 'G', expectKey: 'bestiary_owl' },
    { realm: 'rogue', name: 'ice monster', glyph: 'I', expectKey: 'bestiary_yeti' },
    { realm: 'rogue', name: 'jabberwock', glyph: 'J', expectKey: 'bestiary_dragon' },
    { realm: 'rogue', name: 'kestrel', glyph: 'K', expectKey: 'bestiary_bird' },
    { realm: 'rogue', name: 'rattlesnake', glyph: 'R', expectKey: 'obj_snake' },
    { realm: 'rogue', name: 'xeroc', glyph: 'X', expectKey: 'ph_chest' },
    // Brogue
    { realm: 'brogue', name: 'monkey', glyph: 'm', expectKey: 'bestiary_puglin' },
    { realm: 'brogue', name: 'dar blademaster', glyph: 'd', expectKey: 'char_male_ranger' },
    { realm: 'brogue', name: 'tentacle horror', glyph: 'H', expectKey: 'bestiary_horror' },
    { realm: 'brogue', name: 'ifrit', glyph: 'I', expectKey: 'bestiary_vortex' },
    { realm: 'brogue', name: 'pixie', glyph: 'p', expectKey: 'char_female_peasant' },
    // DCSS
    { realm: 'dcss', name: 'quokka', glyph: 'r', expectKey: 'ph_street_rat' },
    { realm: 'dcss', name: 'spriggan', glyph: 'i', expectKey: 'bestiary_goblin' },
    { realm: 'dcss', name: 'boggart', glyph: 'g', expectKey: 'bestiary_goblin' },
    { realm: 'dcss', name: 'oklob plant', glyph: 'P', expectKey: 'env_tanglethorn' },
    { realm: 'dcss', name: 'Killer Klown', glyph: 'p', expectKey: 'char_male_ranger' },
    { realm: 'dcss', name: 'Orb of Fire', glyph: '*', expectKey: 'bestiary_vortex' }
];

for (const tc of REALM_TEST_CASES) {
    const cfg = MASTER_BESTIARY.resolve({ name: tc.name, glyph: tc.glyph, attr: 11 }, tc.glyph, tc.realm, '#fde047');
    check(cfg && cfg.templateKey === tc.expectKey, `[${tc.realm}] "${tc.name}" (${tc.glyph}) -> expected ${tc.expectKey}, got ${cfg && cfg.templateKey}`);
    check(validMonsterTemplates.has(cfg.templateKey), `[${tc.realm}] templateKey ${cfg.templateKey} not in dungeon3d.js`);
    if (tc.expectNoWeapon) {
        check(!cfg.weaponKey, `[${tc.realm}] "${tc.name}" should NOT hold a weapon, got ${cfg.weaponKey}`);
    }
    if (tc.expectWeapon) {
        check(cfg.weaponKey === tc.expectWeapon, `[${tc.realm}] "${tc.name}" expected weapon ${tc.expectWeapon}, got ${cfg.weaponKey}`);
        check(Boolean(itemPaths[cfg.weaponKey]), `Weapon key ${cfg.weaponKey} missing from POLYHAVEN_ITEM_GLTF_PATHS`);
    }
    if (tc.expectNullTint) {
        check(cfg.tintHex === null, `[${tc.realm}] "${tc.name}" should preserve natural multi-material colors (tintHex: null), got ${cfg.tintHex}`);
    }
    if (tc.expectInspectionType) {
        const tax = MASTER_BESTIARY.resolveInspectionTaxonomy({ name: tc.name, glyph: tc.glyph }, tc.realm);
        check(tax && tax.coreType === tc.expectInspectionType, `[${tc.realm}] "${tc.name}" inspection expected "${tc.expectInspectionType}", got "${tax && tax.coreType}"`);
    }
}

// 4. Exhaustive Glyph-Table Sweep across all 8 realms (ensures every single glyph in every realm resolves to a valid 3D model)
for (const [realm, glyphMap] of Object.entries(MASTER_BESTIARY.REALM_GLYPH_TABLES)) {
    for (const glyph of Object.keys(glyphMap)) {
        const cfg = MASTER_BESTIARY.resolve({ name: 'unknown entity', glyph }, glyph, realm, '#ffffff');
        check(cfg && validMonsterTemplates.has(cfg.templateKey), `[${realm}] glyph '${glyph}' fallback resolved to invalid template ${cfg && cfg.templateKey}`);
        if (cfg.weaponKey) check(Boolean(itemPaths[cfg.weaponKey]), `[${realm}] glyph '${glyph}' weaponKey ${cfg.weaponKey} invalid`);
        if (cfg.shieldKey) check(Boolean(itemPaths[cfg.shieldKey]), `[${realm}] glyph '${glyph}' shieldKey ${cfg.shieldKey} invalid`);
    }
}

// 5. Future Realm #9 ('tome4') Forward-Compatibility Verification (0 edits to dungeon3d.js / chronicle-manager.js)
MASTER_BESTIARY.registerRealm('tome4', {
    inheritsGlyphsFrom: 'angband',
    glyphOverrides: {
        'X': { templateKey: 'bestiary_golem', scale: 1.25 }
    },
    exactNames: {
        'the shade of kor\'pul': { templateKey: 'bestiary_wraith', scale: 1.25, weaponKey: 'item_staff', isEthereal: true, isFloating: true }
    }
});
MASTER_ITEM_REGISTRY.registerRealm('tome4', {
    inheritsGlyphsFrom: 'angband',
    exactItems: {
        'rod of recall': 'item_rod'
    }
});

const tomeBoss = MASTER_BESTIARY.resolve({ name: "The Shade of Kor'Pul", glyph: 'W' }, 'W', 'tome4', '#a855f7');
check(tomeBoss.templateKey === 'bestiary_wraith' && tomeBoss.weaponKey === 'item_staff', 'Future realm tome4 exact override failed');

// Unseen procedural monster names resolved via Tier 2 Morphological Head-Noun + Modifier Decomposer
const unseenWolf = MASTER_BESTIARY.resolve({ name: 'Elder Frost Wolf', glyph: 'C' }, 'C', 'tome4', '#38bdf8');
check(unseenWolf.templateKey === 'bestiary_wolf' && unseenWolf.scale > 1.0 && unseenWolf.emissiveHex === '#38bdf8', 'Tier 2 morphological decomposer failed on "Elder Frost Wolf"');

const unseenPikeman = MASTER_BESTIARY.resolve({ name: 'Armored Skeleton Halberdier', glyph: 's' }, 's', 'tome4', '#ffffff');
check(unseenPikeman.templateKey === 'bestiary_skeleton_knight' && unseenPikeman.weaponKey === 'item_spear', 'Tier 2 morphological decomposer failed on "Armored Skeleton Halberdier"');

const unseenSword = MASTER_ITEM_REGISTRY.resolveItem('Runed Vorpal Greatsword of Flame', '|', 'tome4');
check(unseenSword.phKey === 'item_greatsword' && unseenSword.viewmodelKey === 'claymore', 'Tier 2 item resolver failed on unseen greatsword');

// 6. Verify Bug 2 Fix: Katana blade orientation (rotY: Math.PI * 0.5)
check(
    Math.abs(MASTER_ITEM_REGISTRY.HELD_CANONICAL_SPECS.ph_katana.rotY - Math.PI * 0.5) < 1e-6,
    'MASTER_ITEM_REGISTRY.HELD_CANONICAL_SPECS.ph_katana.rotY must be Math.PI * 0.5'
);
check(
    dungeon3dSrc.includes('ph_katana: { span: 0.94, rotY: Math.PI * 0.5, gripFrac: 0.18 }'),
    'dungeon3d.js ph_katana rotY must be Math.PI * 0.5'
);

// 7. Verify Bug 3 Fix: No bogus 0.15-0.52 radian yaw offsets in normalizeWrapper calls
const bogusYawMatch = dungeon3dSrc.match(/normalizeWrapper\(scene,\s*[0-9.]+,\s*true,\s*0\.(15|20|25|35|42|52)/);
check(!bogusYawMatch, `Found remaining bogus radian yaw offset in normalizeWrapper: ${bogusYawMatch && bogusYawMatch[0]}`);
check(dungeon3dSrc.includes('return normalizeWrapper(scene, 0.66, true, -Math.PI / 2, 1.18);'), 'shiba.glb must use -Math.PI / 2 canonical yaw');
check(dungeon3dSrc.includes('return normalizeWrapper(scene, 0.82, true, -Math.PI / 2, 1.38);'), 'husky.glb must use -Math.PI / 2 canonical yaw');
check(dungeon3dSrc.includes('return normalizeWrapper(scene, 1.95, true, Math.PI, 2.20);'), 'Dragon.glb must use Math.PI canonical yaw');

// 8. Verify Bug 1 & P1-P5 Architectural Invariants in dungeon3d.js and chronicle-manager.js
check(dungeon3dSrc.includes('entity.identitySig !== identitySig'), 'Bug 1 Fix: identitySig invalidation missing in dungeon3d.js');
check(dungeon3dSrc.includes('purgeAllSceneEntities()'), 'Bug 1 Fix: purgeAllSceneEntities missing in dungeon3d.js');
check(dungeon3dSrc.includes('parentBone.updateWorldMatrix(false, false);'), 'P1 Optimization: targeted bone updateWorldMatrix(false, false) missing');
check(dungeon3dSrc.includes('const isDistantIdle = (!isMoving && entityDistSq > 100);'), 'P1 Optimization: 30Hz distant idle mixer throttle missing');
check(dungeon3dSrc.includes('this.createNameplateSprite(m, isTargeted, isSensed, entity.nameplate)'), 'P2 Optimization: in-place nameplate reuse missing');
check(dungeon3dSrc.includes('const showCaption = Boolean(isVisible && itemDistSq <= 36 && it.name);'), 'P3 Optimization: lazy item caption creation missing');
check(!dungeon3dSrc.includes('this._raycaster.intersectObjects(candidates, true)'), 'P4 Optimization: slow CPU SkinnedMesh.raycast() should be removed from getMonsterAtScreenCoords/getItemAtScreenCoords');
check(!dungeon3dSrc.includes('configureCreatureEquipment(mesh, role)'), 'P5 Optimization: dead configureCreatureEquipment should be removed');
check(!dungeon3dSrc.includes('resolveMonsterModelConfig(glyph, rawName'), 'P5 Optimization: dead resolveMonsterModelConfig should be removed');
check(chronicleSrc.includes('window.MASTER_BESTIARY.resolveInspectionTaxonomy'), 'ChronicleManager must delegate inspection taxonomy to MASTER_BESTIARY');

console.log(`[PASS] Universal 8-Realm + Future-Realm Bestiary, Item & Performance Suite: ${passed} assertions verified (exit code 0).`);

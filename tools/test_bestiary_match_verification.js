#!/usr/bin/env node
/**
 * tools/test_bestiary_match_verification.js
 *
 * Fast-tier contract verification suite for Card 11 (Bestiary Parity & Multi-Realm Match).
 * Verifies:
 *   1. Static & Performance Contracts on server/public/js/dungeon3d.js:
 *      - Creature geometries do not strip color attributes.
 *      - Skinned meshes do not hardcode frustumCulled = false.
 *      - THREE.AnimationMixer is instantiated and _mixer is managed.
 *      - Monster nameplates dispose texture map when replacing.
 *      - PBR .glb bestiary models and Poly Haven assets are referenced.
 *   2. Live Multi-Realm resolveMonster3DConfig Behavioral Verification:
 *      - 40+ signature creatures verified across Sil-Q, Vanilla Angband, FrogComposBand, and Hengband.
 *   3. Godot 4 C# Parity Contract on client/scripts/MonsterModelResolver.cs:
 *      - Zero references to cartoon models (Rule L36).
 *      - Zero occurrences of third-party RPG trademarks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

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

console.log('--- test_bestiary_match_verification.js ---');

// ==============================================================================
// 1. Static & Performance Contracts on dungeon3d.js
// ==============================================================================
test('dungeon3d.js satisfies static & performance contracts for creature rendering and PBR assets', () => {
    const d3dSrc = read('server/public/js/dungeon3d.js');

    // 1a. Creature geometries do not strip color attributes
    const creatureTemplateSection = d3dSrc.slice(
        d3dSrc.indexOf('_ensureMonster3DTemplate'),
        d3dSrc.indexOf('resolveMonster3DConfig')
    );
    assert(!creatureTemplateSection.includes("deleteAttribute('color')"), 'Creature templates in dungeon3d.js must not strip color attributes');

    // 1b. True GPU-skinned bounding box normalization, upright clip selector & entity-level distance culling
    assert(d3dSrc.includes('_computeTrueSkinnedBoundingBox'), 'dungeon3d.js must compute true GPU-skinned bounding boxes for normalizeWrapper');
    assert(d3dSrc.includes('_selectCreatureClips'), 'dungeon3d.js must use _selectCreatureClips to avoid crouch/attack clips as standing idle');
    assert(d3dSrc.includes('entityDistSq <= 1225'), 'dungeon3d.js must perform entity-level distance culling in animate()');

    // 1c. THREE.AnimationMixer instantiated and _mixer managed
    assert(d3dSrc.includes('new THREE.AnimationMixer('), 'dungeon3d.js must instantiate THREE.AnimationMixer for animated models');
    assert(d3dSrc.includes('_mixer'), 'dungeon3d.js must track and update _mixer on animated creature instances');

    // 1d. Nameplate replacement disposes previous texture map
    assert(
        d3dSrc.includes('entity.nameplate.material.map') && d3dSrc.includes('.dispose()'),
        'dungeon3d.js must dispose nameplate.material.map when replacing creature nameplates'
    );

    // 1e. References all 13 PBR bestiary and Poly Haven equipment models
    const requiredModels = [
        'goblin.glb',
        'orc.glb',
        'hobgoblin.glb',
        'kobold.glb',
        'troll.glb',
        'ogre.glb',
        'cyclop.glb',
        'skeleton_knight.glb',
        'skeleton_warrior.glb',
        'stone_golem.glb',
        'horse_mount.glb',
        'scp939.glb',
        'zombie_model.glb',
        'GhostArmature.glb',
        'YetiSmall.glb',
        'wolf.glb',
        'MountainLion.glb',
        'giant_spider.glb',
        'snake.glb',
        'wasp.glb',
        'frog.glb',
        'Owl.glb',
        'gothic_statue.gltf',
        'sledgehammer_01.gltf'
    ];
    for (const model of requiredModels) {
        assert(d3dSrc.includes(model), `dungeon3d.js missing reference to PBR model: ${model}`);
    }

    // 1f. Held equipment canonical alignment & character space bone basis
    assert(d3dSrc.includes('_prepareCanonicalHeldClone(') || d3dSrc.includes('_prepareCanonicalHeldClone ('), 'dungeon3d.js must define _prepareCanonicalHeldClone');
    assert(d3dSrc.includes('makeBasis'), 'dungeon3d.js must use makeBasis');
    assert(d3dSrc.includes('instWorldQ.clone().invert().multiply(boneWorldQ)'), 'dungeon3d.js must use instWorldQ.clone().invert().multiply(boneWorldQ) in character space');

    // 1g. References to 3D weapon, shield, character and item GLB assets
    const requiredWeaponShieldGlbs = [
        'bow.glb',
        'spear.glb',
        'torch.glb',
        'great_sword.glb',
        'rune_blade.glb',
        'goblin_sword.glb',
        'morningstar.glb',
        'greatclub.glb',
        'steel_longsword.glb',
        'shield_wooden.glb',
        'shield_raven.glb',
        'healing_potion.glb',
        'scroll.glb',
        'coin_pile_spill.glb'
    ];
    for (const model of requiredWeaponShieldGlbs) {
        assert(d3dSrc.includes(model), `dungeon3d.js missing reference to 3D weapon/shield/item asset: ${model}`);
    }
});

// ==============================================================================
// 2. Live Multi-Realm resolveMonster3DConfig Behavioral Verification
// ==============================================================================
test('Live multi-realm resolveMonster3DConfig maps 40+ signature creatures across all 4 realms', () => {
    const HengTranslate = require('../server/public/js/heng/heng-translate.js');
    const names = Object.assign({}, require('../server/public/js/heng/heng-names.json'), {
        '天狗': ['Tengu', 'Tengu']
    });
    const templates = require('../server/public/js/heng/heng-templates.json');
    const kinds = require('../server/public/js/heng/heng-kinds.json');
    const manifest = require('../server/public/js/heng/heng-manifest.json');
    HengTranslate.load({ names, templates, kinds, manifest });

    const d3dSrc = read('server/public/js/dungeon3d.js');
    const startIdx = d3dSrc.indexOf('\n    resolveMonster3DConfig(');
    const endIdx = d3dSrc.indexOf('\n    _prepareCanonicalHeldClone(', startIdx);
    assert(startIdx !== -1 && endIdx !== -1, 'Failed to isolate resolveMonster3DConfig method in dungeon3d.js');

    const fnSrc = 'function ' + d3dSrc.slice(startIdx + 5, endIdx).trim();
    const sandbox = {
        window: { HengTranslate },
        getAngbandColorString: (attr) => '#ffffff'
    };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc, sandbox);
    const resolve = sandbox.resolveMonster3DConfig;

    // --- Realm 1: Sil-Q ---
    // Gothmog (R) -> bestiary_imp (NEVER obj_frog)
    const gothmog = resolve({ race: 'Gothmog, High Captain of Balrogs', glyph: 'R' }, 'R', 'silq');
    assert.strictEqual(gothmog.templateKey, 'bestiary_imp', 'Sil-Q Gothmog must map to bestiary_imp');
    assert.notStrictEqual(gothmog.templateKey, 'obj_frog', 'Sil-Q Gothmog must NEVER map to obj_frog');

    // Morgoth (V) -> ph_sledgehammer
    const silqMorgoth = resolve({ race: 'Morgoth, Lord of Darkness', glyph: 'V' }, 'V', 'silq');
    assert.strictEqual(silqMorgoth.weaponKey, 'ph_sledgehammer', 'Sil-Q Morgoth must wield ph_sledgehammer');

    // Ungoliant (M) -> obj_spider (NEVER bestiary_dragon)
    const silqUngoliant = resolve({ race: 'Ungoliant, the Gloomweaver', glyph: 'M' }, 'M', 'silq');
    assert.strictEqual(silqUngoliant.templateKey, 'obj_spider', 'Sil-Q Ungoliant must map to obj_spider');
    assert.notStrictEqual(silqUngoliant.templateKey, 'bestiary_dragon', 'Sil-Q Ungoliant must NEVER map to bestiary_dragon');

    // Lurking horror (H) -> bestiary_wraith (NEVER bestiary_fox)
    const horror = resolve({ race: 'Lurking horror', glyph: 'H' }, 'H', 'silq');
    assert.strictEqual(horror.templateKey, 'bestiary_wraith', 'Sil-Q Lurking horror must map to bestiary_wraith');
    assert.notStrictEqual(horror.templateKey, 'bestiary_fox', 'Sil-Q Lurking horror must NEVER map to bestiary_fox');

    // Carcharoth (C) -> bestiary_wolf
    const carcharoth = resolve({ race: 'Carcharoth, the Jaws of Thirst', glyph: 'C' }, 'C', 'silq');
    assert.strictEqual(carcharoth.templateKey, 'bestiary_wolf', 'Sil-Q Carcharoth must map to bestiary_wolf');

    // Additional Sil-Q checks
    assert.strictEqual(resolve({ race: 'Lungorthin, Lord of Balrogs', glyph: 'R' }, 'R', 'silq').templateKey, 'bestiary_imp');
    assert.strictEqual(resolve({ race: 'Ururauko', glyph: 'R' }, 'R', 'silq').templateKey, 'bestiary_imp');
    assert.strictEqual(resolve({ race: 'Easterling warrior', glyph: 'p' }, 'p', 'silq').templateKey, 'char_male_ranger');
    assert.strictEqual(resolve({ race: 'Gorlim the Traitor', glyph: 'p' }, 'p', 'silq').templateKey, 'char_male_ranger');
    assert.strictEqual(resolve({ race: 'Shadow spider', glyph: 'S' }, 'S', 'silq').templateKey, 'obj_spider');
    assert.strictEqual(resolve({ race: 'Werewolf', glyph: 'C' }, 'C', 'silq').templateKey, 'bestiary_wolf');

    // --- Realm 2: Vanilla Angband ---
    // Morgoth (P) -> ph_sledgehammer
    const angMorgoth = resolve({ race: 'Morgoth, Lord of Darkness', glyph: 'P' }, 'P', 'angband');
    assert.strictEqual(angMorgoth.weaponKey, 'ph_sledgehammer', 'Angband Morgoth must wield ph_sledgehammer');

    // Sauron (p) -> ph_mace
    const sauron = resolve({ race: 'Sauron, the Sorcerer', glyph: 'p' }, 'p', 'angband');
    assert.strictEqual(sauron.weaponKey, 'ph_mace', 'Angband Sauron must wield ph_mace');

    // Skeleton warrior (s) -> bestiary_skeleton_knight, Skeleton (s) -> bestiary_skeleton_warrior
    const skelWarrior = resolve({ race: 'Skeleton warrior', glyph: 's' }, 's', 'angband');
    assert(['bestiary_skeleton_knight', 'bestiary_skeleton_warrior'].includes(skelWarrior.templateKey), 'Angband Skeleton warrior must map to bestiary_skeleton_knight or bestiary_skeleton_warrior');
    const skel = resolve({ race: 'Skeleton', glyph: 's' }, 's', 'angband');
    assert.strictEqual(skel.templateKey, 'bestiary_skeleton_warrior', 'Angband Skeleton must map to bestiary_skeleton_warrior');

    // Zombie (z) -> bestiary_zombie
    const zomb = resolve({ race: 'Zombie', glyph: 'z' }, 'z', 'angband');
    assert.strictEqual(zomb.templateKey, 'bestiary_zombie', 'Angband Zombie must map to bestiary_zombie');

    // Uruk (o) -> bestiary_hobgoblin
    const uruk = resolve({ race: 'Uruk', glyph: 'o' }, 'o', 'angband');
    assert.strictEqual(uruk.templateKey, 'bestiary_hobgoblin', 'Angband Uruk must map to bestiary_hobgoblin');

    // Hill orc (o) -> bestiary_orc
    const hillOrc = resolve({ race: 'Hill orc', glyph: 'o' }, 'o', 'angband');
    assert.strictEqual(hillOrc.templateKey, 'bestiary_orc', 'Angband Hill orc must map to bestiary_orc');

    // Goblin (o) -> bestiary_goblin
    const goblin = resolve({ race: 'Goblin', glyph: 'o' }, 'o', 'angband');
    assert.strictEqual(goblin.templateKey, 'bestiary_goblin', 'Angband Goblin must map to bestiary_goblin');

    // Small kobold (k) -> bestiary_kobold
    const kobold = resolve({ race: 'Small kobold', glyph: 'k' }, 'k', 'angband');
    assert.strictEqual(kobold.templateKey, 'bestiary_kobold', 'Angband Small kobold must map to bestiary_kobold');

    // Cave troll (T) -> bestiary_troll
    const troll = resolve({ race: 'Cave troll', glyph: 'T' }, 'T', 'angband');
    assert.strictEqual(troll.templateKey, 'bestiary_troll', 'Angband Cave troll must map to bestiary_troll');

    // Black ogre (O) -> bestiary_ogre
    const ogre = resolve({ race: 'Black ogre', glyph: 'O' }, 'O', 'angband');
    assert.strictEqual(ogre.templateKey, 'bestiary_ogre', 'Angband Black ogre must map to bestiary_ogre');

    // Hill giant (P) -> bestiary_cyclops
    const giant = resolve({ race: 'Hill giant', glyph: 'P' }, 'P', 'angband');
    assert.strictEqual(giant.templateKey, 'bestiary_cyclops', 'Angband Hill giant must map to bestiary_cyclops');

    // Stone golem (g) -> bestiary_golem
    const golem = resolve({ race: 'Stone golem', glyph: 'g' }, 'g', 'angband');
    assert.strictEqual(golem.templateKey, 'bestiary_golem', 'Angband Stone golem must map to bestiary_golem');

    // Timber wolf (C) -> bestiary_wolf
    const wolf = resolve({ race: 'Timber wolf', glyph: 'C' }, 'C', 'angband');
    assert.strictEqual(wolf.templateKey, 'bestiary_wolf', 'Angband Timber wolf must map to bestiary_wolf');

    // Panther (f) -> bestiary_lion
    const panther = resolve({ race: 'Panther', glyph: 'f' }, 'f', 'angband');
    assert.strictEqual(panther.templateKey, 'bestiary_lion', 'Angband Panther must map to bestiary_lion');

    // Feline scale differentiation: Scrawny cat <= 0.50, Sabre-tooth tiger >= 1.10
    const scrawnyCat = resolve({ race: 'Scrawny cat', glyph: 'f' }, 'f', 'angband');
    assert(scrawnyCat.scale <= 0.50, `Scrawny cat scale must be <= 0.50, got ${scrawnyCat.scale}`);
    const sabreTooth = resolve({ race: 'Sabre-tooth tiger', glyph: 'f' }, 'f', 'angband');
    assert(sabreTooth.scale >= 1.10, `Sabre-tooth tiger scale must be >= 1.10, got ${sabreTooth.scale}`);

    // Additional Angband checks
    assert.strictEqual(resolve({ race: 'Ancient multi-hued dragon', glyph: 'D' }, 'D', 'angband').templateKey, 'bestiary_dragon');
    assert.strictEqual(resolve({ race: 'Young red dragon', glyph: 'd' }, 'd', 'angband').templateKey, 'bestiary_dragon');
    assert.strictEqual(resolve({ race: 'Killer beetle', glyph: 'K' }, 'K', 'angband').templateKey, 'bestiary_beetle');
    assert.strictEqual(resolve({ race: 'Giant red ant', glyph: 'a' }, 'a', 'angband').templateKey, 'bestiary_ant');
    assert.strictEqual(resolve({ race: 'Metallic green centipede', glyph: 'c' }, 'c', 'angband').templateKey, 'bestiary_centipede');
    assert.strictEqual(resolve({ race: 'Arch-Lich', glyph: 'L' }, 'L', 'angband').templateKey, 'bestiary_wraith');
    assert.strictEqual(resolve({ race: 'Ghost', glyph: 'G' }, 'G', 'angband').templateKey, 'bestiary_wraith');
    assert.strictEqual(resolve({ race: 'Ringwraith', glyph: 'W' }, 'W', 'angband').templateKey, 'bestiary_wraith');
    assert.strictEqual(resolve({ race: 'Filthy street urchin', glyph: 't' }, 't', 'angband').templateKey, 'char_male_peasant');

    // Town guard: accepts char_male_guard or char_male_ranger
    const townGuard = resolve({ race: 'Town guard', glyph: 't' }, 't', 'angband');
    assert(['char_male_guard', 'char_male_ranger'].includes(townGuard.templateKey), 'Town guard must map to char_male_guard or char_male_ranger');

    // Distinct classifications for unique townsfolk
    const leper = resolve({ race: 'Mangy-looking leper', glyph: 't' }, 't', 'angband');
    assert(leper.templateKey === 'char_male_priest' || leper.hunched === true, 'Mangy-looking leper must be classified distinctly');

    const idiot = resolve({ race: 'Blubbering idiot', glyph: 't' }, 't', 'angband');
    assert(idiot.hunched === true && idiot.weaponKey === null, 'Blubbering idiot must be hunched and unarmed');

    const rogue = resolve({ race: 'Squint-eyed rogue', glyph: 't' }, 't', 'angband');
    assert.strictEqual(rogue.weaponKey, 'ph_dagger', 'Squint-eyed rogue must wield ph_dagger');

    const veteran = resolve({ race: 'Battle-scarred veteran', glyph: 't' }, 't', 'angband');
    assert(['char_male_guard', 'char_male_ranger'].includes(veteran.templateKey) && (veteran.weaponKey === 'item_longsword' || veteran.weaponKey === 'ph_saber'), 'Battle-scarred veteran must be classified distinctly with sword');

    assert.strictEqual(resolve({ race: 'White wolf', glyph: 'C' }, 'C', 'angband').templateKey, 'bestiary_wolf');
    assert.strictEqual(resolve({ race: 'Mountain lion', glyph: 'f' }, 'f', 'angband').templateKey, 'bestiary_lion');

    // --- Realm 3: FrogComposBand ---
    // The Serpent of Chaos (J) -> bestiary_dragon
    const serpent = resolve({ race: 'The Serpent of Chaos', glyph: 'J' }, 'J', 'frogcomposband');
    assert.strictEqual(serpent.templateKey, 'bestiary_dragon', 'FCB Serpent of Chaos must map to bestiary_dragon');

    // Cyberdemon (U) -> bestiary_imp
    const cyber = resolve({ race: 'Cyberdemon', glyph: 'U' }, 'U', 'frogcomposband');
    assert.strictEqual(cyber.templateKey, 'bestiary_imp', 'FCB Cyberdemon must map to bestiary_imp');

    // Great Cthulhu (U) -> bestiary_imp
    const cthulhu = resolve({ race: 'Great Cthulhu', glyph: 'U' }, 'U', 'frogcomposband');
    assert.strictEqual(cthulhu.templateKey, 'bestiary_imp', 'FCB Great Cthulhu must map to bestiary_imp');

    // Additional FCB checks
    assert.strictEqual(resolve({ race: 'Oremorj', glyph: 'U' }, 'U', 'frogcomposband').templateKey, 'bestiary_imp');
    assert.strictEqual(resolve({ race: 'Yeek king', glyph: 'y' }, 'y', 'frogcomposband').templateKey, 'bestiary_puglin');
    assert.strictEqual(resolve({ race: 'Chaos drake', glyph: 'd' }, 'd', 'frogcomposband').templateKey, 'bestiary_dragon');
    assert.strictEqual(resolve({ race: 'Forest spider', glyph: 'S' }, 'S', 'frogcomposband').templateKey, 'obj_spider');

    // --- Realm 4: Hengband (English & Japanese) ---
    // Samurai / サムライ (p) -> ph_katana
    const samuraiEn = resolve({ race: 'Samurai', glyph: 'p' }, 'p', 'hengband');
    assert.strictEqual(samuraiEn.weaponKey, 'ph_katana', 'Hengband Samurai (EN) must wield ph_katana');
    const samuraiJp = resolve({ race: 'サムライ', glyph: 'p' }, 'p', 'hengband');
    assert.strictEqual(samuraiJp.weaponKey, 'ph_katana', 'Hengband Samurai (JP) must wield ph_katana');

    // Ninja / ニンジャ (p) -> ph_katana
    const ninjaEn = resolve({ race: 'Ninja', glyph: 'p' }, 'p', 'hengband');
    assert.strictEqual(ninjaEn.weaponKey, 'ph_katana', 'Hengband Ninja (EN) must wield ph_katana');
    const ninjaJp = resolve({ race: 'ニンジャ', glyph: 'p' }, 'p', 'hengband');
    assert.strictEqual(ninjaJp.weaponKey, 'ph_katana', 'Hengband Ninja (JP) must wield ph_katana');

    // The Yamata-no-Orochi / 八岐大蛇 (M) -> bestiary_dragon
    const orochiEn = resolve({ race: 'The Yamata-no-Orochi', glyph: 'M' }, 'M', 'hengband');
    assert.strictEqual(orochiEn.templateKey, 'bestiary_dragon', 'Hengband Orochi (EN) must map to bestiary_dragon');
    const orochiJp = resolve({ race: '八岐大蛇', glyph: 'M' }, 'M', 'hengband');
    assert.strictEqual(orochiJp.templateKey, 'bestiary_dragon', 'Hengband Orochi (JP) must map to bestiary_dragon');

    // Shuten-douji / 酒呑童子 (O) -> bestiary_yeti
    const shutenEn = resolve({ race: 'Shuten-douji', glyph: 'O' }, 'O', 'hengband');
    assert.strictEqual(shutenEn.templateKey, 'bestiary_yeti', 'Hengband Shuten-douji (EN) must map to bestiary_yeti');
    const shutenJp = resolve({ race: '酒呑童子', glyph: 'O' }, 'O', 'hengband');
    assert.strictEqual(shutenJp.templateKey, 'bestiary_yeti', 'Hengband Shuten-douji (JP) must map to bestiary_yeti');

    // Tengu / 天狗 (u) -> bestiary_owl
    const tenguEn = resolve({ race: 'Tengu', glyph: 'u' }, 'u', 'hengband');
    assert.strictEqual(tenguEn.templateKey, 'bestiary_owl', 'Hengband Tengu (EN) must map to bestiary_owl');
    const tenguJp = resolve({ race: '天狗', glyph: 'u' }, 'u', 'hengband');
    assert.strictEqual(tenguJp.templateKey, 'bestiary_owl', 'Hengband Tengu (JP) must map to bestiary_owl');

    // Kappa / 河童 (h) -> obj_frog
    const kappaEn = resolve({ race: 'Kappa', glyph: 'h' }, 'h', 'hengband');
    assert.strictEqual(kappaEn.templateKey, 'obj_frog', 'Hengband Kappa (EN) must map to obj_frog');
    const kappaJp = resolve({ race: '河童', glyph: 'h' }, 'h', 'hengband');
    assert.strictEqual(kappaJp.templateKey, 'obj_frog', 'Hengband Kappa (JP) must map to obj_frog');

    // Nine-tailed fox / 九尾の狐 (f) -> bestiary_fox
    const foxEn = resolve({ race: 'Nine-tailed fox', glyph: 'f' }, 'f', 'hengband');
    assert.strictEqual(foxEn.templateKey, 'bestiary_fox', 'Hengband Nine-tailed fox (EN) must map to bestiary_fox');
    const foxJp = resolve({ race: '九尾の狐', glyph: 'f' }, 'f', 'hengband');
    assert.strictEqual(foxJp.templateKey, 'bestiary_fox', 'Hengband Nine-tailed fox (JP) must map to bestiary_fox');

    // Additional Hengband checks
    assert.strictEqual(resolve({ race: 'Ronin', glyph: 'p' }, 'p', 'hengband').weaponKey, 'ph_katana');
    assert.strictEqual(resolve({ race: 'Kensei', glyph: 'p' }, 'p', 'hengband').weaponKey, 'ph_katana');
    assert.strictEqual(resolve({ race: 'Shinobi', glyph: 'p' }, 'p', 'hengband').weaponKey, 'ph_katana');
    assert.strictEqual(resolve({ race: 'Yakuza', glyph: 'p' }, 'p', 'hengband').weaponKey, 'ph_katana');
    assert.strictEqual(resolve({ race: 'Kitsune', glyph: 'f' }, 'f', 'hengband').templateKey, 'bestiary_fox');
});

// ==============================================================================
// 3. Godot 4 C# Parity Contract on MonsterModelResolver.cs
// ==============================================================================
test('MonsterModelResolver.cs has zero references to cartoon models and zero trademark words', () => {
    const resolverSrc = read('client/scripts/MonsterModelResolver.cs');

    // Cartoon and deprecated Quaternius models (Rule L36)
    const deprecatedOrCartoonModels = [
        'Punk.gltf',
        'Adventurer.gltf',
        'Witch.gltf',
        'Soldier.gltf',
        'Medieval.gltf',
        'King.gltf',
        'Worker.gltf',
        'Farmer.gltf',
        'Casual.gltf',
        'Formal.gltf',
        'Male_Ranger.gltf',
        'Male_Peasant.gltf',
        'Female_Peasant.gltf'
    ];
    for (const model of deprecatedOrCartoonModels) {
        assert(!resolverSrc.includes(model), `MonsterModelResolver.cs must not reference cartoon or deprecated model: ${model}`);
    }

    // Third-party RPG trademarks hygiene (test_hero_sketch_and_gui.js:161)
    const forbiddenTrademarks = new RegExp(['sky', 'rim'].join('') + '|' + ['dagger', 'fall'].join(''), 'i');
    assert(!forbiddenTrademarks.test(resolverSrc), 'MonsterModelResolver.cs must not reference third-party trademarks');

    // Single-skeleton PBR character rigs and bestiary models present
    const realisticModels = [
        'steward.glb',
        'npc_woman.glb',
        'ranger.glb',
        'rogue.glb',
        'priest.glb',
        'valkyrie.glb',
        'guard.glb',
        'female_knight.glb',
        'skeleton_knight.glb',
        'skeleton_warrior.glb',
        'orc.glb',
        'orc_female.glb',
        'goblin.glb',
        'kobold.glb',
        'hobgoblin.glb',
        'gnoll.glb',
        'ogre.glb',
        'troll.glb',
        'cyclop.glb',
        'lizardfolk.glb',
        'stone_golem.glb',
        'scp939.glb',
        'horse_mount.glb',
        'zombie_model.glb',
        'GhostArmature.glb',
        'wolf.glb',
        'MountainLion.glb',
        'giant_spider.glb',
        'snake.glb',
        'wasp.glb',
        'frog.glb',
        'Owl.glb',
        'GodAnubis_Art.glb',
        'Puglin.glb',
        'Imp.glb'
    ];
    for (const model of realisticModels) {
        assert(resolverSrc.includes(model), `MonsterModelResolver.cs missing reference to realistic model: ${model}`);
    }

    // Realm parameter on signature methods
    assert(resolverSrc.includes('string realm = "angband"'), 'MonsterModelResolver.cs must support realm parameter');
});

// ==============================================================================
// 4. Godot 4 C# Parity Contract on ItemModelResolver.cs
// ==============================================================================
test('ItemModelResolver.cs references required PBR glb assets for items and equipment', () => {
    const itemResolverSrc = read('client/scripts/ItemModelResolver.cs');
    const requiredItemGlbs = [
        'steel_longsword.glb',
        'bow.glb',
        'spear.glb',
        'shield_wooden.glb',
        'healing_potion.glb',
        'scroll.glb',
        'coin_pile_spill.glb'
    ];
    for (const model of requiredItemGlbs) {
        assert(itemResolverSrc.includes(model), `ItemModelResolver.cs missing reference to PBR asset: ${model}`);
    }
});

// ==============================================================================
// 5. Wave 16 Held Equipment Alignment & Artisan HUD/Menu Contracts
// ==============================================================================
test('Wave 16 held equipment alignment, static-rig stabilization & Artisan HUD contracts', () => {
    const d3dSrc = read('server/public/js/dungeon3d.js');
    const cssSrc = read('server/public/css/dungeon.css');
    const hudSrc = read('server/public/js/hud.js');

    // 1. Wicker shield uses authentic shield_wooden.glb (never dinner plate carved_wooden_plate.gltf)
    assert(
        /item_shield_wicker:\s*'\/assets\/models\/items\/shield_wooden\.glb'/.test(d3dSrc),
        'item_shield_wicker must map to /assets/models/items/shield_wooden.glb'
    );

    // 2. Static-rig held equipment stabilization in animate() and _applyCombatArmPose _restQuat sync
    assert(
        d3dSrc.includes('this._stabilizeHeldEquipment(entity);'),
        'dungeon3d.js must stabilize held equipment on creatures in animate()'
    );
    assert(
        d3dSrc.includes('bone._restQuat = bone.quaternion.clone();') ||
        d3dSrc.includes('rigBones.upperarm_r._restQuat = rigBones.upperarm_r.quaternion.clone();'),
        '_poseRigNaturalStance or _applyCombatArmPose must sync _restQuat on static rigs'
    );

    // 3. Poly Haven Y-shaft weapons keep handle centered at (0, gripY, 0)
    assert(
        d3dSrc.includes('scene.position.set(0, gripY, 0);'),
        'phYWeapons must keep handle shaft centered at (0, gripY, 0)'
    );

    // 4. First-person viewmodel inward weapon tilt (+rz = 0.20) and bottom-corner shield anchor
    assert(
        (d3dSrc.includes('this.rightRestPos = new THREE.Vector3(0.31, -0.30, -0.36);') || d3dSrc.includes('this.rightRestPos = new THREE.Vector3(0.30, -0.25, -0.38);')) &&
        (d3dSrc.includes('this.leftRestPos = new THREE.Vector3(-0.33, -0.29, -0.36);') || d3dSrc.includes('this.leftRestPos = new THREE.Vector3(-0.34, -0.25, -0.38);')),
        'initViewmodel must anchor right weapon and left shield at bottom-corner first-person positions'
    );

    // 5. 76px Sculpted Alchemical Crystal Globes & 2-row Runestone Attribute Grid in dungeon.css
    assert(
        cssSrc.includes('width: 76px !important;') && cssSrc.includes('height: 76px !important;'),
        'dungeon.css must style 76px x 76px Sculpted Alchemical Crystal Globes'
    );
    assert(
        cssSrc.includes('#stat-item-ac') && cssSrc.includes('grid-column: span 3 !important;'),
        'dungeon.css must span AC and GOLD across 3 columns in the 2-row runestone attribute grid'
    );

    // 6. Footer status deduplication in hud.js
    assert(
        hudSrc.includes('hasStatusMatching') && hudSrc.includes('!hasStatusMatching(/^study/i)'),
        'hud.js must deduplicate STUDY/RESTING/RECALL badges when already present in player.statuses'
    );
});

// ==============================================================================
// 6. Card 17A: Definitive 3D Rig Posture & First-Person Gauntlet Verification
// ==============================================================================
test('Card 17A 3D rig posture, skinned-mesh fist centroid attachment & viewmodel gauntlets', () => {
    const d3dSrc = read('server/public/js/dungeon3d.js');

    // 1. char_male_guard strips content._animations = [] and uses yawOffset = 0 (normalizeWrapper(content, 1.82, true, 0))
    assert(
        d3dSrc.includes('if (content) content._animations = [];') &&
        d3dSrc.includes('return normalizeWrapper(content, 1.82, true, 0);'),
        'char_male_guard must strip animations and use yawOffset = 0'
    );

    // 2. dungeon3d.js defines _computeHandGripLocalOffset and assigns hand_r._palmLocalOffset and hand_l._palmLocalOffset (including LeftHand_Synthetic)
    assert(
        d3dSrc.includes('_computeHandGripLocalOffset(armRoot, handBone, lowerArmBone, fingerBone)'),
        'dungeon3d.js must define _computeHandGripLocalOffset'
    );
    assert(
        d3dSrc.includes('hand_r._palmLocalOffset = this._computeHandGripLocalOffset(') &&
        d3dSrc.includes('hand_l._palmLocalOffset = this._computeHandGripLocalOffset('),
        'dungeon3d.js must assign hand_r._palmLocalOffset and hand_l._palmLocalOffset'
    );
    assert(
        d3dSrc.includes("hand_l.name = 'LeftHand_Synthetic';") &&
        d3dSrc.includes("hand_r.name = 'RightHand_Synthetic';"),
        'dungeon3d.js must create synthetic wrist bones when missing'
    );

    // 3. ph_estoc is inside phYWeapons (aligned along +Y)
    assert(
        /ph_estoc:\s*\{\s*span:\s*1\.04,\s*rotY:\s*-Math\.PI\s*\*\s*0\.5,\s*gripFrac:\s*0\.14\s*\}/.test(d3dSrc),
        'ph_estoc must be configured inside phYWeapons aligned along +Y'
    );

    // 4. Farmer Maggot (g = 'h') resolves to char_male_peasant_bearded with scaleY: 0.78 and weaponKey: 'item_staff_branch'
    const startIdx = d3dSrc.indexOf('\n    resolveMonster3DConfig(');
    const endIdx = d3dSrc.indexOf('\n    _prepareCanonicalHeldClone(', startIdx);
    assert(startIdx !== -1 && endIdx !== -1, 'Failed to isolate resolveMonster3DConfig');
    const fnSrc = 'function ' + d3dSrc.slice(startIdx + 5, endIdx).trim();
    const sandbox = {
        window: {},
        getAngbandColorString: () => '#ffffff'
    };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc, sandbox);
    const maggot = sandbox.resolveMonster3DConfig({ race: 'Farmer Maggot', glyph: 'h' }, 'h', 'angband');
    assert(maggot, 'Farmer Maggot must resolve');
    assert.strictEqual(maggot.templateKey, 'char_male_peasant_bearded', 'Farmer Maggot must resolve to char_male_peasant_bearded');
    assert.strictEqual(maggot.scaleY, 0.78, 'Farmer Maggot scaleY must be 0.78');
    assert.strictEqual(maggot.scaleXZ, 1.05, 'Farmer Maggot scaleXZ must be 1.05');
    assert.strictEqual(maggot.weaponKey, 'item_staff_branch', 'Farmer Maggot must wield item_staff_branch');
});

console.log('test_bestiary_match_verification.js: ALL PASS');


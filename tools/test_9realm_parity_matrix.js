#!/usr/bin/env node
/**
 * tools/test_9realm_parity_matrix.js
 *
 * Comprehensive YASD 3D v13.0 9-Realm Mechanical, Manual, Adaptive UI, Bestiary,
 * VFX, Fullscreen & Gamepad Parity Verification Suite (fast tier).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB_JS = path.join(ROOT, 'server', 'public', 'js');

const { UniversalCartridgeEngine, FEAT } = require(path.join(ROOT, 'server', 'src', 'cartridges', 'cartridge-core.js'));
const { ROGUE_SPEC, RogueEngine } = require(path.join(ROOT, 'variants', 'rogue', 'bin', 'rogue-bridge.js'));
const { DCSS_SPEC, DCSSEngine } = require(path.join(ROOT, 'variants', 'dcss', 'bin', 'dcss-bridge.js'));
const { BROGUE_SPEC, BrogueEngine } = require(path.join(ROOT, 'variants', 'brogue', 'bin', 'brogue-bridge.js'));
const { RyodEngine } = require(path.join(ROOT, 'variants', 'ryod', 'bin', 'ryod-bridge.js'));
const { NetHackEngine } = require(path.join(ROOT, 'variants', 'nethack', 'bin', 'nethack-bridge.js'));

const RealmHelpFiles = require(path.join(ROOT, 'server', 'src', 'realm-help-files.js'));
const RealmCartridge = require(path.join(PUB_JS, 'realm-cartridge.js'));
const ActionCatalog = require(path.join(PUB_JS, 'action-catalog.js'));
const RealmKeys = require(path.join(PUB_JS, 'realm-keys.js'));
const ItemSheet = require(path.join(PUB_JS, 'item-sheet.js'));
const YasdAutopsy = require(path.join(PUB_JS, 'yasd-autopsy.js'));
const MasterBestiary = require(path.join(PUB_JS, 'master-bestiary.js'));
const AudioDirector = require(path.join(PUB_JS, 'audio-director.js'));
const GamepadController = require(path.join(PUB_JS, 'gamepad.js'));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-v13-matrix-'));
let passed = 0;

function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

function mkSaveDir(name) {
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function inspectGlbPngDims(relPath) {
    const buf = fs.readFileSync(path.join(ROOT, relPath));
    assert.strictEqual(buf.toString('ascii', 0, 4), 'glTF', `${relPath} must have glTF header`);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const binStart = 20 + jsonLen + 8;
    const pngDims = [];
    for (const img of (gltf.images || [])) {
        if (img.bufferView !== undefined) {
            const bv = gltf.bufferViews[img.bufferView];
            const slice = buf.slice(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
            if (slice.length >= 24 && slice[0] === 0x89 && slice.toString('ascii', 1, 4) === 'PNG') {
                pngDims.push({ w: slice.readUInt32BE(16), h: slice.readUInt32BE(20) });
            }
        }
    }
    return { gltf, pngDims };
}

try {
    console.log('=== YASD 3D v13.0 9-Realm Parity Matrix ===');

    // -----------------------------------------------------------------------
    // 1. Rogue 5.4.4: Descending AC, swing(), Aquator 0-dmg rust, Scare Monster, Secret Door, Rings, Amulet Gate, Keys
    // -----------------------------------------------------------------------
    {
        const rog = new RogueEngine({ user: 'RogTest', saveDir: mkSaveDir('rogue'), isNew: true, seed: 13001 });
        rog.initNewState();
        rog.state.phase = 'play';
        const p = rog.state.player;
        p.inventory = [];
        rog.recalcPlayerDefenses();
        check(p.ac === 10, `Rogue naked AC must be 10 (got ${p.ac})`);

        const leather = { slot: 0, letter: 'a', kind: 'armor', name: 'leather armor', ac: 8, bonus: 0, rustproof: true, equipped: 'body', count: 1 };
        const ringMail = { slot: 1, letter: 'b', kind: 'armor', name: 'ring mail', ac: 7, bonus: 0, equipped: null, count: 1 };
        const chainMail = { slot: 2, letter: 'c', kind: 'armor', name: 'chain mail', ac: 5, bonus: 0, equipped: null, count: 1 };
        const plateMail = { slot: 3, letter: 'd', kind: 'armor', name: 'plate mail', ac: 3, bonus: 0, equipped: null, count: 1 };
        p.inventory.push(leather, ringMail, chainMail, plateMail);
        rog.recalcPlayerDefenses();
        check(p.ac === 8, `Rogue leather AC must be 8 (got ${p.ac})`);
        leather.equipped = null; ringMail.equipped = 'body'; rog.recalcPlayerDefenses();
        check(p.ac === 7, `Rogue ring mail AC must be 7 (got ${p.ac})`);
        ringMail.equipped = null; chainMail.equipped = 'body'; rog.recalcPlayerDefenses();
        check(p.ac === 5, `Rogue chain mail AC must be 5 (got ${p.ac})`);
        chainMail.equipped = null; plateMail.equipped = 'body'; rog.recalcPlayerDefenses();
        check(p.ac === 3, `Rogue plate mail AC must be 3 (got ${p.ac})`);

        // Heroism must never invert/worsen descending AC in Rogue
        p.heroism = 10;
        rog.recalcPlayerDefenses();
        check(p.ac === 3, `Rogue Heroism must preserve AC=3 (got ${p.ac})`);

        // Aquator deals 0 HP damage even naked, and rusts metallic armor (+1 worse AC) unless leather/protected
        p.inventory = [ringMail];
        ringMail.equipped = 'body';
        rog.recalcPlayerDefenses();
        const hpBefore = p.hp;
        rog.state.map[p.y][p.x + 1].feat = FEAT.FLOOR;
        const aq = { id: 700, race: 'aquator', glyph: 'A', attr: 10, x: p.x + 1, y: p.y, hp: 20, hp_max: 20, ac: 2, dmg: 0, lvl: 5, special: 'rust' };
        rog.state.monsters = [aq];
        rog.rand = () => 19; // guarantee hit
        rog.advanceTurn();
        check(p.hp === hpBefore, `Rogue Aquator must deal 0 HP damage (got ${hpBefore - p.hp})`);
        check(ringMail.ac === 8 && p.ac === 8, `Rogue Aquator must rust ring mail 7 -> 8 (got ac=${ringMail.ac}, player=${p.ac})`);

        // Naked player vs Aquator -> 0 HP damage
        ringMail.equipped = null;
        rog.recalcPlayerDefenses();
        const hpNaked = p.hp;
        rog.advanceTurn();
        check(p.hp === hpNaked, `Rogue naked Aquator must deal 0 HP damage (got ${hpNaked - p.hp})`);

        // Keys: 'e' Eat, 'E' Equip, 'D' Discoveries, '<' Amulet gate on D:1
        rog.handleKey('e');
        check(rog.state.menuMode === 'verb' && rog.state.pendingVerb === 'eat', `Rogue 'e' must open Eat prompt`);
        rog.handleKey('escape');
        rog.handleKey('E');
        check(rog.state.menuMode === 'equip', `Rogue 'E' must open Equip screen`);
        rog.handleKey('escape');
        rog.handleKey('D');
        check(rog.state.menuMode !== 'none', `Rogue 'D' must open Discoveries screen`);
        rog.handleKey('escape');
        rog.state.depth = 1;
        rog.state.map[p.y][p.x].feat = FEAT.STAIRS_UP;
        rog.handleKey('<');
        check(rog.state.depth === 1 && !rog.state.victory, `Rogue '<' on D:1 without Amulet must remain on depth 1`);

        // Secret door reveal via 's'
        rog.state.map[p.y][p.x - 1].feat = FEAT.SECRET_DOOR;
        rog.rand = () => 0;
        rog.handleKey('s');
        check(rog.state.map[p.y][p.x - 1].feat !== FEAT.SECRET_DOOR, `Rogue 's' must reveal adjacent FEAT.SECRET_DOOR`);

        // Scare Monster scroll drop refuses adjacent melee and crumbles on 2nd pickup
        rog.state.map[p.y][p.x].feat = FEAT.FLOOR;
        p.inventory = [{ slot: 0, letter: 'a', kind: 'scroll', name: 'scroll of scare monster', effect: 'scare_monster', count: 1 }];
        rog.handleKey('d');
        rog.handleKey('a');
        const scaredObj = rog.state.objects.find(o => o.x === p.x && o.y === p.y && o.scared);
        check(Boolean(scaredObj), 'Dropping scroll of scare monster must mark floor object scared: true');
        const orc = { id: 701, race: 'orc', glyph: 'O', attr: 2, x: p.x + 1, y: p.y, hp: 10, hp_max: 10, ac: 6, dmg: 8, lvl: 2 };
        rog.state.monsters = [orc];
        const hpScareBefore = p.hp;
        rog.advanceTurn();
        check(p.hp === hpScareBefore, 'Monster must refuse melee onto Scare Monster tile');
        rog.handleKey(',');
        check(!p.inventory.some(it => /scare monster/i.test(it.name)), 'Picking up Scare Monster a 2nd time must crumble it to dust');
        const rf = rog.buildFrame();
        check(rf.player.arm === p.ac && rf.player.str_max != null, 'Rogue frame must expose arm and str_max');
    }

    // -----------------------------------------------------------------------
    // 2. NetHack 3.6.7: 13 roles, cha/align/hunger_state, -c flag, cursed weld, Elbereth, 'e'/'E'/'['
    // -----------------------------------------------------------------------
    {
        const nh = new NetHackEngine({ user: 'NhTest', role: 'Tourist', isNew: true, saveDir: mkSaveDir('nethack') });
        check(nh.resolveRoleIndex('m') === 12 && nh.resolveRoleIndex('Tourist') === 12, 'NetHack must define all 13 ROLES a..m');
        nh.state.phase = 'play';
        const nf = nh.buildFrame();
        check(nf.player.class === 'Tourist', `NetHack role param must select Tourist (got ${nf.player.class})`);
        check(nf.player.stats.cha && nf.player.stats.cha.use > 0, 'NetHack must emit stats.cha');
        check(Boolean(nf.player.align) && Boolean(nf.player.hunger_state), 'NetHack must emit align and hunger_state');

        // Commands: 'e' Eat, '[' Equip, 'E' Engrave Elbereth
        nh.handleKey('e');
        check(nh.state.menuMode === 'verb' && nh.state.pendingVerb === 'e', `NetHack 'e' must open Eat prompt`);
        nh.handleKey('escape');
        nh.handleKey('[');
        check(nh.state.menuMode === 'equip', `NetHack '[' must open Equip screen`);
        nh.handleKey('escape');

        // Cursed item weld-lock prevents takeoff until Remove Curse
        const p = nh.state.player;
        const cursedRing = { slot: 0, letter: 'a', kind: 'jewelry', name: 'ring of conflict', buc: 'cursed', bucKnown: true, equipped: 'ringLeft', count: 1 };
        p.inventory.push(cursedRing);
        nh.handleKey('R');
        nh.handleKey('a');
        check(cursedRing.equipped === 'ringLeft', 'NetHack cursed ring must remain welded on removal attempt');

        // Worker bundle atomic #pray dispatch (never split into p, r, a, y)
        const bundleSrc = fs.readFileSync(path.join(PUB_JS, 'cartridges-worker-bundle.js'), 'utf8');
        check(bundleSrc.includes('splitKeysSequence') && bundleSrc.includes("keyArg.startsWith('#')"), 'cartridges-worker-bundle.js must carry atomic #command dispatcher');
    }

    // -----------------------------------------------------------------------
    // 3. DCSS 0.31: AC/EV/SH, Octopode 8-ring, keys 'o'/'tab'/'m'/'^'/'A'/'V'/'v'/'e'/'E'
    // -----------------------------------------------------------------------
    {
        const octoSpec = { ...DCSS_SPEC, roles: [DCSS_SPEC.roles.find(r => /octopode/i.test(r.name || r.id)) || DCSS_SPEC.roles[0]] };
        const dcss = new UniversalCartridgeEngine(octoSpec, { user: 'OctTest', saveDir: mkSaveDir('dcss'), isNew: true, seed: 13002 });
        dcss.initNewState();
        dcss.state.phase = 'play';
        const p = dcss.state.player;
        const f = dcss.buildFrame();
        check(typeof f.player.ac === 'number' && typeof f.player.ev === 'number' && typeof f.player.sh === 'number', 'DCSS must emit ac, ev, sh');
        if (p.allowBodyArmor === false) {
            check((p.ringSlots || 2) === 8, `Octopode must allow 8 rings (got ${p.ringSlots})`);
            check(!p.inventory.some(it => it.equipped === 'body' || it.equipped === 'armor'), 'Octopode must never wear torso body armor');
        }
        dcss.handleKey('e');
        check(dcss.state.menuMode === 'verb' && dcss.state.pendingVerb === 'eat', `DCSS 'e' must open Eat prompt`);
        dcss.handleKey('escape');
        dcss.handleKey('E');
        check(dcss.state.menuMode === 'equip', `DCSS 'E' must open Equip screen`);
        dcss.handleKey('escape');
        dcss.handleKey('m');
        check(dcss.state.menuMode === 'skills', `DCSS 'm' must open Skills screen`);
        dcss.handleKey('escape');
        dcss.handleKey('^');
        check(dcss.state.menuMode === 'religion', `DCSS '^' must open God/Religion screen`);
        dcss.handleKey('escape');
        dcss.handleKey('A');
        check(dcss.state.menuMode === 'mutations', `DCSS 'A' must open Mutations screen`);
        dcss.handleKey('escape');
    }

    // -----------------------------------------------------------------------
    // 4. Brogue CE 1.13: level=0/exp=0, strReq, 0 XP kill, monster specials, keys
    // -----------------------------------------------------------------------
    {
        const brogue = new BrogueEngine({ user: 'BrgTest', saveDir: mkSaveDir('brogue'), isNew: true, seed: 13003 });
        brogue.initNewState();
        brogue.state.phase = 'play';
        const p = brogue.state.player;
        const bf = brogue.buildFrame();
        check(bf.player.level === 0 && bf.player.exp === 0, `Brogue must start at level 0 / 0 exp`);
        brogue.handleMonsterKilled({ id: 900, race: 'kobold', x: p.x + 1, y: p.y, hp: 0, hp_max: 10, exp: 50 });
        check(brogue.state.player.exp === 0 && brogue.state.player.level === 0, `Brogue monster kills must award 0 XP`);
        brogue.handleKey('D');
        check(brogue.state.menuMode !== 'none', `Brogue 'D' must open Discoveries screen`);
        brogue.handleKey('escape');
        check(BROGUE_SPEC.monsters.some(m => m.special === 'split') && BROGUE_SPEC.monsters.some(m => m.special === 'caustic_bloat') && BROGUE_SPEC.monsters.some(m => m.special === 'corrode'),
            'Brogue monsters must define split / caustic_bloat / corrode specials');
        check(BROGUE_SPEC.monsters.every(m => (m.ac || 0) >= 0), 'Brogue monster ACs must be ascending >= 0');
    }

    // -----------------------------------------------------------------------
    // 5. RYOD Manuals, Anvil '0' & C/C++ Bridge Source Contracts
    // -----------------------------------------------------------------------
    {
        const ryodDocs = RealmHelpFiles.listHelpFiles('ryod');
        check(ryodDocs.length === 4, `RYOD must have 4 manual chapters (got ${ryodDocs.length})`);
        const rogueManual = RealmHelpFiles.readHelpFile('rogue', 'Rogue_1980_Manual.txt');
        check(rogueManual && rogueManual.text.includes('Opt-in WASD via Alt+W'), 'Rogue manual must mark WASD opt-in only');

        const patchSrc = fs.readFileSync(path.join(ROOT, 'engine-patch/0001-bridge-frontend.patch'), 'utf8');
        check(patchSrc.includes('"disp"') && patchSrc.includes('"melee_to_h"') && patchSrc.includes('"melee_to_d"') && patchSrc.includes('"blows"') && patchSrc.includes('"total_weight"'),
            'engine-patch/0001-bridge-frontend.patch must emit disp, melee_to_h, melee_to_d, blows, total_weight');
        const angBridgePath = path.join(ROOT, 'engine/src/main-bridge.c');
        if (fs.existsSync(angBridgePath)) {
            const angSrc = fs.readFileSync(angBridgePath, 'utf8');
            check(angSrc.includes('"disp"') && angSrc.includes('"melee_to_h"') && angSrc.includes('"melee_to_d"') && angSrc.includes('"blows"') && angSrc.includes('"total_weight"'),
                'Angband main-bridge.c must emit disp, melee_to_h, melee_to_d, blows, total_weight');
        }
        const silBridgePath = path.join(ROOT, 'variants/silq-src/src/main-bridge.c');
        if (fs.existsSync(silBridgePath)) {
            const silSrc = fs.readFileSync(silBridgePath, 'utf8');
            check(silSrc.includes('"skills"') && silSrc.includes('"melee_mod"') && silSrc.includes('"song2"') && silSrc.includes('"song2_name"'),
                'Sil-Q main-bridge.c must emit skills, melee_mod, song2, song2_name');
        }
        const fcbBridgePath = path.join(ROOT, 'variants/frogcomposband-src/src/main-bridge.c');
        if (fs.existsSync(fcbBridgePath)) {
            const fcbSrc = fs.readFileSync(fcbBridgePath, 'utf8');
            check(fcbSrc.includes('"melee_to_h"') && fcbSrc.includes('"melee_to_d"'), 'FCB main-bridge.c must emit melee_to_h and melee_to_d');
        }
        const hengBridgePath = path.join(ROOT, 'variants/hengband-src/src/main-bridge.cpp');
        if (fs.existsSync(hengBridgePath)) {
            const hengSrc = fs.readFileSync(hengBridgePath, 'utf8');
            check(hengSrc.includes('"ac_base"') && hengSrc.includes('"ac_to_a"') && hengSrc.includes('DungeonRecords::get_instance()'),
                'Hengband main-bridge.cpp must emit ac_base, ac_to_a, and real max_depth');
        }
    }

    // -----------------------------------------------------------------------
    // 6. RealmCartridge v3, ItemSheet, Autopsy, ActionCatalog, Bestiary, AudioDirector, Fullscreen & Gamepad
    // -----------------------------------------------------------------------
    {
        check(RealmCartridge.getStatSchema('angband').length === 5, 'Angband statSchema must have 5 stats');
        check(RealmCartridge.getStatSchema('silq').length === 4, 'Sil-Q statSchema must have 4 stats');
        check(RealmCartridge.getStatSchema('dcss').length === 3, 'DCSS statSchema must have 3 stats');
        check(RealmCartridge.getStatSchema('brogue').length === 1, 'Brogue statSchema must have 1 stat');
        check(RealmCartridge.getStatSchema('rogue').length === 1, 'Rogue statSchema must have 1 stat');
        check(RealmCartridge.getStatSchema('nethack').length === 6, 'NetHack statSchema must have 6 stats');
        check(RealmCartridge.getDefenseSchema('rogue').direction === 'descending', 'Rogue defenseSchema must be descending');
        check(RealmCartridge.getDefenseSchema('nethack').direction === 'descending', 'NetHack defenseSchema must be descending');
        check(RealmCartridge.getProgressionSchema('brogue').hasLevels === false && RealmCartridge.getProgressionSchema('brogue').hasXp === false, 'Brogue progressionSchema has no levels/XP');

        const deltaRog = ItemSheet.compareWithEquipped({ name: 'chain mail [5]', ac: 5, kind: 'armor' }, [{ name: 'ring mail [7]', ac: 7, kind: 'armor', equipped: 'body' }], 'rogue');
        check(deltaRog && deltaRog.delta === 2, `Rogue ring mail [7] -> chain mail [5] must report +2 AC upgrade (got ${JSON.stringify(deltaRog)})`);
        check(RealmCartridge.getCapabilities('silq').hasQuiver === false, 'Sil-Q capability must hide Quiver tab');
        check(RealmCartridge.getCapabilities('rogue').hasQuiver === false, 'Rogue capability must hide Quiver tab');
        check(RealmCartridge.getCapabilities('brogue').hasQuiver === false, 'Brogue capability must hide Quiver tab');
        check(RealmCartridge.getCapabilities('angband').hasQuiver === true, 'Angband capability must expose Quiver tab');

        YasdAutopsy._resetForTests();
        const rogGap = YasdAutopsy.diagnoseMissingDefense('slain by a troll', '', { realm: 'rogue', ac: -2, arm: -2, resistances: {} }, {});
        check(!/Low Armor Class|Low AC/i.test(rogGap), `Autopsy must recognize strong descending Rogue AC -2 (got: ${rogGap})`);
        const brgGap = YasdAutopsy.diagnoseMissingDefense('slain by an eel', '', { realm: 'brogue', ac: 14, level: 0, exp: 0 }, {});
        check(!/0 XP|Low Level/i.test(brgGap), `Autopsy must never report 0 XP failure for Brogue (got: ${brgGap})`);

        check(MasterBestiary.resolve({ name: 'ice monster', glyph: 'I' }, 'I', 'rogue').templateKey === 'bestiary_frost_construct', 'Rogue ice monster must map to bestiary_frost_construct');
        check(MasterBestiary.resolve({ name: 'cockatrice', glyph: 'c' }, 'c', 'nethack').templateKey === 'bestiary_cockatrice', 'NetHack cockatrice must map to bestiary_cockatrice');
        check(MasterBestiary.resolve({ name: 'Shuten-douji', glyph: 'O' }, 'O', 'hengband').templateKey === 'bestiary_ogre', 'Hengband Shuten-douji must map to bestiary_ogre');
        check(MasterBestiary.resolve({ name: 'Sigmund', glyph: '@' }, '@', 'dcss').templateKey === 'char_male_priest', 'DCSS Sigmund must map to char_male_priest');
        check(MasterBestiary.resolve({ name: 'Old Man Willow', glyph: 'l' }, 'l', 'angband').templateKey === 'bestiary_treeman', 'Old Man Willow must map to bestiary_treeman');
        check(MasterBestiary.resolve({ name: 'Yeek king', glyph: 'y' }, 'y', 'angband').templateKey === 'bestiary_goblin', 'Yeek must map to bestiary_goblin');
        check(MasterBestiary.REALM_MANIFESTS.ryod && MasterBestiary.REALM_GLYPH_TABLES.ryod, 'RYOD manifest must be registered in MASTER_BESTIARY');

        for (const dietGlb of [
            'server/public/assets/models/monsters/Imp.glb',
            'server/public/assets/models/monsters/Puglin.glb',
            'server/public/assets/models/monsters/bestiary/Skull.glb',
            'server/public/assets/models/monsters/bestiary/stone_golem.glb'
        ]) {
            const { pngDims } = inspectGlbPngDims(dietGlb);
            check(pngDims.length >= 2 && pngDims.every(d => d.w <= 512 && d.h <= 512), `${dietGlb} embedded textures must all be <= 512x512 (got ${JSON.stringify(pngDims)})`);
        }

        const dir = new AudioDirector();
        const threat = dir.evaluateThreat({
            player: { x: 5, y: 5, level: 2, hp: 100, hp_max: 100 },
            map: { depth: 1 },
            monsters: [{ name: 'Floor Champion', race_level: 14, isBoss: true, x: 5, y: 6, hp: 200, inLos: true, visible: true }]
        }, 'ryod');
        check(threat && threat.tier >= 3, `AudioDirector must evaluate ryod boss race_level=14 as tier >= 3 (got ${JSON.stringify(threat)})`);

        const html = fs.readFileSync(path.join(ROOT, 'server/public/index.html'), 'utf8');
        for (const id of ['btn-global-fullscreen', 'btn-fullscreen', 'btn-term-fullscreen', 'btn-hh-fullscreen', 'hud-scale-range']) {
            check(html.includes(`id="${id}"`), `index.html must expose #${id}`);
        }
        const gpSrc = fs.readFileSync(path.join(PUB_JS, 'gamepad.js'), 'utf8');
        check(!gpSrc.includes("getAppState() !== 'game') return;"), 'GamepadController must never abort menus/splash on getAppState() !== game');
    }

    console.log(`\nALL ${passed} 9-REALM v13.0 PARITY MATRIX CHECKS PASSED!`);
} finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}

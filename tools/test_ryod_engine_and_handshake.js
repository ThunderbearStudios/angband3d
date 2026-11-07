#!/usr/bin/env node
/**
 * RYOD ("Roll Your Own Dungeon") Universal World Forge, Handshake & Playability Bot Gate (v11.8.0)
 * Verifies:
 *   1. Universal Content Pool (8 Archetypes, 7 Biomes, 8 Factions, 12 Hero Origins/Monster Avatars, 5 Power Disciplines, 6 Pets)
 *   2. 100% 3D Bestiary resolution for all RYOD faction monsters & Story Arc bosses via MASTER_BESTIARY
 *   3. Forward-compatibility via RealmContentPool.registerRealmContent('mock_9th_realm', ...)
 *   4. Deterministic FNV-1a ryodHash, Theme-Matched / Auto-Matched resolution, Permalink roundtrip, and <= 6 GLB/floor budget
 *   5. Headless Full-Run Playability Bot (Depth 0 Sanctuary Town -> Depth 1..8 -> Pet persistence -> Active Power [m] -> Boss Kill Victory)
 *   6. Ascension Mode (hasAmulet -> Ascend to Depth 0 -> Victory) & Self-Hydrating SaveRYOD (.sav) Handshake
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');

const MASTER_BESTIARY = require(path.join(PUBLIC_DIR, 'js', 'master-bestiary.js'));
const RealmContentPool = require(path.join(ROOT, 'server', 'src', 'cartridges', 'realm-content-pool.js'));
const RyodCompiler = require(path.join(ROOT, 'server', 'src', 'cartridges', 'ryod-compiler.js'));
const { FEAT, UniversalCartridgeEngine } = require(path.join(ROOT, 'server', 'src', 'cartridges', 'cartridge-core.js'));
const { VALID_REALMS, REALM_TO_MAGIC, enrichSaveMetadata } = require(path.join(ROOT, 'server', 'src', 'domain-config.js'));

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

// 1. Domain & Manifest Registration
check(VALID_REALMS.includes('ryod'), 'VALID_REALMS must include ryod');
check(REALM_TO_MAGIC.ryod === 'SaveRYOD', 'REALM_TO_MAGIC.ryod must be SaveRYOD');

// 2. Universal Content Pool & 100% Bestiary 3D Resolution
const factions = Object.values(RealmContentPool.BESTIARY_FACTIONS);
check(factions.length >= 8, `Expected >= 8 Bestiary Factions in RealmContentPool, got ${factions.length}`);
for (const fac of factions) {
    check(Array.isArray(fac.monsters) && fac.monsters.length >= 6, `Faction ${fac.id} must have >= 6 monsters`);
    for (const m of fac.monsters) {
        const resolved = MASTER_BESTIARY.resolve({ name: m.name, glyph: m.glyph, attr: m.attr || 11 }, m.glyph, 'ryod', '#fde047');
        check(resolved && resolved.templateKey, `RYOD monster ${m.name} (${m.glyph}) failed 3D bestiary resolution`);
    }
}

const storyArcs = Object.values(RealmContentPool.STORY_ARCS);
check(storyArcs.length >= 7, `Expected >= 7 Story Arcs in RealmContentPool, got ${storyArcs.length}`);
for (const arc of storyArcs) {
    check(arc.nemesis && arc.nemesis.name, `Story Arc ${arc.id} must define an Act V Nemesis Boss`);
    const bossResolved = MASTER_BESTIARY.resolve({ name: arc.nemesis.name, glyph: arc.nemesis.glyph, attr: arc.nemesis.attr || 14 }, arc.nemesis.glyph, 'ryod', '#fde047');
    check(bossResolved && bossResolved.templateKey, `RYOD nemesis ${arc.nemesis.name} failed 3D bestiary resolution`);
}

// 3. Deterministic Compiler, Theme-Matched Defaults, Permalink Roundtrip & <= 6 GLB/floor Budget
const bp1 = RyodCompiler.normalizeConfig({
    archetypeId: 'obsidian_covenant',
    biome: 'obsidian',
    storyArc: 'theme_matched',
    bestiary: 'theme_matched',
    heroOrigin: 'red_dragon',
    powerDiscipline: 'auto',
    pet: 'war_hound',
    difficulty: 'standard',
    goalDepth: 26,
    hasTown: true,
    victoryMode: 'boss_kill',
    seed: 777123
});
const bp2 = RyodCompiler.normalizeConfig({
    archetypeId: 'obsidian_covenant',
    biome: 'obsidian',
    storyArc: 'theme_matched',
    bestiary: 'theme_matched',
    heroOrigin: 'red_dragon',
    powerDiscipline: 'auto',
    pet: 'war_hound',
    difficulty: 'standard',
    goalDepth: 26,
    hasTown: true,
    victoryMode: 'boss_kill',
    seed: 777123
});
check(bp1.ryodHash === bp2.ryodHash && bp1.ryodHash.startsWith('RYOD-'), `Expected deterministic RYOD-XXXXXXXX hash, got ${bp1.ryodHash}`);
check(bp1.resolvedBestiary === 'warbands', `Expected theme_matched bestiary 'warbands' for obsidian, got ${bp1.resolvedBestiary}`);
check(bp1.resolvedDiscipline === 'arcane', `Expected auto powerDiscipline 'arcane' for red_dragon, got ${bp1.resolvedDiscipline}`);

const compiled26 = RyodCompiler.compileEngineSpec(bp1);
for (let d = 1; d <= 26; d++) {
    const cohort = compiled26.floorCohorts[d] || [];
    check(cohort.length > 0 && cohort.length <= 6, `Floor ${d} cohort size ${cohort.length} must be between 1 and 6 for 60fps VRAM budget`);
}

const token = RyodCompiler.encodePermalink(bp1);
const decoded = RyodCompiler.decodePermalink(token);
check(decoded && decoded.archetypeId === 'obsidian_covenant' && decoded.heroOrigin === 'red_dragon' && decoded.pet === 'war_hound', 'Permalink roundtrip must preserve configuration');

// Natural-language AI Architect prompt weaver
const woven = RyodCompiler.rollCoherentBlueprint({
    prompt: 'I want to play as an ancient red dragon in a bioluminescent fungal cavern in god mode',
    seed: 12345
});
check(woven.heroOrigin === 'red_dragon', `Expected woven heroOrigin 'red_dragon', got ${woven.heroOrigin}`);
check(woven.archetypeId === 'underdark_plague', `Expected woven archetypeId 'underdark_plague', got ${woven.archetypeId}`);
check(woven.godMode === true, 'Expected woven godMode === true');

// 4. Forward-Compatibility: Assimilate a 9th Realm into RealmContentPool
const okReg = RealmContentPool.registerRealmContent('tome4_maj_eyal', {
    title: 'Tales of Maj\'Eyal',
    monsters: [
        { name: 'Sher\'Tul construct', glyph: 'g', attr: 11, tier: 3, hp: 45, ac: 4, dmg: 14, exp: 60 }
    ],
    roles: [
        { id: 'Archmage of Angolwen', race: 'Higher', hp: 30, pw: 24, ac: 3 }
    ],
    items: [
        { kind: 'staff', name: 'Staff of Absorption', glyph: '_', attr: 13, charges: 8, dmg: 22 }
    ]
});
check(okReg === true && Boolean(RealmContentPool.BESTIARY_FACTIONS.realm_tome4_maj_eyal), 'registerRealmContent must assimilate new realm bestiary, roles, and items into RealmContentPool');

// 5. Headless Full-Run Playability Bot (Depth 0 Sanctuary Town -> Depth 8 Boss Kill Victory)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryod-test-'));

const runSpec = RyodCompiler.compileEngineSpec({
    archetypeId: 'obsidian_covenant',
    heroOrigin: 'red_dragon',
    pet: 'war_hound',
    difficulty: 'story',
    godMode: true,
    goalDepth: 8,
    hasTown: true,
    victoryMode: 'boss_kill',
    seed: 424242
});
const engine = new UniversalCartridgeEngine(runSpec, {
    saveDir: tmpDir,
    user: 'IgnisRex',
    isNew: true,
    randomBirth: false
});

check(engine.state.phase === 'play', 'Engine with isNew:true must start in play phase');
check(engine.state.depth === 0, `Engine with hasTown:true must start at Depth 0, got ${engine.state.depth}`);
check(engine.state.player.isMonsterAvatar === true && engine.state.player.avatarMonsterName === 'red dragon', 'Red Dragon avatar must set isMonsterAvatar and avatarMonsterName');
const startPet = engine.state.monsters.find(m => m.isPet);
check(Boolean(startPet && startPet.hp > 0), 'Engine must spawn starting War Hound pet at Depth 0');

// Test Depth 0 Sanctuary Town features: Altar ('_'), Fountain ('{'), Elder ('t'), Quartermaster ('p'), Down Stair ('>')
let altarCoord = null;
let downStairCoord = null;
for (let y = 0; y < engine.state.map.length; y++) {
    for (let x = 0; x < engine.state.map[y].length; x++) {
        if (engine.state.map[y][x].feat === FEAT.ALTAR) altarCoord = { x, y };
        if (engine.state.map[y][x].feat === FEAT.DOWN_STAIR) downStairCoord = { x, y };
    }
}
check(Boolean(altarCoord && downStairCoord), 'Depth 0 Sanctuary Town must contain a Temple Altar (_) and Down Stair (>)');
engine.state.player.x = altarCoord.x;
engine.state.player.y = altarCoord.y;
engine.handleKey('p');
check(engine.state.messages.some(m => /sanctified|altar/i.test(m.text || m)), 'Praying [p] on Town Altar must sanctify player gear and vitality');

// Test Active Power Drawer ('m' -> 'a')
engine.handleKey('m');
check(engine.state.menuMode === 'power_select', `Pressing [m] must open the Active Power Drawer (power_select), got ${engine.state.menuMode}`);
engine.handleKey('a');
check(engine.state.menuMode === 'none', 'Selecting power [a] must execute power and close overlay');

// Descend from Depth 0 through Depth 8 and verify pet persistence on every floor
for (let targetDepth = 1; targetDepth <= 8; targetDepth++) {
    let stair = null;
    for (let y = 0; y < engine.state.map.length; y++) {
        for (let x = 0; x < engine.state.map[y].length; x++) {
            if (engine.state.map[y][x].feat === FEAT.DOWN_STAIR) { stair = { x, y }; break; }
        }
        if (stair) break;
    }
    check(Boolean(stair), `Floor ${engine.state.depth} must have a DOWN_STAIR`);
    engine.state.player.x = stair.x;
    engine.state.player.y = stair.y;
    engine.handleKey('>');
    check(engine.state.depth === targetDepth, `Expected depth ${targetDepth} after descending (>), got ${engine.state.depth}`);
    const petOnFloor = engine.state.monsters.find(m => m.isPet);
    check(Boolean(petOnFloor && petOnFloor.hp > 0), `Pet must persist across stairs onto Depth ${targetDepth}`);
}

// On Depth 8 (Goal Depth), verify Sovereign Nemesis Boss is present and slay it to win
const boss = engine.state.monsters.find(m => m.isNemesis || m.isBoss);
check(Boolean(boss), 'Goal Depth 8 must spawn the Act V Sovereign Nemesis Boss');
boss.hp = 1;
boss.ac = 0;
engine.state.player.x = boss.x - 1;
engine.state.player.y = boss.y;
engine.state.monsters = engine.state.monsters.filter(m => m === boss || m.isPet || (m.x !== engine.state.player.x || m.y !== engine.state.player.y));
for (let i = 0; i < 12 && !engine.state.player.winner; i++) {
    engine.state.player.x = boss.x - 1;
    engine.state.player.y = boss.y;
    engine.handleKey('l'); // step right into boss at (boss.x, boss.y)
}
check(engine.state.player.winner === true, 'Slaying Sovereign Nemesis Boss in boss_kill mode must set state.player.winner = true');

// 6. Test SaveRYOD Self-Hydrating Handshake & Metadata Enrichment
engine.saveGame();
const savePath = path.join(tmpDir, 'IgnisRex.sav');
check(fs.existsSync(savePath), 'SaveRYOD file must be written to disk');
const rawSaveBytes = fs.readFileSync(savePath);
check(rawSaveBytes.slice(0, 8).toString('ascii') === 'SaveRYOD', 'SaveRYOD file must begin with 8-byte magic header SaveRYOD');
const descSize = rawSaveBytes.readUInt32LE(28);
const parsedSavePayload = JSON.parse(rawSaveBytes.slice(36 + descSize).toString('utf8'));
check(parsedSavePayload.ryodHash === runSpec.ryodHash && parsedSavePayload.ryodBlueprint, 'SaveRYOD payload must embed ryodHash and ryodBlueprint');

const shortHash = runSpec.ryodHash.replace(/^RYOD-/i, '').slice(0, 4).toUpperCase();
const enriched = enrichSaveMetadata({
    filename: 'IgnisRex',
    characterName: 'IgnisRex',
    ryodHash: parsedSavePayload.ryodHash,
    ryodTitle: parsedSavePayload.ryodBlueprint.title,
    description: 'Depth 8 • Lvl 5'
}, 'ryod');
check(enriched.realmTag === `RYOD:${shortHash}`, `Expected realmTag RYOD:${shortHash}, got ${enriched.realmTag}`);

// Load SaveRYOD into a fresh engine initialized with a DIFFERENT default blueprint and verify self-hydration!
const differentSpec = RyodCompiler.compileEngineSpec({ archetypeId: 'sanctum_heist', goalDepth: 26, hasTown: false, seed: 111 });
const freshEngine = new UniversalCartridgeEngine(differentSpec, {
    saveDir: tmpDir,
    user: 'IgnisRex',
    isNew: false
});
check(freshEngine.spec.ryodHash === runSpec.ryodHash, `Fresh engine must self-hydrate ryodHash ${runSpec.ryodHash} from SaveRYOD file, got ${freshEngine.spec.ryodHash}`);
check(freshEngine.spec.goalDepth === 8 && freshEngine.spec.hasTown === true, 'Fresh engine must self-hydrate goalDepth and hasTown from embedded SaveRYOD blueprint');
const frame = freshEngine.buildFrame();
check(frame.ryodMeta && frame.ryodMeta.ryodHash === runSpec.ryodHash, 'buildFrame() must include ryodMeta for client visual/audio hydration');

// 7. Test Ascension Mode ('ascension': claim goal artifact on D:8 -> ascend to Depth 0 -> win)
const ascSpec = RyodCompiler.compileEngineSpec({
    archetypeId: 'sanctum_heist',
    heroOrigin: 'rogue',
    difficulty: 'story',
    godMode: true,
    goalDepth: 8,
    hasTown: true,
    victoryMode: 'ascension',
    seed: 999888
});
const ascEngine = new UniversalCartridgeEngine(ascSpec, {
    saveDir: tmpDir,
    user: 'BerenAsc',
    isNew: true
});
// Descend to Depth 8
for (let d = 1; d <= 8; d++) {
    let stair = null;
    for (let y = 0; y < ascEngine.state.map.length; y++) {
        for (let x = 0; x < ascEngine.state.map[y].length; x++) {
            if (ascEngine.state.map[y][x].feat === FEAT.DOWN_STAIR) { stair = { x, y }; break; }
        }
        if (stair) break;
    }
    ascEngine.state.player.x = stair.x;
    ascEngine.state.player.y = stair.y;
    ascEngine.handleKey('>');
}
const goalObj = ascEngine.state.objects.find(o => o.isGoalArtifact);
check(Boolean(goalObj), 'Goal Depth 8 must spawn the Quest Goal Artifact');
ascEngine.state.player.x = goalObj.x;
ascEngine.state.player.y = goalObj.y;
ascEngine.handleKey('g');
check(ascEngine.state.player.hasAmulet === true && !ascEngine.state.player.winner, 'Picking up goal artifact in ascension mode must set hasAmulet=true without immediate win');

// Ascend back to Depth 0
for (let d = 7; d >= 0; d--) {
    let upStair = null;
    for (let y = 0; y < ascEngine.state.map.length; y++) {
        for (let x = 0; x < ascEngine.state.map[y].length; x++) {
            if (ascEngine.state.map[y][x].feat === FEAT.UP_STAIR) { upStair = { x, y }; break; }
        }
        if (upStair) break;
    }
    ascEngine.state.player.x = upStair.x;
    ascEngine.state.player.y = upStair.y;
    ascEngine.handleKey('<');
}
check(ascEngine.state.depth === 0 && ascEngine.state.player.winner === true, 'Ascending to Depth 0 with Goal Artifact must trigger Ascension Victory');

// 8. v11.8.3 World Mutators, Map Layouts, Three Runes Mode & Wayfarer Quartermaster
check(RealmContentPool.MAP_LAYOUTS && Object.keys(RealmContentPool.MAP_LAYOUTS).length >= 4, 'RealmContentPool must export >= 4 MAP_LAYOUTS');
check(RealmContentPool.WORLD_MUTATORS && Object.keys(RealmContentPool.WORLD_MUTATORS).length >= 8, 'RealmContentPool must export >= 8 WORLD_MUTATORS');

const mutSpec = RyodCompiler.compileEngineSpec({
    archetypeId: 'labyrinth_of_zot',
    biome: 'marble',
    mapLayout: 'arena',
    mutatorId: 'midas_vaults',
    d20Fate: 20,
    victoryMode: 'three_runes',
    goalDepth: 9,
    hasTown: false,
    godMode: true,
    seed: 333444
});
check(mutSpec.mapLayout === 'arena' && mutSpec.mutatorId === 'midas_vaults' && mutSpec.d20Fate === 20, 'RyodCompiler must preserve mapLayout, mutatorId, and d20Fate');

const runesEngine = new UniversalCartridgeEngine(mutSpec, {
    saveDir: tmpDir,
    user: 'RuneSeeker',
    isNew: true
});
check(runesEngine.state.depth === 1, 'hasTown:false must start directly on Depth 1');
check(runesEngine.state.player.inventory.some(i => i.beatitude === 'blessed') && runesEngine.state.player.inventory.some(i => i.name === 'scroll of enchanting'), 'd20Fate=20 must grant blessed weapon and scroll of enchanting');
check(runesEngine.state.objects.some(o => o.name === 'gilded vault hoard'), 'midas_vaults mutator must spawn gilded vault hoard on floor');

// Descend through Depth 9 collecting the 3 Abyssal Runes (Act II, III, IV milestone floors) and checking Floor 5 Wayfarer Quartermaster
for (let d = 1; d <= 9; d++) {
    if (d === 5) {
        const qm = runesEngine.state.monsters.find(m => m.townRole === 'quartermaster' || m.race === 'Wayfarer Quartermaster');
        check(Boolean(qm), 'Depth 5 must spawn the Subterranean Wayfarer Quartermaster');
    }
    const runeObj = runesEngine.state.objects.find(o => o.kind === 'rune');
    if (runeObj) {
        runesEngine.state.player.x = runeObj.x;
        runesEngine.state.player.y = runeObj.y;
        runesEngine.handleKey('g');
    }
    if (d < 9) {
        let stair = null;
        for (let y = 0; y < runesEngine.state.map.length; y++) {
            for (let x = 0; x < runesEngine.state.map[y].length; x++) {
                if (runesEngine.state.map[y][x].feat === FEAT.DOWN_STAIR) { stair = { x, y }; break; }
            }
            if (stair) break;
        }
        runesEngine.state.player.x = stair.x;
        runesEngine.state.player.y = stair.y;
        runesEngine.handleKey('>');
    }
}
check(runesEngine.state.player.runes === 3, `Expected 3 Abyssal Runes collected by Depth 9, got ${runesEngine.state.player.runes}`);
const runeBoss = runesEngine.state.monsters.find(m => m.isNemesis || m.isBoss);
check(Boolean(runeBoss), 'Depth 9 must spawn the Sovereign Nemesis Boss in three_runes mode');
runeBoss.hp = 1;
runeBoss.ac = 0;
runesEngine.state.player.x = runeBoss.x - 1;
runesEngine.state.player.y = runeBoss.y;
runesEngine.state.monsters = runesEngine.state.monsters.filter(m => m === runeBoss || m.isPet || (m.x !== runesEngine.state.player.x || m.y !== runesEngine.state.player.y));
for (let i = 0; i < 12 && !runesEngine.state.player.winner; i++) {
    runesEngine.state.player.x = runeBoss.x - 1;
    runesEngine.state.player.y = runeBoss.y;
    runesEngine.handleKey('l');
}
check(runesEngine.state.player.winner === true, 'Collecting 3 Abyssal Runes + slaying Boss must trigger three_runes Victory');

// 9. v11.8.3 9-Realm Chronicle Grounder, Control Briefs, 45 Chips & Enceladus Voice Invariant
const ChronicleGrounder = require(path.join(PUBLIC_DIR, 'js', 'chronicle', 'chronicle-grounder.js'));
const ALL_REALMS = ['nethack', 'dcss', 'angband', 'brogue', 'rogue', 'silq', 'frogcomposband', 'hengband', 'ryod'];
for (const rk of ALL_REALMS) {
    global.window = {
        __activeRealm: rk,
        __activeRyodBlueprint: mutSpec.ryodBlueprint,
        __app: { getActiveRealm: () => rk }
    };
    const townCh = ChronicleGrounder.generateProceduralChapter({ type: 'ONBOARDING_TOWN_ARRIVAL', data: { depth: 0 } }, { name: 'Tester', race: 'Human', class: 'Warrior', depth: 0, realm: rk });
    const d1Ch = ChronicleGrounder.generateProceduralChapter({ type: 'ONBOARDING_FIRST_DESCENT', data: { depth: 1 } }, { name: 'Tester', race: 'Human', class: 'Warrior', depth: 1, realm: rk });
    check(townCh && townCh.prose && townCh.prose.length > 25, `ONBOARDING_TOWN_ARRIVAL must produce prose for ${rk}`);
    check(d1Ch && d1Ch.prose && d1Ch.prose.length > 25, `ONBOARDING_FIRST_DESCENT must produce prose for ${rk}`);
    if (['nethack', 'dcss', 'brogue', 'rogue', 'ryod'].includes(rk)) {
        check(!/Morgoth|Town of Angband/i.test(townCh.prose), `Non-Tolkien realm ${rk} town arrival must never mention Morgoth or Town of Angband: ${townCh.prose}`);
        check(!/Morgoth|Town of Angband/i.test(d1Ch.prose), `Non-Tolkien realm ${rk} first descent must never mention Morgoth or Town of Angband: ${d1Ch.prose}`);
    }
    const brief = ChronicleGrounder.buildRealmControlAndSituationBrief(rk, { name: 'Tester', depth: 1, hp: 20, mhp: 20 });
    check(brief && brief.includes(`ACTIVE_REALM: ${rk.toUpperCase()}`), `buildRealmControlAndSituationBrief must include ACTIVE_REALM for ${rk}`);
    const counsel = ChronicleGrounder.answerGuideQuery('what should I do right now?', { name: 'Tester', depth: 1, hp: 20, hp_max: 20 }, rk);
    check(counsel && counsel.length > 25, `answerGuideQuery must return situational counsel for ${rk}`);
    const arch = ChronicleGrounder.getStoryArchitecture(rk, 1);
    check(arch && arch.collectionTitle && arch.currentDivision && arch.currentTitle, `getStoryArchitecture(${rk}) must return collectionTitle, currentDivision, and currentTitle`);
    check(Array.isArray(ChronicleGrounder.MYTHIC_VOWS_BY_REALM[rk]) && ChronicleGrounder.MYTHIC_VOWS_BY_REALM[rk].length >= 3, `MYTHIC_VOWS_BY_REALM[${rk}] must define >= 3 mythic vows`);
    const vProfile = ChronicleGrounder.resolveVoiceProfile(null, { name: 'Tester' }, '', ChronicleGrounder.getTraditionForRealm(rk), false, rk, 'en');
    check(vProfile && vProfile.geminiVoice === 'Enceladus', `Narrator voice for ${rk} must be locked to Enceladus, got ${vProfile && vProfile.geminiVoice}`);
}
delete global.window;

try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

console.log(`PASS: test_ryod_engine_and_handshake (${passed} assertions verified)`);

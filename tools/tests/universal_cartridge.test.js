/**
 * universal_cartridge.test.js — Comprehensive Verification Suite for v13 Sovereign Diegetic GUI,
 * Universal Cartridge Schema v2, Tactical Gameplay Assistant & Intel UHD 620 Governor.
 *
 * Verifies:
 *   1. Strict IP Cleanliness (`IP-CLEAN-01` — zero forbidden third-party commercial game titles).
 *   2. `RealmCartridge` 5-realm registry, NetHack 52-slot `a-zA-Z$`, BUC beatitude parser,
 *      diagonal doorway rule, `#` extended commands, `applyThemeTokens`, `compareWithEquipped`
 *      stat-delta calculation, `getEquipmentSlots`, and Schema v2 `loadExternalCartridgeJSON`.
 *   3. `ScreenModalCoordinator` quick-slot binding (`1..9`), `buildCommandTransaction`
 *      (`direct-slot`, `close-then-act`, `atomic-verb-noun`, `extended-command`),
 *      `classifySubPrompt` (`direction`, `confirm-yn`, `more`), `analyzeTacticalSituation`,
 *      dirty-gated `setHoveredCell`, and `evaluateThreatInterruption`.
 *   4. `Dungeon3DLightmap` (`HardwareGpuProfile.detect` for Intel UHD Graphics 620,
 *      `DemandRenderGovernor`, `InstanceVertexLighter` zero wall light-bleed,
 *      `NameplateTexturePool` 64-entry LRU `.dispose()`, `FrustumTileCuller`, `CpuBakedVertexAO`).
 *   5. `RealmGrimoireDeck` 52-slot non-truncation, Category Filter tabs (`data-grimoire-cmd="filter-cat"`),
 *      BUC badges, Stat-Delta comparison chips, Hero Panoply strip, Sub-Prompt Compass, and NetHack `#` ritual bar.
 *   6. `Dungeon3DModelGovernor` Zero-Regression Gate (`KEEP_UNTOUCHED` vs `OPTIMIZE_MATERIALS_ONLY`
 *      vs `REPLACE_POLY_GARBAGE` using `ARCHIVAL_RELIC_REPLACEMENTS` and `_archivalBakedUhd620`).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const jsDir = path.resolve(__dirname, '../../server/public/js');
const RealmCartridge = require(path.join(jsDir, 'realm-cartridge.js'));
const ScreenModalCoordinator = require(path.join(jsDir, 'screen-modal-coordinator.js'));
const Dungeon3DLightmap = require(path.join(jsDir, 'dungeon3d-lightmap.js'));
const Dungeon3DModelGovernor = require(path.join(jsDir, 'dungeon3d-model-governor.js'));

global.RealmCartridge = RealmCartridge;
global.ScreenModalCoordinator = ScreenModalCoordinator;
const RealmGrimoireDeck = require(path.join(jsDir, 'grimoire-deck.js'));

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

// 0. IP-CLEAN-01 Guardrail Verification across all client modules
{
    const forbiddenRegex = new RegExp(
        [
            'Sky' + 'rim',
            'Eld' + 'er\\s+Scrolls',
            'Bal' + 'dur',
            'Dia' + 'blo',
            'Eld' + 'en\\s+Ring',
            'Da' + 'rk\\s+Souls',
            'Ha' + 'des',
            'Zel' + 'da',
            'War' + 'craft',
            'Fin' + 'al\\s+Fantasy',
            'Ult' + 'ima'
        ].join('|'),
        'i'
    );
    const filesToScan = [
        'realm-cartridge.js',
        'screen-modal-coordinator.js',
        'dungeon3d-lightmap.js',
        'dungeon3d-model-governor.js',
        'grimoire-deck.js',
        'chronicle/chronicle-story-weaver.js'
    ];
    for (const f of filesToScan) {
        const p = path.join(jsDir, f);
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            check(!forbiddenRegex.test(content), `File ${f} must be 100% IP-clean (IP-CLEAN-01)`);
        }
    }
}

// 1. RealmCartridge Schema v2 & 8-Realm Verification
{
    const realms = RealmCartridge.listRealms();
    ['nethack', 'dcss', 'angband', 'brogue', 'rogue', 'silq', 'frogcomposband', 'hengband'].forEach(r => {
        check(realms.includes(r), `RealmCartridge must include ${r}`);
        const cart = RealmCartridge.getCartridge(r);
        check(cart && cart.id === r, `Cartridge descriptor id must match ${r}`);
        check(cart.heraldry && cart.heraldry.crestTitle, `Cartridge ${r} must define heraldry`);
        check(cart.themeTokens && cart.themeTokens.surfaceBg, `Cartridge ${r} must define themeTokens`);
        check(RealmCartridge.getEquipmentSlots(r).length >= 12, `Cartridge ${r} must define equipment paperdoll slots`);
        check(cart.verbs && cart.verbs.wield && cart.verbs.quaff && cart.verbs.drop && cart.verbs.inspect, `Cartridge ${r} must define core verbs`);
    });

    // Theme tokens DOM application check
    const mockProps = {};
    const mockDoc = {
        documentElement: {
            attr: {},
            setAttribute(k, v) { this.attr[k] = v; },
            style: { setProperty(k, v) { mockProps[k] = v; } }
        }
    };
    RealmCartridge.applyThemeTokens('nethack', mockDoc);
    check(mockDoc.documentElement.attr['data-active-realm'] === 'nethack', 'applyThemeTokens must set data-active-realm attribute');
    check(mockProps['--realm-crest-color'] === '#34d399', 'applyThemeTokens must set --realm-crest-color');

    const nh = RealmCartridge.getCartridge('nethack');
    check(nh.capabilities.maxInventoryVisible === 52, 'NetHack maxInventoryVisible must be 52');
    check(nh.capabilities.beatitudeBUC === true, 'NetHack beatitudeBUC must be true');
    check(nh.capabilities.diagonalDoorwayBlocked === true, 'NetHack diagonalDoorwayBlocked must be true');
    check(RealmCartridge.getExtendedCommands('nethack').length >= 7, 'NetHack must expose >= 7 extended # ritual commands');

    check(RealmCartridge.canMoveDiagonally('nethack', 'open_door', 'floor') === false, 'NetHack must block diagonal doorway exit');
    check(RealmCartridge.canMoveDiagonally('nethack', 'floor', 'doorway') === false, 'NetHack must block diagonal doorway entry');
    check(RealmCartridge.canMoveDiagonally('angband', 'open_door', 'floor') === true, 'Angband allows diagonal doorway movement');

    const blessed = RealmCartridge.parseBeatitudeBUC('a blessed +2 long sword (weapon in hand)');
    const uncursed = RealmCartridge.parseBeatitudeBUC('an uncursed potion of healing');
    const cursed = RealmCartridge.parseBeatitudeBUC('a cursed ring of teleportation');
    check(blessed.buc === 'blessed' && blessed.shortCode === 'B', 'Must detect blessed BUC state');
    check(uncursed.buc === 'uncursed' && uncursed.shortCode === 'U', 'Must detect uncursed BUC state');
    check(cursed.buc === 'cursed' && cursed.shortCode === 'C', 'Must detect cursed BUC state');

    // Stat-Delta comparison check
    const upg = RealmCartridge.compareWithEquipped('Long Sword (2d5) (+4,+6)', 'Dagger (1d4) (+0,+0)', 'weapon');
    check(upg.isUpgrade === true && upg.deltaLabel.includes('▲'), 'compareWithEquipped must flag stronger weapon as ▲ upgrade');
    const armorUpg = RealmCartridge.compareWithEquipped('Chain Mail [14,+3]', 'Soft Leather Armour [4,+0]', 'armor');
    check(armorUpg.isUpgrade === true && armorUpg.deltaLabel.includes('AC'), 'compareWithEquipped must compute +AC armor delta');

    const biome = RealmCartridge.getBiomeForDepth('nethack', 25, 'gehennom');
    check(biome && biome.id === 'gehennom', 'getBiomeForDepth must resolve Gehennom branch profile');
}

// 2. ScreenModalCoordinator & Sub-Prompt / Tactical Gameplay Assistant Verification
{
    const coord = new ScreenModalCoordinator.ScreenModalCoordinatorController();
    const bound = coord.bindQuickSlot('nethack', 1, { key: 'f', verb: 'q', name: 'blessed potion of extra healing', category: 'potion' });
    check(bound && bound.slot === 1 && bound.inscriptionTag === '@q1', 'Quick-slot 1 binding must format @q1 inscription tag');
    check(coord.getQuickSlots('nethack')['1'].key === 'f', 'Quick-slot 1 must persist');
    coord.unbindQuickSlot('nethack', 1);
    check(!coord.getQuickSlots('nethack')['1'], 'unbindQuickSlot must remove bound slot');

    const txPrompt = coord.buildCommandTransaction({ verbKey: 'q', slotKey: 'c' }, { mode: 'item-list', isItemPrompt: true }, 'angband');
    check(txPrompt.mode === 'direct-slot' && txPrompt.steps[0] === 'c', 'Direct-slot mode when already in item prompt');

    const txPassive = coord.buildCommandTransaction({ verbKey: 'q', slotKey: 'c' }, { mode: 'item-list', isInventoryScreen: true, isItemPrompt: false }, 'angband');
    check(txPassive.mode === 'close-then-act' && txPassive.steps[0] === '\x1b' && txPassive.steps[1] === 'q', 'Close-then-act mode when in passive list');

    const txExtended = coord.buildCommandTransaction({ verbKey: '#pray\n', slotKey: '', isExtended: true }, { mode: 'dungeon' }, 'nethack');
    check(txExtended.mode === 'extended-command' && txExtended.steps[0] === '#' && txExtended.steps[txExtended.steps.length - 1] === '\n',
        'Extended # command without slot must expand to ["#", ...chars, "\\n"]');

    const dirSub = coord.classifySubPrompt('In what direction? [aborting is Esc]', 'nethack');
    check(dirSub.kind === 'direction' && dirSub.directions.length === 10, 'classifySubPrompt must detect direction prompt and return 8-way compass + Target + Cancel');

    const ynSub = coord.classifySubPrompt('Really attack the peaceful shopkeeper? [y/n]', 'nethack');
    check(ynSub.kind === 'confirm-yn' && ynSub.options.length === 2, 'classifySubPrompt must detect [y/n] confirmation prompt');

    const moreSub = coord.classifySubPrompt('You hear a distant rumble. --More--', 'angband');
    check(moreSub.kind === 'more' && moreSub.options[0].key === ' ', 'classifySubPrompt must detect --More-- pager prompt');

    const advisories = coord.analyzeTacticalSituation(
        { hp: 18, maxHp: 100, statusText: 'Poisoned Hungry' },
        [{ key: 'c', desc: 'a Potion of Extra Healing' }, { key: 'e', desc: 'a Ration of Food' }],
        'angband'
    );
    check(advisories.length >= 2 && advisories.some(a => a.id === 'low_hp_heal'), 'Tactical Gameplay Assistant must recommend healing and rations when critically injured & hungry');
}

// 3. Dungeon3DLightmap & Intel UHD 620 Governor Verification
{
    const uhd620 = Dungeon3DLightmap.HardwareGpuProfile.detect('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)');
    check(uhd620.gpuTier === 'integrated' && uhd620.dprCap === 1.0 && uhd620.antialias === false && uhd620.farDistance === 60,
        'Intel UHD 620 benchmark must enforce dprCap=1.0, antialias=false, farDistance=60');

    const appleM3 = Dungeon3DLightmap.HardwareGpuProfile.detect('Apple M3 Pro GPU');
    check(appleM3.gpuTier === 'performance' && appleM3.dprCap === 1.5 && appleM3.antialias === true && appleM3.fullPbrMaps === true,
        'Apple M-series GPU must scale up to performance tier (dprCap=1.5, antialias=true, fullPbrMaps=true)');

    const rtx4080 = Dungeon3DLightmap.HardwareGpuProfile.detect('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)');
    check(rtx4080.gpuTier === 'ultra' && rtx4080.dprCap === 2.0 && rtx4080.farDistance === 140 && rtx4080.anisotropy === 8,
        'Enthusiast RTX GPU must scale up to ultra tier (dprCap=2.0, farDistance=140, anisotropy=8)');

    const maliEntry = Dungeon3DLightmap.HardwareGpuProfile.detect('Mali-G52 MC2');
    check(maliEntry.gpuTier === 'mobile-saver' && maliEntry.farDistance === 48 && maliEntry.nameplatePoolCap === 48,
        'Entry mobile GPU must use mobile-saver tier to protect battery and memory');

    const gov = new Dungeon3DLightmap.DemandRenderGovernor({ idleIntervalMs: 100 });
    gov.wake(200, 1000);
    check(gov.shouldRenderFrame(1050) === true, 'Governor must render at 60fps while awake');
    check(gov.shouldRenderFrame(1250) === false, 'Governor must throttle frames within 100ms after active window');
    check(gov.shouldRenderFrame(1310) === true, 'Governor must allow 10fps ambient tick after 100ms');

    for (let i = 0; i < 10; i++) gov.recordFrameTime(22.0);
    check(gov.dynamicResolutionScale === 0.85, 'Governor must step resolution scale down to 0.85 when avg frame time > 18.5ms');

    const lighter = new Dungeon3DLightmap.InstanceVertexLighter();
    const occluded = lighter.computeTileColor(11, 10, 1, 10, 10);
    check(occluded.r === lighter.fogMemoryColor.r, 'Remembered tile behind wall (l=1) must have zero torchlight bleed');

    const pool = new Dungeon3DLightmap.NameplateTexturePool(64);
    const firstTex = pool.acquire('kobold|20||');
    for (let i = 1; i <= 64; i++) pool.acquire(`orc_${i}|20||`);
    check(pool.size === 64 && firstTex.disposed === true, 'NameplateTexturePool must cap at 64 entries and call .dispose() on eviction');
}

// 4. Sovereign Grimoire Sanctum (52-Slot, Category Filter, BUC, Stat-Delta, Sub-Prompt & Ritual Bar)
{
    RealmGrimoireDeck.setMode('hybrid');
    RealmGrimoireDeck.setCategory('all');
    const mockContainer = { style: { display: 'none' }, innerHTML: '', addEventListener() {} };
    const fiftyTwoItems = Array.from({ length: 52 }, (_, i) => ({
        key: RealmCartridge.getSlotLetter(i, 'nethack'),
        desc: i === 0 ? 'a blessed +3 long sword (2d5) (+4,+6)  3.0 lb' : (i === 51 ? 'a cursed potion of sickness  0.5 lb' : `an uncursed scroll of identify #${i + 1}  0.2 lb`)
    }));
    RealmGrimoireDeck.render(mockContainer, {
        realm: 'nethack',
        promptText: 'In what direction?',
        classifier: { isInventoryScreen: true, mode: 'item-list', listKind: 'inven' },
        equippedByCategory: { weapon: 'Dagger (1d4) (+0,+0)' },
        items: fiftyTwoItems
    });
    const cardCount = (mockContainer.innerHTML.match(/class="grimoire-item-card/g) || []).length;
    check(cardCount === 52, `RealmGrimoireDeck must render all 52 NetHack items when category is 'all' (got ${cardCount})`);
    check(mockContainer.innerHTML.includes('data-grimoire-cmd="filter-cat"'), 'Grimoire must render Category Filter bar');
    check(mockContainer.innerHTML.includes('grimoire-panoply-strip'), 'Grimoire must render Hero Panoply summary strip');
    check(mockContainer.innerHTML.includes('grimoire-stat-delta is-upgrade'), 'Grimoire must render ▲ stat-delta upgrade chip');
    check(mockContainer.innerHTML.includes('grimoire-subprompt-banner'), 'Grimoire must render diegetic Sub-Prompt compass banner');
    check(mockContainer.innerHTML.includes('grimoire-ritual-bar') && mockContainer.innerHTML.includes('#pray'), 'Grimoire must render NetHack # extended ritual bar');

    // Category filter test
    RealmGrimoireDeck.setCategory('potion');
    const potionCardCount = (mockContainer.innerHTML.match(/class="grimoire-item-card/g) || []).length;
    check(potionCardCount === 1, 'Filtering by potion category must show only the 1 potion card');
    RealmGrimoireDeck.setCategory('all');
}

// 5. Dungeon3DModelGovernor Zero-Regression Gate & IP-Clean Archival Relics Verification
{
    check(Dungeon3DModelGovernor.ARCHIVAL_RELIC_REPLACEMENTS && Dungeon3DModelGovernor.ARCHIVAL_RELIC_REPLACEMENTS.weapon.glb.includes('/models/archival_relics/'),
        'Dungeon3DModelGovernor must export IP-clean ARCHIVAL_RELIC_REPLACEMENTS');

    const goodModel = {
        id: 'hero_paladin_glb',
        triangleCount: 2200,
        hasTexture: true,
        children: [{ isMesh: true, geometry: { type: 'BufferGeometry', index: { count: 6600 } }, material: { type: 'MeshLambertMaterial', map: {} } }]
    };
    const keepAudit = Dungeon3DModelGovernor.classifyModelQuality(goodModel);
    check(keepAudit.decision === 'KEEP_UNTOUCHED' && keepAudit.allowReplace === false, 'High-craft model must return KEEP_UNTOUCHED');

    const polyGarbage = {
        id: 'placeholder_sword',
        category: 'weapon',
        children: [
            { isMesh: true, geometry: { type: 'BoxGeometry', parameters: {} }, material: {} },
            { isMesh: true, geometry: { type: 'BoxGeometry', parameters: {} }, material: {} },
            { isMesh: true, geometry: { type: 'CylinderGeometry', parameters: { radialSegments: 5 } }, material: {} }
        ]
    };
    const repAudit = Dungeon3DModelGovernor.classifyModelQuality(polyGarbage);
    check(repAudit.decision === 'REPLACE_POLY_GARBAGE' && repAudit.replacementSpec.glb.includes('/models/archival_relics/'),
        'Poly-garbage placeholder must return REPLACE_POLY_GARBAGE with archival_relics GLB');

    const heavyPbr = {
        id: 'ornate_statue',
        triangleCount: 1900,
        hasTexture: true,
        children: [{ isMesh: true, geometry: { type: 'BufferGeometry', index: { count: 5700 } }, material: { type: 'MeshStandardMaterial', map: {} } }]
    };
    Dungeon3DModelGovernor.optimizeModelForGpuTier(heavyPbr, 'integrated');
    check(heavyPbr.children[0].material._archivalBakedUhd620 === true, 'optimizeModelForGpuTier must set _archivalBakedUhd620 = true on integrated tier');

    const ultraPbrModel = {
        id: 'ultra_statue',
        triangleCount: 2400,
        hasTexture: true,
        children: [{ isMesh: true, geometry: { type: 'BufferGeometry', index: { count: 7200 } }, material: { type: 'MeshStandardMaterial', map: {}, normalMap: {} } }]
    };
    Dungeon3DModelGovernor.optimizeModelForGpuTier(ultraPbrModel, 'ultra');
    check(ultraPbrModel.children[0].material._fullPbrPreserved === true && ultraPbrModel.children[0].material.anisotropy === 8 && ultraPbrModel.children[0].castShadow === true,
        'optimizeModelForGpuTier must preserve full PBR maps, shadows, and 8x anisotropy on ultra GPU tier');
}

// 6. ChronicleStoryWeaver (5-Act Arc, Episodic Callbacks, AI Director Pacing & Anti-Repetition Guard)
{
    const ChronicleStoryWeaver = require(path.join(jsDir, 'chronicle/chronicle-story-weaver.js'));
    const weaver = new ChronicleStoryWeaver.ChronicleStoryWeaverController();
    check(weaver.preserveVoiceProfile === true, 'ChronicleStoryWeaver must strictly preserve existing Lorekeeper TTS voice profile');

    const act1 = ChronicleStoryWeaver.resolveMythicAct(2, 'angband');
    const act4 = ChronicleStoryWeaver.resolveMythicAct(30, 'nethack');
    check(act1.act === 1 && act4.act >= 3, 'resolveMythicAct must map shallow and deep delves onto the 5-act mythic structure');

    weaver.recordStoryBeat({ kind: 'near_death_scar', turn: 120, depth: 8, realm: 'angband', subject: 'Lagduf the Snaga', hpRatio: 0.14 });
    weaver.recordStoryBeat({ kind: 'relic_found', turn: 210, depth: 12, realm: 'angband', subject: 'Blade of Westernesse', detail: 'won from an orc vault' });

    const callbacks = weaver.buildCallbackContext({ monster: 'Lagduf the Snaga', wieldedWeapon: 'Blade of Westernesse' });
    check(callbacks.length === 2 && callbacks.some(c => c.type === 'nemesis_callback') && callbacks.some(c => c.type === 'relic_lineage'),
        'buildCallbackContext must surface both nemesis scar and weapon lineage callbacks');

    const quietPacing = weaver.evaluateNarrativePacing({ turn: 220, depth: 12, hpRatio: 0.95, realm: 'angband' });
    check(quietPacing.tier === 'ambient' && quietPacing.shouldNarrate === true, 'First ambient check after long gap must allow concise narration');
    const throttledQuiet = weaver.evaluateNarrativePacing({ turn: 225, depth: 12, hpRatio: 0.95, realm: 'angband' });
    check(throttledQuiet.shouldNarrate === false, 'Routine exploration 5 turns later must be throttled by AI Director cooldown');

    const crisisPacing = weaver.evaluateNarrativePacing({ turn: 226, depth: 12, hpRatio: 0.18, hpDropRatio: 0.35, isBoss: true, realm: 'angband' });
    check(crisisPacing.tier === 'climax' && crisisPacing.shouldNarrate === true && crisisPacing.cooldownTurns === 0,
        'Mortal peril / boss crisis must bypass cooldown and trigger immediate climax narration');

    const repetitiveLine = 'In the shadows of the vault, your blade strikes true.';
    const diversified = weaver.diversityGuard.diversifyUtterance(repetitiveLine, 'angband');
    check(diversified !== repetitiveLine && !diversified.toLowerCase().startsWith('in the shadows'),
        'PhraseDiversityGuard must rewrite overused stock openings into varied realm-authentic lead-ins');

    const directive = weaver.composeStoryDirective({ turn: 300, depth: 25, hpRatio: 0.22, monster: 'Lagduf the Snaga', realm: 'angband' });
    check(directive.preserveVoiceProfile === true && directive.promptSupplement.includes('CONTINUITY CALLBACK') && directive.promptSupplement.includes('BANNED REPETITIVE OPENINGS'),
        'composeStoryDirective must include Act, Pacing, Continuity Callbacks, and Banned Openings');
}

// 7. Cross-Realm Menu Fidelity: Equipment Take-Off, Wand/Rod/Staff/Horn Separation, ActionCatalog Coexistence & Active Verb Prompt Safety
{
    global.ActionCatalog = require(path.join(jsDir, 'action-catalog.js'));
    const eqAngband = RealmGrimoireDeck.getAvailableVerbsForItem('armor', 'angband', { isEquipScreen: true, itemDesc: 'Soft Leather Armour [4,+2]' });
    check(eqAngband[0].verb === 't' && eqAngband.some(v => v.verb === 'A'), 'Angband Equipment screen primary verb must be Take Off (t) and include Activate (A)');

    const eqSilq = RealmGrimoireDeck.getAvailableVerbsForItem('armor', 'silq', { isEquipScreen: true, itemDesc: 'Mail Corslet (-1, 2d4)' });
    check(eqSilq[0].verb === 'r' && eqSilq.some(v => v.verb === 'x'), 'Sil-Q Equipment screen primary verb must be Take Off (r) and Inspect (x)');

    const eqNhArmor = RealmGrimoireDeck.getAvailableVerbsForItem('armor', 'nethack', { isEquipScreen: true, itemDesc: 'a blessed +2 dwarvish mithril-coat (being worn)' });
    const eqNhRing = RealmGrimoireDeck.getAvailableVerbsForItem('jewelry', 'nethack', { isEquipScreen: true, itemDesc: 'an uncursed ring of conflict (on right hand)' });
    check(eqNhArmor[0].verb === 'T' && eqNhRing[0].verb === 'R', 'NetHack Equipment screen must use T for worn armor and R for worn jewelry');

    const wandVerbs = RealmGrimoireDeck.getAvailableVerbsForItem('device', 'angband', { itemDesc: 'a Wand of Teleport Other (5 charges)' });
    const rodVerbs = RealmGrimoireDeck.getAvailableVerbsForItem('device', 'angband', { itemDesc: 'a Rod of Recall' });
    const staffVerbs = RealmGrimoireDeck.getAvailableVerbsForItem('device', 'angband', { itemDesc: 'a Staff of Perception (8 charges)' });
    const silqHorn = RealmGrimoireDeck.getAvailableVerbsForItem('misc', 'silq', { itemDesc: 'a Horn of Terror' });
    check(wandVerbs[0].verb === 'a' && rodVerbs[0].verb === 'z' && staffVerbs[0].verb === 'u' && silqHorn[0].verb === 'p',
        'Device verbs must strictly distinguish Aim Wand (a), Zap Rod (z), Use Staff (u), and Sil-Q Play Horn (p)');

    const activePromptVerbs = RealmGrimoireDeck.getAvailableVerbsForItem('potion', 'angband', { isItemTargetPrompt: true, itemDesc: 'a Potion of Healing' });
    check(activePromptVerbs.length === 1 && activePromptVerbs[0].verb === '',
        'When engine is already at an active verb prompt, primary card action must have empty verb so only slot letter is sent');

    const bitmaskVerbs = RealmGrimoireDeck.getAvailableVerbsForItem('potion', 'angband', { item: { vm: 1, name: 'Potion of Speed' } });
    check(bitmaskVerbs.length > 0 && Boolean(bitmaskVerbs[0].label) && bitmaskVerbs[0].verb === 'q',
        'Authoritative C-bridge bitmask (item.vm) with global ActionCatalog loaded must resolve defined label and verb key');

    global.ScreenContext = require(path.join(jsDir, 'screen-context.js'));
    const MenuRouter = require(path.join(jsDir, 'menu-router.js'));
    const QuickActions = require(path.join(jsDir, 'quick-actions.js'));
    const sentKeys = [];
    MenuRouter.setSendKey((k) => sentKeys.push(k));

    const angbandFixturePath = path.join(__dirname, '..', 'fixtures', 'menus', 'angband', 'inventory.json');
    const angbandInvenFrame = JSON.parse(fs.readFileSync(angbandFixturePath, 'utf8')).frame;
    MenuRouter.clearPending();
    const routed = MenuRouter.route('e', angbandInvenFrame, 'angband');
    MenuRouter.chooseVerb('w');
    check(routed === true && sentKeys.join(',') === 'escape,w' && MenuRouter.getPending() && MenuRouter.getPending().step === 'await-prompt',
        'MenuRouter passive Angband inventory verb click must send [escape, w] and await wear prompt without double-escape collision');

    const angbandWearPromptFrame = {
        phase: 'play',
        realm: 'angband',
        map: angbandInvenFrame.map,
        term: {
            rows: [
                { g: '  e) a Wooden Torch (5000 turns)                     2.2 lb' },
                { g: 'Wear/Wield which item?' }
            ]
        }
    };
    MenuRouter.onFrame(angbandWearPromptFrame, 'angband');
    check(sentKeys.join(',') === 'escape,w,e' && MenuRouter.getPending() === null,
        'MenuRouter.onFrame must complete frame-verified [escape -> w -> e] transaction and clear pending state');

    const qa = new QuickActions.QuickActionController({ sendKey: () => {} });
    let qaToast = '';
    const qaBound = qa.bindFromGrimoire(
        { key: 'b', verb: 'q', name: 'Potion of Healing', category: 'potion', icon: '🧪' },
        { player: { name: 'Tester', inventory: [{ label: 'b', name: '3 Potions of Healing', tval: 71, sval: 38 }] } },
        'angband',
        (msg) => { qaToast = msg; }
    );
    check(qaBound && qaBound.slotIdx === 1 && qaBound.slotDef.tval === 71 && qaToast.includes('Alt+2'),
        'QuickActionController.bindFromGrimoire must bind potion to Quick Slot 2 (Alt+2) with authoritative tval/sval');

    const remedyContainer = {
        style: { display: 'none' },
        innerHTML: '',
        addEventListener: () => {}
    };
    RealmGrimoireDeck.setMode('hybrid');
    RealmGrimoireDeck.render(remedyContainer, {
        realm: 'angband',
        classifier: { isInventoryScreen: true, mode: 'item-list', listKind: 'inven' },
        vitals: { hp: 18, maxHp: 100, statusText: 'Poisoned' },
        items: [{ key: 'a', desc: 'a Potion of Healing' }]
    });
    check(remedyContainer.innerHTML.includes('data-subprompt="tactical-remedy"') && remedyContainer.innerHTML.includes('Low HP'),
        'Grimoire Deck must render clickable Tactical Advisory remedy banner when player opens inventory at critical HP');

    // 8. Playable NetHack 3.6.7 -mbridge Engine Verification (Birth, 3D Map, Inventory, #pray, #dip Excalibur, SaveNHCK)
    const os = require('os');
    const { NetHackEngine } = require(path.join(__dirname, '..', '..', 'variants', 'nethack', 'bin', 'nethack-bridge.js'));
    const tmpSaveDir = path.join(os.tmpdir(), 'a3d_nh_test_' + process.pid);
    const nh = new NetHackEngine({ saveDir: tmpSaveDir, user: 'ValkyrieTest', isNew: true });
    const setupFrame = nh.buildFrame();
    check(setupFrame.phase === 'setup' && setupFrame.realm === 'nethack' && setupFrame.term.rows.length === 24,
        'NetHackEngine must start in setup phase with 80x24 role selection terminal');

    nh.handleKey('a'); // Select Valkyrie and enter play
    const playFrame = nh.buildFrame();
    check(playFrame.phase === 'play' && playFrame.player.class === 'Valkyrie' && playFrame.map.rows.length === 22,
        'NetHackEngine role selection must transition to play phase with 66x22 3D-compatible map and Valkyrie kit');

    nh.handleKey('i');
    const invFrame = nh.buildFrame();
    const nhClassified = ScreenContext.classify(invFrame, 'nethack');
    check(nhClassified.mode === 'item-list' && nhClassified.listKind === 'inven' && invFrame.player.inventory.length >= 6,
        'NetHackEngine inventory (i) must classify as item-list/inven in ScreenContext and populate player.inventory');

    nh.handleKey('Escape');
    nh.state.player.hp = 5;
    nh.handleKey('#pray');
    check(nh.state.player.hp === nh.state.player.hpMax,
        'NetHackEngine #pray ritual must restore player HP to full');

    const savedOk = nh.saveGame();
    const nhReloaded = new NetHackEngine({ saveDir: tmpSaveDir, user: 'ValkyrieTest', isNew: false });
    check(savedOk === true && nhReloaded.state.player.class === 'Valkyrie' && nhReloaded.state.phase === 'play',
        'NetHackEngine SaveNHCK binary .sav must round-trip cleanly');

    // Verify Altar (feat 43) & Fountain (feat 44) & Door (feat 2/3) codes never collide with Town Store Entrances (feat 7..14)
    let foundAltar = false;
    let foundFountain = false;
    for (const row of nhReloaded.state.map) {
        for (const cell of row) {
            if (cell.glyph === '_') {
                check(cell.feat === 43, `NetHack High Altar ('_') must use feat 43, never store door feat 8 (got ${cell.feat})`);
                foundAltar = true;
            }
            if (cell.glyph === '{') {
                check(cell.feat === 44, `NetHack Magic Fountain ('{') must use feat 44, never outdoor water feat 28 (got ${cell.feat})`);
                foundFountain = true;
            }
            if (cell.glyph === '+') {
                check(cell.feat === 2, `NetHack Closed Door ('+') must use feat 2 (got ${cell.feat})`);
            }
        }
    }
    check(foundAltar && foundFountain, 'NetHack dungeon level must spawn both a High Altar (feat 43) and a Magic Fountain (feat 44)');

    const EntityMenu = require(path.join(jsDir, 'entity-menu.js'));
    const altarActions = EntityMenu.buildActionsForEntity({ type: 'altar' }, 'nethack');
    const fountainActions = EntityMenu.buildActionsForEntity({ type: 'fountain' }, 'nethack');
    check(altarActions.some(a => a.key === '#pray') && altarActions.some(a => a.key === '#offer'),
        'EntityMenu must provide #pray and #offer actions for 3D High Altars');
    check(fountainActions.some(a => a.key === '#dip') && fountainActions.some(a => a.key === 'q'),
        'EntityMenu must provide #dip and quaff (q) actions for 3D Magic Fountains');

    const d3dSrc = fs.readFileSync(path.join(jsDir, 'dungeon3d.js'), 'utf8');
    check(d3dSrc.includes('this.altarMesh = new THREE.InstancedMesh') && d3dSrc.includes('[_] High Altar'),
        'dungeon3d.js must instantiate 3D High Altar mesh (feat 43) and floating label');
    check(d3dSrc.includes('this.fountainMesh = new THREE.InstancedMesh') && d3dSrc.includes('[{] Magic Fountain'),
        'dungeon3d.js must instantiate 3D Magic Fountain mesh (feat 44) and floating label');

    // 9. 8-Realm Yendor Engine (Rogue 1980, Brogue CE, DCSS), Domain Config, Lazarus Checkpoint & Death Modal Verification
    const domainConfig = require(path.join(__dirname, '..', '..', 'server', 'src', 'domain-config.js'));
    check(domainConfig.PRIMARY_DOMAIN === 'yasd3d.com' && domainConfig.VALID_REALMS.length === 8,
        'domain-config.js must declare PRIMARY_DOMAIN=yasd3d.com and all 8 VALID_REALMS');

    const all8Realms = ['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue'];
    for (const r of all8Realms) {
        check(RealmCartridge.listRealms().includes(r), `RealmCartridge must include ${r}`);
        check(Boolean(domainConfig.REALM_TO_MAGIC[r]), `domain-config must map ${r} to a unique 8-byte magic header`);
    }

    // 9a. Classic Rogue 5.4 (1980) Bridge
    const { RogueEngine } = require(path.join(__dirname, '..', '..', 'variants', 'rogue', 'bin', 'rogue-bridge.js'));
    const rogue = new RogueEngine({ saveDir: tmpSaveDir, user: 'Rodney1980', isNew: true });
    const rFrame = rogue.buildFrame();
    check(rFrame.realm === 'rogue' && rFrame.phase === 'play' && rFrame.player.inventory.length >= 4 && rFrame.term.rows.length === 24,
        'RogueEngine must start in play phase with 1980 Rogue kit and 80x24 terminal');
    rogue.handleKey('l');
    check(rogue.saveGame() === true, 'RogueEngine must write SaveROGU and .living.sav checkpoint');

    // Simulate death and verify Lazarus checkpoint is NOT overwritten and restores cleanly
    rogue.state.player.dead = true;
    rogue.state.player.hp = 0;
    rogue.state.player.killed_by = 'a Hobgoblin';
    check(rogue.saveGame() === false, 'RogueEngine must refuse to overwrite save file once player.dead === true');
    const rDeathFrame = rogue.buildFrame();
    const rSummary = RealmCartridge.formatDeathModalSummary(rDeathFrame, 'rogue');
    check(rSummary.cause.includes('Hobgoblin') && rSummary.eq.length >= 2,
        'formatDeathModalSummary must format Rogue death cause and partition worn equipment from inventory');
    const restoredRogue = domainConfig.restoreLivingCheckpoint(tmpSaveDir, 'Rodney1980');
    check(restoredRogue && restoredRogue.restored === true, 'restoreLivingCheckpoint must restore .living.sav');

    // 9b. Brogue CE Bridge
    const { BrogueEngine } = require(path.join(__dirname, '..', '..', 'variants', 'brogue', 'bin', 'brogue-bridge.js'));
    const brogue = new BrogueEngine({ saveDir: tmpSaveDir, user: 'BrogueTest', isNew: true });
    const bFrame = brogue.buildFrame();
    check(bFrame.realm === 'brogue' && bFrame.phase === 'play' && bFrame.player.stats.str.use === 12,
        'BrogueEngine must start in play phase on Depth 1 with Strength 12');
    const bStatsHtml = RealmCartridge.buildDeathStatsHtml(bFrame.player, 'brogue');
    check(bStatsHtml.includes('LUMENSTONES') && bStatsHtml.includes('NUTRITION'),
        'buildDeathStatsHtml for Brogue must render LUMENSTONES and NUTRITION cards');

    // 9c. Dungeon Crawl Stone Soup (DCSS) Bridge & Cross-Realm Custom/Random Birth + Procedural Variety
    const { DCSSEngine } = require(path.join(__dirname, '..', '..', 'variants', 'dcss', 'bin', 'dcss-bridge.js'));
    const dcss = new DCSSEngine({ saveDir: tmpSaveDir, user: 'MiBeTest', isNew: true });
    check(dcss.buildFrame().phase === 'setup', 'DCSSEngine must start in combo selection setup screen on new game');
    dcss.handleKey('a'); // Select Minotaur Berserker (Trog)
    const dFrame = dcss.buildFrame();
    check(dFrame.phase === 'play' && dFrame.player.god === 'Trog' && dFrame.player.place_label === 'Dungeon:1',
        'DCSSEngine combo a must spawn Minotaur Berserker of Trog on Dungeon:1');
    const dSummary = RealmCartridge.formatDeathModalSummary(dFrame, 'dcss');
    check(dSummary.score.includes('Runes:') && dSummary.score.includes('Trog'),
        'formatDeathModalSummary for DCSS must display Runes of Zot and Deity');

    const dcssRand = new DCSSEngine({ saveDir: tmpSaveDir, user: 'DcssRandTest', isNew: true });
    dcssRand.handleKey('*');
    check(dcssRand.buildFrame().phase === 'play', 'DCSSEngine must support * Quick Start random combo in setup phase');

    const brogueCustom = new BrogueEngine({ saveDir: tmpSaveDir, user: 'BrogueCustomTest', isNew: true, customBirth: true });
    check(brogueCustom.buildFrame().phase === 'setup', 'BrogueEngine with customBirth (-c) must start in setup phase for Loadout selection');
    brogueCustom.handleKey('*');
    check(brogueCustom.buildFrame().phase === 'play', 'BrogueEngine must transition from setup to play on * random loadout');

    const rogueCustom = new RogueEngine({ saveDir: tmpSaveDir, user: 'RogueCustomTest', isNew: true, customBirth: true });
    check(rogueCustom.buildFrame().phase === 'setup', 'RogueEngine with customBirth (-c) must start in setup phase');
    rogueCustom.handleKey('c');
    check(rogueCustom.buildFrame().phase === 'play' && rogueCustom.state.player.class === 'Archivist',
        'RogueEngine setup selection c must spawn Archivist kit');

    const nhRand = new NetHackEngine({ saveDir: tmpSaveDir, user: 'NhRandTest', isNew: true });
    nhRand.handleKey('*');
    check(nhRand.buildFrame().phase === 'play', 'NetHackEngine must support * Quick Start random role selection in setup phase');

    // 9c-fountain. Verify NetHack Fountain Quaff [y/n] Confirmation & Mobile Sub-Prompt Classification
    const pCell = nhRand.state.map[nhRand.state.player.y][nhRand.state.player.x];
    pCell.feat = 44; // FEAT.FOUNTAIN
    if (!nhRand.state.player.inventory.some(it => it.kind === 'potion')) {
        nhRand.state.player.inventory.push({ letter: 'd', kind: 'potion', name: 'potion of healing', count: 1, buc: 'blessed', weight: 20, tval: 71, sval: 38, heal: 14 });
    }
    nhRand.handleKey('q');
    const fPromptFrame = nhRand.buildFrame();
    const fMsg = nhRand.state.pendingPrompt || (fPromptFrame.ui && fPromptFrame.ui.prompt && fPromptFrame.ui.prompt.text) || '';
    check(nhRand.state.pendingVerb === 'q' && /Drink from the fountain\? \[y\/n\]/i.test(fMsg),
        'Pressing q on a NetHack fountain must prompt Drink from the fountain? [y/n]');
    const fSub = ScreenModalCoordinator.classifySubPrompt(fMsg, 'nethack');
    check(fSub.kind === 'confirm-yn' && Array.isArray(fSub.options) && fSub.options.length === 2,
        'ScreenModalCoordinator.classifySubPrompt must classify fountain prompt as confirm-yn for mobile [y]/[n] buttons');
    nhRand.handleKey('n');
    const afterNoMsg = nhRand.state.pendingPrompt;
    check(nhRand.state.pendingVerb === 'q' && /What do you want to drink\?/i.test(afterNoMsg),
        'Pressing n on a NetHack fountain prompt must switch to potion inventory selection instead of drinking from fountain');
    nhRand.handleKey('escape');
    nhRand.handleKey('q');
    nhRand.handleKey('y');
    const afterYesMsg = nhRand.state.messages[nhRand.state.messages.length - 1];
    const afterYesText = typeof afterYesMsg === 'string' ? afterYesMsg : (afterYesMsg && afterYesMsg.text) || '';
    check(!nhRand.state.pendingVerb && /cool draught refreshes your spirit/i.test(afterYesText),
        'Pressing y on a NetHack fountain prompt must drink from the fountain and close pendingVerb');

    // 9d. Verify CREDITS.md & YASD 3D Emblem Asset
    const rootDir = path.resolve(__dirname, '../..');
    check(fs.existsSync(path.join(rootDir, 'CREDITS.md')), 'CREDITS.md must exist at repo root');
    check(fs.existsSync(path.join(rootDir, 'server/public/assets/yasd3d_logo.png')), 'yasd3d_logo.png must exist in server/public/assets');

    // 9e. Authoritative Realm XP & Level Advancement Rules Verification
    // Brogue: Zero XP and Zero Character Levels
    const broguePlay = new BrogueEngine({ saveDir: tmpSaveDir, user: 'BrogueXpTest', isNew: true });
    const bFrame0 = broguePlay.buildFrame();
    check(bFrame0.player.level === 0 && bFrame0.player.exp === 0 && bFrame0.player.exp_next === 0,
        'BrogueEngine must emit level:0, exp:0, exp_next:0 (zero character levels)');
    broguePlay.handleMonsterKilled({ id: 999, race: 'goblin', exp: 0 });
    const bFrame1 = broguePlay.buildFrame();
    check(bFrame1.player.level === 0 && bFrame1.player.exp === 0 && bFrame1.player.exp_next === 0,
        'BrogueEngine monster kills must never grant XP or character levels');

    // Classic Rogue 5.4: Authentic e_levels [10, 20, 40, 80, ...] + multi-level loop + raise level potion
    const roguePlay = new RogueEngine({ saveDir: tmpSaveDir, user: 'RogueXpTest', isNew: true });
    const rFrame0 = roguePlay.buildFrame();
    check(rFrame0.player.level === 1 && rFrame0.player.exp === 0 && rFrame0.player.exp_next === 10,
        'RogueEngine must start at Level 1 with exp_next: 10 (authentic BSD Rogue 5.4 e_levels[0])');
    roguePlay.handleMonsterKilled({ id: 998, race: 'troll', exp: 45 });
    const rFrame1 = roguePlay.buildFrame();
    check(rFrame1.player.level === 4 && rFrame1.player.exp === 45 && rFrame1.player.exp_next === 80,
        'RogueEngine 45 XP gain must multi-level advance from L1 -> L4 (thresholds 10, 20, 40; next 80)');
    roguePlay.state.player.inventory.push({ letter: 'z', kind: 'potion', name: 'potion of raise level', levelGain: 1, count: 1 });
    roguePlay.applyVerbToItem('quaff', roguePlay.state.player.inventory[roguePlay.state.player.inventory.length - 1]);
    const rFrame2 = roguePlay.buildFrame();
    check(rFrame2.player.level === 5 && rFrame2.player.exp === 80 && rFrame2.player.exp_next === 160,
        'RogueEngine potion of raise level must synchronize level:5, exp:80, exp_next:160');

    // DCSS 0.32: XL 1..27 progression + attribute increase every 3rd XL
    const dcssPlay = new DCSSEngine({ saveDir: tmpSaveDir, user: 'DcssXpTest', isNew: true });
    dcssPlay.handleKey('a'); // Minotaur Berserker (Str 20)
    const strBefore = dcssPlay.state.player.str;
    check(dcssPlay.buildFrame().player.exp_next === 10, 'DCSSEngine XL1 must require 10 XP for XL2');
    dcssPlay.handleMonsterKilled({ id: 997, race: 'ogre', exp: 75 });
    const dFrameAfter = dcssPlay.buildFrame();
    check(dFrameAfter.player.level === 4 && dFrameAfter.player.exp_next === 140 && dcssPlay.state.player.str === strBefore + 1,
        'DCSSEngine 75 XP must advance to XL4 (exp_next:140) and grant +1 primary stat at XL3');

    // NetHack 3.6.7: Authentic newuexp(lev) thresholds + pet kills + potion of gain level
    const nhPlay = new NetHackEngine({ saveDir: tmpSaveDir, user: 'NhXpTest', isNew: true });
    nhPlay.handleKey('a');
    check(nhPlay.buildFrame().player.exp_next === 20, 'NetHackEngine XL1 must require 20 XP for XL2');
    nhPlay.handleMonsterDefeat({ id: 996, race: 'kobold', exp: 25 });
    check(nhPlay.buildFrame().player.level === 2 && nhPlay.buildFrame().player.exp_next === 40,
        'NetHackEngine 25 XP must advance to XL2 with exp_next: 40 (newuexp(2))');
    nhPlay.state.player.inventory.push({ letter: 'y', kind: 'potion', name: 'potion of gain level', buc: 'uncursed', count: 1 });
    nhPlay.executeItemVerb('q', 'y');
    const nhAfterPot = nhPlay.buildFrame();
    check(nhAfterPot.player.level === 3 && nhAfterPot.player.exp === 40 && nhAfterPot.player.exp_next === 80,
        'NetHackEngine potion of gain level must synchronize level:3, exp:40, exp_next:80');

    // C/C++ Bridges: Sil-Q new_exp pool, FrogComposband exp_requirement, Hengband exp_next (checked when local variant source trees are present)
    const silqBridgePath = path.join(rootDir, 'variants/silq-src/src/main-bridge.c');
    if (fs.existsSync(silqBridgePath)) {
        const silqBridgeSrc = fs.readFileSync(silqBridgePath, 'utf8');
        check(silqBridgeSrc.includes('bj_kv_int(fp, "new_exp", p_ptr->new_exp)') && silqBridgeSrc.includes('bj_kv_int(fp, "level", 0)'),
            'Sil-Q C bridge must emit new_exp pool and level:0');
    }
    const frogBridgePath = path.join(rootDir, 'variants/frogcomposband-src/src/main-bridge.c');
    if (fs.existsSync(frogBridgePath)) {
        const frogBridgeSrc = fs.readFileSync(frogBridgePath, 'utf8');
        check(frogBridgeSrc.includes('"exp_next"') && frogBridgeSrc.includes('exp_requirement(p_ptr->lev)'),
            'FrogComposband C bridge must emit exp_next via exp_requirement(p_ptr->lev)');
    }
    const hengBridgePath = path.join(rootDir, 'variants/hengband-src/src/main-bridge.cpp');
    if (fs.existsSync(hengBridgePath)) {
        const hengBridgeSrc = fs.readFileSync(hengBridgePath, 'utf8');
        check(hengBridgeSrc.includes('"exp_next"') && hengBridgeSrc.includes('player_exp_a') && hengBridgeSrc.includes('player.expfact'),
            'Hengband C++ bridge must emit exp_next using player_exp / player_exp_a and player.expfact');
    }

    // v11.5.0 Pillar 3 & 4: Intelligent 8-Realm Birth Planner & Brogue Scroll of Enchantment
    for (const rId of ['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue']) {
        const planner = RealmCartridge.createRandomBirthPlanner(rId, 'melee');
        check(planner && planner.realmId === rId && Array.isArray(planner.silqStatSequence),
            `createRandomBirthPlanner must exist and return valid plan for ${rId}`);
    }
    const silqPlan = RealmCartridge.createRandomBirthPlanner('silq', 'melee');
    check(silqPlan.silqStatSequence.length > 5 && silqPlan.silqStatSequence.includes('enter'),
        'Sil-Q Birth Planner must allocate point-buy stats before pressing enter');

    const brogueEnch = new BrogueEngine({ saveDir: tmpSaveDir, user: 'BrogueEnchTest', isNew: true });
    brogueEnch.handleKey('a');
    const enchScroll = brogueEnch.state.player.inventory.find(it => /enchant/i.test(it.name));
    if (enchScroll) {
        const prevEnch = brogueEnch.state.player.inventory[0].enchant || 0;
        brogueEnch.executeItemVerb('r', enchScroll.letter);
        const totalEnch = brogueEnch.state.player.inventory.reduce((s, it) => s + (it.enchant || 0), 0);
        check(totalEnch > prevEnch, 'Brogue Scroll of Enchantment must increase item enchantment');
    }

    try { fs.rmSync(tmpSaveDir, { recursive: true, force: true }); } catch (_) {}
}

console.log(`[PASS] universal_cartridge.test.js — ${passed}/${passed} assertions verified (100% IP-Clean).`);

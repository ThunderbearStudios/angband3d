/**
 * test_v12_3_0_overhaul.js — End-to-End Verification Gate for YASD 3D v12.3.0 Overhaul (WS-1..WS-8)
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB_JS = path.join(ROOT, 'server', 'public', 'js');

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

function readRel(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// WS-1: Unified Vertex AI Failover & Dual-Mode YASD Sketch Composer
// ---------------------------------------------------------------------------
{
    const Composer = require(path.join(PUB_JS, 'chronicle', 'yasd-sketch-composer.js'));
    check(typeof Composer.renderMasterworkCanvasSketch === 'function', 'WS-1: YasdSketchComposer exports renderMasterworkCanvasSketch');
    check(typeof Composer.downloadYasdShareCard === 'function', 'WS-1: YasdSketchComposer exports downloadYasdShareCard');
    check(typeof Composer.detectHeroStatuses === 'function', 'WS-1: YasdSketchComposer exports detectHeroStatuses');

    // Light mock canvas exercise of renderMasterworkCanvasSketch (verifies architectural woodcut pipeline)
    const savedDoc = global.document;
    const ops = [];
    const noop = () => {};
    const mockGrad = { addColorStop: noop };
    const mockCtx = new Proxy({}, {
        get(_t, prop) {
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => mockGrad;
            if (prop === 'measureText') return (s) => ({ width: String(s || '').length * 7 });
            return (...args) => { ops.push(prop); };
        },
        set() { return true; }
    });
    global.document = {
        createElement(tag) {
            if (tag === 'canvas') {
                return { width: 0, height: 0, getContext: () => mockCtx, toDataURL: () => 'data:image/png;base64,WOODCUT_OK' };
            }
            return {};
        }
    };
    try {
        const url = Composer.renderMasterworkCanvasSketch({
            hero: { name: 'Alden', level: 4, race: 'High-Elf', class: 'Ranger', hp: 0, hp_max: 32 },
            realm: 'angband',
            locationLabel: 'Depth 4 (200 ft)',
            narrativeText: 'Slain by an ancient red dragon in the vaults.',
            visibleMonsters: [{ name: 'ancient red dragon', glyph: 'D' }]
        });
        check(url === 'data:image/png;base64,WOODCUT_OK', 'WS-1: renderMasterworkCanvasSketch renders woodcut plate');
        check(ops.includes('fillText') && ops.includes('strokeRect'), 'WS-1: Woodcut composer emits drawing primitives');
    } finally {
        global.document = savedDoc;
    }

    const SketchSvc = require(path.join(ROOT, 'server', 'src', 'sketch-service.js'));
    const sanitized = SketchSvc.sanitizeSketchPrompt('Hero was overwhelmed, felled by foes, leaving skeletal remains and a dead body.');
    check(!/\boverwhelmed\b/i.test(sanitized) && !/\bskeletal remains\b/i.test(sanitized) && !/\bdead body\b/i.test(sanitized),
        'WS-1: sanitizeSketchPrompt replaces safety-sensitive mortality tokens');

    const payload = JSON.parse(SketchSvc.buildSketchPayload('Dramatic dungeon duel', 'gemini-nano-banana-2.1'));
    check(payload && payload.generationConfig && payload.generationConfig.thinkingConfig &&
        payload.generationConfig.thinkingConfig.thinkingLevel === 'MINIMAL',
    'WS-1: gemini-nano-banana-2.1 uses MINIMAL thinkingLevel');

    const srvSrc = readRel('server/src/server.js');
    check(srvSrc.includes('_aiStudioDepletedUntil'), 'WS-1: server.js shares _aiStudioDepletedUntil circuit breaker');
    check(srvSrc.includes("update(realm + ':' + prompt.trim())"), 'WS-1: server.js hashes full realm + prompt cache key');
    check(srvSrc.includes("'gemini-nano-banana-2.1'") && srvSrc.includes("'gemini-3.1-flash-image'") && srvSrc.includes("'gemini-2.5-flash-image'"),
        'WS-1: server.js preserves all 3 pinned SKETCH_MODELS');
}

// ---------------------------------------------------------------------------
// WS-2: Enceladus Main Narrator + Distinct Color Voices & Clean Male Pools
// ---------------------------------------------------------------------------
{
    const ChronicleGrounder = require(path.join(PUB_JS, 'chronicle', 'chronicle-grounder.js'));
    const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod'];
    for (const r of REALMS) {
        check(ChronicleGrounder.getLorekeeperVoice(r, 'male') === 'Enceladus',
            `WS-2: Main ambient narrator for ${r} is Enceladus`);
    }

    const mentorExpect = [
        ['Corwin', 'frogcomposband', 'Orus'],
        ['Musashi', 'hengband', 'Charon'],
        ['Daeron', 'silq', 'Schedar'],
        ['Brother Thomas', 'nethack', 'Iapetus'],
        ['High Archivist', 'dcss', 'Sadachbia'],
        ['The Warden', 'brogue', 'Algenib'],
        ['Elrond', 'angband', 'Gacrux']
    ];
    for (const [name, rk, expectedGemini] of mentorExpect) {
        const mv = ChronicleGrounder.getMentorColorVoice(name, rk, 'counsel');
        check(mv && mv.geminiVoice === expectedGemini,
            `WS-2: Mentor counsel voice for ${rk} (${name}) resolves ${expectedGemini} (got ${mv && mv.geminiVoice})`);
    }

    const malePools = [];
    for (const [k, pool] of Object.entries(ChronicleGrounder.BEST_VOICE_POOLS || {})) {
        if (pool && pool.male && Array.isArray(pool.male.gemini)) malePools.push([k, pool.male.gemini]);
        if (k === 'mortal') {
            for (const age of Object.keys(pool)) {
                if (pool[age] && pool[age].male && Array.isArray(pool[age].male.gemini)) {
                    malePools.push([`mortal.${age}`, pool[age].male.gemini]);
                }
            }
        }
    }
    check(malePools.length >= 10, 'WS-2: Male voice pools scanned');
    for (const [poolName, voices] of malePools) {
        check(!voices.includes('Sulafat'), `WS-2: Female voice Sulafat purged from male pool ${poolName}`);
    }

    const appSrc = readRel('server/public/js/app.js');
    check(appSrc.includes("realmKey === 'frogcomposband' ? 'amber'"), 'WS-2: app.js tradition map routes frogcomposband to amber');
}

// ---------------------------------------------------------------------------
// WS-3: 60fps DPR Governor, Smooth Stride & UI_SEQ_IN_MEMO_SIG Guardrail
// ---------------------------------------------------------------------------
{
    const d3dSrc = readRel('server/public/js/dungeon3d.js');
    check(d3dSrc.includes('renderGovernor.getEffectivePixelRatio') && d3dSrc.includes('_adaptiveDpr'),
        'WS-3: dungeon3d.js includes adaptive DPR governor integration');
    check(d3dSrc.includes('this._strideChain'), 'WS-3: dungeon3d.js implements smooth stride chaining');

    const inputSrc = readRel('server/public/js/input.js');
    const ctxMatch = inputSrc.match(/const ctxTileSig = ([^;]+);/);
    check(ctxMatch && !ctxMatch[1].includes('frame.seq'), 'WS-3/WS-6: ctxTileSig excludes frame.seq (UI_SEQ_IN_MEMO_SIG)');
}

// ---------------------------------------------------------------------------
// WS-4: Town Architecture Module & Cross-Realm Storefront Labels
// ---------------------------------------------------------------------------
{
    const Town = require(path.join(PUB_JS, 'dungeon3d-town.js'));
    check(typeof Town.computeTownClusters === 'function', 'WS-4: Dungeon3DTown exports computeTownClusters');
    check(typeof Town.buildTownArchitecture === 'function', 'WS-4: Dungeon3DTown exports buildTownArchitecture');
    check(typeof Town.disposeTownArchitecture === 'function', 'WS-4: Dungeon3DTown exports disposeTownArchitecture');

    const d3dSrc = readRel('server/public/js/dungeon3d.js');
    check(d3dSrc.includes('isCartridgeTown') && d3dSrc.includes('Quartermaster Hall') && d3dSrc.includes('Castle & Guild Hall'),
        'WS-4: Storefront signage adapts labels across Angband, Hengband/FCB, and Cartridge towns');
}

// ---------------------------------------------------------------------------
// WS-5: Hengband Bilingual UI & Fixture Save Filtering
// ---------------------------------------------------------------------------
{
    const HengT = require(path.join(PUB_JS, 'heng', 'heng-translate.js'));
    check(HengT.translateLine('何かキーを押して下さい') === 'Press any key to continue',
        'WS-5: HengTranslate translates Japanese pause prompt');
    const prayerRow = HengT.translateRow('あと 1 つの祈りを学べる。');
    check(prayerRow && prayerRow.text === 'You can learn 1 more prayer.',
        'WS-5: HengTranslate translates prayer learning notification');

    const saveRoutesSrc = readRel('server/src/save-vault-routes.js');
    check(saveRoutesSrc.includes('isFixtureSaveFile') && /smoke_|demo_|TestOne/.test(saveRoutesSrc),
        'WS-5: save-vault-routes.js filters fixture save files from user rosters');
}

// ---------------------------------------------------------------------------
// WS-6: NetHack Extended Action Parity & Contextual Action Bar Pills
// ---------------------------------------------------------------------------
{
    const ActionCatalog = require(path.join(PUB_JS, 'action-catalog.js'));
    const RealmKeys = require(path.join(PUB_JS, 'realm-keys.js'));
    check(ActionCatalog.keyFor('pray', 'nethack') === '#pray', 'WS-6: NetHack pray resolves #pray');
    check(ActionCatalog.keyFor('offer', 'nethack') === '#offer', 'WS-6: NetHack offer resolves #offer');
    check(ActionCatalog.keyFor('dip', 'nethack') === '#dip', 'WS-6: NetHack dip resolves #dip');
    check(ActionCatalog.keyFor('chat', 'nethack') === '#chat', 'WS-6: NetHack chat resolves #chat');
    check(RealmKeys.key('pray', 'nethack') === '#pray', 'WS-6: RealmKeys.key mirrors NetHack #pray');

    const inputSrc = readRel('server/public/js/input.js');
    check(inputSrc.includes("applyCtxPill('btn-context-tile'") && inputSrc.includes("'btn-context-alt'"),
        'WS-6: InputController wires contextual tile action pills');
    check(inputSrc.includes("'btn-context-tile', 'btn-context-alt'"),
        'WS-6: ACTION_PRIORITY registers contextual pills for bar layout');
}

// ---------------------------------------------------------------------------
// WS-7: 1-Hop Splash -> Main Menu, Slide-Over Realm Atlas & 9x 16:9 Art Plates
// ---------------------------------------------------------------------------
{
    const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod'];
    for (const r of REALMS) {
        const imgPath = path.join(ROOT, 'server', 'public', 'assets', 'realms', `${r}.webp`);
        check(fs.existsSync(imgPath), `WS-7: Realm art exists at ${r}.webp`);
        const buf = fs.readFileSync(imgPath);
        check(buf.length >= 15000, `WS-7: ${r}.webp size (${buf.length} B) >= 15000 B`);
        check(buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP',
            `WS-7: ${r}.webp has valid RIFF/WEBP header`);
    }

    const appSrc = readRel('server/public/js/app.js');
    const splashMatch = appSrc.match(/function enterFromSplash\(\)\s*\{([\s\S]{0,300})\}/);
    check(splashMatch && splashMatch[1].includes('showMainMenu()'),
        'WS-7: enterFromSplash() routes 1-hop directly to showMainMenu()');
    const ryodDataMatch = appSrc.match(/ryod:\s*\{[\s\S]*?\n\s{8}\}/);
    check(ryodDataMatch && !ryodDataMatch[0].includes('Enceladus'),
        'WS-7: REALM_DATA.ryod omits spurious Enceladus narrator label');

    const rcCss = readRel('server/public/css/realm-cards.css');
    check(!rcCss.includes('#38bdf8'), 'WS-7: realm-cards.css obeys anti-halation palette (zero #38bdf8)');
    check(rcCss.includes('justify-content: flex-end') && rcCss.includes('#realm-selector-modal.modal-overlay'),
        'WS-7: realm-cards.css styles #realm-selector-modal as right-anchored slide-over drawer');
}

// ---------------------------------------------------------------------------
// WS-8: RYOD 3.0 Casual Arcade Toybox, Stackable Twists & Cartridge Gameplay
// ---------------------------------------------------------------------------
{
    global.RealmContentPool = require(path.join(PUB_JS, 'realm-content-pool.js'));
    const RyodCompiler = require(path.join(PUB_JS, 'ryod-compiler.js'));
    const RyodSystems = require(path.join(ROOT, 'server', 'src', 'cartridges', 'ryod-systems.js'));
    const Cartridge = require(path.join(ROOT, 'server', 'src', 'cartridges', 'cartridge-core.js'));

    // 8.1 Mutator stacking (0..3), legacy hash compatibility, boss_rush 8F default
    const single = RyodCompiler.normalizeConfig({ biome: 'obsidian', heroOrigin: 'warrior', mutators: ['blood_moon'], seed: 777123 });
    const legacy = RyodCompiler.normalizeConfig({ biome: 'obsidian', heroOrigin: 'warrior', mutatorId: 'blood_moon', seed: 777123 });
    check(single.ryodHash === legacy.ryodHash, `WS-8: Single-mutator RYOD hash matches legacy (${single.ryodHash})`);

    const capped = RyodCompiler.normalizeConfig({
        biome: 'obsidian',
        heroOrigin: 'warrior',
        mutators: ['loot_pinata', 'vampire_thirst', 'floor_collapse', 'boss_rush'],
        seed: 777123
    });
    check(Array.isArray(capped.mutators) && capped.mutators.length === 3, 'WS-8: Stacked mutators capped at 3');
    check(capped.mutators[2] === 'floor_collapse', 'WS-8: First 3 mutators preserved deterministically');

    const bossRushBp = RyodCompiler.normalizeConfig({ biome: 'shadow_keep', heroOrigin: 'samurai', mutators: ['boss_rush'], seed: 555 });
    check(bossRushBp.goalDepth === 8, 'WS-8: boss_rush defaults goalDepth to 8F');

    const stacked = RyodCompiler.normalizeConfig({
        biome: 'obsidian',
        heroOrigin: 'warrior',
        mutators: ['loot_pinata', 'vampire_thirst', 'floor_collapse'],
        seed: 888999
    });
    const code = RyodCompiler.encodePermalink(stacked);
    const decoded = RyodCompiler.decodePermalink(code);
    check(decoded && Array.isArray(decoded.mutators) && decoded.mutators.join(',') === 'loot_pinata,vampire_thirst,floor_collapse',
        'WS-8: Permalink round-trips 3 stacked mutators');

    // 8.2 Arcade Adventures & Deterministic Daily Blitz
    check(Array.isArray(RyodCompiler.ARCADE_ADVENTURES) && RyodCompiler.ARCADE_ADVENTURES.length === 6,
        'WS-8: RyodCompiler provides 6 ARCADE_ADVENTURES presets');
    const blitzA = RyodCompiler.rollDailyBlitzBlueprint('2026-11-13');
    const blitzB = RyodCompiler.rollDailyBlitzBlueprint('2026-11-13');
    check(blitzA.seed === blitzB.seed && blitzA.ryodHash === blitzB.ryodHash,
        'WS-8: rollDailyBlitzBlueprint is deterministic per UTC date');
    check(RyodSystems.hasMutator(stacked, 'vampire_thirst') && !RyodSystems.hasMutator(stacked, 'god_sandbox'),
        'WS-8: RyodSystems.hasMutator evaluates stacked mutators array');

    // 8.3 Live UniversalCartridgeEngine gameplay verification (champion, altar, combat, leech, collapse)
    const tmpSave = fs.mkdtempSync(path.join(os.tmpdir(), 'ryod_v123_'));
    try {
        const gameBp = RyodCompiler.normalizeConfig({
            biome: 'obsidian',
            heroOrigin: 'warrior',
            mutators: ['loot_pinata', 'vampire_thirst', 'boss_rush'],
            seed: 424242
        });
        const spec = RyodCompiler.compileEngineSpec(gameBp);
        const eng = new Cartridge.UniversalCartridgeEngine(spec, { saveDir: tmpSave, user: 'ws8_verify' });
        eng.initNewState();
        eng.generateLevel(1);

        const champ = eng.state.monsters.find(m => m.isBoss && /Champion/i.test(String(m.race || '')));
        check(Boolean(champ), 'WS-8: boss_rush spawns a Floor Champion on Dungeon Level 1');

        // Non-Pantheon prayAtAltar works without requiring cell.deity
        const p = eng.state.player;
        p.hp = 5;
        eng.state.map[p.y][p.x].feat = Cartridge.FEAT.ALTAR;
        eng.state.map[p.y][p.x].deity = null;
        eng.prayAtAltar();
        check(p.hp === p.hpMax && eng.state.messages.some(m => /glowing altar of/i.test(m.text)),
            'WS-8: Non-Pantheon prayAtAltar consecrates player at unlabeled altar');

        // Vampire thirst suppresses passive heal on searchAround
        p.hp = Math.max(1, p.hpMax - 10);
        const beforeSearchHp = p.hp;
        eng.searchAround();
        check(p.hp <= beforeSearchHp, 'WS-8: vampire_thirst suppresses passive searchAround HP heal');

        // Active Song + Stance + Vampire Thirst 30% melee leech + deterministic loot_pinata drop
        p.hp = Math.max(1, p.hpMax - 15);
        const preAttackHp = p.hp;
        p.activeSong = 'slaying';
        p.activeStance = 'byakko';
        // Isolate target cell (p.x + 1, p.y) so no pre-existing monster or pet intercepts the melee blow
        eng.state.monsters = eng.state.monsters.filter(m => m.isBoss || (!m.isPet && !(m.x === p.x + 1 && m.y === p.y)));
        const target = {
            id: 999001, race: 'test kobold', glyph: 'k', attr: 10,
            x: p.x + 1, y: p.y, hp: 500, hp_max: 500, ac: -50, dmg: 0, exp: 5, speed: 110
        };
        if (eng.state.map[p.y] && eng.state.map[p.y][p.x + 1]) {
            eng.state.map[p.y][p.x + 1].feat = Cartridge.FEAT.FLOOR;
        }
        eng.state.monsters.push(target);
        eng.rand = (n) => (n === 20 ? 19 : 0); // force guaranteed nat-20 strike & <35 roll for loot_pinata
        eng.moveOrAttack(1, 0);
        const dealt = 500 - target.hp;
        check(dealt >= 10 && p.hp > preAttackHp,
            `WS-8: Active song/stance strike dealt ${dealt} dmg and vampire_thirst leeched HP (${preAttackHp} -> ${p.hp})`);

        const objsBefore = eng.state.objects.length;
        eng.handleMonsterKilled(target);
        const lootDropped = eng.state.objects.slice(objsBefore).some(o => o.kind === 'gold' && /pinata/i.test(o.name));
        check(lootDropped, 'WS-8: loot_pinata drops bonus gold burst on monster kill');

        // floor_collapse turn timer & quake warning / damage
        const collapseBp = RyodCompiler.normalizeConfig({
            biome: 'obsidian',
            heroOrigin: 'warrior',
            mutators: ['floor_collapse'],
            seed: 991122
        });
        const cSpec = RyodCompiler.compileEngineSpec(collapseBp);
        const cEng = new Cartridge.UniversalCartridgeEngine(cSpec, { saveDir: tmpSave, user: 'ws8_collapse' });
        cEng.initNewState();
        cEng.generateLevel(1);
        cEng.state.floorTurns = 89;
        cEng.advanceTurn();
        check(cEng.state.messages.some(m => /CRUMBLING DEPTHS.*Seek the stairs/i.test(m.text)),
            'WS-8: floor_collapse warns at floorTurn 90');
        cEng.state.floorTurns = 119;
        const preQuakeHp = cEng.state.player.hp;
        cEng.advanceTurn();
        check(cEng.state.player.hp < preQuakeHp && cEng.state.messages.some(m => /Falling masonry strikes you/i.test(m.text)),
            'WS-8: floor_collapse deals quake damage at floorTurn 120');
    } finally {
        try { fs.rmSync(tmpSave, { recursive: true, force: true }); } catch (_) {}
    }

    // 8.4 RYOD 3.0 Forge API contract check
    const forgeSrc = readRel('server/public/js/ryod-forge.js');
    check(forgeSrc.includes('btn-ryod-daily-blitz') && forgeSrc.includes('data-arcade-adv') &&
        forgeSrc.includes('data-toggle-mutator') && forgeSrc.includes('ryod-tinker-drawer') &&
        forgeSrc.includes('applyArcadeAdventure') && forgeSrc.includes('launchDailyBlitz'),
    'WS-8: ryod-forge.js exposes 3-Zone Arcade Toybox controls & public API');
}

console.log(`PASS: test_v12_3_0_overhaul (${passed} assertions verified)`);

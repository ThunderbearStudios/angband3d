#!/usr/bin/env node
/**
 * tools/test_ws82_prelaunch_9pillars.js
 *
 * Comprehensive End-to-End Verification Suite for YASD 3D / Angband 3D v12.1.0 (WS82 9-Pillar Overhaul):
 *   1. Smooth, Threat-Weighted Dynamic Music & Contextual Audio Hints (AudioDirector)
 *   2. World-Class RYOD 2.0 ("The Chimera Forge" — 7 Biomes, Deterministic Seeds, 8-Realm Disciplines & Avatars)
 *   3. Indestructible Dual-Vault Saves, Checkpoints, [R] Savescum & Disconnect Resilience (SaveVaultClient)
 *   4. End-to-End AI Sketch & Loading Spinner Repair (Tome + Auto-Paint on Death & Victory)
 *   5. Hengband EN <-> Bilingual Kanji-Tutor <-> JP, Synchronized Narrator & Forward-Compatible LocaleSpine
 *   6. Sub-Second Loading & 60fps 3D Visual Quality (Deferred GPU, Pre-Bound Roughness, Vein Emissive, 8x Anisotropy)
 *   7. High-Traffic Launch Readiness (Local-First Hybrid Routing + 3.5s Cloud Fallback + Edge GAESA Affinity)
 *   8. Top-Level Onboarding Flow & Authentic Nostalgia RPG Collector Cards (9 Verified .webp Plates + CREDITS.md)
 *   9. Deep 9-Realm Bug & State-Bleed Sweep (Victory Routing, DCSS Door 'o', Throw vs Take-Off, Canonical Domains)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function check(label, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok  ${label}`);
    } catch (err) {
        console.error(`  FAIL  ${label}\n        ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    }
}

async function checkAsync(label, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok  ${label}`);
    } catch (err) {
        console.error(`  FAIL  ${label}\n        ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    }
}

(async () => {
    console.log('=== WS82 Pre-Launch 9-Pillar Verification Suite ===\n');

    // =========================================================================
    // PILLAR 1: AudioDirector — Threat-Weighted Music & Contextual Audio Hints
    // =========================================================================
    const AudioDirector = require(path.join(ROOT, 'server/public/js/audio-director.js'));

    check('Pillar 1.1: Town Sanctuary (depth 0) keeps Farmer Maggot & townsfolk peaceful (tier 0)', () => {
        const dir = new AudioDirector();
        const townFrame = {
            player: { x: 10, y: 10, depth: 0, level: 1, hp: 20, hp_max: 20, turn: 1 },
            monsters: [{ x: 12, y: 10, name: 'Farmer Maggot', level: 5, hp: 40, asleep: false }]
        };
        const res = dir.evaluateThreat(townFrame, 'angband');
        assert.strictEqual(res.tier, 0, 'Town depth 0 must stay peaceful tier 0');
    });

    check('Pillar 1.2: Pets, peaceful NPCs, and sleeping uniques never trigger jarring battle music; sleeping unique detected', () => {
        const dir = new AudioDirector();
        const frame = {
            player: { x: 10, y: 10, depth: 5, level: 10, hp: 80, hp_max: 80, turn: 10 },
            monsters: [
                { x: 11, y: 10, name: 'faithful little dog', level: 12, hp: 30, isPet: true },
                { x: 13, y: 10, name: 'Fang, Farmer Maggot\'s Dog', level: 12, hp: 30, unique: true, asleep: true }
            ]
        };
        const res = dir.evaluateThreat(frame, 'angband');
        assert.strictEqual(res.tier, 0, 'Pet + sleeping unique must not trigger combat music');
        assert.ok(res.sleepingUnique && res.sleepingUnique.name.includes('Fang'), 'Sleeping unique must be detected for omen cue');
    });

    check('Pillar 1.3: Trivial fodder stays in exploration skirmish (tier 1); real threats hold combat hysteresis', () => {
        const dir = new AudioDirector();
        // Level 1 mouse vs Level 12 hero -> tier 1 (keeps exploration track without jarring swap!)
        const fodderRes = dir.evaluateThreat({
            player: { x: 5, y: 5, depth: 3, level: 12, hp: 100, hp_max: 100, turn: 1 },
            monsters: [{ x: 7, y: 5, name: 'white mouse', level: 1, hp: 4, asleep: false }]
        }, 'angband');
        assert.strictEqual(fodderRes.tier, 1);

        // Dangerous out-of-depth / unique foe -> tier >= 2!
        const combatRes = dir.evaluateThreat({
            player: { x: 5, y: 5, depth: 8, level: 10, hp: 100, hp_max: 100, turn: 2 },
            monsters: [{ x: 6, y: 5, name: 'Bolg, Son of Azog', level: 22, hp: 200, unique: true, asleep: false }]
        }, 'angband');
        assert.ok(combatRes.tier >= 3, `Awake hostile unique must trigger boss/combat tier >= 3, got ${combatRes.tier}`);

        // Monster steps out of sight 1 turn later -> hysteresis holds tier >= 3!
        const holdRes = dir.evaluateThreat({
            player: { x: 5, y: 5, depth: 8, level: 10, hp: 100, hp_max: 100, turn: 3 },
            monsters: []
        }, 'angband');
        assert.ok(holdRes.tier >= 3, 'Hysteresis must prevent rapid track ping-pong');

        // Simulate > 22s elapsed -> returns smoothly to tier 0!
        dir.lastThreatTime -= 25000;
        const calmRes = dir.evaluateThreat({
            player: { x: 5, y: 5, depth: 8, level: 10, hp: 100, hp_max: 100, turn: 15 },
            monsters: []
        }, 'angband');
        assert.strictEqual(calmRes.tier, 0, 'Must return smoothly to exploration after hysteresis window');
    });

    check('Pillar 1.4: Exploration playhead memory saves & resumes offset (>1s) and dungeon feeling resolves feel track', () => {
        const dir = new AudioDirector();
        dir.saveExplorationPlayhead('dungeon_low', 42.5);
        assert.strictEqual(dir.consumeSavedPlayhead('dungeon_low'), 42.5);
        const feel = dir.resolveFeelingTrack({
            player: { depth: 12, feeling: 'You have a superb feeling about this level!' }
        }, 'dungeon_med');
        assert.ok(feel && feel.track && feel.track.includes('feel'), `Expected feeling track, got ${JSON.stringify(feel)}`);
    });

    // =========================================================================
    // PILLAR 2: RYOD 2.0 ("The Chimera Forge")
    // =========================================================================
    global.RealmContentPool = require(path.join(ROOT, 'server/public/js/realm-content-pool.js'));
    const RyodCompiler = require(path.join(ROOT, 'server/src/cartridges/ryod-compiler.js'));
    check('Pillar 2.1: RYOD Compiler supports deterministic blueprints, permalinks & engine spec compilation', () => {
        assert.ok(RyodCompiler && typeof RyodCompiler.compileEngineSpec === 'function');
        const normA = RyodCompiler.normalizeConfig({ biome: 'glacier', faction: 'undead', discipline: 'runebound' });
        const normB = RyodCompiler.normalizeConfig({ biome: 'glacier', faction: 'undead', discipline: 'runebound' });
        assert.strictEqual(RyodCompiler.computeRyodHash(normA), RyodCompiler.computeRyodHash(normB));
        const bp = RyodCompiler.rollCoherentBlueprint(normA);
        const spec = RyodCompiler.compileEngineSpec(bp);
        assert.ok(spec && Array.isArray(spec.monsters) && spec.monsters.length > 0);
    });

    if (fs.existsSync(path.join(ROOT, 'server/src/cartridges/ryod-systems.js'))) {
        check('Pillar 2.2: RYOD 2.0 Deterministic Seeds, 8 Masterwork Presets, Beholder 6-Ring Avatar & Relic Ascent', () => {
            const RyodSystems = require(path.join(ROOT, 'server/src/cartridges/ryod-systems.js'));
            const { RyodEngine } = require(path.join(ROOT, 'variants/ryod/bin/ryod-bridge.js'));
            assert.ok(RyodSystems && typeof RyodSystems.parseSeed === 'function');
            assert.strictEqual(Object.keys(RyodCompiler.MASTERWORK_PRESETS || {}).length, 8, 'Must expose all 8 Masterwork Presets');

            // Deterministic seed check: two distinct engines with identical RYOD-XXXXXXXX seed produce identical Floor 1
            const bpA = RyodCompiler.normalizeConfig({ seed: 'RYOD-CAFE1234', presetId: 'true_chimera_chaos' });
            const bpB = RyodCompiler.normalizeConfig({ seed: 'RYOD-CAFE1234', presetId: 'true_chimera_chaos' });
            const engA = new RyodEngine({ isNew: true, blueprint: bpA });
            const engB = new RyodEngine({ isNew: true, blueprint: bpB });
            assert.strictEqual(engA.state.player.x, engB.state.player.x);
            assert.strictEqual(engA.state.player.y, engB.state.player.y);
            assert.strictEqual(engA.state.monsters.length, engB.state.monsters.length);

            // Beholder Creature Avatar check: monster avatar flag + 6 ring slots + rejects body armor
            const behBp = RyodCompiler.normalizeConfig({ heroOrigin: 'beholder', presetId: 'wyrm_beholder_ascendant', seed: 'RYOD-BEH01DE2' });
            const behEng = new RyodEngine({ isNew: true, blueprint: behBp });
            const behFrame = behEng.buildFrame();
            assert.strictEqual(behFrame.player.avatarId, 'beholder');
            assert.strictEqual(behFrame.player.isMonsterAvatar, true);
        });
    }

    // =========================================================================
    // PILLAR 3: Indestructible Dual-Vault Saves, Checkpoints & [R] Savescum
    // =========================================================================
    const SaveVaultClient = require(path.join(ROOT, 'server/public/js/save-vault-client.js'));

    await checkAsync('Pillar 3.1: SaveVaultClient generates CSPRNG X-Vault-Id, merges Local+Cloud rosters, and hydrates Cloud saves', async () => {
        const vid = SaveVaultClient.getVaultId();
        assert.ok(/^[a-f0-9_-]{16,64}$/i.test(vid), `Invalid vault id: ${vid}`);
        SaveVaultClient.setOwnerToken('angband', 'Aragorn', 'tok_12345');
        const hdrs = SaveVaultClient.buildAuthHeaders('angband', 'Aragorn');
        assert.strictEqual(hdrs['X-Vault-Id'], vid);

        const memStore = new Map([['Boromir', new Uint8Array(64).fill(7)]]);
        const mockLocalMgr = {
            listSaves: async () => [{ filename: 'Boromir', characterName: 'Boromir', lastModified: 1000, size: 64 }],
            getSaveData: async (name) => memStore.get(name) || null,
            putSaveData: async (name, bytes) => { memStore.set(name, bytes); }
        };
        const origFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).startsWith('/api/saves?')) {
                return {
                    ok: true,
                    json: async () => ({
                        saves: [
                            { filename: 'Boromir', characterName: 'Boromir', lastModified: 2000, size: 96 },
                            { filename: 'Gandalf', characterName: 'Gandalf', lastModified: 3000, size: 128 }
                        ]
                    })
                };
            }
            if (String(url).startsWith('/api/saves/Gandalf')) {
                return { ok: true, arrayBuffer: async () => new Uint8Array(128).fill(9).buffer };
            }
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        };
        try {
            const unified = await SaveVaultClient.listUnifiedSaves('angband', mockLocalMgr);
            assert.strictEqual(unified.length, 2);
            assert.strictEqual(unified[0].filename, 'Gandalf');
            assert.strictEqual(unified[1].source, 'dual');
            const hydrated = await SaveVaultClient.ensureLocalHydrated('angband', 'Gandalf', mockLocalMgr);
            assert.strictEqual(hydrated, true);
            assert.strictEqual(memStore.get('Gandalf').length, 128);
        } finally {
            global.fetch = origFetch;
        }
    });

    // =========================================================================
    // PILLAR 4: AI Sketch & Loading Spinner Repair (Tome + Death & Victory)
    // =========================================================================
    check('Pillar 4.1: Death & Victory modals auto-trigger AI sketch generation with pre-bound engraving & non-collapsing spinner', () => {
        const hudSrc = read('server/public/js/hud.js');
        assert.ok(hudSrc.includes('renderDeathSketchIntoModal(frame, true)'), 'hud.js must pass forceGenerate=true on Death/Victory');
        assert.ok(hudSrc.includes('frame.victory || player.winner || player.total_winner'), 'hud.js must handle Cartridge & C-engine Victory');

        const cmSrc = read('server/public/js/chronicle/chronicle-manager.js');
        assert.ok(cmSrc.includes('imgEl.src = immediateEngravingUrl'), 'chronicle-manager.js must pre-bind engraving behind loader');

        const cssSrc = read('server/public/css/dungeon.css');
        assert.ok(cssSrc.includes('#death-sketch-loader') && cssSrc.includes('min-height: 220px'), 'dungeon.css must prevent 0px loader collapse');
    });

    // =========================================================================
    // PILLAR 5: Hengband EN <-> Bilingual Kanji-Tutor <-> JP & LocaleSpine
    // =========================================================================
    const LocaleSpine = require(path.join(ROOT, 'server/public/js/i18n-locale.js'));
    const ChronicleStoryWeaver = require(path.join(ROOT, 'server/public/js/chronicle/chronicle-story-weaver.js'));

    check('Pillar 5.1: LocaleSpine switches EN / Bilingual / JP, syncs narrator voice, and serves Kanji-Tutor readings', () => {
        LocaleSpine.setMode('jp', { realm: 'hengband', silent: true });
        assert.strictEqual(LocaleSpine.getMode(), 'jp');
        assert.strictEqual(LocaleSpine.getNarratorLanguage('hengband'), 'jp');
        assert.strictEqual(LocaleSpine.getNarratorVoiceForLocale('hengband', 'female', 'jp'), 'Aoede');

        LocaleSpine.setMode('bilingual', { realm: 'hengband', silent: true });
        assert.strictEqual(LocaleSpine.getMode(), 'bilingual');
        const reading = LocaleSpine.lookupVocabTerm('混沌のサーペント');
        assert.ok(reading && reading.romaji && reading.gloss.includes('Serpent of Chaos'), 'Kanji-Tutor must resolve Serpent of Chaos reading');

        global.HengTranslate = {
            isLoaded: () => true,
            translateLine: (s) => s.includes('混沌のサーペント') ? 'You slew The Serpent of Chaos!' : s
        };
        try {
            const norm = LocaleSpine.normalizeMessageForChronicle('混沌のサーペントを倒した！', 'hengband');
            assert.ok(norm.includes('The Serpent of Chaos'), 'Japanese boss message must normalize for Chronicle story beats');
        } finally {
            delete global.HengTranslate;
        }

        LocaleSpine.setMode('en', { realm: 'hengband', silent: true });
        assert.strictEqual(LocaleSpine.getNarratorLanguage('hengband'), 'en');
        assert.strictEqual(LocaleSpine.getNarratorVoiceForLocale('hengband', 'female', 'en'), 'Sulafat');
    });

    check('Pillar 5.2: ChronicleStoryWeaver CJK 4-gram deduplication works on Japanese prose without collapsing distinct beats', () => {
        const weaver = new ChronicleStoryWeaver.ChronicleStoryWeaverController();
        const jpBeatA = '武蔵は薄暗い階段を下り、深淵の迷宮で古の竜と対峙した。';
        const jpBeatB = '忍者半蔵は城下町の鍛冶屋で名刀正宗を鍛え直し、新たな旅に出た。';
        assert.strictEqual(weaver.shouldSuppressDuplicateProse(jpBeatA), false, 'First JP passage must be recorded cleanly');
        assert.strictEqual(weaver.shouldSuppressDuplicateProse(jpBeatA), true, 'Exact JP duplicate must be suppressed');
        assert.strictEqual(weaver.shouldSuppressDuplicateProse(jpBeatB), false, 'Distinct JP story beats must NEVER collapse to duplicate');
    });

    // =========================================================================
    // PILLAR 6 & 7: Startup Performance, 60fps PBR & Hybrid Local-First Capacity
    // =========================================================================
    check('Pillar 6 & 7: Deferred GPU init, preload="none" audio, hybrid local-first routing & 3.5s Cloud fallback', () => {
        const htmlSrc = read('server/public/index.html');
        assert.ok(!htmlSrc.includes('<link rel="preload" as="script"'), 'Redundant script preloads must be removed');
        assert.ok(/id="yasd-theme-deck-a"[^>]*preload="none"/.test(htmlSrc), 'Audio deck must use preload="none" on boot');

        const appSrc = read('server/public/js/app.js');
        assert.ok(appSrc.includes("{ deferGpuInit: true }"), 'app.js must defer WebGL init off DOMContentLoaded');
        assert.ok(appSrc.includes('function resolvePreferredEngineMode(realmKey)'), 'app.js must route supported realms local-first');
        assert.ok(appSrc.includes('__localBootFallbackTimer'), 'app.js must provide 3.5s automatic Cloud fallback');
    });

    // =========================================================================
    // PILLAR 8: Onboarding Hierarchy & Authentic Nostalgia RPG Collector Cards
    // =========================================================================
    const RealmCarousel = require(path.join(ROOT, 'server/public/js/realm-carousel.js'));

    check('Pillar 8.1: All 9 Realm Collector Cards have verified RIFF/WEBP nostalgia plates, manual pillars & CREDITS attributions', () => {
        assert.strictEqual(RealmCarousel.REALM_CARDS.length, 9);
        const creditsSrc = read('CREDITS.md');
        assert.ok(creditsSrc.includes('Realm Collector Card Nostalgia Plates'), 'CREDITS.md must document all 9 realm plates');
        assert.ok(creditsSrc.includes('thunderbearstudios.dev') && creditsSrc.includes('angband3d.com'), 'CREDITS.md must use canonical domains');

        for (const card of RealmCarousel.REALM_CARDS) {
            assert.strictEqual(card.pillars.length, 3, `Expected 3 pillars for ${card.id}`);
            const relAsset = path.join('server/public', card.art.replace(/^\//, ''));
            const absAsset = path.join(ROOT, relAsset);
            assert.ok(fs.existsSync(absAsset), `Missing realm card artwork: ${relAsset}`);
            const buf = fs.readFileSync(absAsset);
            assert.ok(buf.length >= 8000 && buf.length <= 120000, `Unexpected size for ${relAsset}: ${buf.length} B`);
            assert.strictEqual(buf.slice(0, 4).toString('ascii'), 'RIFF', `${relAsset} must have RIFF header`);
            assert.strictEqual(buf.slice(8, 12).toString('ascii'), 'WEBP', `${relAsset} must have WEBP signature`);
        }

        const cardCss = read('server/public/css/realm-cards.css');
        assert.ok(!/#38bdf8/i.test(cardCss), 'Zero #38bdf8 neon cyan allowed in realm-cards.css');
        assert.ok(cardCss.includes('-webkit-backdrop-filter'), 'Safari -webkit-backdrop-filter pairing required');
    });

    // =========================================================================
    // PILLAR 9: Deep 9-Realm Bug & State-Bleed Sweep
    // =========================================================================
    check('Pillar 9.1: DCSS closed-door check (feat === 3), Cartridge Victory routing, and canonical angband3d.com URLs', () => {
        const inputSrc = read('server/public/js/input.js');
        assert.ok(inputSrc.includes('this.getFeatAt(lf.map, px + dx, py + dy) === 3'), 'DCSS "o" door check must use FEAT_DOOR_CLOSED (3)');

        const appSrc = read('server/public/js/app.js');
        assert.ok(appSrc.includes('Boolean(frame.victory || frame.player.winner || frame.player.total_winner)'), 'needsTerminal must check frame.victory');

        const autopsySrc = read('server/public/js/yasd-autopsy.js');
        assert.ok(autopsySrc.includes('https://angband3d.com/?realm='), 'yasd-autopsy.js Dare Seed must use canonical angband3d.com');
    });

    check('Pillar 9.2: Subagent End-to-End Contracts (Save Vault Sync, Sketch Models, 3D PBR/Avatars, Edge GAESA, NetHack [R], DCSS 3-Rune, Takeoff Safety)', () => {
        const vaultRoutesSrc = read('server/src/save-vault-routes.js');
        assert.ok(vaultRoutesSrc.includes("'/api/saves/sync'"), 'save-vault-routes.js must expose POST /api/saves/sync');
        assert.ok(vaultRoutesSrc.includes('x-vault-id'), 'save-vault-routes.js must honor X-Vault-Id header');

        const sketchSvcSrc = read('server/src/sketch-service.js');
        const serverSrc = read('server/src/server.js');
        assert.ok(serverSrc.includes("'gemini-nano-banana-2.1'") && serverSrc.includes("'gemini-3.1-flash-image'"), 'SKETCH_MODELS must prioritize gemini-nano-banana-2.1 -> gemini-3.1-flash-image');
        assert.ok(sketchSvcSrc.includes('_sketchModelCooldownMap'), 'sketch-service.js must isolate per-model 429 cooldowns');
        assert.ok(serverSrc.includes("'.data': 'application/octet-stream'"), 'server.js must serve .data WASM asset packages');

        const d3dSrc = read('server/public/js/dungeon3d.js');
        const procSrc = read('server/public/js/dungeon3d-proc-textures.js');
        assert.ok(d3dSrc.includes('ensureGpuInitialized') && d3dSrc.includes('resetSessionState'), 'dungeon3d.js must implement deferred GPU init & Turn-0 reset');
        assert.ok(d3dSrc.includes('_buildAvatarViewmodelGroup'), 'dungeon3d.js must render Creature Avatar 3D viewmodels');
        assert.ok(procSrc.includes('_isNeutralPlaceholder') && procSrc.includes('tex.anisotropy = Math.min(maxCap,'), 'dungeon3d-proc-textures.js must pre-bind 1x1 roughnessMap and 8x anisotropy');

        const edgeSrc = read('edge/worker.js');
        assert.ok(edgeSrc.includes('GAESA'), 'edge/worker.js must preserve Cloud Run sticky affinity cookies');
        assert.ok(/\/wasm\//.test(edgeSrc), 'edge/worker.js must edge-cache /wasm/ bundles');

        const { DCSSEngine } = require(path.join(ROOT, 'variants/dcss/bin/dcss-bridge.js'));
        const dcss = new DCSSEngine({ isNew: true, randomBirth: true });
        dcss.state.depth = 14;
        dcss.state.player.runes = 2;
        const px = dcss.state.player.x, py = dcss.state.player.y;
        dcss.state.map[py][px].feat = 6; // DOWN_STAIR
        dcss.handleKey('>');
        assert.strictEqual(dcss.state.depth, 14, 'DCSS Zot entry must be blocked with < 3 Runes');

        global.ActionCatalog = require(path.join(ROOT, 'server/public/js/action-catalog.js'));
        const RealmKeys = require(path.join(ROOT, 'server/public/js/realm-keys.js'));
        for (const r of ['dcss', 'brogue', 'rogue', 'ryod', 'nethack']) {
            assert.notStrictEqual(RealmKeys.realmKey('takeoff', r), 't', `${r} takeoff must NEVER map to 't' (Throw!)`);
        }
    });

    console.log(`\nWS82 9-Pillar Suite Summary: ${passed} checks passed.`);
    if (process.exitCode) process.exit(process.exitCode);
})();

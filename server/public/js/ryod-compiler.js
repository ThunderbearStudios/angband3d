/**
 * server/public/js/ryod-compiler.js
 *
 * Deterministic RYOD ("Roll Your Own Dungeon") Blueprint Compiler, AffinitySolver,
 * Per-Floor VRAM Cohort Budgeter (<= 6 unique .glb archetypes/floor), URL Permalink
 * Codec, and < 0.8 ms UniversalCartridgeEngine Spec Synthesizer.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        const Pool = require('./realm-content-pool.js');
        module.exports = factory(Pool);
    } else {
        root.RyodCompiler = factory(root.RealmContentPool);
    }
})(typeof self !== 'undefined' ? self : this, function (Pool) {
    'use strict';

    function parseSeed(raw) {
        if (typeof raw === 'number' && !isNaN(raw)) return (raw >>> 0) || 0x59415344;
        const str = String(raw || '').trim();
        if (!str) return 0x59415344;
        const hexMatch = str.match(/^RYOD-([0-9a-fA-F]{1,8})$/i);
        if (hexMatch) return (parseInt(hexMatch[1], 16) >>> 0) || 0x59415344;
        if (/^\d+$/.test(str)) return (Number(str) >>> 0) || 0x59415344;
        let h = 0x811c9dc5 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return (h >>> 0) || 0x59415344;
    }

    function mulberry32(seed) {
        let s = (Number(seed) >>> 0) || 0x59415344;
        return function next() {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const SYNTHETIC_BEHOLDER = {
        id: 'beholder',
        label: '👁️ Eldritch Beholder Eye (Creature Avatar)',
        isMonsterAvatar: true,
        avatarMonsterName: 'floating eye',
        avatarId: 'beholder',
        race: 'Aberration',
        roleName: 'Beholder Eye',
        align: 'Chaotic',
        defaultDiscipline: 'arcane',
        hp: 36, pw: 30, ac: 4,
        str: 10, int: 20, wis: 16, dex: 16, con: 14,
        weapon: { name: 'occular telekinesis', dmg: '2d4', bonus: 2, weight: 5, tval: 23, sval: 1 },
        armor: { name: 'eyestalk warding aura', ac: 4, bonus: 2, weight: 10, tval: 36, sval: 1 },
        extra: { kind: 'ring', name: 'ring of gaze focusing', glyph: '=', count: 1, weight: 2, tval: 45, sval: 1 },
        innatePower: { name: 'Disintegration Ray', cost: 2, dmg: 22, desc: 'Unleash a disintegrating energy ray from your central eye.' }
    };

    function getAllHeroOrigins() {
        const base = Pool.HERO_ORIGINS || {};
        return {
            ...base,
            beholder: base.beholder || SYNTHETIC_BEHOLDER
        };
    }

    function resolveAvatarId(originId) {
        if (!originId) return null;
        if (originId === 'red_dragon' || originId === 'dragon') return 'dragon';
        if (originId === 'beholder') return 'beholder';
        if (originId === 'arch_lich' || originId === 'lich') return 'lich';
        if (originId === 'vampire_scion' || originId === 'vampire') return 'vampire';
        if (originId === 'iron_golem' || originId === 'golem') return 'golem';
        if (originId === 'minotaur') return 'minotaur';
        return null;
    }

    function xorshift32(seed) {
        let s = (Number(seed) >>> 0) || 0x9E3779B9;
        return function next() {
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;
            return (s >>> 0);
        };
    }

    /**
     * Deterministic cross-platform 8-hex fingerprint (`RYOD-XXXXXXXX`) for any RYOD config.
     */
    function computeRyodHash(config) {
        const canonical = JSON.stringify({
            archetypeId: config.archetypeId || 'obsidian_covenant',
            biome: config.biome || 'obsidian',
            storyArc: config.storyArc || 'shattered_covenant',
            bestiary: config.bestiary || 'theme_matched',
            heroOrigin: config.heroOrigin || 'warrior',
            powerDiscipline: config.powerDiscipline || 'auto',
            progressionMode: config.progressionMode || 'xp',
            beatitude: Boolean(config.beatitude),
            pet: config.pet || 'war_hound',
            captiveAllies: Boolean(config.captiveAllies),
            hasTown: config.hasTown !== false,
            goalDepth: Number(config.goalDepth) || 15,
            victoryMode: config.victoryMode || 'boss_kill',
            hazardDensity: config.hazardDensity || 'tactical',
            difficulty: config.difficulty || 'standard',
            godMode: Boolean(config.godMode),
            seed: (Number(config.seed) >>> 0) || 1337,
            customTitle: config.customTitle || '',
            customNemesisName: config.customNemesisName || '',
            ...(config.mapLayout && config.mapLayout !== 'classic' ? { mapLayout: config.mapLayout } : {}),
            ...(config.mutatorId && config.mutatorId !== 'balanced' ? { mutatorId: config.mutatorId } : {})
        });
        let h1 = 0x811c9dc5 >>> 0;
        let h2 = 0x01000193 >>> 0;
        for (let i = 0; i < canonical.length; i++) {
            const c = canonical.charCodeAt(i);
            h1 ^= c;
            h1 = Math.imul(h1, 0x01000193) >>> 0;
            h2 ^= (c + i);
            h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
        }
        const hex = ((h1 ^ h2) >>> 0).toString(16).toUpperCase().padStart(8, '0');
        return `RYOD-${hex}`;
    }

    /**
     * AffinitySolver: Normalizes any partial or user-edited RYOD configuration into a
     * 100% coherent, asset-validated Blueprint (never "random crazy").
     */
    function normalizeConfig(raw = {}) {
        const archetypes = Pool.WORLD_ARCHETYPES || [];
        const baseArch = archetypes.find(a => a.id === raw.archetypeId) || archetypes[0];

        const seed = parseSeed(raw.seed);
        const biomeId = Pool.BIOMES[raw.biome] ? raw.biome : baseArch.biome;
        const biomeSpec = Pool.BIOMES[biomeId];

        const storyId = Pool.STORY_ARCS[raw.storyArc]
            ? raw.storyArc
            : (raw.storyArc === 'theme_matched' ? biomeSpec.defaultStory : baseArch.storyArc);
        const storySpec = Pool.STORY_ARCS[storyId] || Pool.STORY_ARCS.shattered_covenant;

        let bestiaryId = raw.bestiary || 'theme_matched';
        let resolvedBestiaryId = bestiaryId;
        if (bestiaryId === 'theme_matched' || (!Pool.BESTIARY_FACTIONS[bestiaryId] && bestiaryId !== 'omni_pantheon')) {
            resolvedBestiaryId = biomeSpec.defaultBestiary || baseArch.bestiary || 'warbands';
        }

        const allHeroes = getAllHeroOrigins();
        const rng = xorshift32(seed);
        let heroOriginId = raw.heroOrigin || raw.heroOriginId || (raw.avatarId && allHeroes[raw.avatarId] ? raw.avatarId : (baseArch.heroOrigin || 'warrior'));
        if (heroOriginId === 'random' || !allHeroes[heroOriginId]) {
            const heroKeys = Object.keys(allHeroes);
            heroOriginId = heroKeys[rng() % heroKeys.length];
        }
        const heroSpec = allHeroes[heroOriginId] || allHeroes.warrior;

        let powerDiscipline = raw.powerDiscipline || 'auto';
        let resolvedDiscipline = powerDiscipline;
        if (powerDiscipline === 'auto' || !Pool.POWER_DISCIPLINES[powerDiscipline]) {
            resolvedDiscipline = heroSpec.defaultDiscipline || baseArch.powerDiscipline || 'arcane';
        }

        const progressionMode = ['xp', 'brogue_item', 'hybrid'].includes(raw.progressionMode)
            ? raw.progressionMode
            : (baseArch.progressionMode || 'xp');

        const rawDepth = Number(raw.goalDepth);
        const goalDepth = Number.isFinite(rawDepth) ? Math.min(30, Math.max(5, Math.round(rawDepth))) : (baseArch.goalDepth || 15);

        const victoryMode = ['boss_kill', 'ascension', 'three_runes', 'relic_ascent'].includes(raw.victoryMode)
            ? raw.victoryMode
            : (baseArch.victoryMode || 'boss_kill');

        const hazardDensity = ['minimal', 'tactical', 'abundant'].includes(raw.hazardDensity)
            ? raw.hazardDensity
            : (baseArch.hazardDensity || 'tactical');

        const difficulty = ['story', 'standard', 'nightmare'].includes(raw.difficulty)
            ? raw.difficulty
            : (baseArch.difficulty || 'standard');

        const mapLayout = ['classic', 'caverns', 'labyrinth', 'arena'].includes(raw.mapLayout)
            ? raw.mapLayout
            : (biomeId === 'bioluminescent' ? 'caverns' : 'classic');

        const mutatorId = (Pool.WORLD_MUTATORS && Pool.WORLD_MUTATORS[raw.mutatorId])
            ? raw.mutatorId
            : (raw.godMode ? 'god_sandbox' : 'balanced');

        const d20Fate = Number.isFinite(Number(raw.d20Fate))
            ? Math.min(20, Math.max(1, Math.round(Number(raw.d20Fate))))
            : 15;

        const pet = Object.prototype.hasOwnProperty.call(Pool.PET_COMPANIONS, raw.pet)
            ? raw.pet
            : (baseArch.pet || 'war_hound');

        const hasTown = typeof raw.hasTown === 'boolean' ? raw.hasTown : (baseArch.hasTown !== false);
        const captiveAllies = typeof raw.captiveAllies === 'boolean' ? raw.captiveAllies : Boolean(baseArch.captiveAllies);
        const beatitude = typeof raw.beatitude === 'boolean' ? raw.beatitude : Boolean(baseArch.beatitude);
        const godMode = Boolean(raw.godMode || mutatorId === 'god_sandbox');
        const audioTheme = raw.audioTheme && raw.audioTheme !== 'auto' ? raw.audioTheme : (biomeSpec.defaultAudio || baseArch.audioTheme || 'angband');

        const title = String(raw.customTitle || storySpec.title).slice(0, 64);
        const subtitle = String(raw.customSubtitle || storySpec.subtitle).slice(0, 96);
        const goalItemName = String(raw.customGoalItem || storySpec.goalItemName).slice(0, 64);
        const nemesisName = String(raw.customNemesisName || storySpec.nemesis.name).slice(0, 64);
        const elderRumor = String(raw.customElderRumor || storySpec.elderRumor).slice(0, 220);

        const acts = Array.isArray(raw.customActs) && raw.customActs.length === 5
            ? raw.customActs
            : storySpec.acts;

        const resolvedAid = raw.avatarId || resolveAvatarId(heroOriginId);
        const normalized = {
            version: '1.0',
            archetypeId: baseArch.id,
            presetId: raw.presetId || undefined,
            chimeraChaos: Boolean(raw.chimeraChaos || raw.presetId === 'true_chimera_chaos'),
            mithrilSmithing: Boolean(raw.mithrilSmithing),
            wovenSongs: Boolean(raw.wovenSongs),
            martialStances: Boolean(raw.martialStances),
            wantedBounties: Boolean(raw.wantedBounties),
            pantheonAltars: Boolean(raw.pantheonAltars),
            livingPhysics: Boolean(raw.livingPhysics),
            evolvingAllies: Boolean(raw.evolvingAllies),
            unidentifiedAppearances: Boolean(raw.unidentifiedAppearances),
            stampedVaults: raw.stampedVaults !== false,
            seed,
            title,
            subtitle,
            biome: biomeId,
            mapLayout,
            mutatorId,
            d20Fate,
            storyArc: storyId,
            bestiary: bestiaryId,
            resolvedBestiary: resolvedBestiaryId,
            heroOrigin: heroOriginId,
            avatarId: resolvedAid,
            isMonsterAvatar: Boolean(raw.isMonsterAvatar || heroSpec.isMonsterAvatar || resolvedAid),
            powerDiscipline,
            resolvedDiscipline,
            progressionMode,
            beatitude,
            pet,
            captiveAllies,
            hasTown,
            goalDepth,
            victoryMode,
            hazardDensity,
            difficulty,
            godMode,
            audioTheme,
            goalItemName,
            nemesisName,
            elderRumor,
            chronicler: storySpec.chronicler,
            deity: raw.deity || storySpec.deity,
            traditionKey: storySpec.traditionKey,
            acts
        };

        normalized.ryodHash = computeRyodHash(normalized);
        return normalized;
    }

    /**
     * Rolls a 100% coherent RYOD Blueprint from either a numeric seed or a natural-language prompt!
     * Never produces "random crazy" combinations.
     */
    function rollCoherentBlueprint(options = {}) {
        const seed = (Number(options.seed) >>> 0) || ((Date.now() ^ 0x5F3759DF) >>> 0);
        const rng = xorshift32(seed);
        const prompt = String(options.prompt || '').toLowerCase().trim();
        const archetypes = Pool.WORLD_ARCHETYPES;

        let chosenArch = archetypes[rng() % archetypes.length];
        const overrides = { seed };

        if (prompt) {
            if (/vampire|undead|crypt|lich|necromanc|bone|gothic|cathedral/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'gothic_necropolis') || chosenArch;
            } else if (/samurai|ninja|ronin|shogun|oni|katana|eastern|temple/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'shadow_shogunate') || chosenArch;
            } else if (/clockwork|golem|brass|construct|turret|machine|architect/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'clockwork_abyss') || chosenArch;
            } else if (/fungal|spore|mushroom|swamp|flood|bioluminescen|cavern|brogue|underdark/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'underdark_plague') || chosenArch;
            } else if (/bureaucrac|audit|tax|office|lawyer|form|parody|satire/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'bureaucracy_parody') || chosenArch;
            } else if (/song|music|silmaril|voice|bard|verse/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'silmaril_song') || chosenArch;
            } else if (/heist|thief|steal|rogue|escape|amulet/.test(prompt)) {
                chosenArch = archetypes.find(a => a.id === 'sanctum_heist') || chosenArch;
            }

            // Detect specific playable monster avatar or hero requests in prompt
            if (/dragon|wyrm/.test(prompt)) overrides.heroOrigin = 'red_dragon';
            else if (/vampire/.test(prompt)) overrides.heroOrigin = 'vampire_scion';
            else if (/golem/.test(prompt)) overrides.heroOrigin = 'iron_golem';
            else if (/lich/.test(prompt)) overrides.heroOrigin = 'arch_lich';
            else if (/minotaur|bull/.test(prompt)) overrides.heroOrigin = 'minotaur';
            else if (/samurai/.test(prompt)) overrides.heroOrigin = 'samurai';
            else if (/valkyrie/.test(prompt)) overrides.heroOrigin = 'valkyrie';
            else if (/mage|wizard|sorcerer/.test(prompt)) overrides.heroOrigin = 'mage';
            else if (/priest|cleric|paladin|templar/.test(prompt)) overrides.heroOrigin = 'priest';
            else if (/rogue|assassin|thief/.test(prompt)) overrides.heroOrigin = 'rogue';
            else if (/ranger|archer/.test(prompt)) overrides.heroOrigin = 'ranger';

            if (/god mode|immortal|sandbox/.test(prompt)) { overrides.godMode = true; overrides.mutatorId = 'god_sandbox'; }
            if (/no town|pure dungeon/.test(prompt)) overrides.hasTown = false;
            if (/short|quick/.test(prompt)) overrides.goalDepth = 10;
            if (/long|grand|epic/.test(prompt)) overrides.goalDepth = 25;
            if (/ice|frost|frozen|glacier|winter/.test(prompt)) overrides.biome = 'frozen_wastes';
            if (/gold|gilded|treasury|vault|midas/.test(prompt)) { overrides.biome = 'gilded_treasury'; overrides.mutatorId = 'midas_vaults'; }
            if (/blood|shadow|siphon/.test(prompt)) overrides.powerDiscipline = 'blood_shadow';
            if (/fog|dark|stygian/.test(prompt)) overrides.mutatorId = 'stygian_fog';
            if (/rune/.test(prompt)) overrides.victoryMode = 'three_runes';
        } else {
            // Smart Randomize: keep the chosen Archetype's coherent world spine, and pick a compatible hero & pet!
            const compatibleHeroes = [
                chosenArch.heroOrigin,
                'warrior', 'valkyrie', 'samurai', 'mage', 'ranger', 'rogue', 'priest',
                'red_dragon', 'vampire_scion', 'iron_golem', 'arch_lich', 'minotaur'
            ];
            // 60% chance to use the archetype's signature hero, 40% chance to roll another exciting hero/avatar
            overrides.heroOrigin = (rng() % 10 < 6)
                ? chosenArch.heroOrigin
                : compatibleHeroes[rng() % compatibleHeroes.length];
            overrides.d20Fate = 1 + (rng() % 20);
        }

        return normalizeConfig({
            ...chosenArch,
            ...overrides,
            archetypeId: chosenArch.id
        });
    }

    /**
     * Compact URL-safe Permalink Codec (`?realm=ryod&bp=...`)
     */
    function encodePermalink(rawConfig) {
        const c = normalizeConfig(rawConfig);
        const compact = [
            c.archetypeId,
            c.biome,
            c.storyArc,
            c.bestiary,
            c.heroOrigin,
            c.powerDiscipline,
            c.progressionMode,
            c.beatitude ? 1 : 0,
            c.pet,
            c.captiveAllies ? 1 : 0,
            c.hasTown ? 1 : 0,
            c.goalDepth,
            c.victoryMode,
            c.hazardDensity,
            c.difficulty,
            c.godMode ? 1 : 0,
            c.seed,
            c.customTitle || '',
            c.mapLayout || 'classic',
            c.mutatorId || 'balanced',
            c.d20Fate || 15,
            c.customNemesisName || ''
        ];
        const json = JSON.stringify(compact);
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(json, 'utf8').toString('base64url');
        }
        return btoa(encodeURIComponent(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function decodePermalink(token) {
        try {
            let json = '';
            if (typeof Buffer !== 'undefined') {
                json = Buffer.from(String(token || ''), 'base64url').toString('utf8');
            } else {
                const b64 = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
                json = decodeURIComponent(atob(b64));
            }
            const arr = JSON.parse(json);
            if (!Array.isArray(arr) || arr.length < 17) return null;
            return normalizeConfig({
                archetypeId: arr[0],
                biome: arr[1],
                storyArc: arr[2],
                bestiary: arr[3],
                heroOrigin: arr[4],
                powerDiscipline: arr[5],
                progressionMode: arr[6],
                beatitude: Boolean(arr[7]),
                pet: arr[8],
                captiveAllies: Boolean(arr[9]),
                hasTown: Boolean(arr[10]),
                goalDepth: Number(arr[11]),
                victoryMode: arr[12],
                hazardDensity: arr[13],
                difficulty: arr[14],
                godMode: Boolean(arr[15]),
                seed: Number(arr[16]),
                customTitle: arr[17] || '',
                mapLayout: arr[18] || undefined,
                mutatorId: arr[19] || undefined,
                d20Fate: arr[20] != null ? Number(arr[20]) : undefined,
                customNemesisName: arr[21] || ''
            });
        } catch (_) {
            return null;
        }
    }

    /**
     * Builds the Per-Floor VRAM Cohort (<= 5 regular archetypes + 1 milestone Boss)
     * across `1..goalDepth` so:
     *   1. Floor 1..2 only spawns Tier 1 scouts/vermin (strict threat curve).
     *   2. Any single floor loads at most 6 unique `.glb` models in `dungeon3d.js`.
     *   3. Adjacent floors share 2–3 archetypes for >= 50% warm `.glb` cache hit rate.
     */
    function buildFloorCohorts(blueprint) {
        const facId = blueprint.resolvedBestiary;
        const sourceMonsters = (blueprint.bestiary === 'omni_pantheon')
            ? Pool.getOmniPantheonMonsters()
            : ((Pool.BESTIARY_FACTIONS[facId] && Pool.BESTIARY_FACTIONS[facId].monsters) || Pool.BESTIARY_FACTIONS.warbands.monsters);

        const goalDepth = blueprint.goalDepth || 15;
        const diffMult = blueprint.difficulty === 'story' ? 0.72 : (blueprint.difficulty === 'nightmare' ? 1.35 : 1.0);
        const hpMult = blueprint.difficulty === 'story' ? 0.80 : (blueprint.difficulty === 'nightmare' ? 1.25 : 1.0);

        const sorted = [...sourceMonsters].sort((a, b) => (a.tier || 1) - (b.tier || 1));
        const cohorts = {};
        const flatMonsters = [];
        const seenFlat = new Set();

        for (let d = 1; d <= goalDepth; d++) {
            const progress = (d - 1) / Math.max(1, goalDepth - 1);
            const maxAllowedTier = d <= 2 ? 1 : (d <= Math.ceil(goalDepth * 0.4) ? 2 : (d <= Math.ceil(goalDepth * 0.7) ? 3 : (d < goalDepth ? 4 : 5)));
            const minAllowedTier = Math.max(1, maxAllowedTier - 1);

            const eligible = sorted.filter(m => {
                const t = m.tier || 1;
                return t >= minAllowedTier && t <= maxAllowedTier;
            });
            const pool = eligible.length >= 3 ? eligible : sorted.slice(0, Math.min(5, sorted.length));

            const rng = xorshift32((blueprint.seed ^ (d * 0x45d9f3b)) >>> 0);
            const chosen = [];
            const usedNames = new Set();

            // Retain up to 2 monsters from floor d-1 for warm .glb cache continuity
            if (d > 1 && Array.isArray(cohorts[d - 1])) {
                for (const prev of cohorts[d - 1]) {
                    if (chosen.length < 2 && prev.tier <= maxAllowedTier && !usedNames.has(prev.name)) {
                        usedNames.add(prev.name);
                        chosen.push(prev);
                    }
                }
            }

            for (let i = 0; i < pool.length && chosen.length < 5; i++) {
                const pick = pool[(rng() + i) % pool.length];
                if (pick && !usedNames.has(pick.name)) {
                    usedNames.add(pick.name);
                    const scaled = {
                        ...pick,
                        minDepth: d,
                        maxDepth: Math.min(goalDepth, d + 3),
                        hp: Math.max(4, Math.round(pick.hp * hpMult)),
                        dmg: Math.max(2, Math.round(pick.dmg * diffMult)),
                        exp: blueprint.progressionMode === 'brogue_item' ? 0 : (pick.exp || 15)
                    };
                    chosen.push(scaled);
                    if (!seenFlat.has(scaled.name)) {
                        seenFlat.add(scaled.name);
                        flatMonsters.push(scaled);
                    }
                }
            }

            cohorts[d] = chosen;
        }

        return { cohorts, flatMonsters };
    }

    /**
     * Synthesizes a complete `UniversalCartridgeEngine` specification from a RYOD Blueprint in < 0.8 ms.
     */
    function compileEngineSpec(rawConfig = {}) {
        const bp = normalizeConfig(rawConfig);
        const biomeSpec = Pool.BIOMES[bp.biome] || Pool.BIOMES.obsidian;
        const storySpec = Pool.STORY_ARCS[bp.storyArc] || Pool.STORY_ARCS.shattered_covenant;
        const disciplineSpec = Pool.POWER_DISCIPLINES[bp.resolvedDiscipline] || Pool.POWER_DISCIPLINES.arcane;
        const allHeroes = getAllHeroOrigins();
        const selectedHero = allHeroes[bp.heroOrigin] || allHeroes.warrior;
        const petSpec = Pool.PET_COMPANIONS[bp.pet] || null;

        // Build roles list with the chosen heroOrigin first (`key: 'a'`) so Quick-Start selects it automatically,
        // while Custom Birth (`-c`) displays all 12 roles/avatars (`a..l`).
        const orderedOrigins = [
            selectedHero,
            ...Object.values(allHeroes).filter(h => h.id !== selectedHero.id)
        ];

        const hpFactor = bp.difficulty === 'story' ? 1.5 : 1.0;
        const roles = orderedOrigins.slice(0, 12).map((h, idx) => {
            const disc = Pool.POWER_DISCIPLINES[bp.powerDiscipline === 'auto' ? h.defaultDiscipline : bp.resolvedDiscipline] || disciplineSpec;
            const aid = h.avatarId || resolveAvatarId(h.id);
            return {
                key: String.fromCharCode(97 + idx),
                id: h.roleName,
                originId: h.id,
                avatarId: aid || null,
                race: h.race,
                isMonsterAvatar: Boolean(h.isMonsterAvatar || aid),
                avatarMonsterName: h.avatarMonsterName || null,
                align: h.align,
                hp: bp.godMode ? 999 : Math.round(h.hp * hpFactor),
                pw: bp.godMode ? 999 : h.pw,
                ac: bp.godMode ? 25 : h.ac,
                str: bp.godMode ? h.str + 10 : h.str,
                int: bp.godMode ? h.int + 10 : h.int,
                wis: bp.godMode ? h.wis + 10 : h.wis,
                dex: bp.godMode ? h.dex + 10 : h.dex,
                con: bp.godMode ? h.con + 10 : h.con,
                weapon: { ...h.weapon, bonus: bp.godMode ? 9 : h.weapon.bonus },
                armor: { ...h.armor, bonus: bp.godMode ? 9 : h.armor.bonus },
                extra: h.extra ? { ...h.extra } : null,
                innatePower: h.innatePower ? { ...h.innatePower } : null,
                disciplinePowers: disc.powers.map(p => ({ ...p }))
            };
        });

        const { cohorts, flatMonsters } = buildFloorCohorts(bp);

        // Compute the 5-Act Milestone Floors & Bosses
        const gd = bp.goalDepth;
        const actFloors = {
            1: bp.hasTown ? 0 : 1,
            2: Math.max(2, Math.round(gd * 0.25)),
            3: Math.max(3, Math.round(gd * 0.50)),
            4: Math.max(4, Math.round(gd * 0.75)),
            5: gd
        };

        const diffMult = bp.difficulty === 'story' ? 0.75 : (bp.difficulty === 'nightmare' ? 1.3 : 1.0);
        const actMilestones = {};
        for (let actNum = 1; actNum <= 5; actNum++) {
            const fl = actFloors[actNum];
            const actMeta = bp.acts[actNum - 1] || storySpec.acts[actNum - 1];
            let boss = null;
            if (actNum === 5) {
                boss = {
                    ...storySpec.nemesis,
                    name: bp.nemesisName || storySpec.nemesis.name,
                    hp: Math.round(storySpec.nemesis.hp * diffMult),
                    dmg: Math.round(storySpec.nemesis.dmg * diffMult),
                    isBoss: true,
                    isNemesis: true,
                    actNumber: 5
                };
            } else if (actNum >= 2 && storySpec.actGuardians && storySpec.actGuardians[actNum - 1]) {
                const g = storySpec.actGuardians[actNum - 1];
                boss = {
                    ...g,
                    hp: Math.round(g.hp * diffMult),
                    dmg: Math.round(g.dmg * diffMult),
                    isBoss: true,
                    isNemesis: false,
                    actNumber: actNum
                };
            }
            actMilestones[fl] = {
                actNumber: actNum,
                actRoman: actMeta.act,
                title: actMeta.title,
                lens: actMeta.lens,
                banner: actMeta.banner,
                boss
            };
        }

        const items = Pool.BASE_LOOT_POOL.map(it => ({ ...it }));
        const extraRyodItems = [
            { kind: 'potion', name: 'potion of speed', glyph: '!', attr: 12, speedTurns: 20, weight: 10, tval: 71, sval: 12, tier: 1 },
            { kind: 'potion', name: 'potion of heroism', glyph: '!', attr: 14, heroismTurns: 25, heal: 15, weight: 10, tval: 71, sval: 14, tier: 1 },
            { kind: 'potion', name: 'potion of levitation', glyph: '!', attr: 3, levitationTurns: 30, weight: 10, tval: 71, sval: 18, tier: 1 },
            { kind: 'potion', name: 'potion of restore abilities', glyph: '!', attr: 11, restoreStats: true, weight: 10, tval: 71, sval: 20, tier: 2 },
            { kind: 'potion', name: 'potion of poison', glyph: '!', attr: 2, poisonTurns: 10, weight: 10, tval: 71, sval: 4, tier: 1 },
            { kind: 'potion', name: 'potion of confusion', glyph: '!', attr: 6, confusionTurns: 10, weight: 10, tval: 71, sval: 5, tier: 1 },
            { kind: 'potion', name: 'potion of telepathy', glyph: '!', attr: 11, telepathyTurns: 40, grantsTelepathy: true, weight: 15, tval: 71, sval: 42, tier: 2 },
            { kind: 'scroll', name: 'scroll of identify', glyph: '?', attr: 7, count: 1, weight: 5, tval: 70, sval: 1, tier: 1 },
            { kind: 'scroll', name: 'scroll of remove curse', glyph: '?', attr: 7, count: 1, weight: 5, tval: 70, sval: 2, tier: 1 },
            { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', attr: 7, count: 1, weight: 5, tval: 70, sval: 3, tier: 2 },
            { kind: 'scroll', name: 'scroll of enchant armor', glyph: '?', attr: 7, count: 1, weight: 5, tval: 70, sval: 4, tier: 2 },
            { kind: 'scroll', name: 'scroll of universal enchantment', glyph: '?', attr: 14, enchantGain: 1, count: 1, weight: 5, tval: 70, sval: 15, tier: 2 },
            { kind: 'scroll', name: 'scroll of teleportation', glyph: '?', attr: 7, count: 1, weight: 5, tval: 70, sval: 8, tier: 1 },
            { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 7, count: 1, weight: 5, tval: 70, sval: 9, tier: 2 },
            { kind: 'scroll', name: 'scroll of genocide', glyph: '?', attr: 4, genocide: true, count: 1, weight: 5, tval: 70, sval: 20, tier: 3 },
            { kind: 'scroll', name: 'scroll of recharging', glyph: '?', attr: 11, recharging: true, count: 1, weight: 5, tval: 70, sval: 11, tier: 2 },
            { kind: 'wand', name: 'wand of firebolt', glyph: '-', charges: 5, maxCharges: 5, attr: 4, boltDmg: 20, weight: 12, tval: 66, sval: 1, tier: 1 },
            { kind: 'wand', name: 'wand of frost', glyph: '-', charges: 5, maxCharges: 5, attr: 3, boltDmg: 20, weight: 12, tval: 66, sval: 2, tier: 1 },
            { kind: 'wand', name: 'wand of lightning', glyph: '-', charges: 5, maxCharges: 5, attr: 14, boltDmg: 24, weight: 12, tval: 66, sval: 3, tier: 2 },
            { kind: 'wand', name: 'wand of teleportation', glyph: '-', charges: 5, maxCharges: 5, attr: 7, weight: 12, tval: 66, sval: 4, tier: 1 },
            { kind: 'wand', name: 'wand of sleep', glyph: '-', charges: 5, maxCharges: 5, attr: 6, weight: 12, tval: 66, sval: 5, tier: 1 },
            { kind: 'wand', name: 'wand of polymorph', glyph: '-', charges: 4, maxCharges: 4, attr: 5, weight: 12, tval: 66, sval: 6, tier: 2 },
            { kind: 'wand', name: 'wand of disintegration', glyph: '-', charges: 3, maxCharges: 3, attr: 11, boltDmg: 35, weight: 12, tval: 66, sval: 7, tier: 3 },
            { kind: 'ranged', name: 'short bow', glyph: '}', dmg: '1d6', bonus: 1, weight: 20, tval: 19, sval: 5, slot: 'bow' },
            { kind: 'ranged', name: 'long bow', glyph: '}', dmg: '1d8', bonus: 2, weight: 30, tval: 19, sval: 12, slot: 'bow' },
            { kind: 'ammo', name: 'flight arrows', glyph: '{', count: 30, dmg: '1d4', weight: 15, tval: 16, sval: 1 },
            { kind: 'cloak', name: 'elven cloak', glyph: '(', ac: 2, bonus: 1, weight: 10, tval: 35, sval: 2, slot: 'cloak' },
            { kind: 'shield', name: 'round shield', glyph: ')', ac: 3, bonus: 1, weight: 40, tval: 34, sval: 2, slot: 'shield' },
            { kind: 'helm', name: 'iron helm', glyph: ']', ac: 2, bonus: 1, weight: 30, tval: 32, sval: 3, slot: 'helm' },
            { kind: 'gloves', name: 'leather gloves', glyph: '[', ac: 1, bonus: 1, weight: 8, tval: 31, sval: 1, slot: 'gloves' },
            { kind: 'boots', name: 'iron shod boots', glyph: '[', ac: 2, bonus: 1, weight: 25, tval: 30, sval: 2, slot: 'boots' },
            { kind: 'amulet', name: 'amulet of reflection', glyph: '"', weight: 5, tval: 40, sval: 5, slot: 'amulet' },
            { kind: 'ring', name: 'ring of protection', glyph: '=', acBonus: 2, bonus: 2, weight: 2, tval: 45, sval: 2, slot: 'ring' },
            { kind: 'light', name: 'brass lantern', glyph: '~', lightRadius: 3, weight: 20, tval: 39, sval: 1, slot: 'light' }
        ];
        for (const it of extraRyodItems) {
            if (!items.some(existing => existing.name === it.name)) items.push(it);
        }

        return {
            realm: 'ryod',
            magic: 'SaveRYOD',
            version: '11.8.0-ryod',
            seed: bp.seed,
            presetId: bp.presetId || null,
            avatarId: bp.avatarId || (selectedHero && selectedHero.avatarId) || null,
            isMonsterAvatar: Boolean(bp.isMonsterAvatar || (selectedHero && selectedHero.isMonsterAvatar)),
            chimeraChaos: Boolean(bp.chimeraChaos),
            mithrilSmithing: Boolean(bp.mithrilSmithing),
            wovenSongs: Boolean(bp.wovenSongs),
            martialStances: Boolean(bp.martialStances),
            wantedBounties: Boolean(bp.wantedBounties),
            pantheonAltars: Boolean(bp.pantheonAltars),
            livingPhysics: Boolean(bp.livingPhysics),
            evolvingAllies: Boolean(bp.evolvingAllies),
            stampedVaults: bp.stampedVaults !== false,
            unidentifiedAppearances: Boolean(bp.unidentifiedAppearances),
            ryodHash: bp.ryodHash,
            ryodBlueprint: bp,
            title: `${bp.title} [${bp.ryodHash}]`,
            usesExpLevels: bp.progressionMode !== 'brogue_item',
            maxLevel: bp.progressionMode === 'brogue_item' ? 0 : 50,
            hasTown: bp.hasTown,
            victoryMode: bp.victoryMode,
            progressionMode: bp.progressionMode,
            powerDiscipline: bp.resolvedDiscipline,
            resourceLabel: disciplineSpec.resourceLabel,
            verbLabel: disciplineSpec.verbLabel,
            beatitude: bp.beatitude,
            difficulty: bp.difficulty,
            godMode: bp.godMode,
            mapLayout: bp.mapLayout || 'classic',
            mutatorId: bp.mutatorId || 'balanced',
            d20Fate: bp.d20Fate || 15,
            d20FateTitle: bp.d20Fate === 20 ? 'Vault Relic Boon & Shrine Blessing' : (bp.d20Fate >= 15 ? 'Explorer Cache & Speed' : (bp.d20Fate === 1 ? 'Nemesis Shade Hunt & 2× Score' : (bp.d20Fate <= 7 ? 'Hardscrabble Provisions' : 'Adventurer Gold'))),
            d20FateDescription: bp.d20Fate === 20
                ? 'Starts with blessed relic ring, supreme healing, and persistent shrine favor.'
                : (bp.d20Fate >= 15 ? 'Starts with 45 gold, potion of speed, and magic mapping scroll.'
                : (bp.d20Fate === 1 ? 'Hunted across floors by a deadly Nemesis Shade, but all score/XP is doubled (2× multiplier)!'
                : (bp.d20Fate <= 7 ? 'Starts with meager hardscrabble provisions.'
                : 'Starts with 15 gold and a standard healing draught.'))),
            d20FateType: bp.d20Fate === 20 ? 'nat20_boon' : (bp.d20Fate >= 15 ? 'high_boon' : (bp.d20Fate === 1 ? 'nat1_dare' : (bp.d20Fate <= 7 ? 'low_burden' : 'standard'))),
            nemesisName: bp.nemesisName,
            customNemesisName: bp.customNemesisName || undefined,
            customTitle: bp.customTitle || undefined,
            hazardDensity: bp.hazardDensity,
            startingPet: petSpec,
            captiveAllies: bp.captiveAllies,
            elderRumor: bp.elderRumor,
            defaultBranch: bp.title,
            defaultDeity: bp.deity || storySpec.deity,
            goalDepth: bp.goalDepth,
            goalItemName: bp.goalItemName,
            goalGlyph: storySpec.goalGlyph || '"',
            goalBadge: bp.goalItemName,
            healingPotionName: 'potion of healing',
            foodName: 'iron ration',
            welcomeMessage: `Welcome to ${bp.title} (${biomeSpec.label})! ${bp.acts[0].banner}`,
            lore: `${bp.subtitle} — ${bp.elderRumor}`,
            roles,
            allies: bp.captiveAllies ? Pool.CAPTIVE_ALLIES.map(a => ({ ...a })) : [],
            monsters: flatMonsters.length > 0 ? flatMonsters : Pool.BESTIARY_FACTIONS.warbands.monsters,
            floorCohorts: cohorts,
            actMilestones,
            actFloors,
            items,
            onBlueprintHydrate(hydratedBp) {
                return compileEngineSpec(hydratedBp);
            },
            resolveActForDepth(depth) {
                if (depth <= 0) return { index: 0, ...bp.acts[0] };
                const idx = Math.min(4, Math.max(0, Math.floor(((depth - 1) / Math.max(1, bp.goalDepth)) * 5)));
                return { index: idx, ...bp.acts[idx] };
            },
            formatStatusLine(state) {
                const p = state.player;
                const act = this.resolveActForDepth(state.depth);
                const loc = state.depth === 0 ? 'Town' : `D:${state.depth}/${bp.goalDepth}`;
                const godTag = bp.godMode ? ' [GOD]' : '';
                if (bp.progressionMode === 'brogue_item') {
                    return `${loc} (Act ${act.act})${godTag}  Au:${p.gold}  HP:${p.hp}/${p.hpMax}  ${disciplineSpec.resourceLabel}:${p.pw}/${p.pwMax}  STR:${p.str}  Ench:+${p.enchantments || 0}`;
                }
                return `${loc} (Act ${act.act})${godTag}  Lv:${p.level || 1}  Au:${p.gold}  HP:${p.hp}/${p.hpMax}  ${disciplineSpec.resourceLabel}:${p.pw}/${p.pwMax}  AC:${p.ac}`;
            }
        };
    }

    const MASTERWORK_PRESETS = [
        {
            id: 'first_age_anvil',
            title: 'The First Age Mithril Forge',
            subtitle: 'Halls of Gondolin ring with ancient song and adamantine craft.',
            archetypeId: 'obsidian_covenant',
            biome: 'obsidian',
            storyArc: 'shattered_covenant',
            heroOrigin: 'warrior',
            powerDiscipline: 'martial',
            progressionMode: 'xp',
            goalDepth: 15,
            victoryMode: 'boss_kill',
            mithrilSmithing: true,
            wovenSongs: true,
            stampedVaults: true
        },
        {
            id: 'mazes_of_alchemy',
            title: 'The Mazes of Alchemy',
            subtitle: 'NetHack-style unidentified draughts, sacred fountains, and fickle BUC beatitude.',
            archetypeId: 'gothic_necropolis',
            biome: 'catacombs',
            storyArc: 'ossuary_crown',
            heroOrigin: 'rogue',
            powerDiscipline: 'auto',
            progressionMode: 'xp',
            goalDepth: 15,
            beatitude: true,
            unidentifiedAppearances: true,
            stampedVaults: true
        },
        {
            id: 'luminous_crucible',
            title: 'The Luminous Spore Crucible',
            subtitle: 'Brogue-inspired caustic gases, living wildfire, and captive allies evolving across grottos.',
            archetypeId: 'underdark_plague',
            biome: 'bioluminescent',
            storyArc: 'spore_choir',
            heroOrigin: 'warrior',
            powerDiscipline: 'auto',
            progressionMode: 'brogue_item',
            goalDepth: 15,
            livingPhysics: true,
            captiveAllies: true,
            evolvingAllies: true
        },
        {
            id: 'pantheon_gauntlet',
            title: 'The Ecumenical Pantheon Gauntlet',
            subtitle: 'DCSS six-deity pantheon altars, piety tithes, and celestial weapon gifts.',
            archetypeId: 'gothic_necropolis',
            biome: 'catacombs',
            storyArc: 'ossuary_crown',
            heroOrigin: 'priest',
            powerDiscipline: 'piety',
            progressionMode: 'xp',
            goalDepth: 15,
            pantheonAltars: true,
            deity: 'Trog'
        },
        {
            id: 'wyrm_beholder_ascendant',
            title: 'Ascendant Eyestalk of Chaos',
            subtitle: 'True playable creature avatar: 6 eyestalk ring slots, chasm levitation, and disintegration rays.',
            archetypeId: 'clockwork_abyss',
            biome: 'chaos_rift',
            storyArc: 'clockwork_abyss',
            heroOrigin: 'beholder',
            avatarId: 'beholder',
            isMonsterAvatar: true,
            powerDiscipline: 'arcane',
            progressionMode: 'xp',
            goalDepth: 15
        },
        {
            id: 'bushido_bounty_tower',
            title: 'Tower of the Shogunate Bounties',
            subtitle: 'Hengband martial stances (Genbu, Byakko, Seiryu, Suzaku) and wanted criminal floor bounties.',
            archetypeId: 'shadow_shogunate',
            biome: 'shadow_keep',
            storyArc: 'crown_of_cinders',
            heroOrigin: 'warrior',
            powerDiscipline: 'martial',
            martialStances: true,
            wantedBounties: true,
            goalDepth: 15
        },
        {
            id: 'yendor_relic_ascent',
            title: 'The Descent for the Relic of Yendor',
            subtitle: 'Rogue classic ascent pursuit: retrieve the Amulet from the depths and escape to DL 1 while hunted.',
            archetypeId: 'glacial_bastion',
            biome: 'frozen_wastes',
            storyArc: 'frozen_throne',
            heroOrigin: 'rogue',
            powerDiscipline: 'auto',
            progressionMode: 'xp',
            goalDepth: 10,
            victoryMode: 'relic_ascent'
        },
        {
            id: 'true_chimera_chaos',
            title: 'The True Chimera Forge',
            subtitle: 'All 8 roguelike disciplines ignited simultaneously in glorious cross-realm chaos.',
            archetypeId: 'clockwork_abyss',
            biome: 'chaos_rift',
            storyArc: 'clockwork_abyss',
            heroOrigin: 'beholder',
            avatarId: 'beholder',
            isMonsterAvatar: true,
            powerDiscipline: 'arcane',
            chimeraChaos: true,
            mithrilSmithing: true,
            wovenSongs: true,
            martialStances: true,
            wantedBounties: true,
            pantheonAltars: true,
            livingPhysics: true,
            captiveAllies: true,
            evolvingAllies: true,
            beatitude: true,
            stampedVaults: true,
            unidentifiedAppearances: true,
            victoryMode: 'relic_ascent',
            goalDepth: 15
        }
    ];

    return {
        computeRyodHash,
        normalizeConfig,
        rollCoherentBlueprint,
        encodePermalink,
        decodePermalink,
        buildFloorCohorts,
        compileEngineSpec,
        parseSeed,
        mulberry32,
        MASTERWORK_PRESETS
    };
});

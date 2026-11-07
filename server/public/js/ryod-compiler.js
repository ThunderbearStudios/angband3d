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

        const seed = (Number(raw.seed) >>> 0) || 0x59415344;
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

        const rng = xorshift32(seed);
        let heroOriginId = raw.heroOrigin || baseArch.heroOrigin || 'warrior';
        if (heroOriginId === 'random' || !Pool.HERO_ORIGINS[heroOriginId]) {
            const heroKeys = Object.keys(Pool.HERO_ORIGINS);
            heroOriginId = heroKeys[rng() % heroKeys.length];
        }
        const heroSpec = Pool.HERO_ORIGINS[heroOriginId] || Pool.HERO_ORIGINS.warrior;

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

        const victoryMode = ['boss_kill', 'ascension', 'three_runes'].includes(raw.victoryMode)
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

        const normalized = {
            version: '1.0',
            archetypeId: baseArch.id,
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
            deity: storySpec.deity,
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
            c.d20Fate || 15
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
                d20Fate: arr[20] != null ? Number(arr[20]) : undefined
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
        const selectedHero = Pool.HERO_ORIGINS[bp.heroOrigin] || Pool.HERO_ORIGINS.warrior;
        const petSpec = Pool.PET_COMPANIONS[bp.pet] || null;

        // Build roles list with the chosen heroOrigin first (`key: 'a'`) so Quick-Start selects it automatically,
        // while Custom Birth (`-c`) displays all 12 roles/avatars (`a..l`).
        const orderedOrigins = [
            selectedHero,
            ...Object.values(Pool.HERO_ORIGINS).filter(h => h.id !== selectedHero.id)
        ];

        const hpFactor = bp.difficulty === 'story' ? 1.5 : 1.0;
        const roles = orderedOrigins.slice(0, 12).map((h, idx) => {
            const disc = Pool.POWER_DISCIPLINES[bp.powerDiscipline === 'auto' ? h.defaultDiscipline : bp.resolvedDiscipline] || disciplineSpec;
            return {
                key: String.fromCharCode(97 + idx),
                id: h.roleName,
                originId: h.id,
                race: h.race,
                isMonsterAvatar: Boolean(h.isMonsterAvatar),
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

        return {
            realm: 'ryod',
            magic: 'SaveRYOD',
            version: '11.8.0-ryod',
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

    return {
        computeRyodHash,
        normalizeConfig,
        rollCoherentBlueprint,
        encodePermalink,
        decodePermalink,
        buildFloorCohorts,
        compileEngineSpec
    };
});

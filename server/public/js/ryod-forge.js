/**
 * ryod-forge.js — "Roll Your Own Dungeon" (RYOD) Tactile Dice-Table Forge UI & Blueprint Manager
 *
 * Designed for instant, tabletop-style fun that fits 100% on a single screen without scrolling:
 *   1. Big d20 "Roll the Bones" Dice Tray (rolls all unlocked dice with tumble animation + d20 fate roll)
 *   2. 4 Tactile Dice Cards in a 2x2 Grid (with per-card 🎲 Roll, ◀/▶ nudge, and 🔒 Lock toggle):
 *        • d8 REALM & FOES (3D Biome + Bestiary Faction + 1-click Sanctuary Town toggle)
 *        • d8 MYTHIC PLOT (5-Act Story Spine + Overlord + 1-click Victory Mode toggle)
 *        • d12 HERO OR MONSTER AVATAR (7 Mortal Classes + 5 3D Creature Avatars + 1-click Pet roll)
 *        • d6 STAKES & TWIST (Standard 15F / Sprint 10F / Brogue Purist / Story 12F / Nightmare 20F / Immortal God Mode)
 *   3. Optional 1-line Vision Prompt + Portable .ryod.json Save/Load & Shareable URL Permalink.
 *
 * Zero-Bloat Compliance: Injects its own scoped stylesheet (#ryod-forge-styles) so 0 lines are added to dungeon.css.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RyodForge = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STORAGE_KEY_ACTIVE = 'angband3d_ryod_active_blueprint';
    const STORAGE_KEY_LIBRARY = 'angband3d_ryod_saved_blueprints';

    const STAKES_PRESETS = [
        {
            id: 'standard_quest',
            label: '⚔️ Standard Quest (15 Floors)',
            sub: 'Balanced 1.0x Foes • Classic XP + Enchanting • Altars & Captive Allies',
            goalDepth: 15,
            progressionMode: 'hybrid',
            difficulty: 'standard',
            godMode: false,
            beatitude: true,
            captiveAllies: true,
            hazardDensity: 'tactical'
        },
        {
            id: 'sprint_heist',
            label: '⚡ Fast Delve Sprint (10 Floors)',
            sub: 'Quick 10-Floor Blitz • Fast Pacing • Treasure Vaults & Traps',
            goalDepth: 10,
            progressionMode: 'xp',
            difficulty: 'standard',
            godMode: false,
            beatitude: true,
            captiveAllies: true,
            hazardDensity: 'tactical'
        },
        {
            id: 'brogue_purist',
            label: '🔥 Brogue Purist (15 Floors • Zero XP)',
            sub: 'No XP Levels • Empower Gear via Enchant Scrolls, Strength Potions & Allies',
            goalDepth: 15,
            progressionMode: 'brogue_item',
            difficulty: 'standard',
            godMode: false,
            beatitude: false,
            captiveAllies: true,
            hazardDensity: 'abundant'
        },
        {
            id: 'story_explorer',
            label: '🛡️ Story & Exploration (10 Floors)',
            sub: 'Forgiving 0.72x Foes • +50% Hero Vigor • Ideal for Sightseeing & Lore',
            goalDepth: 10,
            progressionMode: 'hybrid',
            difficulty: 'story',
            godMode: false,
            beatitude: true,
            captiveAllies: true,
            hazardDensity: 'minimal'
        },
        {
            id: 'nightmare_doom',
            label: '💀 Nightmare Doom (25 Floors)',
            sub: 'Brutal 1.35x Apex Foes • 25 Deep Floors • Abundant Traps & Vaults',
            goalDepth: 25,
            progressionMode: 'hybrid',
            difficulty: 'nightmare',
            godMode: false,
            beatitude: true,
            captiveAllies: true,
            hazardDensity: 'abundant'
        },
        {
            id: 'god_sandbox',
            label: '⚡ Immortal God Mode (15 Floors)',
            sub: 'Never Die (999 HP/Mana, +9 Gear) • Press [G] Anytime to Warp Floors!',
            goalDepth: 15,
            progressionMode: 'hybrid',
            difficulty: 'standard',
            godMode: true,
            beatitude: true,
            captiveAllies: true,
            hazardDensity: 'tactical'
        }
    ];

    let _currentBlueprint = null;
    let _savedLibrary = [];
    let _modalEl = null;

    // 6-Die Hybrid Roll-or-Pick Tabletop State + Locks
    const _diceState = {
        biomeIdx: 0,
        bestiaryIdx: 0,
        storyIdx: 0,
        heroIdx: 0,
        disciplineIdx: 0,
        mutatorIdx: 0,
        petIdx: 0,
        mapLayout: 'classic',
        hasTown: true,
        captiveAllies: true,
        beatitude: true,
        victoryMode: 'boss_kill',
        progressionMode: 'hybrid',
        goalDepth: 15,
        difficulty: 'standard',
        d20Roll: 18,
        seed: 133742,
        locks: { biome: false, bestiary: false, story: false, hero: false, discipline: false, mutator: false }
    };

    function getPool() {
        return (typeof window !== 'undefined' && window.RealmContentPool) ||
               (typeof global !== 'undefined' && global.RealmContentPool) || null;
    }

    function getCompiler() {
        return (typeof window !== 'undefined' && window.RyodCompiler) ||
               (typeof global !== 'undefined' && global.RyodCompiler) || null;
    }

    function esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function playDiceSfx() {
        try {
            if (typeof window !== 'undefined' && window.__app && window.__app.audio) {
                if (typeof window.__app.audio.playMenuSelect === 'function') {
                    window.__app.audio.playMenuSelect();
                }
            }
        } catch (_) {}
    }

    function injectStyles() {
        if (typeof document === 'undefined' || document.getElementById('ryod-forge-styles')) return;
        const style = document.createElement('style');
        style.id = 'ryod-forge-styles';
        style.textContent = `
            @keyframes ryodDieTumble {
                0% { transform: rotate(0deg) scale(1); }
                30% { transform: rotate(-18deg) scale(1.12); }
                65% { transform: rotate(14deg) scale(1.06); }
                100% { transform: rotate(0deg) scale(1); }
            }
            .ryod-forge-overlay {
                position: fixed; inset: 0; z-index: 10200;
                background: rgba(5, 7, 12, 0.86); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px);
                display: flex; align-items: center; justify-content: center; padding: 8px;
            }
            .ryod-forge-overlay.hidden { display: none !important; }
            .ryod-forge-card {
                width: min(920px, 96vw); max-height: 95vh;
                background: linear-gradient(180deg, rgba(22, 18, 30, 0.99) 0%, rgba(11, 10, 16, 0.99) 100%);
                border: 1px solid rgba(245, 158, 11, 0.6); border-radius: 12px;
                box-shadow: 0 18px 50px rgba(0, 0, 0, 0.88), 0 0 24px rgba(245, 158, 11, 0.16);
                display: flex; flex-direction: column; overflow: hidden; color: #e2e8f0;
                font-family: var(--font-body, 'Outfit', sans-serif);
            }
            .ryod-forge-header {
                display: flex; align-items: center; justify-content: space-between; gap: 8px;
                padding: 8px 14px; border-bottom: 1px solid rgba(245, 158, 11, 0.28);
                background: rgba(14, 11, 20, 0.95);
            }
            .ryod-forge-title {
                font-family: var(--font-title, 'Cinzel', serif); font-size: 1.02rem;
                font-weight: 800; color: #fbbf24; letter-spacing: 0.6px; margin: 0;
            }
            .ryod-forge-subtitle { font-size: 0.72rem; color: #94a3b8; }
            .ryod-forge-body {
                padding: 9px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
            }
            .ryod-dice-tray {
                display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
                background: linear-gradient(90deg, rgba(44, 24, 68, 0.65) 0%, rgba(30, 22, 16, 0.75) 100%);
                border: 1px solid rgba(251, 191, 36, 0.45); border-radius: 9px; padding: 6px 10px;
            }
            .ryod-d20-badge {
                display: inline-flex; align-items: center; gap: 6px;
                background: rgba(15, 11, 24, 0.92); border: 1px solid #fbbf24;
                color: #fde68a; font-weight: 800; font-size: 0.82rem;
                padding: 5px 10px; border-radius: 8px; min-width: 124px; cursor: pointer;
                box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.2);
            }
            .ryod-rolling .ryod-d20-badge, .ryod-rolling .ryod-select-input {
                animation: ryodDieTumble 0.26s ease;
            }
            .ryod-btn-roll-all {
                background: linear-gradient(180deg, #f59e0b 0%, #b45309 100%);
                color: #fff; font-weight: 800; border: 1px solid #fde68a;
                border-radius: 7px; padding: 6px 13px; font-size: 0.81rem; cursor: pointer;
                box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35);
            }
            .ryod-btn-roll-all:hover { filter: brightness(1.08); }
            .ryod-prompt-mini {
                flex: 1; min-width: 170px; background: rgba(9, 8, 14, 0.9);
                border: 1px solid rgba(168, 85, 247, 0.4); color: #f8fafc;
                border-radius: 6px; padding: 5px 9px; font-size: 0.76rem;
            }
            .ryod-dice-grid {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
            }
            @media (max-width: 780px) { .ryod-dice-grid { grid-template-columns: repeat(2, 1fr); } }
            @media (max-width: 540px) { .ryod-dice-grid { grid-template-columns: 1fr; } }
            .ryod-die-card {
                background: rgba(17, 15, 26, 0.92); border: 1px solid rgba(212, 175, 55, 0.32);
                border-radius: 9px; padding: 7px 9px; display: flex; flex-direction: column; gap: 5px;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .ryod-die-card.locked {
                border-color: rgba(56, 189, 248, 0.65);
                box-shadow: inset 0 0 12px rgba(56, 189, 248, 0.12);
            }
            .ryod-die-top {
                display: flex; align-items: center; justify-content: space-between; gap: 4px;
            }
            .ryod-die-label {
                font-family: var(--font-title, 'Cinzel', serif); font-size: 0.7rem;
                font-weight: 800; color: #fbbf24; letter-spacing: 0.4px;
            }
            .ryod-die-actions { display: flex; align-items: center; gap: 3px; }
            .ryod-mini-btn {
                background: rgba(30, 26, 44, 0.95); color: #fde68a;
                border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 5px;
                padding: 2px 6px; font-size: 0.68rem; font-weight: 700; cursor: pointer;
            }
            .ryod-mini-btn:hover { background: rgba(245, 158, 11, 0.22); }
            .ryod-mini-btn.locked {
                background: rgba(14, 116, 144, 0.35); color: #7dd3fc; border-color: #38bdf8;
            }
            .ryod-stepper-row {
                display: flex; align-items: center; gap: 4px;
                background: rgba(9, 8, 15, 0.92); border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 6px; padding: 3px 5px;
            }
            .ryod-step-arrow {
                background: transparent; border: none; color: #fbbf24;
                font-size: 0.78rem; font-weight: 800; cursor: pointer; padding: 1px 4px;
            }
            .ryod-select-input {
                flex: 1; min-width: 0; background: transparent; border: none;
                color: #f8fafc; font-size: 0.76rem; font-weight: 700;
                cursor: pointer; outline: none; font-family: inherit;
            }
            .ryod-select-input option {
                background: #110f1a; color: #f8fafc; font-weight: 600;
            }
            .ryod-die-subRow {
                display: flex; align-items: center; justify-content: space-between; gap: 4px;
                font-size: 0.67rem; color: #94a3b8; flex-wrap: wrap;
            }
            .ryod-die-desc {
                flex: 1; min-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .ryod-sub-pill {
                background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(148, 163, 184, 0.35);
                color: #e2e8f0; border-radius: 99px; padding: 1px 6px; font-size: 0.65rem;
                font-weight: 600; cursor: pointer; white-space: nowrap;
            }
            .ryod-sub-pill:hover { border-color: #fbbf24; color: #fde68a; }
            .ryod-summary-strip {
                background: linear-gradient(90deg, rgba(30, 20, 12, 0.92) 0%, rgba(20, 15, 32, 0.92) 100%);
                border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 8px;
                padding: 6px 11px; display: flex; flex-direction: column; gap: 3px;
            }
            .ryod-summary-top {
                display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;
            }
            .ryod-preview-title {
                font-family: var(--font-title, 'Cinzel', serif); font-weight: 800; color: #fde68a; font-size: 0.84rem;
            }
            .ryod-hash-pill {
                font-family: var(--font-terminal, monospace); font-size: 0.68rem;
                background: rgba(245, 158, 11, 0.16); border: 1px solid rgba(245, 158, 11, 0.45);
                color: #fbbf24; padding: 1px 7px; border-radius: 99px;
            }
            .ryod-preview-premise {
                font-size: 0.71rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .ryod-forge-footer {
                display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
                gap: 6px; padding: 8px 14px; border-top: 1px solid rgba(245, 158, 11, 0.28);
                background: rgba(12, 10, 18, 0.96);
            }
            .ryod-btn-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
            .ryod-btn-primary {
                background: linear-gradient(180deg, #10b981 0%, #047857 100%);
                color: #fff; font-weight: 800; border: 1px solid #6ee7b7;
                border-radius: 7px; padding: 6px 14px; font-size: 0.82rem; cursor: pointer;
                box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
            }
            .ryod-btn-instant {
                background: linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%);
                color: #f3e8ff; font-weight: 800; border: 1px solid #c084fc;
                border-radius: 6px; padding: 5px 10px; font-size: 0.75rem; cursor: pointer;
            }
            .ryod-btn-outline {
                background: rgba(24, 22, 34, 0.9); color: #fcd34d;
                border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 6px;
                padding: 4px 8px; font-size: 0.71rem; cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    function getLists() {
        const pool = getPool();
        const biomes = pool ? Object.values(pool.BIOMES || {}) : [];
        const factionEntries = pool ? Object.values(pool.BESTIARY_FACTIONS || {}) : [];
        const bestiaries = [
            { id: 'theme_matched', label: '🎯 Theme-Matched Foes (Auto-Synergy)', desc: 'Matches your 3D Biome automatically' },
            ...factionEntries,
            { id: 'omni_pantheon', label: '🌌 Omni-Pantheon (All 8 Realms)', desc: 'Cross-realm icons from every roguelike' }
        ];
        const stories = pool ? Object.values(pool.STORY_ARCS || {}) : [];
        const heroes = pool ? Object.values(pool.HERO_ORIGINS || {}) : [];
        const discEntries = pool ? Object.values(pool.POWER_DISCIPLINES || {}) : [];
        const disciplines = [
            { id: 'auto', label: '✨ Hero Signature Discipline (Auto)', resourceLabel: 'AUTO', verbLabel: 'Signature Power' },
            ...discEntries
        ];
        const mutators = pool && pool.WORLD_MUTATORS ? Object.values(pool.WORLD_MUTATORS) : [
            { id: 'balanced', label: '⚖️ Balanced Realm (Classic Rules)', desc: 'Standard tactical challenge' }
        ];
        const petKeys = pool && pool.PET_COMPANIONS ? Object.keys(pool.PET_COMPANIONS) : ['war_hound', 'shadow_panther', 'fire_drake', 'clockwork_scarab', 'barrow_hound', 'none'];
        return {
            worlds: pool ? (pool.WORLD_ARCHETYPES || []) : [],
            biomes,
            bestiaries,
            stories,
            heroes,
            disciplines,
            mutators,
            pets: petKeys,
            petSpecs: pool ? (pool.PET_COMPANIONS || {}) : {},
            layouts: ['classic', 'caverns', 'labyrinth', 'arena'],
            layoutSpecs: (pool && pool.MAP_LAYOUTS) || {}
        };
    }

    function loadSavedLibrary() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(STORAGE_KEY_LIBRARY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) _savedLibrary = parsed.slice(0, 8);
                }
            }
        } catch (_) {}
        return _savedLibrary;
    }

    function saveBlueprintToLibrary(bp) {
        if (!bp || !bp.ryodHash) return;
        loadSavedLibrary();
        _savedLibrary = _savedLibrary.filter(item => item && item.ryodHash !== bp.ryodHash);
        _savedLibrary.unshift(bp);
        if (_savedLibrary.length > 8) _savedLibrary.length = 8;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(_savedLibrary));
            }
        } catch (_) {}
    }

    function syncDiceStateFromBlueprint(bp) {
        if (!bp) return;
        const lists = getLists();
        const bIdx = lists.biomes.findIndex(b => b.id === bp.biome);
        if (bIdx >= 0) _diceState.biomeIdx = bIdx;
        const fIdx = lists.bestiaries.findIndex(f => f.id === (bp.bestiary || 'theme_matched'));
        if (fIdx >= 0) _diceState.bestiaryIdx = fIdx;
        const sIdx = lists.stories.findIndex(s => s.id === bp.storyArc);
        if (sIdx >= 0) _diceState.storyIdx = sIdx;
        const hIdx = lists.heroes.findIndex(h => h.id === bp.heroOrigin);
        if (hIdx >= 0) _diceState.heroIdx = hIdx;
        const dIdx = lists.disciplines.findIndex(d => d.id === (bp.powerDiscipline || 'auto'));
        if (dIdx >= 0) _diceState.disciplineIdx = dIdx;
        const mIdx = lists.mutators.findIndex(m => m.id === (bp.mutatorId || (bp.godMode ? 'god_sandbox' : 'balanced')));
        if (mIdx >= 0) _diceState.mutatorIdx = mIdx;
        const pIdx = lists.pets.indexOf(bp.pet || 'war_hound');
        if (pIdx >= 0) _diceState.petIdx = pIdx;

        _diceState.mapLayout = bp.mapLayout || 'classic';
        _diceState.hasTown = bp.hasTown !== false;
        _diceState.captiveAllies = bp.captiveAllies !== false;
        _diceState.beatitude = bp.beatitude !== false;
        _diceState.victoryMode = bp.victoryMode || 'boss_kill';
        _diceState.progressionMode = bp.progressionMode || 'hybrid';
        _diceState.goalDepth = bp.goalDepth || 15;
        _diceState.difficulty = bp.difficulty || 'standard';
        _diceState.d20Roll = bp.d20Fate || 18;
        _diceState.seed = bp.seed || 133742;
    }

    function buildConfigFromDiceState() {
        const lists = getLists();
        const biome = lists.biomes[_diceState.biomeIdx] || lists.biomes[0] || { id: 'obsidian' };
        const bestiary = lists.bestiaries[_diceState.bestiaryIdx] || lists.bestiaries[0] || { id: 'theme_matched' };
        const story = lists.stories[_diceState.storyIdx] || lists.stories[0] || { id: 'shattered_covenant' };
        const hero = lists.heroes[_diceState.heroIdx] || lists.heroes[0] || { id: 'warrior' };
        const disc = lists.disciplines[_diceState.disciplineIdx] || lists.disciplines[0] || { id: 'auto' };
        const mutator = lists.mutators[_diceState.mutatorIdx] || lists.mutators[0] || { id: 'balanced' };
        const pet = lists.pets[_diceState.petIdx] || 'war_hound';
        const matchingArch = lists.worlds.find(w => w.biome === biome.id) || lists.worlds[0] || { id: 'obsidian_covenant' };

        return {
            seed: _diceState.seed || 133742,
            archetypeId: matchingArch.id,
            biome: biome.id,
            mapLayout: _diceState.mapLayout || 'classic',
            storyArc: story.id,
            bestiary: bestiary.id,
            heroOrigin: hero.id,
            powerDiscipline: disc.id,
            mutatorId: mutator.id,
            d20Fate: _diceState.d20Roll || 15,
            pet: mutator.id === 'packmaster' && pet === 'none' ? 'war_hound' : pet,
            hasTown: _diceState.hasTown,
            victoryMode: _diceState.victoryMode,
            goalDepth: _diceState.goalDepth || 15,
            progressionMode: _diceState.progressionMode || 'hybrid',
            difficulty: _diceState.difficulty || 'standard',
            godMode: mutator.id === 'god_sandbox',
            beatitude: _diceState.beatitude,
            captiveAllies: _diceState.captiveAllies,
            hazardDensity: mutator.id === 'cataclysm' ? 'abundant' : 'tactical'
        };
    }

    function initDefaultBlueprint() {
        const compiler = getCompiler();
        if (!compiler) return null;
        try {
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                const params = new URLSearchParams(window.location.search);
                const bpParam = params.get('bp');
                if (bpParam) {
                    const decoded = compiler.decodePermalink(bpParam);
                    if (decoded) {
                        const bp = compiler.normalizeConfig(decoded);
                        syncDiceStateFromBlueprint(bp);
                        applyBlueprintToRuntime(bp);
                        return bp;
                    }
                }
            }
            if (typeof localStorage !== 'undefined') {
                const saved = localStorage.getItem(STORAGE_KEY_ACTIVE);
                if (saved) {
                    const bp = compiler.normalizeConfig(JSON.parse(saved));
                    syncDiceStateFromBlueprint(bp);
                    applyBlueprintToRuntime(bp);
                    return bp;
                }
            }
        } catch (_) {}
        const fallback = compiler.normalizeConfig({ archetypeId: 'obsidian_covenant' });
        syncDiceStateFromBlueprint(fallback);
        applyBlueprintToRuntime(fallback);
        return fallback;
    }

    function applyBlueprintToRuntime(bp) {
        const compiler = getCompiler();
        const normalized = (compiler && bp && !bp.ryodHash) ? compiler.normalizeConfig(bp) : bp;
        if (!normalized) return null;
        _currentBlueprint = normalized;
        if (typeof window !== 'undefined') {
            window.__activeRyodBlueprint = normalized;
            try {
                localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(normalized));
            } catch (_) {}
            if (typeof window.updateRyodRealmMetadata === 'function') {
                window.updateRyodRealmMetadata(normalized);
            }
        }
        return normalized;
    }

    function triggerRollAnimation() {
        if (!_modalEl) return;
        const card = _modalEl.querySelector('.ryod-forge-card');
        if (!card) return;
        card.classList.remove('ryod-rolling');
        void card.offsetWidth;
        card.classList.add('ryod-rolling');
        playDiceSfx();
    }

    function rollSingleDie(slot) {
        const lists = getLists();
        _diceState.seed = Math.floor(Math.random() * 899999) + 100000;
        _diceState.d20Roll = Math.floor(Math.random() * 20) + 1;
        const pickDiff = (cur, len) => {
            if (len <= 1) return 0;
            let n = Math.floor(Math.random() * len);
            return n === cur ? (n + 1) % len : n;
        };
        if (slot === 'biome' || slot === 'world') {
            _diceState.biomeIdx = pickDiff(_diceState.biomeIdx, lists.biomes.length);
            const layouts = lists.layouts;
            _diceState.mapLayout = layouts[Math.floor(Math.random() * layouts.length)];
        } else if (slot === 'bestiary') {
            _diceState.bestiaryIdx = pickDiff(_diceState.bestiaryIdx, lists.bestiaries.length);
        } else if (slot === 'story') {
            _diceState.storyIdx = pickDiff(_diceState.storyIdx, lists.stories.length);
        } else if (slot === 'hero') {
            _diceState.heroIdx = pickDiff(_diceState.heroIdx, lists.heroes.length);
            _diceState.petIdx = Math.floor(Math.random() * (lists.pets.length - 1));
        } else if (slot === 'discipline') {
            _diceState.disciplineIdx = pickDiff(_diceState.disciplineIdx, lists.disciplines.length);
        } else if (slot === 'mutator' || slot === 'stakes') {
            _diceState.mutatorIdx = pickDiff(_diceState.mutatorIdx, lists.mutators.length);
        }
        triggerRollAnimation();
        recompileFromDice();
    }

    function rollAllUnlockedDice(promptText = '') {
        const lists = getLists();
        const compiler = getCompiler();
        _diceState.seed = Math.floor(Math.random() * 899999) + 100000;
        _diceState.d20Roll = Math.floor(Math.random() * 20) + 1;

        if (promptText && compiler) {
            const woven = compiler.rollCoherentBlueprint({ prompt: promptText, seed: _diceState.seed });
            syncDiceStateFromBlueprint(woven);
        } else {
            if (!_diceState.locks.biome && lists.biomes.length > 0) {
                _diceState.biomeIdx = Math.floor(Math.random() * lists.biomes.length);
                _diceState.mapLayout = Math.random() < 0.55 ? 'classic' : lists.layouts[Math.floor(Math.random() * lists.layouts.length)];
            }
            const activeBiome = lists.biomes[_diceState.biomeIdx] || lists.biomes[0];
            if (!_diceState.locks.bestiary && lists.bestiaries.length > 0) {
                if (Math.random() < 0.55) {
                    const defIdx = lists.bestiaries.findIndex(b => b.id === activeBiome.defaultBestiary);
                    _diceState.bestiaryIdx = defIdx >= 0 ? defIdx : 0;
                } else {
                    _diceState.bestiaryIdx = Math.floor(Math.random() * lists.bestiaries.length);
                }
            }
            if (!_diceState.locks.story && lists.stories.length > 0) {
                const sigIdx = lists.stories.findIndex(s => s.id === activeBiome.defaultStory);
                _diceState.storyIdx = (sigIdx >= 0 && Math.random() < 0.55) ? sigIdx : Math.floor(Math.random() * lists.stories.length);
            }
            if (!_diceState.locks.hero && lists.heroes.length > 0) {
                _diceState.heroIdx = Math.floor(Math.random() * lists.heroes.length);
                _diceState.petIdx = Math.floor(Math.random() * (lists.pets.length - 1));
            }
            if (!_diceState.locks.discipline && lists.disciplines.length > 0) {
                _diceState.disciplineIdx = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * lists.disciplines.length);
            }
            if (!_diceState.locks.mutator && lists.mutators.length > 0) {
                _diceState.mutatorIdx = Math.random() < 0.10 ? (lists.mutators.length - 1) : Math.floor(Math.random() * Math.max(1, lists.mutators.length - 1));
            }
        }
        triggerRollAnimation();
        return recompileFromDice();
    }

    function stepDie(slot, delta) {
        const lists = getLists();
        const step = (cur, len) => len ? (cur + delta + len) % len : 0;
        if (slot === 'biome' || slot === 'world') _diceState.biomeIdx = step(_diceState.biomeIdx, lists.biomes.length);
        else if (slot === 'bestiary') _diceState.bestiaryIdx = step(_diceState.bestiaryIdx, lists.bestiaries.length);
        else if (slot === 'story') _diceState.storyIdx = step(_diceState.storyIdx, lists.stories.length);
        else if (slot === 'hero') _diceState.heroIdx = step(_diceState.heroIdx, lists.heroes.length);
        else if (slot === 'discipline') _diceState.disciplineIdx = step(_diceState.disciplineIdx, lists.disciplines.length);
        else if (slot === 'mutator' || slot === 'stakes') _diceState.mutatorIdx = step(_diceState.mutatorIdx, lists.mutators.length);
        playDiceSfx();
        recompileFromDice();
    }

    function recompileFromDice() {
        const compiler = getCompiler();
        if (!compiler) return _currentBlueprint;
        const cfg = buildConfigFromDiceState();
        const bp = compiler.normalizeConfig(cfg);
        applyBlueprintToRuntime(bp);
        renderDiceUI();
        return bp;
    }

    function buildModalDOM() {
        if (typeof document === 'undefined') return null;
        injectStyles();
        let existing = document.getElementById('ryod-forge-modal');
        if (existing) return existing;

        const lists = getLists();
        const makeOpts = (arr, labelFn) => arr.map((item, i) => `<option value="${i}">${esc(labelFn(item))}</option>`).join('');

        const overlay = document.createElement('div');
        overlay.id = 'ryod-forge-modal';
        overlay.className = 'ryod-forge-overlay hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Roll Your Own Dungeon Tabletop Forge');

        overlay.innerHTML = `
            <div class="ryod-forge-card">
                <div class="ryod-forge-header">
                    <div>
                        <h2 class="ryod-forge-title">🎲 ROLL YOUR OWN DUNGEON — TABLETOP FORGE</h2>
                        <div class="ryod-forge-subtitle">Roll Any Die [🎲], Pick Directly from Any Dropdown [▾], Lock Favorites [🔒], or Drop Straight In!</div>
                    </div>
                    <div class="ryod-btn-row">
                        <button type="button" id="btn-ryod-quick-dropin" class="ryod-btn-instant" title="Roll all dice and drop straight into 3D play!">⚡ Quick Roll &amp; Play</button>
                        <button type="button" id="btn-ryod-close" class="ryod-btn-outline" title="Close [Esc]">✕</button>
                    </div>
                </div>

                <div class="ryod-forge-body">
                    <div class="ryod-dice-tray">
                        <button type="button" class="ryod-d20-badge" id="ryod-d20-display" title="Click to reroll your d20 Starting Fate Boon! (20 = Blessed +3 Relic + Extra Heal, 15-19 = +45 Au &amp; Speed, 1 = Cursed Grim Dare)">🎲 d20: 18 ★</button>
                        <button type="button" id="btn-ryod-reroll-spine" class="ryod-btn-roll-all" title="Roll all unlocked dice!">🎲 Roll the Bones (Reroll Unlocked)</button>
                        <input type="text" id="ryod-architect-prompt" class="ryod-prompt-mini" maxlength="160" placeholder="Optional theme (e.g. 'frozen vampire heist', 'gilded dragon runes')...">
                        <button type="button" id="btn-ryod-weave-prompt" class="ryod-btn-outline" title="Roll dice weighted to your theme">✨ Weave Theme</button>
                    </div>

                    <div class="ryod-dice-grid">
                        <!-- CARD 1: d8 3D BIOME & ARCHITECTURE -->
                        <div class="ryod-die-card" id="ryod-card-biome">
                            <div class="ryod-die-top">
                                <span class="ryod-die-label">🏰 d8 3D BIOME &amp; LAYOUT</span>
                                <div class="ryod-die-actions">
                                    <button type="button" class="ryod-mini-btn" data-roll-die="biome">🎲 Roll</button>
                                    <button type="button" class="ryod-mini-btn" data-lock-die="biome">🔓 Keep</button>
                                </div>
                            </div>
                            <div class="ryod-stepper-row">
                                <button type="button" class="ryod-step-arrow" data-step-die="biome" data-dir="-1">◀</button>
                                <select id="ryod-select-biome" class="ryod-select-input" data-select-die="biome" aria-label="Select 3D Biome">
                                    ${makeOpts(lists.biomes, b => b.label)}
                                </select>
                                <button type="button" class="ryod-step-arrow" data-step-die="biome" data-dir="1">▶</button>
                            </div>
                            <div class="ryod-die-subRow">
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-layout" title="Cycle Floor Architecture Layout">🗺️ Classic Rooms</button>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-town" title="Toggle Depth 0 Sanctuary Town">🏘️ Town: ON</button>
                            </div>
                        </div>

                        <!-- CARD 2: d10 BESTIARY & ALLIES -->
                        <div class="ryod-die-card" id="ryod-card-bestiary">
                            <div class="ryod-die-top">
                                <span class="ryod-die-label">👹 d10 BESTIARY &amp; ALLIES</span>
                                <div class="ryod-die-actions">
                                    <button type="button" class="ryod-mini-btn" data-roll-die="bestiary">🎲 Roll</button>
                                    <button type="button" class="ryod-mini-btn" data-lock-die="bestiary">🔓 Keep</button>
                                </div>
                            </div>
                            <div class="ryod-stepper-row">
                                <button type="button" class="ryod-step-arrow" data-step-die="bestiary" data-dir="-1">◀</button>
                                <select id="ryod-select-bestiary" class="ryod-select-input" data-select-die="bestiary" aria-label="Select Bestiary Faction">
                                    ${makeOpts(lists.bestiaries, f => f.label)}
                                </select>
                                <button type="button" class="ryod-step-arrow" data-step-die="bestiary" data-dir="1">▶</button>
                            </div>
                            <div class="ryod-die-subRow">
                                <span class="ryod-die-desc" id="ryod-desc-bestiary">Coherent 3D Monster Faction</span>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-allies" title="Toggle Liberated Captive Allies on Floors">⛓️ Allies: ON</button>
                            </div>
                        </div>

                        <!-- CARD 3: d8 MYTHIC PLOT & GOAL -->
                        <div class="ryod-die-card" id="ryod-card-story">
                            <div class="ryod-die-top">
                                <span class="ryod-die-label">📜 d8 MYTHIC PLOT &amp; GOAL</span>
                                <div class="ryod-die-actions">
                                    <button type="button" class="ryod-mini-btn" data-roll-die="story">🎲 Roll</button>
                                    <button type="button" class="ryod-mini-btn" data-lock-die="story">🔓 Keep</button>
                                </div>
                            </div>
                            <div class="ryod-stepper-row">
                                <button type="button" class="ryod-step-arrow" data-step-die="story" data-dir="-1">◀</button>
                                <select id="ryod-select-story" class="ryod-select-input" data-select-die="story" aria-label="Select 5-Act Mythic Plot">
                                    ${makeOpts(lists.stories, s => `📜 ${s.title}`)}
                                </select>
                                <button type="button" class="ryod-step-arrow" data-step-die="story" data-dir="1">▶</button>
                            </div>
                            <div class="ryod-die-subRow">
                                <span class="ryod-die-desc" id="ryod-desc-story">Boss: Preceptor Malakor</span>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-victory" title="Cycle Victory Condition (Slay Boss / Relic Ascension / 3 Runes + Boss)">🏆 Slay Boss</button>
                            </div>
                        </div>

                        <!-- CARD 4: d12 HERO / MONSTER AVATAR & PET -->
                        <div class="ryod-die-card" id="ryod-card-hero">
                            <div class="ryod-die-top">
                                <span class="ryod-die-label">⚔️ d12 HERO / AVATAR &amp; PET</span>
                                <div class="ryod-die-actions">
                                    <button type="button" class="ryod-mini-btn" data-roll-die="hero">🎲 Roll</button>
                                    <button type="button" class="ryod-mini-btn" data-lock-die="hero">🔓 Keep</button>
                                </div>
                            </div>
                            <div class="ryod-stepper-row">
                                <button type="button" class="ryod-step-arrow" data-step-die="hero" data-dir="-1">◀</button>
                                <select id="ryod-select-hero" class="ryod-select-input" data-select-die="hero" aria-label="Select Hero Class or Monster Avatar">
                                    ${makeOpts(lists.heroes, h => `${h.isMonsterAvatar ? '' : '⚔️ '}${String(h.label).replace(/\s*\((Mortal Class|Creature Avatar)\)/i, '')}`)}
                                </select>
                                <button type="button" class="ryod-step-arrow" data-step-die="hero" data-dir="1">▶</button>
                            </div>
                            <div class="ryod-die-subRow">
                                <span class="ryod-die-desc" id="ryod-desc-hero">[m] Shield Bash Surge</span>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-pet" title="Cycle Starting Companion Pet">🐾 War Hound</button>
                            </div>
                        </div>

                        <!-- CARD 5: d6 POWER DISCIPLINE & LEVELING -->
                        <div class="ryod-die-card" id="ryod-card-discipline">
                            <div class="ryod-die-top">
                                <span class="ryod-die-label">✨ d6 POWER &amp; LEVELING</span>
                                <div class="ryod-die-actions">
                                    <button type="button" class="ryod-mini-btn" data-roll-die="discipline">🎲 Roll</button>
                                    <button type="button" class="ryod-mini-btn" data-lock-die="discipline">🔓 Keep</button>
                                </div>
                            </div>
                            <div class="ryod-stepper-row">
                                <button type="button" class="ryod-step-arrow" data-step-die="discipline" data-dir="-1">◀</button>
                                <select id="ryod-select-discipline" class="ryod-select-input" data-select-die="discipline" aria-label="Select Power Discipline">
                                    ${makeOpts(lists.disciplines, d => d.label)}
                                </select>
                                <button type="button" class="ryod-step-arrow" data-step-die="discipline" data-dir="1">▶</button>
                            </div>
                            <div class="ryod-die-subRow">
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-prog" title="Cycle Progression (Hybrid / Classic XP / Brogue Gear-Only)">📈 Hybrid XP+Gear</button>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-beatitude" title="Toggle Altar Blessings &amp; BUC">🙏 Altars: ON</button>
                            </div>
                        </div>

                        <!-- CARD 6: d8 WORLD MUTATOR, DEPTH & DIFFICULTY -->
                        <div class="ryod-die-card" id="ryod-card-mutator">
                            <div class="ryod-die-top">
                                <span class="ryod-die-label">🔥 d8 MUTATOR &amp; STAKES</span>
                                <div class="ryod-die-actions">
                                    <button type="button" class="ryod-mini-btn" data-roll-die="mutator">🎲 Roll</button>
                                    <button type="button" class="ryod-mini-btn" data-lock-die="mutator">🔓 Keep</button>
                                </div>
                            </div>
                            <div class="ryod-stepper-row">
                                <button type="button" class="ryod-step-arrow" data-step-die="mutator" data-dir="-1">◀</button>
                                <select id="ryod-select-mutator" class="ryod-select-input" data-select-die="mutator" aria-label="Select World Mutator">
                                    ${makeOpts(lists.mutators, m => m.label)}
                                </select>
                                <button type="button" class="ryod-step-arrow" data-step-die="mutator" data-dir="1">▶</button>
                            </div>
                            <div class="ryod-die-subRow">
                                <span class="ryod-die-desc" id="ryod-desc-mutator">Standard tactical challenge</span>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-depth" title="Cycle Dungeon Depth (10F / 15F / 25F)">📏 15 Floors</button>
                                <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-diff" title="Cycle Difficulty">⚖️ Standard</button>
                            </div>
                        </div>
                    </div>

                    <div class="ryod-summary-strip">
                        <div class="ryod-summary-top">
                            <span class="ryod-preview-title" id="ryod-preview-title">The Shattered Covenant</span>
                            <span class="ryod-hash-pill" id="ryod-preview-hash" title="Save-World Handshake ID">RYOD-00000000</span>
                        </div>
                        <div class="ryod-preview-premise" id="ryod-preview-premise"></div>
                    </div>
                </div>

                <div class="ryod-forge-footer">
                    <div class="ryod-btn-row">
                        <button type="button" id="btn-ryod-save-lib" class="ryod-btn-outline" title="Pin this rolled dungeon to your browser">📌 Pin</button>
                        <button type="button" id="btn-ryod-export-json" class="ryod-btn-outline" title="Download .ryod.json blueprint file">💾 Save .json</button>
                        <label for="ryod-file-import" class="ryod-btn-outline" style="cursor:pointer; margin:0;" title="Load a .ryod.json blueprint file">📂 Load .json</label>
                        <input type="file" id="ryod-file-import" accept=".json,.ryod.json" style="display:none;">
                        <button type="button" id="btn-ryod-copy-link" class="ryod-btn-outline" title="Copy shareable URL permalink">🔗 Share Link</button>
                        <span id="ryod-saved-shelf" style="display:inline-flex; gap:4px; align-items:center;"></span>
                        <span id="ryod-status-msg" style="font-size:0.72rem; color:#4ade80;"></span>
                    </div>
                    <div class="ryod-btn-row">
                        <button type="button" id="btn-ryod-launch" class="ryod-btn-primary">⚔️ Enter Rolled Dungeon</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        _modalEl = overlay;
        bindModalEvents(overlay);
        return overlay;
    }

    function setStatus(msg) {
        const el = typeof document !== 'undefined' && document.getElementById('ryod-status-msg');
        if (el) {
            el.textContent = msg;
            if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
        }
    }

    function renderDiceUI() {
        if (typeof document === 'undefined' || !_modalEl) return;
        const lists = getLists();
        const bp = _currentBlueprint || initDefaultBlueprint();

        const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
        const setSel = (id, idx) => { const el = document.getElementById(id); if (el) el.value = String(idx); };

        const d20Quality = _diceState.d20Roll === 20 ? 'NAT 20! ★ (+3 Relic)' : (_diceState.d20Roll >= 15 ? 'Boon! (+45 Au)' : (_diceState.d20Roll === 1 ? 'Grim Dare! (+100 Au)' : ''));
        setTxt('ryod-d20-display', `🎲 d20: ${_diceState.d20Roll} ${d20Quality}`);

        setSel('ryod-select-biome', _diceState.biomeIdx);
        setSel('ryod-select-bestiary', _diceState.bestiaryIdx);
        setSel('ryod-select-story', _diceState.storyIdx);
        setSel('ryod-select-hero', _diceState.heroIdx);
        setSel('ryod-select-discipline', _diceState.disciplineIdx);
        setSel('ryod-select-mutator', _diceState.mutatorIdx);

        const layoutLabels = { classic: '🗺️ Classic Rooms', caverns: '🍄 Cavern Halls', labyrinth: '🧱 Dense Vaults', arena: '🏟️ Boss Arenas' };
        setTxt('btn-ryod-cycle-layout', layoutLabels[_diceState.mapLayout] || '🗺️ Classic Rooms');
        setTxt('btn-ryod-toggle-town', _diceState.hasTown ? '🏘️ Town: ON' : '🕳️ No Town');

        const facSpec = lists.bestiaries[_diceState.bestiaryIdx] || {};
        const resolvedFac = lists.bestiaries.find(f => f.id === bp.resolvedBestiary);
        setTxt('ryod-desc-bestiary', facSpec.id === 'theme_matched' ? `Auto: ${(resolvedFac && resolvedFac.label) || bp.resolvedBestiary}` : (facSpec.desc || '3D Monster Cohort'));
        setTxt('btn-ryod-toggle-allies', _diceState.captiveAllies ? '⛓️ Allies: ON' : '⛓️ Allies: OFF');

        const story = lists.stories[_diceState.storyIdx] || {};
        setTxt('ryod-desc-story', `Boss: ${(story.nemesis && story.nemesis.name) || bp.nemesisName} • ${story.goalItemName || bp.goalItemName}`);
        const vicLabels = { boss_kill: '🏆 Slay Boss', ascension: '🏆 Relic Heist', three_runes: '🏆 3 Runes + Boss' };
        setTxt('btn-ryod-toggle-victory', vicLabels[_diceState.victoryMode] || '🏆 Slay Boss');

        const hero = lists.heroes[_diceState.heroIdx] || {};
        const disc = ( getPool() && getPool().POWER_DISCIPLINES && getPool().POWER_DISCIPLINES[bp.resolvedDiscipline] ) || { verbLabel: 'Power', resourceLabel: 'MANA' };
        const powerName = (hero.innatePower && hero.innatePower.name) || disc.verbLabel;
        setTxt('ryod-desc-hero', `[m] ${powerName} • ${disc.resourceLabel || 'MANA'}`);
        const petId = lists.pets[_diceState.petIdx] || 'war_hound';
        const petSpec = lists.petSpecs[petId];
        setTxt('btn-ryod-cycle-pet', petId === 'none' ? '🚶 Solo' : `🐾 ${petSpec ? String(petSpec.label).split('(')[0].trim() : petId}`);

        const progLabels = { hybrid: '📈 Hybrid XP+Gear', xp: '⚔️ Classic XP', brogue_item: '🔥 Brogue Gear-Only' };
        setTxt('btn-ryod-cycle-prog', progLabels[_diceState.progressionMode] || '📈 Hybrid XP+Gear');
        setTxt('btn-ryod-toggle-beatitude', _diceState.beatitude ? '🙏 Altars: ON' : '🙏 Altars: OFF');

        const mutSpec = lists.mutators[_diceState.mutatorIdx] || {};
        setTxt('ryod-desc-mutator', mutSpec.desc || 'Standard tactical rules');
        setTxt('btn-ryod-cycle-depth', `📏 ${_diceState.goalDepth}F`);
        const diffLabels = { story: '🛡️ Story 0.7x', standard: '⚖️ Standard 1.0x', nightmare: '💀 Nightmare 1.35x' };
        setTxt('btn-ryod-cycle-diff', diffLabels[_diceState.difficulty] || '⚖️ Standard');

        ['biome', 'bestiary', 'story', 'hero', 'discipline', 'mutator'].forEach(slot => {
            const card = document.getElementById(`ryod-card-${slot}`);
            const btn = _modalEl.querySelector(`[data-lock-die="${slot}"]`);
            const isLocked = Boolean(_diceState.locks[slot]);
            if (card) card.classList.toggle('locked', isLocked);
            if (btn) {
                btn.classList.toggle('locked', isLocked);
                btn.textContent = isLocked ? '🔒 Locked' : '🔓 Keep';
            }
        });

        setTxt('ryod-preview-title', `${bp.title} (${bp.hasTown ? 'Town + ' : ''}${bp.goalDepth}F • ${hero.roleName || hero.id} • ${mutSpec.label ? String(mutSpec.label).split('(')[0].trim() : 'Balanced'})`);
        setTxt('ryod-preview-hash', `${bp.ryodHash} • Seed #${bp.seed}`);
        setTxt('ryod-preview-premise', bp.elderRumor || bp.subtitle || '');

        renderSavedShelf();
    }

    function renderSavedShelf() {
        const shelfEl = typeof document !== 'undefined' && document.getElementById('ryod-saved-shelf');
        if (!shelfEl) return;
        loadSavedLibrary();
        if (_savedLibrary.length === 0) {
            shelfEl.innerHTML = '';
            return;
        }
        shelfEl.innerHTML = _savedLibrary.slice(0, 3).map((b, idx) =>
            `<button type="button" class="ryod-btn-outline" data-load-lib-idx="${idx}" title="Load pinned blueprint ${esc(b.title)} (${esc(b.ryodHash)})">📌 ${esc(String(b.title).slice(0, 14))}</button>`
        ).join('');
        shelfEl.querySelectorAll('[data-load-lib-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-load-lib-idx'));
                const target = _savedLibrary[idx];
                if (target) {
                    syncDiceStateFromBlueprint(target);
                    applyBlueprintToRuntime(target);
                    renderDiceUI();
                    setStatus(`✓ Loaded "${target.title}"`);
                }
            });
        });
    }

    async function persistBlueprintToServer(bp, charName = 'Adventurer') {
        if (!bp) return bp;
        try {
            const res = await fetch('/api/ryod/blueprint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ saveName: charName, ryodConfig: bp })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.blueprint) {
                    applyBlueprintToRuntime(data.blueprint);
                    return data.blueprint;
                }
            }
        } catch (_) {}
        return bp;
    }

    async function launchRyodAdventure(bp, instantRandom = true) {
        const activeBp = applyBlueprintToRuntime(bp || _currentBlueprint || initDefaultBlueprint());
        close();
        const heroSlug = String((activeBp && activeBp.heroOrigin) || 'Hero').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'Hero';
        const hashSuffix = String((activeBp && activeBp.ryodHash) || 'RYOD').replace(/^RYOD[-_]/i, '').slice(0, 4);
        const slotName = `${heroSlug}_RYOD_${hashSuffix}`;
        await persistBlueprintToServer(activeBp, slotName);
        if (typeof window !== 'undefined' && window.__app) {
            if (typeof window.__app.selectRealm === 'function') {
                window.__app.selectRealm('ryod', false);
            }
            if (typeof window.__app.startNewRyodGame === 'function') {
                window.__app.startNewRyodGame(slotName, activeBp, instantRandom);
            }
        }
    }

    function bindModalEvents(overlay) {
        overlay.querySelectorAll('[data-roll-die]').forEach(el => {
            el.addEventListener('click', () => rollSingleDie(el.getAttribute('data-roll-die')));
        });

        overlay.querySelectorAll('[data-step-die]').forEach(btn => {
            btn.addEventListener('click', () => {
                const slot = btn.getAttribute('data-step-die');
                const dir = Number(btn.getAttribute('data-dir')) || 1;
                stepDie(slot, dir);
            });
        });

        overlay.querySelectorAll('[data-select-die]').forEach(sel => {
            sel.addEventListener('change', () => {
                const slot = sel.getAttribute('data-select-die');
                const val = Number(sel.value) || 0;
                if (slot === 'biome') _diceState.biomeIdx = val;
                else if (slot === 'bestiary') _diceState.bestiaryIdx = val;
                else if (slot === 'story') _diceState.storyIdx = val;
                else if (slot === 'hero') _diceState.heroIdx = val;
                else if (slot === 'discipline') _diceState.disciplineIdx = val;
                else if (slot === 'mutator') _diceState.mutatorIdx = val;
                playDiceSfx();
                recompileFromDice();
            });
        });

        overlay.querySelectorAll('[data-lock-die]').forEach(btn => {
            btn.addEventListener('click', () => {
                const slot = btn.getAttribute('data-lock-die');
                _diceState.locks[slot] = !_diceState.locks[slot];
                playDiceSfx();
                renderDiceUI();
            });
        });

        const d20Btn = overlay.querySelector('#ryod-d20-display');
        if (d20Btn) {
            d20Btn.addEventListener('click', () => {
                _diceState.d20Roll = Math.floor(Math.random() * 20) + 1;
                triggerRollAnimation();
                recompileFromDice();
            });
        }

        const layoutBtn = overlay.querySelector('#btn-ryod-cycle-layout');
        if (layoutBtn) {
            layoutBtn.addEventListener('click', () => {
                const layouts = ['classic', 'caverns', 'labyrinth', 'arena'];
                const idx = (layouts.indexOf(_diceState.mapLayout) + 1) % layouts.length;
                _diceState.mapLayout = layouts[idx];
                playDiceSfx();
                recompileFromDice();
            });
        }

        const townBtn = overlay.querySelector('#btn-ryod-toggle-town');
        if (townBtn) {
            townBtn.addEventListener('click', () => {
                _diceState.hasTown = !_diceState.hasTown;
                playDiceSfx();
                recompileFromDice();
            });
        }

        const alliesBtn = overlay.querySelector('#btn-ryod-toggle-allies');
        if (alliesBtn) {
            alliesBtn.addEventListener('click', () => {
                _diceState.captiveAllies = !_diceState.captiveAllies;
                playDiceSfx();
                recompileFromDice();
            });
        }

        const vicBtn = overlay.querySelector('#btn-ryod-toggle-victory');
        if (vicBtn) {
            vicBtn.addEventListener('click', () => {
                const modes = ['boss_kill', 'ascension', 'three_runes'];
                _diceState.victoryMode = modes[(modes.indexOf(_diceState.victoryMode) + 1) % modes.length];
                playDiceSfx();
                recompileFromDice();
            });
        }

        const petBtn = overlay.querySelector('#btn-ryod-cycle-pet');
        if (petBtn) {
            petBtn.addEventListener('click', () => {
                const lists = getLists();
                _diceState.petIdx = (_diceState.petIdx + 1) % lists.pets.length;
                playDiceSfx();
                recompileFromDice();
            });
        }

        const progBtn = overlay.querySelector('#btn-ryod-cycle-prog');
        if (progBtn) {
            progBtn.addEventListener('click', () => {
                const progs = ['hybrid', 'xp', 'brogue_item'];
                _diceState.progressionMode = progs[(progs.indexOf(_diceState.progressionMode) + 1) % progs.length];
                playDiceSfx();
                recompileFromDice();
            });
        }

        const beatBtn = overlay.querySelector('#btn-ryod-toggle-beatitude');
        if (beatBtn) {
            beatBtn.addEventListener('click', () => {
                _diceState.beatitude = !_diceState.beatitude;
                playDiceSfx();
                recompileFromDice();
            });
        }

        const depthBtn = overlay.querySelector('#btn-ryod-cycle-depth');
        if (depthBtn) {
            depthBtn.addEventListener('click', () => {
                const depths = [10, 15, 25];
                _diceState.goalDepth = depths[(depths.indexOf(_diceState.goalDepth) + 1) % depths.length];
                playDiceSfx();
                recompileFromDice();
            });
        }

        const diffBtn = overlay.querySelector('#btn-ryod-cycle-diff');
        if (diffBtn) {
            diffBtn.addEventListener('click', () => {
                const diffs = ['story', 'standard', 'nightmare'];
                _diceState.difficulty = diffs[(diffs.indexOf(_diceState.difficulty) + 1) % diffs.length];
                playDiceSfx();
                recompileFromDice();
            });
        }

        const closeBtn = overlay.querySelector('#btn-ryod-close');
        if (closeBtn) closeBtn.addEventListener('click', () => close());

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const rerollBtn = overlay.querySelector('#btn-ryod-reroll-spine');
        if (rerollBtn) {
            rerollBtn.addEventListener('click', () => {
                const promptEl = overlay.querySelector('#ryod-architect-prompt');
                const prompt = promptEl ? promptEl.value.trim() : '';
                const bp = rollAllUnlockedDice(prompt);
                if (bp) setStatus(`🎲 Rolled d20=${_diceState.d20Roll}: "${bp.title}"!`);
            });
        }

        const weaveBtn = overlay.querySelector('#btn-ryod-weave-prompt');
        if (weaveBtn) {
            weaveBtn.addEventListener('click', async () => {
                const promptEl = overlay.querySelector('#ryod-architect-prompt');
                const prompt = promptEl ? promptEl.value.trim() : '';
                let bp = rollAllUnlockedDice(prompt);
                if (prompt) {
                    try {
                        const res = await fetch('/api/ryod/architect', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt, seed: _diceState.seed })
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.blueprint) {
                                syncDiceStateFromBlueprint(data.blueprint);
                                bp = applyBlueprintToRuntime(data.blueprint);
                                renderDiceUI();
                            }
                        }
                    } catch (_) {}
                }
                if (bp) setStatus(`✨ Rolled "${bp.title}"!`);
            });
        }

        const quickDropBtn = overlay.querySelector('#btn-ryod-quick-dropin');
        if (quickDropBtn) {
            quickDropBtn.addEventListener('click', () => {
                const promptEl = overlay.querySelector('#ryod-architect-prompt');
                const prompt = promptEl ? promptEl.value.trim() : '';
                const bp = rollAllUnlockedDice(prompt);
                launchRyodAdventure(bp, true);
            });
        }

        const launchBtn = overlay.querySelector('#btn-ryod-launch');
        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                const bp = recompileFromDice();
                launchRyodAdventure(bp, true);
            });
        }

        const pinBtn = overlay.querySelector('#btn-ryod-save-lib');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => {
                const bp = recompileFromDice();
                saveBlueprintToLibrary(bp);
                renderSavedShelf();
                setStatus(`📌 Pinned "${bp.title}"!`);
            });
        }

        const exportBtn = overlay.querySelector('#btn-ryod-export-json');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const bp = recompileFromDice();
                downloadBlueprintJSON(bp);
                setStatus(`💾 Saved ${bp.ryodHash}.ryod.json`);
            });
        }

        const importInput = overlay.querySelector('#ryod-file-import');
        if (importInput) {
            importInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    const rawBp = parsed.blueprint || parsed.ryodConfig || parsed;
                    const compiler = getCompiler();
                    const bp = compiler ? compiler.normalizeConfig(rawBp) : rawBp;
                    syncDiceStateFromBlueprint(bp);
                    applyBlueprintToRuntime(bp);
                    saveBlueprintToLibrary(bp);
                    renderDiceUI();
                    setStatus(`📂 Loaded "${bp.title}"!`);
                } catch (_) {
                    setStatus(`❌ Invalid .ryod.json file`);
                }
                importInput.value = '';
            });
        }

        const linkBtn = overlay.querySelector('#btn-ryod-copy-link');
        if (linkBtn) {
            linkBtn.addEventListener('click', () => {
                const bp = recompileFromDice();
                const compiler = getCompiler();
                if (!compiler) return;
                const code = compiler.encodePermalink(bp);
                const url = `${window.location.origin}${window.location.pathname}?realm=ryod&bp=${code}`;
                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    navigator.clipboard.writeText(url).catch(() => {});
                }
                setStatus(`🔗 Permalink Copied!`);
            });
        }
    }

    function downloadBlueprintJSON(bp) {
        const target = bp || _currentBlueprint || initDefaultBlueprint();
        if (!target || typeof document === 'undefined') return;
        const slug = String(target.title || 'custom_realm').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36);
        const blob = new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}_${target.ryodHash || 'ryod'}.ryod.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function open() {
        const modal = buildModalDOM();
        if (!modal) return;
        // Every time you open the RYOD Dice Forge, give the unlocked dice a fresh roll so it immediately feels alive!
        rollAllUnlockedDice();
        modal.classList.remove('hidden');
    }

    function close() {
        if (_modalEl) _modalEl.classList.add('hidden');
    }

    function isOpen() {
        return Boolean(_modalEl && !_modalEl.classList.contains('hidden'));
    }

    function quickRandomizeAndLaunch() {
        const compiler = getCompiler();
        const seed = Math.floor(Math.random() * 899999) + 100000;
        const bp = compiler ? compiler.rollCoherentBlueprint({ seed }) : initDefaultBlueprint();
        syncDiceStateFromBlueprint(bp);
        return launchRyodAdventure(bp, true);
    }

    return {
        initDefaultBlueprint,
        getActiveBlueprint: () => _currentBlueprint || initDefaultBlueprint(),
        applyBlueprintToRuntime,
        persistBlueprintToServer,
        downloadBlueprintJSON,
        saveBlueprintToLibrary,
        loadSavedLibrary,
        rollAllUnlockedDice,
        rollSingleDie,
        open,
        close,
        isOpen,
        quickRandomizeAndLaunch
    };
});

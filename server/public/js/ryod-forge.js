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
    let _hasImportedBlueprint = false;
    let _activeArcadeAdvId = null;

    // 6-Die Hybrid Roll-or-Pick + Stackable Wild Twists State
    const _diceState = {
        biomeIdx: 0,
        bestiaryIdx: 0,
        storyIdx: 0,
        heroIdx: 0,
        disciplineIdx: 0,
        mutatorIdx: 0,
        mutators: [],
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
        customTitle: '',
        customNemesisName: '',
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
                background: rgba(6, 8, 13, 0.88); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
                display: flex; align-items: center; justify-content: center; padding: 8px;
            }
            .ryod-forge-overlay.hidden { display: none !important; }
            .ryod-forge-card {
                width: min(980px, 96vw); max-height: 95vh;
                background: radial-gradient(120% 90% at 50% 0%, rgba(212, 175, 55, 0.08) 0%, transparent 58%), linear-gradient(180deg, rgba(18, 21, 30, 0.99) 0%, rgba(9, 11, 16, 0.99) 100%);
                border: 1px solid rgba(212, 175, 55, 0.56); border-top: 2px solid #e5c158; border-radius: 10px;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.94), inset 0 1px 0 rgba(255, 236, 179, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
                display: flex; flex-direction: column; overflow: hidden; color: #dce0e8;
                font-family: var(--font-ui, 'Outfit', sans-serif);
            }
            .ryod-forge-header {
                display: flex; align-items: center; justify-content: space-between; gap: 8px;
                padding: 10px 16px; border-bottom: 1px solid rgba(212, 175, 55, 0.24);
                background: linear-gradient(180deg, rgba(22, 26, 38, 0.96) 0%, rgba(13, 16, 24, 0.98) 100%);
            }
            .ryod-forge-title {
                font-family: var(--font-title, 'Cinzel', serif); font-size: 1.04rem;
                font-weight: 800; color: #e5c158; letter-spacing: 0.9px; margin: 0;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
            }
            .ryod-forge-subtitle { font-size: 0.73rem; color: #9ca3b2; margin-top: 1px; }
            .ryod-forge-body {
                padding: 10px 16px; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 9px;
            }
            .ryod-dice-tray {
                display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
                background: linear-gradient(180deg, rgba(22, 26, 38, 0.95) 0%, rgba(12, 15, 22, 0.98) 100%);
                border: 1px solid rgba(212, 175, 55, 0.44); border-radius: 8px; padding: 7px 11px;
                box-shadow: inset 0 1px 0 rgba(255, 236, 179, 0.1), 0 4px 14px rgba(0, 0, 0, 0.65);
            }
            .ryod-d20-badge {
                display: inline-flex; align-items: center; gap: 6px;
                background: linear-gradient(180deg, #1b202e 0%, #0e121b 100%); border: 1px solid rgba(212, 175, 55, 0.65);
                color: #f5d77f; font-weight: 800; font-size: 0.81rem;
                padding: 6px 11px; border-radius: 6px; min-width: 124px; cursor: pointer;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.7);
                transition: border-color 0.14s ease, transform 0.14s ease;
            }
            .ryod-d20-badge:hover { border-color: #fde68a; color: #fff6d6; transform: translateY(-1px); }
            .ryod-rolling .ryod-d20-badge, .ryod-rolling .ryod-select-input {
                animation: ryodDieTumble 0.26s ease;
            }
            .ryod-btn-roll-all {
                background: linear-gradient(180deg, #3b2a10 0%, #1c1306 100%);
                color: #fde68a; font-weight: 800; border: 1px solid rgba(245, 215, 127, 0.82);
                border-radius: 6px; padding: 6px 13px; font-size: 0.81rem; cursor: pointer;
                box-shadow: inset 0 1px 0 rgba(255, 236, 179, 0.22), 0 2px 8px rgba(0, 0, 0, 0.75);
                transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
            }
            .ryod-btn-roll-all:hover {
                border-color: #fff6d6; color: #ffffff; transform: translateY(-1px);
                box-shadow: 0 4px 14px rgba(212, 175, 55, 0.35), inset 0 1px 0 rgba(255, 236, 179, 0.3);
            }
            .ryod-prompt-mini {
                flex: 1; min-width: 170px; background: #0d1018;
                border: 1px solid rgba(148, 163, 184, 0.36); color: #dce0e8;
                border-radius: 6px; padding: 6px 10px; font-size: 0.77rem;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
            }
            .ryod-prompt-mini:focus {
                border-color: #e5c158; outline: none; box-shadow: 0 0 10px rgba(212, 175, 55, 0.28);
            }
            .ryod-preset-bar {
                display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 2px;
            }
            .ryod-preset-pill {
                background: linear-gradient(180deg, #1c2230 0%, #10141e 100%);
                border: 1px solid rgba(212, 175, 55, 0.35); border-radius: 999px;
                padding: 3px 9px; font-size: 0.69rem; color: #cbd5e1; cursor: pointer;
                transition: all 0.15s ease;
            }
            .ryod-preset-pill:hover { border-color: #f5d77f; color: #fde68a; background: #262115; }
            .ryod-preset-pill.active {
                background: linear-gradient(180deg, #d4af37 0%, #a8841a 100%);
                border-color: #ffd700; color: #0a0d14; font-weight: 800;
                box-shadow: 0 0 10px rgba(212, 175, 55, 0.45);
            }
            .ryod-masterwork-strip {
                display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 6px;
                padding: 4px 8px; background: #0e121b; border: 1px solid rgba(212, 175, 55, 0.44); border-radius: 6px;
            }
            .ryod-masterwork-label {
                font-family: var(--font-title, 'Cinzel', serif); font-size: 0.69rem; font-weight: 800;
                color: #d4af37; letter-spacing: 0.5px; margin-right: 4px;
            }
            .ryod-masterwork-pill {
                background: linear-gradient(180deg, #1b202e 0%, #0e121b 100%);
                border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 4px;
                padding: 3px 8px; font-size: 0.68rem; color: #d4af37; cursor: pointer;
                transition: all 0.14s ease;
            }
            .ryod-masterwork-pill:hover {
                border-color: #e5c158; color: #fff6d6; background: #262115; transform: translateY(-1px);
            }
            .ryod-masterwork-pill.active {
                background: linear-gradient(180deg, #d4af37 0%, #a8841a 100%);
                border-color: #ffd700; color: #0e121b; font-weight: 800;
            }
            .ryod-naming-row {
                display: flex; gap: 8px; align-items: center; width: 100%;
            }
            .ryod-dice-grid {
                display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; width: 100%;
            }
            @media (max-width: 780px) { .ryod-dice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 540px) { .ryod-dice-grid { grid-template-columns: minmax(0, 1fr); } }
            .ryod-die-card {
                min-width: 0; overflow: hidden;
                background: linear-gradient(165deg, rgba(26, 31, 45, 0.96) 0%, rgba(14, 17, 26, 0.98) 100%);
                border: 1px solid rgba(212, 175, 55, 0.34); border-left: 3px solid rgba(212, 175, 55, 0.68);
                border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.65);
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .ryod-die-card:hover {
                border-color: rgba(245, 215, 127, 0.65); border-left-color: #f5d77f;
            }
            .ryod-die-card.locked {
                border-color: rgba(245, 215, 127, 0.88); border-left-color: #fde68a;
                background: linear-gradient(165deg, rgba(38, 34, 26, 0.96) 0%, rgba(18, 21, 31, 0.98) 100%);
                box-shadow: inset 0 0 14px rgba(212, 175, 55, 0.16), 0 4px 12px rgba(0, 0, 0, 0.7);
            }
            .ryod-die-top {
                display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0;
            }
            .ryod-die-label {
                font-family: var(--font-title, 'Cinzel', serif); font-size: 0.69rem;
                font-weight: 800; color: #e5c158; letter-spacing: 0.4px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
            }
            .ryod-die-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
            .ryod-mini-btn {
                background: linear-gradient(180deg, #23293a 0%, #131722 100%); color: #dce0e8;
                border: 1px solid rgba(212, 175, 55, 0.42); border-radius: 5px;
                padding: 2px 7px; font-size: 0.67rem; font-weight: 700; cursor: pointer;
                white-space: nowrap; flex-shrink: 0;
                transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
            }
            .ryod-mini-btn:hover { background: linear-gradient(180deg, #322918 0%, #1b160d 100%); border-color: #f5d77f; color: #fde68a; }
            .ryod-mini-btn.locked {
                background: linear-gradient(180deg, #3b2a10 0%, #1c1306 100%); color: #fde68a; border-color: #f5d77f;
            }
            .ryod-stepper-row {
                min-width: 0; width: 100%; box-sizing: border-box;
                display: flex; align-items: center; gap: 4px;
                background: #0d1018; border: 1px solid rgba(148, 163, 184, 0.28);
                border-radius: 6px; padding: 4px 6px;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8);
            }
            .ryod-step-arrow {
                background: transparent; border: none; color: #e5c158;
                font-size: 0.78rem; font-weight: 800; cursor: pointer; padding: 1px 5px;
            }
            .ryod-step-arrow:hover { color: #fde68a; }
            .ryod-select-input {
                flex: 1 1 0%; width: 0; min-width: 0; background: transparent; border: none;
                color: #e8ecf4; font-size: 0.76rem; font-weight: 600;
                cursor: pointer; outline: none; font-family: inherit;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .ryod-select-input option {
                background: #0e121b; color: #dce0e8; font-weight: 600; padding: 6px;
            }
            .ryod-die-subRow {
                display: flex; align-items: center; justify-content: space-between; gap: 4px;
                font-size: 0.68rem; color: #9ca3b2; flex-wrap: wrap;
            }
            .ryod-die-desc {
                flex: 1; min-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .ryod-sub-pill {
                background: linear-gradient(180deg, #1e2434 0%, #111520 100%); border: 1px solid rgba(148, 163, 184, 0.36);
                color: #cbd5e1; border-radius: 6px; padding: 2px 7px; font-size: 0.66rem;
                font-weight: 600; cursor: pointer; white-space: nowrap;
                transition: border-color 0.12s ease, color 0.12s ease;
            }
            .ryod-sub-pill:hover { border-color: #e5c158; color: #fde68a; }
            .ryod-summary-strip {
                background: linear-gradient(180deg, rgba(22, 26, 38, 0.95) 0%, rgba(12, 15, 22, 0.98) 100%);
                border: 1px solid rgba(212, 175, 55, 0.42); border-radius: 8px;
                padding: 7px 12px; display: flex; flex-direction: column; gap: 3px;
                box-shadow: inset 0 1px 0 rgba(255, 236, 179, 0.08), 0 4px 12px rgba(0, 0, 0, 0.6);
            }
            .ryod-summary-top {
                display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;
            }
            .ryod-preview-title {
                font-family: var(--font-title, 'Cinzel', serif); font-weight: 800; color: #f3d478; font-size: 0.84rem;
            }
            .ryod-hash-pill {
                font-family: var(--font-terminal, monospace); font-size: 0.68rem;
                background: #0e121b; border: 1px solid rgba(212, 175, 55, 0.48);
                color: #e5c158; padding: 2px 8px; border-radius: 5px;
            }
            .ryod-preview-premise {
                font-size: 0.72rem; color: #b8c0ce; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .ryod-forge-footer {
                display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
                gap: 6px; padding: 9px 16px; border-top: 1px solid rgba(212, 175, 55, 0.24);
                background: linear-gradient(180deg, rgba(16, 19, 28, 0.98) 0%, rgba(10, 12, 18, 0.99) 100%);
            }
            .ryod-btn-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
            .ryod-btn-primary {
                background: linear-gradient(180deg, #d4af37 0%, #9a7418 100%);
                color: #0b0d13; font-weight: 800; border: 1px solid #fde68a;
                border-radius: 6px; padding: 7px 16px; font-size: 0.83rem; cursor: pointer;
                box-shadow: 0 3px 12px rgba(212, 175, 55, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35);
                transition: transform 0.14s ease, filter 0.14s ease, box-shadow 0.14s ease;
            }
            .ryod-btn-primary:hover {
                filter: brightness(1.08); transform: translateY(-1px);
                box-shadow: 0 5px 16px rgba(212, 175, 55, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.45);
            }
            .ryod-btn-instant {
                background: linear-gradient(180deg, #252b3d 0%, #141824 100%);
                color: #f3d478; font-weight: 800; border: 1px solid rgba(212, 175, 55, 0.65);
                border-radius: 6px; padding: 6px 12px; font-size: 0.76rem; cursor: pointer;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 6px rgba(0, 0, 0, 0.65);
                transition: transform 0.14s ease, border-color 0.14s ease, color 0.14s ease;
            }
            .ryod-btn-instant:hover {
                border-color: #fde68a; color: #fff6d6; transform: translateY(-1px);
            }
            .ryod-btn-outline {
                background: linear-gradient(180deg, #222838 0%, #131722 100%); color: #dce0e8;
                border: 1px solid rgba(212, 175, 55, 0.42); border-radius: 6px;
                padding: 5px 9px; font-size: 0.72rem; font-weight: 600; cursor: pointer;
                transition: border-color 0.12s ease, color 0.12s ease;
            }
            .ryod-btn-outline:hover {
                border-color: #f5d77f; color: #fde68a;
            }
            .ryod-zone-title {
                font-family: var(--font-title, 'Cinzel', serif); font-size: 0.72rem; font-weight: 800;
                letter-spacing: 0.7px; color: #e5c158; text-transform: uppercase;
                display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px;
            }
            .ryod-hero-strip {
                display: grid; grid-template-columns: 1.55fr 1fr; gap: 8px; align-items: stretch;
            }
            @media (max-width: 680px) { .ryod-hero-strip { grid-template-columns: 1fr; } }
            .ryod-blitz-card, .ryod-surprise-card {
                display: flex; align-items: center; justify-content: space-between; gap: 10px;
                padding: 10px 12px; border-radius: 8px; cursor: pointer; text-align: left;
                transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
            }
            .ryod-blitz-card {
                background: linear-gradient(135deg, rgba(64, 44, 14, 0.92) 0%, rgba(22, 18, 12, 0.98) 100%);
                border: 1px solid rgba(245, 215, 127, 0.78); color: #fff6d6;
            }
            .ryod-surprise-card {
                background: linear-gradient(135deg, rgba(24, 34, 52, 0.95) 0%, rgba(13, 17, 26, 0.98) 100%);
                border: 1px solid rgba(148, 163, 184, 0.45); color: #e2e8f0;
            }
            .ryod-blitz-card:hover, .ryod-surprise-card:hover { transform: translateY(-1px); border-color: #fde68a; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55); }
            .ryod-adv-grid {
                display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px;
            }
            @media (max-width: 780px) { .ryod-adv-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (max-width: 500px) { .ryod-adv-grid { grid-template-columns: 1fr; } }
            .ryod-adv-card {
                display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 7px;
                background: linear-gradient(180deg, rgba(24, 29, 41, 0.96) 0%, rgba(13, 16, 24, 0.98) 100%);
                border: 1px solid rgba(201, 164, 92, 0.34); color: #dce0e8; text-align: left; cursor: pointer;
                transition: border-color 0.14s ease, transform 0.14s ease, background 0.14s ease;
            }
            .ryod-adv-card:hover, .ryod-adv-card.active { border-color: #f5d77f; background: linear-gradient(180deg, #272216 0%, #151721 100%); transform: translateY(-1px); }
            .ryod-adv-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-weight: 800; font-size: 0.77rem; color: #fde68a; }
            .ryod-adv-tag { font-size: 0.65rem; padding: 1px 6px; border-radius: 999px; background: rgba(212, 175, 55, 0.16); color: #f5d77f; border: 1px solid rgba(212, 175, 55, 0.42); }
            .ryod-adv-sub { font-size: 0.68rem; color: #9ca3b2; line-height: 1.28; }
            .ryod-toybox-picks {
                display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
            }
            @media (max-width: 820px) { .ryod-toybox-picks { grid-template-columns: 1fr; } }
            .ryod-pick-card {
                background: linear-gradient(165deg, rgba(22, 27, 39, 0.95) 0%, rgba(12, 15, 23, 0.98) 100%);
                border: 1px solid rgba(201, 164, 92, 0.32); border-radius: 8px; padding: 8px 9px;
                display: flex; flex-direction: column; gap: 6px;
            }
            .ryod-pill-grid { display: flex; flex-wrap: wrap; gap: 4px; }
            .ryod-pick-pill, .ryod-twist-chip {
                background: #141925; border: 1px solid rgba(148, 163, 184, 0.34); color: #cbd5e1;
                border-radius: 6px; padding: 4px 7px; font-size: 0.69rem; font-weight: 600; cursor: pointer;
                transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
            }
            .ryod-pick-pill:hover, .ryod-twist-chip:hover { border-color: #f5d77f; color: #fde68a; }
            .ryod-pick-pill.active, .ryod-twist-chip.active {
                background: linear-gradient(180deg, #d4af37 0%, #9a7418 100%); border-color: #fde68a; color: #0a0d14; font-weight: 800;
            }
            .ryod-tinker-drawer {
                background: rgba(13, 16, 24, 0.85); border: 1px solid rgba(201, 164, 92, 0.25); border-radius: 8px; padding: 6px 10px;
            }
            .ryod-tinker-drawer summary {
                cursor: pointer; font-size: 0.74rem; font-weight: 700; color: #e5c158; list-style: none; display: flex; align-items: center; justify-content: space-between;
            }
            .ryod-tinker-drawer[open] summary { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(201, 164, 92, 0.2); }
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
        if (!heroes.some(h => h.id === 'beholder')) {
            heroes.push({
                id: 'beholder',
                label: '👁️ Eldritch Beholder Eye (Creature Avatar)',
                isMonsterAvatar: true,
                avatarMonsterName: 'floating eye',
                avatarId: 'beholder',
                race: 'Aberration',
                roleName: 'Beholder Eye'
            });
        }
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
        const rawMuts = Array.isArray(bp.mutators)
            ? bp.mutators.filter(m => m && m !== 'balanced')
            : (bp.mutatorId && bp.mutatorId !== 'balanced' ? [bp.mutatorId] : (bp.godMode ? ['god_sandbox'] : []));
        _diceState.mutators = Array.from(new Set(rawMuts)).slice(0, 3);
        const primaryMutId = _diceState.mutators[0] || bp.mutatorId || (bp.godMode ? 'god_sandbox' : 'balanced');
        const mIdx = lists.mutators.findIndex(m => m.id === primaryMutId);
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
        _diceState.customTitle = bp.customTitle || '';
        _diceState.customNemesisName = bp.customNemesisName || '';
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

        const activeMutators = (Array.isArray(_diceState.mutators) && _diceState.mutators.length > 0)
            ? _diceState.mutators.slice(0, 3)
            : (mutator.id && mutator.id !== 'balanced' ? [mutator.id] : []);
        const primMut = activeMutators[0] || 'balanced';

        return {
            seed: _diceState.seed || 133742,
            customTitle: _diceState.customTitle || undefined,
            customNemesisName: _diceState.customNemesisName || undefined,
            archetypeId: matchingArch.id,
            biome: biome.id,
            mapLayout: _diceState.mapLayout || 'classic',
            storyArc: story.id,
            bestiary: bestiary.id,
            heroOrigin: hero.id,
            powerDiscipline: disc.id,
            mutatorId: primMut,
            mutators: activeMutators,
            d20Fate: _diceState.d20Roll || 15,
            pet: activeMutators.includes('packmaster') && pet === 'none' ? 'war_hound' : pet,
            hasTown: _diceState.hasTown,
            victoryMode: _diceState.victoryMode,
            goalDepth: _diceState.goalDepth || (activeMutators.includes('boss_rush') ? 8 : 15),
            progressionMode: _diceState.progressionMode || 'hybrid',
            difficulty: _diceState.difficulty || 'standard',
            godMode: activeMutators.includes('god_sandbox'),
            beatitude: _diceState.beatitude,
            captiveAllies: _diceState.captiveAllies,
            hazardDensity: activeMutators.includes('cataclysm') ? 'abundant' : 'tactical'
        };
    }

    function initDefaultBlueprint() {
        const compiler = getCompiler();
        if (!compiler) return null;
        try {
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                const params = new URLSearchParams(window.location.search);
                const bpParam = params.get('bp');
                const seedParam = params.get('seed');
                if (bpParam) {
                    const decoded = compiler.decodePermalink(bpParam);
                    if (decoded) {
                        const bp = compiler.normalizeConfig(decoded);
                        _hasImportedBlueprint = true;
                        syncDiceStateFromBlueprint(bp);
                        applyBlueprintToRuntime(bp);
                        return bp;
                    }
                } else if (seedParam) {
                    const seed = compiler.parseSeed ? compiler.parseSeed(seedParam) : (Number(seedParam) || 133742);
                    const bp = compiler.rollCoherentBlueprint({ seed });
                    _hasImportedBlueprint = true;
                    syncDiceStateFromBlueprint(bp);
                    applyBlueprintToRuntime(bp);
                    return bp;
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
            const chosenMut = lists.mutators[_diceState.mutatorIdx];
            _diceState.mutators = chosenMut && chosenMut.id !== 'balanced' ? [chosenMut.id] : [];
        }
        triggerRollAnimation();
        recompileFromDice();
    }

    function rollAllUnlockedDice(promptText = '') {
        _activeArcadeAdvId = null;
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
                const chosenMut = lists.mutators[_diceState.mutatorIdx];
                _diceState.mutators = chosenMut && chosenMut.id !== 'balanced' ? [chosenMut.id] : [];
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
        else if (slot === 'mutator' || slot === 'stakes') {
            _diceState.mutatorIdx = step(_diceState.mutatorIdx, lists.mutators.length);
            const chosenMut = lists.mutators[_diceState.mutatorIdx];
            _diceState.mutators = chosenMut && chosenMut.id !== 'balanced' ? [chosenMut.id] : [];
        }
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

        const compiler = getCompiler();
        const advs = (compiler && compiler.ARCADE_ADVENTURES) || [];
        const dailyBp = (compiler && typeof compiler.rollDailyBlitzBlueprint === 'function')
            ? compiler.rollDailyBlitzBlueprint()
            : null;
        const twistList = lists.mutators.filter(m => m && m.id && m.id !== 'balanced');
        const shortName = (lbl) => String(lbl || '').replace(/\s*\([^)]*\)/g, '').trim();

        const overlay = document.createElement('div');
        overlay.id = 'ryod-forge-modal';
        overlay.className = 'ryod-forge-overlay hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Roll Your Own Dungeon Arcade Toybox');

        overlay.innerHTML = `
            <div class="ryod-forge-card">
                <div class="ryod-forge-header">
                    <div>
                        <h2 class="ryod-forge-title">⚒️ ROLL YOUR OWN DUNGEON 3.0 — ARCADE TOYBOX</h2>
                        <div class="ryod-forge-subtitle">Jump straight into Today&rsquo;s Blitz or a curated Adventure, or stack up to 3 Wild Twists in your custom run!</div>
                    </div>
                    <div class="ryod-btn-row">
                        <button type="button" id="btn-ryod-close" class="ryod-btn-outline" title="Close [Esc]">✕</button>
                    </div>
                </div>

                <div class="ryod-forge-body">
                    <!-- ZONE 1: 1-CLICK PLAY STRIP -->
                    <div>
                        <div class="ryod-zone-title">
                            <span>⚡ Zone 1 &bull; 1-Click Play</span>
                            <span style="font-size:0.66rem; color:#9ca3b2; font-weight:600;">Instant 3D Launch &bull; Zero Setup</span>
                        </div>
                        <div class="ryod-hero-strip">
                            <button type="button" id="btn-ryod-daily-blitz" class="ryod-blitz-card" title="Same deterministic dungeon seed worldwide today">
                                <div>
                                    <div style="font-weight:800; font-size:0.86rem; color:#fde68a;">📅 Today&rsquo;s Daily Blitz</div>
                                    <div id="ryod-daily-blitz-sub" style="font-size:0.7rem; color:#e2d4b0; margin-top:2px;">${dailyBp ? `${esc(dailyBp.title)} &bull; ${esc(dailyBp.goalDepth)}F &bull; ${esc((dailyBp.mutators || ['balanced']).join(' + '))}` : 'Deterministic daily seeded gauntlet'}</div>
                                </div>
                                <span style="font-size:0.76rem; font-weight:800; color:#0b0d13; background:#f5d77f; padding:5px 10px; border-radius:6px; white-space:nowrap;">▶ Play Blitz</span>
                            </button>
                            <button type="button" id="btn-ryod-quick-dropin" class="ryod-surprise-card" title="Generate a fresh coherent run and drop straight in">
                                <div>
                                    <div style="font-weight:800; font-size:0.83rem; color:#f3d478;">🎲 Surprise Me!</div>
                                    <div style="font-size:0.69rem; color:#9ca3b2; margin-top:2px;">Coherent random hero, arena &amp; twists</div>
                                </div>
                                <span style="font-size:0.74rem; font-weight:800; color:#fde68a;">▶ Go</span>
                            </button>
                        </div>
                        <div class="ryod-adv-grid" style="margin-top:7px;">
                            ${advs.map(a => `
                                <div class="ryod-adv-card" data-arcade-adv="${esc(a.id)}" role="button" tabindex="0" title="${esc(a.tagline)}">
                                    <div class="ryod-adv-head">
                                        <span>${esc(a.crest)} ${esc(a.title)}</span>
                                        <span class="ryod-adv-tag" data-play-adv="${esc(a.id)}">▶ Play</span>
                                    </div>
                                    <div class="ryod-adv-sub">${esc(a.tagline)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- ZONE 2: 3-PICK CUSTOM TOYBOX -->
                    <div>
                        <div class="ryod-zone-title">
                            <span>🎛️ Zone 2 &bull; 3-Pick Custom Toybox</span>
                            <span style="font-size:0.66rem; color:#9ca3b2; font-weight:600;">Mix Any Arena + Fighter + up to 3 Stackable Twists</span>
                        </div>
                        <div class="ryod-toybox-picks">
                            <div class="ryod-pick-card">
                                <div class="ryod-die-top">
                                    <span class="ryod-die-label">1. ARENA (3D BIOME)</span>
                                </div>
                                <div class="ryod-pill-grid" id="ryod-pick-biomes">
                                    ${lists.biomes.map((b, i) => `<button type="button" class="ryod-pick-pill" data-pick-biome="${esc(b.id)}" data-pick-idx="${i}">${esc(shortName(b.label))}</button>`).join('')}
                                </div>
                            </div>
                            <div class="ryod-pick-card">
                                <div class="ryod-die-top">
                                    <span class="ryod-die-label">2. FIGHTER (HERO / AVATAR)</span>
                                </div>
                                <div class="ryod-pill-grid" id="ryod-pick-heroes">
                                    ${lists.heroes.map((h, i) => `<button type="button" class="ryod-pick-pill" data-pick-hero="${esc(h.id)}" data-pick-idx="${i}" title="${esc(h.roleName || h.id)}">${esc(shortName(h.label))}</button>`).join('')}
                                </div>
                            </div>
                            <div class="ryod-pick-card">
                                <div class="ryod-die-top">
                                    <span class="ryod-die-label">3. WILD TWISTS <span id="ryod-twist-count" style="color:#fde68a;">(0/3)</span></span>
                                    <button type="button" id="btn-ryod-clear-mutators" class="ryod-mini-btn" title="Clear all active twists">Clear</button>
                                </div>
                                <div class="ryod-pill-grid" id="ryod-pick-mutators">
                                    ${twistList.map(m => `<button type="button" class="ryod-twist-chip" data-toggle-mutator="${esc(m.id)}" title="${esc(m.desc)}">${esc(shortName(m.label))}</button>`).join('')}
                                </div>
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

                    <!-- ZONE 3: COLLAPSED ADVANCED TINKER DRAWER -->
                    <details class="ryod-tinker-drawer" id="ryod-tinker-drawer">
                        <summary>
                            <span>🛠️ Advanced Tinker Drawer (8 Masterwork Presets, 6-Die Locks, Stakes &amp; Naming)</span>
                            <span style="font-size:0.67rem; color:#9ca3b2;">▾ Click to expand</span>
                        </summary>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <div class="ryod-masterwork-strip">
                                <span class="ryod-masterwork-label">⚡ MASTERWORK:</span>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="first_age_anvil" title="Sil-Q Woven Songs &amp; Mithril Smithing">🔨 Mithril Anvil</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="mazes_of_alchemy" title="NetHack Unidentified Draughts, BUC &amp; Fountains">🧪 Alchemical Mazes</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="luminous_crucible" title="Brogue Living Gases, Wildfire &amp; Evolving Allies">🍄 Spore Crucible</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="pantheon_gauntlet" title="DCSS 6-Deity Pantheon, Piety &amp; Gifts">⚡ Pantheon Gauntlet</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="wyrm_beholder_ascendant" title="Playable Beholder Avatar: 6 Rings &amp; Disintegration">👁️ Beholder Chaos</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="bushido_bounty_tower" title="Hengband Martial Stances &amp; Wanted Bounties">⚔️ Bushido Bounties</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="yendor_relic_ascent" title="Rogue Relic Ascent Pursuit &amp; Apex Hunters">🏆 Relic Ascent</button>
                                <button type="button" class="ryod-masterwork-pill" data-masterwork="true_chimera_chaos" title="All 8 Canonical Disciplines Simultaneously">🌀 True Chimera</button>
                            </div>
                            <div class="ryod-preset-bar">
                                ${STAKES_PRESETS.map(p => `<button type="button" class="ryod-preset-pill" data-preset-id="${p.id}" title="${esc(p.sub)}">${esc(p.label)}</button>`).join('')}
                            </div>
                            <div class="ryod-dice-tray">
                                <button type="button" class="ryod-d20-badge" id="ryod-d20-display" title="Click to reroll your d20 Starting Fate Boon!">🎲 d20: 18 ★</button>
                                <button type="button" id="btn-ryod-reroll-spine" class="ryod-btn-roll-all" title="Roll all unlocked dice!">🎲 Roll Unlocked</button>
                                <input type="text" id="ryod-architect-prompt" class="ryod-prompt-mini" maxlength="160" placeholder="Optional theme (e.g. 'frozen vampire heist', 'gilded dragon runes')...">
                                <button type="button" id="btn-ryod-weave-prompt" class="ryod-btn-outline" title="Roll dice weighted to your theme">✨ Weave Theme</button>
                            </div>
                            <div class="ryod-dice-grid">
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
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-layout">🗺️ Classic Rooms</button>
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-town">🏘️ Town: ON</button>
                                    </div>
                                </div>
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
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-allies">⛓️ Allies: ON</button>
                                    </div>
                                </div>
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
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-victory">🏆 Slay Boss</button>
                                    </div>
                                </div>
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
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-pet">🐾 War Hound</button>
                                    </div>
                                </div>
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
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-prog">📈 Hybrid XP+Gear</button>
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-toggle-beatitude">🙏 Altars: ON</button>
                                    </div>
                                </div>
                                <div class="ryod-die-card" id="ryod-card-mutator">
                                    <div class="ryod-die-top">
                                        <span class="ryod-die-label">🔥 MUTATOR, DEPTH &amp; STAKES</span>
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
                                        <span class="ryod-die-desc" id="ryod-desc-mutator">Standard tactical rules</span>
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-depth">📏 15 Floors</button>
                                        <button type="button" class="ryod-sub-pill" id="btn-ryod-cycle-diff">⚖️ Standard</button>
                                    </div>
                                </div>
                            </div>
                            <div class="ryod-naming-row">
                                <input type="text" id="ryod-custom-title" class="ryod-prompt-mini" maxlength="60" placeholder="Custom Dungeon Title (e.g. 'Citadel of the Wyrm Sovereign')...">
                                <input type="text" id="ryod-custom-nemesis" class="ryod-prompt-mini" maxlength="60" placeholder="Custom Nemesis Name (e.g. 'Malakor the Undying')...">
                            </div>
                        </div>
                    </details>
                </div>

                <div class="ryod-forge-footer">
                    <div class="ryod-btn-row">
                        <button type="button" id="btn-ryod-save-lib" class="ryod-btn-outline" title="Pin this run to your browser">📌 Pin</button>
                        <button type="button" id="btn-ryod-export-json" class="ryod-btn-outline" title="Download .ryod.json blueprint file">💾 Save .json</button>
                        <label for="ryod-file-import" class="ryod-btn-outline" style="cursor:pointer; margin:0;" title="Load a .ryod.json blueprint file">📂 Load .json</label>
                        <input type="file" id="ryod-file-import" accept=".json,.ryod.json" style="display:none;">
                        <button type="button" id="btn-ryod-copy-link" class="ryod-btn-outline" title="Copy shareable URL permalink">🔗 Share Link</button>
                        <span id="ryod-saved-shelf" style="display:inline-flex; gap:4px; align-items:center;"></span>
                        <span id="ryod-status-msg" style="font-size:0.72rem; color:#f5d77f;"></span>
                    </div>
                    <div class="ryod-btn-row">
                        <button type="button" id="btn-ryod-launch" class="ryod-btn-primary">⚔️ Delve Now</button>
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

        const d20Quality = _diceState.d20Roll === 20 ? 'NAT 20! ★ (Relic Boon + Blessing)' : (_diceState.d20Roll >= 15 ? 'Boon! (+45 Au & Map)' : (_diceState.d20Roll === 1 ? 'NAT 1! 💀 (Shade Hunt + 2× Score)' : (_diceState.d20Roll <= 7 ? 'Hardscrabble (Rations)' : 'Adventurer (+15 Au)')));
        setTxt('ryod-d20-display', `🎲 d20: ${_diceState.d20Roll} ${d20Quality}`);

        const titleIn = document.getElementById('ryod-custom-title');
        if (titleIn && document.activeElement !== titleIn) titleIn.value = _diceState.customTitle || '';
        const nemIn = document.getElementById('ryod-custom-nemesis');
        if (nemIn && document.activeElement !== nemIn) nemIn.value = _diceState.customNemesisName || '';

        _modalEl.querySelectorAll('.ryod-preset-pill').forEach(btn => {
            const pid = btn.getAttribute('data-preset-id');
            const p = STAKES_PRESETS.find(x => x.id === pid);
            const active = p && _diceState.goalDepth === p.goalDepth && _diceState.progressionMode === p.progressionMode && _diceState.difficulty === p.difficulty && Boolean(_diceState.beatitude) === Boolean(p.beatitude);
            btn.classList.toggle('active', Boolean(active));
        });

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

        const mutLabelMap = {};
        (lists.mutators || []).forEach(m => {
            if (m && m.id) mutLabelMap[m.id] = String(m.label || m.id).replace(/\s*\([^)]*\)/g, '').trim();
        });
        const activeMuts = Array.isArray(_diceState.mutators) ? _diceState.mutators : [];
        const twistSummary = activeMuts.length > 0
            ? activeMuts.map(id => mutLabelMap[id] || id).join(' + ')
            : (mutSpec.label ? String(mutSpec.label).split('(')[0].trim() : 'Balanced');

        // Zone 1: Highlight active Arcade Adventure if matching
        _modalEl.querySelectorAll('.ryod-adv-card').forEach(card => {
            const advId = card.getAttribute('data-arcade-adv');
            card.classList.toggle('active', Boolean(_activeArcadeAdvId && advId === _activeArcadeAdvId));
        });

        // Zone 2: Sync 3-Pick Toybox pills & twist cap counter
        const curBiomeId = (lists.biomes[_diceState.biomeIdx] || {}).id;
        _modalEl.querySelectorAll('[data-pick-biome]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-pick-biome') === curBiomeId);
        });
        const curHeroId = (lists.heroes[_diceState.heroIdx] || {}).id;
        _modalEl.querySelectorAll('[data-pick-hero]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-pick-hero') === curHeroId);
        });
        _modalEl.querySelectorAll('[data-toggle-mutator]').forEach(btn => {
            btn.classList.toggle('active', activeMuts.includes(btn.getAttribute('data-toggle-mutator')));
        });
        setTxt('ryod-twist-count', `(${activeMuts.length}/3)`);

        setTxt('ryod-preview-title', `${bp.title} (${bp.hasTown ? 'Town + ' : ''}${bp.goalDepth}F • ${hero.roleName || hero.id} • ${twistSummary})`);
        setTxt('ryod-preview-hash', `${bp.ryodHash} • Seed #${bp.seed}`);
        setTxt('ryod-preview-premise', bp.elderRumor || bp.subtitle || '');
        setTxt('btn-ryod-launch', `⚔️ Delve Into ${String(bp.title || 'Custom Realm').slice(0, 32)} • ${bp.goalDepth || 15}F`);

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

    function launchRyodAdventure(bp, instantRandom = true) {
        const activeBp = applyBlueprintToRuntime(bp || _currentBlueprint || initDefaultBlueprint());
        close();
        const heroSlug = String((activeBp && activeBp.heroOrigin) || 'Hero').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'Hero';
        const hashSuffix = String((activeBp && activeBp.ryodHash) || 'RYOD').replace(/^RYOD[-_]/i, '').slice(0, 4);
        const randTag = Math.floor(100 + Math.random() * 900);
        const slotName = `${heroSlug}_${hashSuffix}_${randTag}`;
        persistBlueprintToServer(activeBp, slotName).catch(() => {});
        if (typeof window !== 'undefined' && window.__app && typeof window.__app.startNewRyodGame === 'function') {
            window.__app.startNewRyodGame(slotName, activeBp, instantRandom);
        }
    }

    function bindModalEvents(overlay) {
        const blitzBtn = overlay.querySelector('#btn-ryod-daily-blitz');
        if (blitzBtn) {
            blitzBtn.addEventListener('click', () => launchDailyBlitz());
        }

        overlay.querySelectorAll('[data-arcade-adv]').forEach(card => {
            const triggerAdv = (e) => {
                const advId = card.getAttribute('data-arcade-adv');
                if (advId) applyArcadeAdventure(advId, !(e && e.altKey));
            };
            card.addEventListener('click', triggerAdv);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerAdv(e);
                }
            });
        });

        overlay.querySelectorAll('[data-pick-biome]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-pick-idx'));
                if (!Number.isNaN(idx) && idx >= 0) {
                    _activeArcadeAdvId = null;
                    _diceState.biomeIdx = idx;
                    playDiceSfx();
                    recompileFromDice();
                }
            });
        });

        overlay.querySelectorAll('[data-pick-hero]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-pick-idx'));
                if (!Number.isNaN(idx) && idx >= 0) {
                    _activeArcadeAdvId = null;
                    _diceState.heroIdx = idx;
                    playDiceSfx();
                    recompileFromDice();
                }
            });
        });

        overlay.querySelectorAll('[data-toggle-mutator]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mutId = btn.getAttribute('data-toggle-mutator');
                if (!mutId) return;
                _activeArcadeAdvId = null;
                const cur = Array.isArray(_diceState.mutators) ? _diceState.mutators.slice() : [];
                const existingIdx = cur.indexOf(mutId);
                if (existingIdx >= 0) {
                    cur.splice(existingIdx, 1);
                } else {
                    if (cur.length >= 3) {
                        setStatus('⚠️ Max 3 Wild Twists can be stacked at once (clear or untoggle one first).');
                        return;
                    }
                    cur.push(mutId);
                    if (mutId === 'boss_rush' && _diceState.goalDepth === 15) {
                        _diceState.goalDepth = 8;
                    }
                }
                _diceState.mutators = cur;
                const lists = getLists();
                const primId = cur[0] || 'balanced';
                const mIdx = lists.mutators.findIndex(m => m.id === primId);
                if (mIdx >= 0) _diceState.mutatorIdx = mIdx;
                playDiceSfx();
                recompileFromDice();
            });
        });

        const clearMutBtn = overlay.querySelector('#btn-ryod-clear-mutators');
        if (clearMutBtn) {
            clearMutBtn.addEventListener('click', () => {
                _activeArcadeAdvId = null;
                _diceState.mutators = [];
                const lists = getLists();
                const balIdx = lists.mutators.findIndex(m => m.id === 'balanced');
                if (balIdx >= 0) _diceState.mutatorIdx = balIdx;
                playDiceSfx();
                recompileFromDice();
                setStatus('Cleared active Wild Twists.');
            });
        }

        overlay.querySelectorAll('[data-masterwork]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeArcadeAdvId = null;
                const presetId = btn.getAttribute('data-masterwork');
                applyMasterworkPreset(presetId);
                overlay.querySelectorAll('[data-masterwork]').forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        overlay.querySelectorAll('.ryod-preset-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const presetId = btn.getAttribute('data-preset-id');
                const p = STAKES_PRESETS.find(x => x.id === presetId);
                if (p) {
                    _diceState.goalDepth = p.goalDepth;
                    _diceState.progressionMode = p.progressionMode;
                    _diceState.difficulty = p.difficulty;
                    _diceState.beatitude = p.beatitude;
                    _diceState.captiveAllies = p.captiveAllies;
                    if (p.godMode) {
                        const lists = getLists();
                        const gIdx = lists.mutators.findIndex(m => m.id === 'god_sandbox');
                        if (gIdx >= 0) _diceState.mutatorIdx = gIdx;
                    }
                    playDiceSfx();
                    recompileFromDice();
                    setStatus(`Stakes preset: ${p.label}`);
                }
            });
        });

        const titleIn = overlay.querySelector('#ryod-custom-title');
        if (titleIn) {
            titleIn.addEventListener('input', () => {
                _diceState.customTitle = titleIn.value.trim();
                recompileFromDice();
            });
        }

        const nemIn = overlay.querySelector('#ryod-custom-nemesis');
        if (nemIn) {
            nemIn.addEventListener('input', () => {
                _diceState.customNemesisName = nemIn.value.trim();
                recompileFromDice();
            });
        }

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
                _activeArcadeAdvId = null;
                if (slot === 'biome') _diceState.biomeIdx = val;
                else if (slot === 'bestiary') _diceState.bestiaryIdx = val;
                else if (slot === 'story') _diceState.storyIdx = val;
                else if (slot === 'hero') _diceState.heroIdx = val;
                else if (slot === 'discipline') _diceState.disciplineIdx = val;
                else if (slot === 'mutator') {
                    _diceState.mutatorIdx = val;
                    const lists = getLists();
                    const chosenMut = lists.mutators[val];
                    _diceState.mutators = chosenMut && chosenMut.id !== 'balanced' ? [chosenMut.id] : [];
                }
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
                const depths = [8, 10, 15, 25];
                const curIdx = depths.indexOf(_diceState.goalDepth);
                _diceState.goalDepth = depths[(curIdx >= 0 ? curIdx + 1 : 0) % depths.length];
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
        const promptInput = overlay.querySelector('#ryod-architect-prompt');
        if (promptInput && weaveBtn) {
            promptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    weaveBtn.click();
                }
            });
        }
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
                    _hasImportedBlueprint = true;
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

    function applyArcadeAdventure(advId, autoLaunch = false) {
        const compiler = getCompiler();
        if (!compiler || !Array.isArray(compiler.ARCADE_ADVENTURES)) return null;
        const preset = compiler.ARCADE_ADVENTURES.find(a => a.id === advId);
        if (!preset) return null;
        const cfg = { ...preset, customTitle: preset.customTitle || preset.title };
        const bp = compiler.normalizeConfig(cfg);
        _activeArcadeAdvId = advId;
        _hasImportedBlueprint = true;
        syncDiceStateFromBlueprint(bp);
        applyBlueprintToRuntime(bp);
        renderDiceUI();
        setStatus(`⚡ Loaded "${bp.title}"!`);
        if (autoLaunch) launchRyodAdventure(bp, true);
        return bp;
    }

    function launchDailyBlitz(dateStr) {
        const compiler = getCompiler();
        if (!compiler || typeof compiler.rollDailyBlitzBlueprint !== 'function') return null;
        const bp = compiler.rollDailyBlitzBlueprint(dateStr);
        _activeArcadeAdvId = null;
        _hasImportedBlueprint = true;
        syncDiceStateFromBlueprint(bp);
        applyBlueprintToRuntime(bp);
        renderDiceUI();
        setStatus(`📅 Daily Blitz Ready: "${bp.title}"!`);
        launchRyodAdventure(bp, true);
        return bp;
    }

    function applyMasterworkPreset(presetId) {
        const compiler = getCompiler();
        if (!compiler || !compiler.MASTERWORK_PRESETS) return null;
        const preset = compiler.MASTERWORK_PRESETS.find(p => p.id === presetId);
        if (!preset) return null;
        const bp = compiler.normalizeConfig(preset);
        _activeArcadeAdvId = null;
        _hasImportedBlueprint = true;
        syncDiceStateFromBlueprint(bp);
        applyBlueprintToRuntime(bp);
        renderDiceUI();
        setStatus(`✨ Preset Loaded: "${bp.title}"!`);
        return bp;
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

    function open(opts = {}) {
        const modal = buildModalDOM();
        if (!modal) return;
        if (opts.forceReroll || !_currentBlueprint) {
            rollAllUnlockedDice();
        } else {
            renderDiceUI();
        }
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
        getCurrentBlueprint: () => _currentBlueprint || initDefaultBlueprint(),
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
        quickRandomizeAndLaunch,
        applyArcadeAdventure,
        launchDailyBlitz,
        applyMasterworkPreset,
        MASTERWORK_PRESETS: (getCompiler() && getCompiler().MASTERWORK_PRESETS) || [],
        ARCADE_ADVENTURES: (getCompiler() && getCompiler().ARCADE_ADVENTURES) || []
    };
});

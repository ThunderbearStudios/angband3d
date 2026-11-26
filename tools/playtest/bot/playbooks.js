'use strict';

/**
 * 10-target realm playbooks for Session A (pure legit crawl + menus + save/reload + death)
 * and Session B (deep biomes / endgame / victory).
 */
const PLAYBOOKS = Object.freeze({
    angband: {
        targetId: 'angband',
        realm: 'angband',
        lang: 'en',
        tier: 1,
        supportsBrowserLocal: true,
        goalDepth: 100,
        sessionATurns: 220,
        sessionBTurns: 80,
        cdpTurns: 45,
        forbiddenChronicleTerms: ['Orb of Zot', 'Amulet of Yendor', 'Gehennom', 'Beleriand', 'Silmaril', 'Lumenstone'],
        milestonesA: ['info_screens', 'store_visit', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['wizard_deep_biome', 'wizard_endgame_probe']
    },
    silq: {
        targetId: 'silq',
        realm: 'silq',
        lang: 'en',
        tier: 1,
        supportsBrowserLocal: false,
        goalDepth: 20,
        sessionATurns: 220,
        sessionBTurns: 80,
        cdpTurns: 45,
        forbiddenChronicleTerms: ['Orb of Zot', 'Amulet of Yendor', 'Gehennom', 'Zot', 'Lumenstone', 'Morgoth\'s Town'],
        milestonesA: ['info_screens', 'silq_stealth_song_abilities', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['wizard_deep_biome', 'wizard_endgame_probe']
    },
    frogcomposband: {
        targetId: 'frogcomposband',
        realm: 'frogcomposband',
        lang: 'en',
        tier: 1,
        supportsBrowserLocal: false,
        goalDepth: 127,
        sessionATurns: 200,
        sessionBTurns: 80,
        cdpTurns: 40,
        forbiddenChronicleTerms: ['Orb of Zot', 'Silmaril', 'Gehennom', 'Lumenstone'],
        milestonesA: ['info_screens', 'store_visit', 'powers_or_popup_menu', 'descend_dungeon', 'save_reload', 'natural_death'],
        milestonesB: ['wizard_deep_biome', 'wizard_endgame_probe']
    },
    hengband: {
        targetId: 'hengband',
        realm: 'hengband',
        lang: 'en',
        tier: 1,
        supportsBrowserLocal: false,
        goalDepth: 100,
        sessionATurns: 200,
        sessionBTurns: 80,
        cdpTurns: 40,
        forbiddenChronicleTerms: ['Orb of Zot', 'Silmaril', 'Gehennom', 'Lumenstone'],
        milestonesA: ['info_screens', 'store_visit', 'powers_or_popup_menu', 'descend_dungeon', 'save_reload', 'natural_death'],
        milestonesB: ['wizard_deep_biome', 'wizard_endgame_probe']
    },
    hengband_jp: {
        targetId: 'hengband_jp',
        realm: 'hengband',
        lang: 'jp',
        tier: 1,
        supportsBrowserLocal: false,
        goalDepth: 100,
        sessionATurns: 160,
        sessionBTurns: 60,
        cdpTurns: 35,
        forbiddenChronicleTerms: ['Orb of Zot', 'Silmaril', 'Gehennom', 'Lumenstone'],
        milestonesA: ['info_screens', 'store_visit', 'sjis_zero_mojibake', 'descend_dungeon', 'save_reload', 'natural_death'],
        milestonesB: ['wizard_deep_biome']
    },
    nethack: {
        targetId: 'nethack',
        realm: 'nethack',
        lang: 'en',
        tier: 2,
        supportsBrowserLocal: true,
        goalDepth: 20,
        sessionATurns: 300,
        sessionBTurns: 1400,
        cdpTurns: 45,
        forbiddenChronicleTerms: ['Morgoth', 'Thangorodrim', 'Orb of Zot', 'Silmaril', 'Lumenstone'],
        milestonesA: ['info_screens', 'nethack_pray_elbereth_equip', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['legit_endgame_descent', 'goal_victory_or_checkpoint']
    },
    dcss: {
        targetId: 'dcss',
        realm: 'dcss',
        lang: 'en',
        tier: 2,
        supportsBrowserLocal: true,
        goalDepth: 15,
        sessionATurns: 300,
        sessionBTurns: 1400,
        cdpTurns: 45,
        forbiddenChronicleTerms: ['Morgoth', 'Thangorodrim', 'Amulet of Yendor', 'Gehennom', 'Silmaril', 'Lumenstone'],
        milestonesA: ['info_screens', 'dcss_autoexplore_skills_god', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['legit_endgame_descent', 'goal_victory_or_checkpoint']
    },
    brogue: {
        targetId: 'brogue',
        realm: 'brogue',
        lang: 'en',
        tier: 2,
        supportsBrowserLocal: true,
        goalDepth: 26,
        sessionATurns: 300,
        sessionBTurns: 1500,
        cdpTurns: 45,
        forbiddenChronicleTerms: ['Morgoth', 'Thangorodrim', 'Orb of Zot', 'Gehennom', 'Silmaril'],
        milestonesA: ['info_screens', 'brogue_zero_xp', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['legit_endgame_descent', 'goal_victory_or_checkpoint']
    },
    rogue: {
        targetId: 'rogue',
        realm: 'rogue',
        lang: 'en',
        tier: 2,
        supportsBrowserLocal: true,
        goalDepth: 26,
        sessionATurns: 300,
        sessionBTurns: 1500,
        cdpTurns: 45,
        forbiddenChronicleTerms: ['Morgoth', 'Thangorodrim', 'Orb of Zot', 'Gehennom', 'Silmaril', 'Lumenstone'],
        milestonesA: ['info_screens', 'rogue_descending_ac_amulet_gate', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['legit_endgame_descent', 'goal_victory_or_checkpoint']
    },
    ryod: {
        targetId: 'ryod',
        realm: 'ryod',
        lang: 'en',
        tier: 2,
        supportsBrowserLocal: true,
        goalDepth: 15,
        sessionATurns: 260,
        sessionBTurns: 1200,
        cdpTurns: 45,
        forbiddenChronicleTerms: [],
        milestonesA: ['info_screens', 'ryod_blueprint_powers', 'descend_dungeon', 'combat_or_explore', 'save_reload', 'natural_death'],
        milestonesB: ['legit_endgame_descent', 'goal_victory_or_checkpoint']
    }
});

const ALL_TARGETS = Object.freeze(Object.keys(PLAYBOOKS));
const LOCAL_WORKER_REALMS = Object.freeze(['angband', 'ryod', 'nethack', 'dcss', 'brogue', 'rogue']);

function resolveTargets(arg) {
    if (!arg || arg === 'all') return ALL_TARGETS.slice();
    return String(arg)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((id) => Boolean(PLAYBOOKS[id]));
}

module.exports = {
    PLAYBOOKS,
    ALL_TARGETS,
    LOCAL_WORKER_REALMS,
    resolveTargets
};

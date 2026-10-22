/**
 * realm-keys.js — Single source of truth for realm-specific command keys and realm text.
 *
 * WS6.2 (language_gui_platform_spec.md §6.2).
 * Every non-null value is backed by real engine probe output in tools/fixtures/realm_keys/<realm>.json.
 * UMD: browser -> window.RealmKeys; Node -> module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RealmKeys = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Canonical keymaps for all four supported variants.
    // Probed and verified by tools/probe_realm_keys.js.
    const TABLE = Object.freeze({
        cast: Object.freeze({ angband: 'm', silq: 's', frogcomposband: 'm', hengband: 'm' }),
        throw: Object.freeze({ angband: 'v', silq: 't', frogcomposband: 'v', hengband: 'v' }),
        fire: Object.freeze({ angband: 'f', silq: 'f', frogcomposband: 'f', hengband: 'f' }),
        quaff: Object.freeze({ angband: 'q', silq: 'q', frogcomposband: 'q', hengband: 'q' }),
        read: Object.freeze({ angband: 'r', silq: null, frogcomposband: 'r', hengband: 'r' }),
        rest: Object.freeze({ angband: 'R', silq: '%', frogcomposband: 'R', hengband: 'R' }),
        open: Object.freeze({ angband: 'o', silq: 'o', frogcomposband: 'o', hengband: 'o' }),
        pickup: Object.freeze({ angband: 'g', silq: 'g', frogcomposband: 'g', hengband: 'g' }),
        inven: Object.freeze({ angband: 'i', silq: 'i', frogcomposband: 'i', hengband: 'i' }),
        equip: Object.freeze({ angband: 'e', silq: 'e', frogcomposband: 'e', hengband: 'e' }),
        use: Object.freeze({ angband: 'U', silq: 'u', frogcomposband: null, hengband: null }),
        use_staff: Object.freeze({ angband: 'u', silq: 'a', frogcomposband: 'u', hengband: 'u' }),
        hold: Object.freeze({ angband: ',', silq: 'z', frogcomposband: ',', hengband: ',' }),
        browse: Object.freeze({ angband: 'b', silq: null, frogcomposband: 'b', hengband: 'b' }),
        study: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: 'G' }),
        power: Object.freeze({ angband: null, silq: null, frogcomposband: 'U', hengband: 'U' }),
        skills: Object.freeze({ angband: null, silq: 'tab', frogcomposband: null, hengband: null }),
        quests: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null }),
        overland: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null }),
        search: Object.freeze({ angband: null, silq: null, frogcomposband: 'S', hengband: 'S' }),
        steal: Object.freeze({ angband: 's', silq: null, frogcomposband: null, hengband: null }),
        search_mode: Object.freeze({ angband: null, silq: 'S', frogcomposband: 'S', hengband: 'S' }),
        takeoff: Object.freeze({ angband: 't', silq: 'r', frogcomposband: 't', hengband: 't' }),
        examine: Object.freeze({ angband: 'I', silq: 'x', frogcomposband: 'I', hengband: 'I' }),
        char_sheet: Object.freeze({ angband: 'C', silq: '@', frogcomposband: 'C', hengband: 'C' }),
        options: Object.freeze({ angband: '=', silq: 'O', frogcomposband: '=', hengband: '=' })
    });

    const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];
    const REALM_KEYS = Object.freeze(
        REALMS.reduce((acc, r) => {
            acc[r] = {};
            for (const [verb, map] of Object.entries(TABLE)) {
                acc[r][verb] = (map[r] !== undefined) ? map[r] : null;
            }
            Object.freeze(acc[r]);
            return acc;
        }, {})
    );

    const REALM_TEXT = Object.freeze({
        angband: Object.freeze({ town: 'the Town', depthUnit: 'ft', feetPerLevel: 50 }),
        silq: Object.freeze({ town: null, depthUnit: 'ft', feetPerLevel: 50 }),
        frogcomposband: Object.freeze({ town: 'the Outpost', depthUnit: 'ft', feetPerLevel: 50 }),
        hengband: Object.freeze({ town: 'the Outpost', depthUnit: 'ft', feetPerLevel: 50 })
    });

    let currentActiveRealm = 'angband';

    function getActiveRealm() {
        if (typeof window !== 'undefined' && window.__activeRealm) {
            return window.__activeRealm;
        }
        return currentActiveRealm;
    }

    function setActiveRealm(realm) {
        if (realm && REALM_KEYS[realm]) {
            currentActiveRealm = realm;
            if (typeof window !== 'undefined') {
                window.__activeRealm = realm;
            }
        }
    }

    /**
     * Look up the command key for a verb in a realm.
     * @param {string} verb - e.g. 'cast', 'throw', 'rest'
     * @param {string} [realm] - Defaults to active realm
     * @returns {string|null} Key character/spec, or null if verb doesn't exist
     */
    function realmKey(verb, realm) {
        const r = realm || getActiveRealm();
        const map = REALM_KEYS[r];
        if (!map) return null;
        return map[verb] !== undefined ? map[verb] : null;
    }

    /**
     * Map a Vanilla Angband key to the corresponding key in the given realm.
     * Only applied when at top-level command prompt in play.
     * @param {string} vanillaKey
     * @param {string} [realm]
     * @returns {string|null}
     */
    function fromVanilla(vanillaKey, realm) {
        const r = realm || getActiveRealm();
        if (r === 'angband') return vanillaKey;
        const angMap = REALM_KEYS.angband;
        const targetMap = REALM_KEYS[r];
        if (!targetMap) return vanillaKey;

        for (const verb of Object.keys(angMap)) {
            if (angMap[verb] === vanillaKey) {
                return targetMap[verb];
            }
        }
        return vanillaKey;
    }

    const BUTTON_CONFIG = [
        { id: 'btn-attack', verb: 'attack', defaultTitle: 'Attack adjacent monster in front',
          labels: { hengband_jp: '⚔ 攻撃', default: '⚔ Attack' }, defaultKey: 'Space' },
        { id: 'btn-throw', verb: 'throw', defaultTitle: 'Throw item at target',
          labels: { silq: '🎯 Throw', hengband_jp: '🎯 投げる', default: '🎯 Throw' } },
        { id: 'btn-fire', verb: 'fire', defaultTitle: 'Shoot ranged weapon from quiver',
          labels: { hengband_jp: '🏹 射撃', default: '🏹 Shoot' } },
        { id: 'btn-cast', verb: 'cast', defaultTitle: 'Cast spell or prayer',
          labels: { silq: '🎵 Song', hengband_jp: '✨ 詠唱', default: '✨ Cast' } },
        { id: 'btn-skills', verb: 'skills', defaultTitle: 'Learn Ability & Skill Tree',
          labels: { silq: '🌳 Skills', default: '📜 Skills' } },
        { id: 'btn-power', verb: 'power', defaultTitle: 'Use Racial/Class Power or Mutation',
          labels: { hengband_jp: '🔮 特殊能力', default: '🔮 Power' } },
        { id: 'btn-overland', verb: 'overland', defaultTitle: 'Overland Wilderness Map',
          labels: { hengband_jp: '🗺️ 広域', default: '🗺️ Map' } },
        { id: 'btn-quests', verb: 'quests', defaultTitle: 'Active Quests & Monster Bounties',
          labels: { hengband_jp: '📜 任務', default: '📜 Quests' } },
        { id: 'btn-browse', verb: 'browse', defaultTitle: 'Browse Spellbook',
          labels: { hengband_jp: '📖 閲覧', default: '📖 Browse' } },
        { id: 'btn-study', verb: 'study', defaultTitle: 'Study New Spells',
          labels: { hengband_jp: '✨ 学習', default: '✨ Study' } },
        { id: 'btn-quaff', verb: 'quaff', defaultTitle: 'Drink / quaff potion',
          labels: { silq: '🧪 Draught', hengband_jp: '🧪 薬', default: '🧪 Potion' } },
        { id: 'btn-read', verb: 'read', defaultTitle: 'Read magical scroll',
          labels: { hengband_jp: '📜 巻物', default: '📜 Scroll' } },
        { id: 'btn-door', verb: 'open', defaultTitle: 'Open closed door or chest in front',
          labels: { hengband_jp: '🚪 扉', default: '🚪 Door' } },
        { id: 'btn-pickup', verb: 'pickup', defaultTitle: 'Pick up item from dungeon floor',
          labels: { hengband_jp: '💎 拾う', default: '💎 Get' } },
        { id: 'btn-rest', verb: 'rest', defaultTitle: 'Rest until fully healed',
          labels: { silq: '⏳ Rest', hengband_jp: '⏳ 休憩', default: '⏳ Rest' } },
        { id: 'btn-inventory', verb: 'inven', defaultTitle: 'Open inventory pack',
          labels: { hengband_jp: '🎒 持ち物', default: '🎒 Pack' } },
        { id: 'btn-equipment', verb: 'equip', defaultTitle: 'Inspect worn equipment',
          labels: { hengband_jp: '🛡 装備', default: '🛡 Gear' } },
        { id: 'btn-terminal', verb: 'terminal', defaultTitle: 'Toggle 80x24 classic CRT terminal view',
          labels: { hengband_jp: '📜 端末', default: '📜 Classic' }, defaultKey: 'Tab' },
        { id: 'btn-guide-hud', verb: 'help', defaultTitle: 'View Complete Controls & Commands Guide',
          labels: { hengband_jp: '❓ ヘルプ', default: '❓ Help' }, defaultKey: '?' }
    ];

    /**
     * Apply realm-specific keys, tooltips, and visibility to action bar buttons in DOM.
     * @param {Document} doc
     * @param {string} [realm]
     * @param {string} [lang]
     */
    function applyLabels(doc, realm, lang) {
        if (!doc || typeof doc.getElementById !== 'function') return;
        const r = realm || getActiveRealm();
        const effLang = lang || (typeof window !== 'undefined' ? (window.__langMode || 'en') : 'en');

        for (const cfg of BUTTON_CONFIG) {
            const btn = doc.getElementById(cfg.id);
            if (!btn) continue;

            const key = cfg.defaultKey ? cfg.defaultKey : realmKey(cfg.verb, r);
            if (key === null) {
                btn.hidden = true;
                if (btn.dataset) btn.dataset.realmHidden = '1';
                if (btn.style) btn.style.display = 'none';
            } else {
                btn.hidden = false;
                if (btn.dataset) delete btn.dataset.realmHidden;
                if (btn.style) {
                    btn.style.display = (btn.dataset && btn.dataset.contextHidden === '1') ? 'none' : '';
                }
                const displayKey = (key === 'tab') ? 'Tab' : key;

                const isJp = (r === 'hengband') && (effLang === 'jp');
                const labelText = (isJp && cfg.labels && cfg.labels.hengband_jp)
                    ? cfg.labels.hengband_jp
                    : ((cfg.labels && cfg.labels[r]) ? cfg.labels[r] : (cfg.labels ? cfg.labels.default : ''));

                if (labelText) {
                    btn.innerHTML = `${labelText} <kbd>${displayKey}</kbd>`;
                }
                const kbd = btn.querySelector ? btn.querySelector('kbd') : null;
                if (kbd) {
                    kbd.textContent = displayKey;
                }
                btn.title = `${cfg.defaultTitle} [${displayKey}]`;
            }
        }
    }

    return Object.freeze({
        TABLE,
        REALM_KEYS,
        REALM_TEXT,
        realmKey,
        key: realmKey, // alias
        fromVanilla,
        applyLabels,
        getActiveRealm,
        setActiveRealm
    });
});

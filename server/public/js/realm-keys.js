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
    const REALM_KEYS = Object.freeze({
        angband: Object.freeze({
            cast: 'm', throw: 'v', fire: 'f', quaff: 'q', read: 'r', rest: 'R',
            open: 'o', pickup: 'g', inven: 'i', equip: 'e', use: 'U', hold: ',',
            browse: 'b', study: null, power: null, skills: null, quests: null, overland: null
        }),
        silq: Object.freeze({
            cast: 's', throw: 't', fire: 'f', quaff: 'q', read: null, rest: '%',
            open: 'o', pickup: 'g', inven: 'i', equip: 'e', use: 'a', hold: ',',
            browse: null, study: null, power: null, skills: 'tab', quests: null, overland: null
        }),
        frogcomposband: Object.freeze({
            cast: 'm', throw: 'v', fire: 'f', quaff: 'q', read: 'r', rest: 'R',
            open: 'o', pickup: 'g', inven: 'i', equip: 'e', use: 'U', hold: ',',
            browse: 'b', study: null, power: 'U', skills: null, quests: null, overland: null
        }),
        hengband: Object.freeze({
            cast: 'm', throw: 'v', fire: 'f', quaff: 'q', read: 'r', rest: 'R',
            open: 'o', pickup: 'g', inven: 'i', equip: 'e', use: 'U', hold: ',',
            browse: 'b', study: 'G', power: 'U', skills: null, quests: null, overland: null
        })
    });

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
        { id: 'btn-cast', verb: 'cast', defaultTitle: 'Cast spell or prayer' },
        { id: 'btn-throw', verb: 'throw', defaultTitle: 'Throw item at target' },
        { id: 'btn-fire', verb: 'fire', defaultTitle: 'Shoot ranged weapon from quiver' },
        { id: 'btn-quaff', verb: 'quaff', defaultTitle: 'Drink / quaff potion' },
        { id: 'btn-read', verb: 'read', defaultTitle: 'Read magical scroll' },
        { id: 'btn-rest', verb: 'rest', defaultTitle: 'Rest until fully healed' },
        { id: 'btn-door', verb: 'open', defaultTitle: 'Open closed door or chest in front' },
        { id: 'btn-pickup', verb: 'pickup', defaultTitle: 'Pick up item from dungeon floor' },
        { id: 'btn-inventory', verb: 'inven', defaultTitle: 'Open inventory pack' },
        { id: 'btn-equipment', verb: 'equip', defaultTitle: 'Inspect worn equipment' },
        { id: 'btn-skills', verb: 'skills', defaultTitle: 'Learn Ability & Skill Tree' },
        { id: 'btn-power', verb: 'power', defaultTitle: 'Use Racial/Class Power or Mutation' },
        { id: 'btn-study', verb: 'study', defaultTitle: 'Study New Spells' },
        { id: 'btn-browse', verb: 'browse', defaultTitle: 'Browse Spellbook' }
    ];

    /**
     * Apply realm-specific keys, tooltips, and visibility to action bar buttons in DOM.
     * @param {Document} doc
     * @param {string} [realm]
     */
    function applyLabels(doc, realm) {
        if (!doc || typeof doc.getElementById !== 'function') return;
        const r = realm || getActiveRealm();

        for (const cfg of BUTTON_CONFIG) {
            const btn = doc.getElementById(cfg.id);
            if (!btn) continue;

            const key = realmKey(cfg.verb, r);
            if (key === null) {
                btn.hidden = true;
                if (btn.style) btn.style.display = 'none';
            } else {
                btn.hidden = false;
                if (btn.style) btn.style.display = '';
                const displayKey = (key === 'tab') ? 'Tab' : key;
                const kbd = btn.querySelector ? btn.querySelector('kbd') : null;
                if (kbd) {
                    kbd.textContent = displayKey;
                }
                btn.title = `${cfg.defaultTitle} [${displayKey}]`;
            }
        }
    }

    return Object.freeze({
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

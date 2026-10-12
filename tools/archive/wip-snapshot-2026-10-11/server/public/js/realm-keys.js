(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RealmKeys = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Single source of truth for realm-specific command keys and realm text.
    // Every value must be backed by tools/fixtures/realm_keys/<realm>.json (WS6.1).
    const REALM_KEYS = {
        angband:        { cast:'m', throw:'v', fire:'f', quaff:'q', read:'r', rest:'R', open:'o', pickup:'g', inven:'i', equip:'e', use:'U', hold:',', browse:'b', study:null,  power:null, skills:null, quests:null, overland:null },
        silq:           { cast:'s', throw:'t', fire:'f', quaff:'q', read:null, rest:'%', open:'o', pickup:'g', inven:'i', equip:'e', use:'a', hold:',', browse:null, study:null,  power:null, skills:'tab', quests:null, overland:null },
        frogcomposband: { cast:'m', throw:'v', fire:'f', quaff:'q', read:'r', rest:'R', open:'o', pickup:'g', inven:'i', equip:'e', use:'U', hold:',', browse:'b', study:null,  power:'U', skills:null, quests:null, overland:null },
        hengband:       { cast:'m', throw:'v', fire:'f', quaff:'q', read:'r', rest:'R', open:'o', pickup:'g', inven:'i', equip:'e', use:'U', hold:',', browse:'b', study:'G', power:'U', skills:null, quests:null, overland:null },
    };

    const REALM_TEXT = {
        angband: { town: 'Town', depth: 'ft' },
        silq: { town: 'Gates', depth: 'ft' },
        frogcomposband: { town: 'Wilderness', depth: 'ft' },
        hengband: { town: 'Wilderness', depth: 'ft' }
    };

    function getActiveRealm() {
        if (typeof window !== 'undefined' && window.realm) return window.realm;
        return 'angband'; // Fallback
    }

    function key(verb) {
        const realm = getActiveRealm();
        if (REALM_KEYS[realm] && REALM_KEYS[realm][verb] !== undefined) {
            return REALM_KEYS[realm][verb];
        }
        return null;
    }

    function text(key) {
        const realm = getActiveRealm();
        if (REALM_TEXT[realm] && REALM_TEXT[realm][key] !== undefined) {
            return REALM_TEXT[realm][key];
        }
        return '';
    }

    function fromVanilla(vanillaKey) {
        // Find which verb the vanilla key represents
        let matchedVerb = null;
        for (const [verb, k] of Object.entries(REALM_KEYS.angband)) {
            if (k === vanillaKey) {
                matchedVerb = verb;
                break;
            }
        }
        if (matchedVerb) {
            return key(matchedVerb);
        }
        return vanillaKey; // Pass through if not found
    }

    function applyLabels(doc) {
        const realm = getActiveRealm();
        const keys = REALM_KEYS[realm];
        if (!keys) return;

        // Apply to any element with data-verb
        const elements = doc.querySelectorAll('[data-verb]');
        elements.forEach(el => {
            const verb = el.getAttribute('data-verb');
            const k = keys[verb];
            if (k === null) {
                el.hidden = true;
            } else {
                el.hidden = false;
                const kbd = el.querySelector('kbd');
                if (kbd) kbd.textContent = k;
                
                // Update title to match
                if (el.title) {
                    el.title = el.title.replace(/\[.*\]/, `[${k}]`);
                }
            }
        });
    }

    return {
        key,
        text,
        fromVanilla,
        applyLabels,
        _KEYS: REALM_KEYS, // Exposed for tests
        _TEXT: REALM_TEXT
    };
}));

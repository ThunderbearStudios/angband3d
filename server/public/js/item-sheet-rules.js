/**
 * item-sheet-rules.js — Extended BUC Warnings, Safety Locks (!k/!d/!*),
 * and FCB Dynamic Monster Anatomy Slot Resolution for ItemSheet (Wave 3A).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ItemSheetRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FCB_SLOT_PATTERNS = [
        ['ring', /\bring_[1-6]\b/i],
        ['claw', /\b(?:claw|front_claws?|hind_claws?)\b/i],
        ['tentacle', /\btentacle(?:_\d+)?\b/i],
        ['paw', /\bpaw(?:_\d+)?\b/i],
        ['snout', /\bsnout\b/i],
        ['wings', /\bwings?\b/i],
        ['tail', /\btail(?:_\d+)?\b/i],
        ['saddle', /\bsaddle\b/i],
        ['body', /\bbody_2\b/i],
        ['melee', /\b(?:weapon_2|arm_2)\b/i]
    ];

    function resolveDynamicMonsterSlot(raw, name, realm) {
        const sh = String((raw && (raw.slot_name || raw.slotName || raw.equip_slot || raw.equipped)) || '').trim();
        for (let i = 0; i < FCB_SLOT_PATTERNS.length; i++) {
            const [cat, re] = FCB_SLOT_PATTERNS[i];
            if (re.test(sh)) return { category: cat, rawSlot: sh };
        }
        if (String(realm || '').toLowerCase() === 'frogcomposband' && /\b(?:wings|claw|tentacle|paw|snout|tail|saddle)\b/i.test(sh || String(name || ''))) {
            const s = (sh || String(name || '')).toLowerCase();
            for (const [cat, re] of FCB_SLOT_PATTERNS) {
                if (re.test(s)) return { category: cat, rawSlot: sh || cat };
            }
        }
        return null;
    }

    function parseBucWarning(raw, name, realm) {
        const s = `${String(name || '')} ${String((raw && (raw.inscription || raw.note || raw.beatitude || '')) || '')}`;
        if ((raw && (raw.cursed || raw.beatitude === 'cursed')) || /\bcursed\b|\{cursed\}|sticky curse/i.test(s)) {
            return { buc: 'cursed', label: '☠ Cursed — Cannot remove once worn!', badge: '☠ Cursed' };
        }
        if ((raw && raw.beatitude === 'blessed') || /\bblessed\b|\{blessed\}/i.test(s)) {
            return { buc: 'blessed', label: '✦ Blessed', badge: '✦ Blessed' };
        }
        if ((raw && raw.beatitude === 'uncursed') || /\buncursed\b|\{uncursed\}/i.test(s)) {
            return { buc: 'uncursed', label: '○ Uncursed', badge: '○ Uncursed' };
        }
        void realm;
        return null;
    }

    function detectSafetyLock(raw, name) {
        const s = `${String((raw && (raw.inscription || raw.note || '')) || '')} ${String(name || '')}`;
        if (/!\*/.test(s)) return '!*';
        const tags = [];
        if (/!k/i.test(s)) tags.push('!k');
        if (/!d/i.test(s)) tags.push('!d');
        return tags.join(' ');
    }

    function enrichItemVerbs(raw, validVerbs, realm, isEquipped, name) {
        const r = String(realm || 'angband').toLowerCase();
        const verbs = Array.isArray(validVerbs) ? validVerbs.map(v => Object.assign({}, v)) : [];
        const isSplitEquip = (r === 'nethack' || r === 'dcss' || r === 'rogue' || r === 'ryod');
        const tv = Number(raw && (raw.tval !== undefined ? raw.tval : raw.type)) || 0;
        const low = String(name || (raw && (raw.name || raw.dname)) || '').toLowerCase();
        const isArmor = (tv >= 30 && tv <= 38) || /\b(armor|armour|mail|plate|robe|cloak|shield|helm|helmet|boots|gloves|leather)\b/.test(low);
        const isJewelry = tv === 40 || tv === 45 || /\b(ring|amulet|necklace|pendant)\b/.test(low) && !/\bring\s+mail\b/.test(low);

        if (isSplitEquip) {
            if (!isEquipped && isArmor && !verbs.some(v => v.id === 'wear' || v.key === 'W')) {
                verbs.unshift({ id: 'wear', key: 'W', label: 'Wear', primary: true, disabled: false, reason: '' });
            }
            if (!isEquipped && isJewelry && !verbs.some(v => v.id === 'puton' || v.key === 'P')) {
                verbs.unshift({ id: 'puton', key: 'P', label: 'Put On', primary: true, disabled: false, reason: '' });
            }
            if (isEquipped && isJewelry && !verbs.some(v => v.id === 'remove' || v.key === 'R')) {
                verbs.unshift({ id: 'remove', key: 'R', label: 'Remove', primary: true, disabled: false, reason: '' });
            }
        }

        const safetyTag = detectSafetyLock(raw, name);
        if (safetyTag) {
            for (const v of verbs) {
                const isDestroy = v.id === 'destroy' || v.id === 'ignore' || v.key === 'k';
                const isDrop = v.id === 'drop' || v.key === 'd';
                if (safetyTag === '!*' || (isDestroy && safetyTag.includes('!k')) || (isDrop && safetyTag.includes('!d'))) {
                    v.disabled = true;
                    v.safetyLocked = true;
                    v.safetyTag = safetyTag;
                    v.reason = `Locked by inscription ${safetyTag}`;
                }
            }
        }
        return verbs;
    }

    return Object.freeze({ resolveDynamicMonsterSlot, parseBucWarning, detectSafetyLock, enrichItemVerbs });
});

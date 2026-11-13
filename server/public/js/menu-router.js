(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        factory(exports);
    } else {
        root.MenuRouter = {};
        factory(root.MenuRouter);
    }
}(typeof self !== 'undefined' ? self : this, function (exports) {
    'use strict';

    // =========================================================================
    // Verb Tables for Each Realm (Checked against upstream engine sources)
    // =========================================================================
    // Sil-Q 1.5.0: variants/silq-src/src/dungeon.c (process_command)
    //   w: Wear/wield (L822)
    //   r: Take off (L829)
    //   d: Drop (L836)
    //   k: Destroy (L843)
    //   x: Examine (L888)
    //   a: Activate staff (L1037)
    //   E: Eat food (L1044)
    //   t: Throw (L1065) [verified 't', not 'v']
    //   q: Quaff potion (L1086)
    //   u: Use item (L1093)
    //   [Note: Sil-Q has no scrolls, wands, or rods]
    //
    // Hengband 3.0.1: variants/hengband-src/src/io/input-key-processor.cpp
    //   w: Wear/wield (L211)
    //   t: Take off (L218)
    //   d: Drop (L225)
    //   k: Destroy (L232)
    //   I: Examine (L244)
    //   A: Activate (L496)
    //   E: Eat food (L500)
    //   v: Throw (L512)
    //   a: Aim wand (L516)
    //   z: Zap rod (L520)
    //   q: Quaff potion (L529)
    //   r: Read scroll (L533)
    //   u: Use staff (L537)
    //
    // FrogComposBand: variants/frogcomposband-src/src/dungeon.c
    //   w: Wear/wield (L3574)
    //   t: Take off (L3581)
    //   d: Drop (L3588)
    //   k: Destroy (L3595)
    //   I: Inspect/Examine (L3625)
    //   A: Activate (L4044)
    //   E: Eat food (L4060)
    //   v: Throw (L4081)
    //   a: Aim wand (L4092)
    //   z: Zap rod (L4110)
    //   q: Quaff potion (L4128)
    //   r: Read scroll (L4146)
    //   u: Use staff (L4164)
    // =========================================================================

    const VERBS = {
        silq: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            r: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            s: { icon: '🎵', label: 'Sing Song' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Activate staff', glyphs: '_' },
            t: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            x: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        },
        hengband: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            t: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            b: { icon: '📖', label: 'Browse', glyphs: '?' },
            m: { icon: '✨', label: 'Cast / Pray', glyphs: '?' },
            G: { icon: '📚', label: 'Study', glyphs: '?' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Aim wand', glyphs: '-' },
            z: { icon: '💥', label: 'Zap rod', glyphs: '-' },
            A: { icon: '🔮', label: 'Activate', listOnly: 'equip' },
            v: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            I: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        },
        frogcomposband: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            t: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            b: { icon: '📖', label: 'Browse', glyphs: '?' },
            m: { icon: '✨', label: 'Cast / Pray', glyphs: '?' },
            G: { icon: '📚', label: 'Study', glyphs: '?' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Aim wand', glyphs: '-' },
            z: { icon: '💥', label: 'Zap rod', glyphs: '-' },
            A: { icon: '🔮', label: 'Activate', listOnly: 'equip' },
            v: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            I: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        },
        angband: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            t: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            b: { icon: '📖', label: 'Browse', glyphs: '?' },
            m: { icon: '✨', label: 'Cast / Pray', glyphs: '?' },
            G: { icon: '📚', label: 'Study', glyphs: '?' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Aim wand', glyphs: '-' },
            z: { icon: '💥', label: 'Zap rod', glyphs: '-' },
            A: { icon: '🔮', label: 'Activate', listOnly: 'equip' },
            v: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            I: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        },
        nethack: {
            w: { icon: '⚔', label: 'Wield', glyphs: ')' },
            W: { icon: '🛡', label: 'Wear Armor', glyphs: '[' },
            T: { icon: '🛡', label: 'Take Off', listOnly: 'equip' },
            P: { icon: '💍', label: 'Put On', glyphs: '="' },
            R: { icon: '💍', label: 'Remove', listOnly: 'equip' },
            e: { icon: '🍖', label: 'Eat', glyphs: '%' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            z: { icon: '🪄', label: 'Zap Wand', glyphs: '/' },
            a: { icon: '🔧', label: 'Apply Tool', glyphs: '(' },
            t: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            ':': { icon: '🔍', label: 'Examine' },
            I: { icon: '🔍', label: 'Examine' }
        },
        dcss: {
            w: { icon: '⚔', label: 'Wield', glyphs: ')' },
            W: { icon: '🛡', label: 'Wear Armor', glyphs: '[' },
            T: { icon: '🛡', label: 'Take Off', listOnly: 'equip' },
            P: { icon: '💍', label: 'Put On', glyphs: '="' },
            R: { icon: '💍', label: 'Remove', listOnly: 'equip' },
            e: { icon: '🍖', label: 'Eat', glyphs: '%' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            V: { icon: '🪄', label: 'Evoke', glyphs: '/' },
            z: { icon: '✨', label: 'Cast Spell' },
            f: { icon: '🎯', label: 'Fire / Throw' },
            d: { icon: '📦', label: 'Drop' },
            v: { icon: '🔍', label: 'Examine' }
        },
        brogue: {
            w: { icon: '⚔', label: 'Equip', glyphs: ')[' },
            T: { icon: '🛡', label: 'Remove', listOnly: 'equip' },
            E: { icon: '🍖', label: 'Eat', glyphs: '%' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            a: { icon: '🪄', label: 'Apply / Zap', glyphs: '/' },
            t: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            x: { icon: '🔍', label: 'Examine' }
        },
        rogue: {
            w: { icon: '⚔', label: 'Wield', glyphs: ')' },
            W: { icon: '🛡', label: 'Wear Armor', glyphs: '[' },
            T: { icon: '🛡', label: 'Take Off', listOnly: 'equip' },
            e: { icon: '🍖', label: 'Eat', glyphs: ':' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            z: { icon: '🪄', label: 'Zap Wand/Staff', glyphs: '/' },
            t: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            I: { icon: '🔍', label: 'Examine' }
        },
        ryod: {
            w: { icon: '⚔', label: 'Wield', glyphs: '|/\\}()=["~{[' },
            T: { icon: '🛡', label: 'Take Off', listOnly: 'equip' },
            b: { icon: '📖', label: 'Browse', glyphs: '?' },
            m: { icon: '✨', label: 'Cast / Power', glyphs: '?' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',%' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read scroll', glyphs: '?' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Aim wand', glyphs: '-/' },
            z: { icon: '💥', label: 'Zap rod', glyphs: '-/' },
            A: { icon: '🔮', label: 'Activate', listOnly: 'equip' },
            t: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            i: { icon: '🎒', label: 'Inventory' },
            e: { icon: '🛡', label: 'Equipment' },
            I: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        }
    };

    let pending = null; // { item, itemKey, itemName, suggestedVerb, listKind, step: 'chooser'|'await-prompt', phase: 'choose-verb'|'await-prompt', verb, deadline } | null
    let pendingTimeout = null;
    let customSendKey = null;
    let customToast = null;

    const VERB_FROM_PROMPT = {
        wear: 'w',
        remove: 't',
        drop: 'd',
        throw: 'v',
        fire: 'f',
        quaff: 'q',
        read: 'r',
        examine: 'I',
        destroy: 'k',
        eat: 'E',
        use: 'u',
        aim: 'a',
        zap: 'z',
        activate: 'A',
        inscribe: '{',
        uninscribe: '}',
        refill: 'F',
        cast: 'm',
        browse: 'b',
        study: 'G',
        select: 'select'
    };

    function setSendKey(fn) {
        customSendKey = fn;
    }

    function setToast(fn) {
        customToast = fn;
    }

    function getSendKey() {
        if (typeof customSendKey === 'function') return customSendKey;
        if (typeof window !== 'undefined' && window.__app && window.__app.network && typeof window.__app.network.sendKey === 'function') {
            return (k) => window.__app.network.sendKey(k);
        }
        if (typeof global !== 'undefined' && typeof global.testSendKey === 'function') {
            return global.testSendKey;
        }
        return () => {};
    }

    function getToast() {
        if (typeof customToast === 'function') return customToast;
        if (typeof window !== 'undefined' && window.__app && typeof window.__app.showToast === 'function') {
            return window.__app.showToast;
        }
        if (typeof global !== 'undefined' && typeof global.testToast === 'function') {
            return global.testToast;
        }
        return (msg) => console.log('Toast:', msg);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeLabel(label) {
        if (!label) return '';
        return label
            .replace(/^\d+\s+/, '')            // Strip count prefix e.g. "5 Rations"
            .replace(/^(a|an|the)\s+/i, '')    // Strip English articles
            .replace(/\s+\(.*?\)$/, '')        // Strip trailing parens e.g. "(with 5000 turns...)"
            .toLowerCase()
            .trim();
    }

    function getPending() {
        return pending;
    }

    function clearPending() {
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }
        pending = null;
    }

    function getClassifier(frame, realm) {
        const sc = (typeof window !== 'undefined' && window.ScreenContext) ? window.ScreenContext
                 : (typeof global !== 'undefined' && global.ScreenContext) ? global.ScreenContext : null;
        if (sc && typeof sc.classify === 'function') {
            const decode = (typeof window !== 'undefined' && window.__app && typeof window.__app.decodeHengbandText === 'function')
                ? (s => window.__app.decodeHengbandText(s))
                : null;
            return sc.classify(frame, realm, decode ? { decode } : undefined);
        }
        return { mode: 'unknown', realm: realm || 'angband' };
    }

    function determineSuggestedVerb(item, listKind, realm) {
        if (!item) return null;
        if (realm === undefined && listKind && listKind !== 'inven' && listKind !== 'equip' && listKind !== 'quiver') {
            realm = listKind;
            listKind = 'inven';
        }
        if (listKind === 'equip') {
            const glyph = item.glyph || '';
            const label = (item.label || item.name || '').toLowerCase();
            if ((realm === 'nethack' || realm === 'dcss') && (glyph === '=' || glyph === '"' || /ring|amulet/i.test(label))) {
                return 'R';
            }
            const cat = (typeof ActionCatalog !== 'undefined' ? ActionCatalog : null)
                || (typeof window !== 'undefined' ? window.ActionCatalog : null)
                || (typeof global !== 'undefined' ? global.ActionCatalog : null)
                || (typeof require === 'function' ? (() => { try { return require('./action-catalog.js'); } catch { return null; } })() : null);
            if (cat && typeof cat.keyFor === 'function') {
                const k = cat.keyFor('takeoff', realm);
                if (k) return k;
            }
            const rk = (typeof RealmKeys !== 'undefined' ? RealmKeys : null)
                || (typeof window !== 'undefined' ? window.RealmKeys : null)
                || (typeof global !== 'undefined' ? global.RealmKeys : null)
                || (typeof require === 'function' ? (() => { try { return require('./realm-keys.js'); } catch { return null; } })() : null);
            if (rk && typeof rk.realmKey === 'function') {
                const k = rk.realmKey('takeoff', realm);
                if (k) return k;
            }
            if (realm === 'silq') return 'r';
            if (realm === 'nethack' || realm === 'dcss' || realm === 'brogue' || realm === 'rogue' || realm === 'ryod') return 'T';
            return 't'; // Take off
        }

        const glyph = item.glyph || '';
        const label = (item.label || '').toLowerCase();

        // Books / Tomes / Prayer Books (check before Scrolls since books also use '?' in some variants)
        // Spellbooks / Tomes (must precede generic '?' scroll check)
        if ((glyph === '+' && (realm === 'nethack' || realm === 'dcss')) ||
            label.includes('book') || label.includes('handbook') || label.includes('tome') ||
            label.includes('grimoire') || label.includes('prayer') || label.includes('spellbook') ||
            label.includes('魔法書') || label.includes('教本') || label.includes('経典')) {
            if (realm === 'silq' || realm === 'brogue' || realm === 'rogue') return null;
            if (realm === 'nethack') return 'r';
            if (realm === 'dcss') return 'z';
            return 'b';
        }

        const mir = (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY) || (typeof global !== 'undefined' && global.MASTER_ITEM_REGISTRY) || null;
        if (mir && typeof mir.resolvePrimaryVerb === 'function') {
            return mir.resolvePrimaryVerb(item, realm);
        }

        // Wands / Rods / Staves / Tools (must precede generic wearable glyph check)
        if ((glyph === '/' && (realm === 'nethack' || realm === 'dcss' || realm === 'brogue' || realm === 'rogue')) || glyph === '-' || label.includes('wand') || label.includes('魔法棒')) {
            if (realm === 'silq') return null;
            if (realm === 'dcss') return 'V';
            if (realm === 'brogue') return 'a';
            if (realm === 'nethack' || realm === 'rogue') return 'z';
            return 'a';
        }
        if (label.includes('rod') || label.includes('ロッド')) return realm === 'silq' ? null : (realm === 'dcss' ? 'V' : 'z');
        if ((glyph === '_' && realm !== 'nethack') || label.includes('staff') || label.includes('杖')) {
            if (realm === 'silq' || realm === 'brogue') return 'a';
            if (realm === 'dcss') return 'V';
            if (realm === 'nethack' || realm === 'rogue') return 'z';
            return 'u';
        }
        if (realm === 'nethack' && (glyph === '(' || /\b(lock\s*pick|key|stethoscope|tinning|grease|marker|whistle|bag|sack|lamp|lantern|unicorn\s*horn|blindfold|towel|mirror|bell|candelabrum)\b/.test(label))) {
            return 'a';
        }

        // Wearables (weapons, armor, jewelry, light)
        if ('|/\\}()=["~{['.includes(glyph)) {
            if (glyph === '[' && (realm === 'nethack' || realm === 'dcss' || realm === 'rogue')) return 'W';
            if ((glyph === '=' || glyph === '"') && (realm === 'nethack' || realm === 'dcss' || realm === 'rogue')) return 'P';
            return 'w';
        }
        if (label.includes('armor') || label.includes('armour') || label.includes('mail') ||
            label.includes('cloak') || label.includes('shield') || label.includes('helm') ||
            label.includes('boots') || label.includes('gloves') || label.includes('robe')) {
            return (realm === 'nethack' || realm === 'dcss' || realm === 'rogue') ? 'W' : 'w';
        }
        if (label.includes('ring') || label.includes('amulet')) {
            return (realm === 'nethack' || realm === 'dcss' || realm === 'rogue') ? 'P' : 'w';
        }
        if (label.includes('torch') || label.includes('lantern') || label.includes('sword') ||
            label.includes('bow') || label.includes('dagger') || label.includes('axe') ||
            label.includes('mace') || label.includes('spear') || label.includes('blade')) {
            return 'w';
        }

        // Food
        const eatKey = (realm === 'nethack' || realm === 'dcss' || realm === 'rogue') ? 'e' : 'E';
        if ((glyph === ',' && realm !== 'nethack' && realm !== 'rogue') || glyph === '%' || (glyph === ':' && (realm === 'rogue' || realm === 'brogue'))) return eatKey;
        if (label.includes('food') || label.includes('ration') || label.includes('bread') ||
            label.includes('mushroom') || label.includes('mold') || label.includes('corpse') || label.includes('食料')) {
            return eatKey;
        }

        // Potions
        if (glyph === '!' || label.includes('potion') || label.includes('薬')) return 'q';

        // Scrolls
        if (glyph === '?' || label.includes('scroll') || label.includes('巻物')) return realm === 'silq' ? null : 'r';

        return null;
    }

    function renderChooserHtml(pendingState, realm) {
        if (!pendingState || pendingState.step !== 'chooser' || !pendingState.item) return '';

        const verbsForRealm = VERBS[realm] || VERBS.silq;
        const suggestedVerb = determineSuggestedVerb(pendingState.item, pendingState.listKind, realm);

        let html = `<div class="term-chooser-header" style="width: 100%; display: flex; align-items: center; gap: 6px; padding: 2px 6px; font-weight: bold; color: #ffd700; font-size: 12px;">🎒 ${escapeHtml(pendingState.item.key)}) ${escapeHtml(pendingState.item.label)} — choose action (Enter = suggested, ▲/▼ = change item)</div>`;
        html += `<div class="term-chooser-buttons" style="display: flex; flex-wrap: wrap; gap: 5px; padding: 2px 4px; width: 100%;">`;

        const entries = Object.entries(verbsForRealm);
        
        // Put suggested verb first if present
        if (suggestedVerb && verbsForRealm[suggestedVerb]) {
            const data = verbsForRealm[suggestedVerb];
            if (!data.listOnly || data.listOnly === pendingState.listKind) {
                html += `<button type="button" class="term-ctx-btn is-suggested btn-gold" data-verb="${suggestedVerb}" title="${escapeHtml(data.label)} [${suggestedVerb}]">[${suggestedVerb}] ${data.icon} ${escapeHtml(data.label)}</button>`;
            }
        }

        const isBook = suggestedVerb === 'b';
        const alwaysAllow = new Set(['w', 't', 'A', 'I', 'x', 'd', 'v', 'k']);
        if (isBook) { alwaysAllow.add('b'); alwaysAllow.add('m'); alwaysAllow.add('G'); alwaysAllow.add('r'); }

        for (const [v, data] of entries) {
            if (v === suggestedVerb) continue; // Already rendered first
            if (data.listOnly && data.listOnly !== pendingState.listKind) continue;
            if (suggestedVerb && !alwaysAllow.has(v)) continue;
            html += `<button type="button" class="term-ctx-btn" data-verb="${v}" title="${escapeHtml(data.label)} [${v}]">[${v}] ${data.icon} ${escapeHtml(data.label)}</button>`;
        }

        html += `<button type="button" class="term-ctx-btn" data-key="up" title="Previous Item [↑]">[▲] Prev</button>`;
        html += `<button type="button" class="term-ctx-btn" data-key="down" title="Next Item [↓]">[▼] Next</button>`;
        html += `<button type="button" class="term-ctx-btn" data-verb="Escape" title="Back [Esc]">[Esc] Back</button>`;
        html += `</div>`;
        return html;
    }

    function route(key, frame, realm, optsOrSendKey, maybeOpts) {
        if (!frame || !realm) return false;

        let opts = null;
        if (typeof optsOrSendKey === 'function') {
            opts = maybeOpts || null;
        } else if (optsOrSendKey && typeof optsOrSendKey === 'object') {
            opts = optsOrSendKey;
        }

        const classifier = getClassifier(frame, realm);
        if (!classifier) return false;

        const isEscape = (key === 'Escape' || key === 'escape');

        // Case A: Chooser is currently open
        if (pending && (pending.step === 'chooser' || pending.phase === 'choose-verb')) {
            if (isEscape) {
                clearPending();
                return true; // Handled client-side, do not close the underlying inventory
            }

            if (key === 'Enter' || key === 'enter') {
                const sug = pending.suggestedVerb || determineSuggestedVerb(pending.item, pending.listKind, realm);
                if (sug) chooseVerb(sug);
                else clearPending();
                return true;
            }

            // CMD-P0-04: Check if key is a single lowercase letter matching an existing item row BEFORE checking VERBS
            const items = (classifier.items && Array.isArray(classifier.items)) ? classifier.items : [];
            const itemKeys = items.map(i => i.key);
            if (key.length === 1 && /[a-z]/.test(key) && itemKeys.includes(key)) {
                const row = items.find(i => i.key === key);
                if (row) {
                    pending.item = row;
                    pending.itemKey = key;
                    pending.itemName = row.label;
                    pending.suggestedVerb = determineSuggestedVerb(row, pending.listKind, realm);
                    return true;
                }
            }

            const verbsForRealm = VERBS[realm];
            if (verbsForRealm && verbsForRealm[key]) {
                chooseVerb(key);
                return true;
            }

            // Allow clicking/pressing another item letter to change the selection in the chooser
            if (key.length === 1 && /[a-z]/i.test(key) && classifier.items) {
                const row = classifier.items.find(i => i.key === key);
                if (row) {
                    pending.item = row;
                    pending.itemKey = row.key;
                    pending.itemName = row.label;
                    pending.suggestedVerb = determineSuggestedVerb(row, pending.listKind, realm);
                    return true;
                }
            }

            // Swallow any other key while chooser is open to prevent accidental commands
            return true;
        }

        // Case B: In item-list with command prompt (Sil-Q or Hengband), FCB Gear UI, or Angband item select
        const isCommandPrompt = (classifier.mode === 'item-list' && classifier.promptKind === 'command');
        const isFcbGear = (realm === 'frogcomposband' && classifier.mode === 'item-list' && classifier.listKind && classifier.promptKind === 'command');
        const isAngbandSelect = (realm === 'angband' && classifier.mode === 'item-list' && !classifier.verbPrompt);

        // CMD-P2-05: In isAngbandSelect, if sc.verbPrompt is unmapped (and not standard inventory/equipment list), pass through
        if (isAngbandSelect) {
            const hasMappedVerb = classifier.verbPrompt && VERB_FROM_PROMPT[classifier.verbPrompt];
            const isStandardList = classifier.listKind === 'inven' || classifier.listKind === 'inventory' ||
                                   classifier.listKind === 'equip' || classifier.listKind === 'equipment';
            if (!hasMappedVerb && !isStandardList) {
                return false;
            }
        }

        if (isCommandPrompt || isFcbGear || isAngbandSelect) {
            if (isEscape) {
                clearPending();
                return false; // Pass escape through to engine to close inventory/equipment
            }

            const verbsForRealm = VERBS[realm] || {};
            const isVerbKey = Boolean(verbsForRealm[key]);

            // CMD-P1-10: In passive command-loop lists, if user presses a key that is a realm verb AND opts.source === 'keyboard',
            // let native verb keys work cleanly
            if (isCommandPrompt && isVerbKey && opts && opts.source === 'keyboard') {
                return false;
            }

            // Letters/digits that match a listed item row open the Action Chooser
            if (key.length === 1 && /[a-zA-Z0-9]/.test(key) && classifier.items) {
                const isLower = /[a-z]/.test(key);
                if (isLower || (!isVerbKey && realm === 'frogcomposband')) {
                    const row = classifier.items.find(i => i.key === key);
                    if (row) {
                        pending = {
                            item: row,
                            itemKey: row.key,
                            itemName: row.label,
                            suggestedVerb: determineSuggestedVerb(row, classifier.listKind, realm),
                            listKind: classifier.listKind,
                            step: 'chooser',
                            phase: 'choose-verb',
                            verb: null,
                            deadline: 0,
                            realm,
                            fromPassiveAngbandList: isAngbandSelect,
                            fromPassiveFcbList: isFcbGear,
                            awaitingVerbPrompt: false
                        };
                        return true; // Intercepted! Action Chooser will render
                    }
                }
            }

            // In Vanilla Angband passive Select Item:, if user presses a verb key not matching an item slot,
            // exit passive Select Item: and dispatch the verb command directly.
            if (isAngbandSelect && isVerbKey) {
                clearPending();
                getSendKey()('escape');
                getSendKey()(key);
                return true;
            }

            // Non-matching keys (uppercase commands, digits, space, etc.) pass through natively
            return false;
        }

        return false;
    }

    function chooseVerb(verb) {
        if (!pending || !pending.item) return;
        if (verb === 'Escape' || verb === 'escape') {
            clearPending();
            return;
        }

        // In FrogComposBand passive gear_ui ("Examine which item (Esc to exit)?"),
        // Inspect ('I' / 'x') is already the active prompt: simply send the slot key.
        if (pending.fromPassiveFcbList && (verb === 'I' || verb === 'x')) {
            const slotKey = pending.item.key;
            clearPending();
            getSendKey()(slotKey);
            return;
        }

        pending.verb = verb;
        pending.step = 'await-prompt';
        pending.phase = 'await-prompt';
        const delay = 1500;
        pending.deadline = Date.now() + delay;

        // CMD-P1-14: Schedule a self-healing timer that clears pending if still in await-prompt past deadline
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }
        const timer = setTimeout(() => {
            if (pending && (pending.step === 'await-prompt' || pending.phase === 'await-prompt')) {
                if (Date.now() >= pending.deadline) {
                    clearPending();
                }
            }
        }, delay);
        if (timer && typeof timer.unref === 'function') {
            timer.unref();
        }
        pendingTimeout = timer;

        // In Vanilla Angband passive `Select Item:` and FrogComposBand passive `gear_ui`,
        // lowercase verb keys ('d', 'a', 'w', 'q', 'r', etc.) collide with item slot letters a-z
        // or are ignored while the passive list is open. Exit the passive list with Escape first,
        // then dispatch the verb key to open the engine's verb-specific item prompt.
        if (pending.fromPassiveAngbandList || pending.fromPassiveFcbList) {
            pending.awaitingVerbPrompt = true;
            getSendKey()('escape');
            getSendKey()(verb);
            return;
        }

        // In Sil-Q and Hengband, `(Inventory) Command:` / `コマンド:` natively accepts verb keys.
        getSendKey()(verb);
    }

    function onFrame(frame, realm) {
        if (!frame || !realm) return;

        if (pending && (pending.step === 'chooser' || pending.phase === 'choose-verb')) {
            const classifier = getClassifier(frame, realm);
            if (!classifier || classifier.mode !== 'item-list') {
                clearPending();
                return;
            }
        }

        if (pending && (pending.step === 'await-prompt' || pending.phase === 'await-prompt')) {
            const now = Date.now();
            if (now > pending.deadline) {
                clearPending();
                return;
            }

            const classifier = getClassifier(frame, realm);

            // Engine responded with a native item-actions context menu (e.g. "Command for <item>:")
            if (classifier && classifier.mode === 'item-actions') {
                if (pending.verb) {
                    getSendKey()(pending.verb);
                }
                clearPending();
                return;
            }

            // Engine responded with an item selection prompt (e.g. "Wear/Wield which item?")
            if (classifier && classifier.promptKind === 'select') {
                // Fallback safety: if still on passive Angband list without verbPrompt, exit and retry once
                if (realm === 'angband' && !classifier.verbPrompt && pending.fromPassiveAngbandList && !pending.sentEscapeRetry) {
                    if (pending.verb === 'I') {
                        getSendKey()(pending.item.key);
                        clearPending();
                        return;
                    }
                    pending.sentEscapeRetry = true;
                    pending.awaitingVerbPrompt = true;
                    getSendKey()('escape');
                    getSendKey()(pending.verb);
                    return;
                }

                const normTarget = normalizeLabel(pending.item.label);
                const match = classifier.items && classifier.items.find(i => normalizeLabel(i.label) === normTarget);
                
                if (match) {
                    getSendKey()(match.key);
                } else if (!classifier.items || classifier.items.length === 0) {
                    // Engine prompt didn't render items list (e.g. 3.x without command_see); fall back to slot key
                    getSendKey()(pending.item.key);
                } else {
                    // Item was filtered out by engine (e.g. tried to wear food)
                    getSendKey()('escape');
                    const verbKey = pending.verb;
                    const verbEntry = (realm && VERBS[realm] && verbKey) ? VERBS[realm][verbKey] : null;
                    const verbLabel = (verbEntry && verbEntry.label) ? verbEntry.label : (verbKey || 'use');
                    getToast()("Can't " + verbLabel + " that item.");
                }
                clearPending();
                return;
            }

            // Engine prompt completed or returned to command / more / death
            if (frame.ui && frame.ui.more) {
                clearPending();
                return;
            }
            if (frame.ui && !frame.ui.overlay && frame.ui.awaiting_command) {
                // When exiting passive Angband/FCB inventory via Escape + verb, the engine emits
                // one transient awaiting_command frame after Escape before processing the verb key.
                if (pending.awaitingVerbPrompt) {
                    pending.awaitingVerbPrompt = false;
                    return;
                }
                clearPending();
                return;
            }
            if (frame.phase !== 'play' || (frame.player && frame.player.dead)) {
                clearPending();
                return;
            }
        }
    }

    function buildInventoryVerbSequence(verb, slotKey, options = {}) {
        const v = String(verb || '');
        const k = String(slotKey || '');
        if (!k) return v ? [v] : [];
        if (!v) return [k];
        if (options && options.fromPassiveFcbList && (v === 'I' || v === 'x')) {
            return [k];
        }
        const isPassive = Boolean(
            options && (
                options.fromPassiveAngbandList ||
                options.fromPassiveFcbList ||
                options.fromPassiveNethackList
            )
        );
        if (v.startsWith('#')) {
            return isPassive ? ['escape', v, k] : [v, k];
        }
        if (isPassive) {
            return ['escape', v, k];
        }
        return [v, k];
    }

    // Export public API
    exports.VERBS = VERBS;
    exports.VERB_FROM_PROMPT = VERB_FROM_PROMPT;
    exports.route = route;
    exports.onFrame = onFrame;
    exports.chooseVerb = chooseVerb;
    exports.getPending = getPending;
    exports.clearPending = clearPending;
    exports.renderChooserHtml = renderChooserHtml;
    exports.normalizeLabel = normalizeLabel;
    exports.determineSuggestedVerb = determineSuggestedVerb;
    exports.buildInventoryVerbSequence = buildInventoryVerbSequence;
    exports.setSendKey = setSendKey;
    exports.setToast = setToast;

    // Define pending getter/setter for compatibility and inspection
    Object.defineProperty(exports, 'pending', {
        get: () => pending,
        set: (v) => { pending = v; },
        configurable: true,
        enumerable: true
    });
}));

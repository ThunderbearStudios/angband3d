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
        }
    };

    let pending = null; // { item, listKind, step: 'chooser'|'await-prompt', verb, deadline } | null
    let customSendKey = null;
    let customToast = null;

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
        pending = null;
    }

    function getClassifier(frame, realm) {
        if (typeof window !== 'undefined' && window.ScreenContext && typeof window.ScreenContext.classify === 'function') {
            return window.ScreenContext.classify(frame, realm);
        }
        if (typeof global !== 'undefined' && global.ScreenContext && typeof global.ScreenContext.classify === 'function') {
            return global.ScreenContext.classify(frame, realm);
        }
        return null;
    }

    function determineSuggestedVerb(item, listKind, realm) {
        if (!item) return null;
        if (listKind === 'equip') {
            return realm === 'silq' ? 'r' : 't'; // Take off
        }

        const glyph = item.glyph || '';
        const label = (item.label || '').toLowerCase();

        // Wearables (weapons, armor, jewelry, light)
        if ('|/\\}()=["~{'.includes(glyph)) return 'w';
        if (label.includes('torch') || label.includes('lantern') || label.includes('sword') ||
            label.includes('bow') || label.includes('shield') || label.includes('helm') ||
            label.includes('boots') || label.includes('armor') || label.includes('armour') ||
            label.includes('ring') || label.includes('amulet') || label.includes('cloak') ||
            label.includes('gloves') || label.includes('dagger') || label.includes('axe')) {
            return 'w';
        }

        // Food
        if (glyph === ',') return 'E';
        if (label.includes('food') || label.includes('ration') || label.includes('bread') ||
            label.includes('mushroom') || label.includes('食料')) {
            return 'E';
        }

        // Potions
        if (glyph === '!') return 'q';
        if (label.includes('potion') || label.includes('薬')) return 'q';

        // Scrolls
        if (glyph === '?') return realm === 'silq' ? null : 'r';
        if (label.includes('scroll') || label.includes('巻物')) return realm === 'silq' ? null : 'r';

        // Staves
        if (glyph === '_') return realm === 'silq' ? 'a' : 'u';
        if (label.includes('staff') || label.includes('杖')) return realm === 'silq' ? 'a' : 'u';

        // Wands
        if (glyph === '-') return realm === 'silq' ? null : 'a';
        if (label.includes('wand')) return realm === 'silq' ? null : 'a';

        // Rods
        if (label.includes('rod')) return realm === 'silq' ? null : 'z';

        return null;
    }

    function renderChooserHtml(pendingState, realm) {
        if (!pendingState || pendingState.step !== 'chooser' || !pendingState.item) return '';

        const verbsForRealm = VERBS[realm] || VERBS.silq;
        const suggestedVerb = determineSuggestedVerb(pendingState.item, pendingState.listKind, realm);

        let html = `<div class="term-chooser-header" style="padding: 4px 8px; font-weight: bold; color: #ffd700;">🎒 ${escapeHtml(pendingState.item.key)}) ${escapeHtml(pendingState.item.label)} — choose action</div>`;
        html += `<div class="term-chooser-buttons" style="display: flex; flex-wrap: wrap; gap: 6px; padding: 4px;">`;

        const entries = Object.entries(verbsForRealm);
        
        // Put suggested verb first if present
        if (suggestedVerb && verbsForRealm[suggestedVerb]) {
            const data = verbsForRealm[suggestedVerb];
            if (!data.listOnly || data.listOnly === pendingState.listKind) {
                html += `<button type="button" class="term-ctx-btn is-suggested btn-gold" data-verb="${suggestedVerb}" title="${escapeHtml(data.label)} [${suggestedVerb}]">[${suggestedVerb}] ${data.icon} ${escapeHtml(data.label)}</button>`;
            }
        }

        for (const [v, data] of entries) {
            if (v === suggestedVerb) continue; // Already rendered first
            if (data.listOnly && data.listOnly !== pendingState.listKind) continue;
            html += `<button type="button" class="term-ctx-btn" data-verb="${v}" title="${escapeHtml(data.label)} [${v}]">[${v}] ${data.icon} ${escapeHtml(data.label)}</button>`;
        }

        html += `<button type="button" class="term-ctx-btn" data-verb="Escape" title="Back [Esc]">[Esc] ⎋ Back</button>`;
        html += `</div>`;
        return html;
    }

    function route(key, frame, realm) {
        if (!frame || !realm) return false;

        const classifier = getClassifier(frame, realm);
        if (!classifier) return false;

        const isEscape = (key === 'Escape' || key === 'escape');

        // Case A: Chooser is currently open
        if (pending && pending.step === 'chooser') {
            if (isEscape) {
                clearPending();
                return true; // Handled client-side, do not close the underlying inventory
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
                    return true;
                }
            }

            // Swallow any other key while chooser is open to prevent accidental commands
            return true;
        }

        // Case B: In item-list with command prompt (Sil-Q or Hengband) OR FCB Gear UI
        const isCommandPrompt = (classifier.mode === 'item-list' && classifier.promptKind === 'command');
        const isFcbGear = (realm === 'frogcomposband' && classifier.mode === 'item-list' && classifier.listKind);

        if (isCommandPrompt || isFcbGear) {
            if (isEscape) {
                clearPending();
                return false; // Pass escape through to engine to close inventory/equipment
            }

            // Lowercase letters that match a listed item row open the Action Chooser
            if (key.length === 1 && /[a-z]/.test(key) && classifier.items) {
                const row = classifier.items.find(i => i.key === key);
                if (row) {
                    pending = {
                        item: row,
                        listKind: classifier.listKind,
                        step: 'chooser',
                        verb: null,
                        deadline: 0
                    };
                    return true; // Intercepted! Action Chooser will render
                }
            }

            // Non-matching keys (uppercase commands, digits, space, etc.) pass through natively
            return false;
        }

        return false;
    }

    function chooseVerb(verb) {
        if (!pending || !pending.item) return;

        pending.verb = verb;
        pending.step = 'await-prompt';
        pending.deadline = Date.now() + 1500;

        // Send the verb key to the engine
        getSendKey()(verb);
    }

    function onFrame(frame, realm) {
        if (!frame || !realm) return;

        if (pending && pending.step === 'await-prompt') {
            const now = Date.now();
            if (now > pending.deadline) {
                clearPending();
                return;
            }

            const classifier = getClassifier(frame, realm);

            // Engine responded with an item selection prompt (e.g. "Wear/Wield which item?")
            if (classifier && classifier.promptKind === 'select') {
                const normTarget = normalizeLabel(pending.item.label);
                const match = classifier.items && classifier.items.find(i => normalizeLabel(i.label) === normTarget);
                
                if (match) {
                    getSendKey()(match.key);
                } else if (!classifier.items || classifier.items.length === 0) {
                    // Engine prompt didn't render items list (e.g. 3.x without command_see); fall back to slot key
                    getSendKey()(pending.item.key);
                } else {
                    // Item was filtered out by engine (e.g. tried to wear food)
                    getSendKey()('Escape');
                    getToast()("Can't " + (pending.verb || 'use') + " that item.");
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
                clearPending();
                return;
            }
            if (frame.phase !== 'play' || (frame.player && frame.player.dead)) {
                clearPending();
                return;
            }
        }
    }

    // Export public API
    exports.VERBS = VERBS;
    exports.route = route;
    exports.onFrame = onFrame;
    exports.chooseVerb = chooseVerb;
    exports.getPending = getPending;
    exports.clearPending = clearPending;
    exports.renderChooserHtml = renderChooserHtml;
    exports.normalizeLabel = normalizeLabel;
    exports.determineSuggestedVerb = determineSuggestedVerb;
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

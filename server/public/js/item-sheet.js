/**
 * item-sheet.js — Noun-to-Verb Item Sheet Drawer
 *
 * WS42 Command & Menu Unification (Cards WS42.5A/B, §6.8 #3, §8, §16.4, §16.5).
 * Unified noun->verb item drawer for Pack, Gear (Equipment), and Quiver.
 * Built directly from frame player data (not scraped terminal rows), decoded via
 * ActionCatalog.validVerbsForItem with bridge vm/im bitmasks.
 *
 * UMD: browser -> window.ItemSheet; Node -> module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ItemSheet = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let ActionCatalogModule = null;
    if (typeof require === 'function') {
        try { ActionCatalogModule = require('./action-catalog'); } catch (_) {}
    }

    function getActionCatalog() {
        if (typeof window !== 'undefined' && window.ActionCatalog) return window.ActionCatalog;
        if (ActionCatalogModule) return ActionCatalogModule;
        return null;
    }

    let _lastSig = null;
    let _activeTab = 'pack';
    let _invokerEl = null;
    const _quickSlots = [null, null, null, null];

    /**
     * Pure function building item view models. Testable in Node without DOM.
     * @param {Object} frame
     * @param {string} [realm='angband']
     * @param {string} [tab='pack']
     * @param {string} [lang='en']
     * @returns {Array<Object>}
     */
    function buildItemViewModel(frame, realm, tab, lang) {
        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const tabNorm = String(tab || 'pack').toLowerCase();
        const player = frame && frame.player;

        let rawItems = [];
        let isEquipped = false;

        if (tabNorm === 'gear' || tabNorm === 'equipment') {
            rawItems = (player && Array.isArray(player.equipment)) ? player.equipment : [];
            isEquipped = true;
        } else if (tabNorm === 'quiver') {
            rawItems = (player && Array.isArray(player.quiver)) ? player.quiver : [];
        } else {
            rawItems = (player && Array.isArray(player.inventory)) ? player.inventory : [];
        }

        const catalog = getActionCatalog();
        const result = [];

        for (let i = 0; i < rawItems.length; i++) {
            const raw = rawItems[i];
            const slot = raw.slot !== undefined ? raw.slot : i;
            const letter = raw.letter || raw.key || raw.label || '';
            const name = raw.name || raw.dname || raw.label || 'Unknown Item';
            const tval = raw.tval !== undefined ? raw.tval : (raw.type || 0);
            const count = raw.count || raw.amt || raw.number || 1;
            const inscription = raw.inscription || raw.note || '';

            let catalogVerbs = [];
            if (catalog && typeof catalog.validVerbsForItem === 'function') {
                const itemForCatalog = isEquipped ? raw : Object.assign({}, raw, { slot: undefined });
                catalogVerbs = catalog.validVerbsForItem(itemForCatalog, r, isEquipped);
            } else {
                const defaultIds = isEquipped ? ['takeoff', 'examine'] : ['wield', 'drop', 'examine'];
                catalogVerbs = defaultIds.map((id) => ({
                    id,
                    keys: { [r]: id[0] },
                    labels: { en: id, jp: id }
                }));
            }

            if (tabNorm === 'quiver' && !catalogVerbs.some((c) => c.id === 'fire')) {
                const fireCmd = catalog && typeof catalog.get === 'function' ? catalog.get('fire') : null;
                if (fireCmd && fireCmd.keys && fireCmd.keys[r] !== null) {
                    catalogVerbs.unshift(fireCmd);
                }
            }

            let hasPrimary = false;
            const validVerbs = [];

            for (let v = 0; v < catalogVerbs.length; v++) {
                const cmd = catalogVerbs[v];
                const verbKey = (cmd.keys && cmd.keys[r] !== undefined && cmd.keys[r] !== null) ? cmd.keys[r] : (cmd.key || '');
                const label = (lang === 'jp' && cmd.labels && cmd.labels.jp)
                    ? cmd.labels.jp
                    : ((cmd.labels && cmd.labels.en) || cmd.name || cmd.id);

                let primary = false;
                if (isEquipped) {
                    if (cmd.id === 'takeoff') primary = true;
                } else if (tabNorm === 'quiver') {
                    if (cmd.id === 'fire') primary = true;
                } else {
                    if (!hasPrimary && (cmd.id === 'quaff' || cmd.id === 'read' || cmd.id === 'eat' ||
                        cmd.id === 'zap' || cmd.id === 'aim' || cmd.id === 'use_staff' ||
                        cmd.id === 'wield' || cmd.id === 'browse')) {
                        primary = true;
                        hasPrimary = true;
                    }
                }

                let disabled = false;
                let reason = '';
                if (catalog) {
                    if (typeof catalog.isAvailable === 'function' && !catalog.isAvailable(cmd.id)) {
                        disabled = true;
                        reason = 'Action currently unavailable';
                    }
                    if (!disabled && typeof raw.im === 'number' && catalog.VERB_BITS) {
                        const bitIdx = catalog.VERB_BITS.indexOf(cmd.id);
                        if (bitIdx >= 0 && ((raw.im & (1 << bitIdx)) !== 0)) {
                            disabled = true;
                            reason = raw.imReason || 'Cannot perform this action now';
                        }
                    }
                }

                validVerbs.push({
                    id: cmd.id,
                    key: verbKey,
                    label,
                    primary,
                    disabled,
                    reason
                });
            }

            result.push({
                slot,
                letter,
                name,
                tval,
                count,
                inscription,
                validVerbs,
                raw
            });
        }

        return result;
    }

    function bindQuickSlot(slotIndex, item, verb) {
        if (slotIndex >= 1 && slotIndex <= 4) {
            _quickSlots[slotIndex - 1] = { item, verb };
            return true;
        }
        return false;
    }

    function getQuickSlots() {
        return _quickSlots.slice();
    }

    function executeVerb(item, verb, realm, dispatcher) {
        if (!verb || verb.disabled) return;
        hide();
        const d = dispatcher || (typeof window !== 'undefined' && window.__app && window.__app.dispatcher) || null;
        if (d && typeof d.run === 'function') {
            d.run({ verb: verb.id, item: item.raw || item });
        } else {
            const key = verb.key || (verb.keys && verb.keys[realm]);
            if (key && typeof window !== 'undefined' && window.network && typeof window.network.sendKey === 'function') {
                window.network.sendKey(key);
            }
        }
    }

    function ensureContainer() {
        if (typeof document === 'undefined') return null;
        let c = document.getElementById('item-sheet') || document.getElementById('item-sheet-drawer');
        if (!c) {
            c = document.createElement('dialog');
            c.id = 'item-sheet';
            c.className = 'item-sheet-dialog hidden';
            c.hidden = true;
            c.setAttribute('aria-label', 'Inventory and Equipment Sheet');
            document.body.appendChild(c);
        }
        if (!c._hasSheetListeners) {
            c._hasSheetListeners = true;
            c.addEventListener('click', (e) => { if (e.target === c) hide(); });
            c.addEventListener('cancel', (e) => { e.preventDefault(); hide(); });
        }
        return c;
    }

    function render(frame, realm, containerOrOpts) {
        if (typeof document === 'undefined') return;

        let opts = containerOrOpts || {};
        if (containerOrOpts && containerOrOpts.nodeType) {
            opts = { container: containerOrOpts };
        }

        const container = opts.container || ensureContainer();
        if (!container) return;

        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const tab = opts.tab || _activeTab;
        const lang = (typeof window !== 'undefined' && window.__langMode) || 'en';
        const items = buildItemViewModel(frame, r, tab, lang);

        const sig = `${r}:${tab}:${lang}:${items.length}:${items.map((i) => `${i.letter || ''}:${i.name || ''}:${i.count || i.qty || 1}:${i.inscription || ''}`).join(';')}`;
        if (sig === _lastSig) return;
        _lastSig = sig;

        const wasAlreadyOpen = Boolean(container.open || (!container.hidden && !container.classList.contains('hidden') && container.childNodes.length > 0));
        container.textContent = '';
        container.classList.toggle('is-open-stable', wasAlreadyOpen);

        // Header with tabs
        const header = document.createElement('div');
        header.className = 'item-sheet-header';

        const tabsWrap = document.createElement('div');
        tabsWrap.className = 'item-sheet-tabs';
        const tabDefs = [
            { id: 'pack', label: 'Pack' },
            { id: 'gear', label: 'Gear' },
            { id: 'quiver', label: 'Quiver' }
        ];

        for (let t = 0; t < tabDefs.length; t++) {
            const td = tabDefs[t];
            const tabBtn = document.createElement('button');
            tabBtn.type = 'button';
            tabBtn.className = `item-sheet-tab ${td.id === tab ? 'active' : ''}`;
            tabBtn.textContent = td.label;
            tabBtn.setAttribute('data-tab', td.id);
            tabBtn.addEventListener('click', function () {
                _activeTab = td.id;
                _lastSig = null;
                render(frame, r, { container, tab: td.id, dispatcher: opts.dispatcher });
            });
            tabsWrap.appendChild(tabBtn);
        }
        header.appendChild(tabsWrap);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'item-sheet-close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close Item Sheet');
        closeBtn.addEventListener('click', function () {
            hide();
        });
        header.appendChild(closeBtn);
        container.appendChild(header);

        // Item List
        const listEl = document.createElement('div');
        listEl.className = 'item-sheet-list';

        if (items.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'item-sheet-empty';
            emptyEl.textContent = `No items in ${tab}.`;
            listEl.appendChild(emptyEl);
        } else {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const card = document.createElement('div');
                card.className = 'item-sheet-card';

                const infoRow = document.createElement('div');
                infoRow.className = 'item-sheet-info';

                const badge = document.createElement('kbd');
                badge.className = 'item-sheet-badge';
                badge.textContent = item.letter ? `[${item.letter}]` : `[${i + 1}]`;
                infoRow.appendChild(badge);

                const nameWrap = document.createElement('div');
                nameWrap.className = 'item-sheet-name-wrap';

                const nameEl = document.createElement('span');
                nameEl.className = 'item-sheet-name';
                nameEl.textContent = item.count > 1 ? `${item.count}x ${item.name}` : item.name;
                nameWrap.appendChild(nameEl);

                if (item.inscription) {
                    const inscEl = document.createElement('span');
                    inscEl.className = 'item-sheet-inscription';
                    inscEl.textContent = ` {${item.inscription}}`;
                    nameWrap.appendChild(inscEl);
                }
                infoRow.appendChild(nameWrap);
                card.appendChild(infoRow);

                // Verbs row
                const verbsRow = document.createElement('div');
                verbsRow.className = 'item-sheet-verbs';

                for (let v = 0; v < item.validVerbs.length; v++) {
                    const verb = item.validVerbs[v];
                    const vBtn = document.createElement('button');
                    vBtn.type = 'button';
                    vBtn.className = `item-verb-btn ${verb.primary ? 'primary' : ''} ${verb.disabled ? 'disabled' : ''}`;
                    if (verb.disabled) {
                        vBtn.setAttribute('aria-disabled', 'true');
                        vBtn.title = verb.reason;
                    }

                    if (verb.key) {
                        const kbd = document.createElement('kbd');
                        kbd.className = 'item-verb-kbd';
                        kbd.textContent = `[${verb.key}]`;
                        vBtn.appendChild(kbd);
                    }

                    const labelSpan = document.createElement('span');
                    labelSpan.textContent = verb.label;
                    vBtn.appendChild(labelSpan);

                    vBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        executeVerb(item, verb, r, opts.dispatcher);
                    });
                    verbsRow.appendChild(vBtn);
                }

                card.appendChild(verbsRow);
                listEl.appendChild(card);
            }
        }

        container.appendChild(listEl);
    }

    function show(frame, realm, invokerEl) {
        _invokerEl = invokerEl || null;
        const c = ensureContainer();
        if (c) {
            c.hidden = false;
            c.classList.remove('hidden');
            if (typeof c.showModal === 'function' && !c.open) {
                try { c.showModal(); } catch (_) { c.setAttribute('open', ''); }
            } else {
                c.setAttribute('open', '');
            }
            _lastSig = null;
            render(frame, realm, { container: c, tab: _activeTab });
        }
    }

    function hide() {
        _lastSig = null;
        const c = (typeof document !== 'undefined') ? (document.getElementById('item-sheet') || document.getElementById('item-sheet-drawer')) : null;
        if (c) {
            if (typeof c.close === 'function' && c.open) {
                try { c.close(); } catch (_) { c.removeAttribute('open'); }
            } else {
                c.removeAttribute('open');
            }
            c.hidden = true;
            c.classList.add('hidden');
            c.textContent = '';
        }
        if (_invokerEl && typeof _invokerEl.focus === 'function') {
            try { _invokerEl.focus(); } catch (_) {}
            _invokerEl = null;
        }
    }

    function toggle(frame, realm, invokerEl) {
        const c = (typeof document !== 'undefined') ? (document.getElementById('item-sheet') || document.getElementById('item-sheet-drawer')) : null;
        if (c && (c.open || (!c.hidden && !c.classList.contains('hidden')))) hide();
        else show(frame, realm, invokerEl);
    }

    return Object.freeze({
        buildItemViewModel,
        bindQuickSlot,
        getQuickSlots,
        executeVerb,
        render,
        show,
        hide,
        toggle
    });
});

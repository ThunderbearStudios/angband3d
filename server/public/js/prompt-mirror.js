/**
 * prompt-mirror.js — 3D Prompt Mirror Widget Controller
 *
 * WS42 Command & Menu Unification (Cards WS42.5A/B, §6.7, §8, §16.4, §16.5).
 * Mirrors engine prompts into 3D overlays without hijacking input or state:
 *   - 'more': dismissal banner ("Continue [Space]")
 *   - 'yesno': binary confirmation dialog ("[y] Yes", "[n] No", "[Esc] Cancel")
 *   - 'quantity' / 'count': numeric stepper (-1, +1, All *, Max &, Enter, Esc)
 *   - 'item': eligible inventory/equipment items + category switch chips
 *   - 'item-menu': native Vanilla row verbs
 *   - 'direction': 8-way directional compass + realm target chip
 *   - 'spell': castable spell list
 *
 * UMD: browser -> window.PromptMirror; Node -> module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PromptMirror = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let _lastSig = null;
    let _activeSendKey = null;

    /**
     * Pure function returning declarative mirror specification.
     * Testable in Node without DOM.
     */
    function buildSpec(model, frame, realm) {
        if (!model || !model.mirror) return null;

        const mirror = model.mirror;
        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const prompt = model.prompt || {};
        const title = prompt.text || defaultTitleFor(mirror);

        let actions = [];
        let items = [];
        let switchChips = [];
        let targetChip = null;

        switch (mirror) {
            case 'more':
                actions = [{ key: 'space', label: 'Continue', badge: '[Space]', primary: true }];
                break;

            case 'yesno':
                actions = [
                    { key: 'y', label: 'Yes', badge: '[y]', primary: true },
                    { key: 'n', label: 'No', badge: '[n]', danger: true },
                    { key: 'escape', label: 'Cancel', badge: '[Esc]' }
                ];
                break;

            case 'quantity':
            case 'count':
                actions = [
                    { key: '-', label: '-1', badge: '[-]' },
                    { key: '+', label: '+1', badge: '[+]' },
                    { key: '*', label: 'All (*)', badge: '[*]' },
                    { key: '&', label: 'Max (&)', badge: '[&]' },
                    { key: 'enter', label: 'Confirm', badge: '[⏎]', primary: true },
                    { key: 'escape', label: 'Cancel', badge: '[Esc]' }
                ];
                break;

            case 'item':
                switchChips = [
                    { key: '/', label: 'Equip [/]' },
                    { key: '|', label: 'Quiver [|]' },
                    { key: '-', label: 'Floor [-]' }
                ];
                actions = [{ key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                items = (model.items || []).map((it) => ({
                    letter: it.letter || it.key || '',
                    name: it.name || it.label || it.rowLabel || 'Item',
                    slot: it.slot !== undefined ? it.slot : null,
                    source: it.source || 'pack',
                    vm: it.vm
                }));
                break;

            case 'item-menu': {
                actions = [{ key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                const rawRows = (model.regions && model.regions.length)
                    ? model.regions
                    : (model.items || (model.legacy && model.legacy.itemRows) || []);
                items = rawRows.map((r) => ({
                    letter: r.letter || r.key || '',
                    name: r.name || r.label || r.text || '',
                    slot: r.slot !== undefined ? r.slot : null,
                    source: 'menu'
                }));
                break;
            }

            case 'direction': {
                const targetKey = (r === 'silq') ? 'f' : 't';
                targetChip = { key: targetKey, label: `Target [${targetKey}]` };
                actions = [
                    { key: '1', label: 'SW', badge: '[1]' },
                    { key: '2', label: 'S', badge: '[2]' },
                    { key: '3', label: 'SE', badge: '[3]' },
                    { key: '4', label: 'W', badge: '[4]' },
                    { key: targetKey, label: targetChip.label, badge: `[${targetKey}]`, primary: true },
                    { key: '6', label: 'E', badge: '[6]' },
                    { key: '7', label: 'NW', badge: '[7]' },
                    { key: '8', label: 'N', badge: '[8]' },
                    { key: '9', label: 'NE', badge: '[9]' },
                    { key: '*', label: 'Cycle [*]', badge: '[*]' },
                    { key: 'escape', label: 'Cancel', badge: '[Esc]' }
                ];
                break;
            }

            case 'spell': {
                actions = [{ key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                const rawSpells = (frame && Array.isArray(frame.spells)) ? frame.spells : (model.items || []);
                items = rawSpells.map((s) => ({
                    letter: s.letter || s.key || '',
                    name: s.name || s.label || 'Spell',
                    slot: s.slot !== undefined ? s.slot : null,
                    source: 'spell',
                    cost: s.mana !== undefined ? s.mana : s.cost,
                    fail: s.fail,
                    level: s.level
                }));
                break;
            }

            default:
                return null;
        }

        return { mirror, title, actions, items, switchChips, targetChip };
    }

    function defaultTitleFor(mirror) {
        switch (mirror) {
            case 'more': return '-more-';
            case 'yesno': return 'Confirmation [y/n]';
            case 'quantity':
            case 'count': return 'Enter Quantity';
            case 'item': return 'Select Item';
            case 'item-menu': return 'Item Command';
            case 'direction': return 'Target / Direction';
            case 'spell': return 'Choose Spell';
            default: return 'Prompt';
        }
    }

    function ensureContainer() {
        if (typeof document === 'undefined') return null;
        let c = document.getElementById('prompt-mirror-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'prompt-mirror-container';
            c.className = 'prompt-mirror-container hidden';
            c.setAttribute('role', 'region');
            c.setAttribute('aria-label', '3D Engine Prompt Mirror');
            document.body.appendChild(c);
        }
        return c;
    }

    function attachDelegatedListener(container) {
        if (!container || container._hasMirrorListener) return;
        container._hasMirrorListener = true;

        container.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-mirror-key]');
            if (!btn) return;
            const key = btn.getAttribute('data-mirror-key');
            if (!key) return;

            e.preventDefault();
            e.stopPropagation();

            const fn = _activeSendKey || (typeof window !== 'undefined' && window.__app && window.__app.network && typeof window.__app.network.sendKey === 'function' ? window.__app.network.sendKey.bind(window.__app.network) : null);
            if (fn) fn(key);
        });
    }

    /**
     * DOM Render function gated by signature. Uses textContent only (Golden Rule 8).
     */
    function render(frame, model, realm, opts) {
        if (typeof document === 'undefined') return;

        opts = opts || {};
        _activeSendKey = opts.sendKey || null;

        const container = opts.container || ensureContainer();
        if (!container) return;

        attachDelegatedListener(container);

        const spec = buildSpec(model, frame, realm);
        if (!spec) {
            hide(container);
            return;
        }

        const sig = `${spec.mirror}:${spec.title}:${spec.items.length}:${spec.actions.length}:${spec.switchChips.length}:${frame ? frame.seq : 0}`;
        if (sig === _lastSig) return;
        _lastSig = sig;

        container.textContent = '';
        container.classList.remove('hidden');

        // Header / Title
        const header = document.createElement('div');
        header.className = 'prompt-mirror-header';
        const titleEl = document.createElement('div');
        titleEl.className = 'prompt-mirror-title';
        titleEl.textContent = spec.title;
        header.appendChild(titleEl);
        container.appendChild(header);

        // Switch chips
        if (spec.switchChips && spec.switchChips.length > 0) {
            const chipRow = document.createElement('div');
            chipRow.className = 'prompt-mirror-chips';
            for (let i = 0; i < spec.switchChips.length; i++) {
                const chip = spec.switchChips[i];
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'prompt-mirror-chip-btn';
                btn.setAttribute('data-mirror-key', chip.key);
                btn.textContent = chip.label;
                chipRow.appendChild(btn);
            }
            container.appendChild(chipRow);
        }

        // Items list
        if (spec.items && spec.items.length > 0) {
            const listEl = document.createElement('div');
            listEl.className = 'prompt-mirror-item-list';
            for (let i = 0; i < spec.items.length; i++) {
                const item = spec.items[i];
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'prompt-mirror-item-row';
                row.setAttribute('data-mirror-key', item.letter);

                const badge = document.createElement('kbd');
                badge.className = 'prompt-mirror-item-badge';
                badge.textContent = `[${item.letter}]`;
                row.appendChild(badge);

                const nameEl = document.createElement('span');
                nameEl.className = 'prompt-mirror-item-name';
                nameEl.textContent = item.name;
                row.appendChild(nameEl);

                if (item.cost !== undefined) {
                    const costEl = document.createElement('span');
                    costEl.className = 'prompt-mirror-item-cost';
                    costEl.textContent = `${item.cost}mp`;
                    row.appendChild(costEl);
                }

                listEl.appendChild(row);
            }
            container.appendChild(listEl);
        }

        // Action buttons
        if (spec.actions && spec.actions.length > 0) {
            const actionsRow = document.createElement('div');
            actionsRow.className = `prompt-mirror-actions ${spec.mirror === 'direction' ? 'direction-grid' : ''}`;
            for (let i = 0; i < spec.actions.length; i++) {
                const act = spec.actions[i];
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `prompt-mirror-action-btn ${act.primary ? 'primary' : ''} ${act.danger ? 'danger' : ''}`;
                btn.setAttribute('data-mirror-key', act.key);

                if (act.badge) {
                    const badge = document.createElement('kbd');
                    badge.className = 'prompt-mirror-action-badge';
                    badge.textContent = act.badge;
                    btn.appendChild(badge);
                }

                const labelSpan = document.createElement('span');
                labelSpan.textContent = act.label;
                btn.appendChild(labelSpan);

                actionsRow.appendChild(btn);
            }
            container.appendChild(actionsRow);
        }
    }

    function hide(container) {
        _lastSig = null;
        const c = container || (typeof document !== 'undefined' ? document.getElementById('prompt-mirror-container') : null);
        if (c) {
            c.classList.add('hidden');
            c.textContent = '';
        }
    }

    return Object.freeze({
        buildSpec,
        render,
        hide
    });
});

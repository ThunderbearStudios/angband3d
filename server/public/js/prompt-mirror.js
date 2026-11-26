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

        let actions = [], items = [], switchChips = [], targetChip = null, desc = '';
        const row0Text = (frame && frame.term && frame.term.rows && frame.term.rows[0] && frame.term.rows[0].g) ? frame.term.rows[0].g : '';

        switch (mirror) {
            case 'more': actions = [{ key: 'space', label: 'Continue', badge: '[Space]', primary: true }]; break;
            case 'yesno': actions = [{ key: 'y', label: 'Yes', badge: '[y]', primary: true }, { key: 'n', label: 'No', badge: '[n]', danger: true }, { key: 'escape', label: 'Cancel', badge: '[Esc]' }]; break;
            case 'quantity':
            case 'count': actions = [{ key: '-', label: '-1', badge: '[-]' }, { key: '+', label: '+1', badge: '[+]' }, { key: '*', label: 'All (*)', badge: '[*]' }, { key: '&', label: 'Max (&)', badge: '[&]' }, { key: 'enter', label: 'Confirm', badge: '[⏎]', primary: true }, { key: 'escape', label: 'Cancel', badge: '[Esc]' }]; break;
            case 'item':
                switchChips = [{ key: '/', label: 'Equip [/]' }, { key: '|', label: 'Quiver [|]' }, { key: '-', label: 'Floor [-]' }];
                if (/\*\s*(?:to see|=list)|'\*'で一覧/i.test(row0Text + ' ' + title)) switchChips.push({ key: '*', label: 'Show All [*]' });
                actions = [{ key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                items = (model.items || []).map((it) => ({ letter: it.letter || it.key || '', name: it.name || it.label || it.rowLabel || 'Item', slot: it.slot !== undefined ? it.slot : null, source: it.source || 'pack', vm: it.vm }));
                break;
            case 'item-menu': {
                actions = [{ key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                const rawRows = (model.regions && model.regions.length) ? model.regions : (model.items || (model.legacy && model.legacy.itemRows) || []);
                items = rawRows.map((r) => ({ letter: r.letter || r.key || '', name: r.name || r.label || r.text || '', slot: r.slot !== undefined ? r.slot : null, source: 'menu' }));
                if (frame && frame.term && Array.isArray(frame.term.rows)) {
                    const lore = [];
                    for (let ri = 1; ri <= 6 && ri < frame.term.rows.length; ri++) {
                        const seg = String(frame.term.rows[ri].g || '').slice(0, 56).replace(/\s+(?:[A-Za-z{}k]\)|LEVEL|STR|INT).*$/i, '').trim();
                        if (seg && /[a-zA-Z]{3}/.test(seg) && !/[#]{2,}|^(?:STR|INT|WIS|DEX|CON|AU|LEVEL|HP|SP)[:\s]/i.test(seg)) lore.push(seg);
                    }
                    if (lore.length) desc = lore.join(' · ').slice(0, 160);
                }
                break;
            }
            case 'direction': {
                const targetKey = (r === 'silq') ? 'f' : 't';
                targetChip = { key: targetKey, label: `Target [${targetKey}]` };
                actions = [{ key: '1', label: 'SW', badge: '[1]' }, { key: '2', label: 'S', badge: '[2]' }, { key: '3', label: 'SE', badge: '[3]' }, { key: '4', label: 'W', badge: '[4]' }, { key: targetKey, label: targetChip.label, badge: `[${targetKey}]`, primary: true }, { key: '6', label: 'E', badge: '[6]' }, { key: '7', label: 'NW', badge: '[7]' }, { key: '8', label: 'N', badge: '[8]' }, { key: '9', label: 'NE', badge: '[9]' }, { key: '*', label: 'Cycle [*]', badge: '[*]' }, { key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                break;
            }
            case 'spell': {
                actions = [{ key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                if (/\?/.test(title)) actions.push({ key: '?', label: 'Descriptions', badge: '[?]' });
                if (/\*/.test(title) || /'\*'/.test(row0Text)) actions.push({ key: '*', label: 'Toggle List', badge: '[*]' });
                const appSpells = (typeof window !== 'undefined' && window.__app && Array.isArray(window.__app.lastSpells)) ? window.__app.lastSpells : null;
                const rawSpells = (model.items && model.items.length > 0) ? model.items : ((frame && Array.isArray(frame.spells) && frame.spells.length > 0) ? frame.spells : (appSpells || []));
                items = rawSpells.map((s) => ({ letter: s.letter || s.key || '', name: s.name || s.label || 'Spell', slot: s.slot !== undefined ? s.slot : null, source: 'spell', cost: s.mana !== undefined ? s.mana : s.cost, fail: s.fail, level: s.level, info: s.info || s.desc || '' }));
                break;
            }
            case 'string':
                actions = [{ key: 'enter', label: 'Apply', badge: '[Enter]', primary: true }, { key: 'escape', label: 'Cancel', badge: '[Esc]' }];
                break;
            default:
                return null;
        }

        return desc ? { mirror, title, desc, actions, items, switchChips, targetChip } : { mirror, title, actions, items, switchChips, targetChip };
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
            case 'string': return 'Enter Inscription';
            default: return 'Prompt';
        }
    }

    function ensureContainer() {
        if (typeof document === 'undefined') return null;
        let c = document.getElementById('prompt-mirror') || document.getElementById('prompt-mirror-container');
        if (!c) {
            c = document.createElement('div'); c.id = 'prompt-mirror'; c.className = 'prompt-mirror hidden'; c.hidden = true;
            c.setAttribute('role', 'region'); c.setAttribute('aria-label', '3D Engine Prompt Mirror');
            document.body.appendChild(c);
        }
        return c;
    }

    function attachDelegatedListener(container) {
        if (!container || container._hasMirrorListener) return;
        container._hasMirrorListener = true;
        container.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-mirror-key]');
            const key = btn && btn.getAttribute('data-mirror-key');
            if (!key) return;
            e.preventDefault(); e.stopPropagation();
            if (key === '__toggle_crt__') { window.__app?.toggleTerminalView?.(); return; }
            const fn = _activeSendKey || (typeof window !== 'undefined' && window.__app && window.__app.network && typeof window.__app.network.sendKey === 'function' ? window.__app.network.sendKey.bind(window.__app.network) : null);
            if (fn) fn(key);
        });
    }

    /** DOM Render function gated by signature. Uses textContent only (Golden Rule 8). */
    function render(frame, model, realm, opts) {
        if (typeof document === 'undefined') return;
        opts = opts || {};
        _activeSendKey = opts.sendKey || null;
        const container = opts.container || ensureContainer();
        if (!container) return;
        attachDelegatedListener(container);
        const spec = buildSpec(model, frame, realm);
        if (!spec || (spec.mirror === 'more' && !opts.allowMoreBanner)) {
            hide(container);
            return;
        }
        const sig = `${spec.mirror}:${spec.title}:${spec.desc || ''}:${(spec.items || []).map(i => `${i.letter || i.key || ''}=${i.name || i.label || ''}:${i.cost !== undefined ? i.cost : ''}:${i.info || ''}`).join('|')}:${(spec.actions || []).map(a => `${a.key || ''}=${a.label || ''}`).join('|')}:${(spec.switchChips || []).map(c => `${c.key || ''}=${c.label || ''}`).join('|')}`;
        if (sig === _lastSig) return;
        _lastSig = sig;
        const wasAlreadyOpen = !container.hidden && !container.classList.contains('hidden') && container.childNodes.length > 0;
        container.textContent = '';
        container.classList.toggle('is-open-stable', wasAlreadyOpen);
        container.hidden = false;
        container.classList.remove('hidden');
        // Header / Title + [Tab] CRT escape toggle
        const header = document.createElement('div');
        header.className = 'prompt-mirror-header';
        const titleEl = document.createElement('div');
        titleEl.className = 'prompt-mirror-title';
        titleEl.textContent = spec.title;
        header.appendChild(titleEl);
        const crtBtn = document.createElement('button');
        crtBtn.type = 'button'; crtBtn.className = 'prompt-mirror-crt-btn';
        crtBtn.setAttribute('data-mirror-key', '__toggle_crt__');
        crtBtn.title = 'Switch to Classic 80x24 CRT Terminal [Tab]';
        crtBtn.textContent = '[Tab] CRT';
        header.appendChild(crtBtn);
        container.appendChild(header);

        if (spec.desc) {
            const descEl = document.createElement('div');
            descEl.className = 'prompt-mirror-desc';
            descEl.textContent = spec.desc;
            container.appendChild(descEl);
        }

        if (spec.mirror === 'string') {
            const inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'prompt-mirror-input';
            inp.placeholder = /engrave/i.test(spec.title) ? 'Type engraving or press Enter for default…' : 'Type inscription & press Enter…';
            inp.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
                const fn = _activeSendKey || (window.__app && window.__app.network && window.__app.network.sendKey.bind(window.__app.network));
                if (!fn) return;
                if (ev.key === 'Escape') { ev.preventDefault(); fn('escape'); }
                else if (ev.key === 'Enter') { ev.preventDefault(); for (const ch of inp.value) fn(ch); fn('enter'); }
            });
            container.appendChild(inp);
            setTimeout(() => { try { inp.focus(); } catch (_) {} }, 0);
        }

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

                if (item.level !== undefined && item.level !== null) {
                    const lvlEl = document.createElement('span');
                    lvlEl.className = 'prompt-mirror-item-lvl';
                    lvlEl.textContent = `L${item.level}`;
                    row.appendChild(lvlEl);
                }
                if (item.cost !== undefined) {
                    const costEl = document.createElement('span');
                    costEl.className = 'prompt-mirror-item-cost';
                    costEl.textContent = `${item.cost}mp`;
                    row.appendChild(costEl);
                }
                if (item.fail !== undefined && item.fail !== null) {
                    const failNum = Number(item.fail);
                    if (Number.isFinite(failNum)) {
                        const failEl = document.createElement('span');
                        failEl.className = `prompt-mirror-item-fail ${failNum <= 5 ? 'fail-low' : (failNum <= 25 ? 'fail-med' : 'fail-high')}`;
                        failEl.style.color = failNum <= 5 ? '#4ade80' : (failNum <= 25 ? '#fbbf24' : '#f87171');
                        failEl.style.marginLeft = '6px';
                        failEl.textContent = `${failNum}%`;
                        row.appendChild(failEl);
                    }
                }
                if (item.info) {
                    const infoEl = document.createElement('span');
                    infoEl.className = 'prompt-mirror-item-info';
                    infoEl.textContent = item.info;
                    row.appendChild(infoEl);
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
        const c = container || (typeof document !== 'undefined' ? (document.getElementById('prompt-mirror') || document.getElementById('prompt-mirror-container')) : null);
        if (c) {
            c.hidden = true;
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

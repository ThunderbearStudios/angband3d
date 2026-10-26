/**
 * command-palette.js — Searchable Command Palette & Action Catalog Drawer
 *
 * WS42 Command & Menu Unification (Cards WS42.4B/WS42.5C, §6.8 #4, §8, §16.4).
 * 100% sourced from ActionCatalog for the active realm (>= 40 Vanilla commands, all realms).
 * Supports category tabs, fuzzy search, recency ranking, classic key badges, cmd_avail gating,
 * key-echo tip chips, and Dispatcher execution.
 *
 * UMD: browser -> window.CommandPalette; Node -> module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CommandPalette = factory();
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

    const ICONS = Object.freeze({
        sword: '⚔️', shield: '🛡️', drop: '📦', trash: '🗑️', potion: '🧪', scroll: '📜',
        food: '🍖', wand: '🪄', staff: '🦯', rod: '⚡', activate: '⚡', use: '✨',
        bow: '🏹', throw: '🎯', inscribe: '✍️', lamp: '🔦', inspect: '🔍', magic: '✨',
        book: '📖', study: '✨', tree: '🌳', pickaxe: '⛏️', 'door-open': '🔑', 'door-closed': '🚪',
        trap: '🖐️', alter: '💥', rest: '⏳', pickup: '💎', hold: '⏸️', walk: '🚶',
        run: '🏃', compass: '🧭', 'stairs-up': '⬆️', 'stairs-down': '⬇️', repeat: '🔁',
        pack: '🎒', quiver: '🏹', eye: '👁️', target: '🎯', map: '🗺️', locate: '📍',
        character: '👤', 'scroll-knowledge': '📚', chat: '💬', save: '💾', gear: '⚙️'
    });

    function escapeHtml(str) {
        return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
    }
    function normalizeCategory(cat) {
        if (!cat) return 'all';
        const lower = String(cat).toLowerCase().trim();
        if (lower === 'items' || lower === 'item') return 'items';
        if (lower === 'magic' || lower === 'spells') return 'magic';
        if (lower === 'action' || lower === 'tactical' || lower === 'exploration') return 'action';
        if (lower === 'info' || lower === 'manage' || lower === 'system') return 'info';
        return lower;
    }

    const _recentIds = [];

    function recordRecent(id) {
        if (!id) return;
        const idx = _recentIds.indexOf(id);
        if (idx !== -1) _recentIds.splice(idx, 1);
        _recentIds.unshift(id);
        if (_recentIds.length > 25) _recentIds.pop();
    }
    function getRecentCommands() {
        return _recentIds.slice();
    }

    function listForRealm(realmKey, lang) {
        const r = (realmKey || 'angband').toLowerCase();
        const catalog = getActionCatalog();
        if (!catalog || typeof catalog.listForRealm !== 'function') return [];

        const isJp = (r === 'hengband') && (lang === 'jp' || (typeof window !== 'undefined' && window.__langMode === 'jp'));
        const rawList = catalog.listForRealm(r);

        return rawList.map((entry) => {
            const key = (entry.keys && entry.keys[r] !== undefined && entry.keys[r] !== null) ? entry.keys[r] : entry.key;
            const keyDisplay = (key === ' ' || key === 'space') ? 'Space' : (key === 'tab' ? 'Tab' : String(key || ''));
            const name = (isJp && entry.labels && entry.labels.jp) ? entry.labels.jp : ((entry.labels && entry.labels.en) || entry.name || entry.id);
            const desc = (isJp && entry.labels && entry.labels.jp && entry.labels.en) ? `${entry.labels.jp} (${entry.labels.en})` : (entry.desc || (entry.labels && entry.labels.en) || '');
            const available = (catalog && typeof catalog.isAvailable === 'function') ? catalog.isAvailable(entry.id) : true;
            const normalizedGroup = entry.group || 'action';

            return {
                id: entry.id,
                cat: normalizeCategory(normalizedGroup),
                group: normalizedGroup,
                icon: (entry.icon && ICONS[entry.icon]) || '⚔️',
                name,
                label: name,
                labels: entry.labels || { en: name },
                desc,
                key,
                keyDisplay,
                synonyms: Array.isArray(entry.synonyms) ? entry.synonyms : [],
                badge: (r !== 'angband' && entry.badge) ? entry.badge : '',
                available,
                atomic: Boolean(entry.atomic),
                needsIdle: entry.needsIdle !== false
            };
        });
    }

    let activeCmdCategory = 'all';
    let cmdPaletteFilter = '';
    let selectedCmdIndex = 0;
    let cmdPalettePreviousState = 'game';
    let keyEchoTimer = null;

    function showKeyEchoChip(key) {
        if (typeof document === 'undefined') return;
        let chip = document.getElementById('key-echo-chip');
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'key-echo-chip';
            chip.className = 'key-echo-chip';
            chip.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);border:1px solid rgba(212,175,55,0.6);color:#f8fafc;padding:6px 14px;border-radius:16px;font-size:13px;z-index:99999;pointer-events:none;transition:opacity 0.2s ease;';
            document.body.appendChild(chip);
        }
        chip.innerHTML = `Tip: press <kbd style="background:#1e293b;border:1px solid #475569;border-radius:4px;padding:1px 5px;font-weight:bold;color:#ffd700;">${escapeHtml(key)}</kbd>`;
        chip.style.opacity = '1';
        if (keyEchoTimer) clearTimeout(keyEchoTimer);
        keyEchoTimer = setTimeout(() => { if (chip) chip.style.opacity = '0'; }, 1200);
    }

    const TACTICAL_IDS = new Set(['attack', 'fire', 'throw', 'aim', 'zap', 'activate', 'target', 'look', 'run', 'walk', 'hold', 'repeat']);
    function filterCommands(commands, category, filterText, recents) {
        const rawCat = String(category || 'all').toLowerCase().trim(), normCat = normalizeCategory(category);
        const filter = (filterText || '').toLowerCase().trim(), recentList = recents || _recentIds;
        const matches = commands.filter((cmd) => {
            const cmdCat = normalizeCategory(cmd.cat || cmd.group);
            let matchesCat = normCat === 'all' || cmdCat === normCat;
            if (matchesCat && rawCat === 'tactical') matchesCat = TACTICAL_IDS.has(cmd.id);
            else if (matchesCat && rawCat === 'exploration') matchesCat = !TACTICAL_IDS.has(cmd.id);
            if (!matchesCat) return false;
            if (!filter) return true;

            return (cmd.name && cmd.name.toLowerCase().includes(filter)) ||
                (cmd.labels && cmd.labels.en && cmd.labels.en.toLowerCase().includes(filter)) ||
                (cmd.labels && cmd.labels.jp && cmd.labels.jp.toLowerCase().includes(filter)) ||
                (cmd.id && cmd.id.toLowerCase().includes(filter)) ||
                (cmd.desc && cmd.desc.toLowerCase().includes(filter)) ||
                (cmd.keyDisplay && cmd.keyDisplay.toLowerCase().includes(filter)) ||
                (cmd.key && cmd.key.toLowerCase().includes(filter)) ||
                (Array.isArray(cmd.synonyms) && cmd.synonyms.some((s) => s.toLowerCase().includes(filter))) ||
                (cmd.badge && cmd.badge.toLowerCase().includes(filter));
        });

        return matches.slice().sort((a, b) => {
            const aIdx = recentList.indexOf(a.id);
            const bIdx = recentList.indexOf(b.id);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            if (filter) {
                const aEx = a.id === filter || a.key === filter || (a.name && a.name.toLowerCase() === filter);
                const bEx = b.id === filter || b.key === filter || (b.name && b.name.toLowerCase() === filter);
                if (aEx && !bEx) return -1;
                if (!aEx && bEx) return 1;
            }
            return 0;
        });
    }

    function renderCommandPalette() {
        if (typeof document === 'undefined') return;
        const list = document.getElementById('cmd-palette-list');
        if (!list) return;

        const app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
        const wasdOn = Boolean(app && app.input && app.input.wasdMode);
        const wasdPill = document.getElementById('btn-cmd-wasd-toggle');
        if (wasdPill) { wasdPill.classList.toggle('wasd-active', wasdOn); wasdPill.textContent = wasdOn ? '⌨ WASD: ON [Alt+W]' : '⌨ Keys: Classic [Alt+W]'; }
        const curRealm = (app && typeof app.getActiveRealm === 'function' ? app.getActiveRealm() : (window.activeRealm || 'angband'));
        const curLang = (typeof window !== 'undefined' && window.__langMode) || 'en';
        const items = filterCommands(listForRealm(curRealm, curLang), activeCmdCategory, cmdPaletteFilter, _recentIds);
        if (selectedCmdIndex >= items.length) selectedCmdIndex = Math.max(0, items.length - 1);

        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:#64748b;font-size:14px;">No matching commands found.</div>';
            return;
        }

        const frag = document.createDocumentFragment();
        items.forEach((cmd, idx) => {
            const row = document.createElement('div');
            const isAvail = cmd.available !== false;
            const isWasdKey = wasdOn && (cmd.key === 'w' || cmd.key === 'a' || cmd.key === 's' || cmd.key === 'd');
            row.className = `cmd-row ${idx === selectedCmdIndex ? 'selected' : ''} ${!isAvail ? 'cmd-unavailable' : ''}`;
            row.style.minHeight = '44px';
            if (!isAvail) row.style.opacity = '0.45';
            const badgeHtml = (cmd.badge ? `<span class="cmd-badge">${escapeHtml(cmd.badge)}</span>` : '') + (isWasdKey ? `<span class="cmd-badge" style="background:rgba(245,158,11,0.22);border:1px solid #f59e0b;color:#fde68a;">WASD Key</span>` : '');
            row.innerHTML = `<div class="cmd-row-left"><span class="cmd-row-icon">${escapeHtml(cmd.icon)}</span><div class="cmd-row-text"><span class="cmd-row-name">${escapeHtml(cmd.name)} ${badgeHtml}</span><span class="cmd-row-desc">${escapeHtml(cmd.desc)}</span></div></div><div class="cmd-row-right"><kbd class="cmd-kbd">${escapeHtml(cmd.keyDisplay)}</kbd></div>`;
            row.addEventListener('click', () => executePaletteCommand(cmd));
            frag.appendChild(row);
        });
        list.appendChild(frag);
    }

    function executePaletteCommand(cmd) {
        if (!cmd) return;
        recordRecent(cmd.id);
        hideCommandPalette();
        const app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;

        if (app && app.dispatcher && typeof app.dispatcher.run === 'function') {
            app.dispatcher.run({ verb: cmd.id, key: cmd.key });
        } else if (app && app.network && typeof app.network.sendKey === 'function') {
            app.network.sendKey(cmd.key);
        } else if (typeof window !== 'undefined' && window.network && typeof window.network.sendKey === 'function') {
            window.network.sendKey(cmd.key);
        }

        if (cmd.keyDisplay || cmd.key) showKeyEchoChip(cmd.keyDisplay || cmd.key);
    }

    function showCommandPalette(fromState = 'game') {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('command-palette-modal');
        cmdPalettePreviousState = fromState;
        if (typeof window !== 'undefined' && window.__app) { window.__app.appState = 'cmdPaletteModal'; if (window.__app.setAppState) window.__app.setAppState('cmdPaletteModal'); }
        cmdPaletteFilter = '';
        selectedCmdIndex = 0;
        const inputEl = document.getElementById('cmd-search-input');
        if (inputEl) { inputEl.value = ''; setTimeout(() => inputEl.focus(), 50); }
        renderCommandPalette();
        if (modal) modal.classList.remove('hidden');
        const audio = (typeof window !== 'undefined' && window.__app && window.__app.audio) ? window.__app.audio : (window.audio || null);
        if (audio && typeof audio.playMenuOpen === 'function') audio.playMenuOpen();
    }

    function hideCommandPalette() {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('command-palette-modal');
        if (modal) modal.classList.add('hidden');
        const audio = (typeof window !== 'undefined' && window.__app && window.__app.audio) ? window.__app.audio : (window.audio || null);
        if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();

        const app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
        if (cmdPalettePreviousState === 'splash' && app && typeof app.showSplash === 'function') app.showSplash();
        else if (cmdPalettePreviousState === 'mainMenu' && app && typeof app.showMainMenu === 'function') app.showMainMenu();
        else if (cmdPalettePreviousState === 'pauseMenu' && app && typeof app.showPauseMenu === 'function') app.showPauseMenu();
        else if (app) { app.appState = cmdPalettePreviousState || 'game'; if (app.setAppState) app.setAppState(cmdPalettePreviousState || 'game'); }
    }

    function setupCommandPaletteEvents() {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('command-palette-modal');
        const btnClose = document.getElementById('btn-cmd-palette-close');
        if (btnClose) btnClose.addEventListener('click', () => hideCommandPalette());
        const wasdPill = document.getElementById('btn-cmd-wasd-toggle');
        if (wasdPill) wasdPill.addEventListener('click', () => { if (window.__app && window.__app.input && window.__app.input.toggleWasdMode) { window.__app.input.toggleWasdMode(); renderCommandPalette(); } });
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideCommandPalette();
            });
        }

        const inputEl = document.getElementById('cmd-search-input');
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                cmdPaletteFilter = e.target.value;
                selectedCmdIndex = 0;
                renderCommandPalette();
            });

            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    hideCommandPalette();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
                    const curRealm = (app && typeof app.getActiveRealm === 'function' ? app.getActiveRealm() : (window.activeRealm || 'angband'));
                    const curLang = (typeof window !== 'undefined' && window.__langMode) || 'en';
                    const items = filterCommands(listForRealm(curRealm, curLang), activeCmdCategory, cmdPaletteFilter, _recentIds);
                    if (items.length > 0) executePaletteCommand(items[selectedCmdIndex] || items[0]);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedCmdIndex++;
                    renderCommandPalette();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedCmdIndex > 0) selectedCmdIndex--;
                    renderCommandPalette();
                }
            });
        }

        const catPills = document.querySelectorAll('.cmd-cat-pill');
        catPills.forEach((pill) => {
            pill.addEventListener('click', () => {
                catPills.forEach((p) => p.classList.remove('active'));
                pill.classList.add('active');
                activeCmdCategory = pill.dataset.cat || 'all';
                selectedCmdIndex = 0;
                renderCommandPalette();
            });
        });
    }

    return Object.freeze({
        listForRealm,
        getCommandsForRealm: listForRealm,
        filterCommands,
        recordRecent,
        getRecentCommands,
        render: renderCommandPalette,
        execute: executePaletteCommand,
        show: showCommandPalette,
        hide: hideCommandPalette,
        setupEvents: setupCommandPaletteEvents,
        showKeyEchoChip
    });
});

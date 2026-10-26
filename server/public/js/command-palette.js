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
        food: '🍖', wand: '🪄', staff: '🦯', rod: '⚡', activate: '⚡', use: '✨', horn: '📯',
        bow: '🏹', throw: '🎯', inscribe: '✍️', uninscribe: '🧹', lamp: '🔦', inspect: '🔍',
        magic: '✨', book: '📖', study: '✨', music: '🎵', tree: '🌳', anvil: '⚒️',
        power: '🔮', pet: '🐾', pickaxe: '⛏️', 'door-open': '🔑', 'door-closed': '🚪',
        'shield-bash': '🛡️', spike: '🔩', trap: '🖐️', alter: '💥', exchange: '🔄',
        steal: '🗡️', rest: '⏳', pickup: '💎', hold: '⏸️', walk: '🚶', search: '🔍',
        run: '🏃', compass: '🧭', path: '🛤️', 'stairs-up': '⬆️', 'stairs-down': '⬇️',
        repeat: '🔁', counter: '🔢', pack: '🎒', quiver: '🏹', eye: '👁️', target: '🎯',
        map: '🗺️', locate: '📍', character: '👤', 'scroll-knowledge': '📚', chat: '💬',
        save: '💾', gear: '⚙️', question: '❓', menu: '📖', 'world-map': '🗺️', quest: '📜'
    });

    const SVG_GLYPHS = Object.freeze({
        sword: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/></svg>',
        shield: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        potion: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 3h6M10 3v5l-5 8a3 3 0 0 0 2.5 4.5h9A3 3 0 0 0 19 16l-5-8V3M7 14h10"/></svg>',
        scroll: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 3h9a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h10a3 3 0 0 1 0 6H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/></svg>',
        food: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M15 4c3 0 5 2 5 5 0 4-4 7-8 7-2 0-4-1-5-3l-3 3-2-2 3-3c-2-1-3-3-3-5 0-4 3-8 7-8"/></svg>',
        magic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>',
        book: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>',
        study: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zM4 19h16"/></svg>',
        pack: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="5" y="7" width="14" height="14" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2M5 12h14"/></svg>',
        rest: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 2h12v4l-4 6 4 6v4H6v-4l4-6-4-6V2z"/></svg>'
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

    function listForRealm(realmKey, lang, frame) {
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
            let available = (catalog && typeof catalog.isAvailable === 'function') ? catalog.isAvailable(entry.id) : true;
            let suggested = false;
            let badge = (r !== 'angband' && entry.badge) ? entry.badge : '';
            let itemSample = null;
            if (frame && frame.phase === 'play' && catalog && typeof catalog.evaluateActionAvailability === 'function') {
                const evalRes = catalog.evaluateActionAvailability(entry.id, frame, r);
                available = evalRes.available;
                suggested = Boolean(evalRes.suggested);
                if (evalRes.badge) badge = evalRes.badge;
                itemSample = evalRes.itemSample || null;
            }
            const normalizedGroup = entry.group || 'action';
            return {
                id: entry.id, cat: normalizeCategory(normalizedGroup), group: normalizedGroup,
                iconKey: entry.icon || 'sword', icon: (entry.icon && ICONS[entry.icon]) || '⚔️',
                name, label: name, labels: entry.labels || { en: name }, desc, key, keyDisplay,
                synonyms: Array.isArray(entry.synonyms) ? entry.synonyms : [],
                badge, available, suggested, itemSample,
                atomic: Boolean(entry.atomic), needsIdle: entry.needsIdle !== false
            };
        });
    }

    let activeCmdCategory = 'all', cmdPaletteFilter = '', selectedCmdIndex = 0, cmdPalettePreviousState = 'game', keyEchoTimer = null;

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
            if (Boolean(a.suggested) !== Boolean(b.suggested)) return a.suggested ? -1 : 1;
            const aIdx = recentList.indexOf(a.id), bIdx = recentList.indexOf(b.id);
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
        const curRealm = (app && typeof app.getActiveRealm === 'function' ? app.getActiveRealm() : (window.activeRealm || 'angband'));
        const curLang = (typeof window !== 'undefined' && window.__langMode) || 'en';
        const liveFrame = (app && app.lastFrame && app.lastFrame.phase === 'play') ? app.lastFrame : null;
        const rawCommands = listForRealm(curRealm, curLang, liveFrame);
        const availCommands = liveFrame ? rawCommands.filter((c) => c.available !== false) : rawCommands;
        const items = filterCommands(availCommands, activeCmdCategory, cmdPaletteFilter, _recentIds);
        if (selectedCmdIndex >= items.length) selectedCmdIndex = Math.max(0, items.length - 1);
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:14px;">No currently available actions match this filter.</div>';
            return;
        }
        const frag = document.createDocumentFragment();
        items.forEach((cmd, idx) => {
            const row = document.createElement('div');
            const isAvail = cmd.available !== false, isSuggested = Boolean(cmd.suggested);
            const isWasdKey = wasdOn && (cmd.key === 'w' || cmd.key === 'a' || cmd.key === 's' || cmd.key === 'd');
            row.className = `cmd-row ${idx === selectedCmdIndex ? 'selected' : ''} ${!isAvail ? 'cmd-unavailable' : ''} ${isSuggested ? 'is-suggested' : ''}`.trim();
            row.style.minHeight = '44px';
            if (!isAvail) row.style.opacity = '0.45';
            const badgeHtml = (cmd.badge ? `<span class="cmd-badge ${isSuggested ? 'cmd-badge-suggested' : ''}">${escapeHtml(cmd.badge)}</span>` : '') + (isWasdKey ? `<span class="cmd-badge cmd-badge-wasd">Shift+${escapeHtml(cmd.key.toUpperCase())}</span>` : '');
            let iconHtml = SVG_GLYPHS[cmd.iconKey] || escapeHtml(cmd.icon);
            if (cmd.itemSample && app && typeof app.getShockboltSpriteStyle === 'function') {
                const spStyle = app.getShockboltSpriteStyle(cmd.itemSample);
                if (spStyle) iconHtml = `<span class="shockbolt-icon" style="${spStyle}"></span>`;
            }
            row.innerHTML = `<div class="cmd-row-left"><span class="cmd-row-icon">${iconHtml}</span><div class="cmd-row-text"><span class="cmd-row-name">${escapeHtml(cmd.name)} ${badgeHtml}</span><span class="cmd-row-desc">${escapeHtml(cmd.desc)}</span></div></div><div class="cmd-row-right"><kbd class="cmd-kbd">${escapeHtml(cmd.keyDisplay)}</kbd></div>`;
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
        if (app && app.dispatcher && typeof app.dispatcher.run === 'function') app.dispatcher.run({ verb: cmd.id, key: cmd.key });
        else if (app && app.network && typeof app.network.sendKey === 'function') app.network.sendKey(cmd.key);
        else if (typeof window !== 'undefined' && window.network && typeof window.network.sendKey === 'function') window.network.sendKey(cmd.key);
        if (cmd.keyDisplay || cmd.key) showKeyEchoChip(cmd.keyDisplay || cmd.key);
    }

    function showCommandPalette(fromState = 'game') {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('command-palette-modal');
        cmdPalettePreviousState = fromState;
        if (typeof window !== 'undefined' && window.__app) { window.__app.appState = 'cmdPaletteModal'; if (window.__app.setAppState) window.__app.setAppState('cmdPaletteModal'); }
        cmdPaletteFilter = ''; selectedCmdIndex = 0;
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
        const modal = document.getElementById('command-palette-modal'), btnClose = document.getElementById('btn-cmd-palette-close');
        if (btnClose) btnClose.addEventListener('click', () => hideCommandPalette());
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) hideCommandPalette(); });
        const inputEl = document.getElementById('cmd-search-input');
        if (inputEl) {
            inputEl.addEventListener('input', (e) => { cmdPaletteFilter = e.target.value; selectedCmdIndex = 0; renderCommandPalette(); });
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { e.preventDefault(); hideCommandPalette(); }
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    const app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
                    const curRealm = (app && typeof app.getActiveRealm === 'function' ? app.getActiveRealm() : (window.activeRealm || 'angband'));
                    const curLang = (typeof window !== 'undefined' && window.__langMode) || 'en';
                    const liveFrame = (app && app.lastFrame && app.lastFrame.phase === 'play') ? app.lastFrame : null;
                    const rawCommands = listForRealm(curRealm, curLang, liveFrame);
                    const availCommands = liveFrame ? rawCommands.filter((c) => c.available !== false) : rawCommands;
                    const items = filterCommands(availCommands, activeCmdCategory, cmdPaletteFilter, _recentIds);
                    if (items.length > 0) executePaletteCommand(items[selectedCmdIndex] || items[0]);
                } else if (e.key === 'ArrowDown') { e.preventDefault(); selectedCmdIndex++; renderCommandPalette(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); if (selectedCmdIndex > 0) selectedCmdIndex--; renderCommandPalette(); }
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
        listForRealm, getCommandsForRealm: listForRealm, filterCommands, recordRecent, getRecentCommands,
        render: renderCommandPalette, execute: executePaletteCommand, show: showCommandPalette, hide: hideCommandPalette,
        setupEvents: setupCommandPaletteEvents, showKeyEchoChip
    });
});

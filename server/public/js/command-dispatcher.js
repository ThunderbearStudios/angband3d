(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(); } else {
        root.CommandDispatcher = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    let ScreenContextModule = null;
    let RealmKeysModule = null;
    let QuickActionsModule = null;
    let ActionCatalogModule = null;
    let RealmCartridgeModule = null;
    let MenuRouterModule = null;
    if (typeof require === 'function') {
        try { ScreenContextModule = require('./screen-context'); } catch (_) {}
        try { RealmKeysModule = require('./realm-keys'); } catch (_) {}
        try { QuickActionsModule = require('./quick-actions'); } catch (_) {}
        try { ActionCatalogModule = require('./action-catalog'); } catch (_) {}
        try { RealmCartridgeModule = require('./realm-cartridge'); } catch (_) {}
        try { MenuRouterModule = require('./menu-router'); } catch (_) {}
    }
    const CANONICAL_REALMS = new Set(['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod']);
    const VANILLA_LETTERS = 'abcdefgimnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function getVanillaLetter(i) {
        if (typeof i !== 'number' || i < 0) return 'a';
        return VANILLA_LETTERS[i] || String.fromCharCode(97 + i);
    }
    function normalizeKey(key) {
        if (typeof key !== 'string') return '';
        if (key === '\t') return 'tab';
        if (key === ' ' || key.toLowerCase() === 'space') return 'space';
        if (key.length === 1) return key;
        const lower = key.trim().toLowerCase();
        if (/^#[a-z]{1,20}$/i.test(lower)) return lower;
        const map = {
            'escape': 'escape', 'esc': 'escape',
            'enter': 'enter', 'return': 'enter',
            'tab': 'tab',
            'space': 'space',
            'backspace': 'backspace',
            'delete': 'delete',
            'arrowleft': 'left', 'left': 'left',
            'arrowright': 'right', 'right': 'right',
            'arrowup': 'up', 'up': 'up',
            'arrowdown': 'down', 'down': 'down',
            'home': 'home',
            'end': 'end',
            'pageup': 'pageup',
            'pagedown': 'pagedown'
        };
        return map[lower] || key;
    }
    const CANONICAL_KEYS = Object.freeze({
        quaff: Object.freeze({ angband: 'q', silq: 'q', frogcomposband: 'q', hengband: 'q', nethack: 'q', dcss: 'q', brogue: 'q', rogue: 'q', ryod: 'q' }),
        read: Object.freeze({ angband: 'r', silq: null, frogcomposband: 'r', hengband: 'r', nethack: 'r', dcss: 'r', brogue: 'r', rogue: 'r', ryod: 'r' }),
        eat: Object.freeze({ angband: 'E', silq: 'E', frogcomposband: 'E', hengband: 'E', nethack: 'e', dcss: 'e', brogue: 'E', rogue: 'e', ryod: 'E' }),
        wield: Object.freeze({ angband: 'w', silq: 'w', frogcomposband: 'w', hengband: 'w', nethack: 'w', dcss: 'w', brogue: 'w', rogue: 'w', ryod: 'w' }),
        wear: Object.freeze({ angband: 'w', silq: 'w', frogcomposband: 'w', hengband: 'w', nethack: 'W', dcss: 'W', brogue: 'w', rogue: 'W', ryod: 'W' }),
        puton: Object.freeze({ angband: 'w', silq: 'w', frogcomposband: 'w', hengband: 'w', nethack: 'P', dcss: 'P', brogue: 'w', rogue: 'P', ryod: 'P' }),
        takeoff: Object.freeze({ angband: 't', silq: 'r', frogcomposband: 't', hengband: 't', nethack: 'T', dcss: 'T', brogue: 'T', rogue: 'T', ryod: 'T' }),
        remove: Object.freeze({ angband: 't', silq: 'r', frogcomposband: 't', hengband: 't', nethack: 'R', dcss: 'R', brogue: 'T', rogue: 'R', ryod: 'R' }),
        drop: Object.freeze({ angband: 'd', silq: 'd', frogcomposband: 'd', hengband: 'd', nethack: 'd', dcss: 'd', brogue: 'd', rogue: 'd', ryod: 'd' }),
        aim: Object.freeze({ angband: 'a', silq: null, frogcomposband: 'a', hengband: 'a', nethack: 'z', dcss: 'V', brogue: 'a', rogue: 'z', ryod: 'a' }),
        use_staff: Object.freeze({ angband: 'u', silq: 'a', frogcomposband: 'u', hengband: 'u', nethack: 'a', dcss: 'V', brogue: 'a', rogue: 'z', ryod: 'a' }),
        zap: Object.freeze({ angband: 'z', silq: null, frogcomposband: 'z', hengband: 'z', nethack: 'z', dcss: 'V', brogue: 'a', rogue: 'z', ryod: 'a' }),
        activate: Object.freeze({ angband: 'A', silq: 'p', frogcomposband: 'A', hengband: 'A', nethack: 'a', dcss: 'a', brogue: 'a', rogue: 'z', ryod: 'a' }),
        use: Object.freeze({ angband: 'U', silq: 'u', frogcomposband: null, hengband: null, nethack: 'a', dcss: 'a', brogue: 'a', rogue: 'z', ryod: 'a' }),
        play_horn: Object.freeze({ angband: null, silq: 'p', frogcomposband: null, hengband: null, nethack: 'a', dcss: 'V', brogue: null, rogue: null, ryod: 'a' }),
        throw: Object.freeze({ angband: 'v', silq: 't', frogcomposband: 'v', hengband: 'v', nethack: 't', dcss: 'f', brogue: 't', rogue: 't', ryod: 't' }),
        fire: Object.freeze({ angband: 'f', silq: 'f', frogcomposband: 'f', hengband: 'f', nethack: 'f', dcss: 'f', brogue: 't', rogue: 't', ryod: 'f' }),
        examine: Object.freeze({ angband: 'I', silq: 'x', frogcomposband: 'I', hengband: 'I', nethack: ':', dcss: 'v', brogue: 'x', rogue: 'I', ryod: 'I' }),
        ignore: Object.freeze({ angband: 'k', silq: 'k', frogcomposband: 'k', hengband: 'k', nethack: null, dcss: null, brogue: null, rogue: null, ryod: null }),
        inscribe: Object.freeze({ angband: '{', silq: '{', frogcomposband: '{', hengband: '{', nethack: '{', dcss: '{', brogue: '{', rogue: '{', ryod: '{' }),
        uninscribe: Object.freeze({ angband: '}', silq: null, frogcomposband: '}', hengband: '}', nethack: '}', dcss: '}', brogue: '}', rogue: '}', ryod: '}' }),
        refill: Object.freeze({ angband: 'F', silq: null, frogcomposband: 'F', hengband: 'F', nethack: 'a', dcss: null, brogue: null, rogue: null, ryod: null }),
        cast: Object.freeze({ angband: 'm', silq: null, frogcomposband: 'm', hengband: 'm', nethack: 'Z', dcss: 'z', brogue: null, rogue: null, ryod: 'm' }),
        browse: Object.freeze({ angband: 'b', silq: null, frogcomposband: 'b', hengband: 'b', nethack: 'r', dcss: 'I', brogue: null, rogue: null, ryod: 'M' }),
        study: Object.freeze({ angband: 'G', silq: null, frogcomposband: 'G', hengband: 'G', nethack: 'r', dcss: 'M', brogue: null, rogue: null, ryod: 'M' }),
        song: Object.freeze({ angband: null, silq: 's', frogcomposband: null, hengband: null, nethack: null, dcss: null, brogue: null, rogue: null, ryod: 'm' }),
        abilities: Object.freeze({ angband: null, silq: 'tab', frogcomposband: null, hengband: null, nethack: 'C', dcss: 'm', brogue: null, rogue: null, ryod: 'm' }),
        skills: Object.freeze({ angband: null, silq: 'tab', frogcomposband: null, hengband: null, nethack: null, dcss: 'm', brogue: null, rogue: null, ryod: 'm' }),
        smithing: Object.freeze({ angband: null, silq: '0', frogcomposband: null, hengband: null, nethack: null, dcss: null, brogue: null, rogue: null, ryod: null }),
        power: Object.freeze({ angband: null, silq: null, frogcomposband: 'U', hengband: 'U', nethack: '#', dcss: 'a', brogue: null, rogue: null, ryod: 'm' }),
        pet: Object.freeze({ angband: null, silq: null, frogcomposband: 'p', hengband: 'p', nethack: 'C', dcss: null, brogue: null, rogue: null, ryod: 'p' }),
        rest: Object.freeze({ angband: 'R', silq: '%', frogcomposband: 'R', hengband: 'R', nethack: '.', dcss: '5', brogue: 'z', rogue: '.', ryod: '.' }),
        open: Object.freeze({ angband: 'o', silq: 'o', frogcomposband: 'o', hengband: 'o', nethack: 'o', dcss: 'O', brogue: 'o', rogue: 'o', ryod: 'o' }),
        close: Object.freeze({ angband: 'c', silq: 'c', frogcomposband: 'c', hengband: 'c', nethack: 'c', dcss: 'c', brogue: 'c', rogue: 'c', ryod: 'c' }),
        bash: Object.freeze({ angband: null, silq: 'b', frogcomposband: 'B', hengband: 'B', nethack: 'a', dcss: 'O', brogue: null, rogue: null, ryod: 'o' }),
        spike: Object.freeze({ angband: null, silq: null, frogcomposband: 'j', hengband: 'j', nethack: null, dcss: null, brogue: null, rogue: null, ryod: null }),
        disarm: Object.freeze({ angband: 'D', silq: 'D', frogcomposband: 'D', hengband: 'D', nethack: 'u', dcss: 'D', brogue: 'D', rogue: 'D', ryod: 'D' }),
        tunnel: Object.freeze({ angband: 'T', silq: 'T', frogcomposband: 'T', hengband: 'T', nethack: 'a', dcss: 'T', brogue: 'T', rogue: 'T', ryod: 'T' }),
        alter: Object.freeze({ angband: '+', silq: '/', frogcomposband: '+', hengband: '+', nethack: 'a', dcss: '+', brogue: null, rogue: null, ryod: '+' }),
        exchange: Object.freeze({ angband: null, silq: 'X', frogcomposband: null, hengband: null, nethack: 'x', dcss: "'", brogue: null, rogue: null, ryod: 'x' }),
        steal: Object.freeze({ angband: 's', silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: null, brogue: null, rogue: null, ryod: null }),
        pickup: Object.freeze({ angband: 'g', silq: 'g', frogcomposband: 'g', hengband: 'g', nethack: ',', dcss: 'g', brogue: 'g', rogue: ',', ryod: 'g' }),
        hold: Object.freeze({ angband: ',', silq: 'z', frogcomposband: ',', hengband: ',', nethack: '.', dcss: '.', brogue: '.', rogue: '.', ryod: '.' }),
        walk: Object.freeze({ angband: ';', silq: ';', frogcomposband: ';', hengband: ';', nethack: 'm', dcss: ';', brogue: ';', rogue: ';', ryod: ';' }),
        run: Object.freeze({ angband: '.', silq: '.', frogcomposband: '.', hengband: '.', nethack: 'g', dcss: '.', brogue: '.', rogue: '.', ryod: '.' }),
        search_mode: Object.freeze({ angband: null, silq: 'S', frogcomposband: 'S', hengband: 'S', nethack: 's', dcss: 's', brogue: 's', rogue: 's', ryod: 's' }),
        search: Object.freeze({ angband: null, silq: null, frogcomposband: 'S', hengband: 'S', nethack: 's', dcss: 's', brogue: 's', rogue: 's', ryod: 's' }),
        explore: Object.freeze({ angband: 'p', silq: 'Alt+E', frogcomposband: 'Alt+E', hengband: 'Alt+E', nethack: 'Alt+E', dcss: 'o', brogue: 'e', rogue: 'Alt+E', ryod: 'Alt+E' }),
        travel: Object.freeze({ angband: null, silq: null, frogcomposband: '`', hengband: '`', nethack: '_', dcss: 'G', brogue: '_', rogue: '_', ryod: '_' }),
        stairs_up: Object.freeze({ angband: '<', silq: '<', frogcomposband: '<', hengband: '<', nethack: '<', dcss: '<', brogue: '<', rogue: '<', ryod: '<' }),
        stairs_down: Object.freeze({ angband: '>', silq: '>', frogcomposband: '>', hengband: '>', nethack: '>', dcss: '>', brogue: '>', rogue: '>', ryod: '>' }),
        repeat: Object.freeze({ angband: 'n', silq: 'n', frogcomposband: 'n', hengband: 'n', nethack: 'n', dcss: '`', brogue: 'n', rogue: 'n', ryod: 'n' }),
        count: Object.freeze({ angband: '0', silq: 'R', frogcomposband: '0', hengband: '0', nethack: '0', dcss: '0', brogue: '0', rogue: '0', ryod: '0' }),
        char_sheet: Object.freeze({ angband: 'C', silq: '@', frogcomposband: 'C', hengband: 'C', nethack: 'C', dcss: '%', brogue: 'C', rogue: 'C', ryod: 'C' }),
        knowledge: Object.freeze({ angband: '~', silq: '~', frogcomposband: '~', hengband: '~', nethack: '\\', dcss: '\\', brogue: '~', rogue: '\\', ryod: '~' }),
        inven: Object.freeze({ angband: 'i', silq: 'i', frogcomposband: 'i', hengband: 'i', nethack: 'i', dcss: 'i', brogue: 'i', rogue: 'i', ryod: 'i' }),
        inventory: Object.freeze({ angband: 'i', silq: 'i', frogcomposband: 'i', hengband: 'i', nethack: 'i', dcss: 'i', brogue: 'i', rogue: 'i', ryod: 'i' }),
        equip: Object.freeze({ angband: 'e', silq: 'e', frogcomposband: 'e', hengband: 'e', nethack: '[', dcss: 'E', brogue: '[', rogue: 'E', ryod: 'e' }),
        equipment: Object.freeze({ angband: 'e', silq: 'e', frogcomposband: 'e', hengband: 'e', nethack: '[', dcss: 'E', brogue: '[', rogue: 'E', ryod: 'e' }),
        quiver: Object.freeze({ angband: '|', silq: null, frogcomposband: null, hengband: null, nethack: 'Q', dcss: 'Q', brogue: null, rogue: null, ryod: 'Q' }),
        look: Object.freeze({ angband: 'l', silq: 'l', frogcomposband: 'l', hengband: 'l', nethack: ';', dcss: 'x', brogue: 'x', rogue: ';', ryod: 'x' }),
        target: Object.freeze({ angband: '*', silq: null, frogcomposband: '*', hengband: '*', nethack: ';', dcss: 'x', brogue: 'x', rogue: ';', ryod: 'x' }),
        map: Object.freeze({ angband: 'M', silq: 'M', frogcomposband: 'M', hengband: 'M', nethack: 'M', dcss: 'X', brogue: 'M', rogue: 'M', ryod: 'M' }),
        locate: Object.freeze({ angband: 'L', silq: 'L', frogcomposband: 'L', hengband: 'L', nethack: '@', dcss: '@', brogue: 'L', rogue: '@', ryod: '@' }),
        messages: Object.freeze({ angband: 'C-p', silq: 'C-p', frogcomposband: 'C-p', hengband: 'C-p', nethack: 'C-p', dcss: 'C-p', brogue: 'C-p', rogue: 'C-p', ryod: 'C-p' }),
        save: Object.freeze({ angband: 'C-s', silq: 'C-s', frogcomposband: 'C-s', hengband: 'C-s', nethack: 'S', dcss: 'S', brogue: 'S', rogue: 'S', ryod: 'S' }),
        options: Object.freeze({ angband: '=', silq: 'O', frogcomposband: '=', hengband: '=', nethack: 'O', dcss: '=', brogue: '=', rogue: '=', ryod: '=' }),
        help: Object.freeze({ nethack: '?', dcss: '?', angband: '?', brogue: '?', rogue: '?', silq: '?', frogcomposband: '?', hengband: '?', ryod: '?' }),
        pray: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: '#pray', dcss: 'p', brogue: null, rogue: null, ryod: 'p' }),
        offer: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: '#offer', dcss: null, brogue: null, rogue: null, ryod: null }),
        dip: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: '#dip', dcss: null, brogue: null, rogue: null, ryod: null }),
        chat: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: '#chat', dcss: null, brogue: null, rogue: null, ryod: null }),
        loot: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: '#loot', dcss: null, brogue: null, rogue: null, ryod: null }),
        force: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: '#force', dcss: null, brogue: null, rogue: null, ryod: null }),
        kick: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: 'C-d', dcss: null, brogue: null, rogue: null, ryod: null }),
        smith: Object.freeze({ angband: null, silq: '0', frogcomposband: null, hengband: null, nethack: null, dcss: null, brogue: null, rogue: null, ryod: '0' }),
        engrave: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: 'E', dcss: null, brogue: null, rogue: null, ryod: null }),
        discoveries: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: null, brogue: 'D', rogue: 'D', ryod: null }),
        id_trap: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: null, brogue: null, rogue: '^', ryod: null }),
        god: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: '^', brogue: null, rogue: null, ryod: null }),
        mutations: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: 'A', brogue: null, rogue: null, ryod: null }),
        autofight: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: 'tab', brogue: null, rogue: null, ryod: null }),
        evoke: Object.freeze({ angband: null, silq: null, frogcomposband: null, hengband: null, nethack: null, dcss: 'V', brogue: null, rogue: null, ryod: null })
    });
    function resolveTargetKey(realm, target) {
        const r = (realm || 'angband').toLowerCase();
        if (target === 'nearest') {
            if (r === 'angband') return "'";
            return 't';
        }
        if (typeof target === 'string') return target;
        return 't';
    }
    function classifyFrame(frame, realm, deps) {
        if (deps && deps.ScreenModel && typeof deps.ScreenModel.of === 'function') {
            const sm = deps.ScreenModel.of(frame, realm);
            const inP = Boolean(frame && frame.phase === 'play');
            const isM = Boolean(frame && frame.ui && frame.ui.more);
            const ov = (frame && frame.ui && typeof frame.ui.overlay === 'number') ? frame.ui.overlay : 0;
            const aw = Boolean(frame && frame.ui && frame.ui.awaiting_command);
            return Object.assign({}, sm, { isIdle: Boolean(sm.owner === 'engine-idle' || (inP && ov === 0 && !isM && aw)) });
        }
        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const inPlay = Boolean(frame && frame.phase === 'play');
        const isMore = Boolean(frame && frame.ui && frame.ui.more);
        const overlay = (frame && frame.ui && typeof frame.ui.overlay === 'number') ? frame.ui.overlay : 0;
        const awaiting = Boolean(frame && frame.ui && frame.ui.awaiting_command);
        const isIdle = Boolean(inPlay && overlay === 0 && !isMore && awaiting);
        let owner = 'engine-prompt';
        if (!inPlay) {
            owner = (frame && frame.phase === 'dead') ? 'dead' : 'birth'; } else if (isIdle) {
            owner = 'engine-idle'; } else if (overlay > 0) { owner = 'engine-screen'; }
        let prompt = null;
        if (frame && frame.ui && frame.ui.prompt) {
            prompt = { ...frame.ui.prompt }; } else {
            const row0 = (frame && frame.term && frame.term.rows && frame.term.rows[0] && frame.term.rows[0].g)
                ? frame.term.rows[0].g.trim().toLowerCase()
                : '';
            const cy = (frame && frame.term && typeof frame.term.cy === 'number') ? frame.term.cy : -1;
            const cyRow = (cy >= 0 && frame.term.rows && frame.term.rows[cy] && frame.term.rows[cy].g)
                ? frame.term.rows[cy].g.trim().toLowerCase()
                : '';
            const combined = row0 + ' ' + cyRow;
            let kind = null;
            if (isMore) {
                kind = 'more'; } else if (/quaff|drink|read|wear|wield|put on|take off|remove|drop|throw|fire|shoot|destroy|identify|examine|inspect|inscribe|uninscribe|eat|activate|evoke|zap|aim|refill|fuel|use|item|choice:/i.test(combined)) {
                kind = 'item'; } else if (/target|direction|open door/i.test(combined)) {
                kind = 'direction'; } else if (/how many|count|repeat/i.test(combined)) {
                kind = 'quantity'; } else if (/\(y\/n\)/i.test(combined)) {
                kind = 'yesno'; } else if (/book/i.test(combined)) {
                kind = 'book'; } else if (/spell|songs of power|power/i.test(combined)) {
                kind = 'spell'; } else if (/rest/i.test(combined)) { kind = 'rest'; }
            prompt = { kind, text: row0, verb: null, src: 'row0' };
        }
        const items = [];
        if (frame && frame.term && Array.isArray(frame.term.rows)) {
            const itemRegex = /(?:^|\s+)([a-zA-Z0-9*])[\)\.\:\-]\s+([^\n\r]{1,70})/g;
            for (let ri = 0; ri < frame.term.rows.length; ri++) {
                const line = frame.term.rows[ri].g || '';
                itemRegex.lastIndex = 0;
                let m;
                while ((m = itemRegex.exec(line)) !== null) {
                    const key = m[1];
                    const label = (m[2] || '').trim();
                    items.push({ key, letter: key, label });
                }
            }
        }
        let legacy = null;
        if (deps && deps.ScreenContext && typeof deps.ScreenContext.classify === 'function') {
            legacy = deps.ScreenContext.classify(frame, realm); } else if (ScreenContextModule && typeof ScreenContextModule.classify === 'function') { legacy = ScreenContextModule.classify(frame, realm); }
        return {
            isIdle,
            owner,
            prompt,
            items,
            legacy: legacy || {
                isItemPrompt: prompt && prompt.kind === 'item',
                promptKind: prompt && prompt.kind === 'item' ? 'select' : null,
                isQuantityPrompt: prompt && prompt.kind === 'quantity',
                isYesNoPrompt: prompt && prompt.kind === 'yesno',
                isTargeting: prompt && prompt.kind === 'direction',
                items
            }
        };
    }
    function CommandDispatcher(deps = {}) {
        this.deps = deps;
        this.sendKey = deps.sendKey || (() => {});
        this.getRealm = deps.getRealm || (() => 'angband');
        this.getLastFrame = deps.getLastFrame || (() => null);
        this.onEvent = deps.onEvent || (() => {});
        this.onToast = deps.onToast || (() => {});
        this.onAudio = deps.onAudio || (() => {});
        this.timeoutMs = typeof deps.timeoutMs === 'number' ? deps.timeoutMs : 2000;
        this.state = 'Idle';
        this.lastResult = 'Idle';
        this.plan = null;
        this.stepIndex = 0;
        this.sentSeq = null;
        this.lastFrame = null;
        this.timer = null;
        this.unwindCount = 0;
        this.pendingIntent = null;
    }
    CommandDispatcher.create = function (deps) {
        return new CommandDispatcher(deps);
    };
    CommandDispatcher.prototype._classify = function (frame) {
        return classifyFrame(frame, this.getRealm(), this.deps);
    };
    CommandDispatcher.prototype._clearMenuRouterPending = function () {
        const mr = (this.deps && this.deps.MenuRouter) || MenuRouterModule || (typeof window !== 'undefined' ? window.MenuRouter : null);
        if (mr && typeof mr.clearPending === 'function') {
            try { mr.clearPending(); } catch (_) {}
        }
    };
    CommandDispatcher.prototype.resolveVerbKey = function (verb, realm) {
        if (!verb || typeof verb !== 'string') return null;
        const trimmed = verb.trim();
        if (!trimmed) return null;
        if (/^#[a-z]{1,20}$/i.test(trimmed)) return trimmed.toLowerCase();
        const r = (realm || this.getRealm() || 'angband').toLowerCase();
        const cart = (this.deps && this.deps.RealmCartridge) || RealmCartridgeModule || (typeof window !== 'undefined' ? window.RealmCartridge : null);
        if (!CANONICAL_REALMS.has(r) && cart && typeof cart.getVerbKey === 'function') {
            const ck = cart.getVerbKey(trimmed, r);
            if (ck !== null && ck !== undefined) return ck;
        }
        const subDistinction = (trimmed === 'wear' || trimmed === 'puton' || trimmed === 'remove' || trimmed === 'evoke');
        if (subDistinction && CANONICAL_KEYS[trimmed] && CANONICAL_KEYS[trimmed][r] !== undefined) {
            return CANONICAL_KEYS[trimmed][r];
        }
        const cat = (this.deps && this.deps.ActionCatalog) || ActionCatalogModule || (typeof window !== 'undefined' ? window.ActionCatalog : null);
        if (cat) {
            if (typeof cat.get === 'function') {
                const entry = cat.get(trimmed);
                if (entry && entry.keys && entry.keys[r] !== undefined) return entry.keys[r];
            }
            if (typeof cat.keyFor === 'function') {
                const k = cat.keyFor(trimmed, r);
                if (k !== null && k !== undefined) return k;
            }
            if (typeof cat.getKey === 'function') {
                const k = cat.getKey(trimmed, r);
                if (k !== null && k !== undefined) return k;
            }
        }
        const rk = (this.deps && this.deps.RealmKeys) || RealmKeysModule || (typeof window !== 'undefined' ? window.RealmKeys : null);
        if (rk && typeof rk.realmKey === 'function') {
            const k = rk.realmKey(trimmed, r);
            if (k !== null && k !== undefined) return k;
        }
        const mapped = CANONICAL_KEYS[trimmed];
        if (mapped && mapped[r] !== undefined) return mapped[r];
        if (cart && typeof cart.getVerbKey === 'function') {
            const ck = cart.getVerbKey(trimmed, r);
            if (ck !== undefined) return ck;
        }
        return null;
    };
    CommandDispatcher.prototype._startDeadlineTimer = function () {
        this._clearDeadlineTimer();
        this.timer = setTimeout(() => {
            if (this.state !== 'Idle') {
                const prevState = this.state;
                this.timer = null;
                this.onToast('Command timed out');
                this.onEvent('dispatcher:timeout', { state: prevState });
                this._finish('Failed', 'timeout');
            }
        }, this.timeoutMs);
        if (this.timer && typeof this.timer.unref === 'function') { this.timer.unref(); }
    };
    CommandDispatcher.prototype._clearDeadlineTimer = function () {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    };
    CommandDispatcher.prototype.cancel = function (reason = 'user-key') {
        const isModeExit = (reason === 'escape' || reason === 'mode-exit' || reason === 'exit');
        if (isModeExit) { this._clearMenuRouterPending(); }
        if (this.state === 'Idle') { return false; }
        if (reason !== 'user-key') { this._clearMenuRouterPending(); }
        this._clearDeadlineTimer();
        const prevState = this.state;
        this.state = 'Idle';
        this.lastResult = 'Cancelled';
        this.plan = null;
        this.stepIndex = 0;
        this.sentSeq = null;
        this.pendingIntent = null;
        this.onEvent('dispatcher:cancel', { reason, prevState });
        return true;
    };
    CommandDispatcher.prototype._finish = function (status, reason) {
        this._clearDeadlineTimer();
        if (reason === 'escape' || reason === 'mode-exit' || (this.plan && this.plan.some(s => s && s.send === 'escape'))) {
            this._clearMenuRouterPending();
        }
        const finalStatus = status || 'Done';
        this.lastResult = finalStatus;
        this.state = finalStatus;
        this.onEvent(`dispatcher:${finalStatus.toLowerCase()}`, { reason, stepIndex: this.stepIndex });
        this.state = 'Idle';
        this.plan = null;
        this.stepIndex = 0;
        this.sentSeq = null;
        this.pendingIntent = null;
    };
    CommandDispatcher.prototype._executeStep = function () {
        if (!this.plan || this.stepIndex >= this.plan.length) {
            this._finish('Done');
            return;
        }
        const step = this.plan[this.stepIndex];
        if (typeof step.dynamic === 'function') {
            const frame = this.lastFrame || this.getLastFrame();
            const model = this._classify(frame);
            const extraSteps = step.dynamic(model, frame);
            this.plan.splice(this.stepIndex, 1, ...(Array.isArray(extraSteps) ? extraSteps : []));
            this._executeStep();
            return;
        }
        if (typeof step.verify === 'function') {
            const frame = this.lastFrame || this.getLastFrame();
            const model = this._classify(frame);
            const check = step.verify(model, frame);
            if (check === 'handoff') {
                this._finish('Handoff', 'item-mismatch');
                return; } else if (check === false) {
                this._finish('Failed', 'verification-failed');
                return;
            }
        }
        if (!step.send) {
            this.stepIndex++;
            this._executeStep();
            return;
        }
        const key = step.send;
        this.sentSeq = (this.lastFrame && this.lastFrame.seq !== undefined) ? this.lastFrame.seq : null;
        this.state = 'Awaiting';
        this.onEvent('dispatcher:step', { stepIndex: this.stepIndex, key, desc: step.desc });
        this._startDeadlineTimer();
        this.sendKey(key);
    };
    CommandDispatcher.prototype.compilePlan = function (intent, frame, realm) {
        if (!intent) return null;
        const r = (realm || this.getRealm() || 'angband').toLowerCase();
        if (Array.isArray(intent.sequence || intent.keys)) {
            const seq = intent.sequence || intent.keys;
            return seq.map((k, idx) => ({
                send: normalizeKey(k),
                expect: () => true,
                desc: `raw-seq-${idx}:${k}`
            }));
        }
        if (intent.verb === 'more') {
            return [{
                send: 'space',
                expect: (model, fr) => !fr.ui.more,
                repeatWhile: (model, fr) => fr.ui && fr.ui.more,
                desc: 'dismiss-more'
            }];
        }
        if (intent.verb === 'more_move') {
            return [
                {
                    send: 'space',
                    expect: (model, fr) => !fr.ui.more && fr.ui.awaiting_command,
                    desc: 'dismiss-more'
                },
                {
                    send: normalizeKey(intent.dirKey),
                    expect: () => true,
                    desc: `move:${intent.dirKey}`
                }
            ];
        }
        if (intent.verb === 'wield_from_i') {
            const itemLetter = typeof intent.item === 'string'
                ? intent.item
                : (intent.item && (intent.item.letter || intent.item.label)) || 'a';
            return [
                { send: 'i', expect: () => true, desc: 'open-inven' },
                { send: 'w', expect: () => true, desc: 'inven-wield' },
                { send: itemLetter, expect: (model, fr) => model.isIdle || fr.ui.more, desc: `select-item:${itemLetter}` }
            ];
        }
        if (intent.verb === 'item_context_menu') {
            const itemLetter = typeof intent.item === 'string'
                ? intent.item
                : (intent.item && (intent.item.letter || intent.item.label)) || 'a';
            const steps = [
                { send: 'i', expect: () => true, desc: 'open-inven' },
                { send: itemLetter, expect: () => true, desc: `select-item:${itemLetter}` }
            ];
            if (intent.dismiss) {
                steps.push({ send: 'escape', expect: () => true, desc: 'dismiss-item-menu' });
                steps.push({ send: 'escape', expect: (model) => model.isIdle, desc: 'dismiss-inven' });
            }
            return steps;
        }
        if (intent.verb === 'store_buy') {
            const buyCmd = (intent.buyCmd === 'g' || intent.buyKey === 'g') ? 'g' : 'p';
            const itemLetter = typeof intent.item === 'string'
                ? intent.item
                : (intent.item && (intent.item.letter || intent.item.label)) || 'a';
            const qtyStr = String(intent.qty !== undefined ? intent.qty : 1);
            const frameTextOf = (model, fr) => {
                const rawTxt = (fr && fr.term && Array.isArray(fr.term.rows)) ? fr.term.rows.map(rw => rw.g || '').join('\n') : '';
                return ((model && model.prompt && model.prompt.text) || '') + '\n' + ((model && model.legacy && model.legacy.screenText) || '') + '\n' + rawTxt;
            };
            const checkConfirmStep = {
                dynamic: (model, fr) => {
                    const pTxt = frameTextOf(model, fr).toLowerCase();
                    const isYN = Boolean((model && model.prompt && model.prompt.kind === 'yesno') || (model && model.legacy && model.legacy.isYesNoPrompt) || /\[y\/n\]|\(y\/n\)|\[yn\]|\(yn\)|よろしいですか/.test(pTxt));
                    return isYN ? [{ send: 'y', expect: () => true, desc: 'confirm-buy-yn' }] : [];
                }
            };
            return [
                { send: buyCmd, expect: () => true, desc: buyCmd === 'g' ? 'home-get' : 'store-purchase' },
                { send: itemLetter, expect: () => true, desc: `store-item:${itemLetter}` },
                {
                    dynamic: (model, fr) => {
                        const pTxt = frameTextOf(model, fr).toLowerCase();
                        const isQty = Boolean((model && model.prompt && model.prompt.kind === 'quantity') || (model && model.legacy && model.legacy.isQuantityPrompt) || /quantity|how many|how much|いくつ|何個/.test(pTxt));
                        if (isQty) {
                            const qSteps = [];
                            for (const d of qtyStr) qSteps.push({ send: d, expect: () => true, desc: `qty-digit:${d}` });
                            qSteps.push({ send: 'enter', expect: () => true, desc: 'confirm-qty' }, checkConfirmStep);
                            return qSteps;
                        }
                        return [checkConfirmStep];
                    }
                }
            ];
        }
        const vLower = typeof intent.verb === 'string' ? intent.verb.trim().toLowerCase() : '';
        if (vLower === 'engrave' && typeof intent.text === 'string' && !intent.item && !intent.dir) {
            const eKey = intent.key || this.resolveVerbKey('engrave', r) || 'E';
            const eSteps = [{ send: eKey, expect: (model, fr) => model.isIdle || !fr.ui.awaiting_command || (model.prompt && model.prompt.kind === 'string'), desc: 'open:engrave' }];
            for (const ch of intent.text) eSteps.push({ send: normalizeKey(ch), expect: () => true, desc: `engrave-char:${ch}` });
            eSteps.push({ send: 'enter', expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: 'engrave-confirm' });
            return eSteps;
        }
        if (vLower === 'explore' && r !== 'dcss' && r !== 'brogue') {
            const expKey = intent.key || this.resolveVerbKey('explore', r) || 'Alt+E';
            return [{ send: expKey, clientAction: 'explore', desc: 'client-auto-explore' }];
        }
        if (vLower === 'recall' && intent.glyph) {
            return [
                { send: '/', expect: (model, fr) => !fr.ui.awaiting_command || (model.prompt && model.prompt.kind === 'string') || model.isIdle, desc: 'recall-prefix' },
                { send: String(intent.glyph).slice(0, 1), expect: (model, fr) => model.isIdle || (fr.ui && (fr.ui.overlay > 0 || fr.ui.more)), desc: `recall-glyph:${intent.glyph}` }
            ];
        }
        if ((vLower.startsWith('#') ||
            vLower === 'char_sheet' || vLower === 'knowledge' || vLower === 'options' ||
            vLower === 'help' || vLower === 'inven' || vLower === 'inventory' ||
            vLower === 'equip' || vLower === 'equipment' || vLower === 'abilities' ||
            vLower === 'skills' || vLower === 'smithing' || vLower === 'smith' || vLower === 'quiver' ||
            vLower === 'map' || vLower === 'messages' || vLower === 'command_menu' ||
            vLower === 'menu' || vLower === 'pickup' || vLower === 'hold' ||
            vLower === 'exchange' || vLower === 'search_mode' || vLower === 'search' ||
            vLower === 'explore' || vLower === 'travel' || vLower === 'stairs_up' ||
            vLower === 'stairs_down' || vLower === 'repeat' || vLower === 'look' ||
            vLower === 'target' || vLower === 'locate' || vLower === 'save' ||
            vLower === 'discoveries' || vLower === 'god' || vLower === 'mutations' ||
            vLower === 'autofight' || vLower === 'pray' || vLower === 'offer' ||
            vLower === 'dip' || vLower === 'chat' || vLower === 'loot' ||
            vLower === 'force' || vLower === 'engrave') && !intent.item && !intent.dir) {
            let verbKey;
            if (intent.key) {
                verbKey = normalizeKey(intent.key); } else if (vLower === 'command_menu' || vLower === 'menu') {
                verbKey = this.resolveVerbKey('command_menu', r) || (r === 'silq' ? 'm' : 'enter'); } else {
                verbKey = this.resolveVerbKey(intent.verb, r);
            }
            if (!verbKey || verbKey === 'Alt+E') return null;
            const steps = [
                {
                    send: normalizeKey(verbKey),
                    expect: (model, fr) => Boolean((fr && fr.ui && (fr.ui.overlay > 0 || !fr.ui.awaiting_command || fr.ui.more)) || (model && (model.owner !== 'engine-idle' || model.isIdle))),
                    desc: `open:${intent.verb}`
                }
            ];
            if (intent.dismiss) {
                steps.push({ send: 'escape', expect: (model) => model.isIdle, desc: 'dismiss-screen' });
            }
            return steps;
        }
        if (intent.verb === 'rest') {
            const restKey = this.resolveVerbKey('rest', r) || (r === 'silq' ? '%' : 'R');
            const isAtomicRest = (r === 'silq' || r === 'nethack' || r === 'dcss' || r === 'brogue' || r === 'rogue' || r === 'ryod');
            if (isAtomicRest && !intent.qty) {
                return [{
                    send: restKey,
                    expect: (model, fr) => model.isIdle || (fr.player && fr.player.resting) || (fr.ui && fr.ui.more),
                    desc: `${r}-rest`
                }];
            }
            const qtyKey = normalizeKey(intent.qty || 'enter');
            return [
                {
                    send: restKey,
                    expect: (model, fr) => (model.prompt && (model.prompt.kind === 'rest' || model.prompt.kind === 'quantity')) ||
                                           !fr.ui.awaiting_command || (fr.player && fr.player.resting),
                    desc: 'open-rest-prompt'
                },
                {
                    send: qtyKey,
                    expect: (model, fr) => model.isIdle || (fr.player && fr.player.resting) || (fr.ui && fr.ui.more),
                    desc: `confirm-rest:${qtyKey}`
                }
            ];
        }
        if (intent.verb === 'song') {
            const songLetter = intent.spell || intent.song;
            if (!songLetter) return [{ send: 's', expect: (model, fr) => !fr.ui.awaiting_command || model.isIdle || (fr.ui && fr.ui.overlay > 0), desc: 'open-song-menu' }];
            return [
                { send: 's', expect: (model, fr) => !fr.ui.awaiting_command || (fr.ui && fr.ui.overlay > 0) || (model.prompt && model.prompt.kind === 'spell'), desc: 'open-song-menu' },
                { send: songLetter, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `select-song:${songLetter}` }
            ];
        }
        if (intent.verb === 'power') {
            const pKey = this.resolveVerbKey('power', r) || 'U';
            const powerLetter = intent.spell || intent.power;
            if (!powerLetter && !intent.dir && !intent.target) {
                return [{ send: pKey, expect: (model, fr) => !fr.ui.awaiting_command || model.isIdle || (fr.ui && fr.ui.overlay > 0), desc: 'open-power-menu' }];
            }
            const pLetter = powerLetter || 'a';
            const steps = [
                { send: pKey, expect: (model, fr) => !fr.ui.awaiting_command || (fr.ui && fr.ui.overlay > 0) || (model.prompt && (model.prompt.kind === 'spell' || model.prompt.kind === 'menu')), desc: 'open-power-menu' },
                {
                    send: pLetter,
                    expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more) || Boolean((intent.dir || intent.target) && (model.prompt && model.prompt.kind === 'direction' || !fr.ui.awaiting_command)),
                    desc: `select-power:${pLetter}`
                }
            ];
            if (intent.dir || intent.target) {
                const targetKey = intent.dir || resolveTargetKey(r, intent.target);
                steps.push({ send: targetKey, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `target:${targetKey}` });
            }
            return steps;
        }
        if (intent.verb === 'cast') {
            const castKey = this.resolveVerbKey('cast', r) || 'm';
            const steps = [
                {
                    send: castKey,
                    expect: (model, fr) => Boolean((model.prompt && (model.prompt.kind === 'book' || model.prompt.kind === 'spell' || model.prompt.kind === 'item')) || (fr.ui && !fr.ui.awaiting_command)),
                    desc: 'open-cast'
                }
            ];
            if (intent.book) {
                steps.push({ send: intent.book, expect: (model, fr) => Boolean((model.prompt && model.prompt.kind === 'spell') || (fr.ui && (!fr.ui.awaiting_command || fr.ui.overlay > 0))), desc: `select-book:${intent.book}` });
            }
            if (intent.spell) {
                steps.push({ send: intent.spell, expect: (model, fr) => (intent.dir || intent.target) ? Boolean((model.prompt && model.prompt.kind === 'direction') || (model.legacy && model.legacy.isTargeting) || !fr.ui.awaiting_command) : (model.isIdle || (fr.ui && fr.ui.more)), desc: `select-spell:${intent.spell}` });
            }
            if (intent.dir || intent.target) {
                const targetKey = intent.dir || resolveTargetKey(r, intent.target);
                steps.push({ send: targetKey, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `target:${targetKey}` });
            }
            return steps;
        }
        if (intent.verb === 'open' || intent.verb === 'close' || intent.verb === 'disarm' ||
            intent.verb === 'tunnel' || intent.verb === 'alter' || intent.verb === 'bash' ||
            intent.verb === 'spike' || intent.verb === 'steal' || intent.verb === 'walk' ||
            intent.verb === 'run' || intent.verb === 'kick' || intent.verb === 'id_trap') {
            const verbKey = this.resolveVerbKey(intent.verb, r) || intent.key;
            if (!verbKey) return null;
            const steps = [
                {
                    send: verbKey,
                    expect: (model, fr) => (intent.dir ? Boolean((model.prompt && model.prompt.kind === 'direction') || (model.legacy && model.legacy.isTargeting) || !fr.ui.awaiting_command) : ((model.prompt && model.prompt.kind === 'direction') || (model.legacy && model.legacy.isTargeting) || model.isIdle || Boolean(fr && fr.ui && (fr.ui.more || !fr.ui.awaiting_command)))),
                    desc: `verb:${intent.verb}`
                }
            ];
            if (intent.dir) {
                steps.push({ send: intent.dir, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `dir:${intent.dir}` });
            }
            return steps;
        }
        let verbKey;
        if (intent.verb === 'fire') {
            if (r === 'angband' && intent.target === 'nearest') { verbKey = 'h'; } else { verbKey = intent.key || this.resolveVerbKey('fire', r) || 'f'; }
        } else {
            verbKey = intent.key || this.resolveVerbKey(intent.verb, r);
        }
        if (!verbKey) return null;
        verbKey = normalizeKey(verbKey);
        if (verbKey === 'h') {
            return [{
                send: 'h',
                expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more),
                desc: 'fire-nearest'
            }];
        }
        const steps = [];
        const isSingleVerb = (intent.item === undefined || intent.item === null) && !intent.dir && !intent.target && intent.qty === undefined && !intent.confirm;
        steps.push({ send: verbKey, expect: (model, fr) => (model.prompt && (model.prompt.kind === 'item' || model.prompt.kind === 'select' || model.prompt.kind === 'direction')) || (model.legacy && (model.legacy.promptKind === 'select' || model.legacy.isItemPrompt || model.legacy.isTargeting)) || model.isIdle || Boolean(fr && fr.ui && (fr.ui.more || (isSingleVerb && (fr.ui.overlay > 0 || !fr.ui.awaiting_command)))), desc: `verb:${intent.verb}` });
        if (intent.item !== undefined && intent.item !== null) {
            let targetLetter = typeof intent.item === 'string' ? intent.item : (intent.item.letter || intent.item.label);
            if (!targetLetter && r === 'angband' && intent.item && typeof intent.item.slot === 'number') { targetLetter = getVanillaLetter(intent.item.slot); }
            if (targetLetter) {
                steps.push({ send: targetLetter, itemObj: typeof intent.item === 'object' ? intent.item : null, verify: (model) => { const visible = (model.items && model.items.length) ? model.items : (model.legacy && model.legacy.items) || []; if (visible.length > 0) { const match = visible.find(it => (it.key || it.letter) === targetLetter); if (!match) return 'handoff'; if (intent.item && intent.item.name) { const expectName = intent.item.name.toLowerCase(); const actualName = (match.name || match.rowLabel || (match.label && match.label.length > 1 ? match.label : '') || '').toLowerCase(); if (actualName && !actualName.includes(expectName) && !(actualName.length >= 6 && expectName.includes(actualName))) { return 'handoff'; } } } return true; }, expect: (model, fr) => { if (intent.verb === 'drop' && intent.qty !== undefined) { return Boolean((model.prompt && model.prompt.kind === 'quantity') || (model.legacy && model.legacy.isQuantityPrompt) || (fr && fr.ui && !fr.ui.awaiting_command)); } if (intent.verb === 'aim' || intent.verb === 'zap' || intent.verb === 'throw' || intent.verb === 'fire') { return (intent.dir || intent.target) ? Boolean((model.prompt && model.prompt.kind === 'direction') || (model.legacy && model.legacy.isTargeting) || (fr && fr.ui && !fr.ui.awaiting_command)) : (model.isIdle || (fr.ui && fr.ui.more) || Boolean(model.prompt && model.prompt.kind === 'direction') || Boolean(model.legacy && model.legacy.isTargeting)); } return model.isIdle || (fr.ui && fr.ui.more); }, desc: `item:${targetLetter}` });
            }
        }
        if (intent.verb === 'drop' && intent.qty !== undefined) {
            const qtyStr = String(intent.qty);
            for (const d of qtyStr) {
                steps.push({ send: d, expect: () => true, desc: `drop-qty-digit:${d}` });
            }
            steps.push({ send: 'enter', expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: 'drop-confirm-qty' });
        }
        if (intent.dir || (intent.target && !['quaff', 'eat', 'read', 'wield', 'takeoff', 'drop', 'ignore', 'examine', 'inscribe', 'uninscribe', 'refill', 'browse', 'study'].includes(vLower))) {
            const targetKey = intent.dir || resolveTargetKey(r, intent.target);
            steps.push({ send: targetKey, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `target:${targetKey}` });
        }
        if (intent.verb === 'ignore' && intent.confirm) {
            steps.push({ send: intent.confirm, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `confirm-ignore:${intent.confirm}` });
        }
        return steps;
    };
    CommandDispatcher.prototype.run = function (intent, opts = {}) {
        if (this.state !== 'Idle') { this.cancel('new-intent'); }
        const frame = this.getLastFrame();
        const realm = (opts.realm || this.getRealm() || 'angband').toLowerCase();
        this.lastFrame = frame;
        const model = this._classify(frame);
        const isDirectMore = Boolean(intent && (intent.verb === 'more' || intent.verb === 'more_move'));
        const isStoreAction = Boolean(intent && (intent.verb === 'store_buy' || (frame && frame.ui && frame.ui.context === 'store')));
        const skipUnwind = isDirectMore || isStoreAction;
        if (!model.isIdle && !skipUnwind) {
            const inModalPrompt = Boolean(frame && frame.ui && frame.ui.overlay === 0 && !frame.ui.more && !frame.ui.awaiting_command);
            const allowPrompt = Boolean(opts.allowUnwindPrompt || (intent && intent.allowUnwindPrompt) || this.deps.allowUnwindPrompt);
            if (inModalPrompt && !allowPrompt) {
                this.state = 'Failed';
                this.lastResult = 'Failed';
                this.onToast('Cannot perform action during prompt');
                this.onEvent('dispatcher:failed', { reason: 'modal-prompt-refusal' });
                this.state = 'Idle';
                return false;
            }
            this._clearMenuRouterPending();
            this.state = 'Unwinding';
            this.unwindCount = 0;
            this.pendingIntent = intent;
            this.onEvent('dispatcher:unwinding', { intent });
            const key = (frame && frame.ui && frame.ui.more) ? 'space' : 'escape';
            this.sendKey(key);
            this.sentSeq = (frame && frame.seq !== undefined) ? frame.seq : null;
            this._startDeadlineTimer();
            return true;
        }
        const plan = this.compilePlan(intent, frame, realm);
        if (!plan || plan.length === 0) {
            this.state = 'Failed';
            this.lastResult = 'Failed';
            this.onToast('Failed to compile command plan');
            this.onEvent('dispatcher:failed', { reason: 'compilation-failed' });
            this.state = 'Idle';
            return false;
        }
        if (plan.length === 1 && plan[0].clientAction === 'explore') {
            if (typeof window !== 'undefined' && window.__app?.input?.toggleAutoExplore) window.__app.input.toggleAutoExplore();
            this._finish('Done', 'client-auto-explore');
            return true;
        }
        this.plan = plan;
        this.stepIndex = 0;
        this.state = 'Running';
        this.onEvent('dispatcher:start', { intent, planLength: plan.length });
        this._executeStep();
        return true;
    };
    CommandDispatcher.prototype.onFrame = function (frame) {
        if (this.state === 'Idle') { return; }
        if (this.sentSeq !== null && frame && frame.seq !== undefined && frame.seq <= this.sentSeq) { return; }
        this.lastFrame = frame;
        if (frame && ((frame.phase && frame.phase !== 'play') || (frame.player && frame.player.dead))) {
            this._clearMenuRouterPending();
        }
        if (this.state === 'Unwinding') {
            this._clearDeadlineTimer();
            this.unwindCount++;
            const model = this._classify(frame);
            if (model.isIdle) {
                const intent = this.pendingIntent;
                this.pendingIntent = null;
                this.state = 'Running';
                const plan = this.compilePlan(intent, frame, this.getRealm());
                if (!plan || plan.length === 0) {
                    this._finish('Failed', 'compilation-failed');
                    return;
                }
                this.plan = plan;
                this.stepIndex = 0;
                this._executeStep();
                return; } else if (this.unwindCount < 3) {
                const key = (frame && frame.ui && frame.ui.more) ? 'space' : 'escape';
                this.sendKey(key);
                this.sentSeq = (frame && frame.seq !== undefined) ? frame.seq : null;
                this._startDeadlineTimer();
                return; } else {
                this._finish('Failed', 'unwind-limit-exceeded');
                this.onToast('Engine state could not be unwound');
                return;
            }
        }
        if (this.state === 'Awaiting') {
            this._clearDeadlineTimer();
            const step = this.plan[this.stepIndex];
            const model = this._classify(frame);
            if (frame && frame.ui && frame.ui.more) {
                if (step.repeatWhile && step.repeatWhile(model, frame)) {
                    this.sendKey(step.send);
                    this.sentSeq = (frame && frame.seq !== undefined) ? frame.seq : null;
                    this._startDeadlineTimer();
                    return;
                }
                if (this.stepIndex < this.plan.length - 1) {
                    this._finish('Handoff', 'unexpected-more');
                    return;
                }
            }
            let matches = false;
            if (typeof step.expect === 'function') {
                matches = step.expect(model, frame); } else {
                matches = true;
            }
            if (matches) {
                this.stepIndex++;
                if (this.stepIndex >= this.plan.length) {
                    this._finish('Done'); } else {
                    this.state = 'Running';
                    this._executeStep();
                } } else {
                if (frame && frame.ui && frame.ui.more) {
                    this._finish('Handoff', 'unexpected-more'); } else if (step.onMismatch === 'abort') {
                    this._finish('Failed', 'expectation-mismatch'); } else {
                    this._finish('Handoff', 'prompt-mismatch');
                }
            }
        }
    };
    CommandDispatcher.CANONICAL_KEYS = CANONICAL_KEYS;
    return CommandDispatcher;
});

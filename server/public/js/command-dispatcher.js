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
    if (typeof require === 'function') {
        try { ScreenContextModule = require('./screen-context'); } catch (_) {}
        try { RealmKeysModule = require('./realm-keys'); } catch (_) {}
        try { QuickActionsModule = require('./quick-actions'); } catch (_) {}
    }
    const VANILLA_LETTERS = 'abcdefgimnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function getVanillaLetter(i) {
        if (typeof i !== 'number' || i < 0) return 'a';
        return VANILLA_LETTERS[i] || String.fromCharCode(97 + i);
    }
    function normalizeKey(key) {
        if (typeof key !== 'string') return '';
        if (key === ' ' || key.toLowerCase() === 'space') return 'space';
        if (key.length === 1) return key;
        const lower = key.trim().toLowerCase();
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
        quaff: Object.freeze({ angband: 'q', silq: 'q', frogcomposband: 'q', hengband: 'q' }),
        read: Object.freeze({ angband: 'r', silq: null, frogcomposband: 'r', hengband: 'r' }),
        eat: Object.freeze({ angband: 'E', silq: 'E', frogcomposband: 'E', hengband: 'E' }),
        wield: Object.freeze({ angband: 'w', silq: 'w', frogcomposband: 'w', hengband: 'w' }),
        takeoff: Object.freeze({ angband: 't', silq: 'r', frogcomposband: 't', hengband: 't' }),
        drop: Object.freeze({ angband: 'd', silq: 'd', frogcomposband: 'd', hengband: 'd' }),
        aim: Object.freeze({ angband: 'a', silq: null, frogcomposband: 'a', hengband: 'a' }),
        use_staff: Object.freeze({ angband: 'u', silq: 'a', frogcomposband: 'u', hengband: 'u' }),
        zap: Object.freeze({ angband: 'z', silq: null, frogcomposband: 'z', hengband: 'z' }),
        activate: Object.freeze({ angband: 'A', silq: null, frogcomposband: 'A', hengband: 'A' }),
        use: Object.freeze({ angband: 'U', silq: 'u', frogcomposband: null, hengband: null }),
        throw: Object.freeze({ angband: 'v', silq: 't', frogcomposband: 'v', hengband: 'v' }),
        fire: Object.freeze({ angband: 'f', silq: 'f', frogcomposband: 'f', hengband: 'f' }),
        examine: Object.freeze({ angband: 'I', silq: 'x', frogcomposband: 'I', hengband: 'I' }),
        ignore: Object.freeze({ angband: 'k', silq: 'k', frogcomposband: 'k', hengband: 'k' }),
        inscribe: Object.freeze({ angband: '{', silq: '{', frogcomposband: '{', hengband: '{' }),
        uninscribe: Object.freeze({ angband: '}', silq: null, frogcomposband: '}', hengband: '}' }),
        refill: Object.freeze({ angband: 'F', silq: null, frogcomposband: 'F', hengband: 'F' }),
        cast: Object.freeze({ angband: 'm', silq: null, frogcomposband: 'm', hengband: 'm' }),
        browse: Object.freeze({ angband: 'b', silq: null, frogcomposband: 'b', hengband: 'b' }),
        study: Object.freeze({ angband: 'G', silq: null, frogcomposband: 'G', hengband: 'G' }),
        song: Object.freeze({ angband: null, silq: 's', frogcomposband: null, hengband: null }),
        power: Object.freeze({ angband: null, silq: null, frogcomposband: 'U', hengband: 'U' }),
        rest: Object.freeze({ angband: 'R', silq: '%', frogcomposband: 'R', hengband: 'R' }),
        open: Object.freeze({ angband: 'o', silq: 'o', frogcomposband: 'o', hengband: 'o' }),
        close: Object.freeze({ angband: 'c', silq: 'c', frogcomposband: 'c', hengband: 'c' }),
        pickup: Object.freeze({ angband: 'g', silq: 'g', frogcomposband: 'g', hengband: 'g' }),
        char_sheet: Object.freeze({ angband: 'C', silq: '@', frogcomposband: 'C', hengband: 'C' }),
        knowledge: Object.freeze({ angband: '~', silq: '~', frogcomposband: '~', hengband: '~' }),
        inven: Object.freeze({ angband: 'i', silq: 'i', frogcomposband: 'i', hengband: 'i' }),
        equip: Object.freeze({ angband: 'e', silq: 'e', frogcomposband: 'e', hengband: 'e' }),
        options: Object.freeze({ angband: '=', silq: 'O', frogcomposband: '=', hengband: '=' }),
        help: Object.freeze({ angband: '?', silq: '?', frogcomposband: '?', hengband: '?' })
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
        if (deps && deps.ScreenModel && typeof deps.ScreenModel.of === 'function') { return deps.ScreenModel.of(frame, realm); }
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
                kind = 'more'; } else if (/quaff|read|wear|wield|take off|drop|throw|destroy|identify|use|item|choice:/i.test(combined)) {
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
    CommandDispatcher.prototype.resolveVerbKey = function (verb, realm) {
        const r = (realm || this.getRealm() || 'angband').toLowerCase();
        if (this.deps.ActionCatalog) {
            if (typeof this.deps.ActionCatalog.getKey === 'function') {
                const k = this.deps.ActionCatalog.getKey(verb, r);
                if (k !== undefined) return k;
            }
            if (typeof this.deps.ActionCatalog.get === 'function') {
                const entry = this.deps.ActionCatalog.get(verb);
                if (entry && entry.keys && entry.keys[r] !== undefined) return entry.keys[r];
            }
        }
        if (this.deps.RealmKeys && typeof this.deps.RealmKeys.realmKey === 'function') {
            const k = this.deps.RealmKeys.realmKey(verb, r);
            if (k !== undefined) return k;
        }
        if (RealmKeysModule && typeof RealmKeysModule.realmKey === 'function') {
            const k = RealmKeysModule.realmKey(verb, r);
            if (k !== undefined) return k;
        }
        if (typeof window !== 'undefined' && window.RealmKeys && typeof window.RealmKeys.realmKey === 'function') {
            const k = window.RealmKeys.realmKey(verb, r);
            if (k !== undefined) return k;
        }
        const mapped = CANONICAL_KEYS[verb];
        if (mapped && mapped[r] !== undefined) { return mapped[r]; }
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
        if (this.state === 'Idle') { return false; }
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
        this.sendKey(key);
        this.sentSeq = (this.lastFrame && this.lastFrame.seq !== undefined) ? this.lastFrame.seq : null;
        this.state = 'Awaiting';
        this.onEvent('dispatcher:step', { stepIndex: this.stepIndex, key, desc: step.desc });
        this._startDeadlineTimer();
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
            const itemLetter = typeof intent.item === 'string'
                ? intent.item
                : (intent.item && (intent.item.letter || intent.item.label)) || 'a';
            const qtyStr = String(intent.qty !== undefined ? intent.qty : 1);
            const steps = [
                { send: 'p', expect: () => true, desc: 'store-purchase' },
                { send: itemLetter, expect: () => true, desc: `store-item:${itemLetter}` }
            ];
            for (const d of qtyStr) {
                steps.push({ send: d, expect: () => true, desc: `qty-digit:${d}` });
            }
            steps.push({ send: 'enter', expect: () => true, desc: 'confirm-qty' });
            return steps;
        }
        if (intent.verb === 'char_sheet' || intent.verb === 'knowledge' || intent.verb === 'options' ||
            intent.verb === 'help' || intent.verb === 'inven' || intent.verb === 'equip' ||
            intent.verb === 'command_menu' || intent.verb === 'menu' || intent.verb === 'pickup') {
            let verbKey;
            if (intent.key) {
                verbKey = intent.key; } else if (intent.verb === 'command_menu' || intent.verb === 'menu') {
                verbKey = 'enter'; } else {
                verbKey = this.resolveVerbKey(intent.verb, r);
            }
            if (!verbKey) return null;
            const steps = [
                {
                    send: verbKey,
                    expect: (model, fr) => (fr.ui && fr.ui.overlay > 0) || !fr.ui.awaiting_command || true,
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
            if (r === 'silq' && !intent.qty) {
                return [{
                    send: restKey,
                    expect: (model, fr) => model.isIdle || (fr.player && fr.player.resting) || (fr.ui && fr.ui.more),
                    desc: 'silq-rest'
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
            const songLetter = intent.spell || intent.song || 'a';
            return [
                { send: 's', expect: () => true, desc: 'open-song-menu' },
                { send: songLetter, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `select-song:${songLetter}` }
            ];
        }
        if (intent.verb === 'power') {
            const powerLetter = intent.spell || intent.power || 'a';
            const steps = [
                { send: 'U', expect: () => true, desc: 'open-power-menu' },
                {
                    send: powerLetter,
                    expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more) || (intent.dir || intent.target),
                    desc: `select-power:${powerLetter}`
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
                    expect: (model) => (model.prompt && (model.prompt.kind === 'book' || model.prompt.kind === 'spell')) || true,
                    desc: 'open-cast'
                }
            ];
            if (intent.book) {
                steps.push({ send: intent.book, expect: (model) => (model.prompt && model.prompt.kind === 'spell') || true, desc: `select-book:${intent.book}` });
            }
            if (intent.spell) {
                steps.push({ send: intent.spell, expect: (model, fr) => (intent.dir || intent.target) ? ((model.prompt && model.prompt.kind === 'direction') || true) : (model.isIdle || (fr.ui && fr.ui.more)), desc: `select-spell:${intent.spell}` });
            }
            if (intent.dir || intent.target) {
                const targetKey = intent.dir || resolveTargetKey(r, intent.target);
                steps.push({ send: targetKey, expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: `target:${targetKey}` });
            }
            return steps;
        }
        if (intent.verb === 'open' || intent.verb === 'close' || intent.verb === 'disarm' ||
            intent.verb === 'tunnel' || intent.verb === 'alter') {
            const verbKey = this.resolveVerbKey(intent.verb, r);
            if (!verbKey) return null;
            const steps = [
                {
                    send: verbKey,
                    expect: (model) => (intent.dir ? ((model.prompt && model.prompt.kind === 'direction') || true) : model.isIdle),
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
            if (r === 'angband' && intent.target === 'nearest') {
                verbKey = 'h'; } else {
                verbKey = 'f';
            } } else {
            verbKey = this.resolveVerbKey(intent.verb, r);
        }
        if (!verbKey) return null;
        if (verbKey === 'h') {
            return [{
                send: 'h',
                expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more),
                desc: 'fire-nearest'
            }];
        }
        const steps = [];
        steps.push({ send: verbKey, expect: (model, fr) => (model.prompt && (model.prompt.kind === 'item' || model.prompt.kind === 'select' || model.prompt.kind === 'direction')) || (model.legacy && (model.legacy.promptKind === 'select' || model.legacy.isItemPrompt || model.legacy.isTargeting)) || model.isIdle || (fr.ui && fr.ui.more), desc: `verb:${intent.verb}` });
        if (intent.item !== undefined && intent.item !== null) {
            let targetLetter = typeof intent.item === 'string' ? intent.item : (intent.item.letter || intent.item.label);
            if (!targetLetter && r === 'angband' && intent.item && typeof intent.item.slot === 'number') { targetLetter = getVanillaLetter(intent.item.slot); }
            if (targetLetter) {
                steps.push({ send: targetLetter, itemObj: typeof intent.item === 'object' ? intent.item : null, verify: (model) => { const visible = (model.items && model.items.length) ? model.items : (model.legacy && model.legacy.items) || []; if (visible.length > 0) { const match = visible.find(it => (it.key || it.letter) === targetLetter); if (!match) return 'handoff'; if (intent.item && intent.item.name) { const expectName = intent.item.name.toLowerCase(); const actualName = (match.label || match.name || '').toLowerCase(); if (!actualName.includes(expectName)) { return 'handoff'; } } } return true; }, expect: (model, fr) => { if (intent.verb === 'drop' && intent.qty !== undefined) { return (model.prompt && model.prompt.kind === 'quantity') || (model.legacy && model.legacy.isQuantityPrompt) || true; } if ((intent.verb === 'aim' || intent.verb === 'zap' || intent.verb === 'throw' || intent.verb === 'fire') && (intent.dir || intent.target)) { return (model.prompt && model.prompt.kind === 'direction') || (model.legacy && model.legacy.isTargeting) || true; } return model.isIdle || (fr.ui && fr.ui.more); }, desc: `item:${targetLetter}` });
            }
        }
        if (intent.verb === 'drop' && intent.qty !== undefined) {
            const qtyStr = String(intent.qty);
            for (const d of qtyStr) {
                steps.push({ send: d, expect: () => true, desc: `drop-qty-digit:${d}` });
            }
            steps.push({ send: 'enter', expect: (model, fr) => model.isIdle || (fr.ui && fr.ui.more), desc: 'drop-confirm-qty' });
        }
        if (intent.dir || intent.target) {
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
    return CommandDispatcher;
});

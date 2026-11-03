/**
 * screen-modal-coordinator.js — Sovereign Screen, Modal, Sub-Prompt, Quick-Belt &
 * Tactical Gameplay Assistant Coordinator (WS48-WS54).
 *
 * Unifies modal ownership, quick-slot inscriptions (`1..9`), deterministic command transactions,
 * micro-prompt classification (`direction`, `confirm-yn`, `more`), 3D ↔ Terminal cell hover,
 * and real-time Tactical Survival Recommendations across all realms.
 *
 * Contract: Pure UMD module, dirty-signature guarded (Law U3), 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ScreenModalCoordinator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const QUICK_SLOT_MIN = 1;
    const QUICK_SLOT_MAX = 9;
    const STORAGE_PREFIX = 'a3d.quickSlots.';

    const COMPASS_DIRECTIONS = Object.freeze([
        { label: '↖ NW', key: '7' },
        { label: '↑ N',  key: '8' },
        { label: '↗ NE', key: '9' },
        { label: '← W',  key: '4' },
        { label: '🎯 Target', key: '*' },
        { label: '→ E',  key: '6' },
        { label: '↙ SW', key: '1' },
        { label: '↓ S',  key: '2' },
        { label: '↘ SE', key: '3' },
        { label: '✕ Cancel', key: 'Escape' }
    ]);

    class ScreenModalCoordinatorController {
        constructor(options = {}) {
            this._storage = options.storage || ((typeof localStorage !== 'undefined') ? localStorage : null);
            this._memorySlots = {};
            this._quickSlotListeners = new Set();
            this._hoverListeners = new Set();
            this._modalListeners = new Set();
            this._lastHoverSig = '';
            this._hoveredCell = null;
            this._activeModalOwner = 'none';
            this._modalCoveringViewport = false;
            this._lastModalSig = '';
        }

        _normalizeRealm(realm) {
            return String(realm || 'angband').trim().toLowerCase() || 'angband';
        }

        _storageKey(realm) {
            return STORAGE_PREFIX + this._normalizeRealm(realm);
        }

        getQuickSlots(realm) {
            const r = this._normalizeRealm(realm);
            const key = this._storageKey(r);
            if (this._storage && typeof this._storage.getItem === 'function') {
                try {
                    const raw = this._storage.getItem(key);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && typeof parsed === 'object') {
                            this._memorySlots[r] = parsed;
                            return Object.assign({}, parsed);
                        }
                    }
                } catch (_) {}
            }
            return Object.assign({}, this._memorySlots[r] || {});
        }

        bindQuickSlot(realm, slotNumber, spec = {}) {
            const r = this._normalizeRealm(realm);
            const slot = Number(slotNumber);
            if (!Number.isInteger(slot) || slot < QUICK_SLOT_MIN || slot > QUICK_SLOT_MAX) {
                return null;
            }
            const current = this.getQuickSlots(r);
            const entry = {
                slot: slot,
                realm: r,
                key: String(spec.key || spec.slotKey || 'a'),
                verb: String(spec.verb || spec.verbKey || 'u'),
                name: String(spec.name || spec.label || 'Bound Action').trim(),
                category: String(spec.category || 'misc'),
                icon: String(spec.icon || '⚡'),
                inscriptionTag: this.formatInscriptionTag(slot, spec.verb || spec.verbKey || ''),
                isExtended: Boolean(spec.isExtended || /^#/.test(String(spec.verb || ''))),
                updatedAt: Date.now()
            };
            current[String(slot)] = entry;
            this._memorySlots[r] = current;

            if (this._storage && typeof this._storage.setItem === 'function') {
                try {
                    this._storage.setItem(this._storageKey(r), JSON.stringify(current));
                } catch (_) {}
            }

            this._emitQuickSlots(r, current, entry);
            return entry;
        }

        unbindQuickSlot(realm, slotNumber) {
            const r = this._normalizeRealm(realm);
            const slot = Number(slotNumber);
            const current = this.getQuickSlots(r);
            delete current[String(slot)];
            this._memorySlots[r] = current;
            if (this._storage && typeof this._storage.setItem === 'function') {
                try {
                    this._storage.setItem(this._storageKey(r), JSON.stringify(current));
                } catch (_) {}
            }
            this._emitQuickSlots(r, current, null);
            return current;
        }

        clearQuickSlot(realm, slotNumber) {
            return this.unbindQuickSlot(realm, slotNumber);
        }

        formatInscriptionTag(slotNumber, verbKey) {
            const s = Math.min(QUICK_SLOT_MAX, Math.max(QUICK_SLOT_MIN, Number(slotNumber) || 1));
            const cleanVerb = String(verbKey || '').replace(/^#.*$/, '').replace(/[^a-zA-Z]/g, '').slice(0, 1);
            if (!cleanVerb || cleanVerb === 'q') return `@q${s}`;
            return `@${cleanVerb}${s}@q${s}`;
        }

        syncWithQuickActions(realm, quickActionController) {
            const r = this._normalizeRealm(realm);
            const slots = this.getQuickSlots(r);
            if (quickActionController && typeof quickActionController === 'object') {
                if (typeof quickActionController.setSlotsFromCoordinator === 'function') {
                    quickActionController.setSlotsFromCoordinator(slots, r);
                } else if (quickActionController._slots && typeof quickActionController._slots === 'object') {
                    Object.assign(quickActionController._slots, slots);
                }
            }
            return slots;
        }

        onQuickSlotsChange(fn) {
            if (typeof fn === 'function') this._quickSlotListeners.add(fn);
            return () => this._quickSlotListeners.delete(fn);
        }

        _emitQuickSlots(realm, allSlots, changedEntry) {
            for (const fn of this._quickSlotListeners) {
                try {
                    fn({ realm, slots: Object.assign({}, allSlots), changed: changedEntry });
                } catch (_) {}
            }
        }

        /**
         * Deterministic Intent Translator (`buildCommandTransaction`)
         * Supports:
         *   - `'direct-slot'`: Engine is already asking for an item slot (`[slotKey]`)
         *   - `'close-then-act'`: Engine is inside a passive `i`/`e` view (`['\x1b', verbKey, slotKey]`)
         *   - `'extended-command'`: NetHack `#cmd\n` extended ritual (`['#', ...chars, '\n']` or `['\x1b', verbKey, slotKey]`)
         *   - `'atomic-verb-noun'`: Normal dungeon play (`[verbKey, slotKey]`)
         */
        buildCommandTransaction(intent = {}, screenState = {}, realm = 'angband') {
            const r = this._normalizeRealm(realm);
            const slotKey = String(intent.slotKey != null ? intent.slotKey : (intent.key || '')).trim();
            let verbKey = String(intent.verbKey != null ? intent.verbKey : (intent.verb || ''));
            const isExtended = Boolean(intent.isExtended || /^#/.test(verbKey));

            if (isExtended && verbKey && !verbKey.endsWith('\n')) {
                verbKey = verbKey + '\n';
            }

            const mode = String(screenState.mode || 'dungeon');
            const isItemPrompt = Boolean(
                screenState.isItemPrompt ||
                screenState.isItemTargetPrompt ||
                (mode === 'item-list' && screenState.promptKind === 'select' && screenState.verbPrompt)
            );
            const isPassiveList = Boolean(
                !isItemPrompt &&
                (mode === 'item-list' || screenState.isInventoryScreen || screenState.isEquipScreen || screenState.inOverlay) &&
                !screenState.verbPrompt
            );

            if (isItemPrompt) {
                return {
                    realm: r,
                    mode: 'direct-slot',
                    steps: slotKey ? [slotKey] : [],
                    awaitDungeonAfterEsc: false,
                    isExtended: isExtended
                };
            }

            if (isPassiveList) {
                const steps = ['\x1b'];
                if (verbKey) steps.push(verbKey);
                if (slotKey) steps.push(slotKey);
                return {
                    realm: r,
                    mode: 'close-then-act',
                    steps: steps,
                    awaitDungeonAfterEsc: true,
                    isExtended: isExtended
                };
            }

            if (isExtended && !slotKey) {
                const cleanCmd = verbKey.replace(/^#/, '').replace(/\n$/, '');
                return {
                    realm: r,
                    mode: 'extended-command',
                    steps: ['#', ...cleanCmd.split(''), '\n'],
                    rawSequence: verbKey,
                    awaitDungeonAfterEsc: false,
                    isExtended: true
                };
            }

            const steps = [];
            if (verbKey) steps.push(verbKey);
            if (slotKey) steps.push(slotKey);
            return {
                realm: r,
                mode: 'atomic-verb-noun',
                steps: steps,
                awaitDungeonAfterEsc: false,
                isExtended: isExtended
            };
        }

        /**
         * Detects engine micro-prompts (`Direction?`, `[y/n]`, `--More--`) so the UI can render
         * an ergonomic 8-way Compass Rose or 1-click confirmation pill bar.
         */
        classifySubPrompt(promptText, realm = 'angband') {
            const p = String(promptText || '').trim();
            if (!p) return { kind: 'none', prompt: '' };

            if (/--more--|\(more\)/i.test(p)) {
                return {
                    kind: 'more',
                    realm: this._normalizeRealm(realm),
                    prompt: p,
                    options: [
                        { label: '📜 Continue [Space]', key: ' ', primary: true }
                    ]
                };
            }

            if (/\[y\/n\]|\(y\/n\)|\breally\b|\bare you sure\b/i.test(p)) {
                return {
                    kind: 'confirm-yn',
                    realm: this._normalizeRealm(realm),
                    prompt: p,
                    options: [
                        { label: '✓ Yes [Y]', key: 'y', primary: true },
                        { label: '✕ No [N]', key: 'n', primary: false }
                    ]
                };
            }

            if (/\b(direction|which way|in what direction|aim|where\?)\b/i.test(p)) {
                return {
                    kind: 'direction',
                    realm: this._normalizeRealm(realm),
                    prompt: p,
                    directions: COMPASS_DIRECTIONS.slice()
                };
            }

            return { kind: 'none', prompt: p };
        }

        /**
         * Tactical Gameplay Assistant (`analyzeTacticalSituation`)
         * Scans player vitals/statuses + carried items to surface non-intrusive survival remedies.
         */
        analyzeTacticalSituation(vitals = {}, items = [], realm = 'angband') {
            const r = this._normalizeRealm(realm);
            const advisories = [];
            const list = Array.isArray(items) ? items : [];
            const status = String(vitals.statusText || '').toLowerCase();
            const maxHp = Math.max(1, Number(vitals.maxHp || 100));
            const hp = Number(vitals.hp != null ? vitals.hp : maxHp);
            const hpRatio = hp / maxHp;

            const findItem = (regex) => list.find(it => regex.test(String(it.desc || it.label || it.name || '')));

            if (hpRatio <= 0.35) {
                const healPot = findItem(/\b(healing|extra healing|full healing|restore life|cure critical|cure serious)\b/i);
                const escapeScroll = findItem(/\b(phase door|teleportation|teleport|word of recall)\b/i);
                if (healPot) {
                    advisories.push({
                        id: 'low_hp_heal',
                        severity: 'critical',
                        label: `🩸 Low HP (${Math.round(hpRatio * 100)}%) — Quaff ${healPot.key || 'a'})`,
                        key: healPot.key || 'a',
                        verb: 'q'
                    });
                } else if (escapeScroll) {
                    advisories.push({
                        id: 'low_hp_escape',
                        severity: 'critical',
                        label: `🌀 Low HP (${Math.round(hpRatio * 100)}%) — Read Escape ${escapeScroll.key || 'a'})`,
                        key: escapeScroll.key || 'a',
                        verb: 'r'
                    });
                } else if (r === 'nethack' && hpRatio <= 0.20) {
                    advisories.push({
                        id: 'low_hp_pray',
                        severity: 'critical',
                        label: '🙏 Mortal Peril — Invoke #pray',
                        key: '',
                        verb: '#pray\n',
                        isExtended: true
                    });
                }
            }

            if (/\b(poison|poisoned|cut|bleeding|blind|confused)\b/.test(status)) {
                const curePot = findItem(/\b(neutralize poison|cure poison|healing|cure critical|unicorn horn)\b/i);
                if (curePot) {
                    advisories.push({
                        id: 'cure_ailment',
                        severity: 'warning',
                        label: `🧪 Status Hazard — Use Remedy ${curePot.key || 'a'})`,
                        key: curePot.key || 'a',
                        verb: 'q'
                    });
                }
            }

            if (/\b(hungry|weak|starving|fainting)\b/.test(status)) {
                const foodItem = findItem(/\b(ration|food|lembas|waybread|jerky|slime mold|melon|pancake)\b/i);
                if (foodItem) {
                    advisories.push({
                        id: 'eat_ration',
                        severity: 'warning',
                        label: `🍞 Hunger Warning — Eat ${foodItem.key || 'a'})`,
                        key: foodItem.key || 'a',
                        verb: r === 'nethack' ? 'e' : (r === 'silq' ? 'u' : 'E')
                    });
                }
            }

            return advisories;
        }

        setHoveredCell(x, y, meta = {}) {
            if (x == null || y == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
                return this.clearHover();
            }
            const cx = Number(x) | 0;
            const cy = Number(y) | 0;
            const source = String(meta.source || '3d');
            const label = String(meta.label || meta.name || '');
            const glyph = String(meta.glyph || meta.char || '');
            const sig = `${cx},${cy}:${source}:${glyph}:${label}`;
            if (sig === this._lastHoverSig) {
                return this._hoveredCell;
            }
            this._lastHoverSig = sig;
            this._hoveredCell = {
                x: cx,
                y: cy,
                source: source,
                label: label,
                glyph: glyph,
                buc: String(meta.buc || ''),
                feat: String(meta.feat || ''),
                hpRatio: (typeof meta.hpRatio === 'number') ? meta.hpRatio : null
            };
            for (const fn of this._hoverListeners) {
                try {
                    fn(this._hoveredCell);
                } catch (_) {}
            }
            return this._hoveredCell;
        }

        clearHover() {
            if (this._lastHoverSig === '') return null;
            this._lastHoverSig = '';
            this._hoveredCell = null;
            for (const fn of this._hoverListeners) {
                try {
                    fn(null);
                } catch (_) {}
            }
            return null;
        }

        getHoveredCell() {
            return this._hoveredCell;
        }

        onHoverChange(fn) {
            if (typeof fn === 'function') this._hoverListeners.add(fn);
            return () => this._hoverListeners.delete(fn);
        }

        setActiveModal(owner = 'none', coveringViewport = false) {
            const normOwner = String(owner || 'none');
            const covers = Boolean(coveringViewport && normOwner !== 'none');
            const sig = `${normOwner}:${covers}`;
            if (sig === this._lastModalSig) return;
            this._lastModalSig = sig;
            this._activeModalOwner = normOwner;
            this._modalCoveringViewport = covers;
            for (const fn of this._modalListeners) {
                try {
                    fn({ owner: normOwner, coveringViewport: covers });
                } catch (_) {}
            }
        }

        getActiveModal() {
            return {
                owner: this._activeModalOwner,
                coveringViewport: this._modalCoveringViewport
            };
        }

        isViewportCovered() {
            return this._modalCoveringViewport;
        }

        onModalChange(fn) {
            if (typeof fn === 'function') this._modalListeners.add(fn);
            return () => this._modalListeners.delete(fn);
        }

        evaluateThreatInterruption(prevTelemetry = {}, nextTelemetry = {}) {
            const maxHp = Math.max(1, Number(nextTelemetry.maxHp || prevTelemetry.maxHp || 1));
            const prevHp = Number(prevTelemetry.hp != null ? prevTelemetry.hp : maxHp);
            const nextHp = Number(nextTelemetry.hp != null ? nextTelemetry.hp : prevHp);
            const hpDropRatio = Math.max(0, (prevHp - nextHp) / maxHp);
            const hpRatio = nextHp / maxHp;

            if (hpDropRatio >= 0.20) {
                return { shouldInterrupt: true, severity: 'critical', reason: `Heavy damage taken (-${Math.round(hpDropRatio * 100)}% HP)` };
            }
            if (hpRatio <= 0.25 && nextHp < prevHp) {
                return { shouldInterrupt: true, severity: 'critical', reason: `Low HP threshold reached (${Math.round(hpRatio * 100)}%)` };
            }
            const prevHostiles = Number(prevTelemetry.visibleHostiles || 0);
            const nextHostiles = Number(nextTelemetry.visibleHostiles || 0);
            if (nextHostiles > prevHostiles) {
                return { shouldInterrupt: true, severity: 'warning', reason: 'Hostile monster entered line of sight' };
            }
            const statusText = String(nextTelemetry.statusText || '').toLowerCase();
            if (/\b(starving|fainting|fainted|choking|paraly[sz]ed|stunned|confused|blind)\b/.test(statusText)) {
                return { shouldInterrupt: true, severity: 'critical', reason: 'Critical status condition active' };
            }
            return { shouldInterrupt: false, severity: 'none', reason: '' };
        }

        buildTileContextActions(tileMeta = {}, realm = 'angband') {
            const r = this._normalizeRealm(realm);
            const RC = (typeof RealmCartridge !== 'undefined') ? RealmCartridge : ((typeof window !== 'undefined') ? window.RealmCartridge : null);
            const actions = [];

            if (tileMeta.hasMonster) {
                actions.push(
                    { id: 'target_fire', label: '🏹 Fire / Ranged', cmd: r === 'nethack' ? 'f' : 'f*' },
                    { id: 'cast_spell', label: '✨ Cast Spell', cmd: r === 'nethack' ? 'Z' : 'm' },
                    { id: 'inspect_monster', label: '🔍 Recall / Examine', cmd: r === 'nethack' ? ';' : 'l' }
                );
            }
            if (tileMeta.hasItem) {
                actions.push(
                    { id: 'pickup', label: '✋ Pick Up', cmd: r === 'nethack' ? ',' : 'g' },
                    { id: 'inspect_item', label: '🔍 Inspect', cmd: r === 'nethack' ? ':' : 'I' }
                );
            }
            if (tileMeta.feat && RC && typeof RC.getFeatureActions === 'function') {
                const featActs = RC.getFeatureActions(r, tileMeta.feat);
                for (let i = 0; i < featActs.length; i++) {
                    actions.push(featActs[i]);
                }
            }
            return actions;
        }
    }

    const singleton = new ScreenModalCoordinatorController();

    return {
        COMPASS_DIRECTIONS,
        ScreenModalCoordinatorController,
        getInstance: () => singleton,
        getQuickSlots: (r) => singleton.getQuickSlots(r),
        bindQuickSlot: (r, s, spec) => singleton.bindQuickSlot(r, s, spec),
        unbindQuickSlot: (r, s) => singleton.unbindQuickSlot(r, s),
        clearQuickSlot: (r, s) => singleton.clearQuickSlot(r, s),
        formatInscriptionTag: (s, v) => singleton.formatInscriptionTag(s, v),
        syncWithQuickActions: (r, q) => singleton.syncWithQuickActions(r, q),
        onQuickSlotsChange: (fn) => singleton.onQuickSlotsChange(fn),
        buildCommandTransaction: (i, st, r) => singleton.buildCommandTransaction(i, st, r),
        classifySubPrompt: (p, r) => singleton.classifySubPrompt(p, r),
        analyzeTacticalSituation: (v, it, r) => singleton.analyzeTacticalSituation(v, it, r),
        setHoveredCell: (x, y, m) => singleton.setHoveredCell(x, y, m),
        clearHover: () => singleton.clearHover(),
        getHoveredCell: () => singleton.getHoveredCell(),
        onHoverChange: (fn) => singleton.onHoverChange(fn),
        setActiveModal: (o, c) => singleton.setActiveModal(o, c),
        getActiveModal: () => singleton.getActiveModal(),
        isViewportCovered: () => singleton.isViewportCovered(),
        onModalChange: (fn) => singleton.onModalChange(fn),
        evaluateThreatInterruption: (p, n) => singleton.evaluateThreatInterruption(p, n),
        buildTileContextActions: (t, r) => singleton.buildTileContextActions(t, r)
    };
});

/** item-sheet.js — Noun-to-Verb Item Sheet Drawer (WS42 / WS80) */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ItemSheet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let ActionCatalogModule = null, RealmCartridgeModule = null;
    if (typeof require === 'function') {
        try { ActionCatalogModule = require('./action-catalog'); } catch (_) {}
        try { RealmCartridgeModule = require('./realm-cartridge'); } catch (_) {}
    }
    function getActionCatalog() {
        if (typeof window !== 'undefined' && window.ActionCatalog) return window.ActionCatalog;
        return ActionCatalogModule || null;
    }
    function getRealmCartridge() {
        if (typeof window !== 'undefined' && window.RealmCartridge) return window.RealmCartridge;
        return RealmCartridgeModule || null;
    }
    const EXAMINE_KEYS = Object.freeze({ angband: 'I', frogcomposband: 'I', hengband: 'I', silq: 'x', nethack: ':', dcss: 'v', brogue: 'x', rogue: 'I', ryod: 'I' });
    function getVisibleTabs(realm) {
        const r = String(realm || 'angband').toLowerCase();
        const RC = getRealmCartridge();
        const caps = (RC && typeof RC.getCapabilities === 'function') ? RC.getCapabilities(r) : null;
        const hasQuiver = (caps && caps.hasQuiver !== undefined) ? (caps.hasQuiver !== false) : (r !== 'silq' && r !== 'rogue' && r !== 'brogue');
        return hasQuiver ? ['pack', 'gear', 'quiver'] : ['pack', 'gear'];
    }

    // # ROOT-CAUSE: Track _selectedIndex and expose isOpen(), close(), and handleKeyDown() so keyboard navigation works seamlessly inside #item-sheet.
    let _lastSig = null, _activeTab = 'pack', _invokerEl = null, _selectedIndex = 0;
    let _lastItems = [], _lastFrame = null, _lastRealm = 'angband', _lastDispatcher = null;
    const _quickSlots = [null, null, null, null];

    function resolveEquipSlotCategory(raw, name, realm) {
        const tv = Number(raw && (raw.tval !== undefined ? raw.tval : raw.type)) || 0;
        const rNorm = String(realm || (raw && raw.realm) || _lastRealm || 'angband').toLowerCase();
        if (tv && typeof root !== 'undefined' && root.MASTER_ITEM_REGISTRY && typeof root.MASTER_ITEM_REGISTRY.normalizeTvalSlotCategory === 'function') {
            const cat = root.MASTER_ITEM_REGISTRY.normalizeTvalSlotCategory(tv, rNorm);
            if (cat) return cat;
        }
        if (rNorm === 'angband' && tv) {
            if (tv === 5) return 'bow';
            if (tv >= 6 && tv <= 9) return 'melee';
            const angCat = ({ 10: 'boots', 11: 'gloves', 12: 'head', 13: 'head', 14: 'shield', 15: 'cloak', 16: 'body', 17: 'body', 18: 'body', 19: 'light', 20: 'amulet', 21: 'ring' })[tv];
            if (angCat) return angCat;
        }
        if (tv === 19 && rNorm !== 'angband') return 'bow';
        if (tv >= 16 && tv <= 24 && rNorm !== 'angband') return 'melee';
        if (tv >= 30 && tv <= 45) return ({ 30: 'boots', 31: 'gloves', 32: 'head', 33: 'head', 34: 'shield', 35: 'cloak', 36: 'body', 37: 'body', 38: 'body', 39: 'light', 40: 'amulet', 45: 'ring' })[tv] || null;
        const sh = String((raw && (raw.slot_name || raw.slotName || raw.equip_slot)) || '').toLowerCase();
        for (const [k, re] of [['bow', /^(ranged|launcher|bow|shooter)$/], ['melee', /^(weapon|melee|main_hand|wield)$/], ['boots', /^(feet|boots)$/], ['gloves', /^(hands|gloves|gauntlets)$/], ['head', /^(head|helm|helmet|crown)$/], ['shield', /^(shield|off_hand|arm)$/], ['cloak', /^(cloak|mantle|back)$/], ['body', /^(body|torso|armor|armour)$/], ['light', /^(light|lite|source)$/], ['amulet', /^(neck|amulet)$/], ['ring', /^(finger|ring|left_ring|right_ring)$/]]) { if (re.test(sh)) return k; }
        const s = String(name || (raw && (raw.name || raw.dname || raw.label)) || '').toLowerCase();
        for (const [k, re] of [['bow', /\b(short bow|long bow|crossbow|sling|bow)\b/], ['boots', /\b(boots|sandals|shoes|greaves)\b/], ['gloves', /\b(gloves|gauntlets|cesti|mittens)\b/], ['head', /\b(helm|helmet|cap|crown|hat|hood)\b/], ['shield', /\b(shield|buckler|targe)\b/], ['cloak', /\b(cloak|cape|mantle)\b/], ['amulet', /\b(amulet|necklace|pendant|talisman)\b/], ['light', /\b(torch|lantern|phial|star of|arkenstone)\b/], ['body', /\b(mail|armour|armor|robe|leather|plate|hauberk|brigandine|doublet|jerkin|coat|dragon scale)\b/], ['ring', /\bring(?!\s+mail)\b/], ['melee', /\b(dagger|sword|blade|rapier|sabre|cutlass|tulwar|scimitar|katana|bastard|zweihander|spear|lance|pike|halberd|glaive|axe|hatchet|mace|club|flail|morning star|war hammer|quarterstaff|whip|pick|mattock|trident)\b/]]) { if (re.test(s)) return k; }
        return null;
    }

    function parseGearStats(name, raw, slotCat, isDescAc) {
        const s = String(name || (raw && (raw.name || raw.dname || raw.label)) || '');
        const diceM = s.match(/\((\d+)d(\d+)\)/), multM = s.match(/\(x(\d+)\)/i);
        const hitDamM = s.match(/\(([+-]\d+),\s*([+-]\d+)\)/);
        const acM = s.match(/\[(\d+)(?:,\s*([+-]\d+))?\]/) || s.match(/\[([+-]\d+)\]/);
        const avgDice = diceM ? (Number(diceM[1]) * (Number(diceM[2]) + 1) * 0.5) : ((raw && raw.dd && raw.ds) ? (Number(raw.dd) * (Number(raw.ds) + 1) * 0.5) : 0);
        const toDam = hitDamM ? Number(hitDamM[2]) : (Number(raw && (raw.to_d !== undefined ? raw.to_d : raw.bonus)) || 0);
        const dam = slotCat === 'bow' ? ((multM ? Number(multM[1]) : 1) * (2 + toDam)) : (toDam + avgDice);
        const acBonus = Number(raw && (raw.to_a !== undefined ? raw.to_a : raw.bonus)) || 0;
        const acBase = Number(raw && (raw.ac !== undefined ? raw.ac : raw.arm)) || 0;
        const ac = acM ? (acM[2] !== undefined ? Number(acM[1]) + (isDescAc ? -Number(acM[2]) : Number(acM[2])) : Number(acM[1])) : (isDescAc ? (acBase - acBonus) : (acBase + acBonus));
        const wt = Number(raw && raw.weight) || 0;
        const isWep = slotCat === 'melee' || slotCat === 'bow' || Boolean(diceM || (raw && raw.kind === 'weapon'));
        const isArm = (slotCat && /^(boots|gloves|head|shield|cloak|body)$/.test(slotCat)) || Boolean((acM && !diceM && !multM) || (raw && raw.kind === 'armor'));
        return { dam, ac, wt, isWep, isArm };
    }

    function compareWithEquipped(raw, nameOrEqList, maybeEqListOrRealm, maybeRealm) {
        const arg2IsArr = Array.isArray(nameOrEqList);
        const eqList = arg2IsArr ? nameOrEqList : maybeEqListOrRealm;
        const name = arg2IsArr ? ((raw && (raw.name || raw.dname || raw.label)) || '') : nameOrEqList;
        const realmArg = arg2IsArr ? (typeof maybeEqListOrRealm === 'string' ? maybeEqListOrRealm : maybeRealm) : maybeRealm;
        if (!Array.isArray(eqList) || !eqList.length) return null;
        const r = String(realmArg || (raw && raw.realm) || _lastRealm || (typeof window !== 'undefined' && ((window.__app && window.__app.getActiveRealm && window.__app.getActiveRealm()) || window.__activeRealm)) || 'angband').toLowerCase();
        const slotCat = resolveEquipSlotCategory(raw, name, r);
        if (!slotCat) return null;
        const RC = getRealmCartridge();
        const ds = (RC && typeof RC.getDefenseSchema === 'function') ? RC.getDefenseSchema(r) : null;
        const isDescAc = ds ? ds.direction === 'descending' : (r === 'rogue' || r === 'nethack');
        const cur = parseGearStats(name, raw, slotCat, isDescAc);
        if (!cur.isWep && !cur.isArm) return null;
        const eqMatch = eqList.find((e) => e && resolveEquipSlotCategory(e, e.name, r) === slotCat);
        if (!eqMatch) return null;
        const base = parseGearStats(eqMatch.name, eqMatch, slotCat, isDescAc);
        let dVal;
        if (!cur.isWep && RC && typeof RC.computeStatDelta === 'function') {
            const rcDelta = RC.computeStatDelta(raw, eqMatch, r, 'armor');
            if (rcDelta && rcDelta.deltaLabel) dVal = rcDelta.delta;
        }
        if (dVal === undefined) dVal = Math.round((cur.isWep ? (cur.dam - base.dam) : (isDescAc ? (base.ac - cur.ac) : (cur.ac - base.ac))) * 10) / 10;
        const dWt = cur.wt && base.wt ? Math.round((cur.wt - base.wt) / 10 * 10) / 10 : 0;
        return { metric: cur.isWep ? 'Dmg' : 'AC', delta: dVal, wtLb: cur.wt ? (cur.wt / 10).toFixed(1) : null, wtDelta: dWt };
    }

    function buildItemViewModel(frame, realm, tab, lang) {
        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const tabNorm = String(tab || 'pack').toLowerCase();
        const player = frame && frame.player;
        const eqList = (player && Array.isArray(player.equipment)) ? player.equipment : [];
        let rawItems = [], isEquipped = false;
        if (tabNorm === 'gear' || tabNorm === 'equipment') { rawItems = eqList; isEquipped = true; }
        else if (tabNorm === 'quiver') { rawItems = (player && Array.isArray(player.quiver)) ? player.quiver : []; }
        else { rawItems = (player && Array.isArray(player.inventory)) ? player.inventory : []; }

        const catalog = getActionCatalog(), result = [];
        for (let i = 0; i < rawItems.length; i++) {
            const raw = rawItems[i], slot = raw.slot !== undefined ? raw.slot : i;
            let name = raw.name || raw.dname || raw.label || 'Unknown Item';
            if (r === 'hengband' && (lang === 'jp' || lang === 'bilingual')) {
                const getLoc = (typeof window !== 'undefined' && window.getLocalizedItemName) || (typeof require === 'function' && typeof getLocalizedItemName === 'function' ? getLocalizedItemName : null);
                if (getLoc) name = getLoc(name, r, lang) || name;
            }
            const letter = raw.letter || raw.key || raw.label || '';
            const tval = raw.tval !== undefined ? raw.tval : (raw.type || 0), count = raw.count || raw.amt || raw.number || 1, inscription = raw.inscription || raw.note || '';
            let catalogVerbs = [];
            if (catalog && typeof catalog.validVerbsForItem === 'function') {
                catalogVerbs = catalog.validVerbsForItem(isEquipped ? raw : Object.assign({}, raw, { slot: undefined }), r, isEquipped);
            } else {
                catalogVerbs = (isEquipped ? ['takeoff', 'examine'] : ['wield', 'drop', 'examine']).map((id) => ({ id, keys: { [r]: id === 'examine' ? (EXAMINE_KEYS[r] || 'I') : id[0] }, labels: { en: id, jp: id } }));
            }
            if (tabNorm === 'quiver' && !catalogVerbs.some((c) => c.id === 'fire')) {
                const fireCmd = catalog && typeof catalog.get === 'function' ? catalog.get('fire') : null;
                if (fireCmd && fireCmd.keys && fireCmd.keys[r] !== null) catalogVerbs.unshift(fireCmd);
            }
            let hasPrimary = false;
            const validVerbs = [];
            for (let v = 0; v < catalogVerbs.length; v++) {
                const cmd = catalogVerbs[v];
                const rawKey = (cmd.keys && cmd.keys[r] !== undefined && cmd.keys[r] !== null) ? cmd.keys[r] : (cmd.key || '');
                const verbKey = (cmd.id === 'examine' && EXAMINE_KEYS[r]) ? EXAMINE_KEYS[r] : rawKey;
                const label = (lang === 'bilingual' && cmd.labels && cmd.labels.jp && cmd.labels.en) ? `${cmd.labels.en} (${cmd.labels.jp})` : ((lang === 'jp' && cmd.labels && cmd.labels.jp) ? cmd.labels.jp : ((cmd.labels && cmd.labels.en) || cmd.name || cmd.id));
                let primary = false;
                if (isEquipped) primary = (cmd.id === 'takeoff');
                else if (tabNorm === 'quiver') primary = (cmd.id === 'fire');
                else if (!hasPrimary && /^(quaff|read|eat|zap|aim|use_staff|wield|browse)$/.test(cmd.id)) { primary = true; hasPrimary = true; }
                let disabled = false, reason = '';
                if (catalog) {
                    if (typeof catalog.isAvailable === 'function' && !catalog.isAvailable(cmd.id)) { disabled = true; reason = 'Action currently unavailable'; }
                    if (!disabled && typeof raw.im === 'number' && catalog.VERB_BITS) {
                        const bitIdx = catalog.VERB_BITS.indexOf(cmd.id);
                        if (bitIdx >= 0 && ((raw.im & (1 << bitIdx)) !== 0)) { disabled = true; reason = raw.imReason || 'Cannot perform this action now'; }
                    }
                }
                validVerbs.push({ id: cmd.id, key: verbKey, label, primary, disabled, reason });
            }
            const compare = !isEquipped ? compareWithEquipped(raw, name, eqList, r) : null;
            result.push({ slot, letter, name, tval, count, inscription, compare, validVerbs, raw });
        }
        return result;
    }

    function bindQuickSlot(slotIndex, item, verb) {
        if (slotIndex >= 1 && slotIndex <= 4) {
            _quickSlots[slotIndex - 1] = { item, verb };
            if (typeof window !== 'undefined' && window.QuickActions && typeof window.QuickActions.setSlot === 'function' && item) {
                const r = _lastRealm || (window.__app && window.__app.getActiveRealm && window.__app.getActiveRealm()) || 'angband';
                const vKey = (verb && verb.key) || (typeof verb === 'string' ? verb : 'q');
                window.QuickActions.setSlot(r, slotIndex - 1, { type: 'item', verb: vKey, name: item.name, normalizedName: String(item.name || '').toLowerCase(), tval: Number(item.tval) || 0, fallbackKey: item.letter || 'a', icon: '⚡' });
            }
            return true;
        }
        return false;
    }

    function getQuickSlots() { return _quickSlots.slice(); }

    function executeVerb(item, verb, realm, dispatcher) {
        if (!verb || verb.disabled) return;
        hide();
        const r = String(realm || _lastRealm || 'angband').toLowerCase();
        const verbId = verb.id === 'inspect' ? 'examine' : verb.id;
        const verbKey = verb.key || (verb.keys && verb.keys[r]) || (verbId === 'examine' ? EXAMINE_KEYS[r] : '');
        const d = dispatcher || (typeof window !== 'undefined' && window.__app && window.__app.dispatcher) || null;
        if (d && typeof d.run === 'function') {
            d.run({ verb: verbId, key: verbKey || undefined, item: item.raw || item }, realm ? { realm: r } : undefined);
        } else {
            const net = (typeof window !== 'undefined') && ((window.__app && window.__app.network) || window.network);
            if (verbKey && net && typeof net.sendKey === 'function') {
                net.sendKey(verbKey);
            }
        }
    }

    function ensureContainer() {
        if (typeof document === 'undefined') return null;
        let c = document.getElementById('item-sheet') || document.getElementById('item-sheet-drawer');
        if (!c) {
            c = document.createElement('dialog');
            c.id = 'item-sheet'; c.className = 'item-sheet-dialog hidden'; c.hidden = true;
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
        if (containerOrOpts && containerOrOpts.nodeType) opts = { container: containerOrOpts };
        const container = opts.container || ensureContainer();
        if (!container) return;

        // # ROOT-CAUSE: Store _lastFrame/_lastRealm/_lastItems in render() and expose isOpen(), close(), and handleKeyDown() for full keyboard navigation inside #item-sheet.
        const r = String(typeof realm === 'string' ? realm : ((frame && frame.realm) || 'angband')).toLowerCase();
        const visibleTabs = getVisibleTabs(r);
        let tab = String(opts.tab || _activeTab || 'pack').toLowerCase();
        if (!visibleTabs.includes(tab)) { tab = 'pack'; _activeTab = 'pack'; }
        const lang = (typeof window !== 'undefined' && window.__langMode) || 'en';
        const items = buildItemViewModel(frame, r, tab, lang);

        _lastFrame = frame; _lastRealm = r; _lastDispatcher = opts.dispatcher || null; _lastItems = items;
        _selectedIndex = items.length > 0 ? Math.max(0, Math.min(items.length - 1, _selectedIndex)) : 0;

        const sig = `${r}:${tab}:${lang}:${_selectedIndex}:${items.length}:${items.map((i) => `${i.letter || ''}:${i.name || ''}:${i.count || i.qty || 1}:${i.inscription || ''}`).join(';')}`;
        if (sig === _lastSig) return;
        _lastSig = sig;

        const wasAlreadyOpen = Boolean(container.open || (!container.hidden && !container.classList.contains('hidden') && container.childNodes.length > 0));
        container.textContent = '';
        container.classList.toggle('is-open-stable', wasAlreadyOpen);

        const seen = [], header = document.createElement('div');
        header.className = 'item-sheet-header';
        const tabsWrap = document.createElement('div');
        tabsWrap.className = 'item-sheet-tabs';
        for (const td of [
            { id: 'pack', label: lang === 'jp' ? '持ち物' : (lang === 'bilingual' ? 'Pack (持ち物)' : 'Pack') },
            { id: 'gear', label: lang === 'jp' ? '装備' : (lang === 'bilingual' ? 'Gear (装備)' : 'Gear') },
            { id: 'quiver', label: lang === 'jp' ? '矢筒' : (lang === 'bilingual' ? 'Quiver (矢筒)' : 'Quiver') }
        ].filter((t) => visibleTabs.includes(t.id))) {
            const tabBtn = document.createElement('button');
            tabBtn.type = 'button'; tabBtn.className = `item-sheet-tab ${td.id === tab ? 'active' : ''}`;
            tabBtn.textContent = td.label; tabBtn.setAttribute('data-tab', td.id);
            tabBtn.addEventListener('click', () => { _activeTab = td.id; _selectedIndex = 0; _lastSig = null; render(frame, r, { container, tab: td.id, dispatcher: opts.dispatcher }); });
            tabsWrap.appendChild(tabBtn);
        }
        header.appendChild(tabsWrap);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button'; closeBtn.className = 'item-sheet-close'; closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close Item Sheet');
        closeBtn.addEventListener('click', hide);
        header.appendChild(closeBtn);
        container.appendChild(header);
        const listEl = document.createElement('div');
        listEl.className = 'item-sheet-list';
        if (items.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'item-sheet-empty';
            emptyEl.textContent = lang === 'jp' ? `アイテムがありません (${tab})` : (lang === 'bilingual' ? `No items in ${tab} (空)` : `No items in ${tab}.`);
            listEl.appendChild(emptyEl);
        } else {
            for (let i = 0; i < items.length; i++) {
                const item = items[i], card = document.createElement('div');
                card.className = `item-sheet-card${i === _selectedIndex ? ' is-selected' : ''}`;
                card.addEventListener('click', () => { _selectedIndex = i; _lastSig = null; render(frame, r, { container, tab, dispatcher: opts.dispatcher }); });
                const infoRow = document.createElement('div'), badge = document.createElement('kbd'), nameWrap = document.createElement('div'), nameEl = document.createElement('span');
                infoRow.className = 'item-sheet-info'; badge.className = 'item-sheet-badge';
                badge.textContent = item.letter ? `[${item.letter}]` : `[${i + 1}]`;
                infoRow.appendChild(badge);
                nameWrap.className = 'item-sheet-name-wrap'; nameEl.className = 'item-sheet-name';
                nameEl.textContent = item.count > 1 ? `${item.count}x ${item.name}` : item.name;
                nameWrap.appendChild(nameEl);
                if (item.inscription) {
                    const inscEl = document.createElement('span');
                    inscEl.className = 'item-sheet-inscription'; inscEl.textContent = ` {${item.inscription}}`;
                    nameWrap.appendChild(inscEl);
                }
                if (item.compare) {
                    const cmpEl = document.createElement('span'), d = item.compare.delta;
                    cmpEl.className = `item-sheet-delta ${d > 0 ? 'delta-up' : (d < 0 ? 'delta-down' : 'delta-even')}`;
                    cmpEl.style.cssText = `margin-left:8px;font-size:11px;font-weight:700;color:${d > 0 ? '#4ade80' : (d < 0 ? '#f87171' : '#94a3b8')};`;
                    cmpEl.textContent = `${d > 0 ? '+' : ''}${d} ${item.compare.metric}${item.compare.wtLb ? ` • ${item.compare.wtLb}lb` : ''}`;
                    nameWrap.appendChild(cmpEl);
                }
                infoRow.appendChild(nameWrap);
                card.appendChild(infoRow);
                const verbsRow = document.createElement('div');
                verbsRow.className = 'item-sheet-verbs';
                for (const verb of item.validVerbs) {
                    const vBtn = document.createElement('button');
                    vBtn.type = 'button'; vBtn.className = `item-verb-btn ${verb.primary ? 'primary' : ''} ${verb.disabled ? 'disabled' : ''}`;
                    if (verb.disabled) { vBtn.setAttribute('aria-disabled', 'true'); vBtn.title = verb.reason; }
                    if (verb.key) { const kbd = document.createElement('kbd'); kbd.className = 'item-verb-kbd'; kbd.textContent = `[${verb.key}]`; vBtn.appendChild(kbd); }
                    const labelSpan = document.createElement('span'); labelSpan.textContent = verb.label;
                    vBtn.appendChild(labelSpan);
                    vBtn.addEventListener('click', (e) => { e.stopPropagation(); executeVerb(item, verb, r, opts.dispatcher); });
                    verbsRow.appendChild(vBtn);
                }
                card.appendChild(verbsRow); listEl.appendChild(card);
            }
        }
        void seen;

        container.appendChild(listEl);
    }

    // # ROOT-CAUSE: Ensure isOpen() strictly checks c.open (or [open] attribute) on <dialog id="item-sheet"> so closed dialogs never intercept ArrowUp/ArrowDown/Tab/Enter in 3D gameplay.
    function isOpen() {
        const c = (typeof document !== 'undefined') ? (document.getElementById('item-sheet') || document.getElementById('item-sheet-drawer')) : null;
        if (!c || c.hidden || c.classList.contains('hidden')) return false;
        if (c.tagName === 'DIALOG') return Boolean(c.open || c.hasAttribute('open'));
        return c.childNodes.length > 0;
    }

    function handleKeyDown(e) {
        if (!isOpen() || !e) return false;
        if (e.key === 'Escape') { e.preventDefault(); hide(); return true; }
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.key === 'Tab' || e.key === '1' || e.key === '2' || e.key === '3') {
                e.preventDefault();
                const visibleTabs = getVisibleTabs(_lastRealm);
                if (e.key === '3' && visibleTabs.length < 3) return true;
                const curIdx = Math.max(0, visibleTabs.indexOf(_activeTab));
                const len = visibleTabs.length;
                _activeTab = e.key === 'Tab' ? visibleTabs[(curIdx + (e.shiftKey ? len - 1 : 1)) % len] : (visibleTabs[parseInt(e.key, 10) - 1] || 'pack');
                _selectedIndex = 0; _lastSig = null;
                render(_lastFrame, _lastRealm, { tab: _activeTab, dispatcher: _lastDispatcher });
                return true;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (_lastItems.length > 0) {
                    _selectedIndex = (_selectedIndex + (e.key === 'ArrowDown' ? 1 : -1) + _lastItems.length) % _lastItems.length;
                    _lastSig = null;
                    render(_lastFrame, _lastRealm, { tab: _activeTab, dispatcher: _lastDispatcher });
                }
                return true;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const item = _lastItems[_selectedIndex];
                if (item && Array.isArray(item.validVerbs)) {
                    const verb = item.validVerbs.find((v) => v.primary && !v.disabled) || item.validVerbs.find((v) => !v.disabled);
                    if (verb) executeVerb(item, verb, _lastRealm, _lastDispatcher);
                }
                return true;
            }
            if (/^[a-zA-Z]$/.test(e.key)) {
                const matched = _lastItems.find((it) => it && it.letter === e.key);
                if (matched && Array.isArray(matched.validVerbs)) {
                    e.preventDefault();
                    const verb = matched.validVerbs.find((v) => v.primary && !v.disabled) || matched.validVerbs.find((v) => !v.disabled);
                    if (verb) executeVerb(matched, verb, _lastRealm, _lastDispatcher);
                    return true;
                }
            }
        }
        return false;
    }

    function show(frame, realm, invokerEl) {
        _invokerEl = invokerEl || null; _selectedIndex = 0;
        const r = String(typeof realm === 'string' ? realm : ((frame && frame.realm) || 'angband')).toLowerCase();
        if (!getVisibleTabs(r).includes(_activeTab)) _activeTab = 'pack';
        const c = ensureContainer();
        if (c) {
            c.hidden = false; c.classList.remove('hidden');
            if (typeof c.showModal === 'function' && !c.open) { try { c.showModal(); } catch (_) { c.setAttribute('open', ''); } }
            else c.setAttribute('open', '');
            _lastSig = null;
            render(frame, realm, { container: c, tab: _activeTab });
        }
    }

    function hide() {
        _lastSig = null;
        const c = (typeof document !== 'undefined') ? (document.getElementById('item-sheet') || document.getElementById('item-sheet-drawer')) : null;
        if (c) {
            if (typeof c.close === 'function' && c.open) { try { c.close(); } catch (_) { c.removeAttribute('open'); } }
            else c.removeAttribute('open');
            c.hidden = true; c.classList.add('hidden'); c.textContent = '';
        }
        if (_invokerEl && typeof _invokerEl.focus === 'function') { try { _invokerEl.focus(); } catch (_) {} _invokerEl = null; }
    }

    function toggle(frame, realm, invokerEl) { if (isOpen()) hide(); else show(frame, realm, invokerEl); }

    return Object.freeze({ compareWithEquipped, buildItemViewModel, bindQuickSlot, getQuickSlots, executeVerb, render, show, hide, close: hide, toggle, isOpen, handleKeyDown });
});

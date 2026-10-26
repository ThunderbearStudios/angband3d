/**
 * RealmGrimoireDeck — Diegetic Dark-Fantasy Grimoire, Armory & Heraldic Menu Deck (WS42.6 Rebase)
 * Unified renderer over ScreenModel & ActionCatalog; <= 250 LOC.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RealmGrimoireDeck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const REALM_HERALDRY = {
        angband: { id: 'angband', crestTitle: 'IRON CROWN OF MORGOTH', subtitle: 'Vaults of Thangorodrim', accent: '#d4af37', svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18h18M4 15l2-9 4 5 2-7 2 7 4-5 2 9H4z"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>' },
        silq: { id: 'silq', crestTitle: 'LAY OF LEITHIAN & SILMARIL', subtitle: 'Halls of Menegroth & Angband', accent: '#a8d5e5', svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 19 9 12 22 5 9 12 2"/><path d="M5 9h14M12 2v20"/></svg>' },
        frogcomposband: { id: 'frogcomposband', crestTitle: 'COURTS OF CHAOS & AMBER', subtitle: 'Pattern of Amber & Logrus', accent: '#b47ede', svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>' },
        hengband: { id: 'hengband', crestTitle: 'SCROLLS OF THE FIVE RINGS', subtitle: 'Gensokyo & Sengoku Abyss', accent: '#e0533c', svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><rect x="9" y="9" width="6" height="6"/></svg>' }
    };

    const SILQ_PILLARS = [
        { key: 'Melee', label: '⚔️ Melee', hint: 'Blade & polearm mastery' }, { key: 'Archery', label: '🏹 Archery', hint: 'Bow & throwing precision' },
        { key: 'Evasion', label: '🛡️ Evasion', hint: 'Footwork, dodging & parry' }, { key: 'Stealth', label: '🌑 Stealth', hint: 'Shadow-walking & ambush' },
        { key: 'Perception', label: '👁️ Perception', hint: 'Keen sight & lore discovery' }, { key: 'Will', label: '🔥 Will', hint: 'Inner resolve & curse resistance' },
        { key: 'Smithing', label: '🔨 Smithing', hint: 'Noldorin anvil & rune craft' }, { key: 'Song', label: '🎵 Song', hint: 'Chants of Finrod & Lúthien' }
    ];

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function detectRarity(desc) {
        const s = String(desc || '');
        if (/\{.*?(special|splendid|artifact|unmaker|morgoth|feanor|celebrimbor|特別|アーティファクト).*?\}/i.test(s) || /\bThe [A-Z][a-z]+ of [A-Z]/.test(s) || /'[A-Z][^']+'/.test(s) || /★/.test(s)) return 'artifact';
        if (/\{.*?(excellent|ego|fine|masterwork|良質|エゴ|高級).*?\}/i.test(s) || /\(\+\d+,\s*\+\d+\)\s*\[[^\]]+\]\s*\(\+\d+\)/.test(s) || /\bof (Slay|Execute|Westernesse|Gondolin|Noldor|Lothlorien|Fury|Speed|Extra Attacks|Resistance|Free Action|Immunity)\b/i.test(s) || /☆/.test(s)) return 'ego';
        return /\(\+\d+|\[\d+,\s*\+\d+\]/.test(s) ? 'enchanted' : 'common';
    }

    function classifyItemCategory(desc) {
        const s = String(desc || ''), l = s.toLowerCase();
        if (/\b(potion|phial|draught|elixir|flask)\b/.test(l) || /(の薬|水薬|霊薬|フラスコ)/.test(s)) return { category: 'potion', icon: '🧪', rarity: detectRarity(s) };
        if (/\b(scroll|parchment|card|trump)\b/.test(l) || /(の巻物|巻物|カード)/.test(s)) return { category: 'scroll', icon: '📜', rarity: detectRarity(s) };
        if (/\b(wand|rod|staff)\b/.test(l) || /(魔法棒|ロッド|スタッフ|の杖)/.test(s)) return { category: 'device', icon: '🪄', rarity: detectRarity(s) };
        if (/\b(book|tome|grimoire|manual|hymnal|songbook|scrolls of)\b/.test(l) || /(魔法書|仙術書|経典|教本)/.test(s)) return { category: 'tome', icon: '📖', rarity: detectRarity(s) };
        if (/\b(ring|amulet|necklace|pendant|torque|brooch)\b/.test(l) || /(指輪|アミュレット|首飾り|ペンダント)/.test(s)) return { category: 'jewelry', icon: '💍', rarity: detectRarity(s) };
        if (/\b(ration|food|bread|waybread|lembas|jerky|mushroom|slime mold|biscuit|pint of|strip of)\b/.test(l) || /(食料|レーション|ビスケット|干し肉|キノコ|パン|エール|ワイン)/.test(s)) return { category: 'food', icon: '🍞', rarity: 'common' };
        if (/\b(torch|lantern|phial of galadriel|star of|aril|feanor|light)\b/.test(l) || /(松明|ランタン|ランプ|アルケン石)/.test(s)) return { category: 'light', icon: '🕯️', rarity: detectRarity(s) };
        if (/\b(sword|dagger|blade|rapier|sabre|cutlass|katana|wakizashi|tulwar|scimitar|bastard|claymore|zweihander|spear|lance|halberd|pike|glaive|axe|hatchet|mace|flail|hammer|maul|quarterstaff|whip|club)\b/.test(l) || /(剣|刀|脇差|短刀|ダガー|レイピア|サーベル|槍|斧|メイス|ハンマー|ムチ|棍棒)/.test(s)) return { category: 'weapon', icon: '⚔️', rarity: detectRarity(s) };
        if (/\b(bow|longbow|shortbow|crossbow|sling|arrow|seeker|bolt|shot|pebble|ammunition)\b/.test(l) || /(ボウ|スリング|弓|矢|弾|丸石)/.test(s)) return { category: 'ranged', icon: '🏹', rarity: detectRarity(s) };
        if (/\b(armour|armor|mail|plate|hauberk|brigandine|leather|robe|cloak|shield|buckler|helm|helmet|crown|cap|gloves|gauntlets|cesti|boots|greaves|sandals)\b/.test(l) || /(鎧|メイル|アーマー|プレート|ローブ|クローク|外套|盾|シールド|兜|ヘルム|冠|帽子|グローブ|篭手|靴|ブーツ)/.test(s)) return { category: 'armor', icon: '🛡️', rarity: detectRarity(s) };
        return { category: 'misc', icon: '🏺', rarity: detectRarity(s) };
    }

    function parseItemMetrics(desc) {
        let cleanName = String(desc || '').trim(), weight = '', price = '';
        const wm = cleanName.match(/\s+(\d+(?:\.\d+)?\s*(?:lb|kg))s?(?:\s+(\d+)\s*)?$/i);
        if (wm) { weight = wm[1]; if (wm[2]) price = wm[2] + ' au'; cleanName = cleanName.slice(0, wm.index).trim(); }
        else { const pm = cleanName.match(/\s{2,}(\d{1,7})\s*$/); if (pm) { price = pm[1] + ' au'; cleanName = cleanName.slice(0, pm.index).trim(); } }
        const st = [];
        const dm = cleanName.match(/\(\d+d\d+[^)]*\)/); if (dm) st.push(dm[0]);
        const am = cleanName.match(/\[\d+[^\]]*\]/); if (am) st.push(am[0]);
        const mm = cleanName.match(/\b(\d+)\s*(?:sp|mp|mana)\b/i); if (mm) st.push(mm[0]);
        const fm = cleanName.match(/\b(\d{1,3})%\s*(?:fail|失敗)?/i); if (fm) st.push(fm[1] + '%');
        return { cleanName, weight, price, stats: st.join(' · ') };
    }

    function getAvailableVerbsForItem(cat, realm, ctx = {}) {
        const AC = (typeof ActionCatalog !== 'undefined') ? ActionCatalog : ((typeof window !== 'undefined') ? window.ActionCatalog : null);
        if (AC && typeof AC.validVerbsForItem === 'function' && !ctx.isStoreScreen && !ctx.isSpellPowerChoice && !ctx.isItemTargetPrompt) {
            const dummyItem = { type: cat, tval: cat, name: cat };
            const v = AC.validVerbsForItem(dummyItem, realm, false);
            if (v && v.length) return v.map(a => ({ id: a.id, label: a.label, verb: a.key, isBind: a.id === 'bind' }));
        }
        const r = String(realm || 'angband').toLowerCase(), isJp = r === 'hengband' && ctx.lang === 'jp', isBi = r === 'hengband' && ctx.lang === 'bilingual';
        const lbl = (en, jp, bi) => isJp ? jp : (isBi ? (bi || `${en} (${jp.replace(/^[^\s]+\s*/, '')})`) : en);
        if (ctx.isStoreScreen) return [{ id: 'buy', label: lbl('🪙 Buy / Take', '🪙 購入 / 受取', '🪙 Buy (購入)'), verb: 'p' }, { id: 'inspect', label: lbl('🔍 Examine', '🔍 調査', '🔍 Examine (調査)'), verb: 'I' }];
        if (ctx.isSpellPowerChoice || (ctx.submenu && (ctx.submenu.isFcbPowerMenu || ctx.submenu.isHengbandMagicMenu))) return [{ id: 'invoke', label: lbl('✨ Cast / Invoke', '✨ 詠唱 / 発動', '✨ Cast (詠唱)'), verb: '' }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind (登録)'), verb: '__bind_spell__' }];
        if (ctx.isItemTargetPrompt) return [{ id: 'select', label: lbl('✓ Choose Slot', '✓ 選択', '✓ Select (選択)'), verb: '' }];
        if (r === 'silq') {
            const v = [];
            if (/^(weapon|ranged|armor|jewelry|light)$/.test(cat)) v.push({ id: 'wield', label: '⚔️ Wield / Wear', verb: 'w' });
            if (/^(potion|scroll|device|food|light)$/.test(cat)) v.push({ id: 'use', label: '✨ Use Item', verb: 'u' }, { id: 'bind', label: '⚡ Bind', verb: 'u', isBind: true });
            v.push({ id: 'inspect', label: '🔍 Inspect', verb: 'x' }, { id: 'drop', label: '⬇️ Drop', verb: 'd' });
            return v;
        }
        const verbs = [];
        if (/^(weapon|ranged|armor|jewelry|light)$/.test(cat)) {
            verbs.push({ id: 'wield', label: lbl('⚔️ Wield', '⚔️ 装備', '⚔️ Wield (装備)'), verb: 'w' });
            if (cat === 'ranged') verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'f', isBind: true });
        }
        if (cat === 'potion') verbs.push({ id: 'quaff', label: lbl('🧪 Quaff', '🧪 飲む', '🧪 Quaff (薬)'), verb: 'q' }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'q', isBind: true });
        else if (cat === 'scroll') verbs.push({ id: 'read', label: lbl('📜 Read', '📜 読む', '📜 Read (巻)'), verb: 'r' }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'r', isBind: true });
        else if (cat === 'food') verbs.push({ id: 'eat', label: lbl('🍞 Eat', '🍞 食べる', '🍞 Eat (食)'), verb: 'E' });
        else if (cat === 'device') { const dv = (r === 'hengband' || r === 'frogcomposband') ? 'a' : 'u'; verbs.push({ id: 'use', label: lbl('🪄 Use / Aim', '🪄 使う', '🪄 Use (使)'), verb: dv }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: dv, isBind: true }); }
        else if (cat === 'tome') verbs.push({ id: 'browse', label: lbl('📖 Browse', '📖 閲覧', '📖 Browse (閲)'), verb: 'b' }, { id: 'cast', label: lbl('✨ Cast', '✨ 詠唱', '✨ Cast (呪)'), verb: 'm' }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'm', isBind: true });
        verbs.push({ id: 'inspect', label: lbl('🔍 Inspect', '🔍 調査', '🔍 Inspect (調)'), verb: 'I' }, { id: 'drop', label: lbl('⬇️ Drop', '⬇️ 落とす', '⬇️ Drop (落)'), verb: 'd' });
        return verbs;
    }

    class GrimoireDeckController {
        constructor() {
            this.mode = 'classic';
            this.manualTerminalMode = true;
            this._menuActive = false;
            this._lastSig = '';
            this._boundContainer = null;
            this._onActionCallback = null;
        }
        isSupportedMode(m) { return m === 'classic' || m === 'hybrid'; }
        setMode(m) {
            if (!this.isSupportedMode(m)) return this.mode;
            this.mode = m;
            this.manualTerminalMode = (m === 'classic');
            this._lastSig = '';
            this._syncPrimaryOpenClass();
            return this.mode;
        }
        toggleMode() { return this.setMode(this.mode === 'classic' ? 'hybrid' : 'classic'); }
        getHeraldry(realm) { return REALM_HERALDRY[String(realm || 'angband').toLowerCase()] || REALM_HERALDRY.angband; }
        _syncPrimaryOpenClass() {
            if (typeof document === 'undefined') return;
            const c = this._boundContainer || document.getElementById('grimoire-deck-container');
            const open = Boolean(c && c.style.display !== 'none' && !this.manualTerminalMode && this.mode !== 'classic');
            if (document.body) document.body.classList.toggle('grimoire-primary-open', open);
            ['terminal-window', 'terminal-card', 'terminal-container'].forEach(id => {
                const el = document.getElementById(id); if (el) el.classList.toggle('grimoire-primary-open', open);
            });
            const btn = document.getElementById('btn-term-grimoire-toggle');
            if (btn) {
                if (!btn._gBound) { btn._gBound = true; btn.addEventListener('click', () => { this.toggleMode(); if (this._onActionCallback) this._onActionCallback({ type: 'toggle-mode', mode: this.mode }); }); }
                btn.style.display = (this._menuActive && this.mode !== 'classic') ? 'inline-flex' : 'none';
                if (this._menuActive) btn.textContent = (this.mode === 'classic') ? '🃏 Cards [F10]' : '⌨️ Classic [F10]';
            }
        }
        hide(container) {
            this._menuActive = false;
            const el = container || this._boundContainer;
            if (el && el.style.display !== 'none') { el.style.display = 'none'; el.innerHTML = ''; }
            this._lastSig = '';
            this._syncPrimaryOpenClass();
        }
        render(container, options = {}) {
            if (!container) return false;
            this._boundContainer = container;
            if (typeof options.onAction === 'function') this._onActionCallback = options.onAction;
            const realm = String(options.realm || 'angband').toLowerCase(), heraldry = this.getHeraldry(realm);
            const SC = (typeof ScreenContext !== 'undefined') ? ScreenContext : ((typeof window !== 'undefined') ? window.ScreenContext : null);
            const model = (SC && SC.ScreenModel && options.frame) ? SC.ScreenModel.of(options.frame, realm, options) : (options.model || null);
            const rawClassifier = options.classifier || (model && model.legacy) || {}, submenu = options.submenu || {};
            const items = Array.isArray(options.items) ? options.items : (model && model.items) || [];
            const isInv = Boolean(rawClassifier.isInventoryScreen || (rawClassifier.mode === 'item-list' && rawClassifier.listKind === 'inven' && !rawClassifier.verbPrompt));
            const isEq = Boolean(rawClassifier.isEquipScreen || (rawClassifier.mode === 'item-list' && rawClassifier.listKind === 'equip' && !rawClassifier.verbPrompt));
            const isStore = Boolean(rawClassifier.isStoreScreen || rawClassifier.isStore || rawClassifier.mode === 'store');
            const isSpell = Boolean(rawClassifier.isSpellPowerChoice || /^(cast|browse|study)$/.test(rawClassifier.verbPrompt));
            const isTarget = Boolean(rawClassifier.isItemTargetPrompt || (rawClassifier.mode === 'item-list' && rawClassifier.promptKind === 'select' && rawClassifier.verbPrompt && !isSpell));
            const isMenuActive = Boolean(isInv || isEq || isStore || isSpell || isTarget || submenu.isSilqAbilityTree || submenu.isSilqSmithing || submenu.isFcbPowerMenu || submenu.isHengbandMagicMenu);
            this._menuActive = isMenuActive;
            if (!isMenuActive) { this.hide(container); return false; }
            if (this.mode === 'classic') {
                if (container.style.display !== 'none') { container.style.display = 'none'; container.innerHTML = ''; }
                this._lastSig = `classic:${realm}`;
                this._syncPrimaryOpenClass();
                return true;
            }
            const lang = (realm === 'hengband') ? String(options.lang || (typeof window !== 'undefined' && window.__langMode) || 'en').toLowerCase() : 'en';
            const isJp = realm === 'hengband' && lang === 'jp', isBi = realm === 'hengband' && lang === 'bilingual';
            const promptText = String(options.promptText || (rawClassifier && rawClassifier.row0) || (model && model.prompt && model.prompt.text) || '').trim();
            const itemDigest = items.slice(0, 18).map(it => `${it.key || it.letter || ''}:${it.desc || it.rawLabel || it.label || it.name || ''}`).join('|');
            const sig = `${realm}:${lang}:${this.mode}:${submenu.kind || ''}:${isInv}:${isEq}:${isStore}:${isSpell}:${isTarget}:${promptText.slice(0, 32)}:${items.length}:${itemDigest}`;
            if (sig === this._lastSig && container.style.display !== 'none') { this._syncPrimaryOpenClass(); return true; }
            const wasAlreadyOpen = container.style.display !== 'none' && container.innerHTML !== '';
            this._lastSig = sig;
            let viewLabel = isJp ? '武具・所持品' : (isBi ? 'ARMORY & PACK (所持品)' : 'ARMORY & PACK');
            if (submenu.isSilqAbilityTree) viewLabel = 'SIL-Q ABILITY TAPESTRY';
            else if (submenu.isSilqSmithing) viewLabel = 'NOLDORIN ANVIL FORGE';
            else if (submenu.isFcbPowerMenu) viewLabel = 'CHAOS & RACIAL POWERS';
            else if (submenu.isHengbandMagicMenu) viewLabel = isJp ? '術法・仙術の巻' : (isBi ? 'SCROLLS OF JUTSU (術法)' : 'SCROLLS OF JUTSU & MIND');
            else if (isStore) viewLabel = isJp ? '街の商店・取引' : (isBi ? 'MERCHANT EMPORIUM (商店)' : 'MERCHANT EMPORIUM');
            else if (isEq) viewLabel = isJp ? '装備中の武具' : (isBi ? 'WIELDED PANOPLY (装備品)' : 'WIELDED PANOPLY');
            else if (isSpell) viewLabel = isJp ? '魔道書・秘伝書' : (isBi ? 'ARCANE GRIMOIRE (魔道書)' : 'ARCANE GRIMOIRE');
            else if (isTarget) viewLabel = isJp ? '対象アイテムを選択' : (isBi ? 'CHOOSE ITEM (対象選択)' : 'CHOOSE TARGET ITEM');

            let switcher = '';
            if (isInv || isEq) {
                switcher = `<div class="grimoire-tab-group" role="tablist"><button type="button" class="grimoire-tab-btn ${isInv ? 'is-active' : ''}" data-grimoire-cmd="switch-view" data-grimoire-key="i">${isJp ? '🎒 所持品' : (isBi ? '🎒 Pack (所持)' : '🎒 Pack')}</button><button type="button" class="grimoire-tab-btn ${isEq ? 'is-active' : ''}" data-grimoire-cmd="switch-view" data-grimoire-key="e">${isJp ? '🛡️ 装備品' : (isBi ? '🛡️ Equipped (装備)' : '🛡️ Equipped')}</button>${realm === 'angband' ? '<button type="button" class="grimoire-tab-btn" data-grimoire-cmd="switch-view" data-grimoire-key="|">🏹 Quiver</button>' : ''}</div>`;
            } else if (submenu.isSilqAbilityTree) {
                switcher = `<div class="grimoire-tab-group" role="group"><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="ArrowLeft">◀ Pillar</button><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="ArrowRight">Pillar ▶</button><button type="button" class="grimoire-tab-btn is-active" data-grimoire-cmd="raw-key" data-grimoire-key="Enter">✨ Learn</button></div>`;
            } else if (submenu.isSilqSmithing) {
                switcher = `<div class="grimoire-tab-group" role="group"><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="w">⚔️ Weapons</button><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="a">🛡️ Armour</button><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="r">💍 Rings</button><button type="button" class="grimoire-tab-btn is-active" data-grimoire-cmd="raw-key" data-grimoire-key="Enter">🔨 Forge</button></div>`;
            }

            let body = '';
            if (submenu.isSilqAbilityTree && items.length === 0) {
                body = `<div class="grimoire-pillar-grid">${SILQ_PILLARS.map((p, idx) => `<button type="button" class="grimoire-pillar-card" data-grimoire-cmd="pillar-step" data-pillar-index="${idx}"><span class="grimoire-pillar-title">${escapeHtml(p.label)}</span><span class="grimoire-pillar-hint">${escapeHtml(p.hint)}</span></button>`).join('')}</div>`;
            } else if (items.length > 0) {
                body = `<div class="grimoire-card-grid" role="list">${items.slice(0, 18).map((it, idx) => {
                    const isVan = realm === 'angband', key = String(it.key || it.letter || (isVan ? (typeof QuickActions !== 'undefined' && QuickActions.vanillaLetter ? QuickActions.vanillaLetter(idx) : 'abcdefgimnopqrstuvwxyz'[idx]) : String.fromCharCode(97 + idx)));
                    const desc = String(it.desc || it.rawLabel || it.label || it.name || ''), cat = classifyItemCategory(desc), metrics = parseItemMetrics(desc);
                    const verbs = getAvailableVerbsForItem(cat.category, realm, { lang, isStoreScreen: isStore, isSpellPowerChoice: isSpell, isItemTargetPrompt: isTarget, submenu });
                    const pv = verbs[0] || { id: 'select', label: isJp ? '選択' : 'Select', verb: '' }, sv = verbs.slice(1, 5);
                    const pBtn = `<button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-primary-verb ${pv.isBind ? 'grimoire-bind-btn' : ''}" data-grimoire-cmd="item-primary" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="${escapeHtml(pv.verb)}" data-grimoire-name="${escapeHtml(metrics.cleanName)}" data-grimoire-category="${cat.category}" data-grimoire-icon="${cat.icon}" data-grimoire-row="${Number(it.row || 0)}" data-grimoire-col="${Number(it.col || 0)}">${escapeHtml(pv.label)}</button>`;
                    const sBtns = sv.map(v => `<button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-secondary-verb ${v.isBind ? 'grimoire-bind-btn' : ''}" data-grimoire-cmd="${v.isBind ? 'bind-quick-slot' : 'item-verb'}" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="${escapeHtml(v.verb)}" data-grimoire-name="${escapeHtml(metrics.cleanName)}" data-grimoire-category="${cat.category}" data-grimoire-icon="${cat.icon}" data-grimoire-row="${Number(it.row || 0)}" data-grimoire-col="${Number(it.col || 0)}">${escapeHtml(v.label)}</button>`).join('');
                    const more = sv.length ? `<button type="button" class="grimoire-more-verbs-btn" data-grimoire-cmd="toggle-card-verbs">⋯</button>` : '';
                    return `<div class="grimoire-item-card rarity-${cat.rarity}" data-slot-key="${escapeHtml(key)}"><div class="grimoire-card-main" role="button" tabindex="0" data-grimoire-cmd="item-primary" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="${escapeHtml(pv.verb)}" data-grimoire-row="${Number(it.row || 0)}" data-grimoire-col="${Number(it.col || 0)}"><span class="grimoire-slot-medallion">${escapeHtml(key)})</span><span class="grimoire-item-icon" aria-hidden="true">${cat.icon}</span><div class="grimoire-item-copy"><div class="grimoire-item-title">${escapeHtml(metrics.cleanName)}</div><div class="grimoire-item-meta">${metrics.stats ? `<span class="grimoire-meta-stat">${escapeHtml(metrics.stats)}</span>` : ''}${metrics.weight ? `<span class="grimoire-meta-weight">${escapeHtml(metrics.weight)}</span>` : ''}${metrics.price ? `<span class="grimoire-meta-price">${escapeHtml(metrics.price)}</span>` : ''}</div></div></div><div class="grimoire-card-actions">${pBtn}${sBtns}${more}</div></div>`;
                }).join('')}</div>`;
            }

            const modeBtn = this.mode === 'classic' ? (isJp ? '📜 カード表示 [F10]' : '📜 Cards [F10]') : (isJp ? '📜 端末のみ [F10]' : '📜 Classic [F10]');
            container.innerHTML = `<div class="grimoire-deck-shell${wasAlreadyOpen ? ' is-open-stable' : ''}" data-realm="${escapeHtml(realm)}" data-mode="${this.mode}"><div class="grimoire-deck-header"><div class="grimoire-crest-banner"><span class="grimoire-crest-icon">${heraldry.svgCrest}</span><span class="grimoire-crest-realm">${escapeHtml(isJp ? '五輪書・変愚蛮怒' : heraldry.crestTitle)}</span><span class="grimoire-crest-sep">·</span><span class="grimoire-crest-view">${escapeHtml(viewLabel)}</span>${promptText ? `<span class="grimoire-prompt-subtitle">${escapeHtml(promptText)}</span>` : `<span class="grimoire-crest-sub">${escapeHtml(heraldry.subtitle)}</span>`}</div><div class="grimoire-header-controls">${switcher}<button type="button" class="grimoire-mode-toggle-btn" data-grimoire-cmd="toggle-mode">${escapeHtml(modeBtn)}</button></div></div>${body}</div>`;
            container.style.display = 'block';
            this._syncPrimaryOpenClass();

            if (!container._grimoireListenerBound) {
                container._grimoireListenerBound = true;
                container.addEventListener('click', (ev) => {
                    const t = ev.target && ev.target.closest ? ev.target.closest('[data-grimoire-cmd]') : null;
                    if (!t) return;
                    ev.preventDefault(); ev.stopPropagation();
                    const cmd = t.getAttribute('data-grimoire-cmd');
                    if (cmd === 'toggle-card-verbs') { const card = t.closest('.grimoire-item-card'); if (card) card.classList.toggle('actions-expanded'); return; }
                    if (cmd === 'toggle-mode') { this.toggleMode(); if (this._onActionCallback) this._onActionCallback({ type: 'toggle-mode', mode: this.mode }); return; }
                    if (this._onActionCallback) {
                        this._onActionCallback({
                            type: cmd, key: t.getAttribute('data-grimoire-key') || '', verb: t.getAttribute('data-grimoire-verb') || '',
                            name: t.getAttribute('data-grimoire-name') || '', category: t.getAttribute('data-grimoire-category') || '',
                            icon: t.getAttribute('data-grimoire-icon') || '', row: Number(t.getAttribute('data-grimoire-row') || 0),
                            col: Number(t.getAttribute('data-grimoire-col') || 0), pillarIndex: Number(t.getAttribute('data-pillar-index') || 0)
                        });
                    }
                });
            }
            return true;
        }
    }

    const singleton = new GrimoireDeckController();
    return {
        REALM_HERALDRY, SILQ_PILLARS, classifyItemCategory, detectRarity, parseItemMetrics, getAvailableVerbsForItem, GrimoireDeckController,
        getInstance: () => singleton,
        get mode() { return singleton.mode; },
        set mode(v) { singleton.setMode(v); },
        get manualTerminalMode() { return singleton.manualTerminalMode; },
        set manualTerminalMode(v) { singleton.manualTerminalMode = Boolean(v); },
        getHeraldry: (r) => singleton.getHeraldry(r),
        render: (c, o) => singleton.render(c, o),
        hide: (c) => singleton.hide(c),
        toggleMode: () => singleton.toggleMode(),
        setMode: (m) => singleton.setMode(m),
        isSupportedMode: (m) => singleton.isSupportedMode(m)
    };
});

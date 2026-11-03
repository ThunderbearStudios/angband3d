/**
 * RealmGrimoireDeck — Sovereign Diegetic Grimoire Sanctum, Hero Panoply Matrix,
 * Category Filter Deck, BUC Beatitude & Stat-Delta Inspector (WS42.6–WS54).
 *
 * Implements HCI & Cognitive Ergonomics Best Practices:
 *   - Hick-Hyman Law Category Chunking (`All`, `Arms`, `Panoply`, `Alchemy`, `Arcana`, `Devices`, `Rations`, `Relics`)
 *   - Zero-Truncation 52-Slot Inventory Support (`items.slice(0, 52)` when `_activeCategory === 'all'`)
 *   - Hero Panoply Summary Strip (Slot Capacity, Carried Weight, Live BUC Beatitude Tallies)
 *   - Stat-Delta Comparison Chips (`▲ +3 AC` / `▲ +2.5 Dmg` vs equipped gear)
 *   - Diegetic Sub-Prompt Banner (`Direction` 8-Way Compass Rose, `[Y]/[N]`, `--More--`)
 *   - NetHack `#` Extended Ritual Bar (`#pray`, `#dip`, `#offer`, `#loot`, `#untrap`, `#chat`, `#force`)
 *   - Tactical Gameplay Assistant Remedy Banner (`ScreenModalCoordinator.analyzeTacticalSituation`)
 *
 * Contract: Pure UMD module, dirty-signature gated (Law U3), 100% IP-clean (IP-CLEAN-01).
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
        hengband: { id: 'hengband', crestTitle: 'SCROLLS OF THE FIVE RINGS', subtitle: 'Gensokyo & Sengoku Abyss', accent: '#e0533c', svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><rect x="9" y="9" width="6" height="6"/></svg>' },
        nethack: { id: 'nethack', crestTitle: 'AMULET OF YENDOR', subtitle: 'Mazes of Menace & Gehennom', accent: '#10b981', svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="10" r="5"/><path d="M7 4c2 2 8 2 10 0M12 15v7M9 19h6"/></svg>' }
    };

    const SILQ_PILLARS = [
        { key: 'Melee', label: '⚔️ Melee', hint: 'Blade & polearm mastery' }, { key: 'Archery', label: '🏹 Archery', hint: 'Bow & throwing precision' },
        { key: 'Evasion', label: '🛡️ Evasion', hint: 'Footwork, dodging & parry' }, { key: 'Stealth', label: '🌑 Stealth', hint: 'Shadow-walking & ambush' },
        { key: 'Perception', label: '👁️ Perception', hint: 'Keen sight & lore discovery' }, { key: 'Will', label: '🔥 Will', hint: 'Inner resolve & curse resistance' },
        { key: 'Smithing', label: '🔨 Smithing', hint: 'Noldorin anvil & rune craft' }, { key: 'Song', label: '🎵 Song', hint: 'Chants of Finrod & Lúthien' }
    ];

    const CATEGORY_GROUPS = [
        { id: 'all',     label: 'All',        match: () => true },
        { id: 'weapon',  label: '⚔️ Arms',    match: (c) => c === 'weapon' || c === 'ranged' },
        { id: 'armor',   label: '🛡️ Panoply', match: (c) => c === 'armor' || c === 'jewelry' },
        { id: 'potion',  label: '🧪 Alchemy', match: (c) => c === 'potion' },
        { id: 'scroll',  label: '📜 Arcana',  match: (c) => c === 'scroll' || c === 'tome' },
        { id: 'device',  label: '🪄 Devices', match: (c) => c === 'device' },
        { id: 'food',    label: '🍞 Rations', match: (c) => c === 'food' },
        { id: 'misc',    label: '🗝️ Relics',  match: (c) => c === 'light' || c === 'misc' }
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
        if (/\b(book|tome|grimoire|manual|hymnal|songbook|scrolls of|spellbook)\b/.test(l) || /(魔法書|仙術書|経典|教本)/.test(s)) return { category: 'tome', icon: '📖', rarity: detectRarity(s) };
        if (/\b(ring|amulet|necklace|pendant|torque|brooch)\b/.test(l) || /(指輪|アミュレット|首飾り|ペンダント)/.test(s)) return { category: 'jewelry', icon: '💍', rarity: detectRarity(s) };
        if (/\b(ration|food|bread|waybread|lembas|jerky|mushroom|slime mold|biscuit|pint of|strip of)\b/.test(l) || /(食料|レーション|ビスケット|干し肉|キノコ|パン|エール|ワイン)/.test(s)) return { category: 'food', icon: '🍞', rarity: 'common' };
        if (/\b(torch|lantern|phial of galadriel|star of|aril|feanor|light|lamp)\b/.test(l) || /(松明|ランタン|ランプ|アルケン石)/.test(s)) return { category: 'light', icon: '🕯️', rarity: detectRarity(s) };
        if (/\b(sword|dagger|blade|rapier|sabre|cutlass|katana|wakizashi|tulwar|scimitar|bastard|claymore|zweihander|spear|lance|halberd|pike|glaive|axe|hatchet|mace|flail|hammer|maul|quarterstaff|whip|club)\b/.test(l) || /(剣|刀|脇差|短刀|ダガー|レイピア|サーベル|槍|斧|メイス|ハンマー|ムチ|棍棒)/.test(s)) return { category: 'weapon', icon: '⚔️', rarity: detectRarity(s) };
        if (/\b(bow|longbow|shortbow|crossbow|sling|arrow|seeker|bolt|shot|pebble|ammunition)\b/.test(l) || /(ボウ|スリング|弓|矢|弾|丸石)/.test(s)) return { category: 'ranged', icon: '🏹', rarity: detectRarity(s) };
        if (/\b(armour|armor|mail|plate|hauberk|brigandine|leather|robe|cloak|shield|buckler|helm|helmet|crown|cap|gloves|gauntlets|cesti|boots|greaves|sandals|shirt)\b/.test(l) || /(鎧|メイル|アーマー|プレート|ローブ|クローク|外套|盾|シールド|兜|ヘルム|冠|帽子|グローブ|篭手|靴|ブーツ)/.test(s)) return { category: 'armor', icon: '🛡️', rarity: detectRarity(s) };
        return { category: 'misc', icon: '🏺', rarity: detectRarity(s) };
    }

    function parseItemMetrics(desc) {
        let cleanName = String(desc || '').trim(), weight = '', price = '', weightNum = 0;
        const wm = cleanName.match(/\s+(\d+(?:\.\d+)?\s*(?:lb|kg))s?(?:\s+(\d+)\s*)?$/i);
        if (wm) {
            weight = wm[1];
            weightNum = parseFloat(wm[1]) || 0;
            if (wm[2]) price = wm[2] + ' au';
            cleanName = cleanName.slice(0, wm.index).trim();
        } else {
            const pm = cleanName.match(/\s{2,}(\d{1,7})\s*$/);
            if (pm) { price = pm[1] + ' au'; cleanName = cleanName.slice(0, pm.index).trim(); }
        }
        const st = [];
        const dm = cleanName.match(/\(\d+d\d+[^)]*\)/); if (dm) st.push(dm[0]);
        const am = cleanName.match(/\[\d+[^\]]*\]/); if (am) st.push(am[0]);
        const mm = cleanName.match(/\b(\d+)\s*(?:sp|mp|mana)\b/i); if (mm) st.push(mm[0]);
        const fm = cleanName.match(/\b(\d{1,3})%\s*(?:fail|失敗)?/i); if (fm) st.push(fm[1] + '%');
        return { cleanName, weight, weightNum, price, stats: st.join(' · ') };
    }

    function parseBeatitude(desc, item) {
        const RC = (typeof RealmCartridge !== 'undefined') ? RealmCartridge : ((typeof window !== 'undefined') ? window.RealmCartridge : null);
        if (RC && typeof RC.parseBeatitudeBUC === 'function') return RC.parseBeatitudeBUC(desc, item);
        const s = String(desc || '');
        if (/\b(uncursed|non-cursed)\b/i.test(s) || /\{uncursed\}/i.test(s)) return { buc: 'uncursed', badgeLabel: '○ Uncursed', shortCode: 'U' };
        if (/\b(blessed|holy)\b/i.test(s) || /\{blessed\}/i.test(s)) return { buc: 'blessed', badgeLabel: '✦ Blessed', shortCode: 'B' };
        if (/\b(cursed)\b/i.test(s) || /\{cursed\}/i.test(s)) return { buc: 'cursed', badgeLabel: '☠ Cursed', shortCode: 'C' };
        return { buc: 'unknown', badgeLabel: '', shortCode: '?' };
    }

    function getAvailableVerbsForItem(cat, realm, ctx = {}) {
        const RC = (typeof RealmCartridge !== 'undefined') ? RealmCartridge : ((typeof window !== 'undefined') ? window.RealmCartridge : null);
        const AC = (typeof ActionCatalog !== 'undefined') ? ActionCatalog : ((typeof window !== 'undefined') ? window.ActionCatalog : null);
        const r = String(realm || 'angband').toLowerCase(), isJp = r === 'hengband' && ctx.lang === 'jp';
        if (r === 'nethack' && RC && typeof RC.resolveVerbsForCategory === 'function') {
            return RC.resolveVerbsForCategory(cat, realm, ctx);
        }
        if (AC && typeof AC.decodeVerbMask === 'function' && ctx.item && typeof ctx.item.vm === 'number' && ctx.item.vm > 0 && !ctx.isStoreScreen && !ctx.isSpellPowerChoice && !ctx.isItemTargetPrompt) {
            const v = AC.decodeVerbMask(ctx.item.vm, r);
            if (v && v.length) {
                return v.map(a => ({
                    id: a.id,
                    label: (a.labels && (isJp ? a.labels.jp : a.labels.en)) || a.label || a.id,
                    verb: (a.keys && a.keys[r]) || a.key || '',
                    isBind: a.id === 'bind'
                }));
            }
        }
        if (RC && typeof RC.resolveVerbsForCategory === 'function') {
            return RC.resolveVerbsForCategory(cat, realm, ctx);
        }
        const isBi = r === 'hengband' && ctx.lang === 'bilingual';
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
            this._activeCategory = 'all';
            this._lastOptions = null;
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
        setCategory(catId) {
            this._activeCategory = String(catId || 'all').toLowerCase();
            this._lastSig = '';
            if (this._boundContainer && this._lastOptions) {
                this.render(this._boundContainer, this._lastOptions);
            }
            return this._activeCategory;
        }
        getHeraldry(realm) {
            const key = String(realm || 'angband').toLowerCase();
            if (REALM_HERALDRY[key]) return REALM_HERALDRY[key];
            const RC = (typeof RealmCartridge !== 'undefined') ? RealmCartridge : ((typeof window !== 'undefined') ? window.RealmCartridge : null);
            if (RC && typeof RC.getHeraldry === 'function') return RC.getHeraldry(key);
            return REALM_HERALDRY.angband;
        }
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
                btn.style.display = this._menuActive ? 'inline-flex' : 'none';
                if (this._menuActive) btn.textContent = (this.mode === 'classic') ? '🃏 Cards [F10]' : '⌨️ Classic [F10]';
            }
        }
        hide(container) {
            this._menuActive = false;
            this._activeCategory = 'all';
            const el = container || this._boundContainer;
            if (el && el.style.display !== 'none') { el.style.display = 'none'; el.innerHTML = ''; }
            this._lastSig = '';
            this._syncPrimaryOpenClass();
        }
        render(container, options = {}) {
            if (!container) return false;
            this._boundContainer = container;
            this._lastOptions = options;
            if (typeof options.onAction === 'function') this._onActionCallback = options.onAction;
            const realm = String(options.realm || 'angband').toLowerCase(), heraldry = this.getHeraldry(realm);
            const RC = (typeof RealmCartridge !== 'undefined') ? RealmCartridge : ((typeof window !== 'undefined') ? window.RealmCartridge : null);
            const SMC = (typeof ScreenModalCoordinator !== 'undefined') ? ScreenModalCoordinator : ((typeof window !== 'undefined') ? window.ScreenModalCoordinator : null);
            const SC = (typeof ScreenContext !== 'undefined') ? ScreenContext : ((typeof window !== 'undefined') ? window.ScreenContext : null);
            if (RC && typeof RC.applyThemeTokens === 'function' && typeof document !== 'undefined') {
                RC.applyThemeTokens(realm, document);
            }
            const model = (SC && SC.ScreenModel && options.frame) ? SC.ScreenModel.of(options.frame, realm, options) : (options.model || null);
            const rawClassifier = options.classifier || (model && model.legacy) || {}, submenu = options.submenu || {};
            const items = Array.isArray(options.items) ? options.items : (model && model.items) || [];
            const isInv = Boolean(rawClassifier.isInventoryScreen || (rawClassifier.mode === 'item-list' && rawClassifier.listKind === 'inven' && !rawClassifier.verbPrompt));
            const isEq = Boolean(rawClassifier.isEquipScreen || (rawClassifier.mode === 'item-list' && rawClassifier.listKind === 'equip' && !rawClassifier.verbPrompt));
            const isStore = Boolean(rawClassifier.isStoreScreen || rawClassifier.isStore || rawClassifier.mode === 'store');
            const isSpell = Boolean(rawClassifier.isSpellPowerChoice || /^(cast|browse|study)$/.test(rawClassifier.verbPrompt));
            const isTarget = Boolean(rawClassifier.isItemTargetPrompt || (rawClassifier.verbPrompt && !isSpell));
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
            const slicedItems = items.slice(0, 52);
            const itemDigest = slicedItems.map(it => `${it.key || it.letter || ''}:${it.desc || it.rawLabel || it.label || it.name || ''}`).join('|');
            const sig = `${realm}:${lang}:${this.mode}:${this._activeCategory}:${submenu.kind || ''}:${isInv}:${isEq}:${isStore}:${isSpell}:${isTarget}:${promptText.slice(0, 32)}:${items.length}:${itemDigest}`;
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
                const hasQuiver = realm === 'angband' || realm === 'nethack';
                const quivKey = realm === 'nethack' ? 'Q' : '|';
                switcher = `<div class="grimoire-tab-group" role="tablist"><button type="button" class="grimoire-tab-btn ${isInv ? 'is-active' : ''}" data-grimoire-cmd="switch-view" data-grimoire-key="i">${isJp ? '🎒 所持品' : (isBi ? '🎒 Pack (所持)' : '🎒 Pack')}</button><button type="button" class="grimoire-tab-btn ${isEq ? 'is-active' : ''}" data-grimoire-cmd="switch-view" data-grimoire-key="e">${isJp ? '🛡️ 装備品' : (isBi ? '🛡️ Equipped (装備)' : '🛡️ Equipped')}</button>${hasQuiver ? `<button type="button" class="grimoire-tab-btn" data-grimoire-cmd="switch-view" data-grimoire-key="${quivKey}">🏹 Quiver</button>` : ''}</div>`;
            } else if (submenu.isSilqAbilityTree) {
                switcher = `<div class="grimoire-tab-group" role="group"><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="ArrowLeft">◀ Pillar</button><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="ArrowRight">Pillar ▶</button><button type="button" class="grimoire-tab-btn is-active" data-grimoire-cmd="raw-key" data-grimoire-key="Enter">✨ Learn</button></div>`;
            } else if (submenu.isSilqSmithing) {
                switcher = `<div class="grimoire-tab-group" role="group"><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="w">⚔️ Weapons</button><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="a">🛡️ Armour</button><button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="r">💍 Rings</button><button type="button" class="grimoire-tab-btn is-active" data-grimoire-cmd="raw-key" data-grimoire-key="Enter">🔨 Forge</button></div>`;
            }

            // Enrich all 52 items with category, metrics, BUC, and stat-delta
            const equippedByCategory = options.equippedByCategory || {};
            let totalWeight = 0, blessedCount = 0, uncursedCount = 0, cursedCount = 0;
            const enrichedItems = slicedItems.map((it, idx) => {
                const isVan = realm === 'angband';
                const key = String(it.key || it.letter || (RC && RC.getSlotLetter ? RC.getSlotLetter(idx, realm) : (isVan ? (typeof QuickActions !== 'undefined' && QuickActions.vanillaLetter ? QuickActions.vanillaLetter(idx) : 'abcdefgimnopqrstuvwxyz'[idx]) : 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$'[idx])));
                const desc = String(it.desc || it.rawLabel || it.label || it.name || '');
                const cat = classifyItemCategory(desc);
                const metrics = parseItemMetrics(desc);
                const bucInfo = parseBeatitude(desc, it);
                totalWeight += metrics.weightNum || 0;
                if (bucInfo.buc === 'blessed') blessedCount++;
                else if (bucInfo.buc === 'uncursed') uncursedCount++;
                else if (bucInfo.buc === 'cursed') cursedCount++;
                const eqRef = equippedByCategory[cat.category] || null;
                const delta = (RC && typeof RC.compareWithEquipped === 'function' && eqRef && !isEq)
                    ? RC.compareWithEquipped(metrics.cleanName + ' ' + metrics.stats, eqRef, cat.category)
                    : { deltaLabel: '', isUpgrade: false, isDowngrade: false };
                return { it, idx, key, desc, cat, metrics, bucInfo, delta };
            });

            // Category Filter Bar & Hero Panoply Summary Strip
            const maxSlots = (RC && RC.getCapabilities) ? (RC.getCapabilities(realm).maxInventoryVisible || 24) : (realm === 'nethack' ? 52 : 24);
            let panoplyAndFilterBar = '';
            if (enrichedItems.length > 0) {
                const bucSummary = (realm === 'nethack' || blessedCount + uncursedCount + cursedCount > 0)
                    ? `<span class="grimoire-panoply-buc"><span class="buc-tally-b">✦ ${blessedCount}</span> · <span class="buc-tally-u">○ ${uncursedCount}</span> · <span class="buc-tally-c">☠ ${cursedCount}</span></span>`
                    : '';
                const weightSummary = totalWeight > 0 ? `<span class="grimoire-panoply-weight">⚖️ ${totalWeight.toFixed(1)} lb</span>` : '';
                const catPills = CATEGORY_GROUPS.map(g => {
                    const count = g.id === 'all' ? enrichedItems.length : enrichedItems.filter(e => g.match(e.cat.category)).length;
                    if (g.id !== 'all' && count === 0) return '';
                    const activeCls = this._activeCategory === g.id ? 'is-active' : '';
                    return `<button type="button" class="grimoire-cat-pill ${activeCls}" data-grimoire-cmd="filter-cat" data-grimoire-cat="${g.id}">${escapeHtml(g.label)} <span class="grimoire-cat-count">${count}</span></button>`;
                }).join('');
                panoplyAndFilterBar = `<div class="grimoire-panoply-strip"><div class="grimoire-panoply-metrics"><span class="grimoire-panoply-slots">🎒 ${enrichedItems.length}/${maxSlots} Slots</span>${weightSummary}${bucSummary}</div><div class="grimoire-cat-bar" role="toolbar">${catPills}</div></div>`;
            }

            // Filter displayed cards according to active category (`all` shows all 52)
            const activeGroup = CATEGORY_GROUPS.find(g => g.id === this._activeCategory) || CATEGORY_GROUPS[0];
            const visibleEntries = enrichedItems.filter(e => activeGroup.match(e.cat.category));

            let body = '';
            if (submenu.isSilqAbilityTree && items.length === 0) {
                body = `<div class="grimoire-pillar-grid">${SILQ_PILLARS.map((p, idx) => `<button type="button" class="grimoire-pillar-card" data-grimoire-cmd="pillar-step" data-pillar-index="${idx}"><span class="grimoire-pillar-title">${escapeHtml(p.label)}</span><span class="grimoire-pillar-hint">${escapeHtml(p.hint)}</span></button>`).join('')}</div>`;
            } else if (visibleEntries.length > 0) {
                body = `<div class="grimoire-card-grid" role="list">${visibleEntries.map(({ it, key, desc, cat, metrics, bucInfo, delta }) => {
                    const bucBadge = bucInfo.buc !== 'unknown' ? `<span class="grimoire-buc-badge buc-${escapeHtml(bucInfo.buc)}">${escapeHtml(bucInfo.badgeLabel)}</span>` : '';
                    const deltaBadge = delta.deltaLabel ? `<span class="grimoire-stat-delta ${delta.isUpgrade ? 'is-upgrade' : (delta.isDowngrade ? 'is-downgrade' : '')}">${escapeHtml(delta.deltaLabel)}</span>` : '';
                    const verbs = getAvailableVerbsForItem(cat.category, realm, { lang, isEquipScreen: isEq, isStoreScreen: isStore, isSpellPowerChoice: isSpell, isItemTargetPrompt: isTarget, itemDesc: desc, item: it, submenu });
                    const pv = verbs[0] || { id: 'select', label: isJp ? '選択' : 'Select', verb: '' }, sv = verbs.slice(1, 5);
                    const pBtn = `<button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-primary-verb ${pv.isBind ? 'grimoire-bind-btn' : ''}" data-grimoire-cmd="item-primary" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="${escapeHtml(pv.verb)}" data-grimoire-name="${escapeHtml(metrics.cleanName)}" data-grimoire-category="${cat.category}" data-grimoire-icon="${cat.icon}" data-grimoire-row="${Number(it.row || 0)}" data-grimoire-col="${Number(it.col || 0)}">${escapeHtml(pv.label)}</button>`;
                    const sBtns = sv.map(v => `<button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-secondary-verb ${v.isBind ? 'grimoire-bind-btn' : ''}" data-grimoire-cmd="${v.isBind ? 'bind-quick-slot' : 'item-verb'}" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="${escapeHtml(v.verb)}" data-grimoire-name="${escapeHtml(metrics.cleanName)}" data-grimoire-category="${cat.category}" data-grimoire-icon="${cat.icon}" data-grimoire-row="${Number(it.row || 0)}" data-grimoire-col="${Number(it.col || 0)}">${escapeHtml(v.label)}</button>`).join('');
                    const more = sv.length ? `<button type="button" class="grimoire-more-verbs-btn" data-grimoire-cmd="toggle-card-verbs">⋯</button>` : '';
                    return `<div class="grimoire-item-card rarity-${cat.rarity} ${bucInfo.buc !== 'unknown' ? 'buc-card-' + bucInfo.buc : ''}" data-slot-key="${escapeHtml(key)}" data-item-cat="${cat.category}"><div class="grimoire-card-main" role="button" tabindex="0" data-grimoire-cmd="item-primary" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="${escapeHtml(pv.verb)}" data-grimoire-row="${Number(it.row || 0)}" data-grimoire-col="${Number(it.col || 0)}"><span class="grimoire-slot-medallion">${escapeHtml(key)})</span><span class="grimoire-item-icon" aria-hidden="true">${cat.icon}</span><div class="grimoire-item-copy"><div class="grimoire-item-title">${escapeHtml(metrics.cleanName)} ${bucBadge} ${deltaBadge}</div><div class="grimoire-item-meta">${metrics.stats ? `<span class="grimoire-meta-stat">${escapeHtml(metrics.stats)}</span>` : ''}${metrics.weight ? `<span class="grimoire-meta-weight">${escapeHtml(metrics.weight)}</span>` : ''}${metrics.price ? `<span class="grimoire-meta-price">${escapeHtml(metrics.price)}</span>` : ''}</div></div></div><div class="grimoire-card-actions">${pBtn}${sBtns}${more}</div></div>`;
                }).join('')}</div>`;
            } else if (enrichedItems.length > 0 && this._activeCategory !== 'all') {
                body = `<div class="grimoire-card-grid" role="list"><button type="button" class="grimoire-cat-pill is-active" data-grimoire-cmd="filter-cat" data-grimoire-cat="all">📦 No matching items in filter — Show All (${enrichedItems.length})</button></div>`;
            }

            // Sub-Prompt Banner (Direction Compass / Confirm Y-N / More)
            let subPromptHtml = '';
            if (SMC && typeof SMC.classifySubPrompt === 'function' && promptText) {
                const sub = SMC.classifySubPrompt(promptText, realm);
                if (sub.kind === 'direction') {
                    subPromptHtml = `<div class="grimoire-subprompt-banner" data-subprompt="direction"><span class="grimoire-subprompt-label">🧭 ${escapeHtml(sub.prompt)}</span><div class="grimoire-subprompt-actions">${sub.directions.map(d => `<button type="button" class="grimoire-subprompt-btn" data-grimoire-cmd="raw-key" data-grimoire-key="${escapeHtml(d.key)}">${escapeHtml(d.label)}</button>`).join('')}</div></div>`;
                } else if (sub.kind === 'confirm-yn' || sub.kind === 'more') {
                    subPromptHtml = `<div class="grimoire-subprompt-banner" data-subprompt="${sub.kind}"><span class="grimoire-subprompt-label">💬 ${escapeHtml(sub.prompt)}</span><div class="grimoire-subprompt-actions">${sub.options.map(o => `<button type="button" class="grimoire-subprompt-btn ${o.primary ? 'is-primary' : ''}" data-grimoire-cmd="raw-key" data-grimoire-key="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>`).join('')}</div></div>`;
                }
            }
            if (SMC && typeof SMC.analyzeTacticalSituation === 'function' && options.vitals) {
                const advs = SMC.analyzeTacticalSituation(options.vitals, enrichedItems.map(e => ({ key: e.key, desc: e.desc })), realm);
                if (Array.isArray(advs) && advs.length > 0) {
                    subPromptHtml += `<div class="grimoire-subprompt-banner" data-subprompt="tactical-remedy"><span class="grimoire-subprompt-label">🛡️ Tactical Advisory:</span><div class="grimoire-subprompt-actions">${advs.map(a => `<button type="button" class="grimoire-subprompt-btn is-primary" data-grimoire-cmd="${a.isExtended ? 'extended-cmd' : 'item-verb'}" data-grimoire-key="${escapeHtml(a.key || '')}" data-grimoire-verb="${escapeHtml(a.verb || '')}">${escapeHtml(a.label)}</button>`).join('')}</div></div>`;
                }
            }

            // NetHack Extended `#` Ritual Bar
            let ritualBarHtml = '';
            if (realm === 'nethack') {
                const extCmds = (RC && typeof RC.getExtendedCommands === 'function')
                    ? RC.getExtendedCommands('nethack')
                    : [
                        { id: 'pray', label: '🙏 #pray', verb: '#pray\n' },
                        { id: 'dip', label: '⛲ #dip', verb: '#dip\n' },
                        { id: 'offer', label: '🕯️ #offer', verb: '#offer\n' },
                        { id: 'loot', label: '📦 #loot', verb: '#loot\n' },
                        { id: 'untrap', label: '🪤 #untrap', verb: '#untrap\n' },
                        { id: 'chat', label: '💬 #chat', verb: '#chat\n' },
                        { id: 'force', label: '🗡️ #force', verb: '#force\n' }
                    ];
                ritualBarHtml = `<div class="grimoire-ritual-bar" role="toolbar"><span class="grimoire-ritual-title">⚱️ Rituals:</span>${extCmds.map(c => `<button type="button" class="grimoire-ritual-btn" data-grimoire-cmd="extended-cmd" data-grimoire-verb="${escapeHtml(c.verb)}" title="${escapeHtml(c.hint || c.label)}">${escapeHtml(c.label)}</button>`).join('')}</div>`;
            }

            const modeBtn = this.mode === 'classic' ? (isJp ? '📜 カード表示 [F10]' : '📜 Cards [F10]') : (isJp ? '📜 端末のみ [F10]' : '📜 Classic [F10]');
            container.innerHTML = `<div class="grimoire-deck-shell${wasAlreadyOpen ? ' is-open-stable' : ''}" data-realm="${escapeHtml(realm)}" data-mode="${this.mode}"><div class="grimoire-deck-header"><div class="grimoire-crest-banner"><span class="grimoire-crest-icon">${heraldry.svgCrest}</span><span class="grimoire-crest-realm">${escapeHtml(isJp ? '五輪書・変愚蛮怒' : heraldry.crestTitle)}</span><span class="grimoire-crest-sep">·</span><span class="grimoire-crest-view">${escapeHtml(viewLabel)}</span>${promptText ? `<span class="grimoire-prompt-subtitle">${escapeHtml(promptText)}</span>` : `<span class="grimoire-crest-sub">${escapeHtml(heraldry.subtitle)}</span>`}</div><div class="grimoire-header-controls">${switcher}<button type="button" class="grimoire-mode-toggle-btn" data-grimoire-cmd="toggle-mode">${escapeHtml(modeBtn)}</button></div></div>${subPromptHtml}${panoplyAndFilterBar}${body}${ritualBarHtml}</div>`;
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
                    if (cmd === 'filter-cat') { this.setCategory(t.getAttribute('data-grimoire-cat') || 'all'); return; }
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
        REALM_HERALDRY, SILQ_PILLARS, CATEGORY_GROUPS, classifyItemCategory, detectRarity, parseItemMetrics, parseBeatitude, getAvailableVerbsForItem, GrimoireDeckController,
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
        setCategory: (cat) => singleton.setCategory(cat),
        isSupportedMode: (m) => singleton.isSupportedMode(m)
    };
});

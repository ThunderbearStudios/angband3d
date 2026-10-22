/**
 * RealmGrimoireDeck — Diegetic Dark-Fantasy Grimoire, Armory & Heraldic Menu Deck
 *
 * Bridges the 80x24 C-engine terminal grids of Angband 4.2.6, Sil-Q 1.5,
 * FrogComposband 7.1, and Hengband 3.0 into a tactile, realm-authentic
 * dark-fantasy card & tapestry interface while preserving 100% C-engine parity.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RealmGrimoireDeck = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const REALM_HERALDRY = {
        angband: {
            id: 'angband',
            name: 'Pits of Angband',
            crestTitle: 'IRON CROWN OF MORGOTH',
            subtitle: 'Vaults of Thangorodrim',
            resourceLabel: 'MANA',
            accent: '#d4af37',
            borderStyle: 'Obsidian & Forged Gold',
            svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18h18M4 15l2-9 4 5 2-7 2 7 4-5 2 9H4z"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>'
        },
        silq: {
            id: 'silq',
            name: 'Sil-Q: First Age',
            crestTitle: 'LAY OF LEITHIAN & SILMARIL',
            subtitle: 'Halls of Menegroth & Angband',
            resourceLabel: 'GRACE / VOICE',
            accent: '#a8d5e5',
            borderStyle: 'Elven Mithril & Beleriand Ash',
            svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 19 9 12 22 5 9 12 2"/><path d="M5 9h14M12 2v20"/></svg>'
        },
        frogcomposband: {
            id: 'frogcomposband',
            name: 'FrogComposband',
            crestTitle: 'COURTS OF CHAOS & AMBER',
            subtitle: 'Pattern of Amber & Logrus',
            resourceLabel: 'POWER / MANA',
            accent: '#b47ede',
            borderStyle: 'Eldritch Amethyst & Wyrd Brass',
            svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>'
        },
        hengband: {
            id: 'hengband',
            name: 'Hengband (変愚蛮怒)',
            crestTitle: 'SCROLLS OF THE FIVE RINGS',
            subtitle: 'Gensokyo & Sengoku Abyss',
            resourceLabel: 'KI / MIND',
            accent: '#e0533c',
            borderStyle: 'Cinnabar Lacquer & Shakudo Gold',
            svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><rect x="9" y="9" width="6" height="6"/></svg>'
        }
    };

    const SILQ_PILLARS = [
        { key: 'Melee', label: '⚔️ Melee', hint: 'Blade & polearm mastery' },
        { key: 'Archery', label: '🏹 Archery', hint: 'Bow & throwing precision' },
        { key: 'Evasion', label: '🛡️ Evasion', hint: 'Footwork, dodging & parry' },
        { key: 'Stealth', label: '🌑 Stealth', hint: 'Shadow-walking & ambush' },
        { key: 'Perception', label: '👁️ Perception', hint: 'Keen sight & lore discovery' },
        { key: 'Will', label: '🔥 Will', hint: 'Inner resolve & curse resistance' },
        { key: 'Smithing', label: '🔨 Smithing', hint: 'Noldorin anvil & rune craft' },
        { key: 'Song', label: '🎵 Song', hint: 'Chants of Finrod & Lúthien' }
    ];

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function classifyItemCategory(desc) {
        const raw = String(desc || '');
        const lower = raw.toLowerCase();
        if (/\b(potion|phial|draught|elixir|flask of)\b/.test(lower) ||
            /(の薬|水薬|霊薬|フラスコ)/.test(raw)) {
            return { category: 'potion', icon: '🧪', rarity: detectRarity(raw) };
        }
        if (/\b(scroll|parchment|card|trump)\b/.test(lower) ||
            /(の巻物|巻物|カード)/.test(raw)) {
            return { category: 'scroll', icon: '📜', rarity: detectRarity(raw) };
        }
        if (/\b(wand|rod|staff)\b/.test(lower) ||
            /(の魔法棒|のロッド|のスタッフ|の杖|魔法棒|ロッド|スタッフ)/.test(raw)) {
            return { category: 'device', icon: '🪄', rarity: detectRarity(raw) };
        }
        if (/\b(book|tome|grimoire|manual|hymnal|songbook|scrolls of)\b/.test(lower) ||
            /(の魔法書|の仙術書|の経典|魔法書|仙術書|経典|教本|\[[^\]]+の魔法書\])/.test(raw)) {
            return { category: 'tome', icon: '📖', rarity: detectRarity(raw) };
        }
        if (/\b(ring|amulet|necklace|pendant|torque|brooch)\b/.test(lower) ||
            /(の指輪|のアミュレット|指輪|アミュレット|首飾り|ペンダント)/.test(raw)) {
            return { category: 'jewelry', icon: '💍', rarity: detectRarity(raw) };
        }
        if (/\b(ration|food|bread|waybread|lembas|jerky|mushroom|slime mold|biscuit|pint of|strip of)\b/.test(lower) ||
            /(食料|レーション|ビスケット|干し肉|キノコ|スライムモールド|パン|エール|ワイン)/.test(raw)) {
            return { category: 'food', icon: '🍞', rarity: 'common' };
        }
        if (/\b(torch|lantern|phial of galadriel|star of|aril|feanor|light)\b/.test(lower) ||
            /(松明|ランタン|ランプ|ガラドリエルの玻璃瓶|アルケン石|エアレンディルの星)/.test(raw)) {
            return { category: 'light', icon: '🕯️', rarity: detectRarity(raw) };
        }
        if (/\b(sword|dagger|blade|rapier|sabre|cutlass|katana|wakizashi|tulwar|scimitar|bastard|claymore|zweihander|spear|lance|halberd|pike|glaive|axe|hatchet|mace|flail|hammer|maul|quarterstaff|staff of|whip|club)\b/.test(lower) ||
            /(剣|刀|脇差|短刀|ダガー|レイピア|サーベル|カトラス|シミター|クレイモア|ツヴァイハンダー|槍|ランス|ハルバード|パイク|グレイブ|斧|ハチェット|メイス|フレイル|ハンマー|戦槌|モール|クォータースタッフ|ムチ|棍棒)/.test(raw)) {
            return { category: 'weapon', icon: '⚔️', rarity: detectRarity(raw) };
        }
        if (/\b(bow|longbow|shortbow|crossbow|sling|arrow|seeker|bolt|shot|pebble|ammunition)\b/.test(lower) ||
            /(ショート・ボウ|ロング・ボウ|ライト・クロスボウ|ヘヴィ・クロスボウ|スリング|弓|矢|クロスボウの矢|弾|鉄弾|丸石)/.test(raw)) {
            return { category: 'ranged', icon: '🏹', rarity: detectRarity(raw) };
        }
        if (/\b(armour|armor|mail|plate|hauberk|brigandine|leather|robe|cloak|shield|buckler|helm|helmet|crown|cap|gloves|gauntlets|cesti|boots|greaves|sandals)\b/.test(lower) ||
            /(鎧|メイル|アーマー|プレート|ホーバーク|ブリガンディン|レザー|ローブ|クローク|外套|盾|シールド|バックラー|兜|ヘルム|ヘルメット|冠|クラウン|キャップ|帽子|グローブ|ガントレット|篭手|セスタス|ブーツ|靴|グリーヴ|サンダル)/.test(raw)) {
            return { category: 'armor', icon: '🛡️', rarity: detectRarity(raw) };
        }
        return { category: 'misc', icon: '🏺', rarity: detectRarity(raw) };
    }

    function detectRarity(desc) {
        const text = String(desc || '');
        if (/\{.*?(special|splendid|artifact|unmaker|morgoth|feanor|celebrimbor|特別|アーティファクト).*?\}/i.test(text) || /\bThe [A-Z][a-z]+ of [A-Z]/.test(text) || /'[A-Z][^']+'/.test(text) || /★/.test(text)) {
            return 'artifact';
        }
        if (/\{.*?(excellent|ego|fine|masterwork|良質|エゴ|高級).*?\}/i.test(text) || /\(\+\d+,\s*\+\d+\)\s*\[[^\]]+\]\s*\(\+\d+\)/.test(text) || /\bof (Slay|Execute|Westernesse|Gondolin|Noldor|Lothlorien|Fury|Speed|Extra Attacks|Resistance|Free Action|Immunity)\b/i.test(text) || /☆/.test(text)) {
            return 'ego';
        }
        if (/\(\+\d+|\[\d+,\s*\+\d+\]/.test(text)) {
            return 'enchanted';
        }
        return 'common';
    }

    function parseItemMetrics(desc) {
        const raw = String(desc || '').trim();
        let weight = '';
        let price = '';
        let stats = '';
        let cleanName = raw;

        const weightMatch = cleanName.match(/\s+(\d+(?:\.\d+)?\s*(?:lb|kg))s?(?:\s+(\d+)\s*)?$/i);
        if (weightMatch) {
            weight = weightMatch[1];
            if (weightMatch[2]) price = weightMatch[2] + ' au';
            cleanName = cleanName.slice(0, weightMatch.index).trim();
        } else {
            const trailingPrice = cleanName.match(/\s{2,}(\d{1,7})\s*$/);
            if (trailingPrice) {
                price = trailingPrice[1] + ' au';
                cleanName = cleanName.slice(0, trailingPrice.index).trim();
            }
        }

        const statTokens = [];
        const dmgMatch = cleanName.match(/\(\d+d\d+[^)]*\)/);
        if (dmgMatch) statTokens.push(dmgMatch[0]);
        const acMatch = cleanName.match(/\[\d+[^\]]*\]/);
        if (acMatch) statTokens.push(acMatch[0]);
        const manaMatch = cleanName.match(/\b(\d+)\s*(?:sp|mp|mana)\b/i);
        if (manaMatch) statTokens.push(manaMatch[0]);
        const failMatch = cleanName.match(/\b(\d{1,3})%\s*(?:fail|失敗)?/i);
        if (failMatch) statTokens.push(failMatch[1] + '%');

        stats = statTokens.join(' · ');
        return { cleanName, weight, price, stats };
    }

    function getAvailableVerbsForItem(category, realm, context) {
        const r = String(realm || 'angband').toLowerCase();
        const isJp = r === 'hengband' && context && context.lang === 'jp';
        const isBi = r === 'hengband' && context && context.lang === 'bilingual';
        const lbl = (en, jp, bi) => isJp ? jp : (isBi ? (bi || `${en} (${jp.replace(/^[^\s]+\s*/, '')})`) : en);

        if (context && context.isStoreScreen) {
            return [
                { id: 'buy', label: lbl('🪙 Buy / Take', '🪙 購入 / 受取', '🪙 Buy (購入)'), verb: 'p' },
                { id: 'inspect', label: lbl('🔍 Examine', '🔍 調査', '🔍 Examine (調査)'), verb: 'I' }
            ];
        }
        if (context && (context.isSpellPowerChoice || (context.submenu && (context.submenu.isFcbPowerMenu || context.submenu.isHengbandMagicMenu)))) {
            return [
                { id: 'invoke', label: lbl('✨ Cast / Invoke', '✨ 詠唱 / 発動', '✨ Cast (詠唱)'), verb: '' },
                { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind (登録)'), verb: '__bind_spell__' }
            ];
        }
        if (context && context.isItemTargetPrompt) {
            return [
                { id: 'select', label: lbl('✓ Choose Slot', '✓ 選択', '✓ Select (選択)'), verb: '' }
            ];
        }

        const verbs = [];
        if (r === 'silq') {
            if (category === 'weapon' || category === 'ranged' || category === 'armor' || category === 'jewelry' || category === 'light') {
                verbs.push({ id: 'wield', label: '⚔️ Wield / Wear', verb: 'w' });
            }
            if (category === 'potion' || category === 'scroll' || category === 'device' || category === 'food' || category === 'light') {
                verbs.push({ id: 'use', label: '✨ Use Item', verb: 'u' });
                verbs.push({ id: 'bind', label: '⚡ Bind', verb: 'u', isBind: true });
            }
            verbs.push({ id: 'inspect', label: '🔍 Inspect', verb: 'x' });
            verbs.push({ id: 'drop', label: '⬇️ Drop', verb: 'd' });
            return verbs;
        }

        if (category === 'weapon' || category === 'ranged' || category === 'armor' || category === 'jewelry' || category === 'light') {
            verbs.push({ id: 'wield', label: lbl('⚔️ Wield', '⚔️ 装備', '⚔️ Wield (装備)'), verb: 'w' });
            if (category === 'ranged') {
                verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'f', isBind: true });
            }
        }
        if (category === 'potion') {
            verbs.push({ id: 'quaff', label: lbl('🧪 Quaff', '🧪 飲む', '🧪 Quaff (薬)'), verb: 'q' });
            verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'q', isBind: true });
        } else if (category === 'scroll') {
            verbs.push({ id: 'read', label: lbl('📜 Read', '📜 読む', '📜 Read (巻)'), verb: 'r' });
            verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'r', isBind: true });
        } else if (category === 'food') {
            verbs.push({ id: 'eat', label: lbl('🍞 Eat', '🍞 食べる', '🍞 Eat (食)'), verb: 'E' });
        } else if (category === 'device') {
            const devVerb = (r === 'hengband' || r === 'frogcomposband') ? 'a' : 'u';
            verbs.push({ id: 'use', label: lbl('🪄 Use / Aim', '🪄 使う', '🪄 Use (使)'), verb: devVerb });
            verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: devVerb, isBind: true });
        } else if (category === 'tome') {
            verbs.push({ id: 'browse', label: lbl('📖 Browse', '📖 閲覧', '📖 Browse (閲)'), verb: 'b' });
            verbs.push({ id: 'cast', label: lbl('✨ Cast', '✨ 詠唱', '✨ Cast (呪)'), verb: 'm' });
            verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'm', isBind: true });
        }
        verbs.push({ id: 'inspect', label: lbl('🔍 Inspect', '🔍 調査', '🔍 Inspect (調)'), verb: 'I' });
        verbs.push({ id: 'drop', label: lbl('⬇️ Drop', '⬇️ 落とす', '⬇️ Drop (落)'), verb: 'd' });
        return verbs;
    }

    class GrimoireDeckController {
        constructor() {
            this.mode = 'classic'; // 'hybrid' | 'classic' — Classic Terminal always visible by default (WS36)
            this.manualTerminalMode = true;
            this._menuActive = false;
            this._lastSig = '';
            this._boundContainer = null;
            this._onActionCallback = null;
        }

        getHeraldry(realm) {
            const key = String(realm || 'angband').toLowerCase();
            return REALM_HERALDRY[key] || REALM_HERALDRY.angband;
        }

        _syncPrimaryOpenClass() {
            if (typeof document === 'undefined') return;
            const container = this._boundContainer || document.getElementById('grimoire-deck-container');
            const isVisible = Boolean(container && container.style.display !== 'none' && !this.manualTerminalMode && this.mode !== 'classic');
            if (document.body) {
                document.body.classList.toggle('grimoire-primary-open', isVisible);
            }
            const termWindow = document.getElementById('terminal-window') || document.getElementById('terminal-card') || document.getElementById('terminal-container');
            if (termWindow) {
                termWindow.classList.toggle('grimoire-primary-open', isVisible);
            }
            const termWinDirect = document.getElementById('terminal-window');
            if (termWinDirect && termWinDirect !== termWindow) {
                termWinDirect.classList.toggle('grimoire-primary-open', isVisible);
            }
            const gToggleBtn = document.getElementById('btn-term-grimoire-toggle');
            if (gToggleBtn) {
                if (this._menuActive) {
                    gToggleBtn.style.display = 'inline-flex';
                    gToggleBtn.textContent = (this.mode === 'classic') ? '✨ Grimoire [F10]' : '📜 Classic [F10]';
                } else {
                    gToggleBtn.style.display = 'none';
                }
            }
        }

        toggleMode() {
            this.mode = this.mode === 'classic' ? 'hybrid' : 'classic';
            this.manualTerminalMode = (this.mode === 'classic');
            this._lastSig = '';
            this._syncPrimaryOpenClass();
            return this.mode;
        }

        hide(container) {
            this._menuActive = false;
            const el = container || this._boundContainer;
            if (!el) {
                this._syncPrimaryOpenClass();
                return;
            }
            if (el.style.display !== 'none') {
                el.style.display = 'none';
                el.innerHTML = '';
            }
            this._lastSig = '';
            this._syncPrimaryOpenClass();
        }

        /**
         * Renders the Dark-Fantasy Grimoire & Armory Deck inside `#grimoire-deck-container`.
         * Returns true if the deck is active and visible.
         */
        render(container, options = {}) {
            if (!container) return false;
            this._boundContainer = container;
            if (typeof options.onAction === 'function') {
                this._onActionCallback = options.onAction;
            }

            const realm = String(options.realm || 'angband').toLowerCase();
            const heraldry = this.getHeraldry(realm);
            const rawClassifier = options.classifier || {};
            const submenu = options.submenu || {};
            const items = Array.isArray(options.items) ? options.items : [];

            const isInventoryScreen = Boolean(
                rawClassifier.isInventoryScreen ||
                (rawClassifier.mode === 'item-list' && rawClassifier.listKind === 'inven' && !rawClassifier.verbPrompt)
            );
            const isEquipScreen = Boolean(
                rawClassifier.isEquipScreen ||
                (rawClassifier.mode === 'item-list' && rawClassifier.listKind === 'equip' && !rawClassifier.verbPrompt)
            );
            const isStoreScreen = Boolean(
                rawClassifier.isStoreScreen ||
                rawClassifier.isStore ||
                rawClassifier.mode === 'store'
            );
            const isSpellPowerChoice = Boolean(
                rawClassifier.isSpellPowerChoice ||
                rawClassifier.verbPrompt === 'cast' ||
                rawClassifier.verbPrompt === 'browse' ||
                rawClassifier.verbPrompt === 'study'
            );
            const isItemTargetPrompt = Boolean(
                rawClassifier.isItemTargetPrompt ||
                (rawClassifier.mode === 'item-list' && rawClassifier.promptKind === 'select' && Boolean(rawClassifier.verbPrompt) && !isSpellPowerChoice)
            );
            const classifier = Object.assign({}, rawClassifier, {
                isInventoryScreen,
                isEquipScreen,
                isStoreScreen,
                isSpellPowerChoice,
                isItemTargetPrompt
            });

            const isMenuActive = Boolean(
                classifier.isInventoryScreen ||
                classifier.isEquipScreen ||
                classifier.isStoreScreen ||
                classifier.isSpellPowerChoice ||
                classifier.isItemTargetPrompt ||
                submenu.isSilqAbilityTree ||
                submenu.isSilqSmithing ||
                submenu.isFcbPowerMenu ||
                submenu.isHengbandMagicMenu
            );

            this._menuActive = isMenuActive;
            if (!isMenuActive) {
                this.hide(container);
                return false;
            }

            if (this.mode === 'classic') {
                if (container.style.display !== 'none') {
                    container.style.display = 'none';
                    container.innerHTML = '';
                }
                this._lastSig = `classic:${realm}`;
                this._syncPrimaryOpenClass();
                return true;
            }

            const lang = (realm === 'hengband')
                ? String(options.lang || (typeof window !== 'undefined' && window.__langMode) || 'en').toLowerCase()
                : 'en';
            const isJp = realm === 'hengband' && lang === 'jp';
            const isBi = realm === 'hengband' && lang === 'bilingual';
            const promptText = String(options.promptText || (rawClassifier && rawClassifier.row0) || '').trim();

            const isVanilla = (realm === 'angband');
            const itemSig = items.slice(0, 26).map((it, idx) => {
                const k = isVanilla
                    ? (it.letter || ((typeof QuickActions !== 'undefined' && typeof QuickActions.vanillaLetter === 'function')
                        ? QuickActions.vanillaLetter(idx)
                        : (it.key || String.fromCharCode(97 + idx))))
                    : (it.key || it.letter || '');
                return `${k}:${it.row}:${it.col || it.startCol || 0}:${(it.desc || it.rawLabel || it.label || '').slice(0, 28)}`;
            }).join('|');
            const sig = `${realm}:${lang}::${this.mode}::${submenu.kind || 'none'}::${Boolean(classifier.isInventoryScreen)}:${Boolean(classifier.isEquipScreen)}:${Boolean(classifier.isStoreScreen)}:${Boolean(classifier.isSpellPowerChoice)}:${Boolean(classifier.isItemTargetPrompt)}:${Boolean(classifier.verbPrompt)}::${promptText.slice(0, 48)}::${itemSig}`;

            if (sig === this._lastSig && container.style.display !== 'none') {
                this._syncPrimaryOpenClass();
                return true;
            }
            this._lastSig = sig;

            let viewKindLabel = isJp ? '武具・所持品' : (isBi ? 'ARMORY & PACK (所持品)' : 'ARMORY & PACK');
            if (submenu.isSilqAbilityTree) viewKindLabel = 'SIL-Q ABILITY TAPESTRY';
            else if (submenu.isSilqSmithing) viewKindLabel = 'NOLDORIN ANVIL FORGE';
            else if (submenu.isFcbPowerMenu) viewKindLabel = 'CHAOS & RACIAL POWERS';
            else if (submenu.isHengbandMagicMenu) viewKindLabel = isJp ? '術法・仙術の巻' : (isBi ? 'SCROLLS OF JUTSU (術法)' : 'SCROLLS OF JUTSU & MIND');
            else if (classifier.isStoreScreen) viewKindLabel = isJp ? '街の商店・取引' : (isBi ? 'MERCHANT EMPORIUM (商店)' : 'MERCHANT EMPORIUM');
            else if (classifier.isEquipScreen) viewKindLabel = isJp ? '装備中の武具' : (isBi ? 'WIELDED PANOPLY (装備品)' : 'WIELDED PANOPLY');
            else if (classifier.isSpellPowerChoice) viewKindLabel = isJp ? '魔道書・秘伝書' : (isBi ? 'ARCANE GRIMOIRE (魔道書)' : 'ARCANE GRIMOIRE');
            else if (classifier.isItemTargetPrompt) viewKindLabel = isJp ? '対象アイテムを選択' : (isBi ? 'CHOOSE ITEM (対象選択)' : 'CHOOSE TARGET ITEM');

            let switcherHtml = '';
            if (classifier.isInventoryScreen || classifier.isEquipScreen) {
                const invActive = classifier.isInventoryScreen ? 'is-active' : '';
                const eqActive = classifier.isEquipScreen ? 'is-active' : '';
                const packLbl = isJp ? '🎒 所持品' : (isBi ? '🎒 Pack (所持)' : '🎒 Pack');
                const eqLbl = isJp ? '🛡️ 装備品' : (isBi ? '🛡️ Equipped (装備)' : '🛡️ Equipped');
                switcherHtml = `
                    <div class="grimoire-tab-group" role="tablist" aria-label="Pack and Equipment Tabs">
                        <button type="button" class="grimoire-tab-btn ${invActive}" data-grimoire-cmd="switch-view" data-grimoire-key="i" title="Switch to Inventory Pack">${packLbl}</button>
                        <button type="button" class="grimoire-tab-btn ${eqActive}" data-grimoire-cmd="switch-view" data-grimoire-key="e" title="Switch to Wielded Equipment">${eqLbl}</button>
                        ${realm === 'angband' ? '<button type="button" class="grimoire-tab-btn" data-grimoire-cmd="switch-view" data-grimoire-key="|" title="Switch to Quiver">🏹 Quiver</button>' : ''}
                    </div>
                `;
            } else if (submenu.isSilqAbilityTree) {
                switcherHtml = `
                    <div class="grimoire-tab-group" role="group" aria-label="Sil-Q Ability Navigation">
                        <button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="ArrowLeft" title="Previous Skill Pillar">◀ Pillar</button>
                        <button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="ArrowRight" title="Next Skill Pillar">Pillar ▶</button>
                        <button type="button" class="grimoire-tab-btn is-active" data-grimoire-cmd="raw-key" data-grimoire-key="Enter" title="Learn Selected Ability">✨ Learn Ability</button>
                    </div>
                `;
            } else if (submenu.isSilqSmithing) {
                switcherHtml = `
                    <div class="grimoire-tab-group" role="group" aria-label="Sil-Q Anvil Categories">
                        <button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="w" title="Forge Weapons">⚔️ Weapons</button>
                        <button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="a" title="Forge Armour">🛡️ Armour</button>
                        <button type="button" class="grimoire-tab-btn" data-grimoire-cmd="raw-key" data-grimoire-key="r" title="Forge Rings">💍 Rings</button>
                        <button type="button" class="grimoire-tab-btn is-active" data-grimoire-cmd="raw-key" data-grimoire-key="Enter" title="Strike Anvil">🔨 Strike Anvil</button>
                    </div>
                `;
            }

            let bodyHtml = '';
            if (this.mode === 'classic') {
                bodyHtml = '';
            } else if (submenu.isSilqAbilityTree && items.length === 0) {
                const pills = SILQ_PILLARS.map((p, idx) => `
                    <button type="button" class="grimoire-pillar-card" data-grimoire-cmd="pillar-step" data-pillar-index="${idx}">
                        <span class="grimoire-pillar-title">${escapeHtml(p.label)}</span>
                        <span class="grimoire-pillar-hint">${escapeHtml(p.hint)}</span>
                    </button>
                `).join('');
                bodyHtml = `<div class="grimoire-pillar-grid">${pills}</div>`;
            } else if (items.length > 0) {
                const cards = items.slice(0, 18).map((item, idx) => {
                    const fallbackLetter = isVanilla
                        ? ((typeof QuickActions !== 'undefined' && typeof QuickActions.vanillaLetter === 'function')
                            ? QuickActions.vanillaLetter(idx)
                            : ((typeof window !== 'undefined' && window.QuickActions && typeof window.QuickActions.vanillaLetter === 'function')
                                ? window.QuickActions.vanillaLetter(idx)
                                : ('abcdefgimnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[idx] || String.fromCharCode(97 + idx))))
                        : String.fromCharCode(97 + idx);
                    const key = String(isVanilla ? (item.letter || fallbackLetter) : (item.key || item.letter || fallbackLetter || ''));
                    const desc = String(item.desc || item.rawLabel || item.label || '');
                    const cat = classifyItemCategory(desc);
                    const metrics = parseItemMetrics(desc);
                    const verbs = getAvailableVerbsForItem(cat.category, realm, {
                        lang,
                        isStoreScreen: classifier.isStoreScreen,
                        isSpellPowerChoice: classifier.isSpellPowerChoice,
                        isItemTargetPrompt: classifier.isItemTargetPrompt,
                        submenu
                    });

                    const primaryVerb = verbs[0] || { id: 'select', label: isJp ? '選択' : 'Select', verb: '' };
                    const secondaryVerbs = verbs.slice(1, 5);

                    const primaryActionBtn = `
                        <button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-primary-verb ${primaryVerb.isBind || primaryVerb.id === 'bind' ? 'grimoire-bind-btn' : ''}"
                            data-grimoire-cmd="item-primary"
                            data-grimoire-key="${escapeHtml(key)}"
                            data-grimoire-verb="${escapeHtml(primaryVerb.verb)}"
                            data-grimoire-name="${escapeHtml(metrics.cleanName)}"
                            data-grimoire-category="${escapeHtml(cat.category)}"
                            data-grimoire-icon="${escapeHtml(cat.icon)}"
                            data-grimoire-row="${Number(item.row || 0)}"
                            data-grimoire-col="${Number(item.col || 0)}"
                            title="${escapeHtml(primaryVerb.label)} (${escapeHtml(key)})">
                            ${escapeHtml(primaryVerb.label)}
                        </button>
                    `;

                    const secActionButtons = secondaryVerbs.map((v) => `
                        <button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-secondary-verb ${v.isBind || v.id === 'bind' ? 'grimoire-bind-btn' : ''}"
                            data-grimoire-cmd="${v.isBind || v.id === 'bind' ? 'bind-quick-slot' : 'item-verb'}"
                            data-grimoire-key="${escapeHtml(key)}"
                            data-grimoire-verb="${escapeHtml(v.verb)}"
                            data-grimoire-name="${escapeHtml(metrics.cleanName)}"
                            data-grimoire-category="${escapeHtml(cat.category)}"
                            data-grimoire-icon="${escapeHtml(cat.icon)}"
                            data-grimoire-row="${Number(item.row || 0)}"
                            data-grimoire-col="${Number(item.col || 0)}"
                            title="${escapeHtml(v.label)} (${escapeHtml(key)})">
                            ${escapeHtml(v.label)}
                        </button>
                    `).join('');

                    const moreVerbsBtn = secondaryVerbs.length > 0 ? `
                        <button type="button" class="grimoire-more-verbs-btn"
                            data-grimoire-cmd="toggle-card-verbs"
                            title="More Actions (⋯)">
                            ⋯
                        </button>
                    ` : '';

                    const actionButtons = `<div class="grimoire-card-actions">${primaryActionBtn}${secActionButtons}${moreVerbsBtn}</div>`;

                    return `
                        <div class="grimoire-item-card rarity-${escapeHtml(cat.rarity)}" data-slot-key="${escapeHtml(key)}">
                            <div class="grimoire-card-main"
                                role="button"
                                tabindex="0"
                                data-grimoire-cmd="item-primary"
                                data-grimoire-key="${escapeHtml(key)}"
                                data-grimoire-verb="${escapeHtml(primaryVerb.verb)}"
                                data-grimoire-row="${Number(item.row || 0)}"
                                data-grimoire-col="${Number(item.col || 0)}"
                                title="${escapeHtml(primaryVerb.label)}: [${escapeHtml(key)}] ${escapeHtml(metrics.cleanName)}">
                                <span class="grimoire-slot-medallion">${escapeHtml(key)})</span>
                                <span class="grimoire-item-icon" aria-hidden="true">${cat.icon}</span>
                                <div class="grimoire-item-copy">
                                    <div class="grimoire-item-title">${escapeHtml(metrics.cleanName)}</div>
                                    <div class="grimoire-item-meta">
                                        ${metrics.stats ? `<span class="grimoire-meta-stat">${escapeHtml(metrics.stats)}</span>` : ''}
                                        ${metrics.weight ? `<span class="grimoire-meta-weight">${escapeHtml(metrics.weight)}</span>` : ''}
                                        ${metrics.price ? `<span class="grimoire-meta-price">${escapeHtml(metrics.price)}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            ${actionButtons}
                        </div>
                    `;
                }).join('');
                bodyHtml = `<div class="grimoire-card-grid" role="list">${cards}</div>`;
            }

            const modeBtnLabel = this.mode === 'classic'
                ? (isJp ? '📜 カード表示 [F10]' : (isBi ? '📜 Cards (カード) [F10]' : '📜 Show Grimoire Cards [F10]'))
                : (isJp ? '📜 端末のみ [F10]' : (isBi ? '📜 Classic (端末) [F10]' : '📜 Classic Parchment Only [F10]'));
            const crestTitleText = isJp ? '五輪書・変愚蛮怒' : heraldry.crestTitle;

            container.innerHTML = `
                <div class="grimoire-deck-shell" data-realm="${escapeHtml(realm)}" data-mode="${escapeHtml(this.mode)}">
                    <div class="grimoire-deck-header">
                        <div class="grimoire-crest-banner">
                            <span class="grimoire-crest-icon" aria-hidden="true">${heraldry.svgCrest}</span>
                            <span class="grimoire-crest-realm">${escapeHtml(crestTitleText)}</span>
                            <span class="grimoire-crest-sep">·</span>
                            <span class="grimoire-crest-view">${escapeHtml(viewKindLabel)}</span>
                            ${promptText ? `<span class="grimoire-prompt-subtitle">${escapeHtml(promptText)}</span>` : `<span class="grimoire-crest-sub">${escapeHtml(heraldry.subtitle)}</span>`}
                        </div>
                        <div class="grimoire-header-controls">
                            ${switcherHtml}
                            <button type="button" class="grimoire-mode-toggle-btn" data-grimoire-cmd="toggle-mode" title="Toggle between Grimoire Cards and Classic Parchment [F10]">
                                ${escapeHtml(modeBtnLabel)}
                            </button>
                        </div>
                    </div>
                    ${bodyHtml}
                </div>
            `;
            container.style.display = 'block';
            this._syncPrimaryOpenClass();

            if (!container._grimoireListenerBound) {
                container._grimoireListenerBound = true;
                container.addEventListener('click', (ev) => {
                    const target = ev.target && ev.target.closest ? ev.target.closest('[data-grimoire-cmd]') : null;
                    if (!target) return;
                    ev.preventDefault();
                    ev.stopPropagation();

                    const cmd = target.getAttribute('data-grimoire-cmd');
                    if (cmd === 'toggle-card-verbs') {
                        const card = target.closest('.grimoire-item-card');
                        if (card) {
                            card.classList.toggle('actions-expanded');
                        }
                        return;
                    }
                    if (cmd === 'toggle-mode') {
                        this.toggleMode();
                        if (this._onActionCallback) {
                            this._onActionCallback({ type: 'toggle-mode', mode: this.mode });
                        }
                        return;
                    }
                    if (this._onActionCallback) {
                        this._onActionCallback({
                            type: cmd,
                            key: target.getAttribute('data-grimoire-key') || '',
                            verb: target.getAttribute('data-grimoire-verb') || '',
                            name: target.getAttribute('data-grimoire-name') || '',
                            category: target.getAttribute('data-grimoire-category') || '',
                            icon: target.getAttribute('data-grimoire-icon') || '',
                            row: Number(target.getAttribute('data-grimoire-row') || 0),
                            col: Number(target.getAttribute('data-grimoire-col') || 0),
                            pillarIndex: Number(target.getAttribute('data-pillar-index') || 0)
                        });
                    }
                });
            }

            return true;
        }
    }

    const singleton = new GrimoireDeckController();
    return {
        REALM_HERALDRY,
        SILQ_PILLARS,
        classifyItemCategory,
        detectRarity,
        parseItemMetrics,
        getAvailableVerbsForItem,
        GrimoireDeckController,
        getInstance: () => singleton,
        get mode() { return singleton.mode; },
        get manualTerminalMode() { return singleton.manualTerminalMode; },
        getHeraldry: (realm) => singleton.getHeraldry(realm),
        render: (container, options) => singleton.render(container, options),
        hide: (container) => singleton.hide(container),
        toggleMode: () => singleton.toggleMode()
    };
});

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
        const lower = String(desc || '').toLowerCase();
        if (/\b(sword|dagger|blade|rapier|sabre|cutlass|katana|wakizashi|tulwar|scimitar|bastard|claymore|zweihander|spear|lance|halberd|pike|glaive|axe|hatchet|mace|flail|hammer|maul|quarterstaff|staff of|whip|club)\b/.test(lower)) {
            return { category: 'weapon', icon: '⚔️', rarity: detectRarity(desc) };
        }
        if (/\b(bow|longbow|shortbow|crossbow|sling|arrow|seeker|bolt|shot|pebble|ammunition)\b/.test(lower)) {
            return { category: 'ranged', icon: '🏹', rarity: detectRarity(desc) };
        }
        if (/\b(armour|armor|mail|plate|hauberk|brigandine|leather|robe|cloak|shield|buckler|helm|helmet|crown|cap|gloves|gauntlets|cesti|boots|greaves|sandals)\b/.test(lower)) {
            return { category: 'armor', icon: '🛡️', rarity: detectRarity(desc) };
        }
        if (/\b(potion|phial|draught|elixir|flask of)\b/.test(lower)) {
            return { category: 'potion', icon: '🧪', rarity: detectRarity(desc) };
        }
        if (/\b(scroll|parchment|card|trump)\b/.test(lower)) {
            return { category: 'scroll', icon: '📜', rarity: detectRarity(desc) };
        }
        if (/\b(wand|rod|staff)\b/.test(lower)) {
            return { category: 'device', icon: '🪄', rarity: detectRarity(desc) };
        }
        if (/\b(ring|amulet|necklace|pendant|torque|brooch)\b/.test(lower)) {
            return { category: 'jewelry', icon: '💍', rarity: detectRarity(desc) };
        }
        if (/\b(book|tome|grimoire|manual|hymnal|songbook|scrolls of)\b/.test(lower)) {
            return { category: 'tome', icon: '📖', rarity: detectRarity(desc) };
        }
        if (/\b(ration|food|bread|waybread|lembas|jerky|mushroom|slime mold| biscuit|pint of|strip of)\b/.test(lower)) {
            return { category: 'food', icon: '🍞', rarity: 'common' };
        }
        if (/\b(torch|lantern|phial of galadriel|star of|aril|feanor|light)\b/.test(lower)) {
            return { category: 'light', icon: '🕯️', rarity: detectRarity(desc) };
        }
        return { category: 'misc', icon: '🏺', rarity: detectRarity(desc) };
    }

    function detectRarity(desc) {
        const text = String(desc || '');
        if (/\{.*?(special|splendid|artifact|unmaker|morgoth|feanor|celebrimbor).*?\}/i.test(text) || /\bThe [A-Z][a-z]+ of [A-Z]/.test(text) || /'[A-Z][^']+'/.test(text)) {
            return 'artifact';
        }
        if (/\{.*?(excellent|ego|fine|masterwork).*?\}/i.test(text) || /\(\+\d+,\s*\+\d+\)\s*\[[^\]]+\]\s*\(\+\d+\)/.test(text) || /\bof (Slay|Execute|Westernesse|Gondolin|Noldor|Lothlorien|Fury|Speed|Extra Attacks|Resistance|Free Action|Immunity)\b/i.test(text)) {
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

        const weightMatch = cleanName.match(/\s+(\d+\.\d+\s*lb|\d+\s*lb)s?(?:\s+(\d+)\s*)$/i);
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
        const failMatch = cleanName.match(/\b(\d{1,3})%\s*(?:fail)?/i);
        if (failMatch) statTokens.push(failMatch[1] + '% fail');

        stats = statTokens.join(' · ');
        return { cleanName, weight, price, stats };
    }

    function getAvailableVerbsForItem(category, realm, context) {
        const r = String(realm || 'angband').toLowerCase();
        if (context && context.isStoreScreen) {
            return [
                { id: 'buy', label: '🪙 Buy / Take', verb: 'p' },
                { id: 'inspect', label: '🔍 Examine', verb: 'I' }
            ];
        }
        if (context && (context.isSpellPowerChoice || (context.submenu && (context.submenu.isFcbPowerMenu || context.submenu.isHengbandMagicMenu)))) {
            return [
                { id: 'invoke', label: '✨ Cast / Invoke', verb: '' }
            ];
        }
        if (context && context.isItemTargetPrompt) {
            return [
                { id: 'select', label: '✓ Choose Slot', verb: '' }
            ];
        }

        const verbs = [];
        if (r === 'silq') {
            if (category === 'weapon' || category === 'ranged' || category === 'armor' || category === 'jewelry' || category === 'light') {
                verbs.push({ id: 'wield', label: '⚔️ Wield / Wear', verb: 'w' });
            }
            if (category === 'potion' || category === 'scroll' || category === 'device' || category === 'food' || category === 'light') {
                verbs.push({ id: 'use', label: '✨ Use Item', verb: 'u' });
            }
            verbs.push({ id: 'inspect', label: '🔍 Inspect', verb: 'I' });
            verbs.push({ id: 'drop', label: '⬇️ Drop', verb: 'd' });
            return verbs;
        }

        if (category === 'weapon' || category === 'ranged' || category === 'armor' || category === 'jewelry' || category === 'light') {
            verbs.push({ id: 'wield', label: '⚔️ Wield', verb: 'w' });
        }
        if (category === 'potion') {
            verbs.push({ id: 'quaff', label: '🧪 Quaff', verb: 'q' });
        } else if (category === 'scroll') {
            verbs.push({ id: 'read', label: '📜 Read', verb: 'r' });
        } else if (category === 'food') {
            verbs.push({ id: 'eat', label: '🍞 Eat', verb: 'E' });
        } else if (category === 'device') {
            verbs.push({ id: 'use', label: '🪄 Use / Aim', verb: 'u' });
        } else if (category === 'tome') {
            verbs.push({ id: 'browse', label: '📖 Browse', verb: 'b' });
            verbs.push({ id: 'cast', label: '✨ Cast', verb: 'm' });
        }
        verbs.push({ id: 'inspect', label: '🔍 Inspect', verb: 'I' });
        verbs.push({ id: 'drop', label: '⬇️ Drop', verb: 'd' });
        return verbs;
    }

    class GrimoireDeckController {
        constructor() {
            this.mode = 'hybrid'; // 'hybrid' | 'classic'
            this._lastSig = '';
            this._boundContainer = null;
            this._onActionCallback = null;
        }

        getHeraldry(realm) {
            const key = String(realm || 'angband').toLowerCase();
            return REALM_HERALDRY[key] || REALM_HERALDRY.angband;
        }

        toggleMode() {
            this.mode = this.mode === 'classic' ? 'hybrid' : 'classic';
            this._lastSig = '';
            return this.mode;
        }

        hide(container) {
            const el = container || this._boundContainer;
            if (!el) return;
            if (el.style.display !== 'none') {
                el.style.display = 'none';
                el.innerHTML = '';
            }
            this._lastSig = '';
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
            const classifier = options.classifier || {};
            const submenu = options.submenu || {};
            const items = Array.isArray(options.items) ? options.items : [];

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

            if (!isMenuActive) {
                this.hide(container);
                return false;
            }

            const itemSig = items.slice(0, 26).map((it) => `${it.key}:${it.row}:${it.col || 0}:${(it.desc || '').slice(0, 28)}`).join('|');
            const sig = `${realm}::${this.mode}::${submenu.kind || 'none'}::${Boolean(classifier.isInventoryScreen)}:${Boolean(classifier.isEquipScreen)}:${Boolean(classifier.isStoreScreen)}:${Boolean(classifier.isSpellPowerChoice)}:${Boolean(classifier.isItemTargetPrompt)}:${Boolean(classifier.verbPrompt)}::${itemSig}`;

            if (sig === this._lastSig && container.style.display !== 'none') {
                return true;
            }
            this._lastSig = sig;

            let viewKindLabel = 'ARMORY & PACK';
            if (submenu.isSilqAbilityTree) viewKindLabel = 'SIL-Q ABILITY TAPESTRY';
            else if (submenu.isSilqSmithing) viewKindLabel = 'NOLDORIN ANVIL FORGE';
            else if (submenu.isFcbPowerMenu) viewKindLabel = 'CHAOS & RACIAL POWERS';
            else if (submenu.isHengbandMagicMenu) viewKindLabel = 'SCROLLS OF JUTSU & MIND';
            else if (classifier.isStoreScreen) viewKindLabel = 'MERCHANT EMPORIUM';
            else if (classifier.isEquipScreen) viewKindLabel = 'WIELDED PANOPLY';
            else if (classifier.isSpellPowerChoice) viewKindLabel = 'ARCANE GRIMOIRE';
            else if (classifier.isItemTargetPrompt) viewKindLabel = 'CHOOSE TARGET ITEM';

            let switcherHtml = '';
            if (classifier.isInventoryScreen || classifier.isEquipScreen) {
                const invActive = classifier.isInventoryScreen ? 'is-active' : '';
                const eqActive = classifier.isEquipScreen ? 'is-active' : '';
                switcherHtml = `
                    <div class="grimoire-tab-group" role="tablist" aria-label="Pack and Equipment Tabs">
                        <button type="button" class="grimoire-tab-btn ${invActive}" data-grimoire-cmd="switch-view" data-grimoire-key="i" title="Switch to Inventory Pack">🎒 Pack</button>
                        <button type="button" class="grimoire-tab-btn ${eqActive}" data-grimoire-cmd="switch-view" data-grimoire-key="e" title="Switch to Wielded Equipment">🛡️ Equipped</button>
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
                const cards = items.slice(0, 18).map((item) => {
                    const key = String(item.key || '');
                    const desc = String(item.desc || '');
                    const cat = classifyItemCategory(desc);
                    const metrics = parseItemMetrics(desc);
                    const verbs = getAvailableVerbsForItem(cat.category, realm, {
                        isStoreScreen: classifier.isStoreScreen,
                        isSpellPowerChoice: classifier.isSpellPowerChoice,
                        isItemTargetPrompt: classifier.isItemTargetPrompt,
                        submenu
                    });

                    const primaryVerb = verbs[0] || { id: 'select', label: 'Select', verb: '' };
                    const secondaryVerbs = verbs.slice(1, 4);

                    const actionButtons = secondaryVerbs.map((v) => `
                        <button type="button" class="grimoire-card-verb-btn"
                            data-grimoire-cmd="item-verb"
                            data-grimoire-key="${escapeHtml(key)}"
                            data-grimoire-verb="${escapeHtml(v.verb)}"
                            data-grimoire-row="${Number(item.row || 0)}"
                            data-grimoire-col="${Number(item.col || 0)}"
                            title="${escapeHtml(v.label)} (${escapeHtml(key)})">
                            ${escapeHtml(v.label)}
                        </button>
                    `).join('');

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
                            ${actionButtons ? `<div class="grimoire-card-actions">${actionButtons}</div>` : ''}
                        </div>
                    `;
                }).join('');
                bodyHtml = `<div class="grimoire-card-grid" role="list">${cards}</div>`;
            }

            const modeBtnLabel = this.mode === 'classic' ? '📜 Show Grimoire Cards [F10]' : '📜 Classic Parchment Only [F10]';

            container.innerHTML = `
                <div class="grimoire-deck-shell" data-realm="${escapeHtml(realm)}" data-mode="${escapeHtml(this.mode)}">
                    <div class="grimoire-deck-header">
                        <div class="grimoire-crest-banner">
                            <span class="grimoire-crest-icon" aria-hidden="true">${heraldry.svgCrest}</span>
                            <span class="grimoire-crest-realm">${escapeHtml(heraldry.crestTitle)}</span>
                            <span class="grimoire-crest-sep">·</span>
                            <span class="grimoire-crest-view">${escapeHtml(viewKindLabel)}</span>
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

            if (!container._grimoireListenerBound) {
                container._grimoireListenerBound = true;
                container.addEventListener('click', (ev) => {
                    const target = ev.target && ev.target.closest ? ev.target.closest('[data-grimoire-cmd]') : null;
                    if (!target) return;
                    ev.preventDefault();
                    ev.stopPropagation();

                    const cmd = target.getAttribute('data-grimoire-cmd');
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
        getHeraldry: (realm) => singleton.getHeraldry(realm),
        render: (container, options) => singleton.render(container, options),
        hide: (container) => singleton.hide(container),
        toggleMode: () => singleton.toggleMode()
    };
});

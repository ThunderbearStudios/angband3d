/**
 * QuickActionManager — 4-Slot Cross-Realm Bindable Quick-Action Bar & Macro Engine
 *
 * Supports binding any spell, ranged shoot/aim, potion, scroll, rod/wand/staff, or
 * repeatable command across Angband 4.2.6, Sil-Q 1.5, FrogComposband 7.1, and Hengband 3.0.
 *
 * Key Architectural Properties:
 *   1. Inventory-Shift & Language-Switch Immune: Resolves bound items by (tval, sval) and
 *      normalized EN/JP item name against live `frame.player.inventory` / `equipment` / `quiver`
 *      so picking up/dropping items or toggling EN <-> JP in Hengband never breaks a slot.
 *   2. 60fps Signature-Gated DOM Updates (L25): Only updates `#quick-slot-bar` DOM when resolved
 *      availability, stack counts, realm, or language actually change.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QuickActionManager = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STORAGE_PREFIX = 'angband3d_quick_slots_v1_';

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeItemName(desc) {
        let s = String(desc || '').trim();
        // Strip leading quantity or article ("3 Potions of...", "a Scroll of...", "an ", "2個の", "3本の", "5巻の")
        s = s.replace(/^(?:an?\s+|\d+\s+|few\s+|\d+\s*(?:個|本|巻|冊|枚|服|束|対|着)の?\s*)/i, '');
        // Strip trailing weight, price, and inscription/charge annotations
        s = s.replace(/\s+\d+(?:\.\d+)?\s*(?:lb|kg)s?(?:\s+\d+)?$/i, '');
        s = s.replace(/\{[^}]*\}|\([^)]*\)|\[[^\]]*\]/g, '');
        return s.trim().toLowerCase();
    }

    function shortItemLabel(desc, maxLen = 11) {
        let s = String(desc || '').trim();
        s = s.replace(/^(?:an?\s+|\d+\s+|\d+\s*(?:個|本|巻|冊|枚|服|束)の?\s*)/i, '');
        s = s.replace(/^(?:potions?\s+of\s+|scrolls?\s+of\s+|wands?\s+of\s+|rods?\s+of\s+|staves?\s+of\s+|staff\s+of\s+|books?\s+of\s+)/i, '');
        s = s.replace(/(?:の薬|の巻物|の魔法棒|のロッド|のスタッフ|の杖)$/, '');
        s = s.replace(/\{[^}]*\}|\([^)]*\)|\[[^\]]*\]/g, '').trim();
        if (s.length > maxLen) {
            return s.slice(0, maxLen - 1) + '…';
        }
        return s || 'Action';
    }

    function classifyInventoryEntry(it, realm = 'angband') {
        const name = String((it && it.name) || '');
        const lower = name.toLowerCase();
        const tval = Number(it && it.tval) || 0;
        const isVanilla = String(realm || 'angband').toLowerCase() === 'angband';

        // Check by description keywords (EN + JP) & realm-aware tvals (Vanilla Angband 4.2.6 vs ZAngband-derived variants)
        const isPotionTval = isVanilla ? (tval === 26) : (tval === 75 || tval === 71);
        if (/\b(potion|phial|draught|elixir)\b/.test(lower) || /(の薬|水薬|霊薬|丸薬|薬$)/.test(name) || isPotionTval) {
            const isHeal = /\b(heal|cure|curing|life|restore|aid)\b/.test(lower) || /(治療|治癒|回復|傷|体力|生命)/.test(name);
            return { category: 'potion', isHeal, icon: '🧪' };
        }
        const isScrollTval = isVanilla ? (tval === 25) : (tval === 70 || tval === 50);
        if (/\b(scroll|parchment|card|trump)\b/.test(lower) || /(の巻物|巻物|カード)/.test(name) || isScrollTval) {
            const isEscape = /\b(phase|teleport|recall|banish|destruction|sanctuary)\b/.test(lower) || /(ショート・テレポート|テレポート|帰還|破壊|聖域)/.test(name);
            return { category: 'scroll', isEscape, icon: '📜' };
        }
        const isDeviceTval = isVanilla ? (tval >= 22 && tval <= 24) : (tval === 55 || tval === 65 || tval === 66);
        if (/\b(wand|rod|staff)\b/.test(lower) || /(魔法棒|ロッド|スタッフ|の杖)/.test(name) || isDeviceTval) {
            return { category: 'device', icon: '🪄' };
        }
        const isTomeTval = isVanilla ? (tval >= 30 && tval <= 34) : (tval >= 90 && tval <= 115);
        if (/\b(book|tome|grimoire|manual|hymnal|songbook)\b/.test(lower) || /(魔法書|仙術書|経典|教本|『[^』]+』|\[[^\]]+の魔法書\])/.test(name) || isTomeTval) {
            return { category: 'tome', icon: '📖' };
        }
        const isRangedTval = isVanilla ? (tval >= 2 && tval <= 5) : (tval >= 16 && tval <= 19);
        if (/\b(bow|longbow|shortbow|crossbow|sling|arrow|bolt|shot|pebble|seeker|sheaf)\b/.test(lower) || /(ボウ|スリング|弓|矢|弾|丸石)/.test(name) || isRangedTval) {
            return { category: 'ranged', icon: '🏹' };
        }
        const isFoodTval = isVanilla ? (tval === 28 || tval === 29) : (tval === 80);
        if (/\b(ration|food|bread|waybread|lembas|jerky|mushroom|slime mold)\b/.test(lower) || /(食料|レーション|パン|キノコ)/.test(name) || isFoodTval) {
            return { category: 'food', icon: '🍞' };
        }
        return { category: 'other', icon: '⚔️' };
    }

    function getDefaultSlots(realm) {
        const r = String(realm || 'angband').toLowerCase();
        return [
            {
                slotIndex: 0,
                type: 'fire_nearest',
                icon: '🏹',
                labelEn: 'Shoot',
                labelJp: '射撃',
                targetNearest: true
            },
            {
                slotIndex: 1,
                type: 'auto_category',
                category: 'potion',
                preferSub: 'heal',
                icon: '🧪',
                labelEn: 'Heal',
                labelJp: '回復薬',
                targetNearest: false
            },
            {
                slotIndex: 2,
                type: 'smart_magic',
                icon: r === 'silq' ? '🎵' : '✨',
                labelEn: r === 'silq' ? 'Song' : 'Spell/Pwr',
                labelJp: '呪文/能力',
                targetNearest: true
            },
            {
                slotIndex: 3,
                type: 'auto_category',
                category: 'scroll',
                preferSub: 'escape',
                icon: '📜',
                labelEn: 'Escape',
                labelJp: '脱出巻',
                targetNearest: false
            }
        ];
    }

    class QuickActionController {
        constructor() {
            this.slotsByRealm = {};
            this.activeBindSlot = 0;
            this._lastRenderSig = '';
            this._boundListeners = false;
        }

        _storageKey(realm) {
            return `${STORAGE_PREFIX}${String(realm || 'angband').toLowerCase()}`;
        }

        getSlots(realm) {
            const r = String(realm || 'angband').toLowerCase();
            if (this.slotsByRealm[r]) return this.slotsByRealm[r];

            let loaded = null;
            if (typeof localStorage !== 'undefined') {
                try {
                    const raw = localStorage.getItem(this._storageKey(r));
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length === 4) {
                            loaded = parsed;
                        }
                    }
                } catch (_) {}
            }
            this.slotsByRealm[r] = loaded || getDefaultSlots(r);
            return this.slotsByRealm[r];
        }

        saveSlots(realm, slots) {
            const r = String(realm || 'angband').toLowerCase();
            this.slotsByRealm[r] = slots;
            this._lastRenderSig = '';
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(this._storageKey(r), JSON.stringify(slots));
                } catch (_) {}
            }
        }

        resetRealmSlots(realm) {
            const r = String(realm || 'angband').toLowerCase();
            const defaults = getDefaultSlots(r);
            this.saveSlots(r, defaults);
            return defaults;
        }

        setSlot(realm, slotIdx, slotDef) {
            const idx = Math.max(0, Math.min(3, Number(slotIdx) || 0));
            const slots = this.getSlots(realm).slice();
            slots[idx] = Object.assign({ slotIndex: idx }, slotDef);
            this.saveSlots(realm, slots);
            return slots[idx];
        }

        /**
         * Resolves a quick-slot definition against the live frame inventory/equipment/quiver.
         */
        resolveSlot(slotDef, frame, realm, lang = 'en') {
            const r = String(realm || 'angband').toLowerCase();
            const isJp = r === 'hengband' && lang === 'jp';
            const player = (frame && frame.player) ? frame.player : {};
            const inv = Array.isArray(player.inventory) ? player.inventory : [];
            const eq = Array.isArray(player.equipment) ? player.equipment : [];
            const quiv = Array.isArray(player.quiver) ? player.quiver : [];
            const realmKeyFn = (typeof window !== 'undefined' && window.RealmKeys && window.RealmKeys.realmKey)
                ? (v) => window.RealmKeys.realmKey(v, r)
                : null;

            if (!slotDef) {
                return { available: false, icon: '⚡', label: isJp ? '未設定' : 'Empty', qtyText: '', sequence: [], tooltip: 'Empty Quick Slot' };
            }

            // 1. Shoot Nearest (fire_nearest)
            if (slotDef.type === 'fire_nearest') {
                const fireKey = (realmKeyFn ? realmKeyFn('fire') : 'f') || 'f';
                const bowTval = r === 'angband' ? 5 : 19;
                const hasBow = Boolean(player.bow_item) || eq.some((it) => /\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(it.name || '') || /(ボウ|スリング|弓)/.test(it.name || '') || Number(it.tval) === bowTval);
                let ammoCount = 0;
                let ammoKey = null;
                for (const q of quiv) {
                    ammoCount += (Number(q.number || q.count) || 1);
                    if (!ammoKey) ammoKey = q.label || '0';
                }
                if (ammoCount === 0 && r === 'silq') {
                    // Sil-Q stores quiver arrows in equipment slots (INVEN_QUIVER1 / INVEN_QUIVER2)
                    for (const it of eq) {
                        const c = classifyInventoryEntry(it, r);
                        if (c.category === 'ranged' && !/\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(it.name || '')) {
                            ammoCount += (Number(it.number || it.count) || 1);
                        }
                    }
                }
                if (ammoCount === 0) {
                    for (const it of inv) {
                        const c = classifyInventoryEntry(it, r);
                        if (c.category === 'ranged' && !/\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(it.name || '')) {
                            ammoCount += (Number(it.number || it.count) || 1);
                            if (!ammoKey) ammoKey = it.label || String.fromCharCode(97 + (Number(it.slot) || 0));
                        }
                    }
                }
                const available = hasBow && (ammoCount > 0 || Boolean(player.quiver_item));
                const label = isJp ? (slotDef.labelJp || '射撃') : (slotDef.labelEn || 'Shoot');
                // Sil-Q 'f' prompts directly for direction ('t'); Angband/FCB/Hengband 'f' prompts for ammo slot first
                const seq = (r === 'silq' || !ammoKey) ? [fireKey, 't'] : [fireKey, ammoKey, 't'];
                return {
                    available,
                    icon: slotDef.icon || '🏹',
                    label,
                    qtyText: ammoCount > 0 ? `x${ammoCount}` : '',
                    sequence: seq,
                    tooltip: `${label} Nearest [${seq.join(' → ')}]`
                };
            }

            // 2. Smart Magic / Power (smart_magic)
            if (slotDef.type === 'smart_magic') {
                const statuses = Array.isArray(player.statuses) ? player.statuses : [];
                const isDisabling = statuses.some((s) => /blind|confus|paralyz|stun|hallucinat|盲目|混乱|麻痺|朦朧|幻覚/i.test(String((s && (s.name || s)) || '')));
                const curSp = Number(player.sp ?? player.csp ?? 0);
                const spMax = Number(player.sp_max ?? player.max_sp ?? player.msp ?? 0);
                const inp = (typeof window !== 'undefined' && window.__app && window.__app.input) ? window.__app.input : null;

                if (r === 'silq') {
                    const songKey = (realmKeyFn ? realmKeyFn('cast') : 's') || 's';
                    const hasSong = Boolean(Number(player.songs_known || 0) > 0 || (inp && inp._hasCastSuccess));
                    const canSing = spMax > 0 && curSp > 0 && !isDisabling && (!Array.isArray(player.inventory) || hasSong);
                    return {
                        available: canSing,
                        icon: '🎵',
                        label: hasSong ? 'Song' : 'No Song',
                        qtyText: canSing ? `${curSp}v` : '',
                        sequence: canSing ? [songKey] : [],
                        tooltip: canSing ? `Sing Song of Power [${songKey}]` : 'Learn a Song of Power in Skills [Tab] first'
                    };
                }

                const pClass = String(player.class || '').toLowerCase();
                const isNonCaster = /warrior|berserker|archer|cavalry|sniper|ninja|smith|weaponsmith|戦士|狂戦士|アーチャー|騎兵|鍛冶師/.test(pClass) || (pClass.includes('samurai') && spMax === 0);
                const isPriestClass = /priest|paladin|monk|僧侶|パラディン/.test(pClass);
                const isMageClass = /mage|wizard|sorcer|rogue|ranger|necromancer|魔道士|メイジ|レンジャー|盗賊/.test(pClass);

                const books = inv.filter((it) => {
                    if (classifyInventoryEntry(it, r).category !== 'tome') return false;
                    if (r === 'angband') {
                        const tv = Number(it && it.tval) || 0;
                        const nm = String((it && it.name) || '').toLowerCase();
                        if (isPriestClass && (tv === 30 || /magic|arcane|sorcery/.test(nm))) return false;
                        if (isMageClass && (tv === 31 || /prayer|holy|piety/.test(nm))) return false;
                    }
                    return true;
                });

                const hasStudyStatus = statuses.some((s) => /\bstudy\b|学習/i.test(String((s && (s.name || s)) || '')));
                const studyCount = Number(player.study || 0) || (hasStudyStatus ? 1 : 0);
                const zeroSpellsFlag = Boolean(inp && inp._zeroSpellsFlag);
                const hasCastSuccess = Boolean(inp && inp._hasCastSuccess) || (curSp < spMax && spMax > 0);
                const isUnstudiedL1 = (Number(player.level || 1) === 1) && studyCount > 0 && !hasCastSuccess;

                if (books.length > 0 && spMax > 0 && !isNonCaster) {
                    if (isUnstudiedL1 || zeroSpellsFlag) {
                        return {
                            available: false,
                            icon: '✨',
                            label: isUnstudiedL1 ? (isJp ? '未学習' : 'Study 1st') : (isJp ? '呪文なし' : 'No Spell'),
                            qtyText: '',
                            sequence: [],
                            tooltip: isUnstudiedL1 ? 'Study a spell first [G] before casting' : 'No spells learned yet — press [G] to Study'
                        };
                    }
                    if (curSp <= 0 || isDisabling) {
                        return {
                            available: false,
                            icon: slotDef.icon || '✨',
                            label: curSp <= 0 ? (isJp ? 'MP不足' : 'Low MP') : (isJp ? '詠唱不可' : 'Disabled'),
                            qtyText: `${curSp}sp`,
                            sequence: [],
                            tooltip: curSp <= 0 ? 'Not enough mana to cast' : 'Cannot cast while blind/confused/stunned'
                        };
                    }
                    const firstBook = books[0];
                    const bookKey = firstBook.label || String.fromCharCode(97 + (Number(firstBook.slot) || 0));
                    const castKey = (realmKeyFn ? realmKeyFn('cast') : 'm') || 'm';
                    const hasExplicitSpell = Boolean(slotDef.spellKey);
                    const seq = hasExplicitSpell
                        ? (slotDef.isOffensiveSpell ? [castKey, bookKey, slotDef.spellKey, 't'] : [castKey, bookKey, slotDef.spellKey])
                        : [castKey, bookKey];
                    const label = slotDef.spellName
                        ? shortItemLabel(slotDef.spellName, 10)
                        : (hasExplicitSpell ? `Spell [${slotDef.spellKey}]` : (isJp ? '呪文詠唱' : 'Cast'));
                    return {
                        available: true,
                        icon: slotDef.icon || '✨',
                        label,
                        qtyText: `${curSp}sp`,
                        sequence: seq,
                        tooltip: `Cast from ${firstBook.name || 'Book'} [${seq.join(' → ')}]`
                    };
                }
                if (slotDef.allowPowerFallback && (r === 'frogcomposband' || r === 'hengband')) {
                    const pwrKey = (realmKeyFn ? realmKeyFn('power') : 'U') || 'U';
                    const label = isJp ? '特殊能力' : 'Power';
                    return {
                        available: true,
                        icon: '🔮',
                        label,
                        qtyText: '',
                        sequence: [pwrKey],
                        tooltip: `Use Racial/Class Power [${pwrKey}]`
                    };
                }
                return {
                    available: false,
                    icon: '✨',
                    label: isJp ? '呪文なし' : 'No Spell',
                    qtyText: '',
                    sequence: [],
                    tooltip: 'No usable spellbooks or learned spells available (Right-click or click ⚙ to rebind)'
                };
            }

            // 3. Auto Category (Healing Potion or Escape Scroll)
            if (slotDef.type === 'auto_category') {
                const targetCat = slotDef.category || 'potion';
                let match = null;
                for (const it of inv) {
                    const info = classifyInventoryEntry(it, r);
                    if (info.category === targetCat) {
                        if (slotDef.preferSub === 'heal' && info.isHeal) { match = it; break; }
                        if (slotDef.preferSub === 'escape' && info.isEscape) { match = it; break; }
                        if (!match) match = it;
                    }
                }
                const verbName = targetCat === 'potion' ? 'quaff' : (targetCat === 'scroll' ? 'read' : 'use');
                const defaultVerb = r === 'silq' ? 'u' : (targetCat === 'potion' ? 'q' : 'r');
                const verbKey = (realmKeyFn ? realmKeyFn(verbName) : defaultVerb) || defaultVerb;
                if (match) {
                    const slotKey = match.label || String.fromCharCode(97 + (Number(match.slot) || 0));
                    const count = Number(match.number || match.count) || 1;
                    const label = shortItemLabel(match.name, 10);
                    return {
                        available: true,
                        icon: slotDef.icon || (targetCat === 'potion' ? '🧪' : '📜'),
                        label,
                        qtyText: `x${count}`,
                        sequence: [verbKey, slotKey],
                        tooltip: `${match.name} [${verbKey}${slotKey}]`
                    };
                }
                const fallbackLabel = isJp ? (slotDef.labelJp || '未所持') : (slotDef.labelEn || (targetCat === 'potion' ? 'Heal' : 'Scroll'));
                return {
                    available: false,
                    icon: slotDef.icon || (targetCat === 'potion' ? '🧪' : '📜'),
                    label: fallbackLabel,
                    qtyText: '0',
                    sequence: [],
                    tooltip: `Out of ${fallbackLabel}`
                };
            }

            // 4. Specific Bound Item or Tome Spell (type === 'item' || type === 'spell')
            if (slotDef.type === 'item' || slotDef.type === 'spell') {
                let matchedItem = null;
                // First match by (tval, sval) — 100% invariant across EN <-> JP language switches!
                if (slotDef.tval > 0 && slotDef.sval !== undefined && slotDef.sval !== null) {
                    matchedItem = inv.find((it) => Number(it.tval) === Number(slotDef.tval) && Number(it.sval) === Number(slotDef.sval));
                }
                // Next match by normalized item name
                if (!matchedItem && slotDef.normalizedName) {
                    matchedItem = inv.find((it) => normalizeItemName(it.name) === slotDef.normalizedName) ||
                                  inv.find((it) => normalizeItemName(it.name).includes(slotDef.normalizedName));
                }

                const verbKey = slotDef.verb || (r === 'silq' ? 'u' : 'q');
                if (matchedItem) {
                    const slotKey = matchedItem.label || String.fromCharCode(97 + (Number(matchedItem.slot) || 0));
                    const count = Number(matchedItem.number || matchedItem.count) || 1;
                    const seq = [verbKey, slotKey];
                    if (slotDef.type === 'spell' && slotDef.spellKey) {
                        seq.push(slotDef.spellKey);
                    }
                    if (slotDef.targetNearest) {
                        seq.push('t');
                    }
                    const displayLabel = slotDef.spellName
                        ? shortItemLabel(slotDef.spellName, 10)
                        : shortItemLabel(matchedItem.name, 10);
                    return {
                        available: true,
                        icon: slotDef.icon || '⚡',
                        label: displayLabel,
                        qtyText: slotDef.type === 'spell' ? '' : `x${count}`,
                        sequence: seq,
                        tooltip: `${matchedItem.name} [${seq.join(' → ')}]`
                    };
                }
                // Fallback if bound while in menu and player.inventory didn't match tval yet
                if (slotDef.fallbackKey) {
                    const seq = [verbKey, slotDef.fallbackKey];
                    if (slotDef.type === 'spell' && slotDef.spellKey) seq.push(slotDef.spellKey);
                    if (slotDef.targetNearest) seq.push('t');
                    return {
                        available: inv.length > 0,
                        icon: slotDef.icon || '⚡',
                        label: shortItemLabel(slotDef.name || 'Bound', 10),
                        qtyText: '',
                        sequence: seq,
                        tooltip: `${slotDef.name || 'Bound Item'} [${seq.join(' → ')}]`
                    };
                }
                return {
                    available: false,
                    icon: slotDef.icon || '⚡',
                    label: shortItemLabel(slotDef.name || 'Depleted', 10),
                    qtyText: '0',
                    sequence: [],
                    tooltip: `${slotDef.name || 'Item'} not in pack`
                };
            }

            // 5. Direct Repeatable Command (type === 'command')
            const cmdKey = slotDef.key || 'R';
            const seq = slotDef.targetNearest ? [cmdKey, 't'] : [cmdKey];
            return {
                available: true,
                icon: slotDef.icon || '⚡',
                label: isJp ? (slotDef.labelJp || slotDef.label || '行動') : (slotDef.label || 'Action'),
                qtyText: '',
                sequence: seq,
                tooltip: `${slotDef.label || 'Command'} [${seq.join(' → ')}]`
            };
        }

        /**
         * Executes Quick-Slot `slotIdx` (`0..3`).
         */
        executeSlot(slotIdx, frame, realm, sendKeyFn, toastFn) {
            if (frame && frame.phase && frame.phase !== 'play') {
                return false;
            }
            const idx = Math.max(0, Math.min(3, Number(slotIdx) || 0));
            const r = String(realm || 'angband').toLowerCase();
            const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
            const slots = this.getSlots(r);
            const resolved = this.resolveSlot(slots[idx], frame, r, lang);

            if (!resolved.available || !resolved.sequence || resolved.sequence.length === 0) {
                if (typeof toastFn === 'function') {
                    toastFn(`Quick Slot ${idx + 1}: ${resolved.tooltip || 'Unavailable'}`);
                }
                // Open binder popover on that slot so user can easily rebind
                this.openBinderPopover(idx, frame, r);
                return false;
            }

            if (typeof sendKeyFn === 'function') {
                const inOverlay = Boolean(frame && frame.ui && (frame.ui.overlay || 0) > 0) ||
                                  Boolean(typeof window !== 'undefined' && window.MenuRouter && window.MenuRouter.isDrawerOpen);
                const fullSeq = inOverlay ? ['Escape', ...resolved.sequence] : resolved.sequence;
                fullSeq.forEach((k, stepIdx) => {
                    if (stepIdx === 0) {
                        sendKeyFn(k);
                    } else {
                        setTimeout(() => sendKeyFn(k), stepIdx * 55);
                    }
                });
            }
            return true;
        }

        /**
         * Updates `#quick-slot-bar` in the HUD (signature-gated per L25).
         */
        renderBar(frame, realm, lang = 'en') {
            if (typeof document === 'undefined') return;
            const bar = document.getElementById('quick-slot-bar');
            if (!bar) return;

            const r = String(realm || 'angband').toLowerCase();
            const slots = this.getSlots(r);
            const resolvedList = slots.map((s) => this.resolveSlot(s, frame, r, lang));

            const sig = `${r}:${lang}:` + resolvedList.map((res, i) => `${i}:${res.available ? 1 : 0}:${res.icon}:${res.label}:${res.qtyText}`).join('|');
            if (sig === this._lastRenderSig) return;
            this._lastRenderSig = sig;

            for (let i = 0; i < 4; i++) {
                const btn = document.getElementById(`quick-slot-btn-${i + 1}`);
                if (!btn) continue;
                const res = resolvedList[i];
                btn.classList.toggle('is-depleted', !res.available);
                btn.title = `${res.tooltip} • Hotkey: Alt+${i + 1} (Right-click to bind)`;
                btn.innerHTML = `
                    <span class="qs-hotkey">Alt+${i + 1}</span>
                    <span class="qs-icon" aria-hidden="true">${escapeHtml(res.icon)}</span>
                    <span class="qs-label">${escapeHtml(res.label)}</span>
                    ${res.qtyText ? `<span class="qs-qty">${escapeHtml(res.qtyText)}</span>` : ''}
                `;
            }
        }

        /**
         * Binds an item or spell directly from the Grimoire Deck `⚡ Bind` button.
         */
        bindFromGrimoire(payload, frame, realm, toastFn) {
            if (!payload) return null;
            const r = String(realm || 'angband').toLowerCase();
            const player = (frame && frame.player) ? frame.player : {};
            const inv = Array.isArray(player.inventory) ? player.inventory : [];
            const key = String(payload.key || 'a');
            const name = String(payload.name || 'Bound Action');
            const normName = normalizeItemName(name);

            // Look up tval/sval from live inventory if matching slot label or name
            const invItem = inv.find((it) => it.label === key || normalizeItemName(it.name) === normName);

            let slotIdx = this.activeBindSlot;
            // Choose best default target slot based on category
            if (payload.category === 'ranged') slotIdx = 0;
            else if (payload.category === 'potion') slotIdx = 1;
            else if (payload.category === 'tome' || payload.verb === '__bind_spell__') slotIdx = 2;
            else if (payload.category === 'scroll' || payload.category === 'device') slotIdx = 3;

            const isOffensiveDevice = payload.category === 'device' || payload.category === 'ranged';
            let slotDef;
            if (payload.verb === '__bind_spell__') {
                const castKey = (typeof window !== 'undefined' && window.RealmKeys && window.RealmKeys.realmKey)
                    ? (window.RealmKeys.realmKey('cast', r) || 'm')
                    : 'm';
                slotDef = {
                    type: 'smart_magic',
                    verb: castKey,
                    spellKey: key,
                    spellName: name,
                    icon: '✨',
                    targetNearest: true
                };
            } else {
                slotDef = {
                    type: 'item',
                    verb: payload.verb || (r === 'silq' ? 'u' : 'q'),
                    name,
                    normalizedName: normName,
                    tval: invItem ? Number(invItem.tval) || 0 : 0,
                    sval: invItem ? Number(invItem.sval) : null,
                    fallbackKey: key,
                    icon: payload.icon || '⚡',
                    category: payload.category || 'misc',
                    targetNearest: isOffensiveDevice
                };
            }

            this.setSlot(r, slotIdx, slotDef);
            this.activeBindSlot = (slotIdx + 1) % 4;
            this.renderBar(frame, r, (typeof window !== 'undefined' && window.__langMode) || 'en');
            if (typeof toastFn === 'function') {
                toastFn(`⚡ Bound "${shortItemLabel(name, 18)}" to Quick Slot ${slotIdx + 1} (Alt+${slotIdx + 1})`);
            }
            return { slotIdx, slotDef };
        }

        /**
         * Opens the interactive Quick-Slot Binder Popover so the player can assign any spell, item, or action to Slots 1–4.
         */
        openBinderPopover(slotIdx = 0, frame = null, realm = 'angband') {
            if (typeof document === 'undefined') return;
            const popover = document.getElementById('quick-slot-popover');
            if (!popover) return;

            this.activeBindSlot = Math.max(0, Math.min(3, Number(slotIdx) || 0));
            const r = String(realm || 'angband').toLowerCase();
            const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
            const isJp = r === 'hengband' && lang === 'jp';
            const player = (frame && frame.player) ? frame.player : {};
            const inv = Array.isArray(player.inventory) ? player.inventory : [];
            const slots = this.getSlots(r);

            const tabsHtml = [0, 1, 2, 3].map((idx) => {
                const res = this.resolveSlot(slots[idx], frame, r, lang);
                const activeCls = idx === this.activeBindSlot ? 'is-active' : '';
                return `<button type="button" class="qs-slot-tab ${activeCls}" data-qs-select-slot="${idx}">Alt+${idx + 1}: ${escapeHtml(res.icon)} ${escapeHtml(res.label)}</button>`;
            }).join('');

            const candidates = [
                {
                    label: isJp ? '🏹 最寄りの敵を射撃 (Shoot Nearest)' : '🏹 Shoot Nearest Enemy (f → t)',
                    def: { type: 'fire_nearest', icon: '🏹', labelEn: 'Shoot', labelJp: '射撃', targetNearest: true }
                },
                {
                    label: isJp ? '🧪 回復薬を自動で飲む (Auto-Quaff Heal)' : '🧪 Quaff Best Healing Potion',
                    def: { type: 'auto_category', category: 'potion', preferSub: 'heal', icon: '🧪', labelEn: 'Heal', labelJp: '回復薬' }
                },
                {
                    label: isJp ? '✨ 魔法書を開く / 詠唱 (Open Spellbook)' : '✨ Open Primary Spellbook (m → Book)',
                    def: { type: 'smart_magic', icon: r === 'silq' ? '🎵' : '✨', labelEn: r === 'silq' ? 'Song' : 'Cast', labelJp: '呪文詠唱', targetNearest: false }
                },
                {
                    label: isJp ? '✨ 呪文 [a] で最寄りの敵を攻撃 (Spell a → Target)' : '✨ Cast Spell [a] at Nearest Enemy (m → Book → a → t)',
                    def: { type: 'smart_magic', icon: '✨', spellKey: 'a', spellName: isJp ? '呪文[a]攻撃' : 'Spell [a]', isOffensiveSpell: true, targetNearest: true }
                },
                {
                    label: isJp ? '✨ 呪文 [a] を詠唱・補助 (Spell a Self/Utility)' : '✨ Cast Spell [a] Self / Utility (m → Book → a)',
                    def: { type: 'smart_magic', icon: '✨', spellKey: 'a', spellName: isJp ? '呪文[a]' : 'Spell [a]', isOffensiveSpell: false, targetNearest: false }
                },
                {
                    label: isJp ? '✨ 呪文 [b] を詠唱 (Cast Spell b)' : '✨ Cast Spell [b] (m → Book → b)',
                    def: { type: 'smart_magic', icon: '✨', spellKey: 'b', spellName: isJp ? '呪文[b]' : 'Spell [b]', isOffensiveSpell: false, targetNearest: false }
                },
                {
                    label: isJp ? '✨ 呪文 [c] を詠唱 (Cast Spell c)' : '✨ Cast Spell [c] (m → Book → c)',
                    def: { type: 'smart_magic', icon: '✨', spellKey: 'c', spellName: isJp ? '呪文[c]' : 'Spell [c]', isOffensiveSpell: false, targetNearest: false }
                },
                {
                    label: isJp ? '📜 脱出・テレポートの巻物 (Escape Scroll)' : '📜 Read Escape / Phase Door Scroll',
                    def: { type: 'auto_category', category: 'scroll', preferSub: 'escape', icon: '📜', labelEn: 'Escape', labelJp: '脱出巻' }
                },
                {
                    label: isJp ? '⏳ 安全まで休憩 (Rest Until Healed)' : '⏳ Rest Until Healed (R)',
                    def: { type: 'command', key: r === 'silq' ? 'z' : 'R', icon: '⏳', label: 'Rest', labelJp: '休憩' }
                },
                {
                    label: isJp ? '🔍 周囲を探索 (Search Adjacent [s])' : '🔍 Search Adjacent Walls / Traps (s)',
                    def: { type: 'command', key: 's', icon: '🔍', label: 'Search', labelJp: '探索' }
                },
                {
                    label: isJp ? '🚪 扉・箱を開ける (Open Door [o])' : '🚪 Open Door or Chest (o)',
                    def: { type: 'command', key: 'o', icon: '🚪', label: 'Open', labelJp: '開ける' }
                },
                {
                    label: isJp ? '🎒 足元のアイテムを拾う (Pick Up [g])' : '🎒 Pick Up Item Underfoot (g)',
                    def: { type: 'command', key: 'g', icon: '🎒', label: 'Get', labelJp: '拾う' }
                },
                {
                    label: isJp ? '🍞 食料を食べる (Eat Food [E])' : '🍞 Eat Food / Ration (E)',
                    def: { type: 'command', key: r === 'silq' ? 'u' : 'E', icon: '🍞', label: 'Eat', labelJp: '食事' }
                },
                {
                    label: isJp ? '🔦 光源に燃料補給 (Refuel Light [F])' : '🔦 Refuel Torch / Lantern (F)',
                    def: { type: 'command', key: 'F', icon: '🔦', label: 'Refuel', labelJp: '燃料' }
                },
                {
                    label: isJp ? '✨ 新しい呪文を学習 (Study Spell [G])' : '✨ Study / Learn New Spell (G)',
                    def: { type: 'command', key: 'G', icon: '✨', label: 'Study', labelJp: '学習' }
                },
                {
                    label: isJp ? '🔮 レイシャル・特殊能力 (Use Power [U])' : '🔮 Use Racial / Class Power (U)',
                    def: { type: 'command', key: 'U', icon: '🔮', label: 'Power', labelJp: '能力' }
                }
            ];

            for (const it of inv) {
                const info = classifyInventoryEntry(it, r);
                const verbMap = {
                    potion: r === 'silq' ? 'u' : 'q',
                    scroll: r === 'silq' ? 'u' : 'r',
                    device: r === 'silq' ? 'u' : ((r === 'hengband' || r === 'frogcomposband') ? 'a' : 'u'),
                    tome: 'm',
                    ranged: 'f',
                    food: r === 'silq' ? 'u' : 'E',
                    other: 'w'
                };
                const verb = verbMap[info.category] || 'w';
                candidates.push({
                    label: `${info.icon} [${it.label || 'a'}] ${it.name}`,
                    def: {
                        type: info.category === 'tome' ? 'smart_magic' : 'item',
                        verb,
                        name: it.name,
                        normalizedName: normalizeItemName(it.name),
                        tval: Number(it.tval) || 0,
                        sval: Number(it.sval),
                        fallbackKey: it.label || 'a',
                        icon: info.icon,
                        category: info.category,
                        targetNearest: info.category === 'device' || info.category === 'ranged'
                    }
                });
            }

            const listHtml = candidates.map((c, cIdx) => `
                <button type="button" class="qs-candidate-item" data-qs-bind-idx="${cIdx}">
                    <span>${escapeHtml(c.label)}</span>
                    <span style="color:#ffd268;font-weight:700;">${isJp ? '割当' : 'Bind'}</span>
                </button>
            `).join('');

            popover._candidates = candidates;
            popover.innerHTML = `
                <div class="qs-popover-header">
                    <span>⚡ ${isJp ? 'クイックスロット設定 (Alt+1〜4)' : 'Bind Quick-Action Slots (Alt+1–4)'}</span>
                    <div style="display:flex;gap:6px;">
                        <button type="button" class="grimoire-tab-btn" data-qs-action="reset">${isJp ? '初期化' : 'Reset'}</button>
                        <button type="button" class="grimoire-tab-btn" data-qs-action="close">✕</button>
                    </div>
                </div>
                <div class="qs-popover-slots">${tabsHtml}</div>
                <div class="qs-candidate-list">${listHtml}</div>
            `;
            popover.classList.add('is-open');

            if (!popover._boundEvents) {
                popover._boundEvents = true;
                if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                    document.addEventListener('click', (docEv) => {
                        if (!popover.classList.contains('is-open')) return;
                        if (docEv.target && docEv.target.closest && docEv.target.closest('#quick-slot-popover, #quick-slot-bar')) return;
                        popover.classList.remove('is-open');
                    });
                }
                popover.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const closeBtn = ev.target.closest('[data-qs-action="close"]');
                    if (closeBtn) {
                        popover.classList.remove('is-open');
                        return;
                    }
                    const resetBtn = ev.target.closest('[data-qs-action="reset"]');
                    if (resetBtn) {
                        const curRealm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                        const curFrame = (window.__app && window.__app.lastFrame) || null;
                        this.resetRealmSlots(curRealm);
                        this.renderBar(curFrame, curRealm, window.__langMode || 'en');
                        this.openBinderPopover(this.activeBindSlot, curFrame, curRealm);
                        return;
                    }
                    const slotTab = ev.target.closest('[data-qs-select-slot]');
                    if (slotTab) {
                        const curRealm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                        const curFrame = (window.__app && window.__app.lastFrame) || null;
                        this.openBinderPopover(Number(slotTab.getAttribute('data-qs-select-slot')), curFrame, curRealm);
                        return;
                    }
                    const candBtn = ev.target.closest('[data-qs-bind-idx]');
                    if (candBtn && popover._candidates) {
                        const cIdx = Number(candBtn.getAttribute('data-qs-bind-idx'));
                        const chosen = popover._candidates[cIdx];
                        if (chosen) {
                            const curRealm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                            const curFrame = (window.__app && window.__app.lastFrame) || null;
                            this.setSlot(curRealm, this.activeBindSlot, chosen.def);
                            this.renderBar(curFrame, curRealm, window.__langMode || 'en');
                            popover.classList.remove('is-open');
                        }
                    }
                });
            }
        }
    }

    const singleton = new QuickActionController();
    return {
        QuickActionController,
        normalizeItemName,
        shortItemLabel,
        classifyInventoryEntry,
        getDefaultSlots,
        getInstance: () => singleton,
        getSlots: (realm) => singleton.getSlots(realm),
        setSlot: (realm, idx, def) => singleton.setSlot(realm, idx, def),
        resetRealmSlots: (realm) => singleton.resetRealmSlots(realm),
        resolveSlot: (slotDef, frame, realm, lang) => singleton.resolveSlot(slotDef, frame, realm, lang),
        executeSlot: (idx, frame, realm, sendKeyFn, toastFn) => singleton.executeSlot(idx, frame, realm, sendKeyFn, toastFn),
        renderBar: (frame, realm, lang) => singleton.renderBar(frame, realm, lang),
        bindFromGrimoire: (payload, frame, realm, toastFn) => singleton.bindFromGrimoire(payload, frame, realm, toastFn),
        openBinderPopover: (idx, frame, realm) => singleton.openBinderPopover(idx, frame, realm)
    };
});

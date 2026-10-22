/**
 * QuickActionManager — 4-Slot Cross-Realm Bindable Quick-Action Bar & Macro Engine
 * WS42 Command & Menu Unification (Card WS42.4C, CMD-P1-06, Contract (h)).
 * 0 timer-paced key sequences. Multi-key intents dispatched via CommandDispatcher
 * or frame-acknowledged queue (onFrame). Budget: <= 450 lines.
 */
(function (root, factory) {
    'use strict';
    const exported = factory();
    if (typeof module === 'object' && module.exports) module.exports = exported;
    if (root) { root.QuickActionManager = exported; root.QuickActions = exported; }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STORAGE_PREFIX = 'angband3d_quick_slots_v1_';
    const VANILLA_LETTERS = 'abcdefgimnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const vanillaLetter = i => VANILLA_LETTERS[i] || String.fromCharCode(97 + i);

    function resolveVerbKey(verb, realm) {
        const r = String(realm || 'angband').toLowerCase();
        const cat = (typeof ActionCatalog !== 'undefined' && ActionCatalog) || (typeof window !== 'undefined' && window.ActionCatalog) || null;
        if (cat && typeof cat.keyFor === 'function') { const k = cat.keyFor(verb, r); if (k !== null && k !== undefined) return k; }
        const rk = (typeof RealmKeys !== 'undefined' && RealmKeys) || (typeof window !== 'undefined' && window.RealmKeys) || null;
        if (rk && typeof rk.realmKey === 'function') { const k = rk.realmKey(verb, r); if (k !== null && k !== undefined) return k; }
        const fb = {
            quaff: { angband: 'q', silq: 'u', frogcomposband: 'q', hengband: 'q' }, read: { angband: 'r', silq: 'u', frogcomposband: 'r', hengband: 'r' },
            eat: { angband: 'E', silq: 'u', frogcomposband: 'E', hengband: 'E' }, wield: { angband: 'w', silq: 'w', frogcomposband: 'w', hengband: 'w' },
            takeoff: { angband: 't', silq: 'r', frogcomposband: 't', hengband: 't' }, drop: { angband: 'd', silq: 'd', frogcomposband: 'd', hengband: 'd' },
            fire: { angband: 'f', silq: 'f', frogcomposband: 'f', hengband: 'f' }, cast: { angband: 'm', silq: 's', frogcomposband: 'm', hengband: 'm' },
            power: { angband: 'U', silq: 'U', frogcomposband: 'U', hengband: 'U' }, rest: { angband: 'R', silq: '%', frogcomposband: 'R', hengband: 'R' },
            open: { angband: 'o', silq: 'o', frogcomposband: 'o', hengband: 'o' }, study: { angband: 'G', silq: null, frogcomposband: 'G', hengband: 'G' },
            search: { angband: null, silq: null, frogcomposband: 'S', hengband: 'S' }
        };
        return fb[verb] ? (fb[verb][r] || null) : null;
    }

    function getDeviceVerb(it, realm = 'angband') {
        const r = String(realm || 'angband').toLowerCase(), tval = Number(it && it.tval) || 0, name = String((it && it.name) || '').toLowerCase();
        if (r === 'silq') return (/\bhorn\b/.test(name) || tval === 54) ? 'p' : 'a';
        if (tval === 23 || tval === 66 || /\b(wand)\b/.test(name) || /魔法棒/.test(name)) return 'a';
        if (tval === 24 || tval === 65 || /\b(rod)\b/.test(name) || /ロッド/.test(name)) return 'z';
        if (tval === 22 || tval === 55 || /\b(staff|staves)\b/.test(name) || /(スタッフ|の杖)/.test(name)) return 'u';
        return 'u';
    }

    const escapeHtml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function normalizeItemName(desc) {
        let s = String(desc || '').trim();
        s = s.replace(/^(?:an?\s+|\d+\s+|few\s+|\d+\s*(?:個|本|巻|冊|枚|服|束|対|着)の?\s*)/i, '');
        s = s.replace(/\s+\d+(?:\.\d+)?\s*(?:lb|kg)s?(?:\s+\d+)?$/i, '');
        return s.replace(/\{[^}]*\}|\([^)]*\)|\[[^\]]*\]/g, '').trim().toLowerCase();
    }

    function shortItemLabel(desc, maxLen = 11) {
        let s = String(desc || '').trim();
        s = s.replace(/^(?:an?\s+|\d+\s+|\d+\s*(?:個|本|巻|冊|枚|服|束)の?\s*)/i, '');
        s = s.replace(/^(?:potions?\s+of\s+|scrolls?\s+of\s+|wands?\s+of\s+|rods?\s+of\s+|staves?\s+of\s+|staff\s+of\s+|books?\s+of\s+)/i, '');
        s = s.replace(/(?:の薬|の巻物|の魔法棒|のロッド|のスタッフ|の杖)$/, '');
        s = s.replace(/\{[^}]*\}|\([^)]*\)|\[[^\]]*\]/g, '').trim();
        return (s.length > maxLen) ? s.slice(0, maxLen - 1) + '…' : (s || 'Action');
    }

    function classifyInventoryEntry(it, realm = 'angband') {
        const name = String((it && it.name) || ''), lower = name.toLowerCase(), tval = Number(it && it.tval) || 0;
        const isVanilla = String(realm || 'angband').toLowerCase() === 'angband';
        if (/\b(potion|phial|draught|elixir)\b/.test(lower) || /(の薬|水薬|霊薬|丸薬|薬$)/.test(name) || (isVanilla ? tval === 26 : (tval === 75 || tval === 71))) {
            return { category: 'potion', isHeal: /\b(heal|cure|curing|life|restore|aid)\b/.test(lower) || /(治療|治癒|回復|傷|体力|生命)/.test(name), icon: '🧪' };
        }
        if (/\b(scroll|parchment|card|trump)\b/.test(lower) || /(の巻物|巻物|カード)/.test(name) || (isVanilla ? tval === 25 : (tval === 70 || tval === 50))) {
            return { category: 'scroll', isEscape: /\b(phase|teleport|recall|banish|destruction|sanctuary)\b/.test(lower) || /(ショート・テレポート|テレポート|帰還|破壊|聖域)/.test(name), icon: '📜' };
        }
        if (/\b(wand|rod|staff)\b/.test(lower) || /(魔法棒|ロッド|スタッフ|の杖)/.test(name) || (isVanilla ? (tval >= 22 && tval <= 24) : (tval === 55 || tval === 65 || tval === 66))) return { category: 'device', icon: '🪄' };
        if (/\b(book|tome|grimoire|manual|hymnal|songbook)\b/.test(lower) || /(魔法書|仙術書|経典|教本|『[^』]+』|\[[^\]]+の魔法書\])/.test(name) || (isVanilla ? (tval >= 30 && tval <= 34) : (tval >= 90 && tval <= 115))) return { category: 'tome', icon: '📖' };
        if (/\b(bow|longbow|shortbow|crossbow|sling|arrow|bolt|shot|pebble|seeker|sheaf)\b/.test(lower) || /(ボウ|スリング|弓|矢|弾|丸石)/.test(name) || (isVanilla ? (tval >= 2 && tval <= 5) : (tval >= 16 && tval <= 19))) return { category: 'ranged', icon: '🏹' };
        if (/\b(ration|food|bread|waybread|lembas|jerky|mushroom|slime mold)\b/.test(lower) || /(食料|レーション|パン|キノコ)/.test(name) || (isVanilla ? (tval === 28 || tval === 29) : tval === 80)) return { category: 'food', icon: '🍞' };
        return { category: 'other', icon: '⚔️' };
    }

    const getDefaultSlots = realm => [
        { slotIndex: 0, type: 'fire_nearest', icon: '🏹', labelEn: 'Shoot', labelJp: '射撃', targetNearest: true },
        { slotIndex: 1, type: 'auto_category', category: 'potion', preferSub: 'heal', icon: '🧪', labelEn: 'Heal', labelJp: '回復薬', targetNearest: false },
        { slotIndex: 2, type: 'smart_magic', icon: String(realm || '').toLowerCase() === 'silq' ? '🎵' : '✨', labelEn: String(realm || '').toLowerCase() === 'silq' ? 'Song' : 'Spell/Pwr', labelJp: '呪文/能力', targetNearest: true },
        { slotIndex: 3, type: 'auto_category', category: 'scroll', preferSub: 'escape', icon: '📜', labelEn: 'Escape', labelJp: '脱出巻', targetNearest: false }
    ];

    class QuickActionController {
        constructor() {
            this.slotsByRealm = {}; this.activeBindSlot = 0; this._lastRenderSig = '';
            this._currentCharName = ''; this._hasCastSuccess = false; this._zeroSpellsFlag = false; this._stepQueue = null;
        }

        _storageKey(realm, charName) {
            const r = String(realm || 'angband').toLowerCase(), cn = charName ? String(charName).trim().toLowerCase() : '';
            return cn ? `${STORAGE_PREFIX}${r}_${cn}` : `${STORAGE_PREFIX}${r}`;
        }

        resetForCharacter(realm, charName) {
            this._currentCharName = charName ? String(charName).trim() : '';
            this._hasCastSuccess = false; this._zeroSpellsFlag = false; this._lastRenderSig = '';
            const inp = (typeof window !== 'undefined' && window.__app && window.__app.input) ? window.__app.input : null;
            if (inp) { inp._hasCastSuccess = false; inp._zeroSpellsFlag = false; }
            if (realm) return this.getSlots(realm, this._currentCharName);
        }

        getSlots(realm, charName) {
            const r = String(realm || 'angband').toLowerCase(), cn = (charName !== undefined && charName !== null) ? String(charName).trim().toLowerCase() : (this._currentCharName ? String(this._currentCharName).trim().toLowerCase() : '');
            const cacheKey = cn ? `${r}_${cn}` : r;
            if (this.slotsByRealm[cacheKey]) return this.slotsByRealm[cacheKey];
            let loaded = null;
            if (typeof localStorage !== 'undefined') {
                try {
                    const raw = cn ? (localStorage.getItem(this._storageKey(r, cn)) || localStorage.getItem(this._storageKey(r))) : localStorage.getItem(this._storageKey(r));
                    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length === 4) loaded = p; }
                } catch (_) {}
            }
            return (this.slotsByRealm[cacheKey] = loaded || getDefaultSlots(r));
        }

        saveSlots(realm, slots, charName) {
            const r = String(realm || 'angband').toLowerCase(), cn = (charName !== undefined && charName !== null) ? String(charName).trim().toLowerCase() : (this._currentCharName ? String(this._currentCharName).trim().toLowerCase() : '');
            this.slotsByRealm[cn ? `${r}_${cn}` : r] = slots; this._lastRenderSig = '';
            if (typeof localStorage !== 'undefined') {
                try {
                    const data = JSON.stringify(slots);
                    if (cn) localStorage.setItem(this._storageKey(r, cn), data);
                    localStorage.setItem(this._storageKey(r), data);
                } catch (_) {}
            }
        }

        resetRealmSlots(realm, charName) {
            const defaults = getDefaultSlots(realm);
            this.saveSlots(realm, defaults, charName);
            return defaults;
        }

        setSlot(realm, slotIdx, slotDef, charName) {
            const idx = Math.max(0, Math.min(3, Number(slotIdx) || 0)), slots = this.getSlots(realm, charName).slice();
            slots[idx] = Object.assign({ slotIndex: idx }, slotDef);
            this.saveSlots(realm, slots, charName);
            return slots[idx];
        }

        resolveSlot(slotDef, frame, realm, lang = 'en') {
            const r = String(realm || 'angband').toLowerCase(), isJp = r === 'hengband' && lang === 'jp';
            const player = (frame && frame.player) ? frame.player : {};
            if (player && player.name) this._currentCharName = player.name;
            const inv = Array.isArray(player.inventory) ? player.inventory : [], eq = Array.isArray(player.equipment) ? player.equipment : [], quiv = Array.isArray(player.quiver) ? player.quiver : [];
            if (!slotDef) return { available: false, icon: '⚡', label: isJp ? '未設定' : 'Empty', qtyText: '', sequence: [], tooltip: 'Empty Quick Slot' };

            // 1. Shoot Nearest
            if (slotDef.type === 'fire_nearest') {
                const fireKey = resolveVerbKey('fire', r) || 'f', bowTval = r === 'angband' ? 5 : 19;
                const hasBow = Boolean(player.bow_item) || eq.some((it) => /\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(it.name || '') || /(ボウ|スリング|弓)/.test(it.name || '') || Number(it.tval) === bowTval);
                let ammoCount = 0, ammoKey = null;
                for (const q of quiv) { ammoCount += (Number(q.number || q.count) || 1); if (!ammoKey) ammoKey = q.label || '0'; }
                const scanItems = (ammoCount === 0 && r === 'silq') ? eq : (ammoCount === 0 ? inv : []);
                for (const it of scanItems) {
                    if (classifyInventoryEntry(it, r).category === 'ranged' && !/\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(it.name || '')) {
                        ammoCount += (Number(it.number || it.count) || 1);
                        if (!ammoKey) { const itIdx = (it.slot !== undefined && it.slot !== null) ? Number(it.slot) : inv.indexOf(it); ammoKey = it.letter || it.label || (r === 'angband' ? vanillaLetter(itIdx >= 0 ? itIdx : 0) : String.fromCharCode(97 + (itIdx >= 0 ? itIdx : 0))); }
                    }
                }
                const available = hasBow && (ammoCount > 0 || Boolean(player.quiver_item)), label = isJp ? (slotDef.labelJp || '射撃') : (slotDef.labelEn || 'Shoot');
                const seq = (r === 'silq' || !ammoKey) ? [fireKey, 't'] : [fireKey, ammoKey, 't'];
                return { available, icon: slotDef.icon || '🏹', label, qtyText: ammoCount > 0 ? `x${ammoCount}` : '', sequence: seq, tooltip: `${label} Nearest [${seq.join(' → ')}]` };
            }

            // 2. Smart Magic / Power
            if (slotDef.type === 'smart_magic') {
                const statuses = Array.isArray(player.statuses) ? player.statuses : [];
                const isDisabling = statuses.some((s) => /blind|confus|paralyz|stun|hallucinat|盲目|混乱|麻痺|朦朧|幻覚/i.test(String((s && (s.name || s)) || '')));
                const curSp = Number(player.sp ?? player.csp ?? 0), spMax = Number(player.sp_max ?? player.max_sp ?? player.msp ?? 0);
                const inp = (typeof window !== 'undefined' && window.__app && window.__app.input) ? window.__app.input : null;
                if (r === 'silq') {
                    const songKey = resolveVerbKey('cast', r) || 's', hasSong = Boolean(Number(player.songs_known || 0) > 0 || this._hasCastSuccess || (inp && inp._hasCastSuccess));
                    const canSing = spMax > 0 && curSp > 0 && !isDisabling && (!Array.isArray(player.inventory) || hasSong);
                    return { available: canSing, icon: '🎵', label: hasSong ? 'Song' : 'No Song', qtyText: canSing ? `${curSp}v` : '', sequence: canSing ? [songKey] : [], tooltip: canSing ? `Sing Song of Power [${songKey}]` : 'Learn a Song of Power in Skills [Tab] first' };
                }
                const pClass = String(player.class || '').toLowerCase(), isNonCaster = /warrior|berserker|archer|cavalry|sniper|ninja|smith|weaponsmith|戦士|狂戦士|アーチャー|騎兵|鍛冶師/.test(pClass) || (pClass.includes('samurai') && spMax === 0);
                const isPriest = /priest|paladin|monk|僧侶|パラディン/.test(pClass), isMage = /mage|wizard|sorcer|rogue|ranger|necromancer|魔道士|メイジ|レンジャー|盗賊/.test(pClass);
                const books = inv.filter((it) => {
                    if (classifyInventoryEntry(it, r).category !== 'tome') return false;
                    if (r === 'angband') {
                        const tv = Number(it && it.tval) || 0, nm = String((it && it.name) || '').toLowerCase();
                        if ((isPriest && (tv === 30 || /magic|arcane|sorcery/.test(nm))) || (isMage && (tv === 31 || /prayer|holy|piety/.test(nm)))) return false;
                    }
                    return true;
                });
                const studyCount = Number(player.study || 0) || (statuses.some((s) => /\bstudy\b|学習/i.test(String((s && (s.name || s)) || ''))) ? 1 : 0);
                const zeroSpells = Boolean(this._zeroSpellsFlag || (inp && inp._zeroSpellsFlag)), castSuccess = Boolean(this._hasCastSuccess || (inp && inp._hasCastSuccess)) || (curSp < spMax && spMax > 0);
                const isUnstudiedL1 = (Number(player.level || 1) === 1) && studyCount > 0 && !castSuccess;

                if (books.length > 0 && spMax > 0 && !isNonCaster) {
                    if (isUnstudiedL1 || zeroSpells) return { available: false, icon: '✨', label: isUnstudiedL1 ? (isJp ? '未学習' : 'Study 1st') : (isJp ? '呪文なし' : 'No Spell'), qtyText: '', sequence: [], tooltip: isUnstudiedL1 ? 'Study a spell first [G] before casting' : 'No spells learned yet — press [G] to Study' };
                    if (curSp <= 0 || isDisabling) return { available: false, icon: slotDef.icon || '✨', label: curSp <= 0 ? (isJp ? 'MP不足' : 'Low MP') : (isJp ? '詠唱不可' : 'Disabled'), qtyText: `${curSp}sp`, sequence: [], tooltip: curSp <= 0 ? 'Not enough mana to cast' : 'Cannot cast while blind/confused/stunned' };
                    const fb = books[0], fbIdx = (fb.slot !== undefined && fb.slot !== null) ? Number(fb.slot) : inv.indexOf(fb);
                    const bookLetter = fb.letter || fb.label || (r === 'angband' ? vanillaLetter(fbIdx >= 0 ? fbIdx : 0) : String.fromCharCode(97 + (fbIdx >= 0 ? fbIdx : 0)));
                    const bookKey = slotDef.book || bookLetter, castKey = resolveVerbKey('cast', r) || 'm', hasExp = Boolean(slotDef.spellKey);
                    const isOff = slotDef.isOffensiveSpell !== undefined ? slotDef.isOffensiveSpell : slotDef.targetNearest;
                    const seq = hasExp ? (isOff ? [castKey, bookKey, slotDef.spellKey, 't'] : [castKey, bookKey, slotDef.spellKey]) : [castKey, bookKey];
                    const label = slotDef.spellName ? shortItemLabel(slotDef.spellName, 10) : (hasExp ? `Spell [${slotDef.spellKey}]` : (isJp ? '呪文詠唱' : 'Cast'));
                    return { available: true, icon: slotDef.icon || '✨', label, qtyText: `${curSp}sp`, sequence: seq, tooltip: `Cast from ${fb.name || 'Book'} [${seq.join(' → ')}]` };
                }
                if (slotDef.allowPowerFallback && (r === 'frogcomposband' || r === 'hengband')) return { available: true, icon: '🔮', label: isJp ? '特殊能力' : 'Power', qtyText: '', sequence: [resolveVerbKey('power', r) || 'U'], tooltip: `Use Power [${resolveVerbKey('power', r) || 'U'}]` };
                return { available: false, icon: '✨', label: isJp ? '呪文なし' : 'No Spell', qtyText: '', sequence: [], tooltip: 'No usable spellbooks or learned spells available' };
            }

            // 3. Auto Category
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
                const verbKey = resolveVerbKey(targetCat === 'potion' ? 'quaff' : (targetCat === 'scroll' ? 'read' : 'use'), r) || (r === 'silq' ? 'u' : (targetCat === 'potion' ? 'q' : 'r'));
                if (match) {
                    const mIdx = (match.slot !== undefined && match.slot !== null) ? Number(match.slot) : inv.indexOf(match);
                    const slotKey = match.letter || match.label || (r === 'angband' ? vanillaLetter(mIdx >= 0 ? mIdx : 0) : String.fromCharCode(97 + (mIdx >= 0 ? mIdx : 0)));
                    return { available: true, icon: slotDef.icon || (targetCat === 'potion' ? '🧪' : '📜'), label: shortItemLabel(match.name, 10), qtyText: `x${Number(match.number || match.count) || 1}`, sequence: [verbKey, slotKey], tooltip: `${match.name} [${verbKey}${slotKey}]` };
                }
                const fbLabel = isJp ? (slotDef.labelJp || '未所持') : (slotDef.labelEn || (targetCat === 'potion' ? 'Heal' : 'Scroll'));
                return { available: false, icon: slotDef.icon || (targetCat === 'potion' ? '🧪' : '📜'), label: fbLabel, qtyText: '0', sequence: [], tooltip: `Out of ${fbLabel}` };
            }

            // 4. Bound Item or Spell
            if (slotDef.type === 'item' || slotDef.type === 'spell') {
                let matched = null, allItems = [...inv, ...eq, ...quiv];
                if (slotDef.tval > 0 && slotDef.sval !== undefined && slotDef.sval !== null) matched = allItems.find((it) => Number(it.tval) === Number(slotDef.tval) && Number(it.sval) === Number(slotDef.sval));
                if (!matched && slotDef.normalizedName) matched = allItems.find((it) => normalizeItemName(it.name) === slotDef.normalizedName || normalizeItemName(it.name).includes(slotDef.normalizedName));
                const itemCat = matched ? classifyInventoryEntry(matched, r).category : (slotDef.category || 'item');
                let verbKey = (itemCat === 'device' || slotDef.category === 'device') ? (matched ? getDeviceVerb(matched, r) : (slotDef.verb || (r === 'silq' ? 'a' : 'u'))) : (slotDef.verb || (r === 'silq' ? 'u' : 'q'));
                if (matched) {
                    let slotKey = matched.letter || matched.label;
                    if (!slotKey) { const iIdx = inv.indexOf(matched), idx = (matched.slot !== undefined && matched.slot !== null) ? Number(matched.slot) : (iIdx >= 0 ? iIdx : 0); slotKey = (r === 'angband') ? vanillaLetter(idx) : String.fromCharCode(97 + idx); }
                    const seq = [verbKey, slotKey];
                    if (slotDef.type === 'spell' && slotDef.spellKey) seq.push(slotDef.spellKey);
                    if (slotDef.targetNearest) seq.push('t');
                    return { available: true, icon: slotDef.icon || '⚡', label: slotDef.spellName ? shortItemLabel(slotDef.spellName, 10) : shortItemLabel(matched.name, 10), qtyText: slotDef.type === 'spell' ? '' : `x${Number(matched.number || matched.count) || 1}`, sequence: seq, tooltip: `${matched.name} [${seq.join(' → ')}]` };
                }
                if (slotDef.fallbackKey) {
                    const seq = [verbKey, slotDef.fallbackKey];
                    if (slotDef.type === 'spell' && slotDef.spellKey) seq.push(slotDef.spellKey);
                    if (slotDef.targetNearest) seq.push('t');
                    return { available: inv.length > 0 || eq.length > 0, icon: slotDef.icon || '⚡', label: shortItemLabel(slotDef.name || 'Bound', 10), qtyText: '', sequence: seq, tooltip: `${slotDef.name || 'Bound Item'} [${seq.join(' → ')}]` };
                }
                return { available: false, icon: slotDef.icon || '⚡', label: shortItemLabel(slotDef.name || 'Depleted', 10), qtyText: '0', sequence: [], tooltip: `${slotDef.name || 'Item'} not in pack` };
            }

            // 5. Command
            let seq = slotDef.sequence ? slotDef.sequence.slice() : null;
            if (!seq) {
                if (slotDef.key === 'R' || slotDef.label === 'Rest') seq = (r === 'silq') ? ['%'] : ['R', 'enter'];
                else if (slotDef.key === 'z' && slotDef.label === 'Rest' && r === 'silq') seq = ['%'];
                else if (slotDef.key === 's' && slotDef.label === 'Search') seq = (r === 'frogcomposband' || r === 'hengband') ? ['S'] : [];
                else seq = slotDef.targetNearest ? [(slotDef.key || (r === 'silq' ? '%' : 'R')), 't'] : [slotDef.key || (r === 'silq' ? '%' : 'R')];
            }
            return { available: seq.length > 0, icon: slotDef.icon || '⚡', label: isJp ? (slotDef.labelJp || slotDef.label || '行動') : (slotDef.label || 'Action'), qtyText: '', sequence: seq, tooltip: `${slotDef.label || 'Command'} [${seq.join(' → ')}]` };
        }

        executeSlot(slotIdx, frame, realm, sendKeyFn, toastFn) {
            if (frame && frame.phase && frame.phase !== 'play') return false;
            const ui = (frame && frame.ui) ? frame.ui : {}, overlay = Number(ui.overlay || 0), awaiting = Boolean(ui.awaiting_command), more = Boolean(ui.more);
            if (overlay === 0 && !awaiting && !more) { if (typeof toastFn === 'function') toastFn('Cannot use quick actions during an active prompt'); return false; }
            const idx = Math.max(0, Math.min(3, Number(slotIdx) || 0)), r = String(realm || 'angband').toLowerCase(), lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
            const slots = this.getSlots(r), resolved = this.resolveSlot(slots[idx], frame, r, lang);
            if (!resolved.available || !resolved.sequence || resolved.sequence.length === 0) {
                if (typeof toastFn === 'function') toastFn(`Quick Slot ${idx + 1}: ${resolved.tooltip || 'Unavailable'}`);
                this.openBinderPopover(idx, frame, r); return false;
            }
            const app = (typeof window !== 'undefined' && window.__app) || this.app || null;
            if (app && app.dispatcher && typeof app.dispatcher.run === 'function') return app.dispatcher.run({ sequence: resolved.sequence });
            const sendFn = typeof sendKeyFn === 'function' ? sendKeyFn : (k => { if (app?.input?.network?.sendKey) app.input.network.sendKey(k); });
            this._stepQueue = { steps: resolved.sequence.slice(), sendKey: sendFn, sentSeq: (frame && frame.seq !== undefined) ? frame.seq : 0 };
            if (more) sendFn('space');
            else if (overlay > 0) sendFn('escape');
            else { const k = this._stepQueue.steps.shift(); sendFn(k); if (this._stepQueue.steps.length === 0) this._stepQueue = null; }
            return true;
        }

        onFrame(frame) {
            if (!this._stepQueue || !this._stepQueue.steps) return;
            const q = this._stepQueue;
            if (frame && frame.seq !== undefined && q.sentSeq !== null && frame.seq <= q.sentSeq) return;
            const ui = (frame && frame.ui) ? frame.ui : {};
            if (ui.more) { q.sendKey('space'); q.sentSeq = (frame && frame.seq !== undefined) ? frame.seq : 0; return; }
            if ((ui.overlay || 0) > 0) { q.sendKey('escape'); q.sentSeq = (frame && frame.seq !== undefined) ? frame.seq : 0; return; }
            if (!ui.awaiting_command) return;
            if (q.steps.length > 0) {
                const k = q.steps.shift(); q.sendKey(k); q.sentSeq = (frame && frame.seq !== undefined) ? frame.seq : 0;
                if (q.steps.length === 0) this._stepQueue = null;
            } else this._stepQueue = null;
        }

        renderBar(frame, realm, lang = 'en') {
            if (frame) this.onFrame(frame);
            if (typeof document === 'undefined') return;
            const bar = document.getElementById('quick-slot-bar');
            if (!bar) return;
            const r = String(realm || 'angband').toLowerCase(), player = (frame && frame.player) ? frame.player : {};
            if (player && player.name) this._currentCharName = player.name;
            const slots = this.getSlots(r), resolvedList = slots.map((s) => this.resolveSlot(s, frame, r, lang));
            const sig = `${r}:${lang}:${this._currentCharName}:` + resolvedList.map((res, i) => `${i}:${res.available ? 1 : 0}:${res.icon}:${res.label}:${res.qtyText}`).join('|');
            if (sig === this._lastRenderSig) return;
            this._lastRenderSig = sig;
            for (let i = 0; i < 4; i++) {
                const btn = document.getElementById(`quick-slot-btn-${i + 1}`);
                if (!btn) continue;
                const res = resolvedList[i];
                btn.classList.toggle('is-depleted', !res.available);
                btn.title = `${res.tooltip} • Hotkey: Alt+${i + 1} (Right-click to bind)`;
                btn.innerHTML = `<span class="qs-hotkey">Alt+${i + 1}</span><span class="qs-icon" aria-hidden="true">${escapeHtml(res.icon)}</span><span class="qs-label">${escapeHtml(res.label)}</span>${res.qtyText ? `<span class="qs-qty">${escapeHtml(res.qtyText)}</span>` : ''}`;
            }
        }

        bindFromGrimoire(payload, frame, realm, toastFn) {
            if (!payload) return null;
            const r = String(realm || 'angband').toLowerCase(), player = (frame && frame.player) ? frame.player : {}, inv = Array.isArray(player.inventory) ? player.inventory : [];
            if (player && player.name) this._currentCharName = player.name;
            const key = String(payload.key || 'a'), name = String(payload.name || 'Bound Action'), normName = normalizeItemName(name);
            const invItem = inv.find((it) => it.label === key || normalizeItemName(it.name) === normName);
            const slotIdx = payload.category === 'ranged' ? 0 : (payload.category === 'potion' ? 1 : (payload.category === 'tome' || payload.verb === '__bind_spell__' ? 2 : (payload.category === 'scroll' || payload.category === 'device' ? 3 : this.activeBindSlot)));
            const isOff = payload.category === 'device' || payload.category === 'ranged';
            let slotDef;
            if (payload.verb === '__bind_spell__') {
                const isOffSpell = payload.isOffensiveSpell !== undefined ? Boolean(payload.isOffensiveSpell) : (payload.targetNearest !== undefined ? Boolean(payload.targetNearest) : true);
                slotDef = { type: 'smart_magic', verb: resolveVerbKey('cast', r) || 'm', book: payload.book || 'a', spellKey: key, spellName: name, icon: payload.icon || '✨', isOffensiveSpell: isOffSpell, targetNearest: isOffSpell };
            } else {
                let verb = payload.verb;
                if ((!verb || verb === 'u' || verb === 'a') && payload.category === 'device' && invItem) verb = getDeviceVerb(invItem, r);
                slotDef = { type: 'item', verb: verb || (r === 'silq' ? 'u' : 'q'), name, normalizedName: normName, tval: invItem ? Number(invItem.tval) || 0 : 0, sval: invItem ? Number(invItem.sval) : null, fallbackKey: key, icon: payload.icon || '⚡', category: payload.category || 'misc', targetNearest: isOff };
            }
            this.setSlot(r, slotIdx, slotDef);
            this.activeBindSlot = (slotIdx + 1) % 4;
            this.renderBar(frame, r, (typeof window !== 'undefined' && window.__langMode) || 'en');
            if (typeof toastFn === 'function') toastFn(`⚡ Bound "${shortItemLabel(name, 18)}" to Quick Slot ${slotIdx + 1} (Alt+${slotIdx + 1})`);
            return { slotIdx, slotDef };
        }

        openBinderPopover(slotIdx = 0, frame = null, realm = 'angband') {
            if (typeof document === 'undefined') return;
            const popover = document.getElementById('quick-slot-popover');
            if (!popover) return;
            this.activeBindSlot = Math.max(0, Math.min(3, Number(slotIdx) || 0));
            const r = String(realm || 'angband').toLowerCase(), lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en', isJp = r === 'hengband' && lang === 'jp';
            const player = (frame && frame.player) ? frame.player : {};
            if (player && player.name) this._currentCharName = player.name;
            const inv = Array.isArray(player.inventory) ? player.inventory : [], slots = this.getSlots(r);
            const tabsHtml = [0, 1, 2, 3].map((idx) => {
                const res = this.resolveSlot(slots[idx], frame, r, lang);
                return `<button type="button" class="qs-slot-tab ${idx === this.activeBindSlot ? 'is-active' : ''}" data-qs-select-slot="${idx}">Alt+${idx + 1}: ${escapeHtml(res.icon)} ${escapeHtml(res.label)}</button>`;
            }).join('');
            const restKey = resolveVerbKey('rest', r) || (r === 'silq' ? '%' : 'R');
            const candidates = [
                { label: isJp ? '🏹 最寄りの敵を射撃' : '🏹 Shoot Nearest Enemy (f → t)', def: { type: 'fire_nearest', icon: '🏹', labelEn: 'Shoot', labelJp: '射撃', targetNearest: true } },
                { label: isJp ? '🧪 回復薬を自動で飲む' : '🧪 Quaff Best Healing Potion', def: { type: 'auto_category', category: 'potion', preferSub: 'heal', icon: '🧪', labelEn: 'Heal', labelJp: '回復薬' } },
                { label: isJp ? '✨ 魔法書を開く / 詠唱' : '✨ Open Primary Spellbook', def: { type: 'smart_magic', icon: r === 'silq' ? '🎵' : '✨', labelEn: r === 'silq' ? 'Song' : 'Cast', labelJp: '呪文詠唱', targetNearest: false } },
                { label: isJp ? '✨ 呪文 [a] で最寄りの敵を攻撃' : '✨ Cast Spell [a] at Nearest Enemy', def: { type: 'smart_magic', icon: '✨', spellKey: 'a', spellName: isJp ? '呪文[a]攻撃' : 'Spell [a]', isOffensiveSpell: true, targetNearest: true } },
                { label: isJp ? '✨ 呪文 [a] を詠唱・補助' : '✨ Cast Spell [a] Self / Utility', def: { type: 'smart_magic', icon: '✨', spellKey: 'a', spellName: isJp ? '呪文[a]' : 'Spell [a]', isOffensiveSpell: false, targetNearest: false } },
                { label: isJp ? '📜 脱出・テレポートの巻物' : '📜 Read Escape / Phase Door Scroll', def: { type: 'auto_category', category: 'scroll', preferSub: 'escape', icon: '📜', labelEn: 'Escape', labelJp: '脱出巻' } },
                { label: isJp ? '⏳ 安全まで休憩' : '⏳ Rest Until Healed', def: { type: 'command', key: restKey, sequence: r === 'silq' ? ['%'] : ['R', 'enter'], icon: '⏳', label: 'Rest', labelJp: '休憩' } }
            ];
            const catalog = (typeof ActionCatalog !== 'undefined' && ActionCatalog) || (typeof window !== 'undefined' && window.ActionCatalog) || null;
            if (catalog && typeof catalog.get === 'function') {
                for (const cmdId of ['open', 'pickup', 'eat', 'refill', 'study', 'power']) {
                    const cmd = catalog.get(cmdId);
                    if (cmd && cmd.keys && cmd.keys[r]) {
                        const lbl = isJp ? (cmd.labels?.jp || cmd.labels?.en) : cmd.labels?.en;
                        candidates.push({ label: `${cmd.icon || '⚡'} ${lbl} [${cmd.keys[r]}]`, def: { type: 'command', key: cmd.keys[r], icon: cmd.icon || '⚡', label: cmd.labels?.en || cmdId, labelJp: cmd.labels?.jp } });
                    }
                }
            }
            for (const it of inv) {
                const info = classifyInventoryEntry(it, r);
                const verbMap = { potion: r === 'silq' ? 'u' : 'q', scroll: r === 'silq' ? 'u' : 'r', device: getDeviceVerb(it, r), tome: 'm', ranged: 'f', food: r === 'silq' ? 'u' : 'E', other: 'w' };
                const verb = (info.category === 'device') ? getDeviceVerb(it, r) : (verbMap[info.category] || 'w');
                candidates.push({ label: `${info.icon} [${it.label || 'a'}] ${it.name}`, def: { type: info.category === 'tome' ? 'smart_magic' : 'item', verb, name: it.name, normalizedName: normalizeItemName(it.name), tval: Number(it.tval) || 0, sval: Number(it.sval), fallbackKey: it.label || 'a', icon: info.icon, category: info.category, targetNearest: info.category === 'device' || info.category === 'ranged' } });
            }
            popover._candidates = candidates;
            popover.innerHTML = `
                <div class="qs-popover-header"><span>⚡ ${isJp ? 'クイックスロット設定 (Alt+1〜4)' : 'Bind Quick-Action Slots (Alt+1–4)'}</span><div style="display:flex;gap:6px;"><button type="button" class="grimoire-tab-btn" data-qs-action="reset">${isJp ? '初期化' : 'Reset'}</button><button type="button" class="grimoire-tab-btn" data-qs-action="close">✕</button></div></div>
                <div class="qs-popover-slots">${tabsHtml}</div>
                <div class="qs-candidate-list">${candidates.map((c, cIdx) => `<button type="button" class="qs-candidate-item" data-qs-bind-idx="${cIdx}"><span>${escapeHtml(c.label)}</span><span style="color:#ffd268;font-weight:700;">${isJp ? '割当' : 'Bind'}</span></button>`).join('')}</div>
            `;
            popover.classList.add('is-open');
            if (!popover._boundEvents) {
                popover._boundEvents = true;
                if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                    document.addEventListener('click', (docEv) => {
                        if (popover.classList.contains('is-open') && (!docEv.target?.closest || !docEv.target.closest('#quick-slot-popover, #quick-slot-bar'))) popover.classList.remove('is-open');
                    });
                }
                popover.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (ev.target.closest('[data-qs-action="close"]')) { popover.classList.remove('is-open'); return; }
                    const curRealm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband', curFrame = (window.__app && window.__app.lastFrame) || null;
                    if (ev.target.closest('[data-qs-action="reset"]')) {
                        this.resetRealmSlots(curRealm); this.renderBar(curFrame, curRealm, window.__langMode || 'en'); this.openBinderPopover(this.activeBindSlot, curFrame, curRealm); return;
                    }
                    const slotTab = ev.target.closest('[data-qs-select-slot]');
                    if (slotTab) { this.openBinderPopover(Number(slotTab.getAttribute('data-qs-select-slot')), curFrame, curRealm); return; }
                    const candBtn = ev.target.closest('[data-qs-bind-idx]');
                    if (candBtn && popover._candidates) {
                        const chosen = popover._candidates[Number(candBtn.getAttribute('data-qs-bind-idx'))];
                        if (chosen) { this.setSlot(curRealm, this.activeBindSlot, chosen.def); this.renderBar(curFrame, curRealm, window.__langMode || 'en'); popover.classList.remove('is-open'); }
                    }
                });
            }
        }
    }

    const singleton = new QuickActionController();
    QuickActionController.vanillaLetter = vanillaLetter;
    QuickActionController.prototype.vanillaLetter = vanillaLetter;

    return {
        QuickActionController, QuickActions: QuickActionController, vanillaLetter, normalizeItemName, shortItemLabel, classifyInventoryEntry, getDefaultSlots, getDeviceVerb,
        getInstance: () => singleton, getSlots: (r, c) => singleton.getSlots(r, c), setSlot: (r, i, d, c) => singleton.setSlot(r, i, d, c),
        resetRealmSlots: (r, c) => singleton.resetRealmSlots(r, c), resetForCharacter: (r, c) => singleton.resetForCharacter(r, c),
        resolveSlot: (d, f, r, l) => singleton.resolveSlot(d, f, r, l), executeSlot: (i, f, r, s, t) => singleton.executeSlot(i, f, r, s, t),
        onFrame: (f) => singleton.onFrame(f), renderBar: (f, r, l) => singleton.renderBar(f, r, l), bindFromGrimoire: (p, f, r, t) => singleton.bindFromGrimoire(p, f, r, t),
        openBinderPopover: (i, f, r) => singleton.openBinderPopover(i, f, r)
    };
});

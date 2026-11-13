/**
 * yasd-autopsy.js — YASD 3D v12.0 "Autopsy of a Stupid Death" Forensics,
 * Bag of Regret Lifesaver Audit, Morgue Export, Seed Dare & IndexedDB Crypt.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.YasdAutopsy = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_TURN_RING = 8;
    const CRYPT_STORAGE_KEY = 'a3d.crypt.v1';
    const CRYPT_DB_NAME = 'yasd3d_crypt_v1';
    const CRYPT_STORE = 'fallen';
    const MAX_CRYPT_ENTRIES = 40;

    let _turnRing = [];
    let _activeHeroKey = '';
    let _lastRecordedDeathSig = '';

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function extractMessages(frame) {
        if (!frame) return [];
        const raw = Array.isArray(frame.messages) ? frame.messages : [];
        const out = [];
        for (let i = 0; i < raw.length; i++) {
            const m = raw[i];
            const txt = typeof m === 'string' ? m.trim() : (m && typeof m.text === 'string' ? m.text.trim() : '');
            if (txt && out[out.length - 1] !== txt) out.push(txt);
        }
        return out.slice(-4);
    }

    function recordFrame(frame, realm) {
        if (!frame || !frame.player) return;
        const p = frame.player;
        const r = String(realm || frame.realm || 'angband').toLowerCase();
        const heroKey = `${r}:${p.name || 'Hero'}:${p.race || ''}:${p.class || ''}`;
        const turn = typeof p.turn === 'number' ? p.turn : (typeof frame.turn === 'number' ? frame.turn : _turnRing.length + 1);
        const hp = typeof p.hp === 'number' ? p.hp : 0;
        const hpMax = typeof p.hp_max === 'number' ? p.hp_max : (typeof p.mhp === 'number' ? p.mhp : Math.max(1, hp));

        if (_activeHeroKey && _activeHeroKey !== heroKey && !p.dead) {
            _turnRing = [];
        }
        if (_turnRing.length > 0 && !p.dead && turn < _turnRing[_turnRing.length - 1].turn - 2) {
            _turnRing = [];
        }
        _activeHeroKey = heroKey;

        const msgs = extractMessages(frame);
        const entry = {
            turn,
            hp,
            hpMax,
            depth: typeof p.depth === 'number' ? p.depth : 0,
            dead: Boolean(p.dead),
            messages: msgs,
            resists: p.resists && typeof p.resists === 'object' ? Object.assign({}, p.resists) : null,
            flags: p.flags && typeof p.flags === 'object' ? Object.assign({}, p.flags) : null
        };

        const prev = _turnRing[_turnRing.length - 1];
        if (prev && prev.turn === turn && prev.hp === hp && prev.dead === entry.dead) {
            if (msgs.length > 0) prev.messages = msgs;
            if (entry.resists) prev.resists = entry.resists;
            if (entry.flags) prev.flags = entry.flags;
            return;
        }
        _turnRing.push(entry);
        if (_turnRing.length > MAX_TURN_RING) {
            _turnRing.splice(0, _turnRing.length - MAX_TURN_RING);
        }
    }

    const LIFESAVER_PATTERNS = [
        { tag: 'Escape', rx: /\b(phase door|teleport|teleportation|word of recall|blinking|fog|sanctuary|passage)\b|(ショート・テレポート|テレポート|帰還の詔)/i },
        { tag: 'Healing', rx: /\b(cure critical|cure serious|healing|\*healing\*|extra healing|full healing|life|vitality|restore life|ambrosia)\b|(致命傷の治癒|重傷の治癒|体力回復|★体力回復★|生命の薬)/i },
        { tag: 'Speed/Buff', rx: /\b(speed|haste|heroism|berserk|resistance|invulnerability|shielding)\b|(スピード|加速|耐性|無敵)/i },
        { tag: 'Crowd Control', rx: /\b(banishment|mass banishment|destruction|\*destruction\*|teleport away|teleport other|fear|paralysis)\b|(抹殺|周辺抹殺|破壊|テレポート・アウェイ)/i }
    ];

    function auditBagOfRegret(summary, player) {
        const rawInv = (summary && Array.isArray(summary.inv) && summary.inv.length > 0)
            ? summary.inv
            : (player && Array.isArray(player.inventory) ? player.inventory : []);
        const found = [];
        for (let i = 0; i < rawInv.length; i++) {
            const it = rawInv[i];
            const name = String((it && (it.name || it.desc || it.label)) || it || '').trim();
            if (!name) continue;
            for (let j = 0; j < LIFESAVER_PATTERNS.length; j++) {
                if (LIFESAVER_PATTERNS[j].rx.test(name)) {
                    found.push({ tag: LIFESAVER_PATTERNS[j].tag, name });
                    break;
                }
            }
        }
        return found;
    }

    function diagnoseMissingDefense(causeText, recentText, resists, flags) {
        const corpus = `${causeText || ''} ${recentText || ''}`.toLowerCase();
        const r = resists || {};
        const f = flags || {};
        const gaps = [];

        if (/\b(poison|venom|toxic|drolem|viper|mamba|stinger)\b/.test(corpus) && !(r.pois > 0)) {
            gaps.push('Unresisted Poison (rPois OFF)');
        }
        if (/\b(paralyz|paralys|freez.*solid|floating eye|ghoul|hold|held)\b/.test(corpus) && !f.free_act) {
            gaps.push('Paralyzed without Free Action (FA OFF)');
        }
        if (/\b(confus|baffl|chaos|umber hulk)\b/.test(corpus) && !(r.conf > 0)) {
            gaps.push('Unresisted Confusion (rConf OFF)');
        }
        if (/\b(blind|darkness|flash)\b/.test(corpus) && !(r.light > 0 && r.dark > 0)) {
            gaps.push('Blindness / Light-Dark Exposure (rBlind/rDark gap)');
        }
        if (/\b(fire|flame|dragon.*fire|balrog|magma|hellhound|plasma)\b/.test(corpus) && !(r.fire > 0)) {
            gaps.push('Unresisted Fire Breath/Spell (rFire OFF)');
        }
        if (/\b(cold|frost|ice|white dragon|yeti)\b/.test(corpus) && !(r.cold > 0)) {
            gaps.push('Unresisted Frost/Cold (rCold OFF)');
        }
        if (/\b(acid|black dragon|corrod|dissolv)\b/.test(corpus) && !(r.acid > 0)) {
            gaps.push('Unresisted Acid (rAcid OFF)');
        }
        if (/\b(lightning|elec|blue dragon|thunder|volt)\b/.test(corpus) && !(r.elec > 0)) {
            gaps.push('Unresisted Lightning (rElec OFF)');
        }
        if (/\b(nether|drain.*life|wraith|lich|nazgul)\b/.test(corpus) && !(r.nether > 0) && !f.hold_life) {
            gaps.push('Life Drain / Nether Exposure (rNeth & Hold Life OFF)');
        }
        if (/\b(invisible|unseen|phantom|stalker)\b/.test(corpus) && !f.see_inv) {
            gaps.push('Ambushed by Unseen Foe (See Invisible OFF)');
        }

        if (gaps.length > 0) return gaps.join(' • ');

        const preDeath = _turnRing.length >= 2 ? _turnRing[_turnRing.length - 2] : null;
        if (preDeath && preDeath.hpMax > 0 && (preDeath.hp / preDeath.hpMax) <= 0.35) {
            return `Fought inside Critical Redline (${preDeath.hp}/${preDeath.hpMax} HP, ${Math.round((preDeath.hp / preDeath.hpMax) * 100)}%) instead of resetting.`;
        }
        return 'Direct physical/tactical burst exceeded active Armor Class and HP buffer.';
    }

    function composeEnceladusRoast(heroName, cause, bagOfRegret, depth, winner) {
        if (winner) {
            return `Master Bard Enceladus dips his quill in gold: "${heroName} actually survived the abyss without becoming a cautionary footnote."`;
        }
        if (bagOfRegret.length >= 2) {
            const firstItem = bagOfRegret[0].name.replace(/^[a-zA-Z]\)\s*/, '');
            return `Master Bard Enceladus notes dryly that "${firstItem}" works markedly better inside one's bloodstream than preserved in a corpse's knapsack.`;
        }
        if (bagOfRegret.length === 1) {
            return `Master Bard Enceladus observes that saving "${bagOfRegret[0].name}" for a rainier day proved optimistic at Depth ${depth}.`;
        }
        if (depth === 0) {
            return `Master Bard Enceladus sighs: perishing in the Town before finding the stairs is an efficiency record of sorts.`;
        }
        return `Master Bard Enceladus records another instructive lesson in corridor geometry: "${cause || 'hubris'}."`;
    }

    function diagnoseDeath(frame, summary, realm) {
        const p = (frame && frame.player) || {};
        const r = String(realm || (frame && frame.realm) || 'angband').toLowerCase();
        recordFrame(frame, r);

        const sequence = _turnRing.slice(-5);
        const recentMessages = [];
        for (let i = 0; i < sequence.length; i++) {
            for (let j = 0; j < sequence[i].messages.length; j++) {
                const m = sequence[i].messages[j];
                if (recentMessages[recentMessages.length - 1] !== m) recentMessages.push(m);
            }
        }
        const latestSnap = sequence[sequence.length - 1] || {};
        const resists = p.resists || latestSnap.resists || null;
        const flags = p.flags || latestSnap.flags || null;
        const cause = (summary && summary.cause) || p.died_from || 'Killed in the dungeon.';
        const bagOfRegret = auditBagOfRegret(summary, p);
        const defenseGap = p.winner
            ? 'Ascended victorious — all mortal perils overcome.'
            : diagnoseMissingDefense(cause, recentMessages.join(' '), resists, flags);
        const roast = composeEnceladusRoast(p.name || 'Hero', cause, bagOfRegret, p.depth || 0, Boolean(p.winner));

        const ht = (typeof root !== 'undefined' && root.HudTelemetry) ? root.HudTelemetry : null;
        const stakes = (p.ironman || (ht && typeof ht.getPermadeathMode === 'function' && ht.getPermadeathMode() === 'ironman'))
            ? 'ironman'
            : 'adventure';

        return {
            realm: r,
            stakes,
            winner: Boolean(p.winner),
            heroName: p.name || 'Hero',
            level: p.level || 1,
            depth: typeof p.depth === 'number' ? p.depth : 0,
            turn: typeof p.turn === 'number' ? p.turn : (latestSnap.turn || 1),
            cause,
            sequence,
            recentMessages: recentMessages.slice(-5),
            defenseGap,
            bagOfRegret,
            roast
        };
    }

    // --- Crypt of Fallen Heroes (IndexedDB + localStorage fallback) ---
    function readFallbackCrypt() {
        try {
            if (typeof localStorage === 'undefined') return [];
            const raw = localStorage.getItem(CRYPT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function writeFallbackCrypt(entries) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(CRYPT_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_CRYPT_ENTRIES)));
            }
        } catch (_) {}
    }

    function saveCryptEntry(entry) {
        const current = readFallbackCrypt();
        if (!current.some(e => e.sig === entry.sig)) {
            current.unshift(entry);
            writeFallbackCrypt(current.slice(0, MAX_CRYPT_ENTRIES));
        }
        if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(current.slice(0, MAX_CRYPT_ENTRIES));
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(CRYPT_DB_NAME, 1);
                req.onupgradeneeded = (ev) => {
                    const db = ev.target.result;
                    if (!db.objectStoreNames.contains(CRYPT_STORE)) {
                        db.createObjectStore(CRYPT_STORE, { keyPath: 'sig' });
                    }
                };
                req.onsuccess = (ev) => {
                    try {
                        const db = ev.target.result;
                        const tx = db.transaction(CRYPT_STORE, 'readwrite');
                        const store = tx.objectStore(CRYPT_STORE);
                        store.put(entry);
                        const getAllReq = store.getAll();
                        getAllReq.onsuccess = () => {
                            const list = Array.isArray(getAllReq.result) ? getAllReq.result : current;
                            list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
                            db.close();
                            resolve(list.slice(0, MAX_CRYPT_ENTRIES));
                        };
                        getAllReq.onerror = () => { db.close(); resolve(current); };
                    } catch (_) {
                        resolve(current);
                    }
                };
                req.onerror = () => resolve(current);
            } catch (_) {
                resolve(current);
            }
        });
    }

    function loadCryptEntries() {
        const fallback = readFallbackCrypt();
        if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(fallback);
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(CRYPT_DB_NAME, 1);
                req.onupgradeneeded = (ev) => {
                    const db = ev.target.result;
                    if (!db.objectStoreNames.contains(CRYPT_STORE)) {
                        db.createObjectStore(CRYPT_STORE, { keyPath: 'sig' });
                    }
                };
                req.onsuccess = (ev) => {
                    try {
                        const db = ev.target.result;
                        const tx = db.transaction(CRYPT_STORE, 'readonly');
                        const getAllReq = tx.objectStore(CRYPT_STORE).getAll();
                        getAllReq.onsuccess = () => {
                            const list = Array.isArray(getAllReq.result) && getAllReq.result.length > 0 ? getAllReq.result : fallback;
                            list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
                            db.close();
                            resolve(list.slice(0, MAX_CRYPT_ENTRIES));
                        };
                        getAllReq.onerror = () => { db.close(); resolve(fallback); };
                    } catch (_) {
                        resolve(fallback);
                    }
                };
                req.onerror = () => resolve(fallback);
            } catch (_) {
                resolve(fallback);
            }
        });
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = String(text);
        return node;
    }

    function mountCryptDom(cryptEl, entries) {
        if (!cryptEl) return;
        cryptEl.replaceChildren();
        if (!Array.isArray(entries) || entries.length === 0) {
            cryptEl.appendChild(el('div', 'yasd-crypt-empty', '⚰ Crypt of Fallen Heroes is currently empty.'));
            return;
        }
        const wrap = el('div', 'yasd-crypt-inner');
        wrap.appendChild(el('h3', 'yasd-crypt-title', '⚰ Crypt of Fallen Heroes'));
        const appendGroup = (title, badgeCls, items) => {
            if (!items.length) return;
            const grp = el('div', 'yasd-crypt-group');
            grp.appendChild(el('h4', 'yasd-crypt-heading', `${title} (${items.length})`));
            const ul = el('ul', 'yasd-crypt-list');
            items.slice(0, 12).forEach((e) => {
                const li = el('li', 'yasd-crypt-row');
                li.appendChild(el('span', `yasd-crypt-badge ${badgeCls}`, e.stakes === 'ironman' ? '☠ Ironman' : '🕯 Adventure'));
                li.appendChild(el('strong', 'yasd-crypt-hero', e.epitaph || e.heroName || 'Hero'));
                li.appendChild(el('span', 'yasd-crypt-realm', `${String(e.realm || 'angband').toUpperCase()} • D:${Number(e.depth || 0)}`));
                li.appendChild(el('span', 'yasd-crypt-cause', e.cause || ''));
                ul.appendChild(li);
            });
            grp.appendChild(ul);
            wrap.appendChild(grp);
        };
        appendGroup('☠ Ironman Hall of the Unyielding', 'is-ironman', entries.filter(e => e.stakes === 'ironman'));
        appendGroup('🕯 Adventure Checkpoint Chronicles', 'is-adventure', entries.filter(e => e.stakes !== 'ironman'));
        cryptEl.appendChild(wrap);
    }

    function buildAsciiMorgueText(frame, summary, diag) {
        const p = (frame && frame.player) || {};
        const lines = [];
        const hr = '='.repeat(78);
        lines.push(hr);
        lines.push(`  YASD 3D v12.0 — OFFICIAL CHARACTER MORGUE DUMP (https://yasd3d.com)`);
        lines.push(hr);
        lines.push(`  Hero      : ${(summary && summary.epitaph) || diag.heroName}`);
        lines.push(`  Realm     : ${String(diag.realm).toUpperCase()} (${diag.stakes === 'ironman' ? 'Ironman Permadeath' : 'Adventure Checkpoints'})`);
        lines.push(`  Outcome   : ${diag.cause}`);
        lines.push(`  Score/Gold: ${(summary && summary.score) || `Gold: ${p.gold || 0} AU • Turn: ${diag.turn}`}`);
        lines.push('');
        lines.push('[1. YASD FORENSIC AUTOPSY]');
        lines.push(`  Missing Defense : ${diag.defenseGap}`);
        if (diag.sequence.length > 0) {
            const hpTrail = diag.sequence.map(s => `T${s.turn}: ${s.hp}/${s.hpMax} HP`).join(' -> ');
            lines.push(`  HP Trajectory   : ${hpTrail}`);
        }
        if (diag.recentMessages.length > 0) {
            lines.push('  Final Combat Log:');
            diag.recentMessages.forEach(m => lines.push(`    - ${m}`));
        }
        lines.push('');
        lines.push('[2. BAG OF REGRET (UNUSED LIFESAVERS AT DEATH)]');
        if (diag.bagOfRegret.length === 0) {
            lines.push('  (None — expended every last potion and scroll before falling.)');
        } else {
            diag.bagOfRegret.forEach(it => lines.push(`  ! [${it.tag}] ${it.name}`));
        }
        lines.push(`  Chronicler Note : ${diag.roast}`);
        lines.push('');
        lines.push('[3. WORN EQUIPMENT]');
        const eq = (summary && Array.isArray(summary.eq)) ? summary.eq : [];
        if (!eq.length) lines.push('  (No equipment worn)');
        else eq.forEach((it, i) => lines.push(`  ${it.slot || String.fromCharCode(97 + i)}) ${it.name || it.label || ''}`));
        lines.push('');
        lines.push('[4. PACK INVENTORY]');
        const inv = (summary && Array.isArray(summary.inv)) ? summary.inv : [];
        if (!inv.length) lines.push('  (Inventory empty)');
        else inv.forEach((it, i) => lines.push(`  ${it.slot || String.fromCharCode(97 + i)}) ${it.name || it.label || ''}`));
        if (frame && frame.term && Array.isArray(frame.term.rows)) {
            lines.push('');
            lines.push('[5. FINAL 80x24 TERMINAL SNAPSHOT]');
            frame.term.rows.slice(0, 24).forEach((row) => {
                const txt = typeof row === 'string' ? row : (row && typeof row.g === 'string' ? row.g : '');
                lines.push('  ' + txt.replace(/\s+$/, ''));
            });
        }
        lines.push(hr);
        return lines.join('\n') + '\n';
    }

    function exportAsciiMorgue(frame, summary, diag) {
        if (typeof document === 'undefined') return '';
        const text = buildAsciiMorgueText(frame, summary, diag || diagnoseDeath(frame, summary));
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const clean = String((diag && diag.heroName) || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        a.href = url;
        a.download = `${clean}-${(diag && diag.realm) || 'angband'}-morgue.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (root.chronicleManager && typeof root.chronicleManager.showHudToast === 'function') {
            root.chronicleManager.showHudToast('📄 Exported 80-Column ASCII Morgue Dump (.txt)!');
        }
        return text;
    }

    function computeDareSeedCode(frame, diag) {
        const p = (frame && frame.player) || {};
        if (frame && frame.seed) return String(frame.seed);
        if (p.seed) return String(p.seed);
        const raw = `${diag.realm}:${diag.heroName}:${diag.depth}:${diag.turn}:${diag.cause}`;
        let h = 2166136261 >>> 0;
        for (let i = 0; i < raw.length; i++) {
            h ^= raw.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h.toString(36).toUpperCase();
    }

    async function shareDareSeed(frame, summary, diag) {
        const d = diag || diagnoseDeath(frame, summary);
        const seed = computeDareSeedCode(frame, d);
        const bpParam = (d.realm === 'ryod' && root.__activeRyodBlueprint && root.__activeRyodBlueprint.code)
            ? `&bp=${encodeURIComponent(root.__activeRyodBlueprint.code)}`
            : '';
        const url = `https://angband3d.com/?realm=${encodeURIComponent(d.realm)}&seed=${encodeURIComponent(seed)}${bpParam}`;
        const shareText = `☠ Avenge ${d.heroName} (Lv.${d.level}, Depth ${d.depth}) in ${d.realm.toUpperCase()} — ${d.cause} Dare Seed: ${url}`;
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                await navigator.share({ title: 'YASD 3D — Avenge My Hero', text: shareText, url });
                return url;
            }
        } catch (_) {}
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(shareText);
                if (root.chronicleManager && typeof root.chronicleManager.showHudToast === 'function') {
                    root.chronicleManager.showHudToast(`⚔ Copied Dare Seed Challenge Link (${seed}) to Clipboard!`);
                }
            }
        } catch (_) {}
        return url;
    }

    async function shareOrDownloadYasdCard(frame) {
        if (root.chronicleManager && typeof root.chronicleManager.downloadYasdShareCard === 'function') {
            return root.chronicleManager.downloadYasdShareCard(frame);
        }
    }

    function renderDeathAutopsy(frame, summary, realm) {
        const diag = diagnoseDeath(frame, summary, realm);
        if (typeof document === 'undefined') return diag;

        const panel = document.getElementById('yasd-autopsy-panel');
        if (panel) {
            panel.replaceChildren();
            const hdr = el('div', 'autopsy-header-row');
            hdr.appendChild(el('span', 'autopsy-kicker', '🔬 YASD FORENSIC AUTOPSY'));
            hdr.appendChild(el(
                'span',
                `autopsy-stakes-chip ${diag.stakes === 'ironman' ? 'is-ironman' : 'is-adventure'}`,
                diag.stakes === 'ironman' ? '☠ IRONMAN PERMADEATH' : '🕯 ADVENTURE CHECKPOINT'
            ));
            panel.appendChild(hdr);

            if (diag.sequence.length > 0) {
                const trail = el('div', 'autopsy-hp-trail');
                diag.sequence.forEach((s, idx) => {
                    if (idx > 0) trail.appendChild(el('span', 'autopsy-hp-arrow', '→'));
                    const isFatal = idx === diag.sequence.length - 1 && !diag.winner;
                    trail.appendChild(el('span', `autopsy-hp-step ${isFatal ? 'is-fatal' : ''}`, `T${s.turn}: ${s.hp}/${s.hpMax}`));
                });
                panel.appendChild(trail);
            }

            const defBox = el('div', 'autopsy-defense-box');
            defBox.appendChild(el('strong', '', 'Diagnosis: '));
            defBox.appendChild(document.createTextNode(diag.defenseGap));
            panel.appendChild(defBox);

            const regBox = el('div', 'autopsy-regret-box');
            regBox.appendChild(el('strong', '', `🎒 Bag of Regret (${diag.bagOfRegret.length}):`));
            if (diag.bagOfRegret.length > 0) {
                const list = el('div', 'autopsy-regret-list');
                diag.bagOfRegret.slice(0, 4).forEach((it) => {
                    const chip = el('span', 'autopsy-regret-chip', `🧪 ${it.tag}: ${it.name.slice(0, 34)}`);
                    chip.title = it.name;
                    list.appendChild(chip);
                });
                regBox.appendChild(list);
            } else {
                regBox.appendChild(el('div', 'autopsy-regret-clean', '✓ Zero unused lifesavers left in pack.'));
            }
            panel.appendChild(regBox);
            panel.appendChild(el('blockquote', 'autopsy-bard-roast', diag.roast));
        }

        const sig = `${diag.realm}:${diag.heroName}:${diag.level}:${diag.depth}:${diag.turn}:${diag.cause}`;
        const onCryptLoaded = (entries) => mountCryptDom(document.getElementById('yasd-crypt-container'), entries);
        if (sig !== _lastRecordedDeathSig) {
            _lastRecordedDeathSig = sig;
            saveCryptEntry({
                sig,
                ts: Date.now(),
                realm: diag.realm,
                stakes: diag.stakes,
                heroName: diag.heroName,
                epitaph: (summary && summary.epitaph) || `${diag.heroName} (Lv.${diag.level})`,
                depth: diag.depth,
                turn: diag.turn,
                cause: diag.cause,
                regrets: diag.bagOfRegret.length
            }).then(onCryptLoaded);
        } else {
            loadCryptEntries().then(onCryptLoaded);
        }

        const morgueBtn = document.getElementById('btn-death-morgue-txt');
        if (morgueBtn) {
            morgueBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                exportAsciiMorgue(frame, summary, diag);
            };
        }
        const dareBtn = document.getElementById('btn-death-dare-seed');
        if (dareBtn) {
            dareBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                shareDareSeed(frame, summary, diag);
            };
        }

        // Disable checkpoint reload button if Ironman run perished
        const reloadBtn = document.getElementById('btn-death-reload');
        if (reloadBtn) {
            const locked = diag.stakes === 'ironman' && !diag.winner;
            reloadBtn.disabled = locked;
            reloadBtn.style.opacity = locked ? '0.45' : '';
            reloadBtn.title = locked ? 'Ironman Permadeath: Checkpoint reload disabled for fallen hero' : 'Load Last Saved Checkpoint';
        }

        return diag;
    }

    return {
        recordFrame,
        auditBagOfRegret,
        diagnoseMissingDefense,
        diagnoseDeath,
        buildAsciiMorgueText,
        exportAsciiMorgue,
        computeDareSeedCode,
        shareDareSeed,
        shareOrDownloadYasdCard,
        loadCryptEntries,
        renderDeathAutopsy,
        _resetForTests: function () { _turnRing = []; _activeHeroKey = ''; _lastRecordedDeathSig = ''; }
    };
});

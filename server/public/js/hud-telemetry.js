/**
 * hud-telemetry.js — YASD 3D v12.0 Roguelike Telemetry, Resistance Matrix,
 * Immersive HUD Presets, Native <dialog> Top-Layer Sync & 3-Step FTUE Coachmark.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.HudTelemetry = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const _loreByRealm = Object.create(null);
    let _lastResistSig = '';
    let _lastFeelingSig = '';
    let _inferredFeelingRealm = '';
    let _inferredFeelingDepth = -1;
    let _inferredMonFeel = 0;
    let _inferredObjFeel = 0;
    let _lastFeelingMsgSig = '';
    let _hudPreset = 'veteran';
    let _permadeathMode = 'adventure';
    let _ftueStep = 0;

    const RESIST_RUNES = [
        { key: 'acid', label: 'Ac', name: 'Acid' },
        { key: 'elec', label: 'El', name: 'Lightning' },
        { key: 'fire', label: 'Fi', name: 'Fire' },
        { key: 'cold', label: 'Co', name: 'Cold' },
        { key: 'pois', label: 'Po', name: 'Poison' },
        { key: 'light', label: 'Li', name: 'Light' },
        { key: 'dark', label: 'Da', name: 'Dark' },
        { key: 'sound', label: 'So', name: 'Sound' },
        { key: 'shards', label: 'Sh', name: 'Shards' },
        { key: 'nexus', label: 'Nx', name: 'Nexus' },
        { key: 'nether', label: 'Nt', name: 'Nether' },
        { key: 'chaos', label: 'Ch', name: 'Chaos' },
        { key: 'disen', label: 'Di', name: 'Disenchantment' }
    ];

    const INTRINSIC_RUNES = [
        { key: 'freeAct', label: 'FA', name: 'Free Action' },
        { key: 'seeInvis', label: 'SI', name: 'See Invisible' },
        { key: 'esp', alt: 'telepathy', label: 'ESP', name: 'Telepathy / ESP' },
        { key: 'rConf', label: 'rCf', name: 'Resist Confusion' },
        { key: 'rBlind', label: 'rBl', name: 'Resist Blindness' }
    ];

    const FEELING_LABELS = [
        'Calm', 'Safe', 'Quiet', 'Mild', 'Uneasy',
        'Ominous', 'Dangerous', 'Deadly', 'Mortal Peril', 'Lethal Vault'
    ];

    function getRealmLoreStore(realm) {
        const r = String(realm || 'angband').toLowerCase();
        if (!_loreByRealm[r]) _loreByRealm[r] = { byIdx: Object.create(null), byName: Object.create(null) };
        return _loreByRealm[r];
    }

    function ingestFrameFeeling(frame, realm) {
        if (!frame) return;
        const r = String(realm || frame.realm || 'angband').toLowerCase();
        const depth = Number(frame.player && frame.player.depth) || 0;
        if (r !== _inferredFeelingRealm || depth !== _inferredFeelingDepth) {
            _inferredFeelingRealm = r;
            _inferredFeelingDepth = depth;
            _inferredMonFeel = 0;
            _inferredObjFeel = 0;
            _lastFeelingMsgSig = '';
        }
        if (depth <= 0) return;
        const msgs = Array.isArray(frame.messages) ? frame.messages : [];
        const row0 = (frame.term && Array.isArray(frame.term.rows) && frame.term.rows[0] && frame.term.rows[0].g) ? String(frame.term.rows[0].g) : '';
        const tailSig = `${msgs.length}:${msgs.length > 0 ? (msgs[msgs.length - 1].text || '') : ''}:${row0}`;
        if (tailSig === _lastFeelingMsgSig) return;
        _lastFeelingMsgSig = tailSig;

        const scanLine = (raw) => {
            const s = String(raw || '').trim();
            if (!s) return;
            if (/terrible feeling|mortal danger|death awaits|about to die|shadow of death/i.test(s)) _inferredMonFeel = 9;
            else if (/\bdeadly\b|bloodcurdling|extreme danger|horrible feeling/i.test(s)) _inferredMonFeel = Math.max(_inferredMonFeel, 8);
            else if (/chills down your spine|very dangerous|murderous/i.test(s)) _inferredMonFeel = Math.max(_inferredMonFeel, 7);
            else if (/bad feeling|very nervous|foreboding|ominous/i.test(s)) _inferredMonFeel = Math.max(_inferredMonFeel, 6);
            else if (/nervous|anxious|uneasy|unsafe|hairs stand/i.test(s)) _inferredMonFeel = Math.max(_inferredMonFeel, 5);
            else if (/omen of luck|luck is turning|mildly dangerous|faint sense of danger/i.test(s)) _inferredMonFeel = Math.max(_inferredMonFeel, 4);
            else if (/fairly safe|quiet place|little danger/i.test(s)) _inferredMonFeel = _inferredMonFeel || 3;
            else if (/tame,\s*sheltered place|sheltered place|safe place/i.test(s)) _inferredMonFeel = _inferredMonFeel || 2;
            else if (/boring place|nothing seems out of place|very boring/i.test(s)) _inferredMonFeel = _inferredMonFeel || 1;

            if (/superb feeling|something truly special|incomparable treasure/i.test(s)) _inferredObjFeel = 9;
            else if (/something special|wonderful feeling|richly appointed|vault/i.test(s)) _inferredObjFeel = Math.max(_inferredObjFeel, 7);
            else if (/good feeling|very good feeling|something good/i.test(s)) _inferredObjFeel = Math.max(_inferredObjFeel, 5);
        };
        const startIdx = Math.max(0, msgs.length - 12);
        for (let i = startIdx; i < msgs.length; i++) {
            if (msgs[i] && msgs[i].text) scanLine(msgs[i].text);
        }
        if (row0) scanLine(row0);
    }

    function ingestFrameLore(frame, realm) {
        if (!frame) return;
        ingestFrameFeeling(frame, realm);
        if (!frame.lore) return;
        const store = getRealmLoreStore(realm || frame.realm);
        if (Array.isArray(frame.lore)) {
            for (let i = 0; i < frame.lore.length; i++) {
                const entry = frame.lore[i];
                if (!entry || typeof entry !== 'object') continue;
                if (entry.r_idx !== undefined && entry.r_idx !== null) store.byIdx[String(entry.r_idx)] = entry;
                if (entry.name) store.byName[String(entry.name).toLowerCase()] = entry;
            }
        } else if (typeof frame.lore === 'object') {
            for (const [k, entry] of Object.entries(frame.lore)) {
                if (!entry || typeof entry !== 'object') continue;
                store.byIdx[String(k)] = entry;
                if (entry.r_idx !== undefined) store.byIdx[String(entry.r_idx)] = entry;
                if (entry.name) store.byName[String(entry.name).toLowerCase()] = entry;
            }
        }
    }

    function lookupMonsterLore(entity, realm) {
        if (!entity) return null;
        const store = getRealmLoreStore(realm);
        if (entity.r_idx !== undefined && entity.r_idx !== null && store.byIdx[String(entity.r_idx)]) {
            return store.byIdx[String(entity.r_idx)];
        }
        const nameKey = String(entity.name || '').trim().toLowerCase();
        if (nameKey && store.byName[nameKey]) return store.byName[nameKey];
        return null;
    }

    function normalizeSpeedDelta(rawSpeed, realm) {
        if (typeof rawSpeed !== 'number' || !Number.isFinite(rawSpeed)) return 0;
        if (realm === 'silq') return rawSpeed <= 4 ? (rawSpeed === 2 ? 0 : (rawSpeed > 2 ? (rawSpeed - 2) * 10 : (rawSpeed - 2) * 10)) : (rawSpeed >= 60 ? rawSpeed - 110 : rawSpeed);
        if (rawSpeed >= 60) return rawSpeed - 110;
        return rawSpeed;
    }

    function formatMonsterTacticalSummary(entity, realm) {
        const r = String(realm || 'angband').toLowerCase();
        const lore = lookupMonsterLore(entity, r);
        const spdDelta = normalizeSpeedDelta(entity.speed !== undefined ? entity.speed : (lore && lore.speed), r);
        const speedChip = spdDelta > 0 ? `⚡ +${spdDelta}` : (spdDelta < 0 ? `🐢 ${spdDelta}` : '');
        const acVal = (lore && lore.ac !== undefined) ? lore.ac : ((lore && lore.evn !== undefined) ? `EV ${lore.evn}${lore.pd ? ` [${lore.pd}d${lore.ps || 4}]` : ''}` : entity.ac);
        const blows = (lore && Array.isArray(lore.blows) && lore.blows.length > 0) ? lore.blows.slice(0, 2).join(', ') : '';
        let spellChip = '';
        if (lore && Array.isArray(lore.spells) && lore.spells.length > 0) {
            const breath = lore.spells.find(s => /^BR_|breath/i.test(String(s))) || lore.spells[0];
            const clean = String(breath).replace(/^BR_/, '🔥 ').replace(/^BA_/, '💥 ').replace(/^BO_/, '⚡ ');
            spellChip = clean;
        }
        const resists = (lore && Array.isArray(lore.known_resists) && lore.known_resists.length > 0)
            ? lore.known_resists.slice(0, 4).join('/')
            : '';
        const alertLabel = entity.alertness_label ? String(entity.alertness_label) : '';
        return { lore, spdDelta, speedChip, acVal, blows, spellChip, resists, alertLabel };
    }

    function renderResistStrip(container, player, realm) {
        if (!container) return;
        const r = String(realm || 'angband').toLowerCase();
        const res = (player && player.resists && typeof player.resists === 'object') ? player.resists : null;
        if (r === 'rogue' || r === 'brogue' || r === 'nethack' || !player || !res || Object.keys(res).length === 0) {
            container.style.display = 'none';
            _lastResistSig = `hidden:${r}`;
            return;
        }
        container.style.display = '';
        const flg = player.flags || {};
        const depth = Number(player.depth) || 0;
        const runes = r === 'silq' ? RESIST_RUNES.filter(x => x.key === 'fire' || x.key === 'cold' || x.key === 'pois') : RESIST_RUNES;
        const sigParts = runes.map(x => `${x.key}:${res[x.key] || 0}`).join(',') + '|' +
            INTRINSIC_RUNES.map(x => `${x.key}:${(flg[x.key] || (x.alt && flg[x.alt])) ? 1 : 0}`).join(',') +
            `|r=${r}|d20=${depth >= 20 ? 1 : 0}`;
        if (sigParts === _lastResistSig) return;
        _lastResistSig = sigParts;

        container.textContent = '';
        const frag = document.createDocumentFragment();
        for (let i = 0; i < runes.length; i++) {
            const rn = runes[i];
            const tier = Number(res[rn.key] || 0);
            const warnMissing = depth >= 20 && rn.key === 'pois' && tier <= 0 && r !== 'rogue';
            const span = document.createElement('span');
            span.className = 'res-rune ' + (tier >= 3 ? 'tier-imm' : (tier === 2 ? 'tier-dbl' : (tier === 1 ? 'tier-covered tier-on' : (tier < 0 ? 'tier-vuln' : 'tier-off')))) + (warnMissing ? ' resist-warn-pulse' : '');
            span.textContent = tier >= 3 ? `${rn.label}★` : rn.label;
            span.title = `${rn.name}: ${tier >= 3 ? 'Immune' : (tier === 2 ? 'Double / Temp Resist' : (tier === 1 ? 'Covered' : (tier < 0 ? 'Vulnerable!' : (warnMissing ? 'MISSING past DL20!' : 'Uncovered'))))}`;
            frag.appendChild(span);
        }
        const sep = document.createElement('span');
        sep.className = 'res-rune-sep';
        sep.textContent = '|';
        frag.appendChild(sep);

        for (let i = 0; i < INTRINSIC_RUNES.length; i++) {
            const ir = INTRINSIC_RUNES[i];
            const on = Boolean(flg[ir.key] || (ir.alt && flg[ir.alt]));
            const warnMissing = depth >= 20 && ir.key === 'freeAct' && !on && r !== 'silq' && r !== 'rogue';
            const span = document.createElement('span');
            span.className = 'res-rune res-intrinsic ' + (on ? 'tier-on' : 'tier-off') + (warnMissing ? ' resist-warn-pulse' : '');
            span.textContent = ir.label;
            span.title = `${ir.name}: ${on ? 'Active' : (warnMissing ? 'MISSING Free Action past DL20 (Paralysis risk!)' : 'Inactive')}`;
            frag.appendChild(span);
        }
        container.appendChild(frag);
    }

    function renderDungeonFeelingPill(el, player, realm, frame) {
        if (!el || !player) return;
        if (frame) ingestFrameFeeling(frame, realm);
        const r = String(realm || 'angband').toLowerCase();
        const depth = Number(player.depth) || 0;
        const f = player.feeling;
        let monFeel = (f && typeof f === 'object') ? Number(f.mon || 0) : (typeof f === 'number' ? f : 0);
        let objFeel = (f && typeof f === 'object') ? Number(f.obj || 0) : 0;
        if (monFeel <= 0 && _inferredFeelingRealm === r && _inferredFeelingDepth === depth) {
            monFeel = _inferredMonFeel;
        }
        if (objFeel <= 0 && _inferredFeelingRealm === r && _inferredFeelingDepth === depth) {
            objFeel = _inferredObjFeel;
        }
        const sig = `${r}:${depth}:${monFeel}:${objFeel}:${player.stealth_mode ? 1 : 0}:${player.song_name || player.song || ''}`;
        if (sig === _lastFeelingSig) return;
        _lastFeelingSig = sig;

        if (r === 'silq') {
            const st = player.stealth_mode ? '🤫 Stealth' : '👣 Stride';
            const sng = player.song_name || player.song || '';
            el.textContent = sng ? `${st} • 🎵 ${sng}` : `${st}${player.stealth_score !== undefined ? ` (${player.stealth_score})` : ''}`;
            el.className = 'hud-feeling-pill feeling-silq';
            el.classList.remove('hidden');
            return;
        }
        if (depth <= 0 || (monFeel <= 0 && objFeel <= 0)) {
            el.classList.add('hidden');
            return;
        }
        const idx = Math.max(0, Math.min(9, monFeel > 0 ? monFeel : (objFeel >= 7 ? 5 : 2)));
        const label = monFeel > 0 ? (FEELING_LABELS[idx] || `Feeling ${idx}`) : 'Calm';
        const vaultTag = objFeel >= 7 ? ' • 💎 Vault' : (objFeel >= 4 ? ' • ✨ Loot' : '');
        el.textContent = `${idx >= 7 ? '💀' : (idx >= 4 ? '⚠' : '🕯')} ${label}${vaultTag}`;
        el.className = 'hud-feeling-pill ' + (idx >= 7 ? 'feeling-deadly' : (idx >= 4 ? 'feeling-warn' : 'feeling-calm'));
        el.classList.remove('hidden');
    }

    function getHudPreset() { return _hudPreset; }

    function applyHudPreset(preset) {
        const next = preset === 'immersive' ? 'immersive' : 'veteran';
        _hudPreset = next;
        try { localStorage.setItem('angband3d_hud_preset', next); } catch (_) {}
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('hud-preset-immersive', next === 'immersive');
            document.body.classList.toggle('hud-preset-veteran', next === 'veteran');
            const btn = document.getElementById('btn-hud-preset');
            if (btn) {
                btn.textContent = next === 'immersive' ? '🛡 HUD: Immersive' : '🎛 HUD: Veteran';
                btn.setAttribute('aria-pressed', next === 'veteran' ? 'true' : 'false');
            }
        }
        return next;
    }

    function getPermadeathMode() { return _permadeathMode; }

    function setPermadeathMode(mode) {
        _permadeathMode = mode === 'ironman' ? 'ironman' : 'adventure';
        if (typeof window !== 'undefined') window.__yasdPermadeathMode = _permadeathMode;
        try { localStorage.setItem('angband3d_permadeath_mode', _permadeathMode); } catch (_) {}
        if (typeof document !== 'undefined') {
            document.querySelectorAll('[data-permadeath-mode]').forEach((btn) => {
                const active = btn.getAttribute('data-permadeath-mode') === _permadeathMode;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            const reloadBtn = document.getElementById('btn-death-reload');
            if (reloadBtn) {
                const isIron = _permadeathMode === 'ironman';
                reloadBtn.disabled = isIron;
                reloadBtn.style.opacity = isIron ? '0.45' : '';
                reloadBtn.title = isIron ? '☠ Ironman Permadeath Active — Checkpoints Sealed' : 'Load Last Saved Checkpoint [R]';
            }
        }
        return _permadeathMode;
    }

    function initDialogTopLayerSync() {
        // Standard <div> modal overlays are managed directly by app.js so #global-audio-bar,
        // #realm-toast, and Escape appState transitions remain 100% interactive and synchronized.
    }

    let _ftueCleanup = null;

    function triggerFirstRunCoachmark(force) {
        if (typeof document === 'undefined') return;
        if (!force) {
            try { if (localStorage.getItem('angband3d_ftue_v12_done') === '1') return; } catch (_) {}
            try { localStorage.setItem('angband3d_ftue_v12_done', '1'); } catch (_) {}
        }
        let bar = document.getElementById('ftue-coachmark-pill');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ftue-coachmark-pill';
            bar.className = 'ftue-coachmark-pill';
            bar.setAttribute('role', 'status');
            document.body.appendChild(bar);
        }
        _ftueStep = 1;
        if (_ftueCleanup) _ftueCleanup();
        let dragStartX = null;
        const onDown = (e) => { dragStartX = e.clientX; };
        const onMove = (e) => {
            if (_ftueStep === 1 && dragStartX !== null && Math.abs(e.clientX - dragStartX) > 20) {
                dragStartX = null;
                advanceCoachmark(1);
            }
        };
        const onUp = () => { dragStartX = null; };
        const onKey = (e) => {
            const k = String(e.key || '');
            if (_ftueStep === 1 && (k === 'q' || k === 'Q' || k === 'e' || k === 'E' || k === 'ArrowLeft' || k === 'ArrowRight')) {
                advanceCoachmark(1);
            } else if (_ftueStep === 2 && /^(ArrowUp|ArrowDown|w|W|s|S|8|2|4|6|7|9|1|3| )$/.test(k)) {
                advanceCoachmark(2);
            } else if (_ftueStep === 3 && k === 'Tab') {
                advanceCoachmark(3);
            }
        };
        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerup', onUp, { passive: true });
        window.addEventListener('keydown', onKey, true);
        _ftueCleanup = () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('keydown', onKey, true);
            _ftueCleanup = null;
        };
        renderCoachmark(bar);
    }

    function renderCoachmark(bar) {
        if (!bar) return;
        const steps = [
            '',
            '✦ Step 1/3: Drag Mouse or press [Q / E] to Look 360° (Costs 0 Turns!)',
            '✦ Step 2/3: Press [Up / W] to Step Forward or Bump-Attack Foes',
            '✦ Step 3/3: Press [Tab] anytime to toggle the Classic 80×24 Terminal!'
        ];
        if (_ftueStep < 1 || _ftueStep > 3) {
            if (_ftueCleanup) _ftueCleanup();
            bar.remove();
            try { localStorage.setItem('angband3d_ftue_v12_done', '1'); } catch (_) {}
            return;
        }
        bar.textContent = '';
        const txt = document.createElement('span');
        txt.textContent = steps[_ftueStep];
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'ftue-coachmark-btn';
        nextBtn.textContent = _ftueStep < 3 ? 'Next ▸' : 'Got It ✓';
        nextBtn.addEventListener('click', () => advanceCoachmark());
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'ftue-coachmark-dismiss';
        skipBtn.textContent = '✕';
        skipBtn.title = 'Dismiss tutorial';
        skipBtn.addEventListener('click', () => { _ftueStep = 4; renderCoachmark(bar); });
        bar.append(txt, nextBtn, skipBtn);
    }

    function advanceCoachmark(expectedStep) {
        if (_ftueStep < 1 || (expectedStep && _ftueStep !== expectedStep)) return;
        _ftueStep += 1;
        const bar = typeof document !== 'undefined' ? document.getElementById('ftue-coachmark-pill') : null;
        if (bar) renderCoachmark(bar);
    }

    function bootDomControls() {
        if (typeof document === 'undefined') return;
        let savedPreset = 'veteran';
        let savedPermadeath = 'adventure';
        let savedBob = 100;
        try {
            if (localStorage.getItem('angband3d_hud_preset') === 'immersive') savedPreset = 'immersive';
            if (localStorage.getItem('angband3d_permadeath_mode') === 'ironman') savedPermadeath = 'ironman';
            const rawBob = localStorage.getItem('angband3d_head_bob_scale');
            if (rawBob !== null && rawBob !== '') savedBob = Math.max(0, Math.min(100, Number(rawBob)));
        } catch (_) {}
        applyHudPreset(savedPreset);
        setPermadeathMode(savedPermadeath);
        if (typeof window !== 'undefined') {
            window.GRAPHICS_CONFIG = window.GRAPHICS_CONFIG || {};
            window.GRAPHICS_CONFIG.headBobScale = savedBob / 100;
        }

        const presetBtn = document.getElementById('btn-hud-preset');
        if (presetBtn && !presetBtn._boundPreset) {
            presetBtn._boundPreset = true;
            presetBtn.addEventListener('click', () => applyHudPreset(_hudPreset === 'immersive' ? 'veteran' : 'immersive'));
        }

        const bobSlider = document.getElementById('pause-headbob-slider');
        const bobLabel = document.getElementById('pause-headbob-label');
        if (bobSlider) {
            bobSlider.value = String(savedBob);
            if (bobLabel) bobLabel.textContent = `${Math.round(savedBob)}%`;
            bobSlider.addEventListener('input', () => {
                const v = Math.max(0, Math.min(100, Number(bobSlider.value) || 0));
                if (bobLabel) bobLabel.textContent = `${Math.round(v)}%`;
                if (typeof window !== 'undefined') {
                    window.GRAPHICS_CONFIG = window.GRAPHICS_CONFIG || {};
                    window.GRAPHICS_CONFIG.headBobScale = v / 100;
                }
                try { localStorage.setItem('angband3d_head_bob_scale', String(v)); } catch (_) {}
            });
        }

        document.querySelectorAll('[data-permadeath-mode]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                setPermadeathMode(btn.getAttribute('data-permadeath-mode'));
            });
        });

        initDialogTopLayerSync();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootDomControls);
        else bootDomControls();
    }

    return Object.freeze({
        ingestFrameLore,
        lookupMonsterLore,
        normalizeSpeedDelta,
        formatMonsterTacticalSummary,
        renderResistStrip,
        renderDungeonFeelingPill,
        getHudPreset,
        applyHudPreset,
        getPermadeathMode,
        setPermadeathMode,
        initDialogTopLayerSync,
        triggerFirstRunCoachmark,
        advanceCoachmark,
        bootDomControls
    });
});

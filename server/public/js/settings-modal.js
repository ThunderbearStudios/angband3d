/**
 * settings-modal.js — Unified Native <dialog> Settings Modal (#yasd-settings-dialog)
 * Exposes Graphics Tier, HUD Scale, Handheld Mode, Subterranean Room Tone,
 * Grimoire Mode, and Reduced Motion with persistent localStorage backing.
 * Uses distinct IDs (#yasd-settings-dialog / #btn-open-settings), zero Chronicle ID collisions.
 * Contract: Pure UMD module, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.YasdSettingsModal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function applyReducedMotion(enabled) {
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.classList.toggle('yasd-reduced-motion', Boolean(enabled));
        }
        try { localStorage.setItem('yasd3d_reduced_motion', enabled ? 'on' : 'off'); } catch (_) {}
    }

    function applyGraphicsTier(tier) {
        try {
            if (!tier || tier === 'auto') localStorage.removeItem('yasd_gpu_override');
            else localStorage.setItem('yasd_gpu_override', tier);
        } catch (_) {}
        if (typeof DeviceProfile !== 'undefined' && typeof DeviceProfile.detectGpuProfile === 'function') {
            try { DeviceProfile.detectGpuProfile(); } catch (_) {}
        }
        const d3d = typeof window !== 'undefined' ? (window.__app?.dungeon || window.dungeon) : null;
        if (d3d && typeof d3d.resize === 'function') {
            try {
                if (typeof DeviceProfile !== 'undefined' && typeof DeviceProfile.getRenderBudget === 'function') {
                    d3d.renderBudget = DeviceProfile.getRenderBudget();
                }
                d3d.resize();
            } catch (_) {}
        }
    }

    function ensureDialog() {
        if (typeof document === 'undefined' || !document.body) return null;
        let dlg = document.getElementById('yasd-settings-dialog');
        if (dlg) return dlg;

        dlg = document.createElement('dialog');
        dlg.id = 'yasd-settings-dialog';
        dlg.className = 'yasd-modal-dialog yasd-settings-dialog';
        dlg.setAttribute('closedby', 'any');
        dlg.setAttribute('aria-label', 'YASD 3D Visual, Audio and Interface Settings');
        dlg.innerHTML = [
            '<div class="yasd-settings-shell">',
            '  <div class="yasd-settings-hdr">',
            '    <h3>⚙ Graphics, Audio &amp; Interface Settings</h3>',
            '    <button type="button" id="yasd-set-close" class="icon-btn" aria-label="Close Settings">✕</button>',
            '  </div>',
            '  <div class="yasd-settings-grid">',
            '    <label class="yasd-set-row"><span>3D Render Budget</span><select id="yasd-set-gfx"><option value="auto">Auto-Detect GPU</option><option value="mobile-saver">Mobile Saver (Max Battery)</option><option value="integrated">Integrated / Tablet</option><option value="performance">Performance (High)</option><option value="ultra">Ultra Quality</option></select></label>',
            '    <label class="yasd-set-row"><span>HUD Scale (<strong id="yasd-set-scale-val">100%</strong>)</span><input type="range" id="yasd-set-scale" min="85" max="125" step="5" value="100"></label>',
            '    <label class="yasd-set-row"><span>Handheld Touch Layout</span><select id="yasd-set-handheld"><option value="auto">Auto (Touch Phone)</option><option value="on">Force Handheld</option><option value="off">Force Desktop</option></select></label>',
            '    <label class="yasd-set-row"><span>Grimoire Card Deck [F10]</span><select id="yasd-set-grimoire"><option value="classic">Classic Terminal</option><option value="hybrid">Split Cards + Terminal</option><option value="cards">Full Cards Deck</option></select></label>',
            '    <label class="yasd-set-row"><span>Prompt &amp; Menu Style</span><select id="yasd-set-prompt-style"><option value="3d">3D Prompt Overlays</option><option value="classic">Classic 80x24 CRT Menus</option></select></label>',
            '    <label class="yasd-set-row yasd-set-check"><span>Camera-Relative Vi-Keys (HJKL / YUBN) [Alt+V]</span><input type="checkbox" id="yasd-set-vikeys"></label>',
            '    <label class="yasd-set-row yasd-set-check"><span>Auto-Pick Up Clicked Items (Global)</span><input type="checkbox" id="yasd-set-click-pickup" checked></label>',
            '    <label class="yasd-set-row yasd-set-check"><span>Subterranean Room-Tone Ambience</span><input type="checkbox" id="yasd-set-roomtone" checked></label>',
            '    <label class="yasd-set-row yasd-set-check"><span>Reduced Motion &amp; Transitions</span><input type="checkbox" id="yasd-set-motion"></label>',
            '  </div>',
            '  <div class="yasd-settings-ftr">',
            '    <button type="button" id="yasd-set-done" class="btn-gold">Done</button>',
            '  </div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(dlg);
        if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
            dlg.addEventListener('click', (ev) => {
                if (ev.target !== dlg) return;
                const r = dlg.getBoundingClientRect();
                if (ev.clientY < r.top || ev.clientY > r.top + r.height || ev.clientX < r.left || ev.clientX > r.left + r.width) close();
            });
        }

        const closeFn = () => close();
        dlg.querySelector('#yasd-set-close')?.addEventListener('click', closeFn);
        dlg.querySelector('#yasd-set-done')?.addEventListener('click', closeFn);
        dlg.addEventListener('click', (e) => {
            if (e.target === dlg) close();
        });

        dlg.querySelector('#yasd-set-gfx')?.addEventListener('change', (e) => applyGraphicsTier(e.target.value));
        dlg.querySelector('#yasd-set-scale')?.addEventListener('input', (e) => {
            const pct = Number(e.target.value) || 100;
            const dec = Math.max(0.85, Math.min(1.25, Math.round((pct / 100) * 20) / 20));
            const lbl = dlg.querySelector('#yasd-set-scale-val');
            if (lbl) lbl.textContent = pct + '%';
            const hudSlider = document.getElementById('hud-scale-range');
            if (hudSlider) {
                hudSlider.value = String(dec);
                hudSlider.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                document.documentElement.style.setProperty('--hud-scale', String(dec));
                try {
                    localStorage.setItem('yasd_hud_scale', String(dec));
                    localStorage.setItem('angband3d_hud_scale', String(dec));
                } catch (_) {}
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => {
                        if (typeof window.__syncMsgDockBottom === 'function') window.__syncMsgDockBottom();
                        if (typeof window.__clampFloatingWindows === 'function') window.__clampFloatingWindows();
                    });
                }
            }
        });
        dlg.querySelector('#yasd-set-handheld')?.addEventListener('change', (e) => {
            if (typeof DeviceProfile !== 'undefined' && typeof DeviceProfile.setHandheldOverride === 'function') {
                DeviceProfile.setHandheldOverride(e.target.value);
            }
        });
        dlg.querySelector('#yasd-set-grimoire')?.addEventListener('change', (e) => {
            const mode = e.target.value;
            try { localStorage.setItem('yasd3d_grimoire_mode', mode); } catch (_) {}
            if (window.RealmGrimoireDeck && typeof window.RealmGrimoireDeck.setMode === 'function') {
                window.RealmGrimoireDeck.setMode(mode, { userToggle: true });
            }
        });
        dlg.querySelector('#yasd-set-prompt-style')?.addEventListener('change', (e) => {
            const use3d = e.target.value !== 'classic';
            if (typeof window.__setYasdFlag === 'function') window.__setYasdFlag('PROMPT_MIRROR_3D', use3d);
            if (!use3d && window.PromptMirror && typeof window.PromptMirror.hide === 'function') window.PromptMirror.hide();
        });
        dlg.querySelector('#yasd-set-vikeys')?.addEventListener('change', (e) => {
            const val = e.target.checked ? 'on' : 'off';
            try { localStorage.setItem('angband3d_vi_keys', val); } catch (_) {}
            if (window.__app?.input) window.__app.input.viKeyMode = val;
        });
        dlg.querySelector('#yasd-set-click-pickup')?.addEventListener('change', (e) => {
            const on = Boolean(e.target.checked);
            try { localStorage.setItem('angband3d_click_auto_pickup', on ? 'true' : 'false'); } catch (_) {}
            if (window.__app?.input) window.__app.input.autoPickupOnClick = on;
        });
        dlg.querySelector('#yasd-set-roomtone')?.addEventListener('change', (e) => {
            if (window.AudioAmbience && typeof window.AudioAmbience.setEnabled === 'function') {
                window.AudioAmbience.setEnabled(Boolean(e.target.checked), window.__app?.audio);
            }
        });
        dlg.querySelector('#yasd-set-motion')?.addEventListener('change', (e) => applyReducedMotion(Boolean(e.target.checked)));

        return dlg;
    }

    function syncControls(dlg) {
        const d = dlg || document.getElementById('yasd-settings-dialog');
        if (!d) return;
        let gpu = 'auto', scale = 100, grim = 'classic', motion = false, viPref = null;
        try {
            gpu = localStorage.getItem('yasd_gpu_override') || 'auto';
            const rawScale = parseFloat(localStorage.getItem('yasd_hud_scale') || localStorage.getItem('angband3d_hud_scale') || '1');
            scale = Number.isFinite(rawScale) ? (rawScale <= 5 ? Math.round(rawScale * 100) : Math.round(rawScale)) : 100;
            grim = localStorage.getItem('yasd3d_grimoire_mode') || (window.RealmGrimoireDeck?.mode || 'classic');
            motion = localStorage.getItem('yasd3d_reduced_motion') === 'on';
            viPref = localStorage.getItem('angband3d_vi_keys');
        } catch (_) {}
        const gfxEl = d.querySelector('#yasd-set-gfx'); if (gfxEl) gfxEl.value = gpu;
        const scEl = d.querySelector('#yasd-set-scale'); if (scEl) scEl.value = String(scale);
        const scLbl = d.querySelector('#yasd-set-scale-val'); if (scLbl) scLbl.textContent = scale + '%';
        const hhEl = d.querySelector('#yasd-set-handheld');
        if (hhEl && typeof DeviceProfile !== 'undefined' && DeviceProfile.getHandheldOverride) {
            hhEl.value = DeviceProfile.getHandheldOverride();
        }
        const grEl = d.querySelector('#yasd-set-grimoire'); if (grEl) grEl.value = grim;
        const pmEl = d.querySelector('#yasd-set-prompt-style'); if (pmEl) pmEl.value = (window.YASD_FLAGS && window.YASD_FLAGS.PROMPT_MIRROR_3D === false) ? 'classic' : '3d';
        const vkEl = d.querySelector('#yasd-set-vikeys');
        if (vkEl) {
            const r = window.__app?.getActiveRealm?.() || 'angband';
            vkEl.checked = viPref === 'on' || (viPref !== 'off' && Boolean(window.YasdPrimitives?.isViDefaultRealm?.(r)));
        }
        const cpEl = d.querySelector('#yasd-set-click-pickup');
        if (cpEl) {
            let clickPickup = true;
            try { clickPickup = localStorage.getItem('angband3d_click_auto_pickup') !== 'false'; } catch (_) {}
            cpEl.checked = clickPickup;
        }
        const rtEl = d.querySelector('#yasd-set-roomtone');
        if (rtEl) rtEl.checked = !(window.AudioAmbience && typeof window.AudioAmbience.isEnabled === 'function' && !window.AudioAmbience.isEnabled());
        const moEl = d.querySelector('#yasd-set-motion'); if (moEl) moEl.checked = motion;
    }

    function open() {
        const dlg = ensureDialog();
        if (!dlg) return false;
        syncControls(dlg);
        if (!dlg.open) {
            if (typeof dlg.showModal === 'function') dlg.showModal();
            else dlg.setAttribute('open', '');
        }
        return true;
    }

    function close() {
        const dlg = document.getElementById('yasd-settings-dialog');
        if (!dlg) return;
        if (dlg.open && typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            try {
                if (localStorage.getItem('yasd3d_reduced_motion') === 'on') applyReducedMotion(true);
            } catch (_) {}
            const btn = document.getElementById('btn-open-settings');
            if (btn) btn.addEventListener('click', (e) => { if (e) e.preventDefault(); open(); });
        });
    }

    return { open, close, syncControls };
});

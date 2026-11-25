(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.YasdPrimitives = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NATIVE_DIALOG_IDS = [
        'death-modal', 'load-modal', 'pause-modal', 'guide-modal', 'pwa-modal',
        'demo-modal', 'queue-modal', 'realm-selector-modal', 'command-palette-modal',
        'chronicle-sketch-modal'
    ];
    const EXTRA_DIALOG_IDS = ['item-sheet', 'yasd-settings-dialog'];
    const VI_DEFAULT_REALMS = new Set(['rogue', 'nethack', 'dcss', 'brogue']);
    const VI_KEY_MAP = { k: 8, j: 2, h: 4, l: 6, y: 7, u: 9, b: 1, n: 3 };
    let _initialized = false;
    let _vtActive = false;
    let _popoverInvokers = new WeakMap();

    function isViDefaultRealm(realm) {
        return VI_DEFAULT_REALMS.has(String(realm || '').toLowerCase());
    }

    /**
     * Resolves camera-relative Vi-keys (h/j/k/l/y/u/b/n) to numpad sector 1..9 + Shift run.
     * Auto-enabled for Rogue, NetHack, DCSS, and Brogue unless explicitly set to 'off'.
     */
    function resolveViKeyDir(key, opts = {}) {
        const viMode = opts.viMode;
        const enabled = viMode === 'on' || viMode === true ||
            (viMode !== 'off' && viMode !== false && isViDefaultRealm(opts.realm));
        if (!enabled || typeof key !== 'string' || key.length !== 1) return null;
        const dir = VI_KEY_MAP[key.toLowerCase()];
        if (!dir) return null;
        return { dir, isRun: Boolean(opts.shiftKey || (key >= 'A' && key <= 'Z')) };
    }

    function openDialog(el) {
        if (!el) return false;
        el.classList.remove('hidden');
        if (el.style && el.style.display === 'none') el.style.display = '';
        if (typeof el.showModal === 'function' && !el.open) {
            try { el.showModal(); } catch (_) {}
        }
        return true;
    }

    function closeDialog(el) {
        if (!el) return false;
        el.classList.add('hidden');
        if (typeof el.close === 'function' && el.open) {
            try { el.close(); } catch (_) {}
        }
        return true;
    }

    function bindSafariClosedByFallback(dlg) {
        if (!dlg || dlg._yasdClosedByBound) return;
        dlg._yasdClosedByBound = true;
        if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
            dlg.addEventListener('click', (event) => {
                if (event.target !== dlg) return;
                const rect = dlg.getBoundingClientRect();
                const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
                if (!inside && typeof dlg.close === 'function') {
                    try { dlg.close(); } catch (_) {}
                }
            });
        }
    }

    function dispatchDialogNativeClose(id) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const app = window.__app || null;
        switch (id) {
            case 'pause-modal':
                if (app && typeof app.resumeGame === 'function') app.resumeGame();
                break;
            case 'load-modal':
                document.getElementById('btn-load-back')?.click();
                break;
            case 'guide-modal':
                document.getElementById('btn-guide-close')?.click();
                break;
            case 'pwa-modal':
                document.getElementById('btn-pwa-close')?.click();
                break;
            case 'command-palette-modal':
                window.CommandPalette?.hide?.();
                break;
            case 'realm-selector-modal':
                window.RealmCarousel?.close?.();
                break;
            case 'demo-modal':
                window.demoPlayer?.close?.();
                break;
            case 'queue-modal':
                document.getElementById('btn-queue-cancel')?.click();
                break;
            case 'chronicle-sketch-modal':
                document.getElementById('btn-close-sketch-modal')?.click();
                break;
            case 'death-modal':
                app?.hud?.hideDeathModal?.();
                break;
            default:
                break;
        }
    }

    function syncDialogWithVisibility(dlg) {
        if (!dlg || dlg._yasdSyncing) return;
        const shouldOpen = !dlg.classList.contains('hidden') && dlg.style.display !== 'none';
        dlg._yasdSyncing = true;
        try {
            if (shouldOpen && !dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
            else if (!shouldOpen && dlg.open && typeof dlg.close === 'function') dlg.close();
        } catch (_) {
        } finally {
            dlg._yasdSyncing = false;
        }
    }

    function initDialogs() {
        if (typeof document === 'undefined') return;
        for (const id of [...NATIVE_DIALOG_IDS, ...EXTRA_DIALOG_IDS]) {
            const el = document.getElementById(id);
            if (el && el.tagName === 'DIALOG') bindSafariClosedByFallback(el);
        }
        for (const id of NATIVE_DIALOG_IDS) {
            const dlg = document.getElementById(id);
            if (!dlg || dlg.tagName !== 'DIALOG' || dlg._yasdManaged) continue;
            dlg._yasdManaged = true;
            if (typeof MutationObserver !== 'undefined') {
                const mo = new MutationObserver(() => syncDialogWithVisibility(dlg));
                mo.observe(dlg, { attributes: true, attributeFilter: ['class', 'style'] });
            }
            dlg.addEventListener('close', () => {
                if (dlg._yasdSyncing) return;
                if (!dlg.classList.contains('hidden')) {
                    dlg._yasdSyncing = true;
                    dlg.classList.add('hidden');
                    dlg._yasdSyncing = false;
                    dispatchDialogNativeClose(id);
                }
            });
            syncDialogWithVisibility(dlg);
        }
    }

    function populateActionMorePopover(pop) {
        if (!pop || typeof document === 'undefined') return;
        const actionBar = document.getElementById('action-bar');
        if (!actionBar) return;
        pop.textContent = '';
        const grid = document.createElement('div');
        grid.className = 'action-more-grid';
        const btns = Array.from(actionBar.querySelectorAll('.action-btn'));
        for (const btn of btns) {
            if (!btn.id || btn.id === 'btn-action-more') continue;
            if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') continue;
            if (btn.id === 'btn-stair' && !btn.classList.contains('stair-active')) continue;
            if (btn.classList.contains('context-tile-btn') && btn.classList.contains('hidden')) continue;
            const cs = typeof getComputedStyle === 'function' ? getComputedStyle(btn) : null;
            if (cs && cs.display !== 'none') continue;
            if (btn.style.display === 'none' && btn.hasAttribute('data-hotbar-primary')) continue;
            const clone = document.createElement('button');
            clone.type = 'button';
            clone.className = 'action-more-item';
            clone.setAttribute('data-proxy-for', btn.id);
            clone.title = btn.title || '';
            const lbl = btn.querySelector('.act-label, #hero-action-text');
            const kbd = btn.querySelector('kbd');
            const text = (lbl ? lbl.textContent : btn.textContent || '').replace(/\s+/g, ' ').trim();
            const txtSpan = document.createElement('span');
            txtSpan.textContent = text;
            clone.appendChild(txtSpan);
            if (kbd && kbd.textContent) {
                const k = document.createElement('kbd');
                k.textContent = kbd.textContent.trim();
                clone.appendChild(k);
            }
            clone.addEventListener('click', (ev) => {
                ev.preventDefault();
                if (typeof pop.hidePopover === 'function') {
                    try { pop.hidePopover(); } catch (_) {}
                } else pop.classList.remove('is-open', ':popover-open');
                btn.click();
            });
            grid.appendChild(clone);
        }
        const paletteBtn = document.createElement('button');
        paletteBtn.type = 'button';
        paletteBtn.className = 'action-more-item action-more-compendium';
        paletteBtn.setAttribute('data-open-cmd-modal', '1');
        paletteBtn.innerHTML = '<span>All Commands</span><kbd>Ctrl+K</kbd>';
        paletteBtn.addEventListener('click', () => {
            if (typeof pop.hidePopover === 'function') {
                try { pop.hidePopover(); } catch (_) {}
            } else pop.classList.remove('is-open', ':popover-open');
            window.CommandPalette?.show?.(window.__app?.getAppState?.() || 'game');
        });
        grid.appendChild(paletteBtn);
        pop.appendChild(grid);
    }

    function positionPopoverFallback(pop, anchorEl) {
        if (!pop || !anchorEl || typeof CSS !== 'undefined' && CSS.supports && CSS.supports('anchor-name: --x') && CSS.supports('position-area: block-end')) return;
        const rect = anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
        if (!rect || rect.width === 0 || typeof window === 'undefined') return;
        const margin = 10;
        const rightPx = Math.max(margin, window.innerWidth - rect.right);
        pop.style.right = `${Math.round(rightPx)}px`;
        pop.style.left = 'auto';
        if (rect.top > window.innerHeight * 0.55) {
            pop.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
            pop.style.top = 'auto';
        } else {
            pop.style.top = `${Math.round(rect.bottom + 8)}px`;
            pop.style.bottom = 'auto';
        }
    }

    function setPopoverCompatState(pop, open, sourceBtn) {
        if (!pop) return;
        if (open) {
            pop.classList.remove('hidden');
            pop.classList.add('is-open', ':popover-open');
            if (sourceBtn) {
                _popoverInvokers.set(pop, sourceBtn);
                sourceBtn.setAttribute('aria-expanded', 'true');
            }
        } else {
            pop.classList.add('hidden');
            pop.classList.remove('is-open', ':popover-open');
            const prev = _popoverInvokers.get(pop);
            if (prev) prev.setAttribute('aria-expanded', 'false');
        }
    }

    function initCommandFallback() {
        if (typeof document === 'undefined' || document._yasdCmdFallbackBound) return;
        const hasNativeCmd = typeof HTMLButtonElement !== 'undefined' && ('commandForElement' in HTMLButtonElement.prototype);
        if (hasNativeCmd) return;
        document._yasdCmdFallbackBound = true;
        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('button[commandfor][command]') : null;
            if (!btn) return;
            const targetId = btn.getAttribute('commandfor');
            const cmd = btn.getAttribute('command');
            const target = targetId ? document.getElementById(targetId) : null;
            if (!target || !cmd) return;
            const hasNativePop = typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');
            if (cmd === 'toggle-popover') {
                if (hasNativePop && typeof target.togglePopover === 'function') {
                    _popoverInvokers.set(target, btn);
                    try { target.togglePopover({ source: btn }); } catch (_) { target.togglePopover(); }
                } else {
                    const isOpen = target.classList.contains(':popover-open') || !target.classList.contains('hidden');
                    if (!isOpen && target.id === 'action-more-popover') populateActionMorePopover(target);
                    if (!isOpen) positionPopoverFallback(target, btn);
                    setPopoverCompatState(target, !isOpen, btn);
                }
            } else if (cmd === 'show-popover') {
                if (hasNativePop && typeof target.showPopover === 'function') {
                    try { target.showPopover({ source: btn }); } catch (_) { target.showPopover(); }
                } else setPopoverCompatState(target, true, btn);
            } else if (cmd === 'hide-popover') {
                if (hasNativePop && typeof target.hidePopover === 'function') target.hidePopover();
                else setPopoverCompatState(target, false, btn);
                _popoverInvokers.get(target)?.focus?.();
            } else if (cmd === 'show-modal') openDialog(target);
            else if (cmd === 'close') closeDialog(target);
        });
    }

    function initPopovers() {
        if (typeof document === 'undefined') return;
        const qvp = document.getElementById('quick-volume-popover');
        if (qvp && !qvp._yasdPopBound) {
            qvp._yasdPopBound = true;
            qvp.addEventListener('beforetoggle', (e) => {
                if (e.newState === 'open') {
                    window.__app?.audio?.unlock?.();
                    window.__app?.syncAudioUI?.();
                    qvp.classList.remove('hidden');
                    positionPopoverFallback(qvp, e.source || document.getElementById('btn-sound-config'));
                    if (e.source) _popoverInvokers.set(qvp, e.source);
                    e.source?.setAttribute?.('aria-expanded', 'true');
                }
            });
            qvp.addEventListener('toggle', (e) => {
                if (e.newState === 'closed') {
                    qvp.classList.add('hidden');
                    for (const id of ['btn-sound-config', 'btn-global-audio-config', 'btn-term-audio-config', 'btn-menu-audio-settings']) {
                        document.getElementById(id)?.setAttribute('aria-expanded', 'false');
                        document.getElementById(id)?.classList.remove('active');
                    }
                } else {
                    for (const id of ['btn-sound-config', 'btn-global-audio-config', 'btn-term-audio-config', 'btn-menu-audio-settings']) {
                        const b = document.getElementById(id);
                        if (b) { b.setAttribute('aria-expanded', 'true'); b.classList.add('active'); }
                    }
                }
            });
            const closeBtn = document.getElementById('btn-popover-close');
            closeBtn?.addEventListener('click', () => {
                const invoker = _popoverInvokers.get(qvp);
                if (invoker && typeof invoker.focus === 'function') setTimeout(() => invoker.focus(), 0);
            });
        }

        const amp = document.getElementById('action-more-popover');
        if (amp && !amp._yasdPopBound) {
            amp._yasdPopBound = true;
            amp.addEventListener('beforetoggle', (e) => {
                if (e.newState === 'open') {
                    if (window.DeviceProfile && typeof window.DeviceProfile.isHandheld === 'function' && window.DeviceProfile.isHandheld()) {
                        if (typeof e.preventDefault === 'function') e.preventDefault();
                        return;
                    }
                    populateActionMorePopover(amp);
                    positionPopoverFallback(amp, e.source || document.getElementById('btn-action-more'));
                }
            });
            amp.addEventListener('toggle', (e) => {
                const moreBtn = document.getElementById('btn-action-more');
                if (moreBtn) moreBtn.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
            });
        }

        const hpp = document.getElementById('hud-panels-popover');
        if (hpp && !hpp._yasdPopBound) {
            hpp._yasdPopBound = true;
            hpp.addEventListener('beforetoggle', (e) => {
                if (e.newState === 'open') {
                    positionPopoverFallback(hpp, e.source || document.getElementById('btn-hud-panels'));
                }
            });
            hpp.addEventListener('toggle', (e) => {
                const btn = document.getElementById('btn-hud-panels');
                if (btn) btn.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
            });
        }
    }

    /**
     * Caches inactive tabs via content-visibility: hidden + inert + aria-hidden.
     */
    function activateCachedTab(panels, activeIdx, opts = {}) {
        if (!panels || typeof panels.length !== 'number') return;
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (!p) continue;
            const on = (i === activeIdx);
            p.classList.toggle('active', on);
            p.classList.toggle('tab-cached-inactive', !on);
            p.setAttribute('aria-hidden', on ? 'false' : 'true');
            if (on) {
                p.removeAttribute('inert');
                p.removeAttribute('hidden');
                p.setAttribute('tabindex', '0');
            } else {
                p.setAttribute('inert', '');
                p.removeAttribute('tabindex');
                if (opts.untilFound) p.setAttribute('hidden', 'until-found');
            }
        }
        if (opts.focusActive && panels[activeIdx] && typeof panels[activeIdx].focus === 'function') {
            try { panels[activeIdx].focus({ preventScroll: true }); } catch (_) {}
        }
    }

    /**
     * Progressive-enhancement View Transitions wrapper gated on reduced-motion & re-entrancy.
     */
    function runViewTransition(updateFn, opts = {}) {
        if (typeof updateFn !== 'function') return null;
        const reduced = typeof document !== 'undefined' && (
            document.documentElement?.classList?.contains('yasd-reduced-motion') ||
            (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        );
        if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || reduced || _vtActive) {
            updateFn();
            if (opts.focusTarget && typeof opts.focusTarget.focus === 'function') {
                try { opts.focusTarget.focus({ preventScroll: true }); } catch (_) {}
            }
            if (typeof opts.onFinished === 'function') opts.onFinished();
            return null;
        }
        _vtActive = true;
        let vt = null;
        try {
            vt = document.startViewTransition(() => { updateFn(); });
        } catch (_) {
            _vtActive = false;
            updateFn();
            return null;
        }
        Promise.resolve(vt && vt.finished).catch(() => {}).finally(() => {
            _vtActive = false;
            if (opts.focusTarget && typeof opts.focusTarget.focus === 'function') {
                try { opts.focusTarget.focus({ preventScroll: true }); } catch (_) {}
            }
            if (typeof opts.onFinished === 'function') opts.onFinished();
        });
        return vt;
    }

    /**
     * Handles L3/R3/LB/RB extended gamepad actions outside core gamepad.js LOC budget.
     */
    function handleExtendedGamepadIntent(intent, ctx = {}) {
        if (!intent || typeof window === 'undefined') return false;
        const app = window.__app || {};
        const sheet = window.ItemSheet;
        if (intent.id === 'toggle_run' && app.input && typeof app.input.toggleDpadRunMode === 'function') {
            app.input.toggleDpadRunMode();
            return true;
        }
        if (intent.id === 'camera_reset') {
            if (ctx.diagonalLock && app.input && typeof app.input.toggleAutoExplore === 'function') {
                app.input.toggleAutoExplore();
                return true;
            }
            if (app.dungeon) {
                if (typeof app.dungeon.resetPitch === 'function') app.dungeon.resetPitch();
                else if (typeof app.dungeon.pitch === 'number') { app.dungeon.pitch = 0; app.dungeon.syncCamera?.(); }
                app.input?.syncCompass?.();
            }
            return true;
        }
        if (intent.id === 'target_prev' || intent.id === 'target_next') {
            if (sheet && typeof sheet.isOpen === 'function' && sheet.isOpen() && typeof document !== 'undefined') {
                const tabs = Array.from(document.querySelectorAll('#item-sheet .item-sheet-tab'));
                if (tabs.length > 0) {
                    const cur = Math.max(0, tabs.findIndex((t) => t.classList.contains('active')));
                    const delta = intent.id === 'target_prev' ? -1 : 1;
                    tabs[(cur + delta + tabs.length) % tabs.length]?.click();
                    return true;
                }
            }
            if (app.input && typeof app.input.isDirectionalTargeting === 'function' && !app.input.isDirectionalTargeting() && app.dungeon && typeof app.dungeon.turn === 'function') {
                app.dungeon.turn(intent.id === 'target_prev' ? -1 : 1);
                app.input?.syncCompass?.();
                return true;
            }
        }
        return false;
    }

    function init() {
        if (_initialized) return;
        _initialized = true;
        initDialogs();
        initPopovers();
        initCommandFallback();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
        else init();
    }

    return {
        NATIVE_DIALOG_IDS,
        VI_DEFAULT_REALMS,
        init,
        initDialogs,
        initPopovers,
        initCommandFallback,
        openDialog,
        closeDialog,
        activateCachedTab,
        runViewTransition,
        populateActionMorePopover,
        resolveViKeyDir,
        isViDefaultRealm,
        handleExtendedGamepadIntent
    };
}));

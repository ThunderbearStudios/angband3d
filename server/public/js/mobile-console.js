/**
 * mobile-console.js — Isolated Handheld Console UX Orchestrator (v12.3.8)
 * Activates ONLY when DeviceProfile.isHandheld() is true (html.yasd-handheld).
 * Zero impact on Desktop, laptop fine-pointer mice, or Classic CRT workflows.
 */
(function (root) {
    'use strict';

    let _initialized = false;
    let _wasHandheld = false;
    let _hudWrapped = false;
    let _lastRenderedKey = '';
    let _suppressNextActionMoreClick = false;
    let _prevGrimoireMode = null;

    function isHandheld() {
        const dp = root.DeviceProfile;
        return Boolean(dp && typeof dp.isHandheld === 'function' && dp.isHandheld());
    }

    function getApp() {
        return root.__app || null;
    }

    function ensureHandheldMounts() {
        const host = document.getElementById('app-container') || document.body;
        if (!host) return;

        if (!document.getElementById('handheld-deck-plate')) {
            const plate = document.createElement('div');
            plate.id = 'handheld-deck-plate';
            plate.setAttribute('aria-hidden', 'true');
            host.appendChild(plate);
        }

        if (!document.getElementById('quick-slot-bar')) {
            const bar = document.createElement('div');
            bar.id = 'quick-slot-bar';
            bar.className = 'quick-slot-bar';
            bar.setAttribute('role', 'toolbar');
            bar.setAttribute('aria-label', 'Quick Action Slots');
            for (let i = 1; i <= 4; i++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = `quick-slot-btn-${i}`;
                btn.className = 'quick-slot-btn';
                btn.dataset.slotIdx = String(i - 1);
                btn.textContent = `Slot ${i}`;
                bindQuickSlotInteractions(btn, i - 1);
                bar.appendChild(btn);
            }
            host.appendChild(bar);
        }

        if (!document.getElementById('quick-slot-popover')) {
            const pop = document.createElement('div');
            pop.id = 'quick-slot-popover';
            pop.className = 'quick-slot-popover';
            pop.setAttribute('role', 'dialog');
            pop.setAttribute('aria-label', 'Bind Quick Slot');
            host.appendChild(pop);
        }

        if (!document.getElementById('handheld-autonav-stop')) {
            const stopBtn = document.createElement('button');
            stopBtn.type = 'button';
            stopBtn.id = 'handheld-autonav-stop';
            stopBtn.textContent = '⏹ Stop Walk';
            stopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const app = getApp();
                if (app && app.input) {
                    if (typeof app.input.stopAutoExplore === 'function') app.input.stopAutoExplore();
                    if (typeof app.input.cancelMinimapAutoNav === 'function') app.input.cancelMinimapAutoNav();
                }
                stopBtn.classList.remove('is-active');
                if (root.DeviceProfile) root.DeviceProfile.triggerHaptic('medium');
            });
            host.appendChild(stopBtn);
        }
    }

    function bindQuickSlotInteractions(btn, slotIdx) {
        let holdTimer = null;
        let heldLong = false;
        let startX = 0;
        let startY = 0;

        const clearHold = () => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        };

        btn.addEventListener('pointerdown', (e) => {
            if (!isHandheld()) return;
            heldLong = false;
            startX = e.clientX || 0;
            startY = e.clientY || 0;
            clearHold();
            holdTimer = setTimeout(() => {
                heldLong = true;
                holdTimer = null;
                if (root.DeviceProfile) root.DeviceProfile.triggerHaptic('medium');
                openQuickBinder(slotIdx);
            }, 420);
        });

        btn.addEventListener('pointermove', (e) => {
            if (!holdTimer) return;
            if (Math.hypot((e.clientX || 0) - startX, (e.clientY || 0) - startY) > 12) {
                clearHold();
            }
        });

        btn.addEventListener('pointerup', clearHold);
        btn.addEventListener('pointercancel', clearHold);

        btn.addEventListener('contextmenu', (e) => {
            if (!isHandheld()) return;
            e.preventDefault();
            e.stopPropagation();
            clearHold();
            openQuickBinder(slotIdx);
        });

        btn.addEventListener('click', (e) => {
            if (!isHandheld()) return;
            e.preventDefault();
            e.stopPropagation();
            if (heldLong) {
                heldLong = false;
                return;
            }
            const app = getApp();
            const qa = getQuickActions();
            if (!qa) return;
            const frame = (app && (app.getLastFrame ? app.getLastFrame() : app.lastFrame)) || root.__lastFrame || null;
            const realm = (app && app.getActiveRealm ? app.getActiveRealm() : 'angband');
            const sendFn = (k) => { if (app && app.network && typeof app.network.sendKey === 'function') app.network.sendKey(k); };
            const toastFn = (app && app.showRealmToast) || null;
            if (root.DeviceProfile) root.DeviceProfile.triggerHaptic('light');
            qa.executeSlot(slotIdx, frame, realm, sendFn, toastFn);
        });
    }

    function getQuickActions() {
        const app = getApp();
        return (app && app.input && app.input.quickActions) || root.QuickActions || null;
    }

    function openQuickBinder(slotIdx) {
        const qa = getQuickActions();
        if (!qa || typeof qa.openBinderPopover !== 'function') return;
        const app = getApp();
        const frame = (app && (app.getLastFrame ? app.getLastFrame() : app.lastFrame)) || root.__lastFrame || null;
        const realm = (app && app.getActiveRealm ? app.getActiveRealm() : 'angband');
        qa.openBinderPopover(slotIdx, frame, realm);
    }

    function syncQuickSlots(frameOverride) {
        if (!isHandheld()) return;
        const app = getApp();
        const qa = getQuickActions();
        const frame = frameOverride || (app && (app.getLastFrame ? app.getLastFrame() : app.lastFrame)) || root.__lastFrame || {};
        const realm = (frame && frame.realm) || (app && app.getActiveRealm ? app.getActiveRealm() : 'angband');
        const lang = root.__langMode || 'en';
        if (qa && typeof qa.renderBar === 'function') {
            qa.renderBar(frame, realm, lang);
        }
        const stopBtn = document.getElementById('handheld-autonav-stop');
        if (stopBtn) {
            const navActive = Boolean(app && app.input && typeof app.input.isAutoNavigating === 'function' && app.input.isAutoNavigating());
            stopBtn.classList.toggle('is-active', navActive);
        }
        const coach = document.getElementById('ftue-coachmark-pill') || document.querySelector('.ftue-coachmark-pill');
        if (coach) {
            const span = coach.querySelector('span');
            if (span && span.textContent) {
                if (span.textContent.includes('Drag Mouse')) {
                    span.textContent = span.textContent.replace('Drag Mouse or press [Q / E]', 'Swipe 3D view or tap ↺ / ↻');
                } else if (span.textContent.includes('Step 2/3:')) {
                    span.textContent = '✦ Step 2/3: Slide D-Pad to move or tap 3D tiles to walk';
                } else if (span.textContent.includes('Step 3/3:')) {
                    span.textContent = '✦ Step 3/3: Tap Pack / Quick Belt, or hold More for Radial Menu';
                }
            }
        }
    }

    function applyDpadTextPresentation() {
        const glyphs = { 'dpad-ul': '↖\uFE0E', 'dpad-ur': '↗\uFE0E', 'dpad-dl': '↙\uFE0E', 'dpad-dr': '↘\uFE0E' };
        for (const [id, ch] of Object.entries(glyphs)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            for (const node of btn.childNodes) {
                if (node.nodeType === 3 && node.nodeValue && !node.nodeValue.includes('\uFE0E')) {
                    node.nodeValue = ch;
                    break;
                }
            }
        }
    }

    function injectItemSheetCrtButton(dialog, tabId) {
        if (!dialog || !isHandheld()) return;
        const header = dialog.querySelector('.item-sheet-header');
        const closeBtn = header && header.querySelector('.item-sheet-close');
        if (!header || header.querySelector('.item-sheet-crt-btn')) return;

        const crtBtn = document.createElement('button');
        crtBtn.type = 'button';
        crtBtn.className = 'item-sheet-crt-btn';
        crtBtn.textContent = '⌨ CRT';
        crtBtn.title = 'Open classic 80x24 terminal inventory';
        crtBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const app = getApp();
            const sheet = (app && app.itemSheet) || root.itemSheet || root.ItemSheet;
            if (sheet && typeof sheet.hide === 'function') sheet.hide();
            const realm = (app && app.getActiveRealm ? app.getActiveRealm() : 'angband');
            const activeTab = dialog.querySelector('.item-sheet-tab.active')?.getAttribute('data-tab') || tabId;
            const verb = activeTab === 'gear' ? 'equip' : 'inven';
            const key = (root.RealmKeys && typeof root.RealmKeys.realmKey === 'function' && root.RealmKeys.realmKey(verb, realm)) || (verb === 'equip' ? 'e' : 'i');
            if (app && app.network && typeof app.network.sendKey === 'function') {
                app.network.sendKey(key);
            }
        });
        if (closeBtn) header.insertBefore(crtBtn, closeBtn);
        else header.appendChild(crtBtn);
    }

    function openItemSheetTab(tabId, invokerEl) {
        const app = getApp();
        const sheet = (app && app.itemSheet) || root.itemSheet || root.ItemSheet;
        if (!sheet || typeof sheet.show !== 'function') return false;
        const frame = (app && (app.getLastFrame ? app.getLastFrame() : app.lastFrame)) || root.__lastFrame || null;
        const realm = (app && app.getActiveRealm ? app.getActiveRealm() : 'angband');
        const desiredTab = (tabId === 'gear' || tabId === 'equip') ? 'gear' : (tabId === 'quiver' ? 'quiver' : 'pack');

        sheet.show(frame, realm, invokerEl);
        const dialog = document.getElementById('item-sheet');
        if (dialog) {
            const tabBtn = dialog.querySelector(`.item-sheet-tab[data-tab="${desiredTab}"]`);
            if (tabBtn && !tabBtn.classList.contains('active')) {
                tabBtn.click();
            }
            injectItemSheetCrtButton(dialog, desiredTab);
            if (!dialog._hhCrtObserved && typeof MutationObserver !== 'undefined') {
                dialog._hhCrtObserved = true;
                new MutationObserver(() => {
                    if (sheet.isOpen && sheet.isOpen() && isHandheld()) {
                        injectItemSheetCrtButton(dialog, desiredTab);
                    }
                }).observe(dialog, { childList: true });
            }
        }
        return true;
    }

    function wireVirtualDpadSlide() {
        const grid = document.querySelector('#touch-controls .dpad-grid');
        if (!grid || grid._hhSlideBound) return;
        grid._hhSlideBound = true;

        let startBtn = null;
        let slideBtn = null;
        let didSlide = false;

        const clearSlideHighlight = () => {
            grid.querySelectorAll('.dpad-btn.is-slide-active').forEach((b) => b.classList.remove('is-slide-active'));
        };

        grid.addEventListener('touchstart', (e) => {
            if (!isHandheld() || !e.touches || e.touches.length !== 1) return;
            const btn = e.target && e.target.closest ? e.target.closest('.dpad-btn') : null;
            startBtn = btn;
            slideBtn = btn;
            didSlide = false;
            if (btn) btn.classList.add('is-slide-active');
        }, { passive: true });

        grid.addEventListener('touchmove', (e) => {
            if (!isHandheld() || !e.touches || e.touches.length !== 1 || !slideBtn) return;
            const t = e.touches[0];
            const el = document.elementFromPoint(t.clientX, t.clientY);
            const nextBtn = (el && el.closest) ? el.closest('.dpad-btn') : null;
            if (nextBtn && grid.contains(nextBtn) && nextBtn !== slideBtn) {
                didSlide = true;
                if (e.cancelable) e.preventDefault();
                slideBtn.classList.remove('is-slide-active');
                slideBtn.dispatchEvent(new Event('touchend', { bubbles: true }));
                slideBtn = nextBtn;
                slideBtn.classList.add('is-slide-active');
                if (root.DeviceProfile) root.DeviceProfile.vibrate(8);
                slideBtn.dispatchEvent(new Event('touchstart', { bubbles: true }));
            }
        }, { passive: false });

        const finishSlide = () => {
            if (didSlide && slideBtn && slideBtn !== startBtn) {
                slideBtn.dispatchEvent(new Event('touchend', { bubbles: true }));
            }
            startBtn = null;
            slideBtn = null;
            didSlide = false;
            clearSlideHighlight();
        };

        grid.addEventListener('touchend', finishSlide, { passive: true });
        grid.addEventListener('touchcancel', finishSlide, { passive: true });
    }

    function wireRadialHoldGesture() {
        const moreBtn = document.getElementById('btn-action-more');
        if (!moreBtn || moreBtn._hhRadialBound) return;
        moreBtn._hhRadialBound = true;

        let holdTimer = null;
        let radialActive = false;
        let startX = 0;
        let startY = 0;

        const clearTimer = () => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        };

        const openRadial = () => {
            const app = getApp();
            const rad = (app && app.radialMenu) || root.radialMenu;
            if (!rad || typeof rad.open !== 'function') return;
            radialActive = true;
            _suppressNextActionMoreClick = true;
            if (app && typeof app.getActiveRealm === 'function') rad.realm = app.getActiveRealm();
            rad.open(0);
            if (root.DeviceProfile) root.DeviceProfile.triggerHaptic('medium');
        };

        moreBtn.addEventListener('touchstart', (e) => {
            if (!isHandheld() || !e.touches || e.touches.length !== 1) return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            radialActive = false;
            clearTimer();
            holdTimer = setTimeout(openRadial, 300);
        }, { passive: true });

        moreBtn.addEventListener('touchmove', (e) => {
            if (!isHandheld() || !e.touches || e.touches.length !== 1) return;
            const t = e.touches[0];
            if (!radialActive && Math.hypot(t.clientX - startX, t.clientY - startY) > 22) {
                clearTimer();
                openRadial();
            }
            if (radialActive) {
                const disc = document.getElementById('radial-menu-disc');
                const app = getApp();
                const rad = (app && app.radialMenu) || root.radialMenu;
                if (disc && rad && typeof rad.highlightFromStick === 'function') {
                    const rect = disc.getBoundingClientRect();
                    const dx = (t.clientX - (rect.left + rect.width / 2)) / 95;
                    const dy = (t.clientY - (rect.top + rect.height / 2)) / 95;
                    rad.highlightFromStick(dx, dy);
                }
            }
        }, { passive: true });

        const finishRadial = () => {
            clearTimer();
            if (!radialActive) return;
            const app = getApp();
            const rad = (app && app.radialMenu) || root.radialMenu;
            radialActive = false;
            if (rad) {
                if (rad.selectedIndex !== null && rad.selectedIndex !== undefined) {
                    rad.selectWedge(rad.selectedIndex);
                } else {
                    rad.close();
                }
            }
            setTimeout(() => { _suppressNextActionMoreClick = false; }, 160);
        };

        moreBtn.addEventListener('touchend', finishRadial, { passive: true });
        moreBtn.addEventListener('touchcancel', finishRadial, { passive: true });
        moreBtn.addEventListener('click', (e) => {
            if (_suppressNextActionMoreClick) {
                e.preventDefault();
                e.stopImmediatePropagation();
                _suppressNextActionMoreClick = false;
            }
        }, true);
    }

    function wireTapExpandables() {
        const charPanel = document.getElementById('char-panel');
        if (charPanel && !charPanel._hhExpandBound) {
            charPanel._hhExpandBound = true;
            charPanel.addEventListener('click', (e) => {
                if (!isHandheld()) return;
                if (e.target && e.target.closest && e.target.closest('.char-mini-btn')) return;
                charPanel.classList.toggle('handheld-char-expanded');
                const mapEl = document.getElementById('minimap-container');
                if (mapEl) mapEl.classList.remove('handheld-map-expanded');
                if (root.DeviceProfile) root.DeviceProfile.triggerHaptic('light');
            });
        }

        const minimap = document.getElementById('minimap-container');
        if (minimap && !minimap._hhExpandBound) {
            minimap._hhExpandBound = true;
            minimap.addEventListener('click', (e) => {
                if (!isHandheld()) return;
                if (e.target && e.target.closest && e.target.closest('.mobile-map-btn, .mobile-map-zoom-btn, .map-ctrl-btn')) return;
                if (e.target && e.target.closest && e.target.closest('#btn-minimap-close')) return;
                minimap.classList.toggle('handheld-map-expanded');
                const cp = document.getElementById('char-panel');
                if (cp) cp.classList.remove('handheld-char-expanded');
                if (root.DeviceProfile) root.DeviceProfile.triggerHaptic('light');
            });
            const closeBtn = document.getElementById('btn-minimap-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    if (isHandheld() && minimap.classList.contains('handheld-map-expanded')) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        minimap.classList.remove('handheld-map-expanded');
                    }
                }, true);
            }
        }

        if (!document._hhDismissBound) {
            document._hhDismissBound = true;
            document.addEventListener('click', (e) => {
                if (!isHandheld()) return;
                const cp = document.getElementById('char-panel');
                if (cp && cp.classList.contains('handheld-char-expanded') && !cp.contains(e.target)) {
                    cp.classList.remove('handheld-char-expanded');
                }
                const mm = document.getElementById('minimap-container');
                if (mm && mm.classList.contains('handheld-map-expanded') && !mm.contains(e.target)) {
                    mm.classList.remove('handheld-map-expanded');
                }
            });
        }
    }

    function ensureHudSyncHook() {
        if (_hudWrapped) return;
        const app = getApp();
        if (!app || !app.hud || typeof app.hud.update !== 'function') return;
        _hudWrapped = true;
        const origUpdate = app.hud.update.bind(app.hud);
        app.hud.update = function (frame) {
            const res = origUpdate(frame);
            if (isHandheld()) syncQuickSlots(frame);
            return res;
        };
    }

    function applyHandheldMode(handheld) {
        if (handheld) {
            ensureHandheldMounts();
            applyDpadTextPresentation();
            wireVirtualDpadSlide();
            wireRadialHoldGesture();
            wireTapExpandables();
            ensureHudSyncHook();
            if (root.RealmGrimoireDeck && typeof root.RealmGrimoireDeck.setMode === 'function') {
                if (_prevGrimoireMode === null) _prevGrimoireMode = root.RealmGrimoireDeck.mode || 'classic';
                if (root.RealmGrimoireDeck.mode === 'classic') root.RealmGrimoireDeck.setMode('hybrid');
            }
            syncQuickSlots();
        } else {
            const cp = document.getElementById('char-panel');
            if (cp) cp.classList.remove('handheld-char-expanded');
            const mm = document.getElementById('minimap-container');
            if (mm) mm.classList.remove('handheld-map-expanded');
            const stopBtn = document.getElementById('handheld-autonav-stop');
            if (stopBtn) stopBtn.classList.remove('is-active');
            const actionBar = document.getElementById('action-bar');
            if (actionBar) actionBar.classList.remove('drawer-open');
            if (_wasHandheld && _prevGrimoireMode && root.RealmGrimoireDeck && typeof root.RealmGrimoireDeck.setMode === 'function') {
                root.RealmGrimoireDeck.setMode(_prevGrimoireMode);
                _prevGrimoireMode = null;
            }
        }
        _wasHandheld = handheld;

        const app = getApp();
        if (app && app.dungeon && typeof app.dungeon.resize === 'function') {
            requestAnimationFrame(() => {
                if (app.dungeon && typeof app.dungeon.resize === 'function') app.dungeon.resize();
            });
        }
    }

    function init() {
        if (_initialized) return;
        _initialized = true;
        ensureHandheldMounts();

        if (root.DeviceProfile && typeof root.DeviceProfile.addListener === 'function') {
            root.DeviceProfile.addListener((state) => {
                const stateKey = `${state.isHandheld ? 1 : 0}:${state.isPortrait ? 1 : 0}:${state.width}x${state.height}`;
                if (stateKey === _lastRenderedKey && state.isHandheld === _wasHandheld) return;
                _lastRenderedKey = stateKey;
                applyHandheldMode(Boolean(state.isHandheld));
            });
        } else {
            applyHandheldMode(isHandheld());
        }

        // Fallback to attach HUD hook after app.js finishes bootstrapping
        let tries = 0;
        const waitHud = setInterval(() => {
            tries++;
            ensureHudSyncHook();
            if (_hudWrapped || tries >= 40) {
                clearInterval(waitHud);
                if (isHandheld()) syncQuickSlots();
            }
        }, 125);
    }

    const api = {
        init,
        isHandheld,
        syncQuickSlots,
        openItemSheetTab
    };

    root.MobileConsole = api;
    root.__MobileConsole = api;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);

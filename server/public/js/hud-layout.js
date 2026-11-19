/**
 * hud-layout.js — Universal Moveable HUD Docking, Action Dock Presets & Camera Yaw Facing.
 * Extracted from hud.js (Wave 0) to enforce modular LOC budgets with zero behavioral drift.
 */
(function (root) {
    'use strict';

    function attachHudLayout(WebHUDClass) {
        if (!WebHUDClass || !WebHUDClass.prototype) return;
        const HudProto = WebHUDClass.prototype;

        HudProto.initUniversalMovableHud = function initUniversalMovableHud() {
            this._hudWasDragged = false;

            const widgets = [
                { id: 'touch-controls', handleId: 'dpad-drag-handle' },
                { id: 'char-panel', handleId: 'char-drag-handle' },
                { id: 'hud-center-column', handleId: 'action-bar-drag-handle' }
            ];

            widgets.forEach(({ id, handleId }) => {
                const widgetEl = document.getElementById(id);
                const handleEl = document.getElementById(handleId);
                if (!widgetEl || !handleEl) return;

                let isDragging = false;
                let isPending = false;
                let startX = 0, startY = 0;
                let initialLeft = 0, initialTop = 0;
                let widgetW = 0, widgetH = 0;

                const onStart = (clientX, clientY, e) => {
                    if (e && e.target && e.target.closest('button, a, input, select, kbd')) return;
                    isPending = true;
                    isDragging = false;
                    startX = clientX;
                    startY = clientY;
                    const rect = widgetEl.getBoundingClientRect();
                    initialLeft = rect.left;
                    initialTop = rect.top;
                    widgetW = rect.width;
                    widgetH = rect.height;
                };

                const onMove = (clientX, clientY, e) => {
                    if (!isPending && !isDragging) return;
                    const dx = clientX - startX;
                    const dy = clientY - startY;

                    if (isPending) {
                        if (Math.hypot(dx, dy) > 4) {
                            isPending = false;
                            isDragging = true;
                            this._hudWasDragged = true;
                            widgetEl.classList.add('hud-widget-dragging');
                            widgetEl.style.position = 'fixed';
                            widgetEl.style.right = 'auto';
                            widgetEl.style.bottom = 'auto';
                            widgetEl.style.margin = '0';
                        } else {
                            return;
                        }
                    }

                    if (isDragging) {
                        if (e && e.cancelable && e.preventDefault) e.preventDefault();
                        const newLeft = initialLeft + dx;
                        const newTop = initialTop + dy;
                        const minX = 4;
                        const maxX = Math.max(4, window.innerWidth - widgetW - 4);
                        const minY = 36;
                        const maxY = Math.max(36, window.innerHeight - widgetH - 4);
                        const clampedX = Math.max(minX, Math.min(newLeft, maxX));
                        const clampedY = Math.max(minY, Math.min(newTop, maxY));

                        widgetEl.style.left = `${clampedX}px`;
                        widgetEl.style.top = `${clampedY}px`;
                    }
                };

                const onEnd = () => {
                    if (isDragging) {
                        widgetEl.classList.remove('hud-widget-dragging');
                        const rect = widgetEl.getBoundingClientRect();
                        const clampedX = Math.max(4, Math.min(rect.left, window.innerWidth - rect.width - 4));
                        const clampedY = Math.max(36, Math.min(rect.top, window.innerHeight - rect.height - 4));
                        const xRatio = clampedX / Math.max(1, window.innerWidth);
                        const yRatio = clampedY / Math.max(1, window.innerHeight);

                        this.saveHudWidgetPosition(id, { xRatio, yRatio });
                        setTimeout(() => {
                            this._hudWasDragged = false;
                        }, 150);
                    }
                    isPending = false;
                    isDragging = false;
                };

                handleEl.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    onStart(e.clientX, e.clientY, e);
                    const onMouseMove = (ev) => onMove(ev.clientX, ev.clientY, ev);
                    const onMouseUp = () => {
                        onEnd();
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    };
                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });

                handleEl.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 1) {
                        onStart(e.touches[0].clientX, e.touches[0].clientY, e);
                    }
                }, { passive: true });

                handleEl.addEventListener('touchmove', (e) => {
                    if ((isPending || isDragging) && e.touches.length === 1) {
                        onMove(e.touches[0].clientX, e.touches[0].clientY, e);
                    }
                }, { passive: false });

                const touchEndHandler = () => onEnd();
                handleEl.addEventListener('touchend', touchEndHandler, { passive: true });
                handleEl.addEventListener('touchcancel', touchEndHandler, { passive: true });

                handleEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this.resetSingleHudWidget(id);
                });

                handleEl.addEventListener('click', (e) => {
                    if (this._hudWasDragged) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }, true);
            });

            this.applySavedHudLayout();

            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                this._wasMobileViewport = window.innerWidth <= 900 || window.innerHeight <= 500;
                const onViewportChange = () => {
                    const isMobileViewport = window.innerWidth <= 900 || window.innerHeight <= 500;
                    const ids = ['touch-controls', 'char-panel', 'hud-center-column', 'minimap-container'];
                    if (isMobileViewport) {
                        this._wasMobileViewport = true;
                        for (const id of ids) {
                            const el = document.getElementById(id);
                            if (!el) continue;
                            el.style.position = '';
                            el.style.left = '';
                            el.style.top = '';
                            el.style.right = '';
                            el.style.bottom = '';
                            el.style.margin = '';
                            if (id === 'touch-controls') {
                                el.classList.remove('dpad-collapsed');
                            }
                        }
                        return;
                    }
                    if (this._wasMobileViewport) {
                        this._wasMobileViewport = false;
                        this.applySavedHudLayout();
                    }
                    for (const id of ids) {
                        const el = document.getElementById(id);
                        if (!el || el.style.position !== 'fixed') continue;
                        const rect = el.getBoundingClientRect();
                        const minX = 4;
                        const maxX = Math.max(4, window.innerWidth - rect.width - 4);
                        const minY = 36;
                        const maxY = Math.max(36, window.innerHeight - rect.height - 4);
                        const curX = parseFloat(el.style.left) || rect.left;
                        const curY = parseFloat(el.style.top) || rect.top;
                        const clampedX = Math.max(minX, Math.min(curX, maxX));
                        const clampedY = Math.max(minY, Math.min(curY, maxY));
                        el.style.left = `${clampedX}px`;
                        el.style.top = `${clampedY}px`;
                    }
                };
                window.addEventListener('resize', onViewportChange);
                window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 60));
            }

            const btnDpadScale = document.getElementById('btn-dpad-scale');
            const touchControls = document.getElementById('touch-controls');
            if (btnDpadScale && touchControls) {
                const scales = [1.0, 1.15, 0.85];
                btnDpadScale.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const curScale = parseFloat(touchControls.style.getPropertyValue('--dpad-scale')) || 1.0;
                    let idx = scales.findIndex(s => Math.abs(s - curScale) < 0.05);
                    if (idx === -1) idx = 0;
                    const nextScale = scales[(idx + 1) % scales.length];
                    touchControls.style.setProperty('--dpad-scale', nextScale);
                    this.saveHudWidgetPosition('touch-controls', { scale: nextScale });
                });
            }

            const btnDpadCollapse = document.getElementById('btn-dpad-collapse');
            if (btnDpadCollapse && touchControls) {
                btnDpadCollapse.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isCollapsed = touchControls.classList.toggle('dpad-collapsed');
                    btnDpadCollapse.textContent = isCollapsed ? '+' : '−';
                    btnDpadCollapse.title = isCollapsed ? 'Expand D-Pad' : 'Minimize / Expand D-Pad';
                    this.saveHudWidgetPosition('touch-controls', { collapsed: isCollapsed });
                });
            }
            const btnDpadClose = document.getElementById('btn-dpad-close');
            if (btnDpadClose && touchControls) {
                btnDpadClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.__dpadVisible = false;
                    touchControls.style.display = 'none';
                    const btnToggleDpad = document.getElementById('btn-toggle-dpad');
                    if (btnToggleDpad) {
                        btnToggleDpad.classList.remove('active');
                        btnToggleDpad.classList.add('panel-off');
                        btnToggleDpad.setAttribute('aria-pressed', 'false');
                    }
                    const btnFooterDpad = document.getElementById('btn-footer-dpad');
                    if (btnFooterDpad) {
                        btnFooterDpad.classList.remove('active');
                        btnFooterDpad.setAttribute('aria-pressed', 'false');
                    }
                    if (window.__app && typeof window.__app.showToast === 'function') {
                        window.__app.showToast('D-Pad Closed (Re-enable via Menu → D-Pad or ↺ Layout)');
                    }
                });
            }

            const btnCharDetails = document.getElementById('btn-char-details-toggle');
            const charDrawer = document.getElementById('char-extended-drawer');
            const charPanelEl = document.getElementById('char-panel');
            if (btnCharDetails && charDrawer) {
                btnCharDetails.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isHidden = charDrawer.classList.toggle('hidden');
                    if (charPanelEl) charPanelEl.classList.toggle('char-details-open', !isHidden);
                    btnCharDetails.textContent = isHidden ? '▾' : '▴';
                    btnCharDetails.setAttribute('aria-expanded', String(!isHidden));
                });
            }
            const charHeaderEl = document.getElementById('char-drag-handle') || document.getElementById('char-panel-header');
            if (charHeaderEl && charPanelEl) {
                let dragStartX = 0, dragStartY = 0;
                charHeaderEl.addEventListener('pointerdown', (e) => { dragStartX = e.clientX || 0; dragStartY = e.clientY || 0; }, { passive: true });
                charHeaderEl.addEventListener('click', (e) => {
                    if (this._hudWasDragged || e.target.closest('button') || Math.hypot((e.clientX || 0) - dragStartX, (e.clientY || 0) - dragStartY) > 5) return;
                    if (typeof window !== 'undefined' && window.innerWidth <= 600) {
                        const open = charPanelEl.classList.toggle('char-details-open');
                        if (charDrawer) charDrawer.classList.toggle('hidden', !open);
                        if (btnCharDetails) { btnCharDetails.textContent = open ? '▴' : '▾'; btnCharDetails.setAttribute('aria-expanded', String(open)); }
                    }
                });
            }

            const btnResetLayout = document.getElementById('btn-hud-reset-layout');
            if (btnResetLayout) {
                btnResetLayout.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.resetHudLayout();
                });
            }
            const btnPauseReset = document.getElementById('btn-pause-reset-hud');
            if (btnPauseReset) {
                btnPauseReset.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.resetHudLayout();
                });
            }
        };

        HudProto.saveHudWidgetPosition = function saveHudWidgetPosition(id, posData) {
            try {
                let layout = {};
                const raw = localStorage.getItem('angband3d_hud_layout_v2');
                if (raw) layout = JSON.parse(raw);
                if (!layout[id]) layout[id] = {};
                Object.assign(layout[id], posData);
                localStorage.setItem('angband3d_hud_layout_v2', JSON.stringify(layout));
            } catch (_) {}
        };

        HudProto.resetSingleHudWidget = function resetSingleHudWidget(id) {
            const el = document.getElementById(id);
            if (el) {
                el.style.position = '';
                el.style.left = '';
                el.style.top = '';
                el.style.right = '';
                el.style.bottom = '';
                el.style.margin = '';
                if (id === 'touch-controls') {
                    el.style.removeProperty('--dpad-scale');
                    el.classList.remove('dpad-collapsed');
                    const btnCol = document.getElementById('btn-dpad-collapse');
                    if (btnCol) {
                        btnCol.textContent = '−';
                        btnCol.title = 'Minimize / Expand D-Pad';
                    }
                }
            }
            try {
                const raw = localStorage.getItem('angband3d_hud_layout_v2');
                if (raw) {
                    const layout = JSON.parse(raw);
                    delete layout[id];
                    localStorage.setItem('angband3d_hud_layout_v2', JSON.stringify(layout));
                }
            } catch (_) {}
        };

        HudProto.applySavedHudLayout = function applySavedHudLayout() {
            const isMobileViewport = typeof window !== 'undefined' && (window.innerWidth <= 900 || window.innerHeight <= 500);
            if (isMobileViewport) {
                const tc = document.getElementById('touch-controls');
                if (tc) tc.classList.remove('dpad-collapsed');
                return;
            }
            let layout = null;
            try {
                const raw = localStorage.getItem('angband3d_hud_layout_v2');
                if (raw) layout = JSON.parse(raw);
            } catch (_) {}
            if (!layout || typeof layout !== 'object') return;

            for (const [id, data] of Object.entries(layout)) {
                const el = document.getElementById(id);
                if (!el || !data) continue;

                if (typeof data.xRatio === 'number' && typeof data.yRatio === 'number') {
                    const rect = el.getBoundingClientRect();
                    const w = rect.width || (id === 'touch-controls' ? 186 : (id === 'char-panel' ? 240 : 100));
                    const h = rect.height || (id === 'touch-controls' ? 180 : 100);
                    const targetX = data.xRatio * window.innerWidth;
                    const targetY = data.yRatio * window.innerHeight;
                    const clampedX = Math.max(4, Math.min(targetX, window.innerWidth - w - 4));
                    const clampedY = Math.max(36, Math.min(targetY, window.innerHeight - h - 4));

                    el.style.position = 'fixed';
                    el.style.left = `${clampedX}px`;
                    el.style.top = `${clampedY}px`;
                    el.style.right = 'auto';
                    el.style.bottom = 'auto';
                    el.style.margin = '0';
                }

                if (id === 'touch-controls') {
                    if (typeof data.scale === 'number') {
                        el.style.setProperty('--dpad-scale', data.scale);
                    }
                    if (data.collapsed) {
                        el.classList.add('dpad-collapsed');
                        const btnCol = document.getElementById('btn-dpad-collapse');
                        if (btnCol) {
                            btnCol.textContent = '+';
                            btnCol.title = 'Expand D-Pad';
                        }
                    }
                }
            }
        };

        HudProto.resetHudLayout = function resetHudLayout() {
            try {
                localStorage.removeItem('angband3d_hud_layout_v2');
                localStorage.removeItem('angband_map_pos');
                localStorage.removeItem('angband_map_size');
                localStorage.removeItem('angband_msg_pos');
                localStorage.removeItem('angband_msg_size');
                localStorage.removeItem('angband_chronicle_pos');
                localStorage.removeItem('angband_chronicle_size');
                localStorage.removeItem('angband_char_size');
                localStorage.removeItem('angband_deck_size');
            } catch (_) {}

            const allWidgets = [
                'touch-controls',
                'char-panel',
                'hud-center-column',
                'action-bar',
                'minimap-container',
                'message-feed-window',
                'chronicle-window'
            ];

            if (typeof window !== 'undefined') {
                window.__minimapClosed = false;
                window.__messageLogClosed = false;
            }
            for (const id of allWidgets) {
                const el = document.getElementById(id);
                if (!el) continue;
                el.style.position = ''; el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = '';
                el.style.width = ''; el.style.height = ''; el.style.margin = '';
                if (id === 'minimap-container' || id === 'message-feed-window' || id === 'char-panel' || id === 'action-bar') el.style.display = '';
                el.style.removeProperty('--char-panel-w');
                el.classList.remove('hud-widget-dragging', 'window-minimized', 'hud-panel-hidden');
            }
            this.applyMinimapSize();
            for (const bId of ['btn-minimap-minimize', 'btn-msg-minimize', 'btn-char-minimize', 'btn-action-bar-minimize']) {
                const b = document.getElementById(bId);
                if (b) b.textContent = '−';
            }
            for (const tId of ['btn-toggle-hero', 'btn-toggle-actions', 'btn-toggle-minimap', 'btn-toggle-msg-feed']) {
                const t = document.getElementById(tId);
                if (t) { t.classList.remove('panel-off'); t.classList.add('active', 'is-panel-open'); t.setAttribute('aria-pressed', 'true'); }
            }

            const hasTouch = Boolean((typeof window !== 'undefined' && window.DeviceProfile && typeof window.DeviceProfile.getTier === 'function' && window.DeviceProfile.getTier() !== 'desktop') || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
            const touchControls = document.getElementById('touch-controls');
            if (touchControls) {
                window.__dpadVisible = hasTouch;
                window.__dpadUserVisible = false;
                if (document.body && document.body.classList) document.body.classList.remove('force-dpad-visible');
                touchControls.style.display = hasTouch ? 'flex' : 'none';
                touchControls.style.removeProperty('--dpad-scale');
                touchControls.classList.remove('dpad-collapsed');
            }
            const btnToggleDpad = document.getElementById('btn-toggle-dpad');
            if (btnToggleDpad) {
                btnToggleDpad.classList.toggle('active', hasTouch);
                btnToggleDpad.classList.toggle('panel-off', !hasTouch);
                btnToggleDpad.setAttribute('aria-pressed', hasTouch ? 'true' : 'false');
            }
            const btnFooterDpad = document.getElementById('btn-footer-dpad');
            if (btnFooterDpad) {
                btnFooterDpad.classList.toggle('active', hasTouch);
                btnFooterDpad.setAttribute('aria-pressed', hasTouch ? 'true' : 'false');
            }
            const btnDpadCollapse = document.getElementById('btn-dpad-collapse');
            if (btnDpadCollapse) { btnDpadCollapse.textContent = '−'; btnDpadCollapse.title = 'Minimize / Expand D-Pad'; }
            if (typeof window !== 'undefined' && window.__app && typeof window.__app.updateViewMode === 'function') {
                window.__app.updateViewMode();
            }
            this.showToast('HUD Layout Reset to Default');
        };

        HudProto.setDockPreset = function setDockPreset(preset) {
            const VALID = ['full', 'compact', 'wasd'];
            let target = preset;
            if (!VALID.includes(target)) {
                try {
                    if (typeof localStorage !== 'undefined') {
                        const saved = localStorage.getItem('angband3d_dock_preset');
                        if (VALID.includes(saved)) target = saved;
                    }
                } catch (_) {}
            }
            if (!VALID.includes(target)) {
                target = 'full';
            }

            this.dockPreset = target;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('angband3d_dock_preset', target);
                }
            } catch (_) {}

            const actionBar = document.getElementById('action-bar');
            if (actionBar) {
                actionBar.dataset.dockPreset = target;
                actionBar.classList.remove('dock-preset-full', 'dock-preset-compact', 'dock-preset-wasd');
                actionBar.classList.add('dock-preset-' + target);

                const wasdActive = Boolean(
                    target === 'wasd' ||
                    (window.__app && window.__app.input && window.__app.input.wasdMode) ||
                    (typeof localStorage !== 'undefined' && localStorage.getItem('angband3d_wasd_mode') === '1')
                );

                const wasdSockets = ['btn-wield', 'btn-drop', 'btn-aim', 'btn-search'];
                const nonCore = ['btn-door', 'btn-pickup', 'btn-equipment', 'btn-browse', 'btn-study', 'btn-quests'];

                for (const id of [...nonCore, ...wasdSockets]) {
                    const btn = document.getElementById(id);
                    if (btn && btn.dataset && btn.dataset.dockHidden) {
                        delete btn.dataset.dockHidden;
                        if (btn.style && btn.style.display === 'none' && !btn.dataset.contextHidden && !btn.dataset.realmHidden) {
                            btn.style.display = '';
                        }
                    }
                }

                const cluster = document.getElementById('wasd-shadow-cluster');
                if (cluster) cluster.style.display = wasdActive ? 'flex' : 'none';
            }

            if (typeof window !== 'undefined' && typeof window.__updateActionBarOverflow === 'function') {
                window.__updateActionBarOverflow();
            }
            return target;
        };

        HudProto.onCameraTurn = function onCameraTurn(yaw) {
            this.currentCameraYaw = yaw;
            this.updateFooterFacing(yaw);
            if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
                this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], yaw);
                this.updateReticleTargetCard(this.lastFrame);
            }
            const p = this.lastFrame && this.lastFrame.player;
            const titleEl = this._minimapTitleEl || (typeof document !== 'undefined' && (this._minimapTitleEl = document.getElementById('minimap-title-text')));
            if (titleEl && p && p.x !== undefined && p.y !== undefined) {
                const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
                const sectorNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                const sectorArrows = ['▲', '↗', '►', '↘', '▼', '↙', '◄', '↖'];
                const arrowChar = sectorArrows[sector] || '▲';
                const facingName = sectorNames[sector] || 'N';
                const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                const lang = window.__langMode || 'en';
                const mmTitleSig = `${realm}:${lang}:${p.x}:${p.y}:${arrowChar}:${facingName}`;
                if (this._lastMmTitleSig !== mmTitleSig) {
                    this._lastMmTitleSig = mmTitleSig;
                    const prefix = (realm === 'hengband' && lang === 'jp') ? '地図' : ((realm === 'hengband' && lang === 'bilingual') ? 'MAP (地図)' : 'MAP');
                    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    titleEl.innerHTML = `<span style="white-space:nowrap;">${esc(prefix)} (${p.x},${p.y})</span> <span style="color:#ffd700; white-space:nowrap;">[${esc(arrowChar)} ${esc(facingName)}]</span>`;
                }
            }
        };

        HudProto.updateFooterFacing = function updateFooterFacing(yaw) {
            if (!this.footerFacing) return;
            const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
            const lang = window.__langMode || 'en';
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const facingSig = `${sector}:${realm}:${lang}`;
            if (this._lastFacingSig === facingSig) return;
            this._lastFacingSig = facingSig;
            const sectorNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            const sectorArrows = ['▲', '↗', '►', '↘', '▼', '↙', '◄', '↖'];
            const sectorKanji = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
            const dirName = sectorNames[sector] || 'N', dirArrow = sectorArrows[sector] || '▲', dirKanji = sectorKanji[sector] || '北';
            if (realm === 'hengband' && lang === 'jp') {
                this.footerFacing.textContent = `🧭 ${dirKanji}`;
                this.footerFacing.title = `視線方向: ${dirKanji} (${dirArrow})`;
            } else if (realm === 'hengband' && lang === 'bilingual') {
                this.footerFacing.textContent = `🧭 ${dirName} (${dirKanji})`;
                this.footerFacing.title = `Camera Facing: ${dirName} (${dirKanji}) [${dirArrow}]`;
            } else {
                this.footerFacing.textContent = `🧭 ${dirName}`;
                this.footerFacing.title = `Camera Facing: ${dirName} (${dirArrow})`;
            }
        };
    }

    root.HudLayout = { attach: attachHudLayout };
    if (root.WebHUD) {
        attachHudLayout(root.WebHUD);
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { attach: attachHudLayout };
    }
})(typeof window !== 'undefined' ? window : globalThis);

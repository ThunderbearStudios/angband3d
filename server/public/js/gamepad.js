(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GamepadController = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** Maps (x, y) stick coordinates to 8-way numpad '1'..'9'; snaps diagonals when diagonalLock is true. */
    function stickToSector(x, y, deadzone = 0.28, diagonalLock = false) {
        if (Math.hypot(x, y) < deadzone) return null;
        let deg = (Math.atan2(y, x) * 180 / Math.PI) + 90;
        if (deg < 0) deg += 360;
        return diagonalLock ? ['9', '3', '1', '7'][Math.floor(deg / 90) % 4] : ['8', '9', '6', '3', '2', '1', '4', '7'][Math.floor(((deg + 22.5) % 360) / 45)];
    }

    const BUTTON_INTENT_MAP = {
        0: (more) => ({ id: 'confirm', action: 'confirm', key: more ? 'space' : 'enter', description: more ? 'Advance (-more-)' : 'Confirm' }),
        1: () => ({ id: 'back', action: 'back', key: 'escape', description: 'Back / Cancel' }),
        2: () => ({ id: 'item_sheet', action: 'item_sheet', key: 'Alt+I', shortcut: 'Alt+I', description: 'Item Sheet' }),
        3: () => ({ id: 'radial_menu', action: 'radial_toggle', description: 'Radial Menu Toggle' }),
        4: () => ({ id: 'target_prev', action: 'target_prev', key: '-', description: 'Previous Target' }),
        5: () => ({ id: 'target_next', action: 'target_next', key: '*', altKey: 't', description: 'Next Target' }),
        6: () => ({ id: 'diagonal_lock', action: 'diagonal_lock', quasimode: true, description: 'Diagonal Lock (Shiren)' }),
        7: () => ({ id: 'smart_action', action: 'smart_action', key: 'space', description: 'Smart Action' }),
        8: () => ({ id: 'terminal_toggle', action: 'terminal_toggle', key: 'tab', description: 'Classic Terminal Toggle' }),
        9: () => ({ id: 'command_palette', action: 'command_palette', key: 'Ctrl+K', shortcut: 'Ctrl+K', description: 'Command Palette' }),
        10: () => ({ id: 'toggle_run', action: 'toggle_run', key: 'Alt+R', description: 'Toggle Run Mode' }),
        11: () => ({ id: 'camera_reset', action: 'camera_reset', key: 'Home', description: 'Reset Camera / Explore' }),
        12: (_, menu) => ({ id: 'dpad_up', action: menu ? 'menu_up' : 'move_north', key: menu ? 'ArrowUp' : '8', direction: 8, description: menu ? 'Menu Up' : 'Move North' }),
        13: (_, menu) => ({ id: 'dpad_down', action: menu ? 'menu_down' : 'move_south', key: menu ? 'ArrowDown' : '2', direction: 2, description: menu ? 'Menu Down' : 'Move South' }),
        14: (_, menu) => ({ id: 'dpad_left', action: menu ? 'menu_left' : 'move_west', key: menu ? 'ArrowLeft' : '4', direction: 4, description: menu ? 'Menu Left' : 'Move West' }),
        15: (_, menu) => ({ id: 'dpad_right', action: menu ? 'menu_right' : 'move_east', key: menu ? 'ArrowRight' : '6', direction: 6, description: menu ? 'Menu Right' : 'Move East' })
    };

    function mapButtonToIntent(buttonIndex, context = {}) {
        const fn = BUTTON_INTENT_MAP[buttonIndex];
        if (!fn) return null;
        const isMore = Boolean(context && (context.more || context.isMore));
        const inMenu = Boolean(context && (context.inMenu || context.isMenu || context.menuActive || context.inPrompt));
        return fn(isMore, inMenu);
    }

    class GamepadController {
        constructor(options = {}) {
            this.options = options; this.deadzone = options.deadzone || 0.28; this.diagonalLock = false;
            this._running = false; this._rafId = null; this._lastButtons = []; this._stickRepeatTimer = 0; this._lastStickDir = null;
            this._boundPoll = this._poll.bind(this); this._boundConnected = this._onConnected.bind(this); this._boundDisconnected = this._onDisconnected.bind(this);
            this._setupDeviceListeners();
        }
        _setupDeviceListeners() {
            if (typeof window === 'undefined') return;
            window.addEventListener('gamepadconnected', this._boundConnected);
            window.addEventListener('gamepaddisconnected', this._boundDisconnected);
            window.addEventListener('keydown', () => this.setInputDevice('keyboard'), { passive: true });
            window.addEventListener('pointerdown', (e) => this.setInputDevice(e.pointerType === 'touch' ? 'touch' : 'pointer'), { passive: true });
        }
        setInputDevice(device) {
            if (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.inputDevice !== device) {
                document.body.dataset.inputDevice = device;
            }
        }
        _onConnected() {
            this.setInputDevice('gamepad');
            if (!this._running) { this._running = true; this._rafId = requestAnimationFrame(this._boundPoll); }
        }
        _onDisconnected() {
            if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
            const any = Array.from(navigator.getGamepads() || []).some(Boolean);
            if (!any && this._running) { this._running = false; if (this._rafId) cancelAnimationFrame(this._rafId); this._rafId = null; }
        }
        _poll() {
            if (!this._running) return;
            if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
                const pad = Array.from(navigator.getGamepads() || []).find((p) => p && p.connected);
                if (pad) this._processPad(pad);
            }
            this._rafId = requestAnimationFrame(this._boundPoll);
        }

        _topOverlay() {
            if (typeof document === 'undefined') return null;
            const ids = ['ryod-forge-modal', 'command-palette-modal', 'guide-modal', 'help-modal', 'realm-selector-modal', 'demo-modal', 'pwa-modal', 'load-modal', 'death-modal', 'pause-modal', 'main-menu-overlay', 'splash-overlay', 'splash-screen'];
            return ids.map((id) => document.getElementById(id)).find((el) => el && !el.classList.contains('hidden') && el.style.display !== 'none' && (typeof getComputedStyle !== 'function' || getComputedStyle(el).display !== 'none')) || null;
        }
        _cycleFocus(ov, delta) {
            if (!ov || typeof document === 'undefined') return;
            const els = Array.from(ov.querySelectorAll('button:not(:disabled), select, input:not([type="hidden"]), a[href], [role="button"][tabindex="0"]'))
                .filter((el) => el.getClientRects().length > 0 && !el.closest('.hidden, details:not([open])'));
            if (!els.length) return;
            const idx = els.indexOf(document.activeElement);
            const next = els[idx === -1 ? (delta > 0 ? 0 : els.length - 1) : (idx + delta + els.length) % els.length];
            if (next) { next.focus(); next.scrollIntoView?.({ block: 'nearest' }); }
        }
        _handleUiIntent(ov, intent) {
            if (!intent || typeof window === 'undefined') return;
            if (intent.id === 'confirm') {
                if (!ov || ov.id === 'splash-overlay' || ov.id === 'splash-screen') {
                    if (window.__app?.enterFromSplash) window.__app.enterFromSplash();
                    else if (window.__app?.showMainMenu) window.__app.showMainMenu();
                    else ov?.querySelector('#btn-splash-start')?.click();
                } else if (document.activeElement && ov.contains(document.activeElement) && document.activeElement.click) document.activeElement.click();
                else { const t = ov.querySelector('.menu-option-btn.selected') || ov.querySelector('button:not(:disabled), select, input:not([type="hidden"]), a[href]'); t?.focus(); t?.click(); }
            } else if (intent.id === 'back') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
            else if (intent.id === 'dpad_up' || intent.id === 'dpad_left') this._cycleFocus(ov, -1);
            else if (intent.id === 'dpad_down' || intent.id === 'dpad_right') this._cycleFocus(ov, 1);
        }

        _liveContext() {
            if (typeof window === 'undefined') return {};
            const app = window.__app || {};
            const f = app.lastFrame || null;
            const ui = (f && f.ui) || {};
            const cmdEl = typeof document !== 'undefined' ? document.getElementById('command-palette-modal') : null;
            const inMenu = Boolean(
                this._topOverlay() || (app.getAppState && app.getAppState() !== 'game') ||
                (window.ItemSheet && typeof window.ItemSheet.isOpen === 'function' && window.ItemSheet.isOpen()) ||
                (window.radialMenu && window.radialMenu.isOpen) ||
                (cmdEl && !cmdEl.classList.contains('hidden')) ||
                (typeof document !== 'undefined' && document.body && document.body.classList.contains('terminal-mode-active')) ||
                (ui.overlay || 0) > 0 || (f && f.phase && f.phase !== 'play')
            );
            return Object.assign({}, app.screenContext || {}, { more: Boolean(ui.more), inMenu });
        }

        _processPad(pad) {
            this.setInputDevice('gamepad');
            this.diagonalLock = Boolean(pad.buttons[6] && pad.buttons[6].pressed);
            const ov = this._topOverlay();
            const isUiMode = Boolean(ov || (typeof window !== 'undefined' && ((window.ItemSheet && typeof window.ItemSheet.isOpen === 'function' && window.ItemSheet.isOpen()) || (window.__app && typeof window.__app.getAppState === 'function' && window.__app.getAppState() !== 'game'))));
            const context = this.options.getContext ? this.options.getContext() : this._liveContext();
            if (isUiMode && !context.inMenu) context.inMenu = true;
            const rad = typeof window !== 'undefined' ? window.radialMenu : null;

            for (let b = 0; b < pad.buttons.length; b++) {
                const isDown = pad.buttons[b] ? pad.buttons[b].pressed : false;
                const wasDown = Boolean(this._lastButtons[b]);
                this._lastButtons[b] = isDown;
                if (!isDown && wasDown && b === 3 && !isUiMode && rad && rad.isOpen && rad.mode === 'hold') {
                    if (rad.selectedIndex !== null) rad.selectWedge(rad.selectedIndex); else rad.close();
                } else if (isDown && !wasDown && b !== 6) {
                    const qsMap = { 12: 0, 15: 1, 13: 2, 14: 3 };
                    if (!isUiMode && this.diagonalLock && qsMap[b] !== undefined && typeof window !== 'undefined' && window.__app?.input?.quickActions) {
                        const qa = window.__app.input.quickActions, r = window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband';
                        qa.executeSlot(qsMap[b], window.__app.lastFrame, r);
                        continue;
                    }
                    const intent = mapButtonToIntent(b, context);
                    if (intent) {
                        if (typeof this.options.onIntent === 'function') this.options.onIntent(intent);
                        else if (isUiMode) this._handleUiIntent(ov, intent);
                        else this.handleIntent(intent);
                    }
                }
            }

            const rx = pad.axes ? (pad.axes[2] || 0) : 0, ry = pad.axes ? (pad.axes[3] || 0) : 0;
            if (!isUiMode && Math.hypot(rx, ry) > 0.18 && typeof window !== 'undefined' && window.__app && window.__app.dungeon && (!rad || !rad.isOpen)) {
                window.__app.dungeon.rotateFreelook(-rx * 0.048, -ry * 0.032);
                if (window.__app.input && typeof window.__app.input.syncCompass === 'function') window.__app.input.syncCompass();
            }

            const sx = pad.axes ? (pad.axes[0] || 0) : 0, sy = pad.axes ? (pad.axes[1] || 0) : 0;
            if (!isUiMode && rad && rad.isOpen && typeof rad.highlightFromStick === 'function') {
                rad.setRing(this.diagonalLock ? 1 : 0);
                rad.highlightFromStick(sx, sy);
                return;
            }
            const sector = stickToSector(sx, sy, this.deadzone, this.diagonalLock);
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            if (sector) {
                if (sector !== this._lastStickDir || now > this._stickRepeatTimer) {
                    this._stickRepeatTimer = now + (sector !== this._lastStickDir ? 230 : 115);
                    this._lastStickDir = sector;
                    if (typeof this.options.onDirection === 'function') this.options.onDirection(sector);
                    else if (isUiMode) this._cycleFocus(ov, (sector === '8' || sector === '4' || sector === '7') ? -1 : 1);
                    else this.handleDirection(sector);
                }
            } else {
                this._lastStickDir = null;
                this._stickRepeatTimer = 0;
            }
        }

        handleIntent(intent) {
            if (!intent || typeof window === 'undefined') return;
            if (window.YasdPrimitives?.handleExtendedGamepadIntent?.(intent, { diagonalLock: this.diagonalLock })) return;
            if (window.radialMenu && window.radialMenu.isOpen) {
                if (intent.id === 'confirm' && window.radialMenu.selectedIndex !== null) { window.radialMenu.selectWedge(window.radialMenu.selectedIndex); return; }
                if (intent.id === 'back') { window.radialMenu.close(); return; }
            }
            if (intent.id === 'radial_menu' && window.radialMenu) { window.radialMenu.toggle(); return; }
            if (intent.id === 'item_sheet') {
                if (window.__app && typeof window.__app.toggleItemSheet === 'function') window.__app.toggleItemSheet();
                else if (window.ItemSheet && typeof window.ItemSheet.toggle === 'function') window.ItemSheet.toggle(window.__app && window.__app.lastFrame, window.__app && window.__app.getActiveRealm && window.__app.getActiveRealm());
                return;
            }
            if (window.ItemSheet && typeof window.ItemSheet.isOpen === 'function' && window.ItemSheet.isOpen() && intent.key) {
                const k = intent.key === 'escape' ? 'Escape' : (intent.key === 'enter' ? 'Enter' : (intent.key === 'tab' ? 'Tab' : intent.key));
                if (window.ItemSheet.handleKeyDown({ key: k, preventDefault() {} })) return;
            }
            if (intent.id === 'command_palette' && window.CommandPalette) {
                const modal = typeof document !== 'undefined' ? document.getElementById('command-palette-modal') : null;
                if (modal && !modal.classList.contains('hidden')) window.CommandPalette.hide();
                else window.CommandPalette.show((window.__app && window.__app.getAppState && window.__app.getAppState()) || 'game');
                return;
            }
            if (intent.id === 'terminal_toggle') {
                if (window.RealmGrimoireDeck?._menuActive) { window.RealmGrimoireDeck.toggleMode(); window.__app?.updateTerminalToolbar?.(); }
                else window.__app?.toggleTerminalView?.();
                return;
            }
            if (intent.id === 'back') {
                const cmdModal = typeof document !== 'undefined' ? document.getElementById('command-palette-modal') : null;
                if (cmdModal && !cmdModal.classList.contains('hidden') && window.CommandPalette) { window.CommandPalette.hide(); return; }
            }
            if (intent.id === 'smart_action' && window.__app?.input?.executeSmartAction) { window.__app.input.executeSmartAction(window.__app.input.smartAction || 'wait'); return; }
            if (intent.key && window.__app?.network?.sendKey) {
                const keyToSend = intent.key === 'space' ? ' ' : (intent.key === 'enter' ? 'enter' : (intent.key === 'escape' ? 'escape' : intent.key));
                window.__app.network.sendKey(keyToSend);
            }
        }
        handleDirection(sector) {
            if (!sector || typeof window === 'undefined') return;
            if (window.__app?.input?.handleRelativeDirection) window.__app.input.handleRelativeDirection(parseInt(sector, 10));
            else window.__app?.network?.sendKey?.(sector);
        }
        destroy() {
            this._running = false;
            if (this._rafId) cancelAnimationFrame(this._rafId);
            if (typeof window !== 'undefined') { window.removeEventListener('gamepadconnected', this._boundConnected); window.removeEventListener('gamepaddisconnected', this._boundDisconnected); }
        }
    }
    GamepadController.stickToSector = stickToSector;
    GamepadController.mapButtonToIntent = mapButtonToIntent;
    return GamepadController;
}));

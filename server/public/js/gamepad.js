/**
 * gamepad.js — Angband3D Gamepad Controller (WS42.7)
 * Implements standard Gamepad API polling, stick sector snapping, button mapping,
 * LT diagonal lock quasimode (Shiren), and input-adaptive glyph switching (Law C9).
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GamepadController = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Maps (x, y) stick coordinates to 8-way numpad direction '1'..'9'.
     * Returns null inside deadzone. Snaps to diagonals '7','9','1','3' when diagonalLock is true.
     */
    function stickToSector(x, y, deadzone = 0.28, diagonalLock = false) {
        const mag = Math.hypot(x, y);
        if (mag < deadzone) return null;

        let deg = (Math.atan2(y, x) * 180 / Math.PI) + 90;
        if (deg < 0) deg += 360;

        if (diagonalLock) {
            return ['9', '3', '1', '7'][Math.floor(deg / 90) % 4];
        }
        return ['8', '9', '6', '3', '2', '1', '4', '7'][Math.floor(((deg + 22.5) % 360) / 45)];
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

        _liveContext() {
            if (typeof window === 'undefined') return {};
            const app = window.__app || {};
            const f = app.lastFrame || null;
            const ui = (f && f.ui) || {};
            const cmdEl = typeof document !== 'undefined' ? document.getElementById('command-palette-modal') : null;
            const inMenu = Boolean(
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
            const context = this.options.getContext ? this.options.getContext() : this._liveContext();
            const rad = typeof window !== 'undefined' ? window.radialMenu : null;

            for (let b = 0; b < pad.buttons.length; b++) {
                const isDown = pad.buttons[b] ? pad.buttons[b].pressed : false;
                const wasDown = Boolean(this._lastButtons[b]);
                this._lastButtons[b] = isDown;
                if (!isDown && wasDown && b === 3 && rad && rad.isOpen && rad.mode === 'hold') {
                    if (rad.selectedIndex !== null) rad.selectWedge(rad.selectedIndex); else rad.close();
                } else if (isDown && !wasDown && b !== 6) {
                    const intent = mapButtonToIntent(b, context);
                    if (intent) {
                        if (typeof this.options.onIntent === 'function') this.options.onIntent(intent);
                        else this.handleIntent(intent);
                    }
                }
            }

            const rx = pad.axes ? (pad.axes[2] || 0) : 0, ry = pad.axes ? (pad.axes[3] || 0) : 0;
            if (Math.hypot(rx, ry) > 0.18 && typeof window !== 'undefined' && window.__app && window.__app.dungeon && (!rad || !rad.isOpen)) {
                window.__app.dungeon.rotateFreelook(-rx * 0.048, -ry * 0.032);
                if (window.__app.input && typeof window.__app.input.syncCompass === 'function') window.__app.input.syncCompass();
            }

            const sx = pad.axes ? (pad.axes[0] || 0) : 0, sy = pad.axes ? (pad.axes[1] || 0) : 0;
            if (rad && rad.isOpen && typeof rad.highlightFromStick === 'function') {
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
                    else this.handleDirection(sector);
                }
            } else {
                this._lastStickDir = null;
                this._stickRepeatTimer = 0;
            }
        }

        handleIntent(intent) {
            if (!intent || typeof window === 'undefined') return;
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
                if (window.RealmGrimoireDeck && window.RealmGrimoireDeck._menuActive) {
                    window.RealmGrimoireDeck.toggleMode();
                    if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') window.__app.updateTerminalToolbar();
                } else if (window.__app && typeof window.__app.toggleTerminalView === 'function') {
                    window.__app.toggleTerminalView();
                }
                return;
            }
            if (intent.id === 'back') {
                const cmdModal = typeof document !== 'undefined' ? document.getElementById('command-palette-modal') : null;
                if (cmdModal && !cmdModal.classList.contains('hidden') && window.CommandPalette) { window.CommandPalette.hide(); return; }
            }
            if (intent.key && window.__app && window.__app.network && typeof window.__app.network.sendKey === 'function') {
                const keyToSend = intent.key === 'space' ? ' ' : (intent.key === 'enter' ? 'enter' : (intent.key === 'escape' ? 'escape' : intent.key));
                window.__app.network.sendKey(keyToSend);
            }
        }

        handleDirection(sector) {
            if (!sector || typeof window === 'undefined') return;
            if (window.__app && window.__app.input && typeof window.__app.input.handleRelativeDirection === 'function') {
                window.__app.input.handleRelativeDirection(parseInt(sector, 10));
            } else if (window.__app && window.__app.network && typeof window.__app.network.sendKey === 'function') {
                window.__app.network.sendKey(sector);
            }
        }

        destroy() {
            this._running = false;
            if (this._rafId) cancelAnimationFrame(this._rafId);
            if (typeof window !== 'undefined') {
                window.removeEventListener('gamepadconnected', this._boundConnected);
                window.removeEventListener('gamepaddisconnected', this._boundDisconnected);
            }
        }
    }

    GamepadController.stickToSector = stickToSector;
    GamepadController.mapButtonToIntent = mapButtonToIntent;

    return GamepadController;
}));

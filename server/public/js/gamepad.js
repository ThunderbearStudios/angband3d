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
            this.options = options;
            this.deadzone = options.deadzone || 0.28;
            this.diagonalLock = false;
            this._running = false;
            this._rafId = null;
            this._lastButtons = [];
            this._stickRepeatTimer = 0;
            this._lastStickDir = null;
            this._boundPoll = this._poll.bind(this);
            this._boundConnected = this._onConnected.bind(this);
            this._boundDisconnected = this._onDisconnected.bind(this);

            this._setupDeviceListeners();
        }

        _setupDeviceListeners() {
            if (typeof window === 'undefined') return;
            window.addEventListener('gamepadconnected', this._boundConnected);
            window.addEventListener('gamepaddisconnected', this._boundDisconnected);
            window.addEventListener('keydown', () => this.setInputDevice('keyboard'), { passive: true });
            window.addEventListener('pointerdown', (e) => {
                this.setInputDevice(e.pointerType === 'touch' ? 'touch' : 'pointer');
            }, { passive: true });
        }

        setInputDevice(device) {
            if (typeof document !== 'undefined' && document.body && document.body.dataset) {
                if (document.body.dataset.inputDevice !== device) {
                    document.body.dataset.inputDevice = device;
                }
            }
        }

        _onConnected() {
            this.setInputDevice('gamepad');
            if (!this._running) {
                this._running = true;
                this._rafId = requestAnimationFrame(this._boundPoll);
            }
        }

        _onDisconnected() {
            if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
            const pads = navigator.getGamepads();
            let any = false;
            for (let i = 0; i < pads.length; i++) {
                if (pads[i]) { any = true; break; }
            }
            if (!any && this._running) {
                this._running = false;
                if (this._rafId) cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
        }

        _poll() {
            if (!this._running) return;
            if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
                const pads = navigator.getGamepads();
                for (let i = 0; i < pads.length; i++) {
                    const pad = pads[i];
                    if (pad && pad.connected) {
                        this._processPad(pad);
                        break;
                    }
                }
            }
            this._rafId = requestAnimationFrame(this._boundPoll);
        }

        _processPad(pad) {
            this.setInputDevice('gamepad');
            this.diagonalLock = Boolean(pad.buttons[6] && pad.buttons[6].pressed);

            const context = this.options.getContext ? this.options.getContext() : (typeof window !== 'undefined' && window.__app && window.__app.screenContext ? window.__app.screenContext : {});
            for (let b = 0; b < pad.buttons.length; b++) {
                const isDown = pad.buttons[b] ? pad.buttons[b].pressed : false;
                const wasDown = Boolean(this._lastButtons[b]);
                this._lastButtons[b] = isDown;
                if (isDown && !wasDown && b !== 6) {
                    const intent = mapButtonToIntent(b, context);
                    if (intent) {
                        if (typeof this.options.onIntent === 'function') this.options.onIntent(intent);
                        else this.handleIntent(intent);
                    }
                }
            }

            const sx = pad.axes ? (pad.axes[0] || 0) : 0;
            const sy = pad.axes ? (pad.axes[1] || 0) : 0;
            const sector = stickToSector(sx, sy, this.deadzone, this.diagonalLock);
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            if (sector) {
                if (sector !== this._lastStickDir || now > this._stickRepeatTimer) {
                    this._stickRepeatTimer = now + (sector !== this._lastStickDir ? 250 : 120);
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
            if (!intent) return;
            if (intent.id === 'radial_menu' && typeof window !== 'undefined' && window.radialMenu) {
                window.radialMenu.toggle();
                return;
            }
            if (intent.key && typeof window !== 'undefined' && window.__app && window.__app.network && typeof window.__app.network.sendKey === 'function') {
                const keyToSend = intent.key === 'space' ? ' ' : (intent.key === 'enter' ? '\r' : (intent.key === 'escape' ? '\x1b' : intent.key));
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

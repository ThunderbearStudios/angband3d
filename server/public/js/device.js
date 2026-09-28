/**
 * Angband3D Device & Responsive Profile Engine
 * Dynamically detects device tier (desktop, tablet, phone), orientation, and touch capabilities.
 * Manages responsive classes on <html>, safe area metrics, and haptic feedback.
 */

class DeviceProfile {
    static BREAKPOINT_TABLET = 1024;
    static BREAKPOINT_PHONE = 600;

    static _listeners = new Set();
    static _currentTier = 'desktop';
    static _isPortrait = false;
    static _hasTouch = false;
    static _resizeRaf = null;

    static init() {
        this._hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
        this.update();

        window.addEventListener('resize', () => this._onResize(), { passive: true });
        window.addEventListener('orientationchange', () => this._onResize(), { passive: true });

        // Listen for pointer change (e.g. tablet docking/undocking keyboard or switching modes)
        try {
            const pointerQuery = window.matchMedia('(pointer: coarse)');
            if (pointerQuery && pointerQuery.addEventListener) {
                pointerQuery.addEventListener('change', (e) => {
                    this._hasTouch = e.matches || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                    this.update();
                });
            }
        } catch (_) {}
    }

    static getTier() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const minDim = Math.min(w, h);
        const isCoarse = window.matchMedia('(pointer: coarse)').matches;

        // Phones: screen's short dimension is < 600px (covers all phones portrait or landscape)
        if (minDim < this.BREAKPOINT_PHONE) {
            return 'phone';
        }

        // Large desktop or touch screens
        if (w >= this.BREAKPOINT_TABLET) {
            // Very large touch devices (e.g. iPad Pro 12.9" in landscape)
            if (isCoarse && w < 1366) return 'tablet';
            return 'desktop';
        }

        // Tablets: 600px <= minDim < 1024px
        return 'tablet';
    }

    static isPortrait() {
        return window.innerHeight > window.innerWidth;
    }

    static hasTouch() {
        return this._hasTouch;
    }

    static update() {
        const prevTier = this._currentTier;
        const prevPortrait = this._isPortrait;

        this._currentTier = this.getTier();
        this._isPortrait = this.isPortrait();

        // Update <html> root classes for seamless CSS targeting
        const root = document.documentElement;
        root.classList.remove('device-desktop', 'device-tablet', 'device-phone', 'is-portrait', 'is-landscape', 'has-touch');

        root.classList.add(`device-${this._currentTier}`);
        root.classList.add(this._isPortrait ? 'is-portrait' : 'is-landscape');
        if (this._hasTouch) root.classList.add('has-touch');

        const state = {
            tier: this._currentTier,
            isPortrait: this._isPortrait,
            hasTouch: this._hasTouch,
            width: window.innerWidth,
            height: window.innerHeight
        };

        if (prevTier !== this._currentTier || prevPortrait !== this._isPortrait) {
            for (const fn of this._listeners) {
                try {
                    fn(state);
                } catch (err) {
                    console.error('[DeviceProfile] Error in listener:', err);
                }
            }
        }

        return state;
    }

    static _onResize() {
        if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(() => {
            this.update();
            this._resizeRaf = null;
        });
    }

    static addListener(fn) {
        if (typeof fn === 'function') {
            this._listeners.add(fn);
            // Immediately execute with current state
            fn({
                tier: this._currentTier,
                isPortrait: this._isPortrait,
                hasTouch: this._hasTouch,
                width: window.innerWidth,
                height: window.innerHeight
            });
        }
    }

    static removeListener(fn) {
        this._listeners.delete(fn);
    }

    /**
     * Named haptic feedback profiles
     */
    static triggerHaptic(type = 'light') {
        const patterns = {
            light: 10,
            medium: 18,
            heavy: [25, 30, 25],
            warning: [30, 40, 30]
        };
        this.vibrate(patterns[type] || 12);
    }

    /**
     * Tactile micro-haptic pulse for button presses and combat impacts.
     * Safely ignored on devices without vibration motors.
     */
    static vibrate(pattern = 12) {
        try {
            if (this._hasTouch && typeof navigator.vibrate === 'function') {
                navigator.vibrate(pattern);
            }
        } catch (_) {}
    }
}

// Auto-initialize on load
DeviceProfile.init();
window.DeviceProfile = DeviceProfile;

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
    static _gpuProfile = null;

    static detectGpuProfile(glOrCanvasOrString) {
        if (typeof window !== 'undefined' && window.Dungeon3DLightmap && window.Dungeon3DLightmap.HardwareGpuProfile) {
            this._gpuProfile = window.Dungeon3DLightmap.HardwareGpuProfile.detect(glOrCanvasOrString);
        } else {
            let rendererName = typeof glOrCanvasOrString === 'string' ? glOrCanvasOrString : 'Unknown WebGL Renderer';
            try {
                if (!glOrCanvasOrString && typeof document !== 'undefined') {
                    const c = document.createElement('canvas');
                    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
                    if (gl) {
                        const dbg = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
                        rendererName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || rendererName);
                    }
                }
            } catch (_) {}
            const isIntegrated = /(Intel\(R\)\s*(UHD|HD|Iris)|Intel\s*(UHD|HD|Iris)|Radeon\(TM\)\s*Vega|Mali-|Adreno|PowerVR|Apple\s*GPU|SwiftShader|Basic\s*Render)/i.test(rendererName);
            this._gpuProfile = isIntegrated
                ? { gpuTier: 'integrated', rendererName, dprCap: 1.0, antialias: false, farDistance: 60, fogDensity: 0.018, maxPointLights: 1, enableFillLight: false, proceduralTexSize: 256, nameplatePoolCap: 64 }
                : { gpuTier: 'discrete', rendererName, dprCap: 1.5, antialias: true, farDistance: 105, fogDensity: 0.009, maxPointLights: 2, enableFillLight: true, proceduralTexSize: 512, nameplatePoolCap: 64 };
        }
        try {
            if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.remove('gpu-integrated', 'gpu-discrete');
                document.documentElement.classList.add(`gpu-${this._gpuProfile.gpuTier}`);
            }
        } catch (_) {}
        return this._gpuProfile;
    }

    static getRenderBudget(glOrCanvasOrString) {
        const tier = this.getTier();
        const gpu = (glOrCanvasOrString || !this._gpuProfile)
            ? this.detectGpuProfile(glOrCanvasOrString)
            : this._gpuProfile;
        if (gpu.gpuTier === 'integrated' || tier === 'phone') {
            return {
                tier,
                gpuTier: gpu.gpuTier,
                rendererName: gpu.rendererName,
                dprCap: 1.0,
                antialias: false,
                farDistance: 60,
                fogDensity: 0.018,
                maxPointLights: 1,
                enableFillLight: false,
                proceduralTexSize: 256,
                nameplatePoolCap: 64
            };
        }
        return {
            tier,
            gpuTier: gpu.gpuTier,
            rendererName: gpu.rendererName,
            dprCap: tier === 'tablet' ? Math.min(1.5, gpu.dprCap) : gpu.dprCap,
            antialias: gpu.antialias,
            farDistance: tier === 'tablet' ? Math.min(95, gpu.farDistance) : gpu.farDistance,
            fogDensity: tier === 'tablet' ? 0.012 : gpu.fogDensity,
            maxPointLights: gpu.maxPointLights,
            enableFillLight: gpu.enableFillLight,
            proceduralTexSize: gpu.proceduralTexSize,
            anisotropy: gpu.anisotropy || 4,
            fullPbrMaps: Boolean(gpu.fullPbrMaps),
            nameplatePoolCap: gpu.nameplatePoolCap || 96
        };
    }

    /**
     * Pure-Web Universal Viewport & Orientation Matrix (`getViewportLayoutMatrix`).
     * Classifies any browser client into one of 6 ergonomic layout states so the Sovereign Web UI
     * scales across desktop ultrawides, laptops, tablets, foldables, and phones in portrait or landscape.
     */
    static getViewportLayoutMatrix(width, height, hasTouch) {
        const w = Number(width != null ? width : (typeof window !== 'undefined' ? window.innerWidth : 1280)) || 1280;
        const h = Number(height != null ? height : (typeof window !== 'undefined' ? window.innerHeight : 720)) || 720;
        const touch = Boolean(hasTouch != null ? hasTouch : this._hasTouch);
        const isPortrait = h > w;
        const minDim = Math.min(w, h);

        let layoutId = 'desktop-standard';
        let grimoirePlacement = 'center-overlay';
        let viewportSplitRatio = 1.0;
        let minTouchTargetPx = touch ? 44 : 32;

        if (minDim < this.BREAKPOINT_PHONE) {
            if (isPortrait) {
                layoutId = 'phone-portrait';
                grimoirePlacement = 'bottom-sheet';
                viewportSplitRatio = 0.52;
            } else {
                layoutId = 'phone-landscape';
                grimoirePlacement = 'compact-drawer';
                viewportSplitRatio = 0.65;
            }
            minTouchTargetPx = 44;
        } else if (w < this.BREAKPOINT_TABLET || (touch && w < 1366)) {
            if (isPortrait) {
                layoutId = 'tablet-portrait';
                grimoirePlacement = 'bottom-dock';
                viewportSplitRatio = 0.58;
            } else {
                layoutId = 'tablet-landscape';
                grimoirePlacement = 'side-dock';
                viewportSplitRatio = 0.68;
            }
            minTouchTargetPx = 44;
        } else if (w >= 1600 && !isPortrait) {
            layoutId = 'desktop-ultrawide';
            grimoirePlacement = 'three-pane-sanctum';
            viewportSplitRatio = 0.75;
        }

        return {
            layoutId,
            width: w,
            height: h,
            isPortrait,
            isLandscape: !isPortrait,
            hasTouch: touch,
            grimoirePlacement,
            viewportSplitRatio,
            minTouchTargetPx,
            usesDynamicViewportHeight: true,
            respectsSafeAreaInsets: true
        };
    }

    static init() {
        this._hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
        this.detectGpuProfile();
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

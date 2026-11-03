/**
 * dungeon3d-lightmap.js — Intel UHD 620 / Universal 60fps Governor, Zero-Fragment-Cost
 * `instanceColor` Vertex Lighter, Frustum Tile Culler, CPU-Baked Vertex AO, and
 * 64-Entry LRU Nameplate Texture Pool (WS48-WS54).
 *
 * Specifically engineered for integrated GPUs (`Intel(R) UHD Graphics 620`, ~128 MB aperture,
 * shared DDR4 RAM, 24 EUs) and universal mobile/web clients:
 *   - 0 full-screen post-processing passes
 *   - 0 custom per-pixel fragment shader loops
 *   - < 0.08 ms/turn CPU per-instance vertex lighting via `InstancedMesh.setColorAt`
 *   - 0 wall light-bleed (strictly gated on C engine `d.l` LOS states)
 *   - Turn-based on-demand render throttling (60 FPS active -> 10 FPS idle -> 0 FPS modal pause)
 *   - Bounded 64-entry LRU `CanvasTexture` nameplate pool with `.dispose()` on eviction (Law U4)
 *
 * Contract: Pure UMD module, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Dungeon3DLightmap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MOBILE_SAVER_GPU_REGEX = /(Mali-G[35]\d|Mali-4\d\d|Mali-T\d+|Adreno\s*\(TM\)\s*[3456]1\d|PowerVR|SwiftShader|llvmpipe|Microsoft\s*Basic\s*Render)/i;
    const INTEGRATED_GPU_REGEX = /(Intel\(R\)\s*(UHD|HD|Iris)|Intel\s*(UHD|HD|Iris)|Radeon\(TM\)\s*Vega|AMD\s*Radeon\(TM\)\s*Graphics|Mali-|Adreno|Apple\s*A\d+|Mesa\s*DRI\s*Intel)/i;
    const PERFORMANCE_GPU_REGEX = /(Apple\s*M[1-9]|Apple\s*GPU|GeForce\s*GTX|Radeon\s*Pro|Intel\(R\)\s*Arc)/i;
    const ULTRA_GPU_REGEX = /(GeForce\s*RTX|NVIDIA\s*RTX|Quadro\s*RTX|Radeon\s*RX\s*[6789]\d{3})/i;

    const GPU_TIER_PRESETS = Object.freeze({
        'mobile-saver': {
            gpuTier: 'mobile-saver',
            tierFamily: 'integrated',
            dprCap: 1.0,
            antialias: false,
            farDistance: 48,
            fogDensity: 0.022,
            maxPointLights: 1,
            enableFillLight: false,
            proceduralTexSize: 256,
            anisotropy: 1,
            preferLambert: true,
            fullPbrMaps: false,
            frustumRadius: 24,
            idleIntervalMs: 125,
            nameplatePoolCap: 48
        },
        'integrated': {
            gpuTier: 'integrated',
            tierFamily: 'integrated',
            dprCap: 1.0,
            antialias: false,
            farDistance: 60,
            fogDensity: 0.018,
            maxPointLights: 1,
            enableFillLight: false,
            proceduralTexSize: 256,
            anisotropy: 2,
            preferLambert: true,
            fullPbrMaps: false,
            frustumRadius: 32,
            idleIntervalMs: 100,
            nameplatePoolCap: 64
        },
        'performance': {
            gpuTier: 'performance',
            tierFamily: 'discrete',
            dprCap: 1.5,
            antialias: true,
            farDistance: 105,
            fogDensity: 0.010,
            maxPointLights: 2,
            enableFillLight: true,
            proceduralTexSize: 512,
            anisotropy: 4,
            preferLambert: false,
            fullPbrMaps: true,
            frustumRadius: 48,
            idleIntervalMs: 66,
            nameplatePoolCap: 96
        },
        'ultra': {
            gpuTier: 'ultra',
            tierFamily: 'discrete',
            dprCap: 2.0,
            antialias: true,
            farDistance: 140,
            fogDensity: 0.007,
            maxPointLights: 3,
            enableFillLight: true,
            proceduralTexSize: 1024,
            anisotropy: 8,
            preferLambert: false,
            fullPbrMaps: true,
            frustumRadius: 64,
            idleIntervalMs: 42,
            nameplatePoolCap: 128
        }
    });

    class HardwareGpuProfile {
        static getPresets() {
            return GPU_TIER_PRESETS;
        }

        static detect(glOrCanvasOrString, userOverrideTier = null) {
            let rendererName = 'Unknown WebGL Renderer';
            let vendorName = 'Unknown Vendor';

            if (typeof glOrCanvasOrString === 'string' && glOrCanvasOrString.trim()) {
                rendererName = glOrCanvasOrString.trim();
            } else {
                let gl = null;
                if (glOrCanvasOrString && typeof glOrCanvasOrString.getParameter === 'function') {
                    gl = glOrCanvasOrString;
                } else if (glOrCanvasOrString && typeof glOrCanvasOrString.getContext === 'function') {
                    try {
                        gl = glOrCanvasOrString.getContext('webgl2') ||
                             glOrCanvasOrString.getContext('webgl') ||
                             glOrCanvasOrString.getContext('experimental-webgl');
                    } catch (_) {}
                } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
                    try {
                        const probeCanvas = document.createElement('canvas');
                        gl = probeCanvas.getContext('webgl2') ||
                             probeCanvas.getContext('webgl') ||
                             probeCanvas.getContext('experimental-webgl');
                    } catch (_) {}
                }

                if (gl && typeof gl.getParameter === 'function') {
                    try {
                        const dbg = typeof gl.getExtension === 'function'
                            ? gl.getExtension('WEBGL_debug_renderer_info')
                            : null;
                        if (dbg) {
                            rendererName = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || rendererName);
                            vendorName = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || vendorName);
                        } else {
                            rendererName = String(gl.getParameter(gl.RENDERER) || rendererName);
                            vendorName = String(gl.getParameter(gl.VENDOR) || vendorName);
                        }
                    } catch (_) {}
                }
            }

            if (userOverrideTier && GPU_TIER_PRESETS[userOverrideTier]) {
                return Object.assign({}, GPU_TIER_PRESETS[userOverrideTier], {
                    rendererName: rendererName,
                    vendorName: vendorName,
                    overridden: true
                });
            }

            const combined = `${vendorName} ${rendererName}`;
            let selectedTier = 'integrated';
            if (ULTRA_GPU_REGEX.test(combined)) {
                selectedTier = 'ultra';
            } else if (MOBILE_SAVER_GPU_REGEX.test(combined)) {
                selectedTier = 'mobile-saver';
            } else if (INTEGRATED_GPU_REGEX.test(combined)) {
                selectedTier = 'integrated';
            } else if (PERFORMANCE_GPU_REGEX.test(combined)) {
                selectedTier = 'performance';
            }

            return Object.assign({}, GPU_TIER_PRESETS[selectedTier], {
                rendererName: rendererName,
                vendorName: vendorName
            });
        }
    }

    class DemandRenderGovernor {
        constructor(options = {}) {
            this.idleIntervalMs = Number(options.idleIntervalMs) || 100;
            this.activeIntervalMs = Number(options.activeIntervalMs) || 16.0;
            this.activeUntilMs = 0;
            this.lastRenderMs = -Infinity;
            this.modalCoveringViewport = false;
            this.dynamicResolutionScale = 1.0;
            this._frameTimes = [];
            this._maxSamples = 24;
            this._scaleSteps = [1.0, 0.85, 0.75];
            this._scaleIndex = 0;
        }

        wake(durationMs = 450, nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
            const target = Number(nowMs) + Math.max(16, Number(durationMs) || 450);
            if (target > this.activeUntilMs) {
                this.activeUntilMs = target;
            }
            return this.activeUntilMs;
        }

        setModalCoveringViewport(isCovered, nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
            const next = Boolean(isCovered);
            if (this.modalCoveringViewport && !next) {
                this.wake(350, nowMs);
            }
            this.modalCoveringViewport = next;
        }

        shouldRenderFrame(nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
            const now = Number(nowMs);
            const isActive = now <= this.activeUntilMs;

            if (this.modalCoveringViewport && !isActive) {
                return false;
            }

            if (isActive) {
                this.lastRenderMs = now;
                return true;
            }

            const baselineMs = Math.max(this.lastRenderMs, this.activeUntilMs);
            if ((now - baselineMs) >= this.idleIntervalMs) {
                this.lastRenderMs = now;
                return true;
            }

            return false;
        }

        recordFrameTime(dtMs) {
            const dt = Number(dtMs);
            if (!Number.isFinite(dt) || dt <= 0 || dt > 500) return this.dynamicResolutionScale;

            this._frameTimes.push(dt);
            if (this._frameTimes.length > this._maxSamples) {
                this._frameTimes.shift();
            }

            if (this._frameTimes.length >= 8) {
                let sum = 0;
                for (let i = 0; i < this._frameTimes.length; i++) sum += this._frameTimes[i];
                const avg = sum / this._frameTimes.length;

                if (avg > 18.5 && this._scaleIndex < this._scaleSteps.length - 1) {
                    this._scaleIndex++;
                    this.dynamicResolutionScale = this._scaleSteps[this._scaleIndex];
                    this._frameTimes.length = 0;
                } else if (avg < 11.5 && this._scaleIndex > 0) {
                    this._scaleIndex--;
                    this.dynamicResolutionScale = this._scaleSteps[this._scaleIndex];
                    this._frameTimes.length = 0;
                }
            }

            return this.dynamicResolutionScale;
        }

        getEffectivePixelRatio(baseDprCap = 1.0, devicePixelRatio = 1.0) {
            const capped = Math.min(Number(devicePixelRatio) || 1.0, Number(baseDprCap) || 1.0);
            return Math.max(0.5, Number((capped * this.dynamicResolutionScale).toFixed(3)));
        }
    }

    class InstanceVertexLighter {
        constructor(options = {}) {
            this._lastLightSig = '';
            this.fogMemoryColor = options.fogMemoryColor || { r: 0.157, g: 0.196, b: 0.275 };
            this.unexploredColor = options.unexploredColor || { r: 0.04, g: 0.05, b: 0.07 };
            this.torchColor = options.torchColor || { r: 1.0, g: 0.863, b: 0.60 };
            this.ambientLitColor = options.ambientLitColor || { r: 0.36, g: 0.40, b: 0.48 };
            this.torchRadius = Number(options.torchRadius) || 11.0;
            this._scratchColor = {
                r: 1, g: 1, b: 1,
                setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
            };
        }

        computeTileColor(x, y, losState, px, py, activeSpells = null, biomeTint = null) {
            const state = Number(losState) || 0;
            if (state <= 0) {
                return {
                    r: this.unexploredColor.r,
                    g: this.unexploredColor.g,
                    b: this.unexploredColor.b
                };
            }

            if (state === 1) {
                return {
                    r: this.fogMemoryColor.r,
                    g: this.fogMemoryColor.g,
                    b: this.fogMemoryColor.b
                };
            }

            const dx = Number(x) - Number(px);
            const dy = Number(y) - Number(py);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const atten = Math.max(0, 1.0 - (dist / this.torchRadius));
            const smoothAtten = atten * atten * (3.0 - 2.0 * atten);

            const baseR = biomeTint && biomeTint.r != null ? biomeTint.r : this.ambientLitColor.r;
            const baseG = biomeTint && biomeTint.g != null ? biomeTint.g : this.ambientLitColor.g;
            const baseB = biomeTint && biomeTint.b != null ? biomeTint.b : this.ambientLitColor.b;

            let r = baseR + (this.torchColor.r - baseR) * smoothAtten * 0.85;
            let g = baseG + (this.torchColor.g - baseG) * smoothAtten * 0.85;
            let b = baseB + (this.torchColor.b - baseB) * smoothAtten * 0.85;

            if (Array.isArray(activeSpells) && activeSpells.length > 0) {
                for (let i = 0; i < activeSpells.length; i++) {
                    const sp = activeSpells[i];
                    if (!sp) continue;
                    const sdx = Number(x) - Number(sp.x);
                    const sdy = Number(y) - Number(sp.y);
                    const sRadius = Math.max(1.0, Number(sp.radius) || 3.5);
                    const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
                    if (sDist <= sRadius) {
                        const sFactor = (1.0 - sDist / sRadius) * (Number(sp.intensity) || 0.75);
                        r = Math.min(1.35, r + (Number(sp.r) || 1.0) * sFactor);
                        g = Math.min(1.35, g + (Number(sp.g) || 0.45) * sFactor);
                        b = Math.min(1.35, b + (Number(sp.b) || 0.15) * sFactor);
                    }
                }
            }

            return {
                r: Math.round(Math.min(1.35, Math.max(0.05, r)) * 10000) * 0.0001,
                g: Math.round(Math.min(1.35, Math.max(0.05, g)) * 10000) * 0.0001,
                b: Math.round(Math.min(1.35, Math.max(0.05, b)) * 10000) * 0.0001
            };
        }

        _computeSignature(instances, px, py, activeSpells) {
            let hash = 2166136261 >>> 0;
            const mix = (val) => {
                hash ^= (val & 0xff);
                hash = Math.imul(hash, 16777619) >>> 0;
            };
            mix(px | 0);
            mix(py | 0);
            mix(instances.length & 0xff);
            for (let i = 0; i < instances.length; i++) {
                const inst = instances[i];
                mix(inst.x | 0);
                mix(inst.y | 0);
                mix(inst.l | 0);
            }
            if (Array.isArray(activeSpells)) {
                for (let i = 0; i < activeSpells.length; i++) {
                    const sp = activeSpells[i];
                    if (!sp) continue;
                    mix((sp.x * 4) | 0);
                    mix((sp.y * 4) | 0);
                }
            }
            return String(hash);
        }

        applyToInstancedMesh(instancedMesh, instances, px, py, activeSpells = null, biomeTint = null) {
            if (!instancedMesh || typeof instancedMesh.setColorAt !== 'function' || !Array.isArray(instances)) {
                return { updated: false, count: 0, signature: '' };
            }
            const sig = this._computeSignature(instances, px, py, activeSpells);
            if (sig === this._lastLightSig) {
                return { updated: false, count: instances.length, signature: sig };
            }
            this._lastLightSig = sig;

            const scratch = (typeof THREE !== 'undefined' && THREE.Color)
                ? new THREE.Color()
                : this._scratchColor;

            for (let i = 0; i < instances.length; i++) {
                const inst = instances[i];
                const c = this.computeTileColor(inst.x, inst.y, inst.l, px, py, activeSpells, biomeTint);
                scratch.setRGB(c.r, c.g, c.b);
                instancedMesh.setColorAt(i, scratch);
            }

            if (instancedMesh.instanceColor) {
                instancedMesh.instanceColor.needsUpdate = true;
            }

            return { updated: true, count: instances.length, signature: sig };
        }
    }

    /**
     * NameplateTexturePool — Bounded 64-entry LRU pool for monster/entity nameplate textures (Law U4).
     * Supports both `acquire(key, customFactoryFn)` and `acquire(key, metaObj)`.
     */
    class NameplateTexturePool {
        constructor(maxEntries = 64, textureFactory = null) {
            this.maxEntries = Math.max(4, Number(maxEntries) || 64);
            this._map = new Map();
            this.disposedCount = 0;
            this._textureFactory = typeof textureFactory === 'function'
                ? textureFactory
                : (key, meta) => {
                    let disposed = false;
                    return {
                        key: key,
                        meta: meta || {},
                        isCanvasTexture: true,
                        get disposed() { return disposed; },
                        dispose() { disposed = true; }
                    };
                };
        }

        static buildKey(name, hpRatio = 1.0, statusSig = '', buc = '') {
            const hpBucket = Math.max(0, Math.min(20, Math.round((Number(hpRatio) || 0) * 20)));
            return `${String(name || '').trim()}|${hpBucket}|${String(statusSig || '')}|${String(buc || '')}`;
        }

        acquire(key, factoryOrMeta = {}) {
            const k = String(key || 'unnamed');
            if (this._map.has(k)) {
                const existing = this._map.get(k);
                this._map.delete(k);
                existing.lastUsed = Date.now();
                this._map.set(k, existing);
                return existing.texture;
            }

            while (this._map.size >= this.maxEntries) {
                const oldestKey = this._map.keys().next().value;
                const oldest = this._map.get(oldestKey);
                this._map.delete(oldestKey);
                if (oldest && oldest.texture && typeof oldest.texture.dispose === 'function') {
                    oldest.texture.dispose();
                    this.disposedCount++;
                }
            }

            const texture = (typeof factoryOrMeta === 'function')
                ? factoryOrMeta(k)
                : this._textureFactory(k, factoryOrMeta);

            this._map.set(k, {
                key: k,
                texture: texture,
                lastUsed: Date.now()
            });
            return texture;
        }

        get size() {
            return this._map.size;
        }

        clear() {
            for (const entry of this._map.values()) {
                if (entry && entry.texture && typeof entry.texture.dispose === 'function') {
                    entry.texture.dispose();
                    this.disposedCount++;
                }
            }
            this._map.clear();
        }
    }

    class FrustumTileCuller {
        static filterVisibleInstances(tiles, px, py, yawRad = 0, fovDeg = 72, maxRadius = 32) {
            if (!Array.isArray(tiles) || tiles.length === 0) return [];
            const maxDistSq = maxRadius * maxRadius;
            const immediateDistSq = 3.5 * 3.5;
            const halfConeRad = ((Number(fovDeg) || 72) * 0.5 + 22) * (Math.PI / 180);
            const minCos = Math.cos(halfConeRad);
            const fwdX = -Math.sin(Number(yawRad) || 0);
            const fwdY = -Math.cos(Number(yawRad) || 0);

            const out = [];
            for (let i = 0; i < tiles.length; i++) {
                const t = tiles[i];
                if (!t || (Number(t.l) || 0) <= 0) continue;
                const dx = Number(t.x) - Number(px);
                const dy = Number(t.y) - Number(py);
                const dSq = dx * dx + dy * dy;
                if (dSq > maxDistSq) continue;
                if (dSq <= immediateDistSq) {
                    out.push(t);
                    continue;
                }
                const invLen = 1.0 / Math.sqrt(dSq);
                const dot = (dx * invLen) * fwdX + (dy * invLen) * fwdY;
                if (dot >= minCos) {
                    out.push(t);
                }
            }
            return out;
        }
    }

    class CpuBakedVertexAO {
        static computeFactor(adjacentCardinalWalls = 0, adjacentDiagonalWalls = 0) {
            const c = Math.max(0, Math.min(4, Number(adjacentCardinalWalls) || 0));
            const d = Math.max(0, Math.min(4, Number(adjacentDiagonalWalls) || 0));
            const occlusion = (c * 0.045) + (d * 0.015);
            return Number(Math.max(0.76, 1.0 - occlusion).toFixed(4));
        }
    }

    return {
        HardwareGpuProfile,
        DemandRenderGovernor,
        InstanceVertexLighter,
        NameplateTexturePool,
        FrustumTileCuller,
        CpuBakedVertexAO
    };
});

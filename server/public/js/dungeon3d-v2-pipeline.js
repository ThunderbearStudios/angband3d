/**
 * dungeon3d-v2-pipeline.js
 *
 * Wave 4B Three.js v2 (r187+) GPU pipeline helpers behind YASD_FLAGS.RENDERER_THREE_V2:
 *   1. GPU-compressed KTX2 / BasisU PolyHaven PBR loader with automatic r128/JPG fallback
 *   2. Per-biome 128x64 PMREM IBL reflection generator (bounded 8-entry LRU + .dispose())
 *   3. Restored physical glTF extensions (KHR_materials_specular / emissive_strength / ior / clearcoat)
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.Dungeon3DV2Pipeline = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const POLYHAVEN_KTX2_RE = /\/assets\/polyhaven\/textures\/([^/?#]+)\/(diff|nor_gl|arm)\.jpg(?:\?([^#]*))?$/i;
    const PMREM_LRU_CAP = 8;

    const BIOME_PMREM_PRESETS = Object.freeze({
        town_western:  { skyTop: [0.06, 0.11, 0.24], horizon: [0.34, 0.36, 0.44], ground: [0.14, 0.11, 0.08], keyWarm: [1.00, 0.72, 0.36], fillCool: [0.38, 0.56, 0.92] },
        town_eastern:  { skyTop: [0.08, 0.09, 0.20], horizon: [0.46, 0.29, 0.26], ground: [0.15, 0.11, 0.09], keyWarm: [1.00, 0.66, 0.34], fillCool: [0.56, 0.48, 0.88] },
        catacombs:     { skyTop: [0.07, 0.09, 0.15], horizon: [0.18, 0.20, 0.26], ground: [0.10, 0.08, 0.07], keyWarm: [0.98, 0.68, 0.30], fillCool: [0.24, 0.34, 0.54] },
        volcanic:      { skyTop: [0.14, 0.04, 0.03], horizon: [0.42, 0.14, 0.05], ground: [0.22, 0.06, 0.02], keyWarm: [1.15, 0.46, 0.10], fillCool: [0.44, 0.16, 0.08] },
        frost:         { skyTop: [0.08, 0.16, 0.30], horizon: [0.28, 0.46, 0.64], ground: [0.10, 0.16, 0.22], keyWarm: [0.76, 0.88, 1.00], fillCool: [0.26, 0.62, 0.96] },
        swamp:         { skyTop: [0.05, 0.12, 0.09], horizon: [0.18, 0.28, 0.18], ground: [0.08, 0.11, 0.07], keyWarm: [0.74, 0.86, 0.42], fillCool: [0.18, 0.48, 0.38] },
        sanctuary:     { skyTop: [0.10, 0.11, 0.20], horizon: [0.34, 0.32, 0.28], ground: [0.16, 0.14, 0.11], keyWarm: [1.05, 0.84, 0.48], fillCool: [0.46, 0.58, 0.84] },
        abyss:         { skyTop: [0.07, 0.04, 0.14], horizon: [0.22, 0.10, 0.32], ground: [0.09, 0.04, 0.12], keyWarm: [0.88, 0.34, 0.92], fillCool: [0.26, 0.48, 0.88] }
    });

    function getThree() {
        return (root && root.THREE) || (typeof THREE !== 'undefined' ? THREE : null);
    }

    function getCompat() {
        return (root && root.Dungeon3DCompat) || (typeof Dungeon3DCompat !== 'undefined' ? Dungeon3DCompat : null);
    }

    function toKtx2Url(url) {
        if (!url || typeof url !== 'string') return null;
        if (!POLYHAVEN_KTX2_RE.test(url)) return null;
        return url.replace(/\.(jpg|jpeg|png)(\?[^#]*)?$/i, '.ktx2$2');
    }

    function ensureKtx2Loader(d3d) {
        const T = getThree();
        const compat = getCompat();
        if (!T || !compat || !compat.isV2(T) || typeof T.KTX2Loader !== 'function') return null;
        if (!d3d || !d3d.renderer) return null;
        if (d3d._ktx2Loader) return d3d._ktx2Loader;
        if (d3d._ktx2LoaderFailed) return null;

        try {
            const mgr = (typeof d3d._getAssetLoadingManager === 'function') ? d3d._getAssetLoadingManager() : undefined;
            const loader = new T.KTX2Loader(mgr);
            const basisPath = (root && typeof root.__assetUrl === 'function') ? '/assets/basis/' : '/assets/basis/';
            loader.setTranscoderPath(basisPath);
            loader.detectSupport(d3d.renderer);
            d3d._ktx2Loader = loader;
            return loader;
        } catch (err) {
            d3d._ktx2LoaderFailed = true;
            return null;
        }
    }

    function loadTexture(d3d, fallbackLoader, url, onLoad, isColorHint) {
        const resolvedUrl = (root && typeof root.__assetUrl === 'function') ? root.__assetUrl(url) : url;
        const isColor = (isColorHint !== undefined) ? Boolean(isColorHint) : /\/diff\.(?:jpg|png|webp|ktx2)|BaseColor/i.test(url);
        const ktxUrl = toKtx2Url(resolvedUrl);
        const ktxLoader = ktxUrl ? ensureKtx2Loader(d3d) : null;

        const runFallback = (resolve) => {
            if (!fallbackLoader || typeof fallbackLoader.load !== 'function') {
                resolve(null);
                return;
            }
            fallbackLoader.load(resolvedUrl, (tex) => {
                try { if (onLoad) onLoad(tex); } catch (_) {}
                resolve(tex);
            }, undefined, () => resolve(null));
        };

        return new Promise((resolve) => {
            if (!ktxLoader || !ktxUrl) {
                runFallback(resolve);
                return;
            }
            ktxLoader.load(ktxUrl, (tex) => {
                if (!tex) {
                    runFallback(resolve);
                    return;
                }
                tex._isKtx2 = true;
                tex._sharedTexture = true;
                const compat = getCompat();
                if (compat) compat.setTextureColorSpace(tex, isColor);
                try { if (onLoad) onLoad(tex); } catch (_) {}
                resolve(tex);
            }, undefined, () => {
                runFallback(resolve);
            });
        });
    }

    function resolveBiomePmremKey(biome, outdoors, realm, depth) {
        const r = String(realm || '').toLowerCase();
        const name = String((biome && (biome.id || biome.ryodBiome || biome.biomeId || biome.name)) || '').toLowerCase();
        if (outdoors) {
            return (r === 'hengband' || r === 'frogcomposband' || /eastern|sengoku/.test(name))
                ? 'town_eastern'
                : 'town_western';
        }
        if (/volcan|magma|lava|gehennom|hell|angband_deep|morgoth|inferno/.test(name) || Number(depth) >= 65) return 'volcanic';
        if (/frost|ice|glacier|cocytus|winter/.test(name)) return 'frost';
        if (/swamp|mire|bog|lair|fung|marsh/.test(name)) return 'swamp';
        if (/sanct|temple|hall|vault|palace|silq/.test(name) || r === 'silq') return 'sanctuary';
        if (/abyss|void|pandemonium|chaos|zot|astral/.test(name) || Number(depth) >= 40) return 'abyss';
        return 'catacombs';
    }

    function syncBiomePmrem(d3d, biome, outdoors, realm, depth) {
        const T = getThree();
        if (!d3d || !d3d.scene || !d3d.renderer || !T || typeof T.PMREMGenerator !== 'function') return null;
        const key = resolveBiomePmremKey(biome, outdoors, realm, depth);
        if (d3d._activePmremKey === key && d3d.scene.environment) return key;

        if (!d3d._biomePmremCache) d3d._biomePmremCache = new Map();
        const cache = d3d._biomePmremCache;
        let envRT = cache.get(key);
        if (!envRT) {
            if (cache.size >= PMREM_LRU_CAP) {
                const oldestKey = cache.keys().next().value;
                const evicted = cache.get(oldestKey);
                cache.delete(oldestKey);
                if (evicted && typeof evicted.dispose === 'function') {
                    try { evicted.dispose(); } catch (_) {}
                }
            }
            const pal = BIOME_PMREM_PRESETS[key] || BIOME_PMREM_PRESETS.catacombs;
            const ew = 128;
            const eh = 64;
            const envData = new Uint8Array(ew * eh * 4);
            for (let y = 0; y < eh; y++) {
                const v = y / (eh - 1);
                const skyMix = Math.max(0, 1.0 - v * 2.0);
                const gndMix = Math.max(0, (v - 0.5) * 2.0);
                const eqBand = Math.exp(-Math.pow((v - 0.5) * 4.2, 2));
                for (let x = 0; x < ew; x++) {
                    const u = x / ew;
                    const theta = u * Math.PI * 2.0;
                    const warmLobe = Math.pow(Math.max(0, Math.cos(theta - 0.7)), 3.0) * Math.exp(-Math.pow((v - 0.48) * 3.4, 2));
                    const coolLobe = Math.pow(Math.max(0, Math.cos(theta + 2.4)), 2.5) * Math.exp(-Math.pow((v - 0.44) * 3.6, 2));
                    const idx = (y * ew + x) * 4;
                    for (let c = 0; c < 3; c++) {
                        const base = pal.horizon[c] * eqBand + pal.skyTop[c] * skyMix + pal.ground[c] * gndMix;
                        const val = base + pal.keyWarm[c] * warmLobe * 0.72 + pal.fillCool[c] * coolLobe * 0.44;
                        envData[idx + c] = Math.min(255, Math.max(0, Math.round(val * 255)));
                    }
                    envData[idx + 3] = 255;
                }
            }
            const eqTex = new T.DataTexture(envData, ew, eh, T.RGBAFormat);
            eqTex.mapping = T.EquirectangularReflectionMapping;
            const compat = getCompat();
            if (compat) compat.setTextureColorSpace(eqTex, true);
            else if (typeof T.sRGBEncoding !== 'undefined') eqTex.encoding = T.sRGBEncoding;
            eqTex.needsUpdate = true;

            try {
                const pmremGen = new T.PMREMGenerator(d3d.renderer);
                if (typeof pmremGen.compileEquirectangularShader === 'function') pmremGen.compileEquirectangularShader();
                envRT = pmremGen.fromEquirectangular(eqTex);
                if (envRT && envRT.texture) envRT.texture._sharedTexture = true;
                eqTex.dispose();
                pmremGen.dispose();
                cache.set(key, envRT);
            } catch (_) {
                eqTex.dispose();
                return null;
            }
        } else {
            // Refresh LRU order
            cache.delete(key);
            cache.set(key, envRT);
        }

        if (envRT && envRT.texture) {
            d3d.scene.environment = envRT.texture;
            d3d._activePmremKey = key;
            const compat = getCompat();
            if (compat && compat.isV2(T) && 'environmentIntensity' in d3d.scene) {
                d3d.scene.environmentIntensity = outdoors ? 0.92 : 0.84;
            }
        }
        return key;
    }

    function preservePhysicalMaterial(m) {
        if (!m) return;
        const compat = getCompat();
        const isV2 = Boolean(compat && compat.isV2());
        const hasPhysicalExt = Boolean(
            (m.ior !== undefined && m.ior > 1.52) ||
            (m.clearcoat !== undefined && m.clearcoat > 0.05) ||
            (m.specularIntensity !== undefined && m.specularIntensity > 0.5 && isV2) ||
            (m.emissiveIntensity !== undefined && m.emissiveIntensity > 1.0)
        );
        if (!hasPhysicalExt && m.roughness !== undefined && m.roughness < 0.24) {
            m.roughness = 0.28;
        }
        if (isV2 && m.isMeshPhysicalMaterial) {
            if (m.envMapIntensity === undefined || m.envMapIntensity === 0) m.envMapIntensity = 1.0;
        }
    }

    function dispose(d3d) {
        if (!d3d) return;
        if (d3d._biomePmremCache && typeof d3d._biomePmremCache.values === 'function') {
            for (const rt of d3d._biomePmremCache.values()) {
                if (rt && typeof rt.dispose === 'function') {
                    try { rt.dispose(); } catch (_) {}
                }
            }
            d3d._biomePmremCache.clear();
        }
        if (d3d._ktx2Loader && typeof d3d._ktx2Loader.dispose === 'function') {
            try { d3d._ktx2Loader.dispose(); } catch (_) {}
        }
        d3d._ktx2Loader = null;
        d3d._activePmremKey = null;
    }

    return {
        POLYHAVEN_KTX2_RE,
        PMREM_LRU_CAP,
        BIOME_PMREM_PRESETS,
        toKtx2Url,
        ensureKtx2Loader,
        loadTexture,
        resolveBiomePmremKey,
        syncBiomePmrem,
        preservePhysicalMaterial,
        dispose
    };
});

/**
 * dungeon3d-three-compat.js
 *
 * Dual-runtime compatibility bridge allowing YASD 3D's rendering code to run identically
 * on both legacy Three.js r128 (vendor/three.min.js) and modern Three.js r187+ ESM
 * (vendor/three-v2-entry.js) behind window.YASD_FLAGS.RENDERER_THREE_V2.
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.Dungeon3DCompat = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const getThree = (threeRef) => threeRef || (root && root.THREE) || (typeof THREE !== 'undefined' ? THREE : null);

    // Physical lighting recalibration factors for Three r155+ (useLegacyLights removed, /PI Lambert diffuse):
    // ambient/hemi/directional scale by PI; point/spot also compensate for distance decay in r187 vs r128.
    const LIGHT_SCALE = {
        ambient: Math.PI,
        hemi: Math.PI,
        directional: Math.PI,
        point: Math.PI * 1.85,
        spot: Math.PI * 1.95
    };

    const CALIBRATION = {
        exposureScale: 1.0
    };

    function isV2(threeRef) {
        const T = getThree(threeRef);
        if (!T) return false;
        if (T.IS_THREE_V2 === true) return true;
        const rev = parseInt(T.REVISION, 10);
        return Number.isFinite(rev) && rev >= 152;
    }

    function configureRenderer(renderer, threeRef) {
        if (!renderer) return;
        const T = getThree(threeRef);
        if (isV2(T) && 'outputColorSpace' in renderer && T && T.SRGBColorSpace !== undefined) {
            renderer.outputColorSpace = T.SRGBColorSpace;
        } else if (T && T.sRGBEncoding !== undefined && 'outputEncoding' in renderer) {
            renderer.outputEncoding = T.sRGBEncoding;
        }
    }

    function setExposure(renderer, legacyExposure, threeRef) {
        if (!renderer || typeof legacyExposure !== 'number') return;
        renderer.toneMappingExposure = isV2(threeRef)
            ? (legacyExposure * CALIBRATION.exposureScale)
            : legacyExposure;
    }

    function setTextureColorSpace(tex, isColor, threeRef) {
        if (!tex) return tex;
        const T = getThree(threeRef);
        if (isV2(T) || (T && T.SRGBColorSpace !== undefined && 'colorSpace' in tex)) {
            if (isColor && T && T.SRGBColorSpace !== undefined) {
                tex.colorSpace = T.SRGBColorSpace;
            } else if (!isColor && T && T.NoColorSpace !== undefined) {
                tex.colorSpace = T.NoColorSpace;
            }
        } else if (T) {
            if (isColor && T.sRGBEncoding !== undefined) {
                tex.encoding = T.sRGBEncoding;
            } else if (!isColor && T.LinearEncoding !== undefined) {
                tex.encoding = T.LinearEncoding;
            }
        }
        return tex;
    }

    function setAttrUpdateRange(attr, offset, count) {
        if (!attr) return;
        const start = Math.max(0, offset | 0);
        const len = Math.max(0, count | 0);
        if (typeof attr.clearUpdateRanges === 'function' && typeof attr.addUpdateRange === 'function') {
            attr.clearUpdateRanges();
            if (len > 0) {
                attr.addUpdateRange(start, len);
            }
        } else if (attr.updateRange) {
            attr.updateRange.offset = start;
            attr.updateRange.count = len;
        }
    }

    function scaleIntensity(kind, legacyVal, threeRef) {
        const val = Number(legacyVal);
        if (!Number.isFinite(val)) return 0;
        if (!isV2(threeRef)) return val;
        const factor = Object.prototype.hasOwnProperty.call(LIGHT_SCALE, kind) ? LIGHT_SCALE[kind] : 1.0;
        return val * factor;
    }

    function setLightIntensity(light, kind, legacyVal, threeRef) {
        if (!light) return 0;
        const scaled = scaleIntensity(kind, legacyVal, threeRef);
        light.intensity = scaled;
        return scaled;
    }

    function getUvRedefines(fragmentShader, threeRef) {
        const useV2Uvs = isV2(threeRef) || (typeof fragmentShader === 'string' && fragmentShader.indexOf('vMapUv') !== -1);
        if (useV2Uvs) {
            return [
                '#define vUv yasdUv',
                '#define vMapUv yasdUv',
                '#define vNormalMapUv yasdUv',
                '#define vRoughnessMapUv yasdUv',
                '#define vMetalnessMapUv yasdUv',
                '#define vEmissiveMapUv yasdUv',
                '#define vBumpMapUv yasdUv',
                '#define vAlphaMapUv yasdUv'
            ].join('\n');
        }
        return '#define vUv yasdUv';
    }

    function getNormalVarName(fragmentShader) {
        if (typeof fragmentShader === 'string') {
            if (fragmentShader.indexOf('geometryNormal') !== -1) return 'geometryNormal';
            if (fragmentShader.indexOf('vec3 normal') !== -1) return 'normal';
        }
        return 'geometryNormal';
    }

    function patchSkyDomeFragment(fragSrc, threeRef) {
        if (typeof fragSrc !== 'string' || !isV2(threeRef)) return fragSrc;
        if (fragSrc.indexOf('#include <colorspace_fragment>') !== -1) return fragSrc;
        return fragSrc.replace(
            'gl_FragColor = vec4(sky, 1.0);',
            'gl_FragColor = vec4(sky, 1.0);\n                    #include <colorspace_fragment>'
        );
    }

    return {
        LIGHT_SCALE,
        CALIBRATION,
        isV2,
        configureRenderer,
        setExposure,
        setTextureColorSpace,
        setAttrUpdateRange,
        scaleIntensity,
        setLightIntensity,
        getUvRedefines,
        getNormalVarName,
        patchSkyDomeFragment
    };
});

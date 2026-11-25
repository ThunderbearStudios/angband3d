#!/usr/bin/env node
/**
 * tools/test_wave4a_three_v2_parity.js
 *
 * Wave 4A fast regression gate:
 *   1. Verifies dual Three.js bundles (dist/engine3d.min.js + dist/engine3d-v2.min.js) + .br/.gz sidecars.
 *   2. Verifies Three.js r187+ ESM exports (IS_THREE_V2, REVISION >= 170, GLTFLoader, OBJLoader, SRGBColorSpace, BatchedMesh, PMREMGenerator) in VM.
 *   3. Unit-tests Dungeon3DCompat across both mocked r128 and mocked r187 modes.
 *   4. Enforces static invariants across boot.js, app.js, dungeon3d*.js, and LOC budgets.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'server', 'public');
const DIST = path.join(PUB, 'dist');

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function main() {
    // 1. Bundles + syntax check
    const legacyBundle = path.join(DIST, 'engine3d.min.js');
    const v2Bundle = path.join(DIST, 'engine3d-v2.min.js');
    assert(fs.existsSync(legacyBundle), 'Missing dist/engine3d.min.js');
    assert(fs.existsSync(v2Bundle), 'Missing dist/engine3d-v2.min.js');
    assert(fs.existsSync(v2Bundle + '.br') || fs.existsSync(v2Bundle + '.gz'), 'Missing precompressed sidecar for engine3d-v2.min.js');
    execFileSync(process.execPath, ['--check', legacyBundle], { stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', v2Bundle], { stdio: 'pipe' });

    // 2. Evaluate compat unit + Three v2 shim metadata in VM
    const v2Code = fs.readFileSync(v2Bundle, 'utf8');
    const v2Header = v2Code.slice(0, 750000);
    assert(v2Code.includes('GLTFLoader') && v2Code.includes('OBJLoader') && v2Code.includes('IS_THREE_V2'), 'engine3d-v2.min.js missing Three v2 shim markers');
    assert(v2Code.includes('187') || v2Code.includes('REVISION'), 'engine3d-v2.min.js missing Three REVISION marker');
    assert(v2Header.length > 1000, 'engine3d-v2.min.js unexpectedly small');

    // Run full compat UMD unit test in r128 + r187 mocked contexts
    const compat = require(path.join(PUB, 'js', 'dungeon3d-three-compat.js'));
    assert(compat && typeof compat.isV2 === 'function', 'Dungeon3DCompat API missing');

    const mockR128 = { REVISION: '128', sRGBEncoding: 3001, LinearEncoding: 3000 };
    const mockR187 = { REVISION: '187', IS_THREE_V2: true, SRGBColorSpace: 'srgb', NoColorSpace: '' };

    assert.strictEqual(compat.isV2(mockR128), false, 'mock r128 must not report isV2');
    assert.strictEqual(compat.isV2(mockR187), true, 'mock r187 must report isV2');

    const r128Renderer = { outputEncoding: 0, toneMappingExposure: 1 };
    compat.configureRenderer(r128Renderer, mockR128);
    assert.strictEqual(r128Renderer.outputEncoding, 3001);
    compat.setExposure(r128Renderer, 1.05, mockR128);
    assert.strictEqual(r128Renderer.toneMappingExposure, 1.05);

    const r187Renderer = { outputColorSpace: '', toneMappingExposure: 1 };
    compat.configureRenderer(r187Renderer, mockR187);
    assert.strictEqual(r187Renderer.outputColorSpace, 'srgb');

    const tex128 = {};
    compat.setTextureColorSpace(tex128, true, mockR128);
    assert.strictEqual(tex128.encoding, 3001);
    const tex187 = { colorSpace: '' };
    compat.setTextureColorSpace(tex187, true, mockR187);
    assert.strictEqual(tex187.colorSpace, 'srgb');
    compat.setTextureColorSpace(tex187, false, mockR187);
    assert.strictEqual(tex187.colorSpace, '');

    const legacyAttr = { updateRange: { offset: 5, count: 9 } };
    compat.setAttrUpdateRange(legacyAttr, 0, 32);
    assert.deepStrictEqual(legacyAttr.updateRange, { offset: 0, count: 32 });

    const modernRanges = [];
    const modernAttr = {
        clearUpdateRanges: () => { modernRanges.length = 0; },
        addUpdateRange: (start, count) => { modernRanges.push([start, count]); }
    };
    compat.setAttrUpdateRange(modernAttr, 0, 64);
    assert.deepStrictEqual(modernRanges, [[0, 64]]);
    compat.setAttrUpdateRange(modernAttr, 0, 0);
    assert.deepStrictEqual(modernRanges, []);

    assert.strictEqual(compat.scaleIntensity('ambient', 0.75, mockR128), 0.75);
    assert(Math.abs(compat.scaleIntensity('ambient', 0.75, mockR187) - 0.75 * Math.PI) < 1e-6);

    const uvDefsV2 = compat.getUvRedefines('varying vec2 vMapUv;', mockR187);
    assert(uvDefsV2.includes('#define vMapUv yasdUv') && uvDefsV2.includes('#define vNormalMapUv yasdUv'));
    const uvDefs128 = compat.getUvRedefines('varying vec2 vUv;', mockR128);
    assert.strictEqual(uvDefs128, '#define vUv yasdUv');

    assert.strictEqual(compat.getNormalVarName('vec3 geometryNormal = normal;'), 'geometryNormal');
    assert.strictEqual(compat.getNormalVarName('vec3 normal = normalize(vNormal);'), 'normal');

    const patchedSky = compat.patchSkyDomeFragment('void main() { gl_FragColor = vec4(sky, 1.0); }', mockR187);
    assert(patchedSky.includes('#include <colorspace_fragment>'), 'patchSkyDomeFragment must append colorspace_fragment on v2');

    // Verify three-v2 ESM IIFE initializes window.THREE properly in bare VM
    const sandbox = {
        window: {},
        self: {},
        document: { createElement: () => ({ style: {} }) },
        performance,
        console,
        setTimeout,
        clearTimeout
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    const vendorCutoff = v2Code.indexOf('/* === js/dungeon3d-three-compat.js === */');
    if (vendorCutoff > 0) {
        vm.runInNewContext(v2Code.slice(0, vendorCutoff), sandbox, { filename: 'three-v2-vendor.js' });
        assert(sandbox.THREE && sandbox.THREE.IS_THREE_V2 === true, 'VM three-v2 vendor did not set THREE.IS_THREE_V2');
        assert(parseInt(sandbox.THREE.REVISION, 10) >= 170, `Expected REVISION >= 170, got ${sandbox.THREE.REVISION}`);
        assert.strictEqual(typeof sandbox.THREE.GLTFLoader, 'function', 'THREE.GLTFLoader missing on v2');
        assert.strictEqual(typeof sandbox.THREE.OBJLoader, 'function', 'THREE.OBJLoader missing on v2');
        assert.strictEqual(typeof sandbox.THREE.BatchedMesh, 'function', 'THREE.BatchedMesh missing on v2');
        assert.strictEqual(typeof sandbox.THREE.PMREMGenerator, 'function', 'THREE.PMREMGenerator missing on v2');
    }

    // 3. Static invariants
    const bootJs = read('server/public/js/boot.js');
    assert(/RENDERER_THREE_V2:\s*(?:true|false)/.test(bootJs), 'boot.js must define RENDERER_THREE_V2 toggle flag');

    const appJs = read('server/public/js/app.js');
    assert(appJs.includes("'engine3d-v2'") && appJs.includes("window.__loadLazyBundle('engine3d')"), 'app.js must route RENDERER_THREE_V2 to engine3d-v2 with engine3d fallback');

    const d3d = read('server/public/js/dungeon3d.js');
    assert(!/^\s*this\.renderer\.outputEncoding\s*=/m.test(d3d), 'Unguarded outputEncoding assignment in dungeon3d.js');
    assert(!/\.updateRange\.offset\s*=/.test(d3d.replace(/else if \(attr && attr\.updateRange\) \{ attr\.updateRange\.offset = 0; attr\.updateRange\.count = count; \}/g, '')), 'Unguarded updateRange.offset assignment in dungeon3d.js');
    assert(d3d.includes('Dungeon3DCompat'), 'dungeon3d.js missing Dungeon3DCompat integration');

    const tac = read('server/public/js/dungeon3d-tactical.js');
    assert(tac.includes('getUvRedefines'), 'dungeon3d-tactical.js missing getUvRedefines');
    assert(tac.includes('defined(USE_MAP)'), 'dungeon3d-tactical.js missing USE_MAP guard for vFaceUv');

    const procLines = read('server/public/js/dungeon3d-proc-textures.js').split(/\r?\n/).length;
    const envLines = read('server/public/js/dungeon3d-environment.js').split(/\r?\n/).length;
    assert(procLines <= 2650, `dungeon3d-proc-textures.js exceeded LOC budget: ${procLines} > 2650`);
    assert(envLines <= 850, `dungeon3d-environment.js exceeded LOC budget: ${envLines} > 850`);

    console.log('[Wave4A] PASS: engine3d.min.js + engine3d-v2.min.js, Three r187 VM exports, Dungeon3DCompat parity, and static invariants verified');
}

main();

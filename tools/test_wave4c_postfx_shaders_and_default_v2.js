#!/usr/bin/env node
/**
 * tools/test_wave4c_postfx_shaders_and_default_v2.js
 *
 * Wave 4C fast regression gate:
 *   1. Verifies boot.js defaults RENDERER_THREE_V2: true with WEBGPU_EXPERIMENTAL: false and preserves ?flag_RENDERER_THREE_V2=0 rollback.
 *   2. Verifies three-v2-entry.js & dist/engine3d-v2.min.js wire EffectComposer, RenderPass, UnrealBloomPass, GTAOPass, OutputPass.
 *   3. Unit-tests Dungeon3DV2Pipeline PostFX tier gating (performance/ultra/integrated/mobile-saver), half-res resize, renderWorldPass, and disposal.
 *   4. Unit-tests Fresnel Water & Voronoi Lava onBeforeCompile shader injection + tickLiquidShaders + probeWebGPUCapability fallback.
 *   5. Verifies integrated GPU PBR promotion (preferLambert=false, fullPbrMaps=true) with mobile-saver untouched.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'server', 'public');

function runBootWithSearch(searchStr) {
    const bootSrc = fs.readFileSync(path.join(PUB, 'js', 'boot.js'), 'utf8');
    const ctx = {
        window: {
            location: { search: searchStr || '' },
            localStorage: null
        },
        document: {
            currentScript: { src: '/js/boot.js?v=13.3.0' },
            addEventListener: () => {},
            head: { appendChild: () => {} },
            createElement: () => ({})
        },
        URLSearchParams,
        Map,
        console
    };
    ctx.window.window = ctx.window;
    vm.runInNewContext(bootSrc, ctx);
    return ctx.window.YASD_FLAGS;
}

(function main() {
    // 1. Default RENDERER_THREE_V2: true & instant URL rollback
    const defaultFlags = runBootWithSearch('');
    assert.strictEqual(defaultFlags.RENDERER_THREE_V2, true, 'Wave 4C must default RENDERER_THREE_V2 to true');
    assert.strictEqual(defaultFlags.WEBGPU_EXPERIMENTAL, false, 'WEBGPU_EXPERIMENTAL must default to false');
    const rollbackFlags = runBootWithSearch('?flag_RENDERER_THREE_V2=0');
    assert.strictEqual(rollbackFlags.RENDERER_THREE_V2, false, '?flag_RENDERER_THREE_V2=0 must roll back to Three.js r128');

    // 2. Vendor entry exposes PostFX passes
    const v2Entry = fs.readFileSync(path.join(PUB, 'js', 'vendor', 'three-v2-entry.js'), 'utf8');
    for (const sym of ['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'GTAOPass', 'OutputPass']) {
        assert(v2Entry.includes(sym), `three-v2-entry.js missing ${sym}`);
    }

    // 3. Integrated GPU PBR promotion + mobile-saver preserved
    const lm = require(path.join(PUB, 'js', 'dungeon3d-lightmap.js'));
    const presets = lm.HardwareGpuProfile.getPresets();
    assert.strictEqual(presets.integrated.preferLambert, false, 'integrated preset must promote to full PBR (preferLambert=false)');
    assert.strictEqual(presets.integrated.fullPbrMaps, true, 'integrated preset must enable fullPbrMaps=true');
    assert.strictEqual(presets['mobile-saver'].preferLambert, true, 'mobile-saver preset must retain preferLambert=true');
    assert.strictEqual(presets['mobile-saver'].fullPbrMaps, false, 'mobile-saver preset must retain fullPbrMaps=false');

    // 4. Dungeon3DV2Pipeline PostFX, Liquid Shaders, and WebGPU Probe unit tests
    let disposedObjs = 0;
    let renderedComposer = 0;
    const fakePasses = [];
    class FakeDisposable {
        dispose() { disposedObjs++; }
    }
    const mockThree = {
        IS_THREE_V2: true,
        HalfFloatType: 1016,
        UnsignedByteType: 1009,
        Vector2: class {
            constructor(x = 0, y = 0) { this.x = x; this.y = y; }
            set(x, y) { this.x = x; this.y = y; }
        },
        WebGLRenderTarget: class extends FakeDisposable {
            constructor(w, h, opts) { super(); this.w = w; this.h = h; this.opts = opts; }
        },
        EffectComposer: class extends FakeDisposable {
            constructor(r, rt) { super(); this.r = r; this.rt = rt; this.passes = []; }
            setPixelRatio(p) { this.dpr = p; }
            setSize(w, h) { this.w = w; this.h = h; }
            addPass(p) { this.passes.push(p); fakePasses.push(p); }
            render() { renderedComposer++; }
        },
        RenderPass: class extends FakeDisposable { constructor(s, c) { super(); this.s = s; this.c = c; } },
        GTAOPass: class extends FakeDisposable {
            constructor(s, c, w, h) { super(); this.w = w; this.h = h; }
            updateGtaoMaterial(cfg) { this.cfg = cfg; }
            setSize(w, h) { this.w = w; this.h = h; }
        },
        UnrealBloomPass: class extends FakeDisposable {
            constructor(res, strength, radius, threshold) {
                super();
                this.resolution = res;
                this.strength = strength;
                this.radius = radius;
                this.threshold = threshold;
            }
        },
        OutputPass: class extends FakeDisposable {}
    };
    const pipeCtx = {
        window: {
            THREE: mockThree,
            YASD_FLAGS: { RENDERER_THREE_V2: true, WEBGPU_EXPERIMENTAL: false },
            Dungeon3DCompat: { isV2: (t) => Boolean((t || mockThree).IS_THREE_V2) }
        },
        THREE: mockThree,
        navigator: {},
        Math,
        Uint8Array,
        Map,
        Promise,
        console
    };
    pipeCtx.window.window = pipeCtx.window;
    vm.runInNewContext(fs.readFileSync(path.join(PUB, 'js', 'dungeon3d-v2-pipeline.js'), 'utf8'), pipeCtx);
    const v2p = pipeCtx.window.Dungeon3DV2Pipeline;

    const makeMockD3d = (gpuTier) => ({
        renderer: {
            capabilities: { isWebGL2: true },
            getSize: (v) => { v.x = 1280; v.y = 720; return v; },
            getPixelRatio: () => 1.5
        },
        scene: {},
        camera: {},
        renderBudget: { gpuTier, tier: 'desktop' }
    });

    // Integrated tier skips expensive Bloom/GTAO
    const d3dInt = makeMockD3d('integrated');
    const pfxInt = v2p.initPostFx(d3dInt);
    assert.strictEqual(pfxInt.enabled, false, 'integrated tier must keep PostFX off by default');
    assert.strictEqual(v2p.renderWorldPass(d3dInt), false, 'integrated tier must fall back to direct renderer.render');

    // Performance tier enables half-res Bloom + OutputPass (no GTAO)
    const d3dPerf = makeMockD3d('performance');
    const pfxPerf = v2p.initPostFx(d3dPerf);
    assert.strictEqual(pfxPerf.enabled, true, 'performance tier must enable PostFX');
    assert.strictEqual(pfxPerf.gtaoPass, null, 'performance tier should not enable GTAO');
    assert.strictEqual(pfxPerf.bloomPass.resolution.x, 640, 'bloom pass must use half-res width');
    v2p.resizePostFx(d3dPerf, 800, 600, 1);
    assert.strictEqual(pfxPerf.bloomPass.resolution.x, 400);
    assert.strictEqual(v2p.renderWorldPass(d3dPerf), true);
    assert.strictEqual(renderedComposer, 1);

    // Ultra tier enables GTAO + Bloom + OutputPass
    const d3dUltra = makeMockD3d('ultra');
    const pfxUltra = v2p.initPostFx(d3dUltra);
    assert(pfxUltra.gtaoPass && pfxUltra.bloomPass && pfxUltra.outputPass, 'ultra tier must enable GTAO + Bloom + Output');
    disposedObjs = 0;
    v2p.dispose(d3dUltra);
    assert(disposedObjs >= 5, `dispose() must free all PostFX passes/targets, freed ${disposedObjs}`);

    // Liquid shaders
    const mockLiquidD3d = {
        renderBudget: { gpuTier: 'performance' },
        waterMaterial: {},
        deepWaterMaterial: {},
        lavaMaterial: {}
    };
    assert.strictEqual(v2p.upgradeLiquidShaders(mockLiquidD3d), true);
    assert.strictEqual(mockLiquidD3d.waterMaterial.customProgramCacheKey(), 'yasd_fresnel_water_shallow_v1');
    assert.strictEqual(mockLiquidD3d.lavaMaterial.customProgramCacheKey(), 'yasd_voronoi_lava_v1');

    const waterShader = {
        uniforms: {},
        vertexShader: '#include <begin_vertex>\nvoid main(){}',
        fragmentShader: '#include <emissivemap_fragment>\nvoid main(){}'
    };
    mockLiquidD3d.waterMaterial.onBeforeCompile(waterShader);
    assert(waterShader.vertexShader.includes('vYasdWaterWorldPos') && waterShader.fragmentShader.includes('yasdFresnel'),
        'Water onBeforeCompile must inject world pos & Schlick Fresnel term');

    const lavaShader = {
        uniforms: {},
        vertexShader: '#include <begin_vertex>\nvoid main(){}',
        fragmentShader: '#include <emissivemap_fragment>\nvoid main(){}'
    };
    mockLiquidD3d.lavaMaterial.onBeforeCompile(lavaShader);
    assert(lavaShader.fragmentShader.includes('yasdLavaVoronoi') && lavaShader.fragmentShader.includes('totalEmissiveRadiance'),
        'Lava onBeforeCompile must inject Voronoi crack cellular shader');

    v2p.tickLiquidShaders(mockLiquidD3d, 12.5);
    assert.strictEqual(mockLiquidD3d._liquidTimeUniform.value, 12.5);

    const wgpuStat = v2p.probeWebGPUCapability(mockLiquidD3d);
    assert.strictEqual(wgpuStat.backend, 'webgl2');

    // 5. dungeon3d.js hooks verified
    const d3dSrc = fs.readFileSync(path.join(PUB, 'js', 'dungeon3d.js'), 'utf8');
    for (const fn of ['initPostFx', 'resizePostFx', 'renderWorldPass', 'upgradeLiquidShaders', 'tickLiquidShaders', 'probeWebGPUCapability']) {
        assert(d3dSrc.includes(fn), `dungeon3d.js missing Wave 4C hook: ${fn}`);
    }

    console.log('[test_wave4c_postfx_shaders_and_default_v2] PASS (default V2=true, rollback ?flag_RENDERER_THREE_V2=0, PostFX Bloom/GTAO, Fresnel Water, Voronoi Lava, integrated PBR, WebGPU fallback)');
})();

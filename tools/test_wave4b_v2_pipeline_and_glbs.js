#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TEXTURE_DIR = path.join(ROOT, 'server/public/assets/polyhaven/textures');
const ITEMS_DIR = path.join(ROOT, 'server/public/assets/models/items');
const BESTIARY_DIR = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
const BASIS_DIR = path.join(ROOT, 'server/public/assets/basis');

const KTX2_MAGIC = Buffer.from([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]);
const TEXTURE_SETS = [
    'aerial_grass_rock', 'bark_willow_02', 'brown_mud_rocks_01', 'castle_brick_broken_06',
    'cliff_side', 'cobblestone_floor_08', 'japanese_stone_wall', 'marble_cliff_01',
    'marble_cliff_02', 'medieval_blocks_05', 'monastery_stone_floor', 'plastered_stone_wall',
    'rock_boulder_cracked', 'rock_embedded_floor', 'rock_wall_10'
];
const MAP_KINDS = ['diff', 'nor_gl', 'arm'];
const WAVE4B_ITEM_GLBS = ['halberd.glb', 'crossbow.glb', 'flail.glb', 'phial.glb', 'chest_metal.glb', 'food_ration.glb'];
const WAVE4B_MONSTER_GLBS = ['balrog.glb', 'minotaur.glb', 'centaur.glb', 'corvid_raptor.glb', 'feline_predator.glb', 'mumak.glb'];

function readGlbJson(filePath) {
    const buf = fs.readFileSync(filePath);
    assert(buf.length >= 28, `GLB too small: ${filePath}`);
    assert.strictEqual(buf.toString('ascii', 0, 4), 'glTF', `Bad GLB magic: ${filePath}`);
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const binChunk = buf.subarray(20 + jsonLen + 8);
    return { json, binChunk };
}

(async function runTests() {
    // 1. Basis transcoders & Three v2 entry
    const basisJsPath = path.join(BASIS_DIR, 'basis_transcoder.js');
    assert(fs.existsSync(basisJsPath), 'Missing basis_transcoder.js');
    assert(fs.existsSync(path.join(BASIS_DIR, 'basis_transcoder.wasm')), 'Missing basis_transcoder.wasm');
    assert.strictEqual(fs.readFileSync(basisJsPath, 'utf8').includes('newFunc(Function'), false,
        'basis_transcoder.js must be patched CSP-safe (zero newFunc(Function))');
    const v2Entry = fs.readFileSync(path.join(ROOT, 'server/public/js/vendor/three-v2-entry.js'), 'utf8');
    assert(v2Entry.includes('KTX2Loader'), 'three-v2-entry.js must wire KTX2Loader');

    // 2. All 45 KTX2 textures exist with valid KTX 2.0 header
    let ktx2Count = 0;
    for (const setId of TEXTURE_SETS) {
        for (const mapKind of MAP_KINDS) {
            const fp = path.join(TEXTURE_DIR, setId, `${mapKind}.ktx2`);
            assert(fs.existsSync(fp), `Missing KTX2 texture: ${fp}`);
            const hdr = fs.readFileSync(fp).subarray(0, 12);
            assert(hdr.equals(KTX2_MAGIC), `Invalid KTX2 magic in ${fp}`);
            ktx2Count++;
        }
    }
    assert.strictEqual(ktx2Count, 45, 'Expected 45 KTX2 maps');

    // 3. All 12 Wave 4B GLBs: Float32 POSITION, Meshopt, 0 quantization, physical extensions, round-trip decode
    const meshoptSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/vendor/meshopt_decoder.js'), 'utf8');
    const meshoptCtx = { WebAssembly, Uint8Array, ArrayBuffer, console };
    vm.createContext(meshoptCtx);
    vm.runInContext(meshoptSrc, meshoptCtx);
    await meshoptCtx.MeshoptDecoder.ready;
    const MeshoptDecoder = meshoptCtx.MeshoptDecoder;
    assert(MeshoptDecoder && typeof MeshoptDecoder.decodeGltfBuffer === 'function', 'meshopt_decoder.js failed to load');

    const glbSpecs = [
        ...WAVE4B_ITEM_GLBS.map((f) => path.join(ITEMS_DIR, f)),
        ...WAVE4B_MONSTER_GLBS.map((f) => path.join(BESTIARY_DIR, f))
    ];
    for (const fp of glbSpecs) {
        assert(fs.existsSync(fp), `Missing Wave 4B GLB: ${fp}`);
        const { json, binChunk } = readGlbJson(fp);
        const exts = new Set([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])]);
        assert(!exts.has('KHR_mesh_quantization'), `Quantization forbidden in ${fp}`);
        assert(exts.has('EXT_meshopt_compression'), `Missing EXT_meshopt_compression in ${fp}`);
        for (const m of (json.meshes || [])) {
            for (const p of (m.primitives || [])) {
                const acc = json.accessors[p.attributes.POSITION];
                assert(acc && acc.componentType === 5126, `Non-Float32 POSITION in ${fp}`);
            }
        }
        for (const bv of (json.bufferViews || [])) {
            const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
            if (!ext) continue;
            const dst = new Uint8Array(ext.count * ext.byteStride);
            const src = new Uint8Array(binChunk.buffer, binChunk.byteOffset + (ext.byteOffset || 0), ext.byteLength);
            MeshoptDecoder.decodeGltfBuffer(dst, ext.count, ext.byteStride, src, ext.mode, ext.filter);
        }
    }
    const phialJson = readGlbJson(path.join(ITEMS_DIR, 'phial.glb')).json;
    const phialUsed = new Set(phialJson.extensionsUsed || []);
    assert(phialUsed.has('KHR_materials_ior') && phialUsed.has('KHR_materials_specular') && phialUsed.has('KHR_materials_emissive_strength'),
        'phial.glb must retain physical glTF extensions');

    // 4. MasterItemRegistry & MasterBestiary resolution checks
    const winCtx = { window: {}, console, navigator: {} };
    winCtx.window = winCtx;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'server/public/js/master-item-registry.js'), 'utf8'), winCtx);
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'server/public/js/master-bestiary.js'), 'utf8'), winCtx);

    const mir = winCtx.MASTER_ITEM_REGISTRY;
    assert.strictEqual(mir.resolveItem('Halberd (+1,+2)', '/', 'angband').floorKey, 'item_halberd');
    assert.strictEqual(mir.resolveItem('Heavy Crossbow (x4)', '}', 'angband').floorKey, 'item_crossbow');
    assert.strictEqual(mir.resolveItem('Flail (2d6)', '\\', 'angband').floorKey, 'item_flail');
    assert.strictEqual(mir.resolveItem('The Phial of Galadriel', '~', 'angband').floorKey, 'item_phial');
    assert.strictEqual(mir.resolveItem('Small Iron Chest', '~', 'angband').floorKey, 'item_chest_metal');
    assert.strictEqual(mir.resolveItem('Food Ration', ',', 'angband').floorKey, 'item_food_ration');
    assert(mir.VIEWMODEL_POSES.item_halberd && mir.VIEWMODEL_POSES.item_crossbow && mir.VIEWMODEL_POSES.item_flail && mir.VIEWMODEL_POSES.item_phial,
        'Missing VIEWMODEL_POSES for Wave 4B held items');

    const mb = winCtx.MASTER_BESTIARY;
    assert.strictEqual(mb.resolve({ name: 'Minotaur', glyph: 'H' }, 'H', 'dcss').templateKey, 'bestiary_minotaur');
    assert.strictEqual(mb.resolve({ name: 'Centaur', glyph: 'C' }, 'C', 'rogue').templateKey, 'bestiary_centaur');
    assert.strictEqual(mb.resolve({ name: 'Mumak', glyph: 'q' }, 'q', 'angband').templateKey, 'bestiary_mumak');
    assert.strictEqual(mb.resolve({ name: 'Lesser Balrog', glyph: 'U' }, 'U', 'angband').templateKey, 'bestiary_balrog');
    assert.strictEqual(mb.resolve({ name: 'Skeletal Halberdier', glyph: 's' }, 's', 'angband').weaponKey, 'item_halberd');

    // 5. Dungeon3DV2Pipeline unit verification (LRU <= 8, KTX2 rewrite, physical materials, dispose)
    let disposedCount = 0;
    const mockCtx = {
        window: {
            Dungeon3DCompat: {
                isV2: (t) => Boolean((t || mockCtx.THREE).IS_THREE_V2),
                setTextureColorSpace: () => {}
            }
        },
        THREE: {
            IS_THREE_V2: true,
            KTX2Loader: class {
                setTranscoderPath() { return this; }
                detectSupport() {}
                load() {}
                dispose() { disposedCount++; }
            },
            PMREMGenerator: class {
                compileEquirectangularShader() {}
                fromEquirectangular(tex) {
                    return { texture: { id: tex.id }, dispose() { disposedCount++; } };
                }
                dispose() {}
            },
            DataTexture: class {
                constructor(data, w, h) { this.id = Math.random(); this.w = w; this.h = h; }
                dispose() {}
            },
            RGBAFormat: 1023,
            LinearFilter: 1006,
            EquirectangularReflectionMapping: 303,
            MeshPhysicalMaterial: class {}
        },
        document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
        Math,
        Uint8Array,
        Map,
        console
    };
    mockCtx.window.THREE = mockCtx.THREE;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-v2-pipeline.js'), 'utf8'), mockCtx);
    const v2p = mockCtx.window.Dungeon3DV2Pipeline;
    assert.strictEqual(
        v2p.toKtx2Url('/assets/polyhaven/textures/rock_07/diff.jpg?v=13.3.0'),
        '/assets/polyhaven/textures/rock_07/diff.ktx2?v=13.3.0',
        'toKtx2Url must preserve query suffix when rewriting PolyHaven JPG -> KTX2'
    );

    const mockD3d = { renderer: {}, scene: { environment: null, environmentIntensity: 0 } };
    const ktxLoader = v2p.ensureKtx2Loader(mockD3d);
    assert(ktxLoader && typeof ktxLoader.dispose === 'function', 'ensureKtx2Loader must initialize KTX2Loader for v2');

    const biomeInputs = [
        [null, true, 'angband', 0],
        [null, true, 'hengband', 0],
        [{ id: 'catacombs' }, false, 'angband', 5],
        [{ id: 'volcanic' }, false, 'angband', 70],
        [{ id: 'frost' }, false, 'angband', 15],
        [{ id: 'swamp' }, false, 'dcss', 10],
        [{ id: 'sanctuary' }, false, 'silq', 8],
        [{ id: 'abyss' }, false, 'dcss', 45]
    ];
    let evictedCount = 0;
    mockD3d._biomePmremCache = new Map([['__evict_test__', { dispose() { evictedCount++; } }]]);
    for (let i = 0; i < 7; i++) {
        const [biome, outdoors, realm, depth] = biomeInputs[i];
        v2p.syncBiomePmrem(mockD3d, biome, outdoors, realm, depth);
    }
    assert.strictEqual(mockD3d._biomePmremCache.size, 8, 'Sentinel + 7 biomes fills 8-entry LRU');
    const [b8, o8, r8, d8] = biomeInputs[7];
    v2p.syncBiomePmrem(mockD3d, b8, o8, r8, d8);
    assert.strictEqual(evictedCount, 1, `Expected 1 evicted oldest PMREM entry above 8-entry LRU, got ${evictedCount}`);
    assert.strictEqual(mockD3d._biomePmremCache.size, 8, 'PMREM LRU cache must stay capped at 8');

    const testMat = { isMeshPhysicalMaterial: true, ior: 1.48, specularIntensity: 0.9, emissiveIntensity: 1.8, roughness: 0.1 };
    v2p.preservePhysicalMaterial(testMat);
    assert.strictEqual(testMat.ior, 1.48, 'Physical IOR must be preserved for v2');

    disposedCount = 0;
    v2p.dispose(mockD3d);
    assert.strictEqual(mockD3d._biomePmremCache.size, 0, 'dispose() must clear _biomePmremCache');
    assert.strictEqual(mockD3d._ktx2Loader, null, 'dispose() must clear _ktx2Loader');
    assert.strictEqual(disposedCount, 9, `Expected 8 cached PMREM targets + 1 KTX2Loader disposed, got ${disposedCount}`);

    // 6. Code wiring checks for BatchedMesh, compileAsync, CREDITS.md
    const townJs = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-town.js'), 'utf8');
    assert(townJs.includes('BatchedMesh') && townJs.includes('TownBatchedRoofs'), 'Town roofs must use THREE.BatchedMesh');
    const tacticalJs = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-tactical.js'), 'utf8');
    assert(tacticalJs.includes('initDungeonSetDressing') && tacticalJs.includes('emitDungeonSetDressing') && tacticalJs.includes('BatchedMesh'),
        'Dungeon tactical set-dressing must use BatchedMesh');
    const d3dJs = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
    assert(d3dJs.includes('compileAsync') && d3dJs.includes('syncBiomePmrem') && d3dJs.includes('corvid_raptor.glb') && d3dJs.includes('GodAnubis_Art.glb'),
        'dungeon3d.js must wire compileAsync, syncBiomePmrem, corvid_raptor.glb, and dark-fantasy GodAnubis_Art.glb');
    assert(!d3dJs.includes('/bestiary/balrog.glb') && !d3dJs.includes('/bestiary/minotaur.glb'),
        'dungeon3d.js must NOT load cartoon chibi balrog.glb or minotaur.glb');
    const credits = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    for (const f of [...WAVE4B_ITEM_GLBS, ...WAVE4B_MONSTER_GLBS]) {
        assert(credits.includes(f), `Missing ${f} attribution in CREDITS.md`);
    }

    console.log(`[test_wave4b_v2_pipeline_and_glbs] PASS (45 KTX2, 12 Float32 Meshopt GLBs, 8-LRU PMREM, BatchedMesh, compileAsync, CREDITS verified)`);
})();

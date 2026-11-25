#!/usr/bin/env node
/**
 * tools/test_wave2b2_glb_pipeline.js
 *
 * Wave 2B-2 Verification Suite:
 *  - Verifies 9-tap _applyUvSeamBleedFix and yasd_uv_seam_dilation shader are removed from dungeon3d.js
 *  - Verifies dungeon3d-environment.js wires MeshoptDecoder on its GLTFLoader
 *  - Audits ALL .glb / .gltf files under models/ and polyhaven/models/:
 *      * ZERO KHR_mesh_quantization (Three.js r128 safety)
 *      * 100% Float32 POSITION accessors (componentType === 5126)
 *      * Majority compressed via EXT_meshopt_compression
 *  - Verifies decimation & bone targets:
 *      * street_rat.gltf <= 2500 tris
 *      * wasp.glb <= 4000 tris
 *      * treasure_chest.gltf <= 4000 tris
 *      * pine_roots.gltf <= 4000 tris
 *      * MountainLion.glb <= 8500 tris, <= 110 skin joints, < 900 KB
 *      * werewolf.glb === 0 skins / 0 bones (LBS static-baked)
 *  - Actively round-trip decodes EVERY EXT_meshopt_compression bufferView of key models using bundled server/public/js/vendor/meshopt_decoder.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const MODEL_DIRS = [
    path.join(ROOT, 'server', 'public', 'assets', 'models'),
    path.join(ROOT, 'server', 'public', 'assets', 'polyhaven', 'models')
];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (/\.(glb|gltf)$/i.test(ent.name)) out.push(p);
    }
    return out;
}

function parseModel(filePath) {
    if (filePath.toLowerCase().endsWith('.gltf')) {
        const dir = path.dirname(filePath);
        const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const bufs = (j.buffers || []).map((b) => {
            if (!b.uri) return Buffer.alloc(0);
            if (b.uri.startsWith('data:')) return Buffer.from(b.uri.split(',')[1] || '', 'base64');
            const bp = path.join(dir, b.uri);
            return fs.existsSync(bp) ? fs.readFileSync(bp) : Buffer.alloc(0);
        });
        return { json: j, bufs, size: fs.statSync(filePath).size + bufs.reduce((s, b) => s + b.length, 0) };
    }
    const buf = fs.readFileSync(filePath);
    assert(buf.length >= 24 && buf.toString('utf8', 0, 4) === 'glTF', `Invalid GLB header: ${filePath}`);
    const jLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.slice(20, 20 + jLen).toString('utf8'));
    const binOff = 20 + jLen + 8;
    const binChunk = binOff <= buf.length ? buf.subarray(binOff) : Buffer.alloc(0);
    return { json, bufs: [binChunk], size: buf.length };
}

function getTris(j) {
    let tris = 0;
    const accs = j.accessors || [];
    for (const m of (j.meshes || [])) {
        for (const p of (m.primitives || [])) {
            if (p.indices !== undefined && accs[p.indices]) tris += Math.floor(accs[p.indices].count / 3);
            else if (p.attributes && p.attributes.POSITION !== undefined && accs[p.attributes.POSITION]) tris += Math.floor(accs[p.attributes.POSITION].count / 3);
        }
    }
    return tris;
}

async function main() {
    // 1. Source contracts: _applyUvSeamBleedFix removed, setMeshoptDecoder wired in dungeon3d-environment.js
    const d3dSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
    assert.strictEqual(d3dSrc.includes('_applyUvSeamBleedFix'), false, 'dungeon3d.js must remove 9-tap _applyUvSeamBleedFix');
    assert.strictEqual(d3dSrc.includes('yasd_uv_seam_dilation'), false, 'dungeon3d.js must remove yasd_uv_seam_dilation shader key');

    const envSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-environment.js'), 'utf8');
    assert.ok(envSrc.includes('setMeshoptDecoder'), 'dungeon3d-environment.js must configure setMeshoptDecoder on its GLTFLoader');

    // 2. Load exact runtime vendor meshopt_decoder.js
    const box = { WebAssembly, Uint8Array, ArrayBuffer, console };
    vm.createContext(box);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'server/public/js/vendor/meshopt_decoder.js'), 'utf8'), box);
    await box.MeshoptDecoder.ready;
    const decoder = box.MeshoptDecoder;

    // 3. Global corpus Float32 + zero quantization + Meshopt coverage audit
    const allFiles = MODEL_DIRS.flatMap(d => walk(d));
    assert(allFiles.length >= 140, `Expected >=140 models, got ${allFiles.length}`);
    let meshoptModels = 0;
    const byBase = new Map();
    for (const f of allFiles) {
        const parsed = parseModel(f);
        const j = parsed.json;
        const exts = new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])]);
        assert.strictEqual(exts.has('KHR_mesh_quantization'), false, `Banned KHR_mesh_quantization in ${f}`);
        const accs = j.accessors || [];
        for (const m of (j.meshes || [])) {
            for (const p of (m.primitives || [])) {
                const posIdx = p && p.attributes ? p.attributes.POSITION : undefined;
                if (posIdx !== undefined) {
                    const acc = accs[posIdx];
                    assert(acc && acc.componentType === 5126, `Non-Float32 POSITION in ${f}: componentType=${acc && acc.componentType}`);
                }
            }
        }
        if (exts.has('EXT_meshopt_compression')) meshoptModels++;
        byBase.set(path.basename(f), { filePath: f, ...parsed });
    }
    assert(meshoptModels >= Math.floor(allFiles.length * 0.7), `Expected majority Meshopt models (>=70%), got ${meshoptModels}/${allFiles.length}`);

    // 4. Specific poly/bone/size budget assertions
    const assertModelStats = (baseName, fn) => {
        const entry = byBase.get(baseName);
        assert(entry, `Missing expected model ${baseName}`);
        fn(entry);
    };
    assertModelStats('street_rat.gltf', (e) => {
        const tris = getTris(e.json);
        assert(tris > 100 && tris <= 2500, `street_rat.gltf tris=${tris} must be <= 2500`);
    });
    assertModelStats('wasp.glb', (e) => {
        const tris = getTris(e.json);
        assert(tris > 100 && tris <= 4000, `wasp.glb tris=${tris} must be <= 4000`);
    });
    assertModelStats('treasure_chest.gltf', (e) => {
        const tris = getTris(e.json);
        assert(tris > 100 && tris <= 4000, `treasure_chest.gltf tris=${tris} must be <= 4000`);
    });
    assertModelStats('pine_roots.gltf', (e) => {
        const tris = getTris(e.json);
        assert(tris > 100 && tris <= 4000, `pine_roots.gltf tris=${tris} must be <= 4000`);
    });
    assertModelStats('MountainLion.glb', (e) => {
        const tris = getTris(e.json);
        const joints = (e.json.skins || []).reduce((s, sk) => s + sk.joints.length, 0);
        assert(tris > 100 && tris <= 8500, `MountainLion.glb tris=${tris} must be <= 8500`);
        assert(joints > 0 && joints <= 110, `MountainLion.glb joints=${joints} must be <= 110`);
        assert(e.size < 900 * 1024, `MountainLion.glb size=${e.size} must be < 900 KB`);
    });
    assertModelStats('werewolf.glb', (e) => {
        const joints = (e.json.skins || []).reduce((s, sk) => s + sk.joints.length, 0);
        assert.strictEqual(joints, 0, `werewolf.glb must have 0 bones after static LBS bake, got ${joints}`);
        assert.strictEqual((e.json.skins || []).length, 0, 'werewolf.glb must have 0 skins');
    });

    // 5. Round-trip decode EVERY EXT_meshopt_compression bufferView on key models using bundled vendor MeshoptDecoder
    let totalDecodedViews = 0;
    for (const key of ['guard.glb', 'MountainLion.glb', 'Dragon.glb', 'wasp.glb', 'werewolf.glb', 'street_rat.gltf', 'treasure_chest.gltf']) {
        const e = byBase.get(key);
        let viewsForModel = 0;
        for (const bv of (e.json.bufferViews || [])) {
            const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
            if (!ext) continue;
            const srcBuf = e.bufs[ext.buffer || 0];
            const dst = new Uint8Array(ext.count * ext.byteStride);
            const src = new Uint8Array(srcBuf.buffer, srcBuf.byteOffset + (ext.byteOffset || 0), ext.byteLength);
            decoder.decodeGltfBuffer(dst, ext.count, ext.byteStride, src, ext.mode, ext.filter);
            viewsForModel++;
            totalDecodedViews++;
        }
        assert(viewsForModel > 0, `Expected ${key} to have EXT_meshopt_compression bufferViews`);
    }

    console.log(`test_wave2b2_glb_pipeline.js: PASS (${allFiles.length} models, ${meshoptModels} Meshopt, ${totalDecodedViews} bufferViews decoded cleanly)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

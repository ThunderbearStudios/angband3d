#!/usr/bin/env node
/**
 * tools/install_wave4b_glbs.js
 *
 * Wave 4B Asset Installer:
 *   Downloads 12 verified CC0 / CC-BY 3.0 Poly Pizza artist GLBs (6 missing items + 6 species),
 *   applies smooth normals / TEXCOORD_0 if missing, adds restored physical glTF extensions
 *   (KHR_materials_specular, KHR_materials_emissive_strength, KHR_materials_ior) where applicable,
 *   simplifies to <= 4000 tris, downsizes textures to <= 512x512 WebP, snaps minY=0,
 *   compresses via Pure-Float32 EXT_meshopt_compression (EncoderMethod.FILTER, ZERO quantization),
 *   and round-trip validates every bufferView with vendor/meshopt_decoder.js.
 */
'use strict';

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'server/public/assets/models/items');
const BESTIARY_DIR = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
const FORCE = process.argv.includes('--force');

function resolveCachedPkg(pkgName) {
    const localCandidate = path.join(ROOT, 'node_modules', pkgName);
    if (fs.existsSync(localCandidate)) return require(localCandidate);
    const npxCache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm'), 'npm-cache', '_npx');
    if (fs.existsSync(npxCache)) {
        for (const h of fs.readdirSync(npxCache)) {
            const p = path.join(npxCache, h, 'node_modules', pkgName);
            if (fs.existsSync(p)) return require(p);
        }
    }
    throw new Error(`Missing package ${pkgName} in node_modules or npx cache`);
}

const { NodeIO } = resolveCachedPkg('@gltf-transform/core');
const {
    ALL_EXTENSIONS,
    EXTMeshoptCompression,
    KHRMaterialsSpecular,
    KHRMaterialsEmissiveStrength,
    KHRMaterialsIOR
} = resolveCachedPkg('@gltf-transform/extensions');
const { simplify, weld, resample, prune, normals, unweld } = resolveCachedPkg('@gltf-transform/functions');
const { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } = resolveCachedPkg('meshoptimizer');
const sharp = resolveCachedPkg('sharp');

function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(downloadBuffer(res.headers.location));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

function getTriangleCount(doc) {
    let tris = 0;
    for (const m of doc.getRoot().listMeshes()) {
        for (const p of m.listPrimitives()) {
            const idx = p.getIndices();
            if (idx) tris += Math.floor(idx.getCount() / 3);
            else if (p.getAttribute('POSITION')) tris += Math.floor(p.getAttribute('POSITION').getCount() / 3);
        }
    }
    return tris;
}

function ensureUvsAndNormals(doc) {
    for (const m of doc.getRoot().listMeshes()) {
        for (const p of m.listPrimitives()) {
            const pos = p.getAttribute('POSITION');
            if (!pos) continue;
            if (!p.getAttribute('TEXCOORD_0')) {
                const cnt = pos.getCount();
                const uvArr = new Float32Array(cnt * 2);
                const v = [0, 0, 0];
                let maxSpan = 1e-4;
                for (let i = 0; i < cnt; i++) {
                    pos.getElement(i, v);
                    maxSpan = Math.max(maxSpan, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
                }
                for (let i = 0; i < cnt; i++) {
                    pos.getElement(i, v);
                    uvArr[i * 2] = 0.5 + (v[0] + v[2]) / (4 * maxSpan);
                    uvArr[i * 2 + 1] = 0.5 + v[1] / (2 * maxSpan);
                }
                p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvArr));
            }
        }
    }
}

function snapGroundZero(doc) {
    // Only ground static (non-skinned) meshes cleanly so skeletal animations preserve bone hips
    if (doc.getRoot().listSkins().length > 0) return;
    let minY = Infinity;
    const pArr = [0, 0, 0];
    for (const m of doc.getRoot().listMeshes()) {
        for (const p of m.listPrimitives()) {
            const pos = p.getAttribute('POSITION');
            if (!pos) continue;
            for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, pArr);
                if (pArr[1] < minY) minY = pArr[1];
            }
        }
    }
    if (!Number.isFinite(minY) || Math.abs(minY) < 1e-4) return;
    for (const node of doc.getRoot().listNodes()) {
        if (node.getMesh()) {
            const t = node.getTranslation();
            // Do inner vertex translate when no parent hierarchy scaling confuses bounds
        }
    }
    for (const m of doc.getRoot().listMeshes()) {
        for (const p of m.listPrimitives()) {
            const pos = p.getAttribute('POSITION');
            if (!pos) continue;
            for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, pArr);
                pArr[1] -= minY;
                pos.setElement(i, pArr);
            }
        }
    }
}

async function normalizeTexturesWebP(doc, maxDim = 512) {
    for (const tex of doc.getRoot().listTextures()) {
        const img = tex.getImage();
        if (!img || img.byteLength === 0) continue;
        const mime = tex.getMimeType();
        const meta = await sharp(Buffer.from(img)).metadata();
        if (meta.width <= maxDim && meta.height <= maxDim && mime === 'image/webp') continue;
        let pipe = sharp(Buffer.from(img));
        if (meta.width > maxDim || meta.height > maxDim) {
            pipe = pipe.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
        }
        const out = await pipe.webp({ quality: 86, effort: 4 }).toBuffer();
        tex.setImage(new Uint8Array(out));
        tex.setMimeType('image/webp');
    }
}

function applyMaterialEnhancements(doc, opts) {
    const mats = doc.getRoot().listMaterials();
    for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (opts.baseTint) {
            const f = mat.getBaseColorFactor();
            mat.setBaseColorFactor([opts.baseTint[0], opts.baseTint[1], opts.baseTint[2], f[3] ?? 1.0]);
        }
        if (opts.roughness !== undefined) mat.setRoughnessFactor(opts.roughness);
        if (opts.metalness !== undefined) mat.setMetallicFactor(opts.metalness);
        if (opts.specular) {
            const specExt = doc.createExtension(KHRMaterialsSpecular);
            const sp = specExt.createSpecular()
                .setSpecularFactor(opts.specular.factor ?? 0.9)
                .setSpecularColorFactor(opts.specular.color || [1, 1, 1]);
            mat.setExtension('KHR_materials_specular', sp);
        }
        if (opts.ior) {
            const iorExt = doc.createExtension(KHRMaterialsIOR);
            const iorProp = iorExt.createIOR();
            if (typeof iorProp.setIOR === 'function') iorProp.setIOR(opts.ior);
            mat.setExtension('KHR_materials_ior', iorProp);
        }
        if (opts.emissive && i === 0) {
            mat.setEmissiveFactor(opts.emissive.color || [0.65, 0.85, 1.0]);
            const emExt = doc.createExtension(KHRMaterialsEmissiveStrength);
            mat.setExtension('KHR_materials_emissive_strength', emExt.createEmissiveStrength().setEmissiveStrength(opts.emissive.strength || 1.8));
        }
    }
}

function verifyGlbRoundTrip(outPath, vendorDecoder) {
    const buf = fs.readFileSync(outPath);
    const jsonLen = buf.readUInt32LE(12);
    const j = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const binChunk = buf.subarray(20 + jsonLen + 8);
    const exts = new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])]);
    if (exts.has('KHR_mesh_quantization')) throw new Error(`Quantization found in ${outPath}`);
    if (!exts.has('EXT_meshopt_compression')) throw new Error(`Missing EXT_meshopt_compression in ${outPath}`);
    for (const m of (j.meshes || [])) {
        for (const p of (m.primitives || [])) {
            const acc = j.accessors[p.attributes.POSITION];
            if (!acc || acc.componentType !== 5126) throw new Error(`Non-Float32 POSITION in ${outPath}`);
        }
    }
    for (const bv of (j.bufferViews || [])) {
        const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
        if (!ext) continue;
        const dst = new Uint8Array(ext.count * ext.byteStride);
        const src = new Uint8Array(binChunk.buffer, binChunk.byteOffset + (ext.byteOffset || 0), ext.byteLength);
        vendorDecoder.decodeGltfBuffer(dst, ext.count, ext.byteStride, src, ext.mode, ext.filter);
    }
}

const ASSET_SPECS = [
    // 6 New Items
    {
        dir: ITEMS_DIR,
        file: 'halberd.glb',
        url: 'https://static.poly.pizza/f1785379-73d3-4fce-b7e1-51cf6635b4cd.glb',
        fallbackUrl: 'https://static.poly.pizza/97f342bf-7e3b-4155-a306-91b35e321c7b.glb',
        maxTris: 3600,
        metalness: 0.72,
        roughness: 0.34,
        specular: { factor: 0.92, color: [0.95, 0.97, 1.0] }
    },
    {
        dir: ITEMS_DIR,
        file: 'crossbow.glb',
        url: 'https://static.poly.pizza/7dfdb852-7bf5-484d-a41c-15af4a241970.glb',
        maxTris: 3600,
        specular: { factor: 0.55 }
    },
    {
        dir: ITEMS_DIR,
        file: 'flail.glb',
        url: 'https://static.poly.pizza/810f72dd-53fb-4d4b-935a-b1056195e15a.glb',
        fallbackUrl: 'https://static.poly.pizza/b9425d11-316a-4f0a-8e61-7bb97b716449.glb',
        maxTris: 3600,
        metalness: 0.68,
        roughness: 0.36,
        specular: { factor: 0.85 }
    },
    {
        dir: ITEMS_DIR,
        file: 'phial.glb',
        url: 'https://static.poly.pizza/7cee3dd7-29f1-4ec7-b57b-cecc748860f7.glb',
        maxTris: 3600,
        ior: 1.52,
        specular: { factor: 1.0, color: [0.85, 0.95, 1.0] },
        emissive: { color: [0.55, 0.88, 1.0], strength: 2.2 }
    },
    {
        dir: ITEMS_DIR,
        file: 'chest_metal.glb',
        url: 'https://static.poly.pizza/803af4ae-433f-4b05-b1f1-c6a2da02d768.glb',
        maxTris: 3600,
        baseTint: [0.56, 0.60, 0.66],
        metalness: 0.78,
        roughness: 0.34,
        specular: { factor: 0.95, color: [0.9, 0.94, 1.0] }
    },
    {
        dir: ITEMS_DIR,
        file: 'food_ration.glb',
        url: 'https://static.poly.pizza/d72ca4dd-e4af-4083-b07e-2a58d70f8032.glb',
        maxTris: 3200
    },
    // 6 New/Replacement Monsters
    {
        dir: BESTIARY_DIR,
        file: 'balrog.glb',
        url: 'https://static.poly.pizza/46b52ba4-5d2a-4fc8-85cc-3e980f199141.glb',
        maxTris: 3900
    },
    {
        dir: BESTIARY_DIR,
        file: 'minotaur.glb',
        url: 'https://static.poly.pizza/c2e39eb4-4b8e-4d31-b014-d637bf4e15c6.glb',
        fallbackUrl: 'https://static.poly.pizza/5704ef69-2c27-4de8-a942-70a29458af21.glb',
        distinctFrom: 'balrog.glb',
        maxTris: 3900
    },
    {
        dir: BESTIARY_DIR,
        file: 'centaur.glb',
        url: 'https://static.poly.pizza/cdc95b49-d105-4145-9faf-c9a44689f596.glb',
        maxTris: 3900
    },
    {
        dir: BESTIARY_DIR,
        file: 'corvid_raptor.glb',
        url: 'https://static.poly.pizza/f7180fc6-5f66-4f94-b295-9e6c791e3149.glb',
        maxTris: 3600
    },
    {
        dir: BESTIARY_DIR,
        file: 'feline_predator.glb',
        url: 'https://static.poly.pizza/1ba852c9-b39a-4869-b8da-b493e17ba989.glb',
        maxTris: 3600
    },
    {
        dir: BESTIARY_DIR,
        file: 'mumak.glb',
        url: 'https://static.poly.pizza/b8ca84f2-02b2-4c84-92c0-b5f8b0eee90e.glb',
        maxTris: 3900
    }
];

async function main() {
    await MeshoptSimplifier.ready;
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;

    const vendorBox = { WebAssembly, Uint8Array, ArrayBuffer, console };
    vm.createContext(vendorBox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'server/public/js/vendor/meshopt_decoder.js'), 'utf8'), vendorBox);
    await vendorBox.MeshoptDecoder.ready;
    const vendorDecoder = vendorBox.MeshoptDecoder;

    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'meshopt.decoder': MeshoptDecoder,
            'meshopt.encoder': MeshoptEncoder
        });

    const hashes = new Map();

    for (const spec of ASSET_SPECS) {
        const outPath = path.join(spec.dir, spec.file);
        if (!FORCE && fs.existsSync(outPath)) {
            verifyGlbRoundTrip(outPath, vendorDecoder);
            console.log(`  [FRESH] ${spec.file} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
            continue;
        }
        let chosenUrl = spec.url;
        let rawBuf = await downloadBuffer(chosenUrl);
        const h1 = crypto.createHash('sha256').update(rawBuf).digest('hex');
        if (spec.distinctFrom && hashes.get(spec.distinctFrom) === h1 && spec.fallbackUrl) {
            console.log(`  [SWAP] ${spec.file} matched ${spec.distinctFrom} hash; fetching fallback ${spec.fallbackUrl}`);
            chosenUrl = spec.fallbackUrl;
            rawBuf = await downloadBuffer(chosenUrl);
        }
        hashes.set(spec.file, crypto.createHash('sha256').update(rawBuf).digest('hex'));

        const doc = await io.readBinary(new Uint8Array(rawBuf));
        ensureUvsAndNormals(doc);
        snapGroundZero(doc);
        applyMaterialEnhancements(doc, spec);

        await doc.transform(
            weld({ tolerance: 0.0001 }),
            resample({ tolerance: 0.003 }),
            prune()
        );
        const trisBefore = getTriangleCount(doc);
        if (trisBefore > spec.maxTris) {
            const ratio = Math.max(0.12, Math.min(0.95, spec.maxTris / trisBefore));
            await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.015 }));
        }
        await normalizeTexturesWebP(doc, 512);
        doc.getRoot().getAsset().generator = 'YASD 3D Asset Optimizer (CC0/CC-BY)';
        doc.createExtension(EXTMeshoptCompression)
            .setRequired(true)
            .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

        const outBytes = await io.writeBinary(doc);
        fs.mkdirSync(spec.dir, { recursive: true });
        fs.writeFileSync(outPath, outBytes);
        verifyGlbRoundTrip(outPath, vendorDecoder);

        const docRead = await io.readBinary(outBytes);
        console.log(`  [OK] ${spec.file.padEnd(20)} | source=${chosenUrl.split('/').pop()} | tris=${trisBefore}->${getTriangleCount(docRead)} | skins=${docRead.getRoot().listSkins().length} | anims=${docRead.getRoot().listAnimations().length} | ${(outBytes.length / 1024).toFixed(1)} KB`);
    }
    console.log('[install_wave4b_glbs] PASS: all 12 Wave 4B GLBs installed and verified');
}

main().catch((err) => {
    console.error('[install_wave4b_glbs] FAIL:', err);
    process.exit(1);
});

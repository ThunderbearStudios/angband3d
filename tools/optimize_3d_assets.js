#!/usr/bin/env node
/**
 * tools/optimize_3d_assets.js
 *
 * Wave 2B-2 Canary-Verified 3D Model Optimizer for YASD 3D:
 *   1. Exact LBS Static-Bake for 0-anim heavy skins (e.g. werewolf.glb 376 -> 0 bones)
 *   2. Lossless unweighted-joint skin compaction when skin.joints > 80 (e.g. MountainLion 301 -> 106)
 *   3. Animation keyframe resampling (resample tolerance 0.003)
 *   4. Meshopt edge-preserving decimation (street_rat<=2400, wasp<=3800, MountainLion<=8000, heavy props<=3800, other static>10k<=4800)
 *   5. Pure-Float32 EXT_meshopt_compression (EncoderMethod.FILTER, ZERO KHR_mesh_quantization for Three.js r128 compatibility)
 *   6. WebP texture cap (1024 characters, 512 items/props/bestiary) without re-encoding compliant WebP textures
 *   7. Round-trip verification via bundled server/public/js/vendor/meshopt_decoder.js + archive mirror parity
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ASSETS_ROOT = path.join(ROOT, 'server', 'public', 'assets');
const MODEL_DIRS = [
    path.join(ASSETS_ROOT, 'models'),
    path.join(ASSETS_ROOT, 'polyhaven', 'models')
];
const ARCHIVE_BESTIARY_DIR = path.join(ROOT, 'archive', 'godot-client-v1', 'assets', 'models', 'monsters', 'bestiary');
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
const { ALL_EXTENSIONS, EXTMeshoptCompression } = resolveCachedPkg('@gltf-transform/extensions');
const { simplify, weld, resample, prune, cloneDocument } = resolveCachedPkg('@gltf-transform/functions');
const { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } = resolveCachedPkg('meshoptimizer');
const sharp = resolveCachedPkg('sharp');

const GROUND_ZERO_MODELS = new Set(['frost_construct.glb', 'YetiSmall.glb', 'cockatrice.glb']);
const BOUNDED_VERT_MODELS = new Set(['wolf.glb', 'husky.glb', 'werewolf.glb']);
const TARGET_3800_MODELS = new Set([
    'wasp.glb',
    'treasure_chest.gltf',
    'pine_roots.gltf',
    'decorative_book_set_01.gltf',
    'brass_candleholders.gltf',
    'pachira_aquatica_01.gltf'
]);

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

function copyTree(srcDir, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true });
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, ent.name);
        const d = path.join(dstDir, ent.name);
        if (ent.isDirectory()) copyTree(s, d);
        else fs.copyFileSync(s, d);
    }
}

function parseGltfJsonAndBins(filePath) {
    try {
        if (filePath.toLowerCase().endsWith('.gltf')) {
            const dir = path.dirname(filePath);
            const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const bufs = (j.buffers || []).map((b) => {
                if (!b.uri) return Buffer.alloc(0);
                if (b.uri.startsWith('data:')) {
                    return Buffer.from(b.uri.split(',')[1] || '', 'base64');
                }
                const bp = path.join(dir, b.uri);
                return fs.existsSync(bp) ? fs.readFileSync(bp) : Buffer.alloc(0);
            });
            return { json: j, bufs };
        }
        const buf = fs.readFileSync(filePath);
        if (buf.length < 24 || buf.toString('utf8', 0, 4) !== 'glTF') return null;
        const jsonLen = buf.readUInt32LE(12);
        const json = JSON.parse(buf.toString('utf8', 20, Math.min(buf.length, 20 + jsonLen)));
        const binHdrOff = 20 + jsonLen;
        const binChunk = (binHdrOff + 8 <= buf.length) ? buf.subarray(binHdrOff + 8) : Buffer.alloc(0);
        return { json, bufs: [binChunk] };
    } catch (_) {
        return null;
    }
}

function isSafeFloat32AndValidMeshopt(filePath, vendorDecoder) {
    const parsed = parseGltfJsonAndBins(filePath);
    if (!parsed) return false;
    const { json: j, bufs } = parsed;
    const exts = new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])]);
    if (exts.has('KHR_mesh_quantization')) return false;

    const accs = j.accessors || [];
    let totalVerts = 0;
    for (const m of (j.meshes || [])) {
        for (const p of (m.primitives || [])) {
            const posIdx = p && p.attributes ? p.attributes.POSITION : undefined;
            if (posIdx === undefined) continue;
            const acc = accs[posIdx];
            if (!acc || acc.componentType !== 5126 || !acc.count) return false;
            if (Array.isArray(acc.min) && acc.min.some(v => !Number.isFinite(v))) return false;
            if (Array.isArray(acc.max) && acc.max.some(v => !Number.isFinite(v))) return false;
            totalVerts += acc.count;
        }
    }
    if (totalVerts <= 0) return false;
    if (BOUNDED_VERT_MODELS.has(path.basename(filePath)) && (totalVerts < 1500 || totalVerts > 35000)) {
        return false;
    }

    for (const bv of (j.bufferViews || [])) {
        const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
        if (!ext) continue;
        const srcBuf = bufs[ext.buffer || 0];
        if (!srcBuf || srcBuf.length < (ext.byteOffset || 0) + ext.byteLength) return false;
        const dst = new Uint8Array(ext.count * ext.byteStride);
        const src = new Uint8Array(srcBuf.buffer, srcBuf.byteOffset + (ext.byteOffset || 0), ext.byteLength);
        try {
            vendorDecoder.decodeGltfBuffer(dst, ext.count, ext.byteStride, src, ext.mode, ext.filter);
        } catch (_) {
            return false;
        }
    }
    return true;
}

function shouldSkipModel(filePath) {
    const parsed = parseGltfJsonAndBins(filePath);
    if (!parsed) return false;
    const j = parsed.json;
    const exts = new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])]);
    return exts.has('EXT_meshopt_compression') && !exts.has('KHR_mesh_quantization');
}

function hasMissingExternalDeps(gltfPath) {
    try {
        const j = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
        const dir = path.dirname(gltfPath);
        for (const b of (j.buffers || [])) {
            if (b.uri && !b.uri.startsWith('data:') && !fs.existsSync(path.join(dir, b.uri))) return true;
        }
        for (const img of (j.images || [])) {
            if (img.uri && !img.uri.startsWith('data:') && !fs.existsSync(path.join(dir, img.uri))) return true;
        }
        return false;
    } catch (_) {
        return true;
    }
}

function mulMat4(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[c * 4 + r] =
                a[r] * b[c * 4] +
                a[4 + r] * b[c * 4 + 1] +
                a[8 + r] * b[c * 4 + 2] +
                a[12 + r] * b[c * 4 + 3];
        }
    }
    return out;
}

function invertMat4(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (Math.abs(det) < 1e-12) return null;
    det = 1.0 / det;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
}

function bakeStaticHeavySkins(doc) {
    if (doc.getRoot().listAnimations().length > 0) return false;
    let baked = false;
    for (const node of doc.getRoot().listNodes()) {
        const skin = node.getSkin();
        const mesh = node.getMesh();
        if (!skin || !mesh) continue;
        const joints = skin.listJoints();
        if (joints.length <= 80) continue;
        if (mesh.listPrimitives().some(p => p.listTargets().length > 0)) continue;

        const meshInv = invertMat4(node.getWorldMatrix());
        if (!meshInv) continue;
        const ibmAcc = skin.getInverseBindMatrices();
        const jointMats = new Array(joints.length);
        const ibmTmp = new Array(16).fill(0);
        for (let j = 0; j < joints.length; j++) {
            if (ibmAcc) ibmAcc.getElement(j, ibmTmp);
            else { ibmTmp.fill(0); ibmTmp[0] = ibmTmp[5] = ibmTmp[10] = ibmTmp[15] = 1; }
            jointMats[j] = mulMat4(meshInv, mulMat4(joints[j].getWorldMatrix(), ibmTmp));
        }

        const pArr = [0, 0, 0], nArr = [0, 0, 1], jArr = [0, 0, 0, 0], wArr = [1, 0, 0, 0];
        const mBlend = new Float32Array(16);
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute('POSITION');
            const jointsAttr = prim.getAttribute('JOINTS_0');
            const weightsAttr = prim.getAttribute('WEIGHTS_0');
            if (!pos || !jointsAttr || !weightsAttr) continue;
            const norm = prim.getAttribute('NORMAL');
            const count = pos.getCount();
            const outPos = new Float32Array(count * 3);
            const outNorm = norm ? new Float32Array(count * 3) : null;

            for (let i = 0; i < count; i++) {
                pos.getElement(i, pArr);
                jointsAttr.getElement(i, jArr);
                weightsAttr.getElement(i, wArr);
                let wSum = wArr[0] + wArr[1] + wArr[2] + wArr[3];
                if (wSum <= 1e-8) { wArr[0] = 1; wArr[1] = 0; wArr[2] = 0; wArr[3] = 0; wSum = 1; }
                const invW = 1.0 / wSum;
                mBlend.fill(0);
                for (let k = 0; k < 4; k++) {
                    const w = wArr[k] * invW;
                    if (w <= 0) continue;
                    const jm = jointMats[jArr[k]] || jointMats[0];
                    for (let c = 0; c < 16; c++) mBlend[c] += jm[c] * w;
                }
                const px = pArr[0], py = pArr[1], pz = pArr[2];
                outPos[i * 3] = mBlend[0] * px + mBlend[4] * py + mBlend[8] * pz + mBlend[12];
                outPos[i * 3 + 1] = mBlend[1] * px + mBlend[5] * py + mBlend[9] * pz + mBlend[13];
                outPos[i * 3 + 2] = mBlend[2] * px + mBlend[6] * py + mBlend[10] * pz + mBlend[14];

                if (outNorm) {
                    norm.getElement(i, nArr);
                    const invM = invertMat4(mBlend);
                    let nx, ny, nz;
                    if (invM) {
                        nx = invM[0] * nArr[0] + invM[1] * nArr[1] + invM[2] * nArr[2];
                        ny = invM[4] * nArr[0] + invM[5] * nArr[1] + invM[6] * nArr[2];
                        nz = invM[8] * nArr[0] + invM[9] * nArr[1] + invM[10] * nArr[2];
                    } else {
                        nx = mBlend[0] * nArr[0] + mBlend[4] * nArr[1] + mBlend[8] * nArr[2];
                        ny = mBlend[1] * nArr[0] + mBlend[5] * nArr[1] + mBlend[9] * nArr[2];
                        nz = mBlend[2] * nArr[0] + mBlend[6] * nArr[1] + mBlend[10] * nArr[2];
                    }
                    const nLen = Math.hypot(nx, ny, nz) || 1;
                    outNorm[i * 3] = nx / nLen;
                    outNorm[i * 3 + 1] = ny / nLen;
                    outNorm[i * 3 + 2] = nz / nLen;
                }
            }
            prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(outPos));
            if (outNorm) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(outNorm));
            prim.setAttribute('JOINTS_0', null);
            prim.setAttribute('WEIGHTS_0', null);
        }
        node.setSkin(null);
        skin.dispose();
        baked = true;
    }
    return baked;
}

function compactHeavyAnimatedSkins(doc) {
    let compacted = false;
    for (const skin of doc.getRoot().listSkins()) {
        const oldJoints = skin.listJoints();
        if (oldJoints.length <= 80) continue;
        const meshNodes = doc.getRoot().listNodes().filter(n => n.getSkin() === skin && n.getMesh());
        if (meshNodes.length === 0) continue;

        const usedSet = new Set();
        const jArr = [0, 0, 0, 0], wArr = [0, 0, 0, 0];
        for (const mn of meshNodes) {
            for (const prim of mn.getMesh().listPrimitives()) {
                const ja = prim.getAttribute('JOINTS_0');
                const wa = prim.getAttribute('WEIGHTS_0');
                if (!ja || !wa) continue;
                for (let i = 0; i < ja.getCount(); i++) {
                    ja.getElement(i, jArr);
                    wa.getElement(i, wArr);
                    for (let k = 0; k < 4; k++) if (wArr[k] > 1e-5) usedSet.add(jArr[k]);
                }
            }
        }
        const usedOld = [...usedSet].filter(idx => idx >= 0 && idx < oldJoints.length).sort((a, b) => a - b);
        if (usedOld.length === 0 || usedOld.length >= oldJoints.length) continue;

        const oldToNew = new Map();
        usedOld.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx));

        const oldIbm = skin.getInverseBindMatrices();
        if (oldIbm) {
            const newIbmArr = new Float32Array(usedOld.length * 16);
            const mat = new Array(16);
            for (let k = 0; k < usedOld.length; k++) {
                oldIbm.getElement(usedOld[k], mat);
                newIbmArr.set(mat, k * 16);
            }
            skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(newIbmArr));
        }

        const newJoints = usedOld.map(idx => oldJoints[idx]);
        for (const j of oldJoints) skin.removeJoint(j);
        for (const nj of newJoints) skin.addJoint(nj);

        const useU8 = newJoints.length <= 256;
        for (const mn of meshNodes) {
            for (const prim of mn.getMesh().listPrimitives()) {
                const ja = prim.getAttribute('JOINTS_0');
                const wa = prim.getAttribute('WEIGHTS_0');
                if (!ja) continue;
                const count = ja.getCount();
                const outArr = useU8 ? new Uint8Array(count * 4) : new Uint16Array(count * 4);
                for (let i = 0; i < count; i++) {
                    ja.getElement(i, jArr);
                    if (wa) wa.getElement(i, wArr);
                    for (let k = 0; k < 4; k++) {
                        const remapped = oldToNew.get(jArr[k]);
                        outArr[i * 4 + k] = (remapped !== undefined) ? remapped : 0;
                        if (remapped === undefined && wa) wArr[k] = 0;
                    }
                    if (wa) wa.setElement(i, wArr);
                }
                prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(outArr));
            }
        }
        compacted = true;
    }
    return compacted;
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

function snapGroundZeroIfRequired(doc, fileName) {
    if (!GROUND_ZERO_MODELS.has(fileName)) return;
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

async function normalizeTexturesWebP(doc, maxDim) {
    for (const tex of doc.getRoot().listTextures()) {
        const img = tex.getImage();
        if (!img || img.byteLength === 0) continue;
        const mime = tex.getMimeType();
        const meta = await sharp(Buffer.from(img)).metadata();
        const needsResize = (meta.width > maxDim || meta.height > maxDim);
        const needsWebP = (mime !== 'image/webp');
        if (!needsResize && !needsWebP) continue;

        let pipe = sharp(Buffer.from(img));
        if (needsResize) {
            pipe = pipe.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
        }
        const out = await pipe.webp({ quality: 86, effort: 4 }).toBuffer();
        tex.setImage(new Uint8Array(out));
        tex.setMimeType('image/webp');
        const uri = tex.getURI();
        if (uri) tex.setURI(uri.replace(/\.(png|jpg|jpeg)$/i, '.webp'));
    }
}

function syncArchiveMirror(filePath) {
    const norm = filePath.replace(/\\/g, '/');
    if (!norm.includes('/assets/models/monsters/') || !filePath.toLowerCase().endsWith('.glb')) return;
    const archPath = path.join(ARCHIVE_BESTIARY_DIR, path.basename(filePath));
    if (fs.existsSync(archPath)) {
        fs.copyFileSync(filePath, archPath);
    }
}

function measureModelsBytes(files) {
    let total = 0;
    const seenDirs = new Set();
    for (const f of files) {
        if (f.toLowerCase().endsWith('.glb')) {
            total += fs.statSync(f).size;
        } else {
            const d = path.dirname(f);
            if (seenDirs.has(d)) continue;
            seenDirs.add(d);
            for (const sub of walk(d)) {
                if (/\.(gltf|bin|png|jpg|jpeg|webp)$/i.test(sub)) total += fs.statSync(sub).size;
            }
        }
    }
    return total;
}

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

    const allFiles = MODEL_DIRS.flatMap(d => walk(d)).filter(f => /\.(glb|gltf)$/i.test(f));
    const beforeBytes = measureModelsBytes(allFiles);
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-opt3d-w2b2-'));
    let converted = 0, skipped = 0, failed = 0;

    try {
        for (const src of allFiles) {
            if (src.toLowerCase().endsWith('.gltf') && hasMissingExternalDeps(src)) { skipped++; continue; }
            if (!FORCE && shouldSkipModel(src)) { skipped++; continue; }
            const rel = path.relative(ASSETS_ROOT, src);
            const baseName = path.basename(src);
            const norm = src.replace(/\\/g, '/');
            const isCharOrMonster = norm.includes('/monsters/') || norm.includes('/characters/');
            const texCap = (isCharOrMonster && !norm.includes('/bestiary/')) ? 1024 : 512;

            try {
                const doc = await io.read(src);
                const beforeTris = getTriangleCount(doc);
                const beforeBones = doc.getRoot().listSkins().reduce((s, sk) => s + sk.listJoints().length, 0);

                const bakedStaticSkin = bakeStaticHeavySkins(doc);
                const compactedSkin = compactHeavyAnimatedSkins(doc);
                if (doc.getRoot().listAnimations().length > 0) {
                    await doc.transform(resample({ tolerance: 0.003 }));
                }

                const hasMorphs = doc.getRoot().listMeshes().some(m => m.listPrimitives().some(p => p.listTargets().length > 0));
                let targetTris = null;
                if (baseName === 'street_rat.gltf') targetTris = 2400;
                else if (baseName === 'MountainLion.glb') targetTris = 8000;
                else if (TARGET_3800_MODELS.has(baseName)) targetTris = 3800;
                else if (doc.getRoot().listSkins().length === 0 && !hasMorphs && beforeTris > 10000) targetTris = 4800;

                let simplified = false;
                if (targetTris && beforeTris > targetTris * 1.05) {
                    const ratio = Math.max(0.02, Math.min(0.95, targetTris / beforeTris));
                    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: true }));
                    const midTris = getTriangleCount(doc);
                    if (doc.getRoot().listSkins().length === 0 && doc.getRoot().listAnimations().length === 0 && !hasMorphs && midTris > targetTris * 1.35) {
                        const ratio2 = Math.max(0.02, Math.min(0.95, targetTris / midTris));
                        await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: ratio2, error: 0.1, lockBorder: false }));
                    }
                    snapGroundZeroIfRequired(doc, baseName);
                    simplified = true;
                }

                await normalizeTexturesWebP(doc, texCap);
                await doc.transform(prune({ keepAttributes: true }));

                let useMeshopt = true;
                if (baseName === 'wand.glb') {
                    const probeDoc = cloneDocument(doc);
                    probeDoc.createExtension(EXTMeshoptCompression)
                        .setRequired(true)
                        .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
                    const probeBin = await io.writeBinary(probeDoc);
                    if (probeBin.byteLength < 10500) useMeshopt = false;
                }
                if (useMeshopt) {
                    doc.createExtension(EXTMeshoptCompression)
                        .setRequired(true)
                        .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
                }

                const afterTris = getTriangleCount(doc);
                const afterBones = doc.getRoot().listSkins().reduce((s, sk) => s + sk.listJoints().length, 0);
                const structuralWin = bakedStaticSkin || compactedSkin || simplified;

                if (src.toLowerCase().endsWith('.glb')) {
                    const dst = path.join(tmpRoot, rel.replace(/[^a-zA-Z0-9_.-]/g, '_'));
                    fs.mkdirSync(path.dirname(dst), { recursive: true });
                    await io.write(dst, doc);
                    const oldSz = fs.statSync(src).size;
                    const newSz = fs.existsSync(dst) ? fs.statSync(dst).size : Infinity;
                    if (isSafeFloat32AndValidMeshopt(dst, vendorDecoder) && (newSz < oldSz || (structuralWin && newSz <= oldSz * 1.1))) {
                        fs.copyFileSync(dst, src);
                        syncArchiveMirror(src);
                        converted++;
                        if (structuralWin || oldSz - newSz > 200 * 1024) {
                            console.log(`[opt3d] ${baseName}: ${(oldSz / 1024).toFixed(0)}->${(newSz / 1024).toFixed(0)} KB | tris ${beforeTris}->${afterTris} | bones ${beforeBones}->${afterBones}`);
                        }
                    } else {
                        skipped++;
                    }
                } else {
                    const modelDir = path.dirname(src);
                    const outDir = path.join(tmpRoot, 'gltf', rel.replace(/[^a-zA-Z0-9_.-]/g, '_'));
                    fs.mkdirSync(outDir, { recursive: true });
                    const dst = path.join(outDir, baseName);
                    await io.write(dst, doc);
                    if (fs.existsSync(dst) && isSafeFloat32AndValidMeshopt(dst, vendorDecoder)) {
                        const oldDirSz = walk(modelDir).reduce((s, f) => s + fs.statSync(f).size, 0);
                        const newDirSz = walk(outDir).reduce((s, f) => s + fs.statSync(f).size, 0);
                        if (newDirSz < oldDirSz || structuralWin) {
                            copyTree(outDir, modelDir);
                            converted++;
                            if (structuralWin || oldDirSz - newDirSz > 200 * 1024) {
                                console.log(`[opt3d] ${baseName}: dir ${(oldDirSz / 1024).toFixed(0)}->${(newDirSz / 1024).toFixed(0)} KB | tris ${beforeTris}->${afterTris}`);
                            }
                        } else {
                            skipped++;
                        }
                    } else {
                        skipped++;
                    }
                }
            } catch (err) {
                failed++;
                console.warn('[opt3d] WARN:', rel, err && err.message ? err.message : err);
            }
        }

        const referenced = new Set();
        for (const g of MODEL_DIRS.flatMap(d => walk(d)).filter(f => f.toLowerCase().endsWith('.gltf'))) {
            try {
                const j = JSON.parse(fs.readFileSync(g, 'utf8'));
                const gDir = path.dirname(g);
                for (const img of (j.images || [])) {
                    if (img && img.uri && !img.uri.startsWith('data:')) referenced.add(path.resolve(gDir, img.uri).toLowerCase());
                }
            } catch (_) {}
        }
        let prunedImgs = 0;
        for (const f of MODEL_DIRS.flatMap(d => walk(d))) {
            if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
            if (!referenced.has(path.resolve(f).toLowerCase())) {
                fs.unlinkSync(f);
                prunedImgs++;
            }
        }

        const afterBytes = measureModelsBytes(allFiles);
        console.log(`[optimize_3d_assets] converted=${converted}, skipped=${skipped}, failed=${failed}, prunedOldTextures=${prunedImgs}`);
        console.log(`[optimize_3d_assets] 3D Models + Textures: ${(beforeBytes / 1048576).toFixed(2)} MB -> ${(afterBytes / 1048576).toFixed(2)} MB (-${((1 - afterBytes / Math.max(1, beforeBytes)) * 100).toFixed(1)}%)`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main();

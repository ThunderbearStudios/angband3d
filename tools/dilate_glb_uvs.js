#!/usr/bin/env node
/**
 * tools/dilate_glb_uvs.js
 *
 * Wave 2B-2 Offline UV Gutter Dilation (+8px):
 *  - Replaces the runtime 9-tap GLSL fragment shader (_applyUvSeamBleedFix)
 *  - Rasterizes every primitive's TEXCOORD_0 triangles per baseColorTexture
 *  - Runs 8 iterative 8-neighbor dilation passes into uncovered UV gutters
 *  - Re-encodes modified textures as WebP at exact original WxH
 *  - Preserves Float32 POSITION accessors and bestiary archive mirror parity
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODEL_DIRS = [
    path.join(ROOT, 'server', 'public', 'assets', 'models'),
    path.join(ROOT, 'server', 'public', 'assets', 'polyhaven', 'models')
];
const ARCHIVE_BESTIARY_DIR = path.join(ROOT, 'archive', 'godot-client-v1', 'assets', 'models', 'monsters', 'bestiary');

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
const { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } = resolveCachedPkg('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = resolveCachedPkg('meshoptimizer');
const sharp = resolveCachedPkg('sharp');

function walkModels(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walkModels(full, out);
        else if (/\.(glb|gltf)$/i.test(ent.name)) out.push(full);
    }
    return out;
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

function copyTree(srcDir, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true });
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, ent.name);
        const d = path.join(dstDir, ent.name);
        if (ent.isDirectory()) copyTree(s, d);
        else fs.copyFileSync(s, d);
    }
}

function isSafeFloat32(filePath) {
    try {
        let j;
        if (filePath.toLowerCase().endsWith('.gltf')) {
            j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } else {
            const buf = fs.readFileSync(filePath);
            if (buf.length < 24 || buf.toString('utf8', 0, 4) !== 'glTF') return false;
            j = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
        }
        const exts = new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])]);
        if (exts.has('KHR_mesh_quantization')) return false;
        const accs = j.accessors || [];
        for (const m of (j.meshes || [])) {
            for (const p of (m.primitives || [])) {
                const pos = p && p.attributes ? p.attributes.POSITION : undefined;
                if (pos !== undefined && (!accs[pos] || accs[pos].componentType !== 5126)) return false;
            }
        }
        return true;
    } catch (_) {
        return false;
    }
}

function rasterizePrimitivesUvMask(prims, W, H) {
    const mask = new Uint8Array(W * H);
    const pointSegDistSq = (px, py, ax, ay, bx, by) => {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 1e-8) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        const cx = ax + t * dx, cy = ay + t * dy;
        return (px - cx) * (px - cx) + (py - cy) * (py - cy);
    };
    const markTri = (u0, v0, u1, v1, u2, v2) => {
        const tx = Math.floor((u0 + u1 + u2) / 3);
        const ty = Math.floor((v0 + v1 + v2) / 3);
        const x0 = (u0 - tx) * (W - 1), y0 = (v0 - ty) * (H - 1);
        const x1 = (u1 - tx) * (W - 1), y1 = (v1 - ty) * (H - 1);
        const x2 = (u2 - tx) * (W - 1), y2 = (v2 - ty) * (H - 1);
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1);
        const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)) + 1);
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1);
        const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)) + 1);
        const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
        for (let y = minY; y <= maxY; y++) {
            const py = y + 0.5;
            for (let x = minX; x <= maxX; x++) {
                const idx = y * W + x;
                if (mask[idx]) continue;
                const px = x + 0.5;
                if (area !== 0) {
                    const e0 = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
                    const e1 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
                    const e2 = (x0 - x2) * (py - y2) - (y0 - y2) * (px - x2);
                    const s = area > 0 ? 1 : -1;
                    if (e0 * s >= 0 && e1 * s >= 0 && e2 * s >= 0) {
                        mask[idx] = 1;
                        continue;
                    }
                }
                if (
                    pointSegDistSq(px, py, x0, y0, x1, y1) <= 0.65 ||
                    pointSegDistSq(px, py, x1, y1, x2, y2) <= 0.65 ||
                    pointSegDistSq(px, py, x2, y2, x0, y0) <= 0.65
                ) {
                    mask[idx] = 1;
                }
            }
        }
    };

    const a = [0, 0], b = [0, 0], c = [0, 0];
    for (const prim of prims) {
        const uv = prim.getAttribute('TEXCOORD_0');
        if (!uv) continue;
        const indices = prim.getIndices();
        if (indices) {
            const count = indices.getCount();
            for (let i = 0; i + 2 < count; i += 3) {
                uv.getElement(indices.getScalar(i), a);
                uv.getElement(indices.getScalar(i + 1), b);
                uv.getElement(indices.getScalar(i + 2), c);
                markTri(a[0], a[1], b[0], b[1], c[0], c[1]);
            }
        } else {
            const count = uv.getCount();
            for (let i = 0; i + 2 < count; i += 3) {
                uv.getElement(i, a);
                uv.getElement(i + 1, b);
                uv.getElement(i + 2, c);
                markTri(a[0], a[1], b[0], b[1], c[0], c[1]);
            }
        }
    }
    return mask;
}

function dilateRgba8Passes(rawBuf, mask, W, H, passes = 8) {
    let curPix = new Uint8Array(rawBuf);
    let nextPix = new Uint8Array(rawBuf);
    let curMask = new Uint8Array(mask);
    let nextMask = new Uint8Array(mask);
    let dilatedAny = false;

    for (let pass = 0; pass < passes; pass++) {
        let changed = false;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const idx = y * W + x;
                if (curMask[idx]) continue;
                let sr = 0, sg = 0, sb = 0, sa = 0, sw = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= H) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        if (nx < 0 || nx >= W) continue;
                        const nIdx = ny * W + nx;
                        if (!curMask[nIdx]) continue;
                        const w = (dx === 0 || dy === 0) ? 2 : 1;
                        const p = nIdx * 4;
                        sr += curPix[p] * w;
                        sg += curPix[p + 1] * w;
                        sb += curPix[p + 2] * w;
                        sa += curPix[p + 3] * w;
                        sw += w;
                    }
                }
                if (sw > 0) {
                    const p = idx * 4;
                    nextPix[p] = Math.round(sr / sw);
                    nextPix[p + 1] = Math.round(sg / sw);
                    nextPix[p + 2] = Math.round(sb / sw);
                    nextPix[p + 3] = Math.round(sa / sw);
                    nextMask[idx] = 1;
                    changed = true;
                    dilatedAny = true;
                }
            }
        }
        if (!changed) break;
        curPix.set(nextPix);
        curMask.set(nextMask);
    }
    return dilatedAny ? curPix : null;
}

function syncArchiveMirror(filePath) {
    const norm = filePath.replace(/\\/g, '/');
    if (!norm.includes('/assets/models/monsters/') || !filePath.toLowerCase().endsWith('.glb')) return;
    const archPath = path.join(ARCHIVE_BESTIARY_DIR, path.basename(filePath));
    if (fs.existsSync(archPath)) {
        fs.copyFileSync(filePath, archPath);
    }
}

async function main() {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'meshopt.decoder': MeshoptDecoder,
            'meshopt.encoder': MeshoptEncoder
        });

    const allModels = MODEL_DIRS.flatMap(d => walkModels(d));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-uv-dilate-'));
    let modelsVisited = 0;
    let modelsUpdated = 0;
    let texturesDilated = 0;
    let skipped = 0;

    try {
        for (const src of allModels) {
            if (src.toLowerCase().endsWith('.gltf') && hasMissingExternalDeps(src)) {
                skipped++;
                continue;
            }
            modelsVisited++;
            try {
                const doc = await io.read(src);
                const texToPrims = new Map();
                for (const mesh of doc.getRoot().listMeshes()) {
                    for (const prim of mesh.listPrimitives()) {
                        if (!prim.getAttribute('TEXCOORD_0')) continue;
                        const mat = prim.getMaterial();
                        const sgExt = mat ? mat.getExtension('KHR_materials_pbrSpecularGlossiness') : null;
                        const tex = (mat ? mat.getBaseColorTexture() : null) || (sgExt && typeof sgExt.getDiffuseTexture === 'function' ? sgExt.getDiffuseTexture() : null);
                        if (!tex) continue;
                        if (!texToPrims.has(tex)) texToPrims.set(tex, []);
                        texToPrims.get(tex).push(prim);
                    }
                }
                let docModified = false;
                for (const [tex, prims] of texToPrims.entries()) {
                    const imgBytes = tex.getImage();
                    if (!imgBytes || imgBytes.byteLength === 0) continue;
                    const origMeta = await sharp(Buffer.from(imgBytes)).metadata();
                    const origChannels = origMeta.channels || 3;
                    const { data, info } = await sharp(Buffer.from(imgBytes))
                        .ensureAlpha()
                        .raw()
                        .toBuffer({ resolveWithObject: true });
                    const W = info.width, H = info.height;
                    if (!W || !H || W * H > 2048 * 2048) continue;

                    const mask = rasterizePrimitivesUvMask(prims, W, H);
                    let covered = 0;
                    for (let i = 0; i < mask.length; i++) if (mask[i]) covered++;
                    if (covered === 0 || (mask.length - covered) < 4) continue;

                    const outRgba = dilateRgba8Passes(data, mask, W, H, 8);
                    if (!outRgba) continue;

                    let pipe = sharp(Buffer.from(outRgba), { raw: { width: W, height: H, channels: 4 } });
                    if (origChannels < 4) pipe = pipe.removeAlpha();
                    const webpBuf = await pipe.webp({ quality: 88, effort: 4 }).toBuffer();
                    tex.setImage(new Uint8Array(webpBuf));
                    tex.setMimeType('image/webp');
                    const uri = tex.getURI();
                    if (uri) tex.setURI(uri.replace(/\.(png|jpg|jpeg)$/i, '.webp'));
                    texturesDilated++;
                    docModified = true;
                }

                if (!docModified) continue;

                if (src.toLowerCase().endsWith('.glb')) {
                    const dst = path.join(tmpRoot, path.basename(src));
                    await io.write(dst, doc);
                    if (fs.existsSync(dst) && fs.statSync(dst).size > 128 && isSafeFloat32(dst)) {
                        fs.copyFileSync(dst, src);
                        syncArchiveMirror(src);
                        modelsUpdated++;
                    }
                } else {
                    const modelDir = path.dirname(src);
                    const subOut = path.join(tmpRoot, 'gltf', String(modelsVisited));
                    fs.mkdirSync(subOut, { recursive: true });
                    const dst = path.join(subOut, path.basename(src));
                    await io.write(dst, doc);
                    if (fs.existsSync(dst) && isSafeFloat32(dst)) {
                        copyTree(subOut, modelDir);
                        modelsUpdated++;
                    }
                }
            } catch (err) {
                skipped++;
                console.warn('[dilate_glb_uvs] SKIP:', path.relative(ROOT, src), err && err.message ? err.message : err);
            }
        }
        console.log(`[dilate_glb_uvs] visited=${modelsVisited}, updated=${modelsUpdated}, texturesDilated=${texturesDilated}, skipped=${skipped}`);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error('[dilate_glb_uvs] FATAL:', err);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * tools/upgrade_v13_1_visual_overhaul.js
 * YASD 3D v13.1.0 — Bestiary, Item & Dungeon Prop Visual Overhaul
 *
 * Replaces cartoon puppies, origami low-poly blocks, teddy-bear "centipedes",
 * pastel plushie "worms", high-poly Tripo/Meshy statues, and multi-MB bloat GLBs
 * with genuine, dark-fantasy rigged/sculpted 3rd-party CC-BY / CC0 3D models,
 * normalized to <=512x512 embedded PBR PNGs, mirrored to archive/godot-client-v1/,
 * plus curated Medieval Fantasy MegaKit dungeon props in server/public/assets/models/props/.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BESTIARY_DIR = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
const ARCHIVE_BESTIARY_DIR = path.join(ROOT, 'archive/godot-client-v1/assets/models/monsters/bestiary');
const ITEMS_DIR = path.join(ROOT, 'server/public/assets/models/items');
const ARCHIVE_ITEMS_DIR = path.join(ROOT, 'archive/godot-client-v1/assets/models/items');
const PROPS_SRC_DIR = path.join(ROOT, 'archive/godot-client-v1/assets/models/props');
const PROPS_DEST_DIR = path.join(ROOT, 'server/public/assets/models/props');
const CACHE_DIR = path.join(os.tmpdir(), 'yasd3d_v131_objaverse_cache');
const ENV_CAND_DIR = process.env.YASD_CAND_CACHE_DIR || '';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const cb = Buffer.alloc(4);
    cb.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, cb]);
}
function encodePng(width, height, pixelBuf, colorType = 6) {
    const channels = colorType === 2 ? 3 : (colorType === 0 ? 1 : (colorType === 4 ? 2 : 4));
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    const rowBytes = width * channels;
    const raw = Buffer.alloc(height * (1 + rowBytes));
    for (let y = 0; y < height; y++) {
        const dstRow = y * (1 + rowBytes);
        raw[dstRow] = 1;
        const srcRow = y * rowBytes;
        for (let x = 0; x < rowBytes; x++) {
            const left = x >= channels ? pixelBuf[srcRow + x - channels] : 0;
            raw[dstRow + 1 + x] = (pixelBuf[srcRow + x] - left) & 0xff;
        }
    }
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}
function paethPredictor(a, b, c) {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}
function decodePng(buf) {
    assert(buf.length >= 33 && buf[0] === 0x89 && buf[1] === 0x50, 'Invalid PNG');
    let offset = 8, width = 0, height = 0, bitDepth = 8, colorType = 2;
    const idatChunks = [];
    let palette = null;
    while (offset + 8 <= buf.length) {
        const len = buf.readUInt32BE(offset);
        const type = buf.toString('ascii', offset + 4, offset + 8);
        const ds = offset + 8, de = ds + len;
        if (type === 'IHDR') {
            width = buf.readUInt32BE(ds); height = buf.readUInt32BE(ds + 4);
            bitDepth = buf[ds + 8]; colorType = buf[ds + 9];
        } else if (type === 'PLTE') palette = buf.subarray(ds, de);
        else if (type === 'IDAT') idatChunks.push(buf.subarray(ds, de));
        else if (type === 'IEND') break;
        offset = de + 4;
    }
    if (bitDepth !== 8) {
        const tmpPng = path.join(os.tmpdir(), `yasd_bd_${process.pid}_${Date.now()}.png`);
        const tmpOut = path.join(os.tmpdir(), `yasd_bd8_${process.pid}_${Date.now()}.png`);
        try {
            fs.writeFileSync(tmpPng, buf);
            execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmpPng, '-pix_fmt', 'rgba', tmpOut]);
            return decodePng(fs.readFileSync(tmpOut));
        } finally {
            try { fs.unlinkSync(tmpPng); } catch (_) {}
            try { fs.unlinkSync(tmpOut); } catch (_) {}
        }
    }
    const ch = colorType === 2 ? 3 : (colorType === 6 ? 4 : (colorType === 0 ? 1 : (colorType === 4 ? 2 : 1)));
    const stride = width * ch;
    const inf = zlib.inflateSync(Buffer.concat(idatChunks));
    const raw = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const ir = y * (stride + 1), f = inf[ir], or = y * stride, pr = (y - 1) * stride;
        for (let i = 0; i < stride; i++) {
            const xv = inf[ir + 1 + i];
            const a = i >= ch ? raw[or + i - ch] : 0;
            const b = y > 0 ? raw[pr + i] : 0;
            const c = (y > 0 && i >= ch) ? raw[pr + i - ch] : 0;
            raw[or + i] = f === 0 ? xv : f === 1 ? (xv + a) & 0xff : f === 2 ? (xv + b) & 0xff : f === 3 ? (xv + ((a + b) >> 1)) & 0xff : (xv + paethPredictor(a, b, c)) & 0xff;
        }
    }
    if (colorType === 3 && palette) {
        const rgb = Buffer.alloc(width * height * 3);
        for (let i = 0; i < width * height; i++) {
            const pi = raw[i] * 3;
            rgb[i * 3] = palette[pi]; rgb[i * 3 + 1] = palette[pi + 1]; rgb[i * 3 + 2] = palette[pi + 2];
        }
        return { width, height, channels: 3, colorType: 2, data: rgb };
    }
    return { width, height, channels: ch, colorType, data: raw };
}
function downscalePng(pngBuf, targetDim = 512, isNormal = false, recolorFn = null) {
    const img = decodePng(pngBuf);
    const srcW = img.width, srcH = img.height, ch = img.channels;
    const dstW = Math.min(targetDim, srcW), dstH = Math.min(targetDim, srcH);
    if (dstW === srcW && dstH === srcH && !recolorFn && img.colorType !== 3) {
        return { buffer: pngBuf, decoded: img };
    }
    const dst = Buffer.alloc(dstW * dstH * ch);
    for (let dy = 0; dy < dstH; dy++) {
        const sy0 = Math.floor((dy * srcH) / dstH), sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * srcH) / dstH));
        for (let dx = 0; dx < dstW; dx++) {
            const sx0 = Math.floor((dx * srcW) / dstW), sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * srcW) / dstW));
            const out = (dy * dstW + dx) * ch;
            if (isNormal && ch >= 3) {
                let nx = 0, ny = 0, nz = 0, a = 0, cnt = 0;
                for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
                    const si = (sy * srcW + sx) * ch;
                    nx += (img.data[si] / 255) * 2 - 1; ny += (img.data[si + 1] / 255) * 2 - 1; nz += (img.data[si + 2] / 255) * 2 - 1;
                    if (ch === 4) a += img.data[si + 3];
                    cnt++;
                }
                const len = Math.hypot(nx, ny, nz) || 1;
                dst[out] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
                dst[out + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
                dst[out + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
                if (ch === 4) dst[out + 3] = Math.round(a / cnt);
            } else {
                const sums = [0, 0, 0, 0];
                let cnt = 0;
                for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
                    const si = (sy * srcW + sx) * ch;
                    for (let c = 0; c < ch; c++) sums[c] += img.data[si + c];
                    cnt++;
                }
                for (let c = 0; c < ch; c++) dst[out + c] = Math.round(sums[c] / cnt);
                if (recolorFn && ch >= 3) {
                    const [nr, ng, nb] = recolorFn(dst[out], dst[out + 1], dst[out + 2]);
                    dst[out] = Math.max(0, Math.min(255, Math.round(nr)));
                    dst[out + 1] = Math.max(0, Math.min(255, Math.round(ng)));
                    dst[out + 2] = Math.max(0, Math.min(255, Math.round(nb)));
                }
            }
        }
    }
    const ctOut = img.colorType === 3 ? 2 : img.colorType;
    const outPng = encodePng(dstW, dstH, dst, ctOut);
    return { buffer: outPng, decoded: { width: dstW, height: dstH, channels: ch, colorType: ctOut, data: dst } };
}
function deriveNormalPng(decodedImg, bumpStrength = 2.0) {
    const W = decodedImg.width, H = decodedImg.height, ch = decodedImg.channels;
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
        const s = i * ch;
        const r = decodedImg.data[s] / 255;
        const g = ch >= 3 ? decodedImg.data[s + 1] / 255 : r;
        const b = ch >= 3 ? decodedImg.data[s + 2] / 255 : r;
        lum[i] = r * 0.299 + g * 0.587 + b * 0.114;
    }
    const rgb = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const hL = lum[y * W + ((x - 1 + W) % W)], hR = lum[y * W + ((x + 1) % W)];
        const hD = lum[((y - 1 + H) % H) * W + x], hU = lum[((y + 1) % H) * W + x];
        let dx = (hL - hR) * bumpStrength, dy = (hD - hU) * bumpStrength, dz = 1.0;
        const len = Math.hypot(dx, dy, dz) || 1;
        const out = (y * W + x) * 3;
        rgb[out] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
        rgb[out + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
        rgb[out + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
    }
    return encodePng(W, H, rgb, 2);
}

function hash2d(x, y, seed = 1) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}
function fbm(u, v, octaves = 4, seed = 1) {
    let val = 0, amp = 0.5, freq = 6;
    for (let i = 0; i < octaves; i++) {
        const x = u * freq, y = v * freq;
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = hash2d(ix, iy, seed + i * 13), b = hash2d(ix + 1, iy, seed + i * 13);
        const c = hash2d(ix, iy + 1, seed + i * 13), d = hash2d(ix + 1, iy + 1, seed + i * 13);
        val += ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) * amp;
        amp *= 0.5; freq *= 2.03;
    }
    return val;
}
function generatePbrTexturePair(theme) {
    const W = 512, H = 512;
    const base = Buffer.alloc(W * H * 3);
    const norm = Buffer.alloc(W * H * 3);
    const hMap = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        let pattern = fbm(u, v, 5, theme.seed) * 0.65 + fbm(u * 2.5, v * 2.5, 4, theme.seed + 37) * 0.35;
        if (theme.chitin) {
            const sx = (u * 22) % 1, sy = ((v * 22) + (Math.floor(u * 22) % 2) * 0.5) % 1;
            const d = Math.hypot(sx - 0.5, sy - 0.5);
            pattern = pattern * 0.42 + Math.max(0, 1 - d * 1.8) * 0.58;
        } else if (theme.rings) {
            pattern = pattern * 0.48 + (0.5 + 0.5 * Math.sin(u * Math.PI * 28)) * 0.52;
        }
        hMap[y * W + x] = pattern;
        const t = Math.min(1, Math.max(0, pattern));
        const idx = (y * W + x) * 3;
        base[idx] = Math.round(theme.c0[0] * (1 - t) + theme.c1[0] * t);
        base[idx + 1] = Math.round(theme.c0[1] * (1 - t) + theme.c1[1] * t);
        base[idx + 2] = Math.round(theme.c0[2] * (1 - t) + theme.c1[2] * t);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const hL = hMap[y * W + ((x - 1 + W) % W)], hR = hMap[y * W + ((x + 1) % W)];
        const hD = hMap[((y - 1 + H) % H) * W + x], hU = hMap[((y + 1) % H) * W + x];
        let dx = (hL - hR) * (theme.bumpStrength || 2.5), dy = (hD - hU) * (theme.bumpStrength || 2.5), dz = 1.0;
        const len = Math.hypot(dx, dy, dz) || 1;
        const idx = (y * W + x) * 3;
        norm[idx] = Math.round((dx / len * 0.5 + 0.5) * 255);
        norm[idx + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
        norm[idx + 2] = Math.round((dz / len * 0.5 + 0.5) * 255);
    }
    return { basePng: encodePng(W, H, base, 2), normPng: encodePng(W, H, norm, 2) };
}

function parseGlb(buf) {
    const jl = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jl));
    const binOff = 20 + jl;
    const bin = (binOff + 8 <= buf.length) ? Buffer.from(buf.subarray(binOff + 8, binOff + 8 + buf.readUInt32LE(binOff))) : Buffer.alloc(0);
    return { json, bin };
}
function buildGlb(json, bin) {
    let jb = Buffer.from(JSON.stringify(json), 'utf8');
    const jp = (4 - (jb.length % 4)) % 4;
    if (jp) jb = Buffer.concat([jb, Buffer.alloc(jp, 0x20)]);
    const bp = (4 - (bin.length % 4)) % 4;
    const pb = bp ? Buffer.concat([bin, Buffer.alloc(bp, 0x00)]) : bin;
    const total = 12 + 8 + jb.length + 8 + pb.length;
    const out = Buffer.alloc(total);
    out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jb.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jb.copy(out, 20);
    out.writeUInt32LE(pb.length, 20 + jb.length); out.writeUInt32LE(0x004e4942, 24 + jb.length); pb.copy(out, 28 + jb.length);
    return out;
}
function jpegToPngViaFfmpeg(jpegBuf, tag) {
    const tmpDir = os.tmpdir();
    const id = `yasd_v131_${process.pid}_${tag}_${Date.now()}`;
    const jpgPath = path.join(tmpDir, `${id}.jpg`);
    const pngPath = path.join(tmpDir, `${id}.png`);
    try {
        fs.writeFileSync(jpgPath, jpegBuf);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', jpgPath, pngPath]);
        return fs.readFileSync(pngPath);
    } finally {
        try { fs.unlinkSync(jpgPath); } catch (_) {}
        try { fs.unlinkSync(pngPath); } catch (_) {}
    }
}

function groundStaticPositionsMinYZero(json, bin) {
    let minY = Infinity;
    const posSet = new Set();
    for (const m of (json.meshes || [])) for (const p of (m.primitives || [])) {
        if (p.attributes && p.attributes.POSITION !== undefined) {
            const idx = p.attributes.POSITION;
            posSet.add(idx);
            const acc = json.accessors[idx];
            if (acc && acc.min) minY = Math.min(minY, acc.min[1]);
        }
    }
    if (!Number.isFinite(minY)) return;
    if (Math.abs(minY) >= 1e-5) {
        for (const idx of posSet) {
            const acc = json.accessors[idx];
            const bv = json.bufferViews[acc.bufferView];
            const stride = bv.byteStride || 12;
            const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
            for (let i = 0; i < acc.count; i++) {
                const off = base + i * stride + 4;
                bin.writeFloatLE(bin.readFloatLE(off) - minY, off);
            }
            if (acc.min) acc.min[1] -= minY;
            if (acc.max) acc.max[1] -= minY;
        }
    }
    const scene = json.scenes && json.scenes[0];
    if (scene && Array.isArray(scene.nodes)) {
        for (const rIdx of scene.nodes) {
            const rn = json.nodes[rIdx];
            if (rn && Array.isArray(rn.translation)) rn.translation[1] = 0;
        }
    }
}

function wrapSceneYaw(json, yawRad, name = 'v131_FacingRoot') {
    if (!yawRad || Math.abs(yawRad) < 1e-6) return;
    const scene = json.scenes && json.scenes[0];
    if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return;
    const half = yawRad * 0.5;
    const rootIdx = json.nodes.length;
    json.nodes.push({
        name,
        children: scene.nodes.slice(),
        rotation: [0, Math.sin(half), 0, Math.cos(half)]
    });
    scene.nodes = [rootIdx];
}

function processGlb(rawBuf, nameHint, opts = {}) {
    const { json, bin } = parseGlb(rawBuf);
    if (opts.groundStaticY0) groundStaticPositionsMinYZero(json, bin);
    if (opts.rootYaw) wrapSceneYaw(json, opts.rootYaw, opts.rootName || 'v131_FacingRoot');

    const chunks = [];
    let newLen = 0;
    const appendAligned = (buf) => {
        const pad = (4 - (newLen % 4)) % 4;
        if (pad) { chunks.push(Buffer.alloc(pad)); newLen += pad; }
        const off = newLen;
        chunks.push(buf);
        newLen += buf.length;
        return off;
    };

    const appendNewBufferView = (buf) => {
        const off = appendAligned(buf);
        const idx = json.bufferViews.length;
        json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
        return idx;
    };

    const normalImgSet = new Set();
    const emissiveImgSet = new Set();
    for (const m of (json.materials || [])) {
        if (m.normalTexture && m.normalTexture.index !== undefined) {
            const t = json.textures[m.normalTexture.index];
            if (t && t.source !== undefined) normalImgSet.add(t.source);
        }
        if (m.emissiveTexture && m.emissiveTexture.index !== undefined) {
            const t = json.textures[m.emissiveTexture.index];
            if (t && t.source !== undefined) emissiveImgSet.add(t.source);
        }
    }

    const imgBvMap = new Map();
    let firstDecoded = null;
    (json.images || []).forEach((im, idx) => {
        if (im.bufferView === undefined) return;
        const bv = json.bufferViews[im.bufferView];
        let slice = Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
        const isJpeg = slice[0] === 0xff && slice[1] === 0xd8;
        if (isJpeg) {
            slice = jpegToPngViaFfmpeg(slice, `${nameHint}_${idx}`);
            im.mimeType = 'image/png';
        }
        if (slice[0] === 0x89 && slice[1] === 0x50) {
            const isNorm = normalImgSet.has(idx) || /normal/i.test(im.name || '');
            const isEmis = emissiveImgSet.has(idx) && !opts.stripEmissive;
            const res = downscalePng(slice, 512, isNorm, (!isNorm && !isEmis) ? opts.recolorFn : null);
            if (!firstDecoded && !isNorm && !isEmis) firstDecoded = res.decoded;
            imgBvMap.set(im.bufferView, res.buffer);
        } else {
            imgBvMap.set(im.bufferView, slice);
        }
    });

    for (let i = 0; i < (json.bufferViews || []).length; i++) {
        const bv = json.bufferViews[i];
        const slice = imgBvMap.has(i) ? imgBvMap.get(i) : Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
        bv.byteOffset = appendAligned(slice);
        bv.byteLength = slice.length;
    }

    const curBin = Buffer.concat(chunks);
    for (const mesh of (json.meshes || [])) {
        for (const p of (mesh.primitives || [])) {
            const posAccIdx = p.attributes && p.attributes.POSITION;
            if (posAccIdx === undefined) continue;
            const posAcc = json.accessors[posAccIdx];
            const posBv = json.bufferViews[posAcc.bufferView];
            const stride = posBv.byteStride || 12;
            const absPosOff = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
            const vCount = posAcc.count;

            if (p.attributes.TEXCOORD_0 === undefined && posAcc.componentType === 5126) {
                const uvBuf = Buffer.alloc(vCount * 8);
                for (let i = 0; i < vCount; i++) {
                    const px = curBin.readFloatLE(absPosOff + i * stride);
                    const py = curBin.readFloatLE(absPosOff + i * stride + 4);
                    const pz = curBin.readFloatLE(absPosOff + i * stride + 8);
                    uvBuf.writeFloatLE((Math.atan2(px, pz) / (2 * Math.PI)) + 0.5, i * 8);
                    uvBuf.writeFloatLE((py * 0.5) + 0.5, i * 8 + 4);
                }
                const uvBv = appendNewBufferView(uvBuf);
                const uvAcc = json.accessors.length;
                json.accessors.push({ bufferView: uvBv, componentType: 5126, count: vCount, type: 'VEC2' });
                p.attributes.TEXCOORD_0 = uvAcc;
            }

            if (p.attributes.NORMAL === undefined && posAcc.componentType === 5126) {
                const accum = new Float32Array(vCount * 3);
                const getPos = (vi) => ([
                    curBin.readFloatLE(absPosOff + vi * stride),
                    curBin.readFloatLE(absPosOff + vi * stride + 4),
                    curBin.readFloatLE(absPosOff + vi * stride + 8)
                ]);
                const addTri = (ia, ib, ic) => {
                    const a = getPos(ia), b = getPos(ib), c = getPos(ic);
                    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
                    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
                    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                    for (const k of [ia, ib, ic]) {
                        accum[k * 3] += nx; accum[k * 3 + 1] += ny; accum[k * 3 + 2] += nz;
                    }
                };
                if (p.indices !== undefined) {
                    const ia = json.accessors[p.indices];
                    const ibv = json.bufferViews[ia.bufferView];
                    const istr = ibv.byteStride || (ia.componentType === 5125 ? 4 : (ia.componentType === 5123 ? 2 : 1));
                    const ioff = (ibv.byteOffset || 0) + (ia.byteOffset || 0);
                    const rd = (k) => {
                        const o = ioff + k * istr;
                        return ia.componentType === 5125 ? curBin.readUInt32LE(o) : (ia.componentType === 5123 ? curBin.readUInt16LE(o) : curBin.readUInt8(o));
                    };
                    for (let t = 0; t + 2 < ia.count; t += 3) addTri(rd(t), rd(t + 1), rd(t + 2));
                } else {
                    for (let t = 0; t + 2 < vCount; t += 3) addTri(t, t + 1, t + 2);
                }
                const normBuf = Buffer.alloc(vCount * 12);
                for (let i = 0; i < vCount; i++) {
                    let nx = accum[i * 3], ny = accum[i * 3 + 1], nz = accum[i * 3 + 2];
                    const l = Math.hypot(nx, ny, nz);
                    if (l > 1e-8) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
                    normBuf.writeFloatLE(nx, i * 12); normBuf.writeFloatLE(ny, i * 12 + 4); normBuf.writeFloatLE(nz, i * 12 + 8);
                }
                const normBv = appendNewBufferView(normBuf);
                const normAcc = json.accessors.length;
                json.accessors.push({ bufferView: normBv, componentType: 5126, count: vCount, type: 'VEC3' });
                p.attributes.NORMAL = normAcc;
                delete p.attributes.TANGENT;
            }
        }
    }

    if (!json.samplers || json.samplers.length === 0) {
        json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    }
    if (!json.images) json.images = [];
    if (!json.textures) json.textures = [];
    if (!json.materials || json.materials.length === 0) json.materials = [{ name: `${nameHint}_PBR` }];

    if (opts.proceduralTheme) {
        const { basePng, normPng } = generatePbrTexturePair(opts.proceduralTheme);
        const baseBv = appendNewBufferView(basePng);
        const baseImg = json.images.length;
        json.images.push({ bufferView: baseBv, mimeType: 'image/png', name: `${nameHint}_baseColor_512` });
        const baseTex = json.textures.length;
        json.textures.push({ sampler: 0, source: baseImg });

        const normBv = appendNewBufferView(normPng);
        const normImg = json.images.length;
        json.images.push({ bufferView: normBv, mimeType: 'image/png', name: `${nameHint}_normal_512` });
        const normTex = json.textures.length;
        json.textures.push({ sampler: 0, source: normImg });

        for (let mi = 0; mi < json.materials.length; mi++) {
            const m = json.materials[mi];
            if (!m.pbrMetallicRoughness) m.pbrMetallicRoughness = {};
            const slotFactor = opts.slotFactors && (opts.slotFactors[m.name] || opts.slotFactors[mi]);
            if (slotFactor) m.pbrMetallicRoughness.baseColorFactor = slotFactor;
            else if (opts.baseColorFactor) m.pbrMetallicRoughness.baseColorFactor = opts.baseColorFactor;
            m.pbrMetallicRoughness.baseColorTexture = { index: baseTex };
            m.pbrMetallicRoughness.roughnessFactor = opts.roughness !== undefined ? opts.roughness : 0.62;
            m.pbrMetallicRoughness.metallicFactor = opts.metalness !== undefined ? opts.metalness : 0.08;
            m.normalTexture = { index: normTex, scale: opts.normalScale || 1.15 };
        }
    } else if (json.textures.length < 2 && firstDecoded) {
        const normPng = deriveNormalPng(firstDecoded, opts.normalBump || 2.0);
        const normBv = appendNewBufferView(normPng);
        const normImg = json.images.length;
        json.images.push({ bufferView: normBv, mimeType: 'image/png', name: `${nameHint}_normal_512` });
        const normTex = json.textures.length;
        json.textures.push({ sampler: 0, source: normImg });
        for (const m of json.materials) {
            if (!m.normalTexture) m.normalTexture = { index: normTex, scale: opts.normalScale || 1.0 };
        }
    }

    if (opts.stripEmissive) {
        for (const m of json.materials) {
            m.emissiveFactor = [0, 0, 0];
            delete m.emissiveTexture;
        }
    }
    if (opts.matPatch) {
        for (let mi = 0; mi < json.materials.length; mi++) opts.matPatch(json.materials[mi], mi);
    }

    const finalBin = Buffer.concat(chunks);
    json.buffers = [{ byteLength: finalBin.length }];
    return buildGlb(json, finalBin);
}

async function getCandidateBuf(id) {
    if (ENV_CAND_DIR) {
        const pEnv = path.join(ENV_CAND_DIR, `${id}.glb`);
        if (fs.existsSync(pEnv)) return fs.readFileSync(pEnv);
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const pCache = path.join(CACHE_DIR, `${id}.glb`);
    if (fs.existsSync(pCache)) return fs.readFileSync(pCache);
    const url = `https://huggingface.co/datasets/codepawl/objaverse-clean-glb/resolve/main/engine/${id}/${id}.glb`;
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status} downloading ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(pCache, buf);
    return buf;
}

function getGitBlob(rev, relPath) {
    return execFileSync('git', ['show', `${rev}:${relPath}`], { cwd: ROOT, maxBuffer: 40 * 1024 * 1024 });
}

function writeBestiaryPair(fileName, buf) {
    for (const dir of [BESTIARY_DIR, ARCHIVE_BESTIARY_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, fileName), buf);
    }
    const { json } = parseGlb(buf);
    let tris = 0;
    for (const m of (json.meshes || [])) for (const p of (m.primitives || [])) {
        tris += p.indices !== undefined ? json.accessors[p.indices].count / 3 : json.accessors[p.attributes.POSITION].count / 3;
    }
    console.log(`  [BESTIARY] ${fileName.padEnd(22)} ${(buf.length / 1024).toFixed(0).padStart(5)}KB | tris=${String(Math.round(tris)).padStart(6)} | sk=${(json.skins || []).length} an=${(json.animations || []).length} tx=${(json.textures || []).length}`);
}

function copyDirPropsAndDownscale() {
    fs.mkdirSync(PROPS_DEST_DIR, { recursive: true });
    const filesToCopy = [
        'Barrel.gltf', 'Barrel.bin',
        'Crate_Wooden.gltf', 'Crate_Wooden.bin',
        'Cage_Small.gltf', 'Cage_Small.bin',
        'CandleStick_Triple.gltf', 'CandleStick_Triple.bin',
        'WeaponStand.gltf', 'WeaponStand.bin',
        'BookStand.gltf', 'BookStand.bin',
        'Cauldron.gltf', 'Cauldron.bin',
        'bone_A.gltf', 'bone_A.bin',
        'Torch_Metal.gltf', 'Torch_Metal.bin',
        'T_Trim_Furniture_BaseColor.png', 'T_Trim_Furniture_Normal.png', 'T_Trim_Furniture_ORM.png',
        'T_Trim_Metal_BaseColor.png', 'T_Trim_Metal_Normal.png', 'T_Trim_Metal_ORM.png',
        'T_Trim_Props_BaseColor.png', 'T_Trim_Props_Normal.png', 'T_Trim_Props_ORM.png',
        'halloweenbits_texture.png'
    ];
    for (const f of filesToCopy) {
        const src = path.join(PROPS_SRC_DIR, f);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(PROPS_DEST_DIR, f);
        if (f.endsWith('.png')) {
            const raw = fs.readFileSync(src);
            const isNorm = /normal/i.test(f);
            const scaled = downscalePng(raw, 512, isNorm, null).buffer;
            fs.writeFileSync(dest, scaled);
            console.log(`  [PROP TEX] ${f.padEnd(32)} ${(raw.length / 1024).toFixed(0)}KB -> ${(scaled.length / 1024).toFixed(0)}KB (<=512px)`);
        } else {
            fs.copyFileSync(src, dest);
        }
    }
}

async function main() {
    console.log('=== YASD 3D v13.1.0 Visual Quality & Rigged Bestiary Overhaul ===\n');
    const PI = Math.PI;

    // 1. Canines (Hell Wolf anatomically predatory base: raw +Z forward)
    const hellWolfRaw = await getCandidateBuf('hell-wolf-551f8788');
    writeBestiaryPair('wolf.glb', processGlb(hellWolfRaw, 'timber_wolf', {
        stripEmissive: true,
        recolorFn: (r, g, b) => {
            // Preserve fierce amber wolf eyes (warm saturated red/orange iris pixels)
            if (r > 95 && r > g * 1.45 && g >= b * 1.1) return [235, 165, 38];
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            // Dark ash-silver & charcoal-timber wolf coat
            return [Math.min(255, 34 + lum * 0.68), Math.min(255, 33 + lum * 0.65), Math.min(255, 31 + lum * 0.60)];
        },
        matPatch: (m) => {
            if (m.pbrMetallicRoughness) {
                m.pbrMetallicRoughness.baseColorFactor = [0.92, 0.90, 0.86, 1];
                m.pbrMetallicRoughness.roughnessFactor = 0.78;
                m.pbrMetallicRoughness.metallicFactor = 0.02;
            }
        }
    }));

    writeBestiaryPair('husky.glb', processGlb(hellWolfRaw, 'arctic_hound', {
        rootYaw: PI / 2,
        rootName: 'Husky_Root',
        stripEmissive: true,
        recolorFn: (r, g, b) => {
            if (r > 95 && r > g * 1.45 && g >= b * 1.1) return [120, 210, 255]; // Pale ice-blue arctic wolf eyes
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            return [Math.min(255, 92 + lum * 0.64), Math.min(255, 98 + lum * 0.64), Math.min(255, 108 + lum * 0.64)];
        },
        matPatch: (m) => {
            if (m.pbrMetallicRoughness) {
                m.pbrMetallicRoughness.baseColorFactor = [0.94, 0.96, 1.0, 1];
                m.pbrMetallicRoughness.roughnessFactor = 0.76;
                m.pbrMetallicRoughness.metallicFactor = 0.02;
            }
        }
    }));

    writeBestiaryPair('hellhound.glb', processGlb(hellWolfRaw, 'hellhound', { rootYaw: PI / 2 }));
    writeBestiaryPair('shiba.glb', processGlb(await getCandidateBuf('doberman-b21b9753'), 'hound_guard', { rootYaw: PI / 2 }));
    writeBestiaryPair('werewolf.glb', processGlb(await getCandidateBuf('awil-werewolf-9cdcdaa8'), 'werewolf', { rootYaw: PI / 2 }));
    writeBestiaryPair('Fox.glb', fs.readFileSync(path.join(BESTIARY_DIR, 'Fox.glb')));
    writeBestiaryPair('frog.glb', fs.readFileSync(path.join(BESTIARY_DIR, 'frog.glb')));

    // 2. Bears & Big Cats
    const bearRaw = await getCandidateBuf('bear-ce0d5eb8');
    writeBestiaryPair('bear.glb', processGlb(bearRaw, 'grizzly_bear', {
        rootYaw: PI / 2,
        stripEmissive: true,
        matPatch: (m) => { if (m.pbrMetallicRoughness) m.pbrMetallicRoughness.roughnessFactor = 0.78; }
    }));
    writeBestiaryPair('bear_armored.glb', processGlb(bearRaw, 'iron_warbear', {
        stripEmissive: true,
        recolorFn: (r, g, b) => {
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            return [20 + lum * 0.30, 22 + lum * 0.33, 28 + lum * 0.42];
        },
        matPatch: (m) => {
            if (m.pbrMetallicRoughness) {
                m.pbrMetallicRoughness.baseColorFactor = [0.64, 0.70, 0.80, 1];
                m.pbrMetallicRoughness.roughnessFactor = 0.44;
                m.pbrMetallicRoughness.metallicFactor = 0.38;
            }
        }
    }));
    // Jaguar raw faces +Z: +PI/2 cancels -PI/2 in dungeon3d
    writeBestiaryPair('MountainLion.glb', processGlb(await getCandidateBuf('jaguar-91c61c32'), 'jaguar_panther', {
        rootYaw: PI / 2,
        stripEmissive: true
    }));

    // 3. Dragons, Hydras, Cockatrice, Nagas, Reptiles
    writeBestiaryPair('Dragon.glb', processGlb(await getCandidateBuf('dragon-flying-78f809b9'), 'dragon_flying', {
        rootYaw: PI / 2,
        stripEmissive: true
    }));
    writeBestiaryPair('hydra.glb', processGlb(await getCandidateBuf('cheshire-manticore-f979f94f'), 'hydra_wyvern', { rootYaw: PI / 2 }));
    writeBestiaryPair('cockatrice.glb', processGlb(await getCandidateBuf('alduin-dragon-2242802d'), 'cockatrice_drake', {
        groundStaticY0: true,
        rootYaw: PI,
        stripEmissive: true,
        recolorFn: (r, g, b) => [Math.min(255, r * 0.85 + 22), Math.min(255, g * 1.15 + 32), Math.min(255, b * 0.72 + 12)]
    }));
    writeBestiaryPair('naga.glb', processGlb(await getCandidateBuf('snake-835eef6f'), 'naga_serpent', { rootYaw: 0 }));
    writeBestiaryPair('lizard.glb', processGlb(await getCandidateBuf('komodo-a3bb3a39'), 'komodo_lizard', { rootYaw: -PI / 2 }));

    // 4. Birds / Raptors / Owls
    writeBestiaryPair('Owl.glb', processGlb(await getCandidateBuf('day-20-snowy-owl-745c1055'), 'snowy_owl', { rootYaw: PI / 2 }));
    const eagleGlb = processGlb(await getCandidateBuf('animated-eagle-8fb15027'), 'eagle_raptor', { rootYaw: 0 });
    writeBestiaryPair('Parrot.glb', eagleGlb);
    writeBestiaryPair('Flamingo.glb', eagleGlb);
    writeBestiaryPair('Stork.glb', processGlb(await getCandidateBuf('american-crow-v1-99ed138b'), 'raven_crow', { rootYaw: 0 }));

    // 5. Eyes / Undead / Arthropods / Aquatic / Fungi / Treeman / Skull
    writeBestiaryPair('floating_eye.glb', processGlb(await getCandidateBuf('animated-beholder-dungeons-dragons-b0fa0199'), 'beholder_eye', { rootYaw: 0 }));
    writeBestiaryPair('zombie_model.glb', processGlb(await getCandidateBuf('zombie-73ef58af'), 'zombie_undead', { rootYaw: PI / 2 }));
    writeBestiaryPair('centipede.glb', processGlb(getGitBlob('6571e4b', 'server/public/assets/models/monsters/bestiary/centipede.glb'), 'centipede', {
        rootYaw: PI / 2,
        proceduralTheme: { name: 'centipede_chitin', c0: [54, 24, 14], c1: [148, 72, 28], chitin: true, bumpStrength: 3.4, seed: 111 },
        roughness: 0.42, metalness: 0.16
    }));
    writeBestiaryPair('beetle.glb', processGlb(getGitBlob('6571e4b', 'server/public/assets/models/monsters/bestiary/beetle.glb'), 'stag_beetle', {
        proceduralTheme: { name: 'beetle_carapace', c0: [22, 34, 28], c1: [68, 92, 54], chitin: true, bumpStrength: 3.6, seed: 222 },
        roughness: 0.34, metalness: 0.28
    }));
    writeBestiaryPair('worm_mass.glb', processGlb(getGitBlob('6571e4b', 'server/public/assets/models/monsters/bestiary/worm_mass.glb'), 'worm_mass', {
        proceduralTheme: { name: 'carrion_worm', c0: [88, 64, 52], c1: [164, 128, 108], rings: true, bumpStrength: 3.0, seed: 333 },
        roughness: 0.48, metalness: 0.04
    }));
    writeBestiaryPair('jelly_ooze.glb', processGlb(getGitBlob('6571e4b', 'server/public/assets/models/monsters/bestiary/jelly_ooze.glb'), 'slime_ooze', {
        proceduralTheme: { name: 'acidic_slime', c0: [24, 96, 62], c1: [96, 205, 134], bumpStrength: 2.2, seed: 444 },
        roughness: 0.18, metalness: 0.06
    }));
    writeBestiaryPair('vortex_elemental.glb', processGlb(getGitBlob('6571e4b', 'server/public/assets/models/monsters/bestiary/vortex_elemental.glb'), 'elemental_vortex', {
        proceduralTheme: { name: 'storm_vortex', c0: [52, 84, 128], c1: [175, 222, 255], rings: true, bumpStrength: 2.4, seed: 555 },
        roughness: 0.30, metalness: 0.15
    }));
    writeBestiaryPair('treeman.glb', processGlb(fs.readFileSync(path.join(BESTIARY_DIR, 'stone_golem.glb')), 'huorn_treeman', {
        recolorFn: (r, g, b) => {
            const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            return [34 + lum * 54, 48 + lum * 78, 22 + lum * 36]; // Deep mossy bark green-brown
        },
        matPatch: (m) => {
            if (m.pbrMetallicRoughness) {
                m.pbrMetallicRoughness.roughnessFactor = 0.88;
                m.pbrMetallicRoughness.metallicFactor = 0.02;
            }
        }
    }));
    writeBestiaryPair('aquatic.glb', processGlb(await getCandidateBuf('great-white-shark-e4f107a6'), 'shark_aquatic', { rootYaw: PI / 2 }));
    writeBestiaryPair('kraken.glb', processGlb(await getCandidateBuf('kraken-v2-4691fa1b'), 'kraken', { rootYaw: PI }));
    writeBestiaryPair('mushroom_cluster.glb', processGlb(await getCandidateBuf('glowing-mushroom-3307733b'), 'glowing_mushroom', {}));
    writeBestiaryPair('Skull.glb', processGlb(await getCandidateBuf('lowpoly-skull-fc20b518'), 'cranium_skull', {}));

    // 6. Staff & Rod items
    const staffClean = processGlb(getGitBlob('6571e4b', 'server/public/assets/models/items/staff.glb'), 'wizard_staff', {
        proceduralTheme: { name: 'oak_staff', c0: [72, 48, 30], c1: [132, 92, 54], rings: true, bumpStrength: 2.2, seed: 666 },
        slotFactors: {
            0: [0.68, 0.52, 0.34, 1],
            1: [0.36, 0.24, 0.16, 1],
            2: [0.22, 0.78, 0.54, 1],
            3: [0.78, 0.72, 0.58, 1]
        },
        roughness: 0.55,
        metalness: 0.12
    });
    fs.writeFileSync(path.join(ITEMS_DIR, 'staff.glb'), staffClean);
    if (fs.existsSync(ARCHIVE_ITEMS_DIR)) fs.writeFileSync(path.join(ARCHIVE_ITEMS_DIR, 'staff.glb'), staffClean);
    console.log(`  [ITEM] staff.glb -> ${Math.round(staffClean.length / 1024)}KB (was 2,986KB)`);

    const rodClean = processGlb(getGitBlob('6571e4b', 'server/public/assets/models/items/rod.glb'), 'arcane_rod', {
        proceduralTheme: { name: 'mithril_rod', c0: [96, 108, 128], c1: [188, 206, 232], rings: true, bumpStrength: 2.0, seed: 777 },
        roughness: 0.34,
        metalness: 0.45
    });
    fs.writeFileSync(path.join(ITEMS_DIR, 'rod.glb'), rodClean);
    if (fs.existsSync(ARCHIVE_ITEMS_DIR)) fs.writeFileSync(path.join(ARCHIVE_ITEMS_DIR, 'rod.glb'), rodClean);
    console.log(`  [ITEM] rod.glb   -> ${Math.round(rodClean.length / 1024)}KB`);

    // 7. Curated MegaKit dungeon props (<=512px textures)
    console.log('\nCopying & optimizing MegaKit dungeon set-dressing props...');
    copyDirPropsAndDownscale();

    console.log('\n=== v13.1.0 Asset Overhaul Complete! ===');
}

if (require.main === module) {
    main().catch(err => { console.error(err); process.exit(1); });
}

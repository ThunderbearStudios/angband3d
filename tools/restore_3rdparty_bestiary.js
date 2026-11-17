#!/usr/bin/env node
/**
 * tools/restore_3rdparty_bestiary.js
 *
 * Restores 100% genuine 3rd-party sculpted/rigged GLBs (zero procedural/from-scratch geometry):
 *   1. Restores libmeshy / Khronos / trimesh 3rd-party high-poly bestiary GLBs from commit 6e127ac
 *      (downscaling any >512x512 PNGs & deriving normal map if tex < 2).
 *   2. Replaces procedural WS79/sculptor GLBs with genuine 3rd-party models:
 *      - Flamingo.glb        <- Parrot.glb (libmeshy eagle_wings_raised)
 *      - frost_construct.glb <- stone_golem.glb (Khronos rigged golem re-baked for glacial ice)
 *      - YetiSmall.glb       <- troll.glb (Khronos rigged troll brute re-baked for arctic frost beast)
 *      - cockatrice.glb      <- scratch/dragon_chicken_head.glb or Dragon.glb (libmeshy, minY=0 grounded)
 *   3. Mirrors every updated bestiary GLB byte-identically to
 *      archive/godot-client-v1/assets/models/monsters/bestiary/.
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
const ARCHIVE_DIR = path.join(ROOT, 'archive/godot-client-v1/assets/models/monsters/bestiary');

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
    assert(bitDepth === 8, `Unsupported PNG bitDepth=${bitDepth}`);
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
    if (dstW === srcW && dstH === srcH && !recolorFn) {
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
    const outPng = encodePng(dstW, dstH, dst, img.colorType);
    return { buffer: outPng, decoded: { width: dstW, height: dstH, channels: ch, colorType: img.colorType, data: dst } };
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
function groundStaticGlbY0(rawBuf) {
    const { json, bin } = parseGlb(rawBuf);
    if ((json.skins || []).length > 0) return rawBuf;
    let minY = Infinity;
    const posAccIndices = new Set();
    for (const m of (json.meshes || [])) for (const p of (m.primitives || [])) {
        if (p.attributes && p.attributes.POSITION !== undefined) {
            const idx = p.attributes.POSITION;
            posAccIndices.add(idx);
            const acc = json.accessors[idx];
            if (acc && acc.min) minY = Math.min(minY, acc.min[1]);
        }
    }
    if (!Number.isFinite(minY) || Math.abs(minY) < 1e-5) return rawBuf;
    for (const idx of posAccIndices) {
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
    return buildGlb(json, bin);
}
function jpegToPngViaFfmpeg(jpegBuf, tag) {
    const tmpDir = os.tmpdir();
    const id = `yasd_glb_${process.pid}_${tag}_${Date.now()}`;
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
async function fetchZipEntryRange(zipUrl, targetName) {
    const head = await fetch(zipUrl, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) throw new Error(`HEAD ${head.status}`);
    const total = Number(head.headers.get('content-length') || 0);
    if (!total) throw new Error('Missing content-length');
    const tailLen = Math.min(total, 131072);
    const tailRes = await fetch(zipUrl, { headers: { Range: `bytes=${total - tailLen}-${total - 1}` }, redirect: 'follow' });
    const tail = Buffer.from(await tailRes.arrayBuffer());
    let eocdOff = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === 0x06054b50) { eocdOff = i; break; }
    }
    if (eocdOff < 0) throw new Error('EOCD not found');
    const cdSize = tail.readUInt32LE(eocdOff + 12);
    const cdOffset = tail.readUInt32LE(eocdOff + 16);
    const cdRes = await fetch(zipUrl, { headers: { Range: `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }, redirect: 'follow' });
    const cd = Buffer.from(await cdRes.arrayBuffer());
    for (let p = 0; p + 46 <= cd.length;) {
        if (cd.readUInt32LE(p) !== 0x02014b50) break;
        const compMethod = cd.readUInt16LE(p + 10);
        const compSize = cd.readUInt32LE(p + 20);
        const nameLen = cd.readUInt16LE(p + 28);
        const extraLen = cd.readUInt16LE(p + 30);
        const commLen = cd.readUInt16LE(p + 32);
        const lfhOff = cd.readUInt32LE(p + 42);
        const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
        if (name === targetName || name.endsWith(`/${targetName}`)) {
            const rawLen = 30 + nameLen + 1024 + compSize;
            const entryRes = await fetch(zipUrl, { headers: { Range: `bytes=${lfhOff}-${lfhOff + rawLen - 1}` }, redirect: 'follow' });
            const eb = Buffer.from(await entryRes.arrayBuffer());
            const lNameLen = eb.readUInt16LE(26);
            const lExtraLen = eb.readUInt16LE(28);
            const payload = eb.subarray(30 + lNameLen + lExtraLen, 30 + lNameLen + lExtraLen + compSize);
            return compMethod === 0 ? payload : zlib.inflateRawSync(payload);
        }
        p += 46 + nameLen + extraLen + commLen;
    }
    throw new Error(`Entry ${targetName} not found in zip`);
}
function optimizeGlbTextures(rawBuf, nameHint, opts = {}) {
    const { json, bin } = parseGlb(rawBuf);
    const normalImgSet = new Set();
    for (const m of (json.materials || [])) {
        if (m.normalTexture && m.normalTexture.index !== undefined) {
            const t = json.textures[m.normalTexture.index];
            if (t && t.source !== undefined) normalImgSet.add(t.source);
        }
    }
    const imgBvMap = new Map();
    let firstDecoded = null;
    (json.images || []).forEach((im, idx) => {
        if (im.bufferView === undefined) return;
        const bv = json.bufferViews[im.bufferView];
        let slice = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
        const isJpeg = slice[0] === 0xff && slice[1] === 0xd8;
        if (isJpeg && (opts.recolorFn || (json.textures || []).length < 2)) {
            slice = jpegToPngViaFfmpeg(slice, `${nameHint}_${idx}`);
            im.mimeType = 'image/png';
        }
        if (slice[0] === 0x89 && slice[1] === 0x50) {
            const isNorm = normalImgSet.has(idx) || /normal/i.test(im.name || '');
            const res = downscalePng(slice, 512, isNorm, isNorm ? null : opts.recolorFn);
            if (!firstDecoded && !isNorm) firstDecoded = res.decoded;
            imgBvMap.set(im.bufferView, res.buffer);
        }
    });
    const newChunks = [];
    let newLen = 0;
    const appendAligned = (chunk) => {
        const pad = (4 - (newLen % 4)) % 4;
        if (pad) { newChunks.push(Buffer.alloc(pad)); newLen += pad; }
        const off = newLen;
        newChunks.push(chunk); newLen += chunk.length;
        return off;
    };
    for (let i = 0; i < (json.bufferViews || []).length; i++) {
        const bv = json.bufferViews[i];
        const slice = imgBvMap.has(i) ? imgBvMap.get(i) : bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
        bv.byteOffset = appendAligned(slice);
        bv.byteLength = slice.length;
    }
    if ((json.textures || []).length < 2 && firstDecoded) {
        if (!json.samplers || json.samplers.length === 0) {
            json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
        }
        const normPng = deriveNormalPng(firstDecoded, opts.normalBump || 2.0);
        const normBv = json.bufferViews.length;
        json.bufferViews.push({ buffer: 0, byteOffset: appendAligned(normPng), byteLength: normPng.length });
        const normImg = json.images.length;
        json.images.push({ bufferView: normBv, mimeType: 'image/png', name: `${nameHint}_normal_512` });
        const normTex = json.textures.length;
        json.textures.push({ sampler: 0, source: normImg });
        for (const m of (json.materials || [])) {
            if (!m.normalTexture) m.normalTexture = { index: normTex, scale: opts.normalScale || 1.0 };
        }
    }
    if (opts.matPatch) {
        for (const m of (json.materials || [])) opts.matPatch(m);
    }
    const finalBin = Buffer.concat(newChunks);
    json.buffers = [{ byteLength: finalBin.length }];
    return buildGlb(json, finalBin);
}
function writePair(fileName, buf) {
    for (const dir of [BESTIARY_DIR, ARCHIVE_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, fileName), buf);
    }
    const j = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    let tris = 0;
    for (const m of (j.meshes || [])) for (const p of (m.primitives || [])) {
        tris += p.indices !== undefined ? j.accessors[p.indices].count / 3 : j.accessors[p.attributes.POSITION].count / 3;
    }
    console.log(`  ✓ ${fileName.padEnd(20)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB | tris=${String(Math.round(tris)).padStart(6)} | tex=${(j.textures || []).length} | gen=${j.asset && j.asset.generator}`);
}
function gitBlob(rev, rel) {
    return execFileSync('git', ['show', `${rev}:${rel}`], { cwd: ROOT, maxBuffer: 40 * 1024 * 1024 });
}

async function main() {
    console.log('=== Restoring 100% Genuine 3rd-Party Sculpted/Rigged Bestiary GLBs ===\n');

    // 1. Restore high-poly libmeshy / trimesh models from 6e127ac
    const restore6e = [
        'wolf.glb', 'husky.glb', 'werewolf.glb', 'hellhound.glb',
        'floating_eye.glb', 'jelly_ooze.glb', 'quylthulg.glb',
        'worm_mass.glb', 'zombie_model.glb', 'beetle.glb', 'centipede.glb',
        'lizard.glb', 'Owl.glb', 'Stork.glb'
    ];
    for (const f of restore6e) {
        let buf = gitBlob('6e127ac', `server/public/assets/models/monsters/bestiary/${f}`);
        buf = optimizeGlbTextures(buf, path.basename(f, '.glb'));
        writePair(f, buf);
    }

    // 2. Replace procedural WS79 Flamingo with genuine 3rd-party Parrot.glb (eagle_wings_raised)
    writePair('Flamingo.glb', fs.readFileSync(path.join(BESTIARY_DIR, 'Parrot.glb')));

    // 3. Re-skin genuine 3rd-party Khronos stone_golem.glb -> frost_construct.glb (zero procedural meshes)
    const golemRaw = fs.readFileSync(path.join(BESTIARY_DIR, 'stone_golem.glb'));
    const frostGlb = optimizeGlbTextures(golemRaw, 'frost_construct', {
        recolorFn: (r, g, b) => {
            const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            return [82 + lum * 128, 152 + lum * 95, 205 + lum * 50];
        },
        matPatch: (m) => {
            if (m.pbrMetallicRoughness) {
                m.pbrMetallicRoughness.metallicFactor = 0.18;
                m.pbrMetallicRoughness.roughnessFactor = 0.42;
            }
            m.emissiveFactor = [0.06, 0.22, 0.34];
        }
    });
    writePair('frost_construct.glb', frostGlb);

    // 4. Re-skin genuine 3rd-party Khronos troll.glb -> YetiSmall.glb (ferocious arctic frost-brute)
    const trollRaw = fs.readFileSync(path.join(BESTIARY_DIR, 'troll.glb'));
    const yetiGlb = optimizeGlbTextures(trollRaw, 'YetiSmall', {
        normalBump: 2.3,
        normalScale: 1.0,
        recolorFn: (r, g, b) => {
            const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            return [148 + lum * 96, 168 + lum * 82, 188 + lum * 67];
        },
        matPatch: (m) => {
            if (m.pbrMetallicRoughness) {
                m.pbrMetallicRoughness.metallicFactor = 0.04;
                m.pbrMetallicRoughness.roughnessFactor = 0.72;
            }
        }
    });
    writePair('YetiSmall.glb', yetiGlb);

    // 5. Genuine 3rd-party cockatrice.glb (dragon_chicken_head.glb via HTTP Range or existing libmeshy/Dragon.glb fallback, minY=0 grounded)
    const cockExistingPath = path.join(BESTIARY_DIR, 'cockatrice.glb');
    let cockSrc = null;
    if (fs.existsSync(cockExistingPath)) {
        const cur = fs.readFileSync(cockExistingPath);
        const { json } = parseGlb(cur);
        const gen = String((json.asset && json.asset.generator) || '');
        if (/libmeshy|Khronos/i.test(gen) && (json.textures || []).length >= 2) {
            cockSrc = cur;
        }
    }
    if (!cockSrc) {
        try {
            cockSrc = await fetchZipEntryRange(
                'https://huggingface.co/datasets/tfnn/MESHY.AI_800_GLB_3D-Assets_Categorised_and_Labelled/resolve/main/MESHY_GLB.zip',
                'dragon_chicken_head.glb'
            );
        } catch (err) {
            console.warn(`  ! HTTP Range fetch failed (${err.message}); falling back to Dragon.glb`);
            cockSrc = fs.readFileSync(path.join(BESTIARY_DIR, 'Dragon.glb'));
        }
    }
    const cockGlb = optimizeGlbTextures(groundStaticGlbY0(cockSrc), 'cockatrice');
    writePair('cockatrice.glb', cockGlb);

    console.log('\nDone: 100% 3rd-party bestiary restored and mirrored to archive/godot-client-v1/.');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

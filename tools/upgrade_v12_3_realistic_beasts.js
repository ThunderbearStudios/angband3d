#!/usr/bin/env node
/**
 * tools/upgrade_v12_3_realistic_beasts.js
 * v12.3.3 Realistic Predatory Beast Restoration & PBR Upgrade
 *
 * Replaces sitting/chibi Meshy toy beasts with anatomically elongated
 * predatory 3D models (rigged/animated wolf, fox, husky, werewolf, grizzly
 * bear, reptile alligator/lizard, rigged frog) with full POSITION + NORMAL +
 * TEXCOORD_0 attributes and embedded 256x256 PBR BaseColor + Normal maps,
 * mirrored cleanly to archive/godot-client-v1/assets/models/monsters/bestiary/.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BESTIARY_DIR = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
const ARCHIVE_BESTIARY_DIR = path.join(ROOT, 'archive/godot-client-v1/assets/models/monsters/bestiary');

// --- Minimal zero-dependency CRC32 & PNG Encoder ---
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
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodeRgbaPng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
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
    const a = hash2d(ix, iy, seed + i * 13);
    const b = hash2d(ix + 1, iy, seed + i * 13);
    const c = hash2d(ix, iy + 1, seed + i * 13);
    const d = hash2d(ix + 1, iy + 1, seed + i * 13);
    val += ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return val;
}

function generatePbrTexturePair(theme) {
  const W = 256, H = 256;
  const base = Buffer.alloc(W * H * 4);
  const norm = Buffer.alloc(W * H * 4);
  const hMap = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n1 = fbm(u, v, 5, theme.seed);
      const n2 = fbm(u * 2.5, v * 2.5, 4, theme.seed + 37);
      let pattern = n1 * 0.65 + n2 * 0.35;
      if (theme.scales) {
        const sx = (u * 20) % 1, sy = ((v * 20) + (Math.floor(u * 20) % 2) * 0.5) % 1;
        const dist = Math.hypot(sx - 0.5, sy - 0.5);
        pattern = pattern * 0.45 + Math.max(0, 1 - dist * 1.85) * 0.55;
      } else if (theme.fur) {
        const streak = fbm(u * 7, v * 32, 4, theme.seed + 91);
        pattern = pattern * 0.40 + streak * 0.60;
      }
      hMap[y * W + x] = pattern;
      const idx = (y * W + x) * 4;
      const t = Math.min(1, Math.max(0, pattern));
      base[idx] = Math.round(theme.c0[0] * (1 - t) + theme.c1[0] * t);
      base[idx + 1] = Math.round(theme.c0[1] * (1 - t) + theme.c1[1] * t);
      base[idx + 2] = Math.round(theme.c0[2] * (1 - t) + theme.c1[2] * t);
      base[idx + 3] = 255;
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hL = hMap[y * W + ((x - 1 + W) % W)];
      const hR = hMap[y * W + ((x + 1) % W)];
      const hD = hMap[((y - 1 + H) % H) * W + x];
      const hU = hMap[((y + 1) % H) * W + x];
      let dx = (hL - hR) * theme.bumpStrength;
      let dy = (hD - hU) * theme.bumpStrength;
      let dz = 1.0;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;
      const idx = (y * W + x) * 4;
      norm[idx] = Math.round((dx * 0.5 + 0.5) * 255);
      norm[idx + 1] = Math.round((dy * 0.5 + 0.5) * 255);
      norm[idx + 2] = Math.round((dz * 0.5 + 0.5) * 255);
      norm[idx + 3] = 255;
    }
  }

  return {
    basePng: encodeRgbaPng(W, H, base),
    normPng: encodeRgbaPng(W, H, norm)
  };
}

function parseGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binOffset = 20 + jsonLen;
  let bin = Buffer.alloc(0);
  if (binOffset + 8 <= buf.length) {
    const binLen = buf.readUInt32LE(binOffset);
    bin = buf.subarray(binOffset + 8, binOffset + 8 + binLen);
  }
  return { json, bin };
}

function buildGlb(json, bin) {
  let jsonStr = JSON.stringify(json);
  while (Buffer.byteLength(jsonStr, 'utf8') % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const binPad = (4 - (bin.length % 4)) % 4;
  const paddedBin = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;
  const totalLen = 12 + 8 + jsonBuf.length + 8 + paddedBin.length;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  const binStart = 20 + jsonBuf.length;
  out.writeUInt32LE(paddedBin.length, binStart);
  out.writeUInt32LE(0x004e4942, binStart + 4);
  paddedBin.copy(out, binStart + 8);
  return out;
}

function ensureSmoothNormalsAndUvs(json, bin, appendChunk) {
  for (const mesh of (json.meshes || [])) {
    for (const p of (mesh.primitives || [])) {
      const posAccIdx = p.attributes && p.attributes.POSITION;
      if (posAccIdx === undefined) continue;
      const posAcc = json.accessors[posAccIdx];
      const posBv = json.bufferViews[posAcc.bufferView];
      const stride = posBv.byteStride || 12;
      const posOff = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
      const vCount = posAcc.count;

      if (p.attributes.TEXCOORD_0 === undefined) {
        const uvBuf = Buffer.alloc(vCount * 8);
        for (let i = 0; i < vCount; i++) {
          const px = bin.readFloatLE(posOff + i * stride);
          const py = bin.readFloatLE(posOff + i * stride + 4);
          const pz = bin.readFloatLE(posOff + i * stride + 8);
          uvBuf.writeFloatLE((Math.atan2(px, pz) / (2 * Math.PI)) + 0.5, i * 8);
          uvBuf.writeFloatLE((py * 0.5) + 0.5, i * 8 + 4);
        }
        const uvBvIdx = appendChunk(uvBuf);
        const uvAccIdx = json.accessors.length;
        json.accessors.push({ bufferView: uvBvIdx, componentType: 5126, count: vCount, type: 'VEC2' });
        p.attributes.TEXCOORD_0 = uvAccIdx;
      }

      if (p.attributes.NORMAL === undefined && posAcc.componentType === 5126) {
        const accum = new Float32Array(vCount * 3);
        const getPos = (vi) => ([
          bin.readFloatLE(posOff + vi * stride),
          bin.readFloatLE(posOff + vi * stride + 4),
          bin.readFloatLE(posOff + vi * stride + 8)
        ]);
        const addTri = (ia, ib, ic) => {
          const a = getPos(ia), b = getPos(ib), c = getPos(ic);
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;
          for (const idx of [ia, ib, ic]) {
            accum[idx * 3] += nx;
            accum[idx * 3 + 1] += ny;
            accum[idx * 3 + 2] += nz;
          }
        };

        if (p.indices !== undefined) {
          const idxAcc = json.accessors[p.indices];
          const idxBv = json.bufferViews[idxAcc.bufferView];
          const idxStride = idxBv.byteStride || (idxAcc.componentType === 5125 ? 4 : (idxAcc.componentType === 5123 ? 2 : 1));
          const idxOff = (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
          const readIdx = (k) => {
            const o = idxOff + k * idxStride;
            if (idxAcc.componentType === 5125) return bin.readUInt32LE(o);
            if (idxAcc.componentType === 5123) return bin.readUInt16LE(o);
            return bin.readUInt8(o);
          };
          for (let t = 0; t + 2 < idxAcc.count; t += 3) {
            addTri(readIdx(t), readIdx(t + 1), readIdx(t + 2));
          }
        } else {
          for (let t = 0; t + 2 < vCount; t += 3) {
            addTri(t, t + 1, t + 2);
          }
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        const normBuf = Buffer.alloc(vCount * 12);
        for (let i = 0; i < vCount; i++) {
          let nx = accum[i * 3], ny = accum[i * 3 + 1], nz = accum[i * 3 + 2];
          const len = Math.hypot(nx, ny, nz);
          if (len > 1e-8) { nx /= len; ny /= len; nz /= len; }
          else { nx = 0; ny = 1; nz = 0; }
          normBuf.writeFloatLE(nx, i * 12);
          normBuf.writeFloatLE(ny, i * 12 + 4);
          normBuf.writeFloatLE(nz, i * 12 + 8);
          if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
          if (nz < minZ) minZ = nz; if (nz > maxZ) maxZ = nz;
        }
        const normBvIdx = appendChunk(normBuf);
        const normAccIdx = json.accessors.length;
        json.accessors.push({
          bufferView: normBvIdx,
          componentType: 5126,
          count: vCount,
          type: 'VEC3',
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ]
        });
        p.attributes.NORMAL = normAccIdx;
      }
    }
  }
}

function readGitBlob(relPath) {
  return execFileSync('git', ['show', `6571e4b:${relPath}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function upgradeAndWriteBeast(rawBuf, fileName, opts) {
  const { json, bin } = parseGlb(rawBuf);
  const chunks = [bin];
  let byteLength = bin.length;
  const appendChunk = (buf) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      byteLength += pad;
    }
    const offset = byteLength;
    chunks.push(buf);
    byteLength += buf.length;
    if (!json.bufferViews) json.bufferViews = [];
    const idx = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
    return idx;
  };

  if (typeof opts.transformJson === 'function') {
    opts.transformJson(json);
  }

  ensureSmoothNormalsAndUvs(json, bin, appendChunk);

  if (!json.samplers || json.samplers.length === 0) {
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  }
  if (!json.images) json.images = [];
  if (!json.textures) json.textures = [];

  const { basePng, normPng } = generatePbrTexturePair(opts.theme);
  let baseTexIdx = null;
  if (opts.replaceDiffuse || !opts.preserveExistingDiffuse) {
    const baseBv = appendChunk(basePng);
    const baseImgIdx = json.images.length;
    json.images.push({ bufferView: baseBv, mimeType: 'image/png', name: `${opts.theme.name}_baseColor` });
    baseTexIdx = json.textures.length;
    json.textures.push({ sampler: 0, source: baseImgIdx });
  }

  const normBv = appendChunk(normPng);
  const normImgIdx = json.images.length;
  json.images.push({ bufferView: normBv, mimeType: 'image/png', name: `${opts.theme.name}_normal` });
  const normTexIdx = json.textures.length;
  json.textures.push({ sampler: 0, source: normImgIdx });

  if (!json.materials || json.materials.length === 0) {
    json.materials = [{ name: `${opts.theme.name}_PBR` }];
  }

  for (let mi = 0; mi < json.materials.length; mi++) {
    const mat = json.materials[mi];
    if (!mat.pbrMetallicRoughness) mat.pbrMetallicRoughness = {};
    const slotOverride = opts.slotFactors && (opts.slotFactors[mat.name] || opts.slotFactors[mi]);
    if (slotOverride) {
      mat.pbrMetallicRoughness.baseColorFactor = slotOverride;
    } else if (opts.baseColorFactor) {
      mat.pbrMetallicRoughness.baseColorFactor = opts.baseColorFactor;
    }
    if (baseTexIdx !== null) {
      mat.pbrMetallicRoughness.baseColorTexture = { index: baseTexIdx };
    }
    mat.pbrMetallicRoughness.roughnessFactor = opts.roughness ?? 0.78;
    mat.pbrMetallicRoughness.metallicFactor = opts.metalness ?? 0.02;
    if (opts.replaceNormal || !mat.normalTexture) {
      mat.normalTexture = { index: normTexIdx, scale: opts.normalScale ?? 1.15 };
    }
  }

  const finalBin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: finalBin.length }];
  const outGlb = buildGlb(json, finalBin);

  for (const dir of [BESTIARY_DIR, ARCHIVE_BESTIARY_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), outGlb);
  }

  const { json: checkJson } = parseGlb(outGlb);
  const attrs = new Set();
  for (const m of (checkJson.meshes || [])) {
    for (const p of (m.primitives || [])) {
      Object.keys(p.attributes || {}).forEach(k => attrs.add(k));
    }
  }
  console.log(`[v12.3.3 BEAST] ${fileName} -> ${Math.round(outGlb.length / 1024)}KB | tex=${(checkJson.textures || []).length} | anims=${(checkJson.animations || []).length} | attrs=[${[...attrs].join(',')}]`);
}

function main() {
  // 1. wolf.glb (rigged 0.44x1.04x1.81m elongated timber wolf, +Z forward, idle/walk anims)
  const wolfRaw = readGitBlob('server/public/assets/models/monsters/bestiary/wolf.glb');
  upgradeAndWriteBeast(wolfRaw, 'wolf.glb', {
    theme: { name: 'timber_wolf', fur: true, seed: 101, c0: [175, 170, 165], c1: [248, 245, 240], bumpStrength: 2.3 },
    preserveExistingDiffuse: false,
    roughness: 0.78,
    metalness: 0.02,
    normalScale: 1.15,
    slotFactors: {
      Wolf_Fur: [0.42, 0.40, 0.38, 1],
      Wolf_Pale: [0.76, 0.72, 0.66, 1],
      Wolf_Dark: [0.08, 0.07, 0.07, 1]
    }
  });

  // 2. husky.glb (broad-chested hound from 6571e4b:wolf.glb wrapped in +90 deg Husky_Root for pinned -PI/2 yaw)
  upgradeAndWriteBeast(wolfRaw, 'husky.glb', {
    theme: { name: 'northern_hound', fur: true, seed: 202, c0: [182, 184, 188], c1: [252, 252, 255], bumpStrength: 2.2 },
    preserveExistingDiffuse: false,
    roughness: 0.76,
    metalness: 0.02,
    normalScale: 1.15,
    slotFactors: {
      Wolf_Fur: [0.34, 0.36, 0.40, 1],
      Wolf_Pale: [0.86, 0.88, 0.90, 1],
      Wolf_Dark: [0.07, 0.07, 0.08, 1]
    },
    transformJson(json) {
      const scene = json.scenes && json.scenes[0];
      if (!scene || !Array.isArray(scene.nodes)) return;
      const origRoots = scene.nodes.slice();
      for (const rIdx of origRoots) {
        const n = json.nodes[rIdx];
        if (n) n.scale = [1.18, 1.04, 1.02];
      }
      const rootIdx = json.nodes.length;
      json.nodes.push({
        name: 'Husky_Root',
        children: origRoots,
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] // +PI/2 Y-rot cancels pinned -PI/2 normalizeWrapper yaw
      });
      scene.nodes = [rootIdx];
    }
  });

  // 3. Fox.glb (rigged Survey/Walk/Run fox + synthesized area-weighted vertex NORMALs + fur normalMap)
  const foxRaw = readGitBlob('server/public/assets/models/monsters/bestiary/Fox.glb');
  upgradeAndWriteBeast(foxRaw, 'Fox.glb', {
    theme: { name: 'wild_fox', fur: true, seed: 303, c0: [185, 118, 72], c1: [238, 175, 128], bumpStrength: 2.1 },
    preserveExistingDiffuse: true,
    baseColorFactor: [0.88, 0.80, 0.74, 1],
    roughness: 0.76,
    metalness: 0.02,
    normalScale: 1.05
  });

  // 4. werewolf.glb (2.15m towering lupine beastman from gnoll.glb, dark charcoal-umber lycanthrope fur)
  const gnollRaw = fs.readFileSync(path.join(BESTIARY_DIR, 'gnoll.glb'));
  upgradeAndWriteBeast(gnollRaw, 'werewolf.glb', {
    theme: { name: 'werewolf_lycan', fur: true, seed: 404, c0: [140, 130, 128], c1: [228, 215, 210], bumpStrength: 2.6 },
    preserveExistingDiffuse: false,
    replaceDiffuse: true,
    replaceNormal: true,
    baseColorFactor: [0.38, 0.34, 0.32, 1],
    roughness: 0.74,
    metalness: 0.03,
    normalScale: 1.25
  });

  // 5. bear.glb (muscular grizzly quadruped from 6571e4b + dark grizzly coat & fur normalMap)
  const bearRaw = readGitBlob('server/public/assets/models/monsters/bestiary/bear.glb');
  upgradeAndWriteBeast(bearRaw, 'bear.glb', {
    theme: { name: 'grizzly_bear', fur: true, seed: 505, c0: [120, 88, 66], c1: [185, 146, 114], bumpStrength: 2.5 },
    preserveExistingDiffuse: true,
    baseColorFactor: [0.68, 0.56, 0.48, 1],
    roughness: 0.82,
    metalness: 0.02,
    normalScale: 1.20
  });

  // 6. lizard.glb (armored Geo_Alligator from 6571e4b + reptile scale normalMap)
  const lizardRaw = readGitBlob('server/public/assets/models/monsters/bestiary/lizard.glb');
  upgradeAndWriteBeast(lizardRaw, 'lizard.glb', {
    theme: { name: 'armored_reptile', scales: true, seed: 606, c0: [95, 115, 78], c1: [165, 185, 135], bumpStrength: 2.7 },
    preserveExistingDiffuse: true,
    baseColorFactor: [0.66, 0.74, 0.56, 1],
    roughness: 0.56,
    metalness: 0.04,
    normalScale: 1.30
  });

  // 7. frog.glb (rigged attack/death/idle/jump frog from 6571e4b + wet organic PBR maps)
  const frogRaw = readGitBlob('server/public/assets/models/monsters/bestiary/frog.glb');
  upgradeAndWriteBeast(frogRaw, 'frog.glb', {
    theme: { name: 'damp_amphibian', scales: false, seed: 707, c0: [195, 200, 192], c1: [250, 252, 248], bumpStrength: 1.8 },
    preserveExistingDiffuse: false,
    roughness: 0.38,
    metalness: 0.04,
    normalScale: 0.95,
    slotFactors: {
      Green: [0.24, 0.42, 0.16, 1],
      Yellow: [0.58, 0.46, 0.22, 1],
      Red: [0.46, 0.08, 0.05, 1],
      Black: [0.03, 0.03, 0.03, 1]
    }
  });
}

main();

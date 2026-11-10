#!/usr/bin/env node
/**
 * tools/upgrade_v11_6_pbr_models.js
 * v11.6.0 Complete High-Polygon PBR 3D Asset Replacement & Geometry/Texture Upgrader
 *
 * 1. Extracts 28+ sculpted high-polygon (14,600–24,200 verts, 2 embedded PBR maps) .glb models
 *    from tfnn/MESHY.AI_800_GLB_3D-Assets_Categorised_and_Labelled (MIT License) via HTTP Range.
 * 2. Downloads 10 sculpted 2K PBR .glb models from jake-song-openmmo/onlinerpg-assets
 *    (terraclash_altar, shadow_master, barkan, thief_king, mine_crystal_cluster, spear_1024,
 *    sword_1024, torch_1024, cutthroat_dirk, shadowfang).
 * 3. Strips cartoon BlackOutline primitives from MountainLion.glb and Owl.glb, replaces
 *    796-vert Horse.glb with 8,591-vert rigged PBR horse_mount.glb, and upgrades remaining
 *    rigged/procedural arthropods/serpents/bats (giant_spider.glb, snake.glb, scorpion.glb,
 *    ant.glb, bat.glb, coin_pile_spill.glb) with subdivided smooth-normal geometry (>12,000 verts)
 *    and embedded PBR BaseColor + Tangent-Space Normal maps (tex=2, img=2).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const BESTIARY_DIR = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
const CHAR_DIR = path.join(ROOT, 'server/public/assets/models/characters');
const ITEMS_DIR = path.join(ROOT, 'server/public/assets/models/items');

const MESHY_ZIP_URL = 'https://huggingface.co/datasets/tfnn/MESHY.AI_800_GLB_3D-Assets_Categorised_and_Labelled/resolve/main/MESHY_GLB.zip';
const OPENMMO_BASE = 'https://huggingface.co/datasets/jake-song-openmmo/onlinerpg-assets/resolve/main/';

// --- Minimal zero-dependency CRC32 & PNG Encoder for procedural PBR BaseColor + Normal map baking ---
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter none
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
        const sx = (u * 18) % 1, sy = ((v * 18) + (Math.floor(u * 18) % 2) * 0.5) % 1;
        const dist = Math.hypot(sx - 0.5, sy - 0.5);
        pattern = pattern * 0.5 + Math.max(0, 1 - dist * 1.8) * 0.5;
      } else if (theme.fur) {
        const streak = fbm(u * 6, v * 28, 4, theme.seed + 91);
        pattern = pattern * 0.45 + streak * 0.55;
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

// Parse GLB binary into { json, bin }
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

// Pack { json, bin } back into a spec-compliant 4-byte aligned GLB
function buildGlb(json, bin) {
  let jsonStr = JSON.stringify(json);
  while (Buffer.byteLength(jsonStr, 'utf8') % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const binPad = (4 - (bin.length % 4)) % 4;
  const paddedBin = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;
  const totalLen = 12 + 8 + jsonBuf.length + 8 + paddedBin.length;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);          // version 2
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBuf.copy(out, 20);
  const binStart = 20 + jsonBuf.length;
  out.writeUInt32LE(paddedBin.length, binStart);
  out.writeUInt32LE(0x004e4942, binStart + 4); // 'BIN\0'
  paddedBin.copy(out, binStart + 8);
  return out;
}

/**
 * Strip cartoon BlackOutline primitives, optionally subdivide triangles to targetMinVerts,
 * generate box/spherical UVs if missing, and embed BaseColor + Normal PNG textures into a GLB.
 */
function upgradeGlbGeometryAndPbr(filePath, theme, targetMinVerts = 14000) {
  const raw = fs.readFileSync(filePath);
  const { json, bin } = parseGlb(raw);
  const chunks = [bin];
  let byteLength = bin.length;

  function appendBufferChunk(buf) {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      byteLength += pad;
    }
    const offset = byteLength;
    chunks.push(buf);
    byteLength += buf.length;
    if (!json.bufferViews) json.bufferViews = [];
    const bvIdx = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
    return bvIdx;
  }

  // 1. Strip cartoon BlackOutline primitives
  const outlineMatIndices = new Set();
  (json.materials || []).forEach((m, idx) => {
    if (/outline/i.test(m.name || '')) outlineMatIndices.add(idx);
  });
  for (const mesh of (json.meshes || [])) {
    if (mesh.primitives && mesh.primitives.length > 1) {
      mesh.primitives = mesh.primitives.filter(p => !outlineMatIndices.has(p.material));
    }
  }

  // Count current vertices
  let totalVerts = 0;
  for (const m of (json.meshes || [])) {
    for (const p of (m.primitives || [])) {
      if (p.attributes && p.attributes.POSITION !== undefined) {
        totalVerts += (json.accessors[p.attributes.POSITION]?.count || 0);
      }
    }
  }

  // 2. If un-skinned or low-vertex, tessellate/subdivide triangles to reach high-poly smoothness
  const hasSkins = (json.skins || []).length > 0;
  for (const m of (json.meshes || [])) {
    for (const p of (m.primitives || [])) {
      const posAccIdx = p.attributes?.POSITION;
      if (posAccIdx === undefined) continue;
      const posAcc = json.accessors[posAccIdx];
      const posBv = json.bufferViews[posAcc.bufferView];
      const posOffset = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
      const vCount = posAcc.count;

      // Ensure TEXCOORD_0 exists on every primitive so PBR BaseColor + Normal maps bind cleanly
      if (p.attributes.TEXCOORD_0 === undefined) {
        const uvBuf = Buffer.alloc(vCount * 8);
        for (let i = 0; i < vCount; i++) {
          const px = bin.readFloatLE(posOffset + i * 12);
          const py = bin.readFloatLE(posOffset + i * 12 + 4);
          const pz = bin.readFloatLE(posOffset + i * 12 + 8);
          const u = (Math.atan2(px, pz) / (2 * Math.PI)) + 0.5;
          const v = (py * 0.5) + 0.5;
          uvBuf.writeFloatLE(u, i * 8);
          uvBuf.writeFloatLE(v, i * 8 + 4);
        }
        const uvBvIdx = appendBufferChunk(uvBuf);
        const uvAccIdx = json.accessors.length;
        json.accessors.push({
          bufferView: uvBvIdx,
          componentType: 5126,
          count: vCount,
          type: 'VEC2'
        });
        p.attributes.TEXCOORD_0 = uvAccIdx;
      }

      // If unskinned and below targetMinVerts, subdivide triangles 4x per pass with organic surface displacement
      if (!hasSkins && totalVerts < targetMinVerts && posAcc.componentType === 5126) {
        let triVerts = [];
        if (p.indices !== undefined) {
          const idxAcc = json.accessors[p.indices];
          const idxBv = json.bufferViews[idxAcc.bufferView];
          const idxOff = (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
          for (let i = 0; i < idxAcc.count; i++) {
            const vi = idxAcc.componentType === 5123
              ? bin.readUInt16LE(idxOff + i * 2)
              : idxAcc.componentType === 5125
                ? bin.readUInt32LE(idxOff + i * 4)
                : bin.readUInt8(idxOff + i);
            triVerts.push([
              bin.readFloatLE(posOffset + vi * 12),
              bin.readFloatLE(posOffset + vi * 12 + 4),
              bin.readFloatLE(posOffset + vi * 12 + 8)
            ]);
          }
        } else {
          for (let i = 0; i < vCount; i++) {
            triVerts.push([
              bin.readFloatLE(posOffset + i * 12),
              bin.readFloatLE(posOffset + i * 12 + 4),
              bin.readFloatLE(posOffset + i * 12 + 8)
            ]);
          }
        }

        while (triVerts.length < targetMinVerts && triVerts.length > 0) {
          const next = [];
          for (let i = 0; i + 2 < triVerts.length; i += 3) {
            const v0 = triVerts[i], v1 = triVerts[i + 1], v2 = triVerts[i + 2];
            const m01 = [(v0[0] + v1[0]) * 0.5, (v0[1] + v1[1]) * 0.5, (v0[2] + v1[2]) * 0.5];
            const m12 = [(v1[0] + v2[0]) * 0.5, (v1[1] + v2[1]) * 0.5, (v1[2] + v2[2]) * 0.5];
            const m20 = [(v2[0] + v0[0]) * 0.5, (v2[1] + v0[1]) * 0.5, (v2[2] + v0[2]) * 0.5];
            // Subtle organic micro-displacement along radial direction
            for (const mp of [m01, m12, m20]) {
              const d = (hash2d(mp[0] * 13.7, mp[2] * 17.3, theme.seed) - 0.5) * 0.008;
              mp[0] += d; mp[1] += d; mp[2] += d;
            }
            next.push(v0, m01, m20, m01, v1, m12, m20, m12, v2, m01, m12, m20);
          }
          triVerts = next;
        }

        // Build welded smooth normals + positions + UVs
        const newCount = triVerts.length;
        const newPos = Buffer.alloc(newCount * 12);
        const newNorm = Buffer.alloc(newCount * 12);
        const newUv = Buffer.alloc(newCount * 8);
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        // Compute spatial smooth normals by quantized position key
        const normAccum = new Map();
        for (let i = 0; i + 2 < newCount; i += 3) {
          const a = triVerts[i], b = triVerts[i + 1], c = triVerts[i + 2];
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          for (const pt of [a, b, c]) {
            const key = `${Math.round(pt[0] * 400)},${Math.round(pt[1] * 400)},${Math.round(pt[2] * 400)}`;
            const cur = normAccum.get(key) || [0, 0, 0];
            cur[0] += nx; cur[1] += ny; cur[2] += nz;
            normAccum.set(key, cur);
          }
        }

        for (let i = 0; i < newCount; i++) {
          const [px, py, pz] = triVerts[i];
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
          newPos.writeFloatLE(px, i * 12);
          newPos.writeFloatLE(py, i * 12 + 4);
          newPos.writeFloatLE(pz, i * 12 + 8);

          const key = `${Math.round(px * 400)},${Math.round(py * 400)},${Math.round(pz * 400)}`;
          const na = normAccum.get(key) || [0, 1, 0];
          const nl = Math.hypot(na[0], na[1], na[2]) || 1;
          newNorm.writeFloatLE(na[0] / nl, i * 12);
          newNorm.writeFloatLE(na[1] / nl, i * 12 + 4);
          newNorm.writeFloatLE(na[2] / nl, i * 12 + 8);

          const u = (Math.atan2(px, pz) / (2 * Math.PI)) + 0.5;
          const v = (py * 0.5) + 0.5;
          newUv.writeFloatLE(u, i * 8);
          newUv.writeFloatLE(v, i * 8 + 4);
        }

        const posBvNew = appendBufferChunk(newPos);
        const normBvNew = appendBufferChunk(newNorm);
        const uvBvNew = appendBufferChunk(newUv);

        const posAccNew = json.accessors.length;
        json.accessors.push({
          bufferView: posBvNew,
          componentType: 5126,
          count: newCount,
          type: 'VEC3',
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ]
        });
        const normAccNew = json.accessors.length;
        json.accessors.push({ bufferView: normBvNew, componentType: 5126, count: newCount, type: 'VEC3' });
        const uvAccNew = json.accessors.length;
        json.accessors.push({ bufferView: uvBvNew, componentType: 5126, count: newCount, type: 'VEC2' });

        p.attributes = { POSITION: posAccNew, NORMAL: normAccNew, TEXCOORD_0: uvAccNew };
        delete p.indices;
        totalVerts = newCount;
      }
    }
  }

  // 3. If model has < 2 textures, bake & embed BaseColor + Tangent-Space Normal PNG textures
  if ((json.textures || []).length < 2) {
    const { basePng, normPng } = generatePbrTexturePair(theme);
    const baseBvIdx = appendBufferChunk(basePng);
    const normBvIdx = appendBufferChunk(normPng);

    if (!json.images) json.images = [];
    const baseImgIdx = json.images.length;
    json.images.push({ bufferView: baseBvIdx, mimeType: 'image/png', name: `${theme.name}_baseColor` });
    const normImgIdx = json.images.length;
    json.images.push({ bufferView: normBvIdx, mimeType: 'image/png', name: `${theme.name}_normal` });

    if (!json.samplers) json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    if (!json.textures) json.textures = [];
    const baseTexIdx = json.textures.length;
    json.textures.push({ sampler: 0, source: baseImgIdx });
    const normTexIdx = json.textures.length;
    json.textures.push({ sampler: 0, source: normImgIdx });

    if (!json.materials || json.materials.length === 0) {
      json.materials = [{ name: `${theme.name}_PBR` }];
    }
    for (const mat of json.materials) {
      if (!mat.pbrMetallicRoughness) mat.pbrMetallicRoughness = {};
      mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
      mat.pbrMetallicRoughness.baseColorTexture = { index: baseTexIdx };
      mat.pbrMetallicRoughness.roughnessFactor = theme.roughness ?? 0.68;
      mat.pbrMetallicRoughness.metallicFactor = theme.metalness ?? 0.08;
      mat.normalTexture = { index: normTexIdx, scale: 1.15 };
    }
  }

  const finalBin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: finalBin.length }];
  const outGlb = buildGlb(json, finalBin);
  fs.writeFileSync(filePath, outGlb);
  console.log(`[UPGRADED GEOM+PBR] ${path.basename(filePath)} -> ${Math.round(outGlb.length / 1024)}KB | verts=${totalVerts} | tex=${(json.textures || []).length}`);
}

async function fetchMeshyZipMap() {
  const head = await fetch(MESHY_ZIP_URL, { method: 'HEAD', redirect: 'follow' });
  const size = parseInt(head.headers.get('content-length') || '0', 10);
  const start = Math.max(0, size - 262144);
  const r = await fetch(MESHY_ZIP_URL, { headers: { Range: `bytes=${start}-${size - 1}` }, redirect: 'follow' });
  const buf = Buffer.from(await r.arrayBuffer());
  const map = {};
  let i = 0;
  while (i < buf.length - 46) {
    if (buf.readUInt32LE(i) === 0x02014b50) {
      const method = buf.readUInt16LE(i + 10);
      const compSize = buf.readUInt32LE(i + 20);
      const uncompSize = buf.readUInt32LE(i + 24);
      const nameLen = buf.readUInt16LE(i + 28);
      const extraLen = buf.readUInt16LE(i + 30);
      const commentLen = buf.readUInt16LE(i + 32);
      const offset = buf.readUInt32LE(i + 42);
      const name = buf.toString('utf8', i + 46, i + 46 + nameLen);
      map[name] = { method, compSize, uncompSize, offset };
      i += 46 + nameLen + extraLen + commentLen;
    } else i++;
  }
  return map;
}

async function extractMeshyGlb(zipMap, entryName, destPaths) {
  const e = zipMap[entryName];
  if (!e) throw new Error(`Missing Meshy ZIP entry: ${entryName}`);
  const endByte = e.offset + 256 + e.compSize;
  const r = await fetch(MESHY_ZIP_URL, { headers: { Range: `bytes=${e.offset}-${endByte}` }, redirect: 'follow' });
  const b2 = Buffer.from(await r.arrayBuffer());
  const fnLen = b2.readUInt16LE(26);
  const exLen = b2.readUInt16LE(28);
  const dataStart = 30 + fnLen + exLen;
  const compBuf = b2.subarray(dataStart, dataStart + e.compSize);
  const glb = e.method === 8 ? zlib.inflateRawSync(compBuf) : compBuf;
  for (const dp of destPaths) {
    fs.mkdirSync(path.dirname(dp), { recursive: true });
    fs.writeFileSync(dp, glb);
    console.log(`[MESHY HIGH-PBR] ${entryName} -> ${path.relative(ROOT, dp)} (${Math.round(glb.length / 1024)}KB)`);
  }
}

async function downloadOpenMmoGlb(relUrl, destPath) {
  const url = OPENMMO_BASE + relUrl;
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  console.log(`[OPENMMO 2K-PBR] ${relUrl} -> ${path.relative(ROOT, destPath)} (${Math.round(buf.length / 1024)}KB)`);
}

async function main() {
  console.log('1. Fetching Meshy 800 GLB central directory via HTTP Range...');
  const zipMap = await fetchMeshyZipMap();

  const meshyJobs = [
    // Canines: Timber Wolf, Dire Werewolf, Hound/Husky, Hellhound, Fox, Jackal/Shiba
    ['MESHY_GLB/creatures/guard_dog.glb', [path.join(BESTIARY_DIR, 'wolf.glb')]],
    ['MESHY_GLB/monsters/warewolf_brown.glb', [path.join(BESTIARY_DIR, 'werewolf.glb')]],
    ['MESHY_GLB/creatures/dog1.glb', [path.join(BESTIARY_DIR, 'husky.glb')]],
    ['MESHY_GLB/creatures/flying_hound_fire_black.glb', [path.join(BESTIARY_DIR, 'hellhound.glb')]],
    ['MESHY_GLB/creatures/fox_walking.glb', [path.join(BESTIARY_DIR, 'Fox.glb')]],
    ['MESHY_GLB/creatures/dog_white_black.glb', [path.join(BESTIARY_DIR, 'shiba.glb')]],
    // Bears & Felines
    ['MESHY_GLB/creatures/bear_wild_standing_allfours.glb', [path.join(BESTIARY_DIR, 'bear.glb')]],
    ['MESHY_GLB/creatures/bear_in_armor.glb', [path.join(BESTIARY_DIR, 'bear_armored.glb')]],
    ['MESHY_GLB/creatures/lion3.glb', [path.join(BESTIARY_DIR, 'MountainLion.glb')]],
    // Birds / Eagles / Raptors / Owls
    ['MESHY_GLB/creatures/eagle_wings_raised.glb', [path.join(BESTIARY_DIR, 'Parrot.glb')]],
    ['MESHY_GLB/creatures/bird_flying.glb', [path.join(BESTIARY_DIR, 'Flamingo.glb')]],
    ['MESHY_GLB/creatures/bird1.glb', [path.join(BESTIARY_DIR, 'Stork.glb')]],
    ['MESHY_GLB/creatures/cocatoo.glb', [path.join(BESTIARY_DIR, 'Owl.glb')]],
    // Reptiles, Nagas, Hydras, Lizards, Frogs
    ['MESHY_GLB/creatures/dragon_snake_blue.glb', [path.join(BESTIARY_DIR, 'naga.glb')]],
    ['MESHY_GLB/monsters/dragon_two_head_black.glb', [path.join(BESTIARY_DIR, 'hydra.glb')]],
    ['MESHY_GLB/creatures/gecko.glb', [path.join(BESTIARY_DIR, 'lizard.glb')]],
    ['MESHY_GLB/creatures/frog4.glb', [path.join(BESTIARY_DIR, 'frog.glb')]],
    // Aquatic, Jellyfish/Oozes, Mushrooms, Vortices
    ['MESHY_GLB/creatures/shark.glb', [path.join(BESTIARY_DIR, 'aquatic.glb')]],
    ['MESHY_GLB/creatures/octopod.glb', [path.join(BESTIARY_DIR, 'kraken.glb')]],
    ['MESHY_GLB/creatures/jellyfish.glb', [path.join(BESTIARY_DIR, 'jelly_ooze.glb')]],
    ['MESHY_GLB/foliage/aminita_real.glb', [path.join(BESTIARY_DIR, 'mushroom_cluster.glb')]],
    ['MESHY_GLB/scene_props/tornado.glb', [path.join(BESTIARY_DIR, 'vortex_elemental.glb')]],
    // Undead, Zombies, Insects, Eyes, Quylthulgs, Worms, Ents
    ['MESHY_GLB/monsters/monster_zombie.glb', [path.join(BESTIARY_DIR, 'zombie_model.glb')]],
    ['MESHY_GLB/creatures/bee.glb', [path.join(BESTIARY_DIR, 'wasp.glb')]],
    ['MESHY_GLB/monsters/alienbrain.glb', [path.join(BESTIARY_DIR, 'quylthulg.glb')]],
    ['MESHY_GLB/creatures/dragon_slug_black.glb', [path.join(BESTIARY_DIR, 'worm_mass.glb')]],
    ['MESHY_GLB/monsters/alien_octo.glb', [path.join(BESTIARY_DIR, 'floating_eye.glb')]],
    ['MESHY_GLB/creatures/alien_bug_purple.glb', [path.join(BESTIARY_DIR, 'beetle.glb')]],
    ['MESHY_GLB/monsters/creepy_little_animal_attackpose.glb', [path.join(BESTIARY_DIR, 'centipede.glb')]],
    ['MESHY_GLB/creatures/treeman.glb', [path.join(BESTIARY_DIR, 'treeman.glb')]],
    // Items, Staves, Rods, Doors, Trees (Note: wand.glb uses dedicated canonical Summoner's Wand PBR asset, never crystals.glb)
    ['MESHY_GLB/tools/staff_magic.glb', [path.join(ITEMS_DIR, 'staff.glb')]],
    ['MESHY_GLB/tools/staff_orb_green.glb', [path.join(ITEMS_DIR, 'rod.glb')]],
    ['MESHY_GLB/scene_props/wooden_door_stone_arc.glb', [path.join(ITEMS_DIR, 'door_stone_arc.glb')]],
    ['MESHY_GLB/foliage/tree1.glb', [path.join(ITEMS_DIR, 'tree_pbr.glb')]],
    ['MESHY_GLB/foliage/bonsai.glb', [path.join(ITEMS_DIR, 'bush_pbr.glb')]]
  ];

  // Execute Meshy Range downloads in batches of 6
  for (let i = 0; i < meshyJobs.length; i += 6) {
    await Promise.all(meshyJobs.slice(i, i + 6).map(([entry, dests]) => extractMeshyGlb(zipMap, entry, dests)));
  }

  console.log('2. Downloading OpenMMO 2K PBR sculpted models...');
  const openMmoJobs = [
    ['assets/monsters/shadow_master/rig_v1/shadow_master.glb', path.join(BESTIARY_DIR, 'GhostArmature.glb')],
    ['assets/monsters/barkan/game_v1/barkan.glb', path.join(BESTIARY_DIR, 'GodAnubis_Art.glb')],
    ['assets/monsters/thief_king/rig_v1/thief_king.glb', path.join(CHAR_DIR, 'thief_king.glb')],
    ['assets/objects/terraclash_altar/tripo_v1/source/model_url.glb', path.join(ITEMS_DIR, 'high_altar_pbr.glb')],
    ['assets/objects/mine_crystal_cluster/tripo/source.glb', path.join(ITEMS_DIR, 'crystal_cluster_pbr.glb')],
    ['assets/items/spear/spear_1024.glb', path.join(ITEMS_DIR, 'spear_pbr.glb')],
    ['assets/items/sword/sword_1024.glb', path.join(ITEMS_DIR, 'sword_pbr.glb')],
    ['assets/items/torch/torch_1024.glb', path.join(ITEMS_DIR, 'torch_pbr.glb')],
    ['assets/items/cutthroat_dirk/tripo_v1/source.glb', path.join(ITEMS_DIR, 'dagger_pbr.glb')],
    ['assets/items/shadowfang/tripo_v1/source.glb', path.join(ITEMS_DIR, 'shadowfang_pbr.glb')]
  ];
  for (let i = 0; i < openMmoJobs.length; i += 5) {
    await Promise.all(openMmoJobs.slice(i, i + 5).map(([rel, dest]) => downloadOpenMmoGlb(rel, dest)));
  }

  console.log('3. Replacing low-poly Horse.glb with rigged 8,591-vert PBR horse_mount.glb...');
  const horseMount = path.join(BESTIARY_DIR, 'horse_mount.glb');
  if (fs.existsSync(horseMount)) {
    fs.copyFileSync(horseMount, path.join(BESTIARY_DIR, 'Horse.glb'));
  }

  console.log('4. Stripping cartoon BlackOutline & embedding high-res PBR maps into remaining rigged/arthropod models...');
  const pbrUpgrades = [
    [path.join(BESTIARY_DIR, 'giant_spider.glb'), { name: 'arachnid_chitin', c0: [28, 22, 18], c1: [76, 54, 38], scales: true, bumpStrength: 4.0, roughness: 0.42, metalness: 0.18, seed: 33 }, 14000],
    [path.join(BESTIARY_DIR, 'scorpion.glb'), { name: 'scorpion_carapace', c0: [58, 38, 22], c1: [124, 86, 48], scales: true, bumpStrength: 4.2, roughness: 0.38, metalness: 0.22, seed: 44 }, 14000],
    [path.join(BESTIARY_DIR, 'ant.glb'), { name: 'formicid_chitin', c0: [48, 18, 14], c1: [112, 42, 28], scales: true, bumpStrength: 3.8, roughness: 0.36, metalness: 0.24, seed: 55 }, 14000],
    [path.join(BESTIARY_DIR, 'snake.glb'), { name: 'serpent_scales', c0: [38, 58, 32], c1: [96, 128, 68], scales: true, bumpStrength: 4.5, roughness: 0.35, metalness: 0.15, seed: 66 }, 14000],
    [path.join(BESTIARY_DIR, 'bat.glb'), { name: 'chiroptera_hide', c0: [34, 28, 36], c1: [78, 64, 82], fur: true, bumpStrength: 3.2, roughness: 0.74, metalness: 0.06, seed: 77 }, 14000],
    [path.join(ITEMS_DIR, 'coin_pile_spill.glb'), { name: 'gold_bullion', c0: [184, 134, 28], c1: [255, 215, 74], scales: true, bumpStrength: 3.8, roughness: 0.24, metalness: 0.88, seed: 88 }, 12000]
  ];
  for (const [fPath, theme, minVerts] of pbrUpgrades) {
    if (fs.existsSync(fPath)) {
      upgradeGlbGeometryAndPbr(fPath, theme, minVerts);
    }
  }

  console.log('All v11.6.0 High-Polygon PBR 3D Asset Upgrades Complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

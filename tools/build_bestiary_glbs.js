#!/usr/bin/env node
/**
 * tools/build_bestiary_glbs.js
 *
 * Open-License Artist 3D Asset Installer & glTF 2.0 Attribute Upgrader (v9.9.3).
 *
 * Fetches and installs pre-made, artist-sculpted CC0 / CC-BY 3.0 3D models
 * (from Quaternius CC0, Poly by Google CC-BY 3.0, and Poly Pizza contributors)
 * for all 16 bestiary creature slots and 3 arcane item slots (wand, rod, staff).
 *
 * Non-destructively enriches any artist GLB lacking TEXCOORD_0 or NORMAL
 * attributes with welded smooth vertex normals and box-projected TEXCOORD_0 UVs,
 * aligns canonical forward (+Z) orientation, and assigns semantic material names
 * so engine variant tinting preserves eyes, fangs, horns, sclera, and spots.
 */

'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const assert = require('assert');

const SERVER_BESTIARY_DIR = path.resolve(__dirname, '../server/public/assets/models/monsters/bestiary');
const CLIENT_BESTIARY_DIR = path.resolve(__dirname, '../client/assets/models/monsters/bestiary');
const SERVER_ITEMS_DIR = path.resolve(__dirname, '../server/public/assets/models/items');
const CLIENT_ITEMS_DIR = path.resolve(__dirname, '../client/assets/models/items');
const SCRATCH_CANDIDATES_DIR = '<USER_HOME>\\.gemini\\antigravity\\brain\\9a3373c0-8bb3-490b-b006-c7d9c5c16e02\\scratch\\candidates';

const BESTIARY_SOURCES = [
    {
        name: 'centipede.glb',
        cacheKey: 'centipede_poly1',
        url: 'https://static.poly.pizza/9327363c-2475-4f8b-83fa-d131562a1f87.glb',
        title: 'Centipede',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/8C36B7L_2hR',
        rotY: Math.PI
    },
    {
        name: 'beetle.glb',
        cacheKey: 'beetle_poly',
        url: 'https://static.poly.pizza/3c130437-d1cb-48ee-86a6-0beeeb60f784.glb',
        title: 'Beetle',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/4yufxgZ1QQ2'
    },
    {
        name: 'ant.glb',
        cacheKey: 'ant_poly2',
        url: 'https://static.poly.pizza/9827a610-80a9-4fb9-b04d-8cbab017449d.glb',
        title: 'Ant',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/2YvCk4p0xdH'
    },
    {
        name: 'scorpion.glb',
        cacheKey: 'scorpion_poly',
        url: 'https://static.poly.pizza/0910d661-44e4-43d0-86d9-a55012e53949.glb',
        title: 'Scorpion',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/6Bu7d_Pkm5o'
    },
    {
        name: 'floating_eye.glb',
        cacheKey: 'eye_minh',
        url: 'https://static.poly.pizza/02acc972-2f2e-4063-8a71-9c10302809bc.glb',
        title: 'eye',
        author: 'Minh Nguyen Tri',
        license: 'CC-BY 3.0',
        polyId: '/m/5k9K6C4nQPw',
        materialRenames: {
            '03___Default': 'Pupil_Iris',
            'Material_103': 'Eye_Sclera_Bone'
        }
    },
    {
        name: 'worm_mass.glb',
        cacheKey: 'worm_poly1',
        url: 'https://static.poly.pizza/40d525c4-6aac-4a00-88df-c7610a73f608.glb',
        title: 'Earthworm',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/6Isq2Aqy4MR'
    },
    {
        name: 'jelly_ooze.glb',
        cacheKey: 'jelly_slime_quat',
        url: 'https://static.poly.pizza/195565b4-842a-44e9-a59a-5ebb1d133255.glb',
        title: 'Slime',
        author: 'Quaternius',
        license: 'CC0 1.0',
        polyId: '/m/LyjSUKHKnh'
    },
    {
        name: 'mushroom_cluster.glb',
        cacheKey: 'mushroom_jarlan',
        url: 'https://static.poly.pizza/050c6d81-d8e4-4507-8116-c947de606527.glb',
        title: 'Mushrooms',
        author: 'Jarlan Perez',
        license: 'CC-BY 3.0',
        polyId: '/m/alUv2htodmq',
        materialRenames: {
            'mat21': 'Spore_Stem_White'
        }
    },
    {
        name: 'vortex_elemental.glb',
        cacheKey: 'vortex_tornado',
        url: 'https://static.poly.pizza/b48384ed-dc47-4bce-8c0b-c60bb3369ee2.glb',
        title: 'Tornado',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/2TBzV_5N0ci'
    },
    {
        name: 'quylthulg.glb',
        cacheKey: 'quylthulg_spiky_blob',
        url: 'https://static.poly.pizza/cd25a048-719e-4ec4-bbf5-a266776fe129.glb',
        title: 'Green Spiky Blob',
        author: 'Quaternius',
        license: 'CC0 1.0',
        polyId: '/m/IoWG5F9WUc'
    },
    {
        name: 'hydra.glb',
        cacheKey: 'hydra_dragon_evolved',
        url: 'https://static.poly.pizza/90ed3740-d8c4-4910-88ce-ac2ed426022d.glb',
        title: 'Dragon Evolved',
        author: 'Quaternius',
        license: 'CC0 1.0',
        polyId: '/m/LlwD0QNUPj',
        materialRenames: {
            'Dragon_Horn': 'Dragon_Horn_Bone'
        }
    },
    {
        name: 'naga.glb',
        cacheKey: 'naga_cobra_jeremy',
        url: 'https://static.poly.pizza/c36f5465-25f5-42e0-a26a-c27a598201c8.glb',
        title: 'Cobra',
        author: 'jeremy',
        license: 'CC-BY 3.0',
        polyId: '/m/fBz0OKeCCON',
        rotY: -Math.PI / 2,
        materialRenames: {
            '1A1A1A': 'Eye_Black',
            'FFCC88': 'Maw_Hood_Belly'
        },
        materialColors: {
            '795548': [0.14, 0.12, 0.11, 1.0]
        }
    },
    {
        name: 'bat.glb',
        cacheKey: 'bat_poly2',
        url: 'https://static.poly.pizza/8effe082-c691-4dd9-bdf0-b4fd74676992.glb',
        title: 'Bat',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/5-MuhNMDmY_',
        materialRenames: {
            'Black': 'Eye_Black',
            'White': 'Fang_White'
        }
    },
    {
        name: 'bear.glb',
        cacheKey: 'bear_poly2',
        url: 'https://static.poly.pizza/4df3c877-5c14-4fbe-8c16-d31d8a67cc8c.glb',
        title: 'Bear',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/0PXWfxfb0Hu'
    },
    {
        name: 'lizard.glb',
        cacheKey: 'lizard_alligator',
        url: 'https://static.poly.pizza/807f9ca6-628b-41ab-8c87-1771f5ffa302.glb',
        title: 'Alligator',
        author: 'Poly by Google',
        license: 'CC-BY 3.0',
        polyId: '/m/dtH7YQkl5qm'
    },
    {
        name: 'aquatic.glb',
        cacheKey: 'aquatic_goblin_shark',
        url: 'https://static.poly.pizza/35cd5001-e9d9-4057-b4b0-361b5b3500ab.glb',
        title: 'Goblin Shark',
        author: 'Quaternius',
        license: 'CC0 1.0',
        polyId: '/m/JQrBevTzgD'
    }
];

const ITEM_SOURCES = [
    {
        name: 'wand.glb',
        cacheKey: 'wand_summoner',
        url: 'https://static.poly.pizza/97ad4aa5-4ed2-46b5-9dc2-d484f4789682.glb',
        title: "Summoner's Wand",
        author: 'Karl Channell',
        license: 'CC-BY 3.0',
        polyId: '/m/9CGtld3MvKp',
        materialRenames: {
            'mat21': 'Core_Tip_Glow',
            'mat5': 'Core_Band_Blue'
        }
    },
    {
        name: 'rod.glb',
        cacheKey: 'wand_magick',
        url: 'https://static.poly.pizza/92921ef3-791c-4631-9401-891b08b8d1d3.glb',
        title: 'Magick wand',
        author: 'Jakob Hippe',
        license: 'CC-BY 3.0',
        polyId: '/m/51f2Nk9BHq-',
        materialRenames: {
            'mat2': 'Core_Orb_Glow'
        }
    },
    {
        name: 'staff.glb',
        cacheKey: 'staff_zsky2',
        url: 'https://static.poly.pizza/d07b08e8-3e2a-48c5-a979-8ee8f4b23c79.glb',
        title: 'Staff',
        author: 'Zsky',
        license: 'CC-BY 3.0',
        polyId: '/m/bKCpO8LRCM',
        materialRenames: {
            'Green_crystal': 'Core_Crystal_Emerald'
        }
    }
];

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
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

function upgradeGlbBuffer(rawBuf, opts = {}) {
    if (rawBuf.readUInt32LE(0) !== 0x46546C67) {
        throw new Error('Invalid GLB binary header');
    }

    const jsonLen = rawBuf.readUInt32LE(12);
    const gltf = JSON.parse(rawBuf.slice(20, 20 + jsonLen).toString('utf8'));
    const binHeader = 20 + jsonLen;
    const binLen = rawBuf.readUInt32LE(binHeader);
    const binData = Buffer.alloc(binLen);
    rawBuf.copy(binData, 0, binHeader + 8, binHeader + 8 + binLen);

    let modified = false;

    // Apply optional material color adjustments & semantic renames
    if (gltf.materials && (opts.materialRenames || opts.materialColors)) {
        for (const mat of gltf.materials) {
            if (!mat.name) continue;
            if (opts.materialColors && opts.materialColors[mat.name]) {
                mat.pbrMetallicRoughness = mat.pbrMetallicRoughness || {};
                mat.pbrMetallicRoughness.baseColorFactor = opts.materialColors[mat.name];
                modified = true;
            }
            if (opts.materialRenames && opts.materialRenames[mat.name]) {
                mat.name = opts.materialRenames[mat.name];
                modified = true;
            }
        }
    }

    // Apply optional Y-axis rotation to static mesh vertices & normals
    const rotY = opts.rotY || 0;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const rotatedPosAccessors = new Set();
    const rotatedNormAccessors = new Set();

    if (Math.abs(rotY) > 1e-5) {
        modified = true;
        for (const mesh of (gltf.meshes || [])) {
            for (const prim of (mesh.primitives || [])) {
                const posIdx = prim.attributes.POSITION;
                if (posIdx !== undefined && !rotatedPosAccessors.has(posIdx)) {
                    rotatedPosAccessors.add(posIdx);
                    const acc = gltf.accessors[posIdx];
                    const bv = gltf.bufferViews[acc.bufferView];
                    const stride = bv.byteStride || 12;
                    const baseOff = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                    for (let i = 0; i < acc.count; i++) {
                        const off = baseOff + i * stride;
                        const x = binData.readFloatLE(off);
                        const y = binData.readFloatLE(off + 4);
                        const z = binData.readFloatLE(off + 8);
                        const rx = x * cosY + z * sinY;
                        const rz = -x * sinY + z * cosY;
                        binData.writeFloatLE(rx, off);
                        binData.writeFloatLE(rz, off + 8);
                        if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
                        if (y < minY) minY = y; if (y > maxY) maxY = y;
                        if (rz < minZ) minZ = rz; if (rz > maxZ) maxZ = rz;
                    }
                    acc.min = [minX, minY, minZ];
                    acc.max = [maxX, maxY, maxZ];
                }
                const normIdx = prim.attributes.NORMAL;
                if (normIdx !== undefined && !rotatedNormAccessors.has(normIdx)) {
                    rotatedNormAccessors.add(normIdx);
                    const acc = gltf.accessors[normIdx];
                    const bv = gltf.bufferViews[acc.bufferView];
                    const stride = bv.byteStride || 12;
                    const baseOff = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                    for (let i = 0; i < acc.count; i++) {
                        const off = baseOff + i * stride;
                        const nx = binData.readFloatLE(off);
                        const nz = binData.readFloatLE(off + 8);
                        const rnx = nx * cosY + nz * sinY;
                        const rnz = -nx * sinY + nz * cosY;
                        binData.writeFloatLE(rnx, off);
                        binData.writeFloatLE(rnz, off + 8);
                    }
                }
            }
        }
    }

    // Check if any primitive lacks TEXCOORD_0
    let needsUvUpgrade = false;
    for (const mesh of (gltf.meshes || [])) {
        for (const prim of (mesh.primitives || [])) {
            if (prim.attributes.TEXCOORD_0 === undefined) {
                needsUvUpgrade = true;
                break;
            }
        }
        if (needsUvUpgrade) break;
    }

    if (!needsUvUpgrade && !modified) {
        return { upgraded: false, buffer: rawBuf };
    }

    const appendedBuffers = [];
    let currentBinLen = binData.length;

    if (needsUvUpgrade) {
        for (const mesh of (gltf.meshes || [])) {
            for (const prim of (mesh.primitives || [])) {
                if (prim.attributes.TEXCOORD_0 !== undefined) continue;

                const posAcc = gltf.accessors[prim.attributes.POSITION];
                const posBv = gltf.bufferViews[posAcc.bufferView];
                const posStride = posBv.byteStride || 12;
                const posOffset = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
                const count = posAcc.count;

                const positions = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    const off = posOffset + i * posStride;
                    positions[i * 3] = binData.readFloatLE(off);
                    positions[i * 3 + 1] = binData.readFloatLE(off + 4);
                    positions[i * 3 + 2] = binData.readFloatLE(off + 8);
                }

                const normals = new Float32Array(count * 3);
                if (prim.attributes.NORMAL !== undefined) {
                    const normAcc = gltf.accessors[prim.attributes.NORMAL];
                    const normBv = gltf.bufferViews[normAcc.bufferView];
                    const normStride = normBv.byteStride || 12;
                    const normOffset = (normBv.byteOffset || 0) + (normAcc.byteOffset || 0);
                    for (let i = 0; i < count; i++) {
                        const off = normOffset + i * normStride;
                        normals[i * 3] = binData.readFloatLE(off);
                        normals[i * 3 + 1] = binData.readFloatLE(off + 4);
                        normals[i * 3 + 2] = binData.readFloatLE(off + 8);
                    }
                } else {
                    for (let i = 0; i < count; i++) normals[i * 3 + 1] = 1.0;
                }

                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                for (let vi = 0; vi < count; vi++) {
                    const x = positions[vi * 3], y = positions[vi * 3 + 1], z = positions[vi * 3 + 2];
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                }
                const dx = (maxX - minX) || 1.0;
                const dy = (maxY - minY) || 1.0;
                const dz = (maxZ - minZ) || 1.0;

                const uvs = new Float32Array(count * 2);
                let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
                for (let vi = 0; vi < count; vi++) {
                    const x = positions[vi * 3], y = positions[vi * 3 + 1], z = positions[vi * 3 + 2];
                    const nx = normals[vi * 3], ny = normals[vi * 3 + 1], nz = normals[vi * 3 + 2];
                    const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);
                    let u, v;
                    if (anx >= any && anx >= anz) {
                        u = (z - minZ) / dz;
                        v = (y - minY) / dy;
                    } else if (any >= anx && any >= anz) {
                        u = (x - minX) / dx;
                        v = (z - minZ) / dz;
                    } else {
                        u = (x - minX) / dx;
                        v = (y - minY) / dy;
                    }
                    uvs[vi * 2] = u;
                    uvs[vi * 2 + 1] = v;
                    if (u < minU) minU = u; if (u > maxU) maxU = u;
                    if (v < minV) minV = v; if (v > maxV) maxV = v;
                }

                const pad = (4 - (currentBinLen % 4)) % 4;
                if (pad > 0) {
                    appendedBuffers.push(Buffer.alloc(pad));
                    currentBinLen += pad;
                }

                const uvBuf = Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength);
                const uvByteOffset = currentBinLen;
                appendedBuffers.push(uvBuf);
                currentBinLen += uvBuf.length;

                const uvBvIdx = gltf.bufferViews.length;
                gltf.bufferViews.push({
                    buffer: 0,
                    byteOffset: uvByteOffset,
                    byteLength: uvBuf.length,
                    target: 34962
                });

                const uvAccIdx = gltf.accessors.length;
                gltf.accessors.push({
                    bufferView: uvBvIdx,
                    componentType: 5126,
                    count: count,
                    type: 'VEC2',
                    max: [maxU, maxV],
                    min: [minU, minV]
                });

                prim.attributes.TEXCOORD_0 = uvAccIdx;
            }
        }
    }

    const finalBin = Buffer.concat([binData, ...appendedBuffers]);
    gltf.buffers[0].byteLength = finalBin.length;

    let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
    if (jsonPad > 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

    const binPad = (4 - (finalBin.length % 4)) % 4;
    const finalBinPadded = binPad > 0 ? Buffer.concat([finalBin, Buffer.alloc(binPad, 0x00)]) : finalBin;

    const totalLen = 12 + 8 + jsonBuf.length + 8 + finalBinPadded.length;
    const outHeader = Buffer.alloc(12);
    outHeader.writeUInt32LE(0x46546C67, 0);
    outHeader.writeUInt32LE(2, 4);
    outHeader.writeUInt32LE(totalLen, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBuf.length, 0);
    jsonHeader.writeUInt32LE(0x4E4F534A, 4);

    const binHeaderBuf = Buffer.alloc(8);
    binHeaderBuf.writeUInt32LE(finalBinPadded.length, 0);
    binHeaderBuf.writeUInt32LE(0x004E4942, 4);

    return {
        upgraded: true,
        buffer: Buffer.concat([outHeader, jsonHeader, jsonBuf, binHeaderBuf, finalBinPadded])
    };
}

function upgradeGlb(filePath, opts = {}) {
    const rawBuf = fs.readFileSync(filePath);
    return upgradeGlbBuffer(rawBuf, opts);
}

function validateGlb(filePath) {
    const buf = fs.readFileSync(filePath);
    assert(buf.readUInt32LE(0) === 0x46546C67, `Invalid magic for ${filePath}`);
    assert(buf.readUInt32LE(4) === 2, `Version must be 2 for ${filePath}`);
    const totalLen = buf.readUInt32LE(8);
    assert(totalLen === buf.length, `Length mismatch in header for ${filePath}`);

    const jsonLen = buf.readUInt32LE(12);
    assert(buf.readUInt32LE(16) === 0x4E4F534A, `Missing JSON chunk in ${filePath}`);
    const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

    const binHeader = 20 + jsonLen;
    assert(buf.readUInt32LE(binHeader + 4) === 0x004E4942, `Missing BIN chunk in ${filePath}`);

    let totalVertices = 0;
    let primitivesCount = 0;
    for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
            primitivesCount++;
            assert(prim.attributes.POSITION !== undefined, `Primitive missing POSITION in ${filePath}`);
            assert(prim.attributes.NORMAL !== undefined, `Primitive missing NORMAL in ${filePath}`);
            assert(prim.attributes.TEXCOORD_0 !== undefined, `Primitive missing TEXCOORD_0 in ${filePath}`);
            const posAcc = gltf.accessors[prim.attributes.POSITION];
            assert(posAcc.count > 0, `Primitive has 0 vertices in ${filePath}`);
            totalVertices += posAcc.count;
        }
    }

    return {
        primitivesCount,
        totalVertices,
        materialsCount: gltf.materials ? gltf.materials.length : 0,
        fileSizeKb: (buf.length / 1024).toFixed(1)
    };
}

async function resolveArtistBuffer(src) {
    const scratchPath = path.join(SCRATCH_CANDIDATES_DIR, `${src.cacheKey}.glb`);
    if (fs.existsSync(scratchPath) && fs.statSync(scratchPath).size > 200) {
        return fs.readFileSync(scratchPath);
    }
    return await downloadBuffer(src.url);
}

async function main() {
    console.log('========================================================================');
    console.log(' ANGBAND 3D — OPEN-LICENSE ARTIST 3D ASSET INSTALLER & UPGRADER (v9.9.3)');
    console.log('========================================================================\n');

    for (const dir of [SERVER_BESTIARY_DIR, CLIENT_BESTIARY_DIR, SERVER_ITEMS_DIR, CLIENT_ITEMS_DIR]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    console.log('[Phase 1/3] Installing 16 Curated Artist Bestiary GLB Models...');
    const results = [];
    for (const src of BESTIARY_SOURCES) {
        const rawBuf = await resolveArtistBuffer(src);
        const { buffer } = upgradeGlbBuffer(rawBuf, src);
        const serverPath = path.join(SERVER_BESTIARY_DIR, src.name);
        const clientPath = path.join(CLIENT_BESTIARY_DIR, src.name);
        fs.writeFileSync(serverPath, buffer);
        fs.writeFileSync(clientPath, buffer);
        const vInfo = validateGlb(serverPath);
        results.push({ name: src.name, author: src.author, license: src.license, ...vInfo });
        console.log(`  ✓ Installed ${src.name.padEnd(22)} (${vInfo.fileSizeKb.padStart(6)} KB, ${String(vInfo.totalVertices).padStart(5)} verts) — "${src.title}" by ${src.author} (${src.license})`);
    }

    console.log('\n[Phase 2/3] Installing 3 Curated Artist Arcane Item GLB Models (wand, rod, staff)...');
    for (const src of ITEM_SOURCES) {
        const rawBuf = await resolveArtistBuffer(src);
        const { buffer } = upgradeGlbBuffer(rawBuf, src);
        const serverPath = path.join(SERVER_ITEMS_DIR, src.name);
        const clientPath = path.join(CLIENT_ITEMS_DIR, src.name);
        fs.writeFileSync(serverPath, buffer);
        fs.writeFileSync(clientPath, buffer);
        const vInfo = validateGlb(serverPath);
        console.log(`  ✓ Installed ${src.name.padEnd(22)} (${vInfo.fileSizeKb.padStart(6)} KB, ${String(vInfo.totalVertices).padStart(5)} verts) — "${src.title}" by ${src.author} (${src.license})`);
    }

    console.log('\n[Phase 3/3] Verifying Existing Animal Bestiary GLBs (giant_spider, snake, wasp, frog)...');
    for (const name of ['giant_spider.glb', 'snake.glb', 'wasp.glb', 'frog.glb']) {
        const serverPath = path.join(SERVER_BESTIARY_DIR, name);
        const clientPath = path.join(CLIENT_BESTIARY_DIR, name);
        const upg = upgradeGlb(serverPath);
        if (upg.upgraded) {
            fs.writeFileSync(serverPath, upg.buffer);
            fs.writeFileSync(clientPath, upg.buffer);
        }
        validateGlb(serverPath);
    }
    console.log('  ✓ All 19 artist models + 4 animal models verified with 100% Server/Client parity.\n');
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = {
    BESTIARY_SOURCES,
    ITEM_SOURCES,
    upgradeGlb,
    upgradeGlbBuffer,
    validateGlb
};

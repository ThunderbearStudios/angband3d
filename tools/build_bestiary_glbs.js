#!/usr/bin/env node
/**
 * tools/build_bestiary_glbs.js
 *
 * Card 19A: Offline Binary glTF 2.0 (.glb) Bestiary Asset Generator & Upgrader.
 * 
 * Generates 16 anatomically distinctive, multi-material, UV-mapped, smooth-normal
 * binary glTF 2.0 models with embedded procedural PBR normal/albedo textures:
 *   1. centipede.glb
 *   2. beetle.glb
 *   3. ant.glb
 *   4. scorpion.glb
 *   5. floating_eye.glb
 *   6. worm_mass.glb
 *   7. jelly_ooze.glb
 *   8. mushroom_cluster.glb
 *   9. vortex_elemental.glb
 *  10. quylthulg.glb
 *  11. hydra.glb
 *  12. naga.glb
 *  13. bat.glb
 *  14. bear.glb
 *  15. lizard.glb
 *  16. aquatic.glb
 *
 * Also upgrades 4 existing UV-less models (giant_spider.glb, snake.glb, wasp.glb, frog.glb)
 * by computing welded smooth vertex normals and box-projected TEXCOORD_0 UVs.
 *
 * Pure Node.js (fs, path, zlib) with ZERO external npm dependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

const SERVER_BESTIARY_DIR = path.resolve(__dirname, '../server/public/assets/models/monsters/bestiary');
const CLIENT_BESTIARY_DIR = path.resolve(__dirname, '../client/assets/models/monsters/bestiary');

// ==============================================================================
// 1. Pure Node.js PNG & CRC32 Generator
// ==============================================================================
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c >>> 0;
}

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(typeStr, data) {
    const len = data.length;
    const typeBuf = Buffer.from(typeStr, 'ascii');
    const chunk = Buffer.alloc(4 + 4 + len + 4);
    chunk.writeUInt32BE(len, 0);
    typeBuf.copy(chunk, 4);
    data.copy(chunk, 8);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    chunk.writeUInt32BE(crcVal, 8 + len);
    return chunk;
}

function createPng(width, height, rgbaBuffer) {
    const rowStride = 1 + width * 4;
    const rawData = Buffer.alloc(rowStride * height);
    for (let y = 0; y < height; y++) {
        const rowStart = y * rowStride;
        rawData[rowStart] = 0; // Filter None
        rgbaBuffer.copy(rawData, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }
    const deflated = zlib.deflateSync(rawData);

    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // 8 bits per channel
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; // Deflate
    ihdr[11] = 0; // Standard filter
    ihdr[12] = 0; // No interlace

    return Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', deflated),
        makeChunk('IEND', Buffer.alloc(0))
    ]);
}

// ==============================================================================
// 2. Procedural PBR Textures (Normal Maps & Albedo)
// ==============================================================================
function generateNormalMap(width, height, type) {
    const buf = Buffer.alloc(width * height * 4);
    const heightMap = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const u = x / width;
            const v = y / height;
            let h = 0;

            if (type === 'chitin') {
                // Hexagonal / micro-segmented plate bump
                const px = u * 24 * Math.PI;
                const py = v * 24 * Math.PI;
                h = Math.sin(px) * Math.cos(py) + 0.45 * Math.sin(px * 1.5 + py * 1.5);
            } else if (type === 'scales') {
                // Overlapping shingled scales
                const su = (x % 16) - 8;
                const sv = (y % 16) - 8;
                const d = Math.hypot(su, sv);
                h = Math.cos(d * 0.4) + 0.4 * Math.sin(v * 32 * Math.PI);
            } else if (type === 'fur') {
                // Fine directional fur strands
                h = Math.sin(u * 64 * Math.PI) * 0.6 + Math.sin(u * 128 * Math.PI + v * 8 * Math.PI) * 0.4;
            } else if (type === 'slime') {
                // Smooth undulating viscous ripple
                h = Math.sin(u * 8 * Math.PI) * Math.cos(v * 8 * Math.PI) + 0.5 * Math.sin((u + v) * 12 * Math.PI);
            } else if (type === 'flesh') {
                // Wrinkled organic skin
                h = Math.sin(u * 16 * Math.PI) * Math.sin(v * 12 * Math.PI) + 0.4 * Math.sin((u - v) * 20 * Math.PI);
            }
            heightMap[y * width + x] = h;
        }
    }

    const scale = 2.0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const xm1 = (x - 1 + width) % width;
            const xp1 = (x + 1) % width;
            const ym1 = (y - 1 + height) % height;
            const yp1 = (y + 1) % height;

            const dx = heightMap[y * width + xp1] - heightMap[y * width + xm1];
            const dy = heightMap[yp1 * width + x] - heightMap[ym1 * width + x];

            let nx = -dx * scale;
            let ny = -dy * scale;
            let nz = 1.0;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            nx /= len; ny /= len; nz /= len;

            const idx = (y * width + x) * 4;
            buf[idx + 0] = Math.round((nx * 0.5 + 0.5) * 255);
            buf[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            buf[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            buf[idx + 3] = 255;
        }
    }
    return createPng(width, height, buf);
}

function generateAlbedoMap(width, height, type) {
    const buf = Buffer.alloc(width * height * 4);
    const cx = width / 2;
    const cy = height / 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (type === 'sclera_veined') {
                // White sclera with red capillary veins
                let r = 246, g = 242, b = 238;
                const u = x / width * 16;
                const v = y / height * 16;
                const vein = Math.sin(u * 2.5 + Math.sin(v * 3.0)) * Math.cos(v * 2.2 + Math.cos(u * 3.1));
                if (Math.abs(vein) < 0.12) {
                    r = 185; g = 38; b = 42; // Red vein
                } else if (Math.abs(vein) < 0.22) {
                    r = 215; g = 140; b = 140;
                }
                buf[idx + 0] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
            } else if (type === 'iris') {
                // Radial fibrous iris with dark outer limbal ring
                const dx = (x - cx) / cx;
                const dy = (y - cy) / cy;
                const dist = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);
                let r = 220, g = 50, b = 25; // Fiery crimson iris
                if (dist <= 0.95) {
                    const striation = 0.5 + 0.5 * Math.sin(angle * 28 + Math.sin(dist * 12));
                    r = Math.round(180 + 70 * striation);
                    g = Math.round(35 + 85 * striation);
                    b = Math.round(15 + 40 * striation);
                    if (dist > 0.82) {
                        // Limbal ring
                        const f = (dist - 0.82) / 0.13;
                        r = Math.round(r * (1 - f * 0.8));
                        g = Math.round(g * (1 - f * 0.8));
                        b = Math.round(b * (1 - f * 0.8));
                    }
                } else {
                    r = 15; g = 10; b = 10;
                }
                buf[idx + 0] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
            } else if (type === 'spotted_cap') {
                // Scarlet cap with circular white fungal spots
                let r = 195, g = 28, b = 25;
                const spotCoords = [
                    [0.25, 0.25, 0.11], [0.75, 0.25, 0.09], [0.25, 0.75, 0.10], [0.75, 0.75, 0.12],
                    [0.50, 0.50, 0.14], [0.50, 0.15, 0.08], [0.50, 0.85, 0.08], [0.15, 0.50, 0.07], [0.85, 0.50, 0.07]
                ];
                const u = x / width;
                const v = y / height;
                for (const [sx, sy, sr] of spotCoords) {
                    const d = Math.hypot(u - sx, v - sy);
                    if (d < sr) {
                        const edge = Math.max(0, 1 - (d / sr));
                        r = Math.round(r * (1 - edge) + 248 * edge);
                        g = Math.round(g * (1 - edge) + 245 * edge);
                        b = Math.round(b * (1 - edge) + 238 * edge);
                    }
                }
                buf[idx + 0] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
            } else {
                buf[idx + 0] = 200; buf[idx + 1] = 200; buf[idx + 2] = 200; buf[idx + 3] = 255;
            }
        }
    }
    return createPng(width, height, buf);
}

// Pre-generate standard 128x128 PBR textures
const TEX_CHITIN_NORM = generateNormalMap(128, 128, 'chitin');
const TEX_SCALES_NORM = generateNormalMap(128, 128, 'scales');
const TEX_FUR_NORM = generateNormalMap(128, 128, 'fur');
const TEX_SLIME_NORM = generateNormalMap(128, 128, 'slime');
const TEX_FLESH_NORM = generateNormalMap(128, 128, 'flesh');
const TEX_SCLERA_ALBEDO = generateAlbedoMap(128, 128, 'sclera_veined');
const TEX_IRIS_ALBEDO = generateAlbedoMap(128, 128, 'iris');
const TEX_SPOTTED_CAP = generateAlbedoMap(128, 128, 'spotted_cap');

// ==============================================================================
// 3. 3D Vector & Spline Math Helpers
// ==============================================================================
function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vCross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}
function vNorm(a) {
    const len = Math.hypot(a[0], a[1], a[2]) || 1.0;
    return [a[0] / len, a[1] / len, a[2] / len];
}
function vDist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ==============================================================================
// 4. Parametric Mesh Builder
// ==============================================================================
class MeshBuilder {
    constructor() {
        this.materials = [];
        this.primitives = new Map(); // matIdx -> { positions: [], normals: [], uvs: [], indices: [] }
        this.textures = []; // PNG buffers to embed
    }

    addMaterial(mat) {
        const idx = this.materials.length;
        this.materials.push({
            name: mat.name,
            baseColorFactor: mat.baseColorFactor || [1, 1, 1, 1],
            metallicFactor: mat.metallicFactor !== undefined ? mat.metallicFactor : 0.1,
            roughnessFactor: mat.roughnessFactor !== undefined ? mat.roughnessFactor : 0.5,
            emissiveFactor: mat.emissiveFactor || undefined,
            alphaMode: mat.alphaMode || 'OPAQUE',
            doubleSided: !!mat.doubleSided,
            normalTextureIndex: mat.normalTextureIndex,
            baseColorTextureIndex: mat.baseColorTextureIndex
        });
        this.primitives.set(idx, {
            positions: [],
            normals: [],
            uvs: [],
            indices: []
        });
        return idx;
    }

    addTexture(pngBuffer) {
        const idx = this.textures.length;
        this.textures.push(pngBuffer);
        return idx;
    }

    _getPrim(matIdx) {
        let prim = this.primitives.get(matIdx);
        if (!prim) {
            prim = { positions: [], normals: [], uvs: [], indices: [] };
            this.primitives.set(matIdx, prim);
        }
        return prim;
    }

    addVertex(matIdx, pos, norm, uv) {
        const prim = this._getPrim(matIdx);
        const idx = prim.positions.length / 3;
        prim.positions.push(pos[0], pos[1], pos[2]);
        prim.normals.push(norm[0], norm[1], norm[2]);
        prim.uvs.push(uv[0], uv[1]);
        return idx;
    }

    addTriangle(matIdx, p0, p1, p2, n0, n1, n2, uv0, uv1, uv2) {
        const i0 = this.addVertex(matIdx, p0, n0, uv0);
        const i1 = this.addVertex(matIdx, p1, n1, uv1);
        const i2 = this.addVertex(matIdx, p2, n2, uv2);
        const prim = this._getPrim(matIdx);
        prim.indices.push(i0, i1, i2);
    }

    addQuad(matIdx, p0, p1, p2, p3, n0, n1, n2, n3, uv0, uv1, uv2, uv3) {
        const i0 = this.addVertex(matIdx, p0, n0, uv0);
        const i1 = this.addVertex(matIdx, p1, n1, uv1);
        const i2 = this.addVertex(matIdx, p2, n2, uv2);
        const i3 = this.addVertex(matIdx, p3, n3, uv3);
        const prim = this._getPrim(matIdx);
        prim.indices.push(i0, i1, i2);
        prim.indices.push(i0, i2, i3);
    }

    addEllipsoid(cx, cy, cz, rx, ry, rz, uSegs, vSegs, matIdx, uScale = 1.0, vScale = 1.0) {
        uSegs = uSegs || 12;
        vSegs = vSegs || 8;
        const grid = [];

        for (let j = 0; j <= vSegs; j++) {
            const row = [];
            const theta = (j / vSegs) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let i = 0; i <= uSegs; i++) {
                const phi = (i / uSegs) * 2 * Math.PI;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cx + rx * sinTheta * cosPhi;
                const y = cy + ry * cosTheta;
                const z = cz + rz * sinTheta * sinPhi;

                // Analytical normal
                const nx = (sinTheta * cosPhi) / rx;
                const ny = cosTheta / ry;
                const nz = (sinTheta * sinPhi) / rz;
                const norm = vNorm([nx, ny, nz]);

                const uv = [(i / uSegs) * uScale, (j / vSegs) * vScale];
                row.push(this.addVertex(matIdx, [x, y, z], norm, uv));
            }
            grid.push(row);
        }

        const prim = this._getPrim(matIdx);
        for (let j = 0; j < vSegs; j++) {
            for (let i = 0; i < uSegs; i++) {
                const i0 = grid[j][i];
                const i1 = grid[j + 1][i];
                const i2 = grid[j + 1][i + 1];
                const i3 = grid[j][i + 1];
                prim.indices.push(i0, i1, i2);
                prim.indices.push(i0, i2, i3);
            }
        }
    }

    addTube(points, radii, radialSegs, matIdx, closeCaps = true) {
        radialSegs = radialSegs || 8;
        if (points.length < 2) return;

        // Compute tangent vectors along curve
        const tangents = [];
        for (let i = 0; i < points.length; i++) {
            if (i === 0) {
                tangents.push(vNorm(vSub(points[1], points[0])));
            } else if (i === points.length - 1) {
                tangents.push(vNorm(vSub(points[i], points[i - 1])));
            } else {
                tangents.push(vNorm(vSub(points[i + 1], points[i - 1])));
            }
        }

        // Parallel transport frames (normal, binormal)
        const normals = [];
        const binormals = [];

        let initV = [0, 1, 0];
        if (Math.abs(vDot(initV, tangents[0])) > 0.9) initV = [1, 0, 0];
        let n0 = vNorm(vCross(tangents[0], initV));
        let b0 = vNorm(vCross(tangents[0], n0));
        normals.push(n0);
        binormals.push(b0);

        for (let i = 1; i < points.length; i++) {
            const tPrev = tangents[i - 1];
            const tCurr = tangents[i];
            const axis = vCross(tPrev, tCurr);
            const dot = Math.min(1.0, Math.max(-1.0, vDot(tPrev, tCurr)));
            const angle = Math.acos(dot);

            let nCurr;
            if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-5) {
                nCurr = normals[i - 1];
            } else {
                // Rotate normal around axis by angle
                const uAxis = vNorm(axis);
                const nPrev = normals[i - 1];
                // Rodrigues' rotation formula
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                nCurr = vAdd(
                    vAdd(vScale(nPrev, cosA), vScale(vCross(uAxis, nPrev), sinA)),
                    vScale(uAxis, vDot(uAxis, nPrev) * (1 - cosA))
                );
                nCurr = vNorm(nCurr);
            }
            const bCurr = vNorm(vCross(tCurr, nCurr));
            normals.push(nCurr);
            binormals.push(bCurr);
        }

        // Build vertex rings
        const rings = [];
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const r = Array.isArray(radii) ? radii[i] : radii;
            const n = normals[i];
            const b = binormals[i];
            const vParam = i / (points.length - 1);

            const ring = [];
            for (let j = 0; j <= radialSegs; j++) {
                const phi = (j / radialSegs) * 2 * Math.PI;
                const cosP = Math.cos(phi);
                const sinP = Math.sin(phi);

                const norm = vAdd(vScale(n, cosP), vScale(b, sinP));
                const pos = vAdd(p, vScale(norm, r));
                const uv = [j / radialSegs, vParam];
                ring.push(this.addVertex(matIdx, pos, norm, uv));
            }
            rings.push(ring);
        }

        const prim = this._getPrim(matIdx);
        for (let i = 0; i < points.length - 1; i++) {
            for (let j = 0; j < radialSegs; j++) {
                const i0 = rings[i][j];
                const i1 = rings[i + 1][j];
                const i2 = rings[i + 1][j + 1];
                const i3 = rings[i][j + 1];
                prim.indices.push(i0, i1, i2);
                prim.indices.push(i0, i2, i3);
            }
        }

        if (closeCaps) {
            // Front cap at i = 0
            const capNorm0 = vScale(tangents[0], -1);
            const capCenter0 = this.addVertex(matIdx, points[0], capNorm0, [0.5, 0.5]);
            for (let j = 0; j < radialSegs; j++) {
                prim.indices.push(capCenter0, rings[0][j + 1], rings[0][j]);
            }
            // End cap at i = points.length - 1
            const capNorm1 = tangents[tangents.length - 1];
            const capCenter1 = this.addVertex(matIdx, points[points.length - 1], capNorm1, [0.5, 0.5]);
            for (let j = 0; j < radialSegs; j++) {
                prim.indices.push(capCenter1, rings[rings.length - 1][j], rings[rings.length - 1][j + 1]);
            }
        }
    }

    addCone(p0, p1, r0, r1, radialSegs, matIdx, closeCaps = true) {
        this.addTube([p0, p1], [r0, r1], radialSegs || 8, matIdx, closeCaps);
    }

    addSpike(baseCenter, tip, baseRadius, radialSegs, matIdx) {
        this.addCone(baseCenter, tip, baseRadius, 0.002, radialSegs || 6, matIdx, true);
    }

    addBox(cx, cy, cz, sx, sy, sz, matIdx) {
        const hx = sx / 2, hy = sy / 2, hz = sz / 2;
        // +Z, -Z, +X, -X, +Y, -Y
        const faces = [
            { norm: [0, 0, 1], pts: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
            { norm: [0, 0, -1], pts: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
            { norm: [1, 0, 0], pts: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
            { norm: [-1, 0, 0], pts: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
            { norm: [0, 1, 0], pts: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
            { norm: [0, -1, 0], pts: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] }
        ];

        for (const f of faces) {
            const p0 = [cx + f.pts[0][0], cy + f.pts[0][1], cz + f.pts[0][2]];
            const p1 = [cx + f.pts[1][0], cy + f.pts[1][1], cz + f.pts[1][2]];
            const p2 = [cx + f.pts[2][0], cy + f.pts[2][1], cz + f.pts[2][2]];
            const p3 = [cx + f.pts[3][0], cy + f.pts[3][1], cz + f.pts[3][2]];
            this.addQuad(matIdx, p0, p1, p2, p3, f.norm, f.norm, f.norm, f.norm, [0, 0], [1, 0], [1, 1], [0, 1]);
        }
    }

    addDisk(cx, cy, cz, normal, radius, radialSegs, matIdx) {
        radialSegs = radialSegs || 12;
        const norm = vNorm(normal);
        let up = [0, 1, 0];
        if (Math.abs(vDot(up, norm)) > 0.9) up = [1, 0, 0];
        const right = vNorm(vCross(norm, up));
        const binorm = vNorm(vCross(norm, right));

        const centerIdx = this.addVertex(matIdx, [cx, cy, cz], norm, [0.5, 0.5]);
        const rim = [];
        for (let i = 0; i <= radialSegs; i++) {
            const phi = (i / radialSegs) * 2 * Math.PI;
            const cosP = Math.cos(phi);
            const sinP = Math.sin(phi);
            const pt = vAdd([cx, cy, cz], vAdd(vScale(right, cosP * radius), vScale(binorm, sinP * radius)));
            const uv = [cosP * 0.5 + 0.5, sinP * 0.5 + 0.5];
            rim.push(this.addVertex(matIdx, pt, norm, uv));
        }

        const prim = this._getPrim(matIdx);
        for (let i = 0; i < radialSegs; i++) {
            prim.indices.push(centerIdx, rim[i], rim[i + 1]);
        }
    }

    addRibbon(points, widths, upVector, matIdx) {
        if (points.length < 2) return;
        const up = vNorm(upVector);

        const leftPts = [];
        const rightPts = [];
        for (let i = 0; i < points.length; i++) {
            let tangent;
            if (i === 0) tangent = vNorm(vSub(points[1], points[0]));
            else if (i === points.length - 1) tangent = vNorm(vSub(points[i], points[i - 1]));
            else tangent = vNorm(vSub(points[i + 1], points[i - 1]));

            const side = vNorm(vCross(tangent, up));
            const w = (Array.isArray(widths) ? widths[i] : widths) / 2;

            leftPts.push(vAdd(points[i], vScale(side, -w)));
            rightPts.push(vAdd(points[i], vScale(side, w)));
        }

        const prim = this._getPrim(matIdx);
        for (let i = 0; i < points.length - 1; i++) {
            const v0 = i / (points.length - 1);
            const v1 = (i + 1) / (points.length - 1);

            const p0 = leftPts[i], p1 = rightPts[i];
            const p2 = rightPts[i + 1], p3 = leftPts[i + 1];

            const i0 = this.addVertex(matIdx, p0, up, [0, v0]);
            const i1 = this.addVertex(matIdx, p1, up, [1, v0]);
            const i2 = this.addVertex(matIdx, p2, up, [1, v1]);
            const i3 = this.addVertex(matIdx, p3, up, [0, v1]);

            prim.indices.push(i0, i1, i2);
            prim.indices.push(i0, i2, i3);
        }
    }

    toGlbBuffer() {
        const binParts = [];
        let currentBinOffset = 0;

        function appendData(buf) {
            const pad = (4 - (currentBinOffset % 4)) % 4;
            if (pad > 0) {
                binParts.push(Buffer.alloc(pad));
                currentBinOffset += pad;
            }
            const offset = currentBinOffset;
            binParts.push(buf);
            currentBinOffset += buf.length;
            return offset;
        }

        const gltf = {
            asset: { version: '2.0', generator: 'Angband3D Bestiary Generator' },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ mesh: 0 }],
            meshes: [{ primitives: [] }],
            materials: [],
            textures: [],
            images: [],
            samplers: [{ wrapS: 10497, wrapT: 10497 }],
            accessors: [],
            bufferViews: [],
            buffers: [{ byteLength: 0 }]
        };

        // 1. Write Embedded Texture Images
        for (let tIdx = 0; tIdx < this.textures.length; tIdx++) {
            const pngBuf = this.textures[tIdx];
            const imgOffset = appendData(pngBuf);
            const bvIdx = gltf.bufferViews.length;
            gltf.bufferViews.push({
                buffer: 0,
                byteOffset: imgOffset,
                byteLength: pngBuf.length
            });
            const imgIdx = gltf.images.length;
            gltf.images.push({
                bufferView: bvIdx,
                mimeType: 'image/png'
            });
            gltf.textures.push({
                sampler: 0,
                source: imgIdx
            });
        }

        // 2. Build Materials
        for (const m of this.materials) {
            const pbr = {
                baseColorFactor: m.baseColorFactor,
                metallicFactor: m.metallicFactor,
                roughnessFactor: m.roughnessFactor
            };
            if (m.baseColorTextureIndex !== undefined) {
                pbr.baseColorTexture = { index: m.baseColorTextureIndex };
            }
            const matDef = {
                name: m.name,
                pbrMetallicRoughness: pbr
            };
            if (m.normalTextureIndex !== undefined) {
                matDef.normalTexture = { index: m.normalTextureIndex, scale: 0.85 };
            }
            if (m.emissiveFactor) {
                matDef.emissiveFactor = m.emissiveFactor;
            }
            if (m.alphaMode && m.alphaMode !== 'OPAQUE') {
                matDef.alphaMode = m.alphaMode;
            }
            if (m.doubleSided) {
                matDef.doubleSided = true;
            }
            gltf.materials.push(matDef);
        }

        // 3. Build Mesh Primitives (one per material with geometry)
        for (let mIdx = 0; mIdx < this.materials.length; mIdx++) {
            const prim = this.primitives.get(mIdx);
            if (!prim || prim.positions.length === 0) continue;

            const vCount = prim.positions.length / 3;

            // Compute bounding box
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let i = 0; i < vCount; i++) {
                const x = prim.positions[i * 3], y = prim.positions[i * 3 + 1], z = prim.positions[i * 3 + 2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }

            // POSITION Buffer
            const posF32 = new Float32Array(prim.positions);
            const posBuf = Buffer.from(posF32.buffer, posF32.byteOffset, posF32.byteLength);
            const posOffset = appendData(posBuf);
            const posBv = gltf.bufferViews.length;
            gltf.bufferViews.push({ buffer: 0, byteOffset: posOffset, byteLength: posBuf.length, target: 34962 });
            const posAcc = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: posBv,
                componentType: 5126,
                count: vCount,
                type: 'VEC3',
                max: [maxX, maxY, maxZ],
                min: [minX, minY, minZ]
            });

            // NORMAL Buffer
            const normF32 = new Float32Array(prim.normals);
            const normBuf = Buffer.from(normF32.buffer, normF32.byteOffset, normF32.byteLength);
            const normOffset = appendData(normBuf);
            const normBv = gltf.bufferViews.length;
            gltf.bufferViews.push({ buffer: 0, byteOffset: normOffset, byteLength: normBuf.length, target: 34962 });
            const normAcc = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: normBv,
                componentType: 5126,
                count: vCount,
                type: 'VEC3'
            });

            // TEXCOORD_0 Buffer
            const uvF32 = new Float32Array(prim.uvs);
            const uvBuf = Buffer.from(uvF32.buffer, uvF32.byteOffset, uvF32.byteLength);
            const uvOffset = appendData(uvBuf);
            const uvBv = gltf.bufferViews.length;
            gltf.bufferViews.push({ buffer: 0, byteOffset: uvOffset, byteLength: uvBuf.length, target: 34962 });
            const uvAcc = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: uvBv,
                componentType: 5126,
                count: vCount,
                type: 'VEC2'
            });

            // INDICES Buffer
            let indBuf, indCompType;
            if (vCount < 65535) {
                const indU16 = new Uint16Array(prim.indices);
                indBuf = Buffer.from(indU16.buffer, indU16.byteOffset, indU16.byteLength);
                indCompType = 5123; // UNSIGNED_SHORT
            } else {
                const indU32 = new Uint32Array(prim.indices);
                indBuf = Buffer.from(indU32.buffer, indU32.byteOffset, indU32.byteLength);
                indCompType = 5125; // UNSIGNED_INT
            }
            const indOffset = appendData(indBuf);
            const indBv = gltf.bufferViews.length;
            gltf.bufferViews.push({ buffer: 0, byteOffset: indOffset, byteLength: indBuf.length, target: 34963 });
            const indAcc = gltf.accessors.length;
            gltf.accessors.push({
                bufferView: indBv,
                componentType: indCompType,
                count: prim.indices.length,
                type: 'SCALAR'
            });

            gltf.meshes[0].primitives.push({
                attributes: {
                    POSITION: posAcc,
                    NORMAL: normAcc,
                    TEXCOORD_0: uvAcc
                },
                indices: indAcc,
                material: mIdx,
                mode: 4 // TRIANGLES
            });
        }

        const finalBin = Buffer.concat(binParts);
        gltf.buffers[0].byteLength = finalBin.length;

        let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
        const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
        if (jsonPad > 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

        const binPad = (4 - (finalBin.length % 4)) % 4;
        const finalBinPadded = binPad > 0 ? Buffer.concat([finalBin, Buffer.alloc(binPad, 0x00)]) : finalBin;

        const totalLen = 12 + 8 + jsonBuf.length + 8 + finalBinPadded.length;

        const outHeader = Buffer.alloc(12);
        outHeader.writeUInt32LE(0x46546C67, 0); // 'glTF'
        outHeader.writeUInt32LE(2, 4);          // version 2
        outHeader.writeUInt32LE(totalLen, 8);   // total length

        const jsonHeader = Buffer.alloc(8);
        jsonHeader.writeUInt32LE(jsonBuf.length, 0);
        jsonHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

        const binHeader = Buffer.alloc(8);
        binHeader.writeUInt32LE(finalBinPadded.length, 0);
        binHeader.writeUInt32LE(0x004E4942, 4);  // 'BIN\0'

        return Buffer.concat([outHeader, jsonHeader, jsonBuf, binHeader, finalBinPadded]);
    }
}

// ==============================================================================
// 5. Procedural Anatomical Generators (16 Unique Bestiary Models)
// ==============================================================================

// 1. Centipede (9-segment S-curve myriapod body, 18 legs, antennae, venom forcipules, dark eyes)
function generateCentipede() {
    const b = new MeshBuilder();
    const tChitin = b.addTexture(TEX_CHITIN_NORM);
    const matChitin = b.addMaterial({
        name: 'Body_Chitin',
        baseColorFactor: [0.28, 0.14, 0.08, 1.0],
        roughnessFactor: 0.28,
        metallicFactor: 0.12,
        normalTextureIndex: tChitin
    });
    const matFang = b.addMaterial({
        name: 'Fang_Bone',
        baseColorFactor: [0.85, 0.82, 0.70, 1.0],
        roughnessFactor: 0.35,
        metallicFactor: 0.05
    });
    const matEye = b.addMaterial({
        name: 'Eye_Dark',
        baseColorFactor: [0.05, 0.05, 0.05, 1.0],
        roughnessFactor: 0.1,
        metallicFactor: 0.2
    });

    const numSegments = 9;
    for (let s = 0; s < numSegments; s++) {
        const t = s / (numSegments - 1);
        const cz = -0.75 + s * (1.5 / (numSegments - 1));
        const cx = 0.14 * Math.sin(t * Math.PI * 2);
        const cy = 0.14;
        const rx = 0.18 * (0.75 + 0.25 * Math.sin(t * Math.PI));
        const rz = 0.11;

        // Dorsal arched chitin plate
        b.addEllipsoid(cx, cy + 0.03, cz, rx, 0.08, rz, 12, 8, matChitin);
        // Ventral belly
        b.addEllipsoid(cx, cy - 0.02, cz, rx * 0.82, 0.06, rz * 0.85, 10, 6, matChitin);

        // Pair of articulated legs per segment (18 legs total)
        for (const side of [-1, 1]) {
            const root = [cx + side * rx * 0.8, cy, cz];
            const knee = [cx + side * (rx + 0.18), cy + 0.09, cz - 0.02 * side];
            const foot = [cx + side * (rx + 0.32), 0.0, cz - 0.04 * side]; // Touch y=0
            b.addTube([root, knee, foot], [0.022, 0.016, 0.008], 6, matChitin);
        }
    }

    // Head capsule at front (s = 8)
    const headX = 0.14 * Math.sin(Math.PI * 2);
    const headZ = 0.75 + 0.12;
    b.addEllipsoid(headX, 0.15, headZ, 0.16, 0.08, 0.13, 12, 8, matChitin);

    // Dark compound eyes
    b.addEllipsoid(headX - 0.10, 0.18, headZ + 0.04, 0.035, 0.035, 0.035, 8, 6, matEye);
    b.addEllipsoid(headX + 0.10, 0.18, headZ + 0.04, 0.035, 0.035, 0.035, 8, 6, matEye);

    // Venomous forcipules (Fang_Bone)
    b.addTube([[headX - 0.08, 0.11, headZ + 0.08], [headX - 0.05, 0.09, headZ + 0.17], [headX - 0.01, 0.08, headZ + 0.20]], [0.024, 0.015, 0.005], 6, matFang);
    b.addTube([[headX + 0.08, 0.11, headZ + 0.08], [headX + 0.05, 0.09, headZ + 0.17], [headX + 0.01, 0.08, headZ + 0.20]], [0.024, 0.015, 0.005], 6, matFang);

    // Long segmented curved antennae
    b.addTube([[headX - 0.05, 0.17, headZ + 0.10], [headX - 0.15, 0.25, headZ + 0.28], [headX - 0.28, 0.32, headZ + 0.48], [headX - 0.38, 0.38, headZ + 0.65]], [0.014, 0.010, 0.007, 0.004], 6, matChitin);
    b.addTube([[headX + 0.05, 0.17, headZ + 0.10], [headX + 0.15, 0.25, headZ + 0.28], [headX + 0.28, 0.32, headZ + 0.48], [headX + 0.38, 0.38, headZ + 0.65]], [0.014, 0.010, 0.007, 0.004], 6, matChitin);

    return b.toGlbBuffer();
}

// 2. Beetle (Domed scarab/stag carapace, central seam, serrated stag mandibles, 6 legs touching y=0)
function generateBeetle() {
    const b = new MeshBuilder();
    const tChitin = b.addTexture(TEX_CHITIN_NORM);
    const matChitin = b.addMaterial({
        name: 'Body_Chitin',
        baseColorFactor: [0.18, 0.12, 0.10, 1.0],
        roughnessFactor: 0.22,
        metallicFactor: 0.25,
        normalTextureIndex: tChitin
    });
    const matFang = b.addMaterial({
        name: 'Fang_Bone',
        baseColorFactor: [0.82, 0.78, 0.65, 1.0],
        roughnessFactor: 0.32,
        metallicFactor: 0.1
    });
    const matEye = b.addMaterial({
        name: 'Eye_Dark',
        baseColorFactor: [0.05, 0.05, 0.05, 1.0],
        roughnessFactor: 0.1
    });

    // Abdomen & split elytra carapace (with central seam)
    b.addEllipsoid(-0.16, 0.34, -0.10, 0.20, 0.17, 0.36, 12, 8, matChitin); // Left elytron
    b.addEllipsoid(0.16, 0.34, -0.10, 0.20, 0.17, 0.36, 12, 8, matChitin);  // Right elytron
    b.addEllipsoid(0.0, 0.22, -0.10, 0.32, 0.13, 0.34, 10, 6, matChitin);   // Ventral belly

    // Armored pronotum (thoracic collar)
    b.addEllipsoid(0.0, 0.32, 0.28, 0.28, 0.16, 0.16, 12, 8, matChitin);
    // Dorsal thoracic horn
    b.addSpike([0.0, 0.38, 0.30], [0.0, 0.52, 0.44], 0.045, 6, matChitin);

    // Head capsule
    b.addEllipsoid(0.0, 0.24, 0.46, 0.18, 0.12, 0.12, 10, 8, matChitin);
    b.addEllipsoid(-0.16, 0.26, 0.46, 0.035, 0.035, 0.035, 8, 6, matEye);
    b.addEllipsoid(0.16, 0.26, 0.46, 0.035, 0.035, 0.035, 8, 6, matEye);

    // Serrated stag mandibles (Fang_Bone)
    for (const side of [-1, 1]) {
        const p0 = [side * 0.09, 0.22, 0.54];
        const p1 = [side * 0.18, 0.26, 0.72];
        const p2 = [side * 0.10, 0.28, 0.90];
        const p3 = [side * 0.02, 0.28, 1.00]; // Curve inward
        b.addTube([p0, p1, p2, p3], [0.032, 0.024, 0.016, 0.006], 6, matFang);
        // Serrated teeth along inner jaw
        b.addSpike([side * 0.15, 0.26, 0.74], [side * 0.06, 0.26, 0.77], 0.014, 5, matFang);
        b.addSpike([side * 0.11, 0.27, 0.86], [side * 0.03, 0.27, 0.88], 0.012, 5, matFang);
    }

    // 6 Spiked insect legs touching y=0
    const legOffsets = [
        { root: [0.22, 0.26, 0.32], knee: [0.42, 0.36, 0.42], foot: [0.48, 0.0, 0.55] }, // Front
        { root: [0.24, 0.24, 0.05], knee: [0.52, 0.32, 0.05], foot: [0.58, 0.0, 0.05] }, // Mid
        { root: [0.22, 0.24, -0.25], knee: [0.46, 0.32, -0.40], foot: [0.52, 0.0, -0.52] } // Rear
    ];
    for (const l of legOffsets) {
        b.addTube([l.root, l.knee, l.foot], [0.03, 0.022, 0.01], 6, matChitin);
        b.addTube([[-l.root[0], l.root[1], l.root[2]], [-l.knee[0], l.knee[1], l.knee[2]], [-l.foot[0], l.foot[1], l.foot[2]]], [0.03, 0.022, 0.01], 6, matChitin);
    }

    return b.toGlbBuffer();
}

// 3. Ant (3 tagmata: head, narrow mesosoma, petiole node, bulbous gaster; mandibles, antennae, 6 legs)
function generateAnt() {
    const b = new MeshBuilder();
    const tChitin = b.addTexture(TEX_CHITIN_NORM);
    const matChitin = b.addMaterial({
        name: 'Body_Chitin',
        baseColorFactor: [0.20, 0.15, 0.12, 1.0],
        roughnessFactor: 0.25,
        metallicFactor: 0.15,
        normalTextureIndex: tChitin
    });
    const matFang = b.addMaterial({
        name: 'Fang_Bone',
        baseColorFactor: [0.85, 0.80, 0.68, 1.0],
        roughnessFactor: 0.35
    });
    const matEye = b.addMaterial({
        name: 'Eye_Dark',
        baseColorFactor: [0.05, 0.05, 0.05, 1.0],
        roughnessFactor: 0.1
    });

    // Tagma 1: Bulbous Gaster (abdomen)
    b.addEllipsoid(0.0, 0.30, -0.42, 0.24, 0.22, 0.32, 14, 10, matChitin);

    // Petiole nodes (constricted waist)
    b.addEllipsoid(0.0, 0.25, -0.14, 0.06, 0.06, 0.05, 8, 6, matChitin);
    b.addEllipsoid(0.0, 0.26, -0.05, 0.07, 0.07, 0.06, 8, 6, matChitin);

    // Tagma 2: Mesosoma (thorax)
    b.addEllipsoid(0.0, 0.30, 0.14, 0.14, 0.13, 0.18, 12, 8, matChitin);

    // Neck
    b.addTube([[0, 0.29, 0.28], [0, 0.27, 0.35]], [0.05, 0.045], 6, matChitin);

    // Tagma 3: Heart-shaped / tapered Head
    b.addEllipsoid(0.0, 0.28, 0.46, 0.15, 0.13, 0.14, 12, 8, matChitin);

    // Compound dark eyes
    b.addEllipsoid(-0.13, 0.32, 0.47, 0.04, 0.04, 0.035, 8, 6, matEye);
    b.addEllipsoid(0.13, 0.32, 0.47, 0.04, 0.04, 0.035, 8, 6, matEye);

    // Serrated clamping mandibles (Fang_Bone)
    b.addSpike([-0.07, 0.21, 0.54], [-0.01, 0.20, 0.66], 0.028, 5, matFang);
    b.addSpike([0.07, 0.21, 0.54], [0.01, 0.20, 0.66], 0.028, 5, matFang);

    // Elbowed antennae
    for (const side of [-1, 1]) {
        const p0 = [side * 0.05, 0.33, 0.51];
        const p1 = [side * 0.14, 0.45, 0.58]; // Scape
        const p2 = [side * 0.22, 0.42, 0.78]; // Funiculus
        b.addTube([p0, p1, p2], [0.012, 0.009, 0.005], 6, matChitin);
    }

    // 6 Grounded articulated legs touching y=0
    const legAnchors = [
        { root: [0.12, 0.30, 0.24], knee: [0.38, 0.46, 0.32], foot: [0.45, 0.0, 0.40] },
        { root: [0.14, 0.29, 0.14], knee: [0.46, 0.44, 0.14], foot: [0.52, 0.0, 0.14] },
        { root: [0.12, 0.28, 0.04], knee: [0.42, 0.42, -0.15], foot: [0.48, 0.0, -0.28] }
    ];
    for (const l of legAnchors) {
        b.addTube([l.root, l.knee, l.foot], [0.024, 0.018, 0.008], 6, matChitin);
        b.addTube([[-l.root[0], l.root[1], l.root[2]], [-l.knee[0], l.knee[1], l.knee[2]], [-l.foot[0], l.foot[1], l.foot[2]]], [0.024, 0.018, 0.008], 6, matChitin);
    }

    return b.toGlbBuffer();
}

// 4. Scorpion (Armored prosoma, 2 pedipalp chelae, 8 legs, 5-segment tail curving over back, telson stinger)
function generateScorpion() {
    const b = new MeshBuilder();
    const tChitin = b.addTexture(TEX_CHITIN_NORM);
    const matChitin = b.addMaterial({
        name: 'Body_Chitin',
        baseColorFactor: [0.24, 0.16, 0.10, 1.0],
        roughnessFactor: 0.30,
        metallicFactor: 0.15,
        normalTextureIndex: tChitin
    });
    const matFang = b.addMaterial({
        name: 'Fang_Bone',
        baseColorFactor: [0.88, 0.82, 0.65, 1.0],
        roughnessFactor: 0.30
    });
    const matEye = b.addMaterial({
        name: 'Eye_Dark',
        baseColorFactor: [0.05, 0.05, 0.05, 1.0],
        roughnessFactor: 0.1
    });

    // Flat armored prosoma + mesosoma
    b.addEllipsoid(0.0, 0.18, 0.0, 0.26, 0.10, 0.32, 12, 8, matChitin);
    // Tergite ridges
    for (let i = -2; i <= 2; i++) {
        b.addBox(0.0, 0.23, i * 0.09, 0.42 - Math.abs(i) * 0.05, 0.02, 0.05, matChitin);
    }

    // Eyes
    b.addEllipsoid(-0.04, 0.24, 0.16, 0.02, 0.02, 0.02, 6, 6, matEye);
    b.addEllipsoid(0.04, 0.24, 0.16, 0.02, 0.02, 0.02, 6, 6, matEye);

    // 2 Large forward pedipalp pincer chelae
    for (const side of [-1, 1]) {
        const arm0 = [side * 0.18, 0.18, 0.24];
        const arm1 = [side * 0.38, 0.22, 0.42];
        const arm2 = [side * 0.30, 0.22, 0.64];
        b.addTube([arm0, arm1, arm2], [0.04, 0.035, 0.03], 6, matChitin);

        // Chela palm
        b.addEllipsoid(side * 0.30, 0.22, 0.74, 0.08, 0.06, 0.10, 10, 8, matChitin);
        // Fixed finger & movable finger (Fang_Bone)
        b.addSpike([side * 0.26, 0.22, 0.82], [side * 0.22, 0.22, 0.94], 0.025, 5, matFang);
        b.addSpike([side * 0.34, 0.22, 0.82], [side * 0.30, 0.22, 0.92], 0.022, 5, matFang);
    }

    // 8 Walking legs touching y=0
    const legZOffsets = [0.18, 0.06, -0.06, -0.18];
    for (const zOff of legZOffsets) {
        for (const side of [-1, 1]) {
            const root = [side * 0.22, 0.16, zOff];
            const knee = [side * 0.45, 0.24, zOff];
            const foot = [side * 0.52, 0.0, zOff + (zOff > 0 ? 0.05 : -0.05)];
            b.addTube([root, knee, foot], [0.025, 0.018, 0.008], 6, matChitin);
        }
    }

    // 5-Segment Metasoma Tail curving high over back
    const tailPts = [
        [0.0, 0.18, -0.32],
        [0.0, 0.26, -0.46],
        [0.0, 0.44, -0.56],
        [0.0, 0.66, -0.50],
        [0.0, 0.80, -0.32],
        [0.0, 0.85, -0.12]
    ];
    b.addTube(tailPts, [0.08, 0.075, 0.07, 0.065, 0.06, 0.055], 8, matChitin);

    // Telson (swollen venom bulb)
    b.addEllipsoid(0.0, 0.85, -0.02, 0.07, 0.07, 0.09, 10, 8, matChitin);

    // Venomous aculeus stinger (Fang_Bone) curving forward & down
    b.addTube([[0.0, 0.85, 0.04], [0.0, 0.82, 0.12], [0.0, 0.74, 0.16]], [0.024, 0.014, 0.004], 6, matFang);

    return b.toGlbBuffer();
}

// 5. Floating Eye (Levitating spherical eyeball at y=0.52, colored iris ring, pupil, 6 trailing eyestalks)
function generateFloatingEye() {
    const b = new MeshBuilder();
    const tSclera = b.addTexture(TEX_SCLERA_ALBEDO);
    const tIris = b.addTexture(TEX_IRIS_ALBEDO);

    const matSclera = b.addMaterial({
        name: 'Body_Sclera',
        baseColorFactor: [0.95, 0.94, 0.92, 1.0],
        roughnessFactor: 0.15,
        metallicFactor: 0.05,
        baseColorTextureIndex: tSclera
    });
    const matIris = b.addMaterial({
        name: 'Iris_Mat',
        baseColorFactor: [0.85, 0.35, 0.20, 1.0],
        roughnessFactor: 0.18,
        baseColorTextureIndex: tIris
    });
    const matPupil = b.addMaterial({
        name: 'Pupil_Dark',
        baseColorFactor: [0.02, 0.02, 0.02, 1.0],
        roughnessFactor: 0.05
    });
    const matEye = b.addMaterial({
        name: 'Eye_Dark',
        baseColorFactor: [0.25, 0.15, 0.22, 1.0],
        roughnessFactor: 0.25
    });

    const eyeCenter = [0.0, 0.52, 0.0];

    // Main spherical sclera orb
    b.addEllipsoid(eyeCenter[0], eyeCenter[1], eyeCenter[2], 0.28, 0.28, 0.28, 20, 16, matSclera);

    // Distinct colored Iris ring on front (+Z face)
    b.addDisk(eyeCenter[0], eyeCenter[1], eyeCenter[2] + 0.274, [0, 0, 1], 0.15, 16, matIris);

    // Deep black Pupil
    b.addDisk(eyeCenter[0], eyeCenter[1], eyeCenter[2] + 0.278, [0, 0, 1], 0.075, 16, matPupil);

    // 6 Trailing writhing optic nerve tendrils / eyestalks tipped with mini-eyes
    for (let i = 0; i < 6; i++) {
        const phi = (i / 6) * 2 * Math.PI;
        const cosP = Math.cos(phi);
        const sinP = Math.sin(phi);

        const root = [eyeCenter[0] + cosP * 0.22, eyeCenter[1] + sinP * 0.22, -0.15];
        const mid1 = [eyeCenter[0] + cosP * 0.35, eyeCenter[1] + sinP * 0.35, -0.32];
        const mid2 = [eyeCenter[0] + cosP * 0.42 + 0.05 * sinP, eyeCenter[1] + sinP * 0.42 - 0.05 * cosP, -0.50];
        const tip = [eyeCenter[0] + cosP * 0.48, eyeCenter[1] + sinP * 0.48, -0.65];

        b.addTube([root, mid1, mid2, tip], [0.028, 0.022, 0.016, 0.012], 6, matEye);

        // Eyestalk mini-eyeball
        b.addEllipsoid(tip[0], tip[1], tip[2], 0.04, 0.04, 0.04, 8, 6, matSclera);
        b.addDisk(tip[0], tip[1], tip[2] - 0.038, [0, 0, -1], 0.02, 8, matPupil);
    }

    return b.toGlbBuffer();
}

// 6. Worm Mass (Writhing tangle of 8 annelid worms, raised heads, circular lamprey toothed maws, slime base)
function generateWormMass() {
    const b = new MeshBuilder();
    const tFlesh = b.addTexture(TEX_FLESH_NORM);
    const matFlesh = b.addMaterial({
        name: 'Body_Flesh',
        baseColorFactor: [0.68, 0.38, 0.42, 1.0],
        roughnessFactor: 0.28,
        normalTextureIndex: tFlesh
    });
    const matMaw = b.addMaterial({
        name: 'Maw_Dark',
        baseColorFactor: [0.12, 0.03, 0.05, 1.0],
        roughnessFactor: 0.40
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.90, 0.88, 0.74, 1.0],
        roughnessFactor: 0.30
    });
    const matSlime = b.addMaterial({
        name: 'Body_Slime',
        baseColorFactor: [0.28, 0.40, 0.22, 0.80],
        alphaMode: 'BLEND',
        roughnessFactor: 0.12
    });

    // Floor slime puddle base
    b.addDisk(0.0, 0.015, 0.0, [0, 1, 0], 0.65, 16, matSlime);

    // 8 Intertwined segmented worms coiled across floor (y=0..0.38)
    const wormConfigs = [
        { head: [0.14, 0.36, 0.22], dir: [0, 0.7, 0.7], path: [[-0.35, 0.04, -0.2], [-0.1, 0.05, -0.05], [0.1, 0.18, 0.1], [0.14, 0.36, 0.22]] },
        { head: [-0.22, 0.34, 0.15], dir: [-0.6, 0.6, 0.5], path: [[0.3, 0.04, -0.25], [0.1, 0.06, 0.0], [-0.12, 0.16, 0.08], [-0.22, 0.34, 0.15]] },
        { head: [0.26, 0.32, -0.12], dir: [0.6, 0.6, -0.5], path: [[-0.2, 0.04, 0.3], [0.0, 0.05, 0.15], [0.18, 0.15, -0.02], [0.26, 0.32, -0.12]] },
        { head: [-0.16, 0.38, -0.20], dir: [-0.5, 0.7, -0.5], path: [[0.2, 0.04, 0.2], [-0.05, 0.06, 0.0], [-0.12, 0.20, -0.10], [-0.16, 0.38, -0.20]] },
        { head: [0.0, 0.37, 0.02], dir: [0, 1, 0], path: [[-0.4, 0.03, 0.1], [-0.2, 0.05, 0.05], [-0.05, 0.18, 0.02], [0.0, 0.37, 0.02]] },
        { head: [-0.32, 0.24, -0.05], dir: [-0.8, 0.5, 0], path: [[0.1, 0.03, -0.3], [-0.08, 0.05, -0.18], [-0.22, 0.12, -0.10], [-0.32, 0.24, -0.05]] },
        { head: [0.34, 0.26, 0.10], dir: [0.8, 0.5, 0.3], path: [[-0.1, 0.03, -0.35], [0.12, 0.05, -0.15], [0.24, 0.14, -0.02], [0.34, 0.26, 0.10]] },
        { head: [0.05, 0.28, -0.34], dir: [0.2, 0.6, -0.8], path: [[-0.25, 0.03, 0.0], [-0.1, 0.04, -0.12], [0.0, 0.14, -0.22], [0.05, 0.28, -0.34]] }
    ];

    for (const w of wormConfigs) {
        b.addTube(w.path, [0.035, 0.045, 0.052, 0.058], 8, matFlesh);

        // Circular lamprey-like mouth rim on head
        const normDir = vNorm(w.dir);
        b.addDisk(w.head[0], w.head[1], w.head[2], normDir, 0.055, 12, matMaw);

        // Concentric rings of triangular sharp teeth (Teeth_Bone)
        let up = [0, 1, 0];
        if (Math.abs(vDot(up, normDir)) > 0.9) up = [1, 0, 0];
        const right = vNorm(vCross(normDir, up));
        const binorm = vNorm(vCross(normDir, right));

        for (let t = 0; t < 8; t++) {
            const phi = (t / 8) * 2 * Math.PI;
            const cosP = Math.cos(phi);
            const sinP = Math.sin(phi);
            const toothBase = vAdd(w.head, vAdd(vScale(right, cosP * 0.042), vScale(binorm, sinP * 0.042)));
            const toothTip = vAdd(toothBase, vScale(normDir, 0.018));
            b.addSpike(toothBase, toothTip, 0.008, 4, matTeeth);
        }
    }

    return b.toGlbBuffer();
}

// 7. Jelly Ooze (Translucent undulating slime dome, 5 creeping pseudopods, suspended nucleus & engulfed skull)
function generateJellyOoze() {
    const b = new MeshBuilder();
    const tSlime = b.addTexture(TEX_SLIME_NORM);
    const matSlime = b.addMaterial({
        name: 'Body_Slime',
        baseColorFactor: [0.22, 0.82, 0.38, 0.84],
        alphaMode: 'BLEND',
        roughnessFactor: 0.12,
        metallicFactor: 0.05,
        normalTextureIndex: tSlime
    });
    const matCore = b.addMaterial({
        name: 'Core_Mat',
        baseColorFactor: [0.45, 1.0, 0.35, 1.0],
        emissiveFactor: [0.35, 0.95, 0.25],
        roughnessFactor: 0.20
    });
    const matBone = b.addMaterial({
        name: 'Bone_Mat',
        baseColorFactor: [0.86, 0.84, 0.74, 1.0],
        roughnessFactor: 0.45
    });

    // Main multi-lobed undulating viscous slime dome
    b.addEllipsoid(0.0, 0.24, 0.0, 0.52, 0.28, 0.48, 16, 12, matSlime);
    b.addEllipsoid(0.20, 0.18, 0.18, 0.26, 0.20, 0.26, 12, 8, matSlime);
    b.addEllipsoid(-0.18, 0.16, -0.15, 0.28, 0.19, 0.26, 12, 8, matSlime);
    b.addEllipsoid(0.08, 0.15, -0.22, 0.24, 0.17, 0.24, 12, 8, matSlime);

    // 5 Creeping pseudopods on the floor (y=0..0.06)
    const podTargets = [
        [0.65, 0.03, 0.18],
        [-0.58, 0.03, 0.32],
        [-0.48, 0.03, -0.42],
        [0.26, 0.03, -0.58],
        [0.10, 0.03, 0.62]
    ];
    for (const pt of podTargets) {
        const root = [pt[0] * 0.45, 0.10, pt[2] * 0.45];
        b.addTube([root, [pt[0] * 0.75, 0.06, pt[2] * 0.75], pt], [0.12, 0.08, 0.03], 8, matSlime);
    }

    // Suspended internal digestive nucleus (glowing Core_Mat)
    b.addEllipsoid(0.05, 0.26, -0.04, 0.12, 0.12, 0.12, 12, 8, matCore);

    // Engulfed human skull & bone fragments (Bone_Mat)
    const skullCenter = [-0.10, 0.22, 0.08];
    b.addEllipsoid(skullCenter[0], skullCenter[1], skullCenter[2], 0.075, 0.070, 0.080, 10, 8, matBone); // Cranium
    b.addBox(skullCenter[0], skullCenter[1] - 0.04, skullCenter[2] + 0.05, 0.06, 0.035, 0.05, matBone); // Maxilla
    // Engulfed femur bone
    b.addTube([[0.10, 0.16, 0.15], [-0.02, 0.28, 0.20]], [0.025, 0.025], 6, matBone);

    return b.toGlbBuffer();
}

// 8. Mushroom Cluster (Colony of 5 toadstools y=0..0.62, spotted caps, pale gills, stalks, glowing spores)
function generateMushroomCluster() {
    const b = new MeshBuilder();
    const tCap = b.addTexture(TEX_SPOTTED_CAP);
    const matCap = b.addMaterial({
        name: 'Body_Cap',
        baseColorFactor: [0.85, 0.16, 0.14, 1.0],
        roughnessFactor: 0.32,
        baseColorTextureIndex: tCap
    });
    const matGill = b.addMaterial({
        name: 'Gill_Mat',
        baseColorFactor: [0.92, 0.90, 0.82, 1.0],
        roughnessFactor: 0.50
    });
    const matStalk = b.addMaterial({
        name: 'Stalk_Mat',
        baseColorFactor: [0.88, 0.86, 0.78, 1.0],
        roughnessFactor: 0.42
    });
    const matSpore = b.addMaterial({
        name: 'Spore_Glow',
        baseColorFactor: [0.40, 0.95, 0.80, 1.0],
        emissiveFactor: [0.30, 0.90, 0.75],
        roughnessFactor: 0.20
    });

    const shrooms = [
        { cx: 0.0, cz: 0.0, h: 0.60, capR: 0.28, stalkR: 0.065, curveX: 0.02, curveZ: 0.0 },
        { cx: 0.26, cz: 0.20, h: 0.44, capR: 0.20, stalkR: 0.050, curveX: 0.06, curveZ: 0.04 },
        { cx: -0.24, cz: -0.18, h: 0.38, capR: 0.17, stalkR: 0.042, curveX: -0.05, curveZ: 0.02 },
        { cx: -0.22, cz: 0.22, h: 0.26, capR: 0.13, stalkR: 0.035, curveX: 0.01, curveZ: 0.03 },
        { cx: 0.20, cz: -0.20, h: 0.16, capR: 0.09, stalkR: 0.028, curveX: 0.02, curveZ: -0.02 }
    ];

    for (const s of shrooms) {
        // Curved stalk rooted at y=0
        const p0 = [s.cx, 0.0, s.cz];
        const p1 = [s.cx + s.curveX * 0.5, s.h * 0.5, s.cz + s.curveZ * 0.5];
        const p2 = [s.cx + s.curveX, s.h * 0.88, s.cz + s.curveZ];
        b.addTube([p0, p1, p2], [s.stalkR * 1.25, s.stalkR, s.stalkR * 0.9], 8, matStalk);

        // Underside gills
        b.addDisk(p2[0], p2[1], p2[2], [0, -1, 0], s.capR * 0.95, 14, matGill);

        // Domed spotted cap
        b.addEllipsoid(p2[0], p2[1] + s.capR * 0.35, p2[2], s.capR, s.capR * 0.55, s.capR, 16, 10, matCap);

        // Glowing spore nodules (Spore_Glow)
        for (let i = 0; i < 4; i++) {
            const phi = (i / 4) * 2 * Math.PI + (s.h * 10);
            const r = s.capR * 0.65;
            const sx = p2[0] + Math.cos(phi) * r;
            const sz = p2[2] + Math.sin(phi) * r;
            b.addEllipsoid(sx, p2[1] - 0.02, sz, 0.025, 0.025, 0.025, 6, 6, matSpore);
        }
    }

    return b.toGlbBuffer();
}

// 9. Vortex Elemental (Swirling biconical cyclone y=0.05..1.15, 3 helical energy ribbons, 8 shards, inner core)
function generateVortexElemental() {
    const b = new MeshBuilder();
    const matVortex = b.addMaterial({
        name: 'Body_Vortex',
        baseColorFactor: [0.35, 0.68, 0.95, 0.72],
        emissiveFactor: [0.25, 0.45, 0.75],
        alphaMode: 'BLEND',
        doubleSided: true,
        roughnessFactor: 0.18
    });
    const matCore = b.addMaterial({
        name: 'Core_Glow',
        baseColorFactor: [0.90, 0.96, 1.0, 1.0],
        emissiveFactor: [0.85, 0.95, 1.0],
        roughnessFactor: 0.10
    });
    const matShard = b.addMaterial({
        name: 'Shard_Mat',
        baseColorFactor: [0.26, 0.28, 0.36, 1.0],
        roughnessFactor: 0.35,
        metallicFactor: 0.50
    });

    // 3 Twisted helical energy ribbons climbing the cyclone
    for (let r = 0; r < 3; r++) {
        const phaseOffset = (r / 3) * 2 * Math.PI;
        const steps = 32;
        const ribPts = [];
        const ribWidths = [];

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const y = 0.05 + t * 1.10;
            const radius = 0.08 + Math.pow(t, 0.8) * 0.42;
            const angle = phaseOffset + t * 4.5 * Math.PI;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            ribPts.push([x, y, z]);
            ribWidths.push(0.06 + t * 0.08);
        }
        b.addRibbon(ribPts, ribWidths, [0, 1, 0], matVortex);
    }

    // Radiant inner core (Core_Glow)
    b.addTube([[0, 0.15, 0], [0, 0.55, 0], [0, 0.95, 0]], [0.03, 0.07, 0.025], 8, matCore);
    b.addEllipsoid(0, 0.55, 0, 0.11, 0.18, 0.11, 10, 8, matCore);

    // 8 Orbiting jagged elemental crystal shards (Shard_Mat)
    for (let i = 0; i < 8; i++) {
        const t = (i + 0.5) / 8;
        const y = 0.15 + t * 0.85;
        const radius = 0.12 + Math.pow(t, 0.8) * 0.40 + 0.08;
        const angle = i * (2 * Math.PI / 8) + 0.4;
        const sx = Math.cos(angle) * radius;
        const sz = Math.sin(angle) * radius;

        b.addBox(sx, y, sz, 0.07, 0.12, 0.07, matShard);
    }

    return b.toGlbBuffer();
}

// 10. Quylthulg (Pulsating fleshy horror mound y=0..0.65, asymmetrical lobes, 8 pustules, 6 bone spines, tendrils)
function generateQuylthulg() {
    const b = new MeshBuilder();
    const tFlesh = b.addTexture(TEX_FLESH_NORM);
    const matFlesh = b.addMaterial({
        name: 'Body_Flesh',
        baseColorFactor: [0.56, 0.42, 0.50, 1.0],
        roughnessFactor: 0.38,
        normalTextureIndex: tFlesh
    });
    const matPustule = b.addMaterial({
        name: 'Pustule_Glow',
        baseColorFactor: [0.85, 0.30, 0.85, 0.92],
        emissiveFactor: [0.75, 0.20, 0.85],
        roughnessFactor: 0.20
    });
    const matBone = b.addMaterial({
        name: 'Bone_Mat',
        baseColorFactor: [0.88, 0.85, 0.74, 1.0],
        roughnessFactor: 0.40
    });

    // Central horror mound + 4 asymmetrical organic lobes
    b.addEllipsoid(0.0, 0.30, 0.0, 0.44, 0.30, 0.42, 14, 10, matFlesh);
    b.addEllipsoid(-0.22, 0.20, 0.18, 0.25, 0.18, 0.24, 10, 8, matFlesh);
    b.addEllipsoid(0.24, 0.22, -0.16, 0.26, 0.19, 0.24, 10, 8, matFlesh);
    b.addEllipsoid(0.16, 0.18, 0.22, 0.22, 0.16, 0.20, 10, 8, matFlesh);
    b.addEllipsoid(-0.18, 0.16, -0.22, 0.20, 0.15, 0.22, 10, 8, matFlesh);

    // Basal feeder cilia / tendrils on floor
    for (let i = 0; i < 8; i++) {
        const phi = (i / 8) * 2 * Math.PI;
        const root = [Math.cos(phi) * 0.38, 0.05, Math.sin(phi) * 0.38];
        const tip = [Math.cos(phi) * 0.58, 0.02, Math.sin(phi) * 0.58];
        b.addTube([root, [(root[0] + tip[0]) * 0.5, 0.04, (root[1] + tip[1]) * 0.5], tip], [0.035, 0.024, 0.01], 6, matFlesh);
    }

    // 8 Glowing translucent pustules (Pustule_Glow)
    const pustuleLocs = [
        [0.18, 0.44, 0.16, 0.07], [-0.16, 0.42, 0.18, 0.08], [0.22, 0.36, -0.20, 0.065], [-0.24, 0.32, -0.16, 0.075],
        [0.0, 0.54, -0.05, 0.085], [-0.12, 0.26, 0.32, 0.06], [0.32, 0.24, 0.05, 0.065], [-0.05, 0.38, -0.32, 0.07]
    ];
    for (const [px, py, pz, pr] of pustuleLocs) {
        b.addEllipsoid(px, py, pz, pr, pr, pr, 8, 6, matPustule);
    }

    // 6 Curved dorsal bone spines (Bone_Mat)
    const spineBases = [
        [-0.10, 0.52, 0.10], [0.10, 0.52, 0.10],
        [-0.12, 0.50, -0.08], [0.12, 0.50, -0.08],
        [-0.08, 0.46, -0.22], [0.08, 0.46, -0.22]
    ];
    for (let sIdx = 0; sIdx < spineBases.length; sIdx++) {
        const sb = spineBases[sIdx];
        const sign = sb[0] < 0 ? -1 : 1;
        const tip = [sb[0] + sign * 0.14, sb[1] + 0.24, sb[2] - 0.08];
        b.addTube([sb, [(sb[0] + tip[0]) * 0.5, sb[1] + 0.15, (sb[2] + tip[2]) * 0.5], tip], [0.03, 0.02, 0.005], 6, matBone);
    }

    return b.toGlbBuffer();
}

// 11. Hydra (Heavy quadruped reptile body, 4 legs, lashed tail, 5 sinuous serpentine necks & fanged draconic heads)
function generateHydra() {
    const b = new MeshBuilder();
    const tScale = b.addTexture(TEX_SCALES_NORM);
    const matScale = b.addMaterial({
        name: 'Body_Scale',
        baseColorFactor: [0.18, 0.42, 0.22, 1.0],
        roughnessFactor: 0.28,
        normalTextureIndex: tScale
    });
    const matMaw = b.addMaterial({
        name: 'Maw_Dark',
        baseColorFactor: [0.16, 0.03, 0.04, 1.0],
        roughnessFactor: 0.40
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.90, 0.88, 0.76, 1.0],
        roughnessFactor: 0.30
    });
    const matEye = b.addMaterial({
        name: 'Eye_Glow',
        baseColorFactor: [1.0, 0.85, 0.10, 1.0],
        emissiveFactor: [1.0, 0.85, 0.10],
        roughnessFactor: 0.20
    });
    const matBone = b.addMaterial({
        name: 'Bone_Mat',
        baseColorFactor: [0.85, 0.82, 0.70, 1.0],
        roughnessFactor: 0.35
    });

    // Reptilian quadruped body
    b.addEllipsoid(0.0, 0.38, 0.0, 0.32, 0.24, 0.48, 14, 10, matScale);

    // 4 Muscular clawed legs on y=0
    const legAnchors = [
        { hip: [-0.28, 0.32, 0.26], foot: [-0.36, 0.0, 0.34] },
        { hip: [0.28, 0.32, 0.26], foot: [0.36, 0.0, 0.34] },
        { hip: [-0.28, 0.32, -0.26], foot: [-0.36, 0.0, -0.34] },
        { hip: [0.28, 0.32, -0.26], foot: [0.36, 0.0, -0.34] }
    ];
    for (const l of legAnchors) {
        const knee = [(l.hip[0] + l.foot[0]) * 0.5 + (l.hip[0] < 0 ? -0.10 : 0.10), 0.20, (l.hip[2] + l.foot[2]) * 0.5];
        b.addTube([l.hip, knee, l.foot], [0.08, 0.06, 0.04], 6, matScale);
        // 3 Claws on foot
        for (let c = -1; c <= 1; c++) {
            const side = l.hip[0] < 0 ? -1 : 1;
            b.addSpike(l.foot, [l.foot[0] + c * 0.03, 0.0, l.foot[2] + 0.07], 0.012, 4, matBone);
        }
    }

    // Long lashed tail
    b.addTube([[0, 0.34, -0.42], [0.12, 0.24, -0.75], [0.28, 0.16, -1.10]], [0.12, 0.07, 0.02], 8, matScale);

    // 5 Sinuous serpentine necks fanning out into 5 fanged draconic heads
    const neckConfigs = [
        { path: [[0, 0.44, 0.34], [-0.22, 0.62, 0.42], [-0.38, 0.82, 0.48]], headDir: [-0.6, 0.2, 0.7] },
        { path: [[0, 0.45, 0.35], [-0.12, 0.72, 0.48], [-0.20, 0.98, 0.60]], headDir: [-0.3, 0.3, 0.9] },
        { path: [[0, 0.46, 0.36], [0.00, 0.80, 0.52], [0.00, 1.08, 0.68]], headDir: [0.0, 0.3, 0.9] },
        { path: [[0, 0.45, 0.35], [0.12, 0.72, 0.48], [0.20, 0.98, 0.60]], headDir: [0.3, 0.3, 0.9] },
        { path: [[0, 0.44, 0.34], [0.22, 0.62, 0.42], [0.38, 0.82, 0.48]], headDir: [0.6, 0.2, 0.7] }
    ];

    for (const nc of neckConfigs) {
        b.addTube(nc.path, [0.065, 0.050, 0.040], 8, matScale);
        const tip = nc.path[nc.path.length - 1];

        // Head skull
        b.addEllipsoid(tip[0], tip[1] + 0.02, tip[2] + 0.06, 0.055, 0.045, 0.08, 10, 8, matScale);
        // Open jaws: upper & lower
        b.addBox(tip[0], tip[1] + 0.035, tip[2] + 0.12, 0.065, 0.025, 0.07, matScale);
        b.addBox(tip[0], tip[1] - 0.015, tip[2] + 0.11, 0.055, 0.020, 0.06, matScale);
        // Dark throat cavity
        b.addBox(tip[0], tip[1] + 0.01, tip[2] + 0.09, 0.05, 0.02, 0.04, matMaw);

        // Fangs (Teeth_Bone)
        b.addSpike([tip[0] - 0.022, tip[1] + 0.02, tip[2] + 0.14], [tip[0] - 0.022, tip[1] - 0.005, tip[2] + 0.14], 0.008, 4, matTeeth);
        b.addSpike([tip[0] + 0.022, tip[1] + 0.02, tip[2] + 0.14], [tip[0] + 0.022, tip[1] - 0.005, tip[2] + 0.14], 0.008, 4, matTeeth);

        // Glaring eyes (Eye_Glow)
        b.addEllipsoid(tip[0] - 0.048, tip[1] + 0.045, tip[2] + 0.06, 0.015, 0.015, 0.015, 6, 6, matEye);
        b.addEllipsoid(tip[0] + 0.048, tip[1] + 0.045, tip[2] + 0.06, 0.015, 0.015, 0.015, 6, 6, matEye);
    }

    return b.toGlbBuffer();
}

// 12. Naga (Coiled serpent tail on y=0, upright S-torso, flared cobra hood, humanoid arms with claws, fanged head)
function generateNaga() {
    const b = new MeshBuilder();
    const tScale = b.addTexture(TEX_SCALES_NORM);
    const matScale = b.addMaterial({
        name: 'Body_Scale',
        baseColorFactor: [0.22, 0.36, 0.28, 1.0],
        roughnessFactor: 0.28,
        normalTextureIndex: tScale
    });
    const matHood = b.addMaterial({
        name: 'Hood_Mat',
        baseColorFactor: [0.44, 0.40, 0.26, 1.0],
        roughnessFactor: 0.36
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.90, 0.88, 0.74, 1.0],
        roughnessFactor: 0.30
    });
    const matEye = b.addMaterial({
        name: 'Eye_Glow',
        baseColorFactor: [1.0, 0.85, 0.10, 1.0],
        emissiveFactor: [1.0, 0.85, 0.10],
        roughnessFactor: 0.20
    });

    // 1.5 Loops of coiled lower serpent tail base on y=0
    const coilPts = [];
    const coilRadii = [];
    const numCoilSteps = 28;
    for (let i = 0; i <= numCoilSteps; i++) {
        const t = i / numCoilSteps;
        const angle = t * 3.0 * Math.PI;
        const r = 0.38 * (1.0 - t * 0.45);
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const y = 0.05 + t * 0.08;
        coilPts.push([x, y, z]);
        coilRadii.push(0.075 - t * 0.035);
    }
    b.addTube(coilPts, coilRadii, 8, matScale);

    // Upright S-curved serpentine torso
    const torsoPts = [
        [0.0, 0.12, 0.0],
        [0.0, 0.28, 0.04],
        [0.0, 0.46, -0.02],
        [0.0, 0.65, 0.06],
        [0.0, 0.78, 0.10]
    ];
    b.addTube(torsoPts, [0.08, 0.085, 0.09, 0.08, 0.065], 8, matScale);

    // Flared Cobra Hood behind neck (Hood_Mat)
    const hoodPts = [
        [0, 0.58, 0.02],
        [0, 0.68, 0.05],
        [0, 0.78, 0.08],
        [0, 0.85, 0.10]
    ];
    b.addRibbon(hoodPts, [0.12, 0.34, 0.30, 0.14], [0, 0, -1], matHood);

    // Muscular humanoid / serpent arms with claws
    for (const side of [-1, 1]) {
        const shoulder = [side * 0.12, 0.68, 0.06];
        const elbow = [side * 0.24, 0.52, 0.12];
        const hand = [side * 0.18, 0.48, 0.26];
        b.addTube([shoulder, elbow, hand], [0.035, 0.028, 0.020], 6, matScale);
        // Claws
        b.addSpike(hand, [hand[0], hand[1] - 0.04, hand[2] + 0.04], 0.012, 4, matTeeth);
    }

    // Serpentine head & fangs
    b.addEllipsoid(0.0, 0.84, 0.14, 0.08, 0.065, 0.11, 10, 8, matScale);
    // Venom fangs (Teeth_Bone)
    b.addSpike([-0.03, 0.80, 0.21], [-0.03, 0.74, 0.21], 0.010, 4, matTeeth);
    b.addSpike([0.03, 0.80, 0.21], [0.03, 0.74, 0.21], 0.010, 4, matTeeth);

    // Glaring golden slitted eyes (Eye_Glow)
    b.addEllipsoid(-0.06, 0.86, 0.16, 0.016, 0.016, 0.016, 6, 6, matEye);
    b.addEllipsoid(0.06, 0.86, 0.16, 0.016, 0.016, 0.016, 6, 6, matEye);

    return b.toGlbBuffer();
}

// 13. Bat (Furry chiropteran torso, pointed ears, fanged snout, hooked feet, wide scalloped wings spanning X)
function generateBat() {
    const b = new MeshBuilder();
    const tFur = b.addTexture(TEX_FUR_NORM);
    const matFur = b.addMaterial({
        name: 'Body_Fur',
        baseColorFactor: [0.18, 0.16, 0.15, 1.0],
        roughnessFactor: 0.58,
        normalTextureIndex: tFur
    });
    const matWing = b.addMaterial({
        name: 'Wing_Membrane',
        baseColorFactor: [0.24, 0.20, 0.18, 0.92],
        doubleSided: true,
        roughnessFactor: 0.40
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.90, 0.88, 0.75, 1.0],
        roughnessFactor: 0.30
    });
    const matEye = b.addMaterial({
        name: 'Eye_Glow',
        baseColorFactor: [1.0, 0.20, 0.10, 1.0],
        emissiveFactor: [1.0, 0.20, 0.10],
        roughnessFactor: 0.20
    });

    // Furry chiropteran torso
    b.addEllipsoid(0.0, 0.50, 0.0, 0.12, 0.18, 0.12, 12, 8, matFur);

    // Head
    b.addEllipsoid(0.0, 0.64, 0.05, 0.10, 0.10, 0.10, 10, 8, matFur);
    // Large pointed ears
    b.addCone([-0.06, 0.71, 0.04], [-0.10, 0.84, 0.06], 0.035, 0.005, 6, matFur);
    b.addCone([0.06, 0.71, 0.04], [0.10, 0.84, 0.06], 0.035, 0.005, 6, matFur);

    // Snout with sharp fangs
    b.addEllipsoid(0.0, 0.61, 0.13, 0.045, 0.035, 0.045, 8, 6, matFur);
    b.addSpike([-0.02, 0.60, 0.16], [-0.02, 0.56, 0.16], 0.007, 4, matTeeth);
    b.addSpike([0.02, 0.60, 0.16], [0.02, 0.56, 0.16], 0.007, 4, matTeeth);

    // Glowing red eyes
    b.addEllipsoid(-0.045, 0.65, 0.12, 0.015, 0.015, 0.015, 6, 6, matEye);
    b.addEllipsoid(0.045, 0.65, 0.12, 0.015, 0.015, 0.015, 6, 6, matEye);

    // Hooked feet underneath
    b.addSpike([-0.05, 0.34, 0.0], [-0.05, 0.26, 0.03], 0.014, 4, matTeeth);
    b.addSpike([0.05, 0.34, 0.0], [0.05, 0.26, 0.03], 0.014, 4, matTeeth);

    // Outstretched scalloped wings spanning X (-1.15 to +1.15)
    for (const side of [-1, 1]) {
        const shoulder = [side * 0.08, 0.58, 0.0];
        const elbow = [side * 0.38, 0.68, 0.05];
        const wrist = [side * 0.65, 0.72, 0.10];
        b.addTube([shoulder, elbow, wrist], [0.03, 0.022, 0.015], 6, matFur);

        // Digits
        const tip1 = [side * 1.15, 0.60, 0.0];
        const tip2 = [side * 0.92, 0.36, -0.06];
        const tip3 = [side * 0.65, 0.28, -0.10];
        const tip4 = [side * 0.35, 0.32, -0.12];

        b.addTube([wrist, tip1], [0.015, 0.006], 4, matFur);
        b.addTube([wrist, tip2], [0.014, 0.005], 4, matFur);
        b.addTube([wrist, tip3], [0.013, 0.005], 4, matFur);
        b.addTube([wrist, tip4], [0.012, 0.005], 4, matFur);

        // Wing membrane polygons
        b.addTriangle(matWing, shoulder, elbow, wrist, [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0], [0.5, 0], [1, 0]);
        b.addTriangle(matWing, wrist, tip2, tip1, [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0], [0.5, 1], [1, 1]);
        b.addTriangle(matWing, wrist, tip3, tip2, [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0], [0.5, 1], [1, 1]);
        b.addTriangle(matWing, wrist, tip4, tip3, [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0], [0.5, 1], [1, 1]);
        b.addTriangle(matWing, shoulder, [side * 0.10, 0.38, 0.0], tip4, [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0], [0.5, 1], [1, 1]);
    }

    return b.toGlbBuffer();
}

// 14. Bear (Heavy hump-shouldered quadruped, barrel chest, 4 plantigrade legs with claws on y=0, dark snout, fanged jaw)
function generateBear() {
    const b = new MeshBuilder();
    const tFur = b.addTexture(TEX_FUR_NORM);
    const matFur = b.addMaterial({
        name: 'Body_Fur',
        baseColorFactor: [0.22, 0.16, 0.12, 1.0],
        roughnessFactor: 0.62,
        normalTextureIndex: tFur
    });
    const matSnout = b.addMaterial({
        name: 'Snout_Dark',
        baseColorFactor: [0.10, 0.08, 0.07, 1.0],
        roughnessFactor: 0.32
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.88, 0.85, 0.72, 1.0],
        roughnessFactor: 0.32
    });
    const matEye = b.addMaterial({
        name: 'Eye_Dark',
        baseColorFactor: [0.05, 0.05, 0.05, 1.0],
        roughnessFactor: 0.1
    });

    // Barrel chest & torso
    b.addEllipsoid(0.0, 0.54, 0.12, 0.36, 0.32, 0.38, 14, 10, matFur);
    // Muscular shoulder hump
    b.addEllipsoid(0.0, 0.74, 0.16, 0.28, 0.16, 0.24, 12, 8, matFur);
    // Hindquarters
    b.addEllipsoid(0.0, 0.50, -0.32, 0.32, 0.28, 0.30, 12, 8, matFur);
    // Stubby tail
    b.addEllipsoid(0.0, 0.48, -0.58, 0.08, 0.07, 0.08, 8, 6, matFur);

    // 4 Columnar legs with claws on y=0
    const legPositions = [
        { hip: [-0.28, 0.44, 0.24], foot: [-0.28, 0.0, 0.26] },
        { hip: [0.28, 0.44, 0.24], foot: [0.28, 0.0, 0.26] },
        { hip: [-0.26, 0.40, -0.28], foot: [-0.26, 0.0, -0.28] },
        { hip: [0.26, 0.40, -0.28], foot: [0.26, 0.0, -0.28] }
    ];
    for (const l of legPositions) {
        b.addTube([l.hip, [l.foot[0], 0.22, l.foot[2]], l.foot], [0.11, 0.09, 0.085], 8, matFur);
        // Claws on paw
        for (let c = -2; c <= 2; c++) {
            b.addSpike([l.foot[0] + c * 0.025, 0.02, l.foot[2] + 0.08], [l.foot[0] + c * 0.025, 0.0, l.foot[2] + 0.14], 0.012, 4, matTeeth);
        }
    }

    // Muscular neck & broad skull
    b.addTube([[0, 0.62, 0.34], [0, 0.66, 0.50]], [0.24, 0.20], 8, matFur);
    b.addEllipsoid(0.0, 0.68, 0.58, 0.20, 0.18, 0.18, 12, 8, matFur);

    // Rounded ears
    b.addEllipsoid(-0.16, 0.82, 0.56, 0.06, 0.06, 0.04, 8, 6, matFur);
    b.addEllipsoid(0.16, 0.82, 0.56, 0.06, 0.06, 0.04, 8, 6, matFur);

    // Dark muzzle (Snout_Dark)
    b.addEllipsoid(0.0, 0.62, 0.74, 0.11, 0.09, 0.14, 10, 8, matSnout);

    // Sharp canines (Teeth_Bone)
    b.addSpike([-0.05, 0.60, 0.78], [-0.05, 0.53, 0.78], 0.015, 4, matTeeth);
    b.addSpike([0.05, 0.60, 0.78], [0.05, 0.53, 0.78], 0.015, 4, matTeeth);

    // Dark eyes
    b.addEllipsoid(-0.10, 0.70, 0.68, 0.025, 0.025, 0.025, 6, 6, matEye);
    b.addEllipsoid(0.10, 0.70, 0.68, 0.025, 0.025, 0.025, 6, 6, matEye);

    return b.toGlbBuffer();
}

// 15. Lizard (Low sprawling 4-legged reptile, elongated body along Z, splayed clawed legs on y=0, dorsal crest, fangs)
function generateLizard() {
    const b = new MeshBuilder();
    const tScale = b.addTexture(TEX_SCALES_NORM);
    const matScale = b.addMaterial({
        name: 'Body_Scale',
        baseColorFactor: [0.28, 0.42, 0.18, 1.0],
        roughnessFactor: 0.30,
        normalTextureIndex: tScale
    });
    const matCrest = b.addMaterial({
        name: 'Crest_Mat',
        baseColorFactor: [0.65, 0.35, 0.15, 1.0],
        roughnessFactor: 0.40
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.88, 0.85, 0.72, 1.0],
        roughnessFactor: 0.30
    });
    const matEye = b.addMaterial({
        name: 'Eye_Glow',
        baseColorFactor: [0.95, 0.85, 0.10, 1.0],
        emissiveFactor: [0.90, 0.80, 0.10],
        roughnessFactor: 0.20
    });

    // Low-slung elongated reptilian body along Z
    b.addEllipsoid(0.0, 0.16, 0.0, 0.22, 0.10, 0.42, 14, 8, matScale);

    // 4 Splayed clawed legs touching y=0
    for (const side of [-1, 1]) {
        // Front leg
        const fHip = [side * 0.18, 0.16, 0.22];
        const fKnee = [side * 0.38, 0.18, 0.22];
        const fFoot = [side * 0.42, 0.0, 0.30];
        b.addTube([fHip, fKnee, fFoot], [0.05, 0.04, 0.025], 6, matScale);
        b.addSpike(fFoot, [fFoot[0], 0.0, fFoot[2] + 0.06], 0.012, 4, matTeeth);

        // Rear leg
        const rHip = [side * 0.18, 0.16, -0.22];
        const rKnee = [side * 0.38, 0.18, -0.22];
        const rFoot = [side * 0.42, 0.0, -0.30];
        b.addTube([rHip, rKnee, rFoot], [0.05, 0.04, 0.025], 6, matScale);
        b.addSpike(rFoot, [rFoot[0], 0.0, rFoot[2] - 0.06], 0.012, 4, matTeeth);
    }

    // Sinuous tail
    b.addTube([[0, 0.15, -0.40], [-0.14, 0.11, -0.78], [-0.28, 0.07, -1.15]], [0.09, 0.055, 0.015], 8, matScale);

    // Serrated dorsal crest (Crest_Mat)
    for (let i = -4; i <= 4; i++) {
        const cz = i * 0.08;
        b.addSpike([0.0, 0.24, cz], [0.0, 0.34, cz], 0.02, 4, matCrest);
    }

    // Flattened reptilian head & jaws
    b.addEllipsoid(0.0, 0.18, 0.46, 0.15, 0.09, 0.18, 10, 8, matScale);
    // Jaws
    b.addBox(0.0, 0.19, 0.58, 0.11, 0.025, 0.12, matScale);
    b.addBox(0.0, 0.14, 0.56, 0.09, 0.020, 0.10, matScale);

    // Teeth
    b.addSpike([-0.04, 0.18, 0.60], [-0.04, 0.15, 0.60], 0.008, 4, matTeeth);
    b.addSpike([0.04, 0.18, 0.60], [0.04, 0.15, 0.60], 0.008, 4, matTeeth);

    // Glowing eyes
    b.addEllipsoid(-0.11, 0.22, 0.46, 0.025, 0.025, 0.025, 6, 6, matEye);
    b.addEllipsoid(0.11, 0.22, 0.46, 0.025, 0.025, 0.025, 6, 6, matEye);

    return b.toGlbBuffer();
}

// 16. Aquatic (Streamlined predatory piranha/shark, dorsal fin, pectoral fins, forked caudal tail, razor teeth)
function generateAquatic() {
    const b = new MeshBuilder();
    const tScale = b.addTexture(TEX_SCALES_NORM);
    const matScale = b.addMaterial({
        name: 'Body_Scale',
        baseColorFactor: [0.20, 0.32, 0.46, 1.0],
        roughnessFactor: 0.22,
        metallicFactor: 0.15,
        normalTextureIndex: tScale
    });
    const matCrest = b.addMaterial({
        name: 'Crest_Mat',
        baseColorFactor: [0.15, 0.24, 0.36, 1.0],
        roughnessFactor: 0.30
    });
    const matMaw = b.addMaterial({
        name: 'Maw_Dark',
        baseColorFactor: [0.14, 0.03, 0.04, 1.0],
        roughnessFactor: 0.40
    });
    const matTeeth = b.addMaterial({
        name: 'Teeth_Bone',
        baseColorFactor: [0.92, 0.90, 0.82, 1.0],
        roughnessFactor: 0.25
    });
    const matEye = b.addMaterial({
        name: 'Eye_Glow',
        baseColorFactor: [0.70, 0.90, 1.0, 1.0],
        emissiveFactor: [0.70, 0.90, 1.0],
        roughnessFactor: 0.20
    });

    const bodyCenter = [0.0, 0.45, 0.0];

    // Fusiform hydrodynamic torpedo body
    b.addEllipsoid(bodyCenter[0], bodyCenter[1], bodyCenter[2], 0.18, 0.24, 0.58, 16, 12, matScale);

    // Tall swept dorsal fin (Crest_Mat)
    const dFinBase = [bodyCenter[0], bodyCenter[1] + 0.22, bodyCenter[2] + 0.05];
    const dFinTip = [bodyCenter[0], bodyCenter[1] + 0.48, bodyCenter[2] - 0.12];
    b.addCone(dFinBase, dFinTip, 0.04, 0.005, 6, matCrest);

    // Swept pectoral side fins
    for (const side of [-1, 1]) {
        const pFinBase = [bodyCenter[0] + side * 0.16, bodyCenter[1] - 0.06, bodyCenter[2] + 0.18];
        const pFinTip = [bodyCenter[0] + side * 0.42, bodyCenter[1] - 0.18, bodyCenter[2] - 0.05];
        b.addCone(pFinBase, pFinTip, 0.035, 0.005, 6, matCrest);
    }

    // Forked heterocercal caudal tail fin
    const tailBase = [bodyCenter[0], bodyCenter[1], bodyCenter[2] - 0.54];
    const upperLobe = [bodyCenter[0], bodyCenter[1] + 0.32, bodyCenter[2] - 0.82];
    const lowerLobe = [bodyCenter[0], bodyCenter[1] - 0.22, bodyCenter[2] - 0.74];
    b.addCone(tailBase, upperLobe, 0.04, 0.006, 6, matCrest);
    b.addCone(tailBase, lowerLobe, 0.035, 0.005, 6, matCrest);

    // Head, ferocious open underbite jaw and razor teeth
    b.addEllipsoid(bodyCenter[0], bodyCenter[1] + 0.02, bodyCenter[2] + 0.52, 0.14, 0.16, 0.16, 12, 8, matScale);
    // Dark throat interior
    b.addBox(bodyCenter[0], bodyCenter[1] - 0.02, bodyCenter[2] + 0.58, 0.11, 0.08, 0.08, matMaw);

    // Underbite lower jaw
    b.addBox(bodyCenter[0], bodyCenter[1] - 0.08, bodyCenter[2] + 0.62, 0.12, 0.04, 0.14, matScale);

    // Double rows of razor triangular teeth (Teeth_Bone)
    for (let i = -3; i <= 3; i++) {
        const tx = i * 0.016;
        b.addSpike([tx, bodyCenter[1] + 0.02, bodyCenter[2] + 0.62], [tx, bodyCenter[1] - 0.02, bodyCenter[2] + 0.62], 0.007, 4, matTeeth);
        b.addSpike([tx, bodyCenter[1] - 0.06, bodyCenter[2] + 0.64], [tx, bodyCenter[1] - 0.02, bodyCenter[2] + 0.64], 0.007, 4, matTeeth);
    }

    // Glaring pale cold shark eyes (Eye_Glow)
    b.addEllipsoid(-0.13, bodyCenter[1] + 0.08, bodyCenter[2] + 0.52, 0.022, 0.022, 0.022, 6, 6, matEye);
    b.addEllipsoid(0.13, bodyCenter[1] + 0.08, bodyCenter[2] + 0.52, 0.022, 0.022, 0.022, 6, 6, matEye);

    return b.toGlbBuffer();
}

// ==============================================================================
// 6. Upgrader Function for Existing 4 Models Lacking TEXCOORD_0
// ==============================================================================
function upgradeGlb(filePath) {
    const buf = fs.readFileSync(filePath);
    if (buf.readUInt32LE(0) !== 0x46546C67) {
        throw new Error(`${filePath} is not a valid GLB binary`);
    }

    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
    const binHeader = 20 + jsonLen;
    const binLen = buf.readUInt32LE(binHeader);
    const binData = Buffer.from(buf.slice(binHeader + 8, binHeader + 8 + binLen));

    let needsUpgrade = false;
    for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
            if (prim.attributes.TEXCOORD_0 === undefined) {
                needsUpgrade = true;
                break;
            }
        }
        if (needsUpgrade) break;
    }

    if (!needsUpgrade) {
        return { upgraded: false, buffer: buf };
    }

    const appendedBuffers = [];
    let currentBinLen = binData.length;

    for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
            if (prim.attributes.TEXCOORD_0 !== undefined) continue;

            const posAcc = gltf.accessors[prim.attributes.POSITION];
            const posBv = gltf.bufferViews[posAcc.bufferView];
            const posOffset = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
            const count = posAcc.count;

            const positions = new Float32Array(binData.buffer, binData.byteOffset + posOffset, count * 3);

            // Read indices if available
            let indices = null;
            if (prim.indices !== undefined) {
                const indAcc = gltf.accessors[prim.indices];
                const indBv = gltf.bufferViews[indAcc.bufferView];
                const indOffset = (indBv.byteOffset || 0) + (indAcc.byteOffset || 0);
                if (indAcc.componentType === 5123) {
                    indices = new Uint16Array(binData.buffer, binData.byteOffset + indOffset, indAcc.count);
                } else if (indAcc.componentType === 5125) {
                    indices = new Uint32Array(binData.buffer, binData.byteOffset + indOffset, indAcc.count);
                }
            }

            // Compute welded smooth vertex normals
            const normalAcc = prim.attributes.NORMAL !== undefined ? gltf.accessors[prim.attributes.NORMAL] : null;
            const smoothNormals = new Float32Array(count * 3);
            if (indices) {
                const posMap = new Map();
                for (let i = 0; i < indices.length; i += 3) {
                    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
                    const x0 = positions[i0 * 3], y0 = positions[i0 * 3 + 1], z0 = positions[i0 * 3 + 2];
                    const x1 = positions[i1 * 3], y1 = positions[i1 * 3 + 1], z1 = positions[i1 * 3 + 2];
                    const x2 = positions[i2 * 3], y2 = positions[i2 * 3 + 1], z2 = positions[i2 * 3 + 2];

                    const ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
                    const bx = x2 - x0, by = y2 - y0, bz = z2 - z0;
                    const fnx = ay * bz - az * by;
                    const fny = az * bx - ax * bz;
                    const fnz = ax * by - ay * bx;

                    for (const vi of [i0, i1, i2]) {
                        const vx = positions[vi * 3], vy = positions[vi * 3 + 1], vz = positions[vi * 3 + 2];
                        const k = `${Math.round(vx * 1000)}_${Math.round(vy * 1000)}_${Math.round(vz * 1000)}`;
                        const cur = posMap.get(k) || [0, 0, 0];
                        cur[0] += fnx; cur[1] += fny; cur[2] += fnz;
                        posMap.set(k, cur);
                    }
                }

                for (let vi = 0; vi < count; vi++) {
                    const vx = positions[vi * 3], vy = positions[vi * 3 + 1], vz = positions[vi * 3 + 2];
                    const k = `${Math.round(vx * 1000)}_${Math.round(vy * 1000)}_${Math.round(vz * 1000)}`;
                    const n = posMap.get(k) || [0, 1, 0];
                    const len = Math.hypot(n[0], n[1], n[2]) || 1;
                    smoothNormals[vi * 3] = n[0] / len;
                    smoothNormals[vi * 3 + 1] = n[1] / len;
                    smoothNormals[vi * 3 + 2] = n[2] / len;
                }

                if (normalAcc) {
                    const normBv = gltf.bufferViews[normalAcc.bufferView];
                    const normOffset = (normBv.byteOffset || 0) + (normalAcc.byteOffset || 0);
                    const targetBuf = new Float32Array(binData.buffer, binData.byteOffset + normOffset, count * 3);
                    targetBuf.set(smoothNormals);
                }
            }

            // Bounding box
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

            // Box-projected TEXCOORD_0 UVs
            const uvs = new Float32Array(count * 2);
            let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
            for (let vi = 0; vi < count; vi++) {
                const x = positions[vi * 3], y = positions[vi * 3 + 1], z = positions[vi * 3 + 2];
                const nx = smoothNormals[vi * 3], ny = smoothNormals[vi * 3 + 1], nz = smoothNormals[vi * 3 + 2];
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

            // 4-byte align and append UVs
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

// ==============================================================================
// 7. Validation Helper
// ==============================================================================
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

// ==============================================================================
// 8. Main Turnkey Execution
// ==============================================================================
function main() {
    console.log('========================================================================');
    console.log('   ANGBAND 3D — CARD 19A BESTIARY GLTF 2.0 ASSET BUILDER & UPGRADER      ');
    console.log('========================================================================\n');

    if (!fs.existsSync(SERVER_BESTIARY_DIR)) fs.mkdirSync(SERVER_BESTIARY_DIR, { recursive: true });
    if (!fs.existsSync(CLIENT_BESTIARY_DIR)) fs.mkdirSync(CLIENT_BESTIARY_DIR, { recursive: true });

    const generators = [
        { name: 'centipede.glb', fn: generateCentipede },
        { name: 'beetle.glb', fn: generateBeetle },
        { name: 'ant.glb', fn: generateAnt },
        { name: 'scorpion.glb', fn: generateScorpion },
        { name: 'floating_eye.glb', fn: generateFloatingEye },
        { name: 'worm_mass.glb', fn: generateWormMass },
        { name: 'jelly_ooze.glb', fn: generateJellyOoze },
        { name: 'mushroom_cluster.glb', fn: generateMushroomCluster },
        { name: 'vortex_elemental.glb', fn: generateVortexElemental },
        { name: 'quylthulg.glb', fn: generateQuylthulg },
        { name: 'hydra.glb', fn: generateHydra },
        { name: 'naga.glb', fn: generateNaga },
        { name: 'bat.glb', fn: generateBat },
        { name: 'bear.glb', fn: generateBear },
        { name: 'lizard.glb', fn: generateLizard },
        { name: 'aquatic.glb', fn: generateAquatic }
    ];

    console.log(`[Phase 1/3] Generating 16 PBR Multi-Material GLTF 2.0 Models...`);
    const results = [];

    for (const gen of generators) {
        const glbBuf = gen.fn();
        const serverPath = path.join(SERVER_BESTIARY_DIR, gen.name);
        const clientPath = path.join(CLIENT_BESTIARY_DIR, gen.name);

        fs.writeFileSync(serverPath, glbBuf);
        fs.writeFileSync(clientPath, glbBuf);

        const vInfo = validateGlb(serverPath);
        results.push({ name: gen.name, type: 'NEW', ...vInfo });
        console.log(`  ✓ Generated ${gen.name} (${vInfo.fileSizeKb} KB, ${vInfo.totalVertices} verts, ${vInfo.primitivesCount} prims, ${vInfo.materialsCount} mats)`);
    }

    console.log(`\n[Phase 2/3] Upgrading 4 Existing UV-less GLTF Models (Smooth Normals + Box UVs)...`);
    const existingModels = ['giant_spider.glb', 'snake.glb', 'wasp.glb', 'frog.glb'];
    for (const name of existingModels) {
        const serverPath = path.join(SERVER_BESTIARY_DIR, name);
        const clientPath = path.join(CLIENT_BESTIARY_DIR, name);

        assert(fs.existsSync(serverPath), `Existing model missing on server: ${serverPath}`);
        const upg = upgradeGlb(serverPath);
        if (upg.upgraded) {
            fs.writeFileSync(serverPath, upg.buffer);
            fs.writeFileSync(clientPath, upg.buffer);
            console.log(`  ✓ Upgraded ${name} with welded smooth normals & box-projected TEXCOORD_0`);
        } else {
            console.log(`  ✓ Verified ${name} already contains TEXCOORD_0`);
        }

        const vInfo = validateGlb(serverPath);
        results.push({ name, type: 'UPGRADED', ...vInfo });
    }

    console.log(`\n[Phase 3/3] Cross-Validating Server & Client Asset Parity...`);
    for (const r of results) {
        const pServer = path.join(SERVER_BESTIARY_DIR, r.name);
        const pClient = path.join(CLIENT_BESTIARY_DIR, r.name);
        assert(fs.existsSync(pServer), `Missing on server: ${pServer}`);
        assert(fs.existsSync(pClient), `Missing on client: ${pClient}`);
        const sStat = fs.statSync(pServer);
        const cStat = fs.statSync(pClient);
        assert.strictEqual(sStat.size, cStat.size, `File size parity mismatch for ${r.name}`);
    }
    console.log(`  ✓ 100% of 20 bestiary models verified synchronized between server & client.`);

    console.log('\n========================================================================================');
    console.log(' MODEL NAME               TYPE        SIZE (KB)   PRIMS   VERTICES   MATERIALS  STATUS');
    console.log('----------------------------------------------------------------------------------------');
    for (const r of results) {
        const nameCol = r.name.padEnd(25);
        const typeCol = r.type.padEnd(12);
        const sizeCol = r.fileSizeKb.padStart(8);
        const primCol = String(r.primitivesCount).padStart(7);
        const vertCol = String(r.totalVertices).padStart(10);
        const matCol = String(r.materialsCount).padStart(10);
        console.log(` ${nameCol} ${typeCol} ${sizeCol} ${primCol} ${vertCol} ${matCol}    PASSED`);
    }
    console.log('========================================================================================\n');
    console.log('CARD 19A COMPLETE: All 16 new + 4 upgraded GLB assets successfully generated and verified.\n');
}

if (require.main === module) {
    main();
}

module.exports = {
    MeshBuilder,
    upgradeGlb,
    validateGlb,
    generateNormalMap,
    generateAlbedoMap,
    generateCentipede,
    generateBeetle,
    generateAnt,
    generateScorpion,
    generateFloatingEye,
    generateWormMass,
    generateJellyOoze,
    generateMushroomCluster,
    generateVortexElemental,
    generateQuylthulg,
    generateHydra,
    generateNaga,
    generateBat,
    generateBear,
    generateLizard,
    generateAquatic
};

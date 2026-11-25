/**
 * Dungeon3DTown — Procedural Town Cluster Architecture (WS-4 / v12.3.1)
 *
 * Decomposes interior Town building footprints into 100%-solid maximal
 * rectangles (never roofing streets, courtyards, or open plazas), builds
 * UV-mapped gabled roofs & plaster gables with tiled slate/kawara normal maps,
 * amber-lit mullioned windows, and crenellated stone battlements.
 *
 * Zero CylinderGeometry (L35.1 invariant safe). Dual UMD + IIFE for browser & tests.
 */
(function (root) {
    'use strict';

    const DEFAULT_CELL_SIZE = 2.0;
    const DEFAULT_WALL_HEIGHT = 3.0;

    function isPerimeterWallCoord(x, y, w, h) {
        return x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2;
    }

    function readRawFeat(d3d, map, x, y) {
        if (!d3d || typeof d3d.getFeatAt !== 'function') {
            const row = map && map.rows && map.rows[y];
            if (!row || !row.f || x * 2 + 1 >= row.f.length) return 0;
            return ((parseInt(row.f[x * 2], 16) || 0) << 4) | (parseInt(row.f[x * 2 + 1], 16) || 0);
        }
        return d3d.getFeatAt(map, x, y);
    }

    function isStoreFeat(feat) {
        return (feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40);
    }

    function isTownRoofClusterTile(feat, glyph, isBuildingCheck) {
        if (feat === 60 || (glyph === '0' && feat === 60)) return false; // Never roof Sil-Q Forge
        if (feat === 21 || feat === 22) return true;
        if (isStoreFeat(feat)) return true;
        return typeof isBuildingCheck === 'function' ? Boolean(isBuildingCheck(feat)) : false;
    }

    /**
     * Find the highest-scoring 100%-solid unclaimed rectangle in [x0..x1] x [y0..y1]
     * using largest-rectangle-in-histogram per row. Prefers thick buildings (minDim >= 3)
     * over thin strips so adjoining wall wings never slice a rectangular building.
     */
    function findBestSolidRect(unclaimed, w, yMin, yMax, xMin, xMax) {
        const subW = xMax - xMin + 1;
        const heights = new Int32Array(subW);
        const stack = new Int32Array(subW + 1);
        let best = null;
        let bestScore = -1;

        for (let y = yMin; y <= yMax; y++) {
            const rowOff = y * w;
            for (let i = 0; i < subW; i++) {
                heights[i] = unclaimed[rowOff + xMin + i] ? (heights[i] + 1) : 0;
            }
            let top = 0;
            for (let i = 0; i <= subW; i++) {
                const curH = i < subW ? heights[i] : 0;
                while (top > 0 && heights[stack[top - 1]] > curH) {
                    const hRect = heights[stack[--top]];
                    const leftIdx = top > 0 ? stack[top - 1] + 1 : 0;
                    const wRect = i - leftIdx;
                    if (wRect > 0 && hRect > 0) {
                        const area = wRect * hRect;
                        const minD = wRect < hRect ? wRect : hRect;
                        const maxD = wRect > hRect ? wRect : hRect;
                        const thickWeight = minD >= 3 ? 4.0 : (minD === 2 ? 2.0 : 1.0);
                        const score = area * thickWeight - maxD * 0.25;
                        if (score > bestScore) {
                            bestScore = score;
                            best = {
                                minX: xMin + leftIdx,
                                maxX: xMin + i - 1,
                                minY: y - hRect + 1,
                                maxY: y
                            };
                        }
                    }
                }
                stack[top++] = i;
            }
        }
        return best;
    }

    /**
     * Decomposes interior Town building footprints into disjoint 100%-solid
     * rectangles classified as either pitched-roof `'building'` blocks or
     * unroofed crenellated `'fortress_wall'` curtain walls. Never spans across
     * streets, plazas, moats, or courtyards.
     */
    function computeTownClusters(map, w, h, d3d) {
        const clusters = [];
        if (!map || !map.rows || w <= 4 || h <= 4) return clusters;

        const unclaimed = new Uint8Array(w * h);
        const clusterable = new Uint8Array(w * h);
        const featGrid = new Uint16Array(w * h);
        const xMin = 2, xMax = w - 3, yMin = 2, yMax = h - 3;

        for (let y = yMin; y <= yMax; y++) {
            for (let x = xMin; x <= xMax; x++) {
                const feat = readRawFeat(d3d, map, x, y);
                const glyph = (d3d && typeof d3d.getGlyphAt === 'function')
                    ? d3d.getGlyphAt(map, x, y)
                    : ((map.rows[y] && map.rows[y].g) ? map.rows[y].g[x] : ' ');
                if (isTownRoofClusterTile(feat, glyph)) {
                    const idx = y * w + x;
                    unclaimed[idx] = 1;
                    clusterable[idx] = 1;
                    featGrid[idx] = feat;
                }
            }
        }

        const pushRectCluster = (bx0, bx1, by0, by1) => {
            const spanX = bx1 - bx0 + 1;
            const spanY = by1 - by0 + 1;
            const minDim = spanX < spanY ? spanX : spanY;
            const maxDim = spanX > spanY ? spanX : spanY;

            // Split overly long thick buildings (maxDim > 20, minDim >= 3) along the long axis into clean roof wings
            if (minDim >= 3 && maxDim > 20) {
                const parts = Math.ceil(maxDim / 16);
                if (spanX >= spanY) {
                    for (let p = 0; p < parts; p++) {
                        const sx0 = bx0 + Math.floor((p * spanX) / parts);
                        const sx1 = bx0 + Math.floor(((p + 1) * spanX) / parts) - 1;
                        if (sx1 >= sx0) pushRectCluster(sx0, sx1, by0, by1);
                    }
                } else {
                    for (let p = 0; p < parts; p++) {
                        const sy0 = by0 + Math.floor((p * spanY) / parts);
                        const sy1 = by0 + Math.floor(((p + 1) * spanY) / parts) - 1;
                        if (sy1 >= sy0) pushRectCluster(bx0, bx1, sy0, sy1);
                    }
                }
                return;
            }

            const tiles = [];
            let hasStore = false;
            let allPerm = true;
            for (let ty = by0; ty <= by1; ty++) {
                for (let tx = bx0; tx <= bx1; tx++) {
                    const feat = featGrid[ty * w + tx];
                    if (isStoreFeat(feat)) hasStore = true;
                    if (feat !== 22) allPerm = false;
                    tiles.push({ x: tx, y: ty, feat });
                }
            }

            let adjToCluster = false;
            if (tiles.length === 1 && !hasStore) {
                const tx = bx0, ty = by0;
                adjToCluster = Boolean(
                    clusterable[ty * w + tx - 1] || clusterable[ty * w + tx + 1] ||
                    clusterable[(ty - 1) * w + tx] || clusterable[(ty + 1) * w + tx]
                );
            }

            const touchesOuterBorder = (bx0 <= 3 || bx1 >= w - 4 || by0 <= 3 || by1 >= h - 4);
            let kind = null;
            if (allPerm && !hasStore && maxDim >= 24 && touchesOuterBorder) {
                kind = 'fortress_wall';
            } else if (tiles.length >= 1) {
                kind = 'building';
            } else {
                return;
            }

            const hash = (((bx0 * 73856093) ^ (by0 * 19349663) ^ (tiles.length * 83492791)) >>> 0);
            const storyExtra = 0;
            const ridgeAlongX = spanX >= spanY;
            const roofPaletteIdx = hash % 3;

            clusters.push({
                kind,
                minX: bx0, maxX: bx1, minY: by0, maxY: by1,
                spanX, spanY,
                hasStore,
                tiles,
                hash,
                storyExtra,
                ridgeAlongX,
                roofPaletteIdx
            });
        };

        for (let iter = 0; iter < 2048; iter++) {
            const best = findBestSolidRect(unclaimed, w, yMin, yMax, xMin, xMax);
            if (!best) break;
            for (let y = best.minY; y <= best.maxY; y++) {
                const rowOff = y * w;
                for (let x = best.minX; x <= best.maxX; x++) {
                    unclaimed[rowOff + x] = 0;
                }
            }
            pushRectCluster(best.minX, best.maxX, best.minY, best.maxY);
        }
        return clusters;
    }

    function createGableRoofGeometry(THREE, spanW, spanD, ridgeH, overhang, ridgeAlongX, roofRGB, gableRGB, isEastern) {
        const hw = spanW * 0.5 + overhang;
        const hd = spanD * 0.5 + overhang;
        const gxW = spanW * 0.5 - 0.01;
        const gxD = spanD * 0.5 - 0.01;

        const roofPos = [];
        const roofNorm = [];
        const roofCol = [];
        const roofUv = [];
        const gablePos = [];
        const gableNorm = [];
        const gableCol = [];
        const gableUv = [];

        const pushTri = (posArr, normArr, colArr, uvArr, a, b, c, rgb, uva, uvb, uvc) => {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            const pts = [a, b, c];
            const uvs = [uva, uvb, uvc];
            for (let i = 0; i < 3; i++) {
                const p = pts[i];
                const uv = uvs[i];
                posArr.push(p[0], p[1], p[2]);
                normArr.push(nx, ny, nz);
                colArr.push(rgb[0], rgb[1], rgb[2]);
                uvArr.push(uv[0], uv[1]);
            }
        };

        const pushQuad = (posArr, normArr, colArr, uvArr, p0, p1, p2, p3, rgb, uv0, uv1, uv2, uv3) => {
            pushTri(posArr, normArr, colArr, uvArr, p0, p1, p2, rgb, uv0, uv1, uv2);
            pushTri(posArr, normArr, colArr, uvArr, p0, p2, p3, rgb, uv0, uv2, uv3);
        };

        const uScale = 0.45;
        const vScale = 0.55;
        const gScale = 0.50;
        const fasciaBot = -0.13;
        const gableBot = -0.12;
        const darkSoffit = [roofRGB[0] * 0.36, roofRGB[1] * 0.33, roofRGB[2] * 0.30];
        const fasciaCol = [roofRGB[0] * 0.44, roofRGB[1] * 0.40, roofRGB[2] * 0.36];
        const ridgeCapCol = [Math.min(1, roofRGB[0] * 0.58), Math.min(1, roofRGB[1] * 0.58), Math.min(1, roofRGB[2] * 0.62)];

        const pushWatertightFasciaAndSoffit = (uMaxVal, vExtVal) => {
            // Vertical 0.13m fascia skirt around all 4 eaves (closes roof overhang volume cleanly)
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, fasciaBot, hd], [hw, fasciaBot, hd], [hw, 0, hd], [-hw, 0, hd], fasciaCol, [0, 0], [uMaxVal, 0], [uMaxVal, 0.15], [0, 0.15]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [hw, fasciaBot, -hd], [-hw, fasciaBot, -hd], [-hw, 0, -hd], [hw, 0, -hd], fasciaCol, [0, 0], [uMaxVal, 0], [uMaxVal, 0.15], [0, 0.15]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, fasciaBot, -hd], [-hw, fasciaBot, hd], [-hw, 0, hd], [-hw, 0, -hd], fasciaCol, [0, 0], [vExtVal, 0], [vExtVal, 0.15], [0, 0.15]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [hw, fasciaBot, hd], [hw, fasciaBot, -hd], [hw, 0, -hd], [hw, 0, hd], fasciaCol, [0, 0], [vExtVal, 0], [vExtVal, 0.15], [0, 0.15]);
            // Closed bottom soffit plate with explicit (0, -1, 0) downward normals
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, fasciaBot, hd], [-hw, fasciaBot, -hd], [hw, fasciaBot, -hd], [hw, fasciaBot, hd], darkSoffit, [0, 0], [0, vExtVal], [uMaxVal, vExtVal], [uMaxVal, 0]);
        };

        if (ridgeAlongX) {
            const rL = [-hw, ridgeH, 0];
            const rR = [hw, ridgeH, 0];
            const eFL = [-hw, 0, hd];
            const eFR = [hw, 0, hd];
            const eBL = [-hw, 0, -hd];
            const eBR = [hw, 0, -hd];
            const uMax = (hw * 2) * uScale;
            const vMax = Math.hypot(hd, ridgeH) * vScale;
            const t = -fasciaBot;
            // Front (+Z) & Back (-Z) roof slopes + sloped underside soffits + rake bargeboards + fascia/soffit prism
            pushQuad(roofPos, roofNorm, roofCol, roofUv, eFL, eFR, rR, rL, roofRGB, [0, 0], [uMax, 0], [uMax, vMax], [0, vMax]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, eBR, eBL, rL, rR, roofRGB, [0, 0], [uMax, 0], [uMax, vMax], [0, vMax]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, -t, hd], [-hw, ridgeH - t, 0], [hw, ridgeH - t, 0], [hw, -t, hd], darkSoffit, [0, 0], [0, vMax], [uMax, vMax], [uMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [hw, -t, -hd], [hw, ridgeH - t, 0], [-hw, ridgeH - t, 0], [-hw, -t, -hd], darkSoffit, [0, 0], [0, vMax], [uMax, vMax], [uMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [hw, 0, hd], [hw, -t, hd], [hw, ridgeH - t, 0], [hw, ridgeH, 0], fasciaCol, [0, 0], [0, 0.15], [vMax, 0.15], [vMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [hw, -t, -hd], [hw, 0, -hd], [hw, ridgeH, 0], [hw, ridgeH - t, 0], fasciaCol, [0, 0], [0, 0.15], [vMax, 0.15], [vMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, -t, hd], [-hw, 0, hd], [-hw, ridgeH, 0], [-hw, ridgeH - t, 0], fasciaCol, [0, 0], [0, 0.15], [vMax, 0.15], [vMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, 0, -hd], [-hw, -t, -hd], [-hw, ridgeH - t, 0], [-hw, ridgeH, 0], fasciaCol, [0, 0], [0, 0.15], [vMax, 0.15], [vMax, 0]);
            pushWatertightFasciaAndSoffit(uMax, (hd * 2) * uScale);
            if (isEastern) {
                const capW = 0.09;
                const capBot = ridgeH - 0.04;
                const capH = ridgeH + 0.07;
                const cExt = hw;
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [-cExt, capBot, capW], [cExt, capBot, capW], [cExt, capH, capW * 0.65], [-cExt, capH, capW * 0.65], ridgeCapCol, [0, 0], [uMax, 0], [uMax, 0.25], [0, 0.25]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [cExt, capBot, -capW], [-cExt, capBot, -capW], [-cExt, capH, -capW * 0.65], [cExt, capH, -capW * 0.65], ridgeCapCol, [0, 0], [uMax, 0], [uMax, 0.25], [0, 0.25]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [-cExt, capH, capW * 0.65], [cExt, capH, capW * 0.65], [cExt, capH, -capW * 0.65], [-cExt, capH, -capW * 0.65], ridgeCapCol, [0, 0], [uMax, 0], [uMax, 0.2], [0, 0.2]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [-cExt, capBot, -capW], [-cExt, capBot, capW], [-cExt, capH, capW * 0.65], [-cExt, capH, -capW * 0.65], ridgeCapCol, [0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [cExt, capBot, capW], [cExt, capBot, -capW], [cExt, capH, -capW * 0.65], [cExt, capH, capW * 0.65], ridgeCapCol, [0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]);
            }
            // Outward-facing Gable end-walls at -X (-1,0,0) and +X (+1,0,0) seated below wall top
            const gw = (gxD * 2) * gScale;
            const gh = ridgeH * gScale;
            pushTri(gablePos, gableNorm, gableCol, gableUv, [-gxW, gableBot, -gxD], [-gxW, gableBot, gxD], [-gxW, ridgeH, 0], gableRGB, [0, 0], [gw, 0], [gw * 0.5, gh]);
            pushTri(gablePos, gableNorm, gableCol, gableUv, [gxW, gableBot, gxD], [gxW, gableBot, -gxD], [gxW, ridgeH, 0], gableRGB, [0, 0], [gw, 0], [gw * 0.5, gh]);
        } else {
            const rB = [0, ridgeH, -hd];
            const rF = [0, ridgeH, hd];
            const eLF = [-hw, 0, hd];
            const eLB = [-hw, 0, -hd];
            const eRF = [hw, 0, hd];
            const eRB = [hw, 0, -hd];
            const uMax = (hd * 2) * uScale;
            const vMax = Math.hypot(hw, ridgeH) * vScale;
            const t = -fasciaBot;
            pushQuad(roofPos, roofNorm, roofCol, roofUv, eLF, rF, rB, eLB, roofRGB, [0, 0], [0, vMax], [uMax, vMax], [uMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, eRB, rB, rF, eRF, roofRGB, [0, 0], [0, vMax], [uMax, vMax], [uMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, -t, -hd], [0, ridgeH - t, -hd], [0, ridgeH - t, hd], [-hw, -t, hd], darkSoffit, [0, 0], [0, vMax], [uMax, vMax], [uMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [hw, -t, hd], [0, ridgeH - t, hd], [0, ridgeH - t, -hd], [hw, -t, -hd], darkSoffit, [0, 0], [0, vMax], [uMax, vMax], [uMax, 0]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, -t, hd], [0, ridgeH - t, hd], [0, ridgeH, hd], [-hw, 0, hd], fasciaCol, [0, 0], [vMax, 0], [vMax, 0.15], [0, 0.15]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [0, ridgeH - t, hd], [hw, -t, hd], [hw, 0, hd], [0, ridgeH, hd], fasciaCol, [0, 0], [vMax, 0], [vMax, 0.15], [0, 0.15]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [-hw, 0, -hd], [0, ridgeH, -hd], [0, ridgeH - t, -hd], [-hw, -t, -hd], fasciaCol, [0, 0], [vMax, 0], [vMax, 0.15], [0, 0.15]);
            pushQuad(roofPos, roofNorm, roofCol, roofUv, [0, ridgeH, -hd], [hw, 0, -hd], [hw, -t, -hd], [0, ridgeH - t, -hd], fasciaCol, [0, 0], [vMax, 0], [vMax, 0.15], [0, 0.15]);
            pushWatertightFasciaAndSoffit((hw * 2) * uScale, uMax);
            if (isEastern) {
                const capW = 0.09;
                const capBot = ridgeH - 0.04;
                const capH = ridgeH + 0.07;
                const cExt = hd;
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [-capW, capBot, -cExt], [-capW, capBot, cExt], [-capW * 0.65, capH, cExt], [-capW * 0.65, capH, -cExt], ridgeCapCol, [0, 0], [uMax, 0], [uMax, 0.25], [0, 0.25]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [capW, capBot, cExt], [capW, capBot, -cExt], [capW * 0.65, capH, -cExt], [capW * 0.65, capH, cExt], ridgeCapCol, [0, 0], [uMax, 0], [uMax, 0.25], [0, 0.25]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [-capW * 0.65, capH, cExt], [capW * 0.65, capH, cExt], [capW * 0.65, capH, -cExt], [-capW * 0.65, capH, -cExt], ridgeCapCol, [0, 0], [0.2, 0], [0.2, uMax], [0, uMax]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [-capW, capBot, cExt], [capW, capBot, cExt], [capW * 0.65, capH, cExt], [-capW * 0.65, capH, cExt], ridgeCapCol, [0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]);
                pushQuad(roofPos, roofNorm, roofCol, roofUv, [capW, capBot, -cExt], [-capW, capBot, -cExt], [-capW * 0.65, capH, -cExt], [capW * 0.65, capH, -cExt], ridgeCapCol, [0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]);
            }
            const gw = (gxW * 2) * gScale;
            const gh = ridgeH * gScale;
            pushTri(gablePos, gableNorm, gableCol, gableUv, [-gxW, gableBot, gxD], [gxW, gableBot, gxD], [0, ridgeH, gxD], gableRGB, [0, 0], [gw, 0], [gw * 0.5, gh]);
            pushTri(gablePos, gableNorm, gableCol, gableUv, [gxW, gableBot, -gxD], [-gxW, gableBot, -gxD], [0, ridgeH, -gxD], gableRGB, [0, 0], [gw, 0], [gw * 0.5, gh]);
        }

        const buildBuf = (p, n, c, u) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
            return g;
        };

        return {
            roofGeo: buildBuf(roofPos, roofNorm, roofCol, roofUv),
            gableGeo: buildBuf(gablePos, gableNorm, gableCol, gableUv)
        };
    }

    function createTownRoofTileTextures(THREE, isEastern) {
        const size = 512;
        const heights = new Float32Array(size * size);
        const diffData = new Uint8Array(size * size * 4);
        const normData = new Uint8Array(size * size * 4);

        const cols = 10;
        const rows = 10;

        for (let y = 0; y < size; y++) {
            const fy = y / size;
            const rIdx = Math.floor(fy * rows);
            const rowV = (fy * rows) - rIdx;
            const stagger = (!isEastern && (rIdx & 1)) ? 0.5 : 0.0;

            for (let x = 0; x < size; x++) {
                const fx = x / size;
                const ux = (fx * cols + stagger) % cols;
                const cIdx = Math.floor(ux);
                const colU = ux - cIdx;
                const tileHash = (((cIdx * 73 + rIdx * 137) ^ (rIdx * 31) ^ (cIdx * 19)) & 31) / 31;
                const coarseGrain = (Math.sin(x * 0.21 + cIdx * 3.1) * Math.cos(y * 0.27 + rIdx * 2.3)) * 0.045;
                const fineGrain = ((((x * 1664525 + y * 1013904223) >>> 24) & 255) / 255 - 0.5) * 0.07;

                let hVal;
                let seamShade = 1.0;
                if (isEastern) {
                    // Weathered Ibushi-Kawara interlocking ceramic roof tiles (matte, deep valley AO, non-glare ribs)
                    const ribDist = Math.abs(colU - 0.5) * 2.0;
                    const panCurve = Math.pow(Math.max(0, 1.0 - ribDist * ribDist), 0.72) * 0.42;
                    const lipShadow = rowV < 0.14 ? (0.42 + (rowV / 0.14) * 0.58) : 1.0;
                    const valleyDark = ribDist > 0.84 ? (1.0 - (ribDist - 0.84) * 2.2) : 1.0;
                    const overlap = 0.34 + 0.66 * rowV;
                    hVal = (panCurve + overlap * 0.58) * lipShadow;
                    seamShade = lipShadow * Math.max(0.55, valleyDark) * (0.68 + tileHash * 0.20 + coarseGrain);
                } else {
                    // Hand-split weathered slate & terracotta shingles (dark crevices, beveled edges, mottled stone tone)
                    const bevelX = (colU < 0.06 || colU > 0.94) ? 0.48 : 1.0;
                    const lipShadow = rowV < 0.12 ? (0.38 + (rowV / 0.12) * 0.62) : 1.0;
                    const subtleArc = Math.sin(colU * Math.PI) * 0.08;
                    hVal = (0.34 + 0.58 * rowV + subtleArc) * bevelX * lipShadow;
                    seamShade = Math.min(bevelX, lipShadow) * (0.64 + tileHash * 0.24 + coarseGrain);
                }

                heights[y * size + x] = hVal;
                const val = Math.min(0.84, Math.max(0.18, seamShade * 0.72 + fineGrain));
                const rVal = Math.round(val * 255);
                const gVal = Math.round(val * (isEastern ? 0.99 : 0.98) * 255);
                const bVal = Math.round(val * (isEastern ? 1.02 : 0.96) * 255);
                const i4 = (y * size + x) * 4;
                diffData[i4] = Math.min(255, Math.max(32, rVal));
                diffData[i4 + 1] = Math.min(255, Math.max(32, gVal));
                diffData[i4 + 2] = Math.min(255, Math.max(32, bVal));
                diffData[i4 + 3] = 255;
            }
        }

        const strength = isEastern ? 3.2 : 3.0;
        for (let y = 0; y < size; y++) {
            const ym = (y - 1 + size) % size;
            const yp = (y + 1) % size;
            for (let x = 0; x < size; x++) {
                const xm = (x - 1 + size) % size;
                const xp = (x + 1) % size;
                const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
                const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
                const len = Math.hypot(dx, dy, 1.0) || 1.0;
                const i4 = (y * size + x) * 4;
                normData[i4] = Math.min(255, Math.max(0, Math.round(((-dx / len) * 0.5 + 0.5) * 255)));
                normData[i4 + 1] = Math.min(255, Math.max(0, Math.round(((-dy / len) * 0.5 + 0.5) * 255)));
                normData[i4 + 2] = Math.min(255, Math.max(0, Math.round(((1.0 / len) * 0.5 + 0.5) * 255)));
                normData[i4 + 3] = 255;
            }
        }

        const mkTex = (data, isColor) => {
            if (typeof THREE.DataTexture !== 'function') return null;
            const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
            if (THREE.RepeatWrapping !== undefined) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
            }
            if (THREE.LinearMipmapLinearFilter !== undefined) {
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
            }
            tex.anisotropy = 8;
            if (isColor) {
                if (typeof THREE.SRGBColorSpace !== 'undefined') tex.colorSpace = THREE.SRGBColorSpace;
                else if (typeof THREE.sRGBEncoding !== 'undefined') tex.encoding = THREE.sRGBEncoding;
            } else {
                if (typeof THREE.NoColorSpace !== 'undefined') tex.colorSpace = THREE.NoColorSpace;
                else if (typeof THREE.LinearEncoding !== 'undefined') tex.encoding = THREE.LinearEncoding;
            }
            tex._sharedTexture = true;
            tex.needsUpdate = true;
            return tex;
        };

        return {
            diff: mkTex(diffData, true),
            nor: mkTex(normData, false)
        };
    }

    function syncTownSharedMaterials(d3d, THREE, realm) {
        if (!d3d || !THREE) return null;
        const mats = ensureSharedMaterials(d3d, THREE);
        const rLow = String(realm || d3d.realm || 'angband').toLowerCase();
        const isEastern = (rLow === 'hengband' || rLow === 'frogcomposband');
        const styleKey = isEastern ? 'eastern' : 'western';

        if (!d3d._townRoofTexCache) d3d._townRoofTexCache = {};
        if (!d3d._townRoofTexCache[styleKey]) {
            d3d._townRoofTexCache[styleKey] = createTownRoofTileTextures(THREE, isEastern);
        }
        const roofSet = d3d._townRoofTexCache[styleKey];
        if (!mats._roofPaletteCache) mats._roofPaletteCache = {};
        if (!mats._roofPaletteCache[styleKey]) {
            const palettes = isEastern
                ? [[0.36, 0.42, 0.50], [0.58, 0.30, 0.24], [0.35, 0.38, 0.45]]
                : [[0.40, 0.44, 0.52], [0.64, 0.32, 0.22], [0.36, 0.44, 0.40]];
            mats._roofPaletteCache[styleKey] = palettes.map((rgb) => {
                const hex = ((Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255));
                const pm = new THREE.MeshStandardMaterial({
                    color: hex,
                    map: roofSet ? roofSet.diff : null,
                    normalMap: roofSet ? roofSet.nor : null,
                    roughness: isEastern ? 0.78 : 0.86,
                    metalness: 0.06,
                    vertexColors: true
                });
                if (typeof THREE.Vector2 === 'function') {
                    pm.normalScale = new THREE.Vector2(1.15, 1.15);
                }
                pm._sharedMaterial = true;
                return pm;
            });
        }
        mats.roofPaletteMats = mats._roofPaletteCache[styleKey];
        if (roofSet) {
            if (mats.roofMat && mats.roofMat._roofStyle !== styleKey) {
                mats.roofMat.map = roofSet.diff;
                mats.roofMat.normalMap = roofSet.nor;
                if (typeof THREE.Vector2 === 'function') {
                    mats.roofMat.normalScale = new THREE.Vector2(1.15, 1.15);
                }
                mats.roofMat.roughness = isEastern ? 0.78 : 0.86;
                mats.roofMat._roofStyle = styleKey;
                mats.roofMat.needsUpdate = true;
            }
            if (d3d.townRoofMaterial && d3d.townRoofMaterial._roofStyle !== styleKey) {
                d3d.townRoofMaterial.map = roofSet.diff;
                d3d.townRoofMaterial.normalMap = roofSet.nor;
                d3d.townRoofMaterial._roofStyle = styleKey;
                d3d.townRoofMaterial.needsUpdate = true;
            }
        }

        const wallMap = (d3d.wallMaterial && d3d.wallMaterial.map) || d3d.wallTex || null;
        const wallNor = (d3d.wallMaterial && d3d.wallMaterial.normalMap) || d3d.wallNormal || null;
        if (mats.gableMat && (mats.gableMat.map !== wallMap || mats.gableMat.normalMap !== wallNor)) {
            mats.gableMat.map = wallMap;
            mats.gableMat.normalMap = wallNor;
            mats.gableMat.needsUpdate = true;
        }

        const permMap = (d3d.permWallMaterial && d3d.permWallMaterial.map) || d3d.permWallTex || wallMap;
        const permNor = (d3d.permWallMaterial && d3d.permWallMaterial.normalMap) || d3d.permWallNormal || wallNor;
        if (mats.battlementMat && (mats.battlementMat.map !== permMap || mats.battlementMat.normalMap !== permNor)) {
            mats.battlementMat.map = permMap;
            mats.battlementMat.normalMap = permNor;
            mats.battlementMat.needsUpdate = true;
        }
        if (d3d.townTimberMaterial) {
            mats.windowFrameMat = d3d.townTimberMaterial;
        }
        return mats;
    }

    function ensureSharedMaterials(d3d, THREE) {
        if (d3d._townSharedMats) return d3d._townSharedMats;

        let windowTex = null;
        if (typeof THREE.TextureLoader === 'function') {
            try {
                const mgr = (typeof THREE.LoadingManager === 'function') ? new THREE.LoadingManager() : undefined;
                if (mgr) mgr.setURLModifier((u) => (u && !u.startsWith('blob:') && !u.startsWith('data:') && typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(u) : u);
                const loader = new THREE.TextureLoader(mgr);
                windowTex = loader.load('/assets/textures/T_WindowGradient.webp');
                windowTex._sharedTexture = true;
                if (typeof THREE.SRGBColorSpace !== 'undefined') windowTex.colorSpace = THREE.SRGBColorSpace;
            } catch (_) {
                windowTex = null;
            }
        }

        const roofMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.76,
            metalness: 0.06,
            vertexColors: true
        });
        roofMat._sharedMaterial = true;

        const gableMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: (d3d && d3d.wallMaterial && d3d.wallMaterial.map) || (d3d && d3d.wallTex) || null,
            normalMap: (d3d && d3d.wallMaterial && d3d.wallMaterial.normalMap) || (d3d && d3d.wallNormal) || null,
            roughness: 0.88,
            metalness: 0.04,
            vertexColors: true
        });
        gableMat._sharedMaterial = true;

        const windowMat = new THREE.MeshStandardMaterial({
            color: 0xffd28a,
            map: windowTex,
            emissive: new THREE.Color(0xff9e3d),
            emissiveMap: windowTex,
            emissiveIntensity: 0.78,
            roughness: 0.32,
            metalness: 0.15
        });
        windowMat._sharedMaterial = true;

        const battlementMat = new THREE.MeshStandardMaterial({
            color: 0x9aa0aa,
            map: (d3d && d3d.permWallMaterial && d3d.permWallMaterial.map) || (d3d && d3d.wallTex) || null,
            normalMap: (d3d && d3d.permWallMaterial && d3d.permWallMaterial.normalMap) || (d3d && d3d.wallNormal) || null,
            roughness: 0.88,
            metalness: 0.05
        });
        battlementMat._sharedMaterial = true;

        const windowFrameGeo = new THREE.BoxGeometry(0.84, 1.02, 0.07);
        windowFrameGeo._sharedGeometry = true;
        const windowPaneGeo = new THREE.BoxGeometry(0.68, 0.86, 0.09);
        windowPaneGeo._sharedGeometry = true;
        const merlonGeo = new THREE.BoxGeometry(1.12, 0.84, 0.86);
        merlonGeo._sharedGeometry = true;
        const chimneyGeo = new THREE.BoxGeometry(0.46, 0.92, 0.46);
        chimneyGeo._sharedGeometry = true;
        const watchGeo = new THREE.BoxGeometry(DEFAULT_CELL_SIZE * 1.45, 1.55, DEFAULT_CELL_SIZE * 1.45);
        watchGeo._sharedGeometry = true;

        d3d._townSharedMats = {
            roofMat,
            gableMat,
            windowMat,
            battlementMat,
            windowFrameMat: (d3d && d3d.townTimberMaterial) || gableMat,
            windowFrameGeo,
            windowPaneGeo,
            merlonGeo,
            chimneyGeo,
            watchGeo
        };
        return d3d._townSharedMats;
    }

    function disposeTownArchitecture(d3d) {
        if (!d3d || !d3d._townArchGroup) return;
        const grp = d3d._townArchGroup;
        const disposables = grp._ownedDisposables || [];
        for (let i = 0; i < disposables.length; i++) {
            const item = disposables[i];
            if (item && typeof item.dispose === 'function' && !item._sharedGeometry && !item._sharedMaterial && !item._sharedTexture) {
                try { item.dispose(); } catch (_) {}
            }
        }
        if (grp.parent) grp.parent.remove(grp);
        d3d._townArchGroup = null;
        d3d._townArchSig = null;
    }

    function buildTownArchitecture(d3d, map, w, h, depth, realm, px, py, maxTileDist) {
        if (!d3d || !d3d.scene || typeof THREE === 'undefined') return false;
        if (depth !== 0 || !map || !map.rows || w <= 4 || h <= 4) {
            disposeTownArchitecture(d3d);
            return false;
        }

        const hasCull = Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(maxTileDist) && maxTileDist > 0;
        const maxDistSq = hasCull ? (maxTileDist * maxTileDist) : Infinity;
        const cullSig = hasCull ? `:${Math.round(px)},${Math.round(py)}@${Math.round(maxTileDist)}` : '';
        const sig = `${d3d._lastTerrainSig || ''}:${depth}:${realm || d3d.realm || 'angband'}:${w}x${h}${cullSig}`;
        if (d3d._townArchSig === sig && d3d._townArchGroup) {
            syncTownSharedMaterials(d3d, THREE, realm);
            return true;
        }
        disposeTownArchitecture(d3d);

        const clusters = computeTownClusters(map, w, h, d3d);
        if (clusters.length === 0) return false;

        const grp = new THREE.Group();
        grp.name = 'TownMedievalArchitecture';
        grp._ownedDisposables = [];

        const mats = syncTownSharedMaterials(d3d, THREE, realm);
        const cs = d3d.cellSize || DEFAULT_CELL_SIZE;
        const wallH = d3d.wallHeight || DEFAULT_WALL_HEIGHT;
        const dummy = new THREE.Object3D();
        const rLow = String(realm || d3d.realm || 'angband').toLowerCase();

        const isEastern = (rLow === 'hengband' || rLow === 'frogcomposband');
        const palettes = isEastern
            ? [[0.36, 0.42, 0.50], [0.58, 0.30, 0.24], [0.35, 0.38, 0.45]]
            : [[0.40, 0.44, 0.52], [0.64, 0.32, 0.22], [0.36, 0.44, 0.40]];

        const gableCol = [0.80, 0.74, 0.62];
        const merlonPositions = [];
        const withinCullTile = (tx, ty) => {
            if (!hasCull) return true;
            const dx = tx - px, dy = ty - py;
            return (dx * dx + dy * dy) <= maxDistSq;
        };
        const withinCullRect = (x0, x1, y0, y1) => {
            if (!hasCull) return true;
            const cx = px < x0 ? x0 : (px > x1 ? x1 : px);
            const cy = py < y0 ? y0 : (py > y1 ? y1 : py);
            const dx = cx - px, dy = cy - py;
            return (dx * dx + dy * dy) <= maxDistSq;
        };

        // Layer 1 & 2: Pitched Gabled Roofs + Plaster Gable Walls + Chimneys (solid buildings only)
        const chimneyTransforms = [];
        const roofCache = new Map();
        const gableCache = new Map();
        const roofPlacements = [];
        const gablePlacements = [];
        for (let ci = 0; ci < clusters.length; ci++) {
            const cl = clusters[ci];
            if (!withinCullRect(cl.minX, cl.maxX, cl.minY, cl.maxY)) continue;
            if (cl.kind === 'fortress_wall') {
                for (let ti = 0; ti < cl.tiles.length; ti++) {
                    const t = cl.tiles[ti];
                    if (withinCullTile(t.x, t.y) && ((t.x + t.y) & 1) === 0) {
                        merlonPositions.push({ x: t.x * cs, y: wallH + 0.42, z: t.y * cs });
                    }
                }
                continue;
            }

            const spanW = cl.spanX * cs;
            const spanD = cl.spanY * cs;
            const eaveY = wallH - 0.04;
            const ridgeH = Math.min(1.65, Math.max(0.82, (cl.ridgeAlongX ? spanD : spanW) * 0.30));
            const cxWorld = ((cl.minX + cl.maxX) * 0.5) * cs;
            const czWorld = ((cl.minY + cl.maxY) * 0.5) * cs;
            const paletteSlot = cl.roofPaletteIdx % palettes.length;
            const rKey = `${cl.ridgeAlongX ? 1 : 0}:${isEastern ? 1 : 0}`;
            const gKey = `${cl.ridgeAlongX ? 1 : 0}`;
            let cachedRoof = roofCache.get(rKey);
            if (!cachedRoof) {
                const created = createGableRoofGeometry(
                    THREE, 6.0, 6.0, 1.2, 0.0, cl.ridgeAlongX, [1, 1, 1], gableCol, isEastern
                );
                let sharedGable = gableCache.get(gKey);
                if (sharedGable) {
                    if (created.gableGeo && typeof created.gableGeo.dispose === 'function') created.gableGeo.dispose();
                } else {
                    sharedGable = created.gableGeo;
                    gableCache.set(gKey, sharedGable);
                    grp._ownedDisposables.push(sharedGable);
                }
                cachedRoof = { roofGeo: created.roofGeo, gableGeo: sharedGable };
                roofCache.set(rKey, cachedRoof);
                grp._ownedDisposables.push(cachedRoof.roofGeo);
            }
            const { roofGeo, gableGeo } = cachedRoof;
            roofPlacements.push({
                geo: roofGeo,
                paletteSlot,
                x: cxWorld, y: eaveY, z: czWorld,
                sx: (spanW + 0.56) / 6.0, sy: ridgeH / 1.2, sz: (spanD + 0.56) / 6.0
            });
            gablePlacements.push({
                geo: gableGeo,
                x: cxWorld, y: eaveY - 0.02, z: czWorld,
                sx: spanW / 6.0, sy: ridgeH / 1.2, sz: spanD / 6.0
            });

            if (cl.tiles.length >= 6) {
                const offX = cl.ridgeAlongX ? spanW * 0.18 : -spanW * 0.10;
                const offZ = cl.ridgeAlongX ? -spanD * 0.10 : spanD * 0.18;
                chimneyTransforms.push({
                    x: cxWorld + offX,
                    y: eaveY + ridgeH * 0.78 + 0.12,
                    z: czWorld + offZ
                });
            }
        }

        if (roofPlacements.length > 0 && typeof THREE.BatchedMesh === 'function') {
            let totalRoofVerts = 0;
            const roofGeoIds = new Map();
            for (const { roofGeo } of roofCache.values()) {
                totalRoofVerts += roofGeo.attributes.position.count;
            }
            const batchedRoofs = new THREE.BatchedMesh(roofPlacements.length, Math.max(64, totalRoofVerts), Math.max(64, totalRoofVerts * 2), mats.roofMat);
            batchedRoofs.name = 'TownBatchedRoofs';
            batchedRoofs.castShadow = true;
            batchedRoofs.receiveShadow = true;
            for (const [rk, val] of roofCache.entries()) {
                roofGeoIds.set(val.roofGeo, batchedRoofs.addGeometry(val.roofGeo));
            }
            const palCol = new THREE.Color();
            for (const rp of roofPlacements) {
                const gid = roofGeoIds.get(rp.geo);
                const iid = batchedRoofs.addInstance(gid);
                dummy.position.set(rp.x, rp.y, rp.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(rp.sx, rp.sy, rp.sz);
                dummy.updateMatrix();
                batchedRoofs.setMatrixAt(iid, dummy.matrix);
                const pal = palettes[rp.paletteSlot] || palettes[0];
                palCol.setRGB(pal[0], pal[1], pal[2]);
                batchedRoofs.setColorAt(iid, palCol);
            }
            batchedRoofs.computeBoundingSphere();
            grp.add(batchedRoofs);
            grp._ownedDisposables.push(batchedRoofs);

            let totalGableVerts = 0;
            const gableGeoIds = new Map();
            for (const gGeo of gableCache.values()) {
                totalGableVerts += gGeo.attributes.position.count;
            }
            const batchedGables = new THREE.BatchedMesh(gablePlacements.length, Math.max(64, totalGableVerts), Math.max(64, totalGableVerts * 2), mats.gableMat);
            batchedGables.name = 'TownBatchedGables';
            for (const gGeo of gableCache.values()) {
                gableGeoIds.set(gGeo, batchedGables.addGeometry(gGeo));
            }
            for (const gp of gablePlacements) {
                const gid = gableGeoIds.get(gp.geo);
                const iid = batchedGables.addInstance(gid);
                dummy.position.set(gp.x, gp.y, gp.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(gp.sx, gp.sy, gp.sz);
                dummy.updateMatrix();
                batchedGables.setMatrixAt(iid, dummy.matrix);
            }
            batchedGables.computeBoundingSphere();
            grp.add(batchedGables);
            grp._ownedDisposables.push(batchedGables);
            if (d3d) d3d._townBatchedCount = 2;
        } else {
            if (d3d) d3d._townBatchedCount = 0;
            for (let i = 0; i < roofPlacements.length; i++) {
                const rp = roofPlacements[i];
                const gp = gablePlacements[i];
                const roofMat = (mats.roofPaletteMats && mats.roofPaletteMats[rp.paletteSlot]) || mats.roofMat;
                const roofMesh = new THREE.Mesh(rp.geo, roofMat);
                roofMesh.position.set(rp.x, rp.y, rp.z);
                roofMesh.scale.set(rp.sx, rp.sy, rp.sz);
                roofMesh.castShadow = true;
                roofMesh.receiveShadow = true;
                grp.add(roofMesh);

                const gableMesh = new THREE.Mesh(gp.geo, mats.gableMat);
                gableMesh.position.set(gp.x, gp.y, gp.z);
                gableMesh.scale.set(gp.sx, gp.sy, gp.sz);
                grp.add(gableMesh);
            }
        }

        if (chimneyTransforms.length > 0) {
            const chimneyInst = new THREE.InstancedMesh(mats.chimneyGeo, mats.battlementMat, chimneyTransforms.length);
            for (let i = 0; i < chimneyTransforms.length; i++) {
                const c = chimneyTransforms[i];
                dummy.position.set(c.x, c.y, c.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                chimneyInst.setMatrixAt(i, dummy.matrix);
            }
            chimneyInst.instanceMatrix.needsUpdate = true;
            grp.add(chimneyInst);
        }

        // Layer 3: Warm Amber-Lit Mullioned Windows on outward wall faces of buildings
        const winPlacements = [];
        const isOpenStreet = (tx, ty) => {
            if (tx <= 0 || tx >= w - 1 || ty <= 0 || ty >= h - 1) return false;
            const f = readRawFeat(d3d, map, tx, ty);
            return f === 1 || f === 25 || f === 26 || f === 27 || f === 28 || f === 29 || f === 31;
        };
        for (let ci = 0; ci < clusters.length; ci++) {
            const cl = clusters[ci];
            if (cl.kind === 'fortress_wall') continue;
            if (!withinCullRect(cl.minX, cl.maxX, cl.minY, cl.maxY)) continue;
            for (let ti = 0; ti < cl.tiles.length; ti++) {
                const t = cl.tiles[ti];
                if (t.feat !== 21 && t.feat !== 22) continue;
                if (((t.x + t.y) & 1) !== 0) continue;
                if (!withinCullTile(t.x, t.y)) continue;
                const wx = t.x * cs, wz = t.y * cs;
                const faces = [
                    [0, 1, 0, 1.01, 0],
                    [0, -1, 0, -1.01, Math.PI],
                    [1, 0, 1.01, 0, Math.PI * 0.5],
                    [-1, 0, -1.01, 0, -Math.PI * 0.5]
                ];
                for (let fi = 0; fi < faces.length; fi++) {
                    const [dx, dy, ox, oz, yaw] = faces[fi];
                    if (!isOpenStreet(t.x + dx, t.y + dy)) continue;
                    const adjDoor = isStoreFeat(readRawFeat(d3d, map, t.x - dy, t.y + dx)) ||
                        isStoreFeat(readRawFeat(d3d, map, t.x + dy, t.y - dx));
                    if (adjDoor) continue;
                    winPlacements.push({ x: wx + ox, y: 1.72, z: wz + oz, yaw });
                }
            }
        }

        if (winPlacements.length > 0) {
            const paneInst = new THREE.InstancedMesh(mats.windowPaneGeo, mats.windowMat, winPlacements.length);
            const frameInst = new THREE.InstancedMesh(mats.windowFrameGeo, mats.windowFrameMat, winPlacements.length);
            for (let i = 0; i < winPlacements.length; i++) {
                const wp = winPlacements[i];
                dummy.position.set(wp.x, wp.y, wp.z);
                dummy.rotation.set(0, wp.yaw, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                paneInst.setMatrixAt(i, dummy.matrix);
                frameInst.setMatrixAt(i, dummy.matrix);
            }
            paneInst.instanceMatrix.needsUpdate = true;
            frameInst.instanceMatrix.needsUpdate = true;
            grp.add(frameInst, paneInst);
        }

        // Layer 4: Outer Perimeter & Fortress-Wall Crenellated Stone Battlements + Corner Watchtowers
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (x !== 0 && x !== w - 1 && y !== 0 && y !== h - 1) continue;
                if (!withinCullTile(x, y)) continue;
                const f = readRawFeat(d3d, map, x, y);
                if (f !== 22 && f !== 21) continue;
                if (((x + y) & 1) === 0) {
                    merlonPositions.push({ x: x * cs, y: wallH + 0.44, z: y * cs });
                }
            }
        }
        if (merlonPositions.length > 0) {
            const merlonInst = new THREE.InstancedMesh(mats.merlonGeo, mats.battlementMat, merlonPositions.length);
            for (let i = 0; i < merlonPositions.length; i++) {
                const mp = merlonPositions[i];
                dummy.position.set(mp.x, mp.y, mp.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                merlonInst.setMatrixAt(i, dummy.matrix);
            }
            merlonInst.instanceMatrix.needsUpdate = true;
            grp.add(merlonInst);
        }

        const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
        const towerInst = new THREE.InstancedMesh(mats.watchGeo, mats.battlementMat, 4);
        let tCount = 0;
        const watchScaleXZ = cs / DEFAULT_CELL_SIZE;
        for (let ci = 0; ci < corners.length; ci++) {
            const [cx, cy] = corners[ci];
            if (!withinCullTile(cx, cy)) continue;
            const f = readRawFeat(d3d, map, cx, cy);
            if (f !== 22 && f !== 21) continue;
            dummy.position.set(cx * cs, wallH + 0.78, cy * cs);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(watchScaleXZ, 1, watchScaleXZ);
            dummy.updateMatrix();
            towerInst.setMatrixAt(tCount++, dummy.matrix);
        }
        towerInst.count = tCount;
        if (tCount > 0) {
            towerInst.instanceMatrix.needsUpdate = true;
            grp.add(towerInst);
        }

        d3d.scene.add(grp);
        d3d._townArchGroup = grp;
        d3d._townArchSig = sig;
        return true;
    }

    const Dungeon3DTown = {
        computeTownClusters,
        buildTownArchitecture,
        disposeTownArchitecture,
        syncTownSharedMaterials
    };

    if (typeof root.DungeonRenderer === 'function') {
        root.DungeonRenderer.prototype.buildTownArchitecture = function (map, w, h, depth, realm, px, py, maxTileDist) {
            return buildTownArchitecture(this, map, w, h, depth, realm, px, py, maxTileDist);
        };
        root.DungeonRenderer.prototype.disposeTownArchitecture = function () {
            return disposeTownArchitecture(this);
        };
    } else if (typeof root.Dungeon3D === 'function') {
        root.Dungeon3D.prototype.buildTownArchitecture = function (map, w, h, depth, realm, px, py, maxTileDist) {
            return buildTownArchitecture(this, map, w, h, depth, realm, px, py, maxTileDist);
        };
        root.Dungeon3D.prototype.disposeTownArchitecture = function () {
            return disposeTownArchitecture(this);
        };
    }

    root.Dungeon3DTown = Dungeon3DTown;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Dungeon3DTown;
    }
})(typeof window !== 'undefined' ? window : globalThis);

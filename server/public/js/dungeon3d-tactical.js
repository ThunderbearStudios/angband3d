/**
 * dungeon3d-tactical.js — YASD 3D v12.0 Spatial Tactical Cursors, Range Grids,
 * Flank Threat Arcs, Floor Spiral Layout & Zero-GC Procedural Locomotion.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Dungeon3DTactical = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Module-level singletons & scratch objects for ZERO-GC per-frame execution
    const _scratchVecA = (typeof THREE !== 'undefined' && THREE.Vector3) ? new THREE.Vector3() : null;
    const _scratchVecB = (typeof THREE !== 'undefined' && THREE.Vector3) ? new THREE.Vector3() : null;
    const _scratchVecCam = (typeof THREE !== 'undefined' && THREE.Vector3) ? new THREE.Vector3() : null;
    const _scratchEuler = (typeof THREE !== 'undefined' && THREE.Euler) ? new THREE.Euler() : null;

    let _altKeyHeld = false;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Alt') _altKeyHeld = true;
        }, { passive: true });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') _altKeyHeld = false;
        }, { passive: true });
        window.addEventListener('blur', () => {
            _altKeyHeld = false;
        }, { passive: true });
    }

    /**
     * Bresenham raycasting helper between two 2D grid coordinates.
     */
    function bresenhamLine(x0, y0, x1, y1) {
        const points = [];
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;
        let currX = x0;
        let currY = y0;

        while (true) {
            points.push({ x: currX, y: currY });
            if (currX === x1 && currY === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                currX += sx;
            }
            if (e2 < dx) {
                err += dx;
                currY += sy;
            }
        }
        return points;
    }

    const Dungeon3DTactical = {
        isAltHeld() {
            return _altKeyHeld;
        },

        // =========================================================================
        // 1. ARCHITECTURAL VERTICALITY & FIGURE-GROUND SILHOUETTES
        // =========================================================================

        /**
         * Classifies floor tile verticality (100% watertight 2-course architecture):
         * - 3.0m ceiling in doorways/archways and corridors (matches doorFrameGeo top at 3.00m)
         * - 4.2m ceiling with upper ashlar tier in standard rooms
         * - 5.6m cathedral ceiling (< 2 * 3.0m) in Vaults & deep rooms (depth >= 30 or vault rooms)
         */
        classifyTileVerticality(map, w, h, x, y, isRoom, depth, realm) {
            if (map && map.rows && map.rows[y] && map.rows[y].f) {
                const curFeat = parseInt(map.rows[y].f.substr(x * 2, 2), 16) || 0;
                const curGlyph = (map.rows[y].g && x < map.rows[y].g.length) ? map.rows[y].g[x] : ' ';
                const isSilQForge = (curFeat === 60 || (realm === 'silq' && curGlyph === '0'));
                if (curFeat === 2 || curFeat === 3 || (curFeat === 4 && curGlyph !== '^') || (curFeat >= 32 && curFeat <= 40 && !isSilQForge)) {
                    return { type: 'corridor', ceilingHeight: 3.0, hasCornice: false, hasPillar: false };
                }
            }

            if (!isRoom) {
                return { type: 'corridor', ceilingHeight: 3.0, hasCornice: false, hasPillar: false };
            }

            const isVaultRoom = Boolean(depth >= 30 || (map && typeof map.isVaultTile === 'function' && map.isVaultTile(x, y)));
            if (isVaultRoom) {
                return {
                    type: 'vault',
                    ceilingHeight: 5.6,
                    hasCornice: true,
                    hasPillar: ((x % 4 === 0) && (y % 4 === 0))
                };
            }

            return {
                type: 'room',
                ceilingHeight: 4.2,
                hasCornice: true,
                hasPillar: false
            };
        },

        getCeilingHeight(dungeon3d, x, y, isRoom, depth) {
            if (dungeon3d && dungeon3d._levelRoomCeilCache && x >= 0 && y >= 0 && x < dungeon3d._levelMemW && y < dungeon3d._levelMemH) {
                const cached = dungeon3d._levelRoomCeilCache[y * dungeon3d._levelMemW + x];
                if (cached > 0) return cached;
            }
            const map = dungeon3d ? dungeon3d.lastMap : null;
            const w = map ? (map.w || (map.rows && map.rows[0] && map.rows[0].f ? map.rows[0].f.length / 2 : 0)) : 80;
            const h = map ? (map.h || (map.rows ? map.rows.length : 0)) : 24;
            const vert = this.classifyTileVerticality(map, w, h, x, y, isRoom, depth, dungeon3d ? dungeon3d.realm : '');
            return vert.ceilingHeight;
        },

        resetLevelMemory(d3d) {
            if (!d3d) return;
            d3d._levelMemKey = '';
            d3d._levelMemW = 0;
            d3d._levelMemH = 0;
            d3d._levelMemTotal = 0;
            d3d._prevLiveKnownCount = 0;
            d3d._levelTileMemory = null;
            d3d._levelRoomCeilCache = null;
            d3d._tileSmoothVis = null;
            d3d._tileTargetVis = null;
            d3d._hasUnsettledTileVis = false;
            d3d._visBindCount = 0;
        },

        getRememberedTile(d3d, x, y) {
            if (!d3d || !d3d._levelTileMemory || x < 0 || y < 0 || x >= d3d._levelMemW || y >= d3d._levelMemH) {
                return null;
            }
            return d3d._levelTileMemory[y * d3d._levelMemW + x] || null;
        },

        syncLevelVisibilityAndRooms(d3d, map, w, h, depth, realm, outdoors, px = 0, py = 0) {
            if (!d3d || !map || !map.rows || w <= 0 || h <= 0) return;
            const total = w * h;
            const rKey = String(realm || d3d.realm || 'angband').toLowerCase();
            const levelKey = `${rKey}:${depth}:${w}:${h}`;
            const torchR = Math.max(1, Number(d3d.torchRadius) || 1);
            const torchDistSq = (torchR + 1) * (torchR + 1);

            let liveKnownCount = 0;
            if (!outdoors) {
                for (let y = 0; y < h; y++) {
                    const row = map.rows[y];
                    if (!row || !row.f) continue;
                    const flgStr = row.l || row.flags || '';
                    for (let x = 0; x < w; x++) {
                        const flg = x < flgStr.length ? (parseInt(flgStr[x], 16) || 0) : 0;
                        if ((flg & 0x3) === 0) continue;
                        const fi = x * 2;
                        if (fi + 1 < row.f.length && (row.f[fi] !== '0' || row.f[fi + 1] !== '0')) {
                            liveKnownCount++;
                        }
                    }
                }
            }

            const playerObj = (d3d.lastFrame && d3d.lastFrame.player) ? d3d.lastFrame.player : null;
            const isBlind = this.isPlayerBlind(playerObj);
            const isAmnesia = (!isBlind && !outdoors && levelKey === d3d._levelMemKey && d3d._prevLiveKnownCount > 24 && liveKnownCount < d3d._prevLiveKnownCount * 0.65);
            const isNewLevel = (levelKey !== d3d._levelMemKey || total !== d3d._levelMemTotal || !d3d._levelTileMemory || isAmnesia);
            if (isNewLevel) {
                d3d._levelMemKey = levelKey;
                d3d._levelMemW = w;
                d3d._levelMemH = h;
                d3d._levelMemTotal = total;
                d3d._levelTileMemory = new Array(total).fill(null);
                d3d._levelRoomCeilCache = new Float32Array(total);
                d3d._tileSmoothVis = new Float32Array(total);
                d3d._tileTargetVis = new Float32Array(total);
                d3d._bfsVisited = new Uint8Array(total);
                d3d._bfsQueue = new Int32Array(total);
                d3d._bfsComp = new Int32Array(total);
                d3d._prevLiveKnownCount = 0;
            }
            if (!outdoors && !isBlind && liveKnownCount > d3d._prevLiveKnownCount) {
                d3d._prevLiveKnownCount = liveKnownCount;
            }

            const memArr = d3d._levelTileMemory;
            const targetVis = d3d._tileTargetVis;
            const smoothVis = d3d._tileSmoothVis;
            let hasUnsettled = false;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    if (outdoors) {
                        const dSqOut = (x - px) * (x - px) + (y - py) * (y - py);
                        const outVis = isBlind ? (dSqOut === 0 ? 0.24 : (dSqOut <= 2 ? 0.12 : 0.02)) : 1.0;
                        targetVis[idx] = outVis;
                        if (isNewLevel) smoothVis[idx] = outVis;
                        else if (Math.abs(smoothVis[idx] - outVis) > 0.004) hasUnsettled = true;
                        continue;
                    }
                    const flag = d3d.getFlagAt(map, x, y);
                    const known = (flag & 0x1) !== 0;
                    const inView = (flag & 0x2) !== 0;
                    const rawLighting = (flag >> 2) & 0x3;
                    const rawFeat = d3d.getFeatAt(map, x, y);

                    // STRICT ROGUELIKE INVARIANT: only record when engine sends rawFeat !== 0 && (known || inView)
                    if (rawFeat !== 0 && (known || inView)) {
                        const g = typeof d3d.getGlyphAt === 'function' ? d3d.getGlyphAt(map, x, y) : ((map.rows[y] && map.rows[y].g && map.rows[y].g[x]) || ' ');
                        const a = typeof d3d.getAttrAt === 'function' ? d3d.getAttrAt(map, x, y) : 1;
                        const prev = memArr[idx];
                        const isGlow = (!isBlind && rawLighting === 2 && (inView || rKey !== 'angband'))
                            ? true
                            : ((!inView || isBlind) && prev ? prev.isGlow : false);
                        if (prev) {
                            prev.feat = rawFeat;
                            prev.glyph = g;
                            prev.attr = a;
                            prev.isGlow = isGlow;
                        } else {
                            memArr[idx] = { feat: rawFeat, glyph: g, attr: a, isGlow };
                        }
                    }

                    const dSq = (x - px) * (x - px) + (y - py) * (y - py);
                    let tVis;
                    if (isBlind) {
                        // Tactile underfoot ring: feel own tile (0.24) and bumped adjacent walls/doors (0.14), shroud beyond
                        const hasAnyData = (rawFeat !== 0 && (known || inView)) || memArr[idx] !== null;
                        tVis = !hasAnyData ? 0.0 : (dSq === 0 ? 0.24 : (dSq === 1 ? 0.15 : (dSq <= 2 ? 0.08 : 0.02)));
                    } else {
                        const isActivelyLit = inView && rawFeat !== 0 && (rawLighting < 3 || dSq <= torchDistSq);
                        tVis = isActivelyLit
                            ? 1.0
                            : (((inView && rawFeat !== 0) || (known && rawFeat !== 0) || memArr[idx] !== null) ? 0.38 : 0.0);
                    }
                    targetVis[idx] = tVis;
                    if (isNewLevel) {
                        smoothVis[idx] = tVis;
                    } else if (Math.abs(smoothVis[idx] - tVis) > 0.004) {
                        hasUnsettled = true;
                    }
                }
            }

            if (hasUnsettled) {
                d3d._hasUnsettledTileVis = true;
                if (d3d.renderGovernor) d3d.renderGovernor.wake(450);
            }

            if (outdoors) return;

            // Uniform Connected-Room Ceiling Flood-Fill & Latch (_levelRoomCeilCache)
            const ceilCache = d3d._levelRoomCeilCache;
            const visited = d3d._bfsVisited;
            const queue = d3d._bfsQueue;
            const comp = d3d._bfsComp;
            visited.fill(0);

            const getEffFeat = (tx, ty) => {
                if (tx < 0 || ty < 0 || tx >= w || ty >= h) return 22;
                const ti = ty * w + tx;
                const fl = d3d.getFlagAt(map, tx, ty);
                const rf = ((fl & 0x3) !== 0) ? d3d.getFeatAt(map, tx, ty) : 0;
                if (rf !== 0) return rf;
                return memArr[ti] ? memArr[ti].feat : 0;
            };
            const getEffGlyph = (tx, ty) => {
                if (tx < 0 || ty < 0 || tx >= w || ty >= h) return ' ';
                const ti = ty * w + tx;
                const fl = d3d.getFlagAt(map, tx, ty);
                if ((fl & 0x3) !== 0 && d3d.getFeatAt(map, tx, ty) !== 0) {
                    return typeof d3d.getGlyphAt === 'function' ? d3d.getGlyphAt(map, tx, ty) : ((map.rows[ty] && map.rows[ty].g && map.rows[ty].g[tx]) || ' ');
                }
                return memArr[ti] ? memArr[ti].glyph : ' ';
            };
            const isRoomInteriorWalkable = (f, g) => {
                if (f <= 0) return false;
                const isForge = (f === 60 || (rKey === 'silq' && g === '0'));
                if (isForge) return true;
                if (f === 2 || f === 3 || (f === 4 && g !== '^' && !(rKey === 'brogue' && g !== "'" && g !== '+')) || (f >= 32 && f <= 40)) return false;
                if ((f >= 15 && f <= 22 && f !== 16) || f === 30) return false;
                return true;
            };

            for (let sy = 0; sy < h; sy++) {
                for (let sx = 0; sx < w; sx++) {
                    const sIdx = sy * w + sx;
                    if (visited[sIdx]) continue;
                    const sf = getEffFeat(sx, sy);
                    const sg = getEffGlyph(sx, sy);
                    if (!isRoomInteriorWalkable(sf, sg)) {
                        visited[sIdx] = 1;
                        if (sf === 2 || sf === 3 || (sf === 4 && sg !== '^') || (sf >= 32 && sf <= 40)) {
                            ceilCache[sIdx] = 3.0;
                        }
                        continue;
                    }

                    let qHead = 0, qTail = 0, compLen = 0;
                    visited[sIdx] = 1;
                    queue[qTail++] = sIdx;
                    let hasRoomSeed = false;
                    let hasExplicitVault = (depth >= 30);
                    let interiorPermWalls = 0;

                    while (qHead < qTail) {
                        const cur = queue[qHead++];
                        comp[compLen++] = cur;
                        const cx = cur % w;
                        const cy = (cur / w) | 0;

                        if (ceilCache[cur] >= 4.1) hasRoomSeed = true;
                        if (ceilCache[cur] >= 5.5) hasExplicitVault = true;
                        if (!hasExplicitVault && typeof map.isVaultTile === 'function' && map.isVaultTile(cx, cy)) {
                            hasExplicitVault = true;
                        }

                        const cFlag = d3d.getFlagAt(map, cx, cy);
                        const cInView = (cFlag & 0x2) !== 0;
                        const cLight = (cFlag >> 2) & 0x3;
                        const cMem = memArr[cur];
                        // Vanilla WASM sets lighting=2 on !inView dark corridors; trust lighting===2 when inView or non-Vanilla
                        if ((cInView && cLight === 2) || (rKey !== 'angband' && ((cFlag & 0x1) !== 0 && cLight === 2 || (cMem && cMem.isGlow)))) {
                            hasRoomSeed = true;
                        }

                        let open3x3 = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = cx + dx, ny = cy + dy;
                                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                                const nf = getEffFeat(nx, ny);
                                const ng = getEffGlyph(nx, ny);
                                if (isRoomInteriorWalkable(nf, ng)) {
                                    open3x3++;
                                    if (dx === 0 || dy === 0) {
                                        const nIdx = ny * w + nx;
                                        if (!visited[nIdx]) {
                                            visited[nIdx] = 1;
                                            queue[qTail++] = nIdx;
                                        }
                                    }
                                } else if ((dx === 0 || dy === 0) && nf === 22 && nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1) {
                                    interiorPermWalls++;
                                }
                            }
                        }
                        if (open3x3 >= 6) hasRoomSeed = true;
                    }

                    const roomH = hasRoomSeed
                        ? ((hasExplicitVault || (compLen >= 6 && interiorPermWalls >= 6)) ? 5.6 : 4.2)
                        : 3.0;
                    for (let i = 0; i < compLen; i++) {
                        const ti = comp[i];
                        if (roomH > ceilCache[ti]) ceilCache[ti] = roomH;
                    }
                }
            }
        },

        resetVisBindings(d3d, meshes) {
            if (!d3d) return;
            d3d._visMeshes = meshes;
            const cap = 40960;
            if (!d3d._visBindMeshIdx || d3d._visBindMeshIdx.length < cap) {
                d3d._visBindMeshIdx = new Uint8Array(cap);
                d3d._visBindInstIdx = new Uint16Array(cap);
                d3d._visBindTileIdx = new Int32Array(cap);
                d3d._visBindBaseRGB = new Float32Array(cap * 3);
            }
            d3d._visBindCount = 0;
        },

        bindVisColor(d3d, meshSlot, mesh, instIdx, tileIdx, baseCol, outdoors) {
            if (!mesh) return;
            const blindOutdoors = Boolean(outdoors && d3d && (this.isPlayerBlind(d3d.lastFrame && d3d.lastFrame.player) || (d3d._blindFactor || 0) > 0.01));
            if ((outdoors && !blindOutdoors) || !d3d || !d3d._tileSmoothVis || tileIdx < 0 || tileIdx >= d3d._tileSmoothVis.length) {
                mesh.setColorAt(instIdx, baseCol);
                return;
            }
            const vis = d3d._tileSmoothVis[tileIdx];
            const cool = 1.0 - Math.max(0, Math.min(1, (vis - 0.38) / 0.62));
            const cr = baseCol.r * vis * (1.0 - cool * 0.10);
            const cg = baseCol.g * vis * (1.0 - cool * 0.04);
            const cb = baseCol.b * vis * (1.0 + cool * 0.12);
            if (!d3d._scratchVisCol) d3d._scratchVisCol = new THREE.Color();
            d3d._scratchVisCol.setRGB(cr, cg, cb);
            mesh.setColorAt(instIdx, d3d._scratchVisCol);

            const bIdx = d3d._visBindCount;
            if (bIdx < d3d._visBindMeshIdx.length) {
                d3d._visBindMeshIdx[bIdx] = meshSlot;
                d3d._visBindInstIdx[bIdx] = instIdx;
                d3d._visBindTileIdx[bIdx] = tileIdx;
                const b3 = bIdx * 3;
                d3d._visBindBaseRGB[b3] = baseCol.r;
                d3d._visBindBaseRGB[b3 + 1] = baseCol.g;
                d3d._visBindBaseRGB[b3 + 2] = baseCol.b;
                d3d._visBindCount = bIdx + 1;
            }
        },

        tickSmoothVisibility(d3d, delta) {
            if (!d3d || !d3d._hasUnsettledTileVis || !d3d._tileSmoothVis || !d3d._tileTargetVis) return false;
            const smooth = d3d._tileSmoothVis;
            const target = d3d._tileTargetVis;
            const len = smooth.length;
            const alpha = 1.0 - Math.exp(-11.0 * delta);
            let stillUnsettled = false;
            let anyStepped = false;

            for (let i = 0; i < len; i++) {
                const t = target[i];
                const s = smooth[i];
                const diff = t - s;
                if (diff > 0.003 || diff < -0.003) {
                    const next = s + diff * alpha;
                    if (Math.abs(t - next) <= 0.004) {
                        smooth[i] = t;
                    } else {
                        smooth[i] = next;
                        stillUnsettled = true;
                    }
                    anyStepped = true;
                } else if (s !== t) {
                    smooth[i] = t;
                    anyStepped = true;
                }
            }

            if (anyStepped && d3d._visMeshes && d3d._visBindCount > 0) {
                const meshes = d3d._visMeshes;
                const mIdxArr = d3d._visBindMeshIdx;
                const iIdxArr = d3d._visBindInstIdx;
                const tIdxArr = d3d._visBindTileIdx;
                const rgbArr = d3d._visBindBaseRGB;
                const count = d3d._visBindCount;
                let dirtyMask = 0;

                for (let b = 0; b < count; b++) {
                    const mSlot = mIdxArr[b];
                    const mesh = meshes[mSlot];
                    if (!mesh || !mesh.instanceColor) continue;
                    const tIdx = tIdxArr[b];
                    const vis = smooth[tIdx];
                    const cool = 1.0 - Math.max(0, Math.min(1, (vis - 0.38) / 0.62));
                    const b3 = b * 3;
                    const cArr = mesh.instanceColor.array;
                    const c3 = iIdxArr[b] * 3;
                    cArr[c3] = rgbArr[b3] * vis * (1.0 - cool * 0.10);
                    cArr[c3 + 1] = rgbArr[b3 + 1] * vis * (1.0 - cool * 0.04);
                    cArr[c3 + 2] = rgbArr[b3 + 2] * vis * (1.0 + cool * 0.12);
                    dirtyMask |= (1 << (mSlot & 31));
                    mesh._visColorTouched = true;
                }
                if (dirtyMask !== 0) {
                    for (let m = 0; m < meshes.length; m++) {
                        const mesh = meshes[m];
                        if (mesh && mesh._visColorTouched) {
                            mesh._visColorTouched = false;
                            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                        }
                    }
                }
            }

            d3d._hasUnsettledTileVis = stillUnsettled;
            return stillUnsettled;
        },

        computeThresholdYOffset(d3d, feat, glyph, outdoors) {
            const isSilQForge = (feat === 60 || (d3d && d3d.realm === 'silq' && glyph === '0'));
            if (feat === 5) return 0.18;
            if (feat === 6) return -0.12;
            if (feat === 43 || feat === 44 || isSilQForge) return 0.22;
            if ((feat >= 7 && feat <= 14 && outdoors) || (feat >= 32 && feat <= 40 && !isSilQForge)) return 0.08;
            return 0.0;
        },

        checkThresholdProximity(d3d) {
            if (!d3d || !d3d.camera || !d3d.lastMap) return false;
            const map = d3d.lastMap;
            const w = map.w || 0;
            const h = map.h || 0;
            if (w <= 0 || h <= 0) return false;
            const cs = d3d.cellSize || 2.0;
            const camX = d3d.camera.position.x;
            const camZ = d3d.camera.position.z;
            const cx = Math.round(camX / cs);
            const cy = Math.round(camZ / cs);
            const outdoors = (d3d.lastDepth === 0);
            let mask = 0;
            let bit = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++, bit++) {
                    const tx = cx + dx, ty = cy + dy;
                    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
                    const f = d3d.getFeatAt(map, tx, ty);
                    const g = d3d.getGlyphAt(map, tx, ty);
                    const isForge = (f === 60 || (d3d.realm === 'silq' && g === '0'));
                    const isShop = ((f >= 7 && f <= 14 && outdoors) || (f >= 32 && f <= 40 && !isForge));
                    const isMon = (f === 43 || f === 44 || isForge || f === 42 || (f === 4 && d3d.realm === 'brogue' && g !== "'" && g !== '+'));
                    if (f !== 5 && !isShop && !isMon) continue;
                    const ddx = camX - tx * cs;
                    const ddz = camZ - ty * cs;
                    const rSq = (f === 5 || isShop) ? 1.1025 : 0.5625;
                    if (ddx * ddx + ddz * ddz < rSq) mask |= (1 << bit);
                }
            }
            if (mask !== (d3d._lastCamProxMask || 0)) {
                d3d._lastCamProxMask = mask;
                return true;
            }
            return false;
        },

        purgeSceneVfxAndLabels(d3d) {
            if (!d3d) return;
            this.resetLevelMemory(d3d);
            d3d._lastTerrainSig = null;
            d3d._lastStorefrontPropsSig = null;
            d3d._lastCamProxMask = 0;
            if (d3d.navBreadcrumbsMesh) d3d.navBreadcrumbsMesh.count = 0;
            if (d3d.navCursorGroup) d3d.navCursorGroup.visible = false;
            d3d._hoveredTile = null;
            if (d3d._flankArcsOverlay) d3d._flankArcsOverlay.innerHTML = '';
            d3d._lastFlankSig = '';

            if (d3d.storefrontPropsGroup) {
                while (d3d.storefrontPropsGroup.children.length > 0) {
                    const ch = d3d.storefrontPropsGroup.children[0];
                    d3d.storefrontPropsGroup.remove(ch);
                    ch.traverse((c) => {
                        if (c.material && !c.material._sharedMaterial && typeof c.material.dispose === 'function') {
                            c.material.dispose();
                        }
                    });
                }
            }
            if (d3d._terrainLabelSprites) {
                for (const [, sprite] of d3d._terrainLabelSprites.entries()) {
                    if (d3d.terrainLabelsGroup) d3d.terrainLabelsGroup.remove(sprite);
                    if (sprite._ownedSignTexture) sprite._ownedSignTexture.dispose();
                    if (sprite._ownedSignMaterial) sprite._ownedSignMaterial.dispose();
                    if (sprite._ownedRoofSpriteMat) sprite._ownedRoofSpriteMat.dispose();
                    if (sprite.material) {
                        if (sprite.material.map) sprite.material.map.dispose();
                        sprite.material.dispose();
                    }
                }
                d3d._terrainLabelSprites.clear();
            }
            if (Array.isArray(d3d.activeProjectiles)) {
                for (let i = 0; i < d3d.activeProjectiles.length; i++) {
                    const proj = d3d.activeProjectiles[i];
                    if (proj && proj.group && d3d.scene) d3d.scene.remove(proj.group);
                    if (proj && Array.isArray(proj.disposables)) {
                        for (const disp of proj.disposables) {
                            if (disp && typeof disp.dispose === 'function') disp.dispose();
                        }
                    }
                }
                d3d.activeProjectiles.length = 0;
            }
            if (Array.isArray(d3d.particles)) {
                for (let i = 0; i < d3d.particles.length; i++) {
                    const p = d3d.particles[i];
                    if (p && p.group && d3d.scene) d3d.scene.remove(p.group);
                    if (p && p.material) p.material.dispose();
                    if (p && p.ringMat) p.ringMat.dispose();
                }
                d3d.particles.length = 0;
            }
            if (Array.isArray(d3d.floatingTexts)) {
                for (let i = 0; i < d3d.floatingTexts.length; i++) {
                    const ft = d3d.floatingTexts[i];
                    if (ft && ft.sprite && d3d.scene) d3d.scene.remove(ft.sprite);
                    if (ft && ft.material) {
                        if (ft.material.map && !ft.material.map._cachedFloatingTex) ft.material.map.dispose();
                        ft.material.dispose();
                    }
                }
                d3d.floatingTexts.length = 0;
            }
            if (d3d.vfxFlashLight) d3d.vfxFlashLight.intensity = 0;
            if (d3d._vfxFlashState) d3d._vfxFlashState.active = false;
            if (Array.isArray(d3d._vfxLights)) {
                for (const l of d3d._vfxLights) {
                    if (l && d3d.scene) d3d.scene.remove(l);
                }
                d3d._vfxLights.length = 0;
            }
        },

        // =========================================================================
        // 2. 3D TACTICAL RANGE GRID & BLAST-RADIUS CURSOR (ui.cursor)
        // =========================================================================

        initTacticalCursor(d3d) {
            if (d3d._tacticalCursorInitialized) return;
            d3d._tacticalCursorInitialized = true;

            const group = new THREE.Group();
            group.name = 'TacticalCursorGroup';
            group.visible = false;

            // Arcane ground ring decal (pulsing gold/amber or emerald)
            const ringGeo = new THREE.RingGeometry(0.35, 0.48, 32);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x10b981,
                transparent: true,
                opacity: 0.85,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.set(0, 0.038, 0);
            group.add(ringMesh);

            // Inner rune crosshair
            const crossGeo = new THREE.RingGeometry(0.04, 0.12, 16);
            crossGeo.rotateX(-Math.PI / 2);
            const crossMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const crossMesh = new THREE.Mesh(crossGeo, crossMat);
            crossMesh.position.set(0, 0.040, 0);
            group.add(crossMesh);

            // Blast radius ground decal ring
            const blastGeo = new THREE.RingGeometry(0.9, 1.0, 48);
            blastGeo.rotateX(-Math.PI / 2);
            const blastMat = new THREE.MeshBasicMaterial({
                color: 0xf59e0b,
                transparent: true,
                opacity: 0.45,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const blastMesh = new THREE.Mesh(blastGeo, blastMat);
            blastMesh.position.set(0, 0.035, 0);
            blastMesh.visible = false;
            group.add(blastMesh);

            // Trajectory ray LineSegments (LOS path)
            const maxRaySegments = 64;
            const rayPositions = new Float32Array(maxRaySegments * 2 * 3);
            const rayGeo = new THREE.BufferGeometry();
            rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
            const rayMat = new THREE.LineBasicMaterial({
                color: 0x10b981,
                transparent: true,
                opacity: 0.88,
                linewidth: 2
            });
            const rayLine = new THREE.LineSegments(rayGeo, rayMat);
            group.add(rayLine);

            // Chebyshev 1-tile Range Grid overlay
            const gridGeo = new THREE.BufferGeometry();
            const gridPositions = new Float32Array(32 * 32 * 8 * 3); // subtle grid lines
            gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPositions, 3));
            const gridMat = new THREE.LineBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.28,
                depthWrite: false
            });
            const gridLines = new THREE.LineSegments(gridGeo, gridMat);
            gridLines.visible = false;
            group.add(gridLines);

            d3d._tacticalCursor = {
                group,
                ringMesh,
                ringMat,
                crossMesh,
                crossMat,
                blastMesh,
                blastMat,
                rayLine,
                rayGeo,
                rayMat,
                gridLines,
                gridGeo,
                gridMat,
                _lastRaySig: '',
                _lastGridSig: ''
            };

            d3d.scene.add(group);
        },

        updateTacticalCursor(d3d, frame, delta = 0.016) {
            if (!d3d) return;
            this.initTacticalCursor(d3d);
            const tc = d3d._tacticalCursor;
            if (!tc) return;

            const cursor = (frame && frame.ui && frame.ui.cursor) || null;
            const px = (frame && frame.player && frame.player.x !== undefined) ? frame.player.x : 0;
            const py = (frame && frame.player && frame.player.y !== undefined) ? frame.player.y : 0;
            const cellSize = d3d.cellSize || 2.0;

            const isAlt = _altKeyHeld;
            const isCursorActive = Boolean(cursor && cursor.active);

            // Range grid visibility: visible when cursor is active OR Alt key held
            const showRangeGrid = isCursorActive || isAlt;
            tc.gridLines.visible = showRangeGrid;

            if (showRangeGrid) {
                const gridSig = `${px}_${py}_${showRangeGrid}`;
                if (tc._lastGridSig !== gridSig) {
                    tc._lastGridSig = gridSig;
                    const r = 10; // 10-tile Chebyshev range
                    const posArr = tc.gridGeo.attributes.position.array;
                    let vIdx = 0;
                    for (let dx = -r; dx <= r; dx++) {
                        const gx = (px + dx) * cellSize;
                        // North-south line segment
                        posArr[vIdx++] = gx - cellSize * 0.5;
                        posArr[vIdx++] = 0.022;
                        posArr[vIdx++] = (py - r) * cellSize - cellSize * 0.5;
                        posArr[vIdx++] = gx - cellSize * 0.5;
                        posArr[vIdx++] = 0.022;
                        posArr[vIdx++] = (py + r) * cellSize + cellSize * 0.5;
                    }
                    for (let dy = -r; dy <= r; dy++) {
                        const gz = (py + dy) * cellSize;
                        // East-west line segment
                        posArr[vIdx++] = (px - r) * cellSize - cellSize * 0.5;
                        posArr[vIdx++] = 0.022;
                        posArr[vIdx++] = gz - cellSize * 0.5;
                        posArr[vIdx++] = (px + r) * cellSize + cellSize * 0.5;
                        posArr[vIdx++] = 0.022;
                        posArr[vIdx++] = gz - cellSize * 0.5;
                    }
                    tc.gridGeo.attributes.position.needsUpdate = true;
                    tc.gridGeo.setDrawRange(0, vIdx / 3);
                }
            }

            if (!isCursorActive) {
                tc.ringMesh.visible = false;
                tc.crossMesh.visible = false;
                tc.blastMesh.visible = false;
                tc.rayLine.visible = false;
                tc.group.visible = showRangeGrid;
                return;
            }

            tc.group.visible = true;
            tc.ringMesh.visible = true;
            tc.crossMesh.visible = true;

            const tx = cursor.x !== undefined ? cursor.x : px;
            const ty = cursor.y !== undefined ? cursor.y : py;
            const hasLos = Boolean(cursor.has_los ?? cursor.los ?? true);
            const blastRad = Number(cursor.blast_rad) || 0;

            const wx = tx * cellSize;
            const wz = ty * cellSize;
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() * 0.001 : Date.now() * 0.001;

            // Arcane ground ring position & pulse
            tc.ringMesh.position.set(wx, 0.038, wz);
            tc.crossMesh.position.set(wx, 0.040, wz);
            const pulse = 0.75 + Math.sin(now * 5.0) * 0.20;
            const targetColorHex = hasLos ? 0x10b981 : 0xf59e0b; // Emerald vs Amber
            tc.ringMat.color.setHex(targetColorHex);
            tc.ringMat.opacity = pulse;

            // Blast radius ground decal
            if (blastRad > 0) {
                tc.blastMesh.visible = true;
                tc.blastMesh.position.set(wx, 0.034, wz);
                const visualRad = Math.max(0.6, blastRad * cellSize);
                tc.blastMesh.scale.set(visualRad, visualRad, visualRad);
                tc.blastMat.opacity = 0.35 + Math.sin(now * 3.5) * 0.12;
            } else {
                tc.blastMesh.visible = false;
            }

            // Trajectory ray line
            const raySig = `${px}_${py}_${tx}_${ty}_${hasLos}`;
            if (tc._lastRaySig !== raySig) {
                tc._lastRaySig = raySig;
                const pts = bresenhamLine(px, py, tx, ty);
                const rayPos = tc.rayGeo.attributes.position.array;
                let rIdx = 0;
                for (let i = 0; i < pts.length - 1; i++) {
                    const p1 = pts[i];
                    const p2 = pts[i + 1];
                    rayPos[rIdx++] = p1.x * cellSize;
                    rayPos[rIdx++] = 0.16;
                    rayPos[rIdx++] = p1.y * cellSize;
                    rayPos[rIdx++] = p2.x * cellSize;
                    rayPos[rIdx++] = 0.16;
                    rayPos[rIdx++] = p2.y * cellSize;
                }
                tc.rayGeo.attributes.position.needsUpdate = true;
                tc.rayGeo.setDrawRange(0, rIdx / 3);
                tc.rayMat.color.setHex(targetColorHex);
            }
            tc.rayLine.visible = (px !== tx || py !== ty);
        },

        // =========================================================================
        // 3. SCREEN-EDGE DIRECTIONAL THREAT ARCS & COMPASS PIPS
        // =========================================================================

        initFlankArcs(d3d) {
            if (d3d._flankArcsOverlay || typeof document === 'undefined') return;
            let overlay = document.getElementById('dungeon3d-flank-arcs');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'dungeon3d-flank-arcs';
                overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:90;overflow:hidden;';
                const parent = (d3d.renderer && d3d.renderer.domElement && d3d.renderer.domElement.parentElement) || document.body;
                parent.appendChild(overlay);
            }
            d3d._flankArcsOverlay = overlay;
            d3d._lastFlankSig = '';
        },

        updateFlankThreatArcs(d3d, frame, camera) {
            if (!d3d || !camera) return;
            this.initFlankArcs(d3d);
            const overlay = d3d._flankArcsOverlay;
            if (!frame || (frame.phase && frame.phase !== 'play')) {
                if (overlay && d3d._lastFlankSig !== '') {
                    overlay.innerHTML = '';
                }
                d3d._lastFlankSig = '';
                return;
            }
            const compass = (typeof document !== 'undefined') ? document.getElementById('compass-canvas') : null;

            const monsters = (frame && Array.isArray(frame.monsters)) ? frame.monsters : [];
            const px = (frame && frame.player && frame.player.x !== undefined) ? frame.player.x : (d3d.playerGridX || 0);
            const py = (frame && frame.player && frame.player.y !== undefined) ? frame.player.y : (d3d.playerGridY || 0);

            // Camera heading and view frustum
            camera.getWorldDirection(_scratchVecCam);
            const camAngle = Math.atan2(_scratchVecCam.x, _scratchVecCam.z);

            const threats = [];
            let flankSigParts = [];

            for (let i = 0; i < monsters.length; i++) {
                const m = monsters[i];
                if (!m || m.visible === false || m.asleep || m.afraid) continue;
                if (m.isPet || m.is_pet || m.pet || m.friendly || m.peaceful || m.attitude === 'pet' || m.attitude === 'friendly') continue;
                const mdx = m.x - px;
                const mdy = m.y - py;
                const distSq = mdx * mdx + mdy * mdy;
                if (distSq > 144 || (mdx === 0 && mdy === 0)) continue; // within 12 tiles

                const mAngle = Math.atan2(mdx, mdy);
                let relAngle = mAngle - camAngle;
                while (relAngle > Math.PI) relAngle -= Math.PI * 2;
                while (relAngle < -Math.PI) relAngle += Math.PI * 2;

                // Monsters outside ~70° camera half-FOV (+- 1.22 rad) are flanking threats
                const isOutsideFov = Math.abs(relAngle) > 1.22;
                if (isOutsideFov) {
                    const isAdjacent = distSq <= 2.25;
                    threats.push({
                        relAngle,
                        isAdjacent,
                        dist: Math.sqrt(distSq),
                        name: m.name || m.race || 'monster'
                    });
                    flankSigParts.push(`${Math.round(relAngle * 10)}_${isAdjacent ? 'adj' : 'rng'}`);
                }
            }

            const newFlankSig = flankSigParts.join('|');
            if (d3d._lastFlankSig === newFlankSig) return;
            d3d._lastFlankSig = newFlankSig;

            // Update DOM Overlay (Zero GC: modify innerHTML only on signature change)
            if (overlay) {
                if (threats.length === 0) {
                    overlay.innerHTML = '';
                } else {
                    let html = '';
                    for (let i = 0; i < threats.length; i++) {
                        const t = threats[i];
                        const col = t.isAdjacent ? 'rgba(239, 68, 68, 0.85)' : 'rgba(245, 158, 11, 0.70)';
                        const glow = t.isAdjacent ? '0 0 16px rgba(239, 68, 68, 0.9)' : '0 0 10px rgba(245, 158, 11, 0.7)';
                        // Map relative angle to screen edge
                        if (t.relAngle < -1.22 && t.relAngle >= -2.35) {
                            // Left edge
                            html += `<div style="position:absolute;left:0;top:30%;height:40%;width:8px;background:${col};box-shadow:${glow};border-radius:0 6px 6px 0;"></div>`;
                        } else if (t.relAngle > 1.22 && t.relAngle <= 2.35) {
                            // Right edge
                            html += `<div style="position:absolute;right:0;top:30%;height:40%;width:8px;background:${col};box-shadow:${glow};border-radius:6px 0 0 6px;"></div>`;
                        } else {
                            // Rear bottom edge
                            html += `<div style="position:absolute;bottom:0;left:25%;width:50%;height:8px;background:${col};box-shadow:${glow};border-radius:6px 6px 0 0;"></div>`;
                        }
                    }
                    overlay.innerHTML = html;
                }
            }

            // Update Compass Canvas Pips
            if (compass && typeof compass.getContext === 'function') {
                const ctx = compass.getContext('2d');
                if (ctx) {
                    const cx = compass.width / 2;
                    const cy = compass.height / 2;
                    const radius = (compass.width / 2) - 4;
                    for (let i = 0; i < threats.length; i++) {
                        const t = threats[i];
                        const pipAngle = t.relAngle - Math.PI / 2;
                        const px = cx + Math.cos(pipAngle) * radius;
                        const py = cy + Math.sin(pipAngle) * radius;
                        ctx.beginPath();
                        ctx.arc(px, py, t.isAdjacent ? 3.0 : 2.2, 0, Math.PI * 2);
                        ctx.fillStyle = t.isAdjacent ? '#ef4444' : '#f59e0b';
                        ctx.fill();
                    }
                }
            }
        },

        // =========================================================================
        // 4. COMPOSABLE MONSTER NAMEPLATE STATUS BADGES
        // =========================================================================

        drawComposableStatusPills(ctx, m, curY, isTargeted, isBossOrUnique, isSensed) {
            const pills = [];
            if (m.asleep) pills.push({ icon: '💤', label: 'Zzz...', color: '#a8d8ff', bg: 'rgba(56, 189, 248, 0.22)' });
            if (m.afraid) pills.push({ icon: '💨', label: 'Fleeing', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.22)' });
            if (m.confused || m.stunned) pills.push({ icon: '😵', label: 'Confused', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.22)' });
            if (m.fast || m.hasted) pills.push({ icon: '⚡', label: 'Fast', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.22)' });
            if (m.breath || m.breathes) pills.push({ icon: '🔥', label: 'Breath', color: '#f87171', bg: 'rgba(248, 113, 113, 0.22)' });
            if (isTargeted) pills.push({ icon: '⌖', label: 'Target', color: '#ffd700', bg: 'rgba(255, 215, 0, 0.25)' });
            if (isBossOrUnique) pills.push({ icon: '👑', label: 'Boss', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.28)' });
            if (m._espPerceived || m.esp || m.telepathy) {
                pills.push({ icon: '✦', label: '[ESP]', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.28)' });
            } else if (isSensed && !isTargeted && !isBossOrUnique) {
                pills.push({ icon: '👁', label: 'Sensed', color: '#cbd5e1', bg: 'rgba(203, 213, 225, 0.18)' });
            }

            if (pills.length === 0) return 0;

            const totalPills = pills.length;
            const pillW = Math.min(88, Math.floor(340 / totalPills));
            const totalW = totalPills * pillW + (totalPills - 1) * 6;
            let startX = (384 - totalW) / 2;

            for (let i = 0; i < totalPills; i++) {
                const p = pills[i];
                const px = startX + i * (pillW + 6);
                const py = curY + 2;

                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(px, py, pillW, 20, 5);
                } else {
                    ctx.rect(px, py, pillW, 20);
                }
                ctx.fillStyle = p.bg;
                ctx.fill();
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                ctx.font = '700 13px "Fira Code", monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = p.color;
                const displayText = (pillW < 70) ? p.icon : `${p.icon} ${p.label}`;
                ctx.fillText(displayText, px + pillW / 2, py + 14);
            }
            return 24;
        },

        // =========================================================================
        // 5. GOLDEN-RATIO SPIRAL MULTI-ITEM PLACEMENT & STACK INDICATOR
        // =========================================================================

        computeMultiItemPositions(items, cellSize = 2.0) {
            const tileBuckets = new Map();
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const key = `${it.x}_${it.y}`;
                if (!tileBuckets.has(key)) tileBuckets.set(key, []);
                tileBuckets.get(key).push(it);
            }

            const positionedItems = [];
            for (const [key, bucket] of tileBuckets.entries()) {
                const totalCount = bucket.length;
                for (let i = 0; i < totalCount; i++) {
                    const it = bucket[i];
                    let offsetX = 0;
                    let offsetZ = 0;
                    if (i > 0) {
                        const r = 0.26 * Math.sqrt(i);
                        const theta = i * 2.399963;
                        offsetX = r * Math.cos(theta);
                        offsetZ = r * Math.sin(theta);
                    }
                    positionedItems.push({
                        item: it,
                        tileKey: key,
                        indexInStack: i,
                        totalInStack: totalCount,
                        offsetX,
                        offsetZ,
                        stackIndicator: (i === 0 && totalCount > 1) ? `+${totalCount - 1} items` : null
                    });
                }
            }
            return positionedItems;
        },

        // =========================================================================
        // 6. ZERO-GC PROCEDURAL BESTIARY LOCOMOTION FOR UNRIGGED GLBs
        // =========================================================================

        updateProceduralLocomotion(entity, delta, monTime) {
            if (!entity || !entity.creatureMesh) return;
            const mesh = entity.creatureMesh;
            const tk = String(entity.templateKey || entity.modelKey || '').toLowerCase();
            const race = String(entity.monsterData ? (entity.monsterData.race || entity.monsterData.name || '') : '').toLowerCase();

            // Skip procedural gait if entity has active running skeletal animation mixer
            if (entity._walkAction && typeof entity._walkAction.isRunning === 'function' && entity._walkAction.isRunning()) {
                return;
            }

            if (mesh._basePosY === undefined) mesh._basePosY = mesh.position.y;
            if (!mesh._baseScale) mesh._baseScale = mesh.scale.clone();

            const seed = (entity.monsterData && entity.monsterData.seed) ? (entity.monsterData.seed * 0.01) : 0;
            const t = monTime + seed;

            // 1. Dragons & Bats: Wingbeat & Body Hover Sway
            if (/dragon|drake|wyrm|bat|vampire bat/.test(tk) || /dragon|drake|wyrm|bat/.test(race)) {
                const wingFreq = /bat/.test(tk) || /bat/.test(race) ? 9.0 : 3.8;
                const hoverLift = Math.sin(t * wingFreq) * 0.08;
                const pitchSway = Math.sin(t * wingFreq * 0.5) * 0.06;
                const rollBank = Math.cos(t * wingFreq * 0.25) * 0.05;

                mesh.position.y = mesh._basePosY + hoverLift;
                mesh.rotation.x = pitchSway;
                mesh.rotation.z = rollBank;
                return;
            }

            // 2. Quadrupeds: Gait Bob & Stride Pulse (Wolf, Hellhound, Bear, Hound)
            if (/wolf|hellhound|bear|hound|husky|fox|shiba/.test(tk) || /wolf|hellhound|bear|hound/.test(race)) {
                const isMoving = Boolean(entity.targetPos && entity.position.distanceTo(entity.targetPos) > 0.02);
                const strideSpeed = isMoving ? 12.0 : 2.5;
                const strideBob = Math.abs(Math.sin(t * strideSpeed)) * (isMoving ? 0.07 : 0.018);
                const stridePitch = Math.sin(t * strideSpeed) * (isMoving ? 0.09 : 0.02);

                mesh.position.y += ((mesh._basePosY + strideBob) - mesh.position.y) * 0.25;
                mesh.rotation.x = stridePitch;
                return;
            }

            // 3. Hydra: Multi-Neck Sinuous Weave
            if (/hydra/.test(tk) || /hydra/.test(race)) {
                const weaveX = Math.sin(t * 2.6) * 0.12;
                const weaveZ = Math.cos(t * 1.8) * 0.08;
                const neckTilt = Math.sin(t * 3.2) * 0.07;

                mesh.rotation.y += weaveX * delta * 2.0;
                mesh.rotation.z = weaveZ;
                mesh.rotation.x = neckTilt;
                return;
            }

            // 4. Worm Mass, Jelly Ooze & Vortex: Undulating Wave Squash-Stretch
            if (/worm_mass|env_ooze_mound|jelly_ooze|vortex/.test(tk) || /worm|jelly|ooze|icky|slime|blob|vortex/.test(race)) {
                const squashFreq = /vortex/.test(tk) || /vortex/.test(race) ? 5.5 : 3.2;
                const squash = 1.0 + Math.sin(t * squashFreq) * 0.16;
                const stretch = 1.0 - Math.sin(t * squashFreq) * 0.08;

                mesh.scale.set(mesh._baseScale.x * stretch, mesh._baseScale.y * squash, mesh._baseScale.z * stretch);
                if (/vortex/.test(tk) || /vortex/.test(race)) {
                    mesh.rotation.y += delta * 4.8; // High-speed elemental swirl
                }
                return;
            }
        },

        // =========================================================================
        // 6B. VIEWMODEL EQUIPMENT & DOOR/STAIR/SHOP ORIENTATION HELPERS (WS80)
        // =========================================================================

        extractHandItems(player) {
            const _itemStr = (v) => (v && typeof v === 'object') ? String(v.name || v.desc || '') : String(v || '');
            let weaponItem = _itemStr(player && player.weapon_item);
            let bowItem = _itemStr(player && player.bow_item);
            let shieldItem = _itemStr(player && player.shield_item);
            if (shieldItem && (/\b(bow|crossbow|sling|arbalest|launcher)\b/i.test(shieldItem) || (!/\b(shield|buckler|targe)\b/i.test(shieldItem) && /\b(torch|lantern|lamp|phial)\b/i.test(shieldItem)))) {
                shieldItem = '';
            }
            if (player && Array.isArray(player.equipment)) {
                for (const eq of player.equipment) {
                    if (!eq) continue;
                    const eqName = String(eq.name || eq.desc || '').trim();
                    if (!eqName || /^(none|nothing|\(nothing\)|\(none\)|empty|なし)$/i.test(eqName)) continue;
                    const slotRaw = String(eq.slot ?? eq.label ?? '').toLowerCase().trim();
                    const slotName = String(eq.slot_name || '').toLowerCase().trim();
                    const slotMeta = `${slotName} ${eq.mention || ''} ${eq.category || ''} ${eq.label || ''}`.toLowerCase();
                    const eqTval = Number(eq.tval || 0);
                    if (slotRaw === 'f' || /\b(armou?r|body|torso|chest|cloak|mantle|outer|helm|head|crown|hat|boot|feet|foot|shoe|glove|gauntlet|finger|ring|neck|amulet|light|lite|source|lantern|lamp|bag|quiver|ammo)\b/.test(slotMeta) ||
                        (eqTval >= 30 && eqTval <= 45 && eqTval !== 34)) {
                        continue;
                    }
                    const hasExplicitSlotName = slotName.length > 0;
                    const isLauncher = eqTval === 19 || /\b(bow|crossbow|sling|arbalest|launcher)\b/i.test(eqName) || /\b(shoot|bow|launcher|range|ranged)\b/.test(slotMeta);
                    if (!weaponItem && !isLauncher && (eqTval === 20 || (hasExplicitSlotName ? /\b(weapon|wield|melee|right|primary|lifting|arms|paws|reins|hand)\b/.test(slotMeta) : (slotRaw === '0' || slotRaw === 'a' || slotRaw === '24')) || /\b(wield|weapon|right|lifting|arms|paws|reins|hand)\b/.test(slotRaw))) {
                        weaponItem = eqName;
                    } else if (!bowItem && (isLauncher || (hasExplicitSlotName ? /\b(shoot|bow|launcher|range|ranged)\b/.test(slotMeta) : (slotRaw === '2' || slotRaw === 'b')) || /\b(shoot|bow|launcher)\b/.test(slotRaw))) {
                        bowItem = eqName;
                    } else if (!shieldItem && !isLauncher && slotRaw !== 'f' && (slotName === 'offhand' || slotName === 'shield' || slotRaw === '25' || (hasExplicitSlotName ? /\b(shield|buckler|offhand|off-hand|left|secondary|arm)\b/.test(slotMeta) : (slotRaw === '1' || slotRaw === '8')) || (!/\barmou?r\b/.test(slotRaw) && /\b(arm|shield|offhand|off-hand|left)\b/.test(slotRaw)) || eqTval === 34)) {
                        shieldItem = eqName;
                    }
                }
            }
            return { weaponItem, bowItem, shieldItem };
        },

        resolveRightKey(d3d, weaponItem, bowItem, player) {
            const lowerW = (weaponItem || '').toLowerCase();
            const lowerB = (bowItem || '').toLowerCase();
            const wTval = Number((player && player.weapon_tval) || 0);
            if (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY && typeof window.MASTER_ITEM_REGISTRY.resolveEquippedWeaponKey === 'function') {
                const k = window.MASTER_ITEM_REGISTRY.resolveEquippedWeaponKey(weaponItem, bowItem, player, d3d.realm) || '';
                if ((!k || k === 'sword') && wTval === 20 && !/\b(shovel|spade|trowel)\b/.test(lowerW)) return 'pickaxe';
                return k;
            }
            if (lowerW.length > 0 || wTval === 20) {
                if (/\b(shovel|spade|trowel)\b/.test(lowerW)) return 'shovel';
                if (/\b(pick|pickaxe|mattock|digger)\b/.test(lowerW) || wTval === 20) return 'pickaxe';
                if (/\bwand\b/.test(lowerW) || wTval === 65) return 'wand';
                if (/\brod\b/.test(lowerW) || wTval === 66) return 'rod';
                if (/\b(staff|quarterstaff)\b/.test(lowerW) || wTval === 55) return /\b(gnarled|branch|druid|wood)\b/.test(lowerW) ? 'staff_branch' : 'staff';
                if (/\b(scythe|sickle|glaive|halberd|lochaber)\b/.test(lowerW)) return 'axe';
                if (lowerW.includes('whip') || lowerW.includes('bullwhip') || lowerW.includes('scourge') || lowerW.includes('cat-o')) return 'whip';
                if (lowerW.includes('katana') || lowerW.includes('wakizashi') || lowerW.includes('nodachi') || lowerW.includes('ninja-to') || lowerW.includes('tanto')) return 'katana';
                if (lowerW.includes('dagger') || lowerW.includes('knife') || lowerW.includes('main gauche') || lowerW.includes('misericorde') || lowerW.includes('stiletto') || lowerW.includes('dirk')) return 'dagger';
                if (lowerW.includes('claymore') || lowerW.includes('two-handed') || lowerW.includes('great sword') || lowerW.includes('executioner') || lowerW.includes('zweihander')) return 'claymore';
                if (lowerW.includes('rune') || lowerW.includes('vorpal') || lowerW.includes('morgul') || lowerW.includes('ringil') || lowerW.includes('anduril') || lowerW.includes('glamdring')) return 'blade';
                if (lowerW.includes('saber') || lowerW.includes('sabre') || lowerW.includes('scimitar') || lowerW.includes('cutlass') || lowerW.includes('falchion') || lowerW.includes('tulwar')) return 'saber';
                if (lowerW.includes('hatchet')) return 'hatchet';
                if (lowerW.includes('axe') || lowerW.includes('cleaver')) return 'axe';
                if (lowerW.includes('morning star') || lowerW.includes('morningstar') || lowerW.includes('flail') || lowerW.includes('ball-and-chain')) return 'morningstar';
                if (lowerW.includes('club') || lowerW.includes('cudgel')) return 'club';
                if (lowerW.includes('mace') || lowerW.includes('scepter')) return 'mace';
                if (/\b(sledge|maul|great hammer|grond)\b/.test(lowerW)) return 'sledgehammer';
                if (lowerW.includes('hammer')) return 'hammer';
                if (lowerW.includes('spear') || lowerW.includes('pike') || lowerW.includes('lance') || lowerW.includes('trident') || lowerW.includes('polearm')) return 'spear';
                return 'sword';
            }
            return lowerB.length > 0 ? 'bow' : '';
        },

        resolveLeftShieldOrOffhand(d3d, shieldItem) {
            const lower = String(shieldItem || '').toLowerCase().trim();
            if (!shieldItem || /^(none|nothing|\(nothing\)|\(none\)|empty|なし)$/i.test(lower) || /\b(bow|crossbow|sling|arbalest|launcher)\b/.test(lower)) {
                return { key: '', isOffhandWeapon: false };
            }
            if (!/\b(shield|buckler|targe)\b/.test(lower) && /\b(torch|lantern|lamp|phial)\b/.test(lower)) {
                return { key: '', isOffhandWeapon: false };
            }
            let key = '';
            let isOffhandWeapon = false;
            if (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY && typeof window.MASTER_ITEM_REGISTRY.resolveShieldKey === 'function') {
                key = window.MASTER_ITEM_REGISTRY.resolveShieldKey(shieldItem, '(', d3d.realm) || '';
                if (!key && typeof window.MASTER_ITEM_REGISTRY.resolveItem === 'function') {
                    const offRes = window.MASTER_ITEM_REGISTRY.resolveItem(shieldItem, ')', d3d.realm);
                    if (offRes && offRes.category === 'weapon' && offRes.viewmodelKey && offRes.viewmodelKey !== 'bow') {
                        key = offRes.viewmodelKey;
                        isOffhandWeapon = true;
                    }
                }
            } else if (/\b(deflection|dragon|artifact|thorin|celegorm|anor|gil-galad|harad|raven|mirror|elven)\b/.test(lower) && /\b(shield|buckler|targe)\b/.test(lower)) {
                key = 'shield_raven';
            } else if (/\b(wicker|buckler|basket)\b/.test(lower)) {
                key = 'shield_wicker';
            } else if (/\bleather\b/.test(lower) && /\b(shield|buckler|targe)\b/.test(lower)) {
                key = 'shield_leather';
            } else if (/\bsmall metal\b/.test(lower)) {
                key = 'shield_metal';
            } else if (/\b(wooden|wood|round|small|target)\b/.test(lower) && /\b(shield|buckler|targe)\b/.test(lower)) {
                key = 'shield_wooden';
            } else if (/\b(shield|buckler|targe)\b/.test(lower)) {
                key = 'shield';
            }
            return { key, isOffhandWeapon };
        },

        determineStairOrientation(d3d, map, x, y, w, h) {
            const effFeat = (nx, ny) => {
                const f = d3d.getFeatAt(map, nx, ny);
                if (f !== 0) return f;
                const m = d3d.getRememberedTile ? d3d.getRememberedTile(nx, ny) : null;
                return m ? m.feat : 0;
            };
            const dirs = [
                { dx: 0, dy: 1, yaw: 0 },
                { dx: 0, dy: -1, yaw: Math.PI },
                { dx: 1, dy: 0, yaw: Math.PI / 2 },
                { dx: -1, dy: 0, yaw: -Math.PI / 2 }
            ];
            let bestYaw = 0;
            let bestScore = -999;
            for (let i = 0; i < 4; i++) {
                const d = dirs[i];
                const nx = x + d.dx, ny = y + d.dy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const nFeat = effFeat(nx, ny);
                if (!d3d.isWalkableOrPortal(nFeat) || d3d.isSolidWall(nFeat)) continue;
                let score = 10;
                const nx2 = x + d.dx * 2, ny2 = y + d.dy * 2;
                if (nx2 >= 0 && nx2 < w && ny2 >= 0 && ny2 < h && d3d.isWalkableOrPortal(effFeat(nx2, ny2))) score += 4;
                const bx = x - d.dx, by = y - d.dy;
                if (bx < 0 || bx >= w || by < 0 || by >= h || d3d.isSolidWall(effFeat(bx, by))) score += 3;
                if (score > bestScore) {
                    bestScore = score;
                    bestYaw = d.yaw;
                }
            }
            return bestYaw;
        },

        determineDoorOrientation(d3d, map, x, y, w, h) {
            const effFeat = (nx, ny) => {
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) return 22;
                const f = d3d.getFeatAt(map, nx, ny);
                if (f !== 0) return f;
                const m = d3d.getRememberedTile ? d3d.getRememberedTile(nx, ny) : null;
                return m ? m.feat : 0;
            };
            const featN = effFeat(x, y - 1);
            const featS = effFeat(x, y + 1);
            const featW = effFeat(x - 1, y);
            const featE = effFeat(x + 1, y);
            const isDoor = (f) => f >= 2 && f <= 4;
            const wallN = d3d.isSolidWall(featN) || y <= 0;
            const wallS = d3d.isSolidWall(featS) || y >= h - 1;
            const wallW = d3d.isSolidWall(featW) || x <= 0;
            const wallE = d3d.isSolidWall(featE) || x >= w - 1;
            const walkN = d3d.isWalkableOrPortal(featN) && !isDoor(featN);
            const walkS = d3d.isWalkableOrPortal(featS) && !isDoor(featS);
            const walkW = d3d.isWalkableOrPortal(featW) && !isDoor(featW);
            const walkE = d3d.isWalkableOrPortal(featE) && !isDoor(featE);
            const scoreX = (wallW ? 3 : (isDoor(featW) ? 2 : 0)) + (wallE ? 3 : (isDoor(featE) ? 2 : 0)) + (walkN ? 1 : 0) + (walkS ? 1 : 0);
            const scoreZ = (wallN ? 3 : (isDoor(featN) ? 2 : 0)) + (wallS ? 3 : (isDoor(featS) ? 2 : 0)) + (walkW ? 1 : 0) + (walkE ? 1 : 0);
            return scoreZ > scoreX ? Math.PI / 2 : 0;
        },

        determineShopDoorOrientation(d3d, map, x, y, w, h) {
            const curFeat = d3d.getFeatAt(map, x, y);
            const featN = d3d.getFeatAt(map, x, y - 1);
            const featS = d3d.getFeatAt(map, x, y + 1);
            const featW = d3d.getFeatAt(map, x - 1, y);
            const featE = d3d.getFeatAt(map, x + 1, y);
            const isShopFeat = (f) => (f >= 7 && f <= 14) || (f >= 32 && f <= 40);
            const bldgN = d3d.isSolidWall(featN) || d3d.isStoreKind(featN) || y <= 0;
            const bldgS = d3d.isSolidWall(featS) || d3d.isStoreKind(featS) || y >= h - 1;
            const bldgW = d3d.isSolidWall(featW) || d3d.isStoreKind(featW) || x <= 0;
            const bldgE = d3d.isSolidWall(featE) || d3d.isStoreKind(featE) || x >= w - 1;
            const streetN = !bldgN, streetS = !bldgS, streetW = !bldgW, streetE = !bldgE;

            const shopEW = (isShopFeat(curFeat) && (featW === curFeat || featE === curFeat)) || ((isShopFeat(featW) || isShopFeat(featE)) && !(isShopFeat(featN) || isShopFeat(featS)));
            const shopNS = (isShopFeat(curFeat) && (featN === curFeat || featS === curFeat)) || ((isShopFeat(featN) || isShopFeat(featS)) && !(isShopFeat(featW) || isShopFeat(featE)));
            if (shopEW && !shopNS) {
                if (bldgN && streetS) return 0;
                if (bldgS && streetN) return Math.PI;
                if (streetS) return 0;
                if (streetN) return Math.PI;
            }
            if (shopNS && !shopEW) {
                if (bldgW && streetE) return Math.PI / 2;
                if (bldgE && streetW) return -Math.PI / 2;
                if (streetE) return Math.PI / 2;
                if (streetW) return -Math.PI / 2;
            }
            if (bldgN && streetS && bldgW && bldgE) return 0;
            if (bldgS && streetN && bldgW && bldgE) return Math.PI;
            if (bldgW && streetE && bldgN && bldgS) return Math.PI / 2;
            if (bldgE && streetW && bldgN && bldgS) return -Math.PI / 2;
            if (bldgN && bldgE && streetS && streetW) return 0;
            if (bldgN && bldgW && streetS && streetE) return 0;
            if (bldgS && bldgE && streetN && streetW) return Math.PI;
            if (bldgS && bldgW && streetN && streetE) return Math.PI;
            if (bldgN && streetS) return 0;
            if (bldgS && streetN) return Math.PI;
            if (bldgW && streetE) return Math.PI / 2;
            if (bldgE && streetW) return -Math.PI / 2;
            if (streetS) return 0;
            if (streetN) return Math.PI;
            if (streetE) return Math.PI / 2;
            if (streetW) return -Math.PI / 2;
            return 0;
        },

        // =========================================================================
        // 7A. WS81 ADAPTIVE GPU PER-CORNER MASONRY, TRIM & DARKNESS PORTALS
        // =========================================================================

        isHighGpuTier(d3d) {
            const tier = String((d3d && d3d.renderBudget && (d3d.renderBudget.gpuTier || d3d.renderBudget.tier)) || '').toLowerCase();
            return tier === 'performance' || tier === 'ultra' || tier === 'discrete';
        },

        createAdaptiveWallGeometry(cellSize = 2.0, wallHeight = 3.05, isUpperSpandrel = false) {
            const half = cellSize * 0.5;
            const halfH = wallHeight * 0.5;
            const tLevels = [0.0, 0.28, 0.80, 1.0];
            // 8 perimeter faces clockwise from North: 4 cardinal + 4 adaptive corner bevels
            // Corner indices: 0=NW(-X,-Z), 1=NE(+X,-Z), 2=SE(+X,+Z), 3=SW(-X,+Z)
            const faces = [
                { ax: -half, az: -half, ac: 0, aax: 1, aaz: 0, bx: half, bz: -half, bc: 1, bax: -1, baz: 0, nx: 0, nz: -1, fw: cellSize },
                { ax: half, az: -half, ac: 1, aax: -1, aaz: 0, bx: half, bz: -half, bc: 1, bax: 0, baz: 1, nx: 0.7072, nz: -0.7070, fw: 0.40 },
                { ax: half, az: -half, ac: 1, aax: 0, aaz: 1, bx: half, bz: half, bc: 2, bax: 0, baz: -1, nx: 1, nz: 0, fw: cellSize },
                { ax: half, az: half, ac: 2, aax: 0, aaz: -1, bx: half, bz: half, bc: 2, bax: -1, baz: 0, nx: 0.7072, nz: 0.7070, fw: 0.40 },
                { ax: half, az: half, ac: 2, aax: -1, aaz: 0, bx: -half, bz: half, bc: 3, bax: 1, baz: 0, nx: 0, nz: 1, fw: cellSize },
                { ax: -half, az: half, ac: 3, aax: 1, aaz: 0, bx: -half, bz: half, bc: 3, bax: 0, baz: -1, nx: -0.7072, nz: 0.7070, fw: 0.40 },
                { ax: -half, az: half, ac: 3, aax: 0, aaz: -1, bx: -half, bz: -half, bc: 0, bax: 0, baz: 1, nx: -1, nz: 0, fw: cellSize },
                { ax: -half, az: -half, ac: 0, aax: 0, aaz: 1, bx: -half, bz: -half, bc: 0, bax: 1, baz: 0, nx: -0.7072, nz: -0.7070, fw: 0.40 }
            ];

            const evalAo = (t) => {
                if (!isUpperSpandrel && t < 0.28) {
                    return 0.48 + Math.pow(t / 0.28, 0.85) * 0.52;
                }
                if (t > 0.80) {
                    return 0.60 + Math.pow((1.0 - t) / 0.20, 0.85) * 0.40;
                }
                return 1.0;
            };

            const pos = [];
            const norm = [];
            const uvs = [];
            const cols = [];
            const cIdx = [];
            const cAxis = [];
            const fWid = [];
            const indices = [];
            let vCount = 0;

            const pushVert = (px, py, pz, nx, ny, nz, u, v, ao, ci, ax, az, fw) => {
                pos.push(px, py, pz);
                norm.push(nx, ny, nz);
                uvs.push(u, v);
                cols.push(ao, ao, ao);
                cIdx.push(ci);
                cAxis.push(ax, az);
                fWid.push(fw);
                return vCount++;
            };

            for (let fi = 0; fi < 8; fi++) {
                const f = faces[fi];
                const baseV = vCount;
                for (let ti = 0; ti < tLevels.length; ti++) {
                    const t = tLevels[ti];
                    const vy = -halfH + t * wallHeight;
                    const ao = evalAo(t);
                    pushVert(f.ax, vy, f.az, f.nx, 0, f.nz, 0.0, t, ao, f.ac, f.aax, f.aaz, f.fw);
                    pushVert(f.bx, vy, f.bz, f.nx, 0, f.nz, 1.0, t, ao, f.bc, f.bax, f.baz, f.fw);
                }
                for (let ti = 0; ti < tLevels.length - 1; ti++) {
                    const a0 = baseV + ti * 2;
                    const b0 = a0 + 1;
                    const a1 = a0 + 2;
                    const b1 = a0 + 3;
                    indices.push(a0, a1, b1, a0, b1, b0);
                }
            }

            // Top & bottom watertight 8-gon caps
            const ringPts = [
                { x: -half, z: -half, c: 0, ax: 1, az: 0 },
                { x: half, z: -half, c: 1, ax: -1, az: 0 },
                { x: half, z: -half, c: 1, ax: 0, az: 1 },
                { x: half, z: half, c: 2, ax: 0, az: -1 },
                { x: half, z: half, c: 2, ax: -1, az: 0 },
                { x: -half, z: half, c: 3, ax: 1, az: 0 },
                { x: -half, z: half, c: 3, ax: 0, az: -1 },
                { x: -half, z: -half, c: 0, ax: 0, az: 1 }
            ];
            const topBase = vCount;
            const topAo = evalAo(1.0);
            for (let ri = 0; ri < 8; ri++) {
                const p = ringPts[ri];
                pushVert(p.x, halfH, p.z, 0, 1, 0, (p.x + half) / cellSize, (p.z + half) / cellSize, topAo, p.c, p.ax, p.az, cellSize);
            }
            for (let ri = 1; ri < 7; ri++) {
                indices.push(topBase, topBase + ri + 1, topBase + ri);
            }
            const botBase = vCount;
            const botAo = evalAo(0.0);
            for (let ri = 0; ri < 8; ri++) {
                const p = ringPts[ri];
                pushVert(p.x, -halfH, p.z, 0, -1, 0, (p.x + half) / cellSize, (p.z + half) / cellSize, botAo, p.c, p.ax, p.az, cellSize);
            }
            for (let ri = 1; ri < 7; ri++) {
                indices.push(botBase, botBase + ri, botBase + ri + 1);
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
            geo.setAttribute('aCornerIdx', new THREE.Float32BufferAttribute(cIdx, 1));
            geo.setAttribute('aCornerAxis', new THREE.Float32BufferAttribute(cAxis, 2));
            geo.setAttribute('aFaceWidth', new THREE.Float32BufferAttribute(fWid, 1));
            geo.setIndex(indices);
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            return geo;
        },

        cloneWallGeoWithBevelAttr(baseGeo, capacity) {
            const g = baseGeo.clone();
            const bevelAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
            bevelAttr.setUsage(THREE.DynamicDrawUsage);
            g.setAttribute('aCornerBevel', bevelAttr);
            return g;
        },

        setCornerBevelAt(mesh, instIdx, b0, b1, b2, b3) {
            if (!mesh || !mesh.geometry || !mesh.geometry.attributes.aCornerBevel) return;
            const arr = mesh.geometry.attributes.aCornerBevel.array;
            const o = instIdx * 4;
            if (o + 3 < arr.length) {
                arr[o] = b0;
                arr[o + 1] = b1;
                arr[o + 2] = b2;
                arr[o + 3] = b3;
            }
        },

        _getEffectiveFeatAndGlyph(d3d, map, w, h, nx, ny, outdoors) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return { feat: 22, glyph: ' ' };
            let f = d3d.getFeatAt(map, nx, ny);
            let g = d3d.getGlyphAt(map, nx, ny);
            if (f === 0 && !outdoors && d3d.getRememberedTile) {
                const m = d3d.getRememberedTile(nx, ny);
                if (m) {
                    f = m.feat;
                    g = m.glyph;
                }
            }
            return { feat: f, glyph: g };
        },

        isSolidWallJoin(d3d, map, w, h, nx, ny, outdoors) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return true;
            const { feat, glyph } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, nx, ny, outdoors);
            if (!outdoors && feat === 0) return true;
            const isSilQForge = (feat === 60 || (d3d && d3d.realm === 'silq' && glyph === '0'));
            if (isSilQForge) return false;
            if (feat === 15 || (feat >= 17 && feat <= 22) || feat === 30) return true;
            if (feat >= 32 && feat <= 40) return true;
            if (outdoors && feat >= 7 && feat <= 14) return true;
            return false;
        },

        isDoorwayTile(d3d, map, w, h, nx, ny, outdoors) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
            const { feat, glyph } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, nx, ny, outdoors);
            if (feat === 2 || feat === 3) return true;
            if (feat === 4) {
                if (glyph === '^') return false;
                if (d3d && d3d.realm === 'brogue' && glyph !== "'" && glyph !== '+') return false;
                return true;
            }
            return false;
        },

        computeWallCornerBevels(d3d, map, w, h, x, y, outdoors, out4) {
            const out = out4 || [0, 0, 0, 0];
            const r = String((d3d && d3d.realm) || 'angband').toLowerCase();
            const diagDoorSnap = (r === 'nethack' || r === 'rogue');
            const baseBevel = outdoors ? 0.03 : 0.28;
            // 0=NW(-1,-1), 1=NE(+1,-1), 2=SE(+1,+1), 3=SW(-1,+1)
            const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (let i = 0; i < 4; i++) {
                const sx = signs[i][0];
                const sz = signs[i][1];
                const joinX = this.isSolidWallJoin(d3d, map, w, h, x + sx, y, outdoors);
                const joinZ = this.isSolidWallJoin(d3d, map, w, h, x, y + sz, outdoors);
                const doorTouch = this.isDoorwayTile(d3d, map, w, h, x + sx, y, outdoors) ||
                    this.isDoorwayTile(d3d, map, w, h, x, y + sz, outdoors) ||
                    (diagDoorSnap && this.isDoorwayTile(d3d, map, w, h, x + sx, y + sz, outdoors));
                out[i] = (!joinX && !joinZ && !doorTouch) ? baseBevel : 0.0;
            }
            return out;
        },

        initMasonryTrimAndPortals(d3d, createMergedBoxGeometry) {
            if (!d3d || typeof createMergedBoxGeometry !== 'function') return;

            // Constructed masonry base plinth (+Z exposed face in local space, unit width 1.0 scaled per span)
            const plinthGeo = createMergedBoxGeometry([
                { pos: [0, 0.035, 1.032], size: [1.0, 0.17, 0.068], color: [0.66, 0.64, 0.60] },
                { pos: [0, 0.132, 1.018], size: [1.0, 0.036, 0.040], color: [0.76, 0.74, 0.70] }
            ]);
            this.cloneWallGeoSafeAttrs(plinthGeo);
            d3d.wallPlinthMesh = new THREE.InstancedMesh(plinthGeo, d3d.wallMaterial, 2560);
            d3d.wallPlinthMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            d3d.wallPlinthMesh.frustumCulled = false;
            d3d.scene.add(d3d.wallPlinthMesh);

            // Constructed masonry upper cornice corbel (+Z exposed face, anchored at y = wallTopH)
            const corniceGeo = createMergedBoxGeometry([
                { pos: [0, -0.045, 1.042], size: [1.0, 0.09, 0.088], color: [0.74, 0.72, 0.68] },
                { pos: [0, -0.115, 1.022], size: [1.0, 0.06, 0.048], color: [0.64, 0.62, 0.58] }
            ]);
            this.cloneWallGeoSafeAttrs(corniceGeo);
            d3d.wallCorniceMesh = new THREE.InstancedMesh(corniceGeo, d3d.wallMaterial, 2560);
            d3d.wallCorniceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            d3d.wallCorniceMesh.frustumCulled = false;
            d3d.scene.add(d3d.wallCorniceMesh);

            // Subterranean Unexplored Frontier Portal: pure RGB(0,0,0) feathered shadow veil + pitch-black abyssal curtain (0 grey box faces!)
            const portalGeo = this._buildDarkPortalGeometry();
            d3d.darkPortalMaterial = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
                vertexShader: [
                    'attribute vec3 color;',
                    'varying float vPortalAlpha;',
                    'void main() {',
                    '    vPortalAlpha = color.r;',
                    '    vec4 mvPos = vec4(position, 1.0);',
                    '    #ifdef USE_INSTANCING',
                    '        mvPos = instanceMatrix * mvPos;',
                    '    #endif',
                    '    gl_Position = projectionMatrix * modelViewMatrix * mvPos;',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'varying float vPortalAlpha;',
                    'void main() {',
                    '    if (vPortalAlpha <= 0.004) discard;',
                    '    gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(vPortalAlpha, 0.0, 1.0));',
                    '}'
                ].join('\n')
            });
            d3d.darkPortalMesh = new THREE.InstancedMesh(portalGeo, d3d.darkPortalMaterial, 1024);
            d3d.darkPortalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            d3d.darkPortalMesh.frustumCulled = false;
            d3d.darkPortalMesh.renderOrder = 2;
            d3d.scene.add(d3d.darkPortalMesh);
        },

        cloneWallGeoSafeAttrs(geo) {
            if (!geo || !geo.attributes || !geo.attributes.position) return geo;
            const vc = geo.attributes.position.count;
            if (!geo.attributes.aCornerIdx) {
                geo.setAttribute('aCornerIdx', new THREE.Float32BufferAttribute(new Float32Array(vc).fill(-1), 1));
            }
            if (!geo.attributes.aCornerAxis) {
                geo.setAttribute('aCornerAxis', new THREE.Float32BufferAttribute(new Float32Array(vc * 2), 2));
            }
            if (!geo.attributes.aFaceWidth) {
                geo.setAttribute('aFaceWidth', new THREE.Float32BufferAttribute(new Float32Array(vc).fill(2.0), 1));
            }
            return geo;
        },

        _buildDarkPortalGeometry() {
            // Centered on unexplored tile (nx, ny); +Z = +1.0m meets known open tile; color.r encodes pure-black shadow alpha (RGB is strictly 0,0,0!)
            const pos = [];
            const norm = [];
            const uvs = [];
            const cols = [];
            const indices = [];
            let vc = 0;
            const addQuad = (p0, p1, p2, p3, a0, a1, a2, a3, nx, ny, nz) => {
                const b = vc;
                pos.push(...p0, ...p1, ...p2, ...p3);
                norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
                uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                cols.push(a0, a0, a0, a1, a1, a1, a2, a2, a2, a3, a3, a3);
                indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
                vc += 4;
            };
            const zOut = 1.78;
            const zSoft = 1.24;
            const zMid = 1.09;
            const zCurtain = 0.97;
            const hTop = 3.05;
            const yFloor = -0.043;
            const yCeil = hTop - 0.015;
            // Floor & ceiling soft shadow aprons darkening real photogrammetry stone into the unexplored mouth
            addQuad([-1.02, yFloor, zOut], [1.02, yFloor, zOut], [1.02, yFloor, zSoft], [-1.02, yFloor, zSoft], 0.0, 0.0, 0.52, 0.52, 0, 1, 0);
            addQuad([-1.02, yFloor, zSoft], [1.02, yFloor, zSoft], [1.02, yFloor, zCurtain], [-1.02, yFloor, zCurtain], 0.52, 0.52, 0.98, 0.98, 0, 1, 0);
            addQuad([-1.02, yCeil, zSoft], [1.02, yCeil, zSoft], [1.02, yCeil, zOut], [-1.02, yCeil, zOut], 0.52, 0.52, 0.0, 0.0, 0, -1, 0);
            addQuad([-1.02, yCeil, zCurtain], [1.02, yCeil, zCurtain], [1.02, yCeil, zSoft], [-1.02, yCeil, zSoft], 0.98, 0.98, 0.52, 0.52, 0, -1, 0);
            // Progressive feathered black depth veils + opaque alpha=1.0 pitch-black curtain at z = +0.97m
            addQuad([-1.02, yFloor - 0.02, zSoft], [1.02, yFloor - 0.02, zSoft], [1.02, hTop + 0.03, zSoft], [-1.02, hTop + 0.03, zSoft], 0.34, 0.34, 0.42, 0.42, 0, 0, 1);
            addQuad([-1.03, yFloor - 0.03, zMid], [1.03, yFloor - 0.03, zMid], [1.03, hTop + 0.04, zMid], [-1.03, hTop + 0.04, zMid], 0.68, 0.68, 0.74, 0.74, 0, 0, 1);
            addQuad([-1.05, yFloor - 0.05, zCurtain], [1.05, yFloor - 0.05, zCurtain], [1.05, hTop + 0.06, zCurtain], [-1.05, hTop + 0.06, zCurtain], 1.0, 1.0, 1.0, 1.0, 0, 0, 1);

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
            geo.setIndex(indices);
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            return geo;
        },

        emitWallMasonryTrim(d3d, map, w, h, x, y, wx, wz, depth, bevels, wallShade, setCol, counts) {
            if (!d3d || !d3d.wallPlinthMesh || !d3d.wallCorniceMesh) return;
            const geoProf = d3d._currentGeoProfile;
            if (geoProf && geoProf.isCavern) return;
            // Face definitions: +Z(South), -Z(North), +X(East), -X(West) with left/right corner bevel indices
            const cardinals = [
                { dx: 0, dy: 1, yaw: 0, bL: bevels[3], bR: bevels[2] },
                { dx: 0, dy: -1, yaw: Math.PI, bL: bevels[1], bR: bevels[0] },
                { dx: 1, dy: 0, yaw: Math.PI * 0.5, bL: bevels[2], bR: bevels[1] },
                { dx: -1, dy: 0, yaw: -Math.PI * 0.5, bL: bevels[0], bR: bevels[3] }
            ];
            const dummy = d3d.dummy;
            for (let i = 0; i < 4; i++) {
                const c = cardinals[i];
                const nx = x + c.dx, ny = y + c.dy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                if (this.isSolidWallJoin(d3d, map, w, h, nx, ny, false)) continue;
                const { feat: nFeat } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, nx, ny, false);
                if (!d3d.isWalkableOrPortal(nFeat)) continue;

                const spanW = Math.max(1.20, 2.01 - c.bL - c.bR);
                const lateral = (c.bL - c.bR) * 0.5;
                const cosY = Math.cos(c.yaw);
                const sinY = Math.sin(c.yaw);
                const ox = lateral * cosY;
                const oz = -lateral * sinY;

                if (counts.plinth < 2560) {
                    dummy.position.set(wx + ox, 0, wz + oz);
                    dummy.rotation.set(0, c.yaw, 0);
                    dummy.scale.set(spanW, 1, 1);
                    dummy.updateMatrix();
                    d3d.wallPlinthMesh.setMatrixAt(counts.plinth, dummy.matrix);
                    setCol(d3d.wallPlinthMesh, counts.plinth, wallShade);
                    counts.plinth++;
                }
                if (counts.cornice < 2560) {
                    const nCeil = d3d._evalIndoorCeilH(map, w, h, nx, ny, depth) || d3d.wallHeight;
                    dummy.position.set(wx + ox, nCeil, wz + oz);
                    dummy.rotation.set(0, c.yaw, 0);
                    dummy.scale.set(spanW, 1, 1);
                    dummy.updateMatrix();
                    d3d.wallCorniceMesh.setMatrixAt(counts.cornice, dummy.matrix);
                    setCol(d3d.wallCorniceMesh, counts.cornice, wallShade);
                    counts.cornice++;
                }
            }
            dummy.scale.set(1, 1, 1);
        },

        emitUnexploredFrontierPortals(d3d, map, w, h, x, y, cH, floorShade, setCol, counts) {
            if (!d3d || !d3d.darkPortalMesh || !counts || counts.portal >= 1024) return;
            const cs = d3d.cellSize || 2.0;
            const dirs = [
                { dx: 0, dy: -1, yaw: 0 },
                { dx: 0, dy: 1, yaw: Math.PI },
                { dx: -1, dy: 0, yaw: Math.PI * 0.5 },
                { dx: 1, dy: 0, yaw: -Math.PI * 0.5 }
            ];
            const dummy = d3d.dummy;
            const sclY = Math.max(1.0, (cH || 3.0) / 3.05);
            for (let i = 0; i < 4 && counts.portal < 1024; i++) {
                const d = dirs[i];
                const nx = x + d.dx, ny = y + d.dy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const { feat: nFeat } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, nx, ny, false);
                if (nFeat !== 0) continue;
                dummy.position.set(nx * cs, 0, ny * cs);
                dummy.rotation.set(0, d.yaw, 0);
                dummy.scale.set(1, sclY, 1);
                dummy.updateMatrix();
                d3d.darkPortalMesh.setMatrixAt(counts.portal, dummy.matrix);
                counts.portal++;
            }
            dummy.scale.set(1, 1, 1);
        },

        // =========================================================================
        // 7B. WORLD-CLASS PBR SHADER (RELIEF POM + SPECULAR AA + MICRO-AO + NOISE)
        // =========================================================================

        applyWorldPbrShader(d3d, mat, kind = 'wall') {
            if (!mat || mat._ws81PbrApplied) return;
            mat._ws81PbrApplied = true;
            mat.extensions = Object.assign({}, mat.extensions || {}, { derivatives: true });

            const isWall = (kind === 'wall' || kind === 'vein');
            const isVein = (kind === 'vein');
            const uniforms = {
                uHeightMap: { value: null },
                uHasHeightMap: { value: 0.0 },
                uEnablePom: { value: 0.0 },
                uPomScale: { value: 0.028 },
                uHeroPos: { value: new THREE.Vector3() },
                uTerrainNoise: { value: (d3d && d3d.terrainNoiseTex) || null },
                uHasTerrainNoise: { value: (d3d && d3d.terrainNoiseTex) ? 1.0 : 0.0 },
                uHasArmMap: { value: mat.roughnessMap ? 1.0 : 0.0 },
                uWetness: { value: 0.0 },
                uWaterlineH: { value: 0.55 },
                uMossStrength: { value: 0.0 },
                uMossColor: { value: new THREE.Color(0.18, 0.34, 0.16) },
                uVeinStrength: { value: 0.0 },
                uVeinColor: { value: new THREE.Color(0.65, 0.55, 0.35) },
                uVeinEmissive: { value: new THREE.Color(0.0, 0.0, 0.0) },
                uRoughnessScale: { value: 1.0 }
            };
            mat.userData.ws81Uniforms = uniforms;
            mat.userData.ws81Kind = kind;
            if (d3d) {
                if (!d3d._ws81PbrMaterials) d3d._ws81PbrMaterials = [];
                if (!d3d._ws81PbrMaterials.includes(mat)) d3d._ws81PbrMaterials.push(mat);
            }

            const cacheTag = `yasd_ws81_pbr_${kind}_${mat.id}`;
            mat.customProgramCacheKey = () => cacheTag;

            mat.onBeforeCompile = (shader) => {
                Object.assign(shader.uniforms, uniforms);

                const vertHeader = [
                    '#include <common>',
                    'varying vec3 vWorldPos;',
                    'varying vec3 vWorldNormal;',
                    'varying vec2 vFaceUv;',
                    'varying float vHalfSpanY;',
                    'varying float vFaceWidthM;',
                    isWall ? 'attribute float aCornerIdx;\nattribute vec2 aCornerAxis;\nattribute float aFaceWidth;\nattribute vec4 aCornerBevel;' : ''
                ].join('\n');

                shader.vertexShader = shader.vertexShader.replace('#include <common>', vertHeader);

                const beginVertBlock = isWall ? [
                    '#include <begin_vertex>',
                    'float yasdBevel = 0.0;',
                    'if (aCornerIdx >= -0.5) {',
                    '    if (aCornerIdx < 0.5) yasdBevel = aCornerBevel.x;',
                    '    else if (aCornerIdx < 1.5) yasdBevel = aCornerBevel.y;',
                    '    else if (aCornerIdx < 2.5) yasdBevel = aCornerBevel.z;',
                    '    else yasdBevel = aCornerBevel.w;',
                    '}',
                    'transformed.xz += aCornerAxis * yasdBevel;',
                    'vFaceUv = uv;',
                    'vFaceWidthM = max(0.25, aFaceWidth);'
                ].join('\n') : [
                    '#include <begin_vertex>',
                    'vFaceUv = uv;',
                    'vFaceWidthM = 2.0;'
                ].join('\n');

                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', beginVertBlock);

                const projVertBlock = [
                    '#include <project_vertex>',
                    'vec4 yasdWsPos = vec4(transformed, 1.0);',
                    'vec3 yasdWsNorm = objectNormal;',
                    'float yasdScaleY = 1.0;',
                    '#ifdef USE_INSTANCING',
                    '    yasdWsPos = instanceMatrix * yasdWsPos;',
                    '    vec3 ic0 = instanceMatrix[0].xyz;',
                    '    vec3 ic1 = instanceMatrix[1].xyz;',
                    '    vec3 ic2 = instanceMatrix[2].xyz;',
                    '    yasdScaleY = length(ic1);',
                    '    mat3 cofMat = mat3(cross(ic1, ic2), cross(ic2, ic0), cross(ic0, ic1));',
                    '    yasdWsNorm = cofMat * yasdWsNorm;',
                    '#endif',
                    'yasdWsPos = modelMatrix * yasdWsPos;',
                    'vWorldPos = yasdWsPos.xyz;',
                    'vWorldNormal = normalize(mat3(modelMatrix) * yasdWsNorm);',
                    'vHalfSpanY = 1.525 * yasdScaleY;'
                ].join('\n');

                shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', projVertBlock);

                const fragHeader = [
                    '#include <uv_pars_fragment>',
                    isWall ? '#define YASD_IS_WALL 1' : '',
                    isVein ? '#define YASD_IS_VEIN 1' : '',
                    'varying vec3 vWorldPos;',
                    'varying vec3 vWorldNormal;',
                    'varying vec2 vFaceUv;',
                    'varying float vHalfSpanY;',
                    'varying float vFaceWidthM;',
                    'uniform sampler2D uHeightMap;',
                    'uniform float uHasHeightMap;',
                    'uniform float uEnablePom;',
                    'uniform float uPomScale;',
                    'uniform vec3 uHeroPos;',
                    'uniform sampler2D uTerrainNoise;',
                    'uniform float uHasTerrainNoise;',
                    'uniform float uHasArmMap;',
                    'uniform float uWetness;',
                    'uniform float uWaterlineH;',
                    'uniform float uMossStrength;',
                    'uniform vec3 uMossColor;',
                    'uniform float uVeinStrength;',
                    'uniform vec3 uVeinColor;',
                    'uniform vec3 uVeinEmissive;',
                    'uniform float uRoughnessScale;',
                    'vec2 yasdUv;',
                    'float yasdPomShadow;',
                    'float yasdNoiseMacro;',
                    'float yasdNoiseDetail;',
                    '#define vUv yasdUv'
                ].join('\n');

                shader.fragmentShader = shader.fragmentShader.replace('#include <uv_pars_fragment>', fragHeader);

                const pomAndUvMain = [
                    '#include <logdepthbuf_fragment>',
                    'vec3 yasdN = normalize(vWorldNormal);',
                    'vec3 yasdT = vec3(1.0, 0.0, 0.0);',
                    'vec3 yasdB = vec3(0.0, 0.0, 1.0);',
                    'vec2 baseWorldUv;',
                    '#ifdef YASD_IS_WALL',
                    '    if (abs(yasdN.y) > 0.8) {',
                    '        baseWorldUv = vWorldPos.xz * 0.45;',
                    '        yasdT = vec3(1.0, 0.0, 0.0); yasdB = vec3(0.0, 0.0, 1.0);',
                    '    } else if (abs(yasdN.x) > abs(yasdN.z)) {',
                    '        baseWorldUv = vec2(vWorldPos.z, vWorldPos.y) * 0.45;',
                    '        yasdT = vec3(0.0, 0.0, 1.0); yasdB = vec3(0.0, 1.0, 0.0);',
                    '    } else {',
                    '        baseWorldUv = vec2(vWorldPos.x, vWorldPos.y) * 0.45;',
                    '        yasdT = vec3(1.0, 0.0, 0.0); yasdB = vec3(0.0, 1.0, 0.0);',
                    '    }',
                    '#else',
                    '    baseWorldUv = vWorldPos.xz * 0.45;',
                    '#endif',
                    'yasdUv = baseWorldUv;',
                    'yasdPomShadow = 1.0;',
                    'if (uEnablePom > 0.5 && uHasHeightMap > 0.5) {',
                    '    float vViewDist = distance(cameraPosition, vWorldPos);',
                    '    float pomFade = smoothstep(11.5, 2.5, vViewDist);',
                    '    float edgeMask = 1.0;',
                    '    #ifdef YASD_IS_WALL',
                    '        float distY = (0.5 - abs(vFaceUv.y - 0.5)) * (2.0 * vHalfSpanY);',
                    '        float distX = (0.5 - abs(vFaceUv.x - 0.5)) * vFaceWidthM;',
                    '        edgeMask = smoothstep(0.0, 0.05, min(distY, distX));',
                    '    #endif',
                    '    float effPom = uPomScale * pomFade * edgeMask;',
                    '    vec3 V = normalize(cameraPosition - vWorldPos);',
                    '    float ndotv = max(0.30, abs(dot(yasdN, V)));',
                    '    vec2 maxOffset = vec2(-dot(V, yasdT), -dot(V, yasdB)) * (effPom / ndotv);',
                    '    float hitT = 0.0;',
                    '    float prevT = 0.0;',
                    '    for (int i = 1; i <= 5; i++) {',
                    '        float tStep = float(i) * 0.2;',
                    '        float mapD = 1.0 - texture2D(uHeightMap, baseWorldUv + maxOffset * tStep).r;',
                    '        if (hitT < 0.001 && tStep >= mapD) {',
                    '            hitT = tStep;',
                    '            prevT = tStep - 0.2;',
                    '        }',
                    '    }',
                    '    if (hitT < 0.001) { hitT = 1.0; prevT = 0.8; }',
                    '    float lo = prevT;',
                    '    float hi = hitT;',
                    '    for (int j = 0; j < 2; j++) {',
                    '        float mid = 0.5 * (lo + hi);',
                    '        float mapD = 1.0 - texture2D(uHeightMap, baseWorldUv + maxOffset * mid).r;',
                    '        if (mid >= mapD) hi = mid; else lo = mid;',
                    '    }',
                    '    float finalD = 0.5 * (lo + hi);',
                    '    yasdUv = baseWorldUv + maxOffset * finalD;',
                    '    vec3 L = normalize(uHeroPos - vWorldPos);',
                    '    float ndotl = dot(yasdN, L);',
                    '    float lMask = smoothstep(0.02, 0.16, ndotl) * pomFade * edgeMask;',
                    '    vec2 lOff = vec2(dot(L, yasdT), dot(L, yasdB)) * (effPom * 0.88 / max(0.35, abs(ndotl)));',
                    '    float neighborH = texture2D(uHeightMap, yasdUv + lOff).r;',
                    '    float surfH = 1.0 - finalD;',
                    '    float occ = clamp((neighborH - surfH - 0.035) * 3.1, 0.0, 1.0);',
                    '    yasdPomShadow = mix(1.0, 0.68, occ * lMask);',
                    '}',
                    'yasdNoiseMacro = 0.5;',
                    'yasdNoiseDetail = 0.5;',
                    'if (uHasTerrainNoise > 0.5) {',
                    '    vec2 nCoord = baseWorldUv / 0.45;',
                    '    yasdNoiseMacro = texture2D(uTerrainNoise, nCoord * 0.073).r;',
                    '    yasdNoiseDetail = texture2D(uTerrainNoise, nCoord * 0.29 + vec2(0.37, 0.71)).g;',
                    '}'
                ].join('\n');

                shader.fragmentShader = shader.fragmentShader.replace('#include <logdepthbuf_fragment>', pomAndUvMain);

                // Anti-tiling macro modulation (crevice-gated moss/veins applied after arm.r unpack so 0 Perlin rings ever form!)
                const colorAndGeoFrag = [
                    '#include <color_fragment>',
                    'float antiTileTone = mix(0.92, 1.08, yasdNoiseMacro * 0.65 + yasdNoiseDetail * 0.35);',
                    'diffuseColor.rgb *= antiTileTone * yasdPomShadow;'
                ].join('\n');

                shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', colorAndGeoFrag);

                // arm.r crevice Micro-AO + real-photogrammetry crevice-gated moss/mineral seams + wetness waterline gloss
                const armAndRoughFrag = [
                    '#include <roughnessmap_fragment>',
                    'float aoSample = 1.0;',
                    '#ifdef USE_ROUGHNESSMAP',
                    '    if (uHasArmMap > 0.5) {',
                    '        aoSample = clamp(texelRoughness.r, 0.15, 1.0);',
                    '        diffuseColor.rgb *= mix(1.0, aoSample, 0.68);',
                    '    }',
                    '#endif',
                    'float yasdMacroField = yasdNoiseMacro * 0.66 + yasdNoiseDetail * 0.34;',
                    'float yasdCrevice = (uHasArmMap > 0.5) ? smoothstep(0.60, 0.18, aoSample) : smoothstep(0.68, 0.88, yasdNoiseDetail);',
                    'float yasdVeinCreviceMask = 0.0;',
                    'roughnessFactor = clamp(roughnessFactor * uRoughnessScale * mix(0.92, 1.08, yasdNoiseDetail), 0.08, 1.0);',
                    'if (uMossStrength > 0.005) {',
                    '    float dampBias = clamp(1.0 - max(0.0, vWorldPos.y) * 0.28, 0.22, 1.0);',
                    '    float mossPatch = smoothstep(0.42, 0.78, yasdMacroField * dampBias);',
                    '    float mossMask = clamp(mossPatch * (0.24 + 0.76 * yasdCrevice) * uMossStrength * 1.35, 0.0, 0.76);',
                    '    diffuseColor.rgb = mix(diffuseColor.rgb, uMossColor * (0.72 + 0.42 * aoSample), mossMask);',
                    '    roughnessFactor = mix(roughnessFactor, 0.92, mossMask * 0.65);',
                    '}',
                    'if (uVeinStrength > 0.005) {',
                    '    float veinCrevice = (uHasArmMap > 0.5) ? smoothstep(0.54, 0.16, aoSample) : smoothstep(0.72, 0.92, yasdNoiseDetail);',
                    '    float veinPatch = smoothstep(0.28, 0.70, yasdMacroField);',
                    '    #ifdef YASD_IS_VEIN',
                    '        veinPatch = mix(0.55, 1.0, veinPatch);',
                    '    #endif',
                    '    yasdVeinCreviceMask = clamp(veinCrevice * veinPatch * uVeinStrength, 0.0, 1.0);',
                    '    diffuseColor.rgb = mix(diffuseColor.rgb, uVeinColor, clamp(yasdVeinCreviceMask, 0.0, 0.88));',
                    '    #ifdef YASD_IS_VEIN',
                    '        roughnessFactor = mix(roughnessFactor, 0.16, clamp(yasdVeinCreviceMask * 0.82, 0.0, 0.82));',
                    '    #endif',
                    '}',
                    'if (uWetness > 0.005) {',
                    '    float wlJitter = (yasdNoiseMacro - 0.5) * 0.32;',
                    '    float subLine = 1.0 - smoothstep(uWaterlineH - 0.18, uWaterlineH + 0.22, vWorldPos.y + wlJitter);',
                    '    #ifndef YASD_IS_WALL',
                    '        subLine = smoothstep(0.38, 0.76, yasdNoiseMacro * 0.7 + yasdNoiseDetail * 0.3);',
                    '    #endif',
                    '    float wetMask = clamp(uWetness * (0.35 + 0.65 * subLine), 0.0, 1.0);',
                    '    diffuseColor.rgb *= mix(1.0, 0.64, wetMask);',
                    '    roughnessFactor = mix(roughnessFactor, 0.16, wetMask * 0.82);',
                    '}'
                ].join('\n');

                shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', armAndRoughFrag);

                // Derivative Normal-Map Specular Anti-Aliasing (All GPU Tiers)
                const specAaFrag = [
                    '#include <normal_fragment_maps>',
                    'vec3 dndu = dFdx(normal);',
                    'vec3 dndv = dFdy(normal);',
                    'roughnessFactor = clamp(sqrt(roughnessFactor * roughnessFactor + min(0.32, dot(dndu, dndu) + dot(dndv, dndv))), 0.08, 1.0);'
                ].join('\n');

                shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', specAaFrag);

                // Geological emissive veins + FoW emissive attenuation on mineral veins (strictly crevice-gated!)
                const emissiveGeoFrag = [
                    '#include <emissivemap_fragment>',
                    'float yasdFowVis = 1.0;',
                    '#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)',
                    '    yasdFowVis = clamp(dot(vColor.rgb, vec3(0.3333)) * 1.65, 0.0, 1.0);',
                    '#endif',
                    '#ifdef YASD_IS_VEIN',
                    '    totalEmissiveRadiance *= yasdFowVis;',
                    '#endif',
                    'if (yasdVeinCreviceMask > 0.005) {',
                    '    totalEmissiveRadiance += uVeinEmissive * (yasdVeinCreviceMask * yasdFowVis);',
                    '}'
                ].join('\n');

                shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', emissiveGeoFrag);
            };
        },

        syncWorldPbrUniforms(d3d, texSet) {
            if (!d3d || !d3d._ws81PbrMaterials) return;
            const rawGp = (texSet && texSet.geoProfile) || {};
            const gp = {
                isCavern: Boolean(rawGp.isCavern),
                fixtureArchetype: String(rawGp.fixtureArchetype || 'iron_cresset'),
                wetness: Number.isFinite(rawGp.wetness) ? rawGp.wetness : 0.0,
                waterlineH: Number.isFinite(rawGp.waterlineH) ? rawGp.waterlineH : 0.55,
                mossStrength: Number.isFinite(rawGp.mossStrength) ? rawGp.mossStrength : 0.0,
                mossColor: rawGp.mossColor !== undefined ? rawGp.mossColor : 0x2e5829,
                veinStrength: Number.isFinite(rawGp.veinStrength) ? rawGp.veinStrength : 0.0,
                veinColor: rawGp.veinColor !== undefined ? rawGp.veinColor : 0xa68b5b,
                veinEmissive: rawGp.veinEmissive !== undefined ? rawGp.veinEmissive : 0x000000,
                roughnessScale: Number.isFinite(rawGp.roughnessScale) ? rawGp.roughnessScale : 1.0,
                pomScale: Number.isFinite(rawGp.pomScale) ? rawGp.pomScale : 0.028
            };
            d3d._currentGeoProfile = gp;
            const highGpu = this.isHighGpuTier(d3d);

            for (let i = 0; i < d3d._ws81PbrMaterials.length; i++) {
                const mat = d3d._ws81PbrMaterials[i];
                const u = mat && mat.userData && mat.userData.ws81Uniforms;
                if (!u) continue;
                const isVein = mat.userData.ws81Kind === 'vein';
                let dispTex = null;
                if (texSet) {
                    if (mat === d3d.wallMaterial) dispTex = texSet.wallDisp || null;
                    else if (mat === d3d.permWallMaterial) dispTex = texSet.permWallDisp || texSet.wallDisp || null;
                    else if (mat === d3d.floorMaterial) dispTex = texSet.floorDisp || null;
                    else if (mat === d3d.ceilingMaterial) dispTex = texSet.ceilingDisp || null;
                    else if (mat === d3d.magmaMaterial || mat === d3d.goldVeinMaterial) dispTex = texSet.magmaDisp || null;
                    else if (mat === d3d.quartzMaterial || mat === d3d.gemVeinMaterial) dispTex = texSet.quartzDisp || null;
                }
                if (dispTex) {
                    dispTex.wrapS = THREE.RepeatWrapping;
                    dispTex.wrapT = THREE.RepeatWrapping;
                }
                u.uHeightMap.value = dispTex;
                u.uHasHeightMap.value = dispTex ? 1.0 : 0.0;
                u.uEnablePom.value = (highGpu && dispTex) ? 1.0 : 0.0;
                u.uPomScale.value = isVein ? 0.032 : gp.pomScale;
                const rm = mat.roughnessMap;
                const hasRealArm = Boolean(rm && !rm.isCanvasTexture && !rm.isDataTexture && !rm._isNeutralPlaceholder && !(rm.image && rm.image.tagName === 'CANVAS'));
                u.uHasArmMap.value = hasRealArm ? 1.0 : 0.0;
                u.uTerrainNoise.value = d3d.terrainNoiseTex || null;
                u.uHasTerrainNoise.value = d3d.terrainNoiseTex ? 1.0 : 0.0;

                u.uWetness.value = gp.wetness;
                u.uWaterlineH.value = gp.waterlineH;
                u.uMossStrength.value = isVein ? gp.mossStrength * 0.25 : gp.mossStrength;
                u.uMossColor.value.set(gp.mossColor);
                if (isVein && hasRealArm) {
                    if (mat === d3d.magmaMaterial) {
                        mat.color.setRGB(0.62, 0.56, 0.54);
                        u.uVeinStrength.value = 1.25;
                        u.uVeinColor.value.setHex(0xff6218);
                        u.uVeinEmissive.value.setHex(0xff3b00);
                        u.uRoughnessScale.value = 0.92;
                    } else if (mat === d3d.quartzMaterial) {
                        mat.color.setRGB(0.74, 0.78, 0.85);
                        u.uVeinStrength.value = 1.20;
                        u.uVeinColor.value.setHex(0xeaf4ff);
                        u.uVeinEmissive.value.setHex(0x1e4d6b);
                        u.uRoughnessScale.value = 0.84;
                    } else if (mat === d3d.goldVeinMaterial) {
                        mat.color.setRGB(0.68, 0.63, 0.56);
                        u.uVeinStrength.value = 1.30;
                        u.uVeinColor.value.setHex(0xffcf48);
                        u.uVeinEmissive.value.setHex(0x7c4a03);
                        u.uRoughnessScale.value = 0.78;
                    } else {
                        mat.color.setRGB(0.70, 0.78, 0.82);
                        u.uVeinStrength.value = 1.30;
                        u.uVeinColor.value.setHex(0x5eead4);
                        u.uVeinEmissive.value.setHex(0x0f766e);
                        u.uRoughnessScale.value = 0.78;
                    }
                } else {
                    u.uVeinStrength.value = isVein ? 0.0 : gp.veinStrength;
                    u.uVeinColor.value.set(gp.veinColor);
                    u.uVeinEmissive.value.set(gp.veinEmissive);
                    u.uRoughnessScale.value = gp.roughnessScale;
                }
            }

            this.setWallFixtureArchetype(d3d, gp.fixtureArchetype);
        },

        tickWorldPbrFrame(d3d, tNow) {
            if (!d3d) return;
            const camPos = d3d.camera ? d3d.camera.position : null;
            if (d3d._ws81PbrMaterials && camPos) {
                const noiseTex = d3d.terrainNoiseTex || null;
                const hasNoise = noiseTex ? 1.0 : 0.0;
                const highGpu = this.isHighGpuTier(d3d);
                for (let i = 0; i < d3d._ws81PbrMaterials.length; i++) {
                    const mat = d3d._ws81PbrMaterials[i];
                    const u = mat.userData && mat.userData.ws81Uniforms;
                    if (!u) continue;
                    u.uHeroPos.value.copy(camPos);
                    if (u.uTerrainNoise.value !== noiseTex) {
                        u.uTerrainNoise.value = noiseTex;
                        u.uHasTerrainNoise.value = hasNoise;
                    }
                    const rm = mat.roughnessMap;
                    u.uHasArmMap.value = (rm && !rm.isCanvasTexture && !rm.isDataTexture && !rm._isNeutralPlaceholder && !(rm.image && rm.image.tagName === 'CANVAS')) ? 1.0 : 0.0;
                    u.uEnablePom.value = (highGpu && u.uHasHeightMap.value > 0.5) ? 1.0 : 0.0;
                }
            }
            if (d3d.wallTorchFlameMaterial && d3d.wallTorchFlameMaterial.uniforms) {
                const fu = d3d.wallTorchFlameMaterial.uniforms;
                fu.uTime.value = tNow * 0.001;
                if (d3d.scene && d3d.scene.fog) {
                    fu.uFogColor.value.copy(d3d.scene.fog.color);
                    fu.uFogDensity.value = d3d.scene.fog.density || 0.0;
                }
            }
        },

        // =========================================================================
        // 7C. 9-REALM BIOME PROFILES, 5 WALL FIXTURE ARCHETYPES & CHIAROSCURO
        // =========================================================================

        resolveRealmBiomeProfile(d3d, depth, levelSeed = 0, realm = 'angband', frame = null) {
            const r = String(realm || (d3d && d3d.realm) || 'angband').toLowerCase();
            const winRef = typeof window !== 'undefined' ? window : null;
            const useVar = (!winRef || !winRef.GRAPHICS_CONFIG || winRef.GRAPHICS_CONFIG.biomeVariation) && (levelSeed !== 0);
            const sub = useVar ? (((levelSeed ^ ((depth * 2654435761) >>> 0)) >>> 0) % 4) : 0;
            const branchRaw = String(
                (frame && frame.player && (frame.player.branch || frame.player.branch_name || frame.player.dungeon_branch)) ||
                (frame && (frame.branch || (frame.map && frame.map.branch))) || ''
            );
            const br = branchRaw.toLowerCase();
            const frameBiomeRaw = String(
                (frame && (frame.biomeTheme || (frame.map && frame.map.biomeTheme))) ||
                (d3d && d3d.lastFrame && (d3d.lastFrame.biomeTheme || (d3d.lastFrame.map && d3d.lastFrame.map.biomeTheme))) || ''
            ).toLowerCase();
            const mk = (name, bg, amb, ambE, fog, fogD, exp, tc, te, wc, fc, cc, fr, wr, extra) => ({
                name,
                bgColor: bg,
                ambientColor: amb,
                ambientEnergy: ambE,
                sunLight: Boolean(extra && extra.sunLight),
                sunEnergy: (extra && extra.sunEnergy) || 0.0,
                fogColor: fog,
                fogDensity: fogD,
                exposure: exp,
                torchColor: tc,
                torchEnergy: te,
                wallColor: new THREE.Color(wc[0], wc[1], wc[2]),
                floorColor: new THREE.Color(fc[0], fc[1], fc[2]),
                ceilingColor: new THREE.Color(cc[0], cc[1], cc[2]),
                floorRoughness: fr,
                wallRoughness: wr,
                suppressFixtures: Boolean(extra && extra.suppressFixtures),
                fixtureArchetype: (extra && extra.fixtureArchetype) || null
            });

            if (depth <= 0) {
                if (r === 'hengband') {
                    const n = ['Eastern Overworld (Mount Fuji Foothills)', 'Eastern Overworld (Bamboo Forest Glade)', 'Eastern Overworld (Jingu Shrine Valley)', 'Eastern Overworld (Ancient Pine Sanctuary)'];
                    return mk(n[sub], 0x141e33, 0x948aa3, 0.85, 0x141e33, 0.0035, 1.08, 0xffe099, 2.2, [0.85, 0.85, 0.88], [0.80, 0.78, 0.76], [0.70, 0.70, 0.75], 0.82, 0.80, { sunLight: true, sunEnergy: 1.05, fixtureArchetype: 'sengoku_lantern' });
                }
                if (r === 'frogcomposband') {
                    const n = ['Wilderness Overworld (Verdant Meadow)', 'Wilderness Overworld (Whispering Woods)', 'Wilderness Overworld (Highland Moors)', 'Wilderness Overworld (Sunlit Dale)'];
                    return mk(n[sub], 0x0f1933, 0x8f9eb8, 0.88, 0x0f1933, 0.003, 1.06, 0xffe0a6, 2.2, [0.88, 0.86, 0.82], [0.82, 0.80, 0.78], [0.70, 0.70, 0.75], 0.84, 0.82, { sunLight: true, sunEnergy: 1.10 });
                }
                if (r === 'silq') {
                    return mk('Gates of Thangorodrim (Cold Northern Bastion)', 0x0d1626, 0x7688a6, 0.72, 0x0d1626, 0.0048, 1.04, 0xffc878, 2.3, [0.76, 0.78, 0.84], [0.70, 0.72, 0.76], [0.62, 0.64, 0.70], 0.82, 0.84, { sunLight: true, sunEnergy: 0.82, fixtureArchetype: 'abyssal_brazier' });
                }
                if (r === 'nethack') {
                    return mk('Dungeons of Doom Threshold', 0x12192b, 0x8892ad, 0.82, 0x12192b, 0.0038, 1.05, 0xffd28a, 2.2, [0.84, 0.82, 0.78], [0.78, 0.76, 0.72], [0.68, 0.68, 0.72], 0.82, 0.82, { sunLight: true, sunEnergy: 0.95 });
                }
                if (r === 'dcss') {
                    return mk('Dungeon Approach (Orb Expedition Camp)', 0x101829, 0x8490ab, 0.82, 0x101829, 0.0038, 1.05, 0xffcf88, 2.2, [0.83, 0.83, 0.85], [0.78, 0.78, 0.80], [0.68, 0.70, 0.74], 0.80, 0.80, { sunLight: true, sunEnergy: 0.96 });
                }
                if (r === 'brogue') {
                    return mk('Cavern Mouth (Moonlit Fern Glade)', 0x0c1a24, 0x78989c, 0.80, 0x0c1a24, 0.0042, 1.05, 0x7ef2c8, 2.1, [0.78, 0.84, 0.80], [0.72, 0.80, 0.74], [0.64, 0.70, 0.68], 0.84, 0.84, { sunLight: true, sunEnergy: 0.90, fixtureArchetype: 'bio_crystal' });
                }
                if (r === 'rogue') {
                    return mk('Citadel of Doom Gatehouse', 0x141826, 0x8c8ea6, 0.80, 0x141826, 0.0040, 1.05, 0xffc470, 2.3, [0.84, 0.80, 0.74], [0.78, 0.74, 0.68], [0.66, 0.64, 0.62], 0.84, 0.84, { sunLight: true, sunEnergy: 0.92 });
                }
                if (r === 'ryod') {
                    return mk('Sovereign Realm Overworld', 0x12182c, 0x8894b2, 0.84, 0x12182c, 0.0036, 1.06, 0xffd894, 2.2, [0.85, 0.84, 0.86], [0.79, 0.78, 0.80], [0.68, 0.68, 0.74], 0.82, 0.82, { sunLight: true, sunEnergy: 1.00 });
                }
                const towns = [
                    { n: 'Town (Hobbiton Shire)', bg: 0x121b2d, amb: 0x808aa8, fog: 0x121b2d, wc: [0.85, 0.83, 0.80], fc: [0.80, 0.78, 0.75] },
                    { n: 'Town (Bree Crossroads)', bg: 0x161c29, amb: 0x878d9e, fog: 0x161c29, wc: [0.80, 0.77, 0.73], fc: [0.75, 0.73, 0.70] },
                    { n: 'Town (Gondor Outpost)', bg: 0x10192b, amb: 0x8290b0, fog: 0x10192b, wc: [0.88, 0.88, 0.90], fc: [0.83, 0.84, 0.86] },
                    { n: 'Town (Rivendell Sanctuary)', bg: 0x0f1f26, amb: 0x7a9c99, fog: 0x0f1f26, wc: [0.82, 0.86, 0.83], fc: [0.78, 0.82, 0.79] }
                ][sub];
                return mk(towns.n, towns.bg, towns.amb, 0.85, towns.fog, 0.0038, 1.05, 0xffdc99, 1.8, towns.wc, towns.fc, [0.70, 0.70, 0.72], 0.84, 0.82, { sunLight: true, sunEnergy: 1.05 });
            }

            // Subterranean 9-Realm & Multi-Branch Profiles (Moody Chiaroscuro: ambientEnergy 0.16..0.19)
            let profile = null;
            const ryodBp = (typeof window !== 'undefined' && window.__activeRyodBlueprint) || null;

            if (r === 'ryod') {
                const bpBiome = String(frameBiomeRaw || (ryodBp && ryodBp.biome) || br || '').toLowerCase();
                if (bpBiome.includes('eastern') || bpBiome.includes('shadow_keep') || bpBiome.includes('sengoku') || bpBiome.includes('onmyo')) {
                    profile = mk('RYOD Eastern Sanctum', 0x08070c, 0x5c4c63, 0.17, 0x0b0912, 0.012, 1.12, 0xffb86c, 2.6, [0.76, 0.70, 0.68], [0.68, 0.62, 0.60], [0.52, 0.48, 0.50], 0.76, 0.80, { fixtureArchetype: 'sengoku_lantern' });
                } else if (bpBiome.includes('bio') || bpBiome.includes('sunken') || bpBiome.includes('fung') || bpBiome.includes('spore')) {
                    profile = mk('RYOD Bioluminescent Caverns', 0x040b10, 0x2e646e, 0.18, 0x051017, 0.013, 1.14, 0x4ef2d2, 2.5, [0.58, 0.72, 0.70], [0.52, 0.66, 0.64], [0.42, 0.54, 0.56], 0.68, 0.82, { fixtureArchetype: 'bio_crystal' });
                } else if (bpBiome.includes('volcan') || bpBiome.includes('molten') || bpBiome.includes('forge') || bpBiome.includes('iron_crown') || bpBiome.includes('brimstone')) {
                    profile = mk('RYOD Volcanic Citadel', 0x0d0404, 0x6e3228, 0.17, 0x140605, 0.013, 1.15, 0xff6e2e, 2.8, [0.66, 0.54, 0.50], [0.60, 0.48, 0.44], [0.46, 0.36, 0.34], 0.74, 0.84, { fixtureArchetype: 'abyssal_brazier' });
                } else if (bpBiome.includes('frozen') || bpBiome.includes('glacial') || bpBiome.includes('frost') || bpBiome.includes('rime')) {
                    profile = mk('RYOD Frozen Iron Wastes', 0x050b14, 0x466885, 0.18, 0x07111e, 0.012, 1.14, 0x7dd3fc, 2.5, [0.72, 0.80, 0.88], [0.66, 0.74, 0.84], [0.52, 0.60, 0.70], 0.54, 0.68, { fixtureArchetype: 'iron_cresset' });
                } else if (bpBiome.includes('gilded') || bpBiome.includes('treasury') || bpBiome.includes('golden') || bpBiome.includes('sanctuary') || bpBiome.includes('marble')) {
                    profile = mk('RYOD Sunken Golden Treasury', 0x090806, 0x685b3e, 0.18, 0x0f0c07, 0.011, 1.14, 0xffd27d, 2.65, [0.84, 0.78, 0.64], [0.76, 0.70, 0.56], [0.62, 0.56, 0.44], 0.58, 0.70, { fixtureArchetype: 'sanctuary_brass' });
                } else if (bpBiome.includes('chaos') || bpBiome.includes('void') || bpBiome.includes('eldritch') || bpBiome.includes('abyss')) {
                    profile = mk('RYOD Abyssal Chaos Rift', 0x0a0412, 0x5c3478, 0.17, 0x11071e, 0.013, 1.16, 0xd878ff, 2.75, [0.68, 0.56, 0.78], [0.60, 0.50, 0.72], [0.48, 0.38, 0.58], 0.64, 0.76, { fixtureArchetype: 'abyssal_brazier' });
                } else if (bpBiome.includes('catacomb') || bpBiome.includes('crypt') || bpBiome.includes('gothic') || bpBiome.includes('sepulchre')) {
                    profile = mk('RYOD Gothic Crypts', 0x07080f, 0x505872, 0.17, 0x0a0c16, 0.012, 1.12, 0xffc675, 2.55, [0.76, 0.75, 0.80], [0.70, 0.69, 0.74], [0.56, 0.56, 0.62], 0.72, 0.80, { fixtureArchetype: 'sanctuary_brass' });
                } else {
                    profile = mk('RYOD Obsidian Stronghold', 0x06070c, 0x485064, 0.17, 0x090a11, 0.012, 1.12, 0xffad5c, 2.6, [0.68, 0.69, 0.74], [0.62, 0.63, 0.68], [0.48, 0.50, 0.56], 0.72, 0.80, { fixtureArchetype: 'iron_cresset' });
                }
            } else if (r === 'nethack') {
                if (br.includes('soko')) {
                    profile = mk('Sokoban (Cyclopean Boulder Halls)', 0x0c0e14, 0x6b7385, 0.23, 0x0e1118, 0.009, 1.10, 0xffd591, 2.4, [0.82, 0.79, 0.72], [0.76, 0.73, 0.66], [0.64, 0.62, 0.58], 0.78, 0.80, { suppressFixtures: true });
                } else if (br.includes('mine') || (depth >= 4 && depth <= 9 && (sub & 1) === 1)) {
                    profile = mk('The Gnomish Mines', 0x080706, 0x5c4d3c, 0.17, 0x0c0a08, 0.014, 1.12, 0xffa64d, 2.6, [0.72, 0.63, 0.52], [0.65, 0.57, 0.47], [0.52, 0.45, 0.38], 0.86, 0.88, { fixtureArchetype: 'iron_cresset' });
                } else if (br.includes('astral') || br.includes('plane') || depth >= 46) {
                    profile = mk('The Elemental & Astral Planes', 0x080a16, 0x58689c, 0.19, 0x0b0e1f, 0.011, 1.16, 0x99d6ff, 2.7, [0.82, 0.84, 0.92], [0.76, 0.78, 0.88], [0.64, 0.66, 0.78], 0.58, 0.68, { fixtureArchetype: 'sanctuary_brass' });
                } else if (br.includes('gehennom') || br.includes('hell') || br.includes('vlad') || depth >= 26) {
                    profile = mk('Gehennom (Valley of the Dead & Brimstone)', 0x0e0404, 0x6e2c24, 0.16, 0x150605, 0.014, 1.16, 0xff6224, 2.8, [0.66, 0.48, 0.44], [0.58, 0.42, 0.38], [0.46, 0.32, 0.30], 0.78, 0.86, { fixtureArchetype: 'abyssal_brazier' });
                } else if (br.includes('castle') || br.includes('knox') || (depth >= 20 && depth <= 25)) {
                    profile = mk('The Castle Stronghold', 0x07090f, 0x4e5870, 0.17, 0x0a0d15, 0.012, 1.12, 0xffc266, 2.6, [0.76, 0.77, 0.80], [0.70, 0.71, 0.75], [0.56, 0.58, 0.62], 0.70, 0.76, { fixtureArchetype: 'sanctuary_brass' });
                } else {
                    profile = mk('The Dungeons of Doom', 0x07080d, 0x4c5468, 0.17, 0x0a0c13, 0.012, 1.12, 0xffb35c, 2.6, [0.75, 0.73, 0.69], [0.68, 0.66, 0.62], [0.54, 0.53, 0.50], 0.78, 0.82, { fixtureArchetype: 'iron_cresset' });
                }
            } else if (r === 'dcss') {
                if (br.includes('temple') || br.includes('elf') || br.includes('vault')) {
                    profile = mk('Ecumenical Vaults & Elven Halls', 0x070912, 0x526080, 0.18, 0x0a0d19, 0.011, 1.13, 0xffd480, 2.6, [0.80, 0.81, 0.86], [0.74, 0.75, 0.82], [0.60, 0.62, 0.70], 0.62, 0.72, { fixtureArchetype: 'sanctuary_brass' });
                } else if (br.includes('lair') || br.includes('swamp') || br.includes('spider') || br.includes('snake') || br.includes('shoal')) {
                    profile = mk('The Lair of Beasts', 0x050c09, 0x386352, 0.18, 0x07120d, 0.013, 1.13, 0x6ee7b7, 2.5, [0.62, 0.74, 0.64], [0.56, 0.68, 0.58], [0.44, 0.54, 0.46], 0.74, 0.84, { fixtureArchetype: 'bio_crystal' });
                } else if (br.includes('orc')) {
                    profile = mk('The Orcish Mines', 0x090705, 0x614b38, 0.17, 0x0e0a07, 0.014, 1.12, 0xff9e44, 2.7, [0.72, 0.60, 0.48], [0.64, 0.54, 0.44], [0.50, 0.42, 0.34], 0.86, 0.88, { fixtureArchetype: 'iron_cresset' });
                } else if (br.includes('zot') || br.includes('pan') || br.includes('hell') || br.includes('abyss') || depth >= 22) {
                    profile = mk('The Realm of Zot', 0x0b0512, 0x603878, 0.17, 0x11081c, 0.013, 1.16, 0xd878ff, 2.8, [0.70, 0.60, 0.78], [0.64, 0.54, 0.72], [0.50, 0.42, 0.60], 0.66, 0.76, { fixtureArchetype: 'abyssal_brazier' });
                } else if (br.includes('depth') || depth >= 14) {
                    profile = mk('The Depths', 0x060810, 0x46526e, 0.17, 0x090c17, 0.013, 1.14, 0xffaa55, 2.7, [0.68, 0.70, 0.76], [0.62, 0.64, 0.70], [0.48, 0.50, 0.58], 0.74, 0.80, { fixtureArchetype: 'iron_cresset' });
                } else {
                    profile = mk('DCSS Subterranean Dungeon', 0x060810, 0x465470, 0.16, 0x080b14, 0.013, 1.12, 0xffab52, 2.25, [0.56, 0.60, 0.68], [0.54, 0.57, 0.64], [0.44, 0.46, 0.54], 0.78, 0.82, { fixtureArchetype: 'iron_cresset' });
                }
            } else if (r === 'brogue') {
                if (depth <= 10) {
                    profile = mk('Bioluminescent Limestone Caverns', 0x050b0e, 0x3b6370, 0.17, 0x060d12, 0.013, 1.13, 0x5eead4, 2.35, [0.50, 0.62, 0.68], [0.46, 0.58, 0.62], [0.38, 0.48, 0.54], 0.70, 0.80, { fixtureArchetype: 'bio_crystal' });
                } else if (depth <= 15) {
                    profile = mk('Subterranean Goblin Mire', 0x050b09, 0x386155, 0.18, 0x07110e, 0.014, 1.13, 0x5eead4, 2.4, [0.52, 0.64, 0.58], [0.48, 0.60, 0.54], [0.38, 0.48, 0.44], 0.68, 0.84, { fixtureArchetype: 'bio_crystal' });
                } else if (depth <= 20) {
                    profile = mk('Bioluminescent Fungal Grottoes', 0x040912, 0x325b78, 0.18, 0x060e1a, 0.013, 1.15, 0x38bdf8, 2.5, [0.54, 0.66, 0.78], [0.48, 0.60, 0.70], [0.38, 0.48, 0.58], 0.66, 0.80, { fixtureArchetype: 'bio_crystal' });
                } else {
                    profile = mk('Brimstone & Lumenstone Sanctum', 0x0e0404, 0x703024, 0.17, 0x150605, 0.013, 1.16, 0xff6b2b, 2.8, [0.68, 0.52, 0.48], [0.60, 0.46, 0.42], [0.48, 0.36, 0.34], 0.72, 0.82, { fixtureArchetype: 'abyssal_brazier' });
                }
            } else if (r === 'rogue') {
                if (depth <= 9) {
                    profile = mk('Dungeons of Doom (Amber Torch Halls)', 0x07070c, 0x4c4c60, 0.16, 0x090910, 0.013, 1.12, 0xffab47, 2.25, [0.58, 0.60, 0.66], [0.54, 0.56, 0.62], [0.44, 0.46, 0.52], 0.80, 0.84, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 18) {
                    profile = mk('Mazes of Menace', 0x06080e, 0x485268, 0.17, 0x090c14, 0.013, 1.13, 0xff9f43, 2.5, [0.60, 0.62, 0.68], [0.56, 0.58, 0.64], [0.46, 0.48, 0.54], 0.76, 0.82, { fixtureArchetype: 'iron_cresset' });
                } else {
                    profile = mk('Sanctum of the Amulet of Yendor', 0x0b0508, 0x663848, 0.17, 0x12080d, 0.013, 1.16, 0xff7038, 2.8, [0.72, 0.58, 0.60], [0.66, 0.52, 0.54], [0.52, 0.40, 0.42], 0.68, 0.78, { fixtureArchetype: 'abyssal_brazier' });
                }
            } else if (r === 'silq') {
                if (depth <= 6) {
                    profile = mk('Guardrooms of Angband', 0x06080d, 0x465266, 0.16, 0x080b12, 0.013, 1.12, 0xffab52, 2.25, [0.56, 0.60, 0.68], [0.52, 0.56, 0.62], [0.42, 0.46, 0.52], 0.80, 0.84, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 13) {
                    profile = mk('Cold Iron Forges of Thangorodrim', 0x080607, 0x59423c, 0.16, 0x0d090a, 0.014, 1.14, 0xff8438, 2.7, [0.66, 0.58, 0.56], [0.60, 0.52, 0.50], [0.46, 0.40, 0.38], 0.76, 0.84, { fixtureArchetype: 'abyssal_brazier' });
                } else if (depth <= 19) {
                    profile = mk('Vaults of Dread & Shadow', 0x05060b, 0x3e4661, 0.16, 0x070911, 0.014, 1.15, 0xff7733, 2.7, [0.62, 0.64, 0.70], [0.56, 0.58, 0.64], [0.44, 0.46, 0.52], 0.72, 0.80, { fixtureArchetype: 'abyssal_brazier' });
                } else {
                    profile = mk('Throne Hall of Morgoth', 0x090304, 0x612828, 0.16, 0x110506, 0.014, 1.18, 0xff5522, 2.9, [0.60, 0.46, 0.46], [0.54, 0.40, 0.40], [0.42, 0.30, 0.30], 0.68, 0.78, { fixtureArchetype: 'abyssal_brazier' });
                }
            } else if (r === 'hengband') {
                if (depth <= 12) {
                    profile = mk('Sengoku Castle Keep &Tenshu', 0x08070c, 0x5c4d63, 0.17, 0x0c0a12, 0.012, 1.12, 0xffbe73, 2.4, [0.62, 0.64, 0.70], [0.58, 0.60, 0.66], [0.46, 0.48, 0.54], 0.76, 0.80, { fixtureArchetype: 'sengoku_lantern' });
                } else if (depth <= 28) {
                    profile = mk('Onmyo Spirit Labyrinth', 0x060812, 0x485478, 0.17, 0x090c1a, 0.013, 1.13, 0xffa86b, 2.6, [0.72, 0.72, 0.80], [0.66, 0.66, 0.74], [0.52, 0.52, 0.62], 0.72, 0.78, { fixtureArchetype: 'sengoku_lantern' });
                } else if (depth <= 50) {
                    profile = mk('Dragon Veins & Jade Caverns', 0x050b0d, 0x3b636b, 0.17, 0x071014, 0.013, 1.14, 0x5eead4, 2.6, [0.64, 0.74, 0.74], [0.58, 0.68, 0.68], [0.46, 0.56, 0.56], 0.68, 0.80, { fixtureArchetype: 'bio_crystal' });
                } else if (depth <= 75) {
                    profile = mk('Yomi Underworld', 0x0a050d, 0x5c3a6e, 0.17, 0x0f0714, 0.014, 1.16, 0xc084fc, 2.7, [0.68, 0.60, 0.74], [0.62, 0.54, 0.68], [0.48, 0.42, 0.56], 0.70, 0.78, { fixtureArchetype: 'abyssal_brazier' });
                } else {
                    profile = mk('Palace of the Serpent of Chaos', 0x0e0406, 0x6e2838, 0.16, 0x160609, 0.014, 1.18, 0xff5938, 2.9, [0.68, 0.48, 0.52], [0.60, 0.42, 0.46], [0.48, 0.32, 0.36], 0.66, 0.76, { fixtureArchetype: 'abyssal_brazier' });
                }
            } else if (r === 'frogcomposband') {
                if (depth <= 14) {
                    profile = mk('Barrow-Downs & Stronghold Cellars', 0x06080e, 0x48566c, 0.16, 0x090c14, 0.013, 1.12, 0xffab52, 2.25, [0.54, 0.60, 0.68], [0.52, 0.56, 0.63], [0.42, 0.46, 0.52], 0.78, 0.82, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 30) {
                    profile = mk('Orc Caves & Morannon Tunnels', 0x090705, 0x5e4a38, 0.17, 0x0d0a07, 0.014, 1.13, 0xff9940, 2.7, [0.72, 0.62, 0.52], [0.64, 0.56, 0.46], [0.50, 0.44, 0.36], 0.84, 0.88, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 48) {
                    profile = mk('Fungal Mire & Endless Labyrinth', 0x050b0b, 0x3b6363, 0.18, 0x071111, 0.013, 1.14, 0x4ef2d2, 2.6, [0.62, 0.72, 0.70], [0.56, 0.66, 0.64], [0.44, 0.54, 0.52], 0.70, 0.82, { fixtureArchetype: 'bio_crystal' });
                } else if (depth <= 72) {
                    profile = mk('Camelot & Halls of Olympus', 0x070912, 0x546282, 0.18, 0x0b0e1c, 0.011, 1.15, 0xffd685, 2.7, [0.80, 0.81, 0.86], [0.74, 0.75, 0.82], [0.60, 0.62, 0.70], 0.62, 0.72, { fixtureArchetype: 'sanctuary_brass' });
                } else {
                    profile = mk('Abyss of Chaos', 0x0d0407, 0x6c2c3e, 0.16, 0x15060b, 0.014, 1.18, 0xff5c33, 2.9, [0.68, 0.50, 0.54], [0.60, 0.44, 0.48], [0.48, 0.34, 0.38], 0.68, 0.78, { fixtureArchetype: 'abyssal_brazier' });
                }
            } else {
                // Canonical Angband 9 Depth Strata with 4 procedural sub-themes each (cold subterranean slate sculpted by warm firelight)
                if (depth <= 4) {
                    const t = [
                        ['Sewers & Guardrooms (Cold Slate Ashlar)', 0x06080e, 0x44526c, 0x080b12, 0xffab52, [0.52, 0.58, 0.68], [0.50, 0.55, 0.63], [0.40, 0.45, 0.54], 0.80, 0.82],
                        ['Mossy Cisterns', 0x050a0a, 0x3e5c56, 0x070e0e, 0xffb25e, [0.50, 0.60, 0.64], [0.48, 0.56, 0.60], [0.38, 0.46, 0.50], 0.74, 0.84],
                        ['Torchlit Barracks', 0x07070c, 0x4c4a62, 0x0a0911, 0xffa44c, [0.56, 0.58, 0.66], [0.52, 0.54, 0.62], [0.42, 0.44, 0.52], 0.82, 0.82],
                        ['Forgotten Cellars', 0x06070c, 0x444c64, 0x080a12, 0xffad58, [0.53, 0.57, 0.67], [0.50, 0.54, 0.63], [0.40, 0.44, 0.53], 0.80, 0.84]
                    ][sub];
                    profile = mk(t[0], t[1], t[2], 0.16, t[3], 0.012, 1.10, t[4], 2.2, t[5], t[6], t[7], t[8], t[9], { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 8) {
                    profile = mk('Sunken Sewers & Cisterns', 0x050a0d, 0x3e5c68, 0.17, 0x070f14, 0.013, 1.12, 0xffbe73, 2.5, [0.66, 0.73, 0.74], [0.60, 0.67, 0.68], [0.48, 0.54, 0.56], 0.64, 0.80, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 12) {
                    profile = mk('Goblin Mines & Timber Shafts', 0x090705, 0x5e4c3a, 0.17, 0x0d0a07, 0.013, 1.12, 0xffa64d, 2.6, [0.74, 0.64, 0.54], [0.66, 0.58, 0.48], [0.52, 0.46, 0.38], 0.86, 0.88, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 16) {
                    profile = mk('Fungal Grottoes & Spore Caves', 0x040b0b, 0x366260, 0.18, 0x061111, 0.013, 1.14, 0x4ef2d2, 2.5, [0.60, 0.72, 0.68], [0.54, 0.66, 0.62], [0.44, 0.54, 0.52], 0.70, 0.82, { fixtureArchetype: 'bio_crystal' });
                } else if (depth <= 20) {
                    profile = mk('Dwarven Mithril Delvings', 0x07080e, 0x4c5670, 0.17, 0x0a0c15, 0.012, 1.13, 0xffc875, 2.6, [0.75, 0.76, 0.80], [0.69, 0.70, 0.75], [0.56, 0.58, 0.64], 0.72, 0.76, { fixtureArchetype: 'sanctuary_brass' });
                } else if (depth <= 35) {
                    profile = mk('Catacombs & Barrow Crypts', 0x06060c, 0x484664, 0.17, 0x090912, 0.013, 1.14, 0xffa858, 2.6, [0.68, 0.67, 0.74], [0.62, 0.61, 0.68], [0.48, 0.48, 0.56], 0.76, 0.80, { fixtureArchetype: 'iron_cresset' });
                } else if (depth <= 60) {
                    profile = mk('Obsidian Halls of Dread', 0x08050b, 0x543c66, 0.16, 0x0c0711, 0.013, 1.16, 0xff8844, 2.7, [0.66, 0.60, 0.70], [0.60, 0.54, 0.64], [0.46, 0.42, 0.52], 0.64, 0.74, { fixtureArchetype: 'abyssal_brazier' });
                } else if (depth <= 85) {
                    profile = mk('Volcanic Forges of Angband', 0x0d0404, 0x6c2e24, 0.16, 0x140605, 0.014, 1.18, 0xff6224, 2.8, [0.68, 0.50, 0.46], [0.60, 0.44, 0.40], [0.48, 0.34, 0.32], 0.72, 0.82, { fixtureArchetype: 'abyssal_brazier' });
                } else {
                    profile = mk('Pits of Utumno & Morgoth', 0x0a0305, 0x662432, 0.16, 0x120508, 0.014, 1.20, 0xff5228, 2.9, [0.64, 0.46, 0.48], [0.56, 0.40, 0.42], [0.44, 0.30, 0.32], 0.66, 0.76, { fixtureArchetype: 'abyssal_brazier' });
                }
            }

            // Optional CARTRIDGES[realm].biomeBranches declarative overrides
            const cartBranches = (typeof window !== 'undefined' && window.CARTRIDGES && window.CARTRIDGES[r] && window.CARTRIDGES[r].biomeBranches) || null;
            if (cartBranches && br) {
                const matchKey = Object.keys(cartBranches).find((k) => br.includes(k.toLowerCase()));
                const ov = matchKey ? cartBranches[matchKey] : null;
                if (ov && typeof ov === 'object') {
                    if (ov.name) profile.name = ov.name;
                    if (ov.ambientColor !== undefined) profile.ambientColor = ov.ambientColor;
                    if (ov.fogColor !== undefined) { profile.fogColor = ov.fogColor; profile.bgColor = ov.fogColor; }
                    if (ov.torchColor !== undefined) profile.torchColor = ov.torchColor;
                    if (ov.suppressFixtures !== undefined) profile.suppressFixtures = Boolean(ov.suppressFixtures);
                    if (ov.fixtureArchetype) profile.fixtureArchetype = ov.fixtureArchetype;
                }
            }
            return profile;
        },

        initWallFixtureArchetypes(d3d, createMergedBoxGeometry) {
            if (!d3d || typeof createMergedBoxGeometry !== 'function') return;

            // 5 distinct architectural wall fixture vessels + matching flame/bioluminescent cores
            const geos = {
                iron_cresset: createMergedBoxGeometry([
                    { pos: [0, -0.02, 0.016], size: [0.11, 0.28, 0.032], color: [0.22, 0.22, 0.24] },
                    { pos: [0, -0.03, 0.11], size: [0.046, 0.046, 0.19], color: [0.24, 0.23, 0.25] },
                    { pos: [0, -0.09, 0.09], size: [0.036, 0.16, 0.036], rotX: -0.68, color: [0.20, 0.20, 0.22] },
                    { type: 'cylinder', rTop: 0.088, rBottom: 0.048, height: 0.12, segments: 8, pos: [0, 0.06, 0.20], color: [0.25, 0.24, 0.26] },
                    { type: 'torus', radius: 0.086, tube: 0.014, radialSegments: 6, tubularSegments: 12, rotX: Math.PI / 2, pos: [0, 0.12, 0.20], color: [0.28, 0.27, 0.29] },
                    { type: 'cylinder', rTop: 0.068, rBottom: 0.042, height: 0.045, segments: 8, pos: [0, 0.09, 0.20], color: [0.95, 0.34, 0.08] }
                ]),
                sengoku_lantern: createMergedBoxGeometry([
                    { pos: [0, 0.08, 0.016], size: [0.10, 0.30, 0.032], color: [0.24, 0.16, 0.12] },
                    { pos: [0, 0.19, 0.12], size: [0.05, 0.045, 0.23], color: [0.26, 0.17, 0.13] },
                    { type: 'cone', radius: 0.135, height: 0.085, segments: 6, pos: [0, 0.13, 0.20], color: [0.20, 0.21, 0.24] },
                    { pos: [-0.058, 0.00, 0.142], size: [0.018, 0.20, 0.018], color: [0.20, 0.14, 0.10] },
                    { pos: [0.058, 0.00, 0.142], size: [0.018, 0.20, 0.018], color: [0.20, 0.14, 0.10] },
                    { pos: [-0.058, 0.00, 0.258], size: [0.018, 0.20, 0.018], color: [0.20, 0.14, 0.10] },
                    { pos: [0.058, 0.00, 0.258], size: [0.018, 0.20, 0.018], color: [0.20, 0.14, 0.10] },
                    { pos: [0, -0.10, 0.20], size: [0.14, 0.03, 0.14], color: [0.22, 0.22, 0.24] }
                ]),
                bio_crystal: createMergedBoxGeometry([
                    { pos: [0, -0.03, 0.035], size: [0.18, 0.20, 0.08], rotZ: 0.22, color: [0.20, 0.25, 0.26] },
                    { pos: [-0.04, -0.06, 0.06], size: [0.13, 0.14, 0.09], rotY: 0.35, color: [0.18, 0.22, 0.24] },
                    { pos: [0.05, -0.05, 0.06], size: [0.12, 0.13, 0.08], rotY: -0.30, color: [0.22, 0.27, 0.28] }
                ]),
                sanctuary_brass: createMergedBoxGeometry([
                    { type: 'cylinder', rTop: 0.085, rBottom: 0.085, height: 0.03, segments: 14, rotX: Math.PI / 2, pos: [0, 0.00, 0.016], color: [0.82, 0.66, 0.30] },
                    { pos: [0, -0.02, 0.11], size: [0.042, 0.042, 0.18], color: [0.78, 0.62, 0.28] },
                    { type: 'cylinder', rTop: 0.105, rBottom: 0.042, height: 0.09, segments: 14, pos: [0, 0.06, 0.20], color: [0.88, 0.72, 0.34] },
                    { type: 'torus', radius: 0.10, tube: 0.014, radialSegments: 8, tubularSegments: 16, rotX: Math.PI / 2, pos: [0, 0.105, 0.20], color: [0.94, 0.78, 0.38] },
                    { type: 'cylinder', rTop: 0.082, rBottom: 0.052, height: 0.03, segments: 12, pos: [0, 0.095, 0.20], color: [0.96, 0.46, 0.12] }
                ]),
                abyssal_brazier: createMergedBoxGeometry([
                    { pos: [0, -0.01, 0.018], size: [0.13, 0.30, 0.036], color: [0.16, 0.15, 0.17] },
                    { pos: [-0.05, 0.01, 0.12], size: [0.032, 0.05, 0.20], rotY: -0.14, color: [0.18, 0.16, 0.18] },
                    { pos: [0.05, 0.01, 0.12], size: [0.032, 0.05, 0.20], rotY: 0.14, color: [0.18, 0.16, 0.18] },
                    { type: 'cylinder', rTop: 0.108, rBottom: 0.062, height: 0.12, segments: 8, pos: [0, 0.05, 0.21], color: [0.18, 0.16, 0.18] },
                    { type: 'cone', radius: 0.025, height: 0.09, segments: 6, rotX: 0.45, pos: [0, 0.11, 0.30], color: [0.24, 0.20, 0.22] },
                    { type: 'cylinder', rTop: 0.088, rBottom: 0.058, height: 0.04, segments: 8, pos: [0, 0.095, 0.21], color: [1.00, 0.26, 0.06] }
                ])
            };

            const flameProfile = [[0.00, 0.00], [0.068, 0.03], [0.074, 0.09], [0.046, 0.17], [0.018, 0.24], [0.00, 0.29]];
            const flameGeos = {
                iron_cresset: createMergedBoxGeometry([
                    { type: 'lathe', points: flameProfile, segments: 12, pos: [0, 0.10, 0.20], color: [1.0, 0.72, 0.24] },
                    { type: 'cone', radius: 0.042, height: 0.18, segments: 10, pos: [0, 0.18, 0.20], color: [1.0, 0.94, 0.76] }
                ]),
                sengoku_lantern: createMergedBoxGeometry([
                    { type: 'cylinder', rTop: 0.054, rBottom: 0.054, height: 0.17, segments: 12, pos: [0, 0.00, 0.20], color: [1.0, 0.82, 0.44] },
                    { type: 'cone', radius: 0.028, height: 0.10, segments: 8, pos: [0, 0.00, 0.20], color: [1.0, 0.95, 0.80] }
                ]),
                bio_crystal: createMergedBoxGeometry([
                    { type: 'cylinder', rTop: 0.012, rBottom: 0.040, height: 0.24, segments: 6, rotX: 0.55, pos: [0, 0.05, 0.15], color: [0.35, 0.98, 0.86] },
                    { type: 'cylinder', rTop: 0.010, rBottom: 0.032, height: 0.19, segments: 6, rotX: 0.42, rotZ: 0.36, pos: [-0.055, 0.02, 0.13], color: [0.42, 0.86, 1.00] },
                    { type: 'cylinder', rTop: 0.010, rBottom: 0.030, height: 0.18, segments: 6, rotX: 0.46, rotZ: -0.34, pos: [0.055, 0.01, 0.13], color: [0.55, 1.00, 0.78] }
                ]),
                sanctuary_brass: createMergedBoxGeometry([
                    { type: 'lathe', points: flameProfile, segments: 14, pos: [0, 0.105, 0.20], color: [1.0, 0.82, 0.34] },
                    { type: 'cone', radius: 0.038, height: 0.17, segments: 10, pos: [0, 0.18, 0.20], color: [1.0, 0.96, 0.82] }
                ]),
                abyssal_brazier: createMergedBoxGeometry([
                    { type: 'lathe', points: flameProfile, segments: 12, scale: [1.18, 1.15, 1.18], pos: [0, 0.10, 0.21], color: [1.0, 0.46, 0.18] },
                    { type: 'cone', radius: 0.048, height: 0.21, segments: 10, pos: [0, 0.19, 0.21], color: [1.0, 0.86, 0.58] }
                ])
            };

            d3d._wallFixtureGeos = geos;
            d3d._wallFixtureFlameGeos = flameGeos;
            d3d._activeFixtureArchetype = 'iron_cresset';

            if (d3d.wallTorchMaterial) {
                d3d.wallTorchMaterial.roughness = 0.42;
                d3d.wallTorchMaterial.metalness = 0.82;
                d3d.wallTorchMaterial.vertexColors = true;
            }

            // ACES-calibrated procedural GLSL flame & bioluminescence ShaderMaterial (zero chalky white clipping!)
            d3d.wallTorchFlameMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0.0 },
                    uBioMode: { value: 0.0 },
                    uColorCore: { value: new THREE.Color(1.28, 0.96, 0.48) },
                    uColorMid: { value: new THREE.Color(1.08, 0.46, 0.10) },
                    uColorTip: { value: new THREE.Color(0.52, 0.10, 0.02) },
                    uFogColor: { value: new THREE.Color(0x080a0f) },
                    uFogDensity: { value: 0.024 }
                },
                vertexShader: [
                    'varying vec3 vLocalPos;',
                    'varying vec3 vInstTint;',
                    'varying float vPhase;',
                    'varying float vFogDepth;',
                    'uniform float uTime;',
                    'uniform float uBioMode;',
                    'void main() {',
                    '    vec3 p = position;',
                    '    float hNorm = clamp((p.y + 0.08) / 0.34, 0.0, 1.0);',
                    '    float phase = 0.0;',
                    '    vec3 instCol = color;',
                    '    #ifdef USE_INSTANCING',
                    '        phase = instanceMatrix[3].x * 1.73 + instanceMatrix[3].z * 2.39;',
                    '    #endif',
                    '    #ifdef USE_INSTANCING_COLOR',
                    '        instCol *= instanceColor;',
                    '    #endif',
                    '    if (uBioMode < 0.25) {',
                    '        float swayX = sin(uTime * 6.4 + phase + hNorm * 4.2) * 0.018 * hNorm * hNorm;',
                    '        float swayZ = cos(uTime * 5.1 + phase * 1.3 + hNorm * 3.6) * 0.014 * hNorm * hNorm;',
                    '        float stretch = 1.0 + sin(uTime * 8.3 + phase * 0.7) * 0.07 * hNorm;',
                    '        p.x += swayX;',
                    '        p.z += swayZ;',
                    '        p.y = (p.y - 0.10) * stretch + 0.10;',
                    '    }',
                    '    vec4 mvPos = vec4(p, 1.0);',
                    '    #ifdef USE_INSTANCING',
                    '        mvPos = instanceMatrix * mvPos;',
                    '    #endif',
                    '    mvPos = modelViewMatrix * mvPos;',
                    '    vLocalPos = p;',
                    '    vInstTint = instCol;',
                    '    vPhase = phase;',
                    '    vFogDepth = -mvPos.z;',
                    '    gl_Position = projectionMatrix * mvPos;',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'varying vec3 vLocalPos;',
                    'varying vec3 vInstTint;',
                    'varying float vPhase;',
                    'varying float vFogDepth;',
                    'uniform float uTime;',
                    'uniform float uBioMode;',
                    'uniform vec3 uColorCore;',
                    'uniform vec3 uColorMid;',
                    'uniform vec3 uColorTip;',
                    'uniform vec3 uFogColor;',
                    'uniform float uFogDensity;',
                    'void main() {',
                    '    float h = clamp((vLocalPos.y + 0.08) / 0.32, 0.0, 1.0);',
                    '    float rad = clamp(length(vLocalPos.xz - vec2(0.0, 0.19)) / 0.085, 0.0, 1.0);',
                    '    float n1 = sin(vLocalPos.y * 26.0 - uTime * 7.8 + vPhase + vLocalPos.x * 18.0);',
                    '    float n2 = cos(vLocalPos.y * 41.0 - uTime * 11.4 - vPhase * 1.4 + vLocalPos.z * 21.0);',
                    '    float turb = 0.5 + 0.5 * (n1 * 0.62 + n2 * 0.38);',
                    '    vec3 col;',
                    '    float alpha;',
                    '    if (uBioMode > 0.75) {',
                    '        float pulse = 0.78 + 0.22 * sin(uTime * 2.4 + vPhase);',
                    '        float band = 0.5 + 0.5 * sin(vLocalPos.y * 34.0 - uTime * 1.8 + vPhase);',
                    '        col = mix(uColorMid, uColorCore, clamp((1.0 - h * 0.55) * 0.65 + band * 0.35, 0.0, 1.0)) * pulse;',
                    '        alpha = 0.90;',
                    '    } else if (uBioMode > 0.25) {',
                    '        float flicker = 0.88 + 0.12 * sin(uTime * 4.2 + vPhase) * cos(uTime * 7.1 + vPhase * 0.6);',
                    '        col = mix(uColorTip, uColorCore, clamp(1.0 - abs(vLocalPos.y) * 5.2, 0.15, 1.0)) * flicker;',
                    '        alpha = 0.93;',
                    '    } else {',
                    '        float grad = clamp(1.0 - h * 0.88 - rad * 0.32 + (turb - 0.5) * 0.28, 0.0, 1.0);',
                    '        col = grad > 0.52 ? mix(uColorMid, uColorCore, (grad - 0.52) / 0.48) : mix(uColorTip, uColorMid, grad / 0.52);',
                    '        alpha = clamp((1.0 - h * 0.55) * (0.78 + 0.22 * turb), 0.22, 0.95);',
                    '    }',
                    '    float fowScale = clamp(max(vInstTint.r, max(vInstTint.g, vInstTint.b)), 0.0, 1.0);',
                    '    col *= mix(0.28, 1.0, fowScale);',
                    '    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);',
                    '    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));',
                    '    gl_FragColor = vec4(col, alpha * mix(0.45, 1.0, fowScale));',
                    '}'
                ].join('\n'),
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                vertexColors: true
            });

            if (d3d.wallTorchMesh) d3d.wallTorchMesh.geometry = geos.iron_cresset;
            if (d3d.wallTorchFlameMesh) {
                d3d.wallTorchFlameMesh.geometry = flameGeos.iron_cresset;
                d3d.wallTorchFlameMesh.material = d3d.wallTorchFlameMaterial;
            }

            // 2 pooled dynamic PointLights for nearest visible sconces on performance/ultra discrete GPUs
            if (!d3d._sconceLights && d3d.scene) {
                d3d._sconceLights = [];
                for (let i = 0; i < 2; i++) {
                    const sl = new THREE.PointLight(0xffaa44, 0.0, 11.5, 1.35);
                    sl.visible = false;
                    d3d.scene.add(sl);
                    d3d._sconceLights.push(sl);
                }
            }
        },

        setWallFixtureArchetype(d3d, archetype) {
            if (!d3d || !d3d._wallFixtureGeos || !d3d._wallFixtureFlameGeos) return;
            const key = d3d._wallFixtureGeos[archetype] ? archetype : 'iron_cresset';
            if (d3d._activeFixtureArchetype !== key) {
                d3d._activeFixtureArchetype = key;
                if (d3d.wallTorchMesh) d3d.wallTorchMesh.geometry = d3d._wallFixtureGeos[key];
                if (d3d.wallTorchFlameMesh) d3d.wallTorchFlameMesh.geometry = d3d._wallFixtureFlameGeos[key];
            }
            const fm = d3d.wallTorchFlameMaterial;
            if (fm && fm.uniforms) {
                const u = fm.uniforms;
                if (key === 'bio_crystal') {
                    u.uBioMode.value = 1.0;
                    u.uColorCore.value.setRGB(0.48, 1.24, 1.08);
                    u.uColorMid.value.setRGB(0.14, 0.78, 0.92);
                    u.uColorTip.value.setRGB(0.06, 0.28, 0.46);
                } else if (key === 'sengoku_lantern') {
                    u.uBioMode.value = 0.5;
                    u.uColorCore.value.setRGB(1.22, 0.92, 0.48);
                    u.uColorMid.value.setRGB(0.96, 0.56, 0.20);
                    u.uColorTip.value.setRGB(0.54, 0.24, 0.08);
                } else if (key === 'sanctuary_brass') {
                    u.uBioMode.value = 0.0;
                    u.uColorCore.value.setRGB(1.30, 1.04, 0.56);
                    u.uColorMid.value.setRGB(1.06, 0.62, 0.16);
                    u.uColorTip.value.setRGB(0.56, 0.20, 0.04);
                } else if (key === 'abyssal_brazier') {
                    u.uBioMode.value = 0.0;
                    u.uColorCore.value.setRGB(1.32, 0.78, 0.32);
                    u.uColorMid.value.setRGB(1.14, 0.28, 0.08);
                    u.uColorTip.value.setRGB(0.58, 0.06, 0.14);
                } else {
                    u.uBioMode.value = 0.0;
                    u.uColorCore.value.setRGB(1.28, 0.96, 0.48);
                    u.uColorMid.value.setRGB(1.08, 0.46, 0.10);
                    u.uColorTip.value.setRGB(0.52, 0.10, 0.02);
                }
            }
        },

        collectActiveWallSconces(d3d, map, w, h, minX, maxX, minY, maxY, px, py, depth, outdoors, biome) {
            const list = d3d._activeWallSconces || (d3d._activeWallSconces = []);
            list.length = 0;
            const hideLights = () => {
                if (d3d._sconceLights) {
                    for (let i = 0; i < d3d._sconceLights.length; i++) {
                        d3d._sconceLights[i].visible = false;
                        d3d._sconceLights[i].intensity = 0;
                    }
                }
            };
            if (!d3d || !map || outdoors || (biome && biome.suppressFixtures)) {
                hideLights();
                return list;
            }
            if (biome && biome.fixtureArchetype) {
                this.setWallFixtureArchetype(d3d, biome.fixtureArchetype);
            }

            const r = String(d3d.realm || 'angband').toLowerCase();
            const cs = d3d.cellSize || 2.0;
            const bevBuf = this._tmpSconceBevels || (this._tmpSconceBevels = [0, 0, 0, 0]);
            // Cardinal faces with mounted-face corner indices (both corners MUST have bevel === 0 for a flat flush mount!)
            const tDirs = [
                { dx: 0, dy: 1, yaw: 0, cA: 3, cB: 2 },
                { dx: 0, dy: -1, yaw: Math.PI, cA: 0, cB: 1 },
                { dx: 1, dy: 0, yaw: Math.PI * 0.5, cA: 1, cB: 2 },
                { dx: -1, dy: 0, yaw: -Math.PI * 0.5, cA: 0, cB: 3 }
            ];

            for (let y = minY; y <= maxY && list.length < 128; y++) {
                for (let x = minX; x <= maxX && list.length < 128; x++) {
                    if (((x * 31 + y * 17) % 6) !== 0) continue;
                    const dxP = x - px, dyP = y - py;
                    if (dxP * dxP + dyP * dyP > 576) continue;
                    const { feat, inView } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, x, y, false);
                    if (feat !== 21 && feat !== 22) continue;
                    let tooClose = false;
                    for (let li = 0; li < list.length; li++) {
                        const dxL = list[li].wallX - x, dyL = list[li].wallY - y;
                        if (dxL * dxL + dyL * dyL < 9) { tooClose = true; break; }
                    }
                    if (tooClose) continue;

                    this.computeWallCornerBevels(d3d, map, w, h, x, y, false, bevBuf);

                    for (let ti = 0; ti < 4; ti++) {
                        const td = tDirs[ti];
                        // Strictly require flat flush wall face (0 bevel on both ends of mounted face!)
                        if (bevBuf[td.cA] > 0.001 || bevBuf[td.cB] > 0.001) continue;
                        const tnx = x + td.dx, tny = y + td.dy;
                        if (tnx < 0 || tnx >= w || tny < 0 || tny >= h) continue;
                        const { feat: nf } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, tnx, tny, false);
                        if (nf !== 1) continue;
                        const adjIsRoom = (d3d._levelRoomCeilCache && d3d._levelMemW === w)
                            ? (d3d._levelRoomCeilCache[tny * w + tnx] >= 4.1)
                            : (((d3d.getFlagAt(map, tnx, tny) >> 2) & 0x3) === 2);
                        if (!adjIsRoom) continue;

                        // Keep >= 2 tiles clear of stairs (5,6), doors (2,3,4), and Sil-Q Sunlight (feat 25)
                        let clear = true;
                        for (let oy = -2; oy <= 2 && clear; oy++) {
                            for (let ox = -2; ox <= 2; ox++) {
                                if (ox * ox + oy * oy > 4) continue;
                                const cx = x + ox, cy = y + oy;
                                if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
                                const rawF = d3d.getFeatAt(map, cx, cy);
                                const { feat: cf } = this._getEffectiveFeatAndGlyph(d3d, map, w, h, cx, cy, false);
                                if (cf === 5 || cf === 6 || this.isDoorwayTile(d3d, map, w, h, cx, cy, false) || (r === 'silq' && (rawF === 25 || cf === 25))) {
                                    clear = false;
                                    break;
                                }
                            }
                        }
                        if (!clear) continue;

                        list.push({
                            wallX: x,
                            wallY: y,
                            tileIdx: y * w + x,
                            gx: x + td.dx * 0.65,
                            gy: y + td.dy * 0.65,
                            mountX: x * cs + td.dx * 1.01,
                            mountZ: y * cs + td.dy * 1.01,
                            lightX: (x + td.dx * 0.62) * cs,
                            lightZ: (y + td.dy * 0.62) * cs,
                            yaw: td.yaw,
                            inView,
                            pDistSq: dxP * dxP + dyP * dyP
                        });
                        break;
                    }
                }
            }

            // Position up to 2 pooled specular PointLights at the 2 nearest visible sconces on high GPU tiers
            if (d3d._sconceLights) {
                if (this.isHighGpuTier(d3d) && list.length > 0) {
                    let b0 = null, b1 = null;
                    for (let i = 0; i < list.length; i++) {
                        const s = list[i];
                        if (!s.inView) continue;
                        if (!b0 || s.pDistSq < b0.pDistSq) { b1 = b0; b0 = s; }
                        else if (!b1 || s.pDistSq < b1.pDistSq) { b1 = s; }
                    }
                    const picks = [b0, b1];
                    const tHex = (biome && biome.torchColor !== undefined) ? biome.torchColor : 0xffaa44;
                    for (let i = 0; i < 2; i++) {
                        const sl = d3d._sconceLights[i];
                        const p = picks[i];
                        if (p) {
                            sl.color.setHex(tHex);
                            sl.position.set(p.lightX, 1.96, p.lightZ);
                            sl.baseIntensity = 1.18;
                            sl.intensity = 1.18 * (1.0 - (d3d._blindFactor || 0));
                            sl.visible = sl.intensity > 0.02;
                        } else {
                            sl.baseIntensity = 0;
                            sl.intensity = 0;
                            sl.visible = false;
                        }
                    }
                } else {
                    hideLights();
                }
            }
            return list;
        },

        applyChiaroscuroTileShade(d3d, targetColor, inView, outdoors, lighting, x, y, surfaceKind, adjWalls, pDist, horizonFade) {
            const biome = d3d.currentBiome;
            const torchHex = (biome && biome.torchColor !== undefined) ? biome.torchColor : 0xffb866;
            const tc = this._tmpSconceTint || (this._tmpSconceTint = new THREE.Color());
            tc.setHex(torchHex);

            if (lighting === 2) {
                // Subterranean Chiaroscuro: cool shadowy stone baseline (~0.36) sculpted by warm inverse-square sconce pools
                const baseShadow = (biome && biome.suppressFixtures) ? 0.56 : 0.36;
                targetColor.r *= baseShadow * 0.94;
                targetColor.g *= baseShadow * 0.98;
                targetColor.b *= baseShadow * 1.08;

                if ((surfaceKind === 'floor' || surfaceKind === 'ceiling') && adjWalls > 0) {
                    targetColor.multiplyScalar(1.0 - Math.min(4, adjWalls) * 0.042);
                }

                const sconces = d3d._activeWallSconces;
                if (sconces && sconces.length > 0) {
                    let poolEnergy = 0.0;
                    for (let i = 0; i < sconces.length; i++) {
                        const s = sconces[i];
                        const dx = x - s.gx;
                        const dy = y - s.gy;
                        const dSq = dx * dx + dy * dy;
                        if (dSq < 42.25) {
                            const falloff = 1.0 - dSq / 42.25;
                            poolEnergy += (0.76 / (1.0 + 0.26 * dSq)) * falloff * falloff;
                        }
                    }
                    if (poolEnergy > 0.001) {
                        const boost = Math.min(0.76, poolEnergy);
                        targetColor.r = Math.min(1.04, targetColor.r + boost * (0.42 + 0.58 * tc.r));
                        targetColor.g = Math.min(1.02, targetColor.g + boost * (0.40 + 0.56 * tc.g));
                        targetColor.b = Math.min(1.00, targetColor.b + boost * (0.36 + 0.52 * tc.b));
                    }
                }
            } else if (inView && lighting === 1 && d3d.vertexLighter && d3d.renderBudget && !d3d.renderBudget.enableFillLight) {
                const lit = d3d.vertexLighter.computeTileColor(x, y, 2, d3d.playerGridX || 0, d3d.playerGridY || 0, null, targetColor);
                targetColor.setRGB(lit.r, lit.g, lit.b);
            }

            const torchSpan = (d3d.torchRadius || 3) + 1.5;
            if (inView && pDist < torchSpan) {
                const halo = 1.0 - pDist / torchSpan;
                const hStrength = (lighting === 2) ? 0.22 : 0.09;
                targetColor.r = Math.min(1.02, targetColor.r + halo * hStrength * (0.5 + 0.5 * tc.r));
                targetColor.g = Math.min(1.00, targetColor.g + halo * hStrength * 0.82 * (0.5 + 0.5 * tc.g));
                targetColor.b = Math.min(0.98, targetColor.b + halo * hStrength * 0.55 * (0.5 + 0.5 * tc.b));
            }
            return targetColor.multiplyScalar(horizonFade);
        },

        // =========================================================================
        // 7D. UNIVERSAL 3D BLINDNESS & ASTRAL TELEPATHY (ESP) CONTROLLER
        // =========================================================================

        isPlayerBlind(player) {
            if (!player) return false;
            if (Boolean(player.blind) || Number(player.blind) > 0 || Boolean(player.is_blind)) return true;
            if (Array.isArray(player.statuses)) {
                for (let i = 0; i < player.statuses.length; i++) {
                    const s = player.statuses[i];
                    const txt = String((s && typeof s === 'object' ? (s.name || s.id || s.label) : s) || '');
                    if (/\bblind\b|blinded|盲目/i.test(txt)) return true;
                }
            }
            return false;
        },

        hasPlayerEsp(player) {
            if (!player) return false;
            if (player.esp || player.telepathy) return true;
            if (player.flags && (player.flags.esp || player.flags.telepathy)) return true;
            if (Array.isArray(player.statuses)) {
                for (let i = 0; i < player.statuses.length; i++) {
                    const s = player.statuses[i];
                    const txt = String((s && typeof s === 'object' ? (s.name || s.id || s.label) : s) || '');
                    if (/\b(esp|telepath|telepathy)\b/i.test(txt)) return true;
                }
            }
            return false;
        },

        isMonsterEspPerceived(m, player) {
            if (!m) return false;
            if (m.esp || m.telepathy || m.sensed_esp) return true;
            if (!this.hasPlayerEsp(player)) return false;
            const ident = String(m.name || m.race || '');
            return !/jelly|mold|mould|fungus|fungi|ooze|vortex|golem|skeleton|zombie/i.test(ident);
        },

        _restoreEntityEspMaterials(entity) {
            if (!entity || !entity._hasEspMatOverride) return;
            entity.traverse((c) => {
                if ((c.isMesh || c.isSkinnedMesh) && c._preEspMat && !entity._emissiveMaterials) {
                    c.material = c._preEspMat;
                    c._preEspMat = null;
                }
            });
            if (entity.foggyMaterials) {
                for (let i = 0; i < entity.foggyMaterials.length; i++) {
                    if (entity.foggyMaterials[i]) entity.foggyMaterials[i].fog = true;
                }
            }
            if (entity.nameplate && entity.nameplate.material) {
                entity.nameplate.material.fog = true;
            }
            entity._hasEspMatOverride = false;
            entity._espOverrideMode = 0;
        },

        applyBlindMonsterState(d3d, entity, m, player, px, py, blindFactor) {
            if (!entity || !m) return true;
            const bf = blindFactor !== undefined ? blindFactor : (d3d && d3d._blindFactor) || 0;
            const distSq = (m.x - px) * (m.x - px) + (m.y - py) * (m.y - py);
            const isEsp = this.isMonsterEspPerceived(m, player);
            const isTactile = distSq <= 2;
            const wantBadge = Boolean(bf > 0.35 && isEsp);

            if (Boolean(m._espPerceived) !== wantBadge) {
                m._espPerceived = wantBadge;
                if (entity.nameplate && d3d && typeof d3d.createNameplateSprite === 'function') {
                    d3d.createNameplateSprite(m, Boolean(entity.lastTargeted), Boolean(entity.lastSensed || wantBadge), entity.nameplate);
                }
            }

            if (bf <= 0.5) {
                if (entity._hasEspMatOverride) this._restoreEntityEspMaterials(entity);
                return true;
            }

            if (!isEsp && !isTactile) {
                if (entity._hasEspMatOverride) this._restoreEntityEspMaterials(entity);
                entity.visible = false;
                if (entity.nameplate) entity.nameplate.visible = false;
                return false;
            }

            // Astral Telepathy (mode 2: #38bdf8 / #c084fc) or close tactile contact (mode 1: slate tactile silhouette)
            const mode = isEsp ? ((m.unique || m.isBoss) ? 3 : 2) : 1;
            if ((!entity._hasEspMatOverride || entity._espOverrideMode !== mode) && !entity._emissiveMaterials) {
                if (entity._hasEspMatOverride) this._restoreEntityEspMaterials(entity);
                const pool = d3d._espMatCache || (d3d._espMatCache = new Map());
                entity.traverse((c) => {
                    if ((!c.isMesh && !c.isSkinnedMesh) || !c.material || c === entity.contactShadow) return;
                    if (entity.foggyAura && (c === entity.foggyAura || c.parent === entity.foggyAura)) return;
                    if (!c._preEspMat) c._preEspMat = c.material;
                    const mapSingle = (orig) => {
                        if (!orig) return orig;
                        const k = `${orig.uuid}_esp_${mode}`;
                        let em = pool.get(k);
                        if (!em) {
                            if (pool.size >= 128) {
                                const fk = pool.keys().next().value;
                                const old = pool.get(fk);
                                pool.delete(fk);
                                if (old && typeof old.dispose === 'function') old.dispose();
                            }
                            em = orig.clone();
                            em._sharedMaterial = true;
                            if (orig.skinning || c.isSkinnedMesh) em.skinning = true;
                            em.fog = false;
                            if (mode >= 2) {
                                const hex = mode === 3 ? 0xc084fc : 0x38bdf8;
                                if (em.color) em.color.setHex(hex);
                                if (em.emissive) {
                                    em.emissive.setHex(hex);
                                    em.emissiveIntensity = 0.88;
                                }
                                em.transparent = true;
                                em.opacity = 0.88;
                            } else {
                                if (em.color) em.color.setHex(0x64748b);
                                if (em.emissive) {
                                    em.emissive.setHex(0x1e293b);
                                    em.emissiveIntensity = 0.35;
                                }
                            }
                            pool.set(k, em);
                        }
                        return em;
                    };
                    c.material = Array.isArray(c._preEspMat) ? c._preEspMat.map(mapSingle) : mapSingle(c._preEspMat);
                });
                if (entity.foggyMaterials) {
                    for (let i = 0; i < entity.foggyMaterials.length; i++) {
                        if (entity.foggyMaterials[i]) entity.foggyMaterials[i].fog = false;
                    }
                }
                entity._hasEspMatOverride = true;
                entity._espOverrideMode = mode;
            }
            if (entity.nameplate && entity.nameplate.material) {
                entity.nameplate.material.fog = false;
            }
            return true;
        },

        tickBlindnessShroud(d3d, delta, tNow) {
            if (!d3d) return 0.0;
            const frame = d3d.lastFrame;
            const player = frame ? frame.player : null;
            const isBlind = this.isPlayerBlind(player);
            const target = isBlind ? 1.0 : 0.0;
            const prev = d3d._blindFactor || 0.0;

            if (prev === 0.0 && target === 0.0) return 0.0;

            const dt = Math.min(0.1, Math.max(0.001, delta || 0.016));
            const alpha = 1.0 - Math.exp(-dt / 0.16);
            let bf = prev + (target - prev) * alpha;
            if (Math.abs(target - bf) < 0.002) bf = target;
            d3d._blindFactor = bf;

            if (Math.abs(bf - prev) > 0.0005 && d3d.renderGovernor && typeof d3d.renderGovernor.wake === 'function') {
                d3d.renderGovernor.wake(240, tNow);
            }

            const biome = d3d.currentBiome;
            const outdoors = (d3d.lastDepth === 0);
            const shroudCol = this._shroudBlack || (this._shroudBlack = new THREE.Color(0x020306));
            const tmpCol = this._tmpBlindCol || (this._tmpBlindCol = new THREE.Color());

            if (bf > 0.0) {
                const visKeep = 1.0 - bf;
                if (d3d.scene && d3d.scene.background) {
                    tmpCol.setHex(biome ? (outdoors ? biome.bgColor : biome.fogColor) : 0x080a0f);
                    d3d.scene.background.copy(tmpCol).lerp(shroudCol, bf);
                }
                if (d3d.sunLight) {
                    const baseSun = (biome && biome.sunLight) ? biome.sunEnergy : 0.0;
                    d3d.sunLight.intensity = baseSun * visKeep * visKeep;
                    d3d.sunLight.visible = d3d.sunLight.intensity > 0.005;
                }
                if (d3d.ambientLight) {
                    const baseAmb = biome ? biome.ambientEnergy : 0.17;
                    d3d.ambientLight.intensity = baseAmb * (1.0 - bf * 0.92) + 0.055 * bf;
                }
                if (d3d.hemiLight) {
                    if (d3d._baseHemiIntensity === undefined) d3d._baseHemiIntensity = d3d.hemiLight.intensity;
                    d3d.hemiLight.intensity = d3d._baseHemiIntensity * visKeep * visKeep;
                }
                if (d3d.torchLight) {
                    d3d.torchLight.intensity *= (1.0 - bf * 0.86);
                    const fullRange = ((d3d.torchRadius || 1) + 2.5) * (d3d.cellSize || 2.0) + 2.0;
                    d3d.torchLight.distance = fullRange * visKeep + 2.35 * bf;
                }
                if (d3d.torchFillLight) {
                    d3d.torchFillLight.intensity *= (1.0 - bf * 0.90);
                }
                if (d3d._sconceLights) {
                    for (let i = 0; i < d3d._sconceLights.length; i++) {
                        const sl = d3d._sconceLights[i];
                        if (sl.baseIntensity > 0) {
                            sl.intensity = sl.baseIntensity * visKeep * visKeep;
                            sl.visible = sl.intensity > 0.02;
                        }
                    }
                }
                if (d3d.starGroup) {
                    if (bf > 0.88) {
                        d3d.starGroup.visible = false;
                    } else if (outdoors && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.starrySky !== false)) {
                        d3d.starGroup.visible = true;
                        if (d3d.starMaterial && d3d.starMaterial.uniforms && d3d.starMaterial.uniforms.uVisibility) {
                            d3d.starMaterial.uniforms.uVisibility.value = visKeep;
                        }
                    }
                }
                if (d3d.scene && d3d.scene.fog) {
                    const baseFogHex = biome ? biome.fogColor : 0x080a0f;
                    const baseDens = biome ? (outdoors ? biome.fogDensity : Math.max(0.024, biome.fogDensity * 2.2)) : 0.024;
                    tmpCol.setHex(baseFogHex);
                    d3d.scene.fog.color.copy(tmpCol).lerp(shroudCol, bf);
                    // 1.32 FogExp2 density => <0.5% visibility past ~1.75m tactile reach!
                    d3d.scene.fog.density = baseDens + (1.32 - baseDens) * (bf * bf);
                }
                if (bf > 0.55 && d3d.terrainLabelsGroup && d3d.terrainLabelsGroup.children && d3d.camera) {
                    for (let i = 0; i < d3d.terrainLabelsGroup.children.length; i++) {
                        const sp = d3d.terrainLabelsGroup.children[i];
                        if (sp.visible && d3d.camera.position.distanceToSquared(sp.position) > 4.84) {
                            sp.visible = false;
                        }
                    }
                }
                if (player && d3d.items && d3d.items.size > 0) {
                    const px = player.x || 0, py = player.y || 0;
                    for (const itEnt of d3d.items.values()) {
                        const it = itEnt.itemData;
                        if (!it) continue;
                        const dSq = (it.x - px) * (it.x - px) + (it.y - py) * (it.y - py);
                        if (bf > 0.65 && dSq > 0) {
                            itEnt.visible = false;
                        }
                    }
                }
            } else if (prev > 0.0 && bf === 0.0) {
                // Clean recovery from blindness -> restore biome atmosphere & entity visibility
                if (biome) {
                    if (d3d.scene && d3d.scene.background) d3d.scene.background.setHex(outdoors ? biome.bgColor : biome.fogColor);
                    if (d3d.sunLight) { d3d.sunLight.visible = biome.sunLight; d3d.sunLight.intensity = biome.sunEnergy; }
                    if (d3d.ambientLight) d3d.ambientLight.intensity = biome.ambientEnergy;
                    if (d3d.hemiLight && d3d._baseHemiIntensity !== undefined) d3d.hemiLight.intensity = d3d._baseHemiIntensity;
                    if (d3d.torchLight) d3d.torchLight.distance = ((d3d.torchRadius || 1) + 2.5) * (d3d.cellSize || 2.0) + 2.0;
                    if (d3d.starGroup) {
                        const starsOn = outdoors && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.starrySky !== false);
                        d3d.starGroup.visible = starsOn;
                        if (d3d.starMaterial && d3d.starMaterial.uniforms && d3d.starMaterial.uniforms.uVisibility) {
                            d3d.starMaterial.uniforms.uVisibility.value = starsOn ? 1.0 : 0.0;
                        }
                    }
                    if (d3d.scene && d3d.scene.fog) {
                        d3d.scene.fog.color.setHex(biome.fogColor);
                        d3d.scene.fog.density = outdoors ? biome.fogDensity : Math.max(0.024, biome.fogDensity * 2.2);
                    }
                }
                if (d3d.monsters) {
                    for (const ent of d3d.monsters.values()) {
                        if (ent._hasEspMatOverride) this._restoreEntityEspMaterials(ent);
                        if (ent.monsterData && ent.monsterData._espPerceived) {
                            ent.monsterData._espPerceived = false;
                            if (ent.nameplate && typeof d3d.createNameplateSprite === 'function') {
                                d3d.createNameplateSprite(ent.monsterData, Boolean(ent.lastTargeted), Boolean(ent.lastSensed), ent.nameplate);
                            }
                        }
                    }
                }
                d3d._lastTerrainSig = null;
                if (frame) {
                    if (typeof d3d.updateItems === 'function') d3d.updateItems(frame.objects || frame.items || [], player);
                    if (typeof d3d.updateMonsters === 'function') d3d.updateMonsters(frame.monsters || [], player);
                }
            }
            return bf;
        },

        // =========================================================================
        // 7. ATTACH TO DUNGEON3D PROTOTYPE
        // =========================================================================

        attach(Dungeon3DClass) {
            if (!Dungeon3DClass || !Dungeon3DClass.prototype) return;
            const proto = Dungeon3DClass.prototype;

            proto._extractHandItems = function (player) {
                return Dungeon3DTactical.extractHandItems(player);
            };

            proto._resolveRightKey = function (weaponItem, bowItem, player) {
                return Dungeon3DTactical.resolveRightKey(this, weaponItem, bowItem, player);
            };

            proto._resolveLeftShieldOrOffhand = function (shieldItem) {
                return Dungeon3DTactical.resolveLeftShieldOrOffhand(this, shieldItem);
            };

            proto.determineStairOrientation = function (map, x, y, w, h) {
                return Dungeon3DTactical.determineStairOrientation(this, map, x, y, w, h);
            };

            proto.determineDoorOrientation = function (map, x, y, w, h) {
                return Dungeon3DTactical.determineDoorOrientation(this, map, x, y, w, h);
            };

            proto.determineShopDoorOrientation = function (map, x, y, w, h) {
                return Dungeon3DTactical.determineShopDoorOrientation(this, map, x, y, w, h);
            };

            proto.getCeilingHeightForTile = function (x, y, isRoom, depth) {
                return Dungeon3DTactical.getCeilingHeight(this, x, y, isRoom, depth);
            };

            proto.getRememberedTile = function (x, y) {
                return Dungeon3DTactical.getRememberedTile(this, x, y);
            };

            proto._syncLevelVisibilityAndRooms = function (map, w, h, depth, realm, outdoors, px, py) {
                Dungeon3DTactical.syncLevelVisibilityAndRooms(this, map, w, h, depth, realm, outdoors, px, py);
            };

            proto._resetVisBindings = function (meshes) {
                Dungeon3DTactical.resetVisBindings(this, meshes);
            };

            proto._bindVisColor = function (meshSlot, mesh, instIdx, tileIdx, baseCol, outdoors) {
                Dungeon3DTactical.bindVisColor(this, meshSlot, mesh, instIdx, tileIdx, baseCol, outdoors);
            };

            proto._tickSmoothVisibility = function (delta) {
                return Dungeon3DTactical.tickSmoothVisibility(this, delta);
            };

            proto._computeThresholdYOffset = function (feat, glyph, outdoors) {
                return Dungeon3DTactical.computeThresholdYOffset(this, feat, glyph, outdoors);
            };

            proto._checkThresholdProximity = function () {
                return Dungeon3DTactical.checkThresholdProximity(this);
            };

            proto._purgeSceneVfxAndLabels = function () {
                Dungeon3DTactical.purgeSceneVfxAndLabels(this);
            };

            proto.updateTacticalCursor = function (frame, delta) {
                Dungeon3DTactical.updateTacticalCursor(this, frame, delta);
            };

            proto.updateFlankThreatArcs = function (frame) {
                Dungeon3DTactical.updateFlankThreatArcs(this, frame, this.camera);
            };

            proto.computeMultiItemPositions = function (items) {
                return Dungeon3DTactical.computeMultiItemPositions(items, this.cellSize || 2.0);
            };

            proto.updateProceduralLocomotion = function (entity, delta, monTime) {
                Dungeon3DTactical.updateProceduralLocomotion(entity, delta, monTime);
            };

            proto.isPlayerBlind = function (player) {
                return Dungeon3DTactical.isPlayerBlind(player !== undefined ? player : (this.lastFrame && this.lastFrame.player));
            };

            proto.hasPlayerEsp = function (player) {
                return Dungeon3DTactical.hasPlayerEsp(player !== undefined ? player : (this.lastFrame && this.lastFrame.player));
            };

            proto.isMonsterEspPerceived = function (m, player) {
                return Dungeon3DTactical.isMonsterEspPerceived(m, player !== undefined ? player : (this.lastFrame && this.lastFrame.player));
            };

            proto._applyBlindMonsterState = function (entity, m, player, px, py, blindFactor) {
                return Dungeon3DTactical.applyBlindMonsterState(this, entity, m, player, px, py, blindFactor);
            };

            proto._tickBlindnessShroud = function (delta, tNow) {
                return Dungeon3DTactical.tickBlindnessShroud(this, delta, tNow);
            };

            proto._initMasonryTrimAndPortals = function (createMergedBoxGeometry) {
                Dungeon3DTactical.initMasonryTrimAndPortals(this, createMergedBoxGeometry);
            };

            proto._initWallFixtureArchetypes = function (createMergedBoxGeometry) {
                Dungeon3DTactical.initWallFixtureArchetypes(this, createMergedBoxGeometry);
            };

            proto._syncWorldPbrUniforms = function (texSet) {
                Dungeon3DTactical.syncWorldPbrUniforms(this, texSet);
            };

            proto._tickWorldPbrFrame = function (tNow) {
                Dungeon3DTactical.tickWorldPbrFrame(this, tNow);
            };

            proto._collectActiveWallSconces = function (map, w, h, minX, maxX, minY, maxY, px, py, depth, outdoors, biome) {
                return Dungeon3DTactical.collectActiveWallSconces(this, map, w, h, minX, maxX, minY, maxY, px, py, depth, outdoors, biome);
            };
        }
    };

    if (typeof window !== 'undefined' && window.Dungeon3D) {
        Dungeon3DTactical.attach(window.Dungeon3D);
    }

    return Dungeon3DTactical;
});

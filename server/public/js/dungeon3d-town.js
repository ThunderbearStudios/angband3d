/**
 * Dungeon3DTown — Procedural Medieval Town Cluster Architecture (WS-4 / v12.3.0)
 *
 * Flood-fills contiguous Town building blocks once per depth=0 terrain build into
 * spanning pitched gabled roofs (with 0.28m eaves, ridge beams & chimneys),
 * plaster-and-timber gable end-walls, warm amber-lit mullioned windows
 * (T_WindowGradient.png), and outer-perimeter crenellated stone battlements +
 * corner watchtowers using pooled InstancedMeshes & shared materials.
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

    function isTownRoofClusterTile(feat, glyph, isBuildingCheck) {
        if (feat === 60 || glyph === '0' && feat === 60) return false; // Never roof Sil-Q Forge
        if (feat === 21 || feat === 22) return true;
        if ((feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40)) return true;
        return typeof isBuildingCheck === 'function' ? Boolean(isBuildingCheck(feat)) : false;
    }

    /**
     * Flood-fills interior Town building footprints (excluding outer perimeter walls)
     * into connected BuildingClusters with deterministic story heights & roof tints.
     */
    function computeTownClusters(map, w, h, d3d) {
        const clusters = [];
        if (!map || !map.rows || w <= 4 || h <= 4) return clusters;

        const visited = new Uint8Array(w * h);
        const mask = new Uint8Array(w * h);

        for (let y = 2; y <= h - 3; y++) {
            for (let x = 2; x <= w - 3; x++) {
                const feat = readRawFeat(d3d, map, x, y);
                const glyph = (d3d && typeof d3d.getGlyphAt === 'function')
                    ? d3d.getGlyphAt(map, x, y)
                    : ((map.rows[y] && map.rows[y].g) ? map.rows[y].g[x] : ' ');
                if (isTownRoofClusterTile(feat, glyph)) {
                    mask[y * w + x] = 1;
                }
            }
        }

        const queue = [];
        for (let y = 2; y <= h - 3; y++) {
            for (let x = 2; x <= w - 3; x++) {
                const startIdx = y * w + x;
                if (!mask[startIdx] || visited[startIdx]) continue;

                visited[startIdx] = 1;
                queue.length = 0;
                queue.push(startIdx);
                let head = 0;
                let minX = x, maxX = x, minY = y, maxY = y;
                const tiles = [];

                while (head < queue.length) {
                    const idx = queue[head++];
                    const cx = idx % w;
                    const cy = (idx / w) | 0;
                    const feat = readRawFeat(d3d, map, cx, cy);
                    tiles.push({ x: cx, y: cy, feat });
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                    for (let d = 0; d < 4; d++) {
                        const nx = cx + dirs[d][0];
                        const ny = cy + dirs[d][1];
                        if (isPerimeterWallCoord(nx, ny, w, h)) continue;
                        const nIdx = ny * w + nx;
                        if (mask[nIdx] && !visited[nIdx]) {
                            visited[nIdx] = 1;
                            queue.push(nIdx);
                        }
                    }
                }

                // Skip degenerate 1-tile solitary pillars unless they are actual stores/buildings
                const hasStore = tiles.some(t => (t.feat >= 7 && t.feat <= 14) || (t.feat >= 32 && t.feat <= 40));
                if (tiles.length < 2 && !hasStore) continue;

                const hash = (((minX * 73856093) ^ (minY * 19349663) ^ (tiles.length * 83492791)) >>> 0);
                const storyExtra = (hash % 3) * 0.14; // Deterministic 0..0.28m subtle variation
                const spanX = maxX - minX + 1;
                const spanY = maxY - minY + 1;
                const ridgeAlongX = spanX >= spanY;
                const roofPaletteIdx = hash % 3;

                clusters.push({
                    minX, maxX, minY, maxY,
                    spanX, spanY,
                    hasStore,
                    tiles,
                    hash,
                    storyExtra,
                    ridgeAlongX,
                    roofPaletteIdx
                });
            }
        }
        return clusters;
    }

    function createGableRoofGeometry(THREE, spanW, spanD, ridgeH, overhang, ridgeAlongX, roofRGB, gableRGB) {
        const hw = spanW * 0.5 + overhang;
        const hd = spanD * 0.5 + overhang;
        const gxW = spanW * 0.5 - 0.01;
        const gxD = spanD * 0.5 - 0.01;

        const roofPos = [];
        const roofNorm = [];
        const roofCol = [];
        const gablePos = [];
        const gableNorm = [];
        const gableCol = [];

        const pushTri = (posArr, normArr, colArr, a, b, c, rgb) => {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            for (const p of [a, b, c]) {
                posArr.push(p[0], p[1], p[2]);
                normArr.push(nx, ny, nz);
                colArr.push(rgb[0], rgb[1], rgb[2]);
            }
        };

        const pushQuad = (posArr, normArr, colArr, p0, p1, p2, p3, rgb) => {
            pushTri(posArr, normArr, colArr, p0, p1, p2, rgb);
            pushTri(posArr, normArr, colArr, p0, p2, p3, rgb);
        };

        if (ridgeAlongX) {
            // Ridge runs along X: [-hw, ridgeH, 0] -> [+hw, ridgeH, 0]
            const rL = [-hw, ridgeH, 0];
            const rR = [hw, ridgeH, 0];
            const eFL = [-hw, 0, hd];
            const eFR = [hw, 0, hd];
            const eBL = [-hw, 0, -hd];
            const eBR = [hw, 0, -hd];
            // Front (+Z) slope & Back (-Z) slope
            pushQuad(roofPos, roofNorm, roofCol, eFL, eFR, rR, rL, roofRGB);
            pushQuad(roofPos, roofNorm, roofCol, eBR, eBL, rL, rR, roofRGB);
            // Underside eaves soffits (visible looking upward from street)
            const darkSoffit = [roofRGB[0] * 0.45, roofRGB[1] * 0.40, roofRGB[2] * 0.35];
            pushQuad(roofPos, roofNorm, roofCol, eFR, eFL, [-hw, 0, 0], [hw, 0, 0], darkSoffit);
            pushQuad(roofPos, roofNorm, roofCol, eBL, eBR, [hw, 0, 0], [-hw, 0, 0], darkSoffit);
            // Plaster gable end-walls at -X and +X
            pushTri(gablePos, gableNorm, gableCol, [-gxW, 0, gxD], [-gxW, 0, -gxD], [-gxW, ridgeH, 0], gableRGB);
            pushTri(gablePos, gableNorm, gableCol, [gxW, 0, -gxD], [gxW, 0, gxD], [gxW, ridgeH, 0], gableRGB);
        } else {
            // Ridge runs along Z: [0, ridgeH, -hd] -> [0, ridgeH, +hd]
            const rB = [0, ridgeH, -hd];
            const rF = [0, ridgeH, hd];
            const eLF = [-hw, 0, hd];
            const eLB = [-hw, 0, -hd];
            const eRF = [hw, 0, hd];
            const eRB = [hw, 0, -hd];
            pushQuad(roofPos, roofNorm, roofCol, eLF, rF, rB, eLB, roofRGB);
            pushQuad(roofPos, roofNorm, roofCol, eRB, rB, rF, eRF, roofRGB);
            const darkSoffit = [roofRGB[0] * 0.45, roofRGB[1] * 0.40, roofRGB[2] * 0.35];
            pushQuad(roofPos, roofNorm, roofCol, eLB, eLF, [0, 0, hd], [0, 0, -hd], darkSoffit);
            pushQuad(roofPos, roofNorm, roofCol, eRF, eRB, [0, 0, -hd], [0, 0, hd], darkSoffit);
            // Plaster gable end-walls at +Z and -Z
            pushTri(gablePos, gableNorm, gableCol, [-gxW, 0, gxD], [gxW, 0, gxD], [0, ridgeH, gxD], gableRGB);
            pushTri(gablePos, gableNorm, gableCol, [gxW, 0, -gxD], [-gxW, 0, -gxD], [0, ridgeH, -gxD], gableRGB);
        }

        const buildBuf = (p, n, c) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
            return g;
        };

        return {
            roofGeo: buildBuf(roofPos, roofNorm, roofCol),
            gableGeo: buildBuf(gablePos, gableNorm, gableCol)
        };
    }

    function ensureSharedMaterials(d3d, THREE) {
        if (d3d._townSharedMats) return d3d._townSharedMats;

        let windowTex = null;
        if (typeof THREE.TextureLoader === 'function') {
            try {
                const loader = new THREE.TextureLoader();
                windowTex = loader.load('/assets/textures/T_WindowGradient.png');
                windowTex._sharedTexture = true;
                if (typeof THREE.SRGBColorSpace !== 'undefined') windowTex.colorSpace = THREE.SRGBColorSpace;
            } catch (_) {
                windowTex = null;
            }
        }

        const roofMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.78,
            metalness: 0.08,
            vertexColors: true
        });
        roofMat._sharedMaterial = true;

        const gableMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: (d3d && d3d.wallTex) || null,
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
            map: (d3d && d3d.wallTex) || null,
            normalMap: (d3d && d3d.wallNormal) || null,
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

        d3d._townSharedMats = {
            roofMat,
            gableMat,
            windowMat,
            battlementMat,
            windowFrameMat: (d3d && d3d.townTimberMaterial) || gableMat,
            windowFrameGeo,
            windowPaneGeo,
            merlonGeo,
            chimneyGeo
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

    function buildTownArchitecture(d3d, map, w, h, depth, realm) {
        if (!d3d || !d3d.scene || typeof THREE === 'undefined') return false;
        if (depth !== 0 || !map || !map.rows || w <= 4 || h <= 4) {
            disposeTownArchitecture(d3d);
            return false;
        }

        const sig = `${d3d._lastTerrainSig || ''}:${depth}:${realm || d3d.realm || 'angband'}:${w}x${h}`;
        if (d3d._townArchSig === sig && d3d._townArchGroup) {
            return true;
        }
        disposeTownArchitecture(d3d);

        const clusters = computeTownClusters(map, w, h, d3d);
        if (clusters.length === 0) return false;

        const grp = new THREE.Group();
        grp.name = 'TownMedievalArchitecture';
        grp._ownedDisposables = [];

        const mats = ensureSharedMaterials(d3d, THREE);
        const cs = d3d.cellSize || DEFAULT_CELL_SIZE;
        const wallH = d3d.wallHeight || DEFAULT_WALL_HEIGHT;
        const dummy = new THREE.Object3D();
        const rLow = String(realm || d3d.realm || 'angband').toLowerCase();

        const isEastern = (rLow === 'hengband' || rLow === 'frogcomposband');
        const palettes = isEastern
            ? [[0.24, 0.34, 0.40], [0.46, 0.25, 0.22], [0.28, 0.30, 0.36]]
            : [[0.32, 0.35, 0.42], [0.54, 0.26, 0.20], [0.29, 0.36, 0.32]];

        const gableCol = [0.80, 0.74, 0.62];

        // Layer 1 & 2: Pitched Gabled Roofs + Plaster/Timber Gable Walls + Stone Chimneys
        const chimneyTransforms = [];
        for (let ci = 0; ci < clusters.length; ci++) {
            const cl = clusters[ci];
            const spanW = cl.spanX * cs;
            const spanD = cl.spanY * cs;
            const eaveY = wallH + 0.02 + cl.storyExtra;
            const ridgeH = Math.min(1.85, Math.max(0.85, (cl.ridgeAlongX ? spanD : spanW) * 0.36));
            const cxWorld = ((cl.minX + cl.maxX) * 0.5) * cs;
            const czWorld = ((cl.minY + cl.maxY) * 0.5) * cs;
            const roofRGB = palettes[cl.roofPaletteIdx % palettes.length];

            const { roofGeo, gableGeo } = createGableRoofGeometry(
                THREE, spanW, spanD, ridgeH, 0.28, cl.ridgeAlongX, roofRGB, gableCol
            );
            grp._ownedDisposables.push(roofGeo, gableGeo);

            const roofMesh = new THREE.Mesh(roofGeo, mats.roofMat);
            roofMesh.position.set(cxWorld, eaveY, czWorld);
            roofMesh.castShadow = true;
            roofMesh.receiveShadow = true;
            grp.add(roofMesh);

            const gableMesh = new THREE.Mesh(gableGeo, mats.gableMat);
            gableMesh.position.set(cxWorld, eaveY - 0.02, czWorld);
            grp.add(gableMesh);

            if (cl.tiles.length >= 6) {
                chimneyTransforms.push({
                    x: cxWorld + (cl.ridgeAlongX ? spanW * 0.22 : -spanW * 0.18),
                    y: eaveY + ridgeH * 0.72,
                    z: czWorld + (cl.ridgeAlongX ? -spanD * 0.14 : spanD * 0.22)
                });
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

        // Layer 3: Warm Amber-Lit Mullioned Windows on outward wall faces
        const winPlacements = [];
        const isOpenStreet = (tx, ty) => {
            if (tx <= 0 || tx >= w - 1 || ty <= 0 || ty >= h - 1) return false;
            const f = readRawFeat(d3d, map, tx, ty);
            return f === 1 || f === 25 || f === 26 || f === 27 || f === 28 || f === 29 || f === 31;
        };
        for (let ci = 0; ci < clusters.length; ci++) {
            const cl = clusters[ci];
            for (let ti = 0; ti < cl.tiles.length; ti++) {
                const t = cl.tiles[ti];
                if (t.feat !== 21 && t.feat !== 22) continue;
                if (((t.x + t.y) & 1) !== 0) continue; // Alternating rhythm keeps windows legible & uncrowded
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
                    // Avoid placing window directly beside a storefront doorway to keep plaques clean
                    const adjDoor = (readRawFeat(d3d, map, t.x - dy, t.y + dx) >= 7 && readRawFeat(d3d, map, t.x - dy, t.y + dx) <= 14) ||
                        (readRawFeat(d3d, map, t.x + dy, t.y - dx) >= 7 && readRawFeat(d3d, map, t.x + dy, t.y - dx) <= 14);
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

        // Layer 4: Perimeter Crenellated Stone Battlements + Corner Watchtower Turrets
        const merlonPositions = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (x !== 0 && x !== w - 1 && y !== 0 && y !== h - 1) continue;
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

        // 4 Corner Watchtower Caps along Town Outer Perimeter
        const watchGeo = new THREE.BoxGeometry(cs * 1.45, 1.55, cs * 1.45);
        grp._ownedDisposables.push(watchGeo);
        const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
        const towerInst = new THREE.InstancedMesh(watchGeo, mats.battlementMat, 4);
        let tCount = 0;
        for (let ci = 0; ci < corners.length; ci++) {
            const [cx, cy] = corners[ci];
            const f = readRawFeat(d3d, map, cx, cy);
            if (f !== 22 && f !== 21) continue;
            dummy.position.set(cx * cs, wallH + 0.78, cy * cs);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
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
        disposeTownArchitecture
    };

    if (typeof root.DungeonRenderer === 'function') {
        root.DungeonRenderer.prototype.buildTownArchitecture = function (map, w, h, depth, realm) {
            return buildTownArchitecture(this, map, w, h, depth, realm);
        };
        root.DungeonRenderer.prototype.disposeTownArchitecture = function () {
            return disposeTownArchitecture(this);
        };
    } else if (typeof root.Dungeon3D === 'function') {
        root.Dungeon3D.prototype.buildTownArchitecture = function (map, w, h, depth, realm) {
            return buildTownArchitecture(this, map, w, h, depth, realm);
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

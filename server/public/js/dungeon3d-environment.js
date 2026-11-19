/**
 * dungeon3d-environment.js — Environment Geometry Merging, PolyHaven Architectural Props & StreetView Nav (WS71).
 * Extracted from dungeon3d.js to enforce modular LOC budgets with zero behavioral drift.
 */
(function (root) {
    'use strict';

    function attachEnvironment(Dungeon3DClass) {
        if (!Dungeon3DClass || !Dungeon3DClass.prototype) return;
        const Dungeon3DProto = Dungeon3DClass.prototype;

Dungeon3DProto._mergeBufferGeometries = function _mergeBufferGeometries(geometries) {
    if (!geometries || geometries.length === 0) return new THREE.BufferGeometry();
    let totalVerts = 0;
    let totalIndices = 0;
    for (const g of geometries) {
        totalVerts += g.attributes.position ? g.attributes.position.count : 0;
        totalIndices += g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    }
    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);
    const colArr = new Float32Array(totalVerts * 3);
    colArr.fill(1.0);
    const IndexArrayType = totalVerts > 65535 ? Uint32Array : Uint16Array;
    const indexArr = new IndexArrayType(totalIndices);

    let vOffset = 0;
    let iOffset = 0;
    for (const g of geometries) {
        const vCount = g.attributes.position ? g.attributes.position.count : 0;
        if (vCount === 0) continue;
        posArr.set(g.attributes.position.array, vOffset * 3);
        if (g.attributes.normal) {
            normArr.set(g.attributes.normal.array, vOffset * 3);
        }
        if (g.attributes.uv) {
            uvArr.set(g.attributes.uv.array, vOffset * 2);
        }
        if (g.attributes.color && g.attributes.color.array) {
            const cArr = g.attributes.color.array;
            const itemSize = g.attributes.color.itemSize || 3;
            for (let vi = 0; vi < vCount; vi++) {
                const dst = (vOffset + vi) * 3;
                const src = vi * itemSize;
                colArr[dst] = cArr[src];
                colArr[dst + 1] = cArr[src + 1];
                colArr[dst + 2] = cArr[src + 2];
            }
        }
        if (g.index) {
            const idx = g.index.array;
            for (let i = 0; i < idx.length; i++) {
                indexArr[iOffset++] = idx[i] + vOffset;
            }
        } else {
            for (let i = 0; i < vCount; i++) {
                indexArr[iOffset++] = i + vOffset;
            }
        }
        vOffset += vCount;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    merged.setIndex(new THREE.BufferAttribute(indexArr, 1));
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    return merged;
};

function _createSpineLimbGeometry(spine, radialSegs, vScale = 1.6) {
    const ringCount = spine.length, stride = radialSegs + 1, vertCount = ringCount * stride;
    const pos = new Float32Array(vertCount * 3), norm = new Float32Array(vertCount * 3), uv = new Float32Array(vertCount * 2), col = new Float32Array(vertCount * 3);
    let cumV = 0;

    for (let k = 0; k < ringCount; k++) {
        const pt = spine[k], prev = spine[Math.max(0, k - 1)], next = spine[Math.min(ringCount - 1, k + 1)];
        if (k > 0) cumV += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z) * vScale;
        let tx = next.x - prev.x, ty = next.y - prev.y, tz = next.z - prev.z;
        const tLen = Math.hypot(tx, ty, tz) || 1;
        tx /= tLen; ty /= tLen; tz /= tLen;
        const rxRef = Math.abs(tz) > 0.9 ? 1 : 0, rzRef = Math.abs(tz) > 0.9 ? 0 : 1;
        let ux = -rzRef * ty, uy = rzRef * tx - rxRef * tz, uz = rxRef * ty;
        const uLen = Math.hypot(ux, uy, uz) || 1;
        ux /= uLen; uy /= uLen; uz /= uLen;
        const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux, ao = pt.ao !== undefined ? pt.ao : 0.85;
        for (let i = 0; i <= radialSegs; i++) {
            const ang = (i / radialSegs) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
            const nx = ca * ux + sa * vx, ny = ca * uy + sa * vy, nz = ca * uz + sa * vz, vi = k * stride + i;
            pos[vi * 3] = pt.x + nx * pt.r; pos[vi * 3 + 1] = pt.y + ny * pt.r; pos[vi * 3 + 2] = pt.z + nz * pt.r;
            norm[vi * 3] = nx; norm[vi * 3 + 1] = ny; norm[vi * 3 + 2] = nz;
            uv[vi * 2] = i / radialSegs; uv[vi * 2 + 1] = cumV;
            col[vi * 3] = ao; col[vi * 3 + 1] = ao * 0.96; col[vi * 3 + 2] = ao * 0.92;
        }
    }
    const indices = [];
    for (let k = 0; k < ringCount - 1; k++) for (let i = 0; i < radialSegs; i++) { const a = k * stride + i, b = a + 1, c = a + stride, d = c + 1; indices.push(a, b, d, a, d, c); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(indices);
    return geo;
}

function _createFoliageLobeGeometry(rx, ry, rz, cx, cy, cz, lonSegs, latSegs, seed) {
    const stride = lonSegs + 1, vertCount = (latSegs + 1) * stride;
    const pos = new Float32Array(vertCount * 3), norm = new Float32Array(vertCount * 3), uv = new Float32Array(vertCount * 2), col = new Float32Array(vertCount * 3);
    for (let j = 0; j <= latSegs; j++) {
        const phi = (j / latSegs) * Math.PI, sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), ao = 0.36 + 0.64 * Math.pow(0.5 + 0.5 * cosPhi, 0.85);
        for (let i = 0; i <= lonSegs; i++) {
            const theta = (i / lonSegs) * Math.PI * 2, ux = -Math.cos(theta) * sinPhi, uy = cosPhi, uz = Math.sin(theta) * sinPhi;
            const lobe = 0.86 + 0.18 * Math.sin(theta * 3 + seed) * Math.sin(phi * 2 + seed * 0.5), vi = j * stride + i;
            const px = cx + ux * rx * lobe, py = cy + uy * ry * lobe, pz = cz + uz * rz * lobe;
            pos[vi * 3] = px; pos[vi * 3 + 1] = py; pos[vi * 3 + 2] = pz;
            const nx = ux * 0.65, ny = uy * 0.50 + 0.48, nz = uz * 0.65, nLen = Math.hypot(nx, ny, nz) || 1;
            norm[vi * 3] = nx / nLen; norm[vi * 3 + 1] = ny / nLen; norm[vi * 3 + 2] = nz / nLen;
            uv[vi * 2] = (px + pz) * 0.85; uv[vi * 2 + 1] = py * 0.95 + (px - pz) * 0.35;
            col[vi * 3] = ao * 0.92; col[vi * 3 + 1] = ao; col[vi * 3 + 2] = ao * 0.82;
        }
    }
    const indices = [];
    for (let j = 0; j < latSegs; j++) for (let i = 0; i < lonSegs; i++) { const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1; if (j !== 0) indices.push(a, d, b); if (j !== latSegs - 1) indices.push(a, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(indices);
    return geo;
}

Dungeon3DProto.createBotanicalTreeTrunkGeometry = function createBotanicalTreeTrunkGeometry() {
    const parts = [
        _createSpineLimbGeometry([
            { x: 0.0, y: 0.0, z: 0.0, r: 0.24, ao: 0.62 },
            { x: 0.02, y: 0.36, z: 0.01, r: 0.15, ao: 0.78 },
            { x: -0.02, y: 1.05, z: 0.02, r: 0.11, ao: 0.88 },
            { x: 0.01, y: 1.68, z: -0.01, r: 0.075, ao: 0.94 }
        ], 8)
    ];
    for (let b = 0; b < 3; b++) {
        const ang = b * 2.0944 + 0.35;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        parts.push(_createSpineLimbGeometry([
            { x: 0.0, y: 1.24 + b * 0.06, z: 0.0, r: 0.068, ao: 0.72 },
            { x: dx * 0.28, y: 1.58 + b * 0.04, z: dz * 0.28, r: 0.044, ao: 0.84 },
            { x: dx * 0.54, y: 1.90 + b * 0.05, z: dz * 0.54, r: 0.024, ao: 0.94 }
        ], 5));
    }
    return this._mergeBufferGeometries(parts);
};

Dungeon3DProto.createBotanicalTreeCanopyGeometry = function createBotanicalTreeCanopyGeometry() {
    const parts = [
        _createFoliageLobeGeometry(0.84, 0.66, 0.82, 0.0, 2.28, 0.0, 10, 5, 1.1),
        _createFoliageLobeGeometry(0.56, 0.44, 0.56, 0.24, 2.52, -0.18, 6, 3, 7.3),
        _createFoliageLobeGeometry(0.54, 0.42, 0.54, -0.22, 2.46, 0.20, 6, 3, 8.9)
    ];
    for (let b = 0; b < 3; b++) {
        const ang = b * 2.0944 + 0.35;
        parts.push(_createFoliageLobeGeometry(0.62, 0.46, 0.58, Math.cos(ang) * 0.46, 1.80 + (b % 2) * 0.12, Math.sin(ang) * 0.46, 8, 3, 2.3 + b));
    }
    return this._mergeBufferGeometries(parts);
};

Dungeon3DProto.createBotanicalBushGeometry = function createBotanicalBushGeometry() {
    return this._mergeBufferGeometries([
        _createFoliageLobeGeometry(0.46, 0.40, 0.46, 0.0, 0.30, 0.0, 8, 4, 4.2),
        _createFoliageLobeGeometry(0.34, 0.30, 0.34, 0.26, 0.22, -0.12, 6, 3, 5.1),
        _createFoliageLobeGeometry(0.34, 0.30, 0.34, -0.24, 0.22, 0.14, 6, 3, 6.4)
    ]);
};

Dungeon3DProto._loadPolyHavenTreeModel = function _loadPolyHavenTreeModel() {
    if (this._polyHavenTreeLoaded) return Promise.resolve(true);
    if (this._polyHavenTreePromise) return this._polyHavenTreePromise;

    this._hasPolyHavenTreeTex = true;
    if (!this._tanglethornTrunkGeo) this._tanglethornTrunkGeo = this.createBotanicalTreeTrunkGeometry();
    if (!this._tanglethornLeavesGeo) this._tanglethornLeavesGeo = this.createBotanicalTreeCanopyGeometry();

    if (this.treeLeavesMat) {
        this.treeLeavesMat.side = THREE.FrontSide;
        this.treeLeavesMat.alphaTest = 0;
        this.treeLeavesMat.transparent = false;
        this.treeLeavesMat.roughness = 0.72;
        if (this.treeLeavesMat.normalScale) this.treeLeavesMat.normalScale.set(1.25, 1.25);
        this.treeLeavesMat.needsUpdate = true;
    }

    const applyBark = () => {
        const ph = this.polyHavenSets || this.polyhavenSets;
        const bark = ph && ph.get('bark_willow_02');
        if (bark && this.treeTrunkMat) {
            if (bark.diff) this.treeTrunkMat.map = bark.diff;
            if (bark.nor) { this.treeTrunkMat.normalMap = bark.nor; this.treeBarkNormal = bark.nor; }
            if (bark.arm) this.treeTrunkMat.roughnessMap = bark.arm;
            this.treeTrunkMat.side = THREE.FrontSide;
            this.treeTrunkMat.needsUpdate = true;
        }
    };
    applyBark();

    this._polyHavenTreePromise = (typeof this.ensurePbrSetReady === 'function')
        ? Promise.resolve(this.ensurePbrSetReady('bark_willow_02')).then(() => { applyBark(); this._polyHavenTreeLoaded = true; return true; })
        : Promise.resolve(true).then(() => { this._polyHavenTreeLoaded = true; return true; });
    return this._polyHavenTreePromise;
};

Dungeon3DProto._loadPolyHavenEnvironmentModels = function _loadPolyHavenEnvironmentModels(opts) {
    const needTrees = Boolean(opts && opts.outdoors);
    if (needTrees) {
        this._loadPolyHavenTreeModel();
    }
    if (this._polyHavenEnvLoaded) return Promise.resolve(true);
    if (this._polyHavenEnvPromise) return this._polyHavenEnvPromise;
    if (typeof THREE.GLTFLoader === 'undefined') {
        this._polyHavenEnvLoaded = true;
        return Promise.resolve(false);
    }

    const resolveAssetUrl = (u) => (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(u) : u;
    const envMgr = new THREE.LoadingManager();
    envMgr.setURLModifier(resolveAssetUrl);
    const loader = new THREE.GLTFLoader(envMgr);
    const envTasks = [];
    const addGltfTask = (url, onDone) => {
        envTasks.push(new Promise((resolve) => {
            loader.load(url, (gltf) => {
                try {
                    const maybePromise = onDone(gltf);
                    if (maybePromise && typeof maybePromise.then === 'function') {
                        maybePromise.then(() => resolve(true)).catch(() => resolve(false));
                        return;
                    }
                } catch (_) {}
                resolve(true);
            }, undefined, () => resolve(false));
        }));
    };

    const applyRockAo = (geo, maxH) => {
        const pos = geo.attributes.position;
        const col = geo.attributes.color.array;
        for (let i = 0; i < pos.count; i++) {
            const ao = 0.34 + 0.48 * Math.pow(Math.min(1, Math.max(0, pos.getY(i) / maxH)), 0.65);
            col[i * 3] = ao * 0.94; col[i * 3 + 1] = ao * 0.95; col[i * 3 + 2] = ao;
        }
        geo.attributes.color.needsUpdate = true;
    };

    // 1. Rock 07 Photogrammetry Granite Crags -> Both Mountain Peaks AND Multi-Slab Collapsed Rubble Talus
    addGltfTask('/assets/polyhaven/models/rock_07/rock_07.gltf', (gltf) => {
        const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!scene) return;
        const parts = [];
        let diff = null, nor = null;
        scene.traverse((c) => {
            if (c.isMesh && c.geometry) {
                c.updateMatrixWorld(true);
                if (c.material) {
                    if (!diff && c.material.map) diff = c.material.map;
                    if (!nor && c.material.normalMap) nor = c.material.normalMap;
                }
                const g = c.geometry.clone();
                g.applyMatrix4(c.matrixWorld);
                if (typeof c.geometry.dispose === 'function') c.geometry.dispose();
                if (g.attributes.color) g.deleteAttribute('color');
                const colArr = new Float32Array(g.attributes.position.count * 3);
                colArr.fill(1.0);
                g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
                parts.push(g);
            }
        });
        if (parts.length > 0) {
            const baseGeo = this._mergeBufferGeometries(parts);
            for (const p of parts) { if (p && typeof p.dispose === 'function') p.dispose(); }
            baseGeo.computeBoundingBox();
            const bbox = baseGeo.boundingBox;
            const cx = (bbox.min.x + bbox.max.x) * 0.5;
            const cz = (bbox.min.z + bbox.max.z) * 0.5;
            const spanXZ = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) || 1.0;
            const spanY = (bbox.max.y - bbox.min.y) || 1.0;

            // 1a. Multi-slab jagged collapsed masonry rubble talus (feat 16 ':')
            const slabSpecs = [
                { s: [1.05 / spanXZ, 0.96 / spanY, 0.92 / spanXZ], rot: [0.34, 0.42, 0.18], off: [-0.14, 0.0, 0.08] },
                { s: [0.82 / spanXZ, 0.72 / spanY, 0.78 / spanXZ], rot: [-0.28, -0.75, 0.25], off: [0.32, -0.02, -0.22] },
                { s: [0.74 / spanXZ, 0.58 / spanY, 0.68 / spanXZ], rot: [0.18, 1.45, -0.32], off: [-0.36, -0.03, -0.26] }
            ];
            const rubbleSlabs = slabSpecs.map(sp => {
                const sg = baseGeo.clone();
                sg.translate(-cx, -bbox.min.y, -cz);
                sg.scale(sp.s[0], sp.s[1], sp.s[2]);
                sg.rotateX(sp.rot[0]); sg.rotateY(sp.rot[1]); sg.rotateZ(sp.rot[2]);
                sg.computeBoundingBox();
                sg.translate(sp.off[0], -sg.boundingBox.min.y + sp.off[1], sp.off[2]);
                return sg;
            });
            const rubbleGeo = this._mergeBufferGeometries(rubbleSlabs);
            for (const sg of rubbleSlabs) sg.dispose();
            applyRockAo(rubbleGeo, 1.15);
            rubbleGeo.computeVertexNormals();
            if (this.rubbleMesh && this.rubbleMesh.geometry) this.rubbleMesh.geometry.dispose();
            if (this.rubbleMesh) this.rubbleMesh.geometry = rubbleGeo;
            if (this.rubbleMaterial && (diff || nor)) {
                if (diff) { diff.encoding = THREE.sRGBEncoding; diff._sharedTexture = true; this.rubbleMaterial.map = diff; }
                if (nor) { nor._sharedTexture = true; this.rubbleMaterial.normalMap = nor; }
                this.rubbleMaterial.needsUpdate = true;
                this._hasPolyHavenRubbleTex = true;
            }

            // 1b. Alpine Mountain Peaks (feat 30)
            const mountainGeo = baseGeo;
            mountainGeo.translate(-cx, -bbox.min.y, -cz);
            mountainGeo.scale(2.15 / spanXZ, 3.80 / spanY, 2.15 / spanXZ);
            applyRockAo(mountainGeo, 3.80);
            mountainGeo.computeVertexNormals();

            if (this.mountainMesh && this.mountainMesh.geometry) this.mountainMesh.geometry.dispose();
            if (this.mountainMesh) this.mountainMesh.geometry = mountainGeo;
            if (this.mountainMaterial && (diff || nor)) {
                if (diff) { diff.encoding = THREE.sRGBEncoding; diff._sharedTexture = true; this.mountainMaterial.map = diff; }
                if (nor) { nor._sharedTexture = true; this.mountainMaterial.normalMap = nor; }
                this.mountainMaterial.needsUpdate = true;
                this._hasPolyHavenMountainTex = true;
            }
            this._lastTerrainSig = null;
        }
    });

    const curEnvRealm = String(this.realm || '').toLowerCase();
    if (!curEnvRealm || curEnvRealm === 'silq' || curEnvRealm === 'ryod') {
        addGltfTask('/assets/models/items/Anvil_Log.gltf', (gltf) => {
            if (!gltf || !gltf.scene || !this.forgeMesh) return;
            gltf.scene.updateMatrixWorld(true);
            const geos = [];
            let firstMap = null;
            gltf.scene.traverse((c) => {
                if (c.isMesh && c.geometry) {
                    const g = c.geometry.clone();
                    g.applyMatrix4(c.matrixWorld);
                    if (typeof c.geometry.dispose === 'function') c.geometry.dispose();
                    if (c.material && c.material.map && !firstMap) firstMap = c.material.map;
                    const vCount = g.attributes.position ? g.attributes.position.count : 0;
                    if (vCount > 0 && !g.attributes.color) {
                        const colors = new Float32Array(vCount * 3);
                        const mc = (c.material && c.material.color) ? c.material.color : { r: 0.72, g: 0.68, b: 0.64 };
                        for (let i = 0; i < vCount; i++) {
                            colors[i * 3] = mc.r;
                            colors[i * 3 + 1] = mc.g;
                            colors[i * 3 + 2] = mc.b;
                        }
                        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                    }
                    geos.push(g);
                }
            });
            if (geos.length > 0) {
                const merged = this._mergeBufferGeometries(geos);
                for (const g of geos) { if (g && typeof g.dispose === 'function') g.dispose(); }
                merged.computeBoundingBox();
                const bbox = merged.boundingBox;
                const cx = (bbox.min.x + bbox.max.x) * 0.5;
                const cz = (bbox.min.z + bbox.max.z) * 0.5;
                const span = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z) || 1.0;
                merged.translate(-cx, -bbox.min.y, -cz);
                merged.scale(1.10 / span, 1.10 / span, 1.10 / span);
                merged.computeVertexNormals();
                if (this.forgeMesh.geometry) this.forgeMesh.geometry.dispose();
                this.forgeMesh.geometry = merged;
                if (firstMap && this.forgeMaterial) {
                    if (typeof THREE.sRGBEncoding !== 'undefined') firstMap.encoding = THREE.sRGBEncoding;
                    this.forgeMaterial.map = firstMap;
                    this.forgeMaterial.needsUpdate = true;
                }
                this._lastTerrainSig = null;
            }
        });
    }

    // # ROOT-CAUSE: Preserve the 3-layer sculpted Gothic High Altar and 3-layer Tiered Marble Fountain geometries instead of overwriting them with broken shrine_candles.gltf UV merges or low-poly cartoon building_well_blue.gltf.
    // 4 & 5. Bind 2K PBR Carved Stone Normal & Roughness Maps to Sculpted High Altars (feat 43) & Magic Fountains (feat 44)
    this.loadPolyHavenSet('monastery_stone_floor', 2, 2, (stoneSet) => {
        if (stoneSet && stoneSet.nor) {
            if (this.altarMaterial) {
                this.altarMaterial.normalMap = stoneSet.nor;
                if (stoneSet.arm) this.altarMaterial.roughnessMap = stoneSet.arm;
                this.altarMaterial.normalScale = new THREE.Vector2(1.20, 1.20);
                this.altarMaterial.needsUpdate = true;
            }
            if (this.fountainMaterial) {
                this.fountainMaterial.normalMap = stoneSet.nor;
                if (stoneSet.arm) this.fountainMaterial.roughnessMap = stoneSet.arm;
                this.fountainMaterial.normalScale = new THREE.Vector2(1.15, 1.15);
                this.fountainMaterial.needsUpdate = true;
            }
        }
    });
    const isSurfaceVanillaTown = Number(this.lastDepth || 0) === 0 && (this.realm === 'angband' || this.realm === 'frogcomposband' || this.realm === 'hengband');
    if (!isSurfaceVanillaTown && typeof this.ensurePbrSetReady === 'function') {
        envTasks.push(this.ensurePbrSetReady('monastery_stone_floor'));
    }

    // Native watertight 2.00m x 3.00m doorFrameGeo, solid iron-strapped plank doorClosedGeo/doorOpenGeo,
    // sunken descending stairsDownGeo, ascending shaft stairsUpGeo, and 3-layer altar/fountain geometries
    // are preserved directly from initMeshes() without low-poly/lattice GLTF overrides.

    this._polyHavenEnvPromise = Promise.allSettled(envTasks).then(() => {
        this._polyHavenEnvLoaded = true;
        this._lastTerrainSig = null;
        return true;
    });
    return this._polyHavenEnvPromise;
};


Dungeon3DProto.initStreetViewNavigation = function initStreetViewNavigation() {
    if (this.streetViewGroup) return;

    this.streetViewGroup = new THREE.Group();
    this.streetViewGroup.name = 'StreetViewChevrons';
    this.streetViewGroup.visible = false;
    this.scene.add(this.streetViewGroup);

    const geo = new THREE.BufferGeometry();
    const positions = [];
    const addChevron = (z0) => {
        const to = [0, 0, z0 - 0.34];
        const ti = [0, 0, z0 - 0.16];
        const lo = [-0.46, 0, z0 + 0.14];
        const li = [-0.30, 0, z0 + 0.19];
        const ro = [0.46, 0, z0 + 0.14];
        const ri = [0.30, 0, z0 + 0.19];

        // Left wing: to, lo, li and to, li, ti
        positions.push(...to, ...lo, ...li);
        positions.push(...to, ...li, ...ti);
        // Right wing: to, ti, ri and to, ri, ro
        positions.push(...to, ...ti, ...ri);
        positions.push(...to, ...ri, ...ro);
    };
    addChevron(0.0);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    geo._sharedGeometry = true;
    this._sharedChevronGeo = geo;

    this._streetChevrons = [];
    const deltas = [
        { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
        { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
    ];

    const ring = 1;
    for (const d of deltas) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xd4af37,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        mat._sharedMaterial = true;
        const mesh = new THREE.Mesh(this._sharedChevronGeo, mat);
        mesh.visible = false;
        mesh.userData = { dx: d.dx, dy: d.dy, ring, passable: false };
        this.streetViewGroup.add(mesh);
        this._streetChevrons.push(mesh);
    }

    this.navCursorGroup = new THREE.Group();
    this.navCursorGroup.name = 'NavCursorGroup';
    this.navCursorGroup.visible = false;
    this.scene.add(this.navCursorGroup);

    const ringGeo = new THREE.RingGeometry(0.42, 0.52, 48);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo._sharedGeometry = true;
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    ringMat._sharedMaterial = true;
    this.navCursorMesh = new THREE.Mesh(ringGeo, ringMat);
    this.navCursorMesh.name = 'NavCursorMesh';
    this.navCursorGroup.add(this.navCursorMesh);

    const crumbGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.025, 16);
    crumbGeo._sharedGeometry = true;
    const crumbMat = new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
    });
    crumbMat._sharedMaterial = true;
    this.navBreadcrumbsMesh = new THREE.InstancedMesh(crumbGeo, crumbMat, 64);
    this.navBreadcrumbsMesh.name = 'NavBreadcrumbsMesh';
    this.navBreadcrumbsMesh.count = 0;
    this.navCursorGroup.add(this.navBreadcrumbsMesh);
};

Dungeon3DProto.canEngageStreetViewNav = function canEngageStreetViewNav(frame) {
    if (!frame || frame.phase !== 'play' || !frame.player || !frame.map) return false;
    if ((frame.ui?.overlay || 0) > 0 || (!frame.ui?.awaiting_command && !frame.ui?.more)) return false;
    return true;
};

Dungeon3DProto._isStreetViewTilePassable = function _isStreetViewTilePassable(frame, map, w, h, tx, ty) {
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
    const feat = this.getFeatAt(map, tx, ty);
    const glyph = this.getGlyphAt(map, tx, ty);
    const isSolidWall = feat === 0 || (feat >= 15 && feat <= 22) || feat === 30 || glyph === '#' || glyph === '%' || glyph === '*';
    const isTree = (feat === 25 && glyph !== '.' && glyph !== ',' && glyph !== "'");
    const isLava = feat === 23;
    const isDeepWater = (feat === 29 || feat === 80);
    const isChasm = feat === 41;
    const isTrap = glyph === '^';
    if (isSolidWall || isTree || isLava || isDeepWater || isChasm || isTrap) return false;
    if (Array.isArray(frame.monsters)) {
        for (let mIdx = 0; mIdx < frame.monsters.length; mIdx++) {
            const m = frame.monsters[mIdx];
            if (m && m.visible !== false && m.x === tx && m.y === ty) return false;
        }
    }
    return true;
};

Dungeon3DProto.updateStreetViewAndCursor = function updateStreetViewAndCursor(frame) {
    if (!this.streetViewGroup) this.initStreetViewNavigation();

    if (!this.canEngageStreetViewNav(frame)) {
        if (this.streetViewGroup) this.streetViewGroup.visible = false;
        if (this.navCursorGroup) this.navCursorGroup.visible = false;
        if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
        this._hoveredTile = null;
        return;
    }

    this.streetViewGroup.visible = true;
    const map = frame.map;
    const w = map.w || (map.rows && map.rows[0] && map.rows[0].f ? map.rows[0].f.length / 2 : 0);
    const h = map.h || (map.rows ? map.rows.length : 0);
    const px = frame.player.x !== undefined ? frame.player.x : 0;
    const py = frame.player.y !== undefined ? frame.player.y : 0;
    if (this._lastNavPlayerX !== px || this._lastNavPlayerY !== py) {
        this._lastNavPlayerX = px;
        this._lastNavPlayerY = py;
        const activeNav = (this._hoverInputRef && this._hoverInputRef._minimapNavPath) ||
            (typeof window !== 'undefined' && window.__app && window.__app.input && window.__app.input._minimapNavPath);
        if (!activeNav || activeNav.length === 0) {
            if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
            if (this.navCursorGroup) this.navCursorGroup.visible = false;
            this._hoveredTile = null;
        }
    }

    for (let i = 0; i < this._streetChevrons.length; i++) {
        const c = this._streetChevrons[i];
        const d = c.userData;
        const tx1 = px + d.dx;
        const ty1 = py + d.dy;
        const step1Passable = this._isStreetViewTilePassable(frame, map, w, h, tx1, ty1);

        if (step1Passable) {
            d.passable = true;
            const visualDist = 1.0;
            const isHovered = Boolean(this._hoveredTile && this._hoveredTile.x === tx1 && this._hoveredTile.y === ty1);
            c.visible = isHovered;
            c.position.set((px + d.dx * visualDist) * this.cellSize, 0.042, (py + d.dy * visualDist) * this.cellSize);
            c.rotation.y = Math.atan2(-d.dx, -d.dy);
            d.tx = tx1;
            d.ty = ty1;
        } else {
            d.passable = false;
            c.visible = false;
        }
    }
};

Dungeon3DProto.setHoverScreenCoords = function setHoverScreenCoords(clientX, clientY, inputManager) {
    this._pendingHoverX = clientX;
    this._pendingHoverY = clientY;
    this._hoverInputRef = inputManager;
    this._hoverDirty = true;
};

const _STORE_NAMES = ['General Store', 'Armoury', 'Weapon Smith', 'Temple', 'Alchemy Shop', 'Magic Shop', 'Black Market', 'Home', 'Hall of Records'];
Dungeon3DProto.describeMapFeature = function describeMapFeature(frame, x, y) {
    const row = frame?.map?.rows?.[y];
    if (!row) return null;
    const glyph = (row.g && x >= 0 && x < row.g.length) ? row.g[x] : ' ';
    const fIdx = x * 2;
    const feat = (row.f && fIdx + 1 < row.f.length) ? (parseInt(row.f.substring(fIdx, fIdx + 2), 16) || 0) : 0;
    const depth = frame?.player?.depth || 0;
    const fname = this.featureDefs?.[feat]?.name || '';
    if ((feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40) || (depth === 0 && glyph >= '1' && glyph <= '9')) {
        const idx = (glyph >= '1' && glyph <= '9') ? (Number(glyph) - 1) : ((feat >= 7 && feat <= 14) ? feat - 7 : feat - 32);
        return { type: 'store', name: fname || _STORE_NAMES[idx] || 'Town Shop', glyph, x, y, feat };
    }
    if (feat === 2 || glyph === '+') return { type: 'door', name: fname || 'Closed Door', glyph: '+', x, y, feat };
    if (glyph === '>' || glyph === '<') return { type: 'stair', dir: glyph, name: glyph === '>' ? 'Down Stairs' : 'Up Stairs', glyph, x, y, feat };
    if (glyph === '^') return { type: 'trap', name: fname || 'Trap', glyph: '^', x, y, feat };
    if (glyph === '_') return { type: 'altar', name: fname || 'Altar', glyph: '_', x, y, feat };
    if (glyph === '{') return { type: 'fountain', name: fname || 'Fountain', glyph: '{', x, y, feat };
    if (glyph === ':' && feat !== 42) return { type: 'rubble', name: fname || 'Rubble', glyph: ':', x, y, feat };
    return null;
};

Dungeon3DProto._updateHoverAffordance = function _updateHoverAffordance(clientX, clientY, inputMgr, frame, tileHit) {
    const refs = this._hoverPillRefs || (typeof document !== 'undefined' ? (this._hoverPillRefs = {
        pill: document.getElementById('cursor-action-pill'),
        name: document.getElementById('cursor-pill-name'),
        lmb: document.getElementById('cursor-pill-lmb'),
        rmb: document.getElementById('cursor-pill-rmb')
    }) : null);
    const canvas = this.canvas;
    const hide = () => {
        if (refs?.pill && !refs.pill.classList.contains('hidden')) refs.pill.classList.add('hidden');
        if (canvas && canvas.style.cursor) canvas.style.cursor = '';
        this._lastHoverCueSig = '';
    };
    const pop = typeof document !== 'undefined' ? document.getElementById('entity-inspect-popover') : null;
    if (!refs?.pill || clientX < 0 || clientY < 0 || !frame?.player || inputMgr?.inTerminal || (pop && !pop.classList.contains('hidden'))) return hide();
    const px = frame.player.x, py = frame.player.y;
    const mon = this.getMonsterAtScreenCoords?.(clientX, clientY) ||
        (tileHit && Array.isArray(frame.monsters) ? frame.monsters.find(m => m && m.visible !== false && m.x === tileHit.x && m.y === tileHit.y) : null);
    const items = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
    const item = !mon ? (this.getItemAtScreenCoords?.(clientX, clientY) || (tileHit ? items.find(it => it && it.x === tileHit.x && it.y === tileHit.y) : null)) : null;
    const feat = (!mon && !item && tileHit) ? this.describeMapFeature(frame, tileHit.x, tileHit.y) : null;
    let cue = null;
    if (inputMgr?.isDirectionalTargeting?.() && (mon || tileHit)) {
        cue = { cur: 'crosshair', name: mon ? (mon.name || 'Target') : (feat ? feat.name : 'Aim Tile'), lmb: 'LMB Fire / Confirm', rmb: 'RMB Cancel' };
    } else if (mon) {
        const hostile = inputMgr?.isHostileMonster ? inputMgr.isHostileMonster(mon, frame) : true;
        const dist = Math.max(Math.abs((mon.x ?? px) - px), Math.abs((mon.y ?? py) - py));
        const mName = (typeof window !== 'undefined' && this.realm === 'hengband' && window.getLocalizedMonsterName) ? window.getLocalizedMonsterName(mon.name || 'Creature', 'hengband', window.__langMode || 'en') : (mon.name || 'Creature');
        cue = hostile
            ? { cur: 'crosshair', name: dist > 1 ? `${mName} (${dist}sq)` : mName, lmb: dist <= 1 ? 'LMB Attack' : 'LMB Move', rmb: 'RMB Actions' }
            : { cur: 'pointer', name: mName, lmb: dist <= 2 ? 'LMB Talk' : 'LMB Approach', rmb: 'RMB Actions' };
    } else if (item) {
        cue = { cur: 'pointer', name: item.name || item.dname || 'Item', lmb: (item.x === px && item.y === py) ? 'LMB Pick Up' : 'LMB Walk', rmb: 'RMB Inspect' };
    } else if (feat) {
        const lmb = feat.type === 'store' ? 'LMB Enter' : (feat.type === 'door' ? 'LMB Open' : (feat.type === 'stair' && feat.x === px && feat.y === py ? (feat.dir === '>' ? 'LMB Descend' : 'LMB Ascend') : 'LMB Walk'));
        cue = { cur: 'pointer', name: feat.name, lmb, rmb: 'RMB Actions' };
    }
    if (!cue) return hide();
    if (canvas && canvas.style.cursor !== cue.cur) canvas.style.cursor = cue.cur;
    const sig = `${cue.name}|${cue.lmb}|${cue.rmb}`;
    if (sig !== this._lastHoverCueSig) {
        this._lastHoverCueSig = sig;
        if (refs.name) refs.name.textContent = cue.name;
        if (refs.lmb) refs.lmb.textContent = cue.lmb;
        if (refs.rmb) refs.rmb.textContent = cue.rmb;
    }
    refs.pill.classList.remove('hidden');
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280, vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const w = refs.pill.offsetWidth || 260, h = refs.pill.offsetHeight || 26;
    const tx = Math.max(8, Math.min(vw - w - 8, clientX + 16 + w > vw - 8 ? clientX - w - 12 : clientX + 16));
    const ty = Math.max(44, Math.min(vh - h - 8, clientY + 18 + h > vh - 8 ? clientY - h - 12 : clientY + 18));
    refs.pill.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
};

Dungeon3DProto.createAshlarCorniceGeometry = function createAshlarCorniceGeometry(cellSize = 2.0) {
    return this._mergeBufferGeometries([
        new THREE.BoxGeometry(cellSize, 0.20, 0.16).translate(0, 4.10, cellSize * 0.5 - 0.08),
        new THREE.BoxGeometry(cellSize, 0.14, 0.10).translate(0, 4.15, -cellSize * 0.5 + 0.05),
        new THREE.BoxGeometry(0.16, 0.20, cellSize).translate(cellSize * 0.5 - 0.08, 4.10, 0),
        new THREE.BoxGeometry(0.16, 0.20, cellSize).translate(-cellSize * 0.5 + 0.08, 4.10, 0)
    ]);
};

Dungeon3DProto.createVaultStonePillarGeometry = function createVaultStonePillarGeometry(cellSize = 2.0, pillarHeight = 6.5) {
    return this._mergeBufferGeometries([
        new THREE.BoxGeometry(0.68, 0.35, 0.68).translate(0, 0.175, 0),
        new THREE.CylinderGeometry(0.26, 0.28, pillarHeight - 0.70, 8).translate(0, pillarHeight * 0.5, 0),
        new THREE.BoxGeometry(0.64, 0.35, 0.64).translate(0, pillarHeight - 0.175, 0)
    ]);
};

Dungeon3DProto._buildThresholdAndStorefrontGeos = function _buildThresholdAndStorefrontGeos(createMergedBoxGeometry) {
    // Disjoint Storefront Stone Masonry (threshold, display plinths at x=±0.74, yTop=0.45, z=0.56, and interior back wall)
    const shopStoneGeo = createMergedBoxGeometry([
        { pos: [0, 0.05, 0.46], size: [1.04, 0.12, 0.96], color: [0.76, 0.72, 0.66] },
        { pos: [-0.74, 0.225, 0.56], size: [0.42, 0.45, 0.44], color: [0.72, 0.68, 0.62] },
        { pos: [0.74, 0.225, 0.56], size: [0.42, 0.45, 0.44], color: [0.72, 0.68, 0.62] },
        { pos: [0, 1.14, -0.52], size: [1.35, 2.28, 0.88], color: [0.64, 0.60, 0.55] }
    ]);
    // Open-vestibule stone variant when player/camera occupies shop threshold (back wall recessed to z=-0.95m)
    const shopStoneOccupiedGeo = createMergedBoxGeometry([
        { pos: [0, 0.05, 0.46], size: [1.04, 0.12, 0.96], color: [0.76, 0.72, 0.66] },
        { pos: [0, 0.04, -0.46], size: [1.62, 0.10, 0.88], color: [0.68, 0.64, 0.58] },
        { pos: [-0.76, 0.225, 0.58], size: [0.40, 0.45, 0.42], color: [0.72, 0.68, 0.62] },
        { pos: [0.76, 0.225, 0.58], size: [0.40, 0.45, 0.42], color: [0.72, 0.68, 0.62] },
        { pos: [0, 1.22, -0.95], size: [1.72, 2.44, 0.08], color: [0.48, 0.45, 0.42] }
    ]);
    // Disjoint Carved Oak Timber Archway (front portal at Z >= -0.02 so interior vestibule has 0 side-beam occlusion)
    const shopFrameGeo = createMergedBoxGeometry([
        { pos: [-0.86, 1.14, 0.16], size: [0.26, 2.28, 0.36], color: [0.42, 0.28, 0.16] },
        { pos: [0.86, 1.14, 0.16], size: [0.26, 2.28, 0.36], color: [0.42, 0.28, 0.16] },
        { pos: [0, 2.775, 0.0], size: [1.992, 0.51, 1.992], color: [0.38, 0.25, 0.14] },
        { pos: [0, 2.44, -0.45], size: [1.992, 0.16, 1.08], color: [0.36, 0.24, 0.13] },
        { pos: [-0.71, 1.205, 0.22], size: [0.08, 2.15, 0.24], color: [0.34, 0.22, 0.12] },
        { pos: [0.71, 1.205, 0.22], size: [0.08, 2.15, 0.24], color: [0.34, 0.22, 0.12] },
        { pos: [-0.54, 2.13, 0.22], size: [0.28, 0.11, 0.20], rotZ: 0.38, color: [0.34, 0.22, 0.12] },
        { pos: [0.54, 2.13, 0.22], size: [0.28, 0.11, 0.20], rotZ: -0.38, color: [0.34, 0.22, 0.12] },
        { pos: [-0.74, 1.96, 0.46], size: [0.06, 0.08, 0.24], color: [0.18, 0.17, 0.16] },
        { pos: [0.74, 1.96, 0.46], size: [0.06, 0.08, 0.24], color: [0.18, 0.17, 0.16] },
        { pos: [-0.71, 1.75, 0.06], size: [0.07, 0.14, 0.05], color: [0.18, 0.17, 0.16] },
        { pos: [-0.71, 0.55, 0.06], size: [0.07, 0.14, 0.05], color: [0.18, 0.17, 0.16] }
    ]);
    // Clean Sloped Canopy seated at y=2.24..2.50m, z=0.10..0.86m below flush fascia lintel sign (y=2.74m)
    const shopAwningGeo = createMergedBoxGeometry([
        { pos: [0, 2.38, 0.48], size: [1.92, 0.07, 0.74], rotX: 0.26, color: [1.0, 1.0, 1.0] },
        { pos: [0, 2.27, 0.84], size: [1.92, 0.08, 0.04], color: [0.92, 0.85, 0.70] },
        { pos: [-0.82, 2.05, 0.42], size: [0.09, 0.52, 0.09], rotX: -0.60, color: [0.36, 0.23, 0.13] },
        { pos: [0.82, 2.05, 0.42], size: [0.09, 0.52, 0.09], rotX: -0.60, color: [0.36, 0.23, 0.13] }
    ]);
    // Shop Door Leaf with iron straps & latch UV-mapped cleanly to dark forged-iron region (0 squashed shields!)
    const shopDoorGeo = createMergedBoxGeometry([
        { pos: [0, 1.15, 0.05], size: [1.40, 2.20, 0.10] },
        { pos: [0, 1.75, 0.06], size: [1.36, 0.11, 0.13], uvRect: [0.08, 0.175, 0.92, 0.22] },
        { pos: [0, 0.55, 0.06], size: [1.36, 0.11, 0.13], uvRect: [0.08, 0.175, 0.92, 0.22] },
        { pos: [0.45, 1.10, 0.11], size: [0.10, 0.16, 0.05], uvRect: [0.18, 0.175, 0.30, 0.22] }
    ]);
    // Town horizontal bands (no interior mid-wall vertical post doubling) + standalone true-corner post
    const townTimberGeo = createMergedBoxGeometry([
        { pos: [0, 0.125, 0], size: [1.992, 0.24, 1.992], color: [0.44, 0.42, 0.40] },
        { pos: [0, 1.580, 0], size: [1.992, 0.14, 1.992], color: [0.28, 0.26, 0.25] },
        { pos: [0, 2.950, 0], size: [1.996, 0.18, 1.996], color: [0.26, 0.25, 0.24] }
    ]);
    const townCornerPostGeo = createMergedBoxGeometry([
        { pos: [0, 0.8775, 0], size: [0.17, 1.259, 0.17], color: [0.25, 0.24, 0.23] },
        { pos: [0, 2.255, 0], size: [0.17, 1.204, 0.17], color: [0.25, 0.24, 0.23] }
    ]);
    // Occupied Up-Stair cutaway (low carved stairwell perimeter curb/plinth y <= 0.22m; ceiling shaft collar emitted at y >= tileCeilH)
    const stairsUpOccupiedGeo = createMergedBoxGeometry([
        { pos: [0, 0.03, -0.04], size: [1.54, 0.06, 1.78], color: [0.80, 0.78, 0.74] },
        { pos: [-0.86, 0.10, 0], size: [0.24, 0.20, 1.92], color: [0.72, 0.70, 0.66] },
        { pos: [0.86, 0.10, 0], size: [0.24, 0.20, 1.92], color: [0.72, 0.70, 0.66] },
        { pos: [0, 0.11, -0.88], size: [1.48, 0.22, 0.20], color: [0.74, 0.72, 0.68] },
        { pos: [0, 0.08, 0.80], size: [1.52, 0.16, 0.22], color: [0.84, 0.82, 0.78] }
    ]);
    // Occupied Walkable Monument cutaways (0 geometry above y=0.22m inside r=0.55m cylinder around lens)
    const altarOccupiedGeo = createMergedBoxGeometry([
        { pos: [0, 0.045, 0], size: [1.68, 0.09, 1.28], color: [0.76, 0.74, 0.69] },
        { pos: [0, 0.13, 0], size: [1.42, 0.08, 1.04], color: [0.86, 0.83, 0.78] },
        { pos: [0, 0.14, 0], size: [0.46, 0.09, 1.06], color: [0.64, 0.09, 0.12] },
        { type: 'cylinder', rTop: 0.05, rBottom: 0.06, height: 0.36, segments: 10, pos: [-0.66, 0.26, -0.46], color: [0.96, 0.84, 0.42] },
        { type: 'cylinder', rTop: 0.05, rBottom: 0.06, height: 0.36, segments: 10, pos: [0.66, 0.26, -0.46], color: [0.96, 0.84, 0.42] },
        { type: 'cylinder', rTop: 0.05, rBottom: 0.06, height: 0.36, segments: 10, pos: [-0.66, 0.26, 0.46], color: [0.96, 0.84, 0.42] },
        { type: 'cylinder', rTop: 0.05, rBottom: 0.06, height: 0.36, segments: 10, pos: [0.66, 0.26, 0.46], color: [0.96, 0.84, 0.42] }
    ]);
    const fountainOccupiedGeo = createMergedBoxGeometry([
        { type: 'cylinder', rTop: 0.88, rBottom: 0.92, height: 0.12, segments: 8, pos: [0, 0.06, 0], color: [0.82, 0.84, 0.86] },
        { type: 'torus', radius: 0.74, tube: 0.09, radialSegments: 8, tubularSegments: 16, rotX: Math.PI / 2, pos: [0, 0.20, 0], color: [0.90, 0.92, 0.94] },
        { type: 'cylinder', rTop: 0.68, rBottom: 0.68, height: 0.04, segments: 16, pos: [0, 0.13, 0], color: [0.28, 0.84, 0.98] }
    ]);
    return {
        shopStoneGeo, shopStoneOccupiedGeo, shopFrameGeo, shopAwningGeo, shopDoorGeo,
        townTimberGeo, townCornerPostGeo, stairsUpOccupiedGeo, altarOccupiedGeo, fountainOccupiedGeo
    };
};

Dungeon3DProto._mountStorefrontClusterProps = function _mountStorefrontClusterProps(shopPropAnchor, storeIdx, storeDisplayWares) {
    const attachStoreProp = (propKey, lx, ly, lz, targetSize = 0.34, rotY = 0) => {
        const mount = (tmpl) => {
            if (!tmpl || !shopPropAnchor.parent) return;
            const clone = this._cloneCachedGltfTemplate ? this._cloneCachedGltfTemplate(tmpl, null, propKey) : tmpl.clone(true);
            if (!clone) return;
            const innerPivot = clone.children && clone.children[0];
            if (innerPivot) {
                innerPivot.position.set(0, 0, 0);
                if (propKey === 'item_greatsword') innerPivot.rotation.set(0, 0, 1.32);
                else if (propKey === 'item_wand') innerPivot.rotation.set(0, 0, 0.88);
                else innerPivot.rotation.set(0, 0, 0);
            }
            if (propKey === 'ph_lantern') {
                clone.traverse((c) => {
                    if (c.isMesh && c.material && !Array.isArray(c.material)) {
                        const mClone = c.material.clone();
                        this._applyUvSeamBleedFix(mClone);
                        if (mClone.emissive) {
                            mClone.emissiveMap = mClone.map || null;
                            mClone.emissive.setHex(0xff9d2e);
                            mClone.emissiveIntensity = mClone.map ? 0.55 : 0.18;
                        }
                        c.material = mClone;
                    }
                });
            }
            clone.position.set(0, 0, 0);
            clone.scale.set(1, 1, 1);
            clone.rotation.set(0, rotY, 0);
            clone.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(clone);
            const sz = new THREE.Vector3();
            box.getSize(sz);
            const maxDim = Math.max(0.001, sz.x, sz.y, sz.z);
            const s = targetSize / maxDim;
            clone.scale.set(s, s, s);
            clone.updateMatrixWorld(true);
            const box2 = new THREE.Box3().setFromObject(clone);
            const center = new THREE.Vector3();
            box2.getCenter(center);
            clone.position.set(lx - center.x, ly - box2.min.y, lz - center.z);
            shopPropAnchor.add(clone);
        };
        if (this._gltfTemplateCache && this._gltfTemplateCache.has(propKey)) {
            mount(this._gltfTemplateCache.get(propKey));
        } else if (this._ensurePolyHavenFloorItem) {
            this._ensurePolyHavenFloorItem(propKey).then(mount).catch(() => {});
        }
    };

    attachStoreProp('ph_lantern', -0.74, 1.70, 0.54, 0.25, 0);
    attachStoreProp('ph_lantern', 0.74, 1.70, 0.54, 0.25, 0);
    const wares = storeDisplayWares[storeIdx] || storeDisplayWares[0];
    if (wares[0]) attachStoreProp(wares[0], -0.76, 0.45, 0.58, 0.34, 0.35);
    if (wares[1]) attachStoreProp(wares[1], 0.76, 0.45, 0.58, 0.34, -0.35);
};
    }

    root.Dungeon3DEnvironment = {
        attach: attachEnvironment
    };

    if (root.Dungeon3D) {
        attachEnvironment(root.Dungeon3D);
    }
})(typeof window !== 'undefined' ? window : globalThis);

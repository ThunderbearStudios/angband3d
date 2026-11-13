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
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
};

Dungeon3DProto._loadPolyHavenEnvironmentModels = function _loadPolyHavenEnvironmentModels() {
    if (this._polyHavenEnvLoaded) return Promise.resolve(true);
    if (this._polyHavenEnvPromise) return this._polyHavenEnvPromise;
    const loader = (typeof this._getGltfLoader === 'function') ? this._getGltfLoader() : (this.gltfLoader || (typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null));
    if (!loader) {
        this._polyHavenEnvLoaded = true;
        return Promise.resolve(false);
    }

    this._hasPolyHavenTreeTex = true;
    const resolveAssetUrl = (u) => (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(u) : u;
    const rawTexLoader = new THREE.TextureLoader();
    const texLoader = { load: (u, ok, pr, er) => rawTexLoader.load(resolveAssetUrl(u), ok, pr, er) };
    const envTasks = [];
    const addTexTask = (url, onDone) => {
        envTasks.push(new Promise((resolve) => {
            texLoader.load(url, (tex) => {
                try { onDone(tex); } catch (_) {}
                resolve(tex);
            }, undefined, () => resolve(null));
        }));
    };
    const addGltfTask = (url, onDone) => {
        envTasks.push(new Promise((resolve) => {
            loader.load(resolveAssetUrl(url), (gltf) => {
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

    addTexTask('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_bark_diff_1k.jpg', (diff) => {
        diff.encoding = THREE.sRGBEncoding;
        diff.flipY = false;
        if (this.treeTrunkMat) {
            this.treeTrunkMat.map = diff;
            this.treeTrunkMat.needsUpdate = true;
        }
    });
    addTexTask('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_bark_nor_gl_1k.jpg', (nor) => {
        nor.flipY = false;
        this.treeBarkNormal = nor;
        if (this.treeTrunkMat) {
            this.treeTrunkMat.normalMap = nor;
            this.treeTrunkMat.needsUpdate = true;
        }
    });
    addTexTask('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_diff_1k.jpg', (diff) => {
        diff.encoding = THREE.sRGBEncoding;
        diff.flipY = false;
        if (this.treeLeavesMat) {
            this.treeLeavesMat.map = diff;
            this.treeLeavesMat.needsUpdate = true;
        }
        this._lastTerrainSig = null;
    });
    addTexTask('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_nor_gl_1k.jpg', (nor) => {
        nor.flipY = false;
        if (this.treeLeavesMat) {
            this.treeLeavesMat.normalMap = nor;
            this.treeLeavesMat.needsUpdate = true;
        }
    });

    // 1. Pachira Aquatica (Photogrammetry Tree trunk, leaves & bush in local mesh space)
    addGltfTask('/assets/polyhaven/models/pachira_aquatica_01/pachira_aquatica_01.gltf', (gltf) => {
        const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!scene) return;

        const trunkParts = [];
        const leafParts = [];
        const bushParts = [];

        scene.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const fullName = ((child.name || '') + ' ' + (child.parent ? child.parent.name || '' : '')).toLowerCase();
                const isBark = fullName.includes('bark_c') || fullName.includes('circle.001');
                const isLeavesB = fullName.includes('leaves_b') || fullName.includes('cylinder.118');
                const isLeavesC = fullName.includes('leaves_c') || fullName.includes('cylinder.092');
                if (!isBark && !isLeavesB && !isLeavesC) return;

                const g = child.geometry.clone();
                if (g.attributes.color) g.deleteAttribute('color');
                const colArr = new Float32Array(g.attributes.position.count * 3);
                colArr.fill(1.0);
                g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

                if (isBark) {
                    trunkParts.push(g);
                } else if (isLeavesB) {
                    bushParts.push(g);
                } else if (isLeavesC) {
                    if (g.index && g.index.count > 1800) {
                        const srcIdx = g.index.array;
                        const decimated = [];
                        for (let ti = 0; ti + 2 < srcIdx.length; ti += 15) {
                            decimated.push(srcIdx[ti], srcIdx[ti + 1], srcIdx[ti + 2]);
                        }
                        g.setIndex(decimated);
                    }
                    leafParts.push(g);
                }
            }
        });

        if (trunkParts.length > 0 && leafParts.length > 0) {
            const trunkGeo = this._mergeBufferGeometries(trunkParts);
            const leavesGeo = this._mergeBufferGeometries(leafParts);

            const unionBox = new THREE.Box3();
            if (trunkGeo.boundingBox) unionBox.union(trunkGeo.boundingBox);
            if (leavesGeo.boundingBox) unionBox.union(leavesGeo.boundingBox);

            const centerX = (unionBox.min.x + unionBox.max.x) * 0.5;
            const centerZ = (unionBox.min.z + unionBox.max.z) * 0.5;
            const spanXZ = Math.max(unionBox.max.x - unionBox.min.x, unionBox.max.z - unionBox.min.z) || 1.0;
            const spanY = (unionBox.max.y - unionBox.min.y) || 1.0;

            trunkGeo.translate(-centerX, -unionBox.min.y, -centerZ);
            leavesGeo.translate(-centerX, -unionBox.min.y, -centerZ);

            const scaleX = 2.35 / spanXZ;
            const scaleY = 2.85 / spanY;
            const scaleZ = 2.35 / spanXZ;
            trunkGeo.scale(scaleX, scaleY, scaleZ);
            leavesGeo.scale(scaleX, scaleY, scaleZ);

            this._tanglethornTrunkGeo = trunkGeo.clone();
            this._tanglethornLeavesGeo = leavesGeo.clone();

            if (this.treeTrunkMesh && this.treeTrunkMesh.geometry) this.treeTrunkMesh.geometry.dispose();
            if (this.treeLeavesMesh && this.treeLeavesMesh.geometry) this.treeLeavesMesh.geometry.dispose();
            if (this.treeTrunkMesh) this.treeTrunkMesh.geometry = trunkGeo;
            if (this.treeLeavesMesh) this.treeLeavesMesh.geometry = leavesGeo;

            this._lastTerrainSig = null;
        }

        if (bushParts.length > 0) {
            const bushGeo = this._mergeBufferGeometries(bushParts);
            bushGeo.computeBoundingBox();
            const bBox = bushGeo.boundingBox;
            const bCenterX = (bBox.min.x + bBox.max.x) * 0.5;
            const bCenterZ = (bBox.min.z + bBox.max.z) * 0.5;
            const bSpanXZ = Math.max(bBox.max.x - bBox.min.x, bBox.max.z - bBox.min.z) || 1.0;
            const bSpanY = (bBox.max.y - bBox.min.y) || 1.0;

            bushGeo.translate(-bCenterX, -bBox.min.y, -bCenterZ);
            bushGeo.scale(1.28 / bSpanXZ, 0.82 / bSpanY, 1.28 / bSpanXZ);
            bushGeo.computeVertexNormals();

            if (this.bushMesh && this.bushMesh.geometry) this.bushMesh.geometry.dispose();
            if (this.bushMesh) this.bushMesh.geometry = bushGeo;
        }
    });

    // 2. Moon Rock 02 (Photogrammetry Rubble Boulders)
    addGltfTask('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf', (gltf) => {
        const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!scene) return;
        const parts = [];
        scene.traverse((c) => {
            if (c.isMesh && c.geometry) {
                c.updateMatrixWorld(true);
                const g = c.geometry.clone();
                g.applyMatrix4(c.matrixWorld);
                if (g.attributes.color) g.deleteAttribute('color');
                const colArr = new Float32Array(g.attributes.position.count * 3);
                colArr.fill(1.0);
                g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
                parts.push(g);
            }
        });
        if (parts.length > 0) {
            const geo = this._mergeBufferGeometries(parts);
            geo.computeBoundingBox();
            const bbox = geo.boundingBox;
            const cx = (bbox.min.x + bbox.max.x) * 0.5;
            const cz = (bbox.min.z + bbox.max.z) * 0.5;
            const spanXZ = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) || 1.0;
            const spanY = (bbox.max.y - bbox.min.y) || 1.0;
            geo.translate(-cx, -bbox.min.y, -cz);
            geo.scale(1.42 / spanXZ, 1.08 / spanY, 1.42 / spanXZ);
            geo.computeVertexNormals();

            if (this.rubbleMesh && this.rubbleMesh.geometry) this.rubbleMesh.geometry.dispose();
            if (this.rubbleMesh) this.rubbleMesh.geometry = geo;

            return new Promise((resolveTex) => {
                texLoader.load('/assets/polyhaven/models/moon_rock_02/textures/moon_rock_02_diff_1k.jpg', (diff) => {
                    diff.encoding = THREE.sRGBEncoding;
                    diff.flipY = false;
                    texLoader.load('/assets/polyhaven/models/moon_rock_02/textures/moon_rock_02_nor_gl_1k.jpg', (nor) => {
                        nor.flipY = false;
                        if (this.rubbleMaterial) {
                            this.rubbleMaterial.map = diff;
                            this.rubbleMaterial.normalMap = nor;
                            this.rubbleMaterial.needsUpdate = true;
                        }
                        this._hasPolyHavenRubbleTex = true;
                        this._lastTerrainSig = null;
                        resolveTex(true);
                    }, undefined, () => resolveTex(false));
                }, undefined, () => resolveTex(false));
            });
        }
    });

    // 3. Rock 07 (Photogrammetry Mountain Crag)
    addGltfTask('/assets/polyhaven/models/rock_07/rock_07.gltf', (gltf) => {
        const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!scene) return;
        const parts = [];
        scene.traverse((c) => {
            if (c.isMesh && c.geometry) {
                c.updateMatrixWorld(true);
                const g = c.geometry.clone();
                g.applyMatrix4(c.matrixWorld);
                if (g.attributes.color) g.deleteAttribute('color');
                const colArr = new Float32Array(g.attributes.position.count * 3);
                colArr.fill(1.0);
                g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
                parts.push(g);
            }
        });
        if (parts.length > 0) {
            const geo = this._mergeBufferGeometries(parts);
            geo.computeBoundingBox();
            const bbox = geo.boundingBox;
            const cx = (bbox.min.x + bbox.max.x) * 0.5;
            const cz = (bbox.min.z + bbox.max.z) * 0.5;
            const spanXZ = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) || 1.0;
            const spanY = (bbox.max.y - bbox.min.y) || 1.0;
            geo.translate(-cx, -bbox.min.y, -cz);
            geo.scale(2.15 / spanXZ, 3.80 / spanY, 2.15 / spanXZ);
            geo.computeVertexNormals();

            if (this.mountainMesh && this.mountainMesh.geometry) this.mountainMesh.geometry.dispose();
            if (this.mountainMesh) this.mountainMesh.geometry = geo;

            return new Promise((resolveTex) => {
                texLoader.load('/assets/polyhaven/models/rock_07/textures/rock_07_diff_1k.jpg', (diff) => {
                    diff.encoding = THREE.sRGBEncoding;
                    diff.flipY = false;
                    texLoader.load('/assets/polyhaven/models/rock_07/textures/rock_07_nor_gl_1k.jpg', (nor) => {
                        nor.flipY = false;
                        if (this.mountainMaterial) {
                            this.mountainMaterial.map = diff;
                            this.mountainMaterial.normalMap = nor;
                            this.mountainMaterial.needsUpdate = true;
                        }
                        this._hasPolyHavenMountainTex = true;
                        this._lastTerrainSig = null;
                        resolveTex(true);
                    }, undefined, () => resolveTex(false));
                }, undefined, () => resolveTex(false));
            });
        }
    });

    addGltfTask('/assets/models/items/Anvil_Log.gltf', (gltf) => {
        if (!gltf || !gltf.scene || !this.forgeMesh) return;
        gltf.scene.updateMatrixWorld(true);
        const geos = [];
        let firstMap = null;
        gltf.scene.traverse((c) => {
            if (c.isMesh && c.geometry) {
                const g = c.geometry.clone();
                g.applyMatrix4(c.matrixWorld);
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
    if (typeof this.ensurePbrSetReady === 'function') {
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
                        mClone._sharedMaterial = true;
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

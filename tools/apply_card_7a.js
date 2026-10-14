// tools/apply_card_7a.js
// Surgical script to apply Card 7A to server/public/js/dungeon3d.js
const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../server/public/js/dungeon3d.js');
let src = fs.readFileSync(targetPath, 'utf8');

function normalize(str) {
    return str.replace(/\r?\n/g, '\r\n');
}

function mustReplace(orig, replacement, label) {
    orig = normalize(orig);
    replacement = normalize(replacement);
    if (!src.includes(orig)) {
        console.error(`FAILED TO FIND original string for ${label}`);
        process.exit(1);
    }
    src = src.replace(orig, () => replacement);
    console.log(`[OK] Replaced ${label}`);
}

// -------------------------------------------------------------
// Section 1: Molten Lava & Cooled Basalt
// -------------------------------------------------------------

// 1.1 Add procCreateLavaTexture and procCreateLavaEmission right after procCreateMagmaEmission
const origMagmaEmission = `function procCreateMagmaEmission() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const vein = (procFractalNoise(x * 0.02, y * 0.02, 4, 77) - 0.5) * 2.0;
        if (Math.abs(vein) < 0.24) {
            const heat = 1.0 - Math.min(1, Math.abs(vein) / 0.24);
            return [0.96, 0.34 + heat * 0.40, 0.04 + heat * 0.12];
        }
        return [0, 0, 0];
    });
}`;

const newLavaTextures = `function procCreateMagmaEmission() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const vein = (procFractalNoise(x * 0.02, y * 0.02, 4, 77) - 0.5) * 2.0;
        if (Math.abs(vein) < 0.24) {
            const heat = 1.0 - Math.min(1, Math.abs(vein) / 0.24);
            return [0.96, 0.34 + heat * 0.40, 0.04 + heat * 0.12];
        }
        return [0, 0, 0];
    });
}

function procCreateLavaTexture() {
    const size = 256;
    return procCreateTexture(size, (x, y) => {
        const nx = x * 0.028;
        const ny = y * 0.028;
        const warpX = procFractalNoise(nx, ny, 3, 31) - 0.5;
        const warpY = procFractalNoise(nx + 5.2, ny + 1.3, 3, 47) - 0.5;
        const v = procFractalNoise(nx + warpX * 1.5, ny + warpY * 1.5, 4, 99);
        if (v > 0.42) {
            const heat = Math.min(1.0, (v - 0.42) / 0.38);
            const r = 1.0;
            const g = 0.30 + heat * 0.65;
            const b = 0.02 + heat * 0.60;
            return [r, g, b];
        } else {
            const crust = (procSmoothNoise(x * 0.08, y * 0.08, 12) - 0.5) * 0.06;
            return [0.14 + crust, 0.11 + crust * 0.8, 0.10 + crust * 0.7];
        }
    }, true);
}

function procCreateLavaEmission() {
    const size = 256;
    return procCreateTexture(size, (x, y) => {
        const nx = x * 0.028;
        const ny = y * 0.028;
        const warpX = procFractalNoise(nx, ny, 3, 31) - 0.5;
        const warpY = procFractalNoise(nx + 5.2, ny + 1.3, 3, 47) - 0.5;
        const v = procFractalNoise(nx + warpX * 1.5, ny + warpY * 1.5, 4, 99);
        if (v > 0.42) {
            const heat = Math.min(1.0, (v - 0.42) / 0.38);
            return [1.0, 0.28 + heat * 0.68, 0.03 + heat * 0.48];
        }
        if (v > 0.37) {
            const fissure = (v - 0.37) / 0.05;
            return [fissure * 0.60, fissure * 0.15, 0.0];
        }
        return [0, 0, 0];
    }, true);
}`;
mustReplace(origMagmaEmission, newLavaTextures, '1.1 procCreateLavaTexture and procCreateLavaEmission');

// 1.2 In initTextures initialize this.lavaTex & this.lavaEmission
const origInitMagma = `        this.magmaTex = procCreateMagmaTexture();
        this.magmaEmission = procCreateMagmaEmission();`;
const newInitMagma = `        this.magmaTex = procCreateMagmaTexture();
        this.magmaEmission = procCreateMagmaEmission();
        this.lavaTex = procCreateLavaTexture();
        this.lavaEmission = procCreateLavaEmission();`;
mustReplace(origInitMagma, newInitMagma, '1.2 initTextures lavaTex and lavaEmission');

// 1.3 Update this.lavaMaterial and this.lavaCooledMaterial
const origLavaMats = `        // In-View Molten Lava
        this.lavaMaterial = new THREE.MeshStandardMaterial({
            color: 0xff3300,
            emissive: 0xff4400,
            emissiveIntensity: 2.2,
            roughness: 0.35,
            metalness: 0.10,
            side: THREE.DoubleSide
        });

        // Cooled Basalt (Memory/Fog-of-War Lava)
        this.lavaCooledMaterial = new THREE.MeshStandardMaterial({
            color: 0x141210,
            roughness: 0.95,
            metalness: 0.0,
            side: THREE.DoubleSide
        });`;

const newLavaMats = `        // In-View Molten Lava
        this.lavaMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.lavaTex,
            emissive: new THREE.Color(0xff5500),
            emissiveMap: this.lavaEmission,
            emissiveIntensity: 2.35,
            normalMap: this.permWallNormal,
            normalScale: new THREE.Vector2(1.45, 1.45),
            roughness: 0.28,
            metalness: 0.12,
            side: THREE.DoubleSide
        });

        // Cooled Basalt (Memory/Fog-of-War Lava)
        this.lavaCooledMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a322d,
            map: this.permWallTex,
            emissive: new THREE.Color(0xff3300),
            emissiveMap: this.lavaEmission,
            emissiveIntensity: 0.35,
            normalMap: this.permWallNormal,
            normalScale: new THREE.Vector2(1.35, 1.35),
            roughness: 0.88,
            metalness: 0.08,
            side: THREE.DoubleSide
        });`;
mustReplace(origLavaMats, newLavaMats, '1.3 lavaMaterial and lavaCooledMaterial');

// 1.4 Preload rock_boulder_cracked and guard bark_willow_02
const origWillow = `        this.loadPolyHavenSet('brown_mud_rocks_01', 1, 1, (e) => {
            bindMatToPolyHaven(this.dirtMaterial, e, 1.40);
            bindMatToPolyHaven(this.swampMaterial, e, 1.25);
        });
        this.loadPolyHavenSet('bark_willow_02', 1, 2, (e) => {
            bindMatToPolyHaven(this.treeTrunkMaterial, e, 1.55);
            bindMatToPolyHaven(this.doorMaterial, e, 1.20);
        });`;

const newWillow = `        this.loadPolyHavenSet('brown_mud_rocks_01', 1, 1, (e) => {
            bindMatToPolyHaven(this.dirtMaterial, e, 1.40);
            bindMatToPolyHaven(this.swampMaterial, e, 1.25);
        });
        this.loadPolyHavenSet('rock_boulder_cracked', 1, 1, (e) => {
            if (e.nor && this.lavaMaterial) {
                this.lavaMaterial.normalMap = e.nor;
                this.lavaMaterial.normalScale.set(1.50, 1.50);
                this.lavaMaterial.needsUpdate = true;
            }
            bindMatToPolyHaven(this.lavaCooledMaterial, e, 1.45);
        });
        this.loadPolyHavenSet('bark_willow_02', 1, 2, (e) => {
            if (!this._hasPolyHavenTreeTex) {
                bindMatToPolyHaven(this.treeTrunkMaterial, e, 1.55);
            }
            bindMatToPolyHaven(this.doorMaterial, e, 1.20);
        });`;
mustReplace(origWillow, newWillow, '1.4 rock_boulder_cracked and bark_willow_02 guard');

// 1.5 Animate scrolling
const origAnimateLava = `        // In-view molten lava surface breathing pulse & dynamic procedural water UV scrolling
        if (this.lavaMaterial && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.surfaceBreathing)) {
            this.lavaMaterial.emissiveIntensity = 2.2 + Math.sin(tNow * 0.0028) * 0.28;
        }
        if (this.waterTex) {
            this.waterTex.offset.x = (this.waterTex.offset.x + delta * 0.035) % 1.0;
            this.waterTex.offset.y = (this.waterTex.offset.y + delta * 0.025) % 1.0;
        }
        if (this.deepWaterTex) {
            this.deepWaterTex.offset.x = (this.deepWaterTex.offset.x + delta * 0.020) % 1.0;
            this.deepWaterTex.offset.y = (this.deepWaterTex.offset.y - delta * 0.015) % 1.0;
        }`;

const newAnimateLava = `        // In-view molten lava surface breathing pulse & dynamic procedural water UV scrolling
        if (this.lavaMaterial && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.surfaceBreathing)) {
            this.lavaMaterial.emissiveIntensity = 2.35 + Math.sin(tNow * 0.0028) * 0.28;
        }
        if (this.lavaTex) {
            this.lavaTex.offset.x = (this.lavaTex.offset.x + delta * 0.018) % 1.0;
            this.lavaTex.offset.y = (this.lavaTex.offset.y + delta * 0.012) % 1.0;
            if (this.lavaEmission) {
                this.lavaEmission.offset.x = this.lavaTex.offset.x;
                this.lavaEmission.offset.y = this.lavaTex.offset.y;
            }
        }
        if (this.waterTex) {
            this.waterTex.offset.x = (this.waterTex.offset.x + delta * 0.035) % 1.0;
            this.waterTex.offset.y = (this.waterTex.offset.y + delta * 0.025) % 1.0;
        }
        if (this.deepWaterTex) {
            this.deepWaterTex.offset.x = (this.deepWaterTex.offset.x + delta * 0.020) % 1.0;
            this.deepWaterTex.offset.y = (this.deepWaterTex.offset.y - delta * 0.015) % 1.0;
        }`;
mustReplace(origAnimateLava, newAnimateLava, '1.5 animate lava offset scrolling');

// -------------------------------------------------------------
// Section 2: Poly Haven Photogrammetry 3D Trees, Bushes, Boulders, Mountains
// -------------------------------------------------------------

// 2.1 Character palettes & models tagging with _sharedGeometry / _sharedMaterial / _sharedTexture
const origLoadPalette = `        const loadPalette = (key, url) => {
            texLoader.load(url, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                this.characterPalettes.set(key, tex);
            }, undefined, () => {});
        };`;

const newLoadPalette = `        const loadPalette = (key, url) => {
            texLoader.load(url, (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex._sharedTexture = true;
                this.characterPalettes.set(key, tex);
                if (this.upgradeAllMonsterEntities) this.upgradeAllMonsterEntities();
            }, undefined, () => {});
        };`;
mustReplace(origLoadPalette, newLoadPalette, '2.1 loadPalette _sharedTexture tag');

const origLoadCharModels = `            characterModels.forEach(m => {
                this.gltfLoader.load(m.url, (gltf) => {
                    const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                    if (scene) {
                        scene.traverse((c) => {
                            if (c.isMesh) {
                                c.castShadow = true;
                                c.receiveShadow = true;
                                if (c.geometry) {
                                    c.geometry.computeVertexNormals();
                                }
                            }
                        });
                        this.monsterTemplates.set(m.key, {
                            scene: scene,
                            defaultScale: m.defaultScale
                        });
                    }
                }, undefined, (err) => {`;

const newLoadCharModels = `            characterModels.forEach(m => {
                this.gltfLoader.load(m.url, (gltf) => {
                    const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                    if (scene) {
                        scene.traverse((c) => {
                            if (c.isMesh) {
                                c.castShadow = true;
                                c.receiveShadow = true;
                                if (c.geometry) {
                                    c.geometry.computeVertexNormals();
                                    c.geometry._sharedGeometry = true;
                                }
                                if (c.material) {
                                    c.material._sharedMaterial = true;
                                    if (c.material.map) c.material.map._sharedTexture = true;
                                }
                            }
                        });
                        this.monsterTemplates.set(m.key, {
                            scene: scene,
                            defaultScale: m.defaultScale
                        });
                        if (this.upgradeAllMonsterEntities) this.upgradeAllMonsterEntities();
                    }
                }, undefined, (err) => {`;
mustReplace(origLoadCharModels, newLoadCharModels, '2.1 characterModels _shared tags');

// 2.2 Add addIndexedVertexAO and load pachira_aquatica_01, moon_rock_02, rock_07 after this._loadCachedGltf = loadCachedGltf;
const origGltfCacheEnd = `            this._loadCachedGltf = loadCachedGltf;
        }`;

const newGltfCacheEnd = `            this._loadCachedGltf = loadCachedGltf;

            const addIndexedVertexAO = (geo, minLight = 0.76) => {
                if (!geo || !geo.attributes.position) return;
                geo.computeBoundingBox();
                const bb = geo.boundingBox;
                const minY = bb.min.y;
                const height = Math.max(0.001, bb.max.y - minY);
                const pos = geo.attributes.position;
                const colors = new Float32Array(pos.count * 3);
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    const normY = Math.max(0, Math.min(1, (y - minY) / height));
                    const ao = minLight + (1.0 - minLight) * normY;
                    colors[i * 3] = ao;
                    colors[i * 3 + 1] = ao;
                    colors[i * 3 + 2] = ao;
                }
                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            };

            // Poly Haven Photogrammetry Pachira Tree & Foliage Bush
            loadCachedGltf('/assets/polyhaven/models/pachira_aquatica_01/pachira_aquatica_01.gltf', (gltf) => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) return;
                let rawBarkMesh = null;
                let rawLeavesMesh = null;
                let rawBushMesh = null;

                scene.traverse((c) => {
                    if (c.isMesh && c.geometry) {
                        const n = (c.name || '').toLowerCase();
                        if (n.includes('bark_c') || c.name === 'Circle.001') {
                            rawBarkMesh = c;
                        } else if (n.includes('leaves_c') || c.name === 'Cylinder.092') {
                            rawLeavesMesh = c;
                        } else if (n.includes('leaves_b') || c.name === 'Cylinder.118') {
                            rawBushMesh = c;
                        }
                    }
                });

                if (rawBarkMesh && rawLeavesMesh) {
                    const barkGeo = rawBarkMesh.geometry.clone();
                    const leavesGeo = rawLeavesMesh.geometry.clone();
                    barkGeo._sharedGeometry = true;
                    leavesGeo._sharedGeometry = true;

                    barkGeo.computeBoundingBox();
                    leavesGeo.computeBoundingBox();
                    const unionBox = new THREE.Box3();
                    unionBox.union(barkGeo.boundingBox);
                    unionBox.union(leavesGeo.boundingBox);

                    const cx = (unionBox.min.x + unionBox.max.x) * 0.5;
                    const cz = (unionBox.min.z + unionBox.max.z) * 0.5;
                    const minY = unionBox.min.y;
                    const spanX = unionBox.max.x - unionBox.min.x;
                    const spanZ = unionBox.max.z - unionBox.min.z;
                    const maxSpan = Math.max(spanX, spanZ) || 1.0;
                    const height = (unionBox.max.y - minY) || 1.0;

                    const sx = 2.35 / maxSpan;
                    const sz = 2.35 / maxSpan;
                    const sy = 2.85 / height;

                    barkGeo.translate(-cx, -minY, -cz);
                    barkGeo.scale(sx, sy, sz);
                    barkGeo.computeVertexNormals();
                    addIndexedVertexAO(barkGeo, 0.76);

                    leavesGeo.translate(-cx, -minY, -cz);
                    leavesGeo.scale(sx, sy, sz);
                    leavesGeo.computeVertexNormals();
                    addIndexedVertexAO(leavesGeo, 0.82);

                    if (this.treeTrunkMesh) this.treeTrunkMesh.geometry = barkGeo;
                    if (this.treeLeavesMesh) this.treeLeavesMesh.geometry = leavesGeo;
                }

                if (rawBushMesh) {
                    const bushGeo = rawBushMesh.geometry.clone();
                    bushGeo._sharedGeometry = true;
                    bushGeo.computeBoundingBox();
                    const bb = bushGeo.boundingBox;
                    const cx = (bb.min.x + bb.max.x) * 0.5;
                    const cz = (bb.min.z + bb.max.z) * 0.5;
                    const minY = bb.min.y;
                    const span = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1.0;
                    const height = (bb.max.y - minY) || 1.0;

                    bushGeo.translate(-cx, -minY, -cz);
                    bushGeo.scale(1.28 / span, 0.82 / height, 1.28 / span);
                    bushGeo.computeVertexNormals();
                    addIndexedVertexAO(bushGeo, 0.78);

                    if (this.bushMesh) this.bushMesh.geometry = bushGeo;
                }

                const texLoader = new THREE.TextureLoader();
                texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_diff_1k.jpg', (diff) => {
                    diff.flipY = false;
                    diff.encoding = THREE.sRGBEncoding;
                    diff._sharedTexture = true;
                    if (this.treeMaterial) {
                        this.treeMaterial.map = diff;
                        this.treeMaterial.side = THREE.DoubleSide;
                        this.treeMaterial.roughness = 0.62;
                        this.treeMaterial.needsUpdate = true;
                        this._hasPolyHavenTreeTex = true;
                        this._lastTerrainSig = null;
                    }
                });
                texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_nor_gl_1k.jpg', (nor) => {
                    nor.flipY = false;
                    nor._sharedTexture = true;
                    if (this.treeMaterial) {
                        this.treeMaterial.normalMap = nor;
                        this.treeMaterial.normalScale.set(1.4, 1.4);
                        this.treeMaterial.needsUpdate = true;
                    }
                });
                texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_bark_diff_1k.jpg', (diff) => {
                    diff.flipY = false;
                    diff.encoding = THREE.sRGBEncoding;
                    diff._sharedTexture = true;
                    if (this.treeTrunkMaterial) {
                        this.treeTrunkMaterial.map = diff;
                        this.treeTrunkMaterial.needsUpdate = true;
                    }
                });
                texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_bark_nor_gl_1k.jpg', (nor) => {
                    nor.flipY = false;
                    nor._sharedTexture = true;
                    if (this.treeTrunkMaterial) {
                        this.treeTrunkMaterial.normalMap = nor;
                        this.treeTrunkMaterial.normalScale.set(1.5, 1.5);
                        this.treeTrunkMaterial.needsUpdate = true;
                    }
                });
            });

            // Poly Haven Photogrammetry Rubble Boulders (moon_rock_02)
            loadCachedGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf', (gltf) => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) return;
                scene.traverse((c) => {
                    if (c.isMesh && c.geometry && !this._rubbleGeoLoaded) {
                        this._rubbleGeoLoaded = true;
                        const geo = c.geometry.clone();
                        geo._sharedGeometry = true;
                        geo.computeBoundingBox();
                        const bb = geo.boundingBox;
                        const cx = (bb.min.x + bb.max.x) * 0.5;
                        const cz = (bb.min.z + bb.max.z) * 0.5;
                        const minY = bb.min.y;
                        const span = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1.0;
                        const height = (bb.max.y - minY) || 1.0;

                        geo.translate(-cx, -minY, -cz);
                        geo.scale(1.42 / span, 1.08 / height, 1.42 / span);
                        geo.computeVertexNormals();
                        addIndexedVertexAO(geo, 0.72);

                        if (this.rubbleMesh) this.rubbleMesh.geometry = geo;

                        if (!this.rubbleMaterial) {
                            this.rubbleMaterial = this.wallMaterial.clone();
                            this.rubbleMaterial._sharedMaterial = true;
                            if (this.rubbleMesh) this.rubbleMesh.material = this.rubbleMaterial;
                        }

                        const texLoader = new THREE.TextureLoader();
                        texLoader.load('/assets/polyhaven/models/moon_rock_02/textures/moon_rock_02_diff_1k.jpg', (diff) => {
                            diff.flipY = false;
                            diff.encoding = THREE.sRGBEncoding;
                            diff._sharedTexture = true;
                            if (this.rubbleMaterial) {
                                this.rubbleMaterial.map = diff;
                                this.rubbleMaterial.needsUpdate = true;
                                this._lastTerrainSig = null;
                            }
                        });
                        texLoader.load('/assets/polyhaven/models/moon_rock_02/textures/moon_rock_02_nor_gl_1k.jpg', (nor) => {
                            nor.flipY = false;
                            nor._sharedTexture = true;
                            if (this.rubbleMaterial) {
                                this.rubbleMaterial.normalMap = nor;
                                this.rubbleMaterial.normalScale.set(1.4, 1.4);
                                this.rubbleMaterial.needsUpdate = true;
                            }
                        });
                    }
                });
            });

            // Poly Haven Photogrammetry Mountain Crags (rock_07)
            loadCachedGltf('/assets/polyhaven/models/rock_07/rock_07.gltf', (gltf) => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) return;
                scene.traverse((c) => {
                    if (c.isMesh && c.geometry && !this._mountainGeoLoaded) {
                        this._mountainGeoLoaded = true;
                        const geo = c.geometry.clone();
                        geo._sharedGeometry = true;
                        geo.computeBoundingBox();
                        const bb = geo.boundingBox;
                        const cx = (bb.min.x + bb.max.x) * 0.5;
                        const cz = (bb.min.z + bb.max.z) * 0.5;
                        const minY = bb.min.y;
                        const span = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1.0;
                        const height = (bb.max.y - minY) || 1.0;

                        geo.translate(-cx, -minY, -cz);
                        geo.scale(2.15 / span, 3.80 / height, 2.15 / span);
                        geo.computeVertexNormals();
                        addIndexedVertexAO(geo, 0.70);

                        if (this.mountainMesh) this.mountainMesh.geometry = geo;

                        const texLoader = new THREE.TextureLoader();
                        texLoader.load('/assets/polyhaven/models/rock_07/textures/rock_07_diff_1k.jpg', (diff) => {
                            diff.flipY = false;
                            diff.encoding = THREE.sRGBEncoding;
                            diff._sharedTexture = true;
                            if (this.mountainMaterial) {
                                this.mountainMaterial.map = diff;
                                this.mountainMaterial.needsUpdate = true;
                                this._lastTerrainSig = null;
                            }
                        });
                        texLoader.load('/assets/polyhaven/models/rock_07/textures/rock_07_nor_gl_1k.jpg', (nor) => {
                            nor.flipY = false;
                            nor._sharedTexture = true;
                            if (this.mountainMaterial) {
                                this.mountainMaterial.normalMap = nor;
                                this.mountainMaterial.normalScale.set(1.5, 1.5);
                                this.mountainMaterial.needsUpdate = true;
                            }
                        });
                    }
                });
            });
        }`;
mustReplace(origGltfCacheEnd, newGltfCacheEnd, '2.2 addIndexedVertexAO and pachira/moon_rock/rock_07');

// 2.3 updateDungeon tree & bush canopyShade with natural tint
const origTreeShades = `                        const trunkBase = (this.realm === 'silq')
                            ? this._scratchTrunkBaseColor.setRGB(0.65, 0.62, 0.58)
                            : this._scratchTrunkBaseColor.setRGB(1.0, 0.95, 0.90);
                        const trunkShade = this.computeTileShade(this._scratchTreeTrunkColor, trunkBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.treeTrunkMesh.setMatrixAt(treeCount, this.dummy.matrix);
                        this.treeTrunkMesh.setColorAt(treeCount, trunkShade);

                        const canopyShade = this.computeTileShade(this._scratchTreeColor, this.getBaseColour(25, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.treeLeavesMesh.setMatrixAt(treeCount, this.dummy.matrix);
                        this.treeLeavesMesh.setColorAt(treeCount, canopyShade);
                        treeCount++;
                    }
                    // Tree canopy reaches into open sky: NO ceiling!
                    continue;
                }

                // Dense Brush / Thicket / Flowers (feat 42: BUSH / BRAKE) - Low organic foliage cluster
                if (feat === 42) {
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        this.grassMesh.setColorAt(grassCount, grassShade);
                        grassCount++;
                    }
                    if (bushCount < this.maxInstances) {
                        this.dummy.position.set(wx, 0, wz);
                        const bushYaw = ((x * 43 + y * 71) % 8) * (Math.PI / 4);
                        this.dummy.rotation.set(0, bushYaw, 0);
                        this.dummy.updateMatrix();
                        const bushShade = this.computeTileShade(this._scratchTreeColor, this.getBaseColour(42, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                        this.bushMesh.setColorAt(bushCount, bushShade);
                        bushCount++;
                    }`;

const newTreeShades = `                        const trunkBase = (this.realm === 'silq')
                            ? this._scratchTrunkBaseColor.setRGB(0.65, 0.62, 0.58)
                            : this._scratchTrunkBaseColor.setRGB(1.0, 0.95, 0.90);
                        const trunkShade = this.computeTileShade(this._scratchTreeTrunkColor, trunkBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.treeTrunkMesh.setMatrixAt(treeCount, this.dummy.matrix);
                        this.treeTrunkMesh.setColorAt(treeCount, trunkShade);

                        const leafBase = this._hasPolyHavenTreeTex
                            ? (this.realm === 'hengband' && ((x + y) % 3 === 0) ? this._scratchTrunkBaseColor.setRGB(1.0, 0.86, 0.92) : this._scratchTrunkBaseColor.setRGB(0.94, 1.0, 0.92))
                            : this.getBaseColour(25, biome);
                        const canopyShade = this.computeTileShade(this._scratchTreeColor, leafBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.treeLeavesMesh.setMatrixAt(treeCount, this.dummy.matrix);
                        this.treeLeavesMesh.setColorAt(treeCount, canopyShade);
                        treeCount++;
                    }
                    // Tree canopy reaches into open sky: NO ceiling!
                    continue;
                }

                // Dense Brush / Thicket / Flowers (feat 42: BUSH / BRAKE) - Low organic foliage cluster
                if (feat === 42) {
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        this.grassMesh.setColorAt(grassCount, grassShade);
                        grassCount++;
                    }
                    if (bushCount < this.maxInstances) {
                        this.dummy.position.set(wx, 0, wz);
                        const bushYaw = ((x * 43 + y * 71) % 8) * (Math.PI / 4);
                        this.dummy.rotation.set(0, bushYaw, 0);
                        this.dummy.updateMatrix();
                        const bushLeafBase = this._hasPolyHavenTreeTex
                            ? this._scratchTrunkBaseColor.setRGB(0.94, 1.0, 0.92)
                            : this.getBaseColour(42, biome);
                        const bushShade = this.computeTileShade(this._scratchTreeColor, bushLeafBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                        this.bushMesh.setColorAt(bushCount, bushShade);
                        bushCount++;
                    }`;
mustReplace(origTreeShades, newTreeShades, '2.3 updateDungeon tree and bush natural shades');

// -------------------------------------------------------------
// Section 3: Real 3D Characters/Monsters First + Armed Hands + Billboards
// -------------------------------------------------------------

// 3.1 loadMonster center X/Z, ground min.y, tags & upgradeAllMonsterEntities
const origLoadMonster = `        const loadMonster = (key, url, mat, scale, yOffset = 0) => {
            this.objLoader.load(url, (obj) => {
                obj.traverse((c) => {
                    if (c.isMesh) {
                        c.material = mat.clone();
                        if (c.geometry) {
                            c.geometry.computeVertexNormals();
                        }
                    }
                });
                obj.scale.set(scale, scale, scale);
                obj.position.y = yOffset;
                this.monsterTemplates.set(key, obj);
            }, undefined, () => {});
        };`;

const newLoadMonster = `        const loadMonster = (key, url, mat, scale, yOffset = 0) => {
            mat._sharedMaterial = true;
            this.objLoader.load(url, (obj) => {
                const unionBox = new THREE.Box3();
                obj.traverse((c) => {
                    if (c.isMesh && c.geometry) {
                        c.geometry.computeBoundingBox();
                        unionBox.union(c.geometry.boundingBox);
                    }
                });
                const cx = (unionBox.min.x + unionBox.max.x) * 0.5;
                const cz = (unionBox.min.z + unionBox.max.z) * 0.5;
                const minY = unionBox.min.y;

                obj.traverse((c) => {
                    if (c.isMesh) {
                        const m = mat.clone();
                        m._sharedMaterial = true;
                        c.material = m;
                        if (c.geometry) {
                            c.geometry.translate(-cx, -minY, -cz);
                            c.geometry.computeVertexNormals();
                            c.geometry._sharedGeometry = true;
                        }
                    }
                });
                obj.scale.set(scale, scale, scale);
                obj.position.y = yOffset;
                this.monsterTemplates.set(key, obj);
                if (this.upgradeAllMonsterEntities) this.upgradeAllMonsterEntities();
            }, undefined, () => {});
        };`;
mustReplace(origLoadMonster, newLoadMonster, '3.1 loadMonster center & ground');

// 3.2 _ensurePolyHavenWeaponLoaded shared tags & upgradeAllMonsterEntities
const origEnsureWeapon = `                this.weaponCache.set(key, wrapper);

                if (this.lastFrame && this.lastFrame.player) {`;

const newEnsureWeapon = `                this.weaponCache.set(key, wrapper);
                wrapper.traverse((c) => {
                    if (c.isMesh) {
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        if (c.material) {
                            c.material._sharedMaterial = true;
                            if (c.material.map) c.material.map._sharedTexture = true;
                        }
                    }
                });
                if (this.upgradeAllMonsterEntities) this.upgradeAllMonsterEntities();

                if (this.lastFrame && this.lastFrame.player) {`;
mustReplace(origEnsureWeapon, newEnsureWeapon, '3.2 _ensurePolyHavenWeaponLoaded shared tags');

// 3.3 configureCreatureEquipment weapons lookup with itemTemplates fallback
const origAttach = `        const attach = (handNode, weaponKey, scale = 0.05, rot = null, pos = null) => {
            if (!handNode || !this.weaponCache || !this.weaponCache.has(weaponKey)) return;
            const tmpl = this.weaponCache.get(weaponKey);
            const wClone = tmpl.clone(true);
            wClone.scale.set(scale, scale, scale);
            if (pos) wClone.position.set(pos.x, pos.y, pos.z);
            if (rot) wClone.rotation.set(rot.x, rot.y, rot.z);
            handNode.add(wClone);
        };`;

const newAttach = `        const attach = (handNode, weaponKey, scale = 0.05, rot = null, pos = null) => {
            if (!handNode) return;
            if (this._ensurePolyHavenWeaponLoaded) this._ensurePolyHavenWeaponLoaded(weaponKey);
            let tmpl = null;
            if (this.weaponCache && this.weaponCache.has(weaponKey)) {
                tmpl = this.weaponCache.get(weaponKey);
            } else if (this.itemTemplates) {
                const fallbackMap = {
                    sword: ')',
                    shield: 'shield_heater',
                    axe: 'axe',
                    dagger: 'dagger',
                    bow: '}',
                    spear: 'spear',
                    claymore: 'claymore'
                };
                const fbKey = fallbackMap[weaponKey];
                if (fbKey && this.itemTemplates.has(fbKey)) {
                    tmpl = this.itemTemplates.get(fbKey);
                }
            }
            if (!tmpl) return;
            const wClone = tmpl.clone(true);
            wClone.scale.set(scale, scale, scale);
            if (pos) wClone.position.set(pos.x, pos.y, pos.z);
            if (rot) wClone.rotation.set(rot.x, rot.y, rot.z);
            handNode.add(wClone);
        };`;
mustReplace(origAttach, newAttach, '3.3 configureCreatureEquipment attach');

// 3.4 monsterBillboardMat roughness: 0.58, normalScale: 0.45, 0.45
const origMonsterBillboardMat = `        // Shared PBR Material for all monster billboards (Z-buffer depth tested, dynamic torchlight specular relief)
        this.monsterBillboardMat = new THREE.MeshStandardMaterial({
            roughness: 0.82,
            metalness: 0.10,
            alphaTest: 0.35,
            alphaToCoverage: true,
            vertexColors: true,
            normalScale: new THREE.Vector2(0.75, 0.75),
            depthWrite: true,
            transparent: false,
            side: THREE.DoubleSide
        });`;

const newMonsterBillboardMat = `        // Shared PBR Material for all monster billboards (Z-buffer depth tested, dynamic torchlight specular relief)
        this.monsterBillboardMat = new THREE.MeshStandardMaterial({
            roughness: 0.58,
            metalness: 0.10,
            alphaTest: 0.35,
            alphaToCoverage: true,
            vertexColors: true,
            normalScale: new THREE.Vector2(0.45, 0.45),
            depthWrite: true,
            transparent: false,
            side: THREE.DoubleSide
        });
        this.monsterBillboardMat._sharedMaterial = true;`;
mustReplace(origMonsterBillboardMat, newMonsterBillboardMat, '3.4 monsterBillboardMat');

// 3.5 createMonsterBillboardMesh gentle normals and bright AO
const origBillboardNormals = `            const nx = (gu - 0.5) * 1.15;
            const ny = (gv - 0.35) * 0.55;
            const nz = 1.0;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normAttr.setXYZ(i, nx / len, ny / len, nz / len);

            const ao = 0.78 + 0.22 * Math.min(1.0, gv * 1.35);`;

const newBillboardNormals = `            const nx = (gu - 0.5) * 0.45;
            const ny = (gv - 0.35) * 0.25;
            const nz = 1.0;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normAttr.setXYZ(i, nx / len, ny / len, nz / len);

            const ao = 0.92 + 0.08 * Math.min(1.0, gv * 1.35);`;
mustReplace(origBillboardNormals, newBillboardNormals, '3.5 createMonsterBillboardMesh normals & AO');

// 3.6 createMonster3DEntity 3D models FIRST, billboards SECOND, no procedural
const origCreateMonster = `        // 1. Primary: High-Fidelity Shockbolt 2.5D PBR Billboards with Normal Mapping (Canonical Daggerfall / Dungeon Master Style)
        if (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic') {
            const atlasEntry = this.resolveMonsterAtlasEntry(m.race || m.name, glyph);
            if (atlasEntry) {
                mesh = this.createMonsterBillboardMesh(atlasEntry);
                if (mesh) {
                    modelHeight = mesh.baseHeight || Math.min(2.05, atlasEntry.height || 1.70);
                    isFloating = atlasEntry.isFloating || false;
                }
            }
        }

        // 2. Fallback: 3D Low-Poly Character & Monster Templates (KayKit / CC0 GLTF & OBJ Models)
        if (!mesh && config && this.monsterTemplates && this.monsterTemplates.has(config.templateKey)) {
            const tmplData = this.monsterTemplates.get(config.templateKey);
            const srcObj = tmplData.scene || tmplData;
            mesh = this.cloneModelHierarchy(srcObj);

            const s = config.scale || (tmplData.defaultScale || 1.0);
            mesh.scale.set(s, s, s);

            isFloating = config.isFloating;
            if (isFloating) mesh.position.y = 0.35;

            // Compute true physical height from geometry bounding box
            mesh.updateMatrixWorld(true);
            const bbox = new THREE.Box3().setFromObject(mesh);
            if (isFinite(bbox.max.y) && bbox.max.y > 0) {
                modelHeight = bbox.max.y;
            } else if (config.templateKey === 'rat') modelHeight = 0.95;
            else if (config.templateKey === 'snake' || config.templateKey === 'snake_angry') modelHeight = 1.20;
            else if (config.templateKey === 'spider') modelHeight = 1.00;
            else if (config.templateKey === 'frog') modelHeight = 0.65;
            else if (config.templateKey === 'wasp') modelHeight = 1.35;
            else if (config.templateKey === 'imp' || config.templateKey === 'puglin') modelHeight = 1.35;
            else if (config.templateKey === 'king' || config.templateKey === 'punk') modelHeight = 2.05;
            else modelHeight = 1.85;

            // Materials & tinting (Exact 1:1 Parity with Godot MonsterModelResolver.cs:3189-3406)
            this.applyCharacterSkinAndTint(mesh, glyph, m.race || m.name, colorHex, config.templateKey, config.isEthereal);

            // Role-accurate equipment slots
            this.configureCreatureEquipment(mesh, config.role);
        }

        let isBillboardFallback = false;
        // 3. Procedural anatomical creature fallback for unmapped non-humanoids (eyes, worms, slimes, mushrooms, etc.)
        if (!mesh) {
            isBillboardFallback = true;
            mesh = this.createProceduralCreatureMesh(glyph, m.race || m.name, colorHex);
            if (glyph === 'b' || glyph === 'B' || glyph === 'e' || glyph === 'W' || glyph === 'G' || glyph === 'I' || race.includes('wasp') || race.includes('eye') || race.includes('bat') || race.includes('ghost') || race.includes('wraith')) {
                isFloating = true;
                modelHeight = 1.10;
            } else if (glyph === 'm' || glyph === ',' || glyph === 'r' || glyph === 's' || glyph === 'c' || glyph === 'w') {
                modelHeight = 0.55;
            } else if (glyph === 'd' || glyph === 'D' || glyph === 'P' || glyph === 'T' || glyph === 'O' || glyph === 'u' || glyph === 'U') {
                modelHeight = 1.65;
            } else if (glyph === 'S' || glyph === 'f' || glyph === 'C' || glyph === 'Z' || glyph === 'R') {
                modelHeight = 0.75;
            } else if (glyph === 'q' || glyph === 'Q' || race.includes('horse') || race.includes('steed') || race.includes('pony') || race.includes('unicorn') || race.includes('pegasus') || race.includes('馬')) {
                modelHeight = 1.15;
            }
        }`;

const newCreateMonster = `        let isReal3DModel = false;
        let isBillboard = false;
        let isBillboardFallback = false;

        // 1. Check Real 3D Low-Poly Character & Monster Templates FIRST (KayKit / CC0 GLTF & OBJ Models)
        if (config && this.monsterTemplates && this.monsterTemplates.has(config.templateKey)) {
            const tmplData = this.monsterTemplates.get(config.templateKey);
            const srcObj = tmplData.scene || tmplData;
            mesh = this.cloneModelHierarchy(srcObj);

            const s = config.scale || (tmplData.defaultScale || 1.0);
            mesh.scale.set(s, s, s);

            isFloating = config.isFloating;
            if (isFloating) mesh.position.y = 0.35;

            // Compute true physical height from geometry bounding box
            mesh.updateMatrixWorld(true);
            const bbox = new THREE.Box3().setFromObject(mesh);
            if (isFinite(bbox.max.y) && bbox.max.y > 0) {
                modelHeight = bbox.max.y;
            } else if (config.templateKey === 'rat') modelHeight = 0.95;
            else if (config.templateKey === 'snake' || config.templateKey === 'snake_angry') modelHeight = 1.20;
            else if (config.templateKey === 'spider') modelHeight = 1.00;
            else if (config.templateKey === 'frog') modelHeight = 0.65;
            else if (config.templateKey === 'wasp') modelHeight = 1.35;
            else if (config.templateKey === 'imp' || config.templateKey === 'puglin') modelHeight = 1.35;
            else if (config.templateKey === 'king' || config.templateKey === 'punk') modelHeight = 2.05;
            else modelHeight = 1.85;

            // Materials & tinting (Exact 1:1 Parity with Godot MonsterModelResolver.cs:3189-3406)
            this.applyCharacterSkinAndTint(mesh, glyph, m.race || m.name, colorHex, config.templateKey, config.isEthereal);

            // Role-accurate equipment slots
            this.configureCreatureEquipment(mesh, config.role);
            isReal3DModel = true;
        }

        // 2. High-Fidelity Shockbolt 2.5D PBR Billboards SECOND
        if (!mesh && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic')) {
            const atlasEntry = this.resolveMonsterAtlasEntry(m.race || m.name, glyph);
            if (atlasEntry) {
                mesh = this.createMonsterBillboardMesh(atlasEntry);
                if (mesh) {
                    modelHeight = mesh.baseHeight || Math.min(2.05, atlasEntry.height || 1.70);
                    isFloating = atlasEntry.isFloating || false;
                    isBillboard = true;
                }
            }
        }

        // 3. Fallback temporary billboard quad while templates or atlas are still loading (NEVER procedural shapes)
        if (!mesh) {
            isBillboardFallback = true;
            const tempGeo = new THREE.PlaneGeometry(1, 1);
            tempGeo.translate(0, 0.5, 0);
            mesh = new THREE.Mesh(tempGeo, this.monsterBillboardMat);
            modelHeight = 1.25;
            isBillboard = true;
        }`;
mustReplace(origCreateMonster, newCreateMonster, '3.6 createMonster3DEntity ordering');

// 3.7 createMonster3DEntity root properties assignment
const origRootProps = `        root.isBillboard = (mesh && mesh.geometry && mesh.geometry.type === 'PlaneGeometry');
        root.isFallback = !root.isBillboard && (!config || !this.monsterTemplates || !this.monsterTemplates.has(config.templateKey));
        root.isBillboardFallback = !root.isBillboard && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic');`;

const newRootProps = `        root.isReal3DModel = isReal3DModel;
        root.isBillboard = isBillboard && !isReal3DModel;
        root.isFallback = !isReal3DModel && !root.isBillboard;
        root.isBillboardFallback = isBillboardFallback;`;
mustReplace(origRootProps, newRootProps, '3.7 createMonster3DEntity root properties');

// 3.8 updateMonsters upgrade logic
const origUpdateMonsters = `                // Auto-upgrade fallback mannequin entity to authentic GLTF/OBJ model once template has loaded!
                if (entity.isFallback && entity.config && this.monsterTemplates && this.monsterTemplates.has(entity.config.templateKey)) {
                    const tmplData = this.monsterTemplates.get(entity.config.templateKey);
                    const srcObj = tmplData.scene || tmplData;
                    const upgradedMesh = this.cloneModelHierarchy(srcObj);
                    if (upgradedMesh) {
                        const s = entity.config.scale || (tmplData.defaultScale || 1.0);
                        upgradedMesh.scale.set(s, s, s);
                        if (entity.config.isFloating) upgradedMesh.position.y = 0.35;

                        upgradedMesh.updateMatrixWorld(true);
                        const bbox = new THREE.Box3().setFromObject(upgradedMesh);
                        if (isFinite(bbox.max.y) && bbox.max.y > 0) {
                            entity.modelHeight = bbox.max.y;
                        } else {
                            entity.modelHeight = 1.85;
                        }

                        this.applyCharacterSkinAndTint(upgradedMesh, entity.glyph, entity.race, entity.colorHex, entity.config.templateKey, entity.config.isEthereal);

                        this.configureCreatureEquipment(upgradedMesh, entity.config.role);

                        entity.remove(entity.creatureMesh);
                        entity.creatureMesh = upgradedMesh;
                        entity.add(upgradedMesh);
                        entity.isFallback = false;

                        if (entity.nameplate) {
                            entity.nameplate.position.set(0, Math.min(2.65, entity.modelHeight + 0.35), 0);
                        }
                    }
                }

                // Auto-upgrade monster to Shockbolt PBR billboard once monster_atlas.json has loaded!
                if (!entity.isBillboard && this.monsterAtlasData && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic')) {`;

const newUpdateMonsters = `                // Auto-upgrade entity to authentic GLTF/OBJ model once template has loaded!
                if (!entity.isReal3DModel && entity.config && this.monsterTemplates && this.monsterTemplates.has(entity.config.templateKey)) {
                    const tmplData = this.monsterTemplates.get(entity.config.templateKey);
                    const srcObj = tmplData.scene || tmplData;
                    const upgradedMesh = this.cloneModelHierarchy(srcObj);
                    if (upgradedMesh) {
                        const s = entity.config.scale || (tmplData.defaultScale || 1.0);
                        upgradedMesh.scale.set(s, s, s);
                        if (entity.config.isFloating) upgradedMesh.position.y = 0.35;

                        upgradedMesh.updateMatrixWorld(true);
                        const bbox = new THREE.Box3().setFromObject(upgradedMesh);
                        if (isFinite(bbox.max.y) && bbox.max.y > 0) {
                            entity.modelHeight = bbox.max.y;
                        } else {
                            entity.modelHeight = 1.85;
                        }

                        this.applyCharacterSkinAndTint(upgradedMesh, entity.glyph, entity.race, entity.colorHex, entity.config.templateKey, entity.config.isEthereal);

                        this.configureCreatureEquipment(upgradedMesh, entity.config.role);

                        entity.remove(entity.creatureMesh);
                        entity.creatureMesh = upgradedMesh;
                        entity.add(upgradedMesh);
                        entity.isReal3DModel = true;
                        entity.isBillboard = false;
                        entity.isFallback = false;
                        entity.isBillboardFallback = false;

                        if (entity.nameplate) {
                            entity.nameplate.position.set(0, Math.min(2.65, entity.modelHeight + 0.35), 0);
                        }
                    }
                }

                // Auto-upgrade monster to Shockbolt PBR billboard once monster_atlas.json has loaded (never overwriting 3D models!)
                if (!entity.isReal3DModel && !entity.isBillboard && this.monsterAtlasData && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic')) {`;
mustReplace(origUpdateMonsters, newUpdateMonsters, '3.8 updateMonsters upgrade order');

// 3.9 upgradeAllMonsterEntities
const origUpgradeMonstersMethod = `    upgradeAllMonsterEntities() {
        if (!this.monsterAtlasData || !this.monsters) return;
        for (const [id, entity] of this.monsters.entries()) {
            const m = entity.monsterData;
            if (!m) continue;
            // Auto-upgrade procedural creature fallback to Shockbolt PBR billboard
            if (!entity.isBillboard && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic')) {
                const atlasEntry = this.resolveMonsterAtlasEntry(m.race || m.name, entity.glyph);
                if (atlasEntry) {
                    const upgradedBillboard = this.createMonsterBillboardMesh(atlasEntry);
                    if (upgradedBillboard) {
                        if (entity.creatureMesh) entity.remove(entity.creatureMesh);
                        entity.creatureMesh = upgradedBillboard;
                        entity.add(upgradedBillboard);
                        entity.modelHeight = upgradedBillboard.baseHeight || Math.min(2.05, atlasEntry.height || 1.70);
                        entity.isFloating = atlasEntry.isFloating || false;
                        entity.isBillboard = true;
                        entity.isBillboardFallback = false;
                        entity.isFallback = false;
                        upgradedBillboard.monsterData = m;
                        if (entity.contactShadow) {
                            const footprint = (upgradedBillboard.baseWidth || 1.25) * 0.75;
                            entity.contactShadow.scale.set(footprint, footprint, footprint);
                        }
                        if (entity.nameplate) {
                            entity.nameplate.position.set(0, entity.modelHeight + 0.42, 0);
                        }
                    }
                }
            }
        }
    }`;

const newUpgradeMonstersMethod = `    upgradeAllMonsterEntities() {
        if (!this.monsters) return;
        for (const [id, entity] of this.monsters.entries()) {
            const m = entity.monsterData;
            if (!m) continue;
            // 1. Upgrade to real 3D model if template is now loaded
            if (!entity.isReal3DModel && entity.config && this.monsterTemplates && this.monsterTemplates.has(entity.config.templateKey)) {
                const tmplData = this.monsterTemplates.get(entity.config.templateKey);
                const srcObj = tmplData.scene || tmplData;
                const mesh = this.cloneModelHierarchy(srcObj);
                if (mesh) {
                    const s = entity.config.scale || (tmplData.defaultScale || 1.0);
                    mesh.scale.set(s, s, s);
                    if (entity.config.isFloating) mesh.position.y = 0.35;
                    mesh.updateMatrixWorld(true);
                    const bbox = new THREE.Box3().setFromObject(mesh);
                    const modelHeight = (isFinite(bbox.max.y) && bbox.max.y > 0) ? bbox.max.y : 1.85;
                    this.applyCharacterSkinAndTint(mesh, entity.glyph, m.race || m.name, entity.colorHex, entity.config.templateKey, entity.config.isEthereal);
                    this.configureCreatureEquipment(mesh, entity.config.role);

                    if (entity.creatureMesh) entity.remove(entity.creatureMesh);
                    entity.creatureMesh = mesh;
                    entity.add(mesh);
                    entity.modelHeight = modelHeight;
                    entity.isFloating = entity.config.isFloating;
                    entity.isReal3DModel = true;
                    entity.isBillboard = false;
                    entity.isBillboardFallback = false;
                    entity.isFallback = false;
                    if (entity.contactShadow) {
                        entity.contactShadow.scale.set(1.25 * 0.75, 1.25 * 0.75, 1.25 * 0.75);
                    }
                    if (entity.nameplate) {
                        entity.nameplate.position.set(0, entity.modelHeight + 0.42, 0);
                    }
                    continue;
                }
            }
            // 2. Upgrade to Shockbolt billboard if not a 3D model and not already a billboard
            if (!entity.isReal3DModel && !entity.isBillboard && this.monsterAtlasData && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.creatureRenderer !== 'classic')) {
                const atlasEntry = this.resolveMonsterAtlasEntry(m.race || m.name, entity.glyph);
                if (atlasEntry) {
                    const upgradedBillboard = this.createMonsterBillboardMesh(atlasEntry);
                    if (upgradedBillboard) {
                        if (entity.creatureMesh) entity.remove(entity.creatureMesh);
                        entity.creatureMesh = upgradedBillboard;
                        entity.add(upgradedBillboard);
                        entity.modelHeight = upgradedBillboard.baseHeight || Math.min(2.05, atlasEntry.height || 1.70);
                        entity.isFloating = atlasEntry.isFloating || false;
                        entity.isBillboard = true;
                        entity.isBillboardFallback = false;
                        entity.isFallback = false;
                        upgradedBillboard.monsterData = m;
                        if (entity.contactShadow) {
                            const footprint = (upgradedBillboard.baseWidth || 1.25) * 0.75;
                            entity.contactShadow.scale.set(footprint, footprint, footprint);
                        }
                        if (entity.nameplate) {
                            entity.nameplate.position.set(0, entity.modelHeight + 0.42, 0);
                        }
                    }
                }
            }
        }
    }`;
mustReplace(origUpgradeMonstersMethod, newUpgradeMonstersMethod, '3.9 upgradeAllMonsterEntities method');

// -------------------------------------------------------------
// Section 4: Real 3D .obj & Floor Items First + Multi-Material slots
// -------------------------------------------------------------

// 4.1 mapItemObjMaterialSlot & loadItem replacement
const origLoadItem = `        const loadItem = (key, url, mat, scale, yOffset = 0) => {
            this.objLoader.load(url, (obj) => {
                obj.traverse((c) => {
                    if (c.isMesh) {
                        c.material = mat.clone();
                        if (c.geometry) {
                            c.geometry.computeVertexNormals();
                        }
                    }
                });
                obj.scale.set(scale, scale, scale);
                obj.position.y = yOffset;
                this.itemTemplates.set(key, obj);
            }, undefined, () => {});
        };`;

const newLoadItem = `        const mapItemObjMaterialSlot = (matSlot, meshName = '') => {
            const mName = ((matSlot && matSlot.name ? matSlot.name : '') + ' ' + (meshName || '')).toLowerCase();
            let mat;
            if (mName.includes('glass') || mName.includes('crystal') || mName.includes('bottle') || mName.includes('vial')) {
                mat = (typeof THREE.MeshPhysicalMaterial !== 'undefined') ? new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,
                    transmission: 0.88,
                    opacity: 1.0,
                    transparent: true,
                    roughness: 0.12,
                    ior: 1.5,
                    metalness: 0.05
                }) : new THREE.MeshStandardMaterial({
                    color: 0xddf0f8,
                    transparent: true,
                    opacity: 0.65,
                    roughness: 0.15,
                    metalness: 0.10
                });
                mat._slotRole = 'glass';
            } else if (mName.includes('liquid') || mName.includes('potion') || mName.includes('fluid')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0xbb3322,
                    emissive: 0x551108,
                    emissiveIntensity: 0.65,
                    roughness: 0.20,
                    metalness: 0.10
                });
                mat._slotRole = 'liquid';
            } else if (mName.includes('gold') || mName.includes('ingot') || mName.includes('coin') || mName.includes('crown') || mName.includes('brass') || mName.includes('yellow')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0xffc400,
                    emissive: 0x442a00,
                    emissiveIntensity: 0.25,
                    roughness: 0.22,
                    metalness: 0.92
                });
                mat._slotRole = 'primary';
            } else if (mName.includes('lightsteel') || mName.includes('silver') || mName.includes('blade') || mName.includes('edge')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0xe2e8f0,
                    roughness: 0.20,
                    metalness: 0.94
                });
                mat._slotRole = 'primary';
            } else if (mName.includes('darksteel') || mName.includes('iron') || mName.includes('armor') || mName.includes('metal')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0x8a94a2,
                    roughness: 0.38,
                    metalness: 0.88
                });
                mat._slotRole = 'primary';
            } else if (mName.includes('wood') || mName.includes('cork') || mName.includes('handle') || mName.includes('shaft') || mName.includes('stick') || mName.includes('trunk')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0x7c4f2b,
                    roughness: 0.76,
                    metalness: 0.04
                });
                mat._slotRole = 'wood';
            } else if (mName.includes('parchment') || mName.includes('paper') || mName.includes('scroll') || mName.includes('page')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0xf2e8cf,
                    roughness: 0.85,
                    metalness: 0.02
                });
                mat._slotRole = 'parchment';
            } else if (mName.includes('leather') || mName.includes('cloth') || mName.includes('pouch') || mName.includes('bag') || mName.includes('strap')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0x6e482b,
                    roughness: 0.82,
                    metalness: 0.05
                });
                mat._slotRole = 'leather';
            } else if (mName.includes('gem') || mName.includes('ruby') || mName.includes('emerald') || mName.includes('sapphire') || mName.includes('diamond')) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0x00d4ff,
                    emissive: 0x003344,
                    emissiveIntensity: 0.85,
                    roughness: 0.12,
                    metalness: 0.20
                });
                mat._slotRole = 'accent';
            } else {
                mat = new THREE.MeshStandardMaterial({
                    color: 0xc8d2de,
                    roughness: 0.30,
                    metalness: 0.75
                });
                mat._slotRole = 'primary';
            }
            mat._sharedMaterial = true;
            return mat;
        };

        const loadItem = (key, url, fallbackMat, targetScale, yOffset = 0.03, isFloorWeapon = false) => {
            if (fallbackMat) fallbackMat._sharedMaterial = true;
            this.objLoader.load(url, (obj) => {
                const unionBox = new THREE.Box3();
                obj.traverse((c) => {
                    if (c.isMesh && c.geometry) {
                        c.geometry.computeBoundingBox();
                        unionBox.union(c.geometry.boundingBox);
                    }
                });
                const cx = (unionBox.min.x + unionBox.max.x) * 0.5;
                const cz = (unionBox.min.z + unionBox.max.z) * 0.5;
                const minY = unionBox.min.y;
                const sizeX = unionBox.max.x - unionBox.min.x;
                const sizeY = unionBox.max.y - unionBox.min.y;
                const sizeZ = unionBox.max.z - unionBox.min.z;
                const maxDim = Math.max(sizeX, sizeY, sizeZ) || 1.0;

                const targetDim = Math.max(0.48, Math.min(0.66, maxDim * (targetScale > 0.4 ? targetScale : targetScale * 2.5)));
                const normScale = targetDim / maxDim;

                obj.traverse((c) => {
                    if (c.isMesh) {
                        if (c.material) {
                            if (Array.isArray(c.material)) {
                                c.material = c.material.map(m => mapItemObjMaterialSlot(m, c.name));
                            } else {
                                c.material = mapItemObjMaterialSlot(c.material, c.name);
                            }
                        } else {
                            c.material = (fallbackMat || weaponMat).clone();
                            c.material._sharedMaterial = true;
                            c.material._slotRole = 'primary';
                        }
                        if (c.geometry) {
                            c.geometry.translate(-cx, -minY, -cz);
                            c.geometry.computeVertexNormals();
                            c.geometry._sharedGeometry = true;
                        }
                    }
                });

                obj.scale.set(normScale, normScale, normScale);

                const isTiltTarget = isFloorWeapon || key === ')' || key === '}' || key === '{' || key.startsWith('sword') || key.startsWith('dagger') || key.startsWith('axe') || key.startsWith('hammer') || key.startsWith('spear') || key.startsWith('scythe') || key.startsWith('claymore') || key.startsWith('shield') || key.startsWith('bow');
                if (isTiltTarget) {
                    obj.rotation.set(0.55, 0.35, -0.45);
                    obj.position.y = 0.06;
                } else {
                    obj.position.y = yOffset || 0.03;
                }

                obj._isReal3DItem = true;
                this.itemTemplates.set(key, obj);
                if (this.upgradeAllItemEntities) this.upgradeAllItemEntities();
            }, undefined, () => {});
        };`;
mustReplace(origLoadItem, newLoadItem, '4.1 mapItemObjMaterialSlot and loadItem');

// 4.2 createItemBillboardMesh AO and scale
const origItemBillboardAO = `                const ao = 0.82 + 0.18 * Math.min(1.0, gv * 1.4);
                colors[i * 3] = ao;
                colors[i * 3 + 1] = ao;
                colors[i * 3 + 2] = ao;
            }
            uvAttr.needsUpdate = true;
            normAttr.needsUpdate = true;
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }

        const mesh = new THREE.Mesh(geo, this.itemBillboardMat);
        mesh.castShadow = !atlasEntry.isFlat;
        mesh.receiveShadow = true;
        if (this.itemDepthMat) mesh.customDepthMaterial = this.itemDepthMat;
        const w = atlasEntry.width || 0.40;
        const h = atlasEntry.height || 0.40;
        mesh.scale.set(w, h, 1.0);`;

const newItemBillboardAO = `                const ao = 0.94 + 0.06 * Math.min(1.0, gv * 1.4);
                colors[i * 3] = ao;
                colors[i * 3 + 1] = ao;
                colors[i * 3 + 2] = ao;
            }
            uvAttr.needsUpdate = true;
            normAttr.needsUpdate = true;
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }

        const mesh = new THREE.Mesh(geo, this.itemBillboardMat);
        mesh.castShadow = !atlasEntry.isFlat;
        mesh.receiveShadow = true;
        if (this.itemDepthMat) mesh.customDepthMaterial = this.itemDepthMat;
        const w = (atlasEntry.width || 0.40) * 1.30;
        const h = (atlasEntry.height || 0.40) * 1.30;
        mesh.scale.set(w, h, 1.0);`;
mustReplace(origItemBillboardAO, newItemBillboardAO, '4.2 createItemBillboardMesh scale & AO');

// 4.3 upgradeAllItemEntities
const origUpgradeItemEntities = `    upgradeAllItemEntities() {
        if (!this.itemAtlasData || !this.items) return;
        for (const [id, entity] of this.items.entries()) {
            if (entity.isItemBillboardFallback && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.itemRenderer !== 'classic')) {
                const atlasEntry = this.resolveItemAtlasEntry(entity.itemName, entity.glyph);
                if (atlasEntry) {
                    const upgradedBillboard = this.createItemBillboardMesh(atlasEntry);
                    if (upgradedBillboard) {
                        if (entity.itemMesh) entity.remove(entity.itemMesh);
                        entity.itemMesh = upgradedBillboard;
                        entity.add(upgradedBillboard);
                        entity.isItemBillboard = true;
                        entity.isFlat = !!atlasEntry.isFlat;
                        entity.isItemBillboardFallback = false;
                        if (entity.shadowMesh) {
                            const fp = atlasEntry.footprint || 0.35;
                            entity.shadowMesh.scale.set(fp, fp, fp);
                        }
                    }
                }
            }
        }
    }`;

const newUpgradeItemEntities = `    upgradeAllItemEntities() {
        if (!this.items) return;
        for (const [id, entity] of this.items.entries()) {
            if (!entity.isReal3DItem) {
                const tmpl = this.resolveItemTemplate(null, entity.glyph, (entity.itemName || '').toLowerCase(), entity.seed);
                if (tmpl) {
                    const upgradedMesh = tmpl.clone(true);
                    const colorHex = entity.colorHex || '#ffffff';
                    const g = entity.glyph || '?';
                    const lowerName = (entity.itemName || '').toLowerCase();
                    upgradedMesh.traverse(child => {
                        if (child.isMesh && child.material) {
                            const tintSlot = (mat) => {
                                if (!mat) return mat;
                                const role = mat._slotRole || 'primary';
                                if (role === 'glass' || role === 'wood' || role === 'parchment' || role === 'leather') return mat;
                                const mClone = mat.clone();
                                mClone._sharedMaterial = false;
                                if (role === 'liquid' || g === '!' || lowerName.includes('potion')) {
                                    mClone.color.set(colorHex);
                                    mClone.emissive.set(colorHex);
                                    mClone.emissiveIntensity = 0.65;
                                } else if (role === 'accent' || g === '*' || g === '=') {
                                    mClone.color.set(colorHex);
                                    mClone.emissive.set(colorHex);
                                    mClone.emissiveIntensity = (g === '*' ? 0.8 : 0.35);
                                } else if (g === '$' || lowerName.includes('gold')) {
                                    mClone.color.setHex(0xffd700);
                                    mClone.metalness = 0.95;
                                    mClone.roughness = 0.18;
                                }
                                return mClone;
                            };
                            if (Array.isArray(child.material)) {
                                child.material = child.material.map(tintSlot);
                            } else {
                                child.material = tintSlot(child.material);
                            }
                        }
                    });
                    if (entity.itemMesh) entity.remove(entity.itemMesh);
                    upgradedMesh.position.y = tmpl.position.y || 0.03;
                    entity.itemMesh = upgradedMesh;
                    entity.add(upgradedMesh);
                    entity.isReal3DItem = true;
                    entity.isItemBillboard = false;
                    entity.isItemBillboardFallback = false;
                    continue;
                }
            }
            if (!entity.isReal3DItem && entity.isItemBillboardFallback && this.itemAtlasData && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.itemRenderer !== 'classic')) {
                const atlasEntry = this.resolveItemAtlasEntry(entity.itemName, entity.glyph);
                if (atlasEntry) {
                    const upgradedBillboard = this.createItemBillboardMesh(atlasEntry);
                    if (upgradedBillboard) {
                        if (entity.itemMesh) entity.remove(entity.itemMesh);
                        entity.itemMesh = upgradedBillboard;
                        entity.add(upgradedBillboard);
                        entity.isItemBillboard = true;
                        entity.isFlat = !!atlasEntry.isFlat;
                        entity.isItemBillboardFallback = false;
                        if (entity.shadowMesh) {
                            const fp = atlasEntry.footprint || 0.35;
                            entity.shadowMesh.scale.set(fp, fp, fp);
                        }
                    }
                }
            }
        }
    }`;
mustReplace(origUpgradeItemEntities, newUpgradeItemEntities, '4.3 upgradeAllItemEntities method');

// 4.4 Add resolveItemTemplate and refactor createItem3DEntity
// Let's locate createItem3DEntity(it) down to plinth creation
const origCreateItemWhole = src.match(/    createItem3DEntity\(it\) \{[\s\S]*?        if \(!isBillboard\) \{\s*mesh\.position\.y = 0\.12;\s*\}\s*group\.add\(mesh\);/);
if (!origCreateItemWhole) {
    console.error("FAILED TO MATCH createItem3DEntity whole section!");
    process.exit(1);
}

const newCreateItemWhole = `    resolveItemTemplate(it, g, lowerName, nameHash) {
        if (!this.itemTemplates) return null;
        const glyph = g || (it && it.glyph) || '?';
        const name = (lowerName || (it && it.name ? it.name.toLowerCase() : ''));
        const hash = (nameHash !== undefined && nameHash !== null) ? nameHash : 0;

        // Gold & Coins
        if (glyph === '$' || name.includes('gold') || name.includes('coin') || name.includes('copper') || name.includes('silver')) {
            if (name.includes('skull')) {
                return this.itemTemplates.get('coin_skull') || this.itemTemplates.get('$');
            } else if (name.includes('star')) {
                return this.itemTemplates.get('coin_star') || this.itemTemplates.get('$');
            } else if (name.includes('ingot') || glyph === '$') {
                return this.itemTemplates.get('$') || this.itemTemplates.get('coin');
            } else {
                return this.itemTemplates.get('coin') || this.itemTemplates.get('$');
            }
        }
        // Potions & Flasks (11 Distinct Variations)
        if (glyph === '!' || name.includes('potion') || name.includes('flask') || name.includes('draught') || name.includes('elixir')) {
            const potIdx = (hash % 11) + 1;
            return this.itemTemplates.get(\`potion_\${potIdx}\`) || this.itemTemplates.get('!');
        }
        // Books & Spellbooks (5 Distinct Open/Closed Variations)
        if (name.includes('book') || name.includes('tome') || name.includes('grimoire') || name.includes('prayer') || name.includes('sorcery') || name.includes('spellbook')) {
            const bookVariants = ['book_open', 'book_2', 'book_3', 'book_4', 'book'];
            return this.itemTemplates.get(bookVariants[hash % bookVariants.length]) || this.itemTemplates.get('book');
        }
        // Scrolls & Parchment
        if (glyph === '?' || name.includes('scroll') || name.includes('parchment')) {
            return (hash % 2 === 0 ? this.itemTemplates.get('parchment') : null) || this.itemTemplates.get('?');
        }
        // Rings (7 Distinct Gem/Band Variations)
        if (glyph === '=' || name.includes('ring') || name.includes('band')) {
            const ringIdx = (hash % 7) + 1;
            return this.itemTemplates.get(\`ring_\${ringIdx}\`) || this.itemTemplates.get('=');
        }
        // Amulets & Necklaces (3 Distinct Variations)
        if (glyph === '"' || name.includes('amulet') || name.includes('necklace') || name.includes('pendant') || name.includes('medallion') || name.includes('periapt')) {
            const necIdx = (hash % 3) + 1;
            return this.itemTemplates.get(\`necklace_\${necIdx}\`) || this.itemTemplates.get('"') || this.itemTemplates.get('=');
        }
        // Gems & Crystals (5 Distinct Crystal Geometries)
        if (glyph === '*' || name.includes('gem') || name.includes('crystal') || name.includes('diamond') || name.includes('ruby') || name.includes('emerald') || name.includes('sapphire') || name.includes('phial') || name.includes('star of') || name.includes('arkenstone')) {
            const cryIdx = (hash % 5) + 1;
            return this.itemTemplates.get(\`crystal_\${cryIdx}\`) || this.itemTemplates.get('*');
        }
        // Chests & Boxes
        if (name.includes('chest') || name.includes('coffer') || name.includes('box')) {
            if (name.includes('ingot')) {
                return this.itemTemplates.get('chest_ingots') || this.itemTemplates.get('chest');
            } else if (name.includes('open')) {
                return this.itemTemplates.get('chest_open') || this.itemTemplates.get('chest');
            } else {
                return this.itemTemplates.get('chest');
            }
        }
        // Food & Rations (ChickenLeg.obj)
        if (glyph === ',' || name.includes('ration') || name.includes('food') || name.includes('meat') || name.includes('bread') || name.includes('mushroom') || name.includes('apple') || name.includes('slime mold')) {
            return this.itemTemplates.get(',');
        }
        // Skulls & Remains
        if (name.includes('skull') || name.includes('bone') || name.includes('skeleton')) {
            if (name.includes('bone')) {
                return this.itemTemplates.get('bone') || this.itemTemplates.get('skull');
            } else {
                return (hash % 2 === 0 ? this.itemTemplates.get('skull_2') : null) || this.itemTemplates.get('skull');
            }
        }
        // Keys & Lockpicks
        if (name.includes('key') || name.includes('lockpick')) {
            const keyIdx = (hash % 3) + 1;
            return this.itemTemplates.get(\`key_\${keyIdx}\`) || this.itemTemplates.get('key');
        }
        // Bags & Pouches
        if (name.includes('backpack') || name.includes('sack')) {
            return this.itemTemplates.get('backpack');
        } else if (name.includes('bag') || name.includes('pouch')) {
            return this.itemTemplates.get('pouch') || this.itemTemplates.get('bag');
        }
        // Shields
        if (glyph === '(' || name.includes('shield') || name.includes('buckler') || name.includes('targe')) {
            if (name.includes('celtic') || name.includes('golden') || name.includes('gold')) {
                return this.itemTemplates.get('shield_celtic') || this.itemTemplates.get('shield_heater');
            } else if (name.includes('round') || name.includes('small')) {
                return (hash % 2 === 0 ? this.itemTemplates.get('shield_round_2') : null) || this.itemTemplates.get('shield_round');
            } else {
                return (hash % 2 === 0 ? this.itemTemplates.get('shield_heater_2') : null) || this.itemTemplates.get('shield_heater');
            }
        }
        // Helms & Crowns
        if (name.includes('crown') || name.includes('coronet') || name.includes('helm') || name.includes('cap') || name.includes('hat')) {
            return (hash % 2 === 0 ? this.itemTemplates.get('crown_2') : null) || this.itemTemplates.get('crown');
        }
        // Gloves & Gauntlets
        if (name.includes('glove') || name.includes('gauntlet') || name.includes('cesta') || name.includes('bracer')) {
            return this.itemTemplates.get('glove');
        }
        // Body Armor & Cloaks (Glyph '[')
        if (glyph === '[' || name.includes('plate') || name.includes('chain') || name.includes('mail') || name.includes('armor') || name.includes('cuirass') || name.includes('corselet') || name.includes('robe') || name.includes('cloak')) {
            if (name.includes('golden') || name.includes('gold')) {
                return this.itemTemplates.get('armor_golden') || this.itemTemplates.get('armor_metal');
            } else if (name.includes('black') || name.includes('dark') || name.includes('shadow')) {
                return this.itemTemplates.get('armor_black') || this.itemTemplates.get('armor_metal');
            } else if (name.includes('leather') || name.includes('soft') || name.includes('robe') || name.includes('cloak')) {
                return this.itemTemplates.get('armor_leather');
            } else {
                return (hash % 2 === 0 ? this.itemTemplates.get('armor_metal2') : null) || this.itemTemplates.get('armor_metal');
            }
        }
        // Weapons: Axes
        if (name.includes('battle axe') || name.includes('great axe') || name.includes('broad axe') || name.includes('halberd') || name.includes('poleaxe')) {
            return this.itemTemplates.get('axe_double') || this.itemTemplates.get('axe');
        } else if (name.includes('axe') || name.includes('cleaver') || name.includes('hatchet')) {
            return this.itemTemplates.get('axe');
        }
        // Weapons: Hammers & Maces
        if (name.includes('war hammer') || name.includes('great hammer') || name.includes('mattock')) {
            return this.itemTemplates.get('hammer_double') || this.itemTemplates.get('hammer');
        } else if (name.includes('hammer') || name.includes('mace') || name.includes('flail') || name.includes('star') || name.includes('club') || name.includes('cudgel')) {
            return this.itemTemplates.get('hammer');
        }
        // Devices & Polearms: Wands, Rods, Staves, Spears & Polearms
        if (name.includes('spear') || name.includes('lance') || name.includes('pike') || name.includes('trident')) {
            return this.itemTemplates.get('spear');
        }
        // Weapons: Scythes
        if (name.includes('scythe')) {
            return this.itemTemplates.get('scythe') || this.itemTemplates.get('spear');
        }
        // Weapons: Daggers & Knives
        if (name.includes('dagger') || name.includes('knife') || name.includes('rapier') || name.includes('stiletto') || name.includes('main gauche') || name.includes('misericorde') || name.includes('athame')) {
            return (hash % 2 === 0 ? this.itemTemplates.get('dagger_2') : null) || this.itemTemplates.get('dagger');
        }
        // Weapons: Two-Handed Swords & Greatswords
        if (name.includes('two-handed') || name.includes('great sword') || name.includes('claymore') || name.includes('zweihander') || name.includes('flamberge')) {
            return this.itemTemplates.get('claymore');
        } else if (name.includes('bastard') || name.includes('broad sword') || name.includes('broadsword')) {
            return this.itemTemplates.get('sword_big') || this.itemTemplates.get('claymore');
        }
        // Weapons: Swords & Blades (Glyph ')')
        if (glyph === ')' || name.includes('sword') || name.includes('blade') || name.includes('sabre') || name.includes('scimitar') || name.includes('cutlass') || name.includes('katana') || name.includes('foil')) {
            if (name.includes('golden') || name.includes('gold')) {
                return this.itemTemplates.get('sword_golden') || this.itemTemplates.get(')');
            } else {
                return (hash % 2 === 0 ? this.itemTemplates.get('sword_2') : null) || this.itemTemplates.get(')');
            }
        }
        // Bows & Crossbows (Glyph '}')
        if (glyph === '}' || name.includes('bow') || name.includes('crossbow') || name.includes('arbalest') || name.includes('sling')) {
            if (name.includes('evil') || name.includes('dark')) {
                return this.itemTemplates.get('bow_evil') || this.itemTemplates.get('}');
            } else if (name.includes('golden') || name.includes('gold')) {
                return this.itemTemplates.get('bow_golden') || this.itemTemplates.get('}');
            } else {
                return (hash % 2 === 0 ? this.itemTemplates.get('bow_wooden2') : null) || this.itemTemplates.get('}');
            }
        }
        // Slings Ammo: Pebbles, Stones, Rocks
        if (name.includes('pebble') || name.includes('stone') || name.includes('rock') || name.includes('shot') || name.includes('bullet')) {
            return this.itemTemplates.get('pebble') || this.itemTemplates.get('*');
        }
        // Darts
        if (name.includes('dart')) {
            return this.itemTemplates.get('dart');
        }
        // Arrows & Bolts (Glyph '{')
        if (glyph === '{' || name.includes('arrow') || name.includes('bolt')) {
            return this.itemTemplates.get('{');
        }
        return null;
    }

    createItem3DEntity(it) {
        const group = new THREE.Group();
        const g = it.glyph || '?';
        const lowerName = (it.name || '').toLowerCase();
        const colorHex = getAngbandColorString(it.attr);

        let mesh = null;
        let isBillboard = false;
        let isFlat = false;
        let footprint = 0.35;
        let isItemBillboardFallback = false;

        // Deterministic item seed from name for model & aesthetic variation
        let nameHash = 0;
        const itemNameStr = it.name || '';
        for (let i = 0; i < itemNameStr.length; i++) {
            nameHash = ((nameHash << 5) - nameHash + itemNameStr.charCodeAt(i)) >>> 0;
        }

        // 1. Check Real 3D Low-Poly Item Templates FIRST
        const tmpl = this.resolveItemTemplate(it, g, lowerName, nameHash);
        if (tmpl) {
            mesh = tmpl.clone(true);
            mesh.traverse(child => {
                if (child.isMesh && child.material) {
                    const tintSlot = (mat) => {
                        if (!mat) return mat;
                        const role = mat._slotRole || 'primary';
                        if (role === 'glass' || role === 'wood' || role === 'parchment' || role === 'leather') {
                            return mat;
                        }
                        const mClone = mat.clone();
                        mClone._sharedMaterial = false;
                        if (role === 'liquid' || g === '!' || lowerName.includes('potion')) {
                            mClone.color.set(colorHex);
                            mClone.emissive.set(colorHex);
                            mClone.emissiveIntensity = 0.65;
                        } else if (role === 'accent' || g === '*' || g === '=') {
                            mClone.color.set(colorHex);
                            mClone.emissive.set(colorHex);
                            mClone.emissiveIntensity = (g === '*' ? 0.8 : 0.35);
                        } else if (g === '$' || lowerName.includes('gold')) {
                            mClone.color.setHex(0xffd700);
                            mClone.metalness = 0.95;
                            mClone.roughness = 0.18;
                        } else {
                            if (colorHex !== '#ffffff' && colorHex !== '#c0c0c0' && colorHex !== '#808080') {
                                mClone.emissive.set(colorHex);
                                mClone.emissiveIntensity = 0.25;
                            }
                        }
                        return mClone;
                    };
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(tintSlot);
                    } else {
                        child.material = tintSlot(child.material);
                    }
                }
            });
            group.isReal3DItem = true;
            mesh.position.y = tmpl.position.y || 0.03;
        }

        // 2. High-Fidelity Shockbolt 2.5D PBR Billboards SECOND
        if (!mesh && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.itemRenderer !== 'classic')) {
            const atlasEntry = this.resolveItemAtlasEntry(it.name, g);
            if (atlasEntry) {
                mesh = this.createItemBillboardMesh(atlasEntry);
                if (mesh) {
                    isBillboard = true;
                    isFlat = !!atlasEntry.isFlat;
                    footprint = atlasEntry.footprint || 0.35;
                }
            }
        }

        // 3. Fallback temporary billboard quad while templates or atlas are still loading (NEVER primitive shapes)
        if (!mesh) {
            isItemBillboardFallback = true;
            const tempGeo = new THREE.PlaneGeometry(0.40, 0.40);
            tempGeo.translate(0, 0.20, 0);
            mesh = new THREE.Mesh(tempGeo, this.itemBillboardMat);
            isBillboard = true;
            footprint = 0.35;
        }

        // Soft contact shadow disc right on the floor (y = 0.005)
        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.contactShadows) && this.shadowGeo && this.shadowMat) {
            const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
            shadow.position.set(0, 0.005, 0);
            shadow.scale.set(footprint, footprint, footprint);
            group.add(shadow);
            group.shadowMesh = shadow;
        }

        // Subtle ground-level loot rarity plinth ring (pooled material per colorHex)
        if (!this.itemPlinthGeo) {
            this.itemPlinthGeo = new THREE.RingGeometry(0.09, 0.23, 24);
        }
        if (!this.itemPlinthMatCache) {
            this.itemPlinthMatCache = new Map();
        }
        const plinthKey = colorHex || '#ffd700';
        let plinthMat = this.itemPlinthMatCache.get(plinthKey);
        if (!plinthMat) {
            plinthMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(plinthKey),
                transparent: true,
                opacity: 0.42,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            plinthMat._sharedMaterial = true;
            this.itemPlinthMatCache.set(plinthKey, plinthMat);
        }
        const plinth = new THREE.Mesh(this.itemPlinthGeo, plinthMat);
        plinth.rotation.x = -Math.PI / 2;
        plinth.position.y = 0.008;
        group.add(plinth);
        group.plinthMesh = plinth;

        if (!isBillboard && !group.isReal3DItem) {
            mesh.position.y = 0.03;
        }
        group.add(mesh);`;

mustReplace(origCreateItemWhole[0], newCreateItemWhole, '4.4 resolveItemTemplate and createItem3DEntity');

// 4.5 destroyEntity guards for _sharedGeometry and _sharedTexture
const origDestroySafe = `        const disposeMatSafe = (m) => {
            if (!m || m._sharedMaterial || sharedMats.has(m)) return;
            if (m.map && !sharedTexs.has(m.map)) m.map.dispose();
            if (m.normalMap && !sharedTexs.has(m.normalMap)) m.normalMap.dispose();
            if (m.roughnessMap && !sharedTexs.has(m.roughnessMap)) m.roughnessMap.dispose();
            if (m.emissiveMap && !sharedTexs.has(m.emissiveMap)) m.emissiveMap.dispose();
            m.dispose();
        };
        entity.traverse((node) => {
            if (node.geometry && !sharedGeos.has(node.geometry)) {
                node.geometry.dispose();
            }
            if (node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(disposeMatSafe);
                } else {
                    disposeMatSafe(node.material);
                }
            }
        });`;

const newDestroySafe = `        const disposeMatSafe = (m) => {
            if (!m || m._sharedMaterial || sharedMats.has(m)) return;
            if (m.map && !m.map._sharedTexture && !sharedTexs.has(m.map)) m.map.dispose();
            if (m.normalMap && !m.normalMap._sharedTexture && !sharedTexs.has(m.normalMap)) m.normalMap.dispose();
            if (m.roughnessMap && !m.roughnessMap._sharedTexture && !sharedTexs.has(m.roughnessMap)) m.roughnessMap.dispose();
            if (m.emissiveMap && !m.emissiveMap._sharedTexture && !sharedTexs.has(m.emissiveMap)) m.emissiveMap.dispose();
            m.dispose();
        };
        entity.traverse((node) => {
            if (node.geometry && !node.geometry._sharedGeometry && !sharedGeos.has(node.geometry)) {
                node.geometry.dispose();
            }
            if (node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(disposeMatSafe);
                } else {
                    disposeMatSafe(node.material);
                }
            }
        });`;
mustReplace(origDestroySafe, newDestroySafe, '4.5 destroyEntity shared guards');

fs.writeFileSync(targetPath, src, 'utf8');
console.log('SUCCESSFULLY APPLIED CARD 7A to dungeon3d.js!');

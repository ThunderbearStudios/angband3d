#!/usr/bin/env node
/**
 * tools/test_v12_3_1_hengband_town_perf.js
 *
 * Regression suite for v12.3.1 Hengband Town/Overworld fixes:
 *  1. Solid-rectangle town roof clustering on 01_Outpost_Full & 01_Outpost_Lite (0 street/spawn coverage).
 *  2. UV-mapped gable roofs + Western/Eastern roof tile textures & normal maps via syncTownSharedMaterials.
 *  3. Lightweight botanical BufferGeometry trees (<350 tris) & bushes (<150 tris), zero pachira_aquatica GLTF load, FrontSide/no alphaTest.
 *  4. Desktop HardwareGpuProfile default ('performance'), farDistance >= 96, idle-safe DPR governor, and Hengband horizon/fog parity (0x19182c).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const readRel = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function stripJsonc(raw) {
    return raw
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1');
}

function makeThreeStub() {
    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
            this.count = array ? Math.floor(array.length / itemSize) : 0;
        }
    }
    class Float32BufferAttribute extends BufferAttribute {
        constructor(arr, itemSize) {
            super(arr instanceof Float32Array ? arr : new Float32Array(arr), itemSize);
        }
    }
    class BufferGeometry {
        constructor() {
            this.attributes = {};
            this.index = null;
            this.boundingBox = null;
            this.boundingSphere = null;
        }
        setAttribute(name, attr) { this.attributes[name] = attr; return this; }
        deleteAttribute(name) { delete this.attributes[name]; return this; }
        setIndex(idx) {
            this.index = Array.isArray(idx) ? new BufferAttribute(new Uint16Array(idx), 1) : idx;
            return this;
        }
        computeVertexNormals() { return this; }
        computeBoundingBox() { this.boundingBox = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } }; return this; }
        computeBoundingSphere() { this.boundingSphere = { radius: 2 }; return this; }
        dispose() {}
    }
    class BoxGeometry extends BufferGeometry {
        constructor() {
            super();
            this.setAttribute('position', new Float32BufferAttribute(new Float32Array(24), 3));
            this.setAttribute('normal', new Float32BufferAttribute(new Float32Array(24), 3));
            this.setAttribute('uv', new Float32BufferAttribute(new Float32Array(16), 2));
            this.setIndex([0, 1, 2, 0, 2, 3]);
        }
    }
    class DataTexture {
        constructor(data, width, height) {
            this.data = data;
            this.width = width;
            this.height = height;
            this.wrapS = 0;
            this.wrapT = 0;
            this.repeat = { set() {} };
            this.anisotropy = 1;
            this.needsUpdate = false;
        }
        dispose() {}
    }
    class Texture {
        constructor() { this.wrapS = 0; this.wrapT = 0; }
        dispose() {}
    }
    class MeshStandardMaterial {
        constructor(opts = {}) { Object.assign(this, opts); }
        dispose() {}
    }
    class Color {
        constructor(hex) { this.hex = hex || 0; this.r = 1; this.g = 1; this.b = 1; }
        setHex(h) { this.hex = h; return this; }
        setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
        setScalar(s) { this.r = s; this.g = s; this.b = s; return this; }
    }
    class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; } }
    class Object3D {
        constructor() {
            this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            this.matrix = new Float32Array(16);
            this.children = [];
            this.parent = null;
        }
        updateMatrix() {}
        add(...items) {
            for (const item of items) {
                if (item) { item.parent = this; this.children.push(item); }
            }
        }
        remove(item) {
            this.children = this.children.filter((c) => c !== item);
            if (item) item.parent = null;
        }
    }
    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.isMesh = true;
            this.geometry = geometry;
            this.material = material;
        }
    }
    class InstancedMesh extends Object3D {
        constructor(geometry, material, count) {
            super();
            this.isInstancedMesh = true;
            this.geometry = geometry;
            this.material = material;
            this.count = count;
            this.instanceMatrix = { count, needsUpdate: false };
        }
        setMatrixAt() {}
        setColorAt() {}
    }
    class TextureLoader {
        load() { return new Texture(); }
    }
    return {
        FrontSide: 0,
        DoubleSide: 2,
        RepeatWrapping: 1000,
        LinearFilter: 1006,
        LinearMipmapLinearFilter: 1008,
        SRGBColorSpace: 'srgb',
        RGBAFormat: 1023,
        UnsignedByteType: 1009,
        BufferAttribute,
        Float32BufferAttribute,
        BufferGeometry,
        BoxGeometry,
        DataTexture,
        Texture,
        TextureLoader,
        MeshStandardMaterial,
        Color,
        Vector2,
        Object3D,
        Group,
        Scene: Group,
        Mesh,
        InstancedMesh
    };
}

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

const THREE = makeThreeStub();
const townCtx = vm.createContext({ THREE, window: {}, globalThis: null, module: { exports: {} }, console });
townCtx.globalThis = townCtx;
vm.runInContext(readRel('server/public/js/dungeon3d-town.js'), townCtx, { filename: 'dungeon3d-town.js' });
const Town = townCtx.window.Dungeon3DTown || townCtx.module.exports;

// 1. Parse TownPreferences + Hengband Outpost Full & Lite and validate solid-rectangle clustering
const hengPrefPath = path.join(ROOT, 'variants/hengband/lib/edit/TownPreferences.jsonc');
if (fs.existsSync(hengPrefPath)) {
    const prefs = JSON.parse(stripJsonc(readRel('variants/hengband/lib/edit/TownPreferences.jsonc')));
    const legend = Object.assign({}, prefs.legend);

    function buildOutpostMap(fileName) {
        const def = JSON.parse(stripJsonc(readRel(path.join('variants/hengband/lib/edit/towns', fileName))));
        const localLegend = Object.assign({}, legend);
        for (const rule of (def.featureRules || [])) {
            if (rule.symbol && rule.definition) localLegend[rule.symbol] = rule.definition;
        }
        const rows = def.mapVariants[0].rows;
        const h = rows.length;
        const w = rows[0].length;
        const mapRows = rows.map((r) => {
            let hex = '';
            for (let x = 0; x < r.length; x++) {
                const ch = r[x];
                const terrain = (localLegend[ch] && localLegend[ch].terrain) || 'FLOOR';
                let feat = 1;
                if (terrain === 'PERMANENT') feat = 22;
                else if (terrain === 'TREE') feat = 25;
                else if (terrain === 'GRASS') feat = 26;
                else if (terrain === 'DEEP_WATER' || terrain === 'SHALLOW_WATER') feat = 28;
                else if (/GENERAL_STORE|ARMOURY|WEAPON_SMITHS|TEMPLE|ALCHEMY_SHOP|MAGIC_SHOP|BLACK_MARKET|HOME|BOOKSTORE|MUSEUM/.test(terrain)) feat = 7;
                else if (/^BUILDING_/.test(terrain)) feat = 32;
                hex += feat.toString(16).padStart(2, '0');
            }
            return { f: hex, g: r };
        });
        return { w, h, rows: mapRows, rawRows: rows, localLegend };
    }

    for (const outpostFile of ['01_Outpost_Full.jsonc', '01_Outpost_Lite.jsonc']) {
        const map = buildOutpostMap(outpostFile);
        const clusters = Town.computeTownClusters(map, map.w, map.h, null);
        const buildings = clusters.filter((c) => c.kind === 'building');
        check(buildings.length >= 12 && clusters.length > 20, `${outpostFile}: extracts >=12 solid building rectangles & >20 total clusters (got bldgs=${buildings.length}, total=${clusters.length})`);

        let nonBldgCovered = 0;
        let spawnCovered = false;
        for (const c of buildings) {
            for (let y = c.minY; y <= c.maxY; y++) {
                for (let x = c.minX; x <= c.maxX; x++) {
                    const ch = map.rawRows[y][x];
                    const terrain = (map.localLegend[ch] && map.localLegend[ch].terrain) || 'FLOOR';
                    const isSolidBldg = terrain === 'PERMANENT' || /STORE|ARMOURY|WEAPON|TEMPLE|ALCHEMY|MAGIC|BLACK_MARKET|HOME|BOOKSTORE|MUSEUM|BUILDING_/.test(terrain);
                    if (!isSolidBldg) nonBldgCovered++;
                    if (x === 131 && y === 33) spawnCovered = true;
                }
            }
        }
        check(nonBldgCovered === 0, `${outpostFile}: zero non-building tiles covered by building roofs`);
        check(!spawnCovered, `${outpostFile}: spawn (131,33) has open sky`);
    }

    // 2. Verify UV attributes on roof/gable geometry & non-null roof tile textures (Western & Eastern)
    {
        const fullMap = buildOutpostMap('01_Outpost_Full.jsonc');
        const mockD3d = {
            scene: new THREE.Scene(),
            wallTex: new THREE.Texture(),
            wallNormal: new THREE.Texture(),
            permWallTex: new THREE.Texture(),
            permWallNormal: new THREE.Texture(),
            wallMaterial: { map: new THREE.Texture(), normalMap: new THREE.Texture() },
            permWallMaterial: { map: new THREE.Texture(), normalMap: new THREE.Texture() },
            townTimberMaterial: new THREE.MeshStandardMaterial(),
            townRoofMaterial: new THREE.MeshStandardMaterial({ map: null, normalMap: null })
        };
        const built = Town.buildTownArchitecture(mockD3d, fullMap, fullMap.w, fullMap.h, 0, 'hengband');
        check(built === true && mockD3d._townArchGroup, 'buildTownArchitecture builds Hengband town architecture group');

        const meshes = mockD3d._townArchGroup.children.filter((c) => c.isMesh);
        check(meshes.length > 0, 'buildTownArchitecture emits roof/gable meshes');
        for (const m of meshes) {
            const pos = m.geometry.attributes.position;
            const uv = m.geometry.attributes.uv;
            check(uv && uv.count === pos.count && uv.count > 0, 'Roof & gable geometries carry full UV coordinates');
        }
        check(Boolean(mockD3d.townRoofMaterial.map && mockD3d.townRoofMaterial.normalMap),
            'syncTownSharedMaterials binds non-null kawara roof map & normalMap for Hengband');
        check(mockD3d.townRoofMaterial._roofStyle === 'eastern', 'Hengband selects eastern kawara roof style');

        Town.syncTownSharedMaterials(mockD3d, THREE, 'angband');
        check(mockD3d.townRoofMaterial._roofStyle === 'western' && Boolean(mockD3d.townRoofMaterial.map && mockD3d.townRoofMaterial.normalMap),
            'Angband switches cleanly to western slate roof style with non-null textures');
    }
} else {
    console.log('SKIP: Hengband TownPreferences.jsonc not checked out (CI runner); testing syncTownSharedMaterials styles directly');
    const mockD3d = {
        wallTex: new THREE.Texture(),
        wallNormal: new THREE.Texture(),
        permWallTex: new THREE.Texture(),
        permWallNormal: new THREE.Texture(),
        wallMaterial: { map: new THREE.Texture(), normalMap: new THREE.Texture() },
        permWallMaterial: { map: new THREE.Texture(), normalMap: new THREE.Texture() },
        townTimberMaterial: new THREE.MeshStandardMaterial(),
        townRoofMaterial: new THREE.MeshStandardMaterial({ map: null, normalMap: null })
    };
    Town.syncTownSharedMaterials(mockD3d, THREE, 'hengband');
    check(Boolean(mockD3d.townRoofMaterial.map && mockD3d.townRoofMaterial.normalMap),
        'syncTownSharedMaterials binds non-null kawara roof map & normalMap for Hengband');
    check(mockD3d.townRoofMaterial._roofStyle === 'eastern', 'Hengband selects eastern kawara roof style');

    Town.syncTownSharedMaterials(mockD3d, THREE, 'angband');
    check(mockD3d.townRoofMaterial._roofStyle === 'western' && Boolean(mockD3d.townRoofMaterial.map && mockD3d.townRoofMaterial.normalMap),
        'Angband switches cleanly to western slate roof style with non-null textures');
}

// 3. Botanical tree & bush geometry builders + lightweight _loadPolyHavenTreeModel
{
    function MockD3D() {
        this.treeLeavesMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, alphaTest: 0.35 });
        this.treeTrunkMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
        this.polyHavenSets = new Map();
    }
    const envCtx = vm.createContext({ THREE, window: {}, globalThis: null, console });
    envCtx.globalThis = envCtx;
    vm.runInContext(readRel('server/public/js/dungeon3d-environment.js'), envCtx, { filename: 'dungeon3d-environment.js' });
    (envCtx.window.Dungeon3DEnvironment || envCtx.Dungeon3DEnvironment).attach(MockD3D);
    const d3dEnv = new MockD3D();

    const trunkGeo = d3dEnv.createBotanicalTreeTrunkGeometry();
    const canopyGeo = d3dEnv.createBotanicalTreeCanopyGeometry();
    const bushGeo = d3dEnv.createBotanicalBushGeometry();
    for (const [label, g] of [['trunk', trunkGeo], ['canopy', canopyGeo], ['bush', bushGeo]]) {
        check(g.attributes.position && g.attributes.normal && g.attributes.uv && g.attributes.color && g.index,
            `Botanical ${label} geometry includes position, normal, uv, color, index`);
    }
    const treeTris = (trunkGeo.index.count / 3) + (canopyGeo.index.count / 3);
    const bushTris = bushGeo.index.count / 3;
    check(treeTris > 40 && treeTris < 350, `Botanical tree triangle count is lightweight (${treeTris} < 350)`);
    check(bushTris > 20 && bushTris < 150, `Botanical bush triangle count is lightweight (${bushTris} < 150)`);

    d3dEnv._loadPolyHavenTreeModel();
    check(d3dEnv.treeLeavesMat.alphaTest === 0 && d3dEnv.treeLeavesMat.side === THREE.FrontSide,
        'Tree leaves material disables alpha-discard and BackSide double-rendering');
    const envSrc = readRel('server/public/js/dungeon3d-environment.js');
    const townSrc = readRel('server/public/js/dungeon3d-town.js');
    const botIdx = envSrc.indexOf('_loadPolyHavenEnvironmentModels');
    check(!envSrc.includes('pachira_aquatica_01'), 'dungeon3d-environment.js never loads pachira_aquatica_01.gltf at runtime');
    check(botIdx > 0 && !envSrc.slice(0, botIdx).includes('THREE.CylinderGeometry'), 'Botanical tree & bush builders use zero CylinderGeometry');
    check(!/THREE\.CylinderGeometry/.test(townSrc), 'dungeon3d-town.js uses zero CylinderGeometry');
}

// 4. Desktop GPU profile default, DPR idle guard, and Hengband sky/fog alignment
{
    const lmCtx = vm.createContext({
        window: { innerWidth: 1920, innerHeight: 1080, localStorage: { getItem: () => null } },
        document: {
            createElement() {
                return {
                    getContext() {
                        return {
                            RENDERER: 0x1F01,
                            VENDOR: 0x1F00,
                            getExtension: () => null,
                            getParameter: (p) => (p === 0x1F01 ? 'WebKit WebGL' : 'WebKit')
                        };
                    }
                };
            }
        },
        navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        globalThis: null
    });
    lmCtx.globalThis = lmCtx;
    vm.runInContext(readRel('server/public/js/dungeon3d-lightmap.js'), lmCtx, { filename: 'dungeon3d-lightmap.js' });
    const LM = lmCtx.window.Dungeon3DLightmap || lmCtx.Dungeon3DLightmap;
    const desktopGpu = LM.HardwareGpuProfile.detect();
    check(desktopGpu.gpuTier === 'performance', `Masked desktop WebGL defaults to performance tier (got ${desktopGpu.gpuTier})`);
    lmCtx.window.innerWidth = 390;
    const integratedGpu = LM.HardwareGpuProfile.detect();
    check(integratedGpu.gpuTier === 'integrated',
        `Small-screen fallback selects integrated tier (got ${integratedGpu.gpuTier})`);

    const tacCtx = vm.createContext({ THREE, window: {}, globalThis: null });
    tacCtx.globalThis = tacCtx;
    vm.runInContext(readRel('server/public/js/dungeon3d-tactical.js'), tacCtx, { filename: 'dungeon3d-tactical.js' });
    const Tac = tacCtx.window.Dungeon3DTactical || tacCtx.Dungeon3DTactical;
    const biome = Tac.resolveRealmBiomeProfile({ isHengband: () => true }, 0, 0, 'hengband');
    check(biome.bgColor === 0x19182c && biome.fogColor === 0x19182c, 'Hengband overworld fog & bg match sky horizon (0x19182c)');

    const d3dSrc = readRel('server/public/js/dungeon3d.js');
    check(d3dSrc.includes('Math.max(115, budget.farDistance || 115)'), 'dungeon3d.js enforces camera farDistance >= 115 for unclipped stars');
    check(d3dSrc.includes('u.uHorizonColor.value.setHex(0x19182c);'), 'dungeon3d.js Hengband sky horizon is 0x19182c');
    check(d3dSrc.includes('if (!this.renderGovernor.shouldRenderFrame(tNow)) {\n                this._fpsGovFrames = 0;') ||
        /if \(!this\.renderGovernor\.shouldRenderFrame\(tNow\)\)\s*\{\s*this\._fpsGovFrames = 0;/.test(d3dSrc),
        'dungeon3d.js resets _fpsGovFrames when renderGovernor throttles idle frames');
    const procSrc = readRel('server/public/js/dungeon3d-proc-textures.js');
    check(!procSrc.includes('_seedGridBuf'), 'dungeon3d-proc-textures.js no longer uses coarse 8x8 _seedGridBuf stretching');
    const appSrc = readRel('server/public/js/app.js');
    check(!appSrc.includes('hengbandLangMode'), 'app.js has no undeclared hengbandLangMode reference');
    check(appSrc.includes("activeRealm === 'hengband' && langMode !== 'jp'"), 'app.js checks langMode when auto-loading Hengband English dictionary on boot');
}

console.log(`test_v12_3_1_hengband_town_perf.js: PASS (${passed} checks)`);

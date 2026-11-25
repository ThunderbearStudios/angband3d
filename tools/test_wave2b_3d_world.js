#!/usr/bin/env node
/**
 * tools/test_wave2b_3d_world.js
 *
 * Wave 2B-1 Verification Suite:
 *  - Instanced hit-spark pool (2 InstancedMeshes/burst) & finish count reset
 *  - World PBR cacheTag sharing, FrontSide culling, upgraded swampMaterial, _shadersPrewarmed
 *  - Bounded LRU (max 64) + GlbPrototypePool disposal + _tintedMatPool refCount
 *  - Outdoor sunLight shadows + twilight sunColor, cur_light=0 darkness, light_fuel<=500 sputter, yaw shadow dirty
 *  - Status pills, #yasd-compass-tape, procedural locomotion idle/sleep guard, sighted ESP X-ray outline
 *  - 7 new terrain InstancedMeshes, door_states crossbars, 3 trap silhouettes, webs/runes, Sil-Q shafts
 *  - Hybrid itemRenderer split, rarity/BUC plinths,pile_count badges, off-hand lantern/torch, dual-wield swing
 *  - HUD door pulse (frontFeat === 2) & master-item-registry torch_pbr.glb / skull.gltf paths
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function createThreeMock() {
    let nextId = 1;
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
        addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
        dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
        lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
        negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
        applyEuler() { return this; }
        applyQuaternion() { return this; }
        applyMatrix4() { return this; }
        setFromMatrixPosition() { return this; }
        lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
        distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
        normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
        applyAxisAngle() { return this; }
        lerpVectors(a, b, t) { this.x = a.x + (b.x - a.x) * t; this.y = a.y + (b.y - a.y) * t; this.z = a.z + (b.z - a.z) * t; return this; }
        setY(y) { this.y = y; return this; }
        crossVectors(a, b) {
            this.x = a.y * b.z - a.z * b.y;
            this.y = a.z * b.x - a.x * b.z;
            this.z = a.x * b.y - a.y * b.x;
            return this;
        }
    }
    class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } setScalar(s) { this.x = s; this.y = s; return this; } clone() { return new Vector2(this.x, this.y); } }
    class Euler { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.order = 'XYZ'; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; } }
    class Quaternion { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } copy() { return this; } clone() { return new Quaternion(); } invert() { return this; } multiply() { return this; } premultiply() { return this; } setFromRotationMatrix() { return this; } setFromEuler() { return this; } slerp() { return this; } }
    class Matrix4 { constructor() { this.elements = new Float32Array(16); } identity() { return this; } makeBasis() { return this; } makeTranslation() { return this; } makeRotationX() { return this; } makeRotationY() { return this; } makeRotationZ() { return this; } makeScale() { return this; } compose() { return this; } multiplyMatrices() { return this; } multiply() { return this; } setPosition() { return this; } copy() { return this; } clone() { return new Matrix4(); } invert() { return this; } }
    class Color {
        constructor(h = 0xffffff) { this.r = 1; this.g = 1; this.b = 1; this.set(h); }
        set(v) { if (typeof v === 'number') return this.setHex(v); return this; }
        setHex(hex) { this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; return this; }
        setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
        setScalar(s) { this.r = s; this.g = s; this.b = s; return this; }
        setHSL(h, s, l) { this.r = l; this.g = l; this.b = l; return this; }
        getHSL(t) { t = t || { h: 0, s: 0, l: 0 }; t.h = 0; t.s = 0; t.l = 0.5; return t; }
        offsetHSL() { return this; }
        getHex() { return ((Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255)) >>> 0; }
        copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
        clone() { const c = new Color(); c.copy(this); return c; }
        multiply(c) { this.r *= c.r; this.g *= c.g; this.b *= c.b; return this; }
        multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
        lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
        lerpColors(a, b, t) { this.r = a.r + (b.r - a.r) * t; this.g = a.g + (b.g - a.g) * t; this.b = a.b + (b.b - a.b) * t; return this; }
    }
    class Object3D {
        constructor() {
            this.id = nextId++; this.uuid = `uuid_${this.id}`;
            this.children = []; this.parent = null; this.position = new Vector3(); this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1); this.quaternion = new Quaternion(); this.matrix = new Matrix4();
            this.matrixWorld = new Matrix4(); this.visible = true; this.userData = {}; this.renderOrder = 0;
            this.layers = { set() {}, enable() {} };
        }
        add(...objs) { for (const o of objs) { if (o) { o.parent = this; this.children.push(o); } } return this; }
        remove(o) { const idx = this.children.indexOf(o); if (idx >= 0) { this.children.splice(idx, 1); o.parent = null; } return this; }
        lookAt() {}
        updateMatrix() {}
        updateMatrixWorld() {}
        getWorldDirection(t) { return (t || new Vector3()).set(0, 0, -1); }
        getWorldQuaternion(t) { return t || new Quaternion(); }
        getWorldScale(t) { return (t || new Vector3()).set(1, 1, 1); }
        getObjectByName(n) { return this.children.find(c => c.name === n) || null; }
        traverse(fn) { fn(this); for (const c of this.children) { if (c && typeof c.traverse === 'function') c.traverse(fn); } }
        clone(rec = true) {
            const c = new Object3D();
            c.name = this.name; c.geometry = this.geometry; c.material = this.material;
            c.isMesh = this.isMesh; c.isSkinnedMesh = this.isSkinnedMesh;
            if (rec) for (const ch of this.children) if (ch.clone) c.add(ch.clone(true));
            return c;
        }
    }
    class BufferAttribute { constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.count = arr.length / itemSize; this.needsUpdate = false; } setUsage() {} getX(i) { return this.array[i * this.itemSize] || 0; } getY(i) { return this.array[i * this.itemSize + 1] || 0; } getZ(i) { return this.array[i * this.itemSize + 2] || 0; } setXYZ(i, x, y, z) { const b = i * this.itemSize; this.array[b] = x; this.array[b + 1] = y; this.array[b + 2] = z; } setY(i, y) { this.array[i * this.itemSize + 1] = y; } setXY(i, x, y) { const b = i * this.itemSize; this.array[b] = x; this.array[b + 1] = y; } clone() { return new BufferAttribute(new Float32Array(this.array), this.itemSize); } }
    class Float32BufferAttribute extends BufferAttribute { constructor(arr, itemSize) { super(arr instanceof Float32Array ? arr : new Float32Array(arr), itemSize); } }
    class BufferGeo {
        constructor() {
            this.attributes = {
                position: new BufferAttribute(new Float32Array(12), 3),
                normal: new BufferAttribute(new Float32Array(12), 3),
                uv: new BufferAttribute(new Float32Array(8), 2)
            };
            this.index = null;
            this.boundingBox = { min: new Vector3(-1, 0, -1), max: new Vector3(1, 2, 1) };
            this.boundingSphere = { center: new Vector3(), radius: 2 };
            this.disposed = false;
        }
        setAttribute(k, v) { this.attributes[k] = v; return this; }
        getAttribute(k) { return this.attributes[k]; }
        deleteAttribute(k) { delete this.attributes[k]; return this; }
        setIndex(idx) { this.index = Array.isArray(idx) ? new BufferAttribute(new Uint16Array(idx), 1) : idx; return this; }
        setDrawRange() {}
        toNonIndexed() { return this; }
        computeVertexNormals() { return this; }
        computeBoundingBox() { this.boundingBox = { min: new Vector3(-1, 0, -1), max: new Vector3(1, 2, 1) }; return this; }
        computeBoundingSphere() { this.boundingSphere = { center: new Vector3(), radius: 2 }; return this; }
        center() { return this; }
        normalize() { return this; }
        rotateX() { return this; }
        rotateY() { return this; }
        rotateZ() { return this; }
        scale() { return this; }
        translate() { return this; }
        clone() {
            const g = new BufferGeo();
            for (const [k, v] of Object.entries(this.attributes)) {
                g.attributes[k] = (v && typeof v.clone === 'function') ? v.clone() : v;
            }
            g.index = this.index;
            return g;
        }
        dispose() { this.disposed = true; }
    }
    class InstancedMesh extends Object3D {
        constructor(geo, mat, count) {
            super(); this.isInstancedMesh = true; this.geometry = geo || new BufferGeo(); this.material = mat;
            this.count = 0; this.maxCount = count; this.frustumCulled = true;
            this.instanceMatrix = { count, setUsage() {}, needsUpdate: false, updateRange: { offset: 0, count: 0 } };
            this.instanceColor = null;
        }
        setMatrixAt() {}
        setColorAt() {}
    }
    class Mesh extends Object3D {
        constructor(geo, mat) { super(); this.isMesh = true; this.geometry = geo || new BufferGeo(); this.material = mat; }
    }
    class Sprite extends Object3D {
        constructor(mat) { super(); this.isSprite = true; this.material = mat || {}; }
    }
    class Material {
        constructor(opts = {}) {
            this.id = nextId++; this.uuid = `mat_${this.id}`;
            Object.assign(this, opts);
            this.userData = opts.userData ? Object.assign({}, opts.userData) : {};
            if (!(this.color instanceof Color)) this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
            if (!(this.emissive instanceof Color)) this.emissive = new Color(opts.emissive !== undefined ? opts.emissive : 0x000000);
            if (!(this.normalScale instanceof Vector2)) this.normalScale = new Vector2(1, 1);
            this.disposed = false;
        }
        clone() { const m = new Material(this); m.id = nextId++; m.uuid = `mat_${m.id}`; m.userData = {}; m.color = this.color.clone(); m.emissive = this.emissive.clone(); m.normalScale = this.normalScale.clone(); return m; }
        dispose() { this.disposed = true; }
    }
    class Light extends Object3D {
        constructor(color = 0xffffff, intensity = 1) {
            super(); this.color = new Color(color); this.intensity = intensity;
            this.target = new Object3D();
            this.shadow = { mapSize: new Vector2(512, 512), camera: { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 50, updateProjectionMatrix() {} }, bias: 0 };
        }
    }
    class Texture { constructor() { this.needsUpdate = false; this.repeat = new Vector2(); this.offset = new Vector2(); } dispose() {} }
    return {
        Vector3, Vector2, Euler, Quaternion, Matrix4, Color, Object3D,
        Group: class extends Object3D {},
        Scene: class extends Object3D { constructor() { super(); this.fog = null; this.environment = null; this.background = new Color(0x000000); } },
        PerspectiveCamera: class extends Object3D { constructor() { super(); this.fov = 80; this.aspect = 1.6; } updateProjectionMatrix() {} },
        BufferGeometry: BufferGeo,
        BoxGeometry: class extends BufferGeo {},
        PlaneGeometry: class extends BufferGeo {},
        SphereGeometry: class extends BufferGeo {},
        CylinderGeometry: class extends BufferGeo {},
        ConeGeometry: class extends BufferGeo {},
        TorusGeometry: class extends BufferGeo {},
        OctahedronGeometry: class extends BufferGeo {},
        DodecahedronGeometry: class extends BufferGeo {},
        IcosahedronGeometry: class extends BufferGeo {},
        RingGeometry: class extends BufferGeo {},
        LatheGeometry: class extends BufferGeo {},
        TubeGeometry: class extends BufferGeo {},
        ExtrudeGeometry: class extends BufferGeo {},
        EdgesGeometry: class extends BufferGeo {},
        Shape: class { constructor() {} moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} absarc() {} closePath() {} },
        CatmullRomCurve3: class { constructor(pts) { this.points = pts || []; } },
        Bone: class extends Object3D {},
        Skeleton: class { constructor(bones) { this.bones = bones || []; } },
        AnimationMixer: class { constructor() {} clipAction() { return { play() {}, stop() {}, reset() {}, setLoop() {}, setEffectiveWeight() {}, fadeIn() {}, fadeOut() {} }; } update() {} },
        Raycaster: class { set() {} setFromCamera() {} intersectObjects() { return []; } },
        GLTFLoader: class { load() {} },
        OBJLoader: class { load() {} },
        BufferAttribute,
        Float32BufferAttribute,
        InstancedBufferAttribute: class extends BufferAttribute { constructor(a, s) { super(a, s); this.isInstancedBufferAttribute = true; this.updateRange = { offset: 0, count: 0 }; } },
        InstancedMesh, Mesh, Sprite,
        MeshStandardMaterial: class extends Material {},
        MeshLambertMaterial: class extends Material {},
        MeshPhongMaterial: class extends Material {},
        MeshBasicMaterial: class extends Material {},
        MeshDepthMaterial: class extends Material {},
        LineBasicMaterial: class extends Material {},
        Line: class extends Object3D {},
        LineSegments: class extends Object3D {},
        SpriteMaterial: class extends Material { constructor(opts = {}) { super(opts); this.map = opts.map || { dispose() {} }; } },
        ShaderMaterial: class extends Material { constructor(opts = {}) { super(opts); this.uniforms = opts.uniforms || {}; } },
        PointsMaterial: class extends Material {},
        Points: class extends Object3D {},
        DirectionalLight: Light, PointLight: Light, SpotLight: Light, AmbientLight: Light, HemisphereLight: Light,
        FogExp2: class { constructor(c, d) { this.color = new Color(c); this.density = d; } },
        CanvasTexture: Texture,
        DataTexture: Texture,
        Texture,
        LoadingManager: class { setURLModifier() {} },
        TextureLoader: class { load(url, onLoad) { const t = new Texture(); if (onLoad) onLoad(t); return t; } },
        Box3: class { setFromObject() { return this; } getSize(t) { return t.set(1, 1, 1); } getCenter(t) { return t.set(0, 0.5, 0); } },
        FrontSide: 0, BackSide: 1, DoubleSide: 2, DynamicDrawUsage: 35048, AdditiveBlending: 2,
        PCFSoftShadowMap: 2, ACESFilmicToneMapping: 4, sRGBEncoding: 3001, SRGBColorSpace: 'srgb', LinearSRGBColorSpace: 'srgb-linear',
        NoColorSpace: '', RGBAFormat: 1023, UnsignedByteType: 1009, EquirectangularReflectionMapping: 303,
        RepeatWrapping: 1000, LinearFilter: 1006, LinearMipmapLinearFilter: 1008, LoopOnce: 2200
    };
}

function createDomMock() {
    const els = new Map();
    const makeGrad = () => ({ addColorStop() {} });
    const makeCtx = () => ({
        clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, rect() {}, roundRect() {},
        moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage() {},
        createLinearGradient: makeGrad, createRadialGradient: makeGrad,
        measureText: () => ({ width: 40 }),
        strokeText() {}, fillText() {},
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {}
    });
    const makeEl = (tag, id = '') => {
        const el = {
            tagName: tag.toUpperCase(), id, style: { cssText: '', display: '' }, innerHTML: '', children: [],
            width: 384, height: 110,
            classList: { contains: () => true, add() {}, remove() {} },
            appendChild(c) { this.children.push(c); if (c.id) els.set(c.id, c); return c; },
            addEventListener() {},
            getContext() { return makeCtx(); }
        };
        if (id) els.set(id, el);
        return el;
    };
    const body = makeEl('body');
    const doc = {
        hidden: false, body,
        createElement: (t) => makeEl(t),
        getElementById: (id) => els.get(id) || null
    };
    return { document: doc, elements: els };
}

// 1. HUD + Master Item Registry checks
{
    const hudSrc = read('server/public/js/hud.js');
    assert.ok(hudSrc.includes('isDoorInFront = frontFeat === 2'), 'hud.js must pulse door button only for closed doors (frontFeat === 2)');
    assert.strictEqual(hudSrc.includes('frontFeat === 3 || frontFeat === 4'), false, 'hud.js must not treat open/broken doors as closed doors');

    const reg = require(path.join(ROOT, 'server/public/js/master-item-registry.js'));
    assert.strictEqual(reg.POLYHAVEN_ITEM_GLTF_PATHS.item_torch, '/assets/models/items/torch_pbr.glb');
    assert.strictEqual(reg.POLYHAVEN_ITEM_GLTF_PATHS.item_corpse, '/assets/models/items/skull.gltf');
    assert.ok(fs.existsSync(path.join(ROOT, 'server/public/assets/models/items/torch_pbr.glb')), 'torch_pbr.glb must exist on disk');
    assert.ok(fs.existsSync(path.join(ROOT, 'server/public/assets/models/items/skull.gltf')), 'skull.gltf must exist on disk');
    const corpseRes = reg.resolveItem('human corpse', '%', 'angband');
    assert.strictEqual(corpseRes.floorKey, 'item_corpse');
}

// 2. GlbPrototypePool eviction disposal check
{
    const THREE = createThreeMock();
    const sandbox = { THREE, window: {}, console };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-model-governor.js'), sandbox);
    const pool = new sandbox.Dungeon3DModelGovernor.GlbPrototypePool(8);
    const g1 = new THREE.BufferGeometry();
    const m1 = new THREE.MeshStandardMaterial();
    const t1 = new THREE.Texture(); m1.map = t1;
    const obj1 = new THREE.Mesh(g1, m1);
    pool.registerPrototype('k0', obj1);
    for (let i = 1; i <= 8; i++) {
        pool.registerPrototype(`k${i}`, new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()));
    }
    assert.strictEqual(pool.disposedCount, 1, 'GlbPrototypePool eviction must increment disposedCount');
    assert.strictEqual(g1.disposed, true, 'Evicted prototype geometry must be disposed');
    assert.strictEqual(m1.disposed, true, 'Evicted prototype material must be disposed');
}

// 3. Proc Textures FrontSide culling & upgraded swampMaterial check
{
    const THREE = createThreeMock();
    const dom = createDomMock();
    const sandbox = { THREE, document: dom.document, window: {}, console, procCreateShadowTexture: () => new THREE.Texture() };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-proc-textures.js'), sandbox);
    const mockD3d = {
        scene: new THREE.Scene(),
        renderer: { capabilities: { getMaxAnisotropy: () => 4 }, domElement: { parentElement: dom.document.body, width: 1280, height: 720, clientWidth: 1280, clientHeight: 720 } }
    };
    sandbox.Dungeon3DProcTextures.attach({ prototype: mockD3d });
    mockD3d.initTextures();
    for (const k of ['floorMaterial', 'grassMaterial', 'dirtMaterial', 'waterMaterial', 'deepWaterMaterial', 'swampMaterial', 'lavaMaterial', 'lavaCooledMaterial']) {
        assert.strictEqual(mockD3d[k].side, THREE.FrontSide, `${k} must use THREE.FrontSide culling`);
    }
    assert.strictEqual(mockD3d.swampMaterial.roughness, 0.34, 'swampMaterial must use upgraded shiny marsh roughness 0.34');
    assert.strictEqual(mockD3d.swampMaterial.metalness, 0.14, 'swampMaterial must use upgraded metalness 0.14');
}

// 4. Tactical module checks: world PBR cacheTag, status pills, compass tape, locomotion, sighted X-ray ESP, extractHandItems
{
    const THREE = createThreeMock();
    const dom = createDomMock();
    const sandbox = { THREE, document: dom.document, window: {}, console, performance: { now: () => 1000 } };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-tactical.js'), sandbox);
    const Tac = sandbox.Dungeon3DTactical;

    // 4a. World PBR cacheTag sharing
    const mA = new THREE.MeshStandardMaterial();
    const mB = new THREE.MeshStandardMaterial();
    const fakeD3d = { _lastContextualTexSet: null, renderBudget: { tier: 'desktop' } };
    Tac.applyWorldPbrShader(fakeD3d, mA, 'wall', 0);
    Tac.applyWorldPbrShader(fakeD3d, mB, 'wall', 0);
    assert.strictEqual(mA.customProgramCacheKey(), mB.customProgramCacheKey(), 'Two materials with same kind/veinMode must share program cache key');

    // 4b. Status pills & compass tape
    const labelsDrawn = [];
    const pillCtx = { beginPath() {}, roundRect() {}, rect() {}, fill() {}, stroke() {}, fillText: (txt) => labelsDrawn.push(txt), font: '' };
    const pillH = Tac.drawComposableStatusPills(pillCtx, { attitude: 'pet', unwary: true, paralyzed: true, slow: true }, 6, false, false, false);
    assert.ok(pillH > 0, 'drawComposableStatusPills must return row height when pills present');
    const joined = labelsDrawn.join(' ');
    assert.ok(joined.includes('Pet') && joined.includes('Unwary') && joined.includes('Held') && joined.includes('Slow'), `Status pills missing labels: ${joined}`);
    labelsDrawn.length = 0;
    Tac.drawComposableStatusPills(pillCtx, { attitude: 'pet', unwary: true, paralyzed: true, slow: true, summoner: true, breathes: true }, 6, false, false, false);
    assert.strictEqual(labelsDrawn.length, 5, 'Status pills must cap at 5 and compact to icons when >4 pills present');
    assert.ok(labelsDrawn.includes('📯'), '5-pill compact row must include summoner horn icon');

    const d3dComp = {
        playerGridX: 5, playerGridY: 5,
        renderer: { domElement: { parentElement: dom.document.body } },
        _stairCompassPositions: [{ x: 5, y: 2, dir: 'down' }]
    };
    Tac.updateCompassTape(d3dComp, { phase: 'play', player: { x: 5, y: 5 }, monsters: [{ x: 4, y: 2, unique: true, race: 'Sauron' }] }, new THREE.PerspectiveCamera());
    const tapeEl = dom.document.getElementById('yasd-compass-tape');
    assert.ok(tapeEl && tapeEl.innerHTML.includes('▼') && tapeEl.innerHTML.includes('♦'), '#yasd-compass-tape must render stair down and boss pips');

    // 4c. Procedural locomotion skips asleep & paralyzed
    const sleepEnt = { creatureMesh: { position: { y: 0 }, rotation: { x: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1) }, templateKey: 'bestiary_dragon', monsterData: { asleep: true, race: 'red dragon' } };
    Tac.updateProceduralLocomotion(sleepEnt, 0.016, 1.5);
    assert.strictEqual(sleepEnt.creatureMesh.rotation.z, 0, 'Sleeping dragon must stay still');
    const heldEnt = { creatureMesh: { position: { y: 0 }, rotation: { x: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1) }, templateKey: 'bestiary_spider', monsterData: { paralyzed: true, race: 'giant spider' } };
    Tac.updateProceduralLocomotion(heldEnt, 0.016, 1.5);
    assert.strictEqual(heldEnt.creatureMesh.rotation.z, 0, 'Paralyzed spider must stay still');

    // 4d. Sighted X-ray ESP outline (depthTest=false, renderOrder=5) + restore
    const espMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    const espEnt = new THREE.Group();
    espEnt.add(espMesh);
    espEnt.nameplate = new THREE.Sprite();
    const espMon = { x: 8, y: 8, race: 'Orc', telepathy: true, unlit: true };
    Tac.applyBlindMonsterState(fakeD3d, espEnt, espMon, { x: 5, y: 5, telepathy: true }, 5, 5, 0);
    assert.strictEqual(espMesh.renderOrder, 5, 'Sighted ESP out-of-LOS monster must render at renderOrder 5');
    assert.strictEqual(espMesh.material.depthTest, false, 'Sighted ESP out-of-LOS monster must use depthTest=false X-ray');
    assert.strictEqual(espMon._espPerceived, true);
    espMon.unlit = false;
    Tac.applyBlindMonsterState(fakeD3d, espEnt, espMon, { x: 5, y: 5, telepathy: true }, 5, 5, 0);
    assert.strictEqual(espMesh.renderOrder, 0, 'Restoring ESP must reset renderOrder to 0');

    // 4e. extractHandItems & resolveOffhandLightKey
    const hands = Tac.extractHandItems({ weapon_item: 'Long Sword', equipment: [{ slot: 'f', slot_name: 'light', name: 'Brass Lantern of Vision', tval: 39 }] });
    assert.strictEqual(hands.lightItem, 'Brass Lantern of Vision');
    assert.strictEqual(Tac.resolveOffhandLightKey(hands.lightItem), 'lantern');
    assert.strictEqual(Tac.resolveOffhandLightKey('Wooden Torch'), 'torch');
}

// 5. Full Dungeon3D Integration Checks (Sparks, LRU, Sun/Torch Lighting, Terrain, Items/Viewmodel)
{
    const THREE = createThreeMock();
    const dom = createDomMock();
    const sandbox = {
        THREE,
        document: dom.document,
        performance: { now: () => 2000 },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        matchMedia: () => ({ matches: false }),
        location: { search: '', hostname: 'localhost' },
        fetch: () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }),
        MASTER_ITEM_REGISTRY: require(path.join(ROOT, 'server/public/js/master-item-registry.js')),
        DeviceProfile: { getTier: () => 'desktop', isHandheld: () => false },
        console, Set, Map, Float32Array, Uint8Array, Math, Date, Promise
    };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-tactical.js'), sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-vfx.js'), sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-environment.js'), sandbox);
    vm.runInContext(read('server/public/js/dungeon3d-proc-textures.js'), sandbox);
    vm.runInContext(read('server/public/js/dungeon3d.js'), sandbox);

    assert.strictEqual(sandbox.window.GRAPHICS_CONFIG.itemRenderer, 'hybrid', 'Default itemRenderer must be hybrid');

    const d = new sandbox.Dungeon3D('game-canvas', { deferGpuInit: true, realmHint: 'silq' });
    d.scene = new THREE.Scene();
    d.camera = new THREE.PerspectiveCamera();
    d.renderer = {
        capabilities: { getMaxAnisotropy: () => 4 },
        domElement: { parentElement: dom.document.body, width: 1280, height: 720, clientWidth: 1280, clientHeight: 720 },
        compileCalls: 0, compile() { this.compileCalls++; }, setPixelRatio() {}, setSize() {}, render() {},
        shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false }, toneMappingExposure: 1
    };
    d.renderBudget = { gpuTier: 'discrete', enableFillLight: true };
    d._enableDynamicShadows = true;
    d.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    d.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    d.sunLight = new THREE.DirectionalLight(0xb3ccfa, 0.95);
    d.torchLight = new THREE.PointLight(0xffdc99, 1.48, 16.0);
    d.torchFillLight = new THREE.PointLight(0xff7722, 0.35, 8.0);
    d.torchBaseColor = new THREE.Color(0xffdc99);
    d.torchLowColor = new THREE.Color(0xffaa55);
    d.initTextures();
    d.initMeshes();
    d.initViewmodel();
    d.initModelResolvers();
    d._gpuInitialized = true;
    d.shadowDirtyCalls = 0;
    d.markShadowsDirty = () => { d.shadowDirtyCalls++; };

    // 5a. 7 new terrain InstancedMeshes present
    for (const mName of ['trapPitMesh', 'trapRuneMesh', 'webMesh', 'runeMesh', 'doorLockMesh', 'specialShopDoorMesh', 'shaftRimMesh']) {
        assert.ok(d[mName] && d[mName].isInstancedMesh, `Dungeon3D must initialize ${mName}`);
    }

    // 5b. updateMap wiring: door_states, special building, traps, web, rune, Sil-Q shaft, stair compass, cur_light=0, sunColor
    const makeRow = (str, featArr, attrArr) => ({
        g: str,
        f: featArr.map(n => n.toString(16).padStart(2, '0')).join(''),
        a: attrArr.map(n => n.toString(16).padStart(2, '0')).join(''),
        l: 'f'.repeat(str.length)
    });
    const mapData = {
        w: 7, h: 3, depth: 0,
        door_states: [{ x: 1, y: 1, s: 'locked' }],
        rows: [
            makeRow('#######', [21, 21, 21, 21, 21, 21, 21], [1, 1, 1, 1, 1, 1, 1]),
            makeRow('.+B^;^>', [1, 2, 32, 46, 56, 57, 6], [1, 7, 1, 2, 8, 14, 11]),
            makeRow('#######', [21, 21, 21, 21, 21, 21, 21], [1, 1, 1, 1, 1, 1, 1])
        ]
    };
    d._gpuInitialized = true;
    d.realm = 'silq';
    d.updateDungeon({
        map: mapData,
        player: { x: 0, y: 1, depth: 0, cur_light: 0, light_fuel: 250 },
        monsters: [], objects: []
    });
    assert.strictEqual(d.doorLockMesh.count, 1, 'Locked door must emit doorLockMesh');
    assert.strictEqual(d.specialShopDoorMesh.count, 1, 'Outdoor feat 32 must emit specialShopDoorMesh');
    assert.strictEqual(d.trapPitMesh.count, 1, 'Feat 46 trap must emit trapPitMesh');
    assert.strictEqual(d.webMesh.count, 1, 'Feat 56 web must emit webMesh');
    assert.strictEqual(d.runeMesh.count, 1, 'Feat 57 rune must emit runeMesh');
    assert.strictEqual(d.shaftRimMesh.count, 1, 'Sil-Q amber stair must emit shaftRimMesh');
    assert.strictEqual(d._stairCompassPositions.length, 1, 'updateDungeon must collect stair compass positions');
    assert.strictEqual(d.renderer.compileCalls, 1, 'updateDungeon must prewarm shaders once via renderer.compile');
    assert.strictEqual(d.sunLight.color.getHex(), 0xffcca0, 'Sil-Q outdoor town must apply biome.sunColor');
    assert.strictEqual(d.sunLight.castShadow, true, 'Outdoors with _enableDynamicShadows must enable sunLight.castShadow');

    // Indoors cur_light = 0 + low fuel
    mapData.depth = 3;
    d._lastTerrainSig = '';
    d.updateDungeon({
        map: mapData,
        player: { x: 0, y: 1, depth: 3, cur_light: 0, light_fuel: 250 },
        monsters: [], objects: []
    });
    assert.strictEqual(d.sunLight.castShadow, false, 'Indoors must disable sunLight.castShadow');
    assert.strictEqual(d.torchRadius, 0, 'cur_light=0 must preserve torchRadius=0');
    assert.ok(d._zeroLightDimScale < 0.3, 'cur_light=0 indoors must set low _zeroLightDimScale');
    assert.strictEqual(d._lightFuel, 250, 'light_fuel must be captured');

    // Yaw rotation triggers markShadowsDirty + low fuel lerp
    const beforeDirty = d.shadowDirtyCalls;
    d.camera.rotation.y = 0.5;
    d._gpuInitialized = true;
    d.targetTorchEnergy = 2.0;
    d.animate();
    assert.ok(d.shadowDirtyCalls > beforeDirty, 'Pure yaw rotation must mark shadows dirty');
    assert.ok(d.torchLight.color.r > 0.9 && d.torchLight.color.g < d.torchBaseColor.g + 0.01, 'Low fuel must shift torchLight color');

    // 5c. Instanced hit sparks pool & tick
    d._initHitSparkPool();
    assert.ok(d._hitSparkPool[0].instanced && d._hitSparkPool[0].streakInstMesh && d._hitSparkPool[0].sparkInstMesh);
    d.spawnHitSparks(new THREE.Vector3(0, 1, 0), 0xffaa00, 12);
    assert.strictEqual(d._activeHitSparks.length, 1);
    assert.ok(d._activeHitSparks[0].streakInstMesh.count > 0);
    d._activeHitSparks[0].elapsed = 99; // force finish on next animate
    d.animate();
    assert.strictEqual(d._activeHitSparks.length, 0, 'Expired instanced hit spark must return to pool');
    assert.strictEqual(d._hitSparkPool[d._hitSparkPool.length - 1].streakInstMesh.count, 0);

    // 5d. Hybrid itemRenderer split + rarity plinths + pile_count badge + LRU cap
    assert.strictEqual(d._shouldUse3DItemModel('item_longsword', 'hybrid'), true, 'Sword must use 3D GLTF in hybrid');
    assert.strictEqual(d._shouldUse3DItemModel('ph_potion_bottle', 'hybrid'), false, 'Potion must use Shockbolt billboard in hybrid');
    assert.strictEqual(d._shouldUse3DItemModel('ph_potion_bottle', 'classic'), true, 'Potion must use 3D GLTF in classic');
    assert.strictEqual(d._shouldUse3DItemModel('item_longsword', 'billboard'), false, 'Sword must use billboard in billboard mode');

    d.createDamageNumberSprite = (txt) => { const sp = new THREE.Sprite(); sp._txt = txt; return sp; };
    d.updateItems([{ x: 0, y: 1, name: 'Ring of Power', glyph: '=', attr: 11, artifact: true, pile_count: 3 }], { x: 0, y: 1, depth: 3 });
    assert.strictEqual(d.items.size, 1);
    const itEnt = [...d.items.values()][0];
    assert.ok(itEnt.rarityPlinth && itEnt.rarityPlinth.material === d._plinthMatArtifact, 'Artifact item must receive gold rarity plinth');
    assert.ok(itEnt._stackIndicatorMesh && itEnt._stackIndicatorMesh._txt === '+2', 'pile_count=3 must attach +2 stack badge');

    // LRU cap=64 check
    const lruMap = new Map();
    for (let i = 0; i < 70; i++) {
        const obj = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
        d._touchAndEvictLru(lruMap, `k${i}`, obj, 64, (k) => k === 'k0');
    }
    assert.strictEqual(lruMap.size, 64, 'LRU cache must be bounded at 64 entries');
    assert.strictEqual(lruMap.has('k0'), true, 'Protected key must never be evicted by LRU');

    // Dual-wield alternation check
    d._isOffhandDualWield = true;
    d._swingOffhandNext = false;
    d.triggerAttackAnimation(false);
    assert.strictEqual(d._swingOffhandNext, true);
    d._lastInputAttackMs = 0;
    d.triggerAttackAnimation(false);
    assert.strictEqual(d._swingOffhandNext, false);
}

console.log('test_wave2b_3d_world.js: ALL ASSERTIONS PASSED');

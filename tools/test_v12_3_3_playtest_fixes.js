#!/usr/bin/env node
/**
 * tools/test_v12_3_3_playtest_fixes.js
 * Regression test suite for v12.3.3 Playtest Overhaul:
 *  1. Sketch Vertex/Model-Alias & non-HTTP-200 error messaging
 *  2. Bidirectional /api/tts Edge->Gemini Vertex fallback & AudioContext.resume()
 *  3. HUD Message Log deduplication & 80-col truncation suppression
 *  4. Town roofs, flush wall seating, dark vertical timber & smooth quintic sky
 *  5. Realistic elongated predatory beasts, GLB mirror parity & canine routing
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function parseGlb(buf) {
    const jsonLen = buf.readUInt32LE(12);
    return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

function testSketchAndTtsFixes() {
    const sketchSrc = fs.readFileSync(path.join(ROOT, 'server/src/sketch-service.js'), 'utf8');
    const serverSrc = fs.readFileSync(path.join(ROOT, 'server/src/server.js'), 'utf8');
    const cmSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/chronicle/chronicle-manager.js'), 'utf8');
    const caSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/chronicle/chronicle-audio.js'), 'utf8');

    const sketchService = require(path.join(ROOT, 'server/src/sketch-service.js'));
    assert.strictEqual(sketchService.normalizeSketchModelAlias('gemini-nano-banana-2.1'), 'gemini-3.1-flash-image');
    assert.strictEqual(sketchService.normalizeSketchModelAlias('gemini-3.1-flash-image-preview'), 'gemini-3.1-flash-image');
    assert(sketchSrc.includes('error: `AI sketch unavailable (${failReason})`'), 'sketch-service fallback must expose descriptive error string');

    assert(serverSrc.includes('_gcpAuthProbedOnce'), 'server.js must cache initial gcloud auth probe');
    assert(serverSrc.includes("process.platform === 'win32'"), 'server.js runGcloudCmd must handle win32 cmd.exe wrapper');
    assert(serverSrc.includes('hasVertexCandidate()'), 'server.js must gate Vertex failover on hasVertexCandidate()');
    assert(serverSrc.includes('fallbackFromEdgeToGemini'), 'server.js must support bidirectional Edge->Gemini Vertex TTS fallback');

    assert(!cmSrc.includes('AI UNAVAILABLE: HTTP 200'), 'chronicle-manager must never display HTTP 200 on sketch fallback');
    assert(cmSrc.includes("res.ok ? 'AI sketch unavailable' : `HTTP ${res.status}`"), 'chronicle-manager must not label HTTP 200 fallback as HTTP 200');
    assert(cmSrc.includes('(json.error && json.error.message)'), 'chronicle-manager must extract real error reason');
    assert(caSrc.includes("this.ctx.state === 'suspended'"), 'chronicle-audio must resume suspended AudioContext before source.start');
}

function testHudMessageDeduplication() {
    const hudSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/hud.js'), 'utf8');
    const sandbox = {
        console,
        window: {
            HUD_CONFIG: {},
            addEventListener: () => {}
        },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
            addEventListener: () => {}
        },
        setTimeout,
        clearTimeout,
        requestAnimationFrame: (fn) => setTimeout(fn, 16)
    };
    sandbox.window.window = sandbox.window;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(hudSrc, sandbox);
    const WebHUD = sandbox.window.WebHUD;
    const proto = WebHUD.prototype;

    assert.strictEqual(proto._isRedundantTermRow0('Welcome to the Town!', [{ text: 'Welcome to the Town!' }], []), true);
    // 80-col DCSS altar truncation
    assert.strictEqual(
        proto._isRedundantTermRow0(
            'You kneel at the consecrated altar. A soothing radiance lifts 0 curses from your',
            [{ text: 'You kneel at the consecrated altar. A soothing radiance lifts 0 curses from your pack.' }],
            []
        ),
        true,
        '80-col prefix truncation must be treated as redundant'
    );
    // FrogComposBand multi-message row0 concatenation
    assert.strictEqual(
        proto._isRedundantTermRow0(
            'You have a Potion of Speed (b). You have 16 Iron Spikes (2/2) (c).',
            [
                { text: 'You have 7 Rations of Food (a).' },
                { text: 'You have a Potion of Speed (b).' },
                { text: 'You have 16 Iron Spikes (2/2) (c).' }
            ],
            []
        ),
        true,
        'Multi-message concatenation must be treated as redundant'
    );
    // Sil-Q 3x identical repetition
    assert.strictEqual(
        proto._isRedundantTermRow0(
            'The Wolf notices you. The Wolf notices you. The Wolf notices you.',
            [{ text: 'The Wolf notices you.' }],
            []
        ),
        true,
        'Sil-Q repeated message concatenation must be treated as redundant'
    );
    // FrogComposBand mid-string 80-col wrapped slice of combined message
    assert.strictEqual(
        proto._isRedundantTermRow0(
            'You have 5 Potions of Cure Light Wounds (b). You have 4 Scrolls of',
            [{ text: 'You have 6 Rations of Food (a). You have 5 Potions of Cure Light Wounds (b). You have 4 Scrolls of Phase Door (c).' }],
            []
        ),
        true,
        'FrogComposBand mid-string 80-col wrapped slice must be treated as redundant'
    );
    // Non-redundant interactive prompt
    assert.strictEqual(
        proto._isRedundantTermRow0(
            'Really quit? [y/n]',
            [{ text: 'The Wolf notices you.' }],
            []
        ),
        false,
        'Distinct interactive prompts must pass through'
    );
    assert(hudSrc.includes('resetRow0Raw'), 'hud.js must initialize lastTermRow0 on reset if row 0 is already redundant');
}

function testTownRoofsTimberAndSky() {
    const townSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-town.js'), 'utf8');
    const procSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d-proc-textures.js'), 'utf8');
    const d3dSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
    const Town = require(path.join(ROOT, 'server/public/js/dungeon3d-town.js'));

    // Build synthetic 16x16 town with a 5x2 interior building (ridgeAlongX), a 2x5 building (ridgeAlongZ), a 1x6 interior wall, and a storeless 2x10 moat wall
    const w = 16, h = 16;
    const hexFeat = (f) => f.toString(16).padStart(2, '0');
    const gridF = Array.from({ length: h }, () => Array(w).fill(1));
    const gridG = Array.from({ length: h }, () => Array(w).fill('.'));
    for (let x = 0; x < w; x++) {
        gridF[0][x] = 22; gridF[h - 1][x] = 22;
        gridG[0][x] = '#'; gridG[h - 1][x] = '#';
    }
    for (let y = 0; y < h; y++) {
        gridF[y][0] = 22; gridF[y][w - 1] = 22;
        gridG[y][0] = '#'; gridG[y][w - 1] = '#';
    }
    for (let x = 3; x <= 7; x++) {
        for (let y = 3; y <= 4; y++) {
            gridF[y][x] = 21; gridG[y][x] = '#';
        }
    }
    for (let x = 10; x <= 11; x++) {
        for (let y = 3; y <= 7; y++) {
            gridF[y][x] = 21; gridG[y][x] = '#';
        }
    }
    for (let x = 3; x <= 8; x++) {
        gridF[11][x] = 21; gridG[11][x] = '#';
    }
    for (let y = 2; y <= 11; y++) {
        gridF[y][13] = 22; gridG[y][13] = '#';
        gridF[y][14] = 22; gridG[y][14] = '#';
    }
    gridF[13][4] = 21; gridG[13][4] = '#';
    const map = {
        w, h,
        rows: gridF.map((r, y) => ({ f: r.map(hexFeat).join(''), g: gridG[y].join('') }))
    };
    const clusters = Town.computeTownClusters(map, w, h);
    const twoWideBldg = clusters.find(c => c.minX === 3 && c.minY === 3);
    const northSouthBldg = clusters.find(c => c.minX === 10 && c.minY === 3);
    const oneWideWall = clusters.find(c => c.minX === 3 && c.minY === 11);
    const moatWall = clusters.find(c => c.minX === 13 && c.minY === 2 && c.spanY === 10);
    const isolatedOneByOne = clusters.find(c => c.minX === 4 && c.minY === 13 && c.spanX === 1 && c.spanY === 1);
    assert(twoWideBldg && twoWideBldg.kind === 'building' && twoWideBldg.storyExtra === 0, 'Interior 2-tile building must be roofed with storyExtra === 0');
    assert(northSouthBldg && northSouthBldg.kind === 'building' && northSouthBldg.ridgeAlongX === false, 'Interior 2x5 N/S building must use ridgeAlongX === false');
    assert(oneWideWall && oneWideWall.kind === 'building', 'Interior 1-tile wing must be roofed as building');
    assert(moatWall && moatWall.kind === 'building', 'Interior storeless permanent wing must be roofed as building');
    assert(isolatedOneByOne && isolatedOneByOne.kind === 'building', 'Isolated 1x1 interior town wall must be roofed as building');
    {
        const cw = 32, ch = 12;
        const cGridF = Array.from({ length: ch }, () => Array(cw).fill(1));
        const cGridG = Array.from({ length: ch }, () => Array(cw).fill('.'));
        for (let x = 2; x <= 29; x++) { cGridF[2][x] = 22; cGridG[2][x] = '#'; }
        const cMap = { w: cw, h: ch, rows: cGridF.map((r, y) => ({ f: r.map(hexFeat).join(''), g: cGridG[y].join('') })) };
        const cClusters = Town.computeTownClusters(cMap, cw, ch);
        const borderCurtain = cClusters.find(c => c.minY === 2 && c.spanX >= 24);
        assert(borderCurtain && borderCurtain.kind === 'fortress_wall', 'Outer-border >=24 permanent curtain wall must classify as fortress_wall');
    }

    // Verify outward gable normals & watertight sloped soffits / rake bargeboards for both ridgeAlongX orientations
    class StubAttr { constructor(a, n) { this.array = a; this.itemSize = n; this.count = Math.floor(a.length / n); } }
    class StubGeo { constructor() { this.attributes = {}; } setAttribute(k, v) { this.attributes[k] = v; } setIndex() {} dispose() {} }
    class StubObj {
        constructor() {
            this.position = { set() {} };
            this.rotation = { set() {} };
            this.scale = { set() {} };
            this.matrix = new Float32Array(16);
            this.children = [];
        }
        updateMatrix() {}
        add(...xs) { this.children.push(...xs.filter(Boolean)); }
        remove() {}
    }
    class StubMesh extends StubObj { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } }
    class StubInst extends StubObj { constructor(g, m, n) { super(); this.geometry = g; this.material = m; this.count = n; this.instanceMatrix = { needsUpdate: false }; } setMatrixAt() {} setColorAt() {} }
    const THREE_STUB = {
        RepeatWrapping: 1, LinearMipmapLinearFilter: 1, LinearFilter: 1, RGBAFormat: 1, SRGBColorSpace: 'srgb', NoColorSpace: 'no',
        BufferGeometry: StubGeo, Float32BufferAttribute: StubAttr, BoxGeometry: StubGeo,
        DataTexture: class { constructor() {} dispose() {} }, Texture: class { constructor() {} }, TextureLoader: class { load() { return {}; } },
        MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } }, Color: class {}, Vector2: class {},
        Object3D: StubObj, Group: StubObj, Mesh: StubMesh, InstancedMesh: StubInst
    };
    const townVmCtx = vm.createContext({ THREE: THREE_STUB, window: {}, globalThis: null, module: { exports: {} }, console });
    townVmCtx.globalThis = townVmCtx;
    vm.runInContext(townSrc, townVmCtx);
    const TownVm = townVmCtx.window.Dungeon3DTown;
    const mockD3d = { scene: new StubObj(), wallTex: {}, wallNormal: {}, permWallTex: {}, permWallNormal: {}, wallMaterial: { map: {}, normalMap: {} }, permWallMaterial: { map: {}, normalMap: {} }, townRoofMaterial: {} };
    TownVm.buildTownArchitecture(mockD3d, map, w, h, 0, 'hengband');
    const builtMeshes = mockD3d._townArchGroup.children.filter(c => c.isMesh);
    const roofMeshes = builtMeshes.filter((_, i) => i % 2 === 0);
    const gableMeshes = builtMeshes.filter((_, i) => i % 2 === 1);
    assert(roofMeshes.length >= 2 && gableMeshes.length >= 2, 'Synthetic town must build both ridgeAlongX and ridgeAlongZ roofs and gables');
    for (const rm of roofMeshes) {
        const pos = rm.geometry.attributes.position;
        const uv = rm.geometry.attributes.uv;
        assert(pos.count >= 72, `Solid roof shell with sloped soffits & rake bargeboards must have >= 72 verts (got ${pos.count})`);
        assert.strictEqual(uv.count, pos.count, 'Roof shell UVs must match vertex count');
    }
    const gxMesh = gableMeshes[0];
    const gzMesh = gableMeshes[1];
    const gxPos = gxMesh.geometry.attributes.position.array;
    const gxNorm = gxMesh.geometry.attributes.normal.array;
    assert(gxPos.length === 18 && gxNorm.length === 18, 'Each building emits 2 gable triangles (6 vertices)');
    for (let i = 0; i < 6; i++) {
        const px = gxPos[i * 3], nx = gxNorm[i * 3], ny = gxNorm[i * 3 + 1], nz = gxNorm[i * 3 + 2];
        assert.strictEqual(nx, px < 0 ? -1 : 1, 'ridgeAlongX gable normal must point outward along +/-X');
        assert(Math.abs(ny) < 1e-6 && Math.abs(nz) < 1e-6, 'ridgeAlongX gable normal must be strictly axis-aligned');
    }
    const gzPos = gzMesh.geometry.attributes.position.array;
    const gzNorm = gzMesh.geometry.attributes.normal.array;
    for (let i = 0; i < 6; i++) {
        const pz = gzPos[i * 3 + 2], nx = gzNorm[i * 3], ny = gzNorm[i * 3 + 1], nz = gzNorm[i * 3 + 2];
        assert.strictEqual(nz, pz > 0 ? 1 : -1, 'ridgeAlongZ gable normal must point outward along +/-Z');
        assert(Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6, 'ridgeAlongZ gable normal must be strictly axis-aligned');
    }

    assert(townSrc.includes('const eaveY = wallH - 0.04;'), 'Roof eaveY must overlap wall top seamlessly');
    assert(townSrc.includes('const fasciaBot = -0.13;'), 'Gable roof must include 0.13m watertight fascia skirt');
    assert(townSrc.includes('const size = 512;'), 'Roof tile textures must be 512x512');
    assert(townSrc.includes('withinCullRect(cl.minX, cl.maxX, cl.minY, cl.maxY)'), 'Town architecture must distance-cull synchronously with walls');

    assert(procSrc.includes('this.townTimberMaterial.color.setHex(0x4a3525)'), 'townTimberMaterial must use bark_willow_02 dark timber');
    assert(!procSrc.includes("applyMatMaps(this.townTimberMaterial, e, true);\n    });") && !procSrc.includes("loadLocalPbrSet('local_wood_trim'"), 'Striped T_WoodTrim must be detached from townTimberMaterial');

    assert(d3dSrc.includes('const monoPosY = isTownBuilding ? wallYCenter : ((yBot + yTop) * 0.5);'), 'Town building walls must sit at full wallYCenter');
    assert(d3dSrc.includes('const monoSclY = isTownBuilding ? 1.0 : ((yTop - yBot) / wallGeoH);'), 'Town building walls must keep Y scale 1.0');
    assert(d3dSrc.includes('const maxTileDistSq = isSurfaceTown ? 3025 : (outdoors ? 1296 : 784);'), 'Surface towns must cull at 55 tiles (3025 sq)');
    assert(d3dSrc.includes('const mat3 rot = mat3('), 'Sky shader must use rotated multi-octave quintic FBM');
    assert(d3dSrc.includes('sky += mwColor * mwIntensity * 0.18;'), 'Sky Milky Way glow must stay subtle (<= 0.18)');
    assert(d3dSrc.includes('if (this.chasmSideMaterial && !this._hasPolyHavenChasmTex)'), 'applyProceduralTheme must sync fallback rock textures onto chasmSideMaterial');
    assert(d3dSrc.includes('const env = (c === 0 || c === cliffSegX) ? 0 : Math.sin(u * Math.PI);'), 'Chasm cliff crag must taper to exact 0 at tile seams');
    const chasmStart = d3dSrc.indexOf('if (chasmVoidIdx < this.maxInstances)');
    const chasmEnd = chasmStart >= 0 ? d3dSrc.indexOf('emitIndoorCeiling(tileCeilH)', chasmStart) : -1;
    assert(chasmStart > 0 && chasmEnd > chasmStart, 'chasmVoidIdx block must exist in dungeon3d.js');
    const chasmVoidSection = d3dSrc.slice(chasmStart, chasmEnd);
    assert(chasmVoidSection.includes('this.dummy.rotation.set(0, 0, 0);'), 'chasmVoidMesh must keep horizontal floorGeo orientation (0, 0, 0)');
    assert(!chasmVoidSection.includes('rotation.set(-Math.PI / 2'), 'chasmVoidMesh must never rotate already-horizontal floorGeo vertically');
    assert(d3dSrc.includes('if ((feat === 22 || (outdoors && feat === 21)) && !isTownBuilding)'), 'Outer town perimeter granite/perm walls must use permWallMesh');
}

function testRealisticBeastsAndRouting() {
    const bestiaryDir = path.join(ROOT, 'server/public/assets/models/monsters/bestiary');
    const archiveDir = path.join(ROOT, 'archive/godot-client-v1/assets/models/monsters/bestiary');
    const targets = ['wolf.glb', 'husky.glb', 'Fox.glb', 'werewolf.glb', 'bear.glb', 'lizard.glb', 'frog.glb'];

    const hasArchiveMirror = fs.existsSync(archiveDir);
    for (const file of targets) {
        const p1 = path.join(bestiaryDir, file);
        assert(fs.existsSync(p1), `Missing server bestiary GLB: ${file}`);
        const b1 = fs.readFileSync(p1);
        if (hasArchiveMirror) {
            const p2 = path.join(archiveDir, file);
            assert(fs.existsSync(p2), `Missing archive mirror GLB: ${file}`);
            const b2 = fs.readFileSync(p2);
            assert(b1.equals(b2), `Archive mirror mismatch on ${file}`);
        }

        const j = parseGlb(b1);
        assert((j.textures || []).length >= 2, `${file} must have >= 2 embedded PBR textures`);
        for (const m of (j.meshes || [])) {
            for (const p of (m.primitives || [])) {
                assert(p.attributes && p.attributes.POSITION !== undefined, `${file} missing POSITION`);
                assert(p.attributes.NORMAL !== undefined, `${file} missing NORMAL`);
                assert(p.attributes.TEXCOORD_0 !== undefined, `${file} missing TEXCOORD_0`);
            }
        }
        if (file === 'wolf.glb') {
            const animNames = (j.animations || []).map(a => a.name);
            assert(animNames.includes('idle') && animNames.includes('walk'), 'wolf.glb must retain idle/walk animations');
            const posAcc = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
            const spanZ = posAcc.max[2] - posAcc.min[2];
            const spanY = posAcc.max[1] - posAcc.min[1];
            assert(spanZ / spanY >= 1.5, `wolf.glb must be elongated quadruped (ratio=${(spanZ / spanY).toFixed(2)})`);
        }
        if (file === 'Fox.glb') {
            const animNames = (j.animations || []).map(a => a.name);
            assert(animNames.includes('Survey') && animNames.includes('Walk') && animNames.includes('Run'), 'Fox.glb must keep Survey/Walk/Run anims');
        }
        if (file === 'frog.glb') {
            const animNames = (j.animations || []).map(a => a.name);
            assert(animNames.includes('attack') && animNames.includes('idle') && animNames.includes('jump'), 'frog.glb must keep attack/idle/jump anims');
        }
        if (file === 'werewolf.glb') {
            const posAcc = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
            const heightY = posAcc.max[1] - posAcc.min[1];
            assert(heightY >= 1.8, `werewolf.glb must be towering lupine beastman (height=${heightY.toFixed(2)})`);
        }
        if (file === 'husky.glb') {
            const rootNode = j.nodes[j.scenes[0].nodes[0]];
            assert(rootNode && Array.isArray(rootNode.rotation) && Math.abs(rootNode.rotation[1] - Math.SQRT1_2) < 0.01, 'husky.glb must carry +90 deg Husky_Root for pinned -Math.PI/2 wrapper');
        }
    }

    const mb = require(path.join(ROOT, 'server/public/js/master-bestiary.js'));
    const wolfCfg = mb.resolve({ name: 'Wolf', attr: 11 }, 'C', 'silq');
    assert.strictEqual(wolfCfg.templateKey, 'bestiary_wolf');
    assert.strictEqual(wolfCfg.tintHex, null, 'Natural Wolf must not receive ASCII tint');

    const jackalCfg = mb.resolve({ name: 'Jackal', attr: 11 }, 'C', 'angband');
    assert.strictEqual(jackalCfg.templateKey, 'bestiary_fox');

    const coyoteCfg = mb.resolve({ name: 'Coyote', attr: 11 }, 'C', 'frogcomposband');
    assert.strictEqual(coyoteCfg.templateKey, 'bestiary_fox');

    const puppyCfg = mb.resolve({ name: 'Little dog', attr: 11 }, 'C', 'nethack');
    assert.strictEqual(puppyCfg.templateKey, 'bestiary_shiba');

    const hellCfg = mb.resolve({ name: 'Hell hound', attr: 4 }, 'C', 'angband');
    assert.strictEqual(hellCfg.templateKey, 'bestiary_hellhound');

    const catCfg = mb.resolve({ name: 'Wild cat', attr: 11 }, 'f', 'angband');
    assert.strictEqual(catCfg.templateKey, 'bestiary_lion');
    assert.strictEqual(catCfg.tintHex, null, 'Natural feline must not receive ASCII orange tint');
}

function main() {
    testSketchAndTtsFixes();
    testHudMessageDeduplication();
    testTownRoofsTimberAndSky();
    testRealisticBeastsAndRouting();
    console.log('test_v12_3_3_playtest_fixes.js: ALL PASS');
}

main();

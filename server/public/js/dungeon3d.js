/**
 * Angband3D WebGL Renderer — High-Fidelity Three.js 3D Dungeon Crawler
 * Features:
 * - 1:1 Parity with Godot C# client's wire protocol and procedural textures (DungeonWorld.cs)
 * - Built-in zero-latency procedural PBR texture generation matching Godot client:
 *   - Stone wall textures with chiseled bevel lighting, dark mortar joints, block hue variation & normal maps
 *   - Flagstone floor textures with worn centers, mortar seams & normal maps
 *   - Subterranean rock ceiling textures & normal maps
 *   - Forged iron reinforced wooden door textures & normal maps
 *   - Half-timbered shop facades & 8 distinct Heraldic Shop Entrance doors with gilded rims & gold digits (1-8)
 *   - Magma fissures with pulsating incandescent veins & quartz crystal seams
 * - High-res 2K PBR texture streaming overlay from server assets
 * - Dynamic Town vs Subterranean Lighting:
 *   - Town (depth 0): Open daylight sky, Directional Sunlight (1.35), broad horizon, NO ceiling over streets!
 *   - Dungeon (depth > 0): True subterranean darkness, atmospheric depth fog, ceilings over tunnels, warm torchlight!
 * - Equipment Rule Parity with Godot ViewModel.cs:
 *   - Carrying a torch in the light slot illuminates the player without occupying their hands!
 *   - Left hand ONLY shows an equipped shield or wielded torch weapon. Empty by default!
 *   - Right hand ONLY shows an equipped melee weapon or bow, tucked cleanly in lower corner. Empty if unarmed!
 * - High-DPI 512x512 Runic Monster Medallions with health bars, glyphs, and nameplates
 * - 3D Item Pickups (Gold stacks, Potions, Scrolls, Weapons, Rings, Chests) with hovering bobbing kinematics
 * - 1:1 Camera Facing and Turning (0=North, 1=East, 2=South, 3=West) with smooth spring yaw rotation
 */

// ==============================================================================
// 0. Graphics Configuration & Enhancement Profile (Reversible & Platform-Safe)
// ==============================================================================

window.GRAPHICS_CONFIG = {
    preset: 'enhanced',         // 'classic' | 'enhanced'
    vertexAO: true,            // Contact Ambient Occlusion on walls, floors, ceilings
    torchDraft: true,          // Calm, subtle organic draft breathing & inertia (no fast strobe)
    torchInertia: true,        // Subtle hand-held torch movement lag on turn & walk bob
    adaptiveVignette: true,    // Environmental adaptive perimeter vignette behind HUD
    surfaceBreathing: true,    // Subtle emissive pulse on in-view molten lava (zero light leak)
    tileVariation: true,       // Quarter-turn texture rotation and organic stone shading
    itemRenderer: 'hybrid',    // 'hybrid' (3D weapons/armor/chests + Shockbolt PBR consumables) | 'billboard' | 'classic'
    item3DModels: true,        // fallback if itemRenderer is classic
    biomeVariation: true,      // Procedural geological sub-themes & coherent spatial cluster shading
    starrySky: true,           // High-quality celestial star canopy overhead in town / outdoors
    depthStrata: true,         // Progressive 4-level depth chapters with atmospheric depth fog
    creatureRenderer: 'billboard', // 'billboard' (Canonical Shockbolt illustrated creatures with normal mapping) | 'classic' (3D models)
    normalMapping: true,       // Real-time torchlight normal mapping on creature and item billboards
    contactShadows: true,      // Soft ground contact shadow discs anchoring creatures and items to floor
    idleBreathing: true        // Organic volume-conserving breathing & hovering
};

window.setGraphicsPreset = function(presetName) {
    const isEnhanced = presetName === 'enhanced';
    window.GRAPHICS_CONFIG.preset = isEnhanced ? 'enhanced' : 'classic';
    window.GRAPHICS_CONFIG.vertexAO = isEnhanced;
    window.GRAPHICS_CONFIG.torchDraft = isEnhanced;
    window.GRAPHICS_CONFIG.torchInertia = isEnhanced;
    window.GRAPHICS_CONFIG.adaptiveVignette = isEnhanced;
    window.GRAPHICS_CONFIG.surfaceBreathing = isEnhanced;
    window.GRAPHICS_CONFIG.tileVariation = isEnhanced;
    window.GRAPHICS_CONFIG.itemRenderer = isEnhanced ? 'hybrid' : 'classic';
    window.GRAPHICS_CONFIG.item3DModels = isEnhanced;
    window.GRAPHICS_CONFIG.biomeVariation = isEnhanced;
    window.GRAPHICS_CONFIG.starrySky = isEnhanced;
    window.GRAPHICS_CONFIG.depthStrata = isEnhanced;
    window.GRAPHICS_CONFIG.creatureRenderer = isEnhanced ? 'billboard' : 'classic';
    window.GRAPHICS_CONFIG.normalMapping = isEnhanced;
    window.GRAPHICS_CONFIG.contactShadows = isEnhanced;
    window.GRAPHICS_CONFIG.idleBreathing = isEnhanced;

    if (window.__app && window.__app.dungeon) {
        window.__app.dungeon.applyGraphicsConfig();
    }
};

// ==============================================================================
// 1. Angband 32-Color Palette (1:1 with AngbandColors.cs)
// ==============================================================================

const ANGBAND_COLORS = [
    0x000000, // 0  dark
    0xffffff, // 1  white
    0x808080, // 2  slate
    0xff8000, // 3  orange
    0xc00000, // 4  red
    0x008c47, // 5  green
    0x0000ff, // 6  blue
    0x80590d, // 7  umber
    0x595959, // 8  light dark
    0xc0c0c0, // 9  light slate
    0x9900ff, // 10 light purple
    0xffff00, // 11 yellow
    0xff4040, // 12 light red
    0x00ff00, // 13 light green
    0x00ffff, // 14 light blue
    0xc4a161, // 15 light umber
    0x990099, // 16 purple
    0x99004d, // 17 violet
    0x009999, // 18 teal
    0x6b5933, // 19 mud
    0xffff99, // 20 light yellow
    0xe600e6, // 21 magenta
    0x33e6e6, // 22 light teal
    0xb366ff, // 23 light violet
    0xff66b3, // 24 light pink
    0xb89929, // 25 mustard
    0x708fb3, // 26 blue slate
    0x296bd1  // 27 deep light blue
];

// # ROOT-CAUSE: Guard getAngbandHex against null/float/non-integer attr values so ANGBAND_COLORS[idx] never returns undefined in getAngbandColorString.
function getAngbandHex(attr) {
    const n = (attr !== null && attr !== undefined && attr !== '' && Number.isFinite(Number(attr))) ? Math.floor(Number(attr)) : 1;
    const idx = (n >= 0 && n < ANGBAND_COLORS.length) ? n : 1;
    return ANGBAND_COLORS[idx] !== undefined ? ANGBAND_COLORS[idx] : 0xffffff;
}

function getAngbandColorString(attr) {
    const hex = getAngbandHex(attr).toString(16).padStart(6, '0');
    return '#' + hex;
}
window.getAngbandColorString = getAngbandColorString;

// ==============================================================================
// 2. Procedural Texture Engine (Exact Mathematical Parity with Godot C# DungeonWorld.cs)
// ==============================================================================

function procCreateShadowTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return tex;
}

function procCreateStarTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;

    // 1. Soft radial Gaussian bloom halo falloff
    const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
    grad.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.04, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(0.12, 'rgba(235, 245, 255, 0.72)');
    grad.addColorStop(0.28, 'rgba(190, 220, 255, 0.30)');
    grad.addColorStop(0.55, 'rgba(150, 190, 255, 0.08)');
    grad.addColorStop(1.00, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // 2. Razor-sharp incandescent pinpoint core (r = 0..4px)
    const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, 4);
    coreGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    coreGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
    coreGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(center, center, 4, 0, Math.PI * 2);
    ctx.fill();

    // 3. 4-point celestial Airy diffraction spikes (crisp horizontal & vertical needles + 45° diagonal glints)
    const drawSpike = (len, width, alpha, angle = 0) => {
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(angle);
        const spikeGrad = ctx.createLinearGradient(-len, 0, len, 0);
        spikeGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
        spikeGrad.addColorStop(0.35, `rgba(230, 245, 255, ${alpha * 0.45})`);
        spikeGrad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
        spikeGrad.addColorStop(0.65, `rgba(230, 245, 255, ${alpha * 0.45})`);
        spikeGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        ctx.fillStyle = spikeGrad;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, width * 0.5);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, -width * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    // Principal horizontal & vertical diffraction needles plus subtle 45° diagonal glints
    const spikeConfigs = [
        [58, 2.2, 0.95, 0],
        [58, 2.2, 0.95, Math.PI / 2],
        [26, 1.4, 0.35, Math.PI / 4],
        [26, 1.4, 0.35, -Math.PI / 4]
    ];
    for (const cfg of spikeConfigs) {
        drawSpike(cfg[0], cfg[1], cfg[2], cfg[3]);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
}

function createChamferedWallGeometry(cellSize, wallHeight, chamfer = 0.40, vScale = 1.0) {
    const half = cellSize / 2;
    const c = chamfer;
    const shape = new THREE.Shape();
    // 8-sided polygon with 45-degree chamfers on the 4 vertical corners
    // Creates a clear 0.57m diagonal aperture when two wall corners meet diagonally
    shape.moveTo(-half + c, -half);
    shape.lineTo(half - c, -half);
    shape.lineTo(half, -half + c);
    shape.lineTo(half, half - c);
    shape.lineTo(half - c, half);
    shape.lineTo(-half + c, half);
    shape.lineTo(-half, half - c);
    shape.lineTo(-half, -half + c);
    shape.closePath();

    const extrudeSettings = {
        depth: wallHeight,
        steps: 2,
        bevelEnabled: false
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(Math.PI / 2);
    geo.center();

    // Continuous arc-length UVs around the 8-sided column perimeter
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    if (pos && norm && uv) {
        const halfH = wallHeight / 2;
        const uvs = uv.array;
        for (let i = 0; i < pos.count; i++) {
            const ny = norm.getY(i);
            const vx = pos.getX(i);
            const vy = pos.getY(i);
            const vz = pos.getZ(i);
            if (Math.abs(ny) < 0.5) {
                const uArc = ((Math.atan2(vz, vx) + Math.PI) / (2 * Math.PI)) * 4.0;
                const vH = ((vy + halfH) / wallHeight) * vScale;
                uvs[i * 2] = uArc;
                uvs[i * 2 + 1] = vH;
            } else {
                uvs[i * 2] = (vx + half) / cellSize;
                uvs[i * 2 + 1] = (vz + half) / cellSize;
            }
        }
        uv.needsUpdate = true;
    }
    return geo;
}

// ------------------------------------------------------------------------------
// Vertex Contact Ambient Occlusion (AO) Generators
// Grounding geometry without runtime GPU shader passes (0 draw calls, 0 frame drop)
// ------------------------------------------------------------------------------

function applyWallVertexAO(geo, wallHeight) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const halfH = wallHeight / 2;
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = Math.max(0, Math.min(1, (y + halfH) / wallHeight));
        let factor = 1.0;
        if (t < 0.28) {
            // Rich ground contact shadow on bottom 28% of wall (darkens down to 0.48 at t=0)
            factor = 0.48 + Math.pow(t / 0.28, 0.85) * 0.52;
        } else if (t > 0.80) {
            // Soft ceiling contact shadow on top 20% of wall (darkens down to 0.60 at t=1)
            factor = 0.60 + Math.pow((1.0 - t) / 0.20, 0.85) * 0.40;
        }
        if (Math.abs(x) > 0.55 && Math.abs(z) > 0.55) {
            factor *= 0.97;
        }
        colors[i * 3 + 0] = factor;
        colors[i * 3 + 1] = factor;
        colors[i * 3 + 2] = factor;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function applyFloorVertexAO(geo, cellSize) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    colors.fill(1.0);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function applyCeilingVertexAO(geo, cellSize) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const maxDist = Math.hypot(cellSize / 2, cellSize / 2);
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const dist = Math.hypot(x, z);
        const d = Math.min(1.0, dist / maxDist);
        const factor = 1.0 - d * 0.03;
        colors[i * 3 + 0] = factor;
        colors[i * 3 + 1] = factor;
        colors[i * 3 + 2] = factor;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ==============================================================================
// 2. Main 3D Dungeon Crawler Engine
// ==============================================================================

// Canonical item paths live in window.MASTER_ITEM_REGISTRY.POLYHAVEN_ITEM_GLTF_PATHS; keep minimal contract aliases merged
const POLYHAVEN_ITEM_GLTF_PATHS = Object.assign({
    'ph_sledgehammer': '/assets/polyhaven/models/sledgehammer_01/sledgehammer_01.gltf',
    'ph_potion_bottle': '/assets/models/items/healing_potion.glb',
    'ph_potion_urn': '/assets/models/items/supreme_healing_potion.glb',
    'ph_chest': '/assets/models/items/Chest_Wood.gltf',
    'ph_lantern': '/assets/polyhaven/models/wooden_lantern_01/wooden_lantern_01.gltf',
    'ph_shield': '/assets/polyhaven/models/kite_shield/kite_shield.gltf',
    'ph_book': '/assets/polyhaven/models/decorative_book_set_01/decorative_book_set_01.gltf',
    'ph_goblet': '/assets/polyhaven/models/brass_goblets/brass_goblets.gltf',
    'item_plate_armor': '/assets/models/items/plate_armor.glb',
    'item_anvil': '/assets/models/items/Anvil.gltf',
    'item_shrine_candles': '/assets/models/items/shrine_candles.gltf',
    'item_gold': '/assets/models/items/coin_pile_spill.glb',
    'item_bow': '/assets/models/items/bow.glb',
    'item_crossbow': '/assets/models/items/crossbow.glb',
    'item_spear': '/assets/models/items/spear.glb',
    'item_halberd': '/assets/models/items/halberd.glb',
    'item_torch': '/assets/models/items/torch_pbr.glb',
    'item_greatsword': '/assets/models/items/great_sword.glb',
    'item_rune_blade': '/assets/models/items/rune_blade.glb',
    'item_goblin_sword': '/assets/models/items/goblin_sword.glb',
    'item_morningstar': '/assets/models/items/morningstar.glb',
    'item_flail': '/assets/models/items/flail.glb',
    'item_phial': '/assets/models/items/phial.glb',
    'item_chest_metal': '/assets/models/items/chest_metal.glb',
    'item_food_ration': '/assets/models/items/food_ration.glb',
    'item_greatclub': '/assets/models/items/greatclub.glb',
    'item_longsword': '/assets/models/items/sword_pbr.glb', // upgrades legacy '/assets/models/items/steel_longsword.glb'
    'item_shield_wooden': '/assets/models/items/shield_wooden.glb',
    'item_shield_wicker': '/assets/models/items/shield_wooden.glb',
    'item_shield_raven': '/assets/models/items/shield_raven.glb',
    'item_scroll': '/assets/models/items/scroll.glb',
    'item_coins': '/assets/models/items/coin_pile_spill.glb',
    'item_wand': '/assets/models/items/wand.glb',
    'item_rod': '/assets/models/items/rod.glb',
    'item_staff': '/assets/models/items/staff.glb',
    'ph_statue_item': '/assets/polyhaven/models/gothic_statue/gothic_statue.gltf',
    'item_corpse': '/assets/models/items/skull.gltf'
}, (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY && window.MASTER_ITEM_REGISTRY.POLYHAVEN_ITEM_GLTF_PATHS) || {});

if (typeof window !== 'undefined' && !window.DeviceProfile) {
    window.DeviceProfile = {
        getTier() {
            const w = window.innerWidth || 1024;
            const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
            if (w <= 640 || (coarse && w <= 820)) return 'phone';
            if (w <= 1024 && coarse) return 'tablet';
            return 'desktop';
        },
        triggerHaptic(ms = 12) {
            try { if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(ms); } catch (_) {}
        }
    };
}

function createLatheFrustumGeo(rTop = 0.5, rBottom = 0.5, height = 1.0, segs = 12, openEnded = false) {
    const halfH = height * 0.5;
    const pts = openEnded
        ? [new THREE.Vector2(Math.max(0.0001, rBottom), -halfH), new THREE.Vector2(Math.max(0.0001, rTop), halfH)]
        : [
            new THREE.Vector2(0, -halfH),
            new THREE.Vector2(Math.max(0.0001, rBottom), -halfH),
            new THREE.Vector2(Math.max(0.0001, rTop), halfH),
            new THREE.Vector2(0, halfH)
        ];
    const geo = new THREE.LatheGeometry(pts, Math.max(4, segs | 0));
    geo.computeVertexNormals();
    return geo;
}

class Dungeon3D {
    constructor(canvasId, opts = {}) {
        this._canvasId = canvasId;
        this._initOpts = opts || {};
        this._deferGpuInit = Boolean(this._initOpts.deferGpuInit === true);
        this._gpuInitialized = false;
        this._animLoopScheduled = false;
        this._pendingResize = false;
        this._pendingGraphicsPreset = null;
        this._pendingEnvTexArgs = null;
        this._visibilityOverlayEnabled = false;

        this.canvas = typeof document !== 'undefined' ? document.getElementById(canvasId) : null;
        this.cellSize = 2.0; // 2.0m per grid cell matching Godot DungeonWorld
        this.wallHeight = 3.0;
        this.eyeHeight = 1.62;

        // Facing: 0=North (-Z), 1=East (+X), 2=South (+Z), 3=West (-X)
        // 1:1 mathematical match with Godot DungeonWorld._facing and camera convention
        this.facing = 0;
        this.targetYaw = 0;
        this.basePitch = -9.0 * (Math.PI / 180.0);
        this.userPitchOffset = 0.0;
        this.targetPitch = this.basePitch;
        this.targetCamPos = new THREE.Vector3(0, this.eyeHeight, 0);
        this.currentCamPos = new THREE.Vector3(0, this.eyeHeight, 0);
        this._logicalCamPos = new THREE.Vector3(0, this.eyeHeight, 0);
        this.cameraBobPhase = 0;

        this.stepDuration = 0.14; // 140ms step tween
        this.stepTime = 0;
        this.isStepping = false;
        this._lastStepEndMs = 0;
        this._strideChain = false;

        this.monsters = new Map();
        this.items = new Map();

        // Combat Juice & VFX Subsystems (Exact 1:1 Parity with Godot DungeonWorld.cs)
        this.floatingTexts = [];
        this.particles = [];
        this.activeProjectiles = [];
        this._activeHitSparks = [];
        this._hitSparkPool = [];
        this.trauma = 0.0;
        this.lastPlayerHp = null;
        this.lastPlayerLevel = null;
        this.lastDepth = null;
        this._prevHp = null;
        this._prevLev = null;
        this._prevDepth = null;
        this._prevTurn = 0;
        this._lastSessionRealm = null;
        this.attackAnimationTime = 0.0;
        this.hurtAnimationTime = 0.0;
        this.castAnimationTime = 0.0;
        this.audio = null;
        this.lastPlayerStatuses = new Set();

        this.realm = String((this._initOpts && this._initOpts.realmHint) || 'angband').toLowerCase();
        this._reducedMotionMql = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
        this._acceptedNameplates = [];
        this._hoveredTileObj = { x: 0, y: 0 };
        this._lastHoverTileX = -1;
        this._lastHoverTileY = -1;

        // Zero-allocation scratch math objects for fast high-fps grid updates
        this._scratchWallColor = new THREE.Color();
        this._scratchPermWallColor = new THREE.Color();
        this._scratchFloorColor = new THREE.Color();
        this._scratchCeilingColor = new THREE.Color();
        this._scratchGrassColor = new THREE.Color();
        this._scratchDirtColor = new THREE.Color();
        this._scratchWaterColor = new THREE.Color();
        this._scratchDeepWaterColor = new THREE.Color();
        this._scratchMountainColor = new THREE.Color();
        this._scratchSwampColor = new THREE.Color();
        this._scratchTreeColor = new THREE.Color();
        this._scratchTreeTrunkColor = new THREE.Color();
        this._scratchTrunkBaseColor = new THREE.Color();
        this._sunlightFloorColor = new THREE.Color(1.30, 1.25, 0.90);
        this._tintDark = new THREE.Color(0.24, 0.26, 0.32);
        this._tintMemLit = new THREE.Color(0.55, 0.58, 0.65);
        this._tintMemDark = new THREE.Color(0.22, 0.24, 0.30);

        this.animate = this.animate.bind(this);
        if (!this._deferGpuInit) {
            this.ensureGpuInitialized(this.realm);
        }
    }

    ensureGpuInitialized(realmHint = null) {
        if (realmHint) {
            this.realm = String(realmHint).toLowerCase();
        }
        if (this._gpuInitialized) {
            return true;
        }
        if (!this.canvas && this._canvasId && typeof document !== 'undefined') {
            this.canvas = document.getElementById(this._canvasId);
        }
        this.initThree();
        this.initTextures();
        this.initMeshes();
        this.initViewmodel();
        this.initModelResolvers();
        this._gpuInitialized = true;

        if (this._pendingGraphicsPreset !== null) {
            const preset = this._pendingGraphicsPreset;
            this._pendingGraphicsPreset = null;
            this.setGraphicsPreset(preset);
        }
        if (this._visibilityOverlayEnabled) {
            this.setVisibilityOverlay(true);
        }
        if (this._pendingResize) {
            this._pendingResize = false;
            this.resize();
        }
        if (this._pendingEnvTexArgs) {
            const envArgs = this._pendingEnvTexArgs;
            this._pendingEnvTexArgs = null;
            this.applyEnvironmentTextures(envArgs[0], envArgs[1], envArgs[2], envArgs[3], envArgs[4]);
        }
        this._scheduleAnimLoop();
        return true;
    }

    resetSessionState(opts = {}) {
        const clearMem = !opts || opts.clearMemory !== false;
        this._prevHp = null;
        this._prevLev = null;
        this._prevDepth = null;
        this._prevTurn = 0;
        this.lastPlayerHp = null;
        this.lastPlayerSp = null;
        this.lastPlayerLevel = null;
        this.lastDepth = null;
        this.trauma = 0.0;
        this.hurtAnimationTime = 0.0;
        this.attackAnimationTime = 0.0;
        this.castAnimationTime = 0.0;
        this.actionAnimationTime = 0.0;
        this._lastHoverTileX = -1;
        this._lastHoverTileY = -1;
        this._hoveredTile = null;
        this.lastPlayerStatuses = new Set();
        if (clearMem) {
            this._levelTileMemory = null;
            this._levelMemKey = null;
            this._levelMemW = 0;
            this._levelMemH = 0;
            this._levelMemTotal = 0;
            this._lastFlankSig = '';
            if (this._gpuInitialized && typeof this.purgeAllSceneEntities === 'function') {
                this.purgeAllSceneEntities();
            }
            if (typeof document !== 'undefined') {
                const flankEl = document.getElementById('flank-threat-overlay');
                if (flankEl) flankEl.innerHTML = '';
                const compassEl = document.getElementById('compass-canvas');
                const cCtx = compassEl && typeof compassEl.getContext === 'function' ? compassEl.getContext('2d') : null;
                if (cCtx) cCtx.clearRect(0, 0, compassEl.width, compassEl.height);
            }
        }
        if (typeof this.recycleHitSparks === 'function') {
            this.recycleHitSparks();
        }
        if (Array.isArray(this.activeProjectiles) && this.activeProjectiles.length > 0) {
            for (let i = 0; i < this.activeProjectiles.length; i++) {
                const proj = this.activeProjectiles[i];
                if (proj && proj.group && this.scene) this.scene.remove(proj.group);
                if (proj && Array.isArray(proj.disposables)) {
                    for (const d of proj.disposables) {
                        if (d && !d._sharedGeometry && !d._sharedMaterial && !d._sharedTexture && typeof d.dispose === 'function') d.dispose();
                    }
                }
            }
            this.activeProjectiles.length = 0;
        }
        if (this.vfxFlashLight) this.vfxFlashLight.intensity = 0;
        if (this._vfxFlashState) this._vfxFlashState.active = false;
        if (Array.isArray(this.floatingTexts) && this.floatingTexts.length > 0) {
            for (const ft of this.floatingTexts) {
                if (ft && ft.sprite && this.scene) this.scene.remove(ft.sprite);
                if (ft && ft.material && !ft.material._sharedMaterial && typeof ft.material.dispose === 'function') ft.material.dispose();
                if (ft && ft.texture && !ft.texture._sharedTexture && typeof ft.texture.dispose === 'function') ft.texture.dispose();
            }
            this.floatingTexts.length = 0;
        }
        if (typeof document !== 'undefined') {
            const vignetteEl = document.getElementById('dungeon-vignette');
            if (vignetteEl) {
                vignetteEl.classList.remove('danger-pulse', 'hurt-flash', 'level-up-flash');
            }
            const dmgFlashEl = document.getElementById('damage-flash');
            if (dmgFlashEl) {
                dmgFlashEl.classList.remove('active');
                dmgFlashEl.style.opacity = '0';
            }
        }
    }

    dispose() {
        if (this._rafId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._animLoopScheduled = false;
        this.resetSessionState({ clearMemory: true });
        if (Array.isArray(this._hitSparkPool)) {
            for (let i = 0; i < this._hitSparkPool.length; i++) {
                const slot = this._hitSparkPool[i];
                if (slot && slot.group) {
                    slot.group.visible = false;
                    if (this.scene && slot.group.parent === this.scene) {
                        this.scene.remove(slot.group);
                    }
                }
            }
        }
        if (this._floatingTextTexCache && typeof this._floatingTextTexCache.values === 'function') {
            for (const tex of this._floatingTextTexCache.values()) {
                if (tex && !tex._sharedTexture && typeof tex.dispose === 'function') {
                    tex._cachedFloatingTex = false;
                    tex.dispose();
                }
            }
            this._floatingTextTexCache.clear();
        }
        if (window.Dungeon3DV2Pipeline && typeof window.Dungeon3DV2Pipeline.dispose === 'function') {
            window.Dungeon3DV2Pipeline.dispose(this);
        }
        if (this.renderer && typeof this.renderer.dispose === 'function') {
            this.renderer.dispose();
        }
    }

    _getViewportStageMetrics() {
        const handheld = Boolean(
            typeof window !== 'undefined' &&
            window.DeviceProfile &&
            typeof window.DeviceProfile.isHandheld === 'function' &&
            window.DeviceProfile.isHandheld()
        );
        if (handheld && this.canvas) {
            if (this.canvas.style) {
                this.canvas.style.width = '';
                this.canvas.style.height = '';
            }
            if (typeof this.canvas.getBoundingClientRect === 'function') {
                const r = this.canvas.getBoundingClientRect();
                if (r && r.width >= 60 && r.height >= 60) {
                    return { w: Math.round(r.width), h: Math.round(r.height), handheld: true };
                }
            }
        }
        return {
            w: (typeof window !== 'undefined' && window.innerWidth) || 1280,
            h: (typeof window !== 'undefined' && window.innerHeight) || 720,
            handheld: false
        };
    }

    _resolveVerticalFov(baseVFovDeg, aspect, handheld) {
        let vFovDeg = baseVFovDeg;
        if (handheld) {
            const minHFovDeg = aspect < 1.05 ? 90.0 : 96.0;
            const minHFovRad = (minHFovDeg * Math.PI) / 180.0;
            const reqVFovDeg = (2.0 * Math.atan(Math.tan(minHFovRad * 0.5) / Math.max(0.35, aspect)) * 180.0) / Math.PI;
            vFovDeg = Math.max(baseVFovDeg, Math.min(98.0, reqVFovDeg));
        }
        // Ultrawide Hor+ clamp (aspect > 1.85 -> e.g. 21:9 / 32:9): cap HFOV <= 108 deg so edges never fish-eye past 125 deg
        if (aspect > 1.85) {
            const maxHFovRad = (107.999 * Math.PI) / 180.0;
            const maxVFovDeg = (2.0 * Math.atan(Math.tan(maxHFovRad * 0.5) / aspect) * 180.0) / Math.PI;
            vFovDeg = Math.min(vFovDeg, maxVFovDeg);
        }
        return vFovDeg;
    }

    resize() {
        if (!this._gpuInitialized || !this.renderer || !this.camera) {
            this._pendingResize = true;
            return;
        }
        this._cachedCanvasRect = null;
        const nextBudget = (typeof window !== 'undefined' && window.DeviceProfile && typeof window.DeviceProfile.getRenderBudget === 'function')
            ? window.DeviceProfile.getRenderBudget()
            : (this.renderBudget || {});
        this.renderBudget = nextBudget;
        const scale = (this.renderGovernor && this.renderGovernor.dynamicResolutionScale) || 1.0;
        const { w, h, handheld } = this._getViewportStageMetrics();
        const aspect = w / Math.max(1, h);
        this.camera.aspect = aspect;
        this.camera.fov = this._resolveVerticalFov(this._baseVerticalFov || 82.0, aspect, handheld);
        this.camera.far = Math.max(110, nextBudget.farDistance || 110);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, !handheld);
        const dprCap = nextBudget.dprCap || (nextBudget.tier === 'phone' ? 1.25 : 1.5);
        const dprFloor = Math.min(dprCap, 0.75);
        const rawDpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, dprCap) * scale;
        this.renderer.setPixelRatio(Math.max(dprFloor, Math.min(dprCap, rawDpr)));
        if (this.renderGovernor) this.renderGovernor.wake(350);
    }

    setGraphicsPreset(presetName) {
        this._graphicsPreset = presetName || 'balanced';
        if (!this._gpuInitialized) {
            this._pendingGraphicsPreset = this._graphicsPreset;
            return;
        }
        if (this.renderBudget && presetName) {
            this.renderBudget.tier = String(presetName).toLowerCase();
        }
        this.applyGraphicsConfig();
    }

    setVisibilityOverlay(enabled) {
        this._visibilityOverlayEnabled = Boolean(enabled);
        if (!this._gpuInitialized) return;
        this._lastTerrainSig = null;
        if (this.lastFrame) this.updateDungeon(this.lastFrame);
        if (this.renderGovernor && typeof this.renderGovernor.wake === 'function') {
            this.renderGovernor.wake(350);
        }
    }

    clearScene() {
        this.resetSessionState({ clearMemory: true });
        if (!this._gpuInitialized) return;
        if (typeof this.purgeAllSceneEntities === 'function') {
            this.purgeAllSceneEntities();
        }
        this._lastTerrainSig = null;
    }

    renderFrame(frame) {
        if (!frame) return;
        const hintRealm = frame.realm || (frame.player && frame.player.realm) || this.realm;
        this.ensureGpuInitialized(hintRealm);
        this.update(frame);
    }

    initThree() {
        const budget = (window.DeviceProfile && typeof window.DeviceProfile.getRenderBudget === 'function')
            ? window.DeviceProfile.getRenderBudget()
            : ((window.Dungeon3DLightmap && window.Dungeon3DLightmap.HardwareGpuProfile)
                ? window.Dungeon3DLightmap.HardwareGpuProfile.detect()
                : { gpuTier: 'integrated', dprCap: 1.0, antialias: false, farDistance: 60, fogDensity: 0.018, enableFillLight: false, proceduralTexSize: 256, nameplatePoolCap: 64 });
        // # ROOT-CAUSE: Honor DeviceProfile.getRenderBudget() dprCap, farDistance, and antialias settings instead of overriding them with Math.max floors on integrated GPUs and tablets.
        this.renderBudget = budget;
        const isPhoneTier = budget.tier === 'phone';
        const dprCap = budget.dprCap || (isPhoneTier ? 1.25 : 1.5);
        const farDistance = Math.max(115, budget.farDistance || 115);
        const initialFogDensity = budget.fogDensity || 0.014;

        if (window.Dungeon3DLightmap) {
            this.renderGovernor = new window.Dungeon3DLightmap.DemandRenderGovernor({ idleIntervalMs: Math.min(budget.idleIntervalMs || 83, 83) });
            this.vertexLighter = new window.Dungeon3DLightmap.InstanceVertexLighter();
            this.nameplatePool = new window.Dungeon3DLightmap.NameplateTexturePool(budget.nameplatePoolCap || 64);
        }
        this.modelGovernor = (typeof window !== 'undefined' && window.Dungeon3DModelGovernor) ? window.Dungeon3DModelGovernor : null;
        this.glbPool = this.modelGovernor ? new this.modelGovernor.GlbPrototypePool(48) : null;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x121b2d); // Initial town sky matching skyDome horizon
        this.scene.fog = new THREE.FogExp2(0x121b2d, initialFogDensity);

        const stage = this._getViewportStageMetrics();
        const initAspect = stage.w / Math.max(1, stage.h);
        this._baseVerticalFov = 72;
        const initFov = this._resolveVerticalFov(this._baseVerticalFov, initAspect, stage.handheld);
        this.camera = new THREE.PerspectiveCamera(initFov, initAspect, 0.1, farDistance);
        this.camera.position.set(0, this.eyeHeight, 0);
        this.camera.rotation.order = 'YXZ'; // Critical: Yaw first, then Pitch, then Roll (eliminates room skew / Dutch tilt)
        this.camera.rotation.y = 0; // Starts looking North (-Z)
        this.camera.rotation.x = 0;
        this.camera.rotation.z = 0;

        const isRecording = typeof window !== 'undefined' && window.location.search && window.location.search.includes('record_walkthrough=1');
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: budget.antialias !== undefined ? Boolean(budget.antialias) : !isPhoneTier,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
            preserveDrawingBuffer: isRecording
        });
        this.renderer.setSize(stage.w, stage.h, !stage.handheld);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const compat = (typeof window !== 'undefined' && window.Dungeon3DCompat) || null;
        if (compat) compat.setExposure(this.renderer, 1.05);
        else this.renderer.toneMappingExposure = 1.05;
        this._enableDynamicShadows = !isPhoneTier && (budget.gpuTier === 'discrete' || budget.gpuTier === 'performance' || budget.gpuTier === 'ultra');
        if (compat) compat.configureRenderer(this.renderer);
        else if (typeof THREE.sRGBEncoding !== 'undefined') this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = Boolean(this._enableDynamicShadows);
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this._cachedCanvasRect = null;

        this._contextLost = false;
        if (this.canvas && typeof this.canvas.addEventListener === 'function') {
            this.canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                this._contextLost = true;
            }, false);
            this.canvas.addEventListener('webglcontextrestored', () => {
                this._contextLost = false;
                this._lastMapHash = '';
                this._lastEntitiesSig = '';
            }, false);
        }

        // Ambient light (dynamically adjusted per depth / town)
        this.ambientLight = new THREE.AmbientLight(0x808aa8, compat ? compat.scaleIntensity('ambient', 0.75) : 0.75);
        if (this.ambientLight.layers) this.ambientLight.layers.enable(1);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0x687da6, 0x18120e, compat ? compat.scaleIntensity('hemi', 0.28) : 0.28);
        if (this.hemiLight.layers) this.hemiLight.layers.enable(1);
        this.scene.add(this.hemiLight);

        // Directional Sunlight for outdoors (Town) matching Godot _sunLight (dirty-gated 1024px shadow caster)
        this.sunLight = new THREE.DirectionalLight(0xb3ccfa, compat ? compat.scaleIntensity('directional', 0.95) : 0.95);
        this.sunLight.position.set(-20, 35, 15);
        if (this.sunLight.layers) this.sunLight.layers.enable(1);
        this.sunLight.castShadow = Boolean(this._enableDynamicShadows);
        if (this.sunLight.shadow) {
            if (this.sunLight.shadow.mapSize && typeof this.sunLight.shadow.mapSize.set === 'function') {
                this.sunLight.shadow.mapSize.set(1024, 1024);
            }
            if (this.sunLight.shadow.camera) {
                this.sunLight.shadow.camera.left = -26;
                this.sunLight.shadow.camera.right = 26;
                this.sunLight.shadow.camera.top = 26;
                this.sunLight.shadow.camera.bottom = -26;
                this.sunLight.shadow.camera.near = 1.0;
                this.sunLight.shadow.camera.far = 80.0;
                if (typeof this.sunLight.shadow.camera.updateProjectionMatrix === 'function') {
                    this.sunLight.shadow.camera.updateProjectionMatrix();
                }
            }
            if (this.sunLight.shadow.bias !== undefined) {
                this.sunLight.shadow.bias = -0.0005;
            }
        }
        this.scene.add(this.sunLight);
        if (this.sunLight.target) this.scene.add(this.sunLight.target);

        // Player Torch PointLight - ATTACHED TO CAMERA (Off-axis key sculpt)
        const rawTorch = this._enableDynamicShadows ? 1.48 : 1.8;
        this.torchLight = new THREE.PointLight(0xffdc99, compat ? compat.scaleIntensity('point', rawTorch) : rawTorch, 16.0, 0.7);
        this.torchLight.position.set(-0.46, 0.28, -0.18);
        if (this.torchLight.layers) this.torchLight.layers.enable(1);
        this.camera.add(this.torchLight);

        // Dirty-gated 512x512 forward SpotLight shadow caster on discrete/high tiers (0ms cost on idle frames)
        if (this._enableDynamicShadows && typeof THREE.SpotLight === 'function') {
            this.torchSpotLight = new THREE.SpotLight(0xffdc99, compat ? compat.scaleIntensity('spot', 0.42) : 0.42, 14.5, Math.PI * 0.42, 0.65, 0.85);
            this.torchSpotLight.position.set(0.0, 0.08, -0.18);
            this.torchSpotLight.target.position.set(0.0, -0.45, -8.5);
            this.torchSpotLight.castShadow = true;
            this.torchSpotLight.shadow.mapSize.set(512, 512);
            this.torchSpotLight.shadow.bias = -0.0006;
            this.torchSpotLight.shadow.camera.near = 0.35;
            this.torchSpotLight.shadow.camera.far = 14.0;
            if (this.torchSpotLight.layers) this.torchSpotLight.layers.enable(1);
            this.camera.add(this.torchSpotLight);
            this.camera.add(this.torchSpotLight.target);
        }

        // Living Torch Colors (smooth thermodynamic color shifting between gold and warm ember)
        this.torchBaseColor = new THREE.Color(0xffdc99);
        this.torchLowColor = new THREE.Color(0xffaa55);

        // Secondary warm bounce fill light near player feet - ATTACHED TO CAMERA (keep visible=true; gate by intensity to avoid shader recompiles)
        const rawFill = budget.enableFillLight ? 0.35 : 0.0;
        this.torchFillLight = new THREE.PointLight(0xff7722, compat ? compat.scaleIntensity('point', rawFill) : rawFill, 8.0, 0.7);
        this.torchFillLight.visible = true;
        if (this.torchFillLight.layers) this.torchFillLight.layers.enable(1);
        this.torchFillLight.position.set(0.20, -0.20, -0.20);
        this.camera.add(this.torchFillLight);

        // Floating 3D Shop and Landmark Labels (Matches Godot _terrainLabels)
        this.terrainLabelsGroup = new THREE.Group();
        this.scene.add(this.terrainLabelsGroup);
        this.lastTerrainLabelsSignature = '';

        // 3D StreetView Ground Chevrons & Interactive 3D Grid Tile Targeter
        this.initStreetViewNavigation();

        // Camera must be added to scene so camera children (torch, viewmodel) are in scene graph
        this.scene.add(this.camera);

        window.addEventListener('resize', () => {
            this.resize();
        });
        if (this.canvas && typeof ResizeObserver !== 'undefined') {
            let canvasResizeRaf = null;
            this._stageResizeObserver = new ResizeObserver(() => {
                if (typeof window === 'undefined' || !window.DeviceProfile || !window.DeviceProfile.isHandheld || !window.DeviceProfile.isHandheld()) return;
                this._cachedCanvasRect = null;
                if (canvasResizeRaf) return;
                canvasResizeRaf = requestAnimationFrame(() => {
                    canvasResizeRaf = null;
                    this.resize();
                });
            });
            this._stageResizeObserver.observe(this.canvas);
        }
    }

    markShadowsDirty() {
        if (this.renderer && this.renderer.shadowMap) {
            this.renderer.shadowMap.needsUpdate = true;
        }
    }

    getBiomeProfile(depth, levelSeed = 0, realm = 'angband') {
        if (typeof window !== 'undefined' && window.Dungeon3DTactical && typeof window.Dungeon3DTactical.resolveRealmBiomeProfile === 'function') {
            return window.Dungeon3DTactical.resolveRealmBiomeProfile(this, depth, levelSeed, realm, this.lastFrame);
        }
        return {
            name: 'Dungeon',
            bgColor: 0x080a0f,
            ambientColor: 0x4e586e,
            ambientEnergy: 0.17,
            sunLight: depth <= 0,
            sunEnergy: depth <= 0 ? 1.0 : 0.0,
            fogColor: 0x0b0d14,
            fogDensity: 0.012,
            exposure: 1.10,
            torchColor: 0xffbd70,
            torchEnergy: 2.5,
            wallColor: new THREE.Color(0.76, 0.75, 0.72),
            floorColor: new THREE.Color(0.70, 0.69, 0.66),
            ceilingColor: new THREE.Color(0.56, 0.56, 0.58),
            floorRoughness: 0.80,
            wallRoughness: 0.82
        };
    }

    applyEnvironmentTextures(outdoors, biome, realm = 'angband', depth = 0, levelSeed = 0) {
        if (!this._gpuInitialized || !this.wallMaterial) {
            this._pendingEnvTexArgs = [outdoors, biome, realm, depth, levelSeed];
            return;
        }
        const branchKey = (this.lastFrame && ((this.lastFrame.player && (this.lastFrame.player.branch || this.lastFrame.player.branch_name)) || this.lastFrame.branch || this.lastFrame.branch_name)) || '';
        const ryodBiome = String(
            (this.lastFrame && (this.lastFrame.biomeTheme || (this.lastFrame.map && this.lastFrame.map.biomeTheme)))
            || (biome && (biome.ryodBiome || biome.biomeId))
            || (typeof window !== 'undefined' && window.__activeRyodBlueprint && window.__activeRyodBlueprint.biome)
            || ''
        ).toLowerCase();
        const theme = resolveContextualTheme(realm, depth, levelSeed, String(realm || '').toLowerCase() === 'ryod' ? (ryodBiome || branchKey) : (branchKey || ryodBiome));
        const themeKey = `${theme.id}|${branchKey}|${ryodBiome}`;
        if (this._currentThemeId === themeKey && this._currentTexturesAreOutdoors === outdoors) return;
        this._currentThemeId = themeKey;
        this._currentTexturesAreOutdoors = outdoors;

        const texSet = this.getContextualTextureSet(theme, outdoors) || {};
        this._lastContextualTexSet = texSet;
        const fallbackRough = this._neutralRoughnessTex || null;
        const syncMatSlots = (mat, mapTex, norTex, roughTex) => {
            if (!mat) return;
            const hadMap = Boolean(mat.map);
            const hadNor = Boolean(mat.normalMap);
            const hadRough = Boolean(mat.roughnessMap);
            if (mapTex !== undefined) mat.map = mapTex;
            if (norTex !== undefined && norTex !== null) mat.normalMap = norTex;
            if (roughTex !== undefined) mat.roughnessMap = roughTex || fallbackRough;
            if (Boolean(mat.map) !== hadMap || Boolean(mat.normalMap) !== hadNor || Boolean(mat.roughnessMap) !== hadRough) {
                mat.needsUpdate = true;
            }
        };

        syncMatSlots(this.wallMaterial, texSet.wallTex, texSet.wallNormal, texSet.wallRoughness);
        this.wallMaterial.roughness = theme.wallRoughness || 0.82;
        this.wallMaterial.normalScale.set(1.65, 1.65);

        syncMatSlots(this.floorMaterial, texSet.floorTex, texSet.floorNormal, texSet.floorRoughness);
        this.floorMaterial.roughness = theme.floorRoughness || 0.74;
        this.floorMaterial.normalScale.set(1.50, 1.50);

        syncMatSlots(this.permWallMaterial, texSet.permWallTex, texSet.permWallNormal, texSet.permWallRoughness);
        this.permWallMaterial.normalScale.set(1.65, 1.65);

        syncMatSlots(this.ceilingMaterial, texSet.ceilingTex, texSet.ceilingNormal || this.wallNormal, texSet.ceilingRoughness);
        if (this.ceilingMaterial.normalScale) {
            this.ceilingMaterial.normalScale.set(1.35, 1.35);
        }

        syncMatSlots(this.stairsMaterial, texSet.wallTex, texSet.wallNormal, texSet.wallRoughness);
        this.stairsMaterial.normalScale.set(1.65, 1.65);

        if (this.mountainMaterial && !this._hasPolyHavenMountainTex) {
            syncMatSlots(this.mountainMaterial, texSet.permWallTex, texSet.permWallNormal, undefined);
        }
        if (this.rubbleMaterial && !this._hasPolyHavenRubbleTex) {
            syncMatSlots(this.rubbleMaterial, texSet.wallTex, texSet.wallNormal, undefined);
        }
        if (this.chasmSideMaterial && !this._hasPolyHavenChasmTex) {
            syncMatSlots(this.chasmSideMaterial, texSet.permWallTex, texSet.permWallNormal, texSet.permWallRoughness);
            if (this.chasmSideMaterial.normalScale) this.chasmSideMaterial.normalScale.set(1.75, 1.75);
        }
        if (this._syncWorldPbrUniforms) {
            this._syncWorldPbrUniforms(texSet);
        }
        if (outdoors && typeof window !== 'undefined' && window.Dungeon3DTown && typeof window.Dungeon3DTown.syncTownSharedMaterials === 'function') {
            window.Dungeon3DTown.syncTownSharedMaterials(this, THREE, realm);
        }
        if (biome && biome.fixtureArchetype && window.Dungeon3DTactical && window.Dungeon3DTactical.setWallFixtureArchetype) {
            window.Dungeon3DTactical.setWallFixtureArchetype(this, biome.fixtureArchetype);
        }
        if (typeof window !== 'undefined' && window.Dungeon3DV2Pipeline && typeof window.Dungeon3DV2Pipeline.syncBiomePmrem === 'function') {
            window.Dungeon3DV2Pipeline.syncBiomePmrem(this, biome, outdoors, realm, depth);
        }
    }

    initMeshes() {
        this.maxInstances = 4096;
        this.createChamferedWallGeometry = createChamferedWallGeometry;
        this.applyWallVertexAO = applyWallVertexAO;
        const tac = (typeof window !== 'undefined' && window.Dungeon3DTactical) || null;
        const cloneBevelGeo = (geo, cap) => (tac && tac.cloneWallGeoWithBevelAttr) ? tac.cloneWallGeoWithBevelAttr(geo, cap) : geo.clone();
        const safeWallAttrs = (geo) => (tac && tac.cloneWallGeoSafeAttrs) ? tac.cloneWallGeoSafeAttrs(geo) : geo;

        // WS81: Adaptive GPU per-corner bevel prism (flush 0.0m straight walls, 0.28m indoor convex corners, 0.03m town corners)
        const wallGeo = (tac && tac.createAdaptiveWallGeometry)
            ? tac.createAdaptiveWallGeometry(this.cellSize, 3.05, false)
            : createChamferedWallGeometry(this.cellSize, this.wallHeight + 0.10, 0.40);
        if (!(tac && tac.createAdaptiveWallGeometry)) applyWallVertexAO(wallGeo, this.wallHeight + 0.10);
        // Overhead lintel spandrel prism (flat bottom AO = 1.0 so ceiling step-downs never bake floor shadow!)
        const upperWallGeo = (tac && tac.createAdaptiveWallGeometry)
            ? tac.createAdaptiveWallGeometry(this.cellSize, 3.05, true)
            : createChamferedWallGeometry(this.cellSize, 1.27, 0.40, 1.27 / (this.wallHeight + 0.10));
        if (!(tac && tac.createAdaptiveWallGeometry)) applyWallVertexAO(upperWallGeo, 1.27);
        this._cloneBevelGeo = cloneBevelGeo;
        this._safeWallAttrs = safeWallAttrs;

        // Seamless 2.00m x 2.00m exact-abutment floor (zero coplanar Z-fighting seams) & vaulted skirt ceiling
        const skirtSpan = this.cellSize + 0.06;
        const floorGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize, 2, 2);
        floorGeo.rotateX(-Math.PI / 2);
        applyFloorVertexAO(floorGeo, this.cellSize);

        // Subdivided ceiling with subtle vaulted subterranean stone arch & perimeter shadow
        const ceilingGeo = new THREE.PlaneGeometry(skirtSpan, skirtSpan, 2, 2);
        ceilingGeo.rotateX(Math.PI / 2);
        const ceilPos = ceilingGeo.attributes.position;
        for (let i = 0; i < ceilPos.count; i++) {
            const x = ceilPos.getX(i);
            const z = ceilPos.getZ(i);
            if (Math.abs(x) < 0.05 && Math.abs(z) < 0.05) {
                ceilPos.setY(i, 0.14);
            }
        }
        ceilingGeo.computeVertexNormals();
        applyCeilingVertexAO(ceilingGeo, skirtSpan);

        // Helper to construct composite PBR geometries (1:1 with Godot SurfaceTool / BuildDoorMesh)
        // # ROOT-CAUSE: Altars and fountains looked cheap and incorrect because _loadPolyHavenEnvironmentModels overwrote fountainMesh with low-poly cartoon building_well_blue.gltf and merged incompatible shrine_candles.gltf UVs into altarMesh, while createMergedBoxGeometry only supported flat BoxGeometry cubes on a single material darkened by floorShade.
        const createMergedBoxGeometry = (boxes) => {
            const geometries = boxes.map(b => {
                let geo;
                if (b.type === 'lathe' && Array.isArray(b.points)) {
                    const pts = b.points.map(p => new THREE.Vector2(p[0], p[1]));
                    geo = new THREE.LatheGeometry(
                        pts,
                        b.segments || 20,
                        b.phiStart || 0,
                        b.phiLength !== undefined ? b.phiLength : Math.PI * 2
                    );
                    geo.computeVertexNormals();
                } else if (b.type === 'cylinder') {
                    geo = createLatheFrustumGeo(
                        b.rTop !== undefined ? b.rTop : 0.5,
                        b.rBottom !== undefined ? b.rBottom : 0.5,
                        b.height !== undefined ? b.height : 1.0,
                        b.segments || 16,
                        Boolean(b.openEnded)
                    );
                } else if (b.type === 'torus') {
                    geo = new THREE.TorusGeometry(
                        b.radius !== undefined ? b.radius : 0.5,
                        b.tube !== undefined ? b.tube : 0.05,
                        b.radialSegments || 10,
                        b.tubularSegments || 24,
                        b.arc !== undefined ? b.arc : Math.PI * 2
                    );
                } else if (b.type === 'cone') {
                    geo = new THREE.ConeGeometry(
                        b.radius !== undefined ? b.radius : 0.5,
                        b.height !== undefined ? b.height : 1.0,
                        b.segments || 16,
                        b.heightSegments || 1,
                        Boolean(b.openEnded)
                    );
                } else if (b.type === 'sphere') {
                    geo = new THREE.SphereGeometry(
                        b.radius !== undefined ? b.radius : 0.5,
                        b.widthSegments || 14,
                        b.heightSegments || 10
                    );
                } else {
                    geo = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
                }
                if (b.scale) geo.scale(b.scale[0], b.scale[1], b.scale[2]);
                if (b.rotX) geo.rotateX(b.rotX);
                if (b.rotY) geo.rotateY(b.rotY);
                if (b.rotZ) geo.rotateZ(b.rotZ);
                if (b.pos) geo.translate(b.pos[0], b.pos[1], b.pos[2]);
                const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
                if (b.color) nonIndexed._boxColor = b.color;
                if (b.uvRect && nonIndexed.attributes.uv) {
                    const [u0, v0, u1, v1] = b.uvRect;
                    const uvs = nonIndexed.attributes.uv.array;
                    for (let ui = 0; ui < uvs.length; ui += 2) {
                        uvs[ui] = u0 + uvs[ui] * (u1 - u0);
                        uvs[ui + 1] = v0 + uvs[ui + 1] * (v1 - v0);
                    }
                }
                if (nonIndexed !== geo) geo.dispose();
                return nonIndexed;
            });
            let totalVerts = 0;
            for (const g of geometries) totalVerts += g.attributes.position.count;
            const posArr = new Float32Array(totalVerts * 3);
            const normArr = new Float32Array(totalVerts * 3);
            const uvArr = new Float32Array(totalVerts * 2);
            const colArr = new Float32Array(totalVerts * 3);
            colArr.fill(1.0);

            let vOffset = 0;
            for (const g of geometries) {
                posArr.set(g.attributes.position.array, vOffset * 3);
                normArr.set(g.attributes.normal.array, vOffset * 3);
                uvArr.set(g.attributes.uv.array, vOffset * 2);
                const c = g._boxColor;
                const vCount = g.attributes.position.count;
                if (c) {
                    for (let vi = 0; vi < vCount; vi++) {
                        const base = (vOffset + vi) * 3;
                        colArr[base] = c[0];
                        colArr[base + 1] = c[1];
                        colArr[base + 2] = c[2];
                    }
                }
                vOffset += vCount;
                g.dispose();
            }

            const merged = new THREE.BufferGeometry();
            merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
            merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
            merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
            merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
            return merged;
        };

        // 1. Stone Door Frame & Lintel for dungeon corridors (Matches Godot DungeonWorld.cs:1556-1575)
        const doorFrameGeo = createMergedBoxGeometry([
            { pos: [-0.85, 1.10, 0], size: [0.30, 2.40, 0.40] }, // Left jamb post
            { pos: [0.85, 1.10, 0], size: [0.30, 2.40, 0.40] },  // Right jamb post
            { pos: [0, 2.65, 0], size: [2.00, 0.70, 0.40] },     // Top stone lintel
            { pos: [0, -0.02, 0], size: [1.40, 0.08, 0.40] },    // Threshold step
            { pos: [-0.72, 1.75, 0.04], size: [0.10, 0.14, 0.16] }, // Top hinge bracket
            { pos: [-0.72, 0.55, 0.04], size: [0.10, 0.14, 0.16] }  // Bottom hinge bracket
        ]);

        // 1b-1d. Disjoint Town Storefronts, Canopies, Doors & Threshold Cutaways (dungeon3d-environment.js)
        const {
            shopStoneGeo, shopStoneOccupiedGeo, shopFrameGeo, shopAwningGeo, shopDoorGeo,
            townTimberGeo, townCornerPostGeo, stairsUpOccupiedGeo, altarOccupiedGeo, fountainOccupiedGeo
        } = this._buildThresholdAndStorefrontGeos(createMergedBoxGeometry);
        this._thresholdCutawayGeos = { stairsUpOccupiedGeo, altarOccupiedGeo, fountainOccupiedGeo };

        // Continuous flat/beveled dark weathered slate & stone parapet cap (strictly disjoint above Y=3.040m & inside ±0.997m)
        const townRoofGeo = createMergedBoxGeometry([
            { pos: [0, 3.104, 0], size: [1.994, 0.12, 1.994], color: [0.34, 0.35, 0.38] },         // Flush dark slate cornice coping: Y [3.044, 3.164]
            { pos: [0, 3.208, 0], size: [1.920, 0.08, 1.920], color: [0.24, 0.25, 0.28] }          // Low-profile dark stone parapet cap: Y [3.168, 3.248]
        ]);

        // 2. Closed Watertight Heavy Oak & Iron-Strapped Medieval Door (feat 2)
        const doorClosedGeo = createMergedBoxGeometry([
            { pos: [0, 1.16, 0], size: [1.42, 2.30, 0.12], color: [0.92, 0.84, 0.74] },       // Solid oak plank door leaf
            { pos: [0, 1.82, 0], size: [1.38, 0.11, 0.16], color: [0.30, 0.29, 0.28], uvRect: [0.08, 0.20, 0.92, 0.24] },
            { pos: [0, 1.16, 0], size: [1.38, 0.09, 0.15], color: [0.30, 0.29, 0.28], uvRect: [0.08, 0.20, 0.92, 0.24] },
            { pos: [0, 0.50, 0], size: [1.38, 0.11, 0.16], color: [0.30, 0.29, 0.28], uvRect: [0.08, 0.20, 0.92, 0.24] },
            { pos: [0.46, 1.12, 0.08], size: [0.10, 0.16, 0.06], color: [0.36, 0.34, 0.30], uvRect: [0.18, 0.20, 0.30, 0.24] },
            { pos: [0.46, 1.12, -0.08], size: [0.10, 0.16, 0.06], color: [0.36, 0.34, 0.30], uvRect: [0.18, 0.20, 0.30, 0.24] }
        ]);

        // 3. Swung-Open Medieval Door Leaf Angled Ajar 64° (strictly bounded within z <= 0.95m)
        const openYaw = 64 * Math.PI / 180;
        const panelCenterX = -0.68 + 0.50 * Math.cos(openYaw);
        const panelCenterZ = 0.02 + 0.50 * Math.sin(openYaw);
        const doorOpenGeo = createMergedBoxGeometry([
            { pos: [panelCenterX, 1.16, panelCenterZ], size: [1.00, 2.28, 0.10], rotY: -openYaw, color: [0.92, 0.84, 0.74] },
            { pos: [panelCenterX, 1.80, panelCenterZ], size: [0.98, 0.11, 0.14], rotY: -openYaw, color: [0.30, 0.29, 0.28], uvRect: [0.08, 0.20, 0.92, 0.24] },
            { pos: [panelCenterX, 0.52, panelCenterZ], size: [0.98, 0.11, 0.14], rotY: -openYaw, color: [0.30, 0.29, 0.28], uvRect: [0.08, 0.20, 0.92, 0.24] },
            { pos: [-0.68 + 0.84 * Math.cos(openYaw), 1.12, 0.02 + 0.84 * Math.sin(openYaw)], size: [0.09, 0.15, 0.14], rotY: -openYaw, color: [0.36, 0.34, 0.30], uvRect: [0.18, 0.20, 0.30, 0.24] }
        ]);

        // 4. Shattered Broken Door Planks & Splinters (explicit warm-wood vertex colors so broken doors never render black)
        const doorBrokenGeo = createMergedBoxGeometry([
            { pos: [-0.35, 0.06, 0.15], size: [0.85, 0.06, 0.26], rotY: 0.18, color: [0.62, 0.45, 0.28] },
            { pos: [0.35, 0.05, -0.15], size: [0.75, 0.05, 0.22], rotY: -0.24, color: [0.58, 0.42, 0.26] },
            { pos: [0.10, 0.09, 0.30], size: [0.60, 0.06, 0.18], rotY: 0.42, color: [0.64, 0.47, 0.30] },
            { pos: [-0.15, 0.08, -0.25], size: [0.50, 0.05, 0.20], rotY: -0.35, color: [0.60, 0.43, 0.27] },
            { pos: [-0.62, 1.70, 0.08], size: [0.26, 0.48, 0.08], rotY: -0.35, color: [0.62, 0.45, 0.28] }
        ]);

        // 5a. Watertight Sunken Descending Stone Stairwell (feat 6 '>': entrance mouth at +Z descending to -1.92m at -Z)
        const downBoxes = [
            { pos: [-0.87, 0.04, 0], size: [0.28, 0.22, 2.02], color: [0.84, 0.82, 0.78] },    // Left stone parapet curb (+0.15m)
            { pos: [0.87, 0.04, 0], size: [0.28, 0.22, 2.02], color: [0.84, 0.82, 0.78] },     // Right stone parapet curb (+0.15m)
            { pos: [0, -0.08, 0.90], size: [1.48, 0.08, 0.22], color: [0.88, 0.86, 0.82] },     // Front entrance threshold rim (+Z)
            { pos: [0, 0.05, -0.91], size: [1.48, 0.24, 0.20], color: [0.76, 0.74, 0.70] },    // Back stairwell parapet coping (-Z)
            { pos: [-0.87, 0.12, -0.90], size: [0.30, 0.28, 0.24], color: [0.86, 0.84, 0.80] }, // NW corner stone bollard
            { pos: [0.87, 0.12, -0.90], size: [0.30, 0.28, 0.24], color: [0.86, 0.84, 0.80] },  // NE corner stone bollard
            { pos: [-0.87, 0.09, 0.90], size: [0.30, 0.22, 0.24], color: [0.88, 0.86, 0.82] },  // SW entry pier bollard
            { pos: [0.87, 0.09, 0.90], size: [0.30, 0.22, 0.24], color: [0.88, 0.86, 0.82] },   // SE entry pier bollard
            { pos: [-0.86, -0.98, 0], size: [0.26, 1.96, 1.98], color: [0.56, 0.54, 0.52] },    // Left enclosed pit wall (0..-1.96m)
            { pos: [0.86, -0.98, 0], size: [0.26, 1.96, 1.98], color: [0.56, 0.54, 0.52] },     // Right enclosed pit wall (0..-1.96m)
            { pos: [0, -0.98, -0.91], size: [1.50, 1.96, 0.18], color: [0.16, 0.16, 0.20] },    // Back deep portal shadow wall (-Z)
            { pos: [0, -1.02, 0.88], size: [1.50, 1.88, 0.18], color: [0.46, 0.44, 0.42] },     // Front under-threshold riser seal
            { pos: [0, -1.94, 0], size: [1.54, 0.06, 1.88], color: [0.10, 0.10, 0.13] }         // Dark shadow bottom landing slab (-1.91m)
        ];
        for (let i = 0; i < 8; i++) {
            const stepTop = -0.15 - i * (1.70 / 7);
            const hStep = stepTop - (-1.95);
            const zStep = 0.70 - i * 0.18;
            const shade = 0.84 - i * 0.085;
            downBoxes.push({
                pos: [0, -1.95 + hStep * 0.5, zStep],
                size: [1.46, hStep, 0.20],
                color: [shade, shade * 0.98, shade * 0.95]
            });
        }
        const stairsDownGeo = createMergedBoxGeometry(downBoxes);

        // 5b. Grand Ascending Stone Staircase (feat 5 '<': 9 cut-stone steps + side stringers rising 0.0m -> 2.55m from +Z to -Z)
        const upBoxes = [];
        for (let i = 0; i < 9; i++) {
            const stepH = 0.28 + i * ((2.55 - 0.28) / 8);
            const zStep = 0.80 - i * 0.20;
            const stShade = 0.80 + (i / 8) * 0.12;
            upBoxes.push({
                pos: [0, stepH * 0.5, zStep],
                size: [1.52, stepH, 0.22],
                color: [stShade, stShade * 0.98, stShade * 0.94]
            });
            const strH = stepH + 0.18;
            upBoxes.push({ pos: [-0.86, strH * 0.5, zStep], size: [0.22, strH, 0.22], color: [0.72, 0.70, 0.66] });
            upBoxes.push({ pos: [0.86, strH * 0.5, zStep], size: [0.22, strH, 0.22], color: [0.72, 0.70, 0.66] });
        }
        const stairsUpGeo = createMergedBoxGeometry(upBoxes);

        // 6. Impassable Rubble Piles (Collapsed masonry boulders & stone talus)
        const rubbleGeo = createMergedBoxGeometry([
            { pos: [0.05, 0.65, -0.05], size: [1.20, 1.25, 1.10], rotY: 0.35, rotX: 0.12 },
            { pos: [-0.52, 0.45, 0.20], size: [0.95, 0.90, 0.95], rotY: -0.45, rotZ: 0.15 },
            { pos: [0.55, 0.42, -0.22], size: [0.95, 0.85, 0.90], rotY: 0.55, rotZ: -0.18 },
            { pos: [-0.18, 0.28, 0.55], size: [1.00, 0.55, 0.80], rotY: -0.20, rotX: -0.15 },
            { pos: [0.22, 0.30, -0.55], size: [0.95, 0.60, 0.75], rotY: 0.40, rotX: 0.18 },
            { pos: [0.68, 0.18, 0.45], size: [0.70, 0.35, 0.65], rotY: -0.65, rotZ: 0.10 },
            { pos: [-0.68, 0.16, -0.45], size: [0.65, 0.32, 0.70], rotY: 0.75, rotZ: -0.12 },
            { pos: [-0.10, 0.85, 0.08], size: [0.70, 0.50, 0.65], rotY: 0.80, rotX: 0.22 }
        ]);

        // 6b. Discovered Floor Traps (feat 1 with glyph '^'): Metallic trigger plate with crossbar runes
        const trapGeo = createMergedBoxGeometry([
            { pos: [0, 0.02, 0], size: [1.10, 0.04, 1.10] },
            { pos: [0, 0.05, 0], size: [0.70, 0.03, 0.14] },
            { pos: [0, 0.05, 0], size: [0.14, 0.03, 0.70] },
            { pos: [-0.40, 0.05, -0.40], size: [0.08, 0.03, 0.08] },
            { pos: [0.40, 0.05, -0.40], size: [0.08, 0.03, 0.08] },
            { pos: [-0.40, 0.05, 0.40], size: [0.08, 0.03, 0.08] },
            { pos: [0.40, 0.05, 0.40], size: [0.08, 0.03, 0.08] }
        ]);
        const mkBudgetMat = (opts) => (typeof window !== 'undefined' && window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.createBudgetMaterial === 'function')
            ? window.Dungeon3DAtmosphere.createBudgetMaterial(this, opts)
            : new THREE.MeshStandardMaterial(opts);
        this.trapMaterial = mkBudgetMat({
            roughness: 0.40,
            metalness: 0.70,
            vertexColors: true
        });
        this.trapMesh = new THREE.InstancedMesh(trapGeo, this.trapMaterial, 128);
        this.trapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.trapMesh);

        // 6c. Pit / Trapdoor Traps (dark recessed collar around pit drop)
        const trapPitGeo = createMergedBoxGeometry([
            { pos: [0, 0.008, 0], size: [1.14, 0.016, 1.14], color: [0.06, 0.06, 0.08] },
            { pos: [0, 0.04, -0.60], size: [1.32, 0.06, 0.14], color: [0.64, 0.62, 0.58] },
            { pos: [0, 0.04, 0.60], size: [1.32, 0.06, 0.14], color: [0.64, 0.62, 0.58] },
            { pos: [-0.60, 0.04, 0], size: [0.14, 0.06, 1.06], color: [0.64, 0.62, 0.58] },
            { pos: [0.60, 0.04, 0], size: [0.14, 0.06, 1.06], color: [0.64, 0.62, 0.58] }
        ]);
        this.trapPitMesh = new THREE.InstancedMesh(trapPitGeo, this.trapMaterial, 128);
        this.trapPitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.trapPitMesh);

        // 6d. Arcane / Teleport / Gas / Summon Rune Traps (glowing hexagonal floor ward)
        const trapRuneGeo = new THREE.RingGeometry(0.36, 0.52, 6);
        trapRuneGeo.rotateX(-Math.PI / 2);
        this.trapRuneMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xc084fc,
            emissiveIntensity: 0.65,
            roughness: 0.34,
            metalness: 0.25,
            transparent: true,
            opacity: 0.90,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.trapRuneMesh = new THREE.InstancedMesh(trapRuneGeo, this.trapRuneMaterial, 128);
        this.trapRuneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.trapRuneMesh);

        // 6e. Spider Webs (crossed silk strands suspended across dungeon corridor)
        const webGeo = createMergedBoxGeometry([
            { pos: [0, 0.80, 0], size: [1.72, 0.045, 0.045], rotZ: 0.58, color: [0.92, 0.94, 0.98] },
            { pos: [0, 0.80, 0], size: [1.72, 0.045, 0.045], rotZ: -0.58, color: [0.92, 0.94, 0.98] },
            { pos: [0, 0.85, 0], size: [0.045, 0.045, 1.72], rotX: 0.52, color: [0.88, 0.90, 0.96] },
            { pos: [0, 0.85, 0], size: [0.045, 0.045, 1.72], rotX: -0.52, color: [0.88, 0.90, 0.96] },
            { pos: [0, 0.45, 0], size: [1.45, 0.035, 0.035], rotY: 0.78, color: [0.85, 0.88, 0.95] },
            { pos: [0, 1.20, 0], size: [1.40, 0.035, 0.035], rotY: -0.78, color: [0.85, 0.88, 0.95] }
        ]);
        this.webMaterial = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            roughness: 0.65,
            metalness: 0.05,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            vertexColors: true
        });
        this.webMesh = new THREE.InstancedMesh(webGeo, this.webMaterial, 128);
        this.webMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.webMesh);

        // 6f. Runes & Glyphs of Warding (octagonal consecrated floor ward)
        const runeGeo = new THREE.RingGeometry(0.42, 0.58, 8);
        runeGeo.rotateX(-Math.PI / 2);
        this.runeMaterial = new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.72,
            roughness: 0.28,
            metalness: 0.35,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.runeMesh = new THREE.InstancedMesh(runeGeo, this.runeMaterial, 128);
        this.runeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.runeMesh);

        // 6g. Locked / Jammed Door Crossbars (yellow brass 'locked' vs red iron 'jammed')
        const doorLockGeo = createMergedBoxGeometry([
            { pos: [0, 1.18, 0], size: [1.36, 0.14, 0.22], color: [0.95, 0.95, 0.95] },
            { pos: [0.44, 1.16, 0], size: [0.18, 0.28, 0.26], color: [1.0, 1.0, 1.0] }
        ]);
        this.doorLockMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.28,
            metalness: 0.82,
            vertexColors: true
        });
        this.doorLockMesh = new THREE.InstancedMesh(doorLockGeo, this.doorLockMaterial, 128);
        this.doorLockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.doorLockMesh);

        // 6h. Special Building Guild/Inn Double Doors (feat 32..40 outdoors without 1..8 store numerals)
        const specialShopDoorGeo = createMergedBoxGeometry([
            { pos: [0, 1.16, 0], size: [1.44, 2.30, 0.14], color: [0.76, 0.56, 0.38] },
            { pos: [0, 1.16, 0], size: [0.09, 2.28, 0.18], color: [0.28, 0.26, 0.24] },
            { pos: [0, 2.38, 0], size: [1.62, 0.24, 0.22], color: [0.85, 0.72, 0.38] },
            { pos: [-0.26, 1.12, 0], size: [0.10, 0.18, 0.20], color: [0.92, 0.78, 0.32] },
            { pos: [0.26, 1.12, 0], size: [0.10, 0.18, 0.20], color: [0.92, 0.78, 0.32] }
        ]);
        this.specialShopDoorMesh = new THREE.InstancedMesh(specialShopDoorGeo, this.doorMaterial, 64);
        this.specialShopDoorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.specialShopDoorMesh);

        // 6i. Sil-Q 2-Floor Shaft Square Timber/Brass Rim Indicator
        const shaftRimGeo = new THREE.RingGeometry(0.84, 1.02, 4);
        shaftRimGeo.rotateX(-Math.PI / 2);
        shaftRimGeo.rotateY(Math.PI / 4);
        this.shaftRimMaterial = new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.62,
            roughness: 0.35,
            metalness: 0.60,
            side: THREE.DoubleSide
        });
        this.shaftRimMesh = new THREE.InstancedMesh(shaftRimGeo, this.shaftRimMaterial, 32);
        this.shaftRimMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.shaftRimMesh);

        this.wallMesh = new THREE.InstancedMesh(cloneBevelGeo(wallGeo, this.maxInstances * 2), this.wallMaterial, this.maxInstances * 2);
        this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.wallMesh.receiveShadow = true;
        this.scene.add(this.wallMesh);

        this.upperWallMesh = new THREE.InstancedMesh(cloneBevelGeo(upperWallGeo, this.maxInstances), this.wallMaterial, this.maxInstances);
        this.upperWallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.upperWallMesh);

        // Cyclopean Permanent Bedrock & Outer Fortress Ramparts (feat 22)
        this.permWallMesh = new THREE.InstancedMesh(cloneBevelGeo(wallGeo, this.maxInstances * 2), this.permWallMaterial, this.maxInstances * 2);
        this.permWallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.permWallMesh.receiveShadow = true;
        this.scene.add(this.permWallMesh);

        this.upperPermWallMesh = new THREE.InstancedMesh(cloneBevelGeo(upperWallGeo, this.maxInstances), this.permWallMaterial, this.maxInstances);
        this.upperPermWallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.upperPermWallMesh);

        this.floorMesh = new THREE.InstancedMesh(floorGeo, this.floorMaterial, this.maxInstances * 2);
        this.floorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.floorMesh.castShadow = false;
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        this.ceilingMesh = new THREE.InstancedMesh(ceilingGeo, this.ceilingMaterial, this.maxInstances * 2);
        this.ceilingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ceilingMesh.castShadow = false;
        this.ceilingMesh.receiveShadow = true;
        this.scene.add(this.ceilingMesh);

        // Stone Doorways (Frames & Lintels for town & dungeon)
        this.doorFrameMesh = new THREE.InstancedMesh(safeWallAttrs(doorFrameGeo), this.wallMaterial, 512);
        this.doorFrameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.doorFrameMesh);

        // Disjoint Town Storefront Timber & Stone Masonry Meshes
        const woodPbr = this.polyHavenSets && this.polyHavenSets.get('local_wood_trim');
        this.shopFrameMaterial = new THREE.MeshStandardMaterial({
            map: (woodPbr && woodPbr.diff) || this.doorTex || this.wallTex,
            normalMap: (woodPbr && woodPbr.nor) || this.treeBarkNormal || this.wallNormal,
            roughnessMap: (woodPbr && woodPbr.arm) || null,
            normalScale: new THREE.Vector2(1.45, 1.45),
            roughness: 0.76,
            metalness: 0.08,
            vertexColors: true
        });
        this.shopFrameMesh = new THREE.InstancedMesh(shopFrameGeo, this.shopFrameMaterial, 64);
        this.shopFrameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.shopFrameMesh);

        this.shopStoneMaterial = (typeof window !== 'undefined' && window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.createBudgetMaterial === 'function')
            ? window.Dungeon3DAtmosphere.createBudgetMaterial(this, {
                map: this.wallTex,
                normalMap: this.wallNormal,
                roughnessMap: null,
                normalScale: new THREE.Vector2(1.30, 1.30),
                roughness: 0.80,
                metalness: 0.05,
                vertexColors: true
            })
            : new THREE.MeshStandardMaterial({
                map: this.wallTex,
                normalMap: this.wallNormal,
                roughnessMap: null,
                normalScale: new THREE.Vector2(1.30, 1.30),
                roughness: 0.80,
                metalness: 0.05,
                vertexColors: true
            });
        this.shopStoneMesh = new THREE.InstancedMesh(shopStoneGeo, this.shopStoneMaterial, 64);
        this.shopStoneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.shopStoneMesh);

        this.shopStoneOccupiedMesh = new THREE.InstancedMesh(shopStoneOccupiedGeo, this.shopStoneMaterial, 16);
        this.shopStoneOccupiedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.shopStoneOccupiedMesh);

        // Sloped Merchant Storefront Canopy / Awning
        this.shopAwningMaterial = (typeof window !== 'undefined' && window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.createBudgetMaterial === 'function')
            ? window.Dungeon3DAtmosphere.createBudgetMaterial(this, {
                map: this.storeTex || this.wallTex,
                normalMap: this.wallNormal,
                normalScale: new THREE.Vector2(1.25, 1.25),
                roughness: 0.80,
                metalness: 0.05,
                vertexColors: true
            })
            : new THREE.MeshStandardMaterial({
                map: this.storeTex || this.wallTex,
                normalMap: this.wallNormal,
                normalScale: new THREE.Vector2(1.25, 1.25),
                roughness: 0.80,
                metalness: 0.05,
                vertexColors: true
            });
        this.shopAwningMesh = new THREE.InstancedMesh(shopAwningGeo, this.shopAwningMaterial, 256);
        this.shopAwningMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.shopAwningMesh);

        // Town Building Dressed Stone & Dark Timber Framing + Exterior Corner Posts
        this.townTimberMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3525,
            map: this.doorTex || this.wallTex,
            normalMap: this.treeBarkNormal || this.wallNormal,
            roughnessMap: null,
            normalScale: new THREE.Vector2(1.25, 1.25),
            roughness: 0.86,
            metalness: 0.04,
            vertexColors: true
        });
        this.townTimberMesh = new THREE.InstancedMesh(townTimberGeo, this.townTimberMaterial, this.maxInstances);
        this.townTimberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.townTimberMesh);

        this.townTimberPostMesh = new THREE.InstancedMesh(townCornerPostGeo, this.townTimberMaterial, this.maxInstances);
        this.townTimberPostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.townTimberPostMesh);

        this.townRoofMaterial = new THREE.MeshStandardMaterial({
            map: this.wallTex,
            normalMap: this.wallNormal,
            roughnessMap: null,
            normalScale: new THREE.Vector2(1.40, 1.40),
            roughness: 0.82,
            metalness: 0.08,
            vertexColors: true
        });
        this.townRoofMesh = new THREE.InstancedMesh(townRoofGeo, this.townRoofMaterial, this.maxInstances);
        this.townRoofMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.townRoofMesh.receiveShadow = true;
        this.scene.add(this.townRoofMesh);
        if (typeof window !== 'undefined' && window.Dungeon3DTown && typeof window.Dungeon3DTown.syncTownSharedMaterials === 'function') {
            window.Dungeon3DTown.syncTownSharedMaterials(this, THREE, this.realm || 'angband');
        }

        // Impassable Rubble Piles (feat 16)
        this.rubbleMesh = new THREE.InstancedMesh(safeWallAttrs(rubbleGeo), this.rubbleMaterial || this.wallMaterial, 256);
        this.rubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.rubbleMesh);

        // Closed Dungeon Door (feat 2)
        if (this.doorMaterial) {
            this.doorMaterial.roughness = 0.80;
            this.doorMaterial.metalness = 0.12;
            this.doorMaterial.vertexColors = true;
        }
        this.doorMesh = new THREE.InstancedMesh(doorClosedGeo, this.doorMaterial, 512);
        this.doorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.doorMesh);

        // Open Dungeon Door (feat 3)
        this.doorOpenMesh = new THREE.InstancedMesh(doorOpenGeo, this.doorMaterial, 256);
        this.doorOpenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.doorOpenMesh);

        // Broken Dungeon Door (feat 4)
        this.doorBrokenMesh = new THREE.InstancedMesh(doorBrokenGeo, this.doorMaterial, 256);
        this.doorBrokenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.doorBrokenMesh);

        // 8 Shop Entrance Meshes with Heraldic Bronze Plaques
        this.shopMeshes = [];
        for (let i = 0; i < 8; i++) {
            const mesh = new THREE.InstancedMesh(shopDoorGeo, this.shopDoorMaterials[i], 64);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(mesh);
            this.shopMeshes.push(mesh);
        }

        const veinBaseGeo = (tac && typeof tac.createCraggyVeinWallGeometry === 'function')
            ? tac.createCraggyVeinWallGeometry(this.cellSize, 3.05)
            : wallGeo;

        this.magmaMesh = new THREE.InstancedMesh(cloneBevelGeo(veinBaseGeo, 1024), this.magmaMaterial, 1024);
        this.magmaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.magmaMesh);

        this.quartzMesh = new THREE.InstancedMesh(cloneBevelGeo(veinBaseGeo, 1024), this.quartzMaterial, 1024);
        this.quartzMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.quartzMesh);

        // Magma Vein with Gold Treasure (feat 19: MAGMA_K)
        this.goldVeinMesh = new THREE.InstancedMesh(cloneBevelGeo(veinBaseGeo, 1024), this.goldVeinMaterial, 1024);
        this.goldVeinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.goldVeinMesh);

        // Quartz Vein with Gemstones (feat 20: QUARTZ_K)
        this.gemVeinMesh = new THREE.InstancedMesh(cloneBevelGeo(veinBaseGeo, 1024), this.gemVeinMaterial, 1024);
        this.gemVeinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.gemVeinMesh);
        if (veinBaseGeo !== wallGeo && typeof veinBaseGeo.dispose === 'function') veinBaseGeo.dispose();

        // Forest Trees (feat 25: TREE)
        const addWhiteVertexColors = (geo) => {
            const count = geo.attributes.position ? geo.attributes.position.count : 0;
            if (count > 0) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1.0), 3));
            return geo;
        };
        const treeTrunkGeo = (typeof this.createBotanicalTreeTrunkGeometry === 'function')
            ? this.createBotanicalTreeTrunkGeometry()
            : addWhiteVertexColors(new THREE.ConeGeometry(0.18, 2.2, 6));
        if (typeof this.createBotanicalTreeTrunkGeometry !== 'function') treeTrunkGeo.translate(0, 1.1, 0);
        this.treeTrunkMesh = new THREE.InstancedMesh(treeTrunkGeo, this.treeTrunkMat, this.maxInstances);
        this.treeTrunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.treeTrunkMesh.castShadow = false;
        this.treeTrunkMesh.receiveShadow = true;
        this.scene.add(this.treeTrunkMesh);

        const treeLeavesGeo = (typeof this.createBotanicalTreeCanopyGeometry === 'function')
            ? this.createBotanicalTreeCanopyGeometry()
            : addWhiteVertexColors(new THREE.DodecahedronGeometry(0.95, 1));
        if (typeof this.createBotanicalTreeCanopyGeometry !== 'function') treeLeavesGeo.translate(0, 1.8, 0);
        this.treeLeavesMesh = new THREE.InstancedMesh(treeLeavesGeo, this.treeLeavesMat, this.maxInstances);
        this.treeLeavesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.treeLeavesMesh.castShadow = false;
        this.treeLeavesMesh.receiveShadow = true;
        this.scene.add(this.treeLeavesMesh);

        // Dense Brush / Thicket / Flowers (feat 42: BUSH / BRAKE)
        const bushGeo = (typeof this.createBotanicalBushGeometry === 'function')
            ? this.createBotanicalBushGeometry()
            : addWhiteVertexColors(new THREE.DodecahedronGeometry(0.48, 1));
        if (typeof this.createBotanicalBushGeometry !== 'function') bushGeo.translate(0, 0.35, 0);
        this.bushMesh = new THREE.InstancedMesh(bushGeo, this.treeLeavesMat, this.maxInstances);
        this.bushMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.bushMesh.castShadow = false;
        this.bushMesh.receiveShadow = true;
        this.scene.add(this.bushMesh);

        // Verdant Meadow Grass (feat 26: GRASS)
        this.grassMesh = new THREE.InstancedMesh(floorGeo, this.grassMaterial, this.maxInstances);
        this.grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.grassMesh.castShadow = false;
        this.grassMesh.receiveShadow = true;
        this.scene.add(this.grassMesh);

        // Packed Dirt Road / Trail (feat 27: DIRT)
        this.dirtMesh = new THREE.InstancedMesh(floorGeo, this.dirtMaterial, this.maxInstances);
        this.dirtMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.dirtMesh.castShadow = false;
        this.dirtMesh.receiveShadow = true;
        this.scene.add(this.dirtMesh);

        // Shallow Sparkling Water (feat 28: SHALLOW_WATER)
        this.waterMesh = new THREE.InstancedMesh(floorGeo, this.waterMaterial, this.maxInstances);
        this.waterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.waterMesh.castShadow = false;
        this.waterMesh.receiveShadow = true;
        this.scene.add(this.waterMesh);

        // Deep Oceanic Water (feat 29: DEEP_WATER)
        this.deepWaterMesh = new THREE.InstancedMesh(floorGeo, this.deepWaterMaterial, this.maxInstances);
        this.deepWaterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.deepWaterMesh.castShadow = false;
        this.deepWaterMesh.receiveShadow = true;
        this.scene.add(this.deepWaterMesh);

        // Watertight Cut-Stone Shoreline Curbs along liquid tile borders
        const waterBankGeo = createMergedBoxGeometry([
            { pos: [0, 0, 0], size: [2.04, 0.16, 0.16], color: [0.68, 0.66, 0.62] }
        ]);
        this.waterBankMesh = new THREE.InstancedMesh(safeWallAttrs(waterBankGeo), this.wallMaterial, 1024);
        this.waterBankMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.waterBankMesh);

        // Alpine Mountain Crags (feat 30: MOUNTAIN)
        const mountainGeo = createMergedBoxGeometry([
            { pos: [0, 1.5, 0], size: [2.0, 3.0, 2.0] },
            { pos: [0, 3.5, 0], size: [1.4, 1.3, 1.4], rotY: 0.4 },
            { pos: [0, 4.3, 0], size: [0.7, 0.8, 0.7], rotY: -0.3 }
        ]);
        this.mountainMesh = new THREE.InstancedMesh(mountainGeo, this.mountainMaterial, this.maxInstances);
        this.mountainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.mountainMesh);

        // Swamp & Wetland Marsh (feat 31: SWAMP)
        this.swampMesh = new THREE.InstancedMesh(floorGeo, this.swampMaterial, this.maxInstances);
        this.swampMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.swampMesh.castShadow = false;
        this.swampMesh.receiveShadow = true;
        this.scene.add(this.swampMesh);

        this.lavaMesh = new THREE.InstancedMesh(floorGeo, this.lavaMaterial, 512);
        this.lavaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.lavaMesh.castShadow = false;
        this.lavaMesh.receiveShadow = true;
        this.scene.add(this.lavaMesh);

        this.lavaCooledMesh = new THREE.InstancedMesh(floorGeo, this.lavaCooledMaterial, 512);
        this.lavaCooledMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.lavaCooledMesh.castShadow = false;
        this.lavaCooledMesh.receiveShadow = true;
        this.scene.add(this.lavaCooledMesh);

        if (this.stairsMaterial) this.stairsMaterial.vertexColors = true;
        // Down Staircase (feat 6)
        this.stairsMesh = new THREE.InstancedMesh(stairsDownGeo, this.stairsMaterial, 128);
        this.stairsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.stairsMesh);

        // Up Staircase (feat 5)
        this.stairsUpMesh = new THREE.InstancedMesh(stairsUpGeo, this.stairsMaterial, 128);
        this.stairsUpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.stairsUpMesh);

        // # ROOT-CAUSE: Replace flat single-material box stacks for High Altars and Magic Fountains with 3-layer sculpted PBR geometries (carved stone/marble + burnished brass/orichalcum + animated sacred flames / scrolling crystalline water).
        // 7. Consecrated High Altar (feat 43: '_') - 3-Layer Sculpted Gothic Sanctuary Dais, Orichalcum Relics & Sacred Fire
        const altarStoneParts = [
            // Two-tier stepped sanctuary dais with beveled moldings & crimson stair runner
            { pos: [0, 0.045, 0], size: [1.68, 0.09, 1.28], color: [0.76, 0.74, 0.69] },
            { pos: [0, 0.10, 0], size: [1.60, 0.03, 1.20], color: [0.84, 0.81, 0.76] },
            { pos: [0, 0.16, 0], size: [1.42, 0.09, 1.04], color: [0.86, 0.83, 0.78] },
            { pos: [0, 0.165, 0], size: [0.46, 0.10, 1.06], color: [0.64, 0.09, 0.12] },
            // Molded altar base plinth & carved Gothic stone chest
            { pos: [0, 0.24, 0], size: [1.20, 0.08, 0.82], color: [0.82, 0.79, 0.74] },
            { pos: [0, 0.50, 0], size: [1.08, 0.46, 0.68], color: [0.91, 0.88, 0.83] },
            // Recessed dark-basalt Gothic arcade panels flanking the central frontal
            { pos: [-0.35, 0.50, 0], size: [0.24, 0.34, 0.71], color: [0.30, 0.32, 0.37] },
            { pos: [0.35, 0.50, 0], size: [0.24, 0.34, 0.71], color: [0.30, 0.32, 0.37] },
            { pos: [0, 0.50, 0], size: [1.11, 0.34, 0.36], color: [0.30, 0.32, 0.37] },
            // 4 Fluted marble corner colonnettes
            { type: 'cylinder', rTop: 0.064, rBottom: 0.068, height: 0.46, segments: 12, pos: [-0.50, 0.50, -0.31], color: [0.96, 0.94, 0.89] },
            { type: 'cylinder', rTop: 0.064, rBottom: 0.068, height: 0.46, segments: 12, pos: [0.50, 0.50, -0.31], color: [0.96, 0.94, 0.89] },
            { type: 'cylinder', rTop: 0.064, rBottom: 0.068, height: 0.46, segments: 12, pos: [-0.50, 0.50, 0.31], color: [0.96, 0.94, 0.89] },
            { type: 'cylinder', rTop: 0.064, rBottom: 0.068, height: 0.46, segments: 12, pos: [0.50, 0.50, 0.31], color: [0.96, 0.94, 0.89] },
            // Overhanging sacrificial mensa slab & lower cyma molding
            { pos: [0, 0.74, 0], size: [1.18, 0.04, 0.78], color: [0.88, 0.85, 0.80] },
            { pos: [0, 0.81, 0], size: [1.30, 0.10, 0.88], color: [0.97, 0.95, 0.91] },
            // Imperial crimson velvet antependium frontal & mensa cloth runner
            { pos: [0, 0.51, 0], size: [0.42, 0.50, 0.73], color: [0.72, 0.10, 0.13] },
            { pos: [0, 0.865, 0], size: [0.44, 0.02, 0.90], color: [0.76, 0.11, 0.14] },
            // Open illuminated sanctuary missal on angled lectern (left side of mensa)
            { pos: [-0.25, 0.88, 0.14], size: [0.22, 0.03, 0.18], rotX: 0.28, rotY: 0.18, color: [0.44, 0.15, 0.10] },
            { pos: [-0.25, 0.895, 0.14], size: [0.20, 0.02, 0.16], rotX: 0.28, rotY: 0.18, color: [0.98, 0.95, 0.86] },
            // Twin tall ivory beeswax sanctuary candles
            { type: 'cylinder', rTop: 0.028, rBottom: 0.032, height: 0.22, segments: 12, pos: [-0.44, 1.09, 0], color: [0.98, 0.95, 0.85] },
            { type: 'cylinder', rTop: 0.028, rBottom: 0.032, height: 0.22, segments: 12, pos: [0.44, 1.09, 0], color: [0.98, 0.95, 0.85] }
        ];
        const altarGeo = createMergedBoxGeometry(altarStoneParts);
        this.altarMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.floorTex,
            normalMap: this.wallNormal,
            normalScale: new THREE.Vector2(1.15, 1.15),
            roughness: 0.48,
            metalness: 0.08,
            emissive: new THREE.Color(0x1c1408),
            emissiveIntensity: 0.28,
            vertexColors: true
        });
        this.altarMesh = new THREE.InstancedMesh(altarGeo, this.altarMaterial, 64);
        this.altarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.altarMesh);

        // Layer 7B: Burnished Orichalcum / Gold Altar Relics (Candlesticks, Chalice, Altar Horns & Solar Medallions)
        const candlestickProfile = [
            [0.00, 0.00], [0.095, 0.00], [0.088, 0.022], [0.042, 0.042],
            [0.026, 0.065], [0.052, 0.085], [0.025, 0.105], [0.076, 0.125],
            [0.072, 0.135], [0.034, 0.132], [0.00, 0.130]
        ];
        const chaliceProfile = [
            [0.00, 0.00], [0.135, 0.00], [0.125, 0.022], [0.055, 0.045],
            [0.038, 0.075], [0.072, 0.102], [0.040, 0.128], [0.115, 0.155],
            [0.168, 0.205], [0.180, 0.230], [0.162, 0.232], [0.130, 0.175], [0.00, 0.168]
        ];
        const hornProfile = [
            [0.00, 0.00], [0.068, 0.00], [0.058, 0.035], [0.040, 0.085], [0.018, 0.135], [0.00, 0.155]
        ];
        const altarBrassParts = [
            // Gilded cornice molding & antependium gold bullion fringe
            { pos: [0, 0.755, 0], size: [1.22, 0.032, 0.82], color: [1.00, 0.84, 0.36] },
            { pos: [0, 0.27, 0], size: [0.44, 0.032, 0.74], color: [1.00, 0.82, 0.32] },
            { pos: [0, 0.862, 0], size: [0.46, 0.016, 0.91], color: [1.00, 0.84, 0.36] },
            // 4 Column bases & 4 Corinthian capitals
            { type: 'cylinder', rTop: 0.082, rBottom: 0.088, height: 0.04, segments: 12, pos: [-0.50, 0.29, -0.31], color: [0.96, 0.78, 0.30] },
            { type: 'cylinder', rTop: 0.082, rBottom: 0.088, height: 0.04, segments: 12, pos: [0.50, 0.29, -0.31], color: [0.96, 0.78, 0.30] },
            { type: 'cylinder', rTop: 0.082, rBottom: 0.088, height: 0.04, segments: 12, pos: [-0.50, 0.29, 0.31], color: [0.96, 0.78, 0.30] },
            { type: 'cylinder', rTop: 0.082, rBottom: 0.088, height: 0.04, segments: 12, pos: [0.50, 0.29, 0.31], color: [0.96, 0.78, 0.30] },
            { type: 'cylinder', rTop: 0.088, rBottom: 0.072, height: 0.045, segments: 12, pos: [-0.50, 0.71, -0.31], color: [1.00, 0.84, 0.36] },
            { type: 'cylinder', rTop: 0.088, rBottom: 0.072, height: 0.045, segments: 12, pos: [0.50, 0.71, -0.31], color: [1.00, 0.84, 0.36] },
            { type: 'cylinder', rTop: 0.088, rBottom: 0.072, height: 0.045, segments: 12, pos: [-0.50, 0.71, 0.31], color: [1.00, 0.84, 0.36] },
            { type: 'cylinder', rTop: 0.088, rBottom: 0.072, height: 0.045, segments: 12, pos: [0.50, 0.71, 0.31], color: [1.00, 0.84, 0.36] },
            // Front & Back Solar Cross Medallions on the crimson antependium
            { type: 'torus', radius: 0.11, tube: 0.016, radialSegments: 10, tubularSegments: 20, pos: [0, 0.52, 0.37], color: [1.00, 0.86, 0.38] },
            { pos: [0, 0.52, 0.37], size: [0.032, 0.25, 0.022], color: [1.00, 0.88, 0.42] },
            { pos: [0, 0.52, 0.37], size: [0.25, 0.032, 0.022], color: [1.00, 0.88, 0.42] },
            { type: 'torus', radius: 0.11, tube: 0.016, radialSegments: 10, tubularSegments: 20, pos: [0, 0.52, -0.37], color: [1.00, 0.86, 0.38] },
            { pos: [0, 0.52, -0.37], size: [0.032, 0.25, 0.022], color: [1.00, 0.88, 0.42] },
            { pos: [0, 0.52, -0.37], size: [0.25, 0.032, 0.022], color: [1.00, 0.88, 0.42] },
            // 4 Consecrated Altar Horns at the corners of the mensa
            { type: 'lathe', points: hornProfile, segments: 14, pos: [-0.56, 0.86, -0.36], rotZ: 0.18, rotX: -0.18, color: [1.00, 0.85, 0.36] },
            { type: 'lathe', points: hornProfile, segments: 14, pos: [0.56, 0.86, -0.36], rotZ: -0.18, rotX: -0.18, color: [1.00, 0.85, 0.36] },
            { type: 'lathe', points: hornProfile, segments: 14, pos: [-0.56, 0.86, 0.36], rotZ: 0.18, rotX: 0.18, color: [1.00, 0.85, 0.36] },
            { type: 'lathe', points: hornProfile, segments: 14, pos: [0.56, 0.86, 0.36], rotZ: -0.18, rotX: 0.18, color: [1.00, 0.85, 0.36] },
            // Twin Turned Brass Sanctuary Candlesticks & Central Sacrificial Chalice
            { type: 'lathe', points: candlestickProfile, segments: 18, pos: [-0.44, 0.86, 0], color: [1.00, 0.84, 0.35] },
            { type: 'lathe', points: candlestickProfile, segments: 18, pos: [0.44, 0.86, 0], color: [1.00, 0.84, 0.35] },
            { type: 'lathe', points: chaliceProfile, segments: 24, pos: [0, 0.86, 0], color: [1.00, 0.88, 0.42] }
        ];
        const altarBrassGeo = createMergedBoxGeometry(altarBrassParts);
        this.altarBrassMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdf80,
            normalMap: this.floorNormal,
            normalScale: new THREE.Vector2(0.38, 0.38),
            roughness: 0.20,
            metalness: 0.88,
            emissive: new THREE.Color(0x3a2406),
            emissiveIntensity: 0.38,
            vertexColors: true
        });
        this.altarBrassMesh = new THREE.InstancedMesh(altarBrassGeo, this.altarBrassMaterial, 64);
        this.altarBrassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.altarBrassMesh);

        // Layer 7C: Living Sacred Flames & Consecrated Floor Halo Ring
        const chaliceFlameProfile = [
            [0.00, 0.00], [0.095, 0.025], [0.105, 0.085], [0.068, 0.165], [0.024, 0.235], [0.00, 0.275]
        ];
        const candleFlameProfile = [
            [0.00, 0.00], [0.028, 0.018], [0.032, 0.045], [0.018, 0.085], [0.00, 0.115]
        ];
        const altarFlameParts = [
            // Central chalice glowing ember bed + outer amber flame + inner white-gold core
            { type: 'cylinder', rTop: 0.145, rBottom: 0.125, height: 0.025, segments: 18, pos: [0, 1.05, 0], color: [1.00, 0.52, 0.12] },
            { type: 'lathe', points: chaliceFlameProfile, segments: 18, pos: [0, 1.055, 0], color: [1.00, 0.78, 0.24] },
            { type: 'cone', radius: 0.055, height: 0.19, segments: 14, pos: [0, 1.14, 0], color: [1.00, 0.98, 0.86] },
            // Left & right candle flames
            { type: 'lathe', points: candleFlameProfile, segments: 14, pos: [-0.44, 1.20, 0], color: [1.00, 0.88, 0.38] },
            { type: 'cone', radius: 0.016, height: 0.075, segments: 10, pos: [-0.44, 1.235, 0], color: [1.00, 1.00, 0.92] },
            { type: 'lathe', points: candleFlameProfile, segments: 14, pos: [0.44, 1.20, 0], color: [1.00, 0.88, 0.38] },
            { type: 'cone', radius: 0.016, height: 0.075, segments: 10, pos: [0.44, 1.235, 0], color: [1.00, 1.00, 0.92] },
            // Consecrated Sanctuary Floor Halo Ring
            { type: 'torus', radius: 0.92, tube: 0.013, radialSegments: 8, tubularSegments: 32, rotX: Math.PI / 2, pos: [0, 0.022, 0], color: [1.00, 0.82, 0.32] }
        ];
        const altarFlameGeo = createMergedBoxGeometry(altarFlameParts);
        this.altarFlameMaterial = new THREE.MeshStandardMaterial({
            color: 0xfff6d6,
            emissive: new THREE.Color(0xff9d1a),
            emissiveIntensity: 2.25,
            roughness: 0.12,
            metalness: 0.0,
            transparent: true,
            opacity: 0.93,
            vertexColors: true
        });
        this.altarFlameMesh = new THREE.InstancedMesh(altarFlameGeo, this.altarFlameMaterial, 64);
        this.altarFlameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.altarFlameMesh);

        // Wrought-Iron Dungeon Wall Torch Sconces & Flickering Torch Flames
        const wallTorchGeo = createMergedBoxGeometry([
            { pos: [0, -0.02, 0.02], size: [0.10, 0.24, 0.04], color: [0.24, 0.23, 0.22] },
            { pos: [0, 0.02, 0.10], size: [0.05, 0.05, 0.16], color: [0.24, 0.23, 0.22] },
            { type: 'cylinder', rTop: 0.032, rBottom: 0.022, height: 0.34, segments: 8, rotX: 0.32, pos: [0, 0.08, 0.16], color: [0.55, 0.38, 0.22] },
            { type: 'cylinder', rTop: 0.058, rBottom: 0.036, height: 0.07, segments: 8, rotX: 0.32, pos: [0, 0.22, 0.21], color: [0.26, 0.24, 0.22] }
        ]);
        this.wallTorchMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            normalMap: this.wallNormal,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughness: 0.52,
            metalness: 0.68,
            vertexColors: true
        });
        this.wallTorchMesh = new THREE.InstancedMesh(wallTorchGeo, this.wallTorchMaterial, 128);
        this.wallTorchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.wallTorchMesh);

        const wallTorchFlameGeo = createMergedBoxGeometry([
            { type: 'lathe', points: chaliceFlameProfile, segments: 12, pos: [0, 0.24, 0.22], color: [1.00, 0.76, 0.22] },
            { type: 'cone', radius: 0.042, height: 0.15, segments: 10, pos: [0, 0.30, 0.22], color: [1.00, 0.98, 0.85] }
        ]);
        this.wallTorchFlameMesh = new THREE.InstancedMesh(wallTorchFlameGeo, this.altarFlameMaterial, 128);
        this.wallTorchFlameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.wallTorchFlameMesh);
        if (this._initMasonryTrimAndPortals) this._initMasonryTrimAndPortals(createMergedBoxGeometry);
        if (this._initWallFixtureArchetypes) this._initWallFixtureArchetypes(createMergedBoxGeometry);

        // Dwarven Smithing Forge & Horned Anvil (feat 60 / Sil-Q '0')
        const forgeGeo = createMergedBoxGeometry([
            { type: 'cylinder', rTop: 0.72, rBottom: 0.78, height: 0.12, segments: 8, pos: [0, 0.06, 0], color: [0.42, 0.40, 0.38] },
            { type: 'cylinder', rTop: 0.38, rBottom: 0.42, height: 0.44, segments: 12, pos: [0, 0.34, 0], color: [0.46, 0.30, 0.18] },
            { pos: [0, 0.64, 0], size: [0.42, 0.16, 0.28], color: [0.28, 0.30, 0.34] },
            { pos: [0, 0.78, 0], size: [0.56, 0.14, 0.24], color: [0.36, 0.38, 0.42] },
            { type: 'cone', radius: 0.11, height: 0.30, segments: 12, rotZ: -Math.PI / 2, pos: [0.40, 0.79, 0], color: [0.38, 0.40, 0.44] },
            { pos: [-0.34, 0.79, 0], size: [0.18, 0.10, 0.22], color: [0.36, 0.38, 0.42] }
        ]);
        this.forgeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            normalMap: this.wallNormal,
            normalScale: new THREE.Vector2(0.85, 0.85),
            roughness: 0.42,
            metalness: 0.62,
            emissive: new THREE.Color(0x2e1204),
            emissiveIntensity: 0.35,
            vertexColors: true
        });
        this.forgeMesh = new THREE.InstancedMesh(forgeGeo, this.forgeMaterial, 32);
        this.forgeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.forgeMesh);

        // 8. Sparkling Magic Fountain (feat 44: '{') - 3-Layer Sculpted Hollowed Marble Basin, Bronze Gargoyle Spouts & Living Water
        const lowerBasinProfile = [
            [0.00, 0.14], [0.64, 0.14], [0.70, 0.18], [0.66, 0.24],
            [0.68, 0.35], [0.75, 0.45], [0.77, 0.48], [0.74, 0.51],
            [0.60, 0.51], [0.58, 0.47], [0.54, 0.22], [0.00, 0.22]
        ];
        const upperBowlProfile = [
            [0.00, 0.82], [0.14, 0.82], [0.22, 0.88], [0.38, 0.96],
            [0.44, 1.03], [0.42, 1.06], [0.35, 1.06], [0.32, 0.92], [0.00, 0.92]
        ];
        const centralPedestalProfile = [
            [0.00, 0.20], [0.25, 0.20], [0.23, 0.27], [0.17, 0.33],
            [0.15, 0.58], [0.18, 0.62], [0.14, 0.84], [0.00, 0.84]
        ];
        const spireFinialProfile = [
            [0.00, 0.92], [0.12, 0.92], [0.09, 1.04], [0.11, 1.10], [0.06, 1.22], [0.00, 1.22]
        ];
        const fountainStoneParts = [
            // Two-tier stepped octagonal stone foundation
            { type: 'cylinder', rTop: 0.86, rBottom: 0.90, height: 0.07, segments: 8, pos: [0, 0.035, 0], color: [0.72, 0.76, 0.82] },
            { type: 'cylinder', rTop: 0.76, rBottom: 0.80, height: 0.07, segments: 8, pos: [0, 0.105, 0], color: [0.80, 0.84, 0.89] },
            // Hollowed lathed marble lower basin + fluted central pedestal + scalloped upper catch-bowl + spire
            { type: 'lathe', points: lowerBasinProfile, segments: 24, pos: [0, 0, 0], color: [0.88, 0.91, 0.95] },
            { type: 'lathe', points: centralPedestalProfile, segments: 20, pos: [0, 0, 0], color: [0.90, 0.93, 0.97] },
            { type: 'lathe', points: upperBowlProfile, segments: 24, pos: [0, 0, 0], color: [0.92, 0.95, 0.98] },
            { type: 'lathe', points: spireFinialProfile, segments: 18, pos: [0, 0, 0], color: [0.94, 0.96, 0.99] }
        ];
        for (let seg = 0; seg < 8; seg++) {
            const ang = seg * (Math.PI / 4);
            const r = 0.71;
            fountainStoneParts.push({
                pos: [Math.cos(ang) * r, 0.32, Math.sin(ang) * r],
                size: [0.11, 0.32, 0.16],
                rotY: -ang,
                color: [0.82, 0.86, 0.91]
            });
        }
        const fountainGeo = createMergedBoxGeometry(fountainStoneParts);
        this.fountainMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.floorTex,
            normalMap: this.wallNormal,
            normalScale: new THREE.Vector2(1.10, 1.10),
            roughness: 0.34,
            metalness: 0.10,
            emissive: new THREE.Color(0x081e30),
            emissiveIntensity: 0.25,
            vertexColors: true
        });
        this.fountainMesh = new THREE.InstancedMesh(fountainGeo, this.fountainMaterial, 64);
        this.fountainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.fountainMesh);

        // Layer 8B: Cast-Bronze Spout Gargoyles, Column Collars & Lotus Finial Nozzle
        const nozzleProfile = [
            [0.00, 1.20], [0.075, 1.20], [0.042, 1.26], [0.068, 1.31], [0.032, 1.34], [0.00, 1.34]
        ];
        const fountainBrassParts = [
            { type: 'lathe', points: nozzleProfile, segments: 18, pos: [0, 0, 0], color: [0.96, 0.80, 0.34] },
            { type: 'torus', radius: 0.175, tube: 0.020, radialSegments: 10, tubularSegments: 20, rotX: Math.PI / 2, pos: [0, 0.50, 0], color: [0.94, 0.78, 0.32] },
            { type: 'torus', radius: 0.155, tube: 0.018, radialSegments: 10, tubularSegments: 20, rotX: Math.PI / 2, pos: [0, 0.82, 0], color: [0.94, 0.78, 0.32] }
        ];
        for (let d = 0; d < 4; d++) {
            const ang = d * (Math.PI / 2);
            const ca = Math.cos(ang), sa = Math.sin(ang);
            // 4 Cast-bronze lion/gargoyle spout masks & projecting nozzles on the upper bowl rim
            fountainBrassParts.push({
                type: 'sphere', radius: 0.052, widthSegments: 10, heightSegments: 8,
                pos: [ca * 0.40, 1.00, sa * 0.40],
                color: [0.98, 0.82, 0.36]
            });
            fountainBrassParts.push({
                type: 'cylinder', rTop: 0.022, rBottom: 0.028, height: 0.08, segments: 10,
                rotX: -Math.PI / 2.3, rotY: Math.PI / 2 - ang,
                pos: [ca * 0.44, 0.99, sa * 0.44],
                color: [1.00, 0.86, 0.40]
            });
        }
        for (let seg = 0; seg < 8; seg++) {
            const ang = seg * (Math.PI / 4);
            fountainBrassParts.push({
                pos: [Math.cos(ang) * 0.69, 0.515, Math.sin(ang) * 0.69],
                size: [0.14, 0.025, 0.10],
                rotY: -ang,
                color: [0.94, 0.78, 0.32]
            });
        }
        const fountainBrassGeo = createMergedBoxGeometry(fountainBrassParts);
        this.fountainBrassMesh = new THREE.InstancedMesh(fountainBrassGeo, this.altarBrassMaterial, 64);
        this.fountainBrassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.fountainBrassMesh);

        // Layer 8C: Animated Crystalline Azure Water Pools, Apex Geyser Plume, Parabolic Jets & Splash Crowns
        // # ROOT-CAUSE: Align water stream cylinder segments along exact parabolic tangent (rotX = -atan2(dr, dy), rotY = PI/2 - ang) with 25% segment overlap so all 8 streams form continuous, gap-free water arcs.
        const geyserPlumeProfile = [
            [0.00, 1.33], [0.028, 1.34], [0.038, 1.41], [0.052, 1.47],
            [0.036, 1.51], [0.00, 1.53]
        ];
        const fountainWaterParts = [
            // Deep lower basin water surface + concentric foaming ripple rings
            { type: 'cylinder', rTop: 0.59, rBottom: 0.57, height: 0.035, segments: 24, pos: [0, 0.44, 0], color: [0.22, 0.82, 1.00] },
            { type: 'torus', radius: 0.27, tube: 0.011, radialSegments: 8, tubularSegments: 24, rotX: Math.PI / 2, pos: [0, 0.46, 0], color: [0.76, 0.96, 1.00] },
            { type: 'torus', radius: 0.44, tube: 0.012, radialSegments: 8, tubularSegments: 28, rotX: Math.PI / 2, pos: [0, 0.46, 0], color: [0.72, 0.95, 1.00] },
            // Upper catch-bowl brimming water meniscus + ripple ring
            { type: 'cylinder', rTop: 0.36, rBottom: 0.34, height: 0.03, segments: 20, pos: [0, 1.01, 0], color: [0.30, 0.88, 1.00] },
            { type: 'torus', radius: 0.22, tube: 0.010, radialSegments: 8, tubularSegments: 20, rotX: Math.PI / 2, pos: [0, 1.028, 0], color: [0.82, 0.98, 1.00] },
            // Slender central apex geyser jet & frothy crown ring above bronze lotus nozzle
            { type: 'lathe', points: geyserPlumeProfile, segments: 16, pos: [0, 0, 0], color: [0.84, 0.98, 1.00] },
            { type: 'torus', radius: 0.055, tube: 0.012, radialSegments: 8, tubularSegments: 16, rotX: Math.PI / 2, pos: [0, 1.46, 0], color: [0.92, 1.00, 1.00] },
            // Arcane mist floor halo ring
            { type: 'torus', radius: 0.94, tube: 0.013, radialSegments: 8, tubularSegments: 32, rotX: Math.PI / 2, pos: [0, 0.022, 0], color: [0.35, 0.88, 1.00] }
        ];
        // 8 Upper arched water jets (lotus crown -> upper bowl) + 8 Lower parabolic cascading streams (upper bowl -> lower basin)
        for (let seg = 0; seg < 8; seg++) {
            const ang = seg * (Math.PI / 4);
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const isCardinal = (seg % 2 === 0);
            const uSteps = 5;
            const uCurve = (t) => ({
                r: 0.035 + 0.215 * t,
                y: 1.45 - (1.45 - 1.02) * (t * t)
            });
            for (let u = 0; u < uSteps; u++) {
                const p0 = uCurve(u / uSteps);
                const p1 = uCurve((u + 1) / uSteps);
                const dr = p1.r - p0.r;
                const dy = p0.y - p1.y;
                const segLen = Math.hypot(dr, dy) * 1.28;
                const theta = Math.atan2(dr, dy);
                const rm = (p0.r + p1.r) * 0.5;
                const ym = (p0.y + p1.y) * 0.5;
                fountainWaterParts.push({
                    type: 'cylinder',
                    rTop: 0.011,
                    rBottom: 0.015,
                    height: segLen,
                    segments: 8,
                    rotX: -theta,
                    rotY: Math.PI / 2 - ang,
                    pos: [ca * rm, ym, sa * rm],
                    color: [0.78, 0.98, 1.00]
                });
            }
            const rStart = isCardinal ? 0.44 : 0.39;
            const rEnd = isCardinal ? 0.54 : 0.49;
            const streamRadius = isCardinal ? 0.020 : 0.014;
            const steps = 6;
            const lCurve = (t) => ({
                r: rStart + (rEnd - rStart) * t + Math.sin(t * Math.PI * 0.5) * 0.03,
                y: 0.99 - (0.99 - 0.45) * (t * t)
            });
            for (let s = 0; s < steps; s++) {
                const t0 = s / steps;
                const t1 = (s + 1) / steps;
                const p0 = lCurve(t0);
                const p1 = lCurve(t1);
                const dr = p1.r - p0.r;
                const dy = p0.y - p1.y;
                const segLen = Math.hypot(dr, dy) * 1.28;
                const theta = Math.atan2(dr, dy);
                const rm = (p0.r + p1.r) * 0.5;
                const ym = (p0.y + p1.y) * 0.5;
                fountainWaterParts.push({
                    type: 'cylinder',
                    rTop: streamRadius * (0.88 + 0.12 * t0),
                    rBottom: streamRadius * (1.02 + 0.22 * t1),
                    height: segLen,
                    segments: 8,
                    rotX: -theta,
                    rotY: Math.PI / 2 - ang,
                    pos: [ca * rm, ym, sa * rm],
                    color: isCardinal ? [0.68, 0.96, 1.00] : [0.52, 0.92, 1.00]
                });
            }
            // Frothy white-cyan splash impact crown where stream hits lower basin pool
            fountainWaterParts.push({
                type: 'torus',
                radius: isCardinal ? 0.052 : 0.038,
                tube: 0.012,
                radialSegments: 8,
                tubularSegments: 14,
                rotX: Math.PI / 2,
                pos: [ca * rEnd, 0.462, sa * rEnd],
                color: [0.88, 0.99, 1.00]
            });
        }
        const fountainWaterGeo = createMergedBoxGeometry(fountainWaterParts);
        this.fountainWaterMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.waterTex,
            normalMap: this.waterNormal,
            normalScale: new THREE.Vector2(1.25, 1.25),
            emissive: new THREE.Color(0x10689e),
            emissiveIntensity: 0.95,
            roughness: 0.08,
            metalness: 0.18,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        this.fountainWaterMesh = new THREE.InstancedMesh(fountainWaterGeo, this.fountainWaterMaterial, 64);
        this.fountainWaterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.fountainWaterMesh);

        // FrogComposBand Bottomless Pit (feat 41: '#') - Chasm cliff-shaft & abyssal void
        this.chasmVoidMat = new THREE.MeshBasicMaterial({ color: 0x010103, fog: false });
        this.chasmVoidMesh = new THREE.InstancedMesh(floorGeo, this.chasmVoidMat, this.maxInstances);
        this.chasmVoidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.chasmVoidMesh.castShadow = false;
        this.chasmVoidMesh.receiveShadow = false;
        this.scene.add(this.chasmVoidMesh);
        this.chasmVoidMesh.count = 0;

        const hs = (this.cellSize || 2.0) * 0.5;
        const cliffSegX = 8;
        const cliffRows = [
            { y: 0.02, z: -0.08, ao: 0.66, amp: 0.0 },
            { y: -0.05, z: 0.08, ao: 0.48, amp: 0.14 },
            { y: -0.58, z: 0.05, ao: 0.22, amp: 0.18 },
            { y: -1.75, z: 0.02, ao: 0.06, amp: 0.12 },
            { y: -4.18, z: 0.0, ao: 0.01, amp: 0.0 }
        ];
        const cliffVerts = cliffRows.length * (cliffSegX + 1);
        const cliffPos = new Float32Array(cliffVerts * 3);
        const cliffUv = new Float32Array(cliffVerts * 2);
        const cliffCol = new Float32Array(cliffVerts * 3);
        for (let r = 0; r < cliffRows.length; r++) {
            const row = cliffRows[r];
            for (let c = 0; c <= cliffSegX; c++) {
                const u = c / cliffSegX;
                const x = -hs + u * hs * 2;
                const env = (c === 0 || c === cliffSegX) ? 0 : Math.sin(u * Math.PI);
                const crag = row.amp > 0
                    ? env * (Math.sin(u * Math.PI * 3.0 + r * 1.3) * 0.65 + Math.sin(u * Math.PI * 5.0 - r * 0.9) * 0.35) * row.amp
                    : 0;
                const vi = r * (cliffSegX + 1) + c;
                cliffPos[vi * 3] = x;
                cliffPos[vi * 3 + 1] = row.y;
                cliffPos[vi * 3 + 2] = row.z + crag;
                cliffUv[vi * 2] = u;
                cliffUv[vi * 2 + 1] = (0.02 - row.y) / 4.20;
                cliffCol[vi * 3] = row.ao;
                cliffCol[vi * 3 + 1] = row.ao * 1.01;
                cliffCol[vi * 3 + 2] = row.ao * 1.05;
            }
        }
        const cliffIdx = [];
        for (let r = 0; r < cliffRows.length - 1; r++) {
            for (let c = 0; c < cliffSegX; c++) {
                const a = r * (cliffSegX + 1) + c, b = a + 1, d = a + (cliffSegX + 1), e = d + 1;
                cliffIdx.push(a, d, b, b, d, e);
            }
        }
        const chasmCliffGeo = new THREE.BufferGeometry();
        chasmCliffGeo.setAttribute('position', new THREE.BufferAttribute(cliffPos, 3));
        chasmCliffGeo.setAttribute('uv', new THREE.BufferAttribute(cliffUv, 2));
        chasmCliffGeo.setAttribute('color', new THREE.BufferAttribute(cliffCol, 3));
        chasmCliffGeo.setIndex(cliffIdx);
        chasmCliffGeo.computeVertexNormals();

        this.chasmSideMaterial = new THREE.MeshStandardMaterial({
            color: 0x323640,
            roughness: 0.94,
            metalness: 0.04,
            normalScale: new THREE.Vector2(1.75, 1.75),
            vertexColors: true,
            side: THREE.DoubleSide
        });
        if (this.townMountainDiff || this.permWallTex) {
            this.chasmSideMaterial.map = this.townMountainDiff || this.permWallTex;
            this.chasmSideMaterial.normalMap = this.townMountainNormal || this.permWallNormal || null;
            this.chasmSideMaterial.roughnessMap = this.townMountainRoughness || null;
        }
        this.chasmMesh = new THREE.InstancedMesh(chasmCliffGeo, this.chasmSideMaterial, this.maxInstances);
        this.chasmMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.chasmMesh.castShadow = false;
        this.chasmMesh.receiveShadow = true;
        this.scene.add(this.chasmMesh);

        if (this._thresholdCutawayGeos) {
            const cg = this._thresholdCutawayGeos;
            this.stairsUpOccupiedMesh = new THREE.InstancedMesh(cg.stairsUpOccupiedGeo, this.stairsMaterial, 32);
            this.stairsUpOccupiedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(this.stairsUpOccupiedMesh);
            this.altarOccupiedMesh = new THREE.InstancedMesh(cg.altarOccupiedGeo, this.altarMaterial, 16);
            this.altarOccupiedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(this.altarOccupiedMesh);
            this.fountainOccupiedMesh = new THREE.InstancedMesh(cg.fountainOccupiedGeo, this.fountainMaterial, 16);
            this.fountainOccupiedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(this.fountainOccupiedMesh);
        }

        if (tac && tac.applyWorldPbrShader) {
            tac.applyWorldPbrShader(this, this.wallMaterial, 'wall');
            tac.applyWorldPbrShader(this, this.permWallMaterial, 'wall');
            tac.applyWorldPbrShader(this, this.chasmSideMaterial, 'wall');
            tac.applyWorldPbrShader(this, this.floorMaterial, 'floor');
            tac.applyWorldPbrShader(this, this.ceilingMaterial, 'ceiling');
            tac.applyWorldPbrShader(this, this.magmaMaterial, 'vein', 0);
            tac.applyWorldPbrShader(this, this.quartzMaterial, 'vein', 1);
            tac.applyWorldPbrShader(this, this.goldVeinMaterial, 'vein', 2);
            tac.applyWorldPbrShader(this, this.gemVeinMaterial, 'vein', 3);
            if (this._syncWorldPbrUniforms && this._lastContextualTexSet) {
                this._syncWorldPbrUniforms(this._lastContextualTexSet);
            }
        }

        // Pre-allocate instance color buffers with 1.0 (pure white albedo multiplier) matching exact capacity
        const initInstancedColors = (mesh) => {
            if (!mesh || !mesh.instanceMatrix) return;
            mesh.frustumCulled = false;
            const colors = new Float32Array(mesh.instanceMatrix.count * 3).fill(1.0);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
            mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            mesh.count = 0; // Initialize to 0 so unpopulated instances are never drawn
        };
        [
            this.wallMesh, this.upperWallMesh, this.permWallMesh, this.upperPermWallMesh,
            this.floorMesh, this.ceilingMesh, this.doorFrameMesh,
            this.wallPlinthMesh, this.wallCorniceMesh, this.darkPortalMesh,
            this.shopFrameMesh, this.shopStoneMesh, this.shopStoneOccupiedMesh, this.shopAwningMesh,
            this.townTimberMesh, this.townTimberPostMesh, this.townRoofMesh, this.rubbleMesh,
            this.doorMesh, this.doorOpenMesh, this.doorBrokenMesh,
            this.stairsMesh, this.stairsUpMesh, this.stairsUpOccupiedMesh,
            this.altarMesh, this.altarOccupiedMesh, this.altarBrassMesh, this.altarFlameMesh,
            this.wallTorchMesh, this.wallTorchFlameMesh, this.forgeMesh,
            this.fountainMesh, this.fountainOccupiedMesh, this.fountainBrassMesh, this.fountainWaterMesh,
            this.trapMesh, this.trapPitMesh, this.trapRuneMesh, this.webMesh, this.runeMesh,
            this.doorLockMesh, this.specialShopDoorMesh, this.shaftRimMesh,
            this.magmaMesh, this.quartzMesh, this.goldVeinMesh, this.gemVeinMesh,
            this.treeTrunkMesh, this.treeLeavesMesh, this.bushMesh,
            this.grassMesh, this.dirtMesh, this.waterMesh, this.deepWaterMesh, this.waterBankMesh,
            this.mountainMesh, this.swampMesh, this.chasmMesh, this.chasmVoidMesh,
            this.lavaMesh, this.lavaCooledMesh, ...this.shopMeshes
        ].forEach(initInstancedColors);
        if (this.scene) {
            this.scene.traverse((obj) => {
                if (obj && obj.isInstancedMesh) {
                    obj.frustumCulled = false;
                    if (!obj.instanceColor) initInstancedColors(obj);
                }
            });
        }

        this.dummy = new THREE.Object3D();

        // Ground loot rarity plinth ring geometry (itemPlinthGeo)
        this.itemPlinthGeo = new THREE.RingGeometry(0.22, 0.28, 16);
        this.itemPlinthGeo.rotateX(-Math.PI / 2);
        this.itemPlinthGeo._sharedGeometry = true;

        // Soft contact shadow quad for 3D monsters & item pickups (zero download cost)
        this.shadowGeo = new THREE.PlaneGeometry(1.0, 1.0);
        this.shadowGeo.rotateX(-Math.PI / 2);
        this.shadowGeo._sharedGeometry = true;
        if (this.shadowTex) this.shadowTex._sharedTexture = true;
        this.shadowMat = new THREE.MeshBasicMaterial({
            map: this.shadowTex,
            transparent: true,
            opacity: 0.78,
            depthWrite: false
        });
        this.shadowMat._sharedMaterial = true;

        // Bounded cache for item caption billboard textures & materials (zero GC memory leak)
        this.captionMaterialCache = new Map();

        // High-Quality Celestial Star Canopy (Middle-earth night sky overhead in town)
        this.initStarCanopy();
    }

    initStarCanopy() {
        this.starTexture = procCreateStarTexture();
        const starCount = 4500;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const phases = new Float32Array(starCount);

        const radius = 40.0; // Positioned at clip-space far depth so opaque buildings/trees occlude stars

        // Authentic Stellar Spectral Classes (Normalized sRGB)
        const spectralColors = [
            [0.608, 0.722, 1.000], // Class O/B: Piercing blue-white (#9bb8ff)
            [0.957, 0.973, 1.000], // Class A: Pure diamond white (#f4f8ff)
            [1.000, 0.941, 0.800], // Class F/G: Warm solar gold (#fff0cc)
            [1.000, 0.816, 0.588], // Class K: Topaz amber (#ffd096)
            [1.000, 0.620, 0.431]  // Class M: Ruby garnet giant (#ff9e6e)
        ];

        // Seeded deterministic PRNG for stable celestial sphere across turns & sessions
        let seed = 918273645;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        for (let i = 0; i < starCount; i++) {
            // Star 0: The Star of Eärendil (Flos Duellatorum / High Silmaril starlight jewel of the sky)
            if (i === 0) {
                const az = Math.PI * 0.28;
                const el = Math.PI * 0.42;
                const y = Math.sin(el);
                const rXZ = Math.cos(el);
                const x = Math.sin(az) * rXZ;
                const z = -Math.cos(az) * rXZ;

                positions[0] = x * radius;
                positions[1] = y * radius;
                positions[2] = z * radius;

                colors[0] = 0.96;
                colors[1] = 0.98;
                colors[2] = 1.00;
                sizes[0] = 7.2; // Majestic prominent jewel star
                phases[0] = 0.0;
                continue;
            }

            let x, y, z;
            const isGalacticBelt = (rand() < 0.42); // 42% cluster along the celestial River of Stars

            if (isGalacticBelt) {
                // Arc tilted across the sky from SW to NE
                const t = rand() * Math.PI * 2;
                const beltSpread = (rand() - 0.5) * 0.32;
                const bx = Math.cos(t);
                const bz = Math.sin(t);
                const tilt = 0.62;
                const py = Math.sin(t) * Math.sin(tilt) + beltSpread;
                const pz = Math.sin(t) * Math.cos(tilt);
                const px = bx + (rand() - 0.5) * 0.15;

                const len = Math.sqrt(px * px + py * py + pz * pz) || 1.0;
                y = Math.abs(py / len);
                x = px / len;
                z = pz / len;
            } else {
                // Hemispherical distribution biased towards zenith
                const az = rand() * Math.PI * 2;
                const el = Math.asin(0.04 + rand() * 0.96);
                y = Math.sin(el);
                const rXZ = Math.cos(el);
                x = Math.sin(az) * rXZ;
                z = Math.cos(az) * rXZ;
            }

            y = Math.max(0.04, y);
            const normLen = Math.sqrt(x * x + y * y + z * z) || 1.0;
            x /= normLen;
            y /= normLen;
            z /= normLen;

            positions[i * 3 + 0] = x * radius;
            positions[i * 3 + 1] = y * radius;
            positions[i * 3 + 2] = z * radius;

            const cRoll = rand();
            const sc = cRoll < 0.28 ? spectralColors[0] :
                       cRoll < 0.68 ? spectralColors[1] :
                       cRoll < 0.85 ? spectralColors[2] :
                       cRoll < 0.94 ? spectralColors[3] : spectralColors[4];

            colors[i * 3 + 0] = sc[0];
            colors[i * 3 + 1] = sc[1];
            colors[i * 3 + 2] = sc[2];

            // Power-law magnitude distribution (82% pinpoint, 14% medium, 4% brilliant beacon stars)
            const magRoll = rand();
            let starSize;
            if (magRoll < 0.82) {
                starSize = 1.1 + Math.pow(rand(), 3.2) * 0.9;
            } else if (magRoll < 0.96) {
                starSize = 2.4 + rand() * 1.0;
            } else {
                starSize = 4.6 + rand() * 1.6;
            }
            sizes[i] = starSize;
            phases[i] = rand() * Math.PI * 2;
        }

        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

        this.starMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: this.starTexture },
                uTime: { value: 0.0 },
                uVisibility: { value: 1.0 }
            },
            vertexShader: `
                attribute float aSize;
                attribute float aPhase;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float uTime;
                uniform float uVisibility;

                void main() {
                    vColor = color;
                    // Calm thermodynamic twinkling (slow organic breath, never erratic strobe)
                    float twinkle = 0.84 + 0.16 * sin(uTime * 1.4 + aPhase);

                    // Horizon extinction: stars fade smoothly into the atmospheric twilight haze near horizon
                    vec3 normPos = normalize(position);
                    float horizonFade = smoothstep(0.04, 0.24, normPos.y);

                    vAlpha = twinkle * horizonFade * uVisibility;

                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * (150.0 / -mvPosition.z) * (0.94 + 0.06 * twinkle);
                    vec4 clipPos = projectionMatrix * mvPosition;
                    clipPos.z = clipPos.w * 0.9998;
                    gl_Position = clipPos;
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                varying vec3 vColor;
                varying float vAlpha;

                void main() {
                    if (vAlpha <= 0.005) discard;
                    vec4 tex = texture2D(uTexture, gl_PointCoord);
                    gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        this.starPoints = new THREE.Points(starGeo, this.starMaterial);
        this.starPoints.frustumCulled = false;
        this.starPoints.renderOrder = 1;

        // Dedicated Celestial Sky Dome: Deep gradient, Milky Way dust lanes, aurora ribbons, crescent moon
        // Radius 42m + depthTest: false + renderOrder: -10 guarantees zero far-plane clipping ("sky bubble")
        const skyDomeGeo = new THREE.SphereGeometry(42, 40, 24);
        const skyCompat = (typeof window !== 'undefined' && window.Dungeon3DCompat) || null;
        this.skyDomeMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            transparent: false,
            fog: false,
            uniforms: {
                uTime: { value: 0.0 },
                uHorizonColor: { value: new THREE.Color(0x121b2d) },
                uZenithColor: { value: new THREE.Color(0x03060f) },
                uNebulaColorA: { value: new THREE.Color(0xffd188) },
                uNebulaColorB: { value: new THREE.Color(0x3855a2) },
                uAuroraColor: { value: new THREE.Color(0x1be896) },
                uMoonDir: { value: new THREE.Vector3(0.42, 0.58, -0.69).normalize() }
            },
            vertexShader: `
                varying vec3 vWorldDir;
                void main() {
                    vWorldDir = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: (skyCompat ? skyCompat.patchSkyDomeFragment : (s) => s)(`
                uniform float uTime;
                uniform vec3 uHorizonColor;
                uniform vec3 uZenithColor;
                uniform vec3 uNebulaColorA;
                uniform vec3 uNebulaColorB;
                uniform vec3 uAuroraColor;
                uniform vec3 uMoonDir;
                varying vec3 vWorldDir;

                float hash(vec3 p) {
                    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
                }

                float noise(vec3 x) {
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
                    return mix(
                        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                }

                float fbm4(vec3 p) {
                    const mat3 rot = mat3(
                         0.80,  0.60,  0.00,
                        -0.60,  0.80,  0.00,
                         0.00,  0.00,  1.00
                    );
                    float v = 0.50 * noise(p);
                    p = (rot * p) * 2.04 + vec3(17.1, 31.7, 11.3);
                    v += 0.25 * noise(p);
                    p = (rot * p) * 2.02 + vec3(23.4, 13.9, 41.2);
                    v += 0.15 * noise(p);
                    p = (rot * p) * 2.05 + vec3(7.7, 19.3, 29.1);
                    v += 0.10 * noise(p);
                    return v;
                }

                void main() {
                    vec3 d = normalize(vWorldDir);
                    float elev = max(d.y, 0.0);

                    // 1. Deep Cosmic Zenith-to-Horizon Gradient
                    vec3 sky = mix(uHorizonColor, uZenithColor, pow(elev, 0.42));

                    // 2. Smooth Rotated Multi-Octave Milky Way Veil (no coarse cubic lattice)
                    vec3 g = vec3(d.x * 0.82 - d.y * 0.57, d.x * 0.57 + d.y * 0.82, d.z);
                    float fbm = fbm4(g * 7.5);
                    float dustFbm = fbm4(g * 11.0 + vec3(1.2, 3.4, 5.6));
                    float mwBand = exp(-pow(g.x * 2.8 + (fbm - 0.5) * 0.35, 2.0));
                    float dustRift = smoothstep(0.44, 0.72, dustFbm) * exp(-pow(g.x * 3.4, 2.0)) * 0.55;
                    float mwIntensity = clamp((mwBand * 0.78 - dustRift) * smoothstep(0.04, 0.24, elev), 0.0, 1.0);
                    vec3 mwColor = mix(uNebulaColorB, uNebulaColorA, smoothstep(0.32, 0.78, fbm));
                    sky += mwColor * mwIntensity * 0.18;

                    // 3. Subtle Atmospheric Aurora Curtains
                    float auroraElev = smoothstep(0.08, 0.28, elev) * smoothstep(0.66, 0.35, elev);
                    float ribbon = sin(d.x * 11.0 + uTime * 0.32 + fbm * 3.2);
                    ribbon = smoothstep(0.28, 0.94, ribbon * 0.5 + 0.5);
                    float aurora = ribbon * auroraElev * (0.45 + 0.55 * sin(uTime * 0.55 + d.z * 4.5));
                    sky += uAuroraColor * (aurora * 0.28);

                    // 4. Crisp Celestial Crescent Moon & Silver Corona
                    vec3 mDir = normalize(uMoonDir);
                    float cosA = dot(d, mDir);
                    float corona = pow(max(cosA, 0.0), 48.0) * 0.35 + pow(max(cosA, 0.0), 6.0) * 0.08;
                    sky += vec3(0.78, 0.88, 1.0) * corona;

                    if (cosA > 0.9988) {
                        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), mDir));
                        vec3 up = cross(mDir, right);
                        vec2 moonCoord = vec2(dot(d, right), dot(d, up)) * 40.0;
                        float r = length(moonCoord);
                        if (r < 1.0) {
                            vec2 shadowCenter = vec2(0.42, 0.15);
                            float shadowR = length(moonCoord - shadowCenter);
                            float crescent = smoothstep(0.95, 1.0, shadowR / 0.96);
                            float crater = 0.88 + 0.12 * noise(vec3(moonCoord * 5.0, 2.0));
                            vec3 moonSurface = vec3(0.96, 0.95, 0.92) * crater * crescent;
                            float limb = sqrt(max(0.0, 1.0 - r * r));
                            moonSurface *= (0.75 + 0.25 * limb);
                            sky += moonSurface * 1.5;
                        }
                    }

                    gl_FragColor = vec4(sky, 1.0);
                }
            `)
        });
        this.skyDomeMesh = new THREE.Mesh(skyDomeGeo, this.skyDomeMaterial);
        this.skyDomeMesh.frustumCulled = false;
        this.skyDomeMesh.renderOrder = -10;

        this.starGroup = new THREE.Group();
        this.starGroup.name = "StarCanopy";
        this.starCanopyGroup = this.starGroup;
        this.starGroup.add(this.skyDomeMesh);
        this.starGroup.add(this.starPoints);
        this.nebulaClouds = [];

        this.scene.add(this.starGroup);
    }

    initViewmodel() {
        this.viewmodelGroup = new THREE.Group();
        this.camera.add(this.viewmodelGroup);
        this.scene.add(this.camera);

        this.heightRatio = 1.0;
        this.cameraBobPhase = 0;

        this.rightHandGroup = new THREE.Group();
        this.rightRestPos = new THREE.Vector3(0.31, -0.30, -0.36);
        this.rightRestRot = new THREE.Euler(-0.26, 0.24, 0.16);
        this.rightHandGroup.position.copy(this.rightRestPos);
        this.rightHandGroup.rotation.copy(this.rightRestRot);
        this.rightItemSlot = new THREE.Group();
        this.rightItemSlot.name = "RightItemSlot";
        this.rightHandGroup.add(this.rightItemSlot);
        this.rightHandGroup.visible = false; // Hidden when unarmed
        this.viewmodelGroup.add(this.rightHandGroup);

        // Left Hand Shield Slot: Anchored at lower-left corner angled inward at 3/4 guard pose
        this.leftHandGroup = new THREE.Group();
        this.leftRestPos = new THREE.Vector3(-0.33, -0.29, -0.36);
        this.leftRestRot = new THREE.Euler(0.08, 0.88, -0.12);
        this.leftHandGroup.position.copy(this.leftRestPos);
        this.leftHandGroup.rotation.copy(this.leftRestRot);
        this.leftItemSlot = new THREE.Group();
        this.leftItemSlot.name = "LeftItemSlot";
        this.leftHandGroup.add(this.leftItemSlot);
        this.leftHandGroup.visible = false; // Hidden unless shield equipped
        this.viewmodelGroup.add(this.leftHandGroup);

        // Weapon models cache
        this.weaponCache = new Map();
        this.currentRightWeapon = null;
        this.currentLeftWeapon = null;

        this.attackAnimationTime = 0;
        this.hurtAnimationTime = 0;
        this.castAnimationTime = 0;
        this._tagViewmodelLayer(this.viewmodelGroup);
    }

    _tagViewmodelLayer(obj) {
        if (!obj || typeof obj.traverse !== 'function') return;
        obj.traverse((c) => {
            if (c.layers && typeof c.layers.set === 'function') c.layers.set(1);
            if (c.isMesh) {
                c.castShadow = false;
                c.receiveShadow = false;
            }
        });
    }

    _clearViewmodelSlot(slotGroup) {
        if (!slotGroup) return;
        while (slotGroup.children.length > 0) {
            const oldChild = slotGroup.children[0];
            slotGroup.remove(oldChild);
            if (oldChild && typeof oldChild.traverse === 'function') {
                oldChild.traverse((c) => {
                    if (c.geometry && !c.isSprite && !c.geometry._sharedGeometry) {
                        c.geometry.dispose();
                    }
                    if (c.material) {
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        for (let i = 0; i < mats.length; i++) {
                            const m = mats[i];
                            if (m && !m._sharedMaterial && typeof m.dispose === 'function') m.dispose();
                        }
                    }
                });
            }
        }
    }

    _getAssetLoadingManager() {
        if (!this._assetLoadingManager && typeof THREE !== 'undefined' && typeof THREE.LoadingManager === 'function') {
            const mgr = new THREE.LoadingManager();
            mgr.setURLModifier((u) => {
                if (!u || typeof u !== 'string' || u.startsWith('blob:') || u.startsWith('data:')) return u;
                return (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(u) : u;
            });
            this._assetLoadingManager = mgr;
        }
        return this._assetLoadingManager || undefined;
    }

    _getGltfLoader() {
        if (!this.gltfLoader && typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
            this.gltfLoader = new THREE.GLTFLoader(this._getAssetLoadingManager());
        }
        const meshopt = (typeof MeshoptDecoder !== 'undefined' && MeshoptDecoder) ||
            (typeof window !== 'undefined' && window.MeshoptDecoder) || null;
        if (this.gltfLoader && !this.gltfLoader._meshoptConfigured && meshopt && typeof this.gltfLoader.setMeshoptDecoder === 'function') {
            this.gltfLoader.setMeshoptDecoder(meshopt);
            this.gltfLoader._meshoptConfigured = true;
        }
        return this.gltfLoader;
    }

    initModelResolvers() {
        this.objLoader = (typeof THREE.OBJLoader !== 'undefined') ? new THREE.OBJLoader() : null;
        this.gltfLoader = this._getGltfLoader();
        this.gltfModels = {};
        this.objModels = {};
        this._gltfTemplateCache = new Map();
        this._gltfLoadingPromises = new Map();
        this.monsterTemplates = new Map();
        this.itemTemplates = new Map();
        this.weaponCache = new Map();
        this._monster3DTemplates = new Map();
        this._monster3DLoading = new Map();

        // 1. Shockbolt 2.5D PBR Monster Billboard Atlas & Normal Map
        this.initMonsterAtlas();
        // 2. Shockbolt 2.5D PBR Item Pickup Atlas & Normal Map
        this.initItemAtlas();

        // 3. Poly Haven Photogrammetry 3D Viewmodel Weapons & Shields (On-Demand + Deferred Prewarm)
        this._viewmodelWeaponPhMap = {
            sword: 'item_longsword',
            saber: 'ph_saber',
            blade: 'item_rune_blade',
            katana: 'ph_katana',
            dagger: 'ph_dagger',
            axe: 'ph_axe',
            hatchet: 'ph_hatchet',
            mace: 'ph_mace',
            morningstar: 'item_morningstar',
            club: 'item_greatclub',
            hammer: 'ph_hammer',
            sledgehammer: 'ph_sledgehammer',
            polearm: 'item_spear',
            staff_branch: 'item_staff_branch',
            staff: 'item_staff',
            wand: 'item_wand',
            rod: 'item_rod',
            shovel: 'item_shovel',
            pickaxe: 'item_pickaxe',
            whip: 'item_morningstar',
            bow: 'item_bow',
            shield: 'ph_shield',
            shield_wooden: 'item_shield_wooden',
            shield_raven: 'item_shield_raven',
            shield_wicker: 'item_shield_wicker',
            shield_leather: 'item_shield_leather',
            shield_metal: 'item_shield_metal',
            claymore: 'item_greatsword',
            spear: 'item_spear',
            torch: 'item_torch',
            lantern: 'ph_lantern'
        };
        // # ROOT-CAUSE: Remove unconditional 1800ms GLB prewarm timer during cold boot; awaitSceneAssetsReady(frame) loads exact required scene GLBs on demand.
        this._viewmodelWeaponPromises = new Map();

        // Masterwork Braided Kangaroo-Leather Bullwhip + Coiled Loops + 3D Armored Gauntlet (zero BoxGeometry)
        const createWhipViewmodelMesh = () => {
            const whipGroup = new THREE.Group();
            const braidNormal = this.furNormal || this.organicNormal || null;
            const handleLeatherMat = new THREE.MeshStandardMaterial({
                color: 0x28140a,
                normalMap: braidNormal,
                normalScale: new THREE.Vector2(1.65, 1.65),
                roughness: 0.72,
                metalness: 0.14
            });
            const darkCoilMat = new THREE.MeshStandardMaterial({
                color: 0x1e0e06,
                normalMap: braidNormal,
                normalScale: new THREE.Vector2(1.80, 1.80),
                roughness: 0.68,
                metalness: 0.16
            });
            const brassMat = new THREE.MeshStandardMaterial({
                color: 0xc89632,
                normalMap: this.organicNormal || null,
                normalScale: new THREE.Vector2(0.65, 0.65),
                roughness: 0.25,
                metalness: 0.88
            });
            const popperMat = new THREE.MeshStandardMaterial({
                color: 0xb88648,
                roughness: 0.85,
                metalness: 0.08
            });

            // 1. Contoured 16-sided LatheGeometry braided leather grip (y = -0.12..+0.11)
            const handleProfile = [
                new THREE.Vector2(0.015, -0.12),
                new THREE.Vector2(0.019, -0.09),
                new THREE.Vector2(0.017, -0.04),
                new THREE.Vector2(0.0185, 0.01),
                new THREE.Vector2(0.0165, 0.06),
                new THREE.Vector2(0.018, 0.105)
            ];
            const handleGeom = new THREE.LatheGeometry(handleProfile, 16);
            whipGroup.add(new THREE.Mesh(handleGeom, handleLeatherMat));

            // Spiral braided leather grip rings along handle
            for (let i = 0; i < 7; i++) {
                const ringGeom = new THREE.TorusGeometry(0.0182, 0.0028, 8, 16);
                const ringMesh = new THREE.Mesh(ringGeom, darkCoilMat);
                ringMesh.position.set(0, -0.085 + i * 0.028, 0);
                ringMesh.rotation.set(Math.PI / 2 + ((i & 1) ? 0.22 : -0.22), 0, 0);
                whipGroup.add(ringMesh);
            }

            // 2. Engraved brass pommel cap & braided wrist loop
            const pommelGeom = new THREE.SphereGeometry(0.022, 16, 12);
            const pommelMesh = new THREE.Mesh(pommelGeom, brassMat);
            pommelMesh.scale.set(1.0, 0.82, 1.0);
            pommelMesh.position.set(0, -0.125, 0);
            whipGroup.add(pommelMesh);

            const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0035, 8, 16), brassMat);
            pommelRing.position.set(0, -0.112, 0);
            pommelRing.rotation.x = Math.PI / 2;
            whipGroup.add(pommelRing);

            const loopGeom = new THREE.TorusGeometry(0.020, 0.0045, 8, 18);
            const loopMesh = new THREE.Mesh(loopGeom, darkCoilMat);
            loopMesh.position.set(0, -0.145, 0.004);
            loopMesh.rotation.set(0.35, 0.25, 0);
            whipGroup.add(loopMesh);

            // 3. Tapered brass bolster ferrule at top of grip (LatheGeometry — zero BoxGeometry!)
            const collarProfile = [
                new THREE.Vector2(0.0195, 0.102),
                new THREE.Vector2(0.0210, 0.115),
                new THREE.Vector2(0.0175, 0.132),
                new THREE.Vector2(0.0145, 0.145)
            ];
            const collarGeom = new THREE.LatheGeometry(collarProfile, 14);
            whipGroup.add(new THREE.Mesh(collarGeom, brassMat));

            // 4. Five supple concentric braided leather coils gathered naturally in the hand (classic coiled bullwhip)
            const coilGroup = new THREE.Group();
            coilGroup.name = 'WhipHandCoils';
            for (let c = 0; c < 5; c++) {
                const coilRadius = 0.068 + c * 0.0085;
                const tubeRadius = 0.0092 - c * 0.0009;
                const coilGeom = new THREE.TorusGeometry(coilRadius, tubeRadius, 12, 32);
                const coilMesh = new THREE.Mesh(coilGeom, (c & 1) ? handleLeatherMat : darkCoilMat);
                // Hang naturally from the top collar down alongside the grip
                coilMesh.scale.set(0.84, 1.18, 1.0);
                coilMesh.position.set(0.018 + c * 0.0055, 0.025 - c * 0.012, -0.028 - c * 0.006);
                coilMesh.rotation.set(0.18 + c * 0.04, 1.32 - c * 0.05, -0.24 + (c & 1 ? 0.05 : -0.05));
                coilGroup.add(coilMesh);
            }
            // Leather keeper strap binding the top of the coils to the bolster
            const strapGeom = new THREE.TorusGeometry(0.024, 0.0045, 8, 18);
            const strapMesh = new THREE.Mesh(strapGeom, brassMat);
            strapMesh.position.set(0.015, 0.112, -0.018);
            strapMesh.rotation.set(0.45, 0.30, 0.20);
            coilGroup.add(strapMesh);

            // Supple hanging rawhide fall & knotted popper tail draping downward from the outer coil
            const tailCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0.042, -0.045, -0.065),
                new THREE.Vector3(0.050, -0.095, -0.088),
                new THREE.Vector3(0.038, -0.142, -0.105),
                new THREE.Vector3(0.022, -0.168, -0.125)
            ]);
            const tailGeom = new THREE.TubeGeometry(tailCurve, 14, 0.0042, 8, false);
            coilGroup.add(new THREE.Mesh(tailGeom, popperMat));
            const knotMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), brassMat);
            knotMesh.position.set(0.042, -0.045, -0.065);
            coilGroup.add(knotMesh);
            whipGroup.add(coilGroup);

            // 5. Dynamic Attack Strike Lash (only extends forward into the dungeon during active whip crack swing!)
            const strikeGroup = new THREE.Group();
            strikeGroup.name = 'WhipStrikeLash';
            strikeGroup.visible = false;
            const lashStages = [
                {
                    radius: 0.0105,
                    mat: darkCoilMat,
                    pts: [
                        new THREE.Vector3(0, 0.135, 0),
                        new THREE.Vector3(-0.015, 0.105, -0.14),
                        new THREE.Vector3(-0.035, 0.065, -0.32)
                    ]
                },
                {
                    radius: 0.0068,
                    mat: handleLeatherMat,
                    pts: [
                        new THREE.Vector3(-0.035, 0.065, -0.32),
                        new THREE.Vector3(-0.055, 0.025, -0.52),
                        new THREE.Vector3(-0.040, -0.015, -0.72)
                    ]
                },
                {
                    radius: 0.0036,
                    mat: popperMat,
                    pts: [
                        new THREE.Vector3(-0.040, -0.015, -0.72),
                        new THREE.Vector3(-0.018, -0.035, -0.84),
                        new THREE.Vector3(0.010, -0.045, -0.92)
                    ]
                }
            ];
            for (const st of lashStages) {
                const segCurve = new THREE.CatmullRomCurve3(st.pts);
                const segGeom = new THREE.TubeGeometry(segCurve, 14, st.radius, 8, false);
                strikeGroup.add(new THREE.Mesh(segGeom, st.mat));
            }
            whipGroup.add(strikeGroup);

            return whipGroup;
        };

        const whipObj = createWhipViewmodelMesh();
        whipObj.position.set(0.03, -0.035, -0.02);
        whipObj.rotation.set(12 * Math.PI / 180, -22 * Math.PI / 180, 10 * Math.PI / 180);
        this.weaponCache.set('whip', whipObj);
        this._ensurePolyHavenFloorItem('item_gauntlets').then((gTmpl) => {
            if (!gTmpl) return;
            const gClone = this._cloneCachedGltfTemplate(gTmpl, '#3a3530', 'item_gauntlets');
            if (!gClone) return;
            gClone.userData._isHumanGauntlet = true;
            gClone.scale.set(0.30, 0.36, 0.30);
            gClone.position.set(0.0, -0.06, 0.02);
            gClone.rotation.set(0.35, 0.0, -0.18);
            whipObj.add(gClone);
            if (this.currentRightWeapon === 'whip' && this.rightItemSlot) {
                while (this.rightItemSlot.children.length > 0) {
                    this.rightItemSlot.remove(this.rightItemSlot.children[0]);
                }
                this.rightItemSlot.add(whipObj.clone(true));
            }
        }).catch(() => {});
    }

    getCharacterGltfKey(race, name, glyph) {
        return null;
    }

    getMonsterObjKey(race, name, glyph) {
        return null;
    }

    resolveAvatarViewmodel(player) {
        if (!player) return null;
        const rawTag = `${player.avatarId || ''} ${player.monsterForm || ''} ${player.race || ''} ${player.subrace || ''} ${player.class || ''}`.toLowerCase().replace(/[_-]+/g, ' ');
        const isMonsterFlag = Boolean(player.isMonsterAvatar || player.avatarId || player.monsterForm);
        let archetype = null;
        if (/\b(dragon|wyrm|drake)\b/.test(rawTag)) archetype = 'dragon';
        else if (/\b(beholder|eye\s*tyrant|gazer)\b/.test(rawTag)) archetype = 'beholder';
        else if (/\b(vampire\s*lord|nosferatu)\b/.test(rawTag) || (/\bvampire\b/.test(rawTag) && (isMonsterFlag || /\bvampire\b/.test(String(player.race || '').toLowerCase())))) archetype = 'vampire_lord';
        else if (/\b(lich|arch\s*lich|archlich|demilich)\b/.test(rawTag)) archetype = 'lich';
        if (!archetype) return null;
        return {
            archetype,
            isMonsterForm: isMonsterFlag || archetype === 'dragon' || archetype === 'beholder',
            eyeHeight: archetype === 'dragon' ? 2.18 : (archetype === 'beholder' ? 1.84 : (archetype === 'lich' ? 1.72 : 1.74)),
            heightRatio: archetype === 'dragon' ? 1.35 : (archetype === 'beholder' ? 1.14 : 1.07),
            bypassGauntlets: true
        };
    }

    _buildAvatarViewmodelGroup(archetype, side = 'right') {
        if (!this._avatarViewmodelCache) this._avatarViewmodelCache = new Map();
        const cacheKey = `${archetype}:${side}`;
        if (this._avatarViewmodelCache.has(cacheKey)) {
            return this._avatarViewmodelCache.get(cacheKey).clone(true);
        }
        const mirror = side === 'left' ? -1 : 1;
        const root = new THREE.Group();
        root.name = `AvatarVM_${archetype}_${side}`;

        if (archetype === 'dragon') {
            const scaleMat = new THREE.MeshStandardMaterial({
                color: 0x3b1510,
                normalMap: this.scaleNormal || this.organicNormal || null,
                normalScale: new THREE.Vector2(1.55, 1.55),
                emissive: new THREE.Color(0xff3b08),
                emissiveIntensity: 0.30,
                roughness: 0.42,
                metalness: 0.28
            });
            const talonMat = new THREE.MeshStandardMaterial({
                color: 0x1a1412,
                emissive: new THREE.Color(0xff5511),
                emissiveIntensity: 0.20,
                roughness: 0.26,
                metalness: 0.45
            });
            const crestShape = new THREE.Shape();
            crestShape.moveTo(-0.048, -0.14);
            crestShape.quadraticCurveTo(-0.062, -0.02, -0.042, 0.08);
            crestShape.lineTo(0.042, 0.08);
            crestShape.quadraticCurveTo(0.062, -0.02, 0.048, -0.14);
            crestShape.closePath();
            const armGeo = new THREE.ExtrudeGeometry(crestShape, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.010, bevelSize: 0.008, bevelSegments: 2 });
            armGeo.rotateX(-Math.PI * 0.42);
            const armMesh = new THREE.Mesh(armGeo, scaleMat);
            armMesh.position.set(0, -0.05, 0.02);
            root.add(armMesh);
            for (let t = -1; t <= 1; t++) {
                const talon = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.135, 8), talonMat);
                talon.rotation.set(-Math.PI * 0.58, 0, -t * 0.16 * mirror);
                talon.position.set(t * 0.034, -0.01 + (t === 0 ? 0.012 : 0), -0.105 - (t === 0 ? 0.02 : 0));
                root.add(talon);
            }
            root.rotation.set(0.14, -0.18 * mirror, 0.12 * mirror);
        } else if (archetype === 'beholder') {
            const chitinMat = new THREE.MeshStandardMaterial({
                color: 0x4a1d5e,
                normalMap: this.chitinNormal || this.organicNormal || null,
                normalScale: new THREE.Vector2(1.45, 1.45),
                emissive: new THREE.Color(0x581c87),
                emissiveIntensity: 0.22,
                roughness: 0.52,
                metalness: 0.12
            });
            const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.18, metalness: 0.05 });
            const irisMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: new THREE.Color(0xc084fc), emissiveIntensity: 0.55, roughness: 0.14 });
            for (let s = 0; s < 2; s++) {
                const stalk = new THREE.Group();
                const offX = (s === 0 ? 0.02 : -0.045) * mirror;
                const offY = s === 0 ? 0.03 : -0.035;
                for (let seg = 0; seg < 3; seg++) {
                    const segMesh = new THREE.Mesh(new THREE.BoxGeometry(0.026 - seg * 0.003, 0.026 - seg * 0.003, 0.065), chitinMat);
                    segMesh.position.set(offX + seg * 0.012 * mirror, offY + seg * 0.024, 0.04 - seg * 0.058);
                    segMesh.rotation.set(0.22 - seg * 0.08, -0.12 * mirror, 0.15 * seg * mirror);
                    stalk.add(segMesh);
                }
                const tipX = offX + 0.032 * mirror;
                const tipY = offY + 0.068;
                const tipZ = -0.115;
                const rim = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), chitinMat);
                rim.position.set(tipX, tipY, tipZ);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 12), scleraMat);
                eye.position.set(tipX, tipY, tipZ - 0.006);
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), irisMat);
                pupil.position.set(tipX, tipY, tipZ - 0.022);
                stalk.add(rim, eye, pupil);
                root.add(stalk);
            }
            root.userData._isBeholderStalk = true;
        } else {
            const isLich = archetype === 'lich';
            const handMat = new THREE.MeshStandardMaterial({
                color: isLich ? 0xd6cbb5 : 0xd8d4dc,
                normalMap: this.organicNormal || null,
                normalScale: new THREE.Vector2(0.85, 0.85),
                emissive: new THREE.Color(isLich ? 0x38bdf8 : 0x991b1b),
                emissiveIntensity: isLich ? 0.24 : 0.18,
                roughness: isLich ? 0.58 : 0.42,
                metalness: 0.12
            });
            const clawMat = new THREE.MeshStandardMaterial({
                color: isLich ? 0x0f172a : 0x450a0a,
                emissive: new THREE.Color(isLich ? 0x7c3aed : 0xdc2626),
                emissiveIntensity: 0.42,
                roughness: 0.24,
                metalness: 0.50
            });
            const palm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.022, 0.088), handMat);
            palm.position.set(0, -0.035, 0.01);
            root.add(palm);
            for (let f = 0; f < 4; f++) {
                const fx = (-0.027 + f * 0.018) * mirror;
                const phalange = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.012, 0.068), handMat);
                phalange.position.set(fx, -0.026 + (f === 1 || f === 2 ? 0.005 : 0), -0.058);
                phalange.rotation.x = 0.18;
                const claw = new THREE.Mesh(new THREE.ConeGeometry(0.0065, 0.046, 6), clawMat);
                claw.rotation.x = -Math.PI * 0.58;
                claw.position.set(fx, -0.032, -0.105);
                root.add(phalange, claw);
            }
            const auraOrb = new THREE.Mesh(
                new THREE.SphereGeometry(0.024, 12, 10),
                new THREE.MeshBasicMaterial({ color: isLich ? 0x38bdf8 : 0xdc2626, transparent: true, opacity: 0.42 })
            );
            auraOrb.position.set(0, -0.008, -0.045);
            root.add(auraOrb);
            root.rotation.set(0.16, -0.16 * mirror, 0.10 * mirror);
        }

        this._avatarViewmodelCache.set(cacheKey, root);
        return root.clone(true);
    }

    updateViewmodel(player) {
        if (!player) return;

        // 1. Dynamic Character Height & World Scaling Subsystem (Exact Parity with Godot ViewModel.cs)
        const ht = player.ht || 0;
        const race = (player.race || '').toLowerCase();
        const avatarVm = this.resolveAvatarViewmodel(player);
        this._activeAvatarArchetype = avatarVm ? avatarVm.archetype : null;

        let targetEyeHeight = 1.62;
        let heightRatio = 1.0;

        if (ht > 0) {
            targetEyeHeight = (ht / 72.0) * 1.62;
            heightRatio = ht / 72.0;
        } else if (avatarVm) {
            targetEyeHeight = avatarVm.eyeHeight;
            heightRatio = avatarVm.heightRatio;
        } else if (race.includes('halfling') || race.includes('hobbit') || race.includes('kobold')) {
            targetEyeHeight = 0.85;
            heightRatio = 0.60;
        } else if (race.includes('gnome')) {
            targetEyeHeight = 1.00;
            heightRatio = 0.70;
        } else if (race.includes('dwarf')) {
            targetEyeHeight = 1.18;
            heightRatio = 0.78;
        } else if (race.includes('half-troll') || race.includes('troll')) {
            targetEyeHeight = 2.25;
            heightRatio = 1.40;
        } else if (race.includes('half-ogre') || race.includes('ogre')) {
            targetEyeHeight = 2.05;
            heightRatio = 1.28;
        } else if (race.includes('high-elf') || race.includes('elf')) {
            targetEyeHeight = 1.76;
            heightRatio = 1.08;
        }
        if (player.avatarScale && Number(player.avatarScale) > 0) {
            heightRatio = Number(player.avatarScale);
            targetEyeHeight = 1.62 * heightRatio;
        }

        this.eyeHeight = Math.max(0.70, Math.min(2.35, targetEyeHeight));
        this.heightRatio = Math.max(0.55, Math.min(1.45, heightRatio));

        const heightDelta = 1.62 - this.eyeHeight;
        const basePitchDeg = -9.0 + (heightDelta * 22.0);
        this.basePitch = basePitchDeg * (Math.PI / 180.0);
        this.targetPitch = this.basePitch + (this.userPitchOffset || 0.0);

        // Subtle FOV adjustment gated to avoid redundant projection matrix math per turn
        if (this.camera) {
            const nextFov = Math.max(78.0, Math.min(88.0, 86.0 - (this.heightRatio - 0.60) * (6.0 / 0.85)));
            this._baseVerticalFov = nextFov;
            const handheld = Boolean(typeof window !== 'undefined' && window.DeviceProfile && typeof window.DeviceProfile.isHandheld === 'function' && window.DeviceProfile.isHandheld());
            const effFov = this._resolveVerticalFov(nextFov, this.camera.aspect || 1, handheld);
            if (Math.abs(this.camera.fov - effFov) > 0.01) {
                this.camera.fov = effFov;
                this.camera.updateProjectionMatrix();
            }
        }

        if (!this.viewmodelGroup) return;
        this.viewmodelGroup.scale.set(1.0, 1.0, 1.0);

        // 4. Equipment & Creature Avatar Viewmodel resolution (dual-wield & off-hand lantern/torch support)
        const { weaponItem, bowItem, shieldItem, lightItem } = this._extractHandItems(player);
        const useCreatureHands = Boolean(avatarVm && (avatarVm.isMonsterForm || (!weaponItem && !bowItem)));
        const allowOffhandLight = Boolean(!shieldItem && !avatarVm?.isMonsterForm && lightItem && (player.depth === undefined || player.depth > 0) && this.torchRadius !== 0);

        if (shieldItem && !avatarVm?.isMonsterForm) {
            this.resolveShieldModel(shieldItem, player, false);
        } else if (allowOffhandLight) {
            this.resolveShieldModel(lightItem, player, true);
        } else if (useCreatureHands && this.leftItemSlot) {
            this._isOffhandDualWield = false;
            const leftAvatarKey = `avatar:${avatarVm.archetype}:left`;
            if (this.currentLeftWeapon !== leftAvatarKey || this.leftItemSlot.children.length === 0) {
                this.currentLeftWeapon = leftAvatarKey;
                this._clearViewmodelSlot(this.leftItemSlot);
                const leftAvatarMesh = this._buildAvatarViewmodelGroup(avatarVm.archetype, 'left');
                this._tagViewmodelLayer(leftAvatarMesh);
                this.leftItemSlot.add(leftAvatarMesh);
            }
            this.leftHandGroup.visible = true;
        } else {
            this._isOffhandDualWield = false;
            this.leftHandGroup.visible = false;
            this.currentLeftWeapon = null;
        }

        if (useCreatureHands && this.rightItemSlot) {
            const rightAvatarKey = `avatar:${avatarVm.archetype}:right`;
            if (this.currentRightWeapon !== rightAvatarKey || this.rightItemSlot.children.length === 0) {
                this.currentRightWeapon = rightAvatarKey;
                this.currentRightWeaponBrand = null;
                this._clearViewmodelSlot(this.rightItemSlot);
                const rightAvatarMesh = this._buildAvatarViewmodelGroup(avatarVm.archetype, 'right');
                this._tagViewmodelLayer(rightAvatarMesh);
                this.rightItemSlot.add(rightAvatarMesh);
            }
            this.rightHandGroup.visible = true;
            return;
        }

        this.resolveRightWeaponModel(weaponItem, bowItem, player);
    }

    resolveRightWeaponModel(weaponItem, bowItem, player) {
        const lowerW = (weaponItem || '').toLowerCase();
        const key = this._resolveRightKey(weaponItem, bowItem, player);
        const avatarVm = this.resolveAvatarViewmodel(player);
        const bypassGauntlet = Boolean(avatarVm && avatarVm.bypassGauntlets);

        let brandHex = null;
        if (/\b(flame|flaming|fire|burning|anduril|sun)\b/.test(lowerW)) brandHex = '#ff5500';
        else if (/\b(frost|freezing|cold|ice|ringil|glamdring|sting)\b/.test(lowerW)) brandHex = '#38bdf8';
        else if (/\b(lightning|shocking|elec|thunder)\b/.test(lowerW)) brandHex = '#fde047';
        else if (/\b(acid|melting|dissolving)\b/.test(lowerW)) brandHex = '#84cc16';
        else if (/\b(venom|poison|viper)\b/.test(lowerW)) brandHex = '#22c55e';
        else if (/\b(holy|blessed|defender|westernesse|gondolin|lothlorien)\b/.test(lowerW)) brandHex = '#facc15';
        else if (/\b(morgul|vampiric|chaos|terror)\b/.test(lowerW)) brandHex = '#a855f7';

        const stateSig = `${brandHex || ''}|${bypassGauntlet ? 'noGauntlet' : 'std'}`;
        if (this.currentRightWeapon === key && this.currentRightWeaponBrand === stateSig && this.rightItemSlot && this.rightItemSlot.children.length > 0) return;
        this.currentRightWeapon = key;
        this.currentRightWeaponBrand = stateSig;

        if (this.rightItemSlot) {
            this._clearViewmodelSlot(this.rightItemSlot);

            if (!key) {
                this.rightHandGroup.visible = false;
                return;
            }

            let mesh = null;
            if (this.weaponCache.has(key)) {
                mesh = this.weaponCache.get(key).clone(true);
                if (bypassGauntlet) {
                    mesh.traverse((c) => {
                        if (c.userData && c.userData._isHumanGauntlet) c.visible = false;
                    });
                }
                if (brandHex) {
                    const bCol = new THREE.Color(brandHex);
                    mesh.traverse((c) => {
                        if (c.isMesh && c.material && !Array.isArray(c.material)) {
                            const mName = ((c.material.name || '') + ' ' + (c.name || '')).toLowerCase();
                            if (/gauntlet|hand|wood|handle|grip|leather/i.test(mName)) return;
                            const mClone = c.material.clone();
                            mClone._sharedMaterial = false;
                            if (c.material.onBeforeCompile) mClone.onBeforeCompile = c.material.onBeforeCompile;
                            if (c.material.customProgramCacheKey) mClone.customProgramCacheKey = c.material.customProgramCacheKey;
                            if (mClone.color) mClone.color.lerp(bCol, 0.36);
                            if (mClone.emissive) {
                                mClone.emissive.copy(bCol);
                                mClone.emissiveIntensity = 0.28;
                            }
                            c.material = mClone;
                        }
                    });
                }
            } else {
                this._ensureViewmodelWeapon(key);
            }
            if (mesh) {
                this._tagViewmodelLayer(mesh);
                this.rightItemSlot.add(mesh);
            }
            this.rightHandGroup.visible = Boolean(mesh);
        }
    }

    resolveShieldModel(shieldItem, player, isOffhandLight = false) {
        // # ROOT-CAUSE: Support verified shields, dual-wielded off-hand weapons, and off-hand lanterns/torches in dungeon
        if (!this.leftItemSlot) return;
        let key = '';
        let isOffhandWeapon = false;
        if (isOffhandLight) {
            key = (typeof this._resolveOffhandLightKey === 'function') ? this._resolveOffhandLightKey(shieldItem) : 'lantern';
        } else {
            const res = this._resolveLeftShieldOrOffhand(shieldItem);
            key = res.key;
            isOffhandWeapon = res.isOffhandWeapon;
        }
        if (!key) {
            this.leftHandGroup.visible = false;
            this.currentLeftWeapon = null;
            this._isOffhandDualWield = false;
            return;
        }
        this._isOffhandDualWield = Boolean(isOffhandWeapon && !isOffhandLight);
        const cacheTag = isOffhandLight ? `light:${key}` : (isOffhandWeapon ? `offhand:${key}` : key);
        if (this.currentLeftWeapon === cacheTag && this.leftItemSlot.children.length > 0) {
            this.leftHandGroup.visible = true;
            return;
        }
        this.currentLeftWeapon = cacheTag;
        this._clearViewmodelSlot(this.leftItemSlot);
        let hasClone = false;
        if (this.weaponCache.has(key)) {
            const clone = this.weaponCache.get(key).clone(true);
            const avatarVm = this.resolveAvatarViewmodel(player);
            if (avatarVm && avatarVm.bypassGauntlets) {
                clone.traverse((c) => {
                    if (c.userData && c.userData._isHumanGauntlet) c.visible = false;
                });
            }
            if (isOffhandWeapon && !isOffhandLight) {
                clone.scale.x = -Math.abs(clone.scale.x || 1);
            }
            this._tagViewmodelLayer(clone);
            this.leftItemSlot.add(clone);
            hasClone = true;
        } else {
            this._ensureViewmodelWeapon(key);
        }
        this.leftHandGroup.visible = hasClone;
    }

    _ensureViewmodelWeapon(key) {
        // # ROOT-CAUSE: Return a deduplicated Promise from _ensureViewmodelWeapon and expose awaitSceneAssetsReady(frame)
        if (!key) return Promise.resolve(null);
        if (this.weaponCache.has(key)) return Promise.resolve(this.weaponCache.get(key));
        if (!this._viewmodelWeaponPromises) this._viewmodelWeaponPromises = new Map();
        if (this._viewmodelWeaponPromises.has(key)) return this._viewmodelWeaponPromises.get(key);
        const phKey = this._viewmodelWeaponPhMap && this._viewmodelWeaponPhMap[key];
        if (!phKey) return Promise.resolve(null);
        const needsGauntlet = !key.startsWith('shield') && key !== 'bow' && key !== 'lantern' && key !== 'torch';
        const p = Promise.all([
            this._ensurePolyHavenFloorItem(phKey),
            needsGauntlet ? this._ensurePolyHavenFloorItem('item_gauntlets') : Promise.resolve(null)
        ]).then(([tmpl, gTmpl]) => {
            if (!tmpl) return null;
            if (this.weaponCache.has(key)) return this.weaponCache.get(key);
            const wClone = this._cloneCachedGltfTemplate(tmpl, null, phKey);
            if (!wClone) return null;
            this._prepareCanonicalHeldClone(wClone, phKey);
            const innerPivot = wClone.children && wClone.children[0];
            if (key === 'shield' || key.startsWith('shield_')) {
                wClone.scale.setScalar(0.38);
                wClone.position.set(0.02, -0.01, 0);
                wClone.rotation.set(0, 0, 0);
            } else if (key === 'lantern' || key === 'torch') {
                wClone.scale.setScalar(0.34);
                wClone.position.set(0.02, 0.04, -0.02);
                wClone.rotation.set(0.10, 0.15, -0.06);
                wClone.traverse((c) => {
                    if (c.isMesh && c.material && !Array.isArray(c.material) && /glass|flame|glow|wick|fire|ember/i.test((c.name || '') + ' ' + (c.material.name || ''))) {
                        if (c.material.emissive) {
                            c.material.emissive.setHex(0xffb347);
                            c.material.emissiveIntensity = 0.85;
                        }
                    }
                });
            } else if (key === 'bow') {
                if (innerPivot) innerPivot.rotation.y += Math.PI * 0.85;
                wClone.scale.setScalar(0.36);
                wClone.position.set(0, 0.01, 0);
                wClone.rotation.set(0.16, -0.25, 0.12);
            } else if (key === 'shovel' || key === 'pickaxe' || key === 'staff' || key === 'staff_branch' || key === 'wand' || key === 'rod') {
                if (innerPivot) innerPivot.rotation.y += Math.PI * 0.86;
                wClone.scale.setScalar(key === 'wand' || key === 'rod' ? 0.38 : 0.42);
                wClone.position.set(0, 0.012, 0.01);
                wClone.rotation.set(0.16, key === 'shovel' ? -0.28 : -0.22, 0.08);
            } else {
                if (innerPivot) innerPivot.rotation.y += Math.PI * 0.86;
                const vmScale = key === 'spear' ? 0.34 : (key === 'claymore' || key === 'sledgehammer' ? 0.36 : (key === 'dagger' || key === 'hatchet' ? 0.46 : 0.40));
                wClone.scale.setScalar(vmScale);
                wClone.position.set(0, key === 'dagger' || key === 'hatchet' ? 0.002 : 0.015, 0.01);
                wClone.rotation.set(0.16, -0.22, 0.10);
            }
            if (needsGauntlet && gTmpl) {
                const gClone = this._cloneCachedGltfTemplate(gTmpl, '#3a3530', 'item_gauntlets');
                if (gClone) {
                    gClone.userData._isHumanGauntlet = true;
                    gClone.scale.set(0.35, 0.44, 0.35);
                    gClone.position.set(0.0, -0.068, 0.032);
                    gClone.rotation.set(0.35, 0.0, -0.18);
                    wClone.add(gClone);
                }
            }
            wClone.traverse((c) => {
                if (c.geometry) c.geometry._sharedGeometry = true;
                if (c.material) {
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    for (let i = 0; i < mats.length; i++) {
                        if (mats[i]) mats[i]._sharedMaterial = true;
                    }
                }
            });
            this.weaponCache.set(key, wClone);
            if (this.lastFrame && this.lastFrame.player) {
                this.currentRightWeapon = null;
                this.currentLeftWeapon = null;
                this.updateViewmodel(this.lastFrame.player);
            }
            return wClone;
        }).catch(() => null);
        this._viewmodelWeaponPromises.set(key, p);
        return p;
    }

    resolveDesiredViewmodelKeys(player) {
        if (!player) return [];
        const { weaponItem, bowItem, shieldItem, lightItem } = this._extractHandItems(player);
        const keys = [];
        const rightKey = this._resolveRightKey(weaponItem, bowItem, player);
        if (rightKey && !this.weaponCache.has(rightKey)) keys.push(rightKey);
        const { key: shieldKey } = this._resolveLeftShieldOrOffhand(shieldItem);
        const leftKey = shieldKey || ((lightItem && (player.depth === undefined || player.depth > 0) && typeof this._resolveOffhandLightKey === 'function')
            ? this._resolveOffhandLightKey(lightItem)
            : '');
        if (leftKey && !this.weaponCache.has(leftKey) && !keys.includes(leftKey)) keys.push(leftKey);
        return keys;
    }

    getRequiredPbrSetIds(theme, outdoors, realm, tier1Only = false, explicitDepth = null, frameHint = null) {
        // # ROOT-CAUSE: Delegate to unified resolveContextualPbrIds using explicitDepth/frameHint first so stale this.lastDepth (e.g. 0 from Menu/Town) never preloads Town PBR sets when entering Dungeon L1+.
        const tid = String((theme && theme.id) ? theme.id : (theme || '')).toLowerCase();
        const r = String(realm || this.realm || 'angband').toLowerCase();
        const srcFrame = frameHint || this.lastFrame;
        const depth = typeof explicitDepth === 'number'
            ? explicitDepth
            : ((srcFrame && srcFrame.player && typeof srcFrame.player.depth === 'number')
                ? srcFrame.player.depth
                : (typeof this.lastDepth === 'number' ? this.lastDepth : (outdoors ? 0 : 1)));
        const branch = String((srcFrame && (srcFrame.branch || srcFrame.branch_name || (srcFrame.player && (srcFrame.player.branch || srcFrame.player.branch_name)))) || '').toLowerCase();
        const ryodBiome = String(
            (srcFrame && (srcFrame.biomeTheme || (srcFrame.map && srcFrame.map.biomeTheme)))
            || (theme && theme.ryodBiome)
            || (typeof window !== 'undefined' && window.__activeRyodBlueprint && window.__activeRyodBlueprint.biome)
            || ''
        ).toLowerCase();
        if (typeof this.resolveContextualPbrIds === 'function') {
            return this.resolveContextualPbrIds(r, depth, Boolean(outdoors), branch, ryodBiome, {
                themeId: tid,
                hasShops: Boolean(outdoors || depth === 0 || (srcFrame && srcFrame._levelHasShops) || this._levelHasShops),
                tier1Only: Boolean(tier1Only)
            });
        }
        return outdoors
            ? ['plastered_stone_wall', 'cobblestone_floor_08', 'castle_brick_broken_06', 'bark_willow_02']
            : ['japanese_stone_wall', 'monastery_stone_floor', 'rock_wall_10', 'bark_willow_02'];
    }

    hasPendingSceneAssets(frame) {
        if (!frame) return false;
        if (!this._gpuInitialized) return true;
        const player = frame.player || {};
        const depth = Number(player.depth || 0);
        const outdoors = Boolean(frame.outdoors) || depth === 0;
        const theme = frame.theme || this.currentBiome || (depth === 0 ? 'TOWN' : 'GRANITE');
        const pbrIds = this.getRequiredPbrSetIds(theme, outdoors, frame.realm || this.realm, true, depth, frame);
        const ph = this.polyHavenSets;
        for (const id of pbrIds) {
            const entry = ph && ph.get(id);
            if (!entry || !entry._loaded) return true;
        }
        if (!this._sharedDetailTexLoaded) return true;
        return false;
    }

    getLevelPrewarmManifest(depth, outdoors) {
        // # ROOT-CAUSE: Pre-stage level-wide monster and item GLB archetypes during initial/between-level loading and stream remaining bestiary GLBs silently in idle time so normal same-level gameplay never pops up #loading-overlay.
        if (outdoors || depth === 0) {
            return { monsters: [], items: [] };
        }
        return {
            monsters: [
                'char_male_ranger',
                'char_female_ranger',
                'char_male_rogue',
                'char_male_priest',
                'char_male_guard',
                'bestiary_kobold',
                'bestiary_goblin',
                'bestiary_orc',
                'bestiary_skeleton_warrior',
                'bestiary_zombie',
                'bestiary_wolf',
                'obj_spider',
                'obj_snake',
                'bestiary_beetle',
                'ph_street_rat'
            ],
            items: [
                'item_longsword',
                'ph_dagger',
                'ph_axe',
                'ph_mace',
                'item_bow',
                'ph_shield',
                'item_torch',
                'ph_lantern',
                'item_coins',
                'ph_chest'
            ]
        };
    }

    scheduleSilentBestiaryPrewarm() {
        if (this._silentPrewarmStarted) return;
        const conn = (typeof navigator !== 'undefined' && navigator.connection) ? navigator.connection : null;
        if (conn && (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g')) return;
        if (this.renderBudget && (this.renderBudget.tier === 'phone' || this.renderBudget.gpuTier === 'mobile-saver')) return;
        if (Number(this.lastDepth || 0) === 0) return;
        this._silentPrewarmStarted = true;
        const backgroundMonsterKeys = [
            'bestiary_puglin',
            'bestiary_imp',
            'bestiary_hobgoblin',
            'bestiary_gnoll',
            'bestiary_troll',
            'bestiary_ogre',
            'bestiary_wraith',
            'bestiary_skeleton_knight',
            'bestiary_hellhound',
            'bestiary_husky',
            'bestiary_werewolf',
            'bestiary_lion',
            'bestiary_scorpion',
            'bestiary_centipede',
            'bestiary_ant',
            'obj_wasp',
            'bestiary_golem',
            'bestiary_dragon'
        ];
        let idx = 0;
        const pumpNext = () => {
            if (idx >= backgroundMonsterKeys.length) return;
            if (window.gameSceneAssetsLoading || window.gameNetworkConnecting) {
                setTimeout(pumpNext, 500);
                return;
            }
            const key = backgroundMonsterKeys[idx++];
            if (this._monster3DTemplates && this._monster3DTemplates.has(key)) {
                setTimeout(pumpNext, 40);
                return;
            }
            this._ensureMonster3DTemplate(key)
                .catch(() => null)
                .finally(() => {
                    setTimeout(pumpNext, 550);
                });
        };
        setTimeout(pumpNext, 2200);
    }

    async awaitSceneAssetsReady(frame, onProgress) {
        if (!frame) return true;
        window.gameSceneAssetsLoading = true;
        this._suppressMenuPbrLoads = false;
        this._pbrPrewarmSeq = (this._pbrPrewarmSeq || 0) + 1;
        const yieldFrame = () => new Promise((r) => setTimeout(r, 20));
        try {
            await yieldFrame();
            this.ensureGpuInitialized(frame.realm || (frame.player && frame.player.realm) || this.realm);
            const player = frame.player || {};
            const depth = Number(player.depth || 0);
            const outdoors = Boolean(frame.outdoors) || depth === 0;
            const theme = frame.theme || this.currentBiome || (depth === 0 ? 'TOWN' : 'GRANITE');
            const tier1Tasks = [];
            const addTier1 = (p) => { if (p && typeof p.then === 'function') tier1Tasks.push(p.catch(() => null)); };

            const mapRows = frame.map && Array.isArray(frame.map.rows) ? frame.map.rows : [];
            let mapHasTrees = outdoors;
            let mapHasDoors = outdoors;
            let mapHasQuartz = false;
            let mapHasMagma = false;
            if (mapRows.length > 0) {
                for (let r = 0; r < mapRows.length; r++) {
                    const fRow = mapRows[r] && mapRows[r].f;
                    if (!fRow) continue;
                    if (!mapHasTrees && (fRow.includes('29') || fRow.includes('2a'))) mapHasTrees = true;
                    if (!mapHasDoors && (fRow.includes('06') || fRow.includes('07') || fRow.includes('08') || fRow.includes('09'))) mapHasDoors = true;
                    if (!mapHasQuartz && (fRow.includes('0e') || fRow.includes('32'))) mapHasQuartz = true;
                    if (!mapHasMagma && (fRow.includes('0f') || fRow.includes('33'))) mapHasMagma = true;
                }
            }

            const tier1AllIds = this.getRequiredPbrSetIds(theme, outdoors, frame.realm || this.realm, true, depth, frame);
            const coreSet = new Set(
                tier1AllIds.wallPhId
                    ? [tier1AllIds.wallPhId, tier1AllIds.floorPhId, tier1AllIds.permPhId, tier1AllIds.ceilPhId].filter(Boolean)
                    : tier1AllIds
            );
            if (mapHasDoors && tier1AllIds.includes('bark_willow_02')) coreSet.add('bark_willow_02');
            if (mapHasQuartz && tier1AllIds.includes('marble_cliff_01')) coreSet.add('marble_cliff_01');
            if (mapHasMagma && tier1AllIds.includes('marble_cliff_02')) coreSet.add('marble_cliff_02');
            const tier1Ids = Array.from(coreSet);
            const tier1Set = new Set(tier1Ids);
            const pbrFileProgress = new Map();
            let gateDone = false;
            let completed = 0;
            let nonPbrTotal = 0;
            let nonPbrDone = 0;

            const reportDetailedProgress = (prefix) => {
                if (gateDone || typeof onProgress !== 'function') return;
                let pbrLoaded = 0;
                let pbrTotal = 0;
                for (const st of pbrFileProgress.values()) {
                    pbrLoaded += st.loaded;
                    pbrTotal += st.total;
                }
                const totalUnits = Math.max(1, pbrTotal + nonPbrTotal);
                const doneUnits = Math.min(totalUnits, pbrLoaded + nonPbrDone);
                const msg = prefix || (pbrLoaded < pbrTotal
                    ? `Loading High-Res Stone & Dungeon Textures (${pbrLoaded}/${pbrTotal} maps)...`
                    : `Loading 3D Dungeon Models & Props (${doneUnits}/${totalUnits})...`);
                onProgress(doneUnits, totalUnits, msg);
            };

            for (const id of tier1Ids) {
                const existing = this.polyHavenSets && this.polyHavenSets.get(id);
                pbrFileProgress.set(id, {
                    loaded: existing && existing._loaded ? (existing._totalCount || 4) : ((existing && existing._loadedCount) || 0),
                    total: (existing && existing._totalCount) || 4
                });
                addTier1(this.ensurePbrSetReady(id, (loadedCount, totalCount) => {
                    pbrFileProgress.set(id, { loaded: loadedCount, total: totalCount });
                    reportDetailedProgress();
                }));
            }
            addTier1(this.ensureSharedDetailTexturesReady());
            for (const vKey of this.resolveDesiredViewmodelKeys(player)) {
                addTier1(this._ensureViewmodelWeapon(vKey));
            }
            if (typeof this._loadPolyHavenEnvironmentModels === 'function') addTier1(this._loadPolyHavenEnvironmentModels({ outdoors: mapHasTrees }));

            const visibleMonsterKeys = new Set();
            const visibleItemKeys = new Set();
            for (const m of (frame.monsters || [])) {
                const cfg = typeof this.resolveMonster3DConfig === 'function' ? this.resolveMonster3DConfig(m, m.glyph) : null;
                if (cfg && cfg.templateKey) {
                    visibleMonsterKeys.add(cfg.templateKey);
                    if (cfg.weaponKey) visibleItemKeys.add(cfg.weaponKey);
                    if (cfg.shieldKey) visibleItemKeys.add(cfg.shieldKey);
                }
            }
            for (const it of (frame.items || [])) {
                const phKey = typeof this.getItemObjKey === 'function' ? this.getItemObjKey(it.name || '', it.glyph || '') : null;
                if (phKey) visibleItemKeys.add(phKey);
            }
            for (const tKey of visibleMonsterKeys) addTier1(this._ensureMonster3DTemplate(tKey));
            for (const hKey of visibleItemKeys) addTier1(this._ensurePolyHavenFloorItem(hKey));

            const total = tier1Tasks.length;
            nonPbrTotal = Math.max(0, total - tier1Ids.length);
            if (total > 0) {
                if (typeof onProgress === 'function') onProgress(0, total, 'Loading High-Res Stone & Dungeon Textures...');
                const gateAll = Promise.all(tier1Tasks.map((p, idx) => p.then((res) => {
                    completed++;
                    if (idx >= tier1Ids.length) nonPbrDone++;
                    if (!gateDone && typeof onProgress === 'function') {
                        reportDetailedProgress();
                    }
                    return res;
                })));
                await Promise.race([gateAll, new Promise((r) => setTimeout(r, 22000))]);
                gateDone = true;
            }

            // Tier-2 deferred background stream: ONLY start after Tier-1 core PBR sets & room models finish so bandwidth is never starved
            const bgTasks = [];
            const addBg = (p) => { if (p && typeof p.then === 'function') bgTasks.push(p.catch(() => null)); };
            const allPbrIds = this.getRequiredPbrSetIds(theme, outdoors, frame.realm || this.realm, false, depth, frame);
            for (const id of allPbrIds) {
                if (!tier1Set.has(id)) addBg(this.ensurePbrSetReady(id));
            }
            const prewarm = this.getLevelPrewarmManifest(depth, outdoors);
            const monsterTemplateKeys = new Set(prewarm.monsters || []);
            if (String((frame && frame.realm) || this.realm || '').toLowerCase() === 'nethack') {
                monsterTemplateKeys.add('bestiary_husky');
                monsterTemplateKeys.add('bestiary_wolf');
            }
            const heldItemPhKeys = new Set(prewarm.items || []);
            for (const tKey of monsterTemplateKeys) {
                if (!visibleMonsterKeys.has(tKey)) addBg(this._ensureMonster3DTemplate(tKey));
            }
            for (const hKey of heldItemPhKeys) {
                if (!visibleItemKeys.has(hKey)) addBg(this._ensurePolyHavenFloorItem(hKey));
            }
            if (bgTasks.length > 0) {
                Promise.all(bgTasks).then(() => {
                    if (typeof this.upgradeAllMonsterEntities === 'function') this.upgradeAllMonsterEntities();
                    if (typeof this.upgradeAllItemEntities === 'function') this.upgradeAllItemEntities();
                    if (this.renderGovernor && typeof this.renderGovernor.wake === 'function') this.renderGovernor.wake(350);
                }).catch(() => null);
            }

            await yieldFrame();
            this._currentThemeId = null;
            this._currentTexturesAreOutdoors = null;
            const activeRealm = frame.realm || this.realm || 'angband';
            this.realm = activeRealm;
            this.lastDepth = depth;
            const resolvedBiome = this.currentBiome || (typeof this.getBiomeProfile === 'function' ? this.getBiomeProfile(depth, this.levelSeed || 0, activeRealm) : null);
            this.applyEnvironmentTextures(outdoors, resolvedBiome, activeRealm, depth, this.levelSeed || 0);
            if (typeof this.updateDungeon === 'function') {
                try {
                    this.updateDungeon(frame);
                } catch (err) {
                    console.error('[Dungeon3D updateDungeon in awaitSceneAssetsReady]', err);
                }
            }
            if (typeof onProgress === 'function') onProgress(1, 1, 'Uploading High-Res Textures to GPU...');
            if (this.renderer && typeof this.renderer.initTexture === 'function') {
                const worldMats = [
                    this.wallMaterial, this.floorMaterial, this.permWallMaterial, this.ceilingMaterial,
                    this.stairsMaterial, this.mountainMaterial, this.rubbleMaterial, this.chasmSideMaterial,
                    this.doorMaterial, this.quartzMaterial, this.magmaMaterial, this.waterMaterial
                ];
                for (const mat of worldMats) {
                    if (!mat) continue;
                    for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap']) {
                        const tex = mat[slot];
                        if (tex) {
                            try { this.renderer.initTexture(tex); } catch (_) {}
                        }
                    }
                }
            }
            await yieldFrame();
            if (typeof this.upgradeAllMonsterEntities === 'function') this.upgradeAllMonsterEntities();
            if (typeof this.upgradeAllItemEntities === 'function') this.upgradeAllItemEntities();
            if (frame.player) {
                this.currentRightWeapon = null;
                this.currentLeftWeapon = null;
                this.updateViewmodel(frame.player);
            }
            this.scheduleSilentBestiaryPrewarm();
            return true;
        } finally {
            window.gameSceneAssetsLoading = false;
        }
    }

    prewarmRealmPbr(realmKey, onProgress = null) {
        const r = String(realmKey || this.realm || 'angband').toLowerCase();
        const isTownStart = r === 'angband' || r === 'frogcomposband' || r === 'hengband'
            || (r === 'ryod' && (!window.__activeRyodBlueprint || window.__activeRyodBlueprint.startMode !== 'dungeon'));
        const warmToken = (this._pbrPrewarmSeq = (this._pbrPrewarmSeq || 0) + 1);
        const startDepth = isTownStart ? 0 : 1;

        if (!this._gpuInitialized || !this.polyHavenSets || this.polyHavenSets.size === 0) {
            Dungeon3D.prefetchRealmTextureHttp(r);
            return Promise.resolve({ loaded: 0, total: 0, warm: false });
        }

        const rawWarmIds = this.getRequiredPbrSetIds(isTownStart ? 'TOWN' : 'GRANITE', isTownStart, r, true, startDepth, null);
        const coreWarm = rawWarmIds.wallPhId
            ? [rawWarmIds.wallPhId, rawWarmIds.floorPhId, rawWarmIds.permPhId, rawWarmIds.ceilPhId].filter(Boolean)
            : rawWarmIds;
        const primaryIds = [...new Set(coreWarm)];
        const allWarmIds = primaryIds;
        const stats = new Map();
        for (const id of allWarmIds) {
            const e = this.polyHavenSets.get(id);
            stats.set(id, {
                loaded: e && e._loaded ? (e._totalCount || 4) : (e && e._loadedCount ? e._loadedCount : 0),
                total: (e && e._totalCount) || 4
            });
        }
        const emitProgress = () => {
            if (warmToken !== this._pbrPrewarmSeq || typeof onProgress !== 'function') return;
            let loaded = 0;
            let total = 0;
            for (const st of stats.values()) {
                loaded += st.loaded;
                total += st.total;
            }
            try { onProgress(loaded, total, loaded >= total); } catch (_) {}
        };
        emitProgress();

        const warmGroup = (ids) => Promise.all(ids.map((id) => this.ensurePbrSetReady(id, (loadedCount, totalCount) => {
            stats.set(id, { loaded: loadedCount, total: totalCount });
            emitProgress();
        }).catch(() => null)));

        return warmGroup(primaryIds).then(() => {
            if (warmToken !== this._pbrPrewarmSeq) return { loaded: 0, total: 0, aborted: true };
            if (typeof this.ensureSharedDetailTexturesReady === 'function') {
                this.ensureSharedDetailTexturesReady().catch(() => null);
            }
            return null;
        }).then(() => {
            emitProgress();
            let loaded = 0;
            let total = 0;
            for (const st of stats.values()) { loaded += st.loaded; total += st.total; }
            return { loaded, total, warm: loaded >= total };
        });
    }

    triggerAttackAnimation(fromMessage = false) {
        // # ROOT-CAUSE: Debounce server round-trip attack animation resets, stack multi-blow floating text, and translate cone pivots
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (fromMessage && this.attackAnimationTime > 0.03 && (now - (this._lastInputAttackMs || 0) < 190)) {
            return;
        }
        if (!fromMessage) {
            this._lastInputAttackMs = now;
        }
        this._swingOffhandNext = this._isOffhandDualWield ? !this._swingOffhandNext : false;
        this.attackAnimationTime = 0.24; // 240ms 3-phase swing
    }

    triggerHurtAnimation() {
        this.hurtAnimationTime = 0.16; // 160ms recoil
    }

    triggerCastAnimation() {
        this.castAnimationTime = 0.32; // 320ms magical raise
    }

    triggerActionAnimation(actionKind = 'cast', duration = 0.36) {
        this.actionAnimationKind = actionKind;
        this.actionAnimationDuration = Math.max(0.12, Number(duration) || 0.36);
        this.actionAnimationTime = this.actionAnimationDuration;
        if (actionKind === 'attack' || actionKind === 'dig' || actionKind === 'shoot' || actionKind === 'throw') {
            this.attackAnimationTime = Math.max(this.attackAnimationTime || 0, 0.24);
        } else if (actionKind === 'cast' || actionKind === 'study' || actionKind === 'read' || actionKind === 'aim' || actionKind === 'quaff' || actionKind === 'eat' || actionKind === 'horn') {
            this.castAnimationTime = Math.max(this.castAnimationTime || 0, this.actionAnimationDuration);
        }
    }

    triggerMonsterHitReaction(monsterEntity, isKill = false) {
        // # ROOT-CAUSE: Separate hit flinch from attack lunge and trigger embedded glTF hit/attack clips
        if (!monsterEntity) return;
        monsterEntity._hitFlinchTimer = 0.20;
        const camPos = this.camera ? this.camera.position : new THREE.Vector3();
        monsterEntity._hitFlinchDir = monsterEntity.position.clone().sub(camPos).setY(0).normalize();
        if (monsterEntity._hitFlinchDir.lengthSq() < 0.001) {
            monsterEntity._hitFlinchDir.set(0, 0, -1);
        }
        monsterEntity._hitFlashTimer = 0.18;
        if (!isKill && monsterEntity._hitAction && monsterEntity._mixer) {
            try {
                monsterEntity._hitAction.reset().fadeIn(0.05).play();
            } catch (_) {}
        }
    }

    triggerMonsterAttackLunge(monsterEntity) {
        if (!monsterEntity) return;
        monsterEntity._attackLungeTimer = 0.22;
        const camPos = this.camera ? this.camera.position : new THREE.Vector3();
        monsterEntity._attackLungeDir = camPos.clone().sub(monsterEntity.position).setY(0).normalize();
        if (monsterEntity._attackLungeDir.lengthSq() < 0.001) {
            monsterEntity._attackLungeDir.set(0, 0, 1);
        }
        if (monsterEntity._attackAction && monsterEntity._mixer) {
            try {
                monsterEntity._attackAction.reset().fadeIn(0.05).play();
            } catch (_) {}
        }
    }

    triggerMessageVfx(msgText) {
        if (!msgText) return;
        const clauses = String(msgText).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        if (clauses.length > 1) {
            let vfxCount = 0;
            for (const cl of clauses) {
                if (vfxCount >= 3) break;
                if (vfxCount === 0) {
                    if (this._triggerSingleClauseVfx(cl)) vfxCount++;
                } else {
                    const delay = vfxCount * 85;
                    vfxCount++;
                    if (!this._pendingVfxTimers) this._pendingVfxTimers = new Set();
                    const tid = setTimeout(() => {
                        if (this._pendingVfxTimers) this._pendingVfxTimers.delete(tid);
                        this._triggerSingleClauseVfx(cl);
                    }, delay);
                    this._pendingVfxTimers.add(tid);
                }
            }
            return;
        }
        this._triggerSingleClauseVfx(String(msgText));
    }

    _resolveEquippedMeleeStyle(lower) {
        const eq = String(this.currentRightWeapon || '').toLowerCase();
        if (lower.includes('whip') || lower.includes('lash') || eq === 'whip') {
            return { weaponCat: 'whip', vfxKind: 'whip_lash', vfxColor: 0xffb347, label: 'LASH' };
        }
        if (lower.includes('cleave') || lower.includes('hack') || lower.includes('chop') || eq === 'axe') {
            return { weaponCat: 'axe', vfxKind: 'axe_cleave', vfxColor: 0xff6b35, label: 'CLEAVE' };
        }
        if (lower.includes('crush') || lower.includes('smite') || lower.includes('pound') || lower.includes('bash') || lower.includes('hammer') || lower.includes('club') || lower.includes('mace') || eq === 'hammer' || eq === 'mace') {
            return { weaponCat: 'blunt', vfxKind: 'blunt', vfxColor: 0xffaa44, label: 'CRUSH' };
        }
        if (lower.includes('stab') || lower.includes('gouge') || lower.includes('pierce') || lower.includes('thrust') || lower.includes('impale') || lower.includes('spear') || eq === 'spear' || eq === 'dagger') {
            return { weaponCat: 'pierce', vfxKind: 'pierce', vfxColor: 0x88eeff, label: 'THRUST' };
        }
        return { weaponCat: 'blade', vfxKind: 'slash', vfxColor: 0xff4444, label: 'SLASH' };
    }

    _triggerSingleClauseVfx(msgText) {
        if (!msgText) return false;
        const lower = msgText.toLowerCase();

        const isPlayerSource = lower.startsWith('you ') || lower.startsWith('your ') ||
            lower.includes('you hit') || lower.includes('you strike') || lower.includes('you slash') ||
            lower.includes('you cleave') || lower.includes('you hack') || lower.includes('you lash') ||
            lower.includes('you whip') || lower.includes('you stab') || lower.includes('you thrust') ||
            lower.includes('you crush') || lower.includes('you smite') || lower.includes('you shoot') ||
            lower.includes('you fire') || lower.includes('you cast') || lower.includes('you throw') ||
            lower.includes('you zap') || lower.includes('you aim') || lower.includes('you quaff') ||
            lower.includes('you read') || lower.includes('you tunnel') || lower.includes('you dig') ||
            lower.includes('you pray') || lower.includes('you recite') || lower.includes('you use a staff');

        const isRangedOrSpell = /\b(lightning|elec|shock|thunder|spark|breathes|fireball|frost|cold|ice bolt|ice storm|blizzard|acid|poison|venom|missile|mana bolt|mana storm|mana burst|chaos|nether|you cast|you zap|you aim|mumbles|invokes|you shoot|you fire|shoots|fires|arrow|bolt|you throw|you hurl|flask)\b/.test(lower);
        const ep = this._resolveCombatEndpoints(lower, isPlayerSource, isRangedOrSpell);
        const sPan = ep.spatialAudio || ep.pan;
        const mGlyph = (ep.monsterEntity && ep.monsterEntity.monsterData && ep.monsterEntity.monsterData.char) || (ep.monsterEntity && ep.monsterEntity.glyph) || 'm';

        // 1. Lightning Spells & Attacks
        if (/\b(lightning|elec|shock|thunder|spark)\b/.test(lower)) {
            this.spawnProjectileOrSpellVfx('lightning', ep.startPos, ep.endPos, 0x66f0ff);
            if (this.audio && typeof this.audio.playLightningCrack === 'function') {
                this.audio.playLightningCrack(sPan);
            } else if (this.audio && typeof this.audio.playSpell === 'function') {
                this.audio.playSpell('lightning', sPan);
            }
            if (isPlayerSource) {
                this.triggerCastAnimation();
                this.spawnFloatingText('LIGHTNING', ep.startPos, '#66f0ff', 1.15);
            } else {
                this.addTrauma(0.28);
                this.triggerHurtAnimation();
            }
            return true;
        }

        // 2. Fire / Frost / Acid / Poison / Nether / Chaos / Mana Spells & Breaths
        if (/\b(breathes|fireball|frost|cold|ice bolt|ice storm|blizzard|acid|poison|venom|missile|mana bolt|mana storm|mana burst|chaos|nether|you cast|you zap|you aim|mumbles|invokes)\b/.test(lower)) {
            const isBreath = lower.includes('breathe') || lower.includes('breath');
            if (/\b(heal|cure|restore|satisfy|bless|sanctuary|prayer)\b/.test(lower) && !isBreath) {
                this.spawnProjectileOrSpellVfx('aura', ep.startPos, ep.startPos, 0x33ff88);
                if (this.audio && typeof this.audio.playHeal === 'function') {
                    this.audio.playHeal();
                } else if (this.audio && typeof this.audio.playRunicAura === 'function') {
                    this.audio.playRunicAura('heal', isPlayerSource ? 0 : sPan);
                }
                if (isPlayerSource) {
                    this.triggerCastAnimation();
                }
                return true;
            }
            let elemColor = 0xff5500;
            let elemType = 'fire';
            let vfxKind = 'fireball';
            let vfxElem = 'fire';
            let labelHex = '#ff9944';
            if (/\b(frost|cold|ice|blizzard|freezing)\b/.test(lower)) {
                elemColor = 0x38bdf8;
                elemType = 'cold';
                vfxKind = 'frost';
                vfxElem = 'frost';
                labelHex = '#7dd3fc';
            } else if (/\b(acid|vitriol)\b/.test(lower)) {
                elemColor = 0x84cc16;
                elemType = 'acid';
                vfxKind = 'acid';
                vfxElem = 'acid';
                labelHex = '#bef264';
            } else if (/\b(poison|venom|miasma|toxic)\b/.test(lower)) {
                elemColor = 0x9333ea;
                elemType = 'poison';
                vfxKind = 'poison';
                vfxElem = 'poison';
                labelHex = '#34d399';
            } else if (lower.includes('nether')) {
                elemColor = 0x7e22ce;
                elemType = 'magic';
                vfxKind = 'nether';
                vfxElem = 'nether';
                labelHex = '#d946ef';
            } else if (/\b(chaos|mana bolt|mana storm|mana burst|missile)\b/.test(lower)) {
                elemColor = 0xc026d3;
                elemType = 'magic';
                vfxKind = 'chaos';
                vfxElem = 'chaos';
                labelHex = '#e879f9';
            }
            this.spawnProjectileOrSpellVfx(isBreath ? 'breath' : vfxKind, ep.startPos, ep.endPos, elemColor, { element: vfxElem });
            if ((isBreath || elemType === 'fire') && this.audio && typeof this.audio.playFireballDetonation === 'function') {
                this.audio.playFireballDetonation(isBreath, sPan);
            } else if (this.audio && typeof this.audio.playSpell === 'function') {
                this.audio.playSpell(elemType, sPan);
            }
            if (isPlayerSource) {
                this.triggerCastAnimation();
                this.spawnFloatingText(isBreath ? 'BREATH' : 'CAST', ep.startPos, labelHex, 1.10);
            } else {
                this.addTrauma(0.30);
                this.triggerHurtAnimation();
            }
            return true;
        }

        // 3. Arrows / Bolts / Slings
        if (/\b(you shoot|you fire|shoots an arrow|fires a bolt|shoots a|fires a)\b/.test(lower) ||
            ((lower.includes('arrow') || lower.includes('bolt')) && (lower.includes('shoot') || lower.includes('fire')))) {
            this.spawnProjectileOrSpellVfx('arrow', ep.startPos, ep.endPos, 0xdbeafe);
            if (this.audio && typeof this.audio.playArrowLooseAndImpact === 'function') {
                this.audio.playArrowLooseAndImpact('loose', sPan);
            } else if (this.audio && typeof this.audio.playBowShoot === 'function') {
                this.audio.playBowShoot(sPan);
            }
            if (isPlayerSource) {
                this.triggerAttackAnimation(true);
                this.spawnFloatingText('SHOOT', ep.startPos, '#ffdd55', 1.05);
            }
            return true;
        }

        // 4. Thrown Potions / Flasks / Items
        if (/\b(you throw|you hurl|shatters|flask of oil)\b/.test(lower)) {
            const potCol = lower.includes('oil') ? 0xcc6611 : 0x55ffaa;
            this.spawnProjectileOrSpellVfx('potion', ep.startPos, ep.endPos, potCol);
            if (this.audio && typeof this.audio.playPotionThrowAndShatter === 'function') {
                this.audio.playPotionThrowAndShatter('shatter', sPan);
            } else if (this.audio && typeof this.audio.playWhoosh === 'function') {
                this.audio.playWhoosh();
            }
            if (isPlayerSource) {
                this.triggerAttackAnimation(true);
                this.spawnFloatingText('THROW', ep.startPos, '#ffcc44', 1.05);
            }
            return true;
        }

        // 5. Scrolls, Staves, Potions Quaffed, Rations Eaten, Spells Studied & Horns/Songs/Forges/Cards (EN/JP)
        if (/\b(you read|you recite|you use a staff|you quaff|you drink|you pray|you eat|that tastes|you have learned|you blow|you sing|you chant|song of|forge|anvil|mithril|trump|shuffle|koto|shamisen|kata)\b/.test(lower) ||
            /読んだ|唱えた|飲んだ|食べた|学んだ|吹き鳴らした|祈った|琴|三味線|型/.test(msgText)) {
            let auraColor = 0x66ccff;
            let auraKind = 'runic';
            let actionKind = 'read';
            let floatLabel = 'INVOKE';
            if (lower.includes('forge') || lower.includes('anvil') || lower.includes('mithril')) {
                this.spawnHitSparks(ep.startPos, 0xffaa33, 18);
                if (this.audio && typeof this.audio.playAnvilStrike === 'function') this.audio.playAnvilStrike();
                this.spawnFloatingText('FORGE!', ep.startPos, '#ffd700', 1.20);
                return true;
            }
            if (lower.includes('trump') || lower.includes('shuffle')) {
                this.spawnProjectileOrSpellVfx('aura', ep.startPos, ep.startPos, 0xc084fc);
                if (this.audio && typeof this.audio.playTrumpSnap === 'function') this.audio.playTrumpSnap();
                this.spawnFloatingText('TRUMP!', ep.startPos, '#e879f9', 1.15);
                return true;
            }
            if (lower.includes('koto') || lower.includes('shamisen') || lower.includes('kata') || /琴|三味線|型/.test(msgText)) {
                this.spawnProjectileOrSpellVfx('aura', ep.startPos, ep.startPos, 0xfbbf24);
                if (this.audio && typeof this.audio.playKotoPluck === 'function') this.audio.playKotoPluck();
                this.spawnFloatingText('BUSHIDO', ep.startPos, '#fde047', 1.15);
                return true;
            }
            if (lower.includes('quaff') || lower.includes('drink') || msgText.includes('飲')) {
                auraColor = 0x33ff88;
                auraKind = 'potion';
                actionKind = 'quaff';
                floatLabel = 'QUAFF';
            } else if (lower.includes('eat') || lower.includes('tastes') || msgText.includes('食')) {
                auraColor = 0xfbbf24;
                auraKind = 'potion';
                actionKind = 'eat';
                floatLabel = 'EAT';
            } else if (lower.includes('learned') || msgText.includes('学')) {
                auraColor = 0xf5d77f;
                auraKind = 'holy';
                actionKind = 'study';
                floatLabel = 'LEARNED!';
            } else if (lower.includes('sing') || lower.includes('chant') || lower.includes('song of')) {
                auraColor = 0x93c5fd;
                auraKind = 'runic';
                actionKind = 'horn';
                floatLabel = 'SONG';
                if (this.audio && typeof this.audio.playHarpChord === 'function') this.audio.playHarpChord();
            } else if (lower.includes('blow') || msgText.includes('吹')) {
                auraColor = 0x93c5fd;
                auraKind = 'runic';
                actionKind = 'horn';
                floatLabel = 'RESONATE';
            } else if (lower.includes('pray') || lower.includes('bless') || msgText.includes('祈')) {
                auraColor = 0xffe066;
                auraKind = 'holy';
                actionKind = 'cast';
                floatLabel = 'PRAYER';
            }
            this.triggerActionAnimation(actionKind, 0.36);
            this.spawnProjectileOrSpellVfx('aura', ep.startPos, ep.startPos, auraColor);
            if (this.audio && typeof this.audio.playRunicAura === 'function') {
                this.audio.playRunicAura(auraKind, 0);
            } else if (actionKind === 'quaff' || actionKind === 'eat') {
                if (this.audio && typeof this.audio.playQuaff === 'function') this.audio.playQuaff();
            } else {
                if (this.audio && typeof this.audio.playScroll === 'function') this.audio.playScroll();
            }
            this.spawnFloatingText(floatLabel, ep.startPos, '#88ffcc', 1.10);
            return true;
        }

        // 6. Digging / Tunneling
        if (/\b(you tunnel|you dig|finished tunneling)\b/.test(lower) || /掘った|掘り終えた/.test(msgText)) {
            this.spawnHitSparks(ep.endPos, 0xa89f91, 14);
            if (this.audio && typeof this.audio.playDiggingStrike === 'function') {
                this.audio.playDiggingStrike(sPan);
            } else if (this.audio && typeof this.audio.playHit === 'function') {
                this.audio.playHit(false, sPan);
            }
            this.triggerActionAnimation('dig', 0.24);
            this.spawnFloatingText('DIG', ep.endPos, '#c2b29d', 1.0);
            return true;
        }

        // 7. Critical Melee Strikes
        if (lower.includes('critical hit') || lower.includes('was a good hit') || lower.includes('was a great hit') || lower.includes('was a superb hit') || lower.includes('great force') || lower.includes('superb') || lower.includes('痛恨')) {
            const style = this._resolveEquippedMeleeStyle(lower);
            this.addTrauma(0.25);
            this.spawnFloatingText('CRITICAL!', ep.endPos.clone().add(new THREE.Vector3(0, 0.25, 0)), '#ffd700', 1.35);
            const critKind = style.vfxKind === 'whip_lash' ? 'whip_lash' : (style.vfxKind === 'axe_cleave' ? 'axe_cleave' : 'crit_slash');
            this.spawnProjectileOrSpellVfx(critKind, ep.startPos, ep.endPos, 0xffd700);
            this.triggerMonsterHitReaction(ep.monsterEntity);
            if (this.audio && typeof this.audio.playWeaponImpact === 'function') {
                this.audio.playWeaponImpact(style.weaponCat === 'whip' || style.weaponCat === 'axe' ? 'blade' : style.weaponCat, true, sPan);
            } else if (this.audio && typeof this.audio.playCrit === 'function') {
                this.audio.playCrit(sPan);
            }
            this._hitstopTime = 0.045;
            this.triggerAttackAnimation(true);
            return true;
        }

        // 8. Normal Melee Strikes (Weapon-Matched to 1st-Person Equipped Rig + Verb across all 8 realms)
        if (lower.includes('you hit') || lower.includes('you strike') || lower.includes('you slash') || lower.includes('you slice') || lower.includes('you cleave') || lower.includes('you hack') || lower.includes('you lash') || lower.includes('you whip') || lower.includes('you crush') || lower.includes('you bash') || lower.includes('you kick') || lower.includes('you claw') || lower.includes('you smite') || lower.includes('you stab') || lower.includes('you pierce') || lower.includes('you gouge') || lower.includes('you thrust') || lower.includes('を攻撃した') || lower.includes('切りつけた') || lower.includes('突き刺した') || lower.includes('殴った')) {
            const style = this._resolveEquippedMeleeStyle(lower);
            this.spawnProjectileOrSpellVfx(style.vfxKind, ep.startPos, ep.endPos, style.vfxColor);
            this.triggerMonsterHitReaction(ep.monsterEntity);
            if (this.audio && typeof this.audio.playWeaponImpact === 'function') {
                const audioCat = (style.weaponCat === 'whip' || style.weaponCat === 'axe') ? 'blade' : style.weaponCat;
                this.audio.playWeaponImpact(audioCat, false, sPan);
            } else if (this.audio && typeof this.audio.playHit === 'function') {
                this.audio.playHit(false, sPan);
            }
            this.triggerAttackAnimation(true);
            if (!ep.monsterEntity || ep.monsterEntity._lastDamageFrame !== this._frameCounter) {
                this.spawnFloatingText(style.label, ep.endPos, '#ffaa33', 1.05);
            }
            return true;
        }

        // 9. Monster Strikes Player (All 8 Realms: with 'you' OR NetHack subject-only 'The <monster> bites!')
        if (lower.includes('hits you') || lower.includes('bites you') || lower.includes('claws you') || lower.includes('crushes you') || lower.includes('stings you') || lower.includes('burns you') || lower.includes('grips you') || lower.includes('butts you') ||
            /\b(?:the|a|an)\s+[a-z0-9\s\-']+\s+(?:hits|bites|claws|stings|butts|kicks|gazes|touches|zaps|crushes|engulfs|burns|freezes|shocks)!/i.test(lower)) {
            if (typeof this.triggerMonsterAttackLunge === 'function') {
                this.triggerMonsterAttackLunge(ep.monsterEntity);
            }
            if (this._lastPlayerHurtFrame !== this._frameCounter) {
                this.addTrauma(0.35);
                this.spawnFloatingText('OUCH!', ep.endPos, '#ff3333', 1.15);
                this.spawnHitSparks(ep.endPos, '#ff2222', 14);
                this.triggerHurtAnimation();
                if (this.audio && typeof this.audio.playPlayerHurt === 'function') this.audio.playPlayerHurt();
            }
            return true;
        }

        // 10. Deflect / Block
        if (lower.includes('deflect') || lower.includes('blocks the blow') || lower.includes('parr') || lower.includes('bounces off')) {
            this.spawnFloatingText('BLOCK', ep.endPos, '#55bbff', 1.05);
            this.spawnHitSparks(ep.endPos, '#88ddff', 10);
            if (this.audio && typeof this.audio.playArmorDeflect === 'function') this.audio.playArmorDeflect();
            else if (this.audio && typeof this.audio.playShieldBlock === 'function') this.audio.playShieldBlock();
            return true;
        }

        // 11. Misses
        if (lower.includes('you miss') || lower.includes('misses you') || /\b(?:the|a|an)\s+[a-z0-9\s\-']+\s+misses!/i.test(lower)) {
            if (lower.includes('you miss')) this.triggerAttackAnimation(true);
            else if (typeof this.triggerMonsterAttackLunge === 'function') this.triggerMonsterAttackLunge(ep.monsterEntity);
            this.spawnFloatingText('MISS', ep.endPos, '#a0b0c0', 0.95);
            if (this.audio && typeof this.audio.playWhoosh === 'function') this.audio.playWhoosh();
            return true;
        }

        // 12. Monster Slain (All 8 Realms: Angband 'You have slain', NetHack/DCSS 'You kill/destroy', Brogue/Rogue 'You defeat')
        if (lower.includes('you have slain') || lower.includes('you kill ') || lower.includes('you destroy ') || lower.includes('you defeat ') || lower.includes('you have defeated') || lower.includes('is destroyed') || lower.includes('is killed') || lower.includes('dies.') || lower.includes('is slain') || lower.includes('倒した') || lower.includes('葬り去った')) {
            this.spawnFloatingText('SLAIN!', ep.endPos.clone().add(new THREE.Vector3(0, 0.25, 0)), '#ff44aa', 1.30);
            this.spawnDetonationDome(ep.endPos, 0xff44aa, 0.75);
            this.spawnHitSparks(ep.endPos, '#ff44aa', 24);
            this.triggerMonsterHitReaction(ep.monsterEntity, true);
            if (this.audio && typeof this.audio.playMonsterDeath === 'function') {
                this.audio.playMonsterDeath(mGlyph, sPan);
            }
            return true;
        }

        // 13. Other environmental & UI triggers
        if ((lower.includes('wall') || lower.includes('door') || lower.includes('rubble')) && (lower.includes('blocking your way') || lower.includes('cannot see where you are going') || lower.includes('in your way'))) {
            this.addTrauma(0.08);
            this.spawnFloatingText('BLOCKED', ep.endPos, '#aaaaaa', 0.95);
            if (this.audio && typeof this.audio.playWallBump === 'function') this.audio.playWallBump();
            return true;
        } else if (lower.includes('you open the door') || lower.includes('the door opens')) {
            if (this.audio && typeof this.audio.playDoor === 'function') this.audio.playDoor(true);
            return true;
        } else if (lower.includes('you close the door') || lower.includes('the door closes')) {
            if (this.audio && typeof this.audio.playDoor === 'function') this.audio.playDoor(false);
        } else if (lower.includes('door is broken') || lower.includes('smash open the door') || lower.includes('door is destroyed')) {
            if (this.audio && typeof this.audio.playDoorBreak === 'function') this.audio.playDoorBreak();
        } else if (lower.includes('gold') || lower.includes('coins')) {
            if (this.audio && typeof this.audio.playGoldPickup === 'function') this.audio.playGoldPickup();
        } else if (lower.includes('you are wielding') || lower.includes('wielding ') || lower.includes('you wear') || lower.includes('you are wearing')) {
            if (lower.includes('sword') || lower.includes('dagger') || lower.includes('blade') || lower.includes('axe') || lower.includes('spear') || lower.includes('mace') || lower.includes('bow')) {
                if (this.audio && typeof this.audio.playEquipWeapon === 'function') this.audio.playEquipWeapon();
            } else {
                if (this.audio && typeof this.audio.playEquipArmor === 'function') this.audio.playEquipArmor();
            }
        } else if (lower.includes('you drop') || lower.includes('dropped') || lower.includes('were wielding') || lower.includes('were wearing') || lower.includes('unwield')) {
            if (this.audio && typeof this.audio.playItemDrop === 'function') this.audio.playItemDrop();
        } else if (lower.includes('you eat') || lower.includes('delicious') || lower.includes('tastes like') || lower.includes('you devour') || lower.includes('ration') || lower.includes('hard biscuit')) {
            this.spawnFloatingText('EAT', ep.endPos, '#ffcc66', 1.05);
            if (this.audio && typeof this.audio.playEat === 'function') this.audio.playEat();
        } else if ((lower.includes('chest') || lower.includes('lock') || lower.includes('latch')) && (lower.includes('open') || lower.includes('unlock') || lower.includes('pick') || lower.includes('loot'))) {
            if (this.audio && typeof this.audio.playIronLatch === 'function') this.audio.playIronLatch();
            else if (this.audio && typeof this.audio.playChest === 'function') this.audio.playChest();
        } else if (lower.includes('disarm') && lower.includes('trap')) {
            this.spawnFloatingText('DISARMED', ep.endPos, '#33ffaa', 1.10);
            if (this.audio && typeof this.audio.playTrapDisarm === 'function') this.audio.playTrapDisarm();
        } else if ((lower.includes('set off') || lower.includes('trigger') || lower.includes('spring')) && lower.includes('trap')) {
            this.addTrauma(0.25);
            this.spawnFloatingText('TRAP!', ep.endPos, '#ff4444', 1.25);
            if (this.audio && typeof this.audio.playTrapTrigger === 'function') this.audio.playTrapTrigger();
        } else if (lower.includes('teleport') || lower.includes('phase door') || lower.includes('space distortion') || lower.includes('disappears!')) {
            this.spawnFloatingText('WARP', ep.endPos, '#cc66ff', 1.20);
            if (this.audio && typeof this.audio.playTeleport === 'function') this.audio.playTeleport();
        } else if (lower.includes('poisoned') || lower.includes('feel very sick') || lower.includes('poison burns')) {
            if (this.audio && typeof this.audio.playPoison === 'function') this.audio.playPoison();
        } else if (lower.includes('confused') || lower.includes('feel dazed') || lower.includes('feel very dizzy')) {
            if (this.audio && typeof this.audio.playConfused === 'function') this.audio.playConfused();
        } else if (lower.includes('you are blind') || lower.includes('cloak of darkness falls') || lower.includes('cannot see')) {
            if (this.audio && typeof this.audio.playBlind === 'function') this.audio.playBlind();
        } else if (lower.includes('paralyzed') || lower.includes('frozen in place') || lower.includes('cannot move')) {
            if (this.audio && typeof this.audio.playParalyzed === 'function') this.audio.playParalyzed();
        } else if (lower.includes('terrified') || lower.includes('flee in terror') || lower.includes('afraid')) {
            if (this.audio && typeof this.audio.playAfraid === 'function') this.audio.playAfraid();
        } else if (lower.includes('starving') || lower.includes('faint with hunger') || lower.includes('getting hungry')) {
            if (this.audio && typeof this.audio.playHunger === 'function') this.audio.playHunger();
        } else if (lower.includes('pick up') || lower.includes('found')) {
            if (this.audio && typeof this.audio.playItemPickup === 'function') this.audio.playItemPickup();
        } else if (lower.includes('level') && (lower.includes('welcome to') || lower.includes('gain') || lower.includes('advance'))) {
            if (this.audio && typeof this.audio.playLevelUp === 'function') this.audio.playLevelUp();
        }
    }

    addTrauma(amount) {
        this.trauma = Math.min(1.0, this.trauma + amount);
    }

    turn(delta) {
        this.facing = ((this.facing + delta) % 4 + 4) % 4;
        this.targetYaw = -this.facing * (Math.PI / 2);
        this.userPitchOffset = 0.0;
    }

    rotateFreelook(deltaYaw, deltaPitch) {
        // Continuous 360-degree horizontal yaw rotation
        this.targetYaw = (this.targetYaw || 0) + deltaYaw;
        // Smooth vertical pitch clamping between looking up into stars and looking down at ground
        const currentPitch = this.userPitchOffset || 0.0;
        this.userPitchOffset = Math.max(-0.65, Math.min(1.25, currentPitch + deltaPitch));
    }

    commitFreelookFacing() {
        if (typeof this.targetYaw !== 'number') return this.facing || 0;
        const defaultYaw = -(this.facing || 0) * (Math.PI / 2);
        const diff = Math.atan2(Math.sin(this.targetYaw - defaultYaw), Math.cos(this.targetYaw - defaultYaw));
        if (Math.abs(diff) > (Math.PI / 4) + 0.02) {
            const norm = (((-this.targetYaw) % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
            this.facing = Math.round(norm / (Math.PI / 2)) % 4;
        }
        return this.facing;
    }

    snapCameraToDefault() {
        // Commit freelook quadrant if rotated > 45 deg, then snap cleanly to cardinal facing
        this.commitFreelookFacing();
        this.userPitchOffset = 0.0;
        const defaultYaw = -this.facing * (Math.PI / 2);
        const cur = this.camera ? this.camera.rotation.y : (this.targetYaw || 0);
        const diff = defaultYaw - cur;
        const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.targetYaw = cur + wrapped;
    }

    orientCameraTowardStep(dx, dy, lookDx = dx, lookDy = dy) {
        const sdx = Number(dx) || 0;
        const sdy = Number(dy) || 0;
        const ldx = Number(lookDx ?? sdx) || 0;
        const ldy = Number(lookDy ?? sdy) || 0;
        const vx = sdx * 0.72 + ldx * 0.28;
        const vy = sdy * 0.72 + ldy * 0.28;
        if (vx === 0 && vy === 0) return;
        // Right-handed Three.js camera yaw: North (0,-1)->0, East (+1,0)->-PI/2, South (0,+1)->PI, West (-1,0)->+PI/2
        const desiredYaw = Math.atan2(-vx, -vy);
        const curYaw = this.camera ? this.camera.rotation.y : (this.targetYaw || 0);
        const diff = Math.atan2(Math.sin(desiredYaw - curYaw), Math.cos(desiredYaw - curYaw));
        this.targetYaw = curYaw + diff;
        this.userPitchOffset = 0.0;
        const stepYaw = (sdx !== 0 || sdy !== 0) ? Math.atan2(-sdx, -sdy) : desiredYaw;
        const norm = ((-stepYaw % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        this.facing = Math.round(norm / (Math.PI / 2)) % 4;
    }

    setCameraYaw(val, immediate = false) {
        if (!Number.isFinite(val)) return;
        const curYaw = this.camera ? this.camera.rotation.y : (this.targetYaw || 0);
        const diff = Math.atan2(Math.sin(val - curYaw), Math.cos(val - curYaw));
        this.targetYaw = curYaw + diff;
        this.userPitchOffset = 0.0;
        const norm = ((-val % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        this.facing = Math.round(norm / (Math.PI / 2)) % 4;
        if (immediate && this.camera) {
            this.camera.rotation.y = this.targetYaw;
        }
        if (this.renderGovernor) this.renderGovernor.wake(650);
    }

    get yaw() {
        return this.camera ? this.camera.rotation.y : (-this.facing * (Math.PI / 2));
    }

    get cameraYaw() {
        return this.targetYaw !== undefined ? this.targetYaw : (this.camera ? this.camera.rotation.y : 0);
    }

    set cameraYaw(val) {
        this.targetYaw = val;
        // Keep facing aligned to nearest cardinal direction so movement doesn't snap camera backwards
        const norm = ((-val % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        this.facing = Math.round(norm / (Math.PI / 2)) % 4;
        if (this.camera) {
            this.camera.rotation.y = val;
        }
    }

    get cameraPitch() {
        return this.userPitchOffset || 0.0;
    }

    set cameraPitch(val) {
        this.userPitchOffset = val;
        if (this.camera) {
            this.camera.rotation.x = (this.basePitch !== undefined ? this.basePitch : -0.157) + val;
        }
    }

    setFacing(f) {
        this.facing = ((f % 4) + 4) % 4;
        this.targetYaw = -this.facing * (Math.PI / 2);
        if (this.camera) {
            this.camera.rotation.y = this.targetYaw;
        }
    }

    calculateStereoPan(worldX, worldZ) {
        if (!this.camera) return 0.0;
        const dx = worldX - this.currentCamPos.x;
        const dz = worldZ - this.currentCamPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.1) return 0.0;
        const yaw = this.camera.rotation.y;
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        const lateral = (dx * rightX + dz * rightZ) / dist;
        return Math.max(-1.0, Math.min(1.0, lateral));
    }

    getFeatAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= map.h || x < 0 || x >= map.w) return 0;
        const row = map.rows[y];
        if (!row || !row.f) return 0;
        const idx = x * 2;
        if (idx + 1 >= row.f.length) return 0;
        const hi = parseInt(row.f[idx], 16) || 0;
        const lo = parseInt(row.f[idx + 1], 16) || 0;
        let feat = (hi << 4) | lo;

        // Disambiguate Tree (feat 25) vs Grass (feat 26) vs Bush (feat 42):
        // In Angband and roguelike variants, open ground / lawn / meadow is '.' (or ',', '\'').
        // Trees are solid obstacles represented by '#' (or '%', '*', '&', 'T').
        // Dense bushes/brakes/flowers are green ':' (FEAT_BUSH = 42).
        // A green '.' is GRASS, NEVER a 3D tree!
        // In Sil-Q, feat 25 is FEAT_SUNLIGHT, never grass or tree!
        if (row.g && x < row.g.length) {
            const g = row.g[x];
            let attr = 0;
            if (row.a && x * 2 + 1 < row.a.length) {
                attr = (parseInt(row.a[x * 2], 16) << 4) | (parseInt(row.a[x * 2 + 1], 16) || 0);
            }
            if (this.realm === 'nethack' || this.realm === 'dcss' || this.realm === 'ryod') {
                // # ROOT-CAUSE: Ensure '_' and '{' reliably resolve to feat 43 (High Altar) and feat 44 (Magic Fountain) across NetHack, DCSS, and RYOD.
                if (g === '_') feat = 43;      // Consecrated High Altar
                else if (g === '{') feat = 44; // Sparkling Magic Fountain
                else if (this.realm === 'nethack' && g === '+') feat = 2;  // Closed Door
                else if (this.realm === 'nethack' && g === "'") feat = 3;  // Open Door
                if (this.realm === 'nethack' && (feat === 2 || feat === 3)) {
                    const isW = (ry, rx) => {
                        const r = map.rows[ry];
                        if (!r || !r.f || rx < 0 || rx * 2 + 1 >= r.f.length) return false;
                        const fc = (parseInt(r.f[rx * 2], 16) << 4) | (parseInt(r.f[rx * 2 + 1], 16) || 0);
                        return fc >= 18 && fc <= 22;
                    };
                    const framedNS = isW(y - 1, x) && isW(y + 1, x);
                    const framedEW = isW(y, x - 1) && isW(y, x + 1);
                    if (!framedNS && !framedEW) feat = 1;
                }
            } else if ((this.realm === 'hengband' || this.realm === 'frogcomposband') &&
                (map.depth === 0 || (map.depth === undefined && this.lastDepth === 0)) &&
                x > 1 && y > 1 && x < map.w - 2 && y < map.h - 2 &&
                (feat <= 4 || feat === 22)) {
                // # ROOT-CAUSE: Ensure Hengband / FrogComposBand Outpost storefronts & specialty guilds resolve reliably to store feats in Town.
                if (g >= '1' && g <= '8') {
                    feat = 7 + (g.charCodeAt(0) - 49);
                } else if (g === '9') {
                    feat = 39; // Bookstore
                } else if (g === '0') {
                    feat = (this.realm === 'frogcomposband') ? 33 : 35; // Museum in Hengband, Inn in FCB
                } else if (g === 'M') {
                    feat = 35; // Museum
                } else if (g === 'B') {
                    feat = 32; // Castle / Bounty Guild
                } else if (g === '+') {
                    const isBldgWall = (ry, rx) => {
                        const r = map.rows[ry];
                        if (!r || !r.f || rx < 0 || rx * 2 + 1 >= r.f.length) return false;
                        const fc = (parseInt(r.f[rx * 2], 16) << 4) | (parseInt(r.f[rx * 2 + 1], 16) || 0);
                        return fc === 21 || fc === 22;
                    };
                    if ((isBldgWall(y - 1, x) && isBldgWall(y + 1, x)) || (isBldgWall(y, x - 1) && isBldgWall(y, x + 1))) {
                        feat = 33; // Special Town Building Door (Inn / Guild Hall)
                    }
                }
            } else if (this.realm !== 'silq') {
                if (feat === 25 && (g === '.' || g === ',' || g === "'")) {
                    feat = 26; // Feat 26: Grass
                } else if (feat === 26 && (g === '#' || g === '%' || g === '&' || g === 'T')) {
                    feat = 25; // Feat 25: Tree
                } else if (feat === 42) {
                    feat = 42; // Feat 42: Bush / Brake / Foliage
                } else if (g === ':') {
                    // In Angband and variants: ':' in green (attr 3, 5, 11, 13) is a Bush / Brake!
                    // In slate/grey/white (attr 1, 2, 9), ':' is Rubble (feat 16)!
                    const isGreen = (attr === 3 || attr === 5 || attr === 11 || attr === 13);
                    if (isGreen) {
                        feat = 42; // Bush
                    } else if (feat === 0 || feat === 1) {
                        feat = 16; // Rubble
                    }
                }
            }
        }
        return feat;
    }

    getFlagAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= map.h || x < 0 || x >= map.w) return 0;
        const row = map.rows[y];
        if (!row || !row.l || x >= row.l.length) return 0;
        return parseInt(row.l[x], 16) || 0;
    }

    getGlyphAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= map.h || x < 0 || x >= map.w) return ' ';
        const row = map.rows[y];
        if (!row || !row.g || x >= row.g.length) return ' ';
        return row.g[x];
    }

    getAttrAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= map.h || x < 0 || x >= map.w) return 0;
        const row = map.rows[y];
        if (!row || !row.a) return 0;
        const idx = x * 2;
        if (idx + 1 >= row.a.length) return 0;
        const hi = parseInt(row.a[idx], 16) || 0;
        const lo = parseInt(row.a[idx + 1], 16) || 0;
        return (hi << 4) | lo;
    }

    isSolidWall(feat) {
        return feat === 15 || (feat >= 17 && feat <= 22) || feat === 30;
    }

    isStoreKind(feat) {
        return (feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40);
    }

    isWalkableOrPortal(feat) {
        return feat === 1 || feat === 2 || feat === 3 || feat === 4 || feat === 5 || feat === 6 || feat === 16 || feat === 23 || feat === 24 || feat === 25 || feat === 26 || feat === 27 || feat === 28 || feat === 29 || feat === 31 || feat === 37 || feat === 41 || feat === 42 || feat === 43 || feat === 44 || this.isStoreKind(feat);
    }

    /**
     * Contextual realm-aware base color lookup (1:1 with Godot DungeonWorld.cs:BaseColour).
     * Strictly preserves distinct granite ashlar masonry vs primordial bedrock/Thangorodrim basalt,
     * chlorophyll-rich grass and leaf canopies, azure waters, and rich loam trails.
     */
    getBaseColour(feat, biome) {
        if (!biome) return new THREE.Color(1, 1, 1);
        const r = (this.realm || 'angband').toLowerCase();
        switch (feat) {
            case 21: // Feat.Wall / Feat.Granite
            case 15: // Feat.Secret
                return biome.wallColor;
            case 22: // Feat.PermWall / Feat.Perm (Monolithic bedrock)
                return (r === 'silq')
                    ? new THREE.Color(0.38 * biome.wallColor.r, 0.38 * biome.wallColor.g, 0.44 * biome.wallColor.b) // Volcanic obsidian roots of Thangorodrim
                    : new THREE.Color(0.85 * biome.wallColor.r, 0.85 * biome.wallColor.g, 0.90 * biome.wallColor.b); // Monolithic ancient bedrock
            case 30: // Feat.Mountain
                return (r === 'hengband')
                    ? new THREE.Color(0.72, 0.74, 0.80) // Eastern craggy mountain slate
                    : biome.wallColor;
            case 1:  // Feat.Floor
            case 24: // Feat.PassableRubble (Vanilla / Variants)
                return biome.floorColor;
            case 26: // Feat.Grass
                switch (r) {
                    case 'silq':
                        return new THREE.Color(0.60, 0.68, 0.55); // Ash-dusted withered heath of Anfauglith
                    case 'hengband':
                        return new THREE.Color(0.88, 1.05, 0.88); // Vibrant bamboo & moss green
                    case 'frogcomposband':
                        return new THREE.Color(0.95, 1.12, 0.90); // Lush high-fantasy rolling meadow
                    default:
                        return new THREE.Color(0.90, 1.05, 0.88); // Bree woodland grass
                }
            case 42: // Feat.Bush (feat 42: BUSH, BRAKE, FLOWER)
                switch (r) {
                    case 'silq':
                        return new THREE.Color(0.50, 0.58, 0.45);
                    case 'hengband':
                        return new THREE.Color(0.68, 0.95, 0.65);
                    case 'frogcomposband':
                        return new THREE.Color(0.78, 1.08, 0.70);
                    default:
                        return new THREE.Color(0.75, 1.02, 0.72);
                }
            case 27: // Feat.Dirt
                return new THREE.Color(1.0, 0.96, 0.90); // Warm packed earth loam trail
            case 28: // Feat.ShallowWater
                return new THREE.Color(1.0, 1.0, 1.0); // Pure translucent azure caustic ripples
            case 29: // Feat.DeepWater
                return new THREE.Color(1.0, 1.0, 1.0); // Pure oceanic navy specular sheen
            case 31: // Feat.Swamp
                return new THREE.Color(0.85, 0.90, 0.80); // Brackish peat marsh
            case 25: // Feat.Tree (canopy)
                switch (r) {
                    case 'silq':
                        return new THREE.Color(0.55, 0.60, 0.52); // Gnarled withered ash-pine of the Iron Mountains
                    case 'hengband':
                        return new THREE.Color(0.72, 0.98, 0.80); // Sacred Japanese cedar (Sugi) & cypress
                    case 'frogcomposband':
                        return new THREE.Color(0.88, 1.10, 0.85); // Verdant deciduous oak woodland
                    default:
                        return new THREE.Color(1.0, 1.0, 1.0);
                }
            default:
                return new THREE.Color(1.0, 1.0, 1.0);
        }
    }

    /**
     * Computes final tile shade without allocating new Color objects.
     * Reuses targetColor in-place (1:1 with Godot DungeonWorld.cs:2453-2471).
     * Incorporates deterministic stone luminance & warmth variation to break up repetitive grids.
     */
    computeTileShade(targetColor, baseColor, inView, outdoors, lighting, x = 0, y = 0, isRoom = false, depth = 0, surfaceKind = 'wall', adjWalls = 0) {
        targetColor.copy(baseColor);

        // Organic stone block variation (skip per-tile hash jitter on ceilings to eliminate 2m x 2m checkerboard; soften on floors)
        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.tileVariation) && (x !== 0 || y !== 0)) {
            const hash = ((x * 43) ^ (y * 79)) & 0xff;
            let lum = 0;
            let warm = 0;
            if (surfaceKind === 'floor') {
                lum = ((hash % 7) - 3) * 0.006; // -0.018 to +0.018 subtle flagstone variation
                warm = ((hash % 5) - 2) * 0.004;
            } else if (surfaceKind !== 'ceiling') {
                lum = ((hash % 11) - 5) * 0.012;
                warm = ((hash % 7) - 3) * 0.008;
            }

            // Coherent Spatial Cluster Shading & Geological formations
            if (!outdoors && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.biomeVariation)) {
                const cx = Math.floor(x / 4);
                const cy = Math.floor(y / 4);
                const cluster = (((cx * 374761393) ^ (cy * 668265263) ^ (this.currentLevelSeed || 0)) >>> 0) & 0xff;
                const cScale = surfaceKind === 'ceiling' ? 0.35 : 1.0;

                if (cluster < 42) {
                    if (depth <= 4) {
                        lum -= 0.040 * cScale;
                        warm -= 0.015 * cScale;
                    } else if (depth <= 8) {
                        targetColor.g = Math.min(1.0, targetColor.g + 0.035 * cScale);
                        targetColor.b = Math.min(1.0, targetColor.b + 0.045 * cScale);
                        lum -= 0.035 * cScale;
                    } else if (depth <= 12) {
                        targetColor.r = Math.min(1.0, targetColor.r + 0.055 * cScale);
                        targetColor.g = Math.min(1.0, targetColor.g + 0.025 * cScale);
                        lum += 0.015 * cScale;
                        warm += 0.025 * cScale;
                    } else if (depth <= 16) {
                        targetColor.g = Math.min(1.0, targetColor.g + 0.065 * cScale);
                        targetColor.r = Math.max(0.05, targetColor.r - 0.025 * cScale);
                    } else if (depth <= 20) {
                        targetColor.r = Math.min(1.0, targetColor.r + 0.045 * cScale);
                        targetColor.b = Math.max(0.05, targetColor.b - 0.020 * cScale);
                        lum -= 0.030 * cScale;
                    } else if (depth <= 35) {
                        targetColor.b = Math.min(1.0, targetColor.b + 0.065 * cScale);
                        targetColor.r = Math.min(1.0, targetColor.r + 0.030 * cScale);
                    } else if (depth <= 60) {
                        targetColor.r = Math.min(1.0, targetColor.r + 0.070 * cScale);
                        targetColor.g = Math.min(1.0, targetColor.g + 0.025 * cScale);
                        targetColor.b = Math.max(0.05, targetColor.b - 0.035 * cScale);
                    } else if (depth <= 85) {
                        targetColor.r = Math.min(1.0, targetColor.r + 0.025 * cScale);
                        targetColor.b = Math.min(1.0, targetColor.b + 0.050 * cScale);
                        lum -= 0.050 * cScale;
                    } else {
                        targetColor.r = Math.min(1.0, targetColor.r + 0.080 * cScale);
                        lum -= 0.060 * cScale;
                    }
                }

                if (surfaceKind !== 'ceiling') {
                    lum += isRoom ? 0.025 : -0.020;
                }
            }

            targetColor.r = Math.max(0.05, Math.min(1.0, targetColor.r + lum + warm));
            targetColor.g = Math.max(0.05, Math.min(1.0, targetColor.g + lum));
            targetColor.b = Math.max(0.05, Math.min(1.0, targetColor.b + lum - warm * 0.5));
        }

        let horizonFade = 1.0;
        if (!outdoors) {
            const pdx = x - (this.playerGridX || 0);
            const pdy = y - (this.playerGridY || 0);
            const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pDist > 17.0) {
                const ht = Math.max(0.0, Math.min(1.0, (24.0 - pDist) / 7.0));
                horizonFade = ht * ht * (3.0 - 2.0 * ht);
            }
            if ((inView || this._rawLitShadeMode) && (lighting === 2 || lighting === 0 || lighting === 1)) {
                if (inView && lighting === 1 && this.vertexLighter && this.renderBudget && !this.renderBudget.enableFillLight) {
                    const lit = this.vertexLighter.computeTileColor(x, y, 2, this.playerGridX || 0, this.playerGridY || 0, null, targetColor);
                    targetColor.setRGB(lit.r, lit.g, lit.b);
                }
                if (typeof window !== 'undefined' && window.Dungeon3DTactical && window.Dungeon3DTactical.applyChiaroscuroTileShade) {
                    return window.Dungeon3DTactical.applyChiaroscuroTileShade(this, targetColor, inView, outdoors, lighting, x, y, surfaceKind, adjWalls, pDist, horizonFade);
                }
                const torchSpan = (this.torchRadius || 3) + 1.5;
                if (inView && pDist < torchSpan) {
                    const halo = 1.0 - pDist / torchSpan;
                    targetColor.r = Math.min(1.0, targetColor.r + halo * 0.08);
                    targetColor.g = Math.min(1.0, targetColor.g + halo * 0.052);
                }
                if (lighting === 2) {
                    if ((surfaceKind === 'floor' || surfaceKind === 'ceiling') && adjWalls > 0) {
                        targetColor.multiplyScalar(1.0 - Math.min(4, adjWalls) * 0.042);
                    }
                    if (pDist > 8.0) {
                        const tf = Math.min(1.0, (pDist - 8.0) / 12.0);
                        targetColor.multiplyScalar(1.0 - tf * tf * (3.0 - 2.0 * tf) * 0.38);
                    }
                }
                return targetColor.multiplyScalar(horizonFade);
            }
        }

        if (inView && outdoors) {
            return targetColor;
        } else if (inView && lighting === 3) {
            return targetColor.multiply(this._tintDark).multiplyScalar(horizonFade);
        } else if (this._rawLitShadeMode && !outdoors) {
            return targetColor.multiplyScalar(horizonFade);
        } else {
            const memTint = (lighting === 2) ? this._tintMemLit : this._tintMemDark;
            return targetColor.multiply(memTint).multiplyScalar(horizonFade);
        }
    }

    _evalIndoorCeilH(map, w, h, tx, ty, depth) {
        if (tx < 0 || tx >= w || ty < 0 || ty >= h) return 0;
        let tFeat = this.getFeatAt(map, tx, ty);
        let tGlyph = this.getGlyphAt(map, tx, ty);
        let mem = null;
        if (tFeat === 0 && this.getRememberedTile) {
            mem = this.getRememberedTile(tx, ty);
            if (mem) {
                tFeat = mem.feat;
                tGlyph = mem.glyph;
            }
        }
        if (this.realm === 'frogcomposband' && tGlyph === '#') {
            const tAttr = mem ? mem.attr : this.getAttrAt(map, tx, ty);
            if (tAttr === 2 || tAttr === 8 || tAttr === 9 || tFeat === 41) tFeat = 41;
        }
        if (this.realm !== 'silq' || tFeat !== 25) {
            if (tFeat === 25 && (tGlyph === '.' || tGlyph === ',' || tGlyph === "'")) tFeat = 26;
            else if (tFeat === 26 && (tGlyph === '#' || tGlyph === '%' || tGlyph === '&' || tGlyph === 'T')) tFeat = 25;
        }
        if (tFeat === 0 || (tFeat >= 15 && tFeat <= 22 && tFeat !== 16) || tFeat === 30) return 0;
        const isSilQForge = (tFeat === 60 || (this.realm === 'silq' && tGlyph === '0'));
        if (tFeat === 2 || tFeat === 3 || (tFeat === 4 && tGlyph !== '^' && !(this.realm === 'brogue' && tGlyph !== "'" && tGlyph !== '+')) || (tFeat >= 32 && tFeat <= 40 && !isSilQForge)) {
            return this.wallHeight;
        }
        if (this._levelRoomCeilCache && this._levelMemW === w) {
            const cached = this._levelRoomCeilCache[ty * w + tx];
            if (cached > 0) return cached;
        }
        const tFlag = this.getFlagAt(map, tx, ty);
        const tIsRoom = mem ? Boolean(mem.isGlow) : (((tFlag >> 2) & 0x3) === 2);
        if (!tIsRoom) return this.wallHeight;
        return (typeof this.getCeilingHeightForTile === 'function')
            ? this.getCeilingHeightForTile(tx, ty, true, depth)
            : (depth >= 30 ? 5.6 : 4.2);
    }

    updateAdaptiveVignette(frame) {
        const vignetteEl = document.getElementById('dungeon-vignette');
        if (!vignetteEl) return;

        if (!window.GRAPHICS_CONFIG || !window.GRAPHICS_CONFIG.adaptiveVignette) {
            vignetteEl.style.opacity = '0';
            vignetteEl.classList.remove('danger-pulse');
            return;
        }

        const depth = frame.player && frame.player.depth !== undefined ? frame.player.depth : 0;
        const outdoors = depth === 0;

        if (outdoors) {
            // Open daylight town: zero vignette for crystal clear open-air visibility
            vignetteEl.style.opacity = '0';
            vignetteEl.classList.remove('danger-pulse');
            return;
        }

        // Subterranean dungeon
        const px = frame.player ? frame.player.x : 0;
        const py = frame.player ? frame.player.y : 0;
        let isLitRoom = false;
        if (this.lastMap) {
            const flag = this.getFlagAt(this.lastMap, px, py);
            const lighting = (flag >> 2) & 0x3;
            if (lighting === 2) isLitRoom = true; // Permalit room
        }

        const strength = isLitRoom ? '0.18' : '0.34';
        const opacity = isLitRoom ? '0.65' : '0.85';
        vignetteEl.style.setProperty('--vignette-strength', strength);
        vignetteEl.style.opacity = opacity;

        // # ROOT-CAUSE: Use hp_max ?? mhp so low-HP danger pulse fires in all realms
        const maxHp = frame.player ? Number(frame.player.hp_max ?? frame.player.mhp ?? 0) : 0;
        if (frame.player && maxHp > 0 && (frame.player.hp / maxHp) <= 0.20) {
            vignetteEl.classList.add('danger-pulse');
        } else {
            vignetteEl.classList.remove('danger-pulse');
        }
    }

    applyGraphicsConfig() {
        if (!this._gpuInitialized) return;
        const cfg = window.GRAPHICS_CONFIG || {};
        if (this.lastFrame) {
            this.updateAdaptiveVignette(this.lastFrame);
        } else {
            const vignetteEl = document.getElementById('dungeon-vignette');
            if (vignetteEl && !cfg.adaptiveVignette) {
                vignetteEl.style.opacity = '0';
                vignetteEl.classList.remove('danger-pulse');
            }
        }
        if (!cfg.torchInertia && this.torchLight) {
            this.torchLight.position.set(-0.46, 0.28, -0.18);
        }
        if (this.starGroup) {
            const isOutdoors = this.lastDepth === 0;
            this.starGroup.visible = isOutdoors && (cfg.starrySky !== false);
        }
        if (this.lastMap) {
            this.updateMap(this.lastMap);
        }
    }

    _computeTerrainSig(px, py, depth, torchRadius, realm, map, minY, maxY, minX, maxX) {
        let h = 2166136261 >>> 0;
        h = Math.imul(h ^ (px & 0xffff), 16777619) >>> 0;
        h = Math.imul(h ^ (py & 0xffff), 16777619) >>> 0;
        h = Math.imul(h ^ (depth & 0xffff), 16777619) >>> 0;
        h = Math.imul(h ^ ((this._lastCamProxMask || 0) & 0xffff), 16777619) >>> 0;
        const blindBit = (this.isPlayerBlind && this.isPlayerBlind(this.lastFrame && this.lastFrame.player)) ? 0x9e37 : 0;
        h = Math.imul(h ^ blindBit, 16777619) >>> 0;
        if (this._visibilityOverlayEnabled) h = Math.imul(h ^ 0x517c, 16777619) >>> 0;
        const rStr = `${realm || ''}|${(this.lastFrame && (this.lastFrame.biomeTheme || (this.lastFrame.map && this.lastFrame.map.biomeTheme))) || (typeof window !== 'undefined' && window.__activeRyodBlueprint && window.__activeRyodBlueprint.biome) || ''}`;
        for (let ri = 0; ri < rStr.length; ri++) {
            h = Math.imul(h ^ rStr.charCodeAt(ri), 16777619) >>> 0;
        }
        if (!map || !map.rows) return h;
        const mapW = map.w || 1;
        for (let y = minY; y <= maxY; y++) {
            const row = map.rows[y];
            if (!row) continue;
            if (row.f) {
                const fStr = row.f;
                const startIdx = minX * 2;
                const endIdx = Math.min(fStr.length - 1, (maxX + 1) * 2);
                for (let i = startIdx; i <= endIdx; i += 1) {
                    h = Math.imul(h ^ fStr.charCodeAt(i), 16777619) >>> 0;
                }
            }
            const flgStr = row.l || row.flags;
            if (flgStr && depth !== 0) {
                const stride = flgStr.length >= mapW * 2 ? 2 : 1;
                const startIdx = minX * stride;
                const endIdx = Math.min(flgStr.length - 1, (maxX + 1) * stride - 1);
                for (let i = startIdx + (stride - 1); i <= endIdx; i += stride) {
                    // Hash ONLY discovered/known bit (0x1) so transient inView/lighting FOV fades do not rebuild static chunks
                    const c = flgStr.charCodeAt(i);
                    const knownBit = (c >= 97 ? (c - 87) : (c >= 65 ? (c - 55) : c)) & 1;
                    h = Math.imul(h ^ knownBit, 16777619) >>> 0;
                }
            }
            if (row.g) {
                const gStr = row.g;
                const startIdx = minX;
                const endIdx = Math.min(gStr.length - 1, maxX);
                for (let i = startIdx; i <= endIdx; i += 1) {
                    h = Math.imul(h ^ gStr.charCodeAt(i), 16777619) >>> 0;
                }
            }
        }
        return h;
    }

    update(frame) {
        if (!frame || !frame.map) return;
        this.ensureGpuInitialized(frame.realm || (frame.player && frame.player.realm) || this.realm);
        this.updateDungeon(frame);
    }

    updateDungeon(frame) {
        if (!frame || !frame.map) return;
        const resolvedRealm = String((frame && (frame.realm || (frame.player && frame.player.realm)))
            || (typeof window !== 'undefined' && window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : (this.realm || 'angband'))).toLowerCase();
        this.ensureGpuInitialized(resolvedRealm);
        if (this.renderGovernor && typeof this.renderGovernor.wake === 'function') {
            this.renderGovernor.wake(450);
        }
        const map = frame.map;
        const w = map.w || (map.rows && map.rows[0] && map.rows[0].f ? map.rows[0].f.length / 2 : 0);
        const h = map.h || (map.rows ? map.rows.length : 0);
        if (!w || !h) return;

        // Auto-detect realm switch or Turn-0 restart so stale HP/level never trigger fake blood flashes or LEVEL UP banners
        const frameTurnRaw = frame.turn !== undefined ? frame.turn : (frame.player && frame.player.turn !== undefined ? frame.player.turn : null);
        const frameTurn = frameTurnRaw !== null ? Number(frameTurnRaw) : null;
        const realmChanged = Boolean(this._lastSessionRealm && resolvedRealm !== this._lastSessionRealm);
        const turnReset = Boolean(frameTurn !== null && !Number.isNaN(frameTurn) && frameTurn <= 1 && this._prevTurn > 5);
        if (realmChanged || turnReset) {
            this.resetSessionState({ clearMemory: realmChanged });
        }
        const isMenuDiorama = Boolean(frame && frame._isMenuDiorama);
        this._suppressMenuPbrLoads = isMenuDiorama;
        if (!isMenuDiorama) {
            this._lastSessionRealm = resolvedRealm;
            if (frameTurn !== null && !Number.isNaN(frameTurn)) {
                this._prevTurn = frameTurn;
            }
            this.realm = resolvedRealm;
            this.lastFrame = frame;
        }
        this.lastMap = map;

        // Environmental Adaptive Vignette (updates based on depth, room lighting, and health)
        this.updateAdaptiveVignette(frame);

        const px = frame.player ? frame.player.x : Math.floor(w / 2);
        const py = frame.player ? frame.player.y : Math.floor(h / 2);
        if (px !== this._lastPlayerGridX || py !== this._lastPlayerGridY) {
            this._lastPlayerGridX = px;
            this._lastPlayerGridY = py;
            this._lastHoverTileX = -1;
            this._lastHoverTileY = -1;
        }
        const depth = (frame.player && frame.player.depth !== undefined) ? frame.player.depth : 0;
        const outdoors = (depth === 0);
        if (outdoors && !isMenuDiorama && !this._shopDoorsHydrated && typeof this.ensureShopDoorMaterials === 'function') {
            this.ensureShopDoorMaterials();
        }
        if (!isMenuDiorama && this.lastDepth !== depth) {
            this._levelHasShops = Boolean(outdoors);
        }

        // Detect stairs / depth transitions
        if (!isMenuDiorama && this.lastDepth !== null && this.lastDepth !== undefined && this.lastDepth !== depth) {
            if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.triggerStairFade === 'function') {
                window.Dungeon3DAtmosphere.triggerStairFade(depth > this.lastDepth);
            }
            if (this.audio) {
                this.audio.playStairs(depth > this.lastDepth);
                this.audio.playLevelEnter();
            }
        }
        if (!isMenuDiorama) {
            this.lastDepth = depth;
            this._prevDepth = depth;
        }

        // Update Viewmodel Equipment rules & Dynamic character height
        this.updateViewmodel(frame.player);

        // Deterministic level seed derived from depth, dimensions, and map layout topology
        const levelSeed = ((depth * 73856093) ^ (w * 19349663) ^ (h * 83492791) ^ (map.rows && map.rows[0] && map.rows[0].f ? parseInt(map.rows[0].f.substring(0, 8), 16) : 0)) >>> 0;
        this.currentLevelSeed = levelSeed;

        // Purge all cached 3D monsters and floor items on realm switch or dungeon depth change
        if (this._lastPurgedRealm !== undefined && (this._lastPurgedRealm !== this.realm || this._lastPurgedDepth !== depth)) {
            if (typeof this.purgeAllSceneEntities === 'function') {
                this.purgeAllSceneEntities();
            }
        }
        this._lastPurgedRealm = this.realm;
        this._lastPurgedDepth = depth;

        // Apply Depth Biomes & Procedural Sub-Themes (Exact Parity with Godot BiomeProfile)
        const biome = this.getBiomeProfile(depth, levelSeed, this.realm);
        this.currentBiome = biome;
        this.targetTorchEnergy = biome.torchEnergy;

        // Apply Contextual Lore, Depth & Realm Textures (Wall, Floor, PermWall, Ceiling, Stairs)
        this.applyEnvironmentTextures(outdoors, biome, this.realm, depth, levelSeed);

        // Dynamic PBR surface roughness modulation based on depth stratum
        if (this.floorMaterial && biome.floorRoughness !== undefined) {
            this.floorMaterial.roughness = biome.floorRoughness;
        }
        if (this.wallMaterial && biome.wallRoughness !== undefined) {
            this.wallMaterial.roughness = biome.wallRoughness;
        }

        this.scene.background.setHex(outdoors ? biome.bgColor : biome.fogColor);

        // High-Quality Celestial Star Canopy: Visible exclusively outdoors in town (depth 0)
        const cfg = window.GRAPHICS_CONFIG || {};
        const starsEnabled = cfg.starrySky !== false;
        if (this.starGroup) {
            if (outdoors && starsEnabled) {
                this.starGroup.visible = true;
                if (this.starMaterial && this.starMaterial.uniforms && this.starMaterial.uniforms.uVisibility) {
                    this.starMaterial.uniforms.uVisibility.value = 1.0;
                }
            } else {
                this.starGroup.visible = false;
                if (this.starMaterial && this.starMaterial.uniforms && this.starMaterial.uniforms.uVisibility) {
                    this.starMaterial.uniforms.uVisibility.value = 0.0;
                }
            }
        }

        const biomeCompat = (typeof window !== 'undefined' && window.Dungeon3DCompat) || null;
        this.sunLight.visible = biome.sunLight;
        this.sunLight.intensity = biomeCompat ? biomeCompat.scaleIntensity('directional', biome.sunEnergy) : biome.sunEnergy;
        if (biome.sunColor !== undefined) {
            this.sunLight.color.setHex(biome.sunColor);
        }
        const canSunShadow = Boolean(outdoors && this._enableDynamicShadows);
        this.sunLight.castShadow = canSunShadow;
        if (this.sunLight.visible) {
            const pwx = px * this.cellSize;
            const pwz = py * this.cellSize;
            this.sunLight.position.set(pwx - 18, 30, pwz + 14);
            if (this.sunLight.target && this.sunLight.target.position) {
                this.sunLight.target.position.set(pwx, 0, pwz);
                if (typeof this.sunLight.target.updateMatrixWorld === 'function') {
                    this.sunLight.target.updateMatrixWorld();
                }
            }
        }
        if (this.wallMesh) this.wallMesh.castShadow = canSunShadow;
        if (this.permWallMesh) this.permWallMesh.castShadow = canSunShadow;
        if (this.townRoofMesh) this.townRoofMesh.castShadow = canSunShadow;

        this.ambientLight.color.setHex(biome.ambientColor);
        this.ambientLight.intensity = biomeCompat ? biomeCompat.scaleIntensity('ambient', biome.ambientEnergy) : biome.ambientEnergy;

        if (biomeCompat) biomeCompat.setExposure(this.renderer, biome.exposure);
        else this.renderer.toneMappingExposure = biome.exposure;

        // Extract torch radius from player (cur_light or light), preserving genuine light=0 darkness
        const lightProp = (frame.player && (frame.player.cur_light !== undefined ? frame.player.cur_light : frame.player.light));
        const hasLightNum = typeof lightProp === 'number';
        this.torchRadius = hasLightNum ? Math.max(0, lightProp) : 1;
        this._zeroLightDimScale = (this.torchRadius === 0 && !outdoors) ? 0.16 : 1.0;
        this._lightFuel = (frame.player && frame.player.light_fuel !== undefined && frame.player.light_fuel !== null)
            ? Number(frame.player.light_fuel)
            : null;

        if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.applySubterraneanAtmosphere === 'function') {
            window.Dungeon3DAtmosphere.applySubterraneanAtmosphere(this, biome, depth, outdoors);
        } else if (outdoors) {
            if (!(this.scene.fog instanceof THREE.FogExp2)) {
                this.scene.fog = new THREE.FogExp2(biome.fogColor, biome.fogDensity);
            } else {
                this.scene.fog.color.setHex(biome.fogColor);
                this.scene.fog.density = biome.fogDensity;
            }
        } else {
            // Subterranean dungeon: atmospheric misty blackness fading smoothly into dark void
            const dungeonFogDensity = Math.max(0.024, biome.fogDensity * 2.2);
            if (!(this.scene.fog instanceof THREE.FogExp2)) {
                this.scene.fog = new THREE.FogExp2(biome.fogColor, dungeonFogDensity);
            } else {
                this.scene.fog.color.setHex(biome.fogColor);
                this.scene.fog.density = dungeonFogDensity;
            }
        }

        // Torch distance calculation matching Godot DungeonWorld.cs:3468:
        const torchRange = (this.torchRadius === 0 && !outdoors)
            ? 3.2
            : ((this.torchRadius + 2.5) * this.cellSize + 2.0);
        if (this.torchBaseColor) this.torchBaseColor.setHex(biome.torchColor);
        this.torchLight.color.setHex(biome.torchColor);
        this.torchLight.distance = torchRange;
        this.torchLight.decay = 1.0;

        // Forward vector for camera-relative VFX placement
        // # ROOT-CAUSE: Update monsters before message VFX, bias hurt sparks toward attacker, and deduplicate player hurt feedback
        this._frameCounter = (this._frameCounter || 0) + 1;
        const fwdYaw = this.camera ? this.camera.rotation.y : 0;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), fwdYaw);
        const spawnInFront = this.currentCamPos.clone().addScaledVector(forward, 1.1).add(new THREE.Vector3(0, 0.2, 0));

        // Player HP delta tracking for floating damage/healing & camera trauma
        if (frame.player) {
            const curHp = frame.player.hp !== undefined ? frame.player.hp : null;
            if (curHp !== null && this.lastPlayerHp !== null) {
                if (curHp < this.lastPlayerHp) {
                    const dmg = this.lastPlayerHp - curHp;
                    this._lastPlayerHurtFrame = this._frameCounter;
                    const hurtPos = spawnInFront.clone();
                    if (this.monsters && this.monsters.size > 0) {
                        let bestD = 3.8;
                        let bestEnt = null;
                        for (const ent of this.monsters.values()) {
                            if (!ent || !ent.visible) continue;
                            const d = ent.position.distanceTo(this.currentCamPos);
                            if (d < bestD) { bestD = d; bestEnt = ent; }
                        }
                        if (bestEnt) {
                            const toAttacker = bestEnt.position.clone().sub(this.currentCamPos).setY(0).normalize();
                            hurtPos.addScaledVector(toAttacker, 0.35);
                        }
                    }
                    this.spawnFloatingText(`-${dmg}`, hurtPos, '#ff3333', 1.25);
                    this.addTrauma(Math.min(0.65, dmg / (frame.player.hp_max || frame.player.mhp || 20)));
                    this.spawnHitSparks(hurtPos, '#ff2222', 14);
                    this.triggerHurtAnimation();
                    if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.triggerEdgeVignette === 'function') {
                        const maxHp = Math.max(10, Number(frame.player.hp_max || frame.player.mhp || 20));
                        window.Dungeon3DAtmosphere.triggerEdgeVignette(dmg >= maxHp * 0.25 ? 'crit' : 'hit');
                    }
                    if (this.audio) this.audio.playPlayerHurt();
                } else if (curHp > this.lastPlayerHp) {
                    const heal = curHp - this.lastPlayerHp;
                    const minActiveHeal = Math.max(8, Math.floor((frame.player.hp_max || 20) * 0.15));
                    if (heal >= minActiveHeal) {
                        this.spawnFloatingText(`+${heal}`, spawnInFront, '#33ff66', 1.15);
                    }
                    if (this.audio && typeof this.audio.playSubtleRegen === 'function') {
                        this.audio.playSubtleRegen('hp', curHp >= (frame.player.hp_max || curHp));
                    }
                }
            }
            this.lastPlayerHp = curHp;
            this._prevHp = curHp;

            const curSp = frame.player.sp !== undefined ? frame.player.sp : (frame.player.csp !== undefined ? frame.player.csp : null);
            const maxSp = frame.player.sp_max !== undefined ? frame.player.sp_max : (frame.player.max_sp !== undefined ? frame.player.max_sp : (frame.player.msp || 0));
            if (curSp !== null && this.lastPlayerSp !== undefined && this.lastPlayerSp !== null) {
                if (curSp > this.lastPlayerSp && maxSp > 0) {
                    if (this.audio && typeof this.audio.playSubtleRegen === 'function') {
                        this.audio.playSubtleRegen('sp', curSp >= maxSp);
                    }
                }
            }
            this.lastPlayerSp = curSp;

            const curLev = Number(frame.player.level ?? frame.player.lev ?? 0);
            if (curLev > 0) {
                if (this.lastPlayerLevel !== null && curLev > this.lastPlayerLevel) {
                    this.spawnFloatingText(`LEVEL UP! (Lv ${curLev})`, spawnInFront, '#ffd700', 1.45);
                    this.spawnProjectileOrSpellVfx('aura', spawnInFront, spawnInFront, 0xffd700);
                    if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.triggerEdgeVignette === 'function') {
                        window.Dungeon3DAtmosphere.triggerEdgeVignette('levelup');
                    }
                    if (this.audio && typeof this.audio.playLevelUp === 'function') {
                        this.audio.playLevelUp();
                    }
                }
                this.lastPlayerLevel = curLev;
                this._prevLev = curLev;
            }
        }

        // Track Active Status Conditions from Engine Bridge
        if (frame.player && frame.player.statuses && Array.isArray(frame.player.statuses)) {
            const currentStatuses = new Set();
            for (const st of frame.player.statuses) {
                const sName = (st.name || '').toLowerCase();
                currentStatuses.add(sName);
                if (!this.lastPlayerStatuses.has(sName) && this.audio) {
                    if (sName.includes('poison')) this.audio.playPoison();
                    else if (sName.includes('confus')) this.audio.playConfused();
                    else if (sName.includes('blind')) this.audio.playBlind();
                    else if (sName.includes('paralyz')) this.audio.playParalyzed();
                    else if (sName.includes('afraid') || sName.includes('fear')) this.audio.playAfraid();
                    else if (sName.includes('starv') || sName.includes('hungr')) this.audio.playHunger();
                }
            }
            this.lastPlayerStatuses = currentStatuses;
        }

        // Synchronize 3D monster entities BEFORE parsing message VFX so combat endpoints resolve against current positions & dying entities
        this._monstersUpdatedThisFrame = false;
        this.updateMonsters(frame.monsters || [], frame.player);
        this._monstersUpdatedThisFrame = true;

        // Parse recent game messages for kinetic combat & action feedback ("Juice") (1:1 with Godot DungeonWorld.cs)
        // Revision 6 (WS5.1): Use frame-to-frame message delta + msgObj.count tracking instead of a 200-entry Set
        // that permanently suppressed repeated combat/potion/spell messages!
        if (frame.messages && Array.isArray(frame.messages)) {
            const curEntries = [];
            for (const msgObj of frame.messages) {
                const text = typeof msgObj === 'string' ? msgObj : (msgObj && msgObj.text ? String(msgObj.text) : '');
                if (!text) continue;
                const count = (msgObj && typeof msgObj === 'object' && Number.isFinite(msgObj.count)) ? msgObj.count : 1;
                curEntries.push({ text, count });
            }
            if (!this._prevFrameMessageEntries) {
                this._prevFrameMessageEntries = curEntries;
            } else {
                const prev = this._prevFrameMessageEntries;
                const newTexts = [];
                if (curEntries.length > 0) {
                    // Find longest overlap between suffix of prev and prefix of curEntries
                    let overlap = 0;
                    const maxOverlap = Math.min(prev.length, curEntries.length);
                    for (let k = maxOverlap; k >= 1; k--) {
                        let match = true;
                        for (let j = 0; j < k; j++) {
                            if (prev[prev.length - k + j].text !== curEntries[j].text) {
                                match = false;
                                break;
                            }
                        }
                        if (match) {
                            overlap = k;
                            break;
                        }
                    }
                    // If the last overlapping message had its repeat count incremented (e.g. "You hit the Kobold. (x2)"), fire VFX!
                    if (overlap > 0) {
                        const prevLast = prev[prev.length - 1];
                        const curOverlapLast = curEntries[overlap - 1];
                        if (curOverlapLast && prevLast && curOverlapLast.text === prevLast.text && curOverlapLast.count > prevLast.count) {
                            newTexts.push(curOverlapLast.text);
                        }
                    }
                    for (let idx = overlap; idx < curEntries.length; idx++) {
                        newTexts.push(curEntries[idx].text);
                    }
                }
                this._prevFrameMessageEntries = curEntries;
                for (const msgText of newTexts) {
                    this.triggerMessageVfx(msgText);
                }
            }
        }

        const playerFeat = this.getFeatAt(map, px, py);
        const playerGlyph = this.getGlyphAt(map, px, py);
        let waterYOffset = 0;
        let footstepSurface = null;
        if (playerFeat === 28) {
            waterYOffset = -0.08;
            footstepSurface = 'water';
        } else if (playerFeat === 29) {
            waterYOffset = -0.22;
            footstepSurface = 'deep_water';
        } else if (playerFeat === 31) {
            waterYOffset = -0.10;
            footstepSurface = 'swamp';
        } else if (playerFeat === 27) {
            footstepSurface = 'dirt';
        } else if (playerFeat === 26 || playerFeat === 42) {
            footstepSurface = 'grass';
        }
        const thresholdYOffset = this._computeThresholdYOffset ? this._computeThresholdYOffset(playerFeat, playerGlyph, outdoors) : 0;
        this.playerWaterYOffset = waterYOffset;
        this.playerThresholdYOffset = thresholdYOffset;

        if (this._lastShopGridX !== px || this._lastShopGridY !== py || this._lastShopDepth !== depth) {
            this._lastShopGridX = px;
            this._lastShopGridY = py;
            this._lastShopDepth = depth;
            if (outdoors && ((playerFeat >= 7 && playerFeat <= 14) || (playerFeat >= 32 && playerFeat <= 40))) {
                const shopOutYaw = this.determineShopDoorOrientation(map, px, py, w, h);
                const camOutYaw = Math.atan2(Math.sin(shopOutYaw + Math.PI), Math.cos(shopOutYaw + Math.PI));
                const normYaw = (((-camOutYaw) % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
                this.facing = Math.round(normYaw / (Math.PI / 2)) % 4;
                this.targetYaw = -this.facing * (Math.PI / 2);
                if (this.camera) this.camera.rotation.y = this.targetYaw;
            }
        }

        if (this.renderGovernor) this.renderGovernor.wake(1500);
        const targetX = px * this.cellSize;
        const targetY = this.eyeHeight + waterYOffset + thresholdYOffset;
        const targetZ = py * this.cellSize;
        if (!this._logicalCamPos) this._logicalCamPos = new THREE.Vector3().copy(this.currentCamPos);

        const sameStepTargetXZ = this.isStepping && Math.hypot(this.targetCamPos.x - targetX, this.targetCamPos.z - targetZ) < 0.05;
        if (sameStepTargetXZ) {
            // Do not reset in-flight step tween or recapture camera.position mid-stride
            this.targetCamPos.y = targetY;
        } else {
            this.targetCamPos.set(targetX, targetY, targetZ);
            const dist = this._logicalCamPos.distanceTo(this.targetCamPos);
            if (dist > this.cellSize * 1.5) {
                this.currentCamPos.copy(this.targetCamPos);
                this._logicalCamPos.copy(this.targetCamPos);
                this.isStepping = false;
                this.stepPlayedThisMove = false;
                this._strideChain = false;
            } else if (dist > 0.05) {
                const now = performance.now();
                this._strideChain = (now - (this._lastStepEndMs || 0)) < 85;
                this.currentCamPos.copy(this._logicalCamPos);
                this.isStepping = true;
                this.stepTime = 0;
                if (!this.lastStepSoundTime) this.lastStepSoundTime = 0;
                if (!this.stepPlayedThisMove && (now - this.lastStepSoundTime > 200)) {
                    this.stepPlayedThisMove = true;
                    this.lastStepSoundTime = now;
                    if (this.audio) {
                        this.audio.playFootstep(outdoors, this.heightRatio || 1.0, footstepSurface);
                    }
                }
            } else {
                this._logicalCamPos.copy(this.targetCamPos);
            }
        }

        // MultiMesh instance counts reset
        let wallCount = 0;
        let upperWallCount = 0;
        let permWallCount = 0;
        let upperPermWallCount = 0;
        let floorCount = 0;
        let ceilingCount = 0;
        let doorFrameCount = 0;
        let shopStoneCount = 0;
        let shopStoneOccCount = 0;
        let shopFrameCount = 0;
        let shopAwningCount = 0;
        let townTimberCount = 0;
        let townTimberPostCount = 0;
        let townRoofCount = 0;
        let doorCount = 0;
        let doorOpenCount = 0;
        let doorBrokenCount = 0;
        let lavaCount = 0;
        let lavaCooledCount = 0;
        let stairsCount = 0;
        let stairsUpCount = 0;
        let stairsUpOccCount = 0;
        let altarCount = 0;
        let altarOccCount = 0;
        let forgeCount = 0;
        let fountainCount = 0;
        let fountainOccCount = 0;
        const veinCounts = { magma: 0, quartz: 0, gold: 0, gem: 0 };
        let treeTrunkCount = 0;
        let treeLeavesCount = 0;
        let bushCount = 0;
        let grassCount = 0;
        let dirtCount = 0;
        let waterCount = 0;
        let deepWaterCount = 0;
        let mountainCount = 0;
        let swampCount = 0;
        let rubbleCount = 0;
        let trapCount = 0;
        let trapPitCount = 0;
        let trapRuneCount = 0;
        let webCount = 0;
        let runeCount = 0;
        let doorLockCount = 0;
        let specialShopDoorCount = 0;
        let shaftRimCount = 0;
        let chasmIdx = 0;
        let chasmVoidIdx = 0;
        let wallTorchCount = 0;
        let waterBankCount = 0;
        const shopCounts = [0, 0, 0, 0, 0, 0, 0, 0];
        const trimCounts = { plinth: 0, cornice: 0, portal: 0 };
        const tac = (typeof window !== 'undefined' && window.Dungeon3DTactical) || null;
        const wallCap = this.wallMesh ? this.wallMesh.instanceMatrix.count : this.maxInstances * 2;
        const upperWallCap = this.upperWallMesh ? this.upperWallMesh.instanceMatrix.count : wallCap;
        const permWallCap = this.permWallMesh ? this.permWallMesh.instanceMatrix.count : this.maxInstances * 2;
        const upperPermWallCap = this.upperPermWallMesh ? this.upperPermWallMesh.instanceMatrix.count : permWallCap;
        const veinCap = this.magmaMesh ? this.magmaMesh.instanceMatrix.count : 1024;
        const ceilCap = this.ceilingMesh ? this.ceilingMesh.instanceMatrix.count : this.maxInstances * 2;
        const floorCap = this.floorMesh ? this.floorMesh.instanceMatrix.count : this.maxInstances;
        const wallGeoH = 3.05;
        const upperGeoH = 3.05;
        this.lastMap = map;

        if (this._syncLevelVisibilityAndRooms) {
            this._syncLevelVisibilityAndRooms(map, w, h, depth, this.realm, outdoors, px, py);
        }

        if (this._terrainAnchorDepth !== depth ||
            this._terrainAnchorRealm !== this.realm ||
            this._terrainAnchorOutdoors !== outdoors ||
            this._terrainAnchorX === undefined ||
            this._terrainAnchorY === undefined ||
            Math.abs(px - this._terrainAnchorX) > 6 ||
            Math.abs(py - this._terrainAnchorY) > 6) {
            this._terrainAnchorX = px;
            this._terrainAnchorY = py;
            this._terrainAnchorDepth = depth;
            this._terrainAnchorRealm = this.realm;
            this._terrainAnchorOutdoors = outdoors;
        }

        const anchorX = this._terrainAnchorX;
        const anchorY = this._terrainAnchorY;
        const isSurfaceTown = outdoors && depth === 0;
        const sightRange = isSurfaceTown ? 55 : (outdoors ? 36 : 28);
        const maxTileDistSq = isSurfaceTown ? 3025 : (outdoors ? 1296 : 784);
        const minX = Math.max(0, anchorX - sightRange);
        const maxX = Math.min(w - 1, anchorX + sightRange);
        const minY = Math.max(0, anchorY - sightRange);
        const maxY = Math.min(h - 1, anchorY + sightRange);

        const sig = this._computeTerrainSig(anchorX, anchorY, depth, this.torchRadius, this.realm, map, minY, maxY, minX, maxX);
        this.playerGridX = px;
        this.playerGridY = py;
        this.updateStreetViewAndCursor(frame);
        if (typeof this.updateTacticalCursor === 'function') {
            this.updateTacticalCursor(frame, 0.016);
        }

        const doorStatesList = (map && Array.isArray(map.door_states)) ? map.door_states : null;
        const doorStateSig = doorStatesList ? doorStatesList.map(d => `${d.x},${d.y}:${d.s}`).join('|') : '';
        if (this._lastTerrainSig === sig && this._lastDoorStateSig === doorStateSig) {
            this.updateMonsters(frame.monsters || [], frame.player);
            this.updateItems(frame.objects || frame.items || [], frame.player);
            this.updateTerrainLabels(map, w, h, depth, px, py);
            return;
        }
        this._lastTerrainSig = sig;
        this._lastDoorStateSig = doorStateSig;
        this.markShadowsDirty();

        this._stairCompassPositions = [];
        let doorStateMap = null;
        if (doorStatesList && doorStatesList.length > 0) {
            doorStateMap = new Map();
            for (let dsi = 0; dsi < doorStatesList.length; dsi++) {
                const ds = doorStatesList[dsi];
                if (ds && ds.x !== undefined && ds.y !== undefined) {
                    doorStateMap.set(`${ds.x},${ds.y}`, ds.s || 'locked');
                }
            }
        }

        const isLiquidFeat = (f, g) => (f === 28 || f === 84 || f === 29 || f === 80 || f === 31);
        const normalizeCartridgeFeat = (f, g) => {
            if (!outdoors) {
                if (g === '~' && f === 31) return 28;
                if (g === '~' && f === 30) return 23;
                if ((g === ':' || g === ' ') && f === 32) return 41;
                if (g === '^' && f === 16) return 45;
            }
            return f;
        };
        const effFeat = (nx, ny) => {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return 22;
            const rawF = this.getFeatAt(map, nx, ny);
            if (rawF !== 0) return normalizeCartridgeFeat(rawF, this.getGlyphAt(map, nx, ny));
            const m = (!outdoors && this.getRememberedTile) ? this.getRememberedTile(nx, ny) : null;
            return m ? normalizeCartridgeFeat(m.feat, m.glyph) : 0;
        };
        const isBldgTile = (tx, ty) => {
            if (tx <= 1 || tx >= w - 2 || ty <= 1 || ty >= h - 2) return false;
            const f = this.getFeatAt(map, tx, ty);
            return f === 21 || f === 22 || this.isStoreKind(f);
        };
        const isBlindNow = Boolean(this.isPlayerBlind && this.isPlayerBlind(frame.player));
        const useVisList = Boolean((!outdoors || isBlindNow || (this._blindFactor || 0) > 0.01) && this._resetVisBindings);
        const visList = useVisList ? (this._visMeshList || (this._visMeshList = [
            this.wallMesh, this.upperWallMesh, this.permWallMesh, this.upperPermWallMesh, this.floorMesh, this.ceilingMesh,
            this.doorFrameMesh, this.doorMesh, this.doorOpenMesh, this.doorBrokenMesh, this.doorLockMesh,
            this.magmaMesh, this.quartzMesh, this.goldVeinMesh, this.gemVeinMesh,
            this.rubbleMesh, this.stairsMesh, this.stairsUpMesh, this.stairsUpOccupiedMesh, this.shaftRimMesh,
            this.altarMesh, this.altarOccupiedMesh, this.fountainMesh, this.fountainOccupiedMesh, this.forgeMesh,
            this.trapMesh, this.trapPitMesh, this.trapRuneMesh, this.webMesh, this.runeMesh,
            this.wallTorchMesh, this.wallTorchFlameMesh, this.chasmMesh,
            this.waterMesh, this.deepWaterMesh, this.swampMesh, this.waterBankMesh, this.bushMesh, this.grassMesh, this.dirtMesh, this.mountainMesh,
            this.treeTrunkMesh, this.treeLeavesMesh,
            this.wallPlinthMesh, this.wallCorniceMesh, this.darkPortalMesh,
            this.shopFrameMesh, this.shopStoneMesh, this.shopStoneOccupiedMesh, this.shopAwningMesh, this.specialShopDoorMesh,
            this.townTimberMesh, this.townTimberPostMesh, this.townRoofMesh,
            ...(this.shopMeshes || [])
        ])) : null;
        if (visList) {
            for (let vi = 0; vi < visList.length; vi++) {
                if (visList[vi]) visList[vi]._visSlot = vi;
            }
            this._resetVisBindings(visList);
        }
        let tileIdx = -1;
        const setCol = (mesh, idx, col) => {
            if (!mesh) return;
            if (visList && mesh._visSlot !== undefined) this._bindVisColor(mesh._visSlot, mesh, idx, tileIdx, col, outdoors);
            else mesh.setColorAt(idx, col);
        };
        const emitTrapInstance = (tFeat, tAttr, twx, twz, tRot, tInView, tOutdoors, tLight, tx, ty, tIsRoom, tDepth) => {
            if (!this._scratchTrapColor) this._scratchTrapColor = new THREE.Color();
            this._scratchTrapColor.setHex(getAngbandHex(tAttr));
            const trapShade = this.computeTileShade(this._scratchTrapShade || (this._scratchTrapShade = new THREE.Color()), this._scratchTrapColor, tInView, tOutdoors, tLight, tx, ty, tIsRoom, tDepth);
            const isPitTrap = (tFeat === 45 || tFeat === 46 || tAttr === 2 || tAttr === 7 || tAttr === 8);
            const isRuneTrap = (tFeat === 48 || tFeat === 49 || tFeat === 52 || tFeat === 53 || tAttr === 6 || tAttr === 10 || tAttr === 14 || tAttr === 16 || tAttr === 17);
            if (isPitTrap && this.trapPitMesh && trapPitCount < 128) {
                this.dummy.position.set(twx, 0.008, twz);
                this.dummy.rotation.set(0, tRot, 0);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                this.trapPitMesh.setMatrixAt(trapPitCount, this.dummy.matrix);
                setCol(this.trapPitMesh, trapPitCount, trapShade);
                trapPitCount++;
            } else if (isRuneTrap && this.trapRuneMesh && trapRuneCount < 128) {
                this.dummy.position.set(twx, 0.022, twz);
                this.dummy.rotation.set(0, tRot, 0);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                this.trapRuneMesh.setMatrixAt(trapRuneCount, this.dummy.matrix);
                setCol(this.trapRuneMesh, trapRuneCount, trapShade);
                trapRuneCount++;
            } else if (this.trapMesh && trapCount < 128) {
                this.dummy.position.set(twx, 0.015, twz);
                this.dummy.rotation.set(0, tRot, 0);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                this.trapMesh.setMatrixAt(trapCount, this.dummy.matrix);
                setCol(this.trapMesh, trapCount, trapShade);
                trapCount++;
            }
        };
        const camX = this.camera ? this.camera.position.x : px * this.cellSize;
        const camZ = this.camera ? this.camera.position.z : py * this.cellSize;
        this._rawLitShadeMode = Boolean(visList);
        if (this._collectActiveWallSconces) {
            this._collectActiveWallSconces(map, w, h, minX, maxX, minY, maxY, px, py, depth, outdoors, biome);
        }

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dx = x - anchorX, dy = y - anchorY;
                const distSq = dx * dx + dy * dy;
                if (distSq > maxTileDistSq) continue;
                tileIdx = y * w + x;

                let feat = this.getFeatAt(map, x, y);
                let glyph = this.getGlyphAt(map, x, y);
                let tileAttr = this.getAttrAt(map, x, y);
                const flag = this.getFlagAt(map, x, y);
                let known = outdoors || (flag & 0x1) !== 0;
                let inView = outdoors || (flag & 0x2) !== 0;
                let lighting = (flag >> 2) & 0x3;

                if (!outdoors && !inView && feat === 0 && this.getRememberedTile) {
                    const mem = this.getRememberedTile(x, y);
                    if (mem) {
                        feat = mem.feat;
                        glyph = mem.glyph;
                        tileAttr = mem.attr;
                        known = true;
                        lighting = mem.isGlow ? 2 : 3;
                    }
                }

                if (this.realm === 'frogcomposband' && glyph === '#' && (tileAttr === 2 || tileAttr === 8 || tileAttr === 9 || feat === 41)) {
                    feat = 41;
                }
                feat = normalizeCartridgeFeat(feat, glyph);

                const isSilQSunlight = (this.realm === 'silq' && feat === 25);
                if (!isSilQSunlight) {
                    if (feat === 25 && (glyph === '.' || glyph === ',' || glyph === "'")) {
                        feat = 26;
                    } else if (feat === 26 && (glyph === '#' || glyph === '%' || glyph === '&' || glyph === 'T')) {
                        feat = 25;
                    }
                }

                if (feat === 0 || (!known && !inView)) {
                    continue;
                }

                const isWall = feat === 15 || feat === 21 || feat === 22 || feat === 17 || feat === 18 || feat === 19 || feat === 20 || feat === 30;

                if (isWall) {
                    let hasAdjacentOpen = false;
                    for (let ndy = -1; ndy <= 1 && !hasAdjacentOpen; ndy++) {
                        for (let ndx = -1; ndx <= 1 && !hasAdjacentOpen; ndx++) {
                            if (ndx === 0 && ndy === 0) continue;
                            const nx = x + ndx, ny = y + ndy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h && this.isWalkableOrPortal(effFeat(nx, ny))) {
                                hasAdjacentOpen = true;
                            }
                        }
                    }
                    if (!hasAdjacentOpen) continue;
                }

                if (lighting === 3 && inView) {
                    const pDistSq = (x - px) * (x - px) + (y - py) * (y - py);
                    if (pDistSq <= (this.torchRadius + 1) * (this.torchRadius + 1)) lighting = 1;
                }

                let adjWalls = 0;
                let maxNeighborCeil = this.wallHeight;
                if (!outdoors) {
                    for (let ndy = -1; ndy <= 1; ndy++) {
                        for (let ndx = -1; ndx <= 1; ndx++) {
                            if (ndx === 0 && ndy === 0) continue;
                            const nx = x + ndx, ny = y + ndy;
                            if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
                                adjWalls++;
                                continue;
                            }
                            const nFeat = effFeat(nx, ny);
                            if (nFeat === 0 || (nFeat >= 15 && nFeat <= 22 && nFeat !== 16) || nFeat === 30) {
                                adjWalls++;
                            } else {
                                const nc = this._evalIndoorCeilH(map, w, h, nx, ny, depth);
                                if (nc > maxNeighborCeil) maxNeighborCeil = nc;
                            }
                        }
                    }
                }

                const isRoom = (!outdoors && this._levelRoomCeilCache && this._levelMemW === w)
                    ? (this._levelRoomCeilCache[tileIdx] >= 4.1)
                    : (lighting === 2);
                const tileCeilH = !outdoors ? (this._evalIndoorCeilH(map, w, h, x, y, depth) || this.wallHeight) : this.wallHeight;
                const wallShade = this.computeTileShade(this._scratchWallColor, biome.wallColor, inView, outdoors, lighting, x, y, isRoom, depth, 'wall', adjWalls);
                const floorShade = this.computeTileShade(this._scratchFloorColor, biome.floorColor, inView, outdoors, lighting, x, y, isRoom, depth, 'floor', adjWalls);
                const ceilingShade = this.computeTileShade(this._scratchCeilingColor, biome.ceilingColor, inView, outdoors, lighting, x, y, isRoom, depth, 'ceiling', adjWalls);

                const useVariation = !window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.tileVariation;
                const floorRot = useVariation ? (((x * 73 + y * 37) % 4) * (Math.PI / 2)) : 0;
                const wallRot = useVariation ? (((x * 89 + y * 41) % 4) * (Math.PI / 2)) : 0;
                const ceilingRot = 0;

                const wx = x * this.cellSize;
                const wz = y * this.cellSize;
                const camDistSq = (camX - wx) * (camX - wx) + (camZ - wz) * (camZ - wz);
                const wallYCenter = this.wallHeight / 2;

                const emitIndoorCeiling = (cH) => {
                    if (outdoors) return;
                    if (ceilingCount < ceilCap) {
                        this.dummy.position.set(wx, cH, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.scale.set(1, 1, 1);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    if (cH < maxNeighborCeil - 0.05) {
                        if (this.upperWallMesh && upperWallCount < upperWallCap) {
                            const yBot = cH + 0.005;
                            const yTop = maxNeighborCeil + 0.03;
                            this.dummy.position.set(wx, (yBot + yTop) * 0.5, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.scale.set(0.999, (yTop - yBot) / upperGeoH, 0.999);
                            this.dummy.updateMatrix();
                            this.upperWallMesh.setMatrixAt(upperWallCount, this.dummy.matrix);
                            if (tac) tac.setCornerBevelAt(this.upperWallMesh, upperWallCount, 0, 0, 0, 0);
                            setCol(this.upperWallMesh, upperWallCount, wallShade);
                            upperWallCount++;
                            this.dummy.scale.set(1, 1, 1);
                        }
                        if (ceilingCount < ceilCap) {
                            this.dummy.position.set(wx, maxNeighborCeil, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.updateMatrix();
                            this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                            setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                            ceilingCount++;
                        }
                    }
                    if (tac && tac.emitUnexploredFrontierPortals) {
                        tac.emitUnexploredFrontierPortals(this, map, w, h, x, y, cH, floorShade, setCol, trimCounts);
                    }
                };

                const emitLiquidBedAndShore = (isLava = false) => {
                    if (floorCount < floorCap) {
                        this.dummy.position.set(wx, -0.16, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const bedCol = isLava
                            ? (this._scratchLavaBedCol || (this._scratchLavaBedCol = new THREE.Color())).setRGB(0.12, 0.07, 0.06)
                            : (this._scratchRiverbedColor || (this._scratchRiverbedColor = new THREE.Color())).setRGB(floorShade.r * 0.42, floorShade.g * 0.44, floorShade.b * 0.48);
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        setCol(this.floorMesh, floorCount, bedCol);
                        floorCount++;
                    }
                    if (this.waterBankMesh) {
                        const edges = [
                            { dx: 0, dy: -1, ox: 0, oz: -0.94, yaw: 0 },
                            { dx: 0, dy: 1, ox: 0, oz: 0.94, yaw: 0 },
                            { dx: 1, dy: 0, ox: 0.94, oz: 0, yaw: Math.PI / 2 },
                            { dx: -1, dy: 0, ox: -0.94, oz: 0, yaw: Math.PI / 2 }
                        ];
                        const bankCol = isLava
                            ? (this._scratchLavaBankCol || (this._scratchLavaBankCol = new THREE.Color())).setRGB(wallShade.r * 0.28, wallShade.g * 0.24, wallShade.b * 0.23)
                            : wallShade;
                        for (let ei = 0; ei < 4 && waterBankCount < 1024; ei++) {
                            const ed = edges[ei];
                            const nx = x + ed.dx, ny = y + ed.dy;
                            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                            const nf = effFeat(nx, ny);
                            const sameLiquid = isLava ? (nf === 23 || nf === 82 || nf === 83) : isLiquidFeat(nf);
                            if (!sameLiquid) {
                                this.dummy.position.set(wx + ed.ox, -0.09, wz + ed.oz);
                                this.dummy.rotation.set(0, ed.yaw, 0);
                                this.dummy.updateMatrix();
                                this.waterBankMesh.setMatrixAt(waterBankCount, this.dummy.matrix);
                                setCol(this.waterBankMesh, waterBankCount, bankCol);
                                waterBankCount++;
                            }
                        }
                    }
                };

                // Natural Photogrammetry Craggy Mineral & Magma Veins (feat 17=MAGMA, 18=QUARTZ, 19=MAGMA_K, 20=QUARTZ_K)
                if (feat >= 17 && feat <= 20) {
                    const vBev = tac ? tac.computeWallCornerBevels(this, map, w, h, x, y, outdoors, this._tmpWallBev || (this._tmpWallBev = [0, 0, 0, 0])) : [0, 0, 0, 0];
                    if ((outdoors || (vBev[0] + vBev[1] + vBev[2] + vBev[3] > 0)) && floorCount < floorCap) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        setCol(this.floorMesh, floorCount, floorShade);
                        floorCount++;
                    }
                    const yBot = -0.05;
                    const yTop = outdoors ? (this.wallHeight + 0.05) : Math.max(this.wallHeight + 0.05, maxNeighborCeil + 0.03);
                    const vKey = feat === 17 ? 'magma' : feat === 18 ? 'quartz' : feat === 19 ? 'gold' : 'gem';
                    const vMesh = feat === 17 ? this.magmaMesh : feat === 18 ? this.quartzMesh : feat === 19 ? this.goldVeinMesh : this.gemVeinMesh;
                    const idx = veinCounts[vKey];
                    if (vMesh && idx < veinCap) {
                        this.dummy.position.set(wx, (yBot + yTop) * 0.5, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.scale.set(1.0, (yTop - yBot) / wallGeoH, 1.0);
                        this.dummy.updateMatrix();
                        vMesh.setMatrixAt(idx, this.dummy.matrix);
                        if (tac) tac.setCornerBevelAt(vMesh, idx, vBev[0], vBev[1], vBev[2], vBev[3]);
                        setCol(vMesh, idx, wallShade);
                        veinCounts[vKey] = idx + 1;
                        this.dummy.scale.set(1, 1, 1);
                    }
                    if (!outdoors && ceilingCount < ceilCap) {
                        this.dummy.position.set(wx, Math.max(this.wallHeight + 0.05, maxNeighborCeil), wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Alpine Mountain Peaks (feat 30=MOUNTAIN)
                if (feat === 30) {
                    let hasExposedMountainFace = false;
                    for (let mdy = -1; mdy <= 1 && !hasExposedMountainFace; mdy++) {
                        for (let mdx = -1; mdx <= 1 && !hasExposedMountainFace; mdx++) {
                            if (mdx === 0 && mdy === 0) continue;
                            const nx = x + mdx, ny = y + mdy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h && effFeat(nx, ny) !== 30) {
                                hasExposedMountainFace = true;
                            }
                        }
                    }
                    if (!hasExposedMountainFace) continue;

                    if (floorCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        setCol(this.floorMesh, floorCount, floorShade);
                        floorCount++;
                    }
                    if (mountainCount < this.maxInstances) {
                        this.dummy.position.set(wx, 0, wz);
                        const mYaw = ((x * 53 + y * 97) % 8) * (Math.PI / 4);
                        const mTiltX = (((x * 31 + y * 13) % 5) - 2) * 0.032;
                        const mTiltZ = (((x * 17 + y * 43) % 5) - 2) * 0.032;
                        const mScaleX = 0.92 + ((x * 17 + y * 29) % 5) * 0.06;
                        const mScaleZ = 0.92 + ((x * 23 + y * 37) % 5) * 0.06;
                        const mScaleY = 0.92 + ((x * 19 + y * 31) % 6) * 0.14;
                        this.dummy.rotation.set(mTiltX, mYaw, mTiltZ);
                        this.dummy.scale.set(mScaleX, mScaleY, mScaleZ);
                        this.dummy.updateMatrix();
                        const mountainShade = this.computeTileShade(this._scratchMountainColor, this.getBaseColour(30, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        if (this._hasPolyHavenMountainTex && outdoors) mountainShade.multiplyScalar(0.68);
                        this.mountainMesh.setMatrixAt(mountainCount, this.dummy.matrix);
                        setCol(this.mountainMesh, mountainCount, mountainShade);
                        mountainCount++;
                        this.dummy.scale.set(1, 1, 1);
                    }
                    if (!outdoors && ceilingCount < ceilCap) {
                        this.dummy.position.set(wx, Math.max(this.wallHeight + 0.05, maxNeighborCeil), wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Solid Stone / Granite / Perm / Secret wall (feat 15=SECRET, 21=GRANITE, 22=PERM)
                if (feat === 15 || feat === 21 || feat === 22) {
                    const wBev = tac ? tac.computeWallCornerBevels(this, map, w, h, x, y, outdoors, this._tmpWallBev || (this._tmpWallBev = [0, 0, 0, 0])) : [0, 0, 0, 0];
                    if ((outdoors || (wBev[0] + wBev[1] + wBev[2] + wBev[3] > 0)) && floorCount < floorCap) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        setCol(this.floorMesh, floorCount, floorShade);
                        floorCount++;
                    }

                    const isTownBuilding = outdoors && (feat === 22 || feat === 21) && x > 1 && x < (w - 2) && y > 1 && y < (h - 2);
                    const yBot = -0.05;
                    const yTop = outdoors ? (this.wallHeight + 0.05) : Math.max(this.wallHeight + 0.05, maxNeighborCeil + 0.03);
                    const monoPosY = isTownBuilding ? wallYCenter : ((yBot + yTop) * 0.5);
                    const monoSclY = isTownBuilding ? 1.0 : ((yTop - yBot) / wallGeoH);
                    const monoSclXZ = 1.0;
                    let activeWallShade = wallShade;
                    if ((feat === 22 || (outdoors && feat === 21)) && !isTownBuilding) {
                        const permShade = this.computeTileShade(this._scratchPermWallColor, this.getBaseColour(22, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        activeWallShade = permShade;
                        if (permWallCount < permWallCap) {
                            this.dummy.position.set(wx, monoPosY, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.scale.set(monoSclXZ, monoSclY, monoSclXZ);
                            this.dummy.updateMatrix();
                            this.permWallMesh.setMatrixAt(permWallCount, this.dummy.matrix);
                            if (tac) tac.setCornerBevelAt(this.permWallMesh, permWallCount, wBev[0], wBev[1], wBev[2], wBev[3]);
                            setCol(this.permWallMesh, permWallCount, permShade);
                            permWallCount++;
                            this.dummy.scale.set(1, 1, 1);
                        }
                    } else {
                        if (wallCount < wallCap) {
                            this.dummy.position.set(wx, monoPosY, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.scale.set(monoSclXZ, monoSclY, monoSclXZ);
                            this.dummy.updateMatrix();
                            this.wallMesh.setMatrixAt(wallCount, this.dummy.matrix);
                            if (tac) tac.setCornerBevelAt(this.wallMesh, wallCount, wBev[0], wBev[1], wBev[2], wBev[3]);
                            setCol(this.wallMesh, wallCount, wallShade);
                            wallCount++;
                            this.dummy.scale.set(1, 1, 1);
                        }
                        if (isTownBuilding) {
                            this.dummy.position.set(wx, 0, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.updateMatrix();
                            if (this.townTimberMesh && townTimberCount < this.maxInstances) {
                                this.townTimberMesh.setMatrixAt(townTimberCount, this.dummy.matrix);
                                setCol(this.townTimberMesh, townTimberCount, wallShade);
                                townTimberCount++;
                            }
                            if (!(outdoors && typeof window !== 'undefined' && window.Dungeon3DTown) && this.townRoofMesh && townRoofCount < this.maxInstances) {
                                this.townRoofMesh.setMatrixAt(townRoofCount, this.dummy.matrix);
                                setCol(this.townRoofMesh, townRoofCount, wallShade);
                                townRoofCount++;
                            }
                            if (this.townTimberPostMesh) {
                                for (let sy = -1; sy <= 1; sy += 2) {
                                    for (let sx = -1; sx <= 1; sx += 2) {
                                        if (townTimberPostCount >= this.maxInstances) break;
                                        const openX = !isBldgTile(x + sx, y);
                                        const openZ = !isBldgTile(x, y + sy);
                                        if ((openX && openZ) || (((x + y) & 1) === 0 && sx < 0 && (openX || openZ))) {
                                            this.dummy.position.set(wx + sx * 0.916, 0, wz + sy * 0.916);
                                            this.dummy.updateMatrix();
                                            this.townTimberPostMesh.setMatrixAt(townTimberPostCount, this.dummy.matrix);
                                            setCol(this.townTimberPostMesh, townTimberPostCount, wallShade);
                                            townTimberPostCount++;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (!outdoors && tac && tac.emitWallMasonryTrim) {
                        tac.emitWallMasonryTrim(this, map, w, h, x, y, wx, wz, depth, wBev, activeWallShade, setCol, trimCounts);
                    }

                    if (!outdoors && ceilingCount < ceilCap) {
                        this.dummy.position.set(wx, Math.max(this.wallHeight + 0.05, maxNeighborCeil), wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Store Entrances (feat 7..14 outdoors) and Special Town Buildings (feat 32..40, excluding Sil-Q Forges); Elemental Runes indoors
                const isSilQForgeTile = (feat === 60 || (this.realm === 'silq' && glyph === '0'));
                const isSpecialBuilding = (feat >= 32 && feat <= 40 && !isSilQForgeTile && outdoors);
                let shopIdx = -1;
                if (feat >= 7 && feat <= 14 && outdoors) {
                    shopIdx = feat - 7;
                } else if (feat >= 7 && feat <= 14 && !outdoors) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, floorRot, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;
                    if (this.runeMesh && runeCount < 128) {
                        this.dummy.position.set(wx, 0.020, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.scale.set(1, 1, 1);
                        this.dummy.updateMatrix();
                        this.runeMesh.setMatrixAt(runeCount, this.dummy.matrix);
                        if (!this._scratchTrapColor) this._scratchTrapColor = new THREE.Color();
                        this._scratchTrapColor.setHex(getAngbandHex(tileAttr));
                        const runeShade = this.computeTileShade(this._scratchTrapShade || (this._scratchTrapShade = new THREE.Color()), this._scratchTrapColor, inView, outdoors, lighting, x, y, isRoom, depth);
                        setCol(this.runeMesh, runeCount, runeShade);
                        runeCount++;
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                } else if (feat >= 32 && feat <= 40 && !isSilQForgeTile) {
                    switch (feat) {
                        case 32: shopIdx = 7; break;
                        case 33: shopIdx = 0; break;
                        case 34: shopIdx = 4; break;
                        case 35: shopIdx = 5; break;
                        case 36: shopIdx = 6; break;
                        case 37: shopIdx = 2; break;
                        case 38: shopIdx = 3; break;
                        case 39: shopIdx = 3; break;
                        case 40: shopIdx = 0; break;
                        default: shopIdx = 0; break;
                    }
                }
                if (shopIdx >= 0 && shopIdx < 8) {
                    if (!this._shopDoorsHydrated && typeof this.ensureShopDoorMaterials === 'function') {
                        this.ensureShopDoorMaterials();
                    }
                    this._levelHasShops = true;
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;

                    const doorYaw = this.determineShopDoorOrientation(map, x, y, w, h);
                    const shopOccupied = (px === x && py === y) || camDistSq < 1.1025;
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    if (shopOccupied && this.shopStoneOccupiedMesh && shopStoneOccCount < 64) {
                        this.shopStoneOccupiedMesh.setMatrixAt(shopStoneOccCount, this.dummy.matrix);
                        setCol(this.shopStoneOccupiedMesh, shopStoneOccCount, wallShade);
                        shopStoneOccCount++;
                    } else if (this.shopStoneMesh && shopStoneCount < 256) {
                        this.shopStoneMesh.setMatrixAt(shopStoneCount, this.dummy.matrix);
                        setCol(this.shopStoneMesh, shopStoneCount, wallShade);
                        shopStoneCount++;
                    }

                    this.shopFrameMesh.setMatrixAt(shopFrameCount, this.dummy.matrix);
                    setCol(this.shopFrameMesh, shopFrameCount, wallShade);
                    shopFrameCount++;

                    if (this.shopAwningMesh && shopAwningCount < 256) {
                        const specialColors = {
                            32: [0.58, 0.25, 0.78], // Castle / Guild royal purple
                            33: [0.76, 0.26, 0.24], // Inn warm burgundy
                            34: [0.68, 0.48, 0.18], // Hall amber gold
                            35: [0.18, 0.68, 0.68], // Museum teal
                            36: [0.22, 0.56, 0.42], // Arena emerald
                            37: [0.74, 0.36, 0.20], // Forge copper
                            38: [0.62, 0.42, 0.72], // Sanctuary violet
                            39: [0.24, 0.38, 0.78], // Bookstore indigo
                            40: [0.78, 0.62, 0.26]  // Pavilion gold
                        };
                        const sc = (isSpecialBuilding && specialColors[feat]) ? specialColors[feat] : procStoreColor(shopIdx + 1);
                        if (!this._scratchAwningColor) this._scratchAwningColor = new THREE.Color();
                        this._scratchAwningColor.setRGB(
                            Math.min(1.0, sc[0] * 0.92 * wallShade.r + 0.08),
                            Math.min(1.0, sc[1] * 0.92 * wallShade.g + 0.08),
                            Math.min(1.0, sc[2] * 0.92 * wallShade.b + 0.08)
                        );
                        this.shopAwningMesh.setMatrixAt(shopAwningCount, this.dummy.matrix);
                        this.shopAwningMesh.setColorAt(shopAwningCount, this._scratchAwningColor);
                        shopAwningCount++;
                    }

                    if (!shopOccupied) {
                        if (isSpecialBuilding && this.specialShopDoorMesh && specialShopDoorCount < 64) {
                            this.specialShopDoorMesh.setMatrixAt(specialShopDoorCount, this.dummy.matrix);
                            setCol(this.specialShopDoorMesh, specialShopDoorCount, wallShade);
                            specialShopDoorCount++;
                        } else {
                            this.shopMeshes[shopIdx].setMatrixAt(shopCounts[shopIdx], this.dummy.matrix);
                            setCol(this.shopMeshes[shopIdx], shopCounts[shopIdx], wallShade);
                            shopCounts[shopIdx]++;
                        }
                    }

                    if (!(outdoors && typeof window !== 'undefined' && window.Dungeon3DTown) && outdoors && this.townRoofMesh && townRoofCount < this.maxInstances) {
                        this.dummy.position.set(wx, 0, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.townRoofMesh.setMatrixAt(townRoofCount, this.dummy.matrix);
                        this.townRoofMesh.setColorAt(townRoofCount, wallShade);
                        townRoofCount++;
                    }

                    emitIndoorCeiling(this.wallHeight);
                    continue;
                }

                // Closed Dungeon Door (feat 2) with optional Locked/Jammed crossbar
                if (feat === 2) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;

                    const doorYaw = this.determineDoorOrientation(map, x, y, w, h);
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    this.doorFrameMesh.setMatrixAt(doorFrameCount, this.dummy.matrix);
                    setCol(this.doorFrameMesh, doorFrameCount, wallShade);
                    doorFrameCount++;

                    this.doorMesh.setMatrixAt(doorCount, this.dummy.matrix);
                    setCol(this.doorMesh, doorCount, wallShade);
                    doorCount++;

                    if (doorStateMap && this.doorLockMesh && doorLockCount < 128) {
                        const dState = doorStateMap.get(`${x},${y}`);
                        if (dState === 'locked' || dState === 'jammed') {
                            this.doorLockMesh.setMatrixAt(doorLockCount, this.dummy.matrix);
                            const lockCol = this._scratchLockCol || (this._scratchLockCol = new THREE.Color());
                            lockCol.setHex(dState === 'jammed' ? 0xdc2626 : 0xfbbf24);
                            if (!outdoors) lockCol.multiplyScalar(inView ? 0.95 : 0.45);
                            setCol(this.doorLockMesh, doorLockCount, lockCol);
                            doorLockCount++;
                        }
                    }

                    emitIndoorCeiling(this.wallHeight);
                    continue;
                }

                // Open Dungeon Door (feat 3)
                if (feat === 3) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;

                    const doorYaw = this.determineDoorOrientation(map, x, y, w, h);
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    this.doorFrameMesh.setMatrixAt(doorFrameCount, this.dummy.matrix);
                    setCol(this.doorFrameMesh, doorFrameCount, wallShade);
                    doorFrameCount++;

                    this.doorOpenMesh.setMatrixAt(doorOpenCount, this.dummy.matrix);
                    setCol(this.doorOpenMesh, doorOpenCount, wallShade);
                    doorOpenCount++;

                    emitIndoorCeiling(this.wallHeight);
                    continue;
                }

                // Feat 4 Disambiguation: Brogue Foliage (bushMesh), Trap (trapMesh), or Broken Door (doorBrokenMesh)
                if (feat === 4) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, floorRot, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;

                    if (this.realm === 'brogue' && glyph !== "'" && glyph !== '+') {
                        const bushShade = this.computeTileShade(this._scratchTreeColor, this.getBaseColour(42, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        const bushOcc = (px === x && py === y) || camDistSq < 0.5625;
                        if (bushOcc) {
                            for (let by = -1; by <= 1; by += 2) {
                                for (let bx = -1; bx <= 1; bx += 2) {
                                    if (bushCount >= this.maxInstances) break;
                                    this.dummy.position.set(wx + bx * 0.64, -0.06, wz + by * 0.64);
                                    this.dummy.rotation.set(0, ((x + bx) * 43 + (y + by) * 71) * 0.4, 0);
                                    this.dummy.scale.set(0.45, 0.45, 0.45);
                                    this.dummy.updateMatrix();
                                    this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                                    setCol(this.bushMesh, bushCount, bushShade);
                                    bushCount++;
                                }
                            }
                            this.dummy.scale.set(1, 1, 1);
                        } else if (bushCount < this.maxInstances) {
                            this.dummy.position.set(wx, 0, wz);
                            const bushYaw = ((x * 43 + y * 71) % 8) * (Math.PI / 4);
                            this.dummy.rotation.set(0, bushYaw, 0);
                            const bs = 0.85 + ((x * 11 + y * 5) % 4) * 0.07;
                            this.dummy.scale.set(bs, bs, bs);
                            this.dummy.updateMatrix();
                            this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                            setCol(this.bushMesh, bushCount, bushShade);
                            bushCount++;
                            this.dummy.scale.set(1, 1, 1);
                        }
                        emitIndoorCeiling(tileCeilH);
                    } else if (glyph === '^') {
                        emitTrapInstance(feat, tileAttr, wx, wz, floorRot, inView, outdoors, lighting, x, y, isRoom, depth);
                        emitIndoorCeiling(tileCeilH);
                    } else if (glyph === ';') {
                        const isWebAttr = (tileAttr === 2 || tileAttr === 8 || tileAttr === 9);
                        if (isWebAttr && this.webMesh && webCount < 128) {
                            this.dummy.position.set(wx, 0.0, wz);
                            this.dummy.rotation.set(0, floorRot, 0);
                            this.dummy.scale.set(1, 1, 1);
                            this.dummy.updateMatrix();
                            this.webMesh.setMatrixAt(webCount, this.dummy.matrix);
                            setCol(this.webMesh, webCount, floorShade);
                            webCount++;
                        } else if (!isWebAttr && this.runeMesh && runeCount < 128) {
                            this.dummy.position.set(wx, 0.020, wz);
                            this.dummy.rotation.set(0, floorRot, 0);
                            this.dummy.scale.set(1, 1, 1);
                            this.dummy.updateMatrix();
                            this.runeMesh.setMatrixAt(runeCount, this.dummy.matrix);
                            if (!this._scratchTrapColor) this._scratchTrapColor = new THREE.Color();
                            this._scratchTrapColor.setHex(getAngbandHex(tileAttr));
                            const runeShade = this.computeTileShade(this._scratchTrapShade || (this._scratchTrapShade = new THREE.Color()), this._scratchTrapColor, inView, outdoors, lighting, x, y, isRoom, depth);
                            setCol(this.runeMesh, runeCount, runeShade);
                            runeCount++;
                        }
                        emitIndoorCeiling(tileCeilH);
                    } else {
                        const doorYaw = this.determineDoorOrientation(map, x, y, w, h);
                        this.dummy.position.set(wx, 0, wz);
                        this.dummy.rotation.set(0, doorYaw, 0);
                        this.dummy.updateMatrix();

                        this.doorFrameMesh.setMatrixAt(doorFrameCount, this.dummy.matrix);
                        setCol(this.doorFrameMesh, doorFrameCount, wallShade);
                        doorFrameCount++;

                        this.doorBrokenMesh.setMatrixAt(doorBrokenCount, this.dummy.matrix);
                        setCol(this.doorBrokenMesh, doorBrokenCount, wallShade);
                        doorBrokenCount++;
                        emitIndoorCeiling(this.wallHeight);
                    }
                    continue;
                }

                // Bottomless Pit (feat 41: open vertical cliff drop-off to -4.10m abyss)
                if (feat === 41) {
                    if (!this._scratchChasmShade) this._scratchChasmShade = new THREE.Color();
                    if (!this._scratchChasmColor) this._scratchChasmColor = new THREE.Color(0x525763);
                    const chasmShade = this.computeTileShade(this._scratchChasmShade, this._scratchChasmColor, inView, outdoors, lighting, x, y, isRoom, depth);
                    if (outdoors) chasmShade.multiplyScalar(0.62);
                    const pitEdges = [
                        { dx: 0, dy: -1, ox: 0, oz: -1.0, yaw: 0 },
                        { dx: 0, dy: 1, ox: 0, oz: 1.0, yaw: Math.PI },
                        { dx: 1, dy: 0, ox: 1.0, oz: 0, yaw: -Math.PI * 0.5 },
                        { dx: -1, dy: 0, ox: -1.0, oz: 0, yaw: Math.PI * 0.5 }
                    ];
                    for (let ei = 0; ei < 4 && chasmIdx < this.maxInstances; ei++) {
                        const pe = pitEdges[ei];
                        if (effFeat(x + pe.dx, y + pe.dy) !== 41) {
                            this.dummy.position.set(wx + pe.ox, 0, wz + pe.oz);
                            this.dummy.rotation.set(0, pe.yaw, 0);
                            this.dummy.scale.set(1, 1, 1);
                            this.dummy.updateMatrix();
                            this.chasmMesh.setMatrixAt(chasmIdx, this.dummy.matrix);
                            setCol(this.chasmMesh, chasmIdx, chasmShade);
                            chasmIdx++;
                        }
                    }
                    if (chasmVoidIdx < this.maxInstances) {
                        this.dummy.position.set(wx, -4.10, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.scale.set(1.06, 1, 1.06);
                        this.dummy.updateMatrix();
                        this.chasmVoidMesh.setMatrixAt(chasmVoidIdx, this.dummy.matrix);
                        chasmVoidIdx++;
                        this.dummy.scale.set(1, 1, 1);
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Floor / Walkable corridor / Passable rubble / Sunlight (Sil-Q) / Wire Traps (45..55; note 43=Altar, 44=Fountain handled first below!)
                const isSilQForge = (feat === 60 || (this.realm === 'silq' && glyph === '0'));
                if (((feat === 43 || feat === 44) && glyph !== '^') || isSilQForge) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;

                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    const sanctuaryStone = this._sanctuaryStoneColor || (this._sanctuaryStoneColor = new THREE.Color(1, 1, 1));
                    sanctuaryStone.setRGB(
                        Math.min(1.0, Math.max(0.82, floorShade.r * 1.35)),
                        Math.min(1.0, Math.max(0.82, floorShade.g * 1.35)),
                        Math.min(1.0, Math.max(0.82, floorShade.b * 1.35))
                    );
                    const pureWhite = this._sanctuaryPureWhite || (this._sanctuaryPureWhite = new THREE.Color(1, 1, 1));
                    const monOccupied = (px === x && py === y) || camDistSq < 0.5625;
                    if (isSilQForge && this.forgeMesh) {
                        if (forgeCount < 32) {
                            if (monOccupied) {
                                this.dummy.position.set(wx + 0.68, 0, wz - 0.36);
                                this.dummy.scale.set(0.60, 0.60, 0.60);
                                this.dummy.updateMatrix();
                                this.dummy.scale.set(1, 1, 1);
                            }
                            this.forgeMesh.setMatrixAt(forgeCount, this.dummy.matrix);
                            setCol(this.forgeMesh, forgeCount, sanctuaryStone);
                            forgeCount++;
                        }
                    } else if (feat === 43) {
                        if (monOccupied && this.altarOccupiedMesh && altarOccCount < 32) {
                            this.altarOccupiedMesh.setMatrixAt(altarOccCount, this.dummy.matrix);
                            setCol(this.altarOccupiedMesh, altarOccCount, sanctuaryStone);
                            altarOccCount++;
                        } else if (altarCount < 64) {
                            this.altarMesh.setMatrixAt(altarCount, this.dummy.matrix);
                            setCol(this.altarMesh, altarCount, sanctuaryStone);
                            if (this.altarBrassMesh) {
                                this.altarBrassMesh.setMatrixAt(altarCount, this.dummy.matrix);
                                this.altarBrassMesh.setColorAt(altarCount, pureWhite);
                            }
                            if (this.altarFlameMesh) {
                                this.altarFlameMesh.setMatrixAt(altarCount, this.dummy.matrix);
                                this.altarFlameMesh.setColorAt(altarCount, pureWhite);
                            }
                            altarCount++;
                        }
                    } else {
                        if (monOccupied && this.fountainOccupiedMesh && fountainOccCount < 32) {
                            this.fountainOccupiedMesh.setMatrixAt(fountainOccCount, this.dummy.matrix);
                            setCol(this.fountainOccupiedMesh, fountainOccCount, sanctuaryStone);
                            fountainOccCount++;
                        } else if (fountainCount < 64) {
                            this.fountainMesh.setMatrixAt(fountainCount, this.dummy.matrix);
                            setCol(this.fountainMesh, fountainCount, sanctuaryStone);
                            if (this.fountainBrassMesh) {
                                this.fountainBrassMesh.setMatrixAt(fountainCount, this.dummy.matrix);
                                this.fountainBrassMesh.setColorAt(fountainCount, pureWhite);
                            }
                            if (this.fountainWaterMesh) {
                                this.fountainWaterMesh.setMatrixAt(fountainCount, this.dummy.matrix);
                                this.fountainWaterMesh.setColorAt(fountainCount, pureWhite);
                            }
                            fountainCount++;
                        }
                    }

                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                const isSunlightTile = (this.realm === 'silq' && feat === 25);
                const isWireTrapFeat = (feat >= 45 && feat <= 55);
                const isWebFeat = (feat === 56);
                const isRuneFeat = (feat === 57);
                if (feat === 1 || feat === 24 || isSunlightTile || isWireTrapFeat || isWebFeat || isRuneFeat) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, floorRot, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, isSunlightTile ? this._sunlightFloorColor : floorShade);
                    floorCount++;

                    const isWebTile = isWebFeat || (glyph === ';' && (tileAttr === 2 || tileAttr === 8 || tileAttr === 9));
                    const isRuneTile = !isWebTile && (isRuneFeat || feat === 49 || glyph === ';');
                    if (isWebTile && this.webMesh && webCount < 128) {
                        this.dummy.position.set(wx, 0.0, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.scale.set(1, 1, 1);
                        this.dummy.updateMatrix();
                        this.webMesh.setMatrixAt(webCount, this.dummy.matrix);
                        setCol(this.webMesh, webCount, floorShade);
                        webCount++;
                    } else if (isRuneTile && this.runeMesh && runeCount < 128) {
                        this.dummy.position.set(wx, 0.020, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.scale.set(1, 1, 1);
                        this.dummy.updateMatrix();
                        this.runeMesh.setMatrixAt(runeCount, this.dummy.matrix);
                        if (!this._scratchTrapColor) this._scratchTrapColor = new THREE.Color();
                        this._scratchTrapColor.setHex(getAngbandHex(tileAttr));
                        const runeShade = this.computeTileShade(this._scratchTrapShade || (this._scratchTrapShade = new THREE.Color()), this._scratchTrapColor, inView, outdoors, lighting, x, y, isRoom, depth);
                        setCol(this.runeMesh, runeCount, runeShade);
                        runeCount++;
                    } else if (glyph === '^' || isWireTrapFeat) {
                        emitTrapInstance(feat, tileAttr, wx, wz, floorRot, inView, outdoors, lighting, x, y, isRoom, depth);
                    }

                    if (!isSunlightTile) emitIndoorCeiling(tileCeilH);
                    else if (!outdoors && tac && tac.emitUnexploredFrontierPortals) tac.emitUnexploredFrontierPortals(this, map, w, h, x, y, tileCeilH, floorShade, setCol, trimCounts);
                    continue;
                }

                // Forest Trees (feat 25: TREE)
                if (feat === 25) {
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        grassShade.multiplyScalar(0.66);
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        setCol(this.grassMesh, grassCount, grassShade);
                        grassCount++;
                    }
                    const isInteriorForest = (effFeat(x - 1, y) === 25 && effFeat(x + 1, y) === 25 && effFeat(x, y - 1) === 25 && effFeat(x, y + 1) === 25);
                    if (!(isInteriorForest && distSq > 225 && ((x + y) & 1))) {
                        const tOffX = (((x * 37 + y * 53) % 7) - 3) * 0.095;
                        const tOffZ = (((x * 61 + y * 29) % 7) - 3) * 0.095;
                        this.dummy.position.set(wx + tOffX, 0, wz + tOffZ);
                        const treeYaw = ((x * 67 + y * 97) % 8) * (Math.PI / 4);
                        this.dummy.rotation.set(0, treeYaw, 0);
                        const s = 0.96 + ((x * 7 + y * 13) % 5) * 0.09;
                        if (!(isInteriorForest && distSq > 100) && treeTrunkCount < this.maxInstances) {
                            this.dummy.scale.set(s, s, s);
                            this.dummy.updateMatrix();
                            const trunkBase = (this.realm === 'silq')
                                ? this._scratchTrunkBaseColor.setRGB(0.56, 0.52, 0.48)
                                : this._scratchTrunkBaseColor.setRGB(0.64, 0.56, 0.48);
                            const trunkShade = this.computeTileShade(this._scratchTreeTrunkColor, trunkBase, inView, outdoors, lighting, x, y, isRoom, depth);
                            this.treeTrunkMesh.setMatrixAt(treeTrunkCount, this.dummy.matrix);
                            setCol(this.treeTrunkMesh, treeTrunkCount, trunkShade);
                            treeTrunkCount++;
                        }
                        if (treeLeavesCount < this.maxInstances) {
                            const canopyScale = (isInteriorForest && distSq > 225) ? s * 1.24 : s;
                            this.dummy.scale.set(canopyScale, canopyScale, canopyScale);
                            this.dummy.updateMatrix();
                            const tv = (((x * 19 + y * 41) % 7) - 3) * 0.025;
                            let leafBase;
                            if (this._hasPolyHavenTreeTex) {
                                if (!this._treeTintColor) this._treeTintColor = new THREE.Color();
                                if (this.isHengband()) leafBase = this._treeTintColor.setRGB(0.86 + tv * 0.4, 0.84, 0.86);
                                else if (biome === 'swamp') leafBase = this._treeTintColor.setRGB(0.76 + tv * 0.3, 0.86, 0.72);
                                else if (biome === 'desert' || biome === 'autumn') leafBase = this._treeTintColor.setRGB(0.92 + tv * 0.4, 0.88, 0.72);
                                else leafBase = this._treeTintColor.setRGB(0.84 + tv, 0.90 + tv * 0.4, 0.76 - tv * 0.4);
                            } else {
                                leafBase = this.getBaseColour(25, biome);
                            }
                            const canopyShade = this.computeTileShade(this._scratchTreeColor, leafBase, inView, outdoors, lighting, x, y, isRoom, depth);
                            this.treeLeavesMesh.setMatrixAt(treeLeavesCount, this.dummy.matrix);
                            setCol(this.treeLeavesMesh, treeLeavesCount, canopyShade);
                            treeLeavesCount++;
                        }
                        this.dummy.scale.set(1, 1, 1);
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Dense Brush / Thicket / Flowers (feat 42: BUSH)
                if (feat === 42) {
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        grassShade.multiplyScalar(0.78);
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        setCol(this.grassMesh, grassCount, grassShade);
                        grassCount++;
                    }
                    let bushBase;
                    if (this._hasPolyHavenTreeTex) {
                        if (!this._bushTintColor) this._bushTintColor = new THREE.Color();
                        const bv = (((x * 23 + y * 59) % 5) - 2) * 0.03;
                        bushBase = this.isHengband()
                            ? this._bushTintColor.setRGB(0.92, 0.78 + bv, 0.84)
                            : this._bushTintColor.setRGB(0.84 + bv, 0.90, 0.76 - bv);
                    } else {
                        bushBase = this.getBaseColour(42, biome);
                    }
                    const bushShade = this.computeTileShade(this._scratchTreeColor, bushBase, inView, outdoors, lighting, x, y, isRoom, depth);
                    const bushOcc = (px === x && py === y) || camDistSq < 0.5625;
                    if (bushOcc) {
                        for (let by = -1; by <= 1; by += 2) {
                            for (let bx = -1; bx <= 1; bx += 2) {
                                if (bushCount >= this.maxInstances) break;
                                this.dummy.position.set(wx + bx * 0.64, -0.06, wz + by * 0.64);
                                this.dummy.rotation.set(0, ((x + bx) * 43 + (y + by) * 71) * 0.4, 0);
                                this.dummy.scale.set(0.45, 0.45, 0.45);
                                this.dummy.updateMatrix();
                                this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                                setCol(this.bushMesh, bushCount, bushShade);
                                bushCount++;
                            }
                        }
                        this.dummy.scale.set(1, 1, 1);
                    } else if (bushCount < this.maxInstances) {
                        const bOffX = (((x * 41 + y * 19) % 7) - 3) * 0.085;
                        const bOffZ = (((x * 23 + y * 67) % 7) - 3) * 0.085;
                        this.dummy.position.set(wx + bOffX, 0, wz + bOffZ);
                        const bushYaw = ((x * 43 + y * 71) % 8) * (Math.PI / 4);
                        this.dummy.rotation.set(0, bushYaw, 0);
                        const bs = 0.92 + ((x * 11 + y * 5) % 5) * 0.08;
                        this.dummy.scale.set(bs, bs, bs);
                        this.dummy.updateMatrix();
                        this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                        setCol(this.bushMesh, bushCount, bushShade);
                        bushCount++;
                        this.dummy.scale.set(1, 1, 1);
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Verdant Meadow Grass (feat 26: GRASS)
                if (feat === 26) {
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        const meadowDapple = 0.92 + 0.08 * Math.sin(x * 0.42 + y * 0.27);
                        grassShade.multiplyScalar(meadowDapple);
                        const nN = effFeat(x, y - 1), nS = effFeat(x, y + 1), nE = effFeat(x + 1, y), nW = effFeat(x - 1, y);
                        const hasVerge = (nN === 1 || nS === 1 || nE === 1 || nW === 1 || nN === 27 || nS === 27 || nE === 27 || nW === 27);
                        if (hasVerge) {
                            grassShade.setRGB(grassShade.r * 1.07, grassShade.g * 0.91, grassShade.b * 0.82);
                        }
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        setCol(this.grassMesh, grassCount, grassShade);
                        grassCount++;
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Packed Dirt Road / Trail (feat 27: DIRT)
                if (feat === 27) {
                    if (dirtCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const dirtShade = this.computeTileShade(this._scratchDirtColor, this.getBaseColour(27, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.dirtMesh.setMatrixAt(dirtCount, this.dummy.matrix);
                        setCol(this.dirtMesh, dirtCount, dirtShade);
                        dirtCount++;
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Shallow Sparkling Water (feat 28: SHALLOW_WATER, feat 84: STREAM)
                if (feat === 28 || feat === 84) {
                    emitLiquidBedAndShore();
                    if (waterCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.08, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const waterShade = this.computeTileShade(this._scratchWaterColor, this.getBaseColour(28, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.waterMesh.setMatrixAt(waterCount, this.dummy.matrix);
                        setCol(this.waterMesh, waterCount, waterShade);
                        waterCount++;
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Deep Oceanic Water (feat 29: DEEP_WATER, feat 80: LAKE)
                if (feat === 29 || feat === 80) {
                    emitLiquidBedAndShore();
                    if (deepWaterCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.12, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const deepWaterShade = this.computeTileShade(this._scratchDeepWaterColor, this.getBaseColour(29, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.deepWaterMesh.setMatrixAt(deepWaterCount, this.dummy.matrix);
                        setCol(this.deepWaterMesh, deepWaterCount, deepWaterShade);
                        deepWaterCount++;
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Swamp & Wetland Marsh (feat 31: SWAMP)
                if (feat === 31) {
                    emitLiquidBedAndShore();
                    if (swampCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.06, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const swampShade = this.computeTileShade(this._scratchSwampColor, this.getBaseColour(31, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.swampMesh.setMatrixAt(swampCount, this.dummy.matrix);
                        setCol(this.swampMesh, swampCount, swampShade);
                        swampCount++;
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Molten Lava (feat 23, 82, 83)
                if (feat === 23 || feat === 82 || feat === 83) {
                    emitLiquidBedAndShore(true);
                    this.dummy.position.set(wx, -0.13, wz);
                    this.dummy.rotation.set(0, floorRot, 0);
                    this.dummy.updateMatrix();
                    if (inView && feat !== 83) {
                        this.lavaMesh.setMatrixAt(lavaCount++, this.dummy.matrix);
                    } else {
                        this.lavaCooledMesh.setMatrixAt(lavaCooledCount++, this.dummy.matrix);
                    }
                    emitIndoorCeiling(tileCeilH);
                    continue;
                }

                // Stairs Up (feat 5 '<') & Sunken Stairs Down (feat 6 '>')
                if (feat === 5 || feat === 6) {
                    const stairYaw = this.determineStairOrientation(map, x, y, w, h);
                    if (feat === 5) {
                        if (floorCount < floorCap) {
                            this.dummy.position.set(wx, -0.05, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.updateMatrix();
                            this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                            setCol(this.floorMesh, floorCount, floorShade);
                            floorCount++;
                        }
                        this.dummy.position.set(wx, 0, wz);
                        this.dummy.rotation.set(0, stairYaw, 0);
                        this.dummy.updateMatrix();
                        const stairOccupied = (px === x && py === y) || camDistSq < 1.1025;
                        if (stairOccupied && this.stairsUpOccupiedMesh && stairsUpOccCount < 64) {
                            this.stairsUpOccupiedMesh.setMatrixAt(stairsUpOccCount, this.dummy.matrix);
                            setCol(this.stairsUpOccupiedMesh, stairsUpOccCount, floorShade);
                            stairsUpOccCount++;
                        } else {
                            this.stairsUpMesh.setMatrixAt(stairsUpCount, this.dummy.matrix);
                            setCol(this.stairsUpMesh, stairsUpCount, floorShade);
                            stairsUpCount++;
                        }

                        if (!outdoors) {
                            const shaftTop = Math.max(tileCeilH, maxNeighborCeil) + 1.25;
                            const shaftBot = Math.min(tileCeilH, this.wallHeight) - 0.03;
                            const shaftSpan = shaftTop - shaftBot;
                            const rims = [
                                { ox: 0, oz: -0.81, sx: 1.02, sz: 0.21 },
                                { ox: 0, oz: 0.81, sx: 1.02, sz: 0.21 },
                                { ox: -0.81, oz: 0, sx: 0.21, sz: 1.02 },
                                { ox: 0.81, oz: 0, sx: 0.21, sz: 1.02 }
                            ];
                            for (let ri = 0; ri < 4 && wallCount < wallCap; ri++) {
                                const rm = rims[ri];
                                this.dummy.position.set(wx + rm.ox, (shaftBot + shaftTop) * 0.5, wz + rm.oz);
                                this.dummy.rotation.set(0, 0, 0);
                                this.dummy.scale.set(rm.sx, shaftSpan / 3.05, rm.sz);
                                this.dummy.updateMatrix();
                                this.wallMesh.setMatrixAt(wallCount, this.dummy.matrix);
                                if (tac) tac.setCornerBevelAt(this.wallMesh, wallCount, 0, 0, 0, 0);
                                setCol(this.wallMesh, wallCount, wallShade);
                                wallCount++;
                                if (ceilingCount < ceilCap) {
                                    this.dummy.position.set(wx + rm.ox, tileCeilH, wz + rm.oz);
                                    this.dummy.rotation.set(0, 0, 0);
                                    this.dummy.scale.set(rm.sx, 1, rm.sz);
                                    this.dummy.updateMatrix();
                                    this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                                    setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                                    ceilingCount++;
                                }
                                if (tileCeilH < maxNeighborCeil - 0.05 && ceilingCount < ceilCap) {
                                    this.dummy.position.set(wx + rm.ox, maxNeighborCeil, wz + rm.oz);
                                    this.dummy.rotation.set(0, 0, 0);
                                    this.dummy.scale.set(rm.sx, 1, rm.sz);
                                    this.dummy.updateMatrix();
                                    this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                                    setCol(this.ceilingMesh, ceilingCount, ceilingShade);
                                    ceilingCount++;
                                }
                            }
                            this.dummy.scale.set(1, 1, 1);
                            if (ceilingCount < ceilCap) {
                                this.dummy.position.set(wx, shaftTop - 0.04, wz);
                                this.dummy.rotation.set(0, 0, 0);
                                this.dummy.updateMatrix();
                                const shaftDark = this._scratchShaftCapCol || (this._scratchShaftCapCol = new THREE.Color());
                                shaftDark.setRGB(ceilingShade.r * 0.18, ceilingShade.g * 0.18, ceilingShade.b * 0.22);
                                this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                                setCol(this.ceilingMesh, ceilingCount, shaftDark);
                                ceilingCount++;
                            }
                            if (tac && tac.emitUnexploredFrontierPortals) {
                                tac.emitUnexploredFrontierPortals(this, map, w, h, x, y, tileCeilH, floorShade, setCol, trimCounts);
                            }
                        }
                    } else {
                        // Sunken Descending Stairwell (feat === 6): NO floorMesh over y=0 stairwell opening; seal sub-pit landing at y=-1.96m!
                        if (!outdoors && floorCount < floorCap) {
                            this.dummy.position.set(wx, -1.96, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.updateMatrix();
                            const pitDark = this._scratchShaftCapCol || (this._scratchShaftCapCol = new THREE.Color());
                            pitDark.setRGB(floorShade.r * 0.12, floorShade.g * 0.12, floorShade.b * 0.15);
                            this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                            setCol(this.floorMesh, floorCount, pitDark);
                            floorCount++;
                        }
                        this.dummy.position.set(wx, 0, wz);
                        this.dummy.rotation.set(0, stairYaw, 0);
                        this.dummy.updateMatrix();
                        this.stairsMesh.setMatrixAt(stairsCount, this.dummy.matrix);
                        setCol(this.stairsMesh, stairsCount, floorShade);
                        stairsCount++;
                        emitIndoorCeiling(tileCeilH);
                    }
                    this._stairCompassPositions.push({ x, y, dir: feat === 5 ? 'up' : 'down' });
                    if (this.realm === 'silq' && (tileAttr === 3 || tileAttr === 11 || tileAttr === 15) && this.shaftRimMesh && shaftRimCount < 32) {
                        this.dummy.position.set(wx, 0.03, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.scale.set(1, 1, 1);
                        this.dummy.updateMatrix();
                        this.shaftRimMesh.setMatrixAt(shaftRimCount, this.dummy.matrix);
                        const shaftCol = this._scratchShaftRimCol || (this._scratchShaftRimCol = new THREE.Color(0xfbbf24));
                        shaftCol.setHex(0xfbbf24);
                        if (!outdoors && !inView) shaftCol.multiplyScalar(0.45);
                        setCol(this.shaftRimMesh, shaftRimCount, shaftCol);
                        shaftRimCount++;
                    }
                    continue;
                }

                // Impassable Rubble Piles (feat 16)
                if (feat === 16) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    setCol(this.floorMesh, floorCount, floorShade);
                    floorCount++;

                    this.dummy.position.set(wx, 0, wz);
                    const rubbleYaw = ((x * 37 + y * 59) % 4) * (Math.PI / 2);
                    this.dummy.rotation.set(0, rubbleYaw, 0);
                    this.dummy.updateMatrix();
                    this.rubbleMesh.setMatrixAt(rubbleCount, this.dummy.matrix);
                    setCol(this.rubbleMesh, rubbleCount, wallShade);
                    rubbleCount++;

                    emitIndoorCeiling(tileCeilH);
                    continue;
                }
            }
        }
        if (!outdoors && this.wallTorchMesh && Array.isArray(this._activeWallSconces)) {
            const pureW = this._sanctuaryPureWhite || (this._sanctuaryPureWhite = new THREE.Color(1, 1, 1));
            const sconceShade = this._scratchWallColor;
            for (let si = 0; si < this._activeWallSconces.length && wallTorchCount < 128; si++) {
                const sc = this._activeWallSconces[si];
                tileIdx = sc.tileIdx;
                sconceShade.copy(biome.wallColor);
                this.dummy.position.set(sc.mountX, 1.82, sc.mountZ);
                this.dummy.rotation.set(0, sc.yaw, 0);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                this.wallTorchMesh.setMatrixAt(wallTorchCount, this.dummy.matrix);
                setCol(this.wallTorchMesh, wallTorchCount, sconceShade);
                if (this.wallTorchFlameMesh) {
                    this.wallTorchFlameMesh.setMatrixAt(wallTorchCount, this.dummy.matrix);
                    setCol(this.wallTorchFlameMesh, wallTorchCount, pureW);
                }
                wallTorchCount++;
            }
        }
        if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.syncSconceHalos === 'function') {
            window.Dungeon3DAtmosphere.syncSconceHalos(this, this._activeWallSconces, outdoors);
        }
        this._rawLitShadeMode = false;

        const rangeCompat = (typeof window !== 'undefined' && window.Dungeon3DCompat) || null;
        const setAttrRange = (attr, count) => {
            if (rangeCompat) rangeCompat.setAttrUpdateRange(attr, 0, count);
            else if (attr && attr.updateRange) { attr.updateRange.offset = 0; attr.updateRange.count = count; }
        };
        const updateMesh = (mesh, newCount) => {
            const oldCount = mesh.count;
            mesh.count = newCount;
            if (newCount > 0 || oldCount > 0) {
                setAttrRange(mesh.instanceMatrix, newCount * 16);
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) {
                    setAttrRange(mesh.instanceColor, newCount * 3);
                    mesh.instanceColor.needsUpdate = true;
                }
                const bevAttr = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.aCornerBevel;
                if (bevAttr && bevAttr.isInstancedBufferAttribute) {
                    setAttrRange(bevAttr, newCount * 4);
                    bevAttr.needsUpdate = true;
                }
            }
        };

        updateMesh(this.wallMesh, wallCount);
        if (this.upperWallMesh) updateMesh(this.upperWallMesh, upperWallCount);
        updateMesh(this.permWallMesh, permWallCount);
        if (this.upperPermWallMesh) updateMesh(this.upperPermWallMesh, upperPermWallCount);
        updateMesh(this.floorMesh, floorCount);
        updateMesh(this.ceilingMesh, ceilingCount);
        updateMesh(this.doorFrameMesh, doorFrameCount);
        if (this.shopStoneMesh) updateMesh(this.shopStoneMesh, shopStoneCount);
        if (this.shopStoneOccupiedMesh) updateMesh(this.shopStoneOccupiedMesh, shopStoneOccCount);
        updateMesh(this.shopFrameMesh, shopFrameCount);
        if (this.shopAwningMesh) updateMesh(this.shopAwningMesh, shopAwningCount);
        if (this.townTimberMesh) updateMesh(this.townTimberMesh, townTimberCount);
        if (this.townTimberPostMesh) updateMesh(this.townTimberPostMesh, townTimberPostCount);
        if (this.townRoofMesh) updateMesh(this.townRoofMesh, townRoofCount);
        updateMesh(this.rubbleMesh, rubbleCount);
        updateMesh(this.doorMesh, doorCount);
        updateMesh(this.doorOpenMesh, doorOpenCount);
        updateMesh(this.doorBrokenMesh, doorBrokenCount);
        if (this.doorLockMesh) updateMesh(this.doorLockMesh, doorLockCount);
        if (this.specialShopDoorMesh) updateMesh(this.specialShopDoorMesh, specialShopDoorCount);
        for (let i = 0; i < 8; i++) updateMesh(this.shopMeshes[i], shopCounts[i]);
        updateMesh(this.magmaMesh, veinCounts.magma);
        updateMesh(this.quartzMesh, veinCounts.quartz);
        updateMesh(this.goldVeinMesh, veinCounts.gold);
        updateMesh(this.gemVeinMesh, veinCounts.gem);
        updateMesh(this.treeTrunkMesh, treeTrunkCount);
        updateMesh(this.treeLeavesMesh, treeLeavesCount);
        updateMesh(this.bushMesh, bushCount);
        updateMesh(this.grassMesh, grassCount);
        updateMesh(this.dirtMesh, dirtCount);
        updateMesh(this.waterMesh, waterCount);
        updateMesh(this.deepWaterMesh, deepWaterCount);
        updateMesh(this.mountainMesh, mountainCount);
        updateMesh(this.swampMesh, swampCount);
        updateMesh(this.stairsMesh, stairsCount);
        updateMesh(this.stairsUpMesh, stairsUpCount);
        if (this.stairsUpOccupiedMesh) updateMesh(this.stairsUpOccupiedMesh, stairsUpOccCount);
        if (this.shaftRimMesh) updateMesh(this.shaftRimMesh, shaftRimCount);
        updateMesh(this.altarMesh, altarCount);
        if (this.altarOccupiedMesh) updateMesh(this.altarOccupiedMesh, altarOccCount);
        if (this.altarBrassMesh) updateMesh(this.altarBrassMesh, altarCount);
        if (this.altarFlameMesh) updateMesh(this.altarFlameMesh, altarCount);
        if (this.forgeMesh) updateMesh(this.forgeMesh, forgeCount);
        updateMesh(this.fountainMesh, fountainCount);
        if (this.fountainOccupiedMesh) updateMesh(this.fountainOccupiedMesh, fountainOccCount);
        if (this.fountainBrassMesh) updateMesh(this.fountainBrassMesh, fountainCount);
        if (this.fountainWaterMesh) updateMesh(this.fountainWaterMesh, fountainCount);
        updateMesh(this.trapMesh, trapCount);
        if (this.trapPitMesh) updateMesh(this.trapPitMesh, trapPitCount);
        if (this.trapRuneMesh) updateMesh(this.trapRuneMesh, trapRuneCount);
        if (this.webMesh) updateMesh(this.webMesh, webCount);
        if (this.runeMesh) updateMesh(this.runeMesh, runeCount);
        if (this.wallTorchMesh) updateMesh(this.wallTorchMesh, wallTorchCount);
        if (this.wallTorchFlameMesh) updateMesh(this.wallTorchFlameMesh, wallTorchCount);
        if (this.waterBankMesh) updateMesh(this.waterBankMesh, waterBankCount);
        if (this.chasmMesh) updateMesh(this.chasmMesh, chasmIdx);
        if (this.wallPlinthMesh) updateMesh(this.wallPlinthMesh, trimCounts.plinth);
        if (this.wallCorniceMesh) updateMesh(this.wallCorniceMesh, trimCounts.cornice);
        if (this.darkPortalMesh) updateMesh(this.darkPortalMesh, trimCounts.portal);
        if (this.chasmVoidMesh) {
            const oldChasmVoid = this.chasmVoidMesh.count;
            this.chasmVoidMesh.count = chasmVoidIdx;
            if (chasmVoidIdx > 0 || oldChasmVoid > 0) {
                setAttrRange(this.chasmVoidMesh.instanceMatrix, chasmVoidIdx * 16);
                this.chasmVoidMesh.instanceMatrix.needsUpdate = true;
            }
        }

        const oldLava = this.lavaMesh.count;
        this.lavaMesh.count = lavaCount;
        if (lavaCount > 0 || oldLava > 0) {
            setAttrRange(this.lavaMesh.instanceMatrix, lavaCount * 16);
            this.lavaMesh.instanceMatrix.needsUpdate = true;
        }

        const oldLavaCooled = this.lavaCooledMesh.count;
        this.lavaCooledMesh.count = lavaCooledCount;
        if (lavaCooledCount > 0 || oldLavaCooled > 0) {
            setAttrRange(this.lavaCooledMesh.instanceMatrix, lavaCooledCount * 16);
            this.lavaCooledMesh.instanceMatrix.needsUpdate = true;
        }

        if (typeof this._emitDungeonSetDressing === 'function') {
            this._emitDungeonSetDressing(map, w, h, minX, maxX, minY, maxY, px, py, depth, outdoors, biome);
        }
        this.updateMonsters(frame.monsters || [], frame.player);
        this.updateItems(frame.objects || frame.items || [], frame.player);
        if (typeof window !== 'undefined' && window.Dungeon3DTown && typeof window.Dungeon3DTown.buildTownArchitecture === 'function') {
            window.Dungeon3DTown.buildTownArchitecture(
                this, map, w, h, depth, this.realm,
                isSurfaceTown ? anchorX : undefined,
                isSurfaceTown ? anchorY : undefined,
                isSurfaceTown ? 55 : undefined
            );
        }
        this.updateTerrainLabels(map, w, h, depth, px, py);
        if (!this._shadersPrewarmed && this.renderer && this.scene && this.camera) {
            this._shadersPrewarmed = true;
            if (typeof this.renderer.compileAsync === 'function') {
                try { Promise.resolve(this.renderer.compileAsync(this.scene, this.camera)).catch(() => {}); } catch (_) {}
            } else if (typeof this.renderer.compile === 'function') {
                try { this.renderer.compile(this.scene, this.camera); } catch (_) {}
            }
        }
    }

    updateTerrainLabels(map, w, h, depth, px = this.playerGridX, py = this.playerGridY) {
        if (!this.terrainLabelsGroup) return;

        if (!this._fontsReadyRebaked && typeof document !== 'undefined' && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
            this._fontsReadyRebaked = true;
            document.fonts.ready.then(() => {
                this._lastTerrainLabelsSig = null;
                if (this.lastFrame && this.lastFrame.map) {
                    const lm = this.lastFrame.map;
                    this.updateTerrainLabels(lm, lm.w, lm.h, lm.depth ?? (this.lastFrame.player ? this.lastFrame.player.depth : 0), this.playerGridX, this.playerGridY);
                }
            }).catch(() => {});
        }

        const outdoors = depth === 0;
        const rLow = String(this.realm || 'angband').toLowerCase();
        const isHengOrFcb = (rLow === 'hengband' || rLow === 'frogcomposband');
        const isCartridgeTown = (rLow === 'dcss' || rLow === 'brogue' || rLow === 'rogue' || rLow === 'ryod' || rLow === 'nethack');
        const storeNames = [
            isCartridgeTown ? 'Quartermaster Hall' : 'General Store',
            'Armoury',
            'Weapon Smiths',
            (isHengOrFcb || isCartridgeTown) ? 'Temple' : 'Bookseller',
            'Alchemy Shop',
            'Magic Shop',
            'Black Market',
            'Home'
        ];
        const specialStoreNames = {
            32: isHengOrFcb ? 'Castle & Guild Hall' : 'Town Hall',
            33: 'Inn & Tavern',
            34: isHengOrFcb ? 'Healer Sanctuary' : 'Fighters Guild',
            35: isHengOrFcb ? 'Museum' : 'Arcane Tower',
            36: isHengOrFcb ? 'Arena & Casino' : 'Grand Cathedral',
            37: 'Thieves Guild',
            38: isHengOrFcb ? 'Mystic Pagoda' : 'Rangers Lodge',
            39: isHengOrFcb ? 'Bookstore' : 'Bounty Office',
            40: isHengOrFcb ? 'Beastmaster Stables' : 'Gladiator Arena'
        };

        if (this._lastTerrainLabelsDepth !== depth) {
            this._lastTerrainLabelsDepth = depth;
            if (this._terrainLabelSprites) {
                for (const sprite of this._terrainLabelSprites.values()) {
                    if (sprite.parent) sprite.parent.remove(sprite);
                    if (sprite._ownedSignTexture) sprite._ownedSignTexture.dispose();
                    if (sprite._ownedSignMaterial) sprite._ownedSignMaterial.dispose();
                    if (sprite._ownedWayfinderTexture) sprite._ownedWayfinderTexture.dispose();
                    if (sprite._wayfinderMat) sprite._wayfinderMat.dispose();
                    if (sprite.material) {
                        if (sprite.material.map) sprite.material.map.dispose();
                        sprite.material.dispose();
                    }
                }
                this._terrainLabelSprites.clear();
            }
            this._lastTerrainLabelsSig = null;
        }

        const anchorLabelKey = outdoors ? (w > 90 ? `${this._terrainAnchorX ?? px}:${this._terrainAnchorY ?? py}` : 'town') : `${this._terrainAnchorX ?? px}:${this._terrainAnchorY ?? py}`;
        const labelSig = `${this._lastTerrainSig || ''}:${depth}:${anchorLabelKey}:${this.realm || 'angband'}`;
        if (this._lastTerrainLabelsSig === labelSig) return;
        this._lastTerrainLabelsSig = labelSig;

        this._terrainLabelSprites = this._terrainLabelSprites || new Map();

        const storePositions = new Map();
        const stairsList = [];

        const labelRange = (outdoors && w <= 90) ? 64 : 32;
        const labelCx = outdoors ? px : (this._terrainAnchorX ?? px);
        const labelCy = outdoors ? py : (this._terrainAnchorY ?? py);
        const lMinY = Math.max(0, labelCy - labelRange);
        const lMaxY = Math.min(h - 1, labelCy + labelRange);
        const lMinX = Math.max(0, labelCx - labelRange);
        const lMaxX = Math.min(w - 1, labelCx + labelRange);

        for (let y = lMinY; y <= lMaxY; y++) {
            for (let x = lMinX; x <= lMaxX; x++) {
                const flag = this.getFlagAt(map, x, y);
                const known = outdoors || (flag & 0x1) !== 0;
                const inView = outdoors || (flag & 0x2) !== 0;
                let feat = this.getFeatAt(map, x, y);
                let glyph = this.getGlyphAt(map, x, y);
                let tileAttr = this.getAttrAt(map, x, y);
                const mem = (!outdoors && !inView && feat === 0 && this.getRememberedTile) ? this.getRememberedTile(x, y) : null;
                if (mem) {
                    feat = mem.feat;
                    glyph = mem.glyph;
                    tileAttr = mem.attr;
                }
                // STRICT FOG OF WAR: Never leak undiscovered space!
                if ((!known && !inView && !mem) || feat === 0) continue;

                if (this.realm === 'frogcomposband' && glyph === '#' && (tileAttr === 2 || tileAttr === 8 || tileAttr === 9 || feat === 41)) {
                    feat = 41;
                } else if (!outdoors && (glyph === ':' || glyph === ' ') && feat === 32) {
                    feat = 41;
                }

                const isSilQForge = (feat === 60 || (this.realm === 'silq' && glyph === '0'));
                if (((feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40 && !isSilQForge)) && outdoors) {
                    if (!storePositions.has(feat)) {
                        storePositions.set(feat, []);
                    }
                    storePositions.get(feat).push({ x: x * this.cellSize, z: y * this.cellSize });
                } else if (feat === 5) {
                    if (px === x && py === y) continue;
                    const sYaw = this.determineStairOrientation(map, x, y, w, h);
                    const upText = depth === 1 ? '[<] Up to Town' : `[<] Up to ${(depth - 1) * 50}ft`;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize + Math.sin(sYaw) * 0.94, y: 1.18, z: y * this.cellSize + Math.cos(sYaw) * 0.94, name: upText });
                } else if (feat === 6) {
                    if (px === x && py === y) continue;
                    const sYaw = this.determineStairOrientation(map, x, y, w, h);
                    const downText = depth === 0 ? "[>] Down to Dungeon (50')" : `[>] Down to ${(depth + 1) * 50}ft`;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize + Math.sin(sYaw) * 0.42, y: 0.92, z: y * this.cellSize + Math.cos(sYaw) * 0.42, name: downText });
                } else if (isSilQForge) {
                    if (px === x && py === y) continue;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize, y: 1.45, z: y * this.cellSize, name: '[0] Dwarven Forge', color: '#ffaa33' });
                } else if (feat === 43 && glyph !== '^') {
                    if (px === x && py === y) continue;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize, y: 1.68, z: y * this.cellSize, name: '[_] High Altar', color: '#ffd866' });
                } else if (feat === 44 && glyph !== '^') {
                    if (px === x && py === y) continue;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize, y: 1.68, z: y * this.cellSize, name: '[{] Magic Fountain', color: '#66ddff' });
                }
            }
        }

        const storeSubtitles = [
            'PROVISIONS & LANTERNS',
            'ROYAL ARMOURERS',
            'MASTER BLADESMITHS',
            (isHengOrFcb || isCartridgeTown) ? 'DIVINE SANCTUARY' : 'HOLY & ARCANE TOMES',
            'ALCHEMICAL APOTHECARY',
            'SORCEROUS RELICS',
            'SHADOW SYNDICATE',
            'HERO\'S SANCTUARY'
        ];
        const storeIcons = ['⚖', '🛡', '⚔', (isHengOrFcb || isCartridgeTown) ? '⛩' : '📖', '⚗', '🔮', '🗝', '🏠'];

        const createCaption = (text, pos, colorHex, isStore = false, storeIdx = 0, subOverride = '', iconOverride = '') => {
            const canvas = document.createElement('canvas');
            canvas.width = isStore ? 1024 : 512;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (isStore) {
                ctx.save();
                // Illuminated Medieval Carved-Oak & Brass Guild Lintel Signboard (1024x128 = exact 8:1 aspect ratio)
                const w = 1004, h = 116, x0 = 10, y0 = 6;

                // Weathered dark oak plaque background
                const woodGrad = ctx.createLinearGradient(0, y0, 0, y0 + h);
                woodGrad.addColorStop(0, '#2c1c11');
                woodGrad.addColorStop(0.5, '#1d120a');
                woodGrad.addColorStop(1, '#120b06');
                ctx.fillStyle = woodGrad;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 10);
                else ctx.rect(x0, y0, w, h);
                ctx.fill();

                // Subtle horizontal oak grain lines
                ctx.strokeStyle = 'rgba(255, 210, 145, 0.06)';
                ctx.lineWidth = 1.5;
                for (let gy = y0 + 16; gy < y0 + h - 12; gy += 16) {
                    ctx.beginPath();
                    ctx.moveTo(x0 + 14, gy);
                    ctx.lineTo(x0 + w - 14, gy);
                    ctx.stroke();
                }

                // Outer burnished brass border & inner filigree frame
                ctx.strokeStyle = '#c89b3c';
                ctx.lineWidth = 4;
                ctx.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
                ctx.strokeStyle = colorHex || '#f3d078';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);

                // 4 corner brass rivets
                ctx.fillStyle = '#e5b85c';
                for (const [rx, ry] of [[x0 + 16, y0 + 16], [x0 + w - 16, y0 + 16], [x0 + 16, y0 + h - 16], [x0 + w - 16, y0 + h - 16]]) {
                    ctx.beginPath();
                    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Guild crest medallion on left
                const cx = x0 + 60, cy = y0 + h / 2;
                ctx.fillStyle = '#150d08';
                ctx.beginPath();
                ctx.arc(cx, cy, 40, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = colorHex || '#e5b85c';
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.font = '38px "Segoe UI Symbol", "Noto Sans Symbols", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = colorHex || '#ffd866';
                ctx.fillText(iconOverride || storeIcons[storeIdx] || '⚜', cx, cy + 2);

                // Main Shop Title (crisp single-line serif centered right of crest)
                ctx.font = '700 44px "Cinzel", "Georgia", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.96)';
                ctx.lineWidth = 6;
                ctx.strokeText(text, 558, y0 + 42, 810);
                ctx.fillStyle = '#fff9e6';
                ctx.fillText(text, 558, y0 + 42, 810);

                // Guild Subtitle
                const sub = subOverride || storeSubtitles[storeIdx] || 'MERCHANT GUILD';
                ctx.font = '600 22px "Cinzel", "Georgia", serif';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.88)';
                ctx.lineWidth = 4;
                ctx.strokeText(sub, 558, y0 + 88, 810);
                ctx.fillStyle = colorHex || '#ffd873';
                ctx.fillText(sub, 558, y0 + 88, 810);
                ctx.restore();
            } else {
                // High-legibility Dungeon Landmark Pill (512x128 @ 40px bold, 3px outline)
                ctx.font = '700 40px "Cinzel", "Noto Sans JP", "Yu Gothic", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
                ctx.lineWidth = 3;
                ctx.strokeText(text, 256, 64, 480);

                ctx.fillStyle = colorHex || '#f8fafc';
                ctx.fillText(text, 256, 64, 480);
            }

            const tex = new THREE.CanvasTexture(canvas);
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (this.renderer && this.renderer.capabilities && typeof this.renderer.capabilities.getMaxAnisotropy === 'function') {
                const anisoCap = (this.renderBudget && this.renderBudget.anisotropy) || 4;
                tex.anisotropy = Math.min(anisoCap, Math.max(1, this.renderer.capabilities.getMaxAnisotropy()));
            }
            if (typeof THREE.SRGBColorSpace !== 'undefined') tex.colorSpace = THREE.SRGBColorSpace;
            else if (typeof THREE.sRGBEncoding !== 'undefined') tex.encoding = THREE.sRGBEncoding;
            if (isStore) {
                const signGroup = new THREE.Group();
                signGroup.position.set(pos.x, 0, pos.z);
                signGroup.rotation.set(0, pos.yaw || 0, 0);
                signGroup.maxDist = 90.0;

                if (!this._storeSignSharedGeos) {
                    const fasciaBackGeo = new THREE.BoxGeometry(2.14, 0.28, 0.028);
                    fasciaBackGeo._sharedGeometry = true;
                    const fasciaTrimGeo = new THREE.BoxGeometry(2.20, 0.32, 0.034);
                    fasciaTrimGeo._sharedGeometry = true;
                    const fasciaFaceGeo = new THREE.PlaneGeometry(2.08, 0.26);
                    fasciaFaceGeo._sharedGeometry = true;
                    const woodMat = new THREE.MeshStandardMaterial({ color: 0x26170c, roughness: 0.82, metalness: 0.12 });
                    woodMat._sharedMaterial = true;
                    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc89b3c, roughness: 0.38, metalness: 0.82 });
                    brassMat._sharedMaterial = true;
                    this._storeSignSharedGeos = {
                        fasciaBackGeo, fasciaTrimGeo, fasciaFaceGeo,
                        woodMat, brassMat
                    };
                }
                const {
                    fasciaBackGeo, fasciaTrimGeo, fasciaFaceGeo,
                    woodMat, brassMat
                } = this._storeSignSharedGeos;
                const signFaceMat = new THREE.MeshStandardMaterial({
                    map: tex,
                    color: 0xfff8eb,
                    emissive: 0xffdf9e,
                    emissiveMap: tex,
                    emissiveIntensity: 0.88,
                    roughness: 0.52,
                    transparent: true,
                    depthTest: true,
                    depthWrite: true
                });
                signGroup._ownedSignMaterial = signFaceMat;
                signGroup._ownedSignTexture = tex;

                // 1. Flush Front Lintel Guild Plaque (strictly y=2.49..2.81m below y=2.83m roof soffit & above y<=2.46m awning)
                const fasciaMount = new THREE.Group();
                fasciaMount.name = 'StorefrontFasciaSign';
                fasciaMount.position.set(0, 2.65, 1.045);
                fasciaMount.rotation.x = 0.02;
                const fasciaTrim = new THREE.Mesh(fasciaTrimGeo, brassMat);
                const fasciaBack = new THREE.Mesh(fasciaBackGeo, woodMat);
                fasciaBack.position.set(0, 0, 0.008);
                const fasciaFace = new THREE.Mesh(fasciaFaceGeo, signFaceMat);
                fasciaFace.position.set(0, 0, 0.024);
                fasciaMount.add(fasciaTrim, fasciaBack, fasciaFace);

                // 2. Always-Visible Box-Free Overhead Floating Store Text (above roof ridges & chimneys; scales with distance)
                const wfCanvas = document.createElement('canvas');
                wfCanvas.width = 1024;
                wfCanvas.height = 192;
                const wfCtx = wfCanvas.getContext('2d');
                wfCtx.clearRect(0, 0, 1024, 192);
                wfCtx.font = '800 84px "Cinzel", "Outfit", "Segoe UI", sans-serif';
                wfCtx.textAlign = 'center';
                wfCtx.textBaseline = 'middle';
                wfCtx.lineJoin = 'round';
                wfCtx.miterLimit = 2;
                wfCtx.shadowColor = 'rgba(0, 0, 0, 0.96)';
                wfCtx.shadowBlur = 16;
                wfCtx.shadowOffsetY = 3;
                wfCtx.strokeStyle = 'rgba(3, 5, 10, 0.98)';
                wfCtx.lineWidth = 18;
                wfCtx.strokeText(text, 512, 98, 980);
                wfCtx.shadowBlur = 0;
                wfCtx.shadowOffsetY = 0;
                wfCtx.strokeStyle = '#05070d';
                wfCtx.lineWidth = 11;
                wfCtx.strokeText(text, 512, 98, 980);
                wfCtx.strokeStyle = colorHex || '#f5d77f';
                wfCtx.lineWidth = 3.5;
                wfCtx.strokeText(text, 512, 98, 980);
                wfCtx.fillStyle = '#fffdf5';
                wfCtx.fillText(text, 512, 98, 980);

                const wfTex = new THREE.CanvasTexture(wfCanvas);
                wfTex.generateMipmaps = true;
                wfTex.minFilter = THREE.LinearMipmapLinearFilter;
                wfTex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities && typeof this.renderer.capabilities.getMaxAnisotropy === 'function') {
                    const anisoCap = (this.renderBudget && this.renderBudget.anisotropy) || 4;
                    wfTex.anisotropy = Math.min(anisoCap, Math.max(1, this.renderer.capabilities.getMaxAnisotropy()));
                }
                if (typeof THREE.SRGBColorSpace !== 'undefined') wfTex.colorSpace = THREE.SRGBColorSpace;
                else if (typeof THREE.sRGBEncoding !== 'undefined') wfTex.encoding = THREE.sRGBEncoding;

                const wfMat = new THREE.SpriteMaterial({
                    map: wfTex,
                    color: 0xffffff,
                    transparent: true,
                    depthTest: true,
                    depthWrite: false,
                    fog: false,
                    opacity: 1.0
                });
                const wfSprite = new THREE.Sprite(wfMat);
                wfSprite.name = 'StorefrontFloatingLabel';
                wfSprite.userData = { isFloatingStoreText: true };
                wfSprite.position.set(0, 4.65, 0.55);
                wfSprite.scale.set(3.8, 3.8 * 0.1875, 1.0);
                wfSprite.visible = true;
                signGroup._wayfinderSprite = wfSprite;
                signGroup._wayfinderMat = wfMat;
                signGroup._ownedWayfinderTexture = wfTex;

                signGroup.add(fasciaMount, wfSprite);
                return signGroup;
            }
            // depthTest = true so buildings, walls, and pillars properly occlude labels
            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(1.45, 0.36, 1.0);
            sprite.position.set(pos.x, pos.y, pos.z);
            sprite.maxDist = 25.0; // Distance culling threshold
            return sprite;
        };

        const activeLabelKeys = new Set();

        // Populate 3D Storefront Lanterns & Merchant Display Wares in Town
        if (!this.storefrontPropsGroup && this.scene) {
            this.storefrontPropsGroup = new THREE.Group();
            this.storefrontPropsGroup.name = 'StorefrontPropsGroup';
            this.scene.add(this.storefrontPropsGroup);
        }
        const storeDisplayWares = [
            ['ph_chest', 'ph_lantern'],
            ['item_plate_armor', 'ph_shield'],
            ['item_anvil', 'item_greatsword'],
            ['ph_book', 'item_shrine_candles'],
            ['ph_potion_urn', 'ph_potion_bottle'],
            ['item_shrine_candles', 'item_wand'],
            ['ph_chest', 'item_gold'],
            ['ph_goblet', 'ph_book']
        ];

        const specialStoreSubtitles = {
            32: 'BOUNTIES & QUESTS',
            33: 'HEARTH & REST',
            34: isHengOrFcb ? 'SACRED HEALING' : 'WARRIOR DISCIPLINE',
            35: isHengOrFcb ? 'RELICS & LORE HALL' : 'ARCANE STUDIES',
            36: isHengOrFcb ? 'CHAMPIONS ARENA' : 'SACRED SANCTUARY',
            37: 'SHADOW SYNDICATE',
            38: isHengOrFcb ? 'MYSTIC SANCTUM' : 'WILDS & LORE',
            39: isHengOrFcb ? 'SPELLBOOKS & MANUALS' : 'BOUNTIES & QUESTS',
            40: isHengOrFcb ? 'BEAST STABLES' : 'CHAMPIONS ARENA'
        };
        const specialStoreIcons = {
            32: '👑',
            33: '🍺',
            34: '✚',
            35: '🏛',
            36: '⚔',
            37: '🗡',
            38: '⛩',
            39: '📖',
            40: '🐎'
        };

        const shopClusterEntries = [];
        const maxClusterDistSq = (this.cellSize * 2.2) * (this.cellSize * 2.2);
        for (const [feat, points] of storePositions.entries()) {
            const isSpecialBuilding = feat >= 32;
            const storeIdx = isSpecialBuilding ? ((feat - 32) % 8) : (feat - 7);
            const storeNum = isSpecialBuilding ? (feat - 31) : (storeIdx + 1);
            const storeName = isSpecialBuilding ? (specialStoreNames[feat] || 'Guild Hall') : (storeNames[storeIdx] || `Store ${storeNum}`);
            const subOverride = isSpecialBuilding ? (specialStoreSubtitles[feat] || '') : '';
            const iconOverride = isSpecialBuilding ? (specialStoreIcons[feat] || '') : '';
            const col = getStoreColorHex(storeIdx + 1);

            const clusters = [];
            for (const pt of points) {
                let matched = null;
                for (const cl of clusters) {
                    for (const existing of cl) {
                        const cdx = pt.x - existing.x, cdz = pt.z - existing.z;
                        if (cdx * cdx + cdz * cdz <= maxClusterDistSq) { matched = cl; break; }
                    }
                    if (matched) break;
                }
                if (matched) matched.push(pt);
                else clusters.push([pt]);
            }
            for (const cl of clusters) {
                const anchorPt = cl[Math.floor(cl.length / 2)];
                const avgX = anchorPt.x;
                const avgZ = anchorPt.z;
                const gx = Math.round(avgX / this.cellSize);
                const gy = Math.round(avgZ / this.cellSize);
                const rawG = (this.getGlyphAt(map, gx, gy) || '').trim();
                const badge = isSpecialBuilding ? (rawG || '+') : String(storeNum);
                const labelText = `[${badge}] ${storeName}`;
                const doorYaw = this.determineShopDoorOrientation(map, gx, gy, w, h);
                shopClusterEntries.push({ feat, storeIdx, labelText, col, avgX, avgZ, gx, gy, doorYaw, subOverride, iconOverride });
            }
        }

        const storefrontSig = outdoors
            ? `${depth}:${this.realm || 'angband'}:${shopClusterEntries.map(c => `${c.feat}@${c.gx},${c.gy},${c.doorYaw.toFixed(2)}`).join('|')}`
            : 'indoors';
        const rebuildStorefrontProps = (this._lastStorefrontPropsSig !== storefrontSig);
        if (rebuildStorefrontProps && this.storefrontPropsGroup) {
            this._lastStorefrontPropsSig = storefrontSig;
            while (this.storefrontPropsGroup.children.length > 0) {
                this.storefrontPropsGroup.remove(this.storefrontPropsGroup.children[0]);
            }
        }

        // Shop Labels & Storefront Props at Cluster Centroids
        for (const c of shopClusterEntries) {
            const key = `${c.gx},${c.gy},${c.labelText}`;
            activeLabelKeys.add(key);

            if (!this._terrainLabelSprites.has(key)) {
                const signObj = createCaption(c.labelText, { x: c.avgX, y: 2.74, z: c.avgZ, yaw: c.doorYaw }, c.col, true, c.storeIdx, c.subOverride, c.iconOverride);
                this.terrainLabelsGroup.add(signObj);
                this._terrainLabelSprites.set(key, signObj);
            }

            if (outdoors && rebuildStorefrontProps && this.storefrontPropsGroup) {
                const shopPropAnchor = new THREE.Group();
                shopPropAnchor.position.set(c.avgX, 0, c.avgZ);
                shopPropAnchor.rotation.set(0, c.doorYaw, 0);
                this.storefrontPropsGroup.add(shopPropAnchor);

                if (this.shadowGeo && this.shadowTex) {
                    if (!this._storeLightPoolMat) {
                        this._storeLightPoolMat = new THREE.MeshBasicMaterial({
                            map: this.shadowTex,
                            color: 0xffb454,
                            transparent: true,
                            opacity: 0.55,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false
                        });
                        this._storeLightPoolMat._sharedMaterial = true;
                    }
                    const lightPool = new THREE.Mesh(this.shadowGeo, this._storeLightPoolMat);
                    lightPool.position.set(0, 0.014, 0.72);
                    lightPool.scale.set(6.2, 1.0, 5.2);
                    shopPropAnchor.add(lightPool);
                }
                if (this._mountStorefrontClusterProps) {
                    this._mountStorefrontClusterProps(shopPropAnchor, c.storeIdx, storeDisplayWares);
                }
            }
        }

        // Stairs, Altar & Fountain Labels
        for (const s of stairsList) {
            const key = `${s.gridX},${s.gridY},${s.name}`;
            activeLabelKeys.add(key);

            if (!this._terrainLabelSprites.has(key)) {
                const sprite = createCaption(s.name, { x: s.x, y: s.y, z: s.z }, s.color || '#88ccff', false);
                this.terrainLabelsGroup.add(sprite);
                this._terrainLabelSprites.set(key, sprite);
            }
        }

        // Dispose and remove sprites that are no longer active in window
        for (const [key, sprite] of this._terrainLabelSprites.entries()) {
            if (!activeLabelKeys.has(key)) {
                this.terrainLabelsGroup.remove(sprite);
                if (sprite._ownedSignTexture) sprite._ownedSignTexture.dispose();
                if (sprite._ownedSignMaterial) sprite._ownedSignMaterial.dispose();
                if (sprite._ownedWayfinderTexture) sprite._ownedWayfinderTexture.dispose();
                if (sprite._wayfinderMat) sprite._wayfinderMat.dispose();
                if (sprite.material) {
                    if (sprite.material.map) sprite.material.map.dispose();
                    sprite.material.dispose();
                }
                this._terrainLabelSprites.delete(key);
            }
        }
    }

    isHengband() {
        if (this.realm === 'hengband') return true;
        if (typeof window !== 'undefined') {
            if (window.__activeRealm === 'hengband') return true;
            if (window.__app && typeof window.__app.getActiveRealm === 'function' && window.__app.getActiveRealm() === 'hengband') return true;
        }
        return false;
    }

    purgeAllSceneEntities() {
        if (this._pendingVfxTimers && this._pendingVfxTimers.size > 0) {
            for (const tid of this._pendingVfxTimers) clearTimeout(tid);
            this._pendingVfxTimers.clear();
        }
        if (this._purgeSceneVfxAndLabels) {
            this._purgeSceneVfxAndLabels();
        }
        if (this._dyingMonsters && this._dyingMonsters.length > 0) {
            for (let i = 0; i < this._dyingMonsters.length; i++) {
                const d = this._dyingMonsters[i];
                if (d && d.nameplate && d.nameplate.material && d.nameplate.material.map) {
                    d.nameplate.material.map.dispose();
                }
                this.destroyEntity(d);
            }
            this._dyingMonsters.length = 0;
        }
        if (this.nameplatePool && typeof this.nameplatePool.clear === 'function') {
            this.nameplatePool.clear();
        }
        if (this.monsters) {
            for (const entity of this.monsters.values()) {
                if (entity.nameplate && entity.nameplate.material && entity.nameplate.material.map) {
                    entity.nameplate.material.map.dispose();
                }
                this.destroyEntity(entity);
            }
            this.monsters.clear();
        }
        if (this.items) {
            for (const entity of this.items.values()) {
                this.destroyEntity(entity);
            }
            this.items.clear();
        }
    }

    createNameplateSprite(m, isTargeted, isSensedParam, existingSprite = null) {
        const reuse = Boolean(existingSprite && existingSprite._npCanvas && existingSprite._npCtx && existingSprite.material && existingSprite.material.map);
        const canvas = reuse ? existingSprite._npCanvas : document.createElement('canvas');
        if (!reuse) {
            canvas.width = 384;
            canvas.height = 110;
        }
        const ctx = reuse ? existingSprite._npCtx : canvas.getContext('2d');

        const rawRace = m.race || m.name || 'creature';
        const isHeng = this.isHengband();
        const langMode = (typeof window !== 'undefined' && window.__langMode) || 'en';
        const race = (window.getLocalizedMonsterName && isHeng)
            ? window.getLocalizedMonsterName(rawRace, 'hengband', langMode)
            : rawRace;
        const glyph = m.glyph || '?';
        const colorHex = getAngbandColorString(m.attr);
        const hp = m.hp !== undefined ? m.hp : 1;
        const hpMax = m.hp_max !== undefined ? m.hp_max : 1;
        const pct = Math.max(0, Math.min(1, hpMax > 0 ? hp / hpMax : 1));

        ctx.clearRect(0, 0, 384, 110);

        // Dark-obsidian rounded rectangle backdrop with attitude/status-coded metallic border
        const isSensed = (isSensedParam !== undefined) ? isSensedParam : !!(m.invisible || (m.detected && m.unlit));
        const isBossOrUnique = Boolean(m.unique || m.isBoss || /morgoth|sauron|ungoliant|gothmog|carcharoth|yendor|serpent of chaos|cyberdemon|cthulhu|orochi|shuten/i.test(rawRace));
        const isPetMon = Boolean(m.isPet || m.is_pet || m.pet || m.attitude === 'pet');
        const isPeacefulMon = Boolean(!isPetMon && (m.friendly || m.peaceful || m.attitude === 'friendly'));
        const hasBadgeLine = Boolean(
            m.asleep || m.unwary || m.paralyzed || m.held || m.afraid || m.confused || m.stunned ||
            m.fast || m.hasted || m.slow || m.slowed || m.summoner || m.breath || m.breathes || m.breather ||
            m._espPerceived || isTargeted || isSensed || isBossOrUnique || isPetMon || isPeacefulMon
        );
        const padX = 14;
        const padY = 4;
        const bgW = 384 - padX * 2;
        const bgH = hasBadgeLine ? 92 : 66;
        const rad = 8;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(padX, padY, bgW, bgH, rad);
        } else {
            ctx.moveTo(padX + rad, padY);
            ctx.lineTo(padX + bgW - rad, padY);
            ctx.quadraticCurveTo(padX + bgW, padY, padX + bgW, padY + rad);
            ctx.lineTo(padX + bgW, padY + bgH - rad);
            ctx.quadraticCurveTo(padX + bgW, padY + bgH, padX + bgW - rad, padY + bgH);
            ctx.lineTo(padX + rad, padY + bgH);
            ctx.quadraticCurveTo(padX, padY + bgH, padX, padY + bgH - rad);
            ctx.lineTo(padX, padY + rad);
            ctx.quadraticCurveTo(padX, padY, padX + rad, padY);
            ctx.closePath();
        }
        ctx.fillStyle = 'rgba(10, 12, 18, 0.90)';
        ctx.fill();
        ctx.strokeStyle = isTargeted ? '#ffd700' : (isPetMon ? '#4ade80' : (isPeacefulMon ? '#7dd3fc' : (isBossOrUnique ? '#f59e0b' : '#c89b3c')));
        ctx.lineWidth = isBossOrUnique ? 2.5 : 2;
        ctx.stroke();

        let curY = 6;

        // Composable Status Icon Pills (e.g. 💨 Fleeing + 😵 Confused + ⚡ Fast + 🔥 Breath + 💤 Asleep)
        if (window.Dungeon3DTactical && typeof window.Dungeon3DTactical.drawComposableStatusPills === 'function') {
            const pillH = window.Dungeon3DTactical.drawComposableStatusPills(ctx, m, curY, isTargeted, isBossOrUnique, isSensed);
            if (pillH > 0) curY += pillH;
        } else if (m.asleep) {
            ctx.font = '700 22px "Fira Code", monospace';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('💤 Zzz...', 192, curY + 20);
            ctx.fillStyle = '#a8d8ff';
            ctx.fillText('💤 Zzz...', 192, curY + 20);
            curY += 24;
        } else if (m.afraid) {
            ctx.font = '700 20px "Fira Code", monospace';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('💨 FLEEING!', 192, curY + 19);
            ctx.fillStyle = '#fbbf24';
            ctx.fillText('💨 FLEEING!', 192, curY + 19);
            curY += 23;
        } else if (isTargeted) {
            ctx.font = '900 20px "Cinzel", serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('⌖ TARGET ⌖', 192, curY + 18);
            ctx.fillStyle = '#ffd700';
            ctx.fillText('⌖ TARGET ⌖', 192, curY + 18);
            curY += 22;
        } else if (isBossOrUnique) {
            ctx.font = '900 18px "Cinzel", serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('👑 UNIQUE / BOSS', 192, curY + 18);
            ctx.fillStyle = '#fbbf24';
            ctx.fillText('👑 UNIQUE / BOSS', 192, curY + 18);
            curY += 22;
        } else if (isSensed) {
            ctx.font = '700 18px "Cinzel", serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            const badgeText = m.invisible ? '👁 SENSED [INVIS]' : '👁 SENSED';
            ctx.strokeText(badgeText, 192, curY + 18);
            ctx.fillStyle = '#55ffff';
            ctx.fillText(badgeText, 192, curY + 18);
            curY += 22;
        }

        // Line 2: Monster Race Name with crisp black outline
        const displayRace = isBossOrUnique && !race.startsWith('👑') ? `👑 ${race}` : race;
        let fontSize = 24;
        if (displayRace.length > 26) fontSize = 17;
        else if (displayRace.length > 18) fontSize = 20;
        ctx.font = `700 ${fontSize}px "Cinzel", "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(displayRace, 192, curY + 22);
        ctx.fillStyle = colorHex || '#ffffff';
        ctx.fillText(displayRace, 192, curY + 22);
        curY += 28;

        // Line 3: Compact Diegetic Condition Bar ([glyph] [██████], numeric HP strictly in __wizardMode)
        const showNumericHp = Boolean(typeof window !== 'undefined' && window.__wizardMode);
        const barW = showNumericHp ? 156 : 184;
        const barH = 9;
        const barX = (showNumericHp ? 192 : 206) - barW / 2;
        const barY = curY + 4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

        let hpCol = '#44ee44';
        if (pct < 0.3) hpCol = '#ff3b30';
        else if (pct < 0.6) hpCol = '#ffcc00';

        ctx.fillStyle = hpCol;
        ctx.fillRect(barX, barY, Math.max(2, barW * pct), barH);

        ctx.font = '700 15px "Fira Code", monospace';
        ctx.fillStyle = '#e0e0e0';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;

        ctx.textAlign = 'right';
        ctx.strokeText(`[${glyph}]`, barX - 6, barY + 8);
        ctx.fillText(`[${glyph}]`, barX - 6, barY + 8);

        if (showNumericHp) {
            ctx.textAlign = 'left';
            ctx.strokeText(`${hp}/${hpMax}`, barX + barW + 6, barY + 8);
            ctx.fillText(`${hp}/${hpMax}`, barX + barW + 6, barY + 8);
        }

        const npW = isBossOrUnique ? 0.84 : 0.68;
        const npH = isBossOrUnique ? 0.235 : 0.19;
        if (reuse) {
            existingSprite.scale.set(npW, npH, 1.0);
            existingSprite.material.map.needsUpdate = true;
            existingSprite.monsterData = m;
            return existingSprite;
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(npW, npH, 1.0);
        sprite._npCanvas = canvas;
        sprite._npCtx = ctx;
        sprite.monsterData = m;
        return sprite;
    }

    initMonsterAtlas() {
        // # ROOT-CAUSE: Defer 4096x4096 monster_atlas.png and monster_normal.png network downloads and GPU mipmap generation until ensureMonsterAtlasReady() runs inside awaitSceneAssetsReady(frame).
        this.monsterAtlasData = null;
        this.monsterAtlasTex = null;
        this.monsterNormalTex = null;
        this._monsterAtlasLowerMap = null;
        this.monsterAtlasReady = null;

        this.monsterDepthMat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.35
        });

        // Shared PBR Material for all monster billboards (Z-buffer depth tested, dynamic torchlight specular relief)
        const mkMobMat = (typeof window !== 'undefined' && window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.createBudgetMaterial === 'function')
            ? (o) => window.Dungeon3DAtmosphere.createBudgetMaterial(this, o)
            : (o) => new THREE.MeshStandardMaterial(o);
        this.monsterBillboardMat = mkMobMat({
            roughness: 0.58,
            metalness: 0.06,
            normalScale: new THREE.Vector2(0.55, 0.55),
            alphaTest: 0.35,
            depthWrite: true,
            transparent: false,
            side: THREE.DoubleSide,
            vertexColors: true
        });
    }

    _loadMonsterAtlasTextures() {
        if (this._monsterAtlasTexPromise) return this._monsterAtlasTexPromise;
        const texLoader = new THREE.TextureLoader(this._getAssetLoadingManager());
        this._monsterAtlasTexPromise = new Promise((resolve) => {
            texLoader.load('/assets/sprites/monsters/monster_atlas.webp', (tex) => {
                if (window.Dungeon3DCompat) window.Dungeon3DCompat.setTextureColorSpace(tex, true);
                else tex.encoding = THREE.sRGBEncoding;
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    const anisoCap = (this.renderBudget && this.renderBudget.anisotropy) || 4;
                    tex.anisotropy = Math.min(anisoCap, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.monsterAtlasTex = tex;
                if (this.monsterBillboardMat) {
                    this.monsterBillboardMat.map = tex;
                    this.monsterBillboardMat.needsUpdate = true;
                }
                resolve(tex);
            }, undefined, (err) => {
                console.warn('[3D] monster_atlas.webp failed to load, falling back to procedural tokens:', err);
                resolve(null);
            });

            texLoader.load('/assets/sprites/monsters/monster_normal.webp', (tex) => {
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    const anisoCap = (this.renderBudget && this.renderBudget.anisotropy) || 4;
                    tex.anisotropy = Math.min(anisoCap, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.monsterNormalTex = tex;
                if (this.monsterBillboardMat) {
                    this.monsterBillboardMat.normalMap = tex;
                    this.monsterBillboardMat.normalScale = new THREE.Vector2(0.45, 0.45);
                    this.monsterBillboardMat.needsUpdate = true;
                }
            }, undefined, (err) => {
                console.warn('[3D] monster_normal.webp failed to load:', err);
            });
        });
        return this._monsterAtlasTexPromise;
    }

    ensureMonsterAtlasReady() {
        if (this.monsterAtlasReady) return this.monsterAtlasReady;
        this.monsterAtlasReady = fetch('/assets/sprites/monsters/monster_atlas.json')
            .then(res => res.json())
            .then(data => {
                this.monsterAtlasData = data;
                console.log(`[3D] Loaded monster sprite atlas: ${Object.keys(data.monsters || {}).length} species, ${Object.keys(data.glyphs || {}).length} glyph fallbacks.`);
                if (this.upgradeAllMonsterEntities) this.upgradeAllMonsterEntities();
                return true;
            })
            .catch(err => {
                console.warn('[3D] monster_atlas.json failed to load, using procedural fallback:', err);
                return true;
            });
        return this.monsterAtlasReady;
    }

    resolveMonsterAtlasEntry(name, glyph) {
        if (!this.monsterAtlasData) {
            this.ensureMonsterAtlasReady();
            return null;
        }
        const monsters = this.monsterAtlasData.monsters;
        const glyphs = this.monsterAtlasData.glyphs;
        if (!monsters && !glyphs) return null;

        const rawName = (name || '').trim();
        const lower = rawName.toLowerCase();

        // 1. Direct exact name lookup
        if (monsters && monsters[rawName]) {
            return monsters[rawName];
        }

        // 2. Equines / Mounts (horses, steeds, ponies, unicorns, pegasi, rideable mounts)
        // These are distinct 3D procedural quadrupeds and must NEVER resolve to
        // Uvatha the Horseman (a Nazgul) or glyph 'q' (which in vanilla atlas is a wolf).
        const isEquine = (/\b(horse|pony|steed|unicorn|pegasus|mare|stallion|mount)\b/i.test(lower) ||
                         lower.includes('馬') || lower.includes('ポニー') || lower.includes('ユニコーン') || lower.includes('ペガサス') ||
                         lower.includes('スレイプニル') || lower.includes('黒王号') || lower.includes('明の明星')) &&
                         !lower.includes('uvatha');
        if (isEquine) {
            return (monsters && (monsters['Wild horse'] || monsters['Horse'] || monsters['Pony'])) || null;
        }

        // 3. Case-insensitive & partial lookup
        if (monsters) {
            if (!this._monsterAtlasLowerMap) {
                this._monsterAtlasLowerMap = new Map();
                for (const [k, v] of Object.entries(monsters)) {
                    this._monsterAtlasLowerMap.set(k.toLowerCase(), v);
                }
            }
            if (this._monsterAtlasLowerMap.has(lower)) {
                return this._monsterAtlasLowerMap.get(lower);
            }

            for (const [k, v] of this._monsterAtlasLowerMap.entries()) {
                if (k.length >= 4 && lower.includes(k)) {
                    return v;
                }
            }
        }

        // 4. Variant creature taxonomy & archetypes (Hengband, FrogComposBand, Sil-Q, OAngband)
        if (monsters) {
            // Specific Eastern & Variant archetypes
            if (lower.includes('samurai') || lower.includes('ninja') || lower.includes('ronin') || lower.includes('warrior') || lower.includes('guard')) {
                if (monsters['Novice warrior']) return monsters['Novice warrior'];
            }
            if (lower.includes('miko') || lower.includes('priest') || lower.includes('shrine maiden') || lower.includes('geisha')) {
                if (monsters['Novice priest']) return monsters['Novice priest'];
            }
            if (lower.includes('light') || lower.includes('sphere') || lower.includes('fireball') || lower.includes('orb')) {
                if (monsters['Will o\' the wisp']) return monsters['Will o\' the wisp'];
                if (monsters['Fire vortex']) return monsters['Fire vortex'];
            }
            if (lower.includes('sword') || lower.includes('blade') || lower.includes('axe') || lower.includes('polearm')) {
                if (monsters['Death sword']) return monsters['Death sword'];
                if (monsters['Novice warrior']) return monsters['Novice warrior'];
            }
            if (lower.includes('naga')) {
                if (monsters['Red naga']) return monsters['Red naga'];
                if (monsters['Spirit naga']) return monsters['Spirit naga'];
            }
            if (lower.includes('vortex')) {
                if (monsters['Fire vortex']) return monsters['Fire vortex'];
                if (monsters['Water vortex']) return monsters['Water vortex'];
            }
            if (lower.includes('coin') || lower.includes('copper') || lower.includes('silver') || lower.includes('gold')) {
                if (monsters['Creeping copper coins']) return monsters['Creeping copper coins'];
            }
            if (lower.includes('mold') || lower.includes('fungus') || lower.includes('mushroom') || lower.includes('growth')) {
                if (monsters['Hairy mold']) return monsters['Hairy mold'];
            }
            if (lower.includes('slime') || lower.includes('ooze') || lower.includes('jelly') || lower.includes('slug')) {
                if (monsters['Giant clear slime']) return monsters['Giant clear slime'];
            }
            if (lower.includes('skirmisher') || (lower.includes('orc') && (lower.includes('soldier') || lower.includes('warrior')))) {
                if (monsters['Cave orc']) return monsters['Cave orc'];
            }
            if (lower.includes('thrallmaster') || (lower.includes('orc') && (lower.includes('shaman') || lower.includes('curse')))) {
                if (monsters['Orc shaman']) return monsters['Orc shaman'];
            }
            if (lower.includes('grimhawk') || lower.includes('war-raven') || lower.includes('hawk') || lower.includes('crow')) {
                if (monsters['Crow']) return monsters['Crow'];
                if (monsters['War-raven']) return monsters['War-raven'];
            }
            if (lower.includes('mewlip')) {
                if (monsters['Ghost']) return monsters['Ghost'];
            }
            if (lower.includes('tanglethorn') || lower.includes('madthorn') || lower.includes('nightthorn') || lower.includes('thorn') || lower.includes('creeper')) {
                if (monsters['Hairy mold']) return monsters['Hairy mold'];
                if (monsters['Green mold']) return monsters['Green mold'];
                if (glyphs && glyphs['m']) return glyphs['m'];
            }
            if (lower.includes('cold-drake') || lower.includes('cold drake')) {
                if (monsters['Cold drake']) return monsters['Cold drake'];
            }
            if (lower.includes('fire-drake') || lower.includes('fire drake')) {
                if (monsters['Fire drake']) return monsters['Fire drake'];
            }
            if (lower.includes('glaurung')) {
                if (monsters['Glaurung, Father of the Dragons']) return monsters['Glaurung, Father of the Dragons'];
            }
            if (lower.includes('easterling') || lower.includes('thrall') || lower.includes('feanor') || lower.includes('luthien') || lower.includes('thingol') || lower.includes('beren') || lower.includes('maeglin') || lower.includes('turin')) {
                if (monsters['Novice warrior']) return monsters['Novice warrior'];
                if (monsters['<player>']) return monsters['<player>'];
            }
            if (lower.includes('nameless')) {
                if (monsters['Mind flayer']) return monsters['Mind flayer'];
                if (monsters['Red naga']) return monsters['Red naga'];
            }
            // General creature family keywords
            if (lower.includes('orc')) {
                if (lower.includes('archer') || lower.includes('scout') || lower.includes('sniper')) {
                    if (monsters['orc archer']) return monsters['orc archer'];
                }
                if (monsters['Cave orc']) return monsters['Cave orc'];
            }
            // Equine & Mounts (Hengband / FrogComposBand / Variants)
            if (isEquine) {
                return null; // Route to procedural 3D equine mesh
            }
            if (lower.includes('wolf') || lower.includes('warg') || lower.includes('hound')) {
                if (monsters['Wolf']) return monsters['Wolf'];
                if (monsters['Warg']) return monsters['Warg'];
            }
            if (lower.includes('spider')) {
                if (monsters['Giant spider']) return monsters['Giant spider'];
            }
            if (lower.includes('snake') || lower.includes('serpent') || lower.includes('viper')) {
                if (monsters['Pit viper']) return monsters['Pit viper'];
            }
            if (lower.includes('skeleton')) {
                if (monsters['Skeleton warrior']) return monsters['Skeleton warrior'];
            }
            if (lower.includes('zombie')) {
                if (monsters['Zombified orc']) return monsters['Zombified orc'];
            }
            if (lower.includes('troll')) {
                if (monsters['Cave troll']) return monsters['Cave troll'];
            }
            if (lower.includes('dragon') || lower.includes('drake')) {
                if (monsters['Young red dragon']) return monsters['Young red dragon'];
            }
            if (lower.includes('vampire')) {
                if (monsters['Vampire']) return monsters['Vampire'];
            }
            if (lower.includes('ghost') || lower.includes('wraith') || lower.includes('spectre')) {
                if (monsters['Ghost']) return monsters['Ghost'];
            }
        }

        // 4. Canonical Glyph fallback (100% coverage across all Angband & variant character symbols)
        let effectiveGlyph = (glyph || '').trim();
        if (!effectiveGlyph || effectiveGlyph === '?') {
            // Deduce glyph from name if glyph was blank, uninitialized or '?'
            if (lower.includes('orc') || lower.includes('snaga') || lower.includes('uruk') || lower.includes('goblin')) effectiveGlyph = 'o';
            else if (lower.includes('horse') || lower.includes('pony') || lower.includes('steed') || lower.includes('unicorn') || lower.includes('pegasus') || lower.includes('馬') || lower.includes('ポニー')) effectiveGlyph = 'q';
            else if (lower.includes('wolf') || lower.includes('hound') || lower.includes('warg')) effectiveGlyph = 'C';
            else if (lower.includes('spider') || lower.includes('scorpion')) effectiveGlyph = 'S';
            else if (lower.includes('snake') || lower.includes('serpent') || lower.includes('viper') || lower.includes('naga')) effectiveGlyph = 'J';
            else if (lower.includes('troll') || lower.includes('ogre')) effectiveGlyph = 'T';
            else if (lower.includes('dragon') || lower.includes('drake')) effectiveGlyph = 'd';
            else if (lower.includes('hawk') || lower.includes('bird') || lower.includes('bat') || lower.includes('crow')) effectiveGlyph = 'b';
            else if (lower.includes('skeleton')) effectiveGlyph = 's';
            else if (lower.includes('zombie') || lower.includes('ghoul') || lower.includes('mummy')) effectiveGlyph = 'z';
            else if (lower.includes('ghost') || lower.includes('wraith') || lower.includes('spectre')) effectiveGlyph = 'G';
            else if (lower.includes('thrall') || lower.includes('easterling') || lower.includes('human') || lower.includes('elf')) effectiveGlyph = '@';
        }

        if (glyphs && effectiveGlyph && glyphs[effectiveGlyph]) {
            return glyphs[effectiveGlyph];
        }

        // Expanded glyph aliases for symbols not directly present in atlas.glyphs
        if (monsters && effectiveGlyph) {
            const glyphAliases = {
                '@': monsters['<player>'] || monsters['Novice warrior'],
                'D': monsters['Ancient red dragon'] || monsters['Cold drake'],
                'A': monsters['Angel'],
                '&': monsters['Hairy mold'] || monsters['Green mold'] || (glyphs && glyphs['m']) || (glyphs && glyphs['u']),
                'N': monsters['Red naga'] || monsters['Mind flayer'],
                'n': monsters['Red naga'] || monsters['Mind flayer'],
                '*': monsters['Fire vortex'] || monsters['Will o\' the wisp'] || (glyphs && glyphs['v']),
                '|': monsters['Novice warrior'] || (glyphs && glyphs['p']),
                '(': monsters['Novice rogue'] || (glyphs && glyphs['p']),
                '[': monsters['Iron golem'] || (glyphs && glyphs['g']),
                ']': monsters['Iron golem'] || (glyphs && glyphs['g']),
                '?': monsters['Ghost'] || (glyphs && glyphs['G']),
                '!': monsters['Giant clear slime'] || (glyphs && glyphs['j']),
                '$': monsters['Creeping copper coins'] || (glyphs && glyphs['m']),
                '#': monsters['Stone golem'] || (glyphs && glyphs['g']),
                ',': monsters['Hairy mold'] || (glyphs && glyphs['m']),
                '.': monsters['Giant clear slime'] || (glyphs && glyphs['j']),
                '~': monsters['Giant salamander'] || (glyphs && glyphs['R'])
            };
            if (glyphAliases[effectiveGlyph]) {
                return glyphAliases[effectiveGlyph];
            }
        }

        // Absolute fallback: Generic creature glyph or novice adventurer (guarantees 100% bestiary coverage)
        return (glyphs && glyphs['o']) || (monsters && monsters['<player>']) || null;
    }


    createMonsterBillboardMesh(atlasEntry) {
        if (!atlasEntry || !atlasEntry.uv || !this.monsterBillboardMat) return null;
        if (typeof this._loadMonsterAtlasTextures === 'function') this._loadMonsterAtlasTextures();
        const [u0, v0, u1, v1] = atlasEntry.uv;

        // Custom 4-vertex quad with UVs mapping into the 4096x4096 HD atlas with vertex AO and gentle normals
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.translate(0, 0.5, 0); // Ground pivot at feet

        const uvAttr = geo.attributes.uv;
        uvAttr.setXY(0, u0, v1);
        uvAttr.setXY(1, u1, v1);
        uvAttr.setXY(2, u0, v0);
        uvAttr.setXY(3, u1, v0);
        uvAttr.needsUpdate = true;

        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        const colArr = new Float32Array(posAttr.count * 3);

        for (let i = 0; i < posAttr.count; i++) {
            const gu = posAttr.getX(i) + 0.5;
            const gv = posAttr.getY(i);
            const nx = (gu - 0.5) * 0.45;
            const ny = (gv - 0.35) * 0.25;
            const nz = 1.0;
            const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            normAttr.setXYZ(i, nx * invLen, ny * invLen, nz * invLen);

            const ao = 0.92 + 0.08 * Math.min(1.0, gv * 1.5);
            colArr[i * 3 + 0] = ao;
            colArr[i * 3 + 1] = ao;
            colArr[i * 3 + 2] = ao;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
        normAttr.needsUpdate = true;

        const mesh = new THREE.Mesh(geo, this.monsterBillboardMat);
        let w = atlasEntry.width || 1.25;
        let h = atlasEntry.height || 1.70;

        const maxMonsterHeight = 2.05;
        if (h > maxMonsterHeight) {
            const scaleDown = maxMonsterHeight / h;
            h = maxMonsterHeight;
            w = w * scaleDown;
        }

        mesh.scale.set(w, h, 1.0);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.customDepthMaterial = this.monsterDepthMat;

        mesh.isBillboard = true;
        mesh.baseWidth = w;
        mesh.baseHeight = h;
        mesh.isFloating = atlasEntry.isFloating || false;
        mesh.baseElevation = mesh.isFloating ? 0.35 : 0.0;
        if (mesh.isFloating) {
            mesh.position.y = mesh.baseElevation;
        }

        return mesh;
    }

    getMonsterAtlasUV(name, glyph) {
        const entry = this.resolveMonsterAtlasEntry(name, glyph);
        return entry ? entry.uv : null;
    }

    getItemAtlasUV(name, glyph) {
        const entry = this.resolveItemAtlasEntry(name, glyph);
        return entry ? entry.uv : null;
    }

    initItemAtlas() {
        // # ROOT-CAUSE: Defer 4096x4096 item_atlas.png and item_normal.png network downloads and GPU mipmap generation until ensureItemAtlasReady() runs inside awaitSceneAssetsReady(frame).
        this.itemAtlasData = null;
        this.itemAtlasTex = null;
        this.itemNormalTex = null;
        this._itemAtlasLowerMap = null;
        this.itemAtlasReady = null;

        this.itemDepthMat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.35
        });

        // Shared PBR Material for all item pickup billboards (Z-buffer depth tested, dynamic torchlight specular relief)
        const mkItemMat = (typeof window !== 'undefined' && window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.createBudgetMaterial === 'function')
            ? (o) => window.Dungeon3DAtmosphere.createBudgetMaterial(this, o)
            : (o) => new THREE.MeshStandardMaterial(o);
        this.itemBillboardMat = mkItemMat({
            roughness: 0.55,
            metalness: 0.08,
            normalScale: new THREE.Vector2(0.50, 0.50),
            alphaTest: 0.35,
            depthWrite: true,
            transparent: false,
            side: THREE.DoubleSide,
            vertexColors: true
        });
    }

    ensureItemAtlasReady() {
        if (this.itemAtlasReady) return this.itemAtlasReady;
        const texLoader = new THREE.TextureLoader(this._getAssetLoadingManager());
        this.itemAtlasReady = new Promise((resolve) => {
            let texDone = false;
            let jsonDone = false;
            const checkDone = () => {
                if (texDone && jsonDone) {
                    if (this.upgradeAllItemEntities) this.upgradeAllItemEntities();
                    resolve(true);
                }
            };

            texLoader.load('/assets/sprites/items/item_atlas.webp', (tex) => {
                if (window.Dungeon3DCompat) window.Dungeon3DCompat.setTextureColorSpace(tex, true);
                else tex.encoding = THREE.sRGBEncoding;
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    const anisoCap = (this.renderBudget && this.renderBudget.anisotropy) || 4;
                    tex.anisotropy = Math.min(anisoCap, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.itemAtlasTex = tex;
                if (typeof window !== 'undefined') window.__itemAtlasLoaded = true;
                if (this.itemBillboardMat) {
                    this.itemBillboardMat.map = tex;
                    this.itemBillboardMat.needsUpdate = true;
                }
                texDone = true;
                checkDone();
            }, undefined, (err) => {
                console.warn('[3D] item_atlas.webp failed to load, falling back to 3D item templates:', err);
                texDone = true;
                checkDone();
            });

            texLoader.load('/assets/sprites/items/item_normal.webp', (tex) => {
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    const anisoCap = (this.renderBudget && this.renderBudget.anisotropy) || 4;
                    tex.anisotropy = Math.min(anisoCap, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.itemNormalTex = tex;
                if (this.itemBillboardMat) {
                    this.itemBillboardMat.normalMap = tex;
                    this.itemBillboardMat.normalScale = new THREE.Vector2(0.45, 0.45);
                    this.itemBillboardMat.needsUpdate = true;
                }
            }, undefined, (err) => {
                console.warn('[3D] item_normal.png failed to load:', err);
            });

            fetch('/assets/sprites/items/item_atlas.json')
                .then(res => res.json())
                .then(data => {
                    this.itemAtlasData = data;
                    console.log(`[3D] Loaded item sprite atlas: ${Object.keys(data.items || {}).length} items, ${Object.keys(data.glyphs || {}).length} glyph fallbacks.`);
                    jsonDone = true;
                    checkDone();
                })
                .catch(err => {
                    console.warn('[3D] item_atlas.json failed to load, using 3D templates:', err);
                    jsonDone = true;
                    checkDone();
                });
        });
        return this.itemAtlasReady;
    }

    resolveItemAtlasEntry(name, glyph) {
        if (!this.itemAtlasData) {
            this.ensureItemAtlasReady();
            return null;
        }
        const items = this.itemAtlasData.items;
        const glyphs = this.itemAtlasData.glyphs;
        if (!items && !glyphs) return null;

        const isPileOrUnknown = (entry) => {
            if (!entry || !Array.isArray(entry.uv)) return true;
            if (entry.category === 'none') return true;
            return entry.uv[0] < 0.095 && entry.uv[1] > 0.968;
        };

        const rawName = (name || '').trim();
        const cleanLower = rawName
            .toLowerCase()
            .replace(/^(\d+\s+|a\s+|an\s+|the\s+|some\s+|pile\s+of\s+)/i, '')
            .replace(/\s*(\([^)]*\)|\{[^}]*\})+$/g, '')
            .replace(/-/g, ' ')
            .trim();

        // 1. Direct exact name lookup (excluding <pile> / <unknown*>)
        if (items && items[rawName] && !isPileOrUnknown(items[rawName])) {
            return items[rawName];
        }

        // 2. Case-insensitive & normalized lookup
        if (items) {
            const lower = rawName.toLowerCase();
            if (!this._itemAtlasLowerMap) {
                this._itemAtlasLowerMap = new Map();
                for (const [k, v] of Object.entries(items)) {
                    if (k.startsWith('<') || isPileOrUnknown(v)) continue;
                    this._itemAtlasLowerMap.set(k.toLowerCase(), v);
                    const dehyphen = k.toLowerCase().replace(/-/g, ' ');
                    if (!this._itemAtlasLowerMap.has(dehyphen)) {
                        this._itemAtlasLowerMap.set(dehyphen, v);
                    }
                }
            }
            if (this._itemAtlasLowerMap.has(lower)) {
                return this._itemAtlasLowerMap.get(lower);
            }
            if (cleanLower && this._itemAtlasLowerMap.has(cleanLower)) {
                return this._itemAtlasLowerMap.get(cleanLower);
            }

            // 2b. Bracketed spellbook / prayer book / song book resolution
            const bracketMatch = rawName.match(/\[([^\]]+)\]/);
            if (bracketMatch) {
                const bKey = `[${bracketMatch[1].toLowerCase().replace(/-/g, ' ').trim()}]`;
                if (this._itemAtlasLowerMap.has(bKey)) {
                    return this._itemAtlasLowerMap.get(bKey);
                }
            }
            if (bracketMatch || /\b(book|tome|grimoire|handbook|manual|codex|prayer|spellbook|chants|songbook)\b/i.test(rawName)) {
                if (/prayer|valar|holy|bless|piety|life|crusade|daemon/i.test(rawName)) {
                    return items['[Beginners Handbook]'] || items['[First Spells]'];
                }
                if (/nature|wild|charm|craft/i.test(rawName)) {
                    return items['[Lesser Charms]'] || items['[First Spells]'];
                }
                if (/shadow|death|dark|necromanc|chaos|trump/i.test(rawName)) {
                    return items['[Into the Shadows]'] || items['[First Spells]'];
                }
                return items['[Magic for Beginners]'] || items['[First Spells]'];
            }

            // 3. Glyph-attuned synthesis for flavored & identified items
            const strippedCore = cleanLower
                .replace(/^(potions?\s+of|scrolls?\s+of|scrolls?\s+titled|wands?\s+of|rods?\s+of|staves?\s+of|staff\s+of|amulets?\s+of|rings?\s+of)\s+/i, '')
                .replace(/^"([^"]+)"$/, '$1')
                .trim();

            if (glyph) {
                let syntheticCandidates = [];
                if (glyph === '-') {
                    syntheticCandidates = [`${strippedCore} wand`, `${strippedCore} rod`, `wand of ${strippedCore}`, `rod of ${strippedCore}`];
                } else if (glyph === '_') {
                    syntheticCandidates = [`${strippedCore} staff`, `staff of ${strippedCore}`];
                } else if (glyph === '!') {
                    syntheticCandidates = [`${strippedCore} potion`, `potion of ${strippedCore}`];
                } else if (glyph === '?') {
                    syntheticCandidates = [strippedCore, `${strippedCore} scroll`, `scroll of ${strippedCore}`, `scroll titled ${strippedCore}`];
                } else if (glyph === '=') {
                    syntheticCandidates = [`${strippedCore} ring`, `ring of ${strippedCore}`];
                } else if (glyph === '"') {
                    syntheticCandidates = [`${strippedCore} amulet`, `amulet of ${strippedCore}`];
                } else if (glyph === ']') {
                    syntheticCandidates = [`pair of ${strippedCore} boots`, `${strippedCore} boots`, `${strippedCore} shod boots`];
                }

                for (const cand of syntheticCandidates) {
                    if (this._itemAtlasLowerMap.has(cand)) {
                        return this._itemAtlasLowerMap.get(cand);
                    }
                }
            }

            // 3b. Identified & flavored Potion semantic Shockbolt sprite mapping (never <pile>!)
            if (glyph === '!' || /\b(potions?|draughts?|elixirs?|phials?|薬)\b/i.test(rawName)) {
                if (/heal|curing|cure|life|vitality|blood|体力|治癒|回復/i.test(rawName)) {
                    return items['Crimson potion'] || items['Clear potion'];
                }
                if (/mana|enlightenment|intellect|wisdom|restore|魔力|知能/i.test(rawName)) {
                    return items['Azure potion'] || items['Clear potion'];
                }
                if (/speed|haste|heroism|berserk|resistance|strength|スピード|加速|英雄/i.test(rawName)) {
                    return items['Bubbling potion'] || items['Azure potion'];
                }
                if (/poison|venom|weakness|blind|confusion|salt|毒|盲目/i.test(rawName)) {
                    return items['Green potion'] || items['Clear potion'];
                }
                const potionPool = ['Azure potion', 'Crimson potion', 'Bubbling potion', 'Green potion', 'Clear potion'];
                let h = 0;
                for (let i = 0; i < cleanLower.length; i++) h = ((h << 5) - h + cleanLower.charCodeAt(i)) | 0;
                const picked = items[potionPool[Math.abs(h) % potionPool.length]];
                if (picked) return picked;
            }

            // 4. Substring & prefix lookup (handles enchantments, quantities, ego suffixes: e.g. "Long Sword (1d10)" -> "Long Sword")
            for (const [k, v] of this._itemAtlasLowerMap.entries()) {
                if (k.length >= 4 && (cleanLower.startsWith(k) || cleanLower.includes(k))) {
                    return v;
                }
            }

            // 5. Long-form reverse containment (ONLY if name is specific, >= 8 chars, and category matches)
            if (cleanLower.length >= 8 && !['steel', 'iron', 'leather', 'wooden', 'copper', 'golden'].includes(cleanLower)) {
                for (const [k, v] of this._itemAtlasLowerMap.entries()) {
                    if (k.includes(cleanLower)) {
                        return v;
                    }
                }
            }

            // 5b. Painted Shockbolt fallbacks for glyphs whose raw atlas entry was <pile> ('!', '?', '"', ']', '<')
            if (glyph === '?' || /\b(scrolls?|parchments?|巻物)\b/i.test(rawName)) {
                return items['Phase Door'] || items['[Magic for Beginners]'];
            }
            if (glyph === '"' || /\b(amulets?|pendants?|necklaces?|首飾り|アミュレット)\b/i.test(rawName)) {
                return items['Amulet'] || items['Pendant'];
            }
            if (glyph === ']') {
                if (/boot|sandal|slipper|greave|靴/i.test(rawName)) return items['Pair of Leather Boots'];
                if (/helm|cap|crown|hood|兜|冠/i.test(rawName)) return items['Iron Helm'];
                if (/glove|gauntlet|caestus|cesti|篭手/i.test(rawName)) return items['Set of Leather Gloves'];
                if (/cloak|mantle|外套|クローク/i.test(rawName)) return items['Cloak'];
                if (/shield|buckler|targe|盾/i.test(rawName)) return items['Small Metal Shield'];
                return items['Iron Helm'] || items['Pair of Leather Boots'];
            }
        }

        // 6. Canonical glyph fallback (guarding against <pile> category: 'none')
        if (glyphs && glyph && glyphs[glyph] && !isPileOrUnknown(glyphs[glyph])) {
            return glyphs[glyph];
        }

        return (items && items['Wooden Torch']) || null;
    }

    createItemBillboardMesh(atlasEntry) {
        if (!atlasEntry || !atlasEntry.uv || !this.itemBillboardMat) return null;
        const [u0, v0, u1, v1] = atlasEntry.uv;

        const geo = new THREE.PlaneGeometry(1, 1);
        if (atlasEntry.isFlat) {
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, 0.015, 0);
        } else {
            geo.translate(0, 0.5, 0);
        }

        const uvAttr = geo.attributes.uv;
        uvAttr.setXY(0, u0, v1);
        uvAttr.setXY(1, u1, v1);
        uvAttr.setXY(2, u0, v0);
        uvAttr.setXY(3, u1, v0);
        uvAttr.needsUpdate = true;

        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        const colArr = new Float32Array(posAttr.count * 3);

        for (let i = 0; i < posAttr.count; i++) {
            const gu = posAttr.getX(i) + 0.5;
            const gv = atlasEntry.isFlat ? (posAttr.getZ(i) + 0.5) : posAttr.getY(i);
            const nx = (gu - 0.5) * 0.40;
            const ny = (gv - 0.35) * 0.20;
            const nz = 1.0;
            const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            normAttr.setXYZ(i, nx * invLen, ny * invLen, nz * invLen);

            const ao = 0.94 + 0.06 * Math.min(1.0, gv * 1.5);
            colArr[i * 3 + 0] = ao;
            colArr[i * 3 + 1] = ao;
            colArr[i * 3 + 2] = ao;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
        normAttr.needsUpdate = true;

        const mesh = new THREE.Mesh(geo, this.itemBillboardMat);
        let w = (atlasEntry.width || 0.40) * (atlasEntry.isFlat ? 1.0 : 1.30);
        let h = (atlasEntry.height || 0.40) * (atlasEntry.isFlat ? 1.0 : 1.30);
        if (atlasEntry.isFlat) {
            w = 0.56;
            h = 0.56;
        }

        mesh.scale.set(w, h, 1.0);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.customDepthMaterial = this.itemDepthMat;

        mesh.isItemBillboard = true;
        mesh.baseWidth = w;
        mesh.baseHeight = h;
        mesh.footprint = atlasEntry.footprint || (Math.max(w, h) * 0.85);
        mesh.baseElevation = atlasEntry.elevation || (atlasEntry.isFlat ? 0.015 : 0.04);
        mesh.isFlat = !!atlasEntry.isFlat;
        mesh.position.y = mesh.baseElevation;

        return mesh;
    }

    upgradeAllMonsterEntities() {
        if (!this.monsters) return;
        for (const [id, entity] of this.monsters.entries()) {
            const m = entity.monsterData;
            if (!m) continue;
            if (!entity.isReal3DMonster) {
                const cfg = entity.pending3DConfig || this.resolveMonster3DConfig(m, entity.glyph);
                const upgraded3D = this._instantiateMonster3DFromTemplate(cfg);
                if (upgraded3D) {
                    if (entity.creatureMesh) entity.remove(entity.creatureMesh);
                    entity.creatureMesh = upgraded3D;
                    entity.add(upgraded3D);
                    entity.isFloating = Boolean(cfg.isFloating || cfg.floating);
                    entity.modelHeight = entity.isFloating
                        ? (upgraded3D.baseHeight || 1.0)
                        : Math.max(0.34, upgraded3D.baseHeight || 1.0);
                    // # ROOT-CAUSE: Unhide monster entity immediately once its real 3D GLB template attaches so creatures never display an empty shadow disc or nameplate before their 3D mesh is ready.
                    entity.isReal3DMonster = true;
                    entity.isBillboard = false;
                    entity.pending3DConfig = null;
                    entity.isFallback = false;
                    entity.visible = true;
                    if (upgraded3D._mixer) {
                        entity._mixer = upgraded3D._mixer;
                        entity._idleAction = upgraded3D._idleAction;
                        entity._walkAction = upgraded3D._walkAction;
                        entity._attackAction = upgraded3D._attackAction;
                        entity._hitAction = upgraded3D._hitAction;
                        entity._deathAction = upgraded3D._deathAction;
                        entity._activeAnimState = upgraded3D._activeAnimState;
                    }
                    entity._heldAttachments = upgraded3D._heldAttachments;
                    upgraded3D.monsterData = m;
                    if (entity.contactShadow) {
                        const footprint = Math.max(0.76, Math.min(2.1, (upgraded3D.baseWidth || 1.05) * 1.12));
                        entity.contactShadow.scale.set(footprint, footprint, footprint);
                        entity.contactShadow.position.y = -entity.position.y - 0.042;
                    }
                    if (entity.nameplate) {
                        entity.nameplate.position.set(0, Math.min(2.55, Math.max(0.58, entity.modelHeight + 0.24)), 0);
                    }
                }
            }
        }
    }

    upgradeAllItemEntities() {
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
                            const fp = (atlasEntry.footprint || 0.35) * 0.38;
                            entity.shadowMesh.scale.set(fp, fp, fp);
                            entity.shadowMesh.position.y = -0.042;
                        }
                    }
                }
            }
        }
    }

    async ensureAtlasesLoaded() {
        const promises = [];
        if (this.monsterAtlasReady) promises.push(this.monsterAtlasReady);
        if (this.itemAtlasReady) promises.push(this.itemAtlasReady);
        if (promises.length > 0) {
            await Promise.all(promises);
        }
        this.upgradeAllMonsterEntities();
        this.upgradeAllItemEntities();
        return true;
    }



    // -------------------------------------------------------------------------
    // High-Fidelity Monster Model & Equipment Resolvers (Matching local Godot client 1:1)
    // -------------------------------------------------------------------------
    cloneModelHierarchy(source) {
        if (!source) return null;
        const sourceLookup = new Map();
        const cloneLookup = new Map();
        const clone = source.clone(true);

        function parallelTraverse(a, b, callback) {
            callback(a, b);
            for (let i = 0; i < a.children.length; i++) {
                if (b.children[i]) {
                    parallelTraverse(a.children[i], b.children[i], callback);
                }
            }
        }

        parallelTraverse(source, clone, (sNode, cNode) => {
            sourceLookup.set(cNode, sNode);
            cloneLookup.set(sNode, cNode);
        });

        clone.traverse((node) => {
            if (node.isMesh && node.geometry && !node.geometry.attributes.normal) {
                node.geometry.computeVertexNormals();
            }
            if (node.isSkinnedMesh) {
                node.frustumCulled = false;
                const sourceMesh = sourceLookup.get(node);
                if (sourceMesh && sourceMesh.skeleton) {
                    const sourceBones = sourceMesh.skeleton.bones;
                    node.skeleton = sourceMesh.skeleton.clone();
                    node.bindMatrix.copy(sourceMesh.bindMatrix);
                    node.skeleton.bones = sourceBones.map((bone) => cloneLookup.get(bone) || bone);
                    node.bind(node.skeleton, node.bindMatrix);
                }
            }
        });

        return clone;
    }

    findHandSlots(root) {
        let leftHand = null;
        let rightHand = null;
        root.traverse((node) => {
            const n = (node.name || '').toLowerCase();
            if (!leftHand && (n === 'handslot.l' || n === 'handslot_l' || n === 'hand.l' || n === 'hand_l' || n === 'wrist.l' || (n.includes('hand') && (n.includes('.l') || n.includes('_l') || n.includes('left'))))) {
                leftHand = node;
            }
            if (!rightHand && (n === 'handslot.r' || n === 'handslot_r' || n === 'hand.r' || n === 'hand_r' || n === 'wrist.r' || (n.includes('hand') && (n.includes('.r') || n.includes('_r') || n.includes('right'))))) {
                rightHand = node;
            }
        });
        return { leftHand, rightHand };
    }

    createFoggyMonsterAura(glyph, rawName, colorHex, modelHeight, isFloating) {
        const group = new THREE.Group();
        const mats = [];
        const baseColor = new THREE.Color(colorHex || 0x66ccff);
        const etherealColor = baseColor.clone().lerp(new THREE.Color(0x77eeff), 0.65);

        // 1. Ethereal Shroud / Misty Apparition Envelope
        const radius = Math.max(0.35, modelHeight * 0.40);
        const shroudGeo = new THREE.SphereGeometry(radius, 16, 12);
        shroudGeo.scale(1.0, 1.35, 1.0);
        const shroudMat = new THREE.MeshBasicMaterial({
            color: etherealColor,
            transparent: true,
            opacity: 0.38,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        mats.push(shroudMat);
        const shroudMesh = new THREE.Mesh(shroudGeo, shroudMat);
        shroudMesh.position.y = isFloating ? 0.35 + modelHeight * 0.45 : modelHeight * 0.45;
        group.add(shroudMesh);

        // 2. Inner Glowing Core / Silhouette
        const coreGeo = new THREE.ConeGeometry(radius * 0.55, Math.max(0.45, modelHeight * 0.75), 10);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xddffff,
            transparent: true,
            opacity: 0.52,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        mats.push(coreMat);
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.y = shroudMesh.position.y;
        group.add(coreMesh);

        // 3. Floating Eye special ethereal pupil / eye ring
        if (glyph === 'e') {
            const eyeGeo = new THREE.TorusGeometry(radius * 0.65, 0.04, 8, 20);
            const eyeMat = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            mats.push(eyeMat);
            const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
            eyeMesh.position.y = shroudMesh.position.y;
            group.add(eyeMesh);
        }

        // 4. Ground Sensed Ripple / Detection Beacon
        const rippleGeo = new THREE.RingGeometry(0.12, 0.52, 24);
        const rippleMat = new THREE.MeshBasicMaterial({
            color: etherealColor,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        mats.push(rippleMat);
        const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
        rippleMesh.rotation.x = -Math.PI / 2;
        rippleMesh.position.y = 0.03;
        group.add(rippleMesh);

        group.foggyMaterials = mats;
        group.groundRipples = rippleMesh;
        group.visible = false;

        return group;
    }

    _cloneSkinnedGltf(sourceRoot) {
        if (!sourceRoot) return null;
        const clonedRoot = sourceRoot.clone(true);
        if (sourceRoot._animations) {
            clonedRoot._animations = sourceRoot._animations;
        }

        const srcSkinnedMeshes = [];
        const dstSkinnedMeshes = [];
        sourceRoot.traverse(n => {
            if (n.isSkinnedMesh) srcSkinnedMeshes.push(n);
        });
        clonedRoot.traverse(n => {
            if (n.isSkinnedMesh) dstSkinnedMeshes.push(n);
        });

        for (let i = 0; i < srcSkinnedMeshes.length; i++) {
            const srcMesh = srcSkinnedMeshes[i];
            const dstMesh = dstSkinnedMeshes[i];
            if (!dstMesh) continue;
            dstMesh.frustumCulled = false; // SkinnedMesh CPU frustum culling uses un-skinned bind-pose sphere; distance culling is handled at entity level in animate()
            if (dstMesh.geometry && !dstMesh.geometry.boundingSphere) {
                dstMesh.geometry.computeBoundingSphere();
            }
            if (dstMesh.geometry && dstMesh.geometry.boundingSphere) {
                dstMesh.geometry.boundingSphere.radius = Math.max(dstMesh.geometry.boundingSphere.radius || 1.5, 2.5);
            }
            dstMesh.castShadow = false;
            dstMesh.receiveShadow = false;

            // Scope bone collection strictly to dstMesh's parent Armature
            let scope = dstMesh;
            while (scope.parent && scope.parent.name !== 'Armature' && scope.parent.parent && scope.parent.parent.parent) {
                if (scope.name === 'Armature') break;
                scope = scope.parent;
            }
            if (scope.parent && scope.parent.name === 'Armature') scope = scope.parent;

            const localBones = new Map();
            scope.traverse(n => {
                if (n.isBone && n.name) localBones.set(n.name, n);
            });
            if (localBones.size === 0) {
                clonedRoot.traverse(n => {
                    if (n.isBone && n.name) localBones.set(n.name, n);
                });
            }

            if (srcMesh.skeleton && srcMesh.skeleton.bones) {
                const newBones = srcMesh.skeleton.bones.map(b => localBones.get(b.name) || b);
                const newInverses = srcMesh.skeleton.boneInverses ? srcMesh.skeleton.boneInverses.map(m => m.clone()) : [];
                dstMesh.bind(new THREE.Skeleton(newBones, newInverses), srcMesh.bindMatrix ? srcMesh.bindMatrix.clone() : dstMesh.matrixWorld);
            }
        }

        clonedRoot.traverse(c => {
            if (c.geometry) c.geometry._sharedGeometry = true;
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                for (const m of mats) {
                    if (m) {
                        m._sharedMaterial = true;
                        if (m.map) m.map._sharedTexture = true;
                        if (m.normalMap) m.normalMap._sharedTexture = true;
                        if (m.roughnessMap) m.roughnessMap._sharedTexture = true;
                        if (m.metalnessMap) m.metalnessMap._sharedTexture = true;
                        if (m.emissiveMap) m.emissiveMap._sharedTexture = true;
                    }
                }
            }
        });

        return clonedRoot;
    }

    _computeHandGripLocalOffset(armRoot, handBone, lowerArmBone, fingerBone) {
        if (!handBone) return new THREE.Vector3();
        armRoot.updateMatrixWorld(true);
        if (fingerBone && fingerBone !== handBone) {
            const wPos = new THREE.Vector3();
            const fPos = new THREE.Vector3();
            handBone.getWorldPosition(wPos);
            fingerBone.getWorldPosition(fPos);
            wPos.lerp(fPos, 0.68);
            handBone.worldToLocal(wPos);
            if (wPos.lengthSq() > 1e-6) return wPos;
        }
        const measureBoneBox = (targetBone) => {
            const box = new THREE.Box3();
            let cnt = 0;
            const v = new THREE.Vector3();
            armRoot.traverse(c => {
                if (c.isSkinnedMesh && c.skeleton && c.geometry && c.geometry.attributes && c.geometry.attributes.position && !/Puglin_Stick|Imp_Mace/i.test(c.name || '')) {
                    const bIdx = c.skeleton.bones.indexOf(targetBone);
                    if (bIdx < 0 || !c.skeleton.boneInverses[bIdx]) return;
                    const toBoneLocal = new THREE.Matrix4().multiplyMatrices(c.skeleton.boneInverses[bIdx], c.bindMatrix);
                    const pos = c.geometry.attributes.position;
                    const si = c.geometry.attributes.skinIndex;
                    const sw = c.geometry.attributes.skinWeight;
                    if (!si || !sw) return;
                    for (let i = 0; i < pos.count; i++) {
                        for (const fn of ['getX', 'getY', 'getZ', 'getW']) {
                            if (si[fn](i) === bIdx && sw[fn](i) > 0.30) {
                                v.fromBufferAttribute(pos, i).applyMatrix4(toBoneLocal);
                                box.expandByPoint(v);
                                cnt++;
                            }
                        }
                    }
                }
            });
            return { box, cnt };
        };
        if (handBone !== lowerArmBone) {
            const hb = measureBoneBox(handBone);
            if (hb.cnt > 5) {
                const center = new THREE.Vector3();
                hb.box.getCenter(center);
                center.y = hb.box.min.y + (hb.box.max.y - hb.box.min.y) * 0.62;
                return center;
            }
        }
        if (lowerArmBone) {
            const lb = measureBoneBox(lowerArmBone);
            if (lb.cnt > 5) {
                const center = new THREE.Vector3();
                lb.box.getCenter(center);
                const palmInLower = new THREE.Vector3(center.x, lb.box.min.y + (lb.box.max.y - lb.box.min.y) * 0.78, center.z);
                if (handBone === lowerArmBone) return palmInLower;
                return palmInLower.sub(handBone.position);
            }
        }
        return new THREE.Vector3(0, 0.05, 0);
    }

    _poseRigNaturalStance(rootGroup, cfg = {}) {
        if (!rootGroup) return;

        const swingBoneTowardWorld = (bone, childBone, targetWorldDir) => {
            if (!bone || !childBone) return;
            rootGroup.updateMatrixWorld(true);
            const p0 = bone.getWorldPosition(new THREE.Vector3());
            const p1 = childBone.getWorldPosition(new THREE.Vector3());
            const curDir = p1.sub(p0);
            if (curDir.lengthSq() < 1e-8) return;
            curDir.normalize();
            const tgtDir = targetWorldDir.clone().normalize();
            const qWorld = new THREE.Quaternion().setFromUnitVectors(curDir, tgtDir);
            const parentWorldQ = new THREE.Quaternion();
            if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);
            const localQ = parentWorldQ.clone().invert().multiply(qWorld).multiply(parentWorldQ);
            bone.quaternion.premultiply(localQ);
            rootGroup.updateMatrixWorld(true);
        };

        const armatures = [];
        rootGroup.traverse(n => {
            if (n.isBone && (!n.parent || !n.parent.isBone)) {
                if (!armatures.includes(n)) armatures.push(n);
            }
        });
        if (armatures.length === 0) armatures.push(rootGroup);

        const rigBoneSets = [];
        for (const armRoot of armatures) {
            const boneMap = {};
            armRoot.traverse(n => {
                if (n.isBone && n.name) {
                    boneMap[n.name] = n;
                    boneMap[n.name.toLowerCase()] = n;
                }
            });

            const getBone = (...names) => {
                for (const name of names) {
                    const b = boneMap[name] || boneMap[name.toLowerCase()];
                    if (b) return b;
                    for (const k in boneMap) {
                        const lk = k.toLowerCase();
                        const ln = name.toLowerCase();
                        if (lk === ln || lk.endsWith(':' + ln) || lk.endsWith('_' + ln) || lk.replace(/^mixamorig/, '') === ln) {
                            return boneMap[k];
                        }
                    }
                }
                return null;
            };

            const upperarm_l = getBone('upperarm_l', 'UpperArm_L', 'LeftArm', 'L_Upperarm', 'arm_l');
            const upperarm_r = getBone('upperarm_r', 'UpperArm_R', 'RightArm', 'R_Upperarm', 'arm_r');
            const lowerarm_l = getBone('lowerarm_l', 'LowerArm_L', 'LeftForeArm', 'L_Forearm', 'forearm_l');
            const lowerarm_r = getBone('lowerarm_r', 'LowerArm_R', 'RightForeArm', 'R_Forearm', 'forearm_r');
            let hand_l = getBone('hand_l', 'LeftHand', 'Hand_L', 'L_Hand');
            let hand_r = getBone('hand_r', 'RightHand', 'Hand_R', 'R_Hand');
            if (!hand_r && lowerarm_r) {
                hand_r = lowerarm_r.children && lowerarm_r.children.find(ch => ch.name === 'RightHand_Synthetic');
                if (!hand_r) {
                    hand_r = new THREE.Bone();
                    hand_r.name = 'RightHand_Synthetic';
                    hand_r.position.set(0, 0.18, 0);
                    lowerarm_r.add(hand_r);
                }
            }
            if (!hand_l && lowerarm_l) {
                hand_l = lowerarm_l.children && lowerarm_l.children.find(ch => ch.name === 'LeftHand_Synthetic');
                if (!hand_l) {
                    hand_l = new THREE.Bone();
                    hand_l.name = 'LeftHand_Synthetic';
                    const refY = (hand_r && hand_r.parent === lowerarm_r && hand_r.position.y > 0.05) ? hand_r.position.y : 0.18;
                    hand_l.position.set(0, refY, 0);
                    lowerarm_l.add(hand_l);
                }
            }
            const middle_01_l = getBone('middle_01_l', 'LeftHandMiddle1', 'LeftHandIndex1', 'Middle1_L', 'Index1_L', 'L_Middle1', 'L_Index1', 'f_middle.01.L');
            const middle_01_r = getBone('middle_01_r', 'RightHandMiddle1', 'RightHandIndex1', 'Middle1_R', 'Index1_R', 'R_Middle1', 'R_Index1', 'f_middle.01.R');
            if (hand_r && !hand_r._palmLocalOffset) {
                hand_r._palmLocalOffset = this._computeHandGripLocalOffset(rootGroup, hand_r, lowerarm_r, middle_01_r);
            }
            if (hand_l && !hand_l._palmLocalOffset) {
                hand_l._palmLocalOffset = this._computeHandGripLocalOffset(rootGroup, hand_l, lowerarm_l, middle_01_l);
            }
            const clavicle_l = getBone('clavicle_l', 'Shoulder_L', 'LeftShoulder', 'L_Clavicle');
            const clavicle_r = getBone('clavicle_r', 'Shoulder_R', 'RightShoulder', 'R_Clavicle');
            const spine_01 = getBone('spine_01', 'Spine01', 'Spine', 'Chest', 'spine');
            const spine_02 = getBone('spine_02', 'Spine02', 'Spine1', 'Spine2', 'Chest');
            const neck_01 = getBone('neck_01', 'NeckTwist01', 'Neck', 'neck');
            const Head = getBone('Head', 'head');
            const thigh_l = getBone('thigh_l', 'UpperLeg_L', 'LeftUpLeg', 'L_Thigh');
            const thigh_r = getBone('thigh_r', 'UpperLeg_R', 'RightUpLeg', 'R_Thigh');
            const calf_l = getBone('calf_l', 'LowerLeg_L', 'LeftLeg', 'L_Calf');
            const calf_r = getBone('calf_r', 'LowerLeg_R', 'RightLeg', 'R_Calf');

            const hasAnimations = Boolean((rootGroup._animations && rootGroup._animations.length > 0) || (armRoot._animations && armRoot._animations.length > 0));
            if (!hasAnimations) {
                const isBow = (cfg.weaponKey === 'item_bow');
                const hasLeftItem = Boolean(cfg.shieldKey || isBow);
                const hasRightItem = Boolean(!isBow && cfg.weaponKey);
                swingBoneTowardWorld(
                    upperarm_l,
                    lowerarm_l,
                    hasLeftItem ? new THREE.Vector3(0.28, -0.80, 0.52) : new THREE.Vector3(0.30, -0.90, 0.10)
                );
                swingBoneTowardWorld(
                    lowerarm_l,
                    hand_l,
                    isBow
                        ? new THREE.Vector3(0.18, 0.04, 0.98)
                        : (cfg.shieldKey ? new THREE.Vector3(-0.14, 0.14, 0.98) : new THREE.Vector3(0.22, -0.58, 0.78))
                );
                swingBoneTowardWorld(
                    upperarm_r,
                    lowerarm_r,
                    hasRightItem ? new THREE.Vector3(-0.30, -0.82, 0.48) : new THREE.Vector3(-0.34, -0.88, 0.14)
                );
                swingBoneTowardWorld(
                    lowerarm_r,
                    hand_r,
                    hasRightItem
                        ? new THREE.Vector3(-0.18, 0.18, 0.96)
                        : new THREE.Vector3(-0.22, -0.52, 0.82)
                );

                armRoot.traverse(fb => {
                    if (!fb.isBone || !fb.name) return;
                    const fn = fb.name.toLowerCase();
                    const isRight = /^(righthand|r_hand|hand_r).*(index|middle|ring|pinky)[123]/.test(fn) || /^(index|middle|ring|pinky)_0[123]_r/.test(fn);
                    const isLeft = /^(lefthand|l_hand|hand_l).*(index|middle|ring|pinky)[123]/.test(fn) || /^(index|middle|ring|pinky)_0[123]_l/.test(fn);
                    if (isRight || isLeft) {
                        const childFinger = fb.children && fb.children.find(ch => ch.isBone);
                        if (childFinger) {
                            const sign = isRight ? 1 : -1;
                            const isGrip = (isRight && cfg.weaponKey && !isBow) || (isLeft && (cfg.shieldKey || isBow));
                            const isPh1 = /1$|_01_/.test(fn);
                            const isPh2 = /2$|_02_/.test(fn);
                            let dir;
                            if (isGrip) {
                                dir = isPh1
                                    ? new THREE.Vector3(sign * 0.72, -0.45, -0.25)
                                    : (isPh2 ? new THREE.Vector3(sign * 0.35, -0.55, -0.80) : new THREE.Vector3(-sign * 0.55, -0.35, -0.80));
                            } else {
                                dir = isPh1
                                    ? new THREE.Vector3(sign * 0.45, -0.78, 0.15)
                                    : new THREE.Vector3(sign * 0.55, -0.72, -0.42);
                            }
                            swingBoneTowardWorld(fb, childFinger, dir);
                        }
                    }
                });

                if (thigh_l) thigh_l.rotateX(-0.08);
                if (calf_l) calf_l.rotateX(0.10);
                if (thigh_r) thigh_r.rotateX(0.06);
                if (calf_r) calf_r.rotateX(0.08);
                if (spine_01) {
                    spine_01.rotateY(0.08);
                    if (cfg.hunched) spine_01.rotateX(0.20);
                }
            }

            const rigBones = {
                upperarm_l, upperarm_r,
                lowerarm_l, lowerarm_r,
                hand_l, hand_r,
                middle_01_l, middle_01_r,
                clavicle_l, clavicle_r,
                spine_01, spine_02, neck_01, Head,
                thigh_l, thigh_r, calf_l, calf_r
            };

            for (const [k, bone] of Object.entries(rigBones)) {
                if (bone) {
                    bone._restQuat = bone.quaternion.clone();
                }
            }

            if (upperarm_l || upperarm_r) {
                rigBoneSets.push(rigBones);
            }
        }

        rootGroup.updateMatrixWorld(true);
        rootGroup._rigBoneSets = rigBoneSets.length > 0 ? rigBoneSets : null;
        rootGroup._rigBones = rigBoneSets[0] || null;
    }

    _filterInnerBodyHeadAndHands(bodyScene, includeForearms = false) {
        if (!bodyScene) return;
        bodyScene.traverse(child => {
            if ((child.isMesh || child.isSkinnedMesh) && child.geometry) {
                const name = (child.name || '') + (child.geometry.name || '');
                if (name.includes('Sphere.005') || name.includes('Retopology') || name.includes('Superhero_Female') || name.includes('SuperHero_Male')) {
                    const geo = child.geometry.clone();
                    const skinIndex = geo.attributes.skinIndex;
                    const pos = geo.attributes.position;
                    const bones = (child.skeleton && child.skeleton.bones) ? child.skeleton.bones : [];
                    const allowedJoints = new Set();
                    for (let j = 0; j < bones.length; j++) {
                        const bName = (bones[j] && bones[j].name) ? bones[j].name : '';
                        if (/^(Head|head|neck_01|hand_[lr]|thumb_|index_|middle_|ring_|pinky_)/i.test(bName)) {
                            allowedJoints.add(j);
                        } else if (includeForearms && /^(lowerarm_[lr]|upperarm_[lr])/i.test(bName)) {
                            allowedJoints.add(j);
                        }
                    }
                    if (includeForearms && pos && geo.attributes.normal) {
                        const norm = geo.attributes.normal;
                        for (let v = 0; v < pos.count; v++) {
                            if (pos.getY(v) < 1.44 && Math.abs(pos.getX(v)) < 0.44) {
                                pos.setXYZ(
                                    v,
                                    pos.getX(v) - norm.getX(v) * 0.014,
                                    pos.getY(v) - norm.getY(v) * 0.014,
                                    pos.getZ(v) - norm.getZ(v) * 0.014
                                );
                            }
                        }
                        pos.needsUpdate = true;
                    }
                    if (geo.index && skinIndex && allowedJoints.size > 0) {
                        const oldIdx = geo.index.array;
                        const kept = [];
                        for (let i = 0; i < oldIdx.length; i += 3) {
                            const a = oldIdx[i], b = oldIdx[i + 1], c = oldIdx[i + 2];
                            const ja = skinIndex.getX(a), jb = skinIndex.getX(b), jc = skinIndex.getX(c);
                            if (allowedJoints.has(ja) && allowedJoints.has(jb) && allowedJoints.has(jc)) {
                                kept.push(a, b, c);
                            }
                        }
                        geo.setIndex(kept);
                    } else if (geo.index && pos) {
                        const oldIdx = geo.index.array;
                        const kept = [];
                        const xMin = includeForearms ? 0.36 : 0.54;
                        for (let i = 0; i < oldIdx.length; i += 3) {
                            const a = oldIdx[i], b = oldIdx[i + 1], c = oldIdx[i + 2];
                            const keepVert = (v) => pos.getY(v) >= 1.46 || Math.abs(pos.getX(v)) >= xMin;
                            if (keepVert(a) && keepVert(b) && keepVert(c)) {
                                kept.push(a, b, c);
                            }
                        }
                        geo.setIndex(kept);
                    }
                    child.geometry = geo;
                }
            }
        });
    }

    _prepareRangerUndertunic(peasantScene) {
        if (!peasantScene) return;
        peasantScene.traverse(child => {
            if (child.isMesh || child.isSkinnedMesh) {
                const name = child.name || '';
                if (/Feet|Arms/i.test(name)) {
                    child.visible = false;
                } else if (/Body|Legs/i.test(name)) {
                    if (child.material) {
                        child.material = Array.isArray(child.material) ? child.material[0].clone() : child.material.clone();
                        child.material.color = new THREE.Color(0x38342c);
                    }
                    if (child.geometry && child.geometry.attributes && child.geometry.attributes.position && child.geometry.attributes.normal) {
                        const geo = child.geometry.clone();
                        const pos = geo.attributes.position;
                        const norm = geo.attributes.normal;
                        for (let i = 0; i < pos.count; i++) {
                            pos.setXYZ(
                                i,
                                pos.getX(i) - norm.getX(i) * 0.006,
                                pos.getY(i) - norm.getY(i) * 0.006,
                                pos.getZ(i) - norm.getZ(i) * 0.006
                            );
                        }
                        pos.needsUpdate = true;
                        child.geometry = geo;
                    }
                }
            }
        });
    }

    _loadSingleGltfScene(url) {
        const loader = this._getGltfLoader();
        if (!loader) return Promise.reject(new Error('GLTFLoader not available'));
        const resolvedUrl = (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(url) : url;
        return new Promise((resolve, reject) => {
            loader.load(resolvedUrl, gltf => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) {
                    reject(new Error(`No scene in GLTF: ${url}`));
                } else {
                    scene._animations = gltf.animations || [];
                    scene.traverse((c) => {
                        if (c.isMesh) {
                            c.castShadow = Boolean(this._enableDynamicShadows);
                            c.receiveShadow = false;
                            if (c.geometry) {
                                c.geometry._sharedGeometry = true;
                            }
                            if (c.material) {
                                const mats = Array.isArray(c.material) ? c.material : [c.material];
                                for (const m of mats) {
                                    if (m) {
                                        m._sharedMaterial = true;
                                        if (m.map) {
                                            m.map._sharedTexture = true;
                                            if (window.Dungeon3DCompat) window.Dungeon3DCompat.setTextureColorSpace(m.map, true);
                                            else if (typeof THREE.sRGBEncoding !== 'undefined') m.map.encoding = THREE.sRGBEncoding;
                                        }
                                        if (m.normalMap) m.normalMap._sharedTexture = true;
                                        if (m.roughnessMap) m.roughnessMap._sharedTexture = true;
                                        if (m.metalnessMap) m.metalnessMap._sharedTexture = true;
                                        if (window.Dungeon3DV2Pipeline && typeof window.Dungeon3DV2Pipeline.preservePhysicalMaterial === 'function') {
                                            window.Dungeon3DV2Pipeline.preservePhysicalMaterial(m);
                                        } else if (m.roughness !== undefined && m.roughness < 0.24) {
                                            m.roughness = 0.28;
                                        }
                                    }
                                }
                            }
                        }
                    });
                    resolve(scene);
                }
            }, undefined, reject);
        });
    }

    _loadSingleObjScene(url) {
        const loader = this.objLoader || (typeof THREE.OBJLoader !== 'undefined' ? new THREE.OBJLoader() : null);
        if (!loader) return Promise.reject(new Error('OBJLoader not available'));
        const resolvedUrl = (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(url) : url;
        return new Promise((resolve, reject) => {
            loader.load(resolvedUrl, obj => {
                if (!obj) {
                    reject(new Error(`No obj in: ${url}`));
                } else {
                    resolve(obj);
                }
            }, undefined, reject);
        });
    }

    _loadTexturePbr(url, isColor = false) {
        if (!this._texLoader) {
            this._texLoader = new THREE.TextureLoader(this._getAssetLoadingManager());
        }
        const resolvedUrl = (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(url) : url;
        return new Promise(resolve => {
            this._texLoader.load(resolvedUrl, tex => {
                tex.flipY = false;
                tex._sharedTexture = true;
                if (isColor) {
                    if (window.Dungeon3DCompat) window.Dungeon3DCompat.setTextureColorSpace(tex, true);
                    else if (typeof THREE.sRGBEncoding !== 'undefined') tex.encoding = THREE.sRGBEncoding;
                }
                resolve(tex);
            }, undefined, () => resolve(null));
        });
    }

    _selectCreatureClips(animClips, cfg = {}) {
        // # ROOT-CAUSE: Extract embedded glTF attack, hit, and death animation clips alongside idle and walk
        if (!Array.isArray(animClips) || animClips.length === 0) {
            return { idleClip: null, walkClip: null, attackClip: null, hitClip: null, deathClip: null };
        }
        const tk = (cfg && cfg.templateKey) || '';
        const badIdleRe = /crouch|dead|death|die|attack|slash|punch|kick|slap|hit|stagger|jump|dance|celebration|roll|dodge|turn|sword_idle/i;
        const nonCrouchIdle = animClips.filter(c => c && c.name && !badIdleRe.test(c.name));
        let idleClip = nonCrouchIdle.find(c => /^(Idle_Loop_Rig|Idle|idle|Idle_02|939_Idle|Survey|fly|storkFly_B_|parrot_A_|horse_A_)$/i.test(c.name))
            || nonCrouchIdle.find(c => /idle|fly|survey/i.test(c.name))
            || animClips.find(c => c && c.name && !/crouch|dead|death|die|attack|slash|punch|kick|slap|hit/i.test(c.name))
            || animClips[0];
        const badWalkRe = /crouch|dead|death|die|turn|attack|slash|punch|kick|slap|hit/i;
        const nonCrouchWalk = animClips.filter(c => c && c.name && !badWalkRe.test(c.name));
        let walkClip = nonCrouchWalk.find(c => /^(Walk_?InPlace|Walk\d*_InPlace|Walking_?InPlace|Walk_Loop_Rig|939_Walking)$/i.test(c.name))
            || nonCrouchWalk.find(c => /^(Walk|walk|Walking|walking)$/i.test(c.name))
            || nonCrouchWalk.find(c => /walk/i.test(c.name) && !/run|sprint/i.test(c.name))
            || nonCrouchWalk.find(c => /^(Jog_Fwd_Loop_Rig|Jog|jog|Run|run|Running|fly|storkFly_B_|parrot_A_)$/i.test(c.name))
            || nonCrouchWalk.find(c => /jog|run|fly/i.test(c.name))
            || idleClip;

        // Slice single-timeline multi-action GLB clips (e.g., wolf locomotion timelines) safely
        if (animClips.length === 1 && typeof THREE !== 'undefined' && THREE.AnimationUtils && typeof THREE.AnimationUtils.subclip === 'function') {
            const dur = Number(animClips[0].duration || 0);
            if (dur >= 2.0 && (tk === 'bestiary_wolf' || !/idle/i.test(animClips[0].name || ''))) {
                const fps = 30;
                const totalF = Math.floor(dur * fps);
                const splitF = Math.floor(totalF * 0.45);
                if (splitF >= 12 && (totalF - splitF) >= 12) {
                    idleClip = THREE.AnimationUtils.subclip(animClips[0], `${animClips[0].name}_idle`, 0, splitF, fps);
                    walkClip = THREE.AnimationUtils.subclip(animClips[0], `${animClips[0].name}_walk`, splitF, totalF, fps);
                }
            }
        }
        if (tk === 'bestiary_wolf' && idleClip && walkClip === idleClip) {
            // If wolf has only a locomotive clip with no separate rest clip, gate walk to movement and keep rest pose still
            walkClip = idleClip;
            idleClip = null;
        }

        let attackClip = animClips.find(c => c && c.name && /attack|slash|bite|strike|punch|swing|swipe|shoot|cast|claw|smash|slap/i.test(c.name)) || null;
        let hitClip = animClips.find(c => c && c.name && /hit|hurt|damage|flinch|impact|react|stagger/i.test(c.name)) || null;
        const deathClip = animClips.find(c => c && c.name && /dead|death|die|fall|defeat/i.test(c.name)) || null;
        const tac = (typeof window !== 'undefined') ? window.Dungeon3DTactical : null;
        if (tac && typeof tac.stabilizeClipRootMotion === 'function') {
            if (walkClip) walkClip = tac.stabilizeClipRootMotion(walkClip, idleClip, 'walk');
            if (attackClip) attackClip = tac.stabilizeClipRootMotion(attackClip, idleClip, 'attack');
            if (hitClip) hitClip = tac.stabilizeClipRootMotion(hitClip, idleClip, 'hit');
        }
        return { idleClip, walkClip, attackClip, hitClip, deathClip };
    }

    _computeTrueSkinnedBoundingBox(root) {
        if (!root) return new THREE.Box3();
        if (root._animations && root._animations.length > 0 && typeof THREE.AnimationMixer !== 'undefined') {
            try {
                const { idleClip } = this._selectCreatureClips(root._animations);
                if (idleClip) {
                    const tmpMixer = new THREE.AnimationMixer(root);
                    const act = tmpMixer.clipAction(idleClip);
                    act.play();
                    tmpMixer.update(0.02);
                    tmpMixer.stopAllAction();
                }
            } catch (_) {}
        }
        root.updateMatrixWorld(true);
        const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const wBox = new THREE.Box3();
        const v = new THREE.Vector3(), skinned = new THREE.Vector3(), temp = new THREE.Vector3(), boneMat = new THREE.Matrix4();
        root.traverse(c => {
            if ((c.isMesh || c.isSkinnedMesh) && c.geometry && c.geometry.attributes && c.geometry.attributes.position && c.visible !== false) {
                const pos = c.geometry.attributes.position;
                const si = c.geometry.attributes.skinIndex;
                const sw = c.geometry.attributes.skinWeight;
                const step = Math.max(1, Math.floor(pos.count / 300));
                if (c.isSkinnedMesh && c.skeleton && si && sw) {
                    c.skeleton.update();
                    for (let i = 0; i < pos.count; i += step) {
                        v.fromBufferAttribute(pos, i).applyMatrix4(c.bindMatrix);
                        skinned.set(0, 0, 0);
                        const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
                        const is = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
                        let totalW = 0;
                        for (let j = 0; j < 4; j++) {
                            const w = ws[j];
                            if (w > 0.0001) {
                                const bone = c.skeleton.bones[is[j]];
                                if (bone && c.skeleton.boneInverses[is[j]]) {
                                    boneMat.multiplyMatrices(bone.matrixWorld, c.skeleton.boneInverses[is[j]]);
                                    temp.copy(v).applyMatrix4(boneMat).multiplyScalar(w);
                                    skinned.add(temp);
                                    totalW += w;
                                }
                            }
                        }
                        if (totalW > 0.0001) {
                            skinned.applyMatrix4(rootInv);
                            wBox.expandByPoint(skinned);
                        }
                    }
                } else {
                    for (let i = 0; i < pos.count; i += step) {
                        v.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld).applyMatrix4(rootInv);
                        wBox.expandByPoint(v);
                    }
                }
            }
        });
        if (wBox.isEmpty()) {
            wBox.setFromObject(root);
        }
        return wBox;
    }

    _enhanceBestiaryMeshQuality(scene, opts = {}) {
        if (!scene) return;
        scene.traverse(c => {
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                if (mats.some(m => m && m.name && /blackoutline|outline/i.test(m.name))) {
                    c.visible = false;
                }
            }
            if (c.name && /blackoutline|outline/i.test(c.name)) {
                c.visible = false;
            }
            if (c.isMesh && c.geometry && c.geometry.attributes && c.geometry.attributes.position) {
                const pos = c.geometry.attributes.position;
                const hadMissingUv = !c.geometry.attributes.uv;
                if (!c.geometry.attributes.uv && typeof THREE !== 'undefined' && THREE.BufferAttribute) {
                    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                    const bb = c.geometry.boundingBox;
                    const sx = Math.max(1e-4, bb.max.x - bb.min.x);
                    const sy = Math.max(1e-4, bb.max.y - bb.min.y);
                    const sz = Math.max(1e-4, bb.max.z - bb.min.z);
                    const uvArr = new Float32Array(pos.count * 2);
                    for (let i = 0; i < pos.count; i++) {
                        const px = pos.getX(i);
                        const py = pos.getY(i);
                        const pz = pos.getZ(i);
                        let nx = 0, ny = 1, nz = 0;
                        if (c.geometry.attributes.normal) {
                            nx = Math.abs(c.geometry.attributes.normal.getX(i));
                            ny = Math.abs(c.geometry.attributes.normal.getY(i));
                            nz = Math.abs(c.geometry.attributes.normal.getZ(i));
                        }
                        if (ny >= nx && ny >= nz) {
                            uvArr[i * 2] = (px - bb.min.x) / sx;
                            uvArr[i * 2 + 1] = (pz - bb.min.z) / sz;
                        } else if (nx >= ny && nx >= nz) {
                            uvArr[i * 2] = (pz - bb.min.z) / sz;
                            uvArr[i * 2 + 1] = (py - bb.min.y) / sy;
                        } else {
                            uvArr[i * 2] = (px - bb.min.x) / sx;
                            uvArr[i * 2 + 1] = (py - bb.min.y) / sy;
                        }
                    }
                    c.geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
                }
                if (opts.smoothNormals && !c.isSkinnedMesh && (hadMissingUv || !c.geometry.attributes.normal)) {
                    if (!c.geometry.attributes.normal) {
                        c.geometry.computeVertexNormals();
                    }
                    const norm = c.geometry.attributes.normal;
                    if (norm) {
                        const normalMap = new Map();
                        for (let i = 0; i < pos.count; i++) {
                            const rx = Math.round(pos.getX(i) * 1000);
                            const ry = Math.round(pos.getY(i) * 1000);
                            const rz = Math.round(pos.getZ(i) * 1000);
                            const key = `${rx},${ry},${rz}`;
                            const entry = normalMap.get(key);
                            const nx = norm.getX(i);
                            const ny = norm.getY(i);
                            const nz = norm.getZ(i);
                            if (entry) {
                                entry[0] += nx;
                                entry[1] += ny;
                                entry[2] += nz;
                            } else {
                                normalMap.set(key, [nx, ny, nz]);
                            }
                        }
                        for (let i = 0; i < pos.count; i++) {
                            const rx = Math.round(pos.getX(i) * 1000);
                            const ry = Math.round(pos.getY(i) * 1000);
                            const rz = Math.round(pos.getZ(i) * 1000);
                            const entry = normalMap.get(`${rx},${ry},${rz}`);
                            if (entry) {
                                const len = Math.hypot(entry[0], entry[1], entry[2]) || 1;
                                norm.setXYZ(i, entry[0] / len, entry[1] / len, entry[2] / len);
                            }
                        }
                        norm.needsUpdate = true;
                    }
                }
                if (opts.applyCreatureBump && c.material) {
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    for (const m of mats) {
                        this._enhanceCreatureStandardMaterial(m, opts);
                    }
                }
            }
        });
    }

    _enhanceCreatureStandardMaterial(m, opts = {}) {
        if (!m) return;
        const mName = (m.name || '').toLowerCase();
        if (/eye|pupil|iris|teeth|tooth|fang|horn|claw/i.test(mName)) return;
        const bType = opts.bumpType || '';
        const bumpTex = (bType === 'fur' && this.furNormal) ? this.furNormal
            : (bType === 'scale' && this.scaleNormal) ? this.scaleNormal
            : (bType === 'chitin' && this.chitinNormal) ? this.chitinNormal
            : (bType === 'organic' && this.organicNormal) ? this.organicNormal
            : (this.floorNormal || this.townFloorNormal || null);
        if (!m.normalMap && bumpTex) {
            m.normalMap = bumpTex;
            const bScale = opts.bumpScale || 0.32;
            if (typeof THREE !== 'undefined' && THREE.Vector2) {
                m.normalScale = new THREE.Vector2(bScale, bScale);
            }
        }
        const grainTex = this.brushedNoiseTex || this.terrainNoiseTex || null;
        if (!m.aoMap && grainTex) {
            m.aoMap = grainTex;
            m.aoMapIntensity = 0.42;
        }
        // # ROOT-CAUSE: Preserve authored roughnessMap modulation, strip Dragon KHR_materials_transmission, keep Guard animations, and use 344-tri skull.gltf
        if (!m.roughnessMap) {
            m.roughness = opts.roughness !== undefined ? opts.roughness : 0.54;
        }
        if (!m._hasCountershadeShader) {
            m._hasCountershadeShader = true;
            if (!this._countershadeOnBeforeCompile) {
                this._countershadeOnBeforeCompile = (shader) => {
                    if (!shader.fragmentShader.includes('vViewPosition')) return;
                    const nVar = (window.Dungeon3DCompat) ? window.Dungeon3DCompat.getNormalVarName(shader.fragmentShader) : 'geometryNormal';
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <dithering_fragment>',
                        `#include <dithering_fragment>
                        vec3 nUp = normalize(${nVar});
                        float dorsal = clamp(nUp.y * 0.5 + 0.5, 0.0, 1.0);
                        float counterShade = mix(0.58, 1.06, dorsal);
                        vec3 vDir = normalize(vViewPosition);
                        float sssRim = pow(1.0 - max(0.0, dot(nUp, vDir)), 2.6) * 0.16;
                        gl_FragColor.rgb = gl_FragColor.rgb * counterShade + gl_FragColor.rgb * sssRim;`
                    );
                };
            }
            m.onBeforeCompile = this._countershadeOnBeforeCompile;
            m.customProgramCacheKey = () => 'tb_countershade_v1';
        }
        m.needsUpdate = true;
    }

    _bindCreatureClips(instance, animClips, cfg = {}) {
        if (!instance || !Array.isArray(animClips) || animClips.length === 0 || typeof THREE.AnimationMixer === 'undefined') {
            return false;
        }
        try {
            const { idleClip, walkClip, attackClip, hitClip, deathClip } = this._selectCreatureClips(animClips, cfg);
            const mixer = new THREE.AnimationMixer(instance);
            const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
            const walkAction = (walkClip && walkClip !== idleClip) ? mixer.clipAction(walkClip) : null;
            const attackAction = (attackClip && attackClip !== idleClip && attackClip !== walkClip) ? mixer.clipAction(attackClip) : null;
            const hitAction = (hitClip && hitClip !== idleClip && hitClip !== walkClip) ? mixer.clipAction(hitClip) : null;
            const deathAction = (deathClip && deathClip !== idleClip && deathClip !== walkClip) ? mixer.clipAction(deathClip) : null;
            if (attackAction && typeof THREE.LoopOnce !== 'undefined') {
                attackAction.setLoop(THREE.LoopOnce, 1);
                attackAction.clampWhenFinished = false;
            }
            if (hitAction && typeof THREE.LoopOnce !== 'undefined') {
                hitAction.setLoop(THREE.LoopOnce, 1);
                hitAction.clampWhenFinished = false;
            }
            if (deathAction && typeof THREE.LoopOnce !== 'undefined') {
                deathAction.setLoop(THREE.LoopOnce, 1);
                deathAction.clampWhenFinished = true;
            }
            if (idleAction) {
                idleAction.time = ((cfg.seed || 0) % Math.max(0.1, idleClip.duration || 1));
                idleAction.play();
                mixer.update(0.016);
                instance.updateMatrixWorld(true);
            }
            instance._mixer = mixer;
            instance._idleAction = idleAction;
            instance._walkAction = walkAction;
            instance._attackAction = attackAction;
            instance._hitAction = hitAction;
            instance._deathAction = deathAction;
            instance._activeAnimState = 'idle';
            return true;
        } catch (err) {
            return false;
        }
    }

    _toRotOnlyClips(clips) {
        if (!Array.isArray(clips) || clips.length === 0) return [];
        return clips.map(c => new THREE.AnimationClip(c.name, c.duration, (c.tracks || []).filter(t => t && /\.quaternion$/i.test(t.name)))).filter(c => c.tracks.length > 0);
    }

    _attachSharedMixamoClipsToLiveHumanoids() {
        const clips = this._toRotOnlyClips(this._sharedMixamoClips);
        if (!Array.isArray(clips) || clips.length === 0) return;
        const mixamoKeys = new Set([
            'char_male_peasant', 'char_male_peasant_bearded', 'char_female_peasant',
            'char_male_ranger', 'char_female_ranger', 'char_valkyrie',
            'char_male_rogue', 'char_male_priest'
        ]);
        if (this._monster3DTemplates) {
            for (const mk of mixamoKeys) {
                const tmpl = this._monster3DTemplates.get(mk);
                if (tmpl && (!tmpl._animations || tmpl._animations.length === 0)) {
                    tmpl._animations = clips;
                }
            }
        }
        if (this.monsters) {
            for (const entity of this.monsters.values()) {
                const cfg = entity && entity.config;
                if (!entity || entity._mixer || !entity.creatureMesh || entity.isBillboard || !cfg || !mixamoKeys.has(cfg.templateKey)) continue;
                if (this._bindCreatureClips(entity.creatureMesh, clips, cfg)) {
                    entity._mixer = entity.creatureMesh._mixer;
                    entity._idleAction = entity.creatureMesh._idleAction;
                    entity._walkAction = entity.creatureMesh._walkAction;
                    entity._attackAction = entity.creatureMesh._attackAction;
                    entity._hitAction = entity.creatureMesh._hitAction;
                    entity._deathAction = entity.creatureMesh._deathAction;
                    entity._activeAnimState = entity.creatureMesh._activeAnimState;
                }
            }
        }
    }

    _ensureMonster3DTemplate(templateKey) {
        if (!this._monster3DTemplates) this._monster3DTemplates = new Map();
        if (!this._monster3DLoading) this._monster3DLoading = new Map();

        if (this._monster3DTemplates.has(templateKey)) {
            return Promise.resolve(this._monster3DTemplates.get(templateKey));
        }
        if (this._monster3DLoading.has(templateKey)) {
            return this._monster3DLoading.get(templateKey);
        }

        if (templateKey === 'ph_chest' || templateKey === 'ph_boulder' || templateKey === 'ph_sledgehammer' || templateKey === 'ph_crystal' || templateKey === 'item_gold' || templateKey === 'item_greatsword' || templateKey === 'ph_potion_flask' || templateKey === 'ph_book' || templateKey === 'item_scroll' || templateKey === 'item_scroll_enchant' || templateKey === 'item_crown' || templateKey === 'item_ring' || templateKey === 'item_plate_armor' || templateKey === 'item_wand' || templateKey === 'item_rod' || templateKey === 'item_staff' || templateKey === 'item_staff_branch') {
            const p = this._ensurePolyHavenFloorItem(templateKey).then(tmpl => {
                this._monster3DTemplates.set(templateKey, tmpl);
                this._monster3DLoading.delete(templateKey);
                this.upgradeAllMonsterEntities();
                return tmpl;
            }).catch(err => {
                this._monster3DLoading.delete(templateKey);
                throw err;
            });
            this._monster3DLoading.set(templateKey, p);
            return p;
        }

        const tagTemplate = (tmpl) => {
            tmpl.traverse(c => {
                if (c.geometry) c.geometry._sharedGeometry = true;
                if (c.material) {
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    for (const m of mats) {
                        if (m) {
                            m._sharedMaterial = true;
                            if (m.map) m.map._sharedTexture = true;
                            if (m.normalMap) m.normalMap._sharedTexture = true;
                            if (m.roughnessMap) m.roughnessMap._sharedTexture = true;
                            if (m.metalnessMap) m.metalnessMap._sharedTexture = true;
                            if (m.emissiveMap) m.emissiveMap._sharedTexture = true;
                        }
                    }
                }
            });
            return tmpl;
        };

        const normalizeWrapper = (content, targetHeight, isHeightOnly = true, yawOffset = 0, maxFootprint = 1.65) => {
            if (templateKey.startsWith('bestiary_') || templateKey.startsWith('obj_') || templateKey === 'ph_street_rat' || templateKey === 'env_fungi_cluster' || templateKey === 'env_ooze_mound') {
                const bumpType = /wolf|husky|fox|shiba|lion|bear|horse|yeti|gnoll|rat|bat|bird|owl|stork|flamingo/.test(templateKey) ? 'fur'
                    : /dragon|snake|lizard|naga|hydra|aquatic|cockatrice/.test(templateKey) ? 'scale'
                    : /spider|centipede|beetle|scorpion|ant|wasp/.test(templateKey) ? 'chitin'
                    : 'organic';
                this._enhanceBestiaryMeshQuality(content, { smoothNormals: true, applyCreatureBump: true, bumpType, roughness: 0.45 });
            }
            const wrapper = new THREE.Group();
            const pivot = new THREE.Group();
            if (yawOffset !== 0) {
                content.rotation.y = (content.rotation.y || 0) + yawOffset;
            }
            pivot.add(content);
            if (content._animations) pivot._animations = content._animations;
            const bbox = this._computeTrueSkinnedBoundingBox(pivot);
            delete pivot._animations;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const center = new THREE.Vector3();
            bbox.getCenter(center);

            const rawH = Math.max(0.005, size.y || 1.0);
            const rawSpan = Math.max(0.005, size.x || 0.5, size.z || 0.5);
            let scaleY = targetHeight / rawH;
            if (!isHeightOnly && rawSpan * scaleY > targetHeight * 1.35) {
                scaleY = (targetHeight * 1.35) / rawSpan;
            }
            if (rawSpan * scaleY > maxFootprint) {
                scaleY = maxFootprint / rawSpan;
            }
            const scaleXZ = scaleY;

            pivot.scale.set(scaleXZ, scaleY, scaleXZ);
            pivot.position.set(-center.x * scaleXZ, -bbox.min.y * scaleY, -center.z * scaleXZ);
            wrapper.add(pivot);
            wrapper.actualHeight = rawH * scaleY;
            wrapper.baseHeight = wrapper.actualHeight;
            wrapper.baseWidth = rawSpan * scaleXZ;
            if (content._animations) {
                wrapper._animations = content._animations;
            }
            return tagTemplate(wrapper);
        };

        const loadGltf = (url, fallback = null) => {
            return this._loadSingleGltfScene(url).catch(err => {
                if (fallback) {
                    if (typeof fallback === 'string') {
                        if (fallback.endsWith('.obj')) {
                            return this._loadSingleObjScene(fallback);
                        }
                        return this._loadSingleGltfScene(fallback);
                    }
                    if (typeof fallback === 'function') {
                        return fallback();
                    }
                }
                throw err;
            });
        };

        let loadPromise = null;

        if (templateKey === 'char_male_peasant') {
            loadPromise = loadGltf('/assets/models/characters/steward.glb').then(content => normalizeWrapper(content, 1.70, true));
        } else if (templateKey === 'char_male_peasant_bearded') {
            loadPromise = loadGltf('/assets/models/characters/steward.glb').then(content => normalizeWrapper(content, 1.70, true));
        } else if (templateKey === 'char_female_peasant') {
            loadPromise = loadGltf('/assets/models/characters/npc_woman.glb').then(content => normalizeWrapper(content, 1.64, true));
        } else if (templateKey === 'char_male_ranger') {
            loadPromise = loadGltf('/assets/models/characters/ranger.glb').then(content => normalizeWrapper(content, 1.78, true));
        } else if (templateKey === 'char_female_ranger') {
            loadPromise = loadGltf('/assets/models/characters/female_rogue.glb').then(content => normalizeWrapper(content, 1.72, true));
        } else if (templateKey === 'char_valkyrie') {
            loadPromise = loadGltf('/assets/models/characters/valkyrie.glb', () => this._ensureMonster3DTemplate('char_female_ranger')).then(content => {
                return normalizeWrapper(content, 1.88, true);
            });
        } else if (templateKey === 'char_male_guard') {
            loadPromise = loadGltf('/assets/models/characters/guard.glb', () => this._ensureMonster3DTemplate('char_male_ranger')).then(content => {
                const guardClips = (content && content._animations && content._animations.length > 0) ? content._animations.slice() : null;
                const guardPivot = new THREE.Group();
                guardPivot.name = 'GuardOrientationPivot';
                if (content) guardPivot.add(content);
                const wrapper = normalizeWrapper(guardPivot, 1.82, true, 0);
                if (guardClips && guardClips.length > 0) {
                    wrapper._animations = guardClips;
                    guardPivot._animations = guardClips;
                    this._sharedMixamoClips = guardClips;
                    if (typeof this._attachSharedMixamoClipsToLiveHumanoids === 'function') {
                        Promise.resolve().then(() => this._attachSharedMixamoClipsToLiveHumanoids());
                    }
                }
                return wrapper;
            });
        } else if (templateKey === 'char_male_rogue') {
            loadPromise = loadGltf('/assets/models/characters/rogue.glb', () => this._ensureMonster3DTemplate('char_male_ranger')).then(content => {
                return normalizeWrapper(content, 1.74, true);
            });
        } else if (templateKey === 'char_male_priest') {
            loadPromise = loadGltf('/assets/models/characters/priest.glb', () => this._ensureMonster3DTemplate('char_male_peasant')).then(content => {
                return normalizeWrapper(content, 1.72, true);
            });
        } else if (templateKey === 'bestiary_puglin') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/Puglin.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh && c.material) {
                        const m = c.material;
                        if (m.roughnessMap && !m.aoMap) {
                            m.aoMap = m.roughnessMap;
                            m.aoMapIntensity = 1.25;
                        }
                        m.emissive = new THREE.Color(m.emissiveMap ? 0xff3b00 : 0x000000);
                        m.emissiveIntensity = m.emissiveMap ? 1.35 : 0.0;
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        m._sharedMaterial = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 1.05, true);
            });
        } else if (templateKey === 'bestiary_imp') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/Imp.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh && c.material) {
                        const m = c.material;
                        if (m.roughnessMap && !m.aoMap) {
                            m.aoMap = m.roughnessMap;
                            m.aoMapIntensity = 1.25;
                        }
                        m.emissive = new THREE.Color(m.emissiveMap ? 0xff3b00 : 0x000000);
                        m.emissiveIntensity = m.emissiveMap ? 1.35 : 0.0;
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        m._sharedMaterial = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 1.50, true);
            });
        } else if (templateKey === 'bestiary_dragon') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/bestiary/Dragon.glb').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'scale', bumpScale: 0.42, roughness: 0.44 });
                return normalizeWrapper(scene, 1.95, true, -Math.PI / 2, 2.20);
            });
        } else if (templateKey === 'bestiary_fox') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/bestiary/Fox.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                if (!(window.Dungeon3DCompat && window.Dungeon3DCompat.isV2())) m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.62, true, 0, 1.15);
            });
        } else if (templateKey === 'bestiary_horse') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/horse_mount.glb', '/assets/models/monsters/bestiary/wolf.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                if (!(window.Dungeon3DCompat && window.Dungeon3DCompat.isV2())) m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 1.55, true, 0, 1.85);
            });
        } else if (templateKey === 'bestiary_bird') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/corvid_raptor.glb', '/assets/models/monsters/bestiary/Parrot.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                if (!(window.Dungeon3DCompat && window.Dungeon3DCompat.isV2())) m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.52, true, 0, 1.10);
            });
        } else if (templateKey === 'bestiary_skull') {
            loadPromise = loadGltf('/assets/models/items/skull.gltf', '/assets/models/monsters/bestiary/Skull.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor && !m.map) m.vertexColors = true;
                                if (!(window.Dungeon3DCompat && window.Dungeon3DCompat.isV2())) m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.58, true, 0, 0.85);
            });
        } else if (templateKey === 'ph_street_rat') {
            loadPromise = this._loadSingleGltfScene('/assets/polyhaven/models/street_rat/street_rat.gltf').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh) {
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.36, true, 0, 0.90);
            });
        } else if (templateKey === 'bestiary_kobold') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/kobold.glb', () => this._ensureMonster3DTemplate('bestiary_puglin')).then(scene => {
                return normalizeWrapper(scene, 1.05, true);
            });
        } else if (templateKey === 'bestiary_goblin') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/goblin.glb', () => this._ensureMonster3DTemplate('bestiary_puglin')).then(scene => {
                return normalizeWrapper(scene, 1.18, true);
            });
        } else if (templateKey === 'bestiary_orc') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/orc.glb', () => this._ensureMonster3DTemplate('char_male_ranger')).then(scene => {
                return normalizeWrapper(scene, 1.72, true);
            });
        } else if (templateKey === 'bestiary_orc_female') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/orc_female.glb', () => this._ensureMonster3DTemplate('bestiary_orc')).then(scene => {
                return normalizeWrapper(scene, 1.64, true);
            });
        } else if (templateKey === 'bestiary_hobgoblin') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/hobgoblin.glb', () => this._ensureMonster3DTemplate('bestiary_orc')).then(scene => {
                return normalizeWrapper(scene, 1.85, true);
            });
        } else if (templateKey === 'bestiary_gnoll') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/gnoll.glb', () => this._ensureMonster3DTemplate('bestiary_orc')).then(scene => {
                return normalizeWrapper(scene, 1.90, true);
            });
        } else if (templateKey === 'bestiary_troll') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/troll.glb', () => this._ensureMonster3DTemplate('bestiary_yeti')).then(scene => {
                return normalizeWrapper(scene, 2.25, true, 0, 1.75);
            });
        } else if (templateKey === 'bestiary_ogre') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/ogre.glb', () => this._ensureMonster3DTemplate('bestiary_yeti')).then(scene => {
                return normalizeWrapper(scene, 2.10, true, 0, 1.75);
            });
        } else if (templateKey === 'bestiary_cyclops') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/cyclop.glb', () => this._ensureMonster3DTemplate('bestiary_ogre')).then(scene => {
                return normalizeWrapper(scene, 2.45, true, 0, 1.85);
            });
        } else if (templateKey === 'bestiary_lizardfolk') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/lizardfolk.glb', () => this._ensureMonster3DTemplate('bestiary_orc')).then(scene => {
                return normalizeWrapper(scene, 1.78, true);
            });
        } else if (templateKey === 'bestiary_skeleton_warrior') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/skeleton_warrior.glb', () => this._ensureMonster3DTemplate('bestiary_wraith')).then(scene => {
                return normalizeWrapper(scene, 1.72, true);
            });
        } else if (templateKey === 'bestiary_skeleton_knight') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/skeleton_knight.glb', () => this._ensureMonster3DTemplate('bestiary_skeleton_warrior')).then(scene => {
                return normalizeWrapper(scene, 1.82, true);
            });
        } else if (templateKey === 'bestiary_zombie') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/zombie_model.glb', () => this._ensureMonster3DTemplate('char_male_peasant')).then(scene => {
                scene.traverse(c => {
                    if (c.isMesh && c.material) {
                        const name = (c.name || '').toLowerCase();
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        const isFlesh = /head|hand|arm/i.test(name);
                        const isCloth = /torso|leg|foot/i.test(name);
                        for (const mat of mats) {
                            if (!mat || mat.map) continue;
                            if (isFlesh) {
                                mat.color = new THREE.Color(0x6b7c5e);
                                mat.roughness = 0.82;
                                mat.needsUpdate = true;
                            } else if (isCloth) {
                                mat.color = new THREE.Color(0x3b352e);
                                mat.roughness = 0.88;
                                mat.needsUpdate = true;
                            }
                        }
                    }
                });
                return normalizeWrapper(scene, 1.68, true, -Math.PI / 2, 1.35);
            });
        } else if (templateKey === 'bestiary_wraith') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/GhostArmature.glb', () => loadGltf('/assets/models/monsters/bestiary/skeleton_knight.glb', () => this._ensureMonster3DTemplate('char_male_ranger'))).then(scene => {
                if (!this._wraithRimOnBeforeCompile) {
                    this._wraithRimOnBeforeCompile = (shader) => {
                        if (!shader.fragmentShader.includes('vViewPosition')) return;
                        const nVar = (window.Dungeon3DCompat) ? window.Dungeon3DCompat.getNormalVarName(shader.fragmentShader) : 'geometryNormal';
                        shader.uniforms.rimColor = { value: new THREE.Color(0x66ccff) };
                        shader.uniforms.rimPower = { value: 2.2 };
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <common>',
                            `#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;`
                        );
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <dithering_fragment>',
                            `#include <dithering_fragment>\nvec3 viewDir = normalize(vViewPosition);\nfloat rim = 1.0 - max(0.0, dot(${nVar}, -viewDir));\nrim = pow(rim, rimPower);\ngl_FragColor.rgb += rimColor * rim * 0.8;\ngl_FragColor.a = max(gl_FragColor.a, rim * 0.7);`
                        );
                    };
                }
                scene.traverse(c => {
                    if (c.isMesh && c.material) {
                        const mat = Array.isArray(c.material) ? c.material[0] : c.material;
                        mat.transparent = true;
                        mat.opacity = 0.84;
                        mat.blending = THREE.NormalBlending;
                        mat.depthWrite = false;
                        mat.onBeforeCompile = this._wraithRimOnBeforeCompile;
                        mat.customProgramCacheKey = () => 'tb_wraith_rim_v1';
                    }
                });
                return normalizeWrapper(scene, 1.68, true);
            });
        } else if (templateKey === 'bestiary_horror') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/scp939.glb', () => this._ensureMonster3DTemplate('bestiary_wraith')).then(scene => {
                return normalizeWrapper(scene, 1.35, true, 0, 1.65);
            });
        } else if (templateKey === 'bestiary_golem') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/stone_golem.glb', () => loadGltf('/assets/polyhaven/models/gothic_statue/gothic_statue.gltf', () => loadGltf('/assets/models/monsters/bestiary/GodAnubis_Art.glb', () => this._ensureMonster3DTemplate('char_male_ranger')))).then(scene => {
                return normalizeWrapper(scene, 2.05, true, 0, 1.85);
            });
        } else if (templateKey === 'bestiary_statue') {
            loadPromise = loadGltf('/assets/polyhaven/models/gothic_statue/gothic_statue.gltf', () => this._ensureMonster3DTemplate('bestiary_golem')).then(scene => {
                return normalizeWrapper(scene, 1.95, true, 0, 1.55);
            });
        } else if (templateKey === 'bestiary_guardian') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/stone_golem.glb', () => loadGltf('/assets/models/monsters/bestiary/skeleton_knight.glb', () => this._ensureMonster3DTemplate('char_male_guard'))).then(scene => {
                return normalizeWrapper(scene, 2.05, true, 0, 1.65);
            });
        } else if (templateKey === 'bestiary_yeti') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/YetiSmall.glb', () => loadGltf('/assets/models/monsters/bestiary/troll.glb', () => this._ensureMonster3DTemplate('char_male_ranger'))).then(scene => {
                return normalizeWrapper(scene, 1.95, true, 0, 1.85);
            });
        } else if (templateKey === 'bestiary_frost_construct') {
            loadPromise = loadGltf(
                '/assets/models/monsters/bestiary/frost_construct.glb',
                () => loadGltf('/assets/models/monsters/bestiary/YetiSmall.glb', () => loadGltf('/assets/models/monsters/bestiary/stone_golem.glb'))
            ).then(scene => {
                return normalizeWrapper(scene, 1.95, true, 0, 1.85);
            });
        } else if (templateKey === 'bestiary_cockatrice') {
            loadPromise = loadGltf(
                '/assets/models/monsters/bestiary/cockatrice.glb',
                () => loadGltf('/assets/models/monsters/bestiary/lizard.glb', () => loadGltf('/assets/models/monsters/bestiary/Owl.glb'))
            ).then(scene => {
                return normalizeWrapper(scene, 0.92, true, -Math.PI / 2, 1.35);
            });
        } else if (templateKey === 'bestiary_wolf') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/wolf.glb', () => this._ensureMonster3DTemplate('bestiary_fox')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.36, roughness: 0.56 });
                return normalizeWrapper(scene, 0.92, true, 0, 2.55);
            });
        } else if (templateKey === 'bestiary_werewolf') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/werewolf.glb', () => this._ensureMonster3DTemplate('bestiary_wolf')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.38, roughness: 0.54 });
                return normalizeWrapper(scene, 1.75, true, -Math.PI / 2, 1.55);
            });
        } else if (templateKey === 'bestiary_hellhound') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/hellhound.glb', () => this._ensureMonster3DTemplate('bestiary_wolf')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.36, roughness: 0.50 });
                return normalizeWrapper(scene, 1.00, true, -Math.PI / 2, 2.65);
            });
        } else if (templateKey === 'bestiary_husky') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/husky.glb', () => this._ensureMonster3DTemplate('bestiary_wolf')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.34, roughness: 0.54 });
                return normalizeWrapper(scene, 0.82, true, -Math.PI / 2, 1.38);
            });
        } else if (templateKey === 'bestiary_shiba') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/shiba.glb', () => this._ensureMonster3DTemplate('bestiary_fox')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.32, roughness: 0.52 });
                return normalizeWrapper(scene, 0.66, true, -Math.PI / 2, 1.18);
            });
        } else if (templateKey === 'bestiary_flamingo') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/Flamingo.glb', () => this._ensureMonster3DTemplate('bestiary_stork')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.28, roughness: 0.48 });
                return normalizeWrapper(scene, 0.86, true, 0, 1.25);
            });
        } else if (templateKey === 'env_anvil') {
            loadPromise = loadGltf('/assets/models/items/Anvil.gltf', '/assets/polyhaven/models/sledgehammer_01/sledgehammer_01.gltf').then(scene => {
                return normalizeWrapper(scene, 0.92, true, 0, 1.20);
            });
        } else if (templateKey === 'bestiary_lion') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/feline_predator.glb', () => loadGltf('/assets/models/monsters/bestiary/MountainLion.glb', () => this._ensureMonster3DTemplate('bestiary_fox'))).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.34, roughness: 0.56 });
                return normalizeWrapper(scene, 0.95, true, 0, 1.45);
            });
        } else if (templateKey === 'bestiary_owl') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/Owl.glb', '/assets/models/monsters/bestiary/Parrot.glb').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur' });
                return normalizeWrapper(scene, 0.68, true, -Math.PI / 2, 0.95);
            });
        } else if (templateKey === 'bestiary_stork') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/bestiary/Stork.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor && !m.map) m.vertexColors = true;
                                if (!(window.Dungeon3DCompat && window.Dungeon3DCompat.isV2())) m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.78, true, -Math.PI / 2, 1.25);
            });
        } else if (templateKey === 'obj_spider') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/giant_spider.glb').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'chitin', roughness: 0.52 });
                return normalizeWrapper(scene, 0.62, true, 0, 1.25);
            });
        } else if (templateKey === 'bestiary_centipede') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/centipede.glb', () => this._ensureMonster3DTemplate('obj_spider')).then(scene => {
                return normalizeWrapper(scene, 0.38, true, -Math.PI / 2, 1.25);
            });
        } else if (templateKey === 'bestiary_beetle') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/beetle.glb', () => this._ensureMonster3DTemplate('obj_spider')).then(scene => {
                return normalizeWrapper(scene, 0.52, true, 0, 1.15);
            });
        } else if (templateKey === 'bestiary_scorpion') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/scorpion.glb', () => this._ensureMonster3DTemplate('obj_spider')).then(scene => {
                return normalizeWrapper(scene, 0.64, true, 0, 1.20);
            });
        } else if (templateKey === 'bestiary_ant') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/ant.glb', () => this._ensureMonster3DTemplate('obj_wasp')).then(scene => {
                return normalizeWrapper(scene, 0.48, true, 0, 1.10);
            });
        } else if (templateKey === 'obj_wasp') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/wasp.glb').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'chitin', roughness: 0.48 });
                return normalizeWrapper(scene, 0.62, true, 0, 0.95);
            });
        } else if (templateKey === 'obj_snake') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/snake.glb').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'scale', roughness: 0.42 });
                return normalizeWrapper(scene, 0.78, true, 0, 1.15);
            });
        } else if (templateKey === 'obj_frog' || templateKey === 'bestiary_frog') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/frog.glb').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'organic', roughness: 0.38 });
                return normalizeWrapper(scene, 0.48, true, 0, 0.95);
            });
        } else if (templateKey === 'bestiary_eye') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/floating_eye.glb', () => loadGltf('/assets/models/monsters/bestiary/Skull.glb', () => this._ensureMonster3DTemplate('bestiary_wraith'))).then(scene => {
                return normalizeWrapper(scene, 0.72, true, 0, 0.85);
            });
        } else if (templateKey === 'bestiary_worm_mass') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/worm_mass.glb', () => this._ensureMonster3DTemplate('obj_snake')).then(scene => {
                return normalizeWrapper(scene, 0.42, true, -Math.PI / 2, 1.25);
            });
        } else if (templateKey === 'env_fungi_cluster' || templateKey === 'env_mushroom_patch') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/mushroom_cluster.glb', () => loadGltf('/assets/polyhaven/models/crystalline_iceplant/crystalline_iceplant.gltf', () => loadGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf'))).then(scene => {
                return normalizeWrapper(scene, 0.56, true, 0, 0.95);
            });
        } else if (templateKey === 'env_ooze_mound') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/jelly_ooze.glb', () => loadGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf')).then(scene => {
                const wrap = normalizeWrapper(scene, 0.58, true, 0, 1.05);
                return (window.Dungeon3DTactical && window.Dungeon3DTactical.augmentOozeTemplate) ? window.Dungeon3DTactical.augmentOozeTemplate(this, wrap) : wrap;
            });
        } else if (templateKey === 'bestiary_balrog') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/balrog.glb', () => loadGltf('/assets/models/monsters/bestiary/GodAnubis_Art.glb', () => this._ensureMonster3DTemplate('bestiary_golem'))).then(scene => {
                return normalizeWrapper(scene, 2.35, true, 0, 1.85);
            });
        } else if (templateKey === 'bestiary_minotaur') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/minotaur.glb', () => this._ensureMonster3DTemplate('bestiary_guardian')).then(scene => {
                return normalizeWrapper(scene, 2.10, true, 0, 1.75);
            });
        } else if (templateKey === 'bestiary_centaur') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/centaur.glb', () => this._ensureMonster3DTemplate('bestiary_horse')).then(scene => {
                return normalizeWrapper(scene, 1.95, true, 0, 1.80);
            });
        } else if (templateKey === 'bestiary_mumak') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/mumak.glb', () => this._ensureMonster3DTemplate('bestiary_bear')).then(scene => {
                return normalizeWrapper(scene, 2.35, true, 0, 1.95);
            });
        } else if (templateKey === 'bestiary_mind_flayer') {
            loadPromise = loadGltf('/assets/models/characters/priest.glb', () => this._ensureMonster3DTemplate('char_male_peasant')).then(scene => {
                scene.traverse(c => {
                    if ((c.isMesh || c.isSkinnedMesh) && c.material) {
                        const mats = Array.isArray(c.material) ? c.material.map(m => m.clone()) : [c.material.clone()];
                        for (const m of mats) {
                            if (m.color) m.color.setHex(0x3b1d5e);
                            m.roughness = 0.68;
                            m._sharedMaterial = true;
                        }
                        c.material = Array.isArray(c.material) ? mats : mats[0];
                    }
                });
                const clips = (scene._animations && scene._animations.length > 0) ? scene._animations.slice() : null;
                const wrapper = normalizeWrapper(scene, 1.68, true);
                if (clips) wrapper._animations = clips;
                const fleshMat = new THREE.MeshStandardMaterial({
                    color: 0x6d28d9,
                    normalMap: this.organicNormal || null,
                    roughness: 0.34,
                    metalness: 0.06,
                    emissive: new THREE.Color(0x1e0b36),
                    emissiveIntensity: 0.25
                });
                const eyeMat = new THREE.MeshStandardMaterial({
                    name: 'illithid_eye',
                    color: 0xfef08a,
                    emissive: new THREE.Color(0xf59e0b),
                    emissiveIntensity: 1.65,
                    roughness: 0.18
                });
                const craniumGeo = new THREE.SphereGeometry(0.145, 16, 12);
                craniumGeo.scale(0.94, 1.24, 1.40);
                const cranium = new THREE.Mesh(craniumGeo, fleshMat);
                cranium.position.set(0, 1.63, -0.025);
                cranium.rotation.x = -0.22;
                wrapper.add(cranium);
                const eyeGeo = new THREE.SphereGeometry(0.024, 10, 8);
                for (const sx of [-1, 1]) {
                    const eye = new THREE.Mesh(eyeGeo, eyeMat);
                    eye.name = 'illithid_eye';
                    eye.position.set(sx * 0.056, 1.585, 0.108);
                    wrapper.add(eye);
                }
                const tentacleSpecs = [
                    { x: -0.065, ox: -0.13, yEnd: 1.31, zEnd: 0.20 },
                    { x: -0.022, ox: -0.045, yEnd: 1.27, zEnd: 0.25 },
                    { x: 0.022, ox: 0.045, yEnd: 1.27, zEnd: 0.25 },
                    { x: 0.065, ox: 0.13, yEnd: 1.31, zEnd: 0.20 }
                ];
                for (const ts of tentacleSpecs) {
                    const curve = new THREE.CatmullRomCurve3([
                        new THREE.Vector3(ts.x, 1.535, 0.095),
                        new THREE.Vector3(ts.x * 1.35, 1.46, 0.165),
                        new THREE.Vector3(ts.ox, 1.38, 0.225),
                        new THREE.Vector3(ts.ox * 0.85, ts.yEnd, ts.zEnd)
                    ]);
                    const tGeo = new THREE.TubeGeometry(curve, 12, 0.021, 7, false);
                    wrapper.add(new THREE.Mesh(tGeo, fleshMat));
                }
                wrapper.actualHeight = 1.76;
                wrapper.baseHeight = 1.76;
                return tagTemplate(wrapper);
            });
        } else if (templateKey === 'env_gelatinous_cube') {
            const cubeGroup = new THREE.Group();
            const outerGeo = new THREE.BoxGeometry(1.42, 1.42, 1.42, 3, 3, 3);
            const pos = outerGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
                const ax = Math.abs(vx), ay = Math.abs(vy), az = Math.abs(vz);
                const cornerCnt = (ax > 0.69 ? 1 : 0) + (ay > 0.69 ? 1 : 0) + (az > 0.69 ? 1 : 0);
                if (cornerCnt >= 2) {
                    const f = cornerCnt === 3 ? 0.945 : 0.972;
                    pos.setXYZ(i, vx * f, vy * f, vz * f);
                }
            }
            outerGeo.computeVertexNormals();
            const outerMat = new THREE.MeshStandardMaterial({
                color: 0x67e8f9,
                emissive: new THREE.Color(0x0891b2),
                emissiveIntensity: 0.18,
                transparent: true,
                opacity: 0.46,
                roughness: 0.08,
                metalness: 0.04,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const outerMesh = new THREE.Mesh(outerGeo, outerMat);
            outerMesh.position.y = 0.71;
            cubeGroup.add(outerMesh);
            const innerGeo = new THREE.BoxGeometry(1.20, 1.20, 1.20);
            const innerMat = new THREE.MeshStandardMaterial({
                color: 0xa5f3fc,
                transparent: true,
                opacity: 0.18,
                roughness: 0.12,
                depthWrite: false
            });
            const innerMesh = new THREE.Mesh(innerGeo, innerMat);
            innerMesh.position.y = 0.71;
            cubeGroup.add(innerMesh);
            const rimEdges = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(1.38, 1.38, 1.38)),
                new THREE.LineBasicMaterial({ name: 'bone_rim', color: 0xcffafe, transparent: true, opacity: 0.36, depthWrite: false })
            );
            rimEdges.position.y = 0.71;
            cubeGroup.add(rimEdges);
            const boneMat = new THREE.MeshStandardMaterial({ name: 'bone_relic', color: 0xe7e5e4, roughness: 0.65 });
            const boneMesh = new THREE.Mesh(createLatheFrustumGeo(0.032, 0.038, 0.56, 7), boneMat);
            boneMesh.position.set(-0.20, 0.66, 0.14);
            boneMesh.rotation.set(0.55, 0.30, 0.72);
            cubeGroup.add(boneMesh);
            const skullRelic = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 1), boneMat);
            skullRelic.position.set(-0.14, 0.92, -0.16);
            cubeGroup.add(skullRelic);
            const steelMat = new THREE.MeshStandardMaterial({ name: 'metal_blade', color: 0xcbd5e1, metalness: 0.85, roughness: 0.25 });
            const bladeGroup = new THREE.Group();
            bladeGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.68, 0.016), steelMat));
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), steelMat);
            guard.position.y = -0.22;
            bladeGroup.add(guard);
            bladeGroup.position.set(0.18, 0.76, -0.08);
            bladeGroup.rotation.set(-0.38, 0.45, -0.48);
            cubeGroup.add(bladeGroup);
            cubeGroup.actualHeight = 1.42;
            cubeGroup.baseHeight = 1.42;
            loadPromise = Promise.resolve(tagTemplate(cubeGroup));
        } else if (templateKey === 'env_tanglethorn' || templateKey === 'env_bush_dead') {
            loadPromise = loadGltf('/assets/polyhaven/models/shrub_02/shrub_02.gltf', () => loadGltf('/assets/polyhaven/models/pine_roots/pine_roots.gltf')).then(scene => {
                return normalizeWrapper(scene, 1.15, true, 0, 1.25);
            });
        } else if (templateKey === 'env_tree' || templateKey === 'bestiary_treeman') {
            const primaryTreeUrl = templateKey === 'bestiary_treeman'
                ? '/assets/models/monsters/bestiary/treeman.glb'
                : '/assets/polyhaven/models/pachira_aquatica_01/pachira_aquatica_01.gltf';
            loadPromise = loadGltf(primaryTreeUrl, () => loadGltf('/assets/polyhaven/models/pine_roots/pine_roots.gltf')).then(scene => {
                if (templateKey === 'env_tree') {
                    let hasC = false;
                    scene.traverse(c => {
                        const nm = ((c.name || '') + ' ' + (c.geometry ? c.geometry.name || '' : '')).toLowerCase();
                        if (nm.includes('bark_c') || nm.includes('leaves_c')) hasC = true;
                    });
                    if (hasC) {
                        const drop = [];
                        scene.traverse(c => {
                            if (c.isMesh) {
                                const nm = ((c.name || '') + ' ' + (c.geometry ? c.geometry.name || '' : '')).toLowerCase();
                                if (!(nm.includes('bark_c') || nm.includes('leaves_c') || nm.includes('circle.001') || nm.includes('cylinder.092'))) {
                                    drop.push(c);
                                }
                            }
                        });
                        for (const d of drop) {
                            if (d.parent) d.parent.remove(d);
                        }
                    }
                }
                return normalizeWrapper(scene, templateKey === 'bestiary_treeman' ? 2.15 : 2.25, true, 0, 1.65);
            });
        } else if (templateKey === 'bestiary_vortex') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/vortex_elemental.glb', () => loadGltf('/assets/models/monsters/bestiary/GhostArmature.glb', () => this._ensureMonster3DTemplate('bestiary_wraith'))).then(scene => {
                const wrap = normalizeWrapper(scene, 1.15, true, 0, 1.05);
                return (window.Dungeon3DTactical && window.Dungeon3DTactical.augmentVortexTemplate) ? window.Dungeon3DTactical.augmentVortexTemplate(this, wrap) : wrap;
            });
        } else if (templateKey === 'bestiary_quylthulg') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/quylthulg.glb', () => loadGltf('/assets/models/monsters/bestiary/jelly_ooze.glb', () => loadGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf'))).then(scene => {
                return normalizeWrapper(scene, 0.62, true, 0, 1.05);
            });
        } else if (templateKey === 'bestiary_hydra') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/hydra.glb', () => this._ensureMonster3DTemplate('bestiary_dragon')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'scale', bumpScale: 0.38, roughness: 0.46 });
                return normalizeWrapper(scene, 1.45, true, -Math.PI / 2, 1.55);
            });
        } else if (templateKey === 'bestiary_naga') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/naga.glb', () => this._ensureMonster3DTemplate('obj_snake')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'scale', bumpScale: 0.36, roughness: 0.46 });
                return normalizeWrapper(scene, 1.28, true, -Math.PI / 2, 1.35);
            });
        } else if (templateKey === 'bestiary_bat') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/bat.glb', () => loadGltf('/assets/models/monsters/bestiary/Owl.glb', () => this._ensureMonster3DTemplate('bestiary_owl'))).then(scene => {
                return normalizeWrapper(scene, 0.52, true, 0, 1.15);
            });
        } else if (templateKey === 'bestiary_bear') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/bear.glb', () => loadGltf('/assets/models/monsters/bestiary/wolf.glb', () => this._ensureMonster3DTemplate('bestiary_wolf'))).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, bumpType: 'fur', bumpScale: 0.38, roughness: 0.58 });
                return normalizeWrapper(scene, 1.08, true, -Math.PI / 2, 1.48);
            });
        } else if (templateKey === 'bestiary_bear_armored') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/bear_armored.glb', () => this._ensureMonster3DTemplate('bestiary_bear')).then(scene => {
                return normalizeWrapper(scene, 1.28, true, 0, 1.55);
            });
        } else if (templateKey === 'bestiary_lizard') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/lizard.glb', () => this._ensureMonster3DTemplate('obj_frog')).then(scene => {
                return normalizeWrapper(scene, 0.54, true, Math.PI / 2, 1.35);
            });
        } else if (templateKey === 'bestiary_kraken') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/kraken.glb', () => this._ensureMonster3DTemplate('bestiary_aquatic')).then(scene => {
                return normalizeWrapper(scene, 1.45, true, Math.PI / 2, 1.65);
            });
        } else if (templateKey === 'bestiary_aquatic') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/aquatic.glb', () => loadGltf('/assets/models/monsters/bestiary/lizard.glb', () => this._ensureMonster3DTemplate('obj_frog'))).then(scene => {
                return normalizeWrapper(scene, 0.68, true, Math.PI / 2, 1.30);
            });
        } else {
            return Promise.reject(new Error(`Unknown 3D monster template key: ${templateKey}`));
        }

        const mixamoHumanoidKeys = new Set([
            'char_male_peasant', 'char_male_peasant_bearded', 'char_female_peasant',
            'char_male_ranger', 'char_female_ranger', 'char_valkyrie',
            'char_male_rogue', 'char_male_priest'
        ]);
        const managedPromise = loadPromise.then(wrapper => {
            if (mixamoHumanoidKeys.has(templateKey) && (!wrapper._animations || wrapper._animations.length === 0)) {
                if (this._sharedMixamoClips && this._sharedMixamoClips.length > 0) {
                    wrapper._animations = this._toRotOnlyClips(this._sharedMixamoClips);
                } else if (!this._monster3DTemplates.has('char_male_guard') && !this._monster3DLoading.has('char_male_guard')) {
                    this._ensureMonster3DTemplate('char_male_guard').catch(() => {});
                }
            }
            this._touchAndEvictLru(this._monster3DTemplates, templateKey, wrapper, 64, (k) => {
                if (k === 'char_male_guard') return true;
                if (this.monsters) {
                    for (const ent of this.monsters.values()) {
                        if (ent && (ent.templateKey === k || (ent.pending3DConfig && ent.pending3DConfig.templateKey === k))) {
                            return true;
                        }
                    }
                }
                return false;
            });
            this._monster3DLoading.delete(templateKey);
            this.upgradeAllMonsterEntities();
            return wrapper;
        }).catch(err => {
            this._monster3DLoading.delete(templateKey);
            console.warn(`[Dungeon3D] Failed to load 3D monster template ${templateKey}:`, err);
            throw err;
        });

        this._monster3DLoading.set(templateKey, managedPromise);
        return managedPromise;
    }

    _resolveCanine3DConfig(lowerName, colorHex, seed) {
        if (/\b(lycanthrope|wolfman)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_werewolf',
                scale: /alpha|lord|king/.test(lowerName) ? 1.32 : 1.08,
                tintHex: colorHex,
                seed
            };
        }
        if (/\b(fox|kitsune|vixen|jackal|coyote|dingo)\b/.test(lowerName)) {
            const foxCoats = ['#d97706', '#ea580c', '#e2e8f0', '#b45309'];
            const useFoxCoat = /\b(fox|kitsune|vixen)\b/.test(lowerName);
            return {
                templateKey: 'bestiary_fox',
                scale: /kitsune|nine-tailed/.test(lowerName) ? 1.24 : 0.92,
                tintHex: useFoxCoat ? (colorHex || foxCoats[seed % foxCoats.length]) : null,
                seed
            };
        }
        if (/\b(little dog|small dog|scruffy|pup|puppy|shiba|terrier)\b/.test(lowerName)) {
            const shibaCoats = ['#f59e0b', '#fef3c7', '#78350f', '#9ca3af'];
            return {
                templateKey: 'bestiary_shiba',
                scale: /pup|little|small|scruffy/.test(lowerName) ? 0.78 : 0.94,
                tintHex: colorHex || shibaCoats[seed % shibaCoats.length],
                seed
            };
        }
        let emissiveHex = null;
        if (/\b(fire|hell|plasma|lava|inferno|carcharoth|cerberus)\b/.test(lowerName)) emissiveHex = '#ff4500';
        else if (/\b(cold|frost|ice|winter|blizzard)\b/.test(lowerName)) emissiveHex = '#38bdf8';
        else if (/\b(energy|lightning|thunder|spark|storm)\b/.test(lowerName)) emissiveHex = '#fde047';
        else if (/\b(acid|venom|poison|water|nexus)\b/.test(lowerName)) emissiveHex = '#a3e635';
        else if (/\b(aether|chaos|ether|time|gravity|inertia|mana|nether|tindalos|spirit)\b/.test(lowerName)) emissiveHex = '#c084fc';

        const isElementalCanine = /\b(fire|hell|cold|frost|ice|energy|lightning|acid|venom|aether|chaos|ether|time|gravity|inertia|mana|nether|plasma|multi-hued)\b/.test(lowerName);
        const isHellHoundBreed = /\b(hell hound|hellhound|cerberus|fire hound|plasma hound|lava hound)\b/.test(lowerName);
        const isHuskyBreed = /\b(husky|winter wolf|frost|cold|ice|blink dog|silver|white wolf|zephyr|hound)\b/.test(lowerName) && !/\b(warg|dire|carcharoth|draugluin|werewolf|hell|fire|plasma)\b/.test(lowerName);
        const templateKey = isHellHoundBreed
            ? 'bestiary_hellhound'
            : (isHuskyBreed
                ? ((/\bhound\b/.test(lowerName) && seed % 2 === 1) ? 'bestiary_wolf' : 'bestiary_husky')
                : ((seed % 4 === 3 && !/\b(warg|dire|carcharoth|draugluin|wild dog|fang|grip)\b/.test(lowerName)) ? 'bestiary_husky' : 'bestiary_wolf'));
        const isBossCanine = /\b(carcharoth|gorthaur|draugluin|cerberus|fenrir|huan)\b/.test(lowerName);
        const isLargeCanine = isBossCanine || /\b(warg|dire|hell hound|alpha|pack leader|emperor)\b/.test(lowerName);
        return {
            templateKey,
            scale: isBossCanine ? 1.46 : (isLargeCanine ? 1.22 : 1.0),
            tintHex: isElementalCanine ? colorHex : null,
            emissiveHex,
            isBoss: isBossCanine,
            seed
        };
    }

    resolveMonster3DConfig(m, glyph, realmOverride) {
        const realm = String(realmOverride || (m && m.realm) || this.realm || 'angband').toLowerCase();
        const colorHex = (typeof getAngbandColorString === 'function') ? getAngbandColorString(m && m.attr) : null;
        if (typeof window !== 'undefined' && window.MASTER_BESTIARY && typeof window.MASTER_BESTIARY.resolve === 'function') {
            return window.MASTER_BESTIARY.resolve(m, glyph, realm, colorHex);
        }
        return { templateKey: 'bestiary_goblin', scale: 1.0, tintHex: colorHex || '#ffffff', seed: 0 };
    }

    _prepareCanonicalHeldClone(wClone, itemKey) {
        if (!wClone) return null;
        const innerPivot = wClone.children && wClone.children[0];
        const scene = innerPivot && innerPivot.children && innerPivot.children[0];
        wClone.position.set(0, 0, 0);
        wClone.rotation.set(0, 0, 0);
        wClone.scale.set(1, 1, 1);
        if (!innerPivot || !scene) return wClone;

        innerPivot.position.set(0, 0, 0);
        innerPivot.rotation.set(0, 0, 0);
        scene.position.set(0, 0, 0);
        scene.rotation.set(0, 0, 0);

        if (itemKey === 'ph_dagger') {
            scene.traverse((c) => {
                if (c.name && /scabbard|sheath/i.test(c.name)) {
                    c.visible = false;
                }
            });
        }

        const openMmoXWeapons = {
            item_goblin_sword: 0.72,
            item_longsword: 0.98,
            item_greatsword: 1.28,
            item_rune_blade: 1.22,
            item_morningstar: 0.82,
            item_flail: 0.78,
            item_greatclub: 1.18,
            item_spear: 1.68,
            item_bow: 1.18,
            item_torch: 0.58
        };
        const phYWeapons = {
            ph_dagger: { span: 0.44, rotY: -Math.PI * 0.5, gripFrac: 0.20 },
            ph_hatchet: { span: 0.52, rotY: 0, gripFrac: 0.22 },
            ph_axe: { span: 0.74, rotY: 0, gripFrac: 0.22 },
            ph_mace: { span: 0.68, rotY: -Math.PI * 0.5, gripFrac: 0.20 },
            ph_hammer: { span: 0.74, rotY: -Math.PI * 0.5, gripFrac: 0.22 },
            ph_sledgehammer: { span: 1.02, rotY: -Math.PI * 0.5, gripFrac: 0.25 },
            ph_saber: { span: 0.88, rotY: 0, gripFrac: 0.16 },
            ph_katana: { span: 0.94, rotY: Math.PI * 0.5, gripFrac: 0.18 },
            ph_estoc: { span: 1.04, rotY: -Math.PI * 0.5, gripFrac: 0.14 }
        };

        let combatSpan = 0.75;
        let scaleMult = 1.0;
        if (openMmoXWeapons[itemKey] !== undefined) {
            combatSpan = openMmoXWeapons[itemKey];
            if (itemKey === 'item_spear') {
                // spear.glb has its spearhead tip at -X (min X = -2.019) and butt at +X (+0.155): map raw -X -> canonical +Y (upward shaft)
                const spearBasis = new THREE.Matrix4().makeBasis(
                    new THREE.Vector3(0, -1, 0),
                    new THREE.Vector3(0, 0, 1),
                    new THREE.Vector3(-1, 0, 0)
                );
                scene.quaternion.setFromRotationMatrix(spearBasis);
                scene.position.set(0, -0.36, 0);
            } else {
                // Raw OpenMMO weapons: +X is shaft (pommel->tip), +Y is blade edge / bow curve, +Z is thickness
                // Map raw +X -> canonical +Y (shaft), raw +Y -> canonical +Z (edge/front), raw +Z -> canonical +X
                const basis = new THREE.Matrix4().makeBasis(
                    new THREE.Vector3(0, 1, 0),
                    new THREE.Vector3(0, 0, 1),
                    new THREE.Vector3(1, 0, 0)
                );
                scene.quaternion.setFromRotationMatrix(basis);
                if (itemKey === 'item_bow') {
                    const c = wClone._rawCenter || new THREE.Vector3();
                    scene.position.set(0, 0, -c.x);
                } else {
                    scene.position.set(0, 0.04, 0);
                }
            }
        } else if (itemKey === 'item_halberd') {
            combatSpan = 1.72;
            const c = wClone._rawCenter || new THREE.Vector3();
            scene.rotation.set(-Math.PI / 2, 0, 0);
            scene.position.set(-c.x, 0, -c.z);
        } else if (itemKey === 'item_crossbow') {
            combatSpan = 0.72;
            const c = wClone._rawCenter || new THREE.Vector3();
            scene.position.set(-c.x, -c.y, -c.z);
        } else if (phYWeapons[itemKey]) {
            const cfgW = phYWeapons[itemKey];
            combatSpan = cfgW.span;
            const rMin = wClone._rawMin || new THREE.Vector3(0, -0.25, 0);
            const rSize = wClone._rawSize || new THREE.Vector3(0.1, 0.6, 0.1);
            const gripY = -(rMin.y + rSize.y * (cfgW.gripFrac || 0.20));
            scene.rotation.set(0, cfgW.rotY, 0);
            scene.position.set(0, gripY, 0);
        } else if (itemKey === 'item_shovel') {
            combatSpan = 0.86;
            // rusted_spade_01: scoop is at -Y, handle at +Y; flip 180 deg Z so scoop is at +Y top and face scoop forward
            scene.rotation.set(0, -0.35, Math.PI);
            scene.position.set(0, 0.16, 0);
        } else if (itemKey === 'item_pickaxe') {
            combatSpan = 0.84;
            // picke_dirty_01: iron pick head is at +Y, prongs along X; rotate -90 deg Y so prongs point along +Z
            scene.rotation.set(0, -Math.PI * 0.5, 0);
            scene.position.set(0, 0.16, 0);
        } else if (itemKey === 'item_staff_branch' || itemKey === 'item_staff' || itemKey === 'item_wand' || itemKey === 'item_rod') {
            const isShortFocus = (itemKey === 'item_wand' || itemKey === 'item_rod');
            combatSpan = isShortFocus ? 0.64 : 1.16;
            const c = wClone._rawCenter || new THREE.Vector3();
            const rMin = wClone._rawMin || new THREE.Vector3(0, -0.5, 0);
            const rSize = wClone._rawSize || new THREE.Vector3(0.1, 1.0, 0.1);
            const gripFrac = isShortFocus ? 0.26 : 0.38;
            const gripY = -(rMin.y + rSize.y * gripFrac);
            scene.position.set(-c.x, gripY, -c.z);
            innerPivot.position.y = 0.04;
            scaleMult = 1.0;
        } else if (itemKey === 'item_shield_wicker' || itemKey === 'ph_shield' || itemKey === 'item_shield_wooden' || itemKey === 'item_shield_raven' || itemKey === 'item_shield_leather' || itemKey === 'item_shield_metal') {
            combatSpan = itemKey === 'ph_shield' ? 0.72 : (itemKey === 'item_shield_wicker' ? 0.56 : 0.62);
            const c = wClone._rawCenter || new THREE.Vector3();
            scene.position.set(-c.x, -c.y, -c.z);
        } else if (itemKey === 'ph_lantern' || itemKey === 'item_phial') {
            combatSpan = itemKey === 'item_phial' ? 0.32 : 0.38;
            const c = wClone._rawCenter || new THREE.Vector3();
            const mx = wClone._rawMax || new THREE.Vector3(0, 0.5, 0);
            scene.position.set(-c.x, itemKey === 'item_phial' ? -c.y : -mx.y, -c.z);
        } else {
            const c = wClone._rawCenter || new THREE.Vector3();
            scene.position.set(-c.x, -c.y, -c.z);
        }

        const rawMaxDim = Math.max(0.001, wClone._rawMaxDim || 1.0);
        const s = (combatSpan / rawMaxDim) * scaleMult;
        innerPivot.scale.set(s, s, s);
        if (itemKey === 'item_staff_branch') {
            innerPivot.scale.set(s, s, s);
        }
        if (itemKey === 'item_shield_wicker' || itemKey === 'ph_shield' || itemKey === 'item_shield_wooden' || itemKey === 'item_shield_raven' || itemKey === 'item_shield_leather' || itemKey === 'item_shield_metal') {
            innerPivot.position.z = 0.04;
            innerPivot.position.y = 0.02;
        }
        return wClone;
    }

    _applyCombatArmPose(rootObj) {
        if (!rootObj) return;
        const instRoot = rootObj.creatureMesh || rootObj.mesh || rootObj;
        const isAnimatedMixer = Boolean(instRoot._mixer || rootObj._mixer);
        if (!isAnimatedMixer) return;

        const rigBones = rootObj._rigBones || (rootObj.mesh && rootObj.mesh._rigBones) || (rootObj.creatureMesh && rootObj.creatureMesh._rigBones);
        const atts = rootObj._heldAttachments || (rootObj.mesh && rootObj.mesh._heldAttachments) || (rootObj.creatureMesh && rootObj.creatureMesh._heldAttachments);
        if (!rigBones || !atts || atts.length === 0) return;

        const hasWeapon = atts.some(a => a.role === 'weapon' || a.role === 'lantern' || (!a.role && a.bone === rigBones.hand_r));
        const hasShield = atts.some(a => a.role === 'shield' || a.role === 'bow' || (!a.role && (a.bone === rigBones.hand_l || a.bone === rigBones.lowerarm_l)));
        if (!hasWeapon && !hasShield) return;

        this._tmpArmPPos = this._tmpArmPPos || new THREE.Vector3();
        this._tmpArmCPos = this._tmpArmCPos || new THREE.Vector3();
        this._tmpArmTgt = this._tmpArmTgt || new THREE.Vector3();
        this._tmpArmUpper = this._tmpArmUpper || new THREE.Vector3();
        this._tmpArmLower = this._tmpArmLower || new THREE.Vector3();
        this._tmpArmDeltaQ = this._tmpArmDeltaQ || new THREE.Quaternion();
        this._tmpArmPWorldQ = this._tmpArmPWorldQ || new THREE.Quaternion();
        this._tmpArmLocalQ = this._tmpArmLocalQ || new THREE.Quaternion();
        this._tmpArmRootQ = this._tmpArmRootQ || new THREE.Quaternion();

        const swingBone = (parentBone, childBone, targetWorldDir) => {
            if (!parentBone || !childBone) return;
            parentBone.updateWorldMatrix(true, false);
            childBone.updateWorldMatrix(false, false);
            this._tmpArmPPos.setFromMatrixPosition(parentBone.matrixWorld);
            this._tmpArmCPos.setFromMatrixPosition(childBone.matrixWorld);
            const curDir = this._tmpArmCPos.sub(this._tmpArmPPos);
            if (curDir.lengthSq() < 1e-6) return;
            curDir.normalize();
            const tgtDir = this._tmpArmTgt.copy(targetWorldDir).normalize();
            this._tmpArmDeltaQ.setFromUnitVectors(curDir, tgtDir);
            parentBone.getWorldQuaternion(this._tmpArmPWorldQ);
            this._tmpArmLocalQ.copy(this._tmpArmPWorldQ).invert().multiply(this._tmpArmDeltaQ).multiply(this._tmpArmPWorldQ);
            parentBone.quaternion.multiply(this._tmpArmLocalQ);
            parentBone.updateWorldMatrix(false, false);
            childBone.updateWorldMatrix(false, false);
        };

        instRoot.updateWorldMatrix(true, false);
        instRoot.getWorldQuaternion(this._tmpArmRootQ);

        if (hasWeapon && rigBones.upperarm_r && rigBones.lowerarm_r && rigBones.hand_r) {
            this._tmpArmUpper.set(-0.30, -0.82, 0.48).applyQuaternion(this._tmpArmRootQ);
            this._tmpArmLower.set(-0.18, 0.18, 0.96).applyQuaternion(this._tmpArmRootQ);
            swingBone(rigBones.upperarm_r, rigBones.lowerarm_r, this._tmpArmUpper);
            swingBone(rigBones.lowerarm_r, rigBones.hand_r, this._tmpArmLower);
        }
        if (hasShield && rigBones.upperarm_l && rigBones.lowerarm_l && rigBones.hand_l) {
            this._tmpArmUpper.set(0.28, -0.80, 0.52).applyQuaternion(this._tmpArmRootQ);
            this._tmpArmLower.set(-0.14, 0.14, 0.98).applyQuaternion(this._tmpArmRootQ);
            swingBone(rigBones.upperarm_l, rigBones.lowerarm_l, this._tmpArmUpper);
            swingBone(rigBones.lowerarm_l, rigBones.hand_l, this._tmpArmLower);
        }
    }

    _stabilizeHeldEquipment(entity) {
        // # ROOT-CAUSE: Release world-quaternion arm lock during active attack/hit/death clips and wire LoopOnce actions
        if (entity && (entity._attackLungeTimer > 0 || entity._hitFlinchTimer > 0 || entity._isDying)) {
            return;
        }
        this._applyCombatArmPose(entity);
        const list = entity && (entity._heldAttachments || (entity.creatureMesh && entity.creatureMesh._heldAttachments) || (entity.mesh && entity.mesh._heldAttachments));
        if (!list || !list.length) return;
        const instObj = entity.creatureMesh || entity.mesh || entity;
        instObj.updateWorldMatrix(true, false);
        this._tmpInstQ = this._tmpInstQ || new THREE.Quaternion();
        this._tmpBoneQ = this._tmpBoneQ || new THREE.Quaternion();
        instObj.getWorldQuaternion(this._tmpInstQ).invert();
        for (let i = 0; i < list.length; i++) {
            const att = list[i];
            if (!att || !att.clone || !att.bone || !att.targetCharQ) continue;
            att.bone.updateWorldMatrix(true, false);
            att.bone.getWorldQuaternion(this._tmpBoneQ);
            this._tmpBoneQ.premultiply(this._tmpInstQ).invert().multiply(att.targetCharQ);
            att.clone.quaternion.copy(this._tmpBoneQ);
            att.clone.updateWorldMatrix(false, false);
        }
    }

    _instantiateMonster3DFromTemplate(cfg) {
        if (!cfg || !cfg.templateKey) return null;
        const tmpl = this._monster3DTemplates && this._monster3DTemplates.get(cfg.templateKey);
        if (!tmpl) return null;

        const instance = this._cloneSkinnedGltf(tmpl);
        if (!instance) return null;

        this._poseRigNaturalStance(instance, cfg);

        if (cfg.scaleX && cfg.scaleY && cfg.scaleZ) {
            instance.scale.multiply(new THREE.Vector3(cfg.scaleX, cfg.scaleY, cfg.scaleZ));
        } else if (cfg.scaleY && cfg.scaleXZ) {
            instance.scale.multiply(new THREE.Vector3(cfg.scaleXZ, cfg.scaleY, cfg.scaleXZ));
        } else if (cfg.scale) {
            instance.scale.multiplyScalar(cfg.scale);
        }

        const isWormMass = (cfg.templateKey === 'bestiary_worm_mass');
        const effTintHex = cfg.tintHex || (isWormMass ? 0x16a34a : null);
        if (effTintHex || cfg.emissiveHex || cfg.roughness !== undefined || cfg.metalness !== undefined || isWormMass) {
            this._tintedMatPool = this._tintedMatPool || new Map();
            const tintCol = effTintHex ? new THREE.Color(effTintHex) : null;
            const emissiveCol = cfg.emissiveHex ? new THREE.Color(cfg.emissiveHex) : null;
            const armorDarkCol = new THREE.Color(0x2e2a24);
            const bypassMat001 = Boolean(isWormMass || cfg.roughness !== undefined || cfg.tintStrength !== undefined);
            const tintSingleMat = (oldMat, meshName, isSkinned, hasVColor = false) => {
                if (!oldMat) return oldMat;
                const singleName = (oldMat.name || '').toLowerCase();
                const combinedName = singleName + '_' + meshName;
                if (/eye|pupil|iris|sclera|teeth|tooth|fang|horn|claw|maw|bone|spore|core|pustule|snout|metal|steel|iron|blade|weapon|illithid_eye|^red$|superhero|regular/i.test(combinedName)) {
                    return oldMat;
                }
                if (!bypassMat001 && /material\.001/i.test(combinedName)) {
                    return oldMat;
                }
                const hasTexMap = Boolean(oldMat.map);
                const poolKey = `${oldMat.uuid}_${effTintHex || ''}_${cfg.emissiveHex || ''}_${cfg.roughness ?? ''}_${cfg.metalness ?? ''}_${cfg.tintStrength ?? ''}_${isWormMass}_${Boolean(cfg.isOrcish)}_${Boolean(cfg.tunicOnlyTint)}_${Boolean(hasVColor)}_${hasTexMap}`;
                let pooledMat = this._tintedMatPool.get(poolKey);
                if (!pooledMat) {
                    if (this._tintedMatPool.size >= 256) {
                        for (const [kEvict, vEvict] of this._tintedMatPool) {
                            if (!vEvict || (vEvict._refCount || 0) <= 0) {
                                this._tintedMatPool.delete(kEvict);
                                if (vEvict && typeof vEvict.dispose === 'function') vEvict.dispose();
                                break;
                            }
                        }
                    }
                    pooledMat = oldMat.clone();
                    pooledMat._sharedMaterial = true;
                    pooledMat._pooledKey = poolKey;
                    pooledMat._refCount = 0;
                    if (oldMat.onBeforeCompile) pooledMat.onBeforeCompile = oldMat.onBeforeCompile;
                    if (oldMat.customProgramCacheKey) pooledMat.customProgramCacheKey = oldMat.customProgramCacheKey;
                    if (!(window.Dungeon3DCompat && window.Dungeon3DCompat.isV2()) && (isSkinned || oldMat.skinning)) {
                        pooledMat.skinning = true;
                    }
                    if (pooledMat.color && tintCol) {
                        const customTintStr = Number.isFinite(cfg.tintStrength) ? cfg.tintStrength : (isWormMass ? 0.88 : null);
                        if (hasTexMap) {
                            const rawLum = pooledMat.color.r * 0.299 + pooledMat.color.g * 0.587 + pooledMat.color.b * 0.114;
                            if (rawLum > 0.14) {
                                const minLum = cfg.templateKey === 'bestiary_wolf' ? 0.42 : 0.68;
                                const baseLum = Math.min(1.0, Math.max(minLum, rawLum));
                                const defaultStr = cfg.templateKey === 'bestiary_dragon' ? 0.80 : (cfg.templateKey === 'bestiary_wolf' ? 0.46 : 0.72);
                                pooledMat.color.setRGB(baseLum, baseLum, baseLum).lerp(tintCol, customTintStr !== null ? customTintStr : defaultStr);
                            }
                        } else if (cfg.isOrcish) {
                            const isSkin = meshName.includes('sphere.005') || meshName.includes('retopology') || meshName.includes('superhero');
                            pooledMat.color.lerp(isSkin ? tintCol : armorDarkCol, isSkin ? 0.68 : 0.58);
                        } else if (hasVColor) {
                            pooledMat.color.lerp(tintCol, customTintStr !== null ? customTintStr : 0.88);
                        } else {
                            pooledMat.color.lerp(tintCol, customTintStr !== null ? customTintStr : (cfg.tunicOnlyTint ? 0.45 : 0.55));
                        }
                    }
                    if (Number.isFinite(cfg.roughness)) pooledMat.roughness = cfg.roughness;
                    else if (isWormMass) pooledMat.roughness = 0.16;
                    if (Number.isFinite(cfg.metalness)) pooledMat.metalness = cfg.metalness;
                    else if (isWormMass) pooledMat.metalness = 0.08;
                    if (emissiveCol && pooledMat.emissive) {
                        pooledMat.emissive.copy(emissiveCol);
                        pooledMat.emissiveIntensity = /belly|light|accent|stripe|mane|tail|ear/i.test(singleName) ? 0.85 : (hasTexMap ? 0.22 : 0.32);
                    } else if (isWormMass && tintCol && pooledMat.emissive) {
                        pooledMat.emissive.copy(tintCol);
                        pooledMat.emissiveIntensity = 0.12;
                    } else if (hasTexMap && tintCol && cfg.isBoss && pooledMat.emissive) {
                        pooledMat.emissive.copy(tintCol);
                        pooledMat.emissiveIntensity = 0.16;
                    }
                } else {
                    this._tintedMatPool.delete(poolKey);
                }
                this._tintedMatPool.set(poolKey, pooledMat);
                pooledMat._refCount = (pooledMat._refCount || 0) + 1;
                return pooledMat;
            };
            instance.traverse(c => {
                if ((c.isMesh || c.isSkinnedMesh) && c.material) {
                    const meshName = ((c.name || '') + ' ' + (c.geometry ? c.geometry.name || '' : '')).toLowerCase();
                    if (cfg.tunicOnlyTint && !meshName.includes('peasant_body')) {
                        return;
                    }
                    const firstMat = Array.isArray(c.material) ? c.material[0] : c.material;
                    const hasTexMap = Boolean(firstMat && firstMat.map);
                    const hasVColor = Boolean(!hasTexMap && c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                    if (hasVColor && effTintHex && c.geometry) {
                        // Normalize vibrant multi-hue COLOR_0 to luminance shading so tintHex applies cleanly on untextured vertex-colored meshes
                        if (!c.geometry._grayColorClone) {
                            const gClone = c.geometry.clone();
                            gClone._sharedGeometry = true;
                            const colAttr = gClone.attributes.color;
                            if (colAttr) {
                                const itemSz = colAttr.itemSize || 3;
                                for (let vi = 0; vi < colAttr.count; vi++) {
                                    const r = colAttr.getX(vi);
                                    const g = colAttr.getY(vi);
                                    const b = colAttr.getZ(vi);
                                    const lum = Math.min(1.0, Math.max(0.42, (0.299 * r + 0.587 * g + 0.114 * b) * 0.85 + 0.32));
                                    if (itemSz >= 4) {
                                        colAttr.setXYZW(vi, lum, lum, lum, colAttr.getW(vi));
                                    } else {
                                        colAttr.setXYZ(vi, lum, lum, lum);
                                    }
                                }
                                colAttr.needsUpdate = true;
                            }
                            c.geometry._grayColorClone = gClone;
                        }
                        c.geometry = c.geometry._grayColorClone;
                    }
                    if (Array.isArray(c.material)) {
                        c.material = c.material.map(m => tintSingleMat(m, meshName, c.isSkinnedMesh, hasVColor));
                    } else {
                        c.material = tintSingleMat(c.material, meshName, c.isSkinnedMesh, hasVColor);
                    }
                }
            });
        }

        let animClips = (instance._animations && instance._animations.length > 0)
            ? instance._animations
            : (tmpl._animations && tmpl._animations.length > 0 ? tmpl._animations : null);
        if (animClips && animClips.length > 0) {
            this._bindCreatureClips(instance, animClips, cfg);
        }
        instance.templateKey = cfg.templateKey;

        const creatureRatio = Math.max(0.58, Math.min(1.35, (tmpl.actualHeight || tmpl.baseHeight || 1.72) / 1.75));
        instance._heldAttachments = [];

        if (cfg.weaponKey) {
            instance.traverse(c => {
                if (c.name && /^(Puglin_Stick|Imp_Mace)$/i.test(c.name)) {
                    c.visible = false;
                }
            });
            const attachWeapon = (wTmpl) => {
                if (!wTmpl || !instance._rigBones) return;
                const handBone = (cfg.weaponKey === 'item_bow' && instance._rigBones.hand_l)
                    ? instance._rigBones.hand_l
                    : instance._rigBones.hand_r;
                if (!handBone) return;
                const wClone = this._cloneCachedGltfTemplate(wTmpl, null, cfg.weaponKey);
                if (!wClone) return;
                this._prepareCanonicalHeldClone(wClone, cfg.weaponKey);

                instance.updateMatrixWorld(true);
                const bScale = new THREE.Vector3();
                handBone.getWorldScale(bScale);
                const ws = creatureRatio / Math.max(0.0001, bScale.y || 1.0);
                wClone.scale.set(ws, ws, ws);
                handBone.add(wClone);
                wClone.position.set(0, 0, 0);

                const fingerBone = (handBone === instance._rigBones.hand_l) ? instance._rigBones.middle_01_l : instance._rigBones.middle_01_r;
                if (handBone._palmLocalOffset) {
                    wClone.position.copy(handBone._palmLocalOffset);
                } else if (fingerBone && fingerBone !== handBone) {
                    const wPos = new THREE.Vector3();
                    const fPos = new THREE.Vector3();
                    handBone.getWorldPosition(wPos);
                    fingerBone.getWorldPosition(fPos);
                    wPos.lerp(fPos, 0.68);
                    handBone.worldToLocal(wPos);
                    wClone.position.copy(wPos);
                }

                instance.updateMatrixWorld(true);
                const instWorldQ = instance.getWorldQuaternion(new THREE.Quaternion());
                const boneWorldQ = handBone.getWorldQuaternion(new THREE.Quaternion());
                const boneCharQ = instWorldQ.clone().invert().multiply(boneWorldQ);

                let yChar, zChar;
                if (cfg.weaponKey === 'item_bow' || cfg.weaponKey === 'item_crossbow') {
                    yChar = new THREE.Vector3(-0.10, 0.98, 0.12).normalize();
                    zChar = new THREE.Vector3(0.28, -0.08, 0.96).normalize();
                } else if (cfg.weaponKey === 'ph_lantern' || cfg.weaponKey === 'item_phial') {
                    yChar = new THREE.Vector3(0.0, 1.0, 0.0);
                    zChar = new THREE.Vector3(0.35, 0.0, 0.94).normalize();
                } else if (cfg.weaponKey === 'item_spear' || cfg.weaponKey === 'item_halberd' || cfg.weaponKey === 'item_staff_branch' || cfg.weaponKey === 'item_staff' || cfg.weaponKey === 'item_wand' || cfg.weaponKey === 'item_rod') {
                    yChar = new THREE.Vector3(-0.12, 0.88, 0.46).normalize();
                    zChar = new THREE.Vector3(0.42, -0.40, 0.81).normalize();
                } else {
                    yChar = new THREE.Vector3(-0.16, 0.84, 0.52).normalize();
                    zChar = new THREE.Vector3(0.46, -0.44, 0.77).normalize();
                }
                const xChar = new THREE.Vector3().crossVectors(yChar, zChar).normalize();
                zChar.crossVectors(xChar, yChar).normalize();
                const basisMat = new THREE.Matrix4().makeBasis(xChar, yChar, zChar);
                const targetCharQ = new THREE.Quaternion().setFromRotationMatrix(basisMat);
                const role = (cfg.weaponKey === 'item_bow' || cfg.weaponKey === 'item_crossbow') ? 'bow' : ((cfg.weaponKey === 'ph_lantern' || cfg.weaponKey === 'item_phial') ? 'lantern' : 'weapon');
                instance._heldAttachments.push({ clone: wClone, bone: handBone, targetCharQ: targetCharQ.clone(), role });
                this._stabilizeHeldEquipment(instance);
            };
            if (this._gltfTemplateCache && this._gltfTemplateCache.has(cfg.weaponKey)) {
                attachWeapon(this._gltfTemplateCache.get(cfg.weaponKey));
            } else {
                this._ensurePolyHavenFloorItem(cfg.weaponKey).then(attachWeapon).catch(() => {});
            }
        }

        if (cfg.shieldKey) {
            const attachShield = (sTmpl) => {
                if (!sTmpl || !instance._rigBones) return;
                const shieldBone = instance._rigBones.hand_l || instance._rigBones.lowerarm_l;
                if (!shieldBone) return;
                const sClone = this._cloneCachedGltfTemplate(sTmpl, null, cfg.shieldKey);
                if (!sClone) return;
                this._prepareCanonicalHeldClone(sClone, cfg.shieldKey);

                instance.updateMatrixWorld(true);
                const bScale = new THREE.Vector3();
                shieldBone.getWorldScale(bScale);
                const ss = creatureRatio / Math.max(0.0001, bScale.y || 1.0);
                sClone.scale.set(ss, ss, ss);
                shieldBone.add(sClone);
                if (shieldBone._palmLocalOffset) {
                    sClone.position.copy(shieldBone._palmLocalOffset);
                } else if (shieldBone === instance._rigBones.lowerarm_l) {
                    sClone.position.set(0, 0.18 * ss, 0.03 * ss);
                } else {
                    sClone.position.set(0, 0, 0);
                }

                instance.updateMatrixWorld(true);
                const instWorldQ = instance.getWorldQuaternion(new THREE.Quaternion());
                const boneWorldQ = shieldBone.getWorldQuaternion(new THREE.Quaternion());
                const boneCharQ = instWorldQ.clone().invert().multiply(boneWorldQ);

                const yChar = new THREE.Vector3(0.0, 0.99, -0.08).normalize();
                const zChar = new THREE.Vector3(0.28, 0.08, 0.95).normalize();
                const xChar = new THREE.Vector3().crossVectors(yChar, zChar).normalize();
                yChar.crossVectors(zChar, xChar).normalize();
                const basisMat = new THREE.Matrix4().makeBasis(xChar, yChar, zChar);
                const targetCharQ = new THREE.Quaternion().setFromRotationMatrix(basisMat);
                sClone.quaternion.copy(boneCharQ.clone().invert().multiply(targetCharQ));
                instance._heldAttachments.push({ clone: sClone, bone: shieldBone, targetCharQ: targetCharQ.clone(), role: 'shield' });
                this._stabilizeHeldEquipment(instance);
            };
            if (this._gltfTemplateCache && this._gltfTemplateCache.has(cfg.shieldKey)) {
                attachShield(this._gltfTemplateCache.get(cfg.shieldKey));
            } else {
                this._ensurePolyHavenFloorItem(cfg.shieldKey).then(attachShield).catch(() => {});
            }
        }

        instance.isReal3DMonster = true;
        instance.isBillboard = false;
        const baseH = tmpl.actualHeight || tmpl.baseHeight || 1.0;
        instance.baseHeight = baseH * (cfg.scaleY || cfg.scale || 1.0);
        instance.baseWidth = (tmpl.baseWidth || 0.85) * (cfg.scaleXZ || cfg.scaleX || cfg.scale || 1.0);

        if (cfg.isFloating || cfg.floating) {
            instance.position.y = (cfg.floatHeight || 0.36);
        }

        return instance;
    }

    createMonster3DEntity(m, isTargeted, isSensed) {
        const root = new THREE.Group();
        const glyph = (m.glyph && m.glyph.trim()) ? m.glyph.trim() : '?';
        const colorHex = getAngbandColorString(m.attr);

        let mesh = null;
        let modelHeight = 1.25;
        let isFloating = false;

        const cfg = this.resolveMonster3DConfig(m, glyph);
        root.config = cfg;
        root.modelGender = cfg.gender || 'male';
        root.modelKey = cfg.templateKey;
        root.isFemale = (root.modelGender === 'female');
        m.modelGender = root.modelGender;
        m.gender = root.modelGender;
        m.modelKey = root.modelKey;
        m.isFemale = root.isFemale;

        mesh = this._instantiateMonster3DFromTemplate(cfg);
        if (mesh) {
            root.isReal3DMonster = true;
            root.isBillboard = false;
            root.pending3DConfig = null;
            modelHeight = mesh.baseHeight || 1.0;
            isFloating = Boolean(cfg.isFloating || cfg.floating);
            // # ROOT-CAUSE: Copy extracted attack/hit/death AnimationActions to root entity, prevent double updateMonsters per frame, defer dying monster cleanup for 380ms death choreography, and build distinct 3D ring/whip/single-book/shield geometries in _loadCachedGltf.
            if (mesh._mixer) {
                root._mixer = mesh._mixer;
                root._idleAction = mesh._idleAction;
                root._walkAction = mesh._walkAction;
                root._attackAction = mesh._attackAction;
                root._hitAction = mesh._hitAction;
                root._deathAction = mesh._deathAction;
                root._activeAnimState = mesh._activeAnimState;
            }
            root._heldAttachments = mesh._heldAttachments;
            if (!isFloating) modelHeight = Math.max(0.34, modelHeight);
        } else {
            this._ensureMonster3DTemplate(cfg.templateKey);
            mesh = new THREE.Group();
            root.pending3DConfig = cfg;
            root.isReal3DMonster = false;
            root.isBillboard = false;
            isFloating = Boolean(cfg.isFloating || cfg.floating);
            modelHeight = isFloating ? (1.0 * (cfg.scaleY || cfg.scale || 1.0)) : Math.max(0.34, 1.0 * (cfg.scaleY || cfg.scale || 1.0));
        }

        root.add(mesh);

        // Soft ground contact shadow disc anchoring creature to floor
        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.contactShadows) && this.shadowGeo && this.shadowMat) {
            const shadowDisc = new THREE.Mesh(this.shadowGeo, this.shadowMat);
            shadowDisc.position.set(0, -0.042, 0);
            const footprint = Math.max(0.76, Math.min(2.1, (mesh.baseWidth || 1.05) * 1.12));
            shadowDisc.scale.set(footprint, footprint, footprint);
            root.add(shadowDisc);
            root.contactShadow = shadowDisc;
        }

        // Golden / Crimson 3D Ground Aura Ring for Unique & Boss Monsters
        const rawRaceCheck = String(m.race || m.name || '');
        const isIconicDreadBoss = Boolean(cfg.isMorgoth || cfg.isBalrog || /morgoth|sauron|balrog|gothmog|ungoliant|serpent of chaos|cyberdemon/i.test(rawRaceCheck));
        if (m.unique || cfg.isBoss || isIconicDreadBoss || /carcharoth|yendor|cthulhu|orochi|shuten/i.test(rawRaceCheck)) {
            m.isBoss = true;
            if (!this._sharedBossRingGeo) {
                this._sharedBossRingGeo = new THREE.RingGeometry(0.48, 0.62, 32);
                this._sharedBossRingGeo.rotateX(-Math.PI / 2);
                this._sharedBossRingGeo._sharedGeometry = true;
            }
            if (!this._sharedBossRingMat) {
                this._sharedBossRingMat = new THREE.MeshBasicMaterial({
                    color: 0xfbbf24,
                    transparent: true,
                    opacity: 0.72,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                this._sharedBossRingMat._sharedMaterial = true;
            }
            if (isIconicDreadBoss && !this._sharedMorgothRingMat) {
                this._sharedMorgothRingMat = new THREE.MeshBasicMaterial({
                    color: 0xdc2626,
                    transparent: true,
                    opacity: 0.80,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                this._sharedMorgothRingMat._sharedMaterial = true;
            }
            const bossRing = new THREE.Mesh(this._sharedBossRingGeo, isIconicDreadBoss ? this._sharedMorgothRingMat : this._sharedBossRingMat);
            bossRing.position.set(0, 0.014, 0);
            if (isIconicDreadBoss) bossRing.scale.set(1.28, 1.0, 1.28);
            root.add(bossRing);
            root.bossRing = bossRing;
        }
        this._syncMonsterAttitudeRing(root, m);

        // Diegetic obsidian & gold nameplate
        const nameplate = this.createNameplateSprite(m, isTargeted, isSensed);
        if (nameplate) {
            nameplate.position.set(0, Math.min(2.55, Math.max(0.58, modelHeight + 0.24)), 0);
            nameplate.monsterData = m;
            root.add(nameplate);
            root.nameplate = nameplate;
        }

        root.creatureMesh = mesh;
        root.templateKey = cfg.templateKey;
        root.glyph = glyph;
        root.colorHex = colorHex;
        root.monsterData = m;
        root.modelHeight = modelHeight;
        root.isFloating = isFloating;
        root.isBillboard = false;

        return root;
    }

    _syncMonsterAttitudeRing(entity, m) {
        if (!entity || !m) return;
        const isPet = Boolean(m.isPet || m.is_pet || m.pet || m.attitude === 'pet');
        const isFriendly = Boolean(!isPet && (m.friendly || m.peaceful || m.attitude === 'friendly'));
        if (!isPet && !isFriendly) {
            if (entity.attitudeRing) entity.attitudeRing.visible = false;
            return;
        }
        if (!this._sharedBossRingGeo) {
            this._sharedBossRingGeo = new THREE.RingGeometry(0.48, 0.62, 32);
            this._sharedBossRingGeo.rotateX(-Math.PI / 2);
            this._sharedBossRingGeo._sharedGeometry = true;
        }
        if (isPet && !this._sharedPetRingMat) {
            this._sharedPetRingMat = new THREE.MeshBasicMaterial({
                color: 0x4ade80,
                transparent: true,
                opacity: 0.72,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this._sharedPetRingMat._sharedMaterial = true;
        }
        if (isFriendly && !this._sharedPeacefulRingMat) {
            this._sharedPeacefulRingMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.68,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this._sharedPeacefulRingMat._sharedMaterial = true;
        }
        const mat = isPet ? this._sharedPetRingMat : this._sharedPeacefulRingMat;
        if (!entity.attitudeRing) {
            const ring = new THREE.Mesh(this._sharedBossRingGeo, mat);
            ring.position.set(0, 0.012, 0);
            ring.scale.set(0.92, 1.0, 0.92);
            entity.add(ring);
            entity.attitudeRing = ring;
        } else {
            entity.attitudeRing.material = mat;
            entity.attitudeRing.visible = true;
        }
    }

    updateMonsters(monsters, player) {
        if (this._monstersUpdatedThisFrame) {
            this._monstersUpdatedThisFrame = false;
            return;
        }
        const activeIds = new Set();
        const targetId = (player && player.target && player.target.id !== undefined) ? player.target.id.toString() : null;
        const curUi = this.lastFrame && this.lastFrame.ui && this.lastFrame.ui.cursor;
        const curMonId = (curUi && curUi.active && curUi.mon_id !== undefined && curUi.mon_id !== null) ? String(curUi.mon_id) : null;

        const px = player ? player.x : 0;
        const py = player ? player.y : 0;
        const depth = player && player.depth !== undefined ? player.depth : 0;
        const outdoors = depth === 0;
        let monstersChanged = false;

        monsters.forEach(m => {
            const id = m.id !== undefined ? m.id.toString() : `${m.x}_${m.y}_${m.glyph}`;
            const mDistSq = (m.x - px) * (m.x - px) + (m.y - py) * (m.y - py);
            if (mDistSq > 1225 && !this.monsters.has(id)) return;
            if (mDistSq > 1444 && this.monsters.has(id)) {
                activeIds.add(id);
                const entity = this.monsters.get(id);
                entity.visible = false;
                return;
            }
            activeIds.add(id);

            m.name = m.name || m.race || 'creature';
            m.asleep = !!(m.asleep || m.is_asleep || m.sleeping || (m.csleep > 0));
            m.unwary = !!(m.unwary || m.alertness_label === 'unwary');
            m.paralyzed = !!(m.paralyzed || m.held);
            m.afraid = !!(m.afraid || m.is_fleeing);
            m.confused = !!(m.confused || m.is_confused);
            m.stunned = !!(m.stunned || m.is_stunned);
            m.fast = !!(m.fast || m.hasted);
            m.slow = !!(m.slow || m.slowed);
            m.breath = !!(m.breath || m.breathes || m.breather);
            const attKey = (m.isPet || m.is_pet || m.pet || m.attitude === 'pet')
                ? 'pet'
                : ((m.friendly || m.peaceful || m.attitude === 'friendly') ? 'friendly' : 'hostile');

            const cursorTargeted = Boolean(curUi && curUi.active && ((curMonId && curMonId === id) || (curUi.x === m.x && curUi.y === m.y)));
            const isTargeted = Boolean((targetId && targetId === id) || cursorTargeted);
            let entity = this.monsters.get(id);

            const wx = m.x * this.cellSize;
            const wz = m.y * this.cellSize;
            const baseY = 0.0;

            // Sensed / Invisible / Darkness Visibility Logic:
            let isTileLit = true;
            if (!outdoors && this.lastMap) {
                const flag = this.getFlagAt(this.lastMap, m.x, m.y);
                const inView = (flag & 0x2) !== 0;
                const lighting = (flag >> 2) & 0x3;
                const distSq = (m.x - px) ** 2 + (m.y - py) ** 2;
                isTileLit = inView && (lighting < 3 || distSq <= (this.torchRadius + 1) ** 2);
            }
            const isSensed = !isTileLit || !!m.invisible;
            const identitySig = `${this.realm || 'angband'}|${m.race || m.name || ''}|${m.glyph || ''}`;

            if (entity && entity.identitySig && entity.identitySig !== identitySig) {
                this.destroyEntity(entity);
                this.monsters.delete(id);
                entity = null;
            }

            if (!entity) {
                monstersChanged = true;
                entity = this.createMonster3DEntity(m, isTargeted, isSensed);
                entity.identitySig = identitySig;
                entity.position.set(wx, baseY, wz);
                entity.rotation.y = Math.atan2(px * this.cellSize - wx, py * this.cellSize - wz);
                entity.targetPos = new THREE.Vector3(wx, baseY, wz);
                entity.lastHp = m.hp;
                entity.initialHp = m.hp_max || m.hp;
                entity.lastSensed = isSensed;
                entity.lastTargeted = isTargeted;
                entity.lastAsleep = !!m.asleep;
                entity.lastUnwary = !!m.unwary;
                entity.lastParalyzed = !!m.paralyzed;
                entity.lastAfraid = !!m.afraid;
                entity.lastConfused = !!m.confused;
                entity.lastStunned = !!m.stunned;
                entity.lastFast = !!m.fast;
                entity.lastSlow = !!m.slow;
                entity.lastAttitude = attKey;
                entity.isAsleep = !!m.asleep;
                entity._bobPhase = ((m.x * 73 + m.y * 37) % 628) * 0.01;
                entity._perceptVis = outdoors ? 1.0 : 0.05;
                if (!outdoors && this.renderGovernor) this.renderGovernor.wake(220);
                entity.monsterData = m;
                if (entity.creatureMesh) entity.creatureMesh.monsterData = m;
                if (entity.nameplate) entity.nameplate.monsterData = m;
                this.scene.add(entity);
                this.monsters.set(id, entity);
            } else {
                entity.identitySig = identitySig;
                if (entity.position.x !== wx || entity.position.z !== wz || (entity.targetPos && (entity.targetPos.x !== wx || entity.targetPos.z !== wz))) {
                    monstersChanged = true;
                }
                entity.targetPos.set(wx, baseY, wz);
                entity.isAsleep = !!m.asleep;
                if (entity.config) {
                    m.modelGender = entity.config.gender || 'male';
                    m.gender = entity.config.gender || 'male';
                    m.modelKey = entity.config.templateKey;
                    m.isFemale = (m.modelGender === 'female' || m.modelKey === 'casual' || m.modelKey === 'witch');
                }
                entity.monsterData = m;
                if (entity.creatureMesh) entity.creatureMesh.monsterData = m;
                if (entity.nameplate) entity.nameplate.monsterData = m;

                // Auto-upgrade monster to true 3D rigged model once glTF/GLB template has loaded
                if (!entity.isReal3DMonster) {
                    const cfg = entity.pending3DConfig || this.resolveMonster3DConfig(m, entity.glyph);
                    const upgraded3D = this._instantiateMonster3DFromTemplate(cfg);
                    if (upgraded3D) {
                        entity.remove(entity.creatureMesh);
                        entity.creatureMesh = upgraded3D;
                        entity.add(upgraded3D);
                        entity.templateKey = cfg.templateKey;
                        entity.isFloating = Boolean(cfg.isFloating || cfg.floating);
                        entity.modelHeight = entity.isFloating
                            ? (upgraded3D.baseHeight || 1.0)
                            : Math.max(0.34, upgraded3D.baseHeight || 1.0);
                        entity.isReal3DMonster = true;
                        entity.isBillboard = false;
                        entity.pending3DConfig = null;
                        entity.isFallback = false;
                        if (upgraded3D._mixer) {
                            entity._mixer = upgraded3D._mixer;
                            entity._idleAction = upgraded3D._idleAction;
                            entity._walkAction = upgraded3D._walkAction;
                            entity._attackAction = upgraded3D._attackAction;
                            entity._hitAction = upgraded3D._hitAction;
                            entity._deathAction = upgraded3D._deathAction;
                            entity._activeAnimState = upgraded3D._activeAnimState;
                        }
                        entity._heldAttachments = upgraded3D._heldAttachments;
                        upgraded3D.monsterData = m;
                        if (entity.contactShadow) {
                            const footprint = Math.max(0.76, Math.min(2.1, (upgraded3D.baseWidth || 1.05) * 1.12));
                            entity.contactShadow.scale.set(footprint, footprint, footprint);
                        }
                        if (entity.nameplate) {
                            entity.nameplate.position.set(0, Math.min(2.55, Math.max(0.58, entity.modelHeight + 0.24)), 0);
                        }
                    }
                }

                // Monster HP delta tracking: Spawn floating damage numbers above entity head & flag attack state
                if (entity.lastHp !== undefined && m.hp !== undefined && m.hp < entity.lastHp) {
                    const dmg = entity.lastHp - m.hp;
                    entity.wasAttacked = true;
                    entity.lastDamageTaken = dmg;
                    entity.lastAttackedTime = Date.now();
                    entity._lastDamageFrame = this._frameCounter;
                    const textPos = new THREE.Vector3(wx, Math.min(2.80, entity.modelHeight + 0.45), wz);
                    this.spawnFloatingText(`-${dmg}`, textPos, '#ff9900', 1.20);
                    this.spawnHitSparks(new THREE.Vector3(wx, entity.modelHeight * 0.5, wz), getAngbandColorString(m.attr), 14);
                    if (this.audio) {
                        const pan = this.calculateStereoPan(wx, wz);
                        this.audio.playMonsterVocal(m.glyph || entity.glyph, 'grunt', pan);
                    }
                }

                if (entity.lastAsleep && !m.asleep) {
                    this.spawnFloatingText('!', new THREE.Vector3(wx, Math.min(2.85, entity.modelHeight + 0.55), wz), '#fde047', 1.25);
                }

                // Refresh nameplate & attitude ring in-place (zero DOM/VRAM allocations) when HP, status, attitude, target, or sensed changed
                if (entity.lastHp !== m.hp || entity.lastTargeted !== isTargeted || entity.lastAsleep !== m.asleep || entity.lastUnwary !== m.unwary || entity.lastParalyzed !== m.paralyzed || entity.lastAfraid !== m.afraid || entity.lastConfused !== m.confused || entity.lastStunned !== m.stunned || entity.lastFast !== m.fast || entity.lastSlow !== m.slow || entity.lastAttitude !== attKey || entity.lastSensed !== isSensed) {
                    if (entity.lastAttitude !== attKey) {
                        this._syncMonsterAttitudeRing(entity, m);
                    }
                    if (entity.nameplate) {
                        this.createNameplateSprite(m, isTargeted, isSensed, entity.nameplate);
                        entity.nameplate.position.set(0, Math.min(2.55, Math.max(0.58, entity.modelHeight + 0.24)), 0);
                    } else {
                        entity.nameplate = this.createNameplateSprite(m, isTargeted, isSensed);
                        entity.nameplate.position.set(0, Math.min(2.55, Math.max(0.58, entity.modelHeight + 0.24)), 0);
                        entity.add(entity.nameplate);
                    }
                    entity.lastHp = m.hp;
                    entity.lastTargeted = isTargeted;
                    entity.lastAsleep = m.asleep;
                    entity.lastUnwary = m.unwary;
                    entity.lastParalyzed = m.paralyzed;
                    entity.lastAfraid = m.afraid;
                    entity.lastConfused = m.confused;
                    entity.lastStunned = m.stunned;
                    entity.lastFast = m.fast;
                    entity.lastSlow = m.slow;
                    entity.lastAttitude = attKey;
                    entity.lastSensed = isSensed;
                }
            }

            if (entity.wasAttacked) {
                m.wasAttacked = true;
                m.lastAttackedTime = entity.lastAttackedTime;
                m.lastDamageTaken = entity.lastDamageTaken;
            }
            if (entity.initialHp && !m.hp_max) {
                m.hp_max = entity.initialHp;
            }
            if (entity._interactTurn) {
                m._interactTurn = entity._interactTurn;
            }

            entity.monsterData = m;

            // Synchronize with active Chronicle dialogue target in real-time
            if (window.chronicleManager && window.chronicleManager.targetedCreature) {
                const cur = window.chronicleManager.targetedCreature;
                if ((cur.id !== undefined && cur.id === m.id) || (cur.x === m.x && cur.y === m.y && cur.glyph === m.glyph)) {
                    if (cur._interactTurn && (!m._interactTurn || cur._interactTurn > m._interactTurn)) {
                        m._interactTurn = cur._interactTurn;
                        entity._interactTurn = cur._interactTurn;
                    }
                    window.chronicleManager.targetedCreature = m;
                }
            }

            // # ROOT-CAUSE: Keep monster entity hidden while its 3D GLB template is still pending so normal same-level gameplay never flashes an empty shadow disc or floating nameplate before the 3D mesh attaches.
            // In Angband, all monsters emitted in frame.monsters are detected / sensed by the player
            entity.visible = Boolean(entity.isReal3DMonster || m.invisible || !entity.pending3DConfig);
            if (m.invisible) {
                if (!entity.foggyAura) {
                    const aura = this.createFoggyMonsterAura(
                        entity.glyph || m.glyph || 'G',
                        m.race || m.name || '',
                        entity.colorHex || 0x66ccff,
                        entity.modelHeight || 1.4,
                        Boolean(entity.isFloating)
                    );
                    entity.foggyAura = aura;
                    entity.foggyMaterials = aura.foggyMaterials;
                    entity.groundRipples = aura.groundRipples;
                    entity.add(aura);
                }
                if (entity.creatureMesh) entity.creatureMesh.visible = false;
                entity.foggyAura.visible = true;
            } else {
                if (entity.creatureMesh) entity.creatureMesh.visible = true;
                if (entity.foggyAura) entity.foggyAura.visible = false;
            }
            if (entity.visible && this._applyBlindMonsterState) {
                const bfNow = (this.isPlayerBlind && this.isPlayerBlind(player)) ? Math.max(0.55, this._blindFactor || 1.0) : (this._blindFactor || 0.0);
                const hasEsp = Boolean(this.hasPlayerEsp && this.hasPlayerEsp(player));
                if (bfNow > 0.01 || entity._hasEspMatOverride || hasEsp) {
                    const mPx = player && player.x !== undefined ? player.x : (this.playerGridX || 0);
                    const mPy = player && player.y !== undefined ? player.y : (this.playerGridY || 0);
                    this._applyBlindMonsterState(entity, m, player, mPx, mPy, bfNow);
                }
            }
        });

        for (const [id, entity] of this.monsters.entries()) {
            if (!activeIds.has(id)) {
                monstersChanged = true;
                const md = entity.monsterData;
                const isLivingPet = Boolean(md && (md.isPet || md.is_pet) && (md.hp === undefined || md.hp > 0));
                if (entity.visible && this.audio && !isLivingPet && (entity.wasAttacked || entity._hitFlinchTimer > 0)) {
                    const pan = this.calculateStereoPan(entity.position.x, entity.position.z);
                    const hasLos = (entity.inLos !== false);
                    this.audio.playMonsterDeath(entity.glyph, {
                        worldSpace: true,
                        x: entity.position.x,
                        y: entity.position.y + (entity.modelHeight || 1.4) * 0.5,
                        z: entity.position.z,
                        pan,
                        hasLos,
                        occluded: !hasLos
                    });
                }
                if (!isLivingPet && entity.visible && (entity.wasAttacked || entity._hitFlinchTimer > 0) && !entity._isDying) {
                    entity._isDying = true;
                    const dClip = (entity._deathAction && typeof entity._deathAction.getClip === 'function') ? entity._deathAction.getClip() : null;
                    entity._deathDuration = (dClip && dClip.duration) ? Math.min(1.4, Math.max(0.38, dClip.duration)) : 0.38;
                    entity._deathTimer = entity._deathDuration;
                    if (entity.nameplate) entity.nameplate.visible = false;
                    if (entity._deathAction) {
                        entity._activeAnimState = 'death';
                        if (entity._idleAction) entity._idleAction.fadeOut(0.06);
                        if (entity._walkAction) entity._walkAction.fadeOut(0.06);
                        entity._deathAction.reset().fadeIn(0.05).play();
                    }
                    if (!this._dyingMonsters) this._dyingMonsters = [];
                    this._dyingMonsters.push(entity);
                    this.monsters.delete(id);
                } else if (!outdoors && entity.visible && !entity._isPerceptFading) {
                    entity._isPerceptFading = true;
                    entity._deathTimer = 0.14;
                    if (entity.nameplate) entity.nameplate.visible = false;
                    if (!this._dyingMonsters) this._dyingMonsters = [];
                    this._dyingMonsters.push(entity);
                    this.monsters.delete(id);
                    if (this.renderGovernor) this.renderGovernor.wake(220);
                } else {
                    this.destroyEntity(entity);
                    this.monsters.delete(id);
                }
            }
        }
        if (monstersChanged) this.markShadowsDirty();
    }

    refreshMonsterNameplates() {
        if (!this.monsters) return;
        const curUi = this.lastFrame && this.lastFrame.ui && this.lastFrame.ui.cursor;
        for (const [id, entity] of this.monsters.entries()) {
            if (entity && (entity.monsterData || (entity.nameplate && entity.nameplate.monsterData))) {
                const m = entity.monsterData || entity.nameplate.monsterData;
                const cursorTargeted = Boolean(curUi && curUi.active && ((curUi.mon_id !== undefined && String(curUi.mon_id) === id) || (curUi.x === m.x && curUi.y === m.y)));
                const isTargeted = Boolean((this.currentTarget && this.currentTarget.key === id) || cursorTargeted);
                const isSensed = !!(m.invisible || (m.detected && m.unlit));
                if (entity.nameplate) {
                    this.createNameplateSprite(m, isTargeted, isSensed, entity.nameplate);
                    entity.nameplate.position.set(0, Math.min(2.65, (entity.modelHeight || 1.6) + 0.35), 0);
                    entity.nameplate.monsterData = m;
                } else {
                    entity.nameplate = this.createNameplateSprite(m, isTargeted, isSensed);
                    entity.nameplate.position.set(0, Math.min(2.65, (entity.modelHeight || 1.6) + 0.35), 0);
                    entity.nameplate.monsterData = m;
                    entity.add(entity.nameplate);
                }
                entity.monsterData = m;
            }
        }
    }

    getItemObjKey(name, glyph, realmOverride) {
        if (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY && typeof window.MASTER_ITEM_REGISTRY.getItemObjKey === 'function') {
            return window.MASTER_ITEM_REGISTRY.getItemObjKey(name, glyph, realmOverride || this.realm || 'angband');
        }
        const lower = (name || '').toLowerCase();
        const g = glyph || '';

        // Digging Tools (Picks, Shovels, Spades) — Note: g === '\\' is Hafted Weapons in Angband/Variants, NEVER force all '\\' to shovel!
        if (/\b(pick|pickaxe|mattock|digger)\b/.test(lower)) return 'item_pickaxe';
        if (/\b(shovel|spade|trowel)\b/.test(lower)) return 'item_shovel';
        if (/\banvil\b/.test(lower)) return 'item_anvil';
        if (/\b(shrine candle|votive|candelabra)\b/.test(lower)) return 'item_shrine_candles';

        // Arrows, Bolts & Ammo
        if (g === '{' || /\b(arrow|bolt|quarrel|seeker|sheaf)\b/.test(lower)) {
            return 'item_arrow';
        }

        // Potions & Flasks
        if (g === '!' || /potion|elixir|draught|flask|tonic/.test(lower)) {
            if (/supreme|star|life|invulnerability|augmentation|experience/.test(lower)) return 'ph_potion_urn';
            if (/greater|critical|restore|mana|enlightenment|speed|healing/.test(lower)) return 'ph_potion_flask';
            return 'ph_potion_bottle';
        }

        // Books & Spellbooks
        if ((g === '?' && /\b(book|tome|grimoire|manual|prayer|spellbook)\b/.test(lower)) || g === '+' || /\b(book|tome|grimoire|manual|prayer|spellbook)\b/.test(lower)) {
            return 'item_book';
        }

        // Scrolls
        if (g === '?' || /scroll|parchment/.test(lower)) {
            if (/enchant|acquirement|artifact|rune|blessing|holy/.test(lower)) return 'item_scroll_enchant';
            return 'item_scroll';
        }

        // Bows, Crossbows & Slings
        if (/\b(crossbow|hand crossbow|arbalest|triple crossbow)\b/i.test(lower)) {
            return 'item_crossbow';
        }
        if (g === '}' || /bow|sling/.test(lower)) {
            return 'item_bow';
        }

        // Wands, Rods & Staves
        if (g === '_' || g === '-' || /\b(wand|staff|rod|quarterstaff)\b/.test(lower)) {
            if (/\bwands?\b/.test(lower)) return 'item_wand';
            if (/\brods?\b/.test(lower)) return 'item_rod';
            if (/\b(gnarled|branch|bough|druid|quiver)\b/.test(lower) && /\b(staff|staves)\b/.test(lower)) return 'item_staff_branch';
            if (/\b(staff|staves|quarterstaff)\b/.test(lower)) return 'item_staff';
            if (g === '-') return 'item_wand';
            return 'item_staff';
        }

        // Polearms
        if (/\b(halberd|glaive|guisarme|partisan|ranseur|spetum|voulge|bardiche|fauchard)\b/i.test(lower)) {
            return 'item_halberd';
        }
        if (g === '/' || /spear|pike|lance|trident|polearm/.test(lower)) {
            return 'item_spear';
        }

        // Amulets & Talismans (including Rogue ',' Amulet of Yendor)
        if (g === '"' || (g === ',' && /\b(yendor|amulet|talisman)\b/.test(lower)) || /\b(amulet|talisman|pendant|necklace|periapt)\b/.test(lower)) {
            return 'item_talisman';
        }

        // Rings ('=')
        if (g === '=' || (/\bring\b/.test(lower) && !/\b(ring mail|ringil)\b/.test(lower))) {
            return 'item_ring';
        }

        // Gems, Crystals, Silmarils & Lumenstones ('*')
        if (g === '*' || /\b(gem|jewel|diamond|ruby|emerald|sapphire|amethyst|topaz|opal|garnet|quartz|agate|jade|pearl|crystal|silmaril|lumenstone|arcanite)\b/.test(lower)) {
            return 'ph_crystal';
        }

        // Shields
        if (g === '(' || (g === ')' && /shield|buckler|targe/.test(lower)) || /shield|buckler|targe/.test(lower)) {
            if (/\b(wicker|buckler|basket)\b/.test(lower)) return 'item_shield_wicker';
            if (/\bleather\b/.test(lower) && /shield|targe/.test(lower)) return 'item_shield_leather';
            if (/\bsmall metal\b/.test(lower) && /shield/.test(lower)) return 'item_shield_metal';
            if (/\b(round|wooden|wood)\b/.test(lower)) return 'item_shield_wooden';
            if (/\b(knight|dragon|mithril|deflection|raven|heraldic)\b/.test(lower)) return 'item_shield_raven';
            return 'ph_shield';
        }

        // Weapons (including '\\' hafted weapons: Maces, Morningstars, War Hammers, Flails, Clubs, Scepters)
        if (g === ')' || g === '|' || g === '\\' || /sword|blade|dagger|knife|axe|hammer|mace|flail|club|katana|saber|sabre|hatchet|cleaver|morningstar|greatclub|cudgel|rapier|estoc|scimitar|tulwar|whip|scourge/.test(lower)) {
            if (/katana|ninja-to|nodachi|wakizashi|tanto/.test(lower)) return 'ph_katana';
            if (/claymore|two-handed|great sword|zweihander|executioner/.test(lower)) return 'item_greatsword';
            if (/rune|vorpal|morgul|ringil|anduril|glamdring|sting/.test(lower)) return 'item_rune_blade';
            if (/orc|goblin|scimitar|cutlass|falchion/.test(lower)) return 'item_goblin_sword';
            if (/estoc|rapier|foil|epee|small sword/.test(lower)) return 'ph_estoc';
            if (/saber|sabre|tulwar|curved sword|curved blade|elven blade|kilij|yatagan/.test(lower)) return 'ph_saber';
            if (/dagger|knife|main gauche|stiletto|dirk|misericorde/.test(lower)) return 'ph_dagger';
            if (/hatchet/.test(lower)) return 'ph_hatchet';
            if (/axe|cleaver|battle-axe/.test(lower)) return 'ph_axe';
            if (/sledge|great hammer|maul|grond/.test(lower)) return 'ph_sledgehammer';
            if (/war hammer|hammer|mattock|mallet/.test(lower)) return 'ph_hammer';
            if (/\b(whip|scourge|lash|bullwhip)\b/.test(lower)) return 'item_whip';
            if (/\bflail\b|ball-and-chain/.test(lower)) return 'item_flail';
            if (/morning star|morningstar/.test(lower)) return 'item_morningstar';
            if (/club|cudgel|greatclub/.test(lower)) return 'item_greatclub';
            if (/mace|scepter|rod of|lead-filled/.test(lower) || g === '\\') return 'ph_mace';
            return 'item_longsword';
        }

        // Armor, Helms, Boots, Gloves, Cloaks
        if (g === '[' || g === ']' || /armor|armour|plate|chain|mail|scale|splint|brigandine|hauberk|helm|crown|cap|coronet|basinet|boot|shoes|greaves|sandals|glove|gauntlet|cestus|cesti|cloak|mantle|cape|robe|jerkin/.test(lower)) {
            if (/crown|circlet|diadem|brilliance|telepathy/.test(lower)) return 'item_crown';
            if (/helm|cap|coronet|basinet/.test(lower)) return 'item_helmet';
            if (/boot|shoes|greaves|sandals/.test(lower)) return 'item_boots';
            if (/glove|gauntlet|cestus|cesti/.test(lower)) return 'item_gauntlets';
            if (/cloak|mantle|cape/.test(lower)) return 'item_cloak';
            if (/chain mail|chainmail|hauberk|scale mail|augmented chain|bar chain|double chain/.test(lower)) return 'item_chainmail';
            if (/plate|splint|brigandine|mithril/.test(lower)) return 'item_plate_armor';
            if (/leather|robe|filthy|soft|studded|jerkin/.test(lower)) return 'item_leather_armor';
            return 'item_plate_armor';
        }

        // Chests & Containers
        if (/\b(iron chest|steel chest|jeweled chest|jewelled chest|small chest|large chest|metal chest|strongbox)\b/i.test(lower)) {
            return 'item_chest_metal';
        }
        if (lower.includes('chest') || lower.includes('coffer') || lower.includes('box')) {
            return 'ph_chest';
        }

        // Light Sources
        if (/torch|lantern|lamp|phial|galadriel|feanor|candle/.test(lower)) {
            if (/torch/.test(lower)) return 'item_torch';
            if (/candle|candlestick/.test(lower)) return 'ph_candle';
            if (/phial|galadriel|feanor/.test(lower)) return 'item_phial';
            if (/lantern|lamp/.test(lower)) return 'ph_lantern';
        }

        // Food (',' in Angband/Variants, ':' in Classic Rogue)
        if (g === ',' || g === ':' || /ration|bread|food|waybread|lembas|wafer|slime-mold|melon|jerky/.test(lower)) {
            if (/waybread|lembas|wafer/.test(lower)) return 'item_lembas';
            if (/ration|jerky|biscuit/.test(lower)) return 'item_food_ration';
            return 'item_bread';
        }

        // Keys
        if (/key|lockpick/.test(lower)) {
            return 'item_key';
        }

        // Goblets & Chalices
        if (/goblet|chalice|cup|grail/.test(lower)) {
            return 'ph_goblet';
        }

        // Boulders & Statues
        if (g === '`' || /\b(boulder|rock|stone)\b/.test(lower)) return 'ph_boulder';
        if (/\b(statue|figurine|idol|effigy)\b/.test(lower)) return 'ph_statue_item';

        // Gold & Coin Piles ('$')
        if (g === '$' || /\b(gold|coins?|silver|copper|adamantite|treasure)\b/.test(lower)) {
            return 'item_coins';
        }

        return null;
    }

    resolvePolyHavenFloorItemKey(it, g, lowerName, nameHash) {
        // # ROOT-CAUSE: Support both string and object inputs for resolvePolyHavenFloorItemKey across all 9 realms.
        const itemName = (typeof it === 'string') ? it : (it && it.name ? it.name : lowerName);
        return this.getItemObjKey(itemName, g);
    }

    _ensurePolyHavenFloorItem(key) {
        if (!POLYHAVEN_ITEM_GLTF_PATHS[key]) return Promise.reject(new Error(`Unknown ph item key: ${key}`));
        return this._loadCachedGltf(key, POLYHAVEN_ITEM_GLTF_PATHS[key]).then((tmpl) => {
            this.upgradeAllItemEntities();
            return tmpl;
        });
    }

    _loadCachedGltf(key, path) {
        if (!this._gltfTemplateCache) this._gltfTemplateCache = new Map();
        if (!this._gltfLoadingPromises) this._gltfLoadingPromises = new Map();

        if (this._gltfTemplateCache.has(key)) {
            return Promise.resolve(this._gltfTemplateCache.get(key));
        }
        if (this._gltfLoadingPromises.has(key)) {
            return this._gltfLoadingPromises.get(key);
        }

        // M-03: Build dedicated procedural 3D ring geometry (Torus band + Octahedron gemstone bezel) instead of helm_of_brilliance.glb
        if (key === 'item_ring') {
            const wrapper = new THREE.Group();
            const innerPivot = new THREE.Group();
            const bandGeo = new THREE.TorusGeometry(0.09, 0.022, 16, 32);
            bandGeo._sharedGeometry = true;
            const bandMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.88, roughness: 0.22 });
            bandMat._sharedMaterial = true;
            const bandMesh = new THREE.Mesh(bandGeo, bandMat);
            bandMesh.rotation.x = Math.PI * 0.35;
            bandMesh.position.y = 0.06;
            const gemGeo = new THREE.OctahedronGeometry(0.036, 1);
            gemGeo._sharedGeometry = true;
            const gemMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.45, metalness: 0.25, roughness: 0.15 });
            gemMat._sharedMaterial = true;
            gemMat.name = 'ring_gem_core';
            const gemMesh = new THREE.Mesh(gemGeo, gemMat);
            gemMesh.name = 'ring_gem_core';
            gemMesh.position.set(0, 0.11, 0.06);
            innerPivot.add(bandMesh, gemMesh);
            wrapper.add(innerPivot);
            wrapper._sharedTemplate = true;
            wrapper._rawSize = new THREE.Vector3(0.22, 0.16, 0.22);
            wrapper._rawMin = new THREE.Vector3(-0.11, 0, -0.11);
            wrapper._rawMax = new THREE.Vector3(0.11, 0.16, 0.11);
            wrapper._rawCenter = new THREE.Vector3(0, 0.08, 0);
            wrapper._rawMaxDim = 0.22;
            wrapper._normScale = 1.0;
            this._cacheGltfTemplateLru(key, wrapper);
            return Promise.resolve(wrapper);
        }

        // M-08: Build dedicated coiled leather whip mesh instead of spiked morningstar.glb
        if (key === 'item_whip') {
            const wrapper = new THREE.Group();
            const innerPivot = new THREE.Group();
            const coilGeo = new THREE.TorusGeometry(0.14, 0.024, 12, 28);
            coilGeo.rotateX(Math.PI / 2);
            coilGeo._sharedGeometry = true;
            const handleGeo = createLatheFrustumGeo(0.024, 0.028, 0.26, 10);
            handleGeo.rotateZ(Math.PI * 0.38);
            handleGeo._sharedGeometry = true;
            const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5c341d, roughness: 0.82, metalness: 0.08 });
            leatherMat._sharedMaterial = true;
            const coil1 = new THREE.Mesh(coilGeo, leatherMat);
            coil1.position.y = 0.025;
            const coil2 = new THREE.Mesh(coilGeo, leatherMat);
            coil2.scale.set(0.76, 1.0, 0.76);
            coil2.position.y = 0.045;
            const handle = new THREE.Mesh(handleGeo, leatherMat);
            handle.position.set(-0.06, 0.06, 0.08);
            innerPivot.add(coil1, coil2, handle);
            wrapper.add(innerPivot);
            wrapper._sharedTemplate = true;
            wrapper._rawSize = new THREE.Vector3(0.32, 0.12, 0.32);
            wrapper._rawMin = new THREE.Vector3(-0.16, 0, -0.16);
            wrapper._rawMax = new THREE.Vector3(0.16, 0.12, 0.16);
            wrapper._rawCenter = new THREE.Vector3(0, 0.06, 0);
            wrapper._rawMaxDim = 0.32;
            wrapper._normScale = 1.0;
            this._cacheGltfTemplateLru(key, wrapper);
            return Promise.resolve(wrapper);
        }

        const loader = this._getGltfLoader();
        if (!loader) return Promise.reject(new Error('GLTFLoader not available'));

        // # ROOT-CAUSE: Append ?v=11.9.9 when GLTFLoader fetches item_wand so Cloudflare Edge 7-day cache and browser HTTP caches serve the restored PBR wand.glb immediately.
        const rawUrl = (key === 'item_wand' && !String(path).includes('?')) ? `${path}?v=11.9.9` : path;
        const loadUrl = (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(rawUrl) : rawUrl;
        const promise = new Promise((resolve, reject) => {
            loader.load(loadUrl, (gltf) => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) {
                    reject(new Error(`No scene in GLTF: ${path}`));
                    return;
                }

                const toRemove = [];
                let keptSingleBook = false;
                scene.traverse(c => {
                    if (key === 'ph_dagger' && c.name && c.name.toLowerCase().includes('scabbard')) {
                        toRemove.push(c);
                    } else if (key === 'ph_candle' && (c.name === 'brass_candleholder_02' || c.name === 'brass_candleholder_03')) {
                        toRemove.push(c);
                    } else if (key === 'ph_goblet' && (c.name === 'brass_goblet_02' || c.name === 'brass_goblet_03')) {
                        toRemove.push(c);
                    } else if (key === 'item_book' && c.isMesh && !/^Cube004(_1)?$/i.test(c.name)) {
                        c.visible = false;
                        toRemove.push(c);
                    } else if (key === 'ph_book' && c.isMesh) {
                        if (!keptSingleBook) {
                            keptSingleBook = true;
                        } else {
                            c.visible = false;
                            toRemove.push(c);
                        }
                    }
                });
                toRemove.forEach(c => {
                    if (c.parent) c.parent.remove(c);
                });

                if ((key === 'item_gold' || key === 'item_coins') && typeof this._mergeBufferGeometries === 'function') {
                    scene.updateMatrixWorld(true);
                    const coinParts = [];
                    let coinMat = null;
                    scene.traverse((c) => {
                        if (c.isMesh && c.geometry && c.geometry.attributes && c.geometry.attributes.position) {
                            const g = c.geometry.clone();
                            g.applyMatrix4(c.matrixWorld);
                            if (!coinMat && c.material) coinMat = c.material;
                            if (typeof c.geometry.dispose === 'function') c.geometry.dispose();
                            coinParts.push(g);
                        }
                    });
                    if (coinParts.length > 1 && coinMat) {
                        const mergedCoins = this._mergeBufferGeometries(coinParts);
                        for (const g of coinParts) { if (g && typeof g.dispose === 'function') g.dispose(); }
                        while (scene.children.length > 0) scene.remove(scene.children[0]);
                        scene.add(new THREE.Mesh(mergedCoins, coinMat));
                    }
                }

                scene.traverse((c) => {
                    if (c.isMesh) {
                        c.castShadow = false;
                        c.receiveShadow = false;
                        if (c.geometry) {
                            c.geometry._sharedGeometry = true;
                        }
                        if (c.material) {
                            if (key === 'item_shield_wicker') {
                                c.material = c.material.clone();
                                c.material.color = new THREE.Color(0xd2a862);
                                c.material.roughness = 0.92;
                                c.material._sharedMaterial = true;
                            } else if (key === 'item_shield_leather') {
                                c.material = c.material.clone();
                                c.material.color = new THREE.Color(0x6e4228);
                                c.material.roughness = 0.78;
                                c.material._sharedMaterial = true;
                            } else if (key === 'item_shield_metal') {
                                c.material = c.material.clone();
                                c.material.color = new THREE.Color(0x9aa4b2);
                                c.material.metalness = 0.78;
                                c.material.roughness = 0.32;
                                c.material._sharedMaterial = true;
                            } else if (key === 'ph_katana') {
                                c.material = c.material.clone();
                                c.material.color = new THREE.Color(0xe2e8f0);
                                c.material.metalness = 0.68;
                                c.material.roughness = 0.28;
                                c.material._sharedMaterial = true;
                            }
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (m) {
                                    m._sharedMaterial = true;
                                    if (m.map) {
                                        m.map._sharedTexture = true;
                                        if (window.Dungeon3DCompat) window.Dungeon3DCompat.setTextureColorSpace(m.map, true);
                                        else if (typeof THREE.sRGBEncoding !== 'undefined') m.map.encoding = THREE.sRGBEncoding;
                                    }
                                    if (m.normalMap) m.normalMap._sharedTexture = true;
                                    if (m.roughnessMap) m.roughnessMap._sharedTexture = true;
                                    if (m.metalnessMap) m.metalnessMap._sharedTexture = true;
                                    if (window.Dungeon3DV2Pipeline && typeof window.Dungeon3DV2Pipeline.preservePhysicalMaterial === 'function') {
                                        window.Dungeon3DV2Pipeline.preservePhysicalMaterial(m);
                                    } else if (m.roughness !== undefined && m.roughness < 0.24) {
                                        m.roughness = 0.28;
                                    }
                                }
                            }
                        }
                    }
                });

                scene.updateMatrixWorld(true);
                const bbox = new THREE.Box3().setFromObject(scene);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const center = new THREE.Vector3();
                bbox.getCenter(center);

                let targetSpan = 0.50;
                const isOpenMmoXWeapon = (key === 'item_goblin_sword' || key === 'item_longsword' || key === 'item_greatsword' || key === 'item_rune_blade' || key === 'item_morningstar' || key === 'item_flail' || key === 'item_greatclub' || key === 'item_spear' || key === 'item_halberd' || key === 'item_bow' || key === 'item_crossbow' || key === 'item_torch');
                const isShield = (key === 'ph_shield' || key === 'item_shield_wooden' || key === 'item_shield_raven' || key === 'item_shield_wicker' || key === 'item_shield_leather' || key === 'item_shield_metal');
                const isArmor = (key === 'item_helmet' || key === 'item_plate_armor' || key === 'item_leather_armor' || key === 'item_boots' || key === 'item_gauntlets' || key === 'item_cloak' || key === 'item_chainmail' || key === 'item_crown');
                const isWeapon = (key === 'ph_saber' || key === 'ph_estoc' || key === 'ph_katana' || key === 'ph_dagger' || key === 'ph_axe' || key === 'ph_hatchet' || key === 'ph_hammer' || key === 'ph_sledgehammer' || key === 'ph_mace' || isOpenMmoXWeapon || key === 'item_shovel' || key === 'item_pickaxe' || key === 'item_wand' || key === 'item_rod' || key === 'item_staff' || key === 'item_staff_branch' || key === 'item_arrow');

                if (isWeapon) {
                    targetSpan = 0.68;
                } else if (isShield) {
                    if (key === 'item_shield_wicker') targetSpan = 0.48;
                    else if (key === 'item_shield_leather') targetSpan = 0.56;
                    else if (key === 'item_shield_metal') targetSpan = 0.66;
                    else targetSpan = 0.62;
                } else if (isArmor) {
                    targetSpan = 0.52;
                } else if (key === 'item_ring') {
                    targetSpan = 0.26;
                } else if (key === 'ph_crystal' || key === 'item_phial') {
                    targetSpan = 0.42;
                } else if (key === 'ph_chest' || key === 'item_chest_metal' || key === 'ph_boulder' || key === 'ph_statue_item') {
                    targetSpan = 0.55;
                } else {
                    targetSpan = 0.46;
                }

                const maxDim = Math.max(size.x, size.y, size.z) || 1.0;
                const scale = targetSpan / maxDim;

                const wrapper = new THREE.Group();
                const innerPivot = new THREE.Group();
                innerPivot.add(scene);
                scene.position.set(-center.x, -bbox.min.y, -center.z);
                if (key === 'item_shield_wicker') {
                    innerPivot.scale.set(scale * 0.92, scale * 0.92, scale * 0.75);
                } else if (key === 'item_shield_metal') {
                    innerPivot.scale.set(scale * 0.95, scale * 1.12, scale);
                } else {
                    innerPivot.scale.set(scale, scale, scale);
                }

                if (isShield) {
                    innerPivot.rotation.set(-0.85, 0.25, 0.15);
                    innerPivot.position.y = 0.08;
                } else if (isWeapon) {
                    if (key === 'item_arrow' || key === 'item_shovel' || key === 'item_pickaxe' || key === 'item_wand' || key === 'item_rod' || key === 'item_staff' || key === 'item_staff_branch') {
                        innerPivot.rotation.set(0.66, 0.25, 0.72);
                        innerPivot.position.y = 0.18;
                    } else if (isOpenMmoXWeapon) {
                        innerPivot.rotation.set(0.35, 0.25, 0.72);
                        innerPivot.position.y = 0.22;
                    } else {
                        innerPivot.rotation.set(0.55, 0.35, -0.45);
                        innerPivot.position.y = 0.14;
                    }
                } else if (isArmor) {
                    innerPivot.position.y = 0.06;
                } else {
                    innerPivot.position.y = 0.02;
                }

                wrapper.add(innerPivot);
                wrapper._sharedTemplate = true;
                wrapper._rawSize = size.clone();
                wrapper._rawMin = bbox.min.clone();
                wrapper._rawMax = bbox.max.clone();
                wrapper._rawCenter = center.clone();
                wrapper._rawMaxDim = maxDim;
                wrapper._normScale = scale;

                this._cacheGltfTemplateLru(key, wrapper);
                if (this.glbPool && typeof this.glbPool.registerPrototype === 'function') {
                    this.glbPool.registerPrototype(key, wrapper);
                }
                this._gltfLoadingPromises.delete(key);
                resolve(wrapper);
            }, undefined, (err) => {
                this._gltfLoadingPromises.delete(key);
                reject(err);
            });
        });

        this._gltfLoadingPromises.set(key, promise);
        return promise;
    }

    _cacheGltfTemplateLru(key, wrapper) {
        if (!this._gltfTemplateCache) this._gltfTemplateCache = new Map();
        const vmMap = this._viewmodelWeaponPhMap || null;
        const eqRightPh = vmMap && this.currentRightWeapon ? vmMap[this.currentRightWeapon] : null;
        const rawLeftKey = this.currentLeftWeapon && String(this.currentLeftWeapon).replace(/^(offhand|light):/, '');
        const eqLeftPh = vmMap && rawLeftKey ? vmMap[rawLeftKey] : null;
        this._touchAndEvictLru(this._gltfTemplateCache, key, wrapper, 64, (k) => {
            if (k === eqRightPh || k === eqLeftPh) return true;
            if (this.items) {
                for (const it of this.items.values()) {
                    if (it && (it.phKey === k || it.pendingPhKey === k)) return true;
                }
            }
            return false;
        });
        if (this.itemTemplates) {
            this.itemTemplates.set(key, wrapper);
            if (this.itemTemplates.size > 64) {
                for (const kOld of this.itemTemplates.keys()) {
                    if (!this._gltfTemplateCache.has(kOld)) {
                        this.itemTemplates.delete(kOld);
                        break;
                    }
                }
            }
        }
    }

    _touchAndEvictLru(cacheMap, key, value, maxSize, isProtectedFn) {
        if (!cacheMap) return;
        if (cacheMap.has(key)) cacheMap.delete(key);
        cacheMap.set(key, value);
        if (cacheMap.size <= maxSize) return;
        const coreSharedTexs = new Set([this.organicNormal, this.furNormal, this.shadowTex, this.monsterAtlasTex, this.itemAtlasTex]);
        for (const [k, oldVal] of cacheMap) {
            if (cacheMap.size <= maxSize) break;
            if (k === key) continue;
            if (isProtectedFn && isProtectedFn(k, oldVal)) continue;
            cacheMap.delete(k);
            if (oldVal && typeof oldVal.traverse === 'function') {
                oldVal.traverse((c) => {
                    if (c.geometry && !c.geometry._sharedCoreGeo && c.geometry !== this.shadowGeo && c.geometry !== this.itemPlinthGeo && typeof c.geometry.dispose === 'function') {
                        c.geometry.dispose();
                    }
                    if (c.material) {
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        for (let mi = 0; mi < mats.length; mi++) {
                            const m = mats[mi];
                            if (!m) continue;
                            for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
                                const tx = m[slot];
                                if (tx && !coreSharedTexs.has(tx) && typeof tx.dispose === 'function') tx.dispose();
                            }
                            if (typeof m.dispose === 'function') m.dispose();
                        }
                    }
                });
            }
        }
    }

    _cloneCachedGltfTemplate(template, colorHex, key) {
        if (!template) return null;
        if (this._gltfTemplateCache && this._gltfTemplateCache.has(key)) {
            this._gltfTemplateCache.delete(key);
            this._gltfTemplateCache.set(key, template);
        }
        const clone = template.clone(true);
        clone.traverse((c) => {
            if (c.geometry) c.geometry._sharedGeometry = true;
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                for (const m of mats) {
                    m._sharedMaterial = true;
                    if (m.map) m.map._sharedTexture = true;
                }
            }
        });
        if (colorHex) {
            const isNeutralItemColor = (colorHex === '#ffffff' || colorHex === '#9ca3af' || colorHex === '#d1d5db');
            const isAlwaysTintedKey = (key === 'item_wand' || key === 'item_rod' || key === 'item_staff' || key === 'item_staff_branch' || key === 'ph_potion_bottle' || key === 'ph_potion_flask' || key === 'ph_potion_urn' || key === 'ph_crystal' || key === 'item_ring' || key === 'item_crown' || key === 'item_talisman' || key === 'item_cloak' || key === 'item_plate_armor' || key === 'item_chainmail' || key === 'item_leather_armor' || key === 'item_book' || key === 'ph_book');
            if (isAlwaysTintedKey || !isNeutralItemColor) {
                this._tintedMatPool = this._tintedMatPool || new Map();
                const tintCol = new THREE.Color(colorHex);
                const isMagicalFocus = (key === 'item_wand' || key === 'item_rod' || key === 'item_staff' || key === 'item_staff_branch' || key === 'ph_crystal' || key === 'ph_potion_bottle' || key === 'ph_potion_flask' || key === 'ph_potion_urn');
                clone.traverse((c) => {
                    if (c.isMesh && c.material && !Array.isArray(c.material)) {
                        const mName = ((c.material.name || '') + ' ' + (c.name || '')).toLowerCase();
                        const isTipOrCrystal = /core|crystal|orb|glow|tip|emerald|gem/i.test(mName);
                        const pKey = `item_${key}_${c.material.uuid}_${colorHex}`;
                        let pMat = this._tintedMatPool.get(pKey);
                        if (!pMat) {
                            if (this._tintedMatPool.size >= 256) {
                                for (const [kEvict, vEvict] of this._tintedMatPool) {
                                    if (!vEvict || (vEvict._refCount || 0) <= 0) {
                                        this._tintedMatPool.delete(kEvict);
                                        if (vEvict && typeof vEvict.dispose === 'function') vEvict.dispose();
                                        break;
                                    }
                                }
                            }
                            pMat = c.material.clone();
                            pMat._sharedMaterial = true;
                            pMat._pooledKey = pKey;
                            pMat._refCount = 0;
                            if (c.material.onBeforeCompile) pMat.onBeforeCompile = c.material.onBeforeCompile;
                            if (c.material.customProgramCacheKey) pMat.customProgramCacheKey = c.material.customProgramCacheKey;
                            if (pMat.color) {
                                pMat.color.lerp(tintCol, isTipOrCrystal ? 0.72 : 0.46);
                            }
                            if ((isTipOrCrystal || key === 'ph_crystal') && pMat.emissive) {
                                pMat.emissive.copy(tintCol);
                                pMat.emissiveIntensity = isMagicalFocus ? 0.45 : 0.25;
                            }
                        } else {
                            this._tintedMatPool.delete(pKey);
                        }
                        this._tintedMatPool.set(pKey, pMat);
                        pMat._refCount = (pMat._refCount || 0) + 1;
                        c.material = pMat;
                    }
                });
            }
        }
        clone.isReal3DItem = true;
        clone.phKey = key;
        clone._rawSize = template._rawSize;
        clone._rawMin = template._rawMin;
        clone._rawMax = template._rawMax;
        clone._rawCenter = template._rawCenter;
        clone._rawMaxDim = template._rawMaxDim;
        clone._normScale = template._normScale;
        return clone;
    }

    destroyEntity(entityObj) {
        if (!entityObj) return;
        if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.disposeEntityFlashMats === 'function') {
            window.Dungeon3DAtmosphere.disposeEntityFlashMats(entityObj);
        }
        this.scene.remove(entityObj);
        if (entityObj._mixer) {
            try {
                entityObj._mixer.stopAllAction();
                if (typeof entityObj._mixer.uncacheRoot === 'function') {
                    entityObj._mixer.uncacheRoot(entityObj);
                }
            } catch (_) {}
            entityObj._mixer = null;
        }
        const sharedMats = new Set([
            this.monsterBillboardMat,
            this.itemBillboardMat,
            this.monsterDepthMat,
            this.itemDepthMat,
            this.shadowMat,
            this._storeLightPoolMat
        ]);
        const sharedTexs = new Set([
            this.monsterAtlasTex,
            this.monsterNormalTex,
            this.itemAtlasTex,
            this.itemNormalTex,
            this.shadowTex
        ]);
        if (this.captionMaterialCache && typeof this.captionMaterialCache.values === 'function') {
            for (const cMat of this.captionMaterialCache.values()) {
                if (cMat) {
                    sharedMats.add(cMat);
                    if (cMat.map) sharedTexs.add(cMat.map);
                }
            }
        }
        entityObj.traverse((child) => {
            if (child.geometry && !child.isSprite && !child.geometry._sharedGeometry && child.geometry !== this.shadowGeo && child.geometry !== this.itemPlinthGeo) {
                child.geometry.dispose();
            }
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const m of mats) {
                    if (m && m._pooledKey && this._tintedMatPool && this._tintedMatPool.get(m._pooledKey) === m) {
                        m._refCount = Math.max(0, (m._refCount || 1) - 1);
                    }
                    if (m && !m._sharedMaterial && !sharedMats.has(m)) {
                        const texSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap'];
                        for (let tIdx = 0; tIdx < texSlots.length; tIdx++) {
                            const tex = m[texSlots[tIdx]];
                            if (tex && !tex._sharedTexture && !sharedTexs.has(tex) && typeof tex.dispose === 'function') {
                                tex.dispose();
                            }
                        }
                        m.dispose();
                    }
                }
            }
        });
    }

    _shouldUse3DItemModel(phKey, mode) {
        const m = mode || (typeof window !== 'undefined' && window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.itemRenderer) || 'hybrid';
        if (m === 'billboard') return false;
        if (!phKey || !POLYHAVEN_ITEM_GLTF_PATHS[phKey]) return false;
        if (m === 'classic') return true;
        if (!this._hybrid3DItemKeys) {
            this._hybrid3DItemKeys = new Set([
                'ph_saber', 'ph_estoc', 'ph_katana', 'ph_dagger', 'ph_axe', 'ph_hatchet',
                'ph_hammer', 'ph_sledgehammer', 'ph_mace', 'ph_shield', 'ph_chest', 'ph_lantern',
                'ph_boulder', 'ph_statue_item', 'item_bow', 'item_crossbow', 'item_spear', 'item_halberd', 'item_torch',
                'item_greatsword', 'item_rune_blade', 'item_goblin_sword', 'item_morningstar', 'item_flail',
                'item_whip', 'item_greatclub', 'item_longsword', 'item_shield_wooden',
                'item_shield_raven', 'item_shield_wicker', 'item_shield_leather', 'item_shield_metal',
                'item_helmet', 'item_plate_armor', 'item_leather_armor', 'item_boots',
                'item_gauntlets', 'item_cloak', 'item_coins', 'item_gold', 'item_key',
                'item_shovel', 'item_pickaxe', 'item_chainmail', 'item_crown', 'item_anvil',
                'item_corpse', 'item_phial', 'item_chest_metal', 'item_food_ration'
            ]);
        }
        return this._hybrid3DItemKeys.has(phKey);
    }

    _syncItemRarityPlinth(group, it) {
        if (!group || !it || !this.itemPlinthGeo) return;
        const isCursed = Boolean(it.cursed || it.is_cursed);
        const isArtifact = Boolean(it.artifact || it.is_artifact);
        const isEgo = Boolean(it.ego || it.is_ego);
        const tier = isCursed ? 'cursed' : (isArtifact ? 'artifact' : (isEgo ? 'ego' : null));
        if (!tier) {
            if (group.rarityPlinth) group.rarityPlinth.visible = false;
            return;
        }
        const side = (typeof THREE !== 'undefined' && THREE.DoubleSide) ? THREE.DoubleSide : undefined;
        let mat = null;
        if (tier === 'cursed') {
            mat = this._plinthMatCursed || (this._plinthMatCursed = new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.78, depthWrite: false, side }));
        } else if (tier === 'artifact') {
            mat = this._plinthMatArtifact || (this._plinthMatArtifact = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.80, depthWrite: false, side }));
        } else {
            mat = this._plinthMatEgo || (this._plinthMatEgo = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.74, depthWrite: false, side }));
        }
        mat._sharedMaterial = true;
        if (!group.rarityPlinth) {
            const plinth = new THREE.Mesh(this.itemPlinthGeo, mat);
            plinth.position.set(0, 0.012, 0);
            group.add(plinth);
            group.rarityPlinth = plinth;
        } else {
            group.rarityPlinth.material = mat;
            group.rarityPlinth.visible = true;
        }
    }

    createItem3DEntity(it) {
        const group = new THREE.Group();
        const g = it.glyph || '?';
        const colorHex = getAngbandColorString(it.attr);

        let mesh = null;
        let isBillboard = false;
        let isFlat = false;
        let footprint = 0.35;
        let isItemBillboardFallback = false;

        let nameHash = 0;
        const itemNameStr = it.name || '';
        for (let i = 0; i < itemNameStr.length; i++) {
            nameHash = ((nameHash << 5) - nameHash + itemNameStr.charCodeAt(i)) >>> 0;
        }

        const phKey = this.getItemObjKey(it.name, g);
        if (this._shouldUse3DItemModel(phKey)) {
            if (this._gltfTemplateCache && this._gltfTemplateCache.has(phKey)) {
                const tmpl = this._gltfTemplateCache.get(phKey);
                mesh = this._cloneCachedGltfTemplate(tmpl, colorHex, phKey);
                footprint = (phKey === 'ph_chest') ? 0.50 : 0.40;
                group.isReal3DItem = true;
                group.phKey = phKey;
            } else {
                const atlasEntry = this.resolveItemAtlasEntry(it.name, g);
                mesh = atlasEntry ? this.createItemBillboardMesh(atlasEntry) : null;
                if (!mesh) {
                    const tempGeo = new THREE.PlaneGeometry(0.4, 0.4);
                    tempGeo.translate(0, 0.2, 0);
                    mesh = new THREE.Mesh(tempGeo, this.itemBillboardMat);
                }
                isBillboard = true;
                isFlat = atlasEntry ? !!atlasEntry.isFlat : false;
                footprint = atlasEntry && atlasEntry.footprint ? atlasEntry.footprint : 0.35;
                group.pendingPhKey = phKey;

                this._loadCachedGltf(phKey, POLYHAVEN_ITEM_GLTF_PATHS[phKey]).then((tmpl) => {
                    if (group.parent && group.pendingPhKey === phKey) {
                        const upgraded3D = this._cloneCachedGltfTemplate(tmpl, colorHex, phKey);
                        if (upgraded3D) {
                            if (group.itemMesh) {
                                const oldMesh = group.itemMesh;
                                group.remove(oldMesh);
                                if (oldMesh.geometry && !oldMesh.isSprite && !oldMesh.geometry._sharedGeometry) {
                                    oldMesh.geometry.dispose();
                                }
                            }
                            group.itemMesh = upgraded3D;
                            group.add(upgraded3D);
                            group.isReal3DItem = true;
                            group.isItemBillboard = false;
                            delete group.pendingPhKey;
                            group.phKey = phKey;
                            this.markShadowsDirty();
                        }
                    }
                }).catch(() => {});
            }
        }

        if (!mesh) {
            const atlasEntry = this.resolveItemAtlasEntry(it.name, g);
            if (atlasEntry) {
                mesh = this.createItemBillboardMesh(atlasEntry);
                if (mesh) {
                    isBillboard = true;
                    isFlat = !!atlasEntry.isFlat;
                    footprint = atlasEntry.footprint || 0.35;
                }
            } else {
                this.ensureItemAtlasReady();
                const tempGeo = new THREE.PlaneGeometry(0.4, 0.4);
                tempGeo.translate(0, 0.2, 0);
                mesh = new THREE.Mesh(tempGeo, this.itemBillboardMat);
                isBillboard = true;
                isItemBillboardFallback = true;
            }
        }

        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.contactShadows) && this.shadowGeo && this.shadowMat) {
            const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
            shadow.position.set(0, -0.042, 0);
            const itemShadow = footprint * 0.38;
            shadow.scale.set(itemShadow, itemShadow, itemShadow);
            group.add(shadow);
            group.shadowMesh = shadow;
        }
        this._syncItemRarityPlinth(group, it);

        if (!isBillboard && !group.isReal3DItem) {
            mesh.position.y = 0.12;
        }
        group.add(mesh);
        group.itemMesh = mesh;
        group.isItemBillboard = isBillboard;
        group.isFlat = isFlat;
        group.isItemBillboardFallback = isItemBillboardFallback;
        group.seed = nameHash;
        group.glyph = g;
        group.itemName = it.name;
        group.colorHex = colorHex;
        group.itemData = it;

        return group;
    }

    createItemCaptionSprite(it) {
        if (!it || !it.name) return null;
        const colorHex = getAngbandColorString(it.attr) || '#ffffff';
        const isHeng = this.isHengband();
        const langMode = (typeof window !== 'undefined' && window.__langMode) || 'en';

        const localizedName = (isHeng && typeof window.getLocalizedItemName === 'function')
            ? window.getLocalizedItemName(it.name, 'hengband', langMode)
            : it.name;

        const captionKey = `${localizedName}_${colorHex}_${langMode}`;
        let spriteMat = this.captionMaterialCache ? this.captionMaterialCache.get(captionKey) : null;
        if (!spriteMat) {
            if (this.captionMaterialCache && this.captionMaterialCache.size >= 128) {
                const firstKey = this.captionMaterialCache.keys().next().value;
                const oldMat = this.captionMaterialCache.get(firstKey);
                if (oldMat) {
                    if (oldMat.map) oldMat.map.dispose();
                    oldMat.dispose();
                }
                this.captionMaterialCache.delete(firstKey);
            }
            const canvas = document.createElement('canvas');
            canvas.width = 384;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'rgba(6, 8, 12, 0.88)';
            ctx.strokeStyle = colorHex;
            ctx.lineWidth = 2;
            if (ctx.roundRect) ctx.roundRect(12, 8, 360, 48, 8);
            else ctx.rect(12, 8, 360, 48);
            ctx.fill();
            ctx.stroke();

            let fontSize = 22;
            if (localizedName.length > 26) fontSize = 16;
            else if (localizedName.length > 18) fontSize = 19;

            ctx.font = `600 ${fontSize}px "Fira Code", "Noto Sans JP", "Yu Gothic", monospace, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#f0f4f8';
            const shortName = localizedName.length > 28 ? localizedName.substring(0, 27) + '…' : localizedName;
            ctx.fillText(shortName, 192, 32);

            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false });
            if (this.captionMaterialCache) {
                this.captionMaterialCache.set(captionKey, spriteMat);
            }
        }

        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.2, 0.20, 1.0);
        sprite.position.y = 0.48;
        return sprite;
    }

    refreshItemCaptions() {
        if (!this.items) return;
        for (const [id, entity] of this.items.entries()) {
            if (entity && (entity.itemData || entity.itemName)) {
                const it = entity.itemData || { name: entity.itemName, attr: 1 };
                if (entity.caption) {
                    entity.remove(entity.caption);
                    entity.caption = null;
                }
                const newCaption = this.createItemCaptionSprite(it);
                if (newCaption) {
                    entity.add(newCaption);
                    entity.caption = newCaption;
                }
            }
        }
    }

    updateItems(items, player) {
        const activeIds = new Set();
        const px = player ? player.x : 0;
        const py = player ? player.y : 0;
        const depth = player && player.depth !== undefined ? player.depth : 0;
        const outdoors = depth === 0;

        const multiDrops = (window.Dungeon3DTactical && typeof window.Dungeon3DTactical.computeMultiItemPositions === 'function')
            ? window.Dungeon3DTactical.computeMultiItemPositions(items, this.cellSize || 2.0)
            : null;

        for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            const dropMeta = multiDrops ? multiDrops[idx] : null;
            const offX = dropMeta ? dropMeta.offsetX : 0;
            const offZ = dropMeta ? dropMeta.offsetZ : 0;

            const id = `${it.x}_${it.y}_${it.name || it.glyph}_${dropMeta ? dropMeta.indexInStack : 0}`;
            const itemDistSq = (it.x - px) * (it.x - px) + (it.y - py) * (it.y - py);
            if (itemDistSq > 784 && !this.items.has(id)) continue;
            if (itemDistSq > 900 && this.items.has(id)) {
                activeIds.add(id);
                const entity = this.items.get(id);
                entity.visible = false;
                continue;
            }
            activeIds.add(id);
            let entity = this.items.get(id);
            const rTag = (it.cursed || it.is_cursed) ? 'C' : ((it.artifact || it.is_artifact) ? 'A' : ((it.ego || it.is_ego) ? 'E' : ''));
            const stackLabel = (dropMeta && dropMeta.stackIndicator) || (it.pile_count > 1 ? `+${it.pile_count - 1}` : (it.pile ? '+1' : ''));
            const identitySig = `${this.realm || 'angband'}|${it.name || ''}|${it.glyph || ''}|${it.attr || ''}|${stackLabel}|${rTag}`;
            if (entity && entity.identitySig && entity.identitySig !== identitySig) {
                this.destroyEntity(entity);
                this.items.delete(id);
                entity = null;
            }

            const wx = it.x * this.cellSize + offX;
            const wz = it.y * this.cellSize + offZ;

            if (!entity) {
                entity = this.createItem3DEntity(it);
                entity.identitySig = identitySig;
                entity.position.set(wx, 0.0, wz);
                this.scene.add(entity);
                this.items.set(id, entity);
            } else {
                entity.identitySig = identitySig;
                entity.position.set(wx, 0.0, wz);
                entity.itemData = it;
                if (entity.itemMesh) entity.itemMesh.itemData = it;
                this._syncItemRarityPlinth(entity, it);
                // Auto-upgrade fallback 3D/procedural item to Shockbolt PBR billboard once item_atlas.json has loaded!
                if (entity.isItemBillboardFallback && this.itemAtlasData && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.itemRenderer !== 'classic')) {
                    const atlasEntry = this.resolveItemAtlasEntry(entity.itemName, entity.glyph);
                    if (atlasEntry) {
                        const upgradedBillboard = this.createItemBillboardMesh(atlasEntry);
                        if (upgradedBillboard) {
                            entity.remove(entity.itemMesh);
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

            if (stackLabel && this.createDamageNumberSprite) {
                if (!entity._stackIndicatorMesh || entity._stackIndicatorLabel !== stackLabel) {
                    if (entity._stackIndicatorMesh) {
                        if (entity._stackIndicatorMesh.material) {
                            if (entity._stackIndicatorMesh.material.map) entity._stackIndicatorMesh.material.map.dispose();
                            entity._stackIndicatorMesh.material.dispose();
                        }
                        entity.remove(entity._stackIndicatorMesh);
                    }
                    const stackBadge = this.createDamageNumberSprite(stackLabel, '#ffd700');
                    if (stackBadge) {
                        stackBadge.position.set(0, 0.42, 0);
                        entity.add(stackBadge);
                        entity._stackIndicatorMesh = stackBadge;
                        entity._stackIndicatorLabel = stackLabel;
                    }
                }
            } else if (entity._stackIndicatorMesh) {
                if (entity._stackIndicatorMesh.material) {
                    if (entity._stackIndicatorMesh.material.map) entity._stackIndicatorMesh.material.map.dispose();
                    entity._stackIndicatorMesh.material.dispose();
                }
                entity.remove(entity._stackIndicatorMesh);
                entity._stackIndicatorMesh = null;
                entity._stackIndicatorLabel = '';
            }

            // Roguelike Subterranean Item Visibility: active lit LOS (1.0) + explored Fog-of-War memory within 24 tiles (0.38x cool slate)
            let inLitView = outdoors ? (itemDistSq <= 784) : false;
            let inMemory = false;
            if (!outdoors && this.lastMap) {
                const flag = this.getFlagAt(this.lastMap, it.x, it.y);
                const inView = (flag & 0x2) !== 0;
                const known = (flag & 0x1) !== 0;
                const lighting = (flag >> 2) & 0x3;
                inLitView = inView && (lighting < 3 || itemDistSq <= (this.torchRadius + 1) ** 2);
                if (!inLitView && itemDistSq <= 576) {
                    inMemory = known || Boolean(this.getRememberedTile && this.getRememberedTile(it.x, it.y));
                }
            }
            let isVisible = inLitView || inMemory;
            if (isVisible && ((this._blindFactor || 0) > 0.65 || (this.isPlayerBlind && this.isPlayerBlind(player)))) {
                isVisible = (itemDistSq === 0);
                if (!isVisible) inLitView = false;
            }
            entity.visible = isVisible;
            if (isVisible && entity._inFowMemory !== inMemory) {
                entity._inFowMemory = inMemory;
                entity.traverse((c) => {
                    if (!c.isMesh || !c.material || c === entity.shadowMesh) return;
                    const m = c.material;
                    if (!Array.isArray(m) && m.color) {
                        if (inMemory) {
                            if (!m._fowMatCloned) {
                                const cl = m.clone();
                                if (m.onBeforeCompile) cl.onBeforeCompile = m.onBeforeCompile;
                                if (m.customProgramCacheKey) cl.customProgramCacheKey = m.customProgramCacheKey;
                                cl._origItemCol = m.color.clone();
                                cl._fowMatCloned = true;
                                c.material = cl;
                            }
                            c.material.color.setRGB(c.material._origItemCol.r * 0.36, c.material._origItemCol.g * 0.38, c.material._origItemCol.b * 0.44);
                        } else if (m._origItemCol) {
                            m.color.copy(m._origItemCol);
                        }
                    }
                });
            }

            // Lazy-create and display caption only when player is within 6 cells and item is in active lit view
            const showCaption = Boolean(inLitView && itemDistSq <= 36 && it.name);
            if (showCaption && !entity.caption) {
                const sprite = this.createItemCaptionSprite(it);
                if (sprite) {
                    entity.add(sprite);
                    entity.caption = sprite;
                }
            }
            if (entity.caption) {
                entity.caption.visible = showCaption;
            }
        }

        for (const [id, entity] of this.items.entries()) {
            if (!activeIds.has(id)) {
                this.destroyEntity(entity);
                this.items.delete(id);
            }
        }
    }

    _scheduleAnimLoop() {
        if (this._animLoopScheduled) return;
        this._animLoopScheduled = true;
        if (typeof requestAnimationFrame === 'function') {
            this._rafId = requestAnimationFrame(this.animate);
        }
    }

    animate() {
        if (!this._gpuInitialized || !this.renderer) {
            this._animLoopScheduled = false;
            this._rafId = null;
            return;
        }
        this._rafId = requestAnimationFrame(this.animate);

        const tNow = performance.now();

        // When terminal or modal completely covers the screen, throttle 3D rendering to 5 FPS; pause completely (0 FPS) when hidden or behind opaque boot/menu/realm/loading curtains
        const termContainer = this._termContainerEl || (this._termContainerEl = document.getElementById('terminal-container'));
        const deathModal = this._deathModalEl || (this._deathModalEl = document.getElementById('death-modal'));
        const loadModal = this._loadModalEl || (this._loadModalEl = document.getElementById('load-modal'));
        const guideModal = this._guideModalEl || (this._guideModalEl = document.getElementById('guide-modal'));
        const realmModal = this._realmModalEl || (this._realmModalEl = document.getElementById('realm-selector-modal') || document.getElementById('realm-modal'));
        const realmCarouselOverlay = this._realmCarouselOverlayEl || (this._realmCarouselOverlayEl = document.getElementById('realm-carousel-overlay'));
        const splashOverlay = this._splashOverlayEl || (this._splashOverlayEl = document.getElementById('splash-overlay'));
        const mainMenuOverlay = this._mainMenuOverlayEl || (this._mainMenuOverlayEl = document.getElementById('main-menu-overlay'));
        const loadingOverlay = this._loadingOverlayEl || (this._loadingOverlayEl = document.getElementById('loading-overlay'));
        const isPageHidden = typeof document !== 'undefined' && Boolean(document.hidden);
        const isOpaqueCurtainVisible = isPageHidden ||
            Boolean(splashOverlay && !splashOverlay.classList.contains('hidden')) ||
            Boolean(mainMenuOverlay && !mainMenuOverlay.classList.contains('hidden')) ||
            Boolean(realmModal && !realmModal.classList.contains('hidden')) ||
            Boolean(realmCarouselOverlay && !realmCarouselOverlay.classList.contains('hidden')) ||
            Boolean(loadingOverlay && !loadingOverlay.classList.contains('hidden'));
        const isCovered = Boolean(termContainer && !termContainer.classList.contains('hidden')) ||
            Boolean(deathModal && !deathModal.classList.contains('hidden')) ||
            Boolean(loadModal && !loadModal.classList.contains('hidden')) ||
            Boolean(guideModal && !guideModal.classList.contains('hidden'));
        const isRecording = typeof window !== 'undefined' && window.location.search && window.location.search.includes('record_walkthrough=1');
        // # ROOT-CAUSE: Pause 3D WebGL scene rendering completely (0 FPS) when document.hidden or when #splash-overlay, #main-menu-overlay, #realm-modal, #realm-carousel-overlay, or #loading-overlay is visible, and throttle to 5 FPS behind full-screen modals.
        if (isOpaqueCurtainVisible && !isRecording) {
            this._fpsGovFrames = 0;
            this._fpsGovStart = 0;
            this._lastAnimTime = tNow;
            return;
        }
        if (this.renderGovernor) {
            this.renderGovernor.setModalCoveringViewport(isCovered && !isRecording, tNow);
        }
        if (isCovered && !isRecording) {
            this._fpsGovFrames = 0;
            this._fpsGovStart = 0;
            if (this._lastThrottledRender && (tNow - this._lastThrottledRender < 200)) {
                return;
            }
            this._lastThrottledRender = tNow;
        } else if (!isRecording && this.renderGovernor) {
            const blindTarget = (this.isPlayerBlind && this.isPlayerBlind(this.lastFrame && this.lastFrame.player)) ? 1.0 : 0.0;
            const hasActiveMotion = this.isStepping ||
                Boolean(this._hasUnsettledTileVis) ||
                Math.abs((this._blindFactor || 0) - blindTarget) > 0.002 ||
                this.trauma > 0.001 ||
                this.attackAnimationTime > 0 ||
                this.hurtAnimationTime > 0 ||
                this.castAnimationTime > 0 ||
                this.actionAnimationTime > 0 ||
                (this.particles && this.particles.length > 0) ||
                (this._activeHitSparks && this._activeHitSparks.length > 0) ||
                (this.activeProjectiles && this.activeProjectiles.length > 0) ||
                (this._vfxFlashState && this._vfxFlashState.active) ||
                (this.floatingTexts && this.floatingTexts.length > 0) ||
                (this._dyingMonsters && this._dyingMonsters.length > 0) ||
                (this.camera && (Math.abs(this.camera.rotation.y - (this.targetYaw || 0)) > 0.002 || Math.abs(this.camera.rotation.x - ((this.basePitch || 0) + (this.userPitchOffset || 0))) > 0.002));
            if (hasActiveMotion) {
                this.renderGovernor.wake(1500, tNow);
            }
            if (!this.renderGovernor.shouldRenderFrame(tNow)) {
                this._fpsGovFrames = 0;
                this._fpsGovStart = 0;
                return;
            }
        }

        const rawDelta = this._lastAnimTime ? (tNow - this._lastAnimTime) * 0.001 : 0.016;
        this._lastAnimTime = tNow;
        const _govIdleNow = Boolean(this.renderGovernor && tNow > (this.renderGovernor.activeUntilMs || 0));
        if (rawDelta > 0.10 || _govIdleNow) {
            this._fpsGovFrames = 0;
            this._fpsGovStart = 0;
        }
        const delta = Math.min(0.05, Math.max(0.001, rawDelta));

        const reducedMotion = Boolean(this._reducedMotionMql && this._reducedMotionMql.matches);
        const rawBobCfg = (typeof window !== 'undefined' && window.GRAPHICS_CONFIG && typeof window.GRAPHICS_CONFIG.headBobScale === 'number')
            ? window.GRAPHICS_CONFIG.headBobScale
            : 1.0;
        const bobScale = reducedMotion ? 0.0 : Math.max(0.0, Math.min(1.0, rawBobCfg));

        // Smooth camera position tweening (including grounded thresholdYOffset glide)
        if (!this._logicalCamPos) this._logicalCamPos = new THREE.Vector3().copy(this.targetCamPos);
        if (this.isStepping) {
            this.stepTime += delta;
            const progress = Math.min(1.0, this.stepTime / this.stepDuration);
            const t = this._strideChain ? progress : progress * (2 - progress); // Continuous held-key stride or ease-out quad

            this._logicalCamPos.lerpVectors(this.currentCamPos, this.targetCamPos, t);
            this.camera.position.copy(this._logicalCamPos);

            // Reactive Walking Head-bob applied strictly after logical position interpolation
            this.cameraBobPhase += delta * 18;
            this.camera.position.y = this._logicalCamPos.y + Math.sin(this.cameraBobPhase) * 0.045 * bobScale;

            if (progress >= 1.0) {
                this._logicalCamPos.copy(this.targetCamPos);
                this.currentCamPos.copy(this.targetCamPos);
                this.camera.position.copy(this.targetCamPos);
                this.isStepping = false;
                this.stepPlayedThisMove = false;
                this._lastStepEndMs = performance.now();
                this._strideChain = false;
            }
        } else {
            this._logicalCamPos.copy(this.targetCamPos);
            this.camera.position.copy(this._logicalCamPos);
            this.isStepping = false;
            this.stepPlayedThisMove = false;
            // Idle breathing bob & buoyant liquid bobbing in water
            const baseY = this.targetCamPos ? this.targetCamPos.y : this.eyeHeight;
            const idleBob = Math.sin(tNow * 0.002) * 0.012 * bobScale;
            const waterBob = (this.playerWaterYOffset && this.playerWaterYOffset < 0) ? Math.sin(tNow * 0.0035) * 0.016 * bobScale : 0;
            this.camera.position.y = baseY + idleBob + waterBob;
        }

        if (!this.isStepping && this._checkThresholdProximity && this._checkThresholdProximity()) {
            this._lastTerrainSig = null;
            if (this.lastFrame) this.updateDungeon(this.lastFrame);
        }
        if (this._tickSmoothVisibility) {
            this._tickSmoothVisibility(delta);
        }

        // Calm, subtle subterranean torch draft & low-fuel ember sputter when light_fuel <= 500
        const isEnhancedDraft = window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.torchDraft;
        let livingFlicker = isEnhancedDraft
            ? (1.0 + Math.sin(tNow * 0.0016) * 0.022 + Math.cos(tNow * 0.0008) * 0.014)
            : 1.0;

        const zeroDimScale = (this._zeroLightDimScale !== undefined) ? this._zeroLightDimScale : 1.0;
        let fuelFrac = 1.0;
        if (Number.isFinite(this._lightFuel) && this._lightFuel >= 0 && this._lightFuel <= 500) {
            fuelFrac = Math.max(0.0, Math.min(1.0, this._lightFuel / 500));
            const sputter = 1.0 - (1.0 - fuelFrac) * (0.14 + Math.sin(tNow * 0.017) * 0.09 + Math.cos(tNow * 0.029) * 0.05);
            livingFlicker *= Math.max(0.45, sputter);
        }

        const animCompat = (typeof window !== 'undefined' && window.Dungeon3DCompat) || null;
        const currentTargetEnergy = (this.targetTorchEnergy !== undefined ? this.targetTorchEnergy : 2.8) * zeroDimScale;
        if (this.torchSpotLight) {
            const rawPt = currentTargetEnergy * 0.82 * livingFlicker;
            const rawSp = currentTargetEnergy * 0.22 * livingFlicker;
            this.torchLight.intensity = animCompat ? animCompat.scaleIntensity('point', rawPt) : rawPt;
            this.torchSpotLight.intensity = animCompat ? animCompat.scaleIntensity('spot', rawSp) : rawSp;
        } else {
            const rawPt = currentTargetEnergy * livingFlicker;
            this.torchLight.intensity = animCompat ? animCompat.scaleIntensity('point', rawPt) : rawPt;
        }
        const allowFill = !(this.renderBudget && this.renderBudget.enableFillLight === false);
        const rawFillEnergy = allowFill ? (currentTargetEnergy * 0.06) * livingFlicker : 0.0;
        this.torchFillLight.intensity = animCompat ? animCompat.scaleIntensity('point', rawFillEnergy) : rawFillEnergy;

        // Warm lantern gold blending smoothly toward low-fuel ember when fuel <= 500
        if (this.torchBaseColor) {
            if (fuelFrac < 1.0 && this.torchLowColor && this.torchLight.color && typeof this.torchLight.color.lerpColors === 'function') {
                this.torchLight.color.lerpColors(this.torchLowColor, this.torchBaseColor, fuelFrac);
            } else {
                this.torchLight.color.copy(this.torchBaseColor);
            }
            if (this.torchSpotLight && this.torchSpotLight.color) {
                this.torchSpotLight.color.copy(this.torchLight.color);
            }
        }

        if (this.flameMesh) {
            const flameScale = (0.65 + 0.35 * fuelFrac);
            const flameBreath = flameScale * (1.0 + Math.sin(tNow * 0.002 + (1.0 - fuelFrac) * Math.sin(tNow * 0.019) * 0.25) * 0.03);
            this.flameMesh.scale.set(flameBreath, flameScale * (1.0 + Math.cos(tNow * 0.0015) * 0.04), flameBreath);
        }
        if (this._tickWorldPbrFrame) this._tickWorldPbrFrame(tNow);
        if (this._tickBlindnessShroud) this._tickBlindnessShroud(delta, tNow);

        // Ensure rotation order is always YXZ (Yaw first, then Pitch, then Roll)
        this.camera.rotation.order = 'YXZ';

        // Frame-rate-independent exponential yaw damping: 1 - Math.exp(-22 * dt)
        const targetYaw = this.targetYaw;
        const currentYaw = this.camera.rotation.y;
        const diff = targetYaw - currentYaw;
        const wrappedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));

        if (Math.abs(wrappedDiff) > 0.0015) {
            this.camera.rotation.y += wrappedDiff * (1.0 - Math.exp(-22.0 * delta));
        } else {
            this.camera.rotation.y = targetYaw;
        }

        // Natural Hand-Held Torch Inertia (responds to turning yaw and walking step bob)
        if (window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.torchInertia) {
            const yawInertia = Math.max(-0.14, Math.min(0.14, -wrappedDiff * 0.22));
            const bobInertia = (this.camera.position.y - this.eyeHeight) * 0.35;
            this.torchLight.position.x = -0.46 + yawInertia;
            this.torchLight.position.y = 0.28 - bobInertia;
        } else {
            this.torchLight.position.set(-0.46, 0.28, -0.18);
        }

        // Frame-rate-independent exponential pitch damping: 1 - Math.exp(-12 * dt)
        const activeTargetPitch = (this.basePitch !== undefined ? this.basePitch : -0.157) + (this.userPitchOffset || 0.0);
        this.targetPitch = activeTargetPitch;
        const pitchDiff = this.targetPitch - this.camera.rotation.x;
        if (Math.abs(pitchDiff) > 0.0008) {
            this.camera.rotation.x += pitchDiff * (1.0 - Math.exp(-12.0 * delta));
        } else {
            this.camera.rotation.x = this.targetPitch;
        }

        // Camera roll: lock strictly to 0 when not turning or experiencing trauma (prevents any left/right room skew)
        let roll = 0;
        if (Math.abs(wrappedDiff) > 0.005 && bobScale > 0) {
            roll = Math.max(-0.02, Math.min(0.02, -wrappedDiff * 0.04 * bobScale));
        }
        this.camera.rotation.z = roll;

        if (this.audio && typeof this.audio.updateListener === 'function' && this.camera) {
            if (!this._audioFwdVec) this._audioFwdVec = new THREE.Vector3(0, 0, -1);
            if (!this._audioUpVec) this._audioUpVec = new THREE.Vector3(0, 1, 0);
            this._audioFwdVec.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this._audioUpVec.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
            const px = Math.round(this.camera.position.x * 50);
            const py = Math.round(this.camera.position.y * 50);
            const pz = Math.round(this.camera.position.z * 50);
            const fx = Math.round(this._audioFwdVec.x * 100);
            const fy = Math.round(this._audioFwdVec.y * 100);
            const fz = Math.round(this._audioFwdVec.z * 100);
            const sig = `${px},${py},${pz}|${fx},${fy},${fz}`;
            if (sig !== this._lastAudioListenerSig) {
                this._lastAudioListenerSig = sig;
                this.audio.updateListener(this.camera.position, this._audioFwdVec, this._audioUpVec);
            }
        }

        // Live real-time broadcast of camera movement & yaw to HUD for smooth needle, vision cone & minimap
        if (window.__app && window.__app.hud) {
            const curYaw = -this.camera.rotation.y;
            const contX = this.cellSize > 0 ? (this.camera.position.x / this.cellSize) : 0;
            const contY = this.cellSize > 0 ? (this.camera.position.z / this.cellSize) : 0;
            const moved = Math.abs(contX - (this._lastBroadcastX || 0)) > 0.015 || Math.abs(contY - (this._lastBroadcastY || 0)) > 0.015;
            const turned = Math.abs(curYaw - (this._lastBroadcastYaw || 0)) > 0.003;
            if (moved || turned) {
                this._lastBroadcastX = contX;
                this._lastBroadcastY = contY;
                this._lastBroadcastYaw = curYaw;
                if (typeof window.__app.hud.onCameraMove === 'function') {
                    window.__app.hud.onCameraMove(contX, contY, curYaw);
                } else if (typeof window.__app.hud.onCameraTurn === 'function') {
                    window.__app.hud.onCameraTurn(curYaw);
                }
                if (window.__app.terminal && typeof window.__app.terminal.setCameraFacing === 'function') {
                    window.__app.terminal.setCameraFacing(curYaw);
                }
            }
        }

        // Camera Screen Trauma / Shake (scaled by headBobScale & prefers-reduced-motion)
        if (this.trauma > 0) {
            this.trauma = Math.max(0, this.trauma - delta * 1.5);
            if (bobScale > 0) {
                const shake = this.trauma * this.trauma * bobScale;
                this.camera.rotation.y += (Math.random() - 0.5) * 0.04 * shake;
                this.camera.rotation.x += (Math.random() - 0.5) * 0.04 * shake;
                this.camera.rotation.z += (Math.random() - 0.5) * 0.02 * shake;
            }
        }

        // Natural Walk Bobbing & Turn Sway on First-Person Hands (reuses single cameraBobPhase — no double increment!)
        let bobY = 0;
        let bobX = 0;
        if (this.isStepping) {
            bobY = Math.sin(this.cameraBobPhase) * 0.014 * bobScale;
            bobX = Math.cos(this.cameraBobPhase * 0.5) * 0.010 * bobScale;
        } else {
            bobY = Math.sin(tNow * 0.0025) * 0.003 * bobScale;
        }

        // Viewmodel Action Dynamics: 3-phase Attack swing (alternating dual-wield, bow brace/release, hurt recoil, 2-hand cast/read, quaff/aim)
        let actX = 0;
        let actZ = 0;
        let actY = 0;
        let actRotZ = 0;
        let actRotX = 0;
        let offhandCounterZ = 0;
        let offhandCounterRotX = 0;
        let leftCastX = 0;
        let leftCastY = 0;
        let leftCastZ = 0;
        let leftCastRotX = 0;
        let leftCastRotZ = 0;
        let isOffhandSwing = false;

        if (this.actionAnimationTime > 0) {
            this.actionAnimationTime = Math.max(0, this.actionAnimationTime - delta);
        }

        if (this._hitstopTime > 0) {
            this._hitstopTime = Math.max(0, this._hitstopTime - delta);
        } else if (this.attackAnimationTime > 0) {
            this.attackAnimationTime -= delta;
            isOffhandSwing = Boolean(this._swingOffhandNext && this._isOffhandDualWield);
            const prog = Math.max(0, Math.min(1, (0.24 - this.attackAnimationTime) / 0.24));
            let strikePulse = 0;
            let windupAmt = 0;
            if (prog < 0.18) {
                windupAmt = prog / 0.18;
            } else if (prog < 0.46) {
                const sFrac = Math.min(1.0, (prog - 0.18) / 0.18);
                strikePulse = Math.sin(sFrac * (Math.PI * 0.5));
            } else {
                const rFrac = (prog - 0.46) / 0.54;
                strikePulse = Math.cos(rFrac * (Math.PI * 0.5));
            }
            offhandCounterZ = -strikePulse * 0.05 + windupAmt * 0.025;
            offhandCounterRotX = -strikePulse * 0.10;
            const mir = (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY) || null;
            const activeWeaponKey = isOffhandSwing
                ? String(this.currentLeftWeapon || '').replace(/^offhand:/, '')
                : this.currentRightWeapon;
            const fam = (mir && typeof mir.getWeaponAnimFamily === 'function')
                ? mir.getWeaponAnimFamily(activeWeaponKey)
                : 'blade';
            if (fam === 'pierce') {
                // Wind-up draw-back into linear forward thrust along sightline (-Z in camera space)
                actZ -= strikePulse * 0.30 - windupAmt * 0.07;
                actY += strikePulse * 0.03 - windupAmt * 0.015;
                actRotX += strikePulse * 0.24 - windupAmt * 0.08;
            } else if (fam === 'axe_blunt') {
                // Overhead windup into heavy downward cleave/smash (-Z forward)
                actY += windupAmt * 0.11 - strikePulse * 0.15;
                actZ -= strikePulse * 0.20 - windupAmt * 0.05;
                actRotX += -windupAmt * 0.28 + strikePulse * 0.56;
                actRotZ -= strikePulse * 0.20;
            } else if (fam === 'bow') {
                // Draw brace (+Z draw) and crisp release forward recoil
                actZ += windupAmt * 0.14 - strikePulse * 0.06;
                actY += windupAmt * 0.02;
                actX -= windupAmt * 0.03 + strikePulse * 0.04;
                actRotX -= windupAmt * 0.08;
                actRotZ += strikePulse * 0.12;
                leftCastX = -windupAmt * 0.03;
                leftCastZ = windupAmt * 0.04;
            } else if (fam === 'device') {
                // Arcane forward extension (-Z) & tip elevation pulse
                actZ -= strikePulse * 0.22 - windupAmt * 0.04;
                actY += strikePulse * 0.05;
                actRotX += strikePulse * 0.20;
            } else {
                // Sweeping diagonal blade draw-cut across viewport (-Z forward)
                actX += windupAmt * 0.05 - strikePulse * 0.16;
                actY += windupAmt * 0.04 - strikePulse * 0.06;
                actZ -= strikePulse * 0.20 - windupAmt * 0.05;
                actRotZ += windupAmt * 0.14 - strikePulse * 0.46;
                actRotX += -windupAmt * 0.12 + strikePulse * 0.18;
            }
            if (this.currentRightWeapon === 'whip' && this.rightItemSlot) {
                const lash = this.rightItemSlot.getObjectByName('WhipStrikeLash');
                if (lash) lash.visible = true;
            }
        } else {
            if (this.currentRightWeapon === 'whip' && this.rightItemSlot) {
                const lash = this.rightItemSlot.getObjectByName('WhipStrikeLash');
                if (lash && lash.visible) lash.visible = false;
            }
            if (this.hurtAnimationTime > 0) {
                this.hurtAnimationTime -= delta;
                const prog = (0.16 - this.hurtAnimationTime) / 0.16;
                const sinPulse = Math.sin(prog * Math.PI);
                actZ += sinPulse * 0.10; // Recoil back toward camera (+Z)
                actRotX -= sinPulse * 0.18;
                actY -= sinPulse * 0.04;
            } else if (this.castAnimationTime > 0) {
                this.castAnimationTime -= delta;
                const dur = this.actionAnimationDuration || 0.32;
                const prog = Math.max(0, Math.min(1, (dur - this.castAnimationTime) / dur));
                const sinPulse = Math.sin(prog * Math.PI);
                const kind = this.actionAnimationKind || 'cast';
                if (kind === 'quaff' || kind === 'eat' || kind === 'horn') {
                    actX -= sinPulse * 0.11; // Bring toward mouth/center
                    actY += sinPulse * 0.12;
                    actZ += sinPulse * 0.05;
                    actRotX -= sinPulse * 0.42; // Tip flask/ration/horn back
                    actRotZ += sinPulse * 0.25;
                } else if (kind === 'aim') {
                    actX -= sinPulse * 0.06;
                    actY += sinPulse * 0.06;
                    actZ -= sinPulse * 0.14; // Level wand/rod forward (-Z)
                    actRotX += sinPulse * 0.18;
                } else if (kind === 'read') {
                    actX -= sinPulse * 0.08;
                    actY += sinPulse * 0.11;
                    actZ -= sinPulse * 0.04;
                    actRotX -= sinPulse * 0.16;
                    leftCastX = sinPulse * 0.08;
                    leftCastY = sinPulse * 0.11;
                    leftCastZ = -sinPulse * 0.04;
                    leftCastRotX = -sinPulse * 0.16;
                } else {
                    // Symmetrical two-hand arcane spell weave
                    const weave = Math.sin(prog * Math.PI * 2) * 0.10;
                    actY += sinPulse * 0.10;
                    actZ -= sinPulse * 0.06;
                    actRotX -= sinPulse * 0.24;
                    actRotZ -= weave;
                    leftCastX = sinPulse * 0.06;
                    leftCastY = sinPulse * 0.10;
                    leftCastZ = -sinPulse * 0.06;
                    leftCastRotX = -sinPulse * 0.24;
                    leftCastRotZ = weave;
                }
            }
        }

        // Apply to Right Hand (active swing unless off-hand dual-wield swing is executing)
        const isBeholderVm = this._activeAvatarArchetype === 'beholder';
        const vmAspectScale = (this.camera && this.camera.aspect && this.camera.aspect < 0.85)
            ? Math.max(0.56, this.camera.aspect / 0.85)
            : 1.0;
        const vmPullZ = -0.05 * (1.0 - vmAspectScale);
        if (this.rightHandGroup && this.rightRestPos) {
            const stalkBobY = isBeholderVm ? Math.sin(tNow * 0.0034) * 0.022 * bobScale : 0;
            const stalkBobX = isBeholderVm ? Math.cos(tNow * 0.0023) * 0.014 * bobScale : 0;
            const rActX = isOffhandSwing ? 0 : actX;
            const rActY = isOffhandSwing ? 0 : actY;
            const rActZ = isOffhandSwing ? offhandCounterZ : actZ;
            const rActRotX = isOffhandSwing ? offhandCounterRotX : actRotX;
            const rActRotZ = isOffhandSwing ? 0 : actRotZ;
            this.rightHandGroup.position.x = (this.rightRestPos.x * vmAspectScale) + bobX + rActX + stalkBobX;
            this.rightHandGroup.position.y = this.rightRestPos.y + bobY + rActY + stalkBobY;
            this.rightHandGroup.position.z = this.rightRestPos.z + vmPullZ + rActZ;
            this.rightHandGroup.rotation.x = this.rightRestRot.x + rActRotX;
            this.rightHandGroup.rotation.y = this.rightRestRot.y;
            this.rightHandGroup.rotation.z = this.rightRestRot.z + rActRotZ;
        }

        // Apply to Left Hand (mirrored dual-wield swing, 2-hand cast/read weave, counter-balance, or Beholder stalk bob)
        if (this.leftHandGroup && this.leftRestPos) {
            const stalkBobY = isBeholderVm ? Math.sin(tNow * 0.0034 + 1.85) * 0.022 * bobScale : 0;
            const stalkBobX = isBeholderVm ? Math.cos(tNow * 0.0023 + 1.85) * 0.014 * bobScale : 0;
            const lActX = isOffhandSwing ? -actX : leftCastX;
            const lActY = isOffhandSwing ? actY : (this.hurtAnimationTime > 0 ? actY : leftCastY);
            const lActZ = isOffhandSwing ? actZ : (this.hurtAnimationTime > 0 ? actZ : (leftCastZ || offhandCounterZ));
            const lActRotX = isOffhandSwing ? actRotX : (this.hurtAnimationTime > 0 ? actRotX : (leftCastRotX || offhandCounterRotX));
            const lActRotZ = isOffhandSwing ? -actRotZ : leftCastRotZ;
            this.leftHandGroup.position.x = (this.leftRestPos.x * vmAspectScale) - bobX + lActX + stalkBobX;
            this.leftHandGroup.position.y = this.leftRestPos.y + bobY + lActY + stalkBobY;
            this.leftHandGroup.position.z = this.leftRestPos.z + vmPullZ + lActZ;
            this.leftHandGroup.rotation.x = this.leftRestRot.x + lActRotX;
            this.leftHandGroup.rotation.y = this.leftRestRot.y;
            this.leftHandGroup.rotation.z = this.leftRestRot.z + lActRotZ;
        }

        // Animated flicker on handheld torch flame
        if (this.torchMesh && this.torchMesh.visible && this.flameMesh && this.innerFlameMesh) {
            const flicker = 0.92 + Math.sin(tNow * 0.018) * 0.08 + (Math.random() - 0.5) * 0.06;
            this.flameMesh.scale.set(flicker, flicker * 1.1, flicker);
            this.innerFlameMesh.scale.set(flicker, flicker * 1.05, flicker);
        }

        // Floating combat texts (damage numbers, crits, misses drifting upward)
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.elapsed += delta;
            ft.sprite.position.y = ft.basePos.y + ft.elapsed * 0.85;
            const alpha = Math.max(0, 1.0 - (ft.elapsed / ft.duration));
            ft.material.opacity = alpha;
            if (ft.elapsed >= ft.duration) {
                this.scene.remove(ft.sprite);
                ft.material.dispose();
                if (ft.material.map && !ft.material.map._cachedFloatingTex) {
                    ft.material.map.dispose();
                }
                this.floatingTexts.splice(i, 1);
            }
        }

        // Persistent pooled VFX flash PointLight decay (zero shader recompilation stalls)
        if (this.vfxFlashLight && this._vfxFlashState && this._vfxFlashState.active) {
            this._vfxFlashState.elapsed += delta;
            const fFrac = Math.min(1.0, this._vfxFlashState.elapsed / this._vfxFlashState.duration);
            if (fFrac >= 1.0) {
                this.vfxFlashLight.intensity = 0;
                this._vfxFlashState.active = false;
            } else {
                const rawVfxI = this._vfxFlashState.maxIntensity * (1.0 - fFrac);
                this.vfxFlashLight.intensity = animCompat ? animCompat.scaleIntensity('point', rawVfxI) : rawVfxI;
            }
        }

        // Pooled 60fps impact sparks (zero per-impact GPU/GC allocations; instanced 2-draw-call burst path)
        if (this._activeHitSparks && this._activeHitSparks.length > 0) {
            const dummy = this._sparkDummy || (this._sparkDummy = new THREE.Object3D());
            const lookTarget = this._tmpSparkLook || (this._tmpSparkLook = new THREE.Vector3());
            for (let i = this._activeHitSparks.length - 1; i >= 0; i--) {
                const p = this._activeHitSparks[i];
                p.elapsed += delta;
                const grav = p.gravity !== undefined ? p.gravity : 6.0;
                const sCount = p.activeCount || 0;
                if (p.instanced && p.streakInstMesh && p.sparkInstMesh) {
                    let sIdxCount = 0;
                    let dIdxCount = 0;
                    for (let sIdx = 0; sIdx < sCount; sIdx++) {
                        const sp = p.sparks[sIdx];
                        sp.pos.addScaledVector(sp.vel, delta);
                        sp.vel.y -= delta * grav;
                        dummy.position.copy(sp.pos);
                        if (sp.isStreak && sp.vel.lengthSq() > 0.01) {
                            lookTarget.copy(sp.pos).add(sp.vel);
                            dummy.lookAt(lookTarget);
                        } else {
                            dummy.rotation.set(0, 0, 0);
                        }
                        const sc = sp.scale !== undefined ? sp.scale : 1.0;
                        dummy.scale.set(sc, sc, sc);
                        dummy.updateMatrix();
                        if (sp.isStreak) {
                            p.streakInstMesh.setMatrixAt(sIdxCount++, dummy.matrix);
                        } else {
                            p.sparkInstMesh.setMatrixAt(dIdxCount++, dummy.matrix);
                        }
                    }
                    p.streakInstMesh.count = sIdxCount;
                    p.sparkInstMesh.count = dIdxCount;
                    p.streakInstMesh.instanceMatrix.needsUpdate = true;
                    p.sparkInstMesh.instanceMatrix.needsUpdate = true;
                } else {
                    for (let sIdx = 0; sIdx < sCount; sIdx++) {
                        const sp = p.sparks[sIdx];
                        sp.mesh.position.addScaledVector(sp.vel, delta);
                        sp.vel.y -= delta * grav;
                        if (sp.isStreak && sp.vel.lengthSq() > 0.01) {
                            lookTarget.copy(sp.mesh.position).add(sp.vel);
                            sp.mesh.lookAt(lookTarget);
                        }
                    }
                }
                const alpha = Math.max(0, 1.0 - (p.elapsed / p.duration));
                p.material.opacity = alpha;
                if (p.altMaterial) p.altMaterial.opacity = alpha;
                if (p.hasShockRing && p.shockRingMesh) {
                    const sFrac = Math.min(1.0, p.elapsed / p.duration);
                    const ringScale = 1.0 + sFrac * 2.2;
                    p.shockRingMesh.scale.set(ringScale, ringScale, ringScale);
                    if (p.ringMat) p.ringMat.opacity = alpha * 0.85;
                }
                if (p.elapsed >= p.duration) {
                    if (p.instanced) {
                        if (p.streakInstMesh) p.streakInstMesh.count = 0;
                        if (p.sparkInstMesh) p.sparkInstMesh.count = 0;
                    }
                    p.group.visible = false;
                    if (this.scene) this.scene.remove(p.group);
                    this._activeHitSparks.splice(i, 1);
                    if (this._hitSparkPool) this._hitSparkPool.push(p);
                }
            }
        }

        // Legacy kinetic impact sparks & combat particles fallback
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.elapsed += delta;
            for (const sp of p.sparks) {
                sp.mesh.position.addScaledVector(sp.vel, delta);
                sp.vel.y -= delta * 6.0; // Gravity
                if (sp.isStreak && sp.vel.lengthSq() > 0.01) {
                    const lookTarget = this._tmpSparkLook || (this._tmpSparkLook = new THREE.Vector3());
                    lookTarget.copy(sp.mesh.position).add(sp.vel);
                    sp.mesh.lookAt(lookTarget);
                }
            }
            const alpha = Math.max(0, 1.0 - (p.elapsed / p.duration));
            p.material.opacity = alpha;
            if (p.shockRingMesh) {
                const sFrac = Math.min(1.0, p.elapsed / p.duration);
                const ringScale = 1.0 + sFrac * 2.2;
                p.shockRingMesh.scale.set(ringScale, ringScale, ringScale);
                if (p.ringMat) p.ringMat.opacity = alpha * 0.85;
            }
            if (p.elapsed >= p.duration) {
                this.scene.remove(p.group);
                if (p.material && !p.material._sharedMaterial) p.material.dispose();
                if (p.ringMat && !p.ringMat._sharedMaterial) p.ringMat.dispose();
                this.particles.splice(i, 1);
            }
        }

        // Kinetic 3D combat projectiles & spell effects
        if (this.activeProjectiles && this.activeProjectiles.length > 0) {
            for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
                const proj = this.activeProjectiles[i];
                proj.elapsed += delta;
                const t = Math.min(1.0, proj.elapsed / proj.duration);

                if (proj.kind === 'arrow') {
                    proj.group.position.lerpVectors(proj.startPos, proj.endPos, t);
                } else if (proj.kind === 'potion') {
                    proj.group.position.lerpVectors(proj.startPos, proj.endPos, t);
                    proj.group.position.y += 4 * 0.65 * t * (1.0 - t);
                    proj.group.rotation.x += delta * 12.0;
                    proj.group.rotation.z += delta * 8.0;
                } else if (proj.kind === 'fireball' || proj.kind === 'bolt' || proj.kind === 'frost' || proj.kind === 'frost_bolt' || proj.kind === 'acid' || proj.kind === 'acid_bolt' || proj.kind === 'poison' || proj.kind === 'nether' || proj.kind === 'chaos') {
                    proj.group.position.lerpVectors(proj.startPos, proj.endPos, t);
                    if (proj.spinMeshes) {
                        for (let sIdx = 0; sIdx < proj.spinMeshes.length; sIdx++) {
                            const sm = proj.spinMeshes[sIdx];
                            const dirSign = (sIdx % 2 === 0) ? 1 : -1;
                            sm.rotation.z += delta * 7.5 * dirSign;
                            sm.rotation.x += delta * 4.5 * dirSign;
                        }
                    }
                    if (proj.kind === 'acid' || proj.kind === 'acid_bolt' || proj.kind === 'poison') {
                        const pulse = 1.0 + Math.sin(t * Math.PI * 4.0) * 0.14;
                        proj.group.scale.setScalar(pulse);
                    }
                } else if (proj.kind === 'breath') {
                    const dist = proj.dist || Math.max(1.5, proj.startPos.distanceTo(proj.endPos));
                    const zReach = dist * Math.min(1.0, t * 1.4);
                    proj.group.scale.set(0.65 + t * 0.75, 0.65 + t * 0.75, zReach / 1.45);
                    if (proj.vortexRings) {
                        for (const vr of proj.vortexRings) {
                            vr.rotation.z += delta * 7.5;
                        }
                    }
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.outerMat) proj.outerMat.opacity = fade * 0.72;
                    if (proj.innerMat) proj.innerMat.opacity = fade * 0.85;
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.80;
                    if (proj.pLight) proj.pLight.intensity = fade * 4.5;
                } else if (proj.kind === 'detonation') {
                    const sc = (proj.baseScale || 1.0) * (0.8 + t * 1.6);
                    proj.group.scale.set(sc, proj.squashY ? sc * proj.squashY : sc, sc);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.domeMat) proj.domeMat.opacity = fade * (proj.domeOpacity || 0.82);
                    if (proj.coreMat) proj.coreMat.opacity = fade * 0.95;
                    if (proj.altDomeMat) proj.altDomeMat.opacity = fade * 0.85;
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.88;
                    if (proj.extraMat) proj.extraMat.opacity = fade * 0.92;
                    if (proj.extraMeshes) {
                        for (let eIdx = 0; eIdx < proj.extraMeshes.length; eIdx++) {
                            const em = proj.extraMeshes[eIdx];
                            if (em.userData && em.userData.spinRate) {
                                em.rotation.z += delta * em.userData.spinRate;
                                em.rotation.y += delta * em.userData.spinRate * 0.6;
                            } else if (em.userData && em.userData.radialDir) {
                                em.position.addScaledVector(em.userData.radialDir, delta * 2.2);
                            }
                        }
                    }
                    if (proj.pLight) proj.pLight.intensity = (1.0 - t) * 4.2;
                } else if (proj.kind === 'slash' || proj.kind === 'crit_slash' || proj.kind === 'axe_cleave') {
                    proj.group.rotation.z += delta * (proj.kind === 'axe_cleave' ? 8.2 : 6.5);
                    const sc = 1.0 + t * (proj.kind === 'axe_cleave' ? 0.72 : 0.55);
                    proj.group.scale.set(sc, sc, sc);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.outerMat) proj.outerMat.opacity = fade * 0.95;
                    if (proj.innerMat) proj.innerMat.opacity = fade * 0.98;
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.85;
                    if (proj.pLight) proj.pLight.intensity = (1.0 - t) * 3.5;
                } else if (proj.kind === 'whip_lash') {
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.90;
                    if (proj.lines && proj.lines.length > 0) {
                        for (const ln of proj.lines) {
                            if (ln.material) ln.material.opacity = fade * 0.98;
                        }
                    }
                } else if (proj.kind === 'blunt') {
                    const sc = 1.0 + t * 1.35;
                    proj.group.scale.set(sc, sc, sc);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.bluntRingMat) proj.bluntRingMat.opacity = fade * 0.85;
                    if (proj.bluntDomeMat) proj.bluntDomeMat.opacity = fade * 0.85;
                    if (proj.pLight) proj.pLight.intensity = (1.0 - t) * 3.0;
                } else if (proj.kind === 'pierce') {
                    proj.group.position.lerpVectors(proj.startPos, proj.endPos, Math.min(1.0, t * 1.35));
                    proj.group.scale.set(1.0, 1.0, 1.0 + t * 0.8);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.lanceMat) proj.lanceMat.opacity = fade * 0.95;
                    if (proj.needleMat) proj.needleMat.opacity = fade * 0.98;
                } else if (proj.kind === 'lightning') {
                    proj.jitterTimer = (proj.jitterTimer || 0) + delta;
                    if (proj.jitterTimer >= 0.035 && proj.lines) {
                        proj.jitterTimer = 0;
                        const basePt = this._tmpLightningVec || (this._tmpLightningVec = new THREE.Vector3());
                        for (const line of proj.lines) {
                            const posAttr = line.geometry.attributes.position;
                            const count = posAttr.count;
                            for (let pIdx = 1; pIdx < count - 1; pIdx++) {
                                const frac = pIdx / (count - 1);
                                basePt.lerpVectors(proj.startPos, proj.endPos, frac);
                                basePt.x += (Math.random() - 0.5) * 0.36;
                                basePt.y += (Math.random() - 0.5) * 0.36;
                                basePt.z += (Math.random() - 0.5) * 0.36;
                                posAttr.setXYZ(pIdx, basePt.x - proj.group.position.x, basePt.y - proj.group.position.y, basePt.z - proj.group.position.z);
                            }
                            posAttr.needsUpdate = true;
                        }
                    }
                } else if (proj.kind === 'aura') {
                    proj.group.rotation.y += delta * 4.2;
                    proj.group.position.y = proj.startPos.y + t * 0.35;
                    const sc = 1.0 + t * 0.3;
                    proj.group.scale.set(sc, 1.0, sc);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.pillarMat) proj.pillarMat.opacity = fade * 0.42;
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.85;
                    if (proj.pLight) proj.pLight.intensity = (1.0 - t) * 3.2;
                }

                if (proj.elapsed >= proj.duration) {
                    if (this.scene) this.scene.remove(proj.group);
                    if (proj.onComplete) proj.onComplete();
                    if (proj.disposables) {
                        for (const d of proj.disposables) {
                            if (d && !d._sharedGeometry && !d._sharedMaterial && !d._sharedTexture && typeof d.dispose === 'function') d.dispose();
                        }
                    }
                    this.activeProjectiles.splice(i, 1);
                }
            }
        }

        // Distance culling for floating terrain labels (90m stores, 25m stairs/landmarks; store floating text stays visible at all distances)
        if (this.terrainLabelsGroup && this.terrainLabelsGroup.children) {
            for (let i = 0; i < this.terrainLabelsGroup.children.length; i++) {
                const sprite = this.terrainLabelsGroup.children[i];
                const maxDist = sprite.maxDist || 45.0;
                const dSq = this.camera.position.distanceToSquared(sprite.position);
                sprite.visible = (dSq <= maxDist * maxDist);
                if (sprite._wayfinderSprite && sprite._wayfinderMat) {
                    const dist = Math.sqrt(dSq);
                    sprite._wayfinderSprite.visible = sprite.visible;
                    sprite._wayfinderMat.opacity = 1.0;
                    if (sprite.visible) {
                        const wfW = Math.min(11.5, Math.max(3.6, 2.2 + dist * 0.16));
                        const wfY = Math.min(5.85, Math.max(4.55, 4.20 + dist * 0.055));
                        sprite._wayfinderSprite.position.y = wfY;
                        sprite._wayfinderSprite.scale.set(wfW, wfW * 0.1875, 1.0);
                    }
                }
            }
        }
        if (this.storefrontPropsGroup && this.storefrontPropsGroup.visible && this.storefrontPropsGroup.children) {
            for (let i = 0; i < this.storefrontPropsGroup.children.length; i++) {
                const anchor = this.storefrontPropsGroup.children[i];
                anchor.visible = (this.camera.position.distanceToSquared(anchor.position) <= 1225.0);
            }
        }

        // 3D StreetView Interactive Ground Cursor & A* Breadcrumbs (Active Travel + Hover Preview)
        const activeNavPath = (this._hoverInputRef && this._hoverInputRef._minimapNavPath) ||
            (typeof window !== 'undefined' && window.__app && window.__app.input && window.__app.input._minimapNavPath) ||
            null;

        if (activeNavPath && activeNavPath.length > 0 && this.lastFrame && this.canEngageStreetViewNav(this.lastFrame)) {
            this._hadActiveNavPath = true;
            if (this.navCursorGroup && this.navCursorMesh) {
                this.navCursorGroup.visible = true;
                this.navCursorMesh.visible = true;
                const goal = activeNavPath[activeNavPath.length - 1];
                this.navCursorMesh.position.set(goal.x * this.cellSize, 0.036, goal.y * this.cellSize);
                this.navCursorMesh.material.color.setHex(0xffe066);
                this.navCursorMesh.material.opacity = 0.72 + Math.sin(tNow * 0.008) * 0.20;
                if (this.navBreadcrumbsMesh) {
                    if (!this._scratchNavMatrix) this._scratchNavMatrix = new THREE.Matrix4();
                    if (!this._scratchNavPos) this._scratchNavPos = new THREE.Vector3();
                    const count = Math.min(activeNavPath.length, 64);
                    for (let pIdx = 0; pIdx < count; pIdx++) {
                        const step = activeNavPath[pIdx];
                        this._scratchNavPos.set(step.x * this.cellSize, 0.030, step.y * this.cellSize);
                        this._scratchNavMatrix.makeTranslation(this._scratchNavPos.x, this._scratchNavPos.y, this._scratchNavPos.z);
                        this.navBreadcrumbsMesh.setMatrixAt(pIdx, this._scratchNavMatrix);
                    }
                    this.navBreadcrumbsMesh.count = count;
                    this.navBreadcrumbsMesh.instanceMatrix.needsUpdate = true;
                }
            }
        } else {
            if (this._hadActiveNavPath) {
                this._hadActiveNavPath = false;
                if (!this._hoveredTile && this.navCursorGroup) {
                    this.navCursorGroup.visible = false;
                    if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
                }
            }
            if (this._hoverDirty && this.lastFrame && this.canEngageStreetViewNav(this.lastFrame)) {
                if (tNow - (this._lastHoverRaycastMs || 0) > 50) {
                    this._lastHoverRaycastMs = tNow;
                    this._hoverDirty = false;
                    const px = this.lastFrame.player ? this.lastFrame.player.x : 0;
                    const py = this.lastFrame.player ? this.lastFrame.player.y : 0;
                    const hit = (this._pendingHoverX >= 0 && this._pendingHoverY >= 0)
                        ? this.getTileAtScreenCoords(this._pendingHoverX, this._pendingHoverY)
                        : null;
                    if (hit && (hit.x !== px || hit.y !== py)) {
                        const hitTileX = hit.x;
                        const hitTileY = hit.y;
                        const hoverSlot = this._hoveredTileObj || (this._hoveredTileObj = { x: 0, y: 0 });
                        hoverSlot.x = hitTileX;
                        hoverSlot.y = hitTileY;
                        this._hoveredTile = hoverSlot;
                        if (hitTileX !== this._lastHoverTileX || hitTileY !== this._lastHoverTileY) {
                            this._lastHoverTileX = hitTileX;
                            this._lastHoverTileY = hitTileY;
                            const path = (this._hoverInputRef && typeof this._hoverInputRef.computeMinimapPath === 'function')
                                ? this._hoverInputRef.computeMinimapPath(px, py, hitTileX, hitTileY, this.lastFrame)
                                : null;
                            if (this.navCursorGroup && this.navCursorMesh) {
                                this.navCursorGroup.visible = true;
                                this.navCursorMesh.visible = true;
                                this.navCursorMesh.position.set(hitTileX * this.cellSize, 0.035, hitTileY * this.cellSize);
                                if (path && path.length > 0 && path.length <= 64) {
                                    const isDoor = hit.kind === 'door';
                                    this.navCursorMesh.material.color.setHex(isDoor ? 0xff9f1c : 0xd4af37);
                                    this.navCursorMesh.material.opacity = isDoor ? 0.48 : 0.24;
                                    if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
                                } else {
                                    if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
                                    this.navCursorMesh.material.color.setHex(0xef4444);
                                    this.navCursorMesh.material.opacity = 0.32;
                                }
                            }
                        }
                    } else {
                        this._hoveredTile = null;
                        this._lastHoverTileX = -1;
                        this._lastHoverTileY = -1;
                        if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
                        if (this.navCursorGroup) this.navCursorGroup.visible = false;
                    }
                    if (typeof this._updateHoverAffordance === 'function') {
                        this._updateHoverAffordance(this._pendingHoverX, this._pendingHoverY, this._hoverInputRef, this.lastFrame, hit);
                    }
                }
            } else if (this._hoverDirty && this.lastFrame && (tNow - (this._lastHoverRaycastMs || 0) > 50)) {
                this._lastHoverRaycastMs = tNow;
                this._hoverDirty = false;
                const hit = (this._pendingHoverX >= 0 && this._pendingHoverY >= 0 && this._hoverInputRef?.isDirectionalTargeting?.())
                    ? this.getTileAtScreenCoords(this._pendingHoverX, this._pendingHoverY)
                    : null;
                if (typeof this._updateHoverAffordance === 'function') {
                    this._updateHoverAffordance(this._pendingHoverX, this._pendingHoverY, this._hoverInputRef, this.lastFrame, hit);
                }
            }
        }

        // 3D StreetView Ground Chevrons: strictly hidden (opacity 0) unless hovered (warm etched gold 0xd4af37, scale 0.85)
        if (this.streetViewGroup && this.streetViewGroup.visible && this._streetChevrons && this.camera) {
            for (let i = 0; i < this._streetChevrons.length; i++) {
                const chevron = this._streetChevrons[i];
                const d = chevron.userData;
                const isHovered = Boolean(d.passable && this._hoveredTile && this._hoveredTile.x === d.tx && this._hoveredTile.y === d.ty);
                if (!isHovered) {
                    chevron.visible = false;
                    chevron.material.opacity = 0;
                    continue;
                }
                chevron.visible = true;
                chevron.material.color.setHex(0xd4af37);
                chevron.material.opacity = 0.86;
                chevron.scale.set(0.85, 1.0, 0.85);
            }
        }

        // Monsters gentle hover, walking lerp & facing
        const monTime = tNow * 0.003;
        const camPos = this.camera ? this.camera.position : null;
        const candidateNameplates = this._candidateNameplates || (this._candidateNameplates = []);
        candidateNameplates.length = 0;
        const walkLerpFactor = 1.0 - Math.exp(-15.0 * delta);
        const turnLerpFactor = 1.0 - Math.exp(-8.0 * delta);

        for (const entity of this.monsters.values()) {
            const entityDistSq = camPos ? ((entity.position.x - camPos.x) ** 2 + (entity.position.z - camPos.z) ** 2) : 0;
            entity.visible = (entityDistSq <= 1225) && !entity.pending3DConfig;
            const pl = this.lastFrame && this.lastFrame.player;
            const hasEspLoop = Boolean(this.hasPlayerEsp && this.hasPlayerEsp(pl));
            if (entity.visible && (this._blindFactor > 0.35 || entity._hasEspMatOverride || hasEspLoop) && this._applyBlindMonsterState && entity.monsterData) {
                this._applyBlindMonsterState(entity, entity.monsterData, pl, pl ? pl.x : 0, pl ? pl.y : 0, this._blindFactor || 0);
            }
            if (!entity.visible) {
                if (entity.nameplate) entity.nameplate.visible = false;
                continue;
            }
            if (entity._perceptVis !== undefined && entity._perceptVis < 1.0) {
                entity._perceptVis = Math.min(1.0, entity._perceptVis + delta / 0.14);
                if (this.renderGovernor && entity._perceptVis < 1.0) this.renderGovernor.wake(180, tNow);
            }

            if (camPos && entity.nameplate) {
                const dx = entity.position.x - camPos.x;
                const dz = entity.position.z - camPos.z;
                const distSq = dx * dx + dz * dz;
                const dist = Math.sqrt(distSq);
                const tileDist = dist / (this.cellSize || 2.0);
                const mData = entity.monsterData;
                const isTargeted = Boolean(entity.lastTargeted || (entity.nameplate && entity.nameplate.isTargeted));
                const isWoundedOrBoss = Boolean(mData && (mData.unique || mData.isBoss || (mData.hp_max > 0 && mData.hp < mData.hp_max)));
                let npOpacity = entity._perceptVis !== undefined ? entity._perceptVis : 1.0;
                if (!isTargeted && !isWoundedOrBoss) {
                    if (tileDist > 7.0) {
                        npOpacity *= Math.max(0, 1.0 - (tileDist - 7.0) / 3.5);
                    }
                } else if (tileDist > 10.0) {
                    npOpacity *= Math.max(0, 1.0 - (tileDist - 10.0) / 3.0);
                }
                if (npOpacity <= 0.02 || !entity.visible) {
                    entity.nameplate.visible = false;
                } else {
                    const angle = Math.atan2(dx, dz);
                    candidateNameplates.push({ entity, dist, angle, isTargeted, npOpacity });
                }
            }
            const mdNow = entity.monsterData || {};
            const isAsleepNow = Boolean(entity.isAsleep || mdNow.asleep);
            const isParalyzedNow = Boolean(mdNow.paralyzed || mdNow.held);
            if (entity.targetPos) {
                const dist = entity.position.distanceTo(entity.targetPos);
                if (dist > this.cellSize * 2.2) {
                    // Teleport snap
                    entity.position.copy(entity.targetPos);
                } else if (dist > 0.01) {
                    // Frame-rate independent 1-tile walking lerp
                    entity.position.lerp(entity.targetPos, walkLerpFactor);
                    // Face movement direction
                    const dx = entity.targetPos.x - entity.position.x;
                    const dz = entity.targetPos.z - entity.position.z;
                    if (dx * dx + dz * dz > 0.001) {
                        const targetYaw = Math.atan2(dx, dz);
                        const diff = targetYaw - entity.rotation.y;
                        const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
                        entity.rotation.y += wrapped * Math.min(1.0, delta * 14.0);
                    }
                } else {
                    // Idle: Face player (or turn AWAY when fleeing/afraid), unless asleep/paralyzed
                    if (!isAsleepNow && !isParalyzedNow) {
                        const isFleeing = Boolean(mdNow.afraid);
                        const dx = isFleeing ? (entity.position.x - this.camera.position.x) : (this.camera.position.x - entity.position.x);
                        const dz = isFleeing ? (entity.position.z - this.camera.position.z) : (this.camera.position.z - entity.position.z);
                        if (dx * dx + dz * dz > 0.001) {
                            const targetYaw = Math.atan2(dx, dz);
                            const diff = targetYaw - entity.rotation.y;
                            const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
                            entity.rotation.y += wrapped * turnLerpFactor;
                        }
                    }
                }
            }
            // Vertical hover for floating creatures only (grounded beasts stay firmly planted) + subtle hallucination shimmer
            const baseY = entity.isFloating ? 0.45 : 0.0;
            const hallucJitter = (mdNow.hallucination || mdNow.attr_multi)
                ? Math.sin(monTime * 7.2 + (entity._bobPhase || 0)) * 0.025
                : 0.0;
            entity.position.y = (entity.isFloating ? (baseY + Math.sin(monTime + (entity._bobPhase || 0)) * 0.07) : baseY) + hallucJitter;
            if (entity.contactShadow) {
                entity.contactShadow.position.y = -entity.position.y - 0.042;
            }
            if (entity.creatureMesh && !entity._vortexChecked) {
                entity._vortexChecked = true;
                const vRings = [];
                entity.creatureMesh.traverse((vc) => {
                    if (vc.userData && vc.userData._vortexSpin) vRings.push(vc);
                });
                entity._vortexRings = vRings.length > 0 ? vRings : null;
            }
            if (entity._vortexRings) {
                for (let vi = 0; vi < entity._vortexRings.length; vi++) {
                    const vr = entity._vortexRings[vi];
                    vr.rotation.y += delta * (vr.userData._vortexSpin || 3.5);
                }
            }

            // Apply Attack Lunge & Hit Flinch as clean local offsets on creatureMesh (never drifting entity.position off its tile)
            let localOffsetX = 0;
            let localOffsetZ = 0;
            if (entity._attackLungeTimer > 0) {
                entity._attackLungeTimer = Math.max(0, entity._attackLungeTimer - delta);
                if (entity._attackLungeDir) {
                    const lFrac = entity._attackLungeTimer / 0.24;
                    const lungeAmt = Math.sin(lFrac * Math.PI) * 0.34;
                    localOffsetX += entity._attackLungeDir.x * lungeAmt;
                    localOffsetZ += entity._attackLungeDir.z * lungeAmt;
                }
            }
            if (entity._hitFlinchTimer > 0) {
                entity._hitFlinchTimer = Math.max(0, entity._hitFlinchTimer - delta);
                if (entity._hitFlinchDir) {
                    const fFrac = entity._hitFlinchTimer / 0.20;
                    const flinchAmt = Math.sin(fFrac * Math.PI) * 0.16;
                    localOffsetX += entity._hitFlinchDir.x * flinchAmt;
                    localOffsetZ += entity._hitFlinchDir.z * flinchAmt;
                }
            }
            if (entity.creatureMesh) {
                if (localOffsetX !== 0 || localOffsetZ !== 0) {
                    const cosY = Math.cos(-entity.rotation.y);
                    const sinY = Math.sin(-entity.rotation.y);
                    entity.creatureMesh.position.x = localOffsetX * cosY - localOffsetZ * sinY;
                    entity.creatureMesh.position.z = localOffsetX * sinY + localOffsetZ * cosY;
                } else if (entity.creatureMesh.position.x !== 0 || entity.creatureMesh.position.z !== 0) {
                    entity.creatureMesh.position.x = 0;
                    entity.creatureMesh.position.z = 0;
                }
                if (isAsleepNow && !entity.isFloating) {
                    entity.creatureMesh.rotation.x = 0.16;
                    entity.creatureMesh.position.y = -0.05;
                    entity._wasSleepDrooped = true;
                } else if (entity._wasSleepDrooped) {
                    entity.creatureMesh.rotation.x = 0;
                    entity.creatureMesh.position.y = 0;
                    entity._wasSleepDrooped = false;
                }
            }
            if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.applyEntityHitFlash === 'function') {
                window.Dungeon3DAtmosphere.applyEntityHitFlash(entity, delta);
            }

            // Mixer state machine: idle vs walk vs attack/hit/sleep/paralyze (distance-culled at 18m / 324m^2)
            if (entity._mixer) {
                if (isAsleepNow || isParalyzedNow) {
                    entity._mixer.timeScale = 0.0;
                } else {
                    const speedMult = (mdNow.fast || mdNow.hasted) ? 1.25 : ((mdNow.slow || mdNow.slowed) ? 0.70 : 1.0);
                    entity._mixer.timeScale = speedMult;
                    const inOneShotCombat = (entity._attackLungeTimer > 0 && entity._activeAnimState === 'attack') ||
                                            (entity._hitFlinchTimer > 0 && entity._activeAnimState === 'hit');
                    const isMoving = Boolean(entity.targetPos && entity.position.distanceTo(entity.targetPos) > 0.02);
                    entity._walkHoldTimer = isMoving ? 0.26 : Math.max(0, (entity._walkHoldTimer || 0) - delta);
                    const wantWalk = Boolean(entity._walkAction && (isMoving || entity._walkHoldTimer > 0));
                    if (!inOneShotCombat) {
                        if (wantWalk && entity._activeAnimState !== 'walk') {
                            entity._activeAnimState = 'walk';
                            const wAct = entity._walkAction;
                            if (typeof wAct.stopFading === 'function') wAct.stopFading();
                            wAct.enabled = true;
                            wAct.setEffectiveTimeScale(1).setEffectiveWeight(1).reset().play();
                            if (entity._idleAction && entity._idleAction.isRunning()) {
                                if (typeof entity._idleAction.stopFading === 'function') entity._idleAction.stopFading();
                                entity._idleAction.crossFadeTo(wAct, 0.14, true);
                            }
                        } else if (!wantWalk && entity._idleAction && entity._activeAnimState !== 'idle') {
                            entity._activeAnimState = 'idle';
                            const iAct = entity._idleAction;
                            if (typeof iAct.stopFading === 'function') iAct.stopFading();
                            iAct.enabled = true;
                            iAct.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
                            if (entity._walkAction && entity._walkAction.isRunning()) {
                                if (typeof entity._walkAction.stopFading === 'function') entity._walkAction.stopFading();
                                entity._walkAction.crossFadeTo(iAct, 0.14, true);
                            }
                        } else if (!wantWalk && !entity._idleAction && entity.templateKey === 'bestiary_wolf' && entity._walkAction) {
                            // Gate wolf locomotive clip when idle so wolves stand still instead of running in place
                            entity._mixer.timeScale = 0.0;
                        }
                    }
                    // # ROOT-CAUSE: Preserve exact P1 distant idle mixer throttle contract while bypassing throttle during active one-shot combat clips.
                    if (entity.visible && entityDistSq < 324) {
                        const isDistantIdle = (!isMoving && entityDistSq > 100);
                        entity._animTick = ((entity._animTick || 0) + 1) & 1;
                        if (!isDistantIdle || inOneShotCombat || entity._animTick === 0) {
                            entity._mixer.update((isDistantIdle && !inOneShotCombat) ? delta * 2.0 : delta);
                            this._stabilizeHeldEquipment(entity);
                        }
                    }
                }
            }

            // Billboard cylindrical Y-facing & volume-conserving breathing
            if (entity.creatureMesh && entity.creatureMesh.isBillboard) {
                const bdx = this.camera.position.x - entity.position.x;
                const bdz = this.camera.position.z - entity.position.z;
                if (bdx * bdx + bdz * bdz > 0.001) {
                    entity.rotation.y = Math.atan2(bdx, bdz);
                }
                if (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.idleBreathing) {
                    const breath = Math.sin(monTime * 1.8 + entity.position.x * 3.7) * 0.018;
                    const bw = entity.creatureMesh.baseWidth || 1.25;
                    const bh = entity.creatureMesh.baseHeight || 1.70;
                    entity.creatureMesh.scale.set(bw * (1.0 - breath * 0.5), bh * (1.0 + breath), 1.0);
                }
            } else if (!isAsleepNow && !isParalyzedNow && entityDistSq <= 400 && !entity._mixer && entity.creatureMesh && (entity.creatureMesh._rigBoneSets || entity.creatureMesh._rigBones)) {
                const boneSets = entity.creatureMesh._rigBoneSets || [entity.creatureMesh._rigBones];
                const isMoving = Boolean(entity.targetPos && entity.position.distanceTo(entity.targetPos) > 0.02);
                const breath = Math.sin(monTime * 1.8 + entity.position.x * 3.1) * 0.035;
                const stride = isMoving ? Math.sin(tNow * 0.014 + entity.position.x) * 0.42 : 0;

                for (const bones of boneSets) {
                    if (!bones) continue;
                    if (bones.spine_01 && bones.spine_01._restQuat) {
                        bones.spine_01.quaternion.copy(bones.spine_01._restQuat);
                        bones.spine_01.rotateX(breath);
                    }
                    if (bones.upperarm_l && bones.upperarm_l._restQuat) {
                        bones.upperarm_l.quaternion.copy(bones.upperarm_l._restQuat);
                        bones.upperarm_l.rotateZ(breath * 0.4);
                        if (isMoving) bones.upperarm_l.rotateX(-stride * 0.55);
                    }
                    if (bones.upperarm_r && bones.upperarm_r._restQuat) {
                        bones.upperarm_r.quaternion.copy(bones.upperarm_r._restQuat);
                        bones.upperarm_r.rotateZ(-breath * 0.4);
                        if (isMoving) bones.upperarm_r.rotateX(stride * 0.55);
                    }

                    if (isMoving) {
                        if (bones.thigh_l && bones.thigh_l._restQuat) {
                            bones.thigh_l.quaternion.copy(bones.thigh_l._restQuat);
                            bones.thigh_l.rotateX(stride);
                        }
                        if (bones.thigh_r && bones.thigh_r._restQuat) {
                            bones.thigh_r.quaternion.copy(bones.thigh_r._restQuat);
                            bones.thigh_r.rotateX(-stride);
                        }
                    } else {
                        if (bones.thigh_l && bones.thigh_l._restQuat) bones.thigh_l.quaternion.copy(bones.thigh_l._restQuat);
                        if (bones.thigh_r && bones.thigh_r._restQuat) bones.thigh_r.quaternion.copy(bones.thigh_r._restQuat);
                    }
                }
            }

            // Zero-GC procedural locomotion for unrigged bestiary models (dragons, hounds, hydras, oozes)
            if (typeof this.updateProceduralLocomotion === 'function') {
                this.updateProceduralLocomotion(entity, delta, monTime);
            }

            // Ethereal pulse & ripple rotation for sensed / invisible foggy aura
            if (entity.foggyAura && entity.foggyAura.visible) {
                const pulse = 0.38 + Math.sin(monTime * 2.2 + entity.position.x) * 0.16;
                if (entity.foggyMaterials) {
                    for (let mIdx = 0; mIdx < entity.foggyMaterials.length; mIdx++) {
                        entity.foggyMaterials[mIdx].opacity = pulse;
                    }
                }
                if (entity.groundRipples) {
                    entity.groundRipples.rotation.z += delta * 0.9;
                    const rScale = 1.0 + Math.sin(monTime * 1.8) * 0.12;
                    entity.groundRipples.scale.set(rScale, rScale, 1.0);
                }
            }
        }

        // Tick Monster Death Choreography & 140ms LOS Perception Fade-Out before scene disposal
        if (this._dyingMonsters && this._dyingMonsters.length > 0) {
            for (let dIdx = this._dyingMonsters.length - 1; dIdx >= 0; dIdx--) {
                const dying = this._dyingMonsters[dIdx];
                dying._deathTimer -= delta;
                if (dying._isPerceptFading) {
                    const pProg = Math.min(1.0, Math.max(0, 1.0 - (dying._deathTimer / 0.14)));
                    const shrink = Math.max(0.05, 1.0 - pProg * 0.28);
                    dying.scale.set(shrink, shrink, shrink);
                    if (this.renderGovernor && dying._deathTimer > 0) this.renderGovernor.wake(160, tNow);
                } else {
                    const dDur = dying._deathDuration || 0.38;
                    const dProg = Math.min(1.0, Math.max(0, 1.0 - (dying._deathTimer / dDur)));
                    if (dying._mixer && dying._deathAction) {
                        dying._mixer.update(delta);
                    } else if (dying.creatureMesh) {
                        dying.creatureMesh.rotation.x = dProg * (Math.PI * 0.42);
                        dying.creatureMesh.position.y = -dProg * 0.18;
                    }
                    const shrink = Math.max(0.05, 1.0 - dProg * 0.65);
                    dying.scale.set(shrink, shrink, shrink);
                }
                if (dying._deathTimer <= 0) {
                    this.destroyEntity(dying);
                    this._dyingMonsters.splice(dIdx, 1);
                }
            }
        }

        // Apply line-of-sight angular de-overlap (14m max distance, suppress only when directly behind a closer creature)
        if (candidateNameplates.length > 0) {
            candidateNameplates.sort((a, b) => a.dist - b.dist);
            if (candidateNameplates.length > 12) {
                for (let k = 12; k < candidateNameplates.length; k++) {
                    candidateNameplates[k].entity.nameplate.visible = false;
                }
                candidateNameplates.length = 12;
            }
            const accepted = this._acceptedNameplates || (this._acceptedNameplates = []);
            accepted.length = 0;
            for (let i = 0; i < candidateNameplates.length; i++) {
                const item = candidateNameplates[i];
                if (item.isTargeted) {
                    item.entity.nameplate.visible = true;
                    if (item.entity.nameplate.material) item.entity.nameplate.material.opacity = 1.0;
                    accepted.push(item);
                    continue;
                }
                let isOccluded = false;
                for (let j = 0; j < accepted.length; j++) {
                    const acc = accepted[j];
                    const diff = Math.abs(Math.atan2(Math.sin(item.angle - acc.angle), Math.cos(item.angle - acc.angle)));
                    if (diff < 0.08 && Math.abs(item.dist - acc.dist) > 1.2) {
                        isOccluded = true;
                        break;
                    }
                }
                if (isOccluded) {
                    item.entity.nameplate.visible = false;
                } else {
                    item.entity.nameplate.visible = true;
                    if (item.entity.nameplate.material) {
                        item.entity.nameplate.material.opacity = item.npOpacity !== undefined ? item.npOpacity : 1.0;
                    }
                    accepted.push(item);
                }
            }
        }

        // Items floor grounding vs magical hover kinematics & contact shadow modulation (P-10)
        for (const entity of this.items.values()) {
            if (!entity.visible) continue;
            if (entity.itemMesh) {
                const seed = entity.seed || 0;
                if (entity.isItemBillboard) {
                    // Cylindrical camera-facing for upright 2.5D billboards (flat items stay flat on floor)
                    if (!entity.isFlat) {
                        const bdx = this.camera.position.x - entity.position.x;
                        const bdz = this.camera.position.z - entity.position.z;
                        if (bdx * bdx + bdz * bdz > 0.001) {
                            entity.rotation.y = Math.atan2(bdx, bdz);
                        }
                    }
                    const hover = Math.sin(tNow * 0.0022 + seed * 0.3) * 0.012;
                    const baseElevation = entity.itemMesh.baseElevation || 0.04;
                    entity.itemMesh.position.y = baseElevation + hover;
                    if (entity.shadowMesh) {
                        const baseFootprint = entity.itemMesh.footprint || 0.35;
                        const sScale = baseFootprint * Math.max(0.70, 1.0 - hover * 6.0);
                        entity.shadowMesh.scale.set(sScale, sScale, sScale);
                    }
                } else {
                    const phKey = entity.phKey || entity.itemMesh.phKey || '';
                    const isMagicalFloating = (phKey === 'ph_crystal' || phKey === 'item_ring' || phKey === 'item_talisman' || phKey === 'item_scroll_enchant');
                    if (isMagicalFloating) {
                        entity.itemMesh.rotation.y += delta * 0.75;
                        const hover = Math.sin(tNow * 0.0025 + seed * 0.2) * 0.022;
                        entity.itemMesh.position.y = 0.08 + hover;
                        if (entity.shadowMesh) {
                            const sScale = Math.max(0.65, 1.0 - hover * 5.0);
                            entity.shadowMesh.scale.set(sScale, sScale, sScale);
                        }
                    } else {
                        // Physical 3D items (chests, boulders, statues, weapons, shields, armor, books, coins, rations) rest grounded on floor
                        entity.itemMesh.position.y = 0.01;
                        entity.itemMesh.rotation.y = (seed % 360) * 0.0174533;
                    }
                }
            }
        }

        // In-view molten lava & sparkling water dual-scrolling surface pulse (single consolidated loop, zero extra light sources)
        const timeSec = tNow * 0.001;
        if (this.lavaMesh && this.lavaMesh.count > 0) {
            const lx = Math.sin(timeSec * 0.35) * 0.08 + (timeSec * 0.018) % 1.0;
            const ly = Math.cos(timeSec * 0.28) * 0.08 + (timeSec * 0.014) % 1.0;
            if (this.lavaTex) this.lavaTex.offset.set(lx, ly);
            if (this.lavaEmission) this.lavaEmission.offset.set(lx, ly);
            if (this.lavaMaterial) {
                if (this.lavaMaterial.normalMap && this.lavaMaterial.normalMap.offset) {
                    this.lavaMaterial.normalMap.offset.set((timeSec * 0.009) % 1.0, (timeSec * 0.006) % 1.0);
                }
                if (this.lavaMaterial.map && this.lavaMaterial.map.offset) {
                    this.lavaMaterial.map.offset.set(1.0 - ((timeSec * 0.005) % 1.0), (timeSec * 0.008) % 1.0);
                }
            }
        }
        if ((this.waterMesh && this.waterMesh.count > 0) || (this.deepWaterMesh && this.deepWaterMesh.count > 0)) {
            if (this.waterTex) this.waterTex.offset.set((timeSec * 0.024) % 1.0, Math.sin(timeSec * 0.8) * 0.03);
            if (this.deepWaterTex) this.deepWaterTex.offset.set((timeSec * 0.014) % 1.0, Math.cos(timeSec * 0.6) * 0.02);
            if (this.waterMaterial) {
                if (this.waterMaterial.map && this.waterMaterial.map.offset) {
                    this.waterMaterial.map.offset.set((timeSec * 0.018) % 1.0, (timeSec * 0.012) % 1.0);
                }
                if (this.waterMaterial.normalMap && this.waterMaterial.normalMap.offset) {
                    this.waterMaterial.normalMap.offset.set(1.0 - ((timeSec * 0.014) % 1.0), (timeSec * 0.021) % 1.0);
                }
            }
        }
        if (this.lavaMaterial && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.surfaceBreathing)) {
            // # ROOT-CAUSE: Animate consecrated altar sacred flames and sparkling fountain water emissive shimmer at 60 FPS with zero extra lights or allocations.
            const time = tNow * 0.001;
            this.lavaMaterial.emissiveIntensity = 0.95 + Math.sin(time * 2.2) * 0.20 + Math.cos(time * 4.7) * 0.08;
            if (this.waterMaterial) {
                this.waterMaterial.emissiveIntensity = 0.22 + Math.sin(time * 2.6) * 0.06;
            }
            if (this.deepWaterMaterial) {
                this.deepWaterMaterial.emissiveIntensity = 0.18 + Math.cos(time * 2.1) * 0.05;
            }
            if (this.altarFlameMaterial) {
                this.altarFlameMaterial.emissiveIntensity = 2.15 + Math.sin(time * 5.2) * 0.35 + Math.cos(time * 11.7) * 0.18;
            }
            if (this.fountainWaterMaterial) {
                this.fountainWaterMaterial.emissiveIntensity = 0.92 + Math.sin(time * 3.8) * 0.22;
            }
        }
        if (window.Dungeon3DAtmosphere && typeof window.Dungeon3DAtmosphere.updateAtmosphere === 'function') {
            window.Dungeon3DAtmosphere.updateAtmosphere(this, tNow * 0.001);
        }

        // High-Quality Celestial Star Canopy & Sky Dome: Lock to camera position (infinite distance illusion, 0 translation parallax)
        if (this.starGroup && this.starGroup.visible) {
            this.starGroup.position.copy(this.camera.position);
            const time = tNow * 0.001;
            if (this.starMaterial && this.starMaterial.uniforms && this.starMaterial.uniforms.uTime) {
                this.starMaterial.uniforms.uTime.value = time;
            }
            if (this.skyDomeMaterial && this.skyDomeMaterial.uniforms) {
                this.skyDomeMaterial.uniforms.uTime.value = time;
                const curRealm = (this.realm || 'angband').toLowerCase();
                if (this._lastSkyDomeRealm !== curRealm) {
                    this._lastSkyDomeRealm = curRealm;
                    const u = this.skyDomeMaterial.uniforms;
                    if (curRealm === 'silq') {
                        u.uHorizonColor.value.setHex(0x152232);
                        u.uZenithColor.value.setHex(0x020610);
                        u.uNebulaColorA.value.setHex(0xcfe4ff);
                        u.uNebulaColorB.value.setHex(0x5099cc);
                        u.uAuroraColor.value.setHex(0x44eeea);
                    } else if (curRealm === 'frogcomposband') {
                        u.uHorizonColor.value.setHex(0x24112e);
                        u.uZenithColor.value.setHex(0x080210);
                        u.uNebulaColorA.value.setHex(0xff44aa);
                        u.uNebulaColorB.value.setHex(0x8833cc);
                        u.uAuroraColor.value.setHex(0x00f0bb);
                    } else if (curRealm === 'hengband') {
                        u.uHorizonColor.value.setHex(0x19182c);
                        u.uZenithColor.value.setHex(0x070612);
                        u.uNebulaColorA.value.setHex(0xffaa33);
                        u.uNebulaColorB.value.setHex(0xcc3344);
                        u.uAuroraColor.value.setHex(0x2de288);
                    } else { // angband & default
                        u.uHorizonColor.value.setHex(0x121b2d);
                        u.uZenithColor.value.setHex(0x03060f);
                        u.uNebulaColorA.value.setHex(0xffd188);
                        u.uNebulaColorB.value.setHex(0x3855a2);
                        u.uAuroraColor.value.setHex(0x1be896);
                    }
                }
            }
        }

        // On-demand shadow update when camera moves or turns
        if (this.camera) {
            const camDist = Math.hypot(
                this.camera.position.x - (this._lastShadowCamX || 0),
                this.camera.position.z - (this._lastShadowCamZ || 0)
            );
            const camYaw = this.camera.rotation ? this.camera.rotation.y : 0;
            const yawDiff = Math.abs(Math.atan2(Math.sin(camYaw - (this._lastShadowCamYaw || 0)), Math.cos(camYaw - (this._lastShadowCamYaw || 0))));
            if (camDist > 0.08 || yawDiff > 0.06) {
                this._lastShadowCamX = this.camera.position.x;
                this._lastShadowCamZ = this.camera.position.z;
                this._lastShadowCamYaw = camYaw;
                this.markShadowsDirty();
            }
        }

        if (!this._contextLost) {
            const nowGov = performance.now();
            const govIsActive = !this.renderGovernor || (nowGov <= (this.renderGovernor.activeUntilMs || 0));
            if (!govIsActive) {
                this._fpsGovFrames = 0;
                this._fpsGovStart = 0;
            } else {
                this._fpsGovFrames = (this._fpsGovFrames || 0) + 1;
                if (!this._fpsGovStart) this._fpsGovStart = nowGov;
                else if (this._fpsGovFrames >= 30) {
                    const avgMs = (nowGov - this._fpsGovStart) / this._fpsGovFrames;
                    this._fpsGovFrames = 0;
                    this._fpsGovStart = nowGov;
                    const isPhoneGov = this.renderBudget && this.renderBudget.tier === 'phone';
                    const budgetCap = (this.renderBudget && this.renderBudget.dprCap)
                        ? this.renderBudget.dprCap
                        : (isPhoneGov ? 1.25 : 1.5);
                    const maxDpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, budgetCap);
                    const minDprFloor = isPhoneGov
                        ? Math.min(maxDpr, 0.75)
                        : Math.min(maxDpr, Math.max(1.0, +(maxDpr * 0.85).toFixed(2)));
                    let targetDpr = this._adaptiveDpr || maxDpr;
                    if (this.renderGovernor && typeof this.renderGovernor.recordFrameTime === 'function') {
                        this.renderGovernor.recordFrameTime(avgMs);
                        targetDpr = Math.max(minDprFloor, this.renderGovernor.getEffectivePixelRatio(budgetCap, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
                    } else if (avgMs > 22.5 && targetDpr > minDprFloor) {
                        targetDpr = Math.max(minDprFloor, +(targetDpr - 0.1).toFixed(2));
                    } else if (avgMs < 15.0 && targetDpr < maxDpr) {
                        targetDpr = Math.min(maxDpr, +(targetDpr + 0.1).toFixed(2));
                    }
                    if (Math.abs((this._adaptiveDpr || maxDpr) - targetDpr) >= 0.05) {
                        this._adaptiveDpr = targetDpr;
                        this.renderer.setPixelRatio(this._adaptiveDpr);
                    }
                }
            }
            if (this.lastFrame) {
                if (typeof this.updateFlankThreatArcs === 'function') this.updateFlankThreatArcs(this.lastFrame);
                if (typeof this.updateTacticalCursor === 'function') this.updateTacticalCursor(this.lastFrame, delta);
            }
            if (this.camera && this.camera.layers) this.camera.layers.set(0);
            this.renderer.autoClear = true;
            this.renderer.render(this.scene, this.camera);
            const rightHasMesh = Boolean(this.rightHandGroup && this.rightHandGroup.visible && this.rightItemSlot && this.rightItemSlot.children.length > 0);
            const leftHasMesh = Boolean(this.leftHandGroup && this.leftHandGroup.visible && this.leftItemSlot && this.leftItemSlot.children.length > 0);
            const vmVisible = Boolean(this.viewmodelGroup && (rightHasMesh || leftHasMesh));
            if (vmVisible && this.camera && this.camera.layers && typeof this.renderer.clearDepth === 'function') {
                const prevBg = this.scene.background;
                const prevAutoUpdate = this.scene.autoUpdate;
                try {
                    // # ROOT-CAUSE: Three.js r128 WebGLBackground forces a full color buffer clear whenever scene.background.isColor === true, even with autoClear=false. Null scene.background during the Layer-1 viewmodel overlay pass so Pass-1 world geometry is preserved.
                    this.scene.background = null;
                    this.scene.autoUpdate = false;
                    this.renderer.autoClear = false;
                    this.renderer.clearDepth();
                    this.camera.layers.set(1);
                    this.renderer.render(this.scene, this.camera);
                } finally {
                    this.scene.background = prevBg;
                    this.scene.autoUpdate = prevAutoUpdate;
                    this.camera.layers.set(0);
                    this.renderer.autoClear = true;
                }
            }
        }
    }

    _getCanvasRect() {
        const el = (this.renderer && this.renderer.domElement) || this.canvas;
        if (!el || typeof el.getBoundingClientRect !== 'function') return null;
        if (!this._cachedCanvasRect || this._cachedCanvasRect.width === 0 || this._cachedCanvasRect.height === 0) {
            this._cachedCanvasRect = el.getBoundingClientRect();
        }
        return this._cachedCanvasRect;
    }

    /**
     * Raycasts mouse/touch screen coordinates against active 3D monsters.
     * Used for click-to-talk interactive creature dialogue in Living Chronicle.
     */
    getMonsterAtScreenCoords(clientX, clientY) {
        if (!this.camera || !this.renderer || !this.monsters || this.monsters.size === 0) return null;
        const rect = this._getCanvasRect();
        if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        if (!this._mouseVec) this._mouseVec = new THREE.Vector2();
        if (!this._raycaster) this._raycaster = new THREE.Raycaster();
        if (!this._tempVec3) this._tempVec3 = new THREE.Vector3();

        this._mouseVec.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        this._raycaster.setFromCamera(this._mouseVec, this.camera);

        // Fast O(N) analytical 3-sphere vertical capsule ray intersection on root entities:
        // Zero CPU SkinnedMesh.raycast() triangle loops (<0.01 ms) and 100% immune to child-mesh .monsterData shadowing!
        let closestMonster = null;
        let minRayDist = Infinity;
        let closestGenerous = null;
        let minGenerousDist = Infinity;
        const ray = this._raycaster.ray;

        for (const entity of this.monsters.values()) {
            if (!entity.visible || !entity.monsterData) continue;
            const mHeight = entity.modelHeight || 1.2;
            this._tempVec3.copy(entity.position);
            this._tempVec3.y += mHeight * 0.82;
            const distTop = ray.distanceToPoint(this._tempVec3);
            this._tempVec3.copy(entity.position);
            this._tempVec3.y += mHeight * 0.45;
            const distMid = ray.distanceToPoint(this._tempVec3);
            this._tempVec3.copy(entity.position);
            this._tempVec3.y += 0.25;
            const distLow = ray.distanceToPoint(this._tempVec3);
            const distToRay = Math.min(distTop, distMid, distLow);
            const tightRadius = Math.max(0.42, Math.min(0.75, mHeight * 0.36));
            const distAlongRay = ray.origin.distanceTo(entity.position);

            if (distToRay <= tightRadius && distAlongRay < minRayDist) {
                minRayDist = distAlongRay;
                const mData = entity.monsterData;
                if (entity.modelGender) mData.modelGender = entity.modelGender;
                if (entity.modelKey) mData.modelKey = entity.modelKey;
                if (entity.isFemale !== undefined) mData.isFemale = entity.isFemale;
                closestMonster = mData;
            } else if (distToRay < 0.78 && distAlongRay < minGenerousDist) {
                minGenerousDist = distAlongRay;
                const mData = entity.monsterData;
                if (entity.modelGender) mData.modelGender = entity.modelGender;
                if (entity.modelKey) mData.modelKey = entity.modelKey;
                if (entity.isFemale !== undefined) mData.isFemale = entity.isFemale;
                closestGenerous = mData;
            }
        }

        return closestMonster || closestGenerous;
    }

    /**
     * Raycasts mouse/touch screen coordinates against active 3D floor items/objects.
     * Used for afar click-to-inspect object examination & Lorekeeper appraisal.
     */
    getItemAtScreenCoords(clientX, clientY) {
        if (!this.camera || !this.renderer || !this.items || this.items.size === 0) return null;
        const rect = this._getCanvasRect();
        if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        if (!this._mouseVec) this._mouseVec = new THREE.Vector2();
        if (!this._raycaster) this._raycaster = new THREE.Raycaster();
        if (!this._tempVec3) this._tempVec3 = new THREE.Vector3();

        this._mouseVec.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        this._raycaster.setFromCamera(this._mouseVec, this.camera);

        // Fast O(N) analytical bounding sphere intersection on root item entities (<0.01 ms, 0 triangle loops)
        let closestItem = null;
        let minRayDist = Infinity;
        const ray = this._raycaster.ray;

        for (const entity of this.items.values()) {
            if (!entity.visible || (!entity.itemData && !entity.itemName)) continue;
            this._tempVec3.copy(entity.position);
            this._tempVec3.y += 0.25; // center of floor item hover/billboard
            const distToRay = ray.distanceToPoint(this._tempVec3);
            if (distToRay < 0.85) { // Within item interaction sphere
                const distAlongRay = ray.origin.distanceTo(this._tempVec3);
                if (distAlongRay < minRayDist) {
                    minRayDist = distAlongRay;
                    closestItem = entity.itemData || { name: entity.itemName, glyph: entity.glyph, attr: entity.attr };
                }
            }
        }

        return closestItem;
    }

    /**
     * Raycasts a 2D screen coordinate (clientX, clientY) against the 3D dungeon floor (Y=0) and walls/doors
     * to return the targeted grid coordinate `{ x, y, kind }`, or `null` if occluded by a wall or out of bounds.
     */
    getTileAtScreenCoords(clientX, clientY) {
        if (!this.camera || !this.canvas || !this.lastFrame || !this.lastFrame.map || !this.lastFrame.player) return null;
        const map = this.lastFrame.map;
        const rows = map.rows;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const mapH = map.h || rows.length;
        const mapW = map.w || (rows[0] && rows[0].g ? rows[0].g.length : 0);

        const rect = this._getCanvasRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        if (!this._mouseVec2) this._mouseVec2 = new THREE.Vector2();
        if (!this._raycaster) this._raycaster = new THREE.Raycaster();

        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
        this._mouseVec2.set(ndcX, ndcY);
        this._raycaster.setFromCamera(this._mouseVec2, this.camera);

        // 1. Direct intersection against visible 3D StreetView floor chevrons
        if (this.streetViewGroup && this.streetViewGroup.visible && this._streetChevrons && this._streetChevrons.length > 0) {
            const visibleChevrons = this._streetChevrons.filter(c => c.visible && c.userData && c.userData.passable);
            if (visibleChevrons.length > 0) {
                const hits = this._raycaster.intersectObjects(visibleChevrons, false);
                if (hits.length > 0 && hits[0].object && hits[0].object.userData) {
                    const ud = hits[0].object.userData;
                    if (ud.tx !== undefined && ud.ty !== undefined) {
                        return { x: ud.tx, y: ud.ty, kind: 'chevron', dx: ud.dx, dy: ud.dy };
                    }
                }
            }
        }

        const ray = this._raycaster.ray;
        const cellSize = this.cellSize || 2.0;
        const wallH = this.wallHeight || 3.0;
        const maxDist = 36 * cellSize;
        const dt = 0.12;
        const px = this.lastFrame.player.x;
        const py = this.lastFrame.player.y;

        let lastCheckedKey = -1;
        let lastOpenTile = null;

        for (let t = 0.25; t <= maxDist; t += dt) {
            const rx = ray.origin.x + ray.direction.x * t;
            const ry = ray.origin.y + ray.direction.y * t;
            const rz = ray.origin.z + ray.direction.z * t;

            // Reached the floor plane (Y = 0) without hitting a solid wall
            if (ry <= 0.02) {
                const tFloor = ray.direction.y < -0.001 ? (-ray.origin.y / ray.direction.y) : t;
                const fx = Math.round((ray.origin.x + ray.direction.x * tFloor) / cellSize);
                const fy = Math.round((ray.origin.z + ray.direction.z * tFloor) / cellSize);
                if (fx < 0 || fx >= mapW || fy < 0 || fy >= mapH) return lastOpenTile;
                return { x: fx, y: fy, kind: 'floor' };
            }

            if (ry <= wallH) {
                const gx = Math.round(rx / cellSize);
                const gy = Math.round(rz / cellSize);
                if (gx < 0 || gx >= mapW || gy < 0 || gy >= mapH) continue;
                if (gx === px && gy === py) {
                    lastOpenTile = { x: px, y: py, kind: 'floor' };
                    continue;
                }

                const row = rows[gy];
                if (!row) continue;
                const glyph = (row.g && gx < row.g.length) ? row.g[gx] : ' ';
                const fIdx = gx * 2;
                const feat = (row.f && fIdx + 1 < row.f.length)
                    ? (parseInt(row.f.substring(fIdx, fIdx + 2), 16) || 0)
                    : 0;

                // Closed doors or Town store/building portals are valid click-to-move targets
                const isClosedDoor = feat === 2 || glyph === '+';
                const isStoreEntrance = (feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40);
                if (isClosedDoor || isStoreEntrance) {
                    return { x: gx, y: gy, kind: 'door' };
                }

                // Solid walls occlude the ray (chamfer-aware 0.44 * cellSize footprint)
                const isSolidWall = feat === 0 || (feat >= 15 && feat <= 22) || feat === 30 ||
                    (feat === 25 && glyph !== '.' && glyph !== ',' && glyph !== '\'') ||
                    glyph === '#' || glyph === '%' || glyph === '*';
                if (isSolidWall) {
                    const localX = Math.abs(rx - gx * cellSize);
                    const localZ = Math.abs(rz - gy * cellSize);
                    if (localX > 0.44 * cellSize || localZ > 0.44 * cellSize) {
                        continue;
                    }
                    if (lastOpenTile && (lastOpenTile.x !== px || lastOpenTile.y !== py)) {
                        return lastOpenTile;
                    }
                    return null;
                }

                const cellKey = gy * mapW + gx;
                if (cellKey !== lastCheckedKey) {
                    lastCheckedKey = cellKey;
                    lastOpenTile = { x: gx, y: gy, kind: 'floor' };
                }
            }
        }

        return lastOpenTile;
    }

    static prefetchRealmTextureHttp(realmKey) {
        if (typeof fetch !== 'function') return;
        const r = String(realmKey || 'angband').toLowerCase();
        const isTownStart = r === 'angband' || r === 'frogcomposband' || r === 'hengband' || r === 'ryod';
        const resolver = (typeof window !== 'undefined' && window.Dungeon3DProcTextures && typeof window.Dungeon3DProcTextures.resolveContextualPbrIds === 'function')
            ? window.Dungeon3DProcTextures.resolveContextualPbrIds
            : null;
        const ids = new Set();
        if (resolver) {
            const res = resolver(r, isTownStart ? 0 : 1, isTownStart, '', '', { hasShops: isTownStart, tier1Only: true });
            if (res.wallPhId) ids.add(res.wallPhId);
            if (res.floorPhId) ids.add(res.floorPhId);
        } else {
            ['plastered_stone_wall', 'cobblestone_floor_08', 'japanese_stone_wall', 'monastery_stone_floor'].forEach((id) => ids.add(id));
        }
        if (!Dungeon3D._httpPrefetchedIds) Dungeon3D._httpPrefetchedIds = new Set();
        for (const id of ids) {
            if (!id || id.startsWith('local_') || Dungeon3D._httpPrefetchedIds.has(id)) continue;
            Dungeon3D._httpPrefetchedIds.add(id);
            const base = `/assets/polyhaven/textures/${id}`;
            for (const file of ['diff.jpg', 'nor_gl.jpg']) {
                try {
                    const rawUrl = `${base}/${file}`;
                    const resolvedUrl = (typeof window !== 'undefined' && typeof window.__assetUrl === 'function') ? window.__assetUrl(rawUrl) : rawUrl;
                    fetch(resolvedUrl, { priority: 'low', credentials: 'same-origin' }).catch(() => null);
                } catch (_) {}
            }
        }
    }

}

window.Dungeon3D = Dungeon3D;
if (window.Dungeon3DProcTextures && typeof window.Dungeon3DProcTextures.attach === 'function') {
    window.Dungeon3DProcTextures.attach(Dungeon3D);
}
if (window.Dungeon3DEnvironment && typeof window.Dungeon3DEnvironment.attach === 'function') {
    window.Dungeon3DEnvironment.attach(Dungeon3D);
} else if (typeof require === 'function') {
    try { require('./dungeon3d-environment.js').attach(Dungeon3D); } catch (_) {}
}
if (window.Dungeon3DVfx && typeof window.Dungeon3DVfx.attach === 'function') {
    window.Dungeon3DVfx.attach(Dungeon3D);
} else if (typeof require === 'function') {
    try { require('./dungeon3d-vfx.js').attach(Dungeon3D); } catch (_) {}
}
if (window.Dungeon3DTactical && typeof window.Dungeon3DTactical.attach === 'function') {
    window.Dungeon3DTactical.attach(Dungeon3D);
} else if (typeof require === 'function') {
    try { require('./dungeon3d-tactical.js').attach(Dungeon3D); } catch (_) {}
}


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
    itemRenderer: 'billboard', // 'billboard' (Canonical Shockbolt illustrated pickups with normal mapping) | 'classic' (3D models)
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
    window.GRAPHICS_CONFIG.itemRenderer = isEnhanced ? 'billboard' : 'classic';
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

function getAngbandHex(attr) {
    const idx = (attr !== undefined && attr >= 0 && attr < ANGBAND_COLORS.length) ? attr : 1;
    return ANGBAND_COLORS[idx];
}

function getAngbandColorString(attr) {
    const hex = getAngbandHex(attr).toString(16).padStart(6, '0');
    return '#' + hex;
}
window.getAngbandColorString = getAngbandColorString;

// ==============================================================================
// 2. Procedural Texture Engine (Exact Mathematical Parity with Godot C# DungeonWorld.cs)
// ==============================================================================

function procHash(x, y, seed = 0) {
    let n = (x + y * 57 + seed * 131) | 0;
    n = ((n << 13) ^ n) | 0;
    const inner = (Math.imul(Math.imul(n, n), 15731) + 789221) | 0;
    const val = (Math.imul(n, inner) + 1376312589) & 0x7fffffff;
    return (1.0 - val / 1073741824.0) * 0.5 + 0.5;
}

function procSmoothNoise(x, y, seed = 0) {
    const x0 = Math.floor(x) | 0;
    const y0 = Math.floor(y) | 0;
    const x1 = (x0 + 1) | 0;
    const y1 = (y0 + 1) | 0;
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3.0 - 2.0 * fx);
    const sy = fy * fy * (3.0 - 2.0 * fy);
    const n00 = procHash(x0, y0, seed);
    const n10 = procHash(x1, y0, seed);
    const n01 = procHash(x0, y1, seed);
    const n11 = procHash(x1, y1, seed);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
}

function procFractalNoise(x, y, octaves = 3, seed = 0) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let maxVal = 0;
    for (let i = 0; i < octaves; i++) {
        value += procSmoothNoise(x * frequency, y * frequency, seed + i * 37) * amplitude;
        maxVal += amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value / maxVal;
}

function procCreateTexture(size, pixelFunc, isColor = false) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    let idx = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const col = pixelFunc(x, y);
            data[idx++] = Math.min(255, Math.max(0, (col[0] * 255 + 0.5) | 0));
            data[idx++] = Math.min(255, Math.max(0, (col[1] * 255 + 0.5) | 0));
            data[idx++] = Math.min(255, Math.max(0, (col[2] * 255 + 0.5) | 0));
            data[idx++] = Math.min(255, Math.max(0, (col[3] !== undefined ? col[3] * 255 + 0.5 : 255) | 0));
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (isColor) tex.encoding = THREE.sRGBEncoding;
    return tex;
}

const DIGIT_PATTERNS = [
    // 1
    [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    // 2
    [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
    // 3
    [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
    // 4
    [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
    // 5
    [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
    // 6
    [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
    // 7
    [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b01000],
    // 8
    [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110]
];

function procStoreColor(shopNum) {
    switch (shopNum) {
        case 1: return [1.0, 0.88, 0.35]; // General Store: Warm Gold
        case 2: return [0.70, 0.90, 1.0];  // Armoury: Steel Cyan
        case 3: return [1.0, 0.60, 0.35];  // Weaponsmith: Fiery Orange
        case 4: return [0.55, 0.95, 0.65]; // Bookseller: Jade Green
        case 5: return [0.40, 1.0, 0.85];  // Alchemy: Mystic Emerald
        case 6: return [0.85, 0.65, 1.0];  // Magic: Arcane Violet
        case 7: return [1.0, 0.45, 0.65];  // Black Market: Crimson Rose
        case 8: return [1.0, 0.95, 0.70];  // Home: Cozy Amber
        default: return [1.0, 0.90, 0.50];
    }
}

function getStoreColorHex(shopNum) {
    const rgb = procStoreColor(shopNum);
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    return `rgb(${r},${g},${b})`;
}

// ==============================================================================
// 2b. Contextual Lore, Location & Realm Themes Catalog
// ==============================================================================
const CONTEXTUAL_THEMES = {
    // 1. Vanilla Angband / Bree Market Town
    'angband_town': {
        id: 'angband_town',
        name: 'Bree Market Town (Cobblestones & Medieval Fieldstone)',
        courses: 4,
        wallRoughness: 0.82,
        floorRoughness: 0.84,
        wallBase: [0.65, 0.60, 0.54],
        wallMortar: [0.18, 0.16, 0.14],
        floorBase: [0.55, 0.52, 0.48],
        floorMortar: [0.15, 0.14, 0.12],
        pbrWall: true,
        pbrFloor: true
    },
    // 2. Vanilla Chapter 1: Upper Crypts (Levels 1–4 / 50–200 ft)
    'angband_crypts': {
        id: 'angband_crypts',
        name: 'Upper Crypts (Ashlar Slate & Cold Barrow Granite)',
        courses: 4,
        wallRoughness: 0.82,
        floorRoughness: 0.80,
        wallBase: [0.42, 0.43, 0.46],
        wallMortar: [0.08, 0.08, 0.10],
        floorBase: [0.38, 0.39, 0.42],
        floorMortar: [0.06, 0.06, 0.08],
        grainScale: 1.0,
        chisel: 0.06
    },
    // 3. Vanilla Chapter 2: Flooded Undercrofts (Levels 5–8 / 250–400 ft)
    'angband_flooded': {
        id: 'angband_flooded',
        name: 'Flooded Undercrofts (Wet Slate & Sunken Cistern Pools)',
        courses: 4,
        wallRoughness: 0.70,
        floorRoughness: 0.38,
        wallBase: [0.32, 0.38, 0.42],
        wallMortar: [0.06, 0.10, 0.09],
        floorBase: [0.26, 0.32, 0.38],
        floorMortar: [0.04, 0.06, 0.08],
        algaeBleed: true,
        waterPuddles: true,
        grainScale: 0.9,
        chisel: 0.04
    },
    // 4. Vanilla Chapter 3: Deep Sepulchre (Levels 9–12 / 450–600 ft)
    'angband_sepulchre': {
        id: 'angband_sepulchre',
        name: 'Deep Sepulchre (Ancient Sandstone Necropolis & Saltpeter)',
        courses: 4,
        wallRoughness: 0.88,
        floorRoughness: 0.86,
        wallBase: [0.55, 0.46, 0.36],
        wallMortar: [0.26, 0.20, 0.15],
        floorBase: [0.48, 0.40, 0.30],
        floorMortar: [0.20, 0.16, 0.12],
        saltpeterBloom: true,
        grainScale: 1.2,
        chisel: 0.08
    },
    // 5. Vanilla Chapter 4: Overgrown Catacombs (Levels 13–16 / 650–800 ft)
    'angband_catacombs': {
        id: 'angband_catacombs',
        name: 'Overgrown Catacombs (Verdant Lichen & Spore Barrow)',
        courses: 4,
        wallRoughness: 0.78,
        floorRoughness: 0.60,
        wallBase: [0.34, 0.44, 0.32],
        wallMortar: [0.08, 0.16, 0.08],
        floorBase: [0.30, 0.40, 0.28],
        floorMortar: [0.06, 0.12, 0.06],
        lichenPatches: true,
        grainScale: 1.1,
        chisel: 0.05
    },
    // 6. Vanilla Chapter 5: Chasm Threshold (Levels 17–20 / 850–1000 ft)
    'angband_chasm': {
        id: 'angband_chasm',
        name: 'Chasm Threshold (Ironstone Deeps & Rust-Veined Quarry)',
        courses: 4,
        wallRoughness: 0.82,
        floorRoughness: 0.78,
        wallBase: [0.46, 0.40, 0.42],
        wallMortar: [0.16, 0.10, 0.12],
        floorBase: [0.38, 0.34, 0.36],
        floorMortar: [0.12, 0.08, 0.10],
        hematiteVeins: true,
        grainScale: 1.4,
        chisel: 0.10
    },
    // 7. Vanilla Chapter 6: Crystal Caverns (Levels 21–35 / 1050–1750 ft)
    'angband_crystal': {
        id: 'angband_crystal',
        name: 'Crystal Caverns (Luminous Quartz & Amethyst Geodes)',
        courses: 4,
        wallRoughness: 0.68,
        floorRoughness: 0.48,
        wallBase: [0.44, 0.48, 0.58],
        wallMortar: [0.14, 0.16, 0.24],
        floorBase: [0.40, 0.44, 0.54],
        floorMortar: [0.12, 0.14, 0.20],
        crystalVeins: true,
        grainScale: 0.8,
        chisel: 0.04
    },
    // 8. Vanilla Chapter 7: Deep Nether Mines (Levels 36–60 / 1800–3000 ft)
    'angband_nether': {
        id: 'angband_nether',
        name: 'Deep Nether Mines (Pyrite Seams & Brimstone Vaults)',
        courses: 4,
        wallRoughness: 0.74,
        floorRoughness: 0.60,
        wallBase: [0.36, 0.34, 0.32],
        wallMortar: [0.12, 0.11, 0.08],
        floorBase: [0.32, 0.30, 0.28],
        floorMortar: [0.10, 0.09, 0.07],
        pyriteSulfur: true,
        grainScale: 1.3,
        chisel: 0.08
    },
    // 9. Vanilla Chapter 8: Magma Underworld (Levels 61–85 / 3050–4250 ft)
    'angband_magma': {
        id: 'angband_magma',
        name: 'Magma Underworld (Scorched Basalt & Thermal Fissures)',
        courses: 4,
        wallRoughness: 0.78,
        floorRoughness: 0.65,
        wallBase: [0.26, 0.20, 0.18],
        wallMortar: [0.14, 0.05, 0.03],
        floorBase: [0.24, 0.18, 0.16],
        floorMortar: [0.16, 0.06, 0.03],
        thermalCracks: true,
        grainScale: 1.2,
        chisel: 0.08
    },
    // 10. Vanilla Chapter 9: The Abyssal Citadel (Levels 86–100 / 4300–5000 ft)
    'angband_abyss': {
        id: 'angband_abyss',
        name: 'The Abyssal Citadel (Monolithic Black Obsidian & Blood-Iron)',
        courses: 2,
        wallRoughness: 0.65,
        floorRoughness: 0.30,
        wallBase: [0.18, 0.14, 0.22],
        wallMortar: [0.06, 0.02, 0.08],
        floorBase: [0.14, 0.11, 0.17],
        floorMortar: [0.04, 0.01, 0.06],
        abyssalRunes: true,
        grainScale: 0.7,
        chisel: 0.03
    },
    // 11. Sil-Q Iron Pits of Angband (Gates of Slag & Upper Deeps, 50–250 ft)
    'silq_slag': {
        id: 'silq_slag',
        name: 'The Gates of Slag & Iron Pits of Angband',
        courses: 4,
        wallRoughness: 0.85,
        floorRoughness: 0.88,
        wallBase: [0.30, 0.30, 0.32],
        wallMortar: [0.08, 0.08, 0.09],
        floorBase: [0.26, 0.26, 0.28],
        floorMortar: [0.06, 0.06, 0.07],
        ironStrips: true,
        grainScale: 1.3,
        chisel: 0.09
    },
    // 12. Sil-Q Morgoth's Armouries (300–500 ft)
    'silq_armouries': {
        id: 'silq_armouries',
        name: "Morgoth's Armouries (Dark Foundries & Forge Deeps)",
        courses: 4,
        wallRoughness: 0.82,
        floorRoughness: 0.84,
        wallBase: [0.34, 0.28, 0.26],
        wallMortar: [0.10, 0.08, 0.07],
        floorBase: [0.28, 0.24, 0.22],
        floorMortar: [0.08, 0.06, 0.05],
        slagDrips: true,
        grainScale: 1.2,
        chisel: 0.07
    },
    // 13. Sil-Q Deep Torment (550–750 ft)
    'silq_torment': {
        id: 'silq_torment',
        name: 'Deep Torment (Barrows of Thangorodrim & Balrog Halls)',
        courses: 4,
        wallRoughness: 0.80,
        floorRoughness: 0.78,
        wallBase: [0.26, 0.24, 0.28],
        wallMortar: [0.08, 0.06, 0.09],
        floorBase: [0.22, 0.20, 0.24],
        floorMortar: [0.06, 0.05, 0.07],
        charMarks: true,
        grainScale: 1.1,
        chisel: 0.07
    },
    // 14. Sil-Q Citadel of the Iron Crown & Throne of Morgoth (800–1000 ft / Level 20)
    'silq_throne': {
        id: 'silq_throne',
        name: 'Citadel of the Iron Crown (Throne of Morgoth)',
        courses: 2,
        wallRoughness: 0.60,
        floorRoughness: 0.24,
        wallBase: [0.16, 0.15, 0.18],
        wallMortar: [0.05, 0.04, 0.06],
        floorBase: [0.12, 0.11, 0.14],
        floorMortar: [0.03, 0.03, 0.04],
        ironInlay: true,
        grainScale: 0.6,
        chisel: 0.02
    },
    // 15. Hengband Eastern Overworld / Castle Town (Depth 0)
    'hengband_town': {
        id: 'hengband_town',
        name: 'Eastern Overworld (Japanese Shikkui Plaster & Hinoki Cedar)',
        courses: 4,
        wallRoughness: 0.80,
        floorRoughness: 0.82,
        wallBase: [0.82, 0.80, 0.78],
        wallMortar: [0.22, 0.16, 0.12],
        floorBase: [0.55, 0.53, 0.50],
        floorMortar: [0.18, 0.16, 0.14],
        japaneseTimberPlaster: true,
        grainScale: 0.9,
        chisel: 0.04
    },
    // 16. Hengband Dungeons (Fuji Caverns & Pagoda Crypts)
    'hengband_dungeon': {
        id: 'hengband_dungeon',
        name: 'Eastern Pagoda Crypts & Fuji Basalt Caverns',
        courses: 3,
        wallRoughness: 0.78,
        floorRoughness: 0.76,
        wallBase: [0.42, 0.40, 0.42],
        wallMortar: [0.12, 0.10, 0.10],
        floorBase: [0.38, 0.36, 0.38],
        floorMortar: [0.10, 0.08, 0.08],
        ishigakiStyle: true,
        grainScale: 1.1,
        chisel: 0.07
    },
    // 17. FrogComposBand Wilderness Town & High Fantasy Dungeons
    'frog_town': {
        id: 'frog_town',
        name: 'Highland Frontier Town (Rustic Fieldstone & Cobblestone)',
        courses: 4,
        wallRoughness: 0.82,
        floorRoughness: 0.84,
        wallBase: [0.70, 0.66, 0.60],
        wallMortar: [0.22, 0.18, 0.14],
        floorBase: [0.58, 0.56, 0.52],
        floorMortar: [0.18, 0.16, 0.12],
        pbrWall: true,
        pbrFloor: true
    }
};

function resolveContextualTheme(realm, depth, levelSeed = 0) {
    const r = (realm || 'angband').toLowerCase();
    if (depth <= 0) {
        if (r === 'silq') return CONTEXTUAL_THEMES['silq_slag'];
        if (r === 'hengband') return CONTEXTUAL_THEMES['hengband_town'];
        if (r === 'frogcomposband') return CONTEXTUAL_THEMES['frog_town'];
        return CONTEXTUAL_THEMES['angband_town'];
    }

    if (r === 'silq') {
        if (depth <= 5) return CONTEXTUAL_THEMES['silq_slag'];
        if (depth <= 10) return CONTEXTUAL_THEMES['silq_armouries'];
        if (depth <= 15) return CONTEXTUAL_THEMES['silq_torment'];
        return CONTEXTUAL_THEMES['silq_throne'];
    }

    if (r === 'hengband') {
        if (depth <= 8) return CONTEXTUAL_THEMES['hengband_dungeon'];
        if (depth <= 20) return CONTEXTUAL_THEMES['angband_chasm'];
        if (depth <= 40) return CONTEXTUAL_THEMES['angband_crystal'];
        if (depth <= 70) return CONTEXTUAL_THEMES['angband_magma'];
        return CONTEXTUAL_THEMES['angband_abyss'];
    }

    // Default: Vanilla Angband & FrogComposBand
    if (depth <= 4) return CONTEXTUAL_THEMES['angband_crypts'];
    if (depth <= 8) return CONTEXTUAL_THEMES['angband_flooded'];
    if (depth <= 12) return CONTEXTUAL_THEMES['angband_sepulchre'];
    if (depth <= 16) return CONTEXTUAL_THEMES['angband_catacombs'];
    if (depth <= 20) return CONTEXTUAL_THEMES['angband_chasm'];
    if (depth <= 35) return CONTEXTUAL_THEMES['angband_crystal'];
    if (depth <= 60) return CONTEXTUAL_THEMES['angband_nether'];
    if (depth <= 85) return CONTEXTUAL_THEMES['angband_magma'];
    return CONTEXTUAL_THEMES['angband_abyss'];
}

function procCreateContextualWallTexture(theme, size = 512) {
    const courses = theme.courses || 4;
    const rowHeight = Math.floor(size / courses);
    const blockWidth = rowHeight * 2;
    const halfWidth = rowHeight;
    const wallBase = theme.wallBase || [0.42, 0.43, 0.46];
    const wallMortar = theme.wallMortar || [0.08, 0.08, 0.10];
    const gScale = theme.grainScale || 1.0;
    const chiselScale = theme.chisel || 0.06;

    return procCreateTexture(size, (x, y) => {
        const row = Math.floor(y / rowHeight);
        const yInRow = y % rowHeight;
        const distY = Math.min(yInRow, rowHeight - 1 - yInRow);
        const xOff = (row % 2 === 1) ? halfWidth : 0;
        let inBlockX = (x + size - xOff) % blockWidth;
        let distX = Math.min(inBlockX, blockWidth - 1 - inBlockX);

        if (theme.ishigakiStyle) {
            const skew = (yInRow - rowHeight * 0.5) * 0.22;
            const skewedX = (inBlockX + skew + blockWidth) % blockWidth;
            distX = Math.min(skewedX, blockWidth - 1 - skewedX);
        }

        const mortarDist = Math.min(distX, distY);

        if (mortarDist <= 4) {
            if (theme.thermalCracks && mortarDist <= 2) {
                const fissureNoise = procSmoothNoise(x * 0.05, y * 0.05, 99);
                if (fissureNoise > 0.58) {
                    return [0.96, 0.42, 0.08];
                }
            }
            const mn = (procSmoothNoise(x * 0.25, y * 0.25, 101) - 0.5) * 0.04;
            return [
                Math.max(0, wallMortar[0] + mn),
                Math.max(0, wallMortar[1] + mn),
                Math.max(0, wallMortar[2] + mn)
            ];
        }

        if (theme.japaneseTimberPlaster) {
            // Authentic Japanese Machiya Post-and-Beam: continuous vertical Hinoki cedar pillars & horizontal lintels
            const pillarSpacing = Math.floor(size / 4); // 4 columns across 512px
            const distToPillar = Math.min(x % pillarSpacing, pillarSpacing - (x % pillarSpacing));
            const beamSpacing = Math.floor(size / 2); // 2 course tiers
            const distToBeam = Math.min(y % beamSpacing, beamSpacing - (y % beamSpacing));
            const isWood = (distToPillar <= 14) || (distToBeam <= 14);

            if (isWood) {
                // Hinoki / Sugi Cedar wood texture with authentic directional grain
                const grain = (procSmoothNoise(x * 0.08, y * 0.40, 31) - 0.5) * 0.07;
                return [
                    Math.max(0, Math.min(1, 0.26 + grain)),
                    Math.max(0, Math.min(1, 0.17 + grain * 0.8)),
                    Math.max(0, Math.min(1, 0.11 + grain * 0.6))
                ];
            }
            // Traditional Japanese white Shikkui lime plaster with subtle wabi-sabi mineral flecks
            const plasterGrain = (procSmoothNoise(x * 0.12, y * 0.12, 19) - 0.5) * 0.03;
            const plasterWabi = (procSmoothNoise(x * 0.02, y * 0.02, 53) - 0.5) * 0.04;
            return [
                Math.max(0, Math.min(1, 0.90 + plasterGrain + plasterWabi)),
                Math.max(0, Math.min(1, 0.88 + plasterGrain + plasterWabi)),
                Math.max(0, Math.min(1, 0.83 + plasterGrain + plasterWabi))
            ];
        }

        const blockId = row * 4 + Math.floor((x + size - xOff) / blockWidth);
        const blockHue = procHash(blockId, 0, 77);

        let rBase = wallBase[0] + (blockHue - 0.5) * 0.10;
        let gBase = wallBase[1] + (blockHue - 0.5) * 0.09;
        let bBase = wallBase[2] + (0.5 - blockHue) * 0.09;

        const bevel = Math.min(1.0, (mortarDist - 4) / 18.0);
        const macroGrain = (procFractalNoise(x * 0.04 * gScale, y * 0.04 * gScale, 3, 11) - 0.5) * 0.14;
        const microGrain = (procSmoothNoise(x * 0.16 * gScale, y * 0.16 * gScale, 2) - 0.5) * 0.07;
        const chisel = (procSmoothNoise(x * 0.28, y * 0.07, 14) - 0.5) * chiselScale;
        const speckle = procHash(x, y, 42);
        const fleck = speckle > 0.96 ? 0.16 : (speckle < 0.04 ? -0.16 : 0.0);

        const shade = 0.72 + bevel * 0.28;
        let r = rBase * shade + macroGrain + microGrain + chisel + fleck;
        let g = gBase * shade + macroGrain + microGrain + chisel + fleck;
        let b = bBase * shade + macroGrain + microGrain + chisel + fleck;

        if (theme.algaeBleed) {
            const algae = Math.max(0, procSmoothNoise(x * 0.06, y * 0.02, 88) - 0.44) * (y / size) * 0.45;
            g += algae * 0.38;
            r -= algae * 0.15;
            b -= algae * 0.10;
        }

        if (theme.saltpeterBloom) {
            const sp = Math.max(0, procSmoothNoise(x * 0.05, y * 0.05, 44) - 0.62) * 0.40;
            r += sp * 0.45;
            g += sp * 0.42;
            b += sp * 0.38;
        }

        if (theme.lichenPatches) {
            const lic = Math.max(0, procFractalNoise(x * 0.05, y * 0.05, 3, 55) - 0.48) * 0.45;
            g += lic * 0.48;
            r += lic * 0.12;
            b += lic * 0.08;
        }

        if (theme.hematiteVeins) {
            const hem = Math.max(0, procSmoothNoise(x * 0.03, y * 0.12, 63) - 0.55) * 0.40;
            r += hem * 0.40;
            g -= hem * 0.10;
            b -= hem * 0.12;
        }

        if (theme.crystalVeins) {
            const dist = Math.abs(x - y * 0.75 + Math.sin(y * 0.05) * 18 - 180);
            if (dist < 12) {
                const cv = (1.0 - dist / 12.0) * 0.42;
                b += cv * 0.48;
                r += cv * 0.30;
                g += cv * 0.25;
            }
        }

        if (theme.pyriteSulfur) {
            if (procHash(x, y, 77) > 0.97) {
                r += 0.44;
                g += 0.38;
                b += 0.05;
            } else {
                const sulf = Math.max(0, procSmoothNoise(x * 0.08, y * 0.08, 33) - 0.68) * 0.32;
                r += sulf * 0.32;
                g += sulf * 0.30;
                b += sulf * 0.05;
            }
        }

        if (theme.abyssalRunes) {
            const distR = Math.abs(y - x * 0.65 + Math.cos(x * 0.04) * 25 - 240);
            if (distR < 8) {
                const ar = (1.0 - distR / 8.0) * 0.55;
                r += ar * 0.58;
                b += ar * 0.48;
            }
        }

        if (theme.charMarks || theme.slagDrips) {
            const slag = Math.max(0, procSmoothNoise(x * 0.05, y * 0.02, 19) - 0.50) * 0.35;
            r -= slag * 0.25;
            g -= slag * 0.25;
            b -= slag * 0.25;
        }

        return [
            Math.max(0, Math.min(1, r)),
            Math.max(0, Math.min(1, g)),
            Math.max(0, Math.min(1, b))
        ];
    }, true);
}

function procCreateContextualWallNormal(theme, size = 512) {
    const courses = theme.courses || 4;
    const rowHeight = Math.floor(size / courses);
    const blockWidth = rowHeight * 2;
    const halfWidth = rowHeight;
    const gScale = theme.grainScale || 1.0;

    return procCreateTexture(size, (x, y) => {
        const row = Math.floor(y / rowHeight);
        const yInRow = y % rowHeight;
        const distY = Math.min(yInRow, rowHeight - 1 - yInRow);
        const xOff = (row % 2 === 1) ? halfWidth : 0;
        let inBlockX = (x + size - xOff) % blockWidth;
        let distX = Math.min(inBlockX, blockWidth - 1 - inBlockX);

        if (theme.ishigakiStyle) {
            const skew = (yInRow - rowHeight * 0.5) * 0.22;
            const skewedX = (inBlockX + skew + blockWidth) % blockWidth;
            distX = Math.min(skewedX, blockWidth - 1 - skewedX);
        }

        if (theme.japaneseTimberPlaster) {
            const pillarSpacing = Math.floor(size / 4);
            const distToPillar = Math.min(x % pillarSpacing, pillarSpacing - (x % pillarSpacing));
            const beamSpacing = Math.floor(size / 2);
            const distToBeam = Math.min(y % beamSpacing, beamSpacing - (y % beamSpacing));
            const isWood = (distToPillar <= 14) || (distToBeam <= 14);
            if (isWood) {
                const wg = (procSmoothNoise(x * 0.08, y * 0.40, 31) - 0.5) * 0.15;
                const len = Math.hypot(wg, -wg, 1.0);
                return [wg / len * 0.5 + 0.5, -wg / len * 0.5 + 0.5, 1.0 / len * 0.5 + 0.5];
            }
            const pgX = (procSmoothNoise(x * 0.12, y * 0.12, 19) - 0.5) * 0.08;
            const pgY = (procSmoothNoise(x * 0.12, y * 0.12, 20) - 0.5) * 0.08;
            const len = Math.hypot(pgX, pgY, 1.0);
            return [pgX / len * 0.5 + 0.5, pgY / len * 0.5 + 0.5, 1.0 / len * 0.5 + 0.5];
        }

        const mortarDist = Math.min(distX, distY);
        if (mortarDist <= 4) return [0.5, 0.5, 1.0];

        let dx = 0, dy = 0;
        const bevelWidth = 18;
        if (mortarDist < 4 + bevelWidth) {
            const t = (mortarDist - 4) / bevelWidth;
            if (distX < distY) {
                dx = (inBlockX < halfWidth) ? (1.0 - t) : -(1.0 - t);
            } else {
                dy = (yInRow < rowHeight / 2) ? (1.0 - t) : -(1.0 - t);
            }
        }

        const rockBump = (procFractalNoise(x * 0.05 * gScale, y * 0.05 * gScale, 3, 50) - 0.5) * 0.22;
        const chiselBump = (procSmoothNoise(x * 0.28, y * 0.07, 51) - 0.5) * (theme.chisel || 0.06) * 2.0;

        let extraBump = 0;
        if (theme.crystalVeins) {
            const dist = Math.abs(x - y * 0.75 + Math.sin(y * 0.05) * 18 - 180);
            if (dist < 12) extraBump += (1.0 - dist / 12.0) * 0.20;
        }

        const nx = dx * 0.65 + rockBump + chiselBump + extraBump;
        const ny = -(dy * 0.65 + rockBump + chiselBump + extraBump);
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    }, false);
}

function procCreateContextualWallRoughness(theme, size = 512) {
    const baseR = theme.wallRoughness || 0.82;
    return procCreateTexture(size, (x, y) => {
        const grain = (procSmoothNoise(x * 0.08, y * 0.08, 11) - 0.5) * 0.08;
        let r = baseR + grain;

        if (theme.algaeBleed) {
            const algae = Math.max(0, procSmoothNoise(x * 0.06, y * 0.02, 88) - 0.44) * (y / size);
            r -= algae * 0.28;
        }
        if (theme.abyssalRunes) {
            r = Math.min(r, 0.42);
        }
        if (theme.saltpeterBloom) {
            r = Math.min(0.98, r + 0.12);
        }

        const cr = Math.max(0.05, Math.min(0.98, r));
        return [cr, cr, cr];
    }, false);
}

function procCreateContextualFloorTexture(theme, size = 512) {
    const tileSize = 256;
    const floorBase = theme.floorBase || [0.38, 0.39, 0.42];
    const floorMortar = theme.floorMortar || [0.06, 0.06, 0.08];
    const gScale = theme.grainScale || 1.0;

    return procCreateTexture(size, (x, y) => {
        const inTileX = x % tileSize;
        const inTileY = y % tileSize;
        const distX = Math.min(inTileX, tileSize - 1 - inTileX);
        const distY = Math.min(inTileY, tileSize - 1 - inTileY);
        const mortarDist = Math.min(distX, distY);

        if (mortarDist <= 4) {
            if (theme.thermalCracks && mortarDist <= 2) {
                if (procSmoothNoise(x * 0.06, y * 0.06, 115) > 0.56) {
                    return [0.98, 0.44, 0.09];
                }
            }
            const mn = (procSmoothNoise(x * 0.25, y * 0.25, 202) - 0.5) * 0.04;
            return [
                Math.max(0, floorMortar[0] + mn),
                Math.max(0, floorMortar[1] + mn),
                Math.max(0, floorMortar[2] + mn)
            ];
        }

        const tileId = Math.floor(y / tileSize) * 2 + Math.floor(x / tileSize);
        const tileHue = procHash(tileId, 0, 99);

        let rBase = floorBase[0] + (tileHue - 0.5) * 0.08;
        let gBase = floorBase[1] + (tileHue - 0.5) * 0.07;
        let bBase = floorBase[2] + (0.5 - tileHue) * 0.07;

        const bevel = Math.min(1.0, (mortarDist - 4) / 16.0);
        const centerDist = Math.hypot(inTileX - tileSize / 2, inTileY - tileSize / 2) / (tileSize * 0.707);
        const wear = 0.88 + Math.min(1.0, centerDist) * 0.12;

        const grain = (procFractalNoise(x * 0.05 * gScale, y * 0.05 * gScale, 3, 3) - 0.5) * 0.12;
        const microGrain = (procSmoothNoise(x * 0.18 * gScale, y * 0.18 * gScale, 4) - 0.5) * 0.06;

        let r = rBase * bevel * wear + grain + microGrain;
        let g = gBase * bevel * wear + grain + microGrain;
        let b = bBase * bevel * wear + grain + microGrain;

        if (theme.waterPuddles) {
            const puddle = Math.max(0, procSmoothNoise(x * 0.04, y * 0.04, 120) - 0.50) * 2.2;
            if (puddle > 0) {
                const darkFactor = 1.0 - Math.min(0.60, puddle * 0.60);
                r *= darkFactor;
                g = g * darkFactor + Math.min(0.08, puddle * 0.06);
                b = b * darkFactor + Math.min(0.12, puddle * 0.10);
            }
        }

        if (theme.lichenPatches) {
            const jointReach = Math.max(0, (18 - mortarDist) / 18.0);
            const mossCluster = procSmoothNoise(x * 0.08, y * 0.08, 88);
            if (mossCluster > 0.40) {
                const moss = jointReach * (mossCluster - 0.40) * 1.5;
                g += moss * 0.45;
                r += moss * 0.10;
                b += moss * 0.05;
            }
        }

        if (theme.crystalVeins) {
            const dist = Math.abs(x + y * 0.60 - 260);
            if (dist < 10) {
                const cv = (1.0 - dist / 10.0) * 0.35;
                b += cv * 0.45;
                r += cv * 0.30;
                g += cv * 0.25;
            }
        }

        if (theme.abyssalRunes) {
            const voidPulse = (procSmoothNoise(x * 0.03, y * 0.03, 66) - 0.5) * 0.08;
            r = Math.max(0, r * 0.85 + voidPulse);
            g = Math.max(0, g * 0.80);
            b = Math.max(0, b * 0.90 + voidPulse * 1.5);
        }

        return [
            Math.max(0, Math.min(1, r)),
            Math.max(0, Math.min(1, g)),
            Math.max(0, Math.min(1, b))
        ];
    }, true);
}

function procCreateContextualFloorNormal(theme, size = 512) {
    const tileSize = 256;
    const gScale = theme.grainScale || 1.0;

    return procCreateTexture(size, (x, y) => {
        const inTileX = x % tileSize;
        const inTileY = y % tileSize;
        const distX = Math.min(inTileX, tileSize - 1 - inTileX);
        const distY = Math.min(inTileY, tileSize - 1 - inTileY);
        const mortarDist = Math.min(distX, distY);

        if (mortarDist <= 4) return [0.5, 0.5, 1.0];

        if (theme.waterPuddles) {
            const puddle = Math.max(0, procSmoothNoise(x * 0.04, y * 0.04, 120) - 0.50);
            if (puddle > 0.15) {
                return [0.5, 0.5, 1.0];
            }
        }

        let dx = 0, dy = 0;
        const bevelWidth = 16;
        if (mortarDist < 4 + bevelWidth) {
            const t = (mortarDist - 4) / bevelWidth;
            if (distX < distY) {
                dx = (inTileX < tileSize / 2) ? (1.0 - t) : -(1.0 - t);
            } else {
                dy = (inTileY < tileSize / 2) ? (1.0 - t) : -(1.0 - t);
            }
        }

        const rockBump = (procFractalNoise(x * 0.05 * gScale, y * 0.05 * gScale, 3, 4) - 0.5) * 0.20;
        const nx = dx * 0.60 + rockBump;
        const ny = -(dy * 0.60 + rockBump);
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    }, false);
}

function procCreateContextualFloorRoughness(theme, size = 512) {
    const baseR = theme.floorRoughness || 0.74;
    return procCreateTexture(size, (x, y) => {
        let r = baseR;
        if (theme.waterPuddles) {
            const puddle = Math.max(0, procSmoothNoise(x * 0.04, y * 0.04, 120) - 0.50) * 2.5;
            if (puddle > 0) {
                r = Math.max(0.18, r - puddle * 0.55);
            }
        }
        if (theme.abyssalRunes) {
            r = Math.min(r, 0.28);
        }
        if (theme.crystalVeins) {
            r = Math.min(r, 0.45);
        }
        if (theme.saltpeterBloom) {
            r = Math.min(0.96, r + 0.10);
        }
        const cr = Math.max(0.05, Math.min(0.98, r));
        return [cr, cr, cr];
    }, false);
}

function procCreateContextualPermWallTexture(theme, size = 512) {
    const wallBase = (theme.id === 'hengband_town')
        ? [0.32, 0.30, 0.32] // Authentic Japanese curved Ishigaki castle masonry
        : (theme.wallBase || [0.35, 0.35, 0.38]);
    return procCreateTexture(size, (x, y) => {
        const strata = Math.sin(y * 0.04 + procSmoothNoise(x * 0.03, y * 0.015, 11) * 6.0) * 0.09;
        const fracture = (procFractalNoise(x * 0.03, y * 0.03, 4, 15) - 0.5) * 0.16;
        const mineralGrain = (procSmoothNoise(x * 0.15, y * 0.15, 17) - 0.5) * 0.05;

        let r = wallBase[0] * 0.85 + strata + fracture + mineralGrain;
        let g = wallBase[1] * 0.85 + strata + fracture + mineralGrain;
        let b = wallBase[2] * 0.90 + strata * 1.2 + fracture + mineralGrain;

        if (theme.thermalCracks) {
            r = Math.max(0, r * 0.70 + Math.max(0, fracture * 0.40));
            g = Math.max(0, g * 0.60);
            b = Math.max(0, b * 0.55);
        }

        return [
            Math.max(0, Math.min(1, r)),
            Math.max(0, Math.min(1, g)),
            Math.max(0, Math.min(1, b))
        ];
    }, true);
}

function procCreateContextualPermWallNormal(theme, size = 512) {
    return procCreateTexture(size, (x, y) => {
        const h0 = procFractalNoise(x * 0.03, y * 0.03, 4, 15);
        const hx = procFractalNoise((x + 1) * 0.03, y * 0.03, 4, 15);
        const hy = procFractalNoise(x * 0.03, (y + 1) * 0.03, 4, 15);

        const dx = (hx - h0) * 4.0;
        const dy = (hy - h0) * 4.0;
        const nx = dx;
        const ny = -dy;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    }, false);
}

function procCreateContextualCeilingTexture(theme, size = 512) {
    const wallBase = theme.wallBase || [0.35, 0.35, 0.38];
    return procCreateTexture(size, (x, y) => {
        const n1 = (procFractalNoise(x * 0.06, y * 0.06, 3, 10) - 0.5) * 0.16;
        const n2 = (procSmoothNoise(x * 0.20, y * 0.20, 20) - 0.5) * 0.08;
        const r = wallBase[0] * 0.70 + n1 + n2;
        const g = wallBase[1] * 0.70 + n1 + n2;
        const b = wallBase[2] * 0.72 + n1 + n2;
        return [
            Math.max(0, Math.min(1, r)),
            Math.max(0, Math.min(1, g)),
            Math.max(0, Math.min(1, b))
        ];
    }, true);
}

function procCreateContextualCeilingNormal(theme, size = 512) {
    return procCreateTexture(size, (x, y) => {
        const h0 = procFractalNoise(x * 0.06, y * 0.06, 3, 10);
        const hx = procFractalNoise((x + 1) * 0.06, y * 0.06, 3, 10);
        const hy = procFractalNoise(x * 0.06, (y + 1) * 0.06, 3, 10);

        const dx = (hx - h0) * 3.0;
        const dy = (hy - h0) * 3.0;
        const nx = dx;
        const ny = -dy;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    }, false);
}

function procCreateStoneWallTexture() {
    const size = 512;
    const rowHeight = 128; // 4 horizontal courses of dressed ashlar stone
    const blockWidth = 256;
    const halfWidth = 128;
    return procCreateTexture(size, (x, y) => {
        const row = Math.floor(y / rowHeight);
        const yInRow = y % rowHeight;
        const distY = Math.min(yInRow, rowHeight - 1 - yInRow);
        const xOff = (row % 2 === 1) ? halfWidth : 0;
        const inBlockX = (x + size - xOff) % blockWidth;
        const distX = Math.min(inBlockX, blockWidth - 1 - inBlockX);
        const mortarDist = Math.min(distX, distY);

        // Deep dark charcoal recessed mortar joints with sand grit
        if (mortarDist <= 4) {
            const mn = (procSmoothNoise(x * 0.25, y * 0.25, 101) - 0.5) * 0.04;
            return [0.06 + mn, 0.06 + mn, 0.08 + mn];
        }

        const blockId = row * 4 + Math.floor((x + size - xOff) / blockWidth);
        const blockHue = procHash(blockId, 0, 77);
        // Rich natural quarried stone block variation (slate grays to warm granite)
        const rBase = 0.38 + (blockHue - 0.5) * 0.14;
        const gBase = 0.38 + (blockHue - 0.5) * 0.12;
        const bBase = 0.40 + (0.5 - blockHue) * 0.12;

        // Chamfered edge shadow towards recessed mortar
        const bevel = Math.min(1.0, (mortarDist - 4) / 18.0);
        // Multi-scale tactile stone grain, granite flecks & chisel grooves
        const macroGrain = (procFractalNoise(x * 0.04, y * 0.04, 3, 11) - 0.5) * 0.16;
        const microGrain = (procSmoothNoise(x * 0.16, y * 0.16, 2) - 0.5) * 0.08;
        const chisel = (procSmoothNoise(x * 0.28, y * 0.07, 14) - 0.5) * 0.06;
        const speckle = procHash(x, y, 42);
        const fleck = speckle > 0.96 ? 0.20 : (speckle < 0.04 ? -0.22 : 0.0);

        const shade = 0.70 + bevel * 0.30;
        const r = Math.max(0, Math.min(1, rBase * shade + macroGrain + microGrain + chisel + fleck));
        const g = Math.max(0, Math.min(1, gBase * shade + macroGrain + microGrain + chisel + fleck));
        const b = Math.max(0, Math.min(1, bBase * shade + macroGrain + microGrain + chisel + fleck));
        return [r, g, b];
    }, true);
}

function procCreateStoneWallNormal() {
    const size = 512;
    const rowHeight = 128;
    const blockWidth = 256;
    const halfWidth = 128;
    return procCreateTexture(size, (x, y) => {
        const row = Math.floor(y / rowHeight);
        const yInRow = y % rowHeight;
        const distY = Math.min(yInRow, rowHeight - 1 - yInRow);
        const xOff = (row % 2 === 1) ? halfWidth : 0;
        const inBlockX = (x + size - xOff) % blockWidth;
        const distX = Math.min(inBlockX, blockWidth - 1 - inBlockX);
        const mortarDist = Math.min(distX, distY);

        if (mortarDist <= 4) return [0.5, 0.5, 1.0];

        // Chamfered bevel slope at block perimeter
        let dx = 0, dy = 0;
        const bevelWidth = 18;
        if (mortarDist < 4 + bevelWidth) {
            const t = (mortarDist - 4) / bevelWidth;
            if (distX < distY) {
                dx = (inBlockX < halfWidth) ? (1.0 - t) : -(1.0 - t);
            } else {
                dy = (yInRow < rowHeight / 2) ? (1.0 - t) : -(1.0 - t);
            }
        }

        // Tactile stone surface chisel relief & rock roughness across entire face
        const rockBump = (procFractalNoise(x * 0.05, y * 0.05, 3, 50) - 0.5) * 0.24;
        const chiselBump = (procSmoothNoise(x * 0.28, y * 0.07, 51) - 0.5) * 0.12;
        const speckle = procHash(x, y, 42);
        const fleckBump = speckle > 0.96 ? 0.18 : (speckle < 0.04 ? -0.18 : 0.0);

        const nx = (dx * 0.65 + rockBump + chiselBump + fleckBump);
        const ny = -(dy * 0.65 + rockBump + chiselBump + fleckBump);
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    }, false);
}

function procCreatePermWallTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        // Primordial cyclopean bedrock: flowing geological strata, tectonic fissures, no brick seams
        const strata = Math.sin(y * 0.04 + procSmoothNoise(x * 0.03, y * 0.015, 11) * 6.0) * 0.08;
        const fracture = (procFractalNoise(x * 0.03, y * 0.03, 4, 15) - 0.5) * 0.16;
        const mineralGrain = (procSmoothNoise(x * 0.15, y * 0.15, 17) - 0.5) * 0.05;

        const rBase = 0.28 + strata + fracture + mineralGrain;
        const gBase = 0.28 + strata + fracture + mineralGrain;
        const bBase = 0.30 + strata * 1.2 + fracture + mineralGrain;

        return [
            Math.max(0, Math.min(1, rBase)),
            Math.max(0, Math.min(1, gBase)),
            Math.max(0, Math.min(1, bBase))
        ];
    });
}

function procCreatePermWallNormal() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const h0 = procFractalNoise(x * 0.03, y * 0.03, 4, 15);
        const hx = procFractalNoise((x + 1) * 0.03, y * 0.03, 4, 15);
        const hy = procFractalNoise(x * 0.03, (y + 1) * 0.03, 4, 15);

        const dx = (hx - h0) * 4.0;
        const dy = (hy - h0) * 4.0;
        const nx = dx;
        const ny = -dy;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    });
}

function procCreateFloorTexture() {
    const size = 512;
    const tileSize = 256;
    return procCreateTexture(size, (x, y) => {
        const tileX = Math.floor(x / tileSize);
        const tileY = Math.floor(y / tileSize);
        const inTileX = x % tileSize;
        const inTileY = y % tileSize;
        const distX = Math.min(inTileX, tileSize - 1 - inTileX);
        const distY = Math.min(inTileY, tileSize - 1 - inTileY);
        const mortarDist = Math.min(distX, distY);

        // Recessed charcoal mortar seam with sand grit
        if (mortarDist <= 4) {
            const mn = (procSmoothNoise(x * 0.25, y * 0.25, 202) - 0.5) * 0.03;
            return [0.06 + mn, 0.06 + mn, 0.08 + mn];
        }

        const tileId = tileY * 2 + tileX;
        const tileHue = procHash(tileId, 0, 99);
        // Flagstone stone hue variation (slate, basalt, cold granite)
        const rBase = 0.34 + (tileHue - 0.5) * 0.10;
        const gBase = 0.34 + (tileHue - 0.5) * 0.09;
        const bBase = 0.36 + (0.5 - tileHue) * 0.09;

        // Chamfer edge shadow towards mortar
        const bevel = Math.min(1.0, (mortarDist - 4) / 16.0);
        // Multi-scale tactile stone grain, subtle center wear, and flecks
        const macroGrain = (procFractalNoise(x * 0.04, y * 0.04, 3, 21) - 0.5) * 0.14;
        const microGrain = (procSmoothNoise(x * 0.18, y * 0.18, 4) - 0.5) * 0.06;
        const speckle = procHash(x, y, 99);
        const fleck = speckle > 0.96 ? 0.16 : (speckle < 0.04 ? -0.18 : 0.0);
        const centerDist = Math.hypot(inTileX - 128, inTileY - 128) / 128.0;
        const wornCenter = (1.0 - Math.min(1.0, centerDist)) * 0.06;

        const shade = 0.72 + bevel * 0.28 + wornCenter;
        const r = Math.max(0, Math.min(1, rBase * shade + macroGrain + microGrain + fleck));
        const g = Math.max(0, Math.min(1, gBase * shade + macroGrain + microGrain + fleck));
        const b = Math.max(0, Math.min(1, bBase * shade + macroGrain + microGrain + fleck));
        return [r, g, b];
    }, true);
}

function procCreateFloorNormal() {
    const size = 512;
    const tileSize = 256;
    return procCreateTexture(size, (x, y) => {
        const inTileX = x % tileSize;
        const inTileY = y % tileSize;
        const distX = Math.min(inTileX, tileSize - 1 - inTileX);
        const distY = Math.min(inTileY, tileSize - 1 - inTileY);
        const mortarDist = Math.min(distX, distY);

        if (mortarDist <= 4) return [0.5, 0.5, 1.0];

        // Chamfered slope at paver perimeter
        let dx = 0, dy = 0;
        const bevelWidth = 16;
        if (mortarDist < 4 + bevelWidth) {
            const t = (mortarDist - 4) / bevelWidth;
            if (distX < distY) {
                dx = (inTileX < tileSize / 2) ? (1.0 - t) : -(1.0 - t);
            } else {
                dy = (inTileY < tileSize / 2) ? (1.0 - t) : -(1.0 - t);
            }
        }

        const rockBump = (procFractalNoise(x * 0.05, y * 0.05, 3, 62) - 0.5) * 0.20;
        const microBump = (procSmoothNoise(x * 0.16, y * 0.16, 52) - 0.5) * 0.08;
        const nx = (dx * 0.55 + rockBump + microBump);
        const ny = -(dy * 0.55 + rockBump + microBump);
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, nz / len * 0.5 + 0.5];
    }, false);
}

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

function procCreateShopDoorTexture(shopNum, heraldicColor) {
    const size = 512;
    const plankWidth = 128;
    const pattern = (shopNum >= 1 && shopNum <= 8) ? DIGIT_PATTERNS[shopNum - 1] : null;

    return procCreateTexture(size, (x, y) => {
        const plankIdx = Math.floor(x / plankWidth);
        const inPlankX = x % plankWidth;
        const seamDist = Math.min(inPlankX, plankWidth - 1 - inPlankX);

        // Horizontal forged-iron reinforcement straps
        const isIronStrap = (y >= 88 && y <= 124) || (y >= 388 && y <= 424);
        if (isIronStrap) {
            const rivetX = inPlankX - plankWidth / 2;
            const rivetY = (y < 200) ? (y - 106) : (y - 406);
            const isRivet = rivetX * rivetX + rivetY * rivetY <= 64;
            if (isRivet) return [0.48, 0.48, 0.52];
            const ironGrain = (procSmoothNoise(x * 0.1, y * 0.1, 31) - 0.5) * 0.04;
            return [0.20 + ironGrain, 0.20 + ironGrain, 0.22 + ironGrain];
        }

        // Central Emblazoned Heraldic Shield at (256, 256)
        const dx = x - 256;
        const dy = y - 256;
        const absDx = Math.abs(dx);

        const inShield = (dy >= -92 && dy <= 0 && absDx <= 88) ||
                         (dy > 0 && dy <= 100 && absDx <= 88 - (dy * dy) / 116.0);

        if (inShield) {
            const isShieldRim = (dy <= -84 || absDx >= 80 || (dy > 0 && absDx >= 80 - (dy * dy) / 116.0));
            if (isShieldRim) {
                const bevel = (dx < 0 || dy < -76) ? 0.14 : -0.10;
                return [0.88 + bevel, 0.74 + bevel, 0.28 + bevel];
            }

            if (pattern) {
                const gx = Math.floor((x - 226) / 12);
                const gy = Math.floor((y - 214) / 12);
                if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7) {
                    const isBit = (pattern[gy] & (1 << (4 - gx))) !== 0;
                    if (isBit) return [1.0, 0.90, 0.35]; // Gold digit
                }
            }

            const bgR = Math.max(0, Math.min(1, heraldicColor[0] * 0.48 + 0.10));
            const bgG = Math.max(0, Math.min(1, heraldicColor[1] * 0.48 + 0.08));
            const bgB = Math.max(0, Math.min(1, heraldicColor[2] * 0.48 + 0.06));
            return [bgR, bgG, bgB];
        }

        if (seamDist <= 4) return [0.10, 0.07, 0.04];

        const woodGrain = (procSmoothNoise(x * 0.08, y * 0.04, 55) - 0.5) * 0.04;
        const plankHue = procHash(plankIdx, 0, 88 + shopNum);
        const r = Math.max(0, Math.min(1, 0.32 + (plankHue - 0.5) * 0.03 + woodGrain));
        const g = Math.max(0, Math.min(1, 0.22 + (plankHue - 0.5) * 0.02 + woodGrain * 0.8));
        const b = Math.max(0, Math.min(1, 0.14 + (plankHue - 0.5) * 0.02 + woodGrain * 0.5));
        return [r, g, b];
    });
}

function procCreateWoodDoorTexture() {
    const size = 512;
    const plankWidth = 128;
    return procCreateTexture(size, (x, y) => {
        const plankIdx = Math.floor(x / plankWidth);
        const inPlankX = x % plankWidth;
        const seamDist = Math.min(inPlankX, plankWidth - 1 - inPlankX);

        const isIronStrap = (y >= 100 && y <= 136) || (y >= 376 && y <= 412);
        if (isIronStrap) {
            const rivetX = inPlankX - plankWidth / 2;
            const rivetY = (y < 200) ? (y - 118) : (y - 394);
            const isRivet = rivetX * rivetX + rivetY * rivetY <= 64;
            if (isRivet) return [0.44, 0.44, 0.48];
            const ironGrain = (procSmoothNoise(x * 0.1, y * 0.1, 31) - 0.5) * 0.04;
            return [0.20 + ironGrain, 0.20 + ironGrain, 0.22 + ironGrain];
        }

        if (seamDist <= 4) return [0.10, 0.07, 0.04];

        const woodGrain = (procSmoothNoise(x * 0.08, y * 0.04, 55) - 0.5) * 0.04;
        const plankHue = procHash(plankIdx, 0, 88);
        const r = Math.max(0, Math.min(1, 0.34 + (plankHue - 0.5) * 0.03 + woodGrain));
        const g = Math.max(0, Math.min(1, 0.24 + (plankHue - 0.5) * 0.02 + woodGrain * 0.8));
        const b = Math.max(0, Math.min(1, 0.15 + (plankHue - 0.5) * 0.02 + woodGrain * 0.5));
        return [r, g, b];
    });
}

function procCreateStoreTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const isBorderBeam = x < 36 || x > 475 || y < 36 || y > 475;
        const isCrossBeam = Math.abs(x - 256) < 20 || Math.abs(y - 256) < 20;
        const isDiagonal = Math.abs((x - y) % 256) < 16 || Math.abs((x + y) % 256) < 16;

        if (isBorderBeam || isCrossBeam || isDiagonal) {
            const woodGrain = (procSmoothNoise(x * 0.08, y * 0.08, 12) - 0.5) * 0.04;
            return [0.24 + woodGrain, 0.16 + woodGrain * 0.7, 0.11 + woodGrain * 0.5];
        }

        const plasterGrain = (procSmoothNoise(x * 0.08, y * 0.08, 22) - 0.5) * 0.04;
        return [0.65 + plasterGrain, 0.62 + plasterGrain, 0.56 + plasterGrain];
    });
}

function procCreateCeilingTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const grain = (procSmoothNoise(x * 0.06, y * 0.06, 5) - 0.5) * 0.06;
        const microGrain = (procSmoothNoise(x * 0.18, y * 0.18, 6) - 0.5) * 0.03;
        const r = Math.max(0, Math.min(1, 0.22 + grain + microGrain));
        const g = Math.max(0, Math.min(1, 0.23 + grain + microGrain));
        const b = Math.max(0, Math.min(1, 0.25 + grain + microGrain));
        return [r, g, b];
    });
}

function procCreateMagmaTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const vein = (procFractalNoise(x * 0.02, y * 0.02, 4, 77) - 0.5) * 2.0;
        if (Math.abs(vein) < 0.24) {
            const heat = 1.0 - Math.min(1, Math.abs(vein) / 0.24);
            return [0.94 + heat * 0.06, 0.32 + heat * 0.44, 0.04 + heat * 0.12];
        }
        const rockGrain = (procSmoothNoise(x * 0.08, y * 0.08, 88) - 0.5) * 0.05;
        return [0.24 + rockGrain, 0.22 + rockGrain, 0.24 + rockGrain];
    });
}

function procCreateMagmaEmission() {
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

function procCreateLavaTexture(w = 256, h = 256) {
    const size = w || 256;
    return procCreateTexture(size, (x, y) => {
        const nx = x / size;
        const ny = y / size;
        const qx = procFractalNoise(nx * 3.5, ny * 3.5, 4, 31) - 0.5;
        const qy = procFractalNoise(nx * 3.5 + 5.2, ny * 3.5 + 1.3, 4, 47) - 0.5;
        const rx = procFractalNoise((nx + qx * 0.8) * 4.0, (ny + qy * 0.8) * 4.0, 4, 83) - 0.5;
        const ry = procFractalNoise((nx + qx * 0.8 + 1.7) * 4.0, (ny + qy * 0.8 + 9.2) * 4.0, 4, 19) - 0.5;
        const warp = procFractalNoise((nx + rx * 0.9) * 4.2, (ny + ry * 0.9) * 4.2, 4, 59);

        if (warp < 0.42) {
            const crustGrain = (procSmoothNoise(nx * 32, ny * 32, 101) - 0.5) * 0.03;
            const crustT = warp / 0.42;
            const r = 0.09 + crustT * 0.04 + crustGrain;
            const g = 0.07 + crustT * 0.02 + crustGrain;
            const b = 0.06 + crustGrain;
            return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
        } else if (warp < 0.60) {
            const t = (warp - 0.42) / 0.18;
            const r = 0.78 + t * 0.22;
            const g = 0.11 + t * 0.37;
            const b = 0.0;
            return [r, g, b];
        } else if (warp < 0.80) {
            const t = (warp - 0.60) / 0.20;
            const r = 1.0;
            const g = 0.48 + t * 0.48;
            const b = t * 0.69;
            return [r, g, b];
        } else {
            const t = Math.min(1.0, (warp - 0.80) / 0.20);
            return [1.0, 0.96 + t * 0.04, 0.69 + t * 0.31];
        }
    });
}

function procCreateLavaEmission(w = 256, h = 256) {
    const size = w || 256;
    return procCreateTexture(size, (x, y) => {
        const nx = x / size;
        const ny = y / size;
        const qx = procFractalNoise(nx * 3.5, ny * 3.5, 4, 31) - 0.5;
        const qy = procFractalNoise(nx * 3.5 + 5.2, ny * 3.5 + 1.3, 4, 47) - 0.5;
        const rx = procFractalNoise((nx + qx * 0.8) * 4.0, (ny + qy * 0.8) * 4.0, 4, 83) - 0.5;
        const ry = procFractalNoise((nx + qx * 0.8 + 1.7) * 4.0, (ny + qy * 0.8 + 9.2) * 4.0, 4, 19) - 0.5;
        const warp = procFractalNoise((nx + rx * 0.9) * 4.2, (ny + ry * 0.9) * 4.2, 4, 59);

        if (warp < 0.42) {
            const fissure = procFractalNoise(nx * 18, ny * 18, 2, 73);
            if (fissure > 0.82) {
                return [0.45, 0.08, 0.0];
            }
            return [0.0, 0.0, 0.0];
        } else if (warp < 0.60) {
            const t = (warp - 0.42) / 0.18;
            return [0.85 + t * 0.15, 0.15 + t * 0.40, 0.0];
        } else {
            const t = Math.min(1.0, (warp - 0.60) / 0.40);
            return [1.0, 0.55 + t * 0.45, t * 0.75];
        }
    });
}

function procCreateQuartzTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const crystalVein = (procFractalNoise((x * 1.2 - y * 0.8) * 0.025, (x * 0.5 + y) * 0.025, 4, 44) - 0.5) * 2.0;
        if (Math.abs(crystalVein) < 0.22) {
            const glint = procSmoothNoise(x * 0.2, y * 0.2, 12) * 0.12;
            return [0.74 + glint, 0.80 + glint, 0.86 + glint];
        }
        const grain = (procSmoothNoise(x * 0.08, y * 0.08, 9) - 0.5) * 0.06;
        return [0.40 + grain, 0.41 + grain, 0.43 + grain];
    });
}

function procCreateGoldVeinTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const vein = (procFractalNoise(x * 0.025, y * 0.025, 4, 83) - 0.5) * 2.0;
        const goldNugget = procSmoothNoise(x * 0.15, y * 0.15, 105);
        const inVein = Math.abs(vein) < 0.22;
        const isNugget = (inVein && goldNugget > 0.42) || (!inVein && Math.abs(vein) < 0.32 && goldNugget > 0.70);

        if (isNugget) {
            // Raw glittering native gold ore
            const luster = procSmoothNoise(x * 0.35, y * 0.35, 120) * 0.15;
            return [0.96 + luster * 0.04, 0.80 + luster, 0.15 + luster * 0.5];
        }
        if (inVein) {
            // Quartz border around gold vein
            const rim = procSmoothNoise(x * 0.1, y * 0.1, 91) * 0.08;
            return [0.46 + rim, 0.40 + rim, 0.28 + rim];
        }
        const rockGrain = (procSmoothNoise(x * 0.08, y * 0.08, 88) - 0.5) * 0.05;
        return [0.22 + rockGrain, 0.20 + rockGrain, 0.22 + rockGrain];
    });
}

function procCreateGoldVeinEmission() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const vein = (procFractalNoise(x * 0.025, y * 0.025, 4, 83) - 0.5) * 2.0;
        const goldNugget = procSmoothNoise(x * 0.15, y * 0.15, 105);
        const inVein = Math.abs(vein) < 0.22;
        const isNugget = (inVein && goldNugget > 0.42) || (!inVein && Math.abs(vein) < 0.32 && goldNugget > 0.70);

        if (isNugget) {
            return [0.55, 0.42, 0.06]; // Warm golden glint in torchlight
        }
        return [0, 0, 0];
    });
}

function procCreateGemVeinTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const crystalVein = (procFractalNoise((x * 1.2 - y * 0.8) * 0.025, (x * 0.5 + y) * 0.025, 4, 44) - 0.5) * 2.0;
        const gemCluster = procSmoothNoise(x * 0.18, y * 0.18, 215);
        const inVein = Math.abs(crystalVein) < 0.24;
        const isGem = inVein && gemCluster > 0.56;

        if (isGem) {
            // Multi-faceted sparkling gemstones: Emeralds, Rubies, Sapphires, Amethysts!
            const gemType = Math.floor(procHash(Math.floor(x / 24), Math.floor(y / 24), 77) * 4);
            const facet = (procSmoothNoise(x * 0.4, y * 0.4, 301) - 0.5) * 0.25;
            if (gemType === 0) {
                // Brilliant Emerald Green
                return [0.08 + facet * 0.5, 0.92 + facet, 0.32 + facet * 0.8];
            } else if (gemType === 1) {
                // Brilliant Ruby Red
                return [0.96 + facet, 0.12 + facet * 0.5, 0.24 + facet * 0.8];
            } else if (gemType === 2) {
                // Brilliant Sapphire Blue
                return [0.12 + facet * 0.5, 0.45 + facet * 0.8, 0.98 + facet];
            } else {
                // Brilliant Amethyst
                return [0.88 + facet, 0.35 + facet * 0.5, 0.95 + facet];
            }
        }
        if (inVein) {
            const glint = procSmoothNoise(x * 0.2, y * 0.2, 12) * 0.12;
            return [0.72 + glint, 0.78 + glint, 0.84 + glint];
        }
        const grain = (procSmoothNoise(x * 0.08, y * 0.08, 9) - 0.5) * 0.06;
        return [0.38 + grain, 0.39 + grain, 0.42 + grain];
    });
}

function procCreateGemVeinEmission() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const crystalVein = (procFractalNoise((x * 1.2 - y * 0.8) * 0.025, (x * 0.5 + y) * 0.025, 4, 44) - 0.5) * 2.0;
        const gemCluster = procSmoothNoise(x * 0.18, y * 0.18, 215);
        const inVein = Math.abs(crystalVein) < 0.24;
        const isGem = inVein && gemCluster > 0.56;

        if (isGem) {
            const gemType = Math.floor(procHash(Math.floor(x / 24), Math.floor(y / 24), 77) * 4);
            if (gemType === 0) return [0.04, 0.45, 0.15]; // Emerald luminescence
            if (gemType === 1) return [0.48, 0.06, 0.12]; // Ruby luminescence
            if (gemType === 2) return [0.06, 0.22, 0.50]; // Sapphire luminescence
            return [0.42, 0.15, 0.48]; // Amethyst luminescence
        }
        return [0, 0, 0];
    });
}

function procCreateGrassTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        // High-frequency directional blade striations (blade angle ~ 75-80 deg)
        const bladeAngle = x * 0.85 + y * 0.18;
        const bladeWave = Math.sin(bladeAngle * 1.6 + procSmoothNoise(x * 0.10, y * 0.10, 61) * 6.0);
        const fineBlade = (bladeWave * 0.5 + 0.5) * (procSmoothNoise(x * 0.35, y * 0.12, 62) * 0.4 + 0.6);

        // Turf clumps & soil patches
        const clumpNoise = procSmoothNoise(x * 0.04, y * 0.04, 63);
        const soilPatch = procSmoothNoise(x * 0.015, y * 0.015, 64);
        const cloverNoise = procSmoothNoise(x * 0.12, y * 0.12, 65);

        // Color palette: Lush spring meadow green with golden blade tips and dark thatch roots
        let r = 0.14 + fineBlade * 0.26 + clumpNoise * 0.08;
        let g = 0.34 + fineBlade * 0.40 + clumpNoise * 0.12;
        let b = 0.08 + fineBlade * 0.12 + clumpNoise * 0.04;

        // Soil loam peeking through in thin turf patches
        if (soilPatch < 0.24) {
            const t = (0.24 - soilPatch) / 0.24;
            r = r * (1 - t) + 0.36 * t;
            g = g * (1 - t) + 0.26 * t;
            b = b * (1 - t) + 0.16 * t;
        }

        // Occasional clover / micro-flora flecks
        if (cloverNoise > 0.82) {
            const c = (cloverNoise - 0.82) / 0.18;
            r = r * (1 - c) + 0.42 * c;
            g = g * (1 - c) + 0.72 * c;
            b = b * (1 - c) + 0.26 * c;
        }

        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    }, true);
}

function procCreateGrassNormal() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const h = (u, v) => {
            const bladeWave = Math.sin((u * 0.85 + v * 0.18) * 1.6 + procSmoothNoise(u * 0.10, v * 0.10, 61) * 6.0);
            return bladeWave * 0.6 + procSmoothNoise(u * 0.04, v * 0.04, 63) * 0.4;
        };
        const h0 = h(x, y);
        const hx = h(x + 1, y);
        const hy = h(x, y + 1);

        const dx = (hx - h0) * 2.2;
        const dy = (hy - h0) * 2.2;
        const nx = dx;
        const ny = -dy;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return [
            Math.max(0, Math.min(1, nx / len * 0.5 + 0.5)),
            Math.max(0, Math.min(1, ny / len * 0.5 + 0.5)),
            Math.max(0, Math.min(1, nz / len * 0.5 + 0.5))
        ];
    });
}

function procCreateDirtTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const soilGrain = (procSmoothNoise(x * 0.12, y * 0.12, 71) - 0.5) * 0.08;
        const pebbleNoise = procSmoothNoise(x * 0.3, y * 0.3, 72);
        const pebble = pebbleNoise > 0.78 ? (pebbleNoise - 0.78) * 0.8 : 0;

        const r = 0.44 + soilGrain + pebble * 0.2;
        const g = 0.34 + soilGrain * 0.8 + pebble * 0.2;
        const b = 0.24 + soilGrain * 0.6 + pebble * 0.2;
        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    });
}

function procCreateWaterTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const wave1 = Math.sin(x * 0.08 + y * 0.04) * 0.06;
        const wave2 = Math.cos(x * 0.04 - y * 0.08) * 0.06;
        const ripple = (procSmoothNoise(x * 0.15, y * 0.15, 81) - 0.5) * 0.05;

        const r = 0.14 + wave1 * 0.3;
        const g = 0.44 + wave1 + wave2 + ripple;
        const b = 0.74 + wave2 * 0.5 + ripple * 0.5;
        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    });
}

function procCreateDeepWaterTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const wave = Math.sin(x * 0.05 + y * 0.05) * 0.04;
        const r = 0.06 + wave * 0.2;
        const g = 0.20 + wave * 0.5;
        const b = 0.48 + wave;
        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    });
}

function procCreateTreeLeavesTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        // Cluster grid (leaf bunches / puffs of canopy)
        const clusterScale = 0.04;
        const cx = x * clusterScale;
        const cy = y * clusterScale;

        // Voronoi-like clump center distance
        const clumpNoise = procSmoothNoise(cx, cy, 91);
        const clumpDist = Math.sin(cx * 3.14) * Math.sin(cy * 3.14);

        // Overlapping leaf edges and silhouettes
        const leafSerration = (procSmoothNoise(x * 0.22, y * 0.22, 92) - 0.5) * 0.24;
        const microLeaves = (procSmoothNoise(x * 0.45, y * 0.45, 93) - 0.5) * 0.14;

        // Density of foliage cluster: high inside clump, drops off into deep canopy shadow crevices
        const puff = Math.max(0, Math.min(1, clumpNoise * 0.6 + clumpDist * 0.3 + 0.2 + leafSerration));

        // Deep ancient arbor canopy palette:
        let r, g, b;
        if (puff < 0.35) {
            // Deep canopy shadow void between leaf bunches
            const t = puff / 0.35;
            r = 0.03 * (1 - t) + 0.10 * t;
            g = 0.09 * (1 - t) + 0.30 * t;
            b = 0.04 * (1 - t) + 0.13 * t;
        } else {
            const t = (puff - 0.35) / 0.65;
            r = 0.10 * (1 - t) + 0.28 * t + microLeaves * 0.3;
            g = 0.30 * (1 - t) + 0.62 * t + microLeaves;
            b = 0.13 * (1 - t) + 0.25 * t + microLeaves * 0.3;
        }

        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    }, true);
}

function procCreateTreeLeavesNormal() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const h = (u, v) => {
            const cx = u * 0.04;
            const cy = v * 0.04;
            const puff = procSmoothNoise(cx, cy, 91) * 0.6 + (procSmoothNoise(u * 0.22, v * 0.22, 92) - 0.5) * 0.20;
            return puff;
        };
        const h0 = h(x, y);
        const hx = h(x + 1, y);
        const hy = h(x, y + 1);

        const dx = (hx - h0) * 3.5;
        const dy = (hy - h0) * 3.5;
        const nx = dx;
        const ny = -dy;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return [
            Math.max(0, Math.min(1, nx / len * 0.5 + 0.5)),
            Math.max(0, Math.min(1, ny / len * 0.5 + 0.5)),
            Math.max(0, Math.min(1, nz / len * 0.5 + 0.5))
        ];
    });
}

function procCreateTreeBarkTexture() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const furrow = Math.sin(x * 0.30 + procSmoothNoise(x * 0.04, y * 0.15, 94) * 4.0) * 0.14;
        const grain = (procSmoothNoise(x * 0.06, y * 0.30, 95) - 0.5) * 0.12;
        const microGrain = (procSmoothNoise(x * 0.25, y * 0.50, 96) - 0.5) * 0.05;
        const mossFleck = procSmoothNoise(x * 0.06, y * 0.06, 97);

        let r = 0.32 + furrow + grain + microGrain;
        let g = 0.22 + furrow * 0.8 + grain * 0.7 + microGrain * 0.7;
        let b = 0.13 + furrow * 0.5 + grain * 0.5 + microGrain * 0.5;

        // Organic pale moss nestled in deep furrow crevices
        if (mossFleck > 0.66 && furrow < -0.02) {
            const m = (mossFleck - 0.66) / 0.34;
            r = r * (1 - m) + 0.22 * m;
            g = g * (1 - m) + 0.40 * m;
            b = b * (1 - m) + 0.16 * m;
        }

        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    }, true);
}

function procCreateTreeBarkNormal() {
    const size = 512;
    return procCreateTexture(size, (x, y) => {
        const h = (u, v) => {
            const furrow = Math.sin(u * 0.30 + procSmoothNoise(u * 0.04, v * 0.15, 94) * 4.0);
            const grain = procSmoothNoise(u * 0.06, v * 0.30, 95) * 0.3;
            return furrow * 0.7 + grain;
        };
        const h0 = h(x, y);
        const hx = h(x + 1, y);
        const hy = h(x, y + 1);

        const dx = (hx - h0) * 3.8;
        const dy = (hy - h0) * 1.5;
        const nx = dx;
        const ny = -dy;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return [
            Math.max(0, Math.min(1, nx / len * 0.5 + 0.5)),
            Math.max(0, Math.min(1, ny / len * 0.5 + 0.5)),
            Math.max(0, Math.min(1, nz / len * 0.5 + 0.5))
        ];
    });
}


function procCreateOrganicNormal() {
    const size = 256;
    return procCreateTexture(size, (x, y) => {
        const nx = procSmoothNoise(x * 0.12, y * 0.12, 101);
        const ny = procSmoothNoise(x * 0.12, (y + 1) * 0.12, 101);
        const dx = (procSmoothNoise((x + 1) * 0.12, y * 0.12, 101) - nx) * 1.8;
        const dy = (ny - nx) * 1.8;
        return [0.5 + dx, 0.5 + dy, 1.0];
    });
}

function procCreateScaleNormal() {
    const size = 256;
    return procCreateTexture(size, (x, y) => {
        const u = (x % 32) - 16;
        const v = (y % 32) - 16;
        const dist = Math.sqrt(u * u + v * v) / 16.0;
        const h = Math.max(0, 1.0 - dist);
        const dx = (u / 16.0) * h * 0.8;
        const dy = (v / 16.0) * h * 0.8;
        return [0.5 - dx, 0.5 - dy, 1.0];
    });
}

function procCreateChitinNormal() {
    const size = 256;
    return procCreateTexture(size, (x, y) => {
        const segment = Math.sin(y * 0.15) * 0.25;
        const fineNoise = (procSmoothNoise(x * 0.25, y * 0.25, 202) - 0.5) * 0.15;
        return [0.5 + fineNoise, 0.5 + segment + fineNoise, 1.0];
    });
}

function procCreateFurNormal() {
    const size = 256;
    return procCreateTexture(size, (x, y) => {
        const strand = Math.sin((x + y * 0.3) * 0.8) * 0.3;
        const noise = (procSmoothNoise(x * 0.3, y * 0.08, 303) - 0.5) * 0.2;
        return [0.5 + strand, 0.5 + noise, 1.0];
    });
}


function createChamferedWallGeometry(cellSize, wallHeight, chamfer = 0.40) {
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
                const vH = (vy + halfH) / wallHeight;
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
    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const maxDist = Math.hypot(cellSize / 2, cellSize / 2);
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const dist = Math.hypot(x, z);
        const d = Math.min(1.0, dist / maxDist);
        // Perimeter and corners softly darkened by up to 20% to ground wall contact
        const factor = 1.0 - d * 0.20;
        colors[i * 3 + 0] = factor;
        colors[i * 3 + 1] = factor;
        colors[i * 3 + 2] = factor;
    }
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
        const factor = 1.0 - d * 0.16;
        colors[i * 3 + 0] = factor;
        colors[i * 3 + 1] = factor;
        colors[i * 3 + 2] = factor;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ==============================================================================
// 2. Main 3D Dungeon Crawler Engine
// ==============================================================================

const POLYHAVEN_ITEM_GLTF_PATHS = {
    ph_saber: '/assets/polyhaven/models/wooden_handle_saber/wooden_handle_saber.gltf',
    ph_estoc: '/assets/polyhaven/models/antique_estoc/antique_estoc.gltf',
    ph_katana: '/assets/polyhaven/models/antique_katana_01/antique_katana_01.gltf',
    ph_dagger: '/assets/polyhaven/models/ornate_medieval_dagger/ornate_medieval_dagger.gltf',
    ph_axe: '/assets/polyhaven/models/wooden_axe/wooden_axe.gltf',
    ph_hatchet: '/assets/polyhaven/models/hatchet/hatchet.gltf',
    ph_hammer: '/assets/polyhaven/models/ornate_war_hammer/ornate_war_hammer.gltf',
    ph_sledgehammer: '/assets/polyhaven/models/sledgehammer_01/sledgehammer_01.gltf',
    ph_mace: '/assets/polyhaven/models/ornate_medieval_mace/ornate_medieval_mace.gltf',
    ph_shield: '/assets/polyhaven/models/kite_shield/kite_shield.gltf',
    ph_potion_bottle: '/assets/models/items/healing_potion.glb',
    ph_potion_flask: '/assets/models/items/greater_healing_potion.glb',
    ph_potion_urn: '/assets/models/items/supreme_healing_potion.glb',
    ph_goblet: '/assets/polyhaven/models/brass_goblets/brass_goblets.gltf',
    ph_lantern: '/assets/polyhaven/models/wooden_lantern_01/wooden_lantern_01.gltf',
    ph_candle: '/assets/polyhaven/models/brass_candleholders/brass_candleholders.gltf',
    ph_chest: '/assets/polyhaven/models/treasure_chest/treasure_chest.gltf',
    item_bow: '/assets/models/items/bow.glb',
    item_spear: '/assets/models/items/spear.glb',
    item_torch: '/assets/models/items/torch.glb',
    item_greatsword: '/assets/models/items/great_sword.glb',
    item_rune_blade: '/assets/models/items/rune_blade.glb',
    item_goblin_sword: '/assets/models/items/goblin_sword.glb',
    item_morningstar: '/assets/models/items/morningstar.glb',
    item_greatclub: '/assets/models/items/greatclub.glb',
    item_longsword: '/assets/models/items/steel_longsword.glb',
    item_shield_wooden: '/assets/models/items/shield_wooden.glb',
    item_shield_raven: '/assets/models/items/shield_raven.glb',
    item_helmet: '/assets/models/items/iron_helmet.glb',
    item_plate_armor: '/assets/models/items/plate_armor.glb',
    item_leather_armor: '/assets/models/items/leather_armor.glb',
    item_boots: '/assets/models/items/iron_boots.glb',
    item_gauntlets: '/assets/models/items/iron_gauntlets.glb',
    item_cloak: '/assets/models/items/wool_cape.glb',
    item_scroll: '/assets/models/items/scroll.glb',
    item_scroll_enchant: '/assets/models/items/scroll_enchant.glb',
    item_coins: '/assets/models/items/coin_pile_spill.glb',
    item_key: '/assets/models/items/dungeon_key_gold.glb',
    item_bread: '/assets/models/items/bread.glb',
    item_lembas: '/assets/models/items/lembas_wafer.glb',
    item_shovel: '/assets/polyhaven/models/rusted_spade_01/rusted_spade_01.gltf',
    item_pickaxe: '/assets/polyhaven/models/picke_dirty_01/picke_dirty_01.gltf',
    item_wand: '/assets/models/items/wand.glb',
    item_rod: '/assets/models/items/rod.glb',
    item_staff: '/assets/models/items/staff.glb',
    item_staff_branch: '/assets/models/items/staff.glb',
    item_book: '/assets/polyhaven/models/decorative_book_set_01/decorative_book_set_01.gltf',
    item_shield_wicker: '/assets/models/items/shield_wooden.glb',
    item_shield_leather: '/assets/models/items/shield_wooden.glb',
    item_shield_metal: '/assets/models/items/shield_wooden.glb',
    item_arrow: '/assets/models/items/steel_arrow.glb',
    item_talisman: '/assets/models/items/phoenix_talisman.glb',
    item_chainmail: '/assets/models/items/chain_mail.glb',
    item_crown: '/assets/models/items/helm_of_brilliance.glb',
    item_gold: '/assets/models/items/coin_pile_spill.glb',
    ph_book: '/assets/polyhaven/models/decorative_book_set_01/decorative_book_set_01.gltf'
};

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

class Dungeon3D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
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
        this.cameraBobPhase = 0;

        this.stepDuration = 0.14; // 140ms step tween
        this.stepTime = 0;
        this.isStepping = false;

        this.monsters = new Map();
        this.items = new Map();

        // Combat Juice & VFX Subsystems (Exact 1:1 Parity with Godot DungeonWorld.cs)
        this.floatingTexts = [];
        this.particles = [];
        this.trauma = 0.0;
        this.lastPlayerHp = null;
        this.processedMessages = new Set();
        this.attackAnimationTime = 0.0;
        this.hurtAnimationTime = 0.0;
        this.castAnimationTime = 0.0;
        this.lastDepth = null;
        this.audio = null;
        this.lastPlayerStatuses = new Set();

        this.realm = 'angband';

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

        this.initThree();
        this.initTextures();
        this.initMeshes();
        this.initViewmodel();
        this.initModelResolvers();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        const tier = (window.DeviceProfile && typeof window.DeviceProfile.getTier === 'function')
            ? window.DeviceProfile.getTier()
            : 'desktop';
        const dprCap = tier === 'phone' ? 1.25 : (tier === 'tablet' ? 1.5 : 2.0);
        const farDistance = tier === 'phone' ? 85 : (tier === 'tablet' ? 110 : 140);
        const initialFogDensity = tier === 'phone' ? 0.015 : 0.008;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2d3a50); // Initial town sky
        this.scene.fog = new THREE.FogExp2(0x2d3a50, initialFogDensity);

        this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, farDistance);
        this.camera.position.set(0, this.eyeHeight, 0);
        this.camera.rotation.order = 'YXZ'; // Critical: Yaw first, then Pitch, then Roll (eliminates room skew / Dutch tilt)
        this.camera.rotation.y = 0; // Starts looking North (-Z)
        this.camera.rotation.x = 0;
        this.camera.rotation.z = 0;

        const isRecording = typeof window !== 'undefined' && window.location.search && window.location.search.includes('record_walkthrough=1');
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
            preserveDrawingBuffer: isRecording
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;

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
        this.ambientLight = new THREE.AmbientLight(0x808aa8, 0.75);
        this.scene.add(this.ambientLight);

        // Directional Sunlight for outdoors (Town) matching Godot _sunLight
        this.sunLight = new THREE.DirectionalLight(0xb3ccfa, 0.95);
        this.sunLight.position.set(-20, 35, 15);
        this.scene.add(this.sunLight);

        // Player Torch PointLight - ATTACHED TO CAMERA (Matches Godot OmniAttenuation = 0.70f)
        this.torchLight = new THREE.PointLight(0xffdc99, 1.8, 16.0, 0.7);
        this.torchLight.position.set(-0.25, -0.05, -0.28);
        this.camera.add(this.torchLight);

        // Living Torch Colors (smooth thermodynamic color shifting between gold and warm ember)
        this.torchBaseColor = new THREE.Color(0xffdc99);
        this.torchLowColor = new THREE.Color(0xffaa55);

        // Secondary warm bounce fill light near player feet - ATTACHED TO CAMERA
        this.torchFillLight = new THREE.PointLight(0xff7722, 0.35, 8.0, 0.7);
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
            const currentTier = (window.DeviceProfile && typeof window.DeviceProfile.getTier === 'function')
                ? window.DeviceProfile.getTier()
                : 'desktop';
            const newDprCap = currentTier === 'phone' ? 1.25 : (currentTier === 'tablet' ? 1.5 : 2.0);
            const newFar = currentTier === 'phone' ? 85 : (currentTier === 'tablet' ? 110 : 140);

            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.far = newFar;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, newDprCap));
        });
    }

    markShadowsDirty() {
        if (this.renderer && this.renderer.shadowMap) {
            this.renderer.shadowMap.needsUpdate = true;
        }
    }

    getBiomeProfile(depth, levelSeed = 0, realm = 'angband') {
        const r = (realm || this.realm || 'angband').toLowerCase();
        const useVar = (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.biomeVariation) && (levelSeed !== 0);
        const sub = useVar ? (((levelSeed ^ ((depth * 2654435761) >>> 0)) >>> 0) % 4) : 0;

        if (depth <= 0) {
            if (r === 'hengband') {
                const names = ['Eastern Overworld (Mount Fuji Foothills)', 'Eastern Overworld (Bamboo Forest Glade)', 'Eastern Overworld (Jingu Shrine Valley)', 'Eastern Overworld (Ancient Pine Sanctuary)'];
                return {
                    name: names[sub],
                    bgColor: 0x141e33,
                    ambientColor: 0x948aa3,
                    ambientEnergy: 0.85,
                    sunLight: true,
                    sunEnergy: 1.05,
                    fogColor: 0x141e33,
                    fogDensity: 0.0035,
                    exposure: 1.08,
                    torchColor: 0xffe099,
                    torchEnergy: 2.2,
                    wallColor: new THREE.Color(0.85, 0.85, 0.88),
                    floorColor: new THREE.Color(0.80, 0.78, 0.76),
                    ceilingColor: new THREE.Color(0.70, 0.70, 0.75),
                    floorRoughness: 0.82,
                    wallRoughness: 0.80
                };
            }
            if (r === 'frogcomposband') {
                const names = ['Wilderness Overworld (Verdant Meadow)', 'Wilderness Overworld (Whispering Woods)', 'Wilderness Overworld (Highland Moors)', 'Wilderness Overworld (Sunlit Dale)'];
                return {
                    name: names[sub],
                    bgColor: 0x0f1933,
                    ambientColor: 0x8f9eb8,
                    ambientEnergy: 0.88,
                    sunLight: true,
                    sunEnergy: 1.10,
                    fogColor: 0x0f1933,
                    fogDensity: 0.003,
                    exposure: 1.06,
                    torchColor: 0xffe0a6,
                    torchEnergy: 2.2,
                    wallColor: new THREE.Color(0.88, 0.86, 0.82),
                    floorColor: new THREE.Color(0.82, 0.80, 0.78),
                    ceilingColor: new THREE.Color(0.70, 0.70, 0.75),
                    floorRoughness: 0.84,
                    wallRoughness: 0.82
                };
            }
            return {
                name: 'Town & Overworld',
                bgColor: 0x141e38,
                ambientColor: 0x808aa8,
                ambientEnergy: 0.75,
                sunLight: true,
                sunEnergy: 0.95,
                fogColor: 0x141e38,
                fogDensity: 0.004,
                exposure: 1.05,
                torchColor: 0xffdc99,
                torchEnergy: 1.8,
                wallColor: new THREE.Color(0.88, 0.88, 0.88),
                floorColor: new THREE.Color(0.84, 0.82, 0.80),
                ceilingColor: new THREE.Color(0.70, 0.70, 0.75),
                floorRoughness: 0.84,
                wallRoughness: 0.82
            };
        }

        // Sil-Q First Age Beleriand - The Iron Pits of Angband beneath Thangorodrim
        if (r === 'silq') {
            if (depth <= 5) {
                // 50ft – 250ft: Iron Pits (Gates of Slag & Ash Galleries)
                const names = ['Iron Pits (Gates of Slag)', 'Iron Pits (Ash-Stained Delvings)', 'Iron Pits (Smoky Galleries)', 'Iron Pits (Orc Barracks)'];
                const wcs = [[0.55, 0.54, 0.56], [0.50, 0.50, 0.54], [0.58, 0.52, 0.50], [0.52, 0.52, 0.55]];
                const fcs = [[0.46, 0.44, 0.48], [0.42, 0.42, 0.46], [0.48, 0.44, 0.42], [0.44, 0.44, 0.46]];
                const ccs = [[0.38, 0.36, 0.40], [0.34, 0.34, 0.38], [0.40, 0.36, 0.34], [0.36, 0.36, 0.38]];
                return {
                    name: names[sub],
                    bgColor: 0x030304,
                    ambientColor: 0x33333d,
                    ambientEnergy: 0.25,
                    sunLight: false,
                    sunEnergy: 0.0,
                    fogColor: 0x030304,
                    fogDensity: 0.016,
                    exposure: 1.15,
                    torchColor: 0xf5dcb0,
                    torchEnergy: 2.4,
                    wallColor: new THREE.Color(...wcs[sub]),
                    floorColor: new THREE.Color(...fcs[sub]),
                    ceilingColor: new THREE.Color(...ccs[sub]),
                    floorRoughness: 0.88,
                    wallRoughness: 0.85
                };
            }
            if (depth <= 10) {
                // 300ft – 500ft: Morgoth's Armouries (Furnace Deeps & Dark Foundries)
                const names = ["Morgoth's Armouries (Furnace Deep)", "Morgoth's Armouries (Dark Foundries)", "Morgoth's Armouries (Soot Vaults)", "Morgoth's Armouries (Iron Cisterns)"];
                const wcs = [[0.60, 0.50, 0.46], [0.55, 0.48, 0.44], [0.62, 0.52, 0.45], [0.54, 0.50, 0.48]];
                const fcs = [[0.50, 0.42, 0.38], [0.46, 0.40, 0.36], [0.52, 0.44, 0.38], [0.45, 0.42, 0.40]];
                const ccs = [[0.40, 0.34, 0.30], [0.36, 0.32, 0.28], [0.42, 0.35, 0.30], [0.38, 0.34, 0.32]];
                return {
                    name: names[sub],
                    bgColor: 0x040202,
                    ambientColor: 0x523326,
                    ambientEnergy: 0.28,
                    sunLight: false,
                    sunEnergy: 0.0,
                    fogColor: 0x040202,
                    fogDensity: 0.018,
                    exposure: 1.18,
                    torchColor: 0xffcc8c,
                    torchEnergy: 2.6,
                    wallColor: new THREE.Color(...wcs[sub]),
                    floorColor: new THREE.Color(...fcs[sub]),
                    ceilingColor: new THREE.Color(...ccs[sub]),
                    floorRoughness: 0.85,
                    wallRoughness: 0.82
                };
            }
            if (depth <= 15) {
                // 550ft – 750ft: Deep Torment (Barrows of Thangorodrim & Balrog Halls)
                const names = ["Deep Torment (Barrows of Thangorodrim)", "Deep Torment (Balrog Halls)", "Deep Torment (Dragon Kennels)", "Deep Torment (Dungeon of Shackles)"];
                const wcs = [[0.46, 0.44, 0.50], [0.42, 0.40, 0.46], [0.48, 0.42, 0.48], [0.40, 0.42, 0.45]];
                const fcs = [[0.38, 0.36, 0.42], [0.35, 0.34, 0.40], [0.40, 0.35, 0.40], [0.34, 0.36, 0.38]];
                const ccs = [[0.30, 0.28, 0.34], [0.28, 0.26, 0.32], [0.32, 0.28, 0.32], [0.28, 0.28, 0.30]];
                return {
                    name: names[sub],
                    bgColor: 0x030204,
                    ambientColor: 0x382e47,
                    ambientEnergy: 0.24,
                    sunLight: false,
                    sunEnergy: 0.0,
                    fogColor: 0x030204,
                    fogDensity: 0.018,
                    exposure: 1.16,
                    torchColor: 0xebd6b8,
                    torchEnergy: 2.4,
                    wallColor: new THREE.Color(...wcs[sub]),
                    floorColor: new THREE.Color(...fcs[sub]),
                    ceilingColor: new THREE.Color(...ccs[sub]),
                    floorRoughness: 0.80,
                    wallRoughness: 0.82
                };
            }
            // 800ft – 1000ft: Citadel of the Iron Crown (Morgoth's Throne Room at 1000ft / Level 20)
            const silqEndNames = ["Citadel of the Iron Crown (Throne of Morgoth)", "Citadel of the Iron Crown (The Iron Pit)", "Citadel of the Iron Crown (Abyss of Thangorodrim)", "Citadel of the Iron Crown (Vault of the Silmarils)"];
            return {
                name: silqEndNames[sub],
                bgColor: 0x040205,
                ambientColor: 0x3d1f47,
                ambientEnergy: 0.26,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: 0x040205,
                fogDensity: 0.018,
                exposure: 1.20,
                torchColor: 0xebe0f5,
                torchEnergy: 2.4,
                wallColor: new THREE.Color(0.34, 0.34, 0.38), // Pitch-black volcanic basalt and obsidian of Thangorodrim
                floorColor: new THREE.Color(0.28, 0.26, 0.30),
                ceilingColor: new THREE.Color(0.22, 0.21, 0.24),
                floorRoughness: 0.35, // Smooth polished obsidian
                wallRoughness: 0.70
            };
        }

        // Progressive 4-Level Depth Chapters: Every ~200 ft brings a distinct, palpable visual transformation
        if (depth <= 4) {
            // Chapter 1: Upper Crypts (Levels 1–4 / 50–200 ft) - Ashlar stone, dry vaults, cold slate mist
            const subThemes = [
                { name: 'Upper Crypts (Ashlar Sepulchre)', wc: [0.84, 0.84, 0.86], fc: [0.76, 0.76, 0.78], cc: [0.62, 0.62, 0.66], fr: 0.82, wr: 0.82, tc: 0xffdc99, fog: 0x10141a, amb: 0x626880 },
                { name: 'Upper Crypts (Cold Slate Barrow)', wc: [0.78, 0.80, 0.86], fc: [0.70, 0.72, 0.78], cc: [0.56, 0.58, 0.65], fr: 0.80, wr: 0.84, tc: 0xffd890, fog: 0x0e121c, amb: 0x586078 },
                { name: 'Upper Crypts (Dry Granite Vault)', wc: [0.86, 0.84, 0.82], fc: [0.78, 0.76, 0.74], cc: [0.65, 0.63, 0.60], fr: 0.84, wr: 0.86, tc: 0xffdca0, fog: 0x141212, amb: 0x686460 },
                { name: 'Upper Crypts (Cobblestone Undercroft)', wc: [0.80, 0.82, 0.80], fc: [0.72, 0.74, 0.72], cc: [0.60, 0.62, 0.60], fr: 0.78, wr: 0.82, tc: 0xffd485, fog: 0x101412, amb: 0x606660 }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x06080c,
                ambientColor: t.amb,
                ambientEnergy: 0.38,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.012,
                exposure: 1.16,
                torchColor: t.tc,
                torchEnergy: 2.6,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 8) {
            // Chapter 2: Flooded Undercrofts (Levels 5–8 / 250–400 ft) - Wet slate, reflective water floors (roughness 0.44), damp aquamarine mist
            const subThemes = [
                { name: 'Flooded Undercroft (Sunken Cistern)', wc: [0.64, 0.72, 0.84], fc: [0.52, 0.62, 0.76], cc: [0.46, 0.54, 0.66], fr: 0.44, wr: 0.72, tc: 0xffd485, fog: 0x0c1622, amb: 0x485c7a },
                { name: 'Flooded Undercroft (Wet Slate Crypt)', wc: [0.68, 0.74, 0.86], fc: [0.56, 0.64, 0.78], cc: [0.50, 0.56, 0.68], fr: 0.46, wr: 0.74, tc: 0xffd690, fog: 0x0e1826, amb: 0x4c6080 },
                { name: 'Flooded Undercroft (Algae Dripway)', wc: [0.62, 0.76, 0.80], fc: [0.50, 0.65, 0.72], cc: [0.44, 0.56, 0.62], fr: 0.42, wr: 0.70, tc: 0xf4df94, fog: 0x0a1820, amb: 0x44626e },
                { name: 'Flooded Undercroft (Drowned Sarcophagi)', wc: [0.66, 0.70, 0.82], fc: [0.54, 0.60, 0.74], cc: [0.48, 0.52, 0.64], fr: 0.45, wr: 0.75, tc: 0xffcc80, fog: 0x0d1420, amb: 0x4a5874 }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x040810,
                ambientColor: t.amb,
                ambientEnergy: 0.34,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.014,
                exposure: 1.18,
                torchColor: t.tc,
                torchEnergy: 2.8,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 12) {
            // Chapter 3: Deep Sepulchre & Ancient Tombs (Levels 9–12 / 450–600 ft) - Ancient sandstone, dusty sarcophagi, violet-black shadow fog, deep amber flame
            const subThemes = [
                { name: 'Deep Sepulchre (Sandstone Necropolis)', wc: [0.90, 0.78, 0.60], fc: [0.78, 0.68, 0.50], cc: [0.62, 0.52, 0.38], fr: 0.88, wr: 0.88, tc: 0xffc060, fog: 0x180e1e, amb: 0x6e5242 },
                { name: 'Deep Sepulchre (Dusty Crypt of Kings)', wc: [0.86, 0.74, 0.64], fc: [0.75, 0.64, 0.54], cc: [0.58, 0.48, 0.40], fr: 0.86, wr: 0.86, tc: 0xffb866, fog: 0x160c1c, amb: 0x684c44 },
                { name: 'Deep Sepulchre (Ancestral Sarcophagi)', wc: [0.84, 0.76, 0.68], fc: [0.72, 0.65, 0.58], cc: [0.56, 0.50, 0.44], fr: 0.85, wr: 0.85, tc: 0xffba70, fog: 0x1a1020, amb: 0x645048 },
                { name: 'Deep Sepulchre (Cinder Vault)', wc: [0.88, 0.72, 0.58], fc: [0.76, 0.62, 0.48], cc: [0.60, 0.48, 0.36], fr: 0.88, wr: 0.88, tc: 0xffb258, fog: 0x180a18, amb: 0x6a483e }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x08040a,
                ambientColor: t.amb,
                ambientEnergy: 0.32,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.014,
                exposure: 1.18,
                torchColor: t.tc,
                torchEnergy: 2.8,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 16) {
            // Chapter 4: Overgrown Catacombs (Levels 13–16 / 650–800 ft) - Verdant lichen, fungal spores, emerald mist
            const subThemes = [
                { name: 'Overgrown Catacombs (Emerald Sanctuary)', wc: [0.60, 0.85, 0.58], fc: [0.50, 0.75, 0.48], cc: [0.42, 0.62, 0.40], fr: 0.60, wr: 0.78, tc: 0xf5dda0, fog: 0x0c1e10, amb: 0x3e6844 },
                { name: 'Overgrown Catacombs (Lichen Hollows)', wc: [0.64, 0.82, 0.65], fc: [0.54, 0.72, 0.55], cc: [0.45, 0.60, 0.46], fr: 0.62, wr: 0.80, tc: 0xf8e0a4, fog: 0x0e1c12, amb: 0x426448 },
                { name: 'Overgrown Catacombs (Spore Barrow)', wc: [0.58, 0.86, 0.62], fc: [0.48, 0.76, 0.52], cc: [0.40, 0.64, 0.44], fr: 0.58, wr: 0.76, tc: 0xf2dea8, fog: 0x0a2012, amb: 0x3a6a48 },
                { name: 'Overgrown Catacombs (Peat Brambles)', wc: [0.68, 0.80, 0.56], fc: [0.58, 0.70, 0.46], cc: [0.48, 0.58, 0.38], fr: 0.64, wr: 0.82, tc: 0xf6d892, fog: 0x101a0e, amb: 0x485e3c }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x030604,
                ambientColor: t.amb,
                ambientEnergy: 0.30,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.015,
                exposure: 1.18,
                torchColor: t.tc,
                torchEnergy: 2.7,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 20) {
            // Chapter 5: Chasm Threshold (Levels 17–20 / 850–1000 ft) - Rough ironstone, deep echoes, dark charcoal fog
            const subThemes = [
                { name: 'Chasm Threshold (Ironstone Vaults)', wc: [0.74, 0.70, 0.76], fc: [0.64, 0.60, 0.66], cc: [0.50, 0.46, 0.52], fr: 0.75, wr: 0.80, tc: 0xffd078, fog: 0x121014, amb: 0x544e58 },
                { name: 'Chasm Threshold (Deep Echo)', wc: [0.70, 0.68, 0.74], fc: [0.60, 0.58, 0.64], cc: [0.48, 0.45, 0.50], fr: 0.76, wr: 0.82, tc: 0xffc870, fog: 0x100e12, amb: 0x504a54 },
                { name: 'Chasm Threshold (Basalt Ledge)', wc: [0.72, 0.72, 0.74], fc: [0.62, 0.62, 0.64], cc: [0.50, 0.50, 0.52], fr: 0.74, wr: 0.78, tc: 0xffcc75, fog: 0x121214, amb: 0x525256 },
                { name: 'Chasm Threshold (Shadow Pit)', wc: [0.68, 0.65, 0.72], fc: [0.58, 0.55, 0.62], cc: [0.46, 0.42, 0.48], fr: 0.72, wr: 0.84, tc: 0xffc268, fog: 0x0e0c10, amb: 0x4c4650 }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x040406,
                ambientColor: t.amb,
                ambientEnergy: 0.32,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.015,
                exposure: 1.18,
                torchColor: t.tc,
                torchEnergy: 2.9,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 35) {
            // Chapter 6: Crystal Caverns (Levels 21–35 / 1050–1750 ft) - Luminous quartz, beryl, amethyst geode
            const subThemes = [
                { name: 'Crystal Caverns (Sapphire Quartz)', wc: [0.68, 0.80, 0.96], fc: [0.58, 0.70, 0.90], cc: [0.45, 0.55, 0.75], fr: 0.50, wr: 0.68, tc: 0xfadc7b, fog: 0x081224, amb: 0x425c85 },
                { name: 'Crystal Caverns (Amethyst Geode)', wc: [0.76, 0.68, 0.94], fc: [0.68, 0.60, 0.86], cc: [0.56, 0.48, 0.72], fr: 0.48, wr: 0.68, tc: 0xf4d08c, fog: 0x0e081c, amb: 0x544078 },
                { name: 'Crystal Caverns (Beryl Depths)', wc: [0.62, 0.84, 0.88], fc: [0.54, 0.75, 0.80], cc: [0.44, 0.62, 0.68], fr: 0.52, wr: 0.72, tc: 0xf8e090, fog: 0x06141c, amb: 0x365868 },
                { name: 'Crystal Caverns (Prismatic Seam)', wc: [0.80, 0.76, 0.84], fc: [0.72, 0.68, 0.76], cc: [0.58, 0.54, 0.62], fr: 0.50, wr: 0.74, tc: 0xfad880, fog: 0x0c0e14, amb: 0x4c4a56 }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x030408,
                ambientColor: t.amb,
                ambientEnergy: 0.32,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.015,
                exposure: 1.20,
                torchColor: t.tc,
                torchEnergy: 2.8,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 60) {
            // Chapter 7: Deep Nether Mines (Levels 36–60 / 1800–3000 ft) - Pyrite, amethyst, deep mineral chill
            const subThemes = [
                { name: 'Deep Nether Mines (Pyrite Seam)', wc: [0.82, 0.76, 0.62], fc: [0.72, 0.66, 0.52], cc: [0.58, 0.52, 0.40], fr: 0.60, wr: 0.75, tc: 0xffd880, fog: 0x14100c, amb: 0x584e3c },
                { name: 'Deep Nether Mines (Amethyst Vaults)', wc: [0.78, 0.65, 0.92], fc: [0.68, 0.55, 0.84], cc: [0.52, 0.42, 0.68], fr: 0.54, wr: 0.72, tc: 0xf4cf8c, fog: 0x14081e, amb: 0x523868 },
                { name: 'Deep Nether Mines (Obsidian Seam)', wc: [0.64, 0.60, 0.68], fc: [0.54, 0.50, 0.58], cc: [0.42, 0.38, 0.46], fr: 0.42, wr: 0.65, tc: 0xf6d490, fog: 0x0c0810, amb: 0x443a4e },
                { name: 'Deep Nether Mines (Brimstone Cavern)', wc: [0.85, 0.75, 0.58], fc: [0.75, 0.65, 0.48], cc: [0.60, 0.50, 0.36], fr: 0.70, wr: 0.78, tc: 0xffcc70, fog: 0x161208, amb: 0x5a4830 }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x040306,
                ambientColor: t.amb,
                ambientEnergy: 0.32,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.015,
                exposure: 1.20,
                torchColor: t.tc,
                torchEnergy: 2.8,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        if (depth <= 85) {
            // Chapter 8: Magma Underworld (Levels 61–85 / 3050–4250 ft) - Basalt obsidian, volcanic ash, glowing fissures
            const subThemes = [
                { name: 'Magma Underworld (Basalt Crucible)', wc: [0.90, 0.70, 0.60], fc: [0.78, 0.58, 0.48], cc: [0.60, 0.42, 0.35], fr: 0.68, wr: 0.80, tc: 0xffc070, fog: 0x1e0a04, amb: 0x7a4024 },
                { name: 'Magma Underworld (Obsidian Abyss)', wc: [0.65, 0.58, 0.62], fc: [0.55, 0.48, 0.52], cc: [0.42, 0.36, 0.40], fr: 0.35, wr: 0.60, tc: 0xffbf78, fog: 0x100404, amb: 0x5a3020 },
                { name: 'Magma Underworld (Brimstone Wastes)', wc: [0.92, 0.80, 0.58], fc: [0.82, 0.70, 0.50], cc: [0.65, 0.55, 0.38], fr: 0.80, wr: 0.84, tc: 0xffc86a, fog: 0x1c0e04, amb: 0x7c4e20 },
                { name: 'Magma Underworld (White-Hot Core)', wc: [0.96, 0.68, 0.54], fc: [0.86, 0.58, 0.46], cc: [0.68, 0.44, 0.34], fr: 0.65, wr: 0.78, tc: 0xffda9a, fog: 0x220c04, amb: 0x8c4424 }
            ];
            const t = subThemes[sub];
            return {
                name: t.name,
                bgColor: 0x080302,
                ambientColor: t.amb,
                ambientEnergy: 0.36,
                sunLight: false,
                sunEnergy: 0.0,
                fogColor: t.fog,
                fogDensity: 0.016,
                exposure: 1.22,
                torchColor: t.tc,
                torchEnergy: 3.2,
                wallColor: new THREE.Color(...t.wc),
                floorColor: new THREE.Color(...t.fc),
                ceilingColor: new THREE.Color(...t.cc),
                floorRoughness: t.fr,
                wallRoughness: t.wr
            };
        }
        // Chapter 9: The Abyssal Citadel of Morgoth (Levels 86–100 / 4300–5000 ft) - Blood-iron, nether void, eerie crimson mist
        const subThemes = [
            { name: 'Abyssal Throne (Void Citadel)', wc: [0.72, 0.55, 0.78], fc: [0.62, 0.45, 0.68], cc: [0.46, 0.32, 0.52], fr: 0.45, wr: 0.70, tc: 0xe8c8f0, fog: 0x140418, amb: 0x613370 },
            { name: 'Abyssal Throne (Necrotic Pit)', wc: [0.68, 0.68, 0.72], fc: [0.60, 0.60, 0.64], cc: [0.45, 0.45, 0.50], fr: 0.75, wr: 0.82, tc: 0xe8d0b5, fog: 0x08060a, amb: 0x484252 },
            { name: 'Abyssal Throne (Blood-Iron Vaults)', wc: [0.85, 0.54, 0.64], fc: [0.75, 0.46, 0.56], cc: [0.55, 0.32, 0.42], fr: 0.55, wr: 0.76, tc: 0xf5cbb0, fog: 0x180408, amb: 0x6c2c42 },
            { name: 'Abyssal Throne (Nether Core)', wc: [0.60, 0.65, 0.88], fc: [0.52, 0.56, 0.78], cc: [0.40, 0.44, 0.62], fr: 0.38, wr: 0.65, tc: 0xe0d4f5, fog: 0x06040e, amb: 0x403666 }
        ];
        const t = subThemes[sub];
        return {
            name: t.name,
            bgColor: 0x060208,
            ambientColor: t.amb,
            ambientEnergy: 0.30,
            sunLight: false,
            sunEnergy: 0.0,
            fogColor: t.fog,
            fogDensity: 0.016,
            exposure: 1.22,
            torchColor: t.tc,
            torchEnergy: 2.6,
            wallColor: new THREE.Color(...t.wc),
            floorColor: new THREE.Color(...t.fc),
            ceilingColor: new THREE.Color(...t.cc),
            floorRoughness: t.fr,
            wallRoughness: t.wr
        };
    }

    initTextures() {
        const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
        this.contextualTextureCache = new Map();
        this._currentThemeId = null;

        // 1. Instant Procedural Textures (Exact Godot DungeonWorld Parity fallback)
        this.wallTex = procCreateStoneWallTexture();
        this.wallNormal = procCreateStoneWallNormal();
        this.floorTex = procCreateFloorTexture();
        this.floorNormal = procCreateFloorNormal();
        this.ceilingTex = procCreateCeilingTexture();
        this.doorTex = procCreateWoodDoorTexture();
        this.storeTex = procCreateStoreTexture();
        this.magmaTex = procCreateMagmaTexture();
        this.magmaEmission = procCreateMagmaEmission();
        this.quartzTex = procCreateQuartzTexture();
        this.goldVeinTex = procCreateGoldVeinTexture();
        this.goldVeinEmission = procCreateGoldVeinEmission();
        this.gemVeinTex = procCreateGemVeinTexture();
        this.gemVeinEmission = procCreateGemVeinEmission();
        this.grassTex = procCreateGrassTexture();
        this.grassNormal = procCreateGrassNormal();
        this.dirtTex = procCreateDirtTexture();
        this.waterTex = procCreateWaterTexture();
        this.deepWaterTex = procCreateDeepWaterTexture();
        this.treeLeavesTex = procCreateTreeLeavesTexture();
        this.treeLeavesNormal = procCreateTreeLeavesNormal();
        this.treeBarkTex = procCreateTreeBarkTexture();
        this.treeBarkNormal = procCreateTreeBarkNormal();
        this.permWallTex = procCreatePermWallTexture();
        this.permWallNormal = procCreatePermWallNormal();
        this.shadowTex = procCreateShadowTexture();

        // Procedural Creature Normal Maps (eliminates flat untextured models)
        this.organicNormal = procCreateOrganicNormal();
        this.scaleNormal = procCreateScaleNormal();
        this.chitinNormal = procCreateChitinNormal();
        this.furNormal = procCreateFurNormal();

        // Materials with Authentic PBR Settings matching Godot StandardMaterial3D
        this.wallMaterial = new THREE.MeshStandardMaterial({
            map: this.wallTex,
            normalMap: this.wallNormal,
            normalScale: new THREE.Vector2(1.35, 1.35),
            roughness: 0.82,
            metalness: 0.02,
            vertexColors: true
        });
        this._applyWorldSpaceOrganicShader(this.wallMaterial, 'wall');

        this.floorMaterial = new THREE.MeshStandardMaterial({
            map: this.floorTex,
            normalMap: this.floorNormal,
            normalScale: new THREE.Vector2(1.25, 1.25),
            roughness: 0.72,
            metalness: 0.04,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        this._applyWorldSpaceOrganicShader(this.floorMaterial, 'floor');

        this.ceilingMaterial = new THREE.MeshStandardMaterial({
            map: this.ceilingTex,
            normalScale: new THREE.Vector2(1.35, 1.35),
            roughness: 0.95,
            metalness: 0.0,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        this._applyWorldSpaceOrganicShader(this.ceilingMaterial, 'ceiling');

        this.doorMaterial = new THREE.MeshStandardMaterial({
            map: this.doorTex,
            normalScale: new THREE.Vector2(0.80, 0.80),
            roughness: 0.75,
            metalness: 0.10
        });

        this.storeMaterial = new THREE.MeshStandardMaterial({
            map: this.storeTex,
            roughness: 0.85,
            metalness: 0.02
        });

        // 8 Shop Entrance Doors with Heraldic Shield & Gold Number Plaque
        this.shopDoorMaterials = [];
        for (let i = 0; i < 8; i++) {
            const shopNum = i + 1;
            const shopTex = procCreateShopDoorTexture(shopNum, procStoreColor(shopNum));
            this.shopDoorMaterials.push(new THREE.MeshStandardMaterial({
                map: shopTex,
                roughness: 0.70,
                metalness: 0.15
            }));
        }

        // Magma Fissures (Incandescent emission)
        this.magmaMaterial = new THREE.MeshStandardMaterial({
            map: this.magmaTex,
            emissiveMap: this.magmaEmission,
            emissive: new THREE.Color(0xff4400),
            emissiveIntensity: 2.2,
            roughness: 0.70,
            metalness: 0.04,
            vertexColors: true
        });

        // Quartz Veins (Glinting crystal)
        this.quartzMaterial = new THREE.MeshStandardMaterial({
            map: this.quartzTex,
            roughness: 0.50,
            metalness: 0.10,
            vertexColors: true
        });

        // Magma Vein with Gold Treasure (feat 19: MAGMA_K) - Rich metallic gold nuggets in dark basalt
        this.goldVeinMaterial = new THREE.MeshStandardMaterial({
            map: this.goldVeinTex,
            emissiveMap: this.goldVeinEmission,
            emissive: new THREE.Color(0xffaa22),
            emissiveIntensity: 1.6,
            roughness: 0.32,
            metalness: 0.88,
            vertexColors: true
        });

        // Quartz Vein with Gemstones (feat 20: QUARTZ_K) - Faceted sparkling emeralds, rubies, sapphires
        this.gemVeinMaterial = new THREE.MeshStandardMaterial({
            map: this.gemVeinTex,
            emissiveMap: this.gemVeinEmission,
            emissive: new THREE.Color(0x33eebb),
            emissiveIntensity: 1.8,
            roughness: 0.22,
            metalness: 0.18,
            vertexColors: true
        });

        // Verdant Outdoor Grass / Meadow (feat 26: GRASS)
        this.grassMaterial = new THREE.MeshStandardMaterial({
            map: this.grassTex,
            normalMap: this.grassNormal,
            normalScale: new THREE.Vector2(1.20, 1.20),
            roughness: 0.88,
            metalness: 0.0,
            side: THREE.DoubleSide,
            vertexColors: true
        });

        // Packed Dirt / Earthen Road (feat 27: DIRT)
        this.dirtMaterial = new THREE.MeshStandardMaterial({
            map: this.dirtTex,
            roughness: 0.88,
            metalness: 0.0,
            side: THREE.DoubleSide,
            vertexColors: true
        });

        // Shallow Sparkling Water (feat 28: SHALLOW_WATER)
        this.waterMaterial = new THREE.MeshStandardMaterial({
            map: this.waterTex,
            roughness: 0.12,
            metalness: 0.15,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.86,
            vertexColors: true
        });

        // Deep Oceanic Water (feat 29: DEEP_WATER)
        this.deepWaterMaterial = new THREE.MeshStandardMaterial({
            map: this.deepWaterTex,
            roughness: 0.16,
            metalness: 0.18,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.94,
            vertexColors: true
        });

        // Alpine Mountain Peaks (feat 30: MOUNTAIN)
        this.mountainMaterial = new THREE.MeshStandardMaterial({
            map: this.wallTex,
            normalMap: this.wallNormal,
            roughness: 0.92,
            metalness: 0.04,
            vertexColors: true
        });

        // Photogrammetry Boulders / Rubble (feat 16: RUBBLE)
        this.rubbleMaterial = new THREE.MeshStandardMaterial({
            map: this.wallTex,
            normalMap: this.wallNormal,
            roughness: 0.88,
            metalness: 0.04,
            vertexColors: true
        });

        // Swamp & Wetland Marsh (feat 31: SWAMP)
        this.swampMaterial = new THREE.MeshStandardMaterial({
            map: this.dirtTex,
            roughness: 0.40,
            metalness: 0.08,
            side: THREE.DoubleSide,
            vertexColors: true
        });

        // Forest Trees (feat 25: TREE) - Foliage canopy with organic bark trunk
        this.treeTrunkMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.treeBarkTex,
            normalMap: this.treeBarkNormal,
            normalScale: new THREE.Vector2(1.40, 1.40),
            roughness: 0.90,
            metalness: 0.02,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        this.treeTrunkMaterial = this.treeTrunkMat;

        this.treeLeavesMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.treeLeavesTex,
            normalMap: this.treeLeavesNormal,
            normalScale: new THREE.Vector2(1.35, 1.35),
            roughness: 0.68,
            metalness: 0.02,
            alphaTest: 0.35,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        this.treeMaterial = this.treeLeavesMat;

        // Incandescent Domain-Warped Molten Lava (feat 23) & Cooled Basalt
        this.lavaTex = procCreateLavaTexture(256, 256);
        this.lavaEmission = procCreateLavaEmission(256, 256);
        this.procCreateLavaTexture = procCreateLavaTexture;
        this.procCreateLavaEmission = procCreateLavaEmission;
        if (this.lavaTex) {
            this.lavaTex.wrapS = THREE.RepeatWrapping;
            this.lavaTex.wrapT = THREE.RepeatWrapping;
            this.lavaTex.repeat.set(2, 2);
        }
        if (this.lavaEmission) {
            this.lavaEmission.wrapS = THREE.RepeatWrapping;
            this.lavaEmission.wrapT = THREE.RepeatWrapping;
            this.lavaEmission.repeat.set(2, 2);
        }

        this.lavaMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.lavaTex,
            emissive: 0xff5500,
            emissiveMap: this.lavaEmission,
            emissiveIntensity: 2.35,
            normalMap: this.townPermWallNormal || this.wallNormal,
            normalScale: new THREE.Vector2(1.50, 1.50),
            roughness: 0.32,
            metalness: 0.08,
            side: THREE.DoubleSide
        });

        this.lavaCooledMaterial = new THREE.MeshStandardMaterial({
            color: 0x55382e,
            map: this.lavaTex,
            emissive: 0xff3300,
            emissiveMap: this.lavaEmission,
            emissiveIntensity: 0.35,
            normalMap: this.townPermWallNormal || this.wallNormal,
            normalScale: new THREE.Vector2(1.40, 1.40),
            roughness: 0.78,
            metalness: 0.12,
            side: THREE.DoubleSide
        });

        this.stairsMaterial = new THREE.MeshStandardMaterial({
            map: this.wallTex,
            normalMap: this.wallNormal,
            roughness: 0.82,
            metalness: 0.04,
            vertexColors: true
        });

        // Cyclopean Permanent Bedrock / Fortress Ramparts (feat 22) - default white so vertex colors illuminate properly
        this.permWallMaterial = new THREE.MeshStandardMaterial({
            map: this.permWallTex,
            normalMap: this.permWallNormal,
            normalScale: new THREE.Vector2(1.35, 1.35),
            roughness: 0.90,
            metalness: 0.05,
            vertexColors: true
        });
        this._applyWorldSpaceOrganicShader(this.permWallMaterial, 'wall');

        // Separate town PBR textures from subterranean dungeon procedural textures
        this.townWallTex = null;
        this.townWallNormal = null;
        this.townWallRoughness = null;
        this.townPermWallTex = null;
        this.townPermWallNormal = null;
        this.townPermWallRoughness = null;
        this.townFloorTex = null;
        this.townFloorNormal = null;
        this.townFloorRoughness = null;

        // Poly Haven CC0 8K-Scanned Photogrammetry PBR Texture Registry
        this.polyHavenSets = new Map();
        this.polyhavenSets = this.polyHavenSets;
        const loader = new THREE.TextureLoader();

        this.loadPolyHavenSet = (id, repX = 1, repY = 1, onReady = null) => {
            if (this.polyHavenSets.has(id)) {
                const existing = this.polyHavenSets.get(id);
                if (onReady && existing.diff) onReady(existing);
                return existing;
            }
            const entry = { id, diff: null, nor: null, arm: null };
            this.polyHavenSets.set(id, entry);
            const base = `/assets/polyhaven/textures/${id}`;
            const cfgTex = (tex, isSRGB) => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repX, repY);
                if (isSRGB && typeof THREE.sRGBEncoding !== 'undefined') tex.encoding = THREE.sRGBEncoding;
                tex.anisotropy = Math.min(4, maxAniso || 1);
            };
            const notify = () => {
                if (onReady) onReady(entry);
                this._currentThemeId = null;
                this._currentTexturesAreOutdoors = null;
                this._lastTerrainSig = null;
                const isOut = (this.lastDepth === 0 || this.lastDepth === null || this.lastDepth === undefined);
                this.applyEnvironmentTextures(isOut, this.currentBiome, this.realm || 'angband', this.lastDepth || 0, this.levelSeed || 0);
            };
            loader.load(`${base}/diff.jpg`, (tex) => { cfgTex(tex, true); entry.diff = tex; notify(); }, undefined, () => {});
            loader.load(`${base}/nor_gl.jpg`, (tex) => { cfgTex(tex, false); entry.nor = tex; notify(); }, undefined, () => {});
            loader.load(`${base}/arm.jpg`, (tex) => { cfgTex(tex, false); entry.arm = tex; notify(); }, undefined, () => {});
            return entry;
        };

        // 13 Poly Haven 2K Photogrammetry PBR Texture Sets
        // Town walls
        this.loadPolyHavenSet('castle_brick_broken_06', 2, 3, (e) => {
            this.townWallTex = e.diff || this.townWallTex;
            this.townWallNormal = e.nor || this.townWallNormal;
            this.townWallRoughness = e.arm || this.townWallRoughness;
        });

        // Town cobblestone floors
        this.loadPolyHavenSet('cobblestone_floor_08', 2, 2, (e) => {
            this.townFloorTex = e.diff || this.townFloorTex;
            this.townFloorNormal = e.nor || this.townFloorNormal;
            this.townFloorRoughness = e.arm || this.townFloorRoughness;
        });

        // Permanent bedrock & fortress ramparts + ceiling
        this.loadPolyHavenSet('medieval_blocks_05', 2, 3, (e) => {
            this.townPermWallTex = e.diff || this.townPermWallTex;
            this.townPermWallNormal = e.nor || this.townPermWallNormal;
            this.townPermWallRoughness = e.arm || this.townPermWallRoughness;
        });

        // Doors
        this.loadPolyHavenSet('bark_willow_02', 1, 1, (e) => {
            if (this.doorMaterial) {
                if (e.diff) this.doorMaterial.map = e.diff;
                if (e.nor) this.doorMaterial.normalMap = e.nor;
                if (e.arm) this.doorMaterial.roughnessMap = e.arm;
                this.doorMaterial.needsUpdate = true;
            }
            if (this.treeTrunkMaterial && !this._hasPolyHavenTreeTex) {
                if (e.diff) this.treeTrunkMaterial.map = e.diff;
                if (e.nor) this.treeTrunkMaterial.normalMap = e.nor;
                this.treeTrunkMaterial.needsUpdate = true;
            }
        });

        // Storefronts
        this.loadPolyHavenSet('plastered_stone_wall', 1, 1, (e) => {
            if (this.storeMaterial) {
                if (e.diff) this.storeMaterial.map = e.diff;
                if (e.nor) this.storeMaterial.normalMap = e.nor;
                if (e.arm) this.storeMaterial.roughnessMap = e.arm;
                this.storeMaterial.needsUpdate = true;
            }
        });

        // Lava crust normal map
        this.loadPolyHavenSet('rock_boulder_cracked', 1, 1, (e) => {
            if (e.nor) {
                if (this.lavaMaterial) {
                    this.lavaMaterial.normalMap = e.nor;
                    this.lavaMaterial.needsUpdate = true;
                }
                if (this.lavaCooledMaterial) {
                    this.lavaCooledMaterial.normalMap = e.nor;
                    this.lavaCooledMaterial.needsUpdate = true;
                }
            }
        });

        // Biome and dungeon sets
        this.loadPolyHavenSet('monastery_stone_floor', 2, 2);
        this.loadPolyHavenSet('rock_wall_10', 2, 3);
        this.loadPolyHavenSet('rock_embedded_floor', 2, 2);
        this.loadPolyHavenSet('cliff_side', 2, 3, (e) => {
            this.townMountainDiff = e.diff || this.townMountainDiff;
            this.townMountainNormal = e.nor || this.townMountainNormal;
            this.townMountainRoughness = e.arm || this.townMountainRoughness;
            if (this.mountainMaterial && !this._hasPolyHavenMountainTex) {
                if (e.diff) this.mountainMaterial.map = e.diff;
                if (e.nor) this.mountainMaterial.normalMap = e.nor;
                this.mountainMaterial.needsUpdate = true;
            }
            if (this.chasmSideMaterial) {
                if (this.townMountainDiff) this.chasmSideMaterial.map = this.townMountainDiff;
                if (this.townMountainNormal) this.chasmSideMaterial.normalMap = this.townMountainNormal;
                if (this.townMountainRoughness) this.chasmSideMaterial.roughnessMap = this.townMountainRoughness;
                this.chasmSideMaterial.needsUpdate = true;
            }
        });
        this.loadPolyHavenSet('japanese_stone_wall', 2, 3);
        this.loadPolyHavenSet('aerial_grass_rock', 2, 2, (e) => {
            if (this.grassMaterial) {
                if (e.diff) this.grassMaterial.map = e.diff;
                if (e.nor) this.grassMaterial.normalMap = e.nor;
                this.grassMaterial.needsUpdate = true;
            }
        });
        this.loadPolyHavenSet('brown_mud_rocks_01', 2, 2, (e) => {
            if (this.dirtMaterial) {
                if (e.diff) this.dirtMaterial.map = e.diff;
                if (e.nor) this.dirtMaterial.normalMap = e.nor;
                this.dirtMaterial.needsUpdate = true;
            }
            if (this.swampMaterial) {
                if (e.diff) this.swampMaterial.map = e.diff;
                if (e.nor) this.swampMaterial.normalMap = e.nor;
                this.swampMaterial.needsUpdate = true;
            }
        });
    }

    _applyWorldSpaceOrganicShader(material, surfaceType = 'wall') {
        if (!material) return;
        material.customProgramCacheKey = () => 'ws35_organic_' + surfaceType;
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vWs35WorldPos;\nvarying vec3 vWs35WorldNormal;`
            );
            const uvExpr = surfaceType === 'wall'
                ? `vec2 wsUv = abs(vWs35WorldNormal.x) > abs(vWs35WorldNormal.z)
                    ? vec2(vWs35WorldPos.z * 0.36, vWs35WorldPos.y * 0.38)
                    : (abs(vWs35WorldNormal.z) > 0.82
                        ? vec2(vWs35WorldPos.x * 0.36, vWs35WorldPos.y * 0.38)
                        : vec2((vWs35WorldPos.x + vWs35WorldPos.z) * 0.34, vWs35WorldPos.y * 0.38));`
                : `vec2 wsUv = vWs35WorldPos.xz * 0.28 + 0.03 * vec2(sin(vWs35WorldPos.z * 0.7), cos(vWs35WorldPos.x * 0.7));`;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>
vec4 ws35Wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  ws35Wp = instanceMatrix * ws35Wp;
#endif
ws35Wp = modelMatrix * ws35Wp;
vWs35WorldPos = ws35Wp.xyz;
vec3 ws35Wn = objectNormal;
#ifdef USE_INSTANCING
  ws35Wn = mat3(instanceMatrix) * ws35Wn;
#endif
vWs35WorldNormal = normalize(mat3(modelMatrix) * ws35Wn);
${uvExpr}
#ifdef USE_UV
  vUv = wsUv;
#endif`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vWs35WorldPos;\nvarying vec3 vWs35WorldNormal;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#include <map_fragment>
float wsMacro1 = sin(vWs35WorldPos.x * 0.55 + cos(vWs35WorldPos.z * 0.48) * 1.6) * cos(vWs35WorldPos.z * 0.52 - sin(vWs35WorldPos.x * 0.43) * 1.4);
float wsMacro2 = sin(vWs35WorldPos.x * 1.35 + vWs35WorldPos.z * 1.15 + vWs35WorldPos.y * 0.9);
float wsShade = 0.94 + 0.08 * wsMacro1 + 0.04 * wsMacro2;
float wsBaseDamp = smoothstep(0.0, 0.55, vWs35WorldPos.y) * (1.0 - 0.14 * smoothstep(2.6, 3.3, vWs35WorldPos.y));
diffuseColor.rgb *= clamp(wsShade * (0.86 + 0.14 * wsBaseDamp), 0.74, 1.12);`
            );
        };
    }

    getContextualTextureSet(theme, outdoors) {
        if (!this.contextualTextureCache) this.contextualTextureCache = new Map();
        const ph = this.polyHavenSets || this.polyhavenSets || new Map();

        let wallPhId = 'medieval_blocks_05';
        let floorPhId = 'monastery_stone_floor';
        let permPhId = 'medieval_blocks_05';
        let ceilPhId = 'rock_wall_10';

        const tid = (theme && theme.id) ? theme.id : 'angband_town';
        const isHeng = (this.realm === 'hengband' || (typeof window !== 'undefined' && window.__activeRealm === 'hengband'));

        if (outdoors) {
            wallPhId = isHeng ? 'japanese_stone_wall' : 'castle_brick_broken_06';
            const isWild = tid.includes('wild') || (this.currentBiome && (this.currentBiome.id === 'wilderness' || this.currentBiome.id === 'grassland'));
            floorPhId = isWild ? 'aerial_grass_rock' : 'cobblestone_floor_08';
            permPhId = 'medieval_blocks_05';
            ceilPhId = 'rock_wall_10';
        } else {
            // Dungeon depths > 0
            if (isHeng || tid.includes('heng') || tid.includes('eastern')) {
                wallPhId = 'japanese_stone_wall';
                floorPhId = 'monastery_stone_floor';
                ceilPhId = 'japanese_stone_wall';
            } else if (tid.includes('chasm') || tid.includes('cliff') || tid.includes('torment') || tid.includes('mountain') || tid.includes('mine') || tid.includes('nether')) {
                wallPhId = 'cliff_side';
                floorPhId = 'rock_embedded_floor';
                ceilPhId = 'cliff_side';
            } else if (tid.includes('abyss') || tid.includes('magma') || tid.includes('inferno') || tid.includes('throne')) {
                wallPhId = 'rock_wall_10';
                floorPhId = 'rock_embedded_floor';
                ceilPhId = 'rock_boulder_cracked';
            } else if (tid.includes('cavern') || tid.includes('slag') || tid.includes('crystal')) {
                wallPhId = 'rock_wall_10';
                floorPhId = 'rock_embedded_floor';
                ceilPhId = 'cliff_side';
            } else if (tid.includes('labyrinth') || tid.includes('sepulchre')) {
                wallPhId = 'medieval_blocks_05';
                floorPhId = 'monastery_stone_floor';
                ceilPhId = 'plastered_stone_wall';
            } else if (tid.includes('swamp') || tid.includes('mud')) {
                wallPhId = 'rock_wall_10';
                floorPhId = 'brown_mud_rocks_01';
                ceilPhId = 'rock_wall_10';
            } else {
                wallPhId = 'medieval_blocks_05';
                floorPhId = 'monastery_stone_floor';
                ceilPhId = 'rock_wall_10';
            }
            permPhId = 'medieval_blocks_05';
        }

        const wSet = ph.get(wallPhId);
        const fSet = ph.get(floorPhId);
        const pSet = ph.get(permPhId);
        const cSet = ph.get(ceilPhId);

        if (wSet && wSet.diff && fSet && fSet.diff) {
            return {
                wallTex: wSet.diff,
                wallNormal: wSet.nor || this.wallNormal,
                wallRoughness: wSet.arm || null,
                floorTex: fSet.diff,
                floorNormal: fSet.nor || this.floorNormal,
                floorRoughness: fSet.arm || null,
                permWallTex: (pSet && pSet.diff) ? pSet.diff : (this.townPermWallTex || this.permWallTex),
                permWallNormal: (pSet && pSet.nor) ? pSet.nor : (this.townPermWallNormal || this.permWallNormal),
                permWallRoughness: (pSet && pSet.arm) ? pSet.arm : (this.townPermWallRoughness || null),
                ceilingTex: (cSet && cSet.diff) ? cSet.diff : this.ceilingTex,
                ceilingNormal: (cSet && cSet.nor) ? cSet.nor : null,
                ceilingRoughness: (cSet && cSet.arm) ? cSet.arm : null
            };
        }

        const cacheKey = theme.id;
        if (this.contextualTextureCache.has(cacheKey)) {
            return this.contextualTextureCache.get(cacheKey);
        }

        const wallTex = procCreateContextualWallTexture(theme, 256);
        const wallNormal = procCreateContextualWallNormal(theme, 256);
        const wallRoughness = procCreateContextualWallRoughness(theme, 256);

        const floorTex = procCreateContextualFloorTexture(theme, 256);
        const floorNormal = procCreateContextualFloorNormal(theme, 256);
        const floorRoughness = procCreateContextualFloorRoughness(theme, 256);

        const permWallTex = procCreateContextualPermWallTexture(theme, 256);
        const permWallNormal = procCreateContextualPermWallNormal(theme, 256);

        const ceilingTex = procCreateContextualCeilingTexture(theme, 256);
        const ceilingNormal = procCreateContextualCeilingNormal(theme, 256);

        const set = {
            wallTex,
            wallNormal,
            wallRoughness,
            floorTex,
            floorNormal,
            floorRoughness,
            permWallTex,
            permWallNormal,
            permWallRoughness: null,
            ceilingTex,
            ceilingNormal
        };

        this.contextualTextureCache.set(cacheKey, set);
        return set;
    }

    applyEnvironmentTextures(outdoors, biome, realm = 'angband', depth = 0, levelSeed = 0) {
        const theme = resolveContextualTheme(realm, depth, levelSeed);
        if (this._currentThemeId === theme.id && this._currentTexturesAreOutdoors === outdoors) return;
        this._currentThemeId = theme.id;
        this._currentTexturesAreOutdoors = outdoors;

        const texSet = this.getContextualTextureSet(theme, outdoors);

        this.wallMaterial.map = texSet.wallTex;
        this.wallMaterial.normalMap = texSet.wallNormal;
        this.wallMaterial.roughnessMap = texSet.wallRoughness || null;
        this.wallMaterial.roughness = theme.wallRoughness || 0.82;
        this.wallMaterial.normalScale.set(1.65, 1.65);
        this.wallMaterial.needsUpdate = true;

        this.floorMaterial.map = texSet.floorTex;
        this.floorMaterial.normalMap = texSet.floorNormal;
        this.floorMaterial.roughnessMap = texSet.floorRoughness || null;
        this.floorMaterial.roughness = theme.floorRoughness || 0.74;
        this.floorMaterial.normalScale.set(1.50, 1.50);
        this.floorMaterial.needsUpdate = true;

        this.permWallMaterial.map = texSet.permWallTex;
        this.permWallMaterial.normalMap = texSet.permWallNormal;
        this.permWallMaterial.roughnessMap = texSet.permWallRoughness || null;
        this.permWallMaterial.normalScale.set(1.65, 1.65);
        this.permWallMaterial.needsUpdate = true;

        this.ceilingMaterial.map = texSet.ceilingTex;
        if (texSet.ceilingNormal) {
            this.ceilingMaterial.normalMap = texSet.ceilingNormal;
        }
        this.ceilingMaterial.roughnessMap = texSet.ceilingRoughness || null;
        if (this.ceilingMaterial.normalScale) {
            this.ceilingMaterial.normalScale.set(1.35, 1.35);
        }
        this.ceilingMaterial.needsUpdate = true;
        if (this.wallJointMesh) {
            this.wallJointMesh.material = this.wallMaterial;
        }

        this.stairsMaterial.map = texSet.wallTex;
        this.stairsMaterial.normalMap = texSet.wallNormal;
        this.stairsMaterial.roughnessMap = texSet.wallRoughness || null;
        this.stairsMaterial.normalScale.set(1.65, 1.65);
        this.stairsMaterial.needsUpdate = true;

        if (this.mountainMaterial && !this._hasPolyHavenMountainTex) {
            this.mountainMaterial.map = texSet.permWallTex;
            this.mountainMaterial.normalMap = texSet.permWallNormal;
            this.mountainMaterial.needsUpdate = true;
        }
        if (this.rubbleMaterial && !this._hasPolyHavenRubbleTex) {
            this.rubbleMaterial.map = texSet.wallTex;
            this.rubbleMaterial.normalMap = texSet.wallNormal;
            this.rubbleMaterial.needsUpdate = true;
        }
    }

    initMeshes() {
        this.maxInstances = 8192;
        this.createChamferedWallGeometry = createChamferedWallGeometry;
        this.applyWallVertexAO = applyWallVertexAO;
        // 45-degree chamfered geometry creates a visible 0.57m aperture between diagonal blocks
        const wallGeo = createChamferedWallGeometry(this.cellSize, this.wallHeight + 0.10, 0.40);
        applyWallVertexAO(wallGeo, this.wallHeight + 0.10);

        // Seamless orthogonal wall joint geometry to bridge adjacent chamfered wall blocks into flush masonry
        const wallJointGeo = new THREE.BoxGeometry(0.82, this.wallHeight + 0.10, this.cellSize);
        applyWallVertexAO(wallJointGeo, this.wallHeight + 0.10);
        wallJointGeo._sharedGeometry = true;

        // Subdivided floor with baked edge contact ambient occlusion
        const floorGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize, 2, 2);
        floorGeo.rotateX(-Math.PI / 2);
        applyFloorVertexAO(floorGeo, this.cellSize);

        // Subdivided ceiling with subtle vaulted subterranean stone arch & perimeter shadow
        const ceilingGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize, 2, 2);
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
        applyCeilingVertexAO(ceilingGeo, this.cellSize);

        // Soft contact shadow disc for grounded 3D item pickups
        this.shadowGeo = new THREE.PlaneGeometry(0.36, 0.36);
        this.shadowGeo.rotateX(-Math.PI / 2);
        this.shadowMat = new THREE.MeshBasicMaterial({
            map: this.shadowTex,
            transparent: true,
            opacity: 0.42,
            depthWrite: false
        });
        this.captionMaterialCache = new Map();

        // Helper to construct composite PBR geometries (1:1 with Godot SurfaceTool / BuildDoorMesh)
        const createMergedBoxGeometry = (boxes) => {
            const geometries = boxes.map(b => {
                const geo = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
                if (b.rotX) geo.rotateX(b.rotX);
                if (b.rotY) geo.rotateY(b.rotY);
                if (b.rotZ) geo.rotateZ(b.rotZ);
                geo.translate(b.pos[0], b.pos[1], b.pos[2]);
                const nonIndexed = geo.toNonIndexed();
                geo.dispose();
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
                vOffset += g.attributes.position.count;
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

        // 1b. Authentic Shop Entrance Masonry (Matches Godot DungeonWorld.cs:1653-1678 BuildShopDoorMesh)
        // Spans full 2.0m tile depth to perfectly flush with adjacent 2.0m wall blocks and seal building interior
        const shopFrameGeo = createMergedBoxGeometry([
            { pos: [-0.85, 1.10, 0.0], size: [0.30, 2.40, 2.00] }, // Left stone pier spanning full 2.0m depth
            { pos: [0.85, 1.10, 0.0], size: [0.30, 2.40, 2.00] },  // Right stone pier spanning full 2.0m depth
            { pos: [0, 2.65, 0.0], size: [2.00, 0.70, 2.00] },     // Top stone lintel spanning full 2.0m depth to 3m ceiling
            { pos: [0, 1.10, -0.55], size: [1.40, 2.40, 0.90] },   // Back solid masonry wall sealing building interior
            { pos: [0, -0.02, 0.45], size: [1.40, 0.08, 0.90] },   // Front threshold step
            { pos: [-0.72, 1.10, 0.15], size: [0.12, 2.40, 0.30] }, // Front decorative pilaster left
            { pos: [0.72, 1.10, 0.15], size: [0.12, 2.40, 0.30] },  // Front decorative pilaster right
            { pos: [-0.64, 1.75, 0.12], size: [0.08, 0.14, 0.14] }, // Top iron hinge bracket
            { pos: [-0.64, 0.55, 0.12], size: [0.08, 0.14, 0.14] }  // Bottom iron hinge bracket
        ]);

        // 2. Closed Wooden Door Panel with Horizontal Iron Straps (DungeonWorld.cs:1581-1593)
        const doorClosedGeo = createMergedBoxGeometry([
            { pos: [0, 1.15, 0], size: [1.40, 2.20, 0.12] },       // Wooden door leaf
            { pos: [0, 1.75, 0], size: [1.36, 0.12, 0.16] },       // Top iron strap
            { pos: [0, 0.55, 0], size: [1.36, 0.12, 0.16] },       // Bottom iron strap
            { pos: [0.45, 1.10, 0.08], size: [0.10, 0.16, 0.06] },  // Front latch ring
            { pos: [0.45, 1.10, -0.08], size: [0.10, 0.16, 0.06] } // Back latch ring
        ]);

        // 2b. Shop Door Leaf with Iron Straps recessed slightly at z = 0.05 (DungeonWorld.cs:1686-1693)
        const shopDoorGeo = createMergedBoxGeometry([
            { pos: [0, 1.15, 0.05], size: [1.40, 2.20, 0.12] },       // Wooden door leaf
            { pos: [0, 1.75, 0.07], size: [1.36, 0.12, 0.14] },       // Top iron strap
            { pos: [0, 0.55, 0.07], size: [1.36, 0.12, 0.14] },       // Bottom iron strap
            { pos: [0.45, 1.10, 0.12], size: [0.10, 0.16, 0.06] }     // Front latch ring
        ]);

        // 3. Swung-Open Door Panel Angled Ajar 70° (DungeonWorld.cs:1594-1631)
        const openYaw = 70 * Math.PI / 180;
        const panelCenterX = -0.68 + 0.64 * Math.cos(openYaw);
        const panelCenterZ = 0.64 * Math.sin(openYaw);
        const doorOpenGeo = createMergedBoxGeometry([
            { pos: [panelCenterX, 1.15, panelCenterZ], size: [1.28, 2.18, 0.10], rotY: -openYaw },
            { pos: [panelCenterX, 1.75, panelCenterZ], size: [1.24, 0.12, 0.14], rotY: -openYaw },
            { pos: [panelCenterX, 0.55, panelCenterZ], size: [1.24, 0.12, 0.14], rotY: -openYaw },
            { pos: [-0.68 + 1.05 * Math.cos(openYaw), 1.10, 1.05 * Math.sin(openYaw)], size: [0.10, 0.16, 0.15], rotY: -openYaw }
        ]);

        // 4. Shattered Broken Door Planks & Splinters (DungeonWorld.cs:1632-1643)
        const doorBrokenGeo = createMergedBoxGeometry([
            { pos: [-0.35, 0.06, 0.15], size: [0.85, 0.06, 0.26] },
            { pos: [0.35, 0.05, -0.15], size: [0.75, 0.05, 0.22] },
            { pos: [0.10, 0.09, 0.30], size: [0.60, 0.06, 0.18] },
            { pos: [-0.15, 0.08, -0.25], size: [0.50, 0.05, 0.20] },
            { pos: [-0.62, 1.70, 0.08], size: [0.26, 0.48, 0.08], rotY: -0.35 }
        ]);

        // 5. Authentic 3D Stepped Staircases (Matches Godot DungeonWorld.cs:1708-1735)
        const buildStairsBoxes = (down) => {
            const boxes = [
                { pos: [-0.90, 0.20, 0], size: [0.20, 0.45, 2.0] }, // Left low stone stringer
                { pos: [0.90, 0.20, 0], size: [0.20, 0.45, 2.0] }   // Right low stone stringer
            ];
            const stepCount = 5;
            const stepWidth = 1.60;
            const stepDepth = 2.0 / stepCount;
            for (let i = 0; i < stepCount; i++) {
                const z = -1.0 + stepDepth * (i + 0.5);
                const stepHeight = down ? (0.45 - i * 0.08) : (0.10 + i * 0.08);
                const yCenter = stepHeight / 2.0;
                boxes.push({ pos: [0, yCenter, z], size: [stepWidth, stepHeight, stepDepth] });
            }
            return boxes;
        };
        const stairsDownGeo = createMergedBoxGeometry(buildStairsBoxes(true));
        const stairsUpGeo = createMergedBoxGeometry(buildStairsBoxes(false));

        // 6. Impassable Rubble Piles (Collapsed masonry boulders & stone talus)
        const rubbleGeo = createMergedBoxGeometry([
            // Central high boulder peak
            { pos: [0.05, 0.65, -0.05], size: [1.20, 1.25, 1.10], rotY: 0.35, rotX: 0.12 },
            // Left flank boulder
            { pos: [-0.52, 0.45, 0.20], size: [0.95, 0.90, 0.95], rotY: -0.45, rotZ: 0.15 },
            // Right flank boulder
            { pos: [0.55, 0.42, -0.22], size: [0.95, 0.85, 0.90], rotY: 0.55, rotZ: -0.18 },
            // Forward spilled rock
            { pos: [-0.18, 0.28, 0.55], size: [1.00, 0.55, 0.80], rotY: -0.20, rotX: -0.15 },
            // Rear spilled rock
            { pos: [0.22, 0.30, -0.55], size: [0.95, 0.60, 0.75], rotY: 0.40, rotX: 0.18 },
            // Perimeter rock skirts filling the 2.0m width
            { pos: [0.68, 0.18, 0.45], size: [0.70, 0.35, 0.65], rotY: -0.65, rotZ: 0.10 },
            { pos: [-0.68, 0.16, -0.45], size: [0.65, 0.32, 0.70], rotY: 0.75, rotZ: -0.12 },
            { pos: [-0.10, 0.85, 0.08], size: [0.70, 0.50, 0.65], rotY: 0.80, rotX: 0.22 }
        ]);

        // 6b. Discovered Floor Traps (feat 1 with glyph '^'): Metallic trigger plate with crossbar runes
        const trapGeo = createMergedBoxGeometry([
            { pos: [0, 0.02, 0], size: [1.10, 0.04, 1.10] },         // Base trigger plate
            { pos: [0, 0.05, 0], size: [0.70, 0.03, 0.14] },         // Longitudinal raised rune/crossbar
            { pos: [0, 0.05, 0], size: [0.14, 0.03, 0.70] },         // Transverse raised rune/crossbar
            { pos: [-0.40, 0.05, -0.40], size: [0.08, 0.03, 0.08] },   // Corner rivets
            { pos: [0.40, 0.05, -0.40], size: [0.08, 0.03, 0.08] },
            { pos: [-0.40, 0.05, 0.40], size: [0.08, 0.03, 0.08] },
            { pos: [0.40, 0.05, 0.40], size: [0.08, 0.03, 0.08] }
        ]);
        this.trapMaterial = new THREE.MeshStandardMaterial({
            roughness: 0.40,
            metalness: 0.70,
            vertexColors: true
        });
        this.trapMesh = new THREE.InstancedMesh(trapGeo, this.trapMaterial, 128);
        this.trapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.trapMesh);

        this.wallMesh = new THREE.InstancedMesh(wallGeo, this.wallMaterial, this.maxInstances);
        this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.wallMesh);

        this.wallJointMesh = new THREE.InstancedMesh(wallJointGeo, this.wallMaterial, this.maxInstances * 2);
        this.wallJointMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.wallJointMesh.castShadow = true;
        this.wallJointMesh.receiveShadow = true;
        this.scene.add(this.wallJointMesh);

        // Cyclopean Permanent Bedrock & Outer Fortress Ramparts (feat 22)
        this.permWallMesh = new THREE.InstancedMesh(wallGeo, this.permWallMaterial, this.maxInstances);
        this.permWallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.permWallMesh);

        this.floorMesh = new THREE.InstancedMesh(floorGeo, this.floorMaterial, this.maxInstances);
        this.floorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.floorMesh.castShadow = false;
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        this.ceilingMesh = new THREE.InstancedMesh(ceilingGeo, this.ceilingMaterial, this.maxInstances);
        this.ceilingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ceilingMesh.castShadow = false;
        this.ceilingMesh.receiveShadow = true;
        this.scene.add(this.ceilingMesh);

        // Stone Doorways (Frames & Lintels for town & dungeon)
        this.doorFrameMesh = new THREE.InstancedMesh(doorFrameGeo, this.wallMaterial, 512);
        this.doorFrameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.doorFrameMesh);

        // Full-depth Town Shop Entrance Masonry Facade (1:1 with Godot BuildShopDoorMesh)
        this.shopFrameMesh = new THREE.InstancedMesh(shopFrameGeo, this.wallMaterial, 64);
        this.shopFrameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.shopFrameMesh);

        // Impassable Rubble Piles (feat 16)
        this.rubbleMesh = new THREE.InstancedMesh(rubbleGeo, this.rubbleMaterial || this.wallMaterial, 256);
        this.rubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.rubbleMesh);

        // Closed Dungeon Door (feat 2)
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



        this.magmaMesh = new THREE.InstancedMesh(wallGeo, this.magmaMaterial, 256);
        this.magmaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.magmaMesh);

        this.quartzMesh = new THREE.InstancedMesh(wallGeo, this.quartzMaterial, 256);
        this.quartzMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.quartzMesh);

        // Magma Vein with Gold Treasure (feat 19: MAGMA_K) - Rich metallic gold nuggets in dark basalt
        this.goldVeinMesh = new THREE.InstancedMesh(wallGeo, this.goldVeinMaterial, 512);
        this.goldVeinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.goldVeinMesh);

        // Quartz Vein with Gemstones (feat 20: QUARTZ_K) - Sparkling faceted emeralds, rubies, sapphires
        this.gemVeinMesh = new THREE.InstancedMesh(wallGeo, this.gemVeinMaterial, 512);
        this.gemVeinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.gemVeinMesh);

        // Forest Trees (feat 25: TREE) - Lightweight Cone + Dodecahedron Placeholders (upgraded by Poly Haven)
        const addWhiteVertexColors = (geo) => {
            const count = geo.attributes.position ? geo.attributes.position.count : 0;
            if (count > 0) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1.0), 3));
            return geo;
        };
        const treeTrunkGeo = addWhiteVertexColors(new THREE.ConeGeometry(0.18, 2.2, 6));
        treeTrunkGeo.translate(0, 1.1, 0);
        this.treeTrunkMesh = new THREE.InstancedMesh(treeTrunkGeo, this.treeTrunkMat, this.maxInstances);
        this.treeTrunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.treeTrunkMesh.castShadow = true;
        this.treeTrunkMesh.receiveShadow = true;
        this.scene.add(this.treeTrunkMesh);

        const treeLeavesGeo = addWhiteVertexColors(new THREE.DodecahedronGeometry(0.95, 1));
        treeLeavesGeo.translate(0, 1.8, 0);
        this.treeLeavesMesh = new THREE.InstancedMesh(treeLeavesGeo, this.treeLeavesMat, this.maxInstances);
        this.treeLeavesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.treeLeavesMesh.castShadow = false;
        this.treeLeavesMesh.receiveShadow = true;
        this.scene.add(this.treeLeavesMesh);

        // Dense Brush / Thicket / Flowers (feat 42: BUSH / BRAKE) - Lightweight Dodecahedron Placeholder
        const bushGeo = addWhiteVertexColors(new THREE.DodecahedronGeometry(0.48, 1));
        bushGeo.translate(0, 0.35, 0);
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

        // Down Staircase (feat 6)
        this.stairsMesh = new THREE.InstancedMesh(stairsDownGeo, this.stairsMaterial, 128);
        this.stairsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.stairsMesh);

        // Up Staircase (feat 5)
        this.stairsUpMesh = new THREE.InstancedMesh(stairsUpGeo, this.stairsMaterial, 128);
        this.stairsUpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.stairsUpMesh);

        // FrogComposBand Bottomless Pit (feat 41: '#') - Chasm cliff-shaft & abyssal void
        if (!this.dungeonGroup) {
            this.dungeonGroup = new THREE.Group();
            this.scene.add(this.dungeonGroup);
        }
        this.chasmVoidMat = new THREE.MeshBasicMaterial({ color: 0x020205, fog: true });
        this.chasmVoidMesh = new THREE.InstancedMesh(floorGeo, this.chasmVoidMat, this.maxInstances);
        this.chasmVoidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.chasmVoidMesh.castShadow = false;
        this.chasmVoidMesh.receiveShadow = false;
        this.dungeonGroup.add(this.chasmVoidMesh);
        this.chasmVoidMesh.count = 0;

        this.chasmSideMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2d36,
            roughness: 0.92,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        if (this.townMountainDiff) {
            this.chasmSideMaterial.map = this.townMountainDiff;
            this.chasmSideMaterial.normalMap = this.townMountainNormal;
            this.chasmSideMaterial.roughnessMap = this.townMountainRoughness;
        }
        this.chasmMesh = new THREE.InstancedMesh(wallGeo, this.chasmSideMaterial, this.maxInstances);
        this.chasmMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.chasmMesh.castShadow = false;
        this.chasmMesh.receiveShadow = true;
        this.scene.add(this.chasmMesh);

        // Pre-allocate instance color buffers with 1.0 (pure white albedo multiplier)
        const initInstancedColors = (mesh, count) => {
            const colors = new Float32Array(count * 3).fill(1.0);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
            mesh.count = 0; // Initialize to 0 so unpopulated instances are never drawn
        };
        initInstancedColors(this.wallMesh, this.maxInstances);
        initInstancedColors(this.wallJointMesh, this.maxInstances * 2);
        initInstancedColors(this.permWallMesh, this.maxInstances);
        initInstancedColors(this.floorMesh, this.maxInstances);
        initInstancedColors(this.ceilingMesh, this.maxInstances);
        initInstancedColors(this.doorFrameMesh, 512);
        initInstancedColors(this.shopFrameMesh, 64);
        initInstancedColors(this.rubbleMesh, 256);
        initInstancedColors(this.doorMesh, 512);
        initInstancedColors(this.doorOpenMesh, 256);
        initInstancedColors(this.doorBrokenMesh, 256);
        initInstancedColors(this.stairsMesh, 128);
        initInstancedColors(this.stairsUpMesh, 128);
        initInstancedColors(this.trapMesh, 128);
        initInstancedColors(this.magmaMesh, 256);
        initInstancedColors(this.quartzMesh, 256);
        initInstancedColors(this.goldVeinMesh, 512);
        initInstancedColors(this.gemVeinMesh, 512);
        initInstancedColors(this.treeTrunkMesh, this.maxInstances);
        initInstancedColors(this.treeLeavesMesh, this.maxInstances);
        initInstancedColors(this.bushMesh, this.maxInstances);
        initInstancedColors(this.grassMesh, this.maxInstances);
        initInstancedColors(this.dirtMesh, this.maxInstances);
        initInstancedColors(this.waterMesh, this.maxInstances);
        initInstancedColors(this.deepWaterMesh, this.maxInstances);
        initInstancedColors(this.mountainMesh, this.maxInstances);
        initInstancedColors(this.swampMesh, this.maxInstances);
        initInstancedColors(this.chasmMesh, this.maxInstances);
        this.lavaMesh.count = 0;
        this.lavaCooledMesh.count = 0;
        for (let i = 0; i < 8; i++) initInstancedColors(this.shopMeshes[i], 64);

        this.dummy = new THREE.Object3D();

        // Ground loot rarity plinth ring geometry (itemPlinthGeo)
        this.itemPlinthGeo = new THREE.RingGeometry(0.22, 0.28, 16);
        this.itemPlinthGeo.rotateX(-Math.PI / 2);

        // Soft contact shadow quad for 3D item pickups & treasures (zero download cost)
        this.shadowGeo = new THREE.PlaneGeometry(0.36, 0.36);
        this.shadowGeo.rotateX(-Math.PI / 2);
        this.shadowMat = new THREE.MeshBasicMaterial({
            map: this.shadowTex,
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });

        // Bounded cache for item caption billboard textures & materials (zero GC memory leak)
        this.captionMaterialCache = new Map();

        // High-Quality Celestial Star Canopy (Middle-earth night sky overhead in town)
        this.initStarCanopy();
    }

    _mergeBufferGeometries(geometries) {
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
    }

    _loadPolyHavenEnvironmentModels() {
        const loader = this.gltfLoader || (typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null);
        if (!loader) return;

        this._hasPolyHavenTreeTex = true;
        const texLoader = new THREE.TextureLoader();
        texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_bark_diff_1k.jpg', (diff) => {
            diff.encoding = THREE.sRGBEncoding;
            diff.flipY = false;
            if (this.treeTrunkMat) {
                this.treeTrunkMat.map = diff;
                this.treeTrunkMat.needsUpdate = true;
            }
        });
        texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_bark_nor_gl_1k.jpg', (nor) => {
            nor.flipY = false;
            this.treeBarkNormal = nor;
            if (this.treeTrunkMat) {
                this.treeTrunkMat.normalMap = nor;
                this.treeTrunkMat.needsUpdate = true;
            }
        });
        texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_diff_1k.jpg', (diff) => {
            diff.encoding = THREE.sRGBEncoding;
            diff.flipY = false;
            if (this.treeLeavesMat) {
                this.treeLeavesMat.map = diff;
                this.treeLeavesMat.needsUpdate = true;
            }
            this._lastTerrainSig = null;
            if (this.lastFrame) this.updateDungeon(this.lastFrame);
        });
        texLoader.load('/assets/polyhaven/models/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_nor_gl_1k.jpg', (nor) => {
            nor.flipY = false;
            if (this.treeLeavesMat) {
                this.treeLeavesMat.normalMap = nor;
                this.treeLeavesMat.needsUpdate = true;
            }
        });

        // 1. Pachira Aquatica (Photogrammetry Tree trunk, leaves & bush in local mesh space)
        loader.load('/assets/polyhaven/models/pachira_aquatica_01/pachira_aquatica_01.gltf', (gltf) => {
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
                if (this.lastFrame) this.updateDungeon(this.lastFrame);
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
        }, undefined, () => {});

        // 2. Moon Rock 02 (Photogrammetry Rubble Boulders)
        loader.load('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf', (gltf) => {
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

                const texLoader = new THREE.TextureLoader();
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
                        if (this.lastFrame) this.updateDungeon(this.lastFrame);
                    });
                });
            }
        }, undefined, () => {});

        // 3. Rock 07 (Photogrammetry Mountain Crag)
        loader.load('/assets/polyhaven/models/rock_07/rock_07.gltf', (gltf) => {
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

                const texLoader = new THREE.TextureLoader();
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
                        if (this.lastFrame) this.updateDungeon(this.lastFrame);
                    });
                });
            }
        }, undefined, () => {});
    }

    initStarCanopy() {
        this.starTexture = procCreateStarTexture();
        const starCount = 4500;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const phases = new Float32Array(starCount);

        const radius = 70.0; // Inside camera far clipping plane (85-140m)

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
                    gl_Position = projectionMatrix * mvPosition;
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

        // Dedicated Celestial Sky Dome: Deep gradient, Milky Way dust lanes, aurora ribbons, crescent moon
        const skyDomeGeo = new THREE.SphereGeometry(84, 32, 20);
        this.skyDomeMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
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
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uHorizonColor;
                uniform vec3 uZenithColor;
                uniform vec3 uNebulaColorA;
                uniform vec3 uNebulaColorB;
                uniform vec3 uAuroraColor;
                uniform vec3 uMoonDir;
                varying vec3 vWorldDir;

                float hash(vec3 p) {
                    p = fract(p * 0.3183099 + 0.1);
                    p *= 17.0;
                    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }

                float noise(vec3 x) {
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                }

                float fbm4(vec3 p) {
                    float v = 0.0;
                    v += 0.5000 * noise(p); p *= 2.02;
                    v += 0.2500 * noise(p); p *= 2.03;
                    v += 0.1250 * noise(p); p *= 2.01;
                    v += 0.0625 * noise(p);
                    return v;
                }

                void main() {
                    vec3 d = normalize(vWorldDir);
                    float elev = max(d.y, 0.0);

                    // 1. Deep Cosmic Zenith-to-Horizon Gradient
                    vec3 sky = mix(uHorizonColor, uZenithColor, pow(elev, 0.42));

                    // 2. Tilted Milky Way Galactic River & Dark Dust Lanes
                    vec3 g = vec3(d.x * 0.82 - d.y * 0.57, d.x * 0.57 + d.y * 0.82, d.z);
                    float fbm = fbm4(g * 4.8);
                    float dustFbm = fbm4(g * 9.2 + vec3(1.2, 3.4, 5.6));
                    float mwBand = exp(-pow(g.x * 3.1 + (fbm - 0.5) * 0.45, 2.0));
                    float dustRift = smoothstep(0.40, 0.68, dustFbm) * exp(-pow(g.x * 3.8, 2.0)) * 0.70;
                    float mwIntensity = clamp((mwBand * 0.90 - dustRift) * smoothstep(0.02, 0.18, elev), 0.0, 1.0);
                    vec3 mwColor = mix(uNebulaColorB, uNebulaColorA, smoothstep(0.35, 0.75, fbm));
                    sky += mwColor * mwIntensity * 0.85;

                    // 3. Shimmering Boreal Aurora Curtains
                    float auroraElev = smoothstep(0.08, 0.28, elev) * smoothstep(0.68, 0.35, elev);
                    float ribbon = sin(d.x * 14.0 + uTime * 0.35 + fbm * 4.0);
                    ribbon = smoothstep(0.25, 0.95, ribbon * 0.5 + 0.5);
                    float aurora = ribbon * auroraElev * (0.45 + 0.55 * sin(uTime * 0.6 + d.z * 5.0));
                    sky += uAuroraColor * (aurora * 0.55);

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
            `
        });
        this.skyDomeMesh = new THREE.Mesh(skyDomeGeo, this.skyDomeMaterial);
        this.skyDomeMesh.frustumCulled = false;

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
    }

    initModelResolvers() {
        this.objLoader = (typeof THREE.OBJLoader !== 'undefined') ? new THREE.OBJLoader() : null;
        this.gltfLoader = (typeof THREE.GLTFLoader !== 'undefined') ? new THREE.GLTFLoader() : null;
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
        // 1.5 Prewarm high-realism 3D character & bestiary templates
        this._ensureMonster3DTemplate('char_male_peasant').catch(() => {});
        this._ensureMonster3DTemplate('char_female_peasant').catch(() => {});
        this._ensureMonster3DTemplate('bestiary_fox').catch(() => {});
        this._ensureMonster3DTemplate('char_male_ranger').catch(() => {});
        // 2. Shockbolt 2.5D PBR Item Pickup Atlas & Normal Map
        this.initItemAtlas();

        // Authoritative Poly Haven Photogrammetry 3D Environment (Trees, Bushes, Rubble, Mountains)
        this._loadPolyHavenEnvironmentModels();

        // 3. Poly Haven Photogrammetry 3D Viewmodel Weapons & Shields (On-Demand + Prewarm Sword/Shield)
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
            staff: 'item_staff_branch',
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
        this._ensureViewmodelWeapon('sword');
        this._ensureViewmodelWeapon('shield');

        // Whip viewmodel (zero CylinderGeometry - uses BoxGeometry)
        const createWhipViewmodelMesh = () => {
            const whipGroup = new THREE.Group();
            const handleLeatherMat = new THREE.MeshStandardMaterial({ color: 0x3a2012, roughness: 0.85, metalness: 0.10 });
            const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a034, roughness: 0.28, metalness: 0.85 });
            const lashMat = new THREE.MeshStandardMaterial({ color: 0x24140b, roughness: 0.80, metalness: 0.12 });
            const popperMat = new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 0.90, metalness: 0.05 });

            const handleGeom = new THREE.BoxGeometry(0.032, 0.22, 0.032);
            whipGroup.add(new THREE.Mesh(handleGeom, handleLeatherMat));

            const pommelGeom = new THREE.SphereGeometry(0.024, 12, 8);
            const pommelMesh = new THREE.Mesh(pommelGeom, brassMat);
            pommelMesh.position.set(0, -0.115, 0);
            whipGroup.add(pommelMesh);

            const loopGeom = new THREE.TorusGeometry(0.022, 0.005, 8, 16);
            const loopMesh = new THREE.Mesh(loopGeom, handleLeatherMat);
            loopMesh.position.set(0, -0.135, 0);
            loopMesh.rotation.x = Math.PI / 2;
            whipGroup.add(loopMesh);

            const collarGeom = new THREE.BoxGeometry(0.038, 0.03, 0.038);
            const collarMesh = new THREE.Mesh(collarGeom, brassMat);
            collarMesh.position.set(0, 0.115, 0);
            whipGroup.add(collarMesh);

            const curvePoints = [
                new THREE.Vector3(0, 0.125, 0),
                new THREE.Vector3(0.015, 0.18, -0.04),
                new THREE.Vector3(0.035, 0.23, -0.12),
                new THREE.Vector3(0.045, 0.21, -0.22),
                new THREE.Vector3(0.030, 0.13, -0.32),
                new THREE.Vector3(0.005, -0.01, -0.40),
                new THREE.Vector3(-0.025, -0.18, -0.46),
                new THREE.Vector3(-0.040, -0.34, -0.50),
            ];
            const curve = new THREE.CatmullRomCurve3(curvePoints);
            const lashGeom = new THREE.TubeGeometry(curve, 32, 0.012, 8, false);
            whipGroup.add(new THREE.Mesh(lashGeom, lashMat));

            const tipPoints = [
                new THREE.Vector3(-0.040, -0.34, -0.50),
                new THREE.Vector3(-0.048, -0.44, -0.52),
                new THREE.Vector3(-0.052, -0.52, -0.53)
            ];
            const tipCurve = new THREE.CatmullRomCurve3(tipPoints);
            const tipGeom = new THREE.TubeGeometry(tipCurve, 12, 0.006, 6, false);
            whipGroup.add(new THREE.Mesh(tipGeom, popperMat));

            return whipGroup;
        };

        const whipObj = createWhipViewmodelMesh();
        whipObj.rotation.set(18 * Math.PI / 180, -14 * Math.PI / 180, 6 * Math.PI / 180);
        this.weaponCache.set('whip', whipObj);
    }

    getCharacterGltfKey(race, name, glyph) {
        return null;
    }

    getMonsterObjKey(race, name, glyph) {
        return null;
    }

    updateViewmodel(player) {
        if (!player) return;

        // 1. Dynamic Character Height & World Scaling Subsystem (Exact Parity with Godot ViewModel.cs)
        const ht = player.ht || 0;
        const race = (player.race || '').toLowerCase();
        const pClass = (player.class || '').toLowerCase();

        let targetEyeHeight = 1.62;
        let heightRatio = 1.0;

        if (ht > 0) {
            targetEyeHeight = (ht / 72.0) * 1.62;
            heightRatio = ht / 72.0;
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

        this.eyeHeight = Math.max(0.70, Math.min(2.35, targetEyeHeight));
        this.heightRatio = Math.max(0.55, Math.min(1.45, heightRatio));

        // Realistic perspective pitch by character height:
        // Base focal pitch: -9.0° (natural downward focus on floor/corridor/monsters ahead)
        // Height compensation: +22° per meter of height difference below 1.62m (or -22° per meter above 1.62m)
        // Tall characters (Half-Trolls, Ogres) look steep downward (-23°);
        // Short characters (Halflings, Kobolds) look upwards (+8°);
        // Dwarves look level/slight chest-height (+0.7°);
        // Humans look natural down-corridor (-9.0°).
        const heightDelta = 1.62 - this.eyeHeight;
        const basePitchDeg = -9.0 + (heightDelta * 22.0);
        this.basePitch = basePitchDeg * (Math.PI / 180.0);
        this.targetPitch = this.basePitch + (this.userPitchOffset || 0.0);

        // Subtle FOV adjustment (1:1 with Godot DungeonWorld.cs:2056)
        // Wider peripheral awareness for short races (86°), focused perspective for tall races (80°)
        if (this.camera) {
            const fov = 86.0 - (this.heightRatio - 0.60) * (6.0 / 0.85);
            this.camera.fov = Math.max(78.0, Math.min(88.0, fov));
            this.camera.updateProjectionMatrix();
        }

        this.viewmodelGroup.scale.set(1.0, 1.0, 1.0);

        // 4. Equipment resolution
        const _itemStr = (v) => (v && typeof v === 'object') ? String(v.name || v.desc || '') : String(v || '');
        const weaponItem = _itemStr(player.weapon_item);
        const bowItem = _itemStr(player.bow_item);
        const shieldItem = _itemStr(player.shield_item);
        const lightItem = _itemStr(player.light_item);
        const lightRadius = player.light || 0;
        const depth = player.depth !== undefined ? player.depth : 0;

        // Left hand: strictly reserved for equipped shields or off-hand weapons (never illumination items)
        if (shieldItem) {
            this.resolveShieldModel(shieldItem);
        } else {
            this.leftHandGroup.visible = false;
            this.currentLeftWeapon = null;
        }

        // RIGHT HAND RULE (1:1 with Godot ViewModel.cs:351-353):
        // Primary equipped melee weapon or ranged bow.
        // If unarmed, remains clean & empty (no fake default weapons or mannequin arms).
        this.resolveRightWeaponModel(weaponItem, bowItem, player);
    }

    resolveRightWeaponModel(weaponItem, bowItem, player) {
        let key = '';
        const lowerW = (weaponItem || '').toLowerCase();
        const lowerB = (bowItem || '').toLowerCase();
        const wTval = player && Number(player.weapon_tval || 0);

        if (lowerW.length > 0) {
            if (/\b(shovel|spade|trowel)\b/.test(lowerW)) {
                key = 'shovel';
            } else if (/\b(pick|pickaxe|mattock|digger)\b/.test(lowerW) || wTval === 20) {
                key = 'pickaxe';
            } else if (/\b(wand|rod|staff|quarterstaff)\b/.test(lowerW) || wTval === 55 || wTval === 65 || wTval === 66) {
                key = 'staff';
            } else if (/\b(scythe|sickle|glaive|halberd|lochaber)\b/.test(lowerW)) {
                key = 'axe';
            } else if (lowerW.includes('whip') || lowerW.includes('bullwhip') || lowerW.includes('scourge') || lowerW.includes('cat-o')) {
                key = 'whip';
            } else if (lowerW.includes('katana') || lowerW.includes('wakizashi') || lowerW.includes('nodachi') || lowerW.includes('ninja-to') || lowerW.includes('tanto')) {
                key = 'katana';
            } else if (lowerW.includes('dagger') || lowerW.includes('knife') || lowerW.includes('main gauche') || lowerW.includes('misericorde') || lowerW.includes('stiletto') || lowerW.includes('dirk')) {
                key = 'dagger';
            } else if (lowerW.includes('claymore') || lowerW.includes('two-handed') || lowerW.includes('great sword') || lowerW.includes('executioner') || lowerW.includes('zweihander')) {
                key = 'claymore';
            } else if (lowerW.includes('rune') || lowerW.includes('vorpal') || lowerW.includes('morgul') || lowerW.includes('ringil') || lowerW.includes('anduril') || lowerW.includes('glamdring')) {
                key = 'blade';
            } else if (lowerW.includes('saber') || lowerW.includes('sabre') || lowerW.includes('scimitar') || lowerW.includes('cutlass') || lowerW.includes('falchion') || lowerW.includes('tulwar')) {
                key = 'saber';
            } else if (lowerW.includes('hatchet')) {
                key = 'hatchet';
            } else if (lowerW.includes('axe') || lowerW.includes('cleaver')) {
                key = 'axe';
            } else if (lowerW.includes('morning star') || lowerW.includes('morningstar') || lowerW.includes('flail') || lowerW.includes('ball-and-chain')) {
                key = 'morningstar';
            } else if (lowerW.includes('club') || lowerW.includes('cudgel')) {
                key = 'club';
            } else if (lowerW.includes('mace') || lowerW.includes('scepter')) {
                key = 'mace';
            } else if (lowerW.includes('hammer') || lowerW.includes('maul')) {
                key = 'hammer';
            } else if (lowerW.includes('spear') || lowerW.includes('pike') || lowerW.includes('lance') || lowerW.includes('trident') || lowerW.includes('polearm')) {
                key = 'spear';
            } else {
                key = 'sword';
            }
        } else if (lowerB.length > 0) {
            key = 'bow';
        }

        if (this.currentRightWeapon === key && this.rightItemSlot && this.rightItemSlot.children.length > 0) return;
        this.currentRightWeapon = key;

        if (this.rightItemSlot) {
            while (this.rightItemSlot.children.length > 0) {
                this.rightItemSlot.remove(this.rightItemSlot.children[0]);
            }

            if (!key) {
                this.rightHandGroup.visible = false;
                return;
            }

            let mesh = null;
            if (this.weaponCache.has(key)) {
                mesh = this.weaponCache.get(key).clone(true);
            } else {
                this._ensureViewmodelWeapon(key);
            }
            if (mesh) {
                this.rightItemSlot.add(mesh);
            }
            this.rightHandGroup.visible = true;
        }
    }

    resolveShieldModel(shieldItem) {
        if (!this.leftItemSlot) return;
        if (!shieldItem) {
            this.leftHandGroup.visible = false;
            this.currentLeftWeapon = null;
            return;
        }
        const lower = String(shieldItem).toLowerCase();
        let key;
        if (/\b(deflection|dragon|artifact|thorin|celegorm|anor|gil-galad|harad|raven|mirror|elven)\b/.test(lower)) {
            key = 'shield_raven';
        } else if (/\b(wicker|buckler|basket)\b/.test(lower)) {
            key = 'shield_wicker';
        } else if (/\bleather\b/.test(lower)) {
            key = 'shield_leather';
        } else if (/\bsmall metal\b/.test(lower)) {
            key = 'shield_metal';
        } else if (/\b(wooden|wood|round|small|target)\b/.test(lower)) {
            key = 'shield_wooden';
        } else {
            key = 'shield';
        }
        if (this.currentLeftWeapon === key && this.leftItemSlot.children.length > 0) {
            this.leftHandGroup.visible = true;
            return;
        }
        this.currentLeftWeapon = key;
        while (this.leftItemSlot.children.length > 0) {
            this.leftItemSlot.remove(this.leftItemSlot.children[0]);
        }
        if (this.weaponCache.has(key)) {
            this.leftItemSlot.add(this.weaponCache.get(key).clone(true));
        } else {
            this._ensureViewmodelWeapon(key);
        }
        this.leftHandGroup.visible = true;
    }

    resolveLeftLightModel(lightItem) {
        if (!this.leftItemSlot) return;
        const lowerL = String(lightItem || '').toLowerCase();
        const key = /torch/.test(lowerL) ? 'torch' : 'lantern';
        if (this.currentLeftWeapon === key && this.leftItemSlot.children.length > 0) {
            this.leftHandGroup.visible = true;
            return;
        }
        this.currentLeftWeapon = key;
        while (this.leftItemSlot.children.length > 0) {
            this.leftItemSlot.remove(this.leftItemSlot.children[0]);
        }
        if (this.weaponCache.has(key)) {
            this.leftItemSlot.add(this.weaponCache.get(key).clone(true));
        } else {
            this._ensureViewmodelWeapon(key);
        }
        this.leftHandGroup.visible = true;
    }

    _ensureViewmodelWeapon(key) {
        if (!key || this.weaponCache.has(key)) return;
        const phKey = this._viewmodelWeaponPhMap && this._viewmodelWeaponPhMap[key];
        if (!phKey) return;
        this._ensurePolyHavenFloorItem(phKey).then((tmpl) => {
            if (!tmpl || this.weaponCache.has(key)) return;
            const wClone = this._cloneCachedGltfTemplate(tmpl, null, phKey);
            if (!wClone) return;
            this._prepareCanonicalHeldClone(wClone, phKey);
            if (key === 'shield' || key.startsWith('shield_')) {
                wClone.scale.setScalar(0.38);
                wClone.position.set(0.02, -0.01, 0);
                wClone.rotation.set(0, 0, 0);
            } else if (key === 'bow') {
                wClone.scale.setScalar(0.36);
                wClone.position.set(0, 0.01, 0);
                wClone.rotation.set(0.16, -0.25, 0.12);
            } else if (key === 'shovel' || key === 'pickaxe' || key === 'staff') {
                wClone.scale.setScalar(0.42);
                wClone.position.set(0, -0.01, 0);
                wClone.rotation.set(0.12, key === 'shovel' ? -0.35 : -0.22, 0.06);
            } else {
                const vmScale = key === 'spear' ? 0.32 : (key === 'claymore' ? 0.35 : (key === 'dagger' || key === 'hatchet' ? 0.46 : 0.40));
                wClone.scale.setScalar(vmScale);
                wClone.position.set(0, key === 'dagger' || key === 'hatchet' ? -0.02 : -0.01, 0);
                wClone.rotation.set(0.14, -0.24, 0.08);
            }
            if (!key.startsWith('shield') && key !== 'bow') {
                this._ensurePolyHavenFloorItem('item_gauntlets').then((gTmpl) => {
                    if (!gTmpl) return;
                    const gClone = this._cloneCachedGltfTemplate(gTmpl, '#3a3530', 'item_gauntlets');
                    if (!gClone) return;
                    gClone.scale.set(0.34, 0.42, 0.34);
                    gClone.position.set(0.0, -0.09, 0.02);
                    gClone.rotation.set(0.35, 0.0, -0.18);
                    wClone.add(gClone);
                }).catch(() => {});
            }
            this.weaponCache.set(key, wClone);
            if (this.lastFrame && this.lastFrame.player) {
                this.currentRightWeapon = null;
                this.currentLeftWeapon = null;
                this.updateViewmodel(this.lastFrame.player);
            }
        }).catch(() => {});
    }

    triggerAttackAnimation() {
        this.attackAnimationTime = 0.22; // 220ms swing
    }

    triggerHurtAnimation() {
        this.hurtAnimationTime = 0.16; // 160ms recoil
    }

    triggerCastAnimation() {
        this.castAnimationTime = 0.32; // 320ms magical raise
    }

    spawnFloatingText(text, worldPos, colorHex = '#ffcc00', scale = 1.0) {
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.font = '900 36px "Cinzel", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Dark glowing outline for crisp readability against any 3D backdrop
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.lineWidth = 6;
        ctx.strokeText(text, 192, 48);

        ctx.fillStyle = colorHex;
        ctx.fillText(text, 192, 48);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.4 * scale, 0.35 * scale, 1.0);
        sprite.position.copy(worldPos);

        this.scene.add(sprite);
        this.floatingTexts.push({
            sprite: sprite,
            elapsed: 0,
            duration: 0.75,
            basePos: worldPos.clone(),
            material: mat
        });
    }

    _ensureSharedVfxResources() {
        if (this._sharedVfxInitialized) return;
        this._sharedVfxInitialized = true;
        if (typeof THREE === 'undefined') return;

        this._sharedSparkGeo = new THREE.OctahedronGeometry(0.032, 0);
        this._sharedSparkGeo._sharedGeometry = true;

        this._sharedStreakGeo = new THREE.ConeGeometry(0.022, 0.24, 5);
        this._sharedStreakGeo.rotateX(Math.PI / 2);
        this._sharedStreakGeo._sharedGeometry = true;

        this._sharedShockRingGeo = new THREE.RingGeometry(0.18, 0.36, 28);
        this._sharedShockRingGeo.rotateX(-Math.PI / 2);
        this._sharedShockRingGeo._sharedGeometry = true;

        this._sharedSlashArcGeo = new THREE.RingGeometry(0.30, 0.62, 24, 1, -Math.PI * 0.42, Math.PI * 0.84);
        this._sharedSlashArcGeo._sharedGeometry = true;

        this._sharedSlashCoreGeo = new THREE.RingGeometry(0.42, 0.56, 24, 1, -Math.PI * 0.38, Math.PI * 0.76);
        this._sharedSlashCoreGeo._sharedGeometry = true;

        this._sharedThrustLanceGeo = new THREE.ConeGeometry(0.075, 0.95, 8);
        this._sharedThrustLanceGeo.rotateX(Math.PI / 2);
        this._sharedThrustLanceGeo._sharedGeometry = true;

        this._sharedBreathConeGeo = new THREE.ConeGeometry(0.52, 1.45, 16, 1, true);
        this._sharedBreathConeGeo.rotateX(-Math.PI / 2);
        this._sharedBreathConeGeo._sharedGeometry = true;

        this._sharedDetonationDomeGeo = new THREE.SphereGeometry(0.46, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
        this._sharedDetonationDomeGeo._sharedGeometry = true;

        this._sharedOrbCoreGeo = new THREE.IcosahedronGeometry(0.11, 1);
        this._sharedOrbCoreGeo._sharedGeometry = true;

        this._sharedOrbShellGeo = new THREE.IcosahedronGeometry(0.19, 1);
        this._sharedOrbShellGeo._sharedGeometry = true;

        this._sharedAuraCylinderGeo = new THREE.CylinderGeometry(0.42, 0.50, 1.35, 20, 1, true);
        this._sharedAuraCylinderGeo._sharedGeometry = true;
    }

    spawnHitSparks(worldPos, colorHex = '#ffaa33', count = 14, opts = {}) {
        this._ensureSharedVfxResources();
        const pGroup = new THREE.Group();
        pGroup.position.copy(worldPos);
        const col = new THREE.Color(colorHex);
        const sparkMat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const sparks = [];
        for (let i = 0; i < count; i++) {
            const isStreak = (i % 2 === 0);
            const geo = isStreak ? this._sharedStreakGeo : this._sharedSparkGeo;
            const m = new THREE.Mesh(geo, sparkMat);
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI;
            const speed = 1.2 + Math.random() * 2.2;
            const vel = new THREE.Vector3(
                Math.cos(theta) * Math.cos(phi) * speed,
                Math.sin(phi) * speed + 1.2,
                Math.sin(theta) * Math.cos(phi) * speed
            );
            if (isStreak) {
                m.lookAt(m.position.clone().add(vel));
            }
            pGroup.add(m);
            sparks.push({ mesh: m, vel: vel, isStreak });
        }

        let shockRingMesh = null;
        let ringMat = null;
        if (opts && opts.shockRing) {
            ringMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            shockRingMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
            shockRingMesh.position.y = 0.02;
            pGroup.add(shockRingMesh);
        }

        this.scene.add(pGroup);
        this.particles.push({
            group: pGroup,
            sparks: sparks,
            elapsed: 0,
            duration: 0.38,
            material: sparkMat,
            shockRingMesh,
            ringMat
        });
    }

    spawnDetonationDome(worldPos, colorHex = 0xff6600, scale = 1.0) {
        this._ensureSharedVfxResources();
        this.activeProjectiles = this.activeProjectiles || [];
        const group = new THREE.Group();
        group.position.copy(worldPos);
        this.scene.add(group);

        const col = new THREE.Color(colorHex);
        const domeMat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.82,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const domeMesh = new THREE.Mesh(this._sharedDetonationDomeGeo, domeMat);
        group.add(domeMesh);

        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const coreMesh = new THREE.Mesh(this._sharedDetonationDomeGeo, coreMat);
        coreMesh.scale.set(0.55, 0.55, 0.55);
        group.add(coreMesh);

        const ringMat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const ringMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
        ringMesh.position.y = 0.02;
        group.add(ringMesh);

        const pLight = new THREE.PointLight(colorHex, 4.2, 9);
        group.add(pLight);

        const disposables = [domeMat, coreMat, ringMat, pLight];

        this.activeProjectiles.push({
            kind: 'detonation',
            group,
            baseScale: scale,
            domeMat,
            coreMat,
            ringMat,
            pLight,
            startPos: worldPos.clone(),
            endPos: worldPos.clone(),
            colorHex,
            elapsed: 0,
            duration: 0.32,
            disposables
        });
    }

    _resolveCombatEndpoints(msgLower, isPlayerAction = true) {
        const playerPos = this.camera ? this.camera.position.clone() : new THREE.Vector3();
        const fwd = new THREE.Vector3(0, 0, -1);
        if (this.camera) fwd.applyQuaternion(this.camera.quaternion);

        let monsterEntity = null;
        if (this.targetedMonsterId && this.monsters && this.monsters.has(this.targetedMonsterId)) {
            monsterEntity = this.monsters.get(this.targetedMonsterId);
        } else if (this.monsters) {
            for (const ent of this.monsters.values()) {
                const mData = ent.monsterData;
                const mName = ((mData && mData.name) || ent.name || '').toLowerCase();
                if (mName && msgLower.includes(mName)) {
                    monsterEntity = ent;
                    break;
                }
            }
            if (!monsterEntity) {
                let bestDist = 14.0;
                for (const ent of this.monsters.values()) {
                    if (!ent.visible) continue;
                    const d = ent.position.distanceTo(playerPos);
                    if (d < bestDist) {
                        bestDist = d;
                        monsterEntity = ent;
                    }
                }
            }
        }

        let monsterPos;
        if (monsterEntity) {
            monsterPos = monsterEntity.position.clone().add(new THREE.Vector3(0, (monsterEntity.modelHeight || 1.4) * 0.55, 0));
        } else {
            monsterPos = playerPos.clone().addScaledVector(fwd, 3.2);
            monsterPos.y = playerPos.y - 0.15;
        }

        const rightVec = new THREE.Vector3(1, 0, 0);
        if (this.camera) rightVec.applyQuaternion(this.camera.quaternion);
        const toMonster = monsterPos.clone().sub(playerPos).normalize();
        const pan = Math.max(-0.95, Math.min(0.95, toMonster.dot(rightVec)));

        const playerHandPos = playerPos.clone().addScaledVector(fwd, 0.45).add(new THREE.Vector3(0.18, -0.18, 0));
        const playerFacePos = playerPos.clone().addScaledVector(fwd, 0.55);

        return {
            startPos: isPlayerAction ? playerHandPos : monsterPos,
            endPos: isPlayerAction ? monsterPos : playerFacePos,
            monsterEntity,
            pan
        };
    }

    triggerMonsterHitReaction(monsterEntity, isKill = false) {
        if (!monsterEntity) return;
        monsterEntity._hitFlinchTimer = 0.20;
        const camPos = this.camera ? this.camera.position : new THREE.Vector3();
        monsterEntity._hitFlinchDir = monsterEntity.position.clone().sub(camPos).setY(0).normalize();
        if (monsterEntity._hitFlinchDir.lengthSq() < 0.001) {
            monsterEntity._hitFlinchDir.set(0, 0, -1);
        }
        monsterEntity._hitFlashTimer = 0.18;
    }

    spawnProjectileOrSpellVfx(kind, startPos, endPos, colorHex = 0xff6600) {
        this._ensureSharedVfxResources();
        this.activeProjectiles = this.activeProjectiles || [];
        const group = new THREE.Group();
        group.position.copy(startPos);
        this.scene.add(group);

        const disposables = [];
        let duration = 0.25;
        let onComplete = null;
        let lines = null;
        let mat = null;
        let outerMat = null;
        let innerMat = null;
        let ringMat = null;
        let bluntRingMat = null;
        let bluntDomeMat = null;
        let lanceMat = null;
        let needleMat = null;
        let pillarMat = null;
        let pLight = null;
        let dist = null;
        let vortexRings = null;

        const col = new THREE.Color(colorHex);

        if (kind === 'arrow') {
            duration = 0.22;
            let arrowMesh = null;
            if (this._gltfTemplateCache && this._gltfTemplateCache.has('item_arrow')) {
                arrowMesh = this._cloneCachedGltfTemplate(this._gltfTemplateCache.get('item_arrow'), null, 'item_arrow');
                arrowMesh.scale.setScalar(0.42);
            } else {
                const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.65, 6);
                const shaftMat = new THREE.MeshBasicMaterial({ color: 0xdbeafe });
                disposables.push(shaftGeo, shaftMat);
                arrowMesh = new THREE.Mesh(shaftGeo, shaftMat);
            }
            const dir = endPos.clone().sub(startPos).normalize();
            arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            group.add(arrowMesh);
            onComplete = () => {
                this.spawnHitSparks(endPos, 0xdbeafe, 12);
            };
        } else if (kind === 'potion') {
            duration = 0.34;
            let bottleMesh = null;
            if (this._gltfTemplateCache && this._gltfTemplateCache.has('ph_potion_bottle')) {
                bottleMesh = this._cloneCachedGltfTemplate(this._gltfTemplateCache.get('ph_potion_bottle'), null, 'ph_potion_bottle');
                bottleMesh.scale.setScalar(0.35);
            } else {
                const botGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.20, 8);
                const botMat = new THREE.MeshBasicMaterial({ color: col });
                disposables.push(botGeo, botMat);
                bottleMesh = new THREE.Mesh(botGeo, botMat);
            }
            group.add(bottleMesh);
            onComplete = () => {
                this.spawnHitSparks(endPos, colorHex, 16);
            };
        } else if (kind === 'slash' || kind === 'crit_slash') {
            duration = (kind === 'crit_slash') ? 0.26 : 0.20;
            group.position.copy(endPos);
            group.lookAt(startPos);

            outerMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            innerMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.98,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            disposables.push(outerMat, innerMat);

            const blade1 = new THREE.Group();
            blade1.rotation.set(0.28, -0.22, 0.58);
            blade1.add(new THREE.Mesh(this._sharedSlashArcGeo, outerMat));
            blade1.add(new THREE.Mesh(this._sharedSlashCoreGeo, innerMat));
            group.add(blade1);

            if (kind === 'crit_slash') {
                const blade2 = new THREE.Group();
                blade2.scale.x = -1;
                blade2.rotation.set(0.28, 0.22, 0.58);
                blade2.add(new THREE.Mesh(this._sharedSlashArcGeo, outerMat));
                blade2.add(new THREE.Mesh(this._sharedSlashCoreGeo, innerMat));
                group.add(blade2);

                ringMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const ringMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                ringMesh.position.y = -0.2;
                group.add(ringMesh);
                disposables.push(ringMat);

                pLight = new THREE.PointLight(colorHex, 3.5, 6);
                group.add(pLight);
                disposables.push(pLight);
            }

            this.spawnHitSparks(endPos, colorHex, (kind === 'crit_slash') ? 24 : 14, { shockRing: kind === 'crit_slash' });
        } else if (kind === 'blunt') {
            duration = 0.24;
            group.position.copy(endPos);

            bluntRingMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            bluntDomeMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            disposables.push(bluntRingMat, bluntDomeMat);

            const ring1 = new THREE.Mesh(this._sharedShockRingGeo, bluntRingMat);
            ring1.position.y = 0.02;
            group.add(ring1);

            const ring2 = new THREE.Mesh(this._sharedShockRingGeo, bluntRingMat);
            if (this.camera) {
                ring2.quaternion.copy(this.camera.quaternion);
            } else {
                ring2.rotation.x = Math.PI * 0.25;
            }
            group.add(ring2);

            const flashDome = new THREE.Mesh(this._sharedDetonationDomeGeo, bluntDomeMat);
            flashDome.scale.setScalar(0.55);
            group.add(flashDome);

            pLight = new THREE.PointLight(colorHex, 3.0, 6);
            group.add(pLight);
            disposables.push(pLight);

            this.spawnHitSparks(endPos, colorHex, 18, { shockRing: true });
        } else if (kind === 'pierce') {
            duration = 0.19;
            group.position.copy(startPos.clone().lerp(endPos, 0.35));
            group.lookAt(endPos);

            lanceMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            needleMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.98,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            disposables.push(lanceMat, needleMat);

            const lanceMesh = new THREE.Mesh(this._sharedThrustLanceGeo, lanceMat);
            group.add(lanceMesh);

            const needleMesh = new THREE.Mesh(this._sharedThrustLanceGeo, needleMat);
            needleMesh.scale.set(0.45, 0.45, 1.15);
            group.add(needleMesh);

            const pRing = new THREE.Mesh(this._sharedShockRingGeo, lanceMat);
            pRing.rotation.x = Math.PI / 2;
            group.add(pRing);

            this.spawnHitSparks(endPos, colorHex, 15);
        } else if (kind === 'breath') {
            duration = 0.38;
            group.position.copy(startPos);
            group.lookAt(endPos);
            dist = Math.max(1.5, startPos.distanceTo(endPos));

            outerMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.72,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            innerMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            ringMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.80,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            disposables.push(outerMat, innerMat, ringMat);

            const outerCone = new THREE.Mesh(this._sharedBreathConeGeo, outerMat);
            group.add(outerCone);

            const innerCone = new THREE.Mesh(this._sharedBreathConeGeo, innerMat);
            innerCone.scale.set(0.55, 0.55, 0.92);
            group.add(innerCone);

            vortexRings = [];
            const ringFracs = [0.33, 0.66, 0.95];
            for (let r = 0; r < ringFracs.length; r++) {
                const vRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                vRing.rotation.x = Math.PI / 2;
                vRing.position.z = 1.45 * ringFracs[r];
                const sc = 0.5 + ringFracs[r] * 0.8;
                vRing.scale.set(sc, sc, sc);
                group.add(vRing);
                vortexRings.push(vRing);
            }

            pLight = new THREE.PointLight(colorHex, 4.5, 11);
            group.add(pLight);
            disposables.push(pLight);

            onComplete = () => {
                this.spawnDetonationDome(endPos, colorHex, 1.15);
                this.spawnHitSparks(endPos, colorHex, 24, { shockRing: true });
            };
        } else if (kind === 'fireball' || kind === 'bolt') {
            duration = 0.28;
            const scaleMult = (kind === 'fireball') ? 1.0 : 0.75;
            innerMat = new THREE.MeshBasicMaterial({
                color: 0xfff7cc,
                transparent: true,
                opacity: 0.98,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            outerMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.78,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            ringMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            disposables.push(innerMat, outerMat, ringMat);

            const innerMesh = new THREE.Mesh(this._sharedOrbCoreGeo, innerMat);
            innerMesh.scale.setScalar(scaleMult);
            group.add(innerMesh);

            const outerMesh = new THREE.Mesh(this._sharedOrbShellGeo, outerMat);
            outerMesh.scale.setScalar(scaleMult);
            group.add(outerMesh);

            const coronaRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
            coronaRing.scale.setScalar(scaleMult * 0.9);
            coronaRing.lookAt(endPos);
            group.add(coronaRing);

            this.spawnHitSparks(startPos.clone().lerp(endPos, 0.35), colorHex, 14);
            this.spawnHitSparks(startPos.clone().lerp(endPos, 0.65), 0xffcc44, 14);

            pLight = new THREE.PointLight(colorHex, 3.8, 10);
            group.add(pLight);
            disposables.push(pLight);

            onComplete = () => {
                this.spawnDetonationDome(endPos, colorHex, kind === 'fireball' ? 1.0 : 0.65);
                this.spawnHitSparks(endPos, colorHex, 20, { shockRing: true });
            };
        } else if (kind === 'lightning') {
            duration = 0.28;
            lines = [];
            const coreMat = new THREE.LineBasicMaterial({ color: 0xeeffff, transparent: true, opacity: 1.0 });
            const outerLineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.92 });
            ringMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            disposables.push(coreMat, outerLineMat, ringMat);

            const ptCount = 12;
            const corePts = [];
            for (let i = 0; i < ptCount; i++) {
                const frac = i / (ptCount - 1);
                const pt = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                if (i > 0 && i < ptCount - 1) {
                    pt.x += (Math.random() - 0.5) * 0.22;
                    pt.y += (Math.random() - 0.5) * 0.22;
                    pt.z += (Math.random() - 0.5) * 0.22;
                }
                corePts.push(pt.clone().sub(startPos));
            }
            const coreGeo = new THREE.BufferGeometry().setFromPoints(corePts);
            disposables.push(coreGeo);
            const coreLine = new THREE.Line(coreGeo, coreMat);
            group.add(coreLine);
            lines.push(coreLine);

            for (let arc = 0; arc < 3; arc++) {
                const pts = [];
                for (let i = 0; i < ptCount; i++) {
                    const frac = i / (ptCount - 1);
                    const pt = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                    if (i > 0 && i < ptCount - 1) {
                        pt.x += (Math.random() - 0.5) * 0.42;
                        pt.y += (Math.random() - 0.5) * 0.42;
                        pt.z += (Math.random() - 0.5) * 0.42;
                    }
                    pts.push(pt.clone().sub(startPos));
                }
                const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
                disposables.push(lineGeo);
                const line = new THREE.Line(lineGeo, outerLineMat);
                group.add(line);
                lines.push(line);
            }

            const branchFractions = [0.30, 0.55, 0.75];
            for (let b = 0; b < branchFractions.length; b++) {
                const frac = branchFractions[b];
                const forkStart = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                const branchPts = [forkStart.clone().sub(startPos)];
                let curPt = forkStart.clone();
                const forkDir = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.8,
                    (Math.random() - 0.2) * 0.6,
                    (Math.random() - 0.5) * 0.8
                ).normalize();
                for (let step = 1; step <= 4; step++) {
                    curPt.addScaledVector(forkDir, 0.20);
                    curPt.x += (Math.random() - 0.5) * 0.15;
                    curPt.y += (Math.random() - 0.5) * 0.15;
                    curPt.z += (Math.random() - 0.5) * 0.15;
                    branchPts.push(curPt.clone().sub(startPos));
                }
                const bGeo = new THREE.BufferGeometry().setFromPoints(branchPts);
                disposables.push(bGeo);
                const bLine = new THREE.Line(bGeo, outerLineMat);
                group.add(bLine);
                lines.push(bLine);
            }

            const strikeRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
            strikeRing.position.copy(endPos).sub(startPos);
            strikeRing.position.y += 0.02;
            group.add(strikeRing);

            pLight = new THREE.PointLight(colorHex, 4.5, 10);
            group.add(pLight);
            disposables.push(pLight);

            onComplete = () => {
                this.spawnDetonationDome(endPos, colorHex, 0.65);
                this.spawnHitSparks(endPos, colorHex, 18, { shockRing: true });
            };
        } else if (kind === 'aura') {
            duration = 0.62;
            pillarMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            ringMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            disposables.push(pillarMat, ringMat);

            const pillarMesh = new THREE.Mesh(this._sharedAuraCylinderGeo, pillarMat);
            group.add(pillarMesh);

            const yOffsets = [-0.35, 0.0, 0.35];
            for (const yOff of yOffsets) {
                const rMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                rMesh.position.y = yOff;
                group.add(rMesh);
            }

            pLight = new THREE.PointLight(colorHex, 3.2, 7);
            group.add(pLight);
            disposables.push(pLight);

            this.spawnHitSparks(startPos, colorHex, 16);
        }

        this.activeProjectiles.push({
            kind,
            group,
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            colorHex,
            elapsed: 0,
            duration,
            lines,
            mat,
            outerMat,
            innerMat,
            ringMat,
            bluntRingMat,
            bluntDomeMat,
            lanceMat,
            needleMat,
            pillarMat,
            pLight,
            dist,
            vortexRings,
            onComplete,
            disposables
        });
    }

    triggerMessageVfx(msgText) {
        if (!msgText) return;
        const lower = msgText.toLowerCase();

        const isPlayerSource = lower.startsWith('you ') || lower.startsWith('your ') ||
            lower.includes('you hit') || lower.includes('you strike') || lower.includes('you slash') ||
            lower.includes('you crush') || lower.includes('you smite') || lower.includes('you shoot') ||
            lower.includes('you fire') || lower.includes('you cast') || lower.includes('you throw') ||
            lower.includes('you zap') || lower.includes('you aim') || lower.includes('you quaff') ||
            lower.includes('you read') || lower.includes('you tunnel') || lower.includes('you dig') ||
            lower.includes('you pray') || lower.includes('you recite') || lower.includes('you use a staff');

        const ep = this._resolveCombatEndpoints(lower, isPlayerSource);
        const mGlyph = (ep.monsterEntity && ep.monsterEntity.monsterData && ep.monsterEntity.monsterData.char) || (ep.monsterEntity && ep.monsterEntity.glyph) || 'm';

        // 1. Lightning Spells & Attacks
        if (/\b(lightning|elec|shock|thunder|spark)\b/.test(lower)) {
            this.spawnProjectileOrSpellVfx('lightning', ep.startPos, ep.endPos, 0x66f0ff);
            if (this.audio && typeof this.audio.playLightningCrack === 'function') {
                this.audio.playLightningCrack(ep.pan);
            } else if (this.audio && typeof this.audio.playSpell === 'function') {
                this.audio.playSpell('lightning');
            }
            if (isPlayerSource) {
                this.triggerCastAnimation();
                this.spawnFloatingText('LIGHTNING', ep.startPos, '#66f0ff', 1.15);
            } else {
                this.addTrauma(0.28);
                this.triggerHurtAnimation();
            }
            return;
        }

        // 2. Fire / Frost / Acid / Poison / Chaos / Mana Spells & Breaths
        if (/\b(breathes|fireball|frost|cold|acid|poison|venom|missile|mana bolt|mana storm|mana burst|chaos|nether|you cast|you zap|you aim|mumbles|invokes)\b/.test(lower)) {
            const isBreath = lower.includes('breathe') || lower.includes('breath');
            if (/\b(heal|cure|restore|satisfy|bless|sanctuary|prayer)\b/.test(lower) && !isBreath) {
                this.spawnProjectileOrSpellVfx('aura', ep.startPos, ep.startPos, 0x33ff88);
                if (this.audio && typeof this.audio.playRunicAura === 'function') {
                    this.audio.playRunicAura('heal', ep.pan);
                }
                if (isPlayerSource) {
                    this.triggerCastAnimation();
                }
                return;
            }
            let elemColor = 0xff7722;
            let elemType = 'fire';
            if (lower.includes('frost') || lower.includes('cold') || lower.includes('ice')) {
                elemColor = 0x88ddff;
                elemType = 'cold';
            } else if (lower.includes('acid')) {
                elemColor = 0x88ff33;
                elemType = 'acid';
            } else if (lower.includes('poison') || lower.includes('venom')) {
                elemColor = 0x33dd66;
                elemType = 'poison';
            } else if (lower.includes('chaos') || lower.includes('nether') || lower.includes('mana') || lower.includes('missile')) {
                elemColor = 0xbb55ff;
                elemType = 'magic';
            }
            this.spawnProjectileOrSpellVfx(isBreath ? 'breath' : 'fireball', ep.startPos, ep.endPos, elemColor);
            if ((isBreath || elemType === 'fire') && this.audio && typeof this.audio.playFireballDetonation === 'function') {
                this.audio.playFireballDetonation(isBreath, ep.pan);
            } else if (this.audio && typeof this.audio.playSpell === 'function') {
                this.audio.playSpell(elemType, ep.pan);
            }
            if (isPlayerSource) {
                this.triggerCastAnimation();
                this.spawnFloatingText(isBreath ? 'BREATH' : 'CAST', ep.startPos, '#ff9944', 1.10);
            } else {
                this.addTrauma(0.30);
                this.triggerHurtAnimation();
            }
            return;
        }

        // 3. Arrows / Bolts / Slings
        if (/\b(you shoot|you fire|shoots an arrow|fires a bolt|hits the|pierces|shoots a|fires a)\b/.test(lower) ||
            ((lower.includes('arrow') || lower.includes('bolt')) && (lower.includes('shoot') || lower.includes('fire')))) {
            this.spawnProjectileOrSpellVfx('arrow', ep.startPos, ep.endPos, 0xdbeafe);
            if (this.audio && typeof this.audio.playArrowLooseAndImpact === 'function') {
                this.audio.playArrowLooseAndImpact('loose', ep.pan);
            } else if (this.audio && typeof this.audio.playBowShoot === 'function') {
                this.audio.playBowShoot();
            }
            if (isPlayerSource) {
                this.triggerAttackAnimation();
                this.spawnFloatingText('SHOOT', ep.startPos, '#ffdd55', 1.05);
            }
            return;
        }

        // 4. Thrown Potions / Flasks / Items
        if (/\b(you throw|you hurl|shatters|flask of oil)\b/.test(lower)) {
            const potCol = lower.includes('oil') ? 0xcc6611 : 0x55ffaa;
            this.spawnProjectileOrSpellVfx('potion', ep.startPos, ep.endPos, potCol);
            if (this.audio && typeof this.audio.playPotionThrowAndShatter === 'function') {
                this.audio.playPotionThrowAndShatter('shatter', ep.pan);
            } else if (this.audio && typeof this.audio.playWhoosh === 'function') {
                this.audio.playWhoosh();
            }
            if (isPlayerSource) {
                this.triggerAttackAnimation();
                this.spawnFloatingText('THROW', ep.startPos, '#ffcc44', 1.05);
            }
            return;
        }

        // 5. Scrolls, Staves & Potions Quaffed
        if (/\b(you read|you recite|you use a staff|you quaff|you drink|you pray)\b/.test(lower)) {
            let auraColor = 0x66ccff;
            let auraKind = 'runic';
            if (lower.includes('quaff') || lower.includes('drink')) {
                auraColor = 0x33ff88;
                auraKind = 'potion';
            } else if (lower.includes('pray') || lower.includes('bless')) {
                auraColor = 0xffe066;
                auraKind = 'holy';
            }
            this.spawnProjectileOrSpellVfx('aura', ep.startPos, ep.startPos, auraColor);
            if (this.audio && typeof this.audio.playRunicAura === 'function') {
                this.audio.playRunicAura(auraKind, 0);
            } else if (lower.includes('quaff') || lower.includes('drink')) {
                if (this.audio && typeof this.audio.playQuaff === 'function') this.audio.playQuaff();
            } else {
                if (this.audio && typeof this.audio.playScroll === 'function') this.audio.playScroll();
            }
            this.spawnFloatingText((lower.includes('quaff') || lower.includes('drink')) ? 'QUAFF' : 'INVOKE', ep.startPos, '#88ffcc', 1.10);
            return;
        }

        // 6. Digging / Tunneling
        if (/\b(you tunnel|you dig|finished tunneling)\b/.test(lower)) {
            this.spawnHitSparks(ep.endPos, 0xa89f91, 14);
            if (this.audio && typeof this.audio.playDiggingStrike === 'function') {
                this.audio.playDiggingStrike(ep.pan);
            } else if (this.audio && typeof this.audio.playHit === 'function') {
                this.audio.playHit(false);
            }
            this.triggerAttackAnimation();
            this.spawnFloatingText('DIG', ep.endPos, '#c2b29d', 1.0);
            return;
        }

        // 7. Critical Melee Strikes
        if (lower.includes('critical hit') || lower.includes('was a good hit') || lower.includes('was a great hit') || lower.includes('was a superb hit') || lower.includes('great force') || lower.includes('superb') || lower.includes('痛恨')) {
            this.addTrauma(0.25);
            this.spawnFloatingText('CRITICAL!', ep.endPos.clone().add(new THREE.Vector3(0, 0.25, 0)), '#ffd700', 1.35);
            this.spawnProjectileOrSpellVfx('crit_slash', ep.startPos, ep.endPos, 0xffd700);
            this.triggerMonsterHitReaction(ep.monsterEntity);
            if (this.audio && typeof this.audio.playWeaponImpact === 'function') {
                this.audio.playWeaponImpact('blade', true, ep.pan);
            } else if (this.audio && typeof this.audio.playCrit === 'function') {
                this.audio.playCrit();
            }
            this.triggerAttackAnimation();
            return;
        }

        // 8. Normal Melee Strikes
        if (lower.includes('you hit') || lower.includes('you strike') || lower.includes('you slash') || lower.includes('you crush') || lower.includes('you smite') || lower.includes('you stab') || lower.includes('you gouge')) {
            let weaponCat = 'blade';
            if (lower.includes('crush') || lower.includes('hammer') || lower.includes('club') || lower.includes('mace')) weaponCat = 'blunt';
            else if (lower.includes('stab') || lower.includes('gouge') || lower.includes('spear')) weaponCat = 'pierce';
            const vfxKind = weaponCat === 'blunt' ? 'blunt' : (weaponCat === 'pierce' ? 'pierce' : 'slash');
            const vfxColor = weaponCat === 'blunt' ? 0xffaa44 : (weaponCat === 'pierce' ? 0x88eeff : 0xff4444);
            this.spawnProjectileOrSpellVfx(vfxKind, ep.startPos, ep.endPos, vfxColor);
            this.triggerMonsterHitReaction(ep.monsterEntity);
            if (this.audio && typeof this.audio.playWeaponImpact === 'function') {
                this.audio.playWeaponImpact(weaponCat, false, ep.pan);
            } else if (this.audio && typeof this.audio.playHit === 'function') {
                this.audio.playHit(false);
            }
            this.triggerAttackAnimation();
            this.spawnFloatingText('HIT', ep.endPos, '#ffaa33', 1.05);
            return;
        }

        // 9. Monster Strikes Player
        if (lower.includes('hits you') || lower.includes('bites you') || lower.includes('claws you') || lower.includes('crushes you') || lower.includes('stings you') || lower.includes('burns you')) {
            this.addTrauma(0.35);
            this.spawnFloatingText('OUCH!', ep.endPos, '#ff3333', 1.15);
            this.spawnHitSparks(ep.endPos, '#ff2222', 14);
            this.triggerHurtAnimation();
            if (this.audio && typeof this.audio.playPlayerHurt === 'function') this.audio.playPlayerHurt();
            return;
        }

        // 10. Deflect / Block
        if (lower.includes('deflect') || lower.includes('blocks the blow') || lower.includes('parr') || lower.includes('bounces off')) {
            this.spawnFloatingText('BLOCK', ep.endPos, '#55bbff', 1.05);
            this.spawnHitSparks(ep.endPos, '#88ddff', 10);
            if (this.audio && typeof this.audio.playShieldBlock === 'function') this.audio.playShieldBlock();
            return;
        }

        // 11. Misses
        if (lower.includes('you miss') || lower.includes('misses you')) {
            if (lower.includes('you miss')) this.triggerAttackAnimation();
            this.spawnFloatingText('MISS', ep.endPos, '#a0b0c0', 0.95);
            if (this.audio && typeof this.audio.playWhoosh === 'function') this.audio.playWhoosh();
            return;
        }

        // 12. Monster Slain
        if (lower.includes('you have slain') || lower.includes('is destroyed') || lower.includes('dies.') || lower.includes('is slain') || lower.includes('倒した') || lower.includes('葬り去った')) {
            this.spawnFloatingText('SLAIN!', ep.endPos.clone().add(new THREE.Vector3(0, 0.25, 0)), '#ff44aa', 1.30);
            this.spawnDetonationDome(ep.endPos, 0xff44aa, 0.75);
            this.spawnHitSparks(ep.endPos, '#ff44aa', 24);
            this.triggerMonsterHitReaction(ep.monsterEntity, true);
            if (this.audio && typeof this.audio.playMonsterDeath === 'function') {
                this.audio.playMonsterDeath(mGlyph, ep.pan);
            }
            return;
        }

        // 13. Other environmental & UI triggers
        if ((lower.includes('wall') || lower.includes('door') || lower.includes('rubble')) && (lower.includes('blocking your way') || lower.includes('cannot see where you are going') || lower.includes('in your way'))) {
            this.addTrauma(0.08);
            this.spawnFloatingText('BLOCKED', ep.endPos, '#aaaaaa', 0.95);
            if (this.audio && typeof this.audio.playWallBump === 'function') this.audio.playWallBump();
        } else if (lower.includes('you open the door') || lower.includes('the door opens')) {
            if (this.audio && typeof this.audio.playDoor === 'function') this.audio.playDoor(true);
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
        } else if (lower.includes('chest') && (lower.includes('open') || lower.includes('unlock'))) {
            if (this.audio && typeof this.audio.playChest === 'function') this.audio.playChest();
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

    snapCameraToDefault() {
        // Snap camera direction and pitch back to character default upon movement
        this.userPitchOffset = 0.0;
        const defaultYaw = -this.facing * (Math.PI / 2);
        // Find closest equivalent angle to avoid long spin
        const cur = this.targetYaw || 0;
        const diff = defaultYaw - cur;
        const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.targetYaw = cur + wrapped;
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
            if (this.realm !== 'silq') {
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
        return feat === 1 || feat === 2 || feat === 3 || feat === 4 || feat === 5 || feat === 6 || feat === 16 || feat === 23 || feat === 24 || feat === 25 || feat === 26 || feat === 27 || feat === 28 || feat === 29 || feat === 31 || feat === 37 || feat === 41 || feat === 42 || this.isStoreKind(feat);
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
    computeTileShade(targetColor, baseColor, inView, outdoors, lighting, x = 0, y = 0, isRoom = false, depth = 0) {
        targetColor.copy(baseColor);

        // Organic stone block variation (gated by tileVariation flag, breaks up monochromatic repetition)
        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.tileVariation) && (x !== 0 || y !== 0)) {
            const hash = ((x * 43) ^ (y * 79)) & 0xff;
            let lum = ((hash % 11) - 5) * 0.012; // -0.06 to +0.06 subtle stone luminance variation
            let warm = ((hash % 7) - 3) * 0.008; // subtle warm undertone

            // Coherent Spatial Cluster Shading & Geological formations
            if (!outdoors && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.biomeVariation)) {
                const cx = Math.floor(x / 4);
                const cy = Math.floor(y / 4);
                const cluster = (((cx * 374761393) ^ (cy * 668265263) ^ (this.currentLevelSeed || 0)) >>> 0) & 0xff;

                if (cluster < 42) {
                    // ~16% natural geological formations matched to 4-level progressive depth chapters
                    if (depth <= 4) {
                        // Chapter 1: Upper Crypts (50–200 ft) — dry soot & crumbling mortar
                        lum -= 0.040;
                        warm -= 0.015;
                    } else if (depth <= 8) {
                        // Chapter 2: Flooded Undercrofts (250–400 ft) — wet water seepage & slick algae
                        targetColor.g = Math.min(1.0, targetColor.g + 0.035);
                        targetColor.b = Math.min(1.0, targetColor.b + 0.045);
                        lum -= 0.035;
                    } else if (depth <= 12) {
                        // Chapter 3: Deep Sepulchre (450–600 ft) — ancient sandstone, sarcophagus dust, terracotta saltpeter
                        targetColor.r = Math.min(1.0, targetColor.r + 0.055);
                        targetColor.g = Math.min(1.0, targetColor.g + 0.025);
                        lum += 0.015;
                        warm += 0.025;
                    } else if (depth <= 16) {
                        // Chapter 4: Overgrown Catacombs (650–800 ft) — verdant lichen, bioluminescent fungal spores
                        targetColor.g = Math.min(1.0, targetColor.g + 0.065);
                        targetColor.r = Math.max(0.05, targetColor.r - 0.025);
                    } else if (depth <= 20) {
                        // Chapter 5: Chasm Threshold (850–1000 ft) — rough ironstone & rust veins
                        targetColor.r = Math.min(1.0, targetColor.r + 0.045);
                        targetColor.b = Math.max(0.05, targetColor.b - 0.020);
                        lum -= 0.030;
                    } else if (depth <= 35) {
                        // Chapter 6: Crystal Caverns (1050–1750 ft) — amethyst & sapphire mineral streaks
                        targetColor.b = Math.min(1.0, targetColor.b + 0.065);
                        targetColor.r = Math.min(1.0, targetColor.r + 0.030);
                    } else if (depth <= 60) {
                        // Chapter 7: Magma Underworld (1800–3000 ft) — thermal stress glow, ember fissures
                        targetColor.r = Math.min(1.0, targetColor.r + 0.070);
                        targetColor.g = Math.min(1.0, targetColor.g + 0.025);
                        targetColor.b = Math.max(0.05, targetColor.b - 0.035);
                    } else if (depth <= 85) {
                        // Chapter 8: Abyssal Nether Vaults (3050–4250 ft) — void shadow seepages & necrotic stains
                        targetColor.r = Math.min(1.0, targetColor.r + 0.025);
                        targetColor.b = Math.min(1.0, targetColor.b + 0.050);
                        lum -= 0.050;
                    } else {
                        // Chapter 9: Morgoth's Iron Citadel (4300–5000 ft) — obsidian blackness & blood crimson veins
                        targetColor.r = Math.min(1.0, targetColor.r + 0.080);
                        lum -= 0.060;
                    }
                }

                // Room vs Corridor Foot-Traffic Differentiation
                if (isRoom) {
                    lum += 0.025; // Cleaner, open chamber ashlar paving
                } else {
                    lum -= 0.020; // Rougher, worn tunnel footpath
                }
            }

            targetColor.r = Math.max(0.05, Math.min(1.0, targetColor.r + lum + warm));
            targetColor.g = Math.max(0.05, Math.min(1.0, targetColor.g + lum));
            targetColor.b = Math.max(0.05, Math.min(1.0, targetColor.b + lum - warm * 0.5));
        }

        if (inView && (outdoors || lighting === 2 || lighting === 0 || lighting === 1)) {
            return targetColor;
        } else if (inView && lighting === 3) {
            return targetColor.multiply(this._tintDark);
        } else {
            const memTint = (lighting === 2) ? this._tintMemLit : this._tintMemDark;
            return targetColor.multiply(memTint);
        }
    }

    determineDoorOrientation(map, x, y, w, h) {
        const featN = this.getFeatAt(map, x, y - 1);
        const featS = this.getFeatAt(map, x, y + 1);
        const featW = this.getFeatAt(map, x - 1, y);
        const featE = this.getFeatAt(map, x + 1, y);

        const wallN = this.isSolidWall(featN) || y <= 0;
        const wallS = this.isSolidWall(featS) || y >= h - 1;
        const wallW = this.isSolidWall(featW) || x <= 0;
        const wallE = this.isSolidWall(featE) || x >= w - 1;

        const walkN = this.isWalkableOrPortal(featN);
        const walkS = this.isWalkableOrPortal(featS);
        const walkW = this.isWalkableOrPortal(featW);
        const walkE = this.isWalkableOrPortal(featE);

        const scoreX = (wallW ? 3 : 0) + (wallE ? 3 : 0) + (walkN ? 1 : 0) + (walkS ? 1 : 0);
        const scoreZ = (wallN ? 3 : 0) + (wallS ? 3 : 0) + (walkW ? 1 : 0) + (walkE ? 1 : 0);

        if (scoreZ > scoreX) return Math.PI / 2;
        return 0;
    }

    determineShopDoorOrientation(map, x, y, w, h) {
        const featN = this.getFeatAt(map, x, y - 1);
        const featS = this.getFeatAt(map, x, y + 1);
        const featW = this.getFeatAt(map, x - 1, y);
        const featE = this.getFeatAt(map, x + 1, y);

        const bldgN = this.isSolidWall(featN) || this.isStoreKind(featN) || y <= 0;
        const bldgS = this.isSolidWall(featS) || this.isStoreKind(featS) || y >= h - 1;
        const bldgW = this.isSolidWall(featW) || this.isStoreKind(featW) || x <= 0;
        const bldgE = this.isSolidWall(featE) || this.isStoreKind(featE) || x >= w - 1;

        const streetN = !bldgN;
        const streetS = !bldgS;
        const streetW = !bldgW;
        const streetE = !bldgE;

        // Facing exterior street (middle of building edges)
        if (bldgN && streetS && bldgW && bldgE) return 0; // South (+Z)
        if (bldgS && streetN && bldgW && bldgE) return Math.PI; // North (-Z)
        if (bldgW && streetE && bldgN && bldgS) return Math.PI / 2; // East (+X)
        if (bldgE && streetW && bldgN && bldgS) return -Math.PI / 2; // West (-X)

        // Corner cases (building on 2 adjacent sides, street on opposite sides - 1:1 with Godot DungeonWorld.cs:2261-2265)
        if (bldgN && bldgE && streetS && streetW) return 0; // SW corner -> Face South
        if (bldgN && bldgW && streetS && streetE) return 0; // SE corner -> Face South
        if (bldgS && bldgE && streetN && streetW) return Math.PI; // NW corner -> Face North
        if (bldgS && bldgW && streetN && streetE) return Math.PI; // NE corner -> Face North

        if (streetS) return 0;
        if (streetN) return Math.PI;
        if (streetE) return Math.PI / 2;
        if (streetW) return -Math.PI / 2;

        return 0;
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

        // Mortal peril tactile pulse (< 20% health)
        if (frame.player && frame.player.mhp > 0 && (frame.player.hp / frame.player.mhp) <= 0.20) {
            vignetteEl.classList.add('danger-pulse');
        } else {
            vignetteEl.classList.remove('danger-pulse');
        }
    }

    applyGraphicsConfig() {
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
        if (!cfg.torchInertia) {
            this.torchLight.position.set(-0.25, -0.05, -0.28);
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
        h = Math.imul(h ^ (torchRadius & 0xff), 16777619) >>> 0;
        const rLen = realm ? realm.length : 0;
        h = Math.imul(h ^ rLen, 16777619) >>> 0;
        if (!map || !map.rows) return h;
        for (let y = minY; y <= maxY; y++) {
            const row = map.rows[y];
            if (!row) continue;
            if (row.f) {
                const fStr = row.f;
                const startIdx = minX * 2;
                const endIdx = Math.min(fStr.length - 1, (maxX + 1) * 2);
                for (let i = startIdx; i <= endIdx; i += 4) {
                    h = Math.imul(h ^ fStr.charCodeAt(i), 16777619) >>> 0;
                }
            }
            if (row.flags) {
                const flgStr = row.flags;
                const startIdx = minX * 2;
                const endIdx = Math.min(flgStr.length - 1, (maxX + 1) * 2);
                for (let i = startIdx; i <= endIdx; i += 4) {
                    h = Math.imul(h ^ flgStr.charCodeAt(i), 16777619) >>> 0;
                }
            }
        }
        return h;
    }

    update(frame) {
        if (!frame || !frame.map) return;
        this.updateDungeon(frame);
    }

    updateDungeon(frame) {
        const map = frame.map;
        const w = map.w || (map.rows && map.rows[0] && map.rows[0].f ? map.rows[0].f.length / 2 : 0);
        const h = map.h || (map.rows ? map.rows.length : 0);
        if (!w || !h) return;
        this.lastMap = map;
        this.lastFrame = frame;

        // Environmental Adaptive Vignette (updates based on depth, room lighting, and health)
        this.updateAdaptiveVignette(frame);

        const px = frame.player ? frame.player.x : Math.floor(w / 2);
        const py = frame.player ? frame.player.y : Math.floor(h / 2);
        const depth = (frame.player && frame.player.depth !== undefined) ? frame.player.depth : 0;
        let hasWilderness = false;
        if (map && map.rows) {
            for (let r = 0; r < Math.min(map.rows.length, 12); r++) {
                const row = map.rows[r];
                if (row && row.f) {
                    for (let c = 0; c < row.f.length; c += 2) {
                        const fVal = parseInt(row.f.substring(c, c + 2), 16);
                        if (fVal >= 25 && fVal <= 31) {
                            hasWilderness = true;
                            break;
                        }
                    }
                }
                if (hasWilderness) break;
            }
        }
        // Strict Invariant: Outdoors is ONLY depth 0 (Town or Wilderness). Subterranean dungeons (depth > 0)
        // are always indoors with solid stone ceilings, preventing sunlight tiles/vaults from stripping ceilings.
        const outdoors = (depth === 0);

        // Detect stairs / depth transitions
        if (this.lastDepth !== null && this.lastDepth !== undefined && this.lastDepth !== depth) {
            if (this.audio) {
                this.audio.playStairs(depth > this.lastDepth);
                this.audio.playLevelEnter();
            }
        }
        this.lastDepth = depth;

        // Update Viewmodel Equipment rules & Dynamic character height
        this.updateViewmodel(frame.player);

        // Deterministic level seed derived from depth, dimensions, and map layout topology
        const levelSeed = ((depth * 73856093) ^ (w * 19349663) ^ (h * 83492791) ^ (map.rows && map.rows[0] && map.rows[0].f ? parseInt(map.rows[0].f.substring(0, 8), 16) : 0)) >>> 0;
        this.currentLevelSeed = levelSeed;

        // Resolve realm context
        const realm = (frame && (frame.realm || (frame.player && frame.player.realm)))
            || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : (this.realm || 'angband'));
        this.realm = realm ? realm.toLowerCase() : 'angband';

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

        this.sunLight.visible = biome.sunLight;
        this.sunLight.intensity = biome.sunEnergy;

        this.ambientLight.color.setHex(biome.ambientColor);
        this.ambientLight.intensity = biome.ambientEnergy;

        this.renderer.toneMappingExposure = biome.exposure;

        // Extract torch radius from player (cur_light or light)
        const lightProp = (frame.player && (frame.player.cur_light !== undefined ? frame.player.cur_light : frame.player.light));
        this.torchRadius = Math.max(1, typeof lightProp === 'number' ? lightProp : 1);

        if (outdoors) {
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
        // _torch.OmniRange = (_torchRadius + 2.5f) * Cell + 2.0f;
        const torchRange = (this.torchRadius + 2.5) * this.cellSize + 2.0;
        if (this.torchBaseColor) this.torchBaseColor.setHex(biome.torchColor);
        this.torchLight.color.setHex(biome.torchColor);
        this.torchLight.distance = torchRange;
        this.torchLight.decay = 1.0;

        // Forward vector for camera-relative VFX placement
        const fwdYaw = this.camera ? this.camera.rotation.y : 0;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), fwdYaw);
        const spawnInFront = this.currentCamPos.clone().addScaledVector(forward, 1.1).add(new THREE.Vector3(0, 0.2, 0));

        // Player HP delta tracking for floating damage/healing & camera trauma
        if (frame.player) {
            const curHp = frame.player.hp !== undefined ? frame.player.hp : null;
            if (curHp !== null && this.lastPlayerHp !== null) {
                if (curHp < this.lastPlayerHp) {
                    const dmg = this.lastPlayerHp - curHp;
                    this.spawnFloatingText(`-${dmg}`, spawnInFront, '#ff3333', 1.25);
                    this.addTrauma(Math.min(0.65, dmg / (frame.player.hp_max || 20)));
                    this.spawnHitSparks(spawnInFront, '#ff2222', 14);
                    this.triggerHurtAnimation();
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

        // Parse recent game messages for kinetic combat feedback ("Juice") (1:1 with Godot DungeonWorld.cs)
        if (frame.messages && Array.isArray(frame.messages)) {
            for (const msgObj of frame.messages) {
                const msgText = typeof msgObj === 'string' ? msgObj : (msgObj && msgObj.text ? msgObj.text : '');
                if (!msgText || this.processedMessages.has(msgText)) continue;
                this.processedMessages.add(msgText);
                if (this.processedMessages.size > 200) {
                    const first = this.processedMessages.values().next().value;
                    this.processedMessages.delete(first);
                }

                this.triggerMessageVfx(msgText);
            }
        }

        const playerFeat = this.getFeatAt(map, px, py);
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
        this.playerWaterYOffset = waterYOffset;

        this.targetCamPos.set(px * this.cellSize, this.eyeHeight + waterYOffset, py * this.cellSize);

        const dist = this.currentCamPos.distanceTo(this.targetCamPos);
        if (dist > this.cellSize * 1.5) {
            this.currentCamPos.copy(this.targetCamPos);
            this.isStepping = false;
            this.stepPlayedThisMove = false;
        } else if (dist > 0.05) {
            this.isStepping = true;
            this.stepTime = 0;
            const now = performance.now();
            if (!this.lastStepSoundTime) this.lastStepSoundTime = 0;
            if (!this.stepPlayedThisMove && (now - this.lastStepSoundTime > 200)) {
                this.stepPlayedThisMove = true;
                this.lastStepSoundTime = now;
                if (this.audio) {
                    this.audio.playFootstep(outdoors, this.heightRatio || 1.0, footstepSurface);
                }
            }
        }

        // MultiMesh instance counts reset
        let wallCount = 0;
        let permWallCount = 0;
        let wallJointIdx = 0;
        const maxWallJoints = this.wallJointMesh ? this.wallJointMesh.instanceMatrix.count : 0;
        let floorCount = 0;
        let ceilingCount = 0;
        let doorFrameCount = 0;
        let shopFrameCount = 0;
        let doorCount = 0;
        let doorOpenCount = 0;
        let doorBrokenCount = 0;
        let lavaCount = 0;
        let lavaCooledCount = 0;
        let stairsCount = 0;
        let stairsUpCount = 0;
        let magmaCount = 0;
        let quartzCount = 0;
        let goldVeinCount = 0;
        let gemVeinCount = 0;
        let treeCount = 0;
        let bushCount = 0;
        let grassCount = 0;
        let dirtCount = 0;
        let waterCount = 0;
        let deepWaterCount = 0;
        let mountainCount = 0;
        let swampCount = 0;
        let rubbleCount = 0;
        let trapCount = 0;
        let chasmIdx = 0;
        let chasmVoidIdx = 0;
        const shopCounts = [0, 0, 0, 0, 0, 0, 0, 0];

        if (outdoors) {
            if (this._terrainAnchorDepth !== depth ||
                this._terrainAnchorRealm !== this.realm ||
                this._terrainAnchorX === undefined ||
                this._terrainAnchorY === undefined ||
                Math.abs(px - this._terrainAnchorX) > 6 ||
                Math.abs(py - this._terrainAnchorY) > 6) {
                this._terrainAnchorX = px;
                this._terrainAnchorY = py;
                this._terrainAnchorDepth = depth;
                this._terrainAnchorRealm = this.realm;
            }
        }

        const anchorX = outdoors ? this._terrainAnchorX : px;
        const anchorY = outdoors ? this._terrainAnchorY : py;
        const sightRange = outdoors ? 30 : 22;
        const minX = Math.max(0, anchorX - sightRange);
        const maxX = Math.min(w - 1, anchorX + sightRange);
        const minY = Math.max(0, anchorY - sightRange);
        const maxY = Math.min(h - 1, anchorY + sightRange);

        const sig = this._computeTerrainSig(anchorX, anchorY, depth, this.torchRadius, this.realm, map, minY, maxY, minX, maxX);
        this.playerGridX = px;
        this.playerGridY = py;
        this.updateStreetViewAndCursor(frame);

        if (this._lastTerrainSig === sig) {
            this.updateMonsters(frame.monsters || [], frame.player);
            this.updateItems(frame.objects || frame.items || [], frame.player);
            this.updateTerrainLabels(map, w, h, depth, px, py);
            return;
        }
        this._lastTerrainSig = sig;
        this.markShadowsDirty();

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dx = x - anchorX, dy = y - anchorY;
                const distSq = dx * dx + dy * dy;
                if (distSq > (outdoors ? 784 : 324)) continue; // 28m radius around anchor outdoors, 18-tile indoors

                let feat = this.getFeatAt(map, x, y);
                const glyph = this.getGlyphAt(map, x, y);
                const tileAttr = this.getAttrAt(map, x, y);

                // FrogComposBand Bottomless Pit (feat 41): grey '#' in FrogComposBand
                if (this.realm === 'frogcomposband' && glyph === '#' && (tileAttr === 2 || tileAttr === 8 || tileAttr === 9 || feat === 41)) {
                    feat = 41;
                }

                // Disambiguate Tree (feat 25) vs Grass (feat 26):
                // In Angband and roguelike variants, open ground / lawn / meadow is '.' (or ',', '\'').
                // Trees are solid obstacles represented by '#' (or '%', '*', '&', 'T').
                // A green '.' is GRASS, NEVER a 3D tree!
                const isSilQSunlight = (this.realm === 'silq' && feat === 25);
                if (!isSilQSunlight) {
                    if (feat === 25 && (glyph === '.' || glyph === ',' || glyph === "'")) {
                        feat = 26; // Feat 26: Grass
                    } else if (feat === 26 && (glyph === '#' || glyph === '%' || glyph === '&' || glyph === 'T')) {
                        feat = 25; // Feat 25: Tree
                    }
                }

                const flag = this.getFlagAt(map, x, y);

                let known = outdoors || (flag & 0x1) !== 0;
                let inView = outdoors || (flag & 0x2) !== 0;
                let lighting = (flag >> 2) & 0x3; // 0=LOS lit, 1=torch, 2=room lit, 3=dark

                // Unexplored dark space (not known and not in view) or feat 0 must NOT be rendered.
                // True fog-of-war (1:1 with Godot DungeonWorld.cs:2410-2415):
                // Open unexplored areas remain pure misty blackness fading into subterranean depth fog.
                if (feat === 0 || (!known && !inView)) {
                    continue;
                }

                const isWall = feat === 15 || feat === 21 || feat === 22 || feat === 17 || feat === 18 || feat === 19 || feat === 20 || feat === 30;

                // Interior rock culling (1:1 with Godot DungeonWorld.cs:2386-2412):
                // If all 8 neighbors are solid walls/skip (no adjacent floor, door, rubble, or open space),
                // this wall is completely buried within the dungeon bedrock and has no exposed visible faces.
                if (isWall) {
                    let hasAdjacentOpen = false;
                    for (let dy = -1; dy <= 1 && !hasAdjacentOpen; dy++) {
                        for (let dx = -1; dx <= 1 && !hasAdjacentOpen; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const nFeat = this.getFeatAt(map, nx, ny);
                                if (this.isWalkableOrPortal(nFeat)) {
                                    hasAdjacentOpen = true;
                                }
                            }
                        }
                    }
                    if (!hasAdjacentOpen) {
                        continue;
                    }
                }

                // In subterranean dungeon (!outdoors), do not render memorized floors/ceilings
                // that are outside line of sight and outside the immediate torchlight vicinity.
                // This eliminates the glitch where distant memorized rooms float across the black void!
                if (!outdoors && !inView) {
                    const distSq = (x - px) * (x - px) + (y - py) * (y - py);
                    if (distSq > (this.torchRadius + 3) * (this.torchRadius + 3)) {
                        continue;
                    }
                }

                // Distance check for illumination (1:1 with Godot DungeonWorld.cs:2443-2451)
                if (lighting === 3 && inView) {
                    const distSq = (x - px) * (x - px) + (y - py) * (y - py);
                    if (distSq <= (this.torchRadius + 1) * (this.torchRadius + 1)) {
                        lighting = 1;
                    }
                }

                // Tile shade computation without heap allocations (1:1 with Godot DungeonWorld.cs:2453-2471)
                const isRoom = (lighting === 2);
                const wallShade = this.computeTileShade(this._scratchWallColor, biome.wallColor, inView, outdoors, lighting, x, y, isRoom, depth);
                const floorShade = this.computeTileShade(this._scratchFloorColor, biome.floorColor, inView, outdoors, lighting, x, y, isRoom, depth);
                const ceilingShade = this.computeTileShade(this._scratchCeilingColor, biome.ceilingColor, inView, outdoors, lighting, x, y, isRoom, depth);

                const useVariation = !window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.tileVariation;
                const floorRot = useVariation ? (((x * 73 + y * 37) % 4) * (Math.PI / 2)) : 0;
                const wallRot = useVariation ? (((x * 89 + y * 41) % 4) * (Math.PI / 2)) : 0;
                const ceilingRot = useVariation ? (((x * 53 + y * 67) % 4) * (Math.PI / 2)) : 0;

                const wx = x * this.cellSize;
                const wz = y * this.cellSize;
                const wallYCenter = this.wallHeight / 2;

                // Plain Magma fissures (list-terrain.h feat 17=MAGMA)
                if (feat === 17) {
                    // Seal chamfered corner base with floor quad
                    if (floorCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        this.floorMesh.setColorAt(floorCount, floorShade);
                        floorCount++;
                    }

                    this.dummy.position.set(wx, wallYCenter, wz);
                    this.dummy.rotation.set(0, wallRot, 0);
                    this.dummy.updateMatrix();
                    this.magmaMesh.setMatrixAt(magmaCount, this.dummy.matrix);
                    this.magmaMesh.setColorAt(magmaCount, wallShade);
                    magmaCount++;

                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight + 0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Plain Quartz crystal veins (list-terrain.h feat 18=QUARTZ)
                if (feat === 18) {
                    // Seal chamfered corner base with floor quad
                    if (floorCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        this.floorMesh.setColorAt(floorCount, floorShade);
                        floorCount++;
                    }

                    this.dummy.position.set(wx, wallYCenter, wz);
                    this.dummy.rotation.set(0, wallRot, 0);
                    this.dummy.updateMatrix();
                    this.quartzMesh.setMatrixAt(quartzCount, this.dummy.matrix);
                    this.quartzMesh.setColorAt(quartzCount, wallShade);
                    quartzCount++;

                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight + 0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Magma Vein with Gold Treasure (feat 19=MAGMA_K) - Rich metallic gold nuggets in dark basalt
                if (feat === 19) {
                    // Seal chamfered corner base with floor quad
                    if (floorCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        this.floorMesh.setColorAt(floorCount, floorShade);
                        floorCount++;
                    }

                    this.dummy.position.set(wx, wallYCenter, wz);
                    this.dummy.rotation.set(0, wallRot, 0);
                    this.dummy.updateMatrix();
                    this.goldVeinMesh.setMatrixAt(goldVeinCount, this.dummy.matrix);
                    this.goldVeinMesh.setColorAt(goldVeinCount, wallShade);
                    goldVeinCount++;

                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight + 0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Quartz Vein with Gemstones (feat 20=QUARTZ_K) - Sparkling multifaceted emeralds, rubies, sapphires
                if (feat === 20) {
                    // Seal chamfered corner base with floor quad
                    if (floorCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        this.floorMesh.setColorAt(floorCount, floorShade);
                        floorCount++;
                    }

                    this.dummy.position.set(wx, wallYCenter, wz);
                    this.dummy.rotation.set(0, wallRot, 0);
                    this.dummy.updateMatrix();
                    this.gemVeinMesh.setMatrixAt(gemVeinCount, this.dummy.matrix);
                    this.gemVeinMesh.setColorAt(gemVeinCount, wallShade);
                    gemVeinCount++;

                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight + 0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Alpine Mountain Peaks (feat 30=MOUNTAIN) - Towering craggy alpine massif
                if (feat === 30) {
                    if (mountainCount < this.maxInstances) {
                        this.dummy.position.set(wx, 0, wz);
                        this.dummy.rotation.set(0, wallRot, 0);
                        this.dummy.updateMatrix();
                        const mountainShade = this.computeTileShade(this._scratchMountainColor, this.getBaseColour(30, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.mountainMesh.setMatrixAt(mountainCount, this.dummy.matrix);
                        this.mountainMesh.setColorAt(mountainCount, mountainShade);
                        mountainCount++;
                    }
                    continue;
                }

                // Solid Stone / Granite / Perm / Secret wall (feat 15=SECRET, 21=GRANITE, 22=PERM)
                if (feat === 15 || feat === 21 || feat === 22) {
                    let hasExposedFace = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const nFeat = this.getFeatAt(map, nx, ny);
                                if (this.isWalkableOrPortal(nFeat)) {
                                    hasExposedFace = true;
                                    break;
                                }
                            }
                        }
                        if (hasExposedFace) break;
                    }
                    if (!hasExposedFace) continue; // Interior bedrock culling

                    // Seal chamfered corner base with floor quad
                    if (floorCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                        this.floorMesh.setColorAt(floorCount, floorShade);
                        floorCount++;
                    }

                    this.dummy.position.set(wx, wallYCenter, wz);
                    this.dummy.rotation.set(0, 0, 0); // Wall masonry running-bond courses must ALWAYS remain horizontal!
                    this.dummy.updateMatrix();
                    let activeWallShade = wallShade;
                    if (feat === 22) {
                        if (permWallCount < this.maxInstances) {
                            const permShade = this.computeTileShade(this._scratchPermWallColor, this.getBaseColour(22, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                            activeWallShade = permShade;
                            this.permWallMesh.setMatrixAt(permWallCount, this.dummy.matrix);
                            this.permWallMesh.setColorAt(permWallCount, permShade);
                            permWallCount++;
                        }
                    } else {
                        if (wallCount < this.maxInstances) {
                            this.wallMesh.setMatrixAt(wallCount, this.dummy.matrix);
                            this.wallMesh.setColorAt(wallCount, wallShade);
                            wallCount++;
                        }
                    }

                    if (this.wallJointMesh && wallJointIdx < maxWallJoints) {
                        const isSolidMasonryWallAt = (gx, gy) => {
                            if (gx < minX || gx > maxX || gy < minY || gy > maxY) return false;
                            const nFlag = this.getFlagAt(map, gx, gy);
                            if (!outdoors && (nFlag & 0x3) === 0) return false;
                            const nFeat = this.getFeatAt(map, gx, gy);
                            const nGlyph = this.getGlyphAt(map, gx, gy);
                            const nAttr = this.getAttrAt(map, gx, gy);
                            if (this.realm === 'frogcomposband' && nGlyph === '#' && (nAttr === 2 || nAttr === 8 || nAttr === 9 || nFeat === 41)) {
                                return false;
                            }
                            return nFeat === 15 || (nFeat >= 17 && nFeat <= 22);
                        };
                        if (isSolidMasonryWallAt(x + 1, y) && wallJointIdx < maxWallJoints) {
                            this.dummy.position.set(wx + this.cellSize * 0.5, this.wallHeight / 2 - 0.05, wz);
                            this.dummy.rotation.set(0, 0, 0);
                            this.dummy.scale.set(1, 1, 1);
                            this.dummy.updateMatrix();
                            this.wallJointMesh.setMatrixAt(wallJointIdx, this.dummy.matrix);
                            this.wallJointMesh.setColorAt(wallJointIdx, activeWallShade);
                            wallJointIdx++;
                        }
                        if (isSolidMasonryWallAt(x, y + 1) && wallJointIdx < maxWallJoints) {
                            this.dummy.position.set(wx, this.wallHeight / 2 - 0.05, wz + this.cellSize * 0.5);
                            this.dummy.rotation.set(0, Math.PI / 2, 0);
                            this.dummy.scale.set(1, 1, 1);
                            this.dummy.updateMatrix();
                            this.wallJointMesh.setMatrixAt(wallJointIdx, this.dummy.matrix);
                            this.wallJointMesh.setColorAt(wallJointIdx, activeWallShade);
                            wallJointIdx++;
                        }
                    }

                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight + 0.05, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Store Entrances (feat 7 to 14) and Special Town Buildings (feat 32 to 40)
                let shopIdx = -1;
                if (feat >= 7 && feat <= 14) {
                    shopIdx = feat - 7;
                } else if (feat >= 32 && feat <= 40) {
                    switch (feat) {
                        case 32: shopIdx = 7; break; // Castle / Guild / Mayor -> Regal Home facade
                        case 33: shopIdx = 0; break; // Inn / Tavern -> General Store / Tavern
                        case 34: shopIdx = 4; break; // Healer -> Alchemy
                        case 35: shopIdx = 5; break; // Museum -> Magic
                        case 36: shopIdx = 6; break; // Casino -> Black Market
                        case 37: shopIdx = 2; break; // Forge -> Weaponsmith
                        case 38: shopIdx = 3; break; // Pagoda / Temple -> Temple
                        case 39: shopIdx = 3; break; // Bookstore -> Bookseller
                        case 40: shopIdx = 0; break; // Stable -> General
                        default: shopIdx = 0; break;
                    }
                }
                if (shopIdx >= 0 && shopIdx < 8) {
                    // Floor underneath shop entrance
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, floorShade);
                    floorCount++;

                    // Align full-depth stone masonry frame and heraldic entrance door to face outward into street
                    const doorYaw = this.determineShopDoorOrientation(map, x, y, w, h);
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    this.shopFrameMesh.setMatrixAt(shopFrameCount, this.dummy.matrix);
                    this.shopFrameMesh.setColorAt(shopFrameCount, wallShade);
                    shopFrameCount++;

                    this.shopMeshes[shopIdx].setMatrixAt(shopCounts[shopIdx], this.dummy.matrix);
                    this.shopMeshes[shopIdx].setColorAt(shopCounts[shopIdx], wallShade);
                    shopCounts[shopIdx]++;

                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Closed Dungeon Door (feat 2)
                if (feat === 2) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, floorShade);
                    floorCount++;

                    const doorYaw = this.determineDoorOrientation(map, x, y, w, h);
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    this.doorFrameMesh.setMatrixAt(doorFrameCount, this.dummy.matrix);
                    this.doorFrameMesh.setColorAt(doorFrameCount, wallShade);
                    doorFrameCount++;

                    this.doorMesh.setMatrixAt(doorCount, this.dummy.matrix);
                    this.doorMesh.setColorAt(doorCount, wallShade);
                    doorCount++;

                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Open Dungeon Door (feat 3) — Swung-open door leaf angled ajar 70° (DungeonWorld.cs:1594-1631)
                if (feat === 3) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, floorShade);
                    floorCount++;

                    const doorYaw = this.determineDoorOrientation(map, x, y, w, h);
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    this.doorFrameMesh.setMatrixAt(doorFrameCount, this.dummy.matrix);
                    this.doorFrameMesh.setColorAt(doorFrameCount, wallShade);
                    doorFrameCount++;

                    this.doorOpenMesh.setMatrixAt(doorOpenCount, this.dummy.matrix);
                    this.doorOpenMesh.setColorAt(doorOpenCount, wallShade);
                    doorOpenCount++;

                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Broken Dungeon Door (feat 4) — Shattered wood planks on floor & hinge remnant (DungeonWorld.cs:1632-1643)
                if (feat === 4) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, floorShade);
                    floorCount++;

                    const doorYaw = this.determineDoorOrientation(map, x, y, w, h);
                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, doorYaw, 0);
                    this.dummy.updateMatrix();

                    this.doorFrameMesh.setMatrixAt(doorFrameCount, this.dummy.matrix);
                    this.doorFrameMesh.setColorAt(doorFrameCount, wallShade);
                    doorFrameCount++;

                    this.doorBrokenMesh.setMatrixAt(doorBrokenCount, this.dummy.matrix);
                    this.doorBrokenMesh.setColorAt(doorBrokenCount, wallShade);
                    doorBrokenCount++;

                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // FrogComposBand Bottomless Pit (feat 41: '#') — Sunken dark cliff shaft & abyssal void
                if (feat === 41) {
                    if (chasmIdx < this.maxInstances) {
                        this.dummy.position.set(wx, -this.wallHeight * 0.52 - 0.04, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.scale.set(0.98, 1.0, 0.98);
                        this.dummy.updateMatrix();
                        this.chasmMesh.setMatrixAt(chasmIdx, this.dummy.matrix);
                        if (!this._scratchChasmShade) this._scratchChasmShade = new THREE.Color();
                        if (!this._scratchChasmColor) this._scratchChasmColor = new THREE.Color(0x3a3d46);
                        const chasmShade = this.computeTileShade(this._scratchChasmShade, this._scratchChasmColor, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.chasmMesh.setColorAt(chasmIdx, chasmShade);
                        chasmIdx++;
                        this.dummy.scale.set(1, 1, 1);
                    }
                    if (chasmVoidIdx < this.maxInstances) {
                        this.dummy.position.set(wx, -1.75, wz);
                        this.dummy.rotation.set(-Math.PI / 2, 0, 0);
                        this.dummy.scale.set(1, 1, 1);
                        this.dummy.updateMatrix();
                        this.chasmVoidMesh.setMatrixAt(chasmVoidIdx, this.dummy.matrix);
                        chasmVoidIdx++;
                    }
                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Floor / Walkable corridor / Passable rubble / Sunlight (feat 25 strictly in Sil-Q only)
                const isSunlightTile = (this.realm === 'silq' && feat === 25);
                if (feat === 1 || feat === 24 || isSunlightTile) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, floorRot, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, isSunlightTile ? this._sunlightFloorColor : floorShade);
                    floorCount++;

                    // Discovered floor traps ('^' glyph on floor):
                    if (glyph === '^' && trapCount < 128) {
                        this.dummy.position.set(wx, 0.015, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        this.trapMesh.setMatrixAt(trapCount, this.dummy.matrix);
                        const trapAttr = this.getAttrAt(map, x, y);
                        const trapColorHex = getAngbandHex(trapAttr);
                        if (!this._scratchTrapColor) this._scratchTrapColor = new THREE.Color();
                        this._scratchTrapColor.setHex(trapColorHex);
                        const trapShade = this.computeTileShade(this._scratchTrapShade || (this._scratchTrapShade = new THREE.Color()), this._scratchTrapColor, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.trapMesh.setColorAt(trapCount, trapShade);
                        trapCount++;
                    }

                    // Ceilings over subterranean dungeon corridors (skip for open sunbeam fissures in Sil-Q)
                    if (!outdoors && !isSunlightTile) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Forest Trees (feat 25: TREE) - Stylized 3D Bark Trunk + Foliage Crown Canopy
                if (feat === 25) {
                    // Underneath tree is grass floor
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        this.grassMesh.setColorAt(grassCount, grassShade);
                        grassCount++;
                    }

                    // 3D Tree trunk & foliage
                    if (treeCount < this.maxInstances) {
                        this.dummy.position.set(wx, 0, wz);
                        const treeYaw = ((x * 67 + y * 97) % 8) * (Math.PI / 4);
                        this.dummy.rotation.set(0, treeYaw, 0);
                        const s = 0.98 + ((x * 7 + y * 13) % 5) * 0.08;
                        this.dummy.scale.set(s, s, s);
                        this.dummy.updateMatrix();
                        const trunkBase = (this.realm === 'silq')
                            ? this._scratchTrunkBaseColor.setRGB(0.65, 0.62, 0.58)
                            : this._scratchTrunkBaseColor.setRGB(1.0, 0.95, 0.90);
                        const trunkShade = this.computeTileShade(this._scratchTreeTrunkColor, trunkBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.treeTrunkMesh.setMatrixAt(treeCount, this.dummy.matrix);
                        this.treeTrunkMesh.setColorAt(treeCount, trunkShade);

                        let leafBase;
                        if (this._hasPolyHavenTreeTex) {
                            if (!this._treeTintColor) this._treeTintColor = new THREE.Color();
                            if (this.isHengband()) {
                                leafBase = this._treeTintColor.setRGB(1.0, 0.86, 0.92);
                            } else if (biome === 'swamp') {
                                leafBase = this._treeTintColor.setRGB(0.88, 0.98, 0.86);
                            } else if (biome === 'desert' || biome === 'autumn') {
                                leafBase = this._treeTintColor.setRGB(0.96, 1.0, 0.88);
                            } else {
                                leafBase = this._treeTintColor.setRGB(0.94, 1.0, 0.92);
                            }
                        } else {
                            leafBase = this.getBaseColour(25, biome);
                        }

                        const canopyShade = this.computeTileShade(this._scratchTreeColor, leafBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.treeLeavesMesh.setMatrixAt(treeCount, this.dummy.matrix);
                        this.treeLeavesMesh.setColorAt(treeCount, canopyShade);
                        treeCount++;
                        this.dummy.scale.set(1, 1, 1);
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
                        const bs = 0.95 + ((x * 11 + y * 5) % 5) * 0.08;
                        this.dummy.scale.set(bs, bs, bs);
                        this.dummy.updateMatrix();

                        let bushBase;
                        if (this._hasPolyHavenTreeTex) {
                            if (!this._bushTintColor) this._bushTintColor = new THREE.Color();
                            if (this.isHengband()) {
                                bushBase = this._bushTintColor.setRGB(1.0, 0.86, 0.92);
                            } else {
                                bushBase = this._bushTintColor.setRGB(0.94, 1.0, 0.92);
                            }
                        } else {
                            bushBase = this.getBaseColour(42, biome);
                        }

                        const bushShade = this.computeTileShade(this._scratchTreeColor, bushBase, inView, outdoors, lighting, x, y, isRoom, depth);
                        this.bushMesh.setMatrixAt(bushCount, this.dummy.matrix);
                        this.bushMesh.setColorAt(bushCount, bushShade);
                        bushCount++;
                        this.dummy.scale.set(1, 1, 1);
                    }
                    continue;
                }

                // Verdant Meadow Grass (feat 26: GRASS)
                if (feat === 26) {
                    if (grassCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.05, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const grassShade = this.computeTileShade(this._scratchGrassColor, this.getBaseColour(26, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.grassMesh.setMatrixAt(grassCount, this.dummy.matrix);
                        this.grassMesh.setColorAt(grassCount, grassShade);
                        grassCount++;
                    }
                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
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
                        this.dirtMesh.setColorAt(dirtCount, dirtShade);
                        dirtCount++;
                    }
                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Shallow Sparkling Water (feat 28: SHALLOW_WATER)
                if (feat === 28) {
                    if (waterCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.08, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const waterShade = this.computeTileShade(this._scratchWaterColor, this.getBaseColour(28, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.waterMesh.setMatrixAt(waterCount, this.dummy.matrix);
                        this.waterMesh.setColorAt(waterCount, waterShade);
                        waterCount++;
                    }
                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Deep Oceanic Water (feat 29: DEEP_WATER)
                if (feat === 29) {
                    if (deepWaterCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.12, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const deepWaterShade = this.computeTileShade(this._scratchDeepWaterColor, this.getBaseColour(29, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.deepWaterMesh.setMatrixAt(deepWaterCount, this.dummy.matrix);
                        this.deepWaterMesh.setColorAt(deepWaterCount, deepWaterShade);
                        deepWaterCount++;
                    }
                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Swamp & Wetland Marsh (feat 31: SWAMP)
                if (feat === 31) {
                    if (swampCount < this.maxInstances) {
                        this.dummy.position.set(wx, -0.06, wz);
                        this.dummy.rotation.set(0, floorRot, 0);
                        this.dummy.updateMatrix();
                        const swampShade = this.computeTileShade(this._scratchSwampColor, this.getBaseColour(31, biome), inView, outdoors, lighting, x, y, isRoom, depth);
                        this.swampMesh.setMatrixAt(swampCount, this.dummy.matrix);
                        this.swampMesh.setColorAt(swampCount, swampShade);
                        swampCount++;
                    }
                    if (!outdoors && ceilingCount < this.maxInstances) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, ceilingRot, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Molten Lava (feat 23)
                if (feat === 23) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    if (inView) {
                        this.lavaMesh.setMatrixAt(lavaCount++, this.dummy.matrix);
                    } else {
                        this.lavaCooledMesh.setMatrixAt(lavaCooledCount++, this.dummy.matrix);
                    }
                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Stairs Up/Down (feat 5, 6)
                if (feat === 5 || feat === 6) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, floorShade);
                    floorCount++;

                    this.dummy.position.set(wx, 0, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    if (feat === 5) {
                        this.stairsUpMesh.setMatrixAt(stairsUpCount, this.dummy.matrix);
                        this.stairsUpMesh.setColorAt(stairsUpCount, floorShade);
                        stairsUpCount++;
                    } else {
                        this.stairsMesh.setMatrixAt(stairsCount, this.dummy.matrix);
                        this.stairsMesh.setColorAt(stairsCount, floorShade);
                        stairsCount++;
                    }

                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }

                // Impassable Rubble Piles (feat 16) — Tumbled stone masonry & jagged boulders (DungeonWorld.cs:1738-1753, 2522-2528)
                if (feat === 16) {
                    this.dummy.position.set(wx, -0.05, wz);
                    this.dummy.rotation.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.floorMesh.setMatrixAt(floorCount, this.dummy.matrix);
                    this.floorMesh.setColorAt(floorCount, floorShade);
                    floorCount++;

                    this.dummy.position.set(wx, 0, wz);
                    // Procedural subtle rotation variation per tile so piles don't look identical
                    const rubbleYaw = ((x * 37 + y * 59) % 4) * (Math.PI / 2);
                    this.dummy.rotation.set(0, rubbleYaw, 0);
                    this.dummy.updateMatrix();
                    this.rubbleMesh.setMatrixAt(rubbleCount, this.dummy.matrix);
                    this.rubbleMesh.setColorAt(rubbleCount, wallShade);
                    rubbleCount++;

                    if (!outdoors) {
                        this.dummy.position.set(wx, this.wallHeight, wz);
                        this.dummy.rotation.set(0, 0, 0);
                        this.dummy.updateMatrix();
                        this.ceilingMesh.setMatrixAt(ceilingCount, this.dummy.matrix);
                        this.ceilingMesh.setColorAt(ceilingCount, ceilingShade);
                        ceilingCount++;
                    }
                    continue;
                }
            }
        }

        const updateMesh = (mesh, newCount) => {
            const oldCount = mesh.count;
            mesh.count = newCount;
            if (newCount > 0 || oldCount > 0) {
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
        };

        updateMesh(this.wallMesh, wallCount);
        if (this.wallJointMesh) updateMesh(this.wallJointMesh, wallJointIdx);
        updateMesh(this.permWallMesh, permWallCount);
        updateMesh(this.floorMesh, floorCount);
        updateMesh(this.ceilingMesh, ceilingCount);
        updateMesh(this.doorFrameMesh, doorFrameCount);
        updateMesh(this.shopFrameMesh, shopFrameCount);
        updateMesh(this.rubbleMesh, rubbleCount);
        updateMesh(this.doorMesh, doorCount);
        updateMesh(this.doorOpenMesh, doorOpenCount);
        updateMesh(this.doorBrokenMesh, doorBrokenCount);
        for (let i = 0; i < 8; i++) updateMesh(this.shopMeshes[i], shopCounts[i]);
        updateMesh(this.magmaMesh, magmaCount);
        updateMesh(this.quartzMesh, quartzCount);
        updateMesh(this.goldVeinMesh, goldVeinCount);
        updateMesh(this.gemVeinMesh, gemVeinCount);
        updateMesh(this.treeTrunkMesh, treeCount);
        updateMesh(this.treeLeavesMesh, treeCount);
        updateMesh(this.bushMesh, bushCount);
        updateMesh(this.grassMesh, grassCount);
        updateMesh(this.dirtMesh, dirtCount);
        updateMesh(this.waterMesh, waterCount);
        updateMesh(this.deepWaterMesh, deepWaterCount);
        updateMesh(this.mountainMesh, mountainCount);
        updateMesh(this.swampMesh, swampCount);
        updateMesh(this.stairsMesh, stairsCount);
        updateMesh(this.stairsUpMesh, stairsUpCount);
        updateMesh(this.trapMesh, trapCount);
        if (this.chasmMesh) updateMesh(this.chasmMesh, chasmIdx);
        if (this.chasmVoidMesh) {
            this.chasmVoidMesh.count = chasmVoidIdx;
            this.chasmVoidMesh.instanceMatrix.needsUpdate = true;
        }

        const oldLava = this.lavaMesh.count;
        this.lavaMesh.count = lavaCount;
        if (lavaCount > 0 || oldLava > 0) this.lavaMesh.instanceMatrix.needsUpdate = true;

        const oldLavaCooled = this.lavaCooledMesh.count;
        this.lavaCooledMesh.count = lavaCooledCount;
        if (lavaCooledCount > 0 || oldLavaCooled > 0) this.lavaCooledMesh.instanceMatrix.needsUpdate = true;

        this.updateMonsters(frame.monsters || [], frame.player);
        this.updateItems(frame.objects || frame.items || [], frame.player);
        this.updateTerrainLabels(map, w, h, depth, px, py);
    }

    updateTerrainLabels(map, w, h, depth, px = this.playerGridX, py = this.playerGridY) {
        if (!this.terrainLabelsGroup) return;

        const outdoors = depth === 0;
        const storeNames = [
            'General Store',
            'Armoury',
            'Weapon Smiths',
            'Bookseller',
            'Alchemy Shop',
            'Magic Shop',
            'Black Market',
            'Home'
        ];

        if (this._lastTerrainLabelsDepth !== depth) {
            this._lastTerrainLabelsDepth = depth;
            if (this._terrainLabelSprites) {
                for (const sprite of this._terrainLabelSprites.values()) {
                    if (sprite.parent) sprite.parent.remove(sprite);
                    if (sprite.material) {
                        if (sprite.material.map) sprite.material.map.dispose();
                        sprite.material.dispose();
                    }
                }
                this._terrainLabelSprites.clear();
            }
        }

        this._terrainLabelSprites = this._terrainLabelSprites || new Map();

        const storePositions = new Map();
        const stairsList = [];
        const pitList = [];

        const labelRange = 28;
        const lMinY = Math.max(0, py - labelRange);
        const lMaxY = Math.min(h - 1, py + labelRange);
        const lMinX = Math.max(0, px - labelRange);
        const lMaxX = Math.min(w - 1, px + labelRange);

        for (let y = lMinY; y <= lMaxY; y++) {
            for (let x = lMinX; x <= lMaxX; x++) {
                const flag = this.getFlagAt(map, x, y);
                const known = outdoors || (flag & 0x1) !== 0;
                const inView = outdoors || (flag & 0x2) !== 0;
                // STRICT FOG OF WAR: Never leak undiscovered space!
                if (!known && !inView) continue;

                let feat = this.getFeatAt(map, x, y);
                const glyph = this.getGlyphAt(map, x, y);
                const tileAttr = this.getAttrAt(map, x, y);
                if (this.realm === 'frogcomposband' && glyph === '#' && (tileAttr === 2 || tileAttr === 8 || tileAttr === 9 || feat === 41)) {
                    feat = 41;
                }

                if (feat >= 7 && feat <= 14) {
                    if (!storePositions.has(feat)) {
                        storePositions.set(feat, []);
                    }
                    storePositions.get(feat).push({ x: x * this.cellSize, z: y * this.cellSize });
                } else if (feat === 5) {
                    const upText = depth === 1 ? '[<] Up to Town' : `[<] Up to ${(depth - 1) * 50}ft`;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize, y: 1.1, z: y * this.cellSize, name: upText });
                } else if (feat === 6) {
                    const downText = depth === 0 ? "[>] Down to Dungeon (50')" : `[>] Down to ${(depth + 1) * 50}ft`;
                    stairsList.push({ gridX: x, gridY: y, x: x * this.cellSize, y: 1.1, z: y * this.cellSize, name: downText });
                } else if (feat === 41) {
                    const playerX = px !== undefined ? px : (this.playerGridX !== undefined ? this.playerGridX : 0);
                    const playerY = py !== undefined ? py : (this.playerGridY !== undefined ? this.playerGridY : 0);
                    const pdx = x - playerX;
                    const pdy = y - playerY;
                    if (pdx * pdx + pdy * pdy <= 36) { // Within 6 tiles of player
                        pitList.push({ gridX: x, gridY: y, x: x * this.cellSize, y: 0.45, z: y * this.cellSize, name: 'Bottomless Pit' });
                    }
                }
            }
        }

        const createCaption = (text, pos, colorHex, isStore = false) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 96;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, 512, 96);

            // Clean, crisp outlined text matching Godot Label3D (OutlineSize = 8, OutlineModulate = Black)
            ctx.font = isStore ? '700 30px "Cinzel", "Noto Sans JP", "Yu Gothic", sans-serif' : '700 24px "Cinzel", "Noto Sans JP", "Yu Gothic", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Bold dark outline/shadow for high contrast
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
            ctx.lineWidth = 7;
            ctx.strokeText(text, 256, 48);

            ctx.fillStyle = colorHex;
            ctx.fillText(text, 256, 48);

            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            // depthTest = true so buildings, walls, and pillars properly occlude labels
            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(isStore ? 2.6 : 2.0, isStore ? 0.48 : 0.38, 1.0);
            sprite.position.set(pos.x, pos.y, pos.z);
            sprite.maxDist = isStore ? 45.0 : 25.0; // Distance culling threshold
            return sprite;
        };

        const activeLabelKeys = new Set();

        // Shop Labels at Centroid (1:1 with Godot DungeonWorld.cs:2648-2670)
        for (const [feat, points] of storePositions.entries()) {
            const storeIdx = feat - 7;
            const storeNum = storeIdx + 1;
            const storeName = storeNames[storeIdx] || `Store ${storeNum}`;
            const labelText = `[${storeNum}] ${storeName}`;
            const col = getStoreColorHex(storeNum);

            let avgX = 0, avgZ = 0;
            for (const pt of points) {
                avgX += pt.x;
                avgZ += pt.z;
            }
            avgX /= points.length;
            avgZ /= points.length;

            const gx = Math.round(avgX / this.cellSize);
            const gy = Math.round(avgZ / this.cellSize);
            const key = `${gx},${gy},${labelText}`;
            activeLabelKeys.add(key);

            if (!this._terrainLabelSprites.has(key)) {
                const sprite = createCaption(labelText, { x: avgX, y: this.wallHeight + 0.55, z: avgZ }, col, true);
                this.terrainLabelsGroup.add(sprite);
                this._terrainLabelSprites.set(key, sprite);
            }
        }

        // Stairs Labels
        for (const s of stairsList) {
            const key = `${s.gridX},${s.gridY},${s.name}`;
            activeLabelKeys.add(key);

            if (!this._terrainLabelSprites.has(key)) {
                const sprite = createCaption(s.name, { x: s.x, y: s.y, z: s.z }, '#88ccff', false);
                this.terrainLabelsGroup.add(sprite);
                this._terrainLabelSprites.set(key, sprite);
            }
        }

        // Bottomless Pit Labels (within 6 tiles of player)
        for (const p of pitList) {
            const key = `${p.gridX},${p.gridY},${p.name}`;
            activeLabelKeys.add(key);

            if (!this._terrainLabelSprites.has(key)) {
                const sprite = createCaption(p.name, { x: p.x, y: p.y, z: p.z }, '#8899aa', false);
                this.terrainLabelsGroup.add(sprite);
                this._terrainLabelSprites.set(key, sprite);
            }
        }

        // Dispose and remove sprites that are no longer active in window
        for (const [key, sprite] of this._terrainLabelSprites.entries()) {
            if (!activeLabelKeys.has(key)) {
                this.terrainLabelsGroup.remove(sprite);
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

    createNameplateSprite(m, isTargeted, isSensedParam) {
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 110;
        const ctx = canvas.getContext('2d');

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

        // Dark-obsidian rounded rectangle backdrop with beveled metallic gold border
        const isSensed = (isSensedParam !== undefined) ? isSensedParam : !!(m.invisible || (m.detected && m.unlit));
        const hasBadgeLine = Boolean(m.asleep || isTargeted || isSensed);
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
        ctx.strokeStyle = isTargeted ? '#ffd700' : '#c89b3c';
        ctx.lineWidth = 2;
        ctx.stroke();

        let curY = 6;

        // Line 1: Status badge (e.g. 💤 Zzz... matching Godot MonsterModelResolver.cs:500-504)
        if (m.asleep) {
            ctx.font = '700 22px "Fira Code", monospace';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('💤 Zzz...', 192, curY + 20);
            ctx.fillStyle = '#a8d8ff';
            ctx.fillText('💤 Zzz...', 192, curY + 20);
            curY += 24;
        } else if (isTargeted) {
            ctx.font = '900 20px "Cinzel", serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('⌖ TARGET ⌖', 192, curY + 18);
            ctx.fillStyle = '#ffd700';
            ctx.fillText('⌖ TARGET ⌖', 192, curY + 18);
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
        let fontSize = 24;
        if (race.length > 26) fontSize = 17;
        else if (race.length > 18) fontSize = 20;
        ctx.font = `700 ${fontSize}px "Cinzel", "Noto Sans JP", "Yu Gothic", sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(race, 192, curY + 22);
        ctx.fillStyle = colorHex || '#ffffff';
        ctx.fillText(race, 192, curY + 22);
        curY += 28;

        // Line 3: Compact Health Bar matching Godot: [glyph] [██████] hp/hpMax
        const barW = 160;
        const barH = 10;
        const barX = 192 - barW / 2;
        const barY = curY + 4;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

        let hpCol = '#44ee44';
        if (pct < 0.3) hpCol = '#ff3b30';
        else if (pct < 0.6) hpCol = '#ffcc00';

        ctx.fillStyle = hpCol;
        ctx.fillRect(barX, barY, Math.max(2, barW * pct), barH);

        // Text labels: [glyph] on left, hp/max on right
        ctx.font = '700 16px "Fira Code", monospace';
        ctx.fillStyle = '#e0e0e0';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;

        ctx.textAlign = 'right';
        ctx.strokeText(`[${glyph}]`, barX - 6, barY + 9);
        ctx.fillText(`[${glyph}]`, barX - 6, barY + 9);

        ctx.textAlign = 'left';
        ctx.strokeText(`${hp}/${hpMax}`, barX + barW + 6, barY + 9);
        ctx.fillText(`${hp}/${hpMax}`, barX + barW + 6, barY + 9);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        // Godot MonsterModelResolver.cs:388 sets NoDepthTest = false (occluded by walls)
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.82, 0.23, 1.0);
        return sprite;
    }

    initMonsterAtlas() {
        const texLoader = new THREE.TextureLoader();
        this.monsterAtlasData = null;
        this.monsterAtlasTex = null;
        this.monsterNormalTex = null;
        this._monsterAtlasLowerMap = null;

        this.monsterDepthMat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.35
        });

        // Shared PBR Material for all monster billboards (Z-buffer depth tested, dynamic torchlight specular relief)
        this.monsterBillboardMat = new THREE.MeshStandardMaterial({
            roughness: 0.58,
            metalness: 0.06,
            normalScale: new THREE.Vector2(0.55, 0.55),
            alphaTest: 0.35,
            depthWrite: true,
            transparent: false,
            side: THREE.DoubleSide,
            vertexColors: true
        });

        this.monsterAtlasReady = new Promise((resolve) => {
            let texDone = false;
            let jsonDone = false;
            const checkDone = () => {
                if (texDone && jsonDone) {
                    if (this.upgradeAllMonsterEntities) this.upgradeAllMonsterEntities();
                    resolve(true);
                }
            };

            texLoader.load('/assets/sprites/monsters/monster_atlas.png', (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    tex.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.monsterAtlasTex = tex;
                if (this.monsterBillboardMat) {
                    this.monsterBillboardMat.map = tex;
                    this.monsterBillboardMat.needsUpdate = true;
                }
                texDone = true;
                checkDone();
            }, undefined, (err) => {
                console.warn('[3D] monster_atlas.png failed to load, falling back to procedural tokens:', err);
                texDone = true;
                checkDone();
            });

            texLoader.load('/assets/sprites/monsters/monster_normal.png', (tex) => {
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    tex.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.monsterNormalTex = tex;
                if (this.monsterBillboardMat) {
                    this.monsterBillboardMat.normalMap = tex;
                    this.monsterBillboardMat.normalScale = new THREE.Vector2(0.45, 0.45);
                    this.monsterBillboardMat.needsUpdate = true;
                }
            }, undefined, (err) => {
                console.warn('[3D] monster_normal.png failed to load:', err);
            });

            fetch('/assets/sprites/monsters/monster_atlas.json')
                .then(res => res.json())
                .then(data => {
                    this.monsterAtlasData = data;
                    console.log(`[3D] Loaded monster sprite atlas: ${Object.keys(data.monsters || {}).length} species, ${Object.keys(data.glyphs || {}).length} glyph fallbacks.`);
                    jsonDone = true;
                    checkDone();
                })
                .catch(err => {
                    console.warn('[3D] monster_atlas.json failed to load, using procedural fallback:', err);
                    jsonDone = true;
                    checkDone();
                });
        });
    }

    resolveMonsterAtlasEntry(name, glyph) {
        if (!this.monsterAtlasData) return null;
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
        const texLoader = new THREE.TextureLoader();
        this.itemAtlasData = null;
        this.itemAtlasTex = null;
        this.itemNormalTex = null;
        this._itemAtlasLowerMap = null;

        this.itemDepthMat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.35
        });

        // Shared PBR Material for all item pickup billboards (Z-buffer depth tested, dynamic torchlight specular relief)
        this.itemBillboardMat = new THREE.MeshStandardMaterial({
            roughness: 0.55,
            metalness: 0.08,
            normalScale: new THREE.Vector2(0.50, 0.50),
            alphaTest: 0.35,
            depthWrite: true,
            transparent: false,
            side: THREE.DoubleSide,
            vertexColors: true
        });

        this.itemAtlasReady = new Promise((resolve) => {
            let texDone = false;
            let jsonDone = false;
            const checkDone = () => {
                if (texDone && jsonDone) {
                    if (this.upgradeAllItemEntities) this.upgradeAllItemEntities();
                    resolve(true);
                }
            };

            texLoader.load('/assets/sprites/items/item_atlas.png', (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    tex.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy() || 1);
                }
                this.itemAtlasTex = tex;
                if (this.itemBillboardMat) {
                    this.itemBillboardMat.map = tex;
                    this.itemBillboardMat.needsUpdate = true;
                }
                texDone = true;
                checkDone();
            }, undefined, (err) => {
                console.warn('[3D] item_atlas.png failed to load, falling back to 3D item templates:', err);
                texDone = true;
                checkDone();
            });

            texLoader.load('/assets/sprites/items/item_normal.png', (tex) => {
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (this.renderer && this.renderer.capabilities) {
                    tex.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy() || 1);
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
    }

    resolveItemAtlasEntry(name, glyph) {
        if (!this.itemAtlasData) return null;
        const items = this.itemAtlasData.items;
        const glyphs = this.itemAtlasData.glyphs;
        if (!items && !glyphs) return null;

        const rawName = (name || '').trim();

        // 1. Direct exact name lookup
        if (items && items[rawName]) {
            return items[rawName];
        }

        // 2. Case-insensitive & normalized lookup
        if (items) {
            const lower = rawName.toLowerCase();
            if (!this._itemAtlasLowerMap) {
                this._itemAtlasLowerMap = new Map();
                for (const [k, v] of Object.entries(items)) {
                    this._itemAtlasLowerMap.set(k.toLowerCase(), v);
                }
            }
            if (this._itemAtlasLowerMap.has(lower)) {
                return this._itemAtlasLowerMap.get(lower);
            }

            // 3. Glyph-attuned synthesis for flavored items (e.g. "Steel" + '-' -> "Steel wand")
            if (glyph) {
                let syntheticCandidates = [];
                if (glyph === '-') {
                    syntheticCandidates = [`${lower} wand`, `${lower} rod`, `wand of ${lower}`, `rod of ${lower}`];
                } else if (glyph === '_') {
                    syntheticCandidates = [`${lower} staff`, `staff of ${lower}`];
                } else if (glyph === '!') {
                    syntheticCandidates = [`${lower} potion`, `potion of ${lower}`];
                } else if (glyph === '?') {
                    syntheticCandidates = [`${lower} scroll`, `scroll of ${lower}`, `scroll titled ${lower}`];
                } else if (glyph === '=') {
                    syntheticCandidates = [`${lower} ring`, `ring of ${lower}`];
                } else if (glyph === '"') {
                    syntheticCandidates = [`${lower} amulet`, `amulet of ${lower}`];
                } else if (glyph === ']') {
                    syntheticCandidates = [`pair of ${lower} boots`, `${lower} boots`, `${lower} shod boots`];
                }

                for (const cand of syntheticCandidates) {
                    if (this._itemAtlasLowerMap.has(cand)) {
                        return this._itemAtlasLowerMap.get(cand);
                    }
                }
            }

            // 4. Substring & prefix lookup (handles enchantments, quantities, ego suffixes: e.g. "Long Sword (1d10)" -> "Long Sword")
            for (const [k, v] of this._itemAtlasLowerMap.entries()) {
                if (lower.startsWith(k) || lower.includes(k)) {
                    return v;
                }
            }

            // 5. Long-form reverse containment (ONLY if name is specific, >= 8 chars, and category matches)
            if (lower.length >= 8 && !['steel', 'iron', 'leather', 'wooden', 'copper', 'golden'].includes(lower)) {
                for (const [k, v] of this._itemAtlasLowerMap.entries()) {
                    if (k.includes(lower)) {
                        return v;
                    }
                }
            }
        }

        // 6. Canonical glyph fallback (100% coverage across all 20 Angband item symbols)
        if (glyphs && glyph && glyphs[glyph]) {
            return glyphs[glyph];
        }

        return null;
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
                    entity.modelHeight = upgraded3D.baseHeight || 1.0;
                    entity.isFloating = Boolean(cfg.isFloating);
                    entity.isReal3DMonster = true;
                    entity.isBillboard = false;
                    entity.pending3DConfig = null;
                    entity.isFallback = false;
                    if (upgraded3D._mixer) {
                        entity._mixer = upgraded3D._mixer;
                        entity._idleAction = upgraded3D._idleAction;
                        entity._walkAction = upgraded3D._walkAction;
                        entity._activeAnimState = upgraded3D._activeAnimState;
                    }
                    entity._heldAttachments = upgraded3D._heldAttachments;
                    upgraded3D.monsterData = m;
                    if (entity.contactShadow) {
                        const footprint = (upgraded3D.baseWidth || 1.25) * 0.75;
                        entity.contactShadow.scale.set(footprint, footprint, footprint);
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
                            const fp = atlasEntry.footprint || 0.35;
                            entity.shadowMesh.scale.set(fp, fp, fp);
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

    configureCreatureEquipment(mesh, role) {
        // 1. Hide any pre-existing weapon/shield child meshes embedded in model
        mesh.traverse((c) => {
            const n = (c.name || '').toLowerCase();
            if (n.includes('sword') || n.includes('shield') || n.includes('axe') || n.includes('dagger') || n.includes('bow') || n.includes('staff') || n.includes('hammer') || n.includes('spear')) {
                c.visible = false;
            }
        });

        if (role === 'unarmed') return;

        const { leftHand, rightHand } = this.findHandSlots(mesh);
        if (!rightHand && !leftHand) return;

        const attach = (handNode, weaponKey, scale = 0.05, rot = null, pos = null) => {
            if (!handNode || !this.weaponCache || !this.weaponCache.has(weaponKey)) return;
            const tmpl = this.weaponCache.get(weaponKey);
            const wClone = tmpl.clone(true);
            wClone.scale.set(scale, scale, scale);
            if (pos) wClone.position.set(pos.x, pos.y, pos.z);
            if (rot) wClone.rotation.set(rot.x, rot.y, rot.z);
            handNode.add(wClone);
        };

        if (role === 'warrior') {
            attach(rightHand, 'sword', 0.05, { x: 0, y: Math.PI / 2, z: -Math.PI / 2 }, { x: 0, y: 0, z: 0 });
            attach(leftHand, 'shield', 0.05, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
        } else if (role === 'barbarian') {
            attach(rightHand, 'axe', 0.05, { x: 0, y: Math.PI / 2, z: -Math.PI / 2 }, { x: 0, y: 0, z: 0 });
        } else if (role === 'rogue') {
            attach(rightHand, 'dagger', 0.05, { x: 0, y: Math.PI / 2, z: -Math.PI / 2 }, { x: 0, y: 0, z: 0 });
        } else if (role === 'archer') {
            attach(rightHand, 'bow', 0.05, { x: 0, y: Math.PI / 2, z: 0 }, { x: 0, y: 0, z: 0 });
        } else if (role === 'mage') {
            attach(rightHand, 'spear', 0.05, { x: 0, y: 0, z: -Math.PI / 2 }, { x: 0, y: 0, z: 0 });
        } else if (role === 'twohandedsword') {
            attach(rightHand, 'claymore', 0.055, { x: 0, y: Math.PI / 2, z: -Math.PI / 2 }, { x: 0, y: 0, z: 0 });
        }
    }

    resolveMonsterModelConfig(glyph, rawName, monsterInstance = null) {
        const name = (rawName || '').toLowerCase();

        // 1. Determine Model & Biological Sex for Humanoid / Townsfolk Entities
        const isExplicitFemale = /\b(female|woman|lady|maiden|crone|hag|witch|priestess|sorceress|enchantress|temptress|mistress|matron|siren|harpy|nymph|dryad|medusa|gorgon|banshee|shelob|thuringwethil|ungoliant|lobelia|maid|girl|princess|duchess|daughter|mother|sister|wife|vixen|queen)\b/i.test(name);
        const isExplicitMale = /\b(king|prince|lord|patriarch|emperor|baron|warlock|father|brother|boy|son|husband|male)\b/i.test(name);
        
        let gender = 'male';
        if (isExplicitFemale) {
            gender = 'female';
        } else if (isExplicitMale) {
            gender = 'male';
        } else if (monsterInstance && (monsterInstance.isFemale === true || monsterInstance.modelKey === 'casual' || monsterInstance.modelKey === 'witch')) {
            gender = 'female';
        } else if (monsterInstance && (monsterInstance.modelGender || monsterInstance.gender || monsterInstance.sex)) {
            const rawG = String(monsterInstance.modelGender || monsterInstance.gender || monsterInstance.sex).toLowerCase();
            gender = rawG.startsWith('f') ? 'female' : 'male';
        } else if (glyph === 't' || glyph === 'h' || glyph === 'p') {
            // Default to male for ambiguous townsfolk and humanoids unless explicitly female
            gender = 'male';
        }

        // 1. Townsfolk (t)
        if (glyph === 't') {
            let modelKey = (gender === 'female') ? 'casual' : 'farmer';
            let role = 'unarmed';

            if (name.includes('merchant') || name.includes('shopkeeper') || name.includes('innkeeper') || name.includes('clerk') || name.includes('crier') || name.includes('scribe')) {
                modelKey = (gender === 'female') ? 'casual' : 'formal';
            } else if (name.includes('worker') || name.includes('smith') || name.includes('miner') || name.includes('artisan') || name.includes('craftsman') || name.includes('butcher') || name.includes('baker') || name.includes('cook')) {
                modelKey = (gender === 'female') ? 'casual' : 'worker';
            } else if (name.includes('mercenary') || name.includes('veteran') || name.includes('rogue') || name.includes('scoundrel') || name.includes('brawler')) {
                modelKey = (gender === 'female') ? 'casual' : 'adventurer';
                role = (name.includes('veteran') || name.includes('mercenary')) ? 'warrior' : 'rogue';
            } else if (name.includes('beggar') || name.includes('leper') || name.includes('urchin') || name.includes('idiot') || name.includes('hermit') || name.includes('drunk') || name.includes('peasant') || name.includes('wretch') || name.includes('farmer')) {
                modelKey = (gender === 'female') ? 'casual' : 'farmer';
            }

            let scale = (gender === 'female') ? 0.88 : 0.90;
            if (name.includes('dwarf') || name.includes('hobbit') || name.includes('gnome') || name.includes('halfling')) {
                scale = 0.65;
            }
            return { templateKey: modelKey, scale, role: role, gender: gender, isFloating: false, isEthereal: false };
        }

        // 2. Humanoids (h) and People / Adventurers (p)
        if (glyph === 'h' || glyph === 'p') {
            let scale = (gender === 'female') ? 0.90 : 0.95;
            if (name.includes('dwarf') || name.includes('hobbit') || name.includes('gnome') || name.includes('halfling') || name.includes('leprechaun')) {
                scale = 0.65;
            } else if (name.includes('elf') || name.includes('ranger') || name.includes('dunedain')) {
                scale = (gender === 'female') ? 0.92 : 0.98;
            }

            if (name.includes('knight') || name.includes('paladin') || name.includes('veteran') || name.includes('warrior') || name.includes('soldier') || name.includes('guard') || name.includes('captain') || name.includes('fighter') || name.includes('champion') || name.includes('swordsman') || name.includes('centurion') || name.includes('lord') || name.includes('templar')) {
                return { templateKey: (gender === 'female') ? 'casual' : 'medieval', scale, role: 'warrior', gender, isFloating: false, isEthereal: false };
            }
            if (name.includes('archer') || name.includes('scout') || name.includes('sniper') || name.includes('tracker') || name.includes('marksman') || name.includes('bowman') || name.includes('hunter') || name.includes('ranger')) {
                return { templateKey: (gender === 'female') ? 'casual' : 'adventurer', scale, role: 'archer', gender, isFloating: false, isEthereal: false };
            }
            if (name.includes('thief') || name.includes('rogue') || name.includes('burglar') || name.includes('assassin') || name.includes('cutpurse') || name.includes('bandit') || name.includes('brigand') || name.includes('ninja') || name.includes('scoundrel')) {
                return { templateKey: (gender === 'female') ? 'casual' : 'adventurer', scale, role: 'rogue', gender, isFloating: false, isEthereal: false };
            }
            if (name.includes('peasant') || name.includes('drunkard') || name.includes('drunk') || name.includes('beggar') || name.includes('idiot') || name.includes('commoner') || name.includes('villager') || name.includes('leper') || name.includes('urchin') || name.includes('hermit') || name.includes('slave')) {
                return { templateKey: (gender === 'female') ? 'casual' : 'farmer', scale: 0.90, role: 'unarmed', gender, isFloating: false, isEthereal: false };
            }
            if (name.includes('barbarian') || name.includes('mercenary') || name.includes('gladiator') || name.includes('berserker') || name.includes('bouncer') || name.includes('ruffian') || name.includes('brute')) {
                return { templateKey: (gender === 'female') ? 'casual' : 'punk', scale: 1.0, role: 'barbarian', gender, isFloating: false, isEthereal: false };
            }
            if (name.includes('mage') || name.includes('wizard') || name.includes('warlock') || name.includes('sorcerer') || name.includes('alchemist') || name.includes('scholar') || name.includes('priest') || name.includes('cleric') || name.includes('sage') || name.includes('cultist') || name.includes('druid') || name.includes('seer') || name.includes('shaman') || name.includes('necromancer')) {
                return { templateKey: (gender === 'female') ? 'witch' : 'formal', scale: 0.92, role: 'mage', gender, isFloating: false, isEthereal: false };
            }
            return { templateKey: (gender === 'female') ? 'casual' : 'adventurer', scale, role: 'warrior', gender, isFloating: false, isEthereal: false };
        }

        // 3. Orcs, Goblins, Snagas, Uruks (o)
        if (glyph === 'o') {
            if (name.includes('goblin') || name.includes('snaga')) {
                return { templateKey: 'punk', scale: 0.72, role: 'rogue', isFloating: false, isEthereal: false };
            }
            if (name.includes('archer') || name.includes('scout') || name.includes('sniper')) {
                return { templateKey: 'adventurer', scale: 0.85, role: 'archer', isFloating: false, isEthereal: false };
            }
            if (name.includes('shaman') || name.includes('mage') || name.includes('curse')) {
                return { templateKey: 'punk', scale: 0.85, role: 'mage', isFloating: false, isEthereal: false };
            }
            if (name.includes('uruk') || name.includes('captain') || name.includes('chieftain') || name.includes('leader') || name.includes('black orc')) {
                return { templateKey: 'punk', scale: 0.98, role: 'barbarian', isFloating: false, isEthereal: false };
            }
            return { templateKey: 'adventurer', scale: 0.88, role: 'barbarian', isFloating: false, isEthereal: false };
        }

        // 4. Skeletons (s)
        if (glyph === 's') {
            if (name.includes('archer') || name.includes('scout') || name.includes('sniper')) {
                return { templateKey: 'soldier', scale: 0.88, role: 'archer', isFloating: false, isEthereal: false };
            }
            if (name.includes('mage') || name.includes('sorcerer') || name.includes('druj') || name.includes('necromancer')) {
                return { templateKey: 'soldier', scale: 0.88, role: 'mage', isFloating: false, isEthereal: false };
            }
            return { templateKey: 'medieval', scale: 0.92, role: 'warrior', isFloating: false, isEthereal: false };
        }

        // 5. Zombies, Mummies, Ghouls (z)
        if (glyph === 'z') {
            if (name.includes('worker') || name.includes('ghoul')) {
                return { templateKey: 'worker', scale: 0.90, role: 'unarmed', isFloating: false, isEthereal: false };
            }
            if (name.includes('mummy')) {
                return { templateKey: 'farmer', scale: 0.90, role: 'unarmed', isFloating: false, isEthereal: false };
            }
            return { templateKey: 'adventurer', scale: 0.90, role: 'unarmed', isFloating: false, isEthereal: false };
        }

        // 6. Liches (L)
        if (glyph === 'L') {
            return { templateKey: 'witch', scale: 1.05, role: 'mage', isFloating: false, isEthereal: true };
        }

        // 7. Wights, Wraiths, Nazgul (W)
        if (glyph === 'W') {
            if (name.includes('nazgul') || name.includes('ringwraith') || name.includes('witch-king')) {
                return { templateKey: 'medieval', scale: 1.10, role: 'twohandedsword', isFloating: true, isEthereal: true };
            }
            if (name.includes('wraith')) {
                return { templateKey: 'witch', scale: 1.00, role: 'mage', isFloating: true, isEthereal: true };
            }
            return { templateKey: 'medieval', scale: 0.98, role: 'warrior', isFloating: true, isEthereal: true };
        }

        // 8. Ghosts, Spectres (G)
        if (glyph === 'G') {
            return { templateKey: 'witch', scale: 0.90, role: 'unarmed', isFloating: true, isEthereal: true };
        }

        // 9. Vampires (V)
        if (glyph === 'V') {
            return { templateKey: 'king', scale: 1.00, role: 'warrior', isFloating: false, isEthereal: false };
        }

        // 10. Ainur, Maiar (A)
        if (glyph === 'A') {
            return { templateKey: 'king', scale: 1.15, role: 'twohandedsword', isFloating: false, isEthereal: false };
        }

        // 11. Giants, Morgoth (P)
        if (glyph === 'P') {
            const scale = name.includes('morgoth') ? 1.55 : 1.35;
            return { templateKey: 'king', scale, role: 'barbarian', isFloating: false, isEthereal: false };
        }

        // 12. Trolls (T), Ogres (O)
        if (glyph === 'T' || glyph === 'O') {
            return { templateKey: 'punk', scale: glyph === 'T' ? 1.25 : 1.18, role: 'barbarian', isFloating: false, isEthereal: false };
        }

        // 13. Kobolds (k) -> Puglin.glb
        if (glyph === 'k' || name.includes('kobold')) {
            return { templateKey: 'puglin', scale: 0.65, role: 'rogue', isFloating: false, isEthereal: false };
        }

        // 14. Demons / Imps (u / U) -> Imp.glb
        if (glyph === 'u' || (glyph === 'U' && (name.includes('imp') || name.includes('minor') || name.includes('demon')))) {
            return { templateKey: 'imp', scale: glyph === 'U' ? 1.10 : 0.75, role: 'unarmed', isFloating: true, isEthereal: false };
        }

        // 15. Rodents (r) -> Rat.obj
        if (glyph === 'r' || name.includes('rat')) {
            return { templateKey: 'rat', scale: 0.42, role: 'unarmed', isFloating: false, isEthereal: false };
        }

        // 16. Snakes & Serpents (J / n) -> Snake.obj / Snake_angry.obj
        if (glyph === 'J' || glyph === 'n' || name.includes('snake') || name.includes('serpent')) {
            const key = (name.includes('viper') || name.includes('cobra') || name.includes('rattle') || name.includes('black')) ? 'snake_angry' : 'snake';
            return { templateKey: key, scale: 0.38, role: 'unarmed', isFloating: false, isEthereal: false };
        }

        // 17. Spiders & Scorpions (S) -> Spider.obj
        if (glyph === 'S' || name.includes('spider') || name.includes('scorpion')) {
            return { templateKey: 'spider', scale: 0.48, role: 'unarmed', isFloating: false, isEthereal: false };
        }

        // 18. Frogs & Amphibians (R) -> Frog.obj
        if (glyph === 'R' || name.includes('frog') || name.includes('toad')) {
            return { templateKey: 'frog', scale: 0.38, role: 'unarmed', isFloating: false, isEthereal: false };
        }

        // 19. Wasps & Flying Insects (F) -> Wasp.obj
        if (glyph === 'F' || name.includes('wasp') || name.includes('fly')) {
            return { templateKey: 'wasp', scale: 0.42, role: 'unarmed', isFloating: true, isEthereal: false };
        }

        return null; // Fallback to anatomical procedural creature tokens
    }

    applyCharacterSkinAndTint(mesh, glyph, rawName, colorHex, templateKey, isEthereal = false) {
        if (!mesh) return;
        if (isEthereal) {
            const spectralColor = new THREE.Color(colorHex);
            mesh.traverse((c) => {
                if (c.isMesh && c.material) {
                    c.material = c.material.clone();
                    c.material.transparent = true;
                    c.material.opacity = 0.60;
                    c.material.emissive = spectralColor;
                    c.material.emissiveIntensity = 0.85;
                }
            });
            return;
        }

        const lowerName = (rawName || '').toLowerCase();
        const tint = new THREE.Color(colorHex);
        // Is tint neutral white / light gray? (If so, preserve original KayKit textures without white bleaching)
        const isWhiteTint = (tint.r > 0.90 && tint.g > 0.90 && tint.b > 0.90);

        const isDemon = glyph === 'U' || (glyph === 'u' && !lowerName.includes('imp'));
        const isAinu = glyph === 'A';
        const isUndead = glyph === 's' || glyph === 'z' || glyph === 'L' || glyph === 'V';
        const isDragon = glyph === 'D' || glyph === 'd' || glyph === 'M';
        const isElemental = glyph === 'E' || glyph === 'v';

        let paletteTex = null;
        if (this.characterPalettes) {
            if (templateKey === 'soldier') paletteTex = this.characterPalettes.get('knight');
            else if (templateKey === 'witch') paletteTex = this.characterPalettes.get('mage');
            else if (templateKey === 'punk' || templateKey === 'casual') paletteTex = this.characterPalettes.get('rogue');
            else if (templateKey === 'adventurer' || templateKey === 'farmer' || templateKey === 'worker' || templateKey === 'medieval' || templateKey === 'king') paletteTex = this.characterPalettes.get('barbarian');
            else if (templateKey === 'skeleton') paletteTex = this.characterPalettes.get('skeleton');
        }

        mesh.traverse((c) => {
            if (c.isMesh && c.material) {
                const origMat = c.material;
                const mat = origMat.clone();
                const matName = (mat.name || c.name || '').toLowerCase();

                if (paletteTex && !mat.map) {
                    mat.map = paletteTex;
                    mat.needsUpdate = true;
                }

                // Specialized handling for Rat
                if (templateKey === 'rat') {
                    if (matName.includes('pink') || matName.includes('nose') || matName.includes('ear') || matName.includes('tail')) {
                        mat.color.setHex(0xd9a6ad);
                    } else {
                        if (lowerName.includes('white') || isWhiteTint) {
                            mat.color.setHex(0xf2f2f2);
                        } else if (lowerName.includes('black') || lowerName.includes('shadow') || lowerName.includes('dark')) {
                            mat.color.setHex(0x1f1f1f);
                        } else if (!isWhiteTint) {
                            mat.color.copy(tint).multiplyScalar(0.75);
                        } else {
                            mat.color.setHex(0x594738);
                        }
                    }
                } else if (templateKey === 'spider' || templateKey === 'snake' || templateKey === 'snake_angry' || templateKey === 'frog' || templateKey === 'wasp') {
                    if (!isWhiteTint) {
                        mat.color.lerp(tint, 0.55);
                    }
                } else if (isDemon) {
                    mat.emissive = new THREE.Color(0xf24714);
                    mat.emissiveIntensity = 0.85;
                } else if (isAinu) {
                    mat.emissive = new THREE.Color(0xf2e066);
                    mat.emissiveIntensity = 0.65;
                } else if (isDragon) {
                    mat.metalness = 0.35;
                    mat.roughness = 0.45;
                    if (!isWhiteTint) {
                        mat.emissive = tint.clone().multiplyScalar(0.5);
                        mat.emissiveIntensity = 0.8;
                    }
                } else if (isElemental) {
                    mat.emissive = !isWhiteTint ? tint.clone() : new THREE.Color(0xb3ccff);
                    mat.emissiveIntensity = 1.2;
                } else if (isUndead) {
                    mat.roughness = Math.min(1.0, (mat.roughness || 0.5) + 0.15);
                    if (matName.includes('skin') || matName.includes('head') || matName.includes('face')) {
                        mat.color.lerp(new THREE.Color(0xb3b8ae), 0.50);
                    }
                } else if (glyph === 'o' || glyph === 'k' || glyph === 'y' || glyph === 'T' || glyph === 'O') {
                    // Orcs, goblins, kobolds, trolls - customize skin tone while leaving clothes and gear intact (1:1 with Godot MonsterModelResolver.cs:3372-3393)
                    if (matName.includes('skin') || matName.includes('head') || matName.includes('face') || matName.includes('body')) {
                        if (glyph === 'o') {
                            mat.color.setHex(0x527a38); // Orc green skin
                        } else if (glyph === 'k') {
                            mat.color.setHex(0x946138); // Kobold reptilian skin
                        } else if (glyph === 'y') {
                            mat.color.setHex(0x7a8561); // Yeek mottled skin
                        } else {
                            mat.color.setHex(0x73856b); // Troll/ogre hide
                        }
                    } else if (!isWhiteTint) {
                        mat.color.lerp(tint, 0.25);
                    }
                } else if (!isWhiteTint && !matName.includes('skin') && !matName.includes('face') && !matName.includes('head') && !matName.includes('hair') && !matName.includes('eye')) {
                    // Accent tinting on garments/armor for distinct monster variants (1:1 with Godot MonsterModelResolver.cs:3399-3403)
                    mat.color.lerp(tint, 0.28);
                }

                c.material = mat;
            }
        });
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
        const loader = this.gltfLoader || (typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null);
        if (!loader) return Promise.reject(new Error('GLTFLoader not available'));
        return new Promise((resolve, reject) => {
            loader.load(url, gltf => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) {
                    reject(new Error(`No scene in GLTF: ${url}`));
                } else {
                    scene._animations = gltf.animations || [];
                    scene.traverse((c) => {
                        if (c.isMesh) {
                            c.castShadow = false;
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
                                            if (typeof THREE.sRGBEncoding !== 'undefined') m.map.encoding = THREE.sRGBEncoding;
                                        }
                                        if (m.normalMap) m.normalMap._sharedTexture = true;
                                        if (m.roughnessMap) m.roughnessMap._sharedTexture = true;
                                        if (m.metalnessMap) m.metalnessMap._sharedTexture = true;
                                        if (m.metalness !== undefined && m.metalness > 0.32) {
                                            m.metalness = 0.32;
                                        }
                                        if (m.roughness !== undefined && m.roughness < 0.28) {
                                            m.roughness = 0.42;
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
        return new Promise((resolve, reject) => {
            loader.load(url, obj => {
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
            this._texLoader = new THREE.TextureLoader();
        }
        return new Promise(resolve => {
            this._texLoader.load(url, tex => {
                tex.flipY = false;
                tex._sharedTexture = true;
                if (isColor && typeof THREE.sRGBEncoding !== 'undefined') {
                    tex.encoding = THREE.sRGBEncoding;
                }
                resolve(tex);
            }, undefined, () => resolve(null));
        });
    }

    _selectCreatureClips(animClips, cfg = {}) {
        if (!Array.isArray(animClips) || animClips.length === 0) return { idleClip: null, walkClip: null };
        const badIdleRe = /crouch|dead|death|die|attack|slash|punch|kick|slap|hit|stagger|jump|dance|celebration|roll|dodge|turn|sword_idle/i;
        const nonCrouchIdle = animClips.filter(c => c && c.name && !badIdleRe.test(c.name));
        const idleClip = nonCrouchIdle.find(c => /^(Idle_Loop_Rig|Idle|idle|Idle_02|939_Idle|Survey|fly|storkFly_B_|parrot_A_|horse_A_)$/i.test(c.name))
            || nonCrouchIdle.find(c => /idle|fly|survey/i.test(c.name))
            || animClips.find(c => c && c.name && !/crouch|dead|death|die|attack|slash|punch|kick|slap|hit/i.test(c.name))
            || animClips[0];
        const badWalkRe = /crouch|dead|death|die|turn|attack|slash|punch|kick|slap|hit/i;
        const nonCrouchWalk = animClips.filter(c => c && c.name && !badWalkRe.test(c.name));
        const walkClip = nonCrouchWalk.find(c => /^(Walk_Loop_Rig|Walk|walk|Walking|939_Walking|Jog_Fwd_Loop_Rig|Run|run|Running|fly|storkFly_B_|parrot_A_)$/i.test(c.name))
            || nonCrouchWalk.find(c => /walk|jog|run|fly/i.test(c.name))
            || idleClip;
        return { idleClip, walkClip };
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
                    const bumpTex = this.floorNormal || this.townFloorNormal || null;
                    for (const m of mats) {
                        if (m && !m.normalMap && bumpTex) {
                            m.normalMap = bumpTex;
                            if (typeof THREE !== 'undefined' && THREE.Vector2) {
                                m.normalScale = new THREE.Vector2(0.28, 0.28);
                            }
                            m.roughness = opts.roughness !== undefined ? opts.roughness : 0.58;
                            m.needsUpdate = true;
                        }
                    }
                }
            }
        });
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

        if (templateKey === 'ph_chest' || templateKey === 'ph_sledgehammer' || templateKey === 'item_gold' || templateKey === 'item_greatsword' || templateKey === 'ph_potion_flask' || templateKey === 'ph_book' || templateKey === 'item_crown' || templateKey === 'item_plate_armor' || templateKey === 'item_wand' || templateKey === 'item_rod' || templateKey === 'item_staff' || templateKey === 'item_staff_branch') {
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
            if (templateKey.startsWith('bestiary_') || templateKey === 'env_fungi_cluster' || templateKey === 'env_ooze_mound') {
                this._enhanceBestiaryMeshQuality(content, { smoothNormals: true, applyCreatureBump: true, roughness: 0.45 });
            }
            const bbox = this._computeTrueSkinnedBoundingBox(content);
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

            const wrapper = new THREE.Group();
            const pivot = new THREE.Group();
            pivot.add(content);
            if (yawOffset !== 0) {
                content.rotation.y = (content.rotation.y || 0) + yawOffset;
            }
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
            loadPromise = loadGltf('/assets/models/characters/steward.glb', () => {
                return Promise.all([
                    this._loadSingleGltfScene('/assets/models/characters/Male_Peasant.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Superhero_Male_FullBody.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Hair_SimpleParted.gltf')
                ]).then(([outfit, body, hair]) => {
                    this._filterInnerBodyHeadAndHands(body, true);
                    hair.traverse(c => {
                        if (c.isMesh && c.material) {
                            c.material = Array.isArray(c.material) ? c.material[0].clone() : c.material.clone();
                            c.material.color = new THREE.Color(0x3b2a1e);
                        }
                    });
                    const grp = new THREE.Group();
                    grp.add(outfit);
                    grp.add(body);
                    grp.add(hair);
                    return grp;
                });
            }).then(content => normalizeWrapper(content, 1.70, true));
        } else if (templateKey === 'char_male_peasant_bearded') {
            loadPromise = loadGltf('/assets/models/characters/steward.glb', () => {
                return Promise.all([
                    this._loadSingleGltfScene('/assets/models/characters/Male_Peasant.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Superhero_Male_FullBody.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Hair_Beard.gltf')
                ]).then(([outfit, body, hair]) => {
                    this._filterInnerBodyHeadAndHands(body, true);
                    const grp = new THREE.Group();
                    grp.add(outfit);
                    grp.add(body);
                    grp.add(hair);
                    return grp;
                });
            }).then(content => normalizeWrapper(content, 1.70, true));
        } else if (templateKey === 'char_female_peasant') {
            loadPromise = loadGltf('/assets/models/characters/npc_woman.glb', () => {
                return Promise.all([
                    this._loadSingleGltfScene('/assets/models/characters/Female_Peasant.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Superhero_Female_FullBody.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Hair_Long.gltf')
                ]).then(([outfit, body, hair]) => {
                    this._filterInnerBodyHeadAndHands(body, true);
                    const grp = new THREE.Group();
                    grp.add(outfit);
                    grp.add(body);
                    grp.add(hair);
                    return grp;
                });
            }).then(content => normalizeWrapper(content, 1.64, true));
        } else if (templateKey === 'char_male_ranger') {
            loadPromise = loadGltf('/assets/models/characters/ranger.glb', () => {
                return Promise.all([
                    this._loadSingleGltfScene('/assets/models/characters/Male_Ranger.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Male_Peasant.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Superhero_Male_FullBody.gltf')
                ]).then(([outfit, peasant, body]) => {
                    this._prepareRangerUndertunic(peasant);
                    this._filterInnerBodyHeadAndHands(body, false);
                    const grp = new THREE.Group();
                    grp.add(outfit);
                    grp.add(peasant);
                    grp.add(body);
                    return grp;
                });
            }).then(content => normalizeWrapper(content, 1.78, true));
        } else if (templateKey === 'char_female_ranger') {
            loadPromise = loadGltf('/assets/models/characters/female_rogue.glb', () => {
                return Promise.all([
                    this._loadSingleGltfScene('/assets/models/characters/Female_Ranger.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Female_Peasant.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Superhero_Female_FullBody.gltf'),
                    this._loadSingleGltfScene('/assets/models/characters/Hair_Long.gltf')
                ]).then(([outfit, peasant, body, hair]) => {
                    this._prepareRangerUndertunic(peasant);
                    this._filterInnerBodyHeadAndHands(body, false);
                    const grp = new THREE.Group();
                    grp.add(outfit);
                    grp.add(peasant);
                    grp.add(body);
                    grp.add(hair);
                    return grp;
                });
            }).then(content => normalizeWrapper(content, 1.72, true));
        } else if (templateKey === 'char_valkyrie') {
            loadPromise = loadGltf('/assets/models/characters/valkyrie.glb', () => this._ensureMonster3DTemplate('char_female_ranger')).then(content => {
                return normalizeWrapper(content, 1.88, true);
            });
        } else if (templateKey === 'char_male_guard') {
            loadPromise = loadGltf('/assets/models/characters/guard.glb', () => this._ensureMonster3DTemplate('char_male_ranger')).then(content => {
                if (content) content._animations = [];
                return normalizeWrapper(content, 1.82, true, 0);
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
                const toRemove = [];
                scene.traverse(c => {
                    if (c.name && (c.name.includes('Backdrop') || c.name.includes('Cloth'))) {
                        toRemove.push(c);
                    }
                });
                for (const c of toRemove) {
                    if (c.parent) c.parent.remove(c);
                }
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 1.95, true, 0.42, 2.20);
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
                                m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.62, true, 0.52, 1.15);
            });
        } else if (templateKey === 'bestiary_horse') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/horse_mount.glb', '/assets/models/monsters/bestiary/Horse.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 1.55, true, 0.42, 1.85);
            });
        } else if (templateKey === 'bestiary_bird') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/bestiary/Parrot.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                m.skinning = Boolean(c.isSkinnedMesh);
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
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/bestiary/Skull.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                m.skinning = Boolean(c.isSkinnedMesh);
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
                return normalizeWrapper(scene, 0.36, true, 0.42, 0.90);
            });
        } else if (templateKey === 'bestiary_kobold') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/kobold.glb', () => this._ensureMonster3DTemplate('bestiary_puglin')).then(scene => {
                return normalizeWrapper(scene, 1.05, true);
            });
        } else if (templateKey === 'bestiary_goblin') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/goblin.glb', () => loadGltf('/assets/models/monsters/bestiary/goblin_warrior.glb', () => this._ensureMonster3DTemplate('bestiary_puglin'))).then(scene => {
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
                            if (!mat) continue;
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
                return normalizeWrapper(scene, 1.68, true);
            });
        } else if (templateKey === 'bestiary_wraith') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/GhostArmature.glb', () => loadGltf('/assets/models/monsters/bestiary/skeleton_knight.glb', () => this._ensureMonster3DTemplate('char_male_ranger'))).then(scene => {
                scene.traverse(c => {
                    if (c.isMesh && c.material) {
                        const mat = Array.isArray(c.material) ? c.material[0] : c.material;
                        mat.transparent = true;
                        mat.opacity = 0.84;
                        mat.blending = THREE.NormalBlending;
                        mat.depthWrite = false;
                        mat.onBeforeCompile = (shader) => {
                            shader.uniforms.rimColor = { value: new THREE.Color(0x66ccff) };
                            shader.uniforms.rimPower = { value: 2.2 };
                            shader.fragmentShader = shader.fragmentShader.replace(
                                '#include <common>',
                                `#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;`
                            );
                            shader.fragmentShader = shader.fragmentShader.replace(
                                '#include <dithering_fragment>',
                                `#include <dithering_fragment>\nvec3 viewDir = normalize(vViewPosition);\nfloat rim = 1.0 - max(0.0, dot(geometryNormal, -viewDir));\nrim = pow(rim, rimPower);\ngl_FragColor.rgb += rimColor * rim * 0.8;\ngl_FragColor.a = max(gl_FragColor.a, rim * 0.7);`
                            );
                        };
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
        } else if (templateKey === 'bestiary_guardian') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/GodAnubis_Art.glb', () => this._ensureMonster3DTemplate('char_male_ranger')).then(scene => {
                return normalizeWrapper(scene, 2.05, true, 0, 1.65);
            });
        } else if (templateKey === 'bestiary_yeti') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/YetiSmall.glb', () => loadGltf('/assets/models/monsters/bestiary/troll.glb', () => this._ensureMonster3DTemplate('char_male_ranger'))).then(scene => {
                return normalizeWrapper(scene, 1.95, true, 0, 1.65);
            });
        } else if (templateKey === 'bestiary_wolf') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/wolf.glb', () => this._ensureMonster3DTemplate('bestiary_fox')).then(scene => {
                return normalizeWrapper(scene, 0.88, true, 0.42, 1.45);
            });
        } else if (templateKey === 'bestiary_lion') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/MountainLion.glb', () => this._ensureMonster3DTemplate('bestiary_fox')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene);
                return normalizeWrapper(scene, 0.95, true, 0.42, 1.45);
            });
        } else if (templateKey === 'bestiary_owl') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/Owl.glb', () => this._ensureMonster3DTemplate('bestiary_bird')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene);
                return normalizeWrapper(scene, 0.68, true, 0, 0.95);
            });
        } else if (templateKey === 'bestiary_stork') {
            loadPromise = this._loadSingleGltfScene('/assets/models/monsters/bestiary/Stork.glb').then(scene => {
                scene.traverse(c => {
                    if (c.isMesh || c.isSkinnedMesh) {
                        const hasVColor = Boolean(c.geometry && c.geometry.attributes && c.geometry.attributes.color);
                        if (c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (hasVColor) m.vertexColors = true;
                                m.skinning = Boolean(c.isSkinnedMesh);
                                m._sharedMaterial = true;
                            }
                        }
                        if (c.geometry) c.geometry._sharedGeometry = true;
                        c.castShadow = false;
                        c.receiveShadow = false;
                    }
                });
                return normalizeWrapper(scene, 0.78, true, 0, 1.25);
            });
        } else if (templateKey === 'obj_spider') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/giant_spider.glb', () => loadGltf('/assets/models/monsters/bestiary/giant_spider_model.glb', '/assets/models/monsters/Spider.obj')).then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, roughness: 0.52 });
                return normalizeWrapper(scene, 0.62, true, 0.35, 1.25);
            });
        } else if (templateKey === 'bestiary_centipede') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/centipede.glb', () => loadGltf('/assets/models/monsters/bestiary/giant_spider.glb', '/assets/models/monsters/Spider.obj')).then(scene => {
                return normalizeWrapper(scene, 0.38, true, 0.20, 1.25);
            });
        } else if (templateKey === 'bestiary_beetle') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/beetle.glb', () => loadGltf('/assets/models/monsters/bestiary/giant_spider.glb', '/assets/models/monsters/Spider.obj')).then(scene => {
                return normalizeWrapper(scene, 0.52, true, 0.25, 1.15);
            });
        } else if (templateKey === 'bestiary_scorpion') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/scorpion.glb', () => loadGltf('/assets/models/monsters/bestiary/giant_spider.glb', '/assets/models/monsters/Spider.obj')).then(scene => {
                return normalizeWrapper(scene, 0.64, true, 0.25, 1.20);
            });
        } else if (templateKey === 'bestiary_ant') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/ant.glb', () => loadGltf('/assets/models/monsters/bestiary/wasp.glb', '/assets/models/monsters/Wasp.obj')).then(scene => {
                return normalizeWrapper(scene, 0.48, true, 0.25, 1.10);
            });
        } else if (templateKey === 'obj_wasp') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/wasp.glb', '/assets/models/monsters/Wasp.obj').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, roughness: 0.48 });
                return normalizeWrapper(scene, 0.62, true, 0.42, 0.95);
            });
        } else if (templateKey === 'obj_snake') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/snake.glb', '/assets/models/monsters/Snake_angry.obj').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, roughness: 0.42 });
                return normalizeWrapper(scene, 0.78, true, 0.35, 1.15);
            });
        } else if (templateKey === 'obj_frog' || templateKey === 'bestiary_frog') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/frog.glb', '/assets/models/monsters/Frog.obj').then(scene => {
                this._enhanceBestiaryMeshQuality(scene, { smoothNormals: true, applyCreatureBump: true, roughness: 0.38 });
                return normalizeWrapper(scene, 0.48, true, 0.25, 0.95);
            });
        } else if (templateKey === 'bestiary_eye') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/floating_eye.glb', () => loadGltf('/assets/models/monsters/bestiary/Skull.glb', () => this._ensureMonster3DTemplate('bestiary_wraith'))).then(scene => {
                return normalizeWrapper(scene, 0.72, true, 0.15, 0.85);
            });
        } else if (templateKey === 'bestiary_worm_mass') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/worm_mass.glb', () => loadGltf('/assets/models/monsters/bestiary/snake.glb', '/assets/models/monsters/Snake_angry.obj')).then(scene => {
                return normalizeWrapper(scene, 0.42, true, 0.20, 1.25);
            });
        } else if (templateKey === 'env_fungi_cluster' || templateKey === 'env_mushroom_patch') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/mushroom_cluster.glb', () => loadGltf('/assets/polyhaven/models/crystalline_iceplant/crystalline_iceplant.gltf', () => loadGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf'))).then(scene => {
                return normalizeWrapper(scene, 0.56, true, 0.15, 0.95);
            });
        } else if (templateKey === 'env_ooze_mound') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/jelly_ooze.glb', () => loadGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf')).then(scene => {
                return normalizeWrapper(scene, 0.58, true, 0.15, 1.05);
            });
        } else if (templateKey === 'env_tanglethorn' || templateKey === 'env_bush_dead') {
            loadPromise = loadGltf('/assets/polyhaven/models/pine_roots/pine_roots.gltf', () => loadGltf('/assets/polyhaven/models/pachira_aquatica_01/pachira_aquatica_01.gltf')).then(scene => {
                return normalizeWrapper(scene, 1.15, true, 0.25, 1.20);
            });
        } else if (templateKey === 'env_tree') {
            loadPromise = loadGltf('/assets/polyhaven/models/pachira_aquatica_01/pachira_aquatica_01.gltf', () => loadGltf('/assets/polyhaven/models/pine_roots/pine_roots.gltf')).then(scene => {
                return normalizeWrapper(scene, 1.65, true, 0.25, 1.40);
            });
        } else if (templateKey === 'bestiary_vortex') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/vortex_elemental.glb', () => loadGltf('/assets/models/monsters/bestiary/GhostArmature.glb', () => this._ensureMonster3DTemplate('bestiary_wraith'))).then(scene => {
                return normalizeWrapper(scene, 1.15, true, 0.15, 1.05);
            });
        } else if (templateKey === 'bestiary_quylthulg') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/quylthulg.glb', () => loadGltf('/assets/models/monsters/bestiary/jelly_ooze.glb', () => loadGltf('/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf'))).then(scene => {
                return normalizeWrapper(scene, 0.62, true, 0.15, 1.05);
            });
        } else if (templateKey === 'bestiary_hydra') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/hydra.glb', () => loadGltf('/assets/models/monsters/bestiary/Dragon.glb', () => this._ensureMonster3DTemplate('bestiary_dragon'))).then(scene => {
                return normalizeWrapper(scene, 1.45, true, 0.25, 1.55);
            });
        } else if (templateKey === 'bestiary_naga') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/naga.glb', () => loadGltf('/assets/models/monsters/bestiary/snake.glb', '/assets/models/monsters/Snake_angry.obj')).then(scene => {
                return normalizeWrapper(scene, 1.25, true, 0.25, 1.25);
            });
        } else if (templateKey === 'bestiary_bat') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/bat.glb', () => loadGltf('/assets/models/monsters/bestiary/Owl.glb', () => this._ensureMonster3DTemplate('bestiary_owl'))).then(scene => {
                return normalizeWrapper(scene, 0.52, true, 0.15, 1.15);
            });
        } else if (templateKey === 'bestiary_bear') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/bear.glb', () => loadGltf('/assets/models/monsters/bestiary/wolf.glb', () => this._ensureMonster3DTemplate('bestiary_wolf'))).then(scene => {
                return normalizeWrapper(scene, 1.05, true, 0.25, 1.45);
            });
        } else if (templateKey === 'bestiary_lizard') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/lizard.glb', () => loadGltf('/assets/models/monsters/bestiary/frog.glb', '/assets/models/monsters/Frog.obj')).then(scene => {
                return normalizeWrapper(scene, 0.54, true, 0.20, 1.35);
            });
        } else if (templateKey === 'bestiary_aquatic') {
            loadPromise = loadGltf('/assets/models/monsters/bestiary/aquatic.glb', () => loadGltf('/assets/models/monsters/bestiary/lizard.glb', () => loadGltf('/assets/models/monsters/bestiary/frog.glb', '/assets/models/monsters/Frog.obj'))).then(scene => {
                return normalizeWrapper(scene, 0.68, true, 0.20, 1.30);
            });
        } else {
            return Promise.reject(new Error(`Unknown 3D monster template key: ${templateKey}`));
        }

        const managedPromise = loadPromise.then(wrapper => {
            this._monster3DTemplates.set(templateKey, wrapper);
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

    resolveMonster3DConfig(m, glyph, realmOverride) {
        const realm = String(realmOverride || (m && m.realm) || this.realm || 'angband').toLowerCase();
        let rawName = (m && (m.race || m.name)) || '';
        if (typeof window !== 'undefined' && window.HengTranslate && typeof window.HengTranslate.translateName === 'function') {
            rawName = window.HengTranslate.translateName(rawName, 1, 'en') || rawName;
        }
        const lowerName = rawName.toLowerCase();
        const lower = lowerName;
        const g = (glyph || (m && m.glyph) || '?').trim();
        const colorHex = (typeof getAngbandColorString === 'function') ? getAngbandColorString(m && m.attr) : null;

        const rawSeed = m && m.id !== undefined ? m.id : ((m ? (m.x || 0) * 7 + (m.y || 0) * 13 : 0));
        let seedNum = typeof rawSeed === 'number' ? rawSeed : 0;
        if (typeof rawSeed === 'string') {
            for (let si = 0; si < rawSeed.length; si++) seedNum = (seedNum * 31 + rawSeed.charCodeAt(si)) | 0;
        }
        const seed = Math.abs(seedNum);

        // --- Multi-Realm Lore Accuracy Branches (Evaluated BEFORE Generic Glyph Fallbacks) ---

        // 1. Sil-Q Realm
        if (realm === 'silq') {
            // Thorns & dead bushes (&)
            if (g === '&' || /thorn|tanglethorn|madthorn|nightthorn/i.test(lower)) {
                return {
                    templateKey: 'env_bush_dead',
                    scale: 1.05,
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
            // g === 'R' (Raukar / Balrogs: Gothmog, Lungorthin, Ururauko, Sulrauko, Ringrauko, Kemenrauko, Gwathrauko)
            if (g === 'R' || /rauko|balrog|gothmog|lungorthin/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_imp',
                    scale: 1.62,
                    weaponKey: 'ph_saber',
                    isBalrog: true,
                    seed
                };
            }
            // g === 'V' (Morgoth / Valar)
            if (g === 'V') {
                return {
                    templateKey: 'char_male_ranger',
                    scale: 1.75,
                    weaponKey: 'ph_sledgehammer',
                    isMorgoth: true,
                    seed
                };
            }
            // g === 'M' (Ungoliant, the Gloomweaver)
            if (g === 'M' || /ungoliant/.test(lowerName)) {
                return {
                    templateKey: 'obj_spider',
                    scale: 1.85,
                    isBoss: true,
                    seed
                };
            }
            // Spiders / Attercops (m)
            if (g === 'm' || /spider|attercop/i.test(lower)) {
                return {
                    templateKey: 'obj_spider',
                    scale: /hatchling/i.test(lower) ? 0.68 : 0.92,
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
            // Serpents vs Spiders (S / s)
            if (g === 'S' || g === 's') {
                if (/spider/i.test(lower)) {
                    return {
                        templateKey: 'obj_spider',
                        scale: 0.95,
                        tintHex: colorHex,
                        isFloating: false,
                        seed
                    };
                }
                return {
                    templateKey: 'obj_snake',
                    scale: (g === 'S' ? 1.25 : 0.95),
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
            // Giants (G) (Gilim, Nan, Giant)
            if (g === 'G') {
                return {
                    templateKey: 'bestiary_cyclops',
                    scale: 1.48,
                    tintHex: '#9a8470',
                    weaponKey: 'item_greatclub',
                    isFloating: false,
                    seed
                };
            }
            // Vampires (v) (Thuringwethil, Vampire lord, Vampire)
            if (g === 'v') {
                return {
                    templateKey: (/thuringwethil|bat/i.test(lower) ? 'bestiary_bat' : 'char_male_priest'),
                    scale: 1.12,
                    tintHex: '#2a1228',
                    weaponKey: null,
                    isFloating: true,
                    seed
                };
            }
            // Phantoms / Shadows / Spectres (w)
            if (g === 'w') {
                return {
                    templateKey: 'bestiary_wraith',
                    scale: 1.08,
                    tintHex: colorHex,
                    isFloating: true,
                    seed
                };
            }
            // Nameless things (N)
            if (g === 'N' || /nameless/i.test(lower)) {
                return {
                    templateKey: 'bestiary_horror',
                    scale: 1.45,
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
            // g === 'H' (Horrors / Lurking horror)
            if (g === 'H') {
                return {
                    templateKey: 'bestiary_wraith',
                    scale: 1.22,
                    floating: true,
                    isFloating: true,
                    seed
                };
            }
            // g === 'C' (Carcharoth, Gorthaur, Wolves)
            if (g === 'C' || /carcharoth|gorthaur|wolf|warg/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_wolf',
                    scale: /carcharoth|gorthaur/.test(lowerName) ? 1.48 : 1.15,
                    seed
                };
            }
        }

        // 2. FrogComposBand Realm
        if (realm === 'frogcomposband') {
            // g === 'J' && serpent of chaos
            if (g === 'J' && /serpent of chaos/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_dragon',
                    scale: 1.90,
                    isBoss: true,
                    seed
                };
            }
            // g === 'U' && cyberdemon / oremorj
            if (g === 'U' && /cyberdemon|oremorj/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_imp',
                    scale: 1.70,
                    weaponKey: 'ph_sledgehammer',
                    isBoss: true,
                    seed
                };
            }
            // g === 'U' && cthulhu
            if (g === 'U' && /cthulhu/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_imp',
                    scale: 1.82,
                    tintHex: '#2d6e4e',
                    isBoss: true,
                    seed
                };
            }
        }

        // 3. Hengband Realm or Japanese/Eastern Archetypes
        if (realm === 'hengband' || /samurai|ronin|kensei|ninja|shinobi|yakuza|orochi|shuten|\boni\b|tengu|kappa|kitsune|酒呑童子|八岐大蛇|天狗|河童|九尾/.test(lowerName)) {
            if (/samurai|ronin|kensei|ninja|shinobi|yakuza|サムライ|ニンジャ/.test(lowerName)) {
                return {
                    templateKey: 'char_male_ranger',
                    weaponKey: 'ph_katana',
                    scale: 1.02,
                    seed
                };
            }
            if (g === 'M' && /orochi|八岐大蛇/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_dragon',
                    scale: 1.85,
                    isBoss: true,
                    seed
                };
            }
            if (/shuten|\boni\b|ooe-mountain|酒呑童子|鬼/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_yeti',
                    scale: 1.55,
                    weaponKey: 'ph_sledgehammer',
                    tintHex: '#a82820',
                    seed
                };
            }
            if (/tengu|天狗/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_owl',
                    scale: 1.25,
                    floating: true,
                    isFloating: true,
                    seed
                };
            }
            if (/kappa|河童/.test(lowerName)) {
                return {
                    templateKey: 'obj_frog',
                    scale: 1.05,
                    seed
                };
            }
            if (/kitsune|nine-tailed|九尾/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_fox',
                    scale: 1.28,
                    tintHex: '#f5f0e6',
                    seed
                };
            }
        }

        // --- Universal Creature Archetypes across All Realms ---

        // Morgoth / Sauron
        if (/morgoth/.test(lowerName)) {
            return {
                templateKey: 'char_male_ranger',
                scale: 1.75,
                weaponKey: 'ph_sledgehammer',
                isBoss: true,
                seed
            };
        }
        if (/sauron/.test(lowerName)) {
            return {
                templateKey: 'char_male_ranger',
                scale: 1.42,
                weaponKey: 'ph_mace',
                tintHex: '#4b2d73',
                isBoss: true,
                seed
            };
        }

        // Golems, Gargoyles, Statues, Idols
        if (g === 'g' || /\b(golem|gargoyle|statue|idol)\b/.test(lowerName)) {
            return {
                templateKey: /anubis|guardian|demon|bronze/.test(lowerName) ? 'bestiary_guardian' : 'bestiary_golem',
                scale: 1.18,
                seed
            };
        }

        // Skeletons / Druj / Floating Skulls
        if (/\b(skull druj|floating skull|flaming skull|demilich|burning skull)\b/i.test(lower) && !/hand/i.test(lower)) {
            return { templateKey: 'bestiary_skull', scale: 1.05, weaponKey: null, seed };
        }
        if (g === 's' || /\b(skeleton|druj)\b/.test(lowerName)) {
            return {
                templateKey: /knight|warrior|lord|champion|king|druj/.test(lowerName) ? 'bestiary_skeleton_knight' : 'bestiary_skeleton_warrior',
                scale: 1.0,
                weaponKey: /knight|warrior|lord|champion|king|druj/.test(lowerName) ? 'item_longsword' : 'item_goblin_sword',
                shieldKey: /knight|lord|champion|king/.test(lowerName) ? 'item_shield_raven' : 'item_shield_wooden',
                seed
            };
        }

        // Zombies / Ghouls / Mummies
        if (g === 'z' || /\b(zombie|ghoul|mummy)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_zombie',
                scale: 1.02,
                seed
            };
        }

        // Wraiths, Nazgûl, Ghosts, Liches
        if (g === 'W' || g === 'G' || g === 'L' || /\b(wraith|nazgul|ghost|spectre|specter|lich|shade|barrow-wight)\b/.test(lowerName)) {
            return {
                templateKey: /\bbarrow-wight\b/.test(lowerName) ? 'bestiary_skeleton_knight' : 'bestiary_wraith',
                scale: 1.05,
                floating: true,
                isFloating: true,
                weaponKey: (g === 'L' || /lich/.test(lowerName)) ? 'item_morningstar' : 'item_rune_blade',
                seed
            };
        }

        // Gnolls & Werewolves
        if (/\b(gnoll|werewolf|wulver)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_gnoll',
                scale: 1.0,
                weaponKey: 'ph_axe',
                seed
            };
        }

        // Lizardfolk & Saurians
        if (/\b(lizardman|lizardfolk|saurian|draconian|troglodyte)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_lizardfolk',
                scale: 1.0,
                weaponKey: 'item_spear',
                shieldKey: 'item_shield_wooden',
                seed
            };
        }

        // Kobolds
        if (g === 'k' || /\bkobold\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_kobold',
                scale: /large|chief|lord|hero/.test(lowerName) ? 1.12 : 0.95,
                weaponKey: 'ph_dagger',
                seed
            };
        }

        // Goblins, Orcs, Hobgoblins, Uruks
        if (g === 'o' || /\b(goblin|orc|uruk|snaga|hobgoblin|golfimbul|bolg|azog|lugdush|ugluk|grishnakh)\b/.test(lowerName)) {
            if (/\b(goblin|snaga)\b/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_goblin',
                    scale: 1.0,
                    weaponKey: /archer/.test(lowerName) ? 'item_bow' : 'item_goblin_sword',
                    shieldKey: /warrior|guard|captain|chief|soldier/.test(lowerName) ? 'item_shield_wooden' : null,
                    seed
                };
            }
            if (/\b(uruk|hobgoblin|black orc|captain|chief|lord|golfimbul|bolg|azog|lugdush|ugluk|grishnakh)\b/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_hobgoblin',
                    scale: /golfimbul|bolg|azog|lord|chief/.test(lowerName) ? 1.12 : 1.02,
                    weaponKey: 'ph_axe',
                    shieldKey: /golfimbul|bolg|azog|lord|chief|captain/.test(lowerName) ? 'ph_shield' : 'item_shield_wooden',
                    seed
                };
            }
            return {
                templateKey: 'bestiary_orc',
                scale: 1.0,
                weaponKey: /archer|tracker/.test(lowerName) ? 'item_bow' : ((seed % 2 === 0) ? 'ph_axe' : 'item_goblin_sword'),
                shieldKey: /warrior|guard|captain/.test(lowerName) ? 'item_shield_wooden' : null,
                seed
            };
        }

        // Trolls
        if (g === 'T' || /\b(troll|olog|ettin|algroth)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_troll',
                scale: /lord|chief|king|great|olog|ettin/.test(lowerName) ? 1.15 : 1.0,
                weaponKey: (seed % 2 === 0) ? 'item_greatclub' : 'ph_sledgehammer',
                seed
            };
        }

        // Ogres
        if (g === 'O' || /\bogre\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_ogre',
                scale: /lord|king|mage|shaman|giant|black/.test(lowerName) ? 1.12 : 1.0,
                weaponKey: (seed % 2 === 0) ? 'item_greatclub' : 'ph_sledgehammer',
                seed
            };
        }

        // Yetis
        if (g === 'Y' || /\b(yeti|sasquatch|wendigo)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_yeti',
                scale: 1.05,
                seed
            };
        }

        // Giants, Cyclopes, Titans
        if (g === 'P' || /\b(cyclops|titan|colossus|hill giant|frost giant|fire giant|stone giant|cloud giant|storm giant|mountain giant)\b/.test(lowerName)) {
            return {
                templateKey: 'bestiary_cyclops',
                scale: /titan|storm|greater/.test(lowerName) ? 1.18 : 1.0,
                weaponKey: 'ph_sledgehammer',
                seed
            };
        }

        // Wolves, Wargs, Hounds, Foxes, Canines
        if (g === 'C' || g === 'Z' || /\b(wolf|warg|hound|dog|jackal|coyote|fox)\b/.test(lowerName)) {
            if (/\bfox\b/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_fox',
                    scale: 0.92,
                    seed
                };
            }
            return {
                templateKey: 'bestiary_wolf',
                scale: /\b(jackal|coyote|pup|little dog|wild dog)\b/.test(lowerName) ? 0.72 : (/\b(warg|dire|carcharoth|gorthaur|draugluin|cerberus)\b/.test(lowerName) ? 1.32 : 1.0),
                seed
            };
        }

        // Mimics & Animated Objects ($, |, /, !, ?, =, _, ~)
        if (g === '$' || /creeping.*coins|coin mimic/i.test(lower)) {
            return {
                templateKey: 'item_gold',
                scale: 1.05,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }
        if (g === '|' || /death sword|hellblade|animated.*sword|dancing.*sword|mourningblade/i.test(lower)) {
            return {
                templateKey: 'item_greatsword',
                scale: 1.15,
                tintHex: colorHex,
                isFloating: true,
                floatHeight: 0.35,
                seed
            };
        }
        if (g === '/' || /animated.*axe|animated.*pike|animated.*staff|death scythe/i.test(lower)) {
            return {
                templateKey: 'ph_sledgehammer',
                scale: 1.15,
                tintHex: colorHex,
                isFloating: true,
                floatHeight: 0.35,
                seed
            };
        }
        if (g === '!' || /potion mimic/i.test(lower)) {
            return {
                templateKey: 'ph_potion_flask',
                scale: 1.0,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }
        if (g === '?' || /scroll mimic|book mimic/i.test(lower)) {
            return {
                templateKey: 'ph_book',
                scale: 1.0,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }
        if (g === '~' || g === '=' || g === '_' || /\bmimic\b/.test(lower)) {
            return {
                templateKey: 'ph_chest',
                scale: 0.95,
                tintHex: colorHex,
                seed
            };
        }

        // Floating Eyes & Beholders (g === 'e' or beholder / gazer / eye)
        if (g === 'e' || /floating eye|disenchanter eye|bloodshot eye|beholder|gazer|spectator|undead beholder|eye of/i.test(lower)) {
            return {
                templateKey: 'bestiary_eye',
                scale: /beholder|hivemind|unmaker/i.test(lower) ? 1.28 : 0.92,
                tintHex: colorHex,
                isFloating: true,
                floatHeight: 0.45,
                seed
            };
        }

        // Quylthulgs (g === 'Q' or quylthulg)
        if (g === 'Q' || /quylthulg/i.test(lower)) {
            return {
                templateKey: 'bestiary_quylthulg',
                scale: /master|greater|emperor|draconic|demonic/i.test(lower) ? 1.25 : 0.95,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }

        // Vortices & Elementals (g === 'E' or g === 'v' or vortex/elemental/plasma/whirlwind, when g !== 'C')
        if (g !== 'C' && (g === 'E' || g === 'v' || /vortex|elemental|whirlwind|water spirit|fire spirit|air spirit|earth spirit|plasma|hound of tindalos/i.test(lower))) {
            return {
                templateKey: 'bestiary_vortex',
                scale: /elemental|lord/i.test(lower) ? 1.22 : 0.95,
                tintHex: colorHex,
                isFloating: true,
                floatHeight: 0.25,
                seed
            };
        }

        // Worm Masses (g === 'w' or worm mass/crawler/maggot/leech, when not Farmer Maggot and not Sil-Q)
        if (g === 'w' || /worm mass|crawler|maggot|leech/i.test(lower)) {
            if (!lower.includes('farmer maggot')) {
                return {
                    templateKey: 'bestiary_worm_mass',
                    scale: 1.0,
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
        }

        // Nagas (g === 'n' or naga)
        if (g === 'n' || /\bnaga\b/i.test(lower)) {
            return {
                templateKey: 'bestiary_naga',
                scale: 1.08,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }

        // 6c. Snakes & Serpents (J)
        if (g === 'J' || /\b(snake|serpent|viper|cobra|asp|python|boa|mamba|adder|rattlesnake|sidewinder|constrictor|anaconda|copperhead|krait)\b/i.test(lower)) {
            const isLargeSnake = /\b(large|giant|king|emperor|titan|anaconda|python|boa|great)\b/i.test(lower);
            return { templateKey: 'obj_snake', scale: isLargeSnake ? 1.15 : 0.92, tintHex: colorHex, weaponKey: null, seed };
        }

        // Hydras (g === 'M' or hydra, when not Yamata-no-Orochi/八岐大蛇 and not Sil-Q)
        if (g === 'M' || /\bhydra\b/i.test(lower)) {
            return {
                templateKey: 'bestiary_hydra',
                scale: 1.18,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }

        // Dragons & Drakes (d, D)
        if (g === 'd' || g === 'D' || /\b(dragon|drake|wyrm)\b/i.test(lower)) {
            const isAncient = (g === 'D' || lower.includes('ancient') || lower.includes('wyrm'));
            return {
                templateKey: 'bestiary_dragon',
                scale: isAncient ? 1.38 : 0.92,
                tintHex: colorHex,
                seed
            };
        }

        // Bats (g === 'b' or bat)
        if (g === 'b' || /\bbat\b|doombat|vampire bat|fruit bat/i.test(lower)) {
            return {
                templateKey: 'bestiary_bat',
                scale: /giant|doom|vampire/i.test(lower) ? 1.08 : 0.82,
                tintHex: colorHex,
                isFloating: true,
                floatHeight: 0.42,
                seed
            };
        }

        // Birds, Owls, Ravens, Eagles
        if (g === 'B' || /\b(bird|crow|raven|eagle|hawk|falcon|owl|stirge|stork|swan)\b/.test(lower)) {
            return {
                templateKey: /owl|raven|crow/.test(lower) ? 'bestiary_owl' : (/stork|swan|water/.test(lower) ? 'bestiary_stork' : 'bestiary_bird'),
                scale: 0.95,
                floating: true,
                isFloating: true,
                seed
            };
        }

        // Scorpions (/scorpion/i)
        if (/scorpion/i.test(lower)) {
            return {
                templateKey: 'bestiary_scorpion',
                scale: /giant|king|emperor|black/i.test(lower) ? 1.15 : 0.92,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }

        // Spiders
        if (g === 'S' || /\b(spider|tarantula|weaver|ungoliant)\b/.test(lower)) {
            const isLightSpider = /\b(white|crystal|ice|phase)\b/.test(lower);
            const spiderTint = (!isLightSpider && m && (m.attr === 1 || m.attr === 2)) ? '#4a3b30' : colorHex;
            return {
                templateKey: 'obj_spider',
                scale: lower.includes('ungoliant') ? 1.55 : 0.95,
                tintHex: spiderTint,
                seed
            };
        }

        // 10b. Frogs & Toads (evaluated before Quadrupeds so Bullfrog matches frog instead of bull)
        if (/\b(frog|toad|bullfrog|peeper|newt|amphibian|axolotl|tadpole)\b/i.test(lower)) {
            return {
                templateKey: 'obj_frog',
                scale: 0.88,
                tintHex: colorHex,
                weaponKey: null,
                seed
            };
        }

        if (/shoggoth/i.test(lower)) {
            return {
                templateKey: 'env_ooze_mound',
                scale: 1.35,
                tintHex: colorHex,
                weaponKey: null,
                seed
            };
        }

        // 9. Bears, Boars & Heavy Quadrupeds vs Equines (g === 'q' or bear/boar/etc.)
        if (g !== 'C' && g !== 'K' && g !== 'a' && (g === 'q' || /\b(bear|werebear|grizzly|beorn|boar|catoblepas|mumak|mûmak|mastodon|elephant|rhino|triceratops|hippo|bison|ox|bull|yak|tapir|pig|swine|hog|horse|warhorse|pony|stallion|mare|steed|unicorn|camel|deer|elk|stag|goat|sheep|ram|giraffe|zebra|ibex|antelope)\b/i.test(lower))) {
            if (/\b(horse|warhorse|pony|stallion|mare|steed|unicorn|camel|deer|elk|stag|goat|sheep|ram|giraffe|zebra|ibex|antelope)\b/i.test(lower)) {
                return {
                    templateKey: 'bestiary_horse',
                    scale: 1.05,
                    weaponKey: null,
                    seed
                };
            }
            return {
                templateKey: 'bestiary_bear',
                scale: /\b(mumak|mûmak|elephant|mastodon|beorn|grizzly)\b/i.test(lower) ? 1.28 : 1.12,
                tintHex: colorHex,
                isFloating: false,
                weaponKey: null,
                seed
            };
        }

        // 10. Lizards, Salamanders, Basilisks & Reptiles (g === 'R' or lizard/salamander/etc.)
        if (g === 'R' || /\b(lizard|salamander|basilisk|alligator|crocodile|iguana|chameleon|gecko|komodo|dinosaur|raptor|ankylosaur|pterosaur|monitor)\b/i.test(lower)) {
            return {
                templateKey: 'bestiary_lizard',
                scale: /basilisk|alligator|crocodile|dinosaur|salamander/i.test(lower) ? 1.15 : 0.92,
                tintHex: colorHex,
                isFloating: false,
                seed
            };
        }

        // 11. Aquatic Creatures vs Trees (g === 'l')
        if (g !== 'C' && !/\b(gray|grey|silverfish|betray|pray|stray|xray)\b/i.test(lower) && (g === 'l' || /\b(piranha|shark|barracuda|swordfish|fish|starfish|jellyfish|kraken|eel|eels|octopus|squid|whale|dolphin|manta|stingray|ray|crab|lobster|shrimp|seahorse|nautilus|ixitxachitl)\b/i.test(lower))) {
            if (/tree|ent|huorn|willow|pine|oak|bush|shrub|vine|kelp|plant|sapling/i.test(lower) || (g === 'l' && realm === 'angband' && !/fish|shark|piranha|eel|kraken|squid|octopus|crab/i.test(lower))) {
                if (g === 'l' && realm === 'angband' && !/tree|ent|huorn|bush|plant/i.test(lower)) {
                    return {
                        templateKey: 'bestiary_centipede',
                        scale: 0.58,
                        tintHex: colorHex,
                        seed
                    };
                }
                return {
                    templateKey: 'env_tree',
                    scale: 1.0,
                    tintHex: colorHex,
                    seed
                };
            }
            return {
                templateKey: 'bestiary_aquatic',
                scale: /kraken|whale|megalodon|giant|great/i.test(lower) ? 1.35 : 0.95,
                tintHex: colorHex,
                isFloating: true,
                floatHeight: 0.28,
                seed
            };
        }

        // 13. Hybrids (g === 'H')
        if (g === 'H' || /harpy|griffon|hippogriff|\broc\b|siren|garuda|cockatrice|chickatrice|pegasus|sphinx|minotaur|centaur|satyr|faun|owlbear/i.test(lower)) {
            if (/harpy|griffon|hippogriff|\broc\b|siren|garuda|cockatrice|chickatrice|pegasus|sphinx/i.test(lower)) {
                return {
                    templateKey: 'bestiary_owl',
                    scale: 1.18,
                    tintHex: colorHex,
                    isFloating: true,
                    floatHeight: 0.35,
                    seed
                };
            }
            if (/minotaur|centaur|satyr|faun/i.test(lower)) {
                return {
                    templateKey: 'bestiary_guardian',
                    scale: 1.22,
                    tintHex: colorHex,
                    weaponKey: 'ph_axe',
                    isFloating: false,
                    seed
                };
            }
            if (/owlbear/i.test(lower)) {
                return {
                    templateKey: 'bestiary_bear',
                    scale: 1.18,
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
            return {
                templateKey: 'bestiary_lion',
                scale: 1.15,
                tintHex: colorHex,
                weaponKey: null,
                seed
            };
        }

        // Felines & Horrors
        if (g === 'f' || /\b(cat|panther|tiger|lion|leopard|cougar|lynx|chimera|manticore|horror|abomination)\b/.test(lowerName)) {
            if (/\b(horror|abomination)\b/.test(lowerName)) {
                return {
                    templateKey: 'bestiary_horror',
                    scale: 1.05,
                    seed
                };
            }
            const isSmallCat = /\b(scrawny cat|wild cat|house cat|kitten|cat|feline)\b/.test(lowerName) && !/\b(big|great|giant|sabre|saber|lion|tiger|panther|leopard|cougar|puma|lynx|jaguar|cheetah)\b/.test(lowerName);
            const isMedCat = !isSmallCat && /\b(lynx|bobcat|ocelot|caracal|cheetah|leopard|panther|cougar|puma)\b/.test(lowerName);
            return {
                templateKey: 'bestiary_lion',
                scale: isSmallCat ? 0.46 : (isMedCat ? 0.85 : 1.18),
                tintHex: /panther|black/.test(lowerName) ? '#262630' : (/white|snow/.test(lowerName) ? '#e8e6e0' : null),
                seed
            };
        }

        // Plants, Tanglethorns, Brambles, Trees, Huorns
        if (g === '#' || /\b(tanglethorn|thorn|bramble|vine|weed|bush|shrub|tree|huorn|ent|treant|plant)\b/.test(lower)) {
            return {
                templateKey: 'env_tanglethorn',
                scale: 1.0,
                tintHex: colorHex,
                seed
            };
        }

        // Mushrooms, Molds, Fungi
        if (g === ',' || g === 'm' || /\b(mushroom|fungus|mold|spore|patch|shrieker|myconid)\b/.test(lower)) {
            return {
                templateKey: 'env_fungi_cluster',
                scale: 0.85,
                tintHex: colorHex,
                seed
            };
        }

        // Jellies, Oozes, Slimes, Spheres
        if (g === 'j' || g === 'i' || g === 'v' || g === '*' || /\b(jelly|ooze|slime|ichor|pudding|blob|sphere)\b/.test(lower)) {
            return {
                templateKey: 'env_ooze_mound',
                scale: 0.85,
                isFloating: (g === '*'),
                floating: (g === '*'),
                tintHex: colorHex,
                seed
            };
        }

        // Equines & Quadrupeds
        if (/\b(horse|steed|mare|stallion|pony|unicorn|pegasus|mule)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_horse',
                scale: 1.0,
                seed
            };
        }

        // Rodents
        if (g === 'r' || /\b(rat|mouse|mice|rodent|vole)\b/.test(lower)) {
            return {
                templateKey: 'ph_street_rat',
                scale: 1.0,
                seed
            };
        }

        // Arthropods (Ants, Beetles, Centipedes)
        if (g === 'a' || /\b(ant|formic)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_ant',
                scale: 0.88,
                tintHex: colorHex,
                seed
            };
        }
        if (g === 'K' || /\b(beetle|scarab|stag)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_beetle',
                scale: 0.92,
                tintHex: colorHex,
                seed
            };
        }
        if (g === 'c' || /\b(centipede|millipede)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_centipede',
                scale: 0.92,
                tintHex: colorHex,
                seed
            };
        }
        if (g === 'I') {
            if (/louse|flea|bug|tick|mite|roach|cockroach|earwig|silverfish|grub|larva/i.test(lower)) {
                return {
                    templateKey: 'bestiary_beetle',
                    scale: 0.65,
                    tintHex: colorHex,
                    isFloating: false,
                    seed
                };
            }
            return {
                templateKey: 'obj_wasp',
                scale: 0.85,
                isFloating: true,
                floating: true,
                tintHex: colorHex,
                seed
            };
        }
        if (g === 'F' || /\b(wasp|hornet|fly|bee|moth|mosquito|locust|insect)\b/.test(lower)) {
            return {
                templateKey: 'obj_wasp',
                scale: 0.85,
                isFloating: true,
                floating: true,
                tintHex: colorHex,
                seed
            };
        }

        // Yeeks
        if (g === 'y' || /\b(yeek|gremlin|homunculus)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_puglin',
                scale: 0.72,
                hunched: true,
                weaponKey: null,
                seed
            };
        }

        // Demons, Imps, Balrogs
        if (g === 'u' || g === 'U' || g === 'X' ||
            /\b(imp|demon|quasit|balrog|fiend|devil|xorn)\b/.test(lower)) {
            const isMajor = (g === 'U' || lower.includes('balrog') || lower.includes('greater'));
            return {
                templateKey: 'bestiary_imp',
                scale: isMajor ? 1.48 : 0.98,
                tintHex: null,
                weaponKey: (g === 'U') ? 'ph_saber' : null,
                seed
            };
        }

        // 14. Townsfolk
        if (g === 't' || lower.includes('farmer maggot')) {
            if (lower === 'filthy street urchin' || lower.includes('urchin')) {
                return {
                    templateKey: 'char_male_peasant',
                    gender: 'male',
                    scale: 0.78,
                    seed
                };
            }
            if (lower === 'town guard') {
                return {
                    templateKey: 'char_male_guard',
                    gender: 'male',
                    scale: 1.02,
                    weaponKey: 'item_spear',
                    shieldKey: 'ph_shield',
                    seed
                };
            }
            if (/\b(singing|drunk|woman|maiden|lady|witch|girl|sister)\b/.test(lower)) {
                return {
                    templateKey: 'char_female_peasant',
                    gender: 'female',
                    scale: 0.98,
                    seed
                };
            }
            if (/\b(mercenary|veteran|guard|soldier|watchman|bouncer|warrior|ranger|agent)\b/.test(lower)) {
                return {
                    templateKey: 'char_male_guard',
                    gender: 'male',
                    scale: 1.02,
                    weaponKey: /archer|ranger/.test(lower) ? 'item_bow' : 'item_longsword',
                    shieldKey: /archer|ranger/.test(lower) ? null : 'ph_shield',
                    seed
                };
            }
            if (/\b(rogue|thief|cutpurse|bandit|pickpocket|burglar)\b/.test(lower)) {
                return {
                    templateKey: 'char_male_rogue',
                    gender: 'male',
                    scale: 0.98,
                    weaponKey: 'ph_dagger',
                    seed
                };
            }
            if (lower.includes('leper')) {
                return {
                    templateKey: 'char_male_priest',
                    gender: 'male',
                    scale: 0.98,
                    hunched: true,
                    weaponKey: 'ph_lantern',
                    seed
                };
            }
            if (/\b(priest|cleric|prophet|acolyte|monk)\b/.test(lower)) {
                return {
                    templateKey: 'char_male_priest',
                    gender: 'male',
                    scale: 0.98,
                    seed
                };
            }
            if (lower.includes('farmer maggot')) {
                return {
                    templateKey: 'char_male_peasant_bearded',
                    gender: 'male',
                    scaleY: 0.78,
                    scaleXZ: 1.05,
                    tunicOnlyTint: true,
                    tintHex: '#5a6b4c',
                    weaponKey: 'item_staff_branch',
                    seed
                };
            }
            const isBearded = /\b(elder|old|farmer|maggot|beggar|wizard|mage)\b/.test(lower);
            const isHunched = /\b(beggar|wretch|idiot|cripple)\b/.test(lower);
            const tunicPalette = ['#7a684d', '#4d5d6b', '#5a6b4c', '#6e4f47', '#63566e'];
            const tunicTint = tunicPalette[Math.abs(seed) % tunicPalette.length];
            const weaponKey = lower.includes('beggar') ? 'ph_lantern' : null;
            return {
                templateKey: isBearded ? 'char_male_peasant_bearded' : 'char_male_peasant',
                gender: 'male',
                scale: 0.98,
                hunched: isHunched,
                tunicOnlyTint: true,
                tintHex: tunicTint,
                weaponKey: weaponKey,
                seed
            };
        }

        // 15. Undead fallback
        if (g === 'V') {
            const isFemale = /\b(banshee|lady|queen|bride|female)\b/.test(lower);
            return {
                templateKey: isFemale ? 'char_female_ranger' : 'char_male_ranger',
                gender: isFemale ? 'female' : 'male',
                scale: 1.04,
                tintHex: '#4a3c58',
                weaponKey: 'ph_saber',
                seed
            };
        }

        // 16. Ainur
        if (g === 'A') {
            return {
                templateKey: 'char_valkyrie',
                scale: 1.25,
                weaponKey: 'item_rune_blade',
                shieldKey: 'item_shield_raven',
                seed
            };
        }

        // 16b. Non-Humanoid Glyph Safety Fallback (ensures non-humanoid glyphs never fall through to char_male_ranger)
        if (/^[abcefijlmqrvwxBCEFHIJKMQRSXZ,]$/.test(g)) {
            if (g === 'x' || g === 'a' || g === 'c' || g === 'K') {
                return { templateKey: 'bestiary_beetle', scale: 0.85, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'b' || g === 'B' || g === 'F' || g === 'I') {
                return { templateKey: 'bestiary_bat', scale: 0.88, tintHex: colorHex, isFloating: true, weaponKey: null, seed };
            }
            if (g === 'e' || g === 'i' || g === 'j' || g === 'm' || g === 'v' || g === 'E' || g === 'Q' || g === ',') {
                return { templateKey: 'env_ooze_mound', scale: 0.90, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'J' || g === 'w' || g === 'R') {
                return { templateKey: 'obj_snake', scale: 0.92, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'S') {
                return { templateKey: 'obj_spider', scale: 0.95, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'C' || g === 'Z') {
                return { templateKey: 'bestiary_wolf', scale: 0.95, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'f' || g === 'H') {
                return { templateKey: 'bestiary_lion', scale: 1.0, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'q') {
                return { templateKey: 'bestiary_bear', scale: 1.0, tintHex: colorHex, weaponKey: null, seed };
            }
            if (g === 'r') {
                return { templateKey: 'ph_street_rat', scale: 1.0, weaponKey: null, seed };
            }
            if (g === 'l') {
                return { templateKey: 'bestiary_aquatic', scale: 0.95, tintHex: colorHex, isFloating: true, weaponKey: null, seed };
            }
            return { templateKey: 'bestiary_horror', scale: 1.05, tintHex: colorHex, weaponKey: null, seed };
        }

        // 17. Humanoids & default
        if (/\b(witch|priestess|sorceress|maiden|queen|lady|female|elf-maid|banshee|nymph)\b/.test(lower)) {
            const isPeasant = /\b(peasant|novice|acolyte)\b/.test(lower);
            return {
                templateKey: isPeasant ? 'char_female_peasant' : 'char_female_ranger',
                gender: 'female',
                scale: 0.98,
                weaponKey: 'ph_dagger',
                seed
            };
        }

        if (/\b(dwarf|dwarven|halfling|hobbit|gnome|nibelung|petty-dwarf)\b/.test(lower)) {
            return {
                templateKey: 'char_male_ranger',
                gender: 'male',
                scale: 0.78,
                scaleY: 0.78,
                scaleXZ: 1.12,
                weaponKey: 'ph_axe',
                shieldKey: 'ph_shield',
                seed
            };
        }

        if (/\b(mind flayer|illithid|ulthar)\b/.test(lower)) {
            return {
                templateKey: 'char_male_priest',
                gender: 'male',
                scale: 1.04,
                tintHex: '#6a3d8a',
                weaponKey: 'ph_mace',
                seed
            };
        }

        if (/\b(rogue|thief|cutpurse|bandit|brigand|assassin|burglar|mugger|pirate|outlaw|highwayman)\b/.test(lower)) {
            return {
                templateKey: 'char_male_rogue',
                gender: 'male',
                scale: 0.98,
                weaponKey: 'ph_dagger',
                seed
            };
        }
        if (/\b(priest|cleric|prophet|acolyte|monk|mage|wizard|sorcerer|necromancer|illusionist|conjurer|warlock|druid|shaman|cultist)\b/.test(lower)) {
            return {
                templateKey: 'char_male_priest',
                gender: 'male',
                scale: 0.98,
                weaponKey: 'ph_mace',
                seed
            };
        }
        if (/\b(paladin|knight|guard|veteran|mercenary|templar|crusader|champion|warlord|captain|berserker)\b/.test(lower)) {
            return {
                templateKey: 'char_male_guard',
                gender: 'male',
                scale: 1.02,
                weaponKey: /berserker|warlord/.test(lower) ? 'item_greatsword' : 'item_longsword',
                shieldKey: /berserker/.test(lower) ? null : 'ph_shield',
                seed
            };
        }

        const isLowly = /\b(peasant|farmer|beggar|novice|monk|ruffian)\b/.test(lower);
        return {
            templateKey: isLowly ? 'char_male_peasant' : 'char_male_ranger',
            gender: 'male',
            scale: 1.0,
            weaponKey: /archer|ranger|hunter|scout/.test(lower) ? 'item_bow' : (isLowly ? 'ph_dagger' : 'item_longsword'),
            seed
        };
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

        const openMmoXWeapons = {
            item_goblin_sword: 0.72,
            item_longsword: 0.98,
            item_greatsword: 1.28,
            item_rune_blade: 1.22,
            item_morningstar: 0.82,
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
            ph_katana: { span: 0.94, rotY: 0, gripFrac: 0.18 },
            ph_estoc: { span: 1.04, rotY: -Math.PI * 0.5, gripFrac: 0.14 }
        };

        let combatSpan = 0.75;
        let scaleMult = 1.0;
        if (openMmoXWeapons[itemKey] !== undefined) {
            combatSpan = openMmoXWeapons[itemKey];
            // Raw OpenMMO weapons: +X is shaft (pommel->tip), +Y is blade edge / bow curve, +Z is thickness
            // Map raw +X -> canonical +Y (shaft), raw +Y -> canonical +Z (edge/front), raw +Z -> canonical +X
            const basis = new THREE.Matrix4().makeBasis(
                new THREE.Vector3(0, 1, 0),
                new THREE.Vector3(0, 0, 1),
                new THREE.Vector3(1, 0, 0)
            );
            scene.quaternion.setFromRotationMatrix(basis);
            if (itemKey === 'item_spear') {
                scene.position.set(0, -0.15, 0);
            } else if (itemKey === 'item_bow') {
                const c = wClone._rawCenter || new THREE.Vector3();
                scene.position.set(0, 0, -c.x);
            } else {
                scene.position.set(0, 0.04, 0);
            }
        } else if (phYWeapons[itemKey]) {
            const cfgW = phYWeapons[itemKey];
            combatSpan = cfgW.span;
            const c = wClone._rawCenter || new THREE.Vector3();
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
            combatSpan = 1.12;
            const c = wClone._rawCenter || new THREE.Vector3();
            scene.position.set(-c.x, -c.y, -c.z);
            innerPivot.position.y = 0.08;
            scaleMult = 1.0;
        } else if (itemKey === 'item_shield_wicker' || itemKey === 'ph_shield' || itemKey === 'item_shield_wooden' || itemKey === 'item_shield_raven' || itemKey === 'item_shield_leather' || itemKey === 'item_shield_metal') {
            combatSpan = itemKey === 'ph_shield' ? 0.72 : (itemKey === 'item_shield_wicker' ? 0.56 : 0.62);
            const c = wClone._rawCenter || new THREE.Vector3();
            scene.position.set(-c.x, -c.y, -c.z);
        } else if (itemKey === 'ph_lantern') {
            combatSpan = 0.38;
            const c = wClone._rawCenter || new THREE.Vector3();
            const mx = wClone._rawMax || new THREE.Vector3(0, 0.5, 0);
            scene.position.set(-c.x, -mx.y, -c.z);
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
            childBone.updateWorldMatrix(true, false);
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
            parentBone.updateMatrixWorld(true);
        };

        instRoot.updateMatrixWorld(true);
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
        this._applyCombatArmPose(entity);
        const list = entity && (entity._heldAttachments || (entity.creatureMesh && entity.creatureMesh._heldAttachments) || (entity.mesh && entity.mesh._heldAttachments));
        if (!list || list.length === 0) return;
        const instObj = entity.creatureMesh || entity.mesh || entity;
        instObj.updateMatrixWorld(true);
        this._tmpInstQ = this._tmpInstQ || new THREE.Quaternion();
        this._tmpBoneQ = this._tmpBoneQ || new THREE.Quaternion();
        instObj.getWorldQuaternion(this._tmpInstQ).invert();
        for (let i = 0; i < list.length; i++) {
            const att = list[i];
            if (!att || !att.clone || !att.bone || !att.targetCharQ) continue;
            att.bone.getWorldQuaternion(this._tmpBoneQ);
            this._tmpBoneQ.premultiply(this._tmpInstQ).invert().multiply(att.targetCharQ);
            att.clone.quaternion.copy(this._tmpBoneQ);
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

        if (cfg.tintHex) {
            this._tintedMatPool = this._tintedMatPool || new Map();
            const tintCol = new THREE.Color(cfg.tintHex);
            const armorDarkCol = new THREE.Color(0x2e2a24);
            instance.traverse(c => {
                if ((c.isMesh || c.isSkinnedMesh) && c.material) {
                    const matName = (Array.isArray(c.material) ? c.material.map(m => m.name || '').join(' ') : (c.material.name || '')).toLowerCase();
                    const meshName = ((c.name || '') + ' ' + (c.geometry ? c.geometry.name || '' : '')).toLowerCase();
                    if (/eye|pupil|iris|teeth|tooth|fang|maw|bone|spore|core|pustule|snout|material\.001|^red$|superhero|regular/i.test(matName + '_' + meshName)) return;
                    if (cfg.tunicOnlyTint && !meshName.includes('peasant_body')) {
                        return;
                    }
                    const oldMat = Array.isArray(c.material) ? c.material[0] : c.material;
                    const poolKey = `${oldMat.uuid}_${cfg.tintHex}_${Boolean(cfg.isOrcish)}_${Boolean(cfg.tunicOnlyTint)}`;
                    let pooledMat = this._tintedMatPool.get(poolKey);
                    if (!pooledMat) {
                        if (this._tintedMatPool.size >= 64) {
                            const firstKey = this._tintedMatPool.keys().next().value;
                            this._tintedMatPool.delete(firstKey);
                        }
                        pooledMat = oldMat.clone();
                        pooledMat._sharedMaterial = true;
                        if (c.isSkinnedMesh || oldMat.skinning) {
                            pooledMat.skinning = true;
                        }
                        if (pooledMat.color) {
                            if (cfg.isOrcish) {
                                const isSkin = meshName.includes('sphere.005') || meshName.includes('retopology') || meshName.includes('superhero');
                                pooledMat.color.lerp(isSkin ? tintCol : armorDarkCol, isSkin ? 0.68 : 0.58);
                            } else {
                                pooledMat.color.lerp(tintCol, cfg.tunicOnlyTint ? 0.45 : 0.55);
                            }
                        }
                        this._tintedMatPool.set(poolKey, pooledMat);
                    }
                    c.material = pooledMat;
                }
            });
        }

        let animClips = (instance._animations && instance._animations.length > 0)
            ? instance._animations
            : (tmpl._animations && tmpl._animations.length > 0 ? tmpl._animations : null);
        if (animClips && animClips.length > 0 && typeof THREE.AnimationMixer !== 'undefined') {
            try {
                const { idleClip, walkClip } = this._selectCreatureClips(animClips, cfg);
                const mixer = new THREE.AnimationMixer(instance);
                const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
                const walkAction = (walkClip && walkClip !== idleClip) ? mixer.clipAction(walkClip) : null;
                if (idleAction) {
                    idleAction.time = ((cfg.seed || 0) % Math.max(0.1, idleClip.duration || 1));
                    idleAction.play();
                    mixer.update(0.016);
                    instance.updateMatrixWorld(true);
                }
                instance._mixer = mixer;
                instance._idleAction = idleAction;
                instance._walkAction = walkAction;
                instance._activeAnimState = 'idle';
            } catch (err) {}
        }

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
                if (cfg.weaponKey === 'item_bow') {
                    yChar = new THREE.Vector3(-0.10, 0.98, 0.12).normalize();
                    zChar = new THREE.Vector3(0.28, -0.08, 0.96).normalize();
                } else if (cfg.weaponKey === 'ph_lantern') {
                    yChar = new THREE.Vector3(0.0, 1.0, 0.0);
                    zChar = new THREE.Vector3(0.35, 0.0, 0.94).normalize();
                } else if (cfg.weaponKey === 'item_spear' || cfg.weaponKey === 'item_staff_branch' || cfg.weaponKey === 'item_staff' || cfg.weaponKey === 'item_wand' || cfg.weaponKey === 'item_rod') {
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
                const role = (cfg.weaponKey === 'item_bow') ? 'bow' : (cfg.weaponKey === 'ph_lantern' ? 'lantern' : 'weapon');
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
            if (mesh._mixer) {
                root._mixer = mesh._mixer;
                root._idleAction = mesh._idleAction;
                root._walkAction = mesh._walkAction;
                root._activeAnimState = mesh._activeAnimState;
            }
            root._heldAttachments = mesh._heldAttachments;
        } else {
            this._ensureMonster3DTemplate(cfg.templateKey);
            mesh = new THREE.Group();
            root.pending3DConfig = cfg;
            root.isReal3DMonster = false;
            root.isBillboard = false;
            modelHeight = 1.0 * (cfg.scaleY || cfg.scale || 1.0);
            isFloating = Boolean(cfg.isFloating || cfg.floating);
        }

        root.add(mesh);

        // Soft ground contact shadow disc anchoring creature to floor
        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.contactShadows) && this.shadowGeo && this.shadowMat) {
            const shadowDisc = new THREE.Mesh(this.shadowGeo, this.shadowMat);
            shadowDisc.position.set(0, 0.005, 0);
            const footprint = (mesh.baseWidth || 1.25) * 0.75;
            shadowDisc.scale.set(footprint, footprint, footprint);
            root.add(shadowDisc);
            root.contactShadow = shadowDisc;
        }

        // Diegetic obsidian & gold nameplate
        const nameplate = this.createNameplateSprite(m, isTargeted, isSensed);
        if (nameplate) {
            nameplate.position.set(0, Math.min(2.55, Math.max(0.58, modelHeight + 0.24)), 0);
            nameplate.monsterData = m;
            root.add(nameplate);
            root.nameplate = nameplate;
        }

        root.creatureMesh = mesh;
        root.glyph = glyph;
        root.colorHex = colorHex;
        root.monsterData = m;
        root.modelHeight = modelHeight;
        root.isFloating = isFloating;
        root.isBillboard = false;

        return root;
    }

    updateMonsters(monsters, player) {
        const activeIds = new Set();
        const targetId = (player && player.target && player.target.id !== undefined) ? player.target.id.toString() : null;

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
            m.afraid = !!(m.afraid || m.is_fleeing);
            m.confused = !!(m.confused || m.is_confused);
            m.stunned = !!(m.stunned || m.is_stunned);

            const isTargeted = (targetId && targetId === id);
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

            if (!entity) {
                monstersChanged = true;
                entity = this.createMonster3DEntity(m, isTargeted, isSensed);
                entity.position.set(wx, baseY, wz);
                entity.rotation.y = Math.atan2(px * this.cellSize - wx, py * this.cellSize - wz);
                entity.targetPos = new THREE.Vector3(wx, baseY, wz);
                entity.lastHp = m.hp;
                entity.initialHp = m.hp_max || m.hp;
                entity.lastSensed = isSensed;
                entity.lastTargeted = isTargeted;
                entity.lastAsleep = !!m.asleep;
                entity.lastAfraid = !!m.afraid;
                entity.isAsleep = !!m.asleep;
                entity.monsterData = m;
                this.scene.add(entity);
                this.monsters.set(id, entity);
            } else {
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

                // Auto-upgrade monster to true 3D rigged model once glTF/GLB template has loaded
                if (!entity.isReal3DMonster) {
                    const cfg = entity.pending3DConfig || this.resolveMonster3DConfig(m, entity.glyph);
                    const upgraded3D = this._instantiateMonster3DFromTemplate(cfg);
                    if (upgraded3D) {
                        entity.remove(entity.creatureMesh);
                        entity.creatureMesh = upgraded3D;
                        entity.add(upgraded3D);
                        entity.modelHeight = upgraded3D.baseHeight || 1.0;
                        entity.isFloating = Boolean(cfg.isFloating || cfg.floating);
                        entity.isReal3DMonster = true;
                        entity.isBillboard = false;
                        entity.pending3DConfig = null;
                        entity.isFallback = false;
                        if (upgraded3D._mixer) {
                            entity._mixer = upgraded3D._mixer;
                            entity._idleAction = upgraded3D._idleAction;
                            entity._walkAction = upgraded3D._walkAction;
                            entity._activeAnimState = upgraded3D._activeAnimState;
                        }
                        entity._heldAttachments = upgraded3D._heldAttachments;
                        upgraded3D.monsterData = m;
                        if (entity.contactShadow) {
                            const footprint = (upgraded3D.baseWidth || 1.25) * 0.75;
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
                    const textPos = new THREE.Vector3(wx, Math.min(2.80, entity.modelHeight + 0.45), wz);
                    this.spawnFloatingText(`-${dmg}`, textPos, '#ff9900', 1.20);
                    this.spawnHitSparks(new THREE.Vector3(wx, entity.modelHeight * 0.5, wz), getAngbandColorString(m.attr), 14);
                    if (this.audio) {
                        const pan = this.calculateStereoPan(wx, wz);
                        this.audio.playMonsterVocal(m.glyph || entity.glyph, 'grunt', pan);
                    }
                }

                // Refresh nameplate if HP, status, target state, or sensed state changed
                if (entity.lastHp !== m.hp || entity.lastTargeted !== isTargeted || entity.lastAsleep !== m.asleep || entity.lastAfraid !== m.afraid || entity.lastSensed !== isSensed) {
                    if (entity.nameplate) {
                        if (entity.nameplate.material) {
                            if (entity.nameplate.material.map) entity.nameplate.material.map.dispose();
                            entity.nameplate.material.dispose();
                        }
                        entity.remove(entity.nameplate);
                    }
                    entity.nameplate = this.createNameplateSprite(m, isTargeted, isSensed);
                    entity.nameplate.position.set(0, Math.min(2.55, Math.max(0.58, entity.modelHeight + 0.24)), 0);
                    entity.add(entity.nameplate);
                    entity.lastHp = m.hp;
                    entity.lastTargeted = isTargeted;
                    entity.lastAsleep = m.asleep;
                    entity.lastAfraid = m.afraid;
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

            // In Angband, all monsters emitted in frame.monsters are detected / sensed by the player
            entity.visible = true;
            if (isSensed) {
                if (entity.creatureMesh) entity.creatureMesh.visible = false;
                if (entity.foggyAura) entity.foggyAura.visible = true;
            } else {
                if (entity.creatureMesh) entity.creatureMesh.visible = true;
                if (entity.foggyAura) entity.foggyAura.visible = false;
            }
        });

        for (const [id, entity] of this.monsters.entries()) {
            if (!activeIds.has(id)) {
                monstersChanged = true;
                if (entity.visible && this.audio) {
                    const pan = this.calculateStereoPan(entity.position.x, entity.position.z);
                    this.audio.playMonsterDeath(entity.glyph, pan);
                }
                this.destroyEntity(entity);
                this.monsters.delete(id);
            }
        }
        if (monstersChanged) this.markShadowsDirty();
    }

    refreshMonsterNameplates() {
        if (!this.monsters) return;
        for (const [id, entity] of this.monsters.entries()) {
            if (entity && (entity.monsterData || (entity.nameplate && entity.nameplate.monsterData))) {
                const m = entity.monsterData || entity.nameplate.monsterData;
                const isTargeted = Boolean(this.currentTarget && this.currentTarget.key === id);
                const isSensed = !!(m.invisible || (m.detected && m.unlit));
                if (entity.nameplate) {
                    if (entity.nameplate.material) {
                        if (entity.nameplate.material.map) entity.nameplate.material.map.dispose();
                        entity.nameplate.material.dispose();
                    }
                    entity.remove(entity.nameplate);
                }
                entity.nameplate = this.createNameplateSprite(m, isTargeted, isSensed);
                entity.nameplate.position.set(0, Math.min(2.65, (entity.modelHeight || 1.6) + 0.35), 0);
                entity.nameplate.monsterData = m;
                entity.monsterData = m;
                entity.add(entity.nameplate);
            }
        }
    }

    getItemObjKey(name, glyph) {
        const lower = (name || '').toLowerCase();
        const g = glyph || '';

        // Digging Tools (Picks, Shovels, Spades)
        if (/\b(pick|pickaxe|mattock|digger)\b/.test(lower)) return 'item_pickaxe';
        if (g === '\\' || /\b(shovel|spade|trowel)\b/.test(lower)) return 'item_shovel';

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

        // Bows & Slings
        if (g === '}' || /bow|crossbow|arbalest/.test(lower)) {
            return 'item_bow';
        }

        // Wands, Rods & Staves
        if (g === '_' || g === '-' || /\b(wand|staff|rod|quarterstaff)\b/.test(lower)) {
            if (/\bwands?\b/.test(lower)) return 'item_wand';
            if (/\brods?\b/.test(lower)) return 'item_rod';
            if (/\b(staff|staves|quarterstaff)\b/.test(lower)) return 'item_staff';
            if (g === '-') return 'item_wand';
            return 'item_staff';
        }

        // Polearms
        if (g === '/' || /spear|pike|lance|trident|halberd|glaive|polearm/.test(lower)) {
            return 'item_spear';
        }

        // Amulets & Talismans
        if (g === '"' || /\b(amulet|talisman|pendant|necklace|periapt)\b/.test(lower)) {
            return 'item_talisman';
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

        // Weapons
        if (g === ')' || g === '|' || /sword|blade|dagger|knife|axe|hammer|mace|flail|club|katana|saber|sabre|hatchet|cleaver|morningstar|greatclub|cudgel|rapier|estoc|scimitar|tulwar/.test(lower)) {
            if (/katana|ninja-to|nodachi|wakizashi|tanto/.test(lower)) return 'ph_katana';
            if (/claymore|two-handed|great sword|zweihander|executioner/.test(lower)) return 'item_greatsword';
            if (/rune|vorpal|morgul|ringil|anduril|glamdring|sting/.test(lower)) return 'item_rune_blade';
            if (/orc|goblin|scimitar|cutlass|falchion/.test(lower)) return 'item_goblin_sword';
            if (/estoc|rapier|foil|epee|small sword/.test(lower)) return 'ph_estoc';
            if (/saber|sabre|tulwar/.test(lower)) return 'ph_saber';
            if (/dagger|knife|main gauche|stiletto|dirk|misericorde/.test(lower)) return 'ph_dagger';
            if (/hatchet/.test(lower)) return 'ph_hatchet';
            if (/axe|cleaver|battle-axe/.test(lower)) return 'ph_axe';
            if (/sledge|great hammer|maul|grond/.test(lower)) return 'ph_sledgehammer';
            if (/war hammer|hammer|mattock|mallet/.test(lower)) return 'ph_hammer';
            if (/morning star|morningstar|flail|ball-and-chain/.test(lower)) return 'item_morningstar';
            if (/club|cudgel|greatclub/.test(lower)) return 'item_greatclub';
            if (/mace|scepter/.test(lower)) return 'ph_mace';
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
        if (lower.includes('chest') || lower.includes('coffer') || lower.includes('box')) {
            return 'ph_chest';
        }

        // Light Sources
        if (/torch|lantern|lamp|phial|candle/.test(lower)) {
            if (/torch/.test(lower)) return 'item_torch';
            if (/candle|candlestick/.test(lower)) return 'ph_candle';
            if (/lantern|lamp|phial/.test(lower)) return 'ph_lantern';
        }

        // Food
        if (g === ',' || /ration|bread|food|waybread|lembas|wafer/.test(lower)) {
            if (/waybread|lembas|wafer/.test(lower)) return 'item_lembas';
            return 'item_bread';
        }

        // Keys
        if (/key|lockpick/.test(lower)) {
            return 'item_key';
        }

        // Goblets & Chalices (generic $ coins fall through to Shockbolt item_atlas.png)
        if (/goblet|chalice|cup|grail/.test(lower)) {
            return 'ph_goblet';
        }

        return null;
    }

    resolvePolyHavenFloorItemKey(it, g, lowerName, nameHash) {
        return this.getItemObjKey(it ? it.name : lowerName, g);
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

        const loader = this.gltfLoader || (typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null);
        if (!loader) return Promise.reject(new Error('GLTFLoader not available'));

        const promise = new Promise((resolve, reject) => {
            loader.load(path, (gltf) => {
                const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                if (!scene) {
                    reject(new Error(`No scene in GLTF: ${path}`));
                    return;
                }

                const toRemove = [];
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
                    }
                });
                toRemove.forEach(c => {
                    if (c.parent) c.parent.remove(c);
                });

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
                            }
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (m) {
                                    m._sharedMaterial = true;
                                    if (m.map) {
                                        m.map._sharedTexture = true;
                                        if (typeof THREE.sRGBEncoding !== 'undefined') m.map.encoding = THREE.sRGBEncoding;
                                    }
                                    if (m.normalMap) m.normalMap._sharedTexture = true;
                                    if (m.roughnessMap) m.roughnessMap._sharedTexture = true;
                                    if (m.metalnessMap) m.metalnessMap._sharedTexture = true;
                                    if (m.metalness !== undefined && m.metalness > 0.32) {
                                        m.metalness = 0.32;
                                    }
                                    if (m.roughness !== undefined && m.roughness < 0.28) {
                                        m.roughness = 0.42;
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
                const isOpenMmoXWeapon = (key === 'item_goblin_sword' || key === 'item_longsword' || key === 'item_greatsword' || key === 'item_rune_blade' || key === 'item_morningstar' || key === 'item_greatclub' || key === 'item_spear' || key === 'item_bow' || key === 'item_torch');
                const isShield = (key === 'ph_shield' || key === 'item_shield_wooden' || key === 'item_shield_raven' || key === 'item_shield_wicker' || key === 'item_shield_leather' || key === 'item_shield_metal');
                const isArmor = (key === 'item_helmet' || key === 'item_plate_armor' || key === 'item_leather_armor' || key === 'item_boots' || key === 'item_gauntlets' || key === 'item_cloak' || key === 'item_chainmail' || key === 'item_crown');
        const isWeapon = (key === 'ph_saber' || key === 'ph_estoc' || key === 'ph_katana' || key === 'ph_dagger' || key === 'ph_axe' || key === 'ph_hatchet' || key === 'ph_hammer' || key === 'ph_sledgehammer' || key === 'ph_mace' || isOpenMmoXWeapon || key === 'item_shovel' || key === 'item_pickaxe' || key === 'item_wand' || key === 'item_rod' || key === 'item_staff' || key === 'item_staff_branch' || key === 'item_arrow');

                if (isWeapon) {
                    targetSpan = 0.68;
                } else if (isShield) {
                    targetSpan = 0.62;
                } else if (isArmor) {
                    targetSpan = 0.52;
                } else if (key === 'ph_chest') {
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
                innerPivot.scale.set(scale, scale, scale);

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

                this._gltfTemplateCache.set(key, wrapper);
                this.itemTemplates.set(key, wrapper);
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

    _cloneCachedGltfTemplate(template, colorHex, key) {
        if (!template) return null;
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
        if (colorHex && (key === 'item_wand' || key === 'item_rod' || key === 'item_staff' || key === 'item_staff_branch')) {
            this._tintedMatPool = this._tintedMatPool || new Map();
            const tintCol = new THREE.Color(colorHex);
            clone.traverse((c) => {
                if (c.isMesh && c.material && !Array.isArray(c.material)) {
                    const mName = (c.material.name || '').toLowerCase();
                    if (/core|crystal|orb|glow|tip|emerald/i.test(mName)) return;
                    const pKey = `item_${c.material.uuid}_${colorHex}`;
                    let pMat = this._tintedMatPool.get(pKey);
                    if (!pMat) {
                        pMat = c.material.clone();
                        pMat._sharedMaterial = true;
                        if (pMat.color) pMat.color.lerp(tintCol, 0.48);
                        this._tintedMatPool.set(pKey, pMat);
                    }
                    c.material = pMat;
                }
            });
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
            this.monsterDepthMat
        ]);
        const sharedTexs = new Set([
            this.monsterAtlasTex,
            this.monsterNormalTex,
            this.itemAtlasTex,
            this.itemNormalTex
        ]);
        entityObj.traverse((child) => {
            if (child.geometry && !child.geometry._sharedGeometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const m of mats) {
                    if (m && !m._sharedMaterial && !sharedMats.has(m)) {
                        if (m.map && !m.map._sharedTexture && !sharedTexs.has(m.map)) {
                            m.map.dispose();
                        }
                        m.dispose();
                    }
                }
            }
        });
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
        if (phKey && POLYHAVEN_ITEM_GLTF_PATHS[phKey]) {
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
                            if (group.itemMesh) group.remove(group.itemMesh);
                            group.itemMesh = upgraded3D;
                            group.add(upgraded3D);
                            group.isReal3DItem = true;
                            group.isItemBillboard = false;
                            delete group.pendingPhKey;
                            group.phKey = phKey;
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
                const tempGeo = new THREE.PlaneGeometry(0.4, 0.4);
                tempGeo.translate(0, 0.2, 0);
                mesh = new THREE.Mesh(tempGeo, this.itemBillboardMat);
                isBillboard = true;
                isItemBillboardFallback = true;
            }
        }

        if ((!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.contactShadows) && this.shadowGeo && this.shadowMat) {
            const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
            shadow.position.set(0, 0.005, 0);
            shadow.scale.set(footprint, footprint, footprint);
            group.add(shadow);
            group.shadowMesh = shadow;
        }

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

        if (it.name) {
            const sprite = this.createItemCaptionSprite(it);
            if (sprite) {
                group.add(sprite);
                group.caption = sprite;
            }
        }

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
            spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
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

        items.forEach(it => {
            const id = `${it.x}_${it.y}_${it.name || it.glyph}`;
            activeIds.add(id);
            let entity = this.items.get(id);

            const wx = it.x * this.cellSize;
            const wz = it.y * this.cellSize;

            if (!entity) {
                entity = this.createItem3DEntity(it);
                entity.position.set(wx, 0.0, wz);
                this.scene.add(entity);
                this.items.set(id, entity);
            } else {
                entity.itemData = it;
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

            // Strict Subterranean Visibility Invariant:
            // Items are only visible in 3D if outdoors within 28m, or if within player's lit field of view or torchlight
            const itemDistSq = (it.x - px) * (it.x - px) + (it.y - py) * (it.y - py);
            let isVisible = outdoors ? (itemDistSq <= 784) : false;
            if (!isVisible && !outdoors && this.lastMap) {
                const flag = this.getFlagAt(this.lastMap, it.x, it.y);
                const inView = (flag & 0x2) !== 0;
                const lighting = (flag >> 2) & 0x3;
                isVisible = inView && (lighting < 3 || itemDistSq <= (this.torchRadius + 1) ** 2);
            }
            entity.visible = isVisible;

            // Only show caption when player is within 6 cells and item is visible
            if (entity.caption) {
                const dist = Math.hypot(it.x - px, it.y - py);
                entity.caption.visible = isVisible && (dist <= 6);
            }
        });

        for (const [id, entity] of this.items.entries()) {
            if (!activeIds.has(id)) {
                this.destroyEntity(entity);
                this.items.delete(id);
            }
        }
    }

    animate() {
        requestAnimationFrame(this.animate);

        const tNow = performance.now();

        // When terminal or death modal completely covers the screen, throttle 3D rendering to 5 FPS
        const termContainer = document.getElementById('terminal-container');
        const deathModal = document.getElementById('death-modal');
        const isCovered = (termContainer && !termContainer.classList.contains('hidden')) ||
                          (deathModal && !deathModal.classList.contains('hidden'));
        const isRecording = typeof window !== 'undefined' && window.location.search && window.location.search.includes('record_walkthrough=1');
        if (isCovered && !isRecording) {
            if (this._lastThrottledRender && (tNow - this._lastThrottledRender < 200)) {
                return;
            }
            this._lastThrottledRender = tNow;
        }

        const delta = 0.016; // ~60fps step

        // Smooth camera position tweening
        if (this.isStepping) {
            this.stepTime += delta;
            const progress = Math.min(1.0, this.stepTime / this.stepDuration);
            const t = progress * (2 - progress); // Ease out quad

            this.camera.position.lerpVectors(this.currentCamPos, this.targetCamPos, t);

            // Reactive Walking Head-bob (subtle vertical sinusoidal breathing)
            this.cameraBobPhase += delta * 18;
            const baseY = this.targetCamPos ? this.targetCamPos.y : this.eyeHeight;
            this.camera.position.y = baseY + Math.sin(this.cameraBobPhase) * 0.045;

            if (progress >= 1.0) {
                this.currentCamPos.copy(this.targetCamPos);
                this.camera.position.copy(this.targetCamPos);
                this.isStepping = false;
                this.stepPlayedThisMove = false;
            }
        } else {
            this.camera.position.copy(this.targetCamPos);
            this.isStepping = false;
            this.stepPlayedThisMove = false;
            // Idle breathing bob & buoyant liquid bobbing in water
            const baseY = this.targetCamPos ? this.targetCamPos.y : this.eyeHeight;
            const idleBob = Math.sin(tNow * 0.002) * 0.012;
            const waterBob = (this.playerWaterYOffset && this.playerWaterYOffset < 0) ? Math.sin(tNow * 0.0035) * 0.016 : 0;
            this.camera.position.y = baseY + idleBob + waterBob;
        }

        // Calm, subtle subterranean torch draft (slow 0.3-0.5Hz gentle breath, max ±2.5% variation, NO rapid strobe)
        const isEnhancedDraft = window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.torchDraft;
        const livingFlicker = isEnhancedDraft
            ? (1.0 + Math.sin(tNow * 0.0016) * 0.022 + Math.cos(tNow * 0.0008) * 0.014)
            : 1.0;

        const currentTargetEnergy = this.targetTorchEnergy !== undefined ? this.targetTorchEnergy : 2.8;
        this.torchLight.intensity = currentTargetEnergy * livingFlicker;
        this.torchFillLight.intensity = (currentTargetEnergy * 0.22) * livingFlicker;

        // Stable, warm lantern gold (no distracting color shifts)
        if (this.torchBaseColor) {
            this.torchLight.color.copy(this.torchBaseColor);
        }

        if (this.flameMesh) {
            const flameBreath = 1.0 + Math.sin(tNow * 0.002) * 0.03;
            this.flameMesh.scale.set(flameBreath, 1.0 + Math.cos(tNow * 0.0015) * 0.04, flameBreath);
        }

        // Ensure rotation order is always YXZ (Yaw first, then Pitch, then Roll)
        this.camera.rotation.order = 'YXZ';

        // Smooth spring camera turning (1:1 with Godot client)
        const targetYaw = this.targetYaw;
        const currentYaw = this.camera.rotation.y;
        const diff = targetYaw - currentYaw;
        const wrappedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));

        if (Math.abs(wrappedDiff) > 0.002) {
            this.camera.rotation.y += wrappedDiff * Math.min(1.0, delta * 22);
        } else {
            this.camera.rotation.y = targetYaw;
        }

        // Natural Hand-Held Torch Inertia (responds to turning yaw and walking step bob)
        if (window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.torchInertia) {
            const yawInertia = Math.max(-0.14, Math.min(0.14, -wrappedDiff * 0.22));
            const bobInertia = (this.camera.position.y - this.eyeHeight) * 0.35;
            this.torchLight.position.x = -0.25 + yawInertia;
            this.torchLight.position.y = -0.05 - bobInertia;
        } else {
            this.torchLight.position.set(-0.25, -0.05, -0.28);
        }

        // Smooth camera pitch based on character height & manual head tilt
        const activeTargetPitch = (this.basePitch !== undefined ? this.basePitch : -0.157) + (this.userPitchOffset || 0.0);
        this.targetPitch = activeTargetPitch;
        const pitchDiff = this.targetPitch - this.camera.rotation.x;
        if (Math.abs(pitchDiff) > 0.001) {
            this.camera.rotation.x += pitchDiff * Math.min(1.0, delta * 12);
        } else {
            this.camera.rotation.x = this.targetPitch;
        }

        // Camera roll: lock strictly to 0 when not turning or experiencing trauma (prevents any left/right room skew)
        let roll = 0;
        if (Math.abs(wrappedDiff) > 0.005) {
            // Very subtle turning roll inertia (1:1 with Godot DungeonWorld.cs:3405)
            roll = Math.max(-0.02, Math.min(0.02, -wrappedDiff * 0.04));
        }
        this.camera.rotation.z = roll;

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

        // Camera Screen Trauma / Shake (Decaying trauma scalar matching Godot DungeonWorld.cs)
        if (this.trauma > 0) {
            this.trauma = Math.max(0, this.trauma - delta * 1.5);
            const shake = this.trauma * this.trauma;
            const yawShake = (Math.random() - 0.5) * 0.04 * shake;
            const pitchShake = (Math.random() - 0.5) * 0.04 * shake;
            const rollShake = (Math.random() - 0.5) * 0.02 * shake;
            this.camera.rotation.y += yawShake;
            this.camera.rotation.x += pitchShake;
            this.camera.rotation.z += rollShake;
        }

        // Natural Walk Bobbing & Turn Sway on First-Person Hands (1:1 with Godot ViewModel.cs)
        let bobY = 0;
        let bobX = 0;
        if (this.isStepping) {
            this.cameraBobPhase += delta * 9.5;
            bobY = Math.sin(this.cameraBobPhase) * 0.014;
            bobX = Math.cos(this.cameraBobPhase * 0.5) * 0.010;
        } else {
            // Subtle idle breathing
            bobY = Math.sin(tNow * 0.0025) * 0.003;
        }

        // Viewmodel Action Dynamics: Attack thrust, Hurt recoil, Spellcast surge
        let actZ = 0;
        let actY = 0;
        let actRotZ = 0;
        let actRotX = 0;

        if (this.attackAnimationTime > 0) {
            this.attackAnimationTime -= delta;
            const prog = (0.22 - this.attackAnimationTime) / 0.22;
            const sinPulse = Math.sin(prog * Math.PI);
            actZ += sinPulse * 0.16; // Thrust forward
            actRotZ -= sinPulse * 0.32; // Slash rotation
            actRotX += sinPulse * 0.12;
        } else if (this.hurtAnimationTime > 0) {
            this.hurtAnimationTime -= delta;
            const prog = (0.16 - this.hurtAnimationTime) / 0.16;
            const sinPulse = Math.sin(prog * Math.PI);
            actZ -= sinPulse * 0.10; // Recoil back toward camera
            actRotX -= sinPulse * 0.18;
            actY -= sinPulse * 0.04;
        } else if (this.castAnimationTime > 0) {
            this.castAnimationTime -= delta;
            const prog = (0.32 - this.castAnimationTime) / 0.32;
            const sinPulse = Math.sin(prog * Math.PI);
            actY += sinPulse * 0.09; // Raise hands/wand
            actRotX -= sinPulse * 0.22;
        }

        // Apply to Right Hand
        if (this.rightHandGroup && this.rightRestPos) {
            this.rightHandGroup.position.x = this.rightRestPos.x + bobX;
            this.rightHandGroup.position.y = this.rightRestPos.y + bobY + actY;
            this.rightHandGroup.position.z = this.rightRestPos.z + actZ;
            this.rightHandGroup.rotation.x = this.rightRestRot.x + actRotX;
            this.rightHandGroup.rotation.y = this.rightRestRot.y;
            this.rightHandGroup.rotation.z = this.rightRestRot.z + actRotZ;
        }

        // Apply to Left Hand
        if (this.leftHandGroup && this.leftRestPos) {
            this.leftHandGroup.position.x = this.leftRestPos.x - bobX;
            this.leftHandGroup.position.y = this.leftRestPos.y + bobY + (this.hurtAnimationTime > 0 ? actY : 0);
            this.leftHandGroup.position.z = this.leftRestPos.z + (this.hurtAnimationTime > 0 ? actZ : 0);
            this.leftHandGroup.rotation.x = this.leftRestRot.x + (this.hurtAnimationTime > 0 ? actRotX : 0);
            this.leftHandGroup.rotation.y = this.leftRestRot.y;
            this.leftHandGroup.rotation.z = this.leftRestRot.z;
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
                if (ft.material.map) ft.material.map.dispose();
                this.floatingTexts.splice(i, 1);
            }
        }

        // Kinetic impact sparks & combat particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.elapsed += delta;
            for (const sp of p.sparks) {
                sp.mesh.position.addScaledVector(sp.vel, delta);
                sp.vel.y -= delta * 6.0; // Gravity
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
                p.material.dispose();
                if (p.ringMat) p.ringMat.dispose();
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
                } else if (proj.kind === 'fireball' || proj.kind === 'bolt') {
                    proj.group.position.lerpVectors(proj.startPos, proj.endPos, t);
                    if (Math.random() < 0.25) {
                        this.spawnHitSparks(proj.group.position, proj.colorHex, 1);
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
                    proj.group.scale.set(sc, sc, sc);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.domeMat) proj.domeMat.opacity = fade * 0.82;
                    if (proj.coreMat) proj.coreMat.opacity = fade * 0.95;
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.88;
                    if (proj.pLight) proj.pLight.intensity = (1.0 - t) * 4.2;
                } else if (proj.kind === 'slash' || proj.kind === 'crit_slash') {
                    proj.group.rotation.z += delta * 6.5;
                    const sc = 1.0 + t * 0.55;
                    proj.group.scale.set(sc, sc, sc);
                    const fade = Math.max(0, 1.0 - t);
                    if (proj.outerMat) proj.outerMat.opacity = fade * 0.95;
                    if (proj.innerMat) proj.innerMat.opacity = fade * 0.98;
                    if (proj.ringMat) proj.ringMat.opacity = fade * 0.85;
                    if (proj.pLight) proj.pLight.intensity = (1.0 - t) * 3.5;
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
                    this.scene.remove(proj.group);
                    if (proj.onComplete) proj.onComplete();
                    if (proj.disposables) {
                        for (const d of proj.disposables) {
                            if (d && typeof d.dispose === 'function') d.dispose();
                        }
                    }
                    this.activeProjectiles.splice(i, 1);
                }
            }
        }

        // Distance culling for floating terrain labels (Godot VisibilityRangeEnd: 45m stores, 25m stairs)
        if (this.terrainLabelsGroup && this.terrainLabelsGroup.children) {
            for (let i = 0; i < this.terrainLabelsGroup.children.length; i++) {
                const sprite = this.terrainLabelsGroup.children[i];
                const maxDist = sprite.maxDist || 45.0;
                sprite.visible = (this.camera.position.distanceToSquared(sprite.position) <= maxDist * maxDist);
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
                        this._hoveredTile = { x: hit.x, y: hit.y };
                        const path = (this._hoverInputRef && typeof this._hoverInputRef.computeMinimapPath === 'function')
                            ? this._hoverInputRef.computeMinimapPath(px, py, hit.x, hit.y, this.lastFrame)
                            : null;
                        if (this.navCursorGroup && this.navCursorMesh) {
                            this.navCursorGroup.visible = true;
                            this.navCursorMesh.visible = true;
                            this.navCursorMesh.position.set(hit.x * this.cellSize, 0.035, hit.y * this.cellSize);
                            if (path && path.length > 0 && path.length <= 64) {
                                const isDoor = hit.kind === 'door';
                                this.navCursorMesh.material.color.setHex(isDoor ? 0xff9f1c : 0xffd700);
                                this.navCursorMesh.material.opacity = 0.82;
                                if (this.navBreadcrumbsMesh) {
                                    if (!this._scratchNavMatrix) this._scratchNavMatrix = new THREE.Matrix4();
                                    if (!this._scratchNavPos) this._scratchNavPos = new THREE.Vector3();
                                    const count = Math.min(path.length, 64);
                                    for (let pIdx = 0; pIdx < count; pIdx++) {
                                        const step = path[pIdx];
                                        this._scratchNavPos.set(step.x * this.cellSize, 0.028, step.y * this.cellSize);
                                        this._scratchNavMatrix.makeTranslation(this._scratchNavPos.x, this._scratchNavPos.y, this._scratchNavPos.z);
                                        this.navBreadcrumbsMesh.setMatrixAt(pIdx, this._scratchNavMatrix);
                                    }
                                    this.navBreadcrumbsMesh.count = count;
                                    this.navBreadcrumbsMesh.instanceMatrix.needsUpdate = true;
                                }
                            } else {
                                if (this.navBreadcrumbsMesh) this.navBreadcrumbsMesh.count = 0;
                                this.navCursorMesh.material.color.setHex(0xef4444);
                                this.navCursorMesh.material.opacity = 0.32;
                            }
                        }
                    } else {
                        this._hoveredTile = null;
                        if (this.navCursorGroup) this.navCursorGroup.visible = false;
                    }
                }
            }
        }

        // 3D StreetView Ground Chevrons Forward Alignment & Modulation
        if (this.streetViewGroup && this.streetViewGroup.visible && this._streetChevrons && this.camera) {
            if (!this._scratchCamDir) this._scratchCamDir = new THREE.Vector3();
            this.camera.getWorldDirection(this._scratchCamDir);
            const fwdLen = Math.hypot(this._scratchCamDir.x, this._scratchCamDir.z);
            const fwdX = fwdLen > 0.001 ? this._scratchCamDir.x / fwdLen : 0;
            const fwdZ = fwdLen > 0.001 ? this._scratchCamDir.z / fwdLen : -1;

            for (let i = 0; i < this._streetChevrons.length; i++) {
                const chevron = this._streetChevrons[i];
                const d = chevron.userData;
                if (!d.passable) {
                    chevron.visible = false;
                    continue;
                }
                const len = Math.hypot(d.dx, d.dy);
                const cDirX = d.dx / len;
                const cDirZ = d.dy / len;
                const forwardDot = fwdX * cDirX + fwdZ * cDirZ;

                if (forwardDot < 0.20) {
                    chevron.visible = false;
                    continue;
                }
                chevron.visible = true;

                let targetOp = forwardDot >= 0.72 ? 0.42 : (forwardDot >= 0.35 ? 0.28 : 0.16);
                let scale = 1.0;

                const isHovered = this._hoveredTile && this._hoveredTile.x === d.tx && this._hoveredTile.y === d.ty;
                if (isHovered) {
                    targetOp = 0.90;
                    scale = 1.22;
                }
                chevron.material.opacity = targetOp;
                chevron.scale.set(scale, 1.0, scale);
            }
        }

        // Monsters gentle hover, walking lerp & facing
        const monTime = tNow * 0.003;
        const camPos = this.camera ? this.camera.position : null;
        const candidateNameplates = [];

        for (const entity of this.monsters.values()) {
            const entityDistSq = camPos ? ((entity.position.x - camPos.x) ** 2 + (entity.position.z - camPos.z) ** 2) : 0;
            entity.visible = (entityDistSq <= 1225);
            if (!entity.visible) {
                if (entity.nameplate) entity.nameplate.visible = false;
                continue;
            }

            if (camPos && entity.nameplate) {
                const dx = entity.position.x - camPos.x;
                const dz = entity.position.z - camPos.z;
                const distSq = dx * dx + dz * dz;
                const dist = Math.sqrt(distSq);
                if (dist > 14.0 || !entity.visible) {
                    entity.nameplate.visible = false;
                } else {
                    const angle = Math.atan2(dx, dz);
                    const isTargeted = Boolean(entity.lastTargeted || (entity.nameplate && entity.nameplate.isTargeted));
                    candidateNameplates.push({ entity, dist, angle, isTargeted });
                }
            }
            if (entity.targetPos) {
                const dist = entity.position.distanceTo(entity.targetPos);
                if (dist > this.cellSize * 2.2) {
                    // Teleport snap
                    entity.position.copy(entity.targetPos);
                } else if (dist > 0.01) {
                    // Smooth 1-tile walking lerp
                    entity.position.lerp(entity.targetPos, 0.22);
                    // Face movement direction
                    const dx = entity.targetPos.x - entity.position.x;
                    const dz = entity.targetPos.z - entity.position.z;
                    if (dx * dx + dz * dz > 0.001) {
                        entity.rotation.y = Math.atan2(dx, dz);
                    }
                } else {
                    // Idle: Smoothly turn to face the player's camera (matching Godot client MonsterModelResolver.cs)
                    if (!entity.isAsleep && !(entity.monsterData && entity.monsterData.asleep)) {
                        const dx = this.camera.position.x - entity.position.x;
                        const dz = this.camera.position.z - entity.position.z;
                        if (dx * dx + dz * dz > 0.001) {
                            const targetYaw = Math.atan2(dx, dz);
                            const diff = targetYaw - entity.rotation.y;
                            const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
                            entity.rotation.y += wrapped * 0.12;
                        }
                    }
                }
            }
            // Vertical hover/float
            const baseY = entity.isFloating ? 0.45 : 0.0;
            entity.position.y = baseY + Math.sin(monTime + entity.position.x * 2.0) * (entity.isFloating ? 0.08 : 0.02);

            // Hit flinch recoil and warm crimson flash
            if (entity._hitFlinchTimer > 0) {
                entity._hitFlinchTimer -= delta;
                if (entity._hitFlinchDir) {
                    const flinchFactor = Math.sin(Math.max(0, entity._hitFlinchTimer / 0.20) * Math.PI) * 0.14;
                    entity.position.addScaledVector(entity._hitFlinchDir, flinchFactor * delta * 8);
                }
            }
            if (entity._hitFlashTimer > 0) {
                entity._hitFlashTimer -= delta;
                const flashAmt = Math.max(0, entity._hitFlashTimer / 0.18);
                if (!entity._emissiveMaterials) {
                    entity._emissiveMaterials = [];
                    entity.traverse(c => {
                        if (c.isMesh && c.material) {
                            const mats = Array.isArray(c.material) ? c.material : [c.material];
                            for (const m of mats) {
                                if (m && m.emissive) {
                                    if (!m._origEmissive) m._origEmissive = m.emissive.clone();
                                    entity._emissiveMaterials.push(m);
                                }
                            }
                        }
                    });
                }
                for (let mIdx = 0; mIdx < entity._emissiveMaterials.length; mIdx++) {
                    const m = entity._emissiveMaterials[mIdx];
                    if (m && m.emissive) {
                        m.emissive.setRGB(flashAmt * 0.85, flashAmt * 0.08, flashAmt * 0.08);
                    }
                }
            } else if (entity._hitFlashTimer !== undefined && entity._hitFlashTimer <= 0 && entity._hitFlashTimer > -1) {
                entity._hitFlashTimer = -1;
                if (entity._emissiveMaterials) {
                    for (let mIdx = 0; mIdx < entity._emissiveMaterials.length; mIdx++) {
                        const m = entity._emissiveMaterials[mIdx];
                        if (m && m.emissive && m._origEmissive) {
                            m.emissive.copy(m._origEmissive);
                        }
                    }
                }
            }

            // Mixer state machine: idle vs walk vs sleep (distance-culled at 18m / 324m^2)
            const isAsleep = Boolean(entity.isAsleep || (entity.monsterData && entity.monsterData.asleep));
            if (entity._mixer) {
                if (isAsleep) {
                    entity._mixer.timeScale = 0.0;
                } else {
                    entity._mixer.timeScale = 1.0;
                    const isMoving = Boolean(entity.targetPos && entity.position.distanceTo(entity.targetPos) > 0.02);
                    if (isMoving && entity._walkAction) {
                        if (entity._activeAnimState !== 'walk') {
                            entity._activeAnimState = 'walk';
                            if (entity._idleAction) entity._idleAction.fadeOut(0.2);
                            entity._walkAction.reset().fadeIn(0.2).play();
                        }
                    } else if (!isMoving && entity._idleAction) {
                        if (entity._activeAnimState !== 'idle') {
                            entity._activeAnimState = 'idle';
                            if (entity._walkAction) entity._walkAction.fadeOut(0.2);
                            entity._idleAction.reset().fadeIn(0.2).play();
                        }
                    }
                    if (entity.visible && entityDistSq < 324) {
                        entity._mixer.update(delta);
                        this._stabilizeHeldEquipment(entity);
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
            } else if (entityDistSq <= 400 && !entity._mixer && entity.creatureMesh && (entity.creatureMesh._rigBoneSets || entity.creatureMesh._rigBones)) {
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

        // Apply line-of-sight angular de-overlap (14m max distance, suppress only when directly behind a closer creature)
        if (candidateNameplates.length > 0) {
            candidateNameplates.sort((a, b) => a.dist - b.dist);
            if (candidateNameplates.length > 12) {
                for (let k = 12; k < candidateNameplates.length; k++) {
                    candidateNameplates[k].entity.nameplate.visible = false;
                }
                candidateNameplates.length = 12;
            }
            const accepted = [];
            for (let i = 0; i < candidateNameplates.length; i++) {
                const item = candidateNameplates[i];
                if (item.isTargeted) {
                    item.entity.nameplate.visible = true;
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
                    accepted.push(item);
                }
            }
        }

        // Items continuous gentle hover kinematics, cylindrical facing & contact shadow modulation
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
                    // Subtle magical floating breathing hover (1:1 retro dungeon feel)
                    const hover = Math.sin(tNow * 0.0022 + seed * 0.3) * 0.012;
                    const baseElevation = entity.itemMesh.baseElevation || 0.04;
                    entity.itemMesh.position.y = baseElevation + hover;
                    if (entity.shadowMesh) {
                        const baseFootprint = entity.itemMesh.footprint || 0.35;
                        const sScale = baseFootprint * Math.max(0.70, 1.0 - hover * 6.0);
                        entity.shadowMesh.scale.set(sScale, sScale, sScale);
                    }
                } else {
                    // Fallback 3D item spinning rotation & hover
                    entity.itemMesh.rotation.y += delta * 0.75;
                    const hover = Math.sin(tNow * 0.0025 + seed * 0.2) * 0.025;
                    entity.itemMesh.position.y = 0.12 + hover;
                    if (entity.shadowMesh) {
                        const sScale = Math.max(0.65, 1.0 - hover * 5.0);
                        entity.shadowMesh.scale.set(sScale, sScale, sScale);
                    }
                }
            }
        }

        // In-view molten lava surface breathing pulse (zero extra light sources)
        if (this.lavaTex && this.lavaEmission) {
            const time = tNow * 0.001;
            const lx = Math.sin(time * 0.35) * 0.08 + (time * 0.018) % 1.0;
            const ly = Math.cos(time * 0.28) * 0.08 + (time * 0.014) % 1.0;
            this.lavaTex.offset.set(lx, ly);
            this.lavaEmission.offset.set(lx, ly);
        }
        if (this.lavaMaterial && (!window.GRAPHICS_CONFIG || window.GRAPHICS_CONFIG.surfaceBreathing)) {
            const time = tNow * 0.001;
            this.lavaMaterial.emissiveIntensity = 2.15 + Math.sin(time * 2.8) * 0.45 + Math.cos(time * 6.3) * 0.20;
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
                        u.uHorizonColor.value.setHex(0x28161c);
                        u.uZenithColor.value.setHex(0x0a0408);
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

        // On-demand shadow update when camera moves
        if (this.camera) {
            const camDist = Math.hypot(
                this.camera.position.x - (this._lastShadowCamX || 0),
                this.camera.position.z - (this._lastShadowCamZ || 0)
            );
            if (camDist > 0.08) {
                this._lastShadowCamX = this.camera.position.x;
                this._lastShadowCamZ = this.camera.position.z;
                this.markShadowsDirty();
            }
        }

        if (!this._contextLost) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Raycasts mouse/touch screen coordinates against active 3D monsters.
     * Used for click-to-talk interactive creature dialogue in Living Chronicle.
     */
    getMonsterAtScreenCoords(clientX, clientY) {
        if (!this.camera || !this.renderer || !this.monsters || this.monsters.size === 0) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        if (!this._mouseVec) this._mouseVec = new THREE.Vector2();
        if (!this._raycaster) this._raycaster = new THREE.Raycaster();
        if (!this._tempVec3) this._tempVec3 = new THREE.Vector3();

        this._mouseVec.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        this._raycaster.setFromCamera(this._mouseVec, this.camera);

        // 1. Direct mesh intersection
        const candidates = [];
        for (const entity of this.monsters.values()) {
            if (entity.visible) candidates.push(entity);
        }

        if (candidates.length > 0) {
            const intersects = this._raycaster.intersectObjects(candidates, true);
            if (intersects.length > 0) {
                let obj = intersects[0].object;
                while (obj && !obj.monsterData && obj.parent) {
                    obj = obj.parent;
                }
                if (obj && obj.monsterData) {
                    const mData = obj.monsterData;
                    if (obj.modelGender) mData.modelGender = obj.modelGender;
                    if (obj.modelKey) mData.modelKey = obj.modelKey;
                    if (obj.isFemale !== undefined) mData.isFemale = obj.isFemale;
                    return mData;
                }
            }
        }

        // 2. Proximity check along ray (ensures responsive clicking even on slender models/nameplates)
        let closestMonster = null;
        let minRayDist = Infinity;
        const ray = this._raycaster.ray;

        for (const entity of this.monsters.values()) {
            if (!entity.visible || !entity.monsterData) continue;
            this._tempVec3.copy(entity.position);
            this._tempVec3.y += (entity.modelHeight || 1.6) * 0.5;
            const distToRay = ray.distanceToPoint(this._tempVec3);
            if (distToRay < 0.95) { // Within creature interaction sphere
                const distAlongRay = ray.origin.distanceTo(this._tempVec3);
                if (distAlongRay < minRayDist) {
                    minRayDist = distAlongRay;
                    const mData = entity.monsterData;
                    if (entity.modelGender) mData.modelGender = entity.modelGender;
                    if (entity.modelKey) mData.modelKey = entity.modelKey;
                    if (entity.isFemale !== undefined) mData.isFemale = entity.isFemale;
                    closestMonster = mData;
                }
            }
        }

        return closestMonster;
    }

    /**
     * Raycasts mouse/touch screen coordinates against active 3D floor items/objects.
     * Used for afar click-to-inspect object examination & Lorekeeper appraisal.
     */
    getItemAtScreenCoords(clientX, clientY) {
        if (!this.camera || !this.renderer || !this.items || this.items.size === 0) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        if (!this._mouseVec) this._mouseVec = new THREE.Vector2();
        if (!this._raycaster) this._raycaster = new THREE.Raycaster();
        if (!this._tempVec3) this._tempVec3 = new THREE.Vector3();

        this._mouseVec.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        this._raycaster.setFromCamera(this._mouseVec, this.camera);

        // 1. Direct mesh intersection
        const candidates = [];
        for (const entity of this.items.values()) {
            if (entity.visible) candidates.push(entity);
        }

        if (candidates.length > 0) {
            const intersects = this._raycaster.intersectObjects(candidates, true);
            if (intersects.length > 0) {
                let obj = intersects[0].object;
                while (obj && !obj.itemData && !obj.itemName && obj.parent) {
                    obj = obj.parent;
                }
                if (obj && (obj.itemData || obj.itemName)) {
                    return obj.itemData || { name: obj.itemName, glyph: obj.glyph, attr: obj.attr };
                }
            }
        }

        // 2. Proximity check along ray (ensures responsive clicking for small floor items like rings, potions, coins)
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

        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
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

    initStreetViewNavigation() {
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
                color: 0xffe066,
                transparent: true,
                opacity: 0.42,
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

        const ringGeo = new THREE.RingGeometry(0.40, 0.54, 16);
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
    }

    canEngageStreetViewNav(frame) {
        if (!frame || frame.phase !== 'play' || !frame.player || !frame.map) return false;
        if ((frame.ui?.overlay || 0) > 0 || (!frame.ui?.awaiting_command && !frame.ui?.more)) return false;
        return true;
    }

    _isStreetViewTilePassable(frame, map, w, h, tx, ty) {
        if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
        const feat = this.getFeatAt(map, tx, ty);
        const glyph = this.getGlyphAt(map, tx, ty);
        const isSolidWall = feat === 0 || (feat >= 15 && feat <= 22) || feat === 30 || glyph === '#' || glyph === '%' || glyph === '*';
        const isTree = (feat === 25 && glyph !== '.' && glyph !== ',' && glyph !== "'");
        const isLava = feat === 23;
        const isDeepWater = feat === 24;
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
    }

    updateStreetViewAndCursor(frame) {
        if (!this.streetViewGroup) this.initStreetViewNavigation();

        if (!this.canEngageStreetViewNav(frame)) {
            if (this.streetViewGroup) this.streetViewGroup.visible = false;
            if (this.navCursorGroup) this.navCursorGroup.visible = false;
            return;
        }

        this.streetViewGroup.visible = true;
        const map = frame.map;
        const w = map.w || (map.rows && map.rows[0] && map.rows[0].f ? map.rows[0].f.length / 2 : 0);
        const h = map.h || (map.rows ? map.rows.length : 0);
        const px = frame.player.x !== undefined ? frame.player.x : 0;
        const py = frame.player.y !== undefined ? frame.player.y : 0;

        for (let i = 0; i < this._streetChevrons.length; i++) {
            const c = this._streetChevrons[i];
            const d = c.userData;
            const tx1 = px + d.dx;
            const ty1 = py + d.dy;
            const step1Passable = this._isStreetViewTilePassable(frame, map, w, h, tx1, ty1);

            if (step1Passable) {
                d.passable = true;
                const visualDist = 1.0;
                c.visible = true;
                c.position.set((px + d.dx * visualDist) * this.cellSize, 0.042, (py + d.dy * visualDist) * this.cellSize);
                c.rotation.y = Math.atan2(-d.dx, -d.dy);
                d.tx = tx1;
                d.ty = ty1;
            } else {
                d.passable = false;
                c.visible = false;
            }
        }
    }

    setHoverScreenCoords(clientX, clientY, inputManager) {
        this._pendingHoverX = clientX;
        this._pendingHoverY = clientY;
        this._hoverInputRef = inputManager;
        this._hoverDirty = true;
    }
}

window.Dungeon3D = Dungeon3D;


/**
 * dungeon3d-proc-textures.js — Procedural Texture Synthesis & Contextual Biome Texture Sets (WS71).
 * Extracted from dungeon3d.js to enforce modular LOC budgets with zero behavioral drift.
 */
(function (root) {
    'use strict';

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

let _inMicroSeed = false;

function procFractalNoise(x, y, octaves = 3, seed = 0) {
    const effOctaves = (_inMicroSeed && octaves > 1) ? 1 : octaves;
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let maxVal = 0;
    for (let i = 0; i < effOctaves; i++) {
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

const _seedGridBuf = new Int32Array(9 * 9 * 4);

function procCreateSeedTexture(size, refSize, pixelFunc, isColor = false, fullGrid = false) {
    const s = size || 64;
    _inMicroSeed = true;
    try {
        if (fullGrid || s !== 64) {
            const inv = refSize / s;
            return procCreateTexture(s, (x, y) => pixelFunc(x * inv, y * inv), isColor);
        }
        const step = refSize * 0.125;
        for (let gy = 0; gy <= 8; gy++) {
            const py = (gy === 8 ? 0 : gy) * step;
            for (let gx = 0; gx <= 8; gx++) {
                const col = pixelFunc((gx === 8 ? 0 : gx) * step, py);
                const o = (gy * 9 + gx) * 4;
                _seedGridBuf[o] = Math.min(255, Math.max(0, (col[0] * 255 + 0.5) | 0));
                _seedGridBuf[o + 1] = Math.min(255, Math.max(0, (col[1] * 255 + 0.5) | 0));
                _seedGridBuf[o + 2] = Math.min(255, Math.max(0, (col[2] * 255 + 0.5) | 0));
                _seedGridBuf[o + 3] = col[3] !== undefined ? Math.min(255, Math.max(0, (col[3] * 255 + 0.5) | 0)) : 255;
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(64, 64);
        const u32 = new Uint32Array(imgData.data.buffer, imgData.data.byteOffset, 4096);
        let p = 0;
        for (let y = 0; y < 64; y++) {
            const y0 = y >> 3, ty = y & 7, ity = 8 - ty;
            const row0 = y0 * 9, row1 = row0 + 9;
            for (let x = 0; x < 64; x++) {
                const x0 = x >> 3, tx = x & 7, itx = 8 - tx;
                const o00 = (row0 + x0) << 2, o10 = o00 + 4;
                const o01 = (row1 + x0) << 2, o11 = o01 + 4;
                const w00 = itx * ity, w10 = tx * ity, w01 = itx * ty, w11 = tx * ty;
                const r = (_seedGridBuf[o00] * w00 + _seedGridBuf[o10] * w10 + _seedGridBuf[o01] * w01 + _seedGridBuf[o11] * w11 + 32) >> 6;
                const g = (_seedGridBuf[o00 + 1] * w00 + _seedGridBuf[o10 + 1] * w10 + _seedGridBuf[o01 + 1] * w01 + _seedGridBuf[o11 + 1] * w11 + 32) >> 6;
                const b = (_seedGridBuf[o00 + 2] * w00 + _seedGridBuf[o10 + 2] * w10 + _seedGridBuf[o01 + 2] * w01 + _seedGridBuf[o11 + 2] * w11 + 32) >> 6;
                const a = (_seedGridBuf[o00 + 3] * w00 + _seedGridBuf[o10 + 3] * w10 + _seedGridBuf[o01 + 3] * w01 + _seedGridBuf[o11 + 3] * w11 + 32) >> 6;
                u32[p++] = (a << 24) | (b << 16) | (g << 8) | r;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        if (isColor) tex.encoding = THREE.sRGBEncoding;
        return tex;
    } finally {
        _inMicroSeed = false;
    }
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
const defTheme = (id, name, courses, wallRoughness, floorRoughness, wallBase, wallMortar, floorBase, floorMortar, extra = {}) =>
    Object.assign({ id, name, courses, wallRoughness, floorRoughness, wallBase, wallMortar, floorBase, floorMortar }, extra);

const CONTEXTUAL_THEMES = {
    angband_town: defTheme('angband_town', 'Bree Market Town (Cobblestones & Medieval Fieldstone)', 4, 0.82, 0.84, [0.65, 0.60, 0.54], [0.18, 0.16, 0.14], [0.55, 0.52, 0.48], [0.15, 0.14, 0.12], { pbrWall: true, pbrFloor: true }),
    angband_crypts: defTheme('angband_crypts', 'Upper Crypts (Ashlar Slate & Cold Barrow Granite)', 4, 0.82, 0.80, [0.42, 0.43, 0.46], [0.08, 0.08, 0.10], [0.38, 0.39, 0.42], [0.06, 0.06, 0.08], { grainScale: 1.0, chisel: 0.06 }),
    angband_flooded: defTheme('angband_flooded', 'Flooded Undercrofts (Wet Slate & Sunken Cistern Pools)', 4, 0.70, 0.38, [0.32, 0.38, 0.42], [0.06, 0.10, 0.09], [0.26, 0.32, 0.38], [0.04, 0.06, 0.08], { algaeBleed: true, waterPuddles: true, grainScale: 0.9, chisel: 0.04 }),
    angband_sepulchre: defTheme('angband_sepulchre', 'Deep Sepulchre (Ancient Sandstone Necropolis & Saltpeter)', 4, 0.88, 0.86, [0.55, 0.46, 0.36], [0.26, 0.20, 0.15], [0.48, 0.40, 0.30], [0.20, 0.16, 0.12], { saltpeterBloom: true, grainScale: 1.2, chisel: 0.08 }),
    angband_catacombs: defTheme('angband_catacombs', 'Overgrown Catacombs (Verdant Lichen & Spore Barrow)', 4, 0.78, 0.60, [0.34, 0.44, 0.32], [0.08, 0.16, 0.08], [0.30, 0.40, 0.28], [0.06, 0.12, 0.06], { lichenPatches: true, grainScale: 1.1, chisel: 0.05 }),
    angband_chasm: defTheme('angband_chasm', 'Chasm Threshold (Ironstone Deeps & Rust-Veined Quarry)', 4, 0.82, 0.78, [0.46, 0.40, 0.42], [0.16, 0.10, 0.12], [0.38, 0.34, 0.36], [0.12, 0.08, 0.10], { hematiteVeins: true, grainScale: 1.4, chisel: 0.10 }),
    angband_crystal: defTheme('angband_crystal', 'Crystal Caverns (Luminous Quartz & Amethyst Geodes)', 4, 0.68, 0.48, [0.44, 0.48, 0.58], [0.14, 0.16, 0.24], [0.40, 0.44, 0.54], [0.12, 0.14, 0.20], { crystalVeins: true, grainScale: 0.8, chisel: 0.04 }),
    angband_nether: defTheme('angband_nether', 'Deep Nether Mines (Pyrite Seams & Brimstone Vaults)', 4, 0.74, 0.60, [0.36, 0.34, 0.32], [0.12, 0.11, 0.08], [0.32, 0.30, 0.28], [0.10, 0.09, 0.07], { pyriteSulfur: true, grainScale: 1.3, chisel: 0.08 }),
    fcb_logrus: defTheme('fcb_logrus', 'Courts of Chaos & Logrus Chasms (Eldritch Veins)', 4, 0.72, 0.56, [0.30, 0.24, 0.38], [0.12, 0.06, 0.18], [0.26, 0.20, 0.34], [0.10, 0.05, 0.14], { abyssalRunes: true, crystalVeins: true, grainScale: 1.2, chisel: 0.07 }),
    angband_magma: defTheme('angband_magma', 'Magma Underworld (Scorched Basalt & Thermal Fissures)', 4, 0.78, 0.65, [0.26, 0.20, 0.18], [0.14, 0.05, 0.03], [0.24, 0.18, 0.16], [0.16, 0.06, 0.03], { thermalCracks: true, grainScale: 1.2, chisel: 0.08 }),
    angband_abyss: defTheme('angband_abyss', 'The Abyssal Citadel (Monolithic Black Obsidian & Blood-Iron)', 2, 0.65, 0.30, [0.18, 0.14, 0.22], [0.06, 0.02, 0.08], [0.14, 0.11, 0.17], [0.04, 0.01, 0.06], { abyssalRunes: true, grainScale: 0.7, chisel: 0.03 }),
    silq_slag: defTheme('silq_slag', 'The Gates of Slag & Iron Pits of Angband', 4, 0.85, 0.88, [0.30, 0.30, 0.32], [0.08, 0.08, 0.09], [0.26, 0.26, 0.28], [0.06, 0.06, 0.07], { ironStrips: true, grainScale: 1.3, chisel: 0.09 }),
    silq_armouries: defTheme('silq_armouries', "Morgoth's Armouries (Dark Foundries & Forge Deeps)", 4, 0.82, 0.84, [0.34, 0.28, 0.26], [0.10, 0.08, 0.07], [0.28, 0.24, 0.22], [0.08, 0.06, 0.05], { slagDrips: true, grainScale: 1.2, chisel: 0.07 }),
    silq_torment: defTheme('silq_torment', 'Deep Torment (Barrows of Thangorodrim & Balrog Halls)', 4, 0.80, 0.78, [0.26, 0.24, 0.28], [0.08, 0.06, 0.09], [0.22, 0.20, 0.24], [0.06, 0.05, 0.07], { charMarks: true, grainScale: 1.1, chisel: 0.07 }),
    silq_throne: defTheme('silq_throne', 'Citadel of the Iron Crown (Throne of Morgoth)', 2, 0.60, 0.24, [0.16, 0.15, 0.18], [0.05, 0.04, 0.06], [0.12, 0.11, 0.14], [0.03, 0.03, 0.04], { ironInlay: true, grainScale: 0.6, chisel: 0.02 }),
    hengband_town: defTheme('hengband_town', 'Eastern Overworld (Japanese Shikkui Plaster & Hinoki Cedar)', 4, 0.80, 0.82, [0.82, 0.80, 0.78], [0.22, 0.16, 0.12], [0.55, 0.53, 0.50], [0.18, 0.16, 0.14], { japaneseTimberPlaster: true, grainScale: 0.9, chisel: 0.04 }),
    hengband_dungeon: defTheme('hengband_dungeon', 'Eastern Pagoda Crypts & Sengoku Castle Vaults', 3, 0.78, 0.76, [0.42, 0.40, 0.42], [0.12, 0.10, 0.10], [0.38, 0.36, 0.38], [0.10, 0.08, 0.08], { ishigakiStyle: true, grainScale: 1.1, chisel: 0.07 }),
    hengband_cavern: defTheme('hengband_cavern', 'Fuji Basalt Caverns & Dragon Grottoes', 4, 0.84, 0.78, [0.36, 0.38, 0.42], [0.10, 0.12, 0.14], [0.32, 0.34, 0.38], [0.08, 0.10, 0.12], { crystalVeins: true, grainScale: 1.2, chisel: 0.08 }),
    hengband_hell: defTheme('hengband_hell', 'Labyrinth of Hell & Jigoku Basalt', 3, 0.78, 0.62, [0.24, 0.18, 0.20], [0.14, 0.04, 0.04], [0.20, 0.16, 0.18], [0.12, 0.04, 0.04], { thermalCracks: true, ishigakiStyle: true, grainScale: 1.1, chisel: 0.07 }),
    frog_town: defTheme('frog_town', 'Highland Frontier Town (Rustic Fieldstone & Cobblestone)', 4, 0.82, 0.84, [0.70, 0.66, 0.60], [0.22, 0.18, 0.14], [0.58, 0.56, 0.52], [0.18, 0.16, 0.12], { pbrWall: true, pbrFloor: true }),
    nethack_doom: defTheme('nethack_doom', 'Dungeons of Doom (Ancient Weathered Masonry)', 4, 0.84, 0.80, [0.44, 0.42, 0.38], [0.12, 0.11, 0.09], [0.38, 0.37, 0.34], [0.08, 0.08, 0.07], { lichenPatches: true, grainScale: 1.1, chisel: 0.06 }),
    nethack_mines: defTheme('nethack_mines', 'The Gnomish Mines (Timbered Rock & Ore Seams)', 4, 0.88, 0.86, [0.42, 0.36, 0.30], [0.14, 0.10, 0.08], [0.36, 0.28, 0.22], [0.12, 0.08, 0.06], { pyriteSulfur: true, grainScale: 1.3, chisel: 0.09 }),
    nethack_sokoban: defTheme('nethack_sokoban', 'Sokoban Puzzle Sanctum (Dressed Cyclopean Blocks)', 4, 0.74, 0.70, [0.52, 0.50, 0.46], [0.14, 0.13, 0.12], [0.46, 0.45, 0.42], [0.10, 0.10, 0.09], { grainScale: 0.9, chisel: 0.04 }),
    nethack_gehennom: defTheme('nethack_gehennom', 'Gehennom Brimstone Caverns (Valley of the Dead)', 4, 0.82, 0.68, [0.28, 0.18, 0.16], [0.16, 0.05, 0.03], [0.24, 0.16, 0.14], [0.14, 0.05, 0.03], { thermalCracks: true, charMarks: true, grainScale: 1.2, chisel: 0.08 }),
    nethack_astral: defTheme('nethack_astral', 'The Astral Plane (Sanctum of High Altars)', 2, 0.52, 0.36, [0.76, 0.75, 0.80], [0.28, 0.26, 0.34], [0.70, 0.69, 0.75], [0.22, 0.20, 0.28], { crystalVeins: true, grainScale: 0.7, chisel: 0.03 }),
    dcss_dungeon: defTheme('dcss_dungeon', 'Dungeon Upper Halls (Cracked Castle Stone)', 4, 0.84, 0.78, [0.43, 0.42, 0.40], [0.10, 0.10, 0.09], [0.38, 0.37, 0.36], [0.08, 0.08, 0.07], { grainScale: 1.1, chisel: 0.06 }),
    dcss_temple: defTheme('dcss_temple', 'The Ecumenical Temple (Polished Marble & Brass)', 2, 0.54, 0.40, [0.72, 0.68, 0.62], [0.24, 0.20, 0.16], [0.64, 0.60, 0.55], [0.18, 0.15, 0.12], { grainScale: 0.8, chisel: 0.03 }),
    dcss_lair: defTheme('dcss_lair', 'The Lair of Beasts (Overgrown Natural Caverns)', 4, 0.80, 0.64, [0.36, 0.44, 0.32], [0.10, 0.16, 0.08], [0.30, 0.42, 0.26], [0.08, 0.14, 0.06], { lichenPatches: true, algaeBleed: true, grainScale: 1.2, chisel: 0.07 }),
    dcss_vaults: defTheme('dcss_vaults', 'The Vaults (Ironbound Bastions)', 3, 0.70, 0.58, [0.38, 0.40, 0.44], [0.10, 0.11, 0.14], [0.34, 0.36, 0.40], [0.08, 0.09, 0.12], { ironStrips: true, grainScale: 0.9, chisel: 0.05 }),
    dcss_zot: defTheme('dcss_zot', 'The Realm of Zot (Orb Sanctum & Arcane Obsidian)', 2, 0.58, 0.34, [0.24, 0.18, 0.32], [0.10, 0.04, 0.16], [0.20, 0.15, 0.28], [0.08, 0.03, 0.14], { abyssalRunes: true, grainScale: 0.7, chisel: 0.03 }),
    brogue_cavern: defTheme('brogue_cavern', 'Bioluminescent Subterranean Grottos (Brogue Upper)', 4, 0.72, 0.42, [0.30, 0.40, 0.44], [0.06, 0.12, 0.14], [0.24, 0.34, 0.38], [0.04, 0.10, 0.12], { algaeBleed: true, waterPuddles: true, crystalVeins: true, grainScale: 1.1, chisel: 0.06 }),
    brogue_inferno: defTheme('brogue_inferno', 'Brimstone & Obsidian Chasms (Brogue Deep)', 4, 0.80, 0.62, [0.26, 0.20, 0.20], [0.14, 0.05, 0.04], [0.22, 0.17, 0.17], [0.14, 0.05, 0.04], { thermalCracks: true, grainScale: 1.2, chisel: 0.08 }),
    rogue_doom: defTheme('rogue_doom', 'Classic Dungeons of Doom (Amulet of Yendor Halls)', 4, 0.84, 0.78, [0.40, 0.40, 0.42], [0.09, 0.09, 0.10], [0.36, 0.36, 0.38], [0.07, 0.07, 0.08], { grainScale: 1.0, chisel: 0.06 }),
    ryod_obsidian: defTheme('ryod_obsidian', 'Obsidian Stronghold (Iron & Torchlight)', 3, 0.62, 0.44, [0.24, 0.23, 0.27], [0.08, 0.06, 0.09], [0.20, 0.20, 0.24], [0.06, 0.05, 0.08], { ryodBiome: 'obsidian', hematiteVeins: true, grainScale: 0.8, chisel: 0.04 }),
    ryod_bioluminescent: defTheme('ryod_bioluminescent', 'Bioluminescent Underdark (Glowing Flora & Chasms)', 4, 0.70, 0.40, [0.26, 0.38, 0.42], [0.05, 0.14, 0.14], [0.22, 0.32, 0.36], [0.04, 0.10, 0.12], { ryodBiome: 'bioluminescent', algaeBleed: true, waterPuddles: true, crystalVeins: true, grainScale: 1.0, chisel: 0.05 }),
    ryod_catacombs: defTheme('ryod_catacombs', 'Ecumenical Marble Sanctum (Crypts & Reliquaries)', 4, 0.84, 0.74, [0.46, 0.44, 0.48], [0.14, 0.12, 0.16], [0.40, 0.38, 0.42], [0.10, 0.09, 0.12], { ryodBiome: 'catacombs', saltpeterBloom: true, lichenPatches: true, grainScale: 1.0, chisel: 0.06 }),
    ryod_shadow_keep: defTheme('ryod_shadow_keep', 'Eastern Shadow Keep (Crimson Timber & Ishigaki)', 3, 0.76, 0.72, [0.40, 0.36, 0.38], [0.12, 0.08, 0.09], [0.36, 0.32, 0.34], [0.10, 0.07, 0.08], { ryodBiome: 'shadow_keep', ishigakiStyle: true, grainScale: 1.0, chisel: 0.06 }),
    ryod_chaos_rift: defTheme('ryod_chaos_rift', 'Abyssal Chaos Rift (Arcane Crystal & Void)', 4, 0.70, 0.50, [0.26, 0.18, 0.34], [0.10, 0.04, 0.16], [0.22, 0.15, 0.30], [0.08, 0.03, 0.14], { ryodBiome: 'chaos_rift', abyssalRunes: true, crystalVeins: true, grainScale: 1.0, chisel: 0.06 }),
    ryod_frozen_wastes: defTheme('ryod_frozen_wastes', 'Frozen Iron Wastes (Glacial Vaults & Rime)', 4, 0.56, 0.38, [0.46, 0.54, 0.62], [0.16, 0.22, 0.28], [0.40, 0.48, 0.56], [0.12, 0.18, 0.24], { ryodBiome: 'frozen_wastes', crystalVeins: true, grainScale: 0.9, chisel: 0.05 }),
    ryod_gilded_treasury: defTheme('ryod_gilded_treasury', 'Sunken Golden Treasury (Gilded Halls & Traps)', 3, 0.56, 0.42, [0.58, 0.50, 0.34], [0.22, 0.18, 0.08], [0.50, 0.44, 0.30], [0.18, 0.14, 0.06], { ryodBiome: 'gilded_treasury', pyriteSulfur: true, grainScale: 0.8, chisel: 0.04 }),
    ryod_volcanic_forge: defTheme('ryod_volcanic_forge', 'Volcanic Forge & Molten Core (Scorched Basalt & Slag)', 4, 0.78, 0.62, [0.28, 0.19, 0.17], [0.16, 0.05, 0.03], [0.24, 0.17, 0.15], [0.15, 0.05, 0.03], { ryodBiome: 'volcanic_forge', thermalCracks: true, slagDrips: true, grainScale: 1.1, chisel: 0.07 })
};

function normalizeRyodBiomeId(raw) {
    const b = String(raw || '').toLowerCase().trim();
    if (!b || b === 'obsidian' || b === 'obsidian_vaults' || b === 'angband_halls') return 'obsidian';
    if (b === 'volcanic_forge' || b === 'molten_core' || b.includes('volcan') || b.includes('molten') || b.includes('forge') || b.includes('brimstone')) return 'volcanic_forge';
    if (b === 'bioluminescent' || b === 'bioluminescent_caverns' || b === 'sunken_cavern' || b === 'fungal_depths' || b.includes('sunken') || b.includes('fung') || b.includes('spore') || b.includes('bio')) return 'bioluminescent';
    if (b === 'catacombs' || b === 'gothic_crypt' || b === 'gothic_crypts' || b.includes('crypt') || b.includes('catacomb') || b.includes('sepulchre')) return 'catacombs';
    if (b === 'shadow_keep' || b === 'eastern_sanctum' || b === 'eastern_keep' || b.includes('eastern') || b.includes('sengoku') || b.includes('onmyo')) return 'shadow_keep';
    if (b === 'chaos_rift' || b.includes('chaos') || b.includes('void') || b.includes('eldritch')) return 'chaos_rift';
    if (b === 'frozen_wastes' || b.includes('frozen') || b.includes('glacial') || b.includes('frost') || b.includes('rime')) return 'frozen_wastes';
    if (b === 'gilded_treasury' || b.includes('gilded') || b.includes('treasury') || b.includes('golden')) return 'gilded_treasury';
    if (b === 'iron_crown_throne' || b.includes('iron_crown')) return 'iron_crown_throne';
    return 'obsidian';
}

function resolveContextualTheme(realm, depth, levelSeed = 0, branchHint = '') {
    const r = String(realm || 'angband').toLowerCase();
    const d = Number(depth) || 0;
    const br = String(branchHint || (typeof window !== 'undefined' && window.__activeBranch) || '').toLowerCase();

    if (r === 'ryod') {
        const bp = (typeof window !== 'undefined' && window.__activeRyodBlueprint) || null;
        const b = normalizeRyodBiomeId(branchHint || (bp && bp.biome) || 'obsidian');
        if (d <= 0) {
            if (b === 'shadow_keep') return CONTEXTUAL_THEMES['hengband_town'];
            if (b === 'chaos_rift') return CONTEXTUAL_THEMES['frog_town'];
            if (b === 'frozen_wastes' || b === 'iron_crown_throne' || b === 'volcanic_forge') return CONTEXTUAL_THEMES['silq_slag'];
            return CONTEXTUAL_THEMES['angband_town'];
        }
        if (b === 'iron_crown_throne') return d <= 4 ? CONTEXTUAL_THEMES['silq_slag'] : (d <= 8 ? CONTEXTUAL_THEMES['silq_armouries'] : CONTEXTUAL_THEMES['silq_throne']);
        return CONTEXTUAL_THEMES[`ryod_${b}`] || CONTEXTUAL_THEMES['ryod_obsidian'];
    }

    if (d <= 0) {
        if (r === 'silq') return CONTEXTUAL_THEMES['silq_slag'];
        if (r === 'hengband') return CONTEXTUAL_THEMES['hengband_town'];
        if (r === 'frogcomposband') return CONTEXTUAL_THEMES['frog_town'];
        return CONTEXTUAL_THEMES['angband_town'];
    }

    if (r === 'silq') {
        if (d <= 5) return CONTEXTUAL_THEMES['silq_slag'];
        if (d <= 10) return CONTEXTUAL_THEMES['silq_armouries'];
        if (d <= 15) return CONTEXTUAL_THEMES['silq_torment'];
        return CONTEXTUAL_THEMES['silq_throne'];
    }
    if (r === 'hengband') {
        if (d <= 12) return CONTEXTUAL_THEMES['hengband_dungeon'];
        if (d <= 35) return CONTEXTUAL_THEMES['hengband_cavern'];
        return CONTEXTUAL_THEMES['hengband_hell'];
    }
    if (r === 'nethack') {
        if (br.includes('mine')) return CONTEXTUAL_THEMES['nethack_mines'];
        if (br.includes('sokoban')) return CONTEXTUAL_THEMES['nethack_sokoban'];
        if (d >= 51 || br.includes('astral')) return CONTEXTUAL_THEMES['nethack_astral'];
        if (d >= 21 || br.includes('gehennom')) return CONTEXTUAL_THEMES['nethack_gehennom'];
        return CONTEXTUAL_THEMES['nethack_doom'];
    }
    if (r === 'dcss') {
        if (br.includes('temple') || d === 4) return CONTEXTUAL_THEMES['dcss_temple'];
        if (br.includes('lair') || (d >= 5 && d <= 7)) return CONTEXTUAL_THEMES['dcss_lair'];
        if (br.includes('zot') || d >= 13) return CONTEXTUAL_THEMES['dcss_zot'];
        if (br.includes('vault') || d >= 8) return CONTEXTUAL_THEMES['dcss_vaults'];
        return CONTEXTUAL_THEMES['dcss_dungeon'];
    }
    if (r === 'brogue') {
        return d <= 10 ? CONTEXTUAL_THEMES['brogue_cavern'] : CONTEXTUAL_THEMES['brogue_inferno'];
    }
    if (r === 'rogue') {
        return CONTEXTUAL_THEMES['rogue_doom'];
    }

    // Vanilla Angband & FrogComposBand
    if (d <= 4) return CONTEXTUAL_THEMES['angband_crypts'];
    if (d <= 8) return CONTEXTUAL_THEMES['angband_flooded'];
    if (d <= 12) return CONTEXTUAL_THEMES['angband_sepulchre'];
    if (d <= 16) return CONTEXTUAL_THEMES['angband_catacombs'];
    if (d <= 20) return CONTEXTUAL_THEMES['angband_chasm'];
    if (d <= 35) return CONTEXTUAL_THEMES['angband_crystal'];
    if (d <= 60) return r === 'frogcomposband' ? CONTEXTUAL_THEMES['fcb_logrus'] : CONTEXTUAL_THEMES['angband_nether'];
    if (d <= 85) return CONTEXTUAL_THEMES['angband_magma'];
    return CONTEXTUAL_THEMES['angband_abyss'];
}

const THEME_ID_META = {
    angband_town: ['angband', 0], hengband_town: ['hengband', 0], frog_town: ['frogcomposband', 0],
    nethack_town: ['nethack', 0], dcss_town: ['dcss', 0],
    angband_crypts: ['angband', 2], angband_flooded: ['angband', 6], angband_sepulchre: ['angband', 10],
    angband_catacombs: ['angband', 14], angband_chasm: ['angband', 18], angband_crystal: ['angband', 25],
    angband_nether: ['angband', 45], fcb_logrus: ['frogcomposband', 45], angband_magma: ['angband', 70], angband_abyss: ['angband', 90],
    silq_slag: ['silq', 3], silq_armouries: ['silq', 8], silq_torment: ['silq', 13], silq_throne: ['silq', 18],
    hengband_dungeon: ['hengband', 5], hengband_cavern: ['hengband', 20], hengband_hell: ['hengband', 50], hengband_abyss: ['hengband', 50],
    nethack_doom: ['nethack', 5], nethack_mines: ['nethack', 6], nethack_sokoban: ['nethack', 8],
    nethack_gehennom: ['nethack', 30], nethack_astral: ['nethack', 52],
    dcss_dungeon: ['dcss', 2], dcss_temple: ['dcss', 4], dcss_lair: ['dcss', 6], dcss_vaults: ['dcss', 10], dcss_zot: ['dcss', 15],
    brogue_cavern: ['brogue', 5], brogue_inferno: ['brogue', 15], rogue_doom: ['rogue', 5],
    ryod_obsidian: ['ryod', 5], ryod_bioluminescent: ['ryod', 5], ryod_catacombs: ['ryod', 5],
    ryod_shadow_keep: ['ryod', 5], ryod_chaos_rift: ['ryod', 5], ryod_frozen_wastes: ['ryod', 5],
    ryod_gilded_treasury: ['ryod', 5], ryod_volcanic_forge: ['ryod', 5]
};

function resolveGeologicalShaderProfile(realm, depth, theme, outdoors, biomeOverride) {
    const tid = String((theme && theme.id) || '').toLowerCase();
    const tMeta = THEME_ID_META[tid] || null;
    const rawR = String(realm || '').toLowerCase();
    const r = rawR || (tMeta ? tMeta[0] : 'angband');
    const hasDepth = (depth !== undefined && depth !== null && depth !== '' && !Number.isNaN(Number(depth)));
    const d = hasDepth ? Number(depth) : (tMeta ? tMeta[1] : (outdoors ? 0 : 1));
    const ov = String(biomeOverride || '').toLowerCase();
    const EMERALD_MOSS = [0.07, 0.26, 0.10];
    const CYAN_SPORES = [0.05, 0.40, 0.38];
    const HEMATITE = [0.46, 0.12, 0.08];
    const CRYSTAL = [0.22, 0.58, 0.95];
    const PYRITE = [0.85, 0.68, 0.20];
    const RIME = [0.58, 0.86, 0.98];
    const MAGMA = [1.0, 0.34, 0.05];
    const CHAOS = [0.64, 0.18, 0.92];
    const SALTPETER = [0.76, 0.75, 0.70];
    const mk = (isCavern, fixtureArchetype, wetness, waterlineH, mossStrength, mossColor, veinStrength, veinColor, veinEmissive, roughnessScale, pomScale) => ({
        isCavern: !!isCavern, fixtureArchetype, wetness, waterlineH, mossStrength, mossColor, veinStrength, veinColor, veinEmissive, roughnessScale, pomScale
    });

    if (outdoors) {
        const isEast = (r === 'hengband' || tid.includes('heng') || ov.includes('shadow_keep') || ov.includes('eastern'));
        return mk(false, isEast ? 'sengoku_lantern' : 'iron_cresset', 0.10, 0.0, 0.14, EMERALD_MOSS, 0.0, SALTPETER, 0.0, 0.86, 0.022);
    }

    if (r === 'ryod' || tid.startsWith('ryod_')) {
        const bp = (typeof window !== 'undefined' && window.__activeRyodBlueprint) || null;
        const b = normalizeRyodBiomeId(ov || (theme && theme.ryodBiome) || (tid.startsWith('ryod_') ? tid.slice(5) : '') || (bp && bp.biome) || 'obsidian');
        if (b === 'volcanic_forge') return mk(true, 'abyssal_brazier', 0.04, 0.0, 0.0, EMERALD_MOSS, 0.74, MAGMA, 1.25, 0.86, 0.034);
        if (b === 'bioluminescent') return mk(true, 'bio_crystal', 0.78, 0.85, 0.60, CYAN_SPORES, 0.58, CRYSTAL, 0.95, 0.62, 0.032);
        if (b === 'catacombs') return mk(false, 'sanctuary_brass', 0.30, 0.0, 0.45, EMERALD_MOSS, 0.28, SALTPETER, 0.0, 0.90, 0.026);
        if (b === 'shadow_keep') return mk(false, 'sengoku_lantern', 0.18, 0.0, 0.20, EMERALD_MOSS, 0.22, HEMATITE, 0.0, 0.78, 0.026);
        if (b === 'chaos_rift') return mk(true, 'abyssal_brazier', 0.12, 0.0, 0.0, CYAN_SPORES, 0.70, CHAOS, 0.90, 0.68, 0.032);
        if (b === 'frozen_wastes') return mk(true, 'iron_cresset', 0.42, 0.0, 0.0, CYAN_SPORES, 0.62, RIME, 0.35, 0.48, 0.028);
        if (b === 'gilded_treasury') return mk(false, 'sanctuary_brass', 0.06, 0.0, 0.0, EMERALD_MOSS, 0.55, PYRITE, 0.25, 0.48, 0.020);
        if (b === 'iron_crown_throne') {
            return d <= 4
                ? mk(true, 'iron_cresset', 0.14, 0.0, 0.0, EMERALD_MOSS, 0.45, HEMATITE, 0.0, 0.94, 0.032)
                : mk(false, 'abyssal_brazier', 0.05, 0.0, 0.0, EMERALD_MOSS, 0.50, HEMATITE, 0.55, 0.48, 0.022);
        }
        return mk(false, 'iron_cresset', 0.10, 0.0, 0.0, EMERALD_MOSS, 0.35, HEMATITE, 0.0, 0.48, 0.024);
    }

    if (r === 'brogue') {
        return d <= 10
            ? mk(true, 'bio_crystal', 0.78, 0.85, 0.58, CYAN_SPORES, 0.54, CRYSTAL, 0.95, 0.62, 0.032)
            : mk(true, 'abyssal_brazier', 0.12, 0.0, 0.14, CYAN_SPORES, 0.70, MAGMA, 1.25, 0.86, 0.034);
    }
    if (r === 'hengband') {
        if (d <= 12) return mk(false, 'sengoku_lantern', 0.18, 0.0, 0.24, EMERALD_MOSS, 0.15, SALTPETER, 0.0, 0.80, 0.026);
        if (d <= 35) return mk(true, 'sengoku_lantern', 0.32, 0.0, 0.28, CYAN_SPORES, 0.48, CRYSTAL, 0.45, 0.88, 0.032);
        return mk(true, 'abyssal_brazier', 0.05, 0.0, 0.0, EMERALD_MOSS, 0.68, MAGMA, 1.25, 0.86, 0.034);
    }
    if (r === 'silq') {
        if (d <= 5 || tid === 'silq_slag') return mk(true, 'iron_cresset', 0.14, 0.0, 0.0, EMERALD_MOSS, 0.45, HEMATITE, 0.0, 0.94, 0.032);
        if (d <= 10 || tid === 'silq_armouries') return mk(false, 'iron_cresset', 0.06, 0.0, 0.0, EMERALD_MOSS, 0.40, MAGMA, 0.65, 0.84, 0.026);
        if (d <= 15 || tid === 'silq_torment') return mk(false, 'abyssal_brazier', 0.05, 0.0, 0.0, EMERALD_MOSS, 0.55, MAGMA, 0.95, 0.86, 0.028);
        return mk(false, 'abyssal_brazier', 0.04, 0.0, 0.0, EMERALD_MOSS, 0.50, HEMATITE, 0.55, 0.48, 0.022);
    }
    if (r === 'nethack') {
        if (ov.includes('mine') || tid === 'nethack_mines') return mk(true, 'iron_cresset', 0.36, 0.0, 0.22, EMERALD_MOSS, 0.56, PYRITE, 0.20, 0.92, 0.032);
        if (ov.includes('sokoban') || tid === 'nethack_sokoban') return mk(false, 'sanctuary_brass', 0.06, 0.0, 0.05, EMERALD_MOSS, 0.10, SALTPETER, 0.0, 0.74, 0.022);
        if (d >= 51 || ov.includes('astral') || tid === 'nethack_astral') return mk(false, 'sanctuary_brass', 0.04, 0.0, 0.0, CYAN_SPORES, 0.52, PYRITE, 0.55, 0.48, 0.018);
        if (d >= 21 || ov.includes('gehennom') || tid === 'nethack_gehennom') return mk(true, 'abyssal_brazier', 0.0, 0.0, 0.0, EMERALD_MOSS, 0.72, MAGMA, 1.25, 0.90, 0.034);
        return mk(false, 'iron_cresset', 0.30, 0.0, 0.35, EMERALD_MOSS, 0.18, SALTPETER, 0.0, 0.88, 0.026);
    }
    if (r === 'dcss') {
        if (ov.includes('temple') || tid === 'dcss_temple' || d === 4) return mk(false, 'sanctuary_brass', 0.12, 0.0, 0.10, EMERALD_MOSS, 0.40, PYRITE, 0.25, 0.48, 0.018);
        if (ov.includes('lair') || tid === 'dcss_lair' || (d >= 5 && d <= 7)) return mk(true, 'bio_crystal', 0.78, 0.0, 0.62, EMERALD_MOSS, 0.20, HEMATITE, 0.0, 0.62, 0.030);
        if (ov.includes('zot') || tid === 'dcss_zot' || d >= 13) return mk(false, 'abyssal_brazier', 0.06, 0.0, 0.0, CYAN_SPORES, 0.68, CHAOS, 0.90, 0.52, 0.024);
        if (ov.includes('vault') || tid === 'dcss_vaults' || d >= 8) return mk(false, 'iron_cresset', 0.10, 0.0, 0.05, EMERALD_MOSS, 0.45, PYRITE, 0.25, 0.64, 0.024);
        return mk(false, 'iron_cresset', 0.24, 0.0, 0.25, EMERALD_MOSS, 0.16, SALTPETER, 0.0, 0.88, 0.026);
    }
    if (r === 'rogue') {
        return mk(false, 'iron_cresset', 0.25, 0.0, 0.28, EMERALD_MOSS, 0.22, PYRITE, 0.0, 0.88, 0.026);
    }

    // Angband & FrogComposBand 9-Chapter Progression
    if (d <= 4 || tid === 'angband_crypts') return mk(false, 'iron_cresset', 0.08, 0.0, 0.08, EMERALD_MOSS, 0.12, SALTPETER, 0.0, 0.94, 0.024);
    if (d <= 8 || tid === 'angband_flooded') return mk(false, 'iron_cresset', 0.78, 0.85, 0.42, CYAN_SPORES, 0.15, SALTPETER, 0.0, 0.62, 0.024);
    if (d <= 12 || tid === 'angband_sepulchre') return mk(false, 'sanctuary_brass', 0.08, 0.0, 0.0, EMERALD_MOSS, 0.42, SALTPETER, 0.0, 0.94, 0.022);
    if (d <= 16 || tid === 'angband_catacombs') return mk(false, 'iron_cresset', 0.30, 0.0, 0.58, EMERALD_MOSS, 0.18, SALTPETER, 0.0, 0.84, 0.026);
    if (d <= 20 || tid === 'angband_chasm') return mk(true, 'iron_cresset', 0.18, 0.0, 0.08, EMERALD_MOSS, 0.52, HEMATITE, 0.0, 0.94, 0.032);
    if (d <= 35 || tid === 'angband_crystal') return mk(true, 'bio_crystal', 0.28, 0.0, 0.12, CYAN_SPORES, 0.62, CRYSTAL, 0.55, 0.68, 0.028);
    if (d <= 60) {
        return (r === 'frogcomposband' || tid === 'fcb_logrus')
            ? mk(true, 'abyssal_brazier', 0.12, 0.0, 0.0, CYAN_SPORES, 0.68, CHAOS, 0.90, 0.72, 0.030)
            : mk(true, 'abyssal_brazier', 0.10, 0.0, 0.0, EMERALD_MOSS, 0.55, PYRITE, 0.25, 0.82, 0.030);
    }
    if (d <= 85 || tid === 'angband_magma') return mk(true, 'abyssal_brazier', 0.0, 0.0, 0.0, EMERALD_MOSS, 0.72, MAGMA, 1.25, 0.88, 0.034);
    return mk(false, 'abyssal_brazier', 0.06, 0.0, 0.0, EMERALD_MOSS, 0.64, CHAOS, 0.90, 0.48, 0.024);
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

function procCreateStoneWallTexture(seedSize = 64) {
    const size = 512;
    const rowHeight = 128; // 4 horizontal courses of dressed ashlar stone
    const blockWidth = 256;
    const halfWidth = 128;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateStoneWallNormal(seedSize = 64) {
    const size = 512;
    const rowHeight = 128;
    const blockWidth = 256;
    const halfWidth = 128;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreatePermWallTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreatePermWallNormal(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateFloorTexture(seedSize = 64) {
    const size = 512;
    const tileSize = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateFloorNormal(seedSize = 64) {
    const size = 512;
    const tileSize = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateWoodDoorTexture(seedSize = 64) {
    const size = 512;
    const plankWidth = 128;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateDoorNormalTexture(seedSize = 64) {
    const size = 256;
    const plankWidth = 64;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const inPlankX = x % plankWidth;
        const seamDist = Math.min(inPlankX, plankWidth - 1 - inPlankX);
        const isIronStrap = (y >= 46 && y <= 64) || (y >= 192 && y <= 210);
        let nx = 0, ny = 0;
        if (isIronStrap) {
            const strapMid = (y < 128) ? 55 : 201;
            const rivetX = inPlankX - plankWidth * 0.5;
            const rivetY = y - strapMid;
            const rSq = rivetX * rivetX + rivetY * rivetY;
            if (rSq <= 16) {
                nx = rivetX * 0.16;
                ny = -rivetY * 0.16;
            } else if (Math.abs(y - strapMid) >= 7) {
                ny = (y < strapMid) ? 0.55 : -0.55;
            }
        } else if (seamDist <= 3) {
            nx = (inPlankX < plankWidth * 0.5) ? 0.65 : -0.65;
        } else {
            nx = (procSmoothNoise(x * 0.22, y * 0.05, 57) - 0.5) * 0.26;
            ny = (procSmoothNoise(x * 0.08, y * 0.18, 61) - 0.5) * 0.10;
        }
        const len = Math.hypot(nx, ny, 1.0);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, 1.0 / len * 0.5 + 0.5];
    }, false);
}

function procCreateStoreTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateCeilingTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const grain = (procSmoothNoise(x * 0.06, y * 0.06, 5) - 0.5) * 0.06;
        const microGrain = (procSmoothNoise(x * 0.18, y * 0.18, 6) - 0.5) * 0.03;
        const r = Math.max(0, Math.min(1, 0.22 + grain + microGrain));
        const g = Math.max(0, Math.min(1, 0.23 + grain + microGrain));
        const b = Math.max(0, Math.min(1, 0.25 + grain + microGrain));
        return [r, g, b];
    });
}

function procAshlarVeinStoneBase(x, y, darkScale = 0.72, warmShift = 0.0) {
    const size = 512, rowHeight = 128, blockWidth = 256, halfWidth = 128;
    const row = Math.floor(y / rowHeight);
    const yInRow = y % rowHeight;
    const distY = Math.min(yInRow, rowHeight - 1 - yInRow);
    const xOff = (row % 2 === 1) ? halfWidth : 0;
    const inBlockX = (x + size - xOff) % blockWidth;
    const distX = Math.min(inBlockX, blockWidth - 1 - inBlockX);
    const mortarDist = Math.min(distX, distY);
    if (mortarDist <= 4) {
        const mn = (procSmoothNoise(x * 0.25, y * 0.25, 101) - 0.5) * 0.03;
        return [0.05 + mn, 0.05 + mn, 0.07 + mn];
    }
    const blockId = row * 4 + Math.floor((x + size - xOff) / blockWidth);
    const blockHue = procHash(blockId, 0, 77);
    const rBase = (0.36 + (blockHue - 0.5) * 0.12 + warmShift) * darkScale;
    const gBase = (0.36 + (blockHue - 0.5) * 0.10) * darkScale;
    const bBase = (0.39 + (0.5 - blockHue) * 0.10 - warmShift * 0.5) * darkScale;
    const bevel = Math.min(1.0, (mortarDist - 4) / 18.0);
    const macroGrain = (procFractalNoise(x * 0.04, y * 0.04, 3, 11) - 0.5) * 0.12;
    const microGrain = (procSmoothNoise(x * 0.16, y * 0.16, 2) - 0.5) * 0.06;
    const chisel = (procSmoothNoise(x * 0.28, y * 0.07, 14) - 0.5) * 0.05;
    const shade = 0.68 + bevel * 0.32;
    return [
        Math.max(0, Math.min(1, rBase * shade + macroGrain + microGrain + chisel)),
        Math.max(0, Math.min(1, gBase * shade + macroGrain + microGrain + chisel)),
        Math.max(0, Math.min(1, bBase * shade + macroGrain + microGrain + chisel))
    ];
}

function procBranchingVeinDist(x, y, seed, skew = false) {
    const wx = x + (procSmoothNoise(x * 0.03, y * 0.03, seed + 5) - 0.5) * 42.0;
    const wy = y + (procSmoothNoise(x * 0.03 + 7.1, y * 0.03 + 3.4, seed + 9) - 0.5) * 42.0;
    const u = skew ? (wx * 1.15 - wy * 0.75) : wx;
    const v = skew ? (wx * 0.55 + wy * 1.05) : wy;
    const mainVein = Math.abs(procFractalNoise(u * 0.022, v * 0.022, 4, seed) - 0.5) * 2.0;
    const branchVein = Math.abs(procFractalNoise((v + 90) * 0.042, (u - 50) * 0.042, 3, seed + 17) - 0.5) * 2.4;
    return Math.min(mainVein, mainVein < 0.48 ? branchVein + 0.04 : 1.0);
}

function procCreateVeinNormal(seed, skew = false, isRaisedCrystal = false, seedSize = 64) {
    const size = 256, rowHeight = 64, blockWidth = 128, halfWidth = 64;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const row = Math.floor(y / rowHeight);
        const yInRow = y % rowHeight;
        const distY = Math.min(yInRow, rowHeight - 1 - yInRow);
        const xOff = (row % 2 === 1) ? halfWidth : 0;
        const inBlockX = (x + size - xOff) % blockWidth;
        const distX = Math.min(inBlockX, blockWidth - 1 - inBlockX);
        const mortarDist = Math.min(distX, distY);
        let dx = 0, dy = 0;
        if (mortarDist > 2 && mortarDist < 11) {
            const t = (mortarDist - 2) / 9.0;
            if (distX < distY) dx = (inBlockX < halfWidth) ? (1.0 - t) : -(1.0 - t);
            else dy = (yInRow < rowHeight / 2) ? (1.0 - t) : -(1.0 - t);
        }
        const sx = x * 2, sy = y * 2;
        const v0 = procBranchingVeinDist(sx, sy, seed, skew);
        const vx = procBranchingVeinDist(sx + 2, sy, seed, skew);
        const vy = procBranchingVeinDist(sx, sy + 2, seed, skew);
        const sign = isRaisedCrystal ? -2.6 : 2.4;
        const vMask = v0 < 0.30 ? 1.0 : 0.0;
        const rockBump = (procFractalNoise(sx * 0.05, sy * 0.05, 3, 50) - 0.5) * 0.22;
        const nx = dx * 0.65 + (vx - v0) * sign * vMask + rockBump;
        const ny = -(dy * 0.65 + (vy - v0) * sign * vMask + rockBump);
        const len = Math.hypot(nx, ny, 1.0);
        return [nx / len * 0.5 + 0.5, ny / len * 0.5 + 0.5, 1.0 / len * 0.5 + 0.5];
    }, false);
}

function procCreateMagmaTexture(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 77, false);
        if (d < 0.20) {
            const heat = 1.0 - d / 0.20;
            return [0.92 + heat * 0.08, 0.24 + heat * 0.54, 0.02 + heat * 0.20];
        }
        const stone = procAshlarVeinStoneBase(x, y, 0.64, 0.03);
        if (d < 0.28) {
            const slag = (0.28 - d) / 0.08;
            return [stone[0] * (1 - slag * 0.5) + 0.22 * slag, stone[1] * (1 - slag * 0.6), stone[2] * (1 - slag * 0.6)];
        }
        return stone;
    }, true);
}

function procCreateMagmaEmission(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 77, false);
        if (d < 0.20) {
            const heat = 1.0 - d / 0.20;
            return [0.96, 0.30 + heat * 0.46, 0.04 + heat * 0.14];
        }
        return [0, 0, 0];
    });
}

function procCreateLavaTexture(w = 64, h = 64) {
    const size = w || 64;
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
            return [0.78 + t * 0.22, 0.11 + t * 0.37, 0.0];
        } else if (warp < 0.80) {
            const t = (warp - 0.60) / 0.20;
            return [1.0, 0.48 + t * 0.48, t * 0.69];
        } else {
            const t = Math.min(1.0, (warp - 0.80) / 0.20);
            return [1.0, 0.96 + t * 0.04, 0.69 + t * 0.31];
        }
    });
}

function procCreateLavaEmission(w = 64, h = 64) {
    const size = w || 64;
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
            return fissure > 0.82 ? [0.45, 0.08, 0.0] : [0.0, 0.0, 0.0];
        } else if (warp < 0.60) {
            const t = (warp - 0.42) / 0.18;
            return [0.85 + t * 0.15, 0.15 + t * 0.40, 0.0];
        } else {
            const t = Math.min(1.0, (warp - 0.60) / 0.40);
            return [1.0, 0.55 + t * 0.45, t * 0.75];
        }
    });
}

function procCreateQuartzTexture(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 44, true);
        if (d < 0.21) {
            const facet = (procSmoothNoise(x * 0.26, y * 0.26, 12) - 0.5) * 0.22;
            const core = (1.0 - d / 0.21) * 0.16;
            return [Math.min(1, 0.76 + core + facet), Math.min(1, 0.84 + core + facet), Math.min(1, 0.92 + core + facet)];
        }
        return procAshlarVeinStoneBase(x, y, 0.80, -0.01);
    }, true);
}

function procCreateQuartzEmission(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 44, true);
        if (d < 0.19) {
            const c = (1.0 - d / 0.19) * 0.36;
            return [c * 0.45, c * 0.82, c];
        }
        return [0, 0, 0];
    });
}

function procCreateGoldVeinTexture(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 83, false);
        const goldNugget = procSmoothNoise(x * 0.16, y * 0.16, 105);
        const inVein = d < 0.21;
        const isNugget = (inVein && goldNugget > 0.36) || (!inVein && d < 0.28 && goldNugget > 0.68);
        if (isNugget) {
            const luster = procSmoothNoise(x * 0.35, y * 0.35, 120) * 0.16;
            return [Math.min(1, 0.96 + luster * 0.04), Math.min(1, 0.80 + luster), Math.min(1, 0.16 + luster * 0.45)];
        }
        if (inVein) {
            const rim = procSmoothNoise(x * 0.12, y * 0.12, 91) * 0.10;
            return [0.52 + rim, 0.46 + rim, 0.34 + rim];
        }
        return procAshlarVeinStoneBase(x, y, 0.68, 0.02);
    }, true);
}

function procCreateGoldVeinEmission(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 83, false);
        const goldNugget = procSmoothNoise(x * 0.16, y * 0.16, 105);
        if ((d < 0.21 && goldNugget > 0.36) || (d >= 0.21 && d < 0.28 && goldNugget > 0.68)) {
            return [0.58, 0.44, 0.08];
        }
        return [0, 0, 0];
    });
}

function procCreateGemVeinTexture(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 44, true);
        const gemCluster = procSmoothNoise(x * 0.18, y * 0.18, 215);
        const inVein = d < 0.23;
        if (inVein && gemCluster > 0.52) {
            const gemType = Math.floor(procHash(Math.floor(x / 24), Math.floor(y / 24), 77) * 4);
            const facet = (procSmoothNoise(x * 0.4, y * 0.4, 301) - 0.5) * 0.24;
            if (gemType === 0) return [Math.max(0, 0.08 + facet * 0.5), Math.min(1, 0.92 + facet), Math.min(1, 0.32 + facet * 0.8)];
            if (gemType === 1) return [Math.min(1, 0.96 + facet), Math.max(0, 0.12 + facet * 0.5), Math.min(1, 0.24 + facet * 0.8)];
            if (gemType === 2) return [Math.max(0, 0.12 + facet * 0.5), Math.min(1, 0.45 + facet * 0.8), Math.min(1, 0.98 + facet)];
            return [Math.min(1, 0.88 + facet), Math.max(0, 0.35 + facet * 0.5), Math.min(1, 0.95 + facet)];
        }
        if (inVein) {
            const glint = procSmoothNoise(x * 0.22, y * 0.22, 12) * 0.12;
            return [0.74 + glint, 0.80 + glint, 0.88 + glint];
        }
        return procAshlarVeinStoneBase(x, y, 0.76, -0.01);
    }, true);
}

function procCreateGemVeinEmission(seedSize = 64) {
    return procCreateSeedTexture(seedSize, 512, (x, y) => {
        const d = procBranchingVeinDist(x, y, 44, true);
        const gemCluster = procSmoothNoise(x * 0.18, y * 0.18, 215);
        if (d < 0.23 && gemCluster > 0.52) {
            const gemType = Math.floor(procHash(Math.floor(x / 24), Math.floor(y / 24), 77) * 4);
            if (gemType === 0) return [0.04, 0.45, 0.15];
            if (gemType === 1) return [0.48, 0.06, 0.12];
            if (gemType === 2) return [0.06, 0.22, 0.50];
            return [0.42, 0.15, 0.48];
        }
        return [0, 0, 0];
    });
}

function procCreateGrassTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateGrassNormal(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateDirtTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const soilGrain = (procSmoothNoise(x * 0.12, y * 0.12, 71) - 0.5) * 0.08;
        const pebbleNoise = procSmoothNoise(x * 0.3, y * 0.3, 72);
        const pebble = pebbleNoise > 0.78 ? (pebbleNoise - 0.78) * 0.8 : 0;

        const r = 0.44 + soilGrain + pebble * 0.2;
        const g = 0.34 + soilGrain * 0.8 + pebble * 0.2;
        const b = 0.24 + soilGrain * 0.6 + pebble * 0.2;
        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    });
}

function procCreateWaterTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const n1 = procSmoothNoise(x * 0.05, y * 0.05, 81);
        const n2 = procSmoothNoise(x * 0.11 + n1 * 2.2, y * 0.11 - n1 * 2.2, 82);
        const n3 = procSmoothNoise(x * 0.24 - n2 * 1.5, y * 0.24 + n2 * 1.5, 83);
        const caustic = Math.pow(Math.max(0, 1.0 - Math.abs(n2 - 0.5) * 3.2), 2.2) * 0.22;
        const ripple = (n1 * 0.45 + n2 * 0.35 + n3 * 0.20 - 0.5) * 0.14;

        const r = 0.09 + ripple * 0.4 + caustic * 0.75;
        const g = 0.34 + ripple * 0.8 + caustic * 0.95;
        const b = 0.52 + ripple * 1.0 + caustic * 1.05;
        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    });
}

function procCreateDeepWaterTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const n1 = procSmoothNoise(x * 0.04, y * 0.04, 84);
        const n2 = procSmoothNoise(x * 0.09 + n1 * 2.0, y * 0.09 - n1 * 2.0, 85);
        const swell = (n1 * 0.6 + n2 * 0.4 - 0.5) * 0.12;
        const crest = Math.pow(Math.max(0, 1.0 - Math.abs(n2 - 0.5) * 3.4), 2.4) * 0.14;
        const r = 0.05 + swell * 0.3 + crest * 0.5;
        const g = 0.18 + swell * 0.6 + crest * 0.7;
        const b = 0.36 + swell * 0.9 + crest * 0.9;
        return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
    });
}

function procCreateWaterNormal(seedSize = 64) {
    const size = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const h = (u, v) => {
            const n1 = procSmoothNoise(u * 0.06, v * 0.06, 86);
            const n2 = procSmoothNoise(u * 0.14 + n1 * 1.8, v * 0.14 - n1 * 1.8, 87);
            return n1 * 0.6 + n2 * 0.4;
        };
        const h0 = h(x, y);
        const dx = (h(x + 1, y) - h0) * 3.2;
        const dy = (h(x, y + 1) - h0) * 3.2;
        const len = Math.sqrt(dx * dx + dy * dy + 1.0);
        return [
            Math.max(0, Math.min(1, (dx / len) * 0.5 + 0.5)),
            Math.max(0, Math.min(1, (-dy / len) * 0.5 + 0.5)),
            Math.max(0, Math.min(1, (1.0 / len) * 0.5 + 0.5))
        ];
    });
}

function procCreateTreeLeavesTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateTreeLeavesNormal(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateTreeBarkTexture(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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

function procCreateTreeBarkNormal(seedSize = 64) {
    const size = 512;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
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


function procCreateOrganicNormal(seedSize = 64) {
    const size = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const nx = procSmoothNoise(x * 0.12, y * 0.12, 101);
        const ny = procSmoothNoise(x * 0.12, (y + 1) * 0.12, 101);
        const dx = (procSmoothNoise((x + 1) * 0.12, y * 0.12, 101) - nx) * 1.8;
        const dy = (ny - nx) * 1.8;
        return [0.5 + dx, 0.5 + dy, 1.0];
    });
}

function procCreateScaleNormal(seedSize = 64) {
    const size = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const u = (x % 32) - 16;
        const v = (y % 32) - 16;
        const dist = Math.sqrt(u * u + v * v) / 16.0;
        const h = Math.max(0, 1.0 - dist);
        const dx = (u / 16.0) * h * 0.8;
        const dy = (v / 16.0) * h * 0.8;
        return [0.5 - dx, 0.5 - dy, 1.0];
    });
}

function procCreateChitinNormal(seedSize = 64) {
    const size = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const segment = Math.sin(y * 0.15) * 0.25;
        const fineNoise = (procSmoothNoise(x * 0.25, y * 0.25, 202) - 0.5) * 0.15;
        return [0.5 + fineNoise, 0.5 + segment + fineNoise, 1.0];
    });
}

function procCreateFurNormal(seedSize = 64) {
    const size = 256;
    return procCreateSeedTexture(seedSize, size, (x, y) => {
        const strand = Math.sin((x + y * 0.3) * 0.8) * 0.3;
        const noise = (procSmoothNoise(x * 0.3, y * 0.08, 303) - 0.5) * 0.2;
        return [0.5 + strand, 0.5 + noise, 1.0];
    });
}



    function attachProceduralTextures(Dungeon3DClass) {
        if (!Dungeon3DClass || !Dungeon3DClass.prototype) return;
        const Dungeon3DProto = Dungeon3DClass.prototype;

Dungeon3DProto.initTextures = function initTextures() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const aniso = Math.min(16, maxAniso || 1);
    this.contextualTextureCache = new Map();
    this._currentThemeId = null;

    // 1. Instant Procedural Textures (Exact Godot DungeonWorld Parity fallback)
    this.wallTex = procCreateStoneWallTexture();
    this.wallNormal = procCreateStoneWallNormal();
    this.floorTex = procCreateFloorTexture();
    this.floorNormal = procCreateFloorNormal();
    this.ceilingTex = procCreateCeilingTexture();
    this.doorTex = procCreateWoodDoorTexture();
    this.doorNormal = procCreateDoorNormalTexture();
    this.storeTex = procCreateStoreTexture();
    this.magmaTex = procCreateMagmaTexture();
    this.magmaEmission = procCreateMagmaEmission();
    this.magmaNormal = procCreateVeinNormal(77, false, false);
    this.quartzTex = procCreateQuartzTexture();
    this.quartzEmission = procCreateQuartzEmission();
    this.quartzNormal = procCreateVeinNormal(44, true, true);
    this.goldVeinTex = procCreateGoldVeinTexture();
    this.goldVeinEmission = procCreateGoldVeinEmission();
    this.goldVeinNormal = procCreateVeinNormal(83, false, false);
    this.gemVeinTex = procCreateGemVeinTexture();
    this.gemVeinEmission = procCreateGemVeinEmission();
    this.gemVeinNormal = procCreateVeinNormal(44, true, true);
    this.grassTex = procCreateGrassTexture();
    this.grassNormal = procCreateGrassNormal();
    this.dirtTex = procCreateDirtTexture();
    this.waterTex = procCreateWaterTexture();
    this.deepWaterTex = procCreateDeepWaterTexture();
    this.waterNormal = procCreateWaterNormal();
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

    for (const tex of [
        this.wallTex, this.wallNormal, this.floorTex, this.floorNormal, this.ceilingTex,
        this.doorTex, this.doorNormal, this.storeTex, this.magmaTex, this.magmaEmission, this.magmaNormal,
        this.quartzTex, this.quartzEmission, this.quartzNormal,
        this.goldVeinTex, this.goldVeinEmission, this.goldVeinNormal,
        this.gemVeinTex, this.gemVeinEmission, this.gemVeinNormal,
        this.grassTex, this.grassNormal, this.dirtTex, this.waterTex, this.deepWaterTex, this.waterNormal,
        this.treeLeavesTex, this.treeLeavesNormal, this.treeBarkTex, this.treeBarkNormal,
        this.permWallTex, this.permWallNormal, this.organicNormal, this.scaleNormal,
        this.chitinNormal, this.furNormal
    ]) {
        if (tex) tex.anisotropy = aniso;
    }

    // Procedural PMREM Metallic Environment Reflection Map for 3D Weapons, Armor, Shields & Water
    if (this.scene && this.renderer && typeof THREE.PMREMGenerator !== 'undefined') {
        try {
            const ew = 64, eh = 32;
            const envData = new Uint8Array(ew * eh * 4);
            for (let y = 0; y < eh; y++) {
                const v = y / (eh - 1);
                for (let x = 0; x < ew; x++) {
                    const u = x / ew;
                    const torchGlow = Math.exp(-Math.pow((v - 0.52) * 3.8, 2)) * (0.65 + 0.35 * Math.cos(u * Math.PI * 4.0));
                    const skyGlow = Math.max(0, 1.0 - v * 1.8);
                    const idx = (y * ew + x) * 4;
                    envData[idx]     = Math.min(255, Math.round((0.18 + skyGlow * 0.25 + torchGlow * 0.95) * 255));
                    envData[idx + 1] = Math.min(255, Math.round((0.20 + skyGlow * 0.32 + torchGlow * 0.68) * 255));
                    envData[idx + 2] = Math.min(255, Math.round((0.26 + skyGlow * 0.52 + torchGlow * 0.35) * 255));
                    envData[idx + 3] = 255;
                }
            }
            const eqTex = new THREE.DataTexture(envData, ew, eh, THREE.RGBAFormat);
            eqTex.mapping = THREE.EquirectangularReflectionMapping;
            if (typeof THREE.sRGBEncoding !== 'undefined') eqTex.encoding = THREE.sRGBEncoding;
            eqTex.needsUpdate = true;
            const pmremGen = new THREE.PMREMGenerator(this.renderer);
            pmremGen.compileEquirectangularShader();
            const envRT = pmremGen.fromEquirectangular(eqTex);
            this.scene.environment = envRT.texture;
            eqTex.dispose();
            pmremGen.dispose();
        } catch (_) {}
    }

    // Shared 1x1 neutral roughness placeholder so swapping PolyHaven ARM maps never toggles USE_ROUGHNESSMAP shader defines
    const neutralRough = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    neutralRough.needsUpdate = true;
    neutralRough._isNeutralPlaceholder = true;
    neutralRough._sharedTexture = true;
    this._neutralRoughnessTex = neutralRough;

    // Materials with Authentic PBR Settings matching Godot StandardMaterial3D
    this.wallMaterial = new THREE.MeshStandardMaterial({
        map: this.wallTex,
        normalMap: this.wallNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughness: 0.82,
        metalness: 0.02,
        vertexColors: true
    });

    this.floorMaterial = new THREE.MeshStandardMaterial({
        map: this.floorTex,
        normalMap: this.floorNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughness: 0.72,
        metalness: 0.04,
        side: THREE.DoubleSide,
        vertexColors: true
    });

    this.ceilingMaterial = new THREE.MeshStandardMaterial({
        map: this.ceilingTex,
        normalMap: this.wallNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide,
        vertexColors: true
    });

    this.doorMaterial = new THREE.MeshStandardMaterial({
        map: this.doorTex,
        normalMap: this.doorNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(0.65, 0.65),
        roughness: 0.75,
        metalness: 0.10,
        vertexColors: true
    });

    this.storeMaterial = new THREE.MeshStandardMaterial({
        map: this.storeTex,
        roughnessMap: neutralRough,
        roughness: 0.85,
        metalness: 0.02
    });

    // 8 Shop Entrance Doors — defer 512x512 heraldic plaque canvas generation until Town/shop rendering
    this.shopDoorMaterials = [];
    this._shopDoorsHydrated = false;
    for (let i = 0; i < 8; i++) {
        this.shopDoorMaterials.push(new THREE.MeshStandardMaterial({
            map: this.doorTex,
            normalMap: this.doorNormal,
            roughnessMap: neutralRough,
            normalScale: new THREE.Vector2(0.65, 0.65),
            roughness: 0.70,
            metalness: 0.15,
            vertexColors: true
        }));
    }

    // Magma Fissures (Incandescent emission in coursed ashlar stone)
    this.magmaMaterial = new THREE.MeshStandardMaterial({
        map: this.magmaTex,
        normalMap: this.magmaNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.45, 1.45),
        emissiveMap: this.magmaEmission,
        emissive: new THREE.Color(0xff4400),
        emissiveIntensity: 0.65,
        roughness: 0.72,
        metalness: 0.04,
        vertexColors: true
    });

    // Quartz Veins (Glinting crystal fissures in coursed ashlar stone)
    this.quartzMaterial = new THREE.MeshStandardMaterial({
        map: this.quartzTex,
        normalMap: this.quartzNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.45, 1.45),
        emissiveMap: this.quartzEmission,
        emissive: new THREE.Color(0x38bdf8),
        emissiveIntensity: 0.38,
        roughness: 0.48,
        metalness: 0.12,
        vertexColors: true
    });

    // Magma Vein with Gold Treasure (feat 19: MAGMA_K) - Rich metallic gold nuggets in coursed stone
    this.goldVeinMaterial = new THREE.MeshStandardMaterial({
        map: this.goldVeinTex,
        normalMap: this.goldVeinNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.45, 1.45),
        emissiveMap: this.goldVeinEmission,
        emissive: new THREE.Color(0xffaa22),
        emissiveIntensity: 0.52,
        roughness: 0.36,
        metalness: 0.82,
        vertexColors: true
    });

    // Quartz Vein with Gemstones (feat 20: QUARTZ_K) - Faceted sparkling emeralds, rubies, sapphires in coursed stone
    this.gemVeinMaterial = new THREE.MeshStandardMaterial({
        map: this.gemVeinTex,
        normalMap: this.gemVeinNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.45, 1.45),
        emissiveMap: this.gemVeinEmission,
        emissive: new THREE.Color(0x33eebb),
        emissiveIntensity: 0.55,
        roughness: 0.28,
        metalness: 0.18,
        vertexColors: true
    });

    [this.magmaMaterial, this.quartzMaterial, this.goldVeinMaterial, this.gemVeinMaterial].forEach((vMat, vIdx) => {
        vMat.customProgramCacheKey = () => `vein_fow_emissive_${vIdx}`;
        vMat.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= clamp(dot(vColor.rgb, vec3(0.3333)) * 1.65, 0.0, 1.0);\n#endif'
            );
        };
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
        normalMap: this.waterNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.14,
        metalness: 0.22,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        vertexColors: true
    });

    // Deep Oceanic Water (feat 29: DEEP_WATER)
    this.deepWaterMaterial = new THREE.MeshStandardMaterial({
        map: this.deepWaterTex,
        normalMap: this.waterNormal,
        normalScale: new THREE.Vector2(0.95, 0.95),
        roughness: 0.16,
        metalness: 0.25,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.94,
        vertexColors: true
    });

    this.mountainMaterial = new THREE.MeshStandardMaterial({ map: this.wallTex, normalMap: this.wallNormal, roughness: 0.92, metalness: 0.04, vertexColors: true });
    this.rubbleMaterial = new THREE.MeshStandardMaterial({ map: this.wallTex, normalMap: this.wallNormal, roughness: 0.88, metalness: 0.04, vertexColors: true });
    this.swampMaterial = new THREE.MeshStandardMaterial({ map: this.dirtTex, roughness: 0.40, metalness: 0.08, side: THREE.DoubleSide, vertexColors: true });
    this.treeTrunkMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, map: this.treeBarkTex, normalMap: this.treeBarkNormal, normalScale: new THREE.Vector2(1.40, 1.40),
        roughness: 0.90, metalness: 0.02, side: THREE.DoubleSide, vertexColors: true
    });
    this.treeTrunkMaterial = this.treeTrunkMat;
    this.treeLeavesMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, map: this.treeLeavesTex, normalMap: this.treeLeavesNormal, normalScale: new THREE.Vector2(1.35, 1.35),
        roughness: 0.68, metalness: 0.02, alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true
    });
    this.treeMaterial = this.treeLeavesMat;

    // Incandescent Domain-Warped Molten Lava (feat 23) & Cooled Basalt (fast micro-seeds)
    _inMicroSeed = true;
    try {
        this.lavaTex = procCreateLavaTexture(16, 16);
        this.lavaEmission = procCreateLavaEmission(16, 16);
    } finally {
        _inMicroSeed = false;
    }
    this.procCreateLavaTexture = procCreateLavaTexture;
    this.procCreateLavaEmission = procCreateLavaEmission;
    for (const lt of [this.lavaTex, this.lavaEmission]) {
        if (lt) { lt.wrapS = THREE.RepeatWrapping; lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(2, 2); }
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
        roughnessMap: neutralRough,
        roughness: 0.82,
        metalness: 0.04,
        vertexColors: true
    });

    // Cyclopean Permanent Bedrock / Fortress Ramparts (feat 22) - default white so vertex colors illuminate properly
    this.permWallMaterial = new THREE.MeshStandardMaterial({
        map: this.permWallTex,
        normalMap: this.permWallNormal,
        roughnessMap: neutralRough,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughness: 0.90,
        metalness: 0.05,
        vertexColors: true
    });

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

    // # ROOT-CAUSE: Register 13 Poly Haven photogrammetry sets (+ disp.jpg heightmaps) and 2 architectural trim sets on-demand via ensurePbrSetReady(id); retire stylized cartoon/non-tiling T_* PNGs (-66 MB VRAM).
    // Legacy contract refs: loadPBR('/assets/textures/T_Brick_BaseColor.png', this.wallMaterial, 'map', true, 2, 3)
    // loadPBR('/assets/textures/T_UnevenBrick_BaseColor.png', this.floorMaterial, 'map', true, 2, 2)
    this.polyHavenSets = new Map();
    this.polyhavenSets = this.polyHavenSets;
    this._pbrSetSpecs = new Map();
    const loader = new THREE.TextureLoader();

    const applyPbrSampling = (tex, isColor) => {
        if (!tex) return;
        const tier = (this.renderBudget && this.renderBudget.tier) || 'balanced';
        const maxCap = (this.renderer && this.renderer.capabilities && typeof this.renderer.capabilities.getMaxAnisotropy === 'function')
            ? (this.renderer.capabilities.getMaxAnisotropy() || 8)
            : 8;
        tex.anisotropy = Math.min(maxCap, (tier === 'low' || tier === 'phone') ? 2 : 8);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        if (isColor) {
            if (typeof THREE.SRGBColorSpace !== 'undefined') tex.colorSpace = THREE.SRGBColorSpace;
            else if (typeof THREE.sRGBEncoding !== 'undefined') tex.encoding = THREE.sRGBEncoding;
        } else {
            if (typeof THREE.NoColorSpace !== 'undefined') tex.colorSpace = THREE.NoColorSpace;
            else if (typeof THREE.LinearEncoding !== 'undefined') tex.encoding = THREE.LinearEncoding;
        }
    };
    this.applyPbrSampling = applyPbrSampling;

    this.scheduleEnvironmentTextureApply = () => {
        if (this._envTexApplyRaf) return;
        const runApply = () => {
            this._envTexApplyRaf = null;
            this._currentThemeId = null;
            this._currentTexturesAreOutdoors = null;
            const isOut = (this.lastDepth === 0 || this.lastDepth === null || this.lastDepth === undefined);
            if (typeof this.applyEnvironmentTextures === 'function') {
                this.applyEnvironmentTextures(isOut, this.currentBiome, this.realm || 'angband', this.lastDepth || 0, this.levelSeed || 0);
            }
        };
        if (typeof requestAnimationFrame === 'function') this._envTexApplyRaf = requestAnimationFrame(runApply);
        else runApply();
    };

    const loadTexPromise = (url, onLoad) => {
        const resolvedUrl = (typeof window !== 'undefined' && typeof window.__assetUrl === 'function')
            ? window.__assetUrl(url)
            : url;
        return new Promise((resolve) => {
            loader.load(resolvedUrl, (tex) => {
                try { if (onLoad) onLoad(tex); } catch (_) {}
                resolve(tex);
            }, undefined, () => resolve(null));
        });
    };

    this.ensurePbrSetReady = (id) => {
        if (!id) return Promise.resolve(null);
        const entry = this.polyHavenSets.get(id);
        if (!entry) return Promise.resolve(null);
        if (entry._loaded) return Promise.resolve(entry);
        if (entry._promise) return entry._promise;
        const spec = this._pbrSetSpecs.get(id);
        if (!spec) return Promise.resolve(entry);

        const cfgTex = (tex, isColor) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(spec.repX, spec.repY);
            tex._sharedTexture = true;
            applyPbrSampling(tex, isColor);
        };
        const notifyCallbacks = () => {
            if (Array.isArray(spec.callbacks)) {
                for (const cb of spec.callbacks) {
                    if (typeof cb === 'function') {
                        try { cb(entry); } catch (_) {}
                    }
                }
            }
            this.scheduleEnvironmentTextureApply();
        };

        if (spec.kind === 'polyhaven') {
            const base = `/assets/polyhaven/textures/${id}`;
            entry._promise = Promise.all([
                loadTexPromise(`${base}/diff.jpg`, (tex) => { cfgTex(tex, true); entry.diff = tex; notifyCallbacks(); }),
                loadTexPromise(`${base}/nor_gl.jpg`, (tex) => { cfgTex(tex, false); entry.nor = tex; notifyCallbacks(); }),
                loadTexPromise(`${base}/arm.jpg`, (tex) => { cfgTex(tex, false); entry.arm = tex; notifyCallbacks(); }),
                loadTexPromise(`${base}/disp.jpg`, (tex) => { cfgTex(tex, false); entry.disp = tex; notifyCallbacks(); })
            ]).then(() => {
                entry._loaded = true;
                notifyCallbacks();
                return entry;
            });
        } else {
            const prefix = spec.prefix;
            const base = `/assets/textures/${prefix}`;
            const roughUrl = prefix === 'T_Plaster' ? '/assets/textures/T_Plaster_ORM.png' : `${base}_Roughness.png`;
            const tasks = [
                loadTexPromise(`${base}_BaseColor.png`, (tex) => { cfgTex(tex, true); entry.diff = tex; notifyCallbacks(); })
            ];
            if (prefix !== 'T_WindowGradient') {
                tasks.push(
                    loadTexPromise(`${base}_Normal.png`, (tex) => { cfgTex(tex, false); entry.nor = tex; notifyCallbacks(); }),
                    loadTexPromise(roughUrl, (tex) => { cfgTex(tex, false); entry.arm = tex; notifyCallbacks(); })
                );
            }
            entry._promise = Promise.all(tasks).then(() => {
                entry._loaded = true;
                notifyCallbacks();
                return entry;
            });
        }
        return entry._promise;
    };

    const registerPbrSpec = (kind, id, prefix, repX, repY, onReady) => {
        if (this.polyHavenSets.has(id)) {
            const existing = this.polyHavenSets.get(id);
            const spec = this._pbrSetSpecs.get(id);
            if (onReady && spec && !spec.callbacks.includes(onReady)) spec.callbacks.push(onReady);
            if (onReady && existing.diff) onReady(existing);
            return existing;
        }
        const entry = { id, diff: null, nor: null, arm: null, disp: null, _loaded: false, _promise: null };
        this.polyHavenSets.set(id, entry);
        this._pbrSetSpecs.set(id, { kind, id, prefix, repX, repY, callbacks: onReady ? [onReady] : [] });
        return entry;
    };
    this.loadPolyHavenSet = (id, repX = 1, repY = 1, onReady = null) => registerPbrSpec('polyhaven', id, '', repX, repY, onReady);
    this.loadLocalPbrSet = (id, prefix, repX = 2, repY = 2, onReady = null) => registerPbrSpec('local', id, prefix, repX, repY, onReady);

    const applyMatMaps = (mat, e, withRough = true) => {
        if (!mat || !e) return;
        const hadMap = Boolean(mat.map);
        const hadNor = Boolean(mat.normalMap);
        const hadRough = Boolean(mat.roughnessMap);
        if (e.diff) mat.map = e.diff;
        if (e.nor) mat.normalMap = e.nor;
        if (withRough && e.arm) mat.roughnessMap = e.arm;
        if (Boolean(mat.map) !== hadMap || Boolean(mat.normalMap) !== hadNor || Boolean(mat.roughnessMap) !== hadRough) {
            mat.needsUpdate = true;
        }
    };

    // 13 Poly Haven 2K Photogrammetry PBR Texture Sets
    this.loadPolyHavenSet('castle_brick_broken_06', 2, 2, (e) => {
        this.townWallTex = e.diff || this.townWallTex;
        this.townWallNormal = e.nor || this.townWallNormal;
        this.townWallRoughness = e.arm || this.townWallRoughness;
        applyMatMaps(this.townRoofMaterial, e, true);
    });
    this.loadPolyHavenSet('cobblestone_floor_08', 1, 1, (e) => {
        this.townFloorTex = e.diff || this.townFloorTex;
        this.townFloorNormal = e.nor || this.townFloorNormal;
        this.townFloorRoughness = e.arm || this.townFloorRoughness;
    });
    this.loadPolyHavenSet('medieval_blocks_05', 2, 3, (e) => {
        this.townPermWallTex = e.diff || this.townPermWallTex;
        this.townPermWallNormal = e.nor || this.townPermWallNormal;
        this.townPermWallRoughness = e.arm || this.townPermWallRoughness;
    });
    this.loadPolyHavenSet('bark_willow_02', 1, 1, (e) => {
        applyMatMaps(this.doorMaterial, e, true);
        if (this.treeTrunkMaterial && !this._hasPolyHavenTreeTex) applyMatMaps(this.treeTrunkMaterial, e, false);
    });
    this.loadPolyHavenSet('plastered_stone_wall', 1, 1, (e) => applyMatMaps(this.storeMaterial, e, true));
    this.loadPolyHavenSet('rock_boulder_cracked', 1, 1, (e) => {
        if (e.nor) {
            for (const m of [this.lavaMaterial, this.lavaCooledMaterial]) {
                if (m) {
                    const hadNor = Boolean(m.normalMap);
                    m.normalMap = e.nor;
                    if (!hadNor) m.needsUpdate = true;
                }
            }
        }
        if (e.diff && e.arm) {
            const veinSpecs = [
                [this.magmaMaterial, this.magmaEmission, 0xff4400, 0.65],
                [this.goldVeinMaterial, this.goldVeinEmission, 0xffaa22, 0.52]
            ];
            for (const [vm, emMap, emHex, emInt] of veinSpecs) {
                if (vm) {
                    applyMatMaps(vm, e, true);
                    if (emMap) vm.emissiveMap = emMap;
                    vm.emissive.setHex(emHex);
                    vm.emissiveIntensity = emInt;
                }
            }
        }
    });
    this.loadPolyHavenSet('monastery_stone_floor', 2, 2);
    this.loadPolyHavenSet('rock_wall_10', 2, 3);
    this.loadPolyHavenSet('rock_embedded_floor', 2, 2);
    this.loadPolyHavenSet('cliff_side', 2, 3, (e) => {
        this.townMountainDiff = e.diff || this.townMountainDiff;
        this.townMountainNormal = e.nor || this.townMountainNormal;
        this.townMountainRoughness = e.arm || this.townMountainRoughness;
        if (this.mountainMaterial && !this._hasPolyHavenMountainTex) applyMatMaps(this.mountainMaterial, e, false);
        if (this.chasmSideMaterial) applyMatMaps(this.chasmSideMaterial, { diff: this.townMountainDiff, nor: this.townMountainNormal, arm: this.townMountainRoughness }, true);
        if (e.diff && e.arm) {
            const veinSpecs = [
                [this.quartzMaterial, this.quartzEmission, 0x38bdf8, 0.38],
                [this.gemVeinMaterial, this.gemVeinEmission, 0x33eebb, 0.55]
            ];
            for (const [vm, emMap, emHex, emInt] of veinSpecs) {
                if (vm) {
                    applyMatMaps(vm, e, true);
                    if (emMap) vm.emissiveMap = emMap;
                    vm.emissive.setHex(emHex);
                    vm.emissiveIntensity = emInt;
                }
            }
        }
    });
    this.loadPolyHavenSet('japanese_stone_wall', 2, 3, (e) => applyMatMaps(this.shopStoneMaterial, e, true));
    this.loadPolyHavenSet('aerial_grass_rock', 2, 2, (e) => applyMatMaps(this.grassMaterial, e, false));
    this.loadPolyHavenSet('brown_mud_rocks_01', 2, 2, (e) => {
        applyMatMaps(this.dirtMaterial, e, false);
        applyMatMaps(this.swampMaterial, e, false);
    });

    // Architectural Shikkui Plaster & Timber Trim Sets (cartoon/non-tiling T_Brick/T_UnevenBrick/T_RockTrim/T_RoundTiles/T_RedBrick retired)
    this.loadLocalPbrSet('local_plaster', 'T_Plaster', 2, 2);
    this.loadLocalPbrSet('local_wood_trim', 'T_WoodTrim', 2, 2, (e) => {
        applyMatMaps(this.shopFrameMaterial, e, true);
        applyMatMaps(this.townTimberMaterial, e, true);
    });

    this.ensureSharedDetailTexturesReady = () => {
        if (this._sharedDetailTexPromise) return this._sharedDetailTexPromise;
        this._sharedDetailTexPromise = Promise.all([
            loadTexPromise('/assets/textures/T_BrushedNoise.png', (tex) => {
                tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(4, 4); tex._sharedTexture = true; applyPbrSampling(tex, false);
                this.brushedNoiseTex = tex;
            }),
            loadTexPromise('/assets/textures/T_Noise_Terrain.png', (tex) => {
                tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(3, 3); tex._sharedTexture = true; applyPbrSampling(tex, false);
                this.terrainNoiseTex = tex;
            })
        ]).then(() => {
            this._sharedDetailTexLoaded = true;
            return true;
        });
        return this._sharedDetailTexPromise;
    };
};

Dungeon3DProto.ensureShopDoorMaterials = function ensureShopDoorMaterials() {
    if (this._shopDoorsHydrated || !Array.isArray(this.shopDoorMaterials)) return this.shopDoorMaterials;
    this._shopDoorsHydrated = true;
    for (let i = 0; i < this.shopDoorMaterials.length; i++) {
        const shopNum = i + 1;
        const mat = this.shopDoorMaterials[i];
        if (mat) {
            const shopTex = procCreateShopDoorTexture(shopNum, procStoreColor(shopNum));
            if (typeof this.applyPbrSampling === 'function') this.applyPbrSampling(shopTex, true);
            mat.map = shopTex;
        }
    }
    return this.shopDoorMaterials;
};

function resolveContextualPbrIds(realm, depth, outdoors, branch = '', ryodBiome = '', opts = null) {
    const tid = String((opts && opts.themeId) || '').toLowerCase();
    const tMeta = THEME_ID_META[tid] || null;
    const explicitRealm = String(realm || '').toLowerCase();
    const curRealm = (explicitRealm === 'ryod' || (tMeta && tMeta[0] === 'ryod'))
        ? 'ryod'
        : (tMeta
            ? (tMeta[0] === 'angband' && explicitRealm === 'frogcomposband' ? 'frogcomposband' : tMeta[0])
            : (explicitRealm || 'angband'));
    const curDepth = typeof depth === 'number' && !Number.isNaN(depth)
        ? depth
        : (tMeta ? tMeta[1] : (outdoors ? 0 : 1));
    const branchName = String(branch || '').toLowerCase();
    const rawBiome = String(ryodBiome || '').toLowerCase();
    const isOut = Boolean(outdoors) || curDepth <= 0;
    const hasShops = Boolean(isOut || (opts && opts.hasShops));
    const currentBiomeId = String((opts && opts.currentBiomeId) || '').toLowerCase();
    const ph = (opts && opts.polyHavenSets) || null;

    let wallPhId = 'japanese_stone_wall';
    let floorPhId = 'monastery_stone_floor';
    let ceilPhId = 'rock_wall_10';
    let permPhId = 'rock_wall_10';

    if (isOut) {
        const isEastTown = (curRealm === 'hengband' || tid === 'hengband_town' || (curRealm === 'ryod' && normalizeRyodBiomeId(rawBiome) === 'shadow_keep'));
        const isWild = tid.includes('wild') || currentBiomeId === 'wilderness' || currentBiomeId === 'grassland';
        wallPhId = isEastTown ? 'local_plaster' : 'plastered_stone_wall';
        floorPhId = isWild ? 'aerial_grass_rock' : 'cobblestone_floor_08';
        permPhId = isEastTown ? 'japanese_stone_wall' : 'castle_brick_broken_06';
        ceilPhId = 'rock_wall_10';
    } else if (curRealm === 'ryod' || tid.startsWith('ryod_')) {
        const rb = normalizeRyodBiomeId(rawBiome || tid.replace(/^ryod_/, ''));
        const RYOD_SETS = {
            obsidian: ['japanese_stone_wall', 'monastery_stone_floor', 'rock_boulder_cracked', 'japanese_stone_wall'],
            volcanic_forge: ['rock_boulder_cracked', 'rock_embedded_floor', 'rock_boulder_cracked', 'japanese_stone_wall'],
            bioluminescent: ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side'],
            catacombs: ['castle_brick_broken_06', 'monastery_stone_floor', 'plastered_stone_wall', 'castle_brick_broken_06'],
            shadow_keep: ['japanese_stone_wall', 'monastery_stone_floor', 'japanese_stone_wall', 'japanese_stone_wall'],
            chaos_rift: ['rock_boulder_cracked', 'rock_embedded_floor', 'cliff_side', 'rock_boulder_cracked'],
            frozen_wastes: ['cliff_side', 'rock_embedded_floor', 'rock_wall_10', 'cliff_side'],
            gilded_treasury: ['plastered_stone_wall', 'monastery_stone_floor', 'plastered_stone_wall', 'japanese_stone_wall']
        };
        const chosen = rb === 'iron_crown_throne'
            ? (curDepth <= 4 ? ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side']
                : (curDepth <= 8 ? ['rock_wall_10', 'monastery_stone_floor', 'rock_wall_10', 'rock_wall_10']
                    : ['japanese_stone_wall', 'monastery_stone_floor', 'rock_boulder_cracked', 'japanese_stone_wall']))
            : (RYOD_SETS[rb] || RYOD_SETS.obsidian);
        [wallPhId, floorPhId, ceilPhId, permPhId] = chosen;
        const poolBiomes = typeof window !== 'undefined' && window.RealmContentPool && Array.isArray(window.RealmContentPool.BIOMES) ? window.RealmContentPool.BIOMES : null;
        const bSpec = poolBiomes ? poolBiomes.find((x) => x && (x.id === rb || normalizeRyodBiomeId(x.id) === rb)) : null;
        const isValidPh = (k) => !!(k && k !== 'local_plaster' && k !== 'local_wood_trim' && (!ph || ph.has(k)));
        if (bSpec) {
            const bw = bSpec.wallPhId || bSpec.wallTex;
            const bf = bSpec.floorPhId || bSpec.floorTex;
            const bc = bSpec.ceilPhId || bSpec.ceilTex;
            const bp = bSpec.permPhId || bSpec.permTex;
            if (isValidPh(bw)) wallPhId = bw;
            if (isValidPh(bf)) floorPhId = bf;
            if (isValidPh(bc)) ceilPhId = bc;
            if (isValidPh(bp)) permPhId = bp;
        }
    } else if (curRealm === 'silq') {
        if (curDepth <= 5 || tid === 'silq_slag') [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side'];
        else if (curDepth <= 15 || tid === 'silq_armouries' || tid === 'silq_torment') [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_wall_10', 'monastery_stone_floor', 'rock_wall_10', 'rock_wall_10'];
        else [wallPhId, floorPhId, ceilPhId, permPhId] = ['japanese_stone_wall', 'monastery_stone_floor', 'rock_boulder_cracked', 'japanese_stone_wall'];
    } else if (curRealm === 'hengband') {
        if (curDepth <= 12 || tid === 'hengband_dungeon') [wallPhId, floorPhId, ceilPhId, permPhId] = ['japanese_stone_wall', 'monastery_stone_floor', 'japanese_stone_wall', 'japanese_stone_wall'];
        else if (curDepth <= 35 || tid === 'hengband_cavern') [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side'];
        else [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_boulder_cracked', 'monastery_stone_floor', 'rock_boulder_cracked', 'rock_boulder_cracked'];
    } else if (curRealm === 'nethack') {
        if (branchName.includes('mine') || tid.includes('mine')) [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'brown_mud_rocks_01', 'cliff_side', 'cliff_side'];
        else if (branchName.includes('sokoban') || tid.includes('sokoban')) [wallPhId, floorPhId, ceilPhId, permPhId] = ['japanese_stone_wall', 'monastery_stone_floor', 'plastered_stone_wall', 'japanese_stone_wall'];
        else if (curDepth >= 51 || branchName.includes('astral') || tid.includes('astral')) [wallPhId, floorPhId, ceilPhId, permPhId] = ['plastered_stone_wall', 'monastery_stone_floor', 'plastered_stone_wall', 'plastered_stone_wall'];
        else if (curDepth >= 21 || branchName.includes('gehennom') || tid.includes('gehennom')) [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_boulder_cracked', 'rock_embedded_floor', 'rock_boulder_cracked', 'rock_boulder_cracked'];
        else [wallPhId, floorPhId, ceilPhId, permPhId] = ['castle_brick_broken_06', 'monastery_stone_floor', 'plastered_stone_wall', 'castle_brick_broken_06'];
    } else if (curRealm === 'dcss') {
        if (branchName.includes('temple') || tid === 'dcss_temple' || curDepth === 4) [wallPhId, floorPhId, ceilPhId, permPhId] = ['plastered_stone_wall', 'monastery_stone_floor', 'plastered_stone_wall', 'plastered_stone_wall'];
        else if (branchName.includes('lair') || tid === 'dcss_lair' || (curDepth >= 5 && curDepth <= 7)) [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'aerial_grass_rock', 'cliff_side', 'cliff_side'];
        else if (curDepth >= 8 || branchName.includes('vault') || branchName.includes('zot') || tid === 'dcss_vaults' || tid === 'dcss_zot') [wallPhId, floorPhId, ceilPhId, permPhId] = ['japanese_stone_wall', 'monastery_stone_floor', 'rock_wall_10', 'japanese_stone_wall'];
        else [wallPhId, floorPhId, ceilPhId, permPhId] = ['castle_brick_broken_06', 'monastery_stone_floor', 'rock_wall_10', 'castle_brick_broken_06'];
    } else if (curRealm === 'brogue') {
        if (curDepth <= 10 || tid === 'brogue_cavern') [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side'];
        else [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_boulder_cracked', 'rock_embedded_floor', 'rock_boulder_cracked', 'rock_boulder_cracked'];
    } else if (curRealm === 'rogue') {
        [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_wall_10', 'monastery_stone_floor', 'rock_wall_10', 'rock_wall_10'];
    } else {
        if (curDepth <= 4 || tid === 'angband_crypts') [wallPhId, floorPhId, ceilPhId, permPhId] = ['japanese_stone_wall', 'monastery_stone_floor', 'rock_wall_10', 'rock_wall_10'];
        else if (curDepth <= 8 || tid === 'angband_flooded') [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_wall_10', 'monastery_stone_floor', 'rock_wall_10', 'rock_wall_10'];
        else if (curDepth <= 12 || tid === 'angband_sepulchre') [wallPhId, floorPhId, ceilPhId, permPhId] = ['plastered_stone_wall', 'monastery_stone_floor', 'plastered_stone_wall', 'rock_wall_10'];
        else if (curDepth <= 16 || tid === 'angband_catacombs') [wallPhId, floorPhId, ceilPhId, permPhId] = ['castle_brick_broken_06', 'rock_embedded_floor', 'rock_wall_10', 'castle_brick_broken_06'];
        else if (curDepth <= 20 || tid === 'angband_chasm') [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side'];
        else if (curDepth <= 35 || tid === 'angband_crystal') [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_wall_10', 'rock_embedded_floor', 'cliff_side', 'cliff_side'];
        else if (curDepth <= 60 || tid === 'angband_nether' || tid === 'fcb_logrus') [wallPhId, floorPhId, ceilPhId, permPhId] = ['cliff_side', 'rock_embedded_floor', 'cliff_side', 'cliff_side'];
        else if (curDepth <= 85 || tid === 'angband_magma') [wallPhId, floorPhId, ceilPhId, permPhId] = ['rock_boulder_cracked', 'rock_embedded_floor', 'rock_boulder_cracked', 'rock_boulder_cracked'];
        else [wallPhId, floorPhId, ceilPhId, permPhId] = ['japanese_stone_wall', 'monastery_stone_floor', 'rock_boulder_cracked', 'japanese_stone_wall'];
    }

    const tier1Set = new Set([wallPhId, floorPhId, permPhId, ceilPhId]);
    const fullSet = new Set(tier1Set);
    fullSet.add('bark_willow_02');
    const extraIds = isOut
        ? ['japanese_stone_wall', 'castle_brick_broken_06', 'medieval_blocks_05', 'cliff_side', 'brown_mud_rocks_01', 'local_wood_trim']
        : (hasShops ? ['cliff_side', 'rock_boulder_cracked', 'brown_mud_rocks_01', 'local_wood_trim'] : ['cliff_side', 'rock_boulder_cracked', 'brown_mud_rocks_01']);
    for (const eid of extraIds) fullSet.add(eid);

    const tier1Ids = Array.from(tier1Set);
    const outIds = (opts && opts.tier1Only) ? tier1Ids.slice() : Array.from(fullSet);
    return Object.assign(outIds, { wallPhId, floorPhId, ceilPhId, permPhId, tier1Ids, ids: outIds });
}

Dungeon3DProto.resolveContextualPbrIds = function (realm, depth, outdoors, branch = '', ryodBiome = '', opts = null) {
    const mergedOpts = Object.assign({ polyHavenSets: this.polyHavenSets || this.polyhavenSets || null, hasShops: Boolean(outdoors || depth === 0 || this._levelHasShops), currentBiomeId: (this.currentBiome && this.currentBiome.id) || '' }, opts || {});
    return resolveContextualPbrIds(realm, depth, outdoors, branch, ryodBiome, mergedOpts);
};
root.resolveContextualPbrIds = resolveContextualPbrIds;
if (root.Dungeon3DProcTextures) root.Dungeon3DProcTextures.resolveContextualPbrIds = resolveContextualPbrIds;

Dungeon3DProto.getContextualTextureSet = function getContextualTextureSet(theme, outdoors) {
    if (!this.contextualTextureCache) this.contextualTextureCache = new Map();
    const ph = this.polyHavenSets || this.polyhavenSets || new Map();
    const tid = String((theme && theme.id) || '').toLowerCase();
    const tMeta = THEME_ID_META[tid] || null;
    const explicitRealm = String(this.realm || (this.lastFrame && this.lastFrame.realm) || (typeof window !== 'undefined' && window.__activeRealm) || '').toLowerCase();
    const curRealm = (explicitRealm === 'ryod' || (tMeta && tMeta[0] === 'ryod')) ? 'ryod'
        : (tMeta ? (tMeta[0] === 'angband' && explicitRealm === 'frogcomposband' ? 'frogcomposband' : tMeta[0]) : (explicitRealm || 'angband'));
    const explicitDepth = typeof this.lastDepth === 'number' ? this.lastDepth : ((this.lastFrame && typeof this.lastFrame.depth === 'number') ? this.lastFrame.depth : null);
    const curDepth = (tMeta && curRealm !== 'ryod') ? tMeta[1] : (explicitDepth !== null ? explicitDepth : (tMeta ? tMeta[1] : (outdoors ? 0 : 1)));
    const branchName = String((this.lastFrame && (this.lastFrame.branch || this.lastFrame.branch_name || (this.lastFrame.player && (this.lastFrame.player.branch || this.lastFrame.player.branch_name)))) || this.currentBranch || (typeof window !== 'undefined' && window.__activeBranch) || '').toLowerCase();
    const rawBiome = (this.lastFrame && (this.lastFrame.biomeTheme || (this.lastFrame.map && this.lastFrame.map.biomeTheme)))
        || (theme && theme.ryodBiome)
        || (typeof window !== 'undefined' && window.__activeRyodBlueprint && window.__activeRyodBlueprint.biome)
        || (this.currentBiome && (this.currentBiome.id || (typeof this.currentBiome === 'string' ? this.currentBiome : ''))) || '';
    const geoProfile = resolveGeologicalShaderProfile(curRealm, curDepth, theme, !!outdoors, curRealm === 'ryod' ? rawBiome : (branchName || rawBiome));

    const resolved = resolveContextualPbrIds(curRealm, curDepth, !!outdoors, branchName, rawBiome, {
        themeId: tid, hasShops: Boolean(outdoors || curDepth === 0 || this._levelHasShops), polyHavenSets: ph, currentBiomeId: (this.currentBiome && this.currentBiome.id) || ''
    });
    const { wallPhId, floorPhId, ceilPhId, permPhId } = resolved;
    if (typeof this.ensurePbrSetReady === 'function') {
        for (const id of resolved) this.ensurePbrSetReady(id);
    }

    const wSet = ph.get(wallPhId), fSet = ph.get(floorPhId), pSet = ph.get(permPhId), cSet = ph.get(ceilPhId);
    const boulderSet = ph.get('rock_boulder_cracked'), cliffSet = ph.get('cliff_side');
    const fallbackRough = this._neutralRoughnessTex || null;

    if (wSet && wSet.diff && fSet && fSet.diff) {
        return {
            wallTex: wSet.diff, wallNormal: wSet.nor || this.wallNormal, wallRoughness: wSet.arm || fallbackRough, wallDisp: (wSet && wSet.disp) || null,
            floorTex: fSet.diff, floorNormal: fSet.nor || this.floorNormal, floorRoughness: fSet.arm || fallbackRough, floorDisp: (fSet && fSet.disp) || null,
            permWallTex: (pSet && pSet.diff) ? pSet.diff : (this.townPermWallTex || this.permWallTex),
            permWallNormal: (pSet && pSet.nor) ? pSet.nor : (this.townPermWallNormal || this.permWallNormal),
            permWallRoughness: (pSet && pSet.arm) ? pSet.arm : (this.townPermWallRoughness || fallbackRough), permWallDisp: (pSet && pSet.disp) || null,
            ceilingTex: (cSet && cSet.diff) ? cSet.diff : this.ceilingTex, ceilingNormal: (cSet && cSet.nor) ? cSet.nor : this.wallNormal,
            ceilingRoughness: (cSet && cSet.arm) ? cSet.arm : fallbackRough, ceilingDisp: (cSet && cSet.disp) || null,
            magmaDisp: (boulderSet && boulderSet.disp) || null, quartzDisp: (cliffSet && cliffSet.disp) || null, geoProfile
        };
    }

    const safeTheme = theme || CONTEXTUAL_THEMES[outdoors ? 'angband_town' : 'angband_crypts'];
    const cacheKey = safeTheme.id || 'angband_town';
    let baseSet = this.contextualTextureCache.get(cacheKey);
    if (!baseSet) {
        const texSz = 64;
        const wallTex = procCreateContextualWallTexture(safeTheme, texSz), wallNormal = procCreateContextualWallNormal(safeTheme, texSz), wallRoughness = procCreateContextualWallRoughness(safeTheme, texSz);
        const floorTex = procCreateContextualFloorTexture(safeTheme, texSz), floorNormal = procCreateContextualFloorNormal(safeTheme, texSz), floorRoughness = procCreateContextualFloorRoughness(safeTheme, texSz);
        const permWallTex = procCreateContextualPermWallTexture(safeTheme, texSz), permWallNormal = procCreateContextualPermWallNormal(safeTheme, texSz);
        const ceilingTex = procCreateContextualCeilingTexture(safeTheme, texSz), ceilingNormal = procCreateContextualCeilingNormal(safeTheme, texSz);
        if (typeof this.applyPbrSampling === 'function') {
            for (const ct of [wallTex, floorTex, permWallTex, ceilingTex]) this.applyPbrSampling(ct, true);
            for (const nt of [wallNormal, wallRoughness, floorNormal, floorRoughness, permWallNormal, ceilingNormal]) this.applyPbrSampling(nt, false);
        }
        baseSet = {
            wallTex, wallNormal, wallRoughness, floorTex, floorNormal, floorRoughness,
            permWallTex, permWallNormal, permWallRoughness: fallbackRough, ceilingTex, ceilingNormal, ceilingRoughness: fallbackRough
        };
        this.contextualTextureCache.set(cacheKey, baseSet);
    }

    return Object.assign({}, baseSet, { wallDisp: (wSet && wSet.disp) || null, floorDisp: (fSet && fSet.disp) || null, permWallDisp: (pSet && pSet.disp) || null, geoProfile });
};

    }

    root.Dungeon3DProcTextures = {
        procHash, procSmoothNoise, procFractalNoise, procCreateTexture, procStoreColor, getStoreColorHex,
        resolveContextualTheme, resolveGeologicalShaderProfile, normalizeRyodBiomeId, CONTEXTUAL_THEMES, attach: attachProceduralTextures
    };
    root.procHash = root.procHash || procHash;
    root.procSmoothNoise = root.procSmoothNoise || procSmoothNoise;
    root.procFractalNoise = root.procFractalNoise || procFractalNoise;
    root.procCreateTexture = root.procCreateTexture || procCreateTexture;
    root.procStoreColor = root.procStoreColor || procStoreColor;
    root.getStoreColorHex = root.getStoreColorHex || getStoreColorHex;
    root.resolveContextualTheme = root.resolveContextualTheme || resolveContextualTheme;
    root.resolveGeologicalShaderProfile = root.resolveGeologicalShaderProfile || resolveGeologicalShaderProfile;
    root.normalizeRyodBiomeId = root.normalizeRyodBiomeId || normalizeRyodBiomeId;

    if (root.Dungeon3D) {
        attachProceduralTextures(root.Dungeon3D);
    }
})(typeof window !== 'undefined' ? window : globalThis);

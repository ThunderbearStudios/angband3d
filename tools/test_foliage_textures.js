// Test procedural generation of grass vs tree foliage & bark textures
const fs = require('fs');

function procSmoothNoise(x, y, seed = 0) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const hash = (i, j) => {
        let n = (i * 374761393 + j * 668265263 + seed * 1013904223) >>> 0;
        n = (n ^ (n >> 13)) * 1274126177 >>> 0;
        return ((n ^ (n >> 16)) & 0xffff) / 65535.0;
    };

    const g00 = hash(xi, yi);
    const g10 = hash(xi + 1, yi);
    const g01 = hash(xi, yi + 1);
    const g11 = hash(xi + 1, yi + 1);

    const x1 = g00 * (1 - u) + g10 * u;
    const x2 = g01 * (1 - u) + g11 * u;
    return x1 * (1 - v) + x2 * v;
}

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

// 1. Grass Color Texture: Rich meadow turf with vertical blade striations, clumping & subtle loam earth
function sampleGrassColor(x, y) {
    // High-frequency directional blade striations (blade angle ~ 75-80 deg)
    const bladeAngle = x * 0.85 + y * 0.18;
    const bladeWave = Math.sin(bladeAngle * 1.6 + procSmoothNoise(x * 0.10, y * 0.10, 61) * 6.0);
    const fineBlade = (bladeWave * 0.5 + 0.5) * (procSmoothNoise(x * 0.35, y * 0.12, 62) * 0.4 + 0.6);
    
    // Turf clumps & soil patches
    const clumpNoise = procSmoothNoise(x * 0.04, y * 0.04, 63);
    const soilPatch = procSmoothNoise(x * 0.015, y * 0.015, 64);
    const cloverNoise = procSmoothNoise(x * 0.12, y * 0.12, 65);

    // Color palette: Lush spring meadow green with golden blade tips and dark thatch roots
    // Deep thatch root: (0.10, 0.22, 0.06)
    // Rich meadow base: (0.24, 0.54, 0.14)
    // Sunny blade tip:  (0.44, 0.76, 0.22)
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

    return [clamp01(r), clamp01(g), clamp01(b)];
}

// Grass Normal Map: Blade relief catching grazing torch/sun light
function sampleGrassNormal(x, y) {
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
    return [clamp01(nx / len * 0.5 + 0.5), clamp01(ny / len * 0.5 + 0.5), clamp01(nz / len * 0.5 + 0.5)];
}

// 2. Tree Foliage (Canopy Leaves): Distinct rounded leaf bunches/puffs, deep shadow crevices, waxy foliage
function sampleTreeLeavesColor(x, y) {
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
    const puff = clamp01(clumpNoise * 0.6 + clumpDist * 0.3 + 0.2 + leafSerration);
    
    // Deep ancient arbor canopy palette:
    // Crevice void (ambient occlusion): (0.03, 0.10, 0.04)
    // Deep forest emerald:             (0.12, 0.36, 0.16)
    // Sunlit waxy leaf edge:            (0.26, 0.58, 0.24)
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

    return [clamp01(r), clamp01(g), clamp01(b)];
}

// Tree Leaves Normal Map: Convex cluster puff normals creating volumetric 3D rounded foliage clumps
function sampleTreeLeavesNormal(x, y) {
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
    return [clamp01(nx / len * 0.5 + 0.5), clamp01(ny / len * 0.5 + 0.5), clamp01(nz / len * 0.5 + 0.5)];
}

// 3. Tree Bark Texture: Deep vertical furrows, rich chestnut/umber heartwood, organic moss
function sampleTreeBarkColor(x, y) {
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

    return [clamp01(r), clamp01(g), clamp01(b)];
}

// Tree Bark Normal Map: Deep vertical channel ridges
function sampleTreeBarkNormal(x, y) {
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
    return [clamp01(nx / len * 0.5 + 0.5), clamp01(ny / len * 0.5 + 0.5), clamp01(nz / len * 0.5 + 0.5)];
}

// Verification loop
let pass = true;
const size = 64; // test size
for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
        const gc = sampleGrassColor(x, y);
        const gn = sampleGrassNormal(x, y);
        const tc = sampleTreeLeavesColor(x, y);
        const tn = sampleTreeLeavesNormal(x, y);
        const bc = sampleTreeBarkColor(x, y);
        const bn = sampleTreeBarkNormal(x, y);
        for (const v of [...gc, ...gn, ...tc, ...tn, ...bc, ...bn]) {
            if (isNaN(v) || v < 0 || v > 1) {
                console.error(`Invalid value ${v} at (${x}, ${y})`);
                pass = false;
                break;
            }
        }
    }
}
console.log('Foliage test result:', pass ? 'ALL TEXTURES VALID AND CLAMPED' : 'FAILED');

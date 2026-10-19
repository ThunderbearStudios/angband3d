/**
 * tools/build_hud_textures.js
 * Deterministically generates dark-fantasy HUD & menu textures (pure Node.js, 0 dependencies):
 *   1. server/public/assets/ui/tattered_scroll.png (+ client/assets/ui/tattered_scroll.png)
 *   2. server/public/assets/ui/charred_wood.png    (+ client/assets/ui/charred_wood.png)
 *   3. server/public/assets/ui/apothecary_vial_overlay.svg (+ client/assets/ui/apothecary_vial_overlay.svg)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const WEB_UI_DIR = path.join(ROOT, 'server', 'public', 'assets', 'ui');
const GODOT_UI_DIR = path.join(ROOT, 'client', 'assets', 'ui');

function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // 8-bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const rowStart = y * (1 + width * 4);
        raw[rowStart] = 0; // filter none
        rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
        sig,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', idat),
        makeChunk('IEND', Buffer.alloc(0))
    ]);
}

// Deterministic tileable value noise
function hash2(x, y, seed) {
    const h = Math.imul((x & 255) * 374761393 + (y & 255) * 668265263 + seed * 1442695041, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, period, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y0 = ((yi % period) + period) % period;
    const y1 = (y0 + 1) % period;
    const n00 = hash2(x0, y0, seed);
    const n10 = hash2(x1, y0, seed);
    const n01 = hash2(x0, y1, seed);
    const n11 = hash2(x1, y1, seed);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

function fbm(x, y, period, seed) {
    return (
        0.52 * smoothNoise(x, y, period, seed) +
        0.28 * smoothNoise(x * 2, y * 2, period * 2, seed + 17) +
        0.14 * smoothNoise(x * 4, y * 4, period * 4, seed + 31) +
        0.06 * smoothNoise(x * 8, y * 8, period * 8, seed + 53)
    );
}

function generateTatteredScrollPng(w = 256, h = 256) {
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const nx = (x / w) * 8;
            const ny = (y / h) * 8;
            const n = fbm(nx, ny, 8, 101);
            // Cross-hatched linen / vellum fiber weave
            const weaveX = Math.sin((x / w) * Math.PI * 64 + n * 2.5) * 0.5 + 0.5;
            const weaveY = Math.sin((y / h) * Math.PI * 64 + n * 2.5) * 0.5 + 0.5;
            const fiber = weaveX * 0.06 + weaveY * 0.06;
            // Subtle aged crease lines & burnt edge vignette
            const crease = Math.pow(Math.abs(Math.sin((x * 0.045 + y * 0.032) + n * 4.2)), 14) * 0.14;
            const edgeDistX = Math.min(x, w - 1 - x) / (w * 0.5);
            const edgeDistY = Math.min(y, h - 1 - y) / (h * 0.5);
            const edgeScorch = Math.pow(Math.min(edgeDistX, edgeDistY), 0.35);

            // Dark-fantasy charred vellum palette (warm umber / aged sepia parchment)
            const shade = Math.max(0.18, Math.min(1.0, (0.58 + n * 0.38 + fiber - crease) * (0.72 + 0.28 * edgeScorch)));
            const r = Math.round(56 * shade + 12);
            const g = Math.round(41 * shade + 8);
            const b = Math.round(26 * shade + 5);

            const idx = (y * w + x) * 4;
            rgba[idx] = Math.min(255, r);
            rgba[idx + 1] = Math.min(255, g);
            rgba[idx + 2] = Math.min(255, b);
            rgba[idx + 3] = 255;
        }
    }
    return encodePng(w, h, rgba);
}

function generateCharredWoodPng(w = 256, h = 256) {
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const nx = (x / w) * 6;
            const ny = (y / h) * 6;
            const warp = fbm(nx, ny, 6, 202) * 2.2;
            // Horizontal medieval oak plank grain with knot turbulence
            const grainWave = Math.sin((y / h) * Math.PI * 28 + warp * 3.8) * 0.5 + 0.5;
            const fineGrain = smoothNoise((x / w) * 32, (y / h) * 96, 32, 303);
            // Plank seam every 64px vertically
            const seamDist = Math.min(y % 64, 64 - (y % 64));
            const seamDarken = seamDist < 2 ? 0.38 : (seamDist < 4 ? 0.78 : 1.0);
            // Charred ash & ember grain crevices
            const lum = (0.35 + grainWave * 0.36 + fineGrain * 0.22) * seamDarken;

            const r = Math.round(38 * lum + 8);
            const g = Math.round(25 * lum + 5);
            const b = Math.round(16 * lum + 4);

            const idx = (y * w + x) * 4;
            rgba[idx] = Math.min(255, r);
            rgba[idx + 1] = Math.min(255, g);
            rgba[idx + 2] = Math.min(255, b);
            rgba[idx + 3] = 255;
        }
    }
    return encodePng(w, h, rgba);
}

function generateApothecaryVialSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 160" fill="none">
  <defs>
    <linearGradient id="glassReflect" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="16%" stop-color="#ffffff" stop-opacity="0.52"/>
      <stop offset="30%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="76%" stop-color="#000000" stop-opacity="0.24"/>
      <stop offset="91%" stop-color="#ffe6b0" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="brassRim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5a3e1b"/>
      <stop offset="30%" stop-color="#e5c168"/>
      <stop offset="55%" stop-color="#9e7332"/>
      <stop offset="82%" stop-color="#f2d68a"/>
      <stop offset="100%" stop-color="#473014"/>
    </linearGradient>
  </defs>
  <!-- Cylindrical Glass Specular Highlight & Rim Shadow -->
  <rect x="2" y="2" width="60" height="156" rx="14" fill="url(#glassReflect)"/>
  <!-- Left Specular Glass Rib -->
  <path d="M12 10 L12 144" stroke="rgba(255,255,255,0.45)" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M17 14 L17 140" stroke="rgba(255,255,255,0.16)" stroke-width="1" stroke-linecap="round"/>
  <!-- Etched Apothecary Graduation Marks along Right Glass Wall -->
  <g stroke="rgba(242,216,158,0.68)" stroke-linecap="round">
    <!-- 90% -->
    <line x1="48" y1="20" x2="58" y2="20" stroke-width="1.3"/>
    <!-- 75% Major -->
    <line x1="41" y1="42" x2="58" y2="42" stroke-width="1.8"/>
    <!-- 60% -->
    <line x1="48" y1="62" x2="58" y2="62" stroke-width="1.3"/>
    <!-- 50% Major Center -->
    <line x1="38" y1="80" x2="58" y2="80" stroke-width="2.0"/>
    <!-- 35% -->
    <line x1="48" y1="98" x2="58" y2="98" stroke-width="1.3"/>
    <!-- 25% Major -->
    <line x1="41" y1="118" x2="58" y2="118" stroke-width="1.8"/>
    <!-- 10% -->
    <line x1="48" y1="136" x2="58" y2="136" stroke-width="1.3"/>
  </g>
  <!-- Top & Bottom Forged Brass Alchemical Ferrules -->
  <rect x="2" y="1" width="60" height="4.5" rx="2" fill="url(#brassRim)" opacity="0.88"/>
  <path d="M6 153 Q32 159 58 153" stroke="url(#brassRim)" stroke-width="3.5" stroke-linecap="round" opacity="0.85"/>
</svg>
`;
}

function main() {
    fs.mkdirSync(WEB_UI_DIR, { recursive: true });
    fs.mkdirSync(GODOT_UI_DIR, { recursive: true });

    const scrollPng = generateTatteredScrollPng(256, 256);
    const woodPng = generateCharredWoodPng(256, 256);
    const vialSvg = generateApothecaryVialSvg();

    for (const dir of [WEB_UI_DIR, GODOT_UI_DIR]) {
        fs.writeFileSync(path.join(dir, 'tattered_scroll.png'), scrollPng);
        fs.writeFileSync(path.join(dir, 'charred_wood.png'), woodPng);
        fs.writeFileSync(path.join(dir, 'apothecary_vial_overlay.svg'), vialSvg, 'utf8');
    }

    console.log(`[build_hud_textures] Generated tattered_scroll.png (${scrollPng.length} B), charred_wood.png (${woodPng.length} B), and apothecary_vial_overlay.svg (${vialSvg.length} B) in web & Godot UI directories.`);
}

main();

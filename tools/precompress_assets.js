#!/usr/bin/env node
'use strict';

/**
 * tools/precompress_assets.js
 *
 * Build-time Brotli-11 (BROTLI_MAX_QUALITY) precompressor for static web assets
 * in `server/public/` (or custom target dir passed via argv[2]).
 * Emits `<file>.br` sidecars only when compressed size < 92% of original size
 * and original size >= 1024 bytes, enabling zero-CPU `fs.createReadStream`
 * static serving on Cloud Run & local HTTP daemon.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const targetDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'server', 'public'));
const COMPRESSIBLE_EXTS = new Set(['.js', '.css', '.json', '.svg', '.wasm', '.data', '.gltf', '.obj', '.mtl', '.html']);

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'video') continue;
            walk(full, out);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (COMPRESSIBLE_EXTS.has(ext) && !entry.name.endsWith('.br')) {
                out.push(full);
            }
        }
    }
    return out;
}

const files = walk(targetDir);
let written = 0;
let skippedFresh = 0;
let rawTotal = 0;
let brTotal = 0;

for (const filePath of files) {
    const stat = fs.statSync(filePath);
    if (stat.size < 1024) continue;
    const brPath = filePath + '.br';
    if (fs.existsSync(brPath)) {
        const brStat = fs.statSync(brPath);
        if (brStat.mtimeMs >= stat.mtimeMs && brStat.size > 0) {
            rawTotal += stat.size;
            brTotal += brStat.size;
            skippedFresh++;
            continue;
        }
    }
    const raw = fs.readFileSync(filePath);
    const isText = /\.(js|css|json|svg|gltf|html|obj|mtl)$/i.test(filePath);
    const compressed = zlib.brotliCompressSync(raw, {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
            [zlib.constants.BROTLI_PARAM_MODE]: isText ? zlib.constants.BROTLI_MODE_TEXT : zlib.constants.BROTLI_MODE_GENERIC,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length
        }
    });
    if (compressed.length < raw.length * 0.92) {
        fs.writeFileSync(brPath, compressed);
        rawTotal += raw.length;
        brTotal += compressed.length;
        written++;
    } else if (fs.existsSync(brPath)) {
        fs.unlinkSync(brPath);
    }
}

const pct = rawTotal > 0 ? ((1 - brTotal / rawTotal) * 100).toFixed(1) : '0.0';
console.log(`[precompress_assets] ${written} built, ${skippedFresh} fresh | ${(rawTotal / 1048576).toFixed(2)} MB -> ${(brTotal / 1048576).toFixed(2)} MB (-${pct}%)`);

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
const COMPRESSIBLE_EXTS = new Set(['.js', '.css', '.json', '.svg', '.wasm', '.data', '.gltf', '.obj', '.mtl', '.html', '.glb', '.ktx2', '.bin']);
const BINARY_BR_ONLY_EXTS = new Set(['.glb', '.ktx2', '.bin']);

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'video') continue;
            walk(full, out);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (COMPRESSIBLE_EXTS.has(ext) && !entry.name.endsWith('.br') && !entry.name.endsWith('.gz')) {
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
let gzTotal = 0;

for (const filePath of files) {
    const stat = fs.statSync(filePath);
    if (stat.size < 1024) continue;
    const ext = path.extname(filePath).toLowerCase();
    const skipGz = BINARY_BR_ONLY_EXTS.has(ext);
    const brPath = filePath + '.br';
    const gzPath = filePath + '.gz';
    const hasFreshBr = fs.existsSync(brPath) && (() => { const s = fs.statSync(brPath); return s.mtimeMs >= stat.mtimeMs && s.size > 0 ? s : null; })();
    const hasFreshGz = skipGz ? true : (fs.existsSync(gzPath) && (() => { const s = fs.statSync(gzPath); return s.mtimeMs >= stat.mtimeMs && s.size > 0 ? s : null; })());
    if (skipGz && fs.existsSync(gzPath)) {
        try { fs.unlinkSync(gzPath); } catch (_) {}
    }
    if ((hasFreshBr || fs.existsSync(brPath + '.skip')) && hasFreshGz) {
        rawTotal += stat.size;
        if (hasFreshBr) brTotal += hasFreshBr.size;
        if (!skipGz && hasFreshGz) gzTotal += hasFreshGz.size;
        skippedFresh++;
        continue;
    }
    const raw = fs.readFileSync(filePath);
    const isText = /\.(js|css|json|svg|gltf|html|obj|mtl)$/i.test(filePath);
    rawTotal += raw.length;
    if (hasFreshBr) {
        brTotal += hasFreshBr.size;
    } else {
        const compressed = zlib.brotliCompressSync(raw, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
                [zlib.constants.BROTLI_PARAM_MODE]: isText ? zlib.constants.BROTLI_MODE_TEXT : zlib.constants.BROTLI_MODE_GENERIC,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length
            }
        });
        if (compressed.length < raw.length * 0.92) {
            fs.writeFileSync(brPath, compressed);
            brTotal += compressed.length;
            written++;
        } else {
            if (fs.existsSync(brPath)) fs.unlinkSync(brPath);
            brTotal += raw.length;
        }
    }
    if (!skipGz) {
        if (hasFreshGz) {
            gzTotal += hasFreshGz.size;
        } else {
            const gzipped = zlib.gzipSync(raw, { level: 9 });
            if (gzipped.length < raw.length * 0.92) {
                fs.writeFileSync(gzPath, gzipped);
                gzTotal += gzipped.length;
                written++;
            } else if (fs.existsSync(gzPath)) {
                fs.unlinkSync(gzPath);
            }
        }
    }
}

const pct = rawTotal > 0 ? ((1 - brTotal / rawTotal) * 100).toFixed(1) : '0.0';
const gzPct = rawTotal > 0 ? ((1 - gzTotal / rawTotal) * 100).toFixed(1) : '0.0';
console.log(`[precompress_assets] ${written} built, ${skippedFresh} fresh | ${(rawTotal / 1048576).toFixed(2)} MB -> br ${(brTotal / 1048576).toFixed(2)} MB (-${pct}%), gz ${(gzTotal / 1048576).toFixed(2)} MB (-${gzPct}%)`);

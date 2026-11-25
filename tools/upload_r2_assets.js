#!/usr/bin/env node
'use strict';

/**
 * tools/upload_r2_assets.js
 * Uploads static /assets/* and /wasm/* from server/public into a Cloudflare R2 bucket
 * under a versioned release prefix (e.g. v13.3.0/assets/...).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
const TARGET_SUBDIRS = ['assets', 'wasm'];

const MIME_MAP = {
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ktx2': 'image/ktx2',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.js': 'application/javascript; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

function parseArgs(argv) {
    let bucket = 'yasd3d-assets';
    let prefix = '';
    let dryRun = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') dryRun = true;
        else if (a === '--bucket' && argv[i + 1]) bucket = argv[++i];
        else if (a === '--prefix' && argv[i + 1]) prefix = argv[++i];
    }
    if (!prefix) {
        try {
            const verJson = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'version.json'), 'utf8'));
            prefix = `v${verJson.v || verJson.version || '13.3.0'}`;
        } catch (_) {
            prefix = 'v13.3.0';
        }
    }
    prefix = prefix.replace(/^\/+|\/+$/g, '');
    return { bucket, prefix, dryRun };
}

function collectFiles() {
    const out = [];
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                const rel = path.relative(PUBLIC_DIR, full).replace(/\\/g, '/');
                if (rel.endsWith('.br') || rel.endsWith('.gz')) continue;
                out.push({
                    fullPath: full,
                    relPath: rel,
                    size: fs.statSync(full).size,
                    contentType: MIME_MAP[path.extname(rel).toLowerCase()] || 'application/octet-stream'
                });
            }
        }
    }
    for (const sub of TARGET_SUBDIRS) {
        walk(path.join(PUBLIC_DIR, sub));
    }
    out.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return out;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const files = collectFiles();
    const totalMb = (files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2);
    console.log(`[upload_r2_assets] bucket=${opts.bucket} prefix=${opts.prefix} files=${files.length} size=${totalMb}MB dryRun=${opts.dryRun}`);

    if (opts.dryRun) {
        console.log('[upload_r2_assets] Sample keys:', files.slice(0, 5).map(f => `${opts.prefix}/${f.relPath}`));
        process.exit(0);
    }

    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    let uploaded = 0;
    for (const f of files) {
        const key = `${opts.prefix}/${f.relPath}`;
        const cacheCtrl = /\.(mp3|wav|ogg)$/i.test(f.relPath)
            ? 'public, max-age=604800, no-transform'
            : 'public, max-age=31536000, immutable';
        const res = spawnSync(npxBin, [
            '--no-install', 'wrangler', 'r2', 'object', 'put',
            `${opts.bucket}/${key}`,
            '--file', f.fullPath,
            '--content-type', f.contentType,
            '--cache-control', cacheCtrl,
            '--remote'
        ], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
        if (res.status !== 0) {
            console.error(`[upload_r2_assets] Failed uploading ${key}: ${res.stderr || res.stdout}`);
            process.exit(res.status || 1);
        }
        uploaded++;
        if (uploaded % 50 === 0 || uploaded === files.length) {
            console.log(`[upload_r2_assets] Uploaded ${uploaded}/${files.length}...`);
        }
    }
    console.log(`[upload_r2_assets] Complete: ${uploaded} objects uploaded to ${opts.bucket}/${opts.prefix}/`);
}

main();

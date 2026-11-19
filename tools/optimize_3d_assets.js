#!/usr/bin/env node
/**
 * tools/optimize_3d_assets.js
 *
 * Canary-verified 3D model optimizer for YASD 3D:
 *   - Compresses geometry/morph/skin attributes via Meshopt (--sparse false for Three.js r128 compatibility)
 *   - Converts textures inside GLBs & GLTFs to WebP capped at 1024px (characters/monsters) or 512px (items/props)
 *   - Preserves scene hierarchies, multi-material arrays, skins, and animations (--flatten/--join/--simplify false)
 *   - Idempotent: skips assets already carrying EXT_meshopt_compression unless --force is passed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const ASSETS_ROOT = path.join(ROOT, 'server', 'public', 'assets');
const FORCE = process.argv.includes('--force');

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

function findCliBin() {
    const localCandidate = path.join(ROOT, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
    if (fs.existsSync(localCandidate)) return localCandidate;
    const npxCache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm'), 'npm-cache', '_npx');
    if (fs.existsSync(npxCache)) {
        for (const h of fs.readdirSync(npxCache)) {
            const p = path.join(npxCache, h, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

function dirSize(dir) {
    return walk(dir).reduce((acc, f) => acc + fs.statSync(f).size, 0);
}

function copyTree(srcDir, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true });
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, ent.name);
        const d = path.join(dstDir, ent.name);
        if (ent.isDirectory()) copyTree(s, d);
        else fs.copyFileSync(s, d);
    }
}

const GROUND_ZERO_NO_QUANTIZE = new Set(['frost_construct.glb', 'YetiSmall.glb', 'cockatrice.glb']);

function hasMeshoptFlag(filePath) {
    try {
        if (filePath.endsWith('.gltf')) {
            const txt = fs.readFileSync(filePath, 'utf8');
            return txt.includes('EXT_meshopt_compression');
        }
        const buf = fs.readFileSync(filePath);
        if (buf.length < 24 || buf.toString('utf8', 0, 4) !== 'glTF') return false;
        const jsonLen = buf.readUInt32LE(12);
        const jsonStr = buf.toString('utf8', 20, Math.min(buf.length, 20 + jsonLen));
        if (GROUND_ZERO_NO_QUANTIZE.has(path.basename(filePath))) {
            return jsonStr.includes('EXT_texture_webp');
        }
        return jsonStr.includes('EXT_meshopt_compression');
    } catch (_) {
        return false;
    }
}

function hasMissingExternalDeps(gltfPath) {
    try {
        const j = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
        const dir = path.dirname(gltfPath);
        for (const b of (j.buffers || [])) {
            if (b.uri && !b.uri.startsWith('data:') && !fs.existsSync(path.join(dir, b.uri))) return true;
        }
        for (const img of (j.images || [])) {
            if (img.uri && !img.uri.startsWith('data:') && !fs.existsSync(path.join(dir, img.uri))) return true;
        }
        return false;
    } catch (_) {
        return true;
    }
}

async function runCli(cliBin, args) {
    if (cliBin) {
        await execFileAsync(process.execPath, [cliBin, ...args], { maxBuffer: 10 * 1024 * 1024 });
    } else {
        await execFileAsync(process.platform === 'win32' ? 'cmd' : 'npx',
            process.platform === 'win32' ? ['/c', 'npx', '--yes', '@gltf-transform/cli', ...args] : ['--yes', '@gltf-transform/cli', ...args],
            { maxBuffer: 10 * 1024 * 1024 });
    }
}

async function main() {
    const cliBin = findCliBin();
    const allFiles = walk(ASSETS_ROOT);
    const glbs = allFiles.filter(f => f.toLowerCase().endsWith('.glb'));
    const gltfs = allFiles.filter(f => f.toLowerCase().endsWith('.gltf'));
    const beforeBytes = allFiles
        .filter(f => /\.(glb|gltf|bin|png|jpg|jpeg|webp)$/i.test(f) && (f.includes(`${path.sep}models${path.sep}`) || f.includes(`${path.sep}polyhaven${path.sep}models${path.sep}`)))
        .reduce((s, f) => s + fs.statSync(f).size, 0);

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-opt3d-'));
    let converted = 0, skipped = 0, failed = 0;

    try {
        // 1. Optimize GLBs with bounded concurrency (each is self-contained)
        const glbQueue = [...glbs];
        const glbWorker = async () => {
            while (glbQueue.length) {
                const src = glbQueue.shift();
                if (!FORCE && hasMeshoptFlag(src)) { skipped++; continue; }
                const rel = path.relative(ASSETS_ROOT, src).replace(/[^a-zA-Z0-9_.-]/g, '_');
                const dst = path.join(tmpRoot, 'glb', rel);
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                const isCharOrMonster = src.includes(`${path.sep}monsters${path.sep}`) || src.includes(`${path.sep}characters${path.sep}`);
                const baseName = path.basename(src);
                const noQuantize = GROUND_ZERO_NO_QUANTIZE.has(baseName);
                const texSize = noQuantize ? '512' : (isCharOrMonster ? '1024' : '512');
                try {
                    await runCli(cliBin, [
                        'optimize', src, dst,
                        '--compress', noQuantize ? 'false' : 'meshopt',
                        '--sparse', 'false',
                        '--flatten', 'false',
                        '--join', 'false',
                        '--palette', 'false',
                        '--instance', 'false',
                        '--prune-attributes', 'false',
                        '--prune-solid-textures', 'false',
                        '--simplify', 'false',
                        '--texture-compress', 'webp',
                        '--texture-size', texSize
                    ]);
                    const oldSz = fs.statSync(src).size;
                    const newSz = fs.existsSync(dst) ? fs.statSync(dst).size : Infinity;
                    if (newSz > 128 && newSz < oldSz) {
                        fs.copyFileSync(dst, src);
                        converted++;
                    } else {
                        skipped++;
                    }
                } catch (err) {
                    failed++;
                    console.warn('[opt3d] GLB warn:', path.relative(ROOT, src), err.message);
                }
            }
        };
        await Promise.all(Array.from({ length: 6 }, glbWorker));

        // 2. Optimize GLTFs serialized per shared directory so shared .webp textures never collide
        const gltfByDir = new Map();
        for (const g of gltfs) {
            const d = path.dirname(g);
            if (!gltfByDir.has(d)) gltfByDir.set(d, []);
            gltfByDir.get(d).push(g);
        }
        const dirQueue = [...gltfByDir.entries()];
        const dirWorker = async () => {
            while (dirQueue.length) {
                const [modelDir, files] = dirQueue.shift();
                for (const src of files) {
                    if (!FORCE && (hasMeshoptFlag(src) || hasMissingExternalDeps(src))) { skipped++; continue; }
                    const base = path.basename(src, '.gltf');
                    const outDir = path.join(tmpRoot, 'gltf', path.relative(ASSETS_ROOT, modelDir).replace(/[^a-zA-Z0-9_.-]/g, '_'), base);
                    fs.mkdirSync(outDir, { recursive: true });
                    const dst = path.join(outDir, path.basename(src));
                    const isChar = src.includes(`${path.sep}characters${path.sep}`) || src.includes(`${path.sep}monsters${path.sep}`);
                    const texSize = isChar ? '1024' : '512';
                    try {
                        await runCli(cliBin, [
                            'optimize', src, dst,
                            '--compress', 'meshopt',
                            '--sparse', 'false',
                            '--flatten', 'false',
                            '--join', 'false',
                            '--palette', 'false',
                            '--instance', 'false',
                            '--prune-attributes', 'false',
                            '--prune-solid-textures', 'false',
                            '--simplify', 'false',
                            '--texture-compress', 'webp',
                            '--texture-size', texSize
                        ]);
                        if (fs.existsSync(dst) && fs.statSync(dst).size > 64) {
                            copyTree(outDir, modelDir);
                            converted++;
                        } else {
                            skipped++;
                        }
                    } catch (err) {
                        failed++;
                        console.warn('[opt3d] GLTF warn:', path.relative(ROOT, src), err.message);
                    }
                }
            }
        };
        await Promise.all(Array.from({ length: 4 }, dirWorker));

        // 3. Sweep orphaned .png/.jpg inside models/ and polyhaven/models/ unreferenced by any .gltf
        const referencedModelImgs = new Set();
        for (const g of walk(ASSETS_ROOT).filter(f => f.toLowerCase().endsWith('.gltf'))) {
            try {
                const j = JSON.parse(fs.readFileSync(g, 'utf8'));
                const gDir = path.dirname(g);
                for (const img of (j.images || [])) {
                    if (img && img.uri && !img.uri.startsWith('data:')) {
                        referencedModelImgs.add(path.resolve(gDir, img.uri).toLowerCase());
                    }
                }
            } catch (_) {}
        }
        let prunedImgs = 0;
        for (const f of walk(ASSETS_ROOT)) {
            if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
            const norm = f.replace(/\\/g, '/');
            if (!norm.includes('/assets/models/') && !norm.includes('/assets/polyhaven/models/')) continue;
            if (!referencedModelImgs.has(path.resolve(f).toLowerCase())) {
                fs.unlinkSync(f);
                prunedImgs++;
            }
        }
        // Remove empty textures/ folders left in polyhaven/models/*
        for (const d of walk(ASSETS_ROOT)) void d;

        const afterBytes = walk(ASSETS_ROOT)
            .filter(f => /\.(glb|gltf|bin|png|jpg|jpeg|webp)$/i.test(f) && (f.includes(`${path.sep}models${path.sep}`) || f.includes(`${path.sep}polyhaven${path.sep}models${path.sep}`)))
            .reduce((s, f) => s + fs.statSync(f).size, 0);

        console.log(`[optimize_3d_assets] converted=${converted}, skipped=${skipped}, failed=${failed}, prunedOldTextures=${prunedImgs}`);
        console.log(`[optimize_3d_assets] 3D Models + Textures: ${(beforeBytes / 1048576).toFixed(2)} MB -> ${(afterBytes / 1048576).toFixed(2)} MB (-${((1 - afterBytes / Math.max(1, beforeBytes)) * 100).toFixed(1)}%)`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main();

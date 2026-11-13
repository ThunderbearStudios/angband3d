#!/usr/bin/env node
'use strict';

/**
 * tools/sync_android_assets.js
 *
 * Node 18+ deterministic Android web-asset sync for Capacitor (`android/app/src/main/assets/public`).
 * Invokes `cap sync android` when supported by the host Node runtime (>= 18.19.0 for glob@14
 * `diagnostics_channel.tracingChannel`), and deterministically mirrors `server/public` while
 * excluding web-only showcase video frames (`assets/video`), `demo.html`, and `.br` sidecars,
 * plus pruning any deleted stale files from `android/app/src/main/assets/public`.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'server', 'public');
const androidPublicDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');

const EXCLUDED_PREFIXES = ['assets/video', 'demo.html'];

function isExcluded(relPath) {
    const norm = relPath.replace(/\\/g, '/');
    if (norm.endsWith('.br')) return true;
    return EXCLUDED_PREFIXES.some((p) => norm === p || norm.startsWith(p + '/'));
}

// Run `cap sync android` if Node supports diagnostics_channel.tracingChannel (>= 18.19.0)
const dc = require('diagnostics_channel');
if (typeof dc.tracingChannel === 'function') {
    const capBin = path.join(rootDir, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
    if (fs.existsSync(capBin)) {
        const res = spawnSync(process.execPath, [capBin, 'sync', 'android'], {
            cwd: rootDir,
            stdio: 'inherit'
        });
        if (res.status !== 0) {
            console.warn('[sync_android_assets] cap sync returned non-zero; falling back to direct fs mirror.');
        }
    }
}

function walkFiles(dir, base = dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(full, base, out);
        } else if (entry.isFile()) {
            out.push(path.relative(base, full).replace(/\\/g, '/'));
        }
    }
    return out;
}

fs.mkdirSync(androidPublicDir, { recursive: true });

const expectedSet = new Set();
let copied = 0;
for (const rel of walkFiles(webDir)) {
    if (isExcluded(rel)) continue;
    expectedSet.add(rel);
    const src = path.join(webDir, rel);
    const dst = path.join(androidPublicDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
}

let pruned = 0;
for (const rel of walkFiles(androidPublicDir)) {
    if (!expectedSet.has(rel)) {
        fs.rmSync(path.join(androidPublicDir, rel), { force: true });
        pruned++;
    }
}

console.log(`[sync_android_assets] Synced ${copied} files to Android assets (${pruned} stale/excluded files pruned).`);

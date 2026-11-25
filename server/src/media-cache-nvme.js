'use strict';

/**
 * server/src/media-cache-nvme.js
 * Persistent NVMe disk-backed LRU cache for neural TTS audio and Chronicle sketches.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HEX_64_RE = /^[a-f0-9]{64}$/;

function noopCache() {
    return {
        enabled: false,
        getTts: async () => null,
        putTts: async () => {},
        getSketch: async () => null,
        putSketch: async () => {},
        evictIfNeeded: async () => 0
    };
}

/**
 * Creates a bounded persistent LRU cache under `cacheDir` with strict SHA-256 path jailing.
 */
function createNvmeMediaCache({ cacheDir = '', maxBytes = 10 * 1024 * 1024 * 1024 } = {}) {
    if (!cacheDir || typeof cacheDir !== 'string') return noopCache();
    const rootDir = path.resolve(cacheDir);
    const ttsDir = path.join(rootDir, 'tts');
    const sketchDir = path.join(rootDir, 'sketch');
    const limitBytes = Math.max(1024 * 1024, Number(maxBytes) || (10 * 1024 * 1024 * 1024));

    try {
        fs.mkdirSync(ttsDir, { recursive: true });
        fs.mkdirSync(sketchDir, { recursive: true });
    } catch (_) {
        return noopCache();
    }

    let totalWrites = 0;
    let evictionInFlight = null;

    function resolveJailedPath(subDir, key, ext) {
        const digest = crypto.createHash('sha256').update(String(key || '')).digest('hex');
        if (!HEX_64_RE.test(digest)) {
            throw new Error('Invalid cache digest');
        }
        const target = path.resolve(subDir, `${digest}${ext}`);
        if (!target.startsWith(subDir + path.sep)) {
            throw new Error('Cache path escaped jail');
        }
        return target;
    }

    async function touchLru(filePath) {
        const now = new Date();
        await fs.promises.utimes(filePath, now, now).catch(() => {});
    }

    async function atomicWrite(targetPath, data) {
        const tmp = `${targetPath}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 8)}`;
        await fs.promises.writeFile(tmp, data);
        await fs.promises.rename(tmp, targetPath).catch(async (err) => {
            await fs.promises.unlink(tmp).catch(() => {});
            throw err;
        });
    }

    async function evictIfNeeded() {
        if (evictionInFlight) return evictionInFlight;
        evictionInFlight = (async () => {
            const entries = [];
            let totalSize = 0;
            for (const dir of [ttsDir, sketchDir]) {
                let files = [];
                try {
                    files = await fs.promises.readdir(dir);
                } catch (_) {
                    continue;
                }
                for (const name of files) {
                    if (name.includes('.tmp.')) continue;
                    const full = path.join(dir, name);
                    try {
                        const st = await fs.promises.stat(full);
                        if (!st.isFile()) continue;
                        totalSize += st.size;
                        entries.push({ full, size: st.size, mtimeMs: st.mtimeMs });
                    } catch (_) {}
                }
            }
            if (totalSize <= limitBytes) return 0;
            entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
            const targetSize = Math.floor(limitBytes * 0.85);
            let removed = 0;
            for (const item of entries) {
                if (totalSize <= targetSize) break;
                try {
                    await fs.promises.unlink(item.full);
                    totalSize -= item.size;
                    removed++;
                } catch (_) {}
            }
            return removed;
        })().finally(() => {
            evictionInFlight = null;
        });
        return evictionInFlight;
    }

    function maybeScheduleEvict() {
        totalWrites++;
        if (totalWrites % 25 === 0) {
            evictIfNeeded().catch(() => {});
        }
    }

    return {
        enabled: true,
        async getTts(cacheKey) {
            try {
                const filePath = resolveJailedPath(ttsDir, cacheKey, '.bin');
                const buf = await fs.promises.readFile(filePath);
                if (!buf || buf.length === 0) return null;
                touchLru(filePath).catch(() => {});
                return buf;
            } catch (_) {
                return null;
            }
        },
        async putTts(cacheKey, buf) {
            if (!Buffer.isBuffer(buf) || buf.length === 0) return;
            try {
                const filePath = resolveJailedPath(ttsDir, cacheKey, '.bin');
                await atomicWrite(filePath, buf);
                maybeScheduleEvict();
            } catch (_) {}
        },
        async getSketch(cacheKey) {
            try {
                const filePath = resolveJailedPath(sketchDir, cacheKey, '.json');
                const raw = await fs.promises.readFile(filePath, 'utf8');
                const parsed = JSON.parse(raw);
                if (!parsed || !parsed.imageUrl) return null;
                touchLru(filePath).catch(() => {});
                return parsed;
            } catch (_) {
                return null;
            }
        },
        async putSketch(cacheKey, obj) {
            if (!obj || !obj.imageUrl) return;
            try {
                const filePath = resolveJailedPath(sketchDir, cacheKey, '.json');
                await atomicWrite(filePath, JSON.stringify({ imageUrl: obj.imageUrl, model: obj.model || 'gemini-3.1-flash-image' }));
                maybeScheduleEvict();
            } catch (_) {}
        },
        evictIfNeeded
    };
}

module.exports = { createNvmeMediaCache };

#!/usr/bin/env node
'use strict';

/**
 * tools/test_wave1_vps_infra.js
 * Verification suite for Wave 1A VPS config, SQLite WAL index, NVMe LRU media cache,
 * help memoization, hardened Dockerfile, Edge Worker R2/failover, and R2 upload dry-run.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

async function main() {
    // 1. vps-config.js (Cloud Run vs OVH limits + bounded AI pool)
    {
        const prevTarget = process.env.DEPLOY_TARGET;
        const prevMax = process.env.MAX_CONCURRENT_GAMES;
        try {
            process.env.DEPLOY_TARGET = 'ovh';
            delete process.env.MAX_CONCURRENT_GAMES;
            const modPath = require.resolve('../server/src/vps-config');
            delete require.cache[modPath];
            const ovhCfg = require('../server/src/vps-config');
            check(ovhCfg.IS_OVH === true, 'DEPLOY_TARGET=ovh sets IS_OVH');
            check(ovhCfg.MAX_CONCURRENT_GAMES === 500, 'OVH raises MAX_CONCURRENT_GAMES to 500');
            check(ovhCfg.MAX_QUEUE_SIZE === 500, 'OVH raises MAX_QUEUE_SIZE to 500');
            check(ovhCfg.IDLE_TIMEOUT_MS === 3 * 60 * 60 * 1000, 'OVH raises idle timeout to 3h');
            check(ovhCfg.SAVES_CACHE_TTL_MS === 0, 'OVH disables 30s stale save list cache');
            check(ovhCfg.SKIP_GCP_METADATA === true, 'OVH skips GCP metadata probe');

            const pool = ovhCfg.createBoundedPool(2);
            let active = 0;
            let peak = 0;
            await Promise.all([1, 2, 3, 4, 5].map((i) => pool.run(async () => {
                active++;
                if (active > peak) peak = active;
                await new Promise((r) => setTimeout(r, 15));
                active--;
                return i;
            })));
            check(peak <= 2, `createBoundedPool(2) kept peak=${peak} <= 2`);
            check(pool.stats().completed === 5, 'createBoundedPool tracks completed jobs');
        } finally {
            if (prevTarget === undefined) delete process.env.DEPLOY_TARGET; else process.env.DEPLOY_TARGET = prevTarget;
            if (prevMax === undefined) delete process.env.MAX_CONCURRENT_GAMES; else process.env.MAX_CONCURRENT_GAMES = prevMax;
        }
    }

    // 2. vault-sqlite.js (WAL roundtrip, mtime invalidation, corrupt-file auto-rebuild)
    {
        const { createVaultIndex } = require('../server/src/vault-sqlite');
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-w1-db-'));
        const dbPath = path.join(tmpDir, 'vault.db');
        try {
            const idx = createVaultIndex(dbPath);
            check(idx.enabled === true, 'vault-sqlite enabled under Node 22+ node:sqlite');
            const meta = { filename: 'Hero', realm: 'angband', stakes: 'standard' };
            idx.upsertSaveMeta('/tmp/Hero', 'angband', 'Hero', 1234.5, 512, meta);
            const hit = idx.getSaveMeta('/tmp/Hero', 1234.5, 512);
            check(hit && hit.filename === 'Hero', 'vault-sqlite retrieves matching save metadata');
            check(idx.getSaveMeta('/tmp/Hero', 9999, 512) === null, 'vault-sqlite invalidates on mtime change');
            idx.upsertBlueprint('slot:test', 'RYOD-12345678', { title: 'Test Realm' });
            check(idx.getBlueprint('slot:test').title === 'Test Realm', 'vault-sqlite persists RYOD blueprint');
            idx.deleteSaveMeta('/tmp/Hero');
            check(idx.getSaveMeta('/tmp/Hero', 1234.5, 512) === null, 'vault-sqlite deletes removed save metadata');
            idx.close();

            // Simulate corrupt SQLite header -> must auto-rebuild without crashing
            fs.writeFileSync(dbPath, Buffer.from('NOT_A_VALID_SQLITE_HEADER_00000000'));
            const rebuilt = createVaultIndex(dbPath);
            check(rebuilt.enabled === true, 'vault-sqlite auto-rebuilds corrupt database file');
            check(rebuilt.getSaveMeta('/tmp/Hero', 1234.5, 512) === null, 'rebuilt vault-sqlite starts clean');
            rebuilt.close();
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }

    // 3. media-cache-nvme.js (TTS & Sketch round-trip + LRU eviction)
    {
        const { createNvmeMediaCache } = require('../server/src/media-cache-nvme');
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-w1-cache-'));
        try {
            const cache = createNvmeMediaCache({ cacheDir: tmpDir, maxBytes: 1024 * 1024 });
            check(cache.enabled === true, 'NVMe media cache initializes cleanly');
            const wav = Buffer.from('RIFF_TEST_AUDIO_BYTES');
            await cache.putTts('tts:../evil/key', wav);
            const ttsHit = await cache.getTts('tts:../evil/key');
            check(Buffer.isBuffer(ttsHit) && ttsHit.equals(wav), 'NVMe TTS round-trip succeeds safely via sha256 jail');

            await cache.putSketch('sketch:test', { imageUrl: 'data:image/png;base64,AAA', model: 'gemini-3.1-flash-image' });
            const skHit = await cache.getSketch('sketch:test');
            check(skHit && skHit.model === 'gemini-3.1-flash-image', 'NVMe Sketch round-trip succeeds');

            // Verify eviction cleans oldest entries when oversized
            const big = Buffer.alloc(600 * 1024, 1);
            await cache.putTts('big1', big);
            await new Promise((r) => setTimeout(r, 20));
            await cache.putTts('big2', big);
            const evicted = await cache.evictIfNeeded();
            check(evicted >= 1, `NVMe LRU eviction trimmed ${evicted} oversized entries`);
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }

    // 4. realm-help-files.js memoization
    {
        const help = require('../server/src/realm-help-files');
        const a = help.listHelpFiles('silq');
        const b = help.listHelpFiles('silq');
        check(Array.isArray(a) && a.length > 0 && a.length === b.length && a !== b, 'listHelpFiles memoizes safely');
        const f1 = help.readHelpFile('nethack', 'Guidebook.txt');
        const f2 = help.readHelpFile('nethack', 'Guidebook.txt');
        check(f1 && f2 && f1.text === f2.text, 'readHelpFile memoizes virtual/disk manuals consistently');
    }

    // 5. Edge Worker, wrangler config, Dockerfile & R2 uploader dry-run
    {
        const workerSrc = read('edge/worker.js');
        check(workerSrc.includes('ASSETS_R2') && workerSrc.includes('tryServeFromR2'), 'edge/worker.js supports R2 offload');
        check(workerSrc.includes('ORIGIN_MODE') && workerSrc.includes('FALLBACK_ORIGIN') && workerSrc.includes('fallback-cloudrun'), 'edge/worker.js supports primary OVH + Cloud Run failover');

        const wranglerSrc = read('edge/wrangler.yasd3d.toml');
        check(wranglerSrc.includes('workers_dev = false'), 'wrangler.yasd3d.toml disables public workers.dev bypass');
        check(wranglerSrc.includes('ORIGIN_MODE = "ovh"'), 'wrangler.yasd3d.toml routes primary traffic to ResonantOVH after Wave 1B cutover');

        const dockerSrc = read('server/Dockerfile');
        check(dockerSrc.includes('USER yasd3d') && dockerSrc.includes('CACHE_DIR=/data/cache') && dockerSrc.includes('DB_DIR=/data/db'), 'server/Dockerfile runs non-root yasd3d user with NVMe env dirs');

        const dryOut = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'upload_r2_assets.js'), '--dry-run'], { encoding: 'utf8' });
        check(dryOut.includes('files=') && dryOut.includes('Sample keys:'), 'upload_r2_assets.js --dry-run runs cleanly');
    }

    console.log(`[PASS] Wave 1 VPS/R2 infrastructure suite: ${passed} assertions passed.`);
}

main().catch((err) => {
    console.error('[FAIL] test_wave1_vps_infra:', err);
    process.exit(1);
});

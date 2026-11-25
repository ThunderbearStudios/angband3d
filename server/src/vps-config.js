'use strict';

/**
 * server/src/vps-config.js
 * Centralized ResonantOVH vs Cloud Run capacity, cache, timeout, and bounded AI pool settings.
 */

const DEPLOY_TARGET = String(
    process.env.DEPLOY_TARGET || (process.env.K_SERVICE ? 'cloudrun' : 'local')
).toLowerCase().trim() || 'local';

const IS_OVH = DEPLOY_TARGET === 'ovh';

const MAX_CONCURRENT_GAMES = parseInt(process.env.MAX_CONCURRENT_GAMES || (IS_OVH ? '500' : '36'), 10);
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || (IS_OVH ? '500' : '100'), 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || String(IS_OVH ? 3 * 60 * 60 * 1000 : 15 * 60 * 1000), 10);
const DISCONNECT_GRACE_PERIOD_MS = parseInt(process.env.DISCONNECT_GRACE_PERIOD_MS || String(IS_OVH ? 15 * 60 * 1000 : 90 * 1000), 10);
const SETUP_GRACE_PERIOD_MS = parseInt(process.env.SETUP_GRACE_PERIOD_MS || String(IS_OVH ? 120 * 1000 : 20 * 1000), 10);
const SAVES_CACHE_TTL_MS = parseInt(process.env.SAVES_CACHE_TTL_MS || (IS_OVH ? '0' : '30000'), 10);
const RANGE_MAX_CHUNK_BYTES = parseInt(process.env.RANGE_MAX_CHUNK_BYTES || String(IS_OVH ? 64 * 1024 * 1024 : 4 * 1024 * 1024), 10);
const STATIC_STAT_IMMUTABLE = Boolean(process.env.K_SERVICE || IS_OVH);
const SKIP_GCP_METADATA = Boolean(IS_OVH && !process.env.GCP_ACCESS_TOKEN);
const CACHE_DIR = process.env.CACHE_DIR || '';
const DB_DIR = process.env.DB_DIR || '';
const NVME_CACHE_MAX_BYTES = parseInt(process.env.NVME_CACHE_MAX_BYTES || String(10 * 1024 * 1024 * 1024), 10);
const LOCAL_AI_MAX_CONCURRENCY = Math.max(1, parseInt(process.env.LOCAL_AI_MAX_CONCURRENCY || '3', 10));

/**
 * Bounded concurrency limiter for CPU-bound OVH local AI inferences so game slices stay responsive.
 */
function createBoundedPool(maxConcurrency = LOCAL_AI_MAX_CONCURRENCY) {
    const limit = Math.max(1, Number(maxConcurrency) || 1);
    let active = 0;
    const queue = [];
    let completed = 0;

    function drainNext() {
        while (active < limit && queue.length > 0) {
            const job = queue.shift();
            active++;
            Promise.resolve()
                .then(() => job.fn())
                .then(
                    (res) => job.resolve(res),
                    (err) => job.reject(err)
                )
                .finally(() => {
                    active--;
                    completed++;
                    drainNext();
                });
        }
    }

    return {
        run(fn) {
            return new Promise((resolve, reject) => {
                queue.push({ fn, resolve, reject });
                drainNext();
            });
        },
        stats() {
            return { limit, active, queued: queue.length, completed };
        }
    };
}

module.exports = {
    DEPLOY_TARGET,
    IS_OVH,
    MAX_CONCURRENT_GAMES,
    MAX_QUEUE_SIZE,
    IDLE_TIMEOUT_MS,
    DISCONNECT_GRACE_PERIOD_MS,
    SETUP_GRACE_PERIOD_MS,
    SAVES_CACHE_TTL_MS,
    RANGE_MAX_CHUNK_BYTES,
    STATIC_STAT_IMMUTABLE,
    SKIP_GCP_METADATA,
    CACHE_DIR,
    DB_DIR,
    NVME_CACHE_MAX_BYTES,
    LOCAL_AI_MAX_CONCURRENCY,
    createBoundedPool
};

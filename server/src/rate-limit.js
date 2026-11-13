'use strict';
// Fixed-window limiter keyed by client IP. Two windows: per minute and per day.
function createLimiter({ perMinute, perDay, maxEntries = 10000 }) {
    const win = [{ ms: 60_000, max: perMinute, m: new Map() }, { ms: 86_400_000, max: perDay, m: new Map() }];
    setInterval(() => { const now = Date.now(); for (const w of win) for (const [k, e] of w.m) if (now - e.t >= w.ms) w.m.delete(k); }, 60_000).unref();
    return function check(key, now = Date.now()) {          // returns 0 if allowed, else Retry-After seconds
        for (const w of win) {
            let e = w.m.get(key);
            if (!e || now - e.t >= w.ms) {
                if (!w.m.has(key) && w.m.size >= maxEntries) {
                    const oldest = w.m.keys().next().value;
                    if (oldest !== undefined) w.m.delete(oldest);
                }
                e = { t: now, n: 0 };
                w.m.set(key, e);
            }
            if (e.n >= w.max) return Math.max(1, Math.ceil((e.t + w.ms - now) / 1000));
        }
        for (const w of win) w.m.get(key).n++;               // count only allowed requests
        return 0;
    };
}
const crypto = require('crypto');

const DEFAULT_MAX_WS_PER_IP = 32;
const MAX_WS_PER_IP = parseInt(process.env.MAX_WS_PER_IP || String(DEFAULT_MAX_WS_PER_IP), 10);

let _warnedMissingEdgeSecret = false;
function warnIfMissingEdgeSecret() {
    if (!_warnedMissingEdgeSecret && process.env.TRUST_CLOUDFLARE === '1' && !process.env.EDGE_PROXY_SECRET) {
        _warnedMissingEdgeSecret = true;
        console.warn('[RateLimit][SECURITY WARNING] TRUST_CLOUDFLARE=1 is set without EDGE_PROXY_SECRET! Configure EDGE_PROXY_SECRET so origin requests cannot spoof CF-Connecting-IP.');
    }
}
warnIfMissingEdgeSecret();

function hasValidEdgeSecret(req) {
    const expectedSecret = process.env.EDGE_PROXY_SECRET || '';
    if (!expectedSecret) {
        warnIfMissingEdgeSecret();
        return true;
    }
    const provided = String((req.headers && req.headers['x-edge-proxy-secret']) || '');
    const a = Buffer.from(expectedSecret, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
    if (process.env.TRUST_PROXY === '1') {                 // set on Cloud Run (behind Google Front End)
        if (process.env.TRUST_CLOUDFLARE === '1' && hasValidEdgeSecret(req)) {
            const cfIp = String((req.headers && req.headers['cf-connecting-ip']) || '').trim();
            if (cfIp) return cfIp;
        }
        const xff = String((req.headers && req.headers['x-forwarded-for']) || '');
        const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function extractVaultRateKey(req) {
    const ip = clientIp(req);
    const headers = (req && req.headers) || {};
    const rawVault = String(
        headers['x-vault-id'] ||
        headers['x-owner-token'] ||
        headers['x-save-owner-token'] ||
        ''
    ).split(',')[0].trim();
    const vaultHash = rawVault
        ? crypto.createHash('sha256').update(rawVault).digest('hex').slice(0, 16)
        : 'anon';
    return `${ip}:${vaultHash}`;
}

function createVaultSyncLimiter(opts = {}) {
    const limiter = createLimiter({
        perMinute: +opts.perMinute || +process.env.SYNC_RPM || 60,
        perDay: +opts.perDay || +process.env.SYNC_RPD || 5000,
        maxEntries: +opts.maxEntries || 20000
    });
    return function checkVaultSync(reqOrKey, now = Date.now()) {
        const key = (typeof reqOrKey === 'string') ? reqOrKey : extractVaultRateKey(reqOrKey);
        return limiter(key, now);
    };
}

module.exports = {
    createLimiter,
    createVaultSyncLimiter,
    extractVaultRateKey,
    clientIp,
    warnIfMissingEdgeSecret,
    DEFAULT_MAX_WS_PER_IP,
    MAX_WS_PER_IP
};

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
function clientIp(req) {
    if (process.env.TRUST_PROXY === '1') {                 // set on Cloud Run (behind Google Front End)
        if (process.env.TRUST_CLOUDFLARE === '1') {
            const cfIp = String(req.headers['cf-connecting-ip'] || '').trim();
            if (cfIp) return cfIp;
        }
        const xff = String(req.headers['x-forwarded-for'] || '');
        const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}
module.exports = { createLimiter, clientIp };

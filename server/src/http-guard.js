'use strict';

/**
 * Guards API mutations and expensive endpoints (TTS) against CSRF and cross-site abuse.
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @param {function} isAllowedOrigin - function(origin, host)
 * @param {string} host - the Host header from req
 * @returns {boolean} true if the request was rejected (handled), false otherwise.
 */
function guardMutation(req, res, isAllowedOrigin, host) {
    const effectiveHost = host || (req.headers && req.headers.host) || 'localhost';
    const urlObj = new URL(req.url, `http://${effectiveHost}`);
    const pathname = urlObj.pathname;

    if (!pathname.startsWith('/api/')) return false;

    if (req.method === 'GET' && !pathname.startsWith('/api/tts')) {
        return false;
    }

    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cross-site requests not allowed' }));
        return true;
    }

    const reqOrigin = req.headers.origin;
    if (reqOrigin && !isAllowedOrigin(reqOrigin, effectiveHost, req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin not allowed' }));
        return true;
    }

    return false;
}

module.exports = { guardMutation };

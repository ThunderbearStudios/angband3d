#!/usr/bin/env node
// Fast HTTP/WS guard gate (WS4.3/WS4.6/D17). Boots the real server on a random port with a temp
// SAVE_DIR (EXECUTOR rule 10: never touch real saves), then checks:
//   - foreign Origin gets no Access-Control-Allow-Origin; same-host Origin is echoed; never '*'
//   - WS upgrade from a foreign Origin is refused; same-host Origin is accepted
//   - recording upload is 403 unless ENABLE_RECORDING_UPLOAD=1 (dev-only)
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const port = 20000 + Math.floor(Math.random() * 20000);
const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a3d-'));
const env = Object.assign({}, process.env, { PORT: String(port), SAVE_DIR: saveDir });
delete env.ENABLE_RECORDING_UPLOAD;
const child = spawn(process.execPath, [path.join(root, 'server', 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', d => { log += d; });
child.stderr.on('data', d => { log += d; });

const fails = [];
const req = (opts, body) => new Promise(resolve => {
    const r = http.request(Object.assign({ host: '127.0.0.1', port }, opts), res => {
        res.resume(); res.on('end', () => resolve(res));
    });
    r.on('error', e => resolve({ statusCode: 0, headers: {}, error: e }));
    if (body) r.write(body);
    r.end();
});
const wsUpgrade = origin => new Promise(resolve => {
    const headers = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' };
    if (origin) headers.Origin = origin;
    const r = http.request({ host: '127.0.0.1', port, path: '/ws', headers });
    r.on('upgrade', (res, sock) => { sock.destroy(); resolve(101); });
    r.on('response', res => resolve(res.statusCode));
    r.on('error', () => resolve(0));
    r.end();
});

async function waitUp() {
    for (let i = 0; i < 60; i++) {
        const r = await req({ path: '/health', method: 'GET' });
        if (r.statusCode) return true;
        await new Promise(ok => setTimeout(ok, 250));
    }
    return false;
}

(async () => {
    try {
        if (!await waitUp()) { fails.push('server did not boot:\n' + log.slice(-800)); return; }
        const self = `http://127.0.0.1:${port}`;
        const evil = await req({ path: '/health', headers: { Origin: 'https://evil.example' } });
        if (evil.headers['access-control-allow-origin']) fails.push('foreign Origin got ACAO=' + evil.headers['access-control-allow-origin']);
        const same = await req({ path: '/health', headers: { Origin: self } });
        if (same.headers['access-control-allow-origin'] !== self) fails.push('same-host Origin not echoed: ' + same.headers['access-control-allow-origin']);
        if (await wsUpgrade('https://evil.example') === 101) fails.push('WS upgrade accepted from foreign Origin');
        const okWs = await wsUpgrade(self);
        if (okWs !== 101) fails.push('WS upgrade refused for same-host Origin (status ' + okWs + ')');
        
        // WS4.3 Mutation / Cross-site tests
        const mut1 = await req({ path: '/api/saves/x', method: 'DELETE', headers: { Origin: 'https://evil.example' } });
        if (mut1.statusCode !== 403) fails.push('DELETE /api/saves/x from evil origin not 403 (got ' + mut1.statusCode + ')');
        
        const mut2 = await req({ path: '/api/llm/generate', method: 'POST', headers: { Origin: 'https://evil.example' } }, '{}');
        if (mut2.statusCode !== 403) fails.push('POST /api/llm/generate from evil origin not 403 (got ' + mut2.statusCode + ')');
        
        const mut3 = await req({ path: '/api/tts?text=hi', method: 'GET', headers: { Origin: 'https://evil.example' } });
        if (mut3.statusCode !== 403) fails.push('GET /api/tts from evil origin not 403 (got ' + mut3.statusCode + ')');
        
        const mut4 = await req({ path: '/api/llm/generate', method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } }, '{}');
        if (mut4.statusCode !== 403) fails.push('POST /api/llm/generate with cross-site fetch metadata not 403 (got ' + mut4.statusCode + ')');
        
        const mut5 = await req({ path: '/api/llm/generate', method: 'POST' }, '{}');
        if (mut5.statusCode === 403) fails.push('POST /api/llm/generate with NO origin rejected with 403 (should be allowed or 401/404)');

        const up = await req({ path: '/api/recordings/upload', method: 'POST', headers: { 'X-Recording-Name': 'x.webm', 'Content-Type': 'application/octet-stream' } }, 'abc');
        if (up.statusCode !== 403) fails.push('recording upload not blocked (status ' + up.statusCode + ')');
    } finally {
        child.kill();
        try { fs.rmSync(saveDir, { recursive: true, force: true }); } catch (_) {}
        if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
        console.log('PASS http guard (CORS allowlist, WS origin, recording upload dev-only)');
        process.exit(0);
    }
})();

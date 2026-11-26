'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = addr && addr.port;
            srv.close((err) => (err ? reject(err) : resolve(port)));
        });
    });
}

function httpGetJson(url, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, json: JSON.parse(body) });
                } catch (err) {
                    reject(new Error(`Invalid JSON from ${url} (status ${res.statusCode}): ${err.message}`));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${url}`));
        });
        req.on('error', reject);
    });
}

async function rmDirWithRetries(dirPath, retries = 6) {
    for (let i = 0; i < retries; i++) {
        try {
            if (!fs.existsSync(dirPath)) return true;
            fs.rmSync(dirPath, { recursive: true, force: true });
            return true;
        } catch (_) {
            await sleep(200 * (i + 1));
        }
    }
    return !fs.existsSync(dirPath);
}

async function startIsolatedServer(opts = {}) {
    const port = opts.port || await getFreePort();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-playtest-srv-'));
    const saveDir = path.join(tmpRoot, 'saves');
    const dbDir = path.join(tmpRoot, 'db');
    const cacheDir = path.join(tmpRoot, 'cache');
    fs.mkdirSync(saveDir, { recursive: true });
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const env = {
        ...process.env,
        PORT: String(port),
        SAVE_DIR: saveDir,
        DB_DIR: dbDir,
        CACHE_DIR: cacheDir,
        MAX_CONCURRENT_GAMES: String(opts.maxConcurrentGames || 128),
        MAX_WS_PER_IP: String(opts.maxWsPerIp || 128),
        DISCONNECT_GRACE_PERIOD_MS: String(opts.disconnectGraceMs || 5000),
        SETUP_GRACE_PERIOD_MS: String(opts.setupGraceMs || 3000),
        SAVES_CACHE_TTL_MS: '0',
        TTS_RPM: '600',
        TTS_RPD: '5000',
        GLOBAL_TTS_RPM: '1200',
        GLOBAL_TTS_RPD: '10000',
        LLM_RPM: '600',
        LLM_RPD: '5000',
        UPLOAD_RPM: '200',
        SYNC_RPM: '600',
        ENABLE_RECORDING_UPLOAD: '0'
    };

    const stdoutTail = [];
    const stderrTail = [];
    const pushLine = (buf, line) => {
        if (!line) return;
        buf.push(line);
        if (buf.length > 200) buf.shift();
    };

    const child = spawn(process.execPath, [path.join(REPO_ROOT, 'server/src/server.js')], {
        cwd: REPO_ROOT,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
        for (const l of chunk.split(/\r?\n/)) pushLine(stdoutTail, l);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
        for (const l of chunk.split(/\r?\n/)) pushLine(stderrTail, l);
    });

    let exited = false;
    let exitInfo = null;
    child.on('exit', (code, signal) => {
        exited = true;
        exitInfo = { code, signal };
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const deadline = Date.now() + (opts.bootTimeoutMs || 20000);
    let ready = false;
    let lastErr = null;

    while (Date.now() < deadline) {
        if (exited) {
            await rmDirWithRetries(tmpRoot);
            throw new Error(`Playtest server exited prematurely (${JSON.stringify(exitInfo)}): ${stderrTail.slice(-10).join(' | ')}`);
        }
        try {
            const res = await httpGetJson(`${baseUrl}/health`, 1500);
            if (res.statusCode === 200 && res.json && res.json.status === 'ok') {
                ready = true;
                break;
            }
        } catch (err) {
            lastErr = err;
        }
        await sleep(250);
    }

    if (!ready) {
        try { child.kill(); } catch (_) {}
        await rmDirWithRetries(tmpRoot);
        throw new Error(`Playtest server failed to reach /health ok: ${lastErr ? lastErr.message : 'timeout'}`);
    }

    async function getHealth() {
        const res = await httpGetJson(`${baseUrl}/health`, 2000);
        return res.json;
    }

    async function assertZeroSessions(timeoutMs = 7000) {
        const end = Date.now() + timeoutMs;
        let last = null;
        while (Date.now() < end) {
            try {
                last = await getHealth();
                if (last && last.activeSessions === 0) return last;
            } catch (_) {}
            await sleep(250);
        }
        throw new Error(`Expected activeSessions === 0 within ${timeoutMs}ms, got ${last ? last.activeSessions : 'unknown'}`);
    }

    async function stop() {
        if (!exited) {
            try { child.kill('SIGTERM'); } catch (_) {}
            const waitEnd = Date.now() + 3000;
            while (!exited && Date.now() < waitEnd) await sleep(100);
            if (!exited) {
                try { child.kill('SIGKILL'); } catch (_) {}
                await sleep(250);
            }
        }
        await rmDirWithRetries(tmpRoot);
    }

    return {
        port,
        baseUrl,
        wsUrl,
        tmpRoot,
        saveDir,
        dbDir,
        cacheDir,
        getHealth,
        assertZeroSessions,
        getLogs: () => ({ stdout: stdoutTail.slice(), stderr: stderrTail.slice() }),
        stop
    };
}

module.exports = {
    getFreePort,
    httpGetJson,
    startIsolatedServer,
    sleep
};

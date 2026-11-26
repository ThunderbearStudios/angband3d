'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const WebSocket = require(path.resolve(__dirname, '../../server/node_modules/ws'));
const SC = require(path.resolve(__dirname, '../../server/public/js/screen-context.js'));

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'engine-manifest.json'), 'utf8'));

let _sjisDecoder = null;
try {
    _sjisDecoder = new TextDecoder('shift_jis');
} catch (_) {
    try { _sjisDecoder = new TextDecoder('shift-jis'); } catch (_) {}
}

function decodeSjisIfNeeded(str, realm, lang) {
    if (!str) return '';
    const r = String(realm || '').toLowerCase();
    if (r !== 'hengband' && lang !== 'jp') return str;
    if (SC && typeof SC.decodeSjis === 'function' && _sjisDecoder) {
        return SC.decodeSjis(str, _sjisDecoder);
    }
    return str;
}

function cloneObj(o) {
    return o ? JSON.parse(JSON.stringify(o)) : o;
}

function applyDeltaChannel(prevChannel, incoming) {
    if (!incoming) return prevChannel || null;
    if (!incoming.delta || !prevChannel || !Array.isArray(prevChannel.rows)) {
        return cloneObj(incoming);
    }
    const merged = cloneObj(incoming);
    delete merged.delta;
    const rows = prevChannel.rows.map((r) => ({ ...r }));
    for (const patch of (incoming.rows || [])) {
        if (typeof patch.y === 'number' && patch.y >= 0 && patch.y < rows.length) {
            const cleanPatch = { ...patch };
            delete cleanPatch.y;
            rows[patch.y] = cleanPatch;
        }
    }
    merged.rows = rows;
    return merged;
}

class BaseEngineDriver {
    constructor({ realm, lang = 'en', transport = 'ws', seed = null }) {
        this.realm = String(realm || 'angband').toLowerCase();
        this.lang = lang || 'en';
        this.transport = transport;
        this.seed = seed;
        this.hello = null;
        this.features = [];
        this.commands = null;
        this.spells = null;
        this.frame = null;
        this.lastFullMap = null;
        this.lastFullTerm = null;
        this.rawFrame = null;
        this.ownerToken = null;
        this.seq = 0;
        this.closed = false;
        this.closeInfo = null;
        this.sentKeys = [];
        this.recentFrames = [];
        this.stderrTail = [];
        this.errors = [];
        this._frameWaiters = [];
        this._ackWaiters = [];
        this._frameObservers = [];
        this._lastSendTs = 0;
        this._minSendIntervalMs = transport === 'ws' ? 22 : 0;
    }

    onFrame(fn) {
        if (typeof fn === 'function') this._frameObservers.push(fn);
    }

    _pushKeyHistory(cmd) {
        this.sentKeys.push({ ts: Date.now(), cmd });
        if (this.sentKeys.length > 50) this.sentKeys.shift();
    }

    _pushStderr(line) {
        if (!line) return;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 100) this.stderrTail.shift();
    }

    _handleMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') {
            this.hello = this.hello ? { ...this.hello, ...msg } : msg;
            if (msg.ownerToken) this.ownerToken = msg.ownerToken;
            return;
        }
        if (msg.t === 'owner') {
            if (msg.token) this.ownerToken = msg.token;
            return;
        }
        if (msg.t === 'features') {
            this.features = Array.isArray(msg.features) ? msg.features : [];
            return;
        }
        if (msg.t === 'commands') {
            this.commands = msg;
            return;
        }
        if (msg.t === 'spells') {
            this.spells = msg;
            return;
        }
        if (msg.t === 'ok' || msg.t === 'pong' || msg.t === 'bye' || msg.t === 'error') {
            if (msg.t === 'error') {
                this.errors.push(msg);
            }
            for (let i = this._ackWaiters.length - 1; i >= 0; i--) {
                const w = this._ackWaiters[i];
                if (!w.types || w.types.includes(msg.t)) {
                    clearTimeout(w.timer);
                    this._ackWaiters.splice(i, 1);
                    w.resolve(msg);
                }
            }
            if (msg.t === 'bye') {
                this.closeInfo = this.closeInfo || { reason: 'bye', detail: msg.detail || '' };
            }
            return;
        }
        if (msg.t === 'frame') {
            const raw = cloneObj(msg);
            this.rawFrame = raw;

            const normalized = cloneObj(msg);
            if (normalized.map) {
                normalized.map = applyDeltaChannel(this.lastFullMap, normalized.map);
                this.lastFullMap = normalized.map;
            }
            if (normalized.term) {
                normalized.term = applyDeltaChannel(this.lastFullTerm, normalized.term);
                this.lastFullTerm = normalized.term;
            }

            this.frame = normalized;
            this.seq = typeof normalized.seq === 'number' ? normalized.seq : (this.seq + 1);
            this.recentFrames.push({
                seq: this.seq,
                phase: normalized.phase,
                depth: normalized.player ? normalized.player.depth : null,
                x: normalized.player ? normalized.player.x : null,
                y: normalized.player ? normalized.player.y : null,
                hp: normalized.player ? normalized.player.hp : null,
                overlay: normalized.ui ? normalized.ui.overlay : null
            });
            if (this.recentFrames.length > 10) this.recentFrames.shift();

            for (const obs of this._frameObservers) {
                try { obs(normalized, raw, this); } catch (_) {}
            }

            for (let i = this._frameWaiters.length - 1; i >= 0; i--) {
                const w = this._frameWaiters[i];
                if (this.seq > w.afterSeq) {
                    clearTimeout(w.timer);
                    this._frameWaiters.splice(i, 1);
                    w.resolve(normalized);
                }
            }
        }
    }

    _rejectAllWaiters(err) {
        while (this._frameWaiters.length) {
            const w = this._frameWaiters.pop();
            clearTimeout(w.timer);
            w.reject(err);
        }
        while (this._ackWaiters.length) {
            const w = this._ackWaiters.pop();
            clearTimeout(w.timer);
            w.reject(err);
        }
    }

    waitForFrame(afterSeq = -1, timeoutMs = 10000) {
        if (this.frame && this.seq > afterSeq) {
            return Promise.resolve(this.frame);
        }
        if (this.closed) {
            return Promise.reject(new Error(`Driver closed before frame > ${afterSeq} (${JSON.stringify(this.closeInfo)})`));
        }
        return new Promise((resolve, reject) => {
            const waiter = {
                afterSeq,
                resolve,
                reject,
                timer: setTimeout(() => {
                    const idx = this._frameWaiters.indexOf(waiter);
                    if (idx !== -1) this._frameWaiters.splice(idx, 1);
                    reject(new Error(`Timeout (${timeoutMs}ms) waiting for frame > ${afterSeq} in ${this.realm}`));
                }, timeoutMs)
            };
            this._frameWaiters.push(waiter);
        });
    }

    waitForAck(types = ['ok', 'pong', 'error'], timeoutMs = 5000) {
        if (this.closed) {
            return Promise.reject(new Error(`Driver closed waiting for ack`));
        }
        return new Promise((resolve, reject) => {
            const waiter = {
                types,
                resolve,
                reject,
                timer: setTimeout(() => {
                    const idx = this._ackWaiters.indexOf(waiter);
                    if (idx !== -1) this._ackWaiters.splice(idx, 1);
                    reject(new Error(`Timeout (${timeoutMs}ms) waiting for ack ${types.join('/')} in ${this.realm}`));
                }, timeoutMs)
            };
            this._ackWaiters.push(waiter);
        });
    }

    async _paceSend() {
        if (this._minSendIntervalMs > 0 && this._lastSendTs > 0) {
            const elapsed = Date.now() - this._lastSendTs;
            if (elapsed < this._minSendIntervalMs) {
                await new Promise((r) => setTimeout(r, this._minSendIntervalMs - elapsed));
            }
        }
        this._lastSendTs = Date.now();
    }

    async sendKey(spec, timeoutMs = 8000) {
        await this._paceSend();
        const before = this.seq;
        const cmd = `key ${spec}`;
        this._pushKeyHistory(cmd);
        this._writeLine(cmd);
        return this.waitForFrame(before, timeoutMs);
    }

    async sendKeys(text, timeoutMs = 8000) {
        await this._paceSend();
        const before = this.seq;
        const cmd = `keys ${text}`;
        this._pushKeyHistory(cmd);
        this._writeLine(cmd);
        return this.waitForFrame(before, timeoutMs);
    }

    async requestFullFrame(timeoutMs = 5000) {
        const before = this.seq;
        this._writeLine('frame');
        return this.waitForFrame(before, timeoutMs);
    }

    async setDelta(enabled, timeoutMs = 5000) {
        const cmd = enabled ? 'delta on' : 'delta off';
        const p = this.waitForAck(['ok', 'error'], timeoutMs);
        this._writeLine(cmd);
        return p;
    }

    async ping(timeoutMs = 3000) {
        const p = this.waitForAck(['pong', 'error'], timeoutMs);
        this._writeLine('ping');
        return p;
    }

    decodedTermText(frame = this.frame) {
        const raw = SC.rawScreenText(frame);
        return decodeSjisIfNeeded(raw, this.realm, this.lang);
    }

    screenContains(needle, frame = this.frame) {
        const dec = this.decodedTermText(frame).toLowerCase();
        const raw = SC.rawScreenText(frame).toLowerCase();
        const n = String(needle).toLowerCase();
        return dec.includes(n) || raw.includes(n);
    }
}

async function createWsDriver(opts) {
    const realm = String(opts.realm || 'angband').toLowerCase();
    const lang = opts.lang || 'en';
    const user = opts.user || `PT_${realm.slice(0, 4)}_${Date.now().toString(36)}`;
    const params = new URLSearchParams();
    params.set('realm', realm);
    params.set('user', user);
    if (opts.save) params.set('save', String(opts.save));
    params.set('lang', lang);
    params.set('new', opts.isNew === false ? '0' : '1');
    if (opts.custom) params.set('custom', '1');
    if (opts.random) params.set('random', '1');
    if (opts.review) params.set('review', '1');
    if (opts.seed !== undefined && opts.seed !== null) params.set('seed', String(opts.seed));
    if (opts.bp) params.set('bp', String(opts.bp));

    const url = `${opts.wsUrl}?${params.toString()}`;
    const driver = new BaseEngineDriver({ realm, lang, transport: 'ws', seed: opts.seed });
    driver.user = user;
    driver.url = url;

    const wsHeaders = opts.ownerToken ? { 'X-Owner-Token': String(opts.ownerToken) } : undefined;
    const ws = new WebSocket(url, wsHeaders ? { headers: wsHeaders } : undefined);
    driver._writeLine = (line) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(line);
        } else {
            throw new Error(`WebSocket not open (state=${ws.readyState}) when sending ${line}`);
        }
    };

    let settledOpen = false;
    await new Promise((resolve, reject) => {
        const openTimer = setTimeout(() => {
            if (!settledOpen) {
                settledOpen = true;
                try { ws.close(); } catch (_) {}
                reject(new Error(`WebSocket connect timeout for ${realm}`));
            }
        }, opts.connectTimeoutMs || 15000);

        ws.on('open', () => {
            if (!settledOpen) {
                settledOpen = true;
                clearTimeout(openTimer);
                resolve();
            }
        });
        ws.on('error', (err) => {
            driver.errors.push({ t: 'ws_error', message: err.message });
            if (!settledOpen) {
                settledOpen = true;
                clearTimeout(openTimer);
                reject(err);
            }
        });
        ws.on('message', (data) => {
            const rawStr = data.toString('utf8');
            for (const line of rawStr.split(/\r?\n/)) {
                if (!line.trim()) continue;
                try {
                    driver._handleMessage(JSON.parse(line));
                } catch (err) {
                    driver.errors.push({ t: 'json_parse_error', message: err.message, sample: line.slice(0, 120) });
                }
            }
        });
        ws.on('close', (code, reasonBuf) => {
            driver.closed = true;
            driver.closeInfo = { code, reason: reasonBuf ? reasonBuf.toString('utf8') : '' };
            driver._rejectAllWaiters(new Error(`WS closed (${code}: ${driver.closeInfo.reason})`));
        });
    });

    driver.close = async () => {
        if (!driver.closed && ws.readyState === WebSocket.OPEN) {
            try { ws.send('quit'); } catch (_) {}
            await new Promise((r) => setTimeout(r, 120));
            try { ws.close(); } catch (_) {}
        }
        driver.closed = true;
    };

    if (opts.waitInitialFrame !== false) {
        await driver.waitForFrame(0, opts.timeoutMs || 15000);
    }
    return driver;
}

async function createStdioDriver(opts) {
    const realm = String(opts.realm || 'angband').toLowerCase();
    const def = MANIFEST.realms && MANIFEST.realms[realm];
    if (!def) throw new Error(`Unknown realm in manifest: ${realm}`);

    const isWin = process.platform === 'win32';
    const relBin = isWin ? def.binary?.win_x64 : def.binary?.linux_x64;
    const binPath = path.resolve(REPO_ROOT, relBin);
    if (!fs.existsSync(binPath)) {
        throw new Error(`Engine binary missing for ${realm}: ${binPath}`);
    }

    const isJsBridge = binPath.endsWith('.js');
    const args = [];
    if (isJsBridge) args.push(binPath);
    args.push(def.cli?.frontend_switch || '-mbridge');
    const user = opts.user || `PT_${realm.slice(0, 4)}`;
    if (def.cli?.save_token_format) {
        args.push(def.cli.save_token_format.replace('{name}', user));
    }
    if (opts.saveDir && def.cli?.save_dir_switch) {
        args.push(def.cli.save_dir_switch.replace('{path}', opts.saveDir));
    }
    if (opts.isNew !== false) {
        args.push(def.cli?.new_char_switch || '-n');
    }
    if (opts.custom && isJsBridge) args.push('-c');
    if (opts.random && isJsBridge) args.push('-r');
    if (opts.seed !== undefined && opts.seed !== null) {
        if (!isJsBridge && realm !== 'hengband') args.push('--');
        args.push(`--seed=${opts.seed}`);
    }

    const env = { ...process.env };
    if (def.cli && def.cli.env_vars) {
        for (const [k, v] of Object.entries(def.cli.env_vars)) {
            env[k] = path.resolve(REPO_ROOT, v);
        }
    }
    if (opts.seed !== undefined && opts.seed !== null) {
        env.YASD_SEED = String(opts.seed);
    }

    let cwd = path.dirname(binPath);
    if (!fs.existsSync(path.join(cwd, 'lib')) && fs.existsSync(path.join(cwd, '..', 'lib'))) {
        cwd = path.resolve(cwd, '..');
    }

    const proc = spawn(isJsBridge ? process.execPath : binPath, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });

    const driver = new BaseEngineDriver({ realm, lang: opts.lang || 'en', transport: 'stdio', seed: opts.seed });
    driver.user = user;
    driver.proc = proc;

    driver._writeLine = (line) => {
        if (driver.closed || !proc.stdin || !proc.stdin.writable) {
            throw new Error(`Stdio process closed when sending ${line}`);
        }
        proc.stdin.write(line + '\n');
    };

    const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
        if (!line.trim()) return;
        try {
            driver._handleMessage(JSON.parse(line));
        } catch (err) {
            driver.errors.push({ t: 'json_parse_error', message: err.message, sample: line.slice(0, 120) });
        }
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
        for (const l of chunk.split(/\r?\n/)) driver._pushStderr(l);
    });

    proc.on('exit', (code, signal) => {
        driver.closed = true;
        driver.closeInfo = { code, signal };
        driver._rejectAllWaiters(new Error(`Stdio exited (code=${code}, signal=${signal})`));
    });

    driver.close = async () => {
        if (!driver.closed) {
            try { proc.stdin.write('quit\n'); } catch (_) {}
            await new Promise((r) => setTimeout(r, 120));
            if (!driver.closed) {
                try { proc.kill(); } catch (_) {}
            }
        }
        try { rl.close(); } catch (_) {}
        driver.closed = true;
    };

    if (opts.waitInitialFrame !== false) {
        await driver.waitForFrame(0, opts.timeoutMs || 15000);
    }
    return driver;
}

module.exports = {
    MANIFEST,
    decodeSjisIfNeeded,
    applyDeltaChannel,
    createWsDriver,
    createStdioDriver
};

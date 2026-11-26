'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const WebSocket = require(path.resolve(__dirname, '../../../server/node_modules/ws'));
const { BROWSER_PROBE_SCRIPT } = require('./browser_probe');
const { getFreePort } = require('../server_manager');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const NAMED_KEYS = {
    enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    return: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
    esc: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
    tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
    space: { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 },
    backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },
    up: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
    down: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
    left: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
    right: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
    home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36, nativeVirtualKeyCode: 36 },
    end: { key: 'End', code: 'End', windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35 },
    pageup: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33, nativeVirtualKeyCode: 33 },
    pagedown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34 }
};

function resolveKeyDescriptor(spec) {
    let raw = String(spec || '');
    let modifiers = 0; // 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
    if (raw.startsWith('Alt+')) {
        modifiers |= 1;
        raw = raw.slice(4);
    } else if (raw.startsWith('C-') || raw.startsWith('Ctrl+')) {
        modifiers |= 2;
        raw = raw.startsWith('C-') ? raw.slice(2) : raw.slice(5);
    }

    const lower = raw.toLowerCase();
    if (NAMED_KEYS[lower]) {
        return { ...NAMED_KEYS[lower], modifiers };
    }
    if (raw.length === 1) {
        const codeNum = raw.toUpperCase().charCodeAt(0);
        const isUpper = raw >= 'A' && raw <= 'Z';
        const isShiftedSymbol = '~!@#$%^&*()_+{}|:"<>?'.includes(raw);
        if ((isUpper || isShiftedSymbol) && modifiers === 0) modifiers |= 8;
        const domCode = /^[a-zA-Z]$/.test(raw)
            ? `Key${raw.toUpperCase()}`
            : (/^[0-9]$/.test(raw) ? `Digit${raw}` : '');
        return {
            key: raw,
            code: domCode,
            text: (modifiers & 2) ? '' : raw,
            windowsVirtualKeyCode: codeNum,
            nativeVirtualKeyCode: codeNum,
            modifiers
        };
    }
    return { key: raw, code: '', text: raw, modifiers };
}

async function openBrowserSession(targetUrl, opts = {}) {
    if (!fs.existsSync(CHROME_PATH)) {
        throw new Error(`Chrome executable not found at ${CHROME_PATH}`);
    }
    const port = await getFreePort();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-playtest-chrome-'));

    const chromeArgs = [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--use-gl=angle',
        '--use-angle=d3d11',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-precise-memory-info',
        '--disable-gpu-shader-disk-cache',
        `--window-size=${opts.width || 1280},${opts.height || 800}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        '--autoplay-policy=no-user-gesture-required',
        `--user-data-dir=${tempDir}`,
        'about:blank'
    ];

    const chrome = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore', windowsHide: true });

    let ws = null;
    const networkErrors = [];
    const runtimeExceptions = [];

    try {
        let target = null;
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            await sleep(250);
            try {
                const res = await fetch(`http://127.0.0.1:${port}/json/list`);
                if (res.ok) {
                    const list = await res.json();
                    target = list.find((t) => t.type === 'page') || list[0];
                    if (target && target.webSocketDebuggerUrl) break;
                }
            } catch (_) {}
        }
        if (!target) throw new Error('Timed out waiting for Chrome DevTools target');

        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
        });

        let msgId = 1;
        const pending = new Map();
        const urlByReq = new Map();

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString('utf8'));
            if (msg.id && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                else resolve(msg.result);
                return;
            }
            if (msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params?.exceptionDetails || {};
                runtimeExceptions.push(`${d.text || 'Exception'} @ ${d.url || ''}:${d.lineNumber || 0}`);
            } else if (msg.method === 'Network.requestWillBeSent') {
                urlByReq.set(msg.params.requestId, msg.params.request?.url || '');
            } else if (msg.method === 'Network.responseReceived') {
                const resp = msg.params?.response;
                if (resp && resp.status >= 400) {
                    networkErrors.push({ url: resp.url, status: resp.status });
                }
            } else if (msg.method === 'Network.loadingFailed') {
                const reqUrl = urlByReq.get(msg.params?.requestId) || '';
                if (!msg.params?.canceled) {
                    networkErrors.push({ url: reqUrl, status: 0, errorText: msg.params?.errorText || 'loadingFailed' });
                }
            }
        });

        function send(method, params = {}) {
            return new Promise((resolve, reject) => {
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    reject(new Error('CDP WebSocket closed'));
                    return;
                }
                const id = msgId++;
                pending.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        async function evaluate(expression) {
            const r = await send('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true
            });
            if (r && r.exceptionDetails) {
                throw new Error(`Evaluate exception: ${r.exceptionDetails.text || JSON.stringify(r.exceptionDetails)}`);
            }
            return r && r.result ? r.result.value : null;
        }

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Network.enable');
        await send('Page.addScriptToEvaluateOnNewDocument', { source: BROWSER_PROBE_SCRIPT });

        if (opts.mobile) {
            await send('Emulation.setDeviceMetricsOverride', {
                width: opts.width || 390,
                height: opts.height || 844,
                deviceScaleFactor: 2,
                mobile: true
            });
        }

        await send('Page.navigate', { url: targetUrl });

        async function pressKey(spec) {
            const desc = resolveKeyDescriptor(spec);
            const base = {
                key: desc.key,
                code: desc.code || undefined,
                windowsVirtualKeyCode: desc.windowsVirtualKeyCode || undefined,
                nativeVirtualKeyCode: desc.nativeVirtualKeyCode || undefined,
                modifiers: desc.modifiers || 0
            };
            await send('Input.dispatchKeyEvent', { ...base, type: desc.text ? 'keyDown' : 'rawKeyDown' });
            if (desc.text) {
                await send('Input.dispatchKeyEvent', { ...base, type: 'char', text: desc.text, unmodifiedText: desc.text });
            }
            await send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
        }

        async function typeText(text) {
            for (const ch of String(text || '')) {
                await pressKey(ch);
            }
        }

        async function clickSelector(selector) {
            const hit = await evaluate(`(() => {
                const el = document.querySelector(${JSON.stringify(selector)});
                if (!el) return { found: false };
                el.scrollIntoView({ block: 'center', inline: 'center' });
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return { found: true, zeroSize: true };
                const cx = Math.round(r.left + r.width / 2);
                const cy = Math.round(r.top + r.height / 2);
                const topEl = document.elementFromPoint(cx, cy);
                const ok = Boolean(topEl && (topEl === el || el.contains(topEl)));
                return {
                    found: true,
                    cx,
                    cy,
                    occluded: !ok,
                    topElDesc: topEl ? (topEl.tagName + '#' + (topEl.id || '') + '.' + (topEl.className || '')) : 'null'
                };
            })()`);

            if (!hit || !hit.found) return { ok: false, code: 'NOT_FOUND', selector };
            if (hit.zeroSize) return { ok: false, code: 'ZERO_SIZE', selector };
            if (hit.occluded) return { ok: false, code: 'P1_UI_OCCLUDED', selector, topElDesc: hit.topElDesc };

            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.cx, y: hit.cy });
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.cx, y: hit.cy, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.cx, y: hit.cy, button: 'left', clickCount: 1 });
            return { ok: true, cx: hit.cx, cy: hit.cy };
        }

        async function waitFrameAdvance(prevSeq, timeoutMs = 8000) {
            return evaluate(`window.__PLAYTEST_WAIT_FRAME__(${Number(prevSeq) || 0}, ${Number(timeoutMs) || 8000})`);
        }

        async function snapshot() {
            const snap = await evaluate(`window.__PLAYTEST_SNAPSHOT__ ? window.__PLAYTEST_SNAPSHOT__() : null`);
            if (snap) {
                snap.cdpNetworkErrors = networkErrors.slice();
                snap.cdpRuntimeExceptions = runtimeExceptions.slice();
            }
            return snap;
        }

        async function resetTurnCounters() {
            await evaluate(`window.__PLAYTEST_RESET_MUTATIONS__ && window.__PLAYTEST_RESET_MUTATIONS__()`);
        }

        async function reloadPage() {
            await send('Page.reload', { ignoreCache: false });
        }

        async function capturePng(outPath) {
            const cap = await send('Page.captureScreenshot', { format: 'png' });
            if (cap && cap.data) {
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, Buffer.from(cap.data, 'base64'));
                return outPath;
            }
            return null;
        }

        async function sampleViewportPng(outPath = null) {
            const cap = await send('Page.captureScreenshot', { format: 'png' });
            if (!cap || !cap.data) return null;
            const buf = Buffer.from(cap.data, 'base64');
            if (outPath) {
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, buf);
            }
            const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
            // Parse IDAT chunks and sample decompressed pixel bytes to detect solid black renders
            let nonZeroCount = 0;
            let sampleCount = 0;
            try {
                const idatChunks = [];
                let off = 8;
                while (off + 8 <= buf.length) {
                    const len = buf.readUInt32BE(off);
                    const typ = buf.toString('ascii', off + 4, off + 8);
                    if (typ === 'IDAT' && off + 8 + len <= buf.length) {
                        idatChunks.push(buf.subarray(off + 8, off + 8 + len));
                    }
                    off += 12 + len;
                    if (typ === 'IEND') break;
                }
                if (idatChunks.length > 0) {
                    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
                    const stride = Math.max(1, Math.floor(raw.length / 400));
                    for (let i = 0; i < raw.length; i += stride) {
                        sampleCount++;
                        if (raw[i] > 8 && raw[i] < 255) nonZeroCount++;
                    }
                }
            } catch (_) {}
            return { hash, bytes: buf.length, nonZeroCount, sampleCount };
        }

        async function close() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.close(); } catch (_) {}
            }
            try { chrome.kill(); } catch (_) {}
            await sleep(400);
            for (let i = 0; i < 6; i++) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    break;
                } catch (_) {
                    await sleep(250 * (i + 1));
                }
            }
        }

        return {
            port,
            send,
            evaluate,
            pressKey,
            typeText,
            clickSelector,
            waitFrameAdvance,
            snapshot,
            resetTurnCounters,
            reloadPage,
            capturePng,
            sampleViewportPng,
            setViewport: (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', {
                width, height, deviceScaleFactor: mobile ? 2 : 1, mobile
            }),
            getNetworkErrors: () => networkErrors.slice(),
            getRuntimeExceptions: () => runtimeExceptions.slice(),
            close
        };
    } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) try { ws.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        await sleep(300);
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        throw err;
    }
}

module.exports = {
    openBrowserSession,
    resolveKeyDescriptor,
    CHROME_PATH
};

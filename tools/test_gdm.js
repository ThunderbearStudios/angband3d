const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_gdm_test_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9233',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    '--enable-usermedia-screen-capturing',
    '--auto-select-desktop-capture-source=Entire Screen',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_combat'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9233/json/list', r => {
                    let d = '';
                    r.on('data', c => d += c);
                    r.on('end', () => res(JSON.parse(d)));
                }).on('error', rej);
            });
            const page = list.find(p => p.type === 'page');
            if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch (_) {}
    }
    throw new Error('CDP target not found');
}

(async () => {
    const wsUrl = await getWs();
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const curId = id++;
            const handler = msg => {
                const data = JSON.parse(msg);
                if (data.id === curId) {
                    ws.off('message', handler);
                    if (data.error) reject(data.error);
                    else resolve(data.result);
                }
            };
            ws.on('message', handler);
            ws.send(JSON.stringify({ id: curId, method, params }));
        });
    }

    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 2000));

    const res = await send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async () => {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                const tracks = stream.getVideoTracks();
                return { success: true, trackCount: tracks.length, label: tracks[0] ? tracks[0].label : null };
            } catch (err) {
                return { success: false, error: err.message };
            }
        })()`
    });

    console.log('getDisplayMedia result:', res.result.value);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
    process.exit(1);
});

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_sc_test_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9232',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--window-size=1920,1080',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_combat'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9232/json/list', r => {
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

    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 3000));

    let frameCount = 0;
    const start = Date.now();

    ws.on('message', msg => {
        const data = JSON.parse(msg);
        if (data.method === 'Page.screencastFrame') {
            frameCount++;
            // Acknowledge frame
            ws.send(JSON.stringify({
                id: id++,
                method: 'Page.screencastFrameAck',
                params: { sessionId: data.params.sessionId }
            }));
        }
    });

    await send('Page.startScreencast', {
        format: 'jpeg',
        quality: 90,
        maxWidth: 1920,
        maxHeight: 1080,
        everyNthFrame: 1
    });

    await new Promise(r => setTimeout(r, 4000));

    await send('Page.stopScreencast');
    const elapsed = (Date.now() - start) / 1000;
    const fps = (frameCount / elapsed).toFixed(1);
    console.log(`Screencast captured ${frameCount} frames in ${elapsed.toFixed(1)}s (~${fps} FPS)`);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
    process.exit(1);
});

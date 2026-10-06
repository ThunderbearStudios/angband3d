const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_stealth_face_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9231',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_stealth'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9231/json/list', r => {
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
    await send('Page.enable');
    await new Promise(r => setTimeout(r, 3500));

    // Turn camera North (0) down dark corridor towards the monster
    await send('Runtime.evaluate', {
        expression: `(() => {
            if (window.dungeon) {
                window.dungeon.cameraYaw = 0; // Face North
            }
            if (window.__app && window.__app.network) {
                window.__app.network.sendKey('up');
            }
        })()`
    });

    await new Promise(r => setTimeout(r, 1200));

    const scr = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_stealth_facing_north.png');
    require('fs').writeFileSync(scrPath, Buffer.from(scr.data, 'base64'));
    console.log('Saved screenshot facing north in stealth to:', scrPath);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
    process.exit(1);
});

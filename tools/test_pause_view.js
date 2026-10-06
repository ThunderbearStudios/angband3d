const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_pause_test_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9237',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_combat'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9237/json/list', r => {
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

    // Open actual pause menu facing the pillared vault
    await send('Runtime.evaluate', {
        expression: `(() => {
            const d = window.dungeon || (window.__app ? window.__app.dungeon : null);
            if (d) d.cameraYaw = Math.PI;
            if (window.__app && window.__app.showPauseMenu) {
                window.__app.showPauseMenu();
            } else {
                const p = document.getElementById('pause-modal');
                if (p) p.classList.remove('hidden');
            }
        })()`
    });

    await new Promise(r => setTimeout(r, 800));

    const scr = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_pause_actual.png');
    fs.writeFileSync(scrPath, Buffer.from(scr.data, 'base64'));
    console.log('Saved actual Pause Menu screenshot to:', scrPath);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(e => { console.error(e); proc.kill(); process.exit(1); });

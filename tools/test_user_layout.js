const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_layout_test_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9277',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_town'
], { stdio: 'ignore' });

async function run() {
    await new Promise(r => setTimeout(r, 3500));
    const list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9277/json/list', r => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
    });
    const page = list.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
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
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false
    });

    // Apply exact requested layout to DOM
    await send('Runtime.evaluate', {
        expression: `(() => {
            // 1. Minimap Container
            const mapWin = document.getElementById('minimap-container');
            if (mapWin) {
                mapWin.style.display = 'flex';
                mapWin.style.position = 'absolute';
                mapWin.style.top = '38px';
                mapWin.style.left = '8px';
                mapWin.style.width = '195px';
                mapWin.style.height = '235px';
            }

            // 2. Message Feed Window
            const msgWin = document.getElementById('message-feed-window');
            if (msgWin) {
                msgWin.style.display = 'flex';
                msgWin.style.position = 'absolute';
                msgWin.style.top = '38px';
                msgWin.style.left = '212px';
                msgWin.style.width = '580px';
                msgWin.style.height = '180px';
            }

            // 3. The Living Chronicle Window (Right Dock)
            const chronicleWin = document.getElementById('chronicle-window');
            if (chronicleWin) {
                chronicleWin.style.display = 'flex';
                chronicleWin.classList.add('active');
                chronicleWin.style.position = 'absolute';
                chronicleWin.style.top = '38px';
                chronicleWin.style.right = '8px';
                chronicleWin.style.left = 'auto';
                chronicleWin.style.width = '380px';
                chronicleWin.style.height = 'calc(1080px - 46px)';
                chronicleWin.style.zIndex = '10';
            }

            const tomeBtn = document.getElementById('btn-toggle-chronicle');
            if (tomeBtn) tomeBtn.classList.add('active');

            // 4. Character Panel & Action Bar & D-Pad
            const charPanel = document.getElementById('char-panel');
            if (charPanel) charPanel.style.display = 'flex';
            const actionBar = document.getElementById('action-bar');
            if (actionBar) actionBar.style.display = 'flex';
            const touchControls = document.getElementById('touch-controls');
            if (touchControls) touchControls.style.display = 'flex';

            // Face citizen in town
            const d = window.dungeon || (window.__app ? window.__app.dungeon : null);
            if (d) d.cameraYaw = Math.PI * 0.75;
        })()`
    });

    await new Promise(r => setTimeout(r, 1000));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(__dirname, 'test_user_layout.png');
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshot to ${outPath}`);

    ws.close();
    proc.kill();
}

run().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
});

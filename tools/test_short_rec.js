const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_short_rec_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9255',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    '--headless=new',
    '--enable-usermedia-screen-capturing',
    '--auto-select-desktop-capture-source=Entire screen',
    '--use-fake-ui-for-media-stream',
    '--allow-http-screen-capture',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?record_walkthrough=1'
], { stdio: 'ignore' });

async function run() {
    await new Promise(r => setTimeout(r, 2000));
    const list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9255/json/list', r => {
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

    ws.on('message', m => {
        try {
            const d = JSON.parse(m);
            if (d.method === 'Runtime.consoleAPICalled') {
                const text = d.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
                if (text.includes('[Recorder]') || text.includes('[Angband3D]')) {
                    console.log(`[Browser Console] ${text}`);
                }
            }
        } catch (_) {}
    });

    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false
    });

    // Wait 12 seconds
    await new Promise(r => setTimeout(r, 12000));

    ws.close();
    proc.kill();
}

run().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
});

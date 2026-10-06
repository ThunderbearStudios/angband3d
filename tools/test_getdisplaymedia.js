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
    '--headless=new',
    '--window-size=1920,1080',
    '--enable-usermedia-screen-capturing',
    '--auto-select-desktop-capture-source=Entire screen',
    '--use-fake-ui-for-media-stream',
    '--allow-http-screen-capture',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/'
], { stdio: 'ignore' });

async function run() {
    await new Promise(r => setTimeout(r, 2000));
    const list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9233/json/list', r => {
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

    await send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false
    });

    const result = await send('Runtime.evaluate', {
        expression: `
            navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include'
            })
                .then(stream => {
                    const track = stream.getVideoTracks()[0];
                    return { success: true, label: track.label, settings: track.getSettings() };
                })
                .catch(err => ({ success: false, error: err.name + ': ' + err.message }))
        `,
        awaitPromise: true,
        returnByValue: true
    });

    console.log('Result:', JSON.stringify(result.result.value, null, 2));
    ws.close();
    proc.kill();
}

run().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
});

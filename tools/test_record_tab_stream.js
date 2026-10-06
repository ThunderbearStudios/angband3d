const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_tab_rec_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9234',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--window-size=1920,1080',
    '--enable-usermedia-screen-capturing',
    '--auto-select-desktop-capture-source=Entire screen',
    '--use-fake-ui-for-media-stream',
    '--allow-http-screen-capture',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_combat'
], { stdio: 'ignore' });

async function run() {
    await new Promise(r => setTimeout(r, 2500));
    const list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9234/json/list', r => {
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

    console.log('Starting tab recording inside Chrome...');
    const recordResult = await send('Runtime.evaluate', {
        expression: `
            (async () => {
                window._chunks = [];
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: 'browser',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    },
                    audio: false,
                    preferCurrentTab: true,
                    selfBrowserSurface: 'include'
                });
                const mr = new MediaRecorder(stream, {
                    mimeType: 'video/webm;codecs=vp9',
                    videoBitsPerSecond: 6000000
                });
                mr.ondataavailable = e => {
                    if (e.data && e.data.size > 0) window._chunks.push(e.data);
                };
                window._mr = mr;
                mr.start(500);
                return { started: true };
            })()
        `,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Record result:', recordResult.result.value);

    // Let it record for 5 seconds
    await new Promise(r => setTimeout(r, 5000));

    console.log('Stopping recorder and retrieving blob...');
    const stopResult = await send('Runtime.evaluate', {
        expression: `
            (async () => {
                return new Promise(resolve => {
                    window._mr.onstop = async () => {
                        const blob = new Blob(window._chunks, { type: 'video/webm;codecs=vp9' });
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            resolve({ size: blob.size, dataUrl: reader.result });
                        };
                        reader.readAsDataURL(blob);
                    };
                    window._mr.stop();
                });
            })()
        `,
        awaitPromise: true,
        returnByValue: true
    });

    const dataUrl = stopResult.result.value.dataUrl;
    const base64Data = dataUrl.replace(/^data:video\/webm;codecs=vp9;base64,/, '');
    const outPath = path.join(__dirname, 'test_tab_capture.webm');
    fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
    console.log(`Saved ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

    ws.close();
    proc.kill();
}

run().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
});

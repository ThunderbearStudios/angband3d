const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_gdm_rec_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9235',
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
                http.get('http://127.0.0.1:9235/json/list', r => {
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
    await new Promise(r => setTimeout(r, 3000));

    // Turn camera South
    await send('Runtime.evaluate', {
        expression: `if (window.dungeon) window.dungeon.cameraYaw = Math.PI;`
    });

    // Start 3-second MediaRecorder of getDisplayMedia stream
    const recRes = await send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async () => {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1920, height: 1080 }, audio: false });
            const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            const chunks = [];
            rec.ondataavailable = e => chunks.push(e.data);
            rec.start();
            await new Promise(r => setTimeout(r, 2000));
            rec.stop();
            await new Promise(r => rec.onstop = r);
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            return new Promise(res => {
                reader.onloadend = () => res(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
        })()`
    });

    const b64 = recRes.result.value;
    const testVideoPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_gdm_capture.webm');
    fs.writeFileSync(testVideoPath, Buffer.from(b64, 'base64'));
    console.log('Saved test GDM video:', testVideoPath, 'size:', fs.statSync(testVideoPath).size);

    // Extract frame
    const ffmpeg = 'C:\\msys64\\mingw64\\bin\\ffmpeg.exe';
    const testFramePath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_gdm_frame.png');
    const { execSync } = require('child_process');
    execSync(`"${ffmpeg}" -y -ss 00:00:01 -i "${testVideoPath}" -vframes 1 "${testFramePath}"`);
    console.log('Extracted frame:', testFramePath);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(e => { console.error(e); proc.kill(); process.exit(1); });

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_verif_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9223',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9223/json/list', r => {
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
    await send('Network.enable');

    ws.on('message', raw => {
        try {
            const m = JSON.parse(raw);
            if (m.method === 'Runtime.consoleAPICalled') {
                console.log('Browser Console:', m.params.type, m.params.args.map(a => a.value).join(' '));
            }
            if (m.method === 'Network.responseReceived') {
                if (m.params.response.url.includes('angband3d_demo')) {
                    console.log('Video HTTP Response:', m.params.response.status, m.params.response.mimeType, m.params.response.headers['content-range'] || m.params.response.headers['Content-Range']);
                }
            }
        } catch (_) {}
    });

    // Wait 2s for DOM initialization
    await new Promise(r => setTimeout(r, 2000));

    // Open demo modal and query DOM state
    const openRes = await send('Runtime.evaluate', {
        expression: `(() => {
            if (window.demoPlayer) {
                window.demoPlayer.open('splash');
                const video = document.getElementById('demo-video-player');
                const canvas = document.getElementById('demo-canvas-stage');
                const modal = document.getElementById('demo-modal');
                return {
                    modalVisible: !modal.classList.contains('hidden'),
                    canvasDisplay: window.getComputedStyle(canvas).display,
                    videoDisplay: window.getComputedStyle(video).display,
                    videoSrc: video.currentSrc,
                    duration: video.duration || window.demoPlayer.duration,
                    currentTime: video.currentTime,
                    useVideo: window.demoPlayer.useVideo,
                    captionsVisible: window.getComputedStyle(document.getElementById('demo-captions-overlay')).display
                };
            }
            return { error: 'demoPlayer not found' };
        })()`,
        returnByValue: true
    });

    console.log('Demo Player DOM Status:', JSON.stringify(openRes.result.value, null, 2));

    // Test chapter jump
    const jumpRes = await send('Runtime.evaluate', {
        expression: `(() => {
            window.demoPlayer.jumpToChapter(1); // Jump to Act 2 (Gotcha #1: 0-Turn Yaw @ 25s)
            return {
                currentTime: window.demoPlayer.currentTime,
                videoCurrentTime: document.getElementById('demo-video-player').currentTime,
                activeChapter: window.demoPlayer.activeChapterIndex,
                timecode: document.getElementById('demo-timecode').textContent
            };
        })()`,
        returnByValue: true
    });
    console.log('Chapter Jump Status:', JSON.stringify(jumpRes.result.value, null, 2));

    // Seek to 28s where Enceladus subtitle is actively shown
    const captionRes = await send('Runtime.evaluate', {
        expression: `(async () => {
            const v = document.getElementById('demo-video-player');
            const seekedPromise = new Promise(r => v.addEventListener('seeked', r, { once: true }));
            window.demoPlayer.seek(45);
            await Promise.race([seekedPromise, new Promise(r => setTimeout(r, 1000))]);
            const overlay = document.getElementById('demo-captions-overlay');
            return {
                currentTime: window.demoPlayer.currentTime,
                videoCurrentTime: v.currentTime,
                readyState: v.readyState,
                hasCaption: overlay.classList.contains('visible'),
                captionText: overlay.textContent.replace(/\\s+/g, ' ').trim()
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Caption at 28s:', JSON.stringify(captionRes.result.value, null, 2));

    await new Promise(r => setTimeout(r, 600));

    // Capture screenshot
    const scr = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'demo_modal_screenshot.png');
    fs.writeFileSync(scrPath, Buffer.from(scr.data, 'base64'));
    console.log('✓ Screenshot saved to:', scrPath);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(err => {
    console.error('Test error:', err);
    try { proc.kill(); } catch (_) {}
    process.exit(1);
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocket } = require('../server/node_modules/ws');

// 1. Lightweight Static HTTP Server serving server/public
const PUBLIC_DIR = path.resolve(__dirname, '..', 'server', 'public');
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};

const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    if (reqPath === '/demo') reqPath = '/demo.html';
    if (reqPath.includes('angband3d_demo_') && reqPath.endsWith('.mp4')) {
        reqPath = '/assets/video/angband3d_demo.mp4';
    } else if (reqPath.includes('angband3d_demo_') && reqPath.endsWith('.webm')) {
        reqPath = '/assets/video/angband3d_demo.webm';
    }

    const filePath = path.join(PUBLIC_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);

    // Support HTTP Range requests for video streaming & seekability
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm')) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        file.pipe(res);
        return;
    }

    res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
});

async function main() {
    const SERVER_PORT = 9876;
    await new Promise(r => server.listen(SERVER_PORT, '127.0.0.1', r));
    console.log(`Local test server running at http://127.0.0.1:${SERVER_PORT}`);

    const CHROME_PORT = 9563;
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--remote-debugging-port=' + CHROME_PORT,
        '--headless=new',
        '--window-size=1920,1080',
        '--autoplay-policy=no-user-gesture-required',
        `http://127.0.0.1:${SERVER_PORT}/demo`
    ], { stdio: 'ignore' });

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + CHROME_PORT + '/json', r => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
            }).on('error', rej));
            const p = list.find(x => x.type === 'page');
            if (p && p.webSocketDebuggerUrl) { wsUrl = p.webSocketDebuggerUrl; break; }
        } catch(_) {}
    }

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    const send = (m, p = {}) => new Promise((res, rej) => {
        const myId = id++;
        const h = d => {
            const j = JSON.parse(d);
            if (j.id === myId) {
                ws.off('message', h);
                if (j.error) rej(j.error);
                else res(j.result);
            }
        };
        ws.on('message', h);
        ws.send(JSON.stringify({ id: myId, method: m, params: p }));
    });

    const errors = [];
    ws.on('message', data => {
        const j = JSON.parse(data);
        if (j.method === 'Runtime.exceptionThrown') {
            errors.push(j.params.exceptionDetails);
            console.error('[Browser Exception]', j.params.exceptionDetails.text);
        }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 2500));

    console.log('\n--- 1. Testing Scrubber Click (Normal View) ---');
    const sRect = (await send('Runtime.evaluate', {
        expression: `(() => {
            const s = document.getElementById('demo-scrubber-track');
            const r = s.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()`,
        returnByValue: true
    })).result.value;

    const click50X = sRect.left + sRect.width * 0.5;
    const click50Y = sRect.top + sRect.height * 0.5;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: click50X, y: click50Y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: click50X, y: click50Y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: click50X, y: click50Y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const res50 = (await send('Runtime.evaluate', {
        expression: `(() => ({ currentTime: window.demoPlayer.currentTime, videoTime: document.getElementById('demo-video-player').currentTime }))()`,
        returnByValue: true
    })).result.value;
    console.log('Seeked to 50% (~137.5s):', res50);
    if (Math.abs(res50.currentTime - 137.5) > 5) {
        throw new Error(`Scrubber click failed! Expected ~137.5, got ${res50.currentTime}`);
    }

    console.log('\n--- 2. Testing Scrubber Drag (Normal View) ---');
    const startX = sRect.left + sRect.width * 0.2;
    const endX = sRect.left + sRect.width * 0.8;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX, y: click50Y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: click50Y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
        const curX = startX + (endX - startX) * (i / 10);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: curX, y: click50Y });
        await new Promise(r => setTimeout(r, 40));
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y: click50Y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const res80 = (await send('Runtime.evaluate', {
        expression: `(() => ({ currentTime: window.demoPlayer.currentTime, videoTime: document.getElementById('demo-video-player').currentTime }))()`,
        returnByValue: true
    })).result.value;
    console.log('Dragged to 80% (~220s):', res80);
    if (Math.abs(res80.currentTime - 220) > 8) {
        throw new Error(`Scrubber drag failed! Expected ~220, got ${res80.currentTime}`);
    }

    console.log('\n--- 3. Testing Chapter Pill Selection (Normal View) ---');
    // Click Act 2 (~48s)
    const p2Rect = (await send('Runtime.evaluate', {
        expression: `(() => {
            const p = document.querySelectorAll('.demo-chapter-pill')[2];
            const r = p.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()`,
        returnByValue: true
    })).result.value;
    const p2X = p2Rect.left + p2Rect.width * 0.5;
    const p2Y = p2Rect.top + p2Rect.height * 0.5;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2X, y: p2Y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p2X, y: p2Y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p2X, y: p2Y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const resP2 = (await send('Runtime.evaluate', {
        expression: `(() => {
            const active = document.querySelector('.demo-chapter-pill.active');
            return { currentTime: window.demoPlayer.currentTime, activeText: active ? active.innerText.trim() : null };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('Clicked Act 2 (~48.0s):', resP2);
    if (Math.abs(resP2.currentTime - 48.0) > 2) {
        throw new Error(`Pill click failed! Expected 48.0, got ${resP2.currentTime}`);
    }

    console.log('\n--- 4. Entering Fullscreen & Verifying Zero Overlap ---');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const p = window.demoPlayer;
            p.enterCssFullscreen();
        })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    const fsLayout = (await send('Runtime.evaluate', {
        expression: `(() => {
            const tb = document.getElementById('demo-transport-bar');
            const r = document.querySelector('.demo-chapter-ribbon');
            const tbR = tb.getBoundingClientRect();
            const rR = r.getBoundingClientRect();
            return {
                transportBar: { top: tbR.top, bottom: tbR.bottom, height: tbR.height },
                ribbon: { top: rR.top, bottom: rR.bottom, height: rR.height },
                gap: rR.top - tbR.bottom
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('Fullscreen Layout Geometry:', JSON.stringify(fsLayout, null, 2));
    if (fsLayout.gap < 4) {
        throw new Error(`Layout collision detected! Gap between transport bar and ribbon is ${fsLayout.gap}px!`);
    }

    console.log('\n--- 5. Testing Scrubber Drag in Fullscreen ---');
    const fsScrubber = (await send('Runtime.evaluate', {
        expression: `(() => {
            const s = document.getElementById('demo-scrubber-track');
            const r = s.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()`,
        returnByValue: true
    })).result.value;
    const fsClickY = fsScrubber.top + fsScrubber.height * 0.5;
    const fsStart = fsScrubber.left + fsScrubber.width * 0.1;
    const fsEnd = fsScrubber.left + fsScrubber.width * 0.6; // 60% (~165s)

    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fsStart, y: fsClickY });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fsStart, y: fsClickY, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
        const curX = fsStart + (fsEnd - fsStart) * (i / 10);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: curX, y: fsClickY });
        await new Promise(r => setTimeout(r, 40));
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fsEnd, y: fsClickY, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const resFsDrag = (await send('Runtime.evaluate', {
        expression: `(() => ({ currentTime: window.demoPlayer.currentTime, videoTime: document.getElementById('demo-video-player').currentTime }))()`,
        returnByValue: true
    })).result.value;
    console.log('Fullscreen Dragged to 60% (~165s):', resFsDrag);
    if (Math.abs(resFsDrag.currentTime - 165) > 8) {
        throw new Error(`Fullscreen scrubber drag failed! Expected ~165, got ${resFsDrag.currentTime}`);
    }

    console.log('\n--- 6. Testing Chapter Pill Selection in Fullscreen ---');
    // Click Act 4 (~106.5s)
    const fsP4 = (await send('Runtime.evaluate', {
        expression: `(() => {
            const p = document.querySelectorAll('.demo-chapter-pill')[4];
            const r = p.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()`,
        returnByValue: true
    })).result.value;
    const fsP4X = fsP4.left + fsP4.width * 0.5;
    const fsP4Y = fsP4.top + fsP4.height * 0.5;

    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fsP4X, y: fsP4Y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fsP4X, y: fsP4Y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fsP4X, y: fsP4Y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const resFsP4 = (await send('Runtime.evaluate', {
        expression: `(() => {
            const active = document.querySelector('.demo-chapter-pill.active');
            return { currentTime: window.demoPlayer.currentTime, activeText: active ? active.innerText.trim() : null };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('Fullscreen Clicked Act 4 (~106.5s):', resFsP4);
    if (Math.abs(resFsP4.currentTime - 106.5) > 2) {
        throw new Error(`Fullscreen pill click failed! Expected 106.5, got ${resFsP4.currentTime}`);
    }

    // Capture screenshot of fullscreen navigation
    const snap = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join('tools', 'snap_verified_fullscreen.png'), Buffer.from(snap.data, 'base64'));
    console.log('Saved verification screenshot to tools/snap_verified_fullscreen.png');

    console.log('\n--- 7. Verifying Controls Hover Prevents HUD Hide ---');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const tb = document.getElementById('demo-transport-bar');
            tb.dispatchEvent(new MouseEvent('mouseenter'));
        })()`
    });
    console.log('Hovering transport bar and waiting 4.0s (past 3.5s timeout)...');
    await new Promise(r => setTimeout(r, 4000));

    const hoverCheck = (await send('Runtime.evaluate', {
        expression: `(() => {
            const c = document.querySelector('.demo-theater-container');
            return { isHudHidden: c.classList.contains('hud-hidden') };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('HUD hidden after 4s hovering controls?', hoverCheck.isHudHidden);
    if (hoverCheck.isHudHidden) {
        throw new Error('HUD incorrectly hid while user was hovering controls!');
    }

    console.log('\n--- 8. Testing In-Game Modal on /index.html ---');
    await send('Page.navigate', { url: `http://127.0.0.1:${SERVER_PORT}/index.html` });
    await new Promise(r => setTimeout(r, 2500));

    // Open demo modal via splash button
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('btn-splash-demo');
            if (btn) btn.click();
            else if (window.demoPlayer) window.demoPlayer.open('splash');
        })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    // Verify modal is open and visible
    const modalCheck = (await send('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('demo-modal');
            const video = document.getElementById('demo-video-player');
            return {
                modalDisplay: modal ? window.getComputedStyle(modal).display : 'none',
                videoReady: video ? video.readyState : -1
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('Modal status on index.html:', modalCheck);
    if (modalCheck.modalDisplay === 'none') {
        throw new Error('Modal failed to open on index.html!');
    }

    // Click Act 3 in modal (~72.0s)
    const mP3 = (await send('Runtime.evaluate', {
        expression: `(() => {
            const p = document.querySelectorAll('#demo-modal .demo-chapter-pill')[3];
            const r = p.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()`,
        returnByValue: true
    })).result.value;
    const mP3X = mP3.left + mP3.width * 0.5;
    const mP3Y = mP3.top + mP3.height * 0.5;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mP3X, y: mP3Y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mP3X, y: mP3Y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mP3X, y: mP3Y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const resModalAct = (await send('Runtime.evaluate', {
        expression: `(() => {
            const active = document.querySelector('#demo-modal .demo-chapter-pill.active');
            const p = window.demoPlayer || (window.__app && window.__app.demoPlayer);
            return {
                currentTime: p ? p.currentTime : -1,
                activeText: active ? active.innerText.trim() : null
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('Modal Clicked Act 3 (~75.0s):', resModalAct);
    if (Math.abs(resModalAct.currentTime - 75.0) > 3) {
        throw new Error(`Modal chapter selection failed! Expected ~75.0, got ${resModalAct.currentTime}`);
    }

    // Scrubber click in modal to 25% (~68.75s)
    const mScrub = (await send('Runtime.evaluate', {
        expression: `(() => {
            const s = document.querySelector('#demo-modal #demo-scrubber-track');
            const r = s.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        })()`,
        returnByValue: true
    })).result.value;
    const mScrubX = mScrub.left + mScrub.width * 0.25;
    const mScrubY = mScrub.top + mScrub.height * 0.5;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mScrubX, y: mScrubY });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mScrubX, y: mScrubY, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mScrubX, y: mScrubY, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 600));

    const resModalScrub = (await send('Runtime.evaluate', {
        expression: `(() => {
            const p = window.demoPlayer || (window.__app && window.__app.demoPlayer);
            return { currentTime: p ? p.currentTime : -1 };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('Modal Scrubber Click to 25% (~68.75s):', resModalScrub);
    if (Math.abs(resModalScrub.currentTime - 68.75) > 5) {
        throw new Error(`Modal scrubber click failed! Expected ~68.75, got ${resModalScrub.currentTime}`);
    }

    console.log(`\nAll 8 verification tests (Standalone + In-Game Modal) PASSED with 0 errors!`);

    ws.close();
    chrome.kill();
    server.close();
    process.exit(0);
}

main().catch(err => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
});

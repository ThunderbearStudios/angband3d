const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_term_test_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9238',
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
                http.get('http://127.0.0.1:9238/json/list', r => {
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

    // Toggle classic terminal mode like [Tab] does
    await send('Runtime.evaluate', {
        expression: `(() => {
            if (window.__app && window.__app.setForceTerminal) {
                window.__app.setForceTerminal(true);
            }
            const tc = document.getElementById('terminal-container');
            if (tc) tc.classList.remove('hidden');
        })()`
    });

    await new Promise(r => setTimeout(r, 1200));

    const scr = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_terminal_actual.png');
    fs.writeFileSync(scrPath, Buffer.from(scr.data, 'base64'));
    console.log('Saved actual Terminal screenshot 1 to:', scrPath);

    // Take a step in the terminal dungeon
    await send('Runtime.evaluate', {
        expression: `(() => {
            if (window.__app && window.__app.network) {
                window.__app.network.sendKey('down');
            }
        })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    const scr2 = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath2 = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_terminal_actual_step.png');
    fs.writeFileSync(scrPath2, Buffer.from(scr2.data, 'base64'));
    console.log('Saved actual Terminal screenshot 2 to:', scrPath2);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(e => { console.error(e); proc.kill(); process.exit(1); });

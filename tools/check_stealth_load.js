const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_check_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9267',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_stealth'
], { stdio: 'ignore' });

async function run() {
    await new Promise(r => setTimeout(r, 4000));
    const list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9267/json/list', r => {
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

    const res = await send('Runtime.evaluate', {
        expression: `(() => {
            const f = window.__app.getLastFrame ? window.__app.getLastFrame() : null;
            const termEl = document.getElementById('terminal-container');
            const rows = f && f.term && f.term.rows ? f.term.rows.map(r => r.g || '').join('\\n') : '';
            return {
                hasFrame: !!f,
                phase: f ? f.phase : null,
                ui: f ? f.ui : null,
                player: f && f.player ? f.player.name : null,
                termHidden: termEl ? termEl.classList.contains('hidden') : null,
                rows: rows.slice(0, 300)
            };
        })()`,
        returnByValue: true
    });
    console.log('Result:', JSON.stringify(res.result.value, null, 2));

    ws.close();
    proc.kill();
}

run().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
});

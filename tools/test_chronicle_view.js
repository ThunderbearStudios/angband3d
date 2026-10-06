const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_tome_test_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9236',
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
                http.get('http://127.0.0.1:9236/json/list', r => {
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

    // Turn camera South towards pillared hall and monsters
    await send('Runtime.evaluate', {
        expression: `(() => {
            const d = window.dungeon || (window.__app ? window.__app.dungeon : null);
            if (d) d.cameraYaw = Math.PI;
            const btn = document.getElementById('btn-toggle-chronicle');
            if (btn) btn.click();
            const win = document.getElementById('chronicle-window');
            if (win) {
                win.style.display = 'flex';
                win.classList.add('active');
                win.style.top = '100px';
                win.style.left = '320px';
                win.style.width = '1280px';
                win.style.height = '820px';
            }
            const list = document.getElementById('chronicle-list');
            if (list) {
                list.innerHTML = \`
                    <div class="chronicle-entry">
                        <div class="chronicle-entry-header">
                            <span class="chronicle-entry-icon">📖</span>
                            <span class="chronicle-entry-title">CANTO XXV: THE VAULTS OF MORGOTH</span>
                            <span class="chronicle-entry-timestamp">Turn 125 • Depth 1250ft</span>
                        </div>
                        <div class="chronicle-entry-body">
                            <p class="chronicle-prose">
                                In the pillared darkness of 1250 feet, the Westernesse blade gleamed with cold silver fire.
                                Before the pilgrim stood a cabal of dark druids and dungeon vermin, guarding the hoard of ancient kings.
                            </p>
                            <p class="chronicle-prose">
                                With a swift word of power and a bolt of azure lightning, reality folded through Phase Door.
                                The strike struck true, sundering the foe and scattering gold, rubies, and dragon scales across the stones.
                            </p>
                        </div>
                        <div class="chronicle-entry-footer">
                            <span class="chronicle-voice-tag">🎙 Voiced live by Gemini Native Audio (24kHz Studio Master) • Hosted on angband3d.com</span>
                        </div>
                    </div>
                \`;
            }
        })()`
    });

    await new Promise(r => setTimeout(r, 1200));

    const scr = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_tome_actual.png');
    fs.writeFileSync(scrPath, Buffer.from(scr.data, 'base64'));
    console.log('Saved actual Tome screenshot to:', scrPath);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(e => { console.error(e); proc.kill(); process.exit(1); });

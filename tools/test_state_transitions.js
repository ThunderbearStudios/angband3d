const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_states_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9227',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_town'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9227/json/list', r => {
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

    await new Promise(r => setTimeout(r, 3000));

    // Test helper to switch character
    async function switchChar(charName) {
        console.log(`[Test] Switching to ${charName}...`);
        const res = await send('Runtime.evaluate', {
            expression: `(async () => {
                if (window.__app && window.__app.network) {
                    window.__app.network.disconnect();
                    await new Promise(r => setTimeout(r, 500));
                    window.__app.startGame({ charName: '${charName}', isNew: false, autoBirth: false });
                    for (let i = 0; i < 25; i++) {
                        await new Promise(r => setTimeout(r, 200));
                        const frame = window.__app.lastFrame;
                        if (frame && frame.phase === 'play' && frame.map && frame.player) {
                            return {
                                success: true,
                                depth: frame.player.depth,
                                name: frame.player.name,
                                hp: frame.player.hp
                            };
                        }
                        const screenText = (frame && frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\\n') : '').toLowerCase();
                        if (screenText.includes('press any key') || screenText.includes('[press') || screenText.includes('press space') || (frame && frame.ui && frame.ui.more)) {
                            window.__app.network.sendKey('enter');
                        }
                    }
                }
                return { success: false };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        console.log(`[Test] Result for ${charName}:`, res.result.value);
        return res.result.value;
    }

    // Check initial state (demo_town)
    const initial = await send('Runtime.evaluate', {
        expression: `(() => {
            const p = window.__app && window.__app.lastFrame ? window.__app.lastFrame.player : null;
            return { depth: p ? p.depth : null, name: p ? p.name : null };
        })()`,
        returnByValue: true
    });
    console.log('[Test] Initial demo_town:', initial.result.value);

    // Switch to demo_crypt (depth 5 / 250ft)
    await switchChar('demo_crypt');
    await new Promise(r => setTimeout(r, 1000));

    // Switch to demo_vault (depth 15 / 750ft)
    await switchChar('demo_vault');
    await new Promise(r => setTimeout(r, 1000));

    // Switch to demo_combat (depth 25 / 1250ft)
    await switchChar('demo_combat');
    await new Promise(r => setTimeout(r, 1000));

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
    process.exit(1);
});

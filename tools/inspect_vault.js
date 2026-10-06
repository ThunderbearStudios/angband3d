const WebSocket = require('../server/node_modules/ws');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = os.tmpdir() + '/chrome_v_' + Date.now();

const proc = spawn(CHROME, ['--remote-debugging-port=9276', '--headless=new', '--user-data-dir=' + profileDir, 'http://127.0.0.1:8080/'], { stdio: 'ignore' });
setTimeout(async () => {
    try {
        const list = await new Promise(r => http.get('http://127.0.0.1:9276/json/list', res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => r(JSON.parse(d)));
        }));
        const ws = new WebSocket(list.find(p => p.type === 'page').webSocketDebuggerUrl);
        ws.on('open', () => {
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "window.__app.startGame({ charName: 'demo_vault', saveFile: 'demo_vault', isNew: false, autoBirth: false })" } }));
            let checks = 0;
            const interval = setInterval(() => {
                ws.send(JSON.stringify({ id: 2 + checks, method: 'Runtime.evaluate', params: { expression: "(() => { const net = window.__app.network; const f = window.__app.getLastFrame ? window.__app.getLastFrame() : (net ? net.lastFrame : null); if (f && f.phase !== 'play') net.sendKey('space'); return f && f.phase === 'play' && f.player ? f : null; })()", returnByValue: true } }));
                checks++;
            }, 500);
            ws.on('message', m => {
                const data = JSON.parse(m);
                if (data.id >= 2 && data.result && data.result.result && data.result.result.value) {
                    const f = data.result.result.value;
                    if (f && f.player) {
                        clearInterval(interval);
                        console.log('Player:', f.player.name, 'Pos:', f.player.x, f.player.y, 'Depth:', f.player.depth);
                        console.log('Monsters:', JSON.stringify(f.monsters, null, 2));
                        console.log('Objects:', JSON.stringify(f.objects || f.items, null, 2));
                        ws.close();
                        proc.kill();
                        process.exit(0);
                    }
                }
            });
        });
    } catch (e) {
        console.error(e);
        proc.kill();
        process.exit(1);
    }
}, 2000);

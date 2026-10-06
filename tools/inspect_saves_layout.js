const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_inspect_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9229',
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
                http.get('http://127.0.0.1:9229/json/list', r => {
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

    const saves = ['demo_town', 'demo_crypt', 'demo_vault', 'demo_stealth', 'demo_combat'];

    for (const charName of saves) {
        console.log(`\n==================================================`);
        console.log(`INSPECTING SAVE: ${charName}`);
        console.log(`==================================================`);

        const evalRes = await send('Runtime.evaluate', {
            expression: `(async () => {
                if (window.__app && window.__app.network) {
                    window.__app.network.disconnect();
                    await new Promise(r => setTimeout(r, 500));
                    window.__app.startGame({ charName: '${charName}', isNew: false, autoBirth: false });
                    for (let i = 0; i < 25; i++) {
                        await new Promise(r => setTimeout(r, 200));
                        const frame = window.__app.lastFrame;
                        if (frame && frame.phase === 'play' && frame.map && frame.player) {
                            // Extract surrounding map
                            const px = frame.player.x;
                            const py = frame.player.y;
                            const r = 5;
                            const grid = [];
                            for (let y = py - r; y <= py + r; y++) {
                                let row = '';
                                for (let x = px - r; x <= px + r; x++) {
                                    if (x === px && y === py) {
                                        row += '@';
                                    } else if (frame.map && frame.map[y] && frame.map[y][x]) {
                                        const cell = frame.map[y][x];
                                        row += cell.m ? cell.m : (cell.f ? cell.f : (cell.c ? cell.c : ' '));
                                    } else {
                                        row += ' ';
                                    }
                                }
                                grid.push(row);
                            }
                            return {
                                success: true,
                                player: frame.player,
                                monsters: (frame.monsters || []).map(m => ({
                                    name: m.name,
                                    symbol: m.symbol || m.c,
                                    x: m.x,
                                    y: m.y,
                                    dx: m.x - px,
                                    dy: m.y - py
                                })),
                                grid
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

        const val = evalRes.result ? evalRes.result.value : null;
        if (!val || !val.success) {
            console.log(`Failed to load ${charName}`);
            continue;
        }

        console.log(`Player: pos=(${val.player.x}, ${val.player.y}) depth=${val.player.depth} hp=${val.player.hp}/${val.player.mhp}`);
        console.log(`Surrounding 11x11 Grid (@ is player):`);
        console.log(val.grid.join('\n'));
        console.log(`Monsters (${val.monsters.length}):`, JSON.stringify(val.monsters));
    }

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(err => {
    console.error(err);
    try { proc.kill(); } catch (_) {}
    process.exit(1);
});

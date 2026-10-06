const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_inspect_' + Date.now());

const saves = ['demo_town', 'demo_crypt', 'demo_vault', 'demo_stealth', 'demo_combat'];

async function run() {
    const proc = spawn(CHROME, [
        '--remote-debugging-port=9267',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1920,1080',
        '--headless=new',
        `--user-data-dir=${profileDir}`,
        'http://127.0.0.1:8080/'
    ], { stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 2500));

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

    for (const save of saves) {
        console.log(`\n=================== INSPECTING: ${save} ===================`);
        await send('Runtime.evaluate', {
            expression: `window.__app.startGame({ charName: '${save}', saveFile: '${save}', isNew: false, autoBirth: false })`
        });

        // Wait for active play frame
        let f = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 200));
            const res = await send('Runtime.evaluate', {
                expression: `(() => {
                    const net = window.__app.network;
                    const frame = window.__app.getLastFrame ? window.__app.getLastFrame() : (net ? net.lastFrame : null);
                    if (frame && frame.phase !== 'play') net.sendKey('space');
                    if (frame && frame.ui && frame.ui.more) net.sendKey('space');
                    if (frame && frame.ui && frame.ui.overlay > 0) net.sendKey('escape');
                    return frame && frame.phase === 'play' && frame.player ? frame : null;
                })()`,
                returnByValue: true
            });
            if (res.result && res.result.value) {
                f = res.result.value;
                break;
            }
        }

        if (!f) {
            console.log(`Failed to load frame for ${save}`);
            continue;
        }

        const p = f.player;
        console.log(`Player: ${p.name} | ${p.race} ${p.class} | Level: ${p.lev} | Depth: ${p.depth} (${p.depth * 50}ft) | Pos: (${p.x}, ${p.y}) | HP: ${p.hp}/${p.hp_max} | Mana: ${p.mana}/${p.mana_max}`);

        if (f.monsters && f.monsters.length > 0) {
            console.log(`Monsters (${f.monsters.length}):`);
            f.monsters.forEach(m => {
                const dx = m.x - p.x;
                const dy = m.y - p.y;
                const dist = Math.hypot(dx, dy).toFixed(1);
                // Direction from player: dy < 0 is North, dy > 0 is South, dx > 0 is East, dx < 0 is West
                let dir = '';
                if (dy < 0) dir += 'North ';
                if (dy > 0) dir += 'South ';
                if (dx > 0) dir += 'East';
                if (dx < 0) dir += 'West';
                console.log(` - [${m.glyph}] ${m.name || m.race} at (${m.x}, ${m.y}) | Dist: ${dist} (${dir.trim()}) | HP: ${m.hp}/${m.hp_max || m.hp} | Asleep: ${!!m.asleep}`);
            });
        } else {
            console.log(`Monsters: none in immediate view`);
        }

        if (f.objects && f.objects.length > 0) {
            console.log(`Objects (${f.objects.length}):`);
            f.objects.slice(0, 5).forEach(o => {
                console.log(` - [${o.glyph}] ${o.name} at (${o.x}, ${o.y})`);
            });
        }
    }

    ws.close();
    proc.kill();
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

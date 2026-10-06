const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_mesh_test_' + Date.now());

async function run() {
    const proc = spawn(CHROME, [
        '--remote-debugging-port=9279',
        '--headless=new',
        '--user-data-dir=' + profileDir,
        'http://127.0.0.1:8080/'
    ], { stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 2000));
    const list = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9279/json/list', r => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
    });
    const ws = new WebSocket(list.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const curId = id++;
            ws.on('message', function handler(msg) {
                const data = JSON.parse(msg);
                if (data.id === curId) {
                    ws.off('message', handler);
                    if (data.error) reject(data.error);
                    else resolve(data.result);
                }
            });
            ws.send(JSON.stringify({ id: curId, method, params }));
        });
    }

    await send('Runtime.evaluate', {
        expression: "window.__app.startGame({ charName: 'demo_town', saveFile: 'demo_town', isNew: false, autoBirth: false })"
    });

    await new Promise(r => setTimeout(r, 3000));

    const check = await send('Runtime.evaluate', {
        expression: `(() => {
            const d = window.__app.dungeon;
            const entry = d.resolveMonsterAtlasEntry('Farmer Maggot', 'h');
            const testMesh = entry ? d.createMonsterBillboardMesh(entry) : null;
            const monsters = [];
            for (const [mid, ent] of d.monsters.entries()) {
                const m = ent.monsterData;
                let meshType = 'unknown';
                if (ent.creatureMesh) {
                    meshType = ent.creatureMesh.geometry ? ent.creatureMesh.geometry.type : 'group/hierarchy';
                }
                monsters.push({
                    name: m ? (m.name || m.race) : 'unknown',
                    glyph: ent.glyph,
                    meshType: meshType,
                    isBillboard: !!ent.isBillboard,
                    isFallback: !!ent.isFallback,
                    isBillboardFallback: !!ent.isBillboardFallback
                });
            }
            return {
                entry: entry,
                hasTestMesh: !!testMesh,
                testMeshGeo: testMesh && testMesh.geometry ? testMesh.geometry.type : null,
                monsters: monsters
            };
        })()`,
        returnByValue: true
    });

    console.log('Result:', JSON.stringify(check.result.value, null, 2));

    ws.close();
    proc.kill();
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

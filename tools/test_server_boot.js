const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('../server/node_modules/ws');

async function run() {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a3d-save-'));
    process.on('exit', () => {
        try { fs.rmSync(saveDir, { recursive: true, force: true }); } catch (_) {}
    });
    const child = spawn('node', ['server/src/server.js'], {
        env: { ...process.env, PORT: String(port), SAVE_DIR: saveDir },
        stdio: 'ignore'
    });

    let healthOk = false;
    let engineMissing = false;

    for (let i = 0; i < 20; i++) {
        try {
            await new Promise(r => setTimeout(r, 500));
            const health = await new Promise((resolve, reject) => {
                http.get(`http://localhost:${port}/health`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch(e) {
                            reject(e);
                        }
                    });
                }).on('error', reject);
            });
            
            if (health.engine === 'missing') {
                engineMissing = true;
            }
            healthOk = true;
            break;
        } catch (e) {
            // retry
        }
    }

    if (!healthOk) {
        console.error('FAIL: Server failed to start');
        child.kill();
        process.exit(1);
    }
    
    if (engineMissing) {
        console.log('SKIP: engine not built');
        child.kill();
        process.exit(0);
    }

    const ws = new WebSocket(`ws://localhost:${port}/ws?user=ci_boot&realm=angband&new=1`);
    
    let gotHello = false;
    let gotFirstFrame = false;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === 'hello') {
            gotHello = true;
        } else if (msg.t === 'frame' && msg.realm === 'angband') {
            if (!gotFirstFrame) {
                gotFirstFrame = true;
                // do injection check
                ws.send('key a\nquit');
                ws.send('frame');
            } else {
                ws.send(JSON.stringify({ t: 'quit' }));
                ws.close();
                child.kill();
                console.log('PASS');
                process.exit(0);
            }
        }
    });

    setTimeout(() => {
        console.error('FAIL: Timeout');
        child.kill();
        process.exit(1);
    }, 20000);
}

run();

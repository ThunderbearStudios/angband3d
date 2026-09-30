/**
 * Test Suite: Cloud Capacity Queue & Minimap Drag Invariant Verification
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

async function runTests() {
    console.log('[Test] Starting Queue & Minimap Invariant Test Suite...');

    // 1. Static code invariant assertions
    const hudJs = fs.readFileSync(path.resolve(__dirname, '../server/public/js/hud.js'), 'utf8');
    const appJs = fs.readFileSync(path.resolve(__dirname, '../server/public/js/app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../server/public/index.html'), 'utf8');
    const dungeonCss = fs.readFileSync(path.resolve(__dirname, '../server/public/css/dungeon.css'), 'utf8');

    // Verify minimap header click listener was removed
    if (hudJs.includes('this.minimapHeader.addEventListener(\'click\'')) {
        throw new Error('FAIL: hud.js still contains click listener on minimapHeader!');
    }
    console.log('✓ Invariant 1: hud.js minimapHeader click resize listener removed');

    // Verify app.js freezes dimensions during drag
    if (!appJs.includes('winEl.style.width = `${fixedW}px`') || !appJs.includes('winEl.style.height = `${fixedH}px`')) {
        throw new Error('FAIL: app.js does not freeze width/height during window dragging!');
    }
    console.log('✓ Invariant 2: app.js window dragging strictly preserves width & height');

    // Verify queue modal exists in index.html and is styled in dungeon.css
    if (!indexHtml.includes('id="queue-modal"') || !indexHtml.includes('id="queue-pos-num"')) {
        throw new Error('FAIL: index.html missing queue-modal or position display elements!');
    }
    if (!dungeonCss.includes('#queue-modal') || !dungeonCss.includes('.queue-spinner')) {
        throw new Error('FAIL: dungeon.css missing #queue-modal styles!');
    }
    console.log('✓ Invariant 3: queue-modal markup and CSS styling verified');

    // 2. Dynamic Integration Test with mock server
    const TEST_PORT = 18090;
    const serverProcess = spawn('node', ['server/src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
            ...process.env,
            PORT: `${TEST_PORT}`,
            MAX_CONCURRENT_GAMES: '1',
            MAX_QUEUE_SIZE: '5'
        },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let serverLogs = '';
    serverProcess.stdout.on('data', d => { serverLogs += d.toString(); });
    serverProcess.stderr.on('data', d => { serverLogs += d.toString(); });

    // Wait for server to start listening
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        // Query /api/status endpoint
        const statusRes = await new Promise((resolve, reject) => {
            http.get(`http://localhost:${TEST_PORT}/api/status`, res => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        console.log('✓ Invariant 4: /api/status responds with telemetry:', statusRes);
        if (statusRes.maxCapacity !== 1 || statusRes.status !== 'online') {
            throw new Error(`FAIL: unexpected status response: ${JSON.stringify(statusRes)}`);
        }

        // Test WebSocket queue with ws client
        const WebSocket = require('../server/node_modules/ws');
        
        // Connect Client 1 -> Admitted
        const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws?user=Hero1`);
        await new Promise((resolve, reject) => {
            ws1.on('open', resolve);
            ws1.on('error', reject);
        });

        const msg1 = await new Promise(resolve => {
            ws1.once('message', data => resolve(JSON.parse(data.toString())));
        });
        console.log('✓ Client 1 received:', msg1.t);
        if (msg1.t !== 'hello') throw new Error(`Expected hello for client 1, got ${msg1.t}`);

        // Connect Client 2 -> Enqueued
        const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws?user=Hero2`);
        await new Promise((resolve, reject) => {
            ws2.on('open', resolve);
            ws2.on('error', reject);
        });

        const msg2 = await new Promise(resolve => {
            ws2.once('message', data => resolve(JSON.parse(data.toString())));
        });
        console.log('✓ Client 2 received queue message:', msg2);
        if (msg2.t !== 'queue' || msg2.status !== 'waiting' || msg2.position !== 1) {
            throw new Error(`Expected queue message for client 2, got: ${JSON.stringify(msg2)}`);
        }

        // Connect Client 3 -> Enqueued position 2
        const ws3 = new WebSocket(`ws://localhost:${TEST_PORT}/ws?user=Hero3`);
        await new Promise((resolve, reject) => {
            ws3.on('open', resolve);
            ws3.on('error', reject);
        });

        const msg3 = await new Promise(resolve => {
            ws3.once('message', data => resolve(JSON.parse(data.toString())));
        });
        console.log('✓ Client 3 received queue message:', msg3);
        if (msg3.t !== 'queue' || msg3.status !== 'waiting' || msg3.position !== 2) {
            throw new Error(`Expected queue position 2 for client 3, got: ${JSON.stringify(msg3)}`);
        }

        // Test ping in queue for Client 2
        ws2.send(JSON.stringify({ t: 'ping', time: 12345 }));
        const pongMsg = await new Promise(resolve => {
            const onMsg = (data) => {
                const parsed = JSON.parse(data.toString());
                if (parsed.t === 'pong') {
                    ws2.removeListener('message', onMsg);
                    resolve(parsed);
                }
            };
            ws2.on('message', onMsg);
        });
        console.log('✓ Client 2 received pong while in queue:', pongMsg);
        if (pongMsg.t !== 'pong' || pongMsg.time !== 12345) {
            throw new Error(`Expected pong from queue, got: ${JSON.stringify(pongMsg)}`);
        }

        // Now disconnect Client 1 -> Client 2 must be admitted!
        console.log('[Test] Disconnecting Client 1 to free slot...');
        ws1.close();

        const admissionMsg = await new Promise(resolve => {
            ws2.once('message', data => resolve(JSON.parse(data.toString())));
        });
        console.log('✓ Client 2 received admission notification:', admissionMsg);
        if (admissionMsg.t !== 'queue' || admissionMsg.status !== 'admitted') {
            throw new Error(`Expected admitted for client 2, got: ${JSON.stringify(admissionMsg)}`);
        }

        const engineHelloMsg = await new Promise(resolve => {
            ws2.once('message', data => resolve(JSON.parse(data.toString())));
        });
        console.log('✓ Client 2 spawned engine and received:', engineHelloMsg.t);
        if (engineHelloMsg.t !== 'hello') {
            throw new Error(`Expected hello for client 2, got: ${engineHelloMsg.t}`);
        }

        // Client 3 should receive position update (now #1)
        const updateMsg3 = await new Promise(resolve => {
            ws3.once('message', data => resolve(JSON.parse(data.toString())));
        });
        console.log('✓ Client 3 position promoted:', updateMsg3);
        if (updateMsg3.t !== 'queue' || updateMsg3.position !== 1) {
            throw new Error(`Expected promoted position 1 for client 3, got: ${JSON.stringify(updateMsg3)}`);
        }

        // Cleanup WebSockets
        ws2.close();
        ws3.close();

        console.log('\n=============================================');
        console.log(' ALL QUEUE & MINIMAP TESTS PASSED PERFECTLY! ');
        console.log('=============================================\n');
    } finally {
        serverProcess.kill('SIGTERM');
    }
}

runTests().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});

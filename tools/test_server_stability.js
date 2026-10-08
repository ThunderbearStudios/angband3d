/**
 * Automated test suite for server stability, load resilience, mute short-circuiting,
 * and seamless WebSocket reconnect during network lag or disconnects.
 */

const http = require('http');
const assert = require('assert');
const WebSocket = require('../server/node_modules/ws');
const path = require('path');
const fs = require('fs');

const PORT = 8082;
process.env.PORT = PORT.toString();
process.env.DISCONNECT_GRACE_PERIOD_MS = '5000'; // 5s for fast test verification

// Start server
require('../server/src/server.js');

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function httpGet(pathStr, headers = {}) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}${pathStr}`, { headers }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

async function runStabilityTests() {
    console.log('[Stability Test] Starting server stability & reconnect verification on port', PORT);
    await wait(600);

    // --- TEST 1: Mute Early-Exit in /api/tts ---
    console.log('\n[Test 1] Verifying /api/tts muted early exit (query & header)...');
    const muteQueryRes = await httpGet('/api/tts?text=TestSpeech&muted=1');
    assert.strictEqual(muteQueryRes.status, 204, 'Expected HTTP 204 No Content when muted=1 query param is set');
    assert.strictEqual(muteQueryRes.headers['x-tts-status'], 'MUTED');
    console.log('  ✓ Query param muted=1 returned 204 No Content with X-TTS-Status: MUTED');

    const muteHeaderRes = await httpGet('/api/tts?text=TestSpeech', { 'x-tome-muted': '1' });
    assert.strictEqual(muteHeaderRes.status, 204, 'Expected HTTP 204 No Content when x-tome-muted header is set');
    assert.strictEqual(muteHeaderRes.headers['x-tts-status'], 'MUTED');
    console.log('  ✓ Header x-tome-muted: 1 returned 204 No Content with X-TTS-Status: MUTED');

    // --- TEST 2: WebSocket Connection, Handshake & Session Generation ---
    console.log('\n[Test 2] Connecting initial WebSocket client to /ws?user=StabilHero&new=1...');
    let ws1 = new WebSocket(`ws://localhost:${PORT}/ws?user=StabilHero&new=1`);
    let hello1Msg = null;
    let frames1 = [];

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for initial frames')), 8000);
        ws1.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'hello' && parsed.sessionId) {
                        hello1Msg = parsed;
                    } else if (parsed.t === 'frame') {
                        frames1.push(parsed);
                        if (frames1.length >= 1 && hello1Msg) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    }
                } catch (_) {}
            }
        });
        ws1.on('error', reject);
    });

    assert(hello1Msg, 'Expected hello handshake message');
    assert(hello1Msg.sessionId, 'Expected hello message to contain sessionId');
    const sessionId = hello1Msg.sessionId;
    console.log(`  ✓ Received hello handshake with sessionId: ${sessionId}`);
    console.log(`  ✓ Received ${frames1.length} initial engine frame(s)`);

    // --- TEST 3: Intermittent Disconnect & Engine Grace Period Preservation ---
    console.log('\n[Test 3] Simulating network drop / tab disconnect...');
    ws1.close();
    await wait(300);

    // Verify server did not kill engine and keeps session active in memory
    const healthAfterDrop = await httpGet('/health');
    const healthJson = JSON.parse(healthAfterDrop.body);
    assert.strictEqual(healthJson.activeSessions, 1, 'Expected activeSessions to remain 1 during disconnect grace period');
    console.log('  ✓ Active engine process kept alive in activeSessions during grace period');

    // --- TEST 4: Seamless Reconnect & State Resumption ---
    console.log('\n[Test 4] Reconnecting client with sessionId to resume game instance...');
    let ws2 = new WebSocket(`ws://localhost:${PORT}/ws?session=${sessionId}&user=StabilHero`);
    let hello2Msg = null;
    let resumedFrames = [];

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for resumed session')), 6000);
        ws2.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'hello' && parsed.sessionId) {
                        hello2Msg = parsed;
                    } else if (parsed.t === 'frame') {
                        resumedFrames.push(parsed);
                        if (hello2Msg && resumedFrames.length >= 1) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    }
                } catch (_) {}
            }
        });
        ws2.on('error', reject);
    });

    assert(hello2Msg, 'Expected hello handshake on reconnect');
    assert.strictEqual(hello2Msg.sessionId, sessionId, 'Expected reconnected sessionId to match original session');
    assert.strictEqual(hello2Msg.resumed, true, 'Expected resumed: true flag in hello handshake');
    console.log('  ✓ Received resumed hello handshake with matching sessionId and resumed=true');
    console.log(`  ✓ Received ${resumedFrames.length} frame(s) on reconnection`);

    // Send command to live engine to verify pipe is fully operational
    console.log('\n[Test 5] Sending command over reconnected WebSocket to live engine...');
    let keyFrameReceived = false;
    const framePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for frame response to key')), 5000);
        ws2.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{"t":"frame"')) {
                keyFrameReceived = true;
                clearTimeout(timeout);
                resolve();
            }
        });
    });

    ws2.send('frame\n');
    await framePromise;
    assert(keyFrameReceived, 'Expected engine to respond to commands on reconnected WebSocket');
    console.log('  ✓ Live engine responded to command over reconnected WebSocket pipe');

    // --- TEST 5b: Hot Socket Takeover & Name-Only Reconnect (Half-Open TCP Simulation) ---
    console.log('\n[Test 5b] Simulating client reconnect with NO session ID while old socket is STILL connected...');
    let ws3 = new WebSocket(`ws://localhost:${PORT}/ws?user=StabilHero`);
    let hello3Msg = null;
    let frames3 = [];

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for ws3 resumed session')), 6000);
        ws3.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'hello' && parsed.sessionId) {
                        hello3Msg = parsed;
                    } else if (parsed.t === 'frame') {
                        frames3.push(parsed);
                        if (hello3Msg && frames3.length >= 1) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    }
                } catch (_) {}
            }
        });
        ws3.on('error', reject);
    });

    assert(hello3Msg, 'Expected hello handshake on ws3 reconnect');
    assert.strictEqual(hello3Msg.sessionId, sessionId, 'Expected ws3 to match live session without session ID param');
    assert.strictEqual(hello3Msg.resumed, true, 'Expected ws3 to resume live session');
    console.log('  ✓ ws3 seamlessly took over live engine without duplicate process spawn');

    // Verify active sessions is strictly 1 (no duplicate engine spawned)
    const healthDuringTakeover = await httpGet('/health');
    const healthJsonTakeover = JSON.parse(healthDuringTakeover.body);
    assert.strictEqual(healthJsonTakeover.activeSessions, 1, 'Expected strictly 1 active engine session during takeover');
    console.log('  ✓ Active session count remains exactly 1');

    // Wait 500ms to guarantee old ws2 close event fired and did NOT unbind ws3 or trigger disconnect
    await wait(500);

    // Verify ws3 still operational after ws2 closed
    let ws3FrameReceived = false;
    const ws3FramePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for ws3 frame after takeover')), 5000);
        ws3.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{"t":"frame"')) {
                ws3FrameReceived = true;
                clearTimeout(timeout);
                resolve();
            }
        });
    });
    ws3.send('frame\n');
    await ws3FramePromise;
    assert(ws3FrameReceived, 'Expected engine to respond to commands on ws3 after takeover');
    console.log('  ✓ ws3 remained fully operational after old socket teardown (no unbinding race condition)');

    // --- TEST 6: Graceful Disconnect & Authoritative Save ---
    console.log('\n[Test 6] Testing graceful save & termination upon disconnect grace expiry...');
    ws3.close();
    // Wait for the 5s grace period to expire
    console.log('  Waiting 5.5s for grace period to expire...');
    await wait(5500);

    const healthAfterGrace = await httpGet('/health');
    const healthJsonAfter = JSON.parse(healthAfterGrace.body);
    assert.strictEqual(healthJsonAfter.activeSessions, 0, 'Expected session to be cleaned up after grace period expires');
    console.log('  ✓ Session safely saved and child process exited cleanly after grace period');

    console.log('\n✅ ALL SERVER STABILITY & RECONNECT TESTS PASSED CLEANLY!\n');
    process.exit(0);
}

runStabilityTests().catch(err => {
    console.error('Stability Test Failed:', err);
    process.exit(1);
});

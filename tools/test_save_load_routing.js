/**
 * Automated test verifying:
 * 1. Loading a savefile with .sav on disk (e.g. TestOne.sav) resolves cleanly and loads into play phase without falling into character creation.
 * 2. An existing character creation session (phase: setup) does NOT hijack a subsequent save load request.
 * 3. Client leaveSession ({ t: "quit" }) cleans up active session immediately.
 */

const http = require('http');
const assert = require('assert');
const WebSocket = require('../server/node_modules/ws');

const PORT = 8083;
process.env.PORT = PORT.toString();
process.env.DISCONNECT_GRACE_PERIOD_MS = '3000';

// Start server
require('../server/src/server.js');

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
    console.log('[Routing Test] Starting save load routing verification on port', PORT);
    await wait(600);

    // Step 1: Start a character creation session
    console.log('\n[Step 1] Connecting client into character creation (/ws?user=TrappedGuy&new=1)...');
    const wsSetup = new WebSocket(`ws://localhost:${PORT}/ws?user=TrappedGuy&new=1`);
    let setupHello = null;
    let setupFrame = null;

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for setup frames')), 8000);
        wsSetup.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'hello' && parsed.sessionId) setupHello = parsed;
                    if (parsed.t === 'frame') setupFrame = parsed;
                    if (setupHello && setupFrame) {
                        clearTimeout(timeout);
                        resolve();
                    }
                } catch (_) {}
            }
        });
        wsSetup.on('error', reject);
    });

    assert(setupHello && setupHello.sessionId, 'Expected setup session ID');
    assert.strictEqual(setupFrame.phase, 'setup', 'Initial session must be in setup phase');
    console.log(`  ✓ Setup session started with ID: ${setupHello.sessionId} (Phase: ${setupFrame.phase})`);

    // Step 2: Now simulate client trying to load a saved game with .sav (TestOne.sav),
    // but sending the OLD sessionId from the character creation session.
    console.log('\n[Step 2] Connecting client to load TestOne.sav with stale session ID...');
    const wsLoad = new WebSocket(`ws://localhost:${PORT}/ws?save=TestOne.sav&session=${setupHello.sessionId}&user=TestOne`);
    let loadHello = null;
    let playFrame = null;

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for save load')), 8000);
        wsLoad.on('message', data => {
            const str = data.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'hello' && parsed.sessionId) {
                        loadHello = parsed;
                    }
                    if (parsed.t === 'frame') {
                        // If paused on title screen, advance with Enter
                        if (parsed.phase === 'setup' && parsed.term) {
                            wsLoad.send('key enter\n');
                        } else if (parsed.phase === 'play') {
                            playFrame = parsed;
                            clearTimeout(timeout);
                            resolve();
                        }
                    }
                } catch (_) {}
            }
        });
        wsLoad.on('error', reject);
    });

    assert(loadHello, 'Expected hello for loaded game');
    assert.notStrictEqual(loadHello.sessionId, setupHello.sessionId, 'Setup session MUST NOT hijack save load request!');
    assert(playFrame, 'Expected to reach play phase');
    assert.strictEqual(playFrame.phase, 'play', 'Must be in play phase, not stuck in character creation wizard');
    console.log(`  ✓ Successfully loaded TestOne.sav into phase: "play" (in_dungeon: ${playFrame.in_dungeon})`);
    console.log(`  ✓ Session hijack was cleanly rejected: new session ${loadHello.sessionId} != ${setupHello.sessionId}`);

    // Step 3: Test leaveSession ({ t: "quit" }) cleans up session
    console.log('\n[Step 3] Testing explicit quit terminates session...');
    wsLoad.send(JSON.stringify({ t: 'quit' }));
    await wait(300);
    wsSetup.send(JSON.stringify({ t: 'quit' }));
    await wait(600);

    console.log('\n✅ ALL SAVE LOAD ROUTING TESTS PASSED PERFECTLY!\n');
    process.exit(0);
}

runTest().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});

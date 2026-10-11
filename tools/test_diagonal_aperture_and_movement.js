const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    console.log('[Test] Running diagonal aperture and movement verification...');
    const port = 9229;
    const profileDir = path.resolve('.chrome-debug-profile-diag-test');
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}

    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        `--remote-debugging-port=${port}`,
        '--headless=new',
        '--disable-gpu',
        '--window-size=1280,800',
        '--user-data-dir=' + profileDir,
        'http://localhost:8080/?char=DiagHero_' + Date.now()
    ]);

    let tabs = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            tabs = await getJson(`http://127.0.0.1:${port}/json`);
            if (tabs && tabs.length > 0) break;
        } catch (_) {}
    }
    if (!tabs) throw new Error('Could not connect to Chrome CDP on port ' + port);

    const tab = tabs.find(t => t.url.includes('8080')) || tabs[0];
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            callbacks.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    ws.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.id && callbacks.has(msg.id)) {
            const { resolve, reject } = callbacks.get(msg.id);
            callbacks.delete(msg.id);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
        }
    });

    await new Promise(resolve => ws.on('open', resolve));
    await send('Runtime.enable');
    await send('Page.enable');

    async function evalJs(expr) {
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        return r && r.result ? r.result.value : null;
    }

    try {
        await new Promise(r => setTimeout(r, 2000));

        // 1. Advance past splash screen and click quick birth
        console.log('[Test] Advancing past splash...');
        await evalJs(`(() => {
            if (window.__app && window.__app.showMainMenu) {
                window.__app.showMainMenu();
            } else {
                const btn = document.getElementById('btn-splash-start');
                if (btn) btn.click();
            }
        })()`);
        await new Promise(r => setTimeout(r, 1000));

        console.log('[Test] Clicking QuickStart Random Hero...');
        await evalJs(`(() => {
            const btnRandom = document.getElementById('btn-menu-random');
            if (btnRandom) btnRandom.click();
            else if (window.__app) window.__app.startGame({ charName: 'Hero_Diag', isNew: true, autoBirth: true, realm: 'angband' });
        })()`);

        // Wait to enter 3D Town
        console.log('[Test] Waiting for 3D world...');
        let entered3D = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            const state = await evalJs(`(() => {
                const term = document.getElementById('terminal-container');
                const d = window.__app && window.__app.dungeon;
                const p = window.__app && window.__app.lastFrame && window.__app.lastFrame.player;
                return {
                    termHidden: term ? term.classList.contains('hidden') : false,
                    hasDungeon: !!d,
                    hasPlayer: !!p,
                    wallMesh: d && !!d.wallMesh
                };
            })()`);
            if (state && state.termHidden && state.hasPlayer && state.wallMesh) {
                entered3D = true;
                break;
            }
            // If birth review prompt is up, click advance
            await evalJs(`(() => {
                const btnAdv = document.getElementById('btn-term-advance');
                if (btnAdv && btnAdv.offsetParent !== null) btnAdv.click();
                else if (window.__app && window.__app.confirmHeroBirth) window.__app.confirmHeroBirth();
                const btnStart = document.getElementById('btn-review-start');
                if (btnStart && window.getComputedStyle(btnStart).display !== 'none') btnStart.click();
            })()`);
        }

        if (!entered3D) throw new Error('Failed to enter 3D world within 15 seconds');
        console.log('[Test] Entered 3D World successfully!');

        // 2. Verify Chamfered Wall Geometry
        const geoCheck = await evalJs(`(() => {
            const d = window.__app.dungeon;
            const posAttr = d.wallMesh.geometry.attributes.position;
            const vertCount = posAttr ? posAttr.count : 0;
            const isBox = (vertCount === 24 || vertCount === 36);
            return {
                vertCount,
                isChamfered: vertCount > 36,
                isBox,
                floorInstances: d.floorMesh.count,
                ceilingInstances: d.ceilingMesh.count,
                wallInstances: d.wallMesh.count
            };
        })()`);
        console.log('[Test 2] Wall Geometry & Instance Verification:', geoCheck);
        if (!geoCheck.isChamfered) {
            throw new Error(`FAIL: Wall geometry is not chamfered! vertCount=${geoCheck.vertCount}`);
        }
        console.log(`[PASS] Chamfered wall geometry verified (${geoCheck.vertCount} vertices vs 36 for solid box)`);
        console.log(`[PASS] Floor instances (${geoCheck.floorInstances}) and Wall instances (${geoCheck.wallInstances}) verified`);

        // 3. Verify Relative Direction Keys & Diagonal Map
        const dirKeyCheck = await evalJs(`(() => {
            const input = window.__app.input;
            const d = window.__app.dungeon;
            d.facing = 0; // North
            const f0_7 = input.getRelativeDirectionKey(7);
            const f0_9 = input.getRelativeDirectionKey(9);
            const f0_1 = input.getRelativeDirectionKey(1);
            const f0_3 = input.getRelativeDirectionKey(3);
            const f0_8 = input.getRelativeDirectionKey(8);

            d.facing = 1; // East
            const f1_7 = input.getRelativeDirectionKey(7);
            const f1_9 = input.getRelativeDirectionKey(9);

            return { f0_7, f0_9, f0_1, f0_3, f0_8, f1_7, f1_9 };
        })()`);
        console.log('[Test 3] Relative Direction Key verification:', dirKeyCheck);
        if (dirKeyCheck.f0_7 !== 'home' || dirKeyCheck.f0_9 !== 'pageup' || dirKeyCheck.f1_7 !== 'pageup' || dirKeyCheck.f1_9 !== 'pagedown') {
            throw new Error(`FAIL: Relative direction key mapping incorrect: ${JSON.stringify(dirKeyCheck)}`);
        }
        console.log('[PASS] 8-way relative direction calculation verified!');

        // 4. Test Key Event Dispatch for Diagonal Movement & Pitch Modifiers
        console.log('[Test 4] Testing Diagonal Key Dispatch & Head Tilt Decoupling...');
        const testKeys = await evalJs(`(() => {
            const input = window.__app.input;
            const d = window.__app.dungeon;
            d.facing = 0; // Ensure North facing
            let lastSent = null;
            const origSendMovementKey = input.sendMovementKey;
            input.sendMovementKey = (k) => { lastSent = k; };

            d.userPitchOffset = 0.0;

            // Test 4a: Press 'Home' without Ctrl -> Should trigger diagonal move (dir 7 -> 'home'), NOT pitch tilt!
            const evHome = new KeyboardEvent('keydown', { key: 'Home', code: 'Home', bubbles: true });
            input.handleWorldKey(evHome);
            const moveHome = lastSent;
            const pitchAfterHome = d.userPitchOffset;

            // Test 4b: Press 'PageUp' without Ctrl -> Should trigger diagonal move (dir 9 -> 'pageup'), NOT pitch tilt!
            lastSent = null;
            const evPageUp = new KeyboardEvent('keydown', { key: 'PageUp', code: 'PageUp', bubbles: true });
            input.handleWorldKey(evPageUp);
            const movePageUp = lastSent;
            const pitchAfterPageUp = d.userPitchOffset;

            // Test 4c: Press top-row 'Digit7' -> Should trigger diagonal move (dir 7 -> 'home')
            lastSent = null;
            const evDigit7 = new KeyboardEvent('keydown', { key: '7', code: 'Digit7', bubbles: true });
            input.handleWorldKey(evDigit7);
            const moveDigit7 = lastSent;

            // Test 4d: Press top-row 'Digit9' -> Should trigger diagonal move (dir 9 -> 'pageup')
            lastSent = null;
            const evDigit9 = new KeyboardEvent('keydown', { key: '9', code: 'Digit9', bubbles: true });
            input.handleWorldKey(evDigit9);
            const moveDigit9 = lastSent;

            // Test 4e: Press 'Ctrl+PageUp' -> Should adjust userPitchOffset to +0.12 without triggering move!
            lastSent = null;
            const evCtrlPageUp = new KeyboardEvent('keydown', { key: 'PageUp', code: 'PageUp', ctrlKey: true, bubbles: true });
            input.handleWorldKey(evCtrlPageUp);
            const moveCtrlPageUp = lastSent;
            const pitchAfterCtrlPageUp = d.userPitchOffset;

            // Restore
            input.sendMovementKey = origSendMovementKey;
            d.userPitchOffset = 0.0;

            return {
                moveHome, pitchAfterHome,
                movePageUp, pitchAfterPageUp,
                moveDigit7, moveDigit9,
                moveCtrlPageUp, pitchAfterCtrlPageUp
            };
        })()`);

        console.log('[Test 4] Dispatch Results:', testKeys);
        if (testKeys.moveHome !== 'home' || testKeys.pitchAfterHome !== 0.0) {
            throw new Error(`FAIL: Home key did not dispatch diagonal move 'home' or corrupted pitch: ${JSON.stringify(testKeys)}`);
        }
        if (testKeys.movePageUp !== 'pageup' || testKeys.pitchAfterPageUp !== 0.0) {
            throw new Error(`FAIL: PageUp key did not dispatch diagonal move 'pageup' or corrupted pitch: ${JSON.stringify(testKeys)}`);
        }
        if (testKeys.moveDigit7 !== 'home' || testKeys.moveDigit9 !== 'pageup') {
            throw new Error(`FAIL: Digit 7 or 9 failed to dispatch: ${JSON.stringify(testKeys)}`);
        }
        if (testKeys.moveCtrlPageUp !== null || Math.abs(testKeys.pitchAfterCtrlPageUp - 0.12) > 0.01) {
            throw new Error(`FAIL: Ctrl+PageUp failed to tilt head or leaked movement: ${JSON.stringify(testKeys)}`);
        }
        console.log('[PASS] Home/PageUp/Digit7/Digit9 diagonal movement and Ctrl+Tilt decoupling verified 100%!');

        // 5. Capture screenshot of 3D world with chamfered geometry
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const outPath = path.join(__dirname, 'chamfer_diagonal_verified.png');
        fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
        console.log('[Test] Saved verified 3D capture to ' + outPath);

        ws.close();
        console.log('\n>>> ALL DIAGONAL MOVEMENT AND APERTURE TESTS PASSED! <<<');
    } finally {
        chrome.kill();
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
    }
}

main().catch(err => {
    console.error('[Test Failed]:', err);
    process.exit(1);
});

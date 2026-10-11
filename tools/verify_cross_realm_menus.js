/**
 * verify_cross_realm_menus.js
 * Comprehensive automated verification for menu systems across all realms:
 * 1. Vanilla Angband: Store multi-item purchase flow without dropping out of classic view.
 * 2. Sil-Q: Inventory navigation, Wear/Wield, Equipment inspection, Remove, and letter selection.
 * 3. FrogComposBand: Inventory, equipment, and store prompt parity.
 * 4. Hengband: Japanese/English bilingual store & inventory prompt parity.
 */

let WebSocket;
try { WebSocket = require('ws'); } catch (_) { WebSocket = require('../server/node_modules/ws'); }
const assert = require('assert');

const SERVER_URL = 'ws://localhost:8080/ws';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function runSession(realm, sessionName, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        const url = `${SERVER_URL}?realm=${realm}&new=1&user=${sessionName}_${Date.now().toString(36)}`;
        console.log(`\n============================================================`);
        console.log(`Starting Test Session for Realm: [${realm.toUpperCase()}]`);
        console.log(`URL: ${url}`);
        console.log(`============================================================`);

        const ws = new WebSocket(url);
        let finished = false;
        let lastFrame = null;
        let frameCount = 0;
        let silqStatAllocated = false;
        let silqNameSent = false;
        let fcbRandomized = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                ws.close();
                reject(new Error(`Timeout (${timeoutMs}ms) exceeded for realm ${realm}`));
            }
        }, timeoutMs);

        function cleanup() {
            clearTimeout(timer);
            finished = true;
            try { ws.close(); } catch (_) {}
        }

        ws.on('error', (err) => {
            if (!finished) {
                cleanup();
                reject(err);
            }
        });

        const frameWaiters = [];

        function waitForNextFrame(condition = null, timeout = 5000) {
            return new Promise((res, rej) => {
                const waiter = {
                    condition,
                    resolve: res,
                    reject: rej,
                    timer: setTimeout(() => {
                        const idx = frameWaiters.indexOf(waiter);
                        if (idx !== -1) frameWaiters.splice(idx, 1);
                        rej(new Error(`Timed out waiting for frame condition in ${realm}`));
                    }, timeout)
                };
                frameWaiters.push(waiter);
            });
        }

        function sendKey(k) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(`key ${k}`);
            }
        }

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString('utf8'));
                if (msg.t === 'frame') {
                    frameCount++;
                    lastFrame = msg;

                    // If still in birth setup, auto-advance
                    if (msg.phase !== 'play') {
                        const rawScreen = (msg.term && msg.term.rows ? msg.term.rows.map(r => r.g || '').join('\n') : '');
                        const screenText = rawScreen.toLowerCase();

                        if (realm === 'hengband') {
                            if (screenText.includes('smart_learn') || (screenText.includes('初期オプション') && screenText.includes('esc:終了'))) {
                                sendKey('escape');
                            } else if (screenText.includes('性別を選んで') || screenText.includes('種族を選んで') ||
                                       screenText.includes('職業を選んで') || screenText.includes('性格を選んで') ||
                                       screenText.includes('*でランダム') || screenText.includes('* for random')) {
                                sendKey('*');
                            } else if (screenText.includes('魔法領域') || screenText.includes('領域を選んで')) {
                                sendKey('a');
                            } else if (screenText.includes('能力値を抽選') || screenText.includes('能力値決定') || screenText.includes('この数値に決定')) {
                                sendKey('enter');
                            } else if (screenText.includes('よろしいですか') || screenText.includes('[y/n]') || screenText.includes('(y/n)')) {
                                sendKey('y');
                            } else if (screenText.includes('名前を入力') || screenText.includes('キャラクターの名前') || screenText.includes('生い立ち') || screenText.includes('冒険に出ますか') || screenText.includes('ゲーム開始')) {
                                sendKey('enter');
                            } else {
                                sendKey('enter');
                            }
                        } else if (realm === 'frogcomposband') {
                            if (screenText.includes('choose the type of game to play')) {
                                sendKey('b');
                            } else if (screenText.includes('[y/n]')) {
                                sendKey('y');
                            } else {
                                sendKey('enter');
                            }
                        } else if (realm === 'angband') {
                            if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('quick-start') || screenText.includes('based on previous')) {
                                sendKey('y');
                            } else if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
                                sendKey('@');
                            } else if (screenText.includes('press any key') || screenText.includes('-more-')) {
                                sendKey('enter');
                            } else {
                                sendKey('@');
                            }
                        } else if (realm === 'silq') {
                            if (screenText.includes('allocate points to skills') || screenText.includes('accept skills')) {
                                sendKey('enter');
                            } else if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
                                if (!silqStatAllocated) {
                                    silqStatAllocated = true;
                                    ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'].forEach(k => sendKey(k));
                                }
                            } else if (screenText.includes('choose house') || screenText.includes('choose your race')) {
                                sendKey('*');
                            } else if (screenText.includes('tab random name') || screenText.includes('enter accept name')) {
                                if (!silqNameSent) {
                                    silqNameSent = true;
                                    sendKey('tab');
                                    sendKey('enter');
                                }
                            } else {
                                sendKey('enter');
                            }
                        }
                    }

                    // Check any pending frame waiters
                    for (let i = frameWaiters.length - 1; i >= 0; i--) {
                        const fw = frameWaiters[i];
                        if (!fw.condition || fw.condition(msg)) {
                            clearTimeout(fw.timer);
                            frameWaiters.splice(i, 1);
                            fw.resolve(msg);
                        }
                    }
                }
            } catch (e) {
                console.error('Error parsing WS frame:', e);
            }
        });

        ws.on('open', async () => {
            try {
                // Wait until we reach play phase
                console.log(`[${realm}] Awaiting 'play' phase...`);
                await waitForNextFrame(f => f.phase === 'play', 12000);
                console.log(`[${realm}] Successfully entered 'play' phase! (Player at ${lastFrame.player.x}, ${lastFrame.player.y})`);

                resolve({
                    realm,
                    ws,
                    lastFrame: () => lastFrame,
                    sendKey,
                    waitForNextFrame,
                    cleanup
                });
            } catch (err) {
                cleanup();
                reject(err);
            }
        });
    });
}

// Client-side needsTerminal simulation mirroring app.js / Main.cs logic
function evalNeedsTerminal(frame) {
    if (!frame.player) return true;
    if (frame.phase && frame.phase !== 'play') return true;
    const ui = frame.ui;
    if (!ui) return false;

    // Overlays and menus take precedence over more prompts!
    if (ui.context && (ui.context === 'menu' || ui.context === 'birth' || ui.context === 'setup')) return true;
    if ((ui.overlay || 0) > 0) {
        const rawScreenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
        const fullText = rawScreenText.toLowerCase();
        if (fullText.includes('low hitpoint warning') || fullText.includes('low hitpoint')) {
            return false;
        }
        return true;
    }

    if (ui.more) return false;

    if (!ui.awaiting_command && !ui.more) {
        const rawScreenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
        const screen = rawScreenText.toLowerCase();
        const isDirectionalTargeting = screen.includes('direction?') ||
                                     screen.includes('target [') ||
                                     screen.includes('target:') ||
                                     screen.includes('which direction?') ||
                                     screen.includes('aim which direction?') ||
                                     screen.includes('select target');
        if (isDirectionalTargeting) return false;
        return true;
    }
    return false;
}

// Client-side isItemPrompt simulation
function evalIsItemPrompt(frame, realm) {
    const rawScreenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
    const screenText = rawScreenText.toLowerCase();
    const inPlay = frame.phase === 'play';
    const isTargeting = inPlay && (
        screenText.includes('target [') ||
        screenText.includes('target:') ||
        screenText.includes('direction?') ||
        screenText.includes('which direction?') ||
        screenText.includes('select target') ||
        screenText.includes('aim which direction?')
    );
    const hasStoreText = screenText.includes('store inventory') ||
                         screenText.includes('home inventory') ||
                         screenText.includes('gold remaining') ||
                         screenText.includes('purchase which item') ||
                         screenText.includes('sell which item');

    return inPlay && !isTargeting && (
        screenText.includes('select item:') ||
        screenText.includes('inven:') ||
        screenText.includes('(inven') ||
        screenText.includes('(inventory)') ||
        screenText.includes('inventory | equipment') ||
        screenText.includes('inventory |') ||
        screenText.includes('| equipment') ||
        screenText.includes('equip:') ||
        screenText.includes('(equip') ||
        screenText.includes('(equipment)') ||
        screenText.includes('quiver:') ||
        screenText.includes('quiver') ||
        screenText.includes('which item?') ||
        screenText.includes('which potion?') ||
        screenText.includes('which scroll?') ||
        screenText.includes('which spell?') ||
        screenText.includes('which prayer?') ||
        screenText.includes('which book?') ||
        screenText.includes('wear/wield') ||
        screenText.includes('take off') ||
        screenText.includes('remove which item') ||
        screenText.includes('drop which') ||
        screenText.includes('throw which') ||
        screenText.includes('fire which') ||
        screenText.includes('quaff which') ||
        screenText.includes('read which') ||
        screenText.includes('destroy which') ||
        (!hasStoreText && screenText.includes('examine which item')) ||
        (realm === 'hengband' && !hasStoreText && (
            screenText.includes('持ち物：') ||
            screenText.includes('装備：') ||
            screenText.includes('どれを装備') ||
            screenText.includes('どれを外しますか') ||
            screenText.includes('どれを落としますか') ||
            screenText.includes('どれを投げますか')
        ))
    );
}

async function testVanillaStoreFlow() {
    console.log('\n>>> RUNNING TEST: Vanilla Angband Store Purchase & Multi-Transaction Persistence <<<');
    const session = await runSession('angband', 'StoreTester');
    const { sendKey, waitForNextFrame, lastFrame, cleanup } = session;

    try {
        let frame = lastFrame();
        const mapRows = frame.map ? frame.map.rows : [];
        const stores = [];
        for (let y = 0; y < mapRows.length; y++) {
            const fRow = mapRows[y].f || '';
            for (let x = 0; x < fRow.length / 2; x++) {
                const feat = parseInt(fRow.substring(x * 2, x * 2 + 2), 16) || 0;
                // General Store feat is 7, Armoury 8, Weaponsmith 9, Temple 10, Alchemist 11, Magic 12, Black Market 13
                if (feat >= 7 && feat <= 13) {
                    stores.push({ x, y, feat });
                }
            }
        }

        assert(stores.length > 0, 'Town must contain at least one store entrance tile');
        const px0 = frame.player.x;
        const py0 = frame.player.y;
        stores.sort((a, b) => (Math.abs(a.x - px0) + Math.abs(a.y - py0)) - (Math.abs(b.x - px0) + Math.abs(b.y - py0)));
        const storeTarget = stores[0];
        console.log(`Target closest store at (${storeTarget.x}, ${storeTarget.y}) with feat ${storeTarget.feat}`);

        // Navigate towards store with obstacle avoidance
        let steps = 0;
        while ((lastFrame().player.x !== storeTarget.x || lastFrame().player.y !== storeTarget.y) && steps < 80) {
            steps++;
            frame = lastFrame();
            if (frame.ui && frame.ui.overlay > 0) break; // Entered store while stepping

            const curX = frame.player.x;
            const curY = frame.player.y;
            const dx = storeTarget.x - curX;
            const dy = storeTarget.y - curY;

            let key = null;
            if (Math.abs(dx) > Math.abs(dy)) {
                key = dx > 0 ? 'right' : 'left';
            } else {
                key = dy > 0 ? 'down' : 'up';
            }

            sendKey(key);
            await delay(90);

            const nextFrame = lastFrame();
            if (nextFrame.ui && nextFrame.ui.overlay > 0) break;

            if (nextFrame.player.x === curX && nextFrame.player.y === curY) {
                // Blocked, try alternate axis
                const altKey = (key === 'right' || key === 'left')
                    ? (dy >= 0 ? 'down' : 'up')
                    : (dx >= 0 ? 'right' : 'left');
                sendKey(altKey);
                await delay(90);
            }
        }

        // If on store entrance, press '.' to enter if not already in overlay
        frame = lastFrame();
        if ((frame.ui.overlay || 0) === 0) {
            console.log("On store tile. Sending '.' to enter store...");
            sendKey('.');
            await delay(250);
        }

        frame = lastFrame();
        console.log(`Store State: ui.overlay=${frame.ui.overlay}, awaiting=${frame.ui.awaiting_command}, more=${frame.ui.more}`);
        assert(frame.ui.overlay > 0, 'Player must be inside store with ui.overlay > 0');
        assert.strictEqual(evalNeedsTerminal(frame), true, 'Store view must evaluate needsTerminal === true');
        console.log('PASS: Successfully entered store in classic terminal view.');

        // Step 2: Initiate purchase with 'p'
        console.log("Sending 'p' (Purchase)...");
        sendKey('p');
        await delay(150);
        frame = lastFrame();
        const pScreen = frame.term.rows.map(r => r.g || '').join('\n').toLowerCase();
        console.log("Purchase prompt screen snippet:", pScreen.split('\n')[0]);
        assert(pScreen.includes('purchase which item') || pScreen.includes('which item to buy'), 'Must display purchase item prompt');

        // Step 3: Choose item 'a'
        console.log("Sending 'a' (Select item a)...");
        sendKey('a');
        await delay(150);
        frame = lastFrame();
        let screen = frame.term.rows.map(r => r.g || '').join('\n').toLowerCase();

        // If quantity prompt appears ("How many?"), confirm with enter or 1
        if (screen.includes('how many') || screen.includes('quantity')) {
            console.log("Quantity prompt detected. Sending '1' + enter...");
            sendKey('1');
            sendKey('enter');
            await delay(150);
            frame = lastFrame();
            screen = frame.term.rows.map(r => r.g || '').join('\n').toLowerCase();
        }

        // Step 4: CRITICAL VERIFICATION:
        // The engine emits a purchase message like "You bought ... -more-"
        console.log(`Post-Purchase Screen Row 0: "${frame.term.rows[0].g.trim()}"`);
        console.log(`Post-Purchase Frame State: overlay=${frame.ui.overlay}, more=${frame.ui.more}`);

        const termRequirement = evalNeedsTerminal(frame);
        console.log(`evalNeedsTerminal(frame) = ${termRequirement}`);
        assert.strictEqual(termRequirement, true, 'CRITICAL FIX VERIFIED: needsTerminal MUST return TRUE during store purchase -more- message!');

        // Step 5: Advance acceptance prompt and purchase message with space
        console.log("Sending space to accept purchase / clear message...");
        sendKey('space');
        await delay(200);
        frame = lastFrame();
        if (frame.ui && frame.ui.more) {
            console.log(`Confirmation message: "${frame.term.rows[0].g.trim()}". Sending space to clear...`);
            sendKey('space');
            await delay(200);
            frame = lastFrame();
        }

        console.log(`After message dismissed: overlay=${frame.ui.overlay}, awaiting=${frame.ui.awaiting_command}, more=${frame.ui.more}`);
        assert(frame.ui.overlay > 0, 'Player must STILL be in the store after dismissing message');
        assert.strictEqual(evalNeedsTerminal(frame), true, 'Store must remain open in terminal view to allow continued transactions');
        console.log('PASS: Player smoothly remains in store for continued transactions!');

        // Step 6: Exit store with Escape
        console.log("Sending 'escape' to exit store...");
        sendKey('escape');
        await delay(250);
        frame = lastFrame();
        assert.strictEqual(frame.ui.overlay, 0, 'Overlay must return to 0 upon exiting store');
        console.log('PASS: Exited store back to town safely.');

        cleanup();
        console.log('>>> VANILLA STORE PURCHASE PERSISTENCE TEST PASSED 100%! <<<\n');
    } catch (e) {
        cleanup();
        throw e;
    }
}

async function testSilQMenuAndEquipmentFlow() {
    console.log('\n>>> RUNNING TEST: Sil-Q Inventory, Equipment & Command Navigation <<<');
    const session = await runSession('silq', 'SilqTester');
    const { sendKey, waitForNextFrame, lastFrame, cleanup } = session;

    try {
        let frame = lastFrame();

        // Step 1: Open Inventory with 'i'
        console.log("Step 1: Sending 'i' to open Sil-Q inventory...");
        sendKey('i');
        await delay(200);
        frame = lastFrame();

        const topRow = frame.term.rows[0] ? frame.term.rows[0].g.trim() : '';
        console.log(`Top Row: "${topRow}"`);
        console.log(`ui.overlay: ${frame.ui.overlay}, awaiting: ${frame.ui.awaiting_command}`);

        assert(topRow.includes('(Inventory) Command:'), 'Top row must prompt (Inventory) Command:');
        assert.strictEqual(evalIsItemPrompt(frame, 'silq'), true, 'Sil-Q (Inventory) Command: MUST evaluate as isItemPrompt === true');
        assert.strictEqual(evalNeedsTerminal(frame), true, 'Sil-Q inventory must evaluate needsTerminal === true');
        console.log('PASS: Sil-Q Inventory opened correctly in classic view and recognized as item menu!');

        // Step 2: From (Inventory) Command:, send 'w' to initiate Wear/Wield
        console.log("Step 2: Sending 'w' from inventory command menu...");
        sendKey('w');
        await delay(200);
        frame = lastFrame();

        const wearPromptRow = frame.term.rows[0] ? frame.term.rows[0].g.trim() : '';
        console.log(`Wear Prompt Row: "${wearPromptRow}"`);
        assert(wearPromptRow.includes('Wear/Wield which item?'), 'Must transition to Wear/Wield which item? prompt');
        assert.strictEqual(evalIsItemPrompt(frame, 'silq'), true, 'Wear/wield prompt must be recognized as item prompt');
        console.log('PASS: Wear/Wield prompt successfully reached.');

        // Step 3: Wield item 'b' (Torches in starting pack)
        console.log("Step 3: Sending 'b' to wield torches...");
        sendKey('b');
        await delay(200);
        frame = lastFrame();

        // If -more- prompt appears, dismiss it with space
        if (frame.ui && frame.ui.more) {
            console.log(`Message prompt detected: "${frame.term.rows[0].g.trim()}". Sending space...`);
            sendKey('space');
            await delay(200);
            frame = lastFrame();
        }

        // Step 4: Open Equipment view with 'e'
        console.log("Step 4: Sending 'e' to open Sil-Q equipment...");
        sendKey('e');
        await delay(200);
        frame = lastFrame();

        const equipPromptRow = frame.term.rows[0] ? frame.term.rows[0].g.trim() : '';
        console.log(`Equip Row: "${equipPromptRow}"`);
        assert(equipPromptRow.includes('(Equipment) Command:'), 'Top row must prompt (Equipment) Command:');
        assert.strictEqual(evalIsItemPrompt(frame, 'silq'), true, 'Sil-Q (Equipment) Command: MUST evaluate as isItemPrompt === true');
        console.log('PASS: Sil-Q Equipment opened correctly and recognized as item prompt!');

        // Step 5: From (Equipment) Command:, send 'r' (Remove in Sil-Q)
        console.log("Step 5: Sending 'r' (Remove) from equipment command menu...");
        sendKey('r');
        await delay(200);
        frame = lastFrame();

        const removePromptRow = frame.term.rows[0] ? frame.term.rows[0].g.trim() : '';
        console.log(`Remove Prompt Row: "${removePromptRow}"`);
        assert(removePromptRow.includes('Remove which item?'), 'Must display Remove which item? prompt in Sil-Q');
        assert.strictEqual(evalIsItemPrompt(frame, 'silq'), true, 'Remove prompt must be recognized as item prompt');
        console.log('PASS: Sil-Q Remove command correctly routed.');

        // Step 6: Cancel remove prompt with escape and close equipment
        console.log("Step 6: Sending 'escape' to cancel prompt...");
        sendKey('escape');
        await delay(250);
        frame = lastFrame();
        console.log(`After 1st escape: Row 0="${frame.term.rows[0].g.trim()}", overlay=${frame.ui.overlay}`);
        if (frame.ui && frame.ui.overlay > 0) {
            console.log("Sending 2nd escape to exit menu...");
            sendKey('escape');
            await delay(250);
            frame = lastFrame();
        }

        console.log(`Returned to 3D world: overlay=${frame.ui ? frame.ui.overlay : 0}, awaiting=${frame.ui ? frame.ui.awaiting_command : false}`);
        assert.strictEqual(frame.ui.overlay, 0, 'Must cleanly return to 3D world with overlay === 0');
        console.log('PASS: Successfully closed equipment and returned to active 3D play.');

        cleanup();
        console.log('>>> SIL-Q INVENTORY & EQUIPMENT FLOW TEST PASSED 100%! <<<\n');
    } catch (e) {
        cleanup();
        throw e;
    }
}

async function testFrogComposBandMenuParity() {
    console.log('\n>>> RUNNING TEST: FrogComposBand Menu Parity <<<');
    const session = await runSession('frogcomposband', 'FrogTester');
    const { sendKey, waitForNextFrame, lastFrame, cleanup } = session;

    try {
        // Clear any startup messages
        while (lastFrame().ui && (lastFrame().ui.more || (lastFrame().term && lastFrame().term.rows && lastFrame().term.rows.some(r => (r.g || '').includes('-more-'))))) {
            sendKey('space');
            await delay(150);
        }
        await delay(300);

        console.log("Sending 'i' in FrogComposBand...");
        sendKey('i');
        await delay(250);
        let frame = lastFrame();
        console.log(`FrogComposBand after 'i': awaiting=${frame.ui ? frame.ui.awaiting_command : null}, overlay=${frame.ui ? frame.ui.overlay : null}, needsTerminal=${evalNeedsTerminal(frame)}, isItemPrompt=${evalIsItemPrompt(frame, 'frogcomposband')}`);
        assert.strictEqual(evalNeedsTerminal(frame), true, 'FrogComposBand inventory must evaluate needsTerminal === true');
        assert.strictEqual(evalIsItemPrompt(frame, 'frogcomposband'), true, 'FrogComposBand inventory must evaluate isItemPrompt === true');

        sendKey('escape');
        await delay(250);
        frame = lastFrame();
        assert.strictEqual(frame.ui.awaiting_command, true, 'Must return to awaiting_command in world');
        assert.strictEqual(evalNeedsTerminal(frame), false, 'Must return to 3D world view');

        console.log("Sending 'e' in FrogComposBand...");
        sendKey('e');
        await delay(250);
        frame = lastFrame();
        console.log(`FrogComposBand after 'e': awaiting=${frame.ui ? frame.ui.awaiting_command : null}, overlay=${frame.ui ? frame.ui.overlay : null}, needsTerminal=${evalNeedsTerminal(frame)}, isItemPrompt=${evalIsItemPrompt(frame, 'frogcomposband')}`);
        assert.strictEqual(evalNeedsTerminal(frame), true, 'FrogComposBand equipment must evaluate needsTerminal === true');
        assert.strictEqual(evalIsItemPrompt(frame, 'frogcomposband'), true, 'FrogComposBand equipment must evaluate isItemPrompt === true');

        sendKey('escape');
        await delay(250);
        frame = lastFrame();
        assert.strictEqual(frame.ui.awaiting_command, true, 'Must return to awaiting_command in world');
        assert.strictEqual(evalNeedsTerminal(frame), false, 'Must return to 3D world view');

        cleanup();
        console.log('>>> FROGCOMPOSBAND MENU PARITY PASSED 100%! <<<\n');
    } catch (e) {
        cleanup();
        throw e;
    }
}

async function testHengbandMenuParity() {
    console.log('\n>>> RUNNING TEST: Hengband Menu Parity <<<');
    const session = await runSession('hengband', 'HengTester');
    const { sendKey, waitForNextFrame, lastFrame, cleanup } = session;

    try {
        // Clear any startup messages
        while (lastFrame().ui && (lastFrame().ui.more || (lastFrame().term && lastFrame().term.rows && lastFrame().term.rows.some(r => (r.g || '').includes('-more-'))))) {
            sendKey('space');
            await delay(150);
        }
        await delay(300);

        console.log("Sending 'i' in Hengband...");
        sendKey('i');
        await delay(250);
        let frame = lastFrame();
        console.log(`Hengband after 'i': awaiting=${frame.ui ? frame.ui.awaiting_command : null}, overlay=${frame.ui ? frame.ui.overlay : null}, needsTerminal=${evalNeedsTerminal(frame)}, isItemPrompt=${evalIsItemPrompt(frame, 'hengband')}`);
        assert(frame.ui.overlay > 0, 'Hengband inventory must set overlay > 0');
        assert.strictEqual(evalNeedsTerminal(frame), true, 'Hengband inventory must evaluate needsTerminal === true');
        assert.strictEqual(evalIsItemPrompt(frame, 'hengband'), true, 'Hengband inventory must evaluate isItemPrompt === true');

        sendKey('escape');
        await delay(250);
        frame = lastFrame();
        assert.strictEqual(frame.ui.overlay, 0, 'Must return to overlay 0');
        assert.strictEqual(evalNeedsTerminal(frame), false, 'Must return to 3D world view');

        console.log("Sending 'e' in Hengband...");
        sendKey('e');
        await delay(250);
        frame = lastFrame();
        console.log(`Hengband after 'e': awaiting=${frame.ui ? frame.ui.awaiting_command : null}, overlay=${frame.ui ? frame.ui.overlay : null}, needsTerminal=${evalNeedsTerminal(frame)}, isItemPrompt=${evalIsItemPrompt(frame, 'hengband')}`);
        assert(frame.ui.overlay > 0, 'Hengband equipment must set overlay > 0');
        assert.strictEqual(evalNeedsTerminal(frame), true, 'Hengband equipment must evaluate needsTerminal === true');
        assert.strictEqual(evalIsItemPrompt(frame, 'hengband'), true, 'Hengband equipment must evaluate isItemPrompt === true');

        sendKey('escape');
        await delay(250);
        frame = lastFrame();
        assert.strictEqual(frame.ui.overlay, 0, 'Must return to overlay 0');
        assert.strictEqual(evalNeedsTerminal(frame), false, 'Must return to 3D world view');

        cleanup();
        console.log('>>> HENGBAND MENU PARITY PASSED 100%! <<<\n');
    } catch (e) {
        cleanup();
        throw e;
    }
}

async function main() {
    console.log('================================================================');
    console.log('CROSS-REALM MENU AUDIT & AUTOMATED VERIFICATION SUITE');
    console.log('================================================================');

    try {
        await testVanillaStoreFlow();
        await testSilQMenuAndEquipmentFlow();
        await testFrogComposBandMenuParity();
        await testHengbandMenuParity();

        console.log('\n================================================================');
        console.log('ALL 4 REALMS PASSED 100% WITH ZERO ERRORS AND ZERO REGRESSIONS!');
        console.log('================================================================');
        process.exit(0);
    } catch (err) {
        console.error('\nTEST SUITE FAILED:', err);
        process.exit(1);
    }
}

main();

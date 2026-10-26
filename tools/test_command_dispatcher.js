#!/usr/bin/env node
/**
 * tools/test_command_dispatcher.js
 *
 * Comprehensive test suite for CommandDispatcher (Card WS42.3C).
 * Covers:
 * 1. Replay across recorded sequences in tools/fixtures/sequences/<realm>/<scenario>.jsonl
 *    (>= 18 scenarios across all 4 realms).
 * 2. Handoff on unexpected -more- or mismatched item row (never guesses).
 * 3. User key cancellation (cancel('user-key')) aborts in-flight plan immediately with 0 further keys sent.
 * 4. Wall-clock timeout transitions to Failed without sending any key (L28).
 * 5. Unwind from overlay > 0 sends escape up to 3 times; refuses after 3 if still not idle (Law C11).
 * 6. KLM property: compiled plans from idle contain zero redundant prefix keys (Law C10).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const CommandDispatcher = require('../server/public/js/command-dispatcher');
const { replaySequence, SEQUENCES_DIR } = require('./lib/frame_replay');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}\n    ${err.message}`);
        throw err;
    }
}

async function asyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}\n    ${err.message}`);
        throw err;
    }
}

function makeIdleFrame(realm = 'angband', seq = 100) {
    return {
        t: 'frame',
        realm,
        seq,
        phase: 'play',
        ui: { overlay: 0, awaiting_command: true, more: false, context: 'play' },
        player: { name: 'Tester', hp: 20, hp_max: 20, resting: false },
        term: {
            w: 80,
            h: 24,
            cx: 0,
            cy: 0,
            rows: [
                { g: ' '.repeat(80), a: '01'.repeat(80) },
                { g: ' a) a Holy Book of Prayers                                3.0 lb', a: '01'.repeat(80) },
                { g: ' b) 2 Rations of Food                                     1.6 lb', a: '01'.repeat(80) },
                { g: ' i) ! a Potion of Cure Serious Wounds                     0.4 lb', a: '01'.repeat(80) }
            ]
        }
    };
}

async function runAll() {
    console.log('=== Test Suite: CommandDispatcher (WS42.3C) ===\n');

    // =========================================================================
    // 1. Replay across recorded sequences (>= 18 scenarios across all 4 realms)
    // =========================================================================
    console.log('--- 1. Replay Across Recorded Sequences ---');
    const realms = fs.readdirSync(SEQUENCES_DIR).filter(d => fs.statSync(path.join(SEQUENCES_DIR, d)).isDirectory());
    let scenarioCount = 0;

    for (const realm of realms) {
        const realmDir = path.join(SEQUENCES_DIR, realm);
        const files = fs.readdirSync(realmDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
            const scenario = path.basename(file, '.jsonl');
            test(`Replay ${realm}/${scenario}`, () => {
                const res = replaySequence(path.join(realmDir, file));
                assert.strictEqual(res.success, true);
                assert(res.sentKeys.length >= 1, `Expected at least 1 sent key for ${realm}/${scenario}`);
                scenarioCount++;
            });
        }
    }
    console.log(`  [Total sequence scenarios replayed: ${scenarioCount}]\n`);
    assert(scenarioCount >= 18, `Expected at least 18 scenarios across realms, replayed ${scenarioCount}`);

    // =========================================================================
    // 2. Handoff on Mismatched Item Row or Unexpected -more- (Never Guesses)
    // =========================================================================
    console.log('--- 2. Handoff on Mismatches & Unexpected Prompts ---');

    test('Handoff: item name mismatch stops plan without sending key', () => {
        const sentKeys = [];
        let currentFrame = makeIdleFrame('angband', 10);
        let handoffOccurred = false;

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame,
            onEvent: (ev, data) => {
                if (ev === 'dispatcher:handoff') handoffOccurred = true;
            }
        });

        // Intent expects item 'a' to be 'Potion of Speed', but row 'a' is 'Holy Book of Prayers'
        const started = dispatcher.run({
            verb: 'quaff',
            item: { letter: 'a', name: 'Potion of Speed' }
        });
        assert.strictEqual(started, true);
        assert.deepStrictEqual(sentKeys, ['q'], 'Step 0 sends verb key q');

        // Engine returns item prompt showing row 'a' is 'Holy Book of Prayers'
        currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 11,
            phase: 'play',
            ui: { overlay: 0, awaiting_command: false, more: false, context: 'play' },
            term: {
                w: 80,
                h: 24,
                rows: [
                    { g: 'Quaff which potion?' },
                    { g: ' a) a Holy Book of Prayers                                3.0 lb' }
                ]
            }
        };

        dispatcher.onFrame(currentFrame);

        // Verification failed because name 'Holy Book of Prayers' does not contain 'potion of speed'
        assert.strictEqual(handoffOccurred, true, 'Handoff event must be emitted');
        assert.strictEqual(dispatcher.lastResult, 'Handoff');
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.deepStrictEqual(sentKeys, ['q'], 'Never guess! Letter a must NOT be sent on mismatch');
    });

    test('Handoff: item letter absent from prompt rows stops plan cleanly', () => {
        const sentKeys = [];
        let currentFrame = makeIdleFrame('angband', 20);

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame
        });

        dispatcher.run({
            verb: 'quaff',
            item: { letter: 'z', name: 'Potion of Speed' }
        });
        assert.deepStrictEqual(sentKeys, ['q']);

        currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 21,
            phase: 'play',
            ui: { overlay: 0, awaiting_command: false, more: false, context: 'play' },
            term: {
                w: 80,
                h: 24,
                rows: [
                    { g: 'Quaff which potion?' },
                    { g: ' a) a Holy Book of Prayers' },
                    { g: ' b) 2 Rations of Food' }
                ]
            }
        };

        dispatcher.onFrame(currentFrame);
        assert.strictEqual(dispatcher.lastResult, 'Handoff');
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.deepStrictEqual(sentKeys, ['q'], 'Letter z not in visible rows -> Handoff with 0 keys sent');
    });

    test('Handoff: unexpected -more- during multi-step plan pauses for Mirror', () => {
        const sentKeys = [];
        let currentFrame = makeIdleFrame('angband', 30);
        let handoffEvent = null;

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame,
            onEvent: (ev, data) => {
                if (ev === 'dispatcher:handoff') handoffEvent = data;
            }
        });

        // Drop item b qty 3
        dispatcher.run({ verb: 'drop', item: 'b', qty: 3 });
        assert.deepStrictEqual(sentKeys, ['d']);

        // Instead of item prompt, engine shows an unexpected message with -more-
        currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 31,
            phase: 'play',
            ui: { overlay: 0, awaiting_command: false, more: true, context: 'play' },
            term: {
                w: 80,
                h: 24,
                rows: [
                    { g: 'You feel a sudden shudder through the earth. -more-' }
                ]
            }
        };

        dispatcher.onFrame(currentFrame);
        assert.strictEqual(dispatcher.lastResult, 'Handoff');
        assert.strictEqual(handoffEvent && handoffEvent.reason, 'unexpected-more');
        assert.deepStrictEqual(sentKeys, ['d'], 'No further keys sent into unexpected -more- prompt');
    });

    // =========================================================================
    // 3. User Key Cancellation (cancel('user-key'))
    // =========================================================================
    console.log('--- 3. User Cancellation (Law C2 / Raskin) ---');

    test('cancel("user-key") immediately aborts in-flight plan and sends 0 further keys', () => {
        const sentKeys = [];
        let currentFrame = makeIdleFrame('angband', 40);
        let cancelEvent = null;

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame,
            onEvent: (ev, data) => {
                if (ev === 'dispatcher:cancel') cancelEvent = data;
            }
        });

        dispatcher.run({ verb: 'quaff', item: 'i' });
        assert.strictEqual(dispatcher.state, 'Awaiting');
        assert.deepStrictEqual(sentKeys, ['q']);

        // User hits a physical key -> InputRouter cancels dispatcher
        const didCancel = dispatcher.cancel('user-key');
        assert.strictEqual(didCancel, true);
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.strictEqual(dispatcher.lastResult, 'Cancelled');
        assert.strictEqual(cancelEvent && cancelEvent.reason, 'user-key');

        // Engine prompt frame arrives later
        currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 41,
            phase: 'play',
            ui: { overlay: 0, awaiting_command: false, more: false, context: 'play' },
            term: {
                w: 80,
                h: 24,
                rows: [{ g: 'Quaff which potion?' }]
            }
        };

        dispatcher.onFrame(currentFrame);
        assert.deepStrictEqual(sentKeys, ['q'], 'Zero keys sent after user cancellation');
        assert.strictEqual(dispatcher.state, 'Idle');
    });

    test('cancel() on already Idle dispatcher returns false', () => {
        const dispatcher = new CommandDispatcher();
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.strictEqual(dispatcher.cancel('any'), false);
    });

    // =========================================================================
    // 4. Wall-Clock Deadline Timer Transitions to Failed Without Sending Keys
    // =========================================================================
    console.log('--- 4. Wall-Clock Deadline Timer (CMD-P1-14 / L28) ---');

    await asyncTest('Deadline timeout transitions to Failed with zero keys sent', async () => {
        const sentKeys = [];
        const toasts = [];
        let currentFrame = makeIdleFrame('angband', 50);

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame,
            onToast: (msg) => toasts.push(msg),
            timeoutMs: 40 // short timeout for test
        });

        dispatcher.run({ verb: 'quaff', item: 'i' });
        assert.deepStrictEqual(sentKeys, ['q']);
        assert.strictEqual(dispatcher.state, 'Awaiting');

        // Wait for timeout to fire
        await new Promise(resolve => setTimeout(resolve, 80));

        assert.strictEqual(dispatcher.lastResult, 'Failed');
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.deepStrictEqual(sentKeys, ['q'], 'NEVER send a key on timeout! (L28)');
        assert(toasts.some(t => t.includes('timed out')), 'Toast emitted on timeout');
    });

    // =========================================================================
    // 5. Unwinding State Machine (Law C11)
    // =========================================================================
    console.log('--- 5. Unwinding State Machine (Law C11) ---');

    test('Unwind: overlay > 0 sends escape up to 3 times, then fails without injecting verb', () => {
        const sentKeys = [];
        const toasts = [];
        // Engine is stuck in an overlay screen
        let currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 60,
            phase: 'play',
            ui: { overlay: 1, awaiting_command: false, more: false, context: 'screen' }
        };

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame,
            onToast: (msg) => toasts.push(msg)
        });

        // Intent submitted while not idle
        const started = dispatcher.run({ verb: 'quaff', item: 'i' });
        assert.strictEqual(started, true);
        assert.strictEqual(dispatcher.state, 'Unwinding');
        assert.deepStrictEqual(sentKeys, ['escape'], 'First unwind step sends escape');

        // Frame 1 arrives: still in overlay
        currentFrame = { ...currentFrame, seq: 61 };
        dispatcher.onFrame(currentFrame);
        assert.deepStrictEqual(sentKeys, ['escape', 'escape'], 'Second unwind step sends escape');

        // Frame 2 arrives: still in overlay
        currentFrame = { ...currentFrame, seq: 62 };
        dispatcher.onFrame(currentFrame);
        assert.deepStrictEqual(sentKeys, ['escape', 'escape', 'escape'], 'Third unwind step sends escape');

        // Frame 3 arrives: still in overlay -> refuses after 3!
        currentFrame = { ...currentFrame, seq: 63 };
        dispatcher.onFrame(currentFrame);

        assert.strictEqual(dispatcher.lastResult, 'Failed');
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.deepStrictEqual(sentKeys, ['escape', 'escape', 'escape'], 'Verb key "q" was NEVER injected into screen!');
        assert(toasts.some(t => t.includes('unwound')), 'Toast emitted on unwind refusal');
    });

    test('Unwind: successful unwind from overlay > 0 returns to idle then executes plan', () => {
        const sentKeys = [];
        let currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 70,
            phase: 'play',
            ui: { overlay: 2, awaiting_command: false, more: false, context: 'character' }
        };

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame
        });

        dispatcher.run({ verb: 'open', dir: '6' });
        assert.deepStrictEqual(sentKeys, ['escape']);

        // Frame 1: back to idle!
        currentFrame = makeIdleFrame('angband', 71);
        dispatcher.onFrame(currentFrame);

        // Dispatcher transitions to Running and executes 'o'
        assert.deepStrictEqual(sentKeys, ['escape', 'o']);

        // Frame 2: direction prompt
        currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 72,
            phase: 'play',
            ui: { overlay: 0, awaiting_command: false, more: false, context: 'play' },
            term: { rows: [{ g: 'Open door in which direction?' }] }
        };
        dispatcher.onFrame(currentFrame);
        assert.deepStrictEqual(sentKeys, ['escape', 'o', '6']);

        // Frame 3: door opened, back to idle
        currentFrame = makeIdleFrame('angband', 73);
        dispatcher.onFrame(currentFrame);

        assert.strictEqual(dispatcher.lastResult, 'Done');
        assert.strictEqual(dispatcher.state, 'Idle');
    });

    test('Unwind: modal prompt (overlay === 0 && !awaiting_command) refuses immediately without injecting verb', () => {
        const sentKeys = [];
        const toasts = [];
        const currentFrame = {
            t: 'frame',
            realm: 'angband',
            seq: 80,
            phase: 'play',
            ui: { overlay: 0, awaiting_command: false, more: false, context: 'play' },
            term: { rows: [{ g: 'Target [5/./t to target]:' }] }
        };

        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sentKeys.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => currentFrame,
            onToast: (msg) => toasts.push(msg)
        });

        // Intent submitted while modal direction prompt is open
        const started = dispatcher.run({ verb: 'quaff', item: 'i' });
        assert.strictEqual(started, false);
        assert.strictEqual(dispatcher.lastResult, 'Failed');
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.deepStrictEqual(sentKeys, [], 'Zero keys sent into modal prompt!');
        assert(toasts.some(t => t.includes('Cannot perform action during prompt')));
    });

    // =========================================================================
    // 6. KLM / GOMS Property (Zero Redundant Prefix Keys)
    // =========================================================================
    console.log('--- 6. KLM / GOMS Property (Law C10) ---');

    test('KLM: compiled plans from idle contain zero redundant prefix keys', () => {
        const dispatcher = new CommandDispatcher();
        const idleFrame = makeIdleFrame('angband', 90);

        // Direct command: exactly 1 key
        const openPlan = dispatcher.compilePlan({ verb: 'open' }, idleFrame, 'angband');
        assert.strictEqual(openPlan.length, 1);
        assert.strictEqual(openPlan[0].send, 'o');

        // Item action (quaff i): exactly 2 keys (q, i)
        const quaffPlan = dispatcher.compilePlan({ verb: 'quaff', item: 'i' }, idleFrame, 'angband');
        assert.strictEqual(quaffPlan.length, 2);
        assert.strictEqual(quaffPlan[0].send, 'q');
        assert.strictEqual(quaffPlan[1].send, 'i');

        // Drop item b qty 3: exactly 4 keys (d, b, 3, enter)
        const dropPlan = dispatcher.compilePlan({ verb: 'drop', item: 'b', qty: 3 }, idleFrame, 'angband');
        assert.strictEqual(dropPlan.length, 4);
        assert.strictEqual(dropPlan[0].send, 'd');
        assert.strictEqual(dropPlan[1].send, 'b');
        assert.strictEqual(dropPlan[2].send, '3');
        assert.strictEqual(dropPlan[3].send, 'enter');

        // Cast book a spell a dir target: exactly 4 keys (m, a, a, target)
        const castPlan = dispatcher.compilePlan({ verb: 'cast', book: 'a', spell: 'a', dir: "'" }, idleFrame, 'angband');
        assert.strictEqual(castPlan.length, 4);
        assert.strictEqual(castPlan[0].send, 'm');
        assert.strictEqual(castPlan[1].send, 'a');
        assert.strictEqual(castPlan[2].send, 'a');
        assert.strictEqual(castPlan[3].send, "'");

        // Sil-Q rest: 1 key (%)
        const silqRestPlan = dispatcher.compilePlan({ verb: 'rest' }, idleFrame, 'silq');
        assert.strictEqual(silqRestPlan.length, 1);
        assert.strictEqual(silqRestPlan[0].send, '%');

        // Vanilla rest: 2 keys (R, enter)
        const vanillaRestPlan = dispatcher.compilePlan({ verb: 'rest' }, idleFrame, 'angband');
        assert.strictEqual(vanillaRestPlan.length, 2);
        assert.strictEqual(vanillaRestPlan[0].send, 'R');
        assert.strictEqual(vanillaRestPlan[1].send, 'enter');

        // Sil-Q takeoff: 2 keys (r, a)
        const silqTakeoff = dispatcher.compilePlan({ verb: 'takeoff', item: 'a' }, idleFrame, 'silq');
        assert.strictEqual(silqTakeoff.length, 2);
        assert.strictEqual(silqTakeoff[0].send, 'r');
        assert.strictEqual(silqTakeoff[1].send, 'a');

        // Assert no redundant prefixes in any of these plans
        for (const plan of [openPlan, quaffPlan, dropPlan, castPlan, silqRestPlan, vanillaRestPlan, silqTakeoff]) {
            assert.notStrictEqual(plan[0].send, 'escape', 'Plan must not prefix escape when compiled from idle');
            assert.notStrictEqual(plan[0].send, 'space', 'Plan must not prefix space when compiled from idle');
        }
    });

    test('Zero idle allocations: onFrame returns immediately when state is Idle', () => {
        const dispatcher = new CommandDispatcher();
        assert.strictEqual(dispatcher.state, 'Idle');
        // Calling onFrame when idle must be a no-op
        dispatcher.onFrame(makeIdleFrame('angband', 99));
        assert.strictEqual(dispatcher.state, 'Idle');
        assert.strictEqual(dispatcher.lastFrame, null);
    });

    test('ScreenContext.ScreenModel integration sets isIdle=true on idle frame and does not unwind with escape', () => {
        const ScreenContext = require('../server/public/js/screen-context.js');
        const sent = [];
        const idleFrame = makeIdleFrame('angband', 100);
        const dispatcher = new CommandDispatcher({
            sendKey: (k) => sent.push(k),
            getRealm: () => 'angband',
            getLastFrame: () => idleFrame,
            ScreenModel: ScreenContext.ScreenModel
        });
        const started = dispatcher.run({ verb: 'wield' });
        assert.strictEqual(started, true);
        assert.deepStrictEqual(sent, ['w'], 'Must send w directly without prefixing escape');
        assert.strictEqual(dispatcher.state, 'Awaiting');
        dispatcher.onFrame(makeIdleFrame('angband', 101));
        assert.strictEqual(dispatcher.state, 'Idle');
    });

    test('CommandPalette single-verb song and power intents open menu without auto-selecting slot a', () => {
        const dispatcher = new CommandDispatcher();
        const songPlan = dispatcher.compilePlan({ verb: 'song' }, makeIdleFrame('silq', 10), 'silq');
        assert.strictEqual(songPlan.length, 1);
        assert.strictEqual(songPlan[0].send, 's');

        const powerPlan = dispatcher.compilePlan({ verb: 'power' }, makeIdleFrame('frogcomposband', 10), 'frogcomposband');
        assert.strictEqual(powerPlan.length, 1);
        assert.strictEqual(powerPlan[0].send, 'U');
    });

    console.log(`\nAll tests passed! (${passedTests}/${totalTests})`);
}

runAll().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});

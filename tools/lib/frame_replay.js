/**
 * tools/lib/frame_replay.js — Replay Harness for CommandDispatcher
 *
 * WS42 Command & Menu Unification (Card WS42.3C).
 * Loads recorded sequence fixtures (tools/fixtures/sequences/<realm>/<scenario>.jsonl)
 * and steps CommandDispatcher through the frames, asserting each sent key matches
 * the recorded sequence and finishes in Done or Handoff cleanly.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const CommandDispatcher = require('../../server/public/js/command-dispatcher');

const SEQUENCES_DIR = path.resolve(__dirname, '..', 'fixtures', 'sequences');

function loadSequence(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw
        .split(/\r?\n/)
        .filter(line => line.trim().length > 0)
        .map((line, idx) => {
            try {
                return JSON.parse(line);
            } catch (err) {
                throw new Error(`Failed to parse line ${idx + 1} of ${filePath}: ${err.message}`);
            }
        });
}

function deriveIntent(scenario, realm, steps) {
    const r = (realm || 'angband').toLowerCase();
    switch (scenario) {
        case 'quaff_8th_item':
            return { verb: 'quaff', item: (r === 'angband' ? 'i' : 'h') };
        case 'wield_from_i':
            return { verb: 'wield_from_i', item: 'a' };
        case 'takeoff':
            return { verb: 'takeoff', item: 'a' };
        case 'drop_qty':
            return { verb: 'drop', item: 'b', qty: 3 };
        case 'throw_target':
            return { verb: 'throw', item: 'a', dir: '5' };
        case 'fire_nearest':
            return { verb: 'fire', target: 'nearest' };
        case 'cast_target':
            return { verb: 'cast', book: 'a', spell: 'a', dir: "'" };
        case 'song':
            return { verb: 'song', spell: 'a' };
        case 'power':
            return { verb: 'power', spell: 'a' };
        case 'rest_prompt':
            return { verb: 'rest', qty: 'enter' };
        case 'yesno_ignore':
            return { verb: 'ignore', confirm: 'n' };
        case 'direction_open':
            return { verb: 'open', dir: '6' };
        case 'more_chain':
            return { verb: 'more' };
        case 'store_buy':
            return { verb: 'store_buy', item: 'a', qty: 1 };
        case 'char_sheet':
            return { verb: 'char_sheet', key: steps[0] && steps[0].sent, dismiss: true };
        case 'knowledge':
            return { verb: 'knowledge', dismiss: true };
        case 'vanilla_item_context_menu':
            return { verb: 'item_context_menu', item: 'a', dismiss: true };
        case 'fcb_heng_enter_menu':
            return { verb: 'menu', dismiss: true };
        case 'heng_en_inventory':
        case 'heng_jp_inventory':
            return { verb: 'inven', dismiss: true };
        default:
            return { verb: scenario };
    }
}

function replaySequence(filePathOrSteps, options = {}) {
    let steps;
    let realm = options.realm;
    let scenario = options.scenario;

    if (typeof filePathOrSteps === 'string') {
        const filePath = filePathOrSteps;
        steps = loadSequence(filePath);
        if (!scenario) {
            scenario = path.basename(filePath, '.jsonl');
        }
        if (!realm) {
            realm = path.basename(path.dirname(filePath));
        }
    } else {
        steps = filePathOrSteps;
    }

    if (!steps || steps.length === 0) {
        throw new Error('Cannot replay an empty sequence');
    }

    realm = (realm || 'angband').toLowerCase();
    scenario = scenario || 'unknown';

    const intent = options.intent || deriveIntent(scenario, realm, steps);
    const sentKeys = [];
    let currentFrame = steps[0].frame;

    const dispatcher = new CommandDispatcher({
        sendKey: (key) => {
            sentKeys.push(key);
        },
        getRealm: () => realm,
        getLastFrame: () => currentFrame,
        timeoutMs: options.timeoutMs || 5000,
        ...options.deps
    });

    // Run intent
    const started = dispatcher.run(intent, { realm });
    assert.strictEqual(started, true, `Dispatcher.run() should return true for ${realm}/${scenario}`);

    // Verify step 0 key
    const expectedKey0 = steps[0].sent;
    assert.strictEqual(
        sentKeys.length, 1,
        `Expected dispatcher to send exactly 1 key on step 0 for ${realm}/${scenario}, got ${sentKeys.length}`
    );
    assert.strictEqual(
        sentKeys[0], expectedKey0,
        `Step 0 key mismatch for ${realm}/${scenario}: expected "${expectedKey0}", got "${sentKeys[0]}"`
    );

    // Feed subsequent frames
    for (let i = 1; i < steps.length; i++) {
        currentFrame = steps[i].frame;
        dispatcher.onFrame(currentFrame);

        const expectedKey = steps[i].sent;
        if (expectedKey !== null) {
            assert.strictEqual(
                sentKeys.length, i + 1,
                `Expected dispatcher to have sent ${i + 1} keys after step ${i} for ${realm}/${scenario}, got ${sentKeys.length}`
            );
            assert.strictEqual(
                sentKeys[i], expectedKey,
                `Step ${i} key mismatch for ${realm}/${scenario}: expected "${expectedKey}", got "${sentKeys[i]}"`
            );
        } else {
            // Final frame (sent: null)
            assert.strictEqual(
                sentKeys.length, i,
                `Expected dispatcher to stop sending keys at end of ${realm}/${scenario}, sentKeys: ${JSON.stringify(sentKeys)}`
            );
            const state = dispatcher.lastResult || dispatcher.state;
            assert(
                state === 'Done' || state === 'Handoff' || state === 'Idle',
                `Expected dispatcher to finish in Done, Handoff, or Idle for ${realm}/${scenario}, got: ${state}`
            );
        }
    }

    return {
        success: true,
        realm,
        scenario,
        totalSteps: steps.length,
        sentKeys,
        finalState: dispatcher.lastResult || dispatcher.state
    };
}

module.exports = {
    SEQUENCES_DIR,
    loadSequence,
    deriveIntent,
    replaySequence
};

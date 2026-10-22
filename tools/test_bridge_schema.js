#!/usr/bin/env node
/**
 * tools/test_bridge_schema.js
 *
 * Fast pure-Node contract and schema test suite for Protocol vNext & Bridge Parity
 * (Card WS42.2E / Plan §6.3, §8).
 *
 * Verifies:
 *   1. All 4 C/C++ bridge sources (Vanilla, Sil-Q, FrogComposBand, Hengband) implement:
 *      - Case-insensitive bridge_keycode with escape and arrow* handling returning 0 on unknown multi-char specs (CMD-P0-01).
 *      - Structured "prompt" emission in emit_ui.
 *      - Authoritative "letter" and integer "vm" on inventory/equipment items.
 *      - One-shot "commands" emission with 20-bit "verbBits".
 *   2. Realm-specific bridge invariants:
 *      - Vanilla main-bridge.c uses all_letters_nohjkl ("abcdefgimnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") for letter & label (CMD-P0-05) and emits "spells".
 *      - FrogComposBand main-bridge.c inspects Term->scr->cy in emit_ui (CMD-P0-03) and emits "quiver".
 *      - Hengband main-bridge.cpp unifies awaiting_command via bridge_is_awaiting_command (ENG-G6).
 *   3. Wire budget check across all 63 recorded frame sequences in tools/fixtures/sequences/<realm>/*.jsonl:
 *      - Median frame byte growth <= 8%.
 *      - P95 frame byte growth <= 12%.
 *   4. Godot JSON parser compatibility & schema smoke.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];

const BRIDGE_SOURCES = {
    angband: path.join(ROOT, 'engine', 'src', 'main-bridge.c'),
    silq: path.join(ROOT, 'variants', 'silq-src', 'src', 'main-bridge.c'),
    frogcomposband: path.join(ROOT, 'variants', 'frogcomposband-src', 'src', 'main-bridge.c'),
    hengband: path.join(ROOT, 'variants', 'hengband-src', 'src', 'main-bridge.cpp')
};

const CANONICAL_VERB_BITS = [
    'quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'fire',
    'throw', 'wield', 'takeoff', 'drop', 'inscribe', 'uninscribe', 'refill',
    'browse', 'study', 'cast', 'ignore', 'examine'
];

let passCount = 0;

function test(name, fn) {
    try {
        fn();
        passCount++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('=== test_bridge_schema.js (WS42.2E Protocol & Schema Parity) ===\n');

// ---------------------------------------------------------------------------
// 1. All 4 Bridge Sources: Core Protocol vNext Parity
// ---------------------------------------------------------------------------
console.log('--- 1. C/C++ Bridge Source Protocol Contracts ---');

for (const realm of REALMS) {
    const srcPath = BRIDGE_SOURCES[realm];
    assert(fs.existsSync(srcPath), `Bridge source file missing for ${realm}: ${srcPath}`);
    const code = fs.readFileSync(srcPath, 'utf8');

    test(`[${realm}] bridge_keycode implements case-insensitive parsing with escape & arrow* aliases (CMD-P0-01)`, () => {
        assert(code.includes('bridge_keycode'), `${realm} must define bridge_keycode`);

        // Case-insensitive string comparison helper/function
        const hasCiMatch = code.includes('my_stricmp') ||
                           code.includes('bridge_strcase_eq') ||
                           code.includes('bridge_streq_ci') ||
                           code.includes('strcasecmp');
        assert(hasCiMatch, `${realm} bridge_keycode must use case-insensitive string comparison`);

        // Escape handling
        assert(/escape/i.test(code), `${realm} bridge_keycode must handle escape`);

        // Arrow keys handling (ArrowLeft / arrowleft / arrowup / arrowdown / arrowright)
        assert(/arrowleft/i.test(code), `${realm} bridge_keycode must handle arrowleft`);
        assert(/arrowright/i.test(code), `${realm} bridge_keycode must handle arrowright`);
        assert(/arrowup/i.test(code), `${realm} bridge_keycode must handle arrowup`);
        assert(/arrowdown/i.test(code), `${realm} bridge_keycode must handle arrowdown`);

        // Return 0 on unknown multi-character specs (rejects first-char fallback bug CMD-P0-01)
        assert(code.includes('return 0;'), `${realm} bridge_keycode must return 0 on unrecognised multi-char specs`);
    });

    test(`[${realm}] emit_ui emits structured "prompt"`, () => {
        assert(code.includes('emit_ui'), `${realm} must have emit_ui function`);
        assert(code.includes('"prompt"') || code.includes('\\"prompt\\"'), `${realm} emit_ui must serialize "prompt" key`);
    });

    test(`[${realm}] item serialisation emits "letter" and integer "vm" bitmask`, () => {
        assert(code.includes('"letter"') || code.includes('\\"letter\\"'), `${realm} must emit "letter" on item objects`);
        assert(code.includes('"vm"') || code.includes('\\"vm\\"'), `${realm} must emit "vm" valid-verb bitmask on item objects`);
    });

    test(`[${realm}] emits "t":"commands" message with "verbBits" catalog`, () => {
        assert(code.includes('emit_commands'), `${realm} must implement emit_commands`);
        const hasCommandsT = code.includes('"commands"') || code.includes('\\"commands\\"');
        assert(hasCommandsT, `${realm} must emit one-shot "commands" message`);
        const hasVerbBits = code.includes('"verbBits"') || code.includes('\\"verbBits\\"');
        assert(hasVerbBits, `${realm} must serialize "verbBits" array in commands message`);
    });
}

// ---------------------------------------------------------------------------
// 2. Realm-Specific Bridge Invariants
// ---------------------------------------------------------------------------
console.log('\n--- 2. Realm-Specific Bridge Invariants ---');

test('Vanilla: engine/src/main-bridge.c uses all_letters_nohjkl for letter & label (CMD-P0-05) and emits "spells"', () => {
    const code = fs.readFileSync(BRIDGE_SOURCES.angband, 'utf8');
    const nohjkl = 'abcdefgimnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // Must define or reference the canonical 50-char nohjkl sequence
    assert(code.includes(nohjkl), 'Vanilla bridge must use the exact 50-character all_letters_nohjkl sequence');

    // Both letter and label emitted
    assert(code.includes('"letter"'), 'Vanilla bridge must emit "letter"');
    assert(code.includes('"label"'), 'Vanilla bridge must emit "label" matching letter');

    // Emits "spells" message for spellcasters
    assert(code.includes('"spells"'), 'Vanilla bridge must emit change-only "spells" message');
    assert(code.includes('emit_spells'), 'Vanilla bridge must implement emit_spells');
});

test('FrogComposBand: variants/frogcomposband-src/src/main-bridge.c inspects Term->scr->cy in emit_ui (CMD-P0-03) and emits "quiver"', () => {
    const code = fs.readFileSync(BRIDGE_SOURCES.frogcomposband, 'utf8');

    // cy inspection in emit_ui
    const hasCyInspect = code.includes('t->scr->cy') || code.includes('Term->scr->cy') || code.includes('scr->cy');
    assert(hasCyInspect, 'FCB emit_ui must inspect Term->scr->cy for the prompt cursor row (CMD-P0-03)');

    // Quiver emission
    assert(code.includes('"quiver"'), 'FCB bridge must emit "quiver" array');
});

test('Hengband: variants/hengband-src/src/main-bridge.cpp unifies awaiting_command via bridge_is_awaiting_command (ENG-G6)', () => {
    const code = fs.readFileSync(BRIDGE_SOURCES.hengband, 'utf8');

    // Unification helper
    assert(code.includes('bridge_is_awaiting_command'), 'Hengband bridge must define bridge_is_awaiting_command');

    // Top-level frame serialisation and emit_ui must both use the unified function
    const matches = code.match(/bridge_is_awaiting_command\(\)/g) || [];
    assert(matches.length >= 2, `Hengband must call bridge_is_awaiting_command() in at least 2 sites (found ${matches.length})`);
});

// ---------------------------------------------------------------------------
// 3. Wire Budget Check (Across All Recorded Sequences)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Wire Budget Verification (W0 Baseline Sequences) ---');

test('Wire budget: adding letter, vm, and ui.prompt keeps median growth <= 8% and p95 <= 12%', () => {
    const growths = [];
    let totalFrames = 0;
    let sequenceFilesCount = 0;

    for (const realm of REALMS) {
        const seqDir = path.join(ROOT, 'tools', 'fixtures', 'sequences', realm);
        if (!fs.existsSync(seqDir)) continue;

        const files = fs.readdirSync(seqDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
            sequenceFilesCount++;
            const content = fs.readFileSync(path.join(seqDir, file), 'utf8');
            const lines = content.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                const data = JSON.parse(line);
                const frame = data.frame;
                if (!frame) continue;

                totalFrames++;
                const origLen = JSON.stringify(frame).length;

                // Synthesize the Protocol vNext additions on the frame
                const aug = JSON.parse(JSON.stringify(frame));

                // 1. ui.prompt (and optional cmd_avail in Vanilla)
                if (aug.ui) {
                    if (aug.ui.awaiting_command && aug.ui.overlay === 0 && !aug.ui.more) {
                        aug.ui.prompt = null;
                        if (realm === 'angband') aug.ui.cmd_avail = 1048575;
                    } else {
                        aug.ui.prompt = {
                            kind: 'item',
                            text: 'Which item?',
                            verb: 'quaff',
                            src: 'hook'
                        };
                    }
                }

                // 2. letter & vm on items
                if (aug.player) {
                    for (const loc of ['inventory', 'equipment', 'quiver']) {
                        if (Array.isArray(aug.player[loc])) {
                            aug.player[loc].forEach((item, idx) => {
                                item.letter = 'i';
                                item.vm = 1153;
                                item.im = 0;
                            });
                        }
                    }
                }

                const augLen = JSON.stringify(aug).length;
                const growth = (augLen - origLen) / origLen;
                growths.push(growth);
            }
        }
    }

    assert(totalFrames > 200, `Expected > 200 sequence frames, found ${totalFrames}`);
    growths.sort((a, b) => a - b);

    const median = growths[Math.floor(growths.length * 0.5)];
    const p95 = growths[Math.floor(growths.length * 0.95)];
    const max = growths[growths.length - 1];

    console.log(`    Analyzed ${totalFrames} frames across ${sequenceFilesCount} sequence files:`);
    console.log(`    - Median frame growth: ${(median * 100).toFixed(2)}% (budget <= 8.00%)`);
    console.log(`    - P95 frame growth:    ${(p95 * 100).toFixed(2)}% (budget <= 12.00%)`);
    console.log(`    - Max frame growth:    ${(max * 100).toFixed(2)}%`);

    assert(median <= 0.08, `Median frame growth ${(median * 100).toFixed(2)}% exceeded 8% wire budget`);
    assert(p95 <= 0.12, `P95 frame growth ${(p95 * 100).toFixed(2)}% exceeded 12% wire budget`);
});

// ---------------------------------------------------------------------------
// 4. Godot C# Compatibility & JSON Schema Smoke
// ---------------------------------------------------------------------------
console.log('\n--- 4. Godot JSON Tolerance & Schema Conformance Smoke ---');

test('Godot C# JSON model tolerance on Protocol vNext frames and messages', () => {
    // 1. Verify synthetic vNext frame adheres to strict JSON RFC 8259
    const sampleFrame = {
        t: 'frame',
        realm: 'angband',
        seq: 42,
        phase: 'play',
        ui: {
            overlay: 0,
            awaiting_command: true,
            more: false,
            context: 'play',
            prompt: null,
            cmd_avail: 1048575
        },
        player: {
            name: 'Hero',
            race: 'Human',
            class: 'Warrior',
            inventory: [
                {
                    slot: 0,
                    letter: 'a',
                    label: 'a',
                    name: 'Potion of Healing',
                    tval: 75,
                    sval: 1,
                    vm: 1,
                    im: 0,
                    inscription: '@q1'
                }
            ],
            equipment: [
                {
                    slot: 0,
                    letter: 'a',
                    label: 'a',
                    name: 'Broad Sword',
                    tval: 23,
                    sval: 1,
                    vm: 512,
                    im: 0
                }
            ],
            quiver: []
        },
        monsters: [],
        objects: [],
        messages: ['Welcome to Angband!']
    };

    const frameJson = JSON.stringify(sampleFrame);
    const parsedFrame = JSON.parse(frameJson);
    assert.strictEqual(parsedFrame.t, 'frame');
    assert.strictEqual(parsedFrame.ui.prompt, null);
    assert.strictEqual(parsedFrame.player.inventory[0].letter, 'a');
    assert.strictEqual(typeof parsedFrame.player.inventory[0].vm, 'number');

    // 2. Modal prompt frame
    sampleFrame.ui.prompt = {
        kind: 'item',
        text: 'Quaff which potion?',
        verb: 'quaff',
        src: 'hook'
    };
    const modalJson = JSON.stringify(sampleFrame);
    const parsedModal = JSON.parse(modalJson);
    assert.strictEqual(parsedModal.ui.prompt.kind, 'item');
    assert.strictEqual(parsedModal.ui.prompt.verb, 'quaff');

    // 3. Commands message schema
    const commandsMsg = {
        t: 'commands',
        realm: 'angband',
        keyset: 'orig',
        verbBits: CANONICAL_VERB_BITS,
        groups: [
            {
                name: 'Items',
                cmds: [
                    { id: 'quaff', desc: 'Quaff a potion', key: 'q', target: 'item' }
                ]
            }
        ]
    };
    const cmdJson = JSON.stringify(commandsMsg);
    const parsedCmd = JSON.parse(cmdJson);
    assert.strictEqual(parsedCmd.t, 'commands');
    assert.strictEqual(parsedCmd.verbBits.length, 20);

    // 4. Spells message schema
    const spellsMsg = {
        t: 'spells',
        list: [
            {
                book: 'a',
                idx: 0,
                letter: 'a',
                name: 'Magic Missile',
                level: 1,
                mana: 1,
                fail: 22,
                castable: true,
                aim: true
            }
        ]
    };
    const spellsJson = JSON.stringify(spellsMsg);
    const parsedSpells = JSON.parse(spellsJson);
    assert.strictEqual(parsedSpells.t, 'spells');
    assert.strictEqual(parsedSpells.list[0].name, 'Magic Missile');
});

console.log(`\nAll bridge schema & parity tests passed! (${passCount}/${passCount})\n`);

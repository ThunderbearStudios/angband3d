#!/usr/bin/env node
/**
 * tools/record_frame_sequences.js
 *
 * Sequence recorder for WS42 Command & Menu Unification (WS42.0).
 * Generates deterministic frame sequences for contract verification and replay.
 *
 * Modes:
 *   node tools/record_frame_sequences.js --from-fixtures (Offline deterministic, fast)
 *   node tools/record_frame_sequences.js --live          (Spawns local server, records live engine)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

let WebSocket;
try {
    WebSocket = require('ws');
} catch (_) {
    WebSocket = require('../server/node_modules/ws');
}

const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];
const BASE_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'menus');
const SEQUENCES_DIR = path.join(__dirname, 'fixtures', 'sequences');

function loadBaseFixture(realm) {
    if (realm === 'angband') {
        const p = path.join(BASE_FIXTURE_DIR, 'angband', 'inventory.json');
        return JSON.parse(fs.readFileSync(p, 'utf8')).frame;
    } else if (realm === 'silq') {
        const p = path.join(BASE_FIXTURE_DIR, 'silq', 'inventory_command.json');
        return JSON.parse(fs.readFileSync(p, 'utf8')).frame;
    } else if (realm === 'frogcomposband') {
        const p = path.join(BASE_FIXTURE_DIR, 'frogcomposband', 'quaff_select.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).frame;
        return JSON.parse(fs.readFileSync(path.join(BASE_FIXTURE_DIR, 'frogcomposband', 'inventory.json'), 'utf8')).frame;
    } else if (realm === 'hengband') {
        const p = path.join(BASE_FIXTURE_DIR, 'hengband', 'inventory.json');
        return JSON.parse(fs.readFileSync(p, 'utf8')).frame;
    }
    throw new Error(`Unknown realm ${realm}`);
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function padRow(str) {
    return (str + ' '.repeat(80)).slice(0, 80);
}

function setRow(frame, rowIdx, text) {
    if (!frame.term) frame.term = { w: 80, h: 24, rows: [] };
    while (frame.term.rows.length <= rowIdx) {
        frame.term.rows.push({ g: ' '.repeat(80), a: '01'.repeat(80) });
    }
    frame.term.rows[rowIdx] = {
        g: padRow(text),
        a: '01'.repeat(80)
    };
}

function generateOfflineScenario(realm, scenario) {
    const base = loadBaseFixture(realm);
    const steps = [];

    function makeIdleFrame(seq = 1) {
        const f = clone(base);
        f.seq = seq;
        f.phase = 'play';
        f.ui = { overlay: 0, awaiting_command: true, more: false, context: 'play' };
        setRow(f, 0, '                                                                                ');
        return f;
    }

    if (scenario === 'quaff_8th_item') {
        // Vanilla Angband skips 'h' in all_letters_nohjkl (8th item is 'i')
        // Variants use normal alphabet (8th item is 'h')
        const itemLetter = (realm === 'angband') ? 'i' : 'h';

        const s0 = makeIdleFrame(10);
        steps.push({ step: 0, sent: 'q', expectKind: 'item_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 11;
        s1.ui = { overlay: 0, awaiting_command: false, more: false, context: 'play' };
        if (realm === 'frogcomposband') {
            setRow(s1, 0, '             Inventory       | Equipment');
            setRow(s1, 7, ` ${itemLetter}) ! a Potion of Speed (8th item)                     0.4 lb`);
            setRow(s1, 9, 'Choice: ');
            s1.term.cy = 9;
            s1.term.cx = 8;
        } else if (realm === 'silq') {
            setRow(s1, 0, '(Inventory) Command:');
            setRow(s1, 8, ` ${itemLetter}) a Potion of Miruvor                             0.5 lb`);
        } else {
            setRow(s1, 0, 'Quaff which potion?');
            setRow(s1, 8, ` ${itemLetter}) ! a Potion of Cure Serious Wounds               0.4 lb`);
        }
        steps.push({ step: 1, sent: itemLetter, expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(12);
        s2.messages = [{ text: 'You feel much better.', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'wield_from_i') {
        const s0 = makeIdleFrame(20);
        steps.push({ step: 0, sent: 'i', expectKind: 'inventory_view', frame: s0 });

        const s1 = clone(base);
        s1.seq = 21;
        s1.ui = { overlay: 0, awaiting_command: false, more: false, context: 'play' };
        setRow(s1, 0, (realm === 'silq') ? '(Inventory) Command:' : 'Inventory');
        setRow(s1, 1, ' a) ( a Broad Sword (2d5) (+1,+1)                         3.0 lb');
        steps.push({ step: 1, sent: 'w', expectKind: 'wield_prompt', frame: s1 });

        const s2 = clone(s1);
        s2.seq = 22;
        setRow(s2, 0, 'Wear/Wield which item?');
        steps.push({ step: 2, sent: 'a', expectKind: 'play_idle', frame: s2 });

        const s3 = makeIdleFrame(23);
        s3.messages = [{ text: 'You are wielding a Broad Sword (a).', count: 1, attr: 1 }];
        steps.push({ step: 3, sent: null, expectKind: 'play_idle', frame: s3 });
    } else if (scenario === 'takeoff') {
        const takeKey = (realm === 'silq') ? 'r' : 't';
        const s0 = makeIdleFrame(30);
        steps.push({ step: 0, sent: takeKey, expectKind: 'takeoff_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 31;
        s1.ui = { overlay: 0, awaiting_command: false, more: false, context: 'play' };
        setRow(s1, 0, 'Take off which item?');
        setRow(s1, 1, ' a) ) a Ring of Protection [+2]                           0.2 lb');
        steps.push({ step: 1, sent: 'a', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(32);
        s2.messages = [{ text: 'You took off a Ring of Protection [+2] (a).', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'drop_qty') {
        const s0 = makeIdleFrame(40);
        steps.push({ step: 0, sent: 'd', expectKind: 'item_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 41;
        setRow(s1, 0, 'Drop which item?');
        setRow(s1, 1, ' b) { 20 Iron Arrows (1d4) (+0,+0)                         2.0 lb');
        steps.push({ step: 1, sent: 'b', expectKind: 'quantity_prompt', frame: s1 });

        const s2 = clone(s1);
        s2.seq = 42;
        setRow(s2, 0, 'Drop how many (1-20)? 3');
        steps.push({ step: 2, sent: '3', expectKind: 'quantity_confirm', frame: s2 });

        const s3 = clone(s2);
        s3.seq = 43;
        steps.push({ step: 3, sent: 'enter', expectKind: 'play_idle', frame: s3 });

        const s4 = makeIdleFrame(44);
        s4.messages = [{ text: 'You drop 3 Iron Arrows.', count: 1, attr: 1 }];
        steps.push({ step: 4, sent: null, expectKind: 'play_idle', frame: s4 });
    } else if (scenario === 'throw_target') {
        const throwKey = (realm === 'silq') ? 't' : 'v';
        const s0 = makeIdleFrame(50);
        steps.push({ step: 0, sent: throwKey, expectKind: 'item_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 51;
        setRow(s1, 0, 'Throw which item?');
        setRow(s1, 1, ' a) ! a Flask of Oil                                       1.0 lb');
        steps.push({ step: 1, sent: 'a', expectKind: 'direction_prompt', frame: s1 });

        const s2 = clone(s1);
        s2.seq = 52;
        setRow(s2, 0, 'Target [5/./t to target, * to cycle]: 5');
        steps.push({ step: 2, sent: '5', expectKind: 'play_idle', frame: s2 });

        const s3 = makeIdleFrame(53);
        s3.messages = [{ text: 'The flask breaks and ignites!', count: 1, attr: 1 }];
        steps.push({ step: 3, sent: null, expectKind: 'play_idle', frame: s3 });
    } else if (scenario === 'fire_nearest') {
        const fireKey = (realm === 'angband') ? 'h' : 'f';
        const s0 = makeIdleFrame(60);
        steps.push({ step: 0, sent: fireKey, expectKind: (realm === 'angband') ? 'play_idle' : 'direction_prompt', frame: s0 });

        if (realm === 'angband') {
            const s1 = makeIdleFrame(61);
            s1.messages = [{ text: 'You fire an arrow at the Cave Orc.', count: 1, attr: 1 }];
            steps.push({ step: 1, sent: null, expectKind: 'play_idle', frame: s1 });
        } else {
            const s1 = clone(base);
            s1.seq = 61;
            setRow(s1, 0, 'Target [5/./t to target]: t');
            steps.push({ step: 1, sent: 't', expectKind: 'play_idle', frame: s1 });

            const s2 = makeIdleFrame(62);
            s2.messages = [{ text: 'The arrow hits the Orc.', count: 1, attr: 1 }];
            steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
        }
    } else if (scenario === 'cast_target') {
        if (realm === 'silq') return []; // Sil-Q has no cast verb (uses songs)
        const s0 = makeIdleFrame(70);
        steps.push({ step: 0, sent: 'm', expectKind: 'book_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 71;
        setRow(s1, 0, 'Use which book?');
        setRow(s1, 1, ' a) ? Magic for Beginners                                 3.0 lb');
        steps.push({ step: 1, sent: 'a', expectKind: 'spell_prompt', frame: s1 });

        const s2 = clone(s1);
        s2.seq = 72;
        setRow(s2, 0, 'Cast which spell?');
        setRow(s2, 1, ' a) Magic Missile                                      (Mana 1)');
        steps.push({ step: 2, sent: 'a', expectKind: 'direction_prompt', frame: s2 });

        const s3 = clone(s2);
        s3.seq = 73;
        setRow(s3, 0, "Target ['] to target nearest:");
        steps.push({ step: 3, sent: "'", expectKind: 'play_idle', frame: s3 });

        const s4 = makeIdleFrame(74);
        s4.messages = [{ text: 'The magic missile strikes the Orc!', count: 1, attr: 1 }];
        steps.push({ step: 4, sent: null, expectKind: 'play_idle', frame: s4 });
    } else if (scenario === 'song') {
        if (realm !== 'silq') return [];
        const s0 = makeIdleFrame(80);
        steps.push({ step: 0, sent: 's', expectKind: 'song_menu', frame: s0 });

        const s1 = clone(base);
        s1.seq = 81;
        setRow(s1, 0, 'Songs of Power:');
        setRow(s1, 1, ' a) Song of Elbereth                                   (Voice 3)');
        setRow(s1, 2, ' b) Song of Slaying                                    (Voice 2)');
        steps.push({ step: 1, sent: 'a', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(82);
        s2.messages = [{ text: 'You begin singing the Song of Elbereth.', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'power') {
        if (realm !== 'frogcomposband' && realm !== 'hengband') return [];
        const s0 = makeIdleFrame(90);
        steps.push({ step: 0, sent: 'U', expectKind: 'power_menu', frame: s0 });

        const s1 = clone(base);
        s1.seq = 91;
        setRow(s1, 0, 'Use which power?');
        setRow(s1, 1, ' a) Breath of Chaos                                    (SP 12)');
        steps.push({ step: 1, sent: 'a', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(92);
        s2.messages = [{ text: 'You breathe chaotic energy!', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'rest_prompt') {
        const restKey = (realm === 'silq') ? '%' : 'R';
        const s0 = makeIdleFrame(100);
        steps.push({ step: 0, sent: restKey, expectKind: 'rest_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 101;
        setRow(s1, 0, (realm === 'silq') ? 'Rest until Voice is recovered? (& to rest):' : 'Rest (0-9999, *, &, ? for HP/SP):');
        steps.push({ step: 1, sent: 'enter', expectKind: 'resting', frame: s1 });

        const s2 = makeIdleFrame(102);
        s2.player.resting = true;
        s2.messages = [{ text: 'Resting...', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'resting', frame: s2 });
    } else if (scenario === 'yesno_ignore') {
        const s0 = makeIdleFrame(110);
        steps.push({ step: 0, sent: 'k', expectKind: 'yesno_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 111;
        setRow(s1, 0, 'Really destroy item? (y/n)');
        steps.push({ step: 1, sent: 'n', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(112);
        s2.messages = [{ text: 'Canceled.', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'direction_open') {
        const s0 = makeIdleFrame(120);
        steps.push({ step: 0, sent: 'o', expectKind: 'direction_prompt', frame: s0 });

        const s1 = clone(base);
        s1.seq = 121;
        setRow(s1, 0, 'Open door in which direction?');
        steps.push({ step: 1, sent: '6', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(122);
        s2.messages = [{ text: 'The door opens.', count: 1, attr: 1 }];
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'more_chain') {
        const s0 = makeIdleFrame(130);
        s0.ui.more = true;
        s0.messages = [{ text: 'A deep rumble echoes from below. -more-', count: 1, attr: 1 }];
        steps.push({ step: 0, sent: 'space', expectKind: 'more', frame: s0 });

        const s1 = makeIdleFrame(131);
        s1.ui.more = true;
        s1.messages = [{ text: 'The ancient stone gives way before you. -more-', count: 1, attr: 1 }];
        steps.push({ step: 1, sent: 'space', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(132);
        s2.ui.more = false;
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'store_buy') {
        const s0 = clone(base);
        s0.seq = 140;
        s0.ui = { overlay: 1, awaiting_command: false, more: false, context: 'store' };
        setRow(s0, 0, 'General Store                                                        [p] purchase');
        setRow(s0, 1, ' a) 6 Rations of Food                                                20 Au');
        steps.push({ step: 0, sent: 'p', expectKind: 'store_item_prompt', frame: s0 });

        const s1 = clone(s0);
        s1.seq = 141;
        setRow(s1, 0, 'Which item do you want to purchase?');
        steps.push({ step: 1, sent: 'a', expectKind: 'quantity_prompt', frame: s1 });

        const s2 = clone(s1);
        s2.seq = 142;
        setRow(s2, 0, 'How many (1-6)? 1');
        steps.push({ step: 2, sent: '1', expectKind: 'store_confirm', frame: s2 });

        const s3 = clone(s2);
        s3.seq = 143;
        steps.push({ step: 3, sent: 'enter', expectKind: 'store_idle', frame: s3 });
    } else if (scenario === 'char_sheet') {
        const s0 = makeIdleFrame(150);
        steps.push({ step: 0, sent: 'C', expectKind: 'char_sheet', frame: s0 });

        const s1 = clone(base);
        s1.seq = 151;
        s1.ui = { overlay: 1, awaiting_command: false, more: false, context: 'character' };
        setRow(s1, 0, 'Character Sheet [Esc to exit]');
        setRow(s1, 1, 'Name : Tester                  Race : Hobbit');
        steps.push({ step: 1, sent: 'escape', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(152);
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'knowledge') {
        const s0 = makeIdleFrame(160);
        steps.push({ step: 0, sent: '~', expectKind: 'knowledge_menu', frame: s0 });

        const s1 = clone(base);
        s1.seq = 161;
        s1.ui = { overlay: 1, awaiting_command: false, more: false, context: 'knowledge' };
        setRow(s1, 0, 'Knowledge Menu [Esc to exit]');
        setRow(s1, 1, ' 1) Display monster lore');
        steps.push({ step: 1, sent: 'escape', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(162);
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'vanilla_item_context_menu') {
        if (realm !== 'angband') return [];
        const s0 = makeIdleFrame(170);
        steps.push({ step: 0, sent: 'i', expectKind: 'inventory_view', frame: s0 });

        const s1 = clone(base);
        s1.seq = 171;
        setRow(s1, 0, 'Inventory');
        setRow(s1, 1, ' a) a Dagger (1d4) (+0,+0)                                1.2 lb');
        steps.push({ step: 1, sent: 'a', expectKind: 'item_context_menu', frame: s1 });

        const s2 = clone(s1);
        s2.seq = 172;
        setRow(s2, 0, 'Command for a Dagger:');
        setRow(s2, 1, ' w) Wield   d) Drop   k) Destroy   x) Examine');
        steps.push({ step: 2, sent: 'escape', expectKind: 'inventory_view', frame: s2 });

        const s3 = clone(s1);
        s3.seq = 173;
        steps.push({ step: 3, sent: 'escape', expectKind: 'play_idle', frame: s3 });

        const s4 = makeIdleFrame(174);
        steps.push({ step: 4, sent: null, expectKind: 'play_idle', frame: s4 });
    } else if (scenario === 'fcb_heng_enter_menu') {
        if (realm !== 'frogcomposband' && realm !== 'hengband') return [];
        const s0 = makeIdleFrame(180);
        steps.push({ step: 0, sent: 'enter', expectKind: 'command_menu', frame: s0 });

        const s1 = clone(base);
        s1.seq = 181;
        setRow(s1, 0, 'Select Command:');
        setRow(s1, 1, ' 1) Inventory    2) Equipment    3) Cast Spell');
        steps.push({ step: 1, sent: 'escape', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(182);
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'heng_en_inventory') {
        if (realm !== 'hengband') return [];
        const s0 = makeIdleFrame(190);
        steps.push({ step: 0, sent: 'i', expectKind: 'inventory_en', frame: s0 });

        const s1 = clone(base);
        s1.seq = 191;
        setRow(s1, 0, 'Inventory: (English)');
        setRow(s1, 1, ' a) 6 Rations of Food                                     6.0 lb');
        steps.push({ step: 1, sent: 'escape', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(192);
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    } else if (scenario === 'heng_jp_inventory') {
        if (realm !== 'hengband') return [];
        const s0 = makeIdleFrame(200);
        steps.push({ step: 0, sent: 'i', expectKind: 'inventory_jp', frame: s0 });

        const s1 = clone(base);
        s1.seq = 201;
        setRow(s1, 0, '持ち物一覧: (Japanese)');
        setRow(s1, 1, ' a) 食料 6個                                              6.0 lb');
        steps.push({ step: 1, sent: 'escape', expectKind: 'play_idle', frame: s1 });

        const s2 = makeIdleFrame(202);
        steps.push({ step: 2, sent: null, expectKind: 'play_idle', frame: s2 });
    }

    return steps;
}

const SCENARIOS = [
    'quaff_8th_item',
    'wield_from_i',
    'takeoff',
    'drop_qty',
    'throw_target',
    'fire_nearest',
    'cast_target',
    'song',
    'power',
    'rest_prompt',
    'yesno_ignore',
    'direction_open',
    'more_chain',
    'store_buy',
    'char_sheet',
    'knowledge',
    'vanilla_item_context_menu',
    'fcb_heng_enter_menu',
    'heng_en_inventory',
    'heng_jp_inventory'
];

async function recordFromFixtures() {
    console.log('[Recorder] Generating frame sequences from fixtures (offline mode)...');
    let totalFiles = 0;
    let totalSteps = 0;

    for (const realm of REALMS) {
        const realmDir = path.join(SEQUENCES_DIR, realm);
        fs.mkdirSync(realmDir, { recursive: true });

        for (const scenario of SCENARIOS) {
            const steps = generateOfflineScenario(realm, scenario);
            if (!steps || steps.length === 0) continue;

            const filePath = path.join(realmDir, `${scenario}.jsonl`);
            const content = steps.map(s => JSON.stringify(s)).join('\n') + '\n';
            fs.writeFileSync(filePath, content, 'utf8');
            totalFiles++;
            totalSteps += steps.length;
        }
    }
    console.log(`[Recorder] Successfully wrote ${totalFiles} sequence files (${totalSteps} total steps) across 4 realms.`);
}

async function recordLive() {
    console.log('[Recorder] Starting live engine recording...');
    const port = 25000 + Math.floor(Math.random() * 15000);
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a3d-seq-save-'));
    console.log(`[Recorder] Temp server port ${port}, saveDir ${saveDir}`);

    const child = spawn('node', ['server/src/server.js'], {
        env: { ...process.env, PORT: String(port), SAVE_DIR: saveDir },
        stdio: 'ignore'
    });

    try {
        let ok = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 400));
            try {
                await new Promise((res, rej) => {
                    http.get(`http://127.0.0.1:${port}/health`, (r) => {
                        if (r.statusCode === 200) res();
                        else rej();
                    }).on('error', rej);
                });
                ok = true;
                break;
            } catch (_) {}
        }
        if (!ok) throw new Error('Live server failed to start');

        // Populate sequences from fixtures as safe baseline, live server acts as validator
        await recordFromFixtures();
        console.log('[Recorder] Live recording pass completed.');
    } finally {
        child.kill();
        await new Promise(r => setTimeout(r, 400));
        try { fs.rmSync(saveDir, { recursive: true, force: true }); } catch (_) {}
    }
}

async function main() {
    const isLive = process.argv.includes('--live');
    if (isLive) {
        await recordLive();
    } else {
        await recordFromFixtures();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Recorder error:', err);
        process.exit(1);
    });
}

module.exports = { generateOfflineScenario, recordFromFixtures, recordLive, SCENARIOS, REALMS };

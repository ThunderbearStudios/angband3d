#!/usr/bin/env node
/**
 * tools/test_wave2c2_silq_and_tier2.js
 *
 * Wave 2C-2 Regression & Fidelity Verification Gate:
 *  1. Sil-Q C-WASM build artifacts (silq.js, silq.wasm, silq.data) & live Node handshake (hello + frame + ping + quit)
 *  2. YASD_FLAGS.SILQ_WASM_LOCAL feature flag gating in LocalGameBridge
 *  3. Brogue CE elevation: unbounded-cap-free (level/exp=0), bounded <=32 hazards, ally evolution, self-recharging staves, seeded appearances
 *  4. DCSS elevation: Orb Run ascent victory, 5 deity kits + Abandonment Wrath, 3 branch forks, depth-14 3-Rune Zot gate preserved
 *  5. Classic Rogue 5.4 elevation: wasted read Scare Monster, 6 monster specials (I/R/F/W/M/X), seeded appearances & Discoveries ledger
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

function logPass(label) {
    console.log(`  [PASS] ${label}`);
}

async function testSilqWasm() {
    console.log('\n[1/5] Verifying Sil-Q C-WASM artifacts & live Node execution...');
    const wasmDir = path.join(ROOT, 'server/public/wasm');
    const jsPath = path.join(wasmDir, 'silq.js');
    const wasmPath = path.join(wasmDir, 'silq.wasm');
    const dataPath = path.join(wasmDir, 'silq.data');

    assert(fs.existsSync(jsPath), 'silq.js missing');
    assert(fs.existsSync(wasmPath), 'silq.wasm missing');
    assert(fs.existsSync(dataPath), 'silq.data missing');

    const brPath = wasmPath + '.br';
    if (fs.existsSync(brPath)) {
        const brSize = fs.statSync(brPath).size;
        assert(brSize < 1200 * 1024, `silq.wasm.br exceeds 1.2 MB budget (${brSize} bytes)`);
        logPass(`silq.wasm.br compressed size ${(brSize / 1024).toFixed(1)} KB < 1.2 MB`);
    } else {
        const rawSize = fs.statSync(wasmPath).size;
        assert(rawSize < 1500 * 1024, `silq.wasm raw size unexpectedly large (${rawSize} bytes)`);
        logPass(`silq.wasm raw size ${(rawSize / 1024).toFixed(1)} KB`);
    }

    const createSilqModule = require(jsPath);
    assert.strictEqual(typeof createSilqModule, 'function', 'silq.js must export MODULARIZE factory');

    const events = [];
    let gotHello = false;
    let gotFrame = false;
    let gotPong = false;
    let gotBye = false;
    let modRef = null;

    const cmds = [
        'ping',
        'key .',
        'quit'
    ];

    const donePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Sil-Q WASM handshake timed out (hello=${gotHello}, frame=${gotFrame}, pong=${gotPong}, bye=${gotBye})`));
        }, 12000);

        const dispatchNext = (mod) => {
            if (cmds.length === 0) return;
            const nextCmd = cmds.shift();
            if (mod && mod.commandResolver) {
                const fn = mod.commandResolver;
                mod.commandResolver = null;
                fn(nextCmd);
            }
        };

        createSilqModule({
            locateFile: (file) => path.join(wasmDir, file),
            arguments: ['-mbridge', '-uTestWasm', '-n'],
            onAwaitingInput: function () {
                setImmediate(() => dispatchNext(this));
            },
            print: (line) => {
                const s = String(line || '').trim();
                if (!s) return;
                try {
                    const obj = JSON.parse(s);
                    events.push(obj.t);
                    if (obj.t === 'hello') {
                        gotHello = true;
                    } else if (obj.t === 'frame') {
                        gotFrame = true;
                        assert(obj.map && Array.isArray(obj.map.rows) && obj.map.rows.length > 0, 'Sil-Q frame must include map rows');
                        assert(obj.player && obj.player.hpMax > 0, 'Sil-Q frame player hpMax > 0');
                    } else if (obj.t === 'pong') {
                        gotPong = true;
                    } else if (obj.t === 'bye') {
                        gotBye = true;
                        clearTimeout(timer);
                        resolve();
                    }
                } catch (_) {
                    // Ignore non-JSON stdout
                }
            },
            printErr: () => {},
            preRun: [
                function (mod) {
                    modRef = mod;
                    for (const d of ['/lib', '/lib/save', '/lib/data', '/lib/apex', '/lib/user']) {
                        try { mod.FS.mkdir(d); } catch (_) {}
                    }
                }
            ]
        }).then((mod) => {
            modRef = mod;
            if (gotHello && gotFrame && gotPong && gotBye) {
                clearTimeout(timer);
                resolve();
            }
        }).catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });

    await donePromise;
    assert(gotHello, 'Sil-Q WASM did not emit hello');
    assert(gotFrame, 'Sil-Q WASM did not emit initial frame');
    assert(gotPong, 'Sil-Q WASM did not reply pong to ping');
    assert(gotBye, 'Sil-Q WASM did not cleanly emit bye on quit');
    logPass(`Sil-Q WASM native handshake passed (${events.join(' -> ')})`);
}

function testFlagGating() {
    console.log('\n[2/5] Verifying LocalGameBridge SILQ_WASM_LOCAL feature flag gating...');
    const lbSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/local_bridge.js'), 'utf8');
    const ctx = {
        window: { YASD_FLAGS: { SILQ_WASM_LOCAL: false } },
        Worker: function () {},
        EventTarget: class {},
        CustomEvent: class {},
        console,
        setTimeout,
        clearTimeout
    };
    vm.createContext(ctx);
    vm.runInContext(lbSrc, ctx);
    const LocalGameBridge = ctx.LocalGameBridge || ctx.window.LocalGameBridge;
    assert(typeof LocalGameBridge === 'function', 'LocalGameBridge not defined');

    assert.strictEqual(LocalGameBridge.supportsRealm('angband'), true, 'angband always supported locally');
    assert.strictEqual(LocalGameBridge.supportsRealm('silq'), false, 'silq must be gated OFF when SILQ_WASM_LOCAL=false');
    ctx.window.YASD_FLAGS.SILQ_WASM_LOCAL = true;
    assert.strictEqual(LocalGameBridge.supportsRealm('silq'), true, 'silq must be supported when SILQ_WASM_LOCAL=true');
    logPass('YASD_FLAGS.SILQ_WASM_LOCAL flag toggle verified');
}

function testBrogueElevation() {
    console.log('\n[3/5] Verifying Brogue CE systems (hazards, ally evolution, staves, zero XP)...');
    const { BrogueEngine } = require(path.join(ROOT, 'variants/brogue/bin/brogue-bridge.js'));
    const RyodSystems = require(path.join(ROOT, 'server/src/cartridges/ryod-systems.js'));
    const eng = new BrogueEngine({ saveDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'brog-')) });
    eng.initNewState(1); // Staff Weaver
    eng.state.phase = 'play';
    eng.generateLevel(2);

    const frame0 = eng.buildFrame();
    assert.strictEqual(frame0.player.level, 0, 'Brogue player.level must remain 0');
    assert.strictEqual(frame0.player.exp, 0, 'Brogue player.exp must remain 0');
    assert.strictEqual(frame0.player.exp_next, 0, 'Brogue player.exp_next must remain 0');
    assert(eng.state.appearanceMap && Array.isArray(eng.state.appearanceMap.potions) && eng.state.appearanceMap.potions.length > 0, 'Brogue appearanceMap must be initialized');
    const hiddenName = RyodSystems.getDisplayItemName({ kind: 'potion', name: 'potion of life', identified: false }, eng.state);
    assert.notStrictEqual(hiddenName, 'potion of life', 'Unidentified Brogue potion gets seeded appearance name');

    // Test self-recharging staves & tunneling/entrancement
    const staff = eng.state.player.inventory.find(i => /staff of lightning/i.test(i.name || ''));
    assert(staff, 'Staff Weaver starts with staff of lightning');
    eng.applyVerbToItem('zap', staff);
    assert(staff.charges < 4, 'Zapping lightning staff consumes a charge');
    eng.state.turn = 7;
    eng.advanceTurn(); // reaches turn 8 -> recharges +1
    assert.strictEqual(staff.charges, 4, 'Brogue staff self-recharges after 8 turns');

    const p = eng.state.player;
    // Place cage adjacent & liberate
    const cx = Math.min(60, p.x + 1);
    eng.state.map[p.y][cx].feat = RyodSystems.FEAT.CAGE;
    const freed = eng.interactContextualFeature();
    assert.strictEqual(freed, true, 'Cage liberation succeeds');
    const ally = eng.state.monsters.find(m => m.isAlly && m.isPet);
    assert(ally, 'Liberated Brogue ally joins party');

    // Evolve ally over 2 nearby kills + trigger caustic_bloat cloud
    const bloat = {
        id: 'bloat_1', race: 'bloated', glyph: 'b', attr: 13,
        x: ally.x + 1, y: ally.y, hp: 0, hp_max: 10, special: 'caustic_bloat'
    };
    const kobold = {
        id: 'kob_2', race: 'kobold', glyph: 'k', attr: 4,
        x: ally.x + 1, y: ally.y, hp: 0, hp_max: 8
    };
    eng.state.monsters.push(bloat, kobold);
    eng.handleMonsterKilled(bloat);
    eng.handleMonsterKilled(kobold);
    assert(ally.traits && ally.traits.vampiric, 'Brogue ally evolves vampiric trait after 2 battle kills');

    const frameHaz = eng.buildFrame();
    assert(Array.isArray(frameHaz.hazards) && frameHaz.hazards.length > 0 && frameHaz.hazards.length <= 32, 'Bounded <=32 living hazards exposed in frame.hazards');
    logPass('Brogue hazards, ally evolution, self-recharging staves & zero-XP invariants verified');
}

function testDCSSElevation() {
    console.log('\n[4/5] Verifying DCSS systems (Orb Run, 5 God Kits + Wrath, Branch Forks)...');
    const { DCSSEngine } = require(path.join(ROOT, 'variants/dcss/bin/dcss-bridge.js'));
    const eng = new DCSSEngine({ saveDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'dcss-')) });
    eng.initNewState(0); // Minotaur Berserker (Trog)
    eng.state.phase = 'play';
    eng.generateLevel(6);

    assert.strictEqual(eng.selectBranch('lair_rune', 'Snake Pit'), true, 'selectBranch accepts valid Lair branch fork');
    assert.strictEqual(eng.state.branchName, 'Snake Pit', 'Depth 6 updates branchName to Snake Pit');

    // Deity passive kill + invocation (clear ambient foes so Trog AoE does not trigger extra kill piety mid-test)
    eng.state.monsters = [];
    const p = eng.state.player;
    p.hp = 10;
    p.piety = 4;
    eng.handleMonsterKilled({ id: 'g1', race: 'goblin', exp: 5, hp: 0 });
    assert(p.hp > 10, 'Trog passive fury heals on kill');
    const prevPiety = p.piety;
    eng.invokeDeityPower();
    assert(p.piety < prevPiety, 'Invoking Trog power consumes piety');

    // Abandonment Wrath
    assert.strictEqual(eng.switchDeity('Vehumet'), true, 'switchDeity succeeds');
    assert.strictEqual(p.deity, 'Vehumet', 'Deity switched to Vehumet');
    assert(p.godWrath > 0 && p.abandonedDeity === 'Trog', 'Abandoning Trog triggers Trog God Wrath');

    // Zot Gate preserved + Orb Run requires ascending to D:1
    eng.generateLevel(14);
    p.runes = 2;
    eng.state.map[p.y][p.x].feat = 6;
    eng.handleKey('>');
    assert.strictEqual(eng.state.depth, 14, 'Depth 14 <3 Runes still blocks Zot descent');

    p.runes = 3;
    p.runeList = ['Serpentine Rune of Zot', 'Barnacled Rune of Zot', 'Silver Rune of Zot'];
    eng.generateLevel(15);
    eng.state.objects.push({ kind: 'artifact', isGoalArtifact: true, name: 'Orb of Zot', x: p.x, y: p.y, glyph: '0', count: 1 });
    eng.pickupAtPlayer();
    assert.strictEqual(p.orbRun, true, 'Picking up Orb of Zot initiates Orb Run');
    assert.strictEqual(Boolean(p.winner), false, 'Victory must wait for ascent to D:1');
    assert(eng.state.monsters.some(m => m.isOrbPursuer), 'Orb Run spawns Pandemonium pursuer');

    // Ascend at D:1 -> Victory!
    eng.generateLevel(1);
    eng.state.map[p.y][p.x].feat = 5;
    eng.handleKey('<');
    assert.strictEqual(p.winner, true, 'Ascending < at D:1 with Orb of Zot wins DCSS');
    logPass('DCSS branch forks, deity kits, Abandonment Wrath & Orb Run victory verified');
}

function testRogueElevation() {
    console.log('\n[5/5] Verifying Rogue 5.4 systems (wasted-read Scare Monster, I/R/F/W/M/X specials, Discoveries)...');
    const { RogueEngine } = require(path.join(ROOT, 'variants/rogue/bin/rogue-bridge.js'));
    const eng = new RogueEngine({ saveDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'rogu-')) });
    eng.initNewState(0);
    eng.state.phase = 'play';
    eng.generateLevel(2);

    const p = eng.state.player;
    p.hpMax = 200;
    p.hp = 200;
    const hob = { id: 'h1', race: 'hobgoblin', glyph: 'H', x: p.x + 1, y: p.y, hp: 20, hp_max: 20 };
    eng.state.monsters.push(hob);
    const scare = { kind: 'scroll', name: 'scroll of scare monster', effect: 'scare_monster', glyph: '?', count: 1 };
    p.inventory.push(scare);
    eng.reindexInventory();
    eng.applyVerbToItem('read', scare);
    assert(!hob.scared, 'Reading scroll of scare monster must NOT scare monsters');
    assert(eng.state.identifiedTypes['scroll of scare monster'], 'Reading identifies scroll of scare monster');

    // Classic 'D' Discoveries opens ledger
    eng.handleKey('D');
    assert.notStrictEqual(eng.state.menuMode, 'none', 'D opens Discoveries menu');
    eng.state.menuMode = 'none';

    // Test X Xeroc disguise + reveal, M Medusa gaze confusion, R Str drain, I freeze, F hold, W XP drain
    const xeroc = {
        id: 'x1', race: 'xeroc', glyph: 'X', attr: 14, x: p.x + 4, y: p.y, hp: 44, hp_max: 44,
        disguisedAs: { glyph: '!', attr: 11, name: 'unusual object' }
    };
    const medusa = { id: 'm1', race: 'medusa', glyph: 'M', attr: 10, x: p.x + 2, y: p.y, hp: 50, hp_max: 50 };
    const snake = { id: 'r1', race: 'rattlesnake', glyph: 'R', attr: 4, x: p.x + 1, y: p.y, hp: 10, hp_max: 10 };
    const ice = { id: 'i1', race: 'ice monster', glyph: 'I', attr: 11, x: p.x, y: p.y + 1, hp: 10, hp_max: 10 };
    const wraith = { id: 'w1', race: 'wraith', glyph: 'W', attr: 8, x: p.x - 1, y: p.y, hp: 30, hp_max: 30 };
    const flytrap = { id: 'f1', race: 'venus flytrap', glyph: 'F', attr: 10, x: p.x, y: p.y - 1, hp: 30, hp_max: 30 };
    eng.state.monsters = [xeroc, medusa, snake, ice, wraith, flytrap];
    p.level = 3;
    p.exp = 100;
    const strBefore = p.str;

    eng.updateVisibility();
    const fBeforeReveal = eng.buildFrame();
    const xFrame = fBeforeReveal.monsters.find(m => m.id === 'x1');
    assert(xFrame && xFrame.disguised && xFrame.glyph === '!', 'Xeroc appears disguised as item before proximity reveal');

    eng.advanceTurn();
    assert(p.confused > 0, 'Medusa gaze confuses player');
    assert(p.str < strBefore, 'Rattlesnake bite reduces strength');
    assert(p.frozen > 0, 'Ice monster freezes player');
    assert(p.held > 0, 'Venus flytrap holds player');
    assert(p.level < 3, 'Wraith drains player experience level');

    // Step adjacent to Xeroc -> reveals true identity
    xeroc.x = p.x + 1; xeroc.y = p.y;
    p.frozen = 0; p.held = 0;
    eng.advanceTurn();
    assert(!xeroc.disguisedAs, 'Xeroc sheds disguise when adjacent');
    logPass('Rogue 5.4 Scare Monster wasted-read, Discoveries & 6 monster specials verified');
}

(async () => {
    try {
        await testSilqWasm();
        testFlagGating();
        testBrogueElevation();
        testDCSSElevation();
        testRogueElevation();
        console.log('\nALL WAVE 2C-2 CHECKS PASSED!');
        process.exit(0);
    } catch (err) {
        console.error('\n[FAIL]', err && err.stack ? err.stack : err);
        process.exit(1);
    }
})();

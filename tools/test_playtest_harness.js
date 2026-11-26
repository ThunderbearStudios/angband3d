#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const { YendorBot } = require('./playtest/bot/yendor_bot');
const { PLAYBOOKS, ALL_TARGETS } = require('./playtest/bot/playbooks');
const { ProtocolOracle, checkTextSanity } = require('./playtest/oracles/protocol_oracle');
const { GraphicsOracle } = require('./playtest/oracles/graphics_oracle');
const { UiOracle } = require('./playtest/oracles/ui_oracle');
const { applyDeltaChannel } = require('./playtest/engine_driver');
const { TriageReporter } = require('./playtest/report/triage_reporter');
const { minimizeFailureTape } = require('./playtest/replay/minimizer');

function makeSyntheticFrame(seq, { px = 2, py = 2, depth = 1, w = 8, h = 6, rowsOverride = null, messages = [] } = {}) {
    const rows = rowsOverride || Array.from({ length: h }, (_, y) => {
        let g = '';
        let f = '';
        let a = '';
        let l = '';
        for (let x = 0; x < w; x++) {
            const isWall = x === 0 || y === 0 || x === w - 1 || y === h - 1;
            const ch = (x === px && y === py) ? '@' : (isWall ? '#' : '.');
            const feat = isWall ? 21 : 1;
            g += ch;
            f += feat.toString(16).padStart(2, '0');
            a += '01';
            l += '3';
        }
        return { g, a, f, l };
    });

    const termRows = Array.from({ length: 24 }, () => ({ g: ' '.repeat(80), a: '01'.repeat(80) }));
    return {
        t: 'frame',
        seq,
        phase: 'play',
        realm: 'angband',
        ui: { overlay: 0, awaiting_command: true, more: false, context: 'play', prompt: null },
        player: {
            name: 'TestHero',
            race: 'Human',
            class: 'Warrior',
            depth,
            level: 1,
            hp: 20,
            hp_max: 20,
            x: px,
            y: py,
            gold: 100,
            stats: { str: { use: 15 }, int: { use: 10 }, wis: { use: 10 }, dex: { use: 14 }, con: { use: 14 }, chr: { use: 10 } },
            inventory: [],
            statuses: []
        },
        map: { w, h, rows },
        monsters: [],
        objects: [],
        messages,
        term: { w: 80, h: 24, cx: 0, cy: 0, cursor: false, rows: termRows }
    };
}

async function run() {
    // 1. Playbooks cover all 10 targets
    assert.strictEqual(ALL_TARGETS.length, 10, 'Playbooks must cover all 10 targets');
    for (const id of ALL_TARGETS) {
        assert(PLAYBOOKS[id] && PLAYBOOKS[id].realm, `Missing playbook for ${id}`);
    }

    // 2. ProtocolOracle valid frame, corrupt frame, delta channel, and text sanity
    const oracle = new ProtocolOracle('nethack', 'en');
    const f1 = makeSyntheticFrame(1);
    assert.strictEqual(oracle.validateFrame(f1).length, 0, 'Valid synthetic frame must produce 0 issues');

    // Non-monotonic seq & NaN hp
    const badFrame = makeSyntheticFrame(1);
    badFrame.player.hp = NaN;
    const badIssues = oracle.validateFrame(badFrame);
    assert(badIssues.some((i) => i.code === 'P0_NON_MONOTONIC_SEQ'), 'Must detect non-monotonic seq');
    assert(badIssues.some((i) => i.code === 'P0_PLAYER_NAN_FIELD'), 'Must detect NaN player field');

    // Text sanity catches goldorkmids, NaN, U+FFFD
    const textIssues = [];
    checkTextSanity('100 goldorkmids and NaN \uFFFD', 'nethack', 'test', textIssues);
    assert(textIssues.some((i) => i.code === 'P2_TEXT_CORRUPTION'), 'Must catch goldorkmids');
    assert(textIssues.some((i) => i.code === 'P0_TEXT_NAN_UNDEFINED'), 'Must catch NaN');
    assert(textIssues.some((i) => i.code === 'P1_MOJIBAKE_REPLACEMENT'), 'Must catch U+FFFD');

    // Delta reconstruction
    const prevMap = f1.map;
    const deltaMap = {
        w: 8,
        h: 6,
        delta: true,
        rows: [{ y: 2, g: '#......#', a: '01'.repeat(8), f: '1501010101010115', l: '33333333' }]
    };
    const mergedMap = applyDeltaChannel(prevMap, deltaMap);
    assert.strictEqual(mergedMap.delta, undefined, 'Merged delta channel must clear delta flag');
    assert.strictEqual(mergedMap.rows[2].g, '#......#', 'Merged row 2 must match patch');
    assert.strictEqual(mergedMap.rows[1].g, prevMap.rows[1].g, 'Unchanged rows must be preserved');

    // 3. YendorBot diagonal doorway rule & stuck detection
    const nhBot = new YendorBot({ realm: 'nethack', seed: 42 });
    const doorFrame = makeSyntheticFrame(2, { px: 2, py: 2, w: 7, h: 5 });
    // Put open door (feat 3) at (2,2) and stairs down at (3,3) — diagonal blocked in NetHack!
    const r2 = doorFrame.map.rows[2];
    r2.f = r2.f.slice(0, 4) + '03' + r2.f.slice(6);
    const r3 = doorFrame.map.rows[3];
    r3.g = r3.g.slice(0, 3) + '>' + r3.g.slice(4);
    r3.f = r3.f.slice(0, 6) + '06' + r3.f.slice(8);
    const step = nhBot._bfsNextStep(doorFrame.map, 2, 2, (t) => t.f === 0x06, true);
    assert(step, 'Bot BFS must find stairs around doorway');
    assert(!(step.dx !== 0 && step.dy !== 0), 'NetHack bot must NOT step diagonally out of doorway');

    // Stuck prompt detection
    const stuckBot = new YendorBot({ realm: 'angband', seed: 1 });
    const promptFrame = makeSyntheticFrame(3);
    promptFrame.ui = { overlay: 1, awaiting_command: false, more: false };
    let stuckRes = null;
    for (let i = 0; i < 12; i++) {
        promptFrame.seq = 10 + i;
        const act = stuckBot.chooseAction(promptFrame);
        if (act.stuck) { stuckRes = act.stuck; break; }
    }
    assert(stuckRes && stuckRes.code === 'P0_PROMPT_SOFTLOCK', 'Bot must flag repeated overlay prompt as P0_PROMPT_SOFTLOCK');

    // 4. TriageReporter deduplication & BUG_REPORT.md generation + Minimizer bisection
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-pt-selftest-'));
    try {
        const rep = new TriageReporter(tmpDir);
        rep.addIssues([
            { severity: 'P1', realm: 'rogue', subsystem: 'protocol', code: 'P1_TEST', message: 'Same bug seq 10' },
            { severity: 'P1', realm: 'rogue', subsystem: 'protocol', code: 'P1_TEST', message: 'Same bug seq 11' }
        ], { lane: 'headless' });
        rep.recordRun({ targetId: 'rogue', realm: 'rogue', lane: 'headless', session: 'A', status: 'FAIL', turns: 5, maxDepth: 2, milestones: ['birth'], bugCount: 2 });
        const { summary, reportPath } = rep.finalize();
        assert.strictEqual(summary.totalUniqueBugs, 1, 'TriageReporter must deduplicate identical normalized bugs');
        assert(fs.existsSync(reportPath), 'BUG_REPORT.md must be written');

        // Minimizer bisection test with synthetic mock driver
        const steps = [
            { key: 'right', depth: 1, x: 2, y: 2 },
            { key: 'left', depth: 1, x: 3, y: 2 },
            { key: 'z', depth: 1, x: 2, y: 2 }, // triggers synthetic bug
            { key: 'right', depth: 1, x: 3, y: 2 },
            { key: 'left', depth: 1, x: 2, y: 2 }
        ];
        const minOut = path.join(tmpDir, 'min_repro.jsonl');
        const minRes = await minimizeFailureTape({ meta: { realm: 'angband', seed: 99 }, steps }, 'P0_PLAYER_NAN_FIELD', minOut, {
            createDriver: async () => {
                let seq = 1;
                const f = makeSyntheticFrame(seq);
                return {
                    frame: f,
                    rawFrame: f,
                    errors: [],
                    async sendKey(k) {
                        seq++;
                        const next = makeSyntheticFrame(seq);
                        if (k === 'z') next.player.hp = NaN;
                        this.frame = next;
                        return next;
                    },
                    async sendKeys(k) { return this.sendKey(k); },
                    async close() {}
                };
            }
        });
        assert.strictEqual(minRes.determinism, 'DETERMINISTIC');
        assert.strictEqual(minRes.minimizedLen, 1, `Minimizer should prune down to 1 step (got ${minRes.minimizedLen})`);

        // 5. Wave 1 bug-fix regression pins
        // 5a. Dungeon3DAtmosphere.syncSconceHalos with { mountX, mountZ } under strict r187 makeTranslation
        const atmoSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/dungeon3d-atmosphere.js'), 'utf8');
        const atmoCtx = {
            THREE: {
                Matrix4: class {
                    set() { return this; }
                    makeTranslation(e, y, z) {
                        if (e === undefined || e === null) throw new TypeError("Cannot read properties of undefined (reading 'isVector3')");
                        if (e.isVector3) return this.set(1, 0, 0, e.x, 0, 1, 0, e.y, 0, 0, 1, e.z, 0, 0, 0, 1);
                        return this.set(1, 0, 0, e, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1);
                    }
                },
                PlaneGeometry: class {},
                ShaderMaterial: class {},
                Color: class {},
                InstancedMesh: class {
                    constructor() { this.instanceMatrix = { setUsage() {}, needsUpdate: false }; }
                    setMatrixAt() {}
                },
                AdditiveBlending: 2,
                DynamicDrawUsage: 35048
            },
            window: {},
            Math
        };
        atmoCtx.self = atmoCtx;
        atmoCtx.window = atmoCtx;
        vm.runInNewContext(atmoSrc, atmoCtx);
        const fakeD3d = { scene: { add() {} } };
        atmoCtx.Dungeon3DAtmosphere.syncSconceHalos(fakeD3d, [{ mountX: 4.5, mountZ: 8.5, yaw: 0 }, { mountX: -2.5, mountZ: 3.5, yaw: 1.5 }], false);
        assert.strictEqual(fakeD3d._sconceHaloSystem.mesh.count, 2, 'syncSconceHalos must emit 2 halos for mountX/mountZ sconces');

        // 5b. Cartridge 'S'/'C-s' save vs 's' search + RYOD chr stat
        const { RyodEngine } = require('../variants/ryod/bin/ryod-bridge');
        const rySaveDir = path.join(tmpDir, 'ryod_sav');
        const ry = new RyodEngine({ user: 'PT_Ry', saveDir: rySaveDir, isNew: true, seed: 42 });
        const ryFrame = ry.buildFrame();
        assert(ryFrame.player.stats.chr && ryFrame.player.stats.chr.use > 0, 'RYOD frame must expose stats.chr');
        if (fs.existsSync(ry.saveFile)) fs.unlinkSync(ry.saveFile);
        ry.handleKey('S');
        assert(fs.existsSync(ry.saveFile), "Cartridge 'S' must write savefile");

        // 5c. NetHack zero 'goldorkmids' regression
        const nhSrc = fs.readFileSync(path.join(__dirname, '../variants/nethack/bin/nethack-bridge.js'), 'utf8');
        assert(!nhSrc.includes('goldorkmids'), 'nethack-bridge.js must not contain goldorkmids typo');

        // 5d. ProtocolOracle accepts Hengband CJK wide-char rows & Angband levelgen -more- pause
        const hengOracle = new ProtocolOracle('hengband', 'jp');
        const hengFrame = makeSyntheticFrame(1);
        hengFrame.term.rows[0] = { g: 'あ'.repeat(30) + ' '.repeat(20), a: '01'.repeat(80) };
        const hengIssues = hengOracle.validateFrame(hengFrame);
        assert(!hengIssues.some((i) => i.code === 'P1_TERM_WIDTH_MISMATCH'), 'Hengband CJK wide-char row must pass width check');

        const angOracle = new ProtocolOracle('angband', 'en');
        const levelGenMoreFrame = makeSyntheticFrame(2);
        levelGenMoreFrame.ui.more = true;
        levelGenMoreFrame.player = null;
        levelGenMoreFrame.map = null;
        const levelGenIssues = angOracle.validateFrame(levelGenMoreFrame);
        assert(!levelGenIssues.some((i) => i.code === 'P0_MISSING_PLAYER_IN_PLAY' || i.code === 'P0_MISSING_MAP_IN_PLAY'), 'Transient -more- levelgen pause must not trigger missing map/player');

        const idleMissingFrame = makeSyntheticFrame(3);
        idleMissingFrame.ui.more = false;
        idleMissingFrame.player = null;
        idleMissingFrame.map = null;
        const idleMissingIssues = angOracle.validateFrame(idleMissingFrame);
        assert(idleMissingIssues.some((i) => i.code === 'P0_MISSING_PLAYER_IN_PLAY'), 'Idle play frame without player must still fail');
        assert(idleMissingIssues.some((i) => i.code === 'P0_MISSING_MAP_IN_PLAY'), 'Idle play frame without map must still fail');

        // 5e. Hard visual/structural oracle guards (BUG-V1..V8 permanent pins)
        const gfxO = new GraphicsOracle({ realm: 'angband', expectV2: true, allowSoftwareGl: true });
        gfxO.checkedRendererOnce = true;
        const badGfxSnap = {
            inPlay: true,
            threeV2: true,
            frame: makeSyntheticFrame(2, { depth: 0 }),
            webgl: { contextLost: false, hasNaNTransform: false },
            viewmodel: { leftVisible: true, currentLeftWeapon: 'light:torch' },
            creatures: [{ key: 'char_male_peasant', race: 'Filthy street urchin', isHumanoid: true, hipsTiltRad: 1.45, sx: 1.7, sy: 0.45, sz: 0.6, minY: 0.8 }],
            lighting: { colorMgmtEnabled: true, ambientLum: 0.23 },
            probe: { consoleErrors: ["TypeError: this._applyUvSeamBleedFix is not a function"], webglErrors: [] }
        };
        const gfxIssues = gfxO.auditSnapshot(badGfxSnap);
        assert(gfxIssues.some((i) => i.code === 'P0_FORBIDDEN_OFFHAND_TORCH'), 'Must catch offhand torch viewmodel');
        assert(gfxIssues.some((i) => i.code === 'P0_CREATURE_ORIENTATION_CORRUPT'), 'Must catch flopping villager orientation');
        assert(gfxIssues.some((i) => i.code === 'P0_CONSOLE_RUNTIME_ERROR'), 'Must catch TypeError / missing method in console');
        assert(gfxIssues.some((i) => i.code === 'P1_LIGHTING_CRUSHED'), 'Must catch Three V2 ColorManagement lighting crush');

        const cleanGfxSnap = {
            inPlay: true,
            threeV2: true,
            frame: makeSyntheticFrame(3, { depth: 0 }),
            webgl: { contextLost: false, hasNaNTransform: false },
            viewmodel: { leftVisible: false, currentLeftWeapon: null },
            creatures: [{ key: 'char_male_peasant', race: 'Filthy street urchin', isHumanoid: true, hipsTiltRad: 0.08, sx: 0.65, sy: 1.70, sz: 0.45, minY: 0.0 }],
            lighting: { colorMgmtEnabled: false, ambientLum: 0.545 },
            probe: { consoleErrors: [], webglErrors: [] }
        };
        assert.strictEqual(gfxO.auditSnapshot(cleanGfxSnap).length, 0, 'Clean visual snapshot must pass GraphicsOracle');

        const uiO = new UiOracle({ realm: 'dcss', lang: 'en' });
        const badUiIssues = uiO.auditSnapshot({
            inPlay: true,
            dom: { termVisible: false },
            hudLayout: { charPanelOverflowX: 33, statsStripOverflowX: 30, compassOverlapsTopbar: true },
            probe: { errors: [] }
        });
        assert(badUiIssues.some((i) => i.code === 'P1_HUD_PANEL_CLIPPING'), 'Must catch #char-panel horizontal clipping');
        assert(badUiIssues.some((i) => i.code === 'P1_HUD_OVERLAP'), 'Must catch #yasd-compass-tape overlapping navbar');

        // 5f. Remote item pickup + stopAdjacent pathing + name-less FrogComposBand Hobo handling
        const { attach: attachAutoNav } = require('../server/public/js/input-autonav');
        class MockInput {
            constructor(realmName) {
                this._sent = [];
                this.realmName = realmName;
                this.network = { sendKey: (k) => this._sent.push(k) };
                this.app = { getActiveRealm: () => this.realmName, lastFrame: null };
            }
            getFeatAt(map, x, y) {
                const f = map.rows[y].f;
                return parseInt(f.substring(x * 2, x * 2 + 2), 16) || 0;
            }
            _statusSignatureOf() { return 'ok'; }
            _itemSignatureOf(fr) { return JSON.stringify(fr.items || []); }
            _syncExploreButtonUI() {}
        }
        attachAutoNav(MockInput);

        const navFrame1 = makeSyntheticFrame(10, { px: 2, py: 2, w: 8, h: 6 });
        navFrame1.items = [{ x: 3, y: 2, name: 'staff of firebolt [4/4]', glyph: '\\' }];
        const brogueNav = new MockInput('brogue');
        brogueNav.app.lastFrame = navFrame1;
        assert.strictEqual(brogueNav.startMinimapAutoNav(3, 2, navFrame1, { pickupOnArrival: true }), true, 'AutoNav to clicked item must start');
        brogueNav.stepMinimapAutoNav({ ...navFrame1, seq: 11, player: { ...navFrame1.player, x: 3, y: 2 } }, false);
        assert.strictEqual(brogueNav._sent[brogueNav._sent.length - 1], 'g', 'Arriving on item in Brogue must dispatch pickup key g');

        const nhNav = new MockInput('nethack');
        const navFrame2 = makeSyntheticFrame(12, { px: 2, py: 2, w: 8, h: 6 });
        navFrame2.realm = 'nethack';
        navFrame2.items = [{ x: 3, y: 2, name: 'scroll of identify', glyph: '?' }];
        nhNav.app.lastFrame = navFrame2;
        assert.strictEqual(nhNav.startMinimapAutoNav(3, 2, navFrame2, { pickupOnArrival: true }), true);
        nhNav.stepMinimapAutoNav({ ...navFrame2, seq: 13, player: { ...navFrame2.player, x: 3, y: 2 } }, false);
        assert.strictEqual(nhNav._sent[nhNav._sent.length - 1], ',', 'Arriving on item in NetHack must dispatch pickup key ,');

        const alreadyPickedNav = new MockInput('angband');
        alreadyPickedNav.app.lastFrame = navFrame1;
        assert.strictEqual(alreadyPickedNav.startMinimapAutoNav(3, 2, navFrame1, { pickupOnArrival: true }), true);
        alreadyPickedNav.stepMinimapAutoNav({ ...navFrame1, seq: 14, player: { ...navFrame1.player, x: 3, y: 2 }, items: [] }, false);
        assert(!alreadyPickedNav._sent.includes('g'), 'Must NOT send pickup key if item was already picked up');

        const adjFrame = makeSyntheticFrame(15, { px: 2, py: 2, w: 8, h: 6 });
        adjFrame.monsters = [{ id: 1, name: 'Hobo', glyph: 't', x: 5, y: 2, visible: true }];
        assert.strictEqual(brogueNav.computeMinimapPath(adjFrame, 2, 2, 5, 2, { stopAdjacent: false }).length, 0, 'Occupied goal without stopAdjacent must return empty path');
        const adjPath = brogueNav.computeMinimapPath(adjFrame, 2, 2, 5, 2, { stopAdjacent: true });
        assert(adjPath.length > 0 && Math.max(Math.abs(adjPath[adjPath.length - 1].x - 5), Math.abs(adjPath[adjPath.length - 1].y - 2)) === 1, 'stopAdjacent must path adjacent to monster');

        const EntityMenu = require('../server/public/js/entity-menu');
        let emNavArgs = null;
        const fakeListeners = {};
        const makeEl = (tag) => {
            const el = {
                tagName: tag, className: '', textContent: '', attrs: {}, children: [],
                classList: { add() {}, remove() {} },
                setAttribute(k, v) { this.attrs[k] = v; },
                appendChild(c) { this.children.push(c); },
                addEventListener(ev, fn) { fakeListeners[el.attrs['data-action-id'] || ev] = fn; }
            };
            return el;
        };
        const prevDoc = global.document;
        const prevWin = global.window;
        global.document = { createElement: makeEl };
        global.window = { __langMode: 'en', __app: { input: { startMinimapAutoNav: (...a) => { emNavArgs = a; } } } };
        const fakeCont = makeEl('div');
        EntityMenu.render({ type: 'item', x: 5, y: 3, name: 'staff of firebolt [4/4]' }, 'brogue', { player: { x: 2, y: 2 } }, { container: fakeCont });
        fakeListeners.pickup({ preventDefault() {}, stopPropagation() {} });
        global.document = prevDoc;
        global.window = prevWin;
        assert(emNavArgs && emNavArgs[0] === 5 && emNavArgs[1] === 3 && emNavArgs[3]?.pickupOnArrival === true, 'EntityMenu remote item pickup must trigger auto-nav with pickupOnArrival');

        const grounderSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/chronicle/chronicle-grounder.js'), 'utf8');
        const gCtx = { window: {}, self: {}, console, Math, Date, Object, Array, String, Number, Boolean, RegExp, Map, Set, JSON, parseInt, parseFloat, isNaN };
        gCtx.window = gCtx; gCtx.self = gCtx;
        vm.runInNewContext(grounderSrc, gCtx);
        const hoboObj = { id: 3, race: 'Hobo', glyph: 't', x: 10, y: 10, hp: 2, hp_max: 2 };
        assert.strictEqual(gCtx.ChronicleGrounder.classifyCreature(hoboObj, 'frogcomposband').category, 'beggar', 'Hobo must classify as beggar/outcast');
        const hoboParley = gCtx.ChronicleGrounder.resolveParleyOutcome(hoboObj, 'parley', { name: 'Vlad', depth: 0 }, 'frogcomposband', 'en', []);
        assert(hoboParley.title.includes('Hobo') && !hoboParley.title.includes('the creature'), 'resolveParleyOutcome must use race=Hobo when .name is absent');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    console.log('test_playtest_harness.js: ALL PASS');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

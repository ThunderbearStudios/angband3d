const assert = require('assert');
const path = require('path');

// Ensure clean environment for UMD module loading
global.ScreenContext = require('../server/public/js/screen-context.js');

let sentKeys = [];
let toasts = [];

global.testSendKey = (k) => {
    sentKeys.push(k);
};

global.testToast = (msg) => {
    toasts.push(msg);
};

function runTests() {
    console.log("Running MenuRouter tests...");

    // Test 0: Module existence and contract assertion (Incident 2026-10-11 Guard)
    let MenuRouter;
    try {
        MenuRouter = require('../server/public/js/menu-router.js');
    } catch (e) {
        assert.fail("menu-router.js failed to load: " + e.message);
    }

    assert.ok(MenuRouter, "MenuRouter must export an object");
    assert.strictEqual(typeof MenuRouter.route, 'function', "MenuRouter must export route()");
    assert.strictEqual(typeof MenuRouter.onFrame, 'function', "MenuRouter must export onFrame()");
    assert.strictEqual(typeof MenuRouter.chooseVerb, 'function', "MenuRouter must export chooseVerb()");
    assert.strictEqual(typeof MenuRouter.getPending, 'function', "MenuRouter must export getPending() [Incident Guard]");
    assert.strictEqual(typeof MenuRouter.clearPending, 'function', "MenuRouter must export clearPending()");
    assert.strictEqual(typeof MenuRouter.renderChooserHtml, 'function', "MenuRouter must export renderChooserHtml()");
    assert.ok('pending' in MenuRouter, "MenuRouter must define pending getter/setter");
    assert.ok(MenuRouter.VERBS, "MenuRouter must export VERBS table");
    assert.ok(MenuRouter.VERBS.silq, "VERBS must have silq table");
    assert.ok(MenuRouter.VERBS.hengband, "VERBS must have hengband table");
    assert.ok(MenuRouter.VERBS.frogcomposband, "VERBS must have frogcomposband table");
    assert.ok(MenuRouter.VERBS.angband, "VERBS must have angband table");

    // Test 1: Sil-Q Item List intercepted (e.g. inventory)
    sentKeys = [];
    toasts = [];
    MenuRouter.clearPending();

    const silqInvenFrame = {
        phase: 'play',
        realm: 'silq',
        map: {},
        term: {
            rows: [
                { g: "(Inventory) Command:" },
                { g: "  a) a Wooden Torch (with 5000 turns of light)" },
                { g: "  b) a piece of Bread" }
            ]
        }
    };

    // Route 'a' for Sil-Q -> should intercept and open chooser
    const routedA = MenuRouter.route('a', silqInvenFrame, 'silq');
    assert.strictEqual(routedA, true, "MenuRouter should intercept 'a' for item selection in sil-q");
    assert.strictEqual(sentKeys.length, 0, "No keys should be sent yet when opening chooser");
    
    const pendingState = MenuRouter.getPending();
    assert.ok(pendingState, "Pending state must exist after interception");
    assert.strictEqual(pendingState.step, 'chooser', "Pending step should be 'chooser'");
    assert.strictEqual(pendingState.item.key, 'a', "Pending item key should be 'a'");

    // Test 1b: Escape while chooser is open -> closes chooser client-side, sends nothing
    const routedEsc = MenuRouter.route('Escape', silqInvenFrame, 'silq');
    assert.strictEqual(routedEsc, true, "Escape should be handled client-side when chooser is open");
    assert.strictEqual(sentKeys.length, 0, "No keys should be sent on Escape in chooser");
    assert.strictEqual(MenuRouter.getPending(), null, "Pending state should be cleared on Escape");

    // Re-open chooser with 'a'
    MenuRouter.route('a', silqInvenFrame, 'silq');
    assert.ok(MenuRouter.getPending(), "Chooser re-opened");

    // Test 2: Choose verb in chooser ('w' = Wear/Wield in Sil-Q)
    MenuRouter.chooseVerb('w');
    assert.strictEqual(sentKeys.length, 1, "Verb key should be sent on chooseVerb");
    assert.strictEqual(sentKeys[0], 'w', "Sent key should be 'w'");
    assert.strictEqual(MenuRouter.getPending().step, 'await-prompt', "State must transition to 'await-prompt'");

    // Test 3: Prompt arrives from engine ("Wear/Wield which item?") -> match item label and send key
    sentKeys = [];
    const silqWearPromptFrame = {
        phase: 'play',
        realm: 'silq',
        map: {},
        term: {
            rows: [
                { g: "  a) a Wooden Torch (with 5000 turns of light)" },
                { g: "  b) a piece of Bread" },
                { g: "Wear/Wield which item?" }
            ]
        }
    };

    MenuRouter.onFrame(silqWearPromptFrame, 'silq');
    assert.strictEqual(sentKeys.length, 1, "Matching item key should be sent when prompt matches");
    assert.strictEqual(sentKeys[0], 'a', "Sent key should be 'a'");
    assert.strictEqual(MenuRouter.getPending(), null, "Pending state should be cleared after dispatch");

    // Test 4: Hengband Item Selection and Ineligible Item Fallback
    sentKeys = [];
    toasts = [];
    MenuRouter.clearPending();

    const hengInvenFrame = {
        phase: 'play',
        realm: 'hengband',
        map: {},
        term: {
            rows: [
                { g: "持ち物： (1/23) コマンド: " },
                { g: "  b) 食料 (Ration of Food)" }
            ]
        }
    };

    // Select item 'b'
    const routedHeng = MenuRouter.route('b', hengInvenFrame, 'hengband');
    assert.strictEqual(routedHeng, true, "MenuRouter should intercept 'b' in hengband");
    assert.strictEqual(sentKeys.length, 0, "No key sent yet");

    // Choose Wear/Wield ('w') for food -> food is ineligible to wear!
    MenuRouter.chooseVerb('w');
    assert.strictEqual(sentKeys.length, 1, "Verb 'w' sent");
    assert.strictEqual(sentKeys[0], 'w');

    // Engine responds with wear prompt listing NO food
    sentKeys = [];
    const hengWearPromptFrame = {
        phase: 'play',
        realm: 'hengband',
        map: {},
        term: {
            rows: [
                { g: "  a) 鍛冶師の金槌 (Smith's Hammer)" },
                { g: "どれを装備しますか？" } // "Which item to equip?"
            ]
        }
    };

    MenuRouter.onFrame(hengWearPromptFrame, 'hengband');
    assert.strictEqual(sentKeys.length, 1, "Should send Escape to cancel ineligible prompt");
    assert.strictEqual(sentKeys[0], 'escape', "Sent key should be escape");
    assert.strictEqual(toasts.length, 1, "Should trigger a warning toast");
    assert.strictEqual(MenuRouter.getPending(), null, "Pending state must be cleared");

    // Test 5: Pass-through for non-menu keys or non-matching letters
    sentKeys = [];
    MenuRouter.clearPending();
    const routedUpper = MenuRouter.route('W', silqInvenFrame, 'silq');
    assert.strictEqual(routedUpper, false, "Uppercase commands must pass through to engine");
    assert.strictEqual(sentKeys.length, 0);

    const routedUnlisted = MenuRouter.route('z', silqInvenFrame, 'silq');
    assert.strictEqual(routedUnlisted, false, "Unlisted item letter must pass through to engine");

    // Test 6: renderChooserHtml output check
    MenuRouter.route('a', silqInvenFrame, 'silq');
    const html = MenuRouter.renderChooserHtml(MenuRouter.getPending(), 'silq');
    assert.ok(html.includes('data-verb="w"'), "HTML must include wear verb button");
    assert.ok(html.includes('data-verb="Escape"'), "HTML must include escape button");
    assert.ok(html.includes('is-suggested'), "HTML should highlight a suggested action for torch");

    // Test 7: Offline / Vanilla Angband Real Inventory Fixture Routing (WS10.3 / WS31)
    sentKeys = [];
    toasts = [];
    MenuRouter.clearPending();

    const fs = require('fs');
    const angbandFixturePath = path.join(__dirname, 'fixtures', 'menus', 'angband', 'inventory.json');
    assert.ok(fs.existsSync(angbandFixturePath), "angband inventory fixture must exist");
    const angbandInvenFixture = JSON.parse(fs.readFileSync(angbandFixturePath, 'utf8'));
    const angbandInvenFrame = angbandInvenFixture.frame;

    // Route 'e' (Wooden Torch in fixture)
    const routedOfflineTorch = MenuRouter.route('e', angbandInvenFrame, 'angband');
    assert.strictEqual(routedOfflineTorch, true, "MenuRouter should intercept 'e' in Vanilla Angband / offline mode");
    assert.strictEqual(sentKeys.length, 0, "No keys should be sent yet when opening chooser");

    const offlinePending = MenuRouter.getPending();
    assert.ok(offlinePending, "Pending state must exist after interception");
    assert.strictEqual(offlinePending.item.key, 'e', "Pending item key should be 'e'");
    assert.strictEqual(offlinePending.step, 'chooser', "Pending step should be 'chooser'");

    // Render HTML for angband chooser
    const angbandHtml = MenuRouter.renderChooserHtml(offlinePending, 'angband');
    assert.ok(angbandHtml.includes('data-verb="w"'), "Angband chooser HTML must include wear button");
    assert.ok(angbandHtml.includes('is-suggested'), "Torch should have suggested action highlighted");

    // Choose verb 'w' from passive Vanilla Angband inventory:
    // Must exit passive 'Select Item:' with 'Escape' first so lowercase verbs ('d', 'a', 'w')
    // never collide with item slot letters a-e or get ignored by the passive list.
    MenuRouter.chooseVerb('w');
    assert.strictEqual(sentKeys.length, 2, "Escape + Verb 'w' should be sent from passive Angband inventory");
    assert.deepStrictEqual(sentKeys, ['escape', 'w']);

    // Simulate transient awaiting_command frame emitted by C engine right after Escape
    sentKeys = [];
    MenuRouter.onFrame({
        phase: 'play',
        realm: 'angband',
        map: angbandInvenFrame.map,
        ui: { overlay: 0, awaiting_command: true, more: false },
        term: { rows: [{ g: '' }] }
    }, 'angband');
    assert.ok(MenuRouter.getPending(), "Pending state must survive transient post-Escape frame");

    // Next frame: Wear/Wield prompt arrives
    sentKeys = [];
    const angbandWearPromptFrame = {
        phase: 'play',
        realm: 'angband',
        map: angbandInvenFrame.map,
        term: {
            rows: [
                { g: "  e) a Wooden Torch (5000 turns)                     2.2 lb" },
                { g: "Wear/Wield which item?" }
            ]
        }
    };
    MenuRouter.onFrame(angbandWearPromptFrame, 'angband');
    assert.strictEqual(sentKeys.length, 1, "Matching item key 'e' should be dispatched");
    assert.strictEqual(sentKeys[0], 'e');
    assert.strictEqual(MenuRouter.getPending(), null, "Pending state must be cleared after dispatch");

    // Test 8: LocalGameBridge command validation (WS10.3 / relay guard parity)
    const { LocalGameBridge } = require('../server/public/js/local_bridge.js');
    const localBridge = new LocalGameBridge();
    assert.strictEqual(typeof localBridge._validateCommand, 'function', "LocalGameBridge must implement _validateCommand");
    assert.strictEqual(localBridge._validateCommand('key a'), true, "'key a' should be allowed");
    assert.strictEqual(localBridge._validateCommand('key Escape'), true, "'key Escape' should be allowed");
    assert.strictEqual(localBridge._validateCommand('save'), true, "'save' should be allowed");
    assert.strictEqual(localBridge._validateCommand('frame'), true, "'frame' should be allowed");
    assert.strictEqual(localBridge._validateCommand('rm -rf'), false, "'rm -rf' must be blocked");
    assert.strictEqual(localBridge._validateCommand('key a\nevil'), false, "Multiline injection must be blocked");
    assert.strictEqual(localBridge._validateCommand(''), false, "Empty command must be blocked");

    // Test 9: FrogComposBand passive gear_ui routing (Examine vs Wear verb)
    sentKeys = [];
    MenuRouter.clearPending();
    const fcbInvenFrame = {
        phase: 'play',
        realm: 'frogcomposband',
        map: { w: 10, h: 10, rows: [] },
        ui: { overlay: 1, awaiting_command: false, more: false },
        term: {
            rows: [
                { g: "                Inventory | Equipment" },
                { g: "                a) 2 Rations of Food                 2.0 lbs" },
                { g: "                b) a Dagger (1d4) (+0,+0)            1.2 lbs" },
                { g: "                Examine which item (Esc to exit)?" }
            ]
        }
    };
    assert.strictEqual(MenuRouter.route('b', fcbInvenFrame, 'frogcomposband'), true, "FCB item 'b' must open chooser");
    MenuRouter.chooseVerb('I');
    assert.deepStrictEqual(sentKeys, ['b'], "FCB Inspect ('I') in gear_ui must send slot key directly without Escape");
    assert.strictEqual(MenuRouter.getPending(), null);

    sentKeys = [];
    assert.strictEqual(MenuRouter.route('b', fcbInvenFrame, 'frogcomposband'), true);
    MenuRouter.chooseVerb('w');
    assert.deepStrictEqual(sentKeys, ['escape', 'w'], "FCB Wear ('w') in gear_ui must exit passive list first");
    sentKeys = [];
    MenuRouter.onFrame({
        phase: 'play',
        realm: 'frogcomposband',
        map: { w: 10, h: 10, rows: [] },
        ui: { overlay: 0, awaiting_command: true, more: false },
        term: { rows: [{ g: '' }] }
    }, 'frogcomposband');
    assert.ok(MenuRouter.getPending(), "FCB pending state must survive transient post-Escape frame");
    MenuRouter.onFrame({
        phase: 'play',
        realm: 'frogcomposband',
        map: { w: 10, h: 10, rows: [] },
        ui: { overlay: 1, awaiting_command: false, more: false },
        term: {
            rows: [
                { g: "  b) a Dagger (1d4) (+0,+0)            1.2 lbs" },
                { g: "Wear/Wield which item?" }
            ]
        }
    }, 'frogcomposband');
    assert.deepStrictEqual(sentKeys, ['b'], "FCB Wear prompt must dispatch matched item key 'b'");
    assert.strictEqual(MenuRouter.getPending(), null);

    // Test 10: Vanilla Angband native Command for <item>: suffix action extraction
    const cmdForRows = [
        { g: "                      Inspect (I)" },
        { g: "                      Equip (w)" },
        { g: "                      Drop (d)" },
        { g: "                      Inscribe ({)" },
        { g: "                      Ignore (k)" },
        { g: " (Enter to select, ESC) Command for a Wooden Torch (5000 turns):" }
    ];
    const extractedActions = global.ScreenContext.extractItems(cmdForRows, false);
    assert.deepStrictEqual(
        extractedActions.map(x => x.key),
        ['I', 'w', 'd', '{', 'k'],
        "extractItems must parse suffix action tags on Command for <item>: screens"
    );
    const rowRegions = global.ScreenContext.extractRowRegions("                      Equip (w)");
    assert.strictEqual(rowRegions.length, 1);
    assert.strictEqual(rowRegions[0].key, 'w');
    assert.strictEqual(rowRegions[0].label, 'Equip');

    // Test 11: QuickActionManager & RealmGrimoireDeck Japanese (JP) parity
    const QuickActionManager = require('../server/public/js/quick-actions.js');
    const RealmGrimoireDeck = require('../server/public/js/grimoire-deck.js');

    assert.ok(QuickActionManager, "QuickActionManager must export cleanly");
    assert.strictEqual(QuickActionManager.normalizeItemName("3 治癒の薬 (3.0 kg)"), "治癒の薬");
    assert.strictEqual(QuickActionManager.normalizeItemName("5 Potions of Cure Critical Wounds {25% off}"), "potions of cure critical wounds");

    const samplePackFrame = {
        phase: 'play',
        realm: 'hengband',
        player: {
            inventory: [
                { slot: 0, label: 'a', name: '2 伝統的な松明', tval: 39, sval: 1, number: 2 },
                { slot: 2, label: 'c', name: '4 致命傷の治癒の薬', tval: 71, sval: 38, number: 4 }
            ],
            equipment: []
        }
    };
    const matchByTval = QuickActionManager.resolveSlot(
        { type: 'item', verb: 'q', normalizedName: 'different', tval: 71, sval: 38 },
        samplePackFrame,
        'hengband',
        'jp'
    );
    assert.ok(matchByTval && matchByTval.available && matchByTval.qtyText === 'x4' && matchByTval.sequence[1] === 'c', "QuickActionManager must resolve shifted slot 'c' via (tval, sval) and qtyText='x4'");

    // Verify RealmGrimoireDeck Japanese (JP) categorization & rarity
    assert.strictEqual(RealmGrimoireDeck.classifyItemCategory('3 致命傷の治癒の薬').category, 'potion');
    assert.strictEqual(RealmGrimoireDeck.classifyItemCategory('2 ショート・テレポートの巻物').category, 'scroll');
    assert.strictEqual(RealmGrimoireDeck.classifyItemCategory('魔法の矢の魔法棒 (8回)').category, 'device');
    assert.strictEqual(RealmGrimoireDeck.classifyItemCategory('初歩の魔法書 [1冊目]').category, 'tome');
    assert.strictEqual(RealmGrimoireDeck.classifyItemCategory('★名刀『村正』 (4d5) (+18,+18)').category, 'weapon');
    assert.strictEqual(RealmGrimoireDeck.detectRarity('★名刀『村正』 (4d5) (+18,+18)'), 'artifact');

    // Test 12: Vanilla Angband (tval 0..35) vs Variant (tval 16..115) disambiguation & fire_nearest sequence
    assert.strictEqual(QuickActionManager.classifyInventoryEntry({ name: '3 Wooden Torches', tval: 19 }, 'angband').category, 'other',
        'Vanilla Angband Torch (tval=19) must not be misclassified as ranged bow');
    assert.strictEqual(QuickActionManager.classifyInventoryEntry({ name: 'Long Bow (x3)', tval: 19 }, 'hengband').category, 'ranged',
        'Variant Long Bow (tval=19) must be classified as ranged');
    assert.strictEqual(QuickActionManager.classifyInventoryEntry({ name: '青い薬', tval: 71 }, 'hengband').category, 'potion',
        'Unidentified JP potion ending in 薬 must be classified as potion');

    const vanillaRangedFrame = {
        phase: 'play',
        realm: 'angband',
        player: {
            equipment: [{ slot: 1, name: 'Short Bow (x2)', tval: 5 }],
            quiver: [{ slot: 0, label: '0', name: '25 Arrows (1d4)', tval: 3, number: 25 }],
            inventory: []
        }
    };
    const vanillaShoot = QuickActionManager.resolveSlot({ type: 'fire_nearest' }, vanillaRangedFrame, 'angband', 'en');
    assert.deepStrictEqual(vanillaShoot.sequence, ['f', '0', 't'], 'Vanilla Angband fire_nearest must include ammo slot key before t');

    const silqRangedFrame = {
        phase: 'play',
        realm: 'silq',
        player: {
            equipment: [
                { slot: 1, name: 'Shortbow', tval: 19 },
                { slot: 12, name: '18 Arrows', tval: 17, number: 18 }
            ],
            inventory: []
        }
    };
    const silqShoot = QuickActionManager.resolveSlot({ type: 'fire_nearest' }, silqRangedFrame, 'silq', 'en');
    assert.strictEqual(silqShoot.available, true, 'Sil-Q fire_nearest must detect quiver arrows in equipment');
    assert.deepStrictEqual(silqShoot.sequence, ['f', 't'], 'Sil-Q fire_nearest must dispatch [f, t] without ammo prompt');

    // Test 13: MinimapNavigator row.l fog-of-war & closed door (feat=2) pathfinding
    const { InputController } = require('../server/public/js/input.js');
    const navDummy = Object.create(InputController.prototype);
    navDummy.getFeatAt = (map, x, y) => {
        const r = map.rows[y];
        if (!r || !r.f) return 1;
        return parseInt(r.f.substring(x * 2, x * 2 + 2), 16) || 1;
    };
    const navFrame = {
        phase: 'play',
        map: {
            w: 5,
            h: 3,
            rows: [
                { g: '#####', f: '1010101010', l: '22222' },
                { g: '.+..#', f: '0102010110', l: '33220' },
                { g: '#####', f: '1010101010', l: '22222' }
            ]
        }
    };
    const navPath = navDummy.computeMinimapPath(navFrame, 0, 1, 3, 1);
    assert.strictEqual(navPath.length, 3, 'Minimap A* must find 3-step path across row.l explored tiles');
    assert.strictEqual(navPath[0].isClosedDoor, true, 'Step onto feat=02 (+) must be flagged as isClosedDoor');
    assert.strictEqual(navPath[1].isClosedDoor, false, 'Open floor tile must not be flagged as closed door');

    // Test 14: Town (depth=0) auto-navigation routes around townspeople & supports live re-routing
    const sentMoveKeys = [];
    navDummy.network = { sendKey: (k) => sentMoveKeys.push(k) };
    const townFrame = {
        phase: 'play',
        ui: { awaiting_command: true, overlay: 0, more: false },
        player: { x: 0, y: 1, depth: 0, hp: 20, statuses: [] },
        monsters: [{ x: 1, y: 1, name: 'Scrawny cat', glyph: 'f', visible: true }],
        items: [],
        map: {
            w: 4,
            h: 3,
            rows: [
                { g: '....', f: '01010101', l: '0000' },
                { g: '....', f: '01010101', l: '0000' },
                { g: '....', f: '01010101', l: '0000' }
            ]
        }
    };
    assert.strictEqual(navDummy.computeMinimapPath(townFrame, 0, 1, 1, 1).length, 0,
        'Must not auto-navigate directly onto a creature tile');
    const startedTownNav = navDummy.startMinimapAutoNav(2, 1, townFrame);
    assert.strictEqual(startedTownNav, true, 'Town auto-navigation must succeed even when townspeople are in sight');
    assert.strictEqual(sentMoveKeys.length, 1, 'First step must be dispatched immediately on startMinimapAutoNav');
    assert.ok(navDummy._autoNav && navDummy._autoNav.path.every((s) => !(s.x === 1 && s.y === 1)),
        'A* path must route around the townsperson at (1,1)');
    const rerouted = navDummy.startMinimapAutoNav(3, 0, townFrame);
    assert.strictEqual(rerouted, true, 'Clicking a new destination while auto-navigating must re-route immediately');
    assert.strictEqual(navDummy._autoNav.goalX, 3, 'New goalX must be updated to 3');
    navDummy.stopMinimapAutoNav('Cancelled');

    // Test 15: WS33 StreetView safety gate, Bresenham LOS, Tab Classic Map viewport offset & Grimoire progressive disclosure
    assert.strictEqual(typeof navDummy.canEngageStreetViewNav, 'function', 'InputController must expose canEngageStreetViewNav');
    assert.strictEqual(typeof navDummy._hasClearLOS, 'function', 'InputController must expose _hasClearLOS');
    assert.strictEqual(navDummy.canEngageStreetViewNav(townFrame), true, 'Peaceful town frame must allow StreetView nav');
    const blindFrame = JSON.parse(JSON.stringify(townFrame));
    blindFrame.player.statuses = [{ name: 'Blind' }];
    assert.strictEqual(navDummy.canEngageStreetViewNav(blindFrame), false, 'Blind status must block StreetView nav');
    const hostileDungeonFrame = JSON.parse(JSON.stringify(townFrame));
    hostileDungeonFrame.player.depth = 3;
    hostileDungeonFrame.monsters = [{ x: 2, y: 1, name: 'Cave orc', glyph: 'o', ml: true }];
    assert.strictEqual(navDummy.canEngageStreetViewNav(hostileDungeonFrame), false, 'Visible hostile monster in dungeon must block StreetView nav');
    assert.strictEqual(navDummy._hasClearLOS(0, 1, 3, 1, navFrame.map), false, 'Closed door on (1,1) must block ranged LOS');
    assert.strictEqual(navDummy._hasClearLOS(0, 1, 3, 1, townFrame.map), true, 'Open floor must have clear ranged LOS');

    const { WebTerminal } = require('../server/public/js/terminal.js');
    const termDummy = Object.create(WebTerminal.prototype);
    termDummy._findPlayerTermCoords({
        rows: [
            { g: 'Level 1' },
            { g: 'STR:     18 ....@....' },
            { g: 'INT:     12 .........' }
        ]
    }, { x: 24, y: 15 });
    assert.strictEqual(termDummy._playerTermCol, 16, 'TerminalRenderer must locate @ column in map region (c >= 12)');
    assert.strictEqual(termDummy._playerTermRow, 1, 'TerminalRenderer must locate @ row');
    assert.strictEqual(termDummy._vpOx, 8, 'Viewport X offset must equal player.x - @col');
    assert.strictEqual(termDummy._vpOy, 14, 'Viewport Y offset must equal player.y - @row');

    // Test 16: WS34 Classic View (Tab) sidebar colon immunity, 3D StreetView distant monster allowance & Rosette delta mapping
    const distantMonsterFrame = JSON.parse(JSON.stringify(townFrame));
    distantMonsterFrame.player.depth = 3;
    distantMonsterFrame.monsters = [{ x: 8, y: 1, name: 'Cave orc', glyph: 'o', ml: true }];
    assert.strictEqual(navDummy.canEngageStreetViewNav(distantMonsterFrame), true,
        'Monsters > 2 tiles away must NOT lock out 3D StreetView or hover routing');

    navDummy.dungeon = { yaw: 0 };
    const fwdDelta = navDummy.getRelativeWorldDelta(8);
    assert.deepStrictEqual(fwdDelta, { dx: 0, dy: -1 }, 'North-facing StreetView forward chevron (8) must map to (0, -1)');
    const neDelta = navDummy.getRelativeWorldDelta(9);
    assert.deepStrictEqual(neDelta, { dx: 1, dy: -1 }, 'North-facing StreetView NE chevron (9) must map to (1, -1)');

    let tabClickedTarget = null;
    global.window = global.window || {};
    global.window.__app = {
        lastFrame: townFrame,
        input: {
            startMinimapAutoNav: (tx, ty) => {
                tabClickedTarget = { tx, ty };
                return true;
            }
        }
    };
    termDummy.rows = 24;
    termDummy.cols = 80;
    termDummy.decodeText = (s) => s;
    termDummy.lastTermData = {
        rows: [
            { g: '' },
            { g: 'STR:     18 @...      ' },
            { g: 'HP:   24/24 ....      ' }
        ]
    };
    termDummy.lastRows = termDummy.lastTermData.rows;
    termDummy.handleRowClick(1, 15);
    assert.deepStrictEqual(tabClickedTarget, { tx: 3, ty: 1 },
        'Clicking Classic View map row with sidebar "STR: 18" must route via startMinimapAutoNav instead of matching "R:"');

    // Test 17: WS36 Classic Terminal default & Menu vs Map click disambiguation
    assert.strictEqual(RealmGrimoireDeck.mode, 'classic', 'RealmGrimoireDeck must default to classic mode so Grimoire cards never steal terminal real estate');
    assert.strictEqual(RealmGrimoireDeck.manualTerminalMode, true, 'RealmGrimoireDeck.manualTerminalMode must default to true in classic mode');
    let dispatchedMenuKey = null;
    termDummy.onKeyClick = (k) => { dispatchedMenuKey = k; };
    tabClickedTarget = null;
    termDummy.lastTermData = {
        rows: [
            { g: 'Inventory:' },
            { g: 'STR:     18  a) a Potion of Cure Light Wounds' },
            { g: 'HP:   24/24  b) a Scroll of Phase Door       ' }
        ]
    };
    termDummy.lastRows = termDummy.lastTermData.rows;
    termDummy.handleRowClick(1, 20);
    assert.strictEqual(tabClickedTarget, null, 'Clicking an inventory menu row in col >= 12 must NOT trigger startMinimapAutoNav');
    assert.strictEqual(dispatchedMenuKey, 'a', 'Clicking an inventory menu row in col >= 12 must dispatch menu letter "a"');

    // Verify ArrowUp/ArrowDown moveSelection preserves selection across attr=14 rows and updates chooser item + book suggested verb
    assert.strictEqual(MenuRouter.determineSuggestedVerb({ key: 'a', label: "a Holy Book of Prayers [Novice's Handbook]", glyph: '?' }, 'inven', 'angband'), 'b',
        'Prayer Book / Magic Book must suggest Browse (b) verb');
    termDummy.syncRibbonSelection = () => {};
    termDummy.render = (td) => termDummy.updateSelectableRegions(td, 'item_prompt');
    termDummy.parseAttr = WebTerminal.prototype.parseAttr;
    termDummy.extractRowRegions = (line) => global.ScreenContext.extractRowRegions(line);
    termDummy.updateSelectableRegions({
        rows: [
            { g: 'Select Item: (Inven: a-b, / for Equip, ESC)' },
            { g: 'a) a Holy Book of Prayers [Novice\'s Handbook]', a: '0e0e' },
            { g: 'b) a Ration of Food', a: '0101' }
        ]
    }, 'item_prompt');
    assert.strictEqual(termDummy.selectedKey, 'a');
    assert.strictEqual(termDummy.moveSelection(1), 'b', 'moveSelection(1) must advance from a to b without resetting to attr=14 row a');
    assert.strictEqual(termDummy.selectedKey, 'b');

    // Test 18: WS38 Final Polish Guard (Unstudied Spell Safety, Ranged/Door/Wall Precision, Message Log Default Expanded)
    const unstudiedCasterFrame = {
        phase: 'play',
        realm: 'frogcomposband',
        player: {
            level: 1,
            class: 'Mage',
            sp: 6,
            sp_max: 6,
            statuses: [{ name: 'Study' }],
            inventory: [{ slot: 0, label: 'a', name: 'a Book of Magic Spells [Beginner\'s Handbook]', tval: 90, sval: 0 }],
            equipment: []
        }
    };
    const unstudiedSlot = QuickActionManager.resolveSlot({ type: 'smart_magic' }, unstudiedCasterFrame, 'frogcomposband', 'en');
    assert.strictEqual(unstudiedSlot.available, false, 'Unstudied L1 caster with Study status must not mark smart_magic available');
    assert.deepStrictEqual(unstudiedSlot.sequence, [], 'Unstudied L1 caster must never dispatch [m, a, a, t]');

    assert.strictEqual(navDummy.canPlayerShootRanged({
        realm: 'angband',
        player: {
            equipment: [],
            quiver: [],
            inventory: [{ slot: 0, label: 'a', name: 'a Short Bow (x2)', tval: 5 }]
        }
    }), false, 'Unequipped bow with 0 ammo must not enable ranged shoot recommendation');

    assert.strictEqual(navDummy.canPlayerShootRanged(vanillaRangedFrame), true,
        'Equipped bow with arrows in quiver must enable ranged shoot recommendation');

    const doorWallMap = {
        w: 4,
        h: 3,
        rows: [
            { g: '####', f: '13131313' },
            { g: '@\'+#', f: '01030213' },
            { g: '@:..', f: '01100101' }
        ]
    };
    assert.strictEqual(navDummy.raycastTargetAhead({ map: doorWallMap, monsters: [] }, 0, 1, { dx: 1, dy: 0 }).type, 'door',
        'raycastTargetAhead must skip open door (feat=3) and detect closed door (feat=2)');
    assert.strictEqual(navDummy.raycastTargetAhead({ map: doorWallMap, monsters: [] }, 0, 0, { dx: 1, dy: 0 }), null,
        'raycastTargetAhead must stop at ordinary granite wall (feat=19) without recommending tunnel');
    assert.strictEqual(navDummy.raycastTargetAhead({ map: doorWallMap, monsters: [] }, 0, 2, { dx: 1, dy: 0 }).type, 'wall',
        'raycastTargetAhead must detect rubble (feat=16) as tunnelable');

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'server', 'public', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="message-feed-window" class="message-feed-window expanded"'),
        'Message feed window must default expanded at startup');
    assert.ok(indexHtml.includes('id="btn-chronicle-pin"'), 'Living Chronicle Tome must include #btn-chronicle-pin');
    assert.ok(indexHtml.includes('id="edge-turn-left"') && indexHtml.includes('id="edge-turn-right"'),
        '3D HUD must include far-left and far-right viewport turn chevrons');

    // Test 19: WS42.1C Classifier & Router Hotfixes
    // CMD-P0-04: Chooser precedence on letter 'd' matching visible item row
    const multiItemFrame = {
        phase: 'play',
        realm: 'silq',
        map: {},
        term: {
            rows: [
                { g: "(Inventory) Command:" },
                { g: "  a) a Wooden Torch" },
                { g: "  b) a piece of Bread" },
                { g: "  c) a Flask of Oil" },
                { g: "  d) a Dagger (+0,+0)" }
            ]
        }
    };
    MenuRouter.clearPending();
    sentKeys = [];
    toasts = [];
    assert.strictEqual(MenuRouter.route('a', multiItemFrame, 'silq'), true, "Must open chooser on 'a'");
    assert.strictEqual(sentKeys.length, 0);
    assert.strictEqual(MenuRouter.getPending().itemKey, 'a');

    // Press 'd' while chooser is open: must re-select item 'd' instead of triggering Drop verb
    assert.strictEqual(MenuRouter.route('d', multiItemFrame, 'silq'), true, "Must re-select item 'd'");
    assert.strictEqual(sentKeys.length, 0, "No keys should be sent when re-selecting item 'd'");
    assert.strictEqual(MenuRouter.getPending().itemKey, 'd', "Chooser must now point to itemKey 'd'");
    assert.strictEqual(MenuRouter.getPending().itemName, "a Dagger (+0,+0)");

    // CMD-P1-10: In passive command-loop lists, pressing a verb key on keyboard passes through
    MenuRouter.clearPending();
    const routedKbDrop = MenuRouter.route('d', multiItemFrame, 'silq', { source: 'keyboard' });
    assert.strictEqual(routedKbDrop, false, "Native verb 'd' on keyboard must pass through to engine");

    // CMD-P2-05: In Vanilla Angband, unmapped prompts pass through natively
    const unmappedVanillaFrame = {
        phase: 'play',
        realm: 'angband',
        map: {},
        term: {
            rows: [
                { g: "Get which item?" },
                { g: "  a) a Wooden Torch" }
            ]
        }
    };
    assert.strictEqual(MenuRouter.route('a', unmappedVanillaFrame, 'angband'), false, "Unmapped prompt must pass through");

    // CMD-P3-03: Formatted readable toast
    sentKeys = [];
    toasts = [];
    MenuRouter.clearPending();
    MenuRouter.route('a', silqInvenFrame, 'silq');
    MenuRouter.chooseVerb('w');
    sentKeys = [];
    MenuRouter.onFrame({
        phase: 'play',
        realm: 'silq',
        map: {},
        term: {
            rows: [
                { g: "  b) a piece of Bread" },
                { g: "Wear/Wield which item?" }
            ]
        }
    }, 'silq');
    assert.strictEqual(sentKeys.length, 1);
    assert.strictEqual(sentKeys[0], 'escape');
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0], "Can't Wear/Wield that item.", "Toast must use readable verb label");

    // CMD-P1-14: Deadline self-healing timer
    MenuRouter.clearPending();
    MenuRouter.route('a', silqInvenFrame, 'silq');
    MenuRouter.chooseVerb('w');
    assert.ok(MenuRouter.getPending());
    MenuRouter.getPending().deadline = Date.now() - 50;
    MenuRouter.onFrame(silqInvenFrame, 'silq');
    assert.strictEqual(MenuRouter.getPending(), null, "Expired pending state must be self-healed");

    console.log("All MenuRouter, WS32, WS33, WS34, WS35, WS36, WS38 & WS42.1C unit tests passed successfully!");
}

try {
    runTests();
} catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
}

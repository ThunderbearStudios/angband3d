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
    assert.strictEqual(sentKeys[0], 'Escape', "Sent key should be Escape");
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

    // Test 7: Offline / Vanilla Angband Real Inventory Fixture Routing (WS10.3)
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

    // Choose verb 'w'
    MenuRouter.chooseVerb('w');
    assert.strictEqual(sentKeys.length, 1, "Verb 'w' should be sent");
    assert.strictEqual(sentKeys[0], 'w');

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

    console.log("All MenuRouter unit tests passed successfully!");
}

try {
    runTests();
} catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
}

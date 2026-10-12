const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Setup global mock for node environment
global.ScreenContext = null;
global.MenuRouter = null;

// Load the modules (UMD handles require nicely)
global.ScreenContext = require('../server/public/js/screen-context.js');
global.MenuRouter = require('../server/public/js/menu-router.js');

let sentKeys = [];
global.testSendKey = (k) => {
    sentKeys.push(k);
};

// Mock document for DOM calls inside MenuRouter
global.document = {
    getElementById: (id) => {
        if (id === 'term-contextual-actions') {
            return {
                style: {},
                innerHTML: '',
            };
        }
        return null;
    }
};

function runTests() {
    console.log("Running MenuRouter tests...");

    // Test 1: Sil-Q Item List intercepted (e.g. inventory)
    sentKeys = [];
    let frame1 = {
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

    console.log("Routing 'a' for Sil-Q...");
    let classifier = global.ScreenContext.classify(frame1);
    console.log("Classifier output:", classifier);
    let routed = global.MenuRouter.route('a', frame1, 'silq');
    
    // In 'item-list' + 'command', 'a' should be intercepted and open the chooser.
    assert.strictEqual(routed, true, "MenuRouter should intercept 'a' for item selection in sil-q");
    assert.strictEqual(sentKeys.length, 0, "No keys should be sent yet when opening chooser");

    // Test 2: Choose verb in chooser
    console.log("Choosing verb 'w' (Wear/Wield)...");
    global.MenuRouter.chooseVerb('w');
    
    // When a verb is chosen, the verb ('w') is sent first, and state changes to await-prompt
    assert.strictEqual(sentKeys.length, 1, "Verb key should be sent");
    assert.strictEqual(sentKeys[0], 'w', "Sent key should be 'w'");

    // Test 3: The engine responds with an item selection prompt (e.g., "Wear/Wield which item?")
    sentKeys = [];
    let frame2 = {
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
    
    console.log("Passing prompt frame back to onFrame...");
    global.MenuRouter.onFrame(frame2, 'silq');

    // The router should see the prompt, find the matching item, and send its key
    assert.strictEqual(sentKeys.length, 1, "Item key should be sent after matching prompt");
    assert.strictEqual(sentKeys[0], 'a', "Sent key should be 'a'");

    console.log("MenuRouter unit tests passed successfully!");
}

try {
    runTests();
} catch (err) {
    console.error(err);
    process.exit(1);
}

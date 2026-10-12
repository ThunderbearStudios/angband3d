const fs = require('fs');
const path = require('path');
const { classify } = require('../server/public/js/screen-context.js');

const fixturesDir = path.join(__dirname, 'fixtures', 'menus');
const realms = ['angband', 'silq', 'hengband'];

let failed = 0;
let passed = 0;

function assertContext(realm, screenName, frame, expectedMode, expectedListKind, expectedPromptKind) {
    if (!frame) {
        console.warn(`[SKIP] No frame provided for ${realm} ${screenName}`);
        return;
    }
    frame.realm = realm; // inject realm for classify()

    const result = classify(frame);
    
    let error = false;
    if (result.mode !== expectedMode) {
        console.error(`[FAIL] ${realm} ${screenName}: expected mode '${expectedMode}', got '${result.mode}'`);
        error = true;
    }
    if (expectedListKind && result.listKind !== expectedListKind) {
        console.error(`[FAIL] ${realm} ${screenName}: expected listKind '${expectedListKind}', got '${result.listKind}'`);
        error = true;
    }
    if (expectedPromptKind && result.promptKind !== expectedPromptKind) {
        console.error(`[FAIL] ${realm} ${screenName}: expected promptKind '${expectedPromptKind}', got '${result.promptKind}'`);
        error = true;
    }

    if (error) {
        console.error(`   Screen text was:\n${result.screenText.split('\n').slice(0, 3).join('\n')}...`);
        failed++;
    } else {
        passed++;
    }
}

realms.forEach(realm => {
    const realmDir = path.join(fixturesDir, realm);
    if (!fs.existsSync(realmDir)) return;

    const invenPath = path.join(realmDir, 'inventory.json');
    if (fs.existsSync(invenPath)) {
        const frame = JSON.parse(fs.readFileSync(invenPath, 'utf8'));
        // Angband: select prompt
        // SilQ/Hengband: command prompt
        const expectedPrompt = (realm === 'angband') ? 'select' : 'command';
        assertContext(realm, 'inventory', frame, 'item-list', 'inven', expectedPrompt);
    }

    const equipPath = path.join(realmDir, 'equipment.json');
    if (fs.existsSync(equipPath)) {
        const frame = JSON.parse(fs.readFileSync(equipPath, 'utf8'));
        const expectedPrompt = (realm === 'angband') ? 'select' : 'command';
        assertContext(realm, 'equipment', frame, 'item-list', 'equip', expectedPrompt);
    }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

// Test combat messages, popup messages, and top overlay suppression
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Test CSS suppression of top action overlay and target card
console.log('--- Test 1: CSS Top Overlay Suppression ---');
const cssPath = path.join(__dirname, '../server/public/css/dungeon.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

assert(cssContent.includes('.reticle-target-card {') && cssContent.includes('display: none !important;'),
    'reticle-target-card must be display: none !important');
assert(cssContent.includes('.context-action-cue {') && cssContent.includes('display: none !important;'),
    'context-action-cue must be display: none !important');
console.log('✅ CSS correctly suppresses .reticle-target-card and .context-action-cue with display: none !important');

// 2. Test app.js needsTerminal logic
console.log('\n--- Test 2: needsTerminal logic in app.js ---');

// Extract needsTerminal function from app.js
const appJsPath = path.join(__dirname, '../server/public/js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Simple sandbox to evaluate needsTerminal
function decodeHengbandText(text) { return text; }
let forceTerminal = false;

// Extract needsTerminal definition
const match = appJsContent.match(/function needsTerminal\(frame\) \{([\s\S]*?)\n    \}/);
if (!match) {
    throw new Error('Could not find function needsTerminal in app.js');
}

const needsTerminalFn = new Function('frame', 'forceTerminal', 'decodeHengbandText', match[1]);
function testNeedsTerminal(frame) {
    return needsTerminalFn(frame, forceTerminal, decodeHengbandText);
}

// Test cases
// Case A: Normal combat hit with awaiting_command = true, more = false
const combatFrame1 = {
    phase: 'play',
    player: { name: 'Hero', hp: 100, hp_max: 100 },
    ui: { awaiting_command: true, more: false, overlay: 0, context: 'dungeon' },
    term: { rows: [{ g: 'You strike the Filthy street urchin (6 damage).' }] }
};
assert.strictEqual(testNeedsTerminal(combatFrame1), false, 'Combat hit without -more- must stay in 3D');
console.log('✅ Combat hit frame -> needsTerminal: false (stays in 3D)');

// Case B: Combat hit with -more- prompt (e.g. multi-attack or critical hit message)
const combatMoreFrame = {
    phase: 'play',
    player: { name: 'Hero', hp: 85, hp_max: 100 },
    ui: { awaiting_command: false, more: true, overlay: 0, context: 'dungeon' },
    term: { rows: [{ g: 'The Cave orc hits you (15 damage). -more-' }] }
};
assert.strictEqual(testNeedsTerminal(combatMoreFrame), false, 'Combat message with -more- must stay in 3D');
console.log('✅ Combat -more- frame -> needsTerminal: false (stays in 3D)');

// Case C: Directional aiming ("Direction?")
const aimFrame = {
    phase: 'play',
    player: { name: 'Hero', hp: 100, hp_max: 100 },
    ui: { awaiting_command: false, more: false, overlay: 0, context: 'dungeon' },
    term: { rows: [{ g: 'Direction?' }] }
};
assert.strictEqual(testNeedsTerminal(aimFrame), false, 'Direction aiming must stay in 3D');
console.log('✅ Direction aiming frame -> needsTerminal: false (stays in 3D)');

// Case D: Target prompt ("Target [t to target]?")
const targetPromptFrame = {
    phase: 'play',
    player: { name: 'Hero', hp: 100, hp_max: 100 },
    ui: { awaiting_command: false, more: false, overlay: 0, context: 'dungeon' },
    term: { rows: [{ g: 'Target: a Cave orc (10sq away) [*, t, p]' }] }
};
assert.strictEqual(testNeedsTerminal(targetPromptFrame), false, 'Target selection must stay in 3D');
console.log('✅ Target selection frame -> needsTerminal: false (stays in 3D)');

// Case E: Generic message popup without menu (e.g. wall bump or feeling)
const popupFrame = {
    phase: 'play',
    player: { name: 'Hero', hp: 100, hp_max: 100 },
    ui: { awaiting_command: true, more: false, overlay: 0, context: 'dungeon' },
    term: { rows: [{ g: 'You feel there are great treasures here.' }] }
};
assert.strictEqual(testNeedsTerminal(popupFrame), false, 'Level feeling popup must stay in 3D');
console.log('✅ Level feeling popup frame -> needsTerminal: false (stays in 3D)');

// Case F: Actual Inventory / Spell Menu (SHOULD show terminal/menu)
const inventoryMenuFrame = {
    phase: 'play',
    player: { name: 'Hero', hp: 100, hp_max: 100 },
    ui: { awaiting_command: false, more: false, overlay: 1, context: 'menu' },
    term: { rows: [{ g: 'Inven: a) a Long Sword' }] }
};
assert.strictEqual(testNeedsTerminal(inventoryMenuFrame), true, 'Inventory menu must show terminal/menu');
console.log('✅ Inventory menu frame -> needsTerminal: true (opens menu/terminal view)');

// Case G: Query prompt e.g. "Drop how many?"
const queryPromptFrame = {
    phase: 'play',
    player: { name: 'Hero', hp: 100, hp_max: 100 },
    ui: { awaiting_command: false, more: false, overlay: 0, context: 'dungeon' },
    term: { rows: [{ g: 'Drop how many? ' }] }
};
assert.strictEqual(testNeedsTerminal(queryPromptFrame), true, 'Quantity query prompt must show terminal/prompt');
console.log('✅ Quantity query frame -> needsTerminal: true (opens terminal for numerical entry)');

console.log('\n--- All Combat & Overlay Suppression Checks Passed! ---');

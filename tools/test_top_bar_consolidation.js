// Contract Unit Test for WS9.2 Top Bar Consolidation (G2, G4)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlPath = path.join(__dirname, '..', 'server', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

console.log('--- Testing WS9.2 Top Bar Consolidation & Footer Deduplication ---');

// Contract 1: Top Bar visible controls
// Top bar must keep: Realm badge (with ping), Language, Log, Map, Sound, Menu
// Must NOT have: Tome, D-Pad, Invert, Controls, Fullscreen
const topRightBarMatch = html.match(/<div id="top-right-bar"[^>]*>([\s\S]*?)<\/div>\s*<!-- 2D Minimap/);
assert(topRightBarMatch, 'Contract 1 Fail: #top-right-bar container not found in index.html');
const topBarContent = topRightBarMatch[1];

assert(/id="btn-hud-realm"/.test(topBarContent), 'Contract 1 Fail: btn-hud-realm must be in top-right-bar');
assert(/id="ping-badge"/.test(topBarContent), 'Contract 1 Fail: ping-badge must be in top-right-bar (inside/with realm badge)');
assert(/id="btn-toggle-msg-feed"/.test(topBarContent), 'Contract 1 Fail: btn-toggle-msg-feed must be in top-right-bar');
assert(/id="btn-toggle-minimap"/.test(topBarContent), 'Contract 1 Fail: btn-toggle-minimap must be in top-right-bar');
assert(/id="sound-control-group"/.test(topBarContent), 'Contract 1 Fail: sound-control-group must be in top-right-bar');
assert(/id="btn-menu"/.test(topBarContent), 'Contract 1 Fail: btn-menu must be in top-right-bar');
assert(/id="btn-toggle-lang"/.test(topBarContent), 'Contract 1 Fail: btn-toggle-lang must be in top-right-bar');

const movedIds = ['btn-toggle-chronicle', 'btn-toggle-dpad', 'btn-toggle-invert', 'btn-controls', 'btn-fullscreen'];
for (const id of movedIds) {
    assert(!new RegExp(`id=["']${id}["']`).test(topBarContent), `Contract 1 Fail: ${id} should no longer be in top-right-bar`);
}
console.log('✓ Contract 1 PASS: Top-right bar consolidated to 6 clean controls (no clutter)');

// Contract 2: Display & Controls section in Pause Modal / Menu Drawer
const pauseModalMatch = html.match(/<div id="pause-modal"[^>]*>([\s\S]*?)<\/div>\s*<!-- Game Guide/);
assert(pauseModalMatch, 'Contract 2 Fail: #pause-modal container not found in index.html');
const pauseModalContent = pauseModalMatch[1];

assert(/Display &amp; Controls|Display & Controls/.test(pauseModalContent), 'Contract 2 Fail: Display & Controls section missing in pause-modal');
for (const id of movedIds) {
    assert(new RegExp(`id=["']${id}["']`).test(pauseModalContent), `Contract 2 Fail: ${id} must be moved into pause-modal`);
}
console.log('✓ Contract 2 PASS: Display & Controls section in Menu drawer contains all 5 moved controls with preserved IDs');

// Contract 3: Footer Deduplication
const footerMatch = html.match(/<div id="hud-footer"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<!-- Compass/);
assert(footerMatch, 'Contract 3 Fail: #hud-footer container not found in index.html');
const footerContent = footerMatch[1];
assert(!/id="btn-quick-help"/.test(footerContent), 'Contract 3 Fail: duplicate btn-quick-help must be removed from hud-footer');
console.log('✓ Contract 3 PASS: Duplicate Controls [?] button removed from footer');

console.log('\nAll WS9.2 HTML Structure Contracts PASSED!');

// tools/test_death_reload_flow.js
// Automated verification for death save protection and save reload flow

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Verify client code contracts
console.log('[Death Reload Test] Verifying client-side death recovery contracts...');

const appJs = fs.readFileSync(path.join(__dirname, '../server/public/js/app.js'), 'utf8');
const hudJs = fs.readFileSync(path.join(__dirname, '../server/public/js/hud.js'), 'utf8');
const inputJs = fs.readFileSync(path.join(__dirname, '../server/public/js/input.js'), 'utf8');
const networkJs = fs.readFileSync(path.join(__dirname, '../server/public/js/network.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '../server/src/server.js'), 'utf8');
const bridgeC = fs.readFileSync(path.join(__dirname, '../engine/src/main-bridge.c'), 'utf8');

// 1. C bridge must guard against saving dead player
assert(bridgeC.includes('(!player || !player->is_dead)'), 'main-bridge.c must verify !player->is_dead before saving');
console.log('  ✓ main-bridge.c prevents writing savefile when player is dead');

// 2. server.js must guard against saving dead session
assert(serverJs.includes('!session.isDead'), 'server.js must check !session.isDead in auto-save and exit handlers');
assert(serverJs.includes('const isDeadHijack = Boolean(candidate.isDead);'), 'server.js must reject reconnect to dead session');
console.log('  ✓ server.js prevents saving dead session and rejects dead session re-attachment');

// 3. hud.js must hide death modal on living frames and wire btn-death-reload to reloadLastSave
assert(hudJs.includes('this.isDeadInPlay = false;') && hudJs.includes('this.hideDeathModal();'), 'hud.js must hide modal when not dead');
assert(hudJs.includes('window.__app.reloadLastSave()'), 'hud.js btn-death-reload must call reloadLastSave');
console.log('  ✓ hud.js properly resets death modal and binds reload button');

// 4. input.js must wire [R] in death modal to reloadLastSave
assert(inputJs.includes('window.__app.reloadLastSave()'), 'input.js [R] key in death modal must call reloadLastSave');
console.log('  ✓ input.js [R] key invokes reloadLastSave');

// 5. network.js must track isDead, avoid sending save when dead, and clean up session ID
assert(networkJs.includes('this.isDead = true;'), 'network.js must detect player death in frame');
assert(networkJs.includes('if (this.isDead)'), 'network.js saveGame must refuse to save when dead');
console.log('  ✓ network.js tracks death and prevents sending save command to dead engine');

// 6. app.js must expose reloadLastSave and protect returnToMainMenu
assert(appJs.includes('async function reloadLastSave()'), 'app.js must implement reloadLastSave');
assert(appJs.includes('reloadLastSave,'), 'app.js must expose reloadLastSave on window.__app');
assert(appJs.includes('const isDead = Boolean(hud && hud.isDeadInPlay)'), 'app.js returnToMainMenu must check isDead');
console.log('  ✓ app.js exposes reloadLastSave and guards returnToMainMenu from saving dead state');

console.log('\n✅ ALL DEATH RELOAD CONTRACTS VERIFIED SUCCESSFULLY!\n');

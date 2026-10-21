/**
 * tools/test_ui_surface_integrity.js
 * 
 * Automated Regression Sentinel: UI Surface & Feature Preservation Validator
 * Asserts 100% presence and integrity of all 126 existing interactive buttons 
 * and 10 core modal containers in server/public/index.html.
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'server', 'public', 'index.html');
if (!fs.existsSync(htmlPath)) {
    console.error(`FAIL: ${htmlPath} does not exist`);
    process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// The 126 Canonical Button IDs that must NEVER be deleted or renamed
const EXPECTED_BUTTON_IDS = [
    // Terminal Toolbar & Zoom
    'btn-term-zoom-out', 'btn-term-zoom-reset', 'btn-term-zoom-in',
    // Character Birth Wizard
    'btn-quick-birth', 'btn-term-reroll', 'btn-term-custom', 'btn-term-advance', 'btn-term-escape', 'btn-term-exit-menu',
    'btn-birth-name-rand', 'btn-birth-name-submit',
    // Message Feed Window
    'btn-msg-size-toggle', 'btn-msg-scroll-top', 'btn-msg-scroll-bottom', 'btn-msg-clear', 'btn-msg-close',
    // Living Chronicle Window
    'btn-chronicle-pin', 'btn-chronicle-expand', 'btn-chronicle-close', 'btn-chronicle-rewind', 'btn-chronicle-play', 'btn-chronicle-stop',
    'btn-chronicle-forward', 'btn-chronicle-mute', 'btn-chronicle-speed', 'btn-chronicle-clear-target',
    'btn-chronicle-mic', 'btn-chronicle-send', 'btn-chronicle-export-json', 'btn-chronicle-export-html', 'btn-chronicle-import',
    // Top-Right Toolbar
    'btn-toggle-chronicle', 'btn-toggle-msg-feed', 'btn-toggle-minimap', 'btn-toggle-dpad', 'btn-toggle-invert',
    'btn-controls', 'btn-sound', 'btn-sound-config', 'btn-fullscreen', 'btn-menu',
    // Audio Popover
    'btn-popover-close', 'btn-popover-mute',
    // Minimap Radar & Camera Tilt
    'btn-minimap-close', 'btn-mobile-map-zoom-in', 'btn-mobile-map-zoom-out',
    'btn-map-zoom-out', 'btn-map-zoom-in', 'btn-map-toggle-size', 'btn-map-recenter', 'btn-map-close-bar',
    'btn-tilt-up', 'btn-tilt-reset', 'btn-tilt-down',
    // Virtual Touch D-Pad & Viewport Edge Turn Chevrons
    'edge-turn-left', 'edge-turn-right',
    'dpad-turn-left', 'dpad-turn-right',
    'dpad-ul', 'dpad-up', 'dpad-ur',
    'dpad-left', 'dpad-center', 'dpad-right',
    'dpad-dl', 'dpad-down', 'dpad-dr',
    // Quick Action Bar
    'btn-attack', 'btn-throw', 'btn-fire', 'btn-cast', 'btn-quaff', 'btn-read', 'btn-door',
    'btn-pickup', 'btn-rest', 'btn-inventory', 'btn-equipment', 'btn-stair', 'btn-terminal',
    'btn-guide-hud', 'btn-action-more',
    // Death Modal
    'btn-death-reload', 'btn-death-reroll', 'btn-death-menu',
    // Splash Screen
    'btn-splash-start', 'btn-splash-demo', 'btn-splash-menu', 'btn-splash-features',
    'btn-splash-guide', 'btn-splash-standalone', 'btn-splash-credits',
    // Main Menu
    'btn-menu-continue', 'btn-menu-load', 'btn-menu-random', 'btn-menu-custom',
    'btn-menu-guide', 'btn-menu-credits', 'btn-menu-wiki', 'btn-menu-pwa', 'btn-menu-demo',
    'btn-save-upload', 'btn-load-back',
    // Pause Menu
    'btn-pause-mute', 'btn-pause-invert', 'btn-pause-resume', 'btn-pause-save', 'btn-pause-download',
    'btn-pause-load', 'btn-pause-random', 'btn-pause-custom', 'btn-pause-guide', 'btn-pause-fullscreen', 'btn-pause-quit',
    // Guide Modal
    'btn-guide-close', 'btn-guide-back',
    // PWA Modal
    'btn-pwa-header-close', 'btn-pwa-install-action', 'btn-pwa-close',
    // Video Theater / Showcase
    'btn-demo-close', 'demo-center-play', 'demo-btn-play', 'demo-btn-replay',
    'demo-btn-mute', 'demo-btn-cc', 'demo-btn-fullscreen', 'demo-btn-play-game',
    // Queue
    'btn-queue-cancel'
];

// The 10 Core Containers / Modals
const EXPECTED_CONTAINER_IDS = [
    'terminal-container',
    'message-feed-window',
    'chronicle-window',
    'top-right-bar',
    'minimap-container',
    'touch-controls',
    'hud-overlay',
    'char-panel',
    'action-bar',
    'hud-footer',
    'compass-container',
    'death-modal',
    'splash-overlay'
];

let failed = 0;

console.log('--- UI SURFACE INTEGRITY AUDIT ---');

// Audit Button IDs
let missingButtons = [];
for (const id of EXPECTED_BUTTON_IDS) {
    const idPattern = new RegExp(`id=["']${id}["']`);
    if (!idPattern.test(html)) {
        missingButtons.push(id);
        failed++;
    }
}

if (missingButtons.length === 0) {
    console.log(`ok    100% Button ID Integrity (${EXPECTED_BUTTON_IDS.length}/${EXPECTED_BUTTON_IDS.length} present)`);
} else {
    console.error(`FAIL  Missing ${missingButtons.length} Button IDs:\n  - ${missingButtons.join('\n  - ')}`);
}

// Audit Container IDs
let missingContainers = [];
for (const id of EXPECTED_CONTAINER_IDS) {
    const idPattern = new RegExp(`id=["']${id}["']`);
    if (!idPattern.test(html)) {
        missingContainers.push(id);
        failed++;
    }
}

if (missingContainers.length === 0) {
    console.log(`ok    100% Modal/Container ID Integrity (${EXPECTED_CONTAINER_IDS.length}/${EXPECTED_CONTAINER_IDS.length} present)`);
} else {
    console.error(`FAIL  Missing ${missingContainers.length} Container IDs:\n  - ${missingContainers.join('\n  - ')}`);
}

console.log('\nAudit Summary: ' + (failed === 0 ? 'ALL PASSED (Zero Omissions)' : `${failed} FAILURES`));
process.exit(failed === 0 ? 0 : 1);

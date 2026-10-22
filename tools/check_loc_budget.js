#!/usr/bin/env node
/**
 * tools/check_loc_budget.js
 *
 * Fast pure-Node gate enforcing the WS42 Bloat-Reduction LOC Budgets (Plan §16.4).
 * Checks the line counts of all unified command and menu surfaces.
 *
 * Enforces budgets:
 *   input.js <= 3500
 *   app.js <= 5100
 *   screen-context.js <= 1050
 *   grimoire-deck.js <= 250
 *   quick-actions.js <= 450
 *   hud.js <= 3180
 *   terminal.js <= 1150
 *   action-catalog.js <= 650
 *   command-dispatcher.js <= 650
 *   prompt-mirror.js <= 350
 *   item-sheet.js <= 400
 *   command-palette.js <= 320
 *   entity-menu.js <= 220
 *   gamepad.js <= 240
 *   radial-menu.js <= 240
 *   dungeon.css <= 9850
 *   index.html <= 1545
 *
 * Usage:
 *   node tools/check_loc_budget.js [--strict]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const isStrict = process.argv.includes('--strict') || process.env.STRICT_BUDGET === '1';

const BUDGETS = [
    { name: 'input.js', file: 'server/public/js/input.js', budget: 3500 },
    { name: 'app.js', file: 'server/public/js/app.js', budget: 5100, pendingArchive: true },
    { name: 'screen-context.js', file: 'server/public/js/screen-context.js', budget: 1050, pendingArchive: true },
    { name: 'grimoire-deck.js', file: 'server/public/js/grimoire-deck.js', budget: 250, pendingArchive: true },
    { name: 'quick-actions.js', file: 'server/public/js/quick-actions.js', budget: 450 },
    { name: 'hud.js', file: 'server/public/js/hud.js', budget: 3180 },
    { name: 'terminal.js', file: 'server/public/js/terminal.js', budget: 1150 },
    { name: 'action-catalog.js', file: 'server/public/js/action-catalog.js', budget: 650, pendingArchive: true },
    { name: 'command-dispatcher.js', file: 'server/public/js/command-dispatcher.js', budget: 650, pendingArchive: true },
    { name: 'prompt-mirror.js', file: 'server/public/js/prompt-mirror.js', budget: 350 },
    { name: 'item-sheet.js', file: 'server/public/js/item-sheet.js', budget: 400 },
    { name: 'command-palette.js', file: 'server/public/js/command-palette.js', budget: 320 },
    { name: 'entity-menu.js', file: 'server/public/js/entity-menu.js', budget: 220 },
    { name: 'gamepad.js', file: 'server/public/js/gamepad.js', budget: 240 },
    { name: 'radial-menu.js', file: 'server/public/js/radial-menu.js', budget: 240 },
    { name: 'dungeon.css', file: 'server/public/css/dungeon.css', budget: 9850 },
    { name: 'index.html', file: 'server/public/index.html', budget: 1545 }
];

console.log('=== Bloat-Reduction Budget Gate (§16.4) ===\n');

// Detect if WS42.6 legacy archive is pending
const ws426Pending = fs.existsSync(path.join(ROOT_DIR, 'server/public/js/menu-router.js'));

let hardFailures = 0;
let pendingCount = 0;
let passCount = 0;

console.log('FILE'.padEnd(24) + 'ACTUAL'.padStart(8) + 'BUDGET'.padStart(8) + '   STATUS');
console.log('-'.repeat(54));

for (const item of BUDGETS) {
    const fullPath = path.join(ROOT_DIR, item.file);
    if (!fs.existsSync(fullPath)) {
        console.log(`${item.name.padEnd(24)} MISSING ${String(item.budget).padStart(8)}   FAIL (file not found)`);
        hardFailures++;
        continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const actual = content.split(/\r?\n/).length;
    const ok = actual <= item.budget;

    if (ok) {
        passCount++;
        console.log(`${item.name.padEnd(24)}${String(actual).padStart(8)}${String(item.budget).padStart(8)}   PASS`);
    } else if (item.pendingArchive && ws426Pending && !isStrict) {
        pendingCount++;
        console.log(`${item.name.padEnd(24)}${String(actual).padStart(8)}${String(item.budget).padStart(8)}   PENDING (WS42.6 archive)`);
    } else {
        hardFailures++;
        console.log(`${item.name.padEnd(24)}${String(actual).padStart(8)}${String(item.budget).padStart(8)}   FAIL (+${actual - item.budget} lines)`);
    }
}

console.log('-'.repeat(54));
console.log(`Summary: ${passCount} within budget, ${pendingCount} pending WS42.6 archive, ${hardFailures} exceeded budget.\n`);

if (hardFailures > 0) {
    console.error(`FAILED: ${hardFailures} file(s) exceeded bloat-reduction LOC budget.`);
    process.exit(1);
}

if (pendingCount > 0) {
    console.log(`NOTE: ${pendingCount} files exceed target budget pending WS42.6 legacy surface archive.`);
}

console.log('check_loc_budget.js: PASS\n');
process.exit(0);

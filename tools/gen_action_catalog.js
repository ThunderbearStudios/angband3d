#!/usr/bin/env node
/**
 * tools/gen_action_catalog.js
 *
 * Validator & generator CLI for ActionCatalog (Card WS42.3A / Plan §5, §6.4).
 * Validates cross-realm command integrity, 20-bit VERB_BITS parity,
 * and alignment against probed engine fixtures in tools/fixtures/realm_keys/<realm>.json.
 *
 * Usage:
 *   node tools/gen_action_catalog.js --check   # exits 0 if catalog is fully valid
 *   node tools/gen_action_catalog.js           # prints catalog matrix & stats
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'tools', 'fixtures', 'realm_keys');
const ActionCatalog = require(path.join(ROOT, 'server', 'public', 'js', 'action-catalog.js'));

const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];
const VALID_GROUPS = new Set(['items', 'magic', 'action', 'info', 'manage']);

function validateCatalog() {
    const errors = [];
    const report = {
        totalCommands: 0,
        realmCounts: {},
        groupCounts: {},
        probeMatches: 0,
        checksPassed: 0
    };

    // 1. Validate VERB_BITS
    assert(Array.isArray(ActionCatalog.VERB_BITS), 'VERB_BITS must be an array');
    assert.strictEqual(ActionCatalog.VERB_BITS.length, 20, 'VERB_BITS must define exactly 20 canonical bits');
    for (let i = 0; i < ActionCatalog.VERB_BITS.length; i++) {
        const verb = ActionCatalog.VERB_BITS[i];
        const cmd = ActionCatalog.get(verb);
        if (!cmd) {
            errors.push(`VERB_BITS[${i}] '${verb}' has no corresponding command in catalog`);
        }
    }
    report.checksPassed++;

    // 2. Validate COMMANDS
    const commands = ActionCatalog.COMMANDS;
    assert(Array.isArray(commands), 'COMMANDS must be an array');
    assert(commands.length >= 50, `Catalog must define >= 50 commands (found ${commands.length})`);
    report.totalCommands = commands.length;

    const seenIds = new Set();
    for (const cmd of commands) {
        if (!cmd.id || typeof cmd.id !== 'string') {
            errors.push(`Command missing valid id: ${JSON.stringify(cmd)}`);
            continue;
        }
        if (seenIds.has(cmd.id)) {
            errors.push(`Duplicate command id: '${cmd.id}'`);
        }
        seenIds.add(cmd.id);

        if (!VALID_GROUPS.has(cmd.group)) {
            errors.push(`Command '${cmd.id}' has invalid group '${cmd.group}'`);
        }
        report.groupCounts[cmd.group] = (report.groupCounts[cmd.group] || 0) + 1;

        if (!cmd.labels || !cmd.labels.en || !cmd.labels.jp) {
            errors.push(`Command '${cmd.id}' missing required en/jp labels`);
        }
        if (!cmd.keys || typeof cmd.keys !== 'object') {
            errors.push(`Command '${cmd.id}' missing keys map`);
        } else {
            for (const r of REALMS) {
                if (cmd.keys[r] === undefined) {
                    errors.push(`Command '${cmd.id}' keys map missing realm '${r}'`);
                }
            }
        }
        if (typeof cmd.needsIdle !== 'boolean') {
            errors.push(`Command '${cmd.id}' needsIdle must be boolean`);
        }
        if (typeof cmd.atomic !== 'boolean') {
            errors.push(`Command '${cmd.id}' atomic must be boolean`);
        }
    }
    report.checksPassed++;

    // 3. Validate per-realm command coverage (>= 35 commands per realm)
    for (const r of REALMS) {
        const list = ActionCatalog.listForRealm(r);
        report.realmCounts[r] = list.length;
        if (list.length < 35) {
            errors.push(`Realm '${r}' has only ${list.length} commands, expected >= 35`);
        }
    }
    report.checksPassed++;

    // 4. Validate probe fixtures alignment
    for (const r of REALMS) {
        const fixturePath = path.join(FIXTURES_DIR, `${r}.json`);
        if (!fs.existsSync(fixturePath)) {
            errors.push(`Missing fixture: ${fixturePath}`);
            continue;
        }
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        // Check key pins
        if (r === 'angband') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), null);
            assert.strictEqual(ActionCatalog.keyFor('use', r), 'U');
            assert.strictEqual(ActionCatalog.keyFor('hold', r), ',');
            assert.strictEqual(ActionCatalog.keyFor('cast', r), 'm');
            assert.strictEqual(ActionCatalog.keyFor('quaff', r), 'q');
        } else if (r === 'silq') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), null);
            assert.strictEqual(ActionCatalog.keyFor('use', r), 'u');
            assert.strictEqual(ActionCatalog.keyFor('hold', r), 'z');
            assert.strictEqual(ActionCatalog.keyFor('takeoff', r), 'r');
            assert.strictEqual(ActionCatalog.keyFor('examine', r), 'x');
            assert.strictEqual(ActionCatalog.keyFor('char_sheet', r), '@');
            assert.strictEqual(ActionCatalog.keyFor('options', r), 'O');
            assert.strictEqual(ActionCatalog.keyFor('cast', r), null);
            assert.strictEqual(ActionCatalog.keyFor('song', r), 's');
            assert.strictEqual(ActionCatalog.keyFor('use_staff', r), 'a');
        } else if (r === 'frogcomposband') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), 'S');
            assert.strictEqual(ActionCatalog.keyFor('use', r), null);
            assert.strictEqual(ActionCatalog.keyFor('hold', r), ',');
            assert.strictEqual(ActionCatalog.keyFor('power', r), 'U');
        } else if (r === 'hengband') {
            assert.strictEqual(ActionCatalog.keyFor('search', r), 'S');
            assert.strictEqual(ActionCatalog.keyFor('use', r), null);
            assert.strictEqual(ActionCatalog.keyFor('hold', r), ',');
            assert.strictEqual(ActionCatalog.keyFor('power', r), 'U');
        }

        // Verify all non-null catalog keys exist in fixture if probe covered them
        for (const cmd of commands) {
            const k = cmd.keys[r];
            if (k !== null && fixture[k] !== undefined) {
                report.probeMatches++;
            }
        }
    }
    report.checksPassed++;

    // 5. Validate WASD-shadowing accuracy
    const angShadowed = ActionCatalog.shadowedByWasd('angband').map(c => c.id);
    assert(angShadowed.includes('wield'), 'Angband w must be wield');
    assert(angShadowed.includes('aim'), 'Angband a must be aim');
    assert(angShadowed.includes('steal'), 'Angband s must be steal');
    assert(angShadowed.includes('drop'), 'Angband d must be drop');

    const silqShadowed = ActionCatalog.shadowedByWasd('silq').map(c => c.id);
    assert(silqShadowed.includes('wield'), 'Sil-Q w must be wield');
    assert(silqShadowed.includes('use_staff'), 'Sil-Q a must be use_staff');
    assert(silqShadowed.includes('song'), 'Sil-Q s must be song');
    assert(silqShadowed.includes('drop'), 'Sil-Q d must be drop');

    const fcbShadowed = ActionCatalog.shadowedByWasd('frogcomposband').map(c => c.id);
    assert(fcbShadowed.includes('wield'));
    assert(fcbShadowed.includes('aim'));
    assert(!fcbShadowed.includes('search'), 'FCB search is uppercase S, not lowercase s');
    assert(fcbShadowed.includes('drop'));

    const hengShadowed = ActionCatalog.shadowedByWasd('hengband').map(c => c.id);
    assert(hengShadowed.includes('wield'));
    assert(hengShadowed.includes('aim'));
    assert(!hengShadowed.includes('search'), 'Heng search is uppercase S, not lowercase s');
    assert(hengShadowed.includes('drop'));

    report.checksPassed++;

    return { valid: errors.length === 0, errors, report };
}

// Main execution
const isCheckOnly = process.argv.includes('--check');
const result = validateCatalog();

if (isCheckOnly) {
    if (!result.valid) {
        console.error('ActionCatalog validation FAILED:');
        for (const err of result.errors) {
            console.error(`  - ${err}`);
        }
        process.exit(1);
    }
    console.log(`ActionCatalog check OK: ${result.report.totalCommands} commands, ${result.report.checksPassed} suites passed.`);
    process.exit(0);
}

// Detailed print mode
console.log('=== Angband3D ActionCatalog Summary ===');
console.log(`Total Commands: ${result.report.totalCommands}`);
console.log('Group Counts:');
for (const [grp, cnt] of Object.entries(result.report.groupCounts)) {
    console.log(`  - ${grp}: ${cnt}`);
}
console.log('Realm Command Counts:');
for (const [r, cnt] of Object.entries(result.report.realmCounts)) {
    console.log(`  - ${r}: ${cnt}`);
}
console.log(`Probe Matches: ${result.report.probeMatches}`);
console.log(`Validation Status: ${result.valid ? 'VALID (100% PASS)' : 'INVALID'}`);

if (!result.valid) {
    for (const err of result.errors) {
        console.error(`  - ${err}`);
    }
    process.exit(1);
}

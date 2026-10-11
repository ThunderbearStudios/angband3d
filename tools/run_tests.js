#!/usr/bin/env node
// Minimal test runner (WS0.4). Runs tools/test_manifest.json tiers sequentially with `node`.
// Usage: node tools/run_tests.js [--tier fast|e2e|cdp|cloud|legacy|all]
// A test that prints "SKIP:" as its first stdout line and exits 0 counts as SKIP.
// Exit code 1 if any FAIL. No dependencies beyond Node built-ins.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(TOOLS, 'test_manifest.json'), 'utf8'));
const argIdx = process.argv.indexOf('--tier');
const tier = argIdx !== -1 ? process.argv[argIdx + 1] : 'fast';
const tiers = tier === 'all' ? ['fast', 'e2e', 'cdp'] : [tier];
const TIMEOUT_MS = 180000;

const rows = [];
for (const t of tiers) {
    for (const file of manifest[t] || []) {
        const started = Date.now();
        const r = spawnSync(process.execPath, [path.join(TOOLS, file)], {
            cwd: path.join(TOOLS, '..'), encoding: 'utf8', timeout: TIMEOUT_MS, env: process.env,
        });
        const firstLine = (r.stdout || '').split(/\r?\n/)[0] || '';
        let status = r.status === 0 ? 'PASS' : 'FAIL';
        if (r.status === 0 && firstLine.startsWith('SKIP:')) status = 'SKIP';
        if (r.error && r.error.code === 'ETIMEDOUT') status = 'FAIL';
        rows.push({ tier: t, file, status, secs: ((Date.now() - started) / 1000).toFixed(1) });
        if (status === 'FAIL') {
            // Tail of output only: keep logs short for low-context agents.
            const tail = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).slice(-15).join('\n');
            console.log(`--- ${file} (FAIL) ---\n${tail}\n`);
        }
    }
}
console.log('\nTIER    STATUS  SECS   FILE');
for (const r of rows) console.log(`${r.tier.padEnd(7)} ${r.status.padEnd(7)} ${r.secs.padStart(5)}  ${r.file}`);
const fails = rows.filter(r => r.status === 'FAIL').length;
console.log(`\n${rows.length} run, ${fails} failed`);
process.exit(fails ? 1 : 0);

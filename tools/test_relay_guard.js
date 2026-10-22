#!/usr/bin/env node
// Fast static gate for WS1.1/WS1.2 (no server spawn).
// 1) server.js parses (node --check)            -> guards E1-class hot-path errors (L9)
// 2) no `const line = lineBuffer` regression     -> E1
// 3) ENGINE_VERBS covers every verb the client sends via sendKey/sendCommand -> L1 ('save' near-miss)
// 4) sanitizeEngineCommand key-spec canonicalization & relay guard -> WS42.1A (CMD-P0-01)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server', 'src', 'server.js');
const fails = [];

const chk = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' });
if (chk.status !== 0) fails.push('node --check server.js failed:\n' + chk.stderr);

const src = fs.readFileSync(serverPath, 'utf8');
if (/const line = lineBuffer/.test(src)) fails.push('E1 regression: `const line = lineBuffer` is reassigned later');

const m = src.match(/ENGINE_VERBS\s*=\s*new Set\(\[([^\]]*)\]\)/);
if (!m) fails.push('ENGINE_VERBS allowlist missing from server.js');
const allowed = new Set(m ? [...m[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]) : []);

// Collect verbs used by client senders.
const jsDir = path.join(root, 'server', 'public', 'js');
const used = new Set(['key']); // network.sendKey always sends `key <spec>`
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!e.name.endsWith('.js')) return;
    const text = fs.readFileSync(p, 'utf8');
    for (const mm of text.matchAll(/sendCommand\(\s*[`'"]([a-z]+)/g)) used.add(mm[1]);
});
walk(jsDir);
for (const v of used) if (!allowed.has(v)) fails.push(`client sends verb "${v}" but ENGINE_VERBS lacks it`);

// 4) sanitizeEngineCommand key-spec canonicalization and relay guard (WS42.1A / CMD-P0-01)
const fnMatch = src.match(/(const CANONICAL_KEY_MAP = \{[\s\S]*?\n    const sanitizeEngineCommand = \([\s\S]*?\n    \};)/);
if (!fnMatch) {
    fails.push('sanitizeEngineCommand or CANONICAL_KEY_MAP missing from server.js');
} else {
    const sandbox = { ENGINE_VERBS: allowed };
    vm.createContext(sandbox);
    try {
        const sanitize = vm.runInContext(fnMatch[1] + '\n; sanitizeEngineCommand;', sandbox);
        if (typeof sanitize !== 'function') {
            fails.push('sanitizeEngineCommand failed to evaluate in test_relay_guard sandbox');
        } else {
            const assertCmd = (input, expected, label) => {
                const actual = sanitize(input);
                if (actual !== expected) {
                    fails.push(`sanitizeEngineCommand(${label || JSON.stringify(input)}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            };

            assertCmd('key Escape', 'key escape');
            assertCmd('key ArrowRight', 'key right');
            assertCmd('key  ', 'key space', "'key ' + ' '");
            assertCmd('key \t', 'key tab', "'key \\t'");
            assertCmd('key Foo', null);

            // Extended edge cases
            assertCmd('key \n', 'key enter', "'key \\n'");
            assertCmd('key \r', 'key enter', "'key \\r'");
            assertCmd('key C-p', 'key C-p');
            assertCmd('key c-p', 'key C-p');
            assertCmd('key C-Foo', null);
            assertCmd('key', null);
            assertCmd('keys .5', 'keys .5');
        }
    } catch (err) {
        fails.push('Error running sanitizeEngineCommand in sandbox: ' + err.message);
    }
}

if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
console.log(`PASS relay guard: allowed=[${[...allowed]}] used=[${[...used]}] + sanitizeEngineCommand verified`);

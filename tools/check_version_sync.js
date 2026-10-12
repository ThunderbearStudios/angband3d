#!/usr/bin/env node
'use strict';

/**
 * Fast-tier test: verify that version strings across server/public/ are in sync.
 * (WS5.4: Single version source)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.join(__dirname, '..');
const versionJsonPath = path.join(rootDir, 'server/public/version.json');
const swJsPath = path.join(rootDir, 'server/public/sw.js');
const indexHtmlPath = path.join(rootDir, 'server/public/index.html');

console.log('Testing version sync across assets...');

// 1. Read canonical version from version.json
assert(fs.existsSync(versionJsonPath), 'server/public/version.json must exist');
const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
const canonical = versionData.v;
assert(typeof canonical === 'string' && canonical.length > 0, 'Canonical version must be non-empty string');
console.log(`  Canonical version (version.json): ${canonical}`);

// 2. Check sw.js CACHE_NAME
assert(fs.existsSync(swJsPath), 'server/public/sw.js must exist');
const swContent = fs.readFileSync(swJsPath, 'utf8');
const swMatch = swContent.match(/CACHE_NAME\s*=\s*['"]angband3d-v([^'"]+)['"]/);
assert(swMatch, 'sw.js must declare CACHE_NAME');
assert.strictEqual(swMatch[1], canonical, `sw.js CACHE_NAME (${swMatch[1]}) must match canonical (${canonical})`);
console.log(`  sw.js CACHE_NAME matches: angband3d-v${canonical}`);

// 3. Check index.html asset references
assert(fs.existsSync(indexHtmlPath), 'server/public/index.html must exist');
const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const vRegex = /\?v=([0-9a-zA-Z.-]+)/g;
let match;
let matchCount = 0;
while ((match = vRegex.exec(htmlContent)) !== null) {
    matchCount++;
    assert.strictEqual(
        match[1],
        canonical,
        `index.html query param ?v=${match[1]} must match canonical ?v=${canonical}`
    );
}
assert(matchCount > 0, 'index.html must contain versioned asset queries');
console.log(`  index.html asset references match: ${matchCount} tags verified at ?v=${canonical}`);

console.log('✓ All asset versions are in sync!');
process.exit(0);

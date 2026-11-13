#!/usr/bin/env node
'use strict';

/**
 * Fast-tier test: verify that version strings across all clients & packages are in sync.
 * (WS5.4 / WS22: Single canonical version source across Web, SW, Android, Desktop C#, Godot C#, and Server)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.join(__dirname, '..');
const versionJsonPath = path.join(rootDir, 'server/public/version.json');
const swJsPath = path.join(rootDir, 'server/public/sw.js');
const indexHtmlPath = path.join(rootDir, 'server/public/index.html');

console.log('Testing version sync across all clients and assets...');

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

// 4. Check root package.json and server/package.json
for (const relPkg of ['package.json', 'server/package.json']) {
    const pkgPath = path.join(rootDir, relPkg);
    if (fs.existsSync(pkgPath)) {
        const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        assert.strictEqual(pkgData.version, canonical, `${relPkg} version (${pkgData.version}) must match canonical (${canonical})`);
        console.log(`  ${relPkg} matches: version "${canonical}"`);
    }
}

// 5. Check engine-manifest.json top-level version
const engineManifestPath = path.join(rootDir, 'engine-manifest.json');
assert(fs.existsSync(engineManifestPath), 'engine-manifest.json must exist');
const engineManifest = JSON.parse(fs.readFileSync(engineManifestPath, 'utf8'));
assert.strictEqual(
    engineManifest.version,
    canonical,
    `engine-manifest.json version (${engineManifest.version}) must match canonical (${canonical})`
);
console.log(`  engine-manifest.json matches: version "${canonical}"`);

console.log('✓ All client & package versions are in sync!');
process.exit(0);

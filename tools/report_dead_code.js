#!/usr/bin/env node
'use strict';

/**
 * WS5.5: Dead-code sweep tool.
 * Scans app.js, input.js, and hud.js for functions with zero external or internal references
 * across server/public/js/** and server/public/index.html.
 * REPORT ONLY - does not modify or delete source code.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const jsDir = path.join(rootDir, 'server/public/js');
const indexHtmlPath = path.join(rootDir, 'server/public/index.html');
const reportsDir = path.join(__dirname, 'reports');

if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

const targetFiles = ['app.js', 'input.js', 'hud.js'];

// Read all JS source files and HTML into memory for reference counting
const allSources = {};
function readDirRecursive(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            readDirRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            allSources[fullPath] = fs.readFileSync(fullPath, 'utf8');
        }
    }
}
readDirRecursive(jsDir);
if (fs.existsSync(indexHtmlPath)) {
    allSources[indexHtmlPath] = fs.readFileSync(indexHtmlPath, 'utf8');
}

// Combine all sources for global reference searching
const allCodeCombined = Object.values(allSources).join('\n');

const STANDARD_IGNORES = new Set([
    'constructor', 'init', 'update', 'render', 'draw', 'reset', 'clear',
    'destroy', 'dispose', 'onFrame', 'handleEvent', 'connect', 'disconnect',
    'send', 'sendKey', 'format', 'toString', 'valueOf', 'toJSON', 'resolve', 'reject'
]);

const reportResults = [];

for (const tf of targetFiles) {
    const filePath = path.join(jsDir, tf);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract function declarations: function name(...)
    const fnRegex = /\bfunction\s+([a-zA-Z0-9_$]+)\s*\(/g;
    let match;
    const candidates = new Set();
    while ((match = fnRegex.exec(content)) !== null) {
        const name = match[1];
        if (!STANDARD_IGNORES.has(name) && name.length > 2) {
            candidates.add(name);
        }
    }

    // Extract const/let/var fn = function or arrow
    const varFnRegex = /\b(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g;
    while ((match = varFnRegex.exec(content)) !== null) {
        const name = match[1];
        if (!STANDARD_IGNORES.has(name) && name.length > 2) {
            candidates.add(name);
        }
    }

    // For each candidate, count occurrences across the entire codebase
    const deadOrSingleUse = [];
    for (const name of candidates) {
        // Escaped word boundary regex
        const refRegex = new RegExp(`\\b${name}\\b`, 'g');
        const matches = allCodeCombined.match(refRegex) || [];
        const count = matches.length;

        // If count === 1, it only appears where it was declared!
        if (count === 1) {
            // Check if attached to window or exported
            const isWindowExport = new RegExp(`window\\.${name}\\b`).test(allCodeCombined) ||
                                  new RegExp(`window\\.__${name}\\b`).test(allCodeCombined);
            if (!isWindowExport) {
                deadOrSingleUse.push({ name, count });
            }
        }
    }

    reportResults.push({ file: tf, candidatesCount: candidates.size, unreferenced: deadOrSingleUse });
}

// Generate report
const reportLines = [
    '# Dead Code Sweep Report (WS5.5)',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> **Note:** This report identifies declared functions with zero references outside their declaration site.',
    '> Per executor rules, no code is deleted without explicit review and approval.',
    ''
];

let totalUnreferenced = 0;
for (const res of reportResults) {
    reportLines.push(`## ${res.file}`);
    reportLines.push(`- Scanned function candidates: ${res.candidatesCount}`);
    reportLines.push(`- Unreferenced functions: ${res.unreferenced.length}`);
    reportLines.push('');
    if (res.unreferenced.length > 0) {
        reportLines.push('| Function Name | Ref Count | Status |');
        reportLines.push('|---|---|---|');
        for (const item of res.unreferenced) {
            reportLines.push(`| \`${item.name}\` | ${item.count} | Candidate for removal / audit |`);
            totalUnreferenced++;
        }
    } else {
        reportLines.push('*No unreferenced functions found.*');
    }
    reportLines.push('');
}

const reportPath = path.join(reportsDir, 'dead_code.md');
fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
console.log(`[WS5.5] Dead code sweep complete. Found ${totalUnreferenced} unreferenced candidates.`);
console.log(`[WS5.5] Report written to ${reportPath}`);

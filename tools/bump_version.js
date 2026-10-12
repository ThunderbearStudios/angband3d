#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
    console.error("Usage: node tools/bump_version.js <newVersion>");
    process.exit(1);
}

const rootDir = path.join(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'server/public/index.html');
const swJsPath = path.join(rootDir, 'server/public/sw.js');
const versionJsonPath = path.join(rootDir, 'server/public/version.json');

// 1. Rewrite ?v=... in index.html
if (fs.existsSync(indexHtmlPath)) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    indexHtml = indexHtml.replace(/\?v=[0-9a-zA-Z.-]+/g, `?v=${newVersion}`);
    fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
    console.log(`Updated ${indexHtmlPath} -> ?v=${newVersion}`);
}

// 2. Rewrite CACHE_NAME in sw.js
if (fs.existsSync(swJsPath)) {
    let swJs = fs.readFileSync(swJsPath, 'utf8');
    swJs = swJs.replace(/(const|let|var)\s+CACHE_NAME\s*=\s*['"]angband3d-v[^'"]+['"]/g, `$1 CACHE_NAME = 'angband3d-v${newVersion}'`);
    fs.writeFileSync(swJsPath, swJs, 'utf8');
    console.log(`Updated ${swJsPath} -> angband3d-v${newVersion}`);
}

// 3. Write version.json if present or update it
fs.writeFileSync(versionJsonPath, JSON.stringify({ v: newVersion }, null, 2) + '\n', 'utf8');
console.log(`Updated ${versionJsonPath} -> { v: "${newVersion}" }`);

// 4. Update android/app/build.gradle if present
const gradlePath = path.join(rootDir, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${newVersion}"`);
    const parts = newVersion.split('.').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
        const code = parts[0] * 10000 + parts[1] * 100 + parts[2];
        gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`);
    }
    fs.writeFileSync(gradlePath, gradle, 'utf8');
    console.log(`Updated ${gradlePath} -> versionName "${newVersion}"`);
}

console.log(`Version bump to ${newVersion} complete.`);

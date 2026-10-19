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

// 5. Update desktop/Angband3D.csproj and client/angband3d.csproj
const csprojPaths = [
    path.join(rootDir, 'desktop/Angband3D.csproj'),
    path.join(rootDir, 'client/angband3d.csproj')
];
const fourPartVersion = newVersion.split('.').length === 3 ? `${newVersion}.0` : newVersion;
for (const csprojPath of csprojPaths) {
    if (fs.existsSync(csprojPath)) {
        let csproj = fs.readFileSync(csprojPath, 'utf8');
        csproj = csproj.replace(/<Version>[^<]+<\/Version>/, `<Version>${newVersion}</Version>`);
        csproj = csproj.replace(/<FileVersion>[^<]+<\/FileVersion>/, `<FileVersion>${fourPartVersion}</FileVersion>`);
        csproj = csproj.replace(/<AssemblyVersion>[^<]+<\/AssemblyVersion>/, `<AssemblyVersion>${fourPartVersion}</AssemblyVersion>`);
        fs.writeFileSync(csprojPath, csproj, 'utf8');
        console.log(`Updated ${csprojPath} -> Version ${newVersion}`);
    }
}

// 6. Update root package.json, server/package.json, and lockfiles
const pkgPaths = [
    path.join(rootDir, 'package.json'),
    path.join(rootDir, 'server/package.json'),
    path.join(rootDir, 'package-lock.json'),
    path.join(rootDir, 'server/package-lock.json')
];
for (const pkgPath of pkgPaths) {
    if (fs.existsSync(pkgPath)) {
        const pkgContent = fs.readFileSync(pkgPath, 'utf8');
        const updatedPkg = pkgContent.replace(
            /(^\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")[^"]+("[\s\S]*?"packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")[^"]+(")/,
            `$1${newVersion}$2${newVersion}$3`
        ).replace(/^(\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")[^"]+(")/, `$1${newVersion}$2`);
        fs.writeFileSync(pkgPath, updatedPkg, 'utf8');
        console.log(`Updated ${pkgPath} -> version "${newVersion}"`);
    }
}

console.log(`Version bump to ${newVersion} complete across all clients and packages.`);

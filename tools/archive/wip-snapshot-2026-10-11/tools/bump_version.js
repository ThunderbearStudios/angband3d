const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
    console.error("Usage: node bump_version.js <newVersion>");
    process.exit(1);
}

const rootDir = path.join(__dirname, '..');
const versionJsonPath = path.join(rootDir, 'server/public/version.json');
const indexHtmlPath = path.join(rootDir, 'server/public/index.html');
const swJsPath = path.join(rootDir, 'server/public/sw.js');
const serverJsPath = path.join(rootDir, 'server/src/server.js'); // Assuming there's a header comment in server.js, though not explicitly asked, we'll check.

// 1. Write version.json
fs.writeFileSync(versionJsonPath, JSON.stringify({ v: newVersion }, null, 2) + '\n');
console.log(`Updated ${versionJsonPath}`);

// 2. Rewrite every ?v=... in index.html
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
indexHtml = indexHtml.replace(/\?v=[0-9a-zA-Z.-]+/g, `?v=${newVersion}`);
fs.writeFileSync(indexHtmlPath, indexHtml);
console.log(`Updated ${indexHtmlPath}`);

// 3. Rewrite CACHE_NAME in sw.js
if (fs.existsSync(swJsPath)) {
    let swJs = fs.readFileSync(swJsPath, 'utf8');
    // Looking for CACHE_NAME = 'angband3d-vX.Y.Z';
    swJs = swJs.replace(/(const|let|var)\s+CACHE_NAME\s*=\s*['"]angband3d-v[^'"]+['"]/g, `$1 CACHE_NAME = 'angband3d-v${newVersion}'`);
    fs.writeFileSync(swJsPath, swJs);
    console.log(`Updated ${swJsPath}`);
} else {
    console.warn(`Could not find ${swJsPath}`);
}

// 4. Update the header comment if it exists, wait, which file's header comment?
// Let's update index.html's header comment if one exists, or app.js if it exists.
const appJsPath = path.join(rootDir, 'server/public/js/app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');
if (appJs.includes('// Version:')) {
    appJs = appJs.replace(/\/\/ Version: [0-9a-zA-Z.-]+/g, `// Version: ${newVersion}`);
    fs.writeFileSync(appJsPath, appJs);
    console.log(`Updated header comment in ${appJsPath}`);
}

console.log("Version bump complete.");

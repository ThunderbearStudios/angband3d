const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const versionJsonPath = path.join(rootDir, 'server/public/version.json');
const indexHtmlPath = path.join(rootDir, 'server/public/index.html');
const swJsPath = path.join(rootDir, 'server/public/sw.js');

try {
    const vJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    const version = vJson.v;

    // Check index.html
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const indexVersionMatches = [...indexHtml.matchAll(/\?v=([0-9a-zA-Z.-]+)/g)];
    for (const match of indexVersionMatches) {
        if (match[1] !== version) {
            console.error(`Version mismatch in index.html: found ${match[1]}, expected ${version}`);
            process.exit(1);
        }
    }

    // Check sw.js
    if (fs.existsSync(swJsPath)) {
        const swJs = fs.readFileSync(swJsPath, 'utf8');
        const swMatch = swJs.match(/(const|let|var)\s+CACHE_NAME\s*=\s*['"]angband3d-v([^'"]+)['"]/);
        if (swMatch && swMatch[2] !== version) {
            console.error(`Version mismatch in sw.js: found ${swMatch[2]}, expected ${version}`);
            process.exit(1);
        }
    }

    console.log(`Version sync check passed (version ${version})`);
} catch (e) {
    console.error("Error during version sync check", e);
    process.exit(1);
}

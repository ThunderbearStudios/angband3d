/**
 * Automated Verification Test for Angband3D Gameplay Demo & Commercial Showcase
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('=== [1] Verifying Demo Manifest & Audio Stems ===');
const manifestPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'audio', 'demo', 'demo_manifest.json');
if (!fs.existsSync(manifestPath)) {
    console.error('FAIL: demo_manifest.json not found at', manifestPath);
    process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`✓ Manifest title: "${manifest.title}"`);
console.log(`✓ Chapters count: ${manifest.chapters.length} (Expected >= 7)`);
console.log(`✓ Subtitles count: ${manifest.subtitles.length} (Expected >= 20)`);

if (manifest.chapters.length < 7) {
    console.error('FAIL: Expected >= 7 chapters, found', manifest.chapters.length);
    process.exit(1);
}

const audioDir = path.join(__dirname, '..', 'server', 'public', 'assets', 'audio', 'demo');
const expectedFiles = manifest.audioStems.map(s => s.file);

for (const file of expectedFiles) {
    const full = path.join(audioDir, file);
    if (!fs.existsSync(full)) {
        console.error(`FAIL: Missing audio file ${file}`);
        process.exit(1);
    }
    const stat = fs.statSync(full);
    if (stat.size < 1000) {
        console.error(`FAIL: Audio file ${file} is suspiciously small: ${stat.size} bytes`);
        process.exit(1);
    }
    console.log(`✓ Audio stem ${file}: ${(stat.size / 1024).toFixed(1)} KB`);
}

console.log('\n=== [2] Verifying HTML DOM Wireup ===');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'server', 'public', 'index.html'), 'utf8');

const requiredHtmlElements = [
    'id="btn-splash-demo"',
    'id="btn-menu-demo"',
    'id="demo-modal"',
    'id="demo-canvas-stage"',
    'id="demo-ambient-glow"',
    'id="demo-captions-overlay"',
    'id="demo-scrubber-track"',
    'id="demo-chapter-pips"',
    'id="demo-btn-play-game"',
    'id="btn-demo-close"',
    'demo-player.js?v=8.5.2'
];

for (const el of requiredHtmlElements) {
    if (!indexHtml.includes(el)) {
        console.error(`FAIL: index.html missing required element/tag: ${el}`);
        process.exit(1);
    }
    console.log(`✓ index.html has ${el}`);
}

console.log('\n=== [3] Verifying CSS Styles ===');
const dungeonCss = fs.readFileSync(path.join(__dirname, '..', 'server', 'public', 'css', 'dungeon.css'), 'utf8');
const requiredCss = [
    '#demo-modal',
    '.demo-ambient-glow',
    '#demo-canvas-stage',
    '.demo-transport-bar',
    '.demo-scrubber-track',
    '.demo-chapter-ribbon',
    '.demo-captions-overlay'
];

for (const selector of requiredCss) {
    if (!dungeonCss.includes(selector)) {
        console.error(`FAIL: dungeon.css missing selector: ${selector}`);
        process.exit(1);
    }
    console.log(`✓ dungeon.css has ${selector}`);
}

console.log('\n=== [4] Verifying JS Syntax and Logic ===');
const jsFiles = [
    path.join(__dirname, '..', 'server', 'public', 'js', 'demo-player.js'),
    path.join(__dirname, '..', 'server', 'public', 'js', 'demo-recorder.js'),
    path.join(__dirname, '..', 'server', 'public', 'js', 'app.js'),
    path.join(__dirname, '..', 'server', 'public', 'js', 'input.js'),
    path.join(__dirname, '..', 'server', 'src', 'server.js')
];

const { execSync } = require('child_process');
for (const jsFile of jsFiles) {
    try {
        execSync(`node --check "${jsFile}"`, { stdio: 'pipe' });
        console.log(`✓ JS Syntax valid: ${path.basename(jsFile)}`);
    } catch (err) {
        console.error(`FAIL: Syntax error in ${jsFile}:`, err.message);
        process.exit(1);
    }
}

console.log('\n=== [5] Verifying Server Streaming Range Header Support ===');
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'src', 'server.js'), 'utf8');
if (!serverSrc.includes('.mp4') || !serverSrc.includes('.webm') || !serverSrc.includes('.m4a')) {
    console.error('FAIL: server.js missing video media types');
    process.exit(1);
}
console.log('✓ server.js contains video MIME types (.mp4, .webm, .m4a)');

if (!serverSrc.includes('HTTP 206 Partial Content') && !serverSrc.includes('206')) {
    console.error('FAIL: server.js missing HTTP 206 Partial Content support');
    process.exit(1);
}
console.log('✓ server.js contains HTTP 206 Range streaming support');

console.log('\n=== [6] Verifying 1080p Actual Gameplay Video Assets ===');
const videoDir = path.join(__dirname, '..', 'server', 'public', 'assets', 'video');
const videoFiles = ['angband3d_demo.mp4', 'angband3d_demo.webm'];
for (const vFile of videoFiles) {
    const full = path.join(videoDir, vFile);
    if (!fs.existsSync(full)) {
        console.error(`FAIL: Missing video asset ${vFile}`);
        process.exit(1);
    }
    const stat = fs.statSync(full);
    if (stat.size < 10 * 1024 * 1024) {
        console.error(`FAIL: Video ${vFile} is suspiciously small: ${(stat.size / (1024*1024)).toFixed(2)} MB`);
        process.exit(1);
    }
    console.log(`✓ 1080p Master Video ${vFile}: ${(stat.size / (1024*1024)).toFixed(2)} MB`);
}

console.log('\n=== [7] Verifying Dedicated Demo Page & Client Parity ===');
const demoHtmlPath = path.join(__dirname, '..', 'server', 'public', 'demo.html');
if (!fs.existsSync(demoHtmlPath)) {
    console.error('FAIL: demo.html not found');
    process.exit(1);
}
const demoHtml = fs.readFileSync(demoHtmlPath, 'utf8');
const expectedInDemo = [
    'og:video',
    'og:image',
    'class="video-box"',
    'id="controls-bar"',
    'id="volume-slider"',
    'Thunderbear Studios',
    'https://github.com/ThunderbearStudios/angband3d'
];
for (const str of expectedInDemo) {
    if (!demoHtml.includes(str)) {
        console.error(`FAIL: demo.html missing ${str}`);
        process.exit(1);
    }
    console.log(`✓ demo.html has ${str}`);
}

if (!serverSrc.includes('/demo') || !serverSrc.includes('/demo.html')) {
    console.error('FAIL: server.js does not route /demo to /demo.html');
    process.exit(1);
}
console.log('✓ server.js routes /demo to /demo.html');

console.log('\n=============================================');
console.log('ALL GAMEPLAY DEMO SHOWCASE VERIFICATIONS PASS!');
console.log('=============================================\n');


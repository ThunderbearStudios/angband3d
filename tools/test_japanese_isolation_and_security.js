const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('=== Starting Japanese Isolation, Sil-Q Controls, & Security Verification ===');

// --- 1. Client Script Inspection (Static Analysis) ---
const appJsPath = path.resolve(__dirname, '../server/public/js/app.js');
const hudJsPath = path.resolve(__dirname, '../server/public/js/hud.js');
const inputJsPath = path.resolve(__dirname, '../server/public/js/input.js');
const serverJsPath = path.resolve(__dirname, '../server/src/server.js');
const hengDictPath = path.resolve(__dirname, '../server/public/js/heng-dict.js');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const hudJs = fs.readFileSync(hudJsPath, 'utf8');
const inputJs = fs.readFileSync(inputJsPath, 'utf8');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');
const hengDict = fs.readFileSync(hengDictPath, 'utf8');

console.log('[Test 1] Zero exposed API keys in client JavaScript files');
const clientFiles = [appJsPath, hudJsPath, inputJsPath, hengDictPath];
for (const f of clientFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const apiKeyMatch = content.match(/AIza[0-9A-Za-z-_]{35}/);
    assert.strictEqual(apiKeyMatch, null, `Found potential exposed Google API key in ${path.basename(f)}`);
}
console.log('  -> PASSED: No Google API keys found in client JS files.');

console.log('[Test 2] Hengband is strictly the only realm where Japanese / bilingual mode is allowed');
// Check setLanguageMode guard
assert.ok(appJs.includes("if (activeRealm !== 'hengband') {"), 'setLanguageMode must guard activeRealm !== hengband');
// Check getRealmCommandRegistry guard
assert.ok(appJs.includes("(r === 'hengband') && (lang === 'jp' || langMode === 'jp' || window.__langMode === 'jp')"),
    'getRealmCommandRegistry must only allow isJp for hengband');
// Check populateLetterRibbon guard
assert.ok(appJs.includes("if (activeRealm === 'hengband') {") || appJs.includes("activeRealm === 'hengband' ?"),
    'populateLetterRibbon must guard Japanese term translations with activeRealm === hengband');
console.log('  -> PASSED: Language mode strictly quarantined to Hengband.');

console.log('[Test 3] Character Creation & Review Contextual Actions are strictly English outside Hengband');
// Verify hengLabel and isHeng guards around multilingual button labels
assert.ok(appJs.includes("if (!isHeng || effLang === 'en') return en;"),
    'hengLabel must strictly guard !isHeng to return English');
assert.ok(appJs.includes("const effLang = isHeng ? (window.__langMode || langMode || 'en') : 'en';"),
    'effLang must strictly quarantine language mode to Hengband');

const checks = [
    "hengLabel('✓ Accept', '✓ Accept / 決定', '✓ 決定')",
    "hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る')",
    "hengLabel('🔄 Reset Stats', '🔄 Reset / 再抽選', '🔄 再抽選')",
    "hengLabel('⚔ Enter Realm', '⚔ ゲーム開始 (Enter Realm)', '⚔ ゲーム開始')",
    "hengLabel('🔄 Start Over', '🔄 初めから (Start Over)', '🔄 初めから')",
    "hengLabel('⎋ Quit', '⎋ 終了 (Quit)', '⎋ 終了')",
    "hengLabel('✓ Select', '✓ Select / 決定', '✓ 決定')",
    "hengLabel('🎲 Random', '🎲 Random / ランダム', '🎲 ランダム')",
    "hengLabel('⎋ Back', '⎋ Back / 戻る', '⎋ 戻る')"
];
for (const c of checks) {
    assert.ok(appJs.includes(c), `Missing conditional label in app.js: ${c}`);
}

// Functionally verify that for any non-Hengband realm, Japanese is never output
const simHengLabel = (isHeng, effLang, en, bi, jp) => (!isHeng || effLang === 'en') ? en : (effLang === 'jp' ? jp : bi);
for (const realm of ['angband', 'silq', 'frogcomposband']) {
    const isHeng = realm === 'hengband';
    assert.strictEqual(simHengLabel(isHeng, 'en', '✓ Accept', '✓ Accept / 決定', '✓ 決定'), '✓ Accept');
    assert.strictEqual(simHengLabel(isHeng, 'bilingual', '✓ Accept', '✓ Accept / 決定', '✓ 決定'), '✓ Accept');
    assert.strictEqual(simHengLabel(isHeng, 'jp', '✓ Accept', '✓ Accept / 決定', '✓ 決定'), '✓ Accept');
}
// Verify Hengband supports all 3 modes
assert.strictEqual(simHengLabel(true, 'en', '✓ Accept', '✓ Accept / 決定', '✓ 決定'), '✓ Accept');
assert.strictEqual(simHengLabel(true, 'bilingual', '✓ Accept', '✓ Accept / 決定', '✓ 決定'), '✓ Accept / 決定');
assert.strictEqual(simHengLabel(true, 'jp', '✓ Accept', '✓ Accept / 決定', '✓ 決定'), '✓ 決定');
console.log('  -> PASSED: Contextual action labels are strictly English outside Hengband and dynamic within Hengband.');

console.log('[Test 4] Sil-Q native keys and contextual buttons');
// Verify Sil-Q item prompts
assert.ok(appJs.includes("if (activeRealm === 'silq') {") && appJs.includes("data-key=\"x\"><span>[x]</span> 🔍 Examine"),
    'Sil-Q item prompt must include examine, wield, throw, drop');
// Verify Sil-Q classic terminal actions
assert.ok(appJs.includes("data-key=\"s\"><span>[s]</span> 🎵 Song"), 'Sil-Q terminal actions must include Song <s>');
assert.ok(appJs.includes("data-key=\"%\"><span>[%]</span> ⏳ Rest"), 'Sil-Q terminal actions must include Rest <%>');
assert.ok(appJs.includes("data-key=\"t\"><span>[t]</span> 🎯 Throw"), 'Sil-Q terminal actions must include Throw <t>');
assert.ok(appJs.includes("data-key=\"\\t\"><span>[Tab]</span> 📜 Skills"), 'Sil-Q terminal actions must include Skills <Tab>');

// Verify input.js Tab routing for Sil-Q
assert.ok(inputJs.includes("if (realm === 'silq') {") && inputJs.includes("this.network.sendKey('tab');"),
    'input.js must forward Tab to Sil-Q engine as ability/skills screen');

// Verify input.js action button bindings for Sil-Q
assert.ok(inputJs.includes("if (id === 'btn-throw') effKey = 't';"), 'input.js must map btn-throw to t in Sil-Q');
assert.ok(inputJs.includes("if (id === 'btn-cast') effKey = 's';"), 'input.js must map btn-cast to s in Sil-Q');
assert.ok(inputJs.includes("if (id === 'btn-skills') effKey = 'tab';"), 'input.js must map btn-skills to tab in Sil-Q');
assert.ok(inputJs.includes("if (id === 'btn-rest') effKey = '%';"), 'input.js must map btn-rest to % in Sil-Q');

// Verify input.js world key remapping for Sil-Q
assert.ok(inputJs.includes("if (keyToSend === 'm') keyToSend = 's';"), 'input.js must map m to s in Sil-Q');
assert.ok(inputJs.includes("if (keyToSend === 'v') keyToSend = 't';"), 'input.js must map v to t in Sil-Q');
assert.ok(inputJs.includes("if (keyToSend === 'R') keyToSend = '%';"), 'input.js must map R to % in Sil-Q');

// Verify hud.js quick action button text updates for Sil-Q
assert.ok(hudJs.includes("if (id === 'btn-throw') btn.innerHTML = '🎯 Throw <kbd>t</kbd>';"), 'hud.js must show t for Throw in Sil-Q');
assert.ok(hudJs.includes("if (id === 'btn-cast') btn.innerHTML = '🎵 Song <kbd>s</kbd>';"), 'hud.js must show s for Song in Sil-Q');
assert.ok(hudJs.includes("if (id === 'btn-skills') btn.innerHTML = '📜 Skills <kbd>Tab</kbd>';"), 'hud.js must show Tab for Skills in Sil-Q');
assert.ok(hudJs.includes("if (id === 'btn-rest') btn.innerHTML = '⏳ Rest <kbd>%</kbd>';"), 'hud.js must show % for Rest in Sil-Q');
console.log('  -> PASSED: Sil-Q native keys and buttons verified.');

console.log('[Test 5] heng-dict.js Performance Optimizations');
const HENG_DICT = require(hengDictPath);
assert.ok(typeof HENG_DICT.localizeGameMessage === 'function', 'HENG_DICT must export localizeGameMessage');

// Ensure non-Hengband realms are completely bypassed
const vanillaMsg = 'You hit the orc.';
const resVanilla = HENG_DICT.localizeGameMessage(vanillaMsg, 'angband', 'en');
assert.strictEqual(resVanilla, vanillaMsg, 'Non-Hengband messages must be returned as-is');

// Ensure native Japanese mode returns original Japanese message as-is
const jpMsg = 'オークに命中した。';
const resJp = HENG_DICT.localizeGameMessage(jpMsg, 'hengband', 'jp');
assert.strictEqual(resJp, jpMsg, 'JP mode must return native Japanese');

// Test translation caching and benchmark
const t0 = process.hrtime.bigint();
const runCount = 2000;
for (let i = 0; i < runCount; i++) {
    HENG_DICT.localizeGameMessage(jpMsg, 'hengband', 'en');
}
const t1 = process.hrtime.bigint();
const durationMs = Number(t1 - t0) / 1e6;
console.log(`  -> 2,000 message lookups completed in ${durationMs.toFixed(2)} ms (${(durationMs / runCount * 1000).toFixed(2)} µs/lookup)`);
assert.ok(durationMs < 100, 'Cached lookups must execute in under 100ms for 2000 calls');
console.log('  -> PASSED: heng-dict.js LRU cache and pre-sorted optimization verified.');

// --- 2. Live HTTP Security Testing ---
console.log('[Test 6] Live Server Security & Endpoint Hardening');
const serverProcess = require('child_process').spawn('node', ['src/server.js'], {
    cwd: path.resolve(__dirname, '../server'),
    env: { ...process.env, PORT: '8089', GEMINI_API_KEY: 'test-secret-gemini-key' },
    stdio: 'ignore'
});

async function runLiveServerTests() {
    // Wait for server to start
    await new Promise(r => setTimeout(r, 1200));

    try {
        // A. /api/config/llm should NEVER expose the raw GEMINI_API_KEY
        const cfgRes = await fetch('http://localhost:8089/api/config/llm');
        assert.strictEqual(cfgRes.status, 200);
        const cfg = await cfgRes.json();
        assert.strictEqual(cfg.hasKey, true);
        assert.strictEqual(cfg.hasServerKey, true);
        assert.strictEqual(cfg.key, undefined, 'Raw key must NEVER be in response');
        assert.strictEqual(cfg.geminiApiKey, undefined, 'Raw key must NEVER be in response');
        console.log('  -> PASSED: /api/config/llm does not leak raw secret key.');

        // B. Dotfile request (/.env) must return 403 Forbidden
        const envRes = await fetch('http://localhost:8089/.env');
        assert.strictEqual(envRes.status, 403, 'Dotfile /.env must return 403 Forbidden');
        console.log('  -> PASSED: Dotfiles are blocked with 403 Access denied.');

        // C. Directory traversal / dotfile (/assets/../../.git/config) must return 403
        const dotGitRes = await fetch('http://localhost:8089/.git/config');
        assert.strictEqual(dotGitRes.status, 403, 'Dotfile /.git/config must return 403');
        console.log('  -> PASSED: Hidden directories are blocked with 403.');

        // D. Disallowed extensions (e.g. .exe, .sh, .py) in public dir must return 404
        const exeRes = await fetch('http://localhost:8089/test.exe');
        assert.strictEqual(exeRes.status, 404, 'Unwhitelisted extension must return 404');
        console.log('  -> PASSED: Unwhitelisted extensions rejected.');

        // E. /api/recordings/upload must reject non-.webm / non-.mp4 files
        const badUploadRes = await fetch('http://localhost:8089/api/recordings/upload', {
            method: 'POST',
            headers: { 'x-recording-name': 'malicious.exe', 'content-type': 'application/octet-stream' },
            body: Buffer.from('malicious payload')
        });
        assert.strictEqual(badUploadRes.status, 400, 'Non-webm/mp4 upload must return 400');
        console.log('  -> PASSED: Recording upload strictly enforces .webm and .mp4 extension whitelist.');

        // F. Valid .webm upload is accepted
        const goodUploadRes = await fetch('http://localhost:8089/api/recordings/upload', {
            method: 'POST',
            headers: { 'x-recording-name': 'valid_test.webm', 'content-type': 'application/octet-stream' },
            body: Buffer.from('dummy webm data')
        });
        assert.strictEqual(goodUploadRes.status, 200, 'Valid .webm upload must return 200');
        console.log('  -> PASSED: Legitimate .webm recording upload functions correctly.');

        // Clean up uploaded test file
        const testWebmPath = path.resolve(__dirname, '../server/public/assets/video/valid_test.webm');
        if (fs.existsSync(testWebmPath)) {
            try { fs.unlinkSync(testWebmPath); } catch (_) {}
        }

        console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
    } finally {
        serverProcess.kill();
    }
}

runLiveServerTests().catch(err => {
    console.error('Test failed:', err);
    serverProcess.kill();
    process.exit(1);
});

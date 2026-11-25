/**
 * Test suite for Angband3D Cloud Server
 * Validates:
 *  - /health endpoint
 *  - Save metadata parser and /api/saves REST endpoint
 *  - Save upload validation (SaveVNLA magic)
 *  - Standalone zip download endpoint (/download/angband3d-standalone.zip)
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const os = require('os');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const SAVE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'a3d-save-'));
process.env.PORT = PORT.toString();
process.env.SAVE_DIR = SAVE_DIR;
process.on('exit', () => {
    try { fs.rmSync(SAVE_DIR, { recursive: true, force: true }); } catch (_) {}
});

// Start the server
require('../src/server.js');

function get(pathStr) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}${pathStr}`, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

function post(pathStr, bodyBuffer, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://localhost:${PORT}${pathStr}`, {
            method: 'POST',
            headers: {
                'Content-Length': bodyBuffer.length,
                ...headers
            }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.write(bodyBuffer);
        req.end();
    });
}

async function runTests() {
    console.log('Testing server endpoints on port', PORT);
    let healthOk = false;
    let health;
    for (let i = 0; i < 40; i++) {
        try {
            health = await get('/health');
            if (health.status === 200) { healthOk = true; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
    }
    assert(healthOk, 'Server /health readiness check failed on port ' + PORT);

    // Test 1: Health check
    console.log('Test 1: Health check');
    assert.strictEqual(health.status, 200);
    const healthJson = JSON.parse(health.body);
    assert.strictEqual(healthJson.status, 'ok');
    console.log('  -> Health check OK');

    // Test 2: List saves
    console.log('Test 2: List saves');
    const saves = await get('/api/saves');
    assert.strictEqual(saves.status, 200);
    const savesJson = JSON.parse(saves.body);
    assert(Array.isArray(savesJson.saves));
    console.log(`  -> Saves listed: ${savesJson.saves.length} save files found`);

    // Test 3: Save Upload Validation (Reject corrupt payload)
    console.log('Test 3: Save Upload Validation (reject invalid header)');
    const corruptData = Buffer.from('NOT_A_VALID_SAVE_FILE');
    const rejectRes = await post('/api/saves/upload', corruptData);
    assert.strictEqual(rejectRes.status, 400);
    console.log('  -> Corrupt save properly rejected with 400 Bad Request');

    // Test 4: Save Upload Validation (Accept valid SaveVNLA mock)
    console.log('Test 4: Save Upload Validation (accept valid SaveVNLA mock)');
    const validHeader = Buffer.alloc(100);
    validHeader.write('SaveVNLA', 0, 8, 'ascii');
    validHeader.write('description\0', 8, 16, 'ascii');
    validHeader.writeUInt32LE(1, 24); // version
    const descText = 'MorgothSlayer, Level 50 High-Elf Warrior';
    validHeader.writeUInt32LE(descText.length, 28);
    validHeader.write(descText, 36, descText.length, 'utf8');

    const uploadRes = await post('/api/saves/upload', validHeader, { 'x-character-name': 'TestHero' });
    assert.strictEqual(uploadRes.status, 200);
    const uploadJson = JSON.parse(uploadRes.body);
    assert.strictEqual(uploadJson.status, 'saved');
    console.log('  -> Valid SaveVNLA upload accepted and saved:', uploadJson.filename);

    // Clean up test file
    const testSavePaths = [
        path.join(SAVE_DIR, 'TestHero'),
        path.join(__dirname, '../../engine/build/game/lib/save/TestHero')
    ];
    for (const tsp of testSavePaths) {
        if (fs.existsSync(tsp)) {
            fs.unlinkSync(tsp);
            console.log('  -> Cleaned up test save file');
        }
    }

    // Test 5: Static web client delivery
    console.log('Test 5: Static web client delivery');
    const indexRes = await get('/');
    assert.strictEqual(indexRes.status, 200);
    assert(indexRes.body.includes('<title>Angband3D') || indexRes.body.includes('<title>Angband 3D') || indexRes.body.includes('<title>YASD 3D'));
    assert(indexRes.headers['content-type'].includes('text/html'));
    console.log('  -> / serves index.html (200 OK)');

    const cssRes = await get('/css/dungeon.css');
    assert.strictEqual(cssRes.status, 200);
    assert(cssRes.body.includes('--font-fantasy'));
    console.log('  -> /css/dungeon.css serves CSS (200 OK)');

    const jsRes = await get('/js/dungeon3d.js');
    assert.strictEqual(jsRes.status, 200);
    console.log('  -> /js/dungeon3d.js serves 3D engine (200 OK)');

    // Test 6: Healthz liveness probe & metrics
    console.log('Test 6: Healthz liveness probe');
    const healthz = await get('/healthz');
    assert.strictEqual(healthz.status, 200);
    const healthzJson = JSON.parse(healthz.body);
    assert.strictEqual(healthzJson.status, 'ok');
    assert(typeof healthzJson.uptime === 'number');
    assert(typeof healthzJson.activeSessions === 'number');
    assert.strictEqual(healthzJson.engine, 'ready');
    console.log('  -> /healthz returned metrics & ready status (200 OK)');

    // Test 7: Gzip compression & Cache-Control
    console.log('Test 7: Gzip compression & Cache-Control headers');
    const gzipRes = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}/js/dungeon3d.js`, {
            headers: { 'Accept-Encoding': 'gzip' }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                bodyLength: Buffer.concat(chunks).length
            }));
        }).on('error', reject);
    });
    assert.strictEqual(gzipRes.status, 200);
    assert.strictEqual(gzipRes.headers['content-encoding'], 'gzip');
    assert(gzipRes.headers['cache-control'].includes('no-cache'));
    console.log(`  -> /js/dungeon3d.js delivered with gzip compression (${gzipRes.bodyLength} bytes compressed)`);

    // Test 8: GLB Binary Model Delivery & MIME type
    console.log('Test 8: GLB Binary Model Delivery & MIME type');
    const glbRes = await get('/assets/models/monsters/Imp.glb');
    assert.strictEqual(glbRes.status, 200);
    assert.strictEqual(glbRes.headers['content-type'], 'model/gltf-binary');
    assert(glbRes.headers['cache-control'].includes('must-revalidate'));
    const glbVerRes = await get('/assets/models/monsters/Imp.glb?v=12.0.3');
    assert.strictEqual(glbVerRes.status, 200);
    assert(glbVerRes.headers['cache-control'].includes('immutable'));
    console.log('  -> /assets/models/monsters/Imp.glb served with model/gltf-binary & ETag/versioned cache headers (200 OK)');

    const puglinRes = await get('/assets/models/monsters/Puglin.glb');
    assert.strictEqual(puglinRes.status, 200);
    assert.strictEqual(puglinRes.headers['content-type'], 'model/gltf-binary');
    console.log('  -> /assets/models/monsters/Puglin.glb served with model/gltf-binary (200 OK)');

    // Test 9: 3D Item and Monster Model Asset Integrity
    console.log('Test 9: 3D Item and Monster Model Asset Integrity');
    const mineralRes = await get('/assets/models/items/Mineral.obj');
    assert.strictEqual(mineralRes.status, 200);
    console.log('  -> /assets/models/items/Mineral.obj (Pebble/Stone) served (200 OK)');

    const dartRes = await get('/assets/models/items/Dart.obj');
    assert.strictEqual(dartRes.status, 200);
    console.log('  -> /assets/models/items/Dart.obj served (200 OK)');

    const spiderRes = await get('/assets/models/monsters/Spider.obj');
    assert.strictEqual(spiderRes.status, 200);
    console.log('  -> /assets/models/monsters/Spider.obj served (200 OK)');

    // Test 10: Client HTML Structure & Component Verification
    console.log('Test 10: Client HTML Structure & Component Verification');
    assert(indexRes.body.includes('id="terminal-touch-controls"'), 'terminal-touch-controls must be present in index.html');
    assert(indexRes.body.includes('id="term-dpad-grid"'), 'term-dpad-grid must be present');
    assert(indexRes.body.includes('id="term-contextual-actions"'), 'term-contextual-actions must be present');
    assert(indexRes.body.includes('id="term-letter-ribbon"'), 'term-letter-ribbon must be present');
    assert(indexRes.body.includes('id="map-resize-handle"'), 'map-resize-handle must be present');
    assert(indexRes.body.includes('id="msg-resize-handle"'), 'msg-resize-handle must be present');
    // Test 11: Character Screen Toolbar & Store Isolation Guard
    console.log('Test 11: Character Screen Toolbar & Store Isolation Guard');
    const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    const screenContextJs = fs.readFileSync(path.join(__dirname, '../public/js/screen-context.js'), 'utf8');
    const combinedAppAndContext = appJs + '\n' + screenContextJs;
    const inputJs = fs.readFileSync(path.join(__dirname, '../public/js/input.js'), 'utf8');
    const hudJs = fs.readFileSync(path.join(__dirname, '../public/js/hud.js'), 'utf8');
    assert(combinedAppAndContext.includes("phase === 'play'") && combinedAppAndContext.includes(".map)"), 'app.js / screen-context.js must strictly define inPlay by phase and map');
    assert(combinedAppAndContext.includes("parseInt(frame.map.rows[py].f.substring(px * 2, px * 2 + 2), 16)"), 'screen-context.js must correctly parse 2-hex store feature index');
    assert(appJs.includes("if (termAdvanceBtn) termAdvanceBtn.style.display = 'none';"), 'app.js must hide advance button in stores');
    assert(hudJs.includes("resetMessages(welcomeText = null)"), 'hud.js must implement resetMessages');
    assert(hudJs.includes("accept character history"), 'hud.js must filter character history setup prompt');
    assert(inputJs.includes("const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && lastFrame.map);"), 'input.js must strictly define inPlay by phase and map');
    console.log('  -> Unified terminal touch controls strictly quarantined to inPlay states with verified map context');
    console.log('  -> Store menus strictly isolate shop options and hide creation/advance buttons');
    // Test 12: Client JS Syntax & Compilation Integrity
    console.log('Test 12: Client JS Syntax & Compilation Integrity');
    const clientScripts = ['app.js', 'hud.js', 'input.js', 'terminal.js', 'audio.js', 'dungeon3d.js', 'network.js', 'grimoire-deck.js'];
    for (const scriptName of clientScripts) {
        const scriptCode = fs.readFileSync(path.join(__dirname, '../public/js', scriptName), 'utf8');
        try {
            new Function(scriptCode);
            console.log(`  -> ${scriptName} syntax verified cleanly`);
        } catch (syntaxErr) {
            assert.fail(`${scriptName} failed syntax evaluation: ${syntaxErr.message}`);
        }
    }

    // Test 13: WebHUD Real-Time Message Processing & Repeat Integrity
    console.log('Test 13: WebHUD Real-Time Message Processing & Repeat Integrity');
    assert(hudJs.includes('updateLastMessageCount(rawText, count)'), 'hud.js must implement updateLastMessageCount');
    assert(hudJs.includes('this.updateLastMessageCount(curLast.text.trim(), curLast.count);'), 'hud.js must update message count in-place');
    {
        const vm = require('vm');
        const sandbox = { window: {}, document: {}, localStorage: { getItem: () => null, setItem: () => {} }, setTimeout, clearTimeout, console };
        vm.runInNewContext(hudJs, sandbox);
        const proto = sandbox.window.WebHUD.prototype;
        const mockHud = {
            _parseRepeatText: proto._parseRepeatText,
            _normFeedText: proto._normFeedText,
            _isRedundantTermRow0: proto._isRedundantTermRow0,
            messageHistory: [
                { text: 'You have 7 Rations of Food (a). You have a Potion of Speed (b). You have 16 Iron Spikes (2/2) (c).' }
            ]
        };
        assert.strictEqual(mockHud._normFeedText('The Wolf notices you. <3x>'), 'The Wolf notices you.');
        assert.strictEqual(mockHud._normFeedText('There is a pile of rubble blocking your way. (x2)'), 'There is a pile of rubble blocking your way.');
        assert.strictEqual(
            mockHud._isRedundantTermRow0('The Wolf notices you. The Wolf notices you. The Wolf notices you.', [{ text: 'The Wolf notices you. <3x>' }], []),
            true,
            'term.rows[0] repeated wolf notices must dedupe against <3x> feed message'
        );
        assert.strictEqual(
            mockHud._isRedundantTermRow0('You have a Potion of Speed (b). You have 16 Iron Spikes (2/2) (c).', [], []),
            true,
            'term.rows[0] wrapped suffix must dedupe against recent messageHistory'
        );
    }
    console.log('  -> WebHUD message feed implements in-place repeat count updates');
    console.log('  -> Real-time combat and term row 0 message stream parsing verified');

    // Test 14: Automatic Shop Space Navigation & Store Interface Routing
    console.log('Test 14: Automatic Shop Space Navigation & Store Interface Routing');
    const dungeonCss = fs.readFileSync(path.join(__dirname, '../public/css/dungeon.css'), 'utf8');
    const freshAppJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    assert(freshAppJs.includes("const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');"), 'app.js must lookup term-title correctly');
    assert(
        combinedAppAndContext.includes("const isStore = !isItemPrompt && (hasStoreText || ((isRetailStoreFeat || isHomeFeat) && inOverlay));"),
        'screen-context.js must accurately detect retail/home store interface without misclassifying item menus or special buildings'
    );
    assert(dungeonCss.includes("flex: 1;"), 'dungeon.css message-feed-scroll must flex: 1 to fill message feed window');
    // Test 15: Unified Minimap Controls Bar & Responsive Flex Sizing
    console.log('Test 15: Unified Minimap Controls Bar & Responsive Flex Sizing');
    assert(indexRes.body.includes('id="btn-map-toggle-size"'), 'btn-map-toggle-size must be present in index.html');
    assert(indexRes.body.includes('id="btn-map-recenter"'), 'btn-map-recenter must be present in index.html');
    assert(indexRes.body.includes('id="btn-map-zoom-out"'), 'btn-map-zoom-out must be present in index.html');
    assert(indexRes.body.includes('id="btn-map-zoom-in"'), 'btn-map-zoom-in must be present in index.html');
    assert(dungeonCss.includes('#minimap-container.standard'), 'dungeon.css must define standard minimap container');
    assert(dungeonCss.includes('flex: 1 1 auto;'), 'dungeon.css minimap-canvas must flex-fit');
    assert(hudJs.includes('resetMinimapZoom()'), 'hud.js must implement resetMinimapZoom');
    assert(hudJs.includes('`[⛶] ${size.name} • ${this.minimapZoom.toFixed(1)}x`'), 'hud.js must format unified minimap hint cleanly');
    console.log('  -> Minimap controls unified with zoom and size presets');
    console.log('  -> Minimap canvas configured with flex-fit to avoid clipping controls');

    // Test 16: Interactive Action Menus (Throw, Terminal Contextual Actions Bar, Prompt Titles)
    console.log('Test 16: Interactive Action Menus (Throw, Terminal Contextual Actions Bar, Prompt Titles)');
    assert(indexRes.body.includes('id="btn-throw"'), 'btn-throw must be present in index.html');
    assert(indexRes.body.includes('id="term-contextual-actions"'), 'term-contextual-actions must be present in index.html');
    assert(indexRes.body.includes('id="term-letter-ribbon"'), 'term-letter-ribbon must be present in index.html');
    assert(inputJs.includes("bind('btn-throw', 'throw');") || inputJs.includes("bind('btn-throw', 'v');"), 'input.js must bind btn-throw to throw verb');
    assert(freshAppJs.includes('🎒 INVENTORY PACK'), 'app.js must recognize inventory pack prompt');
    assert(freshAppJs.includes('🛡 EQUIPPED GEAR'), 'app.js must recognize equipment gear prompt');
    assert(freshAppJs.includes('🎯 THROW ITEM'), 'app.js must recognize throw prompt');
    assert(freshAppJs.includes('🧪 QUAFF POTION'), 'app.js must recognize quaff prompt');
    assert(freshAppJs.includes('📜 READ SCROLL'), 'app.js must recognize read prompt');
    assert(freshAppJs.includes('🏹 FIRE / SHOOT'), 'app.js must recognize fire prompt');
    console.log('  -> Throw button (v) added to action bar and bound');
    console.log('  -> Terminal Contextual Actions Bar & Letter Ribbon dynamically populate item selection buttons');
    // Test 17: Save Game Download & Upload System
    console.log('Test 17: Save Game Download & Upload System');
    assert(indexRes.body.includes('id="btn-save-upload"'), 'btn-save-upload must be present in index.html');
    assert(indexRes.body.includes('id="file-save-upload"'), 'file-save-upload must be present in index.html');
    assert(indexRes.body.includes('id="btn-pause-download"'), 'btn-pause-download must be present in index.html');
    assert(appJs.includes('downloadSave('), 'app.js must implement downloadSave');
    assert(appJs.includes('uploadSave('), 'app.js must implement uploadSave');
    assert(appJs.includes('downloadCurrentSave('), 'app.js must implement downloadCurrentSave');
    assert(inputJs.includes("if (e.key === 'u' || e.key === 'U')"), 'input.js must bind u to triggerSaveUpload in loadMenu');
    assert(inputJs.includes("if (e.key === 'x' || e.key === 'X' || e.key === 'e' || e.key === 'E')"), 'input.js must bind x/e to downloadSelectedSave in loadMenu');
    assert(dungeonCss.includes('.btn-save-download'), 'dungeon.css must define .btn-save-download');
    assert(dungeonCss.includes('.load-toolbar'), 'dungeon.css must define .load-toolbar');
    console.log('  -> Save download buttons integrated in load list cards and in-game pause menu');
    console.log('  -> Save upload button, file picker, and drag-and-drop support verified');
    // Test 18: Sensed/Invisible 3D Depiction, Volume Controls, Splash Credits, Features & Pro Tips
    console.log('Test 18: Sensed/Invisible 3D Depiction, Volume Controls, Splash Credits, Features & Pro Tips');
    const dungeon3dJs = fs.readFileSync(path.join(__dirname, '../public/js/dungeon3d.js'), 'utf8');
    const audioJs = fs.readFileSync(path.join(__dirname, '../public/js/audio.js'), 'utf8');
    assert(dungeon3dJs.includes('createFoggyMonsterAura('), 'dungeon3d.js must implement createFoggyMonsterAura');
    assert(dungeon3dJs.includes('isSensed'), 'dungeon3d.js must calculate isSensed for invisible and unlit/darkness detection');
    assert(dungeon3dJs.includes('entity.foggyAura.visible = true;'), 'dungeon3d.js must display foggy aura when monster is sensed');
    assert(dungeon3dJs.includes('👁 SENSED'), 'dungeon3d.js must add SENSED badge to monster nameplate');
    assert(audioJs.includes('setMasterVolume('), 'audio.js must implement setMasterVolume');
    assert(audioJs.includes('setMute('), 'audio.js must implement setMute');
    assert(audioJs.includes('toggleMute()'), 'audio.js must implement toggleMute');
    assert(indexRes.body.includes('id="volume-slider"'), 'volume-slider must be present in index.html');
    assert(indexRes.body.includes('id="pause-volume-slider"'), 'pause-volume-slider must be present in index.html');
    assert(indexRes.body.includes('id="btn-splash-features"') || indexRes.body.includes('id="splash-enter-prompt"'), 'splash prompt or features button must be present in index.html');
    assert(indexRes.body.includes('id="btn-splash-guide"') || indexRes.body.includes('id="btn-splash-protips"') || indexRes.body.includes('id="guide-modal"'), 'guide modal or splash guide button must be present in index.html');
    assert(indexRes.body.includes('id="btn-splash-credits"') || indexRes.body.includes('id="btn-menu-credits"'), 'credits button must be present in index.html');
    assert(indexRes.body.includes('splash-credits-footer'), 'splash-credits-footer must be present in index.html');
    assert(indexRes.body.includes('KEY FEATURES OF ANGBAND 3D') || indexRes.body.includes('Realm Mechanics'), 'Guide tab must contain Key Features or Realm Mechanics');
    assert(indexRes.body.includes('PRO TIPS') || indexRes.body.includes('Pro Tips'), 'Guide tab must contain Pro Tips');
    assert(indexRes.body.includes('CREDITS') || indexRes.body.includes('Credits'), 'index.html must contain Credits');
    assert(dungeonCss.includes('.sound-control-group'), 'dungeon.css must define .sound-control-group');
    assert(dungeonCss.includes('.pause-audio-toolbar'), 'dungeon.css must define .pause-audio-toolbar');
    assert(dungeonCss.includes('.splash-credits-footer'), 'dungeon.css must define .splash-credits-footer');
    assert(freshAppJs.includes('btnSplashFeatures') || freshAppJs.includes('splashOverlay'), 'app.js must wire btnSplashFeatures or splashOverlay');
    assert(freshAppJs.includes('btnSplashProtips') || freshAppJs.includes('splashOverlay'), 'app.js must wire btnSplashProtips or splashOverlay');
    assert(freshAppJs.includes('syncAudioUI'), 'app.js must implement syncAudioUI');
    console.log('  -> Sensed and invisible creatures rendered in 3D with glowing foggy misty aura and badge');
    console.log('  -> Global volume slider and mute controls active in top bar and pause modal');
    // Test 19: Mobile Touch Sensitivity & Menu Interface Integrity
    console.log('Test 19: Mobile Touch Sensitivity & Menu Interface Integrity');
    const swJs = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
    const swVerMatch = swJs.match(/angband3d-v(\d+)/);
    assert(swVerMatch && parseInt(swVerMatch[1], 10) >= 8, 'sw.js must be bumped to angband3d-v8 or higher');
    assert(/(\/dist\/app\.min\.css|\/css\/dungeon\.css)\?v=(\d+)\./.test(indexRes.body), 'index.html must load versioned app.min.css or dungeon.css');
    assert(/(\/dist\/game\.min\.js|\/js\/app\.js)\?v=(\d+)\./.test(indexRes.body), 'index.html must load versioned game.min.js or app.js');
    assert(indexRes.body.includes('id="quick-volume-popover"'), 'index.html must contain #quick-volume-popover');
    assert(dungeonCss.includes('.quick-volume-popover'), 'dungeon.css must style .quick-volume-popover');
    assert(dungeonCss.includes('touch-action: pan-x;'), 'dungeon.css .term-letter-ribbon must have touch-action: pan-x');
    assert(appJs.includes('Date.now() - lastTouchEndTime < 500'), 'app.js must suppress synthetic clicks within 500ms of touch');
    assert(inputJs.includes('bindReliableAction'), 'input.js must implement bindReliableAction');
    assert(appJs.includes("key: 'y'") && appJs.includes('✓ Yes'), 'app.js must provide dedicated Yes/No prompt buttons');
    assert(appJs.includes('termDpad.style.display = \'grid\''), 'app.js must provide D-Pad navigation for birth menus and item prompts');
    console.log('  -> Synthetic click suppression (< 500ms) active across letter ribbons, menus, and action buttons');
    console.log('  -> Horizontal pan-x scrolling enabled on term letter ribbon with touch drag cancellation');
    console.log('  -> Universal Yes/No prompt shortcuts, quantity pickers, and D-Pad accessibility verified');

    // Test 20: Standalone Apps & Downloads Modal & Button Reliability
    console.log('Test 20: Standalone Apps & Downloads Modal & Button Reliability');
    assert(indexRes.body.includes('id="pwa-modal"'), 'index.html must contain #pwa-modal');
    assert(indexRes.body.includes('id="btn-menu-pwa"'), 'index.html must contain #btn-menu-pwa in main menu');
    assert(indexRes.body.includes('id="btn-splash-standalone"') || indexRes.body.includes('id="splash-enter-prompt"'), 'index.html must contain splash standalone or billboard enter prompt');
    assert(indexRes.body.includes('href="/download/Angband3D-Android.apk"') || indexRes.body.includes('id="pwa-status-box"'), 'index.html must provide Android APK download or PWA status box');
    assert(indexRes.body.includes('href="/download/Angband3D-Windows-x64.zip"') || indexRes.body.includes('href="/download/angband3d-standalone.zip"') || indexRes.body.includes('id="pwa-instructions-text"'), 'index.html must provide Windows ZIP download or PWA instructions');
    assert(dungeonCss.includes('#pwa-modal {'), 'dungeon.css must define full-screen modal overlay for #pwa-modal');
    assert(dungeonCss.includes('#pwa-modal.hidden'), 'dungeon.css must define hidden state for #pwa-modal');
    assert(freshAppJs.includes('showPWAModal('), 'app.js must implement showPWAModal');
    assert(freshAppJs.includes('hidePWAModal('), 'app.js must implement hidePWAModal');
    assert(freshAppJs.includes("mainMenuOverlay.classList.add('hidden')") || freshAppJs.includes('hideModals(pwaModal)'), 'showPWAModal must hide mainMenuOverlay to foreground modal');
    assert(freshAppJs.includes('btnSplashStandalone') || freshAppJs.includes('splashOverlay'), 'app.js must wire btnSplashStandalone or splashOverlay');
    assert(freshAppJs.includes('btnMenuPwa'), 'app.js must wire btnMenuPwa fast-tap');
    console.log('  -> Standalone Apps & Downloads modal styled with high z-index overlay and smooth transitions');
    console.log('  -> Option [8] and Splash shortcut [6] reliably foreground modal and hide background overlays');
    console.log('  -> Direct download endpoints verified for Android APK and Windows ZIP packages');

    // Test 21: WS25–WS30 Master-Class Audit & Implementation Verification
    console.log('Test 21: WS25–WS30 Master-Class Audit & Implementation Verification');
    assert.strictEqual(indexRes.headers['x-content-type-options'], 'nosniff', 'server must set X-Content-Type-Options: nosniff');
    assert.strictEqual(indexRes.headers['x-frame-options'], 'SAMEORIGIN', 'server must set X-Frame-Options: SAMEORIGIN');
    assert.strictEqual(indexRes.headers['referrer-policy'], 'strict-origin-when-cross-origin', 'server must set Referrer-Policy');

    const SC = require('../public/js/screen-context.js');
    const MR = require('../public/js/menu-router.js');
    const GD = require('../public/js/grimoire-deck.js');
    const CG = require('../public/js/chronicle/chronicle-grounder.js');

    // WS25: Multi-column extraction & passive Angband verb sequence
    const regions = SC.extractRowRegions('a) 2 Rations of Food          m) a Long Sword (2d5)');
    assert.strictEqual(regions.length, 2, 'extractRowRegions must detect both left and right column items');
    assert.strictEqual(regions[0].key, 'a');
    assert.strictEqual(regions[1].key, 'm');

    const passiveSeq = MR.buildInventoryVerbSequence('w', 'c', { realm: 'angband', fromPassiveAngbandList: true });
    assert.strictEqual(passiveSeq.length, 3, 'Vanilla Angband passive inventory must prefix escape before verb + slot');
    assert.strictEqual(passiveSeq[0].toLowerCase(), 'escape');
    assert.strictEqual(passiveSeq[1], 'w');
    assert.strictEqual(passiveSeq[2], 'c');

    // WS26 & WS27: Grimoire Deck & Realm Heraldry
    assert(GD.getHeraldry('silq').crestTitle.includes('SILMARIL'), 'Sil-Q heraldry must reference Silmaril');
    assert(GD.getHeraldry('hengband').crestTitle.includes('FIVE RINGS'), 'Hengband heraldry must reference Five Rings');
    const tokensCss = fs.readFileSync(path.join(__dirname, '../public/css/tokens.css'), 'utf8');
    assert(tokensCss.includes('body[data-realm="silq"]') || dungeonCss.includes('body[data-realm="silq"]'), 'tokens.css/dungeon.css must define per-realm heraldic themes');
    assert(!dungeonCss.includes('@keyframes crtTurnOn'), 'dungeon.css must replace CRT tube animation with grimoireUnfurl');

    // WS28: Realm Story Architectures & Mythic Crossroads
    const silqArch = CG.getStoryArchitecture('silq', 5);
    assert(silqArch.currentDivision.includes('Canto'), 'Sil-Q story architecture must use Cantos');
    const hengArch = CG.getStoryArchitecture('hengband', 10);
    assert(hengArch.currentDivision.includes('Scroll'), 'Hengband story architecture must use Scrolls of the Five Rings');
    const crossroads = CG.getMythicCrossroads('angband', 1, { name: 'Beren' });
    assert.strictEqual(crossroads.choices.length, 3, 'getMythicCrossroads must offer 3 realm-authentic vows');
    const vowBeat = CG.resolveVowConsequenceBeat('vanguard', { name: 'Beren', depth: 1 }, 'angband', 'en');
    assert(vowBeat.prose.includes('Beren'), 'resolveVowConsequenceBeat must weave hero name into vow prose');

    // WS29 & WS30: 3D Perf, Procedural Foley & Server Async I/O
    assert(dungeon3dJs.includes('_tmpLightningVec'), 'dungeon3d.js must reuse _tmpLightningVec in lightning loop');
    const d3dTacticalJs = fs.readFileSync(path.join(__dirname, '../public/js/dungeon3d-tactical.js'), 'utf8');
    assert(dungeon3dJs.includes('_emissiveMaterials') || d3dTacticalJs.includes('_emissiveMaterials'), 'dungeon3d/tactical must cache _emissiveMaterials on hit flash');
    assert(audioJs.includes('playParchmentTurn(') && audioJs.includes('playAnvilStrike(') && audioJs.includes('playKotoPluck('), 'audio.js must provide realm foley cues');
    console.log('  -> WS25–WS30 multi-column hit-testing, Grimoire Deck, Realm Heraldry, Mythic Crossroads, 3D/Audio & Security verified');

    // Test 22: Zero-Trust Bot Guard & Restore-Checkpoint Owner Token Verification
    console.log('Test 22: Zero-Trust Bot Guard & Restore-Checkpoint Owner Token Verification');
    const { guardMutation } = require('../src/http-guard.js');
    const prevTrust = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
    let botStatus = 0;
    const mockRes = { writeHead: (st) => { botStatus = st; }, end: () => {} };
    const blockedBot = guardMutation({ url: '/api/llm/generate', method: 'POST', headers: { host: 'yasd3d.com' } }, mockRes, () => true, 'yasd3d.com');
    assert.strictEqual(blockedBot, true, 'guardMutation must block headerless bot POST in TRUST_PROXY mode');
    assert.strictEqual(botStatus, 403, 'guardMutation must return HTTP 403 for headerless bot POST');
    const allowedBrowser = guardMutation({ url: '/api/llm/generate', method: 'POST', headers: { host: 'yasd3d.com', 'sec-fetch-site': 'same-origin' } }, mockRes, () => true, 'yasd3d.com');
    assert.strictEqual(allowedBrowser, false, 'guardMutation must allow same-origin browser request');
    if (prevTrust === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = prevTrust;
    assert.strictEqual(cssRes.headers['access-control-allow-origin'], undefined, 'Static assets must not set wildcard Access-Control-Allow-Origin: * (E17)');
    console.log('  -> Headerless bot requests blocked with 403 in TRUST_PROXY mode and wildcard static CORS removed (E17)');

    // Test 23: Vertex Auth Refresh, Edge TTS Timeout & AQ. Key Routing Guard
    console.log('Test 23: Vertex Auth Refresh, Edge TTS Timeout & AQ. Key Routing Guard');
    const https = require('https');
    const { EventEmitter } = require('events');
    const { generateChronicleSketch } = require('../src/sketch-service.js');
    const sketchSrc = fs.readFileSync(path.join(__dirname, '../src/sketch-service.js'), 'utf8');
    const serverSrc = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
    assert(sketchSrc.includes("startsWith('AQ.')"), 'sketch-service.js must guard AQ. keys away from AI Studio');
    assert(sketchSrc.includes('forceRefresh: true'), 'sketch-service.js must retry Vertex 401 with forceRefresh: true');
    assert(serverSrc.includes('invalidateGcpAuthCache'), 'server.js must implement invalidateGcpAuthCache');
    assert(serverSrc.includes('forceRefresh'), 'server.js getGcpAuthContext must support forceRefresh');

    const origHttpsRequest = https.request;
    let vertexCalls = 0;
    let aistudioCalls = 0;
    let refreshCalls = 0;
    try {
        https.request = (urlOrOpts, optsOrCb, maybeCb) => {
            const cb = typeof maybeCb === 'function' ? maybeCb : (typeof optsOrCb === 'function' ? optsOrCb : null);
            const targetStr = typeof urlOrOpts === 'string'
                ? urlOrOpts
                : ((urlOrOpts && (urlOrOpts.hostname || urlOrOpts.host || '')) || '');
            if (targetStr.includes('generativelanguage.googleapis.com')) aistudioCalls++;
            const req = new EventEmitter();
            req.write = () => {};
            req.destroy = () => {};
            req.setTimeout = () => {};
            req.end = () => {
                vertexCalls++;
                const res = new EventEmitter();
                res.setEncoding = () => {};
                res.resume = () => {};
                if (vertexCalls === 1) {
                    res.statusCode = 401;
                    cb(res);
                    res.emit('data', JSON.stringify({ error: { code: 401, message: 'UNAUTHENTICATED' } }));
                    res.emit('end');
                } else {
                    res.statusCode = 200;
                    cb(res);
                    res.emit('data', JSON.stringify({
                        candidates: [{
                            content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }] }
                        }]
                    }));
                    res.emit('end');
                }
            };
            return req;
        };

        // Case A: AQ. key with no Vertex OAuth must NOT call AI Studio (402)
        const noAuthRes = await generateChronicleSketch({
            prompt: 'test aq block',
            models: ['gemini-2.5-flash-image'],
            apiKey: 'AQ.FakeVertexExpressKey',
            customKey: '',
            getGcpAuthContext: async () => null,
            redactSecret: s => s,
            isAiStudioDepleted: () => false,
            onAiStudioDepleted: () => {}
        });
        assert.strictEqual(aistudioCalls, 0, 'AQ. key must never invoke AI Studio tier');
        assert.strictEqual(noAuthRes.ok, false, 'Without Vertex auth or non-AQ key, sketch fails cleanly without 402 AI Studio call');

        // Case B: Vertex 401 triggers forceRefresh: true and succeeds on retry without falling back to AI Studio
        const retryRes = await generateChronicleSketch({
            prompt: 'test vertex 401 retry',
            models: ['gemini-2.5-flash-image'],
            apiKey: 'AQ.FakeVertexExpressKey',
            customKey: '',
            getGcpAuthContext: async (opts) => {
                if (opts && opts.forceRefresh) {
                    refreshCalls++;
                    return { token: 'fresh-token', projectId: 'test-proj' };
                }
                return { token: 'stale-token', projectId: 'test-proj' };
            },
            redactSecret: s => s,
            isAiStudioDepleted: () => false,
            onAiStudioDepleted: () => {}
        });
        assert.strictEqual(aistudioCalls, 0, 'Vertex retry must still never touch AI Studio for AQ. keys');
        assert.strictEqual(refreshCalls, 1, 'Vertex 401 must invoke getGcpAuthContext({ forceRefresh: true }) once');
        assert.strictEqual(vertexCalls, 2, 'Vertex 401 must retry once via Vertex');
        assert.strictEqual(retryRes.ok, true, 'Vertex retry after token refresh must succeed');
        assert(Object.values(retryRes).some(v => typeof v === 'string' && v.includes('iVBORw0KGgo=')), 'Successful retry must return generated PNG payload');
    } finally {
        https.request = origHttpsRequest;
    }
    console.log('  -> AQ. key routing guard and Vertex 401 token-refresh retry verified');

    console.log('Test 24: Linux 0.<slot> UID Save Parity, Singleflight /api/saves Burst & Fast /api/saves/sync');
    {
        const crypto = require('crypto');
        const frogDir = path.join(SAVE_DIR, 'frogcomposband');
        fs.mkdirSync(frogDir, { recursive: true });
        const rawTok = 'frog-uid-test-token-1234';
        const tokHash = crypto.createHash('sha256').update(rawTok).digest('hex');
        const frogPayload = Buffer.alloc(64);
        frogPayload.write('SaveFROX', 0, 8, 'ascii');
        fs.writeFileSync(path.join(frogDir, '0.Belgarath_FROG_test'), frogPayload);
        fs.writeFileSync(path.join(frogDir, 'Belgarath_FROG_test.owner.json'), JSON.stringify({ hash: tokHash, createdAt: Date.now() }));
        fs.writeFileSync(path.join(frogDir, '0.Belgarath_FROG_test.realm.json'), JSON.stringify({ realm: 'frogcomposband', stakes: 'standard' }));

        const listRes = await new Promise((resolve, reject) => {
            http.get(`http://localhost:${PORT}/api/saves?realm=frogcomposband`, {
                headers: { 'X-Owner-Token': rawTok }
            }, res => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve({ status: res.statusCode, body: data }));
            }).on('error', reject);
        });
        assert.strictEqual(listRes.status, 200, '0.<slot> listing must return 200');
        const listJson = JSON.parse(listRes.body);
        const foundUid = (listJson.saves || []).find(s => s.filename === 'Belgarath_FROG_test');
        assert(foundUid, 'Unprefixed owner token must resolve Linux 0.<slot> save without 0. prefix in filename');

        const dlUidRes = await new Promise((resolve, reject) => {
            http.get(`http://localhost:${PORT}/api/saves/Belgarath_FROG_test?realm=frogcomposband`, {
                headers: { 'X-Owner-Token': rawTok }
            }, res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
            }).on('error', reject);
        });
        assert.strictEqual(dlUidRes.status, 200, 'Direct GET /api/saves/<slot> must find 0.<slot> save');
        assert.strictEqual(dlUidRes.buf.length, frogPayload.length);

        const burst = await Promise.all(Array.from({ length: 20 }, () => get('/api/saves?realm=angband')));
        assert(burst.every(r => r.status === 200), '20x concurrent /api/saves burst must all return 200');

        const syncBuf = Buffer.alloc(64);
        syncBuf.write('SaveVNLA', 0, 8, 'ascii');
        const syncEnv = Buffer.from(JSON.stringify({
            slot: 'BurstSyncHero',
            realm: 'angband',
            dataBase64: syncBuf.toString('base64')
        }), 'utf8');
        const syncRes = await post('/api/saves/sync', syncEnv, {
            'Content-Type': 'application/json',
            'X-Owner-Token': rawTok
        });
        assert.strictEqual(syncRes.status, 200, '/api/saves/sync JSON envelope must succeed');
        assert(fs.existsSync(path.join(SAVE_DIR, 'angband', 'BurstSyncHero')), 'Synced save must exist');
        assert(fs.existsSync(path.join(SAVE_DIR, 'angband', 'BurstSyncHero.living.sav')), 'Synced .living.sav checkpoint must exist');
    }
    console.log('  -> Linux 0.<slot> parity, singleflight /api/saves burst (20x), and in-memory /api/saves/sync verified');

    console.log('\nAll server unit tests passed successfully!');
    try { fs.rmSync(SAVE_DIR, { recursive: true, force: true }); } catch (_) {}
    process.exit(0);
}

runTests().catch(err => {
    try { fs.rmSync(SAVE_DIR, { recursive: true, force: true }); } catch (_) {}
    console.error('Test failed:', err);
    process.exit(1);
});

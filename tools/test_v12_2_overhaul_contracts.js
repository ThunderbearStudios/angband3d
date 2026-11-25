#!/usr/bin/env node
'use strict';

/**
 * tools/test_v12_2_overhaul_contracts.js
 *
 * End-to-end contract & runtime regression suite for the v12.2.0 Overnight Overhaul
 * across Waves 0-6:
 *   - Wave 1: Brotli-11 precompression, deleted duplicate worker bundle, idle prewarm,
 *             zero-WebGL splash meniscus, and split-epoch Service Worker.
 *   - Wave 2: TerminalLexer 32-color + 0xe0 bg + box-drawing + prompt token hitboxes,
 *             Classic-First 80x24 dark-slate modal, no passive MenuRouter hijack,
 *             Left-Click tactical + Right-Click inspect + 'p'-step 3D targeting, eat:'E'.
 *   - Wave 3: Layer-1 clearDepth() viewmodel, singleton disposal guards, portrait frustum,
 *             and visDigest minimap memoization without frame.seq.
 *   - Wave 4: UniversalCartridge packIdx + visited floor persistence + diagonal corner LOS +
 *             seed threading, Beholder 6-ring compilation, YasdAutopsy camelCase flags,
 *             and CWE-598 header-only save-vault auth.
 *   - Wave 5: Gemini 3.8 Flash TTS + warm Edge narrator fallback, Gemini Nano Banana 2.1,
 *             spatial filter wiring, and demo.html safe-html hardening.
 *   - Wave 6: WEB-SCOTOPIC-02 anti-halation tokens, #pause-modal z-index 950, zero-blur HUD,
 *             44px coarse tap targets, 16px iOS zoom guard, and split PWA icon purposes.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ============================================================================
// 1. Wave 1: Precompression, Zero Duplicate Bundle, Prewarm & Zero-WebGL Vials
// ============================================================================
assert.ok(fs.existsSync(path.join(ROOT, 'tools/precompress_assets.js')), 'tools/precompress_assets.js must exist');
assert.strictEqual(
    fs.existsSync(path.join(ROOT, 'server/public/js/worker-cartridges.js')),
    false,
    'Duplicate 583KB server/public/js/worker-cartridges.js must stay removed'
);
assert.ok(
    fs.existsSync(path.join(ROOT, 'server/public/js/cartridges-worker-bundle.js')),
    'Canonical cartridges-worker-bundle.js must exist'
);

const d3dRawSize = fs.statSync(path.join(ROOT, 'server/public/js/dungeon3d.js')).size;
const d3dBrPath = path.join(ROOT, 'server/public/js/dungeon3d.js.br');
assert.ok(fs.existsSync(d3dBrPath), 'dungeon3d.js.br Brotli-11 sidecar must exist');
const d3dBrSize = fs.statSync(d3dBrPath).size;
assert.ok(d3dBrSize < d3dRawSize * 0.35, `dungeon3d.js.br (${d3dBrSize}B) must be <35% of raw (${d3dRawSize}B)`);

const localBridgeSrc = read('server/public/js/local_bridge.js');
const bootSrc = read('server/public/js/boot.js');
const appSrc = read('server/public/js/app.js');
assert.ok(localBridgeSrc.includes('static prewarm('), 'LocalGameBridge must implement static prewarm()');
assert.ok(bootSrc.includes('window.__assetUrl') && bootSrc.includes('window.__ASSET_V'), 'boot.js must initialize __ASSET_V and __assetUrl before subsystem load');
assert.ok(appSrc.includes('scheduleLocalPrewarm') && appSrc.includes('LocalGameBridge.prewarm'), 'app.js must schedule idle LocalGameBridge.prewarm on menu idle');

const swSrc = read('server/public/sw.js');
assert.ok(
    swSrc.includes('CACHE_NAME') && swSrc.includes('ASSET_CACHE'),
    'sw.js must isolate mutable shell CACHE_NAME from persistent ASSET_CACHE'
);

const splashSrc = read('server/public/js/splash-shader.js');
const vialBlock = splashSrc.slice(
    splashSrc.indexOf('function setupHudVialsWebGL'),
    splashSrc.indexOf('const REALM_EMBER_RGB')
);
assert.ok(vialBlock.includes('paintStaticVial2D'), 'HUD vials must use static 2D meniscus painting');
assert.strictEqual(
    vialBlock.includes('webgl') || vialBlock.includes('drawImage(vialCanvas'),
    false,
    'HUD vials in splash-shader.js must not allocate WebGL contexts or perform 20Hz GPU->CPU readback'
);

// ============================================================================
// 2. Wave 2: TerminalLexer Runtime, Slate Modal & Input Ergonomics
// ============================================================================
const TerminalLexer = require(path.join(ROOT, 'server/public/js/terminal-lexer.js'));
assert.strictEqual(TerminalLexer.PALETTE_32.length, 32, 'TerminalLexer must expose full 32-color Angband palette');
assert.strictEqual(TerminalLexer.PALETTE_32[0], '#14171d', 'Color 0 must be dark slate (#14171d), never pure #000000');

const hiCell = TerminalLexer.decodeCellAttr('3a14', 0);
const loCell = TerminalLexer.decodeCellAttr('3a14', 1);
assert.strictEqual(hiCell.fgIdx, 0x3a & 0x1f, 'decodeCellAttr must mask 5-bit foreground index (0..31)');
assert.strictEqual(hiCell.bgHighlight, true, 'decodeCellAttr must detect high-nibble selection highlight (val & 0xe0)');
assert.strictEqual(loCell.fgIdx, 0x14, 'decodeCellAttr must preserve colors 16..31 without 0x0f truncation');
assert.strictEqual(loCell.bgHighlight, false, 'decodeCellAttr must keep bgHighlight false when high nibble is 0');

assert.strictEqual(TerminalLexer.isBoxGlyph('┌'), true, 'isBoxGlyph must recognize single-line box corners');
assert.strictEqual(TerminalLexer.isBoxGlyph('═'), true, 'isBoxGlyph must recognize double-line box glyphs');
assert.strictEqual(TerminalLexer.isBoxGlyph('A'), false, 'isBoxGlyph must reject ASCII letters');

const lexTokens = TerminalLexer.extractInteractiveTokens('Attack townsperson? [y/n] --More-- [Esc] [/] [*] [?]');
const lexKeys = lexTokens.map((t) => t.key);
for (const expectedKey of ['y', 'n', 'space', 'escape', '/', '*', '?']) {
    assert.ok(lexKeys.includes(expectedKey), `TerminalLexer must extract interactive '${expectedKey}' token`);
}

const realmKeys = require(path.join(ROOT, 'server/public/js/realm-keys.js'));
assert.strictEqual(realmKeys.realmKey('eat', 'angband'), 'E', "Angband 'eat' verb must map to uppercase 'E', never colliding with 'e' (equip)");
assert.strictEqual(realmKeys.realmKey('equip', 'angband'), 'e', "Angband 'equip' verb must remain 'e'");

const inputSrc = read('server/public/js/input.js');
assert.ok(inputSrc.includes("contextmenu"), 'input.js must bind right-click contextmenu for contextual entity inspect');
assert.ok(
    inputSrc.includes("sendKey('p')") || inputSrc.includes('sendKey("p")') || inputSrc.includes("'p'"),
    "input.js must support free-cursor 'p' stepping for off-axis 3D targeting"
);

// ============================================================================
// 3. Wave 3: Layer-1 Viewmodel, Disposal Guards & Minimap Memoization
// ============================================================================
const d3dSrc = read('server/public/js/dungeon3d.js');
assert.ok(
    d3dSrc.includes('layers.set(1)') && d3dSrc.includes('clearDepth()'),
    'dungeon3d.js must render first-person viewmodel on Layer 1 after renderer.clearDepth() (zero depthTest toggles)'
);
assert.ok(
    d3dSrc.includes('resetSessionState'),
    'dungeon3d.js must implement resetSessionState scene cleanup'
);

const hudSrc = read('server/public/js/hud.js');
assert.ok(hudSrc.includes('visDigest'), 'hud.js minimap memoization must include visDigest');
assert.strictEqual(
    hudSrc.includes('${frame.seq}') && hudSrc.includes('_lastMinimapKey'),
    false,
    'hud.js must never include frame.seq in minimap memoization key'
);

// ============================================================================
// 4. Wave 4: Cartridges, Beholder, Floor Persistence, Autopsy & CWE-598
// ============================================================================
const pool = require(path.join(ROOT, 'server/public/js/realm-content-pool.js'));
const beholder = pool.HERO_ORIGINS && pool.HERO_ORIGINS.beholder;
assert.ok(beholder, 'HERO_ORIGINS must include playable Beholder monster avatar');
assert.strictEqual(beholder.ringSlots, 6, 'Beholder must grant 6 eyestalk ring slots');
assert.strictEqual(beholder.allowBodyArmor, false, 'Beholder must disallow standard torso body armor');

const RyodCompiler = require(path.join(ROOT, 'server/src/cartridges/ryod-compiler.js'));
const beholderSpec = RyodCompiler.compileEngineSpec({
    title: 'Eye of the Deep',
    heroOrigin: 'beholder',
    godMode: true
});
const compiledBeholder = beholderSpec.roles.find((r) => r.originId === 'beholder');
assert.ok(compiledBeholder, 'RyodCompiler.compileEngineSpec must compile Beholder without null-armor crash');
assert.strictEqual(compiledBeholder.armor, null, 'Compiled Beholder role must preserve null torso armor');
assert.strictEqual(compiledBeholder.ringSlots, 6, 'Compiled Beholder role must preserve 6 ring slots');

const os = require('os');
const { UniversalCartridgeEngine } = require(path.join(ROOT, 'server/src/cartridges/cartridge-core.js'));
const tmpSaveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasd-v122-test-'));
try {
    const cartSpec = RyodCompiler.compileEngineSpec({ title: 'Persistence Probe', hasTown: false, seed: 122026 });
    const cart = new UniversalCartridgeEngine(cartSpec, {
        saveDir: tmpSaveDir,
        user: 'ProbeHero',
        isNew: true,
        randomBirth: false,
        seed: 122026
    });
    assert.strictEqual(cart.state.phase, 'play', 'UniversalCartridgeEngine must start in play phase');
    const initialFrame = cart.buildFrame();
    assert.ok(initialFrame.seed, 'UniversalCartridgeEngine emitted frames must carry deterministic seed');
    const d1Feats = cart.state.map.map((row) => row.map((c) => c.feat));
    const startDepth = cart.state.depth;
    cart.generateLevel(startDepth + 1);
    cart.generateLevel(startDepth);
    const d1RestoredFeats = cart.state.map.map((row) => row.map((c) => c.feat));
    assert.deepStrictEqual(
        d1RestoredFeats,
        d1Feats,
        'UniversalCartridgeEngine must persist visited floor layouts across stair transitions'
    );
} finally {
    fs.rmSync(tmpSaveDir, { recursive: true, force: true });
}

const YasdAutopsy = require(path.join(ROOT, 'server/public/js/yasd-autopsy.js'));
YasdAutopsy._resetForTests();
const gapWithCamelFlags = YasdAutopsy.diagnoseMissingDefense(
    'paralyzed and slain by a Carrion Crawler',
    'You are paralyzed! Blinded and confused!',
    {},
    { freeAct: true, rConf: true, rBlind: true, holdLife: true, seeInvis: true }
);
assert.strictEqual(
    gapWithCamelFlags.includes('Free Action OFF') || gapWithCamelFlags.includes('rConf OFF') || gapWithCamelFlags.includes('rBlind OFF'),
    false,
    `YasdAutopsy must honor camelCase player flags without false-positives (got: ${gapWithCamelFlags})`
);

const saveVaultRoutesSrc = read('server/src/save-vault-routes.js');
const serverSrc = read('server/src/server.js');
assert.strictEqual(
    saveVaultRoutesSrc.includes("searchParams.get('token')") || saveVaultRoutesSrc.includes("searchParams.get('owner')"),
    false,
    'save-vault-routes.js must never accept ?token= or ?owner= URL query credentials (CWE-598)'
);
assert.strictEqual(
    serverSrc.includes("searchParams.get('token')"),
    false,
    'server.js must never accept ?token= URL query credentials (CWE-598)'
);

// ============================================================================
// 5. Wave 5: Gemini 3.8 TTS + Edge Fallback, Spatial Filter & Demo Hardening
// ============================================================================
assert.ok(serverSrc.includes('gemini-3.8-flash-tts'), 'server.js must prioritize gemini-3.8-flash-tts');
assert.ok(serverSrc.includes('gemini-nano-banana-2.1'), 'server.js must prioritize gemini-nano-banana-2.1 for sketches');

const audioSrc = read('server/public/js/audio.js');
assert.ok(
    audioSrc.includes('panner._filter || panner') && audioSrc.includes('panner._filter.disconnect()'),
    'audio.js playBuffer must wire panner._filter into the spatial chain and disconnect it on end'
);

const demoHtmlSrc = read('server/public/demo.html');
assert.ok(demoHtmlSrc.includes('/js/safe-html.js'), 'demo.html must load safe-html.js before demo-player.js');

// ============================================================================
// 6. Wave 6: CSS Cascade Layers, Z-Index Stack, Mobile A11y & Split PWA Icons
// ============================================================================
const tokensCssSrc = read('server/public/css/tokens.css');
assert.ok(tokensCssSrc.includes('@layer reset, tokens, base, layout, components, hud, modals, overrides;'), 'tokens.css must declare 8-layer @layer order');
assert.ok(tokensCssSrc.includes('#terminal-container.in-game-modal'), 'tokens.css must style #terminal-container.in-game-modal');
assert.ok(tokensCssSrc.includes('#app-container > #pause-modal') && tokensCssSrc.includes('z-index: 950'), 'tokens.css must lift #pause-modal to z-index 950');
assert.ok(tokensCssSrc.includes('min-height: 44px') && tokensCssSrc.includes('font-size: max(16px, 1rem)'), 'tokens.css must enforce 44px coarse tap targets and 16px iOS zoom guard');

const pwaManifest = JSON.parse(read('server/public/manifest.json'));
assert.ok(Array.isArray(pwaManifest.icons) && pwaManifest.icons.length >= 4, 'manifest.json must declare split icons');
assert.strictEqual(
    pwaManifest.icons.some((ic) => ic.purpose === 'any maskable'),
    false,
    'manifest.json must not combine "any maskable" on a single icon entry (PWA-MANIFEST-01)'
);
assert.ok(
    pwaManifest.icons.some((ic) => ic.purpose === 'any') && pwaManifest.icons.some((ic) => ic.purpose === 'maskable'),
    'manifest.json must provide separate "any" and "maskable" icon entries'
);

// ============================================================================
// 7. v12.2.1 Hotfix Contracts: Layer-0 Color Preservation, Non-Cancelling Gate & Narrator Deferral
// ============================================================================
const animPassBlock = d3dSrc.slice(
    d3dSrc.indexOf('this.camera.layers.set(1)') - 520,
    d3dSrc.indexOf('this.camera.layers.set(1)') + 320
);
assert.ok(
    animPassBlock.includes('this.scene.background = null') && animPassBlock.includes('this.scene.background = prevBg'),
    'dungeon3d.js Layer-1 viewmodel pass must null scene.background during Pass 2 so Three.js r128 WebGLBackground never wipes Layer-0 world geometry'
);

const awaitAssetsBlock = d3dSrc.slice(
    d3dSrc.indexOf('async awaitSceneAssetsReady('),
    d3dSrc.indexOf('async awaitSceneAssetsReady(') + 700
);
assert.ok(
    awaitAssetsBlock.indexOf('await yieldFrame()') > 0 &&
    awaitAssetsBlock.indexOf('await yieldFrame()') < awaitAssetsBlock.indexOf('this.ensureGpuInitialized('),
    'awaitSceneAssetsReady must yield a paint tick via setTimeout before synchronous ensureGpuInitialized()'
);
assert.strictEqual(
    awaitAssetsBlock.includes('requestAnimationFrame'),
    false,
    'awaitSceneAssetsReady yieldFrame must use setTimeout rather than requestAnimationFrame so throttled tabs never stall at 96%'
);

assert.ok(
    appSrc.includes('curtainCurrentlyVisible && !sceneAssetGateInFlight') && appSrc.includes('sceneAssetGateFailsafe'),
    'app.js must guard in-flight asset gates against multi-frame self-cancellation (NetHack -more- startup race)'
);
const startGameBlock = appSrc.slice(
    appSrc.indexOf('async function startGame('),
    appSrc.indexOf('async function startGame(') + 1200
);
assert.strictEqual(
    startGameBlock.includes('ensureGpuInitialized('),
    false,
    'startGame must paint #loading-overlay immediately without blocking on synchronous ensureGpuInitialized()'
);

const chronicleMgrSrc = read('server/public/js/chronicle/chronicle-manager.js');
assert.ok(
    chronicleMgrSrc.includes('window.gameSceneAssetsLoading') && appSrc.includes('!window.gameSceneAssetsLoading && window.chronicleManager'),
    'Chronicle narration must stay deferred while #loading-overlay / gameSceneAssetsLoading is active'
);

console.log('[PASS] test_v12_2_overhaul_contracts.js: Waves 1-7 runtime, rendering & loading contracts verified.');

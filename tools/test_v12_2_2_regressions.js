#!/usr/bin/env node
/**
 * tools/test_v12_2_2_regressions.js
 *
 * Regression gate for v12.2.2 Multi-Realm Stability, Audio Popover Hoist,
 * 2-Column Main Menu Launcher, Hengband Quick-Birth & TTS Cooldown.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

console.log('--- v12.2.2 Regression Gate ---');

// 1. GameNetwork Disposal & InputController Live Network Sync
{
    const noop = () => {};
    const mkEl = () => ({
        classList: { toggle: noop, add: noop, remove: noop, contains: () => true },
        style: {},
        addEventListener: noop,
        removeEventListener: noop,
        setAttribute: noop,
        getAttribute: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
    });
    const sandbox = {
        console,
        Date,
        Math,
        JSON,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URLSearchParams,
        navigator: { userAgent: 'node-test' },
        localStorage: {
            getItem: () => null,
            setItem: noop,
            removeItem: noop
        },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: noop,
            body: mkEl()
        },
        location: { protocol: 'http:', host: 'localhost:8080', hostname: 'localhost', pathname: '/' },
        WebSocket: function FakeWs() {}
    };
    sandbox.window = sandbox;
    sandbox.window.addEventListener = noop;
    sandbox.window.__app = {};
    sandbox.WebSocket.OPEN = 1;
    sandbox.WebSocket.CONNECTING = 0;

    vm.createContext(sandbox);
    vm.runInContext(readText('server/public/js/network.js'), sandbox);
    vm.runInContext(readText('server/public/js/input.js'), sandbox);

    const net1 = new sandbox.GameNetwork();
    const net2 = { sendKey: () => true, sendCommand: () => true, disconnect: noop };
    sandbox.window.__app.network = net1;

    const input = new sandbox.InputController(net1, null, null, null, noop);
    assert.strictEqual(input.network, net1, 'Initial input.network matches net1');

    let connectCalls = 0;
    net1.connect = () => { connectCalls++; };
    net1.disconnect();
    assert.strictEqual(net1.disposed, true, 'GameNetwork.disconnect() marks disposed=true');
    assert.strictEqual(net1.ensureConnected(), false, 'Disposed GameNetwork.ensureConnected() returns false');
    assert.strictEqual(net1.sendKey('8'), false, 'Disposed GameNetwork.sendKey() returns false');
    assert.strictEqual(connectCalls, 0, 'Disposed GameNetwork never triggers reconnect');

    sandbox.window.__app.network = net2;
    assert.strictEqual(input.network, net2, 'InputController dynamically resolves active window.__app.network');
    console.log('ok    1. GameNetwork disposal + InputController dynamic network sync');
}

// 2. App.js & Dungeon3D.js 96% Asset Gate Settlement Guard & SetEngineMode Sync
{
    const appJs = readText('server/public/js/app.js');
    const dungeonJs = readText('server/public/js/dungeon3d.js');
    const swJs = readText('server/public/sw.js');

    assert.ok(appJs.includes('let gateSettled = false;'), 'app.js declares gateSettled in needsAssetGate');
    assert.ok(appJs.includes('gateSettled = true;') && appJs.includes('++sceneAssetGateSeq;'), 'finishAssetGate marks gateSettled and bumps sceneAssetGateSeq');
    assert.ok(appJs.includes('if (gateSettled || !sceneAssetGateInFlight || gateToken !== sceneAssetGateSeq) return;'), 'onProgress ignores late tier1 updates after gate settlement');
    assert.ok(dungeonJs.includes('let gateDone = false;') && dungeonJs.includes('if (!gateDone && typeof onProgress === \'function\')'), 'dungeon3d.js guards late post-timeout progress callbacks');
    assert.ok(appJs.includes('if (typeof input !== \'undefined\' && input) {\n            input.network = network;'), 'setEngineMode syncs input.network');
    assert.ok(swJs.includes("cache: isNav ? 'no-store' : 'no-cache'"), 'sw.js bypasses disk cache cleanly for HTML navigations');
    console.log('ok    2. 96% Asset Gate settle guard + SW navigation no-store + setEngineMode sync');
}

// 3. Hengband Quick-Birth Guards (-続く-, 何かキーを押して, *) / (a-X), stall breaker, curtain hide)
{
    const appJs = readText('server/public/js/app.js');
    assert.ok(appJs.includes("screenText.includes('-続く-')"), 'stepQuickBirth recognizes Japanese -more- (-続く-)');
    assert.ok(appJs.includes("screenText.includes('何かキーを押して')"), 'stepQuickBirth recognizes Japanese press any key');
    assert.ok(appJs.includes("rawText.includes('*)')") && appJs.includes("rawText.match(/\\(([a-z])-([a-z])\\)/i)"), 'stepQuickBirth clamps Hengband magic realm selection');
    assert.ok(appJs.includes('quickBirthStallCount >= 2'), 'stepQuickBirth includes stall-breaker key rotation');
    assert.ok(appJs.includes('if (++quickBirthStep > 120) {\n            quickBirthActive = false;\n            lastQuickBirthSig = \'\';\n            quickBirthStallCount = 0;\n            forceTerminal = true;\n            setLoadingCurtain(false);'), 'stepQuickBirth clears loading curtain on max-step fallback');
    console.log('ok    3. Hengband Quick-Birth Japanese & stall-breaker guards');
}

// 4. Audio Popover Hoist & Z-Index + 2-Column Main Menu Structural Contract
{
    const html = readText('server/public/index.html');
    const css = readText('server/public/css/dungeon.css');

    const topRightStart = html.indexOf('<div id="top-right-bar">');
    const topRightEnd = html.indexOf('<div id="minimap-container"');
    const topRightSlice = html.slice(topRightStart, topRightEnd);
    assert.ok(!topRightSlice.includes('id="quick-volume-popover"'), '#quick-volume-popover must be hoisted out of #top-right-bar');
    assert.ok(html.includes('id="quick-volume-popover"'), '#quick-volume-popover exists in index.html');
    assert.ok(css.includes('z-index: 10060;'), '.quick-volume-popover has z-index >= 10060');

    assert.ok(html.includes('id="btn-menu-audio-settings"'), 'Main Menu includes #btn-menu-audio-settings');
    assert.ok(html.includes('id="menu-realm-hero-art"'), 'Main Menu includes #menu-realm-hero-art dossier banner');
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod']) {
        assert.ok(html.includes(`data-switch-realm="${r}"`), `Main Menu renders realm card for ${r}`);
    }
    assert.ok(!css.includes('.main-menu-realm-pills, #main-menu-ryod-feature-row { display: none !important; }'), 'Visual realm pills grid is no longer hidden');
    console.log('ok    4. Audio popover hoist + 2-column 9-realm Main Menu structure');
}

// 5. Server & Client Edge TTS 403 Circuit Breaker + In-Flight Socket Guard
{
    const serverJs = readText('server/src/server.js');
    const caJs = readText('server/public/js/chronicle/chronicle-audio.js');

    assert.ok(serverJs.includes('if (entry && entry.initPromise) {\n        return entry.initPromise;'), 'getWarmEdgeTTS reuses in-flight handshake promise');
    assert.ok(serverJs.includes("'X-TTS-Unavailable': '1'") && serverJs.includes('edgeTtsCooldownUntil'), 'server.js sets Edge TTS cooldown & X-TTS-Unavailable header');
    assert.ok(caJs.includes('_serverTtsUnavailableUntil') && caJs.includes("x-tts-unavailable"), 'chronicle-audio.js respects X-TTS-Unavailable cooldown');
    console.log('ok    5. Server & client Edge TTS cooldown circuit breaker');
}

console.log('\nAll v12.2.2 regression checks PASSED.');

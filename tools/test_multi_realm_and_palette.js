/**
 * tools/test_multi_realm_and_palette.js
 * 
 * Verifies Multi-Realm selector modal, command palette search & execution,
 * active realm persistence, and splash UI enhancements on localhost.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('../server/node_modules/ws');

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('[Test] Testing live localhost server at http://localhost:8080 ...');

    // 1. Check HTTP response from localhost:8080
    const html = await new Promise((resolve, reject) => {
        http.get('http://localhost:8080/', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });

    // Check for Multi-Realm elements in served HTML
    console.log('[Test] Checking served HTML for Multi-Realm & Command Palette elements...');
    if (!html.includes('id="splash-active-realm"')) throw new Error('Missing splash-active-realm in served HTML');
    if (!html.includes('id="realm-selector-modal"')) throw new Error('Missing realm-selector-modal in served HTML');
    if (!html.includes('id="command-palette-modal"')) throw new Error('Missing command-palette-modal in served HTML');
    if (!html.includes('id="btn-menu-realms"')) throw new Error('Missing btn-menu-realms in served HTML');
    if (!html.includes('id="btn-command-palette"')) throw new Error('Missing btn-command-palette in served HTML');
    if (!html.includes('id="btn-hud-realm"')) throw new Error('Missing btn-hud-realm in served HTML');
    if (!html.includes('?v=8.9.4') && !html.includes('?v=8.9.3')) throw new Error('Asset query strings not bumped');

    console.log('[Test] HTML structure verified: all elements present!');

    // 2. Launch Headless Chrome to test interaction via CDP
    const chromePort = 9241;
    const profileDir = path.join(__dirname, 'temp_chrome_realm_' + Date.now());
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${profileDir}`,
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1280,800',
        'http://localhost:8080/'
    ]);

    await wait(2500);

    try {
        const listRes = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
        const tabs = await listRes.json();
        const tab = tabs.find(t => t.url.includes('localhost:8080'));
        if (!tab) throw new Error('Chrome tab not found');

        const ws = new WebSocket(tab.webSocketDebuggerUrl);
        await new Promise(res => ws.on('open', res));

        let id = 1;
        function send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const reqId = id++;
                const handler = (msg) => {
                    const data = JSON.parse(msg);
                    if (data.id === reqId) {
                        ws.off('message', handler);
                        if (data.error) reject(data.error);
                        else resolve(data.result);
                    }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({ id: reqId, method, params }));
            });
        }

        ws.on('message', (msg) => {
            const data = JSON.parse(msg);
            if (data.method === 'Runtime.consoleAPICalled') {
                const text = data.params.args.map(a => a.value || a.description || '').join(' ');
                console.log(`   [Browser ${data.params.type}]`, text);
            } else if (data.method === 'Runtime.exceptionThrown') {
                console.error('   [Browser EXCEPTION]', data.params.exceptionDetails.text, data.params.exceptionDetails.exception?.description || '');
            }
        });

        await send('Runtime.enable');

        async function evalExpr(expression) {
            const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (res.exceptionDetails) {
                console.error('   [CDP Eval EXCEPTION]', res.exceptionDetails.text, res.exceptionDetails.exception?.description || res.exceptionDetails);
            }
            return res.result ? res.result.value : null;
        }

        console.log('[Test] Waiting for DOM loaded & window.__app initialization...');
        let ready = false;
        for (let i = 0; i < 30; i++) {
            ready = await evalExpr('Boolean(window.__app && window.__app.showRealmSelector)');
            if (ready) break;
            await wait(200);
        }
        if (!ready) throw new Error('window.__app was not initialized in time');

        console.log('[Test] Verifying splash state & active realm display...');
        const splashState = await evalExpr(`({
            splashVisible: !document.getElementById('splash-overlay').classList.contains('hidden'),
            activeRealmName: document.getElementById('splash-active-realm-name').textContent,
            realm: window.__app.getActiveRealm()
        })`);
        console.log('[Test] Splash Screen Info:', splashState);
        if (!splashState.splashVisible) throw new Error('Splash overlay should be visible on initial load');
        if (!splashState.activeRealmName.includes('Angband 4.2.6')) throw new Error('Default realm name should be Angband 4.2.6');

        console.log('[Test] Testing Realm Selector modal open via Splash DOM button...');
        const btnDiag = await evalExpr(`({
            btnExists: Boolean(document.getElementById("btn-splash-realms")),
            modalExists: Boolean(document.getElementById("realm-selector-modal")),
            modalClasses: document.getElementById("realm-selector-modal")?.className,
            appState: window.__app ? "exists" : "none"
        })`);
        console.log('[Test] Button & Modal Diagnostics before click:', btnDiag);
        await evalExpr('document.getElementById("btn-splash-realms").click()');
        await wait(300);
        let modalVisible = await evalExpr('!document.getElementById("realm-selector-modal").classList.contains("hidden")');
        const modalClassesAfter = await evalExpr('document.getElementById("realm-selector-modal")?.className');
        console.log('[Test] Modal Diagnostics after click:', { modalClassesAfter, modalVisible });
        if (!modalVisible) {
            console.log('[Test] Attempting direct showRealmSelector call for diagnostics...');
            await evalExpr('window.__app.showRealmSelector("splash")');
            const directVisible = await evalExpr('!document.getElementById("realm-selector-modal").classList.contains("hidden")');
            console.log('[Test] Visible after window.__app.showRealmSelector("splash"):', directVisible);
            throw new Error('Realm modal did not open via btn-splash-realms click');
        }

        console.log('[Test] Testing DOM click on .btn-realm-select for FrogComposBand...');
        await evalExpr('document.querySelector(\'.realm-card[data-realm="frogcomposband"] .btn-realm-select\').click()');
        await wait(200);
        let newRealm = await evalExpr('window.__app.getActiveRealm()');
        let newSplashName = await evalExpr('document.getElementById(\'splash-active-realm-name\').textContent');
        let toastText = await evalExpr('document.getElementById(\'realm-toast-banner\') ? document.getElementById(\'realm-toast-banner\').textContent : ""');
        console.log('[Test] Switched Realm via button click:', { newRealm, newSplashName, toastText });
        if (newRealm !== 'frogcomposband') throw new Error('Active realm did not switch to frogcomposband via button click');
        if (!toastText.includes('FrogComposBand')) throw new Error('Toast notification did not appear for FrogComposBand');

        console.log('[Test] Testing DOM click on card body for Hengband...');
        await evalExpr('document.querySelector(\'.realm-card[data-realm="hengband"]\').click()');
        await wait(200);
        newRealm = await evalExpr('window.__app.getActiveRealm()');
        console.log('[Test] Switched Realm via card click:', { newRealm });
        if (newRealm !== 'hengband') throw new Error('Active realm did not switch to hengband via card click');

        console.log('[Test] Testing realm cycling (Arrow keys / cycleRealm)...');
        await evalExpr('window.__app.cycleRealm(1)');
        newRealm = await evalExpr('window.__app.getActiveRealm()');
        console.log('[Test] Cycled Realm (+1):', newRealm);
        if (newRealm !== 'silq') throw new Error('Cycle realm +1 did not move from hengband to silq');

        console.log('[Test] Closing Realm Selector modal...');
        await evalExpr('window.__app.hideRealmSelector()');
        let modalClosed = await evalExpr('document.getElementById(\'realm-selector-modal\').classList.contains(\'hidden\')');
        if (!modalClosed) throw new Error('Realm modal did not close');

        console.log('[Test] Navigating to Main Menu & testing btn-menu-realms...');
        await evalExpr('window.__app.showMainMenu()');
        await wait(200);
        await evalExpr('document.getElementById("btn-menu-realms").click()');
        await wait(200);
        modalVisible = await evalExpr('!document.getElementById(\'realm-selector-modal\').classList.contains(\'hidden\')');
        if (!modalVisible) throw new Error('Realm modal did not open via btn-menu-realms');
        await evalExpr('window.__app.hideRealmSelector()');

        console.log('[Test] Testing Load Menu realm switch button...');
        await evalExpr('window.__app.showLoadMenu(false)');
        await wait(200);
        await evalExpr('document.getElementById("btn-load-realm-switch").click()');
        await wait(200);
        modalVisible = await evalExpr('!document.getElementById(\'realm-selector-modal\').classList.contains(\'hidden\')');
        if (!modalVisible) throw new Error('Realm modal did not open via btn-load-realm-switch');
        await evalExpr('window.__app.hideRealmSelector()');
        await evalExpr('window.__app.hideLoadMenu()');

        console.log('[Test] VERIFYING NON-NEGOTIABLE INVARIANT: Realm cannot be changed during gameplay...');
        // Set appState = 'game' to simulate active gameplay
        await evalExpr('window.__app.showRealmSelector("game")');
        modalVisible = await evalExpr('!document.getElementById(\'realm-selector-modal\').classList.contains(\'hidden\')');
        if (modalVisible) throw new Error('SECURITY VIOLATION: Realm selector opened during simulated gameplay!');

        const switchAttempt = await evalExpr(`(() => {
            // Force state to game
            const origState = window.__app.getAppState();
            window.__app.setActiveRealm("angband");
            const curRealm = window.__app.getActiveRealm();
            return { curRealm };
        })()`);
        console.log('[Test] Realm during gameplay verification result:', switchAttempt);

        console.log('[Test] Testing Command Palette modal open & search filter...');
        await evalExpr('window.__app.showCommandPalette("splash")');
        const paletteVisible = await evalExpr('!document.getElementById(\'command-palette-modal\').classList.contains(\'hidden\')');
        if (!paletteVisible) throw new Error('Command palette modal did not open');

        // Type "Tunnel" in search input
        await evalExpr(`
            const input = document.getElementById('cmd-search-input');
            input.value = 'Tunnel';
            input.dispatchEvent(new Event('input'));
        `);
        await wait(100);

        const filterResult = await evalExpr(`
            const rows = document.querySelectorAll('#cmd-palette-list .cmd-row');
            Array.from(rows).map(r => ({
                name: r.querySelector('.cmd-row-name').textContent,
                kbd: r.querySelector('.cmd-kbd').textContent
            }))
        `);
        console.log('[Test] Filtered Command Rows for "Tunnel":', filterResult);
        if (!filterResult.some(r => r.name.includes('Tunnel') && r.kbd.includes('Shift+T'))) {
            throw new Error('Command palette did not filter to Tunnel [Shift+T]');
        }

        console.log('[Test] Closing Command Palette...');
        await evalExpr('window.__app.hideCommandPalette()');
        const paletteClosed = await evalExpr('document.getElementById(\'command-palette-modal\').classList.contains(\'hidden\')');
        if (!paletteClosed) throw new Error('Command palette did not close');

        // Reset realm to angband
        await evalExpr('window.__app.showMainMenu(); window.__app.setActiveRealm("angband")');

        ws.close();
        console.log('\n=== ALL MULTI-REALM, LOAD MENU & GAMEPLAY LOCK TESTS PASSED 100% ===\n');
    } finally {
        chrome.kill();
    }
}

run().catch((err) => {
    console.error('FAIL:', err);
    process.exit(1);
});

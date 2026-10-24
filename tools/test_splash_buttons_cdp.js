const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    console.log('Testing all splash screen buttons via Headless Chrome CDP...');
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--remote-debugging-port=9222',
        '--headless=new',
        '--disable-gpu',
        '--user-data-dir=' + path.resolve('.chrome-debug-profile-splash'),
        'http://localhost:8080'
    ]);

    let tabs = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            tabs = await getJson('http://127.0.0.1:9222/json');
            if (tabs && tabs.length > 0) break;
        } catch (_) {}
    }

    if (!tabs || !tabs[0]) {
        console.error('Could not connect to Chrome debugging port.');
        chrome.kill();
        process.exit(1);
    }

    const tab = tabs.find(t => t.url.includes('8080')) || tabs[0];
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();
    const exceptions = [];

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            callbacks.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    ws.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.id && callbacks.has(msg.id)) {
            const { resolve, reject } = callbacks.get(msg.id);
            callbacks.delete(msg.id);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            exceptions.push(msg.params.exceptionDetails);
            console.error('[UNCAUGHT EXCEPTION]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
        }
    });

    await new Promise(resolve => ws.on('open', resolve));
    await send('Runtime.enable');
    await send('Page.enable');

    console.log('Waiting 2 seconds for DOM...');
    await new Promise(r => setTimeout(r, 2000));

    // 1. Initial State Check (Zero-Button Splash Billboard)
    const initial = (await send('Runtime.evaluate', {
        expression: `({
            appState: window.__app.getAppState(),
            activeRealm: window.__app.getActiveRealm(),
            splashVisible: !document.getElementById('splash-overlay').classList.contains('hidden'),
            menuVisible: !document.getElementById('main-menu-overlay').classList.contains('hidden'),
            splashButtonsCount: document.querySelectorAll('#splash-overlay button').length
        })`,
        returnByValue: true
    })).result.value;
    console.log('1. Initial State:', initial);
    if (initial.appState !== 'splash' || !initial.splashVisible) {
        throw new Error('Initial state is not splash!');
    }
    if (initial.splashButtonsCount !== 0) {
        throw new Error(`Expected 0 buttons on splash billboard, found ${initial.splashButtonsCount}!`);
    }

    // 2. Click anywhere on #splash-overlay -> transitions to Main Menu
    console.log('2. Clicking #splash-overlay to enter Main Menu...');
    const startRes = (await send('Runtime.evaluate', {
        expression: `(() => {
            const splash = document.getElementById('splash-overlay');
            if (!splash) return 'splash-overlay not found';
            splash.click();
            return {
                appState: window.__app.getAppState(),
                splashVisible: ! splash.classList.contains('hidden'),
                menuVisible: !document.getElementById('main-menu-overlay').classList.contains('hidden')
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('   Result:', startRes);
    if (startRes.appState !== 'mainMenu' || !startRes.menuVisible || startRes.splashVisible) {
        throw new Error('#splash-overlay click failed to transition to mainMenu!');
    }

    // 3. Test #main-menu-realm-select dropdown on Main Menu
    const realms = ['frogcomposband', 'hengband', 'silq', 'angband'];
    for (const r of realms) {
        console.log(`3. Selecting realm via #main-menu-realm-select: ${r}`);
        const selRes = (await send('Runtime.evaluate', {
            expression: `(() => {
                const sel = document.getElementById('main-menu-realm-select');
                if (!sel) return 'select not found';
                sel.value = '${r}';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                const langWrap = document.getElementById('main-menu-hengband-lang-wrap');
                return {
                    activeRealm: window.__app.getActiveRealm(),
                    selectValue: sel.value,
                    tagline: document.getElementById('main-menu-realm-tagline')?.textContent,
                    hengLangVisible: langWrap ? !langWrap.classList.contains('hidden') : false
                };
            })()`,
            returnByValue: true
        })).result.value;
        console.log(`   Result:`, selRes);
        if (selRes.activeRealm !== r) {
            throw new Error(`Main Menu realm dropdown failed for ${r}: got ${selRes.activeRealm}`);
        }
        if (r === 'hengband' && !selRes.hengLangVisible) {
            throw new Error('Expected #main-menu-hengband-lang-wrap to be visible for hengband!');
        }
    }

    // 4. Test #btn-menu-realms -> opens Realm Comparison modal
    console.log('4. Clicking #btn-menu-realms...');
    const realmModalRes = (await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('btn-menu-realms');
            if (!btn) return 'btn-menu-realms not found';
            btn.click();
            return {
                appState: window.__app.getAppState(),
                modalVisible: !document.getElementById('realm-modal').classList.contains('hidden')
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('   Result:', realmModalRes);
    if (realmModalRes.appState !== 'realmSelect' || !realmModalRes.modalVisible) {
        throw new Error('#btn-menu-realms failed to open realm comparison modal!');
    }

    // Close realm modal back to Main Menu
    await send('Runtime.evaluate', { expression: `document.getElementById('btn-realm-modal-close')?.click()` });
    await new Promise(r => setTimeout(r, 300));

    // 6. Test Quick Start from Main Menu
    console.log('6. Clicking Quick Start (Random Hero) from Main Menu...');
    await send('Runtime.evaluate', {
        expression: `document.getElementById('btn-menu-random')?.click()`
    });
    await new Promise(r => setTimeout(r, 2000));

    const finalState = (await send('Runtime.evaluate', {
        expression: `({
            appState: window.__app.getAppState(),
            inPlay: window.__app.inPlay,
            exceptionsCount: ${exceptions.length}
        })`,
        returnByValue: true
    })).result.value;
    console.log('   Final State:', finalState);

    if (exceptions.length > 0) {
        throw new Error(`Encountered ${exceptions.length} browser exceptions during test!`);
    }

    console.log('\n=============================================');
    console.log('SUCCESS: All splash screen buttons verified responsive!');
    console.log('=============================================\n');

    ws.close();
    chrome.kill();
    process.exit(0);
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

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

    // 1. Initial State Check
    const initial = (await send('Runtime.evaluate', {
        expression: `({
            appState: window.__app.getAppState(),
            activeRealm: window.__app.getActiveRealm(),
            splashVisible: !document.getElementById('splash-overlay').classList.contains('hidden'),
            menuVisible: !document.getElementById('main-menu-overlay').classList.contains('hidden')
        })`,
        returnByValue: true
    })).result.value;
    console.log('1. Initial State:', initial);
    if (initial.appState !== 'splash' || !initial.splashVisible) {
        throw new Error('Initial state is not splash!');
    }

    // 2. Click Realm Cards on Splash Screen
    const realms = ['frogcomposband', 'hengband', 'silq', 'angband'];
    for (const r of realms) {
        console.log(`2. Clicking realm card for: ${r}`);
        const cardRes = (await send('Runtime.evaluate', {
            expression: `(() => {
                const card = document.querySelector('.splash-realm-card[data-realm="${r}"]');
                if (!card) return 'card not found';
                card.click();
                return {
                    activeRealm: window.__app.getActiveRealm(),
                    cardActive: card.classList.contains('active'),
                    ctaRealmName: document.getElementById('splash-cta-realm-name')?.textContent
                };
            })()`,
            returnByValue: true
        })).result.value;
        console.log(`   Result:`, cardRes);
        if (cardRes.activeRealm !== r) {
            throw new Error(`Realm card click failed for ${r}: got ${cardRes.activeRealm}`);
        }
    }

    // 3. Test #btn-splash-guide -> opens Guide modal
    console.log('3. Clicking #btn-splash-guide...');
    const guideRes = (await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('btn-splash-guide');
            if (!btn) return 'btn-splash-guide not found';
            btn.click();
            return {
                appState: window.__app.getAppState(),
                guideVisible: !document.getElementById('guide-modal').classList.contains('hidden')
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('   Result:', guideRes);
    if (guideRes.appState !== 'guide' || !guideRes.guideVisible) {
        throw new Error('#btn-splash-guide failed to open guide modal!');
    }

    // Close guide modal
    await send('Runtime.evaluate', { expression: `window.__app.hideGuide()` });
    await new Promise(r => setTimeout(r, 400));

    // 4. Test #btn-splash-demo -> opens Demo modal
    console.log('4. Clicking #btn-splash-demo...');
    const demoRes = (await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('btn-splash-demo');
            if (!btn) return 'btn-splash-demo not found';
            btn.click();
            return {
                appState: window.__app.getAppState(),
                demoVisible: !document.getElementById('demo-modal').classList.contains('hidden')
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('   Result:', demoRes);
    if (demoRes.appState !== 'demoModal' || !demoRes.demoVisible) {
        throw new Error('#btn-splash-demo failed to open demo modal!');
    }

    // Close demo modal
    await send('Runtime.evaluate', { expression: `window.__app.hideDemoModal()` });
    await new Promise(r => setTimeout(r, 400));

    // 5. Test #btn-splash-start -> enters Main Menu
    console.log('5. Clicking #btn-splash-start...');
    const startRes = (await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('btn-splash-start');
            if (!btn) return 'btn-splash-start not found';
            btn.click();
            return {
                appState: window.__app.getAppState(),
                splashVisible: !document.getElementById('splash-overlay').classList.contains('hidden'),
                menuVisible: !document.getElementById('main-menu-overlay').classList.contains('hidden')
            };
        })()`,
        returnByValue: true
    })).result.value;
    console.log('   Result:', startRes);
    if (startRes.appState !== 'mainMenu' || !startRes.menuVisible || startRes.splashVisible) {
        throw new Error('#btn-splash-start failed to transition to mainMenu!');
    }

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

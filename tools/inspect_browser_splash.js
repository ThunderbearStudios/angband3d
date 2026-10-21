const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
    console.log('Launching headless Chrome with CDP...');
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a3d-chrome-'));
    process.on('exit', () => {
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--remote-debugging-port=9222',
        '--headless=new',
        '--disable-gpu',
        '--user-data-dir=' + profileDir,
        'http://localhost:8080'
    ]);

    chrome.stderr.on('data', d => console.error('[CHROME STDERR]', d.toString()));
    chrome.stdout.on('data', d => console.log('[CHROME STDOUT]', d.toString()));

    // wait for port 9222
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
    console.log('Target tab found:', tab.title, tab.url);

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();

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
            console.error('\n[BROWSER EXCEPTION]', JSON.stringify(msg.params.exceptionDetails, null, 2));
        } else if (msg.method === 'Runtime.consoleAPICalled') {
            console.log(`[BROWSER CONSOLE ${msg.params.type}]`, ...msg.params.args.map(a => a.value || a.description));
        }
    });

    await new Promise(resolve => ws.on('open', resolve));
    console.log('Connected to CDP WebSocket.');

    await send('Runtime.enable');
    await send('Console.enable');
    await send('Page.enable');

    console.log('Waiting 3 seconds for page initialization...');
    await new Promise(r => setTimeout(r, 3000));

    // Check page state
    const evalRes = await send('Runtime.evaluate', {
        expression: `({
            hasApp: !!window.__app,
            appState: window.__app ? window.__app.getAppState() : 'no __app',
            splashHidden: document.getElementById('splash-overlay') ? document.getElementById('splash-overlay').classList.contains('hidden') : 'no splash',
            splashDisplay: document.getElementById('splash-overlay') ? window.getComputedStyle(document.getElementById('splash-overlay')).display : 'none',
            mainMenuHidden: document.getElementById('main-menu-overlay') ? document.getElementById('main-menu-overlay').classList.contains('hidden') : 'no menu',
            mainMenuDisplay: document.getElementById('main-menu-overlay') ? window.getComputedStyle(document.getElementById('main-menu-overlay')).display : 'none',
            btnStart: !!document.getElementById('btn-splash-start')
        })`,
        returnByValue: true
    });
    console.log('Page State Check:', evalRes.result.value);

    // Try clicking #btn-splash-start
    console.log('\nSimulating click on #btn-splash-start...');
    const clickRes = await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('btn-splash-start');
            if (btn) {
                btn.click();
                return 'clicked #btn-splash-start';
            }
            return 'button not found';
        })()`,
        returnByValue: true
    });
    console.log('Click result:', clickRes.result.value);

    await new Promise(r => setTimeout(r, 1000));

    // Check page state again
    const evalRes2 = await send('Runtime.evaluate', {
        expression: `({
            appState: window.__app ? window.__app.getAppState() : 'no __app',
            splashHidden: document.getElementById('splash-overlay') ? document.getElementById('splash-overlay').classList.contains('hidden') : 'no splash',
            splashDisplay: document.getElementById('splash-overlay') ? window.getComputedStyle(document.getElementById('splash-overlay')).display : 'none',
            mainMenuHidden: document.getElementById('main-menu-overlay') ? document.getElementById('main-menu-overlay').classList.contains('hidden') : 'no menu',
            mainMenuDisplay: document.getElementById('main-menu-overlay') ? window.getComputedStyle(document.getElementById('main-menu-overlay')).display : 'none'
        })`,
        returnByValue: true
    });
    console.log('State After Button Click:', evalRes2.result.value);

    // Try pressing Enter key
    console.log('\nSimulating Enter keydown...');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

    await new Promise(r => setTimeout(r, 3500));

    const evalRes3 = await send('Runtime.evaluate', {
        expression: `({
            appState: window.__app ? window.__app.getAppState() : 'no __app',
            splashHidden: document.getElementById('splash-overlay') ? document.getElementById('splash-overlay').classList.contains('hidden') : 'no splash',
            mainMenuHidden: document.getElementById('main-menu-overlay') ? document.getElementById('main-menu-overlay').classList.contains('hidden') : 'no menu',
            loadingHidden: document.getElementById('loading-overlay') ? document.getElementById('loading-overlay').classList.contains('hidden') : 'no loading',
            terminalHidden: document.getElementById('terminal-container') ? document.getElementById('terminal-container').classList.contains('hidden') : 'no terminal',
            canvasVisible: !!document.getElementById('viewport-canvas')
        })`,
        returnByValue: true
    });
    console.log('State After Game Startup:', evalRes3.result.value);

    // Capture screenshot
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('tools/splash_debug.png', Buffer.from(screenshot.data, 'base64'));
    console.log('\nScreenshot saved to tools/splash_debug.png');

    ws.close();
    chrome.kill();
    process.exit(0);
}

run().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});

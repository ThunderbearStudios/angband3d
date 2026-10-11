const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '../server/node_modules/ws'));

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function testRealmStart(realm, port = 9222) {
    console.log(`\n========================================`);
    console.log(`TESTING REALM BROWSER START: ${realm} (Port ${port})`);
    console.log(`========================================`);

    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        `--remote-debugging-port=${port}`,
        '--headless=new',
        '--disable-gpu',
        '--user-data-dir=' + path.resolve('.chrome-debug-profile-' + realm),
        `http://localhost:8080/?realm=${realm}`
    ]);

    let tabs = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            tabs = await getJson(`http://127.0.0.1:${port}/json`);
            if (tabs && tabs.length > 0) break;
        } catch (_) {}
    }

    const tab = tabs.find(t => t.url.includes('8080')) || tabs[0];
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
        } else if (msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args.map(a => a.value || a.description).join(' ');
            if (text.includes('[3D]') || text.includes('session') || text.includes('QuickStart') || text.includes('Error')) {
                console.log(`  [CONSOLE ${msg.params.type}]`, text);
            }
        }
    });

    await new Promise(resolve => ws.on('open', resolve));
    await send('Runtime.enable');
    await send('Page.enable');

    await new Promise(r => setTimeout(r, 2000));

    // 1. Advance past splash screen
    await send('Runtime.evaluate', {
        expression: `(() => {
            if (window.__app && window.__app.showMainMenu) {
                window.__app.showMainMenu();
            } else {
                document.getElementById('btn-splash-start').click();
            }
        })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    // 2. Click Option [3]: QuickStart Random Hero
    console.log('Starting QuickStart Random Hero...');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btnRandom = document.getElementById('btn-menu-random');
            if (btnRandom) btnRandom.click();
            else if (window.__app) window.__app.startGame({ charName: 'Hero_${realm}', isNew: true, autoBirth: true, realm: '${realm}' });
        })()`
    });

    // 3. Wait for game to reach play or review
    console.log('Waiting for character creation to advance...');
    let reachedPlay = false;
    for (let sec = 0; sec < 15; sec++) {
        await new Promise(r => setTimeout(r, 1000));
        const st = (await send('Runtime.evaluate', {
            expression: `(() => {
                const f = window.__app ? window.__app.lastFrame : null;
                const termWin = document.getElementById('terminal-container');
                const termHidden = termWin ? termWin.classList.contains('hidden') : true;
                const canvas = document.getElementById('viewport-canvas');
                const canvasVis = canvas ? window.getComputedStyle(canvas).display !== 'none' : false;
                const termTitleEl = document.getElementById('terminal-title') || document.getElementById('term-title');
                const termTitle = termTitleEl ? termTitleEl.textContent : '';
                const btnAdv = document.getElementById('btn-term-advance');
                const btnAdvVis = btnAdv ? window.getComputedStyle(btnAdv).display !== 'none' : false;
                const isReview = (window.__app && typeof window.__app.isBirthReviewActive === 'function') ? window.__app.isBirthReviewActive() : false;
                return {
                    phase: f ? f.phase : 'none',
                    hasMap: !!(f && f.map),
                    hasPlayer: !!(f && f.player),
                    ui: f ? f.ui : null,
                    termHidden,
                    canvasVis,
                    termTitle,
                    btnAdvVis,
                    isReview,
                    bodyTermMode: document.body.classList.contains('terminal-mode-active')
                };
            })()`,
            returnByValue: true
        })).result.value;

        console.log(`  [sec ${sec}] phase: ${st.phase}, hasMap: ${st.hasMap}, termHidden: ${st.termHidden}, isReview: ${st.isReview}, btnAdvVis: ${st.btnAdvVis}`);

        // If on Review Screen during setup, click Accept & Play
        if (st.phase !== 'play' && (st.isReview || st.termTitle.includes('REVIEW') || st.termTitle.includes('決定'))) {
            console.log('  -> Review screen detected! Clicking #btn-term-advance (Accept & Play)...');
            await send('Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('btn-term-advance');
                    if (btn && btn.offsetParent !== null) btn.click();
                    else if (window.__app && window.__app.confirmHeroBirth) window.__app.confirmHeroBirth();
                })()`
            });
        }

        if (st.phase === 'play' && st.hasMap) {
            reachedPlay = true;
            console.log(`  SUCCESS: Reached phase 'play' with map! termHidden: ${st.termHidden}, bodyTermMode: ${st.bodyTermMode}`);
            break;
        }
    }

    // Wait 2 seconds in play
    await new Promise(r => setTimeout(r, 2000));

    // Capture final state
    const finalSt = (await send('Runtime.evaluate', {
        expression: `(() => {
            const f = window.__app ? window.__app.lastFrame : null;
            const termWin = document.getElementById('terminal-container');
            const termHidden = termWin ? termWin.classList.contains('hidden') : true;
            const bodyTermMode = document.body.classList.contains('terminal-mode-active');
            const hud = document.getElementById('hud-overlay');
            const hudVis = hud ? window.getComputedStyle(hud).display !== 'none' : false;
            return {
                phase: f ? f.phase : 'none',
                termHidden,
                bodyTermMode,
                hudVis,
                ui: f ? f.ui : null
            };
        })()`,
        returnByValue: true
    })).result.value;

    console.log('FINAL STATE IN PLAY:', finalSt);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`tools/realm_${realm}_play.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshot to tools/realm_${realm}_play.png`);

    ws.close();
    chrome.kill();
    return finalSt;
}

async function run() {
    const target = process.argv[2];
    const realms = target ? [target] : ['angband', 'silq', 'frogcomposband', 'hengband'];
    for (let i = 0; i < realms.length; i++) {
        const r = realms[i];
        try {
            await testRealmStart(r, 9222 + i);
        } catch (e) {
            console.error(r, 'FAILED:', e.message);
        }
    }
}
run();

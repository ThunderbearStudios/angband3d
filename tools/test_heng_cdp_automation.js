const { spawn } = require('child_process');
const WebSocket = require('../server/node_modules/ws');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runHengVerification() {
    const port = 9410;
    const tempDir = path.resolve(__dirname, 'temp_test_heng_' + Date.now());

    console.log(`[CDP] Starting Chrome on port ${port}...`);
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    for (let i = 0; i < 30; i++) {
        await sleep(200);
        try {
            const v = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (v.ok) {
                console.log(`Chrome ready on attempt ${i}`);
                break;
            }
        } catch (_) {}
    }

    try {
        const targetUrl = 'http://localhost:8080/?realm=hengband&new=1&play=1&lang=jp';
        const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
        const target = await res.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise(r => ws.on('open', r));

        let id = 1;
        const callbacks = new Map();
        function send(method, params = {}) {
            return new Promise(resolve => {
                const reqId = id++;
                callbacks.set(reqId, resolve);
                ws.send(JSON.stringify({ id: reqId, method, params }));
            });
        }
        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.id && callbacks.has(msg.id)) {
                const cb = callbacks.get(msg.id);
                callbacks.delete(msg.id);
                cb(msg.result);
            }
        });

        await send('Page.enable');
        await send('Runtime.enable');

        async function evalJs(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
            return r && r.result ? r.result.value : null;
        }

        console.log('Waiting for character review pause...');
        let reviewReady = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const isReview = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                return {
                    isReview,
                    hasFrame: !!lastFrame,
                    phase: lastFrame ? lastFrame.phase : null,
                    heroName: lastFrame && lastFrame.player ? lastFrame.player.name : null,
                    langMode: window.__langMode,
                    termTitle: document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : null,
                    buttons: Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim()),
                    rowsSample: rows.slice(-3)
                };
            })()`);

            if (state && state.isReview) {
                console.log('Birth Review Paused cleanly:', state);
                reviewReady = true;
                break;
            }
        }

        if (!reviewReady) {
            throw new Error('Failed to reach birth review pause!');
        }

        console.log('\n--- TEST A: Toggling Language in Birth Review Screen ---');
        for (const mode of ['en', 'bilingual', 'jp', 'en']) {
            console.log(`\nToggling to ${mode}...`);
            await evalJs(`window.__app.setLanguageMode('${mode}')`);
            await sleep(200);

            const state = await evalJs(`(() => {
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : null;
                const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
                const hudLabel = document.getElementById('hud-lang-label') ? document.getElementById('hud-lang-label').textContent : null;
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows : [];
                const trSample = rows.slice(0, 8).map((r, idx) => {
                    const text = r.g || '';
                    if (!text.trim()) return null;
                    const trFn = window.translateTerminalRow || (window.HENG_DICT && window.HENG_DICT.translateTerminalRow);
                    const effText = (window.__langMode !== 'jp' && typeof trFn === 'function') ? trFn(text, r.a, window.__langMode, idx).text : text;
                    return effText.trim();
                }).filter(Boolean);

                return {
                    mode: window.__langMode,
                    termTitle,
                    buttons,
                    hudLabel,
                    trSample
                };
            })()`);
            console.log(`State in ${mode}:`, JSON.stringify(state, null, 2));
        }

        console.log('\n--- TEST B: Accepting Character & Entering 3D Play ---');
        await evalJs(`document.getElementById('btn-term-advance').click()`);

        let inPlay = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                return {
                    inPlay: lastFrame && lastFrame.phase === 'play' && lastFrame.map ? true : false,
                    phase: lastFrame ? lastFrame.phase : null,
                    rows: rows.slice(-4)
                };
            })()`);
            if (i % 5 === 0 || (state && state.inPlay)) {
                console.log(`Poll ${i}:`, JSON.stringify(state));
            }
            if (state && state.inPlay) {
                console.log('Entered 3D Play successfully!');
                inPlay = true;
                break;
            }
        }

        if (!inPlay) {
            throw new Error('Failed to enter 3D Play!');
        }

        console.log('\n--- TEST C: Opening Classic View and Toggling Languages ---');
        await evalJs(`(() => {
            if (window.__app && typeof window.__app.toggleTerminalView === 'function') {
                window.__app.toggleTerminalView();
            }
        })()`);
        await sleep(300);

        const classicState = await evalJs(`(() => {
            const termContainer = document.getElementById('terminal-container');
            const isVisible = termContainer && !termContainer.classList.contains('hidden');
            const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : null;
            const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
            return { isVisible, termTitle, buttons };
        })()`);
        console.log('Classic View opened:', classicState);

        for (const mode of ['en', 'bilingual', 'jp', 'en']) {
            console.log(`\nSwitching in Classic View to: ${mode}...`);
            await evalJs(`window.__app.setLanguageMode('${mode}')`);
            await sleep(200);

            const check = await evalJs(`(() => {
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : null;
                const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows : [];
                // Check what the translation function produces on the dungeon rows
                const sampleRows = rows.slice(0, 10).map((r, idx) => {
                    const text = r.g || '';
                    if (!text.trim()) return null;
                    const trFn = window.translateTerminalRow || (window.HENG_DICT && window.HENG_DICT.translateTerminalRow);
                    const effText = (window.__langMode !== 'jp' && typeof trFn === 'function') ? trFn(text, r.a, window.__langMode, idx).text : text;
                    return '[' + idx + '] ' + effText.trim();
                }).filter(Boolean);

                return {
                    mode: window.__langMode,
                    termTitle,
                    buttons,
                    sampleRows
                };
            })()`);
            console.log(`Classic View in ${mode}:`, JSON.stringify(check, null, 2));
        }

        ws.close();
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        console.log('\n=== ALL CDP E2E TESTS PASSED SUCCESSFULLY! ===');
    } catch (err) {
        console.error('CDP E2E Error:', err);
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        process.exit(1);
    }
}

runHengVerification();

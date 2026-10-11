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
            if (r && r.exceptionDetails) {
                console.error('[evalJs Exception]', r.exceptionDetails.text, r.exceptionDetails.exception ? r.exceptionDetails.exception.description : '');
            }
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

        console.log('\n--- TEST B: Custom Hero Creation, Choice Menus & Review Hotkey Quarantine ---');
        // Click Start Over [S] to enter choice menus
        console.log('Clicking Start Over [S] to enter Custom Creation choice menus...');
        const clickResult = await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="S"]') ||
                        document.querySelector('#term-contextual-actions button[data-key="s"]');
            if (btn) {
                btn.click();
                return { clicked: true, key: btn.getAttribute('data-key'), text: btn.textContent.trim() };
            }
            return { clicked: false, allBtns: Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => ({ key: b.getAttribute('data-key'), text: b.textContent.trim() })) };
        })()`);
        console.log('Click Start Over result:', clickResult);

        let choiceMenuReady = false;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            const cmState = await evalJs(`(() => {
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : '';
                const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
                const letterBtns = Array.from(document.querySelectorAll('#term-letter-ribbon button')).map(b => ({ key: b.getAttribute('data-key'), text: b.textContent.trim() }));
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                const screenText = rows.join(' ').toLowerCase();
                const isChoice = screenText.includes('性別') || screenText.includes('sex') || screenText.includes('選んで') || screenText.includes('choose');
                const isReview = window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false;
                return { termTitle, buttons, letterBtnsCount: letterBtns.length, isChoice, isReview, rowSample: rows.slice(0, 3) };
            })()`);

            if (i === 0 || i % 5 === 0) {
                console.log(`Poll ${i} after Start Over:`, cmState);
            }

            if (cmState && cmState.isChoice && cmState.letterBtnsCount > 0) {
                console.log('Choice menu reached successfully:', cmState);
                if (cmState.isReview) throw new Error('isBirthReviewActive must be false on choice menu!');
                choiceMenuReady = true;
                break;
            }
        }
        if (!choiceMenuReady) throw new Error('Failed to reach choice menu after Start Over!');

        // Test clicking letter ribbon button [*] (Random Sex)
        console.log('Clicking letter button [*] for random sex...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-letter-ribbon button[data-key="*"]');
            if (btn) btn.click();
        })()`);

        let raceMenuReady = false;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            const raceState = await evalJs(`(() => {
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : '';
                const letterBtns = Array.from(document.querySelectorAll('#term-letter-ribbon button')).map(b => ({ key: b.getAttribute('data-key'), text: b.textContent.trim() }));
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                const screenText = rows.join(' ').toLowerCase();
                const isRace = screenText.includes('種族') || screenText.includes('race');
                return { termTitle, letterBtnsCount: letterBtns.length, isRace };
            })()`);

            if (raceState && raceState.isRace && raceState.letterBtnsCount > 20) {
                console.log(`Race menu reached with ${raceState.letterBtnsCount} options: ${raceState.termTitle}`);
                raceMenuReady = true;
                break;
            }
        }
        if (!raceMenuReady) throw new Error('Failed to reach race menu after clicking [*]!');

        // Test Step Back via Contextual Button [Esc]
        console.log('Testing step back via [Esc] button...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="escape"]');
            if (btn) btn.click();
        })()`);

        await sleep(500);

        // Advance back to Review Stats screen using quick birth
        console.log('Advancing back to Review Stats screen...');
        await evalJs(`(() => {
            const qb = document.getElementById('btn-quick-birth');
            if (qb) qb.click();
            else if (window.__app && window.__app.network) window.__app.network.sendKey('enter');
        })()`);

        let reviewReturned = false;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            const isReview = await evalJs(`window.__app && typeof window.__app.isBirthReviewActive === 'function' ? window.__app.isBirthReviewActive() : false`);
            if (isReview) {
                console.log(`Review screen reached cleanly (poll ${i})!`);
                reviewReturned = true;
                break;
            }
        }
        if (!reviewReturned) throw new Error('Failed to return to Review Stats screen!');

        // Verify Review hotkey 'r' (reroll) on review screen
        console.log('Testing review hotkey [r] reroll on review screen...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="r"]');
            if (btn) btn.click();
        })()`);
        await sleep(500);

        console.log('\n--- TEST C: Accepting Character & Entering 3D Play ---');
        await evalJs(`document.getElementById('btn-term-advance').click()`);

        let inPlay = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const state = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && lastFrame.map);
                if (!inPlay) {
                    if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                        window.__app.network.sendKey('enter');
                    } else if (document.getElementById('btn-term-advance')) {
                        document.getElementById('btn-term-advance').click();
                    } else if (window.__app && window.__app.network) {
                        window.__app.network.sendKey('enter');
                    }
                }
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                return {
                    inPlay,
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

        console.log('\n--- TEST D: Opening Classic View and Toggling Languages ---');
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

        console.log('\n--- TEST E: 3D Monster Nameplates & 3D Item Captions in 3D Viewport ---');
        // Return to 3D View
        await evalJs(`(() => {
            if (window.__app && typeof window.__app.toggleTerminalView === 'function') {
                window.__app.toggleTerminalView();
            }
        })()`);
        await sleep(300);

        // Verify 3D dungeon methods and state
        const d3dCheck = await evalJs(`(() => {
            const d = window.dungeon || window.__dungeon;
            if (!d) return { error: 'No dungeon3d instance found' };

            // Create test monster and item in 3D world to verify nameplate and caption sprite updates
            const testMonster = { race: '汚いイタズラ小僧', name: '汚いイタズラ小僧', glyph: 'p', attr: 2, hp: 10, hp_max: 10 };
            const testItem = { name: '盲目の薬', glyph: '!', attr: 3 };

            const spMonEn = d.createNameplateSprite(testMonster, false, false);
            const spItemEn = d.createItemCaptionSprite(testItem);

            window.__app.setLanguageMode('bilingual');
            const spMonBi = d.createNameplateSprite(testMonster, false, false);
            const spItemBi = d.createItemCaptionSprite(testItem);

            window.__app.setLanguageMode('jp');
            const spMonJp = d.createNameplateSprite(testMonster, false, false);
            const spItemJp = d.createItemCaptionSprite(testItem);

            // Also test with English names:
            const testMonsterEn = { race: 'Scrawny cat', name: 'Scrawny cat', glyph: 'f', attr: 4, hp: 5, hp_max: 5 };
            const testItemEn = { name: 'a Short Sword', glyph: '|', attr: 1 };

            window.__app.setLanguageMode('jp');
            const spMonEnJp = d.createNameplateSprite(testMonsterEn, false, false);
            const spItemEnJp = d.createItemCaptionSprite(testItemEn);

            window.__app.setLanguageMode('en');

            return {
                hasRefreshMonsters: typeof d.refreshMonsterNameplates === 'function',
                hasRefreshItems: typeof d.refreshItemCaptions === 'function',
                hasCreateItemCaption: typeof d.createItemCaptionSprite === 'function',
                isHeng: d.isHengband(),
                monEn: window.getLocalizedMonsterName(testMonster.race, 'hengband', 'en'),
                monBi: window.getLocalizedMonsterName(testMonster.race, 'hengband', 'bilingual'),
                monJp: window.getLocalizedMonsterName(testMonster.race, 'hengband', 'jp'),
                itemEn: window.getLocalizedItemName(testItem.name, 'hengband', 'en'),
                itemBi: window.getLocalizedItemName(testItem.name, 'hengband', 'bilingual'),
                itemJp: window.getLocalizedItemName(testItem.name, 'hengband', 'jp'),
                enItemToJp: window.getLocalizedItemName(testItemEn.name, 'hengband', 'jp'),
                enMonToJp: window.getLocalizedMonsterName(testMonsterEn.race, 'hengband', 'jp'),
                spritesCreated: Boolean(spMonEn && spItemEn && spMonBi && spItemBi && spMonJp && spItemJp && spMonEnJp && spItemEnJp)
            };
        })()`);
        console.log('3D Dungeon creature & item label test result:', JSON.stringify(d3dCheck, null, 2));

        if (!d3dCheck.spritesCreated || !d3dCheck.hasRefreshMonsters || !d3dCheck.hasRefreshItems) {
            throw new Error('3D creature & item labels failed verification!');
        }

        console.log('\n--- TEST F: In-Game Menus (Inventory, Equipment) & Store Interaction ---');
        // Ensure we are in 3D view and any lingering prompt is cleared
        await evalJs(`(() => {
            const termContainer = document.getElementById('terminal-container');
            if (termContainer && !termContainer.classList.contains('hidden')) {
                if (window.__app && typeof window.__app.toggleTerminalView === 'function') {
                    window.__app.toggleTerminalView();
                }
            }
            if (window.__app && window.__app.network) {
                window.__app.network.sendKey('escape');
            }
        })()`);
        await sleep(400);

        // 1. Inventory [i] in town
        console.log('\n[F.1] Testing Inventory [i] in 3D town...');
        await evalJs(`window.__app.network.sendKey('i')`);
        let invenOpen = false;
        for (let i = 0; i < 20; i++) {
            await sleep(200);
            const invState = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const overlay = lastFrame && lastFrame.ui ? lastFrame.ui.overlay : 0;
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : '';
                const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                return { overlay, termTitle, buttons, row0: rows[0] || '' };
            })()`);

            if (i === 0 || i % 5 === 0) {
                console.log(`Poll ${i} inven:`, invState);
            }

            if (invState && (invState.overlay > 0 || invState.termTitle.includes('INVENTORY') || invState.termTitle.includes('所持品') || invState.row0.includes('持ち物') || invState.row0.includes('Inven'))) {
                console.log('Inventory opened cleanly:', invState);
                invenOpen = true;
                break;
            }
        }
        if (!invenOpen) throw new Error('Failed to open inventory with [i]!');

        // Close inventory via [Esc] button
        console.log('Closing inventory via [Esc] button...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="escape"]');
            if (btn) btn.click();
            else window.__app.network.sendKey('escape');
        })()`);

        let invenClosed = false;
        for (let i = 0; i < 20; i++) {
            await sleep(200);
            const ov = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                return lastFrame && lastFrame.ui ? lastFrame.ui.overlay : 0;
            })()`);
            if (ov === 0) {
                console.log('Closed inventory, returned to 3D world (overlay = 0)!');
                invenClosed = true;
                break;
            }
        }
        if (!invenClosed) throw new Error('Failed to close inventory with [Esc]!');

        // 2. Equipment [e] in town
        console.log('\n[F.2] Testing Equipment [e] in 3D town...');
        await evalJs(`window.__app.network.sendKey('e')`);
        let equipOpen = false;
        for (let i = 0; i < 20; i++) {
            await sleep(200);
            const eqState = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const overlay = lastFrame && lastFrame.ui ? lastFrame.ui.overlay : 0;
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : '';
                const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
                const rows = (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.map(r => r.g || '').filter(s => s.trim().length > 0) : [];
                return { overlay, termTitle, buttons, row0: rows[0] || '' };
            })()`);

            if (i === 0 || i % 5 === 0) {
                console.log(`Poll ${i} equip:`, eqState);
            }

            if (eqState && (eqState.overlay > 0 || eqState.termTitle.includes('EQUIP') || eqState.termTitle.includes('装備') || eqState.row0.includes('装備') || eqState.row0.includes('Equip'))) {
                console.log('Equipment opened cleanly:', eqState);
                equipOpen = true;
                break;
            }
        }
        if (!equipOpen) throw new Error('Failed to open equipment with [e]!');

        // Close equipment via [Esc] button
        console.log('Closing equipment via [Esc] button...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="escape"]');
            if (btn) btn.click();
            else window.__app.network.sendKey('escape');
        })()`);

        let equipClosed = false;
        for (let i = 0; i < 20; i++) {
            await sleep(200);
            const ov = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                return lastFrame && lastFrame.ui ? lastFrame.ui.overlay : 0;
            })()`);
            if (ov === 0) {
                console.log('Closed equipment, returned to 3D world (overlay = 0)!');
                equipClosed = true;
                break;
            }
        }
        if (!equipClosed) throw new Error('Failed to close equipment with [Esc]!');

        // 3. Store navigation & interaction
        console.log('\n[F.3] Testing Store Walking & Store Action Buttons...');
        const pathResult = await evalJs(`(() => {
            const lastFrame = window.__app ? window.__app.getLastFrame() : null;
            if (!lastFrame || !lastFrame.map || !lastFrame.player) return { error: 'No map or player frame' };

            const map = lastFrame.map;
            const h = map.rows.length;
            const w = (map.rows[0].f || '').length / 2;
            const isWalkable = (x, y) => {
                if (x < 0 || x >= w || y < 0 || y >= h) return false;
                const rowF = map.rows[y].f || '';
                const rowG = map.rows[y].g || '';
                const feat = parseInt(rowF.substring(x * 2, x * 2 + 2), 16);
                const g = rowG[x] || ' ';
                return feat === 1 || feat === 3 || feat === 0x18 || feat === 0x1a || feat === 0x1b ||
                       (feat >= 7 && feat <= 14) || (feat >= 0x20 && feat <= 0x28) ||
                       /[1-9]/.test(g) || g === '.' || g === ':' || g === '+' || g === "'";
            };

            const shops = [];
            for (let y = 0; y < h; y++) {
                const rowF = map.rows[y].f || '';
                const rowG = map.rows[y].g || '';
                for (let x = 0; x < w; x++) {
                    const feat = parseInt(rowF.substring(x * 2, x * 2 + 2), 16);
                    const g = rowG[x] || ' ';
                    if ((feat >= 7 && feat <= 14) || (feat >= 0x20 && feat <= 0x28) || /[1-9]/.test(g)) {
                        shops.push({ x, y, feat, g });
                    }
                }
            }

            function findPath(startX, startY, goalX, goalY) {
                const queue = [{ x: startX, y: startY, path: [] }];
                const visited = new Set([startX + ',' + startY]);
                while (queue.length > 0) {
                    const cur = queue.shift();
                    if (cur.x === goalX && cur.y === goalY) return cur.path;
                    const dirs = [
                        { dx: 0, dy: -1, key: 'up' },
                        { dx: 0, dy: 1, key: 'down' },
                        { dx: -1, dy: 0, key: 'left' },
                        { dx: 1, dy: 0, key: 'right' }
                    ];
                    for (const d of dirs) {
                        const nx = cur.x + d.dx;
                        const ny = cur.y + d.dy;
                        const k = nx + ',' + ny;
                        if (!visited.has(k) && isWalkable(nx, ny)) {
                            visited.add(k);
                            queue.push({ x: nx, y: ny, path: [...cur.path, d.key] });
                        }
                    }
                }
                return null;
            }

            let bestShop = null;
            let bestPath = null;
            for (const s of shops) {
                const p = findPath(lastFrame.player.x, lastFrame.player.y, s.x, s.y);
                if (p && (!bestPath || p.length < bestPath.length)) {
                    bestPath = p;
                    bestShop = s;
                }
            }

            return { shopsCount: shops.length, bestShop, bestPath };
        })()`);

        console.log('Pathfind result to nearest shop:', pathResult);
        if (!pathResult.bestPath || pathResult.bestPath.length === 0) {
            throw new Error('Could not find walkable path to any shop in town!');
        }

        // Walk steps to store
        console.log(`Walking ${pathResult.bestPath.length} steps to store...`);
        for (const stepKey of pathResult.bestPath) {
            await evalJs(`window.__app.network.sendKey('${stepKey}')`);
            await sleep(150);
            const inside = await evalJs(`(() => {
                const f = window.__app ? window.__app.getLastFrame() : null;
                return f && f.ui && f.ui.overlay > 0;
            })()`);
            if (inside) {
                console.log('Entered store while walking path!');
                break;
            }
        }

        let storeOpen = false;
        let storeState = null;
        for (let i = 0; i < 20; i++) {
            await sleep(200);
            storeState = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                const overlay = lastFrame && lastFrame.ui ? lastFrame.ui.overlay : 0;
                const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : '';
                const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => ({
                    key: b.getAttribute('data-key'),
                    text: b.textContent.trim()
                }));
                const examineBtn = document.querySelector('#term-contextual-actions button[data-key="x"]');
                const py = lastFrame && lastFrame.player ? lastFrame.player.y : 0;
                const px = lastFrame && lastFrame.player ? lastFrame.player.x : 0;
                let playerFeat = 0;
                let playerGlyph = '';
                if (lastFrame && lastFrame.map && lastFrame.map.rows && lastFrame.map.rows[py]) {
                    const rowF = lastFrame.map.rows[py].f || '';
                    const rowG = lastFrame.map.rows[py].g || '';
                    playerFeat = parseInt(rowF.substring(px * 2, px * 2 + 2), 16) || 0;
                    playerGlyph = rowG[px] || '';
                }
                return {
                    overlay,
                    termTitle,
                    playerFeat,
                    playerGlyph,
                    rows: (lastFrame && lastFrame.term && lastFrame.term.rows) ? lastFrame.term.rows.slice(0, 8).map(r => r.g) : [],
                    buttons,
                    hasExamineX: !!examineBtn
                };
            })()`);

            if (storeState && storeState.overlay > 0) {
                console.log('Inside store successfully:', JSON.stringify(storeState, null, 2));
                storeOpen = true;
                break;
            }
        }
        if (!storeOpen) throw new Error('Failed to enter store after walking path!');
        if (!storeState.hasExamineX) throw new Error('Hengband store MUST use examine key [x] (data-key="x")!');

        // Test clicking Examine [x]
        console.log('Testing store Examine [x] button click...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="x"]');
            if (btn) btn.click();
        })()`);

        await sleep(500);

        const examineState = await evalJs(`(() => {
            const termTitle = document.getElementById('terminal-title') ? document.getElementById('terminal-title').textContent : '';
            const buttons = Array.from(document.querySelectorAll('#term-contextual-actions button')).map(b => b.textContent.trim());
            return { termTitle, buttons };
        })()`);
        console.log('Store examine mode state:', examineState);

        // Cancel examine via [Esc]
        console.log('Cancelling examine via [Esc]...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="escape"]');
            if (btn) btn.click();
        })()`);

        await sleep(400);

        // Exit store via [Esc]
        console.log('Exiting store back to town via [Esc]...');
        await evalJs(`(() => {
            const btn = document.querySelector('#term-contextual-actions button[data-key="escape"]');
            if (btn) btn.click();
            else window.__app.network.sendKey('escape');
        })()`);

        let storeClosed = false;
        for (let i = 0; i < 20; i++) {
            await sleep(200);
            const ov = await evalJs(`(() => {
                const lastFrame = window.__app ? window.__app.getLastFrame() : null;
                return lastFrame && lastFrame.ui ? lastFrame.ui.overlay : 0;
            })()`);
            if (ov === 0) {
                console.log('Exited store back to town (overlay = 0)!');
                storeClosed = true;
                break;
            }
        }
        if (!storeClosed) throw new Error('Failed to exit store back to town!');

        ws.close();
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        console.log('\n=== ALL CDP E2E TESTS (A, B, C, D, E, F) PASSED SUCCESSFULLY! ===');
    } catch (err) {
        console.error('CDP E2E Error:', err);
        chrome.kill();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        process.exit(1);
    }
}

runHengVerification();

/**
 * Angband3D Web Application Coordinator
 * Boots all subsystems, orchestrates view routing, and binds network stream to 3D scene.
 */

window.addEventListener('DOMContentLoaded', () => {
    // Pure screen classifier (js/screen-context.js, WS2). Loaded before app.js in index.html.
    // Fail loudly if missing: a silent fallback would reintroduce divergent heuristic copies.
    const SC = window.ScreenContext;
    if (!SC) console.error('[App] ScreenContext missing: js/screen-context.js failed to load');
    const loadingOverlay = document.getElementById('loading-overlay');
    const terminalContainer = document.getElementById('terminal-container');

    // =========================================================================
    // Service Worker & PWA Update UX (WS10.1 / G-E)
    // =========================================================================
    function showUpdateToast() {
        let toast = document.getElementById('sw-update-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sw-update-toast';
            toast.className = 'realm-toast sw-update-toast';
            toast.style.cursor = 'pointer';
            toast.style.pointerEvents = 'auto';
            toast.style.zIndex = '100000';
            toast.addEventListener('click', () => {
                window.location.reload();
            });
            document.body.appendChild(toast);
        }
        // G-E rule: textContent used, never auto-reload mid-game
        toast.textContent = '✨ New version available! Tap here to reload.';
        toast.classList.add('show');
    }

    // Register PWA Service Worker for home-screen installation & offline shell caching
    if ('serviceWorker' in navigator) {
        let hasController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hasController) {
                hasController = true;
                return;
            }
            showUpdateToast();
        });
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('[SW] Registration failed:', err);
        });
    }

    // 1. Initialize Subsystems
    const audio = new SoundEngine();

    // Platform Auto-Detection:
    // - Standalone Native Desktop (Windows/Linux) & Android APK: runs offline with bundled engine (or connects to cloud on request).
    // - Web Browser (angband3d.com): ALWAYS connects directly to the Cloud Realm WebSocket daemon!
    const isStandaloneApp = () => {
        return window.Capacitor !== undefined ||
               location.protocol === 'capacitor:' ||
               window.isNativeAndroidApp === true ||
               (window.location.href.startsWith('http://localhost') && navigator.userAgent.includes('Android') && !window.location.port) ||
               location.hostname === 'angband3d.local' ||
               (window.chrome && window.chrome.webview !== undefined);
    };

    // Cross-Client External URL Dispatcher:
    // Guarantees all non-web standalone clients (Desktop Windows WebView2, Android APK)
    // shell out to the default system browser instead of navigating within the game container.
    function openExternalUrl(url) {
        if (!url) return;
        try {
            // 1. Standalone WebView2 Desktop: post message to host process
            if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
                window.chrome.webview.postMessage({ type: 'openExternal', url: url });
                return;
            }
            // 2. Capacitor Android / iOS App: use InAppBrowser / Browser plugin
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
                window.Capacitor.Plugins.Browser.open({ url: url });
                return;
            }
            // 3. Standard web / browser: window.open in new tab
            const win = window.open(url, '_blank', 'noopener,noreferrer');
            if (!win || win.closed || typeof win.closed === 'undefined') {
                window.location.href = url;
            }
        } catch (_) {
            window.location.href = url;
        }
    }
    window.openExternalUrl = openExternalUrl;

    const isApk = isStandaloneApp();
    if (isApk && typeof document !== 'undefined') {
        if (document.body) {
            document.body.classList.add('is-standalone');
        } else {
            document.addEventListener('DOMContentLoaded', () => document.body?.classList.add('is-standalone'));
        }
    }
    // Web browser users MUST ALWAYS default to Cloud Realm.
    // Standalone desktop/APK users default to local offline engine.
    let engineMode = isApk ? 'local' : 'cloud';

    // Strictly purge any legacy 'angband_engine_mode' from browser localStorage
    // to guarantee web users never get stuck on a broken local mode.
    if (!isApk) {
        try {
            localStorage.removeItem('angband_engine_mode');
        } catch (_) {}
    }

    // =========================================================================
    // Multi-Realm Architecture & State (v8.9.3+)
    // Hoisted before subsystem instantiation to guard against TDZ ReferenceErrors
    // =========================================================================
    const REALM_DATA = {
        angband: {
            name: 'Vanilla Angband 4.2.6',
            tagline: 'The Classic Tolkien Descent',
            desc: 'The purest, bit-for-bit roguelike dungeon crawl. 100 dungeon levels descending into the iron fortress of Angband to overthrow Morgoth, Lord of Darkness.',
            voiceAccent: 'Old British Scholar',
            lorekeeper: 'Eldritch Lorekeeper of the West'
        },
        frogcomposband: {
            name: 'FrogComposBand',
            tagline: 'Wilderness Overland & Unlimited Monster Races',
            desc: 'Over 50 diverse classes, procedural overland wilderness, monster races (Dragons, Ringwraiths, Angels), and endless high-fantasy chaos.',
            voiceAccent: 'Mythic Bard (Rich neutral epic)',
            lorekeeper: 'The Wandering Skald of Wilderland'
        },
        hengband: {
            name: 'Hengband 3.0+',
            tagline: 'Eastern Mythos & Amberite Chronicles',
            desc: 'Inspired by Zelazny\'s Amber and Japanese folklore. Unique magic realms, quest towers, mythical deities, and legendary samurai combat.',
            voiceAccent: 'Eastern Mystic (Refined chronicle)',
            lorekeeper: 'Chronicle of the Celestial Courts'
        },
        silq: {
            name: 'Sil-Q 1.5+',
            tagline: 'First Age Stealth & The Crown Heist',
            desc: 'Tactical stealth roguelike in the First Age. Sing songs of power, avoid deadly Balrogs in the shadows, and pry a Silmaril from Morgoth\'s crown.',
            voiceAccent: 'Elven Skald (Melodic northern)',
            lorekeeper: 'Keeper of the Lay of Leithian'
        }
    };

    const _bootParams = new URLSearchParams(window.location.search);
    const _bootRealm = _bootParams.get('realm');
    let activeRealm = (_bootRealm && (REALM_DATA[_bootRealm] ? _bootRealm : (_bootRealm === 'vanilla' ? 'angband' : null)))
        || localStorage.getItem('angband3d_active_realm')
        || 'angband';
    if (!REALM_DATA[activeRealm]) activeRealm = 'angband';

    // Multilingual Language State for Hengband ('en' = English, 'bilingual' = Japanese + English, 'jp' = Pure Kanji/Japanese)
    const _bootLang = _bootParams.get('lang');
    let langMode = (_bootLang && (_bootLang === 'jp' || _bootLang === 'kanji' || _bootLang === 'ja') ? 'jp' : (_bootLang === 'bilingual' ? 'bilingual' : (_bootLang === 'en' ? 'en' : null)))
        || localStorage.getItem('angband3d_lang_mode')
        || 'en';
    window.__langMode = (activeRealm === 'hengband') ? langMode : 'en';
    window.activeRealm = activeRealm;
    window.__activeRealm = activeRealm;

    // WS5.1: Lazy Hengband language data loading
    let hengLangPromise = null;
    function loadHengLang() {
        if (hengLangPromise) return hengLangPromise;
        const v = (typeof window !== 'undefined' && window.__ASSET_V)
            ? window.__ASSET_V
            : (document.querySelector('script[src*="app.js"]')?.src.match(/\?v=([^&]+)/)?.[1] || '');
        const addScript = (src) => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src + (v ? '?v=' + v : '');
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
        hengLangPromise = addScript('/js/heng-dict.js')
            .then(() => addScript('/js/heng/heng-translate.js'))
            .then(() => {
                if (window.HengTranslate && typeof window.HengTranslate.loadAssets === 'function') {
                    return window.HengTranslate.loadAssets();
                }
            })
            .catch((err) => {
                console.warn('[heng] language assets failed; JP passthrough', err);
            });
        return hengLangPromise;
    }
    if (typeof window !== 'undefined') {
        window.loadHengLang = loadHengLang;
    }
    if (activeRealm === 'hengband') {
        loadHengLang();
    }

    let network = (engineMode === 'cloud' && window.GameNetwork) ? new GameNetwork() : new LocalGameBridge();
    const dungeon = new Dungeon3D('viewport-canvas');
    dungeon.realm = activeRealm;
    window.dungeon = dungeon;
    window.__dungeon = dungeon;
    window.__dungeonRenderer = dungeon;
    const hud = new WebHUD('minimap-canvas');

    window.getShockboltSpriteCss = function(kind, name, glyph, sizePx = 24) {
        const dr = window.__dungeonRenderer || window.__dungeon || window.dungeon;
        if (!dr) return '';
        let res = null;
        if (kind === 'monster') {
            if (typeof dr.getMonsterAtlasUV === 'function') {
                res = dr.getMonsterAtlasUV(name, glyph);
            } else if (typeof dr.resolveMonsterAtlasEntry === 'function') {
                res = dr.resolveMonsterAtlasEntry(name, glyph);
            }
        } else {
            if (typeof dr.getItemAtlasUV === 'function') {
                res = dr.getItemAtlasUV(name, glyph);
            } else if (typeof dr.resolveItemAtlasEntry === 'function') {
                res = dr.resolveItemAtlasEntry(name, glyph);
            }
        }
        const uv = Array.isArray(res) ? res : (res && Array.isArray(res.uv) ? res.uv : null);
        if (!uv || uv.length < 4) return '';
        const isMonster = kind === 'monster';
        const cols = (res && res.cols) || Math.round(1 / Math.max(0.001, uv[2] - uv[0])) || 32;
        const rows = (res && res.rows) || Math.round(1 / Math.max(0.001, uv[3] - uv[1])) || 32;
        const bgSize = sizePx * cols;
        const atlasUrl = isMonster ? '/assets/sprites/monsters/monster_atlas.png' : '/assets/sprites/items/item_atlas.png';
        const col = (res && typeof res.col === 'number') ? res.col : Math.round(uv[0] * cols);
        const row = (res && typeof res.row === 'number') ? res.row : Math.round((1 - uv[3]) * rows);
        return `width: ${sizePx}px; height: ${sizePx}px; background-image: url('${atlasUrl}'); background-size: ${bgSize}px auto; background-position: -${col * sizePx}px -${row * sizePx}px;`;
    };

    let forceTerminal = false;
    let currentPhase = 'setup';

    const dispatchTerminalKey = (key) => {
        if (audio) audio.unlock();
        const effRealm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (lastFrame && lastFrame.realm) || 'angband';
        if (key === '10') {
            network.sendKey('1');
            network.sendKey('0');
            return;
        }
        if (terminal && typeof terminal.setSelectedKey === 'function' && key && key.length === 1) {
            terminal.setSelectedKey(key);
        }
        if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
            if (window.MenuRouter.route(key, lastFrame, effRealm)) {
                updateTerminalToolbar(lastFrame);
                if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                return;
            }
        }
        network.sendKey(key);
    };
    const terminal = new WebTerminal('terminal-canvas', dispatchTerminalKey);
    const _origTermResize = terminal.resize.bind(terminal);
    terminal.resize = function () {
        _origTermResize();
        if (this.canvas && this.zoomLevel === 1.0 && window.innerWidth > 0 && window.innerHeight > 0) {
            const curW = parseInt(this.canvas.style.width, 10) || 0;
            const curH = parseInt(this.canvas.style.height, 10) || 0;
            const maxW = Math.max(240, window.innerWidth - 16);
            const maxH = Math.max(180, window.innerHeight - 110);
            if (curW > maxW || curH > maxH) {
                const ratio = Math.min(maxW / Math.max(1, curW), maxH / Math.max(1, curH));
                this.canvas.style.width = `${Math.floor(curW * ratio)}px`;
                this.canvas.style.height = `${Math.floor(curH * ratio)}px`;
            }
        }
    };
    terminal.resize();
    window.__sendTerminalKey = dispatchTerminalKey;

    const setEngineMode = (mode) => {
        if (engineMode === mode && network) return;
        engineMode = mode;
        if (isApk) {
            try {
                localStorage.setItem('angband_engine_mode', mode);
            } catch (_) {}
        }
        try {
            if (network) network.disconnect();
        } catch (_) {}
        network = (mode === 'cloud' && window.GameNetwork) ? new GameNetwork() : new LocalGameBridge();
        window.__app.network = network;
        if (typeof dispatcher !== 'undefined' && dispatcher) {
            dispatcher.sendKey = (k) => network && network.sendKey(k);
        }
        bindNetworkEventHandlers();
        updateEngineModeUI();
        checkSaves();
    };

    const updateEngineModeUI = () => {
        const menuPwaLabel = document.getElementById('menu-pwa-label');
        const menuPwaDesc = document.getElementById('menu-pwa-desc');
        if (isApk) {
            if (menuPwaLabel) menuPwaLabel.textContent = 'Play in Web Client Online (Cloud Realm)';
            if (menuPwaDesc) menuPwaDesc.textContent = 'Connect to the live multiplayer Cloud Realm or visit angband3d.com online.';
        } else {
            if (menuPwaLabel) menuPwaLabel.textContent = 'Standalone Apps & Downloads (Android / PC)';
            if (menuPwaDesc) menuPwaDesc.textContent = 'Download standalone offline Android APK or Windows PC client, or install as an app.';
        }
        if (hud && hud.pingBadge) {
            if (engineMode === 'local') {
                hud.pingBadge.textContent = '⚡ Android Standalone [Offline]';
                hud.pingBadge.style.color = '#38bdf8';
            } else {
                hud.pingBadge.textContent = 'Cloud [Connecting...]';
                hud.pingBadge.style.color = '#ffd700';
            }
        }
    };

    let birthReviewActive = false;

    const toggleTerminalView = () => {
        forceTerminal = !forceTerminal;
        window.__manualTerminalOpen = forceTerminal;
        updateViewMode();
    };

    let quickBirthActive = false;
    let quickBirthStep = 0;
    let birthConfirming = false;
    let lastBirthConfirmSig = '';
    let silqStatAllocated = false;
    let silqNameSent = false;
    let fcbRaceDone = false;
    let fcbClassDone = false;
    let fcbPersDone = false;

    const cancelQuickBirth = () => {
        quickBirthActive = false;
        quickBirthStep = 0;
        birthConfirming = false;
        lastBirthConfirmSig = '';
        silqStatAllocated = false;
        silqNameSent = false;
        fcbRaceDone = false;
        fcbClassDone = false;
        fcbPersDone = false;
    };

    const confirmHeroBirth = () => {
        cancelQuickBirth();
        birthReviewActive = false;
        birthConfirming = true;
        lastBirthConfirmSig = (lastFrame && lastFrame.term && lastFrame.term.rows)
            ? lastFrame.term.rows.map(r => r.g || '').join('\n').trim()
            : '';
        network.sendKey('enter');
    };

    const finalizeHeroBirth = () => {
        cancelQuickBirth();
        birthReviewActive = false;
        birthConfirming = false;
        lastBirthConfirmSig = '';
        forceTerminal = false;
        window.__manualTerminalOpen = false;
        if (terminalContainer) {
            terminalContainer.classList.add('hidden');
            terminalContainer.classList.remove('in-game-modal');
        }
        document.body.classList.remove('terminal-mode-active');
        if (input) input.setTerminalMode(false);
        const quickBirthBtn = document.getElementById('btn-quick-birth');
        const termRerollBtn = document.getElementById('btn-term-reroll');
        const termCustomBtn = document.getElementById('btn-term-custom');
        const termAdvanceBtn = document.getElementById('btn-term-advance');
        const termEscapeBtn = document.getElementById('btn-term-escape');
        const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');
        if (quickBirthBtn) quickBirthBtn.style.display = 'none';
        if (termRerollBtn) termRerollBtn.style.display = 'none';
        if (termCustomBtn) termCustomBtn.style.display = 'none';
        if (termAdvanceBtn) {
            termAdvanceBtn.style.display = 'none';
            termAdvanceBtn.textContent = 'Advance (Enter)';
        }
        if (termEscapeBtn) {
            termEscapeBtn.style.display = 'inline-flex';
            termEscapeBtn.textContent = 'Back (Esc)';
        }
        if (terminalTitle) terminalTitle.textContent = '⚔ ANGBAND CLASSIC TERMINAL';
        updateViewMode(lastFrame);
    };

    let wasInStore = false;

    const _sjisDecodeCache = new Map();
    function decodeHengbandText(str) {
        if (!str) return '';
        const cache = (this && typeof this === 'object' && this !== window)
            ? (this._sjisDecodeCache = this._sjisDecodeCache || new Map())
            : _sjisDecodeCache;
        const cached = cache.get(str);
        if (cached !== undefined) return cached;
        let res = str;
        if (/[\u3000-\u9faf]/.test(str)) {
            res = str;
        } else if (terminal && typeof terminal.decodeText === 'function') {
            res = terminal.decodeText(str);
        }
        if (cache.size >= 512) {
            const oldest = cache.keys().next().value;
            cache.delete(oldest);
        }
        cache.set(str, res);
        return res;
    }

    function stepQuickBirth(frame) {
        if (!quickBirthActive || !frame) return;
        const rawText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
        const decodedText = decodeHengbandText(rawText);
        const screenText = (rawText + '\n' + decodedText).toLowerCase();
        const hasMore = screenText.includes('-more-') || (frame.ui && frame.ui.more);
        // Once in active play with valid map and player object,
        // birth is 100% finished: dismiss terminal and switch directly to 3D world view!
        if (frame.phase === 'play' && frame.map && frame.player && !hasMore) {
            finalizeHeroBirth();
            return;
        }
        if (++quickBirthStep > 40) {
            quickBirthActive = false;
            forceTerminal = false;
            updateViewMode(frame);
            console.warn('[QuickStart] Exceeded maximum auto-birth steps; switching to world view.');
            return;
        }
        // 1. Review & Confirmation Screen reached across variants!
        const isReviewScreen = ['to start over', "'s' to start", 'accept character', 're-roll', "['r'eroll", 'or enter to accept', "reroll, 'h'istory", '能力値の決定', '能力値決定', '次の数値', '前の数値', 'この数値に決定'].some(k => screenText.includes(k)) ||
                               (screenText.includes('enter your starting stats') && screenText.includes('begin play')) ||
                               (screenText.includes('step back') && screenText.includes('continue'));
        if (isReviewScreen) {
            quickBirthActive = false;
            birthReviewActive = true;
            forceTerminal = true;
            updateViewMode(frame);
            const getEl = id => document.getElementById(id);
            const [qbBtn, rrBtn, custBtn, advBtn, escBtn] = ['btn-quick-birth', 'btn-term-reroll', 'btn-term-custom', 'btn-term-advance', 'btn-term-escape'].map(getEl);
            const terminalTitle = getEl('term-title') || getEl('terminal-title');
            if (qbBtn) qbBtn.style.display = 'none';
            if (rrBtn) rrBtn.style.display = 'inline-flex';
            if (custBtn) custBtn.style.display = 'inline-flex';
            if (advBtn) { advBtn.style.display = 'inline-flex'; advBtn.textContent = '⚔ Accept & Play (Enter)'; }
            if (escBtn) { escBtn.style.display = 'inline-flex'; escBtn.textContent = 'Back (Esc)'; }
            if (terminalTitle) {
                const hasPrev = screenText.includes('前の数値') || screenText.includes('previous roll') || screenText.includes("'p' for previous");
                terminalTitle.textContent = hasPrev
                    ? '🎲 HERO STATS — Reroll [R] | Prev Roll [P] | Custom [C] | Accept [Enter]'
                    : '🎲 HERO REVIEW — Reroll [R] | Custom [C] | Accept [Enter]';
            }
            return;
        }
        // 1b. Vanilla Angband Quickstart prompt: do not reuse previous character during quick birth; roll fresh with 'n'
        if (screenText.includes('use as is') || screenText.includes("'y': use as is") || screenText.includes("'n': redo")) {
            network.sendKey('n');
            return;
        }
        // 2. Universal Confirmation Prompts ([y/n] or are you sure or よろしいですか)
        if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('are you sure') || screenText.includes('よろしいですか')) {
            network.sendKey('y');
            return;
        }
        // 3. Hengband Birth Options screen -> escape to accept options
        if (screenText.includes('esc:accept') || screenText.includes('birth options') || screenText.includes('esc to return') ||
            screenText.includes('smart_learn') || (screenText.includes('esc:終了') && screenText.includes('初期オプション'))) {
            network.sendKey('escape');
            return;
        }
        // 4. Hengband Stat Roller (Set minimum stats / goto next / 能力値を抽選)
        if (screenText.includes('set minimum stats') || screenText.includes('enter for goto next') ||
            screenText.includes('能力値を抽選') || screenText.includes('この数値に決定')) {
            network.sendKey('enter');
            return;
        }
        // 5. Hengband Realm Selection (for spellcasting classes) -> select first realm 'a'
        if (screenText.includes('choose a realm') || screenText.includes('choose realm') || screenText.includes('realm 1:') ||
            screenText.includes('魔法領域') || screenText.includes('領域を選んで')) {
            network.sendKey('a');
            return;
        }
        // 6. FrogComposBand Mode Selection: 'n' is Normal Mode (never 'b' Beginner which forces pre-rolled Hobbit Rogue)
        if (screenText.includes('choose the type of game to play')) {
            network.sendKey('n');
            return;
        }
        if (activeRealm === 'frogcomposband') {
            if (screenText.includes('change race') && screenText.includes('change class')) {
                if (!fcbRaceDone) {
                    fcbRaceDone = true;
                    network.sendKey('r');
                    return;
                }
                if (!fcbClassDone) {
                    fcbClassDone = true;
                    network.sendKey('c');
                    return;
                }
                if (!fcbPersDone) {
                    fcbPersDone = true;
                    network.sendKey('p');
                    return;
                }
                network.sendKey('enter');
                return;
            }
            if (screenText.includes('choose patron') || screenText.includes('choose a patron') || screenText.includes('*) random')) {
                network.sendKey('*');
                return;
            }
            if (screenText.includes('choose a realm') || screenText.includes('choose realm') || screenText.includes('realm 1:')) {
                network.sendKey('a');
                return;
            }
        }
        if (screenText.includes('ret) next screen') || screenText.includes('next screen')) {
            network.sendKey('enter');
            return;
        }
        // 7. Vanilla Angband autoroller / quick-finish
        if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
            network.sendKey('@');
            return;
        }
        // 8. Sil-Q / Hengband / FrogComposBand Random Option Menu (Sex, Race, Class, Personality, House, Patron)
        if (screenText.includes('choose a sex') || screenText.includes('choose a race') ||
            screenText.includes('choose a class') || screenText.includes('choose a personality') ||
            screenText.includes('choose patron') || screenText.includes('choose a patron') ||
            screenText.includes('性別を選んで') || screenText.includes('種族を選んで') ||
            screenText.includes('職業を選んで') || screenText.includes('性格を選んで') ||
            screenText.includes('random menu item') || screenText.includes('* random') ||
            screenText.includes('*) random') || screenText.includes('*)ランダム') ||
            screenText.includes('choose your race') || screenText.includes('choose your class') ||
            screenText.includes('choose house') || screenText.includes('choose a house')) {
            network.sendKey('*');
            return;
        }
        // 8b. FrogComposBand Split Personality Selection (choose 2 or more, ENTER to accept)
        if (screenText.includes('toggle personalities') || screenText.includes('choose 2 or more')) {
            network.sendKey('a');
            network.sendKey('b');
            network.sendKey('enter');
            return;
        }
        // 9. Sil-Q Skills & Stats Allocation
        if (screenText.includes('allocate points to skills') || screenText.includes('skill increases') || screenText.includes('accept skills')) {
            network.sendKey('enter');
            return;
        }
        if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
            if (silqStatAllocated) return;
            silqStatAllocated = true;
            const archetype = Math.floor(Math.random() * 4);
            let seq = ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'];
            if (archetype === 0) {
                seq = ['6', '6', '6', '2', '6', '6', '2', '6', '6', '2', '6', 'enter'];
            } else if (archetype === 1) {
                seq = ['6', '6', '2', '6', '6', '6', '2', '6', '6', '2', '6', 'enter'];
            } else if (archetype === 3) {
                seq = ['6', '2', '6', '6', '2', '6', '6', '2', '6', '6', '6', 'enter'];
            }
            seq.forEach(k => network.sendKey(k));
            return;
        }
        // 10. History, Age/Height/Weight, Name Prompts
        if (screenText.includes('accept history') || screenText.includes('reroll history') || screenText.includes('accept age/height/weight')) {
            network.sendKey('enter');
            return;
        }
        if (screenText.includes('enter accept name') || screenText.includes('accept name') || screenText.includes('tab random name')) {
            if (silqNameSent) return;
            silqNameSent = true;
            network.sendKey('tab');
            network.sendKey('enter');
            return;
        }
        if (screenText.includes("enter a name for your character") || screenText.includes("enter your player's name") ||
            screenText.includes("enter name:") || screenText.includes('名前を入力') || screenText.includes('キャラクターの名前')) {
            network.sendKey('enter');
            return;
        }
        // 11. Post-review background edit & embark screens (Hengband)
        if (screenText.includes('character background') || screenText.includes('cursor key for move, enter for end') ||
            screenText.includes('生い立ち') || screenText.includes('編集モード') || screenText.includes('編集済み')) {
            network.sendKey('enter');
            return;
        }
        if (screenText.includes("start over, or enter to continue") || screenText.includes("['q'uit, 's'tart over, or enter to continue]") ||
            screenText.includes('ゲーム開始') || screenText.includes('冒険に出ますか')) {
            network.sendKey('enter');
            return;
        }
        // 12. More prompts or splash screens
        if (hasMore || screenText.includes('press any key') || screenText.includes('press space') ||
            screenText.includes('press any other key to play') || screenText.includes('press ? for credits')) {
            network.sendKey('space');
            return;
        }
        if (screenText.includes('into the vast and echoing gloom') || screenText.includes('down awful corridors') ||
            screenText.includes('depths they went alone') || screenText.includes('menace dark enshrined') ||
            screenText.includes('when the world is old') || screenText.includes('rephial.org') || screenText.includes('last battle be gathered')) {
            network.sendKey('enter');
            return;
        }
        // 13. Fallback selection menu
        if (screenText.includes('select your character') || screenText.includes('choose a') || screenText.includes('selection')) {
            network.sendKey('@');
            return;
        }
        network.sendKey('enter');
    }

    const rerollHero = () => {
        cancelQuickBirth();
        birthReviewActive = false;
        forceTerminal = true;
        if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
        const currentRealm = (typeof getActiveRealm === 'function') ? getActiveRealm() : activeRealm;
        if (currentRealm === 'silq') {
            network.sendKey('r');
        } else if (currentRealm === 'frogcomposband') {
            network.sendKey('escape');
        } else if (currentRealm === 'hengband') {
            network.sendKey('r');
        } else {
            // Vanilla Angband
            const rawText = (lastFrame && lastFrame.term && lastFrame.term.rows ? lastFrame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();
            if (rawText.includes("'r' to reroll") || rawText.includes("['r'eroll") || rawText.includes("r to reroll")) {
                network.sendKey('r');
            } else if (rawText.includes('use as is') || rawText.includes("'y': use")) {
                network.sendKey('n');
            } else {
                network.sendKey('s');
            }
        }
        quickBirthActive = true;
        quickBirthStep = 0;
        const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');
        if (terminalTitle) {
            terminalTitle.textContent = '🎲 REROLLING HERO...';
        }
    };

    const previousStatRoll = () => {
        if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
        network.sendKey('p');
        const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');
        if (terminalTitle) {
            terminalTitle.textContent = '⏪ RESTORING PREVIOUS ROLL...';
        }
    };

    const startCustomHeroCreation = () => {
        cancelQuickBirth();
        birthReviewActive = false;
        forceTerminal = true;
        if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
        const currentRealm = (typeof getActiveRealm === 'function') ? getActiveRealm() : activeRealm;
        if (currentRealm === 'silq' || currentRealm === 'frogcomposband') {
            network.sendKey('escape');
        } else if (currentRealm === 'hengband') {
            network.sendKey('S');
        } else {
            network.sendKey('s');
        }
        quickBirthActive = false;
        quickBirthStep = 0;
    };

    // Terminal Toolbar action buttons
    const quickBirthBtn = document.getElementById('btn-quick-birth');
    if (quickBirthBtn) {
        quickBirthBtn.addEventListener('click', () => {
            if (audio) audio.unlock();
            if (currentPhase === 'play') { startNewRandomHero(); return; }
            cancelQuickBirth();
            quickBirthActive = true;
            quickBirthStep = 0;
            if (lastFrame) stepQuickBirth(lastFrame);
            else network.sendKey('enter');
        });
    }
    const termRerollBtn = document.getElementById('btn-term-reroll');
    if (termRerollBtn) termRerollBtn.addEventListener('click', (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } if (audio) audio.unlock(); rerollHero(); });
    const termCustomBtn = document.getElementById('btn-term-custom');
    if (termCustomBtn) termCustomBtn.addEventListener('click', () => { if (audio) audio.unlock(); startCustomHeroCreation(); });
    const termAdvanceBtn = document.getElementById('btn-term-advance');
    if (termAdvanceBtn) {
        termAdvanceBtn.addEventListener('click', () => {
            if (audio) audio.unlock();
            if (birthReviewActive) {
                confirmHeroBirth();
                return;
            }
            if (audio) audio.playWhoosh();
            const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
            const effRealm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (lastFrame && lastFrame.realm) || 'angband';
            if (inPlay) {
                if (window.MenuRouter && typeof window.MenuRouter.route === 'function' && window.MenuRouter.route('Enter', lastFrame, effRealm)) {
                    updateTerminalToolbar(lastFrame);
                    if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                    return;
                }
                const scClass = (SC && typeof SC.classify === 'function' && lastFrame) ? SC.classify(lastFrame, effRealm, { decode: decodeHengbandText }) : null;
                const inSelectableList = Boolean(
                    (scClass && (scClass.mode === 'item-list' || scClass.mode === 'item-actions')) ||
                    (terminal && terminal.currentMode === 'item_prompt' && Array.isArray(terminal.selectableRegions) && terminal.selectableRegions.length > 0)
                );
                if (inSelectableList && terminal && typeof terminal.getSelectedKey === 'function') {
                    const selKey = terminal.getSelectedKey();
                    if (selKey) {
                        if (window.MenuRouter && typeof window.MenuRouter.route === 'function' && window.MenuRouter.route(selKey, lastFrame, effRealm)) {
                            updateTerminalToolbar(lastFrame);
                            if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                            return;
                        }
                        network.sendKey(selKey);
                        return;
                    }
                }
            }
            network.sendKey('enter');
        });
    }

    const termEscapeBtn = document.getElementById('btn-term-escape');
    if (termEscapeBtn) {
        termEscapeBtn.addEventListener('click', () => {
            if (audio) audio.unlock();
            cancelQuickBirth();
            if (audio) audio.playMenuNav();
            const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && (lastFrame.map || (lastFrame.player && lastFrame.player.name)));
            const screenText = (lastFrame && lastFrame.term && lastFrame.term.rows)
                ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase()
                : '';
            const isReviewScreen = !inPlay && (screenText.includes("use as is") || screenText.includes("'y': use") ||
                                   screenText.includes("to start over") || screenText.includes("r to reroll") ||
                                   screenText.includes("reroll") || screenText.includes("'s' to start") ||
                                   screenText.includes("step back") || screenText.includes("any other key to continue"));
            const isTitleScreen = !inPlay && (screenText.includes('when the world is old') ||
                                              screenText.includes('press any key to continue') ||
                                              screenText.includes('rephial.org') ||
                                              screenText.includes('last battle be gathered'));
            if (isTitleScreen) {
                returnToMainMenu();
                return;
            }
            if (!inPlay) {
                if (isReviewScreen) {
                    network.sendKey('s');
                } else {
                    // Send Escape to step back one question in character birth wizard
                    network.sendKey('escape');
                }
                return;
            }
            const effRealm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (lastFrame && lastFrame.realm) || 'angband';
            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route('escape', lastFrame, effRealm)) {
                    updateTerminalToolbar(lastFrame);
                    if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                    return;
                }
            }
            if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
                window.MenuRouter.clearPending();
            }
            const ui = (lastFrame && lastFrame.ui) || {};
            if ((ui.overlay || 0) > 0 || !ui.awaiting_command || ui.more) {
                network.sendKey('escape');
            }
            forceTerminal = false;
            window.__manualTerminalOpen = false;
            updateViewMode(lastFrame);
        });
    }

    const termExitMenuBtn = document.getElementById('btn-term-exit-menu');
    if (termExitMenuBtn) {
        termExitMenuBtn.addEventListener('click', () => {
            if (audio) audio.unlock();
            cancelQuickBirth();
            if (audio) audio.playMenuNav();
            returnToMainMenu();
        });
    }

    // Unified Mobile Classic Touch Controller Dock (D-pad, Contextual Actions & Letters)
    const termTouchControls = document.getElementById('terminal-touch-controls');
    if (termTouchControls) {
        let lastActionTime = 0;
        let lastTouchEndTime = 0;
        let touchStartBtn = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchMoved = false;
        const executeTouchAction = (btn, ev) => {
            if (!btn || btn.id === 'btn-birth-name-submit' || btn.id === 'btn-birth-name-rand') return;
            if (typeof btn.blur === 'function') btn.blur();
            const now = Date.now();
            if (now - lastActionTime < 140) return; // Debounce rapid physical button jitter
            lastActionTime = now;
            if (ev && ev.cancelable && ev.type !== 'click') ev.preventDefault();
            if (audio) audio.unlock();
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
                window.DeviceProfile.triggerHaptic('light');
            }
            const key = btn.dataset.key;
            const verb = btn.dataset.verb;
            if (!key && !verb) return;
            if (verb) {
                if (verb === 'Escape' || verb === 'escape') {
                    if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
                        window.MenuRouter.clearPending();
                        updateTerminalToolbar(lastFrame);
                        return;
                    }
                }
                if (window.MenuRouter && typeof window.MenuRouter.chooseVerb === 'function') {
                    window.MenuRouter.chooseVerb(verb);
                    const pending = (typeof window.MenuRouter.getPending === 'function') ? window.MenuRouter.getPending() : null;
                    if (!pending || pending.step !== 'await-prompt') {
                        updateTerminalToolbar(lastFrame);
                    }
                    return;
                }
            }
            // Letter Ribbon option buttons (e.g. [a], [b], [*]) must strictly pass their key directly
            if (btn.classList.contains('term-letter-btn')) {
                if (key === '10') {
                    network.sendKey('1');
                    network.sendKey('0');
                    return;
                }
                if (terminal && typeof terminal.setSelectedKey === 'function') {
                    terminal.setSelectedKey(key);
                }
                if (btn.dataset.storeAutoBuy) {
                    const buyCmd = btn.dataset.storeAutoBuy;
                    if (dispatcher && typeof dispatcher.run === 'function') {
                        dispatcher.run({ verb: 'store_buy', item: key, qty: 1 });
                    } else {
                        network.sendKey(buyCmd);
                        network.sendKey(key);
                    }
                    return;
                }
                const realm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (lastFrame && lastFrame.realm) || 'angband';
                if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                    if (window.MenuRouter.route(key, lastFrame, realm)) {
                        updateTerminalToolbar(lastFrame);
                        if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                        return;
                    }
                }
                network.sendKey(key);
                return;
            }
            const effRealm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (lastFrame && lastFrame.realm) || 'angband';
            const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
            const rawTouchScreenText = (lastFrame && lastFrame.term && lastFrame.term.rows)
                ? lastFrame.term.rows.map(r => r.g || '').join('\n')
                : '';
            const screenText = (rawTouchScreenText + '\n' + decodeHengbandText(rawTouchScreenText)).toLowerCase();
            const bf = (SC && SC.birthFlags) ? SC.birthFlags(screenText, effRealm === 'hengband') : {};
            const isChoiceMenu = !inPlay && Boolean(bf.isChoiceMenu);
            const isNamePrompt = !inPlay && Boolean(bf.isNamePrompt);
            if ((key === 'up' || key === 'down') && terminal && typeof terminal.moveSelection === 'function') {
                const pending = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function')
                    ? window.MenuRouter.getPending()
                    : null;
                const scClass = (SC && typeof SC.classify === 'function' && lastFrame)
                    ? SC.classify(lastFrame, effRealm, { decode: decodeHengbandText })
                    : null;
                const inSelectableList = Boolean(
                    (scClass && (scClass.mode === 'item-list' || scClass.mode === 'item-actions')) ||
                    (terminal.currentMode === 'item_prompt' && Array.isArray(terminal.selectableRegions) && terminal.selectableRegions.length > 0)
                );
                if ((pending && pending.step === 'chooser') || inSelectableList) {
                    const nextKey = terminal.moveSelection(key === 'up' ? -1 : 1);
                    if (nextKey) {
                        if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
                        updateTerminalToolbar(lastFrame);
                        return;
                    }
                }
            }
            if (key === 'enter' && inPlay) {
                if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                    if (window.MenuRouter.route('Enter', lastFrame, effRealm)) {
                        updateTerminalToolbar(lastFrame);
                        if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                        return;
                    }
                }
                const scClass = (SC && typeof SC.classify === 'function' && lastFrame)
                    ? SC.classify(lastFrame, effRealm, { decode: decodeHengbandText })
                    : null;
                const inSelectableList = Boolean(
                    (scClass && (scClass.mode === 'item-list' || scClass.mode === 'item-actions')) ||
                    (terminal && terminal.currentMode === 'item_prompt' && Array.isArray(terminal.selectableRegions) && terminal.selectableRegions.length > 0)
                );
                if (inSelectableList && terminal && typeof terminal.getSelectedKey === 'function') {
                    const selKey = terminal.getSelectedKey();
                    if (selKey) {
                        if (window.MenuRouter && typeof window.MenuRouter.route === 'function' && window.MenuRouter.route(selKey, lastFrame, effRealm)) {
                            updateTerminalToolbar(lastFrame);
                            if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                            return;
                        }
                        network.sendKey(selKey);
                        return;
                    }
                }
            }
            if (key === 'tab') {
                // Return from Classic Mode to 3D View
                forceTerminal = false;
                window.__manualTerminalOpen = false;
                updateViewMode();
            } else if (key === 'toggle-run') {
                if (input && typeof input.toggleDpadRunMode === 'function') {
                    input.toggleDpadRunMode();
                }
                return;
            } else if (key === 'mainmenu') {
                cancelQuickBirth();
                if (audio) audio.playMenuNav();
                returnToMainMenu();
            } else if (key === 'escape') {
                if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                    if (window.MenuRouter.route('escape', lastFrame, effRealm)) {
                        updateTerminalToolbar(lastFrame);
                        if (lastFrame && lastFrame.term) terminal.render(lastFrame.term);
                        return;
                    }
                }
                if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
                    window.MenuRouter.clearPending();
                }
                cancelQuickBirth();
                network.sendKey('escape');
            } else if (key === 'enter' && birthReviewActive && !isChoiceMenu && !isNamePrompt) {
                confirmHeroBirth();
            } else if ((key === 'r' || key === 'R') && !inPlay && !isChoiceMenu && !isNamePrompt) {
                const isReviewScreen = screenText.includes("to start over") || screenText.includes("any other key to continue") ||
                                       screenText.includes("use as is") || screenText.includes("r to reroll") ||
                                       screenText.includes("'s' to start") || birthReviewActive;
                if (isReviewScreen) {
                    rerollHero();
                } else {
                    network.sendKey(key);
                }
            } else if ((key === 's' || key === 'S' || key === 'c' || key === 'C') && birthReviewActive && !isChoiceMenu && !isNamePrompt) {
                startCustomHeroCreation();
            } else if (key === 's' && !inPlay && !isChoiceMenu && !isNamePrompt) {
                cancelQuickBirth();
                network.sendKey('s');
            } else {
                // In terminal play mode, check if run toggle is active on directional keys
                const isRunMode = Boolean(input && input.dpadRunMode);
                const isPlayCommand = Boolean(lastFrame && lastFrame.phase === 'play' &&
                    (lastFrame.awaiting_command || (lastFrame.ui && lastFrame.ui.awaiting_command)) &&
                    (!lastFrame.ui || !lastFrame.ui.more) && (!lastFrame.ui || !lastFrame.ui.overlay));
                if (isRunMode && isPlayCommand) {
                    const dirDigits = {
                        'up': 8, 'down': 2, 'left': 4, 'right': 6,
                        'home': 7, 'pageup': 9, 'end': 1, 'pagedown': 3
                    };
                    const d = dirDigits[key];
                    if (d) {
                        if (dispatcher && typeof dispatcher.run === 'function') {
                            dispatcher.run({ keys: ['.', String(d)] });
                        } else {
                            network.sendKey('.');
                            network.sendKey(String(d));
                        }
                        return;
                    }
                }
                network.sendKey(key);
            }
        };
        // Touch handling with swipe rejection (allows scrolling ribbons and menus without false triggers)
        termTouchControls.addEventListener('touchstart', (ev) => {
            if (ev.touches && ev.touches.length === 1) {
                const touch = ev.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                touchMoved = false;
                touchStartBtn = ev.target.closest('[data-key], [data-verb]');
            }
        }, { passive: true });
        termTouchControls.addEventListener('touchmove', (ev) => {
            if (ev.touches && ev.touches.length === 1) {
                const touch = ev.touches[0];
                const dx = Math.abs(touch.clientX - touchStartX);
                const dy = Math.abs(touch.clientY - touchStartY);
                if (dx > 10 || dy > 10) {
                    touchMoved = true;
                }
            }
        }, { passive: true });
        termTouchControls.addEventListener('touchend', (ev) => {
            lastTouchEndTime = Date.now();
            if (!touchMoved && touchStartBtn) {
                executeTouchAction(touchStartBtn, ev);
            }
            touchStartBtn = null;
            touchMoved = false;
        }, { passive: false });
        termTouchControls.addEventListener('touchcancel', () => {
            lastTouchEndTime = Date.now();
            touchStartBtn = null;
            touchMoved = false;
        }, { passive: true });
        // Click listener for desktop mouse interactions (strictly suppresses emulated touch clicks)
        termTouchControls.addEventListener('click', (ev) => {
            if (Date.now() - lastTouchEndTime < 500) {
                // Ignore synthetic emulated click from mobile touch
                return;
            }
            const btn = ev.target.closest('[data-key], [data-verb]');
            if (btn) {
                executeTouchAction(btn, ev);
            }
        });
        // Name submission handling for character creation
        const nameSubmitBtn = document.getElementById('btn-birth-name-submit');
        const nameRandBtn = document.getElementById('btn-birth-name-rand');
        const nameInput = document.getElementById('birth-name-input');
        const submitName = () => {
            if (!nameInput) return;
            const nameVal = nameInput.value.trim();
            if (audio) audio.playWhoosh();
            network.sendKey('C-u');
            for (let i = 0; i < 20; i++) {
                network.sendKey('backspace');
            }
            if (nameVal) {
                for (const ch of nameVal) {
                    network.sendKey(ch);
                }
            }
            network.sendKey('enter');
            nameInput.blur();
        };
        if (nameSubmitBtn) {
            nameSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                submitName();
            });
        }
        if (nameRandBtn) {
            nameRandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const fantasyNames = ['Aegnor', 'Beleg', 'Celegorm', 'Daeron', 'Ecthelion', 'Fingolfin', 'Galdor', 'Hador', 'Idril', 'Luthien', 'Mablung', 'Nimrodel', 'Orodreth', 'Turgon', 'Voronwe'];
                const chosen = fantasyNames[Math.floor(Math.random() * fantasyNames.length)];
                if (nameInput) nameInput.value = chosen;
                submitName();
            });
        }
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitName();
                }
            });
        }
    }

    // Draggable and Resizable Windows Coordinator (Minimap and Message Log)
    function setupDraggableAndResizableWindows() {
        const makeWindowDraggableAndResizable = (winEl, headerEl, resizeHandleEl, storageKey, onResize) => {
            if (!winEl) return;
            // Restore saved position with safe screen bounds
            try {
                const savedPos = localStorage.getItem(storageKey + '_pos');
                if (savedPos) {
                    const pos = JSON.parse(savedPos);
                    if (typeof pos.left === 'number' && typeof pos.top === 'number') {
                        const maxLeft = Math.max(10, window.innerWidth - 60);
                        const maxTop = Math.max(10, window.innerHeight - 40);
                        winEl.style.left = `${Math.max(10, Math.min(pos.left, maxLeft))}px`;
                        winEl.style.top = `${Math.max(10, Math.min(pos.top, maxTop))}px`;
                        winEl.style.right = 'auto';
                        winEl.style.bottom = 'auto';
                    }
                }
            } catch (_) {}
            // Restore saved size with safe minimums
            try {
                const savedSize = localStorage.getItem(storageKey + '_size');
                if (savedSize) {
                    const sz = JSON.parse(savedSize);
                    if (typeof sz.width === 'number' && typeof sz.height === 'number') {
                        const minW = storageKey === 'angband_msg' ? 260 : 140;
                        const minH = storageKey === 'angband_msg' ? 90 : 80;
                        const maxW = storageKey === 'angband_map' ? Math.min(640, window.innerWidth - 20) : (window.innerWidth - 20);
                        const w = Math.max(minW, Math.min(maxW, sz.width));
                        const maxH = storageKey === 'angband_map' ? Math.min(640, window.innerHeight - 20) : (window.innerHeight - 20);
                        const h = Math.max(minH, Math.min(maxH, sz.height));
                        winEl.style.width = `${w}px`;
                        winEl.style.height = `${h}px`;
                        if (onResize) onResize(w, h);
                    }
                }
            } catch (_) {}
            // Dragging via window header (strictly repositions window, never alters dimensions)
            if (headerEl) {
                let isDragging = false;
                let startX = 0, startY = 0;
                let initialLeft = 0, initialTop = 0;
                let fixedW = 0, fixedH = 0;
                const startDrag = (clientX, clientY, e) => {
                    if (e && e.target && e.target.closest('button, input, select, a, kbd')) return;
                    if (e && e.preventDefault) e.preventDefault();
                    isDragging = true;
                    startX = clientX;
                    startY = clientY;
                    const rect = winEl.getBoundingClientRect();
                    initialLeft = rect.left;
                    initialTop = rect.top;
                    fixedW = rect.width;
                    fixedH = rect.height;
                    // Freeze dimensions strictly so dragging NEVER changes size
                    winEl.style.width = `${fixedW}px`;
                    winEl.style.height = `${fixedH}px`;
                    winEl.style.left = `${initialLeft}px`;
                    winEl.style.top = `${initialTop}px`;
                    winEl.style.right = 'auto';
                    winEl.style.bottom = 'auto';
                    headerEl.style.cursor = 'grabbing';
                };
                const moveDrag = (clientX, clientY) => {
                    if (!isDragging) return;
                    const dx = clientX - startX;
                    const dy = clientY - startY;
                    const newLeft = Math.max(0, Math.min(window.innerWidth - 60, initialLeft + dx));
                    const newTop = Math.max(0, Math.min(window.innerHeight - 40, initialTop + dy));
                    winEl.style.left = `${newLeft}px`;
                    winEl.style.top = `${newTop}px`;
                    winEl.style.width = `${fixedW}px`;
                    winEl.style.height = `${fixedH}px`;
                };
                const endDrag = () => {
                    if (isDragging) {
                        isDragging = false;
                        headerEl.style.cursor = 'grab';
                        const rect = winEl.getBoundingClientRect();
                        try {
                            localStorage.setItem(storageKey + '_pos', JSON.stringify({ left: rect.left, top: rect.top }));
                        } catch (_) {}
                    }
                };
                headerEl.addEventListener('mousedown', (e) => {
                    startDrag(e.clientX, e.clientY, e);
                    const onMouseMove = (ev) => moveDrag(ev.clientX, ev.clientY);
                    const onMouseUp = () => {
                        endDrag();
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    };
                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });
                headerEl.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 1) {
                        startDrag(e.touches[0].clientX, e.touches[0].clientY, e);
                    }
                }, { passive: false });
                headerEl.addEventListener('touchmove', (e) => {
                    if (isDragging && e.touches.length === 1) {
                        e.preventDefault();
                        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
                    }
                }, { passive: false });
                const onTouchEnd = () => endDrag();
                headerEl.addEventListener('touchend', onTouchEnd, { passive: true });
                headerEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
                headerEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    winEl.style.position = '';
                    winEl.style.left = '';
                    winEl.style.top = '';
                    winEl.style.right = '';
                    winEl.style.bottom = '';
                    winEl.style.margin = '';
                    try {
                        localStorage.removeItem(storageKey + '_pos');
                    } catch (_) {}
                });
            }
            // Resizing via bottom-right handle
            if (resizeHandleEl) {
                let isResizing = false;
                let startX = 0, startY = 0;
                let initialW = 0, initialH = 0;
                resizeHandleEl.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    isResizing = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    const rect = winEl.getBoundingClientRect();
                    initialW = rect.width;
                    initialH = rect.height;
                    const onMouseMove = (ev) => {
                        if (!isResizing) return;
                        const dx = ev.clientX - startX;
                        const dy = ev.clientY - startY;
                        const newW = Math.max(140, Math.min(window.innerWidth - 20, initialW + dx));
                        const newH = Math.max(50, Math.min(window.innerHeight - 20, initialH + dy));
                        winEl.style.width = `${newW}px`;
                        winEl.style.height = `${newH}px`;
                        if (onResize) onResize(newW, newH);
                    };
                    const onMouseUp = () => {
                        if (isResizing) {
                            isResizing = false;
                            window.removeEventListener('mousemove', onMouseMove);
                            window.removeEventListener('mouseup', onMouseUp);
                            const rect = winEl.getBoundingClientRect();
                            try {
                                localStorage.setItem(storageKey + '_size', JSON.stringify({ width: rect.width, height: rect.height }));
                            } catch (_) {}
                        }
                    };
                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });
            }
        };
        // Initialize Minimap Container Drag & Resize
        const mapWin = document.getElementById('minimap-container');
        const mapHeader = document.getElementById('minimap-header');
        const mapResize = document.getElementById('map-resize-handle');
        makeWindowDraggableAndResizable(mapWin, mapHeader, mapResize, 'angband_map', (w, h) => {
            if (hud && typeof hud.setCustomMinimapSize === 'function') {
                hud.setCustomMinimapSize(w, h);
            }
        });
        // Initialize Message Feed Window Drag & Resize
        const msgWin = document.getElementById('message-feed-window');
        const msgHeader = document.getElementById('message-feed-header');
        const msgResize = document.getElementById('msg-resize-handle');
        makeWindowDraggableAndResizable(msgWin, msgHeader, msgResize, 'angband_msg', null);
        // Initialize Living Chronicle Window Drag & Resize
        const chronicleWin = document.getElementById('chronicle-window');
        const chronicleHeader = document.getElementById('chronicle-header');
        const chronicleResize = document.getElementById('chronicle-resize-handle');
        makeWindowDraggableAndResizable(chronicleWin, chronicleHeader, chronicleResize, 'angband_chronicle', null);
    }
    setupDraggableAndResizableWindows();

    dungeon.audio = audio;
    hud.audio = audio;

    // Initialize The Living Chronicle & Voiced Lorekeeper Coordinator (Web Client Only)
    let chronicleManager = null;
    if (!isApk && typeof ChronicleManager !== 'undefined') {
        chronicleManager = new ChronicleManager();
        chronicleManager.init(dungeon, audio);
        window.chronicleManager = chronicleManager;
        window.dungeon = dungeon;
    } else {
        // Standalone clients: Tome is strictly disabled
        const tomeBtn = document.getElementById('btn-toggle-chronicle');
        if (tomeBtn) tomeBtn.style.display = 'none';
        const tomeWin = document.getElementById('chronicle-window');
        if (tomeWin) tomeWin.style.display = 'none';
    }

    let lastFrame = null;
    let lastScreenModel = null;
    let lastSpells = [];
    const input = new InputController(network, dungeon, terminal, audio, toggleTerminalView);

    let dispatcher = null;
    if (typeof CommandDispatcher !== 'undefined') {
        dispatcher = new CommandDispatcher({
            sendKey: (k) => network && network.sendKey(k),
            getRealm: () => (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || 'angband',
            getLastFrame: () => lastFrame,
            allowUnwindPrompt: true,
            ScreenModel: (typeof ScreenContext !== 'undefined' && ScreenContext.ScreenModel) || null,
            ActionCatalog: (typeof ActionCatalog !== 'undefined') ? ActionCatalog : null,
            onToast: (msg) => (typeof showRealmToast === 'function') ? showRealmToast(msg) : null
        });
    }

    const promptMirror = (typeof PromptMirror !== 'undefined') ? ((typeof PromptMirror === 'function') ? new PromptMirror() : PromptMirror) : null;
    const itemSheet = (typeof ItemSheet !== 'undefined') ? ((typeof ItemSheet === 'function') ? new ItemSheet() : ItemSheet) : null;
    const entityMenu = (typeof EntityMenu !== 'undefined') ? ((typeof EntityMenu === 'function') ? new EntityMenu() : EntityMenu) : null;
    const gamepad = (typeof GamepadController !== 'undefined') ? new GamepadController() : null;
    const radialMenu = (typeof RadialMenu !== 'undefined') ? new RadialMenu() : null;

    if (typeof window !== 'undefined') {
        window.promptMirror = promptMirror;
        window.itemSheet = itemSheet;
        window.entityMenu = entityMenu;
        window.gamepad = gamepad;
        window.radialMenu = radialMenu;
    }

    window.__app = {
        network,
        dispatcher,
        promptMirror,
        itemSheet,
        entityMenu,
        gamepad,
        radialMenu,
        generateHeroName: (r, l) => generateHeroName(r, l),
        get realm() { return (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || 'angband'; },
        get lastScreenModel() { return lastScreenModel; },
        get lastSpells() { return lastSpells; },
        set lastSpells(v) { lastSpells = v; },
        dungeon,
        hud,
        terminal,
        input,
        audio,
        startGame,
        setEngineMode,
        getEngineMode: () => engineMode,
        isApk,
        isForceTerminal: () => forceTerminal,
        setForceTerminal: (val) => { forceTerminal = val; updateViewMode(); },
        toggleTerminalView,
        cancelQuickBirth,
        confirmHeroBirth,
        finalizeHeroBirth,
        rerollHero,
        startCustomHeroCreation,
        startNewRandomHero,
        get inPlay() { return currentPhase === 'play'; },
        isBirthReviewActive: () => birthReviewActive,
        get lastFrame() { return lastFrame; },
        getLastFrame: () => lastFrame,
        showRealmSelector,
        hideRealmSelector,
        showCommandPalette,
        hideCommandPalette,
        toggleItemSheet: (invokerEl) => itemSheet && typeof itemSheet.toggle === 'function' ? itemSheet.toggle(lastFrame, (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm), invokerEl) : null,
        getActiveRealm,
        setActiveRealm,
        selectRealm,
        cycleRealm,
        showRealmToast,
        toggleLanguageMode,
        getLanguageMode,
        setLanguageMode
    };
    let appState = 'splash';
    let guidePreviousState = 'mainMenu';
    let loadPreviousState = 'mainMenu';
    let selectedMenuIndex = 0;
    let selectedPauseIndex = 0;
    let selectedSaveIndex = 0;
    let loadedSaves = [];
    let latestSave = null;
    let lastEnteredShopTile = null;

    // DOM Elements for Intro & Modals
    const splashOverlay = document.getElementById('splash-overlay');
    const mainMenuOverlay = document.getElementById('main-menu-overlay');
    const guideModal = document.getElementById('guide-modal');
    const guideTabs = document.querySelectorAll('.guide-tab');
    const guideContents = document.querySelectorAll('.guide-tab-content');
    const menuOptionBtns = document.querySelectorAll('#main-menu-options .menu-option-btn');

    const loadModal = document.getElementById('load-modal');
    const loadSaveList = document.getElementById('load-save-list');
    const btnLoadBack = document.getElementById('btn-load-back');

    const pauseModal = document.getElementById('pause-modal');
    const pauseCharDisplay = document.getElementById('pause-char-display');
    const pauseOptionBtns = document.querySelectorAll('#pause-menu-options .menu-option-btn');
    const demoModal = document.getElementById('demo-modal');
    const realmModal = document.getElementById('realm-selector-modal');
    const cmdPaletteModal = document.getElementById('command-palette-modal');
    let realmPreviousState = 'mainMenu';
    let cmdPalettePreviousState = 'game';

    // Queue Modal DOM Elements
    const queueModal = document.getElementById('queue-modal');
    const queuePosNum = document.getElementById('queue-pos-num');
    const queueTotalNum = document.getElementById('queue-total-num');
    const queueActiveCount = document.getElementById('queue-active-count');
    const queueLoreText = document.getElementById('queue-lore-text');
    const btnQueueCancel = document.getElementById('btn-queue-cancel');

    // Rotating Angband Lore & Tactical Tips for Queue Screen
    const QUEUE_TIPS = [
        "Corridor Funneling: Never fight multiple monsters in open rooms where they can surround you! Retreat into a 1-tile corridor so foes engage you one by one.",
        "Speed is King: Speed is multiplicative in Angband. Boots, rings, and potions of speed allow you to take multiple actions for every single monster turn.",
        "Emergency Escapes: Always keep at least 5 Scrolls of Phase Door and 3 Scrolls of Teleportation in your pack. Fleeing when low on health is essential.",
        "Light is Life: Subterranean corridors are pitch black. Unlit tiles prevent you from spotting approaching threats. Keep extra torches and oil stocked.",
        "Stairs & Safe Retreat: If a dungeon floor feels too dangerous, ascend back up the staircase immediately to reset the floor and regroup in Town.",
        "Instant Camera Turning: In Angband 3D, turning your camera left or right costs 0 game turns, so you can freely scout around corners without danger."
    ];
    let queueTipIndex = 0;
    let queueTipTimer = null;

    function startQueueTipRotation() {
        if (queueTipTimer) clearInterval(queueTipTimer);
        queueTipIndex = Math.floor(Math.random() * QUEUE_TIPS.length);
        if (queueLoreText) queueLoreText.textContent = QUEUE_TIPS[queueTipIndex];
        queueTipTimer = setInterval(() => {
            queueTipIndex = (queueTipIndex + 1) % QUEUE_TIPS.length;
            if (queueLoreText) {
                queueLoreText.style.opacity = '0';
                setTimeout(() => {
                    queueLoreText.textContent = QUEUE_TIPS[queueTipIndex];
                    queueLoreText.style.opacity = '1';
                }, 300);
            }
        }, 7000);
    }

    function stopQueueTipRotation() {
        if (queueTipTimer) {
            clearInterval(queueTipTimer);
            queueTipTimer = null;
        }
    }

    // State Coordinator Methods
    function getAppState() {
        return appState;
    }

    function hideModals(exceptEl = null) {
        [splashOverlay, mainMenuOverlay, guideModal, loadModal, pauseModal, demoModal, realmModal, cmdPaletteModal, queueModal, pwaModal].forEach(m => {
            if (m && m !== exceptEl) m.classList.add('hidden');
        });
        if (exceptEl !== demoModal && window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        if (exceptEl !== queueModal) stopQueueTipRotation();
        if (terminalContainer && exceptEl !== terminalContainer) terminalContainer.classList.add('hidden');
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
        const btnToggleChronicle = document.getElementById('btn-toggle-chronicle');
        if (btnToggleChronicle) btnToggleChronicle.style.display = 'none';
    }

    function renderMenuBackdropDiorama() {
        if (!dungeon || lastFrame || typeof dungeon.updateDungeon !== 'function') return;
        try {
            const w = 24, h = 24, px = 12, py = 14;
            const rows = [];
            for (let y = 0; y < h; y++) {
                let f = '', l = '', g = '', a = '';
                for (let x = 0; x < w; x++) {
                    const isChamber = (x >= 8 && x <= 16 && y >= 6 && y <= 17);
                    let featHex = '15', glyph = '#', attrHex = '02';
                    if (isChamber) {
                        if (x === 8 || x === 16 || y === 6 || y === 17) {
                            if ((x === 8 || x === 16) && y === 10) { featHex = '12'; glyph = '%'; attrHex = '0b'; }
                            else { featHex = '15'; glyph = '#'; attrHex = '02'; }
                        } else if ((x === 9 || x === 15) && y >= 8 && y <= 13) {
                            featHex = '17'; glyph = '~'; attrHex = '04';
                        } else {
                            featHex = '01'; glyph = '.'; attrHex = '01';
                        }
                    }
                    f += featHex; l += '3'; g += glyph; a += attrHex;
                }
                rows.push({ y, f, l, g, a });
            }
            dungeon.lastPlayerHp = null;
            dungeon.updateDungeon({
                phase: 'play',
                realm: activeRealm || 'angband',
                player: { name: 'Adventurer', race: 'Dwarf', class: 'Warrior', x: px, y: py, depth: 15, hp: 200, hp_max: 200, cur_light: 4, facing: 0 },
                map: { w, h, rows },
                monsters: [],
                objects: []
            });
            dungeon.lastFrame = null;
        } catch (_) {}
    }

    function showSplash() {
        appState = 'splash';
        updateRealmUI();
        hideModals(splashOverlay);
        if (splashOverlay) splashOverlay.classList.remove('hidden');
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuNav();
        renderMenuBackdropDiorama();
    }

    function showMainMenu() {
        appState = 'mainMenu';
        updateRealmUI();
        hideModals(mainMenuOverlay);
        if (mainMenuOverlay) mainMenuOverlay.classList.remove('hidden');
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuOpen();
        if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
            window.MenuRouter.clearPending();
        }
        updateEngineModeUI();
        checkSaves();
        updateMenuSelectionUI();
        renderMenuBackdropDiorama();
    }

    // Load Menu Handler
    async function showLoadMenu(fromPause = false) {
        loadPreviousState = fromPause ? 'pauseMenu' : 'mainMenu';
        appState = 'loadMenu';
        hideModals(loadModal);
        if (loadModal) loadModal.classList.remove('hidden');
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuOpen();
        selectedSaveIndex = 0;
        await fetchAndRenderSaves();
    }

    function hideLoadMenu() {
        if (loadModal) loadModal.classList.add('hidden');
        if (audio) audio.playMenuNav();
        if (loadPreviousState === 'pauseMenu') {
            showPauseMenu();
        } else {
            showMainMenu();
        }
    }

    async function fetchAndRenderSaves() {
        if (!loadSaveList) return;
        loadSaveList.innerHTML = `
            <div class="save-loading-state">
                <div class="spinner"></div>
                <span>Scanning ${engineMode === 'local' ? 'device IndexedDB storage' : 'realm archives'}...</span>
            </div>
        `;
        try {
            if (engineMode === 'local' && window.LocalSaveManager) {
                loadedSaves = await LocalSaveManager.listSaves();
            } else {
                const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (activeRealm || 'angband');
                const res = await fetch(`/api/saves?realm=${encodeURIComponent(realmParam)}`);
                if (res.ok) {
                    const data = await res.json();
                    loadedSaves = data.saves || [];
                } else {
                    loadedSaves = [];
                }
            }
        } catch (err) {
            console.warn('[LoadMenu] Error fetching saves:', err);
            loadedSaves = [];
        }
        renderSaveListUI();
    }

    function renderSaveListUI() {
        if (!loadSaveList) return;
        loadSaveList.innerHTML = '';
        if (loadedSaves.length === 0) {
            loadSaveList.innerHTML = `
                <div class="save-empty-state">
                    <div class="save-empty-icon">📜</div>
                    <div class="save-empty-title">No Saved Games Found</div>
                    <div class="save-empty-desc">You do not have any saved adventurers yet. Begin a new quest from the Main Menu!</div>
                    <button id="btn-empty-start-scratch" class="btn-gold" style="margin-top: 10px;">⚔ Start from Scratch</button>
                </div>
            `;
            const btnScratch = document.getElementById('btn-empty-start-scratch');
            if (btnScratch) {
                btnScratch.addEventListener('click', () => {
                    hideLoadMenu();
                    startNewRandomHero();
                });
            }
            return;
        }
        if (selectedSaveIndex >= loadedSaves.length) {
            selectedSaveIndex = Math.max(0, loadedSaves.length - 1);
        }
        loadedSaves.forEach((save, idx) => {
            const card = document.createElement('div');
            card.className = `save-item-card ${idx === selectedSaveIndex ? 'selected' : ''}`;
            card.dataset.index = idx;
            const modDate = save.lastModified ? new Date(save.lastModified).toLocaleString() : 'Unknown';
            const sizeKb = save.sizeBytes ? `${Math.round(save.sizeBytes / 1024)} KB` : '';
            card.innerHTML = `
                <div class="save-item-left">
                    <span class="save-bullet">►</span>
                    <div class="save-item-details">
                        <div class="save-item-name">${escapeHtml(save.characterName || save.filename)}</div>
                        <div class="save-item-summary">${escapeHtml(save.description || 'Saved Adventurer')}</div>
                        <div class="save-item-meta">Saved ${escapeHtml(modDate)} • ${escapeHtml(sizeKb)}</div>
                    </div>
                </div>
                <div class="save-item-actions">
                    <button class="btn-save-load btn-gold">Load [Enter]</button>
                    <button class="btn-save-download btn-gold-outline" title="Download local copy of save (.sav)">📥 Download</button>
                    <button class="btn-save-delete btn-danger-outline" title="Delete save file">🗑 Delete</button>
                </div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-save-delete') || e.target.closest('.btn-save-download')) return;
                selectedSaveIndex = idx;
                updateSaveSelectionUI();
                loadSelectedSave(save);
            });
            card.addEventListener('mouseenter', () => {
                selectedSaveIndex = idx;
                updateSaveSelectionUI();
            });
            const btnLoad = card.querySelector('.btn-save-load');
            if (btnLoad) {
                btnLoad.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadSelectedSave(save);
                });
            }
            const btnDownload = card.querySelector('.btn-save-download');
            if (btnDownload) {
                btnDownload.addEventListener('click', (e) => {
                    e.stopPropagation();
                    downloadSave(save);
                });
            }
            const btnDelete = card.querySelector('.btn-save-delete');
            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteSelectedSave(save);
                });
            }
            loadSaveList.appendChild(card);
        });
        renderMainMenuSavesPanel();
    }

    function renderMainMenuSavesPanel() {
        const listEl = document.getElementById('main-menu-saves-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!loadedSaves || loadedSaves.length === 0) {
            listEl.innerHTML = '<div style="color:#94a3b8; font-size:11.5px; padding:6px 0;">No saved adventurers in this realm archive.</div>';
            return;
        }
        loadedSaves.forEach((save) => {
            const item = document.createElement('div');
            item.className = 'main-menu-save-item';
            item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(14,20,32,0.6); border:1px solid rgba(212,175,55,0.2); border-radius:6px; cursor:pointer; font-size:12px; margin-bottom:4px; transition:all 0.15s ease;';
            item.innerHTML = `
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:75%;">
                    <strong style="color:#ffd700;">${escapeHtml(save.characterName || save.filename)}</strong>
                    <span style="color:#8892b0; font-size:11px; margin-left:6px;">${escapeHtml(save.description || '')}</span>
                </div>
                <button type="button" class="btn-panel-action" style="color:#38bdf8;">Load ➔</button>
            `;
            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#ffd700';
                item.style.background = 'rgba(28,38,60,0.8)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.borderColor = 'rgba(212,175,55,0.2)';
                item.style.background = 'rgba(14,20,32,0.6)';
            });
            item.addEventListener('click', () => {
                loadSelectedSave(save);
            });
            listEl.appendChild(item);
        });
    }

    function updateSaveSelectionUI() {
        const cards = loadSaveList ? loadSaveList.querySelectorAll('.save-item-card') : [];
        cards.forEach((card, i) => {
            if (i === selectedSaveIndex) {
                card.classList.add('selected');
                card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                card.classList.remove('selected');
            }
        });
    }

    function navigateLoadList(delta = 1) {
        if (loadedSaves.length === 0) return;
        selectedSaveIndex = (selectedSaveIndex + delta + loadedSaves.length) % loadedSaves.length;
        if (audio) audio.playMenuNav();
        updateSaveSelectionUI();
    }

    function loadSelectedSave(save = null) {
        const target = save || (loadedSaves.length > 0 ? loadedSaves[selectedSaveIndex] : null);
        if (!target) return;
        if (audio) audio.playMenuSelect();
        if (loadModal) loadModal.classList.add('hidden');
        startGame({
            charName: target.characterName || 'Adventurer',
            saveFile: target.filename,
            isNew: false,
            autoBirth: false
        });
    }

    async function triggerFileDownload(url, defaultFilename) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error(`Server returned HTTP ${resp.status}`);
            }
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
            return true;
        } catch (err) {
            console.warn('[triggerFileDownload failed, fallback to direct anchor click]', err);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        }
    }

    async function downloadSave(save = null) {
        const target = save || (loadedSaves.length > 0 ? loadedSaves[selectedSaveIndex] : null);
        if (!target || !target.filename) return;
        if (audio) audio.playMenuSelect();
        const outName = (target.characterName || target.filename).replace(/[^a-zA-Z0-9_-]/g, '_') + '.sav';
        if (engineMode === 'local' && window.LocalSaveManager) {
            const bytes = await LocalSaveManager.getSaveData(target.filename);
            if (bytes) {
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = outName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
                return;
            }
        }
        const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (activeRealm || 'angband');
        const url = `/api/saves/${encodeURIComponent(target.filename)}?realm=${encodeURIComponent(realmParam)}`;
        await triggerFileDownload(url, outName);
    }

    function downloadSelectedSave() {
        downloadSave();
    }

    async function uploadSave(file) {
        if (!file) return;
        const statusEl = document.getElementById('save-upload-status');
        if (statusEl) statusEl.textContent = 'Validating savefile...';
        try {
            const buf = await file.arrayBuffer();
            if (buf.byteLength < 36) {
                alert('Selected file is too small to be a valid Angband save file.');
                if (statusEl) statusEl.textContent = '';
                return;
            }
            const header = new TextDecoder('ascii').decode(new Uint8Array(buf.slice(0, 8)));
            if (header !== 'SaveVNLA') {
                alert('Invalid savefile: Missing SaveVNLA header format.');
                if (statusEl) statusEl.textContent = '';
                return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
            if (engineMode === 'local' && window.LocalSaveManager) {
                if (statusEl) statusEl.textContent = 'Saving to device storage...';
                await LocalSaveManager.putSaveData(cleanName, new Uint8Array(buf));
                if (statusEl) {
                    statusEl.textContent = `✓ Saved '${cleanName}' to device!`;
                    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
                }
                if (audio) audio.playMenuSelect();
                await fetchAndRenderSaves();
                checkSaves();
                return;
            }
            if (statusEl) statusEl.textContent = 'Uploading to realm...';
            const ownerToken = localStorage.getItem(`angband3d_owner_${cleanName}`) || '';
            const res = await fetch('/api/saves/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Character-Name': cleanName,
                    'X-Owner-Token': ownerToken
                },
                body: buf
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                alert(`Upload failed: ${errJson.error || res.statusText}`);
                if (statusEl) statusEl.textContent = '';
                return;
            }
            const data = await res.json();
            if (statusEl) {
                statusEl.textContent = `✓ Uploaded '${data.metadata?.characterName || cleanName}'!`;
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
            }
            if (audio) audio.playMenuSelect();
            await fetchAndRenderSaves();
            checkSaves();
        } catch (err) {
            console.error('[Upload Error]', err);
            alert(`Error uploading save: ${err.message}`);
            if (statusEl) statusEl.textContent = '';
        }
    }

    function triggerSaveUpload() {
        const fileInput = document.getElementById('file-save-upload');
        if (fileInput) fileInput.click();
    }

    async function downloadCurrentSave() {
        if (audio) audio.playMenuSelect();
        try {
            network.sendCommand('save');
            network.sendKey('C-s');
        } catch (_) {}
        const banner = document.getElementById('message-text');
        if (banner) {
            banner.textContent = 'Saving progress and preparing export...';
        }
        // Allow engine time to flush authoritative savefile to disk
        await new Promise(r => setTimeout(r, 600));
        try {
            const currentChar = (lastFrame && lastFrame.player && lastFrame.player.name)
                ? lastFrame.player.name.trim()
                : (network.currentChar || 'Adventurer');
            const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (activeRealm || 'angband');
            const res = await fetch(`/api/saves?realm=${encodeURIComponent(realmParam)}`);
            let matchedSave = null;
            if (res.ok) {
                const data = await res.json();
                const saves = data.saves || [];
                matchedSave = saves.find(s =>
                    (s.characterName && s.characterName.toLowerCase() === currentChar.toLowerCase()) ||
                    (s.filename && s.filename.toLowerCase() === currentChar.toLowerCase()) ||
                    (s.filename && s.filename.toLowerCase().startsWith(currentChar.toLowerCase()))
                );
                if (!matchedSave && saves.length > 0) {
                    matchedSave = saves[0];
                }
            }
            const outName = `${currentChar.replace(/[^a-zA-Z0-9_-]/g, '_')}.sav`;
            if (matchedSave) {
                await downloadSave(matchedSave);
                if (banner) banner.textContent = `Exported '${matchedSave.characterName || matchedSave.filename}.sav' successfully!`;
            } else {
                // Direct fallback: Download directly from /api/saves/latest
                const fallbackUrl = `/api/saves/latest?char=${encodeURIComponent(currentChar)}`;
                await triggerFileDownload(fallbackUrl, outName);
                if (banner) banner.textContent = `Exported '${currentChar}.sav' successfully!`;
            }
        } catch (err) {
            console.error('[DownloadCurrentSave Error]', err);
            // Fallback direct download
            const currentChar = (lastFrame && lastFrame.player && lastFrame.player.name)
                ? lastFrame.player.name.trim()
                : (network.currentChar || 'Adventurer');
            const fallbackUrl = `/api/saves/latest?char=${encodeURIComponent(currentChar)}`;
            const outName = `${currentChar.replace(/[^a-zA-Z0-9_-]/g, '_')}.sav`;
            await triggerFileDownload(fallbackUrl, outName);
        }
        resumeGame();
    }

    async function deleteSelectedSave(save = null) {
        const target = save || (loadedSaves.length > 0 ? loadedSaves[selectedSaveIndex] : null);
        if (!target) return;
        const confirmName = target.characterName || target.filename;
        const locationText = engineMode === 'local' ? 'from device storage' : 'permanently from the server';
        if (!window.confirm(`Are you sure you want to delete '${confirmName}' ${locationText}?`)) {
            return;
        }
        if (engineMode === 'local' && window.LocalSaveManager) {
            await LocalSaveManager.deleteSave(target.filename);
            if (audio) audio.playMenuNav();
            await fetchAndRenderSaves();
            checkSaves();
            return;
        }
        try {
            const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (activeRealm || 'angband');
            const ownerToken = localStorage.getItem(`angband3d_owner_${target.filename}`) || '';
            const res = await fetch(`/api/saves/${encodeURIComponent(target.filename)}?realm=${encodeURIComponent(realmParam)}`, { 
                method: 'DELETE',
                headers: {
                    'X-Owner-Token': ownerToken
                }
            });
            if (res.ok) {
                if (audio) audio.playMenuNav();
                // Also clean up local token
                localStorage.removeItem(`angband3d_owner_${target.filename}`);
                await fetchAndRenderSaves();
                checkSaves();
            } else {
                alert(`Failed to delete save: ${res.statusText}`);
            }
        } catch (err) {
            alert(`Error deleting save: ${err.message}`);
        }
    }

    // In-Game Pause Menu Handlers
    function showPauseMenu() {
        appState = 'pauseMenu';
        hideModals(pauseModal);
        if (pauseModal) pauseModal.classList.remove('hidden');
        if (input) input.setTerminalMode(false);
        if (pauseCharDisplay && lastFrame && lastFrame.player) {
            const p = lastFrame.player;
            const charDesc = p.name ? `${p.name} (${p.race || ''} ${p.class || ''})` : 'Hero of Angband';
            pauseCharDisplay.textContent = `Current Character: ${charDesc}`;
        }
        selectedPauseIndex = 0;
        updatePauseMenuSelectionUI();
        if (audio) audio.playMenuOpen();
    }

    function hidePauseMenu() {
        if (pauseModal) pauseModal.classList.add('hidden');
        if (audio) audio.playMenuNav();
    }

    function resumeGame() {
        hidePauseMenu();
        appState = 'game';
        updateViewMode();
    }

    async function saveGameNow() {
        if (network && typeof network.saveGame === 'function') {
            await network.saveGame();
        } else if (network) {
            network.sendCommand('save');
            network.sendKey('C-s');
        }
        if (audio) audio.playMenuSelect();
        const banner = document.getElementById('message-text');
        if (banner) {
            banner.textContent = 'Game Saved Successfully.';
        }
        resumeGame();
    }

    function updatePauseMenuSelectionUI() {
        pauseOptionBtns.forEach((btn, i) => {
            if (i === selectedPauseIndex) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    function navigatePauseMenu(delta = 1) {
        selectedPauseIndex = (selectedPauseIndex + delta + pauseOptionBtns.length) % pauseOptionBtns.length;
        if (audio) audio.playMenuNav();
        updatePauseMenuSelectionUI();
    }

    function selectPauseMenuItem(index) {
        if (index >= 0 && index < pauseOptionBtns.length) {
            selectedPauseIndex = index;
            updatePauseMenuSelectionUI();
        }
    }

    const pauseActions = [
        resumeGame, saveGameNow, downloadCurrentSave, () => showLoadMenu(true),
        startNewRandomHero, startNewCustomHero, () => showGuide(0, 'pauseMenu'),
        () => input && input.toggleFullscreen(), returnToMainMenu
    ];
    function activatePauseMenuItem() {
        if (audio) audio.playMenuSelect();
        const action = pauseActions[selectedPauseIndex];
        if (action) action();
    }

    // Guide Modal Handlers
    function showGuide(tabIndex = 0, fromState = null) {
        guidePreviousState = fromState || appState;
        appState = 'guide';
        hideModals(guideModal);
        if (guideModal) guideModal.classList.remove('hidden');
        if (input) input.setTerminalMode(false);
        switchGuideTab(tabIndex);
        if (audio) audio.playMenuOpen();
    }

    function hideGuide() {
        if (guideModal) guideModal.classList.add('hidden');
        if (audio) audio.playMenuNav();
        if (guidePreviousState === 'splash') {
            showSplash();
        } else if (guidePreviousState === 'pauseMenu') {
            showPauseMenu();
        } else if (guidePreviousState === 'game') {
            appState = 'game';
        } else {
            showMainMenu();
        }
    }

    function switchGuideTab(tabIndex) {
        const idx = Math.max(0, Math.min(guideTabs.length - 1, tabIndex));
        guideTabs.forEach((tab, i) => {
            if (i === idx) tab.classList.add('active');
            else tab.classList.remove('active');
        });
        guideContents.forEach((content, i) => {
            if (i === idx) content.classList.add('active');
            else content.classList.remove('active');
        });
        const body = document.getElementById('guide-body');
        if (body) body.scrollTop = 0;
    }

    function cycleGuideTab(delta = 1) {
        let activeIdx = 0;
        guideTabs.forEach((tab, i) => {
            if (tab.classList.contains('active')) activeIdx = i;
        });
        const newIdx = (activeIdx + delta + guideTabs.length) % guideTabs.length;
        if (audio) audio.playMenuNav();
        switchGuideTab(newIdx);
    }

    function updateMenuSelectionUI() {
        menuOptionBtns.forEach((btn, i) => {
            if (i === selectedMenuIndex) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    function navigateMenu(delta = 1) {
        selectedMenuIndex = (selectedMenuIndex + delta + menuOptionBtns.length) % menuOptionBtns.length;
        if (audio) audio.playMenuNav();
        updateMenuSelectionUI();
    }

    function selectMenuItem(index) {
        if (index >= 0 && index < menuOptionBtns.length) {
            selectedMenuIndex = index;
            updateMenuSelectionUI();
        }
    }

    async function checkSaves() {
        try {
            let saves = [];
            if (engineMode === 'local' && window.LocalSaveManager) {
                saves = await LocalSaveManager.listSaves();
            } else {
                const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (activeRealm || 'angband');
                const res = await fetch(`/api/saves?realm=${encodeURIComponent(realmParam)}`);
                if (res.ok) {
                    const data = await res.json();
                    saves = data.saves || [];
                }
            }
            if (saves && saves.length > 0) {
                latestSave = saves[0];
                loadedSaves = saves;
                const label = document.getElementById('menu-continue-label');
                const desc = document.getElementById('menu-continue-desc');
                const btn = document.getElementById('btn-menu-continue');
                if (label) label.textContent = `Continue (${latestSave.characterName || latestSave.filename})`;
                if (desc) desc.textContent = `${latestSave.description || 'Saved Adventurer'}${latestSave.lastModified ? ' • Modified ' + new Date(latestSave.lastModified).toLocaleTimeString() : ''}`;
                if (btn) btn.style.opacity = '1.0';
                renderMainMenuSavesPanel();
                return;
            }
        } catch (_) {}
        latestSave = null;
        loadedSaves = [];
        const label = document.getElementById('menu-continue-label');
        if (label) label.textContent = 'Continue Adventure';
        const desc = document.getElementById('menu-continue-desc');
        if (desc) desc.textContent = engineMode === 'local'
            ? 'No saved adventurer found in this realm (Choose [3] Quick Start or [4] Custom Hero)'
            : 'No saved adventurer found in this realm (Choose [3] Quick Start or [4] Custom Hero)';
        const btn = document.getElementById('btn-menu-continue');
        if (btn) btn.style.opacity = '0.6';
        renderMainMenuSavesPanel();
    }

    function activateMenuItem(overrideIndex = null) {
        if (audio) audio.playMenuSelect();
        const idx = overrideIndex !== null ? overrideIndex : selectedMenuIndex;
        const menuActions = [
            () => latestSave ? startGame({ charName: latestSave.characterName || 'Adventurer', saveFile: latestSave.filename, isNew: false, autoBirth: false }) : startNewRandomHero(),
            () => showLoadMenu(false), startNewRandomHero, startNewCustomHero,
            () => showGuide(0, 'mainMenu'), () => showPWAModal('mainMenu'),
            () => showGuide(6, 'mainMenu'), () => showGuide(6, 'mainMenu'), () => showSplash()
        ];
        if (menuActions[idx]) menuActions[idx]();
    }

    const REALM_HERO_NAMES = {
        hengband: {
            japanese: ['Musashi', 'Kojiro', 'Nobunaga', 'Masamune', 'Yukimura', 'Hanzo', 'Goemon', 'Raiko', 'Kenshin', 'Shingen', 'Benkei', 'Yoshitsune', 'Tomoe', 'Kotaro', 'Jubei', 'Saizo', 'Sasuke', 'Genji', 'Kiyomori', 'Hideyoshi'],
            amberite: ['Corwin', 'Benedict', 'Eric', 'Random', 'Bleys', 'Brand', 'Gerard', 'Julian', 'Caine', 'Dworkin', 'Merlin', 'Martin', 'Jurt', 'Fiona', 'Llewella']
        },
        silq: ['Beren', 'Fingolfin', 'Feanor', 'Turin', 'Tuor', 'Earendil', 'Hurin', 'Beleg', 'Mablung', 'Finrod', 'Glorfindel', 'Ecthelion', 'Voronwe', 'Daeron', 'Luthien', 'Idril', 'Morwen', 'Celegorm', 'Curufin', 'Maglor'],
        frogcomposband: ['Elric', 'Conan', 'Fafhrd', 'GrayMouser', 'Belgarath', 'Sparrowhawk', 'Corwin', 'Arthur', 'Roland', 'Gwydion', 'Vlad', 'Geralt', 'Locke', 'Kvothe', 'Cugel'],
        angband: ['Aragorn', 'Boromir', 'Faramir', 'Theoden', 'Eomer', 'Bard', 'Beren', 'Isildur', 'Elendil', 'Thorin', 'Gimli', 'Gloin', 'Dain', 'Frodo', 'Samwise']
    };

    function generateHeroName(realmKey = 'angband', lang = 'en') {
        const r = (realmKey || activeRealm || 'angband').toLowerCase();
        let base = 'Hero';
        if (r === 'hengband') {
            const isJp = (lang === 'jp' || langMode === 'jp' || Math.random() < 0.65);
            const pool = isJp ? REALM_HERO_NAMES.hengband.japanese : REALM_HERO_NAMES.hengband.amberite;
            base = pool[Math.floor(Math.random() * pool.length)];
        } else if (r === 'silq') {
            base = REALM_HERO_NAMES.silq[Math.floor(Math.random() * REALM_HERO_NAMES.silq.length)];
        } else if (r === 'frogcomposband') {
            base = REALM_HERO_NAMES.frogcomposband[Math.floor(Math.random() * REALM_HERO_NAMES.frogcomposband.length)];
        } else {
            base = REALM_HERO_NAMES.angband[Math.floor(Math.random() * REALM_HERO_NAMES.angband.length)];
        }
        const existingSet = new Set(
            Array.isArray(loadedSaves)
                ? loadedSaves.map(s => String(s.filename || s.characterName || '').toLowerCase())
                : []
        );
        for (let attempt = 0; attempt < 25; attempt++) {
            const suffix = attempt < 12
                ? Math.floor(10 + Math.random() * 90)
                : Math.floor(100 + Math.random() * 900);
            const candidate = `${base}_${suffix}`;
            if (!existingSet.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
        return `${base}_${Math.floor(100 + Math.random() * 900)}`;
    }

    let hasEnteredPlay = false;
    let lastClientSnapshotMs = 0;
    let lastSnapshotDepth = null;
    let restoreSaveInFlight = false;

    let snapshotInFlight = false;
    let snapshotIdleTimer = null;
    async function snapshotClientSaveToIndexedDB(slotName, realmKey) {
        if (snapshotInFlight || !slotName || engineMode === 'local' || typeof window === 'undefined' || !window.LocalSaveManager) return;
        const cleanSlot = String(slotName).replace(/\.sav$/i, '').trim();
        if (!cleanSlot) return;
        const effRealm = realmKey || activeRealm || 'angband';
        snapshotInFlight = true;
        try {
            const resp = await fetch(`/api/saves/${encodeURIComponent(cleanSlot)}?realm=${encodeURIComponent(effRealm)}`);
            if (!resp.ok) return;
            const buf = await resp.arrayBuffer();
            if (buf && buf.byteLength >= 36) {
                const bytes = new Uint8Array(buf);
                await window.LocalSaveManager.putSaveData(`${effRealm}:${cleanSlot}`, bytes);
            }
        } catch (_) {
        } finally {
            snapshotInFlight = false;
        }
    }

    async function restoreClientSaveToServer(slotName, realmKey) {
        if (restoreSaveInFlight || !slotName || typeof window === 'undefined' || !window.LocalSaveManager) return false;
        const cleanSlot = String(slotName).replace(/\.sav$/i, '').trim();
        if (!cleanSlot) return false;
        const effRealm = realmKey || activeRealm || 'angband';
        restoreSaveInFlight = true;
        try {
            let bytes = await window.LocalSaveManager.getSaveData(`${effRealm}:${cleanSlot}`);
            if (!bytes) {
                bytes = await window.LocalSaveManager.getSaveData(cleanSlot);
            }
            if (!bytes || bytes.byteLength < 36) return false;
            const ownerToken = localStorage.getItem(`angband3d_owner_${cleanSlot}`) ||
                               (network && network.currentChar ? localStorage.getItem(`angband3d_owner_${network.currentChar}`) : '') || '';
            const res = await fetch(`/api/saves/upload?realm=${encodeURIComponent(effRealm)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Save-Slot': cleanSlot,
                    'X-Character-Name': cleanSlot,
                    'X-Realm': effRealm,
                    'X-Owner-Token': ownerToken
                },
                body: bytes
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data && data.ownerToken) {
                    try { localStorage.setItem(`angband3d_owner_${cleanSlot}`, data.ownerToken); } catch (_) {}
                }
                const resolvedSlot = (data && data.filename) ? data.filename : cleanSlot;
                if (network) {
                    network.sessionId = null;
                    network.currentSave = resolvedSlot;
                    try {
                        localStorage.removeItem('angband3d_session_id');
                        localStorage.setItem('angband3d_session_save', resolvedSlot);
                    } catch (_) {}
                    network.connect(network.currentChar || resolvedSlot, false, resolvedSlot, effRealm);
                }
                return true;
            }
        } catch (err) {
            console.warn('[Angband3D] Failed to restore client save to server:', err);
        } finally {
            setTimeout(() => { restoreSaveInFlight = false; }, 2500);
        }
        return false;
    }

    function stepOfflineClientPrediction(cmd) {
        if (!lastFrame || lastFrame.phase !== 'play' || !lastFrame.map || !lastFrame.player) return;
        const keySpec = cmd.startsWith('key ') ? cmd.slice(4).trim().toLowerCase() : (cmd.startsWith('keys .') ? cmd.slice(6).trim() : null);
        if (!keySpec) return;
        const dirDeltaMap = {
            'up': { dx: 0, dy: -1 }, '8': { dx: 0, dy: -1 }, 'k': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 }, '2': { dx: 0, dy: 1 }, 'j': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 }, '4': { dx: -1, dy: 0 }, 'h': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }, '6': { dx: 1, dy: 0 }, 'l': { dx: 1, dy: 0 },
            'home': { dx: -1, dy: -1 }, '7': { dx: -1, dy: -1 }, 'y': { dx: -1, dy: -1 },
            'pageup': { dx: 1, dy: -1 }, '9': { dx: 1, dy: -1 }, 'u': { dx: 1, dy: -1 },
            'end': { dx: -1, dy: 1 }, '1': { dx: -1, dy: 1 }, 'b': { dx: -1, dy: 1 },
            'pagedown': { dx: 1, dy: 1 }, '3': { dx: 1, dy: 1 }, 'n': { dx: 1, dy: 1 }
        };
        const delta = dirDeltaMap[keySpec];
        if (!delta) return;
        const px = lastFrame.player.x;
        const py = lastFrame.player.y;
        const nx = px + delta.dx;
        const ny = py + delta.dy;
        const rows = lastFrame.map.rows || [];
        if (ny < 0 || ny >= rows.length || nx < 0 || nx >= (lastFrame.map.w || 80)) return;
        const rowObj = rows[ny];
        if (!rowObj) return;
        const feat = rowObj.f ? parseInt(rowObj.f.substring(nx * 2, nx * 2 + 2), 16) : 0;
        const glyph = rowObj.g ? rowObj.g.charAt(nx) : ' ';
        const isWall = (feat >= 15 && feat <= 22) || feat === 30 || feat === 2 || glyph === '#' || glyph === '%' || glyph === '+';
        if (isWall) return;
        const hasMonster = Array.isArray(lastFrame.monsters) && lastFrame.monsters.some(m => m && m.x === nx && m.y === ny && m.ml !== false);
        if (hasMonster) return;
        lastFrame.player.x = nx;
        lastFrame.player.y = ny;
        lastFrame.seq = (lastFrame.seq || 0) + 1;
        try {
            if (dungeon && typeof dungeon.updateDungeon === 'function') {
                dungeon.updateDungeon(lastFrame);
            }
            if (hud && typeof hud.update === 'function') {
                hud.update(lastFrame);
            }
            if (terminal && lastFrame.term && (needsTerminal(lastFrame) || forceTerminal)) {
                terminal.render(lastFrame.term);
            }
        } catch (_) {}
    }

    function startNewRandomHero() {
        const heroName = generateHeroName(activeRealm);
        startGame({
            charName: heroName,
            saveFile: heroName,
            isNew: true,
            autoBirth: true
        });
    }

    function startNewCustomHero() {
        const heroName = generateHeroName(activeRealm);
        startGame({
            charName: heroName,
            saveFile: heroName,
            isNew: true,
            autoBirth: false
        });
    }

    async function startGame(options) {
        appState = 'game';
        hasEnteredPlay = false;
        lastClientSnapshotMs = 0;
        lastSnapshotDepth = null;
        hideModals();
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
        if (window.__startWatchdog) clearTimeout(window.__startWatchdog);
        quickBirthActive = !!options.autoBirth;
        quickBirthStep = 0;
        forceTerminal = false;
        lastFrame = null;
        if (window.__dungeonRenderer) {
            window.__dungeonRenderer.userPitchOffset = 0.0;
        }
        if (hud && typeof hud.resetMessages === 'function') {
            hud.resetMessages();
        }
        if (options.isNew && window.chronicleManager && typeof window.chronicleManager.resetForNewCharacter === 'function') {
            window.chronicleManager.resetForNewCharacter({ name: options.charName });
        }
        const chosenRealm = options.realm || activeRealm || 'angband';
        if (chosenRealm === 'hengband') {
            try {
                await loadHengLang();
            } catch (err) {
                console.warn('[Angband3D] Failed to load Hengband language data prior to connect:', err);
            }
        }
        // Watchdog: If engine fails to respond or socket hangs after dictionary load, dismiss loading overlay and return to menu
        if (window.__startWatchdog) clearTimeout(window.__startWatchdog);
        window.__startWatchdog = setTimeout(() => {
            if (loadingOverlay && !loadingOverlay.classList.contains('hidden') && !lastFrame) {
                console.warn('[Angband3D] Game start watchdog: engine response timed out after 20s.');
                loadingOverlay.classList.add('hidden');
                showRealmToast(`⚠️ Connection timed out while starting realm "${chosenRealm}". Please check server.`);
                returnToMainMenu();
            }
        }, 20000);
        network.connect(options.charName || 'Adventurer', !!options.isNew, options.saveFile || null, chosenRealm);
    }

    async function reloadLastSave() {
        console.log('[Angband3D] Reloading last living save game after death...');
        if (hud) {
            hud.isDeadInPlay = false;
            if (typeof hud.hideDeathModal === 'function') {
                hud.hideDeathModal();
            }
        }
        try {
            // Disconnect and terminate the dead session cleanly so the server does not attempt to reconnect to it
            if (network && typeof network.leaveSession === 'function') {
                network.leaveSession();
            } else if (network) {
                network.disconnect();
            }
        } catch (_) {}
        // Identify which character/save to load
        const currentChar = (lastFrame && lastFrame.player && lastFrame.player.name)
            ? lastFrame.player.name
            : (network.currentChar || 'Adventurer');
        let targetSave = null;
        try {
            let saves = [];
            if (engineMode === 'local' && window.LocalSaveManager) {
                saves = await LocalSaveManager.listSaves();
            } else {
                const realmParam = (network && network.currentRealm) || (window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : activeRealm) || 'angband';
                const res = await fetch(`/api/saves?realm=${encodeURIComponent(realmParam)}`);
                if (res.ok) {
                    const data = await res.json();
                    saves = data.saves || [];
                }
            }
            if (saves && saves.length > 0) {
                targetSave = saves.find(s =>
                    (s.characterName && s.characterName.toLowerCase() === currentChar.toLowerCase()) ||
                    (s.filename && s.filename.toLowerCase() === currentChar.toLowerCase()) ||
                    (s.filename && s.filename.toLowerCase().startsWith(currentChar.toLowerCase()))
                );
                if (!targetSave) {
                    targetSave = saves[0];
                }
            }
        } catch (e) {
            console.warn('[Angband3D] Failed to fetch save list for reload:', e);
        }
        if (targetSave) {
            console.log('[Angband3D] Reloading living save:', targetSave);
            startGame({
                charName: targetSave.characterName || currentChar || 'Adventurer',
                saveFile: targetSave.filename,
                isNew: false,
                autoBirth: false
            });
        } else {
            console.log('[Angband3D] No existing save found. Starting fresh hero...');
            startNewRandomHero();
        }
    }

    async function returnToMainMenu() {
        if (audio) audio.playMenuOpen();
        cancelQuickBirth();
        try {
            const isDead = Boolean(hud && hud.isDeadInPlay) ||
                           Boolean(network && network.isDead) ||
                           Boolean(lastFrame && lastFrame.player && (lastFrame.player.dead || (lastFrame.player.hp !== undefined && lastFrame.player.hp <= 0 && lastFrame.player.hp_max > 0)));
            if (currentPhase === 'play' && !isDead) {
                if (network && typeof network.saveAndDisconnect === 'function') {
                    await network.saveAndDisconnect();
                } else if (network) {
                    network.sendCommand('save');
                    network.disconnect();
                }
            } else {
                // If exiting during character creation / setup or after death, immediately terminate and discard session without saving
                if (network && typeof network.leaveSession === 'function') {
                    network.leaveSession();
                } else if (network) {
                    network.disconnect();
                }
            }
        } catch (_) {}
        if (hud && typeof hud.hideDeathModal === 'function') {
            hud.hideDeathModal();
        }
        if (hud && typeof hud.resetMessages === 'function') {
            hud.resetMessages();
        }
        if (window.chronicleManager) {
            if (typeof window.chronicleManager.stopStoryPlayback === 'function') window.chronicleManager.stopStoryPlayback();
            if (typeof window.chronicleManager.hideWindow === 'function') window.chronicleManager.hideWindow();
        }
        const btnToggleChronicle = document.getElementById('btn-toggle-chronicle');
        if (btnToggleChronicle) btnToggleChronicle.style.display = 'none';
        if (window.__startWatchdog) {
            clearTimeout(window.__startWatchdog);
            window.__startWatchdog = null;
        }
        if (queueModal) queueModal.classList.add('hidden');
        stopQueueTipRotation();
        if (terminalContainer) terminalContainer.classList.add('hidden');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        showMainMenu();
    }

    // Fast Tactile Tap Helper for Mobile / Touch Devices with swipe cancellation and click suppression
    function bindFastTap(el, fn) {
        if (!el || !fn) return;
        let lastActionTime = 0;
        let lastTouchEndTime = 0;
        let startX = 0, startY = 0, moved = false;
        const trigger = (e) => {
            const now = Date.now();
            if (now - lastActionTime < 250) return;
            lastActionTime = now;
            if (e && e.cancelable && e.type !== 'click') e.preventDefault();
            if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
            fn(e);
        };
        el.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                moved = false;
            }
        }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length === 1) {
                const dx = Math.abs(e.touches[0].clientX - startX);
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dx > 10 || dy > 10) moved = true;
            }
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            lastTouchEndTime = Date.now();
            if (!moved) {
                trigger(e);
            }
            moved = false;
        }, { passive: false });
        el.addEventListener('touchcancel', () => {
            lastTouchEndTime = Date.now();
            moved = false;
        }, { passive: true });
        el.addEventListener('click', (e) => {
            if (Date.now() - lastTouchEndTime < 500) return; // Suppress synthetic click from touch
            trigger(e);
        });
    }

    // Attach DOM event listeners for splash billboard & compatibility buttons
    if (splashOverlay) {
        bindFastTap(splashOverlay, (e) => {
            if (e && e.target && e.target.closest('.sr-only-test-compat')) return;
            if (appState === 'splash') {
                showMainMenu();
            }
        });
    }
    const btnSplashStart = document.getElementById('btn-splash-start');
    if (btnSplashStart) bindFastTap(btnSplashStart, () => showMainMenu());

    const btnSplashQuickStart = document.getElementById('btn-splash-quick-start');
    if (btnSplashQuickStart) {
        bindFastTap(btnSplashQuickStart, () => {
            showMainMenu();
            activateMenuItem(2); // Option [3]: Quick Start (Random Hero)
        });
    }

    const btnSplashLoadSave = document.getElementById('btn-splash-load-save');
    if (btnSplashLoadSave) {
        bindFastTap(btnSplashLoadSave, () => {
            showMainMenu();
            const panel = document.getElementById('main-menu-saves-panel');
            if (panel) {
                panel.classList.remove('hidden');
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                showLoadMenu(false);
            }
        });
    }

    // Keyboard shortcuts for splash screen: [Q] Quick Start, [L] Saved Chronicles (when not Hengband)
    window.addEventListener('keydown', (e) => {
        if (appState === 'splash') {
            if (e.key === 'q' || e.key === 'Q') {
                e.preventDefault();
                const btnQuick = document.getElementById('btn-splash-quick-start');
                if (btnQuick) btnQuick.click();
            } else if ((e.key === 'l' || e.key === 'L') && activeRealm !== 'hengband') {
                e.preventDefault();
                const btnLoad = document.getElementById('btn-splash-load-save');
                if (btnLoad) btnLoad.click();
            }
        }
    });

    const btnSplashMenu = document.getElementById('btn-splash-menu');
    if (btnSplashMenu) bindFastTap(btnSplashMenu, () => showMainMenu());

    // Splash screen 4 interactive realm cards
    const splashCards = document.querySelectorAll('.splash-realm-card');
    splashCards.forEach((card) => {
        const rKey = card.dataset.realm;
        bindFastTap(card, () => {
            if (rKey) {
                selectRealm(rKey, false);
            }
        });
        card.addEventListener('dblclick', () => {
            if (rKey) {
                selectRealm(rKey, false);
                showMainMenu();
            }
        });
    });

    const splashHengbandLang = document.getElementById('splash-hengband-lang-select');
    if (splashHengbandLang) {
        splashHengbandLang.addEventListener('change', (e) => {
            setLanguageMode(e.target.value);
        });
    }

    [['btn-splash-guide', 0], ['btn-splash-features', 1], ['btn-splash-chronicle', 1], ['btn-splash-protips', 4], ['btn-splash-credits', 6]].forEach(([id, tab]) => {
        const el = document.getElementById(id);
        if (el) bindFastTap(el, () => showGuide(tab, 'splash'));
    });

    const btnSplashDemo = document.getElementById('btn-splash-demo');
    if (btnSplashDemo) {
        if (isStandaloneApp()) {
            btnSplashDemo.innerHTML = '<kbd>[D]</kbd> 🎬 Gameplay Demo <span style="font-size:11px; opacity:0.85; margin-left:2px;">(Web ↗)</span>';
            btnSplashDemo.title = 'Watch official narrated 1080p gameplay showcase on angband3d.com (opens in default web browser)';
        }
        bindFastTap(btnSplashDemo, () => showDemoModal('splash'));
    }

    const btnSplashStandalone = document.getElementById('btn-splash-standalone');
    if (btnSplashStandalone) bindFastTap(btnSplashStandalone, () => showPWAModal('splash'));

    const splashNoticeDownload = document.getElementById('splash-notice-download');
    if (splashNoticeDownload) bindFastTap(splashNoticeDownload, () => showPWAModal('splash'));

    // Main Menu secondary dock buttons ([5] Guide, [6] Downloads, [7] Demo, [8] Credits)
    const menuDockBtns = document.querySelectorAll('.main-menu-secondary-dock .menu-dock-btn');
    menuDockBtns.forEach((btn) => {
        const idx = parseInt(btn.dataset.index, 10);
        bindFastTap(btn, () => activateMenuItem(idx));
    });

    const btnMenuPwa = document.getElementById('btn-menu-pwa');
    if (btnMenuPwa) bindFastTap(btnMenuPwa, () => showPWAModal('mainMenu'));

    const btnMenuDemo = document.getElementById('btn-menu-demo');
    if (btnMenuDemo) {
        if (isStandaloneApp()) {
            const label = btnMenuDemo.querySelector('.menu-label');
            const desc = btnMenuDemo.querySelector('.menu-desc');
            if (label) label.textContent = '🎬 Gameplay Demo & Feature Showcase (Web ↗)';
            if (desc) desc.textContent = 'Opens the official 1080p narrated showcase on angband3d.com in your web browser.';
        }
        bindFastTap(btnMenuDemo, () => showDemoModal('mainMenu'));
    }

    [['btn-menu-guide', () => showGuide(0, 'mainMenu')], ['btn-menu-credits', () => showGuide(6, 'mainMenu')], ['btn-menu-realms', () => showRealmSelector('mainMenu')]].forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) bindFastTap(el, fn);
    });
    const menuRealmSelect = document.getElementById('main-menu-realm-select');
    if (menuRealmSelect) {
        menuRealmSelect.addEventListener('change', (e) => {
            if (e.target && e.target.value) {
                selectRealm(e.target.value, false);
                if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
            }
        });
    }
    const menuHengbandLang = document.getElementById('main-menu-hengband-lang-select');
    if (menuHengbandLang) {
        menuHengbandLang.addEventListener('change', (e) => {
            if (e.target && e.target.value) {
                setLanguageMode(e.target.value);
            }
        });
    }
    const btnSplashRealms = document.getElementById('btn-splash-realms');
    if (btnSplashRealms) bindFastTap(btnSplashRealms, (e) => { if (e && e.stopPropagation) e.stopPropagation(); showRealmSelector('splash'); });
    const btnSplashCommands = document.getElementById('btn-splash-commands');
    if (btnSplashCommands) bindFastTap(btnSplashCommands, (e) => { if (e && e.stopPropagation) e.stopPropagation(); showCommandPalette('splash'); });

    // Inline 1-click realm switcher pills inside Main Menu
    const menuRealmPills = document.querySelectorAll('.realm-pill-btn[data-switch-realm]');
    menuRealmPills.forEach((pill) => {
        const rKey = pill.dataset.switchRealm;
        bindFastTap(pill, () => {
            if (rKey) {
                selectRealm(rKey, false);
                if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
            }
        });
    });

    // Main Menu compatibility alias buttons & integrated saves panel controls
    const btnMenuLoadSave = document.getElementById('btn-menu-load-save');
    if (btnMenuLoadSave) bindFastTap(btnMenuLoadSave, () => {
        const panel = document.getElementById('main-menu-saves-panel');
        if (panel) {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            showLoadMenu(false);
        }
    });

    [['btn-menu-quick-start', () => activateMenuItem(2)], ['btn-menu-new-game', () => activateMenuItem(3)], ['btn-menu-switch-realm', () => showSplash()], ['btn-menu-how-to-play', () => showGuide(0, 'mainMenu')], ['btn-menu-controls', () => showGuide(4, 'mainMenu')], ['btn-menu-audio', () => { if (audio && typeof audio.toggleMute === 'function') { audio.toggleMute(); syncAudioUI(); } }], ['btn-menu-saves-close', () => { const p = document.getElementById('main-menu-saves-panel'); if (p) p.classList.add('hidden'); }], ['btn-menu-saves-refresh', () => { checkSaves(); fetchAndRenderSaves(); }]].forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) bindFastTap(el, fn);
    });

    const inputMenuUploadSave = document.getElementById('input-menu-upload-save');
    if (inputMenuUploadSave) {
        inputMenuUploadSave.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadSave(e.target.files[0]);
            }
        });
    }

    const btnLoadRealmSwitch = document.getElementById('btn-load-realm-switch');
    if (btnLoadRealmSwitch) bindFastTap(btnLoadRealmSwitch, () => showRealmSelector('loadMenu'));

    const btnHudRealm = document.getElementById('btn-hud-realm');
    if (btnHudRealm) {
        bindFastTap(btnHudRealm, () => {
            const realm = REALM_DATA[activeRealm] || REALM_DATA.angband;
            showRealmToast(`Active Realm: ${realm.name} • Locked during active dungeon descent.`);
        });
    }

    const btnCommandPalette = document.getElementById('btn-command-palette');
    if (btnCommandPalette) {
        bindFastTap(btnCommandPalette, () => {
            if (typeof window.__toggleCategorizedActionPopover === 'function') {
                window.__toggleCategorizedActionPopover();
            } else {
                showCommandPalette('game');
            }
        });
    }
    const btnTermGrimoireToggle = document.getElementById('btn-term-grimoire-toggle');
    if (btnTermGrimoireToggle) {
        bindFastTap(btnTermGrimoireToggle, () => {
            if (window.RealmGrimoireDeck && typeof window.RealmGrimoireDeck.toggleMode === 'function') {
                window.RealmGrimoireDeck.toggleMode();
                updateTerminalToolbar(lastFrame);
            }
        });
    }

    // Audio Volume & Mute Control Synchronization
    function syncAudioUI() {
        if (!audio) return;
        const isMuted = audio.isMuted();
        const volPct = Math.round(audio.getMasterVolume() * 100);
        const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const btnSound = document.getElementById('btn-sound');
        if (btnSound) {
            btnSound.innerHTML = `<span class="sound-icon">${isMuted ? '🔇' : '🔊'}</span><span class="sound-label">${isMuted ? 'Muted' : 'Sound'}</span>`;
            btnSound.title = isMuted ? 'Unmute Sound' : 'Mute Sound';
            btnSound.classList.toggle('muted', isMuted);
        }
        setVal('volume-slider', volPct);
        setTxt('volume-label', isMuted ? '0%' : `${volPct}%`);
        setTxt('popover-vol-badge', isMuted ? '🔇 Muted' : `${volPct}%`);
        setVal('popover-volume-slider', volPct);
        const btnPopoverMute = document.getElementById('btn-popover-mute');
        if (btnPopoverMute) {
            btnPopoverMute.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
            btnPopoverMute.classList.toggle('muted', isMuted);
        }
        const voiceVol = (window.chronicleManager && window.chronicleManager.audio && typeof window.chronicleManager.audio.getVoiceVolume === 'function')
            ? window.chronicleManager.audio.getVoiceVolume()
            : (parseFloat(localStorage.getItem('angband3d_tome_voice_volume')) || 1.0);
        const voicePct = Math.round(voiceVol * 100);
        setTxt('popover-voice-badge', isMuted ? '0%' : `${voicePct}%`);
        setVal('popover-voice-slider', voicePct);
        const sfxVol = (audio && typeof audio.getSfxVolume === 'function') ? audio.getSfxVolume() : 1.0;
        const sfxPct = Math.round(sfxVol * 100);
        setTxt('popover-sfx-badge', isMuted ? '0%' : `${sfxPct}%`);
        setVal('popover-sfx-slider', sfxPct);
        const revVol = (window.chronicleManager && window.chronicleManager.audio && typeof window.chronicleManager.audio.reverbWet === 'number')
            ? window.chronicleManager.audio.reverbWet
            : (parseFloat(localStorage.getItem('angband_chronicle_reverb')) || 0.10);
        const revPct = Math.round(revVol * 100);
        setTxt('popover-reverb-badge', `${revPct}%`);
        setVal('popover-reverb-slider', revPct);
        document.querySelectorAll('.vol-preset-btn').forEach(btn => {
            const bVol = parseInt(btn.dataset.vol, 10);
            btn.classList.toggle('active', (isMuted && bVol === 0) || (!isMuted && bVol === volPct));
        });
        const btnPauseMute = document.getElementById('btn-pause-mute');
        if (btnPauseMute) {
            btnPauseMute.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
            btnPauseMute.classList.toggle('muted', isMuted);
        }
        setVal('pause-volume-slider', volPct);
        setTxt('pause-volume-label', isMuted ? '0%' : `${volPct}%`);
    }
    window.__syncAudioUI = syncAudioUI;

    // Audio Configuration Popover Drawer Lifecycle
    let popoverDismissTimer = null;
    function showQuickVolumePopover() {
        const pop = document.getElementById('quick-volume-popover');
        if (!pop) return;
        pop.classList.remove('hidden');
        clearTimeout(popoverDismissTimer);
        popoverDismissTimer = setTimeout(() => {
            pop.classList.add('hidden');
        }, 7500);
    }

    function hideQuickVolumePopover() {
        const pop = document.getElementById('quick-volume-popover');
        if (pop) pop.classList.add('hidden');
        clearTimeout(popoverDismissTimer);
    }

    // Attach Fast-Tap to #btn-sound (Top Right Bar)
    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
        bindFastTap(btnSound, () => {
            if (audio) {
                audio.unlock();
                const isMuted = audio.toggleMute();
                if (!isMuted && typeof audio.playMenuSelect === 'function') {
                    audio.playMenuSelect();
                }
                syncAudioUI();
            }
            showQuickVolumePopover();
        });
    }

    // Attach Fast-Tap to #btn-sound-config (Gear Icon Button)
    const btnSoundConfig = document.getElementById('btn-sound-config');
    if (btnSoundConfig) {
        bindFastTap(btnSoundConfig, () => {
            const pop = document.getElementById('quick-volume-popover');
            if (pop && !pop.classList.contains('hidden')) {
                hideQuickVolumePopover();
            } else {
                if (audio) audio.unlock();
                syncAudioUI();
                showQuickVolumePopover();
            }
        });
    }

    // Desktop volume slider input listener
    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            if (audio) {
                audio.unlock();
                const val = parseInt(volSlider.value, 10) / 100;
                audio.setMasterVolume(val);
                if (audio.isMuted() && val > 0) audio.setMute(false);
                syncAudioUI();
            }
        });
        volSlider.addEventListener('change', (e) => {
            e.stopPropagation();
            if (audio && !audio.isMuted() && typeof audio.playMenuNav === 'function') {
                audio.playMenuNav();
            }
        });
        volSlider.addEventListener('click', (e) => e.stopPropagation());
    }

    // Quick Volume Popover Controls Wiring
    const quickVolPop = document.getElementById('quick-volume-popover');
    if (quickVolPop) {
        quickVolPop.addEventListener('mouseenter', () => clearTimeout(popoverDismissTimer));
        quickVolPop.addEventListener('mouseleave', () => showQuickVolumePopover());
    }

    const btnPopoverClose = document.getElementById('btn-popover-close');
    if (btnPopoverClose) {
        bindFastTap(btnPopoverClose, () => hideQuickVolumePopover());
    }

    const btnPopoverMute = document.getElementById('btn-popover-mute');
    if (btnPopoverMute) {
        bindFastTap(btnPopoverMute, () => {
            if (audio) {
                audio.unlock();
                const isMuted = audio.toggleMute();
                if (!isMuted && typeof audio.playMenuSelect === 'function') {
                    audio.playMenuSelect();
                }
                syncAudioUI();
                showQuickVolumePopover();
            }
        });
    }

    function bindPopoverSlider(id, onChange, onNavSound = false) {
        const slider = document.getElementById(id);
        if (!slider) return;
        const handler = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            onChange(parseInt(slider.value, 10) / 100);
            syncAudioUI();
            showQuickVolumePopover();
        };
        slider.addEventListener('input', handler);
        slider.addEventListener('change', (e) => {
            handler(e);
            if (onNavSound && audio && !audio.isMuted() && typeof audio.playMenuNav === 'function') audio.playMenuNav();
        });
        slider.addEventListener('click', (e) => e.stopPropagation());
        slider.addEventListener('touchstart', (e) => { e.stopPropagation(); clearTimeout(popoverDismissTimer); }, { passive: true });
        slider.addEventListener('touchend', () => showQuickVolumePopover(), { passive: true });
    }
    bindPopoverSlider('popover-volume-slider', (val) => {
        if (audio) { audio.unlock(); audio.setMasterVolume(val); if (audio.isMuted() && val > 0) audio.setMute(false); }
    }, true);
    bindPopoverSlider('popover-voice-slider', (val) => {
        if (window.chronicleManager && window.chronicleManager.audio) window.chronicleManager.audio.setVoiceVolume(val);
        else try { localStorage.setItem('angband3d_tome_voice_volume', val.toString()); } catch (_) {}
    });
    bindPopoverSlider('popover-sfx-slider', (val) => {
        if (audio) { audio.unlock(); audio.setSfxVolume(val); }
    }, true);
    bindPopoverSlider('popover-reverb-slider', (val) => {
        if (window.chronicleManager && window.chronicleManager.audio) window.chronicleManager.audio.setReverbVolume(val);
        else try { localStorage.setItem('angband_chronicle_reverb', val.toString()); } catch (_) {}
    });

    // Preset volume buttons ([Mute], [25%], [50%], [75%], [100%])
    const presetBtns = document.querySelectorAll('.vol-preset-btn');
    presetBtns.forEach(btn => {
        bindFastTap(btn, () => {
            const volPct = parseInt(btn.dataset.vol, 10);
            if (audio) {
                audio.unlock();
                if (volPct === 0) {
                    audio.setMute(true);
                } else {
                    audio.setMasterVolume(volPct / 100);
                    audio.setMute(false);
                    if (typeof audio.playMenuSelect === 'function') {
                        audio.playMenuSelect();
                    }
                }
                syncAudioUI();
                showQuickVolumePopover(); // reset timer
            }
        });
    });

    // Dismiss popover on touch outside
    window.addEventListener('click', (e) => {
        if (!e.target.closest('#sound-control-group, #quick-volume-popover, #btn-sound, #btn-sound-config')) {
            hideQuickVolumePopover();
        }
    });
    window.addEventListener('touchstart', (e) => {
        if (!e.target.closest('#sound-control-group, #quick-volume-popover, #btn-sound, #btn-sound-config')) {
            hideQuickVolumePopover();
        }
    }, { passive: true });

    // Pause Menu Mute Button & Volume Slider
    const btnPauseMute = document.getElementById('btn-pause-mute');
    if (btnPauseMute) {
        bindFastTap(btnPauseMute, () => {
            if (audio) {
                audio.unlock();
                const isMuted = audio.toggleMute();
                if (!isMuted && typeof audio.playMenuSelect === 'function') {
                    audio.playMenuSelect();
                }
                syncAudioUI();
            }
        });
    }

    const pauseVolSlider = document.getElementById('pause-volume-slider');
    if (pauseVolSlider) {
        pauseVolSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            if (audio) {
                audio.unlock();
                const val = parseInt(pauseVolSlider.value, 10) / 100;
                audio.setMasterVolume(val);
                if (audio.isMuted() && val > 0) audio.setMute(false);
                syncAudioUI();
            }
        });
        pauseVolSlider.addEventListener('change', (e) => {
            e.stopPropagation();
            if (audio && !audio.isMuted() && typeof audio.playMenuNav === 'function') {
                audio.playMenuNav();
            }
        });
        pauseVolSlider.addEventListener('click', (e) => e.stopPropagation());
    }

    syncAudioUI();

    if (splashOverlay) {
        splashOverlay.addEventListener('click', (e) => {
            // Clicking buttons, shortcut actions, links, or badges advances via their own dedicated handler
            if (e.target.closest('button') || e.target.closest('.splash-shortcut-btn') || e.target.closest('.splash-realm-badge-btn') || e.target.closest('a')) return;
            showMainMenu();
        });
    }

    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
        btnMenu.addEventListener('click', () => {
            if (appState === 'game') {
                showPauseMenu();
            } else {
                returnToMainMenu();
            }
        });
    }

    menuOptionBtns.forEach((btn, idx) => {
        bindFastTap(btn, () => {
            selectedMenuIndex = idx;
            updateMenuSelectionUI();
            activateMenuItem();
        });
        btn.addEventListener('mouseenter', () => {
            selectedMenuIndex = idx;
            updateMenuSelectionUI();
        });
    });

    pauseOptionBtns.forEach((btn, idx) => {
        bindFastTap(btn, () => {
            selectedPauseIndex = idx;
            updatePauseMenuSelectionUI();
            activatePauseMenuItem();
        });
        btn.addEventListener('mouseenter', () => {
            selectedPauseIndex = idx;
            updatePauseMenuSelectionUI();
        });
    });

    if (btnLoadBack) {
        btnLoadBack.addEventListener('click', () => hideLoadMenu());
    }

    const btnSaveUpload = document.getElementById('btn-save-upload');
    const fileSaveUpload = document.getElementById('file-save-upload');
    if (btnSaveUpload && fileSaveUpload) {
        btnSaveUpload.addEventListener('click', () => {
            fileSaveUpload.click();
        });
        fileSaveUpload.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                uploadSave(e.target.files[0]);
                fileSaveUpload.value = '';
            }
        });
    }

    if (loadModal) {
        const loadCard = loadModal.querySelector('.load-card');
        loadModal.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (loadCard) loadCard.classList.add('drag-over');
        });
        loadModal.addEventListener('dragleave', (e) => {
            if (e.target === loadModal && loadCard) {
                loadCard.classList.remove('drag-over');
            }
        });
        loadModal.addEventListener('drop', (e) => {
            e.preventDefault();
            if (loadCard) loadCard.classList.remove('drag-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                uploadSave(e.dataTransfer.files[0]);
            }
        });
    }

    // Guide Modal & Controls Toolbar Listeners
    const btnControls = document.getElementById('btn-controls');
    if (btnControls) {
        btnControls.addEventListener('click', () => {
            showGuide(1, appState === 'game' ? 'game' : null);
        });
    }

    const btnGuideHud = document.getElementById('btn-guide-hud');
    if (btnGuideHud) {
        btnGuideHud.addEventListener('click', () => {
            showGuide(2, 'game');
        });
    }

    const btnGuideClose = document.getElementById('btn-guide-close');
    if (btnGuideClose) {
        btnGuideClose.addEventListener('click', () => hideGuide());
    }

    const btnGuideBack = document.getElementById('btn-guide-back');
    if (btnGuideBack) {
        btnGuideBack.addEventListener('click', () => hideGuide());
    }

    guideTabs.forEach((tab, idx) => {
        tab.addEventListener('click', () => switchGuideTab(idx));
    });

    // PWA Standalone App Installation
    let deferredInstallPrompt = null;
    const pwaModal = document.getElementById('pwa-modal');
    const pwaStatusText = document.getElementById('pwa-status-text');
    const btnPwaInstallAction = document.getElementById('btn-pwa-install-action');
    const btnPwaClose = document.getElementById('btn-pwa-close');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        updatePWAInstallUI();
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        updatePWAInstallUI();
    });

    function isPWAStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    function updatePWAInstallUI() {
        const isStandalone = isPWAStandalone();
        if (pwaStatusText) {
            if (isStandalone) {
                pwaStatusText.innerHTML = '<span style="color:#4ade80;">✓ Currently running as an installed standalone app.</span>';
            } else if (deferredInstallPrompt) {
                pwaStatusText.innerHTML = '<span style="color:#ffd700;">★ Ready to install! Tap below to install directly.</span>';
            } else {
                pwaStatusText.textContent = 'Ready to install via your browser menu or Home Screen.';
            }
        }
        if (btnPwaInstallAction) {
            btnPwaInstallAction.style.display = (!isStandalone && deferredInstallPrompt) ? 'inline-flex' : 'none';
        }
    }

    let pwaPreviousState = 'mainMenu';

    function showPWAModal(fromState = null) {
        pwaPreviousState = fromState || appState || 'mainMenu';
        appState = 'pwaModal';
        updatePWAInstallUI();
        hideModals(pwaModal);
        if (pwaModal) pwaModal.classList.remove('hidden');
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuOpen();
    }

    function hidePWAModal() {
        if (pwaModal) pwaModal.classList.add('hidden');
        if (audio) audio.playMenuNav();
        if (pwaPreviousState === 'splash') {
            showSplash();
        } else if (pwaPreviousState === 'pauseMenu') {
            showPauseMenu();
        } else {
            showMainMenu();
        }
    }

    function installPWA() {
        if (isPWAStandalone()) {
            showPWAModal();
            return;
        }
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    deferredInstallPrompt = null;
                    updatePWAInstallUI();
                }
            });
        } else {
            showPWAModal();
        }
    }

    const btnPwaHeaderClose = document.getElementById('btn-pwa-header-close');
    if (btnPwaClose) bindFastTap(btnPwaClose, () => hidePWAModal());
    if (btnPwaHeaderClose) bindFastTap(btnPwaHeaderClose, () => hidePWAModal());
    if (pwaModal) {
        pwaModal.addEventListener('click', (e) => {
            if (e.target === pwaModal) {
                hidePWAModal();
            }
        });
    }
    if (btnPwaInstallAction) {
        bindFastTap(btnPwaInstallAction, () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                deferredInstallPrompt.userChoice.then((choice) => {
                    if (choice.outcome === 'accepted') {
                        deferredInstallPrompt = null;
                        hidePWAModal();
                    }
                });
            }
        });
    }

    // =========================================================================
    // Multi-Realm Architecture & Lorekeeper Attunement Handlers (v8.9.3)
    // Note: REALM_DATA, activeRealm, and langMode are declared at top of DOMContentLoaded
    // =========================================================================
    let realmToastTimeout = null;
    function showRealmToast(message) {
        let toast = document.getElementById('realm-toast-banner');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'realm-toast-banner';
            toast.className = 'realm-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span style="font-size: 20px;">🌌</span><span>${escapeHtml(message)}</span>`;
        toast.classList.add('show');
        if (realmToastTimeout) clearTimeout(realmToastTimeout);
        realmToastTimeout = setTimeout(() => {
            if (toast) toast.classList.remove('show');
        }, 3200);
    }

    function getActiveRealm() {
        return activeRealm;
    }

    function setActiveRealm(realmKey) {
        if (appState === 'game') {
            const current = REALM_DATA[activeRealm] || REALM_DATA.angband;
            showRealmToast(`Active Realm: ${current.name} • Realm cannot be switched during an active dungeon crawl. Return to Main Menu to switch.`);
            return false;
        }
        if (!REALM_DATA[realmKey]) return false;
        activeRealm = realmKey;
        window.activeRealm = realmKey;
        window.__activeRealm = realmKey;
        window.__langMode = (activeRealm === 'hengband') ? langMode : 'en';
        if (dungeon) dungeon.realm = realmKey;
        try {
            localStorage.setItem('angband3d_active_realm', realmKey);
        } catch (_) {}
        updateRealmUI();
        // Attune living chronicle tradition and lorekeeper voice profile
        if (window.chronicleManager) {
            try {
                const grounder = window.chronicleManager.grounder || window.ChronicleGrounder;
                const tradition = (grounder && typeof grounder.getTraditionForRealm === 'function')
                    ? grounder.getTraditionForRealm(realmKey)
                    : (realmKey === 'frogcomposband' ? 'mythicbard' : realmKey === 'hengband' ? 'easternmythos' : realmKey === 'silq' ? 'beleriand' : 'westmarch');
                window.chronicleManager.tradition = tradition;
                if (window.chronicleManager.audio && typeof window.chronicleManager.audio.setTradition === 'function') {
                    window.chronicleManager.audio.setTradition(tradition);
                }
                if (window.chronicleManager.audio && typeof window.chronicleManager.audio.setRealm === 'function') {
                    window.chronicleManager.audio.setRealm(realmKey);
                }
                if (typeof window.chronicleManager.updateTraditionBadge === 'function') {
                    window.chronicleManager.updateTraditionBadge();
                }
            } catch (_) {}
        }
        if (audio) {
            if (typeof audio.playMenuSelect === 'function') {
                audio.playMenuSelect();
            } else if (typeof audio.playMenuOpen === 'function') {
                audio.playMenuOpen();
            }
        }
        return true;
    }

    function selectRealm(realmKey, autoClose = false) {
        if (appState === 'game') {
            const current = REALM_DATA[activeRealm] || REALM_DATA.angband;
            showRealmToast(`Active Realm: ${current.name} • Realm cannot be switched during an active dungeon crawl.`);
            return;
        }
        if (!REALM_DATA[realmKey]) return;
        setActiveRealm(realmKey);
        if (realmKey === 'hengband') {
            loadHengLang();
        }
        // Invariant: Changing realm immediately invalidates any stale saves and session ID from the previous realm
        latestSave = null;
        loadedSaves = [];
        if (typeof network !== 'undefined' && network) {
            network.sessionId = null;
            network.currentRealm = realmKey;
            try {
                localStorage.removeItem('angband3d_session_id');
                localStorage.removeItem('angband3d_session_save');
                localStorage.setItem('angband3d_session_realm', realmKey);
            } catch (_) {}
        }
        const realm = REALM_DATA[realmKey];
        showRealmToast(`Realm Attuned: ${realm.name} • ${realm.tagline}`);
        updateRealmUI();
        checkSaves();
        if (autoClose) {
            setTimeout(() => {
                if (appState === 'realmModal') {
                    hideRealmSelector();
                }
            }, 450);
        }
    }

    function cycleRealm(delta = 1) {
        if (appState === 'game') return;
        const realms = ['angband', 'frogcomposband', 'hengband', 'silq'];
        const currentIdx = realms.indexOf(activeRealm);
        const nextIdx = (currentIdx + delta + realms.length) % realms.length;
        selectRealm(realms[nextIdx], false);
    }

    // Multilingual Language State for Hengband (langMode is declared at top of DOMContentLoaded)
    function getLanguageMode() {
        return langMode;
    }

    function setLanguageMode(mode) {
        if (activeRealm !== 'hengband') {
            langMode = 'en';
            window.__langMode = 'en';
            return;
        }
        if (mode !== 'en' && mode !== 'bilingual' && mode !== 'jp') mode = 'en';
        langMode = mode;
        window.__langMode = mode;
        try {
            localStorage.setItem('angband3d_lang_mode', mode);
        } catch (_) {}
        updateLanguageUI();
        const desc = mode === 'en' ? 'English (純英語)' : (mode === 'jp' ? 'Japanese / 漢字 (Kanji)' : 'Bilingual (日本語 + English)');
        showRealmToast(`🌐 Hengband Language Mode: ${desc} [Alt+L]`);
        if (audio && typeof audio.playMenuNav === 'function') audio.playMenuNav();
        // If in setup or play, re-render terminal & HUD to reflect updated language immediately
        const effFrame = window.__lastFrame || lastFrame || (window.__app && window.__app.lastFrame);
        if (effFrame) {
            updateViewMode(effFrame);
            if (terminal && terminal.render) {
                terminal.render(effFrame.term || terminal.lastTermData || {});
            }
            if (hud && typeof hud.update === 'function') {
                hud.update(effFrame);
            }
            if (input && typeof input.updateContextualControls === 'function') {
                input.updateContextualControls(effFrame);
            }
            updateTerminalToolbar(effFrame);
        } else if (terminal && terminal.render && terminal.lastTermData) {
            terminal.render(terminal.lastTermData);
            updateTerminalToolbar();
        }
        // Refresh 3D dungeon creature overhead nameplates and item caption labels immediately
        if (dungeon) {
            if (typeof dungeon.refreshMonsterNameplates === 'function') {
                dungeon.refreshMonsterNameplates();
            }
            if (typeof dungeon.refreshItemCaptions === 'function') {
                dungeon.refreshItemCaptions();
            }
        }
        if (typeof window !== 'undefined' && window.__dungeon && window.__dungeon !== dungeon) {
            if (typeof window.__dungeon.refreshMonsterNameplates === 'function') {
                window.__dungeon.refreshMonsterNameplates();
            }
            if (typeof window.__dungeon.refreshItemCaptions === 'function') {
                window.__dungeon.refreshItemCaptions();
            }
        }
    }

    function toggleLanguageMode() {
        if (activeRealm !== 'hengband') return;
        const next = langMode === 'en' ? 'bilingual' : (langMode === 'bilingual' ? 'jp' : 'en');
        setLanguageMode(next);
    }

    function updateLanguageUI() {
        const btnLang = document.getElementById('btn-toggle-lang');
        const langLabel = document.getElementById('hud-lang-label');
        const isHengband = activeRealm === 'hengband';
        const effLang = isHengband ? langMode : 'en';
        window.__langMode = effLang;
        if (btnLang) {
            btnLang.style.display = isHengband ? 'inline-flex' : 'none';
            btnLang.classList.toggle('lang-kanji', isHengband && langMode === 'jp');
            btnLang.classList.toggle('lang-bilingual', isHengband && langMode === 'bilingual');
            btnLang.title = `Switch Language: Currently ${effLang === 'en' ? 'English' : effLang === 'jp' ? 'Kanji (日本語)' : 'Bilingual'} [Alt+L]`;
        }
        if (langLabel) {
            langLabel.textContent = effLang === 'en' ? 'EN' : (effLang === 'jp' ? '漢 (JP)' : 'EN/漢');
        }
        // Delegate to WebHUD to update all HUD widgets, stats, gauges, action bar, death screen, dpad, and minimap
        if (hud && typeof hud.updateLanguageUI === 'function') {
            hud.updateLanguageUI(activeRealm, effLang);
        }
        if (window.HengTranslate && typeof window.HengTranslate.setMode === 'function') {
            window.HengTranslate.setMode(effLang);
        }
        if (window.chronicleManager && typeof window.chronicleManager.updateLanguageUI === 'function') {
            window.chronicleManager.updateLanguageUI();
        }
        // Main Menu / Pause Menu Localization
        const continueLabel = document.getElementById('menu-continue-label');
        if (continueLabel) {
            if (isHengband && langMode === 'jp') continueLabel.textContent = '冒険を続ける';
            else if (isHengband && langMode === 'bilingual') continueLabel.textContent = 'Continue Adventure (冒険継続)';
            else continueLabel.textContent = 'Continue Adventure';
        }
        const loadLabel = document.querySelector('#btn-menu-load .menu-label');
        if (loadLabel) {
            if (isHengband && langMode === 'jp') loadLabel.textContent = 'セーブデータを読込...';
            else if (isHengband && langMode === 'bilingual') loadLabel.textContent = 'Load Saved Character (記録読込)...';
            else loadLabel.textContent = 'Load Saved Character...';
        }
        const randLabel = document.querySelector('#btn-menu-random .menu-label');
        if (randLabel) {
            if (isHengband && langMode === 'jp') randLabel.textContent = 'クイックスタート (ランダム英雄)';
            else if (isHengband && langMode === 'bilingual') randLabel.textContent = 'Quick Start (即時開始)';
            else randLabel.textContent = 'Quick Start (Random Hero)';
        }
        const custLabel = document.querySelector('#btn-menu-custom .menu-label');
        if (custLabel) {
            if (isHengband && langMode === 'jp') custLabel.textContent = 'キャラクター作成 (詳細)';
            else if (isHengband && langMode === 'bilingual') custLabel.textContent = 'Custom Hero (英雄作成)';
            else custLabel.textContent = 'Custom Hero (Character Wizard)';
        }
    }

    function updateRealmUI() {
        if (typeof document !== 'undefined' && document.body) {
            document.body.dataset.realm = activeRealm || 'angband';
        }
        updateLanguageUI();
        const realm = REALM_DATA[activeRealm] || REALM_DATA.angband;
        const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        // 1. Splash Screen UI Synchronization
        setTxt('splash-active-realm-name', realm.name);
        setTxt('splash-cta-realm-name', realm.name);
        setTxt('splash-lore-title', `${realm.name}:`);
        setTxt('splash-lore-desc', realm.desc || realm.tagline);
        document.querySelectorAll('.splash-realm-card').forEach((card) => {
            const isMatch = card.dataset.realm === activeRealm;
            card.classList.toggle('active', isMatch);
            card.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            const badge = card.querySelector('.splash-realm-badge');
            if (badge) badge.style.display = isMatch ? 'block' : 'none';
        });
        const splashLangSelect = document.getElementById('splash-hengband-lang-select');
        if (splashLangSelect) {
            try { const storedLang = localStorage.getItem('angband3d_lang_mode') || 'en'; splashLangSelect.value = (storedLang === 'jp' ? 'jp' : 'en'); } catch (_) {}
        }
        // 2. Main Menu UI Synchronization
        setTxt('menu-active-realm-name', realm.name);
        setTxt('main-menu-subtitle', `${realm.tagline} • ${realm.voiceAccent}`);
        setTxt('main-menu-realm-tagline', `${realm.tagline} • ${realm.voiceAccent}`);
        const menuRealmSelect = document.getElementById('main-menu-realm-select');
        if (menuRealmSelect && menuRealmSelect.value !== activeRealm) {
            menuRealmSelect.value = activeRealm;
        }
        const menuLangWrap = document.getElementById('main-menu-hengband-lang-wrap');
        if (menuLangWrap) {
            menuLangWrap.classList.toggle('hidden', activeRealm !== 'hengband');
            menuLangWrap.style.display = (activeRealm === 'hengband') ? 'inline-flex' : 'none';
        }
        const menuLangSelect = document.getElementById('main-menu-hengband-lang-select');
        if (menuLangSelect) {
            try { const storedLang = localStorage.getItem('angband3d_lang_mode') || 'en'; menuLangSelect.value = storedLang; } catch (_) {}
        }
        document.querySelectorAll('.realm-pill-btn[data-switch-realm]').forEach((pill) => {
            const isPillMatch = pill.dataset.switchRealm === activeRealm;
            pill.classList.toggle('active', isPillMatch);
            pill.setAttribute('aria-selected', isPillMatch ? 'true' : 'false');
        });
        // 3. Modals & HUD Synchronization
        setTxt('load-active-realm-name', realm.name);
        setTxt('hud-realm-label', realm.name);
        const btnHud = document.getElementById('btn-hud-realm');
        if (btnHud) btnHud.title = `Active Realm: ${realm.name} (Locked during gameplay. Return to Main Menu to switch).`;
        setTxt('realm-modal-active-title', realm.name);
        setTxt('realm-modal-active-voice', realm.voiceAccent);
        const btnReturn = document.getElementById('btn-realm-modal-return');
        if (btnReturn) btnReturn.innerHTML = `[Esc / Enter] Return with <strong>${escapeHtml(realm.name)}</strong> Attuned`;
        document.querySelectorAll('.realm-card').forEach((card) => {
            const isMatch = card.dataset.realm === activeRealm;
            card.classList.toggle('active', isMatch);
            const badge = card.querySelector('.realm-card-badge');
            if (badge) badge.style.display = isMatch ? 'block' : 'none';
            const btn = card.querySelector('.btn-realm-select');
            if (btn) {
                btn.className = isMatch ? 'btn-realm-select btn-gold' : 'btn-realm-select btn-gold-outline';
                btn.textContent = isMatch ? '✓ Active Realm (Selected)' : 'Switch to Realm';
            }
        });
        const langSelect = document.getElementById('hengband-lang-select');
        if (langSelect) {
            try { const storedLang = localStorage.getItem('angband3d_lang_mode') || 'en'; langSelect.value = storedLang; } catch (_) {}
        }
        // 4. Action Bar Synchronization (Variant actions & bilingual labels via RealmKeys)
        if (typeof RealmKeys !== 'undefined') {
            if (typeof RealmKeys.setActiveRealm === 'function') RealmKeys.setActiveRealm(activeRealm);
            if (typeof RealmKeys.applyLabels === 'function') RealmKeys.applyLabels(document, activeRealm, langMode);
        }
    }

    function showRealmSelector(fromState = 'mainMenu') {
        if (fromState === 'game' || appState === 'game') {
            const realm = REALM_DATA[activeRealm] || REALM_DATA.angband;
            showRealmToast(`Active Realm: ${realm.name} • Locked during active gameplay. Return to Main Menu to switch.`);
            return;
        }
        realmPreviousState = fromState;
        appState = 'realmModal';
        updateRealmUI();
        hideModals(realmModal);
        if (realmModal) realmModal.classList.remove('hidden');
        if (audio) audio.playMenuOpen();
    }

    function hideRealmSelector() {
        if (realmModal) realmModal.classList.add('hidden');
        if (audio) audio.playMenuNav();
        if (realmPreviousState === 'splash') {
            showSplash();
        } else if (realmPreviousState === 'loadMenu') {
            showLoadMenu(false);
        } else {
            showMainMenu();
        }
    }

    function setupRealmModalEvents() {
        const btnClose = document.getElementById('btn-realm-modal-close');
        const btnReturn = document.getElementById('btn-realm-modal-return');
        if (btnClose) bindFastTap(btnClose, () => hideRealmSelector());
        if (btnReturn) bindFastTap(btnReturn, () => hideRealmSelector());
        if (realmModal) {
            realmModal.addEventListener('click', (e) => {
                if (e.target === realmModal) hideRealmSelector();
            });
        }
        const cards = document.querySelectorAll('.realm-card');
        cards.forEach((card) => {
            const realmKey = card.dataset.realm;
            const btn = card.querySelector('.btn-realm-select');
            if (btn) {
                bindFastTap(btn, (e) => {
                    if (e && e.stopPropagation) e.stopPropagation();
                    selectRealm(realmKey, true);
                });
            }
        });
        const langSelect = document.getElementById('hengband-lang-select');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                window.__langMode = val;
                try {
                    localStorage.setItem('angband3d_lang_mode', val);
                } catch (_) {}
            });
            langSelect.addEventListener('click', (e) => e.stopPropagation());
            langSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        }
    }

    // =========================================================================
    // Roguelike Command Reference & Palette Registry (Card WS42.4B, §6.8 #4)
    // Delegated 100% to CommandPalette (server/public/js/command-palette.js)
    // =========================================================================
    function getRealmCommandRegistry(realmKey, lang) {
        if (typeof CommandPalette !== 'undefined' && typeof CommandPalette.listForRealm === 'function') {
            return CommandPalette.listForRealm(realmKey, lang);
        }
        return [];
    }

    const getCommandPaletteCommands = getRealmCommandRegistry;

    function renderCommandPalette() {
        if (typeof CommandPalette !== 'undefined' && typeof CommandPalette.render === 'function') {
            CommandPalette.render();
        }
    }

    function executePaletteCommand(cmd) {
        if (typeof CommandPalette !== 'undefined' && typeof CommandPalette.execute === 'function') {
            CommandPalette.execute(cmd);
        }
    }

    function showCommandPalette(fromState = 'game') {
        if (typeof CommandPalette !== 'undefined' && typeof CommandPalette.show === 'function') {
            CommandPalette.show(fromState);
        }
    }

    function hideCommandPalette() {
        if (typeof CommandPalette !== 'undefined' && typeof CommandPalette.hide === 'function') {
            CommandPalette.hide();
        }
    }

    function setupCommandPaletteEvents() {
        if (typeof CommandPalette !== 'undefined' && typeof CommandPalette.setupEvents === 'function') {
            CommandPalette.setupEvents();
        }
    }

    // Gameplay Demo & Commercial Showcase Modal Handlers
    let demoPreviousState = 'mainMenu';

    function showDemoModal(fromState = null) {
        return;
    }

    function hideDemoModal() {
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') {
            window.demoPlayer.close();
        } else if (demoModal) {
            demoModal.classList.add('hidden');
        }
        if (audio) audio.playMenuNav();
        if (demoPreviousState === 'splash') {
            showSplash();
        } else if (demoPreviousState === 'pauseMenu') {
            showPauseMenu();
        } else {
            showMainMenu();
        }
    }

    // Expose full coordinator interface to window.__app for input controller
    Object.assign(window.__app, {
        getAppState: () => appState,
        setAppState: (s) => { appState = s; },
        showSplash,
        showMainMenu,
        showDemoModal,
        hideDemoModal,
        showLoadMenu,
        hideLoadMenu,
        showPWAModal,
        hidePWAModal,
        installPWA,
        navigateLoadList,
        loadSelectedSave,
        deleteSelectedSave,
        downloadSave,
        downloadSelectedSave,
        uploadSave,
        triggerSaveUpload,
        downloadCurrentSave,
        showPauseMenu,
        resumeGame,
        navigatePauseMenu,
        selectPauseMenuItem,
        activatePauseMenuItem,
        showGuide,
        hideGuide,
        switchGuideTab,
        cycleGuideTab,
        isGuideOpen: () => appState === 'guide' || (guideModal && !guideModal.classList.contains('hidden')),
        startNewRandomHero,
        startNewCustomHero,
        startCustomHeroCreation,
        startGame,
        rerollHero,
        reloadLastSave,
        returnToMainMenu,
        navigateMenu,
        selectMenuItem,
        activateMenuItem
    });

    function updateTerminalChoices(frame) {
        // Native Angband 80x24 terminal zoom & cursor navigation replaced artificial choice chips
    }

    let lastCtxActionsHtml = '';
    function setCtxActions(html) {
        const termCtxActions = document.getElementById('term-contextual-actions');
        if (!termCtxActions) return;
        if (lastCtxActionsHtml === html && termCtxActions.innerHTML === html) return;
        lastCtxActionsHtml = html;
        termCtxActions.innerHTML = html;
    }

    /**
     * WS5.3 Action-bar deduplication: renders structured contextual action buttons.
     * @param {Array<{key: string, badge?: string, label: string, gold?: boolean, outline?: boolean, extraCls?: string}>} buttons
     * @returns {string} HTML markup
     */
    function renderCtxButtons(buttons) {
        if (!Array.isArray(buttons)) return '';
        return buttons.map(b => {
            const goldCls = b.gold ? ' btn-gold' : (b.outline ? ' btn-gold-outline' : '');
            const extra = b.extraCls ? ' ' + escapeHtml(b.extraCls) : '';
            const badge = b.badge !== undefined ? escapeHtml(b.badge) : `[${escapeHtml(b.key)}]`;
            return `<button type="button" class="term-ctx-btn${goldCls}${extra}" data-key="${escapeHtml(b.key)}"><span>${badge}</span> ${escapeHtml(b.label)}</button>`;
        }).join('\n');
    }

    let lastPopulatedLetters = '';
    let _lastToolbarSig = null;

    // Japanese-to-English translation mapping for Hengband character creation & HUD
    const JP_TERM_TRANSLATIONS = {
        '女性': 'Female', '男性': 'Male',
        '人間': 'Human', 'ハーフエルフ': 'Half-Elf', 'エルフ': 'Elf', 'ホビット': 'Hobbit', 'ノーム': 'Gnome',
        'ドワーフ': 'Dwarf', 'ハーフオーク': 'Half-Orc', 'ハーフトロル': 'Half-Troll', 'ハーフトロール': 'Half-Troll',
        'アンバライト': 'Amberite', 'ハイエルフ': 'High-Elf', '野蛮人': 'Barbarian', 'ハーフオーガ': 'Half-Ogre',
        '半巨人': 'Half-Giant', '半タイタン': 'Half-Titan', 'サイクロプス': 'Cyclops', 'イーク': 'Yeek',
        'クラッコン': 'Klackon', 'コボルド': 'Kobold', 'ニーベルング': 'Nibelung', 'ダークエルフ': 'Dark-Elf',
        'ドラコニアン': 'Draconian', 'マインドフレア': 'Mindflayer', 'インプ': 'Imp', 'ゴーレム': 'Golem',
        '骸骨': 'Skeleton', 'ゾンビ': 'Zombie', '吸血鬼': 'Vampire', '幽霊': 'Spectre', '妖精': 'Sprite',
        '獣人': 'Beastman', 'エント': 'Ent', 'アルコン': 'Archon', 'バルログ': 'Balrog', 'ドゥナダン': 'Dúnadan',
        '影フェアリー': 'Shadow-Fairy', 'クター': 'Kutar', 'アンドロイド': 'Android', 'マーフォーク': 'Merfolk',
        '戦士': 'Warrior', 'メイジ': 'Mage', 'プリースト': 'Priest', '盗賊': 'Rogue', 'レンジャー': 'Ranger',
        'パラディン': 'Paladin', '魔法戦士': 'Warrior-Mage', '混沌の戦士': 'Chaos-Warrior', '修行僧': 'Monk',
        '超能力者': 'Mindcrafter', 'ハイ=メイジ': 'High-Mage', 'ハイメイジ': 'High-Mage', '観光客': 'Tourist',
        'ものまね師': 'Imitator', '魔獣使い': 'Beastmaster', 'スペルマスター': 'Sorcerer', 'アーチャー': 'Archer',
        '魔道具術師': 'Magic-Eater', '吟遊詩人': 'Bard', '赤魔道師': 'Red-Mage', '剣術家': 'Swordsman',
        '練気術師': 'Ki-Master', '青魔道師': 'Blue-Mage', '騎兵': 'Cavalry', '狂戦士': 'Berserker',
        '鍛冶師': 'Weaponsmith', '鏡使い': 'Mirror-Master', '忍者': 'Ninja', 'スナイパー': 'Sniper',
        '元素使い': 'Elementalist',
        'ふつう': 'Ordinary', 'ちからじまん': 'Strong', 'きれもの': 'Clever', 'しあわせもの': 'Lucky',
        'すばしっこい': 'Nimble', 'いのちしらず': 'Fearless', 'コンバット': 'Combatant', 'なまけもの': 'Lazy',
        'セクシーギャル': 'Sexy', 'がまんづよい': 'Patient', 'いかさま': 'Trickster', 'チャージマン': 'Chargeman',
        '生命': 'Life', '仙術': 'Sorcery', '自然': 'Nature', 'カオス': 'Chaos', '暗黒': 'Death',
        'トランプ': 'Trump', '秘術': 'Arcane', '匠': 'Craft', '悪魔': 'Daemon', '破邪': 'Crusade',
        'ランダム': 'Random', '決定': 'Accept', 'やり直し': 'Reroll'
    };
    window.__JP_TERM_TRANSLATIONS = JP_TERM_TRANSLATIONS;
    if (!window.__EN_TO_JP_TRANSLATIONS) {
        window.__EN_TO_JP_TRANSLATIONS = {};
        for (const [jp, en] of Object.entries(JP_TERM_TRANSLATIONS)) {
            window.__EN_TO_JP_TRANSLATIONS[en] = jp;
        }
    }

    /**
     * renderTerminalMirrors — Renders terminal contextual buttons and ribbon
     * from unified ScreenModel (WS42.4B, §6.5, §6.9).
     */
    function renderTerminalMirrors(model, ctx) {
        const {
            terminalTitle, termAdvanceBtn, termEscapeBtn, termExitMenuBtn, termRerollBtn,
            termDpad, birthNameBar, birthNameInput, termLetterRibbon,
            effFrame, curRealm, isHeng, effLang, inPlay,
            hengLabel, hengTitle, populateLetterRibbon, setCtxActions, renderCtxButtons
        } = ctx;
        const legacy = (model && model.legacy) || (SC && typeof SC.classify === 'function' ? SC.classify(effFrame, curRealm, { decode: decodeHengbandText }) : {});
        const prompt = (model && model.prompt) || {};
        const rawScreenText = (effFrame && effFrame.term && effFrame.term.rows) ? effFrame.term.rows.map(r => r.g || '').join('\n') : '';
        const decodedScreenText = decodeHengbandText(rawScreenText);
        const screenText = (rawScreenText + '\n' + decodedScreenText).toLowerCase();
        if (termDpad) termDpad.style.display = 'none';
        if (birthNameBar) birthNameBar.style.display = 'none';
        if (termLetterRibbon) termLetterRibbon.style.display = 'none';
        if (!inPlay) {
            if (termExitMenuBtn) {
                termExitMenuBtn.style.display = 'inline-flex';
                termExitMenuBtn.textContent = isHeng ? hengLabel('🏠 Main Menu', '🏠 Main Menu (主献立)', '🏠 メインメニュー') : 'Main Menu';
            }
            if (termAdvanceBtn) {
                termAdvanceBtn.style.display = 'inline-flex';
                termAdvanceBtn.textContent = isHeng ? hengLabel('Advance (Enter)', 'Advance / 決定 (Enter)', '決定 (Enter)') : 'Advance (Enter)';
            }
            if (termRerollBtn) termRerollBtn.style.display = 'none';
            termEscapeBtn.textContent = isHeng ? hengLabel('Back (Esc)', 'Back / 戻る (Esc)', '戻る (Esc)') : 'Back (Esc)';
            const bf = legacy.birthFlags || (SC.birthFlags ? SC.birthFlags(screenText, isHeng) : {});
            if (bf.isChoiceMenu || bf.isNamePrompt) birthReviewActive = false;
            const mmBtn = { key: 'mainmenu', badge: '🏠', label: hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー') };
            const escBackBtn = { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Back', '⎋ Back / 戻る', '⎋ 戻る') };
            const escStepBtn = { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る') };
            if (bf.isHengInitialOpt) {
                terminalTitle.textContent = hengTitle('🎴 HENGBAND — Options Setup [Esc to Accept]', '🎴 HENGBAND — 初期オプション / Options [Esc to Accept]', '🎴 HENGBAND — 初期オプション設定 [Escで終了]');
                setCtxActions(renderCtxButtons([{ key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Accept Options', '⎋ 終了 (Accept Options)', '⎋ 終了'), gold: true }, mmBtn]));
            } else if (bf.isHengStatDecide) {
                terminalTitle.textContent = hengTitle('🎴 HENGBAND — Review Stats [Enter]', '🎴 HENGBAND — 能力値決定 / Review Stats [Enter]', '🎴 HENGBAND — 能力値決定 [Enter]');
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '⏎', label: hengLabel('✓ Accept Stats', '✓ 決定 (Accept Stats)', '✓ 決定'), gold: true },
                    { key: 'r', badge: '[r]', label: hengLabel('🔄 Next Roll', '🔄 次の数値 (Next Roll)', '🔄 次の数値') },
                    { key: 'p', badge: '[p]', label: hengLabel('⏪ Previous Roll', '⏪ 前の数値 (Previous Roll)', '⏪ 前の数値') },
                    { key: 'S', badge: '[S]', label: hengLabel('🔄 Start Over', '🔄 初めから (Start Over)', '🔄 初めから') },
                    escBackBtn, mmBtn
                ]));
            } else if (bf.isTitleScreen) {
                terminalTitle.textContent = '⚔ WELCOME TO ANGBAND';
                setCtxActions(renderCtxButtons([{ key: 'enter', badge: '⏎', label: 'Continue (Enter)', gold: true }, mmBtn]));
            } else if (bf.isNamePrompt) {
                terminalTitle.textContent = isHeng ? hengTitle('🎴 HENGBAND — Enter Character Name', '🎴 HENGBAND — 名前入力 / Enter Name', '🎴 HENGBAND — キャラクターの名前を入力') : '⚔ NAME YOUR ADVENTURER';
                if (birthNameBar) {
                    birthNameBar.style.display = 'flex';
                    if (birthNameInput && document.activeElement !== birthNameInput && !birthNameInput.value) {
                        const nameMatch = (effFrame.term && effFrame.term.rows && effFrame.term.rows[0]) ? (effFrame.term.rows[0].g || '').match(/:\s*([A-Za-z0-9_\-]+)/) : null;
                        if (nameMatch) birthNameInput.value = nameMatch[1].trim();
                    }
                }
                setCtxActions(renderCtxButtons([escStepBtn, mmBtn]));
            } else if (bf.isHistoryPrompt) {
                terminalTitle.textContent = isHeng ? hengTitle('🎴 HENGBAND — Character Background', '🎴 HENGBAND — 生い立ち / Background', '🎴 HENGBAND — キャラクターの生い立ち') : '⚔ CHARACTER HISTORY';
                setCtxActions(renderCtxButtons([{ key: 'enter', badge: '⏎', label: hengLabel('✓ Accept', '✓ Accept / 決定', '✓ 決定'), gold: true }, escStepBtn, mmBtn]));
            } else if (bf.isStatRoller) {
                terminalTitle.textContent = isHeng ? hengTitle('🎴 HENGBAND — Stat Roller', '🎴 HENGBAND — 能力値抽選 / Stat Roller', '🎴 HENGBAND — 能力値抽選') : '⚔ ATTRIBUTE ALLOCATION';
                if (termDpad) termDpad.style.display = 'grid';
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '⏎', label: hengLabel('✓ Accept', '✓ Accept / 決定', '✓ 決定'), gold: true },
                    { key: 'r', badge: '[r]', label: hengLabel('🔄 Reset Stats', '🔄 Reset / 再抽選', '🔄 再抽選') },
                    escStepBtn, mmBtn
                ]));
            } else if (bf.isBackgroundEdit) {
                terminalTitle.textContent = isHeng ? hengTitle('📜 CHARACTER BACKGROUND — Enter to Continue', '📜 生い立ち / BACKGROUND — Enter', '📜 キャラクターの生い立ち — Enter') : '📜 CHARACTER BACKGROUND — Enter to Continue';
                if (termDpad) termDpad.style.display = 'grid';
                setCtxActions(renderCtxButtons([{ key: 'enter', badge: '⏎', label: hengLabel('Continue (Enter)', 'Continue / 決定 (Enter)', '決定 (Enter)'), gold: true }, escStepBtn, mmBtn]));
            } else if (bf.isReadyPrompt) {
                terminalTitle.textContent = isHeng ? hengTitle('🎴 HENGBAND — Begin Game / Embark', '🎴 HENGBAND — ゲーム開始 / Embark', '🎴 HENGBAND — ゲーム開始') : '⚔ READY TO EMBARK — Enter to Begin';
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '⏎', label: hengLabel('⚔ Enter Realm', '⚔ ゲーム開始 (Enter Realm)', '⚔ ゲーム開始'), gold: true },
                    { key: 'S', badge: '[S]', label: hengLabel('🔄 Start Over', '🔄 初めから (Start Over)', '🔄 初めから') },
                    { key: 'Q', badge: '[Q]', label: hengLabel('⎋ Quit', '⎋ 終了 (Quit)', '⎋ 終了') }
                ]));
            } else if (bf.isReviewScreen) {
                const hasPrevRoll = screenText.includes("previous roll") || screenText.includes("前の数値") || screenText.includes("for previous");
                terminalTitle.textContent = isHeng ? hengTitle('🎴 HENGBAND — Review Hero', '🎴 HENGBAND — キャラクター確認 / Review Hero', '🎴 HENGBAND — キャラクター確認') : '⚔ REVIEW YOUR HERO';
                if (termRerollBtn) termRerollBtn.style.display = 'inline-flex';
                if (termAdvanceBtn) termAdvanceBtn.textContent = hengLabel('⚔ Accept & Play (Enter)', '⚔ Accept & Play (決定)', '⚔ 決定して開始 (Enter)');
                const reviewBtns = [
                    { key: 'enter', badge: '⏎', label: hengLabel('⚔ Accept & Play', '⚔ Accept & Play (決定)', '⚔ 決定して開始'), gold: true },
                    { key: 'r', badge: '[r]', label: hengLabel('🎲 Reroll Hero', '🎲 Reroll (再生成)', '🎲 英雄再生成') }
                ];
                if (hasPrevRoll) reviewBtns.push({ key: 'p', badge: '[p]', label: hengLabel('⏪ Previous Roll', '⏪ Previous Roll (前の数値)', '⏪ 前の数値') });
                reviewBtns.push(
                    { key: 's', badge: '[s]', label: hengLabel('🛠 Custom Create', '🛠 Custom (作成)', '🛠 英雄作成') },
                    escStepBtn, mmBtn
                );
                setCtxActions(renderCtxButtons(reviewBtns));
            } else {
                if (bf.isHengSex) terminalTitle.textContent = hengTitle('🎴 HENGBAND — Choose Sex [a-b, *]', '🎴 HENGBAND — 性別 / Choose Sex [a-b, *]', '🎴 HENGBAND — 性別を選んで下さい [a-b, *]');
                else if (bf.isHengRace) terminalTitle.textContent = hengTitle('🎴 HENGBAND — Choose Race [a-L, *]', '🎴 HENGBAND — 種族 / Choose Race [a-L, *]', '🎴 HENGBAND — 種族を選んで下さい [a-L, *]');
                else if (bf.isHengClass) terminalTitle.textContent = hengTitle('🎴 HENGBAND — Choose Class [a-C, *]', '🎴 HENGBAND — 職業 / Choose Class [a-C, *]', '🎴 HENGBAND — 職業を選んで下さい [a-C, *]');
                else if (bf.isHengPersonality) terminalTitle.textContent = hengTitle('🎴 HENGBAND — Choose Personality [a-m, *]', '🎴 HENGBAND — 性格 / Choose Personality [a-m, *]', '🎴 HENGBAND — 性格を選んで下さい [a-m, *]');
                else if (bf.isHengRealm) terminalTitle.textContent = hengTitle('🎴 HENGBAND — Choose Realm [a-j]', '🎴 HENGBAND — 魔法領域 / Choose Realm [a-j]', '🎴 HENGBAND — 魔法領域を選んで下さい [a-j]');
                else if (screenText.includes('race affects stats')) terminalTitle.textContent = '⚔ CHOOSE CHARACTER RACE';
                else if (screenText.includes('class affects stats')) terminalTitle.textContent = '⚔ CHOOSE CHARACTER CLASS';
                else terminalTitle.textContent = '⚔ CHARACTER CREATION';
                if (termDpad) termDpad.style.display = 'grid';
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '⏎', label: hengLabel('✓ Select', '✓ Select / 決定', '✓ 決定'), gold: true },
                    { key: '*', badge: '[*]', label: hengLabel('🎲 Random', '🎲 Random / ランダム', '🎲 ランダム') },
                    escBackBtn, mmBtn
                ]));
                populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
            }
            return;
        }
        // --- ACTIVE GAMEPLAY ---
        if (termExitMenuBtn) termExitMenuBtn.style.display = 'none';
        if (termRerollBtn) termRerollBtn.style.display = 'none';
        const pendingState = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function') ? window.MenuRouter.getPending() : null;
        if (pendingState && pendingState.step === 'chooser' && pendingState.item) {
            const pending = pendingState;
            terminalTitle.textContent = isHeng ? hengTitle(`🎒 ${pending.item.key}) ${pending.item.label}`, `🎒 ${pending.item.key}) ${pending.item.label}`, `🎒 ${pending.item.key}) ${pending.item.label}`) : `🎒 ${pending.item.key}) ${pending.item.label}`;
            if (termDpad) {
                termDpad.style.display = 'none';
                if (termDpad.parentElement) termDpad.parentElement.style.display = 'none';
            }
            const chooserRealm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (effFrame && effFrame.realm) || 'angband';
            if (window.MenuRouter && typeof window.MenuRouter.renderChooserHtml === 'function') {
                let chooserHtml = window.MenuRouter.renderChooserHtml(pending, chooserRealm);
                if (typeof window.getShockboltSpriteCss === 'function') {
                    const iconStyle = window.getShockboltSpriteCss('item', pending.item.label, pending.item.glyph, 32);
                    if (iconStyle) chooserHtml = chooserHtml.replace(/(<div class="term-chooser-header"[^>]*>)/, `$1<span class="sb-sprite-icon term-chooser-portrait" style="${iconStyle}"></span> `);
                }
                setCtxActions(chooserHtml);
            }
            populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
            if (terminal && typeof terminal.setSelectedKey === 'function') terminal.setSelectedKey(pending.item.key);
            return;
        }
        if (termDpad && termDpad.parentElement) termDpad.parentElement.style.display = '';
        const promptKind = prompt.kind || '';
        const mirror = model ? model.mirror : null;
        const isPressAnyKey = Boolean(legacy.isPressAnyKey || promptKind === 'more' || mirror === 'more' || (effFrame.ui && effFrame.ui.more));
        const isYesNoPrompt = Boolean(legacy.isYesNoPrompt || promptKind === 'yesno' || mirror === 'yesno');
        const isQuantityPrompt = Boolean(legacy.isQuantityPrompt || promptKind === 'quantity' || promptKind === 'count' || mirror === 'quantity' || mirror === 'count');
        const isTargeting = Boolean(legacy.isTargeting || promptKind === 'direction' || promptKind === 'target' || mirror === 'direction');
        const isStore = Boolean(legacy.isStore);
        const isItemActions = Boolean(legacy.isItemActions || promptKind === 'menu' || mirror === 'item-menu');
        const isItemPrompt = Boolean(legacy.isItemPrompt || promptKind === 'item' || mirror === 'item');
        if (isPressAnyKey) {
            terminalTitle.textContent = isHeng ? hengTitle('📜 MESSAGE / PROMPT', '📜 MESSAGE / メッセージ', '📜 メッセージ') : '📜 MESSAGE / PROMPT';
            setCtxActions(renderCtxButtons([
                { key: 'space', badge: '[␣]', label: hengLabel('Continue', 'Continue / 続ける', '続ける'), gold: true },
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Close', '⎋ Close / 閉じる', '⎋ 閉じる') }
            ]));
        } else if (isYesNoPrompt) {
            terminalTitle.textContent = isHeng ? hengTitle('🎴 CONFIRM ACTION [y/n]', '🎴 CONFIRM ACTION / 確認 [y/n]', '🎴 確認 [y/n]') : '⚔ CONFIRM ACTION [y/n]';
            setCtxActions(renderCtxButtons([
                { key: 'y', badge: '[y]', label: hengLabel('✓ Yes', '✓ Yes / はい', '✓ はい'), gold: true },
                { key: 'n', badge: '[n]', label: hengLabel('✕ No', '✕ No / いいえ', '✕ いいえ'), outline: true },
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Cancel', '⎋ Cancel / 取消', '⎋ 取消') }
            ]));
            populateLetterRibbon(null, ['y', 'n']);
        } else if (isQuantityPrompt) {
            terminalTitle.textContent = '📦 ENTER QUANTITY';
            if (termDpad) termDpad.style.display = 'grid';
            setCtxActions(renderCtxButtons([
                { key: 'enter', badge: '⏎', label: 'All (Default)', gold: true },
                { key: '1', badge: '[1]', label: 'Just 1' },
                { key: '5', badge: '[5]', label: '5' },
                { key: 'escape', badge: '[Esc]', label: '⎋ Cancel' }
            ]));
            populateLetterRibbon(null, ['1', '2', '3', '5', '10', 'enter']);
        } else if (legacy.isPopupCommandMenu) {
            terminalTitle.textContent = isHeng ? hengTitle('📜 COMMAND MENU', '📜 COMMAND MENU / コマンド', '📜 コマンドメニュー') : '📜 COMMAND MENU';
            setCtxActions(renderCtxButtons([
                { key: 'up', badge: '[▲]', label: '▲ Up' }, { key: 'down', badge: '[▼]', label: '▼ Down' },
                { key: 'left', badge: '[◀]', label: '◀ Left' }, { key: 'right', badge: '[▶]', label: '▶ Right' },
                { key: 'enter', badge: '[⏎]', label: '✓ Select (Enter)', gold: true },
                { key: 'escape', badge: '[Esc]', label: '✕ Close (Esc)', gold: true }
            ]));
        } else if (isStore) {
            if (termAdvanceBtn) termAdvanceBtn.style.display = 'none';
            let storeName = 'STORE';
            if (effFrame.term && effFrame.term.rows) {
                for (let r = 0; r < Math.min(5, effFrame.term.rows.length); r++) {
                    const sm = (effFrame.term.rows[r].g || '').trim().match(/(General Store|Armoury|Armory|Weaponsmith|Weapon Smith|Temple|Alchemy Shop|Alchemist|Magic Shop|Magic User's|Black Market|Your Home|雑貨屋|万屋|防具屋|武器屋|寺院|錬金術の店|魔術師の店|ブラック・マーケット|我が家|博物館)/i);
                    if (sm) {
                        const jpToEn = { '雑貨屋': 'General Store', '万屋': 'General Store', '防具屋': 'Armoury', '武器屋': 'Weaponsmith', '寺院': 'Temple', '錬金術の店': 'Alchemy Shop', '魔術師の店': 'Magic Shop', 'ブラック・マーケット': 'Black Market', '我が家': 'Your Home', '博物館': 'Museum' };
                        storeName = jpToEn[sm[1].trim()] || sm[1].trim();
                        break;
                    }
                }
            }
            const sf = legacy.storeFlags || (SC.storeFlags ? SC.storeFlags(effFrame, screenText, isHeng) : {});
            if (termDpad) termDpad.style.display = 'grid';
            if (sf.isStoreContextMenu) {
                terminalTitle.textContent = isHeng ? hengTitle('⚔ CHOOSE ACTION FOR ITEM', '⚔ CHOOSE ACTION / 選択', '⚔ アイテムの行動を選択') : '⚔ CHOOSE ACTION FOR ITEM';
                const exKey = isHeng ? 'x' : 'l';
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '⏎', label: hengLabel('Select', 'Select / 決定', '決定'), gold: true },
                    { key: 'p', badge: '[p]', label: hengLabel('💰 Buy All', '💰 Buy All / 全て購入', '💰 全て購入'), gold: true },
                    { key: 'o', badge: '[o]', label: hengLabel('🛒 Buy One', '🛒 Buy One / 1つ購入', '🛒 1つ購入') },
                    { key: exKey, badge: `[${exKey}]`, label: hengLabel('🔍 Examine', '🔍 Examine / 調べる', '🔍 調べる') },
                    { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Back', '⎋ Back / 戻る', '⎋ 戻る') }
                ]));
            } else if (sf.isStoreBuy || sf.isStoreSell || sf.isStoreExamine) {
                const subPrompt = sf.isStoreBuy ? { t: '💰 BUY WHICH ITEM?', l: 'Cancel Buy', j: '何を買いますか？' } :
                    sf.isStoreSell ? { t: '🏷 SELL WHICH ITEM?', l: 'Cancel Sell', j: 'どれを売りますか？' } :
                    { t: '🔍 EXAMINE WHICH ITEM?', l: 'Cancel Examine', j: 'どれを調べますか？' };
                terminalTitle.textContent = isHeng ? hengTitle(`${subPrompt.t} (Tap letter or D-pad + Enter)`, `${subPrompt.t} / 選択 (Tap letter or Enter)`, `${subPrompt.j} (文字か方向キー+Enter)`) : `${subPrompt.t} (Tap letter or D-pad + Enter)`;
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '⏎', label: hengLabel('Select', 'Select / 決定', '決定'), gold: true },
                    { key: 'space', badge: '[␣]', label: hengLabel('Next Page', 'Next Page / 次頁', '次ページ') },
                    { key: 'escape', badge: '[Esc]', label: hengLabel(`⎋ ${subPrompt.l}`, `⎋ ${subPrompt.l} / 取消`, '⎋ 取消') }
                ]));
                populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
            } else {
                const jpStoreNames = { 'GENERAL STORE': '雑貨屋', 'ARMOURY': '防具屋', 'ARMORY': '防具屋', 'WEAPONSMITH': '武器屋', 'TEMPLE': '寺院', 'ALCHEMY SHOP': '錬金術の店', 'MAGIC SHOP': '魔術師の店', 'BLACK MARKET': 'ブラック・マーケット', 'YOUR HOME': '我が家', 'MUSEUM': '博物館', 'STORE': '店舗' };
                const jpName = jpStoreNames[storeName.toUpperCase()] || storeName;
                terminalTitle.textContent = isHeng ? hengTitle(`⚔ ${storeName.toUpperCase()} — BROWSE INVENTORY`, `⚔ ${storeName.toUpperCase()} (${jpName}) — INVENTORY`, `⚔ ${jpName} — 店頭の品物`) : '⚔ ' + storeName.toUpperCase() + ' — BROWSE INVENTORY';
                const exKey = isHeng ? 'x' : 'l';
                const storeBtns = [];
                if (sf.hasMore) storeBtns.push({ key: 'space', badge: '[␣]', label: hengLabel('⏩ Continue (-more-)', '⏩ Continue / 続ける', '⏩ 続ける (-more-)'), gold: true });
                storeBtns.push(
                    { key: 'p', badge: '[p]', label: hengLabel('💰 Buy', '💰 Buy / 購入', '💰 購入'), gold: true },
                    { key: 's', badge: '[s]', label: hengLabel('🏷 Sell', '🏷 Sell / 売却', '🏷 売却') },
                    { key: exKey, badge: `[${exKey}]`, label: hengLabel('🔍 Examine', '🔍 Examine / 調べる', '🔍 調べる') },
                    { key: 'space', badge: '[␣]', label: hengLabel('Next Page', 'Next Page / 次頁', '次ページ') },
                    { key: 'escape', badge: '[Esc]', label: hengLabel('🚪 Exit Store', '🚪 Exit Store / 店を出る', '🚪 店を出る') }
                );
                setCtxActions(renderCtxButtons(storeBtns));
                populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
                const promptLine = (effFrame.term && effFrame.term.rows && effFrame.term.rows[0]) ? (effFrame.term.rows[0].g || '') : screenText;
                if (!/which item|examine which|buy which|purchase which|sell which|how many|accept/i.test(promptLine) && termLetterRibbon) {
                    const buyCmd = (screenText.includes('g) Get') || screenText.includes('g) Purchase') || screenText.includes('g) get') || screenText.includes('g) purchase')) ? 'g' : 'p';
                    termLetterRibbon.querySelectorAll('.term-letter-btn').forEach(b => {
                        if (b.dataset.key && /^[a-l]$/i.test(b.dataset.key)) b.dataset.storeAutoBuy = buyCmd;
                    });
                }
            }
        } else if (isItemActions) {
            terminalTitle.textContent = isHeng ? hengTitle('⚔ CHOOSE ACTION FOR ITEM', '⚔ CHOOSE ACTION / 選択', '⚔ アイテムの行動を選択') : '⚔ CHOOSE ACTION FOR ITEM';
            if (termDpad) termDpad.style.display = 'grid';
            const actionRows = (effFrame.term && Array.isArray(effFrame.term.rows)) ? effFrame.term.rows : [];
            const extractedVerbs = (SC && typeof SC.extractItems === 'function') ? SC.extractItems(actionRows, isHeng, decodeHengbandText) : [];
            setCtxActions(renderCtxButtons([
                { key: 'enter', badge: '⏎', label: hengLabel('Select', 'Select / 決定', '決定'), gold: true },
                ...extractedVerbs.map(v => ({ key: v.key, badge: `[${v.key}]`, label: v.label })),
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Back', '⎋ Back / 戻る', '戻る') }
            ]));
            populateLetterRibbon(actionRows);
        } else if (isTargeting) {
            terminalTitle.textContent = isHeng ? hengTitle('🎯 TARGETING & AIMING', '🎯 TARGETING / 照準・位置指定', '🎯 照準・位置指定') : '🎯 TARGETING & AIMING';
            if (termDpad) termDpad.style.display = 'grid';
            setCtxActions(renderCtxButtons([
                { key: '5', badge: '[5/⏎]', label: hengLabel('🎯 Fire / Select', '🎯 Fire / 発射・選択', '🎯 発射・選択'), gold: true },
                { key: '*', badge: '[*]', label: hengLabel('🔍 Next Target', '🔍 Next Target / 次の対象', '🔍 次の対象') },
                { key: 't', badge: '[t]', label: hengLabel('📍 Nearest', '📍 Nearest / 最寄りの対象', '📍 最寄りの対象') },
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Cancel Aiming', '⎋ Cancel / 取消', '⎋ 取消') }
            ]));
        } else if (isItemPrompt) {
            const iflags = legacy.itemFlags || (SC.itemFlags ? SC.itemFlags(screenText, activeRealm) : {});
            const isSpellPrompt = Boolean(legacy.isSpellOrAbilityMenu || promptKind === 'spell');
            const promptLine = (effFrame.term && effFrame.term.rows && effFrame.term.rows[0]) ? (effFrame.term.rows[0].g || '') : screenText;
            const tCases = [
                [iflags.isSilqInvenCmd, '🎒 INVENTORY PACK (Choose action)'],
                [iflags.isSilqEquipCmd, '🛡 EQUIPPED GEAR (Choose action)'],
                [iflags.isSilqWear || screenText.includes('wear') || screenText.includes('wield') || screenText.includes('どれを装備'), isHeng ? hengTitle('⚔ WEAR / WIELD ITEM', '⚔ WEAR/WIELD / 装備', '⚔ アイテムを装備') : '⚔ WEAR / WIELD ITEM'],
                [iflags.isSilqRemove || screenText.includes('take off') || screenText.includes('どれを外しますか'), isHeng ? hengTitle('🔄 TAKE OFF GEAR', '🔄 TAKE OFF / 装備を外す', '🔄 装備を外す') : (iflags.isSilq ? '🔄 REMOVE GEAR' : '🔄 TAKE OFF GEAR')],
                [iflags.isSilqThrow || screenText.includes('throw which item?') || screenText.includes('どれを投げますか'), isHeng ? hengTitle('🎯 THROW ITEM', '🎯 THROW ITEM / 投擲', '🎯 アイテムを投げる') : '🎯 THROW ITEM'],
                [iflags.isSilqFire || screenText.includes('fire which item?') || screenText.includes('fire') || screenText.includes('shoot') || screenText.includes('どのアイテムを発射'), isHeng ? hengTitle('🏹 FIRE / SHOOT', '🏹 FIRE / 射撃', '🏹 射撃') : '🏹 FIRE / SHOOT'],
                [iflags.isSilqExamine || screenText.includes('examine which item') || screenText.includes('どれを調べますか'), isHeng ? hengTitle('🔍 EXAMINE ITEM', '🔍 EXAMINE / 調査', '🔍 アイテムを調べる') : '🔍 EXAMINE ITEM'],
                [iflags.isSilqDrop || screenText.includes('drop which') || screenText.includes('どれを落としますか'), isHeng ? hengTitle('📦 DROP ITEM', '📦 DROP / アイテムを落とす', '📦 アイテムを落とす') : '📦 DROP ITEM'],
                [screenText.includes('quaff which potion?') || screenText.includes('quaff') || screenText.includes('どの薬を飲みますか'), isHeng ? hengTitle('🧪 QUAFF POTION', '🧪 QUAFF POTION / 飲む', '🧪 薬を飲む') : '🧪 QUAFF POTION'],
                [screenText.includes('read which scroll?') || screenText.includes('read') || screenText.includes('どの巻物を読みますか'), isHeng ? hengTitle('📜 READ SCROLL', '📜 READ SCROLL / 読む', '📜 巻物を読む') : '📜 READ SCROLL'],
                [screenText.includes('which spell?') || screenText.includes('which prayer?') || screenText.includes('which book?') || screenText.includes('どの呪文') || screenText.includes('どの本'), isHeng ? hengTitle('✨ CAST SPELL / PRAYER', '✨ CAST SPELL / 呪文詠唱', '✨ 呪文詠唱') : '✨ CAST SPELL / PRAYER'],
                [iflags.isQuiverView, isHeng ? hengTitle('🏹 QUIVER MISSILES', '🏹 QUIVER / 矢筒', '🏹 矢筒') : '🏹 QUIVER MISSILES'],
                [iflags.isEquipView, isHeng ? hengTitle('🛡 EQUIPPED GEAR', '🛡 EQUIPPED GEAR / 装備品一覧', '🛡 装備品一覧') : '🛡 EQUIPPED GEAR']
            ];
            let titleVal = isHeng ? hengTitle('🎒 INVENTORY PACK', '🎒 INVENTORY / 所持品一覧', '🎒 所持品一覧') : '🎒 INVENTORY PACK';
            for (const [cond, t] of tCases) { if (cond) { titleVal = t; break; } }
            terminalTitle.textContent = titleVal;
            if (termDpad) {
                termDpad.style.display = 'none';
                if (termDpad.parentElement) termDpad.parentElement.style.display = 'none';
            }
            if (iflags.isSilqInvenCmd) {
                setCtxActions(renderCtxButtons([
                    { key: 'escape', badge: '[Esc]', label: '⎋ Close', gold: true },
                    { key: 'w', badge: '[w]', label: '⚔ Wear/Wield', gold: true },
                    { key: 'e', badge: '[e]', label: '🛡 View Gear' }, { key: 'x', badge: '[x]', label: '🔍 Examine' },
                    { key: 'd', badge: '[d]', label: '📦 Drop' }, { key: 'k', badge: '[k]', label: '🗑 Destroy' }, { key: 'space', badge: '[␣]', label: 'Next Page' }
                ]));
            } else if (iflags.isSilqEquipCmd) {
                setCtxActions(renderCtxButtons([
                    { key: 'escape', badge: '[Esc]', label: '⎋ Close', gold: true },
                    { key: 'r', badge: '[r]', label: '🔄 Take Off', gold: true },
                    { key: 'i', badge: '[i]', label: '🎒 View Pack' }, { key: 'x', badge: '[x]', label: '🔍 Examine' },
                    { key: 'd', badge: '[d]', label: '📦 Drop' }, { key: 'space', badge: '[␣]', label: 'Next Page' }
                ]));
            } else if (iflags.isSilqWear) {
                setCtxActions(renderCtxButtons([{ key: 'escape', badge: '[Esc]', label: '⎋ Cancel', gold: true }, { key: '/', badge: '[/]', label: '🛡 Switch to Gear' }, { key: '-', badge: '[-]', label: '📍 Floor' }]));
            } else if (iflags.isSilqRemove) {
                setCtxActions(renderCtxButtons([{ key: 'escape', badge: '[Esc]', label: '⎋ Cancel', gold: true }, { key: '/', badge: '[/]', label: '🎒 Switch to Pack' }]));
            } else if (iflags.isSilq) {
                setCtxActions(renderCtxButtons([{ key: 'escape', badge: '[Esc]', label: '⎋ Cancel', gold: true }, { key: '/', badge: '[/]', label: 'Switch Inven/Gear' }, { key: 'space', badge: '[␣]', label: 'Next Page' }]));
            } else if (isSpellPrompt || /spell|prayer|book|magic|power|mindcraft|invocation|song/i.test(promptLine)) {
                setCtxActions(renderCtxButtons([{ key: 'enter', badge: '[⏎]', label: '✓ Select', gold: true }, { key: 'up', badge: '[▲]', label: 'Prev' }, { key: 'down', badge: '[▼]', label: 'Next' }, { key: 'escape', badge: '[Esc]', label: '⎋ Cancel', gold: true }, { key: 'space', badge: '[␣]', label: '📖 Show Choices' }, { key: '?', badge: '[?]', label: '❓ Spell Help' }]));
            } else if (isHeng) {
                const pLabel = iflags.isEquipView ? hengLabel('🎒 View Pack', '🎒 View Pack / 所持品', '🎒 所持品') : hengLabel('🛡 View Gear', '🛡 View Gear / 装備品', '🛡 装備品');
                const qLabel = iflags.isQuiverView ? hengLabel('🎒 Pack', '🎒 Pack / 所持品', '🎒 所持品') : hengLabel('🏹 Quiver', '🏹 Quiver / 矢筒', '🏹 矢筒');
                setCtxActions(renderCtxButtons([
                    { key: 'enter', badge: '[⏎]', label: hengLabel('✓ Select', '✓ Select / 決定', '✓ 決定'), gold: true },
                    { key: 'up', badge: '[▲]', label: '▲' },
                    { key: 'down', badge: '[▼]', label: '▼' },
                    { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Close', '⎋ Close / 閉じる', '⎋ 閉じる'), gold: true },
                    { key: '/', badge: '[/]', label: pLabel }, { key: '|', badge: '[|]', label: qLabel },
                    { key: 'space', badge: '[␣]', label: hengLabel('Next Page', 'Next Page / 次頁', '次ページ') }
                ]));
            } else {
                const itemBtns = [
                    { key: 'enter', badge: '[⏎]', label: '✓ Select', gold: true },
                    { key: 'up', badge: '[▲]', label: 'Prev' },
                    { key: 'down', badge: '[▼]', label: 'Next' },
                    { key: '/', badge: '[/]', label: iflags.isEquipView ? '🎒 View Pack' : '🛡 View Gear' },
                    { key: '|', badge: '[|]', label: iflags.isQuiverView ? '🎒 Pack' : '🏹 Quiver' },
                    { key: 'escape', badge: '[Esc]', label: '⎋ Close', gold: true }
                ];
                if (!legacy.verbPrompt && curRealm === 'angband') {
                    itemBtns.splice(5, 0,
                        { key: 'w', badge: '[w]', label: '⚔ Wield' },
                        { key: 'b', badge: '[b]', label: '📖 Browse' },
                        { key: 'm', badge: '[m]', label: '✨ Cast' },
                        { key: 'q', badge: '[q]', label: '🧪 Quaff' },
                        { key: 'r', badge: '[r]', label: '📜 Read' },
                        { key: 'E', badge: '[E]', label: '🍖 Eat' },
                        { key: 'I', badge: '[I]', label: '🔍 Inspect' },
                        { key: 'd', badge: '[d]', label: '📦 Drop' }
                    );
                }
                setCtxActions(renderCtxButtons(itemBtns));
            }
            populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
        } else if (legacy.isCharacterSheet || (SC && SC.isCharacterSheet(screenText))) {
            terminalTitle.textContent = isHeng ? hengTitle('📜 CHARACTER SHEET — Hero Status', '📜 CHARACTER SHEET / キャラクター情報', '📜 キャラクター情報') : '📜 CHARACTER SHEET — Hero Status & Attributes';
            const charBtns = [
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Return to 3D', '⎋ Return / 戻る', '⎋ 戻る'), gold: true },
                { key: 'h', badge: '[h]', label: hengLabel('📖 History / Mode', '📖 History / 履歴切替', '📖 履歴 / 画面切替'), gold: true },
                { key: 'f', badge: '[f]', label: hengLabel('💾 Dump Char File', '💾 Dump / ファイル出力', '💾 ファイル出力') },
                { key: activeRealm === 'silq' ? 'n' : 'c', badge: activeRealm === 'silq' ? '[n]' : '[c]', label: hengLabel('✎ Change Name', '✎ Name / 名前変更', '✎ 名前変更') }
            ];
            if (activeRealm === 'silq') charBtns.push({ key: 'tab', badge: '[Tab]', label: '🌟 Ability Tree', gold: true });
            setCtxActions(renderCtxButtons(charBtns));
        } else if (legacy.isSpellOrAbilityMenu || promptKind === 'spell' || (SC && SC.isSpellOrAbilityMenu(screenText))) {
            terminalTitle.textContent = isHeng ? hengTitle('✨ GRIMOIRE & ABILITIES — Choose Spell or Power', '✨ GRIMOIRE / 呪文・技能の選択', '✨ 呪文・技能の選択') : (activeRealm === 'silq' ? '✨ SONGS, ABILITIES & SMITHING' : '✨ GRIMOIRE & POWERS — Select Spell or Ability');
            if (termDpad) termDpad.style.display = activeRealm === 'silq' ? 'grid' : 'none';
            setCtxActions(renderCtxButtons([
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Cancel', '⎋ Cancel / 戻る', '⎋ 戻る'), gold: true },
                { key: 'up', badge: '[↑]', label: '▲ Up' }, { key: 'down', badge: '[↓]', label: '▼ Down' },
                { key: 'left', badge: '[←]', label: '◀ Prev' }, { key: 'right', badge: '[→]', label: '▶ Next' },
                { key: 'enter', badge: '[↵]', label: hengLabel('✓ Confirm / Select', '✓ Select / 決定', '✓ 決定'), gold: true },
                { key: 'space', badge: '[␣]', label: hengLabel('Page / Info', 'Page / 次頁', '次頁') }
            ]));
            populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
        } else if (legacy.isKnowledgeOrOptions || (SC && SC.isKnowledgeOrOptions(screenText))) {
            terminalTitle.textContent = isHeng ? hengTitle('📚 KNOWLEDGE, OPTIONS & ARCHIVES', '📚 ARCHIVES / 知識・オプション', '📚 知識・オプション設定') : '📚 KNOWLEDGE, OPTIONS & ARCHIVES';
            setCtxActions(renderCtxButtons([
                { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Back / Exit', '⎋ Back / 戻る', '⎋ 戻る'), gold: true },
                { key: 'up', badge: '[↑]', label: '▲ Up' }, { key: 'down', badge: '[↓]', label: '▼ Down' },
                { key: 'enter', badge: '[↵]', label: hengLabel('✓ Select / Toggle', '✓ Select / 選択', '✓ 選択'), gold: true },
                { key: 'space', badge: '[␣]', label: hengLabel('Next Page', 'Next Page / 次頁', '次頁') },
                { key: 'y', badge: '[y]', label: 'Yes / On' }, { key: 'n', badge: '[n]', label: 'No / Off' }
            ]));
            populateLetterRibbon(effFrame.term ? effFrame.term.rows : []);
        } else {
            const realmTitles = { 'silq': '💍 SIL-Q CLASSIC TERMINAL', 'frogcomposband': '🐸 FROGCOMPOSBAND CLASSIC TERMINAL', 'hengband': '🎴 HENGBAND CLASSIC TERMINAL', 'angband': '⚔ ANGBAND CLASSIC TERMINAL' };
            terminalTitle.textContent = isHeng ? hengTitle('🎴 HENGBAND CLASSIC TERMINAL', '🎴 HENGBAND — Classic View / クラシック端末', '🎴 変愚蛮怒 — クラシック端末') : (realmTitles[activeRealm] || '⚔ ANGBAND CLASSIC TERMINAL');
            if (termEscapeBtn) {
                termEscapeBtn.style.display = 'inline-flex';
                termEscapeBtn.textContent = isHeng ? hengLabel('🎮 3D View', '🎮 3D View / 3D画面', '🎮 3D画面') : '🎮 3D View';
            }
            if (termDpad) termDpad.style.display = 'grid';
            const hasMore = Boolean(effFrame.ui && effFrame.ui.more) || screenText.includes('-more-');
            if (hasMore) {
                setCtxActions(renderCtxButtons([
                    { key: 'space', badge: '[␣]', label: hengLabel('⏩ Continue (-more-)', '⏩ Continue / 続ける', '⏩ 続ける (-more-)'), gold: true },
                    { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Dismiss', '⎋ Dismiss / 閉じる', '⎋ 閉じる') }
                ]));
            } else {
                const effRealm = activeRealm || 'angband';
                const keyFor = (v) => (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? RealmKeys.realmKey(v, effRealm) : null;
                const btns = [
                    { key: 'tab', badge: '⛶', label: hengLabel('3D View (Tab)', '3D View / 3D画面 (Tab)', '3D画面 (Tab)'), gold: true, extraCls: 'term-action-key' },
                    { key: 'g', badge: '[g]', label: hengLabel('🤚 Get', '🤚 Get / 拾う', '🤚 拾う'), extraCls: 'term-action-key' },
                    { key: keyFor('inven') || 'i', label: hengLabel('🎒 Pack', '🎒 Pack / 所持品', '🎒 所持品'), extraCls: 'term-action-key' },
                    { key: keyFor('equip') || 'e', label: hengLabel('🛡 Gear', '🛡 Gear / 装備', '🛡 装備'), extraCls: 'term-action-key' },
                    { key: '>', badge: '[>]', label: hengLabel('⬇ Stairs', '⬇ Stairs / 階段', '⬇ 階段'), extraCls: 'term-action-key' },
                    { key: 'escape', badge: '[Esc]', label: hengLabel('⎋ Menu', '⎋ Menu / メニュー', '⎋ メニュー'), extraCls: 'term-action-key' }
                ];
                if (effRealm === 'silq') {
                    btns.push({ key: 'w', label: '⚔ Wield', extraCls: 'term-action-key' }, { key: 'r', label: '🔄 Take Off', extraCls: 'term-action-key' });
                    const thKey = keyFor('throw'); if (thKey) btns.push({ key: thKey, label: '🎯 Throw', extraCls: 'term-action-key' });
                    const fiKey = keyFor('fire'); if (fiKey) btns.push({ key: fiKey, label: '🏹 Fire', extraCls: 'term-action-key' });
                }
                const pKey = keyFor('power'); if (pKey) btns.push({ key: pKey, label: hengLabel('🔮 Power', '🔮 Power / 特殊能力', '🔮 特殊能力'), extraCls: 'term-action-key' });
                const oKey = keyFor('overland'); if (oKey) btns.push({ key: oKey, label: hengLabel('🗺️ Map', '🗺️ Map / 広域', '🗺️ 広域'), extraCls: 'term-action-key' });
                const qKey = keyFor('quests'); if (qKey) btns.push({ key: qKey, label: hengLabel('📜 Quests', '📜 Quests / クエスト', '📜 クエスト'), extraCls: 'term-action-key' });
                const skKey = keyFor('skills'); if (skKey) btns.push({ key: skKey, badge: `[${skKey === 'tab' ? 'Tab' : skKey}]`, label: '🌳 Skills', extraCls: 'term-action-key' });
                const cKey = keyFor('cast'); if (cKey) btns.push({ key: cKey, label: (effRealm === 'silq') ? '🎵 Song' : hengLabel('✨ Cast', '✨ Cast / 呪文', '✨ 呪文'), extraCls: 'term-action-key' });
                const rKey = keyFor('rest'); if (rKey) btns.push({ key: rKey, label: hengLabel('⏳ Rest', '⏳ Rest / 休息', '⏳ 休息'), extraCls: 'term-action-key' });
                setCtxActions(renderCtxButtons(btns));
            }
        }
    }

    function updateTerminalToolbar(frame) {
        const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');
        const termFacingBadge = document.getElementById('term-facing-badge');
        const termAdvanceBtn = document.getElementById('btn-term-advance');
        const termEscapeBtn = document.getElementById('btn-term-escape');
        const termExitMenuBtn = document.getElementById('btn-term-exit-menu');
        const termRerollBtn = document.getElementById('btn-term-reroll');
        const termTouchControls = document.getElementById('terminal-touch-controls');
        const termCtxActions = document.getElementById('term-contextual-actions');
        const termLetterRibbon = document.getElementById('term-letter-ribbon');
        const birthNameBar = document.getElementById('birth-name-bar');
        const birthNameInput = document.getElementById('birth-name-input');
        const termDpad = termTouchControls ? termTouchControls.querySelector('.term-dpad, .term-dpad-grid') : null;
        if (!terminalTitle || !termEscapeBtn) return;
        const effFrame = frame || (this && this.currentFrame) || lastFrame || window.__lastFrame || (window.__app && window.__app.getLastFrame && window.__app.getLastFrame());
        if (!effFrame || !effFrame.term || !effFrame.term.rows) return;
        const ui = effFrame.ui || {};
        const inTermView = Boolean((this && this.forceTerminal !== undefined ? this.forceTerminal : forceTerminal) || ((this && typeof this.needsTerminal === 'function') ? this.needsTerminal(effFrame) : needsTerminal(effFrame)));
        const curRealm = (this && this.currentRealm) || (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (effFrame && effFrame.realm) || 'angband';
        const gMode = (window.RealmGrimoireDeck && window.RealmGrimoireDeck.mode) || 'classic';
        const mrPendObj = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function') ? window.MenuRouter.getPending() : null;
        const mrPending = mrPendObj ? `${mrPendObj.step}:${mrPendObj.item?.key || ''}` : 'none';
        const inPlay = Boolean(effFrame && effFrame.phase === 'play' && effFrame.map);
        const skipScraping = !inTermView && inPlay && (ui.overlay || 0) === 0 && ui.awaiting_command && !ui.more && !mrPendObj;
        if (skipScraping) {
            const gc = document.getElementById('grimoire-deck-container');
            if (gc && gc.style.display !== 'none' && window.RealmGrimoireDeck && typeof window.RealmGrimoireDeck.hide === 'function') {
                window.RealmGrimoireDeck.hide(gc);
            }
            return;
        }
        const row0 = effFrame.term.rows[0]?.g || '';
        const row23 = effFrame.term.rows[effFrame.term.rows.length - 1]?.g || '';
        const screenDigest = effFrame.term.rows.slice(1, 22).map(r => (r && r.g) ? r.g.trimEnd() : '').join('|');
        const toolbarSig = `${inTermView ? 1 : 0}_${ui.overlay || 0}_${ui.awaiting_command ? 1 : 0}_${ui.more ? 1 : 0}_${curRealm}_${gMode}_${mrPending}_${row0}_${row23}_${screenDigest}`;
        if ((this && this._lastToolbarSig === toolbarSig) || _lastToolbarSig === toolbarSig) return;
        if (this && typeof this === 'object') this._lastToolbarSig = toolbarSig;
        _lastToolbarSig = toolbarSig;
        const isHeng = (curRealm === 'hengband') || (activeRealm === 'hengband') || (window.activeRealm === 'hengband') || (window.__activeRealm === 'hengband');
        const effLang = isHeng ? (window.__langMode || langMode || 'en') : 'en';
        const hengLabel = (en, bilingual, jp) => {
            if (!isHeng || effLang === 'en') return en;
            if (effLang === 'jp') return jp || bilingual;
            return bilingual;
        };
        const hengTitle = (en, bilingual, jp) => {
            if (!isHeng || effLang === 'en') return en;
            if (effLang === 'jp') return jp || bilingual;
            return bilingual;
        };
        if (termTouchControls) termTouchControls.style.display = 'flex';
        // Camera Facing & Direction Highlight Sync
        const cameraYaw = (dungeon && dungeon.camera)
            ? -dungeon.camera.rotation.y
            : (dungeon ? (dungeon.facing * (Math.PI / 2)) : 0);
        let normYaw = (cameraYaw % (Math.PI * 2));
        if (normYaw < 0) normYaw += Math.PI * 2;
        let facingName = 'NORTH';
        let facingArrow = '▲';
        let fwdKey = 'up';
        if (normYaw >= Math.PI * 0.25 && normYaw < Math.PI * 0.75) {
            facingName = 'EAST';
            facingArrow = '▶';
            fwdKey = 'right';
        } else if (normYaw >= Math.PI * 0.75 && normYaw < Math.PI * 1.25) {
            facingName = 'SOUTH';
            facingArrow = '▼';
            fwdKey = 'down';
        } else if (normYaw >= Math.PI * 1.25 && normYaw < Math.PI * 1.75) {
            facingName = 'WEST';
            facingArrow = '◀';
            fwdKey = 'left';
        }
        terminal.setCameraFacing(cameraYaw);
        const model = (effFrame && effFrame._screenModel) || ((SC && SC.ScreenModel && typeof SC.ScreenModel.of === 'function')
            ? SC.ScreenModel.of(effFrame, curRealm, { decode: decodeHengbandText, lang: effLang, forceTerminal })
            : null);
        const isStore = Boolean(model && model.legacy && model.legacy.isStore);
        const isTargeting = Boolean(model && (model.mirror === 'direction' || (model.legacy && model.legacy.isTargeting)));
        terminal.setTargetingMode(isTargeting);
        if (termFacingBadge) {
            if (inPlay && !isStore) {
                termFacingBadge.style.display = 'inline-flex';
                termFacingBadge.textContent = `🧭 3D: ${facingName} (${facingArrow})`;
                termFacingBadge.title = `Your 3D camera is facing ${facingName}. In classic view, the golden cone shows this view direction.`;
            } else {
                termFacingBadge.style.display = 'none';
            }
        }
        if (termDpad) {
            const allDpad = termDpad.querySelectorAll('.term-dpad-btn');
            allDpad.forEach(b => b.classList.remove('fwd-highlight'));
            if (inPlay && !isStore) {
                const fwdBtn = termDpad.querySelector(`.term-dpad-btn[data-key="${fwdKey}"]`);
                if (fwdBtn) fwdBtn.classList.add('fwd-highlight');
            }
        }
        // Helper to populate letter ribbon
        const populateLetterRibbon = (rows, explicitLetters = null) => {
            if (!termLetterRibbon) return;
            if (skipScraping) {
                termLetterRibbon.style.display = 'none';
                termLetterRibbon.innerHTML = '';
                return;
            }
            let options = [];
            if (explicitLetters && Array.isArray(explicitLetters)) {
                options = explicitLetters.map(lt => ({ key: lt, display: `[${lt}]`, label: null }));
            } else if (rows) {
                const regexes = [
                    /(?:^|\s+)\(([a-zA-Z0-9*@?])\)\s+([^\n\r]{1,70})/g,
                    /(?:^|\s+)\[([a-zA-Z0-9*@?])\]\s+([^\n\r]{1,70})/g,
                    /(?:^|\s+)([a-zA-Z0-9*@?])[\)\.\:\-]\s+([^\n\r]{1,70})/g,
                    /(?:^|\s+)(\*)\s*(ランダム|random|Random)/gi
                ];
                const suffixActionRe = /(?:^|\s{2,})(Inspect|Cast|Study|Browse|Aim|Zap|Use|Read|Quaff|Eat|Activate|Fire|Refill|Take off|Equip|Drop All|Drop|Sell|Pick up|Throw|Uninscribe|Inscribe|Unignore|Ignore)\s+\(([a-zA-Z\{\}])\)\s*$/g;
                const isHengCur = isHeng;
                const seenKeys = new Set();
                for (let r = 0; r < rows.length; r++) {
                    const rawLine = rows[r].g || '';
                    const line = isHengCur ? decodeHengbandText(rawLine) : rawLine;
                    if (isHengCur && (line.includes('選んで下さい') || line.includes('初期オプション設定') || line.includes('注意：'))) continue;
                    for (const re of regexes) {
                        re.lastIndex = 0;
                        let m;
                        while ((m = re.exec(line)) !== null) {
                            const key = m[1];
                            let label = (m[2] || '').trim().replace(/^[^:]{1,20}:\s*/, '').replace(/\s{2,}.*$/, '').replace(/\s+\d+(\.\d+)?\s*(lb|kg|g)$/i, '').replace(/[(\[\{]+$/, '').trim();
                            if (!label || label === '(nothing)' || label.includes('(nothing)') || label === 'なし') continue;
                            if (key && !seenKeys.has(key)) {
                                seenKeys.add(key);
                                let display = `[${key}]`;
                                if (label) {
                                    if (isHengCur && window.HengTranslate && typeof window.HengTranslate.translateName === 'function') {
                                        const trans = window.HengTranslate.translateName(label, 1, effLang);
                                        display = `[${key}] ${trans || label}`;
                                    } else {
                                        display = `[${key}] ${label}`;
                                    }
                                } else if (key === '*') {
                                    display = (!isHengCur || effLang === 'en') ? `[*] Random` : (effLang === 'jp' ? `[*] ランダム` : `[*] ランダム (Random)`);
                                }
                                options.push({ key, display, label });
                            }
                        }
                    }
                    suffixActionRe.lastIndex = 0;
                    let sm;
                    while ((sm = suffixActionRe.exec(line)) !== null) {
                        const actionLabel = (sm[1] || '').trim();
                        const actionKey = sm[2];
                        if (actionKey && actionLabel && !seenKeys.has(actionKey)) {
                            seenKeys.add(actionKey);
                            options.push({ key: actionKey, display: `[${actionKey}] ${actionLabel}`, label: null });
                        }
                    }
                }
                const screenText = (rawLine => decodeHengbandText(rawLine).toLowerCase())(rows.map(r => r.g || '').join('\n'));
                if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || (isHengCur && screenText.includes('よろしいですか'))) {
                    if (!seenKeys.has('y')) options.unshift({ key: 'y', display: '[y] ✓ Yes', label: null });
                    if (!seenKeys.has('n')) options.push({ key: 'n', display: '[n] ✕ No', label: null });
                }
                if (options.length === 0 && inPlay && effFrame) {
                    const row0Line = (rows[0] && rows[0].g) ? (isHengCur ? decodeHengbandText(rows[0].g) : rows[0].g) : '';
                    const rangeMatch = row0Line.match(/\b(?:Inven|Equip|Items?|[a-z]+):\s*([a-zA-Z])-([a-zA-Z])/i) || row0Line.match(/\(([a-zA-Z])-([a-zA-Z])[,\)]/);
                    const isEquipPrompt = /equip|take off|unwield|remove which|装備を外/i.test(row0Line);
                    const pool = isEquipPrompt
                        ? (Array.isArray(effFrame.equipment) ? effFrame.equipment : (effFrame.player && Array.isArray(effFrame.player.equipment) ? effFrame.player.equipment : []))
                        : (Array.isArray(effFrame.inventory) ? effFrame.inventory : (effFrame.player && Array.isArray(effFrame.player.inventory) ? effFrame.player.inventory : []));
                    if (pool.length > 0 && (rangeMatch || /which |book|spell|potion|scroll|food|item|wand|staff|rod|wield|wear|drop|study|browse|cast/i.test(row0Line))) {
                        const startChar = rangeMatch ? rangeMatch[1].charCodeAt(0) : 97;
                        const endChar = rangeMatch ? rangeMatch[2].charCodeAt(0) : 122;
                        pool.forEach((it, idx) => {
                            if (!it) return;
                            const lt = it.letter || String.fromCharCode(97 + idx);
                            const code = lt.charCodeAt(0);
                            if (code < startChar || code > endChar) return;
                            const lbl = (it.name || it.dname || it.label || '').trim();
                            if (!lbl || seenKeys.has(lt)) return;
                            seenKeys.add(lt);
                            options.push({ key: lt, display: `[${lt}] ${lbl}`, label: lbl });
                        });
                    }
                }
            }
            const letterKey = options.map(o => o.key + ':' + o.display + ':' + (o.label || '')).join(',');
            if (letterKey === lastPopulatedLetters) {
                termLetterRibbon.style.display = options.length > 0 ? 'flex' : 'none';
                if (terminal && typeof terminal.syncRibbonSelection === 'function') terminal.syncRibbonSelection();
                return;
            }
            lastPopulatedLetters = letterKey;
            if (options.length > 0) {
                termLetterRibbon.style.display = 'flex';
                termLetterRibbon.innerHTML = options.map(opt => {
                    let iconHtml = '';
                    if (inPlay && opt.label && typeof window.getShockboltSpriteCss === 'function') {
                        const iconStyle = window.getShockboltSpriteCss('item', opt.label, null, 22);
                        if (iconStyle) iconHtml = `<span class="sb-sprite-icon" style="${iconStyle}"></span> `;
                    }
                    return `<button type="button" class="term-letter-btn" data-key="${escapeHtml(opt.key)}">${iconHtml}${escapeHtml(opt.display)}</button>`;
                }).join('');
                if (terminal && typeof terminal.syncRibbonSelection === 'function') terminal.syncRibbonSelection();
            } else {
                termLetterRibbon.style.display = 'none';
                termLetterRibbon.innerHTML = '';
            }
        };
        const grimoireContainer = document.getElementById('grimoire-deck-container');
        renderTerminalMirrors(model, {
            terminalTitle, termFacingBadge, termAdvanceBtn, termEscapeBtn, termExitMenuBtn,
            termRerollBtn, termTouchControls, termCtxActions, termLetterRibbon, birthNameBar,
            birthNameInput, termDpad, effFrame, curRealm, isHeng, effLang, inPlay,
            hengLabel, hengTitle, populateLetterRibbon, setCtxActions, renderCtxButtons
        });
        // Grimoire Deck Rendering (Short-circuit when gMode === 'classic' unless Grimoire toggle button needs sync)
        if (grimoireContainer && window.RealmGrimoireDeck) {
            if (skipScraping || gMode === 'classic') {
                if (typeof window.RealmGrimoireDeck.hide === 'function') {
                    window.RealmGrimoireDeck.hide(grimoireContainer);
                    if (skipScraping) {
                        const gToggleBtn = document.getElementById('btn-term-grimoire-toggle');
                        if (gToggleBtn) gToggleBtn.style.display = 'none';
                    }
                }
            } else if (typeof window.RealmGrimoireDeck.render === 'function') {
                const gClassifier = (model && model.legacy) || ((SC && typeof SC.classify === 'function')
                    ? SC.classify(effFrame, curRealm, { decode: decodeHengbandText })
                    : {});
                const gSubmenu = (SC && typeof SC.detectRealmSubmenu === 'function')
                    ? SC.detectRealmSubmenu(effFrame, curRealm, decodeHengbandText)
                    : {};
                const gItems = (model && model.regions && model.regions.length) ? model.regions :
                    ((SC && typeof SC.extractMultiColumnItems === 'function' && effFrame.term && Array.isArray(effFrame.term.rows))
                    ? SC.extractMultiColumnItems(effFrame.term.rows, isHeng, decodeHengbandText)
                    : []);
                window.RealmGrimoireDeck.render(grimoireContainer, {
                    promptText: (effFrame.term && effFrame.term.rows && effFrame.term.rows[0] && effFrame.term.rows[0].g) ? decodeHengbandText(effFrame.term.rows[0].g).trim() : '',
                    realm: curRealm,
                    lang: isHeng ? langMode : 'en',
                    classifier: gClassifier,
                    submenu: gSubmenu,
                    items: gItems,
                    onAction: (act) => {
                        if (!act) return;
                        if (audio && typeof audio.unlock === 'function') audio.unlock();
                        if (audio && typeof audio.playParchmentTurn === 'function') {
                            audio.playParchmentTurn();
                        } else if (audio && typeof audio.playMenuNav === 'function') {
                            audio.playMenuNav();
                        }
                        if (act.type === 'toggle-mode') {
                            updateTerminalToolbar(effFrame);
                            return;
                        }
                        if (act.type === 'switch-view' && act.key) {
                            network.sendKey(act.key === '|' ? '|' : '/');
                            return;
                        }
                        if (act.type === 'raw-key' && act.key) {
                            network.sendKey(act.key);
                            return;
                        }
                        if (act.type === 'pillar-step') {
                            network.sendKey('right');
                            return;
                        }
                        if ((act.type === 'item-primary' || act.type === 'item-verb') && act.key) {
                            if (act.verb) {
                                const isStoreMenu = Boolean(gClassifier.isStore || gClassifier.isStoreScreen);
                                if (isStoreMenu) {
                                    if (dispatcher && typeof dispatcher.run === 'function') {
                                        dispatcher.run({ verb: 'store_buy', item: act.key, qty: 1 });
                                    } else {
                                        network.sendKey(act.verb);
                                        network.sendKey(act.key);
                                    }
                                    return;
                                }
                                if (window.MenuRouter && typeof window.MenuRouter.buildInventoryVerbSequence === 'function') {
                                    const isInvenOrEquip = Boolean(
                                        gClassifier.isInventoryScreen ||
                                        gClassifier.isEquipScreen ||
                                        (gClassifier.mode === 'item-list' && (gClassifier.listKind === 'inven' || gClassifier.listKind === 'equip'))
                                    );
                                    const fromPassiveAngband = (curRealm === 'angband') && !gClassifier.verbPrompt && isInvenOrEquip;
                                    const fromPassiveFcb = (curRealm === 'frogcomposband') && !gClassifier.verbPrompt && isInvenOrEquip;
                                    const seq = window.MenuRouter.buildInventoryVerbSequence(act.verb, act.key, {
                                        realm: curRealm,
                                        fromPassiveAngbandList: fromPassiveAngband,
                                        fromPassiveFcbList: fromPassiveFcb
                                    });
                                    if (seq.length > 0) {
                                        if (dispatcher && typeof dispatcher.run === 'function') {
                                            dispatcher.run({ keys: seq });
                                        } else {
                                            seq.forEach(k => network.sendKey(k === 'Escape' ? 'escape' : k));
                                        }
                                        return;
                                    }
                                }
                            }
                            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                                if (window.MenuRouter.route(act.key, effFrame, curRealm)) {
                                    updateTerminalToolbar(effFrame);
                                    if (effFrame.term) terminal.render(effFrame.term);
                                    return;
                                }
                            }
                            network.sendKey(act.key);
                        }
                    }
                });
            }
        }
    }
    if (window.__app) {
        Object.assign(window.__app, {
            updateTerminalChoices,
            updateTerminalToolbar,
            needsTerminal,
            updateViewMode,
            toggleTerminalView,
            confirmHeroBirth,
            rerollHero,
            startCustomHeroCreation,
            cancelQuickBirth,
            isBirthReviewActive: () => birthReviewActive,
            getAppState: () => appState,
            setAppState: (s) => { appState = s; },
            getLastFrame: () => lastFrame,
            getActiveRealm,
            getCommandPaletteCommands,
            showToast: showRealmToast,
            showUpdateToast,
            getShockboltSpriteStyle: (item) => {
                if (!item || !dungeon || typeof dungeon.resolveItemAtlasEntry !== 'function') return null;
                const entry = dungeon.resolveItemAtlasEntry(item.name || item.text || '', item.char || item.glyph || '');
                if (!entry || !Array.isArray(entry.uv) || entry.uv.length < 4) return null;
                const [u0, v0, u1, v1] = entry.uv;
                const col = Math.round(u0 * 32);
                const row = Math.round((1.0 - v1) * 32);
                return `background-image:url('/assets/sprites/items/item_atlas.png');background-size:704px 704px;background-position:-${col * 22}px -${row * 22}px;`;
            }
        });
    }
    const _wMcp = (typeof navigator !== 'undefined' && navigator.modelContext) || (typeof document !== 'undefined' && document.modelContext);
    if (_wMcp && typeof _wMcp.registerTool === 'function') {
        try {
            _wMcp.registerTool({ name: 'angband3d_get_hud_state', description: 'Read current realm, appState, and HUD vitals', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ realm: getActiveRealm(), appState, hp: lastFrame?.player?.hp, depth: lastFrame?.player?.depth }) });
            _wMcp.registerTool({ name: 'angband3d_list_realms', description: 'List playable roguelike realms on Angband 3D', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ realms: ['angband', 'silq', 'frogcomposband', 'hengband'] }) });
        } catch (_) {}
    }
    // View routing (AGENTS.md §3.3). Logic lives in screen-context.js needsTerminal (verbatim move, WS2);
    // app state is passed explicitly so the classifier stays pure and testable in Node.
    function needsTerminal(frame) {
        if (!frame) return true;
        if (!frame.player) return true;
        if (frame.phase && frame.phase !== 'play') return true;
        const isDead = Boolean(frame.player.dead || (frame.player.hp !== undefined && frame.player.hp <= 0 && frame.player.hp_max > 0));
        if (isDead) return false;
        const isVictory = Boolean(frame.player.winner || frame.player.total_winner);
        if (isVictory) return false;
        if (window.MenuRouter && typeof window.MenuRouter.getPending === 'function' && window.MenuRouter.getPending()) {
            return true;
        }
        return SC.needsTerminal(frame, { forceTerminal, decode: decodeHengbandText });
    }
    function updateViewMode(frame) {
        if (appState !== 'game') {
            terminalContainer.classList.add('hidden');
            terminalContainer.classList.remove('in-game-modal');
            document.body.classList.remove('terminal-mode-active');
            input.setTerminalMode(false);
            return;
        }
        const currentFrame = frame || lastFrame;
        const needsTerm = needsTerminal(currentFrame);
        const hudOverlay = document.getElementById('hud-overlay');
        const minimapContainer = document.getElementById('minimap-container');
        const messageFeedWindow = document.getElementById('message-feed-window');
        const topMessageBanner = document.getElementById('top-message-banner');
        const touchControls = document.getElementById('touch-controls');
        const btnToggleMsg = document.getElementById('btn-toggle-msg-feed');
        const btnToggleMap = document.getElementById('btn-toggle-minimap');
        const btnToggleDpad = document.getElementById('btn-toggle-dpad');
        const btnToggleChronicle = document.getElementById('btn-toggle-chronicle');
        if (needsTerm) {
            terminalContainer.classList.remove('hidden');
            terminalContainer.classList.remove('in-game-modal');
            document.body.classList.add('terminal-mode-active', 'terminal-active');
            const rtc = document.getElementById('reticle-target-card');
            if (rtc) { rtc.style.display = 'none'; rtc.classList.add('hidden'); }
            const eip = document.getElementById('entity-inspect-popover');
            if (eip) { eip.classList.add('hidden'); eip.style.display = ''; }
            const amp = document.getElementById('action-more-popover');
            if (amp) amp.classList.remove('is-open');
            const qsp = document.getElementById('quick-slot-popover');
            if (qsp) qsp.classList.remove('is-open');
            const cw = document.getElementById('chronicle-window');
            if (cw && cw.classList.contains('active') && !cw.classList.contains('is-pinned')) {
                cw.classList.add('minimized');
                const expBtn = document.getElementById('btn-chronicle-expand');
                if (expBtn) expBtn.textContent = '▼ Show';
            }
            [hudOverlay, minimapContainer, messageFeedWindow, topMessageBanner, touchControls, btnToggleMsg, btnToggleMap, btnToggleDpad, btnToggleChronicle].forEach(el => { if (el) el.style.display = 'none'; });
            input.setTerminalMode(true);
            terminal.resize();
            if (currentFrame && currentFrame.term) {
                terminal.render(currentFrame.term);
            }
            updateTerminalToolbar(currentFrame);
        } else {
            terminalContainer.classList.add('hidden');
            terminalContainer.classList.remove('in-game-modal');
            document.body.classList.remove('terminal-mode-active', 'terminal-active', 'grimoire-primary-open');
            const gc = document.getElementById('grimoire-deck-container');
            if (gc && window.RealmGrimoireDeck && typeof window.RealmGrimoireDeck.hide === 'function') {
                window.RealmGrimoireDeck.hide(gc);
            }
            if (hudOverlay) hudOverlay.style.display = 'flex';
            // Respect user closed preference for minimap radar
            const showMinimap = !window.__minimapClosed;
            if (minimapContainer) minimapContainer.style.display = showMinimap ? 'flex' : 'none';
            // Respect user closed preference for message log
            const isPhone = window.DeviceProfile && window.DeviceProfile.getTier() === 'phone';
            if (messageFeedWindow) {
                if (isPhone) {
                    const isExpanded = messageFeedWindow.classList.contains('mobile-expanded') && !window.__messageLogClosed;
                    messageFeedWindow.style.display = isExpanded ? 'flex' : 'none';
                } else {
                    const showMsg = !window.__messageLogClosed;
                    messageFeedWindow.style.display = showMsg ? 'flex' : 'none';
                }
            }
            if (topMessageBanner) {
                topMessageBanner.style.display = 'flex';
                const isMobile = window.innerWidth <= 768 || (window.DeviceProfile && window.DeviceProfile.getTier() !== 'desktop');
                const topRightBar = document.getElementById('top-right-bar');
                if (topRightBar && !isMobile) {
                    const barWidth = topRightBar.offsetWidth || 165;
                    topMessageBanner.style.paddingRight = `calc(${barWidth + 14}px + var(--safe-right))`;
                } else {
                    topMessageBanner.style.paddingRight = '';
                }
            }
            // Check if player was in a store and just exited back into town
            let playerFeat = 0;
            if (currentFrame && currentFrame.map && currentFrame.map.rows && currentFrame.player) {
                const py = currentFrame.player.y;
                const px = currentFrame.player.x;
                if (currentFrame.map.rows[py] && currentFrame.map.rows[py].f) {
                    playerFeat = parseInt(currentFrame.map.rows[py].f.substring(px * 2, px * 2 + 2), 16) || 0;
                }
            }
            const isStoreFeat = playerFeat >= 7 && playerFeat <= 14;
            const inStore = isStoreFeat && Boolean(currentFrame && currentFrame.ui && currentFrame.ui.overlay > 0);
            if (wasInStore && !inStore && currentFrame && currentFrame.phase === 'play') {
                if (dungeon && typeof dungeon.turn === 'function') {
                    // Turn 180 degrees so player faces out into the street instead of into the shop door
                    dungeon.turn(2);
                    if (typeof dungeon.snapCameraToDefault === 'function') {
                        dungeon.snapCameraToDefault();
                    }
                }
            }
            wasInStore = inStore;
            // D-Pad: Enabled by default across both desktop and mobile/touchscreens, togglable at will
            const isDesktopTier = (typeof DeviceProfile !== 'undefined' && typeof DeviceProfile.getTier === 'function')
                ? DeviceProfile.getTier() === 'desktop'
                : (typeof window !== 'undefined' && window.innerWidth >= 1024 && !window.matchMedia?.('(pointer: coarse)')?.matches);
            const showTouch = window.__dpadVisible !== undefined ? window.__dpadVisible : true;
            if (touchControls) touchControls.style.display = showTouch ? 'flex' : 'none';
            // Update top bar toggle indicators
            if (btnToggleMsg) {
                btnToggleMsg.style.display = 'inline-flex';
                const isMsgOpen = messageFeedWindow && messageFeedWindow.style.display !== 'none';
                btnToggleMsg.classList.toggle('active', Boolean(isMsgOpen));
            }
            if (btnToggleMap) {
                btnToggleMap.style.display = 'inline-flex';
                const isMapOpen = minimapContainer && minimapContainer.style.display !== 'none';
                btnToggleMap.classList.toggle('active', Boolean(isMapOpen));
            }
            if (btnToggleDpad) {
                btnToggleDpad.style.display = 'inline-flex';
                btnToggleDpad.classList.toggle('active', Boolean(showTouch));
            }
            if (btnToggleChronicle && !isApk && !document.body.classList.contains('is-standalone')) {
                btnToggleChronicle.style.display = 'inline-flex';
                const isChronicleOpen = window.chronicleManager && window.chronicleManager.visible;
                btnToggleChronicle.classList.toggle('active', Boolean(isChronicleOpen));
            }
            input.setTerminalMode(false);
        }
    }
    if (window.DeviceProfile) {
        window.DeviceProfile.addListener(() => {
            updateViewMode();
        });
    }
    // Minimap and Message Log Functional Toggles
    const btnToggleMap = document.getElementById('btn-toggle-minimap');
    const btnMinimapClose = document.getElementById('btn-minimap-close');
    const btnMapCloseBar = document.getElementById('btn-map-close-bar');
    if (btnToggleMap) {
        btnToggleMap.addEventListener('click', () => {
            window.__minimapClosed = !window.__minimapClosed;
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    if (btnMinimapClose) {
        btnMinimapClose.addEventListener('click', (e) => {
            e.stopPropagation();
            window.__minimapClosed = true;
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    if (btnMapCloseBar) {
        btnMapCloseBar.addEventListener('click', (e) => {
            e.stopPropagation();
            window.__minimapClosed = true;
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    const btnMapToggleCrt = document.getElementById('btn-map-toggle-crt');
    if (btnMapToggleCrt) {
        btnMapToggleCrt.addEventListener('click', (e) => {
            e.stopPropagation();
            if (audio) audio.playMenuNav();
            toggleTerminalView();
        });
    }
    const btnToggleDpad = document.getElementById('btn-toggle-dpad');
    if (btnToggleDpad) {
        btnToggleDpad.addEventListener('click', () => {
            const isDesktopTier = (typeof DeviceProfile !== 'undefined' && typeof DeviceProfile.getTier === 'function')
                ? DeviceProfile.getTier() === 'desktop'
                : (typeof window !== 'undefined' && window.innerWidth >= 1024 && !window.matchMedia?.('(pointer: coarse)')?.matches);
            const currentlyVisible = window.__dpadVisible !== undefined ? window.__dpadVisible : !isDesktopTier;
            window.__dpadVisible = !currentlyVisible;
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    const btnGraphicsPreset = document.getElementById('btn-graphics-preset');
    if (btnGraphicsPreset) {
        const updateGfxPresetUI = (preset) => {
            const labelEl = btnGraphicsPreset.querySelector('.gfx-label');
            const iconEl = btnGraphicsPreset.querySelector('.gfx-icon');
            const p = preset || (window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.preset) || 'ultra';
            const presetMap = {
                ultra: { label: 'GFX: Ultra', icon: '✨', toast: '3D Graphics: Ultra Realism (Dynamic Shadows & Volumetrics)' },
                enhanced: { label: 'GFX: Enhanced', icon: '🎨', toast: '3D Graphics: Enhanced (60FPS Smooth Shading & Normal Maps)' },
                classic: { label: 'GFX: Classic', icon: '🕹️', toast: '3D Graphics: Classic (Retro Pixel / Fast Performance)' }
            };
            const info = presetMap[p] || presetMap.ultra;
            if (labelEl) labelEl.textContent = info.label;
            if (iconEl) iconEl.textContent = info.icon;
            return info;
        };
        const currentP = (window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.preset) || 'ultra';
        updateGfxPresetUI(currentP);
        btnGraphicsPreset.addEventListener('click', (e) => {
            e.stopPropagation();
            const cur = (window.GRAPHICS_CONFIG && window.GRAPHICS_CONFIG.preset) || 'ultra';
            const order = ['ultra', 'enhanced', 'classic'];
            const nextIdx = (order.indexOf(cur) + 1) % order.length;
            const nextPreset = order[nextIdx];
            if (typeof window.setGraphicsPreset === 'function') {
                window.setGraphicsPreset(nextPreset);
            }
            const info = updateGfxPresetUI(nextPreset);
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            showRealmToast(info.toast);
        });
    }
    const btnToggleLang = document.getElementById('btn-toggle-lang');
    if (btnToggleLang) {
        btnToggleLang.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLanguageMode();
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
        });
    }
    const btnPauseResetHud = document.getElementById('btn-pause-reset-hud');
    if (btnPauseResetHud) {
        btnPauseResetHud.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hud && typeof hud.resetHudLayout === 'function') {
                hud.resetHudLayout();
            }
        });
    }
    const btnToggleMsg = document.getElementById('btn-toggle-msg-feed');
    const btnMsgClose = document.getElementById('btn-msg-close');
    const topMsgBanner = document.getElementById('top-message-banner');
    const msgFeedWin = document.getElementById('message-feed-window');
    if (btnToggleMsg) {
        btnToggleMsg.addEventListener('click', () => {
            const isPhone = window.DeviceProfile && window.DeviceProfile.getTier() === 'phone';
            if (isPhone) {
                if (msgFeedWin) {
                    msgFeedWin.classList.toggle('mobile-expanded');
                    window.__messageLogClosed = !msgFeedWin.classList.contains('mobile-expanded');
                }
            } else {
                window.__messageLogClosed = !window.__messageLogClosed;
            }
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    if (btnMsgClose) {
        btnMsgClose.addEventListener('click', (e) => {
            e.stopPropagation();
            window.__messageLogClosed = true;
            if (msgFeedWin) msgFeedWin.classList.remove('mobile-expanded');
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    // Top Message Banner Tap-to-Toggle Narrative Feed
    if (topMsgBanner && msgFeedWin) {
        topMsgBanner.addEventListener('click', () => {
            const isPhone = window.DeviceProfile && window.DeviceProfile.getTier() === 'phone';
            if (isPhone) {
                msgFeedWin.classList.toggle('mobile-expanded');
                window.__messageLogClosed = !msgFeedWin.classList.contains('mobile-expanded');
            } else {
                window.__messageLogClosed = !window.__messageLogClosed;
            }
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
        });
    }
    const btnMsgClear = document.getElementById('btn-msg-clear');
    if (btnMsgClear && msgFeedWin) {
        btnMsgClear.addEventListener('click', () => {
            const isPhone = window.DeviceProfile && window.DeviceProfile.getTier() === 'phone';
            if (isPhone && msgFeedWin.classList.contains('mobile-expanded')) {
                msgFeedWin.classList.remove('mobile-expanded');
                window.__messageLogClosed = true;
                msgFeedWin.style.display = 'none';
            }
        });
    }
    // 2. Network Event Handlers
    function bindNetworkEventHandlers() {
        if (!network) return;
        network.onHello = (msg) => {
            if (window.__startWatchdog) {
                clearTimeout(window.__startWatchdog);
                window.__startWatchdog = null;
            }
            console.log('[Angband3D] Engine session established:', msg.sessionId || 'local', 'Realm:', msg.realm || 'angband', 'Fallback:', !!msg.isFallback);
            stopQueueTipRotation();
            if (queueModal) {
                queueModal.classList.add('hidden');
            }
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
            const topBanner = document.getElementById('top-message-banner');
            if (topBanner && msg.resumed) {
                topBanner.classList.add('hidden');
            }
            // Strict Invariant: Under NO circumstances load the wrong realm or a fallback
            if (msg.isFallback || (activeRealm && msg.realm && msg.realm !== activeRealm)) {
                console.error(`[Angband3D] Strict Invariant Violation: Server returned realm "${msg.realm}" or fallback for requested "${activeRealm}". Aborting.`);
                if (loadingOverlay) loadingOverlay.classList.add('hidden');
                if (network) network.disconnect();
                showRealmToast(`❌ Error: Realm "${activeRealm}" could not be loaded. Fallbacks are disabled.`);
                returnToMainMenu();
                return;
            }
            if (msg.realm && typeof setActiveRealm === 'function' && activeRealm !== msg.realm) {
                setActiveRealm(msg.realm);
            }
            if (msg.resumed && hud && typeof hud.setStatus === 'function') {
                hud.setStatus('⚡ Session Resumed');
            }
        };
        network.onQueue = (queueData) => {
            if (queueData.status === 'waiting') {
                if (loadingOverlay) loadingOverlay.classList.add('hidden');
                if (queueModal) {
                    queueModal.classList.remove('hidden');
                    if (queuePosNum) queuePosNum.textContent = queueData.position;
                    if (queueTotalNum) queueTotalNum.textContent = `${queueData.totalInQueue} waiting`;
                    if (queueActiveCount) queueActiveCount.textContent = `${queueData.activeCount || queueData.maxCapacity || 50}`;
                }
                if (hud && typeof hud.setStatus === 'function') {
                    hud.setStatus(`In Queue [#${queueData.position}]`);
                }
                startQueueTipRotation();
            } else if (queueData.status === 'admitted') {
                stopQueueTipRotation();
                if (queueModal) queueModal.classList.add('hidden');
                if (loadingOverlay) loadingOverlay.classList.remove('hidden');
                if (audio) audio.playStairs();
                if (hud && typeof hud.setStatus === 'function') {
                    hud.setStatus('Admitted • Spawning...');
                }
            }
        };
        network.onPing = (ms) => {
            hud.setPing(ms);
        };
        network.onOfflineCommand = (cmd) => {
            stepOfflineClientPrediction(cmd);
        };
        network.onSave = () => {
            const slot = network.currentSave || network.currentChar;
            if (slot && currentPhase === 'play') {
                if (snapshotIdleTimer) clearTimeout(snapshotIdleTimer);
                snapshotIdleTimer = setTimeout(() => {
                    snapshotIdleTimer = null;
                    lastClientSnapshotMs = Date.now();
                    snapshotClientSaveToIndexedDB(slot, activeRealm);
                }, 4000);
            }
        };
        network.onFrame = (frame) => {
            if (window.__startWatchdog) {
                clearTimeout(window.__startWatchdog);
                window.__startWatchdog = null;
            }
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
            // Strict Invariant: Reject any frame that belongs to a different realm than active
            if (frame.realm && activeRealm && frame.realm !== activeRealm) {
                console.error(`[Angband3D] Strict Invariant Violation: Frame received for wrong realm "${frame.realm}" (expected "${activeRealm}"). Aborting.`);
                if (loadingOverlay) loadingOverlay.classList.add('hidden');
                if (network) network.disconnect();
                showRealmToast(`❌ Error: Engine running wrong realm "${frame.realm}". Fallbacks are disabled.`);
                returnToMainMenu();
                return;
            }
            // STRICT ANTI-REROLL GUARD: Once a session has entered active play (hasEnteredPlay === true),
            // NEVER allow a mid-game reconnect to drop into character creation / re-roll (phase === 'setup')!
            if (hasEnteredPlay && frame.phase === 'setup') {
                quickBirthActive = false;
                birthConfirming = false;
                birthReviewActive = false;
                const slot = network.currentSave || network.currentChar;
                console.warn(`[Angband3D] Anti-Reroll Guard: Intercepted unexpected 'setup' frame during active play for slot "${slot}". Restoring client save...`);
                restoreClientSaveToServer(slot, activeRealm);
                return;
            }
            lastFrame = frame;
            window.__lastFrame = frame;
            if (window.__dungeonRenderer && window.__dungeonRenderer.userPitchOffset) {
                window.__dungeonRenderer.userPitchOffset = 0.0;
            }
            if (frame.realm) {
                window.activeRealm = frame.realm;
                window.__activeRealm = frame.realm;
            }
            if (window.__app) window.__app.lastFrame = frame;
            currentPhase = frame.phase || 'play';
            if (currentPhase === 'play' && frame.map && frame.player) {
                const firstPlayTransition = !hasEnteredPlay;
                hasEnteredPlay = true;
                quickBirthActive = false;
                const curDepth = typeof frame.player.depth === 'number' ? frame.player.depth : 0;
                const depthChanged = lastSnapshotDepth !== null && curDepth !== lastSnapshotDepth;
                lastSnapshotDepth = curDepth;
                const nowMs = Date.now();
                if (firstPlayTransition || depthChanged) {
                    lastClientSnapshotMs = nowMs;
                    const slot = network.currentSave || network.currentChar;
                    if (slot) {
                        if (snapshotIdleTimer) clearTimeout(snapshotIdleTimer);
                        snapshotIdleTimer = setTimeout(() => {
                            snapshotIdleTimer = null;
                            snapshotClientSaveToIndexedDB(slot, activeRealm);
                        }, firstPlayTransition ? 1200 : 600);
                    }
                } else if (nowMs - lastClientSnapshotMs > 90000) {
                    const slot = network.currentSave || network.currentChar;
                    if (slot) {
                        if (snapshotIdleTimer) clearTimeout(snapshotIdleTimer);
                        snapshotIdleTimer = setTimeout(() => {
                            snapshotIdleTimer = null;
                            lastClientSnapshotMs = Date.now();
                            snapshotClientSaveToIndexedDB(slot, activeRealm);
                        }, 4500);
                    }
                }
            }
            // Synchronize active character name with network client so reconnections never default to 'Adventurer'
            if (frame.player && frame.player.name && frame.player.name !== 'PLAYER') {
                if (network.currentChar !== frame.player.name) {
                    network.currentChar = frame.player.name;
                    try {
                        localStorage.setItem('angband3d_session_char', frame.player.name);
                    } catch (_) {}
                }
            }
            // Dispatch to The Living Chronicle & Voiced Lorekeeper
            if (window.chronicleManager) {
                window.chronicleManager.onFrame(frame);
            }
            // Automated quick-birth advancement
            if (quickBirthActive) {
                stepQuickBirth(frame);
            } else if (birthConfirming) {
                if (frame.phase === 'play' && frame.map && frame.player) {
                    const rawScreenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
                    if (/\|\s*>\s*(?:Song\/Special|Action|Item|Equi|Info|Save)/i.test(rawScreenText) || (frame.ui && frame.ui.overlay > 0)) {
                        network.sendKey('escape');
                    }
                    finalizeHeroBirth();
                } else {
                    const rawScreenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
                    const decodedScreenText = decodeHengbandText(rawScreenText);
                    const screenText = (rawScreenText + '\n' + decodedScreenText).toLowerCase();
                    const sig = rawScreenText.trim();
                    if (sig !== lastBirthConfirmSig) {
                        if (screenText.includes('[y/n]') || screenText.includes('(y/n)') ||
                            screenText.includes('よろしいですか') || screenText.includes('冒険に出ますか') ||
                            screenText.includes('決定しますか') || screenText.includes('この数値に決定')) {
                            lastBirthConfirmSig = sig;
                            network.sendKey('y');
                        } else if (['enter a name for your character', 'character background', 'enter start game', 'start over, or enter to continue', "['q'uit, 's'tart over, or enter to continue]", 'into the vast and echoing gloom', 'down to the depths', 'down awful corridors', 'enter to continue', 'begin play', 'enter your starting stats', 'accept character', '名前を入力', '生い立ち', 'ゲーム開始', '能力値', '決定'].some(p => screenText.includes(p))) {
                            lastBirthConfirmSig = sig;
                            network.sendKey('enter');
                        }
                    }
                }
            } else if (frame.phase === 'play' && frame.map && frame.player) {
                // Whenever active play is reached with map and player, ensure birth review/setup terminal is closed
                // unless the player explicitly opened the terminal using the manual toggle
                if (!window.__manualTerminalOpen) {
                    if (forceTerminal || birthReviewActive || birthConfirming) {
                        finalizeHeroBirth();
                    }
                }
            } else if (frame.phase === 'setup' && !quickBirthActive) {
                // During manual character creation or saved character loading:
                // NEVER auto-advance menu screens, stat rollers, birth options, name inputs, or review screens!
                const screenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '').toLowerCase();
                const isMenuOrInteractive = ['choose a', 'choose the', 'select a', 'selection', 'race', 'class', 'sex', 'personality', 'realm', 'house', 'options', 'allocate points', 'set minimum stats', 'roller', 'point-based', 'are you sure', '[y/n]', '(y/n)', 'name:', 'enter a name', "enter your player's name", 'character background', 'use as is', "'y': use", 'to start over', 'r to reroll', 'reroll', "'s' to start", 'accept character', "['r'eroll", 'or enter to accept', "['q'uit"].some(w => screenText.includes(w));
                if (!isMenuOrInteractive) {
                    // Only auto-advance non-interactive splash screens (like title poem or saved character press space to enter)
                    if (screenText.includes('into the vast and echoing gloom') || 
                        screenText.includes('depths they went alone') || 
                        screenText.includes('menace dark enshrined') ||
                        screenText.includes('when the world is old and the days of wonder') ||
                        screenText.includes('rephial.org') ||
                        screenText.includes('last battle be gathered') ||
                        (screenText.includes('press any key to continue') && !screenText.includes('character traits'))) {
                        network.sendKey('space');
                    }
                }
            }
            // Check if player died or took damage into critical HP range (never while regenerating/resting)
            if (frame.player && frame.player.dead) {
                if (audio) audio.playDeathBell();
                window.__lastWarningHp = null;
            } else if (frame.player && frame.player.hp !== undefined && frame.player.hp_max) {
                const prevWarnHp = typeof window.__lastWarningHp === 'number' ? window.__lastWarningHp : frame.player.hp;
                if (frame.player.hp < prevWarnHp && (frame.player.hp / frame.player.hp_max <= 0.25)) {
                    if (audio) audio.playLowHpWarning();
                }
                window.__lastWarningHp = frame.player.hp;
            }
            // MenuRouter & CommandDispatcher advance pending plans before view mode is evaluated
            const realmForRouter = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (frame && frame.realm) || 'angband';
            lastScreenModel = (SC && SC.ScreenModel && typeof SC.ScreenModel.of === 'function')
                ? SC.ScreenModel.of(frame, realmForRouter, { lang: window.__langMode || 'en', decode: decodeHengbandText, forceTerminal })
                : null;
            if (frame && typeof frame === 'object') {
                frame._screenModel = lastScreenModel;
            }
            if (dispatcher && typeof dispatcher.onFrame === 'function') {
                try { dispatcher.onFrame(frame); } catch (err) { console.error('[Dispatcher Error]', err); }
            }
            if (input && input.quickActions && typeof input.quickActions.onFrame === 'function') {
                try { input.quickActions.onFrame(frame); } catch (err) { console.error('[QuickActions Error]', err); }
            }
            if (window.MenuRouter && typeof window.MenuRouter.onFrame === 'function') {
                try {
                    window.MenuRouter.onFrame(frame, realmForRouter);
                } catch (err) {
                    console.error('[MenuRouter Error]', err);
                }
            }
            // Update View Mode Visibility first so layouts and modes are synced
            updateViewMode(frame);
            // Update Smart Contextual Controls (D-Pad Center Action, Staircase, Doors, Auto-Nav)
            if (input && input.updateContextualControls) {
                try {
                    input.updateContextualControls(frame);
                } catch (err) {
                    console.error('[InputContext Error]', err);
                }
            }
            // Render Terminal if active or in setup phase
            const needsTerm = needsTerminal(frame) || forceTerminal;
            if (promptMirror && typeof promptMirror.render === 'function') {
                try {
                    promptMirror.render(frame, (!needsTerm && currentPhase === 'play') ? lastScreenModel : null, realmForRouter, { sendKey: (k) => network && network.sendKey(k) });
                } catch (err) {
                    console.error('[PromptMirror Error]', err);
                }
            }
            if (frame.term && (needsTerm || currentPhase !== 'play')) {
                terminal.render(frame.term);
            }
            // Render 3D Dungeon World whenever in play phase with valid map
            if (currentPhase === 'play' && frame.map && frame.player) {
                try {
                    dungeon.updateDungeon(frame);
                } catch (err) {
                    console.error('[Dungeon3D Error]', err);
                }
            }
            // Update HUD
            try {
                hud.update(frame);
            } catch (err) {
                console.error('[HUD Error]', err);
            }
            // Update Terminal Toolbar & Context
            try {
                updateTerminalToolbar(frame);
            } catch (err) {
                console.error('[TerminalToolbar Error]', err);
            }
        };
        network.onBye = (detail) => {
            if (window.__startWatchdog) {
                clearTimeout(window.__startWatchdog);
                window.__startWatchdog = null;
            }
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
            console.warn('[Angband3D] Disconnected:', detail);
            if (hud.setStatus) {
                hud.setStatus(engineMode === 'local' ? 'Local [Stopped]' : 'Cloud [Disconnected]');
            } else if (hud.pingBadge) {
                hud.pingBadge.textContent = engineMode === 'local' ? 'Local [Stopped]' : 'Cloud [Disconnected]';
            }
            if (detail) {
                const isHibernated = /saved|inactivity|timeout|disconnected/i.test(detail);
                if (!isHibernated) {
                    showRealmToast(`⚠️ ${detail}`);
                }
                const topBanner = document.getElementById('top-message-banner');
                const topText = document.getElementById('message-text');
                if (topBanner && topText) {
                    topText.textContent = isHibernated
                        ? `⚡ Standby (Progress Saved) • Move or tap anywhere to continue`
                        : `⏳ ${detail} Click or tap anywhere to resume.`;
                    topBanner.classList.remove('hidden');
                    topBanner.style.cursor = 'pointer';
                    const resumeHandler = () => {
                        topBanner.removeEventListener('click', resumeHandler);
                        topBanner.style.cursor = 'default';
                        network.manualDisconnect = false;
                        network.sessionHibernated = false;
                        network.connect(network.currentChar, false, network.currentSave, network.currentRealm || activeRealm);
                    };
                    topBanner.addEventListener('click', resumeHandler, { once: true });
                }
            }
            if (appState === 'game' && !lastFrame && !hasEnteredPlay) {
                returnToMainMenu();
            }
        };
        network.onError = (errMsg) => {
            if (window.__startWatchdog) {
                clearTimeout(window.__startWatchdog);
                window.__startWatchdog = null;
            }
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
            console.error('[Angband3D] Network Error:', errMsg);
            if (!hasEnteredPlay) {
                showRealmToast(`❌ Engine Error: ${errMsg}`);
            }
            if (appState === 'game' && !lastFrame && !hasEnteredPlay) {
                returnToMainMenu();
            }
        };
        network.onStatus = (status) => {
            if (hud.setStatus) {
                if (engineMode === 'local') {
                    hud.setStatus(status.includes('Error') ? status : '⚡ Local [0ms]');
                } else {
                    hud.setStatus(status.includes('Connecting') ? 'Cloud [Connecting...]' : (status.includes('Connected') ? 'Cloud [Connected]' : status));
                }
            } else if (hud.pingBadge) {
                hud.pingBadge.textContent = status;
            }
        };
        network.onSavePersisted = (charName) => {
            console.log('[Angband3D] Save persisted to IndexedDB:', charName);
            if (hud && typeof hud.setStatus === 'function') {
                hud.setStatus('⚡ Saved to Device');
                setTimeout(() => hud.setPing(0), 2000);
            }
        };
    }
    bindNetworkEventHandlers();
    updateEngineModeUI();
    updateRealmUI();
    setupRealmModalEvents();
    setupCommandPaletteEvents();
    // Live 3D Celestial Diorama: When in Splash or Main Menu and no gameplay frame has arrived,
    // gently tilt camera pitch upward and orbit yaw so the Celestial Sky Dome & Town diorama shine through.
    function tickMenuDiorama(time) {
        if ((appState === 'splash' || appState === 'mainMenu') && !lastFrame) {
            const dr = window.__dungeonRenderer || window.dungeon;
            if (dr && dr.camera) {
                // Gently tilt camera pitch upward towards the celestial dome & Milky Way
                dr.userPitchOffset = 0.22 + Math.sin(time * 0.0006) * 0.05;
                // Smoothly orbit yaw so Town masonry and constellations pan gently
                dr.targetYaw = (dr.targetYaw || 0) + 0.0006;
            }
        }
        requestAnimationFrame(tickMenuDiorama);
    }
    requestAnimationFrame(tickMenuDiorama);
    // 3. Initial Boot: Check URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('play') === '1' || urlParams.get('autoplay') === '1') {
        const isNew = urlParams.get('new') === '1' || urlParams.get('reroll') === '1';
        const charName = urlParams.get('char') || (isNew ? generateHeroName(activeRealm) : 'Adventurer');
        startGame({ charName, isNew, autoBirth: isNew });
    } else if (urlParams.get('demo') === '1' || window.location.hash === '#demo') {
        showSplash();
        showDemoModal('splash');
        checkSaves();
    } else {
        // Show Splash Screen and fetch saves in background
        showSplash();
        checkSaves();
    }
});

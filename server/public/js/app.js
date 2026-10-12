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

    // Register PWA Service Worker for home-screen installation & offline shell caching
    if ('serviceWorker' in navigator) {
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

    let network = (engineMode === 'cloud' && window.GameNetwork) ? new GameNetwork() : new LocalGameBridge();
    const dungeon = new Dungeon3D('viewport-canvas');
    dungeon.realm = activeRealm;
    window.dungeon = dungeon;
    window.__dungeon = dungeon;
    const hud = new WebHUD('minimap-canvas');

    let forceTerminal = false;
    let currentPhase = 'setup';

    const terminal = new WebTerminal('terminal-canvas', (key) => {
        if (audio) audio.unlock();
        network.sendKey(key);
    });

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

    window.__app = {
        audio,
        network,
        dungeon,
        hud,
        terminal,
        setEngineMode,
        getEngineMode: () => engineMode,
        isApk,
        isBirthReviewActive: () => birthReviewActive,
        rerollHero: () => rerollHero(),
        generateHeroName: (r, l) => generateHeroName(r, l),
        getActiveRealm: () => (typeof activeRealm !== 'undefined' && activeRealm) ? activeRealm : 'angband'
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
    let silqStatAllocated = false;
    let silqNameSent = false;
    let fcbRaceDone = false;
    let fcbClassDone = false;
    let fcbPersDone = false;

    const cancelQuickBirth = () => {
        quickBirthActive = false;
        quickBirthStep = 0;
        birthConfirming = false;
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
        network.sendKey('enter');
    };

    const finalizeHeroBirth = () => {
        cancelQuickBirth();
        birthReviewActive = false;
        birthConfirming = false;
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

    function decodeHengbandText(str) {
        if (!str) return '';
        if (/[\u3000-\u9faf]/.test(str)) return str;
        if (terminal && typeof terminal.decodeText === 'function') {
            return terminal.decodeText(str);
        }
        return str;
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
        const isReviewScreen = screenText.includes('to start over') ||
                               screenText.includes("'s' to start") ||
                               screenText.includes('accept character') ||
                               screenText.includes('re-roll') ||
                               screenText.includes("['r'eroll") ||
                               screenText.includes("or enter to accept") ||
                               screenText.includes("reroll, 'h'istory") ||
                               screenText.includes("能力値の決定") ||
                               screenText.includes("能力値決定") ||
                               screenText.includes("次の数値") ||
                               screenText.includes("前の数値") ||
                               screenText.includes("この数値に決定") ||
                               (screenText.includes('enter your starting stats') && screenText.includes('begin play')) ||
                               (screenText.includes('step back') && screenText.includes('continue'));

        if (isReviewScreen) {
            quickBirthActive = false;
            birthReviewActive = true;
            forceTerminal = true;
            updateViewMode(frame);

            const quickBirthBtn = document.getElementById('btn-quick-birth');
            const termRerollBtn = document.getElementById('btn-term-reroll');
            const termCustomBtn = document.getElementById('btn-term-custom');
            const termAdvanceBtn = document.getElementById('btn-term-advance');
            const termEscapeBtn = document.getElementById('btn-term-escape');
            const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');

            if (quickBirthBtn) quickBirthBtn.style.display = 'none';
            if (termRerollBtn) termRerollBtn.style.display = 'inline-flex';
            if (termCustomBtn) termCustomBtn.style.display = 'inline-flex';
            if (termAdvanceBtn) {
                termAdvanceBtn.style.display = 'inline-flex';
                termAdvanceBtn.textContent = '⚔ Accept & Play (Enter)';
            }
            if (termEscapeBtn) {
                termEscapeBtn.style.display = 'inline-flex';
                termEscapeBtn.textContent = 'Back (Esc)';
            }
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
            // If already playing in world, start a fresh random hero session
            if (currentPhase === 'play') {
                startNewRandomHero();
                return;
            }
            cancelQuickBirth();
            quickBirthActive = true;
            quickBirthStep = 0;
            if (lastFrame) {
                stepQuickBirth(lastFrame);
            } else {
                network.sendKey('enter');
            }
        });
    }

    const termRerollBtn = document.getElementById('btn-term-reroll');
    if (termRerollBtn) {
        termRerollBtn.addEventListener('click', (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (audio) audio.unlock();
            rerollHero();
        });
    }

    const termCustomBtn = document.getElementById('btn-term-custom');
    if (termCustomBtn) {
        termCustomBtn.addEventListener('click', () => {
            if (audio) audio.unlock();
            startCustomHeroCreation();
        });
    }

    const termAdvanceBtn = document.getElementById('btn-term-advance');
    if (termAdvanceBtn) {
        termAdvanceBtn.addEventListener('click', () => {
            if (audio) audio.unlock();
            if (birthReviewActive) {
                confirmHeroBirth();
            } else {
                if (audio) audio.playWhoosh();
                network.sendKey('enter');
            }
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

            network.sendKey('escape');
            forceTerminal = false;
            terminalContainer.classList.add('hidden');
            input.setTerminalMode(false);
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
                    updateTerminalToolbar(lastFrame);
                    return;
                }
            }

            // Letter Ribbon option buttons (e.g. [a], [b], [*]) must strictly pass their key directly
            if (btn.classList.contains('term-letter-btn')) {
                const realm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (lastFrame && lastFrame.realm) || 'angband';
                if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                    if (window.MenuRouter.route(key, lastFrame, realm)) {
                        updateTerminalToolbar(lastFrame);
                        return;
                    }
                }
                network.sendKey(key);
                return;
            }

            const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
            const screenText = (lastFrame && lastFrame.term && lastFrame.term.rows)
                ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase()
                : '';
            const isChoiceMenu = !inPlay && (
                screenText.includes("性別") || screenText.includes("種族") ||
                screenText.includes("職業") || screenText.includes("性格") ||
                screenText.includes("魔法領域") || screenText.includes("領域を選んで") ||
                screenText.includes("choose sex") || screenText.includes("choose your sex") ||
                screenText.includes("sex affects stats") || screenText.includes("choose character sex") ||
                screenText.includes("choose a race") || screenText.includes("choose race") ||
                screenText.includes("race affects stats") || screenText.includes("choose character race") ||
                screenText.includes("choose a class") || screenText.includes("choose class") ||
                screenText.includes("class affects stats") || screenText.includes("choose character class") ||
                screenText.includes("choose a personality") || screenText.includes("choose personality") ||
                screenText.includes("personality affects stats") ||
                screenText.includes("choose realm") || screenText.includes("choose a realm") ||
                screenText.includes("choose first realm") || screenText.includes("choose second realm") ||
                screenText.includes("first realm") || screenText.includes("second realm") ||
                screenText.includes("choose a house") || screenText.includes("choose house") ||
                screenText.includes("choose character background") || screenText.includes("choose background") ||
                screenText.includes("choose subrace") || screenText.includes("choose a subrace") ||
                screenText.includes("*でランダム") || screenText.includes("* for random") ||
                screenText.includes("escで戻る") || screenText.includes("esc to return") ||
                screenText.includes("esc to step back") || screenText.includes("esc:戻る") ||
                screenText.includes("escで前へ")
            );
            const isNamePrompt = !inPlay && (
                screenText.includes("名前を入力") || screenText.includes("character's name") ||
                screenText.includes("enter a name") || screenText.includes("choose your name")
            );

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
                        network.sendCommand(`keys .${d}`);
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
                        const w = Math.max(minW, Math.min(window.innerWidth - 20, sz.width));
                        const h = Math.max(minH, Math.min(window.innerHeight - 20, sz.height));
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
    const input = new InputController(network, dungeon, terminal, audio, toggleTerminalView);
    window.__app = {
        network,
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

    function showSplash() {
        appState = 'splash';
        updateRealmUI();
        if (splashOverlay) splashOverlay.classList.remove('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (realmModal) realmModal.classList.add('hidden');
        if (cmdPaletteModal) cmdPaletteModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        if (queueModal) queueModal.classList.add('hidden');
        stopQueueTipRotation();
        if (terminalContainer) terminalContainer.classList.add('hidden');
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuNav();
    }

    function showMainMenu() {
        appState = 'mainMenu';
        updateRealmUI();
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.remove('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (realmModal) realmModal.classList.add('hidden');
        if (cmdPaletteModal) cmdPaletteModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        if (queueModal) queueModal.classList.add('hidden');
        stopQueueTipRotation();
        if (terminalContainer) terminalContainer.classList.add('hidden');
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuOpen();
        if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
            window.MenuRouter.clearPending();
        }
        updateEngineModeUI();
        checkSaves();
        updateMenuSelectionUI();
    }

    // Load Menu Handler
    async function showLoadMenu(fromPause = false) {
        loadPreviousState = fromPause ? 'pauseMenu' : 'mainMenu';
        appState = 'loadMenu';
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        if (terminalContainer) terminalContainer.classList.add('hidden');
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
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
                        <div class="save-item-name">${save.characterName || save.filename}</div>
                        <div class="save-item-summary">${save.description || 'Saved Adventurer'}</div>
                        <div class="save-item-meta">Saved ${modDate} • ${sizeKb}</div>
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
        if (pauseModal) pauseModal.classList.remove('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
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

    function activatePauseMenuItem() {
        if (audio) audio.playMenuSelect();
        switch (selectedPauseIndex) {
            case 0: // Resume Game
                resumeGame();
                break;
            case 1: // Save Game Now
                saveGameNow();
                break;
            case 2: // Download Current Save (.sav)
                downloadCurrentSave();
                break;
            case 3: // Load Other Character...
                showLoadMenu(true);
                break;
            case 4: // Start Over (Random)
                startNewRandomHero();
                break;
            case 5: // Start Over (Custom)
                startNewCustomHero();
                break;
            case 6: // Game Guide & Primer
                showGuide(0, 'pauseMenu');
                break;
            case 7: // Toggle Fullscreen
                if (input) input.toggleFullscreen();
                break;
            case 8: // Save & Quit to Main Menu
                returnToMainMenu();
                break;
        }
    }

    // Guide Modal Handlers
    function showGuide(tabIndex = 0, fromState = null) {
        guidePreviousState = fromState || appState;
        appState = 'guide';
        if (guideModal) guideModal.classList.remove('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        if (terminalContainer) terminalContainer.classList.add('hidden');
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
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
    }

    function activateMenuItem(overrideIndex = null) {
        if (audio) audio.playMenuSelect();
        const idx = overrideIndex !== null ? overrideIndex : selectedMenuIndex;
        switch (idx) {
            case 0: // Continue Adventure
                if (latestSave) {
                    startGame({
                        charName: latestSave.characterName || 'Adventurer',
                        saveFile: latestSave.filename,
                        isNew: false,
                        autoBirth: false
                    });
                } else {
                    // Fallback to random quick-start if no saves exist
                    startNewRandomHero();
                }
                break;
            case 1: // Load Saved Game...
                showLoadMenu(false);
                break;
            case 2: // Start from Scratch (Random Hero)
                startNewRandomHero();
                break;
            case 3: // Start from Scratch (Custom Hero)
                startNewCustomHero();
                break;
            case 4: // Option [5]: Game Guide & Primer
                showGuide(0, 'mainMenu');
                break;
            case 5: // Option [6]: Standalone Apps & Downloads (Android / PC)
                showPWAModal('mainMenu');
                break;
            case 6: // Option [7]: 🎬 Gameplay Demo & Showcase
                showDemoModal('mainMenu');
                break;
            case 7: // Option [8]: Summary & Credits
                showGuide(6, 'mainMenu');
                break;
            case 8: // Option [R]: Switch Realm
                showSplash();
                break;
        }
    }

    const REALM_HERO_NAMES = {
        hengband: {
            japanese: [
                'Musashi', 'Kojiro', 'Nobunaga', 'Masamune', 'Yukimura',
                'Hanzo', 'Goemon', 'Raiko', 'Kenshin', 'Shingen',
                'Benkei', 'Yoshitsune', 'Tomoe', 'Kotaro', 'Jubei',
                'Saizo', 'Sasuke', 'Genji', 'Kiyomori', 'Hideyoshi'
            ],
            amberite: [
                'Corwin', 'Benedict', 'Eric', 'Random', 'Bleys',
                'Brand', 'Gerard', 'Julian', 'Caine', 'Dworkin',
                'Merlin', 'Martin', 'Jurt', 'Fiona', 'Llewella'
            ]
        },
        silq: [
            'Beren', 'Fingolfin', 'Feanor', 'Turin', 'Tuor',
            'Earendil', 'Hurin', 'Beleg', 'Mablung', 'Finrod',
            'Glorfindel', 'Ecthelion', 'Voronwe', 'Daeron', 'Luthien',
            'Idril', 'Morwen', 'Celegorm', 'Curufin', 'Maglor'
        ],
        frogcomposband: [
            'Elric', 'Conan', 'Fafhrd', 'GrayMouser', 'Belgarath',
            'Sparrowhawk', 'Corwin', 'Arthur', 'Roland', 'Gwydion',
            'Vlad', 'Geralt', 'Locke', 'Kvothe', 'Cugel'
        ],
        angband: [
            'Aragorn', 'Boromir', 'Faramir', 'Theoden', 'Eomer',
            'Bard', 'Beren', 'Isildur', 'Elendil', 'Thorin',
            'Gimli', 'Gloin', 'Dain', 'Frodo', 'Samwise'
        ]
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
        const suffix = Math.floor(10 + Math.random() * 90);
        return `${base}_${suffix}`;
    }

    function startNewRandomHero() {
        const heroName = generateHeroName(activeRealm);
        startGame({
            charName: heroName,
            isNew: true,
            autoBirth: true
        });
    }

    function startNewCustomHero() {
        const heroName = generateHeroName(activeRealm);
        startGame({
            charName: heroName,
            isNew: true,
            autoBirth: false
        });
    }

    function startGame(options) {
        appState = 'game';
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (demoModal) demoModal.classList.add('hidden');
        if (window.demoPlayer && typeof window.demoPlayer.close === 'function') window.demoPlayer.close();
        if (queueModal) queueModal.classList.add('hidden');
        stopQueueTipRotation();
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');

        // Watchdog: If engine fails to respond or socket hangs, dismiss loading overlay after 10s and return to menu
        if (window.__startWatchdog) clearTimeout(window.__startWatchdog);
        window.__startWatchdog = setTimeout(() => {
            if (loadingOverlay && !loadingOverlay.classList.contains('hidden') && !lastFrame) {
                console.warn('[Angband3D] Game start watchdog: engine response timed out after 10s.');
                loadingOverlay.classList.add('hidden');
                showRealmToast(`⚠️ Connection timed out while starting realm "${chosenRealm}". Please check server.`);
                returnToMainMenu();
            }
        }, 10000);

        quickBirthActive = !!options.autoBirth;
        quickBirthStep = 0;
        forceTerminal = false;
        lastFrame = null;

        if (hud && typeof hud.resetMessages === 'function') {
            hud.resetMessages();
        }

        if (options.isNew && window.chronicleManager && typeof window.chronicleManager.resetForNewCharacter === 'function') {
            window.chronicleManager.resetForNewCharacter({ name: options.charName });
        }

        const chosenRealm = options.realm || activeRealm || 'angband';
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
        if (window.chronicleManager && typeof window.chronicleManager.stopStoryPlayback === 'function') {
            window.chronicleManager.stopStoryPlayback();
        }
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

    // Attach DOM event listeners for splash buttons
    const btnSplashStart = document.getElementById('btn-splash-start');
    if (btnSplashStart) bindFastTap(btnSplashStart, () => showMainMenu());

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

    const btnSplashGuide = document.getElementById('btn-splash-guide');
    if (btnSplashGuide) bindFastTap(btnSplashGuide, () => showGuide(0, 'splash'));

    const btnSplashFeatures = document.getElementById('btn-splash-features');
    if (btnSplashFeatures) bindFastTap(btnSplashFeatures, () => showGuide(1, 'splash'));

    const btnSplashChronicle = document.getElementById('btn-splash-chronicle');
    if (btnSplashChronicle) bindFastTap(btnSplashChronicle, () => showGuide(1, 'splash'));

    const btnSplashProtips = document.getElementById('btn-splash-protips');
    if (btnSplashProtips) bindFastTap(btnSplashProtips, () => showGuide(4, 'splash'));

    const btnSplashCredits = document.getElementById('btn-splash-credits');
    if (btnSplashCredits) bindFastTap(btnSplashCredits, () => showGuide(6, 'splash'));

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

    const btnMenuGuide = document.getElementById('btn-menu-guide');
    if (btnMenuGuide) bindFastTap(btnMenuGuide, () => showGuide(0, 'mainMenu'));

    const btnMenuCredits = document.getElementById('btn-menu-credits');
    if (btnMenuCredits) bindFastTap(btnMenuCredits, () => showGuide(6, 'mainMenu'));

    const btnSplashRealms = document.getElementById('btn-splash-realms');
    if (btnSplashRealms) {
        bindFastTap(btnSplashRealms, (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            showRealmSelector('splash');
        });
    }

    const btnSplashCommands = document.getElementById('btn-splash-commands');
    if (btnSplashCommands) {
        bindFastTap(btnSplashCommands, (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            showCommandPalette('splash');
        });
    }

    const btnMenuRealms = document.getElementById('btn-menu-realms');
    if (btnMenuRealms) bindFastTap(btnMenuRealms, () => showSplash());

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
    if (btnCommandPalette) bindFastTap(btnCommandPalette, () => showCommandPalette('game'));

    // Audio Volume & Mute Control Synchronization
    function syncAudioUI() {
        if (!audio) return;
        const isMuted = audio.isMuted();
        const volPct = Math.round(audio.getMasterVolume() * 100);

        const btnSound = document.getElementById('btn-sound');
        if (btnSound) {
            btnSound.innerHTML = `<span class="sound-icon">${isMuted ? '🔇' : '🔊'}</span><span class="sound-label">${isMuted ? 'Muted' : 'Sound'}</span>`;
            btnSound.title = isMuted ? 'Unmute Sound' : 'Mute Sound';
            if (isMuted) {
                btnSound.classList.add('muted');
            } else {
                btnSound.classList.remove('muted');
            }
        }

        const volSlider = document.getElementById('volume-slider');
        if (volSlider) volSlider.value = volPct;

        const volLabel = document.getElementById('volume-label');
        if (volLabel) volLabel.textContent = isMuted ? '0%' : `${volPct}%`;

        // Mobile / Desktop Audio Configuration Popover Synchronization
        const popoverBadge = document.getElementById('popover-vol-badge');
        if (popoverBadge) {
            popoverBadge.textContent = isMuted ? '🔇 Muted' : `${volPct}%`;
        }

        const popoverSlider = document.getElementById('popover-volume-slider');
        if (popoverSlider) {
            popoverSlider.value = volPct;
        }

        const btnPopoverMute = document.getElementById('btn-popover-mute');
        if (btnPopoverMute) {
            btnPopoverMute.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
            if (isMuted) {
                btnPopoverMute.classList.add('muted');
            } else {
                btnPopoverMute.classList.remove('muted');
            }
        }

        // Tome / Lorekeeper Voice Volume Synchronization
        const voiceVol = (window.chronicleManager && window.chronicleManager.audio && typeof window.chronicleManager.audio.getVoiceVolume === 'function')
            ? window.chronicleManager.audio.getVoiceVolume()
            : (parseFloat(localStorage.getItem('angband3d_tome_voice_volume')) || 1.0);
        const voicePct = Math.round(voiceVol * 100);

        const popoverVoiceBadge = document.getElementById('popover-voice-badge');
        if (popoverVoiceBadge) {
            popoverVoiceBadge.textContent = isMuted ? '0%' : `${voicePct}%`;
        }
        const popoverVoiceSlider = document.getElementById('popover-voice-slider');
        if (popoverVoiceSlider) {
            popoverVoiceSlider.value = voicePct;
        }

        // Sound Effects (SFX) Sub-Bus Volume Synchronization
        const sfxVol = (audio && typeof audio.getSfxVolume === 'function')
            ? audio.getSfxVolume()
            : 1.0;
        const sfxPct = Math.round(sfxVol * 100);

        const popoverSfxBadge = document.getElementById('popover-sfx-badge');
        if (popoverSfxBadge) {
            popoverSfxBadge.textContent = isMuted ? '0%' : `${sfxPct}%`;
        }
        const popoverSfxSlider = document.getElementById('popover-sfx-slider');
        if (popoverSfxSlider) {
            popoverSfxSlider.value = sfxPct;
        }

        // Subterranean Reverb Synchronization
        const revVol = (window.chronicleManager && window.chronicleManager.audio && typeof window.chronicleManager.audio.reverbWet === 'number')
            ? window.chronicleManager.audio.reverbWet
            : (parseFloat(localStorage.getItem('angband_chronicle_reverb')) || 0.10);
        const revPct = Math.round(revVol * 100);

        const popoverRevBadge = document.getElementById('popover-reverb-badge');
        if (popoverRevBadge) {
            popoverRevBadge.textContent = `${revPct}%`;
        }
        const popoverRevSlider = document.getElementById('popover-reverb-slider');
        if (popoverRevSlider) {
            popoverRevSlider.value = revPct;
        }

        // Highlight matching preset button
        const presetBtns = document.querySelectorAll('.vol-preset-btn');
        presetBtns.forEach(btn => {
            const bVol = parseInt(btn.dataset.vol, 10);
            if ((isMuted && bVol === 0) || (!isMuted && bVol === volPct)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const btnPauseMute = document.getElementById('btn-pause-mute');
        if (btnPauseMute) {
            btnPauseMute.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
            if (isMuted) {
                btnPauseMute.classList.add('muted');
            } else {
                btnPauseMute.classList.remove('muted');
            }
        }

        const pauseVolSlider = document.getElementById('pause-volume-slider');
        if (pauseVolSlider) pauseVolSlider.value = volPct;

        const pauseVolLabel = document.getElementById('pause-volume-label');
        if (pauseVolLabel) pauseVolLabel.textContent = isMuted ? '0%' : `${volPct}%`;
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

    const popoverVolSlider = document.getElementById('popover-volume-slider');
    if (popoverVolSlider) {
        const handleSliderChange = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            if (audio) {
                audio.unlock();
                const val = parseInt(popoverVolSlider.value, 10) / 100;
                audio.setMasterVolume(val);
                if (audio.isMuted() && val > 0) audio.setMute(false);
                syncAudioUI();
                showQuickVolumePopover();
            }
        };
        popoverVolSlider.addEventListener('input', handleSliderChange);
        popoverVolSlider.addEventListener('change', (e) => {
            handleSliderChange(e);
            if (audio && !audio.isMuted() && typeof audio.playMenuNav === 'function') {
                audio.playMenuNav();
            }
        });
        popoverVolSlider.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            clearTimeout(popoverDismissTimer);
        }, { passive: true });
        popoverVolSlider.addEventListener('touchend', () => {
            showQuickVolumePopover();
        }, { passive: true });
        popoverVolSlider.addEventListener('click', (e) => e.stopPropagation());
    }

    // Tome Narration Voice Slider
    const popoverVoiceSlider = document.getElementById('popover-voice-slider');
    if (popoverVoiceSlider) {
        const handleVoiceChange = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            const val = parseInt(popoverVoiceSlider.value, 10) / 100;
            if (window.chronicleManager && window.chronicleManager.audio) {
                window.chronicleManager.audio.setVoiceVolume(val);
            } else {
                try { localStorage.setItem('angband3d_tome_voice_volume', val.toString()); } catch (_) {}
            }
            syncAudioUI();
            showQuickVolumePopover();
        };
        popoverVoiceSlider.addEventListener('input', handleVoiceChange);
        popoverVoiceSlider.addEventListener('change', handleVoiceChange);
        popoverVoiceSlider.addEventListener('click', (e) => e.stopPropagation());
        popoverVoiceSlider.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            clearTimeout(popoverDismissTimer);
        }, { passive: true });
        popoverVoiceSlider.addEventListener('touchend', () => showQuickVolumePopover(), { passive: true });
    }

    // Sound Effects (SFX) Slider
    const popoverSfxSlider = document.getElementById('popover-sfx-slider');
    if (popoverSfxSlider) {
        const handleSfxChange = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            if (audio) {
                audio.unlock();
                const val = parseInt(popoverSfxSlider.value, 10) / 100;
                audio.setSfxVolume(val);
                syncAudioUI();
                showQuickVolumePopover();
            }
        };
        popoverSfxSlider.addEventListener('input', handleSfxChange);
        popoverSfxSlider.addEventListener('change', (e) => {
            handleSfxChange(e);
            if (audio && !audio.isMuted() && typeof audio.playMenuNav === 'function') {
                audio.playMenuNav();
            }
        });
        popoverSfxSlider.addEventListener('click', (e) => e.stopPropagation());
        popoverSfxSlider.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            clearTimeout(popoverDismissTimer);
        }, { passive: true });
        popoverSfxSlider.addEventListener('touchend', () => showQuickVolumePopover(), { passive: true });
    }

    // Subterranean Reverb Slider
    const popoverReverbSlider = document.getElementById('popover-reverb-slider');
    if (popoverReverbSlider) {
        const handleReverbChange = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            const val = parseInt(popoverReverbSlider.value, 10) / 100;
            if (window.chronicleManager && window.chronicleManager.audio) {
                window.chronicleManager.audio.setReverbVolume(val);
            } else {
                try { localStorage.setItem('angband_chronicle_reverb', val.toString()); } catch (_) {}
            }
            syncAudioUI();
            showQuickVolumePopover();
        };
        popoverReverbSlider.addEventListener('input', handleReverbChange);
        popoverReverbSlider.addEventListener('change', handleReverbChange);
        popoverReverbSlider.addEventListener('click', (e) => e.stopPropagation());
        popoverReverbSlider.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            clearTimeout(popoverDismissTimer);
        }, { passive: true });
        popoverReverbSlider.addEventListener('touchend', () => showQuickVolumePopover(), { passive: true });
    }

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
        let lastActionTime = 0;
        let lastTouchEndTime = 0;
        let startX = 0, startY = 0, moved = false;

        const trigger = (e) => {
            const now = Date.now();
            if (now - lastActionTime < 250) return;
            lastActionTime = now;
            if (e && e.cancelable && e.type !== 'click') e.preventDefault();
            if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
            selectedMenuIndex = idx;
            updateMenuSelectionUI();
            activateMenuItem();
        };

        btn.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                moved = false;
            }
        }, { passive: true });

        btn.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length === 1) {
                const dx = Math.abs(e.touches[0].clientX - startX);
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dx > 10 || dy > 10) moved = true;
            }
        }, { passive: true });

        btn.addEventListener('touchend', (e) => {
            lastTouchEndTime = Date.now();
            if (!moved) {
                trigger(e);
            }
            moved = false;
        }, { passive: false });

        btn.addEventListener('touchcancel', () => {
            lastTouchEndTime = Date.now();
            moved = false;
        }, { passive: true });

        btn.addEventListener('click', (e) => {
            if (Date.now() - lastTouchEndTime < 500) return; // Suppress synthetic click from touch
            trigger(e);
        });

        btn.addEventListener('mouseenter', () => {
            selectedMenuIndex = idx;
            updateMenuSelectionUI();
        });
    });

    pauseOptionBtns.forEach((btn, idx) => {
        let lastActionTime = 0;
        let lastTouchEndTime = 0;
        let startX = 0, startY = 0, moved = false;

        const trigger = (e) => {
            const now = Date.now();
            if (now - lastActionTime < 250) return;
            lastActionTime = now;
            if (e && e.cancelable && e.type !== 'click') e.preventDefault();
            if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
            selectedPauseIndex = idx;
            updatePauseMenuSelectionUI();
            activatePauseMenuItem();
        };

        btn.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                moved = false;
            }
        }, { passive: true });

        btn.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length === 1) {
                const dx = Math.abs(e.touches[0].clientX - startX);
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dx > 10 || dy > 10) moved = true;
            }
        }, { passive: true });

        btn.addEventListener('touchend', (e) => {
            lastTouchEndTime = Date.now();
            if (!moved) {
                trigger(e);
            }
            moved = false;
        }, { passive: false });

        btn.addEventListener('touchcancel', () => {
            lastTouchEndTime = Date.now();
            moved = false;
        }, { passive: true });

        btn.addEventListener('click', (e) => {
            if (Date.now() - lastTouchEndTime < 500) return; // Suppress synthetic click from touch
            trigger(e);
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
        if (pwaModal) pwaModal.classList.remove('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (terminalContainer) terminalContainer.classList.add('hidden');
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
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
        showRealmToast(`Realm Attuned: <strong>${realm.name}</strong> • ${realm.tagline}`);
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
        showRealmToast(`🌐 Hengband Language Mode: <strong>${desc}</strong> [Alt+L]`);
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
        updateLanguageUI();
        const realm = REALM_DATA[activeRealm] || REALM_DATA.angband;

        // 1. Splash Screen UI Synchronization
        const splashName = document.getElementById('splash-active-realm-name');
        if (splashName) splashName.textContent = realm.name;

        const splashCtaName = document.getElementById('splash-cta-realm-name');
        if (splashCtaName) splashCtaName.textContent = realm.name;

        const splashCards = document.querySelectorAll('.splash-realm-card');
        splashCards.forEach((card) => {
            const isMatch = card.dataset.realm === activeRealm;
            card.classList.toggle('active', isMatch);
            card.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            const badge = card.querySelector('.splash-realm-badge');
            if (badge) badge.style.display = isMatch ? 'block' : 'none';
        });

        const splashLangSelect = document.getElementById('splash-hengband-lang-select');
        if (splashLangSelect) {
            try {
                const storedLang = localStorage.getItem('angband3d_lang_mode') || 'en';
                splashLangSelect.value = (storedLang === 'jp' ? 'jp' : 'en');
            } catch (_) {}
        }

        // 2. Main Menu UI Synchronization
        const menuActiveRealmName = document.getElementById('menu-active-realm-name');
        if (menuActiveRealmName) menuActiveRealmName.textContent = realm.name;

        const menuDesc = document.getElementById('menu-realm-desc');
        if (menuDesc) menuDesc.textContent = `Active: ${realm.name} • ${realm.tagline}`;

        // 3. Modals & HUD Synchronization
        const loadActiveRealmName = document.getElementById('load-active-realm-name');
        if (loadActiveRealmName) loadActiveRealmName.textContent = realm.name;

        const hudLabel = document.getElementById('hud-realm-label');
        if (hudLabel) hudLabel.textContent = realm.name;

        const btnHud = document.getElementById('btn-hud-realm');
        if (btnHud) {
            btnHud.title = `Active Realm: ${realm.name} (Locked during gameplay. Return to Main Menu to switch).`;
        }

        const modalActiveTitle = document.getElementById('realm-modal-active-title');
        if (modalActiveTitle) modalActiveTitle.textContent = realm.name;

        const modalActiveVoice = document.getElementById('realm-modal-active-voice');
        if (modalActiveVoice) modalActiveVoice.textContent = realm.voiceAccent;

        const btnReturn = document.getElementById('btn-realm-modal-return');
        if (btnReturn) {
            btnReturn.innerHTML = `[Esc / Enter] Return with <strong>${escapeHtml(realm.name)}</strong> Attuned`;
        }

        const cards = document.querySelectorAll('.realm-card');
        cards.forEach((card) => {
            const isMatch = card.dataset.realm === activeRealm;
            if (isMatch) {
                card.classList.add('active');
                const badge = card.querySelector('.realm-card-badge');
                if (badge) badge.style.display = 'block';
                const btn = card.querySelector('.btn-realm-select');
                if (btn) {
                    btn.className = 'btn-realm-select btn-gold';
                    btn.textContent = '✓ Active Realm (Selected)';
                }
            } else {
                card.classList.remove('active');
                const badge = card.querySelector('.realm-card-badge');
                if (badge) badge.style.display = 'none';
                const btn = card.querySelector('.btn-realm-select');
                if (btn) {
                    btn.className = 'btn-realm-select btn-gold-outline';
                    btn.textContent = 'Switch to Realm';
                }
            }
        });

        const langSelect = document.getElementById('hengband-lang-select');
        if (langSelect) {
            try {
                const storedLang = localStorage.getItem('angband3d_lang_mode') || 'en';
                langSelect.value = storedLang;
            } catch (_) {}
        }

        // 4. Action Bar Synchronization (Variant actions & bilingual labels via RealmKeys)
        if (typeof RealmKeys !== 'undefined') {
            if (typeof RealmKeys.setActiveRealm === 'function') {
                RealmKeys.setActiveRealm(activeRealm);
            }
            if (typeof RealmKeys.applyLabels === 'function') {
                RealmKeys.applyLabels(document, activeRealm, langMode);
            }
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
        if (realmModal) realmModal.classList.remove('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (cmdPaletteModal) cmdPaletteModal.classList.add('hidden');
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
    // Roguelike Command Reference & Palette Registry (v8.9.3)
    // =========================================================================
    function getRealmCommandRegistry(realmKey, lang) {
        const r = (realmKey || activeRealm || 'angband').toLowerCase();
        const isJp = (r === 'hengband') && (lang === 'jp' || langMode === 'jp' || window.__langMode === 'jp');

        // Universal Base Commands
        const base = [
            { id: 'attack', cat: 'tactical', icon: '⚔️', name: isJp ? '攻撃 / Melee Attack' : 'Context Hero Action / Attack', key: ' ', keyDisplay: 'Space', desc: isJp ? '正面の敵を攻撃します。' : 'Perform physical melee strike or context action against facing tile.' },
            { id: 'throw', cat: 'tactical', icon: '🎯', name: (r === 'silq') ? 'Throw Weapon / Flask' : (isJp ? '投擲 / Throw Item' : 'Throw Item'), key: (r === 'silq') ? 't' : 'v', keyDisplay: (r === 'silq') ? 't' : 'v', desc: (r === 'silq') ? 'Throw a weapon, stone, flask, or potion towards aimed target.' : (isJp ? 'アイテムを狙った方向に投げます。' : 'Throw a weapon, stone, flask, or potion towards aimed direction.') },
            { id: 'fire', cat: 'tactical', icon: '🏹', name: isJp ? '射撃 / Fire Missile' : 'Fire Ranged Weapon', key: 'f', keyDisplay: 'f', desc: isJp ? '装備した弓、スリング、クロスボウから射撃します。' : 'Shoot arrows, bolts, or shot from wielded bow/crossbow/sling.' },
            { id: 'tunnel', cat: 'exploration', icon: '⛏️', name: isJp ? '壁を掘る / Tunnel' : 'Tunnel through Wall / Rubble', key: 'T', keyDisplay: 'Shift+T', desc: isJp ? 'つるはし等で壁や瓦礫を掘削します。' : 'Dig through adjacent granite, quartz, or rubble with wielded pick/digger.' },
            { id: 'disarm', cat: 'exploration', icon: '🖐️', name: isJp ? '罠解除 / Disarm Trap' : 'Disarm Trap', key: 'D', keyDisplay: 'Shift+D', desc: isJp ? '発見した床の罠や宝箱を解除します。' : 'Carefully disarm a spotted dungeon floor trap or chest mechanism.' },
            { id: 'bash', cat: 'tactical', icon: '💥', name: isJp ? '扉を破壊 / Bash Door' : 'Bash / Break Door', key: 'B', keyDisplay: 'Shift+B', desc: isJp ? '体当たりで扉を打ち破ります。' : 'Slam with body and shield to smash open jammed or locked doors.' },
            { id: 'rest', cat: 'tactical', icon: '⏳', name: (r === 'silq') ? 'Rest & Recover Voice' : (isJp ? '休憩 / Rest' : 'Rest & Recover'), key: (r === 'silq') ? '%' : 'R', keyDisplay: (r === 'silq') ? '%' : 'Shift+R', desc: (r === 'silq') ? 'Rest until Voice and Health are recovered.' : (isJp ? 'HPとMPが回復するまで休憩します。' : 'Rest until HP and Mana are fully restored, or until disturbed.') },
            { id: 'close', cat: 'exploration', icon: '🚪', name: isJp ? '扉を閉める / Close Door' : 'Close Door', key: 'c', keyDisplay: 'c', desc: isJp ? '開いている扉を閉めます。' : 'Close an adjacent open door to block line of sight and funnel foes.' },
            { id: 'open', cat: 'exploration', icon: '🔑', name: isJp ? '扉を開ける / Open Door' : 'Open Door or Chest', key: 'o', keyDisplay: 'o', desc: isJp ? '閉じた扉や宝箱を開けます。' : 'Open an adjacent closed door or unopened dungeon chest.' },
            { id: 'quaff', cat: 'magic', icon: '🧪', name: (r === 'silq') ? 'Quaff Draught' : (isJp ? '薬を飲む / Quaff Potion' : 'Quaff Potion'), key: 'q', keyDisplay: 'q', desc: (r === 'silq') ? 'Drink a healing or herbal draught from your pack.' : (isJp ? '所持している薬を飲みます。' : 'Drink a magical potion or elixir from your backpack.') },
            { id: 'read', cat: 'magic', icon: '📜', name: isJp ? '巻物を読む / Read Scroll' : 'Read Magical Scroll', key: 'r', keyDisplay: 'r', desc: isJp ? '魔力の巻物を読みます。' : 'Read and unleash the incantation from an arcane parchment scroll.' },
            { id: 'eat', cat: 'magic', icon: '🍖', name: isJp ? '食料を食べる / Eat Food' : 'Eat Food / Ration', key: 'E', keyDisplay: 'Shift+E', desc: isJp ? '携帯食糧などを食べて空腹を満たします。' : 'Consume iron ration, lembas, or mushroom to stave off starvation.' },
            { id: 'descend', cat: 'exploration', icon: '⬇️', name: isJp ? '階段を下りる / Descend Stairs' : 'Descend Staircase', key: '>', keyDisplay: '>', desc: isJp ? '深いフロアへ下ります。' : 'Descend down staircase or ladder into a deeper dungeon floor.' },
            { id: 'ascend', cat: 'exploration', icon: '⬆️', name: isJp ? '階段を上る / Ascend Stairs' : 'Ascend Staircase', key: '<', keyDisplay: '<', desc: isJp ? '浅いフロアや地上へ戻ります。' : 'Ascend up staircase to shallower depths or return to Town.' },
            { id: 'pickup', cat: 'exploration', icon: '💎', name: isJp ? 'アイテムを拾う / Pick Up' : 'Pick Up Item', key: 'g', keyDisplay: 'g', desc: isJp ? '足元のアイテムや金を拾います。' : 'Retrieve item, gold, weapon, or armor from current floor tile.' },
            { id: 'look', cat: 'tactical', icon: '👁️', name: isJp ? '周囲を見渡す / Look Target' : 'Inspect / Look at Target', key: 'l', keyDisplay: 'l', desc: isJp ? '目標のタイルやモンスターを観察します。' : 'Target and inspect distant tiles, monsters, and objects.' },
            { id: 'inventory', cat: 'system', icon: '🎒', name: isJp ? '所持品一覧 / Inventory' : 'Inventory Pack', key: 'i', keyDisplay: 'i', desc: isJp ? 'ザックの中のアイテム一覧を確認します。' : 'View all items carried in backpack with weights and charges.' },
            { id: 'equipment', cat: 'system', icon: '🛡️', name: isJp ? '装備品一覧 / Equipment' : 'Worn Equipment', key: 'e', keyDisplay: 'e', desc: isJp ? '現在装備している武器や防具を確認します。' : 'Inspect equipped weapons, shield, armor, rings, amulet, and light.' },
            { id: 'character', cat: 'system', icon: '👤', name: isJp ? 'キャラクター情報 / Character' : 'Character Sheet', key: 'C', keyDisplay: 'Shift+C', desc: isJp ? 'ステータスや耐性などの詳細情報を表示します。' : 'Detailed view of stats, resists, speed, stealth, infravision, and history.' },
            { id: 'terminal', cat: 'system', icon: '🖥️', name: isJp ? '端末表示切替 / Classic CRT' : 'Toggle CRT Terminal', key: 'Tab', keyDisplay: 'Tab', desc: isJp ? '3D視点と伝統の80x24クラシック端末を切り替えます。' : 'Switch instantly between immersive 3D first-person and classic 80x24 CRT.' }
        ];

        // Realm-Specific Actions
        let realmCmds = [];
        if (r === 'silq') {
            realmCmds = [
                { id: 'skills', cat: 'tactical', icon: '🌳', name: 'Learn Ability & Skill Tree', key: 'Tab', keyDisplay: 'Tab', badge: 'Sil-Q', desc: 'Open the Skill and Ability Tree to allocate experience and master powers.' },
                { id: 'cast', cat: 'magic', icon: '🎵', name: 'Sing Song of Power', key: 's', keyDisplay: 's', badge: 'Sil-Q', desc: 'Begin singing Songs of Power (Elbereth, Slaying, Lorien, Freedom, Staying, Sharpness).' },
                { id: 'wait', cat: 'tactical', icon: '⏳', name: 'Wait / Rest 1 Turn', key: '.', keyDisplay: '.', badge: 'Sil-Q', desc: 'Pass 1 turn in place conserving stealth and observing foes.' },
                { id: 'stance', cat: 'tactical', icon: '🥷', name: 'Stance & Stealth Mode', key: 'S', keyDisplay: 'Shift+S', badge: 'Sil-Q', desc: 'Toggle between standard stance and careful stealth mode.' },
                { id: 'cycle_target', cat: 'tactical', icon: '🎯', name: 'Cycle Target Foes', key: '*', keyDisplay: '*', badge: 'Sil-Q', desc: 'Cycle target cursor across visible Morgoth servants.' },
                { id: 'prev_target', cat: 'tactical', icon: '📍', name: 'Target Previous Monster', key: '^', keyDisplay: '^', badge: 'Sil-Q', desc: 'Lock target onto previously aimed monster.' },
                { id: 'smith', cat: 'tactical', icon: '🔨', name: 'Smithing Forge & Artifacts', key: 'a', keyDisplay: 'a', badge: 'Sil-Q', desc: 'Forge items at subterranean smithies or play harps.' }
            ];
        } else if (r === 'frogcomposband') {
            realmCmds = [
                { id: 'power', cat: 'magic', icon: '🔮', name: 'Use Racial/Class Power or Mutation', key: 'U', keyDisplay: 'Shift+U', badge: 'FrogComposBand', desc: 'Invoke your innate racial ability, class talent, or chaos mutation.' },
                { id: 'overland', cat: 'exploration', icon: '🗺️', name: 'Overland Wilderness Map', key: 'O', keyDisplay: 'Shift+O', badge: 'FrogComposBand', desc: 'View the overland world map to travel across the continent.' },
                { id: 'quests', cat: 'system', icon: '📜', name: 'Active Quests & Monster Bounties', key: 'Q', keyDisplay: 'Shift+Q', badge: 'FrogComposBand', desc: 'Check royal quests, finished tasks, and bounty targets.' },
                { id: 'pet', cat: 'tactical', icon: '🐕', name: 'Pet & Minion Command', key: 'p', keyDisplay: 'p', badge: 'FrogComposBand', desc: 'Issue orders to loyal pets, summons, and mounts.' },
                { id: 'cast', cat: 'magic', icon: '✨', name: 'Cast Spell or Prayer', key: 'm', keyDisplay: 'm', badge: 'FrogComposBand', desc: 'Invoke known spells from your chosen magic realms.' },
                { id: 'browse', cat: 'magic', icon: '📖', name: 'Browse Spellbook', key: 'b', keyDisplay: 'b', badge: 'FrogComposBand', desc: 'Inspect spells and requirements in carried books.' },
                { id: 'gain', cat: 'magic', icon: '✨', name: 'Gain New Spells', key: 'G', keyDisplay: 'Shift+G', badge: 'FrogComposBand', desc: 'Study and memorize newly unlocked realm spells.' },
                { id: 'activate', cat: 'magic', icon: '⚡', name: 'Activate Equipment / Artifact', key: 'A', keyDisplay: 'Shift+A', badge: 'FrogComposBand', desc: 'Trigger the power of an equipped magical artifact or device.' },
                { id: 'knowledge', cat: 'system', icon: '📚', name: 'Knowledge Menu', key: '~', keyDisplay: '~', badge: 'FrogComposBand', desc: 'Check monster recall, ego items, and artifacts.' }
            ];
        } else if (r === 'hengband') {
            realmCmds = [
                { id: 'power', cat: 'magic', icon: '🔮', name: isJp ? '特殊能力を使用' : 'Use Special Power / 特殊能力', key: 'U', keyDisplay: 'Shift+U', badge: 'Hengband', desc: isJp ? '種族・職業・変異の特殊能力を使用します。' : 'Activate racial power, class technique, or mutation.' },
                { id: 'overland', cat: 'exploration', icon: '🗺️', name: isJp ? '広域マップ表示' : 'Overland Map / 広域マップ', key: 'O', keyDisplay: 'Shift+O', badge: 'Hengband', desc: isJp ? '地上世界の広域マップを表示します。' : 'View the overland Amber wilderness map.' },
                { id: 'quests', cat: 'system', icon: '📜', name: isJp ? 'クエスト情報確認' : 'Quest Information / クエスト情報', key: 'Q', keyDisplay: 'Shift+Q', badge: 'Hengband', desc: isJp ? '現在のクエストの進行状況を確認します。' : 'Review ongoing castle and wilderness quests.' },
                { id: 'pet', cat: 'tactical', icon: '🐕', name: isJp ? 'ペットへの指示' : 'Pet Command / ペット指示', key: 'p', keyDisplay: 'p', badge: 'Hengband', desc: isJp ? 'ペットや仲間に命令を下します。' : 'Command pets and summoned allies in battle.' },
                { id: 'cast', cat: 'magic', icon: '✨', name: isJp ? '呪文詠唱' : 'Cast Spell / 呪文詠唱', key: 'm', keyDisplay: 'm', badge: 'Hengband', desc: isJp ? '習得した呪文を詠唱します。' : 'Cast a learned realm spell or Amber incantation.' },
                { id: 'browse', cat: 'magic', icon: '📖', name: isJp ? '呪文の閲覧' : 'Browse Spellbook / 呪文閲覧', key: 'b', keyDisplay: 'b', badge: 'Hengband', desc: isJp ? '所持している魔道書の呪文を閲覧します。' : 'Browse spell details in carried spellbooks.' },
                { id: 'gain', cat: 'magic', icon: '✨', name: isJp ? '新しい呪文の習得' : 'Gain Spell / 呪文習得', key: 'G', keyDisplay: 'Shift+G', badge: 'Hengband', desc: isJp ? '魔道書から新しい呪文を習得します。' : 'Study new spells from realm spellbooks.' },
                { id: 'activate', cat: 'magic', icon: '⚡', name: isJp ? 'アーティファクトの発動' : 'Activate Artifact / 発動', key: 'A', keyDisplay: 'Shift+A', badge: 'Hengband', desc: isJp ? '装備品やアーティファクトを発動します。' : 'Trigger the power of an equipped artifact.' },
                { id: 'staff', cat: 'magic', icon: '🦯', name: isJp ? '杖を振る' : 'Use Staff / 杖', key: 'u', keyDisplay: 'u', badge: 'Hengband', desc: isJp ? '杖を使用します。' : 'Invoke charges from a magical staff.' },
                { id: 'wand', cat: 'magic', icon: '🪄', name: isJp ? '魔法棒を使用' : 'Aim Wand / 魔法棒', key: 'z', keyDisplay: 'z', badge: 'Hengband', desc: isJp ? '魔法棒を目標に向けて振ります。' : 'Aim a magical wand towards a target.' },
                { id: 'rod', cat: 'magic', icon: '⚡', name: isJp ? 'ロッドを使用' : 'Zap Rod / ロッド', key: 'a', keyDisplay: 'a', badge: 'Hengband', desc: isJp ? 'ロッドの魔力を放ちます。' : 'Zap a rechargeable magical rod.' },
                { id: 'knowledge', cat: 'system', icon: '📚', name: isJp ? '知識メニュー' : 'Knowledge Menu / 知識', key: '~', keyDisplay: '~', badge: 'Hengband', desc: isJp ? 'モンスター情報、アーティファクトの知識。' : 'Check monster memory, artifacts, and dungeon lore.' }
            ];
        } else {
            // Vanilla Angband
            realmCmds = [
                { id: 'cast', cat: 'magic', icon: '✨', name: 'Cast Spell or Prayer', key: 'm', keyDisplay: 'm', badge: 'Vanilla', desc: 'Invoke known arcane spell or holy prayer.' },
                { id: 'browse', cat: 'magic', icon: '📖', name: 'Browse Spellbook', key: 'b', keyDisplay: 'b', badge: 'Vanilla', desc: 'Inspect spells in your carried magical books.' },
                { id: 'gain', cat: 'magic', icon: '✨', name: 'Gain New Spells', key: 'G', keyDisplay: 'Shift+G', badge: 'Vanilla', desc: 'Study newly available spells or prayers.' },
                { id: 'activate', cat: 'magic', icon: '⚡', name: 'Activate Equipment / Artifact', key: 'A', keyDisplay: 'Shift+A', badge: 'Vanilla', desc: 'Activate the magical property of worn armor, ring, or weapon.' },
                { id: 'staff', cat: 'magic', icon: '🦯', name: 'Use Staff', key: 'u', keyDisplay: 'u', badge: 'Vanilla', desc: 'Discharge charges from a magical staff.' },
                { id: 'wand', cat: 'magic', icon: '🪄', name: 'Aim Wand', key: 'z', keyDisplay: 'z', badge: 'Vanilla', desc: 'Aim a beam or ball wand at a target.' },
                { id: 'rod', cat: 'magic', icon: '⚡', name: 'Zap Rod', key: 'a', keyDisplay: 'a', badge: 'Vanilla', desc: 'Discharge a rechargeable rod.' },
                { id: 'knowledge', cat: 'system', icon: '📚', name: 'Check Knowledge', key: '~', keyDisplay: '~', badge: 'Vanilla', desc: 'Access monster recall, ego items, artifacts, and dungeon lore.' },
                { id: 'quiver', cat: 'tactical', icon: '🏹', name: 'Inspect Quiver', key: '|', keyDisplay: '|', badge: 'Vanilla', desc: 'View ammunition currently carried in your quiver.' }
            ];
        }

        let allCmds = [...realmCmds, ...base];
        if (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) {
            allCmds = allCmds.filter(cmd => {
                if (cmd.id) {
                    const k = RealmKeys.realmKey(cmd.id, r);
                    if (k === null) return false;
                    if (k) {
                        cmd.key = k;
                        cmd.keyDisplay = (k === 'tab') ? 'Tab' : k;
                    }
                }
                return true;
            });
        }
        return allCmds;
    }

    let activeCmdCategory = 'all';
    let cmdPaletteFilter = '';
    let selectedCmdIndex = 0;

    function renderCommandPalette() {
        const list = document.getElementById('cmd-palette-list');
        if (!list) return;
        const filter = cmdPaletteFilter.toLowerCase().trim();
        const currentCommands = getRealmCommandRegistry(activeRealm, langMode);
        const items = currentCommands.filter((cmd) => {
            const matchesCat = activeCmdCategory === 'all' || cmd.cat === activeCmdCategory;
            const matchesText = !filter ||
                cmd.name.toLowerCase().includes(filter) ||
                cmd.desc.toLowerCase().includes(filter) ||
                cmd.keyDisplay.toLowerCase().includes(filter) ||
                (cmd.badge && cmd.badge.toLowerCase().includes(filter));
            return matchesCat && matchesText;
        });

        if (selectedCmdIndex >= items.length) selectedCmdIndex = Math.max(0, items.length - 1);

        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:24px; color:#64748b;">No matching commands found. Type another query.</div>`;
            return;
        }

        items.forEach((cmd, idx) => {
            const row = document.createElement('div');
            row.className = `cmd-row ${idx === selectedCmdIndex ? 'selected' : ''}`;
            row.innerHTML = `
                <div class="cmd-row-left">
                    <span class="cmd-row-icon">${cmd.icon}</span>
                    <div class="cmd-row-text">
                        <span class="cmd-row-name">${cmd.name} ${cmd.badge ? `<span class="cmd-badge">${cmd.badge}</span>` : ''}</span>
                        <span class="cmd-row-desc">${cmd.desc}</span>
                    </div>
                </div>
                <div class="cmd-row-right">
                    <kbd class="cmd-kbd">${cmd.keyDisplay}</kbd>
                </div>
            `;
            row.addEventListener('click', () => {
                executePaletteCommand(cmd);
            });
            list.appendChild(row);
        });
    }

    function executePaletteCommand(cmd) {
        hideCommandPalette();
        if (input && typeof input.handleDirectKey === 'function') {
            input.handleDirectKey(cmd.key);
        } else if (network && typeof network.sendKey === 'function') {
            network.sendKey(cmd.key);
        }
    }

    function showCommandPalette(fromState = 'game') {
        cmdPalettePreviousState = fromState;
        appState = 'cmdPaletteModal';
        cmdPaletteFilter = '';
        selectedCmdIndex = 0;
        const inputEl = document.getElementById('cmd-search-input');
        if (inputEl) {
            inputEl.value = '';
            setTimeout(() => inputEl.focus(), 50);
        }
        renderCommandPalette();
        if (cmdPaletteModal) cmdPaletteModal.classList.remove('hidden');
        if (audio) audio.playMenuOpen();
    }

    function hideCommandPalette() {
        if (cmdPaletteModal) cmdPaletteModal.classList.add('hidden');
        if (audio) audio.playMenuNav();
        if (cmdPalettePreviousState === 'splash') {
            showSplash();
        } else if (cmdPalettePreviousState === 'mainMenu') {
            showMainMenu();
        } else {
            appState = 'game';
        }
    }

    function setupCommandPaletteEvents() {
        const btnClose = document.getElementById('btn-cmd-palette-close');
        if (btnClose) bindFastTap(btnClose, () => hideCommandPalette());

        if (cmdPaletteModal) {
            cmdPaletteModal.addEventListener('click', (e) => {
                if (e.target === cmdPaletteModal) hideCommandPalette();
            });
        }

        const inputEl = document.getElementById('cmd-search-input');
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                cmdPaletteFilter = e.target.value;
                selectedCmdIndex = 0;
                renderCommandPalette();
            });
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    hideCommandPalette();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const filter = cmdPaletteFilter.toLowerCase().trim();
                    const items = COMMAND_REGISTRY.filter((cmd) => {
                        const matchesCat = activeCmdCategory === 'all' || cmd.cat === activeCmdCategory;
                        const matchesText = !filter ||
                            cmd.name.toLowerCase().includes(filter) ||
                            cmd.desc.toLowerCase().includes(filter) ||
                            cmd.keyDisplay.toLowerCase().includes(filter);
                        return matchesCat && matchesText;
                    });
                    if (items.length > 0) {
                        const target = items[selectedCmdIndex] || items[0];
                        executePaletteCommand(target);
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedCmdIndex++;
                    renderCommandPalette();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedCmdIndex > 0) selectedCmdIndex--;
                    renderCommandPalette();
                }
            });
        }

        const catPills = document.querySelectorAll('.cmd-cat-pill');
        catPills.forEach((pill) => {
            bindFastTap(pill, () => {
                catPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                activeCmdCategory = pill.dataset.cat || 'all';
                selectedCmdIndex = 0;
                renderCommandPalette();
            });
        });
    }

    // Gameplay Demo & Commercial Showcase Modal Handlers
    let demoPreviousState = 'mainMenu';

    function showDemoModal(fromState = null) {
        // Standalone Client Invariant: The video showcase player is hosted ONLY on the website.
        // All non-web clients (Desktop Windows WebView2, Godot, Android APK) must point to the official website link
        // and never attempt to play video natively or open the local modal.
        if (isStandaloneApp() || (typeof document !== 'undefined' && document.body?.classList?.contains('is-standalone'))) {
            if (audio) audio.playMenuNav();
            openExternalUrl('https://angband3d.com/demo');
            return;
        }

        demoPreviousState = fromState || appState || 'mainMenu';
        appState = 'demoModal';
        if (demoModal) demoModal.classList.remove('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
        if (splashOverlay) splashOverlay.classList.add('hidden');
        if (guideModal) guideModal.classList.add('hidden');
        if (loadModal) loadModal.classList.add('hidden');
        if (pauseModal) pauseModal.classList.add('hidden');
        if (pwaModal) pwaModal.classList.add('hidden');
        if (queueModal) queueModal.classList.add('hidden');
        stopQueueTipRotation();
        if (terminalContainer) terminalContainer.classList.add('hidden');
        const banner = document.getElementById('top-message-banner');
        if (banner) banner.style.display = 'none';
        if (input) input.setTerminalMode(false);
        if (audio) audio.playMenuOpen();

        if (window.demoPlayer && typeof window.demoPlayer.open === 'function') {
            window.demoPlayer.open(demoPreviousState);
        }
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

    function extractActiveMenuChoices(rows) {
        if (!rows || rows.length === 0) return [];
        const allMatches = [];
        let maxCol = 0;

        for (const row of rows) {
            const text = row.g || '';
            const re = /(?:^|\s{2,})([a-zA-Z0-9@*?])[\)\.\:]\s*([A-Za-z0-9\-\']+(?: [A-Za-z0-9\-\']+)?)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const key = m[1];
                const keyCharIdx = m.index + m[0].indexOf(key);
                const label = m[2].trim();
                if (['str', 'int', 'wis', 'dex', 'con', 'hit', 'xp', 'hp', 'sp'].includes(label.toLowerCase())) {
                    continue;
                }
                allMatches.push({ col: keyCharIdx, key, label });
                if (keyCharIdx > maxCol) {
                    maxCol = keyCharIdx;
                }
            }
        }

        const activeChoices = [];
        for (const item of allMatches) {
            if (Math.abs(item.col - maxCol) <= 4) {
                if (!activeChoices.some(c => c.key === item.key)) {
                    activeChoices.push({ key: item.key, label: item.label });
                }
            }
        }
        return activeChoices;
    }

    let lastCtxActionsHtml = '';
    function setCtxActions(html) {
        const termCtxActions = document.getElementById('term-contextual-actions');
        if (!termCtxActions) return;
        if (lastCtxActionsHtml === html && termCtxActions.innerHTML === html) return;
        lastCtxActionsHtml = html;
        termCtxActions.innerHTML = html;
    }

    function updateTerminalToolbar(frame) {
        const terminalTitle = document.getElementById('term-title') || document.getElementById('terminal-title');
        const termFacingBadge = document.getElementById('term-facing-badge');
        const termAdvanceBtn = document.getElementById('btn-term-advance');
        const termEscapeBtn = document.getElementById('btn-term-escape');
        const termExitMenuBtn = document.getElementById('btn-term-exit-menu');
        const termTouchControls = document.getElementById('terminal-touch-controls');
        const termCtxActions = document.getElementById('term-contextual-actions');
        const termLetterRibbon = document.getElementById('term-letter-ribbon');
        const birthNameBar = document.getElementById('birth-name-bar');
        const birthNameInput = document.getElementById('birth-name-input');
        const termDpad = termTouchControls ? termTouchControls.querySelector('.term-dpad, .term-dpad-grid') : null;

        if (!terminalTitle || !termEscapeBtn) return;

        const effFrame = frame || lastFrame || window.__lastFrame || (window.__app && window.__app.getLastFrame && window.__app.getLastFrame());
        const inPlay = Boolean(effFrame && effFrame.phase === 'play' && effFrame.map);
        const rawScreenText = (effFrame && effFrame.term && effFrame.term.rows)
            ? effFrame.term.rows.map(r => r.g || '').join('\n')
            : '';
        const decodedScreenText = decodeHengbandText(rawScreenText);
        const screenText = (rawScreenText + '\n' + decodedScreenText).toLowerCase();

        const isHeng = (activeRealm === 'hengband') || (window.activeRealm === 'hengband') || (window.__activeRealm === 'hengband') || (effFrame && effFrame.realm === 'hengband');
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

        // Always display external navigation dock so classic interactions can be performed via navigation keys outside the view on all devices
        if (termTouchControls) {
            termTouchControls.style.display = 'flex';
        }

        // 1. Camera Facing & Direction Highlight Sync
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

        // Inform classic terminal canvas of 3D camera facing
        terminal.setCameraFacing(cameraYaw);

        // 2. Identify Current Mode & Screen (classification lives in screen-context.js toolbarFlags)
        const { playerFeat, isStoreFeat, inOverlay, hasStoreText, isTargeting, isItemPrompt, isStore } =
            SC.toolbarFlags(effFrame, screenText, isHeng);
        terminal.setTargetingMode(isTargeting);

        // Update Facing Badge & D-Pad Highlight
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

        // Helper to populate letter ribbon (supports single & multi-column menus, excludes item description stats)
        let lastPopulatedLetters = '';
        const populateLetterRibbon = (rows, explicitLetters = null) => {
            if (!termLetterRibbon) return;
            let options = [];
            if (explicitLetters && Array.isArray(explicitLetters)) {
                options = explicitLetters.map(lt => ({ key: lt, display: `[${lt}]` }));
            } else if (rows) {
                // Unified option tag extraction across all variants (Angband 4.2.6, Hengband 3.0.1, Sil-Q, FrogComposBand)
                const regexes = [
                    /(?:^|\s+)\(([a-zA-Z0-9*@?])\)\s+([^\n\r]{1,70})/g,
                    /(?:^|\s+)\[([a-zA-Z0-9*@?])\]\s+([^\n\r]{1,70})/g,
                    /(?:^|\s+)([a-zA-Z0-9*@?])[\)\.\:\-]\s+([^\n\r]{1,70})/g,
                    /(?:^|\s+)(\*)\s*(ランダム|random|Random)/gi
                ];
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
                            let label = (m[2] || '').trim();
                            // If equipment slot prefix present (e.g. "Wielding : ", "Left ring : ", "武器 : "), strip it to get the item
                            label = label.replace(/^[^:]{1,20}:\s*/, '');
                            // Stop at multi-space gap before weight/price/turn columns
                            label = label.replace(/\s{2,}.*$/, '');
                            // Strip trailing weight specs (e.g. 2.5 lb, 4.0 lb)
                            label = label.replace(/\s+\d+(\.\d+)?\s*(lb|kg|g)$/i, '');
                            // Clean up unclosed parentheses or brackets at end
                            label = label.replace(/[(\[\{]+$/, '').trim();

                            // Skip empty slots like "(nothing)" or "なし"
                            if (!label || label === '(nothing)' || label.includes('(nothing)') || label === 'なし') {
                                continue;
                            }

                            if (key && !seenKeys.has(key)) {
                                seenKeys.add(key);
                                let display = `[${key}]`;
                                if (label) {
                                    const enTrans = isHengCur ? (JP_TERM_TRANSLATIONS[label] || (window.HENG_DICT && window.HENG_DICT.DATA && window.HENG_DICT.DATA.items && window.HENG_DICT.DATA.items[label])) : null;
                                    if (enTrans) {
                                        if (effLang === 'en') {
                                            display = `[${key}] ${enTrans}`;
                                        } else if (effLang === 'jp') {
                                            display = `[${key}] ${label}`;
                                        } else {
                                            display = `[${key}] ${label} (${enTrans})`;
                                        }
                                    } else {
                                        display = `[${key}] ${label}`;
                                    }
                                } else if (key === '*') {
                                    if (!isHengCur || effLang === 'en') {
                                        display = `[*] Random`;
                                    } else if (effLang === 'jp') {
                                        display = `[*] ランダム`;
                                    } else {
                                        display = `[*] ランダム (Random)`;
                                    }
                                }
                                options.push({ key, display });
                            }
                        }
                    }
                }
                // If yes/no is present in prompt, ensure y and n are available
                if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || (isHengCur && screenText.includes('よろしいですか'))) {
                    if (!seenKeys.has('y')) options.unshift({ key: 'y', display: '[y] ✓ Yes' });
                    if (!seenKeys.has('n')) options.push({ key: 'n', display: '[n] ✕ No' });
                }
            }

            const letterKey = options.map(o => o.key + ':' + o.display).join(',');
            if (letterKey === lastPopulatedLetters) {
                return; // DOM stability: do not recreate buttons if options are unchanged
            }
            lastPopulatedLetters = letterKey;

            if (options.length > 0) {
                termLetterRibbon.style.display = 'flex';
                termLetterRibbon.innerHTML = options.map(opt =>
                    `<button type="button" class="term-letter-btn" data-key="${escapeHtml(opt.key)}">${escapeHtml(opt.display)}</button>`
                ).join('');
            } else {
                termLetterRibbon.style.display = 'none';
                termLetterRibbon.innerHTML = '';
            }
        };

        // 3. Screen-Specific Layout & Controls Configuration
        if (!inPlay) {
            // --- CHARACTER CREATION / BIRTH SCREENS ---
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

            // Birth/setup classification lives in screen-context.js birthFlags (verbatim move, WS2).
            const {
                isTitleScreen, isHengInitialOpt, isHengSex, isHengRace, isHengClass, isHengPersonality,
                isHengRealm, isHengStatRoller, isHengStatDecide, isHengName, isHengHistory, isHengEmbark,
                isNamePrompt, isHistoryPrompt, isStatRoller, isBackgroundEdit, isReadyPrompt, isChoiceMenu,
                isReviewScreen
            } = SC.birthFlags(screenText, isHeng);

            if (isChoiceMenu || isNamePrompt) {
                birthReviewActive = false;
            }


            if (isHengInitialOpt) {
                terminalTitle.textContent = hengTitle(
                    '🎴 HENGBAND — Options Setup [Esc to Accept]',
                    '🎴 HENGBAND — 初期オプション / Options [Esc to Accept]',
                    '🎴 HENGBAND — 初期オプション設定 [Escで終了]'
                );
                if (termDpad) termDpad.style.display = 'none';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Accept Options', '⎋ 終了 (Accept Options)', '⎋ 終了')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else if (isHengStatDecide) {
                terminalTitle.textContent = hengTitle(
                    '🎴 HENGBAND — Review Stats [Enter]',
                    '🎴 HENGBAND — 能力値決定 / Review Stats [Enter]',
                    '🎴 HENGBAND — 能力値決定 [Enter]'
                );
                if (termDpad) termDpad.style.display = 'none';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('✓ Accept Stats', '✓ 決定 (Accept Stats)', '✓ 決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="r"><span>[r]</span> ${hengLabel('🔄 Next Roll', '🔄 次の数値 (Next Roll)', '🔄 次の数値')}</button>
                        <button type="button" class="term-ctx-btn" data-key="p"><span>[p]</span> ${hengLabel('⏪ Previous Roll', '⏪ 前の数値 (Previous Roll)', '⏪ 前の数値')}</button>
                        <button type="button" class="term-ctx-btn" data-key="S"><span>[S]</span> ${hengLabel('🔄 Start Over', '🔄 初めから (Start Over)', '🔄 初めから')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Back', '⎋ 戻る (Back)', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else if (isTitleScreen) {
                terminalTitle.textContent = '⚔ WELCOME TO ANGBAND';
                if (termDpad) termDpad.style.display = 'none';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> Continue (Enter)</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> Main Menu</button>
                    `);
                }
            } else if (isNamePrompt) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('🎴 HENGBAND — Enter Character Name', '🎴 HENGBAND — 名前入力 / Enter Name', '🎴 HENGBAND — キャラクターの名前を入力')
                    : '⚔ NAME YOUR ADVENTURER';
                if (termDpad) termDpad.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (birthNameBar) {
                    birthNameBar.style.display = 'flex';
                    if (birthNameInput && document.activeElement !== birthNameInput && !birthNameInput.value) {
                        const nameMatch = (frame && frame.term && frame.term.rows && frame.term.rows[0])
                            ? (frame.term.rows[0].g || '').match(/:\s*([A-Za-z0-9_\-]+)/)
                            : null;
                        if (nameMatch) {
                            birthNameInput.value = nameMatch[1].trim();
                        }
                    }
                }
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else if (isHistoryPrompt) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('🎴 HENGBAND — Character Background', '🎴 HENGBAND — 生い立ち / Background', '🎴 HENGBAND — キャラクターの生い立ち')
                    : '⚔ CHARACTER HISTORY';
                if (termDpad) termDpad.style.display = 'none';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('✓ Accept', '✓ Accept / 決定', '✓ 決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else if (isStatRoller) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('🎴 HENGBAND — Stat Roller', '🎴 HENGBAND — 能力値抽選 / Stat Roller', '🎴 HENGBAND — 能力値抽選')
                    : '⚔ ATTRIBUTE ALLOCATION';
                if (termDpad) termDpad.style.display = 'grid'; // Left/Right modifies stats
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('✓ Accept', '✓ Accept / 決定', '✓ 決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="r"><span>[r]</span> ${hengLabel('🔄 Reset Stats', '🔄 Reset / 再抽選', '🔄 再抽選')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else if (isBackgroundEdit) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('📜 CHARACTER BACKGROUND — Enter to Continue', '📜 生い立ち / BACKGROUND — Enter', '📜 キャラクターの生い立ち — Enter')
                    : '📜 CHARACTER BACKGROUND — Enter to Continue';
                if (termDpad) termDpad.style.display = 'grid';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('Continue (Enter)', 'Continue / 決定 (Enter)', '決定 (Enter)')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else if (isReadyPrompt) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('🎴 HENGBAND — Begin Game / Embark', '🎴 HENGBAND — ゲーム開始 / Embark', '🎴 HENGBAND — ゲーム開始')
                    : '⚔ READY TO EMBARK — Enter to Begin';
                if (termDpad) termDpad.style.display = 'none';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('⚔ Enter Realm', '⚔ ゲーム開始 (Enter Realm)', '⚔ ゲーム開始')}</button>
                        <button type="button" class="term-ctx-btn" data-key="S"><span>[S]</span> ${hengLabel('🔄 Start Over', '🔄 初めから (Start Over)', '🔄 初めから')}</button>
                        <button type="button" class="term-ctx-btn" data-key="Q"><span>[Q]</span> ${hengLabel('⎋ Quit', '⎋ 終了 (Quit)', '⎋ 終了')}</button>
                    `);
                }
            } else if (isReviewScreen) {
                const hasPrevRoll = screenText.includes("previous roll") || screenText.includes("前の数値") || screenText.includes("for previous");
                terminalTitle.textContent = isHeng
                    ? hengTitle('🎴 HENGBAND — Review Hero', '🎴 HENGBAND — キャラクター確認 / Review Hero', '🎴 HENGBAND — キャラクター確認')
                    : '⚔ REVIEW YOUR HERO';
                if (termRerollBtn) termRerollBtn.style.display = 'inline-flex';
                if (termAdvanceBtn) termAdvanceBtn.textContent = hengLabel('⚔ Accept & Play (Enter)', '⚔ Accept & Play (決定)', '⚔ 決定して開始 (Enter)');
                if (termDpad) termDpad.style.display = 'none';
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('⚔ Accept & Play', '⚔ Accept & Play (決定)', '⚔ 決定して開始')}</button>
                        <button type="button" class="term-ctx-btn" data-key="r"><span>[r]</span> ${hengLabel('🎲 Reroll Hero', '🎲 Reroll (再生成)', '🎲 英雄再生成')}</button>
                        ${hasPrevRoll ? `<button type="button" class="term-ctx-btn" data-key="p"><span>[p]</span> ${hengLabel('⏪ Previous Roll', '⏪ Previous Roll (前の数値)', '⏪ 前の数値')}</button>` : ''}
                        <button type="button" class="term-ctx-btn" data-key="s"><span>[s]</span> ${hengLabel('🛠 Custom Create', '🛠 Custom (作成)', '🛠 英雄作成')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Step Back', '⎋ Step Back / 戻る', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
            } else {
                // Choice menu (Sex, Race, Class, Personality, Realm, Traits)
                if (isHengSex) {
                    terminalTitle.textContent = hengTitle(
                        '🎴 HENGBAND — Choose Sex [a-b, *]',
                        '🎴 HENGBAND — 性別 / Choose Sex [a-b, *]',
                        '🎴 HENGBAND — 性別を選んで下さい [a-b, *]'
                    );
                } else if (isHengRace) {
                    terminalTitle.textContent = hengTitle(
                        '🎴 HENGBAND — Choose Race [a-L, *]',
                        '🎴 HENGBAND — 種族 / Choose Race [a-L, *]',
                        '🎴 HENGBAND — 種族を選んで下さい [a-L, *]'
                    );
                } else if (isHengClass) {
                    terminalTitle.textContent = hengTitle(
                        '🎴 HENGBAND — Choose Class [a-C, *]',
                        '🎴 HENGBAND — 職業 / Choose Class [a-C, *]',
                        '🎴 HENGBAND — 職業を選んで下さい [a-C, *]'
                    );
                } else if (isHengPersonality) {
                    terminalTitle.textContent = hengTitle(
                        '🎴 HENGBAND — Choose Personality [a-m, *]',
                        '🎴 HENGBAND — 性格 / Choose Personality [a-m, *]',
                        '🎴 HENGBAND — 性格を選んで下さい [a-m, *]'
                    );
                } else if (isHengRealm) {
                    terminalTitle.textContent = hengTitle(
                        '🎴 HENGBAND — Choose Realm [a-j]',
                        '🎴 HENGBAND — 魔法領域 / Choose Realm [a-j]',
                        '🎴 HENGBAND — 魔法領域を選んで下さい [a-j]'
                    );
                } else if (screenText.includes('race affects stats')) {
                    terminalTitle.textContent = '⚔ CHOOSE CHARACTER RACE';
                } else if (screenText.includes('class affects stats')) {
                    terminalTitle.textContent = '⚔ CHOOSE CHARACTER CLASS';
                } else {
                    terminalTitle.textContent = '⚔ CHARACTER CREATION';
                }
                if (termDpad) termDpad.style.display = 'grid'; // D-pad Up/Down navigates highlight, Enter selects
                if (birthNameBar) birthNameBar.style.display = 'none';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('✓ Select', '✓ Select / 決定', '✓ 決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="*"><span>[*]</span> ${hengLabel('🎲 Random', '🎲 Random / ランダム', '🎲 ランダム')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Back', '⎋ Back / 戻る', '⎋ 戻る')}</button>
                        <button type="button" class="term-ctx-btn" data-key="mainmenu"><span>🏠</span> ${hengLabel('Main Menu', 'Main Menu (主献立)', 'メインメニュー')}</button>
                    `);
                }
                populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
            }
            return;
        }

        // --- ACTIVE GAMEPLAY (Town or Dungeon) ---
        if (termExitMenuBtn) termExitMenuBtn.style.display = 'none';
        if (termRerollBtn) termRerollBtn.style.display = 'none';
        if (birthNameBar) birthNameBar.style.display = 'none';

        // Check for Action Chooser (MenuRouter pending selection)
        const pendingState = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function')
            ? window.MenuRouter.getPending()
            : null;

        if (pendingState && pendingState.step === 'chooser' && pendingState.item) {
            terminalTitle.textContent = isHeng
                ? hengTitle(`🎒 ${pendingState.item.key}) ${pendingState.item.label}`, `🎒 ${pendingState.item.key}) ${pendingState.item.label}`, `🎒 ${pendingState.item.key}) ${pendingState.item.label}`)
                : `🎒 ${pendingState.item.key}) ${pendingState.item.label}`;
            if (termDpad) termDpad.style.display = 'none';
            const chooserRealm = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (effFrame && effFrame.realm) || 'angband';
            if (window.MenuRouter && typeof window.MenuRouter.renderChooserHtml === 'function') {
                setCtxActions(window.MenuRouter.renderChooserHtml(pendingState, chooserRealm));
            }
            return;
        }

        // Check for universal Yes/No prompts or Quantity prompts in active play or stores (screen-context.js promptFlags)
        const { isYesNoPrompt, isQuantityPrompt } = SC.promptFlags(screenText);

        const isPressAnyKey = screenText.includes('press any key') ||

                              screenText.includes('[press any key to continue]') ||

                              screenText.includes('何かキーを押して');

        const isItemActions = screenText.includes('command for ') ||

                              (screenText.includes('(enter to select') && screenText.includes('examine')) ||

                              (isHeng && screenText.includes('に対するコマンド'));

        

        if (isPressAnyKey) {

            terminalTitle.textContent = isHeng

                ? hengTitle('📜 MESSAGE / PROMPT', '📜 MESSAGE / メッセージ', '📜 メッセージ')

                : '📜 MESSAGE / PROMPT';

            if (termDpad) termDpad.style.display = 'none';

            setCtxActions(`

                <button type="button" class="term-ctx-btn btn-gold" data-key="space"><span>[␣]</span> ${hengLabel('Continue', 'Continue / 続ける', '続ける')}</button>

                <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Close', '⎋ Close / 閉じる', '⎋ 閉じる')}</button>

            `);

            if (termLetterRibbon) termLetterRibbon.style.display = 'none';

        } else if (isYesNoPrompt) {
            terminalTitle.textContent = isHeng
                ? hengTitle('🎴 CONFIRM ACTION [y/n]', '🎴 CONFIRM ACTION / 確認 [y/n]', '🎴 確認 [y/n]')
                : '⚔ CONFIRM ACTION [y/n]';
            if (termDpad) termDpad.style.display = 'none';
            if (termCtxActions) {
                setCtxActions(`
                    <button type="button" class="term-ctx-btn btn-gold" data-key="y"><span>[y]</span> ${hengLabel('✓ Yes', '✓ Yes / はい', '✓ はい')}</button>
                    <button type="button" class="term-ctx-btn btn-gold-outline" data-key="n"><span>[n]</span> ${hengLabel('✕ No', '✕ No / いいえ', '✕ いいえ')}</button>
                    <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Cancel', '⎋ Cancel / 取消', '⎋ 取消')}</button>
                `);
            }
            populateLetterRibbon(null, ['y', 'n']);
        } else if (isQuantityPrompt) {
            terminalTitle.textContent = '📦 ENTER QUANTITY';
            if (termDpad) termDpad.style.display = 'grid';
            if (termCtxActions) {
                setCtxActions(`
                    <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> All (Default)</button>
                    <button type="button" class="term-ctx-btn" data-key="1"><span>[1]</span> Just 1</button>
                    <button type="button" class="term-ctx-btn" data-key="5"><span>[5]</span> 5</button>
                    <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ⎋ Cancel</button>
                `);
            }
            populateLetterRibbon(null, ['1', '2', '3', '5', '10', 'enter']);
        } else if (isStore) {
            // Player is inside a classic store
            if (termAdvanceBtn) termAdvanceBtn.style.display = 'none';
            let storeName = 'STORE';
            if (frame.term && frame.term.rows) {
                for (let r = 0; r < Math.min(5, frame.term.rows.length); r++) {
                    const line = (frame.term.rows[r].g || '').trim();
                    const sm = line.match(/(General Store|Armoury|Armory|Weaponsmith|Weapon Smith|Temple|Alchemy Shop|Alchemist|Magic Shop|Magic User's|Black Market|Your Home|雑貨屋|万屋|防具屋|武器屋|寺院|錬金術の店|魔術師の店|ブラック・マーケット|我が家|博物館)/i);
                    if (sm) {
                        const matched = sm[1].trim();
                        const jpToEn = {
                            '雑貨屋': 'General Store',
                            '万屋': 'General Store',
                            '防具屋': 'Armoury',
                            '武器屋': 'Weaponsmith',
                            '寺院': 'Temple',
                            '錬金術の店': 'Alchemy Shop',
                            '魔術師の店': 'Magic Shop',
                            'ブラック・マーケット': 'Black Market',
                            '我が家': 'Your Home',
                            '博物館': 'Museum'
                        };
                        storeName = jpToEn[matched] || matched;
                        break;
                    }
                }
            }
            if (storeName === 'STORE' && isStoreFeat) {
                const storeNames = {
                    7: 'GENERAL STORE', 8: 'ARMOURY', 9: 'WEAPONSMITH', 10: 'TEMPLE',
                    11: 'ALCHEMY SHOP', 12: 'MAGIC SHOP', 13: 'BLACK MARKET', 14: 'YOUR HOME'
                };
                if (storeNames[playerFeat]) storeName = storeNames[playerFeat];
            }

            // Store sub-state classification (screen-context.js storeFlags)
            const { hasMore, isStoreContextMenu, isStoreBuy, isStoreSell, isStoreExamine } = SC.storeFlags(frame, screenText, isHeng);

            if (termDpad) termDpad.style.display = 'grid'; // D-pad active for scrolling and navigating store inventory

            if (isStoreContextMenu) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('⚔ CHOOSE ACTION FOR ITEM', '⚔ CHOOSE ACTION / 選択', '⚔ アイテムの行動を選択')
                    : '⚔ CHOOSE ACTION FOR ITEM';
                const examineKey = isHeng ? 'x' : 'l';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('Select', 'Select / 決定', '決定')}</button>
                        <button type="button" class="term-ctx-btn btn-gold" data-key="p"><span>[p]</span> ${hengLabel('💰 Buy All', '💰 Buy All / 全て購入', '💰 全て購入')}</button>
                        <button type="button" class="term-ctx-btn" data-key="o"><span>[o]</span> ${hengLabel('🛒 Buy One', '🛒 Buy One / 1つ購入', '🛒 1つ購入')}</button>
                        <button type="button" class="term-ctx-btn" data-key="${examineKey}"><span>[${examineKey}]</span> ${hengLabel('🔍 Examine', '🔍 Examine / 調べる', '🔍 調べる')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Back', '⎋ Back / 戻る', '⎋ 戻る')}</button>
                    `);
                }
                if (termLetterRibbon) termLetterRibbon.style.display = 'none';
            } else if (isStoreBuy) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('💰 BUY WHICH ITEM? (Tap letter or D-pad + Enter)', '💰 BUY WHICH ITEM? / 購入 (Tap letter or Enter)', '💰 何を買いますか？ (文字か方向キー+Enter)')
                    : '💰 BUY WHICH ITEM? (Tap letter or D-pad + Enter)';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('Select', 'Select / 決定', '決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> ${hengLabel('Next Page', 'Next Page / 次頁', '次ページ')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Cancel Buy', '⎋ Cancel / 取消', '⎋ 取消')}</button>
                    `);
                }
                populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
            } else if (isStoreSell) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('🏷 SELL WHICH ITEM? (Tap letter or D-pad + Enter)', '🏷 SELL WHICH ITEM? / 売却 (Tap letter or Enter)', '🏷 どれを売りますか？ (文字か方向キー+Enter)')
                    : '🏷 SELL WHICH ITEM? (Tap letter or D-pad + Enter)';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('Select', 'Select / 決定', '決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> ${hengLabel('Next Page', 'Next Page / 次頁', '次ページ')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Cancel Sell', '⎋ Cancel / 取消', '⎋ 取消')}</button>
                    `);
                }
                populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
            } else if (isStoreExamine) {
                terminalTitle.textContent = isHeng
                    ? hengTitle('🔍 EXAMINE WHICH ITEM? (Tap letter or D-pad + Enter)', '🔍 EXAMINE WHICH ITEM? / 調査 (Tap letter or Enter)', '🔍 どれを調べますか？ (文字か方向キー+Enter)')
                    : '🔍 EXAMINE WHICH ITEM? (Tap letter or D-pad + Enter)';
                if (termCtxActions) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('Select', 'Select / 決定', '決定')}</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> ${hengLabel('Next Page', 'Next Page / 次頁', '次ページ')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Cancel Examine', '⎋ Cancel / 取消', '⎋ 取消')}</button>
                    `);
                }
                populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
            } else {
                // Top-Level Store Browsing View
                const jpStoreNames = {
                    'GENERAL STORE': '雑貨屋', 'ARMOURY': '防具屋', 'ARMORY': '防具屋',
                    'WEAPONSMITH': '武器屋', 'TEMPLE': '寺院', 'ALCHEMY SHOP': '錬金術の店',
                    'MAGIC SHOP': '魔術師の店', 'BLACK MARKET': 'ブラック・マーケット',
                    'YOUR HOME': '我が家', 'MUSEUM': '博物館', 'STORE': '店舗'
                };
                const jpName = jpStoreNames[storeName.toUpperCase()] || storeName;
                terminalTitle.textContent = isHeng
                    ? hengTitle(`⚔ ${storeName.toUpperCase()} — BROWSE INVENTORY`, `⚔ ${storeName.toUpperCase()} (${jpName}) — INVENTORY`, `⚔ ${jpName} — 店頭の品物`)
                    : '⚔ ' + storeName.toUpperCase() + ' — BROWSE INVENTORY';
                const examineKey = isHeng ? 'x' : 'l';
                if (termCtxActions) {
                    setCtxActions(`
                        ${hasMore ? `<button type="button" class="term-ctx-btn btn-gold" data-key="space"><span>[␣]</span> ${hengLabel('⏩ Continue (-more-)', '⏩ Continue / 続ける', '⏩ 続ける (-more-)')}</button>` : ''}
                        <button type="button" class="term-ctx-btn btn-gold" data-key="p"><span>[p]</span> ${hengLabel('💰 Buy', '💰 Buy / 購入', '💰 購入')}</button>
                        <button type="button" class="term-ctx-btn" data-key="s"><span>[s]</span> ${hengLabel('🏷 Sell', '🏷 Sell / 売却', '🏷 売却')}</button>
                        <button type="button" class="term-ctx-btn" data-key="${examineKey}"><span>[${examineKey}]</span> ${hengLabel('🔍 Examine', '🔍 Examine / 調べる', '🔍 調べる')}</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> ${hengLabel('Next Page', 'Next Page / 次頁', '次ページ')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('🚪 Exit Store', '🚪 Exit Store / 店を出る', '🚪 店を出る')}</button>
                    `);
                }
                populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
            }
        } else if (isItemActions) {
            terminalTitle.textContent = isHeng
                ? hengTitle('⚔ CHOOSE ACTION FOR ITEM', '⚔ CHOOSE ACTION / 選択', '⚔ アイテムの行動を選択')
                : '⚔ CHOOSE ACTION FOR ITEM';
            if (termDpad) termDpad.style.display = 'grid';
            setCtxActions(`
                <button type="button" class="term-ctx-btn btn-gold" data-key="enter"><span>⏎</span> ${hengLabel('Select', 'Select / 決定', '決定')}</button>
                <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Back', '⎋ Back / 戻る', '戻る')}</button>
            `);
            populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
        } else if (isTargeting) {
            // Target / Direction Aiming Mode
            terminalTitle.textContent = isHeng
                ? hengTitle('🎯 TARGETING & AIMING', '🎯 TARGETING / 照準・位置指定', '🎯 照準・位置指定')
                : '🎯 TARGETING & AIMING';
            if (termDpad) termDpad.style.display = 'grid'; // 8-way directional aiming
            if (termLetterRibbon) termLetterRibbon.style.display = 'none';

            if (termCtxActions) {
                setCtxActions(`
                    <button type="button" class="term-ctx-btn btn-gold" data-key="5"><span>[5/⏎]</span> ${hengLabel('🎯 Fire / Select', '🎯 Fire / 発射・選択', '🎯 発射・選択')}</button>
                    <button type="button" class="term-ctx-btn" data-key="*"><span>[*]</span> ${hengLabel('🔍 Next Target', '🔍 Next Target / 次の対象', '🔍 次の対象')}</button>
                    <button type="button" class="term-ctx-btn" data-key="t"><span>[t]</span> ${hengLabel('📍 Nearest', '📍 Nearest / 最寄りの対象', '📍 最寄りの対象')}</button>
                    <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Cancel Aiming', '⎋ Cancel / 取消', '⎋ 取消')}</button>
                `);
            }
        } else if (isItemPrompt) {
            // Item selection / inventory / equipment prompts across all realms
            // Item sub-state classification (screen-context.js itemFlags)
            const {
                isSilq, isSilqInvenCmd, isSilqEquipCmd, isSilqWear, isSilqRemove, isSilqExamine,
                isSilqDrop, isSilqThrow, isSilqFire, isEquipView, isQuiverView
            } = SC.itemFlags(screenText, activeRealm);

            if (isSilqInvenCmd) {
                terminalTitle.textContent = '🎒 INVENTORY PACK (Choose action)';
            } else if (isSilqEquipCmd) {
                terminalTitle.textContent = '🛡 EQUIPPED GEAR (Choose action)';
            } else if (isSilqWear || screenText.includes('wear') || screenText.includes('wield') || screenText.includes('どれを装備')) {
                terminalTitle.textContent = isHeng ? hengTitle('⚔ WEAR / WIELD ITEM', '⚔ WEAR/WIELD / 装備', '⚔ アイテムを装備') : '⚔ WEAR / WIELD ITEM';
            } else if (isSilqRemove || screenText.includes('take off') || screenText.includes('どれを外しますか')) {
                terminalTitle.textContent = isHeng ? hengTitle('🔄 TAKE OFF GEAR', '🔄 TAKE OFF / 装備を外す', '🔄 装備を外す') : (isSilq ? '🔄 REMOVE GEAR' : '🔄 TAKE OFF GEAR');
            } else if (isSilqThrow || screenText.includes('throw which item?') || screenText.includes('どれを投げますか')) {
                terminalTitle.textContent = isHeng ? hengTitle('🎯 THROW ITEM', '🎯 THROW ITEM / 投擲', '🎯 アイテムを投げる') : '🎯 THROW ITEM';
            } else if (isSilqFire || screenText.includes('fire which item?') || screenText.includes('fire') || screenText.includes('shoot') || screenText.includes('どのアイテムを発射')) {
                terminalTitle.textContent = isHeng ? hengTitle('🏹 FIRE / SHOOT', '🏹 FIRE / 射撃', '🏹 射撃') : '🏹 FIRE / SHOOT';
            } else if (isSilqExamine || screenText.includes('examine which item') || screenText.includes('どれを調べますか')) {
                terminalTitle.textContent = isHeng ? hengTitle('🔍 EXAMINE ITEM', '🔍 EXAMINE / 調査', '🔍 アイテムを調べる') : '🔍 EXAMINE ITEM';
            } else if (isSilqDrop || screenText.includes('drop which') || screenText.includes('どれを落としますか')) {
                terminalTitle.textContent = isHeng ? hengTitle('📦 DROP ITEM', '📦 DROP / アイテムを落とす', '📦 アイテムを落とす') : '📦 DROP ITEM';
            } else if (screenText.includes('quaff which potion?') || screenText.includes('quaff') || screenText.includes('どの薬を飲みますか')) {
                terminalTitle.textContent = isHeng ? hengTitle('🧪 QUAFF POTION', '🧪 QUAFF POTION / 飲む', '🧪 薬を飲む') : '🧪 QUAFF POTION';
            } else if (screenText.includes('read which scroll?') || screenText.includes('read') || screenText.includes('どの巻物を読みますか')) {
                terminalTitle.textContent = isHeng ? hengTitle('📜 READ SCROLL', '📜 READ SCROLL / 読む', '📜 巻物を読む') : '📜 READ SCROLL';
            } else if (screenText.includes('which spell?') || screenText.includes('which prayer?') || screenText.includes('which book?') || screenText.includes('どの呪文') || screenText.includes('どの本')) {
                terminalTitle.textContent = isHeng ? hengTitle('✨ CAST SPELL / PRAYER', '✨ CAST SPELL / 呪文詠唱', '✨ 呪文詠唱') : '✨ CAST SPELL / PRAYER';
            } else if (isQuiverView) {
                terminalTitle.textContent = isHeng ? hengTitle('🏹 QUIVER MISSILES', '🏹 QUIVER / 矢筒', '🏹 矢筒') : '🏹 QUIVER MISSILES';
            } else if (isEquipView) {
                terminalTitle.textContent = isHeng ? hengTitle('🛡 EQUIPPED GEAR', '🛡 EQUIPPED GEAR / 装備品一覧', '🛡 装備品一覧') : '🛡 EQUIPPED GEAR';
            } else {
                terminalTitle.textContent = isHeng ? hengTitle('🎒 INVENTORY PACK', '🎒 INVENTORY / 所持品一覧', '🎒 所持品一覧') : '🎒 INVENTORY PACK';
            }

            if (termDpad) termDpad.style.display = 'grid'; // D-pad active for scrolling and selecting items

            if (termCtxActions) {
                if (isSilqInvenCmd) {
                    // Sil-Q Inventory Main Command Prompt: (Inventory) Command:
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ⎋ Close</button>
                        <button type="button" class="term-ctx-btn btn-gold" data-key="w"><span>[w]</span> ⚔ Wear/Wield</button>
                        <button type="button" class="term-ctx-btn" data-key="e"><span>[e]</span> 🛡 View Gear</button>
                        <button type="button" class="term-ctx-btn" data-key="x"><span>[x]</span> 🔍 Examine</button>
                        <button type="button" class="term-ctx-btn" data-key="d"><span>[d]</span> 📦 Drop</button>
                        <button type="button" class="term-ctx-btn" data-key="k"><span>[k]</span> 🗑 Destroy</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> Next Page</button>
                    `);
                } else if (isSilqEquipCmd) {
                    // Sil-Q Equipment Main Command Prompt: (Equipment) Command:
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ⎋ Close</button>
                        <button type="button" class="term-ctx-btn btn-gold" data-key="r"><span>[r]</span> 🔄 Take Off</button>
                        <button type="button" class="term-ctx-btn" data-key="i"><span>[i]</span> 🎒 View Pack</button>
                        <button type="button" class="term-ctx-btn" data-key="x"><span>[x]</span> 🔍 Examine</button>
                        <button type="button" class="term-ctx-btn" data-key="d"><span>[d]</span> 📦 Drop</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> Next Page</button>
                    `);
                } else if (isSilqWear) {
                    // Sil-Q Wield Prompt: Wear/Wield which item?
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ⎋ Cancel</button>
                        <button type="button" class="term-ctx-btn" data-key="/"><span>[/]</span> 🛡 Switch to Gear</button>
                        <button type="button" class="term-ctx-btn" data-key="-"><span>[-]</span> 📍 Floor</button>
                    `);
                } else if (isSilqRemove) {
                    // Sil-Q Remove Prompt: Remove which item?
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ⎋ Cancel</button>
                        <button type="button" class="term-ctx-btn" data-key="/"><span>[/]</span> 🎒 Switch to Pack</button>
                    `);
                } else if (isSilq) {
                    // Other Sil-Q item selection prompts (drop, throw, examine)
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ⎋ Cancel</button>
                        <button type="button" class="term-ctx-btn" data-key="/"><span>[/]</span> Switch Inven/Gear</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> Next Page</button>
                    `);
                } else if (isHeng) {
                    const packLabel = isEquipView
                        ? hengLabel('🎒 View Pack', '🎒 View Pack / 所持品', '🎒 所持品')
                        : hengLabel('🛡 View Gear', '🛡 View Gear / 装備品', '🛡 装備品');
                    const quiverLabel = isQuiverView
                        ? hengLabel('🎒 Pack', '🎒 Pack / 所持品', '🎒 所持品')
                        : hengLabel('🏹 Quiver', '🏹 Quiver / 矢筒', '🏹 矢筒');
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Close', '⎋ Close / 閉じる', '⎋ 閉じる')}</button>
                        <button type="button" class="term-ctx-btn" data-key="/"><span>[/]</span> ${packLabel}</button>
                        <button type="button" class="term-ctx-btn" data-key="|"><span>[|]</span> ${quiverLabel}</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> ${hengLabel('Next Page', 'Next Page / 次頁', '次ページ')}</button>
                    `);
                } else {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="escape"><span>[Esc]</span> ⎋ Close</button>
                        <button type="button" class="term-ctx-btn" data-key="/"><span>[/]</span> ${isEquipView ? '🎒 View Pack' : '🛡 View Gear'}</button>
                        <button type="button" class="term-ctx-btn" data-key="|"><span>[|]</span> ${isQuiverView ? '🎒 Pack' : '🏹 Quiver'}</button>
                        <button type="button" class="term-ctx-btn" data-key="space"><span>[␣]</span> Next Page</button>
                    `);
                }
            }
            populateLetterRibbon(frame && frame.term ? frame.term.rows : []);
        } else {
            // Classic Dungeon View (Walking around in 2D classic grid)
            const realmTitles = {
                'silq': '💍 SIL-Q CLASSIC TERMINAL',
                'frogcomposband': '🐸 FROGCOMPOSBAND CLASSIC TERMINAL',
                'hengband': '🎴 HENGBAND CLASSIC TERMINAL',
                'angband': '⚔ ANGBAND CLASSIC TERMINAL'
            };
            terminalTitle.textContent = isHeng
                ? hengTitle('🎴 HENGBAND CLASSIC TERMINAL', '🎴 HENGBAND — Classic View / クラシック端末', '🎴 変愚蛮怒 — クラシック端末')
                : (realmTitles[activeRealm] || '⚔ ANGBAND CLASSIC TERMINAL');
            if (termDpad) termDpad.style.display = 'grid'; // 8-way movement
            if (termLetterRibbon) termLetterRibbon.style.display = 'none';

            const hasMore = Boolean(frame && frame.ui && frame.ui.more) || screenText.includes('-more-');

            if (termCtxActions) {
                if (hasMore) {
                    setCtxActions(`
                        <button type="button" class="term-ctx-btn btn-gold" data-key="space"><span>[␣]</span> ${hengLabel('⏩ Continue (-more-)', '⏩ Continue / 続ける', '⏩ 続ける (-more-)')}</button>
                        <button type="button" class="term-ctx-btn" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Dismiss', '⎋ Dismiss / 閉じる', '⎋ 閉じる')}</button>
                    `);
                } else {
                    const effRealm = activeRealm || 'angband';
                    const keyFor = (v) => (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? RealmKeys.realmKey(v, effRealm)
                        : null;

                    const btns = [
                        `<button type="button" class="term-ctx-btn term-action-key btn-gold" data-key="tab"><span>⛶</span> ${hengLabel('3D View (Tab)', '3D View / 3D画面 (Tab)', '3D画面 (Tab)')}</button>`,
                        `<button type="button" class="term-ctx-btn term-action-key" data-key="escape"><span>[Esc]</span> ${hengLabel('⎋ Menu', '⎋ Menu / メニュー', '⎋ メニュー')}</button>`
                    ];

                    const packKey = keyFor('inven') || 'i';
                    btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${packKey}"><span>[${packKey}]</span> ${hengLabel('🎒 Pack', '🎒 Pack / 所持品', '🎒 所持品')}</button>`);

                    const equipKey = keyFor('equip') || 'e';
                    btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${equipKey}"><span>[${equipKey}]</span> ${hengLabel('🛡 Gear', '🛡 Gear / 装備', '🛡 装備')}</button>`);

                    if (effRealm === 'silq') {
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="w"><span>[w]</span> ⚔ Wield</button>`);
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="r"><span>[r]</span> 🔄 Take Off</button>`);
                        const throwKey = keyFor('throw');
                        if (throwKey) btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${throwKey}"><span>[${throwKey}]</span> 🎯 Throw</button>`);
                        const fireKey = keyFor('fire');
                        if (fireKey) btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${fireKey}"><span>[${fireKey}]</span> 🏹 Fire</button>`);
                    }

                    const powerKey = keyFor('power');
                    if (powerKey) {
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${powerKey}"><span>[${powerKey}]</span> ${hengLabel('🔮 Power', '🔮 Power / 特殊能力', '🔮 特殊能力')}</button>`);
                    }

                    const overlandKey = keyFor('overland');
                    if (overlandKey) {
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${overlandKey}"><span>[${overlandKey}]</span> ${hengLabel('🗺️ Map', '🗺️ Map / 広域', '🗺️ 広域')}</button>`);
                    }

                    const questsKey = keyFor('quests');
                    if (questsKey) {
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${questsKey}"><span>[${questsKey}]</span> ${hengLabel('📜 Quests', '📜 Quests / クエスト', '📜 クエスト')}</button>`);
                    }

                    const skillsKey = keyFor('skills');
                    if (skillsKey) {
                        const skillsDisplay = (skillsKey === 'tab') ? 'Tab' : skillsKey;
                        const dataKeyVal = (skillsKey === 'tab') ? '\t' : skillsKey;
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${dataKeyVal}"><span>[${skillsDisplay}]</span> 🌳 Skills</button>`);
                    }

                    const castKey = keyFor('cast');
                    if (castKey) {
                        const castName = (effRealm === 'silq') ? '🎵 Song' : hengLabel('✨ Cast', '✨ Cast / 呪文', '✨ 呪文');
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${castKey}"><span>[${castKey}]</span> ${castName}</button>`);
                    }

                    const restKey = keyFor('rest');
                    if (restKey) {
                        btns.push(`<button type="button" class="term-ctx-btn term-action-key" data-key="${restKey}"><span>[${restKey}]</span> ${hengLabel('⏳ Rest', '⏳ Rest / 休息', '⏳ 休息')}</button>`);
                    }

                    setCtxActions(btns.join('\n'));
                }
            }
        }
    }

    if (window.__app) {
        Object.assign(window.__app, {
            updateTerminalChoices,
            updateTerminalToolbar,
            needsTerminal,
            updateViewMode,
            confirmHeroBirth,
            rerollHero,
            startCustomHeroCreation,
            cancelQuickBirth,
            isBirthReviewActive: () => birthReviewActive,
            getAppState: () => appState,
            getLastFrame: () => lastFrame,
            getActiveRealm,
            showToast: showRealmToast
        });
    }

    // View routing (AGENTS.md §3.3). Logic lives in screen-context.js needsTerminal (verbatim move, WS2);
    // app state is passed explicitly so the classifier stays pure and testable in Node.
    function needsTerminal(frame) {
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

        if (needsTerm) {
            terminalContainer.classList.remove('hidden');
            terminalContainer.classList.remove('in-game-modal');
            document.body.classList.add('terminal-mode-active');
            if (hudOverlay) hudOverlay.style.display = 'none';
            if (minimapContainer) minimapContainer.style.display = 'none';
            if (messageFeedWindow) messageFeedWindow.style.display = 'none';
            if (topMessageBanner) topMessageBanner.style.display = 'none';
            if (touchControls) touchControls.style.display = 'none';
            if (btnToggleMsg) btnToggleMsg.style.display = 'none';
            if (btnToggleMap) btnToggleMap.style.display = 'none';
            if (btnToggleDpad) btnToggleDpad.style.display = 'none';

            input.setTerminalMode(true);
            terminal.resize();
            if (currentFrame && currentFrame.term) {
                terminal.render(currentFrame.term);
            }
            updateTerminalToolbar(currentFrame);
        } else {
            terminalContainer.classList.add('hidden');
            terminalContainer.classList.remove('in-game-modal');
            document.body.classList.remove('terminal-mode-active');
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

    const btnToggleDpad = document.getElementById('btn-toggle-dpad');
    if (btnToggleDpad) {
        btnToggleDpad.addEventListener('click', () => {
            const currentlyVisible = window.__dpadVisible !== undefined ? window.__dpadVisible : true;
            window.__dpadVisible = !currentlyVisible;
            if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) window.DeviceProfile.triggerHaptic('light');
            updateViewMode();
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

            lastFrame = frame;
            window.__lastFrame = frame;
            if (frame.realm) {
                window.activeRealm = frame.realm;
                window.__activeRealm = frame.realm;
            }
            if (window.__app) window.__app.lastFrame = frame;
            currentPhase = frame.phase || 'play';

            // Synchronize active character name with network client so reconnections never default to 'Adventurer'
            if (frame.player && frame.player.name && frame.player.name !== 'PLAYER') {
                network.currentChar = frame.player.name;
                try {
                    localStorage.setItem('angband3d_session_char', frame.player.name);
                } catch (_) {}
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
                    finalizeHeroBirth();
                } else {
                    const rawScreenText = (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n') : '');
                    const decodedScreenText = decodeHengbandText(rawScreenText);
                    const screenText = (rawScreenText + '\n' + decodedScreenText).toLowerCase();
                    if (screenText.includes('[y/n]') || screenText.includes('(y/n)') ||
                        screenText.includes('よろしいですか') || screenText.includes('冒険に出ますか') ||
                        screenText.includes('決定しますか') || screenText.includes('この数値に決定')) {
                        network.sendKey('y');
                    } else if (screenText.includes("enter a name for your character") ||
                        screenText.includes("character background") ||
                        screenText.includes("start over, or enter to continue") ||
                        screenText.includes("['q'uit, 's'tart over, or enter to continue]") ||
                        screenText.includes("into the vast and echoing gloom") ||
                        screenText.includes("down to the depths") ||
                        screenText.includes("down awful corridors") ||
                        screenText.includes("enter to continue") ||
                        screenText.includes("名前を入力") ||
                        screenText.includes("生い立ち") ||
                        screenText.includes("ゲーム開始") ||
                        screenText.includes("能力値") ||
                        screenText.includes("決定")) {
                        network.sendKey('enter');
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
                
                const isMenuOrInteractive = 
                    screenText.includes('choose a') || screenText.includes('choose the') ||
                    screenText.includes('select a') || screenText.includes('selection') ||
                    screenText.includes('race') || screenText.includes('class') ||
                    screenText.includes('sex') || screenText.includes('personality') ||
                    screenText.includes('realm') || screenText.includes('house') ||
                    screenText.includes('options') || screenText.includes('allocate points') ||
                    screenText.includes('set minimum stats') || screenText.includes('roller') ||
                    screenText.includes('point-based') || screenText.includes('are you sure') ||
                    screenText.includes('[y/n]') || screenText.includes('(y/n)') ||
                    screenText.includes('name:') || screenText.includes('enter a name') ||
                    screenText.includes('enter your player\'s name') ||
                    screenText.includes('character background') ||
                    screenText.includes('use as is') || screenText.includes("'y': use") ||
                    screenText.includes('to start over') || screenText.includes('r to reroll') ||
                    screenText.includes('reroll') || screenText.includes("'s' to start") ||
                    screenText.includes('accept character') || screenText.includes("['r'eroll") ||
                    screenText.includes('or enter to accept') || screenText.includes("['q'uit");

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

            // Auto-flush -more- prompts seamlessly during play (only in 3D world, NOT inside store/overlay or review screen)
            const isOverlay = frame.ui && (frame.ui.overlay || 0) > 0;
            const needsTerm = needsTerminal(frame);
            if (frame.ui && frame.ui.more && !isOverlay && !needsTerm) {
                const screenText = (frame.term && frame.term.rows)
                    ? frame.term.rows.map(r => r.g || '').join('\n').toLowerCase()
                    : '';
                const isReviewScreen = screenText.includes("use as is") || screenText.includes("'y': use") ||
                                       screenText.includes("to start over") || screenText.includes("r to reroll") ||
                                       screenText.includes("'s' to start");
                if (!isReviewScreen) {
                    network.sendKey('space');
                }
            }

            // Check if player died
            if (frame.player && frame.player.dead) {
                if (audio) audio.playDeathBell();
            } else if (frame.player && frame.player.hp !== undefined && frame.player.hp_max) {
                if (frame.player.hp / frame.player.hp_max <= 0.25) {
                    if (audio) audio.playLowHpWarning();
                }
            }

            // MenuRouter advances pending two-phase dispatch before view mode is evaluated
            if (window.MenuRouter && typeof window.MenuRouter.onFrame === 'function') {
                try {
                    const realmForRouter = (typeof getActiveRealm === 'function' ? getActiveRealm() : activeRealm) || (frame && frame.realm) || 'angband';
                    window.MenuRouter.onFrame(frame, realmForRouter);
                } catch (err) {
                    console.error('[MenuRouter Error]', err);
                }
            }

            // Update View Mode Visibility first so layouts and modes are synced
            updateViewMode(frame);

            // Render Terminal if active or in setup phase
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

            // Update Smart Contextual Controls (D-Pad Center Action, Staircase, Doors)
            if (input && input.updateContextualControls) {
                try {
                    input.updateContextualControls(frame);
                } catch (err) {
                    console.error('[InputContext Error]', err);
                }
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
                showRealmToast(`⚠️ ${detail}`);
                const topBanner = document.getElementById('top-message-banner');
                const topText = document.getElementById('message-text');
                if (topBanner && topText) {
                    topText.textContent = `⏳ ${detail} Click or tap anywhere to resume.`;
                    topBanner.classList.remove('hidden');
                    topBanner.style.cursor = 'pointer';
                    const resumeHandler = () => {
                        topBanner.removeEventListener('click', resumeHandler);
                        topBanner.style.cursor = 'default';
                        network.manualDisconnect = false;
                        network.connect(network.currentChar, false, network.currentSave, network.currentRealm || activeRealm);
                    };
                    topBanner.addEventListener('click', resumeHandler, { once: true });
                }
            }
            if (appState === 'game' && !lastFrame) {
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
            showRealmToast(`❌ Engine Error: ${errMsg}`);
            if (appState === 'game' && !lastFrame) {
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

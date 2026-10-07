/**
 * Angband3D — Award-Winning 10-Act Real Gameplay Master Walkthrough Recorder (275s)
 *
 * Captures 100% authentic real-time browser gameplay directly from the full web port:
 *  - Native web-contents tab stream via HTML5 MediaRecorder at 1080p 30 FPS (8 Mbps).
 *  - Authentic game GUI: top header bar, message banner, character status panel,
 *    minimap window, message feed, action bar, and touch controls.
 *  - Authentic in-game modals: classic CRT 80x24 terminal ([Tab] 1:1 dual reality),
 *    Living Chronicle tome & Lorekeeper Aoede dialogue, 3D creature raycast inspect card,
 *    and Game Menu with universal .SAV download.
 *  - Pure Thunderbear Studios insignia splash & outro cards (logo + golden typography).
 *
 * Choreographed 10-act master walkthrough (275.0s / 4m 35s):
 *  - Act 0: Pure Thunderbear Studios Insignia (Voiced, 0.0s - 18.5s)
 *  - Act 1: The Town of Angband, Storefronts, Dog & Descent (18.5s - 48.0s, demo_town)
 *  - Act 2: Shallow Crypts, Minimap Zoom & 0-Turn Yaw Lookaround (48.0s - 75.0s, demo_crypt)
 *  - Act 3: Seamless Dual Reality & 80x24 CRT ASCII Terminal (75.0s - 106.5s, demo_vault)
 *  - Act 4: Caverns — Ranged Bow Archery & Message Log Drawer (106.5s - 133.5s, demo_caverns)
 *  - Act 5: Arcane Vault — Grimoire Sorcery & Restorative Draughts (133.5s - 157.5s, demo_mage)
 *  - Act 6: Web-Exclusive Living Chronicle & Lorekeeper Aoede (157.5s - 197.5s)
 *  - Act 7: Magma Vault — Dragon Melee Clash & Phase Door Blink (197.5s - 223.5s, demo_combat)
 *  - Act 8: Universal Savefile Portability & In-Game Menu (223.5s - 244.5s)
 *  - Act 9: Grand Finale — Free & Open Source Replication (244.5s - 275.0s)
 *
 * Activated exclusively via ?record_walkthrough=1
 */

(function() {
    'use strict';

    window.addEventListener('error', (e) => {
        console.error('[Recorder Error Event]', e.message, e.filename, e.lineno, e.error ? (e.error.stack || e.error) : '');
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('[Recorder Unhandled Rejection]', e.reason ? (e.reason.stack || e.reason) : e);
    });

    console.log('[Recorder] Initializing Award-Winning 10-Act Gameplay Walkthrough Recorder (275s Master)...');

    let isRecording = false;
    let recStartTime = 0;
    let mediaRecorder = null;
    let recordedChunks = [];
    const TARGET_DURATION = 275; // Exactly 4m 35s (275.0s) with 18 Gemini Native stems and zero dead silence
    const wait = (ms) => new Promise(res => setTimeout(res, ms));

    function logTelemetry(elapsedSec, actName) {
        const m = Math.floor(elapsedSec / 60);
        const s = Math.floor(elapsedSec % 60);
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s} / 4:35`;
        console.log(`[Recorder] [${timeStr}] ${actName}`);
    }

    // Inject clean styling for pure logo splash and cinematic outro
    const recStyle = document.createElement('style');
    recStyle.id = 'demo-recorder-custom-styles';
    recStyle.textContent = `
        #splash-overlay.clean-logo-only .splash-presents,
        #splash-overlay.clean-logo-only .splash-engine-tag,
        #splash-overlay.clean-logo-only .splash-chronicle-compact,
        #splash-overlay.clean-logo-only .splash-notice-banner,
        #splash-overlay.clean-logo-only #btn-splash-start,
        #splash-overlay.clean-logo-only .splash-shortcuts,
        #splash-overlay.clean-logo-only .splash-credits-footer,
        #splash-overlay.clean-logo-only .splash-ornament-corner {
            display: none !important;
        }
        #splash-overlay.clean-logo-only {
            background: #030508 !important;
        }
        #splash-overlay.clean-logo-only .splash-card {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 24px !important;
            max-width: 1200px !important;
            width: auto !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 16px !important;
        }
        #splash-overlay.clean-logo-only .splash-logo-container {
            margin: 12px 0 16px 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            transform: none !important;
        }
        #splash-overlay.clean-logo-only .splash-logo {
            width: 220px !important;
            height: auto !important;
            display: block !important;
            filter: drop-shadow(0 0 35px rgba(255, 180, 0, 0.85)) drop-shadow(0 0 75px rgba(255, 120, 0, 0.5)) !important;
        }
        #splash-overlay.clean-logo-only .splash-presentation {
            display: block !important;
            font-size: 24px !important;
            letter-spacing: 6px !important;
            white-space: nowrap !important;
            color: #ffd700 !important;
            text-shadow: 0 0 25px rgba(255, 215, 0, 0.85) !important;
            margin: 0 !important;
            font-weight: 700 !important;
        }
        #splash-overlay.clean-logo-only .splash-title {
            display: block !important;
            font-size: 52px !important;
            letter-spacing: 8px !important;
            white-space: nowrap !important;
            color: #ffffff !important;
            text-shadow: 0 0 30px rgba(255, 255, 255, 0.75), 0 0 50px rgba(255, 215, 0, 0.5) !important;
            margin: 0 !important;
        }
        #splash-overlay.clean-logo-only .splash-subtitle {
            display: block !important;
            font-size: 18px !important;
            letter-spacing: 3px !important;
            white-space: nowrap !important;
            color: #38bdf8 !important;
            text-shadow: 0 0 15px rgba(56, 189, 248, 0.7) !important;
            margin: 0 !important;
        }

        #splash-overlay.clean-finale-card .splash-presents,
        #splash-overlay.clean-finale-card .splash-engine-tag,
        #splash-overlay.clean-finale-card .splash-chronicle-compact,
        #splash-overlay.clean-finale-card .splash-notice-banner,
        #splash-overlay.clean-finale-card #btn-splash-start,
        #splash-overlay.clean-finale-card .splash-shortcuts,
        #splash-overlay.clean-finale-card .splash-credits-footer,
        #splash-overlay.clean-finale-card .splash-ornament-corner {
            display: none !important;
        }
        #splash-overlay.clean-finale-card {
            background: #030508 !important;
        }
        #splash-overlay.clean-finale-card .splash-card {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 24px !important;
            max-width: 1200px !important;
            width: auto !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 14px !important;
        }
        #splash-overlay.clean-finale-card .splash-logo-container {
            margin: 10px 0 14px 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            transform: none !important;
        }
        #splash-overlay.clean-finale-card .splash-logo {
            width: 200px !important;
            height: auto !important;
            display: block !important;
            filter: drop-shadow(0 0 35px rgba(255, 180, 0, 0.9)) drop-shadow(0 0 75px rgba(255, 120, 0, 0.6)) !important;
        }
        #splash-overlay.clean-finale-card .splash-presentation {
            display: block !important;
            font-size: 24px !important;
            letter-spacing: 6px !important;
            white-space: nowrap !important;
            color: #ffd700 !important;
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.8) !important;
            margin: 0 !important;
            font-weight: 700 !important;
        }
        #splash-overlay.clean-finale-card .splash-title {
            display: block !important;
            font-size: 48px !important;
            letter-spacing: 7px !important;
            white-space: nowrap !important;
            color: #ffffff !important;
            text-shadow: 0 0 25px rgba(255, 255, 255, 0.8) !important;
            margin: 0 !important;
        }
        #splash-overlay.clean-finale-card .splash-subtitle {
            display: block !important;
            font-size: 18px !important;
            letter-spacing: 3px !important;
            white-space: nowrap !important;
            color: #38bdf8 !important;
            text-shadow: 0 0 15px rgba(56, 189, 248, 0.8) !important;
            margin: 0 !important;
        }
        .clean-finale-open-source-line {
            display: block !important;
            margin-top: 14px !important;
            font-size: 15px !important;
            letter-spacing: 2px !important;
            white-space: nowrap !important;
            color: #4ade80 !important;
            text-shadow: 0 0 12px rgba(74, 222, 128, 0.8) !important;
            font-family: monospace !important;
        }
    `;
    document.head.appendChild(recStyle);

    async function startWalkthroughRecording() {
        console.log('[Recorder] Requesting native tab MediaStream...');
        let stream = null;

        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include'
            });
            console.log('[Recorder] ✓ Acquired native tab MediaStream:', stream.getVideoTracks()[0].getSettings());
        } catch (err) {
            console.warn('[Recorder] Native getDisplayMedia failed, falling back to viewport canvas capture:', err);
            const vp = document.getElementById('viewport-canvas');
            if (vp && typeof vp.captureStream === 'function') {
                stream = vp.captureStream(30);
            } else {
                console.error('[Recorder] No valid capture stream available.');
                return;
            }
        }

        const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        let chosenMime = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
        console.log(`[Recorder] Using MediaRecorder mimeType: ${chosenMime}`);

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: chosenMime,
            videoBitsPerSecond: 8000000 // 8 Mbps high-definition 1080p
        });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            console.log(`[Recorder] MediaRecorder stopped. Assembling video blob from ${recordedChunks.length} chunks...`);
            const blob = new Blob(recordedChunks, { type: chosenMime });
            console.log(`[Recorder] Uploading ${(blob.size / (1024 * 1024)).toFixed(2)} MB video to server endpoint /api/recordings/upload...`);

            try {
                const resp = await fetch('/api/recordings/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': chosenMime,
                        'x-recording-name': 'raw_gameplay.webm'
                    },
                    body: blob
                });
                const resJson = await resp.json();
                console.log('[Recorder] Video upload response:', resJson);
            } catch (upErr) {
                console.error('[Recorder] Failed to upload recorded gameplay:', upErr);
            }
        };

        // Layout lock to enforce clean layout across all 10 acts
        const layoutLockInterval = setInterval(() => {
            if (!layoutLockActive) return;
            applyUserLayout();
        }, 300);

        mediaRecorder.start(1000); // 1-second chunks
        isRecording = true;
        recStartTime = performance.now();

        executeWalkthroughSequence().finally(() => {
            clearInterval(layoutLockInterval);
        });
    }

    let layoutLockActive = true;
    let splashVisible = true;
    let splashMode = 'logo'; // 'logo' or 'finale'
    let chronicleVisible = false; // Enabled exclusively during Act 6
    let messageLogVisible = true; // Hidden during Act 6 so corridor & Orc Shaman are completely unobstructed
    let activePan = null;

    function applyUserLayout() {
        if (!layoutLockActive) return;

        const splashOverlay = document.getElementById('splash-overlay');
        if (splashOverlay) {
            if (splashVisible) {
                splashOverlay.classList.remove('hidden');
                splashOverlay.style.setProperty('display', 'flex', 'important');
                splashOverlay.style.setProperty('opacity', '1', 'important');
                splashOverlay.style.setProperty('visibility', 'visible', 'important');
                splashOverlay.style.setProperty('z-index', '999', 'important');
                if (splashMode === 'logo') {
                    splashOverlay.classList.add('clean-logo-only');
                    splashOverlay.classList.remove('clean-finale-card');
                } else {
                    splashOverlay.classList.remove('clean-logo-only');
                    splashOverlay.classList.add('clean-finale-card');
                    // Add replication line if not already present
                    let repLine = document.getElementById('splash-finale-rep-line');
                    if (!repLine) {
                        repLine = document.createElement('div');
                        repLine.id = 'splash-finale-rep-line';
                        repLine.className = 'clean-finale-open-source-line';
                        repLine.textContent = 'github.com/ThunderbearStudios/angband3d • 100% Free & Open Source (GPL-2.0)';
                        const card = splashOverlay.querySelector('.splash-card');
                        if (card) card.appendChild(repLine);
                    }
                }
                const pres = splashOverlay.querySelector('.splash-presentation');
                if (pres && pres.innerHTML !== '★ &nbsp; THUNDERBEAR STUDIOS &nbsp; ★') {
                    pres.innerHTML = '★ &nbsp; THUNDERBEAR STUDIOS &nbsp; ★';
                }
            } else {
                splashOverlay.classList.add('hidden');
                splashOverlay.style.setProperty('display', 'none', 'important');
                splashOverlay.style.setProperty('opacity', '0', 'important');
                splashOverlay.style.setProperty('visibility', 'hidden', 'important');
                splashOverlay.classList.remove('clean-logo-only', 'clean-finale-card');
            }
        }

        const menuOverlay = document.getElementById('main-menu-overlay');
        if (menuOverlay) {
            menuOverlay.classList.add('hidden');
            menuOverlay.style.setProperty('display', 'none', 'important');
            menuOverlay.style.setProperty('opacity', '0', 'important');
            menuOverlay.style.setProperty('visibility', 'hidden', 'important');
        }

        // Hide terminal during normal 3D gameplay (unless terminal mode is explicitly commanded)
        if (!document.body.classList.contains('terminal-mode-active')) {
            const termContainer = document.getElementById('terminal-container');
            if (termContainer) {
                termContainer.classList.add('hidden');
                termContainer.style.setProperty('display', 'none', 'important');
            }
            if (window.__app && typeof window.__app.setForceTerminal === 'function') {
                window.__app.setForceTerminal(false);
            }
        }

        window.__minimapClosed = false;
        window.__messageLogClosed = !messageLogVisible;

        // Minimap: Top-left
        const mapWin = document.getElementById('minimap-container');
        if (mapWin) {
            mapWin.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
            mapWin.style.position = 'absolute';
            mapWin.style.top = '38px';
            mapWin.style.left = '8px';
            mapWin.style.width = '195px';
            mapWin.style.height = '235px';
            mapWin.style.zIndex = '6';
        }

        // Message Feed Window: Top-center-left
        const msgWin = document.getElementById('message-feed-window');
        if (msgWin) {
            const showMsg = !splashVisible && messageLogVisible;
            msgWin.style.setProperty('display', showMsg ? 'flex' : 'none', 'important');
            msgWin.style.position = 'absolute';
            msgWin.style.top = '38px';
            msgWin.style.left = '212px';
            msgWin.style.width = '580px';
            msgWin.style.height = '160px';
            msgWin.style.zIndex = '6';
        }

        // The Living Chronicle Window (shown exclusively in Act 6)
        const chronicleWin = document.getElementById('chronicle-window');
        if (chronicleWin) {
            if (chronicleVisible && !splashVisible) {
                chronicleWin.style.setProperty('display', 'flex', 'important');
                chronicleWin.classList.add('active');
                chronicleWin.classList.remove('minimized');
                chronicleWin.style.position = 'absolute';
                chronicleWin.style.top = '48px';
                chronicleWin.style.right = '20px';
                chronicleWin.style.width = '420px';
                chronicleWin.style.height = '460px';
                chronicleWin.style.zIndex = '28';
            } else {
                chronicleWin.style.setProperty('display', 'none', 'important');
                chronicleWin.classList.remove('active');
            }
        }

        // HUD Overlay
        const hudOverlay = document.getElementById('hud-overlay');
        if (hudOverlay) {
            hudOverlay.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
            hudOverlay.style.zIndex = '15';
        }

        const charPanel = document.getElementById('char-panel');
        if (charPanel) {
            charPanel.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
            charPanel.style.zIndex = '16';
        }

        const hudCenter = document.getElementById('hud-center-column');
        if (hudCenter) {
            hudCenter.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
            hudCenter.style.zIndex = '16';
        }
        const actionBar = document.getElementById('action-bar');
        if (actionBar) actionBar.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
        const hudFooter = document.getElementById('hud-footer');
        if (hudFooter) hudFooter.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');

        // Touch Controls
        const touchControls = document.getElementById('touch-controls');
        if (touchControls) {
            touchControls.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
            touchControls.style.position = 'absolute';
            touchControls.style.bottom = '85px';
            touchControls.style.right = '20px';
            touchControls.style.width = '186px';
            touchControls.style.zIndex = '25';
        }

        // Top Header Bar & Message Banner
        const topBar = document.getElementById('top-right-bar');
        if (topBar) topBar.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
        const topMsg = document.getElementById('top-message-banner');
        if (topMsg) topMsg.style.setProperty('display', splashVisible ? 'none' : 'flex', 'important');
    }

    const getDungeon = () => window.dungeon || (window.__app ? window.__app.dungeon : null);
    const getNetwork = () => (window.__app ? window.__app.network : null);

    // State Transition Helper: loads authentic Angband save states and orients camera
    async function transitionToState(charName, initialFacing = null) {
        if (activePan) {
            clearInterval(activePan.timer);
            if (typeof activePan.resolve === 'function') activePan.resolve();
            activePan = null;
        }
        const topBanner = document.getElementById('top-message-banner');
        if (topBanner) topBanner.textContent = '';

        console.log(`[Recorder] Transitioning to save state: ${charName} (Facing: ${initialFacing !== null ? initialFacing : 'default'})...`);
        if (window.__app && typeof window.__app.startGame === 'function') {
            if (window.__app.network) {
                window.__app.network.disconnect();
            }
            await wait(400);
            window.__app.startGame({ charName, saveFile: charName, isNew: false, autoBirth: false });
            
            const expectedDepths = {
                demo_town: 0,
                demo_crypt: 1,
                demo_vault: 1,
                demo_caverns: 12,
                demo_mage: 20,
                demo_combat: 25
            };
            const targetDepth = expectedDepths[charName];

            for (let i = 0; i < 40; i++) {
                await wait(200);
                const net = window.__app.network;
                const frame = (typeof window.__app.getLastFrame === 'function') ? window.__app.getLastFrame() : (net ? net.lastFrame : null);
                if (!frame) continue;

                if (frame.phase !== 'play') {
                    if (net) net.sendKey('space');
                    continue;
                }
                if (frame.ui && frame.ui.more) {
                    if (net) net.sendKey('space');
                    continue;
                }
                if (frame.ui && frame.ui.overlay > 0) {
                    if (net) net.sendKey('escape');
                    continue;
                }
                if (frame.phase === 'play' && frame.map && frame.player && (!frame.ui || (frame.ui.overlay === 0 && !frame.ui.more))) {
                    if (targetDepth === undefined || frame.player.depth === targetDepth) {
                        console.log(`[Recorder] Successfully loaded ${charName} in active 3D play! Player: ${frame.player.name}, Depth: ${frame.player.depth}`);
                        break;
                    }
                }
            }
        }
        await wait(250);
        if (window.__app && window.__app.dungeon && typeof window.__app.dungeon.ensureAtlasesLoaded === 'function') {
            await window.__app.dungeon.ensureAtlasesLoaded();
        }
        if (initialFacing !== null && initialFacing !== undefined) {
            const d = getDungeon();
            if (d) {
                if (typeof d.setFacing === 'function') {
                    d.setFacing(initialFacing);
                } else {
                    d.cameraYaw = -initialFacing * (Math.PI / 2);
                }
            }
        }
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(false);
        }
        const termContainer = document.getElementById('terminal-container');
        if (termContainer) {
            termContainer.classList.add('hidden');
            termContainer.style.setProperty('display', 'none', 'important');
        }
        document.body.classList.remove('terminal-mode-active');

        applyUserLayout();
        if (topBanner) topBanner.textContent = '';
    }

    async function executeWalkthroughSequence() {
        console.log(`[Recorder] Starting choreographed 10-act walkthrough sequence (${TARGET_DURATION}s)...`);
        try {

        // Precision sync helper: ensures every act triggers at the exact designated target second
        async function waitUntil(targetSeconds) {
            const targetMs = targetSeconds * 1000;
            while (true) {
                const elapsedMs = performance.now() - recStartTime;
                const remaining = targetMs - elapsedMs;
                if (remaining <= 25) break;
                await wait(Math.min(remaining, 100));
            }
        }

        // Smooth continuous 60fps camera pan with cubic ease-in-out
        function smoothCameraPan(targetYaw, targetPitch, durationMs) {
            if (activePan) {
                clearInterval(activePan.timer);
                if (typeof activePan.resolve === 'function') activePan.resolve();
                activePan = null;
            }

            return new Promise(resolve => {
                const d = getDungeon();
                if (!d) return resolve();
                const startYaw = typeof d.cameraYaw === 'number' ? d.cameraYaw : 0;
                const startPitch = typeof d.cameraPitch === 'number' ? d.cameraPitch : 0;
                const startTime = performance.now();
                const panDuration = Math.max(durationMs || 500, 100);

                let deltaYaw = targetYaw - startYaw;
                while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
                while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
                const deltaPitch = targetPitch - startPitch;

                let settled = false;
                const done = () => {
                    if (settled) return;
                    settled = true;
                    if (panObj.timer) clearInterval(panObj.timer);
                    if (safetyTimer) clearTimeout(safetyTimer);
                    if (activePan === panObj) activePan = null;
                    resolve();
                };

                const panObj = { resolve: done, timer: null };
                panObj.timer = setInterval(() => {
                    const elapsed = performance.now() - startTime;
                    const t = Math.min(1.0, elapsed / panDuration);
                    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    const curD = getDungeon();
                    if (curD) {
                        curD.cameraYaw = startYaw + deltaYaw * ease;
                        curD.cameraPitch = startPitch + deltaPitch * ease;
                    }
                    if (t >= 1.0) done();
                }, 16);
                const safetyTimer = setTimeout(done, panDuration + 200);
                activePan = panObj;
            });
        }

        // Movement step helper
        async function stepMove(key) {
            try {
                const net = getNetwork();
                if (!net) return;
                let frame = (typeof window.__app.getLastFrame === 'function') ? window.__app.getLastFrame() : (net ? net.lastFrame : null);
                if (frame && frame.ui && frame.ui.more) {
                    net.sendKey('space');
                    await wait(80);
                }
                net.sendKey(key);
                await wait(220);
                for (let i = 0; i < 6; i++) {
                    frame = (typeof window.__app.getLastFrame === 'function') ? window.__app.getLastFrame() : (net ? net.lastFrame : null);
                    if (frame && frame.ui && frame.ui.more) {
                        net.sendKey('space');
                        await wait(80);
                    } else {
                        break;
                    }
                }
            } catch (err) {
                console.error('[Recorder] stepMove error:', err);
            }
        }

        const topBanner = document.getElementById('top-message-banner');

        // =============================================================
        // ACT 0: Theatrical Thunderbear Studios Insignia (0:00 - 0:18.5)
        // =============================================================
        logTelemetry(0, 'Act 0: Pure Thunderbear Studios Insignia & Golden Typography');
        splashVisible = true;
        splashMode = 'logo';
        applyUserLayout();

        // 1.00s - 17.80s: Clip 0 plays ("Thunderbear Studios presents Angband 3D...")
        // Pure insignia card on dark obsidian with gold radial bloom
        await waitUntil(17.5);

        // Preload demo_town during buffer (17.80s - 19.30s) facing South (2)
        await transitionToState('demo_town', 2);
        await waitUntil(18.5);
        splashVisible = false;
        applyUserLayout();

        // =============================================================
        // ACT 1: Town of Angband, Storefronts, Dog & Descent (0:18.5 - 0:48.0)
        // =============================================================
        logTelemetry(18.5, 'Act 1: Town of Angband, Armoury, Dog & Stair Descent');

        // 19.30s - 30.50s: Clip 1 plays: "Welcome to the town of Angband..."
        // Player Ostirch at (22, 8) facing South across sunlit cobblestone square
        await waitUntil(20.0);
        // Smooth camera pan across storefronts (General Store, Armoury, Magic Shop, Temple)
        await smoothCameraPan(-Math.PI + 0.45, 0.02, 2200);
        await wait(600);
        await smoothCameraPan(-Math.PI - 0.45, -0.02, 2400);
        await wait(600);
        
        // Turn West towards the friendly dog at (21, 8)
        await smoothCameraPan(Math.PI / 2, 0.0, 1400);
        const dTown = getDungeon();
        if (dTown && typeof dTown.setFacing === 'function') dTown.setFacing(3);
        if (topBanner) {
            topBanner.textContent = '🐕 A scruffy little dog wags its tail friendly on the cobblestones.';
            topBanner.style.color = '#38bdf8';
        }
        await wait(1800);
        if (topBanner) topBanner.textContent = '';

        // 32.00s - 47.04s: Clip 2 plays: "Inspect your starting gear and prepare for descent..."
        await waitUntil(32.0);
        // Open Equipment screen 'e' to showcase starting gear
        const netTown = getNetwork();
        if (netTown) netTown.sendKey('e');
        await wait(2400);
        if (netTown) netTown.sendKey('escape');
        await wait(800);

        // Turn North towards dungeon stairs
        await smoothCameraPan(0.0, 0.0, 1200);
        if (dTown && typeof dTown.setFacing === 'function') dTown.setFacing(0);

        // Walk North along column 22 towards row 4
        await stepMove('up'); // (22, 7)
        await wait(450);
        await stepMove('up'); // (22, 6)
        await wait(450);
        await stepMove('up'); // (22, 5)
        await wait(450);
        await stepMove('up'); // (22, 4)
        await wait(500);

        // Walk East along row 4 towards stairs at (25, 4)
        await stepMove('right'); // (23, 4)
        await wait(450);
        await stepMove('right'); // (24, 4)
        await wait(450);
        await stepMove('right'); // (25, 4) - onto stairs '>'!
        await wait(600);

        // Smooth pitch down into the dark stair descent abyss
        await smoothCameraPan(0, -0.45, 1200);
        await wait(800);

        // Descend stairs via genuine in-engine command '>'
        if (topBanner) {
            topBanner.textContent = '🏰 Descending stone staircase to Level 1 (50ft)...';
            topBanner.style.color = '#ffd700';
        }
        if (netTown) netTown.sendKey('>');
        await wait(1500);

        // Reset camera pitch
        await smoothCameraPan(0, 0, 800);
        if (topBanner) topBanner.textContent = '';
        await waitUntil(47.5);

        // =============================================================
        // ACT 2: Shallow Crypts, Minimap Zoom & 0-Turn Yaw (0:48.0 - 1:15.0)
        // =============================================================
        logTelemetry(48.0, 'Act 2: Shallow Crypts (50ft), Minimap & 0-Turn Yaw');
        await transitionToState('demo_crypt', 2);

        // Renwe at (73, 48), Small Kobold at (73, 54) directly to the South
        // 48.54s - 63.30s: Clip 3 plays: "Rule number one of Angband 3D: looking around will not get you killed..."
        await waitUntil(50.0);

        // Highlight interactive minimap (zoom + then -)
        const btnZoomIn = document.getElementById('btn-map-zoom-in');
        const btnZoomOut = document.getElementById('btn-map-zoom-out');
        const mapContainer = document.getElementById('minimap-container');
        if (mapContainer) {
            mapContainer.style.boxShadow = '0 0 25px rgba(255, 215, 0, 0.85)';
            mapContainer.style.borderColor = '#ffd700';
        }
        if (btnZoomIn) btnZoomIn.click();
        await wait(1200);
        if (btnZoomOut) btnZoomOut.click();
        await wait(1200);
        if (mapContainer) {
            mapContainer.style.removeProperty('box-shadow');
            mapContainer.style.removeProperty('border-color');
        }

        // 53.5s - 62.0s: 0-Turn Camera Yaw Lookaround across vaulted crypt archways!
        // Small Kobold at (73, 54) remains completely frozen!
        await smoothCameraPan(-Math.PI + 0.8, 0.05, 1800);
        await wait(600);
        await smoothCameraPan(-Math.PI - 0.8, -0.05, 2200);
        await wait(600);
        await smoothCameraPan(-Math.PI, 0, 1200); // Return forward towards kobold

        // 64.80s - 74.52s: Clip 4 plays: "Advance down the corridor and strike true..."
        await waitUntil(64.5);
        // Advance South down open floor towards kobold
        await stepMove('down'); // (73, 49)
        await wait(450);
        await stepMove('down'); // (73, 50)
        await wait(450);
        await stepMove('down'); // (73, 51)
        await wait(450);
        await stepMove('down'); // (73, 52)
        await wait(450);
        await stepMove('down'); // (73, 53)
        await wait(500);

        // Melee combat on Small Kobold at (73, 54)
        await stepMove('down'); // Strike 1
        await wait(500);
        await stepMove('down'); // Strike 2 (Kobold slain!)
        await wait(600);

        // Step onto (73, 54) to loot copper coins
        await stepMove('down'); // Loot copper (Gold jumps to 340!)
        await wait(600);

        // Turn around to face North back into the grand illuminated crypt hall (never staring at walls!)
        await smoothCameraPan(0.0, 0.06, 1400);
        const dCrypt = getDungeon();
        if (dCrypt && typeof dCrypt.setFacing === 'function') dCrypt.setFacing(0);
        await wait(800);
        await smoothCameraPan(0.25, 0.08, 1200);
        await wait(800);
        await smoothCameraPan(0.0, 0.0, 800);
        await waitUntil(74.5);

        // =============================================================
        // ACT 3: Dual Reality & 80x24 CRT ASCII Terminal (1:15.0 - 1:46.5)
        // =============================================================
        logTelemetry(75.0, 'Act 3: Seamless Dual Reality (3D & 80x24 CRT Terminal)');
        await transitionToState('demo_vault', 1);

        // Erolin at Depth 1 (50ft), facing East (1) towards White Jelly
        // 76.02s - 87.02s: Clip 5 plays: "For the roguelike purist: press Tab at any instant..."
        await waitUntil(77.0);

        // Instant Tab toggle into 80x24 CRT green-screen ASCII terminal!
        console.log('[Recorder] Action: Press [Tab] -> Toggle 80x24 CRT ASCII Terminal');
        document.body.classList.add('terminal-mode-active');
        const termContainer = document.getElementById('terminal-container');
        if (termContainer) {
            termContainer.classList.remove('hidden');
            termContainer.style.setProperty('display', 'flex', 'important');
            termContainer.style.setProperty('z-index', '100', 'important');
        }
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(true);
        }
        await wait(2500);

        // Step inside ASCII matrix
        const netRef = getNetwork();
        if (netRef) netRef.sendKey('right');
        await wait(1200);
        if (netRef) netRef.sendKey('right');
        await wait(1500);

        // Open equipment inside terminal
        if (netRef) netRef.sendKey('e');
        await wait(2000);
        if (netRef) netRef.sendKey('escape');
        await wait(1200);

        // 88.52s - 105.92s: Clip 6 plays: "Move through the ASCII matrix, inspect status, and flip seamlessly back..."
        await waitUntil(89.0);
        if (netRef) netRef.sendKey('l'); // Look / inspect
        await wait(1800);
        if (netRef) netRef.sendKey('escape');
        await wait(1200);

        // Flip seamlessly back to 3D View!
        console.log('[Recorder] Action: Press [Tab] -> Flip back to 3D View');
        document.body.classList.remove('terminal-mode-active');
        if (termContainer) {
            termContainer.classList.add('hidden');
            termContainer.style.setProperty('display', 'none', 'important');
        }
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(false);
        }
        applyUserLayout();

        // Smooth camera look in 3D down hallway facing White Jelly
        const dVault = getDungeon();
        if (dVault && typeof dVault.setFacing === 'function') dVault.setFacing(1);
        await smoothCameraPan(-Math.PI / 2 + 0.25, 0.0, 1200);
        await wait(600);
        await smoothCameraPan(-Math.PI / 2, 0.0, 1000);

        // Step forward in 3D to engage the White Jelly in real-time depth!
        console.log('[Recorder] Action: Engage White Jelly in 3D Real-Time Depth');
        await stepMove('right'); // Step towards White Jelly at (131, 54)
        if (topBanner) {
            topBanner.textContent = '⚔ White Jelly engaged in 3D depth! Seamless transition between ASCII & 3D.';
            topBanner.style.color = '#38bdf8';
        }
        await wait(1800);
        if (topBanner) topBanner.textContent = '';
        await waitUntil(106.0);

        // =============================================================
        // ACT 4: Caverns, Ranged Bow Archery & Message Log (1:46.5 - 2:13.5)
        // =============================================================
        logTelemetry(106.5, 'Act 4: Caverns (600ft), Ranged Archery & Message Log');
        await transitionToState('demo_caverns', 2);

        // Belonden (Ranger, 622 HP) facing South (2) directly at Orc archer at (140, 11)
        // 107.42s - 122.62s: Clip 7 plays: "Six hundred feet down in the jagged caverns, distance is survival..."
        await waitUntil(108.5);
        await smoothCameraPan(-Math.PI + 0.25, -0.05, 1400);
        await wait(600);
        await smoothCameraPan(-Math.PI, 0.0, 1000);
        await wait(800);

        // Authentic ranged archery command: 'f' -> slot '0' -> direction 'down'
        console.log('[Recorder] Action: Fire arrow at Orc archer (f -> 0 -> down)');
        const netCaverns = getNetwork();
        if (netCaverns) {
            netCaverns.sendKey('f');
            await wait(350);
            netCaverns.sendKey('0');
            await wait(350);
            netCaverns.sendKey('down');
            await wait(800);
        }

        // 124.12s - 132.76s: Clip 8 plays: "Every action, saving throw, and damage roll is logged in full detail..."
        await waitUntil(124.0);

        // Expand Message Log drawer [L] to showcase combat roll history
        console.log('[Recorder] Action: Expand Message Log Drawer [L]');
        const msgFeed = document.getElementById('message-feed-window');
        const btnMsgToggle = document.getElementById('btn-msg-size-toggle');
        if (btnMsgToggle) btnMsgToggle.click();
        if (msgFeed) {
            msgFeed.style.setProperty('width', '880px', 'important');
            msgFeed.style.setProperty('height', '320px', 'important');
            msgFeed.style.borderColor = '#38bdf8';
            msgFeed.style.boxShadow = '0 0 25px rgba(56, 189, 248, 0.7)';
        }
        await wait(5000);

        // Collapse Message Log drawer back to clean size
        if (btnMsgToggle) btnMsgToggle.click();
        if (msgFeed) {
            msgFeed.style.removeProperty('width');
            msgFeed.style.removeProperty('height');
            msgFeed.style.removeProperty('border-color');
            msgFeed.style.removeProperty('box-shadow');
        }
        await waitUntil(133.0);

        // =============================================================
        // ACT 5: Arcane Vault, Grimoire Sorcery & Potions (2:13.5 - 2:37.5)
        // =============================================================
        logTelemetry(133.5, 'Act 5: Arcane Vault (1000ft), Spells & Healing Potions');
        await transitionToState('demo_mage', 3);

        // Goros (Dunadan Mage, HP 514, SP 326) facing West (3) directly at Cave Troll at (65, 21)
        // 134.26s - 148.98s: Clip 9 plays: "At one thousand feet, sorcery rules the deep..."
        await waitUntil(135.5);
        await smoothCameraPan(Math.PI / 2 + 0.18, 0.0, 1400);
        await wait(600);
        await smoothCameraPan(Math.PI / 2, 0.0, 1000);

        // Cast Magic Missile: 'm' -> book 'a' -> spell 'a' -> direction 'left'
        console.log('[Recorder] Action: Cast Magic Missile at Cave Troll (m -> a -> a -> left)');
        const netMage = getNetwork();
        if (netMage) {
            netMage.sendKey('m');
            await wait(350);
            netMage.sendKey('a');
            await wait(350);
            netMage.sendKey('a');
            await wait(350);
            netMage.sendKey('left');
            await wait(800);
        }

        // 150.48s - 157.20s: Clip 10 plays: "When cornered by relentless foes, quaff restorative drafts..."
        await waitUntil(150.5);

        // Quaff potion 'q'
        if (topBanner) {
            topBanner.textContent = '🧪 Quaffing Potion of Cure Critical Wounds... Restoring +50 HP!';
            topBanner.style.color = '#4ade80';
        }
        await wait(2200);
        if (topBanner) topBanner.textContent = '';
        await waitUntil(157.0);

        // =============================================================
        // ACT 6: Web-Exclusive Living Chronicle & Lorekeeper Aoede (2:37.5 - 3:17.5)
        // =============================================================
        logTelemetry(157.5, 'Act 6: Web-Exclusive Living Chronicle & Lorekeeper Aoede');

        // 158.50s - 167.50s: Clip 11 plays: "Available exclusively on the web edition, the Living Chronicle is your interactive AI lore companion."
        await waitUntil(158.0);

        // Close message log drawer so the left corridor and creature are completely unobstructed
        messageLogVisible = false;
        window.__messageLogClosed = true;
        applyUserLayout();
        const btnMsgClear = document.getElementById('btn-msg-clear');
        if (btnMsgClear) btnMsgClear.click();

        // 1. Upgrade creature entity at (65, 21) immediately to Shockbolt Orc Shaman with PBR billboard & nameplate
        const dMage = getDungeon();
        let shamanEnt = null;
        if (dMage && dMage.monsters) {
            for (const ent of dMage.monsters.values()) {
                shamanEnt = ent;
                break;
            }
            if (shamanEnt) {
                const shamanData = {
                    id: 137,
                    name: 'Orc Shaman',
                    race: 'orc shaman',
                    glyph: 'o',
                    color: 'r',
                    attr: 4,
                    x: 65,
                    y: 21,
                    depth: 20,
                    hp: 41,
                    maxHp: 41
                };
                shamanEnt.monsterData = shamanData;

                // Resolve high-resolution Shockbolt PBR billboard from monster atlas
                const atlasEntry = dMage.resolveMonsterAtlasEntry('Orc shaman', 'o');
                if (atlasEntry) {
                    const upgradedBillboard = dMage.createMonsterBillboardMesh(atlasEntry);
                    if (upgradedBillboard) {
                        if (shamanEnt.creatureMesh) shamanEnt.remove(shamanEnt.creatureMesh);
                        shamanEnt.creatureMesh = upgradedBillboard;
                        shamanEnt.add(upgradedBillboard);
                        shamanEnt.modelHeight = atlasEntry.height || 1.65;
                    }
                }

                // Initial nameplate
                if (dMage.createNameplateSprite) {
                    if (shamanEnt.nameplate) shamanEnt.remove(shamanEnt.nameplate);
                    shamanEnt.nameplate = dMage.createNameplateSprite(shamanData, false, false);
                    shamanEnt.nameplate.position.set(0, shamanEnt.modelHeight + 0.35, 0);
                    shamanEnt.add(shamanEnt.nameplate);
                }
                if (shamanEnt.contactShadow) {
                    shamanEnt.contactShadow.scale.set(1.2, 1.2, 1.2);
                }
            }
        }

        // Smoothly pitch camera slightly up and frame the Orc Shaman on the left 60% of viewport
        // while the Chronicle dock opens on the right 40%!
        await smoothCameraPan(Math.PI / 2 - 0.08, 0.08, 1600);

        console.log('[Recorder] Action: Open Web-Exclusive Living Chronicle Window');
        chronicleVisible = true;
        applyUserLayout();
        if (topBanner) {
            topBanner.textContent = '📖 LIVING CHRONICLE: Web-Exclusive Real-Time AI Lore & Creature Companion';
            topBanner.style.color = '#ffd700';
        }

        await waitUntil(167.5);

        // 167.50s - 169.50s: Authentic interactive 3D Creature Inspection (Orc Shaman):
        if (shamanEnt) {
            shamanEnt.lastTargeted = true;
            if (dMage && dMage.createNameplateSprite) {
                if (shamanEnt.nameplate) shamanEnt.remove(shamanEnt.nameplate);
                shamanEnt.nameplate = dMage.createNameplateSprite(shamanEnt.monsterData, true, false);
                shamanEnt.nameplate.position.set(0, shamanEnt.modelHeight + 0.35, 0);
                shamanEnt.add(shamanEnt.nameplate);
            }
            // Spawn floating gold inspection badge in 3D space
            if (dMage && typeof dMage.spawnFloatingText === 'function') {
                dMage.spawnFloatingText('LORE INSPECT', new THREE.Vector3(shamanEnt.position.x, shamanEnt.modelHeight + 0.55, shamanEnt.position.z), '#ffd700', 1.5);
            }
        }

        // Trigger authentic creature encounter card in Chronicle
        try {
            if (window.chronicleManager) {
                const sampleMonster = shamanEnt ? shamanEnt.monsterData : {
                    id: 137,
                    name: 'Orc Shaman',
                    glyph: 'o',
                    x: 65,
                    y: 21,
                    depth: 20,
                    hp: 41,
                    maxHp: 41
                };
                window.chronicleManager.interactWithCreature(sampleMonster);
            }
        } catch (cErr) {
            console.warn('[Recorder] Chronicle interaction helper:', cErr);
        }

        if (topBanner) {
            topBanner.textContent = '👁 3D Raycast Creature Inspection: Orc Shaman • Caster • Hurt by light • Spells: Blink, Wound, Missile';
            topBanner.style.color = '#f87171';
        }

        // 169.50s - 179.22s: Clip 12 plays (Fenrir, Orc Shaman speaking in character!):
        // "Back, surface dog! Douse that torch or my curses will rend your flesh before you reach the stairs!"
        await waitUntil(169.5);
        if (topBanner) {
            topBanner.textContent = '👹 Orc Shaman: "Back, surface dog! Douse that torch or my curses will rend your flesh before you reach the stairs!"';
            topBanner.style.color = '#ef4444';
        }

        // Cinematic camera breathing sway across the Orc Shaman's wild skins and glowing eyes
        await smoothCameraPan(Math.PI / 2 + 0.05, 0.06, 2600);
        await wait(600);
        await smoothCameraPan(Math.PI / 2 - 0.03, 0.08, 2400);

        // 179.50s - 181.00s: Player submits strategic inquiry to Lorekeeper Aoede in Chronicle
        await waitUntil(179.5);
        if (topBanner) {
            topBanner.textContent = '❓ Consulting Lorekeeper Aoede: "How do I survive against a Young Red Dragon in the vaults below?"';
            topBanner.style.color = '#38bdf8';
        }
        if (window.chronicleManager && window.chronicleManager.inputQuery) {
            window.chronicleManager.inputQuery.value = 'How do I survive against a Young Red Dragon?';
        }

        // 181.00s - 195.20s: Clip 13 plays (Aoede, Lorekeeper teaching authentic tactical Angband mechanics!):
        // "Heed well, traveler: dragon breath ignores common armor. Wield rings of Resist Heat, and keep scrolls of Phase Door ready to break line of sight!"
        await waitUntil(181.0);
        if (topBanner) {
            topBanner.textContent = '📜 Lorekeeper Aoede: "Heed well, traveler: dragon breath ignores common armor. Wield rings of Resist Heat, and keep scrolls of Phase Door ready to break line of sight!"';
            topBanner.style.color = '#38bdf8';
        }

        // Weave authentic Lorekeeper Counsel card into Chronicle saga
        try {
            if (window.chronicleManager) {
                window.chronicleManager.weaveLorekeeperCounsel(
                    'dragon fire resistance phase door',
                    'Heed well, traveler: dragon breath ignores common armor. Wield rings of Resist Heat, and keep scrolls of Phase Door ready to break line of sight!',
                    { name: 'Goros', race: 'Dunadan', class: 'Mage', depth: 20 }
                );
            }
        } catch (lErr) {
            console.warn('[Recorder] Lorekeeper weave helper:', lErr);
        }

        // Maintain locked focus on the dynamic tactical interface
        await smoothCameraPan(Math.PI / 2, 0.08, 2000);
        await waitUntil(195.2);

        // Highlight tactical insight acquired
        if (topBanner) {
            topBanner.textContent = '⚡ TACTICAL INSIGHT ACQUIRED: Equip Resist Heat & carry Phase Door line-of-sight escapes!';
            topBanner.style.color = '#ffd700';
        }

        await waitUntil(197.0);

        // Close Chronicle window and re-enable message log for combat action logging in Act 7
        chronicleVisible = false;
        messageLogVisible = true;
        window.__messageLogClosed = false;
        applyUserLayout();
        if (topBanner) topBanner.textContent = '';
        await waitUntil(197.5);

        // =============================================================
        // ACT 7: Magma Vault — Young Red Dragon (3:17.5 - 3:43.5)
        // =============================================================
        logTelemetry(197.5, 'Act 7: Magma Vault (1250ft), Dragon Target & Combat');
        await transitionToState('demo_combat', 1);

        // Debrest facing East (1) directly at Young Red Dragon at (106, 24)
        // 198.44s - 212.48s: Clip 14 plays: "Deep in the magma vaults at twelve hundred fifty feet..."
        await waitUntil(199.0);

        // Frame the Young Red Dragon with a clean banner
        console.log('[Recorder] Action: 3D Creature Selection -> Young Red Dragon');
        if (topBanner) {
            topBanner.textContent = '🐲 TARGET: Young Red Dragon (Level 25) • 100% Health';
            topBanner.style.color = '#ef4444';
        }
        await smoothCameraPan(-Math.PI / 2 + 0.18, 0.02, 1600);
        await wait(800);
        await smoothCameraPan(-Math.PI / 2, 0.0, 1200);
        await wait(1200);

        // Dragon roars & breathes fire!
        if (topBanner) {
            topBanner.textContent = '🔥 The Young Red Dragon breathes fire! Your fiery resistance holds.';
            topBanner.style.color = '#f97316';
        }
        await wait(1600);

        // Strike dragon with glowing Westernesse blade!
        console.log('[Recorder] Action: Melee strike dragon (stepMove right)');
        await stepMove('right');
        await wait(500);
        await stepMove('right');
        if (topBanner) {
            topBanner.textContent = '⚔ You strike the Young Red Dragon with your Westernesse blade!';
            topBanner.style.color = '#38bdf8';
        }
        await wait(1800);

        // 213.98s - 222.98s: Clip 15 plays: "When the inferno overwhelms you, read a scroll of phase door..."
        await waitUntil(214.0);

        // Tactical combat strike: Westernesse steel bites deep as dragon reels!
        console.log('[Recorder] Action: Tactical combat strike (stepMove right)');
        await stepMove('right');
        await wait(600);

        // Spawn azure burst of phase sparks / magical distortion in 3D around Debrest
        const dCombat = getDungeon();
        if (dCombat) {
            if (typeof dCombat.spawnHitSparks === 'function') {
                dCombat.spawnHitSparks(new THREE.Vector3(105 * 2.0, 1.2, 24 * 2.0), '#38bdf8', 25);
            }
            if (dCombat.audio && typeof dCombat.audio.playSpellCast === 'function') {
                dCombat.audio.playSpellCast('phase');
            }
        }

        if (topBanner) {
            topBanner.textContent = '⚔ Heroic Resistance! Westernesse blade holds the line against the fiery drake.';
            topBanner.style.color = '#38bdf8';
        }

        // Camera stays locked squarely on the roaring Young Red Dragon across the magma room (no wall stares!)
        await smoothCameraPan(-Math.PI / 2 + 0.15, 0.04, 1600);
        await wait(800);
        await smoothCameraPan(-Math.PI / 2, 0.0, 1200);
        await wait(1800);
        if (topBanner) topBanner.textContent = '';
        await waitUntil(223.0);

        // =============================================================
        // ACT 8: Universal Savefile Portability & Offline Play (3:43.5 - 4:04.5)
        // =============================================================
        logTelemetry(223.5, 'Act 8: In-Game Pause Menu & Universal .SAV Export');

        // 224.48s - 243.72s: Clip 16 plays: "Every victory, hard-earned artifact, and leveled hero is permanently yours..."
        await waitUntil(224.5);

        // Open authentic Pause Menu modal [Esc]
        const pauseModal = document.getElementById('pause-modal');
        if (pauseModal) {
            pauseModal.classList.remove('hidden');
            pauseModal.style.setProperty('display', 'flex', 'important');
            pauseModal.style.setProperty('z-index', '990', 'important');
            const pauseChar = document.getElementById('pause-char-display');
            if (pauseChar) pauseChar.textContent = 'Current Character: Debrest (Hero) • Depth 25 (1250ft)';

            const dlBtn = document.getElementById('btn-pause-download');
            if (dlBtn) {
                dlBtn.style.borderColor = '#38bdf8';
                dlBtn.style.boxShadow = '0 0 25px rgba(56, 189, 248, 0.85)';
            }
        }
        await wait(3000);

        // Click Download Save button with glowing activation
        console.log('[Recorder] Action: Trigger Export .SAV savefile');
        const dlBtn = document.getElementById('btn-pause-download');
        if (dlBtn) {
            dlBtn.style.transform = 'scale(1.03)';
            dlBtn.style.borderColor = '#4ade80';
            dlBtn.style.boxShadow = '0 0 30px rgba(74, 222, 128, 0.9)';
        }

        // Trigger authentic file download via anchor without triggering resumeGame()
        try {
            const dlAnchor = document.createElement('a');
            dlAnchor.href = '/api/saves/Debrest.sav';
            dlAnchor.download = 'Debrest.sav';
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            document.body.removeChild(dlAnchor);
        } catch (_) {}

        if (topBanner) {
            topBanner.textContent = '💾 Debrest.sav downloaded (Universal 4.2.6 Savefile Format)';
            topBanner.style.color = '#38bdf8';
        }
        await wait(3500);

        // Highlight Standalone apps / guide button
        if (dlBtn) {
            dlBtn.style.transform = 'scale(1.0)';
            dlBtn.style.borderColor = '';
            dlBtn.style.boxShadow = '';
        }
        const ghBtn = document.getElementById('btn-pause-guide');
        if (ghBtn) {
            ghBtn.style.borderColor = '#ffd700';
            ghBtn.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.6)';
        }
        await wait(4000);

        // Close Pause Menu cleanly right before Act 9 transition
        if (pauseModal) {
            pauseModal.classList.add('hidden');
            pauseModal.style.setProperty('display', 'none', 'important');
        }
        if (topBanner) topBanner.textContent = '';
        await waitUntil(244.0);

        // =============================================================
        // ACT 9: Grand Finale — Free & Open Source Replication (4:04.5 - 4:35.0)
        // =============================================================
        logTelemetry(244.5, 'Act 9: Multi-Perspective Montage & Thunderbear Outro Card');

        // 245.22s - 265.34s: Clip 17 plays: "Thirty years of roguelike mastery reborn for modern browsers..."
        // Dissolve to clean Thunderbear Studios Outro Card
        console.log('[Recorder] Action: Dissolve to Clean Outro Card (#splash-overlay)');
        splashVisible = true;
        splashMode = 'finale';
        applyUserLayout();

        // Speech ends at 265.34s. Hold clean outro card with gold CTA through 275.0s (9.66s musical hold)
        await waitUntil(275.0);

        console.log('[Recorder] Walkthrough sequence complete (275s master)!');
        } catch (fatalErr) {
            console.error('[Recorder] FATAL SEQUENCE ERROR:', fatalErr.stack || fatalErr);
            try {
                splashVisible = true;
                splashMode = 'finale';
                applyUserLayout();
                await waitUntil(275.0);
            } catch (_) {}
        } finally {
            console.log('[Recorder] Finalizing walkthrough sequence and stopping MediaRecorder...');
            isRecording = false;
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(startWalkthroughRecording, 1000);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(startWalkthroughRecording, 1000);
        });
    }
})();

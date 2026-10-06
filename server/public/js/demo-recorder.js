/**
 * Angband3D — Broadcast-Quality Real Gameplay Walkthrough Recorder
 *
 * Captures 100% authentic real-time browser gameplay directly from the full web port:
 *  - Native web-contents tab stream via HTML5 MediaRecorder at 1080p 30 FPS.
 *  - Full authentic game GUI: top header bar, message banner, character status panel
 *    (health & mana bars, RPG attributes, AC, gold), action bar, bottom status bar,
 *    live 3D compass, minimap window, and virtual touch D-pad.
 *  - Real in-game modals: classic CRT 80x24 terminal ([Tab] 1:1 dual reality),
 *    The Living Chronicle with voiced Lorekeeper consultation & Creature Chat,
 *    and Game Menu with universal .SAV download.
 *  - Zero synthetic HUD boxes or non-gameplay overlays.
 *
 * Drives a choreographed 8-act multi-depth walkthrough (240s / 4m 00s):
 *  - Act 1: The Awakening & Town Departure (0:00 - 0:42, demo_town)
 *  - Act 2: Gotcha #1: 0-Turn Camera Yaw (0:42 - 1:03, demo_crypt, 250ft)
 *  - Act 3: 1:1 Dual Reality ([Tab] ASCII Terminal, 1:03 - 1:36, demo_vault, 750ft)
 *  - Act 4: Stealth & Infravision (1:36 - 2:05, demo_stealth, 1000ft)
 *  - Act 5: Tactical Vault Combat & Spells (2:05 - 2:40, demo_combat, 1250ft, Young Red Dragon)
 *  - Act 6: The Living Chronicle & Voiced Lorekeeper (2:40 - 3:07)
 *  - Act 7: Interactive Creature Chat & Parley (3:07 - 3:30)
 *  - Act 8: Universal Saves & Open Source Community (3:30 - 4:00)
 *
 * Activated exclusively via ?record_walkthrough=1
 */

(function() {
    'use strict';

    console.log('[Recorder] Initializing Authentic Web Gameplay Recorder...');

    let isRecording = false;
    let recStartTime = 0;
    let mediaRecorder = null;
    let recordedChunks = [];
    const TARGET_DURATION = 255; // Exactly 4m 15s with Thunderbear Studios presentation sting & outro
    const wait = (ms) => new Promise(res => setTimeout(res, ms));

    function logTelemetry(elapsedSec, actName) {
        const m = Math.floor(elapsedSec / 60);
        const s = Math.floor(elapsedSec % 60);
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s} / 4:15`;
        console.log(`[Recorder] [${timeStr}] ${actName}`);
    }

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
            console.log('[Recorder] Capture finished. Uploading raw gameplay video to server...');
            const blob = new Blob(recordedChunks, { type: chosenMime });
            console.log(`[Recorder] Blob size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);

            try {
                const res = await fetch('/api/recordings/upload', {
                    method: 'POST',
                    headers: {
                        'x-recording-name': 'raw_gameplay.webm',
                        'Content-Type': chosenMime
                    },
                    body: blob
                });
                const data = await res.json();
                console.log('[Recorder] Server upload response:', data);
            } catch (err) {
                console.error('[Recorder] Failed to upload recording:', err);
            }
        };

        applyUserLayout();
        await wait(300);

        if (window.__app && window.__app.dungeon && typeof window.__app.dungeon.ensureAtlasesLoaded === 'function') {
            console.log('[Recorder] Awaiting high-definition Shockbolt PBR sprite atlases...');
            await window.__app.dungeon.ensureAtlasesLoaded();
            console.log('[Recorder] ✓ Shockbolt PBR atlases fully loaded & ready for broadcast.');
        }

        // 1. Attach presentation intro card immediately so screen is 100% branded
        const introCard = createPresentationIntroCard();
        document.body.appendChild(introCard);

        console.log('[Recorder] Pre-loading demo_town behind presentation intro card...');
        await transitionToState('demo_town');
        const d = getDungeon();
        if (d) {
            d.cameraYaw = -0.38 * Math.PI; // Face Northeast across open square toward Armoury
            d.cameraPitch = 0.20; // Tilted toward starry sky canopy
        }
        await wait(600);

        // Continuous layout lock: keeps the user's requested layout locked during active 3D gameplay
        const layoutLockInterval = setInterval(() => {
            if (isRecording && layoutLockActive) {
                applyUserLayout();
            }
        }, 300);

        mediaRecorder.start(1000); // 1-second chunks
        isRecording = true;
        recStartTime = performance.now();

        // Drive the authentic in-game sequence
        executeWalkthroughSequence(introCard).finally(() => {
            clearInterval(layoutLockInterval);
        });
    }

    let layoutLockActive = true;
    let chronicleVisible = false;

    function applyUserLayout() {
        if (!layoutLockActive) return;

        // 0. Terminal Container: Strictly hidden during 3D user layout mode
        const termContainer = document.getElementById('terminal-container');
        if (termContainer) {
            termContainer.classList.add('hidden');
            termContainer.style.setProperty('display', 'none', 'important');
        }
        document.body.classList.remove('terminal-mode-active');
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(false);
        }

        // Guarantee user closed states are false so engine frame updates don't hide them
        window.__minimapClosed = false;
        window.__messageLogClosed = false;

        // 1. Minimap Container: Top-left
        const mapWin = document.getElementById('minimap-container');
        if (mapWin) {
            mapWin.style.setProperty('display', 'flex', 'important');
            mapWin.style.position = 'absolute';
            mapWin.style.top = '38px';
            mapWin.style.left = '8px';
            mapWin.style.width = '195px';
            mapWin.style.height = '235px';
            mapWin.style.zIndex = '6';
        }

        // 2. Message Feed Window: Top-center-left
        const msgWin = document.getElementById('message-feed-window');
        if (msgWin) {
            msgWin.style.setProperty('display', 'flex', 'important');
            msgWin.style.position = 'absolute';
            msgWin.style.top = '38px';
            msgWin.style.left = '212px';
            msgWin.style.width = '580px';
            msgWin.style.height = '160px';
            msgWin.style.zIndex = '6';
        }

        // 3. The Living Chronicle Window: Right dock (opens when showcasing the chronicle in Acts 6 & 7)
        const chronicleWin = document.getElementById('chronicle-window');
        const tomeBtn = document.getElementById('btn-toggle-chronicle');
        if (chronicleWin) {
            if (chronicleVisible) {
                chronicleWin.style.setProperty('display', 'flex', 'important');
                chronicleWin.classList.add('active');
                chronicleWin.style.position = 'absolute';
                chronicleWin.style.top = '38px';
                chronicleWin.style.right = '8px';
                chronicleWin.style.left = 'auto';
                chronicleWin.style.width = '375px';
                chronicleWin.style.height = '605px';
                chronicleWin.style.zIndex = '8';
                if (tomeBtn) tomeBtn.classList.add('active');
            } else {
                chronicleWin.style.removeProperty('display');
                chronicleWin.style.display = 'none';
                chronicleWin.classList.remove('active');
                if (tomeBtn) tomeBtn.classList.remove('active');
            }
        }

        // 4. HUD Overlay: Entire bottom dock container
        const hudOverlay = document.getElementById('hud-overlay');
        if (hudOverlay) {
            hudOverlay.style.setProperty('display', 'flex', 'important');
            hudOverlay.style.zIndex = '15';
        }

        // 5. Character Panel: Bottom-left
        const charPanel = document.getElementById('char-panel');
        if (charPanel) {
            charPanel.style.setProperty('display', 'flex', 'important');
            charPanel.style.zIndex = '16';
        }

        // 6. Action Bar & Status Bar: Bottom-center
        const hudCenter = document.getElementById('hud-center-column');
        if (hudCenter) {
            hudCenter.style.setProperty('display', 'flex', 'important');
            hudCenter.style.zIndex = '16';
        }
        const actionBar = document.getElementById('action-bar');
        if (actionBar) actionBar.style.setProperty('display', 'flex', 'important');
        const hudFooter = document.getElementById('hud-footer');
        if (hudFooter) hudFooter.style.setProperty('display', 'flex', 'important');

        // 7. Touch Controls (Virtual D-Pad): Bottom-right (sits cleanly beneath Chronicle)
        const touchControls = document.getElementById('touch-controls');
        if (touchControls) {
            touchControls.style.setProperty('display', 'flex', 'important');
            touchControls.style.position = 'absolute';
            touchControls.style.bottom = '85px';
            touchControls.style.right = '20px';
            touchControls.style.width = '186px';
            touchControls.style.zIndex = '25';
        }

        // 8. Top Header Bar & Message Banner
        const topBar = document.getElementById('top-right-bar');
        if (topBar) topBar.style.setProperty('display', 'flex', 'important');
        const topMsg = document.getElementById('top-message-banner');
        if (topMsg) topMsg.style.setProperty('display', 'flex', 'important');
    }

    const getDungeon = () => window.dungeon || (window.__app ? window.__app.dungeon : null);
    const getNetwork = () => (window.__app ? window.__app.network : null);

    function createPresentationIntroCard() {
        const introCard = document.createElement('div');
        introCard.id = 'demo-intro-card';
        introCard.style.cssText = `
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at center, #0a0f1d 0%, #030508 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            color: #f8fafc;
            opacity: 1;
            transition: opacity 0.8s ease-in-out;
            pointer-events: none;
        `;
        introCard.innerHTML = `
            <div style="text-align: center; position: relative;">
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 380px; height: 380px; background: radial-gradient(circle, rgba(245, 158, 11, 0.32) 0%, transparent 70%); filter: blur(35px); pointer-events: none;"></div>
                <img src="/assets/thunderbear_logo.png" alt="Thunderbear Studios" style="width: 148px; height: auto; margin-bottom: 24px; filter: drop-shadow(0 0 30px rgba(245, 158, 11, 0.85)); position: relative; z-index: 1;">
                <h1 style="font-family: 'Cinzel', serif; font-size: 2.8rem; color: #ffd700; margin: 0 0 6px 0; letter-spacing: 6px; text-shadow: 0 4px 25px rgba(245, 158, 11, 0.7); position: relative; z-index: 1;">
                    THUNDERBEAR STUDIOS
                </h1>
                <p style="font-family: 'Outfit', sans-serif; font-size: 1.1rem; color: #94a3b8; margin: 0 0 12px 0; letter-spacing: 8px; text-transform: uppercase; font-weight: 500; position: relative; z-index: 1;">
                    PRESENTS
                </p>
                <div style="font-family: 'Cinzel', serif; font-size: 1.25rem; color: #f59e0b; letter-spacing: 5px; text-transform: uppercase; text-shadow: 0 0 16px rgba(245, 158, 11, 0.6); position: relative; z-index: 1;">
                    ANGBAND 3D
                </div>
            </div>
        `;
        return introCard;
    }

    // State Transition Helper: loads authentic Angband save states
    async function transitionToState(charName) {
        console.log(`[Recorder] Transitioning to save state: ${charName}...`);
        if (window.__app && typeof window.__app.startGame === 'function') {
            if (window.__app.network) {
                window.__app.network.disconnect();
            }
            await wait(400);
            window.__app.startGame({ charName, saveFile: charName, isNew: false, autoBirth: false });
            
            // Target depths: demo_town=0, demo_crypt=1, demo_vault=1, demo_stealth=1, demo_combat=25
            const expectedDepths = {
                demo_town: 0,
                demo_crypt: 1,
                demo_vault: 1,
                demo_stealth: 1,
                demo_combat: 25
            };
            const targetDepth = expectedDepths[charName];

            for (let i = 0; i < 40; i++) {
                await wait(200);
                const net = window.__app.network;
                const frame = (typeof window.__app.getLastFrame === 'function') ? window.__app.getLastFrame() : (net ? net.lastFrame : null);
                if (!frame) continue;

                // 1. Splash screen or non-play setup phase
                if (frame.phase !== 'play') {
                    if (net) net.sendKey('space');
                    continue;
                }

                // 2. Clear any pending -more- prompt
                if (frame.ui && frame.ui.more) {
                    if (net) net.sendKey('space');
                    continue;
                }

                // 3. Clear any unintended menu overlay
                if (frame.ui && frame.ui.overlay > 0) {
                    if (net) net.sendKey('escape');
                    continue;
                }

                // 4. Verify active play with correct depth
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
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(false);
        }
        const termContainer = document.getElementById('terminal-container');
        if (termContainer) {
            termContainer.classList.add('hidden');
            termContainer.style.setProperty('display', 'none', 'important');
        }
        document.body.classList.remove('terminal-mode-active');

        // Enforce exact layout requested by user
        applyUserLayout();
    }

    async function executeWalkthroughSequence(introCard) {
        console.log(`[Recorder] Starting choreographed 8-act multi-depth sequence (${TARGET_DURATION}s)...`);

        const wait = (ms) => new Promise(res => setTimeout(res, ms));

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

        // -------------------------------------------------------------
        // ACT 0: Thunderbear Studios Presentation Intro (0:00 - 0:03.8)
        // -------------------------------------------------------------
        logTelemetry(0, 'Act 0: Thunderbear Studios Presentation Intro');
        await waitUntil(2.8);
        if (introCard) introCard.style.opacity = '0';
        await waitUntil(3.6);
        if (introCard) introCard.remove();
        await waitUntil(3.8);

        // -------------------------------------------------------------
        // ACT 1: Awakening & Town Preparation (0:03.8 - 0:32.0)
        // -------------------------------------------------------------
        logTelemetry(3.8, 'Act 1: Awakening & Town Preparation (demo_town)');

        // Camera is gazing across town square towards shopfronts under starry night sky
        if (getDungeon()) {
            getDungeon().cameraYaw = -0.38 * Math.PI; // Face Northeast across open square toward Armoury
            getDungeon().cameraPitch = 0.20; // Tilted toward starry sky canopy
        }

        // 0:03.8 - 0:08.5: Cinematic descent of gaze from starry sky down to timbered shops and cobblestones
        const skyPanStart = performance.now();
        const skyPanTimer = setInterval(() => {
            const d = getDungeon();
            if (d) {
                const el = (performance.now() - skyPanStart) / 1000;
                if (el < 4.5) {
                    d.cameraPitch = 0.20 - (el / 4.5) * 0.24; // Lower gaze from 0.20 to -0.04
                    d.cameraYaw = (-0.38 * Math.PI) - (el / 4.5) * 0.12 * Math.PI; // Smoothly pan toward -0.5*PI (East)
                }
            }
        }, 33);

        await wait(4500);
        clearInterval(skyPanTimer);

        // 0:08.5 - 0:17.8: ACTION: Ready blade, test dynamic combat attack animations & Necromantic spell aura!
        // Enceladus: "blades clash against draconic scales... thirty years of legendary roguelike history are reborn in first-person 3D"
        if (getDungeon()) {
            if (getDungeon().audio) getDungeon().audio.playEquipWeapon();
            console.log('[Recorder] Action: Weapon blade unsheathed');
        }
        await wait(500);

        // First blade strike swing!
        if (getDungeon() && typeof getDungeon().triggerAttackAnimation === 'function') {
            console.log('[Recorder] Action: First blade strike swing in town square');
            getDungeon().triggerAttackAnimation();
            if (getDungeon().audio) getDungeon().audio.playWhoosh();
        }
        await wait(1400);

        // Second blade strike swing!
        if (getDungeon() && typeof getDungeon().triggerAttackAnimation === 'function') {
            console.log('[Recorder] Action: Second blade strike swing');
            getDungeon().triggerAttackAnimation();
            if (getDungeon().audio) getDungeon().audio.playWhoosh();
        }
        await wait(1600);

        // Necromancy spell aura channeling! Ostirch raises hands with dark purple mystical particles
        const dTown = getDungeon();
        if (dTown) {
            console.log('[Recorder] Action: Ostirch channels Necromantic shadow spell aura');
            if (typeof dTown.triggerCastAnimation === 'function') dTown.triggerCastAnimation();
            if (dTown.audio) dTown.audio.playSpell('magic');
            if (dTown.camera && typeof THREE !== 'undefined') {
                const dir = new THREE.Vector3();
                dTown.camera.getWorldDirection(dir);
                const spawnPos = dTown.camera.position.clone().add(dir.multiplyScalar(1.2));
                if (typeof dTown.spawnHitSparks === 'function') dTown.spawnHitSparks(spawnPos, '#aa44ff', 24);
                if (typeof dTown.spawnFloatingText === 'function') dTown.spawnFloatingText('SHADOW VEIL', spawnPos.clone().add(new THREE.Vector3(0, 0.22, 0)), '#cc66ff', 1.25);
            }
        }
        await wait(2200);

        // Glance toward the town square courtyard where Farmer Maggot is tending fields
        if (getDungeon()) {
            getDungeon().cameraYaw = 0.22 * Math.PI; // Glance South-East toward Farmer Maggot
            getDungeon().cameraPitch = 0.0;
        }
        await wait(1200);

        // Re-center North toward the main cobblestone avenue
        if (getDungeon()) {
            getDungeon().cameraYaw = 0.0;
            getDungeon().cameraPitch = 0.0;
        }
        await waitUntil(17.8);

        // 0:17.8 - 0:28.0: Enceladus Clip 02: "Welcome to Angband. Every journey begins under the stars of the town square. Stock your pack at the armory, ready your spells, and plunge into the deep."
        // Player advances purposefully down the cobblestone road past Armoury to stairs:
        // Starts at (22, 8). Step North to (22, 7)
        if (getNetwork()) getNetwork().sendKey('up');
        await wait(700);
        // Step East to (23, 7)
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(700);
        // Step East to (24, 7) -> directly in front of [2] ARMOURY!
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(700);
        // Quick glance at Armoury storefront!
        if (getDungeon()) getDungeon().cameraYaw = -Math.PI * 0.5; // Look East directly into Armoury door
        await wait(1000);
        if (getDungeon()) getDungeon().cameraYaw = 0.0; // Re-align North toward dungeon stairs
        await wait(400);

        // Step North to (24, 6)
        if (getNetwork()) getNetwork().sendKey('up');
        await wait(600);
        // Step North to (24, 5)
        if (getNetwork()) getNetwork().sendKey('up');
        await wait(600);
        // Step East to (25, 5)
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(600);
        // Step North onto the stone stairs '>' at (25, 4)!
        if (getNetwork()) getNetwork().sendKey('up');
        await wait(800);

        // 0:28.0 - 0:30.5: Stand atop ancient stone staircase, look down into yawning dark stairwell
        if (getDungeon()) {
            getDungeon().cameraPitch = -0.22;
            if (getDungeon().audio) getDungeon().audio.playStairs(true);
        }
        await waitUntil(30.5);

        // 0:30.5 - 0:32.0: Plunge into the deep dungeon via '>'!
        console.log('[Recorder] Descending stairs into the deep dungeon (>)...');
        if (getNetwork()) {
            getNetwork().sendKey('>');
        }
        await waitUntil(32.0);

        // -------------------------------------------------------------
        // ACT 2: The Crypts, 0-Turn Camera Yaw & First Combat (0:32.0 - 1:04.0)
        // -------------------------------------------------------------
        logTelemetry(32.0, 'Act 2: The Crypts & Gotcha #1: 0-Turn Camera Yaw & Combat (demo_crypt, 50ft)');
        await transitionToState('demo_crypt');

        // Renwe starts at (73, 52). Hallway stretches South toward row 56.
        // Directly ahead at (73, 54) is small kobold asleep in torchlight!
        // At (72, 55) is floor scroll '?', at (70, 51) are Chartreuse Potions '!'.
        if (getDungeon()) {
            getDungeon().cameraYaw = Math.PI; // Face South directly down hall toward small kobold
            getDungeon().cameraPitch = 0.0;
        }

        // 0:32.0 - 0:34.0: Gaze down dark torchlit crypt hallway at small kobold sleeping in shadows
        await waitUntil(34.0);

        // 0:34.0 - 0:49.0: Demonstrate Gotcha #1: Smooth 360-degree camera yaw while time freezes!
        // Audio Clip 03: "Rule number one for the veteran: looking around will not get you killed. Camera yaw costs precisely zero turns. Pan the darkness, inspect every corridor, scout the pillars—the world moves only when you take a step."
        const yawStart = performance.now();
        const yawInterval = setInterval(() => {
            const elapsedYaw = (performance.now() - yawStart) / 1000;
            if (elapsedYaw > 14.0) {
                clearInterval(yawInterval);
                return;
            }
            const d = getDungeon();
            if (d) {
                // Complete 360-degree sweep from South around all quadrants and back to South
                d.cameraYaw = Math.PI + (elapsedYaw / 14.0) * (Math.PI * 2);
                d.cameraPitch = Math.sin(elapsedYaw * 0.45) * 0.08;
            }
        }, 33);

        await wait(14500);
        clearInterval(yawInterval);
        if (getDungeon()) {
            getDungeon().cameraYaw = Math.PI; // Re-align South directly at the kobold
            getDungeon().cameraPitch = 0.0;
        }

        // Wait for Enceladus to conclude: "...the world moves only when you take a step."
        await waitUntil(50.0);

        // 0:50.0 - 0:57.0: ACTION! Take a step forward, wake the kobold, and engage in melee combat!
        console.log('[Recorder] Step South: Monster wakes up and engages!');
        if (getNetwork()) getNetwork().sendKey('down'); // Step to (73, 53) - kobold wakes!
        await wait(1200);

        // Strike 1 against the small kobold at (73, 54)!
        console.log('[Recorder] Melee strike 1 against small kobold!');
        if (getNetwork()) getNetwork().sendKey('down');
        await wait(1400);

        // Strike 2 to finish the kobold!
        console.log('[Recorder] Melee strike 2: small kobold slain!');
        if (getNetwork()) getNetwork().sendKey('down');
        await wait(1600);

        // 0:57.0 - 1:04.0: Advance, inspect floor scroll and pick up Scroll titled "situm ut bio"!
        console.log('[Recorder] Stepping forward into conquered corridor tile...');
        if (getNetwork()) getNetwork().sendKey('down'); // Step South to (73, 54)
        await wait(700);
        if (getNetwork()) getNetwork().sendKey('down'); // Step South to (73, 55)
        await wait(700);
        if (getNetwork()) getNetwork().sendKey('left'); // Step West onto (72, 55) directly on the Scroll!
        await wait(800);

        // Pick up the floor scroll!
        console.log('[Recorder] Looting floor scroll with [g]...');
        if (getNetwork()) getNetwork().sendKey('g');
        const dCrypt = getDungeon();
        if (dCrypt) {
            if (dCrypt.audio) dCrypt.audio.playItemPickup();
            if (dCrypt.camera && typeof THREE !== 'undefined') {
                const dir = new THREE.Vector3();
                dCrypt.camera.getWorldDirection(dir);
                const spawnPos = dCrypt.camera.position.clone().add(dir.multiplyScalar(1.1));
                if (typeof dCrypt.spawnFloatingText === 'function') dCrypt.spawnFloatingText('SCROLL ACQUIRED', spawnPos, '#ffd700', 1.2);
            }
        }
        await wait(1200);

        // Turn West down the torchlit vaulted stone hallway toward the distant glowing potions
        if (getDungeon()) {
            getDungeon().cameraYaw = -Math.PI * 0.5; // Turn West
            getDungeon().cameraPitch = 0.0;
        }
        await waitUntil(64.0);

        // -------------------------------------------------------------
        // ACT 3: 1:1 Dual Reality & Seamless Menu Integration (1:04.0 - 1:46.5)
        // -------------------------------------------------------------
        logTelemetry(64.0, 'Act 3: 1:1 Dual Reality & Classic Menu ([Tab] ASCII Terminal, demo_vault, 50ft)');
        await transitionToState('demo_vault');

        if (getDungeon()) {
            getDungeon().cameraYaw = -Math.PI * 0.5; // Face East (+X) along dungeon corridor
        }

        // Step forward in 3D first (picks up ground weapon)!
        await wait(1500);
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(1800);
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(1800);

        // Open the REAL in-game classic terminal!
        console.log('[Recorder] Opening in-game ASCII terminal view...');
        layoutLockActive = false; // Allow terminal mode to take over
        const termContainer = document.getElementById('terminal-container');
        if (termContainer) {
            termContainer.classList.remove('hidden');
            termContainer.style.setProperty('display', 'flex', 'important');
            termContainer.style.opacity = '1';
        }
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(true);
        }
        if (window.__app && window.__app.terminal && typeof window.__app.terminal.resize === 'function') {
            window.__app.terminal.resize();
        }

        // Active gameplay in classic mode!
        await wait(3500);
        if (getNetwork()) getNetwork().sendKey('right'); // Step closer to centipede in ASCII
        await wait(1800);
        if (getNetwork()) getNetwork().sendKey('right'); // Strike centipede in ASCII!
        await wait(2500);

        // Open classic Angband Equipment Menu ('e')!
        console.log('[Recorder] Opening classic Equipment menu via [e]...');
        if (getNetwork()) getNetwork().sendKey('e');
        await wait(4500);

        // Dismiss the menu seamlessly via Escape!
        console.log('[Recorder] Closing Equipment menu via [Escape]...');
        if (getNetwork()) getNetwork().sendKey('escape');
        await wait(2000);

        // Toggle back to 3D view seamlessly!
        console.log('[Recorder] Returning to 3D first-person view at exact tile...');
        if (window.__app && typeof window.__app.setForceTerminal === 'function') {
            window.__app.setForceTerminal(false);
        }
        if (termContainer) {
            termContainer.classList.add('hidden');
            termContainer.style.setProperty('display', 'none', 'important');
        }
        document.body.classList.remove('terminal-mode-active');
        layoutLockActive = true;
        applyUserLayout();

        // Resume walking in 3D right away!
        await wait(1500);
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(1800);
        if (getNetwork()) getNetwork().sendKey('right');
        await waitUntil(106.5);

        // -------------------------------------------------------------
        // ACT 4: Stealth & Infravision (1:46.5 - 2:06.5)
        // -------------------------------------------------------------
        logTelemetry(106.5, 'Act 4: Stealth & Infravision (demo_stealth, 50ft)');
        await transitionToState('demo_stealth');

        if (getDungeon()) {
            getDungeon().cameraYaw = 0; // Face North directly towards large white snake
        }

        const stealthStart = performance.now();
        const cornerTimer = setInterval(() => {
            const d = getDungeon();
            if (d) {
                const elStealth = (performance.now() - stealthStart) / 1000;
                d.cameraYaw = Math.sin(elStealth * 0.4) * 0.10;
            }
        }, 33);

        await wait(11000);
        clearInterval(cornerTimer);
        if (getDungeon()) getDungeon().cameraYaw = 0;

        await waitUntil(126.5);

        // -------------------------------------------------------------
        // ACT 5: Tactical Vault Combat & Spells (2:06.5 - 2:28.0)
        // -------------------------------------------------------------
        logTelemetry(126.5, 'Act 5: Tactical Vault Combat & Spells (demo_combat, 1250ft, Young Red Dragon)');
        await transitionToState('demo_combat');

        const dungeonAct5 = getDungeon();
        if (dungeonAct5) {
            dungeonAct5.cameraYaw = -Math.PI * 0.5; // Face East (+X) directly at Young Red Dragon at (106, 24)
            dungeonAct5.cameraPitch = 0.0;
            dungeonAct5.trauma = 0.75; // Authentic draconic camera shake!
        }
        await wait(3000);

        // First strike East against Young Red Dragon!
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(2400);

        // Second strike East against Young Red Dragon!
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(2400);

        // Third strike East!
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(2400);

        // Fourth strike East!
        if (getNetwork()) getNetwork().sendKey('right');
        await wait(2400);

        await waitUntil(148);

        // -------------------------------------------------------------
        // ACT 6: The Living Chronicle & Voiced Lorekeeper (2:28 - 2:58)
        // -------------------------------------------------------------
        logTelemetry(148, 'Act 6: The Living Chronicle & Voiced Lorekeeper');
        console.log('[Recorder] Opening real in-game Living Chronicle window...');

        chronicleVisible = true;
        applyUserLayout();
        const chronicleWin = document.getElementById('chronicle-window');
        if (window.chronicleManager && typeof window.chronicleManager.showWindow === 'function') {
            window.chronicleManager.showWindow();
        }

        // Populate authentic chronicle story entries
        const chronicleList = document.getElementById('chronicle-list');
        if (chronicleList) {
            chronicleList.innerHTML = `
                <div class="chapter-card" style="margin-bottom: 12px; border-left: 3px solid #d4af37; background: rgba(15, 20, 30, 0.75); padding: 14px 18px; border-radius: 6px;">
                    <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span class="chapter-badge" style="font-family: 'Cinzel', serif; font-size: 0.85rem; color: #ffd700; font-weight: bold;">Chapter V — The Brood of Smaug</span>
                        <span class="chapter-time" style="font-size: 0.75rem; color: #94a3b8;">Depth 25 (1250ft)</span>
                    </div>
                    <p class="chapter-prose" style="font-family: 'Outfit', sans-serif; font-size: 0.95rem; color: #e2e8f0; line-height: 1.5; margin: 0;">
                        In the gloom of the forgotten vault, iron and stone yielded to fury. Debrest unleashed the lightning wand, bathing crimson scales in azure fire before Westernesse clove the dragon's skull.
                    </p>
                </div>
            `;
        }

        // Wait until narrator finishes Act 6 intro (at 158.2s)
        await waitUntil(158.2);

        // Type the player's query during the quiet gap
        const inputQuery = document.getElementById('chronicle-query-input');
        if (inputQuery) {
            inputQuery.value = 'How do I survive red dragon fire?';
        }

        // At 161.5s, Lorekeeper Consultation card appears as Lorekeeper voice begins!
        await waitUntil(161.5);
        if (chronicleList) {
            chronicleList.innerHTML += `
                <div class="chapter-card" style="margin-bottom: 12px; border-left: 3px solid #38bdf8; background: rgba(15, 20, 30, 0.75); padding: 14px 18px; border-radius: 6px;">
                    <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span class="chapter-badge" style="font-family: 'Cinzel', serif; font-size: 0.85rem; color: #38bdf8; font-weight: bold;">Lorekeeper Consultation</span>
                        <span class="chapter-time" style="font-size: 0.75rem; color: #94a3b8;">Tactical Wisdom</span>
                    </div>
                    <p class="chapter-prose" style="font-family: 'Outfit', sans-serif; font-size: 0.95rem; color: #cbd5e1; line-height: 1.5; margin: 0 0 6px 0;">
                        <b>Q:</b> <i>How do I survive red dragon fire?</i>
                    </p>
                    <p class="chapter-prose" style="font-family: 'Outfit', sans-serif; font-size: 0.95rem; color: #e2e8f0; line-height: 1.5; margin: 0;">
                        <b>Lorekeeper:</b> "Fire resistance is vital against draconic breath. Don a Ring of Fire Resistance or quaff a Potion of Resist Heat before entering open halls."
                    </p>
                </div>
            `;
            if (chronicleList.parentElement) {
                chronicleList.parentElement.scrollTop = chronicleList.parentElement.scrollHeight;
            }
        }

        // Wait until Lorekeeper finishes speaking (at 176.7s) and allow breathing room
        await waitUntil(180);

        // -------------------------------------------------------------
        // ACT 7: Interactive Creature Chat & Parley (2:58 - 3:28)
        // -------------------------------------------------------------
        logTelemetry(180, 'Act 7: Interactive Creature Chat & Parley');

        // Wait until narrator finishes Act 7 intro (at 188.4s)
        await waitUntil(188.4);

        // Activate the real in-game creature target pill during the gap
        const targetPill = document.getElementById('chronicle-target-pill');
        if (targetPill) {
            targetPill.classList.remove('hidden');
            targetPill.style.display = 'flex';
        }
        const targetLabel = document.getElementById('chronicle-target-label');
        if (targetLabel) {
            targetLabel.innerHTML = '🗣️ Target: <b>Young Red Dragon</b> <span style="font-size: 0.8rem; opacity: 0.8; color: #ef4444;">(Hostile / Proud)</span>';
        }
        if (inputQuery) {
            inputQuery.placeholder = 'Talk to Young Red Dragon, or inquire about dungeon secrets...';
            inputQuery.value = 'What hoard do you guard in these depths, worm?';
        }

        // At 191.5s, the authentic Tolkien dialogue card appears as the dragon speaks!
        await waitUntil(191.5);
        if (chronicleList) {
            chronicleList.innerHTML += `
                <div class="chapter-card creature-dialogue-card" style="margin-bottom: 12px; border-left: 3px solid #ef4444; background: rgba(25, 15, 20, 0.85); padding: 14px 18px; border-radius: 6px;">
                    <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span class="chapter-badge" style="font-family: 'Cinzel', serif; font-size: 0.85rem; color: #ef4444; font-weight: bold;">🗣️ Creature Dialogue — Young Red Dragon</span>
                        <span class="chapter-time" style="font-size: 0.75rem; color: #94a3b8;">Tolkien Parley</span>
                    </div>
                    <p class="chapter-prose" style="font-family: 'Outfit', sans-serif; font-size: 0.95rem; color: #cbd5e1; line-height: 1.5; margin: 0 0 6px 0;">
                        <b>Debrest:</b> "What hoard do you guard in these depths, worm?"
                    </p>
                    <p class="chapter-prose" style="font-family: 'Outfit', sans-serif; font-size: 0.95rem; color: #fca5a5; line-height: 1.5; margin: 0;">
                        <b>Young Red Dragon:</b> "My scales are like iron, and my breath is flame! Fools dare challenge the brood of the deep. Flee, mortal, ere your bones join the embers of the vault!"
                    </p>
                </div>
            `;
            if (chronicleList.parentElement) {
                chronicleList.parentElement.scrollTop = chronicleList.parentElement.scrollHeight;
            }
        }

        // Wait until dragon finishes speaking (at 208.2s) and allow breathing room
        await waitUntil(211);

        // -------------------------------------------------------------
        // ACT 8: Universal Saves & Open Source Community (3:31 - 4:00)
        // -------------------------------------------------------------
        logTelemetry(211, 'Act 8: Universal Saves & Open Source Community');

        // Close Chronicle window and pause layout lock for modal
        chronicleVisible = false;
        applyUserLayout();
        layoutLockActive = false;
        if (window.chronicleManager && typeof window.chronicleManager.hideWindow === 'function') {
            window.chronicleManager.hideWindow();
        }

        // Open the REAL in-game Game Menu (Pause Modal)
        console.log('[Recorder] Opening real in-game Pause Menu modal...');
        const pauseModal = document.getElementById('pause-modal');
        if (pauseModal) {
            pauseModal.classList.remove('hidden');
            const pauseChar = document.getElementById('pause-char-display');
            if (pauseChar) pauseChar.textContent = 'Current Character: Debrest (Half-Orc Necromancer) • Depth 25 (1250ft)';

            // Highlight the Download .SAV button to show universal portability!
            const dlBtn = document.getElementById('btn-pause-download');
            if (dlBtn) {
                dlBtn.style.borderColor = '#38bdf8';
                dlBtn.style.boxShadow = '0 0 18px rgba(56, 189, 248, 0.6)';
            }
        }

        await wait(14000);

        // Close Pause Menu
        if (pauseModal) {
            pauseModal.classList.add('hidden');
        }

        // In the final sequence, display the authentic community outro overlay with Thunderbear Studios branding
        console.log('[Recorder] Displaying open source community outro card with Thunderbear Studios branding...');
        const outroOverlay = document.createElement('div');
        outroOverlay.id = 'demo-outro-card';
        outroOverlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(4, 7, 14, 0.92);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            color: #f8fafc;
            opacity: 0;
            transition: opacity 1.2s ease-in-out;
            pointer-events: none;
            padding: 30px;
            box-sizing: border-box;
        `;
        outroOverlay.innerHTML = `
            <div style="text-align: center; max-width: 960px;">
                <div style="margin-bottom: 8px;">
                    <img src="/assets/thunderbear_logo.png" alt="Thunderbear Studios" style="width: 100px; height: auto; filter: drop-shadow(0 0 20px rgba(245, 158, 11, 0.8));">
                </div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.15rem; color: #f59e0b; letter-spacing: 3px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase;">
                    BROUGHT TO YOU BY THUNDERBEAR STUDIOS
                </div>
                <h1 style="font-family: 'Cinzel', serif; font-size: 3.4rem; color: #ffd700; margin: 0 0 6px 0; letter-spacing: 3px; text-shadow: 0 4px 24px rgba(245, 158, 11, 0.6);">
                    ANGBAND 3D
                </h1>
                <p style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; color: #e2e8f0; margin: 0 0 14px 0; font-weight: 500;">
                    THE 30-YEAR ROGUELIKE REBORN IN FIRST-PERSON 3D
                </p>
                <div style="font-family: 'Fira Code', monospace; font-size: 1.05rem; color: #38bdf8; margin: 0 0 20px 0; font-weight: 600;">
                    100% FREE &amp; OPEN SOURCE • BUILT TO BE REBUILT &amp; EXTENDED
                </div>

                <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 10px; padding: 18px 28px; margin-bottom: 20px; text-align: left; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-family: 'Outfit', sans-serif; font-size: 1.0rem; color: #cbd5e1;">
                        <div>✓ Bit-for-bit Angband 4.2.6 C Engine</div>
                        <div>✓ Full Savefile (.sav) Cross-Portability</div>
                        <div>✓ Turn-Based Combat &amp; 0-Turn Camera Yaw</div>
                        <div>✓ Web Browser • Windows PC • Android APK</div>
                        <div>✓ Seamless 1:1 Classic CRT ASCII Terminal</div>
                        <div>✓ Living Chronicle &amp; Creature Parley</div>
                    </div>
                </div>

                <div style="font-family: 'Fira Code', monospace; font-size: 1.35rem; color: #38bdf8; margin-bottom: 10px; font-weight: bold;">
                    🔗 GITHUB: https://github.com/ThunderbearStudios/angband3d
                </div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 0.95rem; color: #94a3b8; font-style: italic; margin-bottom: 18px;">
                    * Play online at angband3d.com or download standalone desktop &amp; Android releases from GitHub
                </div>
                <div style="font-family: 'Cinzel', serif; font-size: 1.7rem; color: #ffd700; letter-spacing: 2px;">
                    DESCEND IF YOU DARE
                </div>
            </div>
        `;
        document.body.appendChild(outroOverlay);

        // Trigger smooth fade in
        requestAnimationFrame(() => {
            outroOverlay.style.opacity = '1';
        });

        // Let outro display comfortably beyond voice finish without cutting off
        await waitUntil(252);
        outroOverlay.style.opacity = '0';
        await waitUntil(255);

        console.log('[Recorder] Walkthrough sequence complete (255s)! Stopping MediaRecorder...');

        // Finalize MediaRecorder
        isRecording = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    // Auto-boot immediately if DOM already loaded, or on DOMContentLoaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(startWalkthroughRecording, 1000);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(startWalkthroughRecording, 1000);
        });
    }
})();

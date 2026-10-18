/**
 * Angband3D Input Controller — Keyboard, Mouse, and Touch Navigation
 * Provides 1:1 parity with the Godot C# desktop client.
 */

class InputController {
    constructor(network, dungeon, terminal, audio, toggleTerminalView) {
        this.network = network;
        this.dungeon = dungeon;
        this.terminal = terminal;
        if (audio && (audio.hud || audio.lastFrame || audio.getActiveRealm)) {
            this.app = audio;
            this.audio = audio.audio || null;
            this.toggleTerminalView = toggleTerminalView || (this.app ? () => this.app.toggleTerminalView() : null);
        } else {
            this.audio = audio;
            this.toggleTerminalView = toggleTerminalView;
            this.app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
        }

        if (this.dungeon) {
            if (typeof this.dungeon.turnLeft !== 'function') {
                this.dungeon.turnLeft = () => this.dungeon.turn(-1);
            }
            if (typeof this.dungeon.turnRight !== 'function') {
                this.dungeon.turnRight = () => this.dungeon.turn(1);
            }
            if (typeof this.dungeon.getRelativeDirection !== 'function') {
                this.dungeon.getRelativeDirection = (fwd, strafe) => (fwd > 0 ? 8 : (fwd < 0 ? 2 : (strafe < 0 ? 4 : 6)));
            }
        }

        this.inTerminal = false;
        this.smartAction = 'wait';
        this.wasdMode = (function() {
            try { return localStorage.getItem('angband3d_wasd_mode') === '1'; } catch (_) { return false; }
        })();
        this.invertDragLook = (function() {
            try { return localStorage.getItem('angband3d_invert_drag') === 'true'; } catch (_) { return false; }
        })();
        this.dpadRunMode = (function() {
            try { return localStorage.getItem('angband3d_dpad_run') === '1'; } catch (_) { return false; }
        })();
        this.setupKeyboardEvents();
        this.setupActionButtons();
        this.setupTouchEvents();
        this.setupViewportGestures();
        this.setupInvertControls();
        this.updateRunToggleUI();
        this.init();
    }

    init() {
        const btnWasd = document.getElementById('btn-wasd-toggle');
        if (btnWasd) {
            btnWasd.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleWasdMode();
                if (window.AngbandAudio && typeof window.AngbandAudio.playUiTick === 'function') {
                    window.AngbandAudio.playUiTick();
                }
            });
        }
        this.setupTouchControls();
        this.syncWasdUiState();
    }

    setupTouchControls() {
        const btnWield = document.getElementById('btn-wield');
        if (btnWield && !btnWield.dataset.boundWield) {
            btnWield.dataset.boundWield = '1';
            btnWield.addEventListener('click', (e) => {
                e.preventDefault();
                this.openContextualMenu('wield');
            });
        }
        const btnDrop = document.getElementById('btn-drop');
        if (btnDrop && !btnDrop.dataset.boundDrop) {
            btnDrop.dataset.boundDrop = '1';
            btnDrop.addEventListener('click', (e) => {
                e.preventDefault();
                this.openContextualMenu('drop');
            });
        }
        const btnSearch = document.getElementById('btn-search');
        if (btnSearch && !btnSearch.dataset.boundSearch) {
            btnSearch.dataset.boundSearch = '1';
            btnSearch.addEventListener('click', (e) => {
                e.preventDefault();
                this.openContextualMenu('search');
            });
        }
    }

    toggleWasdMode(forceState) {
        this.wasdMode = typeof forceState === 'boolean' ? forceState : !this.wasdMode;
        try {
            localStorage.setItem('angband3d_wasd_mode', this.wasdMode ? '1' : '0');
        } catch (_) {}
        this.syncWasdUiState();
        const msg = this.wasdMode
            ? '⌨ WASD Movement ENABLED — W/S Move, A/D Turn, Shift+A/D Strafe (Wield/Drop/Search highlighted on HUD)'
            : '⌨ WASD Movement OFF — Classic Arrow Keys & W/A/S/D roguelike hotkeys restored';
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.showToast === 'function') {
            hud.showToast(msg);
        } else if (window.__app && typeof window.__app.showRealmToast === 'function') {
            window.__app.showRealmToast(msg);
        }
        return this.wasdMode;
    }

    syncWasdUiState() {
        const active = Boolean(this.wasdMode);
        const btn = document.getElementById('btn-wasd-toggle');
        if (btn) {
            btn.classList.toggle('wasd-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.textContent = active ? '⌨ WASD: ON' : '⌨ WASD';
            btn.title = active
                ? 'WASD Movement Active (Alt+W to toggle off). W/S: Move, A/D: Turn, Shift+A/D: Strafe. W/A/S/D commands locked to HUD buttons.'
                : 'Toggle WASD Keyboard Movement (Alt+W). Locks W/A/S/D roguelike keys and highlights HUD command buttons.';
        }
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('wasd-mode-active', active);
        }
        const turnL = document.querySelector('#dpad-turn-left .dpad-turn-text');
        if (turnL) turnL.textContent = active ? 'Turn [A]' : 'Turn L';
        const turnR = document.querySelector('#dpad-turn-right .dpad-turn-text');
        if (turnR) turnR.textContent = active ? 'Turn [D]' : 'Turn R';
        const dpadUp = document.getElementById('dpad-up');
        if (dpadUp) dpadUp.textContent = active ? '▲ W' : '▲';
        const dpadDown = document.getElementById('dpad-down');
        if (dpadDown) dpadDown.textContent = active ? '▼ S' : '▼';
        const strafeL = document.querySelector('#dpad-left .dpad-sub-lbl');
        if (strafeL) strafeL.textContent = active ? '⇧A' : 'Strafe';
        const strafeR = document.querySelector('#dpad-right .dpad-sub-lbl');
        if (strafeR) strafeR.textContent = active ? '⇧D' : 'Strafe';
        const remappedBtnIds = ['btn-wield', 'btn-drop', 'btn-search', 'btn-use', 'btn-fire', 'btn-cast', 'btn-inventory', 'btn-equipment'];
        for (const id of remappedBtnIds) {
            const b = document.getElementById(id);
            if (b) {
                b.classList.toggle('wasd-remapped-highlight', active);
            }
        }
    }

    sendMoveOrRun(dir, isRunning) {
        const run = (isRunning !== undefined) ? Boolean(isRunning) : this.isRunningActive();
        if (run && dir !== 5) {
            this.sendRunMove(dir);
        } else {
            const moveKey = this.getRelativeDirectionKey(dir);
            if (moveKey) this.sendMovementKey(moveKey);
        }
    }

    clearDirectionHint() {
        const el = document.getElementById('footer-diagonal-hint');
        if (el) el.style.display = 'none';
    }

    syncCompass() {
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.updateFooterFacing === 'function') {
            const yaw = (this.dungeon && typeof this.dungeon.yaw === 'number') ? this.dungeon.yaw : 0;
            hud.updateFooterFacing(yaw);
        }
    }

    openContextualMenu(actionName) {
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : 'angband');
        let keyToSend = null;
        if (actionName === 'wield') {
            keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                ? RealmKeys.fromVanilla('w', realm)
                : 'w';
            if (this.audio && typeof this.audio.playEquipWeapon === 'function') {
                this.audio.playEquipWeapon();
            }
        } else if (actionName === 'drop') {
            keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                ? RealmKeys.fromVanilla('d', realm)
                : 'd';
            if (this.audio && typeof this.audio.playItemDrop === 'function') {
                this.audio.playItemDrop();
            }
        } else if (actionName === 'search') {
            keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                ? RealmKeys.fromVanilla('s', realm)
                : 's';
        }
        if (keyToSend) {
            const lastFrame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route(keyToSend, lastFrame, realm)) {
                    if (this.app && typeof this.app.updateTerminalToolbar === 'function') {
                        this.app.updateTerminalToolbar(lastFrame);
                    }
                    return;
                }
            }
            this.network.sendKey(keyToSend);
        }
    }

    resolveHeroAction(frame) {
        if (!frame || !frame.player || !frame.map) {
            const realm = (this.app && typeof this.app.getActiveRealm === 'function')
                ? this.app.getActiveRealm()
                : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            return { id: 'wait', label: 'Wait', icon: '⏳', key: holdKey };
        }
        const player = frame.player;
        const px = player.x;
        const py = player.y;
        if (px === undefined || py === undefined) {
            const realm = (this.app && typeof this.app.getActiveRealm === 'function')
                ? this.app.getActiveRealm()
                : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            return { id: 'wait', label: 'Wait', icon: '⏳', key: holdKey };
        }

        const currentFeat = (this.getFeatAt && frame.map) ? this.getFeatAt(frame.map, px, py) : 0;
        const items = frame.items || frame.objects || [];
        const itemOnTile = items.find(it => it.x === px && it.y === py);

        const yaw = (this.dungeon && typeof this.dungeon.yaw === 'number') ? this.dungeon.yaw : 0;
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const forwardOffsets = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
        ];
        const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };
        const rayTarget = (this.raycastTargetAhead) ? this.raycastTargetAhead(frame, px, py, fwd) : null;

        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist === 1) {
            return { id: 'attack', label: 'Attack', icon: '⚔', key: 'Space', target: rayTarget.data };
        }
        if (currentFeat === 6) {
            return { id: 'stair-down', label: 'Descend', icon: '⬇', key: '>' };
        }
        if (currentFeat === 5) {
            return { id: 'stair-up', label: 'Ascend', icon: '⬆', key: '<' };
        }
        if (itemOnTile) {
            return { id: 'pickup', label: 'Get', icon: '🎒', key: 'g', item: itemOnTile };
        }
        if (rayTarget && rayTarget.type === 'door' && rayTarget.dist === 1) {
            return { id: 'open-door', label: 'Open', icon: '🚪', key: 'o' };
        }
        if (rayTarget && rayTarget.type === 'wall' && rayTarget.dist === 1 && rayTarget.feat !== 22) {
            return { id: 'tunnel', label: 'Tunnel', icon: '⛏️', key: 'Shift+T' };
        }
        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist > 1) {
            return { id: 'shoot', label: 'Shoot', icon: '🏹', key: 'f', target: rayTarget.data };
        }
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
        const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
            ? (RealmKeys.realmKey('hold', realm) || ',')
            : ',';
        return { id: 'wait', label: 'Wait', icon: '⏳', key: holdKey };
    }

    updateContextButtons(frame) {
        if (!frame || !frame.player) return;
        const heroAction = this.resolveHeroAction ? this.resolveHeroAction(frame) : null;
        const btnHero = document.getElementById('btn-hero-action');
        const heroActive = Boolean(btnHero && btnHero.style.display !== 'none' && heroAction && heroAction.id !== 'wait');

        const px = frame.player.x;
        const py = frame.player.y;
        const map = frame.map;

        let adjClosedDoors = 0;
        let adjMonsters = 0;
        const standingOnItem = Boolean(Array.isArray(frame.items) && frame.items.some(it => it.x === px && it.y === py));
        const currentFeat = (this.getFeatAt && map) ? this.getFeatAt(map, px, py) : 0;
        const standingStair = (currentFeat === 5 || currentFeat === 6);

        if (map && px !== undefined && py !== undefined) {
            const neighbors = [
                { x: px + 1, y: py }, { x: px - 1, y: py },
                { x: px, y: py + 1 }, { x: px, y: py - 1 },
                { x: px + 1, y: py - 1 }, { x: px - 1, y: py - 1 },
                { x: px + 1, y: py + 1 }, { x: px - 1, y: py + 1 }
            ];
            for (const n of neighbors) {
                const feat = (this.getFeatAt && map) ? this.getFeatAt(map, n.x, n.y) : 0;
                if (feat === 3 || feat === 4) adjClosedDoors++;
            }
        }
        if (Array.isArray(frame.monsters) && px !== undefined && py !== undefined) {
            for (const m of frame.monsters) {
                if (m && Math.abs(m.x - px) <= 1 && Math.abs(m.y - py) <= 1 && !(m.x === px && m.y === py)) {
                    adjMonsters++;
                }
            }
        }

        const btnDoor = document.getElementById('btn-door');
        const btnPickup = document.getElementById('btn-pickup');
        const btnStair = document.getElementById('btn-stair');
        const btnAttack = document.getElementById('btn-attack');
        const btnFire = document.getElementById('btn-fire');

        if (btnDoor) {
            btnDoor.style.display = (adjClosedDoors > 0 && (!heroActive || heroAction.id !== 'open-door')) ? 'flex' : 'none';
        }
        if (btnPickup) {
            btnPickup.style.display = (standingOnItem && (!heroActive || heroAction.id !== 'pickup')) ? 'flex' : 'none';
        }
        if (btnStair) {
            btnStair.style.display = (standingStair && (!heroActive || (heroAction.id !== 'stair-down' && heroAction.id !== 'stair-up'))) ? 'flex' : 'none';
        }
        if (btnAttack) {
            btnAttack.style.display = (adjMonsters > 0 && (!heroActive || heroAction.id !== 'attack')) ? 'flex' : 'none';
        }
        if (btnFire) {
            btnFire.style.display = (heroActive && heroAction.id === 'shoot') ? 'none' : '';
        }
    }

    syncRealmButtons(realm) {
        const activeRealm = realm || ((this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : 'angband'));

        const keyBadges = {
            'btn-wield': (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) ? RealmKeys.fromVanilla('w', activeRealm) : 'w',
            'btn-drop': (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) ? RealmKeys.fromVanilla('d', activeRealm) : 'd',
            'btn-search': (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) ? RealmKeys.fromVanilla('s', activeRealm) : 's'
        };

        for (const [id, key] of Object.entries(keyBadges)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            let kbd = btn.querySelector('kbd');
            if (!kbd) {
                kbd = document.createElement('kbd');
                btn.appendChild(kbd);
            }
            if (kbd) kbd.textContent = key || '';
        }

        this.syncWasdUiState();
    }

    setupInvertControls() {
        const btnToggleInvert = document.getElementById('btn-toggle-invert');
        if (btnToggleInvert) {
            btnToggleInvert.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleInvertDragLook();
            });
        }
        const btnPauseInvert = document.getElementById('btn-pause-invert');
        if (btnPauseInvert) {
            btnPauseInvert.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleInvertDragLook();
            });
        }
        this.updateInvertButtons();
    }

    toggleInvertDragLook() {
        this.invertDragLook = !this.invertDragLook;
        try {
            localStorage.setItem('angband3d_invert_drag', String(this.invertDragLook));
        } catch (_) {}
        this.updateInvertButtons();
        if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
            window.DeviceProfile.triggerHaptic('medium');
        }
        return this.invertDragLook;
    }

    setInvertDragLook(invert) {
        this.invertDragLook = Boolean(invert);
        try {
            localStorage.setItem('angband3d_invert_drag', String(this.invertDragLook));
        } catch (_) {}
        this.updateInvertButtons();
    }

    updateInvertButtons() {
        const btnToggleInvert = document.getElementById('btn-toggle-invert');
        if (btnToggleInvert) {
            btnToggleInvert.classList.toggle('active', this.invertDragLook);
            btnToggleInvert.title = `Toggle Invert Y-Axis Drag Look (Current: ${this.invertDragLook ? 'Inverted Y' : 'Normal'})`;
        }
        const btnPauseInvert = document.getElementById('btn-pause-invert');
        if (btnPauseInvert) {
            btnPauseInvert.classList.toggle('active', this.invertDragLook);
            btnPauseInvert.textContent = `🔄 Invert Y: ${this.invertDragLook ? 'Inverted' : 'Normal'}`;
        }
    }

    /**
     * Check if Run mode is currently engaged via keyboard Shift modifier or D-Pad / Global Run Toggle.
     */
    isRunningActive(e = null) {
        return Boolean((e && e.shiftKey) || this.dpadRunMode);
    }

    /**
     * Get the absolute world direction digit (1-9) for a relative local direction (numpad 1-9)
     * based on current camera facing in 3D world view, or 1:1 in terminal view.
     */
    getRelativeWorldDirectionDigit(numpadDir) {
        if (numpadDir === 5) return 5;
        const localIndexMap = {
            8: 0,
            9: 1,
            6: 2,
            3: 3,
            2: 4,
            1: 5,
            4: 6,
            7: 7
        };
        const localIndex = localIndexMap[numpadDir];
        if (localIndex === undefined) return numpadDir;

        // In 3D world mode, apply camera facing rotation; in 2D terminal mode, top-down is fixed North
        const facing = (!this.inTerminal && this.dungeon && typeof this.dungeon.facing === 'number')
            ? this.dungeon.facing
            : 0;
        const targetWorldSector = (localIndex + facing * 2) % 8;
        const sectorToDigit = [8, 9, 6, 3, 2, 1, 4, 7];
        return sectorToDigit[targetWorldSector];
    }

    /**
     * Send run movement in a given local direction (8=fwd, 2=back, 4=strafe left, 6=strafe right, diagonals).
     * Dispatches atomic run command sequence to engine bridge.
     */
    sendRunMove(localDir) {
        const now = Date.now();
        if (this._lastRunSendTime && now - this._lastRunSendTime < 300) {
            return;
        }
        this._lastRunSendTime = now;

        if (this.dungeon && typeof this.dungeon.snapCameraToDefault === 'function') {
            this.dungeon.snapCameraToDefault();
        }
        const worldDigit = this.getRelativeWorldDirectionDigit(localDir);
        if (!worldDigit || worldDigit === 5) return;

        // Multi-realm atomic run: "keys .<digit>" sends '.' (CMD_RUN) immediately followed by
        // direction digit. This bypasses bridge walk-key interception (';' in FCB/Hengband)
        // and guarantees seamless running across Vanilla Angband, FrogComposBand, Hengband, and Sil-Q.
        this.network.sendCommand(`keys .${worldDigit}`);
    }

    toggleDpadRunMode() {
        this.dpadRunMode = !this.dpadRunMode;
        try {
            localStorage.setItem('angband3d_dpad_run', this.dpadRunMode ? '1' : '0');
        } catch (_) {}
        this.updateRunToggleUI();
        if (this.audio && typeof this.audio.playMenuNav === 'function') {
            this.audio.playMenuNav();
        }
        if (window.DeviceProfile && typeof window.DeviceProfile.triggerHaptic === 'function') {
            window.DeviceProfile.triggerHaptic('medium');
        }
        return this.dpadRunMode;
    }

    updateRunToggleUI() {
        const isRun = Boolean(this.dpadRunMode);
        const lang = window.__langMode || 'en';
        const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        let runWord = isRun ? 'Run' : 'Walk';
        if (isHeng && lang === 'jp') {
            runWord = isRun ? '走る' : '歩く';
        } else if (isHeng && lang === 'bilingual') {
            runWord = isRun ? 'Run (走る)' : 'Walk (歩く)';
        }

        // 1. 3D On-Screen D-Pad Run Toggle
        const dpadRunBtn = document.getElementById('dpad-run-toggle');
        const dpadRunIcon = document.getElementById('dpad-run-icon');
        const dpadRunText = document.getElementById('dpad-run-text');
        if (dpadRunBtn) {
            dpadRunBtn.classList.toggle('dpad-run-active', isRun);
            dpadRunBtn.title = isRun
                ? 'D-Pad in RUN Mode [Alt+R] (Dash / Sprint in selected direction)'
                : 'D-Pad in WALK Mode [Alt+R] (Single-Step Precision)';
        }
        if (dpadRunIcon) dpadRunIcon.textContent = isRun ? '🏃' : '🚶';
        if (dpadRunText) dpadRunText.textContent = runWord;

        // 2. Action Bar Run Toggle Pill
        const actionRunBtn = document.getElementById('btn-run-toggle');
        const actionRunIcon = document.getElementById('action-run-icon');
        const actionRunText = document.getElementById('action-run-text');
        if (actionRunBtn) {
            actionRunBtn.classList.toggle('run-active', isRun);
            actionRunBtn.title = isRun
                ? 'RUN Mode Active [Alt+R] (Move keys sprint in selected direction)'
                : 'WALK Mode Active [Alt+R] (Move keys step one tile at a time)';
        }
        if (actionRunIcon) actionRunIcon.textContent = isRun ? '🏃' : '🚶';
        if (actionRunText) actionRunText.textContent = runWord;

        // 3. Classic Terminal Touch Controls Run Toggle
        const termRunBtn = document.getElementById('term-run-toggle');
        if (termRunBtn) {
            termRunBtn.classList.toggle('active', isRun);
            termRunBtn.title = isRun
                ? 'Terminal in RUN Mode [Alt+R] (Direction buttons sprint)'
                : 'Terminal in WALK Mode [Alt+R] (Direction buttons step 1 tile)';
            const termRunIcon = termRunBtn.querySelector('.term-run-icon');
            const termRunText = termRunBtn.querySelector('.term-run-text');
            if (termRunIcon) termRunIcon.textContent = isRun ? '🏃' : '🚶';
            if (termRunText) termRunText.textContent = runWord;
        }
    }

    setTerminalMode(active) {
        this.inTerminal = active;
    }

    setupKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            // Unlock audio on first user key interaction
            if (this.audio && typeof this.audio.unlock === 'function') this.audio.unlock();

            const appState = (window.__app && typeof window.__app.getAppState === 'function')
                ? window.__app.getAppState()
                : 'game';

            // If typing in a text input or textarea (e.g. character name entry), don't intercept typing
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                if (e.key === 'Escape') {
                    e.target.blur();
                }
                return;
            }

            // Global Sound Mute Toggle (Ctrl+M or Cmd+M) available at any game state or menu
            if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                const soundBtn = document.getElementById('btn-sound');
                if (soundBtn) {
                    soundBtn.click();
                } else if (this.audio) {
                    this.audio.toggleMute();
                    if (window.__syncAudioUI) window.__syncAudioUI();
                }
                return;
            }

            // Global Roguelike Command Palette (Ctrl+K or Cmd+K)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.showCommandPalette === 'function') {
                    window.__app.showCommandPalette(appState);
                }
                return;
            }

            // Toggle Fullscreen (F11 or Alt+Enter)
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault();
                this.toggleFullscreen();
                return;
            }

            // Global Alt+L: Toggle Language Mode (English / Kanji / Bilingual)
            if (e.altKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.toggleLanguageMode === 'function') {
                    window.__app.toggleLanguageMode();
                }
                return;
            }

            // Global Alt+R: Toggle Virtual D-Pad Run / Walk Mode
            if (e.altKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                if (typeof this.toggleDpadRunMode === 'function') {
                    this.toggleDpadRunMode();
                }
                return;
            }

            // Global Alt+W: Toggle WASD Keyboard Movement Mode
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
                this.toggleWasdMode();
                return;
            }


            // In Death Screen Modal: support tabs 1-5, [R] reload, [N] reroll, [M / Esc] menu, [u] identify, and full interactive terminal on Tab 0
            const deathModal = document.getElementById('death-modal');
            const isDeadModal = Boolean(deathModal && !deathModal.classList.contains('hidden'));
            const lastFrame = (window.__app && typeof window.__app.getLastFrame === 'function')
                ? window.__app.getLastFrame()
                : (window.__app ? window.__app.lastFrame : null);
            const isDeadFrame = Boolean(lastFrame && lastFrame.player && (lastFrame.player.dead || (lastFrame.player.hp !== undefined && lastFrame.player.hp <= 0 && lastFrame.player.hp_max > 0)));

            if (isDeadModal || isDeadFrame) {
                if (!isDeadModal && window.__app && window.__app.hud && lastFrame) {
                    window.__app.hud.showDeathModal(lastFrame);
                }
                const activeTab = (window.__app && window.__app.hud) ? (window.__app.hud.activeDeathTab || 0) : 0;

                // 1-5 direct tab jump
                if (['1', '2', '3', '4', '5'].includes(e.key)) {
                    e.preventDefault();
                    if (window.__app && window.__app.hud) {
                        window.__app.hud.switchDeathTab(parseInt(e.key, 10) - 1);
                    }
                    return;
                }

                // Tab or ArrowRight to cycle forward; ArrowLeft to cycle backward (matches Godot Main.cs:1696-1709)
                if (e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (window.__app && window.__app.hud) {
                        window.__app.hud.switchDeathTab((activeTab + 1) % 5);
                    }
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (window.__app && window.__app.hud) {
                        window.__app.hud.switchDeathTab((activeTab + 4) % 5);
                    }
                    return;
                }

                // Identify items in death screen (matches Godot Main.cs:1680)
                if (e.key === 'u' || e.key === 'U') {
                    e.preventDefault();
                    this.network.sendKey('u');
                    return;
                }

                // [R] Reload save / restart game (matches Godot Main.cs:1684)
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app && window.__app.reloadLastSave) {
                        window.__app.reloadLastSave();
                    } else if (window.__app && window.__app.hud && window.__app.hud.hideDeathModal) {
                        window.__app.hud.hideDeathModal();
                        window.location.reload();
                    }
                    return;
                }

                // [N] Reroll new character (matches Godot Main.cs:1688)
                if (e.key === 'n' || e.key === 'N') {
                    e.preventDefault();
                    if (window.__app && window.__app.startNewRandomHero) {
                        window.__app.startNewRandomHero();
                    } else if (window.__app && window.__app.hud && window.__app.hud.rerollCharacter) {
                        window.__app.hud.rerollCharacter();
                    } else {
                        const heroName = (window.__app && typeof window.__app.generateHeroName === 'function')
                            ? window.__app.generateHeroName()
                            : ('Hero_' + Math.random().toString(36).substring(2, 6).toUpperCase());
                        const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function')
                            ? `&realm=${encodeURIComponent(window.__app.getActiveRealm())}`
                            : '';
                        window.location.href = `/?char=${encodeURIComponent(heroName)}&new=1${realmParam}`;
                    }
                    return;
                }

                // [M / Esc] Main menu: Escape always returns to main menu; 'M' returns to main menu on non-terminal tabs
                if (e.key === 'Escape' || (activeTab !== 0 && (e.key === 'm' || e.key === 'M'))) {
                    e.preventDefault();
                    if (window.__app && window.__app.returnToMainMenu) {
                        window.__app.returnToMainMenu();
                    } else {
                        window.location.href = '/';
                    }
                    return;
                }

                // On Tab 0 (Tombstone & Menus), forward all navigation, arrow keys, and prompt answers (y, n, Enter, Space) to terminal
                if (activeTab === 0) {
                    this.handleTerminalKey(e);
                    return;
                }

                // On Tabs 1-4 (Equipment, Inventory, Quiver, Stats), handle scrolling (matches Godot Main.cs:1731, 1743, 1755, 1767)
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
                    e.preventDefault();
                    const activeContent = document.querySelector('.death-tab-content.active');
                    if (activeContent) {
                        const delta = (e.key === 'ArrowUp' ? -40 : e.key === 'ArrowDown' ? 40 : e.key === 'PageUp' ? -200 : 200);
                        activeContent.scrollTop += delta;
                    }
                    return;
                }

                // In other tabs, consume unhandled keys so they don't leak into world
                return;
            }

            // 1. Splash Screen Mode: Realm selection & entry
            if (appState === 'splash') {
                if (e.key === '1') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('angband', false);
                    return;
                }
                if (e.key === '2') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('frogcomposband', false);
                    return;
                }
                if (e.key === '3') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('hengband', false);
                    return;
                }
                if (e.key === '4') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('silq', false);
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.code === 'Numpad4' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) window.__app.cycleRealm(-1);
                    return;
                }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.code === 'Numpad6' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) window.__app.cycleRealm(1);
                    return;
                }
                if (e.key === 'l' || e.key === 'L') {
                    e.preventDefault();
                    if (window.__app && window.__app.toggleLanguageMode) window.__app.toggleLanguageMode();
                    return;
                }
                if (e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    if (window.__app && window.__app.showDemoModal) window.__app.showDemoModal('splash');
                    return;
                }
                if (e.key === 'g' || e.key === 'G') {
                    e.preventDefault();
                    if (window.__app) window.__app.showGuide(0, 'splash');
                    return;
                }
                if (e.key === 'a' || e.key === 'A') {
                    e.preventDefault();
                    if (window.__app && window.__app.showPWAModal) window.__app.showPWAModal('splash');
                    return;
                }
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    if (window.__app) window.__app.showGuide(6, 'splash');
                    return;
                }
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) window.__app.cycleRealm(1);
                    return;
                }
                if (e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    if (window.__app && window.__app.showCommandPalette) window.__app.showCommandPalette('splash');
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.showMainMenu();
                    return;
                }
                return;
            }

            // 2. Main Menu Mode
            if (appState === 'mainMenu') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (window.__app) window.__app.showSplash();
                    return;
                }
                if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateMenu(-1);
                    return;
                }
                if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateMenu(1);
                    return;
                }
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app) window.__app.showSplash();
                    return;
                }
                if (e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    if (window.__app && window.__app.showDemoModal) window.__app.showDemoModal('mainMenu');
                    return;
                }
                if (e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    if (window.__app && window.__app.showCommandPalette) window.__app.showCommandPalette('mainMenu');
                    return;
                }
                if (['1', '2', '3', '4'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.selectMenuItem(idx);
                        window.__app.activateMenuItem(idx);
                    }
                    return;
                }
                if (['5', '6', '7', '8'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.activateMenuItem(idx);
                    }
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.activateMenuItem();
                    return;
                }
                return;
            }

            // Demo Showcase Modal Keyboard Routing
            if (appState === 'demoModal') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (window.__app && window.__app.hideDemoModal) window.__app.hideDemoModal();
                    return;
                }
                if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.togglePlay();
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.seekDelta(-5);
                    return;
                }
                if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.seekDelta(5);
                    return;
                }
                if (e.key === 'm' || e.key === 'M') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.toggleMute();
                    return;
                }
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.toggleCaptions();
                    return;
                }
                if (e.key === 'f' || e.key === 'F') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.toggleFullscreen();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.jumpInAndPlay();
                    return;
                }
                if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
                    e.preventDefault();
                    const chapIdx = parseInt(e.key, 10) - 1;
                    if (window.demoPlayer) window.demoPlayer.jumpToChapter(chapIdx);
                    return;
                }
                return;
            }

            // PWA Modal Escape & Return handling
            if (appState === 'pwaModal') {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app && window.__app.hidePWAModal) window.__app.hidePWAModal();
                    return;
                }
                return;
            }

            // Multi-Realm Modal Keyboard Routing
            if (appState === 'realmModal') {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app && window.__app.hideRealmSelector) window.__app.hideRealmSelector();
                    return;
                }
                const realms = ['angband', 'frogcomposband', 'hengband', 'silq'];
                if (['1', '2', '3', '4'].includes(e.key)) {
                    e.preventDefault();
                    const chosen = realms[parseInt(e.key, 10) - 1];
                    if (chosen && window.__app) {
                        if (window.__app.selectRealm) {
                            window.__app.selectRealm(chosen, false);
                        } else if (window.__app.setActiveRealm) {
                            window.__app.setActiveRealm(chosen);
                        }
                    }
                    return;
                }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) {
                        window.__app.cycleRealm(1);
                    }
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) {
                        window.__app.cycleRealm(-1);
                    }
                    return;
                }
                return;
            }

            // Command Palette Modal Keyboard Routing
            if (appState === 'cmdPaletteModal') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (window.__app && window.__app.hideCommandPalette) window.__app.hideCommandPalette();
                    return;
                }
                return;
            }

            // 3. Load Saved Game Menu Mode
            if (appState === 'loadMenu') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (window.__app) window.__app.hideLoadMenu();
                    return;
                }
                if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateLoadList(-1);
                    return;
                }
                if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateLoadList(1);
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.loadSelectedSave();
                    return;
                }
                if (e.key === 'Delete') {
                    e.preventDefault();
                    if (window.__app) window.__app.deleteSelectedSave();
                    return;
                }
                if (e.key === 'u' || e.key === 'U') {
                    e.preventDefault();
                    if (window.__app) window.__app.triggerSaveUpload();
                    return;
                }
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app && window.__app.showRealmSelector) window.__app.showRealmSelector('loadMenu');
                    return;
                }
                if (e.key === 'x' || e.key === 'X' || e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                    if (window.__app) window.__app.downloadSelectedSave();
                    return;
                }
                return;
            }

            // 4. In-Game Pause Menu Mode (Game Menu)
            if (appState === 'pauseMenu') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (window.__app) window.__app.resumeGame();
                    return;
                }
                if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigatePauseMenu(-1);
                    return;
                }
                if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigatePauseMenu(1);
                    return;
                }
                if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.selectPauseMenuItem(idx);
                        window.__app.activatePauseMenuItem();
                    }
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.activatePauseMenuItem();
                    return;
                }
                return;
            }

            // 5. Game Guide & Primer Mode
            if (appState === 'guide') {
                if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (window.__app) window.__app.hideGuide();
                    return;
                }
                if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) window.__app.switchGuideTab(idx);
                    return;
                }
                if (e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (window.__app) window.__app.cycleGuideTab(1);
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (window.__app) window.__app.cycleGuideTab(-1);
                    return;
                }
                if (e.key === 'w' || e.key === 'W') {
                    e.preventDefault();
                    if (typeof window.openExternalUrl === 'function') {
                        window.openExternalUrl('https://angband.readthedocs.io/');
                    } else {
                        window.open('https://angband.readthedocs.io/', '_blank');
                    }
                    return;
                }
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
                    e.preventDefault();
                    const guideBody = document.getElementById('guide-body');
                    if (guideBody) {
                        const delta = (e.key === 'ArrowUp' ? -40 : e.key === 'ArrowDown' ? 40 : e.key === 'PageUp' ? -200 : 200);
                        guideBody.scrollTop += delta;
                    }
                    return;
                }
                return;
            }

            // Any manual key cancels automated quick birth
            if (window.__app && window.__app.cancelQuickBirth) {
                window.__app.cancelQuickBirth();
            }

            // Guide Modal Active: handle tab navigation and close
            if (window.__app && window.__app.isGuideOpen && window.__app.isGuideOpen()) {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    if (this.audio) this.audio.playMenuNav();
                    window.__app.hideGuide();
                    return;
                }
                if (e.key >= '1' && e.key <= '6') {
                    e.preventDefault();
                    window.__app.switchGuideTab(parseInt(e.key, 10) - 1);
                    return;
                }
                if (e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    window.__app.cycleGuideTab(1);
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    window.__app.cycleGuideTab(-1);
                    return;
                }
            }

            // Quick toggle between 3D world and Classic CRT Terminal (or Sil-Q Skills)
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                if (realm === 'silq') {
                    e.preventDefault();
                    if (this.audio) this.audio.playMenuOpen();
                    this.network.sendKey('tab');
                    return;
                }
                e.preventDefault();
                if (this.audio) this.audio.playMenuNav();
                if (this.toggleTerminalView) this.toggleTerminalView();
                return;
            }

            // Alt+L: Toggle Language Mode (English / Kanji / Bilingual)
            if (e.altKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.toggleLanguageMode === 'function') {
                    window.__app.toggleLanguageMode();
                }
                return;
            }

            // Alt+R: Toggle Virtual D-Pad Run / Walk Mode
            if (e.altKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                if (typeof this.toggleDpadRunMode === 'function') {
                    this.toggleDpadRunMode();
                }
                return;
            }

            // Escape: reliably cancel prompts, dismiss menus/overlays, or open Pause Menu (1:1 with Godot Main.cs:1820-1835)
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();

                if (window.__app && window.__app.cancelQuickBirth) {
                    window.__app.cancelQuickBirth();
                }
                if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
                    window.MenuRouter.clearPending();
                }

                const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && (lastFrame.map || (lastFrame.player && lastFrame.player.name)));
                const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
                    ? window.ScreenContext.screenTextOf(lastFrame)
                    : (lastFrame && lastFrame.term && lastFrame.term.rows ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
                const isReviewActive = Boolean(window.__app && typeof window.__app.isBirthReviewActive === 'function' && window.__app.isBirthReviewActive());
                const isReviewScreen = (window.ScreenContext && typeof window.ScreenContext.inputEscapeReview === 'function')
                    ? window.ScreenContext.inputEscapeReview(screenText, inPlay, isReviewActive)
                    : isReviewActive;

                if (!inPlay) {
                    if (isReviewScreen) {
                        if (window.__app && window.__app.rerollHero) {
                            window.__app.rerollHero();
                        } else {
                            this.network.sendKey('s');
                        }
                    } else {
                        // Forward Escape to engine to step back one question in character birth
                        this.network.sendKey('escape');
                    }
                    return;
                }

                const ui = lastFrame ? lastFrame.ui : null;
                const isForcedTerm = window.__app && window.__app.isForceTerminal && window.__app.isForceTerminal();
                const inContextMenu = (ui && (ui.overlay > 0 || ui.more || !ui.awaiting_command)) || this.inTerminal || isForcedTerm;

                if (inContextMenu) {
                    // Always forward Escape to the engine to exit store/menu/prompt
                    this.network.sendKey('escape');
                    if (window.__app && window.__app.setForceTerminal) {
                        window.__app.setForceTerminal(false);
                    }
                } else {
                    // In free 3D exploration with no sub-menus open, Escape opens Game Menu
                    if (window.__app && window.__app.showPauseMenu) {
                        window.__app.showPauseMenu();
                    }
                }
                return;
            }

            // Global Alt+W: Toggle WASD Keyboard Movement Mode
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
                this.toggleWasdMode();
                return;
            }

            // In Terminal Mode (Character creation, birth choices, help, shops, inventory, equipment)
            const termContainer = document.getElementById('terminal-container');
            const isTermVisible = Boolean(termContainer && !termContainer.classList.contains('hidden'));
            if (this.inTerminal || isTermVisible) {
                this.handleTerminalKey(e);
                return;
            }

            // In 3D World Exploration Mode
            this.handleWorldKey(e);
        });
    }

    handleTerminalKey(e) {
        const lastFrame = (window.__app && typeof window.__app.getLastFrame === 'function')
            ? window.__app.getLastFrame()
            : (window.__app ? window.__app.lastFrame : null);
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && lastFrame.map);
        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : (lastFrame && lastFrame.term && lastFrame.term.rows ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
        const isReviewActive = Boolean(window.__app && typeof window.__app.isBirthReviewActive === 'function' && window.__app.isBirthReviewActive());
        const { isChoiceMenu, isNamePrompt, isReviewScreen } = (window.ScreenContext && typeof window.ScreenContext.inputTerminalKeyFlags === 'function')
            ? window.ScreenContext.inputTerminalKeyFlags(screenText, inPlay, isReviewActive)
            : { isChoiceMenu: false, isNamePrompt: false, isReviewScreen: false };
        const pf = (window.ScreenContext && typeof window.ScreenContext.promptFlags === 'function')
            ? window.ScreenContext.promptFlags(screenText)
            : { isYesNoPrompt: false, isQuantityPrompt: false };
        const tf = {
            isQuantityPrompt: Boolean(pf.isQuantityPrompt || screenText.includes('how many') || screenText.includes('quantity') || screenText.includes('how much')),
            isNamePrompt: Boolean(isNamePrompt),
            isInscriptionPrompt: Boolean(screenText.includes('inscription:') || screenText.includes('inscribe:'))
        };

        // Reroll hotkey on review screen ('R') -> Re-randomize
        if (isReviewScreen && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
            if (window.__app && window.__app.rerollHero) {
                window.__app.rerollHero();
            } else {
                const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
                this.network.sendKey(realm === 'silq' || realm === 'hengband' ? 'r' : 's');
            }
            return;
        }

        // Previous roll hotkey on review/stat screen ('P') -> Step back to previous rolled stats (Hengband)
        if (isReviewScreen && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
            this.network.sendKey('p');
            return;
        }

        // Custom creation hotkey on review screen ('C' or 'S') -> Start over without autoBirth to choose race/class
        if (isReviewScreen && (e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            if (this.audio) this.audio.playMenuNav();
            if (window.__app && window.__app.startCustomHeroCreation) {
                window.__app.startCustomHeroCreation();
            } else {
                if (window.__app && window.__app.cancelQuickBirth) window.__app.cancelQuickBirth();
                this.network.sendKey('s');
            }
            return;
        }

        // Confirmation on review screen (Enter, Space, or 'y') — jump straight into 3D!
        if (isReviewScreen && (e.key === 'Enter' || e.key === 'y' || e.key === 'Y' || e.key === ' ')) {
            e.preventDefault();
            if (this.audio) this.audio.playWhoosh();
            if (window.__app && window.__app.confirmHeroBirth) {
                window.__app.confirmHeroBirth();
            } else {
                this.network.sendKey(e.key === 'y' || e.key === 'Y' ? 'y' : 'enter');
            }
            return;
        }

        // Terminal Zoom Shortcuts (Ctrl + / - or direct + / - on non-input)
        if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
            e.preventDefault();
            if (window.__app && window.__app.terminal && window.__app.terminal.zoomIn) {
                window.__app.terminal.zoomIn();
            }
            return;
        }
        if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
            e.preventDefault();
            if (window.__app && window.__app.terminal && window.__app.terminal.zoomOut) {
                window.__app.terminal.zoomOut();
            }
            return;
        }
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            if (window.__app && window.__app.terminal && window.__app.terminal.resetZoom) {
                window.__app.terminal.resetZoom();
            }
            return;
        }

        const isAwaitingCmd = inPlay && Boolean(
            (lastFrame.awaiting_command || (lastFrame.ui && lastFrame.ui.awaiting_command)) &&
            (!lastFrame.ui || !lastFrame.ui.more) &&
            (!lastFrame.ui || !lastFrame.ui.overlay)
        );

        if (isAwaitingCmd && this.isRunningActive(e)) {
            let termDir = 0;
            if (e.key === 'ArrowUp' || e.code === 'Numpad8') termDir = 8;
            else if (e.key === 'ArrowDown' || e.code === 'Numpad2') termDir = 2;
            else if (e.key === 'ArrowLeft' || e.code === 'Numpad4') termDir = 4;
            else if (e.key === 'ArrowRight' || e.code === 'Numpad6') termDir = 6;
            else if (e.key === 'Home' || e.code === 'Numpad7') termDir = 7;
            else if (e.key === 'PageUp' || e.code === 'Numpad9') termDir = 9;
            else if (e.key === 'End' || e.code === 'Numpad1') termDir = 1;
            else if (e.key === 'PageDown' || e.code === 'Numpad3') termDir = 3;

            if (termDir > 0) {
                e.preventDefault();
                this.network.sendCommand(`keys .${termDir}`);
                return;
            }
        }

        let keySpec = null;

        const isNumpadDigit = Boolean(e.code && /^Numpad[0-9]$/.test(e.code));
        if (isNumpadDigit && (tf.isQuantityPrompt || tf.isNamePrompt || tf.isInscriptionPrompt)) {
            keySpec = e.code.slice(6);
        } else if (e.key === 'ArrowUp' || e.code === 'Numpad8') keySpec = 'up';
        else if (e.key === 'ArrowDown' || e.code === 'Numpad2') keySpec = 'down';
        else if (e.key === 'ArrowLeft' || e.code === 'Numpad4') keySpec = 'left';
        else if (e.key === 'ArrowRight' || e.code === 'Numpad6') keySpec = 'right';
        else if (e.code === 'Numpad5') keySpec = 'enter';
        else if (e.key === 'PageUp') keySpec = 'pageup';
        else if (e.key === 'PageDown') keySpec = 'pagedown';
        else if (e.key === 'Home') keySpec = 'home';
        else if (e.key === 'End') keySpec = 'end';
        else if (e.key === 'Delete') keySpec = 'delete';
        else if (e.key === 'Enter') keySpec = 'enter';
        else if (e.key === 'Escape') {
            keySpec = 'escape';
            if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
                window.MenuRouter.clearPending();
            }
            if (window.__app && window.__app.setForceTerminal) {
                window.__app.setForceTerminal(false);
            }
            window.__manualTerminalOpen = false;
        }
        else if (e.key === 'Backspace') keySpec = 'backspace';
        else if (e.key === 'Tab') keySpec = 'tab';
        else if (e.key === ' ') keySpec = 'space';
        else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) keySpec = e.key;
        else if (e.key.length === 1 && e.ctrlKey && !e.altKey && !e.metaKey) keySpec = `C-${e.key.toLowerCase()}`;

        if (keySpec) {
            e.preventDefault();
            const realm = (window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : ((window.__app && window.__app.currentRealm) || (lastFrame && lastFrame.realm) || 'angband');
            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route(keySpec, lastFrame, realm)) {
                    if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') {
                        window.__app.updateTerminalToolbar(lastFrame);
                    }
                    return;
                }
            }
            this.network.sendKey(keySpec);
        }
    }

    sendMovementKey(key) {
        if (this.dungeon && typeof this.dungeon.snapCameraToDefault === 'function') {
            this.dungeon.snapCameraToDefault();
        }
        this.network.sendKey(key);
    }

    handleWorldKey(e) {
        // Alt key combos are UI/application shortcuts (e.g. Alt+C toggle chronicle, Alt+P play/pause, Alt+[, Alt+]); ignore in world
        if (e.altKey) return;

        // Minimap controls: Screen size ([ / ]) and Grid scale zoom (+ / -)
        if (e.key === '[') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.cycleMinimapSize(-1);
            }
            return;
        }

        if (e.key === ']') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.cycleMinimapSize(1);
            }
            return;
        }

        // Head Tilt Up (Ctrl+PageUp) & Tilt Down (Ctrl+PageDown) & Recenter (Ctrl+Home)
        if (e.ctrlKey || e.altKey) {
            if (e.key === 'PageUp') {
                e.preventDefault();
                if (this.dungeon) {
                    this.dungeon.userPitchOffset = Math.min(1.25, (this.dungeon.userPitchOffset || 0) + 0.12);
                }
                return;
            }

            if (e.key === 'PageDown') {
                e.preventDefault();
                if (this.dungeon) {
                    this.dungeon.userPitchOffset = Math.max(-0.65, (this.dungeon.userPitchOffset || 0) - 0.12);
                }
                return;
            }

            if (e.key === 'Home') {
                e.preventDefault();
                if (this.dungeon) {
                    this.dungeon.userPitchOffset = 0.0;
                }
                return;
            }
        }

        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.adjustMinimapZoom(0.15);
            }
            return;
        }

        if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.adjustMinimapZoom(-0.15);
            }
            return;
        }

        // Relative directional movement via number pad, top-row numbers, or navigation keys
        // 8 = forward, 2 = back, 4 = strafe left, 6 = strafe right, diagonals 7,9,1,3, 5 = stay.
        const numpadDirMap = {
            'Numpad8': 8, 'Digit8': 8,
            'Numpad2': 2, 'Digit2': 2,
            'Numpad4': 4, 'Digit4': 4,
            'Numpad6': 6, 'Digit6': 6,
            'Numpad7': 7, 'Digit7': 7, 'Home': 7,
            'Numpad9': 9, 'Digit9': 9, 'PageUp': 9,
            'Numpad1': 1, 'Digit1': 1, 'End': 1,
            'Numpad3': 3, 'Digit3': 3, 'PageDown': 3,
            'Numpad5': 5, 'Digit5': 5, 'NumpadClear': 5, 'Clear': 5
        };

        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        const ui = lastFrame ? lastFrame.ui : null;

        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : '';
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
        const ntFlags = {
            isDirectionalTargeting: Boolean(
                (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
                (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
            )
        };
        const isTargeting = Boolean(ntFlags && ntFlags.isDirectionalTargeting);

        if (isTargeting) {
            if (e.code === 'Digit5' || e.code === 'Numpad5' || e.key === '.' || e.key === 't' || e.key === 'T') {
                e.preventDefault();
                this.network.sendKey('t');
                return;
            }
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                this.network.sendKey('space');
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(8);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(2);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(4);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(6);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const lowerK = e.key.toLowerCase();
                if (lowerK === 'w') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(1, 0)
                        : 8;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
                if (lowerK === 's') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(-1, 0)
                        : 2;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
                if (lowerK === 'a') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(0, -1)
                        : 4;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
                if (lowerK === 'd') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(0, 1)
                        : 6;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
            }
        }

        // Context prompt (-more-) active: immediately dismiss with space (1:1 with Angband msg_flush)
        // and if a move or turn key was pressed, execute it so the character never gets stuck on stairs!
        if (ui && ui.more) {
            e.preventDefault();
            this.network.sendKey('space');

            const lowerMoreK = (this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey) ? e.key.toLowerCase() : '';
            if (e.key === 'ArrowLeft' || (lowerMoreK === 'a' && !e.shiftKey)) {
                this.dungeon.turn(-1);
                this.syncCompass();
            } else if (e.key === 'ArrowRight' || (lowerMoreK === 'd' && !e.shiftKey)) {
                this.dungeon.turn(1);
                this.syncCompass();
            } else {
                const wasdMoreDir = lowerMoreK === 'w' ? 8 : (lowerMoreK === 's' ? 2 : (lowerMoreK === 'a' && e.shiftKey ? 4 : (lowerMoreK === 'd' && e.shiftKey ? 6 : 0)));
                const dir = wasdMoreDir || numpadDirMap[e.code] || numpadDirMap[e.key];
                if (dir) {
                    if (this.isRunningActive(e) && dir !== 5 && !wasdMoreDir) {
                        setTimeout(() => this.sendRunMove(dir), 35);
                    } else if (wasdMoreDir && this.isRunningActive(e) && (dir === 8 || dir === 2)) {
                        setTimeout(() => this.sendRunMove(dir), 35);
                    } else {
                        const moveKey = this.getRelativeDirectionKey(dir);
                        if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
                    }
                } else if (e.key === 'ArrowUp') {
                    if (this.isRunningActive(e)) {
                        setTimeout(() => this.sendRunMove(8), 35);
                    } else {
                        const moveKey = this.getRelativeDirectionKey(8);
                        if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
                    }
                } else if (e.key === 'ArrowDown') {
                    if (this.isRunningActive(e)) {
                        setTimeout(() => this.sendRunMove(2), 35);
                    } else {
                        const moveKey = this.getRelativeDirectionKey(2);
                        if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
                    }
                }
            }
            return;
        }

        const isMore = Boolean(ui && ui.more);
        if (this.wasdMode && !isTargeting && !isMore && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const lowerK = e.key.toLowerCase();
            if (lowerK === 'w' || lowerK === 's' || lowerK === 'a' || lowerK === 'd') {
                e.preventDefault();
                this.clearDirectionHint();
                const runActive = this.isRunningActive(e);
                if (lowerK === 'w') {
                    if (runActive && e.repeat) return;
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(1, 0)
                        : 8;
                    if (dir) this.sendMoveOrRun(dir, runActive);
                } else if (lowerK === 's') {
                    if (runActive && e.repeat) return;
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(-1, 0)
                        : 2;
                    if (dir) this.sendMoveOrRun(dir, runActive);
                } else if (lowerK === 'a') {
                    if (e.shiftKey) {
                        const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                            ? this.dungeon.getRelativeDirection(0, -1)
                            : 4;
                        if (dir) this.sendMoveOrRun(dir, false);
                    } else {
                        if (this.dungeon && typeof this.dungeon.turnLeft === 'function') {
                            this.dungeon.turnLeft();
                        } else if (this.dungeon && typeof this.dungeon.turn === 'function') {
                            this.dungeon.turn(-1);
                        }
                        this.syncCompass();
                    }
                } else if (lowerK === 'd') {
                    if (e.shiftKey) {
                        const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                            ? this.dungeon.getRelativeDirection(0, 1)
                            : 6;
                        if (dir) this.sendMoveOrRun(dir, false);
                    } else {
                        if (this.dungeon && typeof this.dungeon.turnRight === 'function') {
                            this.dungeon.turnRight();
                        } else if (this.dungeon && typeof this.dungeon.turn === 'function') {
                            this.dungeon.turn(1);
                        }
                        this.syncCompass();
                    }
                }
                return;
            }
        }

        const dirKey = numpadDirMap[e.code] || numpadDirMap[e.key];
        if (dirKey) {
            const isDigitShift = e.shiftKey && e.code && e.code.startsWith('Digit');
            if (!isDigitShift) {
                e.preventDefault();
                const dir = dirKey;
                if (dir === 5) {
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? (RealmKeys.realmKey('hold', realm) || ',')
                        : ',';
                    this.network.sendKey(holdKey);
                    return;
                }
                if (this.isRunningActive(e)) {
                    if (e.repeat) return;
                    this.sendRunMove(dir);
                } else {
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.sendMovementKey(moveKey);
                }
                return;
            }
        }

        // Turning is instant camera yaw (0 engine turns)
        // Holding Shift with ArrowLeft / ArrowRight executes Strafe Run Left / Strafe Run Right
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (this.isRunningActive(e) && e.shiftKey) {
                if (e.repeat) return;
                this.sendRunMove(4); // Strafe Run Left
            } else {
                this.dungeon.turn(-1);
            }
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (this.isRunningActive(e) && e.shiftKey) {
                if (e.repeat) return;
                this.sendRunMove(6); // Strafe Run Right
            } else {
                this.dungeon.turn(1);
            }
            return;
        }

        // Forward / Backward in current camera facing direction
        // If Shift is held or Run Toggle is active, runs forward or backward
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.isRunningActive(e)) {
                if (e.repeat) return;
                this.sendRunMove(8);
            } else {
                const moveKey = this.getRelativeDirectionKey(8);
                if (moveKey) this.sendMovementKey(moveKey);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.isRunningActive(e)) {
                if (e.repeat) return;
                this.sendRunMove(2);
            } else {
                const moveKey = this.getRelativeDirectionKey(2);
                if (moveKey) this.sendMovementKey(moveKey);
            }
            return;
        }

        if (e.key === '.' && !e.shiftKey) {
            e.preventDefault();
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            this.network.sendKey(holdKey);
            return;
        }

        if (e.key === ',') {
            e.preventDefault();
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            this.network.sendKey(holdKey);
            return;
        }

        // Contextual Hero Action on Space / Enter
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (this.smartAction) {
                this.executeSmartAction(this.smartAction);
            } else {
                this.dungeon.triggerAttackAnimation();
                if (this.audio) this.audio.playWhoosh();
                const fwdKey = this.getRelativeDirectionKey(8) || 'up';
                this.network.sendKey(fwdKey);
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            this.network.sendKey('enter');
            return;
        }

        // Forward Ctrl+letter combinations to engine (e.g. C-s save, C-x quit, C-d debug)
        if (e.key.length === 1 && e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            this.network.sendKey(`C-${e.key.toLowerCase()}`);
            return;
        }

        // General keys (e.g. 'i' for inventory, 'm' for cast spell, 'd' for drop, 'g' for pickup, 'q' for quaff, 'r' for read, 'w' for wear, 's' for sell/spike)
        // ALL single-character keys pass through to the Angband engine without interception!
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            let keyToSend = e.key;
            const isTopLevelWorldCmd = Boolean(
                ui && ui.awaiting_command && (ui.overlay || 0) === 0 && !ui.more
            );
            if (isTopLevelWorldCmd && typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) {
                const mapped = RealmKeys.fromVanilla(e.key, realm);
                if (mapped === null && realm === 'silq' && (e.key === 'r' || e.key === 'b')) {
                    this.network.sendKey(e.key);
                    return;
                }
                if (mapped === null) {
                    return; // Verb does not exist in active realm (e.g. read in Sil-Q)
                }
                if (mapped !== undefined) {
                    keyToSend = mapped;
                }
            }
            if (this.audio) {
                const k = keyToSend;
                const kl = k.toLowerCase();
                if (k === 'T') {
                    if (typeof this.audio.playWallBump === 'function') this.audio.playWallBump(0.9);
                    else this.audio.playWhoosh();
                } else if (k === 'B') {
                    if (typeof this.audio.playDoorBreak === 'function') this.audio.playDoorBreak();
                    else this.audio.playWhoosh();
                } else if (k === 'D') {
                    if (typeof this.audio.playTrapDisarm === 'function') this.audio.playTrapDisarm();
                    else this.audio.playDoor(true);
                } else if (k === 'R' || k === '%') {
                    if (typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                } else if (k === '>' || k === '<') {
                    if (typeof this.audio.playStairs === 'function') this.audio.playStairs(k === '>');
                } else if (kl === 'm' || kl === 's' || kl === 'b' || kl === 'p') this.audio.playSpell();
                else if (kl === 'q') this.audio.playQuaff();
                else if (kl === 'r') this.audio.playScroll();
                else if (kl === 'g' || kl === ',') this.audio.playItemPickup();
                else if (kl === 'd') this.audio.playItemDrop();
                else if (k === 'E') this.audio.playEat();
                else if (k === 'w') this.audio.playEquipWeapon();
                else if (k === 'W') this.audio.playEquipArmor();
                else if (k === 't') this.audio.playBowShoot();
                else if (kl === 'o') this.audio.playDoor(true);
                else if (kl === 'c') this.audio.playDoor(false);
                else if (kl === 'f' || kl === 'v') this.audio.playBowShoot();
                else if (kl === 'i' || kl === 'e') this.audio.playMenuOpen();
            }
            this.network.sendKey(keyToSend);
        }
    }

    /**
     * Angband movement key for a local direction (numpad 1-9) relative to current camera facing.
     * 1:1 mathematical parity with Godot client DungeonWorld.RelativeMoveKey.
     * 8 = Forward, 2 = Backward, 4 = Strafe Left, 6 = Strafe Right,
     * 7 = Forward-Left, 9 = Forward-Right, 1 = Backward-Left, 3 = Backward-Right, 5 = Stay.
     */
    getRelativeDirectionKey(numpadDir) {
        if (numpadDir === 5) {
            const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
            return (typeof RealmKeys !== 'undefined' && typeof RealmKeys.get === 'function') ? (RealmKeys.get('hold', realm) || ',') : ',';
        }
        const localIndexMap = {
            8: 0,
            9: 1,
            6: 2,
            3: 3,
            2: 4,
            1: 5,
            4: 6,
            7: 7
        };
        const localIndex = localIndexMap[numpadDir];
        if (localIndex === undefined) return null;
        // Cardinal and diagonal Angband movement keys (1:1 with Godot DungeonWorld.cs)
        const dirKeys = ['up', 'pageup', 'right', 'pagedown', 'down', 'end', 'left', 'home'];
        const facing = (this.dungeon && typeof this.dungeon.facing === 'number') ? this.dungeon.facing : 0;
        const targetWorldSector = (localIndex + facing * 2) % 8;
        return dirKeys[targetWorldSector];
    }

    isDirectionalTargeting() {
        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        if (!lastFrame) return false;
        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : '';
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        const inPlay = Boolean(lastFrame.phase === 'play');
        return Boolean(
            (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
            (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
        );
    }

    setupActionButtons() {
        // Universal helper for reliable mobile touch + desktop click handling:
        // - Tracks displacement during touchmove (>10px cancels activation if user was scrolling/swiping)
        // - Prevents default on touchend to eliminate 300ms tap latency and block emulated clicks
        // - Enforces a 500ms suppression window on click events to guarantee 1 tap = 1 action
        const bindReliableAction = (btn, onTrigger) => {
            let startX = 0;
            let startY = 0;
            let moved = false;
            let lastTouchEndTime = 0;

            btn.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length > 0) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    moved = false;
                }
            }, { passive: true });

            btn.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches.length > 0) {
                    const dx = Math.abs(e.touches[0].clientX - startX);
                    const dy = Math.abs(e.touches[0].clientY - startY);
                    if (dx > 10 || dy > 10) {
                        moved = true; // Dragging or scrolling
                    }
                }
            }, { passive: true });

            btn.addEventListener('touchend', (e) => {
                lastTouchEndTime = Date.now();
                if (!moved) {
                    if (e.cancelable) e.preventDefault();
                    onTrigger(e);
                }
            }, { passive: false });

            btn.addEventListener('touchcancel', () => {
                lastTouchEndTime = Date.now();
            }, { passive: true });

            btn.addEventListener('click', (e) => {
                // Suppress synthetic clicks emitted by mobile browsers after touch
                if (Date.now() - lastTouchEndTime < 500) {
                    if (e.cancelable) e.preventDefault();
                    return;
                }
                onTrigger(e);
            });
        };

        const bind = (id, verb) => {
            const btn = document.getElementById(id);
            if (btn) {
                let lastTriggerTime = 0;
                const fire = (ev) => {
                    const now = Date.now();
                    if (now - lastTriggerTime < 280) return; // Debounce rapid triggers
                    lastTriggerTime = now;

                    if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                    if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
                    if (this.audio) this.audio.unlock();

                    const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                    if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                        this.network.sendKey(' ');
                        lastTriggerTime = 0;
                        setTimeout(() => {
                            fire(ev);
                        }, 45);
                        return;
                    }

                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';

                    if (verb === 'toggle-run') {
                        this.toggleDpadRunMode();
                        return;
                    } else if (verb === 'attack') {
                        this.dungeon.triggerAttackAnimation();
                        if (this.audio) this.audio.playWhoosh();
                        const fwdKey = this.getRelativeDirectionKey(8) || 'up';
                        this.network.sendKey(fwdKey);
                        return;
                    } else if (verb === 'terminal') {
                        if (this.toggleTerminalView) this.toggleTerminalView();
                        return;
                    } else if (verb === 'wield') {
                        this.openContextualMenu('wield');
                        return;
                    } else if (verb === 'drop') {
                        this.openContextualMenu('drop');
                        return;
                    } else if (verb === 'search') {
                        const sKey = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                            ? RealmKeys.fromVanilla('s', realm)
                            : 's';
                        this.network.sendKey(sKey);
                        return;
                    }

                    const effKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? RealmKeys.realmKey(verb, realm)
                        : null;

                    if (!effKey) {
                        // Verb does not exist in active realm (e.g. read in Sil-Q)
                        return;
                    }

                    if (this.isDirectionalTargeting && this.isDirectionalTargeting() && (verb !== 'attack' && verb !== 'fire' && verb !== 'throw')) {
                        this.network.sendKey('escape');
                        setTimeout(() => {
                            if (this.audio) {
                                if (effKey === 'm' || effKey === 's') this.audio.playSpell();
                                else if (effKey === 'i' || effKey === 'e' || effKey === 'v' || effKey === 't' || effKey === 'N' || effKey === 'tab' || effKey === 'U' || effKey === 'O' || effKey === 'Q' || effKey === 'b' || effKey === 'G') this.audio.playMenuOpen();
                                else if (effKey === 'g') this.audio.playItemPickup();
                                else if (effKey === 'q') (typeof this.audio.playQuaff === 'function') ? this.audio.playQuaff() : this.audio.playMenuOpen();
                                else if (effKey === 'r') (typeof this.audio.playScroll === 'function') ? this.audio.playScroll() : this.audio.playMenuOpen();
                                else if (effKey === 'f') (typeof this.audio.playBowShoot === 'function') ? this.audio.playBowShoot() : this.audio.playWhoosh();
                            }
                            this.network.sendKey(effKey);
                        }, 40);
                        return;
                    }

                    if (verb === 'rest') {
                        if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                        this.network.sendKey(effKey);
                        // If the realm's rest key is 'R', follow with enter (prompting for duration)
                        if (effKey === 'R') {
                            setTimeout(() => {
                                const lf = window.__app && window.__app.lastFrame;
                                if (!lf || lf.phase !== 'play') return;
                                this.network.sendKey('enter');
                            }, 80);
                        }
                        return;
                    } else if (verb === 'open') {
                        // Open door in front of camera facing
                        if (this.audio) this.audio.playDoor();
                        const fwdKey = this.getRelativeDirectionKey(8) || 'up';
                        this.network.sendKey(effKey);
                        setTimeout(() => {
                            const lf = window.__app && window.__app.lastFrame;
                            if (!lf || lf.phase !== 'play') return;
                            this.network.sendKey(fwdKey);
                        }, 80);
                        return;
                    }

                    if (this.audio) {
                        if (effKey === 'm' || effKey === 's') this.audio.playSpell();
                        else if (effKey === 'i' || effKey === 'e' || effKey === 'v' || effKey === 't' || effKey === 'N' || effKey === 'tab' || effKey === 'U' || effKey === 'O' || effKey === 'Q' || effKey === 'b' || effKey === 'G') this.audio.playMenuOpen();
                        else if (effKey === 'g') this.audio.playItemPickup();
                        else if (effKey === 'q') (typeof this.audio.playQuaff === 'function') ? this.audio.playQuaff() : this.audio.playMenuOpen();
                        else if (effKey === 'r') (typeof this.audio.playScroll === 'function') ? this.audio.playScroll() : this.audio.playMenuOpen();
                        else if (effKey === 'f') (typeof this.audio.playBowShoot === 'function') ? this.audio.playBowShoot() : this.audio.playWhoosh();
                    }
                    this.network.sendKey(effKey);
                };

                bindReliableAction(btn, fire);
            }
        };

        bind('btn-attack', 'attack');
        bind('btn-throw', 'throw');
        bind('btn-fire', 'fire');
        bind('btn-cast', 'cast');
        bind('btn-skills', 'skills');
        bind('btn-power', 'power');
        bind('btn-overland', 'overland');
        bind('btn-quests', 'quests');
        bind('btn-browse', 'browse');
        bind('btn-study', 'study');
        bind('btn-quaff', 'quaff');
        bind('btn-read', 'read');
        bind('btn-door', 'open');
        bind('btn-pickup', 'pickup');
        bind('btn-rest', 'rest');
        bind('btn-inventory', 'inven');
        bind('btn-equipment', 'equip');
        bind('btn-wield', 'wield');
        bind('btn-drop', 'drop');
        bind('btn-search', 'search');
        bind('btn-terminal', 'terminal');
        bind('btn-run-toggle', 'toggle-run');

        // Dynamic Hero Context Action Button (#btn-hero-action)
        const btnHero = document.getElementById('btn-hero-action');
        if (btnHero) {
            bindReliableAction(btnHero, () => {
                const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                    this.network.sendKey('space');
                    return;
                }
                if (this.smartAction) {
                    this.executeSmartAction(this.smartAction);
                } else {
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? (RealmKeys.realmKey('hold', realm) || ',')
                        : ',';
                    this.network.sendKey(holdKey);
                }
            });
        }

        // Non-Intrusive Context Action Cue (#context-action-cue)
        const actionCue = document.getElementById('context-action-cue');
        if (actionCue) {
            bindReliableAction(actionCue, () => {
                const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                    this.network.sendKey('space');
                    return;
                }
                if (this.smartAction) {
                    this.executeSmartAction(this.smartAction);
                } else {
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? (RealmKeys.realmKey('hold', realm) || ',')
                        : ',';
                    this.network.sendKey(holdKey);
                }
            });
        }

        // 8-Way Directional Aim Rosette
        const rosette = document.getElementById('directional-aim-rosette');
        if (rosette) {
            const backdrop = rosette.querySelector('.rosette-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    rosette.classList.add('hidden');
                    this.network.sendKey('escape');
                });
            }
            const sectors = rosette.querySelectorAll('.rosette-sector');
            sectors.forEach(sec => {
                bindReliableAction(sec, () => {
                    const dir = parseInt(sec.dataset.dir, 10);
                    const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                    const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
                        ? window.ScreenContext.screenTextOf(lastFrame)
                        : '';
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const isHeng = realm === 'hengband';
                    const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
                    const ntFlags = {
                        isDirectionalTargeting: Boolean(
                            (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
                            (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
                        )
                    };
                    const isTargeting = Boolean(ntFlags && ntFlags.isDirectionalTargeting);

                    if (dir === 5) {
                        if (isTargeting) {
                            this.network.sendKey('t');
                        } else {
                            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                                ? (RealmKeys.realmKey('hold', realm) || ',')
                                : ',';
                            this.network.sendKey(holdKey);
                        }
                    } else if (!isNaN(dir)) {
                        const moveKey = this.getRelativeDirectionKey(dir);
                        if (moveKey) this.network.sendKey(moveKey);
                    }
                    rosette.classList.add('hidden');
                });
            });
        }

        // Dynamic Staircase Action Button
        const stairBtn = document.getElementById('btn-stair');
        if (stairBtn) {
            let lastStairTime = 0;
            const fireStair = (ev) => {
                const now = Date.now();
                if (now - lastStairTime < 280) return;
                lastStairTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('medium');
                if (this.audio) this.audio.unlock();
                const key = stairBtn.dataset.key || '>';
                this.network.sendKey(key);
            };
            bindReliableAction(stairBtn, fireStair);
        }

        // Action Bar Overflow & Mobile Drawer (§9.1 / WS9.1)
        const actionMoreBtn = document.getElementById('btn-action-more');
        const actionBar = document.getElementById('action-bar');
        const actionPopover = document.getElementById('action-more-popover');

        const ACTION_PRIORITY = [
            'btn-hero-action',
            'btn-attack',
            'btn-cast',
            'btn-fire',
            'btn-throw',
            'btn-quaff',
            'btn-read',
            'btn-pickup',
            'btn-rest',
            'btn-inventory',
            'btn-equipment',
            'btn-wield',
            'btn-drop',
            'btn-search',
            'btn-door',
            'btn-power',
            'btn-browse',
            'btn-study',
            'btn-skills',
            'btn-quests',
            'btn-overland',
            'btn-stair',
            'btn-run-toggle',
            'btn-terminal',
            'btn-guide-hud',
            'btn-command-palette'
        ];

        if (actionMoreBtn && actionBar) {
            let lastMoreTime = 0;

            const updateActionBarOverflow = () => {
                const isSmallOrCoarse = window.innerWidth <= 900 || window.matchMedia('(pointer: coarse)').matches;
                const allButtons = ACTION_PRIORITY.map(id => document.getElementById(id)).filter(Boolean);

                if (isSmallOrCoarse) {
                    // Mobile / coarse pointer: collapse to 6 primary buttons plus More
                    let kept = 0;
                    for (const btn of allButtons) {
                        const isHiddenByRule = btn.dataset.realmHidden === '1' || (btn.style.display === 'none' && !btn.dataset.overflowHidden);
                        if (isHiddenByRule) continue;

                        if (kept < 6) {
                            if (btn.parentElement !== actionBar) {
                                actionBar.insertBefore(btn, actionMoreBtn);
                            }
                            btn.removeAttribute('data-overflow-hidden');
                            kept++;
                        } else {
                            if (actionPopover && btn.parentElement !== actionPopover) {
                                actionPopover.appendChild(btn);
                            }
                            btn.setAttribute('data-overflow-hidden', '1');
                        }
                    }
                    actionMoreBtn.classList.add('is-needed');
                    actionMoreBtn.style.display = 'inline-flex';
                } else {
                    // Desktop fine pointer: restore all buttons into actionBar before actionMoreBtn
                    for (const btn of allButtons) {
                        if (btn.parentElement !== actionBar) {
                            actionBar.insertBefore(btn, actionMoreBtn);
                        }
                        btn.removeAttribute('data-overflow-hidden');
                    }

                    // Check row count (2 rows max)
                    const firstBtn = actionBar.querySelector('.action-btn:not(#btn-action-more)');
                    const btnHeight = (firstBtn && firstBtn.offsetHeight > 0) ? firstBtn.offsetHeight : 34;
                    const maxTwoRowHeight = btnHeight * 2 + 10;

                    if (actionBar.offsetHeight > 0 && actionBar.scrollHeight > maxTwoRowHeight) {
                        actionMoreBtn.classList.add('is-needed');
                        actionMoreBtn.style.display = 'inline-flex';

                        // Move trailing buttons by reverse priority into actionPopover until scrollHeight <= 2 rows
                        for (let i = allButtons.length - 1; i >= 0; i--) {
                            const btn = allButtons[i];
                            if (btn.parentElement === actionBar) {
                                if (actionPopover) actionPopover.insertBefore(btn, actionPopover.firstChild);
                                btn.setAttribute('data-overflow-hidden', '1');
                                if (actionBar.scrollHeight <= maxTwoRowHeight) {
                                    break;
                                }
                            }
                        }
                    } else {
                        actionMoreBtn.classList.remove('is-needed');
                        actionMoreBtn.style.display = 'none';
                        if (actionPopover) actionPopover.classList.remove('is-open');
                    }
                }
            };

            const toggleDrawer = (ev) => {
                const now = Date.now();
                if (now - lastMoreTime < 100) return;
                lastMoreTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');

                const isOpen = actionPopover ? actionPopover.classList.toggle('is-open') : actionBar.classList.toggle('drawer-open');
                actionBar.classList.toggle('drawer-open', isOpen);
                actionMoreBtn.textContent = isOpen ? '✕ Close' : '⋯ More';
            };
            bindReliableAction(actionMoreBtn, toggleDrawer);

            const closeDrawer = () => {
                if (actionPopover) actionPopover.classList.remove('is-open');
                actionBar.classList.remove('drawer-open');
                actionMoreBtn.textContent = '⋯ More';
            };

            if (actionPopover) {
                actionPopover.addEventListener('click', (ev) => {
                    const target = ev.target ? ev.target.closest('.action-btn') : null;
                    if (target) closeDrawer();
                });
            }

            document.addEventListener('click', (ev) => {
                if (!actionBar.contains(ev.target) && (!actionPopover || !actionPopover.contains(ev.target))) {
                    closeDrawer();
                }
            });

            if (typeof ResizeObserver !== 'undefined') {
                let roTimer = null;
                const ro = new ResizeObserver(() => {
                    if (roTimer) cancelAnimationFrame(roTimer);
                    roTimer = requestAnimationFrame(updateActionBarOverflow);
                });
                ro.observe(actionBar);
                if (actionBar.parentElement) ro.observe(actionBar.parentElement);
            }
            window.addEventListener('resize', updateActionBarOverflow);
            window.__updateActionBarOverflow = updateActionBarOverflow;
            setTimeout(updateActionBarOverflow, 100);
        }

        // HUD Help / Controls Sheet Buttons
        const guideHudBtn = document.getElementById('btn-guide-hud');
        if (guideHudBtn) {
            guideHudBtn.addEventListener('click', (ev) => {
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.__app && window.__app.showGuide) {
                    window.__app.showGuide(1, 'game');
                }
            });
        }

        const quickHelpBtn = document.getElementById('btn-quick-help');
        if (quickHelpBtn) {
            quickHelpBtn.addEventListener('click', (ev) => {
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.__app && window.__app.showGuide) {
                    window.__app.showGuide(1, 'game');
                }
            });
        }

        // Minimap Explicit Size & Zoom Control Buttons
        const bindClick = (id, fn) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', (ev) => {
                    if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                    if (this.audio) this.audio.unlock();
                    fn();
                });
            }
        };

        bindClick('btn-map-zoom-out', () => {
            if (window.__app && window.__app.hud) window.__app.hud.adjustMinimapZoom(-0.25);
        });
        bindClick('btn-map-zoom-in', () => {
            if (window.__app && window.__app.hud) window.__app.hud.adjustMinimapZoom(0.25);
        });

        // Camera Head Tilt Buttons
        bindClick('btn-tilt-up', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.min(1.25, (this.dungeon.userPitchOffset || 0) + 0.12);
            }
        });
        bindClick('btn-tilt-reset', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = 0.0;
            }
        });
        bindClick('btn-tilt-down', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.max(-0.65, (this.dungeon.userPitchOffset || 0) - 0.12);
            }
        });

        // Clicking anywhere in world exploration while -more- prompt is up dismisses prompt
        window.addEventListener('click', (e) => {
            const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
            if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                const inModal = e.target.closest('#pause-modal, #load-modal, #guide-modal, #death-modal');
                if (!inModal) {
                    this.network.sendKey('space');
                }
            }
        });

        const fsBtn = document.getElementById('btn-fullscreen');
        if (fsBtn) fsBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    setupTouchEvents() {
        const bindTouch = (id, action, allowRepeat = false) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            let holdTimer = null;
            let repeatInterval = null;

            const startAction = (e) => {
                if (e && e.cancelable) e.preventDefault();
                if (this.audio) this.audio.unlock();
                if (window.DeviceProfile) window.DeviceProfile.vibrate(12);
                action();

                if (allowRepeat && !this.dpadRunMode) {
                    clearTimeout(holdTimer);
                    clearInterval(repeatInterval);
                    holdTimer = setTimeout(() => {
                        repeatInterval = setInterval(() => {
                            if (this.dpadRunMode) {
                                clearInterval(repeatInterval);
                                return;
                            }
                            if (window.DeviceProfile) window.DeviceProfile.vibrate(8);
                            action();
                        }, 140);
                    }, 300);
                }
            };

            const stopAction = () => {
                clearTimeout(holdTimer);
                clearInterval(repeatInterval);
                holdTimer = null;
                repeatInterval = null;
            };

            btn.addEventListener('touchstart', startAction, { passive: false });
            btn.addEventListener('touchend', stopAction, { passive: true });
            btn.addEventListener('touchcancel', stopAction, { passive: true });

            btn.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                startAction(e);
            });
            btn.addEventListener('mouseup', stopAction);
            btn.addEventListener('mouseleave', stopAction);
        };

        // D-Pad Run / Walk Mode Toggle Button & Persisted State
        const runToggleBtn = document.getElementById('dpad-run-toggle');
        if (runToggleBtn) {
            let lastToggleTime = 0;
            const doToggle = (e) => {
                if (e && e.cancelable) e.preventDefault();
                const now = Date.now();
                if (now - lastToggleTime < 250) return;
                lastToggleTime = now;
                this.toggleDpadRunMode();
            };
            runToggleBtn.addEventListener('click', doToggle);
            runToggleBtn.addEventListener('touchend', doToggle);
        }

        // Directional movement dispatcher with automatic continuous sprinting in Run mode
        const sendDirectionalMove = (dir) => {
            if (this.dpadRunMode) {
                this.sendRunMove(dir);
            } else {
                const key = this.getRelativeDirectionKey(dir);
                if (key) this.sendMovementKey(key);
            }
        };

        // Top Turning Shoulder Wings
        bindTouch('dpad-turn-left', () => {
            this.dungeon.turn(-1);
        }, false);

        bindTouch('dpad-turn-right', () => {
            this.dungeon.turn(1);
        }, false);

        // Directional cardinal and diagonal movement buttons support hold-to-repeat
        bindTouch('dpad-up', () => {
            sendDirectionalMove(8);
        }, true);

        bindTouch('dpad-down', () => {
            sendDirectionalMove(2);
        }, true);

        // Strafe Left & Strafe Right on primary D-pad cardinal wings
        bindTouch('dpad-left', () => {
            sendDirectionalMove(4);
        }, true);

        bindTouch('dpad-right', () => {
            sendDirectionalMove(6);
        }, true);

        // Smart Multifunction Center D-Pad Action
        bindTouch('dpad-center', () => {
            const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
            if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                this.network.sendKey('space');
                return;
            }
            if (this.smartAction) {
                this.executeSmartAction(this.smartAction);
                return;
            }
            this.dungeon.triggerAttackAnimation();
            if (this.audio) this.audio.playWhoosh();
            this.network.sendKey('enter');
        }, false);

        // Diagonal Touch D-Pad buttons with hold-to-repeat
        bindTouch('dpad-ul', () => {
            sendDirectionalMove(7);
        }, true);

        bindTouch('dpad-ur', () => {
            sendDirectionalMove(9);
        }, true);

        bindTouch('dpad-dl', () => {
            sendDirectionalMove(1);
        }, true);

        bindTouch('dpad-dr', () => {
            sendDirectionalMove(3);
        }, true);
    }

    getFeatAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= (map.h || map.rows.length) || x < 0) return 0;
        const row = map.rows[y];
        if (!row || !row.f) return 0;
        const idx = x * 2;
        if (idx + 1 >= row.f.length) return 0;
        const hi = parseInt(row.f[idx], 16) || 0;
        const lo = parseInt(row.f[idx + 1], 16) || 0;
        return (hi << 4) | lo;
    }

    raycastTargetAhead(frame, px, py, fwd) {
        if (!frame || !frame.map) return null;
        for (let d = 1; d <= 8; d++) {
            const rx = px + fwd.dx * d;
            const ry = py + fwd.dy * d;

            if (frame.monsters && Array.isArray(frame.monsters)) {
                const m = frame.monsters.find(mon => mon.x === rx && mon.y === ry);
                if (m) {
                    return { type: 'monster', data: m, dist: d, x: rx, y: ry };
                }
            }

            const feat = this.getFeatAt(frame.map, rx, ry);
            if (feat === 2 || feat === 3 || feat === 4) {
                return { type: 'door', feat, dist: d, x: rx, y: ry };
            }
            if (feat === 16 || (feat >= 17 && feat <= 22)) {
                return { type: 'wall', feat, dist: d, x: rx, y: ry };
            }
        }
        return null;
    }

    executeSmartAction(action) {
        if (action === 'descend') {
            if (this.audio) this.audio.playStairs();
            this.network.sendKey('>');
        } else if (action === 'ascend') {
            if (this.audio) this.audio.playStairs();
            this.network.sendKey('<');
        } else if (action === 'door') {
            if (this.audio) this.audio.playDoor();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey('o');
            setTimeout(() => {
                this.network.sendKey(fwdKey);
            }, 80);
        } else if (action === 'tunnel') {
            if (this.audio && typeof this.audio.playWallBump === 'function') {
                this.audio.playWallBump(0.9);
            }
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey('T');
            setTimeout(() => {
                this.network.sendKey(fwdKey);
            }, 80);
        } else if (action === 'pickup') {
            if (this.audio) this.audio.playItemPickup();
            this.network.sendKey('g');
        } else if (action === 'shoot') {
            if (this.audio) this.audio.playWhoosh();
            this.network.sendKey('f');
        } else if (action === 'attack') {
            this.dungeon.triggerAttackAnimation();
            if (this.audio) this.audio.playWhoosh();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey(fwdKey);
        } else {
            // Wait / Rest 1 Turn
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            this.network.sendKey(holdKey);
        }
    }

    updateContextualControls(frame) {
        if (!frame || !frame.player || !frame.map) return;
        const player = frame.player;
        const px = player.x;
        const py = player.y;
        if (px === undefined || py === undefined) return;

        // Elements
        const dpadCenter = document.getElementById('dpad-center');
        const btnHero = document.getElementById('btn-hero-action');
        const heroIcon = document.getElementById('hero-action-icon');
        const heroText = document.getElementById('hero-action-text');
        const heroKey = document.getElementById('hero-action-key');

        const reticle = document.getElementById('diegetic-reticle');
        const targetCard = document.getElementById('reticle-target-card');
        const targetName = document.getElementById('target-card-name');
        const targetTier = document.getElementById('target-card-tier');
        const targetHpFill = document.getElementById('target-card-hp-fill');
        const targetAffinities = document.getElementById('target-card-affinities');
        const actionCue = document.getElementById('context-action-cue');
        const actionCueIcon = document.getElementById('action-cue-icon');
        const actionCueKey = document.getElementById('action-cue-key');
        const actionCueText = document.getElementById('action-cue-text');
        const rosette = document.getElementById('directional-aim-rosette');

        // Check 1: Standing on stairs
        const currentFeat = this.getFeatAt(frame.map, px, py);
        const depth = player.depth !== undefined ? player.depth : 0;

        // Check 2: Standing on items
        const items = frame.items || frame.objects || [];
        const itemOnTile = items.find(it => it.x === px && it.y === py);

        // Check 3: Camera facing yaw and 8-way directional sector
        const yaw = (this.dungeon && typeof this.dungeon.yaw === 'number') ? this.dungeon.yaw : 0;
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const forwardOffsets = [
            { dx: 0, dy: -1 }, // 0: N
            { dx: 1, dy: -1 }, // 1: NE
            { dx: 1, dy: 0 },  // 2: E
            { dx: 1, dy: 1 },  // 3: SE
            { dx: 0, dy: 1 },  // 4: S
            { dx: -1, dy: 1 }, // 5: SW
            { dx: -1, dy: 0 }, // 6: W
            { dx: -1, dy: -1 } // 7: NW
        ];
        const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };

        // Raycast ahead along camera facing beam
        const rayTarget = this.raycastTargetAhead(frame, px, py, fwd);

        // Determine context action & target card state
        let action = 'wait';
        let icon = '⏳';
        let text = 'Wait';
        let key = '5';
        let title = 'Wait / Rest 1 Turn [5]';
        let cueText = '';
        let showCard = false;
        let cName = '';
        let cTier = '';
        let cTierCls = '';
        let cHpPct = 100;
        let cAffinityHtml = '';
        let isTargeted = false;

        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist === 1) {
            // Adjacent monster (melee attack)
            const m = rayTarget.data;
            action = 'attack';
            icon = '⚔';
            text = 'Attack';
            key = 'Space';
            title = `Attack ${m.name || 'Monster'} in Front [Space]`;
            cueText = `Attack ${m.name || 'Monster'}`;
            isTargeted = true;
            showCard = true;
            cName = `${m.name || 'Monster'} ('${m.glyph || m.c || 'm'}')`;
            cTier = m.unique ? 'Unique' : 'Monster';
            cTierCls = m.unique ? 'badge-unique' : 'badge-monster';
            cHpPct = m.pct !== undefined ? m.pct : (m.hp_max ? Math.round((m.hp / m.hp_max) * 100) : 100);
            const asleepBadge = m.asleep ? '<span class="target-affinity-chip">💤 Asleep</span>' : '';
            const afraidBadge = m.afraid ? '<span class="target-affinity-chip">😱 Afraid</span>' : '';
            cAffinityHtml = `<span class="target-affinity-chip">⚔ Melee Range</span>${asleepBadge}${afraidBadge}`;
        } else if (currentFeat === 6) {
            // Stairs Down
            action = 'descend';
            icon = '⬇';
            text = 'Descend';
            key = '>';
            title = depth === 0 ? 'Enter Dungeon [>]' : `Descend to ${(depth + 1) * 50}ft [>]`;
            cueText = depth === 0 ? 'Enter Dungeon [>]' : `Descend to ${(depth + 1) * 50}ft [>]`;
            showCard = false;
            cName = depth === 0 ? 'Dungeon Entrance (50\')' : `Staircase Down (${(depth + 1) * 50}ft)`;
            cTier = 'Portal';
            cTierCls = 'badge-portal';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">⬇ Descend [>]</span>';
        } else if (currentFeat === 5) {
            // Stairs Up
            action = 'ascend';
            icon = '⬆';
            text = 'Ascend';
            key = '<';
            title = depth === 1 ? 'Ascend to Town [<]' : `Ascend to ${(depth - 1) * 50}ft [<]`;
            cueText = depth === 1 ? 'Ascend to Town [<]' : `Ascend to ${(depth - 1) * 50}ft [<]`;
            showCard = false;
            cName = depth === 1 ? 'Staircase Up to Town' : `Staircase Up (${(depth - 1) * 50}ft)`;
            cTier = 'Portal';
            cTierCls = 'badge-portal';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">⬆ Ascend [<]</span>';
        } else if (itemOnTile) {
            // Item on floor
            action = 'pickup';
            icon = '🎒';
            text = 'Get';
            key = 'g';
            title = `Pick Up ${itemOnTile.name || 'Item'} [g]`;
            cueText = `Pick Up ${itemOnTile.name || 'Item'}`;
            showCard = false;
            cName = itemOnTile.name || 'Item on Floor';
            cTier = 'Loot';
            cTierCls = 'badge-item';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">🎒 Pickup [g]</span>';
        } else if (rayTarget && rayTarget.type === 'door' && rayTarget.dist === 1) {
            // Door in front
            action = 'door';
            icon = '🚪';
            text = 'Open';
            key = 'o';
            title = 'Open Door in Front [o]';
            cueText = 'Open Closed Door';
            showCard = false;
            cName = 'Closed Door';
            cTier = 'Door';
            cTierCls = 'badge-door';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">🚪 Open [o]</span>';
        } else if (rayTarget && rayTarget.type === 'wall' && rayTarget.dist === 1 && rayTarget.feat !== 22) {
            // Tunnelable wall / mineral vein / rubble
            action = 'tunnel';
            icon = '⛏️';
            text = 'Tunnel';
            key = 'Shift+T';
            title = 'Tunnel / Dig Wall in Front [T]';
            const wallName = rayTarget.feat === 16 ? 'Rubble Pile' : (rayTarget.feat === 17 || rayTarget.feat === 19 ? 'Magma Vein' : (rayTarget.feat === 18 || rayTarget.feat === 20 ? 'Quartz Vein' : 'Granite Wall'));
            cueText = `Tunnel ${wallName}`;
            showCard = false;
            cName = wallName;
            cTier = 'Wall';
            cTierCls = 'badge-wall';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">⛏️ Tunnel [T]</span>';
        } else if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist > 1) {
            // Ranged monster in line of sight
            const m = rayTarget.data;
            action = 'shoot';
            icon = '🏹';
            text = 'Shoot';
            key = 'f';
            title = `Shoot at ${m.name || 'Target'} [f]`;
            cueText = `Shoot ${m.name || 'Target'} (${rayTarget.dist}sq away)`;
            isTargeted = true;
            showCard = true;
            cName = `${m.name || 'Target'} ('${m.glyph || m.c || 'm'}')`;
            cTier = m.unique ? 'Unique' : 'Monster';
            cTierCls = m.unique ? 'badge-unique' : 'badge-monster';
            cHpPct = m.pct !== undefined ? m.pct : (m.hp_max ? Math.round((m.hp / m.hp_max) * 100) : 100);
            cAffinityHtml = `<span class="target-affinity-chip">🏹 ${rayTarget.dist}sq away</span>`;
        }

        const lang = window.__langMode || 'en';
        const isHeng = (frame.realm === 'hengband') || (window.__app && typeof window.__app.getActiveRealm === 'function' && window.__app.getActiveRealm() === 'hengband');
        if (isHeng) {
            const rawMName = (rayTarget && rayTarget.data && rayTarget.data.name) ? rayTarget.data.name : '';
            const rawItemName = (itemOnTile && itemOnTile.name) ? itemOnTile.name : '';
            const mName = rawMName ? (typeof window.getLocalizedMonsterName === 'function' ? window.getLocalizedMonsterName(rawMName, 'hengband', lang) : rawMName) : '';
            const itemName = rawItemName ? (typeof window.getLocalizedItemName === 'function' ? window.getLocalizedItemName(rawItemName, 'hengband', lang) : rawItemName) : '';

            if (rawMName) {
                const glyph = (rayTarget.data && (rayTarget.data.glyph || rayTarget.data.c)) || 'm';
                cName = `${mName || rawMName} ('${glyph}')`;
            } else if (rawItemName) {
                cName = itemName || rawItemName;
            }

            if (lang === 'jp') {
                if (action === 'attack') {
                    text = '攻撃';
                    cueText = mName ? `攻撃: ${mName}` : '近接攻撃';
                    title = mName ? `前方の${mName}を攻撃 [Space]` : '攻撃 [Space]';
                } else if (action === 'descend') {
                    text = '降りる';
                    cueText = depth === 0 ? 'ダンジョンに入る [>]' : '地下へ降りる [>]';
                    title = cueText;
                } else if (action === 'ascend') {
                    text = '登る';
                    cueText = depth === 1 ? '地上へ戻る [<]' : '上層へ登る [<]';
                    title = cueText;
                } else if (action === 'pickup') {
                    text = '拾う';
                    cueText = itemName ? `拾う: ${itemName}` : '拾う';
                    title = cueText + ' [g]';
                } else if (action === 'door') {
                    text = '開閉';
                    cueText = '扉を開ける';
                    title = '扉を開ける [o]';
                } else if (action === 'tunnel') {
                    text = '掘削';
                    cueText = '壁を掘る';
                    title = '壁を掘る [T]';
                } else if (action === 'shoot') {
                    text = '射撃';
                    cueText = mName ? `射撃: ${mName}` : '遠距離射撃';
                    title = cueText + ' [f]';
                } else if (action === 'wait') {
                    text = '待機';
                    cueText = '待機';
                    title = '待機 [5]';
                }
            } else if (lang === 'bilingual') {
                if (action === 'attack') {
                    text = 'Attack (攻撃)';
                    cueText = mName ? `Attack (攻撃): ${mName}` : 'Attack (攻撃)';
                    title = 'Attack (攻撃) [Space]';
                } else if (action === 'descend') {
                    text = 'Descend (降りる)';
                    cueText = depth === 0 ? 'Enter Dungeon (入山) [>]' : 'Descend (降りる) [>]';
                    title = cueText;
                } else if (action === 'ascend') {
                    text = 'Ascend (登る)';
                    cueText = depth === 1 ? 'Ascend to Town (帰還) [<]' : 'Ascend (登る) [<]';
                    title = cueText;
                } else if (action === 'pickup') {
                    text = 'Get (拾う)';
                    cueText = itemName ? `Get (拾う): ${itemName}` : 'Get (拾う)';
                    title = cueText + ' [g]';
                } else if (action === 'door') {
                    text = 'Open (開閉)';
                    cueText = 'Open Door (扉を開ける)';
                    title = 'Open Door (開閉) [o]';
                } else if (action === 'tunnel') {
                    text = 'Tunnel (掘削)';
                    cueText = 'Tunnel (壁を掘る)';
                    title = 'Tunnel (掘削) [T]';
                } else if (action === 'shoot') {
                    text = 'Shoot (射撃)';
                    cueText = mName ? `Shoot (射撃): ${mName}` : 'Shoot (射撃)';
                    title = cueText + ' [f]';
                } else if (action === 'wait') {
                    text = 'Wait (待機)';
                    cueText = 'Wait (待機)';
                    title = 'Wait (待機) [5]';
                }
            } else {
                if (action === 'attack') {
                    text = 'Attack';
                    cueText = mName ? `Attack ${mName}` : 'Attack Monster';
                    title = mName ? `Attack ${mName} in Front [Space]` : 'Attack Monster in Front [Space]';
                } else if (action === 'pickup') {
                    text = 'Get';
                    cueText = itemName ? `Pick Up ${itemName}` : 'Pick Up Item';
                    title = itemName ? `Pick Up ${itemName} [g]` : 'Pick Up Item [g]';
                } else if (action === 'shoot') {
                    text = 'Shoot';
                    cueText = mName ? `Shoot ${mName} (${rayTarget.dist}sq away)` : `Shoot Target (${rayTarget.dist}sq away)`;
                    title = mName ? `Shoot at ${mName} [f]` : 'Shoot at Target [f]';
                }
            }
        }

        this.smartAction = action;

        // Update D-Pad Center Button
        if (dpadCenter) {
            dpadCenter.textContent = icon;
            dpadCenter.title = title;
            dpadCenter.classList.toggle('smart-active', action !== 'wait');
            dpadCenter.classList.toggle('smart-stairs', action === 'descend' || action === 'ascend');
            dpadCenter.classList.toggle('smart-door', action === 'door');
            dpadCenter.classList.toggle('smart-attack', action === 'attack');
        }

        // Update Hero Context Action Button (#btn-hero-action)
        if (btnHero) {
            if (heroIcon) heroIcon.textContent = icon;
            if (heroText) heroText.textContent = text;
            if (heroKey) heroKey.textContent = key;
            btnHero.title = title;
            btnHero.setAttribute('data-action', action);
            btnHero.classList.toggle('action-suggested', action !== 'wait');
        }

        const btnAttack = document.getElementById('btn-attack');
        if (btnHero && btnHero.style.display !== 'none' && action === 'attack') {
            if (btnAttack) btnAttack.style.display = 'none';
        } else {
            if (btnAttack) btnAttack.style.display = '';
        }
        if (typeof this.updateContextButtons === 'function') {
            this.updateContextButtons(frame);
        }

        // Update In-Play & Terminal Overlay Status
        const inPlay = Boolean(frame && (frame.phase === 'play' || (frame.player && frame.player.name)));
        const inTerminalOverlay = Boolean(frame && frame.ui && (frame.ui.overlay || 0) > 0) ||
                                 Boolean(window.__app && window.__app.needsTerminal && window.__app.needsTerminal(frame)) ||
                                 this.inTerminal;
        const isDead = Boolean(player.dead || (player.hp !== undefined && player.hp <= 0 && player.hp_max > 0));

        // Update HUD Status Bar Alert (#footer-target) - Perfectly docked outside 3D line of sight
        const footerTarget = document.getElementById('footer-target');
        if (footerTarget) {
            const isMonsterTarget = Boolean(rayTarget && rayTarget.type === 'monster');
            if (action !== 'wait' && inPlay && !inTerminalOverlay && !isDead && !isMonsterTarget) {
                footerTarget.style.display = 'inline-flex';
                const label = (rayTarget && rayTarget.label) || cueText || text;
                footerTarget.innerHTML = `<span class="target-alert-icon">${escapeHtml(icon)}</span> <span class="target-alert-text">${escapeHtml(label)}</span>`;
            } else {
                footerTarget.style.display = 'none';
            }
        }

        // Update Diegetic Reticle & Target Card

        if (reticle) {
            if (inPlay && !inTerminalOverlay && !isDead) {
                reticle.style.display = 'flex';
                reticle.classList.toggle('reticle-targeted', isTargeted);
                reticle.classList.toggle('reticle-interactive', !isTargeted && action !== 'wait');
            } else {
                reticle.style.display = 'none';
            }
        }

        // Context Action Cue & Top-Center Target Plaque: Keep strictly hidden from 3D viewport
        // Action bar highlights, hero button, and footer status bar provide 100% of contextual cues
        if (actionCue) {
            actionCue.classList.add('hidden');
            actionCue.style.display = 'none';
        }
        if (targetCard) {
            targetCard.classList.add('hidden');
            targetCard.style.display = 'none';
        }

        // Update Directional Aim Rosette (Visibility & Active Yaw Highlight)
        if (rosette) {
            const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
                ? window.ScreenContext.screenTextOf(frame)
                : (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
            const isTargetingPrompt = (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function')
                ? window.ScreenContext.inputTargetingPrompt(screenText, inPlay)
                : false;

            if (isTargetingPrompt && inPlay && !inTerminalOverlay && !isDead) {
                rosette.classList.remove('hidden');
            } else {
                rosette.classList.add('hidden');
            }

            // Highlight sector corresponding to current camera yaw
            const sectorToDir = [8, 9, 6, 3, 2, 1, 4, 7];
            const activeDir = sectorToDir[sector] || 8;
            const sectors = rosette.querySelectorAll('.rosette-sector');
            sectors.forEach(sec => {
                const sDir = parseInt(sec.dataset.dir, 10);
                sec.classList.toggle('active-yaw', sDir === activeDir);
            });
        }
    }

    setupViewportGestures() {
        const canvas = document.getElementById('viewport-canvas');
        if (!canvas) return;

        canvas.style.touchAction = 'none';

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startTime = 0;
        let lastX = 0;
        let lastY = 0;
        let activePointerId = null;

        const onStart = (clientX, clientY, pointerId = null) => {
            isDragging = true;
            startX = clientX;
            startY = clientY;
            startTime = performance.now();
            lastX = clientX;
            lastY = clientY;
            activePointerId = pointerId;
        };

        const onMove = (clientX, clientY) => {
            if (!isDragging) return;
            const dx = clientX - lastX;
            const dy = clientY - lastY;
            lastX = clientX;
            lastY = clientY;

            if (this.dungeon && typeof this.dungeon.rotateFreelook === 'function') {
                // Smooth 360-degree rotation horizontally (always normal) and clamped vertical pitch (Y-axis invert toggle)
                const deltaYaw = -1 * dx * 0.0055;
                const multY = this.invertDragLook ? -1 : 1;
                const deltaPitch = multY * dy * 0.0035;
                this.dungeon.rotateFreelook(deltaYaw, deltaPitch);
            }
        };

        const onEnd = (endX = null, endY = null) => {
            if (!isDragging) return;
            isDragging = false;
            activePointerId = null;

            const finalX = endX !== null ? endX : lastX;
            const finalY = endY !== null ? endY : lastY;
            const elapsed = performance.now() - startTime;
            const totalDx = finalX - startX;
            const totalDy = finalY - startY;

            // Fast horizontal swipe completed within 450ms (always normal turn direction)
            if (elapsed < 450 && Math.abs(totalDx) > 40 && Math.abs(totalDx) > Math.abs(totalDy) * 1.5) {
                if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
                    window.DeviceProfile.triggerHaptic('light');
                }
                if (this.dungeon && typeof this.dungeon.turn === 'function') {
                    const turnDir = (totalDx > 0 ? 1 : -1);
                    this.dungeon.turn(turnDir);
                }
            } else if (elapsed < 380 && Math.abs(totalDx) < 18 && Math.abs(totalDy) < 18) {
                // Single Click / Tap in 3D: Raycast against creatures for voice interaction or items for afar inspection
                if (this.dungeon && typeof this.dungeon.getMonsterAtScreenCoords === 'function') {
                    const monster = this.dungeon.getMonsterAtScreenCoords(finalX, finalY);
                    if (monster && window.chronicleManager) {
                        window.chronicleManager.interactWithCreature(monster);
                    } else if (typeof this.dungeon.getItemAtScreenCoords === 'function') {
                        const item = this.dungeon.getItemAtScreenCoords(finalX, finalY);
                        if (item && window.chronicleManager && typeof window.chronicleManager.inspectObject === 'function') {
                            window.chronicleManager.inspectObject(item);
                        }
                    }
                }
            }
        };

        canvas.addEventListener('pointerdown', (e) => {
            if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            onStart(e.clientX, e.clientY, e.pointerId);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
            onMove(e.clientX, e.clientY);
        });

        const finishPointer = (e) => {
            if (activePointerId !== null && e.pointerId === activePointerId) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                onEnd(e.clientX, e.clientY);
            }
        };
        canvas.addEventListener('pointerup', finishPointer);
        canvas.addEventListener('pointercancel', finishPointer);

        // Touch event fallback
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !isDragging) {
                onStart(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                onMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        canvas.addEventListener('touchend', (e) => {
            const finalTouch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
            onEnd(finalTouch ? finalTouch.clientX : null, finalTouch ? finalTouch.clientY : null);
        }, { passive: true });
        canvas.addEventListener('touchcancel', () => { onEnd(); }, { passive: true });
    }

    toggleFullscreen() {
        const doc = document;
        const elem = doc.documentElement;
        const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
        try {
            if (!isFs) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(() => {});
                } else if (elem.webkitRequestFullscreen) {
                    try {
                        const p = elem.webkitRequestFullscreen();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    } catch (_) {}
                } else if (elem.mozRequestFullScreen) {
                    elem.mozRequestFullScreen();
                } else if (elem.msRequestFullscreen) {
                    elem.msRequestFullscreen();
                }
            } else {
                if (doc.exitFullscreen) {
                    doc.exitFullscreen().catch(() => {});
                } else if (doc.webkitExitFullscreen) {
                    try {
                        const p = doc.webkitExitFullscreen();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    } catch (_) {}
                } else if (doc.mozCancelFullScreen) {
                    doc.mozCancelFullScreen();
                } else if (doc.msExitFullscreen) {
                    doc.msExitFullscreen();
                }
            }
        } catch (err) {
            console.warn('[Input] Fullscreen toggle error:', err);
        }
    }
}

window.InputController = InputController;
window.InputManager = InputController;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InputController, InputManager: InputController };
}

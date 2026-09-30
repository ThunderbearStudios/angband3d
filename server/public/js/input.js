/**
 * Angband3D Input Controller — Keyboard, Mouse, and Touch Navigation
 * Provides 1:1 parity with the Godot C# desktop client.
 */

class InputController {
    constructor(network, dungeon, terminal, audio, toggleTerminalView) {
        this.network = network;
        this.dungeon = dungeon;
        this.terminal = terminal;
        this.audio = audio;
        this.toggleTerminalView = toggleTerminalView;

        this.inTerminal = false;
        this.smartAction = 'wait';
        this.invertDragLook = (function() {
            try { return localStorage.getItem('angband3d_invert_drag') === 'true'; } catch (_) { return false; }
        })();
        this.setupKeyboardEvents();
        this.setupActionButtons();
        this.setupTouchEvents();
        this.setupViewportGestures();
        this.setupInvertControls();
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

    setTerminalMode(active) {
        this.inTerminal = active;
    }

    setupKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            // Unlock audio on first user key interaction
            if (this.audio) this.audio.unlock();

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
                    this.audio.enabled = !this.audio.enabled;
                }
                return;
            }

            // Toggle Fullscreen (F11 or Alt+Enter)
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault();
                this.toggleFullscreen();
                return;
            }


            // In Death Screen Modal: support tabs 1-5, [R] reload, [N] reroll, [M / Esc] menu, [u] identify, and full interactive terminal on Tab 0
            const deathModal = document.getElementById('death-modal');
            const isDeadModal = Boolean(deathModal && !deathModal.classList.contains('hidden'));
            const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
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
                    this.network.sendKey('R');
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
                        const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
                        window.location.href = `/?char=Hero_${randomId}`;
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

            const appState = (window.__app && typeof window.__app.getAppState === 'function')
                ? window.__app.getAppState()
                : 'game';

            // 1. Splash Screen Mode: Any key continues to Main Menu (matches Godot SplashContinueRequested)
            if (appState === 'splash') {
                if (e.key === '2' || e.key === 'g' || e.key === 'G') {
                    e.preventDefault();
                    if (window.__app) window.__app.showGuide(0, 'splash');
                    return;
                }
                if (e.key === '3' || e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    if (window.__app) window.__app.showGuide(5, 'splash');
                    return;
                }
                if (e.key === 'w' || e.key === 'W') {
                    e.preventDefault();
                    window.open('https://angband.readthedocs.io/', '_blank');
                    return;
                }
                // Any key advances from splash screen to main menu
                e.preventDefault();
                if (window.__app) window.__app.showMainMenu();
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
                if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.selectMenuItem(idx);
                        window.__app.activateMenuItem();
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

            // PWA Modal Escape handling
            if (appState === 'pwaModal') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (window.__app && window.__app.hidePWAModal) window.__app.hidePWAModal();
                    return;
                }
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
                    window.open('https://angband.readthedocs.io/', '_blank');
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

            // Quick toggle between 3D world and Classic CRT Terminal
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (this.audio) this.audio.playMenuNav();
                if (this.toggleTerminalView) this.toggleTerminalView();
                return;
            }

            // Escape: reliably cancel prompts, dismiss menus/overlays, or open Pause Menu (1:1 with Godot Main.cs:1820-1835)
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.audio) this.audio.playMenuNav();

                if (window.__app && window.__app.cancelQuickBirth) {
                    window.__app.cancelQuickBirth();
                }

                const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && (lastFrame.map || (lastFrame.player && lastFrame.player.name)));
                const screenText = (lastFrame && lastFrame.term && lastFrame.term.rows)
                    ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase()
                    : '';
                const isReviewScreen = !inPlay && (screenText.includes("use as is") || screenText.includes("'y': use") ||
                                       screenText.includes("to start over") || screenText.includes("r to reroll") ||
                                       screenText.includes("reroll") || screenText.includes("'s' to start") ||
                                       screenText.includes("step back") || screenText.includes("any other key to continue"));

                if (!inPlay) {
                    if (isReviewScreen) {
                        this.network.sendKey('s');
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

            // In Terminal Mode (Character creation, birth choices, help, shops)
            if (this.inTerminal) {
                this.handleTerminalKey(e);
                return;
            }

            // In 3D World Exploration Mode
            this.handleWorldKey(e);
        });
    }

    handleTerminalKey(e) {
        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && lastFrame.map);
        const screenText = (lastFrame && lastFrame.term && lastFrame.term.rows)
            ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase()
            : '';
        const isReviewScreen = !inPlay && (screenText.includes("use as is") || screenText.includes("'y': use") ||
                               screenText.includes("to start over") || screenText.includes("r to reroll") ||
                               screenText.includes("reroll") || screenText.includes("'s' to start") ||
                               screenText.includes("step back") || screenText.includes("any other key to continue"));

        // Reroll hotkey on review screen ('R') -> Re-randomize
        if (isReviewScreen && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            if (this.audio) this.audio.playMenuNav();
            if (window.__app && window.__app.rerollHero) {
                window.__app.rerollHero();
            } else {
                this.network.sendKey('s');
            }
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
            this.network.sendKey(e.key === 'y' || e.key === 'Y' ? 'y' : 'enter');
            if (window.__app && window.__app.confirmHeroBirth) {
                window.__app.confirmHeroBirth();
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

        let keySpec = null;

        if (e.key === 'ArrowUp' || e.code === 'Numpad8') keySpec = 'up';
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
            if (window.__app && window.__app.setForceTerminal) {
                window.__app.setForceTerminal(false);
            }
            window.__manualTerminalOpen = false;
        }
        else if (e.key === 'Backspace') keySpec = 'backspace';
        else if (e.key === 'Tab') keySpec = 'tab';
        else if (e.key === ' ') keySpec = 'space';
        else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) keySpec = e.key;

        if (keySpec) {
            e.preventDefault();
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

        // Head Tilt Up (PageUp) & Tilt Down (PageDown) & Recenter (Home)
        if (e.key === 'PageUp') {
            e.preventDefault();
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.min(0.48, (this.dungeon.userPitchOffset || 0) + 0.08);
            }
            return;
        }

        if (e.key === 'PageDown') {
            e.preventDefault();
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.max(-0.48, (this.dungeon.userPitchOffset || 0) - 0.08);
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

        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        const ui = lastFrame ? lastFrame.ui : null;

        // Context prompt (-more-) active: immediately dismiss with space (1:1 with Angband msg_flush)
        // and if a move or turn key was pressed, execute it so the character never gets stuck on stairs!
        if (ui && ui.more) {
            e.preventDefault();
            this.network.sendKey('space');

            if (e.key === 'ArrowLeft') {
                this.dungeon.turn(-1);
            } else if (e.key === 'ArrowRight') {
                this.dungeon.turn(1);
            } else if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                const moveKey = this.getRelativeDirectionKey(8);
                if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
            } else if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                const moveKey = this.getRelativeDirectionKey(2);
                if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
            }
            return;
        }

        // Turning is instant camera yaw (0 engine turns)
        // Holding Shift with ArrowLeft / ArrowRight executes Strafe Left / Strafe Right
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.shiftKey) {
                const moveKey = this.getRelativeDirectionKey(4); // Strafe Left
                if (moveKey) this.sendMovementKey(moveKey);
            } else {
                this.dungeon.turn(-1);
            }
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (e.shiftKey) {
                const moveKey = this.getRelativeDirectionKey(6); // Strafe Right
                if (moveKey) this.sendMovementKey(moveKey);
            } else {
                this.dungeon.turn(1);
            }
            return;
        }

        // Forward / Backward in current camera facing direction
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const moveKey = this.getRelativeDirectionKey(8);
            if (moveKey) this.sendMovementKey(moveKey);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const moveKey = this.getRelativeDirectionKey(2);
            if (moveKey) this.sendMovementKey(moveKey);
            return;
        }

        // Number Pad directional movement (Strictly Numpad only, NO WSAD, top-row digits remain repeat counts)
        // 8 = forward, 2 = back, 4 = strafe left, 6 = strafe right, diagonals 7,9,1,3, 5 = stay.
        const numpadDirMap = {
            'Numpad8': 8,
            'Numpad2': 2,
            'Numpad4': 4,
            'Numpad6': 6,
            'Numpad7': 7,
            'Numpad9': 9,
            'Numpad1': 1,
            'Numpad3': 3,
            'Numpad5': 5
        };

        if (numpadDirMap[e.code]) {
            e.preventDefault();
            const dir = numpadDirMap[e.code];
            const moveKey = this.getRelativeDirectionKey(dir);
            if (moveKey) {
                this.sendMovementKey(moveKey);
            }
            return;
        }

        if (e.key === '.') {
            e.preventDefault();
            this.network.sendKey('5'); // Rest 1 turn
            return;
        }

        // Attack swing on Space / Enter
        if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
            e.preventDefault();
            this.dungeon.triggerAttackAnimation();
            if (this.audio) this.audio.playWhoosh();
            this.network.sendKey('enter');
            return;
        }

        // General keys (e.g. 'i' for inventory, 'm' for cast spell, 'd' for drop, 'g' for pickup, 'q' for quaff, 'r' for read, 'w' for wear, 's' for sell/spike)
        // ALL single-character keys pass through to the Angband engine without interception!
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            if (this.audio) {
                const k = e.key;
                const kl = k.toLowerCase();
                if (kl === 'm' || kl === 'b' || kl === 'p') this.audio.playSpell();
                else if (kl === 'q') this.audio.playQuaff();
                else if (kl === 'r') this.audio.playScroll();
                else if (kl === 'g' || kl === ',') this.audio.playItemPickup();
                else if (kl === 'd') this.audio.playItemDrop();
                else if (k === 'E') this.audio.playEat();
                else if (k === 'w') this.audio.playEquipWeapon();
                else if (k === 'W') this.audio.playEquipArmor();
                else if (k === 't') this.audio.playItemDrop();
                else if (kl === 'o') this.audio.playDoor(true);
                else if (kl === 'c') this.audio.playDoor(false);
                else if (kl === 'f' || kl === 'v') this.audio.playBowShoot();
                else if (k === 'D') this.audio.playTrapDisarm();
                else if (kl === 'i' || kl === 'e') this.audio.playMenuOpen();
            }
            this.network.sendKey(e.key);
        }
    }

    /**
     * Angband movement key for a local direction (numpad 1-9) relative to current camera facing.
     * 1:1 mathematical parity with Godot client DungeonWorld.RelativeMoveKey.
     * 8 = Forward, 2 = Backward, 4 = Strafe Left, 6 = Strafe Right,
     * 7 = Forward-Left, 9 = Forward-Right, 1 = Backward-Left, 3 = Backward-Right, 5 = Stay.
     */
    getRelativeDirectionKey(numpadDir) {
        if (numpadDir === 5) return '5';
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

        const bind = (id, key) => {
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

                    if (key === 'attack') {
                        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                        if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                            this.network.sendKey('space');
                            return;
                        }
                        this.dungeon.triggerAttackAnimation();
                        if (this.audio) this.audio.playWhoosh();
                        const fwdKey = this.getRelativeDirectionKey(8) || 'up';
                        this.network.sendKey(fwdKey);
                    } else if (key === 'R') {
                        // In Angband, 'R' prompts for rest duration defaulting to '&' (rest until healed)
                        this.network.sendKey('R');
                        setTimeout(() => {
                            this.network.sendKey('enter');
                        }, 80);
                    } else if (key === 'o') {
                        // Open door in front of camera facing
                        if (this.audio) this.audio.playDoor();
                        const fwdKey = this.getRelativeDirectionKey(8) || 'up';
                        this.network.sendKey('o');
                        setTimeout(() => {
                            this.network.sendKey(fwdKey);
                        }, 80);
                    } else if (key === 'tab') {
                        if (this.toggleTerminalView) this.toggleTerminalView();
                    } else {
                        if (this.audio) {
                            if (key === 'm') this.audio.playSpell();
                            else if (key === 'i' || key === 'e' || key === 'v') this.audio.playMenuOpen();
                            else if (key === 'g') this.audio.playItemPickup();
                            else if (key === 'q') this.audio.playMenuOpen();
                            else if (key === 'r') this.audio.playMenuOpen();
                            else if (key === 'f') this.audio.playWhoosh();
                        }
                        this.network.sendKey(key);
                    }
                };

                bindReliableAction(btn, fire);
            }
        };

        bind('btn-attack', 'attack');
        bind('btn-throw', 'v');
        bind('btn-fire', 'f');
        bind('btn-cast', 'm');
        bind('btn-quaff', 'q');
        bind('btn-read', 'r');
        bind('btn-door', 'o');
        bind('btn-pickup', 'g');
        bind('btn-rest', 'R');
        bind('btn-inventory', 'i');
        bind('btn-equipment', 'e');
        bind('btn-terminal', 'tab');

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

        // Mobile / Tablet Action Drawer Toggle
        const actionMoreBtn = document.getElementById('btn-action-more');
        const actionBar = document.getElementById('action-bar');
        if (actionMoreBtn && actionBar) {
            let lastMoreTime = 0;
            const toggleDrawer = (ev) => {
                const now = Date.now();
                if (now - lastMoreTime < 180) return;
                lastMoreTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
                actionBar.classList.toggle('drawer-open');
                actionMoreBtn.textContent = actionBar.classList.contains('drawer-open') ? '✕ Close' : '⋯ More';
            };
            bindReliableAction(actionMoreBtn, toggleDrawer);

            actionBar.addEventListener('click', (ev) => {
                const target = ev.target ? ev.target.closest('.action-btn') : null;
                if (target && target.id !== 'btn-action-more') {
                    actionBar.classList.remove('drawer-open');
                    actionMoreBtn.textContent = '⋯ More';
                }
            });
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
                this.dungeon.userPitchOffset = Math.min(0.48, (this.dungeon.userPitchOffset || 0) + 0.08);
            }
        });
        bindClick('btn-tilt-reset', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = 0.0;
            }
        });
        bindClick('btn-tilt-down', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.max(-0.48, (this.dungeon.userPitchOffset || 0) - 0.08);
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

        const soundBtn = document.getElementById('btn-sound');
        if (soundBtn && !soundBtn._bound) {
            soundBtn._bound = true;
            soundBtn.addEventListener('click', () => {
                if (this.audio) {
                    this.audio.toggleMute();
                    if (window.__syncAudioUI) window.__syncAudioUI();
                }
            });
        }
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

                if (allowRepeat) {
                    clearTimeout(holdTimer);
                    clearInterval(repeatInterval);
                    holdTimer = setTimeout(() => {
                        repeatInterval = setInterval(() => {
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

        // Top Turning Shoulder Wings
        bindTouch('dpad-turn-left', () => {
            this.dungeon.turn(-1);
        }, false);

        bindTouch('dpad-turn-right', () => {
            this.dungeon.turn(1);
        }, false);

        // Directional cardinal and diagonal movement buttons support hold-to-repeat walking
        bindTouch('dpad-up', () => {
            const key = this.getRelativeDirectionKey(8);
            if (key) this.sendMovementKey(key);
        }, true);

        bindTouch('dpad-down', () => {
            const key = this.getRelativeDirectionKey(2);
            if (key) this.sendMovementKey(key);
        }, true);

        // Strafe Left & Strafe Right on primary D-pad cardinal wings
        bindTouch('dpad-left', () => {
            const key = this.getRelativeDirectionKey(4);
            if (key) this.sendMovementKey(key);
        }, true);

        bindTouch('dpad-right', () => {
            const key = this.getRelativeDirectionKey(6);
            if (key) this.sendMovementKey(key);
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
            const key = this.getRelativeDirectionKey(7);
            if (key) this.sendMovementKey(key);
        }, true);

        bindTouch('dpad-ur', () => {
            const key = this.getRelativeDirectionKey(9);
            if (key) this.sendMovementKey(key);
        }, true);

        bindTouch('dpad-dl', () => {
            const key = this.getRelativeDirectionKey(1);
            if (key) this.sendMovementKey(key);
        }, true);

        bindTouch('dpad-dr', () => {
            const key = this.getRelativeDirectionKey(3);
            if (key) this.sendMovementKey(key);
        }, true);
    }

    executeSmartAction(action) {
        if (action === 'descend') {
            this.network.sendKey('>');
        } else if (action === 'ascend') {
            this.network.sendKey('<');
        } else if (action === 'door') {
            if (this.audio) this.audio.playDoor();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey('o');
            setTimeout(() => {
                this.network.sendKey(fwdKey);
            }, 80);
        } else if (action === 'attack') {
            this.dungeon.triggerAttackAnimation();
            if (this.audio) this.audio.playWhoosh();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey(fwdKey);
        } else {
            // Wait / Rest 1 Turn
            this.network.sendKey('5');
        }
    }

    updateContextualControls(frame) {
        if (!frame || !frame.player || !frame.map) return;
        const player = frame.player;
        const px = player.x;
        const py = player.y;
        const dpadCenter = document.getElementById('dpad-center');
        if (!dpadCenter) return;

        // 1. Check if standing on stairs
        let currentFeat = 0;
        if (frame.map.rows && frame.map.rows[py] && frame.map.rows[py].f) {
            currentFeat = parseInt(frame.map.rows[py].f.substring(px * 2, px * 2 + 2), 16) || 0;
        }

        if (currentFeat === 6) { // Downstairs
            this.smartAction = 'descend';
            dpadCenter.textContent = '⬇';
            dpadCenter.title = 'Descend Staircase (>)';
            dpadCenter.classList.add('smart-active', 'smart-stairs');
            dpadCenter.classList.remove('smart-door', 'smart-attack');
            return;
        } else if (currentFeat === 5) { // Upstairs
            this.smartAction = 'ascend';
            dpadCenter.textContent = '⬆';
            dpadCenter.title = 'Ascend Staircase (<)';
            dpadCenter.classList.add('smart-active', 'smart-stairs');
            dpadCenter.classList.remove('smart-door', 'smart-attack');
            return;
        }

        // 2. Check facing direction
        const facing = (this.dungeon && typeof this.dungeon.facing === 'number') ? this.dungeon.facing : 0;
        const forwardOffsets = [
            { dx: 0, dy: -1 }, // 0: North
            { dx: 1, dy: 0 },  // 1: East
            { dx: 0, dy: 1 },  // 2: South
            { dx: -1, dy: 0 }  // 3: West
        ];
        const fwd = forwardOffsets[facing] || { dx: 0, dy: -1 };
        const frontX = px + fwd.dx;
        const frontY = py + fwd.dy;

        // Check if monster in front
        let monsterInFront = false;
        if (frame.monsters && Array.isArray(frame.monsters)) {
            monsterInFront = frame.monsters.some(m => m.x === frontX && m.y === frontY);
        }

        if (monsterInFront) {
            this.smartAction = 'attack';
            dpadCenter.textContent = '⚔';
            dpadCenter.title = 'Attack Monster in Front (Space)';
            dpadCenter.classList.add('smart-active', 'smart-attack');
            dpadCenter.classList.remove('smart-stairs', 'smart-door');
            return;
        }

        // Check if closed door in front
        let frontFeat = 0;
        if (frame.map.rows && frame.map.rows[frontY] && frame.map.rows[frontY].f) {
            frontFeat = parseInt(frame.map.rows[frontY].f.substring(frontX * 2, frontX * 2 + 2), 16) || 0;
        }

        if (frontFeat === 3 || frontFeat === 4) { // Closed or locked door
            this.smartAction = 'door';
            dpadCenter.textContent = '🚪';
            dpadCenter.title = 'Open Door in Front (o)';
            dpadCenter.classList.add('smart-active', 'smart-door');
            dpadCenter.classList.remove('smart-stairs', 'smart-attack');
            return;
        }

        // Default: Wait / Rest 1 turn
        this.smartAction = 'wait';
        dpadCenter.textContent = '●';
        dpadCenter.title = 'Rest / Wait 1 Turn (5)';
        dpadCenter.classList.remove('smart-active', 'smart-stairs', 'smart-door', 'smart-attack');
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
                    elem.webkitRequestFullscreen();
                } else if (elem.mozRequestFullScreen) {
                    elem.mozRequestFullScreen();
                } else if (elem.msRequestFullscreen) {
                    elem.msRequestFullscreen();
                }
            } else {
                if (doc.exitFullscreen) {
                    doc.exitFullscreen().catch(() => {});
                } else if (doc.webkitExitFullscreen) {
                    doc.webkitExitFullscreen();
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

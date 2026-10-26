/**
 * Angband3D HUD — Glassmorphic Fantasy User Interface, 2D Minimap Radar, Compass, and Death System
 * 1:1 Parity with the Godot C# desktop client (Overlay.cs).
 */

class WebHUD {
    constructor(minimapId) {
        this.minimapCanvas = document.getElementById(minimapId);
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.minimapContainer = document.getElementById('minimap-container');
        this.minimapHeader = document.getElementById('minimap-header');

        // Minimap sizing and zoom presets (Unified and responsive)
        this.minimapSizes = [
            { cls: 'standard', name: 'Standard', w: 260, h: 260 },
            { cls: 'expanded', name: 'Expanded', w: 360, h: 360 },
            { cls: 'tactical', name: 'Tactical', w: 460, h: 460 },
            { cls: 'compact', name: 'Compact', w: 168, h: 168 }
        ];
        this.minimapSizeIndex = 3;
        this.minimapZoom = 1.0;
        this.currentCameraYaw = 0;
        this.lastFrame = null;
        this.audio = null;

        this.applyMinimapSize();

        // Left Panel (Health, Mana, Attributes)
        this.hpFill = document.getElementById('hp-fill');
        this.hpGhostFill = document.getElementById('hp-ghost-fill');
        this.hpText = document.getElementById('hp-text');
        this.spFill = document.getElementById('sp-fill');
        this.spGhostFill = document.getElementById('sp-ghost-fill');
        this.spText = document.getElementById('sp-text');
        this.charTitle = document.getElementById('char-title');

        this.statStr = document.getElementById('stat-str');
        this.statInt = document.getElementById('stat-int');
        this.statWis = document.getElementById('stat-wis');
        this.statDex = document.getElementById('stat-dex');
        this.statCon = document.getElementById('stat-con');
        this.statChr = document.getElementById('stat-chr');
        this.statGra = document.getElementById('stat-gra');

        this.itemInt = document.getElementById('stat-item-int');
        this.itemWis = document.getElementById('stat-item-wis');
        this.itemChr = document.getElementById('stat-item-chr');
        this.itemGra = document.getElementById('stat-item-gra');
        this.itemGold = document.getElementById('stat-item-gold');

        this.spLabel = document.querySelector('.gauge-sp .gauge-header span:first-child');

        this.depthVal = document.getElementById('val-depth');
        this.goldVal = document.getElementById('val-gold');
        this.acVal = document.getElementById('val-ac');
        this.pingBadge = document.getElementById('ping-badge');

        // Compass (1:1 with Godot Overlay.cs:1750-1791)
        this.compassCanvas = document.getElementById('compass-canvas');
        this.compassCtx = this.compassCanvas ? this.compassCanvas.getContext('2d') : null;
        this.compassLabel = document.getElementById('compass-label');

        // Top Landscape Message Feed Window (Full message history with scrollback)
        this.messageFeedWindow = document.getElementById('message-feed-window');
        this.messageFeedList = document.getElementById('message-feed-list');
        this.messageFeedScroll = document.getElementById('message-feed-scroll');
        this.messageHistory = [];
        this.userScrolledUp = false;
        this.prevMessages = null;
        this.lastTermRow0 = '';
        this.currentTurn = 0;
        this.isDeadInPlay = false;

        // Detailed 3-Row Telemetry Footer (Matches Overlay.cs:1620-1740)
        this.footerDiagonalHint = document.getElementById('footer-diagonal-hint');
        this.footerStairsHint = document.getElementById('footer-stairs-hint');
        this.footerLevel = document.getElementById('footer-level');
        this.footerExp = document.getElementById('footer-exp');
        this.footerPlace = document.getElementById('footer-place');
        this.footerSpeed = document.getElementById('footer-speed');
        this.footerLight = document.getElementById('footer-light');
        this.footerFacing = document.getElementById('footer-facing');

        this.footerTarget = document.getElementById('footer-target');
        this.reticleTargetCard = document.getElementById('reticle-target-card');
        this.footerBadges = document.getElementById('footer-badges');
        this.footerGear = document.getElementById('footer-gear');

        // Death Screen Modal Elements (Matches Overlay.cs:840-935)
        this.deathModal = document.getElementById('death-modal');
        this.deathEpitaph = document.getElementById('death-epitaph');
        this.deathCause = document.getElementById('death-cause');
        this.deathScore = document.getElementById('death-score');
        this.deathTabs = document.querySelectorAll('.death-tab');
        this.deathContents = document.querySelectorAll('.death-tab-content');
        this.activeDeathTab = 0;
        this.deathTerminal = null;

        this.setupMinimapControls();
        this.setupCharacterPanelShortcuts();
        this.setupDeathModal();
        this.setupMessageFeed();
        this.initUniversalMovableHud();
        this.setDockPreset();

        // Offscreen canvas cache for static minimap tiles (eliminates hundreds of fillText calls per frame on turn)
        this.minimapTileCanvas = document.createElement('canvas');
        this.minimapTileCtx = this.minimapTileCanvas.getContext('2d');
        this.minimapTileCacheKey = '';
    }

    /* -------------------------------------------------------------
     * Minimap Scale and Zoom Controls
     * ------------------------------------------------------------- */
    applyMinimapSize() {
        const size = this.minimapSizes[this.minimapSizeIndex];
        if (!size || !this.minimapCanvas) return;

        this.minimapCanvas.width = size.w;
        this.minimapCanvas.height = size.h;
        this.minimapCanvas.style.width = '';
        this.minimapCanvas.style.height = '';

        if (this.minimapContainer) {
            this.minimapContainer.classList.remove('compact', 'standard', 'expanded', 'tactical', 'command', 'minimap-size-compact');
            if (size.cls === 'compact') this.minimapContainer.classList.add('minimap-size-compact');
            this.minimapContainer.classList.add(size.cls);
            this.minimapContainer.style.width = `${size.w}px`;
            this.minimapContainer.style.height = 'auto';
        }

        this.updateMinimapHeader();

        if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
            this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], this.currentCameraYaw);
        }
    }

    setPing(ms) {
        if (this.pingBadge) {
            if (ms === 0) {
                this.pingBadge.textContent = '⚡ Local [0ms]';
                this.pingBadge.style.color = '#38bdf8';
            } else {
                this.pingBadge.textContent = `Cloud [${ms}ms]`;
                this.pingBadge.style.color = ms < 100 ? '#62e062' : (ms < 250 ? '#ffd700' : '#ff7777');
            }
        }
    }

    setStatus(status) {
        if (this.pingBadge) {
            this.pingBadge.textContent = status;
            if (status.includes('Connecting')) {
                this.pingBadge.style.color = '#ffd700';
            } else if (status.includes('Connected')) {
                this.pingBadge.style.color = '#62e062';
            } else if (status.includes('Disconnected') || status.includes('Error')) {
                this.pingBadge.style.color = '#ff5555';
            }
        }
    }

    setupMessageFeed() {
        this.messageFeedWindow = document.getElementById('message-feed-window');
        this.messageFeedList = document.getElementById('message-feed-list');
        this.messageFeedScroll = document.getElementById('message-feed-scroll');
        if (!this.messageHistory) this.messageHistory = [];
        this.userScrolledUp = false;

        const btnScrollTop = document.getElementById('btn-msg-scroll-top');
        if (btnScrollTop) {
            btnScrollTop.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.messageFeedScroll) {
                    this.messageFeedScroll.scrollTop = 0;
                    this.userScrolledUp = true;
                }
            });
        }

        const btnScrollBottom = document.getElementById('btn-msg-scroll-bottom');
        if (btnScrollBottom) {
            btnScrollBottom.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.messageFeedScroll) {
                    this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
                    this.userScrolledUp = false;
                }
            });
        }

        const btnClear = document.getElementById('btn-msg-clear');
        if (btnClear) {
            btnClear.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.messageFeedList) {
                    this.messageFeedList.innerHTML = '';
                }
                this.messageHistory = [];
                this.userScrolledUp = false;
            });
        }

        const btnToggleSize = document.getElementById('btn-msg-size-toggle');
        if (btnToggleSize) {
            btnToggleSize.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.messageFeedWindow) {
                    this.messageFeedWindow.style.height = '';
                    this.messageFeedWindow.classList.toggle('expanded');
                    const isExpanded = this.messageFeedWindow.classList.contains('expanded');
                    btnToggleSize.textContent = isExpanded ? '▼ Compact' : '▲ Expand';
                    btnToggleSize.title = isExpanded ? 'Collapse Message Log to 4 lines' : 'Expand Message Log to show full history';
                    if (isExpanded) {
                        this.messageFeedWindow.classList.remove('is-idle');
                    } else {
                        this.resetMessageFeedIdleTimer();
                    }
                    if (this.messageFeedScroll) {
                        this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
                    }
                }
            });
        }

        const moreBadge = document.getElementById('msg-more-indicator');
        if (moreBadge) {
            moreBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.__app && window.__app.network) {
                    window.__app.network.sendKey('space');
                }
            });
        }

        if (this.messageFeedWindow) {
            this.messageFeedWindow.addEventListener('mouseenter', () => {
                this.resetMessageFeedIdleTimer();
            });
        }

        if (this.messageFeedScroll) {
            this.messageFeedScroll.addEventListener('scroll', () => {
                const maxScroll = this.messageFeedScroll.scrollHeight - this.messageFeedScroll.clientHeight;
                // If within 20px of bottom, stick to bottom on new messages
                this.userScrolledUp = (maxScroll - this.messageFeedScroll.scrollTop) > 20;
            });
            // Stop wheel / key navigation from leaking to game movement when interacting with feed
            this.messageFeedScroll.addEventListener('keydown', (e) => {
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                    e.stopPropagation();
                }
            });
        }
    }

    resetMessageFeedIdleTimer() {
        if (!this.messageFeedWindow) {
            this.messageFeedWindow = document.getElementById('message-feed-window');
        }
        if (this.messageFeedWindow) {
            this.messageFeedWindow.classList.remove('is-idle');
        }
        if (this._msgFeedIdleTimer) {
            clearTimeout(this._msgFeedIdleTimer);
            this._msgFeedIdleTimer = null;
        }
        this._msgFeedIdleTimer = setTimeout(() => {
            if (this.messageFeedWindow && !this.messageFeedWindow.classList.contains('expanded')) {
                this.messageFeedWindow.classList.add('is-idle');
            }
        }, 6000);
    }

    resetMessages(welcomeText = null) {
        if (!this.messageFeedList) {
            this.messageFeedList = document.getElementById('message-feed-list');
            this.messageFeedScroll = document.getElementById('message-feed-scroll');
        }
        if (this.messageFeedList) {
            this.messageFeedList.innerHTML = '';
        }
        this.messageHistory = [];
        this.prevMessages = [];
        this.lastTermRow0 = null;
        if (welcomeText) {
            this.addMessage(welcomeText, '#ffd700');
        }
    }

    getMessageColor(text, attr) {
        if (!text) return '#c8d1dc';
        const t = text.toLowerCase();
        if (t.includes('you hit') || t.includes('you slash') || t.includes('you crush') || 
            t.includes('you smite') || t.includes('you shoot') || t.includes('you destroy') || 
            t.includes('dies.') || t.includes('destroyed.') || t.includes('killed.')) {
            return '#ffd166'; // Player offensive success (Gold)
        }
        if (t.includes('hit') || t.includes('slash') || t.includes('crush') || 
            t.includes('bite') || t.includes('claw') || t.includes('sting') || 
            t.includes('touch') || t.includes('spit') || t.includes('breath') || 
            t.includes('burn') || t.includes('wounds') || t.includes('damage') ||
            t.includes('attacks')) {
            return '#ff6b6b'; // Monster attacks player (Light Red)
        }
        if (t.includes('heal') || t.includes('feel very good') || t.includes('cure') || 
            t.includes('restore') || t.includes('regenerate')) {
            return '#06d6a0'; // Healing (Emerald Green)
        }
        if (t.includes('spell') || t.includes('prayer') || t.includes('magic') || 
            t.includes('scroll') || t.includes('glows') || t.includes('shines') || 
            t.includes('teleport') || t.includes('detect')) {
            return '#4cc9f0'; // Magic (Sky Blue)
        }
        if (t.includes('cannot') || t.includes('no potions') || t.includes('no scrolls') || 
            t.includes('nothing to fire') || t.includes('no spells') || t.includes('wall in the way') || 
            t.includes('nothing there') || t.includes('misses you') || t.includes('you miss')) {
            return '#ff9900'; // Warning / Miss / Blocked (Orange)
        }
        if (window.getAngbandColorString && attr !== undefined && attr > 1) {
            return window.getAngbandColorString(attr);
        }
        return '#c8d1dc'; // Default clear text (Light Slate)
    }

    isCombatMessage(text) {
        if (!text) return false;
        const t = text.toLowerCase();
        return t.includes('you hit') || t.includes('you slash') || t.includes('you crush') ||
               t.includes('you smite') || t.includes('you shoot') || t.includes('you miss') ||
               t.includes('misses you') || t.includes('bites you') || t.includes('claws you') ||
               t.includes('stings you') || t.includes('hits you') || t.includes('crushes you') ||
               t.includes('slashes you') || t.includes('touches you') || t.includes('spits on you') ||
               t.includes('burns you') || t.includes('wounds you') || t.includes('damage') ||
               t.includes('attacks') || t.includes('dies.') || t.includes('destroyed.') ||
               t.includes('killed.') || t.includes('casts a spell') || t.includes('breathes') ||
               t.includes('screams in agony');
    }

    addMessage(text, color = '#ffd700', rawText = null) {
        if (!text || !text.trim()) return;
        let trimmed = text.trim();
        if (trimmed.startsWith('---') || trimmed.startsWith('===')) return;

        // Clean out trailing prompt suffixes like " -more-" or " [more]"
        trimmed = trimmed.replace(/\s*[-–—]more[-–—]\s*$/i, '');
        trimmed = trimmed.replace(/\s*\[more\]\s*$/i, '');
        trimmed = trimmed.trim();
        if (!trimmed) return;

        // Strictly reject noisy setup fragments
        const lower = trimmed.toLowerCase();
        if (lower.includes('accept character history') ||
            lower.includes('to start over') ||
            lower.includes('r to reroll') ||
            lower.includes('point-based') ||
            lower.includes('standard roller') ||
            lower.includes('quick roller') ||
            lower.includes('character sheet') ||
            lower.includes('choose race') ||
            lower.includes('choose class') ||
            lower.includes('select an option') ||
            lower.includes('press any key') ||
            trimmed === "' . ." ||
            trimmed === "'.'") {
            return;
        }

        if (!this.messageFeedList) {
            this.messageFeedList = document.getElementById('message-feed-list');
            this.messageFeedScroll = document.getElementById('message-feed-scroll');
        }
        if (!this.messageHistory) {
            this.messageHistory = [];
        }

        const now = Date.now();
        const baseText = rawText || trimmed;
        const isCombat = this.isCombatMessage(trimmed);

        const realm = (this.lastFrame && this.lastFrame.realm) || (window.activeRealm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
        const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
        let displayText = trimmed;
        if (realm === 'hengband' && typeof window !== 'undefined' && typeof window.localizeGameMessage === 'function') {
            displayText = window.localizeGameMessage(baseText, 'hengband', lang);
        }

        // Only collapse non-combat, repetitive status notices (e.g. repeatedly bumping into a wall)
        const lastMsg = this.messageHistory.length > 0 ? this.messageHistory[this.messageHistory.length - 1] : null;
        if (!isCombat && lastMsg && (lastMsg.rawText === baseText || lastMsg.text === displayText || lastMsg.text === trimmed)) {
            lastMsg.repeat = (lastMsg.repeat || 1) + 1;
            if (lastMsg.el) {
                lastMsg.el.textContent = `${lastMsg.text || displayText} (x${lastMsg.repeat})`;
            }
            if (this.messageFeedScroll && !this.userScrolledUp) {
                this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
            }
            this.resetMessageFeedIdleTimer();
            return;
        }

        // Remove .latest highlight from previously newest entry
        if (this.messageFeedList && this.messageFeedList.lastElementChild) {
            this.messageFeedList.lastElementChild.classList.remove('latest');
        }

        const el = document.createElement('div');
        el.className = 'feed-line latest';
        el.textContent = displayText;
        if (color) el.style.color = color;

        if (this.messageFeedList) {
            this.messageFeedList.appendChild(el);
        }

        const msgObj = {
            id: now + '_' + Math.random(),
            text: displayText,
            rawText: baseText,
            repeat: 1,
            color,
            turn: this.currentTurn,
            timestamp: now,
            el
        };
        this.messageHistory.push(msgObj);

        // Keep last 500 game messages in DOM history
        if (this.messageHistory.length > 500) {
            const evicted = this.messageHistory.shift();
            if (evicted.el && evicted.el.parentNode) {
                evicted.el.parentNode.removeChild(evicted.el);
            }
        }

        // Auto-scroll to bottom unless player explicitly scrolled up to read history
        if (this.messageFeedScroll && !this.userScrolledUp) {
            this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
        }
        this.resetMessageFeedIdleTimer();
    }

    updateLastMessageCount(rawText, count) {
        if (!this.messageHistory || this.messageHistory.length === 0) return;
        const lastMsg = this.messageHistory[this.messageHistory.length - 1];
        if (lastMsg && (lastMsg.rawText === rawText || lastMsg.text === rawText || lastMsg.text.startsWith(rawText))) {
            lastMsg.repeat = count;
            if (lastMsg.el) {
                lastMsg.el.textContent = `${lastMsg.text || lastMsg.rawText || rawText} (x${count})`;
            }
            if (this.messageFeedScroll && !this.userScrolledUp) {
                this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
            }
            this.resetMessageFeedIdleTimer();
        }
    }

    tickMessageQueue() {
        // With persistent landscape window, messages do not disappear from view, but retain history!
    }

    updateTopMessageBanner(frame) {
        const banner = document.getElementById('top-message-banner');
        const textEl = document.getElementById('message-text');
        if (!banner || !textEl || !frame) return;

        const ui = frame.ui || {};
        const isPrompt = Boolean(ui.more || (!ui.awaiting_command && (ui.overlay || 0) === 0));

        let displayMsg = '';
        if (frame.term && frame.term.rows && frame.term.rows[0] && frame.term.rows[0].g) {
            let row0 = frame.term.rows[0].g.trim();
            if (row0.length > 0 && !row0.startsWith('===') && !row0.startsWith('---') &&
                !row0.includes('名前を入力') && !row0.includes('キャラ')) {
                displayMsg = row0;
            }
        }

        if (!displayMsg && frame.messages && Array.isArray(frame.messages) && frame.messages.length > 0) {
            const valid = frame.messages.filter(m => m && m.text && m.text.trim().length > 0 &&
                !m.text.trim().startsWith('===') && !m.text.trim().startsWith('---'));
            if (valid.length > 0) {
                const last = valid[valid.length - 1];
                displayMsg = last.text.trim();
                if (last.count && last.count > 1 && !this.isCombatMessage(displayMsg)) {
                    displayMsg += ` (x${last.count})`;
                }
            }
        }

        if (displayMsg) {
            const realm = (frame && frame.realm) || (this.lastFrame && this.lastFrame.realm) || (window.activeRealm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
            const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
            let localizedMsg = displayMsg;
            if (realm === 'hengband' && typeof window !== 'undefined') {
                if (window.HengTranslate && window.__hengTranslatorV2 !== false) {
                    localizedMsg = window.HengTranslate.translateLine(displayMsg, lang);
                } else if (typeof window.localizeGameMessage === 'function') {
                    localizedMsg = window.localizeGameMessage(displayMsg, 'hengband', lang);
                }
            }
            textEl.textContent = localizedMsg;
            textEl.title = localizedMsg;
            if (isPrompt) {
                banner.classList.add('prompt');
                textEl.style.color = '#ffd700';
            } else {
                banner.classList.remove('prompt');
                textEl.style.color = this.getMessageColor(displayMsg);
            }
        } else {
            textEl.title = '';
        }
    }

    extractNewMessages(prevList, currentList) {
        if (!prevList || prevList.length === 0) return currentList || [];
        if (!currentList || currentList.length === 0) return [];

        const maxK = Math.min(prevList.length, currentList.length);
        for (let k = maxK; k > 0; k--) {
            let match = true;
            for (let j = 0; j < k; j++) {
                const p = prevList[prevList.length - k + j];
                const c = currentList[j];
                if (p.text !== c.text || p.attr !== c.attr) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return currentList.slice(k);
            }
        }
        return currentList;
    }

    cycleMinimapSize(delta = 1) {
        this.minimapSizeIndex = (this.minimapSizeIndex + delta + this.minimapSizes.length) % this.minimapSizes.length;
        if (this.audio) this.audio.playMenuNav();
        this.applyMinimapSize();
    }

    adjustMinimapZoom(delta) {
        this.minimapZoom = Math.max(0.5, Math.min(3.0, Math.round((this.minimapZoom + delta) * 100) / 100));
        if (this.audio) this.audio.playMenuNav();
        this.updateMinimapHeader();
        if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
            this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], this.currentCameraYaw);
        }
    }

    resetMinimapZoom() {
        this.minimapZoom = 1.0;
        if (this.audio) this.audio.playMenuNav();
        this.updateMinimapHeader();
        if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
            this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], this.currentCameraYaw);
        }
    }

    updateMinimapHeader() {
        const size = this.minimapSizes[this.minimapSizeIndex];
        const hintEl = document.getElementById('minimap-hint-text');
        if (hintEl && size) {
            hintEl.textContent = `[⛶] ${size.name} • ${this.minimapZoom.toFixed(1)}x`;
        }
    }

    setCustomMinimapSize(w, h) {
        if (!this.minimapCanvas) return;
        const validW = Math.max(168, Math.min(800, Math.round(w)));
        const validH = Math.max(168, Math.min(800, Math.round(h)));
        if (this.minimapContainer) {
            this.minimapContainer.classList.remove('compact', 'standard', 'expanded', 'tactical', 'command', 'minimap-size-compact');
            this.minimapContainer.style.width = `${validW}px`;
            this.minimapContainer.style.height = `${validH}px`;
        }
        // Deduct ~64px for header, controls bar, and tilt bar so canvas fills the container cleanly
        const canvasH = Math.max(110, validH - 64);
        this.minimapCanvas.width = validW;
        this.minimapCanvas.height = canvasH;
        this.minimapCanvas.style.width = `${validW}px`;
        this.minimapCanvas.style.height = `${canvasH}px`;
        this.updateMinimapHeader();
        if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
            this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], this.currentCameraYaw);
        }
    }

    setMinimapZoom(val) {
        this.minimapZoom = Math.max(0.5, Math.min(3.0, Math.round(val * 100) / 100));
        this.updateMinimapHeader();
        if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
            this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], this.currentCameraYaw);
        }
    }

    setupMinimapControls() {
        // Minimap header is dedicated to window dragging/repositioning.
        // Resizing is done via [ / ] keys, #btn-map-toggle-size button, or the bottom-right resize grip.
        if (this.minimapHeader) {
            this.minimapHeader.style.cursor = 'grab';
        }

        if (this.minimapContainer) {
            this.minimapContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.adjustMinimapZoom(e.deltaY < 0 ? 0.15 : -0.15);
            }, { passive: false });
        }

        const btnZoomOut = document.getElementById('btn-map-zoom-out');
        if (btnZoomOut) {
            btnZoomOut.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adjustMinimapZoom(-0.2);
            });
        }

        const btnZoomIn = document.getElementById('btn-map-zoom-in');
        if (btnZoomIn) {
            btnZoomIn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adjustMinimapZoom(0.2);
            });
        }

        // Mobile Minimap Floating Zoom Buttons
        const btnMobZoomIn = document.getElementById('btn-mobile-map-zoom-in');
        if (btnMobZoomIn) {
            btnMobZoomIn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
                    window.DeviceProfile.triggerHaptic('light');
                }
                this.adjustMinimapZoom(0.25);
            });
        }

        const btnMobZoomOut = document.getElementById('btn-mobile-map-zoom-out');
        if (btnMobZoomOut) {
            btnMobZoomOut.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
                    window.DeviceProfile.triggerHaptic('light');
                }
                this.adjustMinimapZoom(-0.25);
            });
        }

        // Touch Pinch-to-Zoom on Minimap Canvas
        if (this.minimapCanvas) {
            let initialPinch = null;
            let initialZoom = 1.0;
            this.minimapCanvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinch = Math.hypot(dx, dy);
                    initialZoom = this.minimapZoom;
                }
            }, { passive: true });

            this.minimapCanvas.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && initialPinch) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.hypot(dx, dy);
                    const factor = dist / initialPinch;
                    this.setMinimapZoom(initialZoom * factor);
                }
            }, { passive: true });

            const endTouch = () => { initialPinch = null; };
            this.minimapCanvas.addEventListener('touchend', endTouch, { passive: true });
            this.minimapCanvas.addEventListener('touchcancel', endTouch, { passive: true });

            // Interactive Minimap Hover Tooltip & Click-to-Inspect
            this.minimapCanvas.addEventListener('mousemove', (e) => {
                if (!this.lastFrame || !this.lastFrame.map || !this.lastFrame.player) return;
                const rect = this.minimapCanvas.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const scaleX = this.minimapCanvas.width / rect.width;
                const scaleY = this.minimapCanvas.height / rect.height;
                const cellSize = this._minimapCellSize || Math.max(4, Math.min(48, Math.round(12 * this.minimapZoom)));
                const mx = (this._minimapOx || 0) + Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
                const my = (this._minimapOy || 0) + Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
                const label = this.describeMinimapCell(mx, my);
                const hintEl = document.getElementById('minimap-hint-text');
                if (hintEl && label) {
                    hintEl.textContent = `${label} • Click to Travel`;
                    hintEl.style.color = '#ffd700';
                }
                this.minimapCanvas.title = label ? `${label} (Click to Auto-Navigate)` : 'Minimap Radar (Click to Auto-Navigate)';
            });

            this.minimapCanvas.addEventListener('mouseleave', () => {
                const hintEl = document.getElementById('minimap-hint-text');
                if (hintEl) hintEl.style.color = '';
                this.updateMinimapHeader();
            });

            this.minimapCanvas.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.lastFrame || !this.lastFrame.map || !this.lastFrame.player) return;
                const rect = this.minimapCanvas.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const scaleX = this.minimapCanvas.width / rect.width;
                const scaleY = this.minimapCanvas.height / rect.height;
                const cellSize = this._minimapCellSize || Math.max(4, Math.min(48, Math.round(12 * this.minimapZoom)));
                const mx = (this._minimapOx || 0) + Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
                const my = (this._minimapOy || 0) + Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
                const monsters = Array.isArray(this.lastFrame.monsters) ? this.lastFrame.monsters : [];
                const hitMon = monsters.find(m => m && m.visible !== false && m.x === mx && m.y === my);
                if (hitMon) {
                    if (window.chronicleManager && typeof window.chronicleManager.interactWithCreature === 'function') {
                        window.chronicleManager.interactWithCreature(hitMon);
                    }
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    this.updateTargetInspector({ target: { name: hitMon.name, glyph: hitMon.glyph, pct: hitMon.hp_max > 0 ? Math.round((hitMon.hp / hitMon.hp_max) * 100) : 100, visible: true } }, realm);
                    return;
                }
                const inp = (window.__app && window.__app.input) || null;
                if (inp && typeof inp.startMinimapAutoNav === 'function') {
                    this._hoverMinimapPath = null;
                    this._lastHoverMx = null;
                    this._lastHoverMy = null;
                    inp.startMinimapAutoNav(mx, my, this.lastFrame);
                }
            });

            this.minimapCanvas.addEventListener('mousemove', (e) => {
                if (!this.lastFrame || !this.lastFrame.player) {
                    if (this._hoverMinimapPath) {
                        this._hoverMinimapPath = null;
                        this._lastHoverMx = null;
                        this._lastHoverMy = null;
                        this.updateMinimap(this.lastFrame);
                    }
                    return;
                }
                const inp = (window.__app && window.__app.input) || null;
                if (!inp || (inp._autoNav && inp._autoNav.active)) {
                    if (this._hoverMinimapPath) {
                        this._hoverMinimapPath = null;
                        this._lastHoverMx = null;
                        this._lastHoverMy = null;
                        this.updateMinimap(this.lastFrame);
                    }
                    return;
                }
                const rect = this.minimapCanvas.getBoundingClientRect();
                const scaleX = this.minimapCanvas.width / rect.width;
                const scaleY = this.minimapCanvas.height / rect.height;
                const cellSize = this._minimapCellSize || Math.max(4, Math.min(48, Math.round(12 * this.minimapZoom)));
                const mx = (this._minimapOx || 0) + Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
                const my = (this._minimapOy || 0) + Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);

                if (this._lastHoverMx === mx && this._lastHoverMy === my) {
                    return;
                }
                this._lastHoverMx = mx;
                this._lastHoverMy = my;

                if (typeof inp.computeMinimapPath === 'function') {
                    const newPath = inp.computeMinimapPath(this.lastFrame, this.lastFrame.player.x, this.lastFrame.player.y, mx, my);
                    this._hoverMinimapPath = (newPath && newPath.length > 0) ? newPath : null;
                    this.updateMinimap(this.lastFrame);
                }
            });

            this.minimapCanvas.addEventListener('mouseleave', () => {
                this._lastHoverMx = null;
                this._lastHoverMy = null;
                if (this._hoverMinimapPath) {
                    this._hoverMinimapPath = null;
                    if (this.lastFrame) {
                        this.updateMinimap(this.lastFrame);
                    }
                }
            });
        }

        const btnToggleSize = document.getElementById('btn-map-toggle-size');
        if (btnToggleSize) {
            btnToggleSize.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cycleMinimapSize(1);
            });
        }

        const btnRecenter = document.getElementById('btn-map-recenter');
        if (btnRecenter) {
            btnRecenter.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetMinimapZoom();
            });
        }
    }

    describeMinimapCell(mx, my) {
        const frame = this.lastFrame;
        if (!frame || !frame.map || !frame.player) return '';
        const map = frame.map;
        if (mx < 0 || my < 0 || mx >= map.w || my >= map.h) return '';
        if (mx === frame.player.x && my === frame.player.y) {
            return `Hero (${mx},${my})`;
        }
        const monsters = Array.isArray(frame.monsters) ? frame.monsters : [];
        const mon = monsters.find(m => m && m.visible !== false && m.x === mx && m.y === my);
        if (mon) {
            return `⚔ ${mon.name || 'Creature'} (${mx},${my})`;
        }
        const items = Array.isArray(frame.items) ? frame.items : [];
        const item = items.find(it => it && it.x === mx && it.y === my);
        if (item) {
            return `💎 ${item.name || 'Item'} (${mx},${my})`;
        }
        const row = map.rows && map.rows[my];
        if (!row || !row.g || mx >= row.g.length) return '';
        const flag = (row.l && mx < row.l.length) ? (parseInt(row.l[mx], 16) || 0) : 0;
        const outdoors = (frame.player && frame.player.depth === 0) || Boolean(frame.is_wild_mode);
        if (!outdoors && (flag & 0x3) === 0) return `Unexplored (${mx},${my})`;
        const ch = row.g[mx];
        const feat = this.getFeatAt(map, mx, my);
        if (ch === '<' || feat === 5) return `⬆ Stairs Up (${mx},${my})`;
        if (ch === '>' || feat === 6) return `⬇ Stairs Down (${mx},${my})`;
        if (ch === '0' || feat === 37) return `⚒ Smithing Forge (${mx},${my})`;
        if ((ch >= '1' && ch <= '9') || this.isStoreKind(feat)) return `🏛 Store [${ch}] (${mx},${my})`;
        if (ch === '+' || ch === '\'') return `🚪 Door (${mx},${my})`;
        if (ch === '^') return `⚠ Trap (${mx},${my})`;
        if (ch === '%' || ch === '*') return `⛏ Mineral Vein (${mx},${my})`;
        if (ch === '#') return `🧱 Wall (${mx},${my})`;
        if (ch === '.') return `Floor (${mx},${my})`;
        return `[${ch}] (${mx},${my})`;
    }

    sendQuickHudCommand(key) {
        if (!key || !this.lastFrame || this.lastFrame.phase !== 'play') return;
        const net = (window.__app && window.__app.network) || window.__network;
        if (!net || typeof net.sendKey !== 'function') return;
        if (this.lastFrame.ui && this.lastFrame.ui.more) {
            net.sendKey('space');
        }
        net.sendKey(key);
    }

    setupCharacterPanelShortcuts() {
        const charPanel = document.getElementById('char-panel');
        if (charPanel) {
            charPanel.style.cursor = 'pointer';
            charPanel.title = 'Click to open full Character Sheet [C]';
            charPanel.addEventListener('click', (e) => {
                if (e.target && e.target.closest('button, a, input')) return;
                if (this._hudWasDragged) return;
                this.sendQuickHudCommand('C');
            });
        }
        const bindPill = (el, key, tip) => {
            if (!el) return;
            el.style.cursor = 'pointer';
            el.title = tip;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.sendQuickHudCommand(key);
            });
        };
        bindPill(this.footerCharIdentity, 'C', 'Click to open Character Sheet [C]');
        bindPill(this.footerLevel, 'C', 'Click to open Character Sheet [C]');
        bindPill(this.footerGear, 'e', 'Click to inspect Equipped Gear [e]');
        bindPill(this.footerPlace, 'M', 'Click to open Full Level Map [M]');
    }

    /* -------------------------------------------------------------
     * Universal 60 FPS Moveable HUD & Cross-Platform Persistence (Wave 10 Track B)
     * ------------------------------------------------------------- */
    initUniversalMovableHud() {
        this._hudWasDragged = false;

        const widgets = [
            { id: 'touch-controls', handleId: 'dpad-drag-handle' },
            { id: 'char-panel', handleId: 'char-drag-handle' },
            { id: 'hud-center-column', handleId: 'action-bar-drag-handle' },
            { id: 'compass-container', handleId: 'compass-container' }
        ];

        widgets.forEach(({ id, handleId }) => {
            const widgetEl = document.getElementById(id);
            const handleEl = document.getElementById(handleId);
            if (!widgetEl || !handleEl) return;

            if (id === 'compass-container') {
                widgetEl.style.cursor = 'grab';
            }

            let isDragging = false;
            let isPending = false;
            let startX = 0, startY = 0;
            let initialLeft = 0, initialTop = 0;
            let widgetW = 0, widgetH = 0;

            const onStart = (clientX, clientY, e) => {
                if (e && e.target && e.target.closest('button, a, input, select, kbd')) return;
                isPending = true;
                isDragging = false;
                startX = clientX;
                startY = clientY;
                const rect = widgetEl.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                widgetW = rect.width;
                widgetH = rect.height;
            };

            const onMove = (clientX, clientY, e) => {
                if (!isPending && !isDragging) return;
                const dx = clientX - startX;
                const dy = clientY - startY;

                if (isPending) {
                    if (Math.hypot(dx, dy) > 4) {
                        isPending = false;
                        isDragging = true;
                        this._hudWasDragged = true;
                        widgetEl.classList.add('hud-widget-dragging');
                        widgetEl.style.position = 'fixed';
                        widgetEl.style.right = 'auto';
                        widgetEl.style.bottom = 'auto';
                        widgetEl.style.margin = '0';
                    } else {
                        return;
                    }
                }

                if (isDragging) {
                    if (e && e.cancelable && e.preventDefault) e.preventDefault();
                    const newLeft = initialLeft + dx;
                    const newTop = initialTop + dy;
                    const minX = 4;
                    const maxX = Math.max(4, window.innerWidth - widgetW - 4);
                    const minY = 36;
                    const maxY = Math.max(36, window.innerHeight - widgetH - 4);
                    const clampedX = Math.max(minX, Math.min(newLeft, maxX));
                    const clampedY = Math.max(minY, Math.min(newTop, maxY));

                    widgetEl.style.left = `${clampedX}px`;
                    widgetEl.style.top = `${clampedY}px`;
                }
            };

            const onEnd = () => {
                if (isDragging) {
                    widgetEl.classList.remove('hud-widget-dragging');
                    const rect = widgetEl.getBoundingClientRect();
                    const clampedX = Math.max(4, Math.min(rect.left, window.innerWidth - rect.width - 4));
                    const clampedY = Math.max(36, Math.min(rect.top, window.innerHeight - rect.height - 4));
                    const xRatio = clampedX / Math.max(1, window.innerWidth);
                    const yRatio = clampedY / Math.max(1, window.innerHeight);

                    this.saveHudWidgetPosition(id, { xRatio, yRatio });
                    setTimeout(() => {
                        this._hudWasDragged = false;
                    }, 150);
                }
                isPending = false;
                isDragging = false;
            };

            handleEl.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                onStart(e.clientX, e.clientY, e);
                const onMouseMove = (ev) => onMove(ev.clientX, ev.clientY, ev);
                const onMouseUp = () => {
                    onEnd();
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            handleEl.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    onStart(e.touches[0].clientX, e.touches[0].clientY, e);
                }
            }, { passive: true });

            handleEl.addEventListener('touchmove', (e) => {
                if ((isPending || isDragging) && e.touches.length === 1) {
                    onMove(e.touches[0].clientX, e.touches[0].clientY, e);
                }
            }, { passive: false });

            const touchEndHandler = () => onEnd();
            handleEl.addEventListener('touchend', touchEndHandler, { passive: true });
            handleEl.addEventListener('touchcancel', touchEndHandler, { passive: true });

            handleEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.resetSingleHudWidget(id);
            });

            handleEl.addEventListener('click', (e) => {
                if (this._hudWasDragged) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, true);
        });

        // Re-apply saved positions on load
        this.applySavedHudLayout();

        // Responsive window resize & mobile orientation-switch clamping
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            const onViewportChange = () => {
                const isMobileViewport = window.innerWidth <= 900 || window.innerHeight <= 500;
                const ids = ['touch-controls', 'char-panel', 'hud-center-column', 'compass-container', 'minimap-container'];
                if (isMobileViewport) {
                    for (const id of ids) {
                        const el = document.getElementById(id);
                        if (!el) continue;
                        el.style.position = '';
                        el.style.left = '';
                        el.style.top = '';
                        el.style.right = '';
                        el.style.bottom = '';
                        el.style.margin = '';
                        if (id === 'touch-controls') {
                            el.classList.remove('dpad-collapsed');
                        }
                    }
                    return;
                }
                for (const id of ids) {
                    const el = document.getElementById(id);
                    if (!el || el.style.position !== 'fixed') continue;
                    const rect = el.getBoundingClientRect();
                    const minX = 4;
                    const maxX = Math.max(4, window.innerWidth - rect.width - 4);
                    const minY = 36;
                    const maxY = Math.max(36, window.innerHeight - rect.height - 4);
                    const curX = parseFloat(el.style.left) || rect.left;
                    const curY = parseFloat(el.style.top) || rect.top;
                    const clampedX = Math.max(minX, Math.min(curX, maxX));
                    const clampedY = Math.max(minY, Math.min(curY, maxY));
                    el.style.left = `${clampedX}px`;
                    el.style.top = `${clampedY}px`;
                }
            };
            window.addEventListener('resize', onViewportChange);
            window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 60));
        }

        // Wire D-Pad Scale Cycle (1.0 -> 1.15 -> 0.85)
        const btnDpadScale = document.getElementById('btn-dpad-scale');
        const touchControls = document.getElementById('touch-controls');
        if (btnDpadScale && touchControls) {
            const scales = [1.0, 1.15, 0.85];
            btnDpadScale.addEventListener('click', (e) => {
                e.stopPropagation();
                const curScale = parseFloat(touchControls.style.getPropertyValue('--dpad-scale')) || 1.0;
                let idx = scales.findIndex(s => Math.abs(s - curScale) < 0.05);
                if (idx === -1) idx = 0;
                const nextScale = scales[(idx + 1) % scales.length];
                touchControls.style.setProperty('--dpad-scale', nextScale);
                this.saveHudWidgetPosition('touch-controls', { scale: nextScale });
            });
        }

        // Wire D-Pad Collapse / Expand
        const btnDpadCollapse = document.getElementById('btn-dpad-collapse');
        if (btnDpadCollapse && touchControls) {
            btnDpadCollapse.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCollapsed = touchControls.classList.toggle('dpad-collapsed');
                btnDpadCollapse.textContent = isCollapsed ? '+' : '−';
                btnDpadCollapse.title = isCollapsed ? 'Expand D-Pad' : 'Minimize / Expand D-Pad';
                this.saveHudWidgetPosition('touch-controls', { collapsed: isCollapsed });
            });
        }

        // Wire Extended Character Details Drawer
        const btnCharDetails = document.getElementById('btn-char-details-toggle');
        const charDrawer = document.getElementById('char-extended-drawer');
        const charPanelEl = document.getElementById('char-panel');
        if (btnCharDetails && charDrawer) {
            btnCharDetails.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = charDrawer.classList.toggle('hidden');
                if (charPanelEl) charPanelEl.classList.toggle('char-details-open', !isHidden);
                btnCharDetails.textContent = isHidden ? '▾' : '▴';
                btnCharDetails.setAttribute('aria-expanded', String(!isHidden));
            });
        }
        const charHeaderEl = document.getElementById('char-panel-header');
        if (charHeaderEl && charPanelEl) {
            charHeaderEl.addEventListener('click', (e) => {
                if (this._hudWasDragged || e.target.closest('button')) return;
                if (typeof window !== 'undefined' && window.innerWidth <= 600) {
                    const open = charPanelEl.classList.toggle('char-details-open');
                    if (charDrawer) charDrawer.classList.toggle('hidden', !open);
                    if (btnCharDetails) {
                        btnCharDetails.textContent = open ? '▴' : '▾';
                        btnCharDetails.setAttribute('aria-expanded', String(open));
                    }
                }
            });
        }

        // Wire Layout Reset Buttons
        const btnResetLayout = document.getElementById('btn-hud-reset-layout');
        if (btnResetLayout) {
            btnResetLayout.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetHudLayout();
            });
        }
        const btnPauseReset = document.getElementById('btn-pause-reset-hud');
        if (btnPauseReset) {
            btnPauseReset.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetHudLayout();
            });
        }
    }

    saveHudWidgetPosition(id, posData) {
        try {
            let layout = {};
            const raw = localStorage.getItem('angband3d_hud_layout_v2');
            if (raw) layout = JSON.parse(raw);
            if (!layout[id]) layout[id] = {};
            Object.assign(layout[id], posData);
            localStorage.setItem('angband3d_hud_layout_v2', JSON.stringify(layout));
        } catch (_) {}
    }

    resetSingleHudWidget(id) {
        const el = document.getElementById(id);
        if (el) {
            el.style.position = '';
            el.style.left = '';
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
            el.style.margin = '';
            if (id === 'touch-controls') {
                el.style.removeProperty('--dpad-scale');
                el.classList.remove('dpad-collapsed');
                const btnCol = document.getElementById('btn-dpad-collapse');
                if (btnCol) {
                    btnCol.textContent = '−';
                    btnCol.title = 'Minimize / Expand D-Pad';
                }
            }
        }
        try {
            const raw = localStorage.getItem('angband3d_hud_layout_v2');
            if (raw) {
                const layout = JSON.parse(raw);
                delete layout[id];
                localStorage.setItem('angband3d_hud_layout_v2', JSON.stringify(layout));
            }
        } catch (_) {}
    }

    applySavedHudLayout() {
        const isMobileViewport = typeof window !== 'undefined' && (window.innerWidth <= 900 || window.innerHeight <= 500);
        if (isMobileViewport) {
            const tc = document.getElementById('touch-controls');
            if (tc) tc.classList.remove('dpad-collapsed');
            return;
        }
        let layout = null;
        try {
            const raw = localStorage.getItem('angband3d_hud_layout_v2');
            if (raw) layout = JSON.parse(raw);
        } catch (_) {}
        if (!layout || typeof layout !== 'object') return;

        for (const [id, data] of Object.entries(layout)) {
            const el = document.getElementById(id);
            if (!el || !data) continue;

            if (typeof data.xRatio === 'number' && typeof data.yRatio === 'number') {
                const rect = el.getBoundingClientRect();
                const w = rect.width || (id === 'touch-controls' ? 186 : (id === 'char-panel' ? 240 : 100));
                const h = rect.height || (id === 'touch-controls' ? 180 : 100);
                const targetX = data.xRatio * window.innerWidth;
                const targetY = data.yRatio * window.innerHeight;
                const clampedX = Math.max(4, Math.min(targetX, window.innerWidth - w - 4));
                const clampedY = Math.max(36, Math.min(targetY, window.innerHeight - h - 4));

                el.style.position = 'fixed';
                el.style.left = `${clampedX}px`;
                el.style.top = `${clampedY}px`;
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                el.style.margin = '0';
            }

            if (id === 'touch-controls') {
                if (typeof data.scale === 'number') {
                    el.style.setProperty('--dpad-scale', data.scale);
                }
                if (data.collapsed) {
                    el.classList.add('dpad-collapsed');
                    const btnCol = document.getElementById('btn-dpad-collapse');
                    if (btnCol) {
                        btnCol.textContent = '+';
                        btnCol.title = 'Expand D-Pad';
                    }
                }
            }
        }
    }

    resetHudLayout() {
        try {
            localStorage.removeItem('angband3d_hud_layout_v2');
            localStorage.removeItem('angband_map_pos');
            localStorage.removeItem('angband_map_size');
            localStorage.removeItem('angband_msg_pos');
            localStorage.removeItem('angband_msg_size');
            localStorage.removeItem('angband_chronicle_pos');
            localStorage.removeItem('angband_chronicle_size');
        } catch (_) {}

        const allWidgets = [
            'touch-controls',
            'char-panel',
            'hud-center-column',
            'compass-container',
            'minimap-container',
            'message-feed-window',
            'chronicle-window'
        ];

        for (const id of allWidgets) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.style.position = '';
            el.style.left = '';
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
            el.style.width = '';
            el.style.height = '';
            el.style.margin = '';
            el.classList.remove('hud-widget-dragging');
        }

        const touchControls = document.getElementById('touch-controls');
        if (touchControls) {
            touchControls.style.removeProperty('--dpad-scale');
            touchControls.classList.remove('dpad-collapsed');
        }
        const btnDpadCollapse = document.getElementById('btn-dpad-collapse');
        if (btnDpadCollapse) {
            btnDpadCollapse.textContent = '−';
            btnDpadCollapse.title = 'Minimize / Expand D-Pad';
        }

        if (window.__app && typeof window.__app.showToast === 'function') {
            window.__app.showToast('HUD Layout Reset to Default');
        } else {
            let toast = document.getElementById('realm-toast-banner');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'realm-toast-banner';
                toast.className = 'realm-toast';
                document.body.appendChild(toast);
            }
            toast.innerHTML = `<span style="font-size: 20px;">↺</span><span>HUD Layout Reset to Default</span>`;
            toast.classList.add('show');
            setTimeout(() => {
                if (toast) toast.classList.remove('show');
            }, 3000);
        }
    }

    /* -------------------------------------------------------------
     * Action Dock Presets (WS42.5D: 'full', 'compact', 'wasd')
     * ------------------------------------------------------------- */
    setDockPreset(preset) {
        const VALID = ['full', 'compact', 'wasd'];
        let target = preset;
        if (!VALID.includes(target)) {
            try {
                if (typeof localStorage !== 'undefined') {
                    const saved = localStorage.getItem('angband3d_dock_preset');
                    if (VALID.includes(saved)) target = saved;
                }
            } catch (_) {}
        }
        if (!VALID.includes(target)) {
            let hasExisting = false;
            try {
                if (typeof localStorage !== 'undefined') {
                    hasExisting = Boolean(
                        localStorage.getItem('angband3d_active_realm') ||
                        localStorage.getItem('angband3d_lang_mode') ||
                        localStorage.getItem('angband3d_hud_layout_v2') ||
                        localStorage.getItem('angband3d_session_id') ||
                        localStorage.getItem('angband3d_wasd_mode') ||
                        localStorage.getItem('angband3d_volume')
                    );
                }
            } catch (_) {}
            target = 'full';
        }

        this.dockPreset = target;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('angband3d_dock_preset', target);
            }
        } catch (_) {}

        const actionBar = document.getElementById('action-bar');
        if (actionBar) {
            actionBar.dataset.dockPreset = target;
            actionBar.classList.remove('dock-preset-full', 'dock-preset-compact', 'dock-preset-wasd');
            actionBar.classList.add('dock-preset-' + target);

            const wasdActive = Boolean(
                target === 'wasd' ||
                (window.__app && window.__app.input && window.__app.input.wasdMode) ||
                (typeof localStorage !== 'undefined' && localStorage.getItem('angband3d_wasd_mode') === '1')
            );

            const wasdSockets = ['btn-wield', 'btn-drop', 'btn-aim', 'btn-search'];
            const nonCore = ['btn-door', 'btn-pickup', 'btn-equipment', 'btn-browse', 'btn-study', 'btn-quests'];

            for (const id of [...nonCore, ...wasdSockets]) {
                const btn = document.getElementById(id);
                if (btn && btn.dataset && btn.dataset.dockHidden) {
                    delete btn.dataset.dockHidden;
                    if (btn.style && btn.style.display === 'none' && !btn.dataset.contextHidden && !btn.dataset.realmHidden) {
                        btn.style.display = '';
                    }
                }
            }

            const cluster = document.getElementById('wasd-shadow-cluster');
            if (cluster) cluster.style.display = wasdActive ? 'flex' : 'none';
        }

        if (typeof window !== 'undefined' && typeof window.__updateActionBarOverflow === 'function') {
            window.__updateActionBarOverflow();
        }
        return target;
    }

    /* -------------------------------------------------------------
     * Continuous 60 FPS Camera Yaw Integration (Compass & Minimap)
     * ------------------------------------------------------------- */
    onCameraTurn(yaw) {
        this.currentCameraYaw = yaw;
        this.updateFooterFacing(yaw);
        this.renderCompass(yaw);
        if (this.lastFrame && this.lastFrame.map && this.lastFrame.player) {
            this.renderMinimap(this.lastFrame.map, this.lastFrame.player, this.lastFrame.monsters || [], yaw);
        }
    }

    updateFooterFacing(yaw) {
        if (!this.footerFacing) return;
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const lang = window.__langMode || 'en';
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const facingSig = `${sector}:${realm}:${lang}`;
        if (this._lastFacingSig === facingSig) return;
        this._lastFacingSig = facingSig;
        const sectorNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const sectorArrows = ['▲', '↗', '►', '↘', '▼', '↙', '◄', '↖'];
        const sectorKanji = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
        const dirName = sectorNames[sector] || 'N';
        const dirArrow = sectorArrows[sector] || '▲';
        const dirKanji = sectorKanji[sector] || '北';
        if (realm === 'hengband' && lang === 'jp') {
            this.footerFacing.textContent = `🧭 ${dirKanji}`;
            this.footerFacing.title = `視線方向: ${dirKanji} (${dirArrow})`;
        } else if (realm === 'hengband' && lang === 'bilingual') {
            this.footerFacing.textContent = `🧭 ${dirName} (${dirKanji})`;
            this.footerFacing.title = `Camera Facing: ${dirName} (${dirKanji}) [${dirArrow}]`;
        } else {
            this.footerFacing.textContent = `🧭 ${dirName}`;
            this.footerFacing.title = `Camera Facing: ${dirName} (${dirArrow})`;
        }
    }

    applyHudScale(scale) {
        const clamped = Math.max(0.85, Math.min(1.3, Number(scale) || 1));
        this._hudScale = clamped;
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.style.setProperty('--hud-scale', String(clamped));
        }
        try { localStorage.setItem('angband3d_hud_scale', String(clamped)); } catch (_) {}
        return clamped;
    }

    cycleImmersionMode() {
        const modes = ['full', 'minimal', 'cinematic'];
        const cur = this._immersionMode || 'full';
        const next = modes[(modes.indexOf(cur) + 1) % modes.length];
        this._immersionMode = next;
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('hud-immersion-minimal', next === 'minimal');
            document.body.classList.toggle('hud-immersion-cinematic', next === 'cinematic');
        }
        if (window.__app && typeof window.__app.showToast === 'function') {
            const labels = { full: '🛡️ HUD: Full Tactical', minimal: '⚔️ HUD: Minimal Combat [Alt+H]', cinematic: '🎬 HUD: Cinematic 3D [Alt+H]' };
            window.__app.showToast(labels[next] || next);
        }
        return next;
    }

    updateReticleTargetCard(frame) {
        const effFrame = frame || this.lastFrame;
        const player = effFrame ? effFrame.player : null;
        const realm = (effFrame && effFrame.realm) || (window.__activeRealm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
        return this.updateTargetInspector(player, realm, effFrame);
    }

    updateTargetInspector(player, realm, frameOpt) {
        const rawReticleCard = this.reticleTargetCard || document.getElementById('reticle-target-card');
        if (rawReticleCard) { rawReticleCard.style.display = 'none'; rawReticleCard.classList.add('hidden'); }

        const frame = frameOpt || this.lastFrame;
        const pl = player || (frame ? frame.player : null);
        let t = (pl && pl.target && pl.target.name) ? pl.target : ((frame && frame.target && frame.target.name) ? frame.target : null);
        const hasTarget = !!(t && t.name);
        const isVisible = hasTarget && (t.visible !== false);
        const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

        if (hasTarget && isVisible) {
            let tName = t.name;
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && typeof window.getLocalizedMonsterName === 'function') {
                tName = window.getLocalizedMonsterName(tName, 'hengband', lang);
            }
            const pct = Math.max(0, Math.min(100, Math.round(t.hp_pct !== undefined ? t.hp_pct : (t.pct !== undefined ? t.pct : 100))));

            if (this.footerTarget) {
                this.footerTarget.style.display = 'inline-flex';
                this.footerTarget.style.maxWidth = '190px';
                this.footerTarget.style.overflow = 'hidden';
                this.footerTarget.style.textOverflow = 'ellipsis';
                this.footerTarget.style.whiteSpace = 'nowrap';
                const targetSig = `${realm}:${tName}:${t.glyph || ''}:${pct}`;
                if (this._lastFooterTargetSig !== targetSig) {
                    this._lastFooterTargetSig = targetSig;
                    let portraitHtml = '';
                    if (typeof window.getShockboltSpriteCss === 'function') {
                        const iconStyle = window.getShockboltSpriteCss('monster', t.name, t.glyph || null, 36);
                        if (iconStyle) {
                            portraitHtml = '<span class="sb-sprite-icon hud-target-portrait" style="' + iconStyle + '"></span> ';
                        }
                    }
                    this.footerTarget.innerHTML = portraitHtml + '⚔ ' + esc(tName) + ' (' + pct + '%)';
                }
            }
        } else {
            if (this.footerTarget) {
                this.footerTarget.style.display = 'none';
                this._lastFooterTargetSig = '';
            }
        }
    }

    renderCompass(yaw) {
        if (!this.compassCtx || !this.compassCanvas) return;
        const ctx = this.compassCtx;
        const w = this.compassCanvas.width;
        const h = this.compassCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 2.5;

        ctx.clearRect(0, 0, w, h);

        // Compass background circular bezel (Overlay.cs:1757-1758)
        ctx.fillStyle = 'rgba(12, 14, 20, 0.90)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(180, 150, 60, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Continuous needle direction vector
        // In 2D: X is right, Y is down; North is (0, -1).
        const dirVec = { x: Math.sin(yaw), y: -Math.cos(yaw) };
        const sideVec = { x: -dirVec.y * 3.5, y: dirVec.x * 3.5 };

        const tip = { x: cx + dirVec.x * (radius - 2.5), y: cy + dirVec.y * (radius - 2.5) };
        const baseCenter = { x: cx - dirVec.x * (radius - 4.5), y: cy - dirVec.y * (radius - 4.5) };
        const leftCorner = { x: cx + sideVec.x, y: cy + sideVec.y };
        const rightCorner = { x: cx - sideVec.x, y: cy - sideVec.y };

        // North / Forward pointer (red/ruby, Overlay.cs:1779-1780)
        ctx.fillStyle = '#f03838';
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(leftCorner.x, leftCorner.y);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#b81c1c';
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(cx, cy);
        ctx.lineTo(rightCorner.x, rightCorner.y);
        ctx.closePath();
        ctx.fill();

        // South / Backward pointer (silver/steel, Overlay.cs:1783-1784)
        ctx.fillStyle = '#9aa6c0';
        ctx.beginPath();
        ctx.moveTo(baseCenter.x, baseCenter.y);
        ctx.lineTo(leftCorner.x, leftCorner.y);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#738099';
        ctx.beginPath();
        ctx.moveTo(baseCenter.x, baseCenter.y);
        ctx.lineTo(cx, cy);
        ctx.lineTo(rightCorner.x, rightCorner.y);
        ctx.closePath();
        ctx.fill();

        // Fixed north marker notch on compass bezel
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius + 1);
        ctx.lineTo(cx - 3, cy - radius + 6);
        ctx.lineTo(cx + 3, cy - radius + 6);
        ctx.closePath();
        ctx.fill();

        // Center golden jewel rivet
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Update compass facing label if present
        if (this.compassLabel) {
            const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
            const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            this.compassLabel.textContent = names[sector] || 'N';
        }
    }

    /* -------------------------------------------------------------
     * Minimap Radar Rendering (Zoom, Direction Cone & Tiles)
     * ------------------------------------------------------------- */
    updateMinimap(frame) {
        const eff = frame || this.lastFrame;
        if (!eff || !eff.map || !eff.player) return;
        this.renderMinimap(eff.map, eff.player, eff.monsters || [], this.currentCameraYaw);
    }

    showToast(msg) {
        if (!msg) return;
        if (typeof window !== 'undefined' && window.__app && typeof window.__app.showToast === 'function') {
            window.__app.showToast(msg);
        } else if (typeof window !== 'undefined' && window.__app && typeof window.__app.showRealmToast === 'function') {
            window.__app.showRealmToast(msg);
        }
        this.addMessage(msg, '#ffd166');
    }

    renderMinimap(map, player, monsters, continuousYaw) {
        if (!this.minimapCtx || !this.minimapCanvas || !map || !player) return;
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;

        const yaw = continuousYaw !== undefined ? continuousYaw : this.currentCameraYaw;

        // Dynamic cell size with minimap zoom (Matches Overlay.cs:1434)
        const baseCellSize = 12;
        const cellSize = Math.max(4, Math.min(48, Math.round(baseCellSize * this.minimapZoom)));

        const cols = Math.floor(w / cellSize);
        const lines = Math.floor(h / cellSize);

        const px = player.x;
        const py = player.y;

        // Use continuous player coordinates when stepping/animating for butter-smooth 60fps tracking
        const drawPx = (typeof this.continuousX === 'number' && !isNaN(this.continuousX)) ? this.continuousX : px;
        const drawPy = (typeof this.continuousY === 'number' && !isNaN(this.continuousY)) ? this.continuousY : py;

        const ox = Math.max(0, Math.min(map.w - cols, Math.floor(drawPx) - Math.floor(cols / 2)));
        const oy = Math.max(0, Math.min(map.h - lines, Math.floor(drawPy) - Math.floor(lines / 2)));
        this._minimapOx = ox;
        this._minimapOy = oy;
        this._minimapCellSize = cellSize;

        const cx = (drawPx - ox) * cellSize + cellSize / 2;
        const cy = (drawPy - oy) * cellSize + cellSize / 2;

        // Direction vector from continuous camera yaw
        const dir = { x: Math.sin(yaw), y: -Math.cos(yaw) };
        const side = { x: -dir.y, y: dir.x };

        // 1. Offscreen Tile Cache Generation: Re-rasterize ASCII glyphs when map sequence, viewport scroll, or zoom changes
        const frameSeq = (this.lastFrame && this.lastFrame.seq !== undefined) ? this.lastFrame.seq : 0;
        const cacheKey = `${frameSeq}_${ox}_${oy}_${this.minimapZoom}_${w}_${h}`;
        if (cacheKey !== this.minimapTileCacheKey || this.minimapTileCanvas.width !== w || this.minimapTileCanvas.height !== h) {
            this.minimapTileCanvas.width = w;
            this.minimapTileCanvas.height = h;
            this.minimapTileCacheKey = cacheKey;

            const tCtx = this.minimapTileCtx;
            tCtx.fillStyle = '#060910';
            tCtx.fillRect(0, 0, w, h);

            function darkenColor(hex, factor = 0.45) {
                if (!hex || hex[0] !== '#') return hex;
                const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
                const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
                const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
                return `rgba(${r}, ${g}, ${b}, 0.70)`;
            }

            if (cellSize > 6) {
                tCtx.font = `bold ${Math.max(8, Math.floor(cellSize * 1.02))}px monospace`;
                tCtx.textAlign = 'center';
                tCtx.textBaseline = 'middle';
            }

            for (let rowIdx = 0; rowIdx < lines && (oy + rowIdx) < map.h; rowIdx++) {
                const my = oy + rowIdx;
                const row = map.rows[my];
                if (!row || !row.g) continue;

                for (let colIdx = 0; colIdx < cols && (ox + colIdx) < map.w; colIdx++) {
                    const mx = ox + colIdx;
                    if (mx >= row.g.length) continue;

                    const ch = row.g[mx];
                    if (ch === ' ') continue;

                    const flag = (row.l && mx < row.l.length) ? (parseInt(row.l[mx], 16) || 0) : 0;
                    if ((flag & 0x3) === 0) continue; // Fog of war: not known and not in view

                    const inView = (flag & 0x2) !== 0;
                    const sx = colIdx * cellSize;
                    const sy = rowIdx * cellSize;

                    if (inView) {
                        const isFloor = ch === '.' || ch === '+' || ch === '\'';
                        tCtx.fillStyle = isFloor ? 'rgba(36, 41, 56, 0.45)' : 'rgba(26, 30, 42, 0.35)';
                    } else {
                        tCtx.fillStyle = 'rgba(8, 10, 15, 0.65)';
                    }
                    tCtx.fillRect(sx, sy, cellSize, cellSize);

                    const attrIdx = mx * 2;
                    const attrVal = (row.a && attrIdx + 1 < row.a.length) ? parseInt(row.a.substring(attrIdx, attrIdx + 2), 16) : 1;
                    let colour = window.getAngbandColorString ? window.getAngbandColorString(attrVal) : '#ffffff';
                    if (!inView) {
                        colour = darkenColor(colour, 0.45);
                    }

                    tCtx.fillStyle = colour;
                    if (cellSize <= 6) {
                        tCtx.fillRect(sx, sy, cellSize, cellSize);
                    } else {
                        tCtx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2);
                    }
                }
            }
        }

        // Fast GPU blit of cached minimap tiles
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.minimapTileCanvas, 0, 0);

        // 2. Draw Translucent Golden Vision Cone (Matches Godot Overlay.cs:1148-1165, 1449-1459)
        const coneDist = Math.max(16, Math.min(85, cellSize * 4.4));
        const coneSpread = coneDist * 0.65;
        const leftTip = { x: cx + dir.x * coneDist + side.x * coneSpread, y: cy + dir.y * coneDist + side.y * coneSpread };
        const rightTip = { x: cx + dir.x * coneDist - side.x * coneSpread, y: cy + dir.y * coneDist - side.y * coneSpread };

        ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(leftTip.x, leftTip.y);
        ctx.lineTo(rightTip.x, rightTip.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 220, 100, 0.50)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(leftTip.x, leftTip.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(rightTip.x, rightTip.y);
        ctx.stroke();

        const baseAngle = Math.atan2(dir.y, dir.x);
        ctx.beginPath();
        ctx.arc(cx, cy, coneDist, baseAngle - 0.58, baseAngle + 0.58);
        ctx.stroke();

        // 2b. Minimap A* Auto-Navigation Trail & Destination Beacon (WS32)
        const activeNav = (window.__app && window.__app.input && window.__app.input._autoNav && window.__app.input._autoNav.active)
            ? window.__app.input._autoNav
            : null;
        if (activeNav && Array.isArray(activeNav.path) && activeNav.path.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 215, 64, 0.88)';
            ctx.lineWidth = Math.max(1.5, cellSize * 0.22);
            ctx.setLineDash([Math.max(2, cellSize * 0.35), Math.max(2, cellSize * 0.25)]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (const step of activeNav.path) {
                const sx = (step.x - ox + 0.5) * cellSize;
                const sy = (step.y - oy + 0.5) * cellSize;
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            const gx = (activeNav.goalX - ox + 0.5) * cellSize;
            const gy = (activeNav.goalY - oy + 0.5) * cellSize;
            const r = Math.max(3.5, cellSize * 0.45);
            ctx.fillStyle = '#ffe066';
            ctx.beginPath();
            ctx.moveTo(gx, gy - r);
            ctx.lineTo(gx + r, gy);
            ctx.lineTo(gx, gy + r);
            ctx.lineTo(gx - r, gy);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else if (!activeNav && this._hoverMinimapPath && this._hoverMinimapPath.length > 0) {
            // Minimap Hover Route Preview (WS34)
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 215, 64, 0.55)';
            ctx.lineWidth = Math.max(1.5, cellSize * 0.22);
            ctx.setLineDash([Math.max(2, cellSize * 0.35), Math.max(2, cellSize * 0.25)]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (const step of this._hoverMinimapPath) {
                const sx = (step.x - ox + 0.5) * cellSize;
                const sy = (step.y - oy + 0.5) * cellSize;
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            const lastStep = this._hoverMinimapPath[this._hoverMinimapPath.length - 1];
            const gx = (lastStep.x - ox + 0.5) * cellSize;
            const gy = (lastStep.y - oy + 0.5) * cellSize;
            const r = Math.max(3.5, cellSize * 0.45);
            ctx.fillStyle = 'rgba(255, 224, 102, 0.70)';
            ctx.beginPath();
            ctx.moveTo(gx, gy - r);
            ctx.lineTo(gx + r, gy);
            ctx.lineTo(gx, gy + r);
            ctx.lineTo(gx - r, gy);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 3. Monsters on Minimap
        monsters.forEach(m => {
            const colIdx = m.x - ox;
            const rowIdx = m.y - oy;
            if (colIdx >= 0 && colIdx < cols && rowIdx >= 0 && rowIdx < lines) {
                const sx = colIdx * cellSize;
                const sy = rowIdx * cellSize;
                ctx.fillStyle = 'rgba(230, 40, 40, 0.45)';
                ctx.fillRect(sx, sy, cellSize, cellSize);
                const mCol = (window.getAngbandColorString && m.attr !== undefined) ? window.getAngbandColorString(m.attr) : '#ff4444';
                ctx.fillStyle = mCol;
                if (cellSize <= 6) {
                    ctx.fillRect(sx + 1, sy + 1, Math.max(2, cellSize - 2), Math.max(2, cellSize - 2));
                } else {
                    ctx.font = `bold ${Math.max(8, Math.floor(cellSize * 1.02))}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(m.glyph || 'm', sx + cellSize / 2, sy + cellSize / 2);
                }
            }
        });

        // 4. Player Directional Pointer Polygon (Matches Godot Overlay.cs:1050-1067, 1520-1528)
        ctx.fillStyle = 'rgba(255, 215, 50, 0.30)';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(cellSize * 0.55, 4.5), 0, Math.PI * 2);
        ctx.fill();

        const ptrSize = Math.max(cellSize * 0.70, 6.0);
        const pTip = { x: cx + dir.x * ptrSize, y: cy + dir.y * ptrSize };
        const pBaseCenter = { x: cx - dir.x * (ptrSize * 0.55), y: cy - dir.y * (ptrSize * 0.55) };
        const pLeftCorner = { x: pBaseCenter.x + side.x * (ptrSize * 0.65), y: pBaseCenter.y + side.y * (ptrSize * 0.65) };
        const pRightCorner = { x: pBaseCenter.x - side.x * (ptrSize * 0.65), y: pBaseCenter.y - side.y * (ptrSize * 0.65) };
        const pNotch = { x: cx - dir.x * (ptrSize * 0.20), y: cy - dir.y * (ptrSize * 0.20) };

        // Left triangle (bright yellow)
        ctx.fillStyle = '#fff266';
        ctx.beginPath();
        ctx.moveTo(pTip.x, pTip.y);
        ctx.lineTo(pLeftCorner.x, pLeftCorner.y);
        ctx.lineTo(pNotch.x, pNotch.y);
        ctx.closePath();
        ctx.fill();

        // Right triangle (darkened gold)
        ctx.fillStyle = '#bfb54d';
        ctx.beginPath();
        ctx.moveTo(pTip.x, pTip.y);
        ctx.lineTo(pNotch.x, pNotch.y);
        ctx.lineTo(pRightCorner.x, pRightCorner.y);
        ctx.closePath();
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#261a05';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pLeftCorner.x, pLeftCorner.y);
        ctx.lineTo(pTip.x, pTip.y);
        ctx.lineTo(pRightCorner.x, pRightCorner.y);
        ctx.lineTo(pNotch.x, pNotch.y);
        ctx.closePath();
        ctx.stroke();
    }

    updateLanguageUI(realm, lang = 'en') {
        const isRunActive = Boolean(window.__app && window.__app.input && typeof window.__app.input.isRunningActive === 'function' ? window.__app.input.isRunningActive() : false);
        const langKey = `${realm || ''}|${lang}|${isRunActive}`;
        if (this._lastLanguageUIKey === langKey) {
            return;
        }
        this._lastLanguageUIKey = langKey;

        const isHeng = realm === 'hengband';

        // 1. Primary Attributes & Combat Stats
        const statLabels = {
            str: { en: 'STR', bi: 'STR (腕力)', jp: '腕力' },
            int: { en: 'INT', bi: 'INT (知能)', jp: '知能' },
            wis: { en: 'WIS', bi: 'WIS (賢さ)', jp: '賢さ' },
            dex: { en: 'DEX', bi: 'DEX (器用)', jp: '器用' },
            con: { en: 'CON', bi: 'CON (耐久)', jp: '耐久' },
            chr: { en: 'CHR', bi: 'CHR (魅力)', jp: '魅力' },
            gra: { en: 'GRA', bi: 'GRA (威厳)', jp: '威厳' },
            ac:  { en: 'AC',  bi: 'AC (防御)',  jp: '防御' },
            gold:{ en: 'GOLD',bi: 'AU (金貨)', jp: '金貨' },
        };
        for (const [key, trans] of Object.entries(statLabels)) {
            const el = document.querySelector(`#stat-item-${key} .stat-label`);
            if (el) {
                if (isHeng && lang === 'jp') el.textContent = trans.jp;
                else if (isHeng && lang === 'bilingual') el.textContent = trans.bi;
                else el.textContent = trans.en;
            }
        }

        // 2. Health & Mana/Voice Gauges
        const hpHeader = document.querySelector('.gauge-hp .gauge-header > span:first-child');
        const spHeader = document.querySelector('.gauge-sp .gauge-header > span:first-child') || this.spLabel;
        if (isHeng && lang === 'jp') {
            if (hpHeader) hpHeader.textContent = '体力';
            if (spHeader) spHeader.textContent = '魔力';
            if (this.spLabel) this.spLabel.textContent = '魔力';
        } else if (isHeng && lang === 'bilingual') {
            if (hpHeader) hpHeader.textContent = 'HP (体力)';
            if (spHeader) spHeader.textContent = 'MANA (魔力)';
            if (this.spLabel) this.spLabel.textContent = 'MANA (魔力)';
        } else {
            if (hpHeader) hpHeader.textContent = 'HEALTH';
            const defaultSp = (realm === 'silq') ? 'VOICE' : 'MANA';
            if (spHeader) spHeader.textContent = defaultSp;
            if (this.spLabel) this.spLabel.textContent = defaultSp;
        }

        // 3. Quick Action Bar Buttons (CMD-P2-07: delegated to RealmKeys.applyLabels)
        const realmKeys = (typeof RealmKeys !== 'undefined' ? RealmKeys : (typeof window !== 'undefined' ? window.RealmKeys : null));
        if (realmKeys && typeof realmKeys.applyLabels === 'function') {
            realmKeys.applyLabels(document, realm, lang);
        }

        // 4. Run Mode Toggle Button Texts
        const isRun = window.__app && window.__app.input ? window.__app.input.isRunningActive() : false;
        const runText = document.getElementById('action-run-text');
        const dpadRunText = document.getElementById('dpad-run-text');
        const termRunText = document.querySelector('#term-run-toggle .term-run-text');
        const runWord = isRun
            ? { en: 'Run', bi: 'Run (走る)', jp: '走る' }
            : { en: 'Walk', bi: 'Walk (歩く)', jp: '歩く' };
        const chosenRun = (isHeng && lang === 'jp') ? runWord.jp : ((isHeng && lang === 'bilingual') ? runWord.bi : runWord.en);
        if (runText) runText.textContent = chosenRun;
        if (dpadRunText) dpadRunText.textContent = chosenRun;
        if (termRunText) termRunText.textContent = chosenRun;

        // 5. Terminal Toolbar Buttons
        const termButtons = {
            'btn-term-advance': { en: 'Advance (Enter)', bi: 'Advance (決定)', jp: '決定 (Enter)' },
            'btn-term-escape': { en: 'Back (Esc)', bi: 'Back (戻る)', jp: '戻る (Esc)' },
            'btn-term-reroll': { en: '🎲 Reroll Hero (R)', bi: '🎲 Reroll (再生成)', jp: '🎲 英雄再生成 (R)' },
            'btn-term-custom': { en: '🛠 Custom Hero (C)', bi: '🛠 Custom (作成)', jp: '🛠 英雄作成 (C)' },
            'btn-term-exit-menu': { en: '✕ Main Menu', bi: '✕ Main Menu (主献立)', jp: '✕ メインメニュー' }
        };
        for (const [id, trans] of Object.entries(termButtons)) {
            const btn = document.getElementById(id);
            if (btn) {
                if (isHeng && lang === 'jp') btn.textContent = trans.jp;
                else if (isHeng && lang === 'bilingual') btn.textContent = trans.bi;
                else btn.textContent = trans.en;
            }
        }

        // 6. Death Screen Tabs and Action Buttons
        const deathTabLabels = [
            { en: '1. Tombstone & Menus', bi: '1. Tombstone (墓碑)', jp: '1. 墓碑と記録' },
            { en: '2. Equipment', bi: '2. Equipment (装備)', jp: '2. 装備品' },
            { en: '3. Inventory', bi: '3. Inventory (持物)', jp: '3. 所持品' },
            { en: '4. Quiver', bi: '4. Quiver (矢筒)', jp: '4. 矢筒' },
            { en: '5. Stats & Attributes', bi: '5. Stats (能力値)', jp: '5. 能力値' }
        ];
        if (this.deathTabs && this.deathTabs.length) {
            this.deathTabs.forEach(t => {
                const idx = parseInt(t.dataset.tab, 10);
                if (deathTabLabels[idx]) {
                    const l = deathTabLabels[idx];
                    if (isHeng && lang === 'jp') t.textContent = l.jp;
                    else if (isHeng && lang === 'bilingual') t.textContent = l.bi;
                    else t.textContent = l.en;
                }
            });
        }

        const deathActionButtons = {
            'btn-death-reload': { en: '<kbd>[R]</kbd> Load Last Saved Game', bi: '<kbd>[R]</kbd> Load Game (再読込)', jp: '<kbd>[R]</kbd> セーブデータを読込' },
            'btn-death-reroll': { en: '<kbd>[N]</kbd> Re-Roll / New Character', bi: '<kbd>[N]</kbd> New Hero (新キャラ)', jp: '<kbd>[N]</kbd> 新規キャラクター' },
            'btn-death-menu': { en: '<kbd>[M / Esc]</kbd> Main Menu', bi: '<kbd>[M / Esc]</kbd> Main Menu (主献立)', jp: '<kbd>[M / Esc]</kbd> メインメニュー' }
        };
        for (const [id, trans] of Object.entries(deathActionButtons)) {
            const btn = document.getElementById(id);
            if (btn) {
                if (isHeng && lang === 'jp') btn.innerHTML = trans.jp;
                else if (isHeng && lang === 'bilingual') btn.innerHTML = trans.bi;
                else btn.innerHTML = trans.en;
            }
        }

        // 7. Minimap Header & Hint (when not in play)
        const minimapTitle = document.getElementById('minimap-title-text');
        const minimapHint = document.getElementById('minimap-hint-text');
        if (minimapTitle && (!this.lastFrame || !this.lastFrame.player)) {
            if (isHeng && lang === 'jp') minimapTitle.textContent = '地図';
            else if (isHeng && lang === 'bilingual') minimapTitle.textContent = 'MINIMAP (地図)';
            else minimapTitle.textContent = 'MINIMAP';
        }
        if (minimapHint) {
            if (isHeng && lang === 'jp') minimapHint.textContent = '[ ] 画面  +/- 縮小';
            else if (isHeng && lang === 'bilingual') minimapHint.textContent = '[ ] Size (画面)  +/- Zoom';
            else minimapHint.textContent = '[ ] Size  +/- Zoom';
        }

        // 8. D-Pad Turning Wings
        const dpadTurnLeft = document.querySelector('#dpad-turn-left .dpad-turn-text');
        const dpadTurnRight = document.querySelector('#dpad-turn-right .dpad-turn-text');
        if (dpadTurnLeft) {
            if (isHeng && lang === 'jp') dpadTurnLeft.textContent = '左回転';
            else if (isHeng && lang === 'bilingual') dpadTurnLeft.textContent = 'Turn L (左)';
            else dpadTurnLeft.textContent = 'Turn L';
        }
        if (dpadTurnRight) {
            if (isHeng && lang === 'jp') dpadTurnRight.textContent = '右回転';
            else if (isHeng && lang === 'bilingual') dpadTurnRight.textContent = 'Turn R (右)';
            else dpadTurnRight.textContent = 'Turn R';
        }

        // 9. Quick Help Trigger Pill
        const btnQuickHelp = document.getElementById('btn-quick-help');
        if (btnQuickHelp) {
            if (isHeng && lang === 'jp') btnQuickHelp.textContent = '⌨ 案内 [?]';
            else if (isHeng && lang === 'bilingual') btnQuickHelp.textContent = '⌨ Controls (案内) [?]';
            else btnQuickHelp.textContent = '⌨ Controls [?]';
        }

        // 10. In-Game Message History & Top Banner Dynamic Retranslation
        if (isHeng && typeof window !== 'undefined' && typeof window.localizeGameMessage === 'function') {
            if (this.messageHistory && this.messageHistory.length > 0) {
                for (const item of this.messageHistory) {
                    if (item && item.el && item.rawText) {
                        const trans = window.localizeGameMessage(item.rawText, 'hengband', lang);
                        item.text = trans;
                        item.el.textContent = (item.repeat && item.repeat > 1) ? `${trans} (x${item.repeat})` : trans;
                    }
                }
            }
            if (this.lastFrame) {
                this.updateTopMessageBanner(this.lastFrame);
            }
        }
    }

    updateHengbandLanguageUI(realm, lang = 'en') {
        return this.updateLanguageUI(realm, lang);
    }

    /* -------------------------------------------------------------
     * Frame Update: Gauges, 3-Row Telemetry Footer, Minimap Header
     * ------------------------------------------------------------- */
    update(frame) {
        if (!frame) return;
        this.lastFrame = frame;

        const player = frame.player || {};
        const ui = frame.ui || {};

        // Realm and Game System Differentiation
        const realm = (frame && frame.realm) || (window.__activeRealm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
        const isSilQ = realm === 'silq' || (player.stats && player.stats.gra !== undefined);
        if (this._lastBodyRealm !== realm) {
            this._lastBodyRealm = realm;
            if (typeof document !== 'undefined' && document.body && document.body.dataset) {
                document.body.dataset.realm = realm;
            }
            const crestEl = document.getElementById('char-realm-crest');
            if (crestEl) {
                const crestIcons = { angband: '⚔', silq: '👑', frogcomposband: '◈', hengband: '⛩' };
                const crestTitles = {
                    angband: 'Iron Crown of Morgoth (Angband 4.2.6)',
                    silq: 'Silmaril & Lay of Leithian (Sil-Q)',
                    frogcomposband: 'Courts of Chaos & Amber (FrogComposband)',
                    hengband: 'Scrolls of the Five Rings (Hengband)'
                };
                crestEl.textContent = crestIcons[realm] || '⚔';
                crestEl.title = crestTitles[realm] || crestTitles.angband;
            }
        }
        this.updateHengbandLanguageUI(realm, window.__langMode || 'en');

        // Character Name, Race, Class / House
        if (player.name) {
            let r = player.race || '';
            let c = player.class || '';
            const house = player.house || '';
            if (realm === 'hengband') {
                const lang = window.__langMode || 'en';
                const jpToEn = window.__JP_TERM_TRANSLATIONS || {};
                const enToJp = window.__EN_TO_JP_TRANSLATIONS || {};
                if (lang === 'en') {
                    if (jpToEn[r]) r = jpToEn[r];
                    if (jpToEn[c]) c = jpToEn[c];
                } else if (lang === 'jp') {
                    if (enToJp[r]) r = enToJp[r];
                    if (enToJp[c]) c = enToJp[c];
                } else if (lang === 'bilingual') {
                    if (jpToEn[r]) r = `${r} (${jpToEn[r]})`;
                    else if (enToJp[r]) r = `${enToJp[r]} (${r})`;
                    if (jpToEn[c]) c = `${c} (${jpToEn[c]})`;
                    else if (enToJp[c]) c = `${enToJp[c]} (${c})`;
                }
            }
            if (isSilQ) {
                this.charTitle.textContent = `${player.name} (${r}${house ? ` - ${house}` : (c && c !== r ? ` - ${c}` : '')})`;
            } else {
                this.charTitle.textContent = `${player.name} (${r} ${c})`;
            }
        } else {
            this.charTitle.textContent = isSilQ ? 'Hero of Beleriand' : 'Hero of Angband';
        }

        // HP Bar
        const curHp = player.hp !== undefined ? player.hp : (player.chp !== undefined ? player.chp : 100);
        const maxHp = player.hp_max !== undefined ? player.hp_max : (player.max_hp !== undefined ? player.max_hp : (player.mhp !== undefined ? player.mhp : 100));
        const hpSig = `${curHp}/${maxHp}`;
        if (this._lastHpSig !== hpSig) {
            this._lastHpSig = hpSig;
            const hpPct = Math.max(0, Math.min(100, (curHp / Math.max(1, maxHp)) * 100));
            if (this.hpFill) {
                this.hpFill.style.width = `${hpPct}%`;
                this.hpFill.style.height = `${hpPct}%`;
                if (typeof this.hpFill.style.setProperty === 'function') {
                    this.hpFill.style.setProperty('--vial-pct', `${hpPct}%`);
                }
                if (this.hpFill.classList) {
                    this.hpFill.classList.toggle('hp-caution', hpPct <= 50 && hpPct > 25);
                    this.hpFill.classList.toggle('hp-critical', hpPct <= 25);
                }
            }
            if (this.hpGhostFill) {
                this.hpGhostFill.style.width = `${hpPct}%`;
                if (typeof this.hpGhostFill.style.setProperty === 'function') {
                    this.hpGhostFill.style.setProperty('--vial-pct', `${hpPct}%`);
                }
            }
            this.hpText.textContent = `${curHp} / ${maxHp}`;
        }

        // SP / Voice Bar
        const curSp = player.sp !== undefined ? player.sp : (player.csp !== undefined ? player.csp : 0);
        const maxSp = player.sp_max !== undefined ? player.sp_max : (player.max_sp !== undefined ? player.max_sp : (player.msp !== undefined ? player.msp : 0));
        const spSig = `${curSp}/${maxSp}:${realm}:${window.__langMode || 'en'}:${isSilQ}`;
        if (this._lastSpSig !== spSig) {
            this._lastSpSig = spSig;
            if (this.spLabel) {
                const lang = window.__langMode || 'en';
                if (realm === 'hengband' && lang === 'jp') {
                    this.spLabel.textContent = '魔力';
                } else if (realm === 'hengband' && lang === 'bilingual') {
                    this.spLabel.textContent = 'MANA (魔力)';
                } else {
                    this.spLabel.textContent = isSilQ ? 'VOICE' : 'MANA';
                }
            }
            const spPct = maxSp > 0 ? Math.max(0, Math.min(100, (curSp / maxSp) * 100)) : 0;
            if (this.spFill) {
                this.spFill.style.width = `${spPct}%`;
                this.spFill.style.height = `${spPct}%`;
                if (typeof this.spFill.style.setProperty === 'function') {
                    this.spFill.style.setProperty('--vial-pct', `${spPct}%`);
                }
            }
            if (this.spGhostFill) {
                this.spGhostFill.style.width = `${spPct}%`;
                if (typeof this.spGhostFill.style.setProperty === 'function') {
                    this.spGhostFill.style.setProperty('--vial-pct', `${spPct}%`);
                }
            }
            this.spText.textContent = `${curSp} / ${maxSp}`;
        }

        // Left Panel Stats
        const getStat = s => (s && typeof s === 'object') ? (s.use || s.top || '10') : (s || '10');
        if (isSilQ) {
            if (this.itemGra) this.itemGra.style.display = 'flex';
            if (this.itemInt) this.itemInt.style.display = 'none';
            if (this.itemWis) this.itemWis.style.display = 'none';
            if (this.itemChr) this.itemChr.style.display = 'none';
            if (this.itemGold) this.itemGold.style.display = 'none';

            if (player.stats) {
                if (this.statStr) this.statStr.textContent = getStat(player.stats.str);
                if (this.statDex) this.statDex.textContent = getStat(player.stats.dex);
                if (this.statCon) this.statCon.textContent = getStat(player.stats.con);
                if (this.statGra) this.statGra.textContent = getStat(player.stats.gra);
            }
        } else {
            if (this.itemGra) this.itemGra.style.display = 'none';
            if (this.itemInt) this.itemInt.style.display = 'flex';
            if (this.itemWis) this.itemWis.style.display = 'flex';
            if (this.itemChr) this.itemChr.style.display = 'flex';
            if (this.itemGold) this.itemGold.style.display = 'flex';

            if (player.stats) {
                if (this.statStr) this.statStr.textContent = getStat(player.stats.str);
                if (this.statInt) this.statInt.textContent = getStat(player.stats.int);
                if (this.statWis) this.statWis.textContent = getStat(player.stats.wis);
                if (this.statDex) this.statDex.textContent = getStat(player.stats.dex);
                if (this.statCon) this.statCon.textContent = getStat(player.stats.con);
                if (this.statChr) this.statChr.textContent = getStat(player.stats.chr || player.stats.cha);
            }
        }

        // Depth, Wilderness, Gold, AC
        const depth = player.depth !== undefined ? player.depth : 0;
        let locStr = depth === 0 ? 'Town' : `${depth * 50}ft`;
        if (isSilQ) {
            locStr = `${depth * 50}ft`;
        } else if (depth === 0 && frame.map && frame.map.rows) {
            const px = player.x || 0;
            const py = player.y || 0;
            const feat = this.getFeatAt(frame.map, px, py);
            if ((feat >= 25 && feat <= 31) || player.wilderness || frame.is_wild_mode) {
                locStr = 'Wilderness';
            }
        }
        if (realm === 'hengband') {
            const lang = window.__langMode || 'en';
            if (lang === 'jp') {
                if (locStr === 'Town') locStr = '街 (宿場町)';
                else if (locStr === 'Wilderness') locStr = '荒野';
            } else if (lang === 'bilingual') {
                if (locStr === 'Town') locStr = 'Town (街)';
                else if (locStr === 'Wilderness') locStr = 'Wilderness (荒野)';
            }
        }
        if (this.depthVal) this.depthVal.textContent = locStr;

        // Sub-meta: Level, Race, Class & Depth (Wave 10 Track B)
        const depthLabel = depth === 0 ? (player.wilderness ? 'Wilderness' : 'Town') : `${depth * 50}ft`;
        const charSubMetaEl = this._charSubMetaEl || (this._charSubMetaEl = document.getElementById('char-sub-meta'));
        if (charSubMetaEl) {
            const pLev = player.lev || player.level || 1;
            const pRace = player.race || '';
            const pClass = player.class || player.cls || '';
            const subMetaStr = `Lv.${pLev} ${pRace}${pClass ? ` ${pClass}` : ''} • ${depthLabel}`;
            if (this._lastCharSubMeta !== subMetaStr) {
                this._lastCharSubMeta = subMetaStr;
                charSubMetaEl.textContent = subMetaStr;
            }
        }
        const goldAcSig = `${player.gold || 0}:${player.ac || 0}:${player.ac_to_a || 0}:${player.ac_base || 0}:${isSilQ}`;
        if (this._lastGoldAcSig !== goldAcSig) {
            this._lastGoldAcSig = goldAcSig;
            if (this.goldVal) {
                this.goldVal.textContent = (player.gold || 0).toLocaleString();
                this.goldVal.title = `Gold: ${(player.gold || 0).toLocaleString()} AU`;
            }
            if (this.acVal) {
                const acTotal = player.ac !== undefined ? player.ac : 0;
                const acToA = player.ac_to_a || 0;
                this.acVal.textContent = acToA !== 0 ? `${acTotal} (${acToA > 0 ? '+' : ''}${acToA})` : `${acTotal}`;
                this.acVal.title = isSilQ
                    ? `Evasion & Protection: ${acTotal}`
                    : `Armor Class: ${acTotal} (Base: ${player.ac_base || 0}, Bonus: ${acToA >= 0 ? '+' : ''}${acToA})`;
            }
        }
        const yaw = (window.__app && window.__app.dungeon) ? window.__app.dungeon.yaw : (this.currentCameraYaw || 0);
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const sectorNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const sectorArrows = ['▲', '↗', '►', '↘', '▼', '↙', '◄', '↖'];
        const arrowChar = sectorArrows[sector] || '▲';
        const facingName = sectorNames[sector] || 'N';

        this.updateFooterFacing(yaw);

        // Minimap Header (Overlay.cs:1404)
        if (player.x !== undefined && player.y !== undefined) {
            const titleEl = this._minimapTitleEl || (this._minimapTitleEl = document.getElementById('minimap-title-text'));
            if (titleEl) {
                const mmTitleSig = `${realm}:${window.__langMode || 'en'}:${player.x}:${player.y}:${arrowChar}:${facingName}`;
                if (this._lastMmTitleSig !== mmTitleSig) {
                    this._lastMmTitleSig = mmTitleSig;
                    const lang = window.__langMode || 'en';
                    const prefix = (realm === 'hengband' && lang === 'jp') ? '地図' : ((realm === 'hengband' && lang === 'bilingual') ? 'MAP (地図)' : 'MAP');
                    titleEl.innerHTML = `<span style="white-space:nowrap;">${escapeHtml(prefix)} (${player.x},${player.y})</span> <span style="color:#ffd700; white-space:nowrap;">[${escapeHtml(arrowChar)} ${escapeHtml(facingName)}]</span>`;
                }
            }
        }

        // Contextual Diagonal Movement Hint (Row 1)
        if (this.footerDiagonalHint && frame.map && player.x !== undefined && player.y !== undefined) {
            const px = player.x;
            const py = player.y;
            const yaw = window.__app && window.__app.dungeon ? window.__app.dungeon.yaw : 0;
            const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const sector = Math.round(normYaw / (Math.PI / 4)) % 8;

            const forwardOffsets = {
                0: { dx: 0, dy: -1 }, // N
                1: { dx: 1, dy: -1 }, // NE
                2: { dx: 1, dy: 0 },  // E
                3: { dx: 1, dy: 1 },  // SE
                4: { dx: 0, dy: 1 },  // S
                5: { dx: -1, dy: 1 }, // SW
                6: { dx: -1, dy: 0 }, // W
                7: { dx: -1, dy: -1 } // NW
            };
            const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };
            const frontFeat = this.getFeatAt(frame.map, px + fwd.dx, py + fwd.dy);
            const isFrontBlocked = !this.isWalkableOrPortal(frontFeat);

            let diagText = '';
            if (isFrontBlocked) {
                // Check relative diagonal directions: 7 = Forward-Left, 9 = Forward-Right
                const leftSector = (sector + 7) % 8;
                const rightSector = (sector + 1) % 8;
                const leftOff = forwardOffsets[leftSector];
                const rightOff = forwardOffsets[rightSector];
                const leftWalkable = leftOff && this.isWalkableOrPortal(this.getFeatAt(frame.map, px + leftOff.dx, py + leftOff.dy));
                const rightWalkable = rightOff && this.isWalkableOrPortal(this.getFeatAt(frame.map, px + rightOff.dx, py + rightOff.dy));

                if (leftWalkable && rightWalkable) {
                    diagText = '⤢ Diag: [7] ↖ / [9] ↗';
                } else if (leftWalkable) {
                    diagText = '↖ Diag: [7] Step Left';
                } else if (rightWalkable) {
                    diagText = '↗ Diag: [9] Step Right';
                }
            }

            this.footerDiagonalHint.textContent = diagText ? `${diagText} • ` : '';
            this.footerDiagonalHint.style.display = diagText ? 'inline' : 'none';
        }

        // Contextual Stairs Hint (Row 1) (CMD-P2-08, CMD-P2-09: btn-stair button writer delegated to input.js in 3D play)
        if (frame.map && player.x !== undefined && player.y !== undefined) {
            const currentFeat = this.getFeatAt(frame.map, player.x, player.y);
            let stairsText = '';
            if (currentFeat === 6) {
                stairsText = depth === 0 ? `[>] Down to Dungeon (50')` : `[>] Down to ${(depth + 1) * 50}ft`;
            } else if (currentFeat === 5) {
                stairsText = depth === 1 ? `[<] Up to Town` : `[<] Up to ${(depth - 1) * 50}ft`;
            }
            if (this.footerStairsHint) {
                this.footerStairsHint.textContent = stairsText;
                this.footerStairsHint.style.display = stairsText ? 'inline-flex' : 'none';
            }
        }

        // Contextual Action Button Pulses (Potion on Low HP, Door button on closed door)
        this.updateContextPulses(frame);

        // Detailed 3-Row Telemetry Footer / Streamlined Status Bar
        if (this.footerCharIdentity) {
            if (isSilQ) {
                const house = player.house || '';
                this.footerCharIdentity.textContent = `${player.name || 'Hero'} of the ${house || player.race || 'Noldor'}`;
            } else {
                this.footerCharIdentity.textContent = `${player.name || 'Hero'} the ${player.race || 'Human'} ${player.class || 'Warrior'}`;
            }
        }
        if (this.footerLevel) {
            const plLevel = player.level !== undefined ? player.level : (player.lev !== undefined ? player.lev : 1);
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && lang === 'jp') {
                this.footerLevel.textContent = `⭐ レベル ${plLevel}`;
            } else if (realm === 'hengband' && lang === 'bilingual') {
                this.footerLevel.textContent = `⭐ Lvl (Lv) ${plLevel}`;
            } else {
                this.footerLevel.textContent = `⭐ Lvl ${plLevel}`;
            }
        }
        if (this.footerHp) {
            this.footerHp.textContent = `HP ${curHp}/${maxHp}`;
            const hpRatio = curHp / Math.max(1, maxHp);
            this.footerHp.style.color = hpRatio > 0.6 ? '#62e062' : (hpRatio > 0.25 ? '#ffd700' : '#ff4444');
        }
        if (this.footerSp) {
            if (maxSp > 0) {
                this.footerSp.style.display = 'inline';
                this.footerSp.textContent = `${isSilQ ? 'VOICE' : 'SP'} ${curSp}/${maxSp}`;
            } else {
                this.footerSp.style.display = 'none';
            }
        }
        if (this.footerAc) {
            if (isSilQ || player.evn !== undefined) {
                const evn = player.evn !== undefined ? player.evn : (player.ac || 0);
                const evnStr = evn >= 0 ? `+${evn}` : `${evn}`;
                const prMin = player.pr_min || 0;
                const prMax = player.pr_max || 0;
                this.footerAc.textContent = `[${evnStr}, ${prMin}-${prMax}]`;
            } else {
                this.footerAc.textContent = `AC ${player.ac !== undefined ? player.ac : '0'}`;
            }
        }
        if (this.footerGold) {
            if (isSilQ) {
                this.footerGold.style.display = 'none';
            } else {
                this.footerGold.style.display = 'inline';
                this.footerGold.textContent = `AU ${(player.gold || 0).toLocaleString()}`;
            }
        }
        if (this.footerExp) {
            const expNext = player.exp_next;
            const expVal = (player.exp !== undefined) ? player.exp.toLocaleString() : '0';
            const nextStr = (expNext !== undefined && expNext > 0) ? `/${expNext.toLocaleString()}` : '';
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && lang === 'jp') {
                this.footerExp.textContent = `✨ 経験値 ${expVal}${nextStr}`;
            } else if (realm === 'hengband' && lang === 'bilingual') {
                this.footerExp.textContent = `✨ EXP (経験値) ${expVal}${nextStr}`;
            } else {
                this.footerExp.textContent = `✨ EXP ${expVal}${nextStr}`;
            }
        }
        if (this.footerPlace) {
            const lang = window.__langMode || 'en';
            if (realm === 'hengband') {
                if (lang === 'jp') {
                    this.footerPlace.textContent = (locStr.includes('荒野') || locStr === 'Wilderness')
                        ? '荒野'
                        : (depth === 0 ? '街 (宿場町)' : `地下${depth}階 (${depth * 50}ft)`);
                } else if (lang === 'bilingual') {
                    this.footerPlace.textContent = (locStr.includes('荒野') || locStr === 'Wilderness')
                        ? 'Wilderness (荒野)'
                        : (depth === 0 ? 'Town (街)' : `DL ${depth} (${depth * 50}ft - 地下${depth}階)`);
                } else {
                    this.footerPlace.textContent = locStr === 'Wilderness' ? 'Wilderness' : (depth === 0 ? 'Town' : `DL ${depth} (${depth * 50}ft)`);
                }
            } else {
                this.footerPlace.textContent = isSilQ ? `${depth * 50}ft` : (locStr === 'Wilderness' ? 'Wilderness' : (depth === 0 ? 'Town' : `DL ${depth} (${depth * 50}ft)`));
            }
        }
        if (this.footerSpeed) {
            const spd = player.speed !== undefined ? player.speed : (isSilQ ? 0 : 110);
            let spdStr = 'Normal (0)';
            if (isSilQ) {
                spdStr = spd > 0 ? `Fast (+${spd})` : (spd < 0 ? `Slow (${spd})` : 'Normal (0)');
            } else {
                if (spd >= 110) {
                    spdStr = spd > 110 ? `Fast (+${spd - 110})` : 'Normal (0)';
                } else if (spd > 0 && spd < 110) {
                    spdStr = `Slow (-${110 - spd})`;
                } else if (spd > 0) {
                    spdStr = `Fast (+${spd})`;
                } else if (spd < 0) {
                    spdStr = `Slow (${spd})`;
                }
            }
            this._lastSpdStr = spdStr;
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && lang === 'jp') {
                const jpSpd = spdStr.replace('Normal', '普通').replace('Fast', '加速').replace('Slow', '減速');
                this.footerSpeed.textContent = `⚡ 速度 ${jpSpd}`;
            } else if (realm === 'hengband' && lang === 'bilingual') {
                this.footerSpeed.textContent = `⚡ Spd (速度) ${spdStr}`;
            } else {
                this.footerSpeed.textContent = `⚡ Spd ${spdStr}`;
            }
        }
        if (this.footerLight) {
            const lightRadius = player.light !== undefined ? player.light : 0;
            const hasLightItem = !!player.light_item;
            const lightItemName = player.light_item || 'None';
            const lightFuel = player.light_fuel || 0;
            const lang = window.__langMode || 'en';
            let lightStr = depth === 0
                ? (hasLightItem ? `☀️ ${lightItemName}` : '☀️ Daylight')
                : (hasLightItem ? `🏮 ${lightItemName} (${lightFuel > 0 ? `${lightFuel}t` : `R:${lightRadius}`})` : (lightRadius > 0 ? `🏮 Light ${lightRadius}` : '🌑 Dark'));
            if (realm === 'hengband') {
                if (lang === 'jp') {
                    if (lightStr.includes('Daylight')) lightStr = '☀️ 昼光';
                    else if (lightStr.includes('Dark')) lightStr = '🌑 暗闇';
                    else if (lightStr.includes('Light')) lightStr = `🏮 光源 ${lightRadius}`;
                } else if (lang === 'bilingual') {
                    if (lightStr.includes('Daylight')) lightStr = '☀️ Daylight (昼光)';
                    else if (lightStr.includes('Dark')) lightStr = '🌑 Dark (暗闇)';
                    else if (lightStr.includes('Light')) lightStr = `🏮 Light (光源) ${lightRadius}`;
                }
            }
            this.footerLight.textContent = lightStr;
        }
        if (this.footerFacing) {
            this.updateFooterFacing(yaw);
        }

        // Target tracking
        if (this.footerTarget || this.reticleTargetCard || document.getElementById('reticle-target-card')) {
            this.updateTargetInspector(player, realm);
        }

        // Status badges
        if (this.footerBadges) {
            const lang = window.__langMode || 'en';
            const statusesKey = (player.statuses && Array.isArray(player.statuses))
                ? player.statuses.map(st => `${st.name || ''}:${st.attr !== undefined ? st.attr : ''}`).join(',')
                : '';
            const badgesKey = `${realm}:${lang}:${statusesKey}:${player.study || 0}:${player.resting || 0}:${player.word_recall || 0}:${player.song || ''}:${player.stealth_mode ? 1 : 0}`;
            if (this._lastBadgesKey !== badgesKey) {
                this._lastBadgesKey = badgesKey;
                const desiredBadges = [];
                if (player.statuses && Array.isArray(player.statuses) && player.statuses.length > 0) {
                    const statusDict = {
                        'Fast': '加速', 'Slow': '減速', 'Blind': '盲目', 'Confused': '混乱',
                        'Poisoned': '毒', 'Afraid': '恐怖', 'Paralyzed': '麻痺', 'Hungry': '空腹',
                        'Weak': '衰弱', 'Cut': '切創', 'Stun': '朦朧', 'Blessed': '祝福',
                        'Hero': '英雄', 'Berserk': '狂戦士', 'Protec': '防護', 'Shield': '盾',
                        'Invuln': '無敵', 'Infra': '赤外視', 'Recall': '帰還', 'Rest': '休息',
                        'Study': '学習', 'Halluc': '幻覚', 'Tired': '疲労', 'Mortal Wound': '致命傷',
                        'Heavy Stun': '大朦朧', 'Knocked Out': '気絶'
                    };
                    player.statuses.forEach(st => {
                        let displayName = st.name || '';
                        if (realm === 'hengband') {
                            if (lang === 'jp' && statusDict[displayName]) {
                                displayName = statusDict[displayName];
                            } else if (lang === 'bilingual' && statusDict[displayName]) {
                                displayName = `${displayName} (${statusDict[displayName]})`;
                            }
                        }
                        desiredBadges.push({
                            cls: 'footer-badge',
                            text: `[${displayName}]`,
                            color: (window.getAngbandColorString && st.attr !== undefined) ? window.getAngbandColorString(st.attr) : ''
                        });
                    });
                }

                const hasStatusMatching = (re) => Array.isArray(player.statuses) && player.statuses.some(st => st && st.name && re.test(st.name));
                if (player.study && player.study > 0 && !hasStatusMatching(/^study/i)) {
                    desiredBadges.push({ cls: 'footer-badge badge-study', text: `[STUDY: ${player.study}]`, color: '' });
                }

                if (player.resting && player.resting !== 0 && !hasStatusMatching(/^rest/i)) {
                    desiredBadges.push({ cls: 'footer-badge badge-resting', text: `[RESTING${player.resting > 0 ? `: ${player.resting}` : ''}]`, color: '' });
                }

                if (player.word_recall && player.word_recall > 0 && !hasStatusMatching(/^recall/i)) {
                    desiredBadges.push({ cls: 'footer-badge badge-recall', text: `[RECALL: ${player.word_recall}t]`, color: '' });
                }

                if (player.song) {
                    desiredBadges.push({ cls: 'footer-badge badge-song', text: `[SONG: ${player.song}]`, color: '#70c0ff' });
                }

                if (player.stealth_mode) {
                    desiredBadges.push({ cls: 'footer-badge badge-stealth', text: '[STEALTH]', color: '#a0a0a0' });
                }

                const existingSpans = Array.from(this.footerBadges.children);
                for (let i = 0; i < desiredBadges.length; i++) {
                    const b = desiredBadges[i];
                    let span = existingSpans[i];
                    if (!span) {
                        span = document.createElement('span');
                        this.footerBadges.appendChild(span);
                    }
                    if (span.className !== b.cls) span.className = b.cls;
                    if (span.textContent !== b.text) span.textContent = b.text;
                    if (span.style.color !== b.color) span.style.color = b.color;
                }
                for (let i = existingSpans.length - 1; i >= desiredBadges.length; i--) {
                    existingSpans[i].remove();
                }
            }
        }

        // Gear summary on status bar
        const _hudItemStr = (v) => (v && typeof v === 'object') ? String(v.name || v.desc || '') : String(v || '');
        if (this.footerGear) {
            const rawWeap = _hudItemStr(player.weapon_item);
            const rawBow = _hudItemStr(player.bow_item);
            const rawShield = _hudItemStr(player.shield_item);
            const lang = window.__langMode || 'en';
            const locItem = (name) => {
                if (!name) return name;
                if (realm === 'hengband') {
                    if (window.HengTranslate && window.__hengTranslatorV2 !== false) {
                        return window.HengTranslate.translateName(name, 1, lang);
                    }
                    if (typeof window.getLocalizedItemName === 'function') {
                        return window.getLocalizedItemName(name, 'hengband', lang);
                    }
                }
                return name;
            };
            const weap = rawWeap ? locItem(rawWeap) : ((realm === 'hengband' && lang === 'jp') ? '素手' : 'Bare Hands');
            const bow = rawBow ? locItem(rawBow) : null;
            const shield = rawShield ? locItem(rawShield) : ((realm === 'hengband' && lang === 'jp') ? 'なし' : 'None');
            this.footerGear.style.display = 'inline-flex';
            this.footerGear.textContent = bow ? `⚔ ${weap} • 🏹 ${bow}` : `⚔ ${weap}`;
            this.footerGear.title = `Wielding: ${weap} • Shield: ${shield} • Ranged: ${bow || 'None'}`;
        }

        // Turn number tracking
        if (player.turn !== undefined) {
            this.currentTurn = player.turn;
        } else if (player.game_turn !== undefined) {
            this.currentTurn = player.game_turn;
        } else if (frame && frame.turn !== undefined) {
            this.currentTurn = frame.turn;
        }

        // Update Extended Character Context Drawer (Wave 10 Track B — In-Place Text Reconciliation)
        const drawerEl = document.getElementById('char-extended-drawer');
        if (drawerEl) {
            const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
            const reconcileDrawerGrid = (sig, pairs) => {
                if (this._lastExtendedDrawerSig === sig) return;
                this._lastExtendedDrawerSig = sig;
                const gridEl = drawerEl.querySelector('.char-ext-grid');
                const existingItems = gridEl ? Array.from(gridEl.querySelectorAll('.char-ext-item')) : [];
                if (gridEl && existingItems.length === pairs.length) {
                    for (let i = 0; i < pairs.length; i++) {
                        const [k, v] = pairs[i];
                        const lbl = existingItems[i].querySelector('.char-ext-lbl');
                        const val = existingItems[i].querySelector('.char-ext-val');
                        if (lbl && lbl.textContent !== k) lbl.textContent = k;
                        if (val && val.textContent !== v) {
                            val.textContent = v;
                            val.title = v;
                        }
                    }
                } else {
                    drawerEl.innerHTML = `<div class="char-ext-grid">${pairs.map(([k, v]) => `<div class="char-ext-item"><span class="char-ext-lbl">${esc(k)}</span><span class="char-ext-val" title="${esc(v)}">${esc(v)}</span></div>`).join('')}</div>`;
                }
            };
            if (isSilQ) {
                const getSilqSkill = (sk) => {
                    if (player.skills && player.skills[sk.toLowerCase()] !== undefined) {
                        return String(player.skills[sk.toLowerCase()]);
                    }
                    if (player.skills && player.skills[sk] !== undefined) {
                        return String(player.skills[sk]);
                    }
                    if (frame.term && frame.term.lines) {
                        const text = frame.term.lines.join('\n');
                        const re = new RegExp(sk + '(?:\\s*:\\s*|\\s+)([+-]?[0-9]+)', 'i');
                        const m = text.match(re);
                        if (m) return m[1];
                    }
                    return '0';
                };
                const mel = getSilqSkill('Melee');
                const arc = getSilqSkill('Archery');
                const eva = getSilqSkill('Evasion') !== '0' ? getSilqSkill('Evasion') : (getSilqSkill('Evade') !== '0' ? getSilqSkill('Evade') : (player.evn !== undefined ? String(player.evn) : '0'));
                const stl = getSilqSkill('Stealth');
                const per = getSilqSkill('Perception');
                const wil = getSilqSkill('Will');
                const smi = getSilqSkill('Smithing');
                const sng = getSilqSkill('Song');
                const voice = `${curSp}/${maxSp}`;
                const turn = String(this.currentTurn || 0);
                const sig = `silq:${mel}:${arc}:${eva}:${stl}:${per}:${wil}:${smi}:${sng}:${voice}:${turn}`;
                reconcileDrawerGrid(sig, [
                    ['Melee', mel], ['Archery', arc],
                    ['Evasion', eva], ['Stealth', stl],
                    ['Perception', per], ['Will', wil],
                    ['Smithing', smi], ['Song', sng],
                    ['Voice', voice], ['Turn', turn]
                ]);
            } else {
                const maxD = player.max_depth ? `${player.max_depth * 50}ft (DL${player.max_depth})` : (depth > 0 ? `${depth * 50}ft (DL${depth})` : 'Town');
                const spd = this._lastSpdStr || 'Normal (0)';
                const turn = String(this.currentTurn || 0);
                const xp = `${(player.exp || 0).toLocaleString()}${player.exp_next ? ` / ${player.exp_next.toLocaleString()}` : ''}`;
                const eqCount = (player.equipment && Array.isArray(player.equipment)) ? String(player.equipment.length) : (player.equip_count !== undefined ? String(player.equip_count) : (player.equip ? String(Object.keys(player.equip).length) : '--'));
                const pkCount = (player.inventory && Array.isArray(player.inventory)) ? String(player.inventory.length) : (player.inven_count !== undefined ? String(player.inven_count) : (player.inven ? String(Object.keys(player.inven).length) : '--'));
                const weap = _hudItemStr(player.weapon_item) || 'Bare Hands';
                const light = _hudItemStr(player.light_item) || (player.cur_light > 0 ? `Light +${player.cur_light}` : (player.light > 0 ? `Light +${player.light}` : 'Daylight / Dark'));
                const sig = `std:${maxD}:${spd}:${turn}:${xp}:${eqCount}:${pkCount}:${weap}:${light}`;
                reconcileDrawerGrid(sig, [
                    ['Max Depth', maxD],
                    ['Speed', spd],
                    ['Turn', turn],
                    ['XP', xp],
                    ['Equip Count', eqCount],
                    ['Pack Count', pkCount],
                    ['Weapon', weap],
                    ['Light/Torch', light]
                ]);
            }
        }

        if (!this.messageFeedWindow) {
            this.messageFeedWindow = document.getElementById('message-feed-window');
        }
        if (!this.messageFeedList) {
            this.messageFeedList = document.getElementById('message-feed-list');
            this.messageFeedScroll = document.getElementById('message-feed-scroll');
        }

        const inPlay = Boolean(frame && (frame.phase === 'play' || (frame.player && frame.player.name)));

        // Message Feed Window Visibility: Respect user toggle state, drawer on phone, and terminal overlay
        const inOverlayOrTerminal = Boolean(frame && frame.ui && (frame.ui.overlay || 0) > 0) ||
                                    Boolean(window.__app && window.__app.needsTerminal && window.__app.needsTerminal(frame));
        if (this.messageFeedWindow) {
            const isPhone = window.DeviceProfile && window.DeviceProfile.getTier() === 'phone';
            if (inPlay && !inOverlayOrTerminal && !window.__messageLogClosed) {
                if (isPhone && !this.messageFeedWindow.classList.contains('mobile-expanded')) {
                    this.messageFeedWindow.style.display = 'none';
                } else {
                    this.messageFeedWindow.style.display = 'flex';
                    this.messageFeedWindow.style.visibility = 'visible';
                    this.messageFeedWindow.style.opacity = '1';
                }
            } else {
                this.messageFeedWindow.style.display = 'none';
            }
        }

        const moreBadge = document.getElementById('msg-more-indicator');
        if (moreBadge) {
            moreBadge.style.display = 'none'; // Auto-advanced, no pulsing chip required
        }

        // Clean message log start upon entering active play (Town or Dungeon)
        if (inPlay && (!this.wasInPlay || !this.messageHistory || this.messageHistory.length === 0)) {
            const depth = player.depth !== undefined ? player.depth : 0;
            this.lastDepth = depth;
            const rKeys = typeof RealmKeys !== 'undefined' ? RealmKeys : (typeof window !== 'undefined' ? window.RealmKeys : null);
            const realm = (frame && frame.realm) || (this.lastFrame && this.lastFrame.realm) || (window.activeRealm) || 'angband';
            const realmText = (rKeys && rKeys.REALM_TEXT && rKeys.REALM_TEXT[realm]) || { town: 'the Town', depthUnit: 'ft', feetPerLevel: 50 };
            const feetPerLvl = realmText.feetPerLevel || 50;
            const depthUnit = realmText.depthUnit || 'ft';

            let welcomeMsg;
            if (depth === 0) {
                welcomeMsg = realmText.town
                    ? `Welcome to ${realmText.town}! Visit the General Store and Armory to equip your journey.`
                    : "Welcome! Prepare to begin your journey.";
            } else {
                welcomeMsg = `You descend into Dungeon Level ${depth} (${depth * feetPerLvl}${depthUnit}).`;
            }

            this.resetMessages(welcomeMsg);
            this.lastSeenMessages = (frame.messages && Array.isArray(frame.messages))
                ? frame.messages.filter(m => m && m.text && m.text.trim().length > 0 &&
                    !m.text.trim().startsWith('===') && !m.text.trim().startsWith('---')).map(m => ({ text: m.text, count: m.count, attr: m.attr }))
                : [];
            this.lastTermRow0 = '';
        }

        // Track staircase floor transitions (Town <-> Dungeon depths)
        if (inPlay && player.depth !== undefined && this.lastDepth !== undefined && player.depth !== this.lastDepth) {
            const rKeys = typeof RealmKeys !== 'undefined' ? RealmKeys : (typeof window !== 'undefined' ? window.RealmKeys : null);
            const realm = (frame && frame.realm) || (this.lastFrame && this.lastFrame.realm) || (window.activeRealm) || 'angband';
            const realmText = (rKeys && rKeys.REALM_TEXT && rKeys.REALM_TEXT[realm]) || { town: 'the Town', depthUnit: 'ft', feetPerLevel: 50 };
            const feetPerLvl = realmText.feetPerLevel || 50;
            const depthUnit = realmText.depthUnit || 'ft';

            if (player.depth > this.lastDepth) {
                this.addMessage(`You descend into Dungeon Level ${player.depth} (${player.depth * feetPerLvl}${depthUnit}).`, '#ffd700');
            } else if (player.depth < this.lastDepth) {
                const ascendMsg = player.depth === 0
                    ? (realmText.town ? `You return to the surface of ${realmText.town}.` : "You return to the surface.")
                    : `You ascend to Dungeon Level ${player.depth} (${player.depth * feetPerLvl}${depthUnit}).`;
                this.addMessage(ascendMsg, '#ffd700');
            }
            this.lastDepth = player.depth;
        }

        // Multi-Line Message Log Queue: Capture ALL in-game messages during active play
        if (inPlay) {
            let newItems = [];
            // 1. Process structured engine messages
            if (frame.messages && Array.isArray(frame.messages)) {
                const curList = frame.messages.filter(m => m && m.text && m.text.trim().length > 0 &&
                    !m.text.trim().startsWith('===') && !m.text.trim().startsWith('---'));
                const prevList = this.lastSeenMessages || [];

                if (curList.length > 0) {
                    if (prevList.length === 0) {
                        newItems = curList;
                    } else {
                        // Suffix matching to find newly appended messages
                        let matchedOverlap = 0;
                        const maxK = Math.min(prevList.length, curList.length);
                        for (let k = maxK; k > 0; k--) {
                            let match = true;
                            for (let j = 0; j < k; j++) {
                                if (prevList[prevList.length - k + j].text !== curList[j].text) {
                                    match = false;
                                    break;
                                }
                            }
                            if (match) {
                                matchedOverlap = k;
                                break;
                            }
                        }

                        newItems = curList.slice(matchedOverlap);

                        // If no new items were appended, did the last message increment its count?
                        if (newItems.length === 0 && prevList.length > 0) {
                            const prevLast = prevList[prevList.length - 1];
                            const curLast = curList[curList.length - 1];
                            if (prevLast && curLast && prevLast.text === curLast.text && curLast.count > (prevLast.count || 1)) {
                                const diff = curLast.count - (prevLast.count || 1);
                                const col = this.getMessageColor(curLast.text.trim(), curLast.attr);
                                const isCombat = this.isCombatMessage(curLast.text.trim());
                                if (isCombat) {
                                    for (let c = 0; c < diff; c++) {
                                        this.addMessage(curLast.text.trim(), col, curLast.text.trim());
                                    }
                                } else {
                                    this.updateLastMessageCount(curLast.text.trim(), curLast.count);
                                }
                            }
                        }
                    }

                    for (const item of newItems) {
                        let text = item.text.trim();
                        if (item.count && item.count > 1 && !this.isCombatMessage(text)) {
                            text += ` (x${item.count})`;
                        }
                        const col = this.getMessageColor(item.text.trim(), item.attr);
                        this.addMessage(text, col, item.text.trim());
                    }

                    this.lastSeenMessages = curList.map(m => ({ text: m.text, count: m.count, attr: m.attr }));
                }
            }

            // 2. Also capture distinct dynamic action lines on term row 0 during play (prompts, status changes)
            if (frame.term && frame.term.rows && frame.term.rows[0] && frame.term.rows[0].g) {
                let line0 = frame.term.rows[0].g.trim();
                line0 = line0.replace(/\s*[-–—]more[-–—]\s*$/i, '');
                line0 = line0.replace(/\s*\[more\]\s*$/i, '');
                line0 = line0.replace(/\s*\[?\s*press\s+space\s*\]?\s*$/i, '');
                line0 = line0.trim();
                const isMenuPrompt = line0.includes('Select Item:') ||
                                     line0.includes('(Inven:') ||
                                     line0.includes('(Equip:') ||
                                     line0.includes('which item?') ||
                                     line0.includes('which potion?') ||
                                     line0.includes('which scroll?') ||
                                     line0.includes('which spell?') ||
                                     line0.includes('which prayer?') ||
                                     line0.includes('Direction or <click>') ||
                                     line0.includes('Select an option') ||
                                     line0.includes('Press any key') ||
                                     line0.startsWith('---') ||
                                     line0.startsWith('===');

                if (line0 && line0.length > 0 && !isMenuPrompt) {
                    const alreadyInNewItems = newItems.some(it => it.text && it.text.trim() === line0);
                    const isNewAction = line0 !== this.lastTermRow0;
                    if (!alreadyInNewItems && isNewAction) {
                        const col = this.getMessageColor(line0);
                        this.addMessage(line0, col, line0);
                    }
                    this.lastTermRow0 = line0;
                } else if (!line0) {
                    this.lastTermRow0 = '';
                }
            }

            // 3. Update the Top In-Game Message & Combat Banner (1:1 with Godot Overlay.cs:1572-1587)
            this.updateTopMessageBanner(frame);
        }

        this.wasInPlay = inPlay;

        // Process message queue turn/time expiration tick
        this.tickMessageQueue();

        // Minimap Radar & Compass
        if (frame.map && frame.player) {
            this.renderMinimap(frame.map, frame.player, frame.monsters || [], this.currentCameraYaw);
        }
        this.renderCompass(this.currentCameraYaw);

        // Check if player died: ALWAYS display death modal whenever player is dead or HP <= 0
        const isDead = Boolean(player.dead || (player.hp !== undefined && player.hp <= 0 && player.hp_max > 0));
        if (isDead) {
            this.isDeadInPlay = true;
            this.showDeathModal(frame);
        } else {
            this.isDeadInPlay = false;
            this.hideDeathModal();
        }
    }

    getFeatAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= map.h || x < 0 || x >= map.w) return 0;
        const row = map.rows[y];
        if (!row || !row.f) return 0;
        const idx = x * 2;
        if (idx + 1 >= row.f.length) return 0;
        const hi = parseInt(row.f[idx], 16) || 0;
        const lo = parseInt(row.f[idx + 1], 16) || 0;
        return (hi << 4) | lo;
    }

    isStoreKind(feat) {
        return feat >= 7 && feat <= 14;
    }

    isWalkableOrPortal(feat) {
        return feat === 1 || feat === 2 || feat === 3 || feat === 4 || feat === 5 || feat === 6 || feat === 16 || feat === 23 || feat === 24 || (feat >= 25 && feat <= 28) || feat === 31 || this.isStoreKind(feat);
    }

    updateContextPulses(frame) {
        if (!frame || !frame.player) return;
        const player = frame.player;
        const curHp = player.hp !== undefined ? player.hp : 0;
        const maxHp = player.hp_max || player.maxHp || 1;

        // Contextual Action Button Pulses (Potion on Low HP, Door button on closed door)
        const btnQuaff = document.getElementById('btn-quaff');
        if (btnQuaff) {
            const isLowHp = maxHp > 0 && (curHp / maxHp) <= 0.30;
            btnQuaff.classList.toggle('smart-low-hp', isLowHp);
        }

        const btnDoor = document.getElementById('btn-door');
        if (btnDoor && frame.map && player.x !== undefined && player.y !== undefined) {
            const facing = window.__app && window.__app.dungeon ? window.__app.dungeon.facing : 0;
            const forwardOffsets = [
                { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
            ];
            const fwd = forwardOffsets[facing] || { dx: 0, dy: -1 };
            const frontFeat = this.getFeatAt(frame.map, player.x + fwd.dx, player.y + fwd.dy);
            const isDoorInFront = frontFeat === 3 || frontFeat === 4;
            btnDoor.classList.toggle('smart-door-active', isDoorInFront);
        }

        const btnPickup = document.getElementById('btn-pickup');
        if (btnPickup && player.x !== undefined && player.y !== undefined) {
            let itemOnTile = false;
            if (Array.isArray(frame.items)) {
                itemOnTile = frame.items.some(it => it.x === player.x && it.y === player.y);
            }
            btnPickup.classList.toggle('smart-item-active', itemOnTile);
        }
    }

    /* -------------------------------------------------------------
     * Atmospheric Death Screen Modal (Matches Godot Overlay.cs:840-1022)
     * ------------------------------------------------------------- */
    hideDeathModal() {
        if (!this.deathModal) return;
        this.deathModal.classList.add('hidden');
        this.isDeadInPlay = false;
    }

    rerollCharacter() {
        this.hideDeathModal();
        this.isDeadInPlay = false;
        const newChar = (window.__app && typeof window.__app.generateHeroName === 'function')
            ? window.__app.generateHeroName()
            : ('Hero_' + Math.random().toString(36).substring(2, 6).toUpperCase());
        console.log('[Angband3D] Reroll requested. Starting fresh character:', newChar);
        const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function')
            ? `&realm=${encodeURIComponent(window.__app.getActiveRealm())}`
            : '';
        window.location.href = `/?char=${encodeURIComponent(newChar)}&new=1${realmParam}`;
    }

    setupDeathModal() {
        if (!this.deathModal) return;

        this.deathTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabIdx = parseInt(tab.dataset.tab, 10);
                this.switchDeathTab(tabIdx);
            });
        });

        const btnReload = document.getElementById('btn-death-reload');
        if (btnReload) {
            btnReload.addEventListener('click', () => {
                this.hideDeathModal();
                if (window.__app && window.__app.reloadLastSave) {
                    window.__app.reloadLastSave();
                } else if (window.__app && window.__app.startNewRandomHero) {
                    window.__app.startNewRandomHero();
                } else {
                    window.location.reload();
                }
            });
        }

        const btnReroll = document.getElementById('btn-death-reroll');
        if (btnReroll) {
            btnReroll.addEventListener('click', () => {
                this.hideDeathModal();
                if (window.chronicleManager && typeof window.chronicleManager.resetForNewCharacter === 'function') {
                    window.chronicleManager.resetForNewCharacter();
                }
                if (window.__app && window.__app.startNewRandomHero) {
                    window.__app.startNewRandomHero();
                } else {
                    this.rerollCharacter();
                }
            });
        }

        const btnMenu = document.getElementById('btn-death-menu');
        if (btnMenu) {
            btnMenu.addEventListener('click', () => {
                this.hideDeathModal();
                if (window.__app && window.__app.returnToMainMenu) {
                    window.__app.returnToMainMenu();
                } else {
                    window.location.href = '/';
                }
            });
        }
    }

    switchDeathTab(idx) {
        this.activeDeathTab = idx;
        this.deathTabs.forEach(t => {
            t.classList.toggle('active', parseInt(t.dataset.tab, 10) === idx);
        });
        this.deathContents.forEach((c, i) => {
            c.classList.toggle('active', i === idx);
        });

        const frameToUse = this.lastDeathFrame || this.lastFrame;
        if (frameToUse) {
            this.renderDeathTabContent(idx, frameToUse);
        }
    }

    showDeathModal(frame) {
        if (!this.deathModal) return;
        this.deathModal.classList.remove('hidden');
        this.lastDeathFrame = frame;

        const player = frame.player || {};
        const name = player.name || 'Hero';
        const race = player.race || 'Human';
        const pClass = player.class || 'Warrior';
        const level = player.level || 1;
        const depth = player.depth || 0;
        const maxDepth = player.max_depth || depth;
        const gold = player.gold || 0;
        const exp = player.exp || 0;
        const diedFrom = player.died_from || 'mortal wounds';

        if (this.deathEpitaph) {
            this.deathEpitaph.textContent = `${name} the ${race} ${pClass} (Level ${level})`;
        }
        if (this.deathCause) {
            const depthStr = depth === 0 ? 'in the Town' : `on Dungeon Level ${depth} (${depth * 50} ft)`;
            this.deathCause.textContent = `Killed by ${diedFrom} ${depthStr}.`;
        }
        if (this.deathScore) {
            this.deathScore.textContent = `Gold: ${gold.toLocaleString()} AU  •  Experience: ${exp.toLocaleString()}  •  Deepest Level: ${maxDepth} (${maxDepth * 50} ft)`;
        }

        // Update tab header badge counts
        const eqCount = (player.equipment && Array.isArray(player.equipment)) ? player.equipment.length : 0;
        const invCount = (player.inventory && Array.isArray(player.inventory)) ? player.inventory.length : 0;
        const quivCount = (player.quiver && Array.isArray(player.quiver)) ? player.quiver.length : 0;

        if (this.deathTabs[1]) this.deathTabs[1].textContent = `2. Equipment (${eqCount})`;
        if (this.deathTabs[2]) this.deathTabs[2].textContent = `3. Inventory (${invCount})`;
        if (this.deathTabs[3]) this.deathTabs[3].textContent = `4. Quiver (${quivCount})`;

        this.renderDeathTabContent(this.activeDeathTab, frame);
    }

    renderDeathTabContent(tabIdx, frame) {
        const player = frame.player || {};

        if (tabIdx === 0) {
            // Tab 0: Tombstone Terminal Canvas
            const termCanvas = document.getElementById('death-terminal-canvas');
            if (termCanvas && frame.term) {
                if (!this.deathTerminal) {
                    this.deathTerminal = new WebTerminal('death-terminal-canvas', (key) => {
                        if (window.__app && window.__app.network) {
                            window.__app.network.sendKey(key);
                        }
                    });
                }
                this.deathTerminal.render(frame.term);
            }
        } else if (tabIdx === 1) {
            // Tab 1: Equipment List
            const list = document.getElementById('death-equipment-list');
            if (list) {
                list.innerHTML = '';
                const eq = player.equipment || [];
                if (eq.length === 0) {
                    list.innerHTML = '<li class="death-list-empty">(No equipment worn at death)</li>';
                } else {
                    eq.forEach(item => {
                        const li = document.createElement('li');
                        li.className = 'death-list-item';
                        const prefix = item.mention || item.slot_name || '';
                        li.innerHTML = `<span class="item-slot">${escapeHtml(prefix)}</span><span class="item-name">${escapeHtml(item.name || '')}</span><span class="item-weight">${item.weight ? (item.weight / 10).toFixed(1) + ' lbs' : ''}</span>`;
                        list.appendChild(li);
                    });
                }
            }
        } else if (tabIdx === 2) {
            // Tab 2: Inventory List
            const list = document.getElementById('death-inventory-list');
            if (list) {
                list.innerHTML = '';
                const inv = player.inventory || [];
                if (inv.length === 0) {
                    list.innerHTML = '<li class="death-list-empty">(Inventory was empty)</li>';
                } else {
                    inv.forEach((item, idx) => {
                        const li = document.createElement('li');
                        li.className = 'death-list-item';
                        const letter = String.fromCharCode(97 + idx); // a, b, c...
                        li.innerHTML = `<span class="item-slot">${escapeHtml(letter)})</span><span class="item-name">${escapeHtml(item.name || '')}</span><span class="item-weight">${item.weight ? (item.weight / 10).toFixed(1) + ' lbs' : ''}</span>`;
                        list.appendChild(li);
                    });
                }
            }
        } else if (tabIdx === 3) {
            // Tab 3: Quiver List
            const list = document.getElementById('death-quiver-list');
            if (list) {
                list.innerHTML = '';
                const quiv = player.quiver || [];
                if (quiv.length === 0) {
                    list.innerHTML = '<li class="death-list-empty">(Quiver was empty)</li>';
                } else {
                    quiv.forEach((item, idx) => {
                        const li = document.createElement('li');
                        li.className = 'death-list-item';
                        li.innerHTML = `<span class="item-slot">${idx})</span><span class="item-name">${escapeHtml(item.name || '')}</span><span class="item-weight">${item.weight ? (item.weight / 10).toFixed(1) + ' lbs' : ''}</span>`;
                        list.appendChild(li);
                    });
                }
            }
        } else if (tabIdx === 4) {
            // Tab 4: Character Attributes & Statistics Grid
            const container = document.getElementById('death-stats-container');
            if (container) {
                const getStat = s => (s && typeof s === 'object') ? (s.use || s.top || '10') : (s || '10');
                const stats = player.stats || {};
                container.innerHTML = `
                    <div class="death-stat-card"><div class="stat-name">STRENGTH</div><div class="stat-num">${escapeHtml(String(getStat(stats.str)))}</div></div>
                    <div class="death-stat-card"><div class="stat-name">INTELLIGENCE</div><div class="stat-num">${escapeHtml(String(getStat(stats.int)))}</div></div>
                    <div class="death-stat-card"><div class="stat-name">WISDOM</div><div class="stat-num">${escapeHtml(String(getStat(stats.wis)))}</div></div>
                    <div class="death-stat-card"><div class="stat-name">DEXTERITY</div><div class="stat-num">${escapeHtml(String(getStat(stats.dex)))}</div></div>
                    <div class="death-stat-card"><div class="stat-name">CONSTITUTION</div><div class="stat-num">${escapeHtml(String(getStat(stats.con)))}</div></div>
                    <div class="death-stat-card"><div class="stat-name">ARMOR CLASS</div><div class="stat-num">${player.ac || 0}</div></div>
                    <div class="death-stat-card"><div class="stat-name">SPEED</div><div class="stat-num">${player.speed || 110}</div></div>
                    <div class="death-stat-card"><div class="stat-name">DEEP LEVEL</div><div class="stat-num">${player.max_depth || player.depth || 0} (${(player.max_depth || player.depth || 0) * 50}ft)</div></div>
                `;
            }
        }
    }
}

window.WebHUD = WebHUD;

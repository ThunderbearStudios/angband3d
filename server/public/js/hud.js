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
        // # ROOT-CAUSE: Restore classic 168x168 Compact minimap preset and explicitly sync minimapCanvas.style.width/height in applyMinimapSize so preset resizing overrides any prior custom drag dimensions.
        this.minimapSizes = [
            { cls: 'standard', name: 'Standard', w: 260, h: 260 },
            { cls: 'expanded', name: 'Expanded', w: 360, h: 360 },
            { cls: 'tactical', name: 'Tactical', w: 460, h: 460 },
            { cls: 'compact', name: 'Compact', w: 228, h: 204 }
        ];
        this.minimapSizeIndex = 3;
        this.minimapZoom = 1.0;
        this.currentCameraYaw = 0;
        this.lastFrame = null;
        this.audio = null;

        this.applyMinimapSize();

        // Left Panel (Health, Mana, Attributes)
        this.hpFill = document.getElementById('hp-fill'); this.hpGhostFill = document.getElementById('hp-ghost-fill'); this.hpText = document.getElementById('hp-text');
        this.spFill = document.getElementById('sp-fill'); this.spGhostFill = document.getElementById('sp-ghost-fill'); this.spText = document.getElementById('sp-text');
        this.charTitle = document.getElementById('char-title');

        this.statStr = document.getElementById('stat-str'); this.statInt = document.getElementById('stat-int'); this.statWis = document.getElementById('stat-wis');
        this.statDex = document.getElementById('stat-dex'); this.statCon = document.getElementById('stat-con'); this.statChr = document.getElementById('stat-chr'); this.statGra = document.getElementById('stat-gra');

        this.itemStr = document.getElementById('stat-item-str'); this.itemInt = document.getElementById('stat-item-int'); this.itemWis = document.getElementById('stat-item-wis');
        this.itemDex = document.getElementById('stat-item-dex'); this.itemCon = document.getElementById('stat-item-con'); this.itemChr = document.getElementById('stat-item-chr');
        this.itemGra = document.getElementById('stat-item-gra'); this.itemAc = document.getElementById('stat-item-ac'); this.itemGold = document.getElementById('stat-item-gold');
        const docQs = typeof document.querySelector === 'function' ? (sel) => document.querySelector(sel) : () => null;
        this.spContainer = docQs('.gauge-sp'); this.expContainer = docQs('.gauge-exp');
        this.spLabel = docQs('.gauge-sp .gauge-header span:first-child');

        this.depthVal = document.getElementById('val-depth'); this.goldVal = document.getElementById('val-gold'); this.acVal = document.getElementById('val-ac'); this.pingBadge = document.getElementById('ping-badge');

        // Top Landscape Message Feed Window (Full message history with scrollback)
        this.messageFeedWindow = document.getElementById('message-feed-window'); this.messageFeedList = document.getElementById('message-feed-list'); this.messageFeedScroll = document.getElementById('message-feed-scroll');
        this.messageHistory = []; this.userScrolledUp = false; this.prevMessages = null; this.lastTermRow0 = ''; this.currentTurn = 0; this.isDeadInPlay = false; this._wasPhasePlay = false;

        // Detailed 3-Row Telemetry Footer (Matches Overlay.cs:1620-1740)
        this.footerDiagonalHint = document.getElementById('footer-diagonal-hint'); this.footerStairsHint = document.getElementById('footer-stairs-hint');
        this.footerLevel = document.getElementById('footer-level'); this.footerExp = document.getElementById('footer-exp'); this.footerPlace = document.getElementById('footer-place');
        this.footerSpeed = document.getElementById('footer-speed'); this.footerLight = document.getElementById('footer-light'); this.footerFacing = document.getElementById('footer-facing');
        this.footerTarget = document.getElementById('footer-target'); this.reticleTargetCard = document.getElementById('reticle-target-card');
        this.footerBadges = document.getElementById('footer-badges'); this.footerGear = document.getElementById('footer-gear');

        // Death Screen Modal Elements (Matches Overlay.cs:840-935)
        this.deathModal = document.getElementById('death-modal'); this.deathEpitaph = document.getElementById('death-epitaph'); this.deathCause = document.getElementById('death-cause'); this.deathScore = document.getElementById('death-score');
        this.deathTabs = document.querySelectorAll('.death-tab'); this.deathContents = document.querySelectorAll('.death-tab-content'); this.activeDeathTab = 0; this.deathTerminal = null;

        this.setupMinimapControls();
        this.setupCharacterPanelShortcuts();
        this.setupDeathModal();
        this.setupMessageFeed();
        if (typeof this.initUniversalMovableHud === 'function') this.initUniversalMovableHud();
        if (typeof this.setDockPreset === 'function') this.setDockPreset();

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
        this.minimapCanvas.style.width = `${size.w}px`;
        this.minimapCanvas.style.height = `${size.h}px`;

        if (this.minimapContainer) {
            this.minimapContainer.classList.remove('compact', 'standard', 'expanded', 'tactical', 'command', 'minimap-size-compact', 'minimap-narrow');
            if (this.minimapContainer.dataset) delete this.minimapContainer.dataset.customSize;
            if (size.cls === 'compact') this.minimapContainer.classList.add('minimap-size-compact');
            this.minimapContainer.classList.add(size.cls);
            this.minimapContainer.style.width = `${size.w}px`;
            this.minimapContainer.style.height = 'auto';
            this.minimapContainer.style.maxWidth = '';
            this.minimapContainer.style.maxHeight = '';
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
                    if (this.messageFeedWindow.dataset) delete this.messageFeedWindow.dataset.customSize;
                    this.messageFeedWindow.style.height = '';
                    this.messageFeedWindow.style.maxHeight = '';
                    try { localStorage.removeItem('angband_msg_size'); } catch (_) {}
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
                    if (typeof window !== 'undefined' && typeof window.__clampFloatingWindows === 'function') {
                        window.__clampFloatingWindows();
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
                let pill = document.getElementById('msg-sticky-pill');
                if (!pill && this.messageFeedWindow) {
                    pill = document.createElement('button');
                    pill.id = 'msg-sticky-pill';
                    pill.type = 'button';
                    pill.className = 'msg-sticky-pill hidden';
                    pill.textContent = '↓ New messages';
                    pill.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.userScrolledUp = false;
                        this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
                        pill.classList.add('hidden');
                    });
                    this.messageFeedWindow.appendChild(pill);
                }
                this._showMsgStickyPill = (show) => {
                    const p = document.getElementById('msg-sticky-pill');
                    if (p) p.classList.toggle('hidden', !show);
                };
                this.messageFeedScroll.addEventListener('scroll', () => {
                    const maxScroll = this.messageFeedScroll.scrollHeight - this.messageFeedScroll.clientHeight;
                    // If within 24px of bottom, stick to bottom on new messages
                    this.userScrolledUp = (maxScroll - this.messageFeedScroll.scrollTop) > 24;
                    if (!this.userScrolledUp) this._showMsgStickyPill(false);
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
        if (this._msgFeedIdleTimer && typeof this._msgFeedIdleTimer.unref === 'function') {
            this._msgFeedIdleTimer.unref();
        }
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
        const parsedIn = this._parseRepeatText(trimmed);
        const baseNorm = this._normFeedText(rawText || parsedIn.base);
        const isCombat = this.isCombatMessage(parsedIn.base || trimmed);

        const realm = (this.lastFrame && this.lastFrame.realm) || (window.activeRealm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
        const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
        let baseDisplayText = parsedIn.base || trimmed;
        if (realm === 'hengband' && typeof window !== 'undefined' && typeof window.localizeGameMessage === 'function') {
            baseDisplayText = window.localizeGameMessage(baseNorm || parsedIn.base, 'hengband', lang);
        }
        const initRepeat = Math.max(1, parsedIn.count || 1);
        const displayText = (!isCombat && initRepeat > 1) ? `${baseDisplayText} (x${initRepeat})` : baseDisplayText;

        // Only collapse non-combat, repetitive status notices (e.g. repeatedly bumping into a wall)
        const lastMsg = this.messageHistory.length > 0 ? this.messageHistory[this.messageHistory.length - 1] : null;
        if (!isCombat && lastMsg && baseNorm && this._normFeedText(lastMsg.rawText || lastMsg.text) === baseNorm) {
            lastMsg.repeat = initRepeat > 1 ? Math.max(lastMsg.repeat || 1, initRepeat) : ((lastMsg.repeat || 1) + 1);
            if (lastMsg.el) {
                lastMsg.el.textContent = `${lastMsg.baseDisplay || this._normFeedText(lastMsg.text)} (x${lastMsg.repeat})`;
            }
            if (this.messageFeedScroll && !this.userScrolledUp) {
                this.messageFeedScroll.scrollTop = this.messageFeedScroll.scrollHeight;
            } else if (this.userScrolledUp && this._showMsgStickyPill) {
                this._showMsgStickyPill(true);
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
            baseDisplay: baseDisplayText,
            rawText: baseNorm,
            repeat: initRepeat,
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
            if (this._showMsgStickyPill) this._showMsgStickyPill(false);
        } else if (this.userScrolledUp && this._showMsgStickyPill) {
            this._showMsgStickyPill(true);
        }
        this.resetMessageFeedIdleTimer();
    }

    updateLastMessageCount(rawText, count) {
        if (!this.messageHistory || this.messageHistory.length === 0) return;
        const lastMsg = this.messageHistory[this.messageHistory.length - 1];
        const normTarget = this._normFeedText(rawText);
        if (lastMsg && ((normTarget && this._normFeedText(lastMsg.rawText || lastMsg.text) === normTarget) || lastMsg.rawText === rawText || lastMsg.text === rawText || lastMsg.text.startsWith(rawText))) {
            lastMsg.repeat = count;
            if (lastMsg.el) {
                lastMsg.el.textContent = `${lastMsg.baseDisplay || this._normFeedText(lastMsg.text) || normTarget} (x${count})`;
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

        const msgFeedWin = this.messageFeedWindow || document.getElementById('message-feed-window');
        const msgFeedVisible = Boolean(
            msgFeedWin &&
            !msgFeedWin.classList.contains('hidden') &&
            !msgFeedWin.classList.contains('hud-panel-hidden') &&
            !msgFeedWin.classList.contains('window-minimized') &&
            msgFeedWin.style.display !== 'none' &&
            (typeof window === 'undefined' || !window.__messageLogClosed)
        );
        const p = frame.player || {};
        const isCriticalLowHp = Boolean(p.hp !== undefined && p.hp_max > 0 && (p.hp / p.hp_max) <= 0.25);
        const hasMoreText = /[-–—]more[-–—]|\[more\]/i.test(displayMsg);
        const suppressEcho = msgFeedVisible && !isPrompt && !hasMoreText && !isCriticalLowHp;
        banner.classList.toggle('banner-suppressed', suppressEcho);

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

    // # ROOT-CAUSE: Clear angband_map_size from localStorage when cycling preset sizes, use 0 height for hidden minimap bars in setCustomMinimapSize, and wire #minimap-hint-text click to cycleMinimapSize(1).
    cycleMinimapSize(delta = 1) {
        this.minimapSizeIndex = (this.minimapSizeIndex + delta + this.minimapSizes.length) % this.minimapSizes.length;
        try { localStorage.removeItem('angband_map_size'); } catch (_) {}
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
            const isNarrow = Boolean(this.minimapContainer && (this.minimapContainer.classList.contains('compact') || this.minimapContainer.classList.contains('minimap-narrow')));
            hintEl.textContent = isNarrow ? `[⛶] ${this.minimapZoom.toFixed(1)}x` : `[⛶] ${size.name} • ${this.minimapZoom.toFixed(1)}x`;
        }
    }

    setCustomMinimapSize(w, h) {
        if (!this.minimapCanvas) return;
        const validW = Math.max(180, Math.min(640, Math.round(w)));
        const validH = Math.max(180, Math.min(640, Math.round(h)));
        if (this.minimapContainer) {
            this.minimapContainer.classList.remove('compact', 'standard', 'expanded', 'tactical', 'command', 'minimap-size-compact');
            this.minimapContainer.classList.toggle('minimap-narrow', validW < 252);
            this.minimapContainer.style.width = `${validW}px`;
            this.minimapContainer.style.height = 'auto';
        }
        const ctrlBar = document.getElementById('minimap-controls-bar');
        const tiltBar = document.getElementById('camera-tilt-bar');
        const chromeH = (this.minimapHeader && this.minimapHeader.offsetParent !== null ? this.minimapHeader.offsetHeight : 24)
            + (ctrlBar && ctrlBar.offsetParent !== null ? ctrlBar.offsetHeight : 0)
            + (tiltBar && tiltBar.offsetParent !== null ? tiltBar.offsetHeight : 0);
        const canvasH = Math.max(116, validH - chromeH);
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
        // Minimap header is dedicated to window dragging/repositioning, while clicking #minimap-hint-text cycles preset size.
        if (this.minimapHeader) {
            this.minimapHeader.style.cursor = 'grab';
        }
        const hintEl = document.getElementById('minimap-hint-text');
        if (hintEl) {
            hintEl.style.cursor = 'pointer';
            hintEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cycleMinimapSize(1);
            });
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
            // # ROOT-CAUSE: Merge duplicate mousemove listeners on minimapCanvas into a single cell-coordinate-gated listener that updates #minimap-hover-pill without clobbering #minimap-hint-text, and wire #btn-map-tilt-toggle.
            this.minimapCanvas.addEventListener('mousemove', (e) => {
                if (!this.lastFrame || !this.lastFrame.map || !this.lastFrame.player) {
                    if (this._hoverMinimapPath) {
                        this._hoverMinimapPath = null;
                        this._lastHoverMx = null;
                        this._lastHoverMy = null;
                        this.updateMinimap(this.lastFrame);
                    }
                    return;
                }
                const rect = this.minimapCanvas.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
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

                const label = this.describeMinimapCell(mx, my);
                const pillEl = document.getElementById('minimap-hover-pill');
                if (pillEl) {
                    if (label) {
                        pillEl.textContent = `${label} • Click to Travel`;
                        pillEl.classList.remove('hidden');
                    } else {
                        pillEl.classList.add('hidden');
                    }
                }
                this.minimapCanvas.title = label ? `${label} (Click to Auto-Navigate)` : 'Minimap Radar (Click to Auto-Navigate)';

                const inp = (window.__app && window.__app.input) || null;
                if (!inp || (inp._autoNav && inp._autoNav.active)) {
                    if (this._hoverMinimapPath) {
                        this._hoverMinimapPath = null;
                        this.updateMinimap(this.lastFrame);
                    }
                    return;
                }
                if (typeof inp.computeMinimapPath === 'function') {
                    const newPath = inp.computeMinimapPath(this.lastFrame, this.lastFrame.player.x, this.lastFrame.player.y, mx, my);
                    this._hoverMinimapPath = (newPath && newPath.length > 0) ? newPath : null;
                    this.updateMinimap(this.lastFrame);
                }
            });

            this.minimapCanvas.addEventListener('mouseleave', () => {
                this._lastHoverMx = null;
                this._lastHoverMy = null;
                const pillEl = document.getElementById('minimap-hover-pill');
                if (pillEl) pillEl.classList.add('hidden');
                if (this._hoverMinimapPath) {
                    this._hoverMinimapPath = null;
                    if (this.lastFrame) {
                        this.updateMinimap(this.lastFrame);
                    }
                }
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
        }

        const btnTiltToggle = document.getElementById('btn-map-tilt-toggle');
        if (btnTiltToggle && this.minimapContainer) {
            btnTiltToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = this.minimapContainer.classList.toggle('tilt-drawer-open');
                btnTiltToggle.classList.toggle('active', open);
                btnTiltToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
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
                if (e.target && e.target.closest('button, a, input, .window-resize-handle')) return;
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
        bindPill(this.footerLevel, 'C', 'Click to open Character Sheet [C]');
        bindPill(this.footerGear, 'e', 'Click to inspect Equipped Gear [e]');
        bindPill(this.footerPlace, 'M', 'Click to open Full Level Map [M]');
    }

    /* -------------------------------------------------------------
     * Universal 60 FPS Moveable HUD & Cross-Platform Persistence (Wave 10 Track B)
     * ------------------------------------------------------------- */
    applyHudScale(scale) {
        const clamped = Math.max(0.85, Math.min(1.25, Number(scale) || 1));
        this._hudScale = clamped;
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.style.setProperty('--hud-scale', String(clamped));
        try {
            localStorage.setItem('yasd_hud_scale', String(clamped));
            localStorage.setItem('angband3d_hud_scale', String(clamped));
        } catch (_) {}
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (typeof window.__syncMsgDockBottom === 'function') window.__syncMsgDockBottom();
                if (typeof window.__clampFloatingWindows === 'function') window.__clampFloatingWindows();
            });
        }
        return clamped;
    }

    cycleImmersionMode() {
        const modes = ['full', 'minimal', 'cinematic'];
        const next = modes[(modes.indexOf(this._immersionMode || 'full') + 1) % modes.length];
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
        if (rawReticleCard) {
            rawReticleCard.style.display = 'none';
            rawReticleCard.classList.add('hidden');
        }
        const frame = frameOpt || this.lastFrame;
        const pl = player || (frame ? frame.player : null);
        const t = (pl && pl.target && pl.target.name) ? pl.target : ((frame && frame.target && frame.target.name) ? frame.target : null);
        this._currentTargetMonster = t || null;
        const hasTarget = !!(t && t.name);
        const isVisible = hasTarget && (t.visible !== false);
        const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

        if (hasTarget && isVisible && this.footerTarget) {
            let tName = t.name;
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && typeof window.getLocalizedMonsterName === 'function') tName = window.getLocalizedMonsterName(tName, 'hengband', lang);
            const pct = Math.max(0, Math.min(100, Math.round(t.hp_pct !== undefined ? t.hp_pct : (t.pct !== undefined ? t.pct : ((t.hp !== undefined && t.hp_max > 0) ? (t.hp / t.hp_max) * 100 : 100)))));
            this.footerTarget.style.display = 'inline-flex';
            this.footerTarget.style.maxWidth = '190px';
            this.footerTarget.style.overflow = 'hidden';
            this.footerTarget.style.textOverflow = 'ellipsis';
            this.footerTarget.style.whiteSpace = 'nowrap';
            const targetSig = `${realm}:${tName}:${t.glyph || ''}:${pct}:${rawReticleCard ? 1 : 0}`;
            if (this._lastFooterTargetSig !== targetSig) {
                this._lastFooterTargetSig = targetSig;
                let portraitHtml = '';
                if (!rawReticleCard && typeof window.getShockboltSpriteCss === 'function') {
                    const iconStyle = window.getShockboltSpriteCss('monster', t.name, t.glyph || null, 36);
                    if (iconStyle) portraitHtml = '<span class="sb-sprite-icon hud-target-portrait" style="' + iconStyle + '"></span> ';
                }
                this.footerTarget.innerHTML = (portraitHtml || '🎯 ') + esc(tName) + ' (' + pct + '%)';
            }
        } else if (this.footerTarget) {
            this.footerTarget.style.display = 'none';
            this._lastFooterTargetSig = '';
        }
    }

    updateMinimap(frame) {
        const eff = frame || this.lastFrame;
        if (!eff || !eff.map || !eff.player) return;
        this.renderMinimap(eff.map, eff.player, eff.monsters || [], this.currentCameraYaw);
    }

    showToast(msg) {
        if (!msg) return;
        if (typeof window !== 'undefined' && window.__app && typeof window.__app.showToast === 'function') window.__app.showToast(msg);
        else if (typeof window !== 'undefined' && window.__app && typeof window.__app.showRealmToast === 'function') window.__app.showRealmToast(msg);
        this.addMessage(msg, '#ffd166');
    }

    renderMinimap(map, player, monsters, continuousYaw) {
        if (!this.minimapCtx || !this.minimapCanvas || !map || !player) return;
        const ctx = this.minimapCtx, w = this.minimapCanvas.width, h = this.minimapCanvas.height;
        const yaw = continuousYaw !== undefined ? continuousYaw : this.currentCameraYaw;
        const cellSize = Math.max(4, Math.min(48, Math.round(12 * this.minimapZoom)));
        const cols = Math.floor(w / cellSize), lines = Math.floor(h / cellSize);
        const px = player.x, py = player.y;
        const drawPx = (typeof this.continuousX === 'number' && !isNaN(this.continuousX)) ? this.continuousX : px;
        const drawPy = (typeof this.continuousY === 'number' && !isNaN(this.continuousY)) ? this.continuousY : py;
        const ox = Math.max(0, Math.min(map.w - cols, Math.floor(drawPx) - Math.floor(cols / 2)));
        const oy = Math.max(0, Math.min(map.h - lines, Math.floor(drawPy) - Math.floor(lines / 2)));
        this._minimapOx = ox; this._minimapOy = oy; this._minimapCellSize = cellSize;
        const cx = (drawPx - ox) * cellSize + cellSize / 2, cy = (drawPy - oy) * cellSize + cellSize / 2;
        const dir = { x: Math.sin(yaw), y: -Math.cos(yaw) }, side = { x: -dir.y, y: dir.x };

        const isBlind = !!(player.blind || (player.statuses && player.statuses.some(s => /blind|盲目/i.test(s.name || s))));
        const d3dRef = window.__app?.dungeon || window.__app?.dungeon3d;
        const digestSeq = (this.lastFrame && this.lastFrame.seq) || 0;
        const digestBounds = `${ox},${oy},${cols},${lines},${map.w || 0}x${map.h || 0},${map.depth ?? ''}`;
        let visDigest = 2166136261 >>> 0;
        if (digestSeq && this._minimapDigestSeq === digestSeq && this._minimapDigestBounds === digestBounds && this._minimapDigestVal !== undefined) {
            visDigest = this._minimapDigestVal;
        } else {
            for (let rIdx = 0; rIdx < lines && (oy + rIdx) < map.h; rIdx++) {
                const rObj = map.rows[oy + rIdx];
                if (!rObj) continue;
                const gSlice = rObj.g ? rObj.g.slice(ox, ox + cols) : '';
                const lSlice = rObj.l ? rObj.l.slice(ox, ox + cols) : '';
                const aSlice = rObj.a ? rObj.a.slice(ox * 2, (ox + cols) * 2) : '';
                for (let k = 0; k < gSlice.length; k++) visDigest = Math.imul(visDigest ^ gSlice.charCodeAt(k), 16777619) >>> 0;
                for (let k = 0; k < lSlice.length; k++) visDigest = Math.imul(visDigest ^ lSlice.charCodeAt(k), 16777619) >>> 0;
                for (let k = 0; k < aSlice.length; k++) visDigest = Math.imul(visDigest ^ aSlice.charCodeAt(k), 16777619) >>> 0;
            }
            this._minimapDigestSeq = digestSeq;
            this._minimapDigestBounds = digestBounds;
            this._minimapDigestVal = visDigest;
        }
        const cacheKey = `${this.lastFrame?.realm || 'angband'}_${this.lastFrame?.player?.depth ?? 0}_${px}_${py}_${visDigest}_${ox}_${oy}_${this.minimapZoom}_${w}_${h}_${isBlind ? 1 : 0}`;
        const dimsChanged = this.minimapTileCanvas.width !== w || this.minimapTileCanvas.height !== h;
        if (cacheKey !== this.minimapTileCacheKey || dimsChanged) {
            if (dimsChanged) { this.minimapTileCanvas.width = w; this.minimapTileCanvas.height = h; }
            this.minimapTileCacheKey = cacheKey;
            const tCtx = this.minimapTileCtx;
            tCtx.fillStyle = '#060910'; tCtx.fillRect(0, 0, w, h);
            const darkenColor = (hex, factor = 0.45) => {
                if (!hex || hex[0] !== '#') return hex;
                const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor), g = Math.round(parseInt(hex.slice(3, 5), 16) * factor), b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
                return `rgba(${r}, ${g}, ${b}, 0.70)`;
            };
            if (cellSize > 6) {
                tCtx.font = `bold ${Math.max(8, Math.floor(cellSize * 1.02))}px monospace`;
                tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
            }
            // # ROOT-CAUSE: Restore classic ASCII terminal glyph rendering (# / . / + / landmarks) in renderMinimap so the minimap is always the authentic window into the classic view.
            for (let rowIdx = 0; rowIdx < lines && (oy + rowIdx) < map.h; rowIdx++) {
                const my = oy + rowIdx, row = map.rows[my];
                if (!row || !row.g) continue;
                for (let colIdx = 0; colIdx < cols && (ox + colIdx) < map.w; colIdx++) {
                    const mx = ox + colIdx;
                    if (mx >= row.g.length) continue;
                    const ch = row.g[mx];
                    const flag = (row.l && mx < row.l.length) ? (parseInt(row.l[mx], 16) || 0) : 0;
                    if (ch === ' ' || (flag & 0x3) === 0) {
                        const mem = d3dRef?.getRememberedTile?.(mx, my);
                        if (mem && mem.feat > 0) {
                            const mCh = (mem.glyph && mem.glyph !== ' ') ? mem.glyph : (mem.feat === 1 ? '.' : '#');
                            const sx = colIdx * cellSize, sy = rowIdx * cellSize;
                            tCtx.fillStyle = 'rgba(71, 85, 105, 0.22)';
                            if (cellSize <= 6) { tCtx.fillRect(sx, sy, cellSize, cellSize); }
                            else { tCtx.fillStyle = 'rgba(8, 10, 15, 0.65)'; tCtx.fillRect(sx, sy, cellSize, cellSize); tCtx.fillStyle = '#475569'; tCtx.fillText(mCh, sx + cellSize / 2, sy + cellSize / 2); }
                        }
                        continue;
                    }
                    const inView = (!isBlind && ((flag & 0x2) !== 0)) || (mx === px && my === py), sx = colIdx * cellSize, sy = rowIdx * cellSize;
                    const isFloor = ch === '.' || ch === ',' || ch === '\'';
                    tCtx.fillStyle = inView ? (isFloor ? 'rgba(36, 41, 56, 0.45)' : 'rgba(26, 30, 42, 0.35)') : 'rgba(8, 10, 15, 0.65)';
                    tCtx.fillRect(sx, sy, cellSize, cellSize);

                    const attrIdx = mx * 2;
                    const attrVal = (row.a && attrIdx + 1 < row.a.length) ? parseInt(row.a.substring(attrIdx, attrIdx + 2), 16) : 1;
                    let colour = window.getAngbandColorString ? window.getAngbandColorString(attrVal) : '#ffffff';
                    if (!inView) colour = darkenColor(colour, 0.45);
                    const isLandmark = ch === '<' || ch === '>' || ch === '0' || ch === '_' || ch === '{' || (ch >= '1' && ch <= '8');
                    if (isLandmark) {
                        const bCol = ch === '<' ? '#00f0ff' : (ch === '>' ? '#ffd700' : (ch === '0' ? '#ff8c00' : (ch === '_' ? '#ffe066' : (ch === '{' ? '#38bdf8' : '#fbbf24'))));
                        tCtx.fillStyle = '#05070c'; tCtx.fillRect(sx - 1, sy - 1, cellSize + 2, cellSize + 2);
                        tCtx.fillStyle = bCol;
                        if (cellSize <= 6) tCtx.fillRect(sx, sy, cellSize, cellSize);
                        else tCtx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2);
                    } else if (cellSize <= 6) {
                        tCtx.fillStyle = isFloor ? (inView ? 'rgba(148, 163, 184, 0.25)' : 'rgba(71, 85, 105, 0.18)') : colour;
                        tCtx.fillRect(sx, sy, cellSize, cellSize);
                    } else {
                        tCtx.fillStyle = colour;
                        tCtx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2);
                    }
                }
            }
        }

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.minimapTileCanvas, 0, 0);

        if (!isBlind) {
            const coneDist = Math.max(16, Math.min(85, cellSize * 4.4)), coneSpread = coneDist * 0.65;
            const leftTip = { x: cx + dir.x * coneDist + side.x * coneSpread, y: cy + dir.y * coneDist + side.y * coneSpread };
            const rightTip = { x: cx + dir.x * coneDist - side.x * coneSpread, y: cy + dir.y * coneDist - side.y * coneSpread };
            ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(leftTip.x, leftTip.y); ctx.lineTo(rightTip.x, rightTip.y); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(255, 220, 100, 0.50)'; ctx.lineWidth = 1.0;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(leftTip.x, leftTip.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rightTip.x, rightTip.y); ctx.stroke();
            const baseAngle = Math.atan2(dir.y, dir.x);
            ctx.beginPath(); ctx.arc(cx, cy, coneDist, baseAngle - 0.58, baseAngle + 0.58); ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, cellSize * 0.9), 0, Math.PI * 2); ctx.stroke();
        }

        const activeNav = (window.__app && window.__app.input && window.__app.input._autoNav && window.__app.input._autoNav.active) ? window.__app.input._autoNav : null;
        if (activeNav && Array.isArray(activeNav.path) && activeNav.path.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 215, 64, 0.88)';
            ctx.lineWidth = Math.max(1.5, cellSize * 0.22);
            ctx.setLineDash([Math.max(2, cellSize * 0.35), Math.max(2, cellSize * 0.25)]);
            ctx.beginPath(); ctx.moveTo(cx, cy);
            for (const step of activeNav.path) ctx.lineTo((step.x - ox + 0.5) * cellSize, (step.y - oy + 0.5) * cellSize);
            ctx.stroke(); ctx.setLineDash([]);
            const gx = (activeNav.goalX - ox + 0.5) * cellSize, gy = (activeNav.goalY - oy + 0.5) * cellSize, r = Math.max(3.5, cellSize * 0.45);
            ctx.fillStyle = '#ffe066';
            ctx.beginPath(); ctx.moveTo(gx, gy - r); ctx.lineTo(gx + r, gy); ctx.lineTo(gx, gy + r); ctx.lineTo(gx - r, gy); ctx.closePath(); ctx.fill();
            ctx.restore();
        } else if (!activeNav && this._hoverMinimapPath && this._hoverMinimapPath.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 215, 64, 0.55)';
            ctx.lineWidth = Math.max(1.5, cellSize * 0.22);
            ctx.setLineDash([Math.max(2, cellSize * 0.35), Math.max(2, cellSize * 0.25)]);
            ctx.beginPath(); ctx.moveTo(cx, cy);
            for (const step of this._hoverMinimapPath) ctx.lineTo((step.x - ox + 0.5) * cellSize, (step.y - oy + 0.5) * cellSize);
            ctx.stroke(); ctx.setLineDash([]);
            const lastStep = this._hoverMinimapPath[this._hoverMinimapPath.length - 1];
            const gx = (lastStep.x - ox + 0.5) * cellSize, gy = (lastStep.y - oy + 0.5) * cellSize, r = Math.max(3.5, cellSize * 0.45);
            ctx.fillStyle = 'rgba(255, 224, 102, 0.70)';
            ctx.beginPath(); ctx.moveTo(gx, gy - r); ctx.lineTo(gx + r, gy); ctx.lineTo(gx, gy + r); ctx.lineTo(gx - r, gy); ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        monsters.forEach(m => {
            const colIdx = m.x - ox, rowIdx = m.y - oy;
            if (colIdx >= 0 && colIdx < cols && rowIdx >= 0 && rowIdx < lines) {
                const sx = colIdx * cellSize, sy = rowIdx * cellSize;
                const isUniq = Boolean(m.unique || m.boss), isEspPip = Boolean(isBlind && (m.esp || ((player.flags?.esp || player.flags?.telepathy) && (Math.abs(m.x - px) > 1 || Math.abs(m.y - py) > 1))));
                ctx.fillStyle = isEspPip ? 'rgba(56, 189, 248, 0.55)' : (isUniq ? 'rgba(255, 215, 0, 0.65)' : 'rgba(230, 40, 40, 0.45)');
                ctx.fillRect(sx - (isUniq ? 1 : 0), sy - (isUniq ? 1 : 0), cellSize + (isUniq ? 2 : 0), cellSize + (isUniq ? 2 : 0));
                const mCol = isEspPip ? (isUniq ? '#e879f9' : '#38bdf8') : ((window.getAngbandColorString && m.attr !== undefined) ? window.getAngbandColorString(m.attr) : '#ff4444');
                ctx.fillStyle = mCol;
                if (cellSize <= 6) {
                    ctx.fillRect(sx + 1, sy + 1, Math.max(2, cellSize - 2), Math.max(2, cellSize - 2));
                } else {
                    ctx.font = `bold ${Math.max(8, Math.floor(cellSize * 1.02))}px monospace`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

    _getRealmCartridge() {
        if (typeof window !== 'undefined' && window.RealmCartridge) return window.RealmCartridge;
        if (typeof RealmCartridge !== 'undefined') return RealmCartridge;
        return null;
    }

    _getRealmSchemas(realm) {
        const r = String(realm || 'angband').trim().toLowerCase();
        const rc = this._getRealmCartridge();
        if (rc && typeof rc.getStatSchema === 'function') {
            const statSchema = rc.getStatSchema(r);
            return {
                rc,
                realm: r,
                statSchema: Array.from(statSchema),
                statFormat: statSchema.format || 'int',
                defenseSchema: rc.getDefenseSchema(r),
                resourceSchema: rc.getResourceSchema(r),
                progressionSchema: rc.getProgressionSchema(r),
                depthSchema: rc.getDepthSchema(r)
            };
        }
        const statMap = {
            angband: { keys: ['str', 'int', 'wis', 'dex', 'con'], fmt: 'disp' },
            silq: { keys: ['str', 'dex', 'con', 'gra'], fmt: 'signed' },
            dcss: { keys: ['str', 'int', 'dex'], fmt: 'int' },
            brogue: { keys: ['str'], fmt: 'int' },
            rogue: { keys: ['str'], fmt: 'cur/max' },
            frogcomposband: { keys: ['str', 'int', 'wis', 'dex', 'con', 'chr'], fmt: 'disp' },
            hengband: { keys: ['str', 'int', 'wis', 'dex', 'con', 'chr'], fmt: 'disp' },
            nethack: { keys: ['str', 'int', 'wis', 'dex', 'con', 'chr'], fmt: 'int' },
            ryod: { keys: ['str', 'int', 'wis', 'dex', 'con', 'chr'], fmt: 'int' }
        };
        const defMap = {
            rogue: { direction: 'descending', label: 'Arm', fields: ['arm', 'ac'] },
            nethack: { direction: 'descending', label: 'AC', fields: ['ac'] },
            silq: { direction: 'ascending', label: 'EVN / Prot', fields: ['evn', 'pr_min', 'pr_max'], formatBracket: true },
            dcss: { direction: 'ascending', label: 'AC | EV | SH', fields: ['ac', 'ev', 'sh'] },
            brogue: { direction: 'ascending', label: 'Armor', fields: ['ac'] }
        };
        const resMap = {
            rogue: { hasMana: false, secondaryLabel: 'Nutrition' },
            brogue: { hasMana: false, secondaryLabel: 'Nutrition', altLabel: 'Enchantment' },
            silq: { mpLabel: 'Voice', hasMana: true, dualSong: true },
            nethack: { mpLabel: 'MP', hasMana: true },
            dcss: { mpLabel: 'MP', hasMana: true },
            ryod: { mpLabel: 'MP', hasMana: true }
        };
        const progMap = {
            brogue: { hasLevels: false, hasXp: false },
            silq: { hasLevels: false, hasXp: true, xpLabel: 'XP' },
            dcss: { hasLevels: true, hasXp: true, levelLabel: 'XL', xpLabel: 'XP' }
        };
        const depthMap = {
            nethack: { unit: 'Dlvl', feetPerLevel: 0, prefix: 'Dlvl', style: 'dlvl' },
            dcss: { unit: ':', feetPerLevel: 0, defaultBranch: 'D', style: 'branch-colon' },
            rogue: { unit: 'Level', feetPerLevel: 0, prefix: 'Level', style: 'level' },
            brogue: { unit: 'Depth', feetPerLevel: 0, prefix: 'Depth', style: 'depth' },
            ryod: { unit: 'Branch', feetPerLevel: 0, defaultBranch: 'Branch', style: 'branch-space' },
            silq: { unit: 'ft', feetPerLevel: 50, townLabel: 'Gates of Angband', style: 'feet' },
            frogcomposband: { unit: 'ft', feetPerLevel: 50, townLabel: 'Outpost', style: 'feet' },
            hengband: { unit: 'ft', feetPerLevel: 50, townLabel: 'Outpost', style: 'feet' }
        };
        const st = statMap[r] || statMap.angband;
        return {
            rc: null,
            realm: r,
            statSchema: st.keys,
            statFormat: st.fmt,
            defenseSchema: defMap[r] || { direction: 'ascending', label: 'AC', fields: ['ac', 'ac_base', 'ac_to_a'] },
            resourceSchema: resMap[r] || { mpLabel: 'SP', hasMana: true },
            progressionSchema: progMap[r] || { hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' },
            depthSchema: depthMap[r] || { unit: 'ft', feetPerLevel: 50, townLabel: 'Town', style: 'feet' }
        };
    }

    _setElVisible(el, visible, displayVal = '') {
        if (!el || !el.style) return;
        if (visible) {
            if (typeof el.style.removeProperty === 'function') el.style.removeProperty('display');
            el.style.display = displayVal;
        } else if (typeof el.style.setProperty === 'function') {
            el.style.setProperty('display', 'none', 'important');
        } else {
            el.style.display = 'none';
        }
    }

    _formatRealmStat(player, statKey, realm, schemas) {
        if (!player) return '';
        const statsObj = (player.stats && typeof player.stats === 'object') ? player.stats : null;
        let entry = statsObj
            ? (statsObj[statKey] !== undefined ? statsObj[statKey] : (statKey === 'chr' ? statsObj.cha : undefined))
            : undefined;
        if (entry === undefined) {
            entry = player[statKey] !== undefined ? player[statKey] : (statKey === 'chr' ? player.cha : undefined);
        }
        if (entry === undefined || entry === null) return '';
        const fmt = schemas.statFormat || 'int';
        if (fmt === 'cur/max' && statKey === 'str' && player.str_max != null) {
            if (typeof entry !== 'object') entry = { cur: entry, max: player.str_max };
            else if (entry.max === undefined && entry.top === undefined) entry = { cur: entry.cur ?? entry.use, max: player.str_max };
        }
        if (schemas.rc && typeof schemas.rc.formatStatValue === 'function') {
            return schemas.rc.formatStatValue(entry, realm, statKey);
        }
        if (fmt === 'signed') {
            const raw = (typeof entry === 'object') ? (entry.disp ?? entry.use ?? entry.cur ?? entry.top ?? entry.max) : entry;
            if (raw === undefined || raw === null || raw === '') return '';
            const n = Number(raw);
            return Number.isFinite(n) ? (n > 0 ? `+${n}` : `${n}`) : String(raw);
        }
        if (fmt === 'cur/max') {
            if (typeof entry === 'string') return entry.includes('/') ? entry.trim() : `${entry.trim()}/${entry.trim()}`;
            if (typeof entry === 'object') {
                if (entry.disp != null && String(entry.disp).includes('/')) return String(entry.disp).trim();
                const cur = entry.cur ?? entry.use ?? entry.val ?? entry.top ?? entry.max;
                if (cur == null) return '';
                return `${cur}/${entry.max ?? entry.top ?? cur}`;
            }
            return `${entry}/${entry}`;
        }
        if (typeof entry === 'object') {
            if (entry.disp != null && String(entry.disp).trim() !== '') return String(entry.disp).trim();
            const val = entry.use ?? entry.cur ?? entry.top ?? entry.max ?? entry.val ?? entry.value;
            return val != null ? String(val) : '';
        }
        return String(entry);
    }

    _formatRealmDefense(player, realm, schemas) {
        if (schemas.rc && typeof schemas.rc.formatDefenseValue === 'function') {
            return schemas.rc.formatDefenseValue(player, realm);
        }
        const p = player || {};
        const r = schemas.realm || String(realm || 'angband').toLowerCase();
        if (schemas.defenseSchema.formatBracket || r === 'silq') {
            const evn = p.evn !== undefined ? Number(p.evn) : Number(p.ac || 0);
            return `[${evn >= 0 ? `+${evn}` : evn}, ${Number(p.pr_min || 0)}-${Number(p.pr_max || 0)}]`;
        }
        if (r === 'dcss') return `${p.ac !== undefined ? p.ac : 0} | ${p.ev !== undefined ? p.ev : 10} | ${p.sh !== undefined ? p.sh : 0}`;
        if (r === 'rogue') return `${p.arm !== undefined ? p.arm : (p.ac !== undefined ? p.ac : 10)}`;
        if (r === 'nethack') return `${p.ac !== undefined ? p.ac : 10}`;
        if (r === 'brogue') return `${p.ac !== undefined ? p.ac : 0}`;
        const acTotal = p.ac !== undefined ? p.ac : ((Number(p.ac_base || 0)) + (Number(p.ac_to_a || 0)));
        const acToA = Number(p.ac_to_a || 0);
        return acToA !== 0 ? `${acTotal} (${acToA > 0 ? '+' : ''}${acToA})` : `${acTotal}`;
    }

    _formatRealmDepth(depthOrPlayer, realm, schemas) {
        if (schemas.rc && typeof schemas.rc.formatDepth === 'function') {
            return schemas.rc.formatDepth(depthOrPlayer, realm);
        }
        const isObj = depthOrPlayer && typeof depthOrPlayer === 'object';
        const p = isObj ? depthOrPlayer : null;
        const ds = schemas.depthSchema || { unit: 'ft', feetPerLevel: 50, townLabel: 'Town', style: 'feet' };
        const rawD = isObj ? (p.depth !== undefined ? p.depth : p.max_depth) : depthOrPlayer;
        const depth = (rawD != null && Number.isFinite(Number(rawD))) ? Number(rawD) : (ds.style === 'feet' ? 0 : 1);
        if (ds.style === 'dlvl') return `${ds.prefix || 'Dlvl'} ${depth}`;
        if (ds.style === 'branch-colon') {
            let br = (p && (p.branch_name || p.branch)) || ds.defaultBranch || 'D';
            if (/^dungeon$/i.test(br)) br = 'D';
            return `${br}:${depth}`;
        }
        if (ds.style === 'level') return `${ds.prefix || 'Level'} ${depth}`;
        if (ds.style === 'depth') return `${ds.prefix || 'Depth'} ${depth}`;
        if (ds.style === 'branch-space') return `${(p && (p.branch_name || p.branch)) || ds.defaultBranch || 'Branch'} ${depth}`;
        if (depth === 0) return (p && p.wilderness) ? 'Wilderness' : (ds.townLabel || 'Town');
        return `${depth * (Number(ds.feetPerLevel) || 50)} ${ds.unit || 'ft'}`;
    }

    updateLanguageUI(realm, lang = 'en') {
        const isRunActive = Boolean(window.__app && window.__app.input && typeof window.__app.input.isRunningActive === 'function' ? window.__app.input.isRunningActive() : false);
        const langKey = `${realm || ''}|${lang}|${isRunActive}`;
        if (this._lastLanguageUIKey === langKey) {
            return;
        }
        this._lastLanguageUIKey = langKey;

        const isHeng = realm === 'hengband';
        const schemas = this._getRealmSchemas(realm);
        const qs = typeof document.querySelector === 'function' ? (sel) => document.querySelector(sel) : () => null;

        // 1. Primary Attributes & Combat Stats
        const statLabels = {
            str: { en: 'STR', bi: 'STR (腕力)', jp: '腕力' },
            int: { en: 'INT', bi: 'INT (知能)', jp: '知能' },
            wis: { en: 'WIS', bi: 'WIS (賢さ)', jp: '賢さ' },
            dex: { en: 'DEX', bi: 'DEX (器用)', jp: '器用' },
            con: { en: 'CON', bi: 'CON (耐久)', jp: '耐久' },
            chr: { en: 'CHR', bi: 'CHR (魅力)', jp: '魅力' },
            gra: { en: 'GRA', bi: 'GRA (威厳)', jp: '威厳' },
            ac:  { en: schemas.defenseSchema.label || 'AC', bi: 'AC (防御)', jp: '防御' },
            gold:{ en: 'GOLD',bi: 'AU (金貨)', jp: '金貨' },
        };
        for (const [key, trans] of Object.entries(statLabels)) {
            const el = qs(`#stat-item-${key} .stat-label`);
            if (el) {
                if (isHeng && lang === 'jp') el.textContent = trans.jp;
                else if (isHeng && lang === 'bilingual') el.textContent = trans.bi;
                else el.textContent = trans.en;
            }
        }

        // 2. Health & Mana/Voice Gauges
        const hpHeader = qs('.gauge-hp .gauge-header > span:first-child');
        const spHeader = qs('.gauge-sp .gauge-header > span:first-child') || this.spLabel;
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
            const defaultSp = realm === 'silq' ? 'VOICE' : (schemas.resourceSchema.mpLabel || 'MANA');
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
        const termRunText = qs('#term-run-toggle .term-run-text');
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
            { en: '1. YASD Autopsy & Tomb', bi: '1. YASD Autopsy & Tomb (墓碑)', jp: '1. 墓碑と記録' },
            { en: '2. Equipment', bi: '2. Equipment (装備)', jp: '2. 装備品' },
            { en: '3. Inventory', bi: '3. Inventory (持物)', jp: '3. 所持品' },
            { en: '4. Quiver', bi: '4. Quiver (矢筒)', jp: '4. 矢筒' },
            { en: '5. Stats & Crypt', bi: '5. Stats & Crypt (能力値)', jp: '5. 能力値' }
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
            else this.updateMinimapHeader();
        }

        // 8. D-Pad Turning Wings
        const dpadTurnLeft = qs('#dpad-turn-left .dpad-turn-text');
        const dpadTurnRight = qs('#dpad-turn-right .dpad-turn-text');
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

        const isPlayPhase = frame.phase === 'play';
        if (isPlayPhase && !this._wasPhasePlay) {
            const feedWin = this.messageFeedWindow || (typeof document !== 'undefined' && (this.messageFeedWindow = document.getElementById('message-feed-window')));
            if (feedWin && feedWin.classList) {
                const hasCustomSize = Boolean(feedWin.dataset && feedWin.dataset.customSize === '1');
                if (!hasCustomSize) {
                    feedWin.classList.remove('expanded');
                    if (feedWin.style) feedWin.style.height = '';
                    const btnToggleSize = typeof document !== 'undefined' ? document.getElementById('btn-msg-size-toggle') : null;
                    if (btnToggleSize) {
                        btnToggleSize.textContent = '▲ Expand';
                        btnToggleSize.title = 'Expand Message Log to show full history';
                    }
                }
                this.resetMessageFeedIdleTimer();
            }
        }
        this._wasPhasePlay = isPlayPhase;

        const player = frame.player || {};
        const ui = frame.ui || {};

        // Realm and Game System Differentiation
        const realm = (frame && frame.realm) || (window.__activeRealm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
        const schemas = this._getRealmSchemas(realm);
        const progSchema = schemas.progressionSchema;
        const resSchema = schemas.resourceSchema;
        const defSchema = schemas.defenseSchema;
        const statSchema = schemas.statSchema;
        const hasMana = resSchema.hasMana !== false && player.power_discipline !== 'none';
        const hasLevels = progSchema.hasLevels !== false;
        const hasXp = progSchema.hasXp !== undefined ? progSchema.hasXp !== false : hasLevels;

        const ht = (typeof window !== 'undefined' && window.HudTelemetry) ? window.HudTelemetry : null;
        if (ht) {
            ht.ingestFrameLore(frame, realm);
            ht.renderResistStrip(this._resistStripEl || (typeof document !== 'undefined' && (this._resistStripEl = document.getElementById('char-resist-strip'))), player, realm);
            ht.renderDungeonFeelingPill(this._feelingPillEl || (typeof document !== 'undefined' && (this._feelingPillEl = document.getElementById('hud-feeling-pill'))), player, realm, frame);
        }
        if (typeof window !== 'undefined' && window.YasdAutopsy) window.YasdAutopsy.recordFrame(frame, realm);
        const isSilQ = realm === 'silq' || (player.stats && player.stats.gra !== undefined);
        if (this._lastBodyRealm !== realm) {
            this._lastBodyRealm = realm;
            if (typeof document !== 'undefined' && document.body && document.body.dataset) {
                document.body.dataset.realm = realm;
            }
            const crestEl = document.getElementById('char-realm-crest');
            if (crestEl) {
                const crestIcons = { angband: '⚔', silq: '👑', frogcomposband: '◈', hengband: '⛩', nethack: '🏺', dcss: '🐙', brogue: '🔥', rogue: '🗝', ryod: '🩸' };
                const crestTitles = {
                    angband: 'Iron Crown of Morgoth (Angband 4.2.6)',
                    silq: 'Silmaril & Lay of Leithian (Sil-Q)',
                    frogcomposband: 'Courts of Chaos & Amber (FrogComposband)',
                    hengband: 'Scrolls of the Five Rings (Hengband)',
                    nethack: 'Amulet of Yendor (NetHack 3.6.7)',
                    dcss: 'Orb of Zot & Pantheon (DCSS)',
                    brogue: 'Lumenstones & Amulet (Brogue CE)',
                    rogue: 'Dungeons of Doom 1980 (Classic Rogue)',
                    ryod: 'Shattered Reliquary (Roll Your Own Death)'
                };
                crestEl.textContent = crestIcons[realm] || '⚔';
                crestEl.title = crestTitles[realm] || crestTitles.angband;
            }
        }
        this.updateHengbandLanguageUI(realm, window.__langMode || 'en');

        // Character Name, Race, Class / House
        const hasSubMeta = Boolean(this._charSubMetaEl || (typeof document !== 'undefined' && (this._charSubMetaEl = document.getElementById('char-sub-meta'))));
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
            const dispName = (typeof window !== 'undefined' && typeof window.formatDisplayHeroName === 'function') ? window.formatDisplayHeroName(player.name) : player.name;
            const fullTitle = isSilQ
                ? `${dispName} (${r}${house ? ` - ${house}` : (c && c !== r ? ` - ${c}` : '')})`
                : `${dispName} (${r} ${c})`;
            this.charTitle.textContent = hasSubMeta ? dispName : fullTitle;
            this.charTitle.title = fullTitle;
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
            const isHpHeal = this._lastHpPct !== undefined && hpPct >= this._lastHpPct;
            this._lastHpPct = hpPct;
            if (this.hpFill) {
                this.hpFill.style.width = `${hpPct}%`;
                if (typeof this.hpFill.style.setProperty === 'function') {
                    this.hpFill.style.setProperty('--vial-pct', `${hpPct}%`);
                    this.hpFill.style.setProperty('--vial-scale', (hpPct / 100).toFixed(4));
                }
                if (this.hpFill.classList) {
                    this.hpFill.classList.toggle('hp-caution', hpPct <= 50 && hpPct > 25);
                    this.hpFill.classList.toggle('hp-critical', hpPct <= 25);
                }
            }
            if (this.hpGhostFill) {
                if (this.hpGhostFill.classList) this.hpGhostFill.classList.toggle('is-healing', isHpHeal);
                this.hpGhostFill.style.transitionDelay = isHpHeal ? '0s' : '';
                this.hpGhostFill.style.width = `${hpPct}%`;
                if (typeof this.hpGhostFill.style.setProperty === 'function') {
                    this.hpGhostFill.style.setProperty('--vial-pct', `${hpPct}%`);
                    this.hpGhostFill.style.setProperty('--vial-scale', (hpPct / 100).toFixed(4));
                }
            }
            // # ROOT-CAUSE: Toggle .low-hp-warning on #char-panel when HP <= 30% and populate #char-status-effects with color-coded status/hunger pills.
            const charPanelEl = this._charPanelEl || (typeof document !== 'undefined' && (this._charPanelEl = document.getElementById('char-panel')));
            if (charPanelEl && charPanelEl.classList) {
                charPanelEl.classList.toggle('low-hp-warning', curHp > 0 && hpPct <= 30);
            }
            this.hpText.textContent = `${curHp} / ${maxHp}`;
        }

        const statusStripEl = this._charStatusEffectsEl || (typeof document !== 'undefined' && (this._charStatusEffectsEl = document.getElementById('char-status-effects')));
        if (statusStripEl) {
            const rawStatuses = Array.isArray(player.statuses) ? player.statuses : [];
            const pillSig = `${rawStatuses.map(s => (s && s.name) || s || '').join('|')}:${player.study || 0}:${player.word_recall || 0}:${player.stealth_mode ? 1 : 0}`;
            if (this._lastCharStatusPillSig !== pillSig) {
                this._lastCharStatusPillSig = pillSig;
                statusStripEl.textContent = '';
                const pills = [];
                for (let i = 0; i < rawStatuses.length; i++) {
                    const nm = String((rawStatuses[i] && rawStatuses[i].name) || rawStatuses[i] || '').trim();
                    if (!nm) continue;
                    let cls = 'pill-info';
                    if (/poison|cut|bleed|blind|paraly|confus|stun|starv|faint|halluc|wound|knock/i.test(nm)) cls = 'pill-danger';
                    else if (/\bgorged\b|hungr|weak|afraid|fear|slow|tired|burden|strained/i.test(nm)) cls = 'pill-warn';
                    else if (/\b(fed|sated|full)\b|fast|haste|bless|hero|berserk|shield|protec|invuln|regen/i.test(nm)) cls = 'pill-buff';
                    pills.push({ text: nm, cls });
                }
                if (player.study > 0 && !pills.some(p => /^study/i.test(p.text))) {
                    pills.push({ text: `Study (${player.study})`, cls: 'pill-info' });
                }
                if (player.word_recall > 0 && !pills.some(p => /^recall/i.test(p.text))) {
                    pills.push({ text: `Recall (${player.word_recall}t)`, cls: 'pill-warn' });
                }
                if (pills.length === 0) {
                    statusStripEl.classList.add('hidden');
                } else {
                    statusStripEl.classList.remove('hidden');
                    for (let i = 0; i < pills.length; i++) {
                        const sp = document.createElement('span');
                        sp.className = `char-status-pill ${pills[i].cls}`;
                        sp.textContent = pills[i].text;
                        statusStripEl.appendChild(sp);
                    }
                }
            }
        }

        // SP / MP / Voice Bar (hidden when RealmCartridge resourceSchema.hasMana === false, e.g. Rogue & Brogue)
        const spCont = this.spContainer || (typeof document !== 'undefined' && typeof document.querySelector === 'function' && (this.spContainer = document.querySelector('.gauge-sp')));
        this._setElVisible(spCont, hasMana, 'block');
        const curSp = player.sp !== undefined ? player.sp : (player.csp !== undefined ? player.csp : 0);
        const maxSp = player.sp_max !== undefined ? player.sp_max : (player.max_sp !== undefined ? player.max_sp : (player.msp !== undefined ? player.msp : 0));
        if (hasMana) {
            const spSig = `${curSp}/${maxSp}:${realm}:${window.__langMode || 'en'}:${isSilQ}:${player.resource_label || ''}`;
            if (this._lastSpSig !== spSig) {
                this._lastSpSig = spSig;
                if (this.spLabel) {
                    const lang = window.__langMode || 'en';
                    if (realm === 'hengband' && lang === 'jp') {
                        this.spLabel.textContent = '魔力';
                    } else if (realm === 'hengband' && lang === 'bilingual') {
                        this.spLabel.textContent = 'MANA (魔力)';
                    } else {
                        const customRes = (player.resource_label && player.resource_label !== 'MANA') ? player.resource_label : '';
                        this.spLabel.textContent = customRes || (isSilQ ? 'VOICE' : (resSchema.mpLabel || 'MANA'));
                    }
                }
                const spPct = maxSp > 0 ? Math.max(0, Math.min(100, (curSp / maxSp) * 100)) : 0;
                const isSpHeal = this._lastSpPct !== undefined && spPct >= this._lastSpPct;
                this._lastSpPct = spPct;
                if (this.spFill) {
                    this.spFill.style.width = `${spPct}%`;
                    if (typeof this.spFill.style.setProperty === 'function') {
                        this.spFill.style.setProperty('--vial-pct', `${spPct}%`);
                        this.spFill.style.setProperty('--vial-scale', (spPct / 100).toFixed(4));
                    }
                }
                if (this.spGhostFill) {
                    if (this.spGhostFill.classList) this.spGhostFill.classList.toggle('is-healing', isSpHeal);
                    this.spGhostFill.style.transitionDelay = isSpHeal ? '0s' : '';
                    this.spGhostFill.style.width = `${spPct}%`;
                    if (typeof this.spGhostFill.style.setProperty === 'function') {
                        this.spGhostFill.style.setProperty('--vial-pct', `${spPct}%`);
                        this.spGhostFill.style.setProperty('--vial-scale', (spPct / 100).toFixed(4));
                    }
                }
                if (this.spText) this.spText.textContent = `${curSp} / ${maxSp}`;
            }
        }

        // Left Panel Stats (driven strictly by RealmCartridge statSchema)
        const statItemsMap = {
            str: this.itemStr || (typeof document !== 'undefined' && (this.itemStr = document.getElementById('stat-item-str'))),
            int: this.itemInt,
            wis: this.itemWis,
            dex: this.itemDex || (typeof document !== 'undefined' && (this.itemDex = document.getElementById('stat-item-dex'))),
            con: this.itemCon || (typeof document !== 'undefined' && (this.itemCon = document.getElementById('stat-item-con'))),
            chr: this.itemChr,
            gra: this.itemGra
        };
        const statValMap = {
            str: this.statStr, int: this.statInt, wis: this.statWis,
            dex: this.statDex, con: this.statCon, chr: this.statChr, gra: this.statGra
        };
        for (const sk of ['str', 'int', 'wis', 'dex', 'con', 'chr', 'gra']) {
            const visible = statSchema.includes(sk);
            this._setElVisible(statItemsMap[sk], visible, 'flex');
            if (visible && statValMap[sk]) {
                const formatted = this._formatRealmStat(player, sk, realm, schemas);
                if (formatted !== '') statValMap[sk].textContent = formatted;
            }
        }
        const hasGold = (realm !== 'silq') && (!schemas || !schemas.resourceSchema || schemas.resourceSchema.hasGold !== false);
        this._setElVisible(this.itemGold, hasGold, 'flex');
        const acItemLayout = this.itemAc || (typeof document !== 'undefined' && (this.itemAc = document.getElementById('stat-item-ac')));
        if (acItemLayout && acItemLayout.style && typeof acItemLayout.style.setProperty === 'function') {
            if (hasGold) acItemLayout.style.removeProperty('grid-column');
            else acItemLayout.style.setProperty('grid-column', '1 / -1', 'important');
        }

        // Depth & Wilderness (driven by RealmCartridge depthSchema / formatDepth)
        const depth = player.depth !== undefined ? player.depth : 0;
        let isWild = Boolean(player.wilderness || frame.is_wild_mode);
        if (!isWild && depth === 0 && frame.map && frame.map.rows) {
            const feat = this.getFeatAt(frame.map, player.x || 0, player.y || 0);
            if (feat >= 25 && feat <= 31) isWild = true;
        }
        let locStr = this._formatRealmDepth({ depth, max_depth: player.max_depth, branch: player.branch, branch_name: player.branch_name, wilderness: isWild }, realm, schemas);
        if (realm === 'hengband') {
            const lang = window.__langMode || 'en';
            if (lang === 'jp') {
                if (locStr === 'Town' || locStr === 'Outpost') locStr = '街 (宿場町)';
                else if (locStr === 'Wilderness') locStr = '荒野';
            } else if (lang === 'bilingual') {
                if (locStr === 'Town' || locStr === 'Outpost') locStr = 'Town (街)';
                else if (locStr === 'Wilderness') locStr = 'Wilderness (荒野)';
            }
        }
        if (this.depthVal) this.depthVal.textContent = locStr;

        // Sub-meta: Level, Race, Class, Deity & Depth
        const depthLabel = String(locStr || '').replace(/ (?=\d+|ft\b)/g, '\u00A0');
        const charSubMetaEl = this._charSubMetaEl || (this._charSubMetaEl = document.getElementById('char-sub-meta'));
        if (charSubMetaEl) {
            const pLev = player.lev !== undefined ? player.lev : (player.level !== undefined ? player.level : 1);
            const hasCharLevels = hasLevels && Number(pLev) > 0;
            let pRace = player.race || '';
            let pClass = player.class || player.cls || '';
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && (pRace || pClass)) {
                const jpToEn = window.__JP_TERM_TRANSLATIONS || {};
                const enToJp = window.__EN_TO_JP_TRANSLATIONS || {};
                const ht = window.HengTranslate;
                const txTerm = (val) => {
                    if (!val) return '';
                    if (lang === 'jp') return enToJp[val] || val;
                    const en = jpToEn[val] || ((ht && typeof ht.translateName === 'function') ? ht.translateName(val, 1, 'en') : val);
                    if (lang === 'bilingual' && en && en !== val) {
                        return jpToEn[val] ? `${en} (${val})` : (enToJp[val] ? `${val} (${enToJp[val]})` : val);
                    }
                    return en || val;
                };
                pRace = txTerm(pRace);
                pClass = txTerm(pClass);
            }
            const godSuffix = player.god && player.god !== 'No God' ? ` • ⛩ ${player.god}` : '';
            const levPrefix = hasCharLevels ? `${progSchema.levelLabel === 'XL' ? 'XL ' : 'Lv.'}${pLev} ` : '';
            const subMetaStr = `${levPrefix}${pRace}${pClass ? ` ${pClass}` : ''} • ${depthLabel}${godSuffix}`;
            const subMetaSig = `${lang}:${subMetaStr}`;
            if (this._lastCharSubMeta !== subMetaSig) {
                this._lastCharSubMeta = subMetaSig;
                charSubMetaEl.textContent = subMetaStr;
            }
        }
        const goldAcSig = `${realm}:${window.__langMode || 'en'}:${player.gold || 0}:${player.ac ?? ''}:${player.arm ?? ''}:${player.ac_to_a || 0}:${player.ac_base || 0}:${player.evn ?? ''}:${player.pr_min ?? ''}:${player.pr_max ?? ''}:${player.ev ?? ''}:${player.sh ?? ''}`;
        if (this._lastGoldAcSig !== goldAcSig) {
            this._lastGoldAcSig = goldAcSig;
            if (this.goldVal) {
                this.goldVal.textContent = (player.gold || 0).toLocaleString();
                this.goldVal.title = `Gold: ${(player.gold || 0).toLocaleString()} AU`;
            }
            const acItem = this.itemAc || (typeof document !== 'undefined' && (this.itemAc = document.getElementById('stat-item-ac')));
            const acLbl = acItem && typeof acItem.querySelector === 'function' ? acItem.querySelector('.stat-label') : null;
            if (acLbl && !(realm === 'hengband' && (window.__langMode || 'en') !== 'en')) {
                acLbl.textContent = defSchema.label || 'AC';
            }
            if (this.acVal) {
                const acDisplay = this._formatRealmDefense(player, realm, schemas);
                this.acVal.textContent = acDisplay;
                const acTotal = player.ac !== undefined ? player.ac : 0;
                const acToA = player.ac_to_a || 0;
                if (isSilQ) this.acVal.title = `Evasion & Protection: ${acDisplay}`;
                else if (realm === 'dcss') this.acVal.title = `AC | EV | SH: ${acDisplay}`;
                else if (defSchema.direction === 'descending') this.acVal.title = `${defSchema.label} (Descending — lower is better): ${acDisplay}`;
                else if (realm === 'brogue') this.acVal.title = `Armor (Ascending): ${acDisplay}`;
                else this.acVal.title = `Armor Class: ${acTotal} (Base: ${player.ac_base || 0}, Bonus: ${acToA >= 0 ? '+' : ''}${acToA})`;
            }
        }
        const yaw = (window.__app && window.__app.dungeon) ? -window.__app.dungeon.yaw : (this.currentCameraYaw || 0);
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const sectorNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const sectorArrows = ['▲', '↗', '►', '↘', '▼', '↙', '◄', '↖'];
        const arrowChar = sectorArrows[sector] || '▲';
        const facingName = sectorNames[sector] || 'N';

        if (typeof this.updateFooterFacing === 'function') this.updateFooterFacing(yaw);

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
            const yaw = (window.__app && window.__app.dungeon) ? -window.__app.dungeon.yaw : (this.currentCameraYaw || 0);
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
                const downLbl = this._formatRealmDepth({ depth: depth + 1, branch: player.branch, branch_name: player.branch_name }, realm, schemas);
                stairsText = `[>] Down to ${downLbl}`;
            } else if (currentFeat === 5) {
                const upLbl = this._formatRealmDepth({ depth: Math.max(0, depth - 1), branch: player.branch, branch_name: player.branch_name }, realm, schemas);
                stairsText = `[<] Up to ${upLbl}`;
            }
            if (this.footerStairsHint) {
                this.footerStairsHint.textContent = stairsText;
                this.footerStairsHint.style.display = stairsText ? 'inline-flex' : 'none';
            }
        }

        // Contextual Action Button Pulses (Potion on Low HP, Door button on closed door)
        this.updateContextPulses(frame);

        // Detailed 3-Row Telemetry Footer / Streamlined Status Bar
        const footerCharPanelEl = this._charPanelEl || (typeof document !== 'undefined' && (this._charPanelEl = document.getElementById('char-panel')));
        const charPanelVisible = Boolean(
            footerCharPanelEl &&
            (!footerCharPanelEl.classList || (
                !footerCharPanelEl.classList.contains('hidden') &&
                !footerCharPanelEl.classList.contains('hud-panel-hidden') &&
                !footerCharPanelEl.classList.contains('window-minimized')
            )) &&
            (!footerCharPanelEl.style || footerCharPanelEl.style.display !== 'none')
        );
        if (this.footerLevel) {
            if (!hasLevels || charPanelVisible) {
                this._setElVisible(this.footerLevel, false);
            } else {
                this._setElVisible(this.footerLevel, true, 'inline');
                const plLevel = player.level !== undefined ? player.level : (player.lev !== undefined ? player.lev : 1);
                const lang = window.__langMode || 'en';
                if (realm === 'hengband' && lang === 'jp') {
                    this.footerLevel.textContent = `⭐ レベル ${plLevel}`;
                } else if (realm === 'hengband' && lang === 'bilingual') {
                    this.footerLevel.textContent = `⭐ Lvl (Lv) ${plLevel}`;
                } else if (progSchema.levelLabel === 'XL') {
                    this.footerLevel.textContent = `⭐ XL ${plLevel}`;
                } else {
                    this.footerLevel.textContent = `⭐ Lvl ${plLevel}`;
                }
            }
        }
        if (this.footerHp) {
            this.footerHp.textContent = `HP ${curHp}/${maxHp}`;
            const hpRatio = curHp / Math.max(1, maxHp);
            this.footerHp.style.color = hpRatio > 0.6 ? '#62e062' : (hpRatio > 0.25 ? '#ffd700' : '#ff4444');
        }
        if (this.footerSp) {
            if (hasMana && maxSp > 0) {
                this._setElVisible(this.footerSp, true, 'inline');
                this.footerSp.textContent = `${isSilQ ? 'VOICE' : (resSchema.mpLabel || 'SP')} ${curSp}/${maxSp}`;
            } else {
                this._setElVisible(this.footerSp, false);
            }
        }
        if (this.footerAc) {
            const acDisp = this._formatRealmDefense(player, realm, schemas);
            if (defSchema.formatBracket || isSilQ || player.evn !== undefined) {
                this.footerAc.textContent = acDisp;
            } else if (realm === 'dcss') {
                this.footerAc.textContent = `AC|EV|SH ${acDisp}`;
            } else {
                this.footerAc.textContent = `${defSchema.label || 'AC'} ${acDisp}`;
            }
        }
        if (this.footerGold) {
            if (isSilQ) {
                this._setElVisible(this.footerGold, false);
            } else {
                this._setElVisible(this.footerGold, true, 'inline');
                this.footerGold.textContent = `AU ${(player.gold || 0).toLocaleString()}`;
            }
        }
        if (this.footerExp) {
            if (charPanelVisible || (!hasLevels && !hasXp)) {
                this._setElVisible(this.footerExp, false);
            } else {
                this._setElVisible(this.footerExp, true, '');
                if (!hasLevels && hasXp) {
                    const unspent = Number(player.new_exp !== undefined ? player.new_exp : (player.exp || 0));
                    const total = Number(player.exp_max !== undefined ? player.exp_max : unspent);
                    const xpLbl = progSchema.xpLabel || 'XP';
                    this.footerExp.textContent = total > unspent
                        ? `✨ ${xpLbl} ${unspent.toLocaleString()} (${total.toLocaleString()} total)`
                        : `✨ ${xpLbl} ${unspent.toLocaleString()}`;
                } else {
                    const expNext = player.exp_next;
                    const expVal = (player.exp !== undefined) ? player.exp.toLocaleString() : '0';
                    const plLev = Number(player.level !== undefined ? player.level : (player.lev !== undefined ? player.lev : 1));
                    const nextStr = (expNext !== undefined && expNext > 0)
                        ? `/${expNext.toLocaleString()}`
                        : ((expNext === 0 && plLev >= 20) ? ' (MAX)' : '');
                    const lang = window.__langMode || 'en';
                    if (realm === 'hengband' && lang === 'jp') {
                        this.footerExp.textContent = `✨ 経験値 ${expVal}${nextStr}`;
                    } else if (realm === 'hengband' && lang === 'bilingual') {
                        this.footerExp.textContent = `✨ EXP (経験値) ${expVal}${nextStr}`;
                    } else {
                        this.footerExp.textContent = `✨ ${progSchema.xpLabel || 'EXP'} ${expVal}${nextStr}`;
                    }
                }
            }
        }
        const expCont = this.expContainer || (typeof document !== 'undefined' && typeof document.querySelector === 'function' && (this.expContainer = document.querySelector('.gauge-exp')));
        this._setElVisible(expCont, hasLevels || hasXp, 'block');
        const expFillEl = this._expFillEl || (typeof document !== 'undefined' && (this._expFillEl = document.getElementById('exp-fill')));
        const expTextEl = this._expTextEl || (typeof document !== 'undefined' && (this._expTextEl = document.getElementById('exp-text')));
        const expLabelEl = this._expLabelEl || (typeof document !== 'undefined' && (this._expLabelEl = document.getElementById('exp-label')));
        if ((hasLevels || hasXp) && expFillEl && expTextEl) {
            const plLev = Number(player.level !== undefined ? player.level : (player.lev !== undefined ? player.lev : 1));
            const curExpNum = Number(player.exp !== undefined ? player.exp : (player.new_exp || 0));
            const nextExpNum = Number(player.exp_next !== undefined ? player.exp_next : (player.exp_max || 0));
            let expPct = 100;
            if (!hasLevels && hasXp) {
                const total = Number(player.exp_max !== undefined ? player.exp_max : curExpNum);
                expPct = total > 0 ? Math.max(8, Math.min(100, (curExpNum / total) * 100)) : Math.min(100, Math.max(14, (curExpNum % 1000) * 0.1));
                if (expLabelEl) expLabelEl.textContent = progSchema.xpLabel || 'XP';
                expTextEl.textContent = total > curExpNum ? `${curExpNum.toLocaleString()} / ${total.toLocaleString()}` : `${curExpNum.toLocaleString()} XP`;
            } else if (nextExpNum > 0) {
                expPct = Math.max(8, Math.min(100, (curExpNum / Math.max(1, nextExpNum)) * 100));
                if (expLabelEl) expLabelEl.textContent = progSchema.levelLabel === 'XL' ? `XL ${plLev}` : (progSchema.xpLabel || 'EXP');
                expTextEl.textContent = `${curExpNum.toLocaleString()} / ${nextExpNum.toLocaleString()}`;
            } else {
                expPct = plLev >= 20 ? 100 : Math.min(100, Math.max(14, (curExpNum % 1000) * 0.1));
                if (expLabelEl) expLabelEl.textContent = `${progSchema.levelLabel || 'LV'}.${plLev}`;
                expTextEl.textContent = `${curExpNum.toLocaleString()} XP`;
            }
            expFillEl.style.width = `${expPct}%`;
            if (typeof expFillEl.style.setProperty === 'function') {
                expFillEl.style.setProperty('--vial-pct', `${expPct}%`);
                expFillEl.style.setProperty('--vial-scale', (expPct / 100).toFixed(4));
            }
        }
        if (this.footerPlace) {
            const lang = window.__langMode || 'en';
            if (realm === 'hengband' && lang === 'jp') {
                this.footerPlace.textContent = (locStr.includes('荒野') || locStr === 'Wilderness')
                    ? '荒野'
                    : (depth === 0 ? '街 (宿場町)' : `地下${depth}階 (${depth * 50}ft)`);
            } else if (realm === 'hengband' && lang === 'bilingual') {
                this.footerPlace.textContent = (locStr.includes('荒野') || locStr === 'Wilderness')
                    ? 'Wilderness (荒野)'
                    : (depth === 0 ? 'Town (街)' : `DL ${depth} (${depth * 50}ft - 地下${depth}階)`);
            } else {
                this.footerPlace.textContent = locStr;
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
            const lightRadius = player.cur_light !== undefined ? player.cur_light : (player.light !== undefined ? player.light : 0);
            let lightItemName = (player.light_item && typeof player.light_item === 'object') ? String(player.light_item.name || player.light_item.desc || '') : String(player.light_item || '');
            let lightFuel = typeof player.light_fuel === 'number' ? player.light_fuel : 0;
            if (!lightItemName && Array.isArray(player.equipment)) {
                const eqLight = player.equipment.find(it => it && (it.slot === 'light' || it.tval === 39 || it.tval === 40 || /\b(torch|lantern|lamp|phial|star of|aril|feanor)\b/i.test(String(it.name || it.desc || ''))));
                if (eqLight) {
                    lightItemName = String(eqLight.name || eqLight.desc || '');
                }
            }
            if (!lightFuel && lightItemName) {
                const fm = lightItemName.match(/\((\d+)\s*turns?\s*(?:of\s*light)?\)/i);
                if (fm) lightFuel = parseInt(fm[1], 10) || 0;
            }
            const cleanLightName = lightItemName ? lightItemName.replace(/\s*\(\d+\s*turns?[^)]*\)/i, '').trim() : 'None';
            const hasLightItem = Boolean(lightItemName && lightItemName !== 'None');
            const isLowFuel = hasLightItem && lightFuel > 0 && lightFuel <= 500;
            const lang = window.__langMode || 'en';
            const fuelIcon = isLowFuel ? '⚠️ ' : '🔥 ';
            let lightStr = depth === 0
                ? (hasLightItem ? `☀️ ${cleanLightName}${lightFuel > 0 ? ` (${lightFuel}t)` : ''}` : '☀️ Daylight')
                : (hasLightItem ? `${fuelIcon}${cleanLightName} (${lightFuel > 0 ? `${lightFuel}t` : `R:${lightRadius}`})` : (lightRadius > 0 ? `🔥 Light ${lightRadius}` : '🌑 Dark'));
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
            this.footerLight.style.color = isLowFuel ? '#fbbf24' : '';
        }
        if (this.footerFacing) {
            if (typeof this.updateFooterFacing === 'function') this.updateFooterFacing(yaw);
        }

        // Target tracking
        if (this.footerTarget || this.reticleTargetCard || document.getElementById('reticle-target-card')) {
            this.updateTargetInspector(player, realm);
        }

        // Status badges (suppress duplicated statuses when #char-panel is visible)
        if (this.footerBadges) {
            const lang = window.__langMode || 'en';
            const statusesKey = (player.statuses && Array.isArray(player.statuses))
                ? player.statuses.map(st => `${st.name || ''}:${st.attr !== undefined ? st.attr : ''}`).join(',')
                : '';
            const song1Badge = player.song_name || (player.song && Number(player.song) !== 100 ? String(player.song) : '');
            const song2Badge = (player.song2 != null && Number(player.song2) !== 0 && Number(player.song2) !== 100 && player.song2_name) ? String(player.song2_name) : '';
            const badgesKey = `${realm}:${lang}:${charPanelVisible ? 1 : 0}:${statusesKey}:${player.study || 0}:${player.resting || 0}:${player.word_recall || 0}:${song1Badge}:${player.song2 || 0}:${song2Badge}:${player.stealth_mode ? 1 : 0}`;
            if (this._lastBadgesKey !== badgesKey) {
                this._lastBadgesKey = badgesKey;
                const desiredBadges = [];
                if (!charPanelVisible && player.statuses && Array.isArray(player.statuses) && player.statuses.length > 0) {
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
                if (!charPanelVisible && player.study && player.study > 0 && !hasStatusMatching(/^study/i)) {
                    desiredBadges.push({ cls: 'footer-badge badge-study', text: `[STUDY: ${player.study}]`, color: '' });
                }

                if (player.resting && player.resting !== 0 && !hasStatusMatching(/^rest/i)) {
                    desiredBadges.push({ cls: 'footer-badge badge-resting', text: `[RESTING${player.resting > 0 ? `: ${player.resting}` : ''}]`, color: '' });
                }

                if (!charPanelVisible && player.word_recall && player.word_recall > 0 && !hasStatusMatching(/^recall/i)) {
                    desiredBadges.push({ cls: 'footer-badge badge-recall', text: `[RECALL: ${player.word_recall}t]`, color: '' });
                }

                if (!charPanelVisible && (song1Badge || song2Badge)) {
                    const sText = song1Badge && song2Badge ? `${song1Badge} + ${song2Badge}` : (song1Badge || song2Badge);
                    desiredBadges.push({ cls: 'footer-badge badge-song', text: `[SONG: ${sText}]`, color: '#70c0ff' });
                }

                if (!charPanelVisible && player.stealth_mode) {
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
            let rawWeap = _hudItemStr(player.weapon_item);
            let rawBow = _hudItemStr(player.bow_item);
            if (/\b(torch|lantern|lamp|phial|star of|aril|feanor)\b/i.test(rawBow)) rawBow = '';
            let rawShield = _hudItemStr(player.shield_item);
            if (Array.isArray(player.equipment)) {
                for (const eqIt of player.equipment) {
                    if (!eqIt) continue;
                    const eqSlot = String(eqIt.slot_name || eqIt.slot || '').toLowerCase();
                    const eqName = _hudItemStr(eqIt);
                    if (!eqName || /^(nothing|none|\(nothing\)|\(none\)|empty)$/i.test(eqName.trim())) continue;
                    if (/\b(torch|lantern|lamp|phial|star of|aril|feanor)\b/i.test(eqName)) continue;
                    if (!rawWeap && (eqSlot === 'weapon' || eqSlot === 'wield' || eqIt.slot === 0)) rawWeap = eqName;
                    else if (!rawBow && (eqSlot === 'bow' || eqSlot === 'shooting' || eqSlot === 'launcher' || eqIt.tval === 19 || /\b(bow|crossbow|sling)\b/i.test(eqName))) rawBow = eqName;
                    else if (!rawShield && (eqSlot === 'shield' || eqSlot === 'arm' || eqSlot === 'offhand' || eqIt.slot === 2 || /\b(shield|buckler|targe)\b/i.test(eqName))) rawShield = eqName;
                }
            }
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
                const gridEl = typeof drawerEl.querySelector === 'function' ? drawerEl.querySelector('.char-ext-grid') : null;
                const existingItems = gridEl && typeof gridEl.querySelectorAll === 'function' ? Array.from(gridEl.querySelectorAll('.char-ext-item')) : [];
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
            const maxD = this._formatRealmDepth({ depth: player.max_depth !== undefined ? player.max_depth : depth, branch: player.branch, branch_name: player.branch_name, wilderness: isWild }, realm, schemas);
            if (isSilQ) {
                const getSilqSkill = (sk, abbr) => {
                    if (player.skills) {
                        if (abbr && player.skills[abbr] !== undefined) return String(player.skills[abbr]);
                        if (player.skills[sk.toLowerCase()] !== undefined) return String(player.skills[sk.toLowerCase()]);
                        if (player.skills[sk] !== undefined) return String(player.skills[sk]);
                    }
                    if (frame.term && frame.term.lines) {
                        const text = frame.term.lines.join('\n');
                        const re = new RegExp(sk + '(?:\\s*:\\s*|\\s+)([+-]?[0-9]+)', 'i');
                        const m = text.match(re);
                        if (m) return m[1];
                    }
                    return '0';
                };
                const mel = getSilqSkill('Melee', 'mel');
                const arc = getSilqSkill('Archery', 'arc');
                const evaRaw = getSilqSkill('Evasion', 'evn');
                const eva = evaRaw !== '0' ? evaRaw : (getSilqSkill('Evade', 'evn') !== '0' ? getSilqSkill('Evade', 'evn') : (player.evn !== undefined ? String(player.evn) : '0'));
                const stl = getSilqSkill('Stealth', 'stl');
                const per = getSilqSkill('Perception', 'per');
                const wil = getSilqSkill('Will', 'wil');
                const smi = getSilqSkill('Smithing', 'smt');
                const sng = getSilqSkill('Song', 'sng');
                const voice = `${curSp}/${maxSp}`;
                const unspentXp = Number(player.new_exp !== undefined ? player.new_exp : (player.exp || 0));
                const totalXp = Number(player.exp_max !== undefined ? player.exp_max : unspentXp);
                const xpPool = `${unspentXp.toLocaleString()} / ${totalXp.toLocaleString()}`;
                const song1Name = player.song_name ? String(player.song_name) : 'None';
                const song2Active = player.song2 != null && Number(player.song2) !== 0 && Number(player.song2) !== 100 && Boolean(player.song2_name);
                const song2Name = song2Active ? String(player.song2_name) : '';
                const sig = `silq:${mel}:${arc}:${eva}:${stl}:${per}:${wil}:${smi}:${sng}:${voice}:${xpPool}:${song1Name}:${player.song2 || 0}:${song2Name}:${maxD}`;
                const silqPairs = [
                    ['Melee', mel], ['Archery', arc],
                    ['Evasion', eva], ['Stealth', stl],
                    ['Perception', per], ['Will', wil],
                    ['Smithing', smi], ['Song Skill', sng],
                    ['Voice', voice], ['XP (Pool)', xpPool],
                    ['Song', song1Name],
                    song2Active ? ['Song 2', song2Name] : ['Max Depth', maxD]
                ];
                reconcileDrawerGrid(sig, silqPairs);
            } else {
                const spd = this._lastSpdStr || 'Normal (0)';
                const turn = String(this.currentTurn || 0);
                const eqCount = (player.equipment && Array.isArray(player.equipment)) ? String(player.equipment.length) : (player.equip_count !== undefined ? String(player.equip_count) : (player.equip ? String(Object.keys(player.equip).length) : '--'));
                const pkCount = (player.inventory && Array.isArray(player.inventory)) ? String(player.inventory.length) : (player.inven_count !== undefined ? String(player.inven_count) : (player.inven ? String(Object.keys(player.inven).length) : '--'));
                const weap = _hudItemStr(player.weapon_item) || 'Bare Hands';
                const light = _hudItemStr(player.light_item) || (player.cur_light > 0 ? `Light +${player.cur_light}` : (player.light > 0 ? `Light +${player.light}` : 'Daylight / Dark'));
                const fmtSigned = (v) => { const n = Number(v) || 0; return n >= 0 ? `+${n}` : `${n}`; };
                const pairs = [['Max Depth', maxD], ['Speed', spd], ['Turn', turn]];
                if (!hasLevels && !hasXp) {
                    pairs.push(['Enchantments', `+${player.enchantments || 0}`]);
                    pairs.push(['Lumenstones', String(player.lumenstones || 0)]);
                    pairs.push(['Nutrition', `${Math.round(player.nutrition ?? 100)}%`]);
                } else {
                    const xp = `${(player.exp || 0).toLocaleString()}${player.exp_next ? ` / ${player.exp_next.toLocaleString()}` : ''}`;
                    pairs.push([progSchema.xpLabel || 'XP', xp]);
                }
                if (realm === 'dcss') {
                    const pty = Number(player.piety) || 0;
                    const pietyStr = (player.god && player.god !== 'No God') ? `${'★'.repeat(Math.max(0, Math.min(6, pty))).padEnd(6, '☆')} (${pty}/6)` : '—';
                    pairs.push(['Deity', player.god || 'No God'], ['Piety', pietyStr], ['Runes', `${Number(player.runes) || 0} / 3`]);
                } else if (realm === 'nethack') {
                    pairs.push(['Alignment', player.align || player.alignment || 'Neutral'], ['Hunger', player.hunger_state || 'Not Hungry']);
                } else if (realm === 'angband' || realm === 'frogcomposband' || realm === 'hengband') {
                    if (player.melee_to_h !== undefined || player.melee_to_d !== undefined) {
                        pairs.push(['Melee', `(${fmtSigned(player.melee_to_h)}, ${fmtSigned(player.melee_to_d)})`]);
                    }
                    if (player.blows !== undefined) {
                        const b = Number(player.blows);
                        pairs.push(['Blows', `${b >= 20 ? (b / 100).toFixed(1) : b}/turn`]);
                    }
                    if (player.total_weight !== undefined) {
                        pairs.push(['Weight', `${(Number(player.total_weight) / 10).toFixed(1)} lbs`]);
                    }
                } else if (realm === 'rogue') {
                    pairs.push(['Nutrition', `${Math.round(((player.nutrition ?? 1300) / (player.nutrition_max || 1300)) * 100)}%`]);
                }
                pairs.push(['Equip Count', eqCount], ['Pack Count', pkCount], ['Weapon', weap]);
                const sig = `std:${realm}:${pairs.map(([k, v]) => `${k}=${v}`).join('|')}`;
                reconcileDrawerGrid(sig, pairs);
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
                    this.messageFeedWindow.style.opacity = '';
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
            } else if (schemas.depthSchema.style === 'feet') {
                welcomeMsg = `You descend into Dungeon Level ${depth} (${depth * feetPerLvl}${depthUnit}).`;
            } else {
                welcomeMsg = `You enter ${locStr}.`;
            }

            this.resetMessages(welcomeMsg);
            this.lastSeenMessages = (frame.messages && Array.isArray(frame.messages))
                ? frame.messages.filter(m => m && m.text && m.text.trim().length > 0 &&
                    !m.text.trim().startsWith('===') && !m.text.trim().startsWith('---')).map(m => ({ text: m.text, count: m.count, attr: m.attr }))
                : [];
            const resetRow0Raw = (frame.term && frame.term.rows && frame.term.rows[0] && frame.term.rows[0].g)
                ? frame.term.rows[0].g : '';
            const resetRow0Norm = this._normFeedText(resetRow0Raw);
            this.lastTermRow0 = (resetRow0Norm && this._isRedundantTermRow0(resetRow0Norm, this.lastSeenMessages, []))
                ? resetRow0Norm : '';
        }

        // Track staircase floor transitions (Town <-> Dungeon depths)
        if (inPlay && player.depth !== undefined && this.lastDepth !== undefined && player.depth !== this.lastDepth) {
            const rKeys = typeof RealmKeys !== 'undefined' ? RealmKeys : (typeof window !== 'undefined' ? window.RealmKeys : null);
            const realm = (frame && frame.realm) || (this.lastFrame && this.lastFrame.realm) || (window.activeRealm) || 'angband';
            const realmText = (rKeys && rKeys.REALM_TEXT && rKeys.REALM_TEXT[realm]) || { town: 'the Town', depthUnit: 'ft', feetPerLevel: 50 };
            const feetPerLvl = realmText.feetPerLevel || 50;
            const depthUnit = realmText.depthUnit || 'ft';

            if (player.depth > this.lastDepth) {
                const descMsg = schemas.depthSchema.style === 'feet'
                    ? `You descend into Dungeon Level ${player.depth} (${player.depth * feetPerLvl}${depthUnit}).`
                    : `You descend to ${locStr}.`;
                this.addMessage(descMsg, '#ffd700');
            } else if (player.depth < this.lastDepth) {
                const ascendMsg = player.depth === 0
                    ? (realmText.town ? `You return to the surface of ${realmText.town}.` : "You return to the surface.")
                    : (schemas.depthSchema.style === 'feet'
                        ? `You ascend to Dungeon Level ${player.depth} (${player.depth * feetPerLvl}${depthUnit}).`
                        : `You ascend to ${locStr}.`);
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
                                if (this._normFeedText(prevList[prevList.length - k + j].text) !== this._normFeedText(curList[j].text)) {
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
                            } else if (prevLast && curLast && this._normFeedText(prevLast.text) && this._normFeedText(prevLast.text) === this._normFeedText(curLast.text)) {
                                const prevParsed = this._parseRepeatText(prevLast.text);
                                const curParsed = this._parseRepeatText(curLast.text);
                                const prevCount = Math.max(prevLast.count || 1, prevParsed.count || 1);
                                const curCount = Math.max(curLast.count || 1, curParsed.count || 1);
                                if (curCount > prevCount) {
                                    const diff = curCount - prevCount;
                                    const col = this.getMessageColor(curParsed.base, curLast.attr);
                                    if (this.isCombatMessage(curParsed.base)) {
                                        for (let c = 0; c < diff; c++) {
                                            this.addMessage(curParsed.base, col, curParsed.base);
                                        }
                                    } else {
                                        this.updateLastMessageCount(curParsed.base, curCount);
                                    }
                                }
                            }
                        }
                    }

                    for (const item of newItems) {
                        const parsedItem = this._parseRepeatText(item.text);
                        const effCount = Math.max(item.count || 1, parsedItem.count || 1);
                        let text = parsedItem.base || item.text.trim();
                        if (effCount > 1 && (!this.isCombatMessage(text) || parsedItem.count > 1)) {
                            text += ` (x${effCount})`;
                        }
                        const col = this.getMessageColor(parsedItem.base || item.text.trim(), item.attr);
                        this.addMessage(text, col, parsedItem.base || item.text.trim());
                    }

                    this.lastSeenMessages = curList.map(m => ({ text: m.text, count: m.count, attr: m.attr }));
                }
            }

            // 2. Also capture distinct dynamic action lines on term row 0 during play (prompts, status changes)
            if (frame.term && frame.term.rows && frame.term.rows[0] && frame.term.rows[0].g) {
                const line0 = this._normFeedText(frame.term.rows[0].g);
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
                    const isRedundant = this._isRedundantTermRow0(line0, frame.messages || [], newItems);
                    const isNewAction = line0 !== this.lastTermRow0;
                    if (!isRedundant && isNewAction) {
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

        // Minimap Radar
        if (frame.map && frame.player) {
            this.renderMinimap(frame.map, frame.player, frame.monsters || [], this.currentCameraYaw);
        }

        // Check if player died or ascended: C engines allow 0 HP (dead only when hp < 0 or player.dead); cartridges die at hp <= 0
        const rHud = String(frame.realm || this.activeRealm || '').toLowerCase();
        const isCEngineHud = rHud === 'angband' || rHud === 'silq' || rHud === 'frogcomposband' || rHud === 'hengband';
        const isDead = Boolean(player.dead || (player.hp !== undefined && (isCEngineHud ? player.hp < 0 : player.hp <= 0) && player.hp_max > 0));
        const isVictory = Boolean(frame.victory || player.winner || player.total_winner);
        if (isDead || isVictory) {
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
        return (feat >= 7 && feat <= 14) || (feat >= 0x20 && feat <= 0x28) || (Boolean(this.lastFrame && this.lastFrame.realm === 'hengband') && feat === 4);
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
            const isDoorInFront = frontFeat === 2;
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
        this._lastDeathSketchSig = null;
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
        const wasHidden = this.deathModal.classList.contains('hidden');
        this.deathModal.classList.remove('hidden');
        this.lastDeathFrame = frame;
        const p = (frame && frame.player) || {};
        const isVictory = Boolean((frame && frame.victory) || p.winner || p.total_winner);
        if (wasHidden && typeof window !== 'undefined' && window.__app && window.__app.audio) {
            if (isVictory && typeof window.__app.audio.playMusicTrack === 'function') window.__app.audio.playMusicTrack('victory_royal', true);
            else if (typeof window.__app.audio.playDeathTheme === 'function') window.__app.audio.playDeathTheme();
        }
        const realm = (frame && frame.realm) || window.__activeRealm || 'angband';
        const rc = window.RealmCartridge;
        const summary = (rc && typeof rc.formatDeathModalSummary === 'function')
            ? rc.formatDeathModalSummary(frame, realm)
            : { titleText: isVictory ? '👑 GLORIOUS ASCENSION 👑' : '☠ YOU HAVE PERISHED ☠', epitaph: 'Hero', cause: isVictory ? 'Triumphant Ascension!' : 'Killed in the dungeon.', score: '', eq: [], inv: [], quiv: [] };
        if (isVictory && /PERISHED|DIED|SLAIN/i.test(summary.titleText || '')) summary.titleText = '👑 GLORIOUS ASCENSION 👑';
        this._deathSummary = summary;
        const titleEl = document.getElementById('death-title-text') || this.deathModal.querySelector('.death-title');
        if (titleEl && summary.titleText) titleEl.textContent = summary.titleText;
        if (this.deathEpitaph) this.deathEpitaph.textContent = summary.epitaph;
        if (this.deathCause) this.deathCause.textContent = summary.cause;
        if (this.deathScore) this.deathScore.textContent = summary.score;
        if (this.deathTabs[1]) this.deathTabs[1].textContent = `2. Equipment (${summary.eq.length})`;
        if (this.deathTabs[2]) this.deathTabs[2].textContent = `3. Inventory (${summary.inv.length})`;
        if (this.deathTabs[3]) this.deathTabs[3].textContent = `4. Quiver (${summary.quiv.length})`;
        if (window.YasdAutopsy && typeof window.YasdAutopsy.renderDeathAutopsy === 'function') window.YasdAutopsy.renderDeathAutopsy(frame, summary, realm);
        if (wasHidden) this.switchDeathTab(0);
        else this.renderDeathTabContent(this.activeDeathTab, frame);
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (this.deathTerminal && typeof this.deathTerminal.resize === 'function') {
                    this.deathTerminal.resize();
                    const f = this.lastDeathFrame || frame;
                    if (f && f.term) this.deathTerminal.render(f.term);
                }
            });
        }
        const sketchSig = `${realm}:${p.name || 'Hero'}:${p.level || 1}:${p.depth || 0}:${summary.cause || ''}:${isVictory ? 'win' : 'rip'}`;
        if (this._lastDeathSketchSig !== sketchSig && window.chronicleManager && typeof window.chronicleManager.renderDeathSketchIntoModal === 'function') {
            this._lastDeathSketchSig = sketchSig;
            window.chronicleManager.renderDeathSketchIntoModal(frame, true);
        }
        const shareBtn = document.getElementById('btn-death-share-yasd');
        if (shareBtn && !shareBtn._boundYasd) {
            shareBtn._boundYasd = true;
            shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const df = this.lastDeathFrame || this.lastFrame;
                if (window.YasdAutopsy && typeof window.YasdAutopsy.shareOrDownloadYasdCard === 'function') window.YasdAutopsy.shareOrDownloadYasdCard(df);
                else if (window.chronicleManager && typeof window.chronicleManager.downloadYasdShareCard === 'function') window.chronicleManager.downloadYasdShareCard(df);
            });
        }
        const termToolbar = document.getElementById('death-term-toolbar');
        if (termToolbar && !termToolbar._boundDeathKeys) {
            termToolbar._boundDeathKeys = true;
            termToolbar.querySelectorAll('button[data-death-key]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const keySpec = btn.getAttribute('data-death-key');
                    if (keySpec && window.__app && window.__app.network) {
                        window.__app.network.sendKey(keySpec);
                    }
                });
            });
        }
    }

    renderDeathTabContent(tabIdx, frame) {
        const player = frame.player || {};
        const realm = (frame && frame.realm) || window.__activeRealm || 'angband';
        const summary = this._deathSummary || (window.RealmCartridge && window.RealmCartridge.formatDeathModalSummary ? window.RealmCartridge.formatDeathModalSummary(frame, realm) : { eq: player.equipment || [], inv: player.inventory || [], quiv: player.quiver || [] });

        if (tabIdx === 0) {
            const termCanvas = document.getElementById('death-terminal-canvas');
            if (termCanvas && frame.term) {
                if (!this.deathTerminal) {
                    this.deathTerminal = new WebTerminal('death-terminal-canvas', (key) => {
                        if (window.__app && window.__app.network) window.__app.network.sendKey(key);
                    });
                }
                if (typeof this.deathTerminal.resize === 'function' && termCanvas.clientWidth > 0) {
                    this.deathTerminal.resize();
                }
                this.deathTerminal.render(frame.term);
                termCanvas.style.width = '100%';
                termCanvas.style.height = 'auto';
                termCanvas.style.maxWidth = '100%';
                termCanvas.style.maxHeight = '100%';
            }
        } else if (tabIdx === 1 || tabIdx === 2 || tabIdx === 3) {
            const listIds = [null, 'death-equipment-list', 'death-inventory-list', 'death-quiver-list'];
            const emptyMsgs = [null, '(No equipment worn at death)', '(Inventory was empty)', '(Quiver was empty)'];
            const items = tabIdx === 1 ? summary.eq : (tabIdx === 2 ? summary.inv : summary.quiv);
            const list = document.getElementById(listIds[tabIdx]);
            if (list) {
                list.innerHTML = '';
                if (!items || items.length === 0) {
                    const emptyLi = document.createElement('li');
                    emptyLi.className = 'death-list-empty';
                    emptyLi.textContent = emptyMsgs[tabIdx] || '';
                    list.appendChild(emptyLi);
                } else {
                    items.forEach((item, idx) => {
                        const li = document.createElement('li');
                        li.className = 'death-list-item';
                        const slotTxt = tabIdx === 1 ? (item.mention || item.slot_name || `${item.slot || '•'})`) : (tabIdx === 2 ? `${item.slot || String.fromCharCode(97 + idx)})` : `${idx})`);
                        li.innerHTML = `<span class="item-slot">${escapeHtml(slotTxt)}</span><span class="item-name">${escapeHtml(item.name || item.label || '')}</span><span class="item-weight">${item.weight ? (item.weight / 10).toFixed(1) + ' lbs' : ''}</span>`;
                        list.appendChild(li);
                    });
                }
            }
        } else if (tabIdx === 4) {
            const container = document.getElementById('death-stats-container');
            if (container && window.RealmCartridge && typeof window.RealmCartridge.buildDeathStatsHtml === 'function') {
                container.innerHTML = window.RealmCartridge.buildDeathStatsHtml(player, realm, escapeHtml);
            }
        }
    }

    _parseRepeatText(s) {
        let clean = String(s || '')
            .replace(/\s*[-–—]more[-–—]\s*$/i, '')
            .replace(/\s*\[more\]\s*$/i, '')
            .replace(/\s*\[?\s*press\s+space\s*\]?\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        let count = 1;
        const repRe = /\s*(?:\((?:x(\d+)|(\d+)x)\)|<(?:x(\d+)|(\d+)x)>|\[(?:x(\d+)|(\d+)x)\]|\sx(\d+))\s*$/i;
        let m;
        while ((m = clean.match(repRe))) {
            const n = parseInt(m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || m[7], 10);
            if (Number.isFinite(n) && n > count) count = n;
            clean = clean.slice(0, m.index).trim();
        }
        return { base: clean, count };
    }

    _normFeedText(s) {
        return this._parseRepeatText(s).base;
    }

    _isRedundantTermRow0(line0, curList = [], newItems = []) {
        const n0 = this._normFeedText(line0);
        if (!n0) return true;
        const n0Variants = [n0];
        if (typeof window !== 'undefined' && typeof window.localizeGameMessage === 'function') {
            try {
                const loc0 = this._normFeedText(window.localizeGameMessage(n0));
                if (loc0 && loc0 !== n0) n0Variants.push(loc0);
            } catch (_) {}
        }

        const combined = [
            ...(Array.isArray(this.messageHistory) ? this.messageHistory.slice(-8).map(h => ({ text: h && (h.baseDisplay || h.rawText || h.text) })) : []),
            ...(Array.isArray(curList) ? curList : []),
            ...(Array.isArray(newItems) ? newItems : [])
        ];
        const msgs = [];
        for (const item of combined) {
            if (!item || !item.text) continue;
            const raw = this._normFeedText(item.text);
            if (!raw || raw.startsWith('===') || raw.startsWith('---')) continue;
            const forms = [raw];
            if (typeof window !== 'undefined' && typeof window.localizeGameMessage === 'function') {
                try {
                    const loc = this._normFeedText(window.localizeGameMessage(raw));
                    if (loc && loc !== raw) forms.push(loc);
                } catch (_) {}
            }
            msgs.push(forms);
        }
        if (msgs.length === 0) return false;

        const matchesCandidate = (candidate) => {
            if (!candidate) return false;
            for (const q of n0Variants) {
                if (candidate === q) return true;
                if (q.length >= 16 && candidate.startsWith(q)) return true;
                if (q.length >= 10 && candidate.endsWith(q)) return true;
                if (q.length >= 14 && candidate.includes(q)) return true;
            }
            return false;
        };

        // 1. Single message exact, 80-col prefix truncation, or repeated-message concatenation
        for (const forms of msgs) {
            for (const f of forms) {
                if (matchesCandidate(f)) return true;
                if (f.length >= 4 && n0.length > f.length) {
                    let rep = f;
                    const maxLen = Math.max(n0.length, f.length) + 16;
                    for (let r = 2; r <= 8 && rep.length <= maxLen; r++) {
                        rep += ' ' + f;
                        if (matchesCandidate(rep)) return true;
                    }
                }
            }
        }

        // 2. Contiguous window concatenation across recent messages (joined by ' ')
        const recent = msgs.slice(-16);
        for (let i = 0; i < recent.length; i++) {
            for (let formIdx = 0; formIdx < 2; formIdx++) {
                let joined = recent[i][formIdx] || recent[i][0];
                for (let j = i + 1; j < recent.length && joined.length <= n0.length + 120; j++) {
                    joined += ' ' + (recent[j][formIdx] || recent[j][0]);
                    if (matchesCandidate(joined)) return true;
                }
            }
        }

        // 3. Mixed concatenation / repeated runs ending in exact or 80-col truncated tail
        for (const q of n0Variants) {
            let rem = q;
            let consumed = 0;
            let guard = 0;
            while (rem.length > 0 && guard++ < 12) {
                let matchedStep = false;
                for (const forms of recent) {
                    for (const f of forms) {
                        if (rem === f) {
                            rem = '';
                            consumed++;
                            matchedStep = true;
                            break;
                        }
                        if (rem.startsWith(f + ' ')) {
                            rem = rem.slice(f.length).trim();
                            consumed++;
                            matchedStep = true;
                            break;
                        }
                    }
                    if (matchedStep) break;
                }
                if (!matchedStep) {
                    if (consumed > 0 && rem.length >= 10) {
                        for (const forms of recent) {
                            for (const f of forms) {
                                if (f.startsWith(rem)) return true;
                            }
                        }
                    }
                    break;
                }
            }
            if (rem.length === 0 && consumed > 0) return true;
        }

        return false;
    }
}

window.WebHUD = WebHUD;
if (window.HudLayout && typeof window.HudLayout.attach === 'function') {
    window.HudLayout.attach(WebHUD);
} else if (typeof require === 'function') {
    try { require('./hud-layout.js').attach(WebHUD); } catch (_) {}
}

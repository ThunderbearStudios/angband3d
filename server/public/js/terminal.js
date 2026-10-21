/**
 * Angband3D Web Terminal — High-DPI Vector Canvas Terminal
 * Renders Angband's 80x24 character grid with 100% pixel-perfect crispness at any resolution.
 * Supports exact 2-hex attribute color parsing and mouse-click selection.
 */

class WebTerminal {
    constructor(canvasId, onSelectKey) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onSelectKey = onSelectKey || (() => {});
        this.onKeyClick = this.onSelectKey;
        this.hoverRow = -1;

        this.cols = 80;
        this.rows = 24;

        // Accurate Angband 16-color palette
        this.palette = [
            '#1a1d24', // 0: Dark Black/Background
            '#ffffff', // 1: White
            '#9ea3ad', // 2: Grey / Slate
            '#ff9900', // 3: Orange (peaks / flames)
            '#e63946', // 4: Red
            '#2a9d8f', // 5: Green
            '#457b9d', // 6: Blue
            '#a3704c', // 7: Umber / Brown
            '#555a64', // 8: Dark Grey
            '#c8d1dc', // 9: Light Slate
            '#b5179e', // 10: Violet
            '#ffd166', // 11: Yellow
            '#ff6b6b', // 12: Light Red
            '#06d6a0', // 13: Light Green
            '#4cc9f0', // 14: Light Blue
            '#e0a96d'  // 15: Light Umber
        ];

        this.lastRows = [];
        this.tdSjis = (typeof TextDecoder !== 'undefined') ? new TextDecoder('shift-jis') : null;
        this.zoomLevel = 1.0;
        this.minZoom = 0.45;
        this.maxZoom = 3.2;
        this.zoomStep = 0.25;

        // 3D Camera Facing & Vision Cone Telemetry
        this.cameraYaw = 0;
        this.facingSector = 0; // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
        this.isTargetingMode = false;
        this.userHasScrolled = false;
        this.isTouchDevice = false;
        this.lastMode = null;
        this.selectableRegions = [];
        this.selectedIndex = -1;
        this.selectedKey = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupMouseEvents();
        this.setupViewportGestures();
        this.setupZoomControls();
    }

    setCameraFacing(yaw) {
        if (typeof yaw !== 'number' || isNaN(yaw)) return;
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        if (this.facingSector === sector && Math.abs((this.cameraYaw || 0) - yaw) < 0.001) return;
        this.cameraYaw = yaw;
        this.facingSector = sector;
        if (this.lastTermData) {
            this.render(this.lastTermData);
        }
    }

    setTargetingMode(active) {
        const nextActive = Boolean(active);
        if (this.isTargetingMode === nextActive) return;
        this.isTargetingMode = nextActive;
        if (this.lastTermData) {
            this.render(this.lastTermData);
        }
    }

    setZoom(level, anchorViewportX = null, anchorViewportY = null) {
        const target = Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(level * 100) / 100));
        if (Math.abs(target - this.zoomLevel) < 0.01) return;

        const viewport = document.getElementById('terminal-viewport');
        const oldZoom = this.zoomLevel;
        const zoomRatio = target / oldZoom;

        // If an anchor point was given (pinch center), adjust scroll so anchor remains stationary
        let scrollAdjX = 0;
        let scrollAdjY = 0;
        if (viewport && anchorViewportX !== null && anchorViewportY !== null) {
            scrollAdjX = (viewport.scrollLeft + anchorViewportX) * (zoomRatio - 1);
            scrollAdjY = (viewport.scrollTop + anchorViewportY) * (zoomRatio - 1);
        }

        this.zoomLevel = target;
        this.updateZoomUI();
        this.resize();

        if (viewport && (scrollAdjX !== 0 || scrollAdjY !== 0)) {
            viewport.scrollLeft += scrollAdjX;
            viewport.scrollTop += scrollAdjY;
        }
    }

    zoomIn() {
        const viewport = document.getElementById('terminal-viewport');
        const cx = viewport ? viewport.clientWidth / 2 : null;
        const cy = viewport ? viewport.clientHeight / 2 : null;
        this.setZoom(this.zoomLevel + this.zoomStep, cx, cy);
    }

    zoomOut() {
        const viewport = document.getElementById('terminal-viewport');
        const cx = viewport ? viewport.clientWidth / 2 : null;
        const cy = viewport ? viewport.clientHeight / 2 : null;
        this.setZoom(this.zoomLevel - this.zoomStep, cx, cy);
    }

    resetZoom() {
        this.userHasScrolled = false;
        this.setZoom(1.0);
        const viewport = document.getElementById('terminal-viewport');
        if (viewport) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
    }

    updateZoomUI() {
        const btnReset = document.getElementById('btn-term-zoom-reset') || document.getElementById('term-zoom-label');
        if (btnReset) {
            btnReset.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            btnReset.title = `Current Zoom: ${Math.round(this.zoomLevel * 100)}% (Click to reset to Fit)`;
        }
    }

    setupZoomControls() {
        const btnZoomIn = document.getElementById('btn-term-zoom-in');
        const btnZoomOut = document.getElementById('btn-term-zoom-out');
        const btnZoomReset = document.getElementById('btn-term-zoom-reset') || document.getElementById('term-zoom-label');

        if (btnZoomIn) {
            btnZoomIn.addEventListener('click', (e) => {
                e.preventDefault();
                this.zoomIn();
            });
        }
        if (btnZoomOut) {
            btnZoomOut.addEventListener('click', (e) => {
                e.preventDefault();
                this.zoomOut();
            });
        }
        if (btnZoomReset) {
            btnZoomReset.style.cursor = 'pointer';
            btnZoomReset.addEventListener('click', (e) => {
                e.preventDefault();
                this.resetZoom();
            });
        }
    }

    setupViewportGestures() {
        const viewport = document.getElementById('terminal-viewport');
        if (!viewport) return;

        // Viewport and canvas cursor indicates view is pan-manageable
        viewport.style.cursor = 'grab';
        if (this.canvas) {
            this.canvas.style.cursor = 'grab';
        }

        let isTouchDragging = false;
        let isTouchPinching = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        let touchStartScrollLeft = 0;
        let touchStartScrollTop = 0;
        let initialPinchDist = null;
        let initialZoom = 1.0;
        let pinchCenterViewportX = 0;
        let pinchCenterViewportY = 0;

        let isMouseDragging = false;
        let mouseStartX = 0;
        let mouseStartY = 0;
        let mouseStartScrollLeft = 0;
        let mouseStartScrollTop = 0;

        // Desktop Wheel Zoom with Ctrl Key or Trackpad Pinch
        viewport.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                const rect = viewport.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                this.setZoom(this.zoomLevel + delta, cx, cy);
            }
        }, { passive: false });

        // Mouse Drag to Pan (Strictly manages view when dragged >= 6px, preserving crisp cell clicks)
        viewport.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Primary / Left Click
                isMouseDragging = true;
                this._mouseDidDrag = false;
                this._panDragDist = 0;
                mouseStartX = e.clientX;
                mouseStartY = e.clientY;
                mouseStartScrollLeft = viewport.scrollLeft;
                mouseStartScrollTop = viewport.scrollTop;
                if (this.zoomLevel > 1.02) {
                    viewport.style.cursor = 'grabbing';
                    if (this.canvas) this.canvas.style.cursor = 'grabbing';
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDragging) return;
            const dx = e.clientX - mouseStartX;
            const dy = e.clientY - mouseStartY;
            this._panDragDist = Math.hypot(dx, dy);
            if (this._panDragDist >= 6) {
                this._mouseDidDrag = true;
                viewport.style.cursor = 'grabbing';
                if (this.canvas) this.canvas.style.cursor = 'grabbing';
            }
            if (this._mouseDidDrag) {
                viewport.scrollLeft = mouseStartScrollLeft - dx;
                viewport.scrollTop = mouseStartScrollTop - dy;
                this.userHasScrolled = true;
            }
        });

        const stopMouseDrag = () => {
            if (isMouseDragging) {
                isMouseDragging = false;
                viewport.style.cursor = this.zoomLevel > 1.02 ? 'grab' : 'default';
                if (this.canvas) this.canvas.style.cursor = 'pointer';
            }
        };

        window.addEventListener('mouseup', stopMouseDrag);

        // Hardware-accelerated Touch Gestures: Pinch-to-Zoom & 1-Finger Pan
        viewport.addEventListener('touchstart', (e) => {
            this.isTouchDevice = true;
            if (e.touches.length === 2) {
                isTouchDragging = false;
                isTouchPinching = true;
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                initialPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
                initialZoom = this.zoomLevel;
                const rect = viewport.getBoundingClientRect();
                pinchCenterViewportX = ((t0.clientX + t1.clientX) / 2) - rect.left;
                pinchCenterViewportY = ((t0.clientY + t1.clientY) / 2) - rect.top;
            } else if (e.touches.length === 1) {
                isTouchDragging = true;
                isTouchPinching = false;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now();
                touchStartScrollLeft = viewport.scrollLeft;
                touchStartScrollTop = viewport.scrollTop;
                this.userHasScrolled = true;
            }
        }, { passive: false });

        viewport.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isTouchPinching && initialPinchDist > 5) {
                if (e.cancelable) e.preventDefault();
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
                const factor = currentDist / initialPinchDist;
                this.setZoom(initialZoom * factor, pinchCenterViewportX, pinchCenterViewportY);
            } else if (e.touches.length === 1 && isTouchDragging) {
                const dx = e.touches[0].clientX - touchStartX;
                const dy = e.touches[0].clientY - touchStartY;
                if (Math.hypot(dx, dy) >= 8) {
                    if (e.cancelable) e.preventDefault();
                    viewport.scrollLeft = touchStartScrollLeft - dx;
                    viewport.scrollTop = touchStartScrollTop - dy;
                    this.userHasScrolled = true;
                }
            }
        }, { passive: false });

        const endTouch = (e) => {
            if (isTouchDragging && e && e.changedTouches && e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                if (Math.hypot(dx, dy) < 14 && (Date.now() - touchStartTime) < 550) {
                    this._lastTouchTapMs = Date.now();
                    const rect = this.canvas.getBoundingClientRect();
                    if (rect.height && this.charHeight && rect.width && this.charWidth) {
                        const offsetY = (touch.clientY - rect.top) * ((this.rows * this.charHeight) / rect.height);
                        const offsetX = (touch.clientX - rect.left) * ((this.cols * this.charWidth) / rect.width);
                        const r = Math.floor(offsetY / this.charHeight);
                        const c = Math.floor(offsetX / this.charWidth);
                        this.handleRowClick(r, c);
                    }
                }
            }
            isTouchDragging = false;
            isTouchPinching = false;
            initialPinchDist = null;
        };

        viewport.addEventListener('touchend', endTouch, { passive: true });
        viewport.addEventListener('touchcancel', endTouch, { passive: true });
    }

    detectMode(termData) {
        if (window.ScreenContext && typeof window.ScreenContext.terminalDetectMode === 'function') {
            return window.ScreenContext.terminalDetectMode(termData, (s) => this.decodeText(s));
        }
        return 'classic_play';
    }

    resize() {
        // High-DPI logical font metrics maintaining standard 80x24 aspect ratio
        const baseCellWidth = 14;
        const baseCellHeight = 28; // 28px gives 2:1 cell aspect (14x28), making 2-cell CJK characters a perfect 28x28 square
        const logicalWidth = this.cols * baseCellWidth; // 1120px
        const logicalHeight = this.rows * baseCellHeight; // 672px

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.dpr = dpr;
        this.charWidth = baseCellWidth;
        this.charHeight = baseCellHeight;
        this.fontSize = Math.floor(this.charHeight * 0.72); // ~20px for ASCII
        this.cjkFontSize = Math.floor(this.charHeight * 0.89); // ~25px for CJK

        this.asciiFont = `bold ${this.fontSize}px 'Fira Code', 'BIZ UDGothic', 'MS Gothic', 'Yu Gothic', monospace`;
        this.cjkFont = `bold ${this.cjkFontSize}px 'BIZ UDGothic', 'MS Gothic', 'Noto Sans CJK JP', 'Meiryo', 'Yu Gothic', sans-serif`;

        const mode = this.detectMode(this.lastTermData);
        this.currentMode = mode;

        // Anchor scale to stable outer #terminal-window bounds minus a fixed chrome reserve
        // so opening/closing Grimoire cards or touch ribbons never causes the 80x24 canvas to jump in size.
        const viewport = document.getElementById('terminal-viewport');
        const termWindow = document.getElementById('terminal-window') || document.getElementById('terminal-card');
        const isLandscapePhone = window.innerHeight <= 500 && window.innerWidth > window.innerHeight;
        const chromeReserveH = isLandscapePhone ? 112 : 136;
        const outerW = (termWindow && termWindow.clientWidth > 0)
            ? (termWindow.clientWidth - 16)
            : (viewport && viewport.clientWidth > 0 ? viewport.clientWidth : (window.innerWidth - 16));
        const outerH = (termWindow && termWindow.clientHeight > 0)
            ? (termWindow.clientHeight - chromeReserveH)
            : (window.innerHeight - chromeReserveH);

        const availW = Math.max(280, outerW || window.innerWidth);
        const availH = Math.max(220, outerH || (window.innerHeight - 160));

        // Keep logical 80x24 grid aspect uniform across all modes (classic_play, item_prompt, store, birth)
        // so switching between menus and gameplay never triggers jarring zoom jumps.
        const isMobileScreen = window.innerWidth <= 640;
        let baseScale;
        if (isMobileScreen) {
            baseScale = Math.max(0.58, Math.min(availW / logicalWidth, availH / logicalHeight, 1.35));
        } else {
            baseScale = Math.max(0.62, Math.min(availW / logicalWidth, availH / logicalHeight, 2.25));
        }

        const effectiveScale = baseScale * this.zoomLevel;
        this.effectiveScale = effectiveScale;
        const cssW = Math.floor(logicalWidth * effectiveScale);
        const cssH = Math.floor(logicalHeight * effectiveScale);

        // Size backing canvas buffer to exact device pixels for native retina crispness
        const targetW = Math.round(cssW * dpr);
        const targetH = Math.round(cssH * dpr);
        const dimChanged = (this.canvas.width !== targetW || this.canvas.height !== targetH);
        if (dimChanged) {
            this.canvas.width = targetW;
            this.canvas.height = targetH;
        }

        this.canvas.style.width = `${cssW}px`;
        this.canvas.style.height = `${cssH}px`;
        this.canvas.style.maxWidth = 'none'; // Allow viewport horizontal scrolling
        this.canvas.style.flexShrink = '0';
        this.canvas.style.objectFit = 'contain';

        const needsScrollX = cssW > availW;
        const needsScrollY = cssH > availH;
        if (viewport) {
            viewport.style.justifyContent = needsScrollX ? 'flex-start' : 'center';
            viewport.style.alignItems = needsScrollY ? 'flex-start' : 'center';
        }
        this.canvas.style.margin = (needsScrollX || needsScrollY) ? '0' : 'auto';

        if (dimChanged && this.lastTermData) {
            this.render(this.lastTermData);
        }
    }

    setupMouseEvents() {
        this.hoverRow = -1;
        this.hoverCol = -1;
        if (!this.canvas) return;

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (!rect.height || !this.charHeight || !rect.width || !this.charWidth) return;
            const offsetY = (e.clientY - rect.top) * ((this.rows * this.charHeight) / rect.height);
            const offsetX = (e.clientX - rect.left) * ((this.cols * this.charWidth) / rect.width);
            const row = Math.floor(offsetY / this.charHeight);
            const col = Math.floor(offsetX / this.charWidth);

            const app = (typeof window !== 'undefined' && (window.app || window.__app)) || null;
            const f = app?.currentFrame || app?.getLastFrame?.() || (typeof window !== 'undefined' && window.__lastFrame) || null;
            const inPlay = Boolean(f && f.phase === 'play' && (f.ui?.overlay || 0) === 0 && f.ui?.awaiting_command && !f.ui?.more);
            const inputMgr = app?.input || (typeof window !== 'undefined' && window.input) || null;

            if (inPlay && inputMgr && f && f.player && f.map && this.lastTermData) {
                this._findPlayerTermCoords(this.lastTermData, f.player);
                const tx = (this._vpOx !== undefined ? this._vpOx : 0) + col;
                const ty = (this._vpOy !== undefined ? this._vpOy : 0) + row;
                const tileKey = `${tx},${ty}`;
                if (this._hoverTileKey !== tileKey) {
                    this._hoverTileKey = tileKey;
                    const canNav = typeof inputMgr.canEngageStreetViewNav === 'function' ? inputMgr.canEngageStreetViewNav(f) : true;
                    if (canNav && tx >= 0 && ty >= 0 && tx < f.map.w && ty < f.map.h) {
                        this._hoverMapPath = typeof inputMgr.computeMinimapPath === 'function'
                            ? (inputMgr.computeMinimapPath.length >= 5 ? inputMgr.computeMinimapPath(f, f.player.x, f.player.y, tx, ty) : inputMgr.computeMinimapPath(f.player.x, f.player.y, tx, ty, f))
                            : [];
                    } else {
                        this._hoverMapPath = null;
                    }
                    if (this.lastTermData) this.render(this.lastTermData);
                }
            } else if (this._hoverMapPath) {
                this._hoverMapPath = null;
                this._hoverTileKey = null;
                if (this.lastTermData) this.render(this.lastTermData);
            }

            if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
                if (this.hoverRow !== row || this.hoverCol !== col) {
                    this.hoverRow = row;
                    this.hoverCol = col;
                    if (this.lastTermData) this.render(this.lastTermData);
                }
            } else if (this.hoverRow !== -1 || this.hoverCol !== -1) {
                this.hoverRow = -1;
                this.hoverCol = -1;
                if (this.lastTermData) this.render(this.lastTermData);
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            let rerender = false;
            if (this.hoverRow !== -1 || this.hoverCol !== -1) {
                this.hoverRow = -1;
                this.hoverCol = -1;
                rerender = true;
            }
            if (this._hoverMapPath || this._hoverTileKey) {
                this._hoverMapPath = null;
                this._hoverTileKey = null;
                rerender = true;
            }
            if (rerender && this.lastTermData) this.render(this.lastTermData);
        });

        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._lastTouchTapMs && (Date.now() - this._lastTouchTapMs) < 450) {
                return;
            }
            if (this._mouseDidDrag || (this._panDragDist && this._panDragDist > 6)) {
                this._mouseDidDrag = false;
                this._panDragDist = 0;
                return;
            }
            this._panDragDist = 0;
            const rect = this.canvas.getBoundingClientRect();
            if (!rect.height || !this.charHeight || !rect.width || !this.charWidth) return;
            const offsetY = (e.clientY - rect.top) * ((this.rows * this.charHeight) / rect.height);
            const offsetX = (e.clientX - rect.left) * ((this.cols * this.charWidth) / rect.width);
            const row = Math.floor(offsetY / this.charHeight);
            const col = Math.floor(offsetX / this.charWidth);
            this.handleRowClick(row, col);
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    extractRowRegions(line) {
        if (typeof window !== 'undefined' && window.ScreenContext && typeof window.ScreenContext.extractRowRegions === 'function') {
            return window.ScreenContext.extractRowRegions(line);
        }
        if (!line) return [];
        const tagMatch = line.match(/(?:^|\s+)(?:\[([a-zA-Z0-9*@?])\]|\(([a-zA-Z0-9*@?])\)|([a-zA-Z0-9*@?])[\)\.\:\-])\s+\S/);
        if (tagMatch) {
            const key = tagMatch[1] || tagMatch[2] || tagMatch[3];
            if (key) return [{ key, startCol: 0, endCol: this.cols - 1 }];
        }
        return [];
    }

    handleRowClick(row, col = -1) {
        if (row < 0 || row >= this.rows || !this.lastRows || !this.lastRows[row]) return;
        const rawLine = this.lastRows[row]?.g || '';
        const line = this.decodeText(rawLine);
        const sendKey = (key) => {
            if (key && key !== 'enter' && key !== 'space') {
                this.setSelectedKey(key);
            }
            if (typeof window !== 'undefined' && window.sound && typeof window.sound.playParchmentTurn === 'function') {
                window.sound.playParchmentTurn();
            }
            const btn = (typeof document !== 'undefined' && document.querySelector) ? document.querySelector(`.term-letter-btn[data-key="${key}"]`) : null;
            if (btn) {
                btn.click();
            } else if (typeof this.onKeyClick === 'function') {
                this.onKeyClick(key);
            } else if (typeof this.onSelectKey === 'function') {
                this.onSelectKey(key);
            } else if (typeof window !== 'undefined' && typeof window.__sendTerminalKey === 'function') {
                window.__sendTerminalKey(key);
            } else if (typeof window !== 'undefined' && window.network && typeof window.network.sendKey === 'function') {
                window.network.sendKey(key);
            }
        };

        const app = (typeof window !== 'undefined' && (window.app || window.__app)) || null;
        const f = app?.currentFrame || app?.lastFrame || app?.getLastFrame?.() || (typeof window !== 'undefined' && window.__lastFrame) || null;
        const inputMgr = app?.input || (typeof window !== 'undefined' && window.input) || null;
        const isTerminalMenuOpen = Boolean(
            (typeof window !== 'undefined' && window.ScreenContext && typeof window.ScreenContext.needsTerminal === 'function' && window.ScreenContext.needsTerminal(f, { forceTerminal: false })) ||
            (typeof window !== 'undefined' && window.MenuRouter && typeof window.MenuRouter.getPending === 'function' && window.MenuRouter.getPending())
        );
        const hasMenuTagInMapCols = /(?:^|\s+)(?:\[([a-zA-Z0-9*@?])\]|\(([a-zA-Z0-9*@?])\)|([a-zA-Z0-9*@?])[\)\.\-])\s+\S/.test(line.slice(12));
        const isPlayState = Boolean(f && f.phase === 'play' && (f.ui?.overlay || 0) === 0 && f.ui?.awaiting_command && !f.ui?.more && !isTerminalMenuOpen && !hasMenuTagInMapCols);

        if (isPlayState && inputMgr && f && f.player && f.map && this.lastTermData && col >= 12 && row >= 1 && row < this.rows - 1) {
            this._findPlayerTermCoords(this.lastTermData, f.player);
            const tx = (this._vpOx !== undefined ? this._vpOx : 0) + col;
            const ty = (this._vpOy !== undefined ? this._vpOy : 0) + row;
            if (tx >= 0 && ty >= 0 && tx < f.map.w && ty < f.map.h) {
                if (typeof inputMgr.startMinimapAutoNav === 'function') {
                    inputMgr.startMinimapAutoNav(tx, ty, f);
                    return;
                }
            }
        }

        // Multi-column spatial hit-testing (WS25.1 / MENU-02)
        const regions = this.extractRowRegions(line);
        if (regions.length > 0) {
            if (col >= 0 && regions.length > 1) {
                const matchedRegion = regions.find(r => col >= r.startCol && col <= r.endCol) ||
                                      regions.reduce((best, r) => (col >= r.startCol ? r : best), regions[0]);
                if (matchedRegion && matchedRegion.key) {
                    sendKey(matchedRegion.key);
                    return;
                }
            }
            if (regions[0] && regions[0].key) {
                sendKey(regions[0].key);
                return;
            }
        }

        const tagMatch = line.match(/(?:^|\s+)(?:\[([a-zA-Z0-9*@?])\]|\(([a-zA-Z0-9*@?])\)|([a-zA-Z0-9*@?])[\)\.\:\-])\s+\S/);
        if (tagMatch) {
            const key = tagMatch[1] || tagMatch[2] || tagMatch[3];
            if (key) {
                sendKey(key);
                return;
            }
        }

        if (line.includes('> ')) {
            sendKey('enter');
        } else if (line.includes('-more-') || line.includes('-続く-')) {
            sendKey('space');
        }
    }

    _findPlayerTermCoords(termData, player) {
        if (!termData || !termData.rows) return null;
        const rows = termData.rows;
        const centerCol = (this.cols || 80) / 2;
        const centerRow = (this.rows || 24) / 2;
        let bestCol = -1;
        let bestRow = -1;
        let bestDist = Infinity;

        for (let r = 1; r < rows.length - 1; r++) {
            const rowObj = rows[r];
            const text = rowObj ? (rowObj.g || '') : '';
            for (let c = 12; c < text.length; c++) {
                if (text[c] === '@') {
                    const d = Math.hypot(c - centerCol, r - centerRow);
                    if (d < bestDist) {
                        bestDist = d;
                        bestCol = c;
                        bestRow = rowObj.y !== undefined ? rowObj.y : r;
                    }
                }
            }
        }

        if (bestCol < 0) {
            for (let r = 1; r < rows.length - 1; r++) {
                const rowObj = rows[r];
                const text = rowObj ? (rowObj.g || '') : '';
                const limit = Math.min(12, text.length);
                for (let c = 0; c < limit; c++) {
                    if (text[c] === '@') {
                        const d = Math.hypot(c - centerCol, r - centerRow);
                        if (d < bestDist) {
                            bestDist = d;
                            bestCol = c;
                            bestRow = rowObj.y !== undefined ? rowObj.y : r;
                        }
                    }
                }
            }
        }

        const px = (player && typeof player.x === 'number') ? player.x : (bestCol >= 0 ? bestCol : 0);
        const py = (player && typeof player.y === 'number') ? player.y : (bestRow >= 0 ? bestRow : 0);

        if (bestCol >= 0 && bestRow >= 0) {
            this._vpOx = px - bestCol;
            this._vpOy = py - bestRow;
            this._playerTermCol = bestCol;
            this._playerTermRow = bestRow;
        } else {
            this._vpOx = 0;
            this._vpOy = 0;
            this._playerTermCol = px;
            this._playerTermRow = py;
        }
        return { col: this._playerTermCol, row: this._playerTermRow, ox: this._vpOx, oy: this._vpOy };
    }

    parseAttr(aStr, cellIdx) {
        if (!aStr) return 1;
        const idx = cellIdx * 2;
        if (idx + 1 >= aStr.length) return 1;
        const hi = parseInt(aStr[idx], 16) || 0;
        const lo = parseInt(aStr[idx + 1], 16) || 0;
        const val = (hi << 4) | lo;
        return val & 0x0f; // Low 4 bits is palette index 0-15
    }

    decodeText(str) {
        if (!str) return '';
        if (/[\u3000-\u9faf\uff01-\uff60]/.test(str)) return str;
        if (this.tdSjis) {
            try {
                const bytes = new Uint8Array(str.length);
                let hasSjisLead = false;
                for (let i = 0; i < str.length; i++) {
                    const b = str.charCodeAt(i) & 0xff;
                    bytes[i] = b;
                    if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) hasSjisLead = true;
                }
                if (hasSjisLead) return this.tdSjis.decode(bytes);
            } catch (_) {}
        }
        return str;
    }

    syncRibbonSelection() {
        if (typeof document === 'undefined') return;
        const ribbon = document.getElementById('term-letter-ribbon');
        if (!ribbon) return;
        const btns = ribbon.querySelectorAll('.term-letter-btn');
        btns.forEach((btn) => {
            const isMatch = Boolean(this.selectedKey && btn.dataset.key === this.selectedKey);
            btn.classList.toggle('is-selected', isMatch);
        });
    }

    setSelectedKey(key) {
        if (!key) return;
        this.selectedKey = key;
        if (Array.isArray(this.selectableRegions) && this.selectableRegions.length > 0) {
            const idx = this.selectableRegions.findIndex(r => r.key === key);
            if (idx >= 0) this.selectedIndex = idx;
        }
        this.syncRibbonSelection();
    }

    getSelectedKey() {
        if (this.selectedKey && Array.isArray(this.selectableRegions) && this.selectableRegions.some(r => r.key === this.selectedKey)) {
            return this.selectedKey;
        }
        if (Array.isArray(this.selectableRegions) && this.selectableRegions.length > 0) {
            const idx = (this.selectedIndex >= 0 && this.selectedIndex < this.selectableRegions.length) ? this.selectedIndex : 0;
            return this.selectableRegions[idx].key;
        }
        return null;
    }

    moveSelection(delta) {
        if (!Array.isArray(this.selectableRegions) || this.selectableRegions.length === 0) return null;
        const len = this.selectableRegions.length;
        const cur = (this.selectedIndex >= 0 && this.selectedIndex < len) ? this.selectedIndex : 0;
        this.selectedIndex = (cur + delta + len) % len;
        const active = this.selectableRegions[this.selectedIndex];
        this.selectedKey = active ? active.key : null;

        if (active && typeof window !== 'undefined' && window.MenuRouter && typeof window.MenuRouter.getPending === 'function') {
            const pending = window.MenuRouter.getPending();
            if (pending && pending.step === 'chooser') {
                pending.item = {
                    key: active.key,
                    label: active.label || active.key,
                    glyph: active.glyph || null,
                    display: `[${active.key}]`
                };
            }
        }

        this.syncRibbonSelection();
        if (this.lastTermData) {
            this.render(this.lastTermData);
        }
        return this.selectedKey;
    }

    updateSelectableRegions(termData, mode) {
        this.selectableRegions = [];
        const isMenuMode = (mode === 'item_prompt' || mode === 'store' || mode === 'birth');
        if (!isMenuMode || !termData || !Array.isArray(termData.rows)) {
            this.selectedIndex = -1;
            this.selectedKey = null;
            this.syncRibbonSelection();
            return;
        }

        const seenKeys = new Set();
        let engineSelectedIdx = -1;

        for (let r = 0; r < termData.rows.length && r < this.rows; r++) {
            const rowObj = termData.rows[r];
            const rawLine = rowObj?.g || '';
            const line = this.decodeText(rawLine);
            const regions = this.extractRowRegions(line);
            for (const reg of regions) {
                if (!reg || !reg.key || seenKeys.has(reg.key)) continue;
                seenKeys.add(reg.key);
                const attr0 = this.parseAttr(rowObj?.a || '', reg.startCol);
                const attr1 = this.parseAttr(rowObj?.a || '', reg.startCol + 1);
                const isEngineSelected = (attr0 === 14 || attr1 === 14);
                const idx = this.selectableRegions.length;
                if (isEngineSelected && engineSelectedIdx === -1) {
                    engineSelectedIdx = idx;
                }
                this.selectableRegions.push({
                    row: rowObj.y !== undefined ? rowObj.y : r,
                    key: reg.key,
                    label: reg.label,
                    glyph: reg.glyph || null,
                    startCol: reg.startCol,
                    endCol: reg.endCol,
                    isEngineSelected
                });
            }
        }

        if (this.selectableRegions.length === 0) {
            this.selectedIndex = -1;
            this.selectedKey = null;
            this.syncRibbonSelection();
            return;
        }

        const pending = (typeof window !== 'undefined' && window.MenuRouter && typeof window.MenuRouter.getPending === 'function')
            ? window.MenuRouter.getPending()
            : null;
        if (pending && pending.step === 'chooser' && pending.item && pending.item.key) {
            const pIdx = this.selectableRegions.findIndex(r => r.key === pending.item.key);
            if (pIdx >= 0) {
                this.selectedIndex = pIdx;
                this.selectedKey = pending.item.key;
                this.syncRibbonSelection();
                return;
            }
        }

        if (engineSelectedIdx >= 0) {
            this.selectedIndex = engineSelectedIdx;
            this.selectedKey = this.selectableRegions[engineSelectedIdx].key;
            this.syncRibbonSelection();
            return;
        }

        if (this.selectedKey) {
            const existingIdx = this.selectableRegions.findIndex(r => r.key === this.selectedKey);
            if (existingIdx >= 0) {
                this.selectedIndex = existingIdx;
                this.syncRibbonSelection();
                return;
            }
        }

        this.selectedIndex = 0;
        this.selectedKey = this.selectableRegions[0].key;
        this.syncRibbonSelection();
    }

    render(termData) {
        if (!termData) termData = this.lastTermData;
        if (!termData || !termData.rows) return;
        this.lastTermData = termData;
        this.lastRows = termData.rows;

        const app = (typeof window !== 'undefined' && (window.app || window.__app)) || null;
        const effFrame = app?.currentFrame || app?.lastFrame || app?.getLastFrame?.() || (typeof window !== 'undefined' && window.__lastFrame) || null;

        const mode = this.detectMode(termData);
        if (mode !== this.currentMode) {
            this.currentMode = mode;
            this.resize();
            return; // resize re-invokes render with updated scale metrics
        }

        const scaleFactor = (this.effectiveScale || 1.0) * (this.dpr || 1.0);
        this.ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);

        const w = this.cols * this.charWidth;
        const h = this.rows * this.charHeight;

        // Illuminated Dark Obsidian-Vellum Grimoire Surface (replaces cold CRT black)
        const bgGrad = this.ctx.createRadialGradient(w * 0.5, h * 0.45, w * 0.08, w * 0.5, h * 0.5, w * 0.75);
        bgGrad.addColorStop(0, '#130e0a');
        bgGrad.addColorStop(0.65, '#0c0906');
        bgGrad.addColorStop(1, '#070504');
        this.ctx.fillStyle = bgGrad;
        this.ctx.fillRect(0, 0, w, h);

        this.updateSelectableRegions(termData, mode);

        if (this.selectedIndex >= 0 && this.selectableRegions[this.selectedIndex]) {
            const selReg = this.selectableRegions[this.selectedIndex];
            const sx = Math.max(2, selReg.startCol * this.charWidth - 4);
            const sw = Math.min(w - sx - 2, (selReg.endCol - selReg.startCol + 1) * this.charWidth + 8);
            const sy = selReg.row * this.charHeight;
            this.ctx.fillStyle = 'rgba(218, 172, 84, 0.22)';
            this.ctx.fillRect(sx, sy, sw, this.charHeight);
            this.ctx.strokeStyle = 'rgba(255, 215, 100, 0.68)';
            this.ctx.lineWidth = 1.25;
            this.ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, this.charHeight - 1);
            this.ctx.fillStyle = '#ffd166';
            this.ctx.fillRect(sx, sy + 2, 3, Math.max(4, this.charHeight - 4));
        }

        if ((mode !== 'classic_play' || (effFrame?.ui?.overlay || 0) > 0) && this.hoverRow >= 0 && this.hoverRow < this.rows) {
            const rawHoverLine = this.lastRows[this.hoverRow]?.g || '';
            const hoverLine = this.decodeText(rawHoverLine);
            const regions = this.extractRowRegions(hoverLine);
            let highlightX = 2;
            let highlightW = w - 4;
            if (regions.length > 1 && this.hoverCol >= 0) {
                const activeReg = regions.find(r => this.hoverCol >= r.startCol && this.hoverCol <= r.endCol);
                if (activeReg) {
                    highlightX = Math.max(2, activeReg.startCol * this.charWidth - 4);
                    highlightW = Math.min(w - highlightX - 2, (activeReg.endCol - activeReg.startCol + 1) * this.charWidth + 8);
                }
            }
            const hy = this.hoverRow * this.charHeight;
            this.ctx.fillStyle = 'rgba(218, 172, 84, 0.16)';
            this.ctx.fillRect(highlightX, hy, highlightW, this.charHeight);
            this.ctx.strokeStyle = 'rgba(245, 204, 122, 0.42)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(highlightX + 0.5, hy + 0.5, highlightW - 1, this.charHeight - 1);
        }

        // Gilded Sanctuary Double-Bevel Border
        this.ctx.strokeStyle = 'rgba(218, 172, 84, 0.52)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(1, 1, w - 2, h - 2);
        this.ctx.strokeStyle = 'rgba(255, 232, 175, 0.16)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(4, 4, w - 8, h - 8);

        this.ctx.textBaseline = 'top';

        const isHeng = (typeof window !== 'undefined') &&
            ((window.activeRealm === 'hengband') ||
             (window.__activeRealm === 'hengband') ||
             (window.__app && typeof window.__app.getActiveRealm === 'function' && window.__app.getActiveRealm() === 'hengband') ||
             (termData && termData.realm === 'hengband') ||
             (this.lastTermData && this.lastTermData.realm === 'hengband'));
        const langMode = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';

        for (let r = 0; r < termData.rows.length && r < this.rows; r++) {
            const rowObj = termData.rows[r];
            let text = rowObj.g || '';
            let attrs = rowObj.a || '';
            const trFn = (typeof window !== 'undefined') && (window.translateTerminalRow || (window.HENG_DICT && window.HENG_DICT.translateTerminalRow));
            if (isHeng && typeof trFn === 'function') {
                const tr = trFn(text, attrs, langMode, r);
                text = tr.text;
                attrs = tr.attrs;
            }
            const y = (rowObj.y !== undefined ? rowObj.y : r) * this.charHeight;

            let screenCol = 0;
            for (let c = 0; c < text.length && screenCol < this.cols; c++) {
                const code = text.codePointAt(c);
                const isSurrogate = (code > 0xffff);

                // Full-width CJK characters occupy 2 monospace grid columns
                const isFullWidthCJK = (
                    (code >= 0x1100 && code <= 0x115f) ||
                    (code >= 0x2e80 && code <= 0xa4cf) ||
                    (code >= 0xac00 && code <= 0xd7a3) ||
                    (code >= 0xf900 && code <= 0xfaff) ||
                    (code >= 0xfe30 && code <= 0xfe4f) ||
                    (code >= 0xff01 && code <= 0xff60) ||
                    (code >= 0xffe0 && code <= 0xffe6) ||
                    (code >= 0x20000 && code <= 0x3fffd)
                );

                if (isFullWidthCJK) {
                    const kanji = String.fromCodePoint(code);
                    const colorIdx = this.parseAttr(attrs, screenCol);
                    this.ctx.fillStyle = this.palette[colorIdx] || '#ffffff';
                    this.ctx.font = this.cjkFont || `bold 25px 'BIZ UDGothic', 'MS Gothic', 'Noto Sans CJK JP', 'Meiryo', sans-serif`;
                    // Center the CJK character horizontally in its 2-cell slot (28px) and vertically in the row (28px)
                    const kx = screenCol * this.charWidth + Math.max(0, Math.floor((this.charWidth * 2 - (this.cjkFontSize || 25)) / 2));
                    const ky = y + Math.max(0, Math.floor((this.charHeight - (this.cjkFontSize || 25)) / 2));
                    this.ctx.fillText(kanji, kx, ky);
                    screenCol += 2;
                    if (isSurrogate) c++;
                    continue;
                }

                const ch = text[c];
                if (ch !== ' ' && ch !== '\0') {
                    const colorIdx = this.parseAttr(attrs, screenCol);
                    this.ctx.fillStyle = this.palette[colorIdx] || '#ffffff';
                    this.ctx.font = this.asciiFont || `bold 20px 'Fira Code', 'BIZ UDGothic', monospace`;
                    // Center ASCII character horizontally in its 1-cell slot (14px) and vertically in the row (28px)
                    const ax = screenCol * this.charWidth + 1;
                    const ay = y + Math.max(0, Math.floor((this.charHeight - (this.fontSize || 20)) / 2));
                    this.ctx.fillText(ch, ax, ay);
                }
                screenCol += 1;
            }
        }

        // Sleek translucent gold A* path overlay on Tab Classic Map
        if (effFrame && effFrame.player) {
            this._findPlayerTermCoords(termData, effFrame.player);
        }

        const inputMgr = app?.input || (typeof window !== 'undefined' && window.input) || null;
        const navPath = (this._hoverMapPath && this._hoverMapPath.length > 0)
            ? this._hoverMapPath
            : ((inputMgr && inputMgr._minimapNavPath && inputMgr._minimapNavPath.length > 0) ? inputMgr._minimapNavPath : null);

        const currentOverlay = effFrame?.ui?.overlay ?? (termData.ui?.overlay || 0);
        if (navPath && navPath.length > 0 && currentOverlay === 0 && this._vpOx !== undefined && this._vpOy !== undefined && effFrame && effFrame.player) {
            const isActiveTravel = Boolean(inputMgr && inputMgr._minimapNavPath && inputMgr._minimapNavPath.length > 0);
            const pCol = (this._playerTermCol !== undefined) ? this._playerTermCol : (effFrame.player.x - this._vpOx);
            const pRow = (this._playerTermRow !== undefined) ? this._playerTermRow : (effFrame.player.y - this._vpOy);
            const startCx = (pCol + 0.5) * this.charWidth;
            const startCy = (pRow + 0.5) * this.charHeight;

            this.ctx.save();

            // 1. Dashed Gold Route Polyline (exact Minimap parity)
            this.ctx.strokeStyle = isActiveTravel ? 'rgba(255, 215, 64, 0.92)' : 'rgba(255, 215, 64, 0.68)';
            this.ctx.lineWidth = Math.max(2.0, this.charWidth * 0.16);
            this.ctx.setLineDash([5, 3]);
            this.ctx.beginPath();
            this.ctx.moveTo(startCx, startCy);
            for (let i = 0; i < navPath.length; i++) {
                const step = navPath[i];
                this.ctx.lineTo((step.x - this._vpOx + 0.5) * this.charWidth, (step.y - this._vpOy + 0.5) * this.charHeight);
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // 2. Waypoint Dots & Destination Diamond Beacon + Tile Reticle
            for (let i = 0; i < navPath.length; i++) {
                const step = navPath[i];
                const scCol = step.x - this._vpOx;
                const scRow = step.y - this._vpOy;
                if (scCol >= 0 && scCol < this.cols && scRow >= 0 && scRow < this.rows) {
                    const cx = (scCol + 0.5) * this.charWidth;
                    const cy = (scRow + 0.5) * this.charHeight;
                    if (i === navPath.length - 1) {
                        const bx = scCol * this.charWidth;
                        const by = scRow * this.charHeight;
                        this.ctx.strokeStyle = '#ffd700';
                        this.ctx.lineWidth = 1.5;
                        this.ctx.strokeRect(bx + 1, by + 1, this.charWidth - 2, this.charHeight - 2);
                        this.ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
                        this.ctx.fillRect(bx + 1, by + 1, this.charWidth - 2, this.charHeight - 2);

                        const r = Math.max(3.5, this.charWidth * 0.35);
                        this.ctx.fillStyle = isActiveTravel ? '#ffe066' : 'rgba(255, 224, 102, 0.85)';
                        this.ctx.beginPath();
                        this.ctx.moveTo(cx, cy - r);
                        this.ctx.lineTo(cx + r, cy);
                        this.ctx.lineTo(cx, cy + r);
                        this.ctx.lineTo(cx - r, cy);
                        this.ctx.closePath();
                        this.ctx.fill();
                    } else {
                        this.ctx.fillStyle = isActiveTravel ? 'rgba(255, 215, 0, 0.75)' : 'rgba(255, 215, 0, 0.45)';
                        this.ctx.beginPath();
                        this.ctx.arc(cx, cy, Math.max(2.5, this.charWidth * 0.18), 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }
            }
            this.ctx.restore();
        }

        // Draw 3D Camera Vision Cone & Direction Indicator when player '@' is present
        this.drawVisionCone(termData);

        // Viewport Scroll Alignment: Only auto-align when mode changes or on player tracking
        // (CRITICAL: Never reset scrollLeft while the user is actively dragging or viewing a menu!)
        const viewport = document.getElementById('terminal-viewport');
        if (viewport) {
            const modeChanged = (this.lastMode !== mode);
            this.lastMode = mode;
            const isMenuMode = mode === 'store' || mode === 'item_prompt' || mode === 'birth';

            if (modeChanged) {
                if (isMenuMode) {
                    viewport.scrollLeft = 0;
                    viewport.scrollTop = 0;
                    this.userHasScrolled = false;
                }
            } else if (!isMenuMode && this.zoomLevel > 1.05 && !this.userHasScrolled) {
                // In classic 2D mode, auto-center on player '@' only if user hasn't manually panned away
                let playerCol = -1;
                let playerRow = -1;
                for (let r = 0; r < termData.rows.length; r++) {
                    const rowObj = termData.rows[r];
                    const text = rowObj.g || '';
                    const atIdx = text.indexOf('@');
                    if (atIdx !== -1) {
                        playerCol = atIdx;
                        playerRow = rowObj.y !== undefined ? rowObj.y : r;
                        break;
                    }
                }
                if (playerCol >= 0 && playerRow >= 0) {
                    const cssW = parseFloat(this.canvas.style.width) || (this.cols * this.charWidth);
                    const cssH = parseFloat(this.canvas.style.height) || (this.rows * this.charHeight);
                    const cellW = cssW / this.cols;
                    const cellH = cssH / this.rows;
                    const targetScrollX = Math.round((playerCol + 0.5) * cellW - viewport.clientWidth / 2);
                    const targetScrollY = Math.round((playerRow + 0.5) * cellH - viewport.clientHeight / 2);

                    viewport.scrollLeft = Math.max(0, targetScrollX);
                    viewport.scrollTop = Math.max(0, targetScrollY);
                }
            }
        }
    }

    /**
     * Draw 3D Camera Vision Cone & Orientation Indicators on the Classic Terminal Canvas.
     * Overcomes mental orientation confusion by projecting the player's 3D field of view
     * directly out from the '@' symbol across the 2D dungeon grid.
     */
    drawVisionCone(termData) {
        if (!termData || !termData.rows) return;
        const mode = this.currentMode || 'classic_play';
        // Only draw cone in dungeon play or targeting (never in birth setup or store menus)
        if (mode === 'birth' || mode === 'store') return;

        let playerCol = -1;
        let playerRow = -1;
        for (let r = 0; r < termData.rows.length; r++) {
            const rowObj = termData.rows[r];
            const text = rowObj.g || '';
            const atIdx = text.indexOf('@');
            if (atIdx !== -1) {
                playerCol = atIdx;
                playerRow = rowObj.y !== undefined ? rowObj.y : r;
                break;
            }
        }
        if (playerCol < 0 || playerRow < 0) return;

        const cx = (playerCol + 0.5) * this.charWidth;
        const cy = (playerRow + 0.5) * this.charHeight;

        // In 2D grid coordinates (X right, Y down):
        // Camera yaw 0 is North (0, -1), PI/2 is East (1, 0), PI is South (0, 1), 3PI/2 is West (-1, 0)
        const yaw = this.cameraYaw || 0;
        const dirX = Math.sin(yaw);
        const dirY = -Math.cos(yaw);
        const sideX = -dirY;
        const sideY = dirX;

        const baseAngle = Math.atan2(dirY, dirX);
        const fovAngle = 0.54; // ~62 degree FOV cone matching 3D camera
        const coneDist = Math.max(this.charWidth * 6.2, 85);
        const coneSpread = coneDist * Math.tan(fovAngle);

        const leftTipX = cx + dirX * coneDist + sideX * coneSpread;
        const leftTipY = cy + dirY * coneDist + sideY * coneSpread;
        const rightTipX = cx + dirX * coneDist - sideX * coneSpread;
        const rightTipY = cy + dirY * coneDist - sideY * coneSpread;

        this.ctx.save();

        // 1. Radiant golden cone gradient fill
        const grad = this.ctx.createRadialGradient(cx, cy, 2, cx, cy, coneDist);
        grad.addColorStop(0, 'rgba(255, 215, 0, 0.30)');
        grad.addColorStop(0.6, 'rgba(255, 215, 0, 0.12)');
        grad.addColorStop(1, 'rgba(255, 215, 0, 0.0)');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(leftTipX, leftTipY);
        this.ctx.arc(cx, cy, coneDist, baseAngle - fovAngle, baseAngle + fovAngle);
        this.ctx.lineTo(cx, cy);
        this.ctx.closePath();
        this.ctx.fill();

        // 2. Crisp boundary lines and arc
        this.ctx.strokeStyle = 'rgba(255, 225, 110, 0.50)';
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(leftTipX, leftTipY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(rightTipX, rightTipY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, coneDist, baseAngle - fovAngle, baseAngle + fovAngle);
        this.ctx.stroke();

        // 3. Central forward sightline (dashed during targeting mode)
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.isTargetingMode ? 'rgba(255, 75, 75, 0.90)' : 'rgba(255, 215, 50, 0.65)';
        this.ctx.lineWidth = this.isTargetingMode ? 2.0 : 1.2;
        if (this.isTargetingMode) {
            this.ctx.setLineDash([5, 4]);
        }
        const sightDist = coneDist * (this.isTargetingMode ? 1.75 : 1.0);
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(cx + dirX * sightDist, cy + dirY * sightDist);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // 4. Directional pointer triangle at @ center
        const pointerDist = Math.max(this.charWidth * 0.75, 10);
        const pTipX = cx + dirX * pointerDist;
        const pTipY = cy + dirY * pointerDist;
        const pLeftX = cx - dirX * 3 + sideX * 4.5;
        const pLeftY = cy - dirY * 3 + sideY * 4.5;
        const pRightX = cx - dirX * 3 - sideX * 4.5;
        const pRightY = cy - dirY * 3 - sideY * 4.5;

        this.ctx.fillStyle = '#ffd700';
        this.ctx.beginPath();
        this.ctx.moveTo(pTipX, pTipY);
        this.ctx.lineTo(pLeftX, pLeftY);
        this.ctx.lineTo(pRightX, pRightY);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
    }
}

if (typeof window !== 'undefined') window.WebTerminal = WebTerminal;
if (typeof module !== 'undefined' && module.exports) module.exports = { WebTerminal };

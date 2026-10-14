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

        // Mouse Drag to Pan (Strictly manages view, NEVER interacts with game/menu)
        viewport.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Primary / Left Click
                isMouseDragging = true;
                mouseStartX = e.clientX;
                mouseStartY = e.clientY;
                mouseStartScrollLeft = viewport.scrollLeft;
                mouseStartScrollTop = viewport.scrollTop;
                viewport.style.cursor = 'grabbing';
                if (this.canvas) this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDragging) return;
            const dx = e.clientX - mouseStartX;
            const dy = e.clientY - mouseStartY;
            viewport.scrollLeft = mouseStartScrollLeft - dx;
            viewport.scrollTop = mouseStartScrollTop - dy;
            this.userHasScrolled = true;
        });

        const stopMouseDrag = () => {
            if (isMouseDragging) {
                isMouseDragging = false;
                viewport.style.cursor = 'grab';
                if (this.canvas) this.canvas.style.cursor = 'grab';
            }
        };

        window.addEventListener('mouseup', stopMouseDrag);

        // Hardware-accelerated Touch Gestures: Pinch-to-Zoom & 1-Finger Pan
        // CRITICAL INVARIANT: Any touch in the classic viewport ONLY impacts the view (zoom & pan),
        // and is NEVER interpreted as a game command or row click!
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
                if (e.cancelable) e.preventDefault();
                const dx = e.touches[0].clientX - touchStartX;
                const dy = e.touches[0].clientY - touchStartY;
                viewport.scrollLeft = touchStartScrollLeft - dx;
                viewport.scrollTop = touchStartScrollTop - dy;
                this.userHasScrolled = true;
            }
        }, { passive: false });

        const endTouch = () => {
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

        const isMobileScreen = window.innerWidth <= 768;
        const isMenuMode = mode === 'store' || mode === 'item_prompt' || mode === 'birth';

        // Responsive base scale that fits available viewport
        const viewport = document.getElementById('terminal-viewport');
        const containerW = viewport ? viewport.clientWidth : window.innerWidth;
        const containerH = viewport ? viewport.clientHeight : (window.innerHeight - 100);

        const availW = Math.max(280, containerW || window.innerWidth);
        const availH = Math.max(200, containerH || (window.innerHeight - 100));

        let baseScale;
        if (isMenuMode && isMobileScreen) {
            // For ASCII menus on phones, scale against active content width
            // Birth wizard menus use cols 0-48, stores use cols 0-54
            const activeCols = mode === 'birth' ? 48 : 54;
            const activeContentWidth = activeCols * baseCellWidth;
            const scaleToFitColumns = availW / activeContentWidth;
            baseScale = Math.max(0.60, Math.min(scaleToFitColumns, 1.45));
        } else {
            // Fit full 80x24 terminal screen smoothly on desktop (up to 2.5x)
            baseScale = Math.min(availW / logicalWidth, availH / logicalHeight, 2.5);
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
        if (!this.canvas) return;

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (!rect.height || !this.charHeight) return;
            const offsetY = (e.clientY - rect.top) * ((this.rows * this.charHeight) / rect.height);
            const row = Math.floor(offsetY / this.charHeight);
            if (row >= 0 && row < this.rows) {
                if (this.hoverRow !== row) {
                    this.hoverRow = row;
                    if (this.lastTermData) this.render(this.lastTermData);
                }
            } else if (this.hoverRow !== -1) {
                this.hoverRow = -1;
                if (this.lastTermData) this.render(this.lastTermData);
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            if (this.hoverRow !== -1) {
                this.hoverRow = -1;
                if (this.lastTermData) this.render(this.lastTermData);
            }
        });

        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = this.canvas.getBoundingClientRect();
            if (!rect.height || !this.charHeight) return;
            const offsetY = (e.clientY - rect.top) * ((this.rows * this.charHeight) / rect.height);
            const row = Math.floor(offsetY / this.charHeight);
            this.handleRowClick(row);
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    handleRowClick(row) {
        if (row < 0 || row >= this.rows || !this.lastRows || !this.lastRows[row]) return;
        const rawLine = this.lastRows[row]?.g || '';
        const line = this.decodeText(rawLine);
        const sendKey = (key) => {
            const btn = document.querySelector(`.term-letter-btn[data-key="${key}"]`);
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

        const tagMatch = line.match(/(?:^|\s+)(?:\[([a-zA-Z0-9*@?])\]|\(([a-zA-Z0-9*@?])\)|([a-zA-Z0-9*@?])[\)\.\:\-])\s+\S/);
        if (tagMatch) {
            const key = tagMatch[1] || tagMatch[2] || tagMatch[3];
            if (key) sendKey(key);
        } else if (line.includes('> ')) {
            sendKey('enter');
        } else if (line.includes('-more-') || line.includes('-続く-')) {
            sendKey('space');
        }
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

    render(termData) {
        if (!termData) termData = this.lastTermData;
        if (!termData || !termData.rows) return;
        this.lastTermData = termData;
        this.lastRows = termData.rows;

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

        // Clear canvas with deep dark background
        this.ctx.fillStyle = '#080a0f';
        this.ctx.fillRect(0, 0, w, h);

        if (this.hoverRow >= 0 && this.hoverRow < this.rows) {
            this.ctx.fillStyle = 'rgba(212, 175, 55, 0.14)';
            this.ctx.fillRect(2, this.hoverRow * this.charHeight, w - 4, this.charHeight);
        }

        // Ornate border
        this.ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(1, 1, w - 2, h - 2);

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

window.WebTerminal = WebTerminal;

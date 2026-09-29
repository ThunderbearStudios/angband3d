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
        this.cameraYaw = yaw;
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        this.facingSector = Math.round(normYaw / (Math.PI / 4)) % 8;
        if (this.lastTermData) {
            this.render(this.lastTermData);
        }
    }

    setTargetingMode(active) {
        this.isTargetingMode = Boolean(active);
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
        const btnReset = document.getElementById('btn-term-zoom-reset');
        if (btnReset) {
            btnReset.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            btnReset.title = `Current Zoom: ${Math.round(this.zoomLevel * 100)}% (Click to reset to Fit)`;
        }
    }

    setupZoomControls() {
        const btnZoomIn = document.getElementById('btn-term-zoom-in');
        const btnZoomOut = document.getElementById('btn-term-zoom-out');
        const btnZoomReset = document.getElementById('btn-term-zoom-reset');

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
        if (!termData || !termData.rows) return 'classic_play';
        const fullText = termData.rows.map(r => r.g || '').join(' ').toLowerCase();

        // 1. Birth / Character Setup / Death
        if (fullText.includes('choose a race') ||
            fullText.includes('choose a class') ||
            fullText.includes('choose a sex') ||
            fullText.includes('choose your') ||
            fullText.includes('character creation') ||
            fullText.includes('please select your character') ||
            fullText.includes('select your character traits') ||
            fullText.includes('step back through the birth process') ||
            fullText.includes('race affects stats') ||
            fullText.includes('class affects stats') ||
            fullText.includes('choose how to generate') ||
            fullText.includes('when the world is old') ||
            fullText.includes('press any key to continue') ||
            fullText.includes('use as is') ||
            fullText.includes('to start over') ||
            fullText.includes('r to reroll') ||
            fullText.includes("'s' to start") ||
            fullText.includes('tombstone') ||
            fullText.includes('stat roll') ||
            fullText.includes('point-based') ||
            fullText.includes('roller') ||
            fullText.includes("character's name") ||
            fullText.includes('enter a name') ||
            fullText.includes('enter name') ||
            fullText.includes('accept character history') ||
            fullText.includes('any other key to continue') ||
            fullText.includes('enter character')) {
            return 'birth';
        }

        // 2. Stores & Shops
        if (fullText.includes('store inventory') ||
            fullText.includes('home inventory') ||
            fullText.includes('gold remaining') ||
            fullText.includes('which store') ||
            fullText.includes('storekeeper') ||
            fullText.includes('purchase which item') ||
            fullText.includes('sell which item') ||
            fullText.includes('examine which item')) {
            return 'store';
        }

        // 3. Targeting & Direction Prompts
        if (fullText.includes('target [') ||
            fullText.includes('direction?') ||
            fullText.includes('target:') ||
            fullText.includes('select target') ||
            fullText.includes('target mode') ||
            fullText.includes('choose target')) {
            return 'targeting';
        }

        // 4. Item & Spell Prompts
        if (fullText.includes('inven:') ||
            fullText.includes('equip:') ||
            fullText.includes('quiver:') ||
            fullText.includes('quiver') ||
            fullText.includes('select item:') ||
            fullText.includes('which item?') ||
            fullText.includes('which potion?') ||
            fullText.includes('which scroll?') ||
            fullText.includes('which book?') ||
            fullText.includes('which spell?') ||
            fullText.includes('cast which') ||
            fullText.includes('aim which') ||
            fullText.includes('zap which') ||
            fullText.includes('browse which') ||
            fullText.includes('destroy which') ||
            fullText.includes('take off') ||
            fullText.includes('wear/wield')) {
            return 'item_prompt';
        }

        // 5. Default: Classic Dungeon Exploration
        return 'classic_play';
    }

    resize() {
        // High-DPI logical font metrics maintaining standard 80x24 aspect ratio
        const baseCellWidth = 14;
        const baseCellHeight = Math.floor(baseCellWidth * 1.75); // 24.5px
        const logicalWidth = this.cols * baseCellWidth; // 1120px
        const logicalHeight = this.rows * baseCellHeight; // 588px

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = logicalWidth * dpr;
        this.canvas.height = logicalHeight * dpr;
        this.charWidth = baseCellWidth;
        this.charHeight = baseCellHeight;
        this.fontSize = Math.floor(this.charHeight * 0.82);

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
            // Fit full 80x24 terminal screen
            baseScale = Math.min(availW / logicalWidth, availH / logicalHeight, 1.0);
        }

        const effectiveScale = baseScale * this.zoomLevel;
        const cssW = Math.floor(logicalWidth * effectiveScale);
        const cssH = Math.floor(logicalHeight * effectiveScale);

        this.canvas.style.width = `${cssW}px`;
        this.canvas.style.height = `${cssH}px`;
        this.canvas.style.maxWidth = 'none'; // Allow viewport horizontal scrolling
        this.canvas.style.flexShrink = '0';
        this.canvas.style.objectFit = 'contain';
        // When canvas is wider than viewport, align flush left (0 margin) so user can drag to see all columns
        this.canvas.style.margin = cssW > availW ? '0' : '0 auto';

        this.ctx.scale(dpr, dpr);

        if (this.lastTermData) {
            this.render(this.lastTermData);
        }
    }

    setupMouseEvents() {
        // STRICT ARCHITECTURAL INVARIANT:
        // Clicks, zooms or interactions of any kind inside a classic view or menu
        // DO NOT interact with the menu but ONLY manage the view (panning and zooming).
        // All classic interactions MUST be through the navigation keys provided outside of the classic view.
        if (this.canvas) {
            this.canvas.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            this.canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
        }
    }

    handleRowClick(row, col) {
        // STRICT ARCHITECTURAL INVARIANT:
        // Clicks, zooms or interactions of any kind inside a classic view or menu
        // DO NOT interact with the menu but ONLY manage the view (panning and zooming).
        // All classic interactions MUST be through the navigation keys provided outside of the classic view.
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

    render(termData) {
        if (!termData || !termData.rows) return;
        this.lastTermData = termData;
        this.lastRows = termData.rows;

        const mode = this.detectMode(termData);
        if (mode !== this.currentMode) {
            this.currentMode = mode;
            this.resize();
            return; // resize re-invokes render with updated scale metrics
        }

        const w = this.cols * this.charWidth;
        const h = this.rows * this.charHeight;

        // Clear canvas with deep dark background
        this.ctx.fillStyle = '#080a0f';
        this.ctx.fillRect(0, 0, w, h);

        // Ornate border
        this.ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(1, 1, w - 2, h - 2);

        this.ctx.font = `${this.fontSize}px 'Fira Code', 'Courier New', monospace`;
        this.ctx.textBaseline = 'top';

        for (let r = 0; r < termData.rows.length && r < this.rows; r++) {
            const rowObj = termData.rows[r];
            const text = rowObj.g || '';
            const attrs = rowObj.a || '';
            const y = (rowObj.y !== undefined ? rowObj.y : r) * this.charHeight;

            for (let c = 0; c < text.length && c < this.cols; c++) {
                const ch = text[c];
                if (ch === ' ' || ch === '\0') continue;

                const colorIdx = this.parseAttr(attrs, c);
                this.ctx.fillStyle = this.palette[colorIdx] || '#ffffff';
                this.ctx.fillText(ch, c * this.charWidth + 1, y + 2);
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

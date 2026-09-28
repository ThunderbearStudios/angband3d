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
        this.minZoom = 0.6;
        this.maxZoom = 2.5;
        this.zoomStep = 0.25;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupMouseEvents();
        this.setupZoomControls();
    }

    setZoom(level) {
        const target = Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(level * 100) / 100));
        if (Math.abs(target - this.zoomLevel) < 0.01) return;
        this.zoomLevel = target;
        this.updateZoomUI();
        this.resize();
    }

    zoomIn() {
        this.setZoom(this.zoomLevel + this.zoomStep);
    }

    zoomOut() {
        this.setZoom(this.zoomLevel - this.zoomStep);
    }

    resetZoom() {
        this.setZoom(1.0);
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

        // Viewport pinch-to-zoom and wheel zoom
        const viewport = document.getElementById('terminal-viewport');
        if (viewport) {
            viewport.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 0.15 : -0.15;
                    this.setZoom(this.zoomLevel + delta);
                }
            }, { passive: false });

            let initialPinchDist = null;
            let initialZoom = 1.0;

            viewport.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    initialPinchDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    initialZoom = this.zoomLevel;
                }
            }, { passive: true });

            viewport.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && initialPinchDist) {
                    const currentDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const factor = currentDist / initialPinchDist;
                    this.setZoom(initialZoom * factor);
                }
            }, { passive: true });

            const endPinch = () => {
                initialPinchDist = null;
            };
            viewport.addEventListener('touchend', endPinch, { passive: true });
            viewport.addEventListener('touchcancel', endPinch, { passive: true });
        }
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

        // Responsive base scale that fits available viewport without overflow
        const viewport = document.getElementById('terminal-viewport');
        const containerW = viewport ? viewport.clientWidth : window.innerWidth;
        const containerH = viewport ? viewport.clientHeight : (window.innerHeight - 100);

        const availW = Math.max(280, Math.min((containerW || window.innerWidth) * 0.98, 1200));
        const availH = Math.max(200, Math.min((containerH || (window.innerHeight - 100)) * 0.95, 750));
        const baseScale = Math.min(availW / logicalWidth, availH / logicalHeight, 1.0);

        const effectiveScale = baseScale * this.zoomLevel;
        const cssW = Math.floor(logicalWidth * effectiveScale);
        const cssH = Math.floor(logicalHeight * effectiveScale);

        this.canvas.style.width = `${cssW}px`;
        this.canvas.style.height = `${cssH}px`;
        this.canvas.style.maxWidth = this.zoomLevel > 1.05 ? 'none' : '100%';
        this.canvas.style.flexShrink = '0';
        this.canvas.style.objectFit = 'contain';

        this.ctx.scale(dpr, dpr);

        if (this.lastTermData) {
            this.render(this.lastTermData);
        }
    }

    setupMouseEvents() {
        const handleInteraction = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scaleX = this.canvas.width / (rect.width * dpr);
            const scaleY = this.canvas.height / (rect.height * dpr);

            const clickX = (clientX - rect.left) * scaleX;
            const clickY = (clientY - rect.top) * scaleY;

            const col = Math.floor(clickX / this.charWidth);
            const row = Math.floor(clickY / this.charHeight);

            this.handleRowClick(row, col);
        };

        this.canvas.addEventListener('click', (e) => {
            handleInteraction(e.clientX, e.clientY);
        });

        // Touch event mapping for phones and tablets
        this.canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length > 0) {
                if (e.cancelable) e.preventDefault();
                handleInteraction(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            }
        }, { passive: false });
    }

    handleRowClick(row, col) {
        if (!this.lastRows || !this.lastRows[row]) {
            // Clicking anywhere advances if on a prompt screen
            this.onSelectKey('enter');
            return;
        }

        const line = this.lastRows[row].g || '';

        // If screen says "Press any key to continue" or "-more-", advance
        if (line.toLowerCase().includes('press any key') || line.toLowerCase().includes('-more-')) {
            this.onSelectKey('enter');
            return;
        }

        // Check if row has a letter or symbol menu item e.g. "a) Human", "@) Random", "*) All"
        const match = line.match(/^\s*([a-zA-Z0-9@*?])[\)\.\:]/);
        if (match) {
            const fullText = (this.lastRows || []).map(r => r.g || '').join(' ').toLowerCase();
            const hasStoreText = fullText.includes('store inventory') || fullText.includes('home inventory') || fullText.includes('gold remaining');
            const isItemPrompt = fullText.includes('inven:') || fullText.includes('equip:') || fullText.includes('select item:') || fullText.includes('which item?') || fullText.includes('which potion?') || fullText.includes('which scroll?');
            const inStore = hasStoreText && !isItemPrompt;
            if (inStore) {
                // If top-level store command prompt, clicking an inventory item initiates purchase ('p' + letter)
                const alreadyPromptingItem = fullText.includes('which item') || fullText.includes('purchase which') || fullText.includes('sell which') || fullText.includes('examine which');
                if (alreadyPromptingItem) {
                    this.onSelectKey(match[1]);
                } else {
                    this.onSelectKey('p');
                    setTimeout(() => this.onSelectKey(match[1]), 50);
                }
                return;
            }
            this.onSelectKey(match[1]);
            return;
        }

        // Check if row contains an indented or right-column menu item (e.g. Death Screen menu beside Tombstone)
        const generalMatch = line.match(/([a-zA-Z0-9@*?])[\)\.\:]\s+[A-Za-z]/);
        if (generalMatch) {
            this.onSelectKey(generalMatch[1]);
            return;
        }

        // Check if row indicates random selection with @
        if (line.match(/^\s*@\b/) || line.includes('@ to generate') || line.includes('@ for random') || line.includes('@) Random')) {
            this.onSelectKey('@');
            return;
        }

        if (line.includes('[y/n]') || line.toLowerCase().includes('are you sure')) {
            this.onSelectKey('y');
            return;
        }

        // Default click advances
        this.onSelectKey('enter');
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
    }
}

window.WebTerminal = WebTerminal;

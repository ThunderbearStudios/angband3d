/**
 * terminal-lexer.js — Classic 80x24 Terminal Palette, Vector Box-Drawing, Cursor & Token Lexer (v12.2.0)
 * Provides 32-color WEB-SCOTOPIC-02 palette, high-nibble highlight decoding, crisp pixel-aligned
 * box-drawing glyphs, term.cx/cy cursor rendering, and inline interactive prompt token hitboxes.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TerminalLexer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Full 32-color Angband 4.2.6 palette calibrated to WEB-SCOTOPIC-02 dark-slate comfort band
    const PALETTE_32 = Object.freeze([
        '#14171d', //  0: Dark Slate background (zero OLED smear)
        '#e6eaf0', //  1: Warm Ivory / White (<= 12.5:1 anti-halation ceiling)
        '#94a3b8', //  2: Slate (>= 5.2:1 WCAG AA)
        '#f59e0b', //  3: Orange
        '#ef4444', //  4: Red
        '#2dd4bf', //  5: Green / Emerald
        '#60a5fa', //  6: Blue
        '#b47b52', //  7: Umber
        '#687285', //  8: Light Dark / Stone
        '#cbd5e1', //  9: Light Slate
        '#c084fc', // 10: Light Purple / Violet
        '#fde047', // 11: Yellow
        '#fb7185', // 12: Light Red / Coral
        '#4ade80', // 13: Light Green
        '#38bdf8', // 14: Light Blue / Selection Highlight
        '#e2b079', // 15: Light Umber
        '#a855f7', // 16: Purple
        '#8b5cf6', // 17: Violet
        '#14b8a6', // 18: Teal
        '#9a7b56', // 19: Mud
        '#fef08a', // 20: Light Yellow
        '#f472b6', // 21: Magenta-Pink
        '#5eead4', // 22: Light Teal
        '#ddd6fe', // 23: Pale Violet
        '#fbcfe8', // 24: Light Pink
        '#eab308', // 25: Mustard
        '#93c5fd', // 26: Blue Slate
        '#3b82f6', // 27: Deep Light Blue
        '#475569', // 28: Shade
        '#dc2626', // 29: Crimson
        '#d97706', // 30: Amber
        '#cbd5e1'  // 31: Silver
    ]);

    // Box-drawing bitmask: N=1, E=2, S=4, W=8, DOUBLE=16
    const BOX_MAP = {
        '\u2500': 2 | 8,               // ─
        '\u2501': 2 | 8,               // ━
        '\u2502': 1 | 4,               // │
        '\u2503': 1 | 4,               // ┃
        '\u250c': 2 | 4,               // ┌
        '\u2510': 4 | 8,               // ┐
        '\u2514': 1 | 2,               // └
        '\u2518': 1 | 8,               // ┘
        '\u251c': 1 | 2 | 4,           // ├
        '\u2524': 1 | 4 | 8,           // ┤
        '\u252c': 2 | 4 | 8,           // ┬
        '\u2534': 1 | 2 | 8,           // ┴
        '\u253c': 1 | 2 | 4 | 8,       // ┼
        '\u2550': 2 | 8 | 16,          // ═
        '\u2551': 1 | 4 | 16,          // ║
        '\u2554': 2 | 4 | 16,          // ╔
        '\u2557': 4 | 8 | 16,          // ╗
        '\u255a': 1 | 2 | 16,          // ╚
        '\u255d': 1 | 8 | 16,          // ╝
        '\u2560': 1 | 2 | 4 | 16,      // ╠
        '\u2563': 1 | 4 | 8 | 16,      // ╣
        '\u2566': 2 | 4 | 8 | 16,      // ╦
        '\u2569': 1 | 2 | 8 | 16,      // ╩
        '\u256c': 1 | 2 | 4 | 8 | 16   // ╬
    };

    function decodeCellAttr(aStr, cellIdx) {
        if (!aStr) return { fgIdx: 1, bgHighlight: false };
        const idx = cellIdx * 2;
        if (idx + 1 >= aStr.length) return { fgIdx: 1, bgHighlight: false };
        const hi = parseInt(aStr[idx], 16) || 0;
        const lo = parseInt(aStr[idx + 1], 16) || 0;
        const val = (hi << 4) | lo;
        return {
            fgIdx: val & 0x1f,
            bgHighlight: (val & 0xe0) !== 0
        };
    }

    function isBoxGlyph(ch) {
        return Boolean(ch && BOX_MAP[ch]);
    }

    function drawBoxGlyph(ctx, ch, x, y, cw, chH, color) {
        const mask = BOX_MAP[ch];
        if (!mask || !ctx) return false;
        const cx = Math.floor(x + cw * 0.5) + 0.5;
        const cy = Math.floor(y + chH * 0.5) + 0.5;
        const offsets = (mask & 16) ? [-1.5, 1.5] : [0];
        ctx.save();
        ctx.strokeStyle = color || '#94a3b8';
        ctx.lineWidth = 1.25;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i];
            ctx.beginPath();
            if (mask & 1) { ctx.moveTo(cx + off, y); ctx.lineTo(cx + off, cy); }
            if (mask & 4) { ctx.moveTo(cx + off, cy); ctx.lineTo(cx + off, y + chH); }
            if (mask & 8) { ctx.moveTo(x, cy + off); ctx.lineTo(cx, cy + off); }
            if (mask & 2) { ctx.moveTo(cx, cy + off); ctx.lineTo(x + cw, cy + off); }
            ctx.stroke();
        }
        ctx.restore();
        return true;
    }

    function drawCursor(ctx, termData, cw, chH, cols, rows) {
        if (!ctx || !termData || termData.cursor === false) return;
        const cx = typeof termData.cx === 'number' ? termData.cx : (typeof termData.cursor_x === 'number' ? termData.cursor_x : -1);
        const cy = typeof termData.cy === 'number' ? termData.cy : (typeof termData.cursor_y === 'number' ? termData.cursor_y : -1);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
        const px = cx * cw;
        const py = cy * chH;
        ctx.save();
        ctx.fillStyle = 'rgba(230, 195, 92, 0.20)';
        ctx.fillRect(px + 0.5, py + 1, cw - 1, chH - 2);
        ctx.strokeStyle = 'rgba(245, 208, 105, 0.88)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 0.75, py + 1.25, Math.max(2, cw - 1.5), Math.max(4, chH - 2.5));
        ctx.restore();
    }

    function extractInteractiveTokens(line, cols = 80) {
        if (!line) return [];
        const tokens = [];
        const pushTok = (key, startCol, endCol, label) => {
            if (startCol >= 0 && endCol >= startCol && startCol < cols) {
                tokens.push({ key, startCol, endCol: Math.min(cols - 1, endCol), label: label || key });
            }
        };

        // 1. [y/n], (y/n), [y/n/q], (y/n/q) split into individual letter hitboxes
        const ynRe = /[\[\(]\s*([yY])\s*\/\s*([nN])(?:\s*\/\s*([qQ]))?\s*[\]\)]/g;
        let m;
        while ((m = ynRe.exec(line)) !== null) {
            const base = m.index;
            const full = m[0];
            const slash1 = full.indexOf('/');
            const slash2 = full.indexOf('/', slash1 + 1);
            pushTok('y', base, base + Math.max(1, slash1 - 1), 'Yes [y]');
            if (slash2 > slash1) {
                pushTok('n', base + slash1 + 1, base + slash2 - 1, 'No [n]');
                pushTok('q', base + slash2 + 1, base + full.length - 1, 'Quit [q]');
            } else {
                pushTok('n', base + slash1 + 1, base + full.length - 1, 'No [n]');
            }
        }

        // 2. --More-- / -more- / -続く- / (Page X of Y) -> space
        const moreRe = /(?:--more--|-more-|-続く-|\(page\s+\d+\s+of\s+\d+\))/gi;
        while ((m = moreRe.exec(line)) !== null) {
            pushTok('space', m.index, m.index + m[0].length - 1, 'Continue [Space]');
        }

        // 3. [Esc] / (Esc) / ESC) -> escape
        const escRe = /(?:\[\s*esc\s*\]|\(\s*esc\s*\)|\besc\b\))/gi;
        while ((m = escRe.exec(line)) !== null) {
            pushTok('escape', m.index, m.index + m[0].length - 1, 'Back [Esc]');
        }

        // 4. Inline switcher shortcuts: [/], / for ..., [|], | for ..., [*], * for ..., [?]
        const inlineSwitchers = [
            { re: /(?:\[\/\]|\/\s+for\s+\w+)/gi, key: '/', label: 'Switch [/]' },
            { re: /(?:\[\|\]|\|\s+for\s+\w+)/gi, key: '|', label: 'Quiver [|]' },
            { re: /(?:\[\*\]|\*\s+for\s+\w+|'\*'\s+to\s+\w+)/gi, key: '*', label: 'List / Target [*]' },
            { re: /(?:\[\?\]|'\?'\s+for\s+help)/gi, key: '?', label: 'Help [?]' }
        ];
        for (let i = 0; i < inlineSwitchers.length; i++) {
            const spec = inlineSwitchers[i];
            while ((m = spec.re.exec(line)) !== null) {
                pushTok(spec.key, m.index, m.index + m[0].length - 1, spec.label);
            }
        }

        return tokens;
    }

    return {
        PALETTE_32,
        decodeCellAttr,
        isBoxGlyph,
        drawBoxGlyph,
        drawCursor,
        extractInteractiveTokens
    };
}));

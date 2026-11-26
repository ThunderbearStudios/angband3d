'use strict';

const { checkTextSanity } = require('./protocol_oracle');

class UiOracle {
    constructor({ realm, lang = 'en' }) {
        this.realm = realm;
        this.lang = lang;
        this.channelsTested = new Set();
        this.flickerViolations = 0;
    }

    auditSnapshot(snap, { idleTurn = false } = {}) {
        const issues = [];
        const add = (severity, code, message, extra = null) => {
            issues.push({ severity, realm: this.realm, subsystem: 'ui', code, message, extra });
        };

        if (!snap) return issues;

        for (const ex of (snap.cdpRuntimeExceptions || [])) {
            add('P0', 'P0_UNCAUGHT_JS_EXCEPTION', ex);
        }
        for (const err of (snap.probe?.errors || [])) {
            add('P0', 'P0_WINDOW_ERROR', `${err.type}: ${err.message}`);
        }

        // Dual-reality ScreenContext parity (L19)
        if (snap.inPlay && snap.frame && snap.frame.needsTerminal !== null) {
            const expectedTerm = Boolean(snap.frame.needsTerminal);
            const actualTerm = Boolean(snap.dom?.termVisible);
            if (expectedTerm !== actualTerm) {
                add('P1', 'P1_DUAL_REALITY_DESYNC', `needsTerminal=${expectedTerm} but #terminal-container visible=${actualTerm} (phase=${snap.frame.phase}, overlay=${snap.frame.ui?.overlay}, more=${snap.frame.ui?.more})`);
            }
        }

        // Zero-flicker HUD memoization check (L25/L26/L58)
        if (idleTurn && snap.probe?.domMutations) {
            const m = snap.probe.domMutations;
            if (m.footerBadges > 8 || m.charDrawer > 8) {
                this.flickerViolations++;
                if (this.flickerViolations >= 2) {
                    add('P2', 'P2_HUD_DOM_CHURN', `Excessive idle-turn DOM mutations: footerBadges=${m.footerBadges}, charDrawer=${m.charDrawer}`);
                }
            }
        }

        // Layout & A11y geometry checks
        if (snap.dom) {
            if (snap.dom.overflowX) {
                add('P2', 'P2_HORIZONTAL_OVERFLOW', 'Document scrollWidth exceeds viewport width');
            }
            if (snap.hudLayout) {
                if ((snap.hudLayout.charPanelOverflowX || 0) > 2 || (snap.hudLayout.statsStripOverflowX || 0) > 2) {
                    add('P1', 'P1_HUD_PANEL_CLIPPING', `HUD left panel overflows horizontally: #char-panel=${snap.hudLayout.charPanelOverflowX}px, #stats-strip=${snap.hudLayout.statsStripOverflowX}px`);
                }
                if (snap.hudLayout.compassOverlapsTopbar) {
                    add('P1', 'P1_HUD_OVERLAP', `#yasd-compass-tape (${JSON.stringify(snap.hudLayout.compassRect)}) overlaps top navbar (${JSON.stringify(snap.hudLayout.topbarRect)})`);
                }
            }
            if (Array.isArray(snap.dom.offscreenControls) && snap.dom.offscreenControls.length > 0) {
                add('P2', 'P2_OFFSCREEN_CONTROLS', `Visible buttons extend outside viewport: ${snap.dom.offscreenControls.join(', ')}`);
            }
            if (Array.isArray(snap.dom.missingAria) && snap.dom.missingAria.length > 0) {
                add('P2', 'P2_MISSING_ARIA_LABEL', `Visible buttons missing text/aria-label/title: ${snap.dom.missingAria.join(', ')}`);
            }
            checkTextSanity(snap.dom.hudTextSample || '', this.realm, 'hud_dom', issues);
        }

        return issues;
    }

    /**
     * Drives the real 7-channel input matrix via CDP keyboard/mouse events.
     */
    async run7ChannelMatrix(browser) {
        const issues = [];
        const add = (severity, code, message, extra = null) => {
            issues.push({ severity, realm: this.realm, subsystem: 'ui_channels', code, message, extra });
        };

        const ensureIdlePlay = async () => {
            for (let i = 0; i < 4; i++) {
                const s = await browser.snapshot();
                if (!s?.frame) break;
                const overlay = s.frame.ui?.overlay || 0;
                const awaiting = s.frame.ui?.awaiting_command;
                if (!s.dom?.itemSheetOpen && !s.dom?.cmdPaletteOpen && overlay === 0 && awaiting && !s.frame.ui?.more) {
                    return s;
                }
                const seq = s.frame.seq || 0;
                await browser.pressKey(s.frame.ui?.more ? 'enter' : 'escape');
                await browser.waitFrameAdvance(seq, 2500);
            }
            return browser.snapshot();
        };

        try {
            // 1. Keyboard classic key ('i' -> Escape)
            let s0 = await ensureIdlePlay();
            const seq0 = s0?.frame?.seq || 0;
            await browser.pressKey('i');
            await browser.waitFrameAdvance(seq0, 4000);
            let s1 = await browser.snapshot();
            if ((s1?.frame?.ui?.overlay || 0) > 0 || s1?.dom?.termVisible) {
                this.channelsTested.add('keyboard');
            } else {
                add('P1', 'P1_CHANNEL_KEYBOARD_FAIL', 'Keyboard "i" did not open inventory overlay');
            }
            await ensureIdlePlay();

            // 2. Dock button (#btn-inventory click -> Escape)
            s0 = await ensureIdlePlay();
            const seqDock = s0?.frame?.seq || 0;
            const dockRes = await browser.clickSelector('#btn-inventory');
            if (!dockRes.ok) {
                add(dockRes.code === 'P1_UI_OCCLUDED' ? 'P1' : 'P2', dockRes.code || 'P2_DOCK_BTN_MISSING', `Dock #btn-inventory click failed: ${JSON.stringify(dockRes)}`);
            } else {
                await browser.waitFrameAdvance(seqDock, 4000);
                s1 = await browser.snapshot();
                if ((s1?.frame?.ui?.overlay || 0) > 0 || s1?.dom?.termVisible) {
                    this.channelsTested.add('dock_button');
                } else {
                    add('P1', 'P1_CHANNEL_DOCK_NO_EFFECT', 'Clicking #btn-inventory did not open inventory');
                }
            }
            await ensureIdlePlay();

            // 3. Item Sheet (<dialog id="item-sheet">) via toggleItemSheet or key/button
            await browser.evaluate(`window.__app && window.__app.toggleItemSheet && window.__app.toggleItemSheet(document.getElementById('btn-inventory'))`);
            await new Promise((r) => setTimeout(r, 250));
            s1 = await browser.snapshot();
            if (s1?.dom?.itemSheetOpen) {
                this.channelsTested.add('item_sheet');
                const closeClick = await browser.clickSelector('#item-sheet .item-sheet-close');
                if (!closeClick.ok) await browser.pressKey('escape');
                await new Promise((r) => setTimeout(r, 200));
                const afterSheet = await browser.snapshot();
                if (afterSheet?.dom?.itemSheetOpen) {
                    add('P1', 'P1_ITEM_SHEET_STUCK_OPEN', 'Item sheet dialog did not close cleanly');
                }
            } else {
                add('P2', 'P2_ITEM_SHEET_NOT_OPENED', 'Item sheet dialog did not open');
            }

            // 4. Command Palette (<dialog id="command-palette-modal">) via #btn-action-more -> #btn-command-palette or Ctrl+K
            let palRes = await browser.clickSelector('#btn-command-palette');
            if (!palRes.ok) {
                await browser.clickSelector('#btn-action-more').catch(() => {});
                await new Promise((r) => setTimeout(r, 150));
                palRes = await browser.clickSelector('#btn-command-palette');
            }
            if (!palRes.ok) {
                await browser.pressKey('C-k');
                palRes = { ok: true, via: 'Ctrl+K' };
            }
            await new Promise((r) => setTimeout(r, 250));
            s1 = await browser.snapshot();
            if (palRes.ok && s1?.dom?.cmdPaletteOpen) {
                this.channelsTested.add('command_palette');
                await browser.typeText('inven');
                await browser.pressKey('escape');
                await new Promise((r) => setTimeout(r, 200));
                const afterPal = await browser.snapshot();
                if (afterPal?.dom?.cmdPaletteOpen) {
                    await browser.clickSelector('#btn-cmd-palette-close');
                }
            } else {
                add('P1', 'P1_CHANNEL_COMMAND_PALETTE_FAIL', `Command palette failed to open (${JSON.stringify(palRes)})`);
            }
            await ensureIdlePlay();

            // 5. Prompt Mirror (#prompt-mirror) — trigger 'q' or 'd' or 'o' and check mirror / click cancel
            s0 = await ensureIdlePlay();
            const seqMir = s0?.frame?.seq || 0;
            await browser.pressKey('d');
            await browser.waitFrameAdvance(seqMir, 3000);
            s1 = await browser.snapshot();
            if (s1?.dom?.promptMirrorVisible) {
                this.channelsTested.add('prompt_mirror');
                await browser.clickSelector('#prompt-mirror [data-mirror-key="escape"], #prompt-mirror .prompt-mirror-crt-btn');
            }
            await ensureIdlePlay();

            // 6. Terminal row click (open inventory in terminal and click a row)
            s0 = await ensureIdlePlay();
            const seqTerm = s0?.frame?.seq || 0;
            await browser.pressKey('i');
            await browser.waitFrameAdvance(seqTerm, 3000);
            const termClickRes = await browser.clickSelector('#terminal-container canvas, #terminal-container .term-row, #terminal-container pre');
            if (termClickRes.ok) {
                this.channelsTested.add('terminal_row_click');
            }
            await ensureIdlePlay();

            // 7. WASD mode toggle (#btn-footer-dpad -> #btn-wasd-toggle or Alt+W)
            let wasdClick = await browser.clickSelector('#btn-wasd-toggle');
            if (!wasdClick.ok) {
                await browser.clickSelector('#btn-footer-dpad').catch(() => {});
                await new Promise((r) => setTimeout(r, 200));
                wasdClick = await browser.clickSelector('#btn-wasd-toggle');
            }
            if (!wasdClick.ok) {
                await browser.pressKey('Alt+w');
                wasdClick = { ok: true, via: 'Alt+W' };
            }
            await new Promise((r) => setTimeout(r, 200));
            s1 = await browser.snapshot();
            if (wasdClick.ok && s1?.dom?.wasdPressed) {
                this.channelsTested.add('wasd_toggle');
                const seqW = s1?.frame?.seq || 0;
                await browser.pressKey('w');
                await browser.waitFrameAdvance(seqW, 3000);
                // Toggle back off cleanly
                const offClick = await browser.clickSelector('#btn-wasd-toggle');
                if (!offClick.ok) await browser.pressKey('Alt+w');
                await new Promise((r) => setTimeout(r, 150));
                const sOff = await browser.snapshot();
                if (sOff?.dom?.wasdPressed) {
                    add('P1', 'P1_WASD_TOGGLE_STUCK', 'WASD toggle failed to deactivate on second click');
                }
            } else {
                add('P1', 'P1_CHANNEL_WASD_FAIL', `WASD toggle did not activate (${JSON.stringify(wasdClick)})`);
            }
        } catch (err) {
            add('P1', 'P1_7CHANNEL_MATRIX_ERROR', `7-channel matrix exception: ${err.message}`);
        }

        return { issues, channelsTested: Array.from(this.channelsTested) };
    }
}

module.exports = {
    UiOracle
};

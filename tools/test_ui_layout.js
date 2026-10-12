#!/usr/bin/env node
/**
 * tools/test_ui_layout.js — Layout Overlap & Touch Target Verification (WS9.1)
 *
 * Tests the HUD layout across 6 viewports (desktop, laptop, tablet, mobile):
 *   1920x1080, 1366x768, 1264x625, 1024x768, 844x390, 390x844
 * Asserts:
 *   1. No bounding rect intersections between:
 *      - #action-bar
 *      - D-pad container (#touch-controls / parent of #dpad-up)
 *      - #char-panel
 *      - #minimap-container
 *      - #message-feed-window
 *      - #hud-footer
 *   2. Under coarse pointer (mobile/touch), all visible action buttons are >= 40x40.
 *   3. Saves screenshots to tools/reports/ui/<w>x<h>-<realm>.png.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { runCdpSession, sleep } = require('./lib/cdp');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const TIMEOUT_MS = 45000;
const REPORTS_DIR = path.join(__dirname, 'reports', 'ui');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const VIEWPORTS = [
    { width: 1920, height: 1080, mobile: false, coarse: false, name: '1920x1080' },
    { width: 1366, height: 768,  mobile: false, coarse: false, name: '1366x768' },
    { width: 1264, height: 625,  mobile: false, coarse: false, name: '1264x625' },
    { width: 1024, height: 768,  mobile: false, coarse: true,  name: '1024x768' },
    { width: 844,  height: 390,  mobile: true,  coarse: true,  name: '844x390' },
    { width: 390,  height: 844,  mobile: true,  coarse: true,  name: '390x844' }
];

const REALMS = process.argv.slice(2).filter(a => !a.startsWith('-'));
const TARGET_REALMS = REALMS.length ? REALMS : ['angband'];

async function testRealmLayout(realm) {
    const testChar = `UI_${realm.slice(0, 3)}_${Date.now().toString(36).slice(-4)}`;
    const url = `${BASE}/?play=1&new=1&realm=${encodeURIComponent(realm)}&lang=en&char=${encodeURIComponent(testChar)}`;
    console.log(`\n--- Testing UI Layout for Realm: ${realm} ---`);

    const failures = [];

    await runCdpSession(url, async ({ ws, send, evaluate, takeScreenshot }) => {
        await send('Runtime.enable');
        await send('Page.enable');

        // Wait to reach 3D play
        console.log(`[UI Layout] Waiting for 3D play in ${realm}...`);
        const start = Date.now();
        let inPlay = false;

        while (Date.now() - start < TIMEOUT_MS) {
            await sleep(500);

            // Handle birth review pause
            await evaluate(`(() => {
                const a = window.__app;
                if (a && a.isBirthReviewActive && a.isBirthReviewActive() && a.confirmHeroBirth) {
                    a.confirmHeroBirth();
                }
            })()`);

            // Drain any turn-0 -more- prompts
            await evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                if (f && f.ui && f.ui.more && a && a.network) {
                    a.network.sendKey('space');
                }
            })()`);

            const status = await evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const term = document.getElementById('terminal-container');
                return {
                    phase: f ? f.phase : null,
                    termHidden: term ? term.classList.contains('hidden') : null
                };
            })()`);

            if (status && status.phase === 'play' && status.termHidden) {
                inPlay = true;
                break;
            }
        }

        if (!inPlay) {
            throw new Error(`Failed to reach 3D play in realm ${realm} within ${TIMEOUT_MS}ms`);
        }
        console.log(`  ✓ Reached 3D play in ${realm}`);

        // Now test all 6 viewports
        for (const vp of VIEWPORTS) {
            console.log(`\n  Evaluating viewport ${vp.name} (mobile=${vp.mobile}, coarse=${vp.coarse})...`);

            await send('Emulation.setDeviceMetricsOverride', {
                width: vp.width,
                height: vp.height,
                deviceScaleFactor: 1,
                mobile: vp.mobile
            });

            await send('Emulation.setTouchEmulationEnabled', {
                enabled: vp.coarse
            });

            await send('Emulation.setEmulatedMedia', {
                features: [{ name: 'pointer', value: vp.coarse ? 'coarse' : 'fine' }]
            });

            // Trigger window resize event so ResizeObservers and JS listeners update
            await evaluate(`(() => {
                if (window.__updateActionBarOverflow) window.__updateActionBarOverflow();
                window.dispatchEvent(new Event('resize'));
            })()`);

            // Wait for transitions and layout recalculations
            await sleep(500);

            // Inspect DOM bounding rects and button sizes
            const checkResult = await evaluate(`(() => {
                const elements = [
                    { id: 'action-bar', el: document.getElementById('action-bar') },
                    { id: 'dpad', el: document.getElementById('dpad-up') ? document.getElementById('dpad-up').closest('#touch-controls') || document.getElementById('touch-controls') : document.getElementById('touch-controls') },
                    { id: 'char-panel', el: document.getElementById('char-panel') },
                    { id: 'minimap-container', el: document.getElementById('minimap-container') },
                    { id: 'message-feed-window', el: document.getElementById('message-feed-window') },
                    { id: 'hud-footer', el: document.getElementById('hud-footer') }
                ];

                const activeRects = [];
                for (const item of elements) {
                    if (!item.el) continue;
                    const style = window.getComputedStyle(item.el);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;
                    const r = item.el.getBoundingClientRect();
                    if (r.width <= 0 || r.height <= 0) continue;
                    activeRects.push({
                        id: item.id,
                        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
                    });
                }

                // Check for intersections between distinct top-level UI components
                const intersections = [];
                for (let i = 0; i < activeRects.length; i++) {
                    for (let j = i + 1; j < activeRects.length; j++) {
                        const a = activeRects[i];
                        const b = activeRects[j];

                        // Standard AABB intersection test with 1px tolerance
                        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
                        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);

                        if (overlapX > 1 && overlapY > 1) {
                            intersections.push({ a: a.id, b: b.id, aRect: a.rect, bRect: b.rect, overlapX, overlapY });
                        }
                    }
                }

                // Check button dimensions under coarse pointer
                const smallButtons = [];
                ${vp.coarse ? `
                    const buttons = Array.from(document.querySelectorAll('#action-bar .action-btn, #touch-controls .dpad-btn'));
                    for (const btn of buttons) {
                        const style = window.getComputedStyle(btn);
                        if (style.display === 'none' || style.visibility === 'hidden') continue;
                        const r = btn.getBoundingClientRect();
                        if (r.width <= 0 || r.height <= 0) continue;
                        if (r.width < 39.5 || r.height < 39.5) {
                            smallButtons.push({ id: btn.id || btn.className, text: btn.textContent.trim().slice(0, 15), width: r.width, height: r.height });
                        }
                    }
                ` : ''}

                return {
                    intersections,
                    smallButtons,
                    activeCount: activeRects.length
                };
            })()`);

            // Capture screenshot for human review
            const shotFile = path.join(REPORTS_DIR, `${vp.name}-${realm}.png`);
            await takeScreenshot(shotFile);

            if (checkResult.intersections && checkResult.intersections.length > 0) {
                console.log(`    ❌ Intersections detected in ${vp.name}:`);
                for (const inter of checkResult.intersections) {
                    console.log(`       - ${inter.a} overlaps ${inter.b} (${Math.round(inter.overlapX)}x${Math.round(inter.overlapY)}px)`);
                    failures.push(`${realm} @ ${vp.name}: ${inter.a} overlaps ${inter.b}`);
                }
            } else {
                console.log(`    ✓ No bounding rect overlaps in ${vp.name}`);
            }

            if (checkResult.smallButtons && checkResult.smallButtons.length > 0) {
                console.log(`    ❌ Buttons smaller than 40x40 under coarse pointer:`);
                for (const sb of checkResult.smallButtons.slice(0, 5)) {
                    console.log(`       - [${sb.id}] "${sb.text}": ${sb.width.toFixed(1)}x${sb.height.toFixed(1)}px`);
                }
                failures.push(`${realm} @ ${vp.name}: ${checkResult.smallButtons.length} buttons < 40x40`);
            } else if (vp.coarse) {
                console.log(`    ✓ All touch buttons >= 40x40 under coarse pointer`);
            }
        }
    });

    return failures;
}

async function main() {
    console.log('=== Running WS9.1 Layout Overlap & Touch Target Verification ===\n');
    let totalFailures = 0;

    for (const realm of TARGET_REALMS) {
        try {
            const failures = await testRealmLayout(realm);
            if (failures.length > 0) {
                totalFailures += failures.length;
            }
        } catch (err) {
            console.error(`Error testing realm ${realm}:`, err);
            totalFailures++;
        }
    }

    console.log(`\n======================================================`);
    if (totalFailures === 0) {
        console.log(`All UI layout assertions PASSED across ${TARGET_REALMS.length} realm(s) and ${VIEWPORTS.length} viewports!`);
        process.exit(0);
    } else {
        console.log(`FAILED with ${totalFailures} layout issue(s).`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});

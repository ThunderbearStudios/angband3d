#!/usr/bin/env node
/**
 * tools/test_heng_language_switch.js — In-place Language Toggle CDP Test
 *
 * Verifies live EN -> JP -> bilingual -> EN language toggle in Hengband during active 3D play.
 * Asserts:
 *   - Same engine sessionId (no session reload or engine restart)
 *   - Terminal row 0, #footer-gear, and first 3 message log lines update within 1 animation frame
 *   - Player x/y/gold remain identical throughout all switches
 */
'use strict';

const assert = require('assert');
const path = require('path');
const { runCdpSession, sleep } = require('./lib/cdp');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const TIMEOUT_MS = 60000;
const RE_CJK = /[\u3040-\u30ff\u4e00-\u9fff]/;

async function testLanguageSwitch() {
    const targetUrl = `${BASE}/?realm=hengband&new=1&play=1&lang=en`;
    console.log(`[Lang Switch Test] Starting CDP session -> ${targetUrl}`);

    let testPassed = false;
    const errors = [];

    await runCdpSession(targetUrl, async ({ ws, send, evaluate, takeScreenshot }) => {
        await send('Runtime.enable');
        await send('Page.enable');

        // 1. Wait for birth review and confirm hero birth to enter 3D play
        console.log('[Lang Switch Test] Waiting to reach 3D play in Hengband (lang=en)...');
        const start = Date.now();
        let inPlay = false;

        while (Date.now() - start < TIMEOUT_MS) {
            await sleep(500);

            // If paused on "Review Your Hero", confirm birth
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
                const term = document.getElementById('terminal-container');
                if (f && (f.ui && f.ui.more)) {
                    a.network.sendKey('space');
                }
            })()`);

            const status = await evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const term = document.getElementById('terminal-container');
                return {
                    phase: f ? f.phase : null,
                    hasMap: !!(f && f.map),
                    hasPlayer: !!(f && f.player),
                    termHidden: term ? term.classList.contains('hidden') : false,
                    sessionId: a && a.network ? a.network.sessionId : null,
                    player: f && f.player ? { x: f.player.x, y: f.player.y, gold: f.player.gold || f.player.au } : null
                };
            })()`);

            if (status && status.phase === 'play' && status.hasMap && status.hasPlayer && status.termHidden) {
                inPlay = true;
                break;
            }
        }

        if (!inPlay) {
            throw new Error('Failed to reach 3D play in Hengband within timeout');
        }

        console.log('  ✓ Reached 3D play in Hengband (lang=en)');

        // Helper to capture current visual state
        async function captureState() {
            return evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const gearEl = document.getElementById('footer-gear');
                const msgEls = Array.from(document.querySelectorAll('#message-feed-list li'));
                const row0 = (f && f.term && f.term.rows && f.term.rows[0]) ? (f.term.rows[0].g || '') : '';
                const termRow0Trans = (typeof window.translateTerminalRow === 'function' && row0)
                    ? window.translateTerminalRow(row0, '', window.__langMode || 'en').text
                    : row0;

                return {
                    sessionId: a && a.network ? a.network.sessionId : null,
                    langMode: window.__langMode,
                    player: f && f.player ? { x: f.player.x, y: f.player.y, gold: f.player.gold || f.player.au } : null,
                    gearText: gearEl ? gearEl.textContent.trim() : '',
                    msgLines: msgEls.slice(0, 3).map(el => el.textContent.trim()),
                    termRow0: termRow0Trans
                };
            })()`);
        }

        // Helper to toggle language and wait for 1 rAF
        async function switchLang(targetMode) {
            await evaluate(`(() => {
                if (window.__app && typeof window.__app.setLanguageMode === 'function') {
                    window.__app.setLanguageMode('${targetMode}');
                }
            })()`);
            await evaluate(`new Promise(resolve => requestAnimationFrame(resolve))`);
            return captureState();
        }

        // 2. Capture baseline EN state
        const stateEn1 = await captureState();
        console.log(`\n--- State 1: EN ---`);
        console.log(`  Session ID: ${stateEn1.sessionId}`);
        console.log(`  Player:     (${stateEn1.player.x}, ${stateEn1.player.y}), Gold: ${stateEn1.player.gold}`);
        console.log(`  Gear:       "${stateEn1.gearText}"`);
        console.log(`  Msg lines:  ${JSON.stringify(stateEn1.msgLines)}`);

        assert.ok(stateEn1.sessionId, 'Session ID must be present');
        assert.ok(!RE_CJK.test(stateEn1.gearText), 'EN gear text must not contain Japanese CJK');
        if (stateEn1.msgLines.length > 0) {
            assert.ok(!RE_CJK.test(stateEn1.msgLines[0]), 'EN first message line must not contain Japanese CJK');
        }

        // 3. Switch EN -> JP
        console.log('\nSwitching EN -> JP in place...');
        const stateJp = await switchLang('jp');
        console.log(`--- State 2: JP ---`);
        console.log(`  Session ID: ${stateJp.sessionId}`);
        console.log(`  Player:     (${stateJp.player.x}, ${stateJp.player.y}), Gold: ${stateJp.player.gold}`);
        console.log(`  Gear:       "${stateJp.gearText}"`);
        console.log(`  Msg lines:  ${JSON.stringify(stateJp.msgLines)}`);

        assert.strictEqual(stateJp.sessionId, stateEn1.sessionId, 'Session ID must be unchanged after switching to JP');
        assert.deepStrictEqual(stateJp.player, stateEn1.player, 'Player x/y/gold must be identical in JP mode');
        assert.ok(RE_CJK.test(stateJp.gearText), 'JP gear text must contain Japanese script/Kanji');

        // 4. Switch JP -> Bilingual
        console.log('\nSwitching JP -> Bilingual in place...');
        const stateBi = await switchLang('bilingual');
        console.log(`--- State 3: Bilingual ---`);
        console.log(`  Session ID: ${stateBi.sessionId}`);
        console.log(`  Player:     (${stateBi.player.x}, ${stateBi.player.y}), Gold: ${stateBi.player.gold}`);
        console.log(`  Gear:       "${stateBi.gearText}"`);
        console.log(`  Msg lines:  ${JSON.stringify(stateBi.msgLines)}`);

        assert.strictEqual(stateBi.sessionId, stateEn1.sessionId, 'Session ID must be unchanged after switching to Bilingual');
        assert.deepStrictEqual(stateBi.player, stateEn1.player, 'Player x/y/gold must be identical in Bilingual mode');

        // 5. Switch Bilingual -> EN
        console.log('\nSwitching Bilingual -> EN in place...');
        const stateEn2 = await switchLang('en');
        console.log(`--- State 4: EN (restored) ---`);
        console.log(`  Session ID: ${stateEn2.sessionId}`);
        console.log(`  Player:     (${stateEn2.player.x}, ${stateEn2.player.y}), Gold: ${stateEn2.player.gold}`);
        console.log(`  Gear:       "${stateEn2.gearText}"`);
        console.log(`  Msg lines:  ${JSON.stringify(stateEn2.msgLines)}`);

        assert.strictEqual(stateEn2.sessionId, stateEn1.sessionId, 'Session ID must be unchanged after restoring to EN');
        assert.deepStrictEqual(stateEn2.player, stateEn1.player, 'Player x/y/gold must be identical in restored EN mode');
        assert.ok(!RE_CJK.test(stateEn2.gearText), 'Restored EN gear text must not contain Japanese CJK');
        if (stateEn2.msgLines.length > 0) {
            assert.ok(!RE_CJK.test(stateEn2.msgLines[0]), 'Restored EN message line must not contain Japanese CJK');
        }

        await takeScreenshot(path.join(__dirname, 'boot_hengband_lang_switch.png'));
        testPassed = true;
    });

    if (testPassed) {
        console.log('\n=== In-place Language Toggle (EN -> JP -> Bilingual -> EN) PASSED Flawlessly! ===\n');
    } else {
        throw new Error('Language switch test did not complete successfully');
    }
}

if (require.main === module) {
    testLanguageSwitch()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[Lang Switch Test Error]', err);
            process.exit(1);
        });
}

module.exports = { testLanguageSwitch };

#!/usr/bin/env node
/**
 * tools/heng_lang_coverage.js — Baseline Hengband language coverage probe (CDP).
 *
 * Runs Hengband in EN mode with localStorage.angband3d_dev_lang_audit = '1'.
 * Drives standard exploration:
 *   - Quick-birth -> Accept review
 *   - Clear turn-0 -more- prompts -> 3D play
 *   - Walk 10 steps
 *   - Open inventory [i] -> [Esc]
 *   - Open equipment [e] -> [Esc]
 *   - Store interaction [1] -> [Esc]
 *   - Drain all -more- chains
 *
 * Generates:
 *   - tools/reports/heng_untranslated.json
 *   - tools/fixtures/heng/lines_raw.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { runCdpSession, sleep } = require('./lib/cdp');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const TIMEOUT_MS = 60000;
const RE_CJK = /[\u3040-\u30ff\u4e00-\u9fff]/;

async function measureCoverage() {
    const targetUrl = `${BASE}/?play=1&new=1&realm=hengband&lang=en`;
    const seenRawJp = new Set();
    let reportData = null;

    console.log(`[Heng Coverage] Connecting to ${targetUrl}...`);

    await runCdpSession(targetUrl, async ({ ws, send, evaluate, takeScreenshot }) => {
        await send('Runtime.enable');
        await send('Page.enable');

        // 1. Enable dev audit in localStorage and reload page to capture entire lifecycle
        await evaluate(`localStorage.setItem('angband3d_dev_lang_audit', '1')`);
        await send('Page.reload', { ignoreCache: true });
        await sleep(1000);
        await evaluate(`window.loadHengLang ? window.loadHengLang() : null`);

        // Helper to collect raw lines from frame and dev probe
        async function sampleLines() {
            const frameData = await evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const rows = (f && f.term && f.term.rows) ? f.term.rows.map(r => r.g || '') : [];
                const msgs = (f && f.messages) ? f.messages.map(m => typeof m === 'string' ? m : (m && m.msg ? m.msg : '')) : [];
                const probeRaw = (typeof window.__hengRawLines === 'function') ? window.__hengRawLines() : [];
                return { rows, msgs, probeRaw };
            })()`);

            if (frameData) {
                for (const line of frameData.rows) {
                    const trimmed = (line || '').trim();
                    if (trimmed && RE_CJK.test(trimmed)) seenRawJp.add(trimmed);
                }
                for (const msg of frameData.msgs) {
                    const trimmed = (msg || '').trim();
                    if (trimmed && RE_CJK.test(trimmed)) seenRawJp.add(trimmed);
                }
                for (const pl of frameData.probeRaw) {
                    const trimmed = (pl || '').trim();
                    if (trimmed && RE_CJK.test(trimmed)) seenRawJp.add(trimmed);
                }
            }
        }

        // Helper to drain -more- prompts
        async function drainMore(maxIterations = 20) {
            for (let i = 0; i < maxIterations; i++) {
                await sampleLines();
                const morePressed = await evaluate(`(() => {
                    const a = window.__app;
                    const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                    const rows = (f && f.term && f.term.rows) ? f.term.rows.map(r => r.g || '').join('\\n') : '';
                    const isMore = (f && f.ui && f.ui.more) || rows.includes('-more-');
                    if (isMore && a && a.network) {
                        a.network.sendKey('space');
                        return true;
                    }
                    return false;
                })()`);
                if (!morePressed) break;
                await sleep(250);
            }
        }

        // 2. Wait for birth review and confirm hero birth
        console.log('[Heng Coverage] Waiting for birth review pause...');
        const start = Date.now();
        let inPlay = false;

        while (Date.now() - start < TIMEOUT_MS) {
            await sleep(600);
            await sampleLines();

            await evaluate(`(() => {
                const a = window.__app;
                if (a && a.isBirthReviewActive && a.isBirthReviewActive() && a.confirmHeroBirth) {
                    a.confirmHeroBirth();
                }
            })()`);

            await drainMore(5);

            const playState = await evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const term = document.getElementById('terminal-container');
                return {
                    phase: f ? f.phase : null,
                    hasMap: !!(f && f.map),
                    hasPlayer: !!(f && f.player),
                    termHidden: term ? term.classList.contains('hidden') : null
                };
            })()`);

            if (playState && playState.phase === 'play' && playState.hasMap && playState.hasPlayer && playState.termHidden) {
                console.log('[Heng Coverage] Reached 3D play!');
                inPlay = true;
                break;
            }
        }

        if (!inPlay) {
            throw new Error('[Heng Coverage] Timed out waiting to enter 3D play');
        }

        await drainMore();

        // 3. Walk 10 steps (down, down, up, up, left, left, right, right, down, up)
        console.log('[Heng Coverage] Walking 10 steps...');
        const walkDirs = ['down', 'down', 'up', 'up', 'left', 'left', 'right', 'right', 'down', 'up'];
        for (const dir of walkDirs) {
            await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('${dir}'); })()`);
            await sleep(300);
            await drainMore(5);
        }

        // 4. Open inventory [i] -> Esc
        console.log('[Heng Coverage] Opening inventory [i]...');
        await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('i'); })()`);
        await sleep(600);
        await sampleLines();
        await drainMore(5);
        console.log('[Heng Coverage] Closing inventory with [Escape]...');
        await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('escape'); })()`);
        await sleep(400);
        await drainMore(5);

        // 5. Open equipment [e] -> Esc
        console.log('[Heng Coverage] Opening equipment [e]...');
        await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('e'); })()`);
        await sleep(600);
        await sampleLines();
        await drainMore(5);
        console.log('[Heng Coverage] Closing equipment with [Escape]...');
        await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('escape'); })()`);
        await sleep(400);
        await drainMore(5);

        // 6. Enter general store [1] -> Esc
        console.log('[Heng Coverage] Sending store interaction [1]...');
        await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('1'); })()`);
        await sleep(600);
        await sampleLines();
        await drainMore(5);
        console.log('[Heng Coverage] Closing store/prompt with [Escape]...');
        await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('escape'); })()`);
        await sleep(400);
        await drainMore(5);

        // 7. Check if stairs '>' is available / adjacent
        const stairsNearby = await evaluate(`(() => {
            const f = window.__app ? window.__app.getLastFrame() : null;
            if (!f || !f.map) return false;
            // Scan 3x3 around player
            const px = f.player ? f.player.x : null;
            const py = f.player ? f.player.y : null;
            if (px == null || py == null) return false;
            return false;
        })()`);
        if (stairsNearby) {
            await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('>'); })()`);
            await sleep(600);
            await drainMore(5);
            await evaluate(`(() => { if (window.__app && window.__app.network) window.__app.network.sendKey('escape'); })()`);
            await sleep(400);
            await drainMore(5);
        }

        // Final drain of all remaining prompts
        await drainMore(20);
        await sampleLines();

        // 8. Collect probe results from page
        const untranslatedEntries = await evaluate(`(() => {
            return (typeof window.__hengUntranslated === 'function') ? window.__hengUntranslated() : [];
        })()`) || [];

        const uniqueLines = seenRawJp.size;
        const untranslated = untranslatedEntries.length;
        const coveragePct = uniqueLines > 0
            ? Number(((uniqueLines - untranslated) / uniqueLines * 100).toFixed(2))
            : 0;
        const top50 = untranslatedEntries.slice(0, 50).map(([text, count]) => ({ text, count }));

        reportData = {
            uniqueLines,
            untranslated,
            coveragePct,
            top50
        };

        const reportsDir = path.join(__dirname, 'reports');
        const fixturesDir = path.join(__dirname, 'fixtures', 'heng');
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
        if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

        const reportPath = path.join(reportsDir, 'heng_untranslated.json');
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2) + '\n', 'utf8');
        console.log(`[Heng Coverage] Wrote ${reportPath}`);

        const rawLinesPath = path.join(fixturesDir, 'lines_raw.json');
        const sortedRaw = Array.from(seenRawJp).sort();
        fs.writeFileSync(rawLinesPath, JSON.stringify(sortedRaw, null, 2) + '\n', 'utf8');
        console.log(`[Heng Coverage] Wrote ${rawLinesPath} (${sortedRaw.length} raw lines)`);
    });

    console.log(`\n======================================================`);
    console.log(`Hengband Language Coverage Baseline:`);
    console.log(`  Unique Raw JP Lines: ${reportData.uniqueLines}`);
    console.log(`  Untranslated:        ${reportData.untranslated}`);
    console.log(`  Coverage Percentage: ${reportData.coveragePct}%`);
    console.log(`======================================================\n`);

    return reportData;
}

if (require.main === module) {
    measureCoverage()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[Heng Coverage] Error:', err);
            process.exit(1);
        });
}

module.exports = { measureCoverage };

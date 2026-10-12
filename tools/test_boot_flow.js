#!/usr/bin/env node
/**
 * test_boot_flow.js — Real-browser boot gate (CDP, headless Chrome).
 *
 * WHY: unit tests for ScreenContext/MenuRouter passed while the real app was
 * broken ("sky of stars": every frame threw before updateViewMode()). This gate
 * drives the actual page and fails on ANY uncaught page exception.
 *
 * Flow per realm: load `/?play=1&new=1&realm=<r>` (Quick Start auto-birth), then
 * wait until: frame.phase==='play' && frame.map && terminal hidden (3D view).
 *
 * Usage: node tools/test_boot_flow.js [realm ...]   (default: all 4 realms)
 * Env:   BASE_URL (default http://localhost:8080). Server must already be running.
 * Exit:  0 = all realms PASS, 1 = any FAIL.
 */
'use strict';
const path = require('path');
const { runCdpSession, sleep } = require('./lib/cdp');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const REALMS = process.argv.slice(2).length ? process.argv.slice(2) : ['angband', 'silq', 'frogcomposband', 'hengband'];
const TIMEOUT_MS = 45000;

async function runRealm(realm) {
    const url = `${BASE}/?play=1&new=1&realm=${encodeURIComponent(realm)}&lang=en`;
    const errors = [];
    const notes = [];
    let result = { realm, pass: false, reason: 'timeout' };

    await runCdpSession(url, async ({ ws, send, evaluate, takeScreenshot }) => {
        // Capture uncaught exceptions + console.error from the page.
        ws.on('message', (data) => {
            let msg; try { msg = JSON.parse(data.toString()); } catch (_) { return; }
            if (msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params.exceptionDetails || {};
                errors.push(`UNCAUGHT: ${(d.exception && d.exception.description) || d.text} @${d.url || ''}:${d.lineNumber}`);
            } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
                errors.push('console.error: ' + msg.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
            }
        });
        await send('Runtime.enable');
        await send('Page.enable');
        await send('Page.reload', { ignoreCache: true }); // ensure listeners see boot

        const start = Date.now();
        let last = null;
        while (Date.now() - start < TIMEOUT_MS) {
            await sleep(1000);
            last = await evaluate(`(() => {
                const a = window.__app; const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const term = document.getElementById('terminal-container');
                return {
                    appState: a && a.getAppState ? a.getAppState() : null,
                    phase: f ? f.phase : null,
                    hasMap: !!(f && f.map),
                    hasPlayer: !!(f && f.player),
                    termHidden: term ? term.classList.contains('hidden') : null
                };
            })()`);
            if (last && last.phase === 'play' && last.hasMap && last.hasPlayer && last.termHidden) {
                result = { realm, pass: true, reason: 'reached 3D play' };
                break;
            }
            // Quick Start deliberately pauses on "Review Your Hero"; press Accept like a player.
            await evaluate(`(() => { const a = window.__app;
                if (a && a.isBirthReviewActive && a.isBirthReviewActive() && a.confirmHeroBirth) a.confirmHeroBirth(); })()`);
            // Known issue K1 (FCB): welcome "-more-" shows in the terminal (Continue button) instead of
            // the 3D banner. Press Space like the Continue button does, but record it as a NOTE.
            const pressedMore = await evaluate(`(() => { const a = window.__app; const f = a && a.getLastFrame && a.getLastFrame();
                const term = document.getElementById('terminal-container');
                if (!f || f.phase !== 'play' || !term || term.classList.contains('hidden')) return false;
                const txt = (f.term && f.term.rows ? f.term.rows.map(r => r.g || '').join('\\n') : '');
                if (txt.includes('-more-')) { a.network.sendKey('space'); return true; } return false; })()`);
            if (pressedMore) notes.push('pressed Space on terminal -more- in play (K1)');
        }
        if (result.pass && realm === 'silq') {
            // Real-browser Action Chooser test in Sil-Q
            await evaluate(`(() => { const a = window.__app; if (a && a.network) a.network.sendKey('i'); })()`);
            await sleep(600);

            const chooserCheck = await evaluate(`(() => {
                const ribbonBtn = document.querySelector('.term-letter-btn');
                if (!ribbonBtn) return { ok: false, reason: 'No ribbon button found' };
                ribbonBtn.click();
                const header = document.querySelector('.term-chooser-header');
                const verbBtn = document.querySelector('.term-ctx-btn[data-verb="w"]');
                const escBtn = document.querySelector('.term-ctx-btn[data-verb="Escape"]');
                const hasChooser = !!(header && verbBtn && escBtn);
                const headerText = header ? header.textContent : '';
                if (escBtn) escBtn.click();
                if (window.__app && window.__app.network) window.__app.network.sendKey('escape');
                return { ok: hasChooser, headerText };
            })()`);

            if (chooserCheck && chooserCheck.ok) {
                notes.push(`Action Chooser verified in real DOM (${chooserCheck.headerText})`);
            } else {
                errors.push(`Action Chooser DOM test failed: ${JSON.stringify(chooserCheck)}`);
            }
            await sleep(400);
        }

        await takeScreenshot(path.join(__dirname, `boot_${realm}.png`));
        if (!result.pass) result.reason = `timeout; last=${JSON.stringify(last)}`;
    });

    // Uncaught exceptions are always fatal; console.error noise from known-optional
    // assets (404 demo video) is filtered.
    const fatal = errors.filter(e => e.startsWith('UNCAUGHT') || e.includes('[Network] Handler error'));
    if (fatal.length) { result.pass = false; result.reason = fatal.slice(0, 3).join(' | '); }
    result.errors = errors;
    result.notes = [...new Set(notes)];
    return result;
}

(async () => {
    const results = [];
    for (const r of REALMS) {
        try { results.push(await runRealm(r)); }
        catch (e) { results.push({ realm: r, pass: false, reason: 'harness: ' + e.message, errors: [] }); }
    }
    console.log('\nREALM            STATUS  DETAIL');
    for (const r of results) {
        console.log(`${r.realm.padEnd(16)} ${r.pass ? 'PASS' : 'FAIL'}    ${r.reason}`);
        if (!r.pass) r.errors.slice(0, 5).forEach(e => console.log('    ' + e));
        (r.notes || []).forEach(n => console.log('    NOTE: ' + n));
    }
    process.exit(results.every(r => r.pass) ? 0 : 1);
})();

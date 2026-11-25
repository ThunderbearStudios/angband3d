#!/usr/bin/env node
/**
 * tools/test_wave3c_primitives_aaa.js
 *
 * Wave 3C Verification Suite:
 *  - 10 modals converted to native <dialog closedby="any"> + #item-sheet + #yasd-settings-dialog + Safari closedBy fallback
 *  - Popover API (popover="auto") + commandfor/command + feature-detected Invokers fallback + @supports anchor positioning
 *  - Named inline-size Container Queries on 4 resizable HUD panels (hud-hero, hud-log, hud-chronicle, hud-minimap)
 *  - content-visibility: hidden + inert cached tabs (activateCachedTab unit check + HTML/CSS rules)
 *  - document.startViewTransition wrapper (runViewTransition + prefers-reduced-motion bypass) wired on [Tab] & Realm Cards
 *  - AAA HUD ergonomics: collapsed #top-right-bar (#btn-hud-panels + #hud-panels-popover), 8-slot SVG hotbar, 1-row .chronicle-folio-bar, zero STEP 1/2 pills, portrait viewport reclaim (~52.8% at 360x640), 3-step FTUE pips
 *  - Gamepad L3/R3/LB/RB + Camera-Relative Vi-keys (h/j/k/l/y/u/b/n) auto-ON in Rogue/NetHack/DCSS/Brogue
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const readRel = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const YasdPrimitives = require('../server/public/js/web-primitives.js');
const GamepadController = require('../server/public/js/gamepad.js');

function run() {
    console.log('\n[Wave 3C] Auditing Native Web Primitives & AAA Ergonomics...');

    const html = readRel('server/public/index.html');
    const tok = readRel('server/public/css/tokens.css');
    const hsk = readRel('server/public/css/hud-skin.css');
    const ch = readRel('server/public/css/chronicle.css');
    const mob = readRel('server/public/css/mobile-console.css');
    const primJs = readRel('server/public/js/web-primitives.js');
    const appJs = readRel('server/public/js/app.js');
    const inpJs = readRel('server/public/js/input.js');
    const hudJs = readRel('server/public/js/hud.js');
    const setJs = readRel('server/public/js/settings-modal.js');
    const telJs = readRel('server/public/js/hud-telemetry.js');

    // 1. Native <dialog closedby="any"> conversions + Safari fallback
    const dialogIds = [
        'death-modal', 'load-modal', 'pause-modal', 'guide-modal', 'pwa-modal',
        'demo-modal', 'queue-modal', 'realm-selector-modal', 'command-palette-modal',
        'chronicle-sketch-modal', 'item-sheet'
    ];
    for (const id of dialogIds) {
        const re = new RegExp(`<dialog\\b[^>]*\\bid="${id}"[^>]*\\bclosedby="any"`, 'i');
        assert(re.test(html), `index.html <dialog id="${id}" closedby="any"> missing`);
    }
    assert(setJs.includes("setAttribute('closedby', 'any')"), 'settings-modal.js must set closedby="any"');
    assert(
        primJs.includes("'closedBy' in HTMLDialogElement.prototype"),
        'web-primitives.js must provide Safari closedBy click-outside fallback'
    );
    assert(tok.includes('dialog.yasd-native-dialog::backdrop') && !/dialog\.yasd-native-dialog::backdrop[\s\S]{0,120}backdrop-filter\s*:\s*blur/i.test(tok), 'Native dialog ::backdrop must not use blur');

    // 2. Popover API + Invoker Commands + Anchor Positioning
    for (const pid of ['quick-volume-popover', 'action-more-popover', 'hud-panels-popover']) {
        assert(new RegExp(`id="${pid}"[^>]*\\bpopover="auto"`, 'i').test(html), `${pid} must declare popover="auto"`);
    }
    assert(html.includes('commandfor="hud-panels-popover" command="toggle-popover"'), 'index.html must declare commandfor on #btn-hud-panels');
    assert(html.includes('commandfor="action-more-popover" command="toggle-popover"'), 'index.html must declare commandfor on #btn-action-more');
    assert(html.includes('commandfor="quick-volume-popover" command="toggle-popover"'), 'index.html must declare commandfor on audio config triggers');
    assert(
        primJs.includes("'commandForElement' in HTMLButtonElement.prototype"),
        'web-primitives.js must feature-detect commandForElement for polyfill/fallback'
    );
    assert(
        tok.includes('@supports (anchor-name: --x)') && tok.includes('position-area: block-end') && tok.includes('position-try-fallbacks: flip-block'),
        'tokens.css must gate CSS Anchor Positioning inside @supports'
    );

    // 3. Named inline-size Container Queries
    for (const cname of ['hud-hero', 'hud-log', 'hud-chronicle', 'hud-minimap']) {
        assert(tok.includes(`container-name: ${cname};`), `tokens.css missing named container ${cname}`);
        assert(tok.includes(`@container ${cname} (`), `tokens.css missing @container query for ${cname}`);
    }

    // 4. content-visibility: hidden + inert cached tabs
    assert(tok.includes('content-visibility: hidden;') && tok.includes('.guide-tab-content.tab-cached-inactive'), 'tokens.css missing content-visibility: hidden tab cache rule');
    assert(appJs.includes('activateCachedTab(guideContents'), 'app.js must use activateCachedTab for guide tabs');
    assert(hudJs.includes('activateCachedTab(this.deathContents'), 'hud.js must use activateCachedTab for death tabs');

    // Mock DOM unit check for activateCachedTab
    const makePanel = () => {
        const attrs = {};
        const classes = new Set();
        return {
            classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
            setAttribute: (k, v) => { attrs[k] = String(v); },
            removeAttribute: (k) => { delete attrs[k]; },
            getAttribute: (k) => attrs[k],
            hasAttribute: (k) => Object.prototype.hasOwnProperty.call(attrs, k)
        };
    };
    const p0 = makePanel(), p1 = makePanel(), p2 = makePanel();
    YasdPrimitives.activateCachedTab([p0, p1, p2], 1, { untilFound: true });
    assert.strictEqual(p1.classList.contains('active'), true);
    assert.strictEqual(p1.hasAttribute('inert'), false);
    assert.strictEqual(p0.hasAttribute('inert'), true);
    assert.strictEqual(p0.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(p2.getAttribute('hidden'), 'until-found');

    // 5. View Transitions + Reduced Motion gate
    assert(appJs.includes('runViewTransition('), 'app.js must wire runViewTransition on [Tab] / Realm cards');
    assert(tok.includes('::view-transition-group(*)') && tok.includes('yasd-terminal-card'), 'tokens.css must configure view-transition-names');
    let vtRan = false;
    YasdPrimitives.runViewTransition(() => { vtRan = true; });
    assert.strictEqual(vtRan, true, 'runViewTransition must execute synchronously when document.startViewTransition is absent');

    // 6. AAA Ergonomics: SVG sprite, 8-slot hotbar, 1-row Chronicle Folio, no STEP 1/2, portrait viewport reclaim, FTUE pips
    assert(html.includes('id="yasd-icon-sprite"'), 'index.html must include inline #yasd-icon-sprite SVG symbols');
    assert(html.includes('class="hud-panel hotbar-8slot"'), '#action-bar must use hotbar-8slot');
    assert((html.match(/data-hotbar-primary="1"/g) || []).length === 8, 'Desktop hotbar must designate exact 8 primary slots');
    assert(hsk.includes('#action-bar.hotbar-8slot:not(.drawer-open)') && hsk.includes('.action-more-grid'), 'hud-skin.css must style 8-slot hotbar & #action-more-popover grid');
    assert(html.includes('class="chronicle-folio-bar"') && ch.includes('.chronicle-folio-bar'), 'Chronicle header must use 1-row .chronicle-folio-bar');
    assert(!html.includes('menu-step-pill') && !/>STEP [12]</i.test(html), 'SaaS STEP 1/2 pills must be removed');
    assert(mob.includes('calc(100dvh - 302px') && mob.includes('right: calc(202px + var(--hh-safe-right))'), 'mobile-console.css must apply Wave 3C portrait 3D viewport reclaim');
    assert(telJs.includes('ftue-step-pips') && telJs.includes('ftue-pip'), 'hud-telemetry.js must render 3-step FTUE pips');

    // 7. Gamepad L3/R3/LB/RB & Camera-Relative Vi-Keys
    const b10 = GamepadController.mapButtonToIntent(10, {});
    const b11 = GamepadController.mapButtonToIntent(11, {});
    assert.strictEqual(b10.id, 'toggle_run', 'Gamepad L3 (10) must map to toggle_run');
    assert.strictEqual(b11.id, 'camera_reset', 'Gamepad R3 (11) must map to camera_reset');
    assert(inpJs.includes('resolveViKeyDir'), 'input.js must route Vi-keys through YasdPrimitives.resolveViKeyDir');

    assert.deepStrictEqual(YasdPrimitives.resolveViKeyDir('h', { realm: 'nethack' }), { dir: 4, isRun: false });
    assert.deepStrictEqual(YasdPrimitives.resolveViKeyDir('K', { realm: 'dcss', shiftKey: true }), { dir: 8, isRun: true });
    assert.deepStrictEqual(YasdPrimitives.resolveViKeyDir('y', { realm: 'rogue' }), { dir: 7, isRun: false });
    assert.strictEqual(YasdPrimitives.resolveViKeyDir('h', { realm: 'angband', viMode: null }), null, 'Angband keeps default letter keys when viMode is unset');
    assert.deepStrictEqual(YasdPrimitives.resolveViKeyDir('l', { realm: 'angband', viMode: 'on' }), { dir: 6, isRun: false }, 'Angband supports opt-in Vi-keys');
    assert.strictEqual(YasdPrimitives.resolveViKeyDir('h', { realm: 'nethack', viMode: 'off' }), null, 'Explicit off overrides realm default');

    console.log('  [PASS] All Wave 3C Native Web Primitives & AAA Ergonomics checks passed!');
}

run();

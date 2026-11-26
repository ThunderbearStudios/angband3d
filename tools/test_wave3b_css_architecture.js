#!/usr/bin/env node
/**
 * tools/test_wave3b_css_architecture.js
 *
 * Wave 3B Verification Suite:
 *  - 8-layer @layer cascade order & Basalt/Tarnished Brass token unification in tokens.css
 *  - All 9 [data-active-realm] tokens, tabular-nums, and @media (forced-colors: active)
 *  - All 6 sibling CSS sheets wrapped cleanly in @layer (0 global * reset in dungeon.css)
 *  - Total !important across all 7 CSS files < 50 (down from 3,814 baseline)
 *  - Zero #ffd700 or color: #fff/white scotopic glare violations
 *  - Zero transition: all declarations
 *  - Zero non-composited properties in @keyframes (only transform/opacity/filter/clip-path)
 *  - Zero sub-11px (< 0.6875rem) font-size declarations
 *  - Regression guards for _mergeBufferGeometries interleaved support & _toRotOnlyClips
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'server', 'public', 'css');
const readCss = (name) => fs.readFileSync(path.join(CSS_DIR, name), 'utf8');
const readRel = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function run() {
    console.log('\n[Wave 3B] Auditing @layer Architecture, Basalt/Brass Tokens & CSS Perf...');

    // 1. tokens.css contracts
    const tok = readCss('tokens.css');
    assert(
        tok.includes('@layer reset, tokens, base, layout, components, hud, modals, overrides;'),
        'tokens.css must declare 8-layer @layer cascade order'
    );
    assert(tok.includes('@layer reset {'), 'tokens.css must define @layer reset');
    assert(!/\*\s*\{/.test(tok.slice(tok.indexOf('@layer reset'), tok.indexOf('@layer tokens'))), 'tokens.css @layer reset must not use global * reset');
    for (const token of ['--surface-0:', '--surface-4:', '--brass-bright:', '--text-heading:', '--fs-xs:']) {
        assert(tok.includes(token), `tokens.css missing Basalt/Brass token ${token}`);
    }
    for (const realm of ['angband', 'silq', 'frogcomposband', 'hengband', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod']) {
        assert(
            tok.includes(`:root[data-active-realm="${realm}"]`),
            `tokens.css missing :root[data-active-realm="${realm}"]`
        );
    }
    assert(tok.includes('font-variant-numeric: tabular-nums;'), 'tokens.css must enforce tabular-nums');
    assert(tok.includes('@media (forced-colors: active)'), 'tokens.css must support Forced Colors Mode');

    // 2. Sibling stylesheet @layer assignments
    const dng = readCss('dungeon.css');
    assert(dng.includes('@layer base {'), 'dungeon.css must wrap rules in @layer base');
    assert(!/^\*\s*\{/m.test(dng), 'dungeon.css must not use global * { reset');
    assert(readCss('realm-cards.css').includes('@layer components {'), 'realm-cards.css must wrap rules in @layer components');
    assert(readCss('hud-skin.css').includes('@layer hud {'), 'hud-skin.css must wrap rules in @layer hud');
    assert(readCss('chronicle.css').includes('@layer hud {'), 'chronicle.css must wrap rules in @layer hud');
    const sp = readCss('sightline-polish.css');
    assert(sp.includes('@layer modals {') && sp.includes('@layer overrides {'), 'sightline-polish.css must use @layer modals + @layer overrides');
    const mob = readCss('mobile-console.css');
    assert(
        mob.includes('@layer reset, tokens, base, layout, components, hud, modals, overrides;') && mob.includes('@layer overrides {'),
        'mobile-console.css must declare layer order and wrap in @layer overrides'
    );

    // 3. Cross-sheet quantitative hygiene gates
    const cssFiles = ['tokens.css', 'dungeon.css', 'realm-cards.css', 'hud-skin.css', 'chronicle.css', 'sightline-polish.css', 'mobile-console.css'];
    let totalImportant = 0;
    const allowedKfProps = new Set(['transform', 'opacity', 'filter', 'clip-path', 'translate', 'scale', 'rotate', 'offset-distance']);

    for (const file of cssFiles) {
        const src = readCss(file);
        const impCount = (src.match(/!important\b/g) || []).length;
        totalImportant += impCount;

        // Balanced-brace & zero-unlayered top-level block verifier
        const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
        let d = 0, buf = '';
        const topHeaders = [];
        for (let i = 0; i < clean.length; i++) {
            const ch = clean[i];
            if (ch === '{') {
                if (d === 0) { topHeaders.push(buf.trim()); buf = ''; }
                d++;
            } else if (ch === '}') {
                d--;
                assert(d >= 0, `${file} has stray closing brace at char ${i}`);
                if (d === 0) buf = '';
            } else if (d === 0) {
                if (ch === ';') {
                    if (buf.trim()) topHeaders.push(buf.trim());
                    buf = '';
                } else buf += ch;
            }
        }
        assert.strictEqual(d, 0, `${file} has unclosed braces (depth=${d})`);
        for (const hdr of topHeaders) {
            assert(hdr.startsWith('@layer') || hdr.startsWith('@font-face'), `${file} has unlayered top-level rule: ${hdr.slice(0, 80)}`);
        }

        assert(!/#ffd700\b/i.test(src), `${file} must contain 0 #ffd700 glare hex values`);
        assert(!/\bcolor\s*:\s*(?:#ffffff|#fff|white)\b/i.test(src), `${file} must contain 0 pure-white text declarations`);
        assert(!/\btransition\s*:[^;{}]*\ball\b/i.test(src), `${file} must contain 0 transition: all declarations`);

        const fsMatches = [...src.matchAll(/\bfont-size\s*:\s*([0-9]+(?:\.[0-9]+)?)(px|rem)\b/gi)];
        for (const m of fsMatches) {
            const val = parseFloat(m[1]);
            const unit = m[2].toLowerCase();
            if ((unit === 'px' && val < 11) || (unit === 'rem' && val < 0.6875)) {
                assert.fail(`${file} has sub-11px font-size: ${m[0]}`);
            }
        }

        // Balanced @keyframes property check
        const kfRe = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;
        let km;
        while ((km = kfRe.exec(clean)) !== null) {
            let kd = 1, kp = kfRe.lastIndex;
            while (kp < clean.length && kd > 0) {
                if (clean[kp] === '{') kd++;
                else if (clean[kp] === '}') kd--;
                kp++;
            }
            const body = clean.slice(kfRe.lastIndex, kp - 1);
            const props = [...body.matchAll(/([a-z-]+)\s*:/gi)].map((x) => x[1].toLowerCase());
            const bad = props.filter((p) => !allowedKfProps.has(p));
            assert.strictEqual(bad.length, 0, `${file} @keyframes ${km[1]} uses non-composited props: ${bad.join(', ')}`);
        }
    }

    assert(totalImportant < 50, `Expected total !important across all 7 CSS files < 50, got ${totalImportant}`);
    console.log(`  [PASS] All 7 CSS sheets clean: !important=${totalImportant} (<50), #ffd700=0, color:#fff=0, transition:all=0, nonCompositedKF=0, sub11px=0`);

    // 4. Chrome oracle bugfix regression guards
    const envJs = readRel('server/public/js/dungeon3d-environment.js');
    assert(
        envJs.includes('isInterleavedBufferAttribute') && envJs.includes('g.index.getX'),
        'dungeon3d-environment.js _mergeBufferGeometries must handle interleaved attributes safely'
    );
    const d3dJs = readRel('server/public/js/dungeon3d.js');
    assert(
        !d3dJs.includes('_attachSharedMixamoClipsToLiveHumanoids'),
        'dungeon3d.js must NOT cross-apply guard.glb Mixamo clips onto static upright villager rigs'
    );
    console.log('  [PASS] Wave 3B CSS architecture & Chrome oracle regression checks passed!');
}

run();

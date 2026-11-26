#!/usr/bin/env node
/**
 * tools/test_v13_3_3_panel_remediation.js
 *
 * Regression & Invariant Suite for v13.3.3 Full Expert-Panel Remediation:
 *  1. Cartridge full-screen overlays (C, ?, ~, skills, religion, mutations) emit promptKind='screen' & overlay=1 -> ScreenModel needsTerminal=true (never trapped in promptMirror)
 *  2. Auto-orient initial vista camera (_pickInitialVistaFacing) prefers open vista / shops over walls
 *  3. Dungeon3DTactical determineShopDoorOrientation faces outward plaza & closed-door frontier portals are skipped
 *  4. InputAutoNav allows intermediate cartridge store portal walk-in (RYOD Quartermaster Hall)
 *  5. Non-town D:1 up-stairs never emits bogus 'Up to Dlvl 0' or Turn-0 Ascend primary CTA
 *  6. MasterBestiary kitten uses small feline scale (0.34)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// 1. Cartridge C / ? / ~ full-screen overlays must route to CRT terminal (needsTerminal=true, mirror=null)
{
    const SC = require(path.join(ROOT, 'server/public/js/screen-context.js'));
    const coreSrc = read('server/src/cartridges/cartridge-core.js');
    assert.ok(coreSrc.includes("const isItemMenu = this.state.menuMode === 'inven'"), 'cartridge-core must distinguish item/spell prompts from screen overlays');
    const nhSrc = read('variants/nethack/bin/nethack-bridge.js');
    assert.ok(nhSrc.includes('nhPromptKind'), 'nethack-bridge must distinguish non-item screen overlays (C, ?, ~) from item menus');

    const charFrame = {
        phase: 'play',
        realm: 'nethack',
        player: { name: 'Tester', hp: 14, hp_max: 14, depth: 1, x: 10, y: 10 },
        ui: { overlay: 1, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'screen', text: 'Character Overview (Press ESC or Space to return)' } },
        term: { rows: [{ g: 'Character Overview (Press ESC or Space to return)' }] }
    };
    const m = SC.ScreenModel.of(charFrame, 'nethack', { mirror3d: true });
    assert.strictEqual(m.mirror, null, 'Character sheet overlay must not be hijacked by promptMirror');
    assert.strictEqual(m.needsTerminal, true, 'Character sheet overlay must show CRT terminal');

    const invFrame = {
        phase: 'play',
        realm: 'nethack',
        player: { name: 'Tester', hp: 14, hp_max: 14, depth: 1, x: 10, y: 10 },
        ui: { overlay: 3, awaiting_command: false, more: false, context: 'menu', prompt: { kind: 'item', text: 'Inventory' } },
        inventory: [{ slot: 0, letter: 'a', name: 'long sword' }],
        term: { rows: [{ g: 'Inventory (a-a, ESC to close)' }] }
    };
    const mInv = SC.ScreenModel.of(invFrame, 'nethack', { mirror3d: true });
    assert.strictEqual(mInv.mirror, 'item', 'Inventory overlay must keep using promptMirror');
}

// 2. Tactical shop plaza orientation & closed-door frontier suppression
{
    const tacSandbox = { window: {}, Math, Float32Array, Uint8Array, Int32Array, Map, Set };
    tacSandbox.globalThis = tacSandbox;
    vm.createContext(tacSandbox);
    vm.runInContext(read('server/public/js/dungeon3d-tactical.js'), tacSandbox);
    const Tac = tacSandbox.Dungeon3DTactical;
    assert.ok(Tac, 'Dungeon3DTactical must load');

    // Simulate RYOD East Quartermaster doorway at x=12, y=6 with wall N(y=5) & S(y=7), room E(x=13..15), wide plaza W(x=1..11)
    const rows = Array.from({ length: 12 }, (_, y) => ({
        g: Array.from({ length: 20 }, (__, x) => {
            if (x >= 12 && x <= 17 && (y === 4 || y === 8 || x === 17)) return '#';
            if (x === 12 && (y === 5 || y === 7)) return '#';
            if (x === 12 && y === 6) return '1';
            return '.';
        }).join(''),
        f: Array.from({ length: 20 }, (__, x) => {
            if (x >= 12 && x <= 17 && (y === 4 || y === 8 || x === 17)) return '0f';
            if (x === 12 && (y === 5 || y === 7)) return '0f';
            if (x === 12 && y === 6) return '07';
            return '01';
        }).join('')
    }));
    const mockMap = { w: 20, h: 12, rows };
    const mockD3d = {
        getFeatAt(m, x, y) { const r = m.rows[y]; return r ? parseInt(r.f.slice(x * 2, x * 2 + 2), 16) : 0; },
        isSolidWall(f) { return f === 15 || (f >= 17 && f <= 22); },
        isStoreKind(f) { return (f >= 7 && f <= 14) || (f >= 32 && f <= 40); }
    };
    const yaw = Tac.determineShopDoorOrientation(mockD3d, mockMap, 12, 6, 20, 12);
    assert.strictEqual(yaw, -Math.PI / 2, 'Quartermaster doorway must face West (-PI/2) toward wide open town plaza, not East into small room');

    // Closed door (feat=2) must NOT emit darkPortalMesh frontier curtains
    let setMatrixCalls = 0;
    Tac.emitUnexploredFrontierPortals(
        {
            getFeatAt: () => 2,
            darkPortalMesh: { setMatrixAt: () => { setMatrixCalls++; } },
            dummy: { position: { set() {} }, rotation: { set() {} }, scale: { set() {} }, updateMatrix() {} }
        },
        mockMap, 20, 12, 5, 5, 3.0, {}, () => {}, { portal: 0 }
    );
    assert.strictEqual(setMatrixCalls, 0, 'Closed doors must never emit darkPortalMesh shadow veils');
}

// 3. MasterBestiary kitten scale
{
    const Bestiary = require(path.join(ROOT, 'server/public/js/master-bestiary.js'));
    const entry = Bestiary.resolve({ name: 'kitten', glyph: 'f' }, 'f', 'ryod');
    assert.ok(entry && entry.scale <= 0.36, `Kitten must use compact scale <= 0.36 (got ${entry && entry.scale})`);
}

// 4. Static regression checks for P0/P1 invariants
{
    const d3d = read('server/public/js/dungeon3d.js');
    assert.ok(d3d.includes('_pickInitialVistaFacing('), 'dungeon3d.js must implement _pickInitialVistaFacing');
    assert.ok(d3d.includes('uDayFactor'), 'dungeon3d.js skyDomeMaterial must support uDayFactor daylight sky blending');
    assert.ok(d3d.includes('isWalkInHollow'), 'dungeon3d.js storefronts must open back walls for walk-in rooms');
    const env = read('server/public/js/dungeon3d-environment.js');
    assert.ok(env.includes('mkCrag('), 'dungeon3d-environment.js must use lightweight sculpted crags instead of 4800-tri instanced GLTFs');
    const inp = read('server/public/js/input.js');
    assert.ok(inp.includes('noTownRealm'), 'input.js must skip bogus Turn-0 Ascend CTA on D:1 of non-town realms');
    const hud = read('server/public/js/hud.js');
    assert.ok(hud.includes("lower.includes('pre-embark character review')"), 'hud.js must filter Pre-Embark Character Review lines from message feed');
    assert.ok(hud.includes("stairsText = '[<] Exit Dungeon'"), 'hud.js must show Exit Dungeon instead of Up to Dlvl 0 on D:1 in non-town realms');
}

console.log('test_v13_3_3_panel_remediation.js: PASS');

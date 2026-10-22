/**
 * tools/test_gamepad_mapping.js — Unit test for Gamepad and Radial Menu mapping
 * Verifies:
 * 1. GamepadController.stickToSector (8-way, deadzone, LT diagonal lock quasimode)
 * 2. GamepadController.mapButtonToIntent (all standard gamepad buttons and contexts)
 * 3. RadialMenu.angleToWedgeIndex (8-wedge clockwise angles & deadzone)
 * 4. RadialMenu.buildWedges across all 4 realms (preserving fixed 8-wedge positions)
 */
'use strict';

const assert = require('assert');
const path = require('path');

const GamepadController = require('../server/public/js/gamepad.js');
const RadialMenu = require('../server/public/js/radial-menu.js');

console.log('--- test_gamepad_mapping.js ---');

// 1. stickToSector
{
    // Inside deadzone
    assert.strictEqual(GamepadController.stickToSector(0, 0, 0.28), null, 'Center must be inside deadzone');
    assert.strictEqual(GamepadController.stickToSector(0.1, 0.1, 0.28), null, 'Small magnitude must be in deadzone');
    assert.strictEqual(GamepadController.stickToSector(0, -0.25, 0.28), null, 'Near boundary must be in deadzone');

    // 8-way standard directions (North is -y, East is +x)
    assert.strictEqual(GamepadController.stickToSector(0, -1.0), '8', 'North stick must map to 8');
    assert.strictEqual(GamepadController.stickToSector(1.0, -1.0), '9', 'North-East stick must map to 9');
    assert.strictEqual(GamepadController.stickToSector(1.0, 0), '6', 'East stick must map to 6');
    assert.strictEqual(GamepadController.stickToSector(1.0, 1.0), '3', 'South-East stick must map to 3');
    assert.strictEqual(GamepadController.stickToSector(0, 1.0), '2', 'South stick must map to 2');
    assert.strictEqual(GamepadController.stickToSector(-1.0, 1.0), '1', 'South-West stick must map to 1');
    assert.strictEqual(GamepadController.stickToSector(-1.0, 0), '4', 'West stick must map to 4');
    assert.strictEqual(GamepadController.stickToSector(-1.0, -1.0), '7', 'North-West stick must map to 7');

    // Diagonal lock quasimode (LT held): only '7', '9', '1', '3'
    const allowedDiagonals = new Set(['1', '3', '7', '9']);
    const testAngles = [
        [0, -1.0], [0.5, -0.9], [1.0, -1.0], [0.9, -0.4], [1.0, 0],
        [0.9, 0.4], [1.0, 1.0], [0.4, 0.9], [0, 1.0], [-0.4, 0.9],
        [-1.0, 1.0], [-0.9, 0.4], [-1.0, 0], [-0.9, -0.4], [-1.0, -1.0]
    ];
    for (const [x, y] of testAngles) {
        const sector = GamepadController.stickToSector(x, y, 0.28, true);
        assert(allowedDiagonals.has(sector), `Diagonal lock at (${x}, ${y}) must yield diagonal, got ${sector}`);
    }
    assert.strictEqual(GamepadController.stickToSector(1.0, -1.0, 0.28, true), '9');
    assert.strictEqual(GamepadController.stickToSector(1.0, 1.0, 0.28, true), '3');
    assert.strictEqual(GamepadController.stickToSector(-1.0, 1.0, 0.28, true), '1');
    assert.strictEqual(GamepadController.stickToSector(-1.0, -1.0, 0.28, true), '7');

    console.log('  PASS: GamepadController.stickToSector (8-way, deadzone, and LT diagonal lock)');
}

// 2. mapButtonToIntent
{
    // Button 0 (A / Cross): confirm / enter / space on -more-
    const b0Default = GamepadController.mapButtonToIntent(0, {});
    assert.strictEqual(b0Default.id, 'confirm');
    assert.strictEqual(b0Default.key, 'enter');

    const b0More = GamepadController.mapButtonToIntent(0, { more: true });
    assert.strictEqual(b0More.id, 'confirm');
    assert.strictEqual(b0More.key, 'space', 'Button 0 on -more- must map to space');

    // Button 1 (B / Circle): back / escape
    const b1 = GamepadController.mapButtonToIntent(1);
    assert.strictEqual(b1.id, 'back');
    assert.strictEqual(b1.key, 'escape');

    // Button 2 (X / Square): Item Sheet (Alt+I)
    const b2 = GamepadController.mapButtonToIntent(2);
    assert.strictEqual(b2.id, 'item_sheet');
    assert(b2.shortcut === 'Alt+I' || b2.key === 'Alt+I');

    // Button 3 (Y / Triangle): Radial Menu toggle
    const b3 = GamepadController.mapButtonToIntent(3);
    assert.strictEqual(b3.action, 'radial_toggle');

    // Button 4 (LB): cycle target prev ('-')
    const b4 = GamepadController.mapButtonToIntent(4);
    assert.strictEqual(b4.key, '-');

    // Button 5 (RB): cycle target next ('*' / 't')
    const b5 = GamepadController.mapButtonToIntent(5);
    assert.strictEqual(b5.key, '*');

    // Button 6 (LT): diagonal-lock quasimode (Shiren)
    const b6 = GamepadController.mapButtonToIntent(6);
    assert.strictEqual(b6.id, 'diagonal_lock');
    assert.strictEqual(b6.quasimode, true);

    // Button 7 (RT): Smart Action ('space')
    const b7 = GamepadController.mapButtonToIntent(7);
    assert.strictEqual(b7.key, 'space');

    // Button 8 (Select/Back): Classic Terminal toggle ('tab')
    const b8 = GamepadController.mapButtonToIntent(8);
    assert.strictEqual(b8.key, 'tab');

    // Button 9 (Start/Options): Command Palette ('Ctrl+K')
    const b9 = GamepadController.mapButtonToIntent(9);
    assert(b9.key === 'Ctrl+K' || b9.shortcut === 'Ctrl+K');

    // Buttons 12..15 (D-pad): in 3D play
    const dpadUp = GamepadController.mapButtonToIntent(12, { inMenu: false });
    assert.strictEqual(dpadUp.key, '8');
    const dpadDown = GamepadController.mapButtonToIntent(13, { inMenu: false });
    assert.strictEqual(dpadDown.key, '2');
    const dpadLeft = GamepadController.mapButtonToIntent(14, { inMenu: false });
    assert.strictEqual(dpadLeft.key, '4');
    const dpadRight = GamepadController.mapButtonToIntent(15, { inMenu: false });
    assert.strictEqual(dpadRight.key, '6');

    // Buttons 12..15 in prompt/menu navigation
    const dpadUpMenu = GamepadController.mapButtonToIntent(12, { inMenu: true });
    assert.strictEqual(dpadUpMenu.key, 'ArrowUp');
    const dpadDownMenu = GamepadController.mapButtonToIntent(13, { inMenu: true });
    assert.strictEqual(dpadDownMenu.key, 'ArrowDown');
    const dpadLeftMenu = GamepadController.mapButtonToIntent(14, { inMenu: true });
    assert.strictEqual(dpadLeftMenu.key, 'ArrowLeft');
    const dpadRightMenu = GamepadController.mapButtonToIntent(15, { inMenu: true });
    assert.strictEqual(dpadRightMenu.key, 'ArrowRight');

    console.log('  PASS: GamepadController.mapButtonToIntent across all standard buttons & prompt contexts');
}

// 3. RadialMenu.angleToWedgeIndex
{
    assert.strictEqual(RadialMenu.angleToWedgeIndex(0, 0, 0.28), null, 'Center must be in deadzone');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(0.1, -0.1, 0.28), null, 'Small stick must be in deadzone');

    assert.strictEqual(RadialMenu.angleToWedgeIndex(0, -1.0), 0, 'North must be wedge 0');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(1.0, -1.0), 1, 'North-East must be wedge 1');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(1.0, 0), 2, 'East must be wedge 2');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(1.0, 1.0), 3, 'South-East must be wedge 3');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(0, 1.0), 4, 'South must be wedge 4');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(-1.0, 1.0), 5, 'South-West must be wedge 5');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(-1.0, 0), 6, 'West must be wedge 6');
    assert.strictEqual(RadialMenu.angleToWedgeIndex(-1.0, -1.0), 7, 'North-West must be wedge 7');

    console.log('  PASS: RadialMenu.angleToWedgeIndex (8 fixed wedges clockwise from North)');
}

// 4. RadialMenu.buildWedges across realms
{
    const realms = ['angband', 'silq', 'frogcomposband', 'hengband'];
    const expectedInnerVerbs = ['quaff', 'read', 'use_staff', 'aim', 'fire', 'throw', 'wield', 'drop'];
    const expectedOuterVerbs = ['cast', 'rest', 'open', 'disarm', 'tunnel', 'look', 'map', 'char_sheet'];

    for (const r of realms) {
        // Inner ring
        const inner = RadialMenu.buildWedges(r, 0);
        assert.strictEqual(inner.length, 8, `Inner ring must have 8 wedges in ${r}`);
        for (let i = 0; i < 8; i++) {
            assert.strictEqual(inner[i].index, i);
            assert.strictEqual(inner[i].verb, expectedInnerVerbs[i]);
            assert.strictEqual(inner[i].angle, i * 45);
        }

        // Outer ring
        const outer = RadialMenu.buildWedges(r, 1);
        assert.strictEqual(outer.length, 8, `Outer ring must have 8 wedges in ${r}`);
        for (let i = 0; i < 8; i++) {
            assert.strictEqual(outer[i].index, i);
            assert.strictEqual(outer[i].verb, expectedOuterVerbs[i]);
            assert.strictEqual(outer[i].angle, i * 45);
        }
    }

    // Sil-Q specific checks: read and cast are disabled but retain fixed index positions
    const silqInner = RadialMenu.buildWedges('silq', 0);
    assert.strictEqual(silqInner[1].verb, 'read');
    assert.strictEqual(silqInner[1].disabled, true, 'Sil-Q read must be disabled');
    assert.strictEqual(silqInner[1].angle, 45, 'Sil-Q read wedge angle must remain at 45 deg');

    const silqOuter = RadialMenu.buildWedges('silq', 1);
    assert.strictEqual(silqOuter[0].verb, 'cast');
    assert.strictEqual(silqOuter[0].disabled, true, 'Sil-Q cast must be disabled');
    assert.strictEqual(silqOuter[0].angle, 0, 'Sil-Q cast wedge angle must remain at 0 deg');

    // Angband specific checks: read and cast are enabled
    const angbandInner = RadialMenu.buildWedges('angband', 0);
    assert.strictEqual(angbandInner[1].disabled, false);
    assert.strictEqual(angbandInner[1].key, 'r');

    const angbandOuter = RadialMenu.buildWedges('angband', 1);
    assert.strictEqual(angbandOuter[0].disabled, false);
    assert.strictEqual(angbandOuter[0].key, 'm');

    console.log('  PASS: RadialMenu.buildWedges (concentric rings, fixed positions, realm disability semantics)');
}

console.log('test_gamepad_mapping.js: ALL PASS');

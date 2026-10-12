#!/usr/bin/env node
/**
 * tools/test_heng_wiring.js — Contract tests for WS3.4:
 *   - HengTranslate v2 delegation in heng-dict.js behind flag
 *   - Rollback flag (__hengTranslatorV2 === false / localStorage)
 *   - L2: topline lastTermRow0 reset on phase transition and prompt filtering
 *   - L8: realm-keys REALM_TEXT used for welcome & staircase messages
 *   - L9: letter ribbon uses translateName instead of two-map lookup
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Running WS3.4 HengTranslate Wiring & Defect Fix Contracts ===\n');

// --- Contract 1: Delegation in heng-dict.js ---
console.log('Contract 1: heng-dict.js delegation to HengTranslate');
const HengTranslate = require('../server/public/js/heng/heng-translate.js');
const names = require('../server/public/js/heng/heng-names.json');
const kinds = require('../server/public/js/heng/heng-kinds.json');
const templates = require('../server/public/js/heng/heng-templates.json');

// Initialize HengTranslate with generated dictionary
HengTranslate.load({ names, kinds, templates });
assert.ok(typeof HengTranslate.isLoaded === 'function' && HengTranslate.isLoaded(), 'HengTranslate.isLoaded() must be true after load');

global.HengTranslate = HengTranslate;
global.window = global;
global.__hengTranslatorV2 = true;

const HENG_DICT = require('../server/public/js/heng-dict.js');

// 1.1 Item name delegation (with dice, modifiers)
const itemJa = 'ブロード・アックス (2d6) (+0,+0)';
const itemEn = HENG_DICT.getLocalizedItemName(itemJa, 'hengband', 'en');
assert.strictEqual(itemEn, 'Broad Axe (2d6) (+0,+0)', `Contract 1.1 failed: getLocalizedItemName must delegate to HengTranslate: got "${itemEn}"`);

// 1.2 Monster name delegation
const monJa = '汚いイタズラ小僧';
const monEn = HENG_DICT.getLocalizedMonsterName(monJa, 'hengband', 'en');
assert.strictEqual(monEn, 'Filthy street urchin', `Contract 1.2 failed: getLocalizedMonsterName must delegate to HengTranslate: got "${monEn}"`);

// 1.3 Game message delegation
const msgJa = '6つの食料を見つけた。';
const msgEn = HENG_DICT.localizeGameMessage(msgJa, 'hengband', 'en');
assert.ok(!/[\u3040-\u30ff\u4e00-\u9fff]/.test(msgEn), `Contract 1.3 failed: localizeGameMessage must translate without CJK: got "${msgEn}"`);

// 1.4 Terminal row delegation
const rowJa = '  a) 6つの食料                          1.5 kg';
const rowRes = HENG_DICT.translateTerminalRow(rowJa, '1'.repeat(rowJa.length), 'en');
assert.ok(rowRes.text.includes('Ration of Food') || rowRes.text.includes('Rations of Food'), `Contract 1.4 failed: translateTerminalRow must translate items: got "${rowRes.text}"`);

// 1.5 Rollback flag (__hengTranslatorV2 = false restores legacy path)
global.__hengTranslatorV2 = false;
assert.strictEqual(typeof HENG_DICT.isV2Active, 'function' && HENG_DICT.isV2Active(), false, 'Contract 1.5 failed: isV2Active must be false when __hengTranslatorV2 = false');
global.__hengTranslatorV2 = true;
console.log('  ✓ Contract 1: heng-dict.js delegation and rollback verified\n');

// --- Contract 2: L2 topline lastTermRow0 reset in hud.js ---
console.log('Contract 2: L2 topline lastTermRow0 reset on phase transition');
const hudSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/hud.js'), 'utf8');
assert.ok(
    hudSrc.includes('this.lastTermRow0 = \'\'') || hudSrc.includes('this.lastTermRow0 = ""'),
    'Contract 2.1 failed: hud.js must reset lastTermRow0 on play transition'
);
assert.ok(
    hudSrc.includes('!this.wasInPlay') && (hudSrc.includes("this.lastTermRow0 = ''") || hudSrc.includes('this.lastTermRow0 = ""')),
    'Contract 2.2 failed: hud.js must reset lastTermRow0 specifically on !wasInPlay transition'
);
console.log('  ✓ Contract 2: L2 topline reset verified\n');

// --- Contract 3: L8 REALM_TEXT in hud.js ---
console.log('Contract 3: L8 realm-keys REALM_TEXT in hud.js');
assert.ok(
    !hudSrc.includes('"Welcome to the Town of Angband! Visit the General Store and Armory to equip your journey."'),
    'Contract 3.1 failed: hud.js must not contain hard-coded Town of Angband welcome'
);
assert.ok(
    hudSrc.includes('REALM_TEXT') || hudSrc.includes('realmText'),
    'Contract 3.2 failed: hud.js must reference REALM_TEXT for town / depth naming'
);
console.log('  ✓ Contract 3: L8 REALM_TEXT integration verified\n');

// --- Contract 4: L9 Ribbon translateName in app.js ---
console.log('Contract 4: L9 ribbon translateName in app.js');
const appSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/app.js'), 'utf8');
assert.ok(
    !appSrc.includes('JP_TERM_TRANSLATIONS[label] || (window.HENG_DICT && window.HENG_DICT.DATA'),
    'Contract 4.1 failed: app.js ribbon must not use the legacy two-map lookup'
);
assert.ok(
    appSrc.includes('translateName(label') || appSrc.includes('translateName(label,'),
    'Contract 4.2 failed: app.js ribbon must call translateName'
);
console.log('  ✓ Contract 4: L9 ribbon translateName verified\n');

console.log('=== All WS3.4 Wiring & Defect Contracts Passed! ===');

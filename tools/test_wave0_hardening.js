#!/usr/bin/env node
'use strict';

/**
 * tools/test_wave0_hardening.js
 * Deterministic regression tests for Wave 0 security, parity, 3D graphics, bestiary, Chronicle, and exploit fixes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function check(cond, msg) {
    assert.ok(cond, msg);
    passed++;
}

// 1. Edge secret fail-closed in production (rate-limit.js)
{
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSecret = process.env.EDGE_PROXY_SECRET;
    const prevTarget = process.env.DEPLOY_TARGET;
    try {
        delete process.env.EDGE_PROXY_SECRET;
        process.env.NODE_ENV = 'production';
        const rlPath = require.resolve('../server/src/rate-limit');
        delete require.cache[rlPath];
        const { hasValidEdgeSecret } = require('../server/src/rate-limit');
        check(hasValidEdgeSecret({ headers: {} }) === false, 'hasValidEdgeSecret must fail closed in production without secret');

        process.env.NODE_ENV = 'development';
        process.env.DEPLOY_TARGET = 'ovh';
        check(hasValidEdgeSecret({ headers: {} }) === false, 'hasValidEdgeSecret must fail closed on DEPLOY_TARGET=ovh without secret');

        delete process.env.DEPLOY_TARGET;
        check(hasValidEdgeSecret({ headers: {} }) === true, 'hasValidEdgeSecret allows local dev without secret');
    } finally {
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
        if (prevSecret === undefined) delete process.env.EDGE_PROXY_SECRET; else process.env.EDGE_PROXY_SECRET = prevSecret;
        if (prevTarget === undefined) delete process.env.DEPLOY_TARGET; else process.env.DEPLOY_TARGET = prevTarget;
    }
}

// 2. Save Vault client & server hardening
{
    const svcSrc = read('server/public/js/save-vault-client.js');
    check(!svcSrc.includes('/download?realm='), 'save-vault-client.js must not request nonexistent /download endpoint');
    check(svcSrc.includes('/api/saves/upload?realm='), 'save-vault-client.js must POST to /api/saves/upload');

    const netSrc = read('server/public/js/network.js');
    check(netSrc.includes('session.${this.sessionId}'), 'network.js must send session ID in Sec-WebSocket-Protocol');

    const srvSrc = read('server/src/server.js');
    check(srvSrc.includes('ryodLimiter('), 'server.js must rate-limit RYOD endpoints');
    check(srvSrc.includes('perMessageDeflate'), 'server.js WebSocketServer must configure perMessageDeflate');
    check(srvSrc.includes('line.slice(0, 1400).includes(\'"dead":true\')'), 'server.js must inspect player head slice for dead:true');
}

// 3. ActionCatalog, QuickActions & ItemSheet parity
{
    const AC = require('../server/public/js/action-catalog');
    check(AC.fromVanillaKey('s', 'silq') === 's', 'Sil-Q native key s must remain s');
    check(AC.fromVanillaKey('m', 'silq') === 's', 'Sil-Q magic remap m -> s preserved');
    check(AC.evaluateActionAvailability('fire', { phase: 'play', player: { equipment: [{ name: 'long bow', tval: 5 }], inventory: [] } }, 'angband').available === true, 'Angband 4.2.6 bow tval 5 must enable fire');

    const QA = require('../server/public/js/quick-actions');
    check(QA.classifyInventoryEntry({ name: 'Brass Lantern', tval: 19 }, 'angband').category !== 'potion', 'Angband tval 19 light source must not classify as potion');
    check(QA.getDeviceVerb({ name: 'Wand of Slow Monster', tval: 65 }, 'angband') === 'a', 'Wand tval 65 must use key a');
    check(QA.getDeviceVerb({ name: 'Rod of Recall', tval: 66 }, 'angband') === 'z', 'Rod tval 66 must use key z');

    const MIR = require('../server/public/js/master-item-registry');
    check(MIR.normalizeTvalSlotCategory(14, 'angband') === 'shield', 'Angband 4.2.6 tval 14 must normalize to shield');
    check(MIR.normalizeTvalSlotCategory(19, 'angband') === 'light', 'Angband 4.2.6 tval 19 must normalize to light');
}

// 4. MasterBestiary Boss & Glyph Safety
{
    const MB = require('../server/public/js/master-bestiary');
    check(MB.resolve({ name: 'Balrog', glyph: 'U' }, 'U', 'silq').templateKey === 'bestiary_balrog', 'Sil-Q Balrog must resolve to bestiary_balrog');
    check(MB.resolve({ name: 'Cyberdemon', glyph: 'U' }, 'U', 'frogcomposband').templateKey === 'bestiary_balrog', 'FCB Cyberdemon must resolve to bestiary_balrog');
    check(MB.resolve({ name: 'Bullroarer the Hobbit', glyph: 'p' }, 'p', 'angband').templateKey === 'char_male_rogue', 'Bullroarer must resolve to Hobbit rogue, not Orc captain');
    check(MB.resolve({ name: 'Nether hound', glyph: 'Z' }, 'Z', 'angband').useAsciiTint === true, 'Nether hound must be recognized as elemental hound');
    check(MB.resolve({ name: 'Pit fiend captain', glyph: 'U' }, 'U', 'angband').templateKey !== 'char_male_guard', 'Non-humanoid glyph U captain must not resolve to human guard');
}

// 5. Chronicle Security & Prose Fidelity + Exploit Gates + RYOD Permalink
{
    const CS = require('../server/public/js/chronicle/chronicle-store');
    const xssHtml = CS.exportAsStandaloneHtml({ title: '<script>alert(1)</script>', created_at: Date.now(), protagonists: [{ name: 'Morgrim', race: 'Human', class: 'Warrior' }], current_protagonist_idx: 0, chapters: [{ depth: 1, prose: '<img src=x onerror=alert(1)>' }] });
    check(!xssHtml.includes('<script>alert(1)</script>'), 'ChronicleStore HTML export must escape script tags');
    check(!xssHtml.includes('<img src=x'), 'ChronicleStore HTML export must escape raw HTML elements');

    const CG = require('../server/public/js/chronicle/chronicle-grounder');
    const unarmedTroll = CG.generateKillSaga(['stone troll'], { name: 'Ryu', race: 'Human', class: 'Monk', turn: 3 }, 20, 'nethack', 'bare fists');
    check(!unarmedTroll.prose.includes('burying the blade'), 'Unarmed troll kill prose must never mention burying a blade');
    const unarmedJelly = CG.generateKillSaga(['blue jelly'], { name: 'Ryu', race: 'Human', class: 'Monk', turn: 0 }, 5, 'nethack', 'bare fists');
    check(!unarmedJelly.prose.includes('shearing stroke of bare fists'), 'Unarmed jelly kill prose must never say shearing stroke of bare fists');

    const Ryod = require('../server/public/js/ryod-compiler');
    const findPreset = (id) => (Ryod.MASTERWORK_PRESETS || []).concat(Ryod.ARCADE_ADVENTURES || []).find(p => p.id === id);
    const chimeraPreset = findPreset('true_chimera_chaos');
    const chimera = Ryod.normalizeConfig(Object.assign({}, chimeraPreset, { presetId: chimeraPreset.id, mithrilSmithing: true, wovenSongs: true }));
    const decoded = Ryod.decodePermalink(Ryod.encodePermalink(chimera));
    check(decoded && decoded.presetId === 'true_chimera_chaos', 'RYOD permalink must preserve presetId');
    check(decoded && decoded.chimeraChaos === true && decoded.mithrilSmithing === true && decoded.wovenSongs === true, 'RYOD permalink must preserve Chimera flags');
    const relic = Ryod.normalizeConfig(findPreset('yendor_relic_ascent'));
    check(relic && relic.storyArc === 'sovereign_heist', 'yendor_relic_ascent must resolve to valid sovereign_heist storyArc');

    const nhSrc = read('variants/nethack/bin/nethack-bridge.js');
    check(nhSrc.includes('lastPrayTurn') && nhSrc.includes('COOLDOWN = 800'), 'NetHack #pray must enforce turn cooldown');
    const ryodSysSrc = read('server/src/cartridges/ryod-systems.js');
    check(ryodSysSrc.includes('usedAnvils'), 'RYOD anvil smithing must be limited to one temper per anvil');
}

console.log(`[PASS] Wave 0 hardening suite: ${passed} assertions passed.`);

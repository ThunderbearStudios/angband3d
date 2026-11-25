#!/usr/bin/env node
/**
 * tools/audit_9realm_bestiary_exhaustive.js
 *
 * Exhaustive automated bestiary & asset audit across ALL 9 realms:
 *   1. Verifies ZERO procedural mesh generators remain in server/public/assets/models/monsters/.
 *   2. Parses all ~3,700+ monster definitions across:
 *      angband, silq, frogcomposband, hengband (EN + JP), nethack, dcss, brogue, rogue, ryod.
 *   3. Asserts every resolved templateKey exists as a real handler in dungeon3d.js.
 *   4. Asserts ZERO non-horror monsters silently fall through to bestiary_horror.
 *   5. Asserts key biological/lore regression fixes (Brogue bloat, Sil-Q Wolf/Grimhawk/Nessa/Horrors,
 *      Angband Fang/Grip vs Farmer Maggot, Smeagol/Mim/Saruman/Fangorn/Tarrasque/Mumak/Catoblepas,
 *      Rogue Ice Monster/Yeti/Emu/Kestrel).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const mb = require(path.join(ROOT, 'server/public/js/master-bestiary.js'));
const pool = require(path.join(ROOT, 'server/public/js/realm-content-pool.js'));
const hengTranslatePath = path.join(ROOT, 'server/public/js/heng-translate.js');
if (fs.existsSync(hengTranslatePath)) {
    global.window = global.window || {};
    global.self = global.self || global.window;
    require(hengTranslatePath);
    if (global.window.HengTranslate) global.HengTranslate = global.window.HengTranslate;
}

const d3dSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
const VALID_TEMPLATE_KEYS = new Set([...d3dSrc.matchAll(/templateKey === '([^']+)'/g)].map(m => m[1]));

function stripJsonc(s) {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        const n = s[i + 1];
        if (inStr) {
            out += c;
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
        } else if (c === '"') {
            inStr = true;
            out += c;
        } else if (c === '/' && n === '/') {
            while (i < s.length && s[i] !== '\n') i++;
            out += '\n';
        } else if (c === '/' && n === '*') {
            i += 2;
            while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
            i++;
        } else {
            out += c;
        }
    }
    return out.replace(/,\s*([}\]])/g, '$1');
}

function parseAngbandTxt(relPath) {
    const out = [];
    let cur = null;
    for (const line of fs.readFileSync(path.join(ROOT, relPath), 'utf8').split(/\r?\n/)) {
        if (line.startsWith('name:')) {
            if (cur && cur.name) out.push(cur);
            cur = { name: line.slice(5).trim(), glyph: '?' };
        } else if (cur && line.startsWith('glyph:')) {
            cur.glyph = line.slice(6).trim()[0] || '?';
        }
    }
    if (cur && cur.name) out.push(cur);
    return out;
}

function parseEditTxt(relPath) {
    const out = [];
    let cur = null;
    for (const line of fs.readFileSync(path.join(ROOT, relPath), 'utf8').split(/\r?\n/)) {
        if (line.startsWith('N:')) {
            if (cur && cur.name) out.push(cur);
            const parts = line.split(':');
            cur = { name: parts.slice(2).join(':').trim(), glyph: '?' };
        } else if (cur && line.startsWith('G:')) {
            cur.glyph = (line.split(':')[1] || '?')[0] || '?';
        }
    }
    if (cur && cur.name) out.push(cur);
    return out;
}

function parseHengbandJsonc(relPath) {
    const raw = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const data = JSON.parse(stripJsonc(raw));
    const list = [];
    for (const m of (data.monsters || [])) {
        if (!m || !m.name) continue;
        const g = (m.symbol && m.symbol.character) ? String(m.symbol.character)[0] : '?';
        if (m.name.en) list.push({ name: m.name.en, glyph: g, lang: 'en' });
        if (m.name.ja) list.push({ name: m.name.ja, glyph: g, lang: 'ja' });
    }
    return list;
}

function extractBridgeMonsters(relPath) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const out = [];
    for (const m of src.matchAll(/\{\s*(?:name|race)\s*:\s*'([^']+)'[^}]*?glyph\s*:\s*'([^']+)'/g)) {
        out.push({ name: m[1], glyph: m[2][0] });
    }
    return out;
}

function extractRyodMonsters() {
    const out = [];
    const seen = new Set();
    const pushMon = (m) => {
        if (!m || typeof m !== 'object' || m.kind) return;
        const n = m.name || m.race;
        if (!n || !m.glyph) return;
        const k = `${n}|${m.glyph}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ name: n, glyph: String(m.glyph)[0] });
    };
    for (const pet of Object.values(pool.PET_COMPANIONS || {})) pushMon(pet);
    for (const ally of (pool.CAPTIVE_ALLIES || [])) pushMon(ally);
    for (const fac of Object.values(pool.BESTIARY_FACTIONS || {})) {
        if (!fac || typeof fac !== 'object') continue;
        for (const m of (fac.monsters || [])) pushMon(m);
        if (fac.boss) pushMon(fac.boss);
        for (const b of (fac.bosses || [])) pushMon(b);
    }
    for (const arc of Object.values(pool.STORY_ARCS || {})) {
        if (!arc || typeof arc !== 'object') continue;
        if (arc.boss) pushMon(arc.boss);
        for (const b of (arc.bosses || [])) pushMon(b);
    }
    if (typeof pool.getOmniPantheonMonsters === 'function') {
        for (const m of pool.getOmniPantheonMonsters()) pushMon(m);
    }
    return out;
}

const HORROR_ALLOWLIST_RE = /horror|nameless|abomination|spawn|thing|chaos|shoggoth|gibbering|eldritch|byakhee|mi-go|hunting|nyarlathotep|azathoth|yog-|cthulhu|grotesque|tentacle|hound of tindalos|star-spawn|dimensional shambler|nightgaunt|dhole|shantak|colour|dark young|gnoph|tindalos|gug\b|zoog|wumpus|jabber|nether|void|abyss|ホラー|恐怖|名状|ショゴス|ミ＝ゴ|クトゥルフ|ニャルラト|アザトース|ヨグ|ティンダロス|触手|異形|怪物|深きもの/i;

function auditGlbs() {
    const rootDir = path.join(ROOT, 'server/public/assets/models/monsters');
    const badGenRe = /Bestiary Generator|Dark Bestiary Sculptor|WS79-Builder/i;
    let glbCount = 0;
    const walk = (d) => {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, ent.name);
            if (ent.isDirectory()) walk(p);
            else if (ent.name.endsWith('.glb')) {
                glbCount++;
                const buf = fs.readFileSync(p);
                const jl = buf.readUInt32LE(12);
                const json = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
                const gen = String((json.asset && json.asset.generator) || '');
                assert(!badGenRe.test(gen), `Procedural generator "${gen}" forbidden in ${path.relative(ROOT, p)}`);
            }
        }
    };
    walk(rootDir);
    assert(glbCount >= 50, `Expected >= 50 monster GLBs, found ${glbCount}`);
    return glbCount;
}

function run() {
    console.log('=== Exhaustive 9-Realm Bestiary & 3rd-Party GLB Audit ===\n');
    const glbCount = auditGlbs();
    console.log(`  PASS  Asset provenance: ${glbCount} monster GLBs verified 100% non-procedural`);

    const manifestEntries = (realm) => Object.keys(mb.REALM_MANIFESTS[realm] || {}).map(name => ({ name, glyph: '?' }));
    const realmSets = {
        angband: fs.existsSync(path.join(ROOT, 'engine/lib/gamedata/monster.txt'))
            ? parseAngbandTxt('engine/lib/gamedata/monster.txt')
            : manifestEntries('angband'),
        silq: fs.existsSync(path.join(ROOT, 'variants/silq/lib/edit/monster.txt'))
            ? parseEditTxt('variants/silq/lib/edit/monster.txt')
            : manifestEntries('silq'),
        frogcomposband: fs.existsSync(path.join(ROOT, 'variants/frogcomposband/lib/edit/r_info.txt'))
            ? parseEditTxt('variants/frogcomposband/lib/edit/r_info.txt')
            : manifestEntries('frogcomposband'),
        hengband: fs.existsSync(path.join(ROOT, 'variants/hengband/lib/edit/MonraceDefinitions.jsonc'))
            ? parseHengbandJsonc('variants/hengband/lib/edit/MonraceDefinitions.jsonc')
            : manifestEntries('hengband'),
        nethack: extractBridgeMonsters('variants/nethack/bin/nethack-bridge.js'),
        dcss: extractBridgeMonsters('variants/dcss/bin/dcss-bridge.js'),
        brogue: extractBridgeMonsters('variants/brogue/bin/brogue-bridge.js'),
        rogue: extractBridgeMonsters('variants/rogue/bin/rogue-bridge.js'),
        ryod: extractRyodMonsters()
    };

    let totalMonsters = 0;
    const badKeys = [];
    const unexpectedHorrors = [];

    for (const [realm, list] of Object.entries(realmSets)) {
        assert(list.length > 0, `Parsed 0 monsters for realm ${realm}`);
        for (const mon of list) {
            if (mon.name === 'player' || mon.name === '<player>') continue;
            totalMonsters++;
            const cfg = mb.resolve({ name: mon.name, glyph: mon.glyph }, mon.glyph, realm);
            if (!cfg || !VALID_TEMPLATE_KEYS.has(cfg.templateKey)) {
                badKeys.push(`${realm}: "${mon.name}" (${mon.glyph}) -> ${cfg && cfg.templateKey}`);
            }
            if (cfg && cfg.templateKey === 'bestiary_horror' && !HORROR_ALLOWLIST_RE.test(mon.name)) {
                unexpectedHorrors.push(`${realm}: "${mon.name}" (${mon.glyph})`);
            }
        }
        console.log(`  PASS  ${realm.padEnd(15)} ${String(list.length).padStart(4)} entries audited`);
    }

    assert.strictEqual(badKeys.length, 0, `Invalid templateKey(s):\n${badKeys.slice(0, 20).join('\n')}`);
    assert.strictEqual(unexpectedHorrors.length, 0, `Unexpected bestiary_horror fallback(s):\n${unexpectedHorrors.slice(0, 20).join('\n')}`);

    // Explicit semantic & biological accuracy assertions
    assert.strictEqual(mb.resolve({ name: 'Bloat', glyph: 'b' }, 'b', 'brogue').templateKey, 'bestiary_quylthulg', 'Brogue Bloat must not be floating eye');
    assert.strictEqual(mb.resolve({ name: 'Pit bloat', glyph: 'b' }, 'b', 'brogue').templateKey, 'bestiary_quylthulg', 'Brogue Pit bloat must not be floating eye');
    assert.strictEqual(mb.resolve({ name: 'Explosive gas bloat', glyph: 'b' }, 'b', 'brogue').templateKey, 'bestiary_quylthulg', 'Generic bloat must not be floating eye');
    assert.strictEqual(mb.resolve({ name: "Fang, Farmer Maggot's dog", glyph: 'C' }, 'C', 'angband').templateKey, 'bestiary_husky');
    assert.strictEqual(mb.resolve({ name: "Grip, Farmer Maggot's dog", glyph: 'C' }, 'C', 'angband').templateKey, 'bestiary_husky');
    assert.strictEqual(mb.resolve({ name: 'Farmer Maggot', glyph: 'h' }, 'h', 'angband').templateKey, 'char_male_peasant_bearded');
    assert.strictEqual(mb.resolve({ name: 'Sméagol', glyph: 'h' }, 'h', 'angband').templateKey, 'bestiary_puglin');
    assert.strictEqual(mb.resolve({ name: 'Mîm, Betrayer of Turin', glyph: 'h' }, 'h', 'angband').templateKey, 'char_male_ranger');
    assert.strictEqual(mb.resolve({ name: 'Saruman of Many Colours', glyph: 'p' }, 'p', 'angband').templateKey, 'char_male_priest');
    assert.strictEqual(mb.resolve({ name: 'Fangorn, the Treebeard', glyph: '#' }, '#', 'angband').templateKey, 'bestiary_treeman');
    assert.strictEqual(mb.resolve({ name: 'The Tarrasque', glyph: 'R' }, 'R', 'angband').templateKey, 'bestiary_lizard');
    assert.strictEqual(mb.resolve({ name: 'Mûmak', glyph: 'q' }, 'q', 'angband').templateKey, 'bestiary_mumak');
    assert.strictEqual(mb.resolve({ name: 'Catoblepas', glyph: 'q' }, 'q', 'angband').templateKey, 'bestiary_bear');

    const silWolf = mb.resolve({ name: 'Wolf', glyph: 'C' }, 'C', 'silq');
    assert.strictEqual(silWolf.templateKey, 'bestiary_wolf');
    assert.strictEqual(silWolf.tintHex, null);
    assert.strictEqual(mb.resolve({ name: 'Grimhawk', glyph: 'B' }, 'B', 'silq').templateKey, 'bestiary_bird');
    assert.strictEqual(mb.resolve({ name: 'Creeping horror', glyph: 'H' }, 'H', 'silq').templateKey, 'bestiary_horror');
    assert.strictEqual(mb.resolve({ name: 'Unrelenting horror', glyph: 'H' }, 'H', 'silq').templateKey, 'bestiary_horror');
    assert.strictEqual(mb.resolve({ name: 'Grotesque', glyph: 'H' }, 'H', 'silq').templateKey, 'bestiary_horror');
    assert.strictEqual(mb.resolve({ name: 'Silent watcher', glyph: 'g' }, 'g', 'silq').templateKey, 'bestiary_statue');
    assert.strictEqual(mb.resolve({ name: 'Nessa', glyph: 'A' }, 'A', 'silq').templateKey, 'char_valkyrie');

    assert.strictEqual(mb.resolve({ name: 'ice monster', glyph: 'I' }, 'I', 'rogue').templateKey, 'bestiary_frost_construct');
    assert.strictEqual(mb.resolve({ name: 'yeti', glyph: 'Y' }, 'Y', 'rogue').templateKey, 'bestiary_yeti');
    assert.strictEqual(mb.resolve({ name: 'emu', glyph: 'E' }, 'E', 'rogue').templateKey, 'bestiary_stork');
    assert.strictEqual(mb.resolve({ name: 'kestrel', glyph: 'K' }, 'K', 'rogue').templateKey, 'bestiary_bird');

    console.log(`\naudit_9realm_bestiary_exhaustive.js: ALL PASS (${totalMonsters} entries across 9 realms, 0 bad keys, 0 unexpected horror fallbacks)`);
}

run();

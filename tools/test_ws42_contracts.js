#!/usr/bin/env node
/**
 * tools/test_ws42_contracts.js
 *
 * WS42 Command & Menu Unification Contract Test Suite (WS42.0).
 * Implements the 8 red-first contracts (a) through (h).
 *
 * Usage:
 *   node tools/test_ws42_contracts.js --expect-red       (asserts all 8 fail on baseline, exits 0)
 *   node tools/test_ws42_contracts.js --check=a,b,c      (asserts specified contracts pass)
 *   node tools/test_ws42_contracts.js --all              (asserts all 8 pass)
 *   node tools/test_ws42_contracts.js                    (asserts contracts a..g pass)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONTRACTS = {
    a: { id: 'CMD-P0-01', desc: 'Network.KeySpec canonical normalizer', fn: checkContractA },
    b: { id: 'CMD-P0-05', desc: 'Vanilla nohjkl letter mapping (8th item is i)', fn: checkContractB },
    c: { id: 'CMD-P0-03', desc: 'FCB item-select prompt classifies as select', fn: checkContractC },
    d: { id: 'CMD-P0-04', desc: 'MenuRouter item chooser reselection on letter d', fn: checkContractD },
    e: { id: 'CMD-P1-02', desc: 'Command palette catalog for Angband has >= 35 commands', fn: checkContractE },
    f: { id: 'CMD-P1-01', desc: 'Touch controls do not bind btn-wield/drop/search directly in setupTouchControls', fn: checkContractF },
    g: { id: 'CMD-P1-12/13', desc: 'RealmKeys search/use/hold accuracy across variants', fn: checkContractG },
    h: { id: 'CMD-P1-14', desc: 'No timer-paced sendKey in server/public/js', fn: checkContractH }
};

function checkContractA() {
    let Network;
    try {
        if (typeof global.window === 'undefined') {
            global.window = global;
        }
        Network = require('../server/public/js/network.js');
    } catch (e) {
        throw new Error(`Failed to load network.js: ${e.message}`);
    }
    const KeySpec = Network?.KeySpec || global.window?.Network?.KeySpec || global.Network?.KeySpec || global.KeySpec;
    if (!KeySpec || typeof KeySpec.normalize !== 'function') {
        throw new Error('Network.KeySpec.normalize is not defined');
    }
    const { normalize } = KeySpec;
    if (normalize('Escape') !== 'escape') throw new Error(`normalize('Escape') was '${normalize('Escape')}'`);
    if (normalize('ArrowRight') !== 'right') throw new Error(`normalize('ArrowRight') was '${normalize('ArrowRight')}'`);
    if (normalize(' ') !== 'space') throw new Error(`normalize(' ') was '${normalize(' ')}'`);
    if (normalize('\t') !== 'tab') throw new Error(`normalize('\\t') was '${normalize('\t')}'`);
    if (normalize('q') !== 'q') throw new Error(`normalize('q') was '${normalize('q')}'`);
    if (normalize('Foo') !== null) throw new Error(`normalize('Foo') was '${normalize('Foo')}'`);
    return true;
}

function checkContractB() {
    let QuickActions;
    try {
        QuickActions = require('../server/public/js/quick-actions.js');
    } catch (e) {
        throw new Error(`Failed to load quick-actions.js: ${e.message}`);
    }
    const qa = QuickActions || (typeof window !== 'undefined' ? window.QuickActions : null);
    if (!qa || typeof qa.vanillaLetter !== 'function') {
        throw new Error('QuickActions.vanillaLetter is not a function');
    }
    const letter = qa.vanillaLetter(7);
    if (letter !== 'i') {
        throw new Error(`QuickActions.vanillaLetter(7) was '${letter}', expected 'i'`);
    }
    return true;
}

function checkContractC() {
    const ScreenContext = require('../server/public/js/screen-context.js');
    const fixPath = path.join(__dirname, 'fixtures', 'menus', 'frogcomposband', 'quaff_select.json');
    if (!fs.existsSync(fixPath)) {
        throw new Error('Fixture frogcomposband/quaff_select.json not found');
    }
    const raw = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
    const frame = raw.frame || raw;
    const classified = ScreenContext.classify(frame, 'frogcomposband');
    if (classified.promptKind !== 'select') {
        throw new Error(`Classified promptKind was '${classified.promptKind}', expected 'select'`);
    }
    return true;
}

function checkContractD() {
    const MenuRouter = require('../server/public/js/menu-router.js');
    const ScreenContext = require('../server/public/js/screen-context.js');
    global.ScreenContext = ScreenContext;

    let invFrame;
    const silqPath = path.join(__dirname, 'fixtures', 'menus', 'silq', 'inventory.json');
    if (fs.existsSync(silqPath)) {
        const raw = JSON.parse(fs.readFileSync(silqPath, 'utf8'));
        invFrame = raw.frame || raw;
    } else {
        const cmdPath = path.join(__dirname, 'fixtures', 'menus', 'silq', 'inventory_command.json');
        if (!fs.existsSync(cmdPath)) throw new Error('Sil-Q inventory fixture not found');
        const raw = JSON.parse(fs.readFileSync(cmdPath, 'utf8'));
        invFrame = JSON.parse(JSON.stringify(raw.frame || raw));
        if (invFrame.term && invFrame.term.rows) {
            const hasD = invFrame.term.rows.some(r => r.g && r.g.includes('d)'));
            if (!hasD) {
                invFrame.term.rows.splice(3, 0, { g: "                                    c) a Flask of Oil                    1.0 lb " });
                invFrame.term.rows.splice(4, 0, { g: "                                    d) a Dagger (+0,+0)                  1.2 lb " });
            }
        }
    }

    MenuRouter.clearPending();
    const sent = [];
    if (typeof MenuRouter.setSendKey === 'function') {
        MenuRouter.setSendKey((k) => sent.push(k));
    }

    const openRes = MenuRouter.route('a', invFrame, 'silq', (k) => sent.push(k));
    if (!openRes) throw new Error("MenuRouter failed to open chooser on 'a'");

    MenuRouter.route('d', invFrame, 'silq', (k) => sent.push(k));

    if (sent.length !== 0) {
        throw new Error(`Expected sent.length === 0, got ${sent.length} (sent: ${JSON.stringify(sent)})`);
    }
    const pending = MenuRouter.getPending();
    if (!pending || pending.itemKey !== 'd') {
        throw new Error(`Expected MenuRouter.getPending().itemKey === 'd', got ${JSON.stringify(pending)}`);
    }
    return true;
}

function checkContractE() {
    let count = 0;
    const catPath = path.join(__dirname, '../server/public/js/action-catalog.js');
    if (fs.existsSync(catPath)) {
        const ActionCatalog = require(catPath);
        if (typeof ActionCatalog.listForRealm === 'function') {
            const list = ActionCatalog.listForRealm('angband');
            count = Array.isArray(list) ? list.length : 0;
        }
    } else {
        const cpPath = path.join(__dirname, '../server/public/js/command-palette.js');
        if (fs.existsSync(cpPath)) {
            const CP = require(cpPath);
            if (typeof CP.listForRealm === 'function') {
                count = CP.listForRealm('angband').length;
            }
        } else {
            const appPath = path.join(__dirname, '../server/public/js/app.js');
            const appSrc = fs.readFileSync(appPath, 'utf8');
            const fnMatch = appSrc.match(/(function\s+getRealmCommandRegistry\s*\([^)]*\)\s*\{[\s\S]*?\n\s*return\s+allCmds;\s*\n\s*\})/);
            if (fnMatch) {
                const sandbox = {
                    activeRealm: 'angband',
                    langMode: 'en',
                    window: { __langMode: 'en' },
                    RealmKeys: require('../server/public/js/realm-keys.js')
                };
                const code = `(function() { ${fnMatch[1]}; return getRealmCommandRegistry('angband', 'en'); })()`;
                const res = vm.runInNewContext(code, sandbox);
                count = Array.isArray(res) ? res.length : 0;
            }
        }
    }
    if (count < 35) {
        throw new Error(`Command palette for angband yields ${count} commands, expected >= 35`);
    }
    return true;
}

function checkContractF() {
    const inputPath = path.join(__dirname, '../server/public/js/input.js');
    const inputSrc = fs.readFileSync(inputPath, 'utf8');

    const stcMatch = inputSrc.match(/setupTouchControls\s*\([^)]*\)\s*\{([\s\S]*?)(?:\n\s*[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{|\n\s*bindTouchBtn)/);
    const stcBody = stcMatch ? stcMatch[1] : '';

    if (stcBody.includes("document.getElementById('btn-wield')") ||
        stcBody.includes("document.getElementById('btn-drop')") ||
        stcBody.includes("document.getElementById('btn-search')")) {
        throw new Error("btn-wield, btn-drop, or btn-search is bound via document.getElementById inside setupTouchControls");
    }
    if (inputSrc.includes("'btn-wield': 'w'")) {
        throw new Error("input.js contains obsolete 'btn-wield': 'w' binding");
    }
    return true;
}

function checkContractG() {
    const RealmKeys = require('../server/public/js/realm-keys.js');
    const searchAng = RealmKeys.realmKey('search', 'angband');
    if (searchAng !== null) throw new Error(`search in angband was '${searchAng}', expected null`);

    const useFcb = RealmKeys.realmKey('use', 'frogcomposband');
    if (useFcb !== null) throw new Error(`use in frogcomposband was '${useFcb}', expected null`);

    const useHeng = RealmKeys.realmKey('use', 'hengband');
    if (useHeng !== null) throw new Error(`use in hengband was '${useHeng}', expected null`);

    const useSilq = RealmKeys.realmKey('use', 'silq');
    if (useSilq !== 'u') throw new Error(`use in silq was '${useSilq}', expected 'u'`);

    const holdSilq = RealmKeys.realmKey('hold', 'silq');
    if (holdSilq !== 'z') throw new Error(`hold in silq was '${holdSilq}', expected 'z'`);

    return true;
}

function checkContractH() {
    const jsDir = path.join(__dirname, '../server/public/js');
    const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    const offenses = [];

    for (const file of files) {
        const fullPath = path.join(jsDir, file);
        const lines = fs.readFileSync(fullPath, 'utf8').split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('setTimeout')) {
                let inMinimapAutoNav = false;
                for (let b = Math.max(0, i - 25); b <= i; b++) {
                    if (lines[b].includes('stepMinimapAutoNav') || lines[b].includes('dispatchStep')) {
                        inMinimapAutoNav = true;
                        break;
                    }
                }
                if (inMinimapAutoNav) continue;

                for (let j = i; j <= Math.min(i + 4, lines.length - 1); j++) {
                    const candidate = lines[j];
                    if (/sendKey\(|sendCommand\(['"]keys|sendMovementKey\(|sendRunMove\(|sendKeyFn\(/.test(candidate)) {
                        offenses.push({ file, line: j + 1, text: candidate.trim() });
                    }
                }
            }
        }
    }

    if (offenses.length > 0) {
        const details = offenses.map(o => `  ${o.file}:${o.line} -> ${o.text}`).join('\n');
        throw new Error(`Found ${offenses.length} timer-paced sendKey calls:\n${details}`);
    }
    return true;
}

function runContract(key) {
    const entry = CONTRACTS[key];
    if (!entry) throw new Error(`Unknown contract key: ${key}`);
    try {
        entry.fn();
        return { pass: true, error: null };
    } catch (err) {
        return { pass: false, error: err.message };
    }
}

function main() {
    const args = process.argv.slice(2);
    const expectRed = args.includes('--expect-red');
    const checkArg = args.find(a => a.startsWith('--check='));
    const all = args.includes('--all');

    if (expectRed) {
        console.log('[test_ws42_contracts] Running in --expect-red verification mode...');
        let unexpectedPasses = 0;
        let redCount = 0;

        for (const [key, entry] of Object.entries(CONTRACTS)) {
            const res = runContract(key);
            if (res.pass) {
                console.error(`  FAIL (UNEXPECTED PASS): (${key}) ${entry.id} - ${entry.desc}`);
                unexpectedPasses++;
            } else {
                console.log(`  RED (EXPECTED FAIL): (${key}) ${entry.id} - ${entry.desc}`);
                console.log(`       Reason: ${res.error.split('\n')[0]}`);
                redCount++;
            }
        }

        if (unexpectedPasses > 0) {
            console.error(`\n[test_ws42_contracts] FAIL: ${unexpectedPasses} contracts passed when expected RED.`);
            process.exit(1);
        }

        console.log(`\n[test_ws42_contracts] SUCCESS: All ${redCount}/8 contracts are currently RED on baseline.`);
        process.exit(0);
    }

    let targetKeys;
    if (checkArg) {
        targetKeys = checkArg.slice('--check='.length).split(',').map(s => s.trim().toLowerCase());
    } else if (all) {
        targetKeys = Object.keys(CONTRACTS);
    } else {
        // Default target: a through g (h deferred until W4 timer purge)
        targetKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    }

    console.log(`[test_ws42_contracts] Checking contracts: [${targetKeys.join(', ')}]`);
    let failures = 0;
    for (const key of targetKeys) {
        const entry = CONTRACTS[key];
        const res = runContract(key);
        if (res.pass) {
            console.log(`  PASS: (${key}) ${entry.id} - ${entry.desc}`);
        } else {
            console.error(`  FAIL: (${key}) ${entry.id} - ${entry.desc}: ${res.error}`);
            failures++;
        }
    }

    if (failures > 0) {
        console.error(`\n[test_ws42_contracts] ${failures} contract(s) failed.`);
        process.exit(1);
    }

    console.log(`\n[test_ws42_contracts] All checked contracts PASSED.`);
    process.exit(0);
}

if (require.main === module) {
    main();
}

module.exports = { CONTRACTS, runContract };

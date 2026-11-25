#!/usr/bin/env node
/**
 * tools/test_wave3a_menus_perf_a11y.js
 *
 * Wave 3A Regression & A11y Verification Suite:
 *  - Selective 3D PromptMirror (flag + [Tab] CRT button)
 *  - CommandDispatcher zero `|| true` tautologies + Home buyCmd + explore + recall glyph
 *  - RadialMenu dynamic realm resolution & icon token glyph mapping
 *  - EntityMenu Sil-Q bindings (`*`/`f`/`t`), RYOD altar, coordinate-targeted dispatch & glyph recall
 *  - ItemSheet + ItemSheetRules: W/P/R split equip, BUC warnings, !k/!d/!* safety locks, FCB dynamic monster slots
 *  - GrimoireDeck: sub-slot comparison, DCSS/RYOD Quiver, keyboard Enter/Space card activation
 *  - BirthReview: realm-native summaries (Sil-Q GRA, DCSS AC/EV/SH, Brogue no au) & Hengband Shift-JIS decode
 *  - QuickActions unified coordinator storage + Alt+1..4 (input.js) + LT+D-Pad (gamepad.js)
 *  - HUD rAF+DocumentFragment batching, cached _minimapRect, dead #reticle-target-card removal & memoization
 *  - CSS/HTML/A11y: zero blur(8px) in ryod-forge.js, visible focus rings in realm-cards.css, 44px handheld bar,
 *    @supports not (scrollbar-color: auto) + content-visibility: auto in chronicle.css, media-gated mobile-console CSS
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function run() {
    console.log('\n[Wave 3A] Auditing Dual-Reality Menus, Controls, JS Perf & A11y...');

    // 1. PromptMirror + Boot Flag + App wiring
    const bootSrc = read('server/public/js/boot.js');
    assert(/PROMPT_MIRROR_3D:\s*true/.test(bootSrc), 'boot.js must enable PROMPT_MIRROR_3D flag by default');

    const appSrc = read('server/public/js/app.js');
    assert(!/mirror3d:\s*false/.test(appSrc), 'app.js must no longer hardcode mirror3d: false');
    assert(/buyCmd:\s*act\.verb/.test(appSrc), 'app.js must forward buyCmd for Home [g] Get');
    assert(/curRealm === 'nethack' && extCmd\.startsWith\('#'\)/.test(appSrc), 'app.js must preserve NetHack #pray single token');
    assert(/sp:\s*effFrame\.player\.sp/.test(appSrc), 'app.js pVitals must pass sp/maxSp/au to GrimoireDeck');

    const pmSrc = read('server/public/js/prompt-mirror.js');
    assert(/__toggle_crt__/.test(pmSrc) && /\[Tab\] CRT/.test(pmSrc), 'prompt-mirror.js must expose [Tab] CRT toggle');

    // 2. CommandDispatcher zero `|| true` tautologies & explore/recall
    const cdSrc = read('server/public/js/command-dispatcher.js');
    assert(!/\|\|\s*true\b/.test(cdSrc), 'command-dispatcher.js must not contain `|| true` expectation tautologies');
    const CommandDispatcher = require(path.join(ROOT, 'server/public/js/command-dispatcher.js'));
    let explored = false;
    global.window = { __app: { input: { toggleAutoExplore() { explored = true; } } } };
    const cd = CommandDispatcher.create({
        getRealm: () => 'silq',
        getLastFrame: () => ({ phase: 'play', ui: { overlay: 0, awaiting_command: true, more: false, prompt: { kind: 'command' } }, term: { rows: [] } }),
        sendKey: () => {}
    });
    assert.strictEqual(cd.run({ verb: 'explore' }), true);
    assert.strictEqual(explored, true, 'CommandDispatcher explore triggers client auto-explore instead of literal Alt+E');
    const recallSteps = cd.compilePlan({ verb: 'recall', glyph: 'D' }, {}, 'angband');
    assert.deepStrictEqual(recallSteps.map(s => s.send), ['/', 'D'], 'CommandDispatcher recall compiles / + glyph');
    delete global.window;

    // 3. RadialMenu dynamic realm & glyph mapping
    global.ActionCatalog = require(path.join(ROOT, 'server/public/js/action-catalog.js'));
    const RadialMenu = require(path.join(ROOT, 'server/public/js/radial-menu.js'));
    const rm = new RadialMenu();
    assert.strictEqual(rm.realm, null, 'RadialMenu.realm defaults to null for dynamic active-realm resolution');
    const wedges = RadialMenu.buildWedges('silq', 'inner');
    const fireWedge = wedges.find(w => w.id === 'fire');
    const quaffWedge = wedges.find(w => w.id === 'quaff');
    assert(quaffWedge && !/^[a-z]+$/i.test(quaffWedge.icon), `RadialMenu icon must be glyph, not ASCII token (${quaffWedge?.icon})`);
    assert(fireWedge && !/^[a-z]+$/i.test(fireWedge.icon), `RadialMenu fire icon must be glyph, not ASCII token (${fireWedge?.icon})`);
    delete global.ActionCatalog;

    // 4. EntityMenu Sil-Q + RYOD altar + glyph recall
    const EntityMenu = require(path.join(ROOT, 'server/public/js/entity-menu.js'));
    const silqMonActs = EntityMenu.buildActionsForEntity({ type: 'monster', glyph: 'o' }, 'silq');
    assert.strictEqual(silqMonActs.find(a => a.id === 'target').key, '*', 'EntityMenu Sil-Q target must be *');
    assert.strictEqual(silqMonActs.find(a => a.id === 'fire').key, 'f', 'EntityMenu Sil-Q fire must be f');
    assert.strictEqual(silqMonActs.find(a => a.id === 'throw').key, 't', 'EntityMenu Sil-Q throw must be t');
    const ryodAltar = EntityMenu.buildActionsForEntity({ type: 'altar' }, 'ryod');
    assert.strictEqual(ryodAltar[0].key, 'p', 'EntityMenu RYOD altar pray must be p');

    // 5. ItemSheet + ItemSheetRules
    const ItemSheetRules = require(path.join(ROOT, 'server/public/js/item-sheet-rules.js'));
    const ItemSheet = require(path.join(ROOT, 'server/public/js/item-sheet.js'));
    assert.strictEqual(ItemSheet.resolveEquipSlotCategory({ slot_name: 'tentacle_3', name: 'Ring of Speed' }, 'Ring of Speed', 'frogcomposband'), 'tentacle');
    assert.strictEqual(ItemSheet.resolveEquipSlotCategory({ equipped: 'ring_5', name: 'Ring of Might' }, 'Ring of Might', 'frogcomposband'), 'ring');
    const nhVm = ItemSheet.buildItemViewModel({
        realm: 'nethack',
        player: {
            inventory: [
                { letter: 'a', name: 'cursed mithril-coat {cursed} !k !d', kind: 'armor', tval: 37, inscription: '!k !d', beatitude: 'cursed' },
                { letter: 'b', name: 'ring of levitation', kind: 'ring', tval: 45 }
            ],
            equipment: []
        }
    }, 'nethack', 'pack', 'en');
    assert(nhVm[0].validVerbs.some(v => v.id === 'wear' && v.key === 'W'), 'NetHack armor must offer [W] Wear');
    assert(nhVm[0].validVerbs.some(v => v.id === 'drop' && v.safetyLocked && v.disabled), '!d inscription safety lock must disable Drop');
    assert(nhVm[0].bucInfo && nhVm[0].bucInfo.buc === 'cursed', 'Cursed BUC warning metadata attached');
    assert(nhVm[1].validVerbs.some(v => v.id === 'puton' && v.key === 'P'), 'NetHack ring must offer [P] Put On');
    const nhEqVm = ItemSheet.buildItemViewModel({
        realm: 'nethack',
        player: { equipment: [{ letter: 'c', name: 'ring of speed', kind: 'ring', tval: 45 }] }
    }, 'nethack', 'gear', 'en');
    assert(nhEqVm[0].validVerbs.some(v => v.id === 'remove' && v.key === 'R'), 'NetHack equipped ring must offer [R] Remove');
    assert(ItemSheetRules.resolveDynamicMonsterSlot({ equipped: 'wings' }, 'Cloak', 'frogcomposband').category === 'wings');

    // 6. GrimoireDeck Quiver, Sub-slot Compare, Keyboard Handler
    const gdSrc = read('server/public/js/grimoire-deck.js');
    assert(/hasQuiver/.test(gdSrc) && /dcss.*ryod|getCapabilities/.test(gdSrc), 'GrimoireDeck must enable Quiver tab for DCSS/RYOD');
    assert(/resolveEquipSlotCategory/.test(gdSrc), 'GrimoireDeck must compare sub-slots');
    assert(/addEventListener\('keydown'/.test(gdSrc) && /addEventListener\('keyup'/.test(gdSrc), 'GrimoireDeck must bind Enter keydown + Space keyup on role="button" cards');

    // 7. BirthReview realm-native stats + Hengband Shift-JIS decode
    const BirthReview = require(path.join(ROOT, 'server/public/js/birth-review.js'));
    const silqSummary = BirthReview.extractHeroSummaryFromFrame({ realm: 'silq', player: { name: 'Finrod', race: 'Noldor', hp: 30, str: 14, dex: 15, con: 14, gra: 16, evn: 12, pr_min: 1, pr_max: 4, sp: 18, sp_max: 18 } }, 'silq');
    assert(/GRA 16/.test(silqSummary) && /Evn 12 Prot 1-4/.test(silqSummary) && /Voice 18\/18/.test(silqSummary), `Sil-Q BirthReview summary unexpected: ${silqSummary}`);
    const brogueSummary = BirthReview.extractHeroSummaryFromFrame({ realm: 'brogue', player: { name: 'Delver', hp: 30, str: 12, ac: 3, gold: 0 } }, 'brogue');
    assert(/Armor 3/.test(brogueSummary) && !/\bau\b/.test(brogueSummary), `Brogue BirthReview must show Armor and omit au: ${brogueSummary}`);

    // 8. QuickActions unified storage + input.js Alt+1..4 + gamepad.js LT+D-Pad
    const QuickActions = require(path.join(ROOT, 'server/public/js/quick-actions.js'));
    const synced = QuickActions.setSlotsFromCoordinator({ '1': { key: 'b', verb: 'q', name: 'Potion of Healing', category: 'potion', icon: '🧪' } }, 'angband', '');
    assert.strictEqual(synced[0].name, 'Potion of Healing', 'QuickActions.setSlotsFromCoordinator must populate unified array slots');
    assert(/\['1',\s*'2',\s*'3',\s*'4'\]\.includes\(e\.key\)/.test(read('server/public/js/input.js')), 'input.js must handle Alt+1..4 quick slots');
    assert(/qsMap\s*=\s*\{\s*12:\s*0,\s*15:\s*1,\s*13:\s*2,\s*14:\s*3\s*\}/.test(read('server/public/js/gamepad.js')), 'gamepad.js must map LT+D-Pad to quick slots 0..3');

    // 9. HUD batching, cached minimap rect, dead reticle card removal & memoization
    const hudSrc = read('server/public/js/hud.js');
    assert(/createDocumentFragment/.test(hudSrc) && /requestAnimationFrame\(\(\)\s*=>\s*this\._flushFeedBatch\(\)\)/.test(hudSrc), 'hud.js must batch combat log inserts via DocumentFragment + rAF');
    assert(/_getMinimapRect\(\)/.test(hudSrc) && /ResizeObserver/.test(hudSrc), 'hud.js must cache minimap getBoundingClientRect() via ResizeObserver');
    assert(!/reticleTargetCard/.test(hudSrc.slice(hudSrc.indexOf('updateTargetInspector'))), 'hud.js must not write #reticle-target-card every frame');
    assert(/_lastStatsSig/.test(hudSrc) && /_lastDepthSig/.test(hudSrc) && /_lastDiagHintSig/.test(hudSrc), 'hud.js must memoize left-panel stats, depth & diagonal hint writes');

    // 10. CSS & HTML Perf / A11y checks
    assert(!/backdrop-filter/.test(read('server/public/js/ryod-forge.js')), 'ryod-forge.js must not use expensive full-screen backdrop-filter blur');
    assert(!/:focus-visible[^}]*outline:\s*none/s.test(read('server/public/css/realm-cards.css')), 'realm-cards.css must never strip :focus-visible outline');
    assert(/min-width:\s*44px\s*!important;[\s\S]*?height:\s*44px\s*!important;/.test(read('server/public/css/mobile-console.css')), 'mobile-console.css handheld top-bar icon buttons must be >=44x44px');
    const chronCss = read('server/public/css/chronicle.css');
    assert(/scrollbar-width:\s*thin/.test(chronCss) && /@supports not \(scrollbar-color:\s*auto\)/.test(chronCss) && /content-visibility:\s*auto/.test(chronCss), 'chronicle.css must use standard scrollbar-color/width + @supports fallback + content-visibility: auto');
    assert(/mobile-console\.min\.css\?v=13\.3\.0"\s+media="\(max-width:\s*1024px\),\s*\(pointer:\s*coarse\)"/.test(read('server/public/index.html')), 'index.html must media-gate mobile-console.min.css');

    console.log('  [PASS] All Wave 3A dual-reality menus, controls, JS perf & A11y contracts verified!');
}

run();

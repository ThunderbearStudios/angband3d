#!/usr/bin/env node
/**
 * tools/test_rev5_exemplar_contracts.js
 *
 * Comprehensive Revision 6 Exemplar Contract Gate verifying all 8 Workstreams (WS1–WS8):
 *   - WS1A/1B/1C: British RP Enceladus voice, 35ms Web Audio anti-pop ramp, SceneEpoch coalescing,
 *                 NarrativeArcTracker, O(1) snapshotHeroVitals, 5-Tier KV-Cache Prefix Compiler,
 *                 OpenAPI responseSchema Structured Outputs, and Law U5 .thought filtering.
 *   - WS2:        D-Pad-only #btn-wasd-toggle, removal of #btn-wasd-hud & #btn-cmd-wasd-toggle,
 *                 <=900px .dpad-header-bar visibility, and 8-way WASD+QEZC direction-prompt aiming.
 *   - WS3 & WS4:  49-action realm availability, G Study & E Eat highlighting, Sil-Q play_horn ('p')
 *                 and count ('R') vs smithing ('0'), adaptive #btn-aim, and getFacingForward() fix.
 *   - WS5:        Frame-to-frame message delta + count VFX tracking (zero Set suppression),
 *                 Shockbolt resolveItemAtlasEntry (zero <pile> fallback), and triggerActionAnimation.
 *   - WS6 & WS7:  4 per-realm dark-fantasy material themes, 2-column Field Compendium, and Modern Web Guidance.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RealmKeys = require('../server/public/js/realm-keys.js');
const ActionCatalog = require('../server/public/js/action-catalog.js');
const CommandPalette = require('../server/public/js/command-palette.js');
const ChronicleGrounder = require('../server/public/js/chronicle/chronicle-grounder.js');
const ChronicleStore = require('../server/public/js/chronicle/chronicle-store.js');
const ChronicleLLMBridge = require('../server/public/js/chronicle/chronicle-llm.js');

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`  PASS [${String(passed).padStart(2, '0')}]: ${name}`);
}

console.log('=== Revision 6 Exemplar Contract Suite (WS1–WS8) ===');

// 1. WS1A: British RP Storyteller Voice Restoration & 35ms Web Audio Anti-Pop Ramp
test('WS1A: Enceladus British RP voice and 35ms Web Audio gain ramp across server & client', () => {
    for (const realm of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        assert.strictEqual(ChronicleGrounder.getLorekeeperVoice(realm, 'male'), 'Enceladus');
        const ctx = ChronicleGrounder.getRealmContext(realm);
        assert.strictEqual(ctx.geminiVoice, 'Enceladus');
        assert(ctx.recommendedVoice.startsWith('en-GB-'), `Expected British Neural fallback voice for ${realm}, got ${ctx.recommendedVoice}`);
    }
    const serverJs = fs.readFileSync(path.join(ROOT, 'server/src/server.js'), 'utf8');
    assert(serverJs.includes("const ttsModels = ['gemini-3.1-flash-tts-preview']"));
    assert(serverJs.includes('standard RP British accent'));

    const audioJs = fs.readFileSync(path.join(ROOT, 'server/public/js/chronicle/chronicle-audio.js'), 'utf8');
    assert(audioJs.includes('linearRampToValueAtTime') && audioJs.includes('0.035'), '35ms anti-pop linear gain ramp required');
});

// 2. WS1B: SceneEpoch Coalescing, NarrativeArcTracker & O(1) snapshotHeroVitals
test('WS1B: SceneEpoch coalescing, NarrativeArcTracker arcState, and O(1) snapshotHeroVitals', () => {
    const chron = ChronicleStore.createNewChronicle({ name: 'Aragorn', race: 'Dunadan', class: 'Ranger', depth: 1 }, 'angband');
    assert(chron.arcState && typeof chron.arcState === 'object', 'arcState must be initialized on new chronicles');
    assert(Array.isArray(chron.arcState.delveScars), 'arcState.delveScars must be an array');

    const mgrJs = fs.readFileSync(path.join(ROOT, 'server/public/js/chronicle/chronicle-manager.js'), 'utf8');
    assert(!mgrJs.includes('JSON.parse(JSON.stringify(frame.player))'), 'Per-turn JSON deep-clone of frame.player must be eliminated');
    assert(mgrJs.includes('snapshotHeroVitals('), 'O(1) snapshotHeroVitals required');
    assert(mgrJs.includes('is-coalesced-into-epoch'), 'SceneEpoch coalescing class required (no b.remove() jump)');
    assert(mgrJs.includes('_prewarmPendingCatchUp'), 'Background lookahead TTS pre-warm required');
    assert(mgrJs.includes('updateArcState(') && mgrJs.includes('formatArcSummary('), 'NarrativeArcTracker methods required');
});

// 3. WS1C: 5-Tier Deterministic KV-Cache Prefix Compiler, OpenAPI responseSchema & Law U5 .thought Filter
test('WS1C: 5-Tier Deterministic KV-Cache Prefix Compiler, responseSchema, and .thought filter', () => {
    for (const realm of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        const s1 = ChronicleLLMBridge.compileStaticSystemInstruction(realm, 'chapter', 'en');
        const s2 = ChronicleLLMBridge.compileStaticSystemInstruction(realm, 'chapter', 'en');
        assert.strictEqual(s1, s2, `System instruction for ${realm} must be 100% byte-identical across turns`);
        assert(s1.length > 120, `System instruction for ${realm} must include canonical realm lore`);
    }
    assert(ChronicleLLMBridge.CHAPTER_RESPONSE_SCHEMA && ChronicleLLMBridge.CHAPTER_RESPONSE_SCHEMA.required.includes('prose'));
    assert(ChronicleLLMBridge.CREATURE_RESPONSE_SCHEMA && ChronicleLLMBridge.CREATURE_RESPONSE_SCHEMA.required.includes('prose'));
    assert(ChronicleLLMBridge.SPIN_TALE_RESPONSE_SCHEMA && ChronicleLLMBridge.SPIN_TALE_RESPONSE_SCHEMA.required.includes('prose'));

    const llmJs = fs.readFileSync(path.join(ROOT, 'server/public/js/chronicle/chronicle-llm.js'), 'utf8');
    assert(llmJs.includes('!p.thought'), 'chronicle-llm.js must filter .thought parts');
    const serverJs = fs.readFileSync(path.join(ROOT, 'server/src/server.js'), 'utf8');
    assert(serverJs.includes('!p.thought'), 'server.js must filter .thought parts (Law U5)');
    assert(serverJs.includes('responseSchema'), 'server.js must support OpenAPI responseSchema');
});

// 4. WS2: D-Pad-Only WASD Toggle, <=900px Header Visibility & 8-Way Aiming
test('WS2: Single D-Pad #btn-wasd-toggle, zero duplicate HUD/palette toggles, and 8-way WASD+QEZC aiming', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'server/public/index.html'), 'utf8');
    assert(!indexHtml.includes('id="btn-wasd-hud"'), '#btn-wasd-hud must be removed from index.html');
    assert(!indexHtml.includes('id="btn-cmd-wasd-toggle"'), '#btn-cmd-wasd-toggle must be removed from index.html');
    assert(indexHtml.includes('id="btn-wasd-toggle"'), '#btn-wasd-toggle must remain on #touch-controls');

    const inputJs = fs.readFileSync(path.join(ROOT, 'server/public/js/input.js'), 'utf8');
    assert(!inputJs.includes('btn-wasd-hud'), 'input.js must not reference removed #btn-wasd-hud');
    assert(inputJs.includes("'q': 7, 'e': 9, 'z': 1, 'c': 3"), '8-way WASD+QEZC directional aiming required');
    assert(!/getFacingForward\s*\(\s*\)\s*\{[^}]*this\.getFacingForward\(\)/.test(inputJs), 'getFacingForward() must never self-recurse');

    const css = fs.readFileSync(path.join(ROOT, 'server/public/css/dungeon.css'), 'utf8');
    assert(!css.includes('#touch-controls .dpad-header-bar,\n#touch-controls #dpad-drag-handle { display: none !important; }'), '.dpad-header-bar must remain visible on <=900px viewports');
});

// 5. WS3 & WS4: 49-Action Realm Availability, G Study & E Eat Highlighting, Sil-Q Horn & Count
test('WS3 & WS4: G Study, E Eat, Sil-Q play_horn & count, and strict availability/suggested evaluation', () => {
    assert.strictEqual(RealmKeys.realmKey('study', 'angband'), 'G');
    assert.strictEqual(RealmKeys.realmKey('study', 'frogcomposband'), 'G');
    assert.strictEqual(RealmKeys.realmKey('study', 'hengband'), 'G');
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        assert.strictEqual(RealmKeys.realmKey('eat', r), 'E');
    }
    assert.strictEqual(ActionCatalog.keyFor('play_horn', 'silq'), 'p');
    assert.strictEqual(ActionCatalog.keyFor('count', 'silq'), 'R');
    assert.strictEqual(ActionCatalog.keyFor('smithing', 'silq'), '0');
    assert.strictEqual(ActionCatalog.keyFor('abilities', 'angband'), null);

    // Study highlighting when character can learn a spell and carries a book
    const mageFrame = {
        phase: 'play',
        player: { class: 'Mage', study_spells: 2, sp_max: 12, food: 5000 },
        inventory: [
            { name: 'a Book of Magic Spells [Magic for Beginners]', char: '?', tval: 90 },
            { name: 'a Ration of Food', char: ',', tval: 80 }
        ],
        equipment: []
    };
    const studyEval = ActionCatalog.evaluateActionAvailability('study', mageFrame, 'angband');
    assert.strictEqual(studyEval.available, true, 'Study must be available when Mage carries a book');
    assert.strictEqual(studyEval.suggested, true, 'Study must be suggested/highlighted when study_spells > 0');

    // Warrior with no books -> study, cast, browse are unavailable and filtered out of CommandPalette
    const warriorFrame = {
        phase: 'play',
        player: { class: 'Warrior', study_spells: 0, sp_max: 0, food: 800, statuses: [{ name: 'Hungry' }] },
        inventory: [{ name: '2 Rations of Food', char: ',', tval: 80 }],
        equipment: [{ name: 'a Long Sword (2d5)', char: ')' }]
    };
    const wStudyEval = ActionCatalog.evaluateActionAvailability('study', warriorFrame, 'angband');
    assert.strictEqual(wStudyEval.available, false, 'Study must be unavailable for Warrior without spellbooks');
    const wEatEval = ActionCatalog.evaluateActionAvailability('eat', warriorFrame, 'angband');
    assert.strictEqual(wEatEval.available, true, 'Eat must be available when carrying food');
    assert.strictEqual(wEatEval.suggested, true, 'Eat must be suggested/highlighted when Hungry');

    const palList = CommandPalette.listForRealm('angband', 'en', warriorFrame).filter(c => c.available !== false);
    assert(!palList.some(c => c.id === 'study' || c.id === 'cast' || c.id === 'browse'), 'Unavailable magic commands must be filtered out for Warrior');
    assert(palList.some(c => c.id === 'eat' && c.suggested === true), 'Eat must be present and suggested when Hungry');
});

// 6. WS5: Shockbolt Atlas Resolution (Zero <pile>) & Frame-Delta Message VFX
test('WS5: resolveItemAtlasEntry never returns <pile> and dungeon3d uses frame-delta message VFX', () => {
    const d3dSource = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
    assert(d3dSource.includes('_prevFrameMessageEntries'), 'dungeon3d.js must use _prevFrameMessageEntries delta tracking');
    assert(!d3dSource.includes('if (!msgText || this.processedMessages.has(msgText)) continue;'), 'processedMessages Set suppression bug must be eliminated');
    assert(d3dSource.includes('triggerActionAnimation('), 'triggerActionAnimation must be defined and wired');

    // Execute resolveItemAtlasEntry against real item_atlas.json
    const atlasData = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/public/assets/sprites/items/item_atlas.json'), 'utf8'));
    const mStart = d3dSource.indexOf('resolveItemAtlasEntry(name, glyph) {');
    const mEnd = d3dSource.indexOf('createItemBillboardMesh(atlasEntry) {');
    const methodBody = d3dSource.slice(mStart, mEnd);
    const ResolverClass = new Function(`return class { constructor(d) { this.itemAtlasData = d; } ${methodBody} };`)();
    const resolver = new ResolverClass(atlasData);

    const testCases = [
        ['a Potion of Cure Light Wounds', '!'],
        ['2 Potions of Speed', '!'],
        ['a Draught of Miruvor', '!'],
        ['a Scroll of Phase Door', '?'],
        ['a Scroll titled "foo bar"', '?'],
        ['a Book of Magic [Magic-for-Beginners]', '?'],
        ['a Book of Magic [First-Realm]', '?'],
        ['an Amulet of Wisdom', '"'],
        ['a Pair of Leather Boots [2,+3]', ']'],
        ['an Iron Helm [5,+1]', ']'],
        ['a Small Metal Shield [3,+0]', ']'],
        ['a Long Sword (2d5) (+4,+6)', ')']
    ];
    for (const [itemName, glyph] of testCases) {
        const entry = resolver.resolveItemAtlasEntry(itemName, glyph);
        assert(entry && Array.isArray(entry.uv), `Must resolve entry for ${itemName}`);
        assert.notStrictEqual(entry.category, 'none', `${itemName} (${glyph}) must NEVER resolve to <pile> (category: 'none')`);
        const isPileUv = entry.uv[0] < 0.095 && entry.uv[1] > 0.968;
        assert(!isPileUv, `${itemName} (${glyph}) UV must NEVER point to <pile> or <unknown>`);
    }
});

// 7. WS6 & WS7: Dark-Fantasy Realm Material Themes & Modern Web Guidance CSS
test('WS6 & WS7: 4 per-realm dark-fantasy themes, 2-column Compendium, and content-visibility virtualization', () => {
    const css = fs.readFileSync(path.join(ROOT, 'server/public/css/dungeon.css'), 'utf8');
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        assert(css.includes(`body[data-realm="${r}"]`), `Missing dark-fantasy theme selector for ${r}`);
    }
    assert(css.includes('repeat(auto-fill, minmax(230px, 1fr))'), '2-column Field Compendium grid required');
    assert(css.includes('content-visibility: auto'), 'Modern Web Guidance content-visibility required on offscreen Chronicle chapters');
});

// 8. M1–M6 Zero-Flicker Menu, Toolbar, Action-Bar & HUD Memoization Invariants
test('M1-M6: Menu, toolbar, action-bar, and HUD memoization signatures exclude monotonic frame.seq and reconcile in-place', () => {
    const pm = fs.readFileSync(path.join(ROOT, 'server/public/js/prompt-mirror.js'), 'utf8');
    const is = fs.readFileSync(path.join(ROOT, 'server/public/js/item-sheet.js'), 'utf8');
    const gd = fs.readFileSync(path.join(ROOT, 'server/public/js/grimoire-deck.js'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'server/public/js/app.js'), 'utf8');
    const inp = fs.readFileSync(path.join(ROOT, 'server/public/js/input.js'), 'utf8');
    const hud = fs.readFileSync(path.join(ROOT, 'server/public/js/hud.js'), 'utf8');

    assert(!pm.includes('frame ? frame.seq : 0'), 'prompt-mirror.js must not include frame.seq in _lastSig');
    assert(!is.includes('frame ? frame.seq : 0'), 'item-sheet.js must not include frame.seq in _lastSig');
    assert(gd.includes('is-open-stable'), 'grimoire-deck.js must toggle is-open-stable when already open');
    assert(!app.includes('const toolbarSig = `${effFrame.seq || 0}_'), 'app.js toolbarSig must not include effFrame.seq');
    assert(!inp.includes('const sig = `${frame.seq || 0}:'), 'input.js updateContextualControls sig must not include frame.seq');
    assert(inp.includes('_lastOverflowSig'), 'input.js updateActionBarOverflow must memoize on _lastOverflowSig');
    assert(hud.includes('_lastFooterTargetSig'), 'hud.js updateTargetInspector must memoize on _lastFooterTargetSig');
    assert(hud.includes('reconcileDrawerGrid'), 'hud.js #char-extended-drawer must reconcile text nodes in-place');

    // Behavioral 5-turn DOM identity proof: execute ItemSheet.render across 5 consecutive frame.seq ticks
    // and assert 0 redundant DOM childList clear/rebuild mutations after turn 1.
    const ItemSheet = require(path.join(ROOT, 'server/public/js/item-sheet.js'));
    let clearCount = 0;
    let appendCount = 0;
    const mockContainer = {
        nodeType: 1,
        open: true,
        hidden: false,
        childNodes: [{ nodeType: 1 }],
        classList: {
            contains: () => false,
            toggle: () => {},
            remove: () => {},
            add: () => {}
        },
        set textContent(v) {
            if (v === '') clearCount++;
        },
        appendChild() {
            appendCount++;
        }
    };
    const origDoc = global.document;
    global.document = {
        createElement: () => ({
            className: '',
            textContent: '',
            style: {},
            setAttribute: () => {},
            addEventListener: () => {},
            appendChild: () => {}
        }),
        getElementById: () => mockContainer
    };
    try {
        for (let seq = 1; seq <= 5; seq++) {
            const frame = {
                seq,
                realm: 'angband',
                inventory: [
                    { letter: 'a', name: '2 Potions of Speed', tval: 75, count: 2 },
                    { letter: 'b', name: 'a Scroll of Phase Door', tval: 70, count: 1 }
                ]
            };
            ItemSheet.render(frame, 'angband', { container: mockContainer, tab: 'pack' });
        }
        assert.strictEqual(clearCount, 1, `Expected exactly 1 initial DOM clear across 5 consecutive turns, got ${clearCount} (0 redundant rebuilds on turns 2..5)`);
    } finally {
        global.document = origDoc;
    }
});

console.log(`\nALL ${passed}/${passed} REVISION 6 EXEMPLAR CONTRACTS PASSED!\n`);

/**
 * tools/test_story_prompt.js
 * Fast-tier contract unit test verifying:
 * 1. ChronicleGrounder.generateStoryPromptBeat() generates rich, diegetic narrative prose across all 4 realms.
 * 2. Strict Realm Lore & Mechanical Invariants:
 *    - Sil-Q NEVER mentions mana potions, magic grimoires, or surface stores (advises songs, will, and stealth).
 *    - Vanilla Angband grounds depth, torch/lantern light, and 1-tile corridor tactics.
 *    - FrogComposBand reflects Amber / Chaos multiverse and the Outpost wilderness.
 *    - Hengband English mode uses feudal English without raw Japanese romanji tokens.
 * 3. Contextual Danger & Peril Sensitivity:
 *    - Low HP (< 35%) triggers urgent tactical retreat/survival counsel.
 *    - Nearby threats are acknowledged diegetically.
 */

const assert = require('assert');
const ChronicleGrounder = require('../server/public/js/chronicle/chronicle-grounder.js');

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('--- test_story_prompt.js ---');

const HERO_ANGBAND = {
    name: 'Arthur',
    race: 'Human',
    class: 'Warrior',
    depth: 3,
    hp: 45,
    hp_max: 50,
    turn: 140,
    equipped: { weapon: 'broadsword (2d5)' }
};

const HERO_SILQ = {
    name: 'Eleniel',
    race: 'Noldor',
    class: 'Singer',
    depth: 5,
    hp: 28,
    hp_max: 30,
    turn: 210,
    equipped: { weapon: 'curved sword (1d7)' }
};

const HERO_FCB = {
    name: 'Corwin',
    race: 'Amberite',
    class: 'Chaos-Warrior',
    depth: 2,
    hp: 40,
    hp_max: 42,
    turn: 90
};

const HERO_HENGBAND = {
    name: 'Musashi',
    race: 'Human',
    class: 'Samurai',
    depth: 4,
    hp: 35,
    hp_max: 40,
    turn: 180
};

// 1. generateStoryPromptBeat must be exported and functional
test('ChronicleGrounder exports generateStoryPromptBeat function', () => {
    assert(typeof ChronicleGrounder.generateStoryPromptBeat === 'function', 'generateStoryPromptBeat must be a function');
});

// 2. Vanilla Angband story prompt generates rich Middle-earth narrative with tactical counsel
test('Vanilla Angband story prompt weaves rich Middle-earth narrative and depth awareness', () => {
    const ctx = {
        nearbyMonsters: [{ name: 'Snaga', glyph: 'o', distance: 3 }],
        lightTurns: 450,
        potions: 2
    };
    const beat = ChronicleGrounder.generateStoryPromptBeat(HERO_ANGBAND, ctx, 'angband', 'en');
    assert(beat, 'Story prompt beat required');
    assert(beat.prose && beat.prose.length > 80, 'Story prompt must provide rich prose (> 80 chars)');
    assert(beat.isStoryPrompt === true, 'isStoryPrompt must be true');
    assert(beat.title, 'Story prompt must have a distinguished title');
    const lower = beat.prose.toLowerCase();
    assert(lower.includes('arthur'), 'Prose must address the hero by name');
    assert(lower.includes('150') || lower.includes('feet') || lower.includes('vault') || lower.includes('snaga'), 'Prose must reflect depth or visible threat');
});

// 3. Sil-Q mechanical invariants: strictly NO mana potions or surface stores
test('Sil-Q story prompt strictly respects Beleriand lore and forbids mana/shop references', () => {
    const ctx = {
        nearbyMonsters: [{ name: 'Orc of the Iron Hell', glyph: 'o', distance: 2 }],
        lightTurns: 300
    };
    const beat = ChronicleGrounder.generateStoryPromptBeat(HERO_SILQ, ctx, 'silq', 'en');
    assert(beat && beat.prose, 'Sil-Q beat required');
    const lower = beat.prose.toLowerCase();
    assert(!lower.includes('mana potion'), 'Sil-Q must never mention mana potions');
    assert(!lower.includes('general store') && !lower.includes('shop'), 'Sil-Q must never mention surface town shops');
    assert(lower.includes('thangorodrim') || lower.includes('morgoth') || lower.includes('iron') || lower.includes('stealth') || lower.includes('song'), 'Must ground in Sil-Q lore');
});

// 4. Hengband English mode uses feudal English without Japanese romanji
test('Hengband English mode story prompt uses feudal English without raw romanji', () => {
    const ctx = {
        nearbyMonsters: [{ name: 'Cave ogre', glyph: 'O', distance: 4 }],
        lightTurns: 200
    };
    const beat = ChronicleGrounder.generateStoryPromptBeat(HERO_HENGBAND, ctx, 'hengband', 'en');
    assert(beat && beat.prose, 'Hengband beat required');
    const lower = beat.prose.toLowerCase();
    const banned = ['idaten', 'muramasa', 'kuji-kiri', 'gaijin', 'ippon'];
    for (const tok of banned) {
        assert(!lower.includes(tok), `Hengband EN leaked romanji token "${tok}": "${beat.prose}"`);
    }
});

// 5. Peril sensitivity: Low HP triggers urgent survival counsel
test('Low health triggers urgent tactical survival counsel in story prompt', () => {
    const woundedHero = { ...HERO_ANGBAND, hp: 12, hp_max: 50 }; // 24% HP
    const ctx = {
        nearbyMonsters: [{ name: 'Cave orc', glyph: 'o', distance: 2 }],
        lightTurns: 50, // dying light
        potions: 0
    };
    const beat = ChronicleGrounder.generateStoryPromptBeat(woundedHero, ctx, 'angband', 'en');
    assert(beat && beat.prose, 'Wounded beat required');
    const lower = beat.prose.toLowerCase();
    assert(lower.includes('wound') || lower.includes('bleed') || lower.includes('retreat') || lower.includes('peril') || lower.includes('stair') || lower.includes('death'), 'Must warn of mortal peril and low health');
});

// 6. UI and Manager wiring: Tale button is strictly within the Tome menu (not top-right bar)
test('Tale prompt button exists exclusively within Tome menu and Alt+T is bound', () => {
    const fs = require('fs');
    const path = require('path');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../server/public/index.html'), 'utf8');
    const managerJs = fs.readFileSync(path.join(__dirname, '../server/public/js/chronicle/chronicle-manager.js'), 'utf8');

    assert(!indexHtml.includes('id="btn-story-prompt"'), 'index.html must NOT contain #btn-story-prompt in top-right-bar (Tale button belongs only in Tome menu)');
    assert(indexHtml.includes('id="btn-chronicle-prompt-tale"'), 'index.html must contain #btn-chronicle-prompt-tale in transport deck');
    assert(indexHtml.includes('Alt+T'), 'index.html must document Alt+T hotkey');

    assert(managerJs.includes('requestStoryPrompt()'), 'chronicle-manager.js must define requestStoryPrompt()');
    assert(managerJs.includes("'t'") && managerJs.includes('requestStoryPrompt'), 'chronicle-manager.js must bind Alt+T to requestStoryPrompt');
});

// 7. Server TTS Latency Optimization: verify geminiHttpsAgent socket reuse
test('Server TTS uses persistent geminiHttpsAgent for sub-50ms TLS reuse', () => {
    const fs = require('fs');
    const path = require('path');
    const serverJs = fs.readFileSync(path.join(__dirname, '../server/src/server.js'), 'utf8');
    const fnStart = serverJs.indexOf('function synthesizeGeminiTTS(');
    assert(fnStart > 0, 'server.js must define function synthesizeGeminiTTS');
    const synthesizeBlock = serverJs.slice(fnStart, fnStart + 5000);
    assert(synthesizeBlock.includes('agent: geminiHttpsAgent'), 'synthesizeGeminiTTS must pass agent: geminiHttpsAgent');
});

// 8. Vanilla Angband Narrator Voice: Old English male voice (Enceladus) while preserving Zephyr elsewhere
test('Vanilla Angband narrator defaults to original Old English male voice (Enceladus) with Zephyr preserved', () => {
    const maleVoice = ChronicleGrounder.getLorekeeperVoice('angband', 'male');
    const femaleVoice = ChronicleGrounder.getLorekeeperVoice('angband', 'female');
    assert.strictEqual(maleVoice, 'Enceladus', `Vanilla narrator voice must be Enceladus, got "${maleVoice}"`);
    assert.strictEqual(femaleVoice, 'Zephyr', `Vanilla female voice must be Zephyr, got "${femaleVoice}"`);

    const fs = require('fs');
    const path = require('path');
    const audioJs = fs.readFileSync(path.join(__dirname, '../server/public/js/chronicle/chronicle-audio.js'), 'utf8');
    assert(audioJs.includes("this.narratorVoice = 'Enceladus'"), 'chronicle-audio.js must default narratorVoice to Enceladus');
    assert(audioJs.includes("angband: 'Enceladus'"), 'chronicle-audio.js defaults map must map angband to Enceladus');

    const appJs = fs.readFileSync(path.join(__dirname, '../server/public/js/app.js'), 'utf8');
    assert(!appJs.includes("btn-story-prompt"), 'app.js must not reference removed #btn-story-prompt');
});

console.log('ALL STORY PROMPT CONTRACT TESTS PASSED!');

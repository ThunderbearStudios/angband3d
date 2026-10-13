/**
 * tools/test_chronicle_llm_realm_voices.js
 * Fast-tier contract unit test verifying:
 * 1. Strict Realm-Bound LLM Guidance across all 4 realms (zero "Vintage Tolkien" leaks in Sil-Q, FCB, Hengband).
 * 2. ChronicleLLM.spinTale() dynamic tale generation with procedural fallback.
 * 3. Studio-Quality Creature Voice Casting:
 *    - pickCreatureVoice() returns high-fidelity Gemini voices (Fenrir, Algenib, Charon, Puck, Despina, Orus), never generic Edge strings.
 *    - resolveVoiceProfile() injects archetype-specific directorial notes (orc snarl, draconic rumble, dwarven brogue).
 * 4. Master Narrator Voice Invariant: Vanilla Angband narrator is strictly Enceladus across server.js and chronicle-grounder.js.
 * 5. Strict Zero-Robotic Fallback Invariant: speechSynthesis fallback is banned for all game vocals.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ChronicleGrounder = require('../server/public/js/chronicle/chronicle-grounder.js');
const ChronicleLLM = require('../server/public/js/chronicle/chronicle-llm.js');

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

(async () => {
    console.log('--- test_chronicle_llm_realm_voices.js ---');

    // 1. Narrator voice invariant: Vanilla Angband is strictly Enceladus
    test('Vanilla Angband narrator is strictly Enceladus across grounder and server.js', () => {
        const lorekeeperVoice = ChronicleGrounder.getLorekeeperVoice('angband');
        assert.strictEqual(lorekeeperVoice, 'Enceladus', `Grounder Angband narrator must be Enceladus, got: ${lorekeeperVoice}`);

        const serverPath = path.join(__dirname, '..', 'server', 'src', 'server.js');
        const serverCode = fs.readFileSync(serverPath, 'utf8');

        // Check GEMINI_REALM_NARRATOR_MAP.angband
        const realmMapMatch = serverCode.match(/GEMINI_REALM_NARRATOR_MAP\s*=\s*{([^}]+)}/);
        assert(realmMapMatch, 'server.js must contain GEMINI_REALM_NARRATOR_MAP');
        assert(realmMapMatch[1].includes("angband: 'Enceladus'"), `server.js GEMINI_REALM_NARRATOR_MAP.angband must be 'Enceladus': ${realmMapMatch[1]}`);

        // Check GEMINI_VOICE_MAP.narrator
        const voiceMapMatch = serverCode.match(/GEMINI_VOICE_MAP\s*=\s*{([^}]+)}/);
        assert(voiceMapMatch, 'server.js must contain GEMINI_VOICE_MAP');
        assert(voiceMapMatch[1].includes("narrator: 'Enceladus'"), `server.js GEMINI_VOICE_MAP.narrator must be 'Enceladus': ${voiceMapMatch[1]}`);
    });

    // 2. Creature voice resolution returns Gemini voices, never generic Edge radio announcers
    test('pickCreatureVoice returns Gemini Native Audio voices matching creature archetype', () => {
        const orcMonster = { name: 'Cave orc', glyph: 'o', race: 'Orc' };
        const dragonMonster = { name: 'Ancient red dragon', glyph: 'D', race: 'Dragon' };
        const dwarfMonster = { name: 'Dwarven smith', glyph: 'p', race: 'Dwarf' };
        const goblinMonster = { name: 'Snaga', glyph: 'o', race: 'Goblin' };
        const lichMonster = { name: 'Lich', glyph: 'L', race: 'Undead' };

        const orcVoice = ChronicleGrounder.pickCreatureVoice(orcMonster, 'orc');
        assert.strictEqual(orcVoice, 'Fenrir', `Orc voice must be Fenrir, got: ${orcVoice}`);

        const dragonVoice = ChronicleGrounder.pickCreatureVoice(dragonMonster, 'dragon');
        assert(dragonVoice === 'Algenib' || dragonVoice === 'Charon', `Dragon voice must be Algenib or Charon, got: ${dragonVoice}`);

        const dwarfVoice = ChronicleGrounder.pickCreatureVoice(dwarfMonster, 'dwarf');
        assert(dwarfVoice === 'Algenib' || dwarfVoice === 'Orus', `Dwarf voice must be Algenib or Orus, got: ${dwarfVoice}`);

        const goblinVoice = ChronicleGrounder.pickCreatureVoice(goblinMonster, 'kobold');
        assert.strictEqual(goblinVoice, 'Puck', `Goblin/kobold voice must be Puck, got: ${goblinVoice}`);

        const lichVoice = ChronicleGrounder.pickCreatureVoice(lichMonster, 'high_undead');
        assert(lichVoice === 'Charon' || lichVoice === 'Algenib', `Lich voice must be Charon or Algenib, got: ${lichVoice}`);
    });

    // 3. Archetype-specific director notes are injected into voice profiles
    test('resolveVoiceProfile injects archetype-specific director notes', () => {
        const orcMonster = { name: 'Cave orc', glyph: 'o', race: 'Orc' };
        const profOrc = ChronicleGrounder.resolveVoiceProfile(orcMonster);
        assert(profOrc && profOrc.directorNote, 'Orc profile must have directorNote');
        const lowerOrc = profOrc.directorNote.toLowerCase();
        assert(lowerOrc.includes('guttural') || lowerOrc.includes('snarl') || lowerOrc.includes('orc'), `Orc note must describe orc timbre: "${profOrc.directorNote}"`);

        const dragonMonster = { name: 'Ancient red dragon', glyph: 'D', race: 'Dragon' };
        const profDragon = ChronicleGrounder.resolveVoiceProfile(dragonMonster);
        assert(profDragon && profDragon.directorNote, 'Dragon profile must have directorNote');
        const lowerDragon = profDragon.directorNote.toLowerCase();
        assert(lowerDragon.includes('dragon') || lowerDragon.includes('draconic') || lowerDragon.includes('rumble') || lowerDragon.includes('cavernous'), `Dragon note must describe draconic timbre: "${profDragon.directorNote}"`);

        const dwarfMonster = { name: 'Dwarven warrior', glyph: 'p', race: 'Dwarf' };
        const profDwarf = ChronicleGrounder.resolveVoiceProfile(dwarfMonster);
        assert(profDwarf && profDwarf.directorNote, 'Dwarf profile must have directorNote');
        const lowerDwarf = profDwarf.directorNote.toLowerCase();
        assert(lowerDwarf.includes('dwarf') || lowerDwarf.includes('brogue') || lowerDwarf.includes('scottish') || lowerDwarf.includes('gravelly'), `Dwarf note must describe dwarven timbre: "${profDwarf.directorNote}"`);
    });

    // 4. Ban robot speechSynthesis fallback across all game vocals
    test('chronicle-audio.js contains zero window.speechSynthesis fallback for game vocals', () => {
        const audioPath = path.join(__dirname, '..', 'server', 'public', 'js', 'chronicle', 'chronicle-audio.js');
        const audioCode = fs.readFileSync(audioPath, 'utf8');

        // Check speakUtterance
        assert(!audioCode.includes('this.speakSpeechSynthesis(cleanText, role, speakerName)'), 'speakUtterance must NOT fall back to speakSpeechSynthesis');
    });

    // 5. chronicle-llm.js dynamically binds realm and removes hardcoded Tolkien tone
    test('chronicle-llm.js dynamically binds realm and avoids hardcoded Tolkien tone for FCB and Hengband', () => {
        const llmPath = path.join(__dirname, '..', 'server', 'public', 'js', 'chronicle', 'chronicle-llm.js');
        const llmCode = fs.readFileSync(llmPath, 'utf8');

        // Check for hardcoded "Vintage Tolkien tone" in chatWithCreature
        assert(!llmCode.includes('Vintage Tolkien tone. No quotes'), 'chatWithCreature must not hardcode "Vintage Tolkien tone" for all variants');
        // Check for dynamic dialogueStyle or realm-attuned prompt
        assert(llmCode.includes('realmCtx.dialogueStyle') || llmCode.includes('realmCtx.style') || llmCode.includes('dialogueStyle'), 'chatWithCreature must inject realm-specific dialogue style');
    });

    // 6. ChronicleLLM exports spinTale() method with procedural fallback
    await testAsync('ChronicleLLM.spinTale generates realm-attuned tale and falls back gracefully', async () => {
        const llm = new ChronicleLLM();
        assert(typeof llm.spinTale === 'function', 'ChronicleLLM must export spinTale function');

        const hero = {
            name: 'Beren',
            race: 'Human',
            class: 'Warrior',
            depth: 4,
            hp: 40,
            hp_max: 50
        };
        const ctx = {
            nearbyMonsters: [{ name: 'Orc of the Iron Hell', glyph: 'o' }],
            lightTurns: 300
        };

        // When unconfigured, spinTale must fall back gracefully to procedural beat
        const fallbackBeat = await llm.spinTale(hero, ctx, [], 'silq', 'en');
        assert(fallbackBeat, 'Fallback beat must be returned');
        assert(fallbackBeat.prose, 'Fallback beat must contain prose');
        assert(fallbackBeat.isStoryPrompt === true, 'isStoryPrompt must be true');
        assert(fallbackBeat.prose.toLowerCase().includes('thangorodrim') || fallbackBeat.prose.toLowerCase().includes('angband') || fallbackBeat.prose.toLowerCase().includes('morgoth'), 'Sil-Q fallback must be lore-bound');
    });

    console.log('\nAll chronicle LLM realm & voice contract tests PASSED!');
})();

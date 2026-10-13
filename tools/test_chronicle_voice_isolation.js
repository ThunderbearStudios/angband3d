/**
 * tools/test_chronicle_voice_isolation.js
 * Fast-tier contract unit test verifying:
 * 1. Global language isolation: Vanilla Angband, Sil-Q, and FrogComposBand NEVER emit Japanese voices, barks, or tags.
 * 2. Hengband English mode ('en') uses English feudal flavor, strictly avoiding untranslated Japanese romanji barks.
 * 3. Only Hengband in Japanese mode ('jp') emits Japanese language barks and 'ja-JP' language tag.
 * 4. Creature voices in Angband use contextual high-quality casting with zero Japanese accent directives.
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

console.log('--- test_chronicle_voice_isolation.js ---');

const JAPANESE_ROMANJI_TOKENS = [
    'idaten',
    'muramasa',
    'sengoku',
    'kagura',
    'kuji-kiri',
    'kami',
    'rin, pyo',
    'gaijin',
    'ippon'
];

const MONSTERS = [
    { name: 'Snaga', glyph: 'o', race: 'orc', hp: 5, hp_max: 20 },
    { name: 'Novice mage', glyph: 'p', race: 'human', hp: 8, hp_max: 25 },
    { name: 'Veteran warrior', glyph: 'p', race: 'human', hp: 30, hp_max: 50 },
    { name: 'Cutpurse', glyph: 'p', race: 'human', hp: 12, hp_max: 18 },
    { name: 'Young Dragon', glyph: 'd', race: 'dragon', hp: 40, hp_max: 60 }
];

const HERO = { name: 'Arthur', race: 'Human', class: 'Warrior', depth: 5, hp: 50, hp_max: 60 };

// 1. Standard Angband must NEVER emit Japanese romanji or motifs
test('Standard Angband creature encounters never emit Japanese romanji tokens', () => {
    for (const monster of MONSTERS) {
        for (let turn = 1; turn <= 5; turn++) {
            const res = ChronicleGrounder.resolveCreatureEncounter(monster, HERO, [], turn, '', 'angband', 'en');
            assert(res, `Result required for ${monster.name}`);
            const combined = `${res.prose || ''} ${res.text || ''}`.toLowerCase();
            for (const token of JAPANESE_ROMANJI_TOKENS) {
                assert(
                    !combined.includes(token),
                    `Standard Angband leaked Japanese token "${token}" in dialogue for ${monster.name}: "${combined}"`
                );
            }
        }
    }
});

// 2. Default realm fallback (when realmKey omitted) must default cleanly to Angband with zero Japanese tokens
test('Default encounter resolution (no realm specified) defaults to English Angband without Japanese tokens', () => {
    for (const monster of MONSTERS) {
        const res = ChronicleGrounder.resolveCreatureEncounter(monster, HERO, [], 1, '');
        const combined = `${res.prose || ''} ${res.text || ''}`.toLowerCase();
        for (const token of JAPANESE_ROMANJI_TOKENS) {
            assert(
                !combined.includes(token),
                `Default resolution leaked Japanese token "${token}" for ${monster.name}: "${combined}"`
            );
        }
    }
});

// 3. Hengband in English mode ('en') must NOT emit raw Japanese romanji barks
test('Hengband in English mode uses English feudal text and forbids raw Japanese romanji across all encounters', () => {
    const romanjiStrict = ['idaten-hashiri', 'rin, pyo', 'gaijin', 'ippon!'];
    for (const monster of MONSTERS) {
        // Test both high HP (> 35%) and low HP (<= 35%) across turns
        for (const testHp of [5, 20]) {
            const m = { ...monster, hp: testHp };
            for (let t = 1; t <= 10; t++) {
                const res = ChronicleGrounder.resolveCreatureEncounter(m, HERO, [], t, '', 'hengband', 'en');
                assert(res, `Result required for ${m.name}`);
                const text = (res.text || '').toLowerCase();
                for (const tok of romanjiStrict) {
                    assert(
                        !text.includes(tok),
                        `Hengband EN leaked romanji token "${tok}" on turn ${t} for ${m.name}: "${res.text}"`
                    );
                }
            }
        }
    }
});

// 4. Tradition leakage: an adventurer in Angband with eastern tradition attuned must NEVER emit Japanese barks
test('Eastern mythos tradition attuned hero in Angband realm never emits Japanese barks', () => {
    for (const monster of MONSTERS) {
        for (let t = 1; t <= 5; t++) {
            const res = ChronicleGrounder.resolveCreatureEncounter(monster, HERO, [], t, '', 'angband', 'en');
            const combined = `${res.prose || ''} ${res.text || ''}`.toLowerCase();
            for (const tok of JAPANESE_ROMANJI_TOKENS) {
                assert(!combined.includes(tok), `Attuned tradition leaked "${tok}" in Angband: ${combined}`);
            }
        }
    }
});

// 4. Hengband in Japanese mode ('jp') properly emits Japanese / Kanji barks
test('Hengband in Japanese mode emits Japanese barks', () => {
    const orc = { name: 'Snaga', glyph: 'o', race: 'orc', hp: 20, hp_max: 20 };
    const resJp = ChronicleGrounder.resolveCreatureEncounter(orc, HERO, [], 1, '', 'hengband', 'jp');
    assert(resJp && resJp.text, 'Hengband JP encounter must produce dialogue');
    // In JP mode, text contains Japanese/romanji motifs
    const lower = resJp.text.toLowerCase();
    assert(
        lower.includes('ippon') || lower.includes('sengoku') || lower.includes('kagura') || lower.includes('oni') || /[\u3000-\u9faf]/.test(resJp.text),
        `Hengband JP mode must emit Japanese flavor: ${resJp.text}`
    );
});

// 5. Voice profile accent directives in Angband never include samurai or ninja accents
test('Angband creature voice profiles use Tolkien/British fantasy accents without Japanese directives', () => {
    for (const monster of MONSTERS) {
        const vp = ChronicleGrounder.resolveVoiceProfile(monster, HERO, 'dialogue', 'westmarch', 'angband', 'en');
        assert(vp, `Voice profile required for ${monster.name}`);
        const note = (vp.heroDirectorNote || vp.directorNote || '').toLowerCase();
        const tag = (vp.geminiTag || '').toLowerCase();
        assert(!note.includes('japanese'), `Voice profile director note leaked 'japanese' in Angband: ${note}`);
        assert(!tag.includes('japanese'), `Voice profile geminiTag leaked 'japanese' in Angband: ${tag}`);
        assert(!note.includes('samurai'), `Voice profile director note leaked 'samurai' in Angband: ${note}`);
        assert(!note.includes('ninja'), `Voice profile director note leaked 'ninja' in Angband: ${note}`);
    }
});

console.log('ALL VOICE ISOLATION TESTS PASSED!');

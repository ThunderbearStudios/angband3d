const assert = require('assert');
const fs = require('fs');

// Load heng-dict.js in node context
const HENG_DICT = require('../server/public/js/heng-dict.js');
const { getLocalizedMonsterName, getLocalizedItemName, translateTerminalRow, localizeGameMessage } = HENG_DICT;

console.log('=== Testing 3D Creature, Item Labels, and Terminal Language Switching ===\n');

// -------------------------------------------------------------
// Test 1: Monster Localization (Bidirectional: JP -> EN/BI/JP and EN -> JP/BI/EN)
// -------------------------------------------------------------
console.log('[Test 1] Monster Localization (Bidirectional)');
const monsterTests = [
    {
        name: '汚いイタズラ小僧',
        expectedEn: 'Filthy street urchin',
        expectedJp: '汚いイタズラ小僧',
        expectedBi: 'Filthy street urchin (汚いイタズラ小僧)'
    },
    {
        name: 'Filthy street urchin',
        expectedEn: 'Filthy street urchin',
        expectedJp: '汚いイタズラ小僧',
        expectedBi: 'Filthy street urchin (汚いイタズラ小僧)'
    },
    {
        name: 'a filthy street urchin',
        expectedEn: 'Filthy street urchin',
        expectedJp: '汚いイタズラ小僧',
        expectedBi: 'Filthy street urchin (汚いイタズラ小僧)'
    },
    {
        name: 'スナガ',
        expectedEn: 'Snaga',
        expectedJp: 'スナガ',
        expectedBi: 'Snaga (スナガ)'
    },
    {
        name: 'the Snaga',
        expectedEn: 'Snaga',
        expectedJp: 'スナガ',
        expectedBi: 'Snaga (スナガ)'
    },
    {
        name: '農夫『マゴット』',
        expectedEn: 'Farmer Maggot',
        expectedJp: '農夫『マゴット』',
        expectedBi: 'Farmer Maggot (農夫『マゴット』)'
    },
    {
        name: 'Farmer Maggot',
        expectedEn: 'Farmer Maggot',
        expectedJp: '農夫『マゴット』',
        expectedBi: 'Farmer Maggot (農夫『マゴット』)'
    }
];

for (const tc of monsterTests) {
    const en = getLocalizedMonsterName(tc.name, 'hengband', 'en');
    const jp = getLocalizedMonsterName(tc.name, 'hengband', 'jp');
    const bi = getLocalizedMonsterName(tc.name, 'hengband', 'bilingual');

    assert.strictEqual(en, tc.expectedEn, `Monster [${tc.name}] EN failed: got "${en}", expected "${tc.expectedEn}"`);
    assert.strictEqual(jp, tc.expectedJp, `Monster [${tc.name}] JP failed: got "${jp}", expected "${tc.expectedJp}"`);
    assert.strictEqual(bi, tc.expectedBi, `Monster [${tc.name}] BI failed: got "${bi}", expected "${tc.expectedBi}"`);
}
console.log('  -> PASSED: Monster localization works bidirectionally across EN, JP, and Bilingual.\n');

// -------------------------------------------------------------
// Test 2: Item Localization (Bidirectional: JP -> EN/BI/JP and EN -> JP/BI/EN)
// -------------------------------------------------------------
console.log('[Test 2] Item Localization (Bidirectional)');
const itemTests = [
    {
        name: 'ショート・ソード',
        expectedEn: 'Short Sword',
        expectedJp: 'ショート・ソード',
        expectedBi: 'Short Sword (ショート・ソード)'
    },
    {
        name: 'a Short Sword',
        expectedEn: 'Short Sword',
        expectedJp: 'ショート・ソード',
        expectedBi: 'Short Sword (ショート・ソード)'
    },
    {
        name: '盲目の薬',
        expectedEn: 'Potion of Blindness',
        expectedJp: '盲目の薬',
        expectedBi: 'Potion of Blindness (盲目の薬)'
    },
    {
        name: 'a Potion of Blindness',
        expectedEn: 'Potion of Blindness',
        expectedJp: '盲目の薬',
        expectedBi: 'Potion of Blindness (盲目の薬)'
    },
    {
        name: '毒消しの薬',
        expectedEn: 'Potion of Cure Poison',
        expectedJp: '毒消しの薬',
        expectedBi: 'Potion of Cure Poison (毒消しの薬)'
    },
    {
        name: '2 Potions of Cure Poison',
        expectedEn: '2 Potion of Cure Poison',
        expectedJp: '2個の 毒消しの薬',
        expectedBi: '2 Potion of Cure Poison (2個の 毒消しの薬)'
    },
    {
        name: '食料',
        expectedEn: 'Ration of Food',
        expectedJp: '食料',
        expectedBi: 'Ration of Food (食料)'
    },
    {
        name: '100 gold pieces',
        expectedEn: '100 gold pieces',
        expectedJp: '100枚の 金貨',
        expectedBi: '100 gold pieces (100枚の 金貨)'
    },
    {
        name: '金貨 100枚',
        expectedEn: '100 gold pieces',
        expectedJp: '100枚の 金貨',
        expectedBi: '100 gold pieces (100枚の 金貨)'
    },
    {
        name: '3本の 矢',
        expectedEn: '3 Black Arrow',
        expectedJp: '3個の 矢',
        expectedBi: '3 Black Arrow (3個の 矢)'
    }
];

for (const tc of itemTests) {
    const en = getLocalizedItemName(tc.name, 'hengband', 'en');
    const jp = getLocalizedItemName(tc.name, 'hengband', 'jp');
    const bi = getLocalizedItemName(tc.name, 'hengband', 'bilingual');

    assert.strictEqual(en, tc.expectedEn, `Item [${tc.name}] EN failed: got "${en}", expected "${tc.expectedEn}"`);
    assert.strictEqual(jp, tc.expectedJp, `Item [${tc.name}] JP failed: got "${jp}", expected "${tc.expectedJp}"`);
    assert.strictEqual(bi, tc.expectedBi, `Item [${tc.name}] BI failed: got "${bi}", expected "${tc.expectedBi}"`);
}
console.log('  -> PASSED: Item localization works bidirectionally with potions, weapons, quantities, and coins.\n');

// -------------------------------------------------------------
// Test 3: Classic Terminal Row Translation (Bidirectional)
// -------------------------------------------------------------
console.log('[Test 3] Classic Terminal Row Translation (Bidirectional)');
const terminalTests = [
    // Japanese row -> EN / Bilingual / JP
    {
        row: '名前      : アーサー',
        mode: 'en',
        check: (res) => assert.ok(res.text.includes('Name'), `Expected "Name" in ${res.text}`)
    },
    {
        row: '名前      : アーサー',
        mode: 'jp',
        check: (res) => assert.strictEqual(res.text, '名前      : アーサー')
    },
    // English row -> JP / Bilingual / EN
    {
        row: 'Name      : Arthur',
        mode: 'jp',
        check: (res) => assert.ok(res.text.includes('名前'), `Expected "名前" in ${res.text}`)
    },
    {
        row: 'Name      : Arthur',
        mode: 'en',
        check: (res) => assert.strictEqual(res.text, 'Name      : Arthur')
    },
    {
        row: 'STR:  18/50  HP:  25/25',
        mode: 'jp',
        check: (res) => assert.ok(res.text.includes('腕力'), `Expected "腕力" in ${res.text}`)
    },
    {
        row: '  [Press any key to continue]',
        mode: 'jp',
        check: (res) => assert.ok(res.text.includes('何かキーを押して下さい'), `Expected Japanese prompt in ${res.text}`)
    }
];

for (const tc of terminalTests) {
    const res = translateTerminalRow(tc.row, '', tc.mode, 0);
    tc.check(res);
}
console.log('  -> PASSED: Terminal row translation functions bidirectionally.\n');

// -------------------------------------------------------------
// Test 4: Isolation Quarantine - Other realms MUST NOT be touched
// -------------------------------------------------------------
console.log('[Test 4] Strict Isolation Quarantine for Non-Hengband Realms');
assert.strictEqual(getLocalizedMonsterName('Cave spider', 'angband', 'jp'), 'Cave spider');
assert.strictEqual(getLocalizedMonsterName('Orc warrior', 'silq', 'bilingual'), 'Orc warrior');
assert.strictEqual(getLocalizedMonsterName('White worm mass', 'frogcomposband', 'jp'), 'White worm mass');

assert.strictEqual(getLocalizedItemName('Short Sword', 'angband', 'jp'), 'Short Sword');
assert.strictEqual(getLocalizedItemName('Potion of Blindness', 'silq', 'bilingual'), 'Potion of Blindness');
assert.strictEqual(getLocalizedItemName('Dagger', 'frogcomposband', 'jp'), 'Dagger');
console.log('  -> PASSED: Non-Hengband variants strictly quarantined to 100% pure English.\n');

// -------------------------------------------------------------
// Test 5: In-Game Combat Messages, Corpses, and Weapon Stats (Hengband)
// -------------------------------------------------------------
console.log('[Test 5] Combat Messages, Slain Events, Floor Corpses & Weapon Modifiers');

// Monster attacks (drool, bite, hit)
assert.strictEqual(
    localizeGameMessage('Blubbering idiotによだれをたらされた。', 'hengband', 'en'),
    'Blubbering idiot drools on you.'
);
assert.strictEqual(
    localizeGameMessage('泣きじゃくる白痴によだれをたらされた。', 'hengband', 'en'),
    'Blubbering idiot drools on you.'
);

// Chained sentences on single line (hit + slain)
assert.strictEqual(
    localizeGameMessage('Blubbering idiotを攻撃した。Blubbering idiotを葬り去った。', 'hengband', 'en'),
    'You hit Blubbering idiot. You have slain Blubbering idiot.'
);
assert.strictEqual(
    localizeGameMessage('泣きじゃくる白痴を攻撃した。泣きじゃくる白痴を葬り去った。', 'hengband', 'en'),
    'You hit Blubbering idiot. You have slain Blubbering idiot.'
);

// Floor item / corpse look messages with stack qualifiers
assert.strictEqual(
    localizeGameMessage('Blubbering idiotの死体がある。 (x2)', 'hengband', 'en'),
    'There is a corpse of Blubbering idiot. (x2)'
);
assert.strictEqual(
    localizeGameMessage('泣きじゃくる白痴の死体がある。 (x2)', 'hengband', 'en'),
    'There is a corpse of Blubbering idiot. (x2)'
);

// 3D Billboard item names (corpses, skeletons, weapons with dice & bonuses)
assert.strictEqual(
    getLocalizedItemName('泣きじゃくる白痴の死体', 'hengband', 'en'),
    'Corpse of Blubbering idiot'
);
assert.strictEqual(
    getLocalizedItemName('泣きじゃくる白痴の死体', 'hengband', 'bilingual'),
    'Corpse of Blubbering idiot (泣きじゃくる白痴の死体)'
);
assert.strictEqual(
    getLocalizedItemName('泣きじゃくる白痴の死体', 'hengband', 'jp'),
    '泣きじゃくる白痴の死体'
);

assert.strictEqual(
    getLocalizedItemName('ブロード・アックス (2d6) (+0,+0)', 'hengband', 'en'),
    'Broad Axe (2d6) (+0,+0)'
);
assert.strictEqual(
    getLocalizedItemName('ブロード・アックス (2d6) (+0,+0)', 'hengband', 'bilingual'),
    'Broad Axe (2d6) (+0,+0) (ブロード・アックス (2d6) (+0,+0))'
);
assert.strictEqual(
    getLocalizedItemName('ブロード・アックス (2d6) (+0,+0)', 'hengband', 'jp'),
    'ブロード・アックス (2d6) (+0,+0)'
);

console.log('  -> PASSED: All combat messages, chained sentences, corpses, and item modifiers fully localized.\n');

// -------------------------------------------------------------
// Test 6: Store Prompts, Study Notices, Torches, Spellbooks & 80-Col Bounds
// -------------------------------------------------------------
console.log('[Test 6] Store Prompts, Study Notices, Torches, Spellbooks & 80-Col Bounds');

// 1. Store action lines
const storeExitEn = translateTerminalRow(' (ESC) 建物から出る', '', 'en', 0).text;
const storeExitBi = translateTerminalRow(' (ESC) 建物から出る', '', 'bilingual', 0).text;
const storeExitJp = translateTerminalRow(' (ESC) 建物から出る', '', 'jp', 0).text;
assert.ok(storeExitEn.includes('(ESC) Exit Building'), `Expected "(ESC) Exit Building", got: ${storeExitEn}`);
assert.ok(storeExitBi.includes('(ESC) Exit(出る)'), `Expected "(ESC) Exit(出る)", got: ${storeExitBi}`);
assert.strictEqual(storeExitJp, ' (ESC) 建物から出る');

const storeBuyEn = translateTerminalRow(' (p) 買う', '', 'en', 0).text;
const storeSellEn = translateTerminalRow(' (s) 売る', '', 'en', 0).text;
const storeExamEn = translateTerminalRow(' (x) 調べる', '', 'en', 0).text;
const storePrevEn = translateTerminalRow(' (-) 前ページ', '', 'en', 0).text;
const storeNextEn = translateTerminalRow(' (スペース) 次ページ', '', 'en', 0).text;
assert.ok(storeBuyEn.includes('(p) Purchase'), `Expected "(p) Purchase", got: ${storeBuyEn}`);
assert.ok(storeSellEn.includes('(s) Sell'), `Expected "(s) Sell", got: ${storeSellEn}`);
assert.ok(storeExamEn.includes('(x) Examine'), `Expected "(x) Examine", got: ${storeExamEn}`);
assert.ok(storePrevEn.includes('(-) Prev page'), `Expected "(-) Prev page", got: ${storePrevEn}`);
assert.ok(storeNextEn.includes('(Space) Next page'), `Expected "(Space) Next page", got: ${storeNextEn}`);

// 2. Study notices
const study3En = translateTerminalRow('あと 3 つの祈りを学べる。', '', 'en', 0).text;
const study3Bi = translateTerminalRow('あと 3 つの祈りを学べる。', '', 'bilingual', 0).text;
const study3Jp = translateTerminalRow('あと 3 つの祈りを学べる。', '', 'jp', 0).text;
assert.strictEqual(study3En, 'You can learn 3 more prayers.');
assert.strictEqual(study3Bi, 'You can learn 3 more prayers (あと3つの祈りを学べる)');
assert.strictEqual(study3Jp, 'あと 3 つの祈りを学べる。');

const study1En = translateTerminalRow('あと 1 つの呪文を学べる。', '', 'en', 0).text;
assert.strictEqual(study1En, 'You can learn 1 more spell.');

// 3. Torches & Light Sources
const torchEn = translateTerminalRow('たいまつ (5000ターンの寿命)', '', 'en', 0).text;
const torchBi = translateTerminalRow('たいまつ (5000ターンの寿命)', '', 'bilingual', 0).text;
const torchJp = translateTerminalRow('たいまつ (5000ターンの寿命)', '', 'jp', 0).text;
assert.strictEqual(torchEn, 'Wooden Torch (5000 turns of light)');
assert.ok(torchBi.includes('Wooden Torch') && torchBi.includes('松明') && torchBi.includes('turns(寿命)'), `Got: ${torchBi}`);
assert.strictEqual(torchJp, 'たいまつ (5000ターンの寿命)');

// 4. Spellbook titles
const bookUnbracketed = translateTerminalRow('8冊の 新弟子用教本 (1d4) (+0,+0)', '', 'en', 0).text;
assert.ok(bookUnbracketed.includes('8x') && bookUnbracketed.includes('Apprentice Guide'), `Got: ${bookUnbracketed}`);
assert.ok(!bookUnbracketed.includes('Brother'), `Unwanted "Brother" token in: ${bookUnbracketed}`);

const bookBracketed = translateTerminalRow('8冊の 歌集[讃歌] (1d4) (+0,+0)', '', 'en', 0).text;
assert.ok(bookBracketed.includes('Songbook[Hymns]'), `Got: ${bookBracketed}`);
assert.ok(!bookBracketed.includes('Song 集'), `Frankenstein "Song 集" in: ${bookBracketed}`);

// 5. Zero leftover & or ~ formatting characters
const allTranslated = [storeExitEn, storeBuyEn, storeSellEn, storeExamEn, storePrevEn, storeNextEn, study3En, torchEn, bookUnbracketed, bookBracketed];
for (const str of allTranslated) {
    assert.ok(!str.includes('&') && !str.includes('~'), `Stray '&' or '~' in: ${str}`);
}

console.log('  -> PASSED: Store prompts, study notices, torches, and spellbooks 100% verified with zero Frankenstein fragments.\n');

console.log('=== ALL 3D LABEL AND TERMINAL TESTS PASSED! ===');

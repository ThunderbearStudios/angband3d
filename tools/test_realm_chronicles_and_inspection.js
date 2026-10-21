/**
 * tools/test_realm_chronicles_and_inspection.js
 * Fast-tier unit tests for:
 * 1. Realm-isolated Chronicle Stores & Lorekeepers across Angband, Sil-Q, FrogComposBand, and Hengband
 * 2. Realm-specific traditions, voices, contexts, and survival mechanics Q&A
 * 3. Context-correct, realm-specific creature barks
 * 4. Afar 3D object inspection, lorekeeper appraisal, and artifact canon
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ChronicleGrounder = require('../server/public/js/chronicle/chronicle-grounder.js');
const ChronicleStore = require('../server/public/js/chronicle/chronicle-store.js');

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('--- test_realm_chronicles_and_inspection.js ---');

const REALMS = ['angband', 'silq', 'frogcomposband', 'hengband'];

// 1. Lorekeeper Names and Titles
test('Each realm has its specific, canonical Lorekeeper name and title', () => {
    assert.strictEqual(ChronicleGrounder.getLorekeeperName('angband'), 'Master Elrond');
    assert.strictEqual(ChronicleGrounder.getLorekeeperTitle('angband'), 'Master of Rivendell & Chronicler of the Elder Days');

    assert.strictEqual(ChronicleGrounder.getLorekeeperName('silq'), 'Daeron of Doriath');
    assert.strictEqual(ChronicleGrounder.getLorekeeperTitle('silq'), 'Chief Minstrel of King Thingol & Maker of the Runes');

    assert.strictEqual(ChronicleGrounder.getLorekeeperName('frogcomposband'), 'Corwin of Amber');
    assert.strictEqual(ChronicleGrounder.getLorekeeperTitle('frogcomposband'), 'Prince of Amber & Master of the Pattern');

    assert.strictEqual(ChronicleGrounder.getLorekeeperName('hengband'), 'Miyamoto Musashi');
    assert.strictEqual(ChronicleGrounder.getLorekeeperTitle('hengband'), 'Kensei of the Two Heavens & Chronicler of Bushido');
});

// 1b. Realm-Appropriate Gemini Voice Selection for Lorekeeper
test('Each realm has its contextually appropriate standard Gemini voice', () => {
    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('angband', 'male'), 'Enceladus');
    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('angband', 'female'), 'Zephyr');

    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('silq', 'male'), 'Charon');
    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('silq', 'female'), 'Despina');

    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('frogcomposband', 'male'), 'Fenrir');
    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('frogcomposband', 'female'), 'Kore');

    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('hengband', 'male'), 'Gacrux');
    assert.strictEqual(ChronicleGrounder.getLorekeeperVoice('hengband', 'female'), 'Sulafat');
});

// 2. Realm Contexts and Traditions
test('Each realm defines distinct literary traditions and narrative contexts', () => {
    for (const realm of REALMS) {
        const ctx = ChronicleGrounder.getRealmContext(realm);
        assert(ctx, `Realm context must exist for ${realm}`);
        assert(ctx.lorekeeperName, `Lorekeeper name missing for ${realm}`);
        assert(ctx.lorekeeperTitle, `Lorekeeper title missing for ${realm}`);
        assert(ctx.chronicler, `Chronicler missing for ${realm}`);
        assert(ctx.setting, `Setting missing for ${realm}`);
        assert(ctx.recommendedVoice, `Voice missing for ${realm}`);
    }

    // Tradition attunement
    assert.strictEqual(ChronicleGrounder.getTraditionForRealm('silq', 'Noldor'), 'beleriand');
    assert.strictEqual(ChronicleGrounder.getTraditionForRealm('frogcomposband', 'Human'), 'amber');
    assert.strictEqual(ChronicleGrounder.getTraditionForRealm('hengband', 'Ninja'), 'easternmythos');
    assert.strictEqual(ChronicleGrounder.getTraditionForRealm('angband', 'Elf'), 'noldor');
    assert.strictEqual(ChronicleGrounder.getTraditionForRealm('angband', 'Dwarf'), 'khazad');
    assert.strictEqual(ChronicleGrounder.getTraditionForRealm('angband', 'Human'), 'westmarch');
});

// 3. Storage Key Isolation
test('Each realm maintains isolated chronicle storage keys and distinct chronicle initialization', () => {
    const keys = new Set();
    for (const realm of REALMS) {
        const key = ChronicleStore.getStorageKey(realm);
        assert(key.includes(realm), `Key ${key} must include realm name`);
        assert(!keys.has(key), `Key ${key} must be unique`);
        keys.add(key);

        const hero = { name: 'TestHero', race: 'Human', class: 'Warrior', depth: 1 };
        const chron = ChronicleStore.createNewChronicle(hero, realm);
        assert.strictEqual(chron.realm, realm, `Chronicle realm property must equal ${realm}`);
        assert(chron.title.length > 5, `Chronicle must have title for ${realm}`);
        assert(chron.rolling_summary.length > 10, `Chronicle must have rolling summary for ${realm}`);
    }
});

// 4. Realm-Grounded Mechanics Q&A
test('Lorekeeper survival and mechanics advice is grounded in active realm rules', () => {
    const hero = { name: 'Beren', race: 'Human', class: 'Warrior', depth: 5 };

    // Sil-Q mechanics: no mana, singing, smithing
    const silqSong = ChronicleGrounder.answerSurvivalQuery('How does singing and magic work in Sil-Q?', hero, 'silq');
    assert(silqSong.toLowerCase().includes('song') || silqSong.toLowerCase().includes('mana'), 'Sil-Q song advice must mention songs/mana mechanics');

    const silqRest = ChronicleGrounder.answerSurvivalQuery('How do I rest safely?', hero, 'silq');
    assert(silqRest.toLowerCase().includes('sil-q') || silqRest.toLowerCase().includes('rest'), 'Sil-Q rest advice must mention resting mechanics');

    const silqForge = ChronicleGrounder.answerSurvivalQuery('Where can I forge items?', hero, 'silq');
    assert(silqForge.toLowerCase().includes('forge') || silqForge.toLowerCase().includes('smith') || silqForge.toLowerCase().includes('thangorodrim'), 'Sil-Q forge advice must explain forges or smithing');

    // FrogComposBand mechanics: wilderness, evolution
    const fcbWild = ChronicleGrounder.answerSurvivalQuery('How does the world map and wilderness work?', hero, 'frogcomposband');
    assert(fcbWild.toLowerCase().includes('wilderness') || fcbWild.toLowerCase().includes('town') || fcbWild.toLowerCase().includes('amber'), 'FCB advice must mention wilderness or overland');

    // Hengband mechanics: shrine, bounty, katana, bushido
    const hengShrine = ChronicleGrounder.answerSurvivalQuery('Where can I find bounties or pray at shrines?', hero, 'hengband');
    assert(hengShrine.toLowerCase().includes('shrine') || hengShrine.toLowerCase().includes('bount') || hengShrine.toLowerCase().includes('kagura') || hengShrine.toLowerCase().includes('shinto') || hengShrine.toLowerCase().includes('bushido'), 'Hengband advice must mention shrines, bounties, Shinto prayers, or Bushido');

    // Angband mechanics: town shops, 100 dungeon levels
    const angShop = ChronicleGrounder.answerSurvivalQuery('Tell me about the town shops', hero, 'angband');
    assert(angShop.toLowerCase().includes('shop') || angShop.toLowerCase().includes('town') || angShop.toLowerCase().includes('store'), 'Angband advice must explain town shops');
});

// 5. Realm-Specific Creature Barks
test('Creature barks are contextual and realm-specific', () => {
    const hero = { name: 'Turgon', race: 'Elf', class: 'Warrior', depth: 10 };
    const orc = { name: 'Snaga', glyph: 'o', attr: 2, depth: 10 };

    const silqBark = ChronicleGrounder.resolveCreatureEncounter(orc, hero, [], 1, '', 'silq');
    assert(silqBark && silqBark.text, 'Sil-Q orc must have encounter bark');
    const silqTextLower = (silqBark.text + ' ' + (silqBark.prose || '')).toLowerCase();
    assert(silqTextLower.includes('morgoth') || silqTextLower.includes('thangorodrim') || silqTextLower.includes('iron crown') || silqTextLower.includes('angband') || silqTextLower.includes('bauglir'), 'Sil-Q orc bark must reference First Age Morgoth/Angband lore');

    const hengBark = ChronicleGrounder.resolveCreatureEncounter(orc, hero, [], 1, '', 'hengband');
    assert(hengBark && hengBark.text, 'Hengband orc must have encounter bark');
    const hengTextLower = (hengBark.text + ' ' + (hengBark.prose || '')).toLowerCase();
    assert(hengTextLower.includes('oni') || hengTextLower.includes('ronin') || hengTextLower.includes('yokai') || hengTextLower.includes('blade') || hengTextLower.includes('steel') || hengTextLower.includes('gaijin'), 'Hengband orc bark must reference Eastern/Yokai/Sengoku lore');

    const fcbBark = ChronicleGrounder.resolveCreatureEncounter(orc, hero, [], 1, '', 'frogcomposband');
    assert(fcbBark && fcbBark.text, 'FrogComposBand orc must have encounter bark');
    const fcbTextLower = (fcbBark.text + ' ' + (fcbBark.prose || '')).toLowerCase();
    assert(fcbTextLower.includes('amber') || fcbTextLower.includes('chaos') || fcbTextLower.includes('shadow') || fcbTextLower.includes('pattern') || fcbTextLower.includes('evolution') || fcbTextLower.includes('gold') || fcbTextLower.includes('trump') || fcbTextLower.includes('wilderness') || fcbTextLower.includes('multiverse'), 'FCB orc bark must reference Amber/Chaos/Overland lore');
});

// 6. Afar Object Inspection & Lorekeeper Appraisal
test('Afar object inspection resolves lore, appraisal, and answers object queries', () => {
    const hero = { name: 'Eärendil', race: 'Half-Elf', class: 'Paladin', depth: 20 };

    // Canonical artifact inspection across realms
    const angbandArtifact = { name: 'Phial of Galadriel', glyph: '}' };
    const angAppraisal = ChronicleGrounder.resolveObjectInspection(angbandArtifact, hero, 20, 'angband');
    assert(angAppraisal, 'Phial appraisal must exist');
    assert(angAppraisal.title.includes('Phial of Galadriel'), 'Appraisal title must name artifact');
    assert(angAppraisal.dialogue.toLowerCase().includes('light') || angAppraisal.dialogue.toLowerCase().includes('shelob') || angAppraisal.dialogue.toLowerCase().includes('eärendil') || angAppraisal.dialogue.toLowerCase().includes('star'), 'Dialogue must cite canonical lore');

    const silqArtifact = { name: 'Silmaril of Fëanor', glyph: '*' };
    const silqAppraisal = ChronicleGrounder.resolveObjectInspection(silqArtifact, hero, 20, 'silq');
    assert(silqAppraisal, 'Silmaril appraisal must exist');
    assert(silqAppraisal.dialogue.toLowerCase().includes('silmaril') || silqAppraisal.dialogue.toLowerCase().includes('fëanor') || silqAppraisal.dialogue.toLowerCase().includes('morgoth'), 'Sil-Q appraisal must cite Silmaril lore');

    const fcbArtifact = { name: 'Grayswandir', glyph: ')' };
    const fcbAppraisal = ChronicleGrounder.resolveObjectInspection(fcbArtifact, hero, 20, 'frogcomposband');
    assert(fcbAppraisal, 'Grayswandir appraisal must exist');
    assert(fcbAppraisal.dialogue.toLowerCase().includes('corwin') || fcbAppraisal.dialogue.toLowerCase().includes('pattern') || fcbAppraisal.dialogue.toLowerCase().includes('amber'), 'FCB appraisal must cite Amber lore');

    const hengArtifact = { name: 'Katana of Musashi', glyph: ')' };
    const hengAppraisal = ChronicleGrounder.resolveObjectInspection(hengArtifact, hero, 20, 'hengband');
    assert(hengAppraisal, 'Musashi Katana appraisal must exist');
    assert(hengAppraisal.dialogue.toLowerCase().includes('musashi') || hengAppraisal.dialogue.toLowerCase().includes('blade') || hengAppraisal.dialogue.toLowerCase().includes('kensei'), 'Hengband appraisal must cite Musashi lore');

    // Query answering for floor items
    const potion = { name: 'Potion of Cure Critical Wounds', glyph: '!' };
    const potionAnswer = ChronicleGrounder.answerObjectQuery(potion, 'When should I drink this?', hero, 10, 'angband');
    assert(potionAnswer.toLowerCase().includes('quaff') || potionAnswer.toLowerCase().includes('heal') || potionAnswer.toLowerCase().includes('health'), 'Potion query answer must guide quaffing');

    const curseQuery = ChronicleGrounder.answerObjectQuery(angbandArtifact, 'Is this cursed or dangerous?', hero, 20, 'angband');
    assert(curseQuery.length > 10, 'Curse query must return lorekeeper insight');
});

// 7. Dungeon3D and InputController Contract Validation
test('Dungeon3D and InputController support afar 3D floor item click inspection', () => {
    const dungeonSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/dungeon3d.js'), 'utf8');
    assert(dungeonSrc.includes('getItemAtScreenCoords(clientX, clientY)'), 'Dungeon3D must implement getItemAtScreenCoords');
    assert(dungeonSrc.includes('this.items'), 'Dungeon3D must inspect this.items Map');

    const inputSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/input.js'), 'utf8');
    assert(inputSrc.includes('getItemAtScreenCoords'), 'InputController must call getItemAtScreenCoords on click');
    assert(inputSrc.includes('chronicleManager.inspectObject'), 'InputController must dispatch to chronicleManager.inspectObject');
    assert(inputSrc.includes("mode: 'popover'"), 'InputController must open 3D click inspections in non-modal popover mode');
    assert(inputSrc.includes('preemptForGameplay'), 'InputController must preempt Chronicle/Popover on gameplay input');

    const managerSrc = fs.readFileSync(path.join(__dirname, '../server/public/js/chronicle/chronicle-manager.js'), 'utf8');
    assert(managerSrc.includes('inspectObject(item'), 'ChronicleManager must implement inspectObject');
    assert(managerSrc.includes('this.targetedObject'), 'ChronicleManager must track targetedObject');
    assert(managerSrc.includes('weaveObjectCounsel'), 'ChronicleManager must implement weaveObjectCounsel');
    assert(managerSrc.includes('showEntityPopover'), 'ChronicleManager must implement showEntityPopover');
    assert(managerSrc.includes('preemptForGameplay'), 'ChronicleManager must implement preemptForGameplay');
    assert(managerSrc.includes('_buildCoreMonsterInspection('), 'ChronicleManager must implement _buildCoreMonsterInspection for pure core-game monster inspect');
    assert(managerSrc.includes('_buildCoreItemInspection('), 'ChronicleManager must implement _buildCoreItemInspection for pure core-game item inspect');

    const ChronicleManager = require('../server/public/js/chronicle/chronicle-manager.js');
    const trollInspect = ChronicleManager.prototype._buildCoreMonsterInspection(
        { name: 'Cave troll', glyph: 'T', hp: 36, hp_max: 45, asleep: false },
        10,
        'angband'
    );
    assert(trollInspect.prose.includes('Type: Troll'), 'Troll core inspection prose must report Type: Troll');
    assert(trollInspect.prose.includes('Align: Evil'), 'Troll core inspection prose must report Align: Evil');
    assert.strictEqual(trollInspect.quote, '', 'Monster core inspection must have zero fictional quote');
    assert(trollInspect.hpText.includes('HP: 36 / 45 (80%)'), 'Troll core inspection must report exact core HP');
    assert(trollInspect.tactics.includes('Light') || trollInspect.tactics.includes('Fire'), 'Troll core inspection must report authentic core weaknesses');

    const swordInspect = ChronicleManager.prototype._buildCoreItemInspection(
        { name: 'a Long Sword of Westernesse (2d5) (+10,+12) (+2)', glyph: ')' },
        15,
        'angband'
    );
    assert(swordInspect.prose.includes('Melee Weapon'), 'Sword core inspection must report Melee Weapon category');
    assert(swordInspect.prose.includes('Damage: 2d5'), 'Sword core inspection must extract damage dice');
    assert(swordInspect.prose.includes('Hit/Dam: (+10, +12)'), 'Sword core inspection must extract combat bonuses');
    assert.strictEqual(swordInspect.quote, '', 'Item core inspection must have zero fictional quote');
    assert(swordInspect.tactics.includes('Brand'), 'Sword core inspection must extract known core properties');
});

console.log('All realm chronicles and inspection unit tests passed successfully!');

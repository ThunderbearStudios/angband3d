/**
 * test_chronicle_combat.js
 * Comprehensive automated test suite for Chronicle Combat & Tactical Medium Accuracy.
 * Tests archetype classification, launcher classification, spell element detection,
 * attack medium ingestion in ChronicleFilter, and prose generation in ChronicleGrounder.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock window and document for browser-targeted chronicle files
global.window = {};
global.document = {};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

// Load chronicle modules
const filterCode = fs.readFileSync(path.join(__dirname, '../server/public/js/chronicle/chronicle-filter.js'), 'utf8');
eval(filterCode);
const grounderCode = fs.readFileSync(path.join(__dirname, '../server/public/js/chronicle/chronicle-grounder.js'), 'utf8');
eval(grounderCode);

const ChronicleFilter = global.window.ChronicleFilter;
const ChronicleGrounder = global.window.ChronicleGrounder;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`  [FAIL] ${name}:`, err.message);
        failed++;
    }
}

console.log('=== Running Chronicle Combat & Tactical Medium Test Suite ===\n');

// 1. Archetype Classification Tests
test('Classifies blade weapons', () => {
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Broad Sword').archetype, 'blade');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Long Sword (1d10)').archetype, 'blade');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Scimitar').archetype, 'blade');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Katana').archetype, 'blade');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Zweihander').archetype, 'blade');
});

test('Classifies blunt weapons', () => {
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('War Hammer').archetype, 'blunt');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Mace').archetype, 'blunt');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Flail').archetype, 'blunt');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Lucerne Hammer').archetype, 'blunt');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Morningstar').archetype, 'blunt');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Lead-Filled Mace').archetype, 'blunt');
});

test('Classifies axe weapons', () => {
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Battle Axe').archetype, 'axe');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Broad Axe').archetype, 'axe');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Great Axe').archetype, 'axe');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Hatchet').archetype, 'axe');
});

test('Classifies dagger and piercing weapons', () => {
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Dagger').archetype, 'dagger');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Main Gauche').archetype, 'dagger');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Spear').archetype, 'polearm_pierce');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Pike').archetype, 'polearm_pierce');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('Lance').archetype, 'polearm_pierce');
});

test('Classifies unarmed when empty or bare fists', () => {
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('').archetype, 'unarmed');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype('bare fists').archetype, 'unarmed');
    assert.strictEqual(ChronicleFilter.classifyWeaponArchetype(null).archetype, 'unarmed');
});

// 2. Launcher Archetype Classification Tests
test('Classifies missile launchers accurately', () => {
    assert.strictEqual(ChronicleFilter.classifyLauncherArchetype('Light Crossbow').archetype, 'crossbow');
    assert.strictEqual(ChronicleFilter.classifyLauncherArchetype('Heavy Crossbow').archetype, 'crossbow');
    assert.strictEqual(ChronicleFilter.classifyLauncherArchetype('Arbalest').archetype, 'crossbow');
    assert.strictEqual(ChronicleFilter.classifyLauncherArchetype('Sling').archetype, 'sling');
    assert.strictEqual(ChronicleFilter.classifyLauncherArchetype('Long Bow').archetype, 'bow');
    assert.strictEqual(ChronicleFilter.classifyLauncherArchetype('Short Bow').archetype, 'bow');
});

// 3. Spell Element Detection Tests
test('Detects spell elements correctly', () => {
    assert.strictEqual(ChronicleFilter.detectSpellElement('Fire Bolt'), 'fire');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Fire Ball'), 'fire');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Frost Ball'), 'cold');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Ice Storm'), 'cold');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Lightning Bolt'), 'lightning');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Acid Ball'), 'acid');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Orb of Draining'), 'holy');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Holy Word'), 'holy');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Magic Missile'), 'arcane');
    assert.strictEqual(ChronicleFilter.detectSpellElement('Mana Bolt'), 'arcane');
});

// 4. ChronicleFilter Ingestion Tests
test('ChronicleFilter populates attackMedium from player frame for melee attack', () => {
    const filter = new ChronicleFilter();
    filter.hasCompletedOnboarding.firstStairsDown = true;
    const frame = {
        phase: 'play',
        turn: 100,
        player: {
            name: 'Gimli',
            race: 'Dwarf',
            class: 'Warrior',
            depth: 3,
            weapon_item: 'Broad Axe (2d6)',
            bow_item: null,
            quiver_item: null,
            chp: 100,
            mhp: 100
        },
        messages: ['The Snaga hits you.', 'You hit the Snaga.']
    };
    const event = filter.evaluate(frame);
    assert.ok(event, 'An event should be returned');
    assert.strictEqual(event.type, 'COMBAT_EXCHANGE');
    const med = event.data.attackMedium;
    assert.ok(med, 'attackMedium should exist');
    assert.strictEqual(med.method, 'strike');
    assert.strictEqual(med.archetype, 'axe');
    assert.strictEqual(med.name, 'Broad Axe');
});

test('ChronicleFilter populates attackMedium for ranged shoot attack', () => {
    const filter = new ChronicleFilter();
    filter.hasCompletedOnboarding.firstStairsDown = true;
    const frame = {
        phase: 'play',
        turn: 101,
        player: {
            name: 'Legolas',
            race: 'Elf',
            class: 'Archer',
            depth: 4,
            weapon_item: 'Dagger (1d4)',
            bow_item: 'Long Bow (x3)',
            quiver_item: 'Flight Arrows (1d8)',
            chp: 100,
            mhp: 100
        },
        messages: ['The Cave orc hits you.', 'You shoot a Cave orc.']
    };
    const event = filter.evaluate(frame);
    assert.ok(event, 'An event should be returned');
    assert.strictEqual(event.type, 'COMBAT_EXCHANGE');
    const med = event.data.attackMedium;
    assert.ok(med, 'attackMedium should exist');
    assert.strictEqual(med.method, 'shoot');
    assert.strictEqual(med.archetype, 'bow');
    assert.strictEqual(med.name, 'Long Bow');
    assert.strictEqual(med.ammo, 'Flight Arrows');
});

test('ChronicleFilter populates attackMedium for spellcasting', () => {
    const filter = new ChronicleFilter();
    filter.hasCompletedOnboarding.firstStairsDown = true;
    const frame = {
        phase: 'play',
        turn: 102,
        player: {
            name: 'Gandalf',
            race: 'High-Elf',
            class: 'Mage',
            depth: 5,
            weapon_item: null,
            bow_item: null,
            quiver_item: null,
            chp: 100,
            mhp: 100
        },
        messages: ['The Cave orc hits you.', 'You cast a Fire Bolt.', 'The Cave orc screams in pain.']
    };
    const event = filter.evaluate(frame);
    assert.ok(event, 'An event should be returned');
    assert.strictEqual(event.type, 'COMBAT_EXCHANGE');
    const med = event.data.attackMedium;
    assert.ok(med, 'attackMedium should exist');
    assert.strictEqual(med.method, 'spell');
    assert.strictEqual(med.type, 'spell');
    assert.strictEqual(med.name, 'Fire Bolt');
    assert.strictEqual(med.element, 'fire');
});

test('ChronicleFilter populates attackMedium for device activation', () => {
    const filter = new ChronicleFilter();
    filter.hasCompletedOnboarding.firstStairsDown = true;
    const frame = {
        phase: 'play',
        turn: 103,
        player: {
            name: 'Saruman',
            race: 'Human',
            class: 'Mage',
            depth: 6,
            weapon_item: 'Staff of Light',
            bow_item: null,
            quiver_item: null,
            chp: 100,
            mhp: 100
        },
        messages: ['The Cave orc hits you.', 'You aim a Wand of Wonder.', 'The Cave orc screams in pain.']
    };
    const event = filter.evaluate(frame);
    assert.ok(event, 'An event should be returned');
    assert.strictEqual(event.type, 'COMBAT_EXCHANGE');
    const med = event.data.attackMedium;
    assert.ok(med, 'attackMedium should exist');
    assert.strictEqual(med.method, 'device');
    assert.strictEqual(med.deviceType, 'wand');
    assert.strictEqual(med.name, 'Wand of Wonder');
});

// 5. ChronicleGrounder Narrative Generation Tests
test('ChronicleGrounder generates spell prose without blade references', () => {
    const player = { name: 'Mithrandir', race: 'Elf', class: 'Mage', depth: 4, weapon_item: null };
    const event = {
        type: 'COMBAT_EXCHANGE',
        data: {
            heroAttacks: [{ monsterName: 'Snaga', action: 'hit' }],
            kills: ['You have slain the Snaga.'],
            attackMedium: {
                method: 'spell',
                type: 'spell',
                name: 'Lightning Bolt',
                element: 'lightning'
            }
        }
    };
    const chapter = ChronicleGrounder.generateProceduralChapter(event, player, 'noldor');
    assert.ok(chapter.title.toLowerCase().includes('lightning') || chapter.title.toLowerCase().includes('thunder'), `Title was ${chapter.title}`);
    assert.ok(!chapter.prose.includes('drawn steel'), `Prose contained drawn steel: ${chapter.prose}`);
    assert.ok(!chapter.prose.includes('blade'), `Prose contained blade: ${chapter.prose}`);
    assert.ok(
        chapter.prose.includes('lightning') ||
        chapter.prose.includes('spark') ||
        chapter.prose.includes('voltage') ||
        chapter.prose.includes('electr') ||
        chapter.prose.includes('discharge') ||
        chapter.prose.includes('spell'),
        `Prose lacked spell flavor: ${chapter.prose}`
    );
});

test('ChronicleGrounder generates unarmed prose without blade references', () => {
    const player = { name: 'Beorn', race: 'Human', class: 'Warrior', depth: 2, weapon_item: null };
    const event = {
        type: 'COMBAT_EXCHANGE',
        data: {
            heroAttacks: [{ monsterName: 'Cave orc', action: 'hit' }],
            kills: ['You have killed the Cave orc.'],
            attackMedium: {
                method: 'strike',
                type: 'melee',
                name: 'bare fists',
                archetype: 'unarmed'
            }
        }
    };
    const chapter = ChronicleGrounder.generateProceduralChapter(event, player, 'westmarch');
    assert.ok(!chapter.prose.includes('drawn steel'), `Prose contained drawn steel: ${chapter.prose}`);
    assert.ok(!chapter.prose.includes('blade'), `Prose contained blade: ${chapter.prose}`);
    assert.ok(chapter.prose.includes('fist') || chapter.prose.includes('punch') || chapter.prose.includes('knuckle') || chapter.prose.includes('blow'), `Prose lacked unarmed flavor: ${chapter.prose}`);
});

test('ChronicleGrounder generates blunt hammer prose with crushing impact', () => {
    const player = { name: 'Thorin', race: 'Dwarf', class: 'Warrior', depth: 5, weapon_item: 'War Hammer (3d3)' };
    const event = {
        type: 'COMBAT_EXCHANGE',
        data: {
            heroAttacks: [{ monsterName: 'Cave troll', action: 'hit' }],
            kills: ['You have killed the Cave troll.'],
            attackMedium: {
                method: 'strike',
                type: 'melee',
                name: 'War Hammer',
                archetype: 'blunt'
            }
        }
    };
    const chapter = ChronicleGrounder.generateProceduralChapter(event, player, 'khazad');
    assert.ok(!chapter.prose.includes('drawn steel'), `Prose contained drawn steel: ${chapter.prose}`);
    assert.ok(chapter.prose.includes('War Hammer') || chapter.prose.includes('crush') || chapter.prose.includes('shatter') || chapter.prose.includes('hammer'), `Prose lacked blunt flavor: ${chapter.prose}`);
});

test('ChronicleGrounder generates archery prose with bow/arrow/flight flavor', () => {
    const player = { name: 'Bard', race: 'Human', class: 'Archer', depth: 3, weapon_item: 'Dagger', bow_item: 'Long Bow', quiver_item: 'Arrows' };
    const event = {
        type: 'COMBAT_EXCHANGE',
        data: {
            heroAttacks: [{ monsterName: 'Scrawny cat', action: 'hit' }],
            kills: ['You have killed the Scrawny cat.'],
            attackMedium: {
                method: 'shoot',
                type: 'ranged',
                name: 'Long Bow',
                ammo: 'Arrows',
                archetype: 'bow'
            }
        }
    };
    const chapter = ChronicleGrounder.generateProceduralChapter(event, player, 'westmarch');
    assert.ok(!chapter.prose.includes('drawn steel'), `Prose contained drawn steel: ${chapter.prose}`);
    assert.ok(chapter.prose.includes('arrow') || chapter.prose.includes('shaft') || chapter.prose.includes('bow') || chapter.prose.includes('shot'), `Prose lacked archery flavor: ${chapter.prose}`);
});

test('generateKillSaga resolves effective weapon and generates archetype prose', () => {
    const player = { name: 'Balin', race: 'Dwarf', class: 'Warrior', depth: 4, weapon_item: 'Heavy Mace (2d5)' };
    const saga = ChronicleGrounder.generateKillSaga(['Cave orc'], player, 4, 'khazad', null, null, {
        method: 'strike',
        archetype: 'blunt',
        name: 'Heavy Mace'
    });
    assert.ok(saga.title, 'Title should exist');
    assert.ok(saga.prose, 'Prose should exist');
    assert.ok(!saga.prose.includes('drawn steel'), `Prose had drawn steel: ${saga.prose}`);
    assert.ok(saga.prose.includes('Heavy Mace') || saga.prose.includes('crush') || saga.prose.includes('iron') || saga.prose.includes('blow'), `Prose lacked weapon flavor: ${saga.prose}`);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    process.exit(1);
}

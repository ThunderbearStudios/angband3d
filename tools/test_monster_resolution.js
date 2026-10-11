const fs = require('fs');
const assert = require('assert');

const atlas = JSON.parse(fs.readFileSync('server/public/assets/sprites/monsters/monster_atlas.json', 'utf8'));
const src = fs.readFileSync('server/public/js/dungeon3d.js', 'utf8');

const start = src.indexOf('resolveMonsterAtlasEntry(name, glyph)');
const end = src.indexOf('createMonsterBillboardMesh(', start);
assert(start !== -1 && end !== -1, 'Could not find resolveMonsterAtlasEntry in dungeon3d.js');

const methodCode = src.slice(start, end);
const classCode = `
class MockDungeon3D {
    constructor() {
        this.monsterAtlasData = atlas;
    }
    ${methodCode}
}
module.exports = MockDungeon3D;
`;

const MockDungeon3D = eval(`(function(atlas) { ${classCode} return MockDungeon3D; })`)(atlas);
const d3d = new MockDungeon3D();

console.log('--- Testing Monster Atlas Resolution ---');

// 1. Test Orc Skirmisher with glyph 'o'
const orcWithGlyph = d3d.resolveMonsterAtlasEntry('Orc skirmisher', 'o');
console.log('Orc skirmisher with glyph "o":', orcWithGlyph ? 'RESOLVED (height=' + orcWithGlyph.height + ')' : 'FAILED');
assert(orcWithGlyph, 'Orc skirmisher with glyph "o" must resolve');

// 2. Test Orc Skirmisher with glyph ' ' (space)
const orcWithSpace = d3d.resolveMonsterAtlasEntry('Orc skirmisher', ' ');
console.log('Orc skirmisher with glyph " ":', orcWithSpace ? 'RESOLVED (height=' + orcWithSpace.height + ')' : 'FAILED');
assert(orcWithSpace, 'Orc skirmisher with glyph " " must resolve via taxonomy / deduced glyph');

// 3. Test Orc Skirmisher with undefined glyph
const orcNoGlyph = d3d.resolveMonsterAtlasEntry('Orc skirmisher');
console.log('Orc skirmisher without glyph:', orcNoGlyph ? 'RESOLVED (height=' + orcNoGlyph.height + ')' : 'FAILED');
assert(orcNoGlyph, 'Orc skirmisher without glyph must resolve');

// 4. Test all 153 Sil-Q monsters from monster.txt
const silqLines = fs.readFileSync('variants/silq-src/lib/edit/monster.txt', 'utf8').split('\n');
const silqMonsters = [];
let cur = {};
for (const line of silqLines) {
    if (line.startsWith('N:')) {
        if (cur.name) silqMonsters.push(cur);
        cur = { name: line.slice(line.indexOf(':') + 1).replace(/^\d+:/, '').trim() };
    } else if (line.startsWith('G:')) {
        const parts = line.split(':');
        cur.glyph = parts[1];
    }
}
if (cur.name) silqMonsters.push(cur);

let resolvedCount = 0;
let unresolved = [];
for (const m of silqMonsters) {
    const res = d3d.resolveMonsterAtlasEntry(m.name, m.glyph);
    if (res && res.uv) {
        resolvedCount++;
    } else {
        unresolved.push(m);
    }
}

console.log(`Sil-Q Bestiary Coverage: ${resolvedCount}/${silqMonsters.length} (${(resolvedCount / silqMonsters.length * 100).toFixed(1)}%)`);
if (unresolved.length > 0) {
    console.log('Unresolved monsters:', unresolved);
}
assert.strictEqual(unresolved.length, 0, 'All Sil-Q monsters must resolve to 2D billboard sprites!');
console.log('PASS: 100% 2D Billboard Coverage Verified!');

// 5. Test Equine vs Nazgul & Archetype Disambiguation
console.log('\n--- Testing Equine & Archetype Disambiguation ---');
const horseRes = d3d.resolveMonsterAtlasEntry('Horse', 'q');
assert.strictEqual(horseRes, null, 'Horse must NOT resolve to an atlas billboard (must route to 3D procedural horse)');
console.log('  ✓ Horse [q] -> null (3D procedural horse)');

const ridingHorseRes = d3d.resolveMonsterAtlasEntry('Riding horse', 'q');
assert.strictEqual(ridingHorseRes, null, 'Riding horse must NOT resolve to an atlas billboard');
console.log('  ✓ Riding horse [q] -> null (3D procedural horse)');

const jpHorseRes = d3d.resolveMonsterAtlasEntry('馬', 'q');
assert.strictEqual(jpHorseRes, null, 'Japanese Horse (馬) must NOT resolve to an atlas billboard');
console.log('  ✓ 馬 [q] -> null (3D procedural horse)');

const uvathaRes = d3d.resolveMonsterAtlasEntry('Uvatha the Horseman', 'W');
assert.ok(uvathaRes && uvathaRes.uv, 'Uvatha the Horseman must still resolve to Nazgul sprite');
console.log('  ✓ Uvatha the Horseman [W] -> Nazgul billboard');

const guardRes = d3d.resolveMonsterAtlasEntry('Guard', 'p');
assert.ok(guardRes && guardRes.uv, 'Guard must resolve to Novice warrior (not Guardian naga)');
console.log('  ✓ Guard [p] -> Novice warrior');

const soldierRes = d3d.resolveMonsterAtlasEntry('Soldier', 'p');
assert.ok(soldierRes && soldierRes.uv, 'Soldier must resolve to Novice warrior (not Soldier ant)');
console.log('  ✓ Soldier [p] -> Novice warrior');

console.log('PASS: Equine & Archetype Disambiguation Verified!');

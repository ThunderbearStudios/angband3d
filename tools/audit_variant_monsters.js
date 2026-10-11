const fs = require('fs');

const atlas = JSON.parse(fs.readFileSync('server/public/assets/sprites/monsters/monster_atlas.json', 'utf8'));
const src = fs.readFileSync('server/public/js/dungeon3d.js', 'utf8');

const start = src.indexOf('resolveMonsterAtlasEntry(name, glyph)');
const end = src.indexOf('createMonsterBillboardMesh(', start);
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

console.log('=== MULTI-REALM MONSTER COVERAGE AUDIT ===');

// 1. Vanilla Angband (from graf-shb-dark.prf or monster_atlas.json)
console.log('Vanilla monsters in atlas:', Object.keys(atlas.monsters).length);
console.log('Vanilla glyphs in atlas:', Object.keys(atlas.glyphs).length);

// 2. Sil-Q
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

let silqResolved = 0;
let silqUnresolved = [];
for (const m of silqMonsters) {
    const res = d3d.resolveMonsterAtlasEntry(m.name, m.glyph);
    if (res && res.uv) silqResolved++;
    else silqUnresolved.push(m);
}
console.log(`Sil-Q: ${silqResolved}/${silqMonsters.length} (${(silqResolved/silqMonsters.length*100).toFixed(1)}%)`);

// 3. FrogComposBand
const fcbLines = fs.readFileSync('variants/frogcomposband-src/lib/edit/r_info.txt', 'utf8').split('\n');
const fcbMonsters = [];
cur = {};
for (const line of fcbLines) {
    if (line.startsWith('N:')) {
        if (cur.name) fcbMonsters.push(cur);
        const namePart = line.slice(line.indexOf(':') + 1).trim();
        const parts = namePart.split(':');
        cur = { name: parts.length > 1 ? parts[1].trim() : parts[0].trim() };
    } else if (line.startsWith('G:')) {
        const parts = line.split(':');
        cur.glyph = parts[1];
    }
}
if (cur.name) fcbMonsters.push(cur);

let fcbResolved = 0;
let fcbUnresolved = [];
for (const m of fcbMonsters) {
    const res = d3d.resolveMonsterAtlasEntry(m.name, m.glyph);
    if (res && res.uv) fcbResolved++;
    else fcbUnresolved.push(m);
}
console.log(`FrogComposBand: ${fcbResolved}/${fcbMonsters.length} (${(fcbResolved/fcbMonsters.length*100).toFixed(1)}%)`);
if (fcbUnresolved.length > 0) {
    console.log(`FCB unresolved sample (first 10 of ${fcbUnresolved.length}):`, fcbUnresolved.slice(0, 10));
}

// 4. Hengband
let hengMonsters = [];
try {
    const content = fs.readFileSync('variants/hengband-src/lib/edit/MonraceDefinitions.jsonc', 'utf8');
    const enRegex = /"en":\s*"([^"]+)"/g;
    const charRegex = /"character":\s*"([^"]+)"/g;
    let match;
    const names = [];
    while ((match = enRegex.exec(content)) !== null) {
        // filter out comments or flavor en
        names.push(match[1]);
    }
    const syms = [];
    while ((match = charRegex.exec(content)) !== null) {
        syms.push(match[1]);
    }
    for (let i = 0; i < Math.min(names.length, syms.length); i++) {
        hengMonsters.push({ name: names[i], glyph: syms[i] || '?' });
    }
} catch (e) {
    console.log('Hengband read error:', e.message);
}

let hengResolved = 0;
let hengUnresolved = [];
for (const m of hengMonsters) {
    const res = d3d.resolveMonsterAtlasEntry(m.name, m.glyph);
    if (res && res.uv) hengResolved++;
    else hengUnresolved.push(m);
}
console.log(`Hengband: ${hengResolved}/${hengMonsters.length} (${(hengResolved/hengMonsters.length*100).toFixed(1)}%)`);
if (hengUnresolved.length > 0) {
    console.log(`Hengband unresolved sample (first 10 of ${hengUnresolved.length}):`, hengUnresolved.slice(0, 10));
}

const fs = require('fs');

const atlas = JSON.parse(fs.readFileSync('server/public/assets/sprites/monsters/monster_atlas.json', 'utf8'));

// Test improved resolver logic
function resolveEnhanced(name, glyph) {
    if (!atlas) return null;
    const monsters = atlas.monsters;
    const glyphs = atlas.glyphs;

    const rawName = (name || '').trim();
    const lower = rawName.toLowerCase();

    // 1. Direct exact name lookup
    if (monsters && monsters[rawName]) return monsters[rawName];

    // 2. Case-insensitive
    for (const [k, v] of Object.entries(monsters)) {
        if (k.toLowerCase() === lower) return v;
    }

    // 3. Substring
    for (const [k, v] of Object.entries(monsters)) {
        if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
    }

    // 4. Expanded Taxonomy & archetypes (Japanese / Hengband / FCB / Sil-Q)
    if (lower.includes('samurai') || lower.includes('ninja') || lower.includes('ronin') || lower.includes('warrior') || lower.includes('guard')) {
        if (monsters['Novice warrior']) return monsters['Novice warrior'];
    }
    if (lower.includes('miko') || lower.includes('priest') || lower.includes('shrine maiden') || lower.includes('geisha')) {
        if (monsters['Novice priest']) return monsters['Novice priest'];
    }
    if (lower.includes('light') || lower.includes('sphere') || lower.includes('fireball') || lower.includes('orb')) {
        if (monsters['Will o\' the wisp']) return monsters['Will o\' the wisp'];
        if (monsters['Fire vortex']) return monsters['Fire vortex'];
    }
    if (lower.includes('sword') || lower.includes('blade') || lower.includes('axe') || lower.includes('polearm')) {
        if (monsters['Death sword']) return monsters['Death sword'];
        if (monsters['Novice warrior']) return monsters['Novice warrior'];
    }
    if (lower.includes('naga')) {
        if (monsters['Red naga']) return monsters['Red naga'];
        if (monsters['Spirit naga']) return monsters['Spirit naga'];
    }
    if (lower.includes('vortex')) {
        if (monsters['Fire vortex']) return monsters['Fire vortex'];
        if (monsters['Water vortex']) return monsters['Water vortex'];
    }
    if (lower.includes('coin') || lower.includes('copper') || lower.includes('silver') || lower.includes('gold')) {
        if (monsters['Creeping copper coins']) return monsters['Creeping copper coins'];
    }
    if (lower.includes('mold') || lower.includes('fungus') || lower.includes('mushroom') || lower.includes('growth')) {
        if (monsters['Hairy mold']) return monsters['Hairy mold'];
    }
    if (lower.includes('slime') || lower.includes('ooze') || lower.includes('jelly') || lower.includes('slug')) {
        if (monsters['Giant clear slime']) return monsters['Giant clear slime'];
    }

    // 5. Canonical Glyph lookup
    let effectiveGlyph = (glyph || '').trim();
    if (glyphs[effectiveGlyph]) return glyphs[effectiveGlyph];

    // 6. Comprehensive Multi-Realm Glyph Aliases
    const glyphAliases = {
        '@': monsters['<player>'] || monsters['Novice warrior'],
        'D': monsters['Ancient red dragon'] || monsters['Cold drake'],
        'A': monsters['Angel'],
        '&': monsters['Hairy mold'] || glyphs['m'],
        'N': monsters['Red naga'] || monsters['Mind flayer'],
        'n': monsters['Red naga'] || monsters['Mind flayer'],
        '*': monsters['Fire vortex'] || monsters['Will o\' the wisp'] || glyphs['v'],
        '|': monsters['Novice warrior'] || glyphs['p'],
        '(': monsters['Novice rogue'] || glyphs['p'],
        '[': monsters['Iron golem'] || glyphs['g'],
        ']': monsters['Iron golem'] || glyphs['g'],
        '?': monsters['Ghost'] || glyphs['G'],
        '!': monsters['Giant clear slime'] || glyphs['j'],
        '$': monsters['Creeping copper coins'] || glyphs['m'],
        '#': monsters['Stone golem'] || glyphs['g'],
        ',': monsters['Hairy mold'] || glyphs['m'],
        '.': monsters['Giant clear slime'] || glyphs['j'],
        '~': monsters['Giant salamander'] || glyphs['R']
    };

    if (glyphAliases[effectiveGlyph]) return glyphAliases[effectiveGlyph];

    // Absolute fallback: Generic creature glyph or novice adventurer
    return glyphs['o'] || monsters['<player>'];
}

// Test against FCB
const fcbLines = fs.readFileSync('variants/frogcomposband-src/lib/edit/r_info.txt', 'utf8').split('\n');
const fcbMonsters = [];
let cur = {};
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

let fcbRes = 0;
let fcbFailed = [];
for (const m of fcbMonsters) {
    const res = resolveEnhanced(m.name, m.glyph);
    if (res && res.uv) fcbRes++;
    else fcbFailed.push(m);
}
console.log(`Enhanced FCB Coverage: ${fcbRes}/${fcbMonsters.length} (${(fcbRes/fcbMonsters.length*100).toFixed(1)}%)`);
console.log(`Failed FCB count: ${fcbFailed.length}`);

// Test against Hengband
const hengContent = fs.readFileSync('variants/hengband-src/lib/edit/MonraceDefinitions.jsonc', 'utf8');
const enRegex = /"en":\s*"([^"]+)"/g;
const charRegex = /"character":\s*"([^"]+)"/g;
const names = [];
let m;
while ((m = enRegex.exec(hengContent)) !== null) {
    if (m[1] !== 'English Name' && !m[1].includes('Flavor Text')) names.push(m[1]);
}
const syms = [];
while ((m = charRegex.exec(hengContent)) !== null) {
    if (m[1] !== '表示されるシンボルを一文字で') syms.push(m[1]);
}
const hengMonsters = [];
for (let i = 0; i < Math.min(names.length, syms.length); i++) {
    hengMonsters.push({ name: names[i], glyph: syms[i] });
}

let hengRes = 0;
let hengFailed = [];
for (const hm of hengMonsters) {
    const res = resolveEnhanced(hm.name, hm.glyph);
    if (res && res.uv) hengRes++;
    else hengFailed.push(hm);
}
console.log(`Enhanced Hengband Coverage: ${hengRes}/${hengMonsters.length} (${(hengRes/hengMonsters.length*100).toFixed(1)}%)`);
console.log(`Failed Hengband count: ${hengFailed.length}`);

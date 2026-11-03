#!/usr/bin/env node
/**
 * variants/dcss/bin/dcss-bridge.js
 *
 * Playable Dungeon Crawl Stone Soup (DCSS) Realm Engine for YASD 3D / Yendor Engine™.
 * Features Species & Backgrounds, Pantheon of Gods & Altars with Piety, Multi-Branch Depths
 * (D, Temple, Lair, Orc, Vaults, Zot), Runes of Zot, and the Orb of Zot.
 */
'use strict';

const path = require('path');
const { UniversalCartridgeEngine, runCartridgeMain } = require('../../../server/src/cartridges/cartridge-core');

const DCSS_SPEC = {
    realm: 'dcss',
    magic: 'SaveDCSS',
    version: '0.32-bridge',
    title: 'Dungeon Crawl Stone Soup',
    defaultBranch: 'D',
    defaultDeity: 'Trog',
    goalDepth: 15,
    goalItemName: 'Orb of Zot',
    goalGlyph: '0',
    goalBadge: 'Orb of Zot',
    healingPotionName: 'potion of heal wounds',
    foodName: 'royal jelly',
    welcomeMessage: 'Welcome to Dungeon Crawl Stone Soup! Collect Runes of Zot, worship at Divine Altars, and seize the Orb of Zot!',
    lore: 'Brave the multi-branch Dungeon, Ecumenical Temple, Lair of Beasts, Orcish Mines, Vaults, and Realm of Zot to claim 3 Runes and ascend with the Orb of Zot.',
    gods: ['Trog', 'Okawaru', 'Vehumet', 'Makhleb', 'Xom', 'Gozag', 'The Shining One', 'Ashenzari', 'Sif Muna'],
    getBranchForDepth(depth) {
        if (depth <= 3) return 'D';
        if (depth === 4) return 'Temple';
        if (depth <= 7) return 'Lair';
        if (depth <= 9) return 'Orc';
        if (depth <= 12) return 'Vaults';
        return 'Zot';
    },
    formatStatusLine(state) {
        const p = state.player;
        const stars = '★'.repeat(Math.max(0, Math.min(6, p.piety || 0))).padEnd(6, '.');
        return `${state.branchName}:${state.depth}  HP:${p.hp}/${p.hpMax}  MP:${p.pw}/${p.pwMax}  AC:${p.ac}  Str:${p.str} Int:${p.int} Dex:${p.dex}  God:${p.deity || 'None'} [${stars}]  Runes:${p.runes || 0}/15`;
    },
    roles: [
        { key: 'a', id: 'Berserker', race: 'Minotaur', deity: 'Trog', piety: 3, align: 'Chaotic', hp: 24, pw: 2, ac: 5, str: 20, int: 7, wis: 10, dex: 13, con: 18, weapon: { name: 'executioner’s axe', dmg: '2d9', bonus: 2, weight: 65, tval: 22, sval: 12 }, armor: { name: 'scale mail', ac: 6, bonus: 1, weight: 220, tval: 37, sval: 3 }, extra: { kind: 'potion', name: 'potion of might', glyph: '!', heal: 22, count: 2, weight: 15, tval: 71, sval: 38 } },
        { key: 'b', id: 'Conjurer', race: 'Deep Elf', deity: 'Vehumet', piety: 3, align: 'Neutral', hp: 14, pw: 16, ac: 3, str: 8, int: 22, wis: 16, dex: 15, con: 11, weapon: { name: 'staff of conjuration', dmg: '1d7', bonus: 1, weight: 30, tval: 21, sval: 3 }, armor: { name: 'robe of archmagi', ac: 3, bonus: 2, weight: 40, tval: 36, sval: 2 }, extra: { kind: 'wand', name: 'wand of acid', glyph: '/', charges: 9, count: 1, weight: 10, tval: 65, sval: 5 } },
        { key: 'c', id: 'Fighter', race: 'Gargoyle', deity: 'Okawaru', piety: 3, align: 'Lawful', hp: 20, pw: 5, ac: 10, str: 18, int: 11, wis: 12, dex: 14, con: 17, weapon: { name: 'eveningstar', dmg: '2d8', bonus: 2, weight: 50, tval: 21, sval: 10 }, armor: { name: 'plate armour', ac: 10, bonus: 2, weight: 350, tval: 37, sval: 10 }, extra: { kind: 'scroll', name: 'scroll of blinking', glyph: '?', count: 2, weight: 5, tval: 70, sval: 12 } },
        { key: 'd', id: 'Chaos Knight', race: 'Demonspawn', deity: 'Xom', piety: 4, align: 'Chaotic', hp: 19, pw: 8, ac: 6, str: 16, int: 14, wis: 12, dex: 15, con: 16, weapon: { name: 'demon blade of chaos', dmg: '2d7', bonus: 3, weight: 40, tval: 23, sval: 18 }, armor: { name: 'troll leather armour', ac: 5, bonus: 2, weight: 160, tval: 36, sval: 6 }, extra: { kind: 'potion', name: 'potion of curing', glyph: '!', heal: 20, count: 2, weight: 15, tval: 71, sval: 38 } },
        { key: 'e', id: 'Transmuter', race: 'Octopode', deity: 'Ashenzari', piety: 3, align: 'Neutral', hp: 17, pw: 10, ac: 4, str: 14, int: 16, wis: 14, dex: 18, con: 15, weapon: { name: 'trident of freezing', dmg: '1d11', bonus: 2, weight: 35, tval: 22, sval: 5 }, armor: { name: 'ring of protection +4', ac: 4, bonus: 4, weight: 5, tval: 45, sval: 2 }, extra: { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', enchantGain: 1, count: 2, weight: 5, tval: 70, sval: 15 } }
    ],
    monsters: [
        { name: 'goblin', glyph: 'g', attr: 3, minDepth: 1, hp: 6, ac: 9, dmg: 3, exp: 5, lore: 'Small, cruel dungeon scavenger.' },
        { name: 'kobold', glyph: 'K', attr: 3, minDepth: 1, hp: 8, ac: 8, dmg: 4, exp: 7, lore: 'Cunning subterranean tunnel-dweller armed with a short blade.' },
        { name: 'adder', glyph: 'S', attr: 10, minDepth: 1, hp: 10, ac: 7, dmg: 5, exp: 11, lore: 'Fast, venomous serpent of the early Dungeon.' },
        { name: 'Sigmund', glyph: '@', attr: 14, minDepth: 2, hp: 24, ac: 6, dmg: 10, exp: 45, lore: 'Notorious early-dungeon Unique armed with a deadly scythe and confusion magic.' },
        { name: 'orc priest', glyph: 'o', attr: 10, minDepth: 3, hp: 18, ac: 6, dmg: 8, exp: 25, lore: 'Zealous servant of Beogh who smites heretics from afar.' },
        { name: 'gnoll sergeant', glyph: 'g', attr: 14, minDepth: 3, hp: 26, ac: 5, dmg: 10, exp: 32, lore: 'Veteran pack-leader wielding a halberd and buckler.' },
        { name: 'ogre', glyph: 'O', attr: 3, minDepth: 4, hp: 36, ac: 6, dmg: 14, exp: 40, lore: 'Towering brute swinging a giant spiked club.' },
        { name: 'spiny frog', glyph: 'F', attr: 10, minDepth: 5, hp: 42, ac: 4, dmg: 15, exp: 58, lore: 'Venomous predator native to the Lair of Beasts.' },
        { name: 'five-headed hydra', glyph: 'H', attr: 10, minDepth: 6, hp: 58, ac: 3, dmg: 18, exp: 95, lore: 'Regenerating Lair monstrosity whose heads multiply when severed by edged blades.' },
        { name: 'orc warlord', glyph: 'o', attr: 4, minDepth: 8, hp: 72, ac: 1, dmg: 21, exp: 150, lore: 'Supreme commander of the Orcish Mines clad in heavy plate.' },
        { name: 'vault guard', glyph: '@', attr: 11, minDepth: 10, hp: 80, ac: 0, dmg: 22, exp: 180, lore: 'Disciplined sentinel patrolling the sealed Vaults.' },
        { name: 'ancient lich', glyph: 'L', attr: 13, minDepth: 12, hp: 98, ac: -3, dmg: 28, exp: 320, lore: 'Undead archmage commanding crystal spears and necromantic torment.' },
        { name: 'orb guardian', glyph: 'X', attr: 13, minDepth: 13, hp: 115, ac: -4, dmg: 30, exp: 420, lore: 'Metallic multi-limbed sentinel forged to defend the Realm of Zot.' },
        { name: 'orb of fire', glyph: '*', attr: 4, minDepth: 14, hp: 140, ac: -6, dmg: 36, exp: 650, lore: 'Blazing sphere of primordial destruction haunting Zot:5.' }
    ],
    items: [
        { kind: 'gold', name: 'pile of gold pieces', glyph: '$', attr: 14, amount: 40, weight: 2 },
        { kind: 'potion', name: 'potion of heal wounds', glyph: '!', attr: 13, heal: 32, weight: 15, tval: 71, sval: 39 },
        { kind: 'potion', name: 'potion of haste', glyph: '!', attr: 10, heal: 15, weight: 15, tval: 71, sval: 38 },
        { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15 },
        { kind: 'scroll', name: 'scroll of revelation', glyph: '?', attr: 11, weight: 5, tval: 70, sval: 12 },
        { kind: 'rune', name: 'Serpentine Rune of Zot', glyph: '}', attr: 10, weight: 5 },
        { kind: 'weapon', name: 'lajatang of electrocution', glyph: ')', attr: 11, bonus: 4, weight: 40, tval: 22, sval: 15 },
        { kind: 'armor', name: 'gold dragon scales', glyph: '[', attr: 14, ac: 12, bonus: 3, weight: 320, tval: 37, sval: 12 }
    ]
};

if (require.main === module) {
    const defaultSaveDir = path.resolve(__dirname, '../lib/save');
    runCartridgeMain(DCSS_SPEC, defaultSaveDir);
}

class DCSSEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) { super(DCSS_SPEC, opts); }
}
module.exports = { DCSS_SPEC, DCSSEngine };

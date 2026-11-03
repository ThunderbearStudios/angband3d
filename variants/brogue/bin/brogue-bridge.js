#!/usr/bin/env node
/**
 * variants/brogue/bin/brogue-bridge.js
 *
 * Playable Brogue (Community Edition) Realm Engine for YASD 3D / Yendor Engine™.
 * Features Strength & Enchantment progression (zero XP bar), environmental lava/water hazards,
 * liberated captive allies, Lumenstones, and the Amulet of Yendor.
 */
'use strict';

const path = require('path');
const { UniversalCartridgeEngine, runCartridgeMain } = require('../../../server/src/cartridges/cartridge-core');

const BROGUE_SPEC = {
    realm: 'brogue',
    magic: 'SaveBROG',
    version: '1.14-ce-bridge',
    title: 'Brogue (Community Edition)',
    defaultBranch: 'Dungeons of Doom',
    defaultDeity: 'Cavern Resonance',
    goalDepth: 26,
    goalItemName: 'Amulet of Yendor',
    goalGlyph: ',',
    goalBadge: 'Amulet of Yendor',
    healingPotionName: 'potion of life',
    foodName: 'food ration',
    welcomeMessage: 'You step into the bioluminescent caverns of Brogue. Drink Potions of Strength, read Scrolls of Enchantment, and free captive allies!',
    lore: 'Descend 26 tactical depths where progression flows entirely from Potions of Strength, Scrolls of Enchantment, environmental traps, and liberated companions.',
    formatStatusLine(state) {
        const p = state.player;
        const nut = (p.nutrition || 1000) < 300 ? 'Hungry' : 'Satiated';
        return `Depth: ${state.depth}  Gold: ${p.gold}  HP: ${p.hp}/${p.hpMax}  Strength: ${p.str}  Enchantments: +${p.enchantments || 0}  Lumenstones: ${p.lumenstones || 0}  (${nut})`;
    },
    roles: [
        { key: 'a', id: 'Rogue Delver', race: 'Human', align: 'Neutral', hp: 30, pw: 0, ac: 3, str: 12, int: 12, wis: 12, dex: 14, con: 14, weapon: { name: 'dagger', dmg: '1d6', bonus: 0, weight: 15, tval: 23, sval: 2 }, armor: { name: 'leather armor', ac: 3, bonus: 0, weight: 120, tval: 36, sval: 4 }, extra: { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', enchantGain: 1, count: 2, weight: 5, tval: 70, sval: 15 } },
        { key: 'b', id: 'Staff Weaver', race: 'Human', align: 'Neutral', hp: 28, pw: 0, ac: 3, str: 12, int: 15, wis: 14, dex: 13, con: 13, weapon: { name: 'broadsword', dmg: '2d6', bonus: 1, weight: 40, tval: 23, sval: 14 }, armor: { name: 'scale mail', ac: 5, bonus: 0, weight: 200, tval: 37, sval: 3 }, extra: { kind: 'wand', name: 'staff of lightning [4/4]', glyph: '\\', charges: 4, count: 1, weight: 20, tval: 55, sval: 8 } },
        { key: 'c', id: 'Ally Liberator', race: 'Human', align: 'Lawful', hp: 32, pw: 0, ac: 4, str: 13, int: 12, wis: 14, dex: 14, con: 15, weapon: { name: 'war pike', dmg: '2d5', bonus: 1, weight: 45, tval: 22, sval: 8 }, armor: { name: 'chain mail', ac: 6, bonus: 1, weight: 240, tval: 37, sval: 4 }, extra: { kind: 'potion', name: 'potion of strength', glyph: '!', strengthGain: 2, count: 1, weight: 15, tval: 71, sval: 40 } }
    ],
    allies: [
        { name: 'monkey ally', glyph: 'm', hp: 18, dmg: 5, lore: 'Nimble liberated captive that darts into melee and learns monster traits.' },
        { name: 'ogre ally', glyph: 'O', hp: 42, dmg: 12, lore: 'Stalwart liberated ogre wielding a heavy club on your behalf.' },
        { name: 'dar blademaster ally', glyph: 'd', hp: 36, dmg: 11, lore: 'Blink-stepping elven swordmaster freed from dungeon chains.' },
        { name: 'naga ally', glyph: 'N', hp: 55, dmg: 15, lore: 'Serpentine guardian that cleaves multiple adjacent foes at once.' }
    ],
    monsters: [
        { name: 'kobold', glyph: 'k', attr: 4, minDepth: 1, hp: 8, ac: 8, dmg: 3, exp: 0, lore: 'Scrappy cavern scavenger of the shallow depths.' },
        { name: 'jackal', glyph: 'j', attr: 3, minDepth: 1, hp: 7, ac: 7, dmg: 3, exp: 0, lore: 'Hunts in swift packs through dim corridors.' },
        { name: 'goblin', glyph: 'g', attr: 3, minDepth: 1, hp: 12, ac: 7, dmg: 5, exp: 0, lore: 'Spear-wielding tribal ambusher.' },
        { name: 'bloated', glyph: 'b', attr: 13, minDepth: 2, hp: 10, ac: 9, dmg: 4, exp: 0, lore: 'Floating gas-filled creature that ruptures into caustic clouds when slain.' },
        { name: 'pink jelly', glyph: 'J', attr: 13, minDepth: 2, hp: 20, ac: 9, dmg: 5, exp: 0, lore: 'Amorphous ooze that divides when struck with steel.' },
        { name: 'vampire bat', glyph: 'v', attr: 8, minDepth: 3, hp: 14, ac: 4, dmg: 5, exp: 0, lore: 'Swooping predator whose bite drains life.' },
        { name: 'goblin mystic', glyph: 'g', attr: 11, minDepth: 3, hp: 14, ac: 8, dmg: 4, exp: 0, lore: 'Weaves shielding wards around nearby goblins.' },
        { name: 'acid mound', glyph: 'a', attr: 10, minDepth: 4, hp: 16, ac: 8, dmg: 6, exp: 0, lore: 'Corrosive slime that degrades weapons and armor on contact.' },
        { name: 'centipede', glyph: 'c', attr: 4, minDepth: 5, hp: 22, ac: 5, dmg: 8, exp: 0, lore: 'Venomous arthropod whose bite weakens strength.' },
        { name: 'ogre', glyph: 'O', attr: 3, minDepth: 6, hp: 38, ac: 5, dmg: 13, exp: 0, lore: 'Lumbering giant whose club strikes with crushing force.' },
        { name: 'flame turret', glyph: 'T', attr: 4, minDepth: 7, hp: 28, ac: 2, dmg: 11, exp: 0, lore: 'Wall-mounted crystalline emitter that launches bolts of fire.' },
        { name: 'wraith', glyph: 'W', attr: 8, minDepth: 9, hp: 44, ac: 3, dmg: 14, exp: 0, lore: 'Invisible phantom that reveals itself only when striking.' },
        { name: 'salamander', glyph: 's', attr: 4, minDepth: 10, hp: 48, ac: 3, dmg: 15, exp: 0, lore: 'Molten amphibian that leaves trails of searing fire across lava.' },
        { name: 'troll', glyph: 'T', attr: 10, minDepth: 12, hp: 62, ac: 3, dmg: 18, exp: 0, lore: 'Regenerating subterranean behemoth.' },
        { name: 'golem', glyph: 'G', attr: 15, minDepth: 16, hp: 90, ac: 0, dmg: 20, exp: 0, lore: 'Unstoppable stone automaton immune to fire and poison.' },
        { name: 'tentacle horror', glyph: 'H', attr: 13, minDepth: 20, hp: 105, ac: -1, dmg: 26, exp: 0, lore: 'Abyssal monstrosity of the deep lumenstone caverns.' },
        { name: 'dragon', glyph: 'D', attr: 4, minDepth: 23, hp: 135, ac: -3, dmg: 32, exp: 0, lore: 'Supreme apex predator of the deep caverns whose breath ignites the air.' }
    ],
    items: [
        { kind: 'potion', name: 'potion of life', glyph: '!', attr: 4, heal: 40, weight: 15, tval: 71, sval: 39 },
        { kind: 'potion', name: 'potion of strength', glyph: '!', attr: 14, strengthGain: 2, weight: 15, tval: 71, sval: 40 },
        { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15 },
        { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 11, weight: 5, tval: 70, sval: 12 },
        { kind: 'food', name: 'food ration', glyph: ':', attr: 3, nutrition: 950, weight: 20, tval: 80, sval: 1 },
        { kind: 'weapon', name: 'runic broadsword', glyph: ')', attr: 11, bonus: 3, weight: 40, tval: 23, sval: 14 },
        { kind: 'armor', name: 'splint mail of mutuality', glyph: '[', attr: 15, ac: 7, bonus: 2, weight: 300, tval: 37, sval: 8 },
        { kind: 'wand', name: 'staff of firebolt [4/4]', glyph: '\\', attr: 4, charges: 4, weight: 20, tval: 55, sval: 6 },
        { kind: 'lumenstone', name: 'glowing lumenstone', glyph: '*', attr: 14, weight: 5 }
    ]
};

if (require.main === module) {
    const defaultSaveDir = path.resolve(__dirname, '../lib/save');
    runCartridgeMain(BROGUE_SPEC, defaultSaveDir);
}

class BrogueEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) { super(BROGUE_SPEC, opts); }
}
module.exports = { BROGUE_SPEC, BrogueEngine };

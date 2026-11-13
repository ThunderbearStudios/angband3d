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
    usesExpLevels: true,
    maxLevel: 27,
    // Authentic DCSS XL 1..27 cumulative experience progression thresholds
    expTable: [
        10, 30, 70, 140, 270, 520, 1010, 1980, 3910, 7760,
        15450, 29000, 48500, 74000, 105500, 143000, 186500, 236000, 291500, 353000,
        420500, 494000, 573500, 659000, 750500, 848000
    ],
    onLevelGain(p, engine) {
        const hpGain = 5 + Math.floor((p.con || 12) / 4);
        const mpGain = 1 + Math.floor((p.int || 10) / 5);
        p.hpMax += hpGain;
        p.hp = p.hpMax;
        p.pwMax += mpGain;
        p.pw = p.pwMax;
        if (p.piety < 6) p.piety++;
        let statNote = '';
        if (p.level % 3 === 0) {
            if ((p.int || 0) > (p.str || 0) && (p.int || 0) >= (p.dex || 0)) {
                p.int++;
                statNote = ' Your intelligence increases!';
            } else if ((p.dex || 0) > (p.str || 0)) {
                p.dex++;
                statNote = ' Your dexterity increases!';
            } else {
                p.str++;
                statNote = ' Your strength increases!';
            }
        }
        engine.addMessage(`You have reached experience level ${p.level}! (+${hpGain} HP, +${mpGain} MP)${statNote}`, 14);
    },
    defaultBranch: 'D',
    defaultDeity: 'Trog',
    victoryMode: 'three_runes',
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
        const xlStr = p.expNext > 0 ? `XL:${p.level}(${p.exp}/${p.expNext})` : `XL:${p.level}(MAX)`;
        return `${state.branchName}:${state.depth}  ${xlStr}  HP:${p.hp}/${p.hpMax}  MP:${p.pw}/${p.pwMax}  AC:${p.ac}  Str:${p.str} Int:${p.int} Dex:${p.dex}  Runes:${p.runes || 0}/3  God:${p.deity || 'None'}[${stars}]`;
    },
    roles: [
        {
            key: 'a', id: 'Berserker', race: 'Minotaur', deity: 'Trog', piety: 3, align: 'Chaotic', hp: 24, pw: 6, ac: 5, str: 20, int: 7, wis: 10, dex: 13, con: 18,
            weapon: { name: 'executioner’s axe', dmg: '2d9', bonus: 2, weight: 65, tval: 22, sval: 12 },
            armor: { name: 'scale mail', ac: 6, bonus: 1, weight: 220, tval: 37, sval: 3 },
            extra: { kind: 'potion', name: 'potion of might', glyph: '!', heal: 22, count: 2, weight: 15, tval: 71, sval: 38 },
            innatePower: { name: 'Minotaur Headbutt Charge', cost: 2, dmg: 18, desc: 'Horns-first charge that crushes the nearest enemy.' },
            disciplinePowers: [
                { name: "Trog's Berserk Rage", cost: 2, dmg: 20, heal: 8, desc: 'Blood-frenzy cleave + surge of vitality.' },
                { name: "Trog's Hand", cost: 2, heal: 16, curePoison: true, desc: 'Regeneration & magic resistance.' },
                { name: 'Brothers in Arms', cost: 4, dmg: 26, aoe: true, desc: 'Summons wrathful berserker fury across all visible foes.' },
                { name: 'Whirlwind Axe Cleave', cost: 2, dmg: 16, aoe: true, desc: 'Sweeping executioner arc hitting all visible enemies.' }
            ]
        },
        {
            key: 'b', id: 'Conjurer', race: 'Deep Elf', deity: 'Vehumet', piety: 3, align: 'Neutral', hp: 14, pw: 16, ac: 3, str: 8, int: 22, wis: 16, dex: 15, con: 11,
            weapon: { name: 'staff of conjuration', dmg: '1d7', bonus: 1, weight: 30, tval: 21, sval: 3 },
            armor: { name: 'robe of archmagi', ac: 3, bonus: 2, weight: 40, tval: 36, sval: 2 },
            extra: { kind: 'wand', name: 'wand of acid', glyph: '/', charges: 9, count: 1, weight: 10, tval: 65, sval: 5 },
            innatePower: { name: 'Deep Elf Mana Channel', cost: 1, heal: 10, desc: 'Converts arcane resonance into a protective ward.' },
            disciplinePowers: [
                { name: 'Magic Dart', cost: 1, dmg: 12, desc: 'Unerring bolt of pure conjuration force.' },
                { name: 'Searing Ray', cost: 2, dmg: 19, desc: 'Focused beam of searing arcane energy.' },
                { name: 'Iskenderun’s Mystic Blast', cost: 3, dmg: 22, aoe: true, desc: 'Detonates a shockwave of orb-force across the room.' },
                { name: 'Fulminant Prism', cost: 4, dmg: 28, aoe: true, desc: 'Vehumet-blessed prism explosion.' }
            ]
        },
        {
            key: 'c', id: 'Fighter', race: 'Gargoyle', deity: 'Okawaru', piety: 3, align: 'Lawful', hp: 20, pw: 8, ac: 10, str: 18, int: 11, wis: 12, dex: 14, con: 17,
            weapon: { name: 'eveningstar', dmg: '2d8', bonus: 2, weight: 50, tval: 21, sval: 10 },
            armor: { name: 'plate armour', ac: 10, bonus: 2, weight: 350, tval: 37, sval: 10 },
            extra: { kind: 'scroll', name: 'scroll of blinking', glyph: '?', count: 2, weight: 5, tval: 70, sval: 12 },
            innatePower: { name: 'Gargoyle Stone Skin', cost: 2, heal: 14, curePoison: true, desc: 'Hardens stone hide and purges toxins.' },
            disciplinePowers: [
                { name: "Okawaru's Heroism", cost: 2, dmg: 16, heal: 10, desc: 'Grants +5 martial prowess and bolsters stamina.' },
                { name: "Okawaru's Finesse", cost: 3, dmg: 24, desc: 'Doubles combat attack speed for a devastating flurry.' },
                { name: 'Shield Slam', cost: 2, dmg: 18, desc: 'Crushing shield bash that staggers the nearest foe.' },
                { name: 'Duelist’s Verdict', cost: 4, dmg: 28, desc: 'Precision execution strike.' }
            ]
        },
        {
            key: 'd', id: 'Chaos Knight', race: 'Demonspawn', deity: 'Xom', piety: 4, align: 'Chaotic', hp: 19, pw: 10, ac: 6, str: 16, int: 14, wis: 12, dex: 15, con: 16,
            weapon: { name: 'demon blade of chaos', dmg: '2d7', bonus: 3, weight: 40, tval: 23, sval: 18 },
            armor: { name: 'troll leather armour', ac: 5, bonus: 2, weight: 160, tval: 36, sval: 6 },
            extra: { kind: 'potion', name: 'potion of curing', glyph: '!', heal: 20, count: 2, weight: 15, tval: 71, sval: 38 },
            innatePower: { name: 'Demonic Hellfire Surge', cost: 2, dmg: 20, aoe: true, desc: 'Unleashes Demonspawn hellfire across visible foes.' },
            disciplinePowers: [
                { name: "Xom's Chaotic Translocation", cost: 2, blink: true, heal: 8, desc: 'Blinks through the Abyssal weave and mends wounds.' },
                { name: 'Chaos Cleave', cost: 2, dmg: 19, desc: 'Inflicts random elemental & chaos brands.' },
                { name: 'Pandemonium Nova', cost: 3, dmg: 23, aoe: true, desc: 'Erupts with Xom’s laughter, scorching all nearby enemies.' },
                { name: 'Mutagenic Feast', cost: 3, heal: 18, curePoison: true, desc: 'Draws vitality from the warp.' }
            ]
        },
        {
            key: 'e', id: 'Transmuter', race: 'Octopode', deity: 'Ashenzari', piety: 3, align: 'Neutral', hp: 17, pw: 12, ac: 4, str: 14, int: 16, wis: 14, dex: 18, con: 15,
            weapon: { name: 'trident of freezing', dmg: '1d11', bonus: 2, weight: 35, tval: 22, sval: 5 },
            armor: { name: 'ring of protection +4', ac: 4, bonus: 4, weight: 5, tval: 45, sval: 2 },
            extra: { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', enchantGain: 1, count: 2, weight: 5, tval: 70, sval: 15 },
            innatePower: { name: 'Octopode Constriction Crush', cost: 2, dmg: 19, desc: 'Eight-tentacle constriction crush.' },
            disciplinePowers: [
                { name: 'Beastly Appendage', cost: 1, dmg: 14, desc: 'Morphs natural talons & horns for a swift strike.' },
                { name: 'Spider Form Leap', cost: 2, blink: true, desc: 'Venomous arachnid leap across the chamber.' },
                { name: 'Ice Form Frost Nova', cost: 3, dmg: 21, aoe: true, desc: 'Freezes all visible foes in crystalline rime.' },
                { name: 'Dragon Form Breath', cost: 4, dmg: 29, aoe: true, desc: 'Transmutes into a great wyrm and breathes fire.' }
            ]
        }
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
        { kind: 'potion', name: 'potion of blindness', glyph: '!', attr: 8, blindTurns: 18, weight: 15, tval: 71, sval: 7 },
        { kind: 'potion', name: 'potion of telepathy', glyph: '!', attr: 11, telepathyTurns: 40, grantsTelepathy: true, weight: 15, tval: 71, sval: 42 },
        { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15 },
        { kind: 'scroll', name: 'scroll of revelation', glyph: '?', attr: 11, grantsTelepathy: true, telepathyTurns: 35, weight: 5, tval: 70, sval: 12 },
        { kind: 'rune', name: 'Serpentine Rune of Zot', glyph: '}', attr: 10, weight: 5 },
        { kind: 'weapon', name: 'lajatang of electrocution', glyph: ')', attr: 11, bonus: 4, weight: 40, tval: 22, sval: 15 },
        { kind: 'armor', name: 'gold dragon scales', glyph: '[', attr: 14, ac: 12, bonus: 3, weight: 320, tval: 37, sval: 12 }
    ]
};

const MINDLESS_RE = /jelly|mold|fungus|ooze|pudding|vortex|light|golem|skeleton|zombie/i;

const DCSS_RUNES_BY_DEPTH = {
    7: 'Serpentine Rune of Zot',
    9: 'Barnacled Rune of Zot',
    11: 'Silver Rune of Zot',
    12: 'Slimy Rune of Zot',
    13: 'Abyssal Rune of Zot'
};

class DCSSEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) {
        const defaultSaveDir = path.resolve(__dirname, '../lib/save');
        super(DCSS_SPEC, { saveDir: defaultSaveDir, user: 'Adventurer', ...opts });
    }

    initNewState(roleIdx = 0) {
        super.initNewState(roleIdx);
        const p = this.state.player;
        p.blind = 0;
        p.telepathy = false;
        p.esp = false;
        p.telepathyTurns = 0;
        p.rBlind = false;
        p.runeList = [];
        p.runes = 0;
    }

    loadSave() {
        const ok = super.loadSave();
        if (ok && this.state && this.state.player) {
            const p = this.state.player;
            p.blind = Number(p.blind || 0);
            p.telepathy = Boolean(p.telepathy || p.esp);
            p.esp = Boolean(p.esp || p.telepathy);
            if (!Array.isArray(p.runeList)) p.runeList = [];
            p.runes = p.runeList.length;
        }
        return ok;
    }

    generateLevel(depth) {
        super.generateLevel(depth);
        const runeName = DCSS_RUNES_BY_DEPTH[depth];
        const p = this.state && this.state.player;
        if (!p) return;
        if (!Array.isArray(p.runeList)) p.runeList = [];
        if (runeName && !p.runeList.includes(runeName)) {
            const alreadyOnFloor = this.state.objects.some(o => o.name === runeName);
            if (!alreadyOnFloor && Array.isArray(this.state.map)) {
                let rx = 10, ry = 10;
                for (let y = 2; y < this.state.map.length - 2; y++) {
                    let found = false;
                    for (let x = 2; x < this.state.map[y].length - 2; x++) {
                        if (this.state.map[y][x].feat === 1 && !this.state.objects.some(o => o.x === x && o.y === y)) {
                            rx = x; ry = y;
                            found = true;
                            break;
                        }
                    }
                    if (found && (rx !== p.x || ry !== p.y)) break;
                }
                this.state.objects.push({
                    kind: 'rune',
                    name: runeName,
                    glyph: '}',
                    attr: 10,
                    weight: 5,
                    x: rx,
                    y: ry,
                    count: 1,
                    tval: 70,
                    sval: 90
                });
            }
        }
    }

    pickupAtPlayer() {
        const p = this.state.player;
        const idx = this.state.objects.findIndex(o => o.x === p.x && o.y === p.y);
        if (idx < 0) {
            this.addMessage('There is nothing here to pick up.');
            return;
        }
        const obj = this.state.objects[idx];
        if (obj.isGoalArtifact || obj.name === 'Orb of Zot') {
            if ((p.runes || 0) < 3) {
                this.addMessage(`A sphere of dread force repels your touch! The Orb of Zot rejects champions who lack the tripartite mark of ascension. (Runes: ${p.runes || 0}/3)`, 12);
                return;
            }
            this.state.objects.splice(idx, 1);
            p.hasAmulet = true;
            p.winner = true;
            this.addMessage(`Glorious Victory! You claim the ${obj.name} with all required Runes (${p.runes}/3) and conquer the Realm of Zot!`, 14);
            p.inventory.push(obj);
            this.reindexInventory();
            this.advanceTurn();
            return;
        }
        if (obj.kind === 'rune' || /rune of zot/i.test(obj.name)) {
            this.state.objects.splice(idx, 1);
            if (!Array.isArray(p.runeList)) p.runeList = [];
            if (!p.runeList.includes(obj.name)) {
                p.runeList.push(obj.name);
            }
            p.runes = p.runeList.length;
            this.addMessage(`You claim the ${obj.name}! (Runes: ${p.runes || 0}/3)`, 14);
            this.advanceTurn();
            return;
        }
        super.pickupAtPlayer();
    }

    handleKey(rawKey) {
        const k = String(rawKey || '').trim();
        const p = this.state && this.state.player;
        if (p && k === '>') {
            const cell = this.state.map && this.state.map[p.y] && this.state.map[p.y][p.x];
            if (cell && cell.feat === 6 && this.state.depth === 14 && (p.runes || 0) < 3) {
                this.addMessage(`The Gates of Zot are sealed by ancient warding runes! You must collect at least 3 Runes of Zot to unseal the portal. (Runes: ${p.runes || 0}/3)`, 12);
                return;
            }
        }
        super.handleKey(rawKey);
    }

    updateVisibility() {
        const p = this.state && this.state.player;
        if (p && p.blind > 0 && Array.isArray(this.state.map)) {
            for (let y = 0; y < this.state.map.length; y++) {
                const row = this.state.map[y];
                for (let x = 0; x < row.length; x++) row[x].inView = false;
            }
            if (this.state.map[p.y] && this.state.map[p.y][p.x]) {
                this.state.map[p.y][p.x].inView = true;
                this.state.map[p.y][p.x].known = true;
            }
            return;
        }
        super.updateVisibility();
    }

    _hasEsp() {
        const p = this.state.player;
        return Boolean(
            p.telepathy || p.esp ||
            (p.deity === 'Ashenzari' && (p.piety || 0) >= 5) ||
            (Array.isArray(p.inventory) && p.inventory.some(it => it.equipped && /telepathy|esp|antennae/i.test(it.name || '')))
        );
    }

    applyVerbToItem(verb, item) {
        const p = this.state.player;
        if (item && (verb === 'quaff' || (verb === 'use' && item.kind === 'potion'))) {
            const nm = String(item.name || '');
            if (item.blindTurns || /blindness|dazzl|darkness/i.test(nm)) {
                if (!p.rBlind) {
                    p.blind = Math.max(p.blind || 0, (item.blindTurns || 18) + 1);
                    this.updateVisibility();
                    this.addMessage('A dazzling miasma blinds your vision!', 6);
                } else {
                    this.addMessage('Your vision wavers briefly, then holds firm.', 11);
                }
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.grantsTelepathy || item.telepathyTurns || /telepathy|esp|antennae/i.test(nm)) {
                p.telepathy = true;
                p.esp = true;
                p.telepathyTurns = Math.max(p.telepathyTurns || 0, (item.telepathyTurns || 40) + 1);
                this.addMessage('Astral antennae unfold in your mind — you sense nearby creatures!', 11);
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.heal || /heal|curing|purif/i.test(nm)) {
                if (p.blind > 0) {
                    p.blind = 0;
                    this.updateVisibility();
                    this.addMessage('Your vision clears!', 11);
                }
            }
        } else if (item && (verb === 'read' || (verb === 'use' && item.kind === 'scroll')) && (item.grantsTelepathy || /revelation/i.test(item.name || ''))) {
            p.telepathy = true;
            p.esp = true;
            p.telepathyTurns = Math.max(p.telepathyTurns || 0, (item.telepathyTurns || 35) + 1);
        }
        super.applyVerbToItem(verb, item);
    }

    prayAtAltar() {
        const p = this.state.player;
        const cell = this.state.map[p.y] && this.state.map[p.y][p.x];
        if (cell && cell.feat === 43 && p.blind > 0) {
            p.blind = 0;
            this.updateVisibility();
        }
        super.prayAtAltar();
    }

    castActivePower(power, targetX, targetY) {
        const p = this.state.player;
        if (power && power.curePoison && p.blind > 0) {
            p.blind = 0;
            this.updateVisibility();
        }
        super.castActivePower(power, targetX, targetY);
    }

    advanceTurn() {
        const p = this.state.player;
        const wasBlind = p.blind > 0;
        super.advanceTurn();
        if (p.dead) return;
        if (wasBlind && p.blind > 0) {
            p.blind--;
            if (p.blind === 0) {
                this.updateVisibility();
                this.addMessage('You can see again.', 11);
            }
        } else if (!wasBlind && !p.rBlind) {
            const dazzler = this.state.monsters.find(m => m.hp > 0 && /Sigmund|orb of fire/i.test(m.race || '') && Math.hypot(m.x - p.x, m.y - p.y) <= 2.5);
            if (dazzler && this.rand(100) < 18) {
                p.blind = 6 + this.rand(5);
                this.updateVisibility();
                this.addMessage(`A dazzling glare from ${dazzler.race} blinds you!`, 14);
            }
        }
        if (p.telepathyTurns > 0) {
            p.telepathyTurns--;
            if (p.telepathyTurns === 0 && !p.intrinsicTelepathy) {
                p.telepathy = false;
                p.esp = false;
                this.addMessage('Your telepathic sense fades.', 8);
            }
        }
    }

    buildFrame() {
        const frame = super.buildFrame();
        const p = this.state.player;
        const isBlind = Boolean(p.blind > 0);
        const hasEsp = this._hasEsp();
        frame.player.blind = isBlind;
        frame.player.flags.esp = hasEsp;
        frame.player.flags.telepathy = hasEsp;
        frame.player.flags.rBlind = Boolean(p.rBlind || frame.player.flags.rBlind);

        const hashRaceIdx = (raceName) => {
            const s = String(raceName || 'unknown');
            let h = 1;
            for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) & 0x7ff;
            return h || 1;
        };
        const serializeMon = (m, espFlag, sensedFlag) => ({
            id: m.id,
            r_idx: m.r_idx || hashRaceIdx(m.race),
            y: m.y,
            x: m.x,
            attr: m.attr || 1,
            glyph: m.glyph,
            name: m.race,
            race: m.race,
            race_level: m.race_level || 1,
            hp: m.hp,
            hp_max: m.hp_max,
            ac: m.ac != null ? m.ac : 8,
            dmg: m.dmg || 4,
            speed: (m.speed != null ? m.speed : 110) - 110,
            unique: Boolean(m.isBoss || m.isNemesis || m.unique),
            attitude: m.isPet ? 'pet' : ((m.peaceful || m.friendly) ? 'friendly' : 'hostile'),
            exp: m.exp || 0,
            lore: m.lore || '',
            isPet: Boolean(m.isPet),
            pet: Boolean(m.isPet),
            friendly: Boolean(m.isPet || m.peaceful),
            peaceful: Boolean(m.peaceful || m.isPet),
            captive: Boolean(m.captive),
            isBoss: Boolean(m.isBoss),
            isNemesis: Boolean(m.isNemesis),
            townRole: m.townRole || null,
            esp: Boolean(espFlag),
            sensed: Boolean(sensedFlag)
        });

        if (isBlind) {
            if (!frame.player.statuses.some(s => s.name === 'Blind')) {
                frame.player.statuses.unshift({ name: 'Blind', attr: 6, val: p.blind });
            }
            const sensedMons = [];
            const sensedByCoord = new Map();
            for (const m of this.state.monsters) {
                if (m.hp <= 0) continue;
                const espMind = hasEsp && !MINDLESS_RE.test(m.race || m.name || '');
                const adj = Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1;
                if (espMind || adj) {
                    sensedMons.push(serializeMon(m, espMind, true));
                    sensedByCoord.set(`${m.x},${m.y}`, m);
                }
            }
            frame.monsters = sensedMons;
            frame.map.rows = this.state.map.map((row, y) => {
                let g = '', a = '', f = '', l = '';
                for (let x = 0; x < row.length; x++) {
                    const cell = row[x];
                    const isSelf = (x === p.x && y === p.y);
                    const sm = !isSelf ? sensedByCoord.get(`${x},${y}`) : null;
                    const ch = isSelf ? '@' : (sm ? sm.glyph : (cell.known ? cell.glyph : ' '));
                    const at = isSelf ? 1 : (sm ? (sm.attr || 1) : (cell.known ? (cell.attr || 1) : 1));
                    const featCode = cell.known ? cell.feat : 0;
                    const lighting = isSelf ? 1 : 3;
                    const flag = (cell.known ? 1 : 0) | (isSelf ? 2 : 0) | ((lighting & 3) << 2);
                    g += ch;
                    a += at.toString(16).padStart(2, '0');
                    f += featCode.toString(16).padStart(2, '0');
                    l += flag.toString(16);
                }
                return { g, a, f, l };
            });
        } else if (hasEsp) {
            const seenIds = new Set(frame.monsters.map(m => m.id));
            for (const m of this.state.monsters) {
                if (m.hp > 0 && !seenIds.has(m.id) && !MINDLESS_RE.test(m.race || m.name || '')) {
                    frame.monsters.push(serializeMon(m, true, true));
                }
            }
        }
        frame.player.runes = p.runes || 0;
        frame.player.runeList = p.runeList || [];
        frame.victory = Boolean(p.winner || p.ascended);
        frame.player.winner = Boolean(p.winner || p.ascended);
        frame.player.victory = Boolean(p.winner || p.ascended);
        return frame;
    }
}

if (require.main === module) {
    const readline = require('readline');
    const defaultSaveDir = path.resolve(__dirname, '../lib/save');
    let user = 'Adventurer', saveDir = defaultSaveDir, isNew = false, customBirth = false, randomBirth = false;
    for (let i = 2; i < process.argv.length; i++) {
        const arg = String(process.argv[i] || '');
        if (arg === '-n') isNew = true;
        else if (arg === '-c' || arg === '--custom') customBirth = true;
        else if (arg === '-r' || arg === '--random') randomBirth = true;
        else if (arg.startsWith('-u')) user = arg.slice(2) || user;
        else if (arg.startsWith('-dsave=')) saveDir = arg.slice(7) || saveDir;
    }
    const engine = new DCSSEngine({ user: user.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'Adventurer', saveDir, isNew, customBirth, randomBirth });
    const writeJson = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
    writeJson({ t: 'hello', protocol: 1, protocol_minor: 2, version: DCSS_SPEC.version, realm: DCSS_SPEC.realm, savefile: engine.saveFile });
    writeJson({ t: 'commands', realm: DCSS_SPEC.realm, verbBits: ['quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'fire', 'throw', 'wield', 'takeoff', 'drop', 'inscribe', 'uninscribe', 'refill', 'browse', 'study', 'cast', 'ignore', 'examine'] });
    writeJson(engine.buildFrame());
    readline.createInterface({ input: process.stdin, terminal: false }).on('line', (rawLine) => {
        const line = String(rawLine || '').trim();
        if (!line) return;
        if (line === 'save') { writeJson({ t: 'saved', ok: engine.saveGame() }); return; }
        if (line === 'frame') { writeJson(engine.buildFrame()); return; }
        if (line === 'quit' || line === 'exit') { engine.saveGame(); process.exit(0); return; }
        if (line.startsWith('key ') || line.startsWith('keys ')) { engine.handleKey(line.replace(/^keys?\s+/, '')); writeJson(engine.buildFrame()); }
    });
}

module.exports = { DCSS_SPEC, DCSSEngine };

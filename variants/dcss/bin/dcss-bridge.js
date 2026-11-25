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
const RyodSystems = require('../../../server/src/cartridges/ryod-systems');

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
            ringSlots: 8, allowBodyArmor: false,
            weapon: { name: 'trident of freezing', dmg: '1d11', bonus: 2, weight: 35, tval: 22, sval: 5 },
            armor: null,
            ring: { kind: 'ring', name: 'ring of protection', glyph: '=', attr: 14, acBonus: 4, bonus: 4, equipped: 'ring_1', count: 1, weight: 5, tval: 45, sval: 2 },
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
        { name: 'goblin', glyph: 'g', attr: 3, minDepth: 1, hp: 6, ac: 1, ev: 12, dmg: 3, exp: 5, lore: 'Small, cruel dungeon scavenger.' },
        { name: 'kobold', glyph: 'K', attr: 3, minDepth: 1, hp: 8, ac: 1, ev: 12, dmg: 4, exp: 7, lore: 'Cunning subterranean tunnel-dweller armed with a short blade.' },
        { name: 'adder', glyph: 'S', attr: 10, minDepth: 1, hp: 10, ac: 2, ev: 15, dmg: 5, exp: 11, lore: 'Fast, venomous serpent of the early Dungeon.' },
        { name: 'Sigmund', glyph: '@', attr: 14, minDepth: 2, hp: 24, ac: 2, ev: 12, dmg: 10, exp: 45, lore: 'Notorious early-dungeon Unique armed with a deadly scythe and confusion magic.' },
        { name: 'orc priest', glyph: 'o', attr: 10, minDepth: 3, hp: 18, ac: 4, ev: 10, dmg: 8, exp: 25, lore: 'Zealous servant of Beogh who smites heretics from afar.' },
        { name: 'gnoll sergeant', glyph: 'g', attr: 14, minDepth: 3, hp: 26, ac: 5, ev: 11, dmg: 10, exp: 32, lore: 'Veteran pack-leader wielding a halberd and buckler.' },
        { name: 'ogre', glyph: 'O', attr: 3, minDepth: 4, hp: 36, ac: 3, ev: 8, dmg: 14, exp: 40, lore: 'Towering brute swinging a giant spiked club.' },
        { name: 'spiny frog', glyph: 'F', attr: 10, minDepth: 5, hp: 42, ac: 5, ev: 13, dmg: 15, exp: 58, lore: 'Venomous predator native to the Lair of Beasts.' },
        { name: 'five-headed hydra', glyph: 'H', attr: 10, minDepth: 6, hp: 58, ac: 6, ev: 9, dmg: 18, exp: 95, lore: 'Regenerating Lair monstrosity whose heads multiply when severed by edged blades.' },
        { name: 'orc warlord', glyph: 'o', attr: 4, minDepth: 8, hp: 72, ac: 14, ev: 9, dmg: 21, exp: 150, lore: 'Supreme commander of the Orcish Mines clad in heavy plate.' },
        { name: 'vault guard', glyph: '@', attr: 11, minDepth: 10, hp: 80, ac: 12, ev: 11, dmg: 22, exp: 180, lore: 'Disciplined sentinel patrolling the sealed Vaults.' },
        { name: 'ancient lich', glyph: 'L', attr: 13, minDepth: 12, hp: 98, ac: 12, ev: 11, dmg: 28, exp: 320, lore: 'Undead archmage commanding crystal spears and necromantic torment.' },
        { name: 'orb guardian', glyph: 'X', attr: 13, minDepth: 13, hp: 115, ac: 18, ev: 12, dmg: 30, exp: 420, lore: 'Metallic multi-limbed sentinel forged to defend the Realm of Zot.' },
        { name: 'orb of fire', glyph: '*', attr: 4, minDepth: 14, hp: 140, ac: 20, ev: 22, dmg: 36, exp: 650, lore: 'Blazing sphere of primordial destruction haunting Zot:5.' }
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

const DCSS_BRANCH_FORKS = Object.freeze({
    lair_rune: { depth: 6, prompt: 'Choose Lair Branch', choices: ['Swamp', 'Snake Pit', 'Shoals'] },
    mid_branch: { depth: 8, prompt: 'Choose Middle Branch', choices: ['Orcish Mines', 'Elven Halls', 'Vaults'] },
    deep_rune: { depth: 10, prompt: 'Choose Rune Vault', choices: ['Vaults', 'Slime Pits', 'Abyss'] }
});

const DCSS_GOD_KITS = Object.freeze({
    Trog: {
        title: 'Trog the Wrathful',
        passiveDesc: '+4 HP fury rush on kill',
        powerName: 'Berserk Fury & Brothers in Arms',
        powerCost: 2,
        dmg: 24,
        heal: 10
    },
    Okawaru: {
        title: 'Okawaru the Warmaster',
        passiveDesc: '+3 HP & prowess cadence on kill',
        powerName: 'Heroism & Finesse',
        powerCost: 2,
        dmg: 20,
        heal: 12,
        haste: true
    },
    Vehumet: {
        title: 'Vehumet of Destruction',
        passiveDesc: '+2 MP siphon on spell/foe kill',
        powerName: 'Vehumet Destructive Blast',
        powerCost: 2,
        dmg: 26,
        aoe: true
    },
    Makhleb: {
        title: 'Makhleb the Destroyer',
        passiveDesc: '+5 HP blood siphon on every kill',
        powerName: 'Summon Greater Destruction',
        powerCost: 2,
        dmg: 25,
        heal: 8,
        aoe: true
    },
    'The Shining One': {
        title: 'The Shining One',
        passiveDesc: '+4 HP & purge darkness on kill',
        powerName: 'Cleansing Flame',
        powerCost: 2,
        dmg: 22,
        heal: 14,
        cureBlind: true,
        aoe: true
    }
});

class DCSSEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) {
        const defaultSaveDir = path.resolve(__dirname, '../lib/save');
        super(DCSS_SPEC, { saveDir: defaultSaveDir, user: 'Adventurer', ...opts });
    }

    initNewState(roleIdx = 0) {
        super.initNewState(roleIdx);
        const p = this.state.player;
        const role = (DCSS_SPEC.roles && DCSS_SPEC.roles[roleIdx % DCSS_SPEC.roles.length]) || DCSS_SPEC.roles[0];
        p.blind = 0;
        p.telepathy = false;
        p.esp = false;
        p.telepathyTurns = 0;
        p.rBlind = false;
        p.runeList = [];
        p.runes = 0;
        p.orbRun = false;
        p.selectedBranches = {};
        p.abandonedDeity = null;
        p.godWrath = 0;
        p.worshipKills = 0;
        p.ringSlots = (role && role.ringSlots) || 2;
        p.allowBodyArmor = role ? (role.allowBodyArmor !== false) : true;
        if (role && role.ring && !p.inventory.some(it => it.kind === 'ring' && it.name === role.ring.name)) {
            p.inventory.push({
                ...role.ring,
                kind: 'ring',
                glyph: role.ring.glyph || '=',
                equipped: role.ring.equipped || 'ring_1',
                count: role.ring.count || 1
            });
        }
        this.reindexInventory();
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
            p.orbRun = Boolean(p.orbRun || p.hasAmulet);
            if (!p.selectedBranches || typeof p.selectedBranches !== 'object') p.selectedBranches = {};
            p.godWrath = Number(p.godWrath || 0);
            if (p.race === 'Octopode') {
                if (!p.ringSlots) p.ringSlots = 8;
                p.allowBodyArmor = false;
            }
        }
        return ok;
    }

    getBranchName(depth) {
        const p = this.state && this.state.player;
        const sb = (p && p.selectedBranches) || {};
        if ((depth === 6 || depth === 7) && sb.lair_rune) return sb.lair_rune;
        if ((depth === 8 || depth === 9) && sb.mid_branch) return sb.mid_branch;
        if (depth >= 10 && depth <= 13 && sb.deep_rune) return sb.deep_rune;
        return DCSS_SPEC.getBranchForDepth(depth);
    }

    selectBranch(forkId, choice) {
        const fork = DCSS_BRANCH_FORKS[forkId];
        if (!fork || !fork.choices.includes(choice)) return false;
        const p = this.state.player;
        p.selectedBranches = p.selectedBranches || {};
        p.selectedBranches[forkId] = choice;
        this.state.branchName = this.getBranchName(this.state.depth);
        this.addMessage(`Branch charted: You enter ${choice} (${fork.prompt}).`, 14);
        return true;
    }

    _spawnOrbPursuer() {
        const p = this.state.player;
        const map = this.state.map;
        if (!Array.isArray(map)) return;
        const activePursuers = (this.state.monsters || []).filter(m => m.hp > 0 && m.isOrbPursuer).length;
        if (activePursuers >= 3) return;
        for (let attempt = 0; attempt < 25; attempt++) {
            const x = 2 + this.rand(Math.max(4, (map[0]?.length || 66) - 4));
            const y = 2 + this.rand(Math.max(4, map.length - 4));
            if (map[y] && map[y][x] && map[y][x].feat === 1 && Math.hypot(x - p.x, y - p.y) >= 3) {
                const isPanLord = this.rand(2) === 0;
                this.state.monsters.push({
                    id: `orb_pursuer_${Date.now()}_${this.rand(999)}`,
                    race: isPanLord ? 'pandemonium lord' : 'brimstone fiend',
                    glyph: isPanLord ? '&' : '1',
                    attr: 13,
                    x,
                    y,
                    hp: isPanLord ? 115 : 95,
                    hp_max: isPanLord ? 115 : 95,
                    ac: 14,
                    dmg: isPanLord ? 28 : 24,
                    exp: 350,
                    isBoss: isPanLord,
                    isOrbPursuer: true,
                    lore: 'Summoned from Pandemonium to reclaim the Orb of Zot.'
                });
                this.addMessage('The Orb of Zot pulses! Forces of Pandemonium hunt you upward!', 12);
                return;
            }
        }
    }

    generateLevel(depth) {
        super.generateLevel(depth);
        this.state.branchName = this.getBranchName(depth);
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
        if (p.orbRun) {
            this._spawnOrbPursuer();
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
            p.orbRun = true;
            p.winner = false;
            this.addMessage(`You seize the ${obj.name}! The Orb Run begins—fight your way back up to D:1 with all Runes (${p.runes}/3)!`, 14);
            p.inventory.push(obj);
            this.reindexInventory();
            this._spawnOrbPursuer();
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
        } else if (item && verb === 'wield') {
            const lowerItem = String(item.name || '').toLowerCase();
            const k = String(item.kind || '').toLowerCase();
            if (p.allowBodyArmor === false && (k === 'armor' || k === 'body' || /\b(armor|armour|mail|plate|robe|leather|scales|tunic|vestment)\b/.test(lowerItem))) {
                this.addMessage('An Octopode cannot wear body armour!', 12);
                return;
            }
            const ringSlots = Number(p.ringSlots || 2);
            if (ringSlots > 2 && (k === 'ring' || /\b(ring|band)\b/.test(lowerItem))) {
                const used = new Set(p.inventory.filter(i => i.equipped && /^ring/i.test(i.equipped)).map(i => i.equipped));
                let freeSlot = null;
                for (let idx = 1; idx <= ringSlots; idx++) {
                    const cand = `ring_${idx}`;
                    if (!used.has(cand)) { freeSlot = cand; break; }
                }
                if (!freeSlot) {
                    this.addMessage(`All ${ringSlots} of your ring slots are occupied! (Remove one first with [R]).`, 12);
                    return;
                }
                item.equipped = freeSlot;
                this.reindexInventory();
                this.addMessage(`You put on the ${item.name} (${freeSlot}).`, 11);
                this.advanceTurn();
                return;
            }
        }
        super.applyVerbToItem(verb, item);
    }

    switchDeity(newDeity) {
        const p = this.state.player;
        if (!newDeity || newDeity === p.deity) return false;
        const oldDeity = p.deity;
        p.abandonedDeity = oldDeity;
        p.godWrath = Math.max(p.godWrath || 0, 12);
        p.deity = newDeity;
        p.piety = 1;
        this.addMessage(`You forsake ${oldDeity || 'your patron'} for ${newDeity}! ${oldDeity || 'Your former god'} vows divine wrath upon you!`, 12);
        return true;
    }

    handleMonsterKilled(mon) {
        const p = this.state.player;
        super.handleMonsterKilled(mon);
        if (!p || p.dead) return;
        p.worshipKills = (p.worshipKills || 0) + 1;
        if (p.godWrath > 0) {
            p.godWrath--;
            if (p.godWrath === 0) {
                p.abandonedDeity = null;
                this.addMessage('Your divine penance is complete! The wrath subsides.', 11);
            }
        }
        const kit = DCSS_GOD_KITS[p.deity];
        if (kit) {
            if (p.deity === 'Makhleb') p.hp = Math.min(p.hpMax, p.hp + 5);
            else if (p.deity === 'Trog') p.hp = Math.min(p.hpMax, p.hp + 4);
            else if (p.deity === 'Vehumet') p.pw = Math.min(p.pwMax, (p.pw || 0) + 2);
            else if (p.deity === 'Okawaru') p.hp = Math.min(p.hpMax, p.hp + 3);
            else if (p.deity === 'The Shining One') {
                p.hp = Math.min(p.hpMax, p.hp + 4);
                if (p.blind > 0) {
                    p.blind = 0;
                    this.updateVisibility();
                }
            }
        }
        if (p.worshipKills % 4 === 0 && (p.piety || 0) < 6) {
            p.piety = (p.piety || 0) + 1;
            this.addMessage(`${p.deity} appreciates your devotion! (Piety: ${p.piety}/6)`, 14);
        }
    }

    prayAtAltar() {
        const p = this.state.player;
        const cell = this.state.map[p.y] && this.state.map[p.y][p.x];
        if (cell && cell.feat === 43) {
            if (p.blind > 0) {
                p.blind = 0;
                this.updateVisibility();
            }
            if (cell.deity && p.deity && cell.deity !== p.deity) {
                this.switchDeity(cell.deity);
                this.advanceTurn();
                return;
            }
        }
        super.prayAtAltar();
    }

    invokeDeityPower() {
        const p = this.state.player;
        const kit = DCSS_GOD_KITS[p.deity];
        if (kit) {
            if ((p.piety || 0) < (kit.powerCost || 2)) {
                this.addMessage(`${p.deity} requires at least ${kit.powerCost || 2} piety for ${kit.powerName}.`, 12);
                return;
            }
            p.piety = Math.max(0, (p.piety || 0) - (kit.powerCost || 2));
            if (kit.heal) p.hp = Math.min(p.hpMax, p.hp + kit.heal);
            if (kit.haste) p.speedBoost = Math.max(p.speedBoost || 0, 20);
            if (kit.cureBlind && p.blind > 0) {
                p.blind = 0;
                this.updateVisibility();
            }
            const hostiles = (this.state.monsters || []).filter(m => m.hp > 0 && !m.isPet && !m.peaceful && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            if (kit.aoe && hostiles.length > 0) {
                for (const foe of hostiles.slice()) {
                    foe.hp -= kit.dmg;
                    if (foe.hp <= 0) this.handleMonsterKilled(foe);
                }
                this.addMessage(`${kit.title}: ${kit.powerName} blasts ${hostiles.length} visible foe(s) for ${kit.dmg} damage!`, 14);
            } else if (kit.dmg && hostiles.length > 0) {
                hostiles.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
                hostiles[0].hp -= kit.dmg;
                this.addMessage(`${kit.title}: ${kit.powerName} strikes ${hostiles[0].race} for ${kit.dmg} damage!`, 14);
                if (hostiles[0].hp <= 0) this.handleMonsterKilled(hostiles[0]);
            } else {
                this.addMessage(`${kit.title} empowers you with ${kit.powerName}!`, 14);
            }
            this.advanceTurn();
            return;
        }
        if (RyodSystems && typeof RyodSystems.invokeDeityPower === 'function') {
            if (RyodSystems.invokeDeityPower(this)) {
                this.advanceTurn();
                return;
            }
        }
        super.invokeDeityPower();
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
        if (p.godWrath > 0 && this.state.turn > 0 && this.state.turn % 5 === 0) {
            const penalty = Math.min(4, Math.max(1, p.hp - 1));
            p.hp -= penalty;
            p.godWrath--;
            this.addMessage(`${p.abandonedDeity || 'Your abandoned god'} smites your apostasy! (-${penalty} HP, Wrath:${p.godWrath})`, 12);
        }
        if (p.orbRun && this.state.turn > 0 && this.state.turn % 18 === 0) {
            this._spawnOrbPursuer();
        }
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
            ev: m.ev != null ? m.ev : 10,
            dmg: m.dmg != null ? m.dmg : 4,
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
        frame.player.orbRun = Boolean(p.orbRun);
        frame.player.godWrath = Number(p.godWrath || 0);
        frame.player.abandonedDeity = p.abandonedDeity || null;
        frame.player.selectedBranches = p.selectedBranches || {};
        frame.player.deityKit = DCSS_GOD_KITS[p.deity] || null;
        frame.branchForks = DCSS_BRANCH_FORKS;
        frame.victory = Boolean(p.winner || p.ascended);
        frame.player.winner = Boolean(p.winner || p.ascended);
        frame.player.victory = Boolean(p.winner || p.ascended);
        return frame;
    }
}

if (require.main === module) {
    runCartridgeMain(DCSSEngine, DCSS_SPEC, path.resolve(__dirname, '../lib/save'));
}

module.exports = { DCSS_SPEC, DCSSEngine };

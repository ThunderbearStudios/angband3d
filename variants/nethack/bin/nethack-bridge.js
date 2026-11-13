#!/usr/bin/env node
/**
 * variants/nethack/bin/nethack-bridge.js
 *
 * Playable NetHack 3.6.7 Realm Engine speaking the authoritative Angband3D `-mbridge`
 * JSON-over-stdio protocol (`hello`, `commands`, `frame`, `save`, `key`, `quit`).
 *
 * Features:
 *   - Character Birth (`setup` phase: Role, Race, Gender, Alignment, or `-n` / `*` Quick Start)
 *   - Procedural Dungeons of Doom, Gnomish Mines, Sokoban, Oracle, High Altars & Gehennom
 *   - 66x22 3D-compatible Map Grid (`g`, `a`, `f`, `l` with Bresenham LOS & room lighting)
 *   - 80x24 Classic Terminal (`term.rows`) + Full Sovereign Grimoire Card compatibility
 *   - 52-Slot (`a-zA-Z`) + `$` Gold Inventory with Beatitude (`blessed`, `uncursed`, `cursed`)
 *   - Equipment (`e`), Quaff (`q`), Read (`r`), Wield (`w`), Wear (`W`), Take Off (`T`),
 *     Put On (`P`), Remove (`R`), Zap Wand (`z`), Apply Tool (`a`), Eat (`e`), Cast (`Z`),
 *     Examine (`:`/`I`/`x`), Drop (`d`), Pickup (`,`/`g`), Open (`o`), Close (`c`), Search (`s`)
 *   - Extended `#` Rituals: `#pray`, `#dip`, `#offer`, `#loot`, `#untrap`, `#chat`, `#force`
 *   - Faithful Pet Companion (`d` Little Dog / `f` Kitten) AI & Monster Tactical AI
 *   - Native `.SAV` persistence with `SaveNHCK` + `description` binary header for `/api/saves`
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const MAP_W = 66;
const MAP_H = 22;
const TERM_W = 80;
const TERM_H = 24;

const FEAT = {
    NONE: 0,
    FLOOR: 1,
    CLOSED_DOOR: 2,
    OPEN_DOOR: 3,
    UP_STAIR: 5,
    DOWN_STAIR: 6,
    ALTAR: 43,
    WALL: 21,
    PERM_WALL: 22,
    FOUNTAIN: 44,
    TRAP: 45
};

const ROLES = [
    { key: 'a', id: 'Valkyrie', race: 'Human', align: 'Lawful', hp: 18, pw: 3, str: 18, int: 10, wis: 13, dex: 15, con: 17, weapon: { name: 'long sword', dmg: '1d8', bonus: 1, buc: 'blessed', tval: 23, sval: 12, weight: 40 }, armor: { name: 'hard leather armor', ac: 3, bonus: 1, buc: 'uncursed', tval: 36, sval: 6, weight: 150 }, extra: { kind: 'food', name: 'food ration', count: 2, buc: 'uncursed', weight: 20, tval: 80, sval: 1 } },
    { key: 'b', id: 'Wizard', race: 'Elf', align: 'Neutral', hp: 12, pw: 14, str: 10, int: 18, wis: 15, dex: 14, con: 12, weapon: { name: 'quarterstaff', dmg: '1d6', bonus: 1, buc: 'blessed', tval: 21, sval: 3, weight: 40 }, armor: { name: 'cloak of magic resistance', ac: 2, bonus: 1, buc: 'blessed', tval: 35, sval: 2, weight: 10 }, extra: { kind: 'wand', name: 'wand of magic missile', charges: 7, buc: 'uncursed', weight: 7, tval: 65, sval: 2 } },
    { key: 'c', id: 'Archeologist', race: 'Human', align: 'Lawful', hp: 15, pw: 6, str: 14, int: 15, wis: 14, dex: 16, con: 14, weapon: { name: 'bullwhip', dmg: '1d6', bonus: 2, buc: 'uncursed', tval: 21, sval: 2, weight: 20 }, armor: { name: 'leather jacket', ac: 3, bonus: 0, buc: 'uncursed', tval: 36, sval: 4, weight: 30 }, extra: { kind: 'tool', name: 'pick-axe', buc: 'uncursed', weight: 100, tval: 20, sval: 1 } },
    { key: 'd', id: 'Samurai', race: 'Human', align: 'Lawful', hp: 17, pw: 4, str: 17, int: 11, wis: 13, dex: 17, con: 16, weapon: { name: 'katana', dmg: '1d10', bonus: 1, buc: 'blessed', tval: 23, sval: 20, weight: 40 }, armor: { name: 'splint mail', ac: 6, bonus: 0, buc: 'uncursed', tval: 37, sval: 6, weight: 400 }, extra: { kind: 'ranged', name: 'yumi bow', dmg: '1d6', bonus: 1, buc: 'uncursed', weight: 30, tval: 19, sval: 2 } },
    { key: 'e', id: 'Knight', race: 'Human', align: 'Lawful', hp: 17, pw: 6, str: 16, int: 12, wis: 15, dex: 14, con: 16, weapon: { name: 'long sword', dmg: '1d8', bonus: 1, buc: 'uncursed', tval: 23, sval: 12, weight: 40 }, armor: { name: 'ring mail', ac: 4, bonus: 1, buc: 'blessed', tval: 37, sval: 2, weight: 250 }, extra: { kind: 'armor', name: 'helmet', ac: 1, bonus: 0, buc: 'uncursed', weight: 30, tval: 32, sval: 2 } },
    { key: 'f', id: 'Rogue', race: 'Human', align: 'Chaotic', hp: 14, pw: 5, str: 14, int: 14, wis: 11, dex: 18, con: 14, weapon: { name: 'short sword', dmg: '1d6', bonus: 1, buc: 'uncursed', tval: 23, sval: 8, weight: 30 }, armor: { name: 'leather armor', ac: 2, bonus: 1, buc: 'uncursed', tval: 36, sval: 4, weight: 150 }, extra: { kind: 'potion', name: 'potion of sickness', count: 1, buc: 'cursed', weight: 20, tval: 71, sval: 9 } },
    { key: 'g', id: 'Priest', race: 'Human', align: 'Lawful', hp: 14, pw: 12, str: 13, int: 13, wis: 18, dex: 12, con: 14, weapon: { name: 'mace', dmg: '2d4', bonus: 1, buc: 'blessed', tval: 21, sval: 5, weight: 30 }, armor: { name: 'robe', ac: 2, bonus: 1, buc: 'blessed', tval: 36, sval: 2, weight: 40 }, extra: { kind: 'potion', name: 'potion of holy water', count: 2, buc: 'blessed', weight: 20, tval: 71, sval: 1 } }
];

const MONSTER_TABLE = [
    { name: 'grid bug', glyph: 'x', attr: 13, minDepth: 1, hp: 4, ac: 9, dmg: 2, exp: 4, speed: 110 },
    { name: 'newt', glyph: ':', attr: 14, minDepth: 1, hp: 4, ac: 8, dmg: 2, exp: 3, speed: 110 },
    { name: 'kobold', glyph: 'k', attr: 3, minDepth: 1, hp: 6, ac: 10, dmg: 4, exp: 6, speed: 110 },
    { name: 'sewer rat', glyph: 'r', attr: 3, minDepth: 1, hp: 5, ac: 7, dmg: 3, exp: 5, speed: 115 },
    { name: 'jackal', glyph: 'd', attr: 3, minDepth: 1, hp: 6, ac: 7, dmg: 3, exp: 6, speed: 115 },
    { name: 'acid blob', glyph: 'b', attr: 10, minDepth: 1, hp: 7, ac: 8, dmg: 3, exp: 7, speed: 95 },
    { name: 'goblin', glyph: 'o', attr: 8, minDepth: 1, hp: 8, ac: 10, dmg: 5, exp: 9, speed: 110 },
    { name: 'gnome', glyph: 'G', attr: 3, minDepth: 2, hp: 10, ac: 10, dmg: 6, exp: 12, speed: 105 },
    { name: 'floating eye', glyph: 'e', attr: 11, minDepth: 2, hp: 9, ac: 9, dmg: 1, exp: 15, speed: 95 },
    { name: 'yellow light', glyph: 'y', attr: 14, minDepth: 2, hp: 8, ac: 0, dmg: 6, exp: 14, speed: 120 },
    { name: 'violet fungus', glyph: 'F', attr: 13, minDepth: 3, hp: 14, ac: 7, dmg: 5, exp: 18, speed: 85 },
    { name: 'gelatinous cube', glyph: 'b', attr: 11, minDepth: 3, hp: 16, ac: 8, dmg: 7, exp: 22, speed: 95 },
    { name: 'hill orc', glyph: 'o', attr: 14, minDepth: 3, hp: 14, ac: 6, dmg: 8, exp: 20, speed: 110 },
    { name: 'spotted jelly', glyph: 'j', attr: 10, minDepth: 3, hp: 15, ac: 8, dmg: 6, exp: 19, speed: 90 },
    { name: 'cockatrice', glyph: 'c', attr: 14, minDepth: 4, hp: 20, ac: 6, dmg: 8, exp: 36, speed: 110 },
    { name: 'raven', glyph: 'B', attr: 8, minDepth: 4, hp: 13, ac: 4, dmg: 6, exp: 20, speed: 125 },
    { name: 'rust monster', glyph: 'R', attr: 3, minDepth: 4, hp: 18, ac: 2, dmg: 6, exp: 32, speed: 120 },
    { name: 'owlbear', glyph: 'Y', attr: 3, minDepth: 5, hp: 28, ac: 5, dmg: 12, exp: 48, speed: 110 },
    { name: 'mumak', glyph: 'q', attr: 8, minDepth: 5, hp: 32, ac: 4, dmg: 13, exp: 55, speed: 105 },
    { name: 'leocrotta', glyph: 'q', attr: 4, minDepth: 6, hp: 34, ac: 4, dmg: 14, exp: 65, speed: 120 },
    { name: 'winter wolf', glyph: 'd', attr: 11, minDepth: 6, hp: 30, ac: 4, dmg: 12, exp: 58, speed: 120 },
    { name: 'mind flayer', glyph: 'h', attr: 13, minDepth: 8, hp: 42, ac: 5, dmg: 16, exp: 110, speed: 115 },
    { name: 'umber hulk', glyph: 'X', attr: 3, minDepth: 9, hp: 48, ac: 2, dmg: 18, exp: 130, speed: 105 },
    { name: 'minotaur', glyph: 'H', attr: 3, minDepth: 10, hp: 58, ac: 6, dmg: 22, exp: 160, speed: 115 },
    { name: 'vampire lord', glyph: 'V', attr: 4, minDepth: 11, hp: 66, ac: 0, dmg: 20, exp: 210, speed: 120 },
    { name: 'red dragon', glyph: 'D', attr: 4, minDepth: 12, hp: 76, ac: -1, dmg: 26, exp: 280, speed: 115 },
    { name: 'black dragon', glyph: 'D', attr: 8, minDepth: 13, hp: 80, ac: -2, dmg: 28, exp: 310, speed: 115 },
    { name: 'arch-lich', glyph: 'L', attr: 13, minDepth: 15, hp: 92, ac: -4, dmg: 30, exp: 420, speed: 120 },
    { name: 'marilith', glyph: '&', attr: 4, minDepth: 17, hp: 110, ac: -6, dmg: 32, exp: 600, speed: 125 },
    { name: 'Wizard of Yendor', glyph: '@', attr: 13, minDepth: 20, hp: 140, ac: -6, dmg: 34, exp: 1000, speed: 125, isBoss: true }
];

const ITEM_POOL = [
    { kind: 'potion', name: 'potion of healing', glyph: '!', attr: 13, buc: 'blessed', weight: 20, tval: 71, sval: 38, heal: 14 },
    { kind: 'potion', name: 'potion of extra healing', glyph: '!', attr: 4, buc: 'blessed', weight: 20, tval: 71, sval: 39, heal: 28 },
    { kind: 'potion', name: 'potion of speed', glyph: '!', attr: 10, buc: 'uncursed', weight: 20, tval: 71, sval: 29, speedTurns: 40 },
    { kind: 'potion', name: 'potion of blindness', glyph: '!', attr: 8, buc: 'cursed', weight: 20, tval: 71, sval: 7, blindTurns: 20 },
    { kind: 'potion', name: 'potion of gain level', glyph: '!', attr: 1, buc: 'blessed', weight: 20, tval: 71, sval: 42 },
    { kind: 'scroll', name: 'scroll of identify', glyph: '?', attr: 1, buc: 'blessed', weight: 5, tval: 70, sval: 12 },
    { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', attr: 11, buc: 'blessed', weight: 5, tval: 70, sval: 16 },
    { kind: 'scroll', name: 'scroll of enchant armor', glyph: '?', attr: 14, buc: 'blessed', weight: 5, tval: 70, sval: 17 },
    { kind: 'scroll', name: 'scroll of teleportation', glyph: '?', attr: 13, buc: 'uncursed', weight: 5, tval: 70, sval: 4 },
    { kind: 'scroll', name: 'scroll of remove curse', glyph: '?', attr: 1, buc: 'blessed', weight: 5, tval: 70, sval: 20 },
    { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 11, buc: 'uncursed', weight: 5, tval: 70, sval: 25 },
    { kind: 'wand', name: 'wand of striking', glyph: '/', attr: 8, buc: 'uncursed', charges: 6, weight: 7, tval: 65, sval: 1, dmg: 14 },
    { kind: 'wand', name: 'wand of fire', glyph: '/', attr: 4, buc: 'uncursed', charges: 5, weight: 7, tval: 65, sval: 5, dmg: 22 },
    { kind: 'wand', name: 'wand of cold', glyph: '/', attr: 11, buc: 'uncursed', charges: 5, weight: 7, tval: 65, sval: 6, dmg: 20 },
    { kind: 'wand', name: 'wand of teleportation', glyph: '/', attr: 13, buc: 'uncursed', charges: 4, weight: 7, tval: 65, sval: 9 },
    { kind: 'weapon', name: 'dwarvish mattock', dmg: '1d12', bonus: 1, glyph: ')', attr: 8, buc: 'uncursed', weight: 120, tval: 22, sval: 10 },
    { kind: 'weapon', name: 'silver saber', dmg: '1d8', bonus: 2, glyph: ')', attr: 1, buc: 'blessed', weight: 40, tval: 23, sval: 15 },
    { kind: 'armor', name: 'dwarvish mithril-coat', ac: 6, bonus: 2, glyph: '[', attr: 11, buc: 'blessed', weight: 150, tval: 37, sval: 10 },
    { kind: 'armor', name: 'elven mithril-coat', ac: 5, bonus: 2, glyph: '[', attr: 10, buc: 'blessed', weight: 150, tval: 37, sval: 9 },
    { kind: 'jewelry', name: 'ring of regeneration', glyph: '=', attr: 10, buc: 'blessed', weight: 3, tval: 45, sval: 10 },
    { kind: 'jewelry', name: 'amulet of ESP', glyph: '"', attr: 11, buc: 'blessed', weight: 3, tval: 40, sval: 3, grantsTelepathy: true },
    { kind: 'jewelry', name: 'amulet of life saving', glyph: '"', attr: 1, buc: 'blessed', weight: 3, tval: 40, sval: 5 },
    { kind: 'tool', name: 'unicorn horn', glyph: '(', attr: 1, buc: 'blessed', weight: 20, tval: 55, sval: 1 },
    { kind: 'tool', name: 'magic lamp', glyph: '(', attr: 14, buc: 'blessed', weight: 20, tval: 39, sval: 2 },
    { kind: 'food', name: 'food ration', glyph: '%', attr: 3, buc: 'uncursed', weight: 20, tval: 80, sval: 1, nutrition: 800 },
    { kind: 'food', name: 'lembas wafer', glyph: '%', attr: 14, buc: 'blessed', weight: 5, tval: 80, sval: 3, nutrition: 800 }
];

const SLOT_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function parseCliArgs(argv) {
    let saveDir = path.resolve(__dirname, '../lib/save');
    let user = 'Rodney';
    let isNew = false;
    let randomBirth = false;
    for (const arg of argv.slice(2)) {
        if (arg.startsWith('-dsave=')) saveDir = arg.slice(7);
        else if (arg.startsWith('-u')) user = arg.slice(2) || user;
        else if (arg === '-n') isNew = true;
        else if (arg === '-r' || arg === '--random') randomBirth = true;
    }
    return { saveDir, user, isNew, randomBirth };
}

function formatItemDesc(it) {
    if (!it) return 'nothing';
    const count = Number(it.count || it.number || 1);
    const prefix = count > 1 ? `${count} ` : (/^[aeiou]/i.test(it.buc || '') ? 'an ' : 'a ');
    const buc = it.buc || 'uncursed';
    let stats = '';
    if (it.kind === 'weapon' || it.kind === 'ranged') {
        const b = Number(it.bonus || 0);
        stats = ` (${it.dmg || '1d6'}) (${b >= 0 ? '+' + b : b},${b >= 0 ? '+' + b : b})`;
    } else if (it.kind === 'armor') {
        const b = Number(it.bonus || 0);
        stats = ` [${it.ac || 2},${b >= 0 ? '+' + b : b}]`;
    } else if (it.kind === 'wand' && it.charges != null) {
        stats = ` (0:${it.charges})`;
    }
    let suffix = '';
    if (it.equipped === 'weapon') suffix = ' (weapon in hand)';
    else if (it.equipped === 'bow') suffix = ' (alternate weapon; bow)';
    else if (it.equipped === 'shield') suffix = ' (worn on arm)';
    else if (it.equipped === 'ring') suffix = ' (on right hand)';
    else if (it.equipped === 'amulet') suffix = ' (around neck)';
    else if (it.equipped) suffix = ' (being worn)';
    const ins = it.inscription ? ` {${it.inscription}}` : '';
    const pluralName = count > 1 && !it.name.endsWith('s') ? it.name.replace(/^(potion|scroll|ration|wafer)/, '$1s') : it.name;
    return `${prefix}${buc} ${pluralName}${stats}${suffix}${ins}`;
}

function resolveEquipMeta(it) {
    if (!it) return { slot_name: 'weapon', tval: 23 };
    const name = String(it.name || '').toLowerCase();
    const eq = String(it.equipped || '').toLowerCase();
    const kind = String(it.kind || '').toLowerCase();
    const rawTval = Number(it.tval) || 0;

    if (eq === 'shield' || rawTval === 34 || /\b(shield|buckler)\b/.test(name)) {
        return { slot_name: 'shield', tval: rawTval || 34 };
    }
    if (eq === 'bow' || kind === 'ranged' || rawTval === 19 || /\b(bow|longbow|shortbow|crossbow|sling|launcher)\b/.test(name)) {
        return { slot_name: 'bow', tval: rawTval || 19 };
    }
    if (eq === 'cloak' || rawTval === 35 || /\b(cloak|mantle)\b/.test(name)) {
        return { slot_name: 'cloak', tval: rawTval || 35 };
    }
    if (eq === 'head' || rawTval === 32 || rawTval === 33 || /\b(helm|helmet|hat|cap|crown)\b/.test(name)) {
        return { slot_name: 'head', tval: rawTval || 32 };
    }
    if (eq === 'hands' || rawTval === 31 || /\b(glove|gloves|gauntlet|gauntlets)\b/.test(name)) {
        return { slot_name: 'hands', tval: rawTval || 31 };
    }
    if (eq === 'feet' || rawTval === 30 || /\b(boot|boots|shoes|sandals)\b/.test(name)) {
        return { slot_name: 'feet', tval: rawTval || 30 };
    }
    if (eq === 'amulet' || rawTval === 40 || /\bamulet\b/.test(name)) {
        return { slot_name: 'amulet', tval: rawTval || 40 };
    }
    if (eq === 'ring' || rawTval === 45 || (kind === 'jewelry' && !/\bamulet\b/.test(name)) || (/\bring\b/.test(name) && !/\bring\s*mail\b/.test(name))) {
        return { slot_name: 'ring', tval: rawTval || 45 };
    }
    if (eq === 'light' || rawTval === 39) {
        return { slot_name: 'light', tval: rawTval || 39 };
    }
    if (eq === 'armor' || eq === 'body' || kind === 'armor' || (rawTval >= 36 && rawTval <= 38)) {
        return { slot_name: 'body', tval: rawTval || 36 };
    }
    return { slot_name: 'weapon', tval: rawTval || 23 };
}

function computeVerbMask(it) {
    // Canonical verb bits matching ActionCatalog:
    // 0:quaff, 1:read, 2:eat, 3:aim, 4:use_staff, 5:zap, 6:activate, 7:fire, 8:throw,
    // 9:wield, 10:takeoff, 11:drop, 12:inscribe, 13:uninscribe, 14:refill, 15:browse, 16:study, 17:cast, 18:ignore, 19:examine
    let mask = (1 << 8) | (1 << 11) | (1 << 12) | (1 << 19); // throw + drop + inscribe + examine
    if (!it) return mask;
    if (it.inscription) mask |= (1 << 13);
    if (it.kind === 'ranged') mask |= (1 << 7);
    if (it.equipped) {
        mask |= (1 << 10); // takeoff
    } else if (it.kind === 'weapon' || it.kind === 'ranged' || it.kind === 'armor' || it.kind === 'jewelry') {
        mask |= (1 << 9); // wield/wear
    }
    if (it.kind === 'potion') mask |= (1 << 0);
    if (it.kind === 'scroll') mask |= (1 << 1);
    if (it.kind === 'food') mask |= (1 << 2);
    if (it.kind === 'wand') mask |= (1 << 5) | (1 << 3);
    if (it.kind === 'tool') mask |= (1 << 6) | (1 << 4);
    if (it.kind === 'tome') mask |= (1 << 1) | (1 << 15) | (1 << 17);
    return mask;
}

class NetHackEngine {
    constructor(opts) {
        this.saveDir = opts.saveDir;
        this.user = opts.user;
        this.saveFile = path.join(this.saveDir, this.user);
        this.seq = 0;
        this.seed = (crypto.randomBytes(4).readUInt32LE(0) || ((Date.now() ^ 0x5f3759df) >>> 0)) >>> 0;
        this.state = null;
        this._lastLivingSnapshot = null;
        if (!opts.isNew && !opts.randomBirth && this.loadSave()) {
            // Loaded existing character
            if (this.state && this.state.player && !this.state.player.dead) {
                this._lastLivingSnapshot = JSON.stringify(this.state);
            }
        } else if (opts.randomBirth) {
            const roleIdx = this.rand(ROLES.length);
            this.initNewState(false, roleIdx);
            this.applyStartingOptimization('optimal', 'signature');
            this.state.phase = 'play';
            if (this.state && this.state.player && !this.state.player.dead) {
                this._lastLivingSnapshot = JSON.stringify(this.state);
            }
            this.saveGame();
        } else {
            this.initNewState(false, 0);
            if (this.state && this.state.player && !this.state.player.dead) {
                this._lastLivingSnapshot = JSON.stringify(this.state);
            }
        }
    }

    rand(max) {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed % Math.max(1, max);
    }

    shuffleArray(arr) {
        const copy = arr.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = this.rand(i + 1);
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    getExpNextForLevel(lev) {
        // Authentic NetHack 3.6.7 exper.c:newuexp(lev) threshold to advance from lev to lev + 1 (max XL 30)
        const l = Math.max(1, Number(lev || 1));
        if (l >= 30) return 0;
        if (l < 10) return 10 * (1 << l);
        if (l < 20) return 10000 * (1 << (l - 10));
        return 10000000 * (l - 19);
    }

    checkExperience(opts = {}) {
        const p = this.state && this.state.player;
        if (!p) return;
        if (!p.level || p.level < 1) p.level = 1;
        if (p.level > 30) p.level = 30;
        p.exp = Math.max(0, Number(p.exp || 0));
        p.maxExp = Math.max(Number(p.maxExp || 0), p.exp);
        p.maxLevel = Math.max(Number(p.maxLevel || 1), p.level);
        p.expNext = this.getExpNextForLevel(p.level);

        let leveledUp = false;
        while (p.level < 30 && p.expNext > 0 && p.exp >= p.expNext) {
            p.level++;
            leveledUp = true;
            if (p.level > p.maxLevel) p.maxLevel = p.level;
            p.expNext = this.getExpNextForLevel(p.level);
            if (!opts.silent) {
                const hpGain = 6 + this.rand(5);
                const pwGain = 2 + this.rand(3);
                p.hpMax += hpGain;
                p.hp = p.hpMax;
                p.pwMax += pwGain;
                p.pw = p.pwMax;
                this.addMessage(`Welcome to experience level ${p.level}! (+${hpGain} HP, +${pwGain} Pw)`, 14);
            }
        }
        if (leveledUp && !p.dead) {
            this._lastLivingSnapshot = JSON.stringify(this.state);
        }
    }

    initNewState(quickStart = false, roleIdx = 0) {
        const role = ROLES[roleIdx % ROLES.length] || ROLES[0];
        this.state = {
            phase: quickStart ? 'play' : 'setup',
            menuMode: 'none', // 'none' | 'inven' | 'equip' | 'verb' | 'direction' | 'confirm-pray'
            pendingVerb: '',
            pendingPrompt: '',
            selectedRoleIdx: roleIdx,
            turn: 1,
            depth: 1,
            maxDepth: 1,
            branchName: 'Dungeons of Doom',
            player: {
                name: this.user.replace(/_[0-9]+$/, ''),
                race: role.race,
                class: role.id,
                align: role.align,
                deity: role.align === 'Lawful' ? 'Tyr' : (role.align === 'Neutral' ? 'Thoth' : 'Crom'),
                level: 1,
                maxLevel: 1,
                exp: 0,
                maxExp: 0,
                expNext: this.getExpNextForLevel(1),
                gold: 120 + this.rand(80),
                hp: role.hp,
                hpMax: role.hp,
                pw: role.pw,
                pwMax: role.pw,
                ac: 10 - (role.armor.ac + (role.armor.bonus || 0)),
                str: role.str,
                int: role.int,
                wis: role.wis,
                dex: role.dex,
                con: role.con,
                hunger: 900,
                poisoned: 0,
                confused: 0,
                blind: 0,
                telepathy: false,
                intrinsicTelepathy: false,
                rBlind: false,
                speedBoost: 0,
                hasAmulet: false,
                winner: false,
                dead: false,
                diedFrom: '',
                x: 10,
                y: 10,
                inventory: []
            },
            map: null,
            monsters: [],
            objects: [],
            messages: [
                { text: `Welcome to NetHack 3.6.7! You are a ${role.align} ${role.race} ${role.id}.`, count: 1, attr: 11 },
                { text: 'Your faithful little dog bounds alongside you into the Dungeons of Doom.', count: 1, attr: 1 }
            ],
            statFocus: 'optimal',
            kitBoon: 'signature',
            _optimizedApplied: false,
            weaponSkillLevel: 1,
            spellSkillLevel: 1
        };

        this.populateStartingKit(role);
        this.generateDungeonLevel(1);
        if (quickStart) {
            this.applyStartingOptimization('optimal', 'signature');
        }
    }

    applyStartingOptimization(statFocus = 'optimal', kitBoon = 'signature') {
        if (!this.state || !this.state.player) return;
        if (this.state._optimizedApplied && this.state.statFocus === statFocus && this.state.kitBoon === kitBoon) {
            return;
        }
        this.state.statFocus = statFocus || 'optimal';
        this.state.kitBoon = kitBoon || 'signature';
        this.state._optimizedApplied = true;
        const p = this.state.player;
        const clsLower = String(p.class || '').toLowerCase();
        if (statFocus === 'vanguard') {
            p.str += 2;
            p.con += 2;
            p.hpMax += 4;
            p.hp = p.hpMax;
        } else if (statFocus === 'arcane') {
            p.int += 2;
            p.wis += 2;
            p.pwMax += 4;
            p.pw = p.pwMax;
        } else if (statFocus === 'agile') {
            p.dex += 3;
            p.ac -= 1;
        } else {
            if (clsLower.includes('wizard') || clsLower.includes('priest')) {
                p.int += 2;
                p.wis += 1;
                p.pwMax += 4;
                p.pw = p.pwMax;
            } else if (clsLower.includes('rogue') || clsLower.includes('ranger')) {
                p.dex += 2;
                p.str += 1;
                p.hpMax += 2;
                p.hp = p.hpMax;
            } else {
                p.str += 2;
                p.con += 1;
                p.hpMax += 3;
                p.hp = p.hpMax;
            }
        }
        const w = p.inventory.find(it => it.equipped === 'weapon');
        const a = p.inventory.find(it => it.equipped === 'armor');
        if (kitBoon === 'expedition') {
            const healPot = p.inventory.find(it => it.name && it.name.includes('potion of healing'));
            if (healPot) healPot.count = (healPot.count || 1) + 1;
            p.gold += 50;
        } else if (kitBoon === 'blessed') {
            if (w) { w.buc = 'blessed'; w.bonus = (w.bonus || 0) + 1; }
            if (a) { a.buc = 'blessed'; a.bonus = (a.bonus || 0) + 1; }
            this.recalcPlayerAc();
        } else {
            if (w) w.bonus = (w.bonus || 0) + 1;
        }
    }

    populateStartingKit(role) {
        const inv = [];
        const add = (spec, equipped = null) => {
            const idx = inv.length;
            inv.push(Object.assign({}, spec, {
                slot: idx,
                letter: SLOT_LETTERS[idx] || 'z',
                equipped: equipped,
                count: spec.count || 1
            }));
        };
        add(Object.assign({ kind: 'weapon' }, role.weapon), 'weapon');
        add(Object.assign({ kind: 'armor' }, role.armor), 'armor');
        if (role.extra) add(role.extra, null);
        add({ kind: 'potion', name: 'potion of healing', buc: 'blessed', count: 2, weight: 20, tval: 71, sval: 38, heal: 16 }, null);
        add({ kind: 'scroll', name: 'scroll of identify', buc: 'blessed', count: 2, weight: 5, tval: 70, sval: 12 }, null);
        add({ kind: 'scroll', name: 'scroll of teleportation', buc: 'uncursed', count: 1, weight: 5, tval: 70, sval: 4 }, null);
        add({ kind: 'wand', name: 'wand of striking', buc: 'uncursed', charges: 6, weight: 7, tval: 65, sval: 1, dmg: 14 }, null);
        add({ kind: 'tool', name: 'brass lantern', buc: 'blessed', weight: 30, tval: 39, sval: 1, fuel: 1500 }, null);
        add({ kind: 'food', name: 'food ration', buc: 'uncursed', count: 2, weight: 20, tval: 80, sval: 1, nutrition: 800 }, null);
        this.state.player.inventory = inv;
        this.recalcPlayerAc();
    }

    reindexInventory() {
        const inv = this.state.player.inventory.filter(it => (it.count == null ? 1 : it.count) > 0);
        inv.forEach((it, idx) => {
            it.slot = idx;
            it.letter = SLOT_LETTERS[idx] || 'z';
        });
        this.state.player.inventory = inv;
        this.recalcPlayerAc();
    }

    recalcPlayerAc() {
        let armorSum = 0;
        let weapName = '';
        let shieldName = '';
        let bowName = '';
        const armorSlots = new Set(['armor', 'body', 'cloak', 'shield', 'head', 'hands', 'feet']);
        for (const it of this.state.player.inventory) {
            if (!it.equipped) continue;
            const meta = resolveEquipMeta(it);
            if (armorSlots.has(it.equipped) || armorSlots.has(meta.slot_name)) {
                armorSum += (it.ac != null ? Number(it.ac) : 2) + (Number(it.bonus) || 0);
            }
            if (meta.slot_name === 'weapon') weapName = it.name;
            else if (meta.slot_name === 'shield') shieldName = it.name;
            else if (meta.slot_name === 'bow') bowName = it.name;
        }
        this.state.player.ac = 10 - armorSum;
        this.state.player.weaponName = weapName;
        this.state.player.shieldName = shieldName;
        this.state.player.bowName = bowName;
    }

    generateDungeonLevel(depth) {
        this.state.depth = depth;
        if (depth > this.state.maxDepth) this.state.maxDepth = depth;
        if (depth <= 3) this.state.branchName = 'Dungeons of Doom';
        else if (depth <= 6) this.state.branchName = 'The Gnomish Mines';
        else if (depth <= 9) this.state.branchName = 'The Oracle & Sokoban';
        else if (depth <= 14) this.state.branchName = 'The Castle & Valley';
        else if (depth < 20) this.state.branchName = 'Gehennom';
        else this.state.branchName = 'Sanctum of Moloch';

        const grid = [];
        for (let y = 0; y < MAP_H; y++) {
            const row = [];
            for (let x = 0; x < MAP_W; x++) {
                row.push({
                    feat: (y === 0 || y === MAP_H - 1 || x === 0 || x === MAP_W - 1) ? FEAT.PERM_WALL : FEAT.WALL,
                    glyph: '#',
                    attr: 1,
                    known: false,
                    inView: false,
                    roomLit: false
                });
            }
            grid.push(row);
        }

        const rooms = [];
        const cols = 4;
        const rows = 2;
        const cellW = Math.floor((MAP_W - 4) / cols);
        const cellH = Math.floor((MAP_H - 2) / rows);

        for (let ry = 0; ry < rows; ry++) {
            for (let rx = 0; rx < cols; rx++) {
                const rw = 6 + this.rand(Math.max(2, cellW - 8));
                const rh = 4 + this.rand(Math.max(2, cellH - 5));
                const x0 = 2 + rx * cellW + 1 + this.rand(Math.max(1, cellW - rw - 2));
                const y0 = 1 + ry * cellH + 1 + this.rand(Math.max(1, cellH - rh - 2));
                const lit = this.rand(100) < 75;
                rooms.push({ x0, y0, x1: x0 + rw - 1, y1: y0 + rh - 1, cx: Math.floor(x0 + rw / 2), cy: Math.floor(y0 + rh / 2), lit });
                for (let y = y0; y < y0 + rh; y++) {
                    for (let x = x0; x < x0 + rw; x++) {
                        if (y > 0 && y < MAP_H - 1 && x > 0 && x < MAP_W - 1) {
                            grid[y][x].feat = FEAT.FLOOR;
                            grid[y][x].glyph = '.';
                            grid[y][x].attr = lit ? 1 : 2;
                            grid[y][x].roomLit = lit;
                        }
                    }
                }
            }
        }

        // Carve corridors & doors between shuffled rooms and adjacent sectors for non-linear loops
        const carveNhCorridor = (a, b) => {
            let x = a.cx, y = a.cy;
            const horizFirst = this.rand(2) === 0;
            const stepX = () => {
                while (x !== b.cx) {
                    const prevFeat = grid[y][x].feat;
                    x += (b.cx > x) ? 1 : -1;
                    if (grid[y][x].feat === FEAT.WALL) {
                        const isDoorEdge = prevFeat === FEAT.FLOOR && !grid[y][x].roomLit && this.rand(100) < 35;
                        grid[y][x].feat = isDoorEdge ? FEAT.CLOSED_DOOR : FEAT.FLOOR;
                        grid[y][x].glyph = isDoorEdge ? '+' : '.';
                        grid[y][x].attr = isDoorEdge ? 3 : 2;
                    }
                }
            };
            const stepY = () => {
                while (y !== b.cy) {
                    y += (b.cy > y) ? 1 : -1;
                    if (grid[y][x].feat === FEAT.WALL) {
                        grid[y][x].feat = FEAT.FLOOR;
                        grid[y][x].glyph = '.';
                        grid[y][x].attr = 2;
                    }
                }
            };
            if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
        };

        const shuffledRooms = this.shuffleArray(rooms);
        for (let i = 0; i < shuffledRooms.length - 1; i++) {
            carveNhCorridor(shuffledRooms[i], shuffledRooms[i + 1]);
        }
        if (rooms.length >= 8) {
            carveNhCorridor(rooms[0], rooms[4]);
            carveNhCorridor(rooms[3], rooms[7]);
        }

        const startRoom = shuffledRooms[0];
        const endRoom = shuffledRooms[shuffledRooms.length - 1];
        const midRoom = shuffledRooms[1] || shuffledRooms[Math.floor(shuffledRooms.length / 2)];
        const altarRoom = shuffledRooms[2] || shuffledRooms[Math.min(shuffledRooms.length - 2, 2)];

        // Up & Down stairs
        grid[startRoom.cy][startRoom.cx].feat = FEAT.UP_STAIR;
        grid[startRoom.cy][startRoom.cx].glyph = '<';
        grid[startRoom.cy][startRoom.cx].attr = 1;

        grid[endRoom.cy][endRoom.cx].feat = FEAT.DOWN_STAIR;
        grid[endRoom.cy][endRoom.cx].glyph = '>';
        grid[endRoom.cy][endRoom.cx].attr = 1;

        // Magic Fountain in midRoom
        if (midRoom && (midRoom.cx + 1 < MAP_W - 2)) {
            grid[midRoom.cy][midRoom.cx + 1].feat = FEAT.FOUNTAIN;
            grid[midRoom.cy][midRoom.cx + 1].glyph = '{';
            grid[midRoom.cy][midRoom.cx + 1].attr = 11;
        }

        // High Altar in altarRoom
        if (altarRoom && (altarRoom.cx - 1 > 1)) {
            grid[altarRoom.cy][altarRoom.cx - 1].feat = FEAT.ALTAR;
            grid[altarRoom.cy][altarRoom.cx - 1].glyph = '_';
            grid[altarRoom.cy][altarRoom.cx - 1].attr = 14;
        }

        this.state.player.x = startRoom.cx;
        this.state.player.y = startRoom.cy;
        this.state.map = grid;
        this.sanitizeDoorPlacement();

        // Spawn faithful pet companion + monsters
        this.state.monsters = [];
        let nextMonId = 1;
        const petX = Math.min(MAP_W - 2, startRoom.cx + 1);
        const petY = startRoom.cy;
        const ps = this.state.petState;
        const petAlive = ps ? Boolean(ps.alive) : true;
        if (petAlive && grid[petY][petX].feat === FEAT.FLOOR) {
            const pGlyph = ps ? (ps.glyph || 'd') : 'd';
            const pName = ps ? (ps.name || 'little dog (tame)') : 'little dog (tame)';
            const pLevel = ps ? (ps.level || Math.max(1, depth)) : Math.max(1, depth);
            const pHp = ps ? ps.hp : (16 + depth * 2);
            const pMaxHp = ps ? ps.maxHp : (16 + depth * 2);
            const pTam = ps ? (ps.tam !== false) : true;
            this.state.monsters.push({
                id: nextMonId++,
                x: petX,
                y: petY,
                glyph: pGlyph,
                attr: 1,
                race: pName,
                race_level: pLevel,
                hp: pHp,
                hp_max: pMaxHp,
                ac: 6,
                dmg: 5 + depth,
                speed: 120,
                exp: 0,
                isPet: true,
                peaceful: pTam,
                asleep: false
            });
            if (!ps) {
                this.state.petState = { alive: true, hp: pHp, maxHp: pMaxHp, level: pLevel, name: pName, glyph: pGlyph, tam: pTam };
            }
        }
        if (this.state && this.state.player && !this.state.player.dead) {
            this._lastLivingSnapshot = JSON.stringify(this.state);
        }

        const eligible = MONSTER_TABLE.filter(m => m.minDepth <= depth + 2 && (!m.isBoss || depth >= 10));
        for (let i = 1; i < shuffledRooms.length; i++) {
            const rm = shuffledRooms[i];
            const count = 1 + (this.rand(100) < 45 ? 1 : 0);
            for (let c = 0; c < count; c++) {
                const mx = rm.x0 + this.rand(Math.max(1, rm.x1 - rm.x0 + 1));
                const my = rm.y0 + this.rand(Math.max(1, rm.y1 - rm.y0 + 1));
                if ((mx === this.state.player.x && my === this.state.player.y) || this.state.monsters.some(m => m.x === mx && m.y === my)) continue;
                const tmpl = eligible[this.rand(eligible.length)] || MONSTER_TABLE[0];
                this.state.monsters.push({
                    id: nextMonId++,
                    x: mx,
                    y: my,
                    glyph: tmpl.glyph,
                    attr: tmpl.attr,
                    race: tmpl.name,
                    race_level: tmpl.minDepth,
                    hp: tmpl.hp + depth * 2,
                    hp_max: tmpl.hp + depth * 2,
                    ac: tmpl.ac != null ? tmpl.ac : 8,
                    dmg: tmpl.dmg + Math.floor(depth / 2),
                    speed: tmpl.speed || 110,
                    exp: tmpl.exp,
                    isBoss: Boolean(tmpl.isBoss),
                    asleep: this.rand(100) < 25
                });
            }
        }

        // Spawn floor items
        this.state.objects = [];
        for (let i = 0; i < rooms.length; i++) {
            const rm = rooms[i];
            if (this.rand(100) < 75) {
                const ox = rm.x0 + this.rand(Math.max(1, rm.x1 - rm.x0 + 1));
                const oy = rm.y0 + this.rand(Math.max(1, rm.y1 - rm.y0 + 1));
                const tmpl = ITEM_POOL[this.rand(ITEM_POOL.length)];
                this.state.objects.push(Object.assign({}, tmpl, {
                    x: ox,
                    y: oy,
                    count: 1
                }));
            }
        }

        this.updateVisibility();
    }

    sanitizeDoorPlacement() {
        const grid = this.state && this.state.map;
        if (!Array.isArray(grid)) return;
        const isWallCell = (cy, cx) => {
            const c = grid[cy] && grid[cy][cx];
            return Boolean(c && (c.feat === FEAT.WALL || c.feat === FEAT.PERM_WALL));
        };
        for (let y = 1; y < MAP_H - 1; y++) {
            for (let x = 1; x < MAP_W - 1; x++) {
                const cell = grid[y] && grid[y][x];
                if (!cell) continue;
                if (cell.feat === FEAT.CLOSED_DOOR || cell.feat === FEAT.OPEN_DOOR || cell.glyph === '+' || cell.glyph === "'") {
                    const wallN = isWallCell(y - 1, x);
                    const wallS = isWallCell(y + 1, x);
                    const wallW = isWallCell(y, x - 1);
                    const wallE = isWallCell(y, x + 1);
                    const framedNS = wallN && wallS && (!wallW || !wallE);
                    const framedEW = wallW && wallE && (!wallN || !wallS);
                    if (!framedNS && !framedEW) {
                        cell.feat = FEAT.FLOOR;
                        cell.glyph = '.';
                        cell.attr = cell.roomLit ? 1 : 2;
                    }
                }
            }
        }
    }

    hasLineOfSight(x0, y0, x1, y1) {
        let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        let cx = x0, cy = y0;
        while (true) {
            if (cx === x1 && cy === y1) return true;
            if (!(cx === x0 && cy === y0)) {
                const cell = this.state.map[cy] && this.state.map[cy][cx];
                if (!cell || cell.feat === FEAT.WALL || cell.feat === FEAT.PERM_WALL || cell.feat === FEAT.CLOSED_DOOR) {
                    return false;
                }
            }
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; cx += sx; }
            if (e2 <= dx) { err += dx; cy += sy; }
        }
    }

    updateVisibility() {
        const p = this.state.player;
        const px = p.x;
        const py = p.y;
        const isBlind = (p.blind || 0) > 0;
        const grid = this.state.map;
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const cell = grid[y][x];
                cell.inView = false;
                if (isBlind) {
                    if (x === px && y === py) {
                        cell.inView = true;
                        cell.known = true;
                    }
                    continue;
                }
                const dx = Math.abs(x - px);
                const dy = Math.abs(y - py);
                const distSq = dx * dx + dy * dy;
                if ((dx <= 1 && dy <= 1) || (distSq <= 100 && this.hasLineOfSight(px, py, x, y))) {
                    cell.inView = true;
                    cell.known = true;
                }
            }
        }
    }

    addMessage(text, attr = 1) {
        if (!text) return;
        const msgs = this.state.messages;
        const last = msgs[msgs.length - 1];
        if (last && last.text === text) {
            last.count = (last.count || 1) + 1;
        } else {
            msgs.push({ text, count: 1, attr });
            if (msgs.length > 40) msgs.shift();
        }
    }

    saveGame() {
        try {
            if (!this.state || !this.state.player || this.state.player.dead) return false;
            this._lastLivingSnapshot = JSON.stringify(this.state);
            if (!fs.existsSync(this.saveDir)) fs.mkdirSync(this.saveDir, { recursive: true });
            const p = this.state.player;
            const desc = `${p.class} (${p.race}), Dlvl ${this.state.depth}, ${p.hp}/${p.hpMax} HP`;
            const descBuf = Buffer.from(desc + '\0', 'utf8');
            const header = Buffer.alloc(36, 0);
            header.write('SaveNHCK', 0, 8, 'ascii');
            header.write('description', 8, 11, 'ascii');
            header.writeUInt32LE(1, 24);
            header.writeUInt32LE(descBuf.length, 28);
            header.writeUInt32LE(0, 32);
            const payload = Buffer.from(JSON.stringify(this.state), 'utf8');
            const full = Buffer.concat([header, descBuf, payload]);
            fs.writeFileSync(this.saveFile, full);
            fs.writeFileSync(this.saveFile + '.living.sav', full);
            const sidecar = { realm: 'nethack', characterName: p.name, level: p.level, depth: this.state.depth, race: p.race, class: p.class, updatedAt: Date.now() };
            fs.writeFileSync(this.saveFile + '.realm.json', JSON.stringify(sidecar));
            return true;
        } catch (_) {
            return false;
        }
    }

    restoreLivingCheckpoint() {
        try {
            let loaded = null;
            if (fs.existsSync(this.saveFile + '.living.sav')) {
                const buf = fs.readFileSync(this.saveFile + '.living.sav');
                if (buf.length >= 36 && buf.toString('ascii', 0, 8) === 'SaveNHCK') {
                    const descSize = buf.readUInt32LE(28);
                    const jsonStr = buf.toString('utf8', 36 + descSize);
                    loaded = JSON.parse(jsonStr);
                }
            }
            if ((!loaded || !loaded.player || loaded.player.dead) && this._lastLivingSnapshot) {
                try {
                    loaded = JSON.parse(this._lastLivingSnapshot);
                } catch (_) {}
            }
            if (loaded && loaded.player && !loaded.player.dead) {
                this.state = loaded;
                this.state.phase = 'play';
                this.state.menuMode = 'none';
                this.state.player.dead = false;
                this.state.player.diedFrom = '';
                if (this.state.player.hp <= 0) {
                    this.state.player.hp = Math.max(1, Math.floor(this.state.player.hpMax / 2));
                }
                this.sanitizeDoorPlacement();
                this.checkExperience({ silent: true });
                this.updateVisibility();
                this.addMessage('You are restored to your last living checkpoint!', 14);
                this.saveGame();
                return true;
            }
        } catch (_) {}
        this.initNewState(true, this.state.selectedRoleIdx || 0);
        return false;
    }

    loadSave() {
        try {
            let targetFile = this.saveFile;
            if (!fs.existsSync(targetFile) && fs.existsSync(this.saveFile + '.living.sav')) {
                targetFile = this.saveFile + '.living.sav';
            }
            if (!fs.existsSync(targetFile)) return false;
            const buf = fs.readFileSync(targetFile);
            if (buf.length < 36) return false;
            const magic = buf.toString('ascii', 0, 8);
            if (magic !== 'SaveNHCK') return false;
            const descSize = buf.readUInt32LE(28);
            const jsonStr = buf.toString('utf8', 36 + descSize);
            let loaded = JSON.parse(jsonStr);
            if ((!loaded || !loaded.player || loaded.player.dead) && fs.existsSync(this.saveFile + '.living.sav')) {
                const lBuf = fs.readFileSync(this.saveFile + '.living.sav');
                const lDesc = lBuf.readUInt32LE(28);
                loaded = JSON.parse(lBuf.toString('utf8', 36 + lDesc));
                if (loaded && loaded.player && !loaded.player.dead) {
                    fs.copyFileSync(this.saveFile + '.living.sav', this.saveFile);
                }
            }
            if (loaded && loaded.player && loaded.map && !loaded.player.dead) {
                this.state = loaded;
                this.state.phase = 'play';
                this.state.menuMode = 'none';
                // Normalize any legacy feature codes in saved maps to canonical 3D feature codes
                for (let y = 0; y < this.state.map.length; y++) {
                    const row = this.state.map[y];
                    if (!Array.isArray(row)) continue;
                    for (let x = 0; x < row.length; x++) {
                        const cell = row[x];
                        if (!cell) continue;
                        if (cell.glyph === '_') cell.feat = FEAT.ALTAR;
                        else if (cell.glyph === '{') cell.feat = FEAT.FOUNTAIN;
                        else if (cell.glyph === '+') cell.feat = FEAT.CLOSED_DOOR;
                        else if (cell.glyph === "'") cell.feat = FEAT.OPEN_DOOR;
                        else if (cell.glyph === '<') cell.feat = FEAT.UP_STAIR;
                        else if (cell.glyph === '>') cell.feat = FEAT.DOWN_STAIR;
                    }
                }
                this.sanitizeDoorPlacement();
                this.checkExperience({ silent: true });
                this.updateVisibility();
                return true;
            }
        } catch (_) {}
        return false;
    }

    handleKey(rawKey) {
        const k = String(rawKey || '').trim();
        if (!k) return;

        // 1. Setup / Birth screen
        // # ROOT-CAUSE: NetHack setup needed post-randomization stat focus & kit boon controls and #enhance weapon/spell skill advancement
        if (this.state.phase === 'setup') {
            const lower = k.toLowerCase();
            if (lower === '*') {
                const randIdx = this.rand(ROLES.length);
                this.initNewState(true, randIdx);
                this.applyStartingOptimization('optimal', 'signature');
                this.saveGame();
                return;
            }
            if (lower === '1' || lower === 'f') {
                const focuses = ['optimal', 'vanguard', 'arcane', 'agile'];
                const cur = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                const nextFocus = focuses[(focuses.indexOf(cur) + 1) % focuses.length];
                this.initNewState(false, this.state.selectedRoleIdx || 0);
                this.applyStartingOptimization(nextFocus, kb);
                return;
            }
            if (lower === '2' || lower === 'b') {
                const boons = ['signature', 'expedition', 'blessed'];
                const sf = this.state.statFocus || 'optimal';
                const cur = this.state.kitBoon || 'signature';
                const nextBoon = boons[(boons.indexOf(cur) + 1) % boons.length];
                this.initNewState(false, this.state.selectedRoleIdx || 0);
                this.applyStartingOptimization(sf, nextBoon);
                return;
            }
            if (lower === 'enter' || lower === 'return' || lower === 'space' || lower === 'y') {
                this.applyStartingOptimization(this.state.statFocus || 'optimal', this.state.kitBoon || 'signature');
                this.state.phase = 'play';
                this.saveGame();
                return;
            }
            const roleIdx = ROLES.findIndex(r => r.key === lower);
            if (roleIdx >= 0) {
                const sf = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                this.initNewState(true, roleIdx);
                this.applyStartingOptimization(sf, kb);
                this.saveGame();
                return;
            }
            if (lower === 'down' || lower === 'arrowdown' || lower === 'j') {
                const next = (this.state.selectedRoleIdx + 1) % ROLES.length;
                const sf = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                this.initNewState(false, next);
                this.applyStartingOptimization(sf, kb);
                return;
            }
            if (lower === 'up' || lower === 'arrowup' || lower === 'k') {
                const prev = (this.state.selectedRoleIdx - 1 + ROLES.length) % ROLES.length;
                const sf = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                this.initNewState(false, prev);
                this.applyStartingOptimization(sf, kb);
                return;
            }
            this.applyStartingOptimization(this.state.statFocus || 'optimal', this.state.kitBoon || 'signature');
            this.state.phase = 'play';
            this.saveGame();
            return;
        }

        if (this.state.player.dead) {
            const lk = k.toLowerCase();
            if (lk === 'r') {
                this.restoreLivingCheckpoint();
            } else if (lk === 'n' || lk === 'enter') {
                this.initNewState(true, this.state.selectedRoleIdx || 0);
            }
            return;
        }

        // 2. Extended `#` Commands (`#pray`, `#dip`, `#offer`, `#loot`, `#untrap`, `#chat`, `#force`, `#enhance`)
        if (k === '#') {
            this.state.menuMode = 'extended';
            this.state.pendingPrompt = '# Extended command: [p]ray [d]ip [o]ffer [l]oot [u]ntrap [c]hat [f]orce [e]nhance (ESC)';
            return;
        }
        if (k.startsWith('#')) {
            this.state.menuMode = 'none';
            this.state.pendingVerb = '';
            this.state.pendingPrompt = '';
            this.executeExtendedCommand(k.toLowerCase().replace(/\s+/g, ''));
            return;
        }

        // 3. Active Menu / Sub-Prompt Modes
        if (this.state.menuMode !== 'none') {
            if (k.toLowerCase() === 'escape' || k.toLowerCase() === 'esc' || (k === ' ' && (this.state.menuMode === 'char' || this.state.menuMode === 'help' || this.state.menuMode === 'knowledge'))) {
                this.state.menuMode = 'none';
                this.state.pendingVerb = '';
                this.state.pendingPrompt = '';
                this.state.selectedItem = null;
                return;
            }
            if (this.state.menuMode === 'extended') {
                const extMap = { p: '#pray', d: '#dip', o: '#offer', l: '#loot', u: '#untrap', c: '#chat', f: '#force', e: '#enhance' };
                const mapped = extMap[k.toLowerCase()];
                this.state.menuMode = 'none';
                this.state.pendingPrompt = '';
                if (mapped) this.executeExtendedCommand(mapped);
                return;
            }
            if (this.state.menuMode === 'item_action') {
                const item = this.state.selectedItem;
                this.state.menuMode = 'none';
                this.state.selectedItem = null;
                this.state.pendingPrompt = '';
                if (!item) return;
                if (k === 'd') { this.executeItemVerb('d', item.letter); return; }
                if (k === 't' || k === 'f') {
                    this.state.menuMode = 'direction';
                    this.state.pendingVerb = 'throw';
                    this.state.pendingPrompt = 'In what direction do you want to throw/fire?';
                    return;
                }
                if (k === 'x' || k === 'I' || k === ';' || k === ':') {
                    this.addMessage(`${item.letter}) ${formatItemDesc(item)} [${item.buc || 'uncursed'}].`, 11);
                    return;
                }
                if (k === '{' || k === '}') { this.executeItemVerb(k, item.letter); return; }
                if (k === 'T' || k === 'R') { this.executeItemVerb(k, item.letter); return; }
                const verb = item.kind === 'potion' ? 'q'
                    : (item.kind === 'scroll' ? 'r'
                    : (item.kind === 'food' ? 'e'
                    : (item.kind === 'wand' ? 'z'
                    : (item.kind === 'armor' ? (item.equipped ? 'T' : 'W')
                    : (item.kind === 'jewelry' ? (item.equipped ? 'R' : 'P')
                    : ((item.kind === 'weapon' || item.kind === 'ranged') ? 'w' : 'a'))))));
                this.executeItemVerb(verb, item.letter);
                return;
            }
            if (this.state.menuMode === 'inven' || this.state.menuMode === 'equip') {
                if (k === '/' || k === '|') {
                    this.state.menuMode = this.state.menuMode === 'inven' ? 'equip' : 'inven';
                    return;
                }
                if (k === 'i') { this.state.menuMode = 'inven'; return; }
                if (k === 'e' && this.state.menuMode === 'inven') {
                    this.openVerbPrompt('E');
                    return;
                }
                // Uppercase, brace, or colon verbs switch directly to verb prompt
                if (/^[WTPREZI:{}]$/.test(k)) {
                    this.openVerbPrompt(k);
                    return;
                }
                const item = this.state.player.inventory.find(it => it.letter === k);
                if (item) {
                    // When 'e' opened equip/eat mode and the player selects a food item slot (e.g. Grimoire Eat ['escape','e',slotKey]), consume it immediately!
                    if (this.state.menuMode === 'equip' && item.kind === 'food') {
                        this.executeItemVerb('e', k);
                        return;
                    }
                    this.state.selectedItem = item;
                    this.state.menuMode = 'item_action';
                    this.state.pendingPrompt = `${item.letter}) ${formatItemDesc(item)} — [Enter] Use/Equip [d]rop [t]hrow [:]Examine (ESC)`;
                    return;
                }
                if (/^[qrwzdatf]$/.test(k)) {
                    this.openVerbPrompt(k);
                    return;
                }
                this.state.menuMode = 'none';
                return;
            }
            if (this.state.menuMode === 'spell') {
                this.executeSpellCast(k);
                return;
            }
            if (this.state.menuMode === 'verb') {
                this.executeItemVerb(this.state.pendingVerb, k);
                return;
            }
            if (this.state.menuMode === 'direction') {
                const dir = this.parseDirection(k);
                if (dir) {
                    this.executeDirectedAction(this.state.pendingVerb, dir.dx, dir.dy);
                } else {
                    this.addMessage('Never mind.', 1);
                }
                this.state.menuMode = 'none';
                this.state.pendingVerb = '';
                this.state.pendingPrompt = '';
                return;
            }
            this.state.menuMode = 'none';
            this.state.pendingPrompt = '';
            return;
        }

        // 4. Top-level Dungeon Commands
        if (k === 'i') {
            this.state.menuMode = 'inven';
            return;
        }
        if (k === 'e') {
            this.state.menuMode = 'equip';
            return;
        }
        if (k === 'p') {
            this.executeExtendedCommand('#pray');
            return;
        }
        if (k === 'Z' || k === '+') {
            this.state.menuMode = 'spell';
            this.state.pendingPrompt = 'Cast which spell? [a] force bolt [b] healing [c] magic mapping [d] haste self [e] cure ailment (ESC)';
            return;
        }
        if (/^[qrwWTPRzdatIE:{}]$/.test(k)) {
            this.openVerbPrompt(k);
            return;
        }
        if (k === 'x') {
            const p = this.state.player;
            const weapons = p.inventory.filter(it => it.kind === 'weapon' || it.kind === 'ranged');
            if (weapons.length > 1) {
                const curIdx = weapons.findIndex(it => it.equipped === 'weapon');
                weapons.forEach(it => { it.equipped = null; });
                const nextW = weapons[(curIdx + 1) % weapons.length];
                nextW.equipped = 'weapon';
                this.recalcPlayerAc();
                this.addMessage(`You swap weapons and now wield ${formatItemDesc(nextW)}.`, 11);
            } else {
                this.addMessage('You have no secondary weapon to swap to.', 1);
            }
            return;
        }
        if (k === 'v' || k === 'f' || k === 'Q') {
            this.state.menuMode = 'direction';
            this.state.pendingVerb = 'throw';
            this.state.pendingPrompt = 'In what direction do you want to throw/fire?';
            return;
        }
        if (k === 'o' || k === 'c' || k === 'D' || k === 'u') {
            this.state.menuMode = 'direction';
            this.state.pendingVerb = (k === 'D' || k === 'u') ? 'untrap' : k;
            this.state.pendingPrompt = 'In what direction?';
            return;
        }
        if (k === ';' || k === '/') {
            const visibleMons = this.state.monsters.filter(m => this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            const listStr = visibleMons.length > 0
                ? visibleMons.map(m => `${m.race} [${m.glyph}] (${m.hp}/${m.hp_max} HP)`).join(', ')
                : 'no creatures in immediate view';
            this.addMessage(`You survey the ${this.state.branchName} (Dlvl ${this.state.depth}): ${listStr}.`, 11);
            return;
        }
        if (k === 'C' || k === '@') {
            this.state.menuMode = 'char';
            this.state.pendingPrompt = 'Character Sheet (Press ESC or Space to return)';
            return;
        }
        if (k === '\\' || k === '~') {
            this.state.menuMode = 'knowledge';
            this.state.pendingPrompt = 'Discovered Lore & Knowledge (Press ESC or Space to return)';
            return;
        }
        if (k === '?' || k === 'O' || k === '=') {
            this.state.menuMode = 'help';
            this.state.pendingPrompt = 'NetHack Commands & Options (Press ESC or Space to return)';
            return;
        }
        if (k === 'S' || k === 'C-s') {
            this.saveGame();
            this.addMessage('Game state saved to the Dungeons of Doom chronicles.', 14);
            return;
        }
        if (k === ',' || k === 'g') {
            this.pickupFloorItem();
            return;
        }
        if (k === '<') {
            const cell = this.state.map[this.state.player.y][this.state.player.x];
            if (cell.feat === FEAT.UP_STAIR) {
                if (this.state.depth <= 1) {
                    if (this.state.player.hasAmulet) {
                        this.state.player.winner = true;
                        this.addMessage('You ascend to the High Altar with the Amulet of Yendor! Demigodhood is yours!', 14);
                    } else {
                        this.addMessage('A mysterious force prevents you from leaving without the Amulet of Yendor.', 11);
                    }
                } else {
                    const pet = this.state.monsters.find(m => m.isPet);
                    if (pet) {
                        this.state.petState = {
                            alive: pet.hp > 0,
                            hp: pet.hp,
                            maxHp: pet.hp_max,
                            level: pet.race_level || 1,
                            name: pet.race,
                            glyph: pet.glyph,
                            tam: pet.peaceful !== false
                        };
                    }
                    this.generateDungeonLevel(this.state.depth - 1);
                    this.addMessage(`You climb up the stairs to Dlvl ${this.state.depth} (${this.state.branchName}).`, 11);
                    this.saveGame();
                }
            } else {
                this.addMessage('There are no stairs up here.', 1);
            }
            return;
        }
        if (k === '>') {
            const cell = this.state.map[this.state.player.y][this.state.player.x];
            if (cell.feat === FEAT.DOWN_STAIR) {
                const pet = this.state.monsters.find(m => m.isPet);
                if (pet) {
                    this.state.petState = {
                        alive: pet.hp > 0,
                        hp: pet.hp,
                        maxHp: pet.hp_max,
                        level: pet.race_level || 1,
                        name: pet.race,
                        glyph: pet.glyph,
                        tam: pet.peaceful !== false
                    };
                }
                this.generateDungeonLevel(this.state.depth + 1);
                this.addMessage(`You descend the stairs to Dlvl ${this.state.depth} (${this.state.branchName}).`, 11);
                this.saveGame();
            } else {
                this.addMessage('There are no stairs down here.', 1);
            }
            return;
        }
        if (k === 's' || k === '.' || k.toLowerCase() === 'space') {
            this.searchAround();
            this.advanceWorldTurn();
            return;
        }

        const moveDir = this.parseDirection(k);
        if (moveDir) {
            this.movePlayer(moveDir.dx, moveDir.dy);
        }
    }

    parseDirection(k) {
        const lower = String(k || '').toLowerCase();
        const map = {
            'up': { dx: 0, dy: -1 }, 'arrowup': { dx: 0, dy: -1 }, 'k': { dx: 0, dy: -1 }, '8': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 }, 'arrowdown': { dx: 0, dy: 1 }, 'j': { dx: 0, dy: 1 }, '2': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 }, 'arrowleft': { dx: -1, dy: 0 }, 'h': { dx: -1, dy: 0 }, '4': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }, 'arrowright': { dx: 1, dy: 0 }, 'l': { dx: 1, dy: 0 }, '6': { dx: 1, dy: 0 },
            'y': { dx: -1, dy: -1 }, '7': { dx: -1, dy: -1 }, 'home': { dx: -1, dy: -1 },
            'u': { dx: 1, dy: -1 }, '9': { dx: 1, dy: -1 }, 'pageup': { dx: 1, dy: -1 },
            'b': { dx: -1, dy: 1 }, '1': { dx: -1, dy: 1 }, 'end': { dx: -1, dy: 1 },
            'n': { dx: 1, dy: 1 }, '3': { dx: 1, dy: 1 }, 'pagedown': { dx: 1, dy: 1 }
        };
        if (map[lower]) return map[lower];
        if (lower === '*' || lower === '5' || lower === 't' || lower === 'f' || lower === '.') {
            const p = this.state.player;
            const hostiles = this.state.monsters
                .filter(m => !m.isPet && !m.peaceful && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView)
                .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
            if (hostiles.length > 0) {
                return { dx: Math.sign(hostiles[0].x - p.x) || 1, dy: Math.sign(hostiles[0].y - p.y) || 0, targetMon: hostiles[0] };
            }
            return { dx: 1, dy: 0 };
        }
        return null;
    }

    openVerbPrompt(verb, skipFountain = false) {
        const p = this.state.player;
        const cell = this.state.map && this.state.map[p.y] && this.state.map[p.y][p.x];
        const onFountain = !skipFountain && Boolean(cell && (cell.feat === FEAT.FOUNTAIN || cell.glyph === '{'));
        const prompts = {
            'q': onFountain
                ? 'Drink from the fountain? [y/n] (or select potion [a-z])'
                : 'What do you want to drink? [a-z or ?*]',
            'r': 'What do you want to read? [a-z or ?*]',
            'e': 'What do you want to eat? [a-z or ?*]',
            'E': 'What do you want to eat? [a-z or ?*]',
            'w': 'What do you want to wield? [a-z or ?*]',
            'W': 'What do you want to wear? [a-z or ?*]',
            'T': 'What do you want to take off? [a-z or ?*]',
            'P': 'What do you want to put on? [a-z or ?*]',
            'R': 'What do you want to remove? [a-z or ?*]',
            'z': 'What do you want to zap? [a-z or ?*]',
            'a': 'What do you want to apply? [a-z or ?*]',
            't': 'What do you want to throw? [a-z or ?*]',
            'd': 'What do you want to drop? [a-z or ?*]',
            '{': 'What do you want to inscribe? [a-z or ?*]',
            '}': 'What do you want to uninscribe? [a-z or ?*]',
            ':': 'What do you want to examine? [a-z or ?*]',
            'I': 'What do you want to examine? [a-z or ?*]',
            'x': 'What do you want to examine? [a-z or ?*]',
            'Z': 'Cast which spell? [a] force bolt [b] healing [c] magic mapping [d] haste self [e] cure ailment'
        };
        this.state.menuMode = verb === 'Z' ? 'spell' : 'verb';
        this.state.pendingVerb = verb;
        this.state.pendingPrompt = prompts[verb] || 'Select an item: [a-z]';
        this.state.fountainPromptActive = Boolean(verb === 'q' && onFountain);
    }

    executeSpellCast(spellKey) {
        const p = this.state.player;
        const sk = String(spellKey || '').toLowerCase();
        this.state.menuMode = 'none';
        this.state.pendingVerb = '';
        this.state.pendingPrompt = '';

        if (sk === 'a' || sk === '1') {
            if (p.pw < 2) { this.addMessage('You do not have enough magical energy (2 Pw required).', 4); return; }
            p.pw -= 2;
            this.state.menuMode = 'direction';
            this.state.pendingVerb = 'spell:force_bolt';
            this.state.pendingPrompt = 'In what direction do you cast force bolt?';
            return;
        }
        if (sk === 'b' || sk === '2') {
            if (p.pw < 2) { this.addMessage('You do not have enough magical energy (2 Pw required).', 4); return; }
            p.pw -= 2;
            const heal = 14 + p.level * 2;
            p.hp = Math.min(p.hpMax, p.hp + heal);
            if (p.blind > 0) { p.blind = 0; this.updateVisibility(); }
            this.addMessage(`A warm sapphire glow knitting your wounds restores +${heal} HP!`, 10);
            this.advanceWorldTurn();
            return;
        }
        if (sk === 'c' || sk === '3') {
            if (p.pw < 3) { this.addMessage('You do not have enough magical energy (3 Pw required).', 4); return; }
            p.pw -= 3;
            for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) this.state.map[y][x].known = true;
            this.addMessage('Arcane sigils trace the entire dungeon layout in your mind!', 11);
            this.advanceWorldTurn();
            return;
        }
        if (sk === 'd' || sk === '4') {
            if (p.pw < 3) { this.addMessage('You do not have enough magical energy (3 Pw required).', 4); return; }
            p.pw -= 3;
            p.speedBoost = 35;
            this.addMessage('Your limbs hum with arcane velocity! (+Fast)', 10);
            this.advanceWorldTurn();
            return;
        }
        if (sk === 'e' || sk === '5') {
            if (p.pw < 2) { this.addMessage('You do not have enough magical energy (2 Pw required).', 4); return; }
            p.pw -= 2;
            const wasBlind = p.blind > 0;
            p.poisoned = 0; p.confused = 0; p.blind = 0;
            if (wasBlind) this.updateVisibility();
            this.addMessage('Pure astral light purges all poison and confusion from your body!', 14);
            this.advanceWorldTurn();
            return;
        }
        // Fallback: if cast from Grimoire on a tome/scroll slot, read that slot
        const item = p.inventory.find(it => it.letter === spellKey);
        if (item && (item.kind === 'tome' || item.kind === 'scroll')) {
            this.executeItemVerb('r', spellKey);
            return;
        }
        this.addMessage('You abort the incantation.', 1);
    }

    executeItemVerb(verb, slotKey) {
        const p = this.state.player;
        const item = p.inventory.find(it => it.letter === slotKey);
        const wasFountainPrompt = Boolean(this.state.fountainPromptActive);
        this.state.menuMode = 'none';
        this.state.pendingVerb = '';
        this.state.pendingPrompt = '';
        this.state.fountainPromptActive = false;

        const cell = this.state.map && this.state.map[p.y] && this.state.map[p.y][p.x];
        const onFountain = Boolean(cell && (cell.feat === FEAT.FOUNTAIN || cell.glyph === '{'));
        if (verb === 'q' && onFountain) {
            const sk = String(slotKey || '').toLowerCase();
            if (sk === 'y' || sk === 'f' || sk === '.' || sk === '{' || sk === 'q' || sk === 'enter' || sk === 'return') {
                const heal = 8 + p.level * 2;
                p.hp = Math.min(p.hpMax, p.hp + heal);
                p.pw = Math.min(p.pwMax, p.pw + 2);
                const wasBlind = p.blind > 0;
                p.poisoned = 0; p.confused = 0; p.blind = 0;
                if (wasBlind) this.updateVisibility();
                this.addMessage(`You drink from the sparkling magic fountain! The cool draught refreshes your spirit (+${heal} HP, +2 Pw)!`, 11);
                this.advanceWorldTurn();
                return;
            }
            if (sk === 'n' && (wasFountainPrompt || !item || item.kind !== 'potion')) {
                if (p.inventory.some(it => it.kind === 'potion')) {
                    this.openVerbPrompt('q', true);
                } else {
                    this.addMessage('Never mind.', 1);
                }
                return;
            }
            if (!item) {
                this.addMessage('Never mind.', 1);
                return;
            }
        }

        if (!item) {
            if (verb === 't' || verb === 'f') {
                const dir = this.parseDirection(slotKey);
                if (dir) {
                    this.executeDirectedAction('throw', dir.dx, dir.dy);
                    return;
                }
            }
            this.addMessage('You do not have that item.', 1);
            return;
        }

        if (verb === ':' || verb === 'I' || verb === 'x') {
            this.addMessage(`${item.letter}) ${formatItemDesc(item)} — Weight: ${(item.weight / 10).toFixed(1)} lb, Beatitude: ${(item.buc || 'uncursed').toUpperCase()}.`, 11);
            return;
        }

        if (verb === '{') {
            item.inscription = item.inscription || '!k';
            this.addMessage(`You engrave "${item.inscription}" upon ${formatItemDesc(item)}.`, 11);
            return;
        }

        if (verb === '}') {
            delete item.inscription;
            this.addMessage(`You rub out the inscription on ${formatItemDesc(item)}.`, 11);
            return;
        }

        if (verb === 't' || verb === 'f') {
            this.state.thrownItem = item;
            this.state.menuMode = 'direction';
            this.state.pendingVerb = 'throw';
            this.state.pendingPrompt = 'In what direction do you want to throw?';
            return;
        }

        if (verb === 'q') {
            if (item.kind !== 'potion') {
                this.addMessage('That is not something you can drink!', 1);
                return;
            }
            if (item.name.includes('blindness') || item.blindTurns) {
                if (!p.rBlind) {
                    p.blind = Math.max(p.blind || 0, (item.blindTurns || 20) + 1);
                    this.updateVisibility();
                    this.addMessage('Oh, bummer! Everything is dark! Help!', 6);
                } else {
                    this.addMessage('You have a strange feeling for a moment, then it passes.', 11);
                }
            } else if (item.name.includes('sickness') || item.buc === 'cursed') {
                p.poisoned = 5;
                this.addMessage('Ulch! That potion tasted foul!', 4);
            } else if (item.name.includes('gain level')) {
                const nextReq = this.getExpNextForLevel(p.level);
                if (nextReq > 0) {
                    p.exp = Math.max(p.exp, nextReq);
                    this.checkExperience();
                } else {
                    p.hpMax += 8;
                    p.hp = p.hpMax;
                    this.addMessage('You feel more experienced!', 14);
                }
            } else if (item.name.includes('speed')) {
                p.speedBoost = 30;
                this.addMessage('You suddenly seem to move much faster!', 10);
            } else {
                const heal = (item.heal || 15) * (item.buc === 'blessed' ? 1.5 : 1) | 0;
                const wasBlind = p.blind > 0;
                p.hp = Math.min(p.hpMax, p.hp + heal);
                p.poisoned = 0;
                p.blind = 0;
                p.confused = 0;
                if (wasBlind) this.updateVisibility();
                this.addMessage(`You quaff the ${item.buc} ${item.name}. You feel much better! (+${heal} HP)`, 10);
            }
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'r') {
            if (item.kind !== 'scroll' && item.kind !== 'tome') {
                this.addMessage('You cannot read that!', 1);
                return;
            }
            if (item.name.includes('identify')) {
                p.inventory.forEach(it => { if (!it.buc) it.buc = 'uncursed'; });
                this.addMessage('Your pack glows with amber light! All carried items are identified.', 14);
            } else if (item.name.includes('enchant weapon')) {
                const w = p.inventory.find(it => it.equipped === 'weapon');
                if (w) {
                    w.bonus = (w.bonus || 0) + (item.buc === 'blessed' ? 2 : 1);
                    w.buc = 'blessed';
                    this.addMessage(`Your ${w.name} glows blue for a moment!`, 11);
                } else {
                    this.addMessage('Your hands twitch.', 1);
                }
            } else if (item.name.includes('enchant armor')) {
                const a = p.inventory.find(it => it.equipped === 'armor');
                if (a) {
                    a.bonus = (a.bonus || 0) + (item.buc === 'blessed' ? 2 : 1);
                    a.buc = 'blessed';
                    this.recalcPlayerAc();
                    this.addMessage(`Your ${a.name} glows silver for a moment!`, 11);
                }
            } else if (item.name.includes('remove curse')) {
                p.inventory.forEach(it => { if (it.buc === 'cursed') it.buc = 'uncursed'; });
                this.addMessage('You feel like someone is helping you. All curses are lifted!', 14);
            } else if (item.name.includes('magic mapping')) {
                for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) this.state.map[y][x].known = true;
                this.addMessage('A map coalesces in your mind!', 11);
            } else if (item.name.includes('teleportation')) {
                this.teleportPlayer();
            }
            if (item.kind === 'scroll') {
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
            }
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'w') {
            const wSlot = resolveEquipMeta(item).slot_name === 'bow' ? 'bow' : 'weapon';
            p.inventory.forEach(it => { if (it.equipped === wSlot) it.equipped = null; });
            item.equipped = wSlot;
            this.recalcPlayerAc();
            this.addMessage(`You now wield ${formatItemDesc(item)}.`, 11);
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'W' || verb === 'P') {
            const meta = resolveEquipMeta(item);
            const slot = meta.slot_name === 'weapon' ? 'body' : meta.slot_name;
            p.inventory.forEach(it => {
                if (it.equipped === slot || (slot === 'body' && it.equipped === 'armor')) it.equipped = null;
            });
            item.equipped = slot;
            if (item.grantsTelepathy || /esp|telepathy/i.test(item.name || '')) {
                p.telepathy = true;
            }
            this.recalcPlayerAc();
            this.addMessage(`You wear ${formatItemDesc(item)}.`, 11);
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'T' || verb === 'R') {
            if (!item.equipped) {
                this.addMessage('You are not wearing that.', 1);
                return;
            }
            if (item.buc === 'cursed') {
                this.addMessage(`You cannot take off your cursed ${item.name}! It is welded to you.`, 4);
                return;
            }
            item.equipped = null;
            if (item.grantsTelepathy || /esp|telepathy/i.test(item.name || '')) {
                p.telepathy = Boolean(p.intrinsicTelepathy || p.inventory.some(it => it.equipped && (it.grantsTelepathy || /esp|telepathy/i.test(it.name || ''))));
            }
            this.recalcPlayerAc();
            this.addMessage(`You take off ${formatItemDesc(item)}.`, 1);
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'z') {
            if (item.kind !== 'wand') {
                this.addMessage('That is not a wand!', 1);
                return;
            }
            if ((item.charges || 0) <= 0) {
                this.addMessage('Nothing happens.', 1);
                return;
            }
            item.charges--;
            this.state.menuMode = 'direction';
            this.state.pendingVerb = `zap:${item.name}`;
            this.state.pendingPrompt = 'In what direction?';
            return;
        }

        if (verb === 'e' || verb === 'E') {
            if (item.kind !== 'food') {
                this.addMessage('That is not something you can eat!', 1);
                return;
            }
            p.hunger = Math.min(2000, (p.hunger || 900) + (item.nutrition || 800));
            const heal = item.buc === 'blessed' ? 8 : 4;
            p.hp = Math.min(p.hpMax, p.hp + heal);
            if (item.grantsTelepathy || /floating eye/i.test(item.name || '')) {
                p.intrinsicTelepathy = true;
                p.telepathy = true;
                this.addMessage('You feel a strange mental acuity! You gain intrinsic telepathy!', 11);
            } else {
                this.addMessage(`You finish eating the ${item.buc} ${item.name}. Delicious! (+${heal} HP)`, 10);
            }
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'a') {
            if (item.name.includes('pick-axe') || item.name.includes('mattock')) {
                this.state.menuMode = 'direction';
                this.state.pendingVerb = 'dig';
                this.state.pendingPrompt = 'In what direction do you want to dig?';
                return;
            }
            if (item.name.includes('unicorn horn')) {
                const wasBlind = p.blind > 0;
                p.poisoned = 0; p.confused = 0; p.blind = 0;
                if (wasBlind) this.updateVisibility();
                this.addMessage('You apply your unicorn horn. Your afflictions vanish!', 10);
            } else if (item.name.includes('lamp') || item.name.includes('lantern')) {
                this.addMessage(`Your ${item.name} shines brightly through the subterranean gloom.`, 14);
            } else {
                this.addMessage(`You apply ${formatItemDesc(item)}.`, 1);
            }
            this.advanceWorldTurn();
            return;
        }

        if (verb === 'd') {
            if (item.equipped && item.buc === 'cursed') {
                this.addMessage(`You cannot drop your cursed ${item.name}!`, 4);
                return;
            }
            item.equipped = null;
            this.state.objects.push(Object.assign({}, item, { x: p.x, y: p.y, count: 1 }));
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.addMessage(`You drop ${item.name}.`, 1);
            this.advanceWorldTurn();
            return;
        }
    }

    executeDirectedAction(pendingVerb, dx, dy) {
        const p = this.state.player;
        const tx = p.x + dx, ty = p.y + dy;
        const cell = this.state.map[ty] && this.state.map[ty][tx];
        if (pendingVerb === 'o') {
            if (cell && cell.feat === FEAT.CLOSED_DOOR) {
                cell.feat = FEAT.OPEN_DOOR;
                cell.glyph = "'";
                this.addMessage('The door opens.', 1);
                this.updateVisibility();
            } else {
                this.addMessage('You see no closed door there.', 1);
            }
            this.advanceWorldTurn();
            return;
        }
        if (pendingVerb === 'c') {
            if (cell && cell.feat === FEAT.OPEN_DOOR) {
                cell.feat = FEAT.CLOSED_DOOR;
                cell.glyph = '+';
                this.addMessage('The door closes.', 1);
                this.updateVisibility();
            } else {
                this.addMessage('You see no open door there.', 1);
            }
            this.advanceWorldTurn();
            return;
        }
        if (pendingVerb === 'dig') {
            if (cell && (cell.feat === FEAT.WALL || cell.feat === FEAT.CLOSED_DOOR)) {
                cell.feat = FEAT.FLOOR;
                cell.glyph = '.';
                cell.attr = 2;
                this.addMessage('You swing your pick-axe and shatter the dungeon rock!', 11);
                this.updateVisibility();
            } else {
                this.addMessage('You swing at empty air.', 1);
            }
            this.advanceWorldTurn();
            return;
        }
        if (pendingVerb === 'untrap') {
            if (cell && (cell.feat === FEAT.TRAP || cell.glyph === '^')) {
                cell.feat = FEAT.FLOOR;
                cell.glyph = '.';
                cell.attr = 1;
                this.addMessage('You disarm the trap and salvage a handful of iron spikes!', 10);
            } else {
                this.addMessage('You carefully inspect and disarm the adjacent flagstones.', 10);
            }
            this.advanceWorldTurn();
            return;
        }
        if (pendingVerb === 'throw' || pendingVerb === 'spell:force_bolt' || pendingVerb.startsWith('zap:')) {
            const isSpell = pendingVerb === 'spell:force_bolt';
            const isThrow = pendingVerb === 'throw';
            const thrown = isThrow ? this.state.thrownItem : null;
            if (isThrow) this.state.thrownItem = null;
            const wandName = pendingVerb.startsWith('zap:') ? pendingVerb.slice(4) : '';
            let rx = p.x, ry = p.y;
            let hitAny = false;
            for (let step = 1; step <= 8; step++) {
                rx += dx; ry += dy;
                const c = this.state.map[ry] && this.state.map[ry][rx];
                if (!c || c.feat === FEAT.WALL || c.feat === FEAT.PERM_WALL) break;
                const mon = this.state.monsters.find(m => m.x === rx && m.y === ry && !m.isPet);
                if (mon) {
                    hitAny = true;
                    mon.asleep = false;
                    if (wandName.includes('teleport')) {
                        mon.x = Math.max(2, Math.min(MAP_W - 3, mon.x + 12));
                        this.addMessage(`The ${mon.race} vanishes in a puff of smoke!`, 13);
                    } else {
                        const dmg = isThrow ? (8 + this.rand(8) + ((thrown && thrown.bonus) || 0)) : (16 + this.rand(12));
                        mon.hp -= dmg;
                        const projLabel = isSpell ? 'force bolt' : (isThrow ? ((thrown && thrown.name) || 'thrown missile') : 'bolt');
                        this.addMessage(`Your ${projLabel} strikes the ${mon.race} for ${dmg} damage!`, 14);
                        if (mon.hp <= 0) this.handleMonsterDefeat(mon);
                    }
                    break;
                }
            }
            if (!hitAny) {
                this.addMessage(isThrow ? `Your ${(thrown && thrown.name) || 'missile'} clatters harmlessly into the shadows.` : 'The bolt dissipates into the darkness.', 1);
            }
            if (thrown && (!thrown.equipped || thrown.kind !== 'weapon')) {
                thrown.count = (thrown.count || 1) - 1;
                this.reindexInventory();
            }
            this.advanceWorldTurn();
        }
    }

    executeExtendedCommand(cmd) {
        const p = this.state.player;
        const cell = this.state.map[p.y][p.x];
        if (cmd.includes('pray')) {
            const wasBlind = p.blind > 0;
            p.hp = p.hpMax;
            p.hunger = Math.max(p.hunger, 900);
            p.poisoned = 0; p.confused = 0; p.blind = 0;
            if (wasBlind) this.updateVisibility();
            if (cell.feat === FEAT.ALTAR) {
                p.inventory.forEach(it => { if (it.equipped) it.buc = 'blessed'; });
                this.addMessage(`A golden aura surrounds you on the high altar! ${p.deity} blesses your panoply and restores your strength!`, 14);
            } else {
                this.addMessage(`You feel that ${p.deity} is well-pleased. A warm golden glow surrounds you and restores your health!`, 14);
            }
            this.advanceWorldTurn();
            return;
        }
        if (cmd.includes('dip')) {
            const w = p.inventory.find(it => it.equipped === 'weapon') || p.inventory[0];
            if (cell.feat === FEAT.FOUNTAIN && w) {
                if (w.name.includes('long sword') && p.level >= 1) {
                    w.name = 'Excalibur';
                    w.dmg = '1d10';
                    w.bonus = 3;
                    w.buc = 'blessed';
                    this.recalcPlayerAc();
                    this.addMessage('From the murky depths, a hand reaches up to bless your blade! Your sword is now Excalibur!', 14);
                } else {
                    w.buc = 'blessed';
                    this.addMessage(`You dip your ${w.name} into the sparkling fountain. It glows with a soft amber light!`, 11);
                }
            } else {
                this.addMessage('There is no fountain here to dip into.', 1);
            }
            this.advanceWorldTurn();
            return;
        }
        if (cmd.includes('offer')) {
            if (cell.feat === FEAT.ALTAR) {
                p.hpMax += 4;
                p.hp = p.hpMax;
                this.addMessage(`Your sacrifice is consumed in a burst of divine light! ${p.deity} grants you enduring vitality!`, 14);
            } else {
                this.addMessage('You are not standing upon an altar.', 1);
            }
            this.advanceWorldTurn();
            return;
        }
        if (cmd.includes('loot')) {
            const chestIdx = this.state.objects.findIndex(o => o.x === p.x && o.y === p.y && /chest|box|sack|bag/i.test(o.name || ''));
            const g = 25 + this.rand(55);
            p.gold += g;
            if (chestIdx >= 0) {
                const chest = this.state.objects.splice(chestIdx, 1)[0];
                this.addMessage(`You unlock and loot the ${chest.name}, claiming ${g} zorkmids ($)!`, 14);
            } else {
                this.addMessage(`You carefully search the flagstones and uncover ${g} zorkmids ($).`, 14);
            }
            this.advanceWorldTurn();
            return;
        }
        if (cmd.includes('untrap')) {
            let disarmed = false;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const c = this.state.map[p.y + oy] && this.state.map[p.y + oy][p.x + ox];
                    if (c && (c.feat === FEAT.TRAP || c.glyph === '^')) {
                        c.feat = FEAT.FLOOR;
                        c.glyph = '.';
                        c.attr = 1;
                        disarmed = true;
                    }
                }
            }
            this.addMessage(disarmed ? 'You disarm the nearby dungeon trap!' : 'You check and disarm the surrounding stonework.', 10);
            this.advanceWorldTurn();
            return;
        }
        if (cmd.includes('chat')) {
            const pet = this.state.monsters.find(m => m.isPet);
            if (pet && Math.abs(pet.x - p.x) <= 2 && Math.abs(pet.y - p.y) <= 2) {
                this.addMessage('Your faithful little dog wags its tail and yips happily: "Woof!"', 11);
            } else {
                this.addMessage('The Oracle whispers from afar: "Seek the high altars to test beatitude before donning unknown armor."', 14);
            }
            return;
        }
        // # ROOT-CAUSE: NetHack #enhance command was missing from executeExtendedCommand
        if (cmd.includes('force')) {
            this.addMessage('You strike the lock with your weapon — click!', 11);
            this.advanceWorldTurn();
            return;
        }
        if (cmd.includes('enhance')) {
            const w = p.inventory.find(it => it.equipped === 'weapon') || p.inventory[0];
            this.state.weaponSkillLevel = (this.state.weaponSkillLevel || 1) + 1;
            this.state.spellSkillLevel = (this.state.spellSkillLevel || 1) + 1;
            const rankLabels = ['Unskilled', 'Basic', 'Skilled', 'Expert', 'Master', 'Grand Master'];
            const rank = rankLabels[Math.min(rankLabels.length - 1, this.state.weaponSkillLevel)];
            if (w && (w.bonus || 0) < 5) w.bonus = (w.bonus || 0) + 1;
            p.hpMax += 2;
            p.hp = Math.min(p.hpMax, p.hp + 2);
            p.pwMax += 2;
            p.pw = Math.min(p.pwMax, p.pw + 2);
            this.addMessage(`You hone your martial & arcane skills to [${rank}]! (${w ? w.name + ' +1, ' : ''}+2 HP, +2 Pw)`, 14);
            this.advanceWorldTurn();
            return;
        }
    }

    teleportPlayer() {
        for (let attempt = 0; attempt < 40; attempt++) {
            const rx = 2 + this.rand(MAP_W - 4);
            const ry = 2 + this.rand(MAP_H - 4);
            if (this.state.map[ry][rx].feat === FEAT.FLOOR) {
                this.state.player.x = rx;
                this.state.player.y = ry;
                this.updateVisibility();
                this.addMessage('You wrench through the astral ether and reappear elsewhere!', 13);
                return;
            }
        }
    }

    pickupFloorItem() {
        const p = this.state.player;
        const idx = this.state.objects.findIndex(o => o.x === p.x && o.y === p.y);
        if (idx < 0) {
            this.addMessage('There is nothing here to pick up.', 1);
            return;
        }
        const obj = this.state.objects.splice(idx, 1)[0];
        if (p.inventory.length >= 52) {
            this.state.objects.push(obj);
            this.addMessage('Your pack cannot hold any more items (52/52)!', 4);
            return;
        }
        const existing = (obj.kind === 'potion' || obj.kind === 'scroll' || obj.kind === 'food')
            ? p.inventory.find(it => it.name === obj.name && it.buc === obj.buc)
            : null;
        if (existing) {
            existing.count = (existing.count || 1) + (obj.count || 1);
            this.addMessage(`${existing.letter}) ${formatItemDesc(existing)}.`, 11);
        } else {
            p.inventory.push(obj);
            this.reindexInventory();
            const added = p.inventory[p.inventory.length - 1];
            this.addMessage(`${added.letter}) ${formatItemDesc(added)}.`, 11);
        }
        this.advanceWorldTurn();
    }

    searchAround() {
        const p = this.state.player;
        if (p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + 1);
        if (p.pw < p.pwMax) p.pw = Math.min(p.pwMax, p.pw + 1);
        this.addMessage('You search the surrounding masonry.', 1);
    }

    movePlayer(dx, dy) {
        const p = this.state.player;
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (ny < 0 || ny >= MAP_H || nx < 0 || nx >= MAP_W) return;

        // Check monster at target
        const mon = this.state.monsters.find(m => m.x === nx && m.y === ny);
        if (mon) {
            if (mon.isPet) {
                // Swap places with tame pet
                mon.x = p.x;
                mon.y = p.y;
                p.x = nx;
                p.y = ny;
                this.addMessage('You swap places with your faithful little dog.', 1);
                this.updateVisibility();
                this.advanceWorldTurn();
                return;
            }
            this.attackMonster(mon);
            this.advanceWorldTurn();
            return;
        }

        const cell = this.state.map[ny][nx];
        if (cell.feat === FEAT.CLOSED_DOOR) {
            cell.feat = FEAT.OPEN_DOOR;
            cell.glyph = "'";
            this.addMessage('You push open the heavy oak door.', 1);
            this.updateVisibility();
            this.advanceWorldTurn();
            return;
        }
        if (cell.feat === FEAT.WALL || cell.feat === FEAT.PERM_WALL) {
            this.addMessage('It is solid dungeon rock.', 1);
            return;
        }

        p.x = nx;
        p.y = ny;
        this.updateVisibility();

        const floorObj = this.state.objects.find(o => o.x === nx && o.y === ny);
        if (floorObj) {
            this.addMessage(`You see here ${formatItemDesc(floorObj)}. (Press [,] or [g] to pick up)`, 11);
        } else if (cell.feat === FEAT.FOUNTAIN) {
            this.addMessage('There is a sparkling magic fountain here ({). Use #dip or [q] to interact.', 11);
        } else if (cell.feat === FEAT.ALTAR) {
            this.addMessage(`There is a high altar of ${p.deity} here (_). Use #pray or #offer.`, 14);
        } else if (cell.feat === FEAT.DOWN_STAIR) {
            this.addMessage('There is a staircase leading down here (>).', 1);
        } else if (cell.feat === FEAT.UP_STAIR) {
            this.addMessage('There is a staircase leading up here (<).', 1);
        }

        this.advanceWorldTurn();
    }

    attackMonster(mon) {
        const p = this.state.player;
        const w = p.inventory.find(it => it.equipped === 'weapon');
        let baseDmg = 4;
        if (w) {
            const dm = String(w.dmg || '1d6').match(/(\d+)d(\d+)/i);
            const diceAvg = dm ? (parseInt(dm[1], 10) * (parseInt(dm[2], 10) + 1)) / 2 : 6;
            baseDmg = Math.round(diceAvg) + (w.name === 'Excalibur' ? 8 : 3) + (w.bonus || 0);
        }
        const dmg = Math.max(2, baseDmg + this.rand(6));
        mon.asleep = false;
        mon.hp -= dmg;
        this.addMessage(`You hit the ${mon.race} with your ${w ? w.name : 'fists'}! (${dmg} dmg)`, 10);
        if (mon.hp <= 0) {
            this.handleMonsterDefeat(mon);
            return;
        }
        const rLower = String(mon.race || '').toLowerCase();
        if (rLower.includes('floating eye') && !p.blind) {
            p.paralyzed = 2;
            this.addMessage("You are frozen by the floating eye's gaze!", 11);
        } else if (rLower.includes('jelly') && mon.hp > 6 && this.state.monsters.length < 18) {
            const half = Math.max(3, Math.floor(mon.hp / 2));
            mon.hp = half;
            const maxId = this.state.monsters.reduce((acc, m) => Math.max(acc, m.id || 0), 0);
            this.state.monsters.push(Object.assign({}, mon, { id: maxId + 1, hp: half, x: Math.min(MAP_W - 2, mon.x + 1) }));
            this.addMessage(`The ${mon.race} divides in two from your blow!`, 11);
        }
    }

    handleMonsterDefeat(mon) {
        const p = this.state.player;
        this.state.monsters = this.state.monsters.filter(m => m.id !== mon.id);
        const xpGain = mon.exp || 10;
        p.exp += xpGain;
        const goldDrop = 5 + this.rand(20);
        p.gold += goldDrop;
        this.addMessage(`You destroy the ${mon.race}! (+${xpGain} XP, +${goldDrop}$)`, 14);
        if (/floating eye/i.test(mon.race || '')) {
            this.state.objects.push({
                kind: 'food',
                name: 'floating eye corpse',
                glyph: '%',
                attr: 11,
                buc: 'uncursed',
                weight: 10,
                tval: 80,
                sval: 2,
                nutrition: 100,
                grantsTelepathy: true,
                x: mon.x,
                y: mon.y,
                count: 1
            });
        }
        if (mon.isBoss) {
            p.hasAmulet = true;
            p.inventory.push({
                kind: 'jewelry',
                name: 'Amulet of Yendor',
                buc: 'blessed',
                weight: 20,
                tval: 40,
                sval: 99,
                count: 1
            });
            this.reindexInventory();
            this.addMessage('You wrest the legendary Amulet of Yendor from the fallen Wizard! Ascend to Dlvl 1 (<) to triumph!', 14);
        }
        this.checkExperience();
    }

    advanceWorldTurn() {
        const p = this.state.player;
        this.state.turn++;
        if (p.speedBoost > 0) p.speedBoost--;
        if (p.blind > 0) {
            p.blind--;
            if (p.blind === 0) {
                this.updateVisibility();
                this.addMessage('You can see again.', 11);
            }
        }
        if (p.confused > 0) {
            p.confused--;
            if (p.confused === 0) {
                this.addMessage('You feel less confused now.', 11);
            }
        }
        if (p.poisoned > 0) p.poisoned--;
        if (this.state.turn % 8 === 0 && p.hp < p.hpMax) p.hp++;

        const isWalkableFeat = (f) => f === FEAT.FLOOR || f === FEAT.OPEN_DOOR || f === FEAT.UP_STAIR || f === FEAT.DOWN_STAIR || f === FEAT.ALTAR || f === FEAT.FOUNTAIN;

        // Move monsters & faithful pet
        for (const mon of [...this.state.monsters]) {
            if (mon.asleep) continue;
            if (mon.isPet) {
                const adjHostile = this.state.monsters.find(m => !m.isPet && !m.peaceful && Math.hypot(m.x - mon.x, m.y - mon.y) <= 1.5);
                if (adjHostile) {
                    const petDmg = Math.max(2, (mon.dmg || 5) + this.rand(4));
                    adjHostile.asleep = false;
                    adjHostile.hp -= petDmg;
                    if (adjHostile.hp <= 0) {
                        this.state.monsters = this.state.monsters.filter(m => m.id !== adjHostile.id);
                        p.exp += Math.max(2, Math.floor((adjHostile.exp || 6) / 2));
                        this.addMessage(`Your faithful little dog kills the ${adjHostile.race}!`, 11);
                        this.checkExperience();
                    } else {
                        this.addMessage(`Your faithful little dog bites the ${adjHostile.race}! (${petDmg} dmg)`, 11);
                    }
                    continue;
                }
                const dist = Math.hypot(p.x - mon.x, p.y - mon.y);
                if (dist > 1.5) {
                    const canPetStep = (nx, ny) => Boolean(
                        this.state.map[ny] &&
                        this.state.map[ny][nx] &&
                        isWalkableFeat(this.state.map[ny][nx].feat) &&
                        !this.state.monsters.some(m => m !== mon && m.x === nx && m.y === ny) &&
                        !(nx === p.x && ny === p.y)
                    );
                    const stepPetTowardPlayer = () => {
                        const dx = p.x - mon.x, dy = p.y - mon.y;
                        const sx = Math.sign(dx), sy = Math.sign(dy);
                        if (sx === 0 && sy === 0) return false;
                        const candidates = [[mon.x + sx, mon.y + sy]];
                        if (sx !== 0 && sy !== 0) {
                            if (Math.abs(dx) >= Math.abs(dy)) {
                                candidates.push([mon.x + sx, mon.y], [mon.x, mon.y + sy]);
                            } else {
                                candidates.push([mon.x, mon.y + sy], [mon.x + sx, mon.y]);
                            }
                        } else if (sx !== 0) {
                            candidates.push([mon.x + sx, mon.y + 1], [mon.x + sx, mon.y - 1]);
                        } else {
                            candidates.push([mon.x + 1, mon.y + sy], [mon.x - 1, mon.y + sy]);
                        }
                        for (const [cx, cy] of candidates) {
                            if (canPetStep(cx, cy)) {
                                mon.x = cx;
                                mon.y = cy;
                                return true;
                            }
                        }
                        return false;
                    };
                    const moved = stepPetTowardPlayer();
                    if (moved) {
                        if (dist > 2.2 && Math.hypot(p.x - mon.x, p.y - mon.y) > 1.5) {
                            stepPetTowardPlayer();
                        }
                        this.updateVisibility();
                    }
                }
                continue;
            }
            const dist = Math.hypot(p.x - mon.x, p.y - mon.y);
            if (dist <= 1.5) {
                const rLower = String(mon.race || '').toLowerCase();
                if (rLower.includes('yellow light')) {
                    this.state.monsters = this.state.monsters.filter(m => m.id !== mon.id);
                    if (!p.rBlind) {
                        p.blind = Math.max(p.blind || 0, 15 + this.rand(10));
                        this.updateVisibility();
                        this.addMessage('The yellow light explodes in a searing flash! You are blinded by the flash!', 14);
                    } else {
                        this.addMessage('The yellow light explodes in a harmless flash of light.', 14);
                    }
                    continue;
                }
                const wornArmor = p.inventory.find(it => it.equipped === 'armor');
                if ((rLower.includes('rust monster') || rLower.includes('acid blob')) && wornArmor && !/leather|robe|cloak|dragon/i.test(wornArmor.name || '')) {
                    wornArmor.bonus = Math.max(-3, (wornArmor.bonus || 0) - 1);
                    this.recalcPlayerAc();
                    this.addMessage(`The ${mon.race}'s touch corrodes your ${wornArmor.name}!`, 12);
                }
                const dmg = Math.max(1, (mon.dmg || 4) - Math.max(0, Math.floor((10 - p.ac) / 2)));
                p.hp -= dmg;
                this.addMessage(`The ${mon.race} hits you! (-${dmg} HP)`, 4);
                if (p.hp <= 0) {
                    const lifeSave = p.inventory.find(it => it.name.includes('life saving'));
                    if (lifeSave) {
                        p.hp = p.hpMax;
                        lifeSave.count = 0;
                        this.reindexInventory();
                        this.addMessage('Your amulet of life saving glows incandescently and disintegrates! You live!', 14);
                    } else {
                        p.hp = 0;
                        p.dead = true;
                        const isProper = Boolean(mon.isBoss || /^[A-Z]/.test(mon.race || ''));
                        p.diedFrom = isProper ? mon.race : (/^[aeiou]/i.test(mon.race || '') ? `an ${mon.race}` : `a ${mon.race}`);
                        this.addMessage(`You die... Killed by ${p.diedFrom} on Dlvl ${this.state.depth}. Press [R] or [Enter] to start anew.`, 4);
                        return;
                    }
                } else if (rLower.includes('raven') && !p.rBlind && (p.blind || 0) <= 0 && this.rand(3) === 0) {
                    p.blind = 10 + this.rand(8);
                    this.updateVisibility();
                    this.addMessage('The raven blinds you with a vicious peck to the eyes!', 6);
                }
            } else if (dist <= 7) {
                const sx = Math.sign(p.x - mon.x), sy = Math.sign(p.y - mon.y);
                const tx = mon.x + sx, ty = mon.y + sy;
                if (this.state.map[ty] && this.state.map[ty][tx] && isWalkableFeat(this.state.map[ty][tx].feat) && !this.state.monsters.some(m => m.x === tx && m.y === ty) && !(tx === p.x && ty === p.y)) {
                    mon.x = tx; mon.y = ty;
                }
            }
        }

        // Periodic NetHack wandering monster spawn (makemon in out-of-sight dungeon room)
        if (this.state.turn % 35 === 0) {
            const hostiles = this.state.monsters.filter(m => !m.isPet && !m.peaceful);
            if (hostiles.length < 8) {
                const depth = this.state.depth || 1;
                const eligible = MONSTER_TABLE.filter(m => m.minDepth <= depth + 2 && !m.isBoss);
                const tmpl = eligible[this.rand(eligible.length)] || MONSTER_TABLE[0];
                for (let attempt = 0; attempt < 25; attempt++) {
                    const rx = 2 + this.rand(MAP_W - 4);
                    const ry = 2 + this.rand(MAP_H - 4);
                    const cell = this.state.map[ry] && this.state.map[ry][rx];
                    if (cell && cell.feat === FEAT.FLOOR && !cell.inView && !(rx === p.x && ry === p.y) && !this.state.monsters.some(m => m.x === rx && m.y === ry)) {
                        const maxId = this.state.monsters.reduce((acc, m) => Math.max(acc, m.id || 0), 0);
                        this.state.monsters.push({
                            id: maxId + 1,
                            x: rx,
                            y: ry,
                            glyph: tmpl.glyph,
                            attr: tmpl.attr,
                            race: tmpl.name,
                            race_level: tmpl.minDepth,
                            hp: tmpl.hp + depth * 2,
                            hp_max: tmpl.hp + depth * 2,
                            ac: tmpl.ac != null ? tmpl.ac : 8,
                            dmg: tmpl.dmg + Math.floor(depth / 2),
                            speed: tmpl.speed || 110,
                            exp: tmpl.exp,
                            isPet: false,
                            peaceful: false,
                            asleep: false
                        });
                        break;
                    }
                }
            }
        }
    }

    buildTerminalRows() {
        const rows = [];
        const pad80 = (s) => String(s || '').slice(0, TERM_W).padEnd(TERM_W, ' ');
        const attr80 = (hex2 = '01') => hex2.repeat(TERM_W);
        const p = this.state.player;

        if (p.dead) {
            const center = (s, w = 13) => {
                const cl = String(s || '').slice(0, w);
                const left = Math.floor((w - cl.length) / 2);
                return cl.padStart(left + cl.length, ' ').padEnd(w, ' ');
            };
            const tomb = [
                '          _______',
                '         /       \\',
                '        /  R I P  \\',
                '       /           \\',
                `      |${center(p.name)}|`,
                `      |${center(p.race + ' ' + p.class)}|`,
                '      |   killed    |',
                '      |     by      |',
                `      |${center((p.diedFrom || 'peril').replace(/^a\s+/i, ''))}|`,
                `      |${center('Dlvl ' + this.state.depth)}|`,
                '      |    2026     |',
                '     *|*  *  *  *  *|*',
                '   _____________________'
            ];
            rows.push({ g: pad80('NetHack 3.6.7 — Memorial Tombstone (YASD 3D • Yendor Engine)'), a: attr80('0e') });
            rows.push({ g: pad80(''), a: attr80('01') });
            for (const l of tomb) rows.push({ g: pad80('                  ' + l), a: attr80('01') });
            rows.push({ g: pad80(''), a: attr80('01') });
            rows.push({ g: pad80(`  Final Ledger: ${p.gold} goldorkmids • Turns: ${this.state.turn} • Deepest Dlvl: ${this.state.maxDepth}`), a: attr80('0b') });
            rows.push({ g: pad80('  Press [R] to Restore Last Living Checkpoint Save, or [N] to Roll a New Hero.'), a: attr80('0e') });
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        if (this.state.phase === 'setup') {
            rows.push({ g: pad80('NetHack 3.6.7 — Choose Your Role in the Mazes of Menace (Enter/* = Quick Start)'), a: attr80('0e') });
            rows.push({ g: pad80('=============================================================================='), a: attr80('02') });
            ROLES.forEach((r, idx) => {
                const sel = idx === this.state.selectedRoleIdx ? '>' : ' ';
                rows.push({
                    g: pad80(` ${sel} ${r.key}) ${r.id.padEnd(14, ' ')} (${r.race}, ${r.align}) — Starting Gear: ${r.weapon.name} & ${r.armor.name}`),
                    a: attr80(idx === this.state.selectedRoleIdx ? '0e' : '01')
                });
            });
            rows.push({ g: pad80(''), a: attr80('01') });
            // # ROOT-CAUSE: Display post-randomization stat focus & kit boon options on NetHack setup screen
            rows.push({ g: pad80(`  [1/f] Stat Focus: ${(this.state.statFocus || 'optimal').toUpperCase().padEnd(10, ' ')} [2/b] Kit Boon: ${(this.state.kitBoon || 'signature').toUpperCase()}`), a: attr80('0a') });
            rows.push({ g: pad80('  [*] Quick Start (Randomize & Auto-Optimize) or [Enter] Embark with Selection'), a: attr80('0b') });
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        if (this.state.menuMode === 'inven' || this.state.menuMode === 'equip') {
            const isEq = this.state.menuMode === 'equip';
            const list = isEq ? p.inventory.filter(it => Boolean(it.equipped)) : p.inventory;
            const range = list.length > 0 ? `${list[0].letter}-${list[list.length - 1].letter}` : 'empty';
            const hdr = isEq
                ? `Equip: (Equipment) carrying ${list.length} worn/wielded items (${range}, / for Inven, ESC)`
                : `Inven: (Inventory) carrying ${list.length} items (${range}, / for Equip, ESC) | $: ${p.gold} goldorkmids`;
            rows.push({ g: pad80(hdr), a: attr80('0e') });
            if (list.length === 0) {
                rows.push({ g: pad80('  (nothing currently worn or wielded — press [/] for Inventory or [ESC])'), a: attr80('01') });
            } else {
                for (let i = 0; i < Math.min(21, list.length); i++) {
                    const it = list[i];
                    const wt = `${((it.weight || 10) * (it.count || 1) / 10).toFixed(1)} lb`;
                    const desc = `  ${it.letter}) ${formatItemDesc(it)}`;
                    rows.push({ g: pad80(desc.padEnd(68, ' ') + wt.padStart(10, ' ')), a: attr80('01') });
                }
            }
            while (rows.length < TERM_H - 1) rows.push({ g: pad80(''), a: attr80('01') });
            rows.push({ g: pad80(`[#pray] [#dip] [#offer] [#loot] [#untrap] [#chat] | Dlvl:${this.state.depth} HP:${p.hp}(${p.hpMax}) AC:${p.ac}`), a: attr80('0b') });
            return rows;
        }

        if (this.state.menuMode === 'spell') {
            rows.push({ g: pad80(this.state.pendingPrompt || 'Cast which spell? [a-e or ESC]'), a: attr80('0e') });
            const spells = [
                '  a) force bolt       (Level 1, 2 Pw — Arcane bolt of kinetic force)',
                '  b) healing          (Level 1, 2 Pw — Restores vitality & sight)',
                '  c) magic mapping    (Level 2, 3 Pw — Reveals the entire dungeon level)',
                '  d) haste self       (Level 2, 3 Pw — Grants +Fast speed for 35 turns)',
                '  e) cure ailment     (Level 2, 2 Pw — Purges poison, blindness & confusion)'
            ];
            for (const s of spells) rows.push({ g: pad80(s), a: attr80('01') });
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        if (this.state.menuMode === 'verb' || this.state.menuMode === 'item_action') {
            rows.push({ g: pad80(this.state.pendingPrompt || 'Select an item: [a-z or ESC]'), a: attr80('0e') });
            for (let i = 0; i < Math.min(21, p.inventory.length); i++) {
                const it = p.inventory[i];
                const wt = `${((it.weight || 10) * (it.count || 1) / 10).toFixed(1)} lb`;
                const desc = `  ${it.letter}) ${formatItemDesc(it)}`;
                rows.push({ g: pad80(desc.padEnd(68, ' ') + wt.padStart(10, ' ')), a: attr80('01') });
            }
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        if (this.state.menuMode === 'char' || this.state.menuMode === 'help' || this.state.menuMode === 'knowledge') {
            rows.push({ g: pad80(this.state.pendingPrompt || 'NetHack 3.6.7 Overview (Press ESC or Space to return)'), a: attr80('0e') });
            rows.push({ g: pad80('=============================================================================='), a: attr80('02') });
            if (this.state.menuMode === 'char') {
                const xpNextStr = p.expNext > 0 ? `${p.exp}/${p.expNext}` : `${p.exp} (MAX)`;
                rows.push({ g: pad80(`  Name:  ${p.name.padEnd(20, ' ')} Role:  ${p.class} (${p.race}, ${p.align})`), a: attr80('01') });
                rows.push({ g: pad80(`  Level: ${String(p.level).padEnd(20, ' ')} XP:    ${xpNextStr}`), a: attr80('01') });
                rows.push({ g: pad80(`  Deity: ${p.deity.padEnd(20, ' ')} Dlvl:  ${this.state.depth} (${this.state.branchName})`), a: attr80('01') });
                rows.push({ g: pad80(`  STR: ${p.str}  INT: ${p.int}  WIS: ${p.wis}  DEX: ${p.dex}  CON: ${p.con}  AC: ${p.ac}`), a: attr80('0b') });
                rows.push({ g: pad80(`  HP: ${p.hp}/${p.hpMax}   Pw: ${p.pw}/${p.pwMax}   Gold: ${p.gold}zm   Turns: ${this.state.turn}`), a: attr80('0a') });
            } else if (this.state.menuMode === 'knowledge') {
                rows.push({ g: pad80(`  Discovered Knowledge (${p.inventory.length} items carried in ${this.state.branchName}):`), a: attr80('0b') });
                p.inventory.slice(0, 15).forEach((it) => {
                    rows.push({ g: pad80(`    ${it.letter}) ${formatItemDesc(it)} [${it.buc || 'uncursed'}]`), a: attr80('01') });
                });
            } else {
                rows.push({ g: pad80('  === NETHACK 3.6.7 — IN-GAME COMMAND & SURVIVAL REFERENCE ==='), a: attr80('0b') });
                rows.push({ g: pad80('  [i] Inventory  [e] Equipment  [,] Pick Up   [e/E] Eat   [q] Quaff   [r] Read'), a: attr80('01') });
                rows.push({ g: pad80('  [w] Wield      [W] Wear       [T] Take Off  [P] Put On  [R] Remove  [z] Zap'), a: attr80('01') });
                rows.push({ g: pad80('  [Z] Cast Spell [a] Apply Tool [t/f] Throw   [o/c] Door  [s] Search  [.] Wait'), a: attr80('01') });
                rows.push({ g: pad80('  --- EXTENDED (#) COMMANDS ---'), a: attr80('0e') });
                rows.push({ g: pad80('  [#pray] Pray to Deity      [#offer] Sacrifice Corpse on Altar'), a: attr80('01') });
                rows.push({ g: pad80('  [#dip]  Dip in Potion/Ftn  [#chat]  Talk to Priest/Shopkeeper/Oracle'), a: attr80('01') });
                rows.push({ g: pad80('  [#loot] Loot Chest/Box     [#untrap] Disarm Trap   [#force] Force Lock'), a: attr80('01') });
                rows.push({ g: pad80('  --- ESSENTIAL SURVIVAL RULES ---'), a: attr80('0a') });
                rows.push({ g: pad80('  • BUC Testing: Drop unknown items on Altars (_) or let your Pet test for curses!'), a: attr80('01') });
                rows.push({ g: pad80('  • Corpses: Eat Floating Eye for Telepathy; NEVER touch Cockatrices barehanded!'), a: attr80('01') });
                rows.push({ g: pad80('  • Click [? HELP] on the HUD for the full NetHack 3.6.7 Guidebook & Spoilers.'), a: attr80('0b') });
            }
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        // Standard dungeon viewport + NetHack bottom status lines
        const lastMsg = (this.state.menuMode === 'direction' || this.state.menuMode === 'extended')
            ? this.state.pendingPrompt
            : ((this.state.messages[this.state.messages.length - 1] && this.state.messages[this.state.messages.length - 1].text) || '');
        rows.push({ g: pad80(lastMsg), a: attr80('01') });

        for (let y = 0; y < 21; y++) {
            const side = [
                `${p.name.slice(0, 11)}`,
                `${p.race} ${p.class.slice(0, 5)}`,
                `${p.align.slice(0, 3)} (${p.deity})`,
                `STR: ${String(p.str).padStart(6, ' ')}`,
                `INT: ${String(p.int).padStart(6, ' ')}`,
                `WIS: ${String(p.wis).padStart(6, ' ')}`,
                `DEX: ${String(p.dex).padStart(6, ' ')}`,
                `CON: ${String(p.con).padStart(6, ' ')}`,
                `AC:  ${String(p.ac).padStart(6, ' ')}`,
                `HP: ${String(p.hp + '/' + p.hpMax).padStart(7, ' ')}`,
                `Pw: ${String(p.pw + '/' + p.pwMax).padStart(7, ' ')}`,
                `$:  ${String(p.gold).padStart(7, ' ')}`,
                `Dlvl:${String(this.state.depth).padStart(6, ' ')}`
            ][y] || '';
            let mapChars = '';
            for (let x = 0; x < MAP_W; x++) {
                if (x === p.x && y === p.y) { mapChars += '@'; continue; }
                const mon = this.state.monsters.find(m => m.x === x && m.y === y);
                const cell = this.state.map[y][x];
                if (mon && cell.inView) { mapChars += mon.glyph; continue; }
                const obj = this.state.objects.find(o => o.x === x && o.y === y);
                if (obj && cell.inView) { mapChars += (obj.glyph || '?'); continue; }
                mapChars += cell.known ? cell.glyph : ' ';
            }
            rows.push({ g: pad80(side.padEnd(13, ' ') + mapChars), a: attr80('01') });
        }

        rows.push({ g: pad80(`${p.name} the ${p.class}  St:${p.str} Dx:${p.dex} Co:${p.con} In:${p.int} Wi:${p.wis}  ${p.align}`), a: attr80('0e') });
        rows.push({ g: pad80(`Dlvl:${this.state.depth} $:${p.gold} HP:${p.hp}(${p.hpMax}) Pw:${p.pw}(${p.pwMax}) AC:${p.ac} Xp:${p.level}/${p.exp} T:${this.state.turn}`), a: attr80('0b') });
        return rows;
    }

    buildFrame() {
        this.seq++;
        const p = this.state.player;
        const isBlind = Boolean(p.blind > 0);
        const hasTelepathy = Boolean(
            p.telepathy || p.esp || p.intrinsicTelepathy ||
            (Array.isArray(p.inventory) && p.inventory.some(it => it.equipped && (/esp|telepathy/i.test(it.name || '') || it.grantsTelepathy)))
        );
        const hasMind = (m) => !/jelly|mold|fungus|ooze|pudding|vortex|light|golem|skeleton|zombie/i.test(m.race || m.name || '');
        const pxNow = p.x;
        const pyNow = p.y;
        const visibleMonsters = [];
        const sensedByCoord = new Map();
        for (const m of this.state.monsters) {
            if (m.hp <= 0) continue;
            const inLos = Boolean(this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            const isAdjOrPet = Boolean(m.isPet) || (Math.abs(m.x - pxNow) <= 1 && Math.abs(m.y - pyNow) <= 1);
            const isEspMind = hasTelepathy && hasMind(m);
            if (isBlind) {
                if (isEspMind || isAdjOrPet) {
                    visibleMonsters.push({
                        mon: m,
                        esp: Boolean(isEspMind),
                        sensed: true,
                        telepathy: Boolean(isEspMind)
                    });
                    sensedByCoord.set(`${m.x},${m.y}`, m);
                }
            } else if (inLos || (m.isPet && Math.abs(m.x - pxNow) <= 2 && Math.abs(m.y - pyNow) <= 2) || isEspMind) {
                const viaEspOnly = !inLos && isEspMind;
                visibleMonsters.push({
                    mon: m,
                    esp: Boolean(viaEspOnly || isEspMind),
                    sensed: Boolean(viaEspOnly),
                    telepathy: Boolean(isEspMind)
                });
                if (viaEspOnly) sensedByCoord.set(`${m.x},${m.y}`, m);
            }
        }

        const mapRows = [];
        for (let y = 0; y < MAP_H; y++) {
            let g = '', a = '', f = '', l = '';
            for (let x = 0; x < MAP_W; x++) {
                const cell = this.state.map[y][x];
                const isSelf = (x === p.x && y === p.y);
                let ch = cell.known ? cell.glyph : ' ';
                let at = cell.known ? (cell.attr || 1) : 1;
                if (isSelf) {
                    ch = '@'; at = 1;
                } else if (isBlind) {
                    const sm = sensedByCoord.get(`${x},${y}`);
                    if (sm) { ch = sm.glyph; at = sm.attr || 1; }
                } else if (cell.inView) {
                    const mon = this.state.monsters.find(m => m.x === x && m.y === y);
                    const obj = this.state.objects.find(o => o.x === x && o.y === y);
                    if (mon) { ch = mon.glyph; at = mon.attr || 1; }
                    else if (obj) { ch = obj.glyph || '?'; at = obj.attr || 11; }
                } else {
                    const sm = sensedByCoord.get(`${x},${y}`);
                    if (sm) { ch = sm.glyph; at = sm.attr || 1; }
                }
                const featCode = cell.known ? cell.feat : FEAT.NONE;
                const cellInView = isBlind ? isSelf : Boolean(cell.inView);
                const lighting = isBlind ? (isSelf ? 1 : 3) : (cell.roomLit ? 2 : (cell.inView ? 1 : 3));
                const flag = (cell.known ? 1 : 0) | (cellInView ? 2 : 0) | ((lighting & 3) << 2);
                g += ch;
                a += at.toString(16).padStart(2, '0');
                f += featCode.toString(16).padStart(2, '0');
                l += flag.toString(16);
            }
            mapRows.push({ g, a, f, l });
        }

        const isOverlay = this.state.phase === 'setup' || this.state.menuMode !== 'none';
        const promptObj = this.state.menuMode !== 'none'
            ? { kind: this.state.menuMode === 'direction' ? 'direction' : 'item', text: this.state.pendingPrompt || 'Inventory' }
            : null;

        const statuses = [];
        if (p.blind > 0) statuses.push({ name: 'Blind', attr: 6, val: p.blind });
        if (p.confused > 0) statuses.push({ name: 'Confused', attr: 6, val: p.confused });
        if (p.poisoned > 0) statuses.push({ name: 'Poisoned', attr: 4, val: p.poisoned });
        if (p.speedBoost > 0) statuses.push({ name: 'Fast', attr: 10, val: p.speedBoost });
        if (p.hasAmulet) statuses.push({ name: 'Amulet', attr: 14, val: 1 });

        let curWeaponItem = p.weaponName || '';
        let curShieldItem = p.shieldName || '';
        let curBowItem = p.bowName || '';
        const equipmentList = p.inventory.filter(it => Boolean(it.equipped)).map((it, idx) => {
            const eqMeta = resolveEquipMeta(it);
            if (eqMeta.slot_name === 'weapon' && !curWeaponItem) curWeaponItem = it.name || '';
            else if (eqMeta.slot_name === 'shield' && !curShieldItem) curShieldItem = it.name || '';
            else if (eqMeta.slot_name === 'bow' && !curBowItem) curBowItem = it.name || '';
            return {
                slot: idx,
                letter: it.letter,
                slot_name: eqMeta.slot_name,
                mention: (eqMeta.slot_name === 'weapon' || eqMeta.slot_name === 'bow') ? 'Wielding' : 'Wearing',
                name: formatItemDesc(it),
                category: it.kind || 'misc',
                tval: eqMeta.tval,
                sval: it.sval || 1,
                number: it.count || 1,
                weight: it.weight || 20,
                buc: it.buc || 'uncursed',
                inscription: it.inscription || '',
                vm: computeVerbMask(it),
                attr: 1
            };
        });
        const resolveInvTval = (it) => {
            if (it.tval) return it.tval;
            if (it.kind === 'potion') return 71;
            if (it.kind === 'scroll') return 70;
            if (it.kind === 'wand') return 65;
            if (it.kind === 'food') return 80;
            if (it.kind === 'tool') return 39;
            if (it.equipped || it.kind === 'weapon' || it.kind === 'ranged' || it.kind === 'armor' || it.kind === 'jewelry') {
                return resolveEquipMeta(it).tval;
            }
            return 70;
        };
        const inventoryList = p.inventory.map((it) => ({
            slot: it.slot,
            label: it.letter,
            letter: it.letter,
            name: formatItemDesc(it),
            category: it.kind || 'misc',
            tval: resolveInvTval(it),
            sval: it.sval || 1,
            number: it.count || 1,
            weight: it.weight || 10,
            buc: it.buc || 'uncursed',
            inscription: it.inscription || '',
            vm: computeVerbMask(it),
            attr: 1
        }));
        const floorList = this.state.objects.filter(o => o.x === p.x && o.y === p.y).map((o, idx) => ({
            slot: idx,
            letter: String.fromCharCode(97 + (idx % 26)),
            name: formatItemDesc(o),
            category: o.kind || 'misc',
            tval: resolveInvTval(o),
            sval: o.sval || 1,
            number: o.count || 1,
            vm: computeVerbMask(o)
        }));

        const resists = {
            acid: 0, elec: 0, fire: 0, cold: 0, pois: p.poisonRes ? 1 : 0,
            light: 0, dark: 0, sound: 0, shards: 0, nexus: 0, nether: 0, chaos: 0, disen: 0
        };
        const flags = {
            rFear: false, rBlind: Boolean(p.rBlind), rConf: false, rStun: false,
            freeAct: false, holdLife: false, seeInvis: false,
            esp: Boolean(hasTelepathy), telepathy: Boolean(hasTelepathy || (isBlind && (p.telepathy || p.esp || p.intrinsicTelepathy))),
            regen: p.inventory.some(it => it.equipped && /regeneration/i.test(it.name || '')),
            feather: false, slowDigest: false
        };
        if (isBlind && (p.telepathy || p.esp || p.intrinsicTelepathy || hasTelepathy)) {
            flags.telepathy = true;
            flags.esp = true;
        }
        for (const it of p.inventory) {
            if (!it.equipped) continue;
            if (/magic resistance/i.test(it.name || '')) { resists.disen = 1; flags.freeAct = true; }
            if (/fire/i.test(it.name || '')) resists.fire = 1;
            if (/cold/i.test(it.name || '')) resists.cold = 1;
        }
        const uiCursor = (this.state.cursor && this.state.cursor.active) ? {
            active: true,
            mode: this.state.cursor.mode || 'target',
            x: this.state.cursor.x,
            y: this.state.cursor.y,
            has_los: !isBlind,
            blast_rad: this.state.cursor.blast_rad || 0,
            mon_id: this.state.cursor.mon_id || 0
        } : null;

        if (!this._sentLoreSigs) this._sentLoreSigs = new Map();
        const hashRaceIdx = (raceName) => {
            const s = String(raceName || 'unknown');
            let h = 1;
            for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) & 0x7ff;
            return h || 1;
        };
        const frameLore = {};
        let hasNewLore = false;
        for (const entry of visibleMonsters) {
            const m = entry.mon;
            const rIdx = m.r_idx || hashRaceIdx(m.race);
            const relSpeed = (m.speed != null ? m.speed : 110) - 110;
            const sig = `${m.ac != null ? m.ac : 8}|${relSpeed}|${m.dmg || 4}`;
            if (this._sentLoreSigs.get(rIdx) !== sig) {
                this._sentLoreSigs.set(rIdx, sig);
                frameLore[String(rIdx)] = {
                    ac: m.ac != null ? m.ac : 8,
                    speed: relSpeed,
                    kills: 0,
                    deaths: 0,
                    blows: [`Hit/Hurt ~${m.dmg || 4}`],
                    spells: /dragon/i.test(m.race || '') ? [`BR_FIRE (${(m.dmg || 20) * 2})`] : [],
                    known_resists: []
                };
                hasNewLore = true;
            }
        }

        const outFrame = {
            t: 'frame',
            realm: 'nethack',
            seq: this.seq,
            phase: this.state.phase,
            victory: Boolean(p.winner || p.ascended),
            ui: {
                overlay: isOverlay ? 3 : 0,
                awaiting_command: !isOverlay,
                more: false,
                context: isOverlay ? 'menu' : 'play',
                prompt: promptObj,
                cursor: uiCursor
            },
            inventory: inventoryList,
            equipment: equipmentList,
            quiver: [],
            floor: floorList,
            player: {
                name: p.name,
                race: p.race,
                class: p.class,
                stakes_mode: p.stakesMode || 'ironman',
                resurrection_count: p.resurrectionCount || 0,
                history: `Chosen by ${p.deity} (${p.align}) to descend the ${this.state.branchName} and retrieve the Amulet of Yendor.`,
                y: p.y,
                x: p.x,
                depth: this.state.depth,
                max_depth: this.state.maxDepth,
                level: p.level,
                max_lev: p.maxLevel || p.level,
                exp: p.exp,
                exp_max: p.maxExp || p.exp,
                exp_next: p.expNext,
                gold: p.gold,
                hp: p.hp,
                hp_max: p.hpMax,
                sp: p.pw,
                sp_max: p.pwMax,
                ac: p.ac,
                ac_base: p.ac,
                ac_to_a: 0,
                study: 0,
                resting: 0,
                blind: isBlind,
                light: 2,
                light_item: 'Brass Lantern',
                light_fuel: 1500,
                weapon_item: curWeaponItem,
                shield_item: curShieldItem,
                bow_item: curBowItem,
                speed: p.speedBoost > 0 ? 120 : 110,
                dead: p.dead,
                winner: Boolean(p.winner || p.ascended),
                victory: Boolean(p.winner || p.ascended),
                died_from: p.diedFrom,
                turn: this.state.turn,
                stats: {
                    str: { use: p.str, max: p.str, top: p.str, reduced: false },
                    int: { use: p.int, max: p.int, top: p.int, reduced: false },
                    wis: { use: p.wis, max: p.wis, top: p.wis, reduced: false },
                    dex: { use: p.dex, max: p.dex, top: p.dex, reduced: false },
                    con: { use: p.con, max: p.con, top: p.con, reduced: false }
                },
                resists,
                flags,
                statuses,
                equipment: equipmentList,
                inventory: inventoryList,
                quiver: []
            },
            map: {
                h: MAP_H,
                w: MAP_W,
                height: MAP_H,
                width: MAP_W,
                rows: mapRows
            },
            monsters: visibleMonsters
                .map(({ mon: m, esp: espFlag, sensed: sensedFlag, telepathy: telepathyFlag }) => ({
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
                    unique: Boolean(m.isBoss || m.unique),
                    attitude: m.isPet ? 'pet' : ((m.peaceful || m.friendly) ? 'friendly' : 'hostile'),
                    exp: m.exp || 0,
                    isPet: Boolean(m.isPet),
                    pet: Boolean(m.isPet),
                    friendly: Boolean(m.isPet || m.peaceful),
                    peaceful: Boolean(m.peaceful || m.isPet),
                    asleep: Boolean(m.asleep),
                    esp: Boolean(espFlag),
                    sensed: Boolean(sensedFlag),
                    telepathy: Boolean(telepathyFlag || espFlag)
                })),
            objects: this.state.objects
                .filter(o => this.state.map[o.y] && this.state.map[o.y][o.x] && this.state.map[o.y][o.x].known)
                .map(o => ({
                    y: o.y,
                    x: o.x,
                    attr: o.attr || 11,
                    glyph: o.glyph || '?',
                    name: formatItemDesc(o),
                    tval: o.tval || 70,
                    sval: o.sval || 1,
                    number: o.count || 1
                })),
            messages: this.state.messages.slice(-8),
            term: {
                w: TERM_W,
                h: TERM_H,
                cx: p.x + 13,
                cy: p.y + 1,
                cursor: true,
                rows: this.buildTerminalRows()
            }
        };
        if (hasNewLore) outFrame.lore = frameLore;
        return outFrame;
    }
}

function main() {
    const opts = parseCliArgs(process.argv);
    const engine = new NetHackEngine(opts);

    const writeJson = (obj) => {
        process.stdout.write(JSON.stringify(obj) + '\n');
    };

    writeJson({
        t: 'hello',
        protocol: 1,
        protocol_minor: 2,
        version: '3.6.7-bridge',
        realm: 'nethack',
        savefile: engine.saveFile
    });

    writeJson({
        t: 'commands',
        realm: 'nethack',
        verbBits: [
            'quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'fire',
            'throw', 'wield', 'takeoff', 'drop', 'inscribe', 'uninscribe', 'refill',
            'browse', 'study', 'cast', 'ignore', 'examine'
        ]
    });

    writeJson(engine.buildFrame());

    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (rawLine) => {
        const line = String(rawLine || '').trim();
        if (!line) return;
        if (line === 'save') {
            engine.saveGame();
            writeJson({ t: 'saved', ok: true });
            return;
        }
        if (line === 'frame') {
            writeJson(engine.buildFrame());
            return;
        }
        if (line === 'quit' || line === 'exit') {
            engine.saveGame();
            process.exit(0);
            return;
        }
        if (line.startsWith('key ') || line.startsWith('keys ')) {
            const keyArg = line.replace(/^keys?\s+/, '');
            engine.handleKey(keyArg);
            writeJson(engine.buildFrame());
        }
    });
}

if (require.main === module) {
    main();
}

module.exports = { NetHackEngine, formatItemDesc, computeVerbMask };
